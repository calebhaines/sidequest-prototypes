'use strict';
// Headless host-contract checks. Real effect PCM is compared below; instrument
// DSP parity and original Web Audio graphs have separate adapter checks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
let passed = 0;
const liveInputOnly = process.argv.includes('--live-input-only');
async function check(name, run) { if (liveInputOnly && !name.includes('live input')) return; await run(); passed++; console.log('PASS', name); }
function realm() {
  const g = { Float32Array, Float64Array, Uint8Array, Int32Array, ArrayBuffer, DataView, console };
  vm.createContext(g); vm.runInContext(source('plugins/js/environment.js'), g, { filename: 'environment.js' });
  g.KitchenHostIO = { inputLeft: new Float32Array(1024), inputRight: new Float32Array(1024), outputLeft: new Float32Array(1024), outputRight: new Float32Array(1024), clock: new Float64Array(16), events: new Float64Array(4096 * 8), eventCount: 0, outputEvents: new Float64Array(4096 * 8), outputEventCount: 0, parameters: new Float64Array(4096) };
  return g;
}
const fixtureSource = `
(function(g) {
  const defs = [{id:'fixture',name:'Bounded fixture',kind:'instrument',parameters:[
    {path:'gain',type:'number',min:-2,max:2,default:1},
    {path:'mode',type:'select',options:[{value:'dry'},{value:'double'},{value:'invert'}],default:'dry'},
    {path:'enabled',type:'boolean',default:true},
    {path:'_nativeSequence',type:'boolean',default:true}
  ]}];
  g.fixtures=[];
  function create(id,sr,state,resources) {
    const value = {gain:1,mode:'dry',enabled:true,...state}; let held=0, follow=resources.nativeSequence, processed=0;
    const info={clocks:[],events:[],sizes:[],timers:[],resources};g.fixtures.push(info);
    const api={
      getState:()=>JSON.parse(JSON.stringify(value)),
      setParameter(path,n){value[path]=n;},setNativeSequence(n){follow=n;info.follow=n;},
      transport(clock){info.transport={...clock};},
      noteOn(event){info.events.push({type:'on',...event});held+=event.velocity;},
      noteOff(event){info.events.push({type:'off',...event});held=0;},
      controlChange(event){info.events.push({type:'cc',...event});},
      pitchBend(event){info.events.push({type:'bend',...event});},
      allNotesOff(){info.events.push({type:'panic'});held=0;},
      process(L,R,clock){info.clocks.push({...clock});info.sizes.push(L.length);for(let i=0;i<L.length;i++){L[i]=value.enabled?held*value.gain*(value.mode==='double'?2:value.mode==='invert'?-1:1):0;R[i]=-L[i];}processed+=L.length;},
      reset(){held=0;processed=0;info.resets=(info.resets||0)+1;},getLatencySamples:()=>37,getTailSeconds:()=>.4,
      getMeters:()=>({held,follow}),prepare:()=>true
    };
    if(id==='asynchronous') {
      api.ready=new Promise(resolve=>g.setTimeout(()=>{info.prepared=true;resolve(true);},5));api.prepare=()=>api.ready;
    }
    if(id==='failed') api.prepare=()=>Promise.reject(Error('Deliberate preparation failure'));
    if(id==='throwing') api.process=()=>{throw Error('Deliberate DSP failure');};
    return api;
  }
  g.KitchenCoreInstruments={ids:['fixture','asynchronous','failed','throwing'],definitions:()=>defs,create};
})(globalThis);`;
function fixtures() {
  const g = realm(); vm.runInContext(fixtureSource, g);
  g.KitchenPluginDescriptors = ['fixture', 'asynchronous', 'failed', 'throwing'].map(id => ({ id: 'instrument-' + id, sourceId: id, kind: 'instrument', parameters: g.KitchenCoreInstruments.definitions()[0].parameters }));
  vm.runInContext(source('plugins/js/host-runtime.js'), g, { filename: 'host-runtime.js' });
  return g;
}
function clock(g, options = {}) {
  const values = { bpm: 120, beat: 0, playing: true, numerator: 4, denominator: 4, looping: false, loopStart: 0, loopEnd: 4, samplePosition: 0, localFrame: 0, revision: 0, sampleRate: 48000, frames: 0, recording: false, ppqValid: true, sampleValid: true, ...options };
  g.KitchenHostIO.clock.set([values.bpm, values.beat, +values.playing, values.numerator, values.denominator, +values.looping, values.loopStart, values.loopEnd, values.samplePosition, values.localFrame, values.revision, values.sampleRate, values.frames, +values.recording, +values.ppqValid, +values.sampleValid]);
}
function events(g, rows) { const io = g.KitchenHostIO; io.eventCount = rows.length; io.events.fill(0); rows.forEach((row, i) => io.events.set(row, i * 8)); }
const plain = x => JSON.parse(JSON.stringify(x));
(async () => {
  await check('Native environment encodes real Unicode, base64 and cyclic/typed cloned state', () => {
    const g = realm(), utf = 'Kitchen 🍳 / café / \ud800', encoded = g.TextEncoder ? new g.TextEncoder().encode(utf) : vm.runInContext('new TextEncoder().encode("Kitchen 🍳 / café / \\ud800")', g);
    assert.equal(new g.TextDecoder().decode(encoded), 'Kitchen 🍳 / café / \ufffd');
    assert.equal(g.btoa('\x00\xff\x80ABC'), Buffer.from([0, 255, 128, 65, 66, 67]).toString('base64'));
    assert.equal(g.atob('AP+AQUJD'), '\x00\xff\x80ABC');
    assert.throws(() => g.atob('a'), /base64/); assert.throws(() => g.btoa('🍳'), /binary/);
    const state = { data: new Float32Array([.25, -.5]), map: new Map() }; state.self = state;
    // Construct container inside the JS realm so standard Map identity matches.
    const result = vm.runInContext('(()=>{const a={data:new Float32Array([.25,-.5]),map:new Map([["a",2]])};a.self=a;return structuredClone(a)})()', g);
    assert.equal(result.self, result); assert.equal(result.map.get('a'), 2); assert.deepEqual(Array.from(result.data), [.25, -.5]);
    assert.match(g.crypto.randomUUID(), /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  });
  await check('Timers are entirely sample-clock driven, deterministic, cancellable and bounded', () => {
    const g = realm(), env = g.KitchenNativeEnvironment, calls = [];
    env.configure({ sampleRate: 48000, clearTimers: true });
    g.setTimeout(value => calls.push([value, g.performance.now()]), 1, 'timeout');
    const interval = g.setInterval(() => calls.push(['interval', g.performance.now()]), 2);
    const cancel = g.setTimeout(() => calls.push(['cancelled']), 3); g.clearTimeout(cancel);
    assert.equal(g.performance.now(), 0); assert.equal(calls.length, 0);
    env.startAudio(); env.advanceToFrame(47); assert.equal(calls.length, 0);
    env.advanceToFrame(48); assert.deepEqual(calls[0], ['timeout', 1]);
    env.advanceToFrame(192); assert.equal(calls.filter(entry => entry[0] === 'interval').length, 2);
    g.clearInterval(interval); env.advanceToFrame(48000); assert.equal(calls.length, 3);
    assert.throws(() => env.advanceToFrame(2), /monotonic/);
    assert.throws(() => env.prepareTick(), /running/);
    env.configure({ sampleRate: 48000, clearTimers: true });
    function runaway() { g.setTimeout(runaway, 0); } g.setTimeout(runaway, 0);
    assert.throws(() => env.prepareTick(1), /callback limit/);
  });
  await check('MIDI offsets split odd host buffers exactly and rebase a fresh runtime at any host frame', () => {
    const g = fixtures(), api = g.KitchenNativePlugin, io = g.KitchenHostIO;
    api.create('instrument-fixture', 48000, 1024, '');
    clock(g, { bpm: 137, beat: 8.5, localFrame: 900000, samplePosition: 456789, numerator: 7, denominator: 8, recording: true });
    // Deliberately unsorted rows retain same-offset order after the stable index sort.
    events(g, [[250, 2, 60, 0, 2, 91], [13, 1, 60, .75, 2, 91], [127, 3, 64, 1, 2], [127, 4, 0, -.3, 2]]);
    assert.equal(api.render(301), true);
    for (let i = 0; i < 301; i++) assert.equal(io.outputLeft[i], i >= 13 && i < 250 ? .75 : 0);
    const info = g.fixtures[0]; assert(info.sizes.every(size => size > 0 && size <= 128)); assert.equal(info.sizes.reduce((a, b) => a + b, 0), 301);
    assert.deepEqual(Array.from(info.events, e => e.type), ['on', 'cc', 'bend', 'off']);
    assert.equal(info.events[0].frame, 13); assert.equal(info.events[0].channel, 1); assert.equal(info.events[0].id, 91);
    for (const c of info.clocks) { assert.equal(c.frame >= 0 && c.frame <= 301, true); assert.equal(c.samplePosition, 456789 + c.frame); assert(Math.abs(c.beat - (8.5 + c.frame * 137 / (60 * 48000))) < 1e-12); assert.equal(c.timeSigNumerator, 7); assert.equal(c.timeSigDenominator, 8); assert.equal(c.recording, true); }
    assert.equal(api.getLatencySamples(), 37); assert.equal(api.getTailSeconds(), .4);
    clock(g, { localFrame: 900301, beat: 99, revision: 7 }); events(g, [[0, 1, 61, 1, 1, 92], [1, 1, 61, 0, 1, 92], [2, 5, 0, 0, 1]]); api.render(3);
    assert.equal(g.fixtures[0].events.at(-3).frame, 301); assert.equal(g.fixtures[0].events.at(-1).type, 'panic');
    assert.equal(g.fixtures[0].clocks.at(-1).revision, 7);
  });
  await check('Clock follows tempo, seek, stop, loop crossing, negative pre-roll and missing PPQ', () => {
    const g = fixtures(), api = g.KitchenNativePlugin; api.create('instrument-fixture', 48000, 1024, '');
    clock(g, { bpm: 120, beat: 3.999, localFrame: 12345, looping: true }); events(g, []); api.render(129);
    const clocks = g.fixtures[0].clocks;
    assert.deepEqual(Array.from(g.fixtures[0].sizes.slice(0, 2)), [24, 105]); assert.equal(clocks[0].beat, 3.999); assert(Math.abs(clocks[1].beat) < 1e-12); assert.equal(clocks[1].revision, 1);
    clock(g, { bpm: 90, beat: -.25, localFrame: 12474, revision: 2, looping: true, playing: true }); api.render(13);
    assert.equal(clocks.at(-1).beat, -.25); assert.equal(clocks.at(-1).tempo, 90);
    clock(g, { bpm: 90, beat: 7.125, localFrame: 12487, revision: 3, playing: false }); api.render(301);
    const stopped = clocks.filter(c => c.revision === 3); assert(stopped.every(c => c.beat === 7.125));
    clock(g, { bpm: 173, localFrame: 12788, ppqValid: false, playing: true }); api.render(257);
    const last = clocks.at(-1); assert(Math.abs(last.beat - (7.125 + 256 * 173 / (60 * 48000))) < 1e-12);
  });
  await check('Native normalized ranges, enums, booleans and global Follow DAW are exact', () => {
    const g = fixtures(), api = g.KitchenNativePlugin; api.create('instrument-fixture', 48000, 1024, JSON.stringify({gain:.4,mode:'invert',enabled:false, fullProject:{assets:['retained']}}));
    assert(Math.abs(api.getParameterValues()[0] - .6) < 1e-12); assert.equal(api.getParameterValues()[1], 1);
    assert.equal(api.setParameter(0, .75), 1); assert.equal(api.setParameter(1, .5), 'double'); assert.equal(api.setParameter(2, .5), true); assert.equal(api.setParameter(3, 0), false);
    assert.equal(g.fixtures[0].follow, false); assert.equal(g.KitchenHostIO.parameters[1], .5);
    const state = JSON.parse(api.getStateJSON()); assert.equal(state.gain, 1); assert.equal(state.mode, 'double'); assert.deepEqual(state.fullProject.assets, ['retained']);
    api.setStateJSON(JSON.stringify({...state,gain:-1.25})); assert.equal(JSON.parse(api.getStateJSON()).gain, -1.25);
    assert.deepEqual(JSON.parse(api.getStateJSON()).fullProject, state.fullProject);
  });
  await check('Preparation promises advance controlled timers before publication and reject explicit failure', async () => {
    const g = fixtures(), api = g.KitchenNativePlugin;
    assert.equal(api.create('instrument-asynchronous', 48000, 1024, '').preparing, true);
    api.prepareTick(4); await Promise.resolve(); assert.equal(JSON.parse(api.getStatusJSON()).ready, false);
    api.prepareTick(1); await Promise.resolve(); assert.equal(JSON.parse(api.getStatusJSON()).ready, true); assert.equal(g.fixtures[0].prepared, true);
    // Preparation time does not push a fresh AudioContext's notes into future.
    clock(g, { localFrame: 50000 }); events(g, [[0,1,60,1,1,99]]); api.render(1); assert.equal(g.fixtures[0].events[0].frame, 0); assert(Math.abs(g.performance.now() - 1000/48000) < 1e-12);
    api.create('instrument-failed', 48000, 1024, ''); await Promise.resolve(); assert.match(JSON.parse(api.getStatusJSON()).error, /preparation failure/); assert.throws(() => api.render(1), /preparation failure/);
  });
  await check('Timers split audio at their actual sample offset rather than host buffer boundaries', () => {
    const g = fixtures(), api = g.KitchenNativePlugin; api.create('instrument-fixture', 48000, 1024, '');
    let fired = false; g.setTimeout(() => { fired = true; api.setParameter(2, 0); }, 5 * 1000 / 48000);
    clock(g); events(g, [[0, 1, 60, 1, 1, 1]]); api.render(17);
    assert.equal(fired, true); assert.deepEqual(Array.from(g.fixtures[0].sizes), [5, 12]);
    assert.deepEqual(Array.from(g.KitchenHostIO.outputLeft.subarray(0, 17)), [...Array(5).fill(1), ...Array(12).fill(0)]);
  });
  await check('Reset starts a fresh portable core epoch; errors are observable rather than successful silence', () => {
    const g = fixtures(), api = g.KitchenNativePlugin; api.create('instrument-fixture', 48000, 1024, '');
    clock(g, { localFrame: 300000 }); events(g, []); api.render(129); api.reset();
    clock(g, { localFrame: 0 }); events(g, [[1, 1, 60, 1, 1, 3]]); api.render(3); assert.equal(g.fixtures[0].events.at(-1).frame, 1);
    api.create('instrument-throwing', 48000, 1024, ''); clock(g); events(g, []); assert.throws(() => api.render(17), /DSP failure/); assert.equal(JSON.parse(api.getStatusJSON()).ready, false); assert.match(JSON.parse(api.getStatusJSON()).error, /DSP failure/);
    api.create('instrument-fixture', 48000, 1024, ''); assert.throws(() => api.setParameter(99,.5), /parameter/);
    api.create('instrument-fixture', 48000, 1024, ''); assert.throws(() => api.render(2048), /capacity/);
    api.create('instrument-fixture', 48000, 1024, ''); clock(g); events(g, [[18,1,60,1,1,2]]); assert.throws(() => api.render(17), /MIDI/);
  });
  await check('Large default state and trusted per-product bootstrap are read only during preparation', () => {
    const g = fixtures(), reads = [];
    g.KitchenPluginDescriptors[0].defaultStateResource = 'default-state.json';
    g.KitchenPluginDescriptors[0].bootstrapScripts = ['factory.js'];
    g.KitchenNativeReadResource = (name, text) => { reads.push([name, text]); if(name.endsWith('factory.js'))return 'globalThis.nativeFactoryWasLoaded=true';return JSON.stringify({gain:.23,mode:'double',enabled:true,bank:{realPCM:'retained'}}); };
    const api=g.KitchenNativePlugin; api.create('instrument-fixture',48000,1024,'null');
    assert.equal(g.nativeFactoryWasLoaded,true);assert.deepEqual(reads.map(x=>x[0]),['assets/fixture/factory.js','assets/fixture/default-state.json']);
    assert.equal(JSON.parse(api.getStateJSON()).gain,.23);assert.equal(JSON.parse(api.getStateJSON()).bank.realPCM,'retained');
    const readCount=reads.length;clock(g);events(g,[[0,1,60,.5,1,42]]);api.render(301);assert.equal(reads.length,readCount);
  });
  const coreManifest=JSON.parse(source('plugins/core-instruments-manifest.json'));
  for(const entry of coreManifest.instruments) await check(entry.name+': actual core plays native MIDI with closed editor and retains complete project state', () => {
    const g=realm();
    for(const file of entry.sourceFiles)vm.runInContext(source(file),g,{filename:file});
    const definition=g.KitchenCoreInstruments.definitions().find(item=>item.id===entry.id);
    const params=[{path:'_nativeSequence',type:'boolean',default:true},...definition.parameters];
    g.KitchenPluginDescriptor={id:entry.id,sourceId:entry.id,kind:'instrument',parameters:params};
    vm.runInContext(source('plugins/js/host-runtime.js'),g,{filename:'host-runtime.js'});
    const api=g.KitchenNativePlugin;api.create(entry.id,48000,1024,JSON.stringify({format:entry.id+'-project',formatVersion:1,state:definition.defaults,retained:{assetNames:['original']}}));api.setParameter(0,0);
    let energy=0;
    for(let frame=0;frame<4096;frame+=512){clock(g,{localFrame:500000+frame,playing:false});events(g,frame===0?[[17,1,60,.85,1,82]]:[]);api.render(512);for(let i=0;i<512;i++){assert(Number.isFinite(g.KitchenHostIO.outputLeft[i])&&Number.isFinite(g.KitchenHostIO.outputRight[i]));energy+=Math.abs(g.KitchenHostIO.outputLeft[i])+Math.abs(g.KitchenHostIO.outputRight[i]);}}
    assert(energy>1e-6,entry.id+' did not render actual native instrument audio');
    const snapshot=JSON.parse(api.getStateJSON());assert.equal(snapshot.format,entry.id+'-project');assert.deepEqual(snapshot.retained.assetNames,['original']);
    clock(g,{localFrame:504096,playing:false});events(g,[[0,2,60,0,1,82]]);api.render(17);
  });
  for(const id of ['mire','spool'])await check(id+': live input reaches canonical DSP through independent bounded stereo views and is unchanged when disabled',()=>{
    const entry=coreManifest.instruments.find(entry=>entry.id===id),g=realm();for(const file of entry.sourceFiles)vm.runInContext(source(file),g,{filename:file});
    const state=g[entry.schema].normalize(g[entry.schema].defaultState());if(id==='spool'){state.record.input='mic';state.source.monitor=true;}
    const params=[{path:'_nativeSequence',type:'boolean',default:false},{path:'_nativeInput',type:'boolean',default:false},{path:'_nativeInputDestination',type:'number',min:0,max:3,default:0}];
    g.KitchenPluginDescriptor={id,sourceId:id,kind:'instrument',parameters:params};vm.runInContext(source('plugins/js/host-runtime.js'),g,{filename:'host-runtime.js'});
    function canonical(enabled){const core=id==='mire'?new g.MireDSP(48000,state):new g.SpoolDSP(48000,state);if(id==='spool'){state.assets.forEach((asset,i)=>{const sample=g.SpoolAudio.decodePCM(asset);core.setSample(i,sample.pcm,sample.sampleRate);});core.micEnabled=enabled;}else{core.micGain=enabled?1:0;core.micDestination=2;}return core;}
    const api=g.KitchenNativePlugin,io=g.KitchenHostIO;let totalEnergy=0;
    for(const enabled of [false,true]){api.create(id,48000,1024,JSON.stringify(state));api.setParameter(0,0);api.setParameter(2,2/3);if(enabled)api.setParameter(1,1);const direct=canonical(enabled);let frame=0;
      for(const frames of [17,301,512,129,65,1024]){clock(g,{bpm:state.tempo,localFrame:700000+frame,playing:false});events(g,[]);for(let i=0;i<frames;i++){io.inputLeft[i]=.12*Math.sin((frame+i)*.037);io.inputRight[i]=-.08*Math.cos((frame+i)*.029);}const originalL=io.inputLeft.slice(0,frames),originalR=io.inputRight.slice(0,frames);api.render(frames);
        for(let offset=0;offset<frames;offset+=128){const count=Math.min(128,frames-offset),l=new Float32Array(count),r=new Float32Array(count),a=enabled?originalL.subarray(offset,offset+count):undefined,b=enabled?originalR.subarray(offset,offset+count):undefined;if(id==='mire')direct.processBlock(l,r,a);else direct.processBlock(l,r,a,b,frame+offset);assert.deepEqual(Array.from(io.outputLeft.subarray(offset,offset+count)),Array.from(l));assert.deepEqual(Array.from(io.outputRight.subarray(offset,offset+count)),Array.from(r));if(enabled)for(let i=0;i<count;i++)totalEnergy+=Math.abs(l[i])+Math.abs(r[i]);}
        assert.deepEqual(io.inputLeft.slice(0,frames),originalL,'DSP modified host inputLeft');assert.deepEqual(io.inputRight.slice(0,frames),originalR,'DSP modified host inputRight');frame+=frames;
      }
      assert.deepEqual(JSON.parse(api.getStateJSON()),plain(state),'Live input switches altered canonical patch state');
    }
    assert(totalEnergy>1e-7,'Live input did not produce actual instrument audio');
  });
  const manifest = JSON.parse(source('plugins/effects-manifest.json')), effectRealm = realm();
  for (const file of [...manifest.catalogSources, ...manifest.dspSources, manifest.adapter]) vm.runInContext(source(file), effectRealm, { filename: file });
  effectRealm.KitchenPluginDescriptors = effectRealm.KitchenEffectPlugins.definitions().map(definition => ({id:'effect-'+definition.id,sourceId:definition.id,kind:'effect',parameters:definition.parameters,definition}));
  vm.runInContext(source('plugins/js/host-runtime.js'), effectRealm, {filename:'host-runtime.js'});
  for (const definition of effectRealm.KitchenEffectPlugins.definitions()) await check(definition.name + ': native host exact headless canonical adapter PCM with automation and bypass', () => {
    const g = effectRealm, api = g.KitchenNativePlugin, io = g.KitchenHostIO, sampleRate = 48000;
    const state = plain(definition.defaults); api.create('effect-'+definition.id,sampleRate,1024,JSON.stringify(state));
    const reference = g.KitchenEffectPlugins.create(definition.id,sampleRate,state);
    let local = 100000, beat = 3.75;
    for (const [turn,frames] of [1,17,129,301,512,63].entries()) {
      const bpm=turn<3?137:91;
      clock(g,{bpm,beat,localFrame:local,samplePosition:local-101000,revision:turn>=4?1:0}); events(g,[]);
      for(let i=0;i<frames;i++){io.inputLeft[i]=.04*Math.sin((local+i)*.03);io.inputRight[i]=.03*Math.cos((local+i)*.07);}
      if(turn===1){const n=definition.parameters.findIndex(p=>p.path==='params.bypass');api.setParameter(n,1);reference.setParameter('params.bypass',true);}
      if(turn===2){const n=definition.parameters.findIndex(p=>p.path==='params.bypass');api.setParameter(n,0);reference.setParameter('params.bypass',false);}
      if(turn===3){const n=definition.parameters.findIndex(p=>p.type==='range'&&p.path!=='params.bypass');if(n>=0){const d=definition.parameters[n],value=d.min+(d.max-d.min)*.37;api.setParameter(n,.37);reference.setParameter(d.path,value);}}
      api.render(frames);
      for(let offset=0;offset<frames;offset+=128){const count=Math.min(128,frames-offset),left=io.inputLeft.slice(offset,offset+count),right=io.inputRight.slice(offset,offset+count);
        reference.process(left,right,{sampleRate,tempo:bpm,beat:beat+offset*bpm/(60*sampleRate),playing:true,frame:local-100000+offset,samplePosition:local-101000+offset,revision:turn>=4?1:0,timeSigNumerator:4,timeSigDenominator:4});
        assert.deepEqual(Array.from(io.outputLeft.subarray(offset,offset+count)),Array.from(left),definition.id+' left');assert.deepEqual(Array.from(io.outputRight.subarray(offset,offset+count)),Array.from(right),definition.id+' right');
      }
      local+=frames;beat+=frames*bpm/(60*sampleRate);
    }
    assert.deepEqual(JSON.parse(api.getStateJSON()),plain(reference.getState())); assert(api.getTailSeconds()>=0);assert.equal(api.getLatencySamples(),0);
  });
  await check('FERMENT retains exact canonical played-note capture and exports original Standard MIDI files',()=>{
    const g=effectRealm,api=g.KitchenNativePlugin,io=g.KitchenHostIO;
    const def=g.KitchenEffectPlugins.definitions().find(def=>def.id==='ferment'),params={...def.defaults.params,mode:'track',gate:-70,inputRange:'guitar',mix:1};
    api.create('effect-ferment',48000,1024,JSON.stringify({params}));
    const reference=g.KitchenEffectPlugins.create('ferment',48000,{params});
    const start=JSON.parse(api.captureRequestJSON(JSON.stringify({action:'start',requestId:'start',token:'exact-take',tempo:120,maxBeats:4})));
    assert.equal(start.ok,true);assert.equal(start.take.capturing,true);assert.equal(start.requestId,'start');reference.startMidiCapture({token:'exact-take',tempo:120,maxBeats:4});
    for(let frame=0;frame<48000;frame+=512){const frames=Math.min(512,48000-frame);clock(g,{localFrame:800000+frame,beat:frame/24000});events(g,[]);for(let i=0;i<frames;i++){const n=frame+i;io.inputLeft[i]=io.inputRight[i]=n<35000?.2*Math.sin(2*Math.PI*220*n/48000):0;}api.render(frames);
      for(let offset=0;offset<frames;offset+=128){const n=Math.min(128,frames-offset),left=io.inputLeft.slice(offset,offset+n),right=io.inputRight.slice(offset,offset+n);reference.process(left,right,{sampleRate:48000,tempo:120,beat:(frame+offset)/24000,playing:true,frame:frame+offset});assert.deepEqual(Array.from(left),Array.from(io.outputLeft.subarray(offset,offset+n)));}
      if(frame===24064){const progress=JSON.parse(api.captureRequestJSON(JSON.stringify({action:'poll',requestId:'progress',maxNotes:0})));assert.equal(progress.take.capturing,true);assert.equal(progress.take.notes.length,0);assert.equal(progress.take.frames,frame+frames);}
    }
    const stop=JSON.parse(api.captureRequestJSON(JSON.stringify({action:'stop',requestId:'stop',reason:'test stopped'})));reference.stopMidiCapture('test stopped');const expected=plain(reference.drainMidiEvents());
    assert.equal(stop.ok,true);assert.equal(stop.take.capturing,false);assert.deepEqual(stop.take.notes,expected.events);assert(stop.take.notes.some(n=>n.pitch===57));assert.equal(stop.take.frames,expected.frames);
    vm.runInContext(source('loom/pedal-midi.js'),g,{filename:'pedal-midi.js'});const midi=g.LoomPedalMidi.toMidi(stop.take),pattern=g.LoomPedalMidi.toPattern(stop.take);assert.equal(Buffer.from(midi.subarray(0,4)).toString(),'MThd');assert.equal(Buffer.from(midi.subarray(14,18)).toString(),'MTrk');assert(pattern.notes.some(n=>n.pitch===57));
    const reopened=JSON.parse(api.captureRequestJSON(JSON.stringify({action:'poll'})));assert.deepEqual(reopened.take.notes,stop.take.notes);
    assert.equal(JSON.parse(api.captureRequestJSON(JSON.stringify({action:'clear'}))).take,null);assert.equal(JSON.parse(api.captureRequestJSON(JSON.stringify({action:'poll'}))).take,null);
    api.setParameter(def.parameters.findIndex(p=>p.path==='params.bypass'),1);assert.equal(JSON.parse(api.captureRequestJSON(JSON.stringify({action:'start'}))).ok,false);assert.equal(JSON.parse(api.getStatusJSON()).ready,true);
    assert.equal(def.producesMidi,false);assert.equal(def.capturesMidi,true);assert.equal(io.outputEventCount,0,'Historical capture must not masquerade as live MIDI');
  });
  await check('Long FERMENT takes page snapshots to bounded messages without losing closed notes',()=>{
    const g=realm();let queue=[],active=false,token=null,frames=0;
    g.KitchenEffectPlugins={ids:['ferment'],definitions:()=>[],create:()=>({getState:()=>({params:{}}),process(){},startMidiCapture(options){assert.equal(options.maxNotes,undefined,'Page size must not shorten capture limit');active=true;token=options.token;frames=0;return{token,frames,sampleRate:48000,tempo:120,done:false};},stopMidiCapture(reason){active=false;return{token,frames,sampleRate:48000,tempo:120,done:true,reason};},drainMidiEvents(){if(!token)return null;const result={token,frames,sampleRate:48000,tempo:120,done:!active,events:queue};queue=[];return result;}})};
    g.KitchenPluginDescriptor={id:'ferment',kind:'effect',parameters:[]};vm.runInContext(source('plugins/js/host-runtime.js'),g,{filename:'host-runtime.js'});const api=g.KitchenNativePlugin;api.create('ferment',48000,1024,'');
    assert.equal(JSON.parse(api.captureRequestJSON(JSON.stringify({action:'start',maxNotes:64}))).ok,true);
    const expected=Array.from({length:4096},(_,i)=>({pitch:36+i%49,startFrame:i*200,endFrame:i*200+160,velocity:.8}));queue=expected.slice();frames=819200;
    let response=JSON.parse(api.captureRequestJSON(JSON.stringify({action:'stop',maxNotes:64}))),notes=[];
    for(;;){assert(response.take.notes.length<=128);assert.equal(response.take.notesOffset,notes.length);notes.push(...response.take.notes);if(!response.take.moreNotes)break;response=JSON.parse(api.captureRequestJSON(JSON.stringify({action:'poll',afterNote:notes.length,maxNotes:10000})));}
    assert.equal(response.take.noteCount,4096);assert.deepEqual(notes,expected);
    const statusOnly=JSON.parse(api.captureRequestJSON(JSON.stringify({action:'poll',maxNotes:0})));assert.equal(statusOnly.take.notes.length,0);assert.equal(statusOnly.take.noteCount,4096);assert(JSON.stringify(statusOnly).length<1000);
    const error=JSON.parse(api.captureRequestJSON(JSON.stringify({action:'invalid',requestId:'bad'})));assert.equal(error.ok,false);assert.equal(error.requestId,'bad');assert.equal(JSON.parse(api.getStatusJSON()).ready,true);
  });
  const esbuild=require('esbuild');
  const bundled=(entry,globalName)=>esbuild.buildSync({entryPoints:[path.join(root,entry)],bundle:true,write:false,format:'iife',platform:'browser',target:'es2020',globalName,logLevel:'silent'}).outputFiles[0].text;
  const vendor=bundled('plugins/js/vendor-entry.js'),hotplate=bundled('plugins/js/hotplate-entry.js','KitchenHotplateAudio');
  const webManifest=JSON.parse(source('plugins/webaudio-instruments-manifest.json'));
  for(const entry of webManifest.instruments)await check(entry.name+': real Web Audio graph prepares with controlled timers, renders MIDI and survives host reset',async()=>{
    const g=realm();vm.runInContext(vendor,g,{filename:'vendor.js'});
    for(const file of [...manifest.catalogSources,...manifest.dspSources])vm.runInContext(source(file),g,{filename:file});
    if(entry.id==='form')vm.runInContext(hotplate,g,{filename:'hotplate.js'});
    for(const file of entry.sourceFiles)vm.runInContext(source(file),g,{filename:file});
    let rendering=false;const reads=[];
    g.KitchenNativeReadResource=(name,asText)=>{assert(!rendering,'Resource IO in render');reads.push(name);const asset=(entry.assets||[]).find(asset=>'assets/'+entry.id+'/'+asset.target.replace(/\.gz$/,'')===name);assert(asset,'Unknown asset '+name);const bytes=fs.readFileSync(path.join(root,asset.source));return asText?bytes.toString('utf8'):bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);};
    const params=[{path:'_nativeSequence',type:'boolean',default:true},...entry.parameters];
    g.KitchenPluginDescriptor={...entry,parameters:params,sourceId:entry.id};
    vm.runInContext(source('plugins/js/host-runtime.js'),g,{filename:'host-runtime.js'});
    const api=g.KitchenNativePlugin;api.create(entry.id,48000,1024,'');
    for(let i=0;i<1000&&!JSON.parse(api.getStatusJSON()).ready;i++){api.prepareTick(1);await Promise.resolve();}
    assert.equal(JSON.parse(api.getStatusJSON()).ready,true,api.getStatusJSON());api.setParameter(0,0);
    let energy=0;
    for(let frame=0;frame<4096;frame+=512){clock(g,{localFrame:700000+frame,playing:false});events(g,frame===0?[[17,1,['grain','tine','form','batter'].includes(entry.id)?36:60,.8,1,102]]:[]);rendering=true;api.render(512);rendering=false;for(let i=0;i<512;i++){assert(Number.isFinite(g.KitchenHostIO.outputLeft[i]));energy+=Math.abs(g.KitchenHostIO.outputLeft[i])+Math.abs(g.KitchenHostIO.outputRight[i]);}}
    assert(energy>1e-6,entry.id+' did not play actual graph');const state=JSON.parse(api.getStateJSON());assert(state&&typeof state==='object');
    api.reset();let afterReset=0;
    for(let frame=0;frame<1024;frame+=512){clock(g,{localFrame:frame,playing:false});events(g,frame===0?[[0,1,['grain','tine','form','batter'].includes(entry.id)?36:60,.8,1,103]]:[]);rendering=true;api.render(512);rendering=false;for(let i=0;i<512;i++)afterReset+=Math.abs(g.KitchenHostIO.outputLeft[i]);}
    assert(afterReset>1e-7,entry.id+' reset lost its context frame epoch');
    assert(reads.length===(entry.bootstrapScripts||[]).length+(entry.id==='batter'?1:0),entry.id+' unexpected resource reads');
  });
  await check('MORSEL reads genuine prepared voices before rendering, retains its bank and restores frame epoch after reset',async()=>{
    const g=realm();vm.runInContext(vendor,g,{filename:'vendor.js'});
    const morselManifest=JSON.parse(source('plugins/morsel-manifest.json'));
    for(const file of ['shared/pattern-schema.js',...morselManifest.sources])vm.runInContext(source(file),g,{filename:file});
    const definition=g.KitchenMorselPlugin.definitions()[0];
    let rendering=false,reads=0;
    g.KitchenNativeReadResource=(name,asText)=>{assert(!rendering,'MORSEL resource read inrender');assert.equal(name,'assets/morsel/morsel-bank.json');reads++;return require('node:zlib').gunzipSync(fs.readFileSync(path.join(root,'plugins/assets/morsel/morsel-bank.json.gz'))).toString('utf8');};
    g.KitchenPluginDescriptor={...definition,defaultBankResource:'morsel-bank.json',defaultState:{recipe:definition.defaults.recipe,followHost:false}};
    vm.runInContext(source('plugins/js/host-runtime.js'),g,{filename:'host-runtime.js'});
    const api=g.KitchenNativePlugin;api.create('morsel',48000,1024,'null');assert.equal(JSON.parse(api.getStatusJSON()).ready,true);assert.equal(reads,1);
    let energy=0;
    for(let frame=0;frame<16384;frame+=512){clock(g,{localFrame:900000+frame,playing:false});events(g,frame===0?[[17,1,60,.8,1,102]]:[]);rendering=true;api.render(512);rendering=false;for(let i=0;i<512;i++){assert(Number.isFinite(g.KitchenHostIO.outputLeft[i]));energy+=Math.abs(g.KitchenHostIO.outputLeft[i]);}}
    assert(energy>.1,'Prepared neural voice was silent');assert.equal(api.getLatencySamples(),128);
    const state=JSON.parse(api.getStateJSON());assert.equal(state.bank.backend,'kitten-tts-nano-0.8-int8');assert(state.bank.notes.length>=196);assert.equal(state.followHost,false);
    api.reset();let afterReset=0;
    for(let frame=0;frame<8192;frame+=512){clock(g,{localFrame:frame,playing:false});events(g,frame===0?[[0,1,67,.8,1,103]]:[]);rendering=true;api.render(512);rendering=false;for(let i=0;i<512;i++)afterReset+=Math.abs(g.KitchenHostIO.outputLeft[i]);}
    assert(afterReset>.1,'MORSEL reset moved MIDI into future');assert.equal(reads,1);
    await Promise.resolve();
  });
  console.log('Native host runtime checks passed: '+passed+' groups.');
})().catch(error => { console.error(error); process.exitCode=1; });
