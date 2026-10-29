'use strict';
// Portable, real GALLEY DSP and serialized worker lifecycle checks.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
globalThis.window=globalThis;
const directory=fs.existsSync(path.join(__dirname,'galley-effects','effects.js'))?path.join(__dirname,'galley-effects'):path.join(__dirname,'..','loom');
for(const file of ['vocal-catalog.js','utility-catalog.js','filter-catalog.js','creative-catalog.js','preamp-catalog.js','effects-catalog.js','vocal-dsp.js','utility-dsp.js','filter-dsp.js','creative-dsp.js','broiler-pedals.js','compressor-dsp.js','preamp-dsp.js','effects.js'])vm.runInThisContext(fs.readFileSync(path.join(directory,file),'utf8'),{filename:file});
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'voice-effects.js'),'utf8'),{filename:'voice-effects.js'});
const fx=KitchenVoiceEffects,dsp=createLoomEffectsDSP(),passed=[];
const effect=(type,patch={})=>({type,params:{...fx.defaults(type),...patch}}),clone=value=>JSON.parse(JSON.stringify(value));
function source(frames=8192){let word=0x5147;return Float32Array.from({length:frames},(_,i)=>{word^=word<<13;word^=word>>>17;word^=word<<5;return .035*Math.sin(i*.021)+.015*((word>>>0)/4294967296*2-1);});}
function run(processor,a,b=a,block=128){const left=a.slice(),right=b.slice();for(let at=0;at<left.length;at+=block)processor.process(left.subarray(at,at+block),right.subarray(at,at+block));return {left,right};}
function peak(a){let value=0;for(const sample of a)value=Math.max(value,Math.abs(sample));return value;}
async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
(async()=>{
await check('The two-slot project contract includes all fifteen complete GALLEY effects and rejects malformed supplied state',()=>{
 assert.equal(fx.catalog.length,15);assert.deepEqual(fx.normalizeSlots(undefined,{strict:true}),[null,null]);
 for(const def of fx.catalog){const slots=[effect(def.id),null];assert.deepEqual(fx.normalizeSlots(slots,{strict:true}),slots);for(const key of Object.keys(def.defaults)){const invalid=clone(slots);delete invalid[0].params[key];assert.throws(()=>fx.normalizeSlots(invalid,{strict:true}),/invalid/i,def.id+'.'+key);}}
 for(const bad of [null,[],[null],[null,null,null],[{},null],[{type:'missing',params:{}},null]])assert.throws(()=>fx.normalizeSlots(bad,{strict:true}));
 const original=[effect('saute'),effect('velvet')],normalized=fx.normalizeSlots(original);normalized[0].params.input=10;assert.equal(original[0].params.input,0);
});
await check('Every bridge effect is whole-buffer sample-identical to its actual GALLEY DSP, including both stereo channels',()=>{
 const a=source(),b=Float32Array.from(a,(x,i)=>x*Math.cos(i*.043));
 for(const def of fx.catalog){const slots=[effect(def.id),null],native=dsp.create(def.id,48000,slots[0].params),l=a.slice(),r=b.slice();for(let at=0;at<a.length;at+=128)native.process(l.subarray(at,at+128),r.subarray(at,at+128),{tempo:120,beat:at/48000*2,playing:true});assert.deepEqual(run(fx.createProcessor(48000,slots,{tempo:120,playing:true}),a,b),{left:l,right:r},def.id);}
});
await check('Serial order, independent histories, tail padding and fresh-state silence affect real audio',()=>{
 const a=source(24000),delay=effect('parallax',{clock:'free',time:40,feedback:.55,mix:1,spread:0}),dirt=effect('cinder',{drive:28,mix:1});
 const first=run(fx.createProcessor(48000,[delay,dirt]),a),second=run(fx.createProcessor(48000,[dirt,delay]),a);assert(first.left.some((x,i)=>Math.abs(x-second.left[i])>1e-4));
 const empty=run(fx.createProcessor(48000),a);assert.deepEqual(empty,{left:a,right:a});assert.equal(peak(run(fx.createProcessor(48000,[delay,null]),new Float32Array(1000)).left),0);
 const impulse=new Float32Array(128);impulse[0]=.1;const padded=fx.processBuffer([delay,null],{left:impulse,sampleRate:48000},{tailSeconds:.2});assert.equal(padded.left.length,9728);assert(peak(padded.left.subarray(1900,2200))>.01);assert(fx.tailTime([delay,null],120)>.1);
});
await check('Bypass/re-enable, remove and same-type slot swap clear old echoes while ordinary parameter edits retain histories',()=>{
 const delay=effect('parallax',{clock:'free',time:80,feedback:.8,mix:1,spread:0}),p=fx.createProcessor(48000,[delay,null]),impulse=new Float32Array(128);impulse[0]=.2;
 run(p,impulse);p.setSlots([effect('parallax',{...delay.params,damping:3000}),null]);assert(peak(run(p,new Float32Array(8000)).left)>.01,'parameter edit lost echo');
 p.setSlots([effect('parallax',{...delay.params,bypass:true}),null]);run(p,new Float32Array(2000));p.setSlots([delay,null]);assert.equal(peak(run(p,new Float32Array(8000)).left),0,'bypass revived old echo');
 run(p,impulse);p.setSlots([null,null]);run(p,new Float32Array(2000));p.setSlots([delay,null]);assert.equal(peak(run(p,new Float32Array(8000)).left),0,'removal revived old echo');
 const other=effect('parallax',{clock:'free',time:120,feedback:.3,mix:1,spread:0}),q=fx.createProcessor(48000,[delay,other]);run(q,impulse);q.setSlots([other,delay]);assert(peak(run(q,new Float32Array(16000)).left)<1e-7,'same-type swap revived old histories');
});
let Registered,workerScope;
class Param{constructor(value=1){this.value=value;}cancelScheduledValues(){}cancelAndHoldAtTime(){}setValueAtTime(value){this.value=value;}linearRampToValueAtTime(value){this.value=value;}setTargetAtTime(value){this.value=value;}}
class Node{constructor(context){this.context=context;this.connections=new Set();this.gain=new Param();}connect(node){this.connections.add(node);return node;}disconnect(node){if(node)this.connections.delete(node);else this.connections.clear();}}
class FakeWorklet extends Node{constructor(context,name,options){super(context);this.processor=new Registered(options);this.port={postMessage:message=>this.processor.port.onmessage?.({data:message}),close(){},onmessage:null};}}
function fakeContext(){let realm;const context={sampleRate:48000,currentTime:0,moduleCount:0,createGain(){return new Node(context);},audioWorklet:{async addModule(url){const code=await(await fetch(url)).text();if(!realm){realm={sampleRate:48000,currentFrame:0,Math,Number,Object,JSON,Float32Array,Float64Array,Int32Array,Uint8Array,Map,Set,AudioWorkletProcessor:class{constructor(){this.port={onmessage:null,postMessage(){}};}},registerProcessor(name,value){Registered=value;}};vm.createContext(realm);}workerScope=realm;vm.runInContext(code,realm);context.moduleCount++;}}};return context;}
function workerRender(node,input,rightInput=input){const left=new Float32Array(input.length),right=new Float32Array(input.length);for(let at=0;at<input.length;at+=128){workerScope.currentFrame=at;node.processor.process([[input.subarray(at,at+128),rightInput.subarray(at,at+128)]],[[left.subarray(at,at+128),right.subarray(at,at+128)]]);}return {left,right};}
globalThis.AudioWorkletNode=FakeWorklet;
await check('Empty bank routes are exact native destinations, first-add adopts ringing sources, and detach/dispose release links',async()=>{
 const context=fakeContext();await fx.prepare(context);const destination=new Node(context),bank=fx.createBank(context,destination,{voiceCount:2});assert.equal(bank.input(0),destination);
 const source=new Node(context),detach=bank.connectSource(0,source);assert.deepEqual([...source.connections],[destination]);bank.setVoice(0,[effect('cinder'),null]);assert.notEqual(bank.input(0),destination);assert.equal(source.connections.size,2,'first add must connect complementary dry/wet paths');assert(!source.connections.has(destination));
 const activeInput=bank.input(0);bank.setAudible(0,false);bank.setVoice(0,[null,null]);assert.equal(bank.input(0),activeInput,'post-use bypass must retain its audibility gate');const pending=new Node(context),off=bank.connectSource(0,pending);assert(pending.connections.has(activeInput));off();detach();assert.equal(source.connections.size,0);bank.dispose();
});
await check('Scheduled clock anchors do not move the phase before their sample; unchanged tempo edits preserve phase',async()=>{
 const context=fakeContext();await fx.prepare(context);const bank=fx.createBank(context,new Node(context),{voiceCount:1});bank.setVoice(0,[effect('tremor',{shape:'gate',division:'1/4',depth:1,pan:0,duty:.5,smooth:0,mix:1}),null]);bank.setClock({tempo:120,beat:0,time:0,playing:true});bank.setClock({tempo:120,beat:.5,time:.05,playing:true});bank.setClock({tempo:120});const got=workerRender(bank.input(0),new Float32Array(4800).fill(.1)).left;
 assert(got.subarray(0,2400).every(x=>Math.abs(x-.1)<1e-7),'future anchor affected earlier audio');assert.equal(peak(got.subarray(2400)),0,'future anchor did not apply at exact sample');bank.dispose();
});
await check('Scheduled reset is sample accurate and an immediate newer reset supersedes an older pending reset',async()=>{
 for(const supersede of [false,true]){const context=fakeContext();await fx.prepare(context);const bank=fx.createBank(context,new Node(context),{voiceCount:1});bank.setVoice(0,[effect('parallax',{clock:'free',time:20,feedback:.8,mix:1,spread:0,damping:18000}),null]);bank.reset(0,1000/48000);if(supersede)bank.reset(0,0);const input=new Float32Array(4000);input[0]=.2;const output=workerRender(bank.input(0),input).left;assert(peak(output.subarray(950,1000))>.01,'reset happened before scheduled time');if(supersede)assert(peak(output.subarray(1900,2100))>.01,'old reset cut new lifecycle');else assert.equal(peak(output.subarray(1000)),0,'scheduled reset failed');bank.dispose();}
});
await check('The ScriptProcessor fallback matches canonical stereo DSP through queued clocks/resets and reports its latency; unsupported offline stays explicit',async()=>{
 function scriptContext(isOffline=false){
  const calls=[],context={sampleRate:48000,currentTime:0,createGain(){return new Node(context);},createScriptProcessor(frames,inputs,outputs){calls.push([frames,inputs,outputs]);const node=new Node(context);node.bufferSize=frames;node.onaudioprocess=null;return node;},calls};
  if(isOffline)context.startRendering=()=>Promise.reject(new Error('Not used by this source-only test'));
  return context;
 }
 const context=scriptContext(),prepared=await fx.prepare(context),destination=new Node(context),bank=fx.createBank(context,destination,{voiceCount:1});
 assert.equal(prepared.mode,'script');assert.equal(prepared.latencyFrames,256);assert.equal(bank.input(0),destination);assert.equal(bank.latencySeconds,0,'unused empty racks do not add fallback latency');
 const slots=[effect('parallax',{clock:'free',time:23,feedback:.55,mix:.7,damping:12000,spread:.35}),effect('tremor',{shape:'sine',division:'1/8',depth:.8,pan:.5,smooth:4,mix:1})];
 bank.setVoice(0,slots);const node=bank.input(0);assert.deepEqual(context.calls,[[256,2,2]]);assert.equal(bank.mode,'script');assert.equal(bank.latencySeconds,256/context.sampleRate);
 const clocks=[{frame:0,tempo:120,beat:0,playing:true},{frame:2500,tempo:138,beat:.375,playing:true},{frame:6666,tempo:84,beat:1.25,playing:false}].map(value=>({...value,time:value.frame/context.sampleRate})),resetFrame=5101;
 for(const clock of clocks)bank.setClock(clock);bank.reset(0,resetFrame/context.sampleRate);
 const a=source(8192),b=Float32Array.from(a,(value,i)=>value*.43*Math.cos(i*.051)+.009*Math.sin(i*.039));
 const got={left:new Float32Array(a.length),right:new Float32Array(a.length)};
 for(let at=0;at<a.length;at+=256){
  context.currentTime=at/context.sampleRate;
  const input=[a.subarray(at,at+256),b.subarray(at,at+256)],output=[got.left.subarray(at,at+256),got.right.subarray(at,at+256)];
  node.onaudioprocess({playbackTime:at/context.sampleRate,inputBuffer:{numberOfChannels:2,getChannelData:index=>input[index]},outputBuffer:{numberOfChannels:2,getChannelData:index=>output[index]}});
 }
 function canonical(withReset){
  const chain=slots.map(spec=>dsp.create(spec.type,context.sampleRate,spec.params)),left=a.slice(),right=b.slice();
  for(let block=0;block<a.length;block+=256){
   let at=block;const blockEnd=Math.min(block+256,a.length);
   while(at<blockEnd){
    if(withReset&&at===resetFrame)chain.forEach(effect=>effect.reset());
    const active=clocks.filter(clock=>clock.frame<=at).at(-1),future=clocks.find(clock=>clock.frame>at);
    const end=Math.min(blockEnd,future?future.frame:blockEnd,withReset&&resetFrame>at?resetFrame:blockEnd),time=at/context.sampleRate;
    const clock={tempo:active.tempo,beat:active.beat+(active.playing?time-active.time:0)*active.tempo/60,playing:active.playing};
    for(const effect of chain)effect.process(left.subarray(at,end),right.subarray(at,end),clock);at=end;
   }
  }
  return {left,right};
 }
 assert.deepEqual(got,canonical(true),'fallback callback channel data and sample-timed controls must match native GALLEY processing');
 const withoutReset=canonical(false);assert(got.left.some((value,index)=>Math.abs(value-withoutReset.left[index])>1e-4),'the scheduled reset fixture must exercise audible state');
 assert(peak(got.left)>1e-4&&peak(got.right)>1e-4);assert.notDeepEqual(got.left,got.right,'stereo fixture must detect channel copying');
 bank.dispose();assert.equal(node.onaudioprocess,null,'dispose releases the fallback callback');
 const unsupported=scriptContext(true),offlinePrepared=await fx.prepare(unsupported),offlineDestination=new Node(unsupported),offlineBank=fx.createBank(unsupported,offlineDestination,{voiceCount:1});
 assert.equal(offlinePrepared.mode,'unavailable');assert.equal(offlinePrepared.latencyFrames,0);assert.equal(offlineBank.input(0),offlineDestination);
 assert.throws(()=>offlineBank.setVoice(0,[effect('prism'),null]),/Offline AudioWorklet|cannot render/i,'wet offline export must not silently substitute dry audio');
 offlineBank.setVoice(0,[null,null]);assert.equal(offlineBank.input(0),offlineDestination);assert.equal(unsupported.calls.length,0,'offline rendering must not instantiate the realtime ScriptProcessor fallback');offlineBank.dispose();
});
await check('Offline finalization snapshots queued controls before rendering, refreshes changed snapshots and preserves native start errors',async()=>{
 const context=fakeContext(),a=source(8192),b=Float32Array.from(a,(value,i)=>value*.61*Math.cos(i*.037));let bank,nativeStarts=0;
 context.state='suspended';context.startRendering=function(){if(this!==context)throw new TypeError('Illegal invocation');if(context.state==='closed')return Promise.reject(new DOMException('Offline rendering has already completed.','InvalidStateError'));nativeStarts++;const rendered=workerRender(bank.input(0),a,b);context.state='closed';return Promise.resolve(rendered);};
 await fx.prepare(context);bank=fx.createBank(context,new Node(context),{voiceCount:1});const slots=[effect('parallax',{clock:'free',time:23,feedback:.6,damping:12000,spread:.35,mix:.7}),effect('tremor',{shape:'sine',division:'1/8',depth:.6,pan:.3,smooth:4,mix:1})];
 bank.setClock({tempo:120,beat:0,time:0,playing:true});bank.setVoice(0,slots);await bank.finalizeOffline();assert.equal(context.moduleCount,2,'explicit snapshot publishes one configuration module');
 bank.setClock({tempo:120,beat:.75,time:.05,playing:true});bank.reset(0,5001/48000);const pending=context.startRendering();await assert.rejects(context.startRendering(),{name:'InvalidStateError'});const actual=await pending;
 const expected={left:a.slice(),right:b.slice()},chain=slots.map(spec=>dsp.create(spec.type,48000,spec.params));
 for(let block=0;block<a.length;block+=128){let at=block;const endBlock=Math.min(a.length,block+128);while(at<endBlock){if(at===5001)chain.forEach(effect=>effect.reset());const end=Math.min(endBlock,at<2400?2400:endBlock,at<5001?5001:endBlock),clock={tempo:120,beat:at>=2400?.75+(at/48000-.05)*2:at/48000*2,playing:true};for(const effect of chain)effect.process(expected.left.subarray(at,end),expected.right.subarray(at,end),clock);at=end;}}
 assert.deepEqual(actual,expected,'final offline config must not depend on pre-render MessagePort delivery');assert.equal(context.moduleCount,3,'changed queued controls refresh the earlier explicit snapshot');assert.equal(nativeStarts,1);
 await assert.rejects(context.startRendering(),{name:'InvalidStateError'});assert.equal(context.moduleCount,3,'closed/duplicate render does not publish another config');assert.equal(nativeStarts,1);assert.throws(()=>context.startRendering.call({}),TypeError);bank.dispose();
 const dry=fakeContext();dry.startRendering=function(){return Promise.resolve('dry');};await fx.prepare(dry);assert.equal(await dry.startRendering(),'dry');assert.equal(dry.moduleCount,1,'never-used empty export keeps the direct native render path');
});
console.log(passed.length+' shared voice-effects checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
