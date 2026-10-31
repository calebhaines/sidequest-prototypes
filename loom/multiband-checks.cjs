'use strict';
// BUTTER three-band signal checks. Frozen full-band hashes come from genuine
// GALLEY 1.24 compressor source at 67ae096bc3e9ab6ac33617320a78f8afc06a4d06.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createHash}=require('node:crypto');
globalThis.window=globalThis;
for(const file of ['compressor-dsp.js','effects-catalog.js'])vm.runInThisContext(fs.readFileSync(path.join(__dirname,file),'utf8'),{filename:file});
const DSP=createLoomCompressorDSP(),def=LoomEffectsCatalog.find(effect=>effect.id==='velvet'),models=DSP.specifications.model,bands=['low','mid','high'];
const frozen={"8000":{"clean":"20e5cd35d63053530dedb25d370be1d159091e9b851e809da01b20296510d042","fet-76":"42766d0d47fe8ee08b7f8a8993f50bbee252a5bad53dc42201264b263f7a60c9","opto-2a":"ff5c53cadb9d27fb59fa0895dc3da6d1bc2b9c0ad9fe3ca46b18b72cfd28b915","opto-3a":"2c149c68da8cd6f9e345eae3b33d054392ebc054078d8ee04f92c11e42668a62","vari-670":"85ec51fab7f3d0c7270f4e0ef1971f0d68f9492cf38901456eb9ec9e39342660","bus-4k":"4a841840cfd3bc04119765feabf8c545c76948cbc40aa7ce9ad286fec8df633b","vca-160":"dc7f8eefea936eedb85a1a856f1eb4cb460306c3ed4754594f8e559ee59637cf","bus-2500":"81a0ceb0fec0ab7206e6aea3ba2e1effcdb6d1bb14cc2676f9613bbd985da55f","diode-609":"7adab524ca7cab2d76c45d117d5285d1e0caabf855373d7d15ae485e1cf1ada3"},"48000":{"clean":"7ffa559066c734dedc1d11b0490441db8d7c59addbad28dd52b6a0c896c9c739","fet-76":"e379f0dc4d65c76d28e915fcb6400f7e5fc501b83ca4ab72fde4f904d8ab1c19","opto-2a":"6265fece8a155e786a5dde4d32b2cdbbafa1f64f5352c6fe96524bdd233aecb9","opto-3a":"5aacd6fd8a5018ebe3206b50d2f9bfd9b714475a2c8ef873e56d5e3d72fdaf0e","vari-670":"86d2b89ac744d6f766ea84556622f08406e2bcf0a85e153b93c06050a87b874c","bus-4k":"d8ed8f32576f9ae39306cfcef8c7e678abd4bab053554d0ae304255662288820","vca-160":"b58349216361012d6d3646155ce471654e2c542b6c66ed65d03cfaf820ddc48b","bus-2500":"13607b506525d9e17dc10a4edab9e3499b0abf4d7681250fd66649ebec4b27dd","diode-609":"029a9aeb2e2e73e5944a9225663141708aee687e1e6f34373b7d421511a1a8fc"}};
let passed=0;
function check(name,run){run();passed++;console.log('PASS '+name);}
const tone=(hz=.137,amplitude=.2,frames=12000,rate=48000)=>Float32Array.from({length:frames},(_,index)=>amplitude*Math.sin(2*Math.PI*hz*index/rate));
const hash=(left,right)=>createHash('sha256').update(Buffer.from(left.buffer,left.byteOffset,left.byteLength)).update(Buffer.from(right.buffer,right.byteOffset,right.byteLength)).digest('hex');
function feed(effect,left,right=left,block=128){const l=left.slice(),r=right.slice();for(let at=0;at<l.length;at+=block)effect.process(l.subarray(at,at+block),r.subarray(at,at+block));return {left:l,right:r};}
function render(params,left,right=left,block=128,rate=48000,factory=DSP){const effect=factory.create(rate,params);return {...feed(effect,left,right,block),effect};}
function amplitude(data,hz,rate=48000,start=Math.floor(data.length*.6)){let ss=0,cc=0,sc=0,xs=0,xc=0;for(let index=start;index<data.length;index++){const angle=2*Math.PI*hz*index/rate,s=Math.sin(angle),c=Math.cos(angle);ss+=s*s;cc+=c*c;sc+=s*c;xs+=data[index]*s;xc+=data[index]*c;}const determinant=ss*cc-sc*sc;return Math.hypot((xs*cc-xc*sc)/determinant,(xc*ss-xs*sc)/determinant);}
function peak(data){let value=0;for(const sample of data){assert(Number.isFinite(sample)&&Math.abs(sample)<=8);value=Math.max(value,Math.abs(sample));}return value;}
const neutral={bandMode:'multiband',model:'clean',input:0,makeup:0,colour:0,lowRatio:1,midRatio:1,highRatio:1,mix:1};
check('All 24 controls, catalog defaults, DSP bounds and recipes describe one complete three-band contract',()=>{
 assert.equal(def.multibandKeys.length,24);assert.equal(new Set(def.multibandKeys).size,24);
 for(const key of def.multibandKeys){const p=def.params.find(param=>param.key===key),rule=DSP.specifications[key];assert(p&&rule,key);assert.equal(def.defaults[key],p.default);if(p.type==='range')assert.deepEqual(rule,[p.min,p.max,p.default]);else assert.deepEqual(rule,p.options.map(option=>option.value));}
 for(const recipe of def.presets){assert.deepEqual(Object.keys(recipe.params).sort(),Object.keys(def.defaults).sort());assert.deepEqual(DSP.normalize(recipe.params),recipe.params);}
 assert.equal(def.defaults.bandMode,'full');assert.deepEqual(Object.keys(DSP.normalize({})).sort(),Object.keys(def.defaults).sort());
});
check('Every released full-band model retains frozen stereo PCM at 8 and 48 kHz',()=>{
 for(const rate of [8000,48000])for(const model of models){
  const n=Math.round(rate*.12),left=Float32Array.from({length:n},(_,index)=>{const t=index/rate;return(t<.035?.07:t<.08?.62:.22)*(.6*Math.sin(2*Math.PI*173*t)+.2*Math.sin(2*Math.PI*1703*t));}),right=Float32Array.from({length:n},(_,index)=>.4*Math.cos(2*Math.PI*277*index/rate));
  const p={model,input:4,threshold:-24,ratio:5,attack:3,release:150,makeup:-3,colour:.65,link:.7,mix:.73,timing:'classic',fetMode:'all-buttons',thrust:'loud',bandMode:'full',lowThreshold:-60,lowGain:12,midRatio:40,highSolo:'on'};
  const out=render(p,left,right,137,rate);assert.equal(hash(out.left,out.right),frozen[rate][model],rate+' '+model);assert(Object.values(out.effect.getMeters()).every(Number.isFinite),'Full-band meter contract stays numeric.');
 }
});
check('Matched crossover sums retain unity magnitude and identical neutral parallel blends across the spectrum',()=>{
 for(const rate of [8000,48000])for(const hz of [70,200,1000,2500,rate===8000?3200:12000]){
  const input=tone(hz,.13,Math.round(rate*.24),rate),wet=render(neutral,input,input,137,rate).left;
  assert(Math.abs(20*Math.log10(amplitude(wet,hz,rate)/.13))<.02,rate+' Hz, tone '+hz);
  for(const mix of [.2,.5])assert.deepEqual(render({...neutral,mix},input,input,251,rate).left,wet,'Neutral parallel reference must not comb at '+hz);
 }
 const impulse=new Float32Array(4096);impulse[37]=.2;const out=render(neutral,impulse).left;assert.equal(out.findIndex(value=>Math.abs(value)>1e-8),37,'Crossovers add no fixed buffer delay.');
});
check('Shared input and makeup plus one band trim each apply exactly once',()=>{
 const input=tone(1000,.01,12000),out=render({...neutral,input:6,makeup:3,lowGain:2,midGain:2,highGain:2},input).left;
 assert(Math.abs(20*Math.log10(amplitude(out,1000)/.01))-11<.01);assert(Math.abs(20*Math.log10(amplitude(out,1000)/.01)-11)<.02,'Input6 + makeup3 + bandtrim2 =11 dB.');
});
check('Band detectors control their own frequency regions and the advertised -60 dB threshold has real travel',()=>{
 const input=Float32Array.from({length:16000},(_,index)=>.3*Math.sin(2*Math.PI*70*index/48000)+.15*Math.sin(2*Math.PI*1500*index/48000)+.12*Math.sin(2*Math.PI*9000*index/48000));
 const clean=render(neutral,input),low=render({...neutral,lowThreshold:-35,lowRatio:12,lowAttack:.1,lowRelease:80,knee:0},input),meter=low.effect.getMeters();
 assert(meter.bands.low.reductionDb>10);assert.equal(meter.bands.mid.reductionDb,0);assert.equal(meter.bands.high.reductionDb,0);assert(amplitude(low.left,70)<amplitude(clean.left,70)*.35);assert(Math.abs(amplitude(low.left,1500)/amplitude(clean.left,1500)-1)<.03);
 const quiet=tone(70,.0025,16000),shallow=render({...neutral,knee:0,lowThreshold:-48,lowRatio:4,lowAttack:.1},quiet),deep=render({...neutral,knee:0,lowThreshold:-60,lowRatio:4,lowAttack:.1},quiet);
 assert(deep.effect.getMeters().bands.low.reductionDb>4);assert.equal(shallow.effect.getMeters().bands.low.reductionDb,0);assert(amplitude(deep.left,70)<amplitude(shallow.left,70)*.65,'-60 must not clamp silently to -48.');
});
check('Band solos monitor both sides of the parallel blend and compression-off retains level routing',()=>{
 const input=Float32Array.from({length:12000},(_,index)=>.2*Math.sin(2*Math.PI*70*index/48000)+.12*Math.sin(2*Math.PI*9000*index/48000)),base=render(neutral,input),solo=render({...neutral,highSolo:'on',mix:.5},input);
 assert(amplitude(solo.left,70)<amplitude(base.left,70)*.001);assert(Math.abs(amplitude(solo.left,9000)/amplitude(base.left,9000)-1)<.005);
 const off=render({...neutral,lowEnabled:'off',midEnabled:'off',highEnabled:'off',input:3,makeup:-3},input);assert(Math.abs(amplitude(off.left,9000)/amplitude(base.left,9000)-1)<.005);for(const band of bands)assert.equal(off.effect.getMeters().bands[band].reductionDb,0);
});
check('Crossover, curve, mode, bypass and solo changes stay causal and independent of block partitions',()=>{
 const input=tone(137,.08,16000),events=[[0,{...neutral,model:'bus-4k',colour:.2}],[1536,{lowThreshold:-60,lowRatio:12}],[3077,{crossoverLow:700,crossoverHigh:3300}],[4619,{lowEnabled:'off',highSolo:'on'}],[6151,{input:3,makeup:-6}],[7681,{mix:0}],[9213,{mix:.7,bypass:true}],[10003,{bypass:false}],[11011,{bandMode:'full'}],[13001,{bandMode:'multiband',model:'clean',highSolo:'off'}]];
 function run(block){const effect=DSP.create(48000,events[0][1]),left=input.slice(),right=input.slice();let event=0;for(let at=0;at<left.length;){if(event<events.length&&at===events[event][0])effect.setParams(events[event++][1]);const end=Math.min(left.length,at+block,events[event]?.[0]??left.length);effect.process(left.subarray(at,end),right.subarray(at,end));at=end;}return {left,right};}
 const a=run(128),b=run(137),c=run(251);assert.deepEqual(a,b);assert.deepEqual(a,c);let step=0;for(let index=1;index<a.left.length;index++)step=Math.max(step,Math.abs(a.left[index]-a.left[index-1]));assert(step<.02,'A control change introduced an avoidable step: '+step);
});
check('Settled bypass and zero Blend are exact dry, clear nested meters and cannot wake old audio',()=>{
 const input=tone(173,.4,7000),effect=DSP.create(48000,{...neutral,lowRatio:8,midRatio:8,highRatio:8,lowThreshold:-35,midThreshold:-35,highThreshold:-35});feed(effect,input);
 for(const patch of [{mix:0},{mix:1,bypass:true}]){effect.setParams(patch);const out=feed(effect,input);assert.deepEqual(out.left.subarray(700),input.subarray(700));assert.deepEqual(out.right.subarray(700),input.subarray(700));const meter=effect.getMeters();assert.equal(meter.reductionDb,0);for(const band of bands){assert.equal(meter.bands[band].reductionDb,0);assert.equal(meter.bands[band].inputDb,-120);}}
 effect.setParams({bypass:false,mix:1});feed(effect,new Float32Array(4000));assert(peak(feed(effect,new Float32Array(3000)).left)<1e-7);
});
check('All nine models stay finite at extreme sample rates and preserve stereo opposition without colour',()=>{
 for(const rate of [8000,48000,192000])for(const model of models){const input=tone(731,3,1024,rate),out=render({...neutral,model,colour:1,input:24,makeup:24,crossoverLow:800,crossoverHigh:12000,lowThreshold:-60,midThreshold:-60,highThreshold:-60,lowRatio:40,midRatio:40,highRatio:40,lowAttack:.02,midAttack:.02,highAttack:.02},input,input,137,rate);peak(out.left);peak(out.right);out.effect.reset();assert.equal(peak(feed(out.effect,new Float32Array(256)).left),0);}
 const input=tone(277,.2,6000),inverse=Float32Array.from(input,value=>-value),out=render({...neutral,lowRatio:4,midRatio:4,highRatio:4},input,inverse);assert(out.left.every((value,index)=>Math.abs(value+out.right[index])<1e-7));
});
check('The complete multiband factory serializes without browser globals and reset repeats exact audio',()=>{
 const factory=vm.runInNewContext('('+createLoomCompressorDSP.toString()+')',{Math,Number,Float32Array,Float64Array,Int32Array}),isolated=factory(),input=tone(173,.3,5000),p={...neutral,model:'opto-3a',colour:.4,lowRatio:3,midRatio:2,highRatio:4};
 const a=render(p,input,input,128),b=render(p,input,input,137,48000,isolated);assert.deepEqual(a.left,b.left);assert.deepEqual(a.right,b.right);a.effect.reset();assert.deepEqual(feed(a.effect,input),{left:a.left,right:a.right});
});
console.log(passed+' BUTTER multiband signal, compatibility and transition groups passed.');
