'use strict';
/* HEIRLOOM acceptance uses published signal-flow facts and analytic references.
 * It does not claim measured equivalence to a particular Prophet-5. Tuning,
 * source routing, modulation, causal timing and finite output are independently
 * testable. Noise spectra, nonlinear filter character and alias measurements
 * are reported with the assumptions and limits of their virtual references.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const TAU = 2 * Math.PI;
const copy = value => JSON.parse(JSON.stringify(value));
function stats(channels,from=0,to=channels[0].length){
  let peak=0,energy=0,sum=0,nonfinite=0;
  for(const channel of channels)for(let i=from;i<Math.min(to,channel.length);i++){const value=channel[i];if(!Number.isFinite(value))nonfinite++;peak=Math.max(peak,Math.abs(value));energy+=value*value;sum+=value;}
  const count=Math.max(1,(to-from)*channels.length);return {peak,rms:Math.sqrt(energy/count),mean:sum/count,nonfinite};
}
function difference(a,b,from=0,to=a[0].length){
  assert.equal(a.length,b.length);let maximum=0,energy=0;
  for(let channel=0;channel<a.length;channel++){assert.equal(a[channel].length,b[channel].length);for(let i=from;i<to;i++){const delta=a[channel][i]-b[channel][i];maximum=Math.max(maximum,Math.abs(delta));energy+=delta*delta;}}
  return {maximum,rms:Math.sqrt(energy/Math.max(1,(to-from)*a.length))};
}
function digest(channels){const hash=createHash('sha256');for(const channel of channels)hash.update(Buffer.from(channel.buffer,channel.byteOffset,channel.byteLength));return hash.digest('hex');}
function render(core,frames,blocks=[128]){
  const output=[new Float32Array(frames),new Float32Array(frames)];let block=0;
  const process=core.processBlock||core.process;assert.equal(typeof process,'function','Actual DSP must process stereo output');
  for(let at=0;at<frames;){const end=Math.min(frames,at+blocks[block++%blocks.length]);process.call(core,output[0].subarray(at,end),output[1].subarray(at,end));at=end;}
  return output;
}
function projection(samples,frequency,rate,from=0,to=samples.length){
  let real=0,imaginary=0;
  for(let i=from;i<to;i++){const phase=TAU*frequency*i/rate;real+=samples[i]*Math.cos(phase);imaginary-=samples[i]*Math.sin(phase);}
  return {amplitude:2*Math.hypot(real,imaginary)/Math.max(1,to-from),phase:Math.atan2(imaginary,real)};
}
function spectrum(samples,{from=0,size=32768,window=true}={}){
  assert(size>1&&(size&(size-1))===0,'FFT size must be a power of two');
  const real=new Float64Array(size),imaginary=new Float64Array(size);let weight=0;
  for(let i=0;i<size;i++){const w=window ? .5-.5*Math.cos(TAU*i/(size-1)) : 1;real[i]=(samples[from+i]||0)*w;weight+=w;}
  for(let i=1,j=0;i<size;i++){let bit=size>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){const value=real[i];real[i]=real[j];real[j]=value;}}
  for(let length=2;length<=size;length<<=1){const angle=-TAU/length,wr=Math.cos(angle),wi=Math.sin(angle);for(let base=0;base<size;base+=length){let cr=1,ci=0;for(let i=0;i<length/2;i++){const a=base+i,b=a+length/2,tr=real[b]*cr-imaginary[b]*ci,ti=real[b]*ci+imaginary[b]*cr;real[b]=real[a]-tr;imaginary[b]=imaginary[a]-ti;real[a]+=tr;imaginary[a]+=ti;const next=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=next;}}}
  return Float64Array.from(real.subarray(0,size/2),(value,i)=>2*Math.hypot(value,imaginary[i])/weight);
}
function peakFrequency(magnitudes,rate,wanted,range=Math.max(10,wanted*.025)){
  const size=magnitudes.length*2,low=Math.max(2,Math.floor((wanted-range)*size/rate)),high=Math.min(magnitudes.length-2,Math.ceil((wanted+range)*size/rate));
  let bin=low;for(let i=low+1;i<=high;i++)if(magnitudes[i]>magnitudes[bin])bin=i;
  const a=Math.log(magnitudes[bin-1]+1e-30),b=Math.log(magnitudes[bin]+1e-30),c=Math.log(magnitudes[bin+1]+1e-30),delta=.5*(a-c)/(a-2*b+c);
  return (bin+(Number.isFinite(delta)?Math.max(-1,Math.min(1,delta)):0))*rate/size;
}
function crossingFrequency(samples,rate,wanted,from=0,to=samples.length){
  const crossings=[],minimum=rate/wanted*.65;let previous=-Infinity;
  for(let i=Math.max(1,from);i<to;i++)if(samples[i-1]<=0&&samples[i]>0){const at=i-1-samples[i-1]/(samples[i]-samples[i-1]);if(at-previous>minimum){crossings.push(at);previous=at;}}
  assert(crossings.length>=8,'Need at least eight fundamental crossings');
  let sx=0,sy=0,sxy=0,sxx=0;for(let i=0;i<crossings.length;i++){sx+=i;sy+=crossings[i];sxy+=i*crossings[i];sxx+=i*i;}
  const n=crossings.length,period=(n*sxy-sx*sy)/(n*sxx-sx*sx);return rate/period;
}
function cents(actual,wanted){return 1200*Math.log2(actual/wanted);}
function normalizedCorrelation(samples,lag,from=0,to=samples.length){
  let xy=0,xx=0,yy=0;
  for(let i=from+lag;i<to;i++){const a=samples[i],b=samples[i-lag];xy+=a*b;xx+=a*a;yy+=b*b;}
  return xy/Math.sqrt(Math.max(1e-30,xx*yy));
}
function bandEnergy(magnitudes,rate,fromHz,toHz){const size=magnitudes.length*2;let power=0;for(let bin=Math.max(1,Math.ceil(fromHz*size/rate));bin<=Math.min(magnitudes.length-1,Math.floor(toHz*size/rate));bin++)power+=magnitudes[bin]*magnitudes[bin];return power;}
function aliasEnergy(magnitudes,rate,fundamental,{band=8000,skirts=4}={}){
  const size=magnitudes.length*2,mask=new Uint8Array(magnitudes.length);let useful=0,alias=0;
  for(let harmonic=1;harmonic*fundamental<rate/2;harmonic++){const center=Math.round(harmonic*fundamental*size/rate);for(let delta=-skirts;delta<=skirts;delta++)if(center+delta>=0&&center+delta<mask.length)mask[center+delta]=1;}
  for(let bin=skirts+1;bin<magnitudes.length&&bin*rate/size<=band;bin++){const energy=magnitudes[bin]*magnitudes[bin];if(mask[bin])useful+=energy;else alias+=energy;}
  return {alias,useful,relativeDb:10*Math.log10(Math.max(1e-30,alias)/Math.max(1e-30,useful))};
}
function naiveWave(frames,rate,frequency,{wave='saw',pulseWidth=.5,phase=0}={}){
  return Float32Array.from({length:frames},(_,i)=>{const cycle=(phase+i*frequency/rate)%1;return wave==='pulse'?(cycle<pulseWidth?1:-1):wave==='triangle'?1-4*Math.abs(cycle-.5):2*cycle-1;});
}
function load(){
  const scope={console,Blob,URL,DOMException,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout,performance,Math,Number,Float32Array,Float64Array,Uint8Array,Int16Array,Int32Array,ArrayBuffer,navigator:{},location:{protocol:'file:'}};
  scope.window=scope;scope.self=scope;scope.globalThis=scope;
  const shared=fs.existsSync(path.join(__dirname,'shared/pattern-schema.js'))?path.join(__dirname,'shared/pattern-schema.js'):path.join(__dirname,'../shared/pattern-schema.js');
  const source=fs.existsSync(path.join(__dirname,'dsp.js'))?'dsp.js':'synth-dsp.js';
  for(const file of [shared,path.join(__dirname,source),path.join(__dirname,'schema.js'),path.join(__dirname,'audio-engine.js')])Function('window','globalThis',fs.readFileSync(file,'utf8'))(scope,scope);
  if(fs.existsSync(path.join(__dirname,'presets.js')))Function('window','globalThis',fs.readFileSync(path.join(__dirname,'presets.js'),'utf8'))(scope,scope);
  return {scope,S:scope.HeirloomSchema,D:scope.createHeirloomDSP(),P:scope.createHeirloomPlaybackDSP(scope.createHeirloomDSP)};
}
function dryState(api,patch={}){
  const base=api.S.defaultState();
  base.synth={...base.synth,aFine:0,aSaw:true,aPulse:false,aPulseWidth:.5,sync:false,bFine:0,bSaw:false,bPulse:false,bTriangle:false,bPulseWidth:.5,bLow:false,bKeyboard:true,aLevel:.65,bLevel:0,noiseLevel:0,filterModel:'cem3320',cutoff:18000,resonance:0,filterEnvAmount:0,filterKeytrack:0,filterAttack:.001,filterDecay:.01,filterSustain:0,filterRelease:.03,ampAttack:.001,ampDecay:.01,ampSustain:1,ampRelease:.05,polyEnv:0,polyB:0,polyFreqA:false,polyPwA:false,polyFilter:false,lfoTriangle:true,lfoSaw:false,lfoSquare:false,lfoRange:'classic',wheelMix:0,wheelFreqA:false,wheelFreqB:false,wheelPwA:false,wheelPwB:false,wheelFilter:false,modWheel:0,initialAmount:0,unison:false,unisonVoices:5,unisonDetune:0,glide:0,polyGlide:false,release:true,velocityAmount:0,vintage:0,volume:.18,masterTune:0,...patch};
  base.pattern={...base.pattern,notes:[],lengthBeats:4};return api.S.normalize(base);
}
function held(api,patch={},pitch=69,{rate=48000,frames=24000,id='qa-note',velocity=.8,source='qa'}={}){
  const state=dryState(api,patch),core=new api.D.Core(rate,state);core.noteOn({id,pitch,velocity,source,channel:0});return {state,core,output:render(core,frames)};
}
function queue(core,events){for(const event of events)assert(core.enqueue(event.type,event),'Scheduled event accepted: '+event.type);return core;}
function voiceStates(core){const value=core.getMeters();return value.voiceStates||(Array.isArray(value.voices)?value.voices:[]);}
function audible(output,label){const value=stats(output);assert.equal(value.nonfinite,0,label+' finite');assert(value.peak>1e-5&&value.rms>1e-6,label+' audible');assert(value.peak<=1.001,label+' bounded');return value;}
async function runSuite(){
  const api=load(),{S,D,P,scope}=api,results=[],failures=[];
  const filter=process.env.HEIRLOOM_QA_FILTER&&new RegExp(process.env.HEIRLOOM_QA_FILTER);
  async function check(name,fn){if(filter&&!filter.test(name))return;try{const evidence=await fn();results.push({name,evidence});console.log('PASS '+name+(evidence?' '+JSON.stringify(evidence):''));}catch(error){failures.push({name,error:error.stack||String(error)});console.error('FAIL '+name+'\n'+(error.stack||error));}}
  await check('Published architecture controls cover two oscillators, five voices and independent modulation routes',()=>{
    const expected=['aTune','aFine','aSaw','aPulse','aPulseWidth','sync','bTune','bFine','bSaw','bPulse','bTriangle','bPulseWidth','bLow','bKeyboard','aLevel','bLevel','noiseLevel','filterModel','cutoff','resonance','filterEnvAmount','filterKeytrack','filterAttack','filterDecay','filterSustain','filterRelease','ampAttack','ampDecay','ampSustain','ampRelease','polyEnv','polyB','polyFreqA','polyPwA','polyFilter','lfoRate','lfoTriangle','lfoSaw','lfoSquare','wheelMix','wheelFreqA','wheelFreqB','wheelPwA','wheelPwB','wheelFilter','modWheel','unison','unisonVoices','unisonDetune','glide','release','bendRange','velocityAmount','vintage','volume','masterTune'];
    for(const key of expected){assert(Object.hasOwn(D.specifications,key),key+' DSP specification');assert(S.CONTROLS.some(control=>control.key===key),key+' editable control');}
    assert.deepEqual([...D.specifications.filterModel].sort(),['cem3320','ssm2040']);assert.equal(new Set(S.CONTROLS.map(control=>control.key)).size,S.CONTROLS.length);
    assert.equal(S.CONTROLS.find(control=>control.key==='bFine').min,0);assert(S.CONTROLS.find(control=>control.key==='bFine').max>=99);return {controls:S.CONTROLS.length};
  });
  await check('Complete projects round-trip, isolate copies and reject nonfinite or malformed sound settings',()=>{
    const state=dryState(api),serialized=S.serialize(state),restored=S.parseProject(serialized);assert.equal(S.serialize(restored),serialized);restored.synth.cutoff=77;assert.notEqual(state.synth.cutoff,77);
    for(const control of S.CONTROLS){const bad=JSON.parse(serialized);bad.state.synth[control.key]=control.type==='range'?Infinity:control.type==='toggle'?'true':'missing-circuit';assert.throws(()=>S.parseProject(bad),control.key+' strict project validation');}
    for(const change of [s=>delete s.synth.cutoff,s=>s.pattern.notes=[{id:'bad',voice:'synth',pitch:128,beat:0,duration:1,velocity:.8,probability:1}],s=>s.view.keyboardOctave=1.5,s=>s.tempo=0]){const bad=JSON.parse(serialized);change(bad.state);assert.throws(()=>S.parseProject(bad));}
    assert.throws(()=>S.parseProject('{broken'));assert.throws(()=>S.parseProject(' '.repeat(S.LIMITS.projectBytes+1)));return {bytes:serialized.length};
  });
  await check('Shared phrases retain exact non-grid timestamps, chords and variable note lengths',()=>{
    const state=dryState(api);state.pattern.notes=[{id:'short',voice:'synth',pitch:60,beat:.137,duration:.413,velocity:.71,probability:1},{id:'long',voice:'synth',pitch:67,beat:.137,duration:2.731,velocity:.83,probability:1},{id:'late',voice:'synth',pitch:74,beat:3.123,duration:.777,velocity:.52,probability:1}];
    const restored=S.parseProject(S.serialize(state));assert.deepEqual(restored.pattern.notes,state.pattern.notes);return {notes:restored.pattern.notes.length,starts:restored.pattern.notes.map(note=>note.beat),durations:restored.pattern.notes.map(note=>note.duration)};
  });
  await check('Contour knob mapping is monotonic, invertible and anchors the original documented timing landmarks',()=>{
    const evidence={};
    for(const key of ['filterAttack','filterDecay','filterRelease','ampAttack','ampDecay','ampRelease']){
      let previous=0;for(let i=0;i<=100;i++){const position=i/100,value=S.valueAt(key,position);assert(Number.isFinite(value)&&value>=previous);assert(Math.abs(S.position(key,value)-position)<1e-9);previous=value;}
      const values=[0,.5,1].map(position=>S.valueAt(key,position));assert(Math.abs(values[0]-.001)<1e-12);assert(Math.abs(values[1]-.5)<1e-10);assert(Math.abs(values[2]-30)<1e-9);evidence[key]=values;
    }
    for(const [lfoRange,min,max]of [['classic',.04,20],['wide',.022,500]]){const patch={...S.defaults,lfoRange},control=S.control('lfoRate',patch);assert.equal(control.min,min);assert.equal(control.max,max);for(const position of [0,.1,.5,.9,1])assert(Math.abs(S.position('lfoRate',S.valueAt('lfoRate',position,patch),patch)-position)<1e-10);}
    return evidence;
  });
  await check('Independent envelope references distinguish flatter SSM and curved CEM contours and release from the current level',()=>{
    assert.equal(typeof D.Envelope,'function');const rate=48000,evidence=[];
    for(const linear of [true,false]){
      const env=new D.Envelope(rate,{attack:.2,decay:.12,sustain:.4,release:.15},linear);env.gate(true);
      for(let i=0;i<4800;i++)env.process();const midpoint=env.value;
      if(linear)assert(midpoint>.45&&midpoint<.62,'Earlier-family contour is close to linear at half attack');else assert(midpoint>.62&&midpoint<.9,'CEM contour is appreciably curved at half attack');
      for(let i=0;i<4802;i++)env.process();assert(Math.abs(env.value-1)<.003,'Attack reaches peak at the declared virtual duration');
      for(let i=0;i<5760;i++)env.process();assert(Math.abs(env.value-.4)<.003,'Decay reaches the sustain neighborhood');
      env.reset();env.gate(true);for(let i=0;i<2400;i++)env.process();const releaseStart=env.value;env.gate(false);assert.equal(env.value,releaseStart,'Key-up does not jump to peak or zero');env.process();assert(env.value<=releaseStart&&env.value>releaseStart-.002,'Release begins continuously');for(let i=0;i<rate;i++)env.process();assert.equal(env.value,0,'Release eventually terminates');evidence.push({linear,midpoint,releaseStart});
    }
    assert(evidence[1].midpoint>evidence[0].midpoint+.05,'SSM-family attack is flatter than the CEM-family curve');return evidence;
  });
  await check('Oscillator wave switches sum independently and modulation taps retain the original B waveform polarities',()=>{
    assert.equal(typeof D.Oscillator,'function');const frames=8192,increment=1/256,renderWave=flags=>{const osc=new D.Oscillator(.173),audio=new Float64Array(frames),mod=new Float64Array(frames);for(let i=0;i<frames;i++){audio[i]=osc.sample(increment,.25,flags);mod[i]=osc.modulation;}return {audio,mod,phase:osc.phase};};
    const saw=renderWave(1),pulse=renderWave(2),triangle=renderWave(4),both=renderWave(3);
    for(let i=0;i<frames;i++)assert(Math.abs(both.audio[i]-saw.audio[i]-pulse.audio[i])<1e-12,'Wave switches add before the mixer');
    const mean=values=>values.subarray(512).reduce((a,b)=>a+b,0)/(values.length-512);
    assert(Math.abs(mean(triangle.mod))<.002,'B triangle is bipolar');assert(Math.abs(mean(saw.mod)-.5)<.005,'B saw modulation is positive-going');assert(Math.abs(mean(pulse.mod)-.25)<.005,'B pulse modulation is positive-going with its selected duty');return {triangleMean:mean(triangle.mod),sawMean:mean(saw.mod),pulseMean:mean(pulse.mod)};
  });
  await check('Shared white and separate pink generators are deterministic and have the expected broad spectral slopes',()=>{
    assert.equal(typeof D.createNoise,'function');const rate=48000,noise=D.createNoise(rate,12345),repeat=D.createNoise(rate,12345),frames=65536;
    for(let i=0;i<4096;i++){noise.white();noise.pink();repeat.white();repeat.pink();}
    const white=new Float32Array(frames),pink=new Float32Array(frames),otherWhite=white.slice(),otherPink=pink.slice();for(let i=0;i<frames;i++){white[i]=noise.white();pink[i]=noise.pink();otherWhite[i]=repeat.white();otherPink[i]=repeat.pink();}
    assert.equal(digest([white,pink]),digest([otherWhite,otherPink]));
    const ws=spectrum(white,{size:frames}),ps=spectrum(pink,{size:frames}),ratio=s=>10*Math.log10(bandEnergy(s,rate,1600,3200)/bandEnergy(s,rate,200,400)),whiteOctavesDb=ratio(ws),pinkOctavesDb=ratio(ps);
    assert(whiteOctavesDb>6&&whiteOctavesDb<12,'White energy grows with octave bandwidth');assert(pinkOctavesDb> -3&&pinkOctavesDb<3,'Pink energy stays approximately equal across octave bands');
    const independent=D.createNoise(rate,99),reference=D.createNoise(rate,99);for(let i=0;i<997;i++)independent.white();for(let i=0;i<128;i++)assert.equal(independent.pink(),reference.pink(),'White mixer reads cannot consume the separate pink source');return {whiteOctavesDb,pinkOctavesDb};
  });
  await check('The audio noise bus is shared across voices rather than regenerated independently per voice',()=>{
    const state=dryState(api,{aLevel:0,bLevel:0,noiseLevel:.01,volume:.1,cutoff:9000}),single=new D.Core(48000,state),double=new D.Core(48000,state);
    single.noteOn({id:'one',pitch:60,velocity:.8,source:'qa',channel:0});for(const pitch of [60,67])double.noteOn({id:'noise-'+pitch,pitch,velocity:.8,source:'qa',channel:0});
    const a=render(single,8192),b=render(double,8192),twice=a.map(channel=>Float32Array.from(channel,value=>value*2)),delta=difference(twice,b);
    assert(delta.maximum<1e-7,'Identical open voice filters receive the same white-noise sample');return {maximumDifferenceFromTwiceSingle:delta.maximum,ratio:stats(b).rms/stats(a).rms};
  });
  await check('The single shared LFO follows its selected rate with bipolar triangle and positive saw and square modulation',()=>{
    const rate=48000,frames=4096,evidence=[];
    for(const [lfoRange,lfoRate]of [['classic',.04],['classic',20],['wide',.022],['wide',500]]){
      const state=dryState(api,{lfoRange,lfoRate}),idle=new D.Core(rate,state),poly=new D.Core(rate,state),start=idle.lfo.phase;for(const pitch of [48,52,55,60,64])poly.noteOn({id:'lfo-'+pitch,pitch,velocity:.8,source:'qa',channel:0});render(idle,frames);render(poly,frames);
      const wanted=(start+frames*lfoRate/rate)%1,error=Math.abs(idle.lfo.phase-wanted);assert(Math.min(error,Math.abs(error-1))<1e-10,'LFO advances at its declared cycles per second');assert.equal(idle.lfo.phase,poly.lfo.phase,'Voice count cannot alter the shared LFO clock');evidence.push({lfoRange,lfoRate,phase:idle.lfo.phase});
    }
    const polarity={};for(const wave of ['Triangle','Saw','Square']){const values=[];for(const phase of wave==='Triangle'?[.125,.625]:[.25,.75]){const core=new D.Core(rate,dryState(api,{lfoRange:'classic',lfoRate:1,lfoTriangle:wave==='Triangle',lfoSaw:wave==='Saw',lfoSquare:wave==='Square'}));core.lfo.reset(phase);render(core,1);values.push(core.getMeters().lfo);}polarity[wave]=values;}
    assert(polarity.Triangle[0]<0&&polarity.Triangle[1]>0,'Triangle crosses both polarities');for(const wave of ['Saw','Square'])assert(polarity[wave].every(value=>value>=0&&value<=1),'Saw and square modulation remain positive');assert(Math.abs(polarity.Saw[0]-.25)<.001&&Math.abs(polarity.Saw[1]-.75)<.001);assert.deepEqual(polarity.Square,[1,0]);return {rates:evidence,polarity};
  });
  await check('Both actual filter models have a four-pole stopband and sustain self-oscillation after tiny excitation',()=>{
    assert.equal(typeof D.Filter,'function');const rate=48000,evidence=[];
    for(const model of ['ssm2040','cem3320']){
      const amplitude=frequency=>{const filter=new D.Filter(rate,model);filter.set(300,0,model);const samples=new Float32Array(16384);for(let i=0;i<samples.length;i++)samples[i]=filter.process(.0001*Math.sin(TAU*frequency*i/rate));return projection(samples,frequency,rate,4096).amplitude;};
      const rolloffDb=20*Math.log10(amplitude(2400)/amplitude(4800));assert(rolloffDb>21&&rolloffDb<29,'Four-pole rolloff '+model+': '+rolloffDb);
      const filter=new D.Filter(rate,model);filter.set(1000,1,model);filter.reset(1e-5);const samples=new Float32Array(48000);for(let i=0;i<samples.length;i++)samples[i]=filter.process(0);const early=stats([samples],0,4800).rms,late=stats([samples],24000).rms;assert(late>1e-4&&late>early,'Resonant oscillation survives without continued input');assert(stats([samples]).peak<4,'Self-oscillation remains bounded');
      const peak=peakFrequency(spectrum(samples,{from:12000,size:32768}),rate,1000,500);assert(peak>600&&peak<1400,'Self-oscillation lies near cutoff');evidence.push({model,rolloffDb,early,late,frequency:peak});
    }
    return evidence;
  });
  await check('PCM tuning, octave steps and master cents follow analytic pitch references',()=>{
    const evidence=[];
    for(const rate of [44100,48000,96000])for(const pitch of [45,69,81]){
      const value=held(api,{},pitch,{rate,frames:Math.round(rate*.7)}),wanted=440*2**((pitch-69)/12),measured=crossingFrequency(value.output[0],rate,wanted,Math.round(rate*.1)),error=cents(measured,wanted);assert(Math.abs(error)<1,'MIDI tuning within one cent: '+pitch+' / '+rate+' / '+error);evidence.push({rate,pitch,wanted,measured,cents:error});
    }
    for(const masterTune of [-100,100]){const value=held(api,{masterTune},69,{frames:32000}),wanted=440*2**(masterTune/1200),measured=crossingFrequency(value.output[0],48000,wanted,4800);assert(Math.abs(cents(measured,wanted))<1);}
    return evidence;
  });
  await check('All five oscillator pairs free-run during silence and note-on does not reset their phases',()=>{
    const core=new D.Core(48000,dryState(api)),before=voiceStates(core);render(core,777);const idle=voiceStates(core);
    assert.equal(idle.length,5);for(let i=0;i<5;i++){assert(Number.isFinite(idle[i].phaseA)&&Number.isFinite(idle[i].phaseB));assert.notEqual(idle[i].phaseA,before[i].phaseA,'Idle A phase advances');assert.notEqual(idle[i].phaseB,before[i].phaseB,'Idle B phase advances');}
    core.noteOn({id:'free',pitch:69,velocity:.8,source:'qa',channel:0});const started=voiceStates(core);for(let i=0;i<5;i++){assert.equal(started[i].phaseA,idle[i].phaseA,'Note-on preserves A phase');assert.equal(started[i].phaseB,idle[i].phaseB,'Note-on preserves B phase');}return {phases:idle.map(voice=>[voice.phaseA,voice.phaseB])};
  });
  await check('Hard sync locks A to the raw B master even when B has no selected audio waveform or mixer gain',()=>{
    const rate=48000,pitch=57,master=220,slave=master*2**(7/12),patch={aTune:31,bTune:24,bFine:0,bLevel:0,bSaw:false,bPulse:false,bTriangle:false,sync:true},a=held(api,patch,pitch,{frames:48000}),b=held(api,{...patch,bTriangle:true},pitch,{frames:48000}),off=held(api,{...patch,sync:false},pitch,{frames:48000});
    assert.equal(digest(a.output),digest(b.output),'B waveform selection does not gate raw sync triggers');
    const synchronized={master:projection(a.output[0],master,rate,12000).amplitude,slave:projection(a.output[0],slave,rate,12000).amplitude},unsynced={master:projection(off.output[0],master,rate,12000).amplitude,slave:projection(off.output[0],slave,rate,12000).amplitude};
    assert(synchronized.master>synchronized.slave*6,'Synced spectrum repeats at B, not free A');assert(unsynced.slave>unsynced.master*6,'Disabling sync restores free A tuning');return {synchronized,unsynced};
  });
  await check('Actual saw anti-aliasing lowers in-band folding energy relative to an unsmoothed sampled ramp',()=>{
    const rate=48000,pitch=101,wanted=440*2**((pitch-69)/12),frames=73728,actual=held(api,{cutoff:20000},pitch,{frames}),reference=naiveWave(frames,rate,wanted),a=aliasEnergy(spectrum(actual.output[0],{from:8192,size:65536}),rate,wanted),b=aliasEnergy(spectrum(reference,{from:8192,size:65536}),rate,wanted),improvementDb=b.relativeDb-a.relativeDb;
    assert(improvementDb>12,'Band-limited/oversampled saw improves low-band alias energy: '+improvementDb+' dB');return {wanted,analysisBandHz:8000,actualRelativeDb:a.relativeDb,naiveRelativeDb:b.relativeDb,improvementDb,limitation:'Relative spectral reference, not zero aliasing or a measured hardware comparison.'};
  });
  await check('Extreme rates, MIDI endpoints, all waveforms, maximum resonance and five-voice unison stay finite and bounded',()=>{
    const evidence=[];
    for(const rate of [8000,44100,48000,96000])for(const pitch of [0,127])for(const filterModel of ['ssm2040','cem3320']){
      const value=held(api,{aSaw:true,aPulse:true,bSaw:true,bPulse:true,bTriangle:true,aTune:48,bTune:48,aPulseWidth:.01,bPulseWidth:.99,aLevel:1,bLevel:1,noiseLevel:1,filterModel,cutoff:20000,resonance:1,filterEnvAmount:8,polyEnv:1,polyB:1,polyFreqA:true,polyPwA:true,polyFilter:true,lfoRange:'wide',lfoRate:500,modWheel:1,initialAmount:1,wheelMix:.5,wheelFreqA:true,wheelFreqB:true,wheelPwA:true,wheelPwB:true,wheelFilter:true,unison:true,unisonVoices:5,unisonDetune:50,vintage:1,volume:1},pitch,{rate,frames:2048});
      const valueStats=stats(value.output);assert.equal(valueStats.nonfinite,0);assert(valueStats.peak<4,'Extreme synthesis has bounded headroom');assert.equal(voiceStates(value.core).length,5);assert(value.core.getMeters().voices<=5);evidence.push({rate,pitch,filterModel,peak:valueStats.peak});
    }
    return evidence;
  });
  await check('Every original factory recipe is complete, uniquely named and renders its actual signal path',()=>{
    assert(Array.isArray(scope.HeirloomPresets)&&scope.HeirloomPresets.length>=16);const names=new Set(),ids=new Set(),evidence=[];
    for(const preset of scope.HeirloomPresets){assert(!names.has(preset.name)&&!ids.has(preset.id));names.add(preset.name);ids.add(preset.id);const state=S.defaultState();state.synth=copy(preset.synth);assert.equal(S.serialize(S.parseProject(S.serialize(state))),S.serialize(state));const core=new D.Core(48000,state);for(const pitch of [48,55,60,64,67])core.noteOn({id:'preset-'+pitch,pitch,velocity:.8,source:'qa',channel:0});const output=render(core,8192),value=stats(output);assert.equal(value.nonfinite,0,preset.name+' finite');assert(value.peak>1e-6,preset.name+' audible');assert(value.peak<4,preset.name+' bounded');evidence.push({id:preset.id,peak:value.peak,rms:value.rms});}
    return {count:evidence.length,recipes:evidence};
  });
  await check('Five physical voices reuse a repeated key and steal the earliest held assignment',()=>{
    const state=dryState(api),core=new D.Core(48000,state),notes=[48,52,55,60,64];
    for(const pitch of notes)core.noteOn({id:'voice-'+pitch,pitch,velocity:.8,source:'qa',channel:0});render(core,128);
    const first=voiceStates(core);assert.equal(first.length,5);assert.equal(first.filter(voice=>voice.active).length,5);
    const stolen=core.getMeters().stolen||0;core.noteOn({id:'repeat',pitch:55,velocity:.8,source:'qa',channel:0});render(core,128);assert.equal(core.getMeters().stolen||0,stolen,'Repeated key reuses its physical voice');
    const other=new D.Core(48000,state);for(const pitch of notes)other.noteOn({id:'voice-'+pitch,pitch,velocity:.8,source:'qa',channel:0});render(other,128);other.noteOn({id:'sixth',pitch:79,velocity:.8,source:'qa',channel:0});render(other,128);
    const pitches=voiceStates(other).filter(voice=>voice.active).map(voice=>voice.pitch);assert.equal(pitches.length,5);assert(!pitches.includes(48)&&pitches.includes(79),'Sixth key borrows earliest held voice');return {pitches,stolen:other.getMeters().stolen};
  });
  await check('A gate-off release tail is reassigned before any of four still-held notes',()=>{
    const core=new D.Core(48000,dryState(api,{ampRelease:30,filterRelease:30})),pitches=[48,52,55,60,64];for(const pitch of pitches)core.noteOn({id:'tail-'+pitch,pitch,velocity:.8,source:'qa',channel:0});render(core,4096);
    core.noteOff({id:'tail-64',source:'qa',channel:0});render(core,128);const before=voiceStates(core),tail=before.find(voice=>voice.pitch===64);assert(tail.active&&!tail.gate,'Fifth voice is releasing, not numerically silent');
    core.noteOn({id:'replacement',pitch:79,velocity:.8,source:'qa',channel:0});const after=voiceStates(core),held=after.filter(voice=>voice.gate).map(voice=>voice.pitch);for(const pitch of [48,52,55,60,79])assert(held.includes(pitch),'Preserve held pitch '+pitch);assert.equal(after.find(voice=>voice.pitch===79).index,tail.index,'Use the gate-off circuit');assert.equal(core.getMeters().stolen,0,'Reusing a release-tail voice is not a held-key steal');return {held,tailLevel:tail.level};
  });
  await check('Voice reassignment preserves oscillator phase, contour level and filter memory instead of hard-resetting the circuit',()=>{
    const core=new D.Core(48000,dryState(api,{cutoff:1200,resonance:.6}));for(const pitch of [48,52,55,60,64])core.noteOn({id:'old-'+pitch,pitch,velocity:.8,source:'qa',channel:0});render(core,8192);
    const before=voiceStates(core).find(voice=>voice.pitch===48),memory=Float64Array.from(core.voices[before.index].filter.state);core.noteOn({id:'borrow',pitch:79,velocity:.8,source:'qa',channel:0});const after=voiceStates(core)[before.index];
    assert.equal(after.phaseA,before.phaseA);assert.equal(after.phaseB,before.phaseB);assert.equal(after.ampEnv,before.ampEnv);assert.equal(after.filterEnv,before.filterEnv);assert.deepEqual(core.voices[before.index].filter.state,memory,'Filter state is not cleared at the note boundary');const output=render(core,2048);audible(output,'Reassigned chord');return {envelopeBefore:before.ampEnv,envelopeAfter:after.ampEnv,peak:stats(output).peak};
  });
  await check('Classic unison glide remembers the previous pitch across silence while ordinary polyphonic tuning remains immediate',()=>{
    const state=dryState(api,{unison:true,unisonVoices:3,glide:.15,ampRelease:.01}),core=new D.Core(48000,state);core.noteOn({id:'first',pitch:48,velocity:.8,source:'qa',channel:0});render(core,4096);for(const voice of core.voices.filter(voice=>voice.gate))assert.equal(voice.currentKey,48,'First note does not glide from an arbitrary power-on pitch');
    core.noteOff({id:'first',source:'qa',channel:0});render(core,24000);core.noteOn({id:'next',pitch:72,velocity:.8,source:'qa',channel:0});assert(core.voices.filter(voice=>voice.gate).every(voice=>voice.currentKey<60),'Unison resumes its prior control voltage after a gap');render(core,24000);assert(core.voices.filter(voice=>voice.gate).every(voice=>Math.abs(voice.currentKey-72)<.1),'Glide converges to the new key');
    const poly=new D.Core(48000,dryState(api,{glide:.5,polyGlide:false}));for(const pitch of [48,52,55,60,64])poly.noteOn({id:'poly-'+pitch,pitch,velocity:.8,source:'qa',channel:0});render(poly,128);poly.noteOn({id:'new',pitch:79,velocity:.8,source:'qa',channel:0});assert.equal(poly.voices.find(voice=>voice.pitch===79).currentKey,79,'Classic polyphony has no glide');return {unisonVoices:3,classicPolyGlide:false};
  });
  await check('Sustain, source ownership and optional velocity response preserve the classic keyboard behavior',()=>{
    const core=new D.Core(48000,dryState(api));core.noteOn({id:'a',pitch:60,velocity:.8,source:'a',channel:0});core.noteOn({id:'b',pitch:67,velocity:.8,source:'b',channel:1});render(core,256);core.sustain({down:true,source:'a',channel:0});core.noteOff({id:'a',source:'a',channel:0});core.noteOff({id:'b',source:'b',channel:1});
    assert(voiceStates(core).find(voice=>voice.pitch===60).gate,'Pedal retains its own released key');assert(!voiceStates(core).find(voice=>voice.pitch===67).gate,'Pedal does not retain the unrelated source');core.cancelNotes({source:'a'});assert(!voiceStates(core).some(voice=>voice.gate),'Cancellation releases source-owned sustain');
    const low=held(api,{velocityAmount:0},69,{velocity:.2,frames:4096}),high=held(api,{velocityAmount:0},69,{velocity:.8,frames:4096});assert.equal(digest(low.output),digest(high.output),'Original keyboard mode has no velocity sensitivity');
    const sensitiveLow=held(api,{velocityAmount:1},69,{velocity:.2,frames:4096}),sensitiveHigh=held(api,{velocityAmount:1},69,{velocity:.8,frames:4096}),ratio=stats(sensitiveHigh.output).rms/stats(sensitiveLow.output).rms;assert(Math.abs(ratio-4)<.01,'Explicit modern velocity extension follows the received velocity');return {velocityRatio:ratio};
  });
  await check('Replacing an explicit note ID with a different pitch cannot orphan the previous held gate',()=>{
    const core=new D.Core(48000,dryState(api));core.noteOn({id:'reused',pitch:60,velocity:.8,source:'qa',channel:0});render(core,128);core.noteOn({id:'unrelated',pitch:72,velocity:.8,source:'other',channel:1});core.noteOn({id:'reused',pitch:67,velocity:.8,source:'qa',channel:0});render(core,128);
    assert(!voiceStates(core).some(voice=>voice.pitch===60&&voice.gate),'Replacing an identity releases the previous pitch');core.noteOff({id:'reused',source:'qa',channel:0});const remaining=voiceStates(core).filter(voice=>voice.gate).map(voice=>voice.pitch);assert.deepEqual(remaining,[72],'Only the unrelated source remains held');return {remaining};
  });
  await check('Audio-rate FM, moving PWM, shared modulation and vintage clocks are sample-identical across irregular blocks and reset',()=>{
    const state=dryState(api,{aSaw:true,aPulse:true,bTriangle:true,bPulse:true,bTune:31,polyB:.17,polyEnv:.13,polyFreqA:true,polyPwA:true,polyFilter:true,cutoff:2700,resonance:.61,lfoRange:'wide',lfoRate:83,initialAmount:.2,wheelMix:.35,wheelFreqA:true,wheelPwB:true,wheelFilter:true,vintage:.5}),a=new D.Core(48000,state),b=new D.Core(48000,state);
    const start=core=>{for(const pitch of [48,55,60,64,67])core.noteOn({id:'clock-'+pitch,pitch,velocity:.8,source:'qa',channel:0});};start(a);start(b);const x=render(a,8192,[128]),y=render(b,8192,[1,17,137,251,32]);assert.equal(digest(x),digest(y),'Control clocks cannot depend on render partitioning');a.reset();start(a);assert.equal(digest(render(a,8192,[251,17])),digest(x),'Explicit reset repeats seeded audio exactly');return {sha256:digest(x)};
  });
  await check('Both filter families render finite audible mono-to-stereo sound and remain distinct beyond gain',()=>{
    const a=held(api,{filterModel:'ssm2040',cutoff:1250,resonance:.6}),b=held(api,{filterModel:'cem3320',cutoff:1250,resonance:.6});audible(a.output,'SSM');audible(b.output,'CEM');
    for(const output of [a.output,b.output])assert.equal(difference([output[0]],[output[1]]).maximum,0,'Physical mono output is copied to stereo');
    const ar=stats(a.output).rms,br=stats(b.output).rms,x=a.output.map(channel=>Float32Array.from(channel,value=>value/ar)),y=b.output.map(channel=>Float32Array.from(channel,value=>value/br));assert(difference(x,y).rms>1e-4,'Circuit families must differ beyond simple output gain');return {ssm:stats(a.output),cem:stats(b.output)};
  });
  await check('Zero-depth Poly-Mod and a muted B mixer preserve A while nonzero audio-rate routing changes its signal',()=>{
    const base={bTriangle:true,bLevel:0,polyB:0,polyFreqA:false},off=held(api,base),routedZero=held(api,{...base,polyFreqA:true}),otherWave=held(api,{...base,bTriangle:false,bSaw:true});
    assert.equal(digest(off.output),digest(routedZero.output),'Zero source depth is transparent');assert.equal(digest(off.output),digest(otherWave.output),'Muted B alone does not change A');
    const mod=held(api,{...base,polyB:.25,polyFreqA:true});assert(difference(off.output,mod.output).rms>1e-4,'B before its mixer level modulates A at audio rate');return {modulationDifference:difference(off.output,mod.output).rms};
  });
  await check('Oscillator-B pitch modulation follows exponential CV symmetry rather than linear-FM offsets',()=>{
    const rate=48000,base=110,core=new D.Core(rate,dryState(api,{bTriangle:true,bSaw:false,bPulse:false,bLevel:0,bLow:true,bKeyboard:false,bTune:24,polyB:.125,polyFreqA:true}));core.noteOn({id:'expo',pitch:45,velocity:.8,source:'qa',channel:0});
    const left=new Float32Array(1),right=new Float32Array(1),nearest=[{distance:Infinity},{distance:Infinity}];let before=voiceStates(core)[0];
    for(let i=0;i<16000;i++){core.process(left,right);const after=voiceStates(core)[0],stepA=(after.phaseA-before.phaseA+1)%1,stepB=(after.phaseB-before.phaseB+1)%1,phase=(before.phaseB+stepB*.5)%1,frequency=stepA*rate;for(const [index,wanted]of [.375,.875].entries()){const distance=Math.abs(phase-wanted);if(distance<nearest[index].distance)nearest[index]={distance,phase,frequency};}before=after;}
    const high=nearest[0].frequency,low=nearest[1].frequency,geometric=Math.sqrt(high*low),arithmetic=(high+low)*.5;assert(nearest.every(point=>point.distance<.0002));assert(high>base&&low<base&&high/low>1.1);assert(Math.abs(cents(geometric,base))<.5,'Opposite triangle voltages have reciprocal pitch ratios');assert(arithmetic>base*1.0005,'Arithmetic average distinguishes exponential from linear frequency offsets');return {high,low,geometric,arithmetic,centsError:cents(geometric,base)};
  });
  await check('Poly-Mod destinations remain independent: pulse width affects pulses, filter modulation does not retune A',()=>{
    const common={bTriangle:true,bLevel:0,polyB:.18},plain=held(api,{...common,polyPwA:false}),sawPWM=held(api,{...common,polyPwA:true});assert.equal(digest(plain.output),digest(sawPWM.output),'A saw alone has no pulse-width destination');
    const pulse=held(api,{...common,aSaw:false,aPulse:true,polyPwA:false}),pulsePWM=held(api,{...common,aSaw:false,aPulse:true,polyPwA:true});assert(difference(pulse.output,pulsePWM.output).rms>1e-4,'Pulse-width route changes the pulse sound');
    const filtered=held(api,{...common,cutoff:900,polyFilter:true}),unmodulated=held(api,{...common,cutoff:900,polyFilter:false});assert(difference(filtered.output,unmodulated.output).rms>1e-4,'Filter destination changes sound');assert.equal(voiceStates(filtered.core)[0].phaseA,voiceStates(unmodulated.core)[0].phaseA,'Filter-only route leaves oscillator frequency untouched');return {pulseDifference:difference(pulse.output,pulsePWM.output).rms,filterDifference:difference(filtered.output,unmodulated.output).rms};
  });
  await check('Oscillator B keyboard-off preserves its output across different incoming keys',()=>{
    const patch={aLevel:0,bLevel:.65,bSaw:false,bTriangle:true,bKeyboard:false,bLow:false},a=held(api,patch,48),b=held(api,patch,84);audible(a.output,'Fixed B');assert.equal(digest(a.output),digest(b.output),'Keyboard-off B ignores MIDI pitch');
    const tracked=held(api,{...patch,bKeyboard:true},84);assert(difference(a.output,tracked.output).rms>1e-4,'Keyboard-on restores pitch tracking');return {fixedHash:digest(a.output)};
  });
  await check('Future note and cancellation boundaries are causal and independent of output block sizes',()=>{
    const state=dryState(api),events=[{type:'on',frame:337,id:'one',pitch:60,velocity:.8,source:'one',channel:0,durationFrames:11000},{type:'on',frame:997,id:'other',pitch:67,velocity:.7,source:'other',channel:1,durationFrames:9000},{type:'cancel',frame:5001,source:'one'},{type:'bend',frame:6037,source:'other',channel:1,value:.3}],a=queue(new P.Core(48000,state),events),b=queue(new P.Core(48000,state),events),x=render(a,16000,[128]),y=render(b,16000,[1,17,137,251,32]);
    assert.equal(digest(x),digest(y));assert(x.every(channel=>channel.subarray(0,337).every(value=>value===0)),'No pre-echo before timestamp');audible(x,'Scheduled notes');return {sha256:digest(x)};
  });
  await check('Same-frame key-down/key-up order and source cancellation do not leave stuck or unrelated voices',()=>{
    const state=dryState(api),short=new P.Core(48000,state);short.enqueue('on',{frame:0,id:'tap',pitch:60,velocity:.8,source:'keys',channel:0});short.enqueue('off',{frame:0,id:'tap',source:'keys',channel:0});const tap=render(short,1024);assert(tap.every(channel=>channel.every(value=>value===0)));assert(!voiceStates(short).some(voice=>voice.gate));
    const events=[{type:'on',frame:0,id:'one',pitch:60,velocity:.8,source:'one',channel:0,durationFrames:12000},{type:'on',frame:0,id:'two',pitch:67,velocity:.8,source:'two',channel:1,durationFrames:18000}],a=queue(new P.Core(48000,state),events),b=queue(new P.Core(48000,state),events);a.enqueue('cancel',{frame:3000,source:'one'});b.enqueue('off',{frame:3000,id:'one',source:'one',channel:0});const x=render(a,16000),y=render(b,16000);assert.equal(digest(x),digest(y),'Source cancellation leaves the unrelated channel unchanged');assert(stats(x,6000,11000).rms>1e-5);return {sha256:digest(x)};
  });
  await check('A future cancellation removes duration-generated old offs before a same-ID note is reused',()=>{
    const state=dryState(api),a=new P.Core(48000,state),b=new P.Core(48000,state),first={type:'on',frame:0,id:'reused',pitch:60,velocity:.8,source:'same',channel:0,durationFrames:8000};
    for(const core of [a,b]){core.enqueue('on',first);core.enqueue('cancel',{frame:4000,source:'same'});render(core,5000);core.enqueue('on',{frame:5000,id:'reused',pitch:60,velocity:.8,source:'same',channel:0,durationFrames:12000});}
    // Delete only the obsolete first note-off from the control reference; all
    // audio history and the new note remain otherwise identical.
    b.jobs=b.jobs.filter(job=>!(job.type==='off'&&job.id==='reused'&&job.frame===8000));
    const x=render(a,11000),y=render(b,11000);assert.equal(digest(x),digest(y),'Old canceled note-off cannot release the replacement');assert(stats(x,5000,7000).rms>1e-5);return {sha256:digest(x)};
  });
  await check('Native phrase, scheduled parameter edits and source cancellation remain partition-independent',()=>{
    const state=dryState(api);state.pattern.notes=[{id:'n1',voice:'synth',pitch:60,beat:0,duration:.9,velocity:.8,probability:1},{id:'n2',voice:'synth',pitch:67,beat:.337,duration:1.3,velocity:.7,probability:1}];state.tempo=137;
    const events=[{type:'start',frame:173,beat:0},{type:'state',frame:2003,state:{synth:{...state.synth,cutoff:2351,resonance:.47}}},{type:'transport',frame:3501,beat:.4,tempo:117,playing:true,revision:1},{type:'stop',frame:17003}],a=queue(new P.Core(48000,state),events),b=queue(new P.Core(48000,state),events),x=render(a,24000,[128]),y=render(b,24000,[251,17,1,137]);assert.equal(digest(x),digest(y));audible(x,'Native phrase');return {sha256:digest(x)};
  });
  await check('Panic remains effective at the bounded scheduled-note limit and clears active sound',()=>{
    const core=new P.Core(48000,dryState(api));core.enqueue('on',{id:'held',pitch:60,velocity:.8,source:'held',frame:0});render(core,256);
    let accepted=0;for(let i=0;i<P.MAX_JOBS+16;i++)if(core.enqueue('on',{id:'queued-'+i,pitch:60+i%12,velocity:.7,source:'flood',frame:100000+i}))accepted++;
    assert(accepted<=P.MAX_JOBS);assert(core.jobs.length<=P.MAX_JOBS);assert(core.enqueue('panic',{frame:core.frame}),'Panic accepted despite note overload');const output=render(core,512);assert(output.every(channel=>channel.every(value=>value===0)));assert.equal(core.jobs.length,0);return {accepted,limit:P.MAX_JOBS};
  });
  console.log(results.length+' HEIRLOOM architecture, signal and scheduling groups passed.');
  if(process.env.HEIRLOOM_QA_REPORT)fs.writeFileSync(process.env.HEIRLOOM_QA_REPORT,JSON.stringify({results,failures,limitations:['Architecture and analytic references are not measurements of a physical Prophet-5.','Render parity checks use one deterministic software implementation at an identical sample rate and event clock.']},null,2)+'\n');
  if(failures.length)throw Error(failures.length+' HEIRLOOM acceptance groups failed.');return results;
}
module.exports={stats,difference,digest,render,projection,spectrum,peakFrequency,crossingFrequency,cents,normalizedCorrelation,bandEnergy,aliasEnergy,naiveWave,load,dryState,held,queue,voiceStates,runSuite};
if(require.main===module)runSuite().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
