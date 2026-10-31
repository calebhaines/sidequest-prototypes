'use strict';
/* GALLEY performance and exact-audio release comparisons.
 *
 * Historical releases load their OWN catalogs, effect factories and engine in
 * the same native JavaScript realm as the working tree. No contextified VM or
 * current-effect substitution is used for timing comparisons.
 *
 * Default: exact PCM against released 1.25. --matrix measures each effect's
 * static processing, 32-frame parameter updates and meter snapshots. --bench
 * measures complete eight-track fixtures. Timings are informational; reserve
 * the machine before comparing results. Browser UI/host/Worklet contention is
 * deliberately a separate experiment, not inferred from these Node timings.
 *
 * node loom/performance-regression-checks.cjs --matrix --blocks 256 --trials 1
 * node loom/performance-regression-checks.cjs --bench --refs 5cfe634,67ae096,47d210f,working
 * node loom/performance-regression-checks.cjs --calls --fixtures dense,automation
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash, webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const RELEASE = '47d210f95124c54ba5aa4a87f4370986963f32c6';
// Captured from the actual released factories, not optimized working code.
// The editable source download can therefore check PCM without a Git clone.
const frozenPath = path.join(__dirname,'performance-legacy-fixtures.json');
const FROZEN_PCM = fs.existsSync(frozenPath)?JSON.parse(fs.readFileSync(frozenPath,'utf8')):null;
const EFFECTS = ['prism','velvet','cinder','undertow','parallax','vestige','halo','tremor','broiler','glaze','scales','strainer','swirl','crumble','saute','preserve'];
const MODULES = [
  ['shared/pattern-schema.js'],
  ...['vocal-catalog','utility-catalog','filter-catalog','creative-catalog','preamp-catalog','tape-catalog'].map(name => ['loom/'+name+'.js']),
  ['loom/char-catalog.js', true], ['loom/effects-catalog.js'],
  ...['vocal-dsp','utility-dsp','filter-dsp','creative-dsp','broiler-pedals','compressor-dsp','preamp-dsp','tape-dsp'].map(name => ['loom/'+name+'.js']),
  ['loom/char-dsp.js', true], ['loom/effects.js'], ['loom/lfo.js'],
  ['loom/cpu-profiler.js', true], ['loom/track-eq-dsp.js', true],
  ['loom/service-schema.js'], ['loom/schema.js'], ['loom/audio-engine.js']
];
const FACTORIES = ['createLoomVocalDSP','createLoomUtilityDSP','createLoomFilterDSP','createLoomCreativeDSP','createLoomBroilerPedalsDSP','createLoomCompressorDSP','createLoomPreampDSP','createLoomTapeDSP','createLoomCharDSP'];
const PATCHES = {
  prism:{ low:2, mid:-2, high:1, filter:'lowpass', cutoff:4700, resonance:1.2, mix:.8 },
  velvet:{ model:'bus-4k', threshold:-24, ratio:4, input:2, makeup:0, colour:.25, mix:.8 },
  cinder:{ shape:'fold', drive:14, bias:.08, tone:9000, output:-12, mix:.5 },
  undertow:{ mode:'flanger', rate:.7, delay:3, depth:2, feedback:.2, mix:.5 },
  parallax:{ clock:'free', time:173, feedback:.35, damping:7000, spread:.7, mix:.3 },
  vestige:{ size:.5, decay:1.8, predelay:12, mix:.25 },
  halo:{ semitones:7, fine:4, window:40, feedback:.1, mix:.35 },
  tremor:{ depth:.7, pan:.3, mix:.8 },
  broiler:{ model:'iron-800', drive:18, output:-15, mix:.7 },
  glaze:{ output:-6, mix:.7 },
  scales:{ input:-3, tuner:'on', mix:1 },
  strainer:{ cutoff:1800, resonance:.7, mix:.8 },
  swirl:{ rate:.5, depth:.6, mix:.7 },
  crumble:{ bits:8, mix:.5 },
  saute:{ model:'tube-610', drive:15, colour:.6, output:-9, mix:.6 },
  preserve:{ drive:9, warmth:.6, output:-6, wow:0, flutter:0, hiss:0, dropouts:0, mix:.7 }
};
const AUTOMATE = { prism:'cutoff', velvet:'threshold', cinder:'drive', undertow:'depth', parallax:'time', vestige:'decay', halo:'semitones', tremor:'depth', broiler:'drive', scales:'input', strainer:'cutoff', swirl:'rate', crumble:'bits', saute:'drive', preserve:'drive' };
const clone = value => JSON.parse(JSON.stringify(value));
const median = values => values.slice().sort((a,b) => a-b)[Math.floor(values.length/2)];
const digest = channels => { const hash=createHash('sha256');for(const channel of channels)hash.update(Buffer.from(channel.buffer,channel.byteOffset,channel.byteLength));return hash.digest('hex'); };
const cache = new Map();
function readSource(ref, file, optional=false) {
  const key=ref+':'+file;
  if(cache.has(key))return cache.get(key);
  try {
    const working=file.startsWith('loom/')?path.join(__dirname,file.slice(5)):fs.existsSync(path.join(__dirname,file))?path.join(__dirname,file):path.join(root,file);
    const value=ref==='working' ? fs.readFileSync(working,'utf8') : execFileSync('git',['show',ref+':'+file],{cwd:root,maxBuffer:12*1024*1024,stdio:['ignore','pipe','pipe']}).toString();
    cache.set(key,value);return value;
  } catch(error) { if(optional)return null;throw error; }
}
function metricGlobals(metrics) {
  const count = key => metrics[key]=(metrics[key]||0)+1;
  const math=Object.create(Math);
  for(const key of ['sin','cos','tan','tanh','atan','atan2','pow','exp','log','log2','log10','sqrt','hypot'])math[key]=(...args)=>{count('Math.'+key);return Math[key](...args);};
  const objectMethods={};
  const object=new Proxy(Object,{get(target,key){if(['keys','entries','fromEntries','assign'].includes(key))return objectMethods[key]||=(...args)=>{count('Object.'+key);return target[key](...args);};return Reflect.get(target,key);}});
  const json=Object.create(JSON);json.stringify=(...args)=>{count('JSON.stringify');return JSON.stringify(...args);};json.parse=(...args)=>{count('JSON.parse');return JSON.parse(...args);};
  const typed=Native=>new Proxy(Native,{construct(target,args){count('new '+target.name);return Reflect.construct(target,args);}});
  return [math,object,json,typed(Float32Array),typed(Float64Array),typed(Uint8Array),typed(Int32Array)];
}
function loadRelease(ref='working', instrument=false) {
  const metrics={},scope={console,performance,Date,crypto:webcrypto,structuredClone};scope.window=scope;scope.globalThis=scope;
  if(instrument)scope.performance={now(){metrics['performance.now']=(metrics['performance.now']||0)+1;return performance.now();}};
  const globals=instrument?metricGlobals(metrics):[Math,Object,JSON,Float32Array,Float64Array,Uint8Array,Int32Array];
  const args=['window','globalThis','Math','Object','JSON','Float32Array','Float64Array','Uint8Array','Int32Array'];
  const loaded=[];
  for(const [file,optional]of MODULES){
    const source=readSource(ref,file,optional);if(source===null)continue;
    // Function compiles all versions in this realm with identical native Math,
    // typed arrays and globals. A lexical window keeps releases independent.
    Function(...args,source+'\n//# sourceURL=galley-'+ref.replace(/[^a-zA-Z0-9]/g,'-')+'-'+path.basename(file))(scope,scope,...globals);
    loaded.push({file,sha256:createHash('sha256').update(source).digest('hex')});
    if(file==='loom/effects.js'){
      const make=scope.createLoomEffectsDSP;
      scope.createLoomEffectsDSP=function(...dependencies){
        const result=make(...(dependencies.length?dependencies:FACTORIES.map(name=>scope[name])));
        if(instrument){const create=result.create;result.create=function(...values){const fx=create(...values);if(fx)for(const key of ['setParams','process','getMeters','reset'])if(typeof fx[key]==='function'){const method=fx[key];fx[key]=function(...params){const id=values[0]+'.'+key;metrics[id]=(metrics[id]||0)+1;return method.apply(this,params);};}return fx;};}
        return result;
      };
    }
    if(instrument&&file==='loom/lfo.js'){
      const make=scope.createLoomLFODSP;
      scope.createLoomLFODSP=function(...args){const result=make(...args);for(const key of ['has','apply','target','applyTarget'])if(typeof result.Runtime?.prototype[key]==='function'){const original=result.Runtime.prototype[key];result.Runtime.prototype[key]=function(...values){metrics['LFO.'+key]=(metrics['LFO.'+key]||0)+1;return original.apply(this,values);};}return result;};
    }
  }
  const E=scope.createLoomEffectsDSP(), DSP=scope.createLoomEngineDSP(scope.createLoomEffectsDSP,scope.createLoomLFODSP,scope.createLoomCPUProfiler,scope.createLoomTrackEQDSP);
  if(instrument)for(const key of ['getMeters','setState','_syncDiagnosticsTopology','beginDiagnostics','endDiagnostics','diagnosticsStart','diagnosticsEnd','diagnosticsReportDue'])if(typeof DSP.Core.prototype[key]==='function'){const original=DSP.Core.prototype[key];DSP.Core.prototype[key]=function(...args){metrics['Core.'+key]=(metrics['Core.'+key]||0)+1;return original.apply(this,args);};}
  return {ref,scope,S:scope.LoomSchema,E,DSP,metrics,loaded,resetMetrics(){for(const key of Object.keys(metrics))delete metrics[key];}};
}
function descriptor(release,type){return release.scope.LoomEffectsCatalog.find(effect=>effect.id===type);}
function effect(release,type,patch={}) { assert(descriptor(release,type),'Missing effect '+type+' in '+release.ref);return release.S.effect({type,params:{...PATCHES[type],...patch}}); }
function signal(frames,rate=48000,offset=0,amplitude=.018){return [0,1].map(channel=>Float32Array.from({length:frames},(_,at)=>{const i=at+offset,t=i/rate;return amplitude*(Math.sin(2*Math.PI*(channel?227:137)*t)+.31*Math.cos(2*Math.PI*(channel?1901:1703)*t)+.17*Math.sin(2*Math.PI*63*t));}));}
function baseState(release){
  const state=release.S.defaultState();state.tempo=120;state.lengthBars=64;state.loopEnabled=true;state.loopStart=0;state.loopEnd=256;state.recording.punchEnd=256;
  for(const owner of [...state.tracks,...state.returns,state.master]){owner.effects.fill(null);owner.automation=[];owner.level=.3;owner.mute=false;if('pan'in owner)owner.pan=0;}
  state.tracks.forEach((track,index)=>{track.instrumentLive=true;track.clips=[];track.sends=[0,0];track.sendPre=[false,false];track.level=.22+index*.01;track.eq={...track.eq,low:0,lowMid:0,highMid:0,high:0};});
  state.lfos?.forEach(lfo=>{lfo.enabled=false;lfo.routes=[];});return state;
}
function fixture(release,name='plain'){
  const state=baseState(release),assets={};
  if(name==='plain')return {state,assets};
  if(name==='compressors'||name==='multiband'){
    const models=['clean','fet-76','opto-2a','opto-3a','vari-670','bus-4k','vca-160','bus-2500'];
    state.tracks.forEach((track,index)=>{track.effects[0]=effect(release,'velvet',{model:models[index],...(name==='multiband'?{bandMode:'multiband',lowRatio:3,midRatio:2,highRatio:4,lowThreshold:-30,midThreshold:-24,highThreshold:-27}:{})});});
    if(name==='multiband')assert(descriptor(release,'velvet').defaults.bandMode!==undefined,'Multiband is not part of '+release.ref);
    return {state,assets};
  }
  if(!['dense','automation','arrangement','silent'].includes(name))throw Error('Unknown fixture '+name);
  state.tracks.forEach((track,index)=>{
    for(let slot=0;slot<Math.min(4,track.effects.length);slot++)track.effects[slot]=effect(release,EFFECTS[(index*4+slot)%EFFECTS.length]);
    track.eq={...track.eq,low:1.5,lowMid:-1.7,highMid:1.2,high:-.8};track.pan=(index-3.5)*.08;track.sends=[.13,.07];
  });
  state.returns[0].effects[0]=effect(release,'vestige',{mix:1,decay:1.3});state.returns[1].effects[0]=effect(release,'parallax',{mix:1,time:127});
  state.master.effects[0]=effect(release,'velvet',{model:'bus-4k',threshold:-18,ratio:2,makeup:0,mix:.6});
  if(name==='automation'){
    state.tracks.forEach((track,index)=>{
      const type=track.effects[0].type,definition=descriptor(release,type),key=automationKey(definition),param=definition.params.find(p=>p.key===key),span=param.max-param.min;
      track.automation=[{target:'fx:0:'+key,effectType:type,enabled:true,interpolation:'linear',points:[{beat:0,value:param.min+span*.3},{beat:32,value:param.min+span*.7}]}];
      track.automation.push({target:'eq:lowMid',enabled:true,interpolation:'linear',points:[{beat:0,value:-3},{beat:32,value:3}]});
    });
    state.lfos?.forEach((lfo,index)=>{lfo.enabled=true;lfo.sync=false;lfo.rate=.4+index*.23;lfo.wave='sine';lfo.routes=[{id:'perf-pan-'+index,ownerId:'track-'+(index+1),target:'pan',amount:.1,enabled:true}];});
  }
  if(name==='arrangement')state.tracks.forEach((track,index)=>{
    track.instrumentLive=false;const pair=signal(96000,48000,index*31,.018),id='perf-asset-'+index;assets[id]={left:pair[0],right:pair[1],sampleRate:48000};
    for(let clip=0;clip<16;clip++)track.clips.push({id:'perf-clip-'+index+'-'+clip,name:'Fixture',type:'audio',assetId:id,start:clip*4,length:4,sourceStart:0,sourceEnd:2,sourceOffset:0,rate:1,reverse:false,loop:true,gain:.7,fadeIn:0,fadeOut:0});
  });
  return {state,assets,silent:name==='silent'};
}
function automationKey(definition){return AUTOMATE[definition.id]||definition.params.find(p=>p.type==='range'&&!['mix','output','input'].includes(p.key))?.key||'mix';}
function outputStats(channels){let peak=0,power=0;for(const channel of channels)for(const value of channel){assert(Number.isFinite(value),'Non-finite output');peak=Math.max(peak,Math.abs(value));power+=value*value;}return {peak,rms:Math.sqrt(power/(channels[0].length*2)),sha256:digest(channels)};}
function effectRun(release,type,{frames=8192,rate=48000,automated=false,block=128,patch={}}={}){
  const params=effect(release,type,patch).params,fx=release.E.create(type,rate,params),definition=descriptor(release,type),key=automationKey(definition),param=definition.params.find(p=>p.key===key),input=signal(frames,rate,0,.11),output=input.map(channel=>channel.slice());
  const step=automated?32:block,clock={tempo:120,beat:0,playing:true};
  for(let at=0;at<frames;at+=step){clock.beat=at/rate*2;if(automated){const fraction=.5+.2*Math.sin(at/1301),value=param.min+(param.max-param.min)*fraction;fx.setParams({...params,[key]:value});}fx.process(output[0].subarray(at,at+step),output[1].subarray(at,at+step),clock);}
  return {output,fx};
}
function coreRun(release,name,{frames=8192,rate=48000,block=128,diagnostics='off',transport=false}={}){
  const f=fixture(release,name),core=new release.DSP.Core(f.state,f.assets,rate,{linear:false});core.start(0);if(diagnostics!=='off')core.setDiagnostics?.({enabled:true,mode:diagnostics});
  const source=f.silent?[new Float32Array(frames),new Float32Array(frames)]:signal(frames,rate),output=[new Float32Array(frames),new Float32Array(frames)];
  for(let at=0,index=0;at<frames;at+=block,index++){const pair=[source[0].subarray(at,at+block),source[1].subarray(at,at+block)],inputs=Array(8).fill(pair);core.processBlock(output[0].subarray(at,at+block),output[1].subarray(at,at+block),inputs);if(transport&&index%8===0)structuredClone(core.getMeters());if(diagnostics!=='off'&&core.diagnosticsReportDue?.())structuredClone(core.getDiagnostics());}
  return {output,core};
}
function compare(before,after,label){assert.equal(before.length,after.length,label+' channels');for(let channel=0;channel<before.length;channel++){assert.equal(before[channel].length,after[channel].length,label+' frame count');assert(Buffer.from(before[channel].buffer,before[channel].byteOffset,before[channel].byteLength).equals(Buffer.from(after[channel].buffer,after[channel].byteOffset,after[channel].byteLength)),label+' PCM changed in channel '+channel);}return outputStats(after);}
function signalChecks(before,after,{frames=8192,fixtures=['plain','dense','automation','arrangement','compressors','multiband','silent']}={}){
  const results=[];
  for(const type of EFFECTS)for(const automated of [false,true]){
    const options={frames,automated},a=effectRun(before,type,options),b=effectRun(after,type,options),label=type+(automated?' automated':' static');
    results.push({kind:'effect',type,automated,...compare(a.output,b.output,label)});
  }
  for(const name of fixtures){
    if(name==='multiband'&&descriptor(before,'velvet').defaults.bandMode===undefined)continue;
    for(const block of [128,137]){const transport=block===128,a=coreRun(before,name,{frames,block,transport}),b=coreRun(after,name,{frames,block,transport});results.push({kind:'core',fixture:name,block,transport,...compare(a.output,b.output,name+' / '+block)});}
  }
  return results;
}
function signalHashes(release,{frames=8192,fixtures=['plain','dense','automation','arrangement','compressors','multiband','silent']}={}){
  const results=[];
  for(const type of EFFECTS)for(const automated of [false,true])results.push({kind:'effect',type,automated,...outputStats(effectRun(release,type,{frames,automated}).output)});
  for(const name of fixtures){if(name==='multiband'&&descriptor(release,'velvet').defaults.bandMode===undefined)continue;for(const block of [128,137]){const transport=block===128;results.push({kind:'core',fixture:name,block,transport,...outputStats(coreRun(release,name,{frames,block,transport}).output)});}}
  return {baseline:release.ref,frames,sampleRate:48000,results};
}
function frozenChecks(release,options={}){
  assert(FROZEN_PCM,'Historical Git reference is unavailable and frozen release PCM has not been captured.');
  assert.equal(FROZEN_PCM.baseline,RELEASE,'Frozen PCM must identify the actual released baseline');
  const frames=options.frames||8192;assert.equal(frames,FROZEN_PCM.frames,'Portable frozen checks require the captured frame count');
  const actual=signalHashes(release,options),key=row=>row.kind==='effect'?'effect:'+row.type+':'+row.automated:'core:'+row.fixture+':'+row.block;
  const expected=new Map(FROZEN_PCM.results.map(row=>[key(row),row]));
  for(const row of actual.results){const previous=expected.get(key(row));assert(previous,'No frozen release fixture for '+key(row));assert.equal(row.sha256,previous.sha256,key(row)+' released PCM changed');}
  return actual.results;
}
function timed(run){const start=performance.now(),cpu=process.cpuUsage();run();const used=process.cpuUsage(cpu);return {wallMs:performance.now()-start,cpuMs:(used.user+used.system)/1000};}
function summarize(observations,blocks){const cpuMs=median(observations.map(value=>value.cpuMs)),wallMs=median(observations.map(value=>value.wallMs));return {cpuMs,wallMs,cpuMicrosecondsPerBlock:cpuMs*1000/blocks,audioBudgetPercent:cpuMs/(blocks*128/48)*100,observations};}
function effectMatrix(release,{blocks=768,warmup=256,trials=3,effects=EFFECTS}={}){
  const results=[];
  for(const type of effects){
    const params=effect(release,type).params,def=descriptor(release,type),key=automationKey(def),parameter=def.params.find(p=>p.key===key),input=signal(128,48000,0,.11),clock={tempo:120,beat:0,playing:true};
    const row={type,automationKey:key,params,static:[],automated:[],meters:[]};
    for(let trial=0;trial<trials;trial++)for(let offset=0;offset<3;offset++){
      const mode=['static','automated','meters'][(offset+trial)%3],fx=release.E.create(type,48000,params),left=new Float32Array(128),right=new Float32Array(128),views=[0,32,64,96].map(at=>[left.subarray(at,at+32),right.subarray(at,at+32)]),updates=Array.from({length:64},(_,at)=>({...params,[key]:parameter.min+(parameter.max-parameter.min)*(.5+.2*Math.sin(at/11))}));let index=0;
      const step=()=>{left.set(input[0]);right.set(input[1]);clock.beat=index*128/48000*2;if(mode==='automated')for(let part=0;part<4;part++){fx.setParams(updates[(index*4+part)%updates.length]);fx.process(views[part][0],views[part][1],clock);}else fx.process(left,right,clock);index++;};
      for(let block=0;block<warmup;block++)step();
      if(mode==='meters')row.meters.push(timed(()=>{for(let block=0;block<blocks;block++)structuredClone(fx.getMeters?.()||null);}));
      else row[mode].push(timed(()=>{for(let block=0;block<blocks;block++)step();}));
    }
    results.push({type,automationKey:key,params,static:summarize(row.static,blocks),automated:summarize(row.automated,blocks),meters:{...summarize(row.meters,blocks),unit:'one getMeters plus structuredClone; not an audio block'}});
  }
  return results;
}
function coreBenchmark(releases,{blocks=1200,warmup=512,trials=3,fixtures=['plain','compressors','dense','automation','arrangement'],modes=['off','after-disable','light','deep'],transport=true}={}){
  const results=[];
  for(const name of fixtures){
    const cases=[];
    for(const release of releases)for(const mode of modes){if(mode!=='off'&&!release.scope.createLoomCPUProfiler)continue;if(name==='multiband'&&descriptor(release,'velvet').defaults.bandMode===undefined)continue;cases.push({release,mode,observations:[]});}
    for(let trial=0;trial<trials;trial++)for(let index=0;index<cases.length;index++){
      const item=cases[(index+trial)%cases.length],f=fixture(item.release,name),core=new item.release.DSP.Core(f.state,f.assets,48000,{linear:false});core.start(0);if(item.mode!=='off')core.setDiagnostics({enabled:true,mode:item.mode==='after-disable'?'deep':item.mode});
      const input=f.silent?[new Float32Array(128),new Float32Array(128)]:signal(128),inputs=Array(8).fill(input),out=[new Float32Array(128),new Float32Array(128)];let block=0,profiling=item.mode!=='off';
      const step=()=>{core.processBlock(out[0],out[1],inputs);if(transport&&block%8===0)structuredClone(core.getMeters());if(profiling&&core.diagnosticsReportDue())structuredClone(core.getDiagnostics());block++;};
      for(let index=0;index<warmup;index++){if(item.mode==='after-disable'&&index===Math.min(64,Math.floor(warmup/2))){core.setDiagnostics({enabled:false});profiling=false;}step();}item.observations.push(timed(()=>{for(let index=0;index<blocks;index++)step();}));
    }
    for(const item of cases)results.push({fixture:name,ref:item.release.ref,mode:item.mode,transportCloning:transport,...summarize(item.observations,blocks)});
  }
  return results;
}
function callCounts(ref,{frames=1024,fixtures=['plain','compressors','dense','automation','multiband'],afterDisable=false}={}){
  const release=loadRelease(ref,true),rows=[];
  for(const name of fixtures){if(name==='multiband'&&descriptor(release,'velvet').defaults.bandMode===undefined)continue;const f=fixture(release,name),core=new release.DSP.Core(f.state,f.assets,48000,{linear:false});core.start(0);const input=signal(128),inputs=Array(8).fill(input),out=[new Float32Array(128),new Float32Array(128)];if(afterDisable&&release.scope.createLoomCPUProfiler)core.setDiagnostics({enabled:true,mode:'deep'});core.processBlock(out[0],out[1],inputs);if(afterDisable&&release.scope.createLoomCPUProfiler)core.setDiagnostics({enabled:false});release.resetMetrics();for(let at=0;at<frames;at+=128){core.processBlock(out[0],out[1],inputs);if(at%1024===0)structuredClone(core.getMeters());}rows.push({fixture:name,frames,afterDisable,metrics:{...release.metrics}});}
  return rows;
}
function structuralChecks(ref='working'){
  const results=[];
  for(const afterDisable of [false,true]){
    const row=callCounts(ref,{frames:1024,fixtures:['plain'],afterDisable})[0],metrics=row.metrics;
    // These are deterministic cost invariants for a steady, unmodulated desk,
    // not machine-dependent timing limits. Real Worklet/fallback wrapper and
    // browser/UI checks remain separate from this pure Core exercise.
    for(const key of ['performance.now','Core.beginDiagnostics','Core.endDiagnostics','Core.diagnosticsStart','Core.diagnosticsEnd','Core.diagnosticsReportDue','Core._syncDiagnosticsTopology','LFO.has','LFO.apply','LFO.target','LFO.applyTarget','Math.sin','Math.cos','JSON.stringify','new Float32Array','new Float64Array','new Uint8Array','new Int32Array'])assert.equal(metrics[key]||0,0,(afterDisable?'After disabling: ':'Cold off: ')+key+' repeats in the static audio path');
    assert((metrics['Math.exp']||0)<=row.frames/128*2,'A static desk must not recompute exponential transforms per sample');
    results.push(row);
  }
  return results;
}
module.exports={RELEASE,EFFECTS,PATCHES,loadRelease,descriptor,effect,signal,fixture,effectRun,coreRun,signalChecks,signalHashes,frozenChecks,effectMatrix,coreBenchmark,callCounts,structuralChecks,digest,outputStats};
if(require.main===module){
  const arg=(name,fallback)=>{const index=process.argv.indexOf(name);return index<0?fallback:process.argv[index+1];};
  const numeric=(name,fallback)=>{const value=Number(arg(name,fallback));assert(Number.isSafeInteger(value)&&value>0,'Invalid '+name);return value;};
  const list=(name,fallback)=>arg(name,fallback).split(',').filter(Boolean);
  const ref=arg('--ref','working'),baseline=arg('--baseline',RELEASE),report={createdAt:new Date().toISOString(),limitations:['Node CPU and wall timings are informational and require an otherwise idle machine.','Every compared version uses its own DSP and engine sources in the same native JavaScript realm.','Routine meter structuredClone approximates message preparation; it does not measure actual browser threads, hosted instruments or UI contention.','Call-count instrumentation runs separately from timing and cannot quantify every object-literal allocation.']};
  const options={blocks:numeric('--blocks',768),warmup:numeric('--warmup',256),trials:numeric('--trials',3)};
  if(process.argv.includes('--matrix')){const release=loadRelease(ref);report.ref=ref;report.modules=release.loaded;report.matrix=effectMatrix(release,{...options,effects:list('--effects',EFFECTS.join(','))});console.table(report.matrix.map(row=>({effect:row.type,staticUs:row.static.cpuMicrosecondsPerBlock.toFixed(2),automatedUs:row.automated.cpuMicrosecondsPerBlock.toFixed(2),meterUs:row.meters.cpuMicrosecondsPerBlock.toFixed(2)})));}
  else if(process.argv.includes('--bench')){const releases=list('--refs','5cfe634,67ae096,47d210f,working').map(value=>loadRelease(value));report.modules=releases.map(release=>({ref:release.ref,files:release.loaded}));report.benchmarks=coreBenchmark(releases,{...options,fixtures:list('--fixtures','plain,compressors,dense,automation,arrangement'),modes:list('--modes','off,after-disable,light,deep'),transport:!process.argv.includes('--no-transport')});console.table(report.benchmarks.map(row=>({fixture:row.fixture,ref:row.ref,mode:row.mode,us:row.cpuMicrosecondsPerBlock.toFixed(2),budget:row.audioBudgetPercent.toFixed(2)})));}
  else if(process.argv.includes('--calls')){report.ref=ref;report.calls=callCounts(ref,{frames:numeric('--frames',1024),fixtures:list('--fixtures','plain,compressors,dense,automation,multiband'),afterDisable:process.argv.includes('--after-disable')});console.log(JSON.stringify(report.calls,null,2));}
  else if(process.argv.includes('--capture-goldens')){report.frozen=signalHashes(loadRelease(baseline),{frames:numeric('--frames',8192)});console.log(JSON.stringify(report.frozen,null,2));}
  else{const after=loadRelease(ref),options={frames:numeric('--frames',8192),fixtures:list('--fixtures','plain,dense,automation,arrangement,compressors,multiband,silent')};let before;try{before=loadRelease(baseline);}catch(error){if(baseline!==RELEASE||!FROZEN_PCM||!(error.status===128||error.code==='ENOENT'))throw error;}report.baseline=baseline;report.ref=ref;report.modules={before:before?.loaded||'Frozen released PCM hashes',after:after.loaded};report.pcm=before?signalChecks(before,after,options):frozenChecks(after,options);console.log('PASS '+report.pcm.length+' exact PCM comparisons against '+baseline);if(ref==='working'&&!process.argv.includes('--signal-only')){report.structural=structuralChecks(ref);console.log('PASS '+report.structural.length+' cold-off/after-disable static-path cost invariants');}}
  const destination=arg('--report',null);if(destination){fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');console.log('Report: '+destination);}
}
