'use strict';
/* TIN CAN: audio contracts for the production self-contained DSP.
 * node loom/lofi-checks.cjs [--bench]
 * Timing is informational and must run without another benchmark or Chromium.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto,createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const directory=__dirname,root=path.resolve(directory,'..');
const BASELINE='9001236f22d8fb6d5310da9cba028e988479c9bf';
const catalogNames=['vocal','utility','filter','creative','preamp','tape','char','lofi'];
const dspNames=['vocal','utility','filter','creative','preamp','tape','char','lofi'];
const modules=[...catalogNames.map(n=>n+'-catalog.js'),'effects-catalog.js',...dspNames.map(n=>n+'-dsp.js'),'broiler-pedals.js','compressor-dsp.js','effects.js'];
function source(name,ref){if(ref)return execFileSync('git',['show',ref+':loom/'+name],{cwd:root,maxBuffer:12*1024*1024,stdio:['ignore','pipe','pipe']}).toString();return fs.readFileSync(path.join(directory,name),'utf8');}
function load(ref){
 const scope={console,performance,Date,crypto:webcrypto,Blob,AbortController,DOMException,setTimeout,clearTimeout,TextEncoder,TextDecoder,structuredClone};scope.window=scope;scope.globalThis=scope;scope.atob=v=>Buffer.from(v,'base64').toString('binary');scope.btoa=v=>Buffer.from(v,'binary').toString('base64');
 for(const name of modules){if(ref&&name.startsWith('lofi-'))continue;Function('window','globalThis','crypto','atob','btoa',source(name,ref)+'\n//# sourceURL=tin-can-'+name)(scope,scope,scope.crypto,scope.atob,scope.btoa);}
 const E=scope.createLoomEffectsDSP(scope.createLoomVocalDSP,scope.createLoomUtilityDSP,scope.createLoomFilterDSP,scope.createLoomCreativeDSP,scope.createLoomBroilerPedalsDSP,scope.createLoomCompressorDSP,scope.createLoomPreampDSP,scope.createLoomTapeDSP,scope.createLoomCharDSP,scope.createLoomLoFiDSP);
 return{scope,E,F:scope.createLoomLoFiDSP?.(),definition:scope.LoomEffectsCatalog.find(e=>e.id==='tinpan')};
}
const plain=v=>JSON.parse(JSON.stringify(v));
const hash=channels=>{const h=createHash('sha256');for(const c of channels)h.update(Buffer.from(c.buffer,c.byteOffset,c.byteLength));return h.digest('hex');};
function signal(frames,rate=48000,gain=.1){return[0,1].map(c=>Float32Array.from({length:frames},(_,i)=>gain*(Math.sin(2*Math.PI*(c?229:137)*i/rate)+.27*Math.sin(2*Math.PI*(c?2371:1723)*i/rate))));}
function tone(hz,frames=24000,rate=48000,gain=.025){const a=Float32Array.from({length:frames},(_,i)=>gain*Math.sin(2*Math.PI*hz*i/rate));return[a,a.slice()];}
function feed(fx,input,blocks=137,events=[]){
 const audio=input.map(a=>a.slice()),sizes=Array.isArray(blocks)?blocks:[blocks];let at=0,step=0,event=0;
 while(at<audio[0].length){while(event<events.length&&events[event].at===at){const item=events[event++];if(item.reset)fx.reset();if(item.patch)fx.setParams(item.patch);}
 const end=Math.min(audio[0].length,at+sizes[step++%sizes.length],events[event]?.at??Infinity);fx.process(audio[0].subarray(at,end),audio[1].subarray(at,end),{tempo:117,beat:at/48000*117/60,playing:true});at=end;}
 return audio;
}
function rms(a,start=0,end=a.length){let sum=0;for(let i=start;i<end;i++)sum+=a[i]*a[i];return Math.sqrt(sum/Math.max(1,end-start));}
function projection(a,hz,rate=48000,start=Math.floor(a.length/2)){let x=0,y=0;for(let i=start;i<a.length;i++){const t=2*Math.PI*hz*i/rate;x+=a[i]*Math.cos(t);y+=a[i]*Math.sin(t);}return 2*Math.hypot(x,y)/Math.max(1,a.length-start);}
function difference(a,b){assert.equal(a.length,b.length);let max=0,sum=0;for(let i=0;i<a.length;i++){assert(Number.isFinite(a[i])&&Number.isFinite(b[i]));const d=a[i]-b[i];max=Math.max(max,Math.abs(d));sum+=d*d;}return{max,rms:Math.sqrt(sum/Math.max(1,a.length))};}
function finite(audio,limit=8){for(const a of audio)for(const v of a)assert(Number.isFinite(v)&&Math.abs(v)<=limit,'Non-finite or unbounded audio: '+v);}
module.exports={BASELINE,load,source,plain,hash,signal,tone,feed,rms,projection,difference,finite};
async function run(){
 const release=load(),{F,E,definition}=release,evidence={},passed=[];const check=async(name,test)=>{if(process.env.LOFI_QA_FILTER&&!new RegExp(process.env.LOFI_QA_FILTER).test(name))return;await test();passed.push(name);console.log('PASS '+name);};
 assert(F&&definition,'The registered TIN CAN catalog and DSP must load');const models=F.specifications.model;
 await check('Catalog and self-contained factory agree on all models, defaults and parameter limits',()=>{
  assert.equal(definition.id,'tinpan');assert.equal(definition.name,'TIN CAN');assert.equal(models.length,12);assert.equal(new Set(models).size,12);assert.deepEqual(plain(F.normalize({})),plain(definition.defaults));assert.deepEqual(plain(E.normalize('tinpan',{})),plain(definition.defaults));
  assert.deepEqual(plain(F.specifications.model).sort(),plain(definition.models.map(m=>m.id)).sort());
  for(const p of definition.params){const rule=F.specifications[p.key];assert(rule,p.key);assert.equal(definition.defaults[p.key],p.default,p.key);if(p.type==='range')assert.deepEqual(plain(rule),[p.min,p.max,p.default],p.key);else assert.deepEqual(plain(rule).sort(),plain(p.options.map(o=>o.value)).sort(),p.key);}
  const dirty={model:'missing',drive:NaN,tone:Infinity,wear:'1',output:-Infinity,bypass:'true'},before=plain(dirty),normalized=F.normalize(dirty);assert.deepEqual(plain(dirty),before);assert.deepEqual(plain(normalized),plain(definition.defaults));
  const isolated=vm.runInNewContext('('+release.scope.createLoomLoFiDSP.toString()+')')();assert.deepEqual(plain(isolated.normalize({})),plain(F.normalize({})));for(const model of models)assert.deepEqual(feed(isolated.create(48000,{model}),signal(2048)),feed(F.create(48000,{model}),signal(2048)),model+' serialized standalone factory');
 });
 await check('Every microphone is causal and quiet with noise controls off',()=>{
  for(const model of models){const fx=F.create(48000,{model,noise:0,crackle:0,hum:0});const input=[new Float32Array(3072),new Float32Array(3072)];input[0][511]=.25;input[1][511]=-.2;const audio=feed(fx,input,[17,128,251]);assert(audio.every(a=>a.subarray(0,511).every(v=>v===0)),model+' pre-ringing or noise');finite(audio);assert(rms(audio[0],511)>.00001,model+' impulse response silent');}
 });
 await check('Old analog telephones reject bass and treble around their speech band',()=>{
  const report={};for(const model of ['carbon-30','rotary-50','pushbutton-80','payphone']){const response={};for(const hz of[60,1000,9000])response[hz]=rms(feed(F.create(48000,{model,drive:0,wear:0,compression:0,resonance:0,digital:'off',distance:0}),tone(hz))[0],12000);assert(response[60]<response[1000]*.2,model+' missing bass rejection '+JSON.stringify(response));assert(response[9000]<response[1000]*.13,model+' missing treble rejection '+JSON.stringify(response));report[model]=response;}evidence.telephoneBands=report;
 });
 await check('Mic transducers and receiver models produce distinct level-dependent tone',()=>{
  const input=signal(16384),outputs=models.map(model=>feed(F.create(48000,{model,noise:0,crackle:0,hum:0}),input)[0]);let closest=Infinity;for(let a=0;a<models.length;a++)for(let b=a+1;b<models.length;b++){const error=difference(outputs[a],outputs[b]).rms;closest=Math.min(closest,error);assert(error>1e-5,models[a]+' and '+models[b]+' collapse to the same response');}evidence.closestModelRmsDifference=closest;
  const clean=feed(F.create(48000,{model:'carbon-30',drive:0,compression:0,wear:0,digital:'off'}),tone(701,24000,48000,.005))[0],hot=feed(F.create(48000,{model:'carbon-30',drive:24,compression:0,wear:.8,digital:'off'}),tone(701,24000,48000,.25))[0];const distortion=a=>(projection(a,1402)+projection(a,2103))/Math.max(1e-12,projection(a,701));assert(distortion(hot)>distortion(clean)*1.2,'Carbon breakup must depend on drive and signal level');evidence.carbonDistortion={quiet:distortion(clean),hot:distortion(hot)};
 });
 await check('Digital pickup modes add deliberate clock and companding character independently of analog models',()=>{
  const input=signal(16384,48000,.025),patch={model:'mobile-8k',drive:0,wear:0,noise:0,crackle:0,hum:0,compression:0,stereo:'stereo'},audio=mode=>feed(F.create(48000,{...patch,digital:mode,bits:5,clock:5000}),input);
  const off=audio('off'),pcm=audio('pcm'),mulaw=audio('mulaw');assert(difference(off[0],pcm[0]).rms>1e-5);assert(difference(pcm[0],mulaw[0]).rms>1e-5);const unused=feed(F.create(48000,{...patch,digital:'off',bits:12,clock:16000,jitter:1}),input);assert.deepEqual(off,unused,'Disabled digital path must not alter analog audio');
 });
 await check('PCM word length cannot silently change fixed-depth telephone codecs',()=>{
  const input=signal(16384,48000,.027),patch={model:'cassette',drive:0,wear:0,noise:0,crackle:0,hum:0,compression:0,clock:8000};
  for(const digital of['mulaw','adpcm'])assert.deepEqual(feed(F.create(48000,{...patch,digital,bits:4}),input),feed(F.create(48000,{...patch,digital,bits:12}),input),digital+' must retain its standard word length');
  assert(difference(feed(F.create(48000,{...patch,digital:'pcm',bits:4}),input)[0],feed(F.create(48000,{...patch,digital:'pcm',bits:12}),input)[0]).rms>1e-5,'PCM word length must change quantization');
 });
 await check('Mono coloration preserves original dry stereo at partial blend',()=>{
  const input=signal(8192),patch={model:'rotary-50',noise:0,crackle:0,hum:0,stereo:'mono'},wet=feed(F.create(48000,{...patch,mix:1}),input),mixed=feed(F.create(48000,{...patch,mix:.37}),input);assert.deepEqual(wet[0],wet[1]);for(let c=0;c<2;c++){const expected=Float32Array.from(input[c],(dry,i)=>dry+(wet[c][i]-dry)*.37);assert(difference(mixed[c],expected).max<3e-7);}assert(difference(mixed[0],mixed[1]).rms>.001,'Dry stereo must not collapse with a mono wet mic');
 });
 await check('Noise, crackle and hum are opt-in, reproducible and gated away after the signal ends',()=>{
  for(const key of['noise','crackle','hum']){const patch={model:'carbon-30',noise:0,crackle:0,hum:0,[key]:.7};const silent=feed(F.create(48000,patch),[new Float32Array(4096),new Float32Array(4096)]);assert(silent.every(a=>a.every(v=>v===0)),key+' emits while silent');const audio=feed(F.create(48000,patch),signal(24000),128),reference=feed(F.create(48000,{...patch,[key]:0}),signal(24000),128);assert(difference(audio[0],reference[0]).rms>1e-8,key+' never becomes audible');assert.deepEqual(audio,feed(F.create(48000,patch),signal(24000),[1,17,137,256]));const effect=F.create(48000,patch);feed(effect,signal(12000));const seconds=effect.getTailTime();assert(Number.isFinite(seconds)&&seconds>=0&&seconds<=5,key+' unbounded advertised tail');const tail=feed(effect,[new Float32Array(Math.ceil(48000*(seconds+.05))),new Float32Array(Math.ceil(48000*(seconds+.05)))]);assert(rms(tail[0],tail[0].length-2400)<1e-5,key+' noise gate exceeds advertised tail');}
 });
 await check('Production codec helpers match G.711 and stateful four-bit IMA reference vectors',()=>{
  const C=F.codecs;assert(C&&C.encodeMuLaw&&C.decodeMuLaw&&C.encodeIMA&&C.decodeIMA,'Expose the production codec helpers for normative tests');
  const decode=byte=>{const c=(~byte)&255,t=(((c&15)<<3)+132)<<((c>>4)&7);return(c&128)?132-t:t-132;};
  for(let byte=0;byte<256;byte++)assert.equal(C.decodeMuLaw(byte),decode(byte),'G.711 decode byte '+byte);
  for(const [sample,byte]of[[0,255],[1000,206],[-1000,78],[30000,130],[-30000,2],[32767,128],[-32768,0]])assert.equal(C.encodeMuLaw(sample),byte,'G.711 encode sample '+sample);
  const steps=[7,8,9,10,11,12,13,14,16,17,19,21,23,25,28,31,34,37,41,45,50,55,60,66,73,80,88,97,107,118,130,143,157,173,190,209,230,253,279,307,337,371,408,449,494,544,598,658,724,796,876,963,1060,1166,1282,1411,1552,1707,1878,2066,2272,2499,2749,3024,3327,3660,4026,4428,4871,5358,5894,6484,7132,7845,8630,9493,10442,11487,12635,13899,15289,16818,18500,20350,22385,24623,27086,29794,32767],indices=[-1,-1,-1,-1,2,4,6,8];
  const advance=(n,state)=>{const step=steps[state.index];let delta=step>>3;if(n&4)delta+=step;if(n&2)delta+=step>>1;if(n&1)delta+=step>>2;state.predictor=Math.max(-32768,Math.min(32767,state.predictor+((n&8)?-delta:delta)));state.index=Math.max(0,Math.min(88,state.index+indices[n&7]));return state.predictor;};
  const encode=(sample,state)=>{let d=sample-state.predictor,n=d<0?8:0;if(d<0)d=-d;let step=steps[state.index];if(d>=step){n|=4;d-=step;}step>>=1;if(d>=step){n|=2;d-=step;}step>>=1;if(d>=step)n|=1;advance(n,state);return n;};
  const actual={predictor:0,index:0},expected={predictor:0,index:0},decoder={predictor:0,index:0},decoderExpected={predictor:0,index:0},first=[];
  for(let i=0;i<4096;i++){const sample=i<6?1000:Math.round(Math.sin(i*.137)*32767);const n=C.encodeIMA(sample,actual),reference=encode(sample,expected);if(i<6)first.push(n);assert.equal(n,reference,'IMA nibble '+i);assert.deepEqual(plain(actual),expected,'IMA encoder state '+i);assert.equal(C.decodeIMA(n,decoder),advance(n,decoderExpected),'IMA decoded sample '+i);assert.deepEqual(plain(decoder),decoderExpected,'IMA decoder state '+i);}
  assert.deepEqual(first,[7,7,7,7,7,5]);evidence.codecs={mulawDecodeBytes:256,imaReferenceSamples:4096,imaFirstNibbles:first};
 });
 await check('Seeded texture, partial edits and resets are independent of caller block size',()=>{
  const input=signal(24576),events=[{at:37,patch:{drive:21,tone:.7}},{at:193,patch:{wear:.9,noise:.3,crackle:.5,hum:.2}},{at:1301,patch:{model:'mobile-8k',digital:'mulaw',bits:5,clock:7000,jitter:.6}},{at:4097,patch:{model:'bullet',digital:'off',tone:-.5}},{at:8881,patch:{bypass:true}},{at:9287,patch:{bypass:false}},{at:10903,patch:{mix:0}},{at:11939,patch:{mix:.7}},{at:16387,reset:true}];
  const a=feed(F.create(48000,{}),input,128,events),b=feed(F.create(48000,{}),input,[1,17,137,256,31],events);assert.deepEqual(a,b);const fx=F.create(48000,{model:'answerphone',noise:.4,crackle:.5,jitter:.6});const first=feed(fx,input,137);fx.reset();assert.deepEqual(feed(fx,input,137),first);evidence.seededPcm=hash(a);
 });
 await check('Long silent tails suspend DSP and resume identically across irregular blocks',()=>{
  const body=signal(4096),silence=48000*4,frames=body[0].length*2+silence,input=[new Float32Array(frames),new Float32Array(frames)];for(let c=0;c<2;c++){input[c].set(body[c]);input[c].set(body[c],4096+silence);}const patch={model:'answerphone',digital:'adpcm',noise:.4,crackle:.6,hum:.3,stereo:'stereo'};const a=feed(F.create(48000,patch),input,128),b=feed(F.create(48000,patch),input,[1,17,137,251]);assert.deepEqual(a,b);assert(a.every(channel=>channel.subarray(4096+silence-12000,4096+silence).every(v=>v===0)),'Settled idle must be exact silence');assert(rms(a[0],4096+silence)>.001,'The effect must wake for the next sound');
  const counters={},math=Object.create(Math);for(const key of['sin','cos','tan','tanh','exp','pow','sqrt','log','log1p','log10'])math[key]=(...args)=>{counters[key]=(counters[key]||0)+1;return Math[key](...args);};const counted=Function('Math','return ('+release.scope.createLoomLoFiDSP.toString()+')();')(math).create(48000,patch);feed(counted,body);feed(counted,[new Float32Array(silence),new Float32Array(silence)]);for(const key of Object.keys(counters))delete counters[key];feed(counted,[new Float32Array(4096),new Float32Array(4096)]);assert.deepEqual(counters,{},'Quiescent processor still performs signal/coefficient math');assert.equal(counted.getTailTime(),0);
 });
 await check('Bypass and zero blend preserve exact dry stereo and suspend expensive signal work',()=>{
  const input=signal(8192);input[0][0]=-0;for(const patch of[{bypass:true},{mix:0}])for(const model of models){const fx=F.create(48000,{model,drive:30,noise:1,crackle:1,hum:1,digital:'mulaw',...patch});assert.deepEqual(feed(fx,input),input,model+' '+JSON.stringify(patch));assert.equal(fx.getTailTime(),0);}
 });
 await check('Live wet-to-dry changes declick for six milliseconds, then remain exact dry',()=>{
  const input=signal(8192,48000,.08),frames=Math.round(48000*.006);
  for(const patch of[{bypass:true},{mix:0}]){const fx=F.create(48000,{model:'carbon-30',drive:20,noise:.6,crackle:.6,hum:.3});feed(fx,input,128);fx.setParams(patch);const result=feed(fx,input,[17,137,256]);for(let c=0;c<2;c++)assert.deepEqual(result[c].subarray(frames),input[c].subarray(frames));assert.equal(fx.getTailTime(),0);}
 });
 await check('All sample rates remain stable under hot audio, DC and malformed values',()=>{
  const report={};for(const rate of[8000,44100,48000,96000,192000]){let peak=0;for(const model of models){const fx=F.create(rate,{model,drive:30,wear:1,resonance:1,compression:1,bandwidth:.25,output:12,noise:0,crackle:0,hum:0,digital:'mulaw',bits:4,clock:1000,jitter:1});const input=signal(3072,rate,3);for(const channel of input){channel[73]=NaN;channel[191]=Infinity;channel[257]=-Infinity;channel[293]=1e30;}const audio=feed(fx,input,[1,137,251]);finite(audio);for(const a of audio)for(const v of a)peak=Math.max(peak,Math.abs(v));fx.reset();feed(fx,[new Float32Array(2048).fill(.3),new Float32Array(2048).fill(-.3)]);const tail=feed(fx,[new Float32Array(Math.ceil(rate*.6)),new Float32Array(Math.ceil(rate*.6))]);finite(tail);assert(rms(tail[0],Math.floor(tail[0].length*.8))<1e-3,model+' DC tail at '+rate);}report[rate]=peak;}evidence.safetyPeaks=report;
 });
 await check('Model and front-panel changes are declicked rather than jumping to another static transfer curve',()=>{
  const frames=16000,input=tone(997,frames,48000,.08),events=[{at:4096,patch:{model:'piezo',drive:24,tone:1,bandwidth:2,resonance:1}},{at:8192,patch:{model:'rotary-50',drive:0,tone:-1,bandwidth:.25}},{at:12288,patch:{stereo:'stereo',output:-18}}],audio=feed(F.create(48000,{model:'cassette',digital:'off',noise:0,crackle:0,hum:0}),input,128,events);finite(audio);for(const event of events)for(const a of audio)assert.equal(a[event.at],a[event.at-1],'Model/topology edit must begin at the previous output sample');let max=0;for(const a of audio)for(let i=1;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-a[i-1]));assert(max<.3,'Parameter update produces a discontinuity '+max);evidence.maximumTransitionStep=max;
 });
 await check('The released sixteen effects retain exactly the same stereo samples and meters',()=>{
  let old;try{old=load(BASELINE);}catch(error){if(!fs.existsSync(path.join(root,'.git'))){console.log('SKIP published source comparison outside a Git checkout');return;}throw error;}
  const types=Object.keys(old.E.specifications),input=signal(4096,48000,.07),events=[{at:193,patch:{mix:.37}},{at:503,patch:{bypass:true}},{at:907,patch:{bypass:false}},{at:1501,patch:{mix:0}},{at:1999,patch:{mix:1}},{at:2503,reset:true}];assert.equal(types.length,16);for(const type of types){const a=E.create(type,48000,{}),b=old.E.create(type,48000,{});assert.deepEqual(feed(a,input,[17,128,193],events),feed(b,input,[17,128,193],events),type+' changed');assert.deepEqual(plain(a.getMeters()),plain(b.getMeters()),type+' meters changed');}evidence.unchangedEffects=types;
 });
 if(process.argv.includes('--bench'))await check('Exclusive informational CPU cost for one and forty running inserts',()=>{
  const measure=count=>{const effects=Array.from({length:count},(_,i)=>F.create(48000,{model:models[i%models.length],noise:.1,crackle:.1,wear:.4})),source=tone(503,128,48000,.1),left=new Float32Array(128),right=left.slice();for(let n=0;n<500;n++)for(const fx of effects){left.set(source[0]);right.set(source[1]);fx.process(left,right);}const trials=[];for(let trial=0;trial<3;trial++){const began=performance.now();for(let n=0;n<300;n++)for(const fx of effects){left.set(source[0]);right.set(source[1]);fx.process(left,right);}trials.push((performance.now()-began)/300);}return{instances:count,millisecondsPer128Frames:trials.sort((a,b)=>a-b)[1],trials};};evidence.cpu={sampleRate:48000,quantumBudgetMs:128/48000*1000,single:measure(1),forty:measure(40)};console.log('TIMING '+JSON.stringify(evidence.cpu));});
 console.log(passed.length+' TIN CAN DSP groups passed.');console.log(JSON.stringify(evidence));return{passed,evidence};
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
