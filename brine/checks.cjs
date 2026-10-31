'use strict';
/* BRINE acceptance uses published signal-flow facts and analytic references.
 * It does not claim measured equivalence to a particular Juno. Tuning,
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
  return {scope,S:scope.BrineSchema,D:scope.createBrineDSP(),P:scope.createBrinePlaybackDSP(scope.createBrineDSP)};
}
function dryState(api,patch={}){
  const base=api.S.defaultState();
  Object.assign(base.synth,{model:'60',range:'8',saw:true,pulse:false,sub:false,subLevel:0,noiseLevel:0,pwmSource:'manual',pwmAmount:0,dcoLfo:0,hpf:0,cutoff:18000,resonance:0,envAmount:0,envPolarity:'positive',filterLfo:0,keyTrack:0,envAttack:.001,envDecay:.01,envSustain:1,envRelease:.05,ampMode:'env',ampLevel:.8,lfoRate:1,lfoDelay:0,lfoTriggerMode:'auto',chorus:'off',volume:.18,masterTune:0,modWheel:0,bendRange:2,bendFilter:0,age:0,chorusNoise:0,chorusDrive:0,chorusWidth:1,velocityAmount:0,glide:0,...patch});
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
  const filter=process.env.BRINE_QA_FILTER&&new RegExp(process.env.BRINE_QA_FILTER);
  async function check(name,fn){if(filter&&!filter.test(name))return;try{const evidence=await fn();results.push({name,evidence});console.log('PASS '+name+(evidence?' '+JSON.stringify(evidence):''));}catch(error){failures.push({name,error:error.stack||String(error)});console.error('FAIL '+name+'\n'+(error.stack||error));}}
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
  await check('Published Juno architecture exposes one DCO, six voices, one shared envelope and dedicated stereo chorus',()=>{
    const expected=['model','range','saw','pulse','sub','pwmSource','pwmAmount','dcoLfo','subLevel','noiseLevel','hpf','cutoff','resonance','envAmount','envPolarity','filterLfo','keyTrack','envAttack','envDecay','envSustain','envRelease','ampMode','ampLevel','lfoRate','lfoDelay','chorus','volume','masterTune','modWheel','bendRange','bendFilter','age','chorusNoise','chorusDrive','chorusWidth','velocityAmount','glide','lfoTriggerMode'];
    for(const key of expected){assert(Object.hasOwn(D.specifications,key),key+' DSP vocabulary');assert(S.CONTROLS.some(control=>control.key===key),key+' editable control');}
    assert.deepEqual([...D.specifications.model].sort(),['106','60']);assert.equal(new Set(S.CONTROLS.map(control=>control.key)).size,S.CONTROLS.length);assert.equal(D.voiceCount,6);assert(D.oversampling>=2);return {controls:S.CONTROLS.length,voices:D.voiceCount,oversampling:D.oversampling};
  });
  await check('Slider mappings preserve finite ranges, monotonic travel and exact numerical round trips',()=>{
    for(const control of S.CONTROLS.filter(control=>control.type==='range')){
      let previous=-Infinity;
      for(let i=0;i<=32;i++){const position=i/32,value=S.valueAt(control.key,position);assert(Number.isFinite(value),control.key+' finite');assert(value>=previous,control.key+' monotonic');assert(value>=control.min-1e-9&&value<=control.max+1e-9,control.key+' bounded');assert(Math.abs(S.position(control.key,value)-position)<1e-8,control.key+' invertible');previous=value;}
    }
    assert.equal(D.normalize({...D.defaults,model:'106',hpf:.42,pwmSource:'env'}).hpf,1/3);assert.equal(D.normalize({...D.defaults,model:'106',pwmSource:'env'}).pwmSource,'manual');assert.equal(D.normalize({...D.defaults,model:'106',chorus:'I+II'}).chorus,'off','106 has no invented third chorus mode');
    for(const [model,minRate,maxRate,maxDelay,minRelease]of [['60',.3,20,1.5,.002],['106',.1,30,3,.0015]]){const patch={...S.defaults,model},rate=S.control('lfoRate',patch),delay=S.control('lfoDelay',patch),release=S.control('envRelease',patch);assert.equal(rate.min,minRate);assert.equal(rate.max,maxRate);assert.equal(delay.max,maxDelay);assert.equal(release.min,minRelease);const normalized=D.normalize({...patch,lfoRate:100,lfoDelay:10,envRelease:0});assert.equal(normalized.lfoRate,maxRate);assert.equal(normalized.lfoDelay,maxDelay);assert.equal(normalized.envRelease,minRelease);}
    return {ranges:S.CONTROLS.filter(control=>control.type==='range').length};
  });
  await check('Independent RC-envelope probes verify timed attack, sustain and continuous release for both families',()=>{
    const evidence=[];for(const model of ['60','106']){const env=new D.Envelope(48000,{attack:.12,decay:.2,sustain:.35,release:.1,model});env.gate(true);let previous=0;for(let i=0;i<5760;i++){const value=env.process();assert(value>=previous-1e-12,'Attack rises monotonically');previous=value;}assert(env.value>.998&&env.value<=1.001);for(let i=0;i<9600;i++)env.process();assert(Math.abs(env.value-.35)<.002);env.reset();env.gate(true);for(let i=0;i<2400;i++)env.process();const releaseStart=env.value;env.gate(false);assert.equal(env.value,releaseStart);env.process();assert(env.value<=releaseStart&&env.value>releaseStart-.002);for(let i=0;i<48000;i++)env.process();assert.equal(env.value,0);evidence.push({model,releaseStart});}return evidence;
  });
  await check('A gate-mode voice keeps its shared filter/PWM envelope releasing after the audio VCA becomes silent',()=>{
    const core=new D.Core(48000,dryState(api,{ampMode:'gate',envAttack:.001,envDecay:.01,envSustain:.8,envRelease:.2}));core.noteOn({id:'gate',pitch:60,velocity:.8,source:'qa'});render(core,2400);core.noteOff({id:'gate',source:'qa'});render(core,4800);const midway=voiceStates(core).find(voice=>voice.pitch===60);assert(!midway.active&&midway.env>1e-4,'VCA closes before the long contour release');core.setPatch({ampMode:'env'});const resumed=render(core,1024);assert(voiceStates(core).find(voice=>voice.index===midway.index).active,'Physical VCA selector reopens the still-releasing contour');assert(stats(resumed).rms>1e-7,'The selected envelope tail becomes audible');core.setPatch({ampMode:'gate'});render(core,48000);const after=voiceStates(core).find(voice=>voice.index===midway.index);assert(after.env<1e-7,'Idle IR3R01 state does not freeze at a stale filter level');return {midway:midway.env,resumedRms:stats(resumed).rms,after:after.env};
  });
  await check('One continuous DCO counter phase-locks the sub divider and never resets at key-on',()=>{
    const rate=48000,dco=new D.DCO(.237),saw=new Float64Array(8192),pulse=saw.slice(),sub=saw.slice();for(let i=0;i<saw.length;i++){const io=dco.sample(1/256,.5);saw[i]=io[2];pulse[i]=io[3];sub[i]=io[4];}assert(Math.abs(crossingFrequency(saw,rate,rate/256,512)-rate/256)<1e-5);assert(Math.abs(crossingFrequency(sub,rate,rate/512,512)-rate/512)<1e-5);for(let i=512;i<sub.length-256;i++)assert(Math.abs(sub[i]+sub[i+256])<1e-10,'Sub flips polarity each DCO cycle');
    const core=new D.Core(rate,dryState(api)),before=voiceStates(core);render(core,777);const idle=voiceStates(core);assert.equal(idle.length,6);for(let i=0;i<6;i++)assert.notEqual(idle[i].phase,before[i].phase);core.noteOn({id:'phase',pitch:69,velocity:.8,source:'qa'});const started=voiceStates(core);for(let i=0;i<6;i++)assert.equal(started[i].phase,idle[i].phase,'Key-on preserves free DCO timing');return {dcoHz:rate/256,subHz:rate/512,idlePhases:idle.map(voice=>voice.phase)};
  });
  await check('Analog variation changes tone and tolerances without introducing independent VCO pitch drift',()=>{
    const rate=48000,state=dryState(api,{age:1}),core=new D.Core(rate,state);for(let i=0;i<6;i++)core.noteOn({id:'stable-'+i,pitch:69,velocity:.8,source:'source-'+i,channel:i});const before=voiceStates(core);render(core,4096);const after=voiceStates(core),wanted=(4096*440/rate)%2,evidence=[];for(let i=0;i<6;i++){const advance=(after[i].phase-before[i].phase+2)%2,error=Math.min(Math.abs(advance-wanted),Math.abs(advance-wanted+2),Math.abs(advance-wanted-2));assert(error<1e-9,'Common DCO timebase stays stable for every voice');evidence.push({index:i,advance});}return evidence;
  });
  await check('IR3109 reduced-order filter has a four-pole stopband and controlled self-oscillation near cutoff',()=>{
    const rate=48000,amplitude=frequency=>{const filter=new D.Filter(rate);filter.set(300,0);const samples=new Float32Array(16384);for(let i=0;i<samples.length;i++)samples[i]=filter.process(.0001*Math.sin(TAU*frequency*i/rate));return projection(samples,frequency,rate,4096).amplitude;},rolloffDb=20*Math.log10(amplitude(2400)/amplitude(4800));assert(rolloffDb>21&&rolloffDb<29,'Four-pole stopband slope');const filter=new D.Filter(rate);filter.set(1000,1);filter.reset(1e-5);const samples=new Float32Array(48000);for(let i=0;i<samples.length;i++)samples[i]=filter.process(0);const early=stats([samples],0,4800).rms,late=stats([samples],24000).rms;assert(late>1e-4&&late>early);assert(stats([samples]).peak<4);const measured=peakFrequency(spectrum(samples,{from:12000,size:32768}),rate,1000,400);assert(measured>700&&measured<1300,'Self-oscillation lies near nominal cutoff, without asserting calibrated keyboard tracking');return {rolloffDb,early,late,frequency:measured};
  });
  await check('Analog mixer noise keeps approximately constant audio-band power across output sample rates',()=>{
    const evidence=[];for(const rate of [48000,96000]){const value=held(api,{saw:false,pulse:false,sub:false,noiseLevel:.15,cutoff:1000,envAmount:0,resonance:0,age:0,ampMode:'gate',chorus:'off'},60,{rate,frames:rate*2});const measured=stats(value.output,Math.round(rate*.5));assert.equal(measured.nonfinite,0);assert(measured.rms>1e-6);evidence.push({rate,rms:measured.rms});}const differenceDb=20*Math.log10(evidence[1].rms/evidence[0].rms);assert(Math.abs(differenceDb)<.65,'White-noise physical PSD must not drop by3dB at doubled sample rate');return {rates:evidence,differenceDb,limitation:'Finite deterministic noise realizations, not a measured transistor-noise spectrum.'};
  });
  await check('The shared main LFO keeps its rate while AUTO delay starts only at the beginning of a legato section',()=>{
    const rate=48000,frames=4096,evidence=[];for(const lfoRate of [.3,20]){const state=dryState(api,{lfoRate}),idle=new D.Core(rate,state),poly=new D.Core(rate,state),start=idle.getMeters().lfoPhase;for(const pitch of [48,52,55,60,64,67])poly.noteOn({id:'lfo-'+pitch,pitch,velocity:.8,source:'qa'});render(idle,frames);render(poly,frames);const actual=idle.getMeters().lfoPhase,wanted=(start+frames*lfoRate/rate)%1;assert(Math.abs(actual-wanted)<1e-10);assert.equal(actual,poly.getMeters().lfoPhase);evidence.push({lfoRate,phase:actual});}
    const core=new D.Core(rate,dryState(api,{lfoDelay:.2,lfoTriggerMode:'auto'}));core.noteOn({id:'first',pitch:60,velocity:.8,source:'qa'});render(core,4800);const half=core.getMeters().lfoGain;assert(half>.45&&half<.55);core.noteOn({id:'legato',pitch:67,velocity:.8,source:'qa'});render(core,4800);assert(core.getMeters().lfoGain>.99,'Additional legato keys cannot restart the shared delay');core.cancelNotes({source:'qa'});core.noteOn({id:'new-section',pitch:72,velocity:.8,source:'qa'});render(core,1);assert(core.getMeters().lfoGain<.001,'A new non-legato section starts its own delay');return {rates:evidence,half};
  });
  await check('MANUAL LFO trigger honors delay while held, switches off on release and remains independent of keyboard gates',()=>{
    const rate=48000,core=new D.Core(rate,dryState(api,{dcoLfo:.5,lfoDelay:.2,lfoTriggerMode:'manual'}));render(core,10000);const phase=core.getMeters().lfoPhase;core.modWheel({value:1});assert.equal(core.getMeters().lfoPhase,phase,'Triggering depth cannot reset the free LFO oscillator');render(core,1);assert(core.getMeters().lfoManualGain<.001);render(core,4800);const half=core.getMeters().lfoManualGain;assert(half>.45&&half<.55);render(core,4800);assert(core.getMeters().lfoManualGain>.99);core.noteOn({id:'late-key',pitch:69,velocity:.8,source:'qa'});render(core,1);assert(core.getMeters().lfoManualGain>.99,'An already-held manual trigger is not restarted by a new key');core.modWheel({value:0});const before=voiceStates(core).find(voice=>voice.gate).phase;render(core,1);const after=voiceStates(core).find(voice=>voice.gate).phase,advance=(after-before+2)%2;assert.equal(core.getMeters().lfoManualGain,0);assert(Math.abs(advance-440/rate)<1e-9,'Manual trigger release removes pitch modulation immediately');return {half,advance};
  });
  await check('Actual 256-stage BBD clocks follow the documented chorus periods and opposite modulation directions',()=>{
    const rate=48000,evidence=[];let normalSpan=0,bothSpan=0;
    for(const [chorus,wantedRate]of [['I',.5],['II',1/1.2],['I+II',1]]){const unit=new D.Chorus(rate,{...D.defaults,chorus,chorusNoise:0,chorusDrive:0,age:0});unit.reset();const start=unit.getMeters().phase;for(let i=0;i<4096;i++)unit.process(0);const current=unit.getMeters();assert.equal(current.stages,256);assert.equal(current.lfoHz,wantedRate);assert(Math.abs(current.phase-(start+4096*wantedRate/rate)%1)<1e-10);
      const clocks=[];for(const phase of [0,.25,.5,.75]){unit.phase=phase;unit.process(0);const m=unit.getMeters();assert(m.clockHzL>0&&m.clockHzR>0);assert(Math.abs(m.delayMsL*m.clockHzL-128000)<1e-6,'256/(2clock) gives nominal delay');assert(Math.abs(m.delayMsR*m.clockHzR-128000)<1e-6);clocks.push([m.clockHzL,m.clockHzR]);}const left=clocks.map(value=>value[0]),right=clocks.map(value=>value[1]),span=Math.max(...left)-Math.min(...left);for(let i=0;i<clocks.length;i++)assert(Math.abs(left[i]+right[i]-left[0]-right[0])<1e-8,'Clock controls move oppositely around one center');if(chorus==='I')normalSpan=span;if(chorus==='I+II')bothSpan=span;evidence.push({chorus,rate:current.lfoHz,span,clocks});}
    assert(Math.abs(bothSpan/normalSpan-.08)<1e-10,'Both mode uses documented small 1.6Vpp versus 20Vpp sweep');return {modes:evidence,bothDepthRatio:bothSpan/normalSpan};
  });
  await check('BBD processing retains a direct dry path and filters the wet reconstruction rather than the whole instrument',()=>{
    const rate=48000,off=new D.Chorus(rate,{...D.defaults,chorus:'off',chorusNoise:0});off.reset();for(let i=0;i<2048;i++){const input=Math.sin(i*1.111)+.2*Math.sin(i*2.01),io=off.process(input);assert.equal(io[1],input);assert.equal(io[2],input);}
    const wetAmplitude=frequency=>{const unit=new D.Chorus(rate,{...D.defaults,chorus:'I',chorusNoise:0,chorusDrive:0,age:0});unit.reset();const output=new Float32Array(16384);for(let i=0;i<output.length;i++){unit.phase=.25;const input=.01*Math.sin(TAU*frequency*i/rate),io=unit.process(input);output[i]=io[1]-input;}return projection(output,frequency,rate,4096).amplitude;},low=wetAmplitude(220),high=wetAmplitude(12000);assert(low>1e-4);assert(high<low*.7,'The wet BBD path has its own audio bandwidth limit');return {lowWet:low,highWet:high,ratio:high/low};
  });
  await check('PCM DCO tuning follows equal temperament and the 16/8/4 octave selectors at every tested rate',()=>{
    const evidence=[];
    for(const rate of [44100,48000,96000])for(const pitch of [45,69,81]){
      const value=held(api,{},pitch,{rate,frames:Math.round(rate*.55)}),wanted=440*2**((pitch-69)/12),measured=crossingFrequency(value.output[0],rate,wanted,Math.round(rate*.1)),error=cents(measured,wanted);assert(Math.abs(error)<1,'Equal-temperament DCO '+pitch+'/'+rate);evidence.push({rate,pitch,measured,cents:error});
    }
    for(const [range,multiple]of [['16',.5],['8',1],['4',2]]){const value=held(api,{range},69,{frames:24000}),measured=crossingFrequency(value.output[0],48000,440*multiple,4800);assert(Math.abs(cents(measured,440*multiple))<1);}
    for(const masterTune of [-50,50]){const value=held(api,{masterTune},69,{frames:24000}),wanted=440*2**(masterTune/1200),measured=crossingFrequency(value.output[0],48000,wanted,4800);assert(Math.abs(cents(measured,wanted))<1);}
    return evidence;
  });
  await check('The sub oscillator is exactly one octave below its DCO and retains square-wave harmonic structure',()=>{
    const rate=48000,pitch=69,wanted=220,value=held(api,{saw:false,pulse:false,sub:true,subLevel:1},pitch,{frames:48000});audible(value.output,'Sub oscillator');
    const frequency=crossingFrequency(value.output[0],rate,wanted,4800),fundamental=projection(value.output[0],wanted,rate,12000).amplitude,even=projection(value.output[0],wanted*2,rate,12000).amplitude,third=projection(value.output[0],wanted*3,rate,12000).amplitude;
    assert(Math.abs(cents(frequency,wanted))<1);assert(even<fundamental*.06,'Square sub has little even-harmonic energy');assert(third>fundamental*.1,'Square sub retains its third harmonic');return {frequency,evenRatio:even/fundamental,thirdRatio:third/fundamental};
  });
  await check('Saw, pulse and sub switches are independent audible ingredients rather than a wave menu',()=>{
    const waveforms={};
    for(const [name,patch]of [['saw',{saw:true,pulse:false,sub:false}],['pulse',{saw:false,pulse:true,sub:false}],['sub',{saw:false,pulse:false,sub:true,subLevel:1}],['combined',{saw:true,pulse:true,sub:true,subLevel:.45}]]){const value=held(api,patch);audible(value.output,name);waveforms[name]=digest(value.output);}
    assert.equal(new Set(Object.values(waveforms)).size,4);const muted=held(api,{saw:false,pulse:false,sub:false,noiseLevel:0});assert(stats(muted.output).peak<1e-8,'No selected source remains inaudible');return waveforms;
  });
  await check('Manual pulse width changes duty harmonics while leaving the DCO pitch unchanged',()=>{
    const common={saw:false,pulse:true,sub:false,pwmSource:'manual'},square=held(api,{...common,pwmAmount:0},69,{frames:48000}),narrow=held(api,{...common,pwmAmount:.7},69,{frames:48000});
    const harmonic=value=>{const f=projection(value.output[0],440,48000,12000).amplitude,s=projection(value.output[0],880,48000,12000).amplitude;return s/f;},squareEven=harmonic(square),narrowEven=harmonic(narrow);
    assert(squareEven<.06,'MAN minimum is the centered square');assert(narrowEven>squareEven+.1,'Manual PWM adds even harmonics');for(const value of [square,narrow])assert(Math.abs(cents(crossingFrequency(value.output[0],48000,440,4800),440))<1);return {squareEven,narrowEven};
  });
  await check('LFO and envelope PWM routes alter pulses without silently applying pitch modulation',()=>{
    const common={saw:false,pulse:true,sub:false,pwmAmount:.55,dcoLfo:0,filterLfo:0,lfoRate:3,ampMode:'gate',envAttack:.2,envDecay:.3,envSustain:.4},manual=held(api,{...common,pwmSource:'manual'},60,{frames:24000}),lfo=held(api,{...common,pwmSource:'lfo'},60,{frames:24000}),env=held(api,{...common,pwmSource:'env'},60,{frames:24000});
    assert(difference(manual.output,lfo.output).rms>1e-4);assert(difference(manual.output,env.output).rms>1e-4);assert(difference(lfo.output,env.output).rms>1e-4);
    const wanted=440*2**((60-69)/12);for(const value of [manual,lfo,env])assert(Math.abs(cents(crossingFrequency(value.output[0],48000,wanted,4800),wanted))<2,'PWM does not detune the oscillator');return {lfoDifference:difference(manual.output,lfo.output).rms,envelopeDifference:difference(manual.output,env.output).rms};
  });
  await check('The single contour controls ENV amplitude while GATE holds an organ-like level independently',()=>{
    const common={envAttack:.2,envDecay:.1,envSustain:0,envRelease:.1,envAmount:0},env=held(api,{...common,ampMode:'env'},69,{frames:48000}),gate=held(api,{...common,ampMode:'gate'},69,{frames:48000});
    assert(stats(env.output,32000).rms<stats(gate.output,32000).rms*.01,'ENV sustain zero closes the amplifier');assert(stats(gate.output,32000).rms>1e-4,'GATE stays open while held');
    const core=new D.Core(48000,dryState(api,{...common,envSustain:.65,ampMode:'env'}));core.noteOn({id:'release',pitch:69,velocity:.8,source:'qa'});render(core,2400);const before=voiceStates(core).find(voice=>voice.gate);core.noteOff({id:'release',source:'qa'});const after=voiceStates(core).find(voice=>voice.index===before.index);assert.equal(after.level,before.level,'Key-up preserves current contour level');render(core,48000);assert(!voiceStates(core).some(voice=>voice.active));return {envelopeLate:stats(env.output,32000).rms,gateLate:stats(gate.output,32000).rms};
  });
  await check('Positive and negative envelope polarity open and close the VCF without altering note pitch',()=>{
    const common={ampMode:'gate',cutoff:900,envAmount:.65,envAttack:.001,envDecay:.01,envSustain:1},positive=held(api,{...common,envPolarity:'positive'},57,{frames:32000}),negative=held(api,{...common,envPolarity:'negative'},57,{frames:32000});
    const a=bandEnergy(spectrum(positive.output[0],{from:8192,size:16384}),48000,1800,8000),b=bandEnergy(spectrum(negative.output[0],{from:8192,size:16384}),48000,1800,8000);assert(a>b*10,'Positive filter contour has more upper harmonics');return {positiveHighBand:a,negativeHighBand:b};
  });
  await check('Classic keyboard mode ignores velocity and the explicit modern response remains monotonic',()=>{
    const low=held(api,{velocityAmount:0,ampLevel:.1},69,{velocity:.2,frames:4096}),high=held(api,{velocityAmount:0,ampLevel:.1},69,{velocity:.8,frames:4096});assert.equal(digest(low.output),digest(high.output),'Original DCO keyboard has no velocity response');
    const sensitiveLow=held(api,{velocityAmount:1,ampLevel:.1},69,{velocity:.2,frames:4096}),sensitiveHigh=held(api,{velocityAmount:1,ampLevel:.1},69,{velocity:.8,frames:4096}),ratio=stats(sensitiveHigh.output).rms/stats(sensitiveLow.output).rms;assert(ratio>3.9&&ratio<4.1);return {ratio};
  });
  await check('Six bounded synthesis voices retain the last six held keys and reuse available release tails first',()=>{
    const state=dryState(api,{envRelease:12}),core=new D.Core(48000,state),notes=[48,52,55,60,64,67];for(const pitch of notes)core.noteOn({id:'voice-'+pitch,pitch,velocity:.8,source:'qa',channel:0});render(core,1024);
    assert.equal(voiceStates(core).length,6);assert.equal(voiceStates(core).filter(voice=>voice.gate).length,6);core.noteOn({id:'seventh',pitch:79,velocity:.8,source:'qa',channel:0});const pitches=voiceStates(core).filter(voice=>voice.gate).map(voice=>voice.pitch);assert(!pitches.includes(48)&&pitches.includes(79),'Seventh held key replaces oldest held assignment');
    const tail=new D.Core(48000,state);for(const pitch of notes)tail.noteOn({id:'tail-'+pitch,pitch,velocity:.8,source:'qa',channel:0});render(tail,1024);tail.noteOff({id:'tail-67',source:'qa',channel:0});const released=voiceStates(tail).find(voice=>voice.pitch===67);assert(!released.gate&&released.active);tail.noteOn({id:'next',pitch:84,velocity:.8,source:'qa',channel:0});const after=voiceStates(tail),held=after.filter(voice=>voice.gate).map(voice=>voice.pitch);for(const pitch of [48,52,55,60,64,84])assert(held.includes(pitch));assert.equal(after.find(voice=>voice.pitch===84).index,released.index);assert.equal(tail.getMeters().stolen,0,'A release-tail replacement is not stealing a held key');return {pitches,held};
  });
  await check('Pedals, source cancellation and explicit-token repitch cannot retain or release unrelated voices',()=>{
    const core=new D.Core(48000,dryState(api));core.noteOn({id:'a',pitch:60,velocity:.8,source:'a',channel:0});core.noteOn({id:'b',pitch:67,velocity:.8,source:'b',channel:1});render(core,128);core.sustain({down:true,source:'a',channel:0});core.noteOff({id:'a',source:'a',channel:0});core.noteOff({id:'b',source:'b',channel:1});assert(voiceStates(core).find(voice=>voice.pitch===60).gate);assert(!voiceStates(core).find(voice=>voice.pitch===67).gate);core.cancelNotes({source:'a'});assert(!voiceStates(core).some(voice=>voice.gate));
    const other=new D.Core(48000,dryState(api));other.noteOn({id:'token',pitch:60,velocity:.8,source:'same',channel:0});other.noteOn({id:'keep',pitch:72,velocity:.8,source:'other',channel:1});other.noteOn({id:'token',pitch:67,velocity:.8,source:'same',channel:0});assert(!voiceStates(other).some(voice=>voice.pitch===60&&voice.gate));other.noteOff({id:'token',source:'same',channel:0});assert.deepEqual(voiceStates(other).filter(voice=>voice.gate).map(voice=>voice.pitch),[72]);return {survivingPitch:72};
  });
  await check('All original sound recipes have unique names, complete portable patches and audible six-voice output',()=>{
    assert(Array.isArray(scope.BrinePresets)&&scope.BrinePresets.length>=40);const ids=new Set(),names=new Set(),evidence=[];
    for(const preset of scope.BrinePresets){assert(!ids.has(preset.id)&&!names.has(preset.name));ids.add(preset.id);names.add(preset.name);const state=S.defaultState();state.synth=copy(preset.synth);assert.equal(S.serialize(S.parseProject(S.serialize(state))),S.serialize(state));const core=new D.Core(48000,state);for(const pitch of [48,52,55,60,64,67])core.noteOn({id:'preset-'+pitch,pitch,velocity:.8,source:'qa',channel:0});const value=stats(render(core,8192));assert.equal(value.nonfinite,0,preset.name+' finite');assert(value.peak>1e-6,preset.name+' audible');assert(value.peak<4,preset.name+' bounded');evidence.push({id:preset.id,peak:value.peak,rms:value.rms});}
    return {count:evidence.length,recipes:evidence};
  });
  await check('Age, shared modulation, PWM and stereo chorus clocks repeat exactly across irregular blocks and reset',()=>{
    const state=dryState(api,{saw:true,pulse:true,sub:true,subLevel:.5,pwmSource:'lfo',pwmAmount:.67,dcoLfo:.13,filterLfo:.21,cutoff:2300,resonance:.59,age:.8,lfoRate:8,chorus:'I+II',chorusNoise:.2,chorusDrive:.7}),a=new D.Core(48000,state),b=new D.Core(48000,state),start=core=>{for(const pitch of [48,52,55,60,64,67])core.noteOn({id:'clock-'+pitch,pitch,velocity:.8,source:'qa',channel:0});};start(a);start(b);const x=render(a,12288,[128]),y=render(b,12288,[1,17,137,251,32]);assert.equal(digest(x),digest(y));a.reset();start(a);assert.equal(digest(render(a,12288,[251,1,17])),digest(x));return {sha256:digest(x)};
  });
  await check('The bandlimited DCO and output reconstruction reduce in-band folding relative to an unsmoothed sampled ramp',()=>{
    const rate=48000,pitch=101,wanted=440*2**((pitch-69)/12),frames=73728,actual=held(api,{cutoff:20000},pitch,{frames}),reference=naiveWave(frames,rate,wanted),a=aliasEnergy(spectrum(actual.output[0],{from:8192,size:65536}),rate,wanted),b=aliasEnergy(spectrum(reference,{from:8192,size:65536}),rate,wanted),improvementDb=b.relativeDb-a.relativeDb;assert(improvementDb>12,'Actual pipeline reduces low-band alias energy');return {wanted,analysisBandHz:8000,actualRelativeDb:a.relativeDb,naiveRelativeDb:b.relativeDb,improvementDb,limitation:'Analytic software ramp reference, not zero aliasing or measured hardware equivalence.'};
  });
  await check('Supported rate endpoints, extreme cutoff/resonance/PWM and all six voices stay finite and bounded',()=>{
    const evidence=[];for(const rate of [8000,44100,48000,96000])for(const pitch of [0,127])for(const model of ['60','106']){
      const state=dryState(api,{model,saw:true,pulse:true,sub:true,subLevel:1,noiseLevel:1,pwmSource:model==='60'?'env':'lfo',pwmAmount:1,cutoff:20000,resonance:1,envAmount:1,keyTrack:1,filterLfo:1,dcoLfo:1,age:1,lfoRate:20,chorus:'I+II',chorusNoise:1,chorusDrive:1,chorusWidth:1,volume:1}),core=new D.Core(rate,state);for(let i=0;i<6;i++)core.noteOn({id:'extreme-'+i,pitch:Math.max(0,Math.min(127,pitch+i)),velocity:1,source:'qa',channel:0});const value=stats(render(core,2048));assert.equal(value.nonfinite,0);assert(value.peak<4);assert.equal(voiceStates(core).length,6);assert(core.getMeters().voices<=6);evidence.push({rate,pitch,model,peak:value.peak});
    }return evidence;
  });
  await check('The dry analog voice bus is mono and Chorus I/II produce genuine distinct stereo movement',()=>{
    const patch={saw:true,pulse:true,sub:true,subLevel:.3,cutoff:4200,envSustain:1,ampMode:'gate',chorusNoise:0,chorusDrive:.25},off=held(api,{...patch,chorus:'off'},60,{frames:48000}),a=held(api,{...patch,chorus:'I'},60,{frames:48000}),b=held(api,{...patch,chorus:'II'},60,{frames:48000});
    assert.equal(difference([off.output[0]],[off.output[1]]).maximum,0,'Chorus off has no invented stereo voice spread');for(const [name,value]of [['I',a],['II',b]]){audible(value.output,'Chorus '+name);assert(difference([value.output[0]],[value.output[1]],4096).rms>1e-4,'Chorus '+name+' has separate moving wet channels');}
    const ar=stats(a.output,4096).rms,br=stats(b.output,4096).rms,an=a.output.map(channel=>Float32Array.from(channel,x=>x/ar)),bn=b.output.map(channel=>Float32Array.from(channel,x=>x/br));assert(difference(an,bn,4096).rms>1e-3,'Chorus modes differ beyond gain');return {off:stats(off.output),I:stats(a.output),II:stats(b.output),stereoI:difference([a.output[0]],[a.output[1]],4096).rms};
  });
  await check('BBD width and optional noise are functional without reversing the low-frequency stereo wet polarity',()=>{
    const mono=held(api,{chorus:'I',chorusWidth:0,chorusNoise:0},60,{frames:16384});assert.equal(difference([mono.output[0]],[mono.output[1]]).maximum,0,'Modern width zero folds the stereo signal to mono');
    const low=held(api,{chorus:'I',chorusWidth:1,chorusNoise:0,cutoff:100,ampMode:'gate'},33,{frames:48000}),left=low.output[0],right=low.output[1];let xy=0,xx=0,yy=0;for(let i=8192;i<left.length;i++){xy+=left[i]*right[i];xx+=left[i]*left[i];yy+=right[i]*right[i];}const correlation=xy/Math.sqrt(xx*yy);assert(correlation>.5,'Low-frequency channels retain the common wet polarity shown by the chorus circuit');
    const silent=new D.Core(48000,dryState(api,{saw:false,pulse:false,sub:false,chorus:'I',chorusNoise:0})),noisy=new D.Core(48000,dryState(api,{saw:false,pulse:false,sub:false,chorus:'I',chorusNoise:.7}));for(const core of [silent,noisy]){core.noteOn({id:'noise-enable',pitch:60,velocity:.8,source:'qa'});core.noteOff({id:'noise-enable',source:'qa'});render(core,4096);}const silence=stats(render(silent,8192)),noise=stats(render(noisy,8192));assert(silence.peak<1e-8);assert(noise.rms>1e-8&&noise.peak<.1,'Optional BBD floor is audible only at small calibrated-model levels');return {lowFrequencyCorrelation:correlation,noiseRms:noise.rms};
  });
  await check('Both HPF families expose four circuit positions and only 106 position zero boosts bass',()=>{
    const evidence=[];for(const model of ['60','106']){
      const values=[0,.13,.2,.45,.62,.8,1].map(hpf=>D.normalize({...D.defaults,model,hpf}).hpf);assert(values.every(value=>[0,1/3,2/3,1].includes(value)),'Panel maps onto four switched circuit positions');
      const ratio=pitch=>{const common={model,ampMode:'gate',envAmount:0},zero=held(api,{...common,hpf:0},pitch,{frames:24000}),flat=held(api,{...common,hpf:1/3},pitch,{frames:24000});return stats(zero.output,4800).rms/stats(flat.output,4800).rms;},low=ratio(33),high=ratio(93);
      if(model==='106')assert(low>high*1.25,'106 minimum adds bass relative to its flat position');else assert(low>high*1.5,'60 first high-pass position removes low energy relative to bypass');evidence.push({model,low,high,positions:values});
    }return evidence;
  });
  await check('Keyboard arpeggiation starts at its exact input frame and DOWN sees the complete simultaneous chord',()=>{
    const state=dryState(api);state.arp={enabled:true,mode:'down',range:2,rate:10,hold:false};const core=new P.Core(48000,state),start=37;
    for(const pitch of [60,64,67])core.enqueue('manualOn',{frame:start,id:'arp-'+pitch,pitch,velocity:.8,source:'keys',channel:0});const before=render(core,start);assert(before.every(channel=>channel.every(value=>value===0)));
    const notes=[];for(let i=0;i<6;i++){const frame=start+i*4800;render(core,frame+1-core.frame);const gated=voiceStates(core).filter(voice=>voice.gate);assert.equal(gated.length,1);notes.push(gated[0].pitch);}
    assert.deepEqual(notes,[79,76,72,67,64,60]);return {firstFrame:start,notes};
  });
  await check('UP-DOWN arp avoids repeated endpoints and fixed-origin timing does not accumulate rate rounding',()=>{
    const state=dryState(api);state.arp={enabled:true,mode:'updown',range:1,rate:7.3,hold:false};const core=new P.Core(48000,state),start=19;
    for(const pitch of [60,64,67])core.enqueue('manualOn',{frame:start,id:'updown-'+pitch,pitch,velocity:.8,source:'keys',channel:0});const notes=[];
    for(let i=0;i<10;i++){const frame=Math.round(start+i*48000/7.3);render(core,frame+1-core.frame);const active=voiceStates(core).filter(voice=>voice.gate);assert.equal(active.length,1);notes.push(active[0].pitch);}
    assert.deepEqual(notes,[60,64,67,64,60,64,67,64,60,64]);return {notes,lastFrame:Math.round(start+9*48000/7.3)};
  });
  await check('Arp gate ownership overrides its pedal without canceling a direct note on the same source and channel',()=>{
    const state=dryState(api);state.arp={enabled:true,mode:'up',range:1,rate:10,hold:false};const core=new P.Core(48000,state);
    core.enqueue('on',{frame:0,id:'direct',pitch:84,velocity:.8,source:'keys',channel:0,durationFrames:16000});core.enqueue('sustain',{frame:0,down:true,source:'keys',channel:0});core.enqueue('manualOn',{frame:0,id:'arp-key',pitch:60,velocity:.8,source:'keys',channel:0});render(core,2600);
    const midway=voiceStates(core).filter(voice=>voice.gate).map(voice=>voice.pitch);assert.deepEqual(midway,[84],'Half-period key gate closes only generated arp ownership, even under sustain');core.enqueue('cancel',{frame:core.frame,source:'keys'});render(core,1);assert(!voiceStates(core).some(voice=>voice.gate));return {midway};
  });
  await check('Written patterns and explicitly scheduled notes bypass the keyboard arpeggiator and HOLD cancels safely',()=>{
    const state=dryState(api);state.arp={enabled:true,mode:'down',range:3,rate:10,hold:true};const core=new P.Core(48000,state);
    for(const pitch of [60,64,67])core.enqueue('on',{frame:0,id:'written-'+pitch,pitch,velocity:.8,source:'written',channel:0,durationFrames:12000});render(core,1);assert.deepEqual(voiceStates(core).filter(voice=>voice.gate).map(voice=>voice.pitch).sort((a,b)=>a-b),[60,64,67],'Incoming arrangement notes remain a chord');
    const arp=new P.Core(48000,{...state,arp:{...state.arp,mode:'up',range:1}});arp.enqueue('manualOn',{frame:0,id:'held',pitch:72,velocity:.8,source:'keys',channel:0});arp.enqueue('manualOff',{frame:200,id:'held',pitch:72,source:'keys',channel:0});render(arp,4900);assert(voiceStates(arp).some(voice=>voice.pitch===72&&voice.gate),'HOLD continues the captured keyboard part');arp.enqueue('cancel',{frame:arp.frame,source:'keys'});render(arp,1);assert(!voiceStates(arp).some(voice=>voice.gate),'Source cancellation clears held arp notes');return {writtenChord:[60,64,67]};
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
  await check('Reusing a scheduled note token invalidates its obsolete duration off without cutting the replacement',()=>{
    const state=dryState(api),core=new P.Core(48000,state);core.enqueue('on',{frame:0,id:'token',pitch:60,velocity:.8,source:'same',channel:0,durationFrames:100});core.enqueue('on',{frame:50,id:'token',pitch:67,velocity:.8,source:'same',channel:0,durationFrames:200});core.enqueue('on',{frame:0,id:'other',pitch:72,velocity:.8,source:'other',channel:1,durationFrames:1000});render(core,150);
    const midway=voiceStates(core).filter(voice=>voice.gate).map(voice=>voice.pitch).sort((a,b)=>a-b);assert.deepEqual(midway,[67,72],'Old duration off cannot release reused token');render(core,101);assert.deepEqual(voiceStates(core).filter(voice=>voice.gate).map(voice=>voice.pitch),[72],'Replacement releases on its own exact duration');return {midway};
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
  console.log(results.length+' BRINE architecture, signal and scheduling groups passed.');
  if(process.env.BRINE_QA_REPORT)fs.writeFileSync(process.env.BRINE_QA_REPORT,JSON.stringify({results,failures,limitations:['Architecture and analytic references are not measurements of a physical Juno.','Render parity checks use one deterministic software implementation at an identical sample rate and event clock.']},null,2)+'\n');
  if(failures.length)throw Error(failures.length+' BRINE acceptance groups failed.');return results;
}
module.exports={stats,difference,digest,render,projection,spectrum,peakFrequency,crossingFrequency,cents,normalizedCorrelation,bandEnergy,aliasEnergy,naiveWave,load,dryState,held,queue,voiceStates,runSuite};
if(require.main===module)runSuite().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
