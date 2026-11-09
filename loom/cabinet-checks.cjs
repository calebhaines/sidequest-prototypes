'use strict';
/* CUPBOARD: acoustic responses, coherent microphones, portable routing and
 * deterministic streaming DSP. No hardware capture or timing benchmark claims. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const MODELS = ['open112','tweed110','british212','british412','modern412','bass410','bass810','bass115','rotary','radio','megaphone','horn','electrostatic','underwater','acousticguitar','violin','cello','grandpiano','metalbowl','woodenbox'];
const MICS = ['dynamic57','dynamic421','dynamic20','ribbon121','ribbon160','condenser87','condenser414','small184','omni','contact'];
const plain = value => JSON.parse(JSON.stringify(value));
function load(math = Math) {
  const scope = {}; scope.window = scope;
  const files = ['cabinet-catalog.js','cabinet-dsp.js','effects-catalog.js','effects.js','lfo.js','schema.js'];
  for (const file of files) Function('window','globalThis','Math',fs.readFileSync(path.join(__dirname,file),'utf8'))(scope,scope,math);
  return { scope, F: scope.createLoomCabinetDSP(), E: scope.createLoomEffectsDSP(), S: scope.LoomSchema, definition: scope.LoomEffectsCatalog.find(def => def.id === 'cupboard') };
}
function signal(frames, rate = 48000, amplitude = .025) {
  return [0,1].map(channel => Float32Array.from({length:frames},(_,i) => amplitude * (Math.sin(2*Math.PI*(channel?227:173)*i/rate) + .31*Math.sin(2*Math.PI*(channel?1901:1237)*i/rate))));
}
function impulse(frames, amplitude = .25) { const audio = [new Float32Array(frames),new Float32Array(frames)]; audio[0][0]=audio[1][0]=amplitude; return audio; }
function feed(effect,input,sizes=[128],events=[],rate=48000) {
  const output=input.map(data=>data.slice()); let at=0,block=0,event=0;
  while(at<output[0].length) {
    while(events[event]?.at===at) { const change=events[event++]; if(change.patch)effect.setParams(change.patch); if(change.reset)effect.reset(); }
    const end=Math.min(output[0].length,at+sizes[block++%sizes.length],events[event]?.at??Infinity);
    assert(end>at,'Events are ordered and block sizes are positive');
    effect.process(output[0].subarray(at,end),output[1].subarray(at,end),{tempo:120,beat:at/rate*2,playing:true}); at=end;
  }
  return output;
}
function peak(data) { let result=0; for(const value of data) { assert(Number.isFinite(value),'Finite audio'); result=Math.max(result,Math.abs(value)); } return result; }
function rms(data,from=0,to=data.length) { let sum=0; for(let i=from;i<to;i++)sum+=data[i]*data[i]; return Math.sqrt(sum/Math.max(1,to-from)); }
function distance(a,b) { let power=0,max=0; for(let i=0;i<a.length;i++){const d=a[i]-b[i];power+=d*d;max=Math.max(max,Math.abs(d));}return{rms:Math.sqrt(power/a.length),max}; }
function digest(audio) { const hash=crypto.createHash('sha256'); for(const data of audio)hash.update(Buffer.from(data.buffer,data.byteOffset,data.byteLength)); return hash.digest('hex'); }
function exact(a,b,label='Exact stereo PCM') {
  for(let channel=0;channel<2;channel++) {
    const left=Buffer.from(a[channel].buffer,a[channel].byteOffset,a[channel].byteLength),right=Buffer.from(b[channel].buffer,b[channel].byteOffset,b[channel].byteLength);
    if(!left.equals(right)){const first=a[channel].findIndex((value,index)=>!Object.is(value,b[channel][index]));assert.fail(label+': '+JSON.stringify({channel,first,actual:a[channel][first],expected:b[channel][first],difference:distance(a[channel],b[channel])}));}
  }
}
function scaled(audio,gain) { return audio.map(data=>Float32Array.from(data,value=>value*gain)); }
function response(audio) { const gain=rms(audio); assert(gain>1e-9,'Audible response');return Float64Array.from(audio,value=>value/gain); }
function firstSample(data) { const threshold=Math.max(1e-11,peak(data)*1e-6);return data.findIndex(value=>Math.abs(value)>threshold); }
function frequency(data,hz,rate=48000) { let re=0,im=0;for(let i=0;i<data.length;i++){const phase=2*Math.PI*hz*i/rate;re+=data[i]*Math.cos(phase);im+=data[i]*Math.sin(phase);}return Math.hypot(re,im); }
function onlyMic(index=1) { const p={room:0,mix:1,input:0,output:0,stereo:'mono',alignment:'aligned'};for(let mic=1;mic<=4;mic++){p['mic'+mic+'Enabled']=mic===index?'on':'off';p['mic'+mic+'Solo']='off';}return p; }
function cloneMic(params,from,to,specifications) { const result={};for(const key of Object.keys(specifications))if(key.startsWith('mic'+from))result['mic'+to+key.slice(('mic'+from).length)]=params[key];return result; }
function allFinite(audio) { for(const channel of audio)assert(peak(channel)<=8,'Bounded output'); }
function run() {
  const {scope,F,E,S,definition}=load(),passed=[],evidence={sourceHashes:Object.fromEntries(['cabinet-dsp.js','cabinet-catalog.js','effects.js','schema.js','cabinet-checks.cjs'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,file))).digest('hex')]))};
  function check(name,test) { if(process.env.CABINET_QA_FILTER&&!new RegExp(process.env.CABINET_QA_FILTER).test(name))return;test();passed.push(name);console.log('PASS',name); }
  const single={...F.normalize({}),...onlyMic(),mic1Type:'dynamic57',mic1X:0,mic1Y:0,mic1Distance:.08,mic1Angle:0,mic1Level:0,mic1Pan:0,mic1Polarity:'normal'};
  const render=(patch={},rate=48000,frames=Math.ceil(rate*.3)+257,input)=>feed(E.create('cupboard',rate,{...single,...patch}),input||impulse(frames),[137,31,128],[],rate);

  check('Twenty acoustic models and ten microphones expose one coherent catalog and DSP contract',()=>{
    assert(definition&&definition.name==='CUPBOARD');assert.deepEqual(plain(F.specifications.model),MODELS);
    assert.deepEqual(definition.models.map(model=>model.id),MODELS);assert.equal(new Set(MODELS).size,20);
    assert.deepEqual(definition.mics.map(mic=>mic.id),MICS);
    assert.equal(new Set(definition.params.map(param=>param.key)).size,definition.params.length,'No duplicated controls');
    assert.deepEqual(plain(F.normalize({})),plain(definition.defaults));assert.deepEqual(plain(E.normalize('cupboard',{})),plain(definition.defaults));
    for(const param of definition.params){const spec=F.specifications[param.key];assert(spec,param.key+' specification');if(param.type==='range'){assert.deepEqual([param.min,param.max,param.default],spec,param.key+' numeric range/default');}else assert.deepEqual(param.options.map(option=>option.value).sort(),spec.slice().sort(),param.key+' choices');}
    for(let mic=1;mic<=4;mic++)assert.deepEqual(plain(F.specifications['mic'+mic+'Type']).sort(),MICS.slice().sort());
    for(const recipe of definition.presets||[])assert.deepEqual(plain(F.normalize(recipe.params)),plain(recipe.params),recipe.id+' complete valid recipe');
  });

  check('All twenty models have audible and independently different normalized impulse responses',()=>{
    const responses=MODELS.map(model=>render({model})[0]),normalized=responses.map(response);let nearest=Infinity,pair=[];
    for(let i=0;i<MODELS.length;i++){allFinite([responses[i]]);assert(peak(responses[i])>1e-5,MODELS[i]+' audible');for(let j=0;j<i;j++){const d=distance(normalized[i],normalized[j]).rms;if(d<nearest){nearest=d;pair=[MODELS[i],MODELS[j]];}assert(d>1e-3,MODELS[i]+'/'+MODELS[j]+' must differ beyond gain');}}
    evidence.models={nearest,pair,hashes:Object.fromEntries(MODELS.map((name,index)=>[name,digest([responses[index]])]))};
  });

  check('Streaming cabinet output agrees with an independent direct convolution of its measured effective impulse',()=>{
    const frames=4096,source=signal(257,48000,.003)[0],input=[new Float32Array(frames),new Float32Array(frames)];input[0].set(source);input[1].set(source);
    const reports=[];
    for(const patch of[{model:'open112'},{model:'metalbowl',room:.37,alignment:'natural',mic2Enabled:'on',mic2Type:'condenser414',mic2Distance:.6,mic2Pan:.4,mic3Enabled:'on',mic3Type:'contact',mic3Level:-9}]){
      const params={...single,...patch},h=feed(F.create(48000,params),impulse(frames,.25),[137,31]),actual=feed(F.create(48000,params),input,[128]),errors=[];
      for(let channel=0;channel<2;channel++){const expected=new Float64Array(frames);for(let at=0;at<frames;at++){let sum=0;for(let tap=0;tap<source.length&&tap<=at;tap++)sum+=source[tap]*h[channel][at-tap]*4;expected[at]=sum;}const error=distance(actual[channel],expected);assert(error.max<3e-7,patch.model+' FFT/head overlap differs from direct linear convolution: '+error.max);errors.push(error);}
      reports.push({model:patch.model,errors});
    }
    evidence.convolutionReference=reports;
  });

  check('Microphone transducers, cone position, height and angle change the actual sound',()=>{
    const micResponses=MICS.map(mic1Type=>response(render({mic1Type})[0]));let nearest=Infinity;
    for(let i=0;i<MICS.length;i++)for(let j=0;j<i;j++){const d=distance(micResponses[i],micResponses[j]).rms;nearest=Math.min(nearest,d);assert(d>1e-4,MICS[i]+'/'+MICS[j]+' distinct microphone responses');}
    const center=response(render()[0]);for(const patch of[{mic1X:.9},{mic1Y:.85},{mic1Angle:75}])assert(distance(center,response(render(patch)[0])).rms>1e-3,'Physical microphone edit changes frequency/time response');
    const on=render({mic1Angle:0})[0],off=render({mic1Angle:75})[0],ratio=data=>frequency(data,4500)/Math.max(1e-12,frequency(data,300));
    assert(ratio(off)<ratio(on),'Off-axis placement softens high frequencies');evidence.microphones={nearest,axisHighLow:ratio(on),offAxisHighLow:ratio(off)};
  });

  check('Natural distance retains physical flight time while alignment removes the air-path difference',()=>{
    const rate=48000,near=.05,far=1.5,p={mic1X:0,mic1Y:0,mic1Angle:0};
    const a=render({...p,alignment:'natural',mic1Distance:near})[0],b=render({...p,alignment:'natural',mic1Distance:far})[0];
    const expected=(far-near)/343*rate,measured=firstSample(b)-firstSample(a);assert(Math.abs(measured-expected)<Math.max(12,rate*.0003),'Natural delay follows distance/speed of sound: '+measured+' expected '+expected);assert(rms(b)<rms(a),'Distance loses direct-field level');
    const c=render({...p,alignment:'aligned',mic1Distance:near})[0],d=render({...p,alignment:'aligned',mic1Distance:far})[0];assert(Math.abs(firstSample(d)-firstSample(c))<12,'Aligned microphone positions share an arrival reference');
    const contactNear=render({...p,mic1Type:'contact',alignment:'natural',mic1Distance:near})[0],contactFar=render({...p,mic1Type:'contact',alignment:'natural',mic1Distance:far})[0];assert(Math.abs(firstSample(contactFar)-firstSample(contactNear))<2,'Contact pickup does not add airborne propagation');
    const fx=F.create(rate,single);assert.equal(fx.getLatencyTime(),0,'Direct convolution head adds no FFT-block latency');assert(firstSample(c)<16,'Aligned close microphone starts without a hidden convolution block');evidence.propagation={expected,measured,alignedNear:firstSample(c),alignedFar:firstSample(d)};
  });

  check('Identical microphones sum coherently, invert to silence, and Solo matches an isolated pickup',()=>{
    const original=render(),two={...single,...cloneMic(single,1,2,F.specifications),mic2Enabled:'on'};
    const summed=render(two),opposed=render({...two,mic2Polarity:'invert'});
    for(let channel=0;channel<2;channel++){assert(distance(summed[channel],scaled(original,2)[channel]).max<1e-6,'Two equal microphones add, without hidden normalization');assert(peak(opposed[channel])<1e-8,'Co-located opposite polarity microphones cancel');}
    let four={...single};for(let mic=2;mic<=4;mic++)four={...four,...cloneMic(single,1,mic,F.specifications),['mic'+mic+'Enabled']:'on'};
    const all=render(four);for(let channel=0;channel<2;channel++)assert(distance(all[channel],scaled(original,4)[channel]).max<2e-6,'Four microphone paths sum predictably');
    const selected={...two,mic2Type:'ribbon121',mic2X:.72,mic2Solo:'on'},solo=render(selected),isolated=render({...selected,mic1Enabled:'off',mic2Solo:'off'});assert.deepEqual(solo,isolated,'Solo auditions the selected actual microphone path');
    const left=render({mic1Pan:-1}),right=render({mic1Pan:1});assert(peak(left[0])>1e-5&&peak(left[1])<1e-9);assert(peak(right[1])>1e-5&&peak(right[0])<1e-9);evidence.coherentMics={cancellationPeak:Math.max(...opposed.map(peak))};
  });

  check('The cabinet is linear across playing levels and input/output/microphone trims do not act as AGC',()=>{
    const input=signal(12289),base=render({},48000,input[0].length,input),double=render({},48000,input[0].length,scaled(input,2)),gain=Math.pow(10,6/20);
    for(let channel=0;channel<2;channel++)assert(distance(double[channel],scaled(base,2)[channel]).max<2e-7,'Input dynamics remain proportional');
    for(const patch of[{input:6},{output:6},{mic1Level:6}]){const output=render(patch,48000,input[0].length,input);for(let channel=0;channel<2;channel++)assert(distance(output[channel],scaled(base,gain)[channel]).max<2e-6,'Manual gain remains a real gain');}
    evidence.linearDynamics={rmsRatio:rms(double[0])/rms(base[0])};
  });

  check('Every acoustic model remains deterministic across irregular blocks, sample rates, edits and reset',()=>{
    const rates=[8000,44100,48000,96000,192000],input=signal(4099);
    for(const rate of rates)for(const model of MODELS){const pair=signal(4099,rate),params={...single,model},events=[{at:137,patch:{mic1X:.73,mic1Y:-.4,mic1Distance:.45,mic1Angle:38}},{at:511,patch:{mic2Enabled:'on',mic2Type:'condenser87',mic2Pan:.5,room:.24}},{at:997,patch:{output:-4,mic1Level:-7,mic1Pan:-.6}},{at:1701,patch:{alignment:'natural',stereo:'split'}},{at:1889,patch:{mix:0}},{at:2303,patch:{mix:.77}},{at:2593,patch:{model:MODELS[(MODELS.indexOf(model)+1)%MODELS.length]}},{at:2881,patch:{mic1Enabled:'off'}},{at:3121,patch:{mic1Enabled:'on'}}];
      const a=feed(scope.createLoomCabinetDSP().create(rate,params),pair,[128],events,rate),b=feed(scope.createLoomCabinetDSP().create(rate,params),pair,[1,17,137,251],events,rate);allFinite(a);allFinite(b);exact(a,b,model+'/'+rate+' sample clocks');
      const fx=F.create(rate,params);feed(fx,pair,[137],[],rate);fx.reset();exact(feed(fx,pair,[137],[],rate),feed(F.create(rate,params),pair,[137],[],rate),model+'/'+rate+' fresh reset');}
    evidence.supportedRates=rates;
  });

  check('The serialized cabinet factory matches main-thread audio without hidden global dependencies',()=>{
    const isolated=Function('return ('+scope.createLoomCabinetDSP.toString()+');')()(),params={...single,model:'metalbowl',mic2Enabled:'on',mic2Type:'omni',mic2Distance:1.2,alignment:'natural',room:.4};
    const input=signal(8197),events=[{at:391,patch:{mic1Angle:55,mic2Pan:.7}},{at:3083,patch:{mic1Polarity:'invert',output:-6}},{at:5001,reset:true}];
    const a=feed(F.create(48000,params),input,[137],events),b=feed(isolated.create(48000,params),input,[137],events);exact(a,b,'Serialized factory');evidence.serializedPCM=digest(a);
  });

  check('Projects preserve all microphone placements and numeric automation/LFO targets on every owner kind',()=>{
    const state=S.defaultState(),owners=[state.tracks[0],state.returns[0],state.master,state.buses[1]],patch={...single,model:'cello',mic1X:-.37,mic1Y:.41,mic1Distance:.27,mic1Angle:32,mic2Enabled:'on',mic2Type:'ribbon160',mic2Pan:.66,mic2Level:-7.3,mic2Polarity:'invert',alignment:'natural',room:.25};
    for(const owner of owners){owner.effects[0]=S.effect({type:'cupboard',params:patch});owner.automation=[{target:'fx:0:mic1X',effectType:'cupboard',enabled:true,interpolation:'linear',points:[{beat:0,value:-.37},{beat:4,value:.7}]}];}
    state.lfos[0].enabled=true;state.lfos[0].routes=owners.map((owner,index)=>({id:'cabinet-'+index,ownerId:owner.id,target:'fx:0:mic2Angle',effectType:'cupboard',amount:.21,enabled:true}));
    const source=JSON.stringify(state),restored=S.parseProject(S.serializeProject(state));assert.equal(JSON.stringify(state),source,'Serialization does not mutate the source');
    for(const owner of owners){const result=S.automationOwner(restored,owner.id);assert.deepEqual(result.effects[0],owner.effects[0]);assert.deepEqual(result.automation,owner.automation);const targets=S.automationTargets(result);for(const key of['mic1X','mic1Y','mic1Distance','mic1Angle','mic2Level','mic2Pan','lowCut','highCut'])assert(targets.some(target=>target.target==='fx:0:'+key&&target.effectType==='cupboard'),owner.id+'/'+key);assert(!targets.some(target=>target.target==='fx:0:model'),'Discrete model choice is not a numeric automation lane');}
    const targets=scope.createLoomLFODSP().targets(restored,S.automationTargets,E.specifications);for(const owner of owners)assert(targets.some(target=>target.ownerId===owner.id&&target.target==='fx:0:mic2Angle'));
    const malformed=plain(restored);malformed.buses[1].effects[0].params.mic1Type='not-a-microphone';assert.throws(()=>S.parseProject(JSON.stringify({format:'loom-project',formatVersion:1,appVersion:S.VERSION,state:malformed})),/CUPBOARD|invalid/i);
    evidence.projectOwners=owners.map(owner=>owner.id);
  });

  check('Level/pan/mix automation and geometry changes reuse the acoustic convolution kernel',()=>{
    let designs=0;const math=Object.create(Math);for(const name of['exp','tan'])math[name]=value=>{designs++;return Math[name](value);};const cached=load(math).F,fx=cached.create(48000,single),input=signal(4096);feed(fx,input);const before=fx.getMeters().kernelBuilds;assert(Number.isInteger(before));designs=0;
    for(let index=0;index<128;index++){fx.setParams({mic1Level:-index/16,mic1Pan:(index%17)/8-1,output:-index/32,mix:.3+(index%9)*.05});feed(fx,signal(32),[32]);}
    assert.equal(fx.getMeters().kernelBuilds,before,'Mixing controls do not synthesize a new response');assert.equal(designs,0,'Mixing controls do not redesign acoustic filters');
    for(let index=0;index<128;index++){fx.setParams({mic1X:Math.sin(index*.1),mic1Y:Math.cos(index*.1)*.7,mic1Angle:(index%91)-45,mic1Distance:.05+(index%30)*.02});feed(fx,signal(32),[32]);}
    assert.equal(fx.getMeters().kernelBuilds,before,'Audio-rate positioning must not repeatedly FFT an IR');fx.setParams({model:'horn'});feed(fx,input);assert(fx.getMeters().kernelBuilds>before,'A genuinely new cabinet creates its new base response');evidence.kernelCaching={initialBuilds:before,afterModel:fx.getMeters().kernelBuilds};
  });

  check('Disabled microphones, zero wet mix, bypass, silence and declared tails retain their expected behavior',()=>{
    const input=signal(8192),silence=[new Float32Array(8192),new Float32Array(8192)];for(const patch of[{mix:0},{bypass:true}]){const dry=F.create(48000,{...single,...patch});assert.deepEqual(feed(dry,input),input,'Exact initial dry path');assert.equal(dry.getMeters().convolvedFrames,0,'A bypassed/zero-mix slot runs no convolution');}
    const none={...single,mic1Enabled:'off'},off=F.create(48000,none),output=feed(off,input);assert.equal(peak(output[0])+peak(output[1]),0,'No microphone means no wet signal');assert.equal(off.getMeters().activeMics,0);assert.equal(off.getMeters().convolvedFrames,0,'No microphone means no shared FIR work');assert.equal(off.getTailTime(),0);
    const idle=F.create(48000,single);assert.deepEqual(feed(idle,silence),silence,'No generated noise');
    for(const model of MODELS){const fx=F.create(8000,{...single,model,alignment:'natural',mic1Distance:3,room:1});feed(fx,impulse(256),[128],[],8000);const tail=fx.getTailTime();assert(Number.isFinite(tail)&&tail>=0&&tail<10,model+' bounded tail');const ring=feed(fx,[new Float32Array(Math.ceil((tail+.3)*8000)),new Float32Array(Math.ceil((tail+.3)*8000))],[137],[],8000);assert(peak(ring[0].subarray(Math.ceil(tail*8000)))<1e-7,model+' ends within declared tail');}
  });

  check('Four microphones share cabinet convolution, and settled mute transitions release processing work',()=>{
    const input=signal(8192),one=F.create(48000,single),four=F.create(48000,{...single,mic2Enabled:'on',mic3Enabled:'on',mic4Enabled:'on'});
    feed(one,input);feed(four,input);assert.equal(four.getMeters().activeMics,4);assert.equal(four.getMeters().convolvedFrames,one.getMeters().convolvedFrames,'More microphones do not multiply the cabinet FIR cost');assert(four.getMeters().convolvers<=2,'At most one shared cabinet per stereo side');
    for(const patch of[{mix:0},{bypass:true},{mic1Enabled:'off'}]){const fx=F.create(48000,single);feed(fx,input);fx.setParams(patch);feed(fx,[new Float32Array(16384),new Float32Array(16384)]);const before=fx.getMeters().convolvedFrames;feed(fx,input);assert.equal(fx.getMeters().convolvedFrames,before,'Settled mute does not keep convolving');}
    const stereo=F.create(48000,{...single,stereo:'split'}),leftOnly=[input[0],new Float32Array(input[0].length)],out=feed(stereo,leftOnly);assert(peak(out[0])>1e-5);assert(peak(out[1])<1e-9,'Split stereo keeps opposite input channels isolated');
    evidence.processing={single:one.getMeters(),four:four.getMeters()};
  });

  check('Audible mix, bypass, microphone power and polarity edits start with a smooth sample-clocked transition',()=>{
    const rate=48000,input=signal(16384,rate,.07),at=4096,reference=feed(F.create(rate,single),input),limit=Math.max(1e-6,peak(reference[0])*.015),rows=[];
    for(const patch of[{mix:0},{bypass:true},{mic1Enabled:'off'},{mic1Level:-60},{mic1Polarity:'invert'}]){
      const events=[{at,patch},{at:10001,patch:{mix:1,bypass:false,mic1Enabled:'on',mic1Level:0,mic1Polarity:'normal'}}],output=feed(F.create(rate,single),input,[128],events),odd=feed(F.create(rate,single),input,[1,17,137,251],events);exact(output,odd,'Mute/phase transition ignores callback boundaries');
      const delta=Math.abs(output[0][at]-reference[0][at]);assert(delta<limit,'Control edit snaps its first audible sample: '+JSON.stringify(patch)+' '+delta);
      if(patch.mic1Enabled==='off'){const end=at+Math.round(rate*.025)-1,jump=Math.abs(output[0][end]-output[0][end-1]);assert(jump<Math.max(1e-5,peak(reference[0])*.03),'Mic mute cuts a remaining finishing-filter tail');}
      rows.push({patch,firstSampleDelta:delta});
    }
    evidence.smoothEdits=rows;
  });

  check('Rapid cabinet changes finish while dry and resume the latest response without stale overlap',()=>{
    const rows=[];
    for(const rate of[8000,48000,192000])for(const mute of[{bypass:true},{mic1Enabled:'off'}]){
      // Stop between a newly prepared body's two warm-up blocks. Its fade
      // starts after the mute fade, so becoming dry must discard that old
      // transition rather than leave the next model queued behind it.
      const factory=load().F,fx=factory.create(rate,{...single,model:'open112'});
      feed(fx,signal(1024,rate),[128],[],rate);fx.setParams({model:'metalbowl'});
      let preparationFrames=0;
      while(!fx.getMeters().modelChanges&&preparationFrames<rate*.5){feed(fx,signal(128,rate),[128],[],rate);preparationFrames+=128;}
      assert.equal(fx.getMeters().modelChanges,1,'A cold response was actually prepared');
      assert.equal(fx.getMeters().pendingIR,true,'Suspend during the new response warm-up');
      fx.setParams(mute);feed(fx,signal(Math.ceil(rate*.04),rate),[17,137],[],rate);
      fx.setParams({model:'horn'});fx.setParams({model:'cello'});
      feed(fx,signal(Math.ceil(rate*.5),rate),[137,31,128],[],rate);
      assert.equal(fx.getMeters().pendingIR,false,'The latest cabinet cannot wait for a paused dry crossfade');
      const stopped=fx.getMeters().convolvedFrames;
      feed(fx,signal(257,rate),[17,128],[],rate);
      assert.equal(fx.getMeters().convolvedFrames,stopped,'Dry model preparation never resumes convolution');
      fx.setParams({bypass:false,mic1Enabled:'on'});
      feed(fx,[new Float32Array(Math.ceil(rate*.4)),new Float32Array(Math.ceil(rate*.4))],[137,31],[],rate);
      const input=impulse(Math.ceil(rate*.3)),actual=feed(fx,input,[17,137],[],rate),expected=feed(factory.create(rate,{...single,model:'cello'}),input,[128],[],rate);
      const difference=Math.max(...actual.map((channel,index)=>distance(channel,expected[index]).max));
      assert(difference<1e-8,'Clean resume must render the latest cabinet, not merely store its name: '+difference);
      rows.push({rate,mute,preparationFrames,resumeMaxError:difference});
    }
    evidence.dryModelQueue=rows;
  });

  check('Control boundaries and malformed optional inputs remain normalized, finite and bounded',()=>{
    const bad={model:'unknown',mic1Type:'missing',mic1X:Infinity,mic1Distance:-10,mic1Level:1e6,room:NaN},normalized=F.normalize(bad);assert.equal(normalized.model,MODELS[0]);assert.equal(normalized.mic1Type,MICS[0]);assert.equal(normalized.mic1X,F.specifications.mic1X[2]);assert.equal(normalized.mic1Distance,F.specifications.mic1Distance[0]);assert.equal(normalized.mic1Level,F.specifications.mic1Level[1]);assert.equal(bad.mic1Distance,-10,'Normalize does not mutate supplied controls');
    for(const rate of[8000,192000])for(const model of['open112','radio','grandpiano','metalbowl'])for(const high of[false,true]){const params={model,mix:1};for(const[key,rule]of Object.entries(F.specifications))if(typeof rule[0]==='number')params[key]=rule[high?1:0];params.mix=1;for(let mic=1;mic<=4;mic++){params['mic'+mic+'Enabled']='on';params['mic'+mic+'Solo']='off';params['mic'+mic+'Type']=MICS[(mic*2+(high?1:0))%MICS.length];}allFinite(feed(F.create(rate,params),signal(1537,rate,.4),[1,17,137],[],rate));}
  });

  console.log(passed.length+' CUPBOARD acoustic, microphone and lifecycle groups passed.');
  if(process.env.CABINET_QA_REPORT)fs.writeFileSync(process.env.CABINET_QA_REPORT,JSON.stringify({passed,evidence},null,2)+'\n');
  return {passed,evidence};
}
if(require.main===module){try{run();}catch(error){console.error(error.stack||error);process.exitCode=1;}}
module.exports={run,load,signal,impulse,feed,rms,peak,distance,digest,exact,frequency,firstSample,onlyMic,cloneMic,MODELS,MICS};
