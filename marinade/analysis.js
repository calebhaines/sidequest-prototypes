/* MARINADE — real, bounded spectral analysis. Never runs inside the audio processor. */
(function (global) {
  'use strict';
  function createMarinadeAnalysis() {
    'use strict';
    const FFT_SIZE=2048, LANES=72, BANDS=6, MAX_FRAMES=96, ANALYSIS_RATE=22050, TAU=Math.PI*2;
    const clamp=(x,a,b,d=a)=>Number.isFinite(x)?Math.max(a,Math.min(b,x)):d;
    const bandEdges=[0,180,500,1200,3000,6500,11025];
    function fft(real,imag) {
      const n=real.length;for(let i=1,j=0;i<n;i++){let bit=n>>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){let t=real[i];real[i]=real[j];real[j]=t;t=imag[i];imag[i]=imag[j];imag[j]=t;}}
      for(let size=2;size<=n;size<<=1){const half=size>>>1,angle=-TAU/size,cr=Math.cos(angle),ci=Math.sin(angle);for(let start=0;start<n;start+=size){let wr=1,wi=0;for(let j=0;j<half;j++){const a=start+j,b=a+half,tr=wr*real[b]-wi*imag[b],ti=wr*imag[b]+wi*real[b];real[b]=real[a]-tr;imag[b]=imag[a]-ti;real[a]+=tr;imag[a]+=ti;const nw=wr*cr-wi*ci;wi=wr*ci+wi*cr;wr=nw;}}}
    }
    function monoOf(input) {
      if(input instanceof Float32Array)return input;
      if(Array.isArray(input)&&input.length&&input[0]?.length){const out=new Float32Array(input[0].length);for(let c=0;c<input.length;c++)for(let i=0;i<out.length;i++)out[i]+=(Number.isFinite(input[c][i])?input[c][i]:0)/input.length;return out;}
      if(Array.isArray(input?.channels))return monoOf(input.channels);
      if(input?.pcm)return monoOf(input.pcm);
      if(input?.mono)return monoOf(input.mono);
      throw new Error('Provide a mono channel or an array of audio channels to analyze.');
    }
    function analyze(input,options={}) {
      const source=monoOf(input),sourceRate=clamp(options.sampleRate??input?.sampleRate,8000,192000,48000),rootNote=clamp(options.rootNote??input?.rootNote,0,127,60);
      if(!source.length||source.length>sourceRate*30)throw new Error('Spectral sources must contain between one sample and 30 seconds of audio.');
      const start=clamp(options.trimStart??options.start,0,1,0),end=clamp(options.trimEnd??options.end,start+.000001,1,1),first=Math.min(source.length-1,Math.floor(start*source.length)),last=Math.max(first+1,Math.ceil(end*source.length));
      const rate=ANALYSIS_RATE,length=Math.max(FFT_SIZE,Math.ceil((last-first)*rate/sourceRate)),pcm=new Float32Array(length);let peak=0,energy=0;
      for(let i=0;i<length;i++){const relative=i*sourceRate/rate,pos=options.reverse?last-1-relative:first+relative,a=Math.floor(pos),fraction=pos-a,x=a>=first&&a<last?(source[a]||0)+((source[Math.min(a+1,last-1)]||0)-(source[a]||0))*fraction:0;pcm[i]=Number.isFinite(x)?clamp(x,-8,8,0):0;peak=Math.max(peak,Math.abs(pcm[i]));energy+=pcm[i]*pcm[i];}
      const frameCount=Math.max(2,Math.min(MAX_FRAMES,Math.ceil(length/256))),hop=Math.max(1,(length-1)/(frameCount-1)),amplitudes=new Float32Array(frameCount*LANES),frequencies=new Float32Array(frameCount*LANES),texture=new Float32Array(frameCount*BANDS),rms=new Float32Array(frameCount),centroid=new Float32Array(frameCount),laneWeight=new Float32Array(LANES),real=new Float64Array(FFT_SIZE),imag=new Float64Array(FFT_SIZE),magnitude=new Float64Array(FFT_SIZE/2+1),previousPhase=new Float64Array(FFT_SIZE/2+1),window=new Float32Array(FFT_SIZE);
      // Root-relative lanes align a fundamental and its harmonics across unlike source tunings.
      // Eight lanes per octave; lane24 is exactly the declared source fundamental.
      const rootFrequency=440*Math.pow(2,(rootNote-69)/12),minFreq=rootFrequency/8,logRange=Math.log(512),laneFreq=new Float32Array(LANES);for(let i=0;i<LANES;i++)laneFreq[i]=minFreq*Math.exp(i/LANES*logRange);
      let windowSum=0;for(let i=0;i<FFT_SIZE;i++){window[i]=.5-.5*Math.cos(TAU*i/(FFT_SIZE-1));windowSum+=window[i];}
      let maximumFrameSum=0;
      const tonalMask=new Uint8Array(FFT_SIZE/2+1);
      for(let frame=0;frame<frameCount;frame++) {
        const center=Math.round(frame*hop),offset=center-(FFT_SIZE>>>1);let power=0;
        for(let i=0;i<FFT_SIZE;i++){const x=offset+i>=0&&offset+i<length?pcm[offset+i]:0;real[i]=x*window[i];imag[i]=0;power+=x*x;}
        fft(real,imag);tonalMask.fill(0);rms[frame]=Math.sqrt(power/FFT_SIZE);let sum=0,weighted=0;
        for(let k=0;k<=FFT_SIZE/2;k++){const m=Math.sqrt(real[k]*real[k]+imag[k]*imag[k])*2/windowSum;magnitude[k]=m;sum+=m;weighted+=m*k*rate/FFT_SIZE;let band=0,f=k*rate/FFT_SIZE;while(band<BANDS-1&&f>=bandEdges[band+1])band++;texture[frame*BANDS+band]+=m*m;}
        centroid[frame]=sum?weighted/sum:0;
        for(let k=2;k<FFT_SIZE/2-1;k++) {
          if(magnitude[k]<=magnitude[k-1]||magnitude[k]<magnitude[k+1]||magnitude[k]<.00001)continue;
          const a=Math.log(magnitude[k-1]+1e-12),b=Math.log(magnitude[k]+1e-12),c=Math.log(magnitude[k+1]+1e-12),delta=clamp(.5*(a-c)/(a-2*b+c),-.5,.5,0);
          let f=(k+delta)*rate/FFT_SIZE;const phase=Math.atan2(imag[k],real[k]);
          // Phase-vocoder instantaneous frequency tightens slowly moving peaks when frames overlap.
          if(frame&&hop<FFT_SIZE/2){const actualHop=center-Math.round((frame-1)*hop),expected=TAU*k*actualHop/FFT_SIZE;let difference=phase-previousPhase[k]-expected;difference-=TAU*Math.round(difference/TAU);const instantaneous=(k+difference*FFT_SIZE/(TAU*actualHop))*rate/FFT_SIZE;if(Math.abs(instantaneous-f)<rate/FFT_SIZE*.75)f=.55*f+.45*instantaneous;}
          const lane=clamp(Math.round(Math.log(Math.max(minFreq,f)/minFreq)/logRange*LANES),0,LANES-1,0),at=frame*LANES+lane;
          if(magnitude[k]>amplitudes[at]){amplitudes[at]=magnitude[k];frequencies[at]=f;}
          // Remove coherent peak main lobes from the residual-noise estimate.
          if(magnitude[k]>rms[frame]*.06)for(let bin=Math.max(0,k-2);bin<=Math.min(FFT_SIZE/2,k+2);bin++)tonalMask[bin]=1;
        }
        for(let k=0;k<=FFT_SIZE/2;k++)previousPhase[k]=Math.atan2(imag[k],real[k]);
        let frameSum=0;for(let lane=0;lane<LANES;lane++){const at=frame*LANES+lane;if(!frequencies[at])frequencies[at]=laneFreq[lane];laneWeight[lane]+=amplitudes[at];frameSum+=amplitudes[at];}maximumFrameSum=Math.max(maximumFrameSum,frameSum);
        for(let k=0;k<=FFT_SIZE/2;k++)if(tonalMask[k]){let band=0,f=k*rate/FFT_SIZE;while(band<BANDS-1&&f>=bandEdges[band+1])band++;texture[frame*BANDS+band]-=magnitude[k]*magnitude[k];}
        for(let band=0;band<BANDS;band++)texture[frame*BANDS+band]=Math.sqrt(Math.max(0,texture[frame*BANDS+band]));
      }
      // One normalization for the whole trajectory preserves attacks and natural decay.
      const sourceGain=clamp(options.gain,0,2,1),gain=maximumFrameSum>1e-8?.85/maximumFrameSum*sourceGain:0;
      for(let i=0;i<amplitudes.length;i++)amplitudes[i]*=gain;
      for(let i=0;i<texture.length;i++)texture[i]*=gain*.32;
      for(let i=0;i<laneWeight.length;i++)laneWeight[i]=laneWeight[i]*gain/frameCount;
      // Broad log-frequency envelopes transfer formants without treating sparse partial gaps as silence.
      const envelope=new Float32Array(amplitudes.length),weights=[1,.83,.49,.21,.065];
      for(let frame=0;frame<frameCount;frame++)for(let lane=0;lane<LANES;lane++){let sum=0,total=0;for(let delta=-4;delta<=4;delta++){const index=lane+delta;if(index<0||index>=LANES)continue;const weight=weights[Math.abs(delta)];sum+=amplitudes[frame*LANES+index]*weight;total+=weight;}envelope[frame*LANES+lane]=sum/total;}
      const transientLength=Math.min(length,Math.round(rate*.18)),transient=new Float32Array(transientLength),transientGain=peak>1e-8?.65/Math.max(.25,peak)*sourceGain:0;
      for(let i=0;i<transientLength;i++)transient[i]=pcm[i]*transientGain;
      return {version:1,sampleRate:rate,sourceRate,duration:(last-first)/sourceRate,rootNote,rootFrequency,lanes:LANES,bands:BANDS,frames:frameCount,laneFrequencies:laneFreq,laneWeight,amplitudes,frequencies,envelope,texture,rms,centroid,transient,peak,rmsTotal:Math.sqrt(energy/length)};
    }
    return {analyze,fft,monoOf,FFT_SIZE,LANES,BANDS,MAX_FRAMES,ANALYSIS_RATE};
  }
  global.createMarinadeAnalysis=createMarinadeAnalysis;const api=createMarinadeAnalysis(),cache=new Map();let worker=null,workerURL=null,serial=0;const pending=new Map();
  function closeWorker(){worker?.terminate();worker=null;if(workerURL)URL.revokeObjectURL(workerURL);workerURL=null;for(const job of pending.values())job.reject(new Error('Spectral analysis worker was closed.'));pending.clear();}
  api.analyzeAsync=async function(input,options={}) {
    const key=options.cacheKey;if(key&&cache.has(key))return cache.get(key);
    let model;
    if(typeof global.Worker==='function'&&typeof Blob==='function'&&typeof URL?.createObjectURL==='function') {
      try {
        if(!worker){workerURL=URL.createObjectURL(new Blob([createMarinadeAnalysis.toString(),';const analysis=createMarinadeAnalysis();onmessage=e=>{try{const model=analysis.analyze(e.data.input,e.data.options);postMessage({id:e.data.id,model});}catch(error){postMessage({id:e.data.id,error:error.message});}}'],{type:'text/javascript'}));worker=new global.Worker(workerURL);worker.onmessage=e=>{const job=pending.get(e.data.id);if(!job)return;pending.delete(e.data.id);e.data.error?job.reject(new Error(e.data.error)):job.resolve(e.data.model);};worker.onerror=e=>{for(const job of pending.values())job.reject(new Error(e.message||'Spectral analysis worker failed.'));pending.clear();closeWorker();};}
        if(pending.size>=8)throw new Error('Wait for the current spectral analyses to finish.');const id=++serial;
        model=await new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});try{const workerOptions={...options};delete workerOptions.signal;worker.postMessage({id,input,options:workerOptions});}catch(error){pending.delete(id);reject(error);}});
      }catch(error){if(options.signal?.aborted)throw error;model=await new Promise((resolve,reject)=>setTimeout(()=>{try{resolve(api.analyze(input,options));}catch(failure){reject(failure);}},0));}
    }else model=await new Promise((resolve,reject)=>setTimeout(()=>{try{resolve(api.analyze(input,options));}catch(error){reject(error);}},0));
    if(options.signal?.aborted)throw new DOMException('Spectral analysis cancelled.','AbortError');if(key){if(cache.size>=16)cache.delete(cache.keys().next().value);cache.set(key,model);}return model;
  };
  const sourceCache=new Map();
  api.sourceSignature=state=>(state.samples||[]).map(s=>[s.ref?.kind==='factory'?s.ref.id:s.ref?.data,s.ref?.sampleRate,s.ref?.frames,s.rootNote,s.trimStart,s.trimEnd,s.reverse,s.gain]);
  api.prepare=api.analyzeSources=async function(state,options={}) {
    if(!global.MarinadeSources?.resolve)throw new Error('MARINADE’s sample sources are not available.');if(!Array.isArray(state?.samples)||state.samples.length!==2)throw new Error('Choose two spectral sources.');
    const models=[];for(const bay of state.samples){if(options.signal?.aborted)throw new DOMException('Spectral analysis cancelled.','AbortError');const identity=bay.ref.kind==='factory'?'factory:'+bay.ref.id:bay.ref.data,edit=JSON.stringify([bay.ref.sampleRate,bay.ref.frames,bay.rootNote,bay.trimStart,bay.trimEnd,bay.reverse,bay.gain]);let entries=sourceCache.get(identity);if(entries?.has(edit)){models.push(entries.get(edit));continue;}const audio=global.MarinadeSources.resolve(bay.ref),model=await api.analyzeAsync(audio,{sampleRate:audio.sampleRate,rootNote:bay.rootNote,trimStart:bay.trimStart,trimEnd:bay.trimEnd,reverse:bay.reverse,gain:bay.gain,signal:options.signal});if(!entries){if(sourceCache.size>=16)sourceCache.delete(sourceCache.keys().next().value);entries=new Map();sourceCache.set(identity,entries);}if(entries.size>=8)entries.delete(entries.keys().next().value);entries.set(edit,model);models.push(model);}return models;
  };
  api.clearCache=()=>{cache.clear();sourceCache.clear();};api.dispose=closeWorker;global.MarinadeAnalysis=api;
})(typeof window!=='undefined'?window:globalThis);
