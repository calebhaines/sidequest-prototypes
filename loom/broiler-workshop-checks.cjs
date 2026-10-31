// Actual BROILER workshop DSP; no browser, substitutions, or audio device.
// Run: node loom/broiler-workshop-checks.cjs
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const {performance} = require('node:perf_hooks');
globalThis.window = globalThis;
for (const file of ['broiler-pedals.js','char-catalog.js', 'effects-catalog.js','char-dsp.js', 'effects.js','schema.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname,file),'utf8'),{filename:file});
const dsp=createLoomEffectsDSP(), definition=LoomEffectsCatalog.find(d=>d.id==='broiler'), sr=48000;
const modern=['tweed-55','black-panel-65','copper-30','royal-68','iron-800','dual-red-92','cali-iv','fifty-one','citrus-verb','jazz-120'];
const legacy={"44100":{"model:clean-bass":"ba6452757501db10adf480c686f713c06e2fed73612be15f27c288c1cd23437e","model:flip-top":"1691d627189b11539a12df5ebca66854f5e66c1f7d60f2d34041e420a7a34b29","model:valve-stack":"d4d302ae77262f2b4a4db504e5b58b2736608e8bb5c3f1ef9bf04b43bdee904a","model:modern-grind":"b7e5957fada22554ee4ba133f2ff62f9fc7329d18c51d05d9300f85feaf58108","model:doom-fuzz":"58ffabcaf5defd85e0d57c793243d3f7e42cda9a9831d719423b78dbd264016f","model:american-clean":"37f4170f4959a1b8dc7aa23de76b98a35ef902135520810497757585fb7d609d","model:british-crunch":"7a35eaf37ced7673367c3a3dff111dba58488ea4eb4feedbb5590074eda1e7a3","model:high-gain":"239afc2b1dcd1e5f55c480a3f8ca72718653d5ea4e55d42a798b29d2bf2a0b95","model:portaflex-64":"a5908dd812b19a4b6b9b61eba18f4cdf73b619783f124ec00360381657aad264","model:svt-69":"f0b0160695ccecbdeb14a3c5831694c6af491a597e4ca5e8083aa9bf1886128c","model:v4b-71":"446fa16bb3d2530906211e74e6a01dd3271f9c9196d1792531c5a3837a79626d","model:svt-pro":"07fe7ca91ccda204a69931c05598b9d02da666812d86ba15c8370325b1b87afd","preset:house-bass":"aaf3209ee3d3188ae3e6c4a32b3a664a4ce41ed979158214acb04da8597eac42","preset:sunday-stock":"48566f1369e44b675493f3f74e0b2898d28e0847f45b53f2b75919354a2a1319","preset:full-stack":"18c1577fe6fdbb9e668ead7eadb0e0f37b4c28b7c0f653ceb6aec4da4b4d1b61","preset:knife-edge":"348e33c38ec92f440dfdd54f2b453b521ecb4c3e3642df73693494d81219b4d8","preset:burnt-bottom":"544e3cccff559d584bb0ad512d5df9277e73d95d95acd93d15ef71f9fef201d9","preset:glassware":"539a8527fc6132e65a5ff2c8bfa0c29ca5639af13a6627d7ea5b23175f9034f6","preset:hot-pass":"3e8ce449ab24a0c5e069d9927ff060da0377b05428591ee149a402fa0f129837","preset:after-hours":"daacfa45a759111f2ed4c8a8eb9b64a3b024542fd2b29e66eeee2d7e27d9d066","preset:steel-cupboard":"cc2b71ace1417f3632d5ade76e1274b20cda39681ada40fa678b6b5ac957a656","preset:blue-plate":"90f95089ff508fbd78d61d254e4b1c05a1e75ed12081f2af968efbd689a39072","preset:walk-in-fridge":"d1685b0595f0ed4db15e7e47346e791914d81832a4a9a48792f814ff1962112e","preset:four-burner":"27e896e747ceb0ef949ce9f39bfd2bbe37b68f896084bd0a8b9d0b39414acb22","preset:night-service":"0e3f2c59c9b59f8b065f553cf37bc87db4bf0acccb1d0ba5d9f0ff918193be9b"},"48000":{"model:clean-bass":"bbd83187e90099f739f1d8ab053b0d593bfcdc597be767c696c8d4b552d7a4f2","model:flip-top":"6567de5eae12d8d549e8b10b5990b6ad3eb0a2a02f9cf3c37322249a65856bf0","model:valve-stack":"16588ff690720270c7360d894e41c1348c907e9680de4ec4bb251d6a6fb4b84a","model:modern-grind":"d512cf529690f93032cd6341a1998db988e8a62b4c6bcfd6aac2f499cf75815b","model:doom-fuzz":"8f237cd895255c7dc9cafbf8283788ac3250b46a1d853e1b0cfb033e2761642e","model:american-clean":"abd36a5357c514e20657347468622b5b2e65caaf61f3dc5c8f6ee1a53ae4e975","model:british-crunch":"fe1eb982d8efac29200b0bb559b6029b03a55e0c0b1095bf5e0a3f2facc90daa","model:high-gain":"2c15c7a79d213c1db9a921e2354cf0351742cd96587603d664331df11a35ef13","model:portaflex-64":"8744a003cfefdf757fdd7abc3b93086941f76a0feddff27873854d52eba3d8dd","model:svt-69":"b93f71fd42302be98e7c6751a816e9def98f5e19736c390fdc62a85c2a31a8a8","model:v4b-71":"b893ad2ab16489c997a62456d5b2eb00c6ed68119667aed36784d5bcc6561187","model:svt-pro":"b097ea5ee86f0fa685eeef4ed8a1321169856a51fd0ea544fa5d6baf184fc833","preset:house-bass":"6e2631541814fbc62bf4ca755186025c17975a1f8377c672104b04d0b3d8b816","preset:sunday-stock":"b1b7f2bf75d4e3bc4fbbd6f58a0de29c4a149806e27b8ed806299fc0ae29a822","preset:full-stack":"c7b033c907313884ecaba0f2c753105b928467fa513f8eb2829c14e09e8d0012","preset:knife-edge":"4138756f3b61554d16a10ee104b23d2d2754e21fd8ccf6ed635ab2827cb007f2","preset:burnt-bottom":"02f622882edef12a02dcf1c17b15d2873517db29fc351be6baaa4646a4c8f445","preset:glassware":"bff3dd627a8a85a81070664c1206bf57ae95ba13dedb66b5fda4176245dbd0ca","preset:hot-pass":"05055b74cdb4c4a7fcb1d729d6004a3374e3589e81913deb5900b589cd5170ec","preset:after-hours":"8cd20682d5c9dc7da4a2af80a4639f6c163388704525f58e1b1ef5101656a518","preset:steel-cupboard":"ada3801b861e97607a8a60ed4ba0fa23de68965bc5b6e8953805679eed02442f","preset:blue-plate":"25e937ed98f43a6b38e21be1d2a687a53f108c4d01d8352baf6bffb8dda0cb4b","preset:walk-in-fridge":"0043c84de3601d4234d0d3f0cc8f191e037cfcdc4fb5a7433ad0be349e92a664","preset:four-burner":"d17670e0f73d77ede811e47b545ab03552d755a9495a1cddaf38fd0863384098","preset:night-service":"44f05a96e63763d552a77afb9853cc3c74509148d804d76e36ab691e67dc6011"}};
const passed=[];function check(name,fn){fn();passed.push(name);console.log('PASS '+name);}
function signal(rate=sr,seconds=.32,level=.18){return Float32Array.from({length:Math.round(rate*seconds)},(_,i)=>{const t=i/rate;return Math.min(1,t*200)*level*(Math.sin(2*Math.PI*110*t)+.45*Math.sin(2*Math.PI*220*t)+.22*Math.sin(2*Math.PI*1700*t)+.14*Math.sin(2*Math.PI*5200*t));});}
function rms(a,start=0,end=a.length){let energy=0;for(let i=start;i<end;i++)energy+=a[i]*a[i];return Math.sqrt(energy/Math.max(1,end-start));}
function difference(a,b){let energy=0;for(let i=0;i<a.length;i++)energy+=(a[i]-b[i])**2;return Math.sqrt(energy/a.length);}
function hash(a){return createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');}
function peak(a){let v=0;for(const x of a)v=Math.max(v,Math.abs(x));return v;}
function finite(a){assert(a.every(x=>Number.isFinite(x)&&Math.abs(x)<=8));}
function amplitude(a,hz,rate=sr){let re=0,im=0,start=Math.floor(a.length/2);for(let i=start;i<a.length;i++){const phase=2*Math.PI*hz*i/rate;re+=a[i]*Math.cos(phase);im+=a[i]*Math.sin(phase);}return 2*Math.hypot(re,im)/(a.length-start);}
function render(params={},source=signal(),block=128,rate=sr,factory=dsp,right=source){const insert=factory.create('broiler',rate,params),left=source.slice(),r=right.slice();for(let at=0;at<left.length;at+=block)insert.process(left.subarray(at,at+block),r.subarray(at,at+block),{tempo:120});return {left,right:r,insert};}
const neutral={model:'royal-68',cabinet:'di',cleanLow:0,drive:12,gate:-90,bass:0,mid:0,treble:0,output:-8};
check('All twelve stock heads and thirteen original rigs retain exact 44.1/48 kHz audio',()=>{
  for(const rate of [44100,48000]){const source=Float32Array.from({length:Math.round(rate*.2)},(_,i)=>.15*Math.sin(2*Math.PI*55*i/rate)+.04*Math.sin(2*Math.PI*1700*i/rate));
    for(const [key,expected]of Object.entries(legacy[rate])){const [kind,id]=key.split(':');const params=kind==='model'?{model:id}:definition.presets.find(p=>p.id===id).params;assert.equal(hash(render(params,source,128,rate).left),expected,key+' @'+rate);}}
});
check('Ten new families differ in normalized waveform, gain staging and spectral balance',()=>{
  const audio=modern.map(model=>render({...neutral,model},signal(sr,.4)).left),normalized=audio.map(a=>Float32Array.from(a,x=>x/rms(a)));
  for(let a=0;a<modern.length;a++){finite(audio[a]);assert(rms(audio[a])>.008,modern[a]);for(let b=0;b<a;b++)assert(difference(normalized[a],normalized[b])>.035,modern[a]+' vs '+modern[b]);
    const clean=render({...neutral,model:modern[a],drive:0,master:.15}).left,hot=render({...neutral,model:modern[a],drive:28,master:.95}).left;assert(difference(clean,hot)>.004,modern[a]+' gain response');}
});
check('Workshop controls change signal inside preamp, power and cabinet stages',()=>{
  const controls={bias:[-.65,.65],voltage:[.6,1.4],feedback:[0,1],tightness:[0,1],bright:[0,1],coupling:[0,1],cathode:[0,1],transformer:[0,1],powerScale:[.1,1],preampTube:['12ax7','12au7'],powerTube:['6v6','kt88'],toneStack:['american','british']};
  for(const [key,values]of Object.entries(controls)){const a=render({...neutral,[key]:values[0]}).left,b=render({...neutral,[key]:values[1]}).left;assert(difference(a,b)>.00015,key+' must affect actual audio');}
  const hashes=new Set(['stock','american','british','baxandall','james','flat'].map(toneStack=>hash(render({...neutral,toneStack}).left)));assert.equal(hashes.size,5); // Stock Royal intentionally resolves to the British stack.
  const cab={...neutral,cabinet:'guitar412'};
  for(const [key,values]of Object.entries({micType:['dynamic57','ribbon121'],cabLowCut:[0,250],cabHighCut:[1000,20000],cabResonance:[0,1]}))assert(difference(render({...cab,[key]:values[0]}).left,render({...cab,[key]:values[1]}).left)>.0002,key);
  assert.deepEqual(render({...neutral,micType:'ribbon121',cabLowCut:250,cabHighCut:1000,cabResonance:1}).left,render(neutral).left,'DI ignores cabinet controls');
});
check('Jazz solid-state path stays linear at normal level; valve substitution creates harmonics',()=>{
  const source=Float32Array.from({length:sr*.4},(_,i)=>.035*Math.sin(2*Math.PI*200*i/sr)),patch={model:'jazz-120',cabinet:'di',cleanLow:0,speakerDrive:0,drive:0,master:.1,sag:0,toneStack:'flat',bass:0,mid:0,treble:0,output:0,gate:-90};
  const clean=render(patch,source).left,hard=render({...patch,preampTube:'12ax7',drive:30},Float32Array.from(source,x=>x*5)).left;
  const thd=a=>Math.hypot(...[400,600,800,1000].map(hz=>amplitude(a,hz)))/amplitude(a,200);
  assert(thd(clean)<.002,'unwanted clean-path harmonics '+thd(clean));assert(thd(hard)>thd(clean)*10,'valve stage must be audible');
});
check('Pedals retain order and pre/post positions; amp-only bypass leaves pedalboard working',()=>{
  const source=signal(),off={ampEnable:'off',cabinet:'di',input:0,output:0,mix:1};assert.deepEqual(render(off,source).left,source);
  const cabOnly=render({...off,cabinet:'guitar412',micType:'dynamic57',cabHighCut:3500},source).left;assert(difference(cabOnly,source)>.01);assert(difference(cabOnly,render({...off,cabinet:'guitar412',micType:'ribbon121',cabHighCut:1500},source).left)>.001,'cabinet works with head off');
  const a={...neutral,pedal1Type:'green-808',pedal1Enabled:'on',pedal1Drive:.75,pedal1Tone:.3,pedal1Route:'pre',pedal2Type:'rodent',pedal2Enabled:'on',pedal2Drive:.7,pedal2Tone:.7,pedal2Route:'pre'};
  const b={...a,pedal1Type:a.pedal2Type,pedal1Drive:a.pedal2Drive,pedal1Tone:a.pedal2Tone,pedal2Type:a.pedal1Type,pedal2Drive:a.pedal1Drive,pedal2Tone:a.pedal1Tone};
  assert(difference(render(a).left,render(b).left)>.002,'pedal order');assert(difference(render(a).left,render({...a,pedal1Route:'post'}).left)>.002,'pre/post');
  const board={...off,pedal1Type:'rodent',pedal1Enabled:'on',pedal1Drive:.8};assert(difference(render(board,source).left,source)>.005);assert.deepEqual(render({...board,pedal1Enabled:'off'},source).left,source);assert.deepEqual(render({...board,pedal1Mix:0},source).left,source);
  const isolated=vm.runInNewContext('('+createLoomEffectsDSP.toString()+')',{Math,Number,Float32Array,Float64Array,Int32Array});assert.doesNotThrow(()=>isolated().create('broiler',sr,{}));assert.throws(()=>isolated().create('broiler',sr,board),/pedal DSP is unavailable/);
});
check('Whole-rig output is linear after post-cab distortion and preserves its harmonic shape',()=>{
  const p={...neutral,pedal3Type:'rodent',pedal3Enabled:'on',pedal3Drive:.8,pedal3Route:'post'},lo=render({...p,output:-12}).left,hi=render({...p,output:-6}).left,ratio=10**(6/20);
  assert(Math.abs(rms(hi)/rms(lo)-ratio)<1e-7);assert(difference(hi,Float32Array.from(lo,x=>x*ratio))<6e-8);
});
check('Long echo/spring tails survive one second and add through serial slots',()=>{
  const params={ampEnable:'off',cabinet:'di',output:0,pedal1Type:'echo',pedal1Enabled:'on',pedal1Route:'post',pedal1Drive:.85,pedal1Tone:.7,pedal1Mix:1,pedal2Type:'spring',pedal2Enabled:'on',pedal2Route:'post',pedal2Drive:.5,pedal2Tone:.5,pedal2Mix:.6};
  const source=new Float32Array(sr*4);source[0]=.5;const full=render(params,source,128),split=render(params,source,997);assert.deepEqual(full.left,split.left);assert(rms(full.left,sr,sr*2)>.00001,'tail truncated at one second');
  const board=createLoomBroilerPedalsDSP(),echo=board.create(sr,{type:'echo',enabled:true,drive:.85,tone:.7,level:0,mix:1}),spring=board.create(sr,{type:'spring',enabled:true,drive:.5,tone:.5,level:0,mix:.6});assert(full.insert.getTailTime()>=Math.min(90,echo.getTailTime()+spring.getTailTime())-1e-9);
  full.insert.setParams({pedal1Enabled:'off',pedal2Enabled:'off'});assert.equal(full.insert.getTailTime(),0);
});
check('Serialized factory, odd blocks, reset, bypass, zero wet and stereo histories agree exactly',()=>{
  const make=vm.runInNewContext('('+createLoomEffectsDSP.toString()+')',{Math,Number,Float32Array,Float64Array,Int32Array}),pedals=vm.runInNewContext('('+createLoomBroilerPedalsDSP.toString()+')',{Math,Number,Float32Array,Float64Array,Int32Array}),factory=make(null,null,null,null,pedals);
  const source=signal(sr,.4),right=Float32Array.from(source,(x,i)=>i%2?x*.6:-x*.2),p={...neutral,bias:.4,cathode:.8,transformer:.65,pedal1Type:'green-808',pedal1Enabled:'on',pedal3Type:'chorus',pedal3Enabled:'on',pedal3Mix:.5};
  const normal=render(p,source,128,sr,dsp,right),odd=render(p,source,73,sr,factory,right);assert.deepEqual(normal.left,odd.left);assert.deepEqual(normal.right,odd.right);normal.insert.reset();const l=source.slice(),r=right.slice();normal.insert.process(l,r);assert.deepEqual(l,normal.left);assert.deepEqual(r,normal.right);
  for(const change of [{mix:0},{bypass:true}]){const dry=render({...p,...change},source,128,sr,dsp,right);assert.deepEqual(dry.left,source);assert.deepEqual(dry.right,right);}
  const mono=render({...p,stereo:'mono'},source,128,sr,dsp,right);assert(mono.left.every((x,i)=>x===mono.right[i]));
  const silent=render(p,new Float32Array(5000));assert.equal(peak(silent.left),0);assert.equal(peak(silent.right),0);assert(Object.values(normal.insert.getMeters()).every(Number.isFinite));
});
check('Continuous Workshop changes remain block-partition invariant',()=>{
  const source=signal(sr,.3);function automate(block){const e=dsp.create('broiler',sr,{...neutral,voltage:.6}),x=source.slice(),y=source.slice();for(const [from,to,p]of[[0,4800,{voltage:1.4,bias:.7,feedback:1}],[4800,x.length,{voltage:.7,bias:-.5,feedback:0,transformer:1}]]){e.setParams(p);for(let i=from;i<to;i+=block)e.process(x.subarray(i,Math.min(i+block,to)),y.subarray(i,Math.min(i+block,to)));}return x;}assert.deepEqual(automate(128),automate(997));
});
check('First Workshop edits and head changes use a deterministic five-millisecond declick',()=>{
  const source=signal(sr,.25);function change(next,block){const e=dsp.create('broiler',sr,{model:'clean-bass',cabinet:'di',output:-8,cleanLow:0}),x=source.slice(),y=x.slice(),boundary=4096;for(let i=0;i<boundary;i+=block)e.process(x.subarray(i,Math.min(i+block,boundary)),y.subarray(i,Math.min(i+block,boundary)));e.setParams(next);for(let i=boundary;i<x.length;i+=block)e.process(x.subarray(i,Math.min(i+block,x.length)),y.subarray(i,Math.min(i+block,y.length)));assert(Math.abs(x[boundary]-x[boundary-1])<1e-7,'parameter switch jumps');finite(x);return x;}
  for(const patch of [{bias:.01},{model:'fifty-one'},{ampEnable:'off'}])assert.deepEqual(change(patch,128),change(patch,73));
});
check('Extreme rates and Workshop combinations stay bounded and decay without idle oscillation',()=>{
  for(const rate of [8000,44100,48000,96000,192000])for(const model of modern){const source=signal(rate,.025,1.5);for(const extreme of [0,1]){const p={model,cabinet:'metalbox',cleanLow:0,drive:36,input:24,master:1,output:12,bias:extreme?.8:-.8,voltage:extreme?1.4:.6,feedback:extreme,tightness:extreme,coupling:extreme,cathode:extreme,transformer:1,powerScale:extreme?1:.1,cabLowCut:250,cabHighCut:1000,cabResonance:1,powerTube:extreme?'el84':'kt88'};finite(render(p,source,73,rate).left);}}
  for(const model of ['tweed-55','dual-red-92','fifty-one','jazz-120']){const source=new Float32Array(sr*2);source.set(signal(sr,.1,.8));const audio=render({...neutral,model,bias:.7,drive:30,feedback:1,transformer:1,cathode:1,coupling:1,sag:1},source).left;finite(audio);assert(rms(audio,Math.round(sr*.8),sr)<.0001,model+' idle oscillation');assert.equal(peak(audio.subarray(sr*1.2)),0);}
});
// Timing is informational; a machine-dependent hard limit would be flaky.
const timings=[];for(const rate of [44100,48000,96000]){const x=signal(rate,.05),p={...neutral,model:'fifty-one',cabinet:'guitar412',bias:.4,transformer:1,pedal1Type:'green-808',pedal1Enabled:'on',pedal2Type:'studio-comp',pedal2Enabled:'on',pedal3Type:'echo',pedal3Enabled:'on',pedal4Type:'spring',pedal4Enabled:'on'},e=dsp.create('broiler',rate,p);const left=new Float32Array(128),right=new Float32Array(128);for(let n=0;n<150;n++){left.set(x.subarray(0,128));right.set(left);e.process(left,right);}const start=performance.now();for(let n=0;n<300;n++){left.set(x.subarray(0,128));right.set(left);e.process(left,right);}timings.push({rate,blockMs:+((performance.now()-start)/300).toFixed(3),budgetMs:+(128/rate*1000).toFixed(3)});}
console.log(passed.length+' BROILER workshop checks passed. Warm stereo128-frame CPU: '+JSON.stringify(timings));
