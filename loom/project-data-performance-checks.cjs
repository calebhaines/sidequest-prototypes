'use strict';
/* Bounded regressions for source validation proofs and recovery-size proofs.
 * No browser, audio rendering, large fixtures, timing assertions or Git needed. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webcrypto}=require('node:crypto');
const scope={crypto:webcrypto};scope.window=scope;
for(const file of ['shared/pattern-schema.js','loom/lfo.js','loom/service-schema.js','loom/schema.js']){
  const local=file.startsWith('loom/')?path.join(__dirname,file.slice(5)):fs.existsSync(path.join(__dirname,file))?path.join(__dirname,file):path.join(__dirname,'..',file);
  Function('window','globalThis','crypto','atob','btoa','TextEncoder',fs.readFileSync(local,'utf8'))(scope,scope,webcrypto,atob,btoa,TextEncoder);
}
const S=scope.LoomSchema,passed=[],LIMIT=16384;
const check=(name,fn)=>{fn();passed.push(name);console.log('PASS '+name);};
const asset=(frames=24)=>S.encodeAsset({left:Float32Array.from({length:frames},(_,i)=>Math.sin(i*.3)*.03),sampleRate:48000,id:'source',name:'Recorded source'});
function project(audio=asset()){
  const state=S.defaultState();state.assets=[audio];state.tracks[0].clips=[{id:'clip',name:'Clip',type:'audio',assetId:audio.id,start:0,length:1,sourceStart:0,sourceEnd:audio.frames/audio.sampleRate,sourceOffset:0,rate:1,reverse:false,loop:false,gain:1,fadeIn:0,fadeOut:0}];return state;
}
function snapshot(state,characters){state.tracks[0].instrument={id:'batter',snapshot:{format:'loom-instrument-state',version:1,app:'batter',state:{assets:[{pcm:'a'.repeat(characters)}]}}};return state;}
function pcmScans(fn){const original=RegExp.prototype.test;let count=0;RegExp.prototype.test=function(value){if(this.source==='^[A-Za-z0-9+/]*={0,2}$')count++;return original.call(this,value);};try{return{value:fn(),get count(){return count;}};}finally{RegExp.prototype.test=original;}}
function serializerCalls(fn){const original=JSON.stringify;let count=0;JSON.stringify=function(...args){count++;return original(...args);};try{return{value:fn(),count};}finally{JSON.stringify=original;}}
function assertSafePreflight(state,limit=LIMIT){const json=S.serializeProject(state),tooLarge=S.recoveryPayloadExceeds(state,limit);assert(!tooLarge||json.length>=limit,'A preflight proof must never reject a fitting canonical project');return{json,tooLarge};}

check('Fresh source audio is checked once and unchanged validation/copy/normalize/Save reuse only that proof',()=>{
  const a=asset();assert.equal(pcmScans(()=>S.validateAsset(a)).count,1,'New source is fully validated');
  assert.equal(pcmScans(()=>S.validateAsset(a)).count,0);
  const copy=S.copy(a);assert.equal(pcmScans(()=>S.validateAsset(copy)).count,0,'Trusted structural copy preserves proof');
  const normalized=pcmScans(()=>S.normalize(project(a)));assert.equal(normalized.count,0);
  assert.equal(pcmScans(()=>S.serializeProject(normalized.value)).count,0,'Pruning/normalizing an unchanged Save must not rescan PCM');
  assert.equal(pcmScans(()=>S.decodeAsset(normalized.value.assets[0])).count,0);
  const json=S.serializeProject(normalized.value),opened=pcmScans(()=>S.parseProject(json));assert.equal(opened.count,1,'A new JSON/Open object must pass full PCM validation');
  assert.equal(pcmScans(()=>S.normalize(opened.value)).count,0);
});
check('Every invalid mutated source field still rejects, and stale proofs cannot escape through copy',()=>{
  const invalid={id:'',name:null,sampleRate:7999,frames:0,channels:3,duration:-1,pcm:'!'.repeat(32)};
  for(const[key,value]of Object.entries(invalid)){const a=asset();S.validateAsset(a);a[key]=value;assert.throws(()=>S.validateAsset(a),/audio asset|PCM/i,key);assert.throws(()=>S.validateAsset(S.copy(a)),/audio asset|PCM/i,key+' copied');}
  const a=asset();S.validateAsset(a);a.pcm='!'+a.pcm.slice(1);assert.throws(()=>S.normalize(project(a)),/PCM/);
});
check('Valid source changes are revalidated, and normalization may safely canonicalize names/duration',()=>{
  for(const change of [a=>a.id='new-id',a=>a.name='New name',a=>{a.sampleRate=44100;a.duration=a.frames/44100;},a=>a.pcm=(a.pcm[0]==='/'?'A':'/')+a.pcm.slice(1)]){const a=asset();S.validateAsset(a);change(a);assert.equal(pcmScans(()=>S.validateAsset(a)).count,1);assert.equal(pcmScans(()=>S.validateAsset(a)).count,0);}
  const a=asset();a.name='  \t ';delete a.duration;S.validateAsset(a);const normalized=S.normalize(project(a));assert.equal(normalized.assets[0].name,'Audio');assert.equal(pcmScans(()=>S.validateAsset(normalized.assets[0])).count,0);
});
check('Accessor records retain uncached validation and replacing a field with an accessor invalidates proof',()=>{
  const a=asset(),pcm=a.pcm;Object.defineProperty(a,'pcm',{get:()=>pcm,enumerable:true,configurable:true});assert.equal(pcmScans(()=>{S.validateAsset(a);S.validateAsset(a);}).count,2);
  const b=asset();S.validateAsset(b);Object.defineProperty(b,'pcm',{get:()=>'!'+pcm.slice(1),enumerable:true});assert.throws(()=>S.validateAsset(b),/PCM/);
  const inherited=asset();delete inherited.duration;S.validateAsset(inherited);const old=Object.getOwnPropertyDescriptor(Object.prototype,'duration');Object.defineProperty(Object.prototype,'duration',{value:-1,configurable:true});try{assert.throws(()=>S.validateAsset(inherited),/duration/);}finally{if(old)Object.defineProperty(Object.prototype,'duration',old);else delete Object.prototype.duration;}
});
check('Large snapshots and repeated printed sources prove recovery overflow without JSON serialization',()=>{
  const state=snapshot(project(),LIMIT*2);const calls=serializerCalls(()=>S.recoveryPayloadExceeds(state,LIMIT));assert.equal(calls.value,true);assert.equal(calls.count,0);
  const shared=snapshot(project(),LIMIT/3),packet={format:'musiclab-pattern',version:1,lengthBeats:4,voices:[{id:'kick',name:'Kick',pitch:36}],notes:[{pitch:36,beat:0,duration:.25,voice:'kick'}]};
  for(let i=0;i<3;i++){const c={...S.copy(shared.tracks[0].clips[0]),id:'printed-'+i};c.origin={format:'loom-render-source',version:1,instrument:S.copy(shared.tracks[0].instrument),pattern:packet,voiceMap:{},tempo:120,tailSeconds:0,renderedAt:0,sourceClip:{id:'notes-'+i,name:'Notes',type:'notes',pattern:packet,voiceMap:{},start:0,length:4,sourceOffset:0,rate:1,loop:false,gain:1,fadeIn:0,fadeOut:0,transpose:0}};shared.tracks[0].clips.push(c);}
  assert.equal(assertSafePreflight(shared).tooLarge,true,'Each serialized origin occurrence counts, even when Undo shares its strings');
});
check('Unused PCM/freeze data and ignored snapshot keys cannot falsely reject a fitting recovery',()=>{
  const state=project(asset(8192));state.tracks[0].clips=[];assert.equal(S.recoveryPayloadExceeds(state,LIMIT),false);assert(S.serializeProject(state).length<LIMIT);
  state.freezeAssets=[{id:'unused-freeze',pcm:'a'.repeat(LIMIT*2)}];assert.equal(S.recoveryPayloadExceeds(state,LIMIT),false,'Unreferenced freeze assets are pruned before validation');
  const unusual=snapshot(project(),10);unusual.tracks[0].instrument.snapshot.state.constructor='x'.repeat(LIMIT*2);assert.equal(assertSafePreflight(unusual).tooLarge,false,'schema.copy removes constructor/prototype keys');
});
check('Canonical track/clip truncation excludes discarded snapshots but preserves pre-prune asset references',()=>{
  const limit=LIMIT*4,extra=snapshot(S.defaultState(),0),outside=S.copy(extra.tracks[0]);outside.id='track-11';outside.instrument=snapshot(project(),limit*2).tracks[0].instrument;extra.tracks.push(outside);assert.equal(assertSafePreflight(extra,limit).tooLarge,false,'An eleventh track snapshot is not serialized');
  const state=project();state.tracks[0].clips=Array.from({length:129},(_,i)=>({...state.tracks[0].clips[0],id:'clip-'+i}));state.tracks[0].clips[128].origin={format:'loom-render-source',version:1,instrument:outside.instrument};assert.equal(assertSafePreflight(state,limit).tooLarge,false,'A129th clip origin is not serialized');
  const retained=asset(12288);retained.id='referenced-before-truncation';state.assets.push(retained);state.tracks[0].clips[128]={...state.tracks[0].clips[128],assetId:retained.id};delete state.tracks[0].clips[128].origin;assert.equal(assertSafePreflight(state,limit).tooLarge,true,'pruneAssets retains audio referenced before clip truncation');
});
check('Near-limit, Unicode and escaped snapshots defer to the authoritative canonical serializer',()=>{
  const state=snapshot(project(),0),base=S.serializeProject(state).length;
  for(const offset of [-1,0,1]){state.tracks[0].instrument.snapshot.state.assets[0].pcm='a'.repeat(LIMIT-base+offset);const result=assertSafePreflight(state);assert.equal(result.json.length,LIMIT+offset);assert.equal(result.tooLarge,false,'Borderline envelope/default fields stay with the serializer');}
  for(const text of ['"\n\\\u0000'.repeat(200),'雪💧'.repeat(300),'\ud800'.repeat(1000)]){state.tracks[0].instrument.snapshot.state.assets[0].pcm=text;const result=assertSafePreflight(state);assert.equal(result.tooLarge,false);}
  state.tracks[0].instrument.snapshot.state={payload:'x'.repeat(LIMIT*2),toJSON(){return{};}};assert.equal(assertSafePreflight(state).tooLarge,false,'Custom JSON conversion is uncertain and must defer');
  const custom=project(asset(8192));custom.assets.map=()=>[];assert.equal(assertSafePreflight(custom).tooLarge,false,'Custom array-copy behavior must defer rather than count discarded PCM');
});
check('Large numeric arrays use a bounded structural proof without a redundant per-element scan',()=>{
  const state=snapshot(project(),0);state.tracks[0].instrument.snapshot.state.samples=Array(9000).fill(0);assert.equal(assertSafePreflight(state).tooLarge,true);
  state.tracks[0].instrument.snapshot.state.samples=Array(7000).fill(0);const original=Object.getOwnPropertyDescriptor;let reads=0;Object.getOwnPropertyDescriptor=function(...args){reads++;return original(...args);};try{S.recoveryPayloadExceeds(state,LIMIT*2);}finally{Object.getOwnPropertyDescriptor=original;}assert(reads<100,'A large near-limit sample array should defer rather than walk all elements');
});
check('Native note-pattern structural minimum cannot reject a canonical score that fits',()=>{
  const state=S.defaultState(),notes=Array.from({length:200},(_,i)=>({id:'n'+i,pitch:36,voice:'kick',beat:(i%16)*.25,duration:.125,velocity:.8,probability:1})),packet={format:'musiclab-pattern',version:1,lengthBeats:4,voices:[{id:'kick',name:'Kick',pitch:36}],notes};state.tracks[0].clips=[{id:'score',name:'Score',type:'notes',pattern:packet,voiceMap:{},start:0,length:4,sourceOffset:0,rate:1,loop:false,gain:1,fadeIn:0,fadeOut:0,transpose:0}];assert.equal(assertSafePreflight(state).tooLarge,true);
  packet.notes=Array(200);const sparse=assertSafePreflight(state);assert(sparse.json.length<LIMIT);assert.equal(sparse.tooLarge,false,'Sparse note arrays are null slots, not full canonical note records');
});
console.log(passed.length+' project data validation/recovery groups passed.');
