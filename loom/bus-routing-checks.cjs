'use strict';
// Real shared engine/effect DSP. No browser, native host or Git dependency.
// Run: node loom/bus-routing-checks.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {performance}=require('node:perf_hooks');
globalThis.window=globalThis;
for(const file of ['vocal-dsp.js','utility-dsp.js','filter-dsp.js','creative-dsp.js','broiler-pedals.js','compressor-dsp.js','preamp-dsp.js','tape-dsp.js','effects.js','audio-engine.js'])vm.runInThisContext(fs.readFileSync(path.join(__dirname,file),'utf8'),{filename:file});
const DSP=createLoomEngineDSP(createLoomEffectsDSP),effects=createLoomEffectsDSP(),RATE=48000,passed=[];
const clone=x=>JSON.parse(JSON.stringify(x));
function state(){return {tempo:120,lengthBars:4,loopEnabled:false,loopStart:0,loopEnd:16,master:{id:'master',name:'Master',level:1,mute:false,metronome:false,effects:[null,null,null,null],automation:[]},returns:[0,1].map(i=>({id:'return-'+(i+1),name:'Return '+(i?'B':'A'),level:1,pan:0,mute:false,solo:false,effects:[null,null,null,null],automation:[]})),tracks:Array.from({length:8},(_,i)=>({id:'track-'+(i+1),level:1,pan:0,mute:false,solo:false,instrumentLive:true,effects:[null,null,null,null],automation:[],sends:[0,0],sendPre:[false,false],clips:[]}))};}
const fx=(type,params={})=>({type,params:effects.normalize(type,params)});
const lane=(target,values,effectType)=>({target,effectType,enabled:true,interpolation:'linear',points:values.map(([beat,value])=>({beat,value}))});
function tone(hz=173,amp=.07,seconds=.3,rate=RATE){return Float32Array.from({length:Math.round(seconds*rate)},(_,i)=>amp*Math.sin(2*Math.PI*hz*i/rate));}
function rms(a,start=0,end=a.length){let e=0;for(let i=start;i<end;i++)e+=a[i]*a[i];return Math.sqrt(e/Math.max(1,end-start));}
function peak(a){let p=0;for(const x of a)p=Math.max(p,Math.abs(x));return p;}
function difference(a,b){let e=0;for(let i=0;i<a.length;i++)e+=(a[i]-b[i])**2;return Math.sqrt(e/a.length);}
function inputsAt(sources,start,n){return Array.from({length:9},(_,i)=>{const source=sources[i];return source?[source[0].subarray(start,start+n),(source[1]||source[0]).subarray(start,start+n)]:[];});}
function render(s,sources=[],frames=sources[0]?.[0]?.length||RATE*.3,block=128,options={},rate=RATE,assets={},factory=DSP){const core=new factory.Core(s,assets,rate,{linear:true,...options});core.start(0);const left=new Float32Array(frames),right=new Float32Array(frames);for(let at=0;at<frames;at+=block)core.processBlock(left.subarray(at,at+block),right.subarray(at,at+block),inputsAt(sources,at,Math.min(block,frames-at)));return {left,right,core};}
function feed(core,sources,frames,block=128){const left=new Float32Array(frames),right=new Float32Array(frames);for(let at=0;at<frames;at+=block)core.processBlock(left.subarray(at,at+block),right.subarray(at,at+block),inputsAt(sources,at,Math.min(block,frames-at)));return {left,right};}
function prime(core){for(let t=0;t<8;t++){const tr=core.tracks[t],pan=tr.pan||0;core.gains[t][0]=tr.level*Math.cos((pan+1)*Math.PI/4)*Math.SQRT2;core.gains[t][1]=tr.level*Math.sin((pan+1)*Math.PI/4)*Math.SQRT2;core.preGains[t][0]=Math.cos((pan+1)*Math.PI/4)*Math.SQRT2;core.preGains[t][1]=Math.sin((pan+1)*Math.PI/4)*Math.SQRT2;core.sendGains[t][0]=tr.sends[0];core.sendGains[t][1]=tr.sends[1];}for(let b=0;b<2;b++){const bus=core.returns[b];core.returnGains[b][0]=bus.level*Math.cos((bus.pan+1)*Math.PI/4)*Math.SQRT2;core.returnGains[b][1]=bus.level*Math.sin((bus.pan+1)*Math.PI/4)*Math.SQRT2;}core.masterGain=core.master.level;}
async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
(async()=>{
await check('Post/pre sends follow track pan, pre ignores fader, mute/solo gate every source feed',()=>{
  const s=state(),x=tone();s.tracks[0].sends[0]=1;s.tracks[0].level=0;s.returns[0].solo=true;
  assert.equal(peak(render(s,[[x]]).left),0,'post fader send ignores level0');
  s.tracks[0].sendPre[0]=true;const pre=render(s,[[x]]);assert(rms(pre.left,RATE*.15)>.04);
  const muted=clone(s);muted.tracks[0].mute=true;assert.equal(peak(render(muted,[[x]]).left),0);
  const panned=clone(s);panned.tracks[0].pan=1;const pan=render(panned,[[x]]);assert(rms(pan.right,RATE*.15)>.06);assert(peak(pan.left)<1e-12);
  const solo=clone(s);solo.tracks[1].sends[0]=1;solo.tracks[0].solo=true;const a=render(solo,[[x],[tone(719,.12)]]),b=render(s,[[x]]);assert.deepEqual(a.left,b.left);assert.deepEqual(a.right,b.right);
  s.returns[0].mute=true;assert.equal(peak(render(s,[[x]]).left),0,'muted solo return wins');
});
await check('Return solo produces wet-only monitoring and suppresses dry/nonsolo stems consistently',()=>{
  const s=state(),x=tone();s.tracks[0].sends=[.7,.4];s.returns[0].effects[0]=fx('prism',{high:-12});s.returns[0].solo=true;
  const mix=render(s,[[x]]),wet=render(s,[[x]],x.length,128,{returnId:'return-1'});assert.deepEqual(mix.left,wet.left);assert.deepEqual(mix.right,wet.right);
  assert.equal(peak(render(s,[[x]],x.length,128,{trackId:'track-1'}).left),0);assert.equal(peak(render(s,[[x]],x.length,128,{returnId:'return-2'}).left),0);
});
await check('Return solo transitions smooth the dry mix once per sample without a level discontinuity',()=>{
  function run(block){const s=state(),core=new DSP.Core(s,{},RATE,{linear:true}),frames=9600,input=new Float32Array(frames).fill(.08);core.start();const a=feed(core,[[input]],frames,block);s.returns[0].solo=true;core.setState(clone(s));const b=feed(core,[[input]],frames,block);assert(Math.abs(b.left[0]-a.left[frames-1])<.0002,'solo hard-cut dry mix');assert(peak(b.left.subarray(frames-100))<1e-8);s.returns[0].solo=false;core.setState(clone(s));const c=feed(core,[[input]],frames,block);assert(Math.abs(c.left[0]-b.left[frames-1])<.0002,'unsolo hard-restored dry mix');return {a,b,c};}assert.deepEqual(run(128),run(37));
});
await check('A single shared return runs before master inserts, with no hidden return-to-return path',()=>{
  const s=state(),x=tone(173,.06,.1),right=tone(719,.04,.1);s.tracks[0].sends[0]=1;s.returns[0].level=.5;s.returns[0].effects[0]=fx('prism',{mid:5,midFreq:600});s.master.effects[0]=fx('cinder',{drive:12,shape:'diode',mix:1,output:-6});
  const core=new DSP.Core(s,{},RATE,{linear:true});core.start();prime(core);const got=feed(core,[[x,right]],x.length);
  const wetL=x.slice(),wetR=right.slice();effects.create('prism',RATE,s.returns[0].effects[0].params).process(wetL,wetR);
  const refL=Float32Array.from(x,(v,i)=>v+wetL[i]*.5),refR=Float32Array.from(right,(v,i)=>v+wetR[i]*.5);effects.create('cinder',RATE,s.master.effects[0].params).process(refL,refR);
  assert(difference(got.left,refL)<2e-8);assert(difference(got.right,refR)<2e-8);
  const before=render({...s,master:{...s.master,effects:[null,null,null,null]}},[[x,right]],x.length),after=render(s,[[x,right]],x.length);assert(difference(before.left,after.left)>.005);
  const onlyB=render(s,[[x,right]],x.length,128,{returnId:'return-2'});assert.equal(peak(onlyB.left),0);
});
await check('Send, return and master automation retain the absolute32-sample clock across odd blocks',()=>{
  const s=state(),x=tone(173,.08,.5),right=tone(401,.04,.5);s.tracks[0].automation=[lane('send:0',[[0,0],[1,1]]),lane('pan',[[0,-.7],[1,.7]])];s.tracks[0].sendPre[0]=true;
  s.returns[0].effects[0]=fx('strainer',{cutoff:700,resonance:.5,envAmount:12});s.returns[0].automation=[lane('level',[[0,.3],[1,1]]),lane('pan',[[0,.5],[1,-.5]]),lane('fx:0:cutoff',[[0,400],[1,4200]],'strainer')];
  s.master.effects[0]=fx('velvet',{model:'bus-4k',threshold:-30,colour:.5});s.master.automation=[lane('level',[[0,.8],[1,.6]]),lane('fx:0:threshold',[[0,-32],[1,-14]],'velvet')];
  const a=render(s,[[x,right]],x.length,128),b=render(s,[[x,right]],x.length,37);assert.deepEqual(a.left,b.left);assert.deepEqual(a.right,b.right);assert(a.core.getMeters().returns[0].peak>0);assert.equal(a.core.getMeters().tracks.length,8);assert.equal(a.core.getMeters().effects.length,8);assert.equal(a.core.getMeters().masterEffects[0].type,'velvet');
  const snapshot=JSON.stringify(s),c=new DSP.Core(s,{},RATE,{linear:true});c.start();feed(c,[[x.subarray(0,37),right.subarray(0,37)]],37,37);const value=c.masterSlots[0].automationValues.threshold;c.setState(clone(s));assert.equal(c.masterSlots[0].automationValues.threshold,value,'unrelated state update dropped activebus automation');assert.equal(JSON.stringify(s),snapshot);
});
await check('Return delay tails survive source stop; seek and panic clear bus histories and gains',()=>{
  const s=state();s.tracks[0].sends[1]=1;s.returns[1].solo=true;s.returns[1].effects[0]=fx('parallax',{clock:'free',time:250,feedback:.8,damping:8000,mix:1});s.master.effects[0]=fx('vestige',{mix:.2,decay:2});
  const core=new DSP.Core(s,{},RATE);core.start();feed(core,[[tone(300,.15,.1)]],RATE*.1);core.stop();const tail=feed(core,[],RATE*2);assert(rms(tail.left,RATE,RATE*2)>.00001,'delay truncated at1second');
  core.seek(8);const cleared=feed(core,[],RATE*.1);assert(peak(cleared.left.subarray(RATE*.01))<1e-8,'seek retained wet history');assert(core.sendGains.every(a=>a.every(x=>x>=0&&Number.isFinite(x))));core.panic();const panic=feed(core,[],512);assert.equal(peak(panic.left),0);assert.equal(peak(panic.right),0);assert(core.returnGains.every(a=>a.every(x=>x===0)));
});
await check('Master mute covers clicks and wet tails while zero master level preserves legacy count-in click',()=>{
  const s=state();s.master.level=0;const a=new DSP.Core(s,{},8000,{includeMetronome:true});a.beginRecording({countInBeats:1,startTransport:true});assert(peak(feed(a,[],1024).left)>.01);
  s.master.mute=true;const b=new DSP.Core(s,{},8000,{includeMetronome:true});b.beginRecording({countInBeats:1,startTransport:true});assert.equal(peak(feed(b,[],1024).left),0);
  const chunks=[],recorder=new DSP.Recorder(8000,c=>chunks.push(c),()=>{});recorder.start(1,[0],0,4000,{});const dry=[new Float32Array(256).fill(.17),new Float32Array(256).fill(-.08)];const core=new DSP.Core(s,{},8000);core.setMicrophoneMonitor(0,true);const inputs=Array.from({length:9},()=>[]);inputs[0]=dry;inputs[8]=dry;const l=new Float32Array(256),r=l.slice();core.processBlock(l,r,inputs);recorder.capture(inputs,256,core);recorder.stop();assert.equal(peak(l),0);assert(chunks.length);assert(chunks[0].left.every(x=>Math.abs(x-.17)<1e-7));assert(chunks[0].right.every(x=>Math.abs(x+.08)<1e-7));
});
await check('SCALES meter reset addresses exactly one track/return/master rack and uses owner IDs',()=>{
  const s=state();s.tracks[0].sends[0]=1;s.tracks[0].effects[0]=fx('scales',{});s.returns[0].effects[0]=fx('scales',{});s.master.effects[0]=fx('scales',{});const out=render(s,[[tone(200,1.3,.15)]]);let meters=out.core.getMeters();assert(meters.effects[0][0].clipLeft);assert(meters.returnEffects[0][0].clipLeft);assert(meters.masterEffects[0].clipLeft);
  assert(out.core.resetEffectMeters('master',0));meters=out.core.getMeters();assert.equal(meters.masterEffects[0].clipLeft,false);assert(meters.returnEffects[0][0].clipLeft);assert(meters.effects[0][0].clipLeft);
  const audio=new LoomAudio(s);audio.core=out.core;audio.mode='fallback';assert(audio.resetEffectMeters('return-1',0));assert.equal(out.core.getMeters().returnEffects[0][0].clipLeft,false);assert(out.core.getMeters().effects[0][0].clipLeft);assert.equal(audio.resetEffectMeters('return-3',0),false);
  const messages=[];audio.mode='worklet';audio.node={port:{postMessage:m=>messages.push(m)}};assert(audio.resetEffectMeters('master',0));assert.deepEqual(messages,[{type:'resetEffectMeters',ownerId:'master',slot:0}]);
});
await check('SERVICE pre-send Drop and macros preserve source arrays and bus automation',()=>{
  const s=state();s.tracks[0].sends=[.2,.3];s.tracks[0].sendPre=[true,false];s.master.automation=[lane('level',[[0,.8],[4,.4]])];s.returns[0].automation=[lane('pan',[[0,-.5],[4,.5]])];const snapshot=JSON.stringify(s),core=new DSP.Core(s,{},RATE);core.startService({clips:Array(8).fill(null)},0,1,{drops:Array(8).fill(false),overrides:[{trackId:'track-1',target:'send:0',value:.8},{trackId:'track-1',target:'send:1',value:.7}]});assert.deepEqual(core.tracks[0].sends,[.8,.7]);assert.notEqual(core.tracks[0].sends,s.tracks[0].sends);assert(core.masterAutomation.level);assert(core.returnAutomation[0].pan);core.queueService('performance',{drops:[true,...Array(7).fill(false)],overrides:[{trackId:'track-1',target:'send:0',value:.8},{trackId:'track-1',target:'send:1',value:.7}]},'immediate',2);feed(core,[],1);assert.deepEqual(core.tracks[0].sends,[0,.7]);assert.equal(core.tracks[0].level,0);assert.equal(JSON.stringify(s),snapshot);
});
await check('Realtime state carries compact bus/send data without native snapshots or asset payloads',()=>{
  const s=state();s.tracks[0].sends=[.2,.4];s.tracks[0].instrument={snapshot:{secret:'native-heavy-data'},appHtml:'many bytes'};s.returns[0].effects[0]=fx('parallax',{mix:1});s.assets=[{id:'asset',left:'payload-does-not-belong-in-worklet'}];const audio=new LoomAudio(s),messages=[];audio._send=m=>messages.push(m);audio.setState(s);const payload=messages.find(m=>m.type==='state').state;assert.equal(payload.tracks.length,8);assert.equal(payload.returns.length,2);assert.equal(payload.master.effects.length,4);assert.deepEqual(payload.tracks[0].sends,[.2,.4]);assert(!JSON.stringify(payload).includes('native-heavy-data'));assert(!JSON.stringify(payload).includes('payload-does-not-belong-in-worklet'));assert.notEqual(payload.tracks[0].sends,s.tracks[0].sends);
});
await check('Strict stem selection and real WAV output match the shared Core without master inserts',async()=>{
  const s=state(),asset={sampleRate:RATE,left:tone(173,.09,.3),right:tone(719,.06,.3)};s.tracks[0].instrumentLive=false;s.tracks[0].clips=[{assetId:'source',start:0,length:1,sourceStart:0,sourceEnd:.3,sourceOffset:0,rate:1,loop:false,reverse:false,gain:1,fadeIn:0,fadeOut:0}];s.tracks[0].sends[0]=.7;s.returns[0].effects[0]=fx('cinder',{drive:10,mix:1});s.master.effects[0]=fx('prism',{high:-14});const assets=new Map([['source',asset]]),audio=new LoomAudio(s),snapshot=JSON.stringify(s);
  for(const options of [{trackId:'missing'},{returnId:'return-3'},{returnId:0},{returnId:'return-1',trackId:'track-1'}])await assert.rejects(audio.renderWav(s,assets,options));assert.throws(()=>new DSP.Core(s,assets,RATE,{trackId:'bad'}));assert.throws(()=>new DSP.Core(s,assets,RATE,{returnId:'return-3'}));
  for(const options of [{},{trackId:'track-1'},{returnId:'return-1'}]){const blob=await audio.renderWav(s,assets,{...options,startBeat:0,endBeat:1,tailSeconds:.25}),view=new DataView(await blob.arrayBuffer()),core=new DSP.Core(s,assets,RATE,{linear:true,...options});core.start(0);let maximum=0,at=0;while(at<36000){if(at===24000)core.stop();const n=Math.min(128,36000-at,at<24000?24000-at:36000-at),l=new Float32Array(n),r=new Float32Array(n);core.processBlock(l,r);for(let i=0;i<n;i++)for(let ch=0;ch<2;ch++){const sample=Math.max(-1,Math.min(1,ch?r[i]:l[i])),expected=Math.round(sample*(sample<0?32768:32767));maximum=Math.max(maximum,Math.abs(expected-view.getInt16(44+(at+i)*4+ch*2,true)));}at+=n;}assert(maximum<=1,'WAV/Core block mismatch '+maximum);assert.equal(view.byteLength,44+36000*4);}
  assert.equal(JSON.stringify(s),snapshot);assert.equal(audio._exportCount,0);
});
const timings=[];for(const active of [false,true]){const s=state();if(active){for(let t=0;t<8;t++)s.tracks[t].sends=[.15,.15];s.returns[0].effects[0]=fx('vestige',{mix:1});s.returns[1].effects[0]=fx('parallax',{mix:1});s.master.effects[0]=fx('velvet',{model:'bus-4k'});}const core=new DSP.Core(s,{},RATE,{linear:true}),sources=Array.from({length:8},()=>[tone(173,.02,128/RATE)]),l=new Float32Array(128),r=l.slice();core.start();for(let i=0;i<100;i++)core.processBlock(l,r,inputsAt(sources,0,128));const start=performance.now();for(let i=0;i<250;i++)core.processBlock(l,r,inputsAt(sources,0,128));timings.push({active,blockMs:+((performance.now()-start)/250).toFixed(3)});}
console.log(passed.length+' bus routing checks passed. Stereo128-frame CPU '+JSON.stringify(timings));
})().catch(error=>{console.error(error);process.exitCode=1;});
