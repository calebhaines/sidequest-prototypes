'use strict';
// Real BUTTER DSP. Portable, deterministic, no browser or audio hardware.
// Run: node loom/compressor-checks.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const {performance} = require('node:perf_hooks');
globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'compressor-dsp.js'),'utf8'),{filename:'compressor-dsp.js'});
const dsp = createLoomCompressorDSP(), models = dsp.specifications.model, sr = 48000;
const passed=[];
function check(name,fn){fn();passed.push(name);console.log('PASS '+name);}
function tone(hz=1000,amplitude=.3,seconds=.3,rate=sr){return Float32Array.from({length:Math.round(seconds*rate)},(_,i)=>amplitude*Math.sin(2*Math.PI*hz*i/rate));}
function rms(a,start=0,end=a.length){let e=0;for(let i=start;i<end;i++)e+=a[i]*a[i];return Math.sqrt(e/Math.max(1,end-start));}
function peak(a){let p=0;for(const x of a)p=Math.max(p,Math.abs(x));return p;}
function difference(a,b){let e=0;for(let i=0;i<a.length;i++)e+=(a[i]-b[i])**2;return Math.sqrt(e/a.length);}
function finite(a){assert(a.every(x=>Number.isFinite(x)&&Math.abs(x)<=8));}
function feed(insert,left,right=left,block=128){const l=left.slice(),r=right.slice();for(let at=0;at<l.length;at+=block)insert.process(l.subarray(at,at+block),r.subarray(at,at+block));return {left:l,right:r};}
function render(params={},left=tone(),right=left,block=128,rate=sr,factory=dsp){const insert=factory.create(rate,params);return {...feed(insert,left,right,block),insert};}
function amplitude(a,hz,rate=sr){let real=0,imaginary=0,start=Math.floor(a.length/2);for(let i=start;i<a.length;i++){const phase=2*Math.PI*hz*i/rate;real+=a[i]*Math.cos(phase);imaginary+=a[i]*Math.sin(phase);}return 2*Math.hypot(real,imaginary)/(a.length-start);}
const neutral={threshold:-24,ratio:4,attack:12,release:180,knee:6,makeup:0,colour:0};
check('Original Clean retains released stereo PCM and ignores analog-only settings',()=>{
  const legacy=JSON.parse(fs.readFileSync(path.join(__dirname,'compressor-legacy-fixtures.json'),'utf8'));
  for(const rate of [8000,48000])for(const name of ['default','hard','parallel','dry']){
    const frames=Math.round(rate*.3),left=new Float32Array(frames),right=new Float32Array(frames);
    for(let i=0;i<frames;i++){const t=i/rate,envelope=t<.05?.03:t<.15?.6:t<.19?.08:.32;left[i]=envelope*(.7*Math.sin(2*Math.PI*73*t)+.3*Math.sin(2*Math.PI*1703*t));right[i]=envelope*(.6*Math.cos(2*Math.PI*113*t)-.2*Math.sin(2*Math.PI*571*t));}
    const params={...legacy.defaults,...legacy.cases[name]},a=render(params,left,right,128,rate),hash=createHash('sha256').update(Buffer.from(a.left.buffer)).update(Buffer.from(a.right.buffer)).digest('hex');assert.equal(hash,legacy.hashes[rate][name]);
    const b=render({...params,colour:1,timing:'classic',fetMode:'all-buttons',thrust:'loud'},left,right,73,rate);assert.deepEqual(b.left,a.left);assert.deepEqual(b.right,a.right);
  }
});
check('Nine identical-knob responses differ beyond gain, with calibrated static ratios',()=>{
  const source=new Float32Array(sr*.5);source.set(tone(173,.65,.12),4800);source.set(tone(173,.11,.12),11040);
  const audio=models.map(model=>render({...neutral,model},source).left),normal=audio.map(a=>Float32Array.from(a,x=>x/Math.max(1e-10,rms(a))));
  for(let a=0;a<models.length;a++){finite(audio[a]);assert(rms(audio[a])>.005);for(let b=0;b<a;b++)assert(difference(normal[a],normal[b])>.006,models[a]+' aliases '+models[b]);}
  const rate=12000;
  for(const model of models.slice(1)){
    const low=render({...neutral,model,knee:0,threshold:-30,timing:'classic'},tone(1000,.12,2,rate),undefined,128,rate).left;
    const high=render({...neutral,model,knee:0,threshold:-30,timing:'classic'},tone(1000,.38,2,rate),undefined,128,rate).left;
    const inputStep=20*Math.log10(.38/.12),outputStep=20*Math.log10(rms(high,rate*1.5)/rms(low,rate*1.5)),actualRatio=inputStep/outputStep;
    assert(actualRatio>(model==='vari-670'?2.4:3.3)&&actualRatio<5,model+' effective ratio '+actualRatio);
  }
});
check('Classic families retain distinct attack and release laws; manual controls remain audible',()=>{
  const source=new Float32Array(sr*.7);source.set(tone(1000,.6,.2),sr*.05);
  const histories=[];for(const model of models.slice(1)){const e=dsp.create(sr,{...neutral,model,timing:'classic'}),values=[];for(let at=0;at<source.length;at+=240){feed(e,source.subarray(at,at+240));values.push(e.getMeters().reductionDb);}histories.push(values);}
  for(let a=0;a<histories.length;a++)for(let b=0;b<a;b++)assert(Math.hypot(...histories[a].map((x,i)=>x-histories[b][i]))>.3,models[a+1]+' same timing '+models[b+1]);
  for(const model of models.slice(1)){
    const fast=render({...neutral,model,attack:.02,release:20},source).left,slow=render({...neutral,model,attack:100,release:5000},source).left;assert(difference(fast,slow)>.002,model+' manual controls');
  }
});
check('Optical trapped-charge exposure prolongs normalized recovery after sustained notes',()=>{
  const rate=12000;
  function history(model,seconds){const e=dsp.create(rate,{...neutral,model,timing:'classic'});feed(e,tone(1000,.75,seconds,rate));const initial=e.getMeters().reductionDb;feed(e,new Float32Array(rate*.3));return {initial,after:e.getMeters().reductionDb};}
  for(const model of ['opto-2a','opto-3a']){const short=history(model,.072),long=history(model,2);assert(long.after>short.after+.5,model);assert(long.after/long.initial>short.after/short.initial+.06,model+' lacks exposure memory');}
});
check('Threshold, ratio, knee, input, makeup and detector high-pass affect actual audio',()=>{
  for(const [key,values]of Object.entries({threshold:[-42,-10],ratio:[1,20],knee:[0,18],input:[-12,12]})){const a=render({...neutral,model:'bus-4k',[key]:values[0]},tone(1000,key==='knee'?.07:.3)).left,b=render({...neutral,model:'bus-4k',[key]:values[1]},tone(1000,key==='knee'?.07:.3)).left;assert(difference(a,b)>.0003,key);}
  const source=tone(1000,.06),patch={...neutral,model:'opto-2a',colour:.8};const lo=render({...patch,makeup:-6},source).left,hi=render({...patch,makeup:0},source).left,ratio=10**(.3);assert(Math.abs(rms(hi)/rms(lo)-ratio)<1e-7);assert(difference(hi,Float32Array.from(lo,x=>x*ratio))<2e-8,'makeup must follow colour');
  const low=tone(45,.6,.5),a=render({...neutral,model:'bus-4k',sidechain:20},low),b=render({...neutral,model:'bus-4k',sidechain:500},low);assert(a.insert.getMeters().reductionDb>b.insert.getMeters().reductionDb+4);
});
check('FET all-buttons and Bus2500 Thrust change their intended dynamics only',()=>{
  const p={...neutral,model:'fet-76',timing:'classic'},source=tone(1000,.7,.3),normal=render(p,source),all=render({...p,fetMode:'all-buttons'},source);assert(difference(normal.left,all.left)>.005);assert(all.insert.getMeters().reductionDb>normal.insert.getMeters().reductionDb+1);
  for(const hz of [70,5000]){const x=tone(hz,.6,.4),off=render({...neutral,model:'bus-2500',thrust:'off'},x),loud=render({...neutral,model:'bus-2500',thrust:'loud'},x);assert(difference(off.left,loud.left)>.002);if(hz===70)assert(off.insert.getMeters().reductionDb>loud.insert.getMeters().reductionDb+2);}
  assert.deepEqual(render({...neutral,model:'opto-3a',fetMode:'all-buttons',thrust:'loud'}).left,render({...neutral,model:'opto-3a'}).left);
});
check('Colour adds bounded, DC-controlled harmonics; colour0/ratio1 has no audio buffer delay',()=>{
  for(const model of models.slice(1)){
    const p={model,ratio:1,threshold:0,makeup:0,colour:1},source=tone(200,.75,.4),clean=render({...p,colour:0},source).left,hot=render(p,source).left;finite(hot);assert(difference(clean,hot)>.0001,model+' colour');const harmonics=Math.hypot(...[400,600,800,1000].map(hz=>amplitude(hot,hz)));assert(harmonics>amplitude(clean,600)+.00005,model+' harmonics');let mean=0;for(let i=sr*.2;i<hot.length;i++)mean+=hot[i];mean/=(hot.length-sr*.2);assert(Math.abs(mean)<.002,model+' excess DC '+mean);
    const impulse=new Float32Array(256);impulse[37]=.2;const x=render({...p,colour:0},impulse).left;assert.deepEqual(x,impulse,model+' added buffer/phase change');
  }
});
check('Stereo max linking survives anti-phase input and dual mono avoids cross-channel ducking',()=>{
  const left=tone(1000,.7,.4),right=tone(1000,.03,.4),inverse=Float32Array.from(left,x=>-x);
  for(const model of models){const p={...neutral,model};const anti=render(p,left,inverse);assert(anti.left.every((x,i)=>Math.abs(x+anti.right[i])<1e-7),model+' anti-phase');assert(anti.insert.getMeters().reductionDb>5);const linked=render({...p,link:1},left,right),dual=render({...p,link:0},left,right);assert(rms(dual.right,sr*.2)>rms(linked.right,sr*.2)*1.5,model+' link control');}
});
check('Bypass, dynamic zero-wet, silent equilibrium and reset remain exact',()=>{
  const source=tone(173,.35),right=tone(277,.15);
  for(const model of models){const e=dsp.create(sr,{...neutral,model,colour:.8}),a=feed(e,source,right);e.reset();const b=feed(e,source,right);assert.deepEqual(a,b,model+' reset');e.setParams({mix:0});assert.deepEqual(feed(e,source,right),{left:source,right});e.setParams({bypass:true,mix:1});assert.deepEqual(feed(e,source,right),{left:source,right});e.reset();e.setParams({bypass:false});const silence=feed(e,new Float32Array(4800));assert.equal(peak(silence.left),0);assert.equal(peak(silence.right),0);assert(Object.values(e.getMeters()).every(Number.isFinite));}
});
check('Serialized factory, awkward block partitions and smoothed automation are sample-identical',()=>{
  const make=vm.runInNewContext('('+createLoomCompressorDSP.toString()+')',{Math,Number,Float32Array,Float64Array,Int32Array}),isolated=make(),source=tone(173,.65,.3),right=tone(719,.3,.3);
  for(const model of models){const p={...neutral,model,colour:.7,timing:'classic'};const a=render(p,source,right,128),b=render(p,source,right,37,sr,isolated);assert.deepEqual(a.left,b.left,model+' left partition');assert.deepEqual(a.right,b.right,model+' right partition');}
  function automate(block){const e=dsp.create(sr,{...neutral,model:'bus-2500',colour:.7}),l=source.slice(),r=right.slice();for(const [from,to,p]of[[0,4096,{input:12,threshold:-30,makeup:-6}],[4096,8192,{model:'fet-76',fetMode:'all-buttons'}],[8192,l.length,{model:'vca-160',input:-6,colour:0}]]){e.setParams(p);for(let i=from;i<to;i+=block)e.process(l.subarray(i,Math.min(to,i+block)),r.subarray(i,Math.min(to,i+block)));if(from)assert(Math.abs(l[from]-l[from-1])<1e-7,'model transition click');}return {l,r};}
  assert.deepEqual(automate(128),automate(997));
});
check('Detector unit transitions and inactive colour cannot revive stale state',()=>{
  const e=dsp.create(sr,{...neutral,model:'fet-76',attack:2,colour:0});feed(e,tone(1000,.3,.3));const before=e.getMeters().reductionDb;e.setParams({model:'vca-160'});let maximum=0;const continued=tone(1000,.3,.02);for(let i=0;i<continued.length;i+=37){feed(e,continued.subarray(i,i+37));maximum=Math.max(maximum,e.getMeters().reductionDb);}assert(maximum<before+.5,'peak amplitude reinterpreted as RMS energy');
  const c=dsp.create(sr,{...neutral,model:'opto-2a',colour:1});feed(c,tone(173,.9,.2));c.setParams({colour:0});feed(c,new Float32Array(sr*.25));c.setParams({colour:1});assert.equal(peak(feed(c,new Float32Array(1024)).left),0,'stale colour filters resurrected');
});
check('Extreme timing/level combinations stay bounded at 8–192 kHz and recover without autonomous noise',()=>{
  for(const rate of [8000,48000,192000])for(const model of models){const source=tone(731,6,.012,rate);for(const high of [false,true]){const p={model,threshold:high?-48:0,ratio:high?40:1,attack:high?.02:100,release:high?20:5000,knee:high?18:0,input:high?24:-24,makeup:high?24:-12,colour:1,link:high?0:1,fetMode:'all-buttons',thrust:'loud'};const e=render(p,source,source,37,rate);finite(e.left);finite(e.right);e.insert.setParams({threshold:NaN,input:Infinity,model:'missing'});assert(Object.values(e.insert.getMeters()).every(Number.isFinite));}}
  for(const model of models.slice(1)){const e=dsp.create(12000,{...neutral,model,colour:1,timing:'classic'});feed(e,tone(180,.8,.2,12000));const tail=feed(e,new Float32Array(12000));finite(tail.left);assert(peak(tail.left.subarray(6000))<1e-5,model+' autonomous colour oscillation');}
});
const timings=[];for(const model of ['clean','fet-76','opto-2a','vari-670','diode-609']){const e=dsp.create(sr,{...neutral,model,colour:1}),l=tone(173,.3,128/sr),r=l.slice();for(let k=0;k<150;k++){l.fill(.2);r.fill(.1);e.process(l,r);}const start=performance.now();for(let k=0;k<300;k++){l.fill(.2);r.fill(.1);e.process(l,r);}timings.push({model,blockMs:+((performance.now()-start)/300).toFixed(3)});}
console.log(passed.length+' BUTTER DSP checks passed. Warm stereo128-frame CPU '+JSON.stringify(timings));
