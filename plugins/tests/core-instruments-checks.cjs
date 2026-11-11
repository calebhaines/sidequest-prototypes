'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const manifest = require('../core-instruments-manifest.json');
const SR = 48000;
function load(entry) {
  const scope = { Float32Array, Float64Array, Int16Array, Uint8Array, Uint32Array, Int32Array, ArrayBuffer, DataView,
    console, setTimeout, clearTimeout, TextEncoder, TextDecoder, Blob, DOMException,
    atob: s => Buffer.from(s, 'base64').toString('binary'), btoa: s => Buffer.from(s, 'binary').toString('base64') };
  scope.window = scope; scope.globalThis = scope;
  vm.createContext(scope);
  for (const source of entry.sourceFiles) vm.runInContext(fs.readFileSync(path.join(root, source), 'utf8'), scope, { filename: source });
  // Reuse immutable factory fixture PCM across independent test instances;
  // generate each source with the real canonical decoder once per recipe.
  if(entry.id==='spool'){
    const decode=scope.SpoolAudio.decodePCM,cache=new Map();
    scope.SpoolAudio.decodePCM=asset=>{const key=JSON.stringify(asset);if(!cache.has(key))cache.set(key,decode(asset));return cache.get(key);};
  }
  return scope;
}
function clock(frame = 0, playing = false, beat = 0, revision = 1, tempo = 120) { return { sampleRate: SR, tempo, playing, beat, frame, revision, timeSig: { numerator: 4, denominator: 4 } }; }
function render(engine, frames, start = 0, playing = false, beat = 0, revision = 1, quantum = 128) {
  const left = new Float32Array(frames), right = new Float32Array(frames);
  for (let at = 0; at < frames; at += quantum) { const end = Math.min(frames, at + quantum);
    engine.process(left.subarray(at,end), right.subarray(at,end), clock(start + at, playing, beat + (playing ? at / SR * 2 : 0), revision));
  }
  assert(left.every(Number.isFinite) && right.every(Number.isFinite), engine.id + ' emitted non-finite samples');
  return { left, right, energy: left.reduce((sum, x) => sum + x*x, 0) + right.reduce((sum, x) => sum + x*x, 0) };
}
function reference(g, id, state, plugin) {
  let core;
  if(id==='mire')core=new g.MireDSP(SR,state);
  else if(id==='spool'){core=new g.SpoolDSP(SR,state);state.assets.forEach((asset,i)=>{const sample=g.SpoolAudio.decodePCM(asset);core.setSample(i,sample.pcm,sample.sampleRate);});}
  else if(id==='haze')core=new g.HazeDSP.Core(state,SR);
  else if(id==='bower')core=new g.BowerDSP.Core(SR,state);
  else if(id==='ravel')core=new g.RavelDSP.Core(state,g.RavelDSP.generateSeed(state.asset),SR);
  else if(id==='roux')core=new g.RouxDSP.Core(SR,state,g.RouxNativeScore(state));
  else if(id==='proof')core=new g.ProofDSP.Core(SR,state);
  else if(id==='marinade')core=new g.MarinadeDSP.Core(SR,state,plugin.core.models);
  else if(id==='heirloom')core=new (g.createHeirloomPlaybackDSP(g.createHeirloomDSP).Core)(SR,state,0);
  else if(id==='brine')core=new (g.createBrinePlaybackDSP(g.createBrineDSP).Core)(SR,state,0);
  else core=new (g.createCitrusPlaybackDSP(g.createCitrusDSP).Core)(SR,g.CitrusAudio.prepareState(state),0);
  return {core,
    note(){const source='vst:reference',frame=0,pitch=60,velocity=.85;
      if(id==='mire')core.trigger({index:0,note:pitch,velocity,frame,source,durationSeconds:600});
      else if(id==='spool')core.noteOn(pitch,velocity);
      else if(id==='haze'){let row=0,error=Infinity;for(let i=0;i<24;i++){const e=Math.abs(Math.log(g.HazeDSP.frequencyForBand(core.state,i)/(440*Math.pow(2,(pitch-69)/12))));if(e<error){row=i;error=e;}}core.scheduleNote(row,velocity,frame,600*SR,source);}
      else if(id==='bower')core.scheduleNote(0,pitch,velocity,frame,600,source);
      else if(id==='ravel')core.queueSlice(0,{velocity,pitch:0,duration:600,source},frame);
      else if(id==='roux')core.scheduleNote(pitch,velocity,frame,600,source);
      else if(id==='proof'||id==='marinade')core.scheduleNote({note:pitch,velocity,frame,duration:600,source});
      else core.enqueue(id==='heirloom'?'on':'manualOn',{id:'reference',pitch,velocity,frame,source,channel:0});
    },
    process(left,right,frame,inputLeft,inputRight){if(['heirloom','brine','citrus'].includes(id))core.process(left,right);else if(id==='ravel')core.processBlock(left,right,frame);else if(id==='spool')core.processBlock(left,right,inputLeft,inputRight,frame);else if(id==='mire')core.processBlock(left,right,inputLeft);else core.processBlock(left,right);}
  };
}
let count = 0;
const selected=process.argv.slice(2),entries=manifest.instruments.filter(entry=>!selected.length||selected.includes(entry.id));
assert(entries.length>0,'Choose an existing Core instrument ID.');
for (const entry of entries) {
  try {
    const g = load(entry), state = g[entry.schema].normalize(g[entry.schema].defaultState());
    const definition=g.KitchenCoreInstruments.definitions().find(d=>d.id===entry.id);
    assert(definition.parameters.length>=8,'Missing canonical automation controls');
    assert(!definition.parameters.some(p=>p.path==='tempo'),'DAW tempo must own the clock');
    const parityPlugin=g.KitchenCoreInstruments.create(entry.id,SR,state,{nativeSequence:false}),direct=reference(g,entry.id,state,parityPlugin);
    parityPlugin.noteOn({id:'reference',pitch:60,velocity:.85,channel:0,frame:0});direct.note();
    for(let at=0;at<2048;at+=128){const l=new Float32Array(128),r=new Float32Array(128),expectedL=new Float32Array(128),expectedR=new Float32Array(128);parityPlugin.process(l,r);direct.process(expectedL,expectedR,at);
      assert.deepEqual(l,expectedL,entry.id+' left channel differs from canonical source DSP');assert.deepEqual(r,expectedR,entry.id+' right channel differs from canonical source DSP');}
    const instrument = g.KitchenCoreInstruments.create(entry.id, SR, state, { nativeSequence: false });
    const baseline = g.KitchenCoreInstruments.create(entry.id, SR, state, { nativeSequence: false });
    instrument.noteOn({ id: 'midi-a', pitch: 60, velocity: .85, channel: 0, frame: 64 });
    const actual = render(instrument, 8192), silent = render(baseline, 8192);
    assert.deepEqual(actual.left.slice(0,64), silent.left.slice(0,64), entry.id + ' MIDI started before its sample offset');
    let difference = 0; for (let i=64;i<actual.left.length;i++) difference += Math.abs(actual.left[i]-silent.left[i]) + Math.abs(actual.right[i]-silent.right[i]);
    assert(difference > 1e-6, entry.id + ' MIDI did not produce actual instrument audio');
    assert(instrument.noteOff({ id: 'midi-a', frame: 8192 }));
    render(instrument, 1024, 8192);
    const originalCore = instrument.core;
    instrument.setState({ format: entry.id + '-project', formatVersion: 1, state });
    assert.equal(instrument.getState().format, entry.id + '-project');
    assert.equal(instrument.core, originalCore, 'state update recreated live DSP');
    assert.equal(instrument.getNativeState().version, state.version);
    const volume=definition.parameters.find(p=>p.type==='number'&&/volume$/.test(p.path))||definition.parameters.find(p=>p.type==='number');
    instrument.setParameter(volume.path,volume.min+(volume.max-volume.min)*.42);assert.equal(instrument.core,originalCore,'automation recreated live DSP');
    assert.equal(instrument.getState().format,entry.id+'-project','parameter edit lost complete project envelope');
    if(entry.id==='marinade'){assert.equal(instrument.core.models[0].lanes,72);assert(instrument.core.models[0].amplitudes.some(x=>x>0),'Spectral source model is empty');const models=instrument.core.models;instrument.setParameter('synth.filter.cutoff',4200);assert.equal(instrument.core.models,models,'Filter automation repeated spectral analysis');}
    if(entry.id==='ravel'){
      const seeded=g.RavelDSP.generateSeed(state.asset);assert.deepEqual(instrument.core.sample,seeded.pcm,'Factory source PCM differs from the web engine');
      const pcm=Buffer.alloc(1024*2);for(let i=0;i<1024;i++)pcm.writeInt16LE(Math.round(Math.sin(i*.1)*24000),i*2);
      const imported={...state,asset:{kind:'pcm',name:'Actual imported mono source',sampleRate:SR,channels:1,frames:1024,duration:1024/SR,pcm:pcm.toString('base64')}};
      const sampled=g.KitchenCoreInstruments.create('ravel',SR,imported,{nativeSequence:false});assert.equal(sampled.core.sample.length,2048);assert.equal(sampled.core.sample[2],pcm.readInt16LE(2)/32768);assert.equal(sampled.core.sample[2],sampled.core.sample[3]);
      const chained=JSON.parse(JSON.stringify(state));chained.chain=true;chained.patterns[1].length=32;
      const chain=g.KitchenCoreInstruments.create('ravel',SR,chained);render(chain,128,0,true,9,22);assert.equal(chain.core.pattern,1,'DAW seek ignored mixed pattern lengths');assert.equal(chain.core.nextBar,12*SR/2,'Next chain boundary lost host PPQ');
    }
    if(entry.id==='haze'){
      const reversed=g.KitchenCoreInstruments.create('haze',SR,{...state,direction:'reverse'});reversed.transport(clock(0,true,1,12));assert(Math.abs(reversed.core.position-28)<1e-8,'Reverse score did not seek to the host beat');
      const pendulum=g.KitchenCoreInstruments.create('haze',SR,{...state,direction:'pingpong'});pendulum.transport(clock(0,true,9,12));assert(Math.abs(pendulum.core.position-27.999)<1e-8,'Ping-pong score lost its return leg');
    }
    if(entry.id==='bower'){
      const together=g.KitchenCoreInstruments.create('bower',SR,state);together.noteOn({id:'start-with-host',pitch:61,velocity:.8,frame:0});render(together,128,0,true);assert(together.core.voices.some(v=>v.source==='vst:start-with-host'),'Starting transport discarded simultaneous MIDI');
      together.noteOn({id:'stop-with-host',pitch:63,velocity:.8,frame:128});render(together,128,128,false);assert(together.core.voices.some(v=>v.source==='vst:stop-with-host'),'Stopping transport discarded simultaneous MIDI');
    }
    if(entry.id==='spool'){instrument.noteOn({id:'same-a',pitch:60,velocity:.7,channel:0,frame:9216});instrument.noteOn({id:'same-b',pitch:60,velocity:.7,channel:1,frame:9216});render(instrument,128,9216);instrument.noteOff({id:'same-a',frame:9344});render(instrument,128,9344);assert(instrument.core.voices.some(v=>v.pluginSource==='vst:same-b'&&!v.releasing),'One channel released another channel’s held note');}
    const sequenced = g.KitchenCoreInstruments.create(entry.id, SR, state);
    const pattern = render(sequenced, 24000, 0, true);
    assert(pattern.energy > 1e-8, entry.id + ' DAW transport did not play its pattern');
    const frameBefore = sequenced.core.frame;
    render(sequenced, 256, 24000, true, 0, 2);
    if (entry.id !== 'ravel') assert(sequenced.core.frame >= frameBefore, 'PPQ seek rewound DSP frame');
    sequenced.setNativeSequence(false); render(sequenced, 128, 24256, true, 256 / SR * 2, 2);
    if(['heirloom','brine'].includes(entry.id))assert.equal(sequenced.core.nativePlaying,false,'Follow DAW off left the native phrase running');
    else if(['proof','marinade','citrus'].includes(entry.id))assert.equal(sequenced.core.playing,false,'Follow DAW off left the native phrase running');
    else if(entry.id!=='mire')assert.equal(sequenced.core.running,false,'Follow DAW off left the native phrase running');
    sequenced.noteOn({ id:'stopped-host', pitch:64, velocity:.8, frame:24384 });
    const afterStop = render(sequenced, 4096, 24384, false);
    assert(afterStop.energy > 1e-8, 'stopped host prevented manual MIDI');
    const resetCore=sequenced.core,resetState=sequenced.getState(),sampleRefs=entry.id==='spool'?resetCore.decks.map(d=>d.asset):entry.id==='ravel'?resetCore.sample:entry.id==='marinade'?resetCore.models:entry.id==='mire'?resetCore.samples:null;
    const decode=g.SpoolAudio?.decodePCM,seed=g.RavelDSP?.generateSeed,analyze=g.MarinadeAnalysis?.analyze;
    const noPrepare=()=>{throw Error('DAW reset attempted source preparation on the audio thread');};
    if(g.SpoolAudio)g.SpoolAudio.decodePCM=noPrepare;if(g.RavelDSP)g.RavelDSP.generateSeed=noPrepare;if(g.MarinadeAnalysis)g.MarinadeAnalysis.analyze=noPrepare;
    try{sequenced.reset();}finally{if(g.SpoolAudio)g.SpoolAudio.decodePCM=decode;if(g.RavelDSP)g.RavelDSP.generateSeed=seed;if(g.MarinadeAnalysis)g.MarinadeAnalysis.analyze=analyze;}
    assert.equal(sequenced.core,resetCore,'DAW reset reconstructed the DSP');assert.equal(resetCore.frame,0);assert.deepEqual(sequenced.getState(),resetState,'DAW reset changed the saved patch');
    if(entry.id==='spool')resetCore.decks.forEach((d,i)=>assert.equal(d.asset,sampleRefs[i],'DAW reset replaced prepared deck PCM'));
    else if(entry.id==='ravel')assert.equal(resetCore.sample,sampleRefs,'DAW reset replaced prepared slices');
    else if(entry.id==='marinade')assert.equal(resetCore.models,sampleRefs,'DAW reset replaced spectral models');
    else if(entry.id==='mire')assert.equal(resetCore.samples,sampleRefs,'DAW reset replaced source samples');
    sequenced.noteOn({id:'after-reset',pitch:60,velocity:.8,frame:17});const resetAudio=render(sequenced,4096,0,false);assert(resetAudio.energy>1e-8,'DAW reset broke later MIDI');assert(sequenced.noteOff({id:'after-reset',frame:4096}));
    if(entry.id==='mire'){
      const node=g.KitchenCoreInstruments.create('mire',SR,state,{nativeSequence:false}),directNode=reference(g,'mire',state,node);
      node.noteOn({id:'node-audition',pitch:60,velocity:.8,channel:13,frame:0});directNode.core.trigger({index:0,audition:true,destination:1,velocity:.8,frame:0,source:'vst:node-audition',durationSeconds:600});
      const l=new Float32Array(128),r=new Float32Array(128),expectedL=new Float32Array(128),expectedR=new Float32Array(128);node.process(l,r);directNode.process(expectedL,expectedR,0);assert.deepEqual(l,expectedL,'REDUCE direct-node audition differs from the web');assert.deepEqual(r,expectedR);
    }
    if(entry.id==='mire'||entry.id==='spool'){
      const inputState=JSON.parse(JSON.stringify(state));if(entry.id==='spool'){inputState.record.input='mic';inputState.source.monitor=true;}
      const input=g.KitchenCoreInstruments.create(entry.id,SR,inputState,{nativeSequence:false}),directInput=reference(g,entry.id,inputState,input);
      input.setInput({enabled:true,destination:2});if(entry.id==='mire'){directInput.core.micGain=1;directInput.core.micDestination=2;}else directInput.core.micEnabled=true;
      let energy=0;
      for(let at=0;at<2048;at+=128){const a=Float32Array.from({length:128},(_,i)=>.12*Math.sin((at+i)*.037)),b=Float32Array.from({length:128},(_,i)=>-.08*Math.cos((at+i)*.029));
        const l=new Float32Array(128),r=new Float32Array(128),x=new Float32Array(128),y=new Float32Array(128);input.process(l,r,undefined,a,b);directInput.process(x,y,at,a,b);assert.deepEqual(l,x,entry.id+' live-input left channel differs from original worklet');assert.deepEqual(r,y,entry.id+' live-input right channel differs from original worklet');energy+=l.reduce((n,v)=>n+v*v,0)+r.reduce((n,v)=>n+v*v,0);
      }
      assert(energy>1e-8,'Native live input produced silence');assert.deepEqual(JSON.parse(JSON.stringify(input.getState())),inputState,'Input toggles changed the canonical patch');input.reset();assert.equal(input.getInput().enabled,true,'Reset lost the host input enable parameter');
      input.setParameter('_nativeInput',false);assert.equal(input.getInput().enabled,false);input.setParameter('_nativeInputDestination',1);assert.equal(input.getInput().destination,1);
      const bypassed=g.KitchenCoreInstruments.create(entry.id,SR,inputState,{nativeSequence:false}),quiet=g.KitchenCoreInstruments.create(entry.id,SR,inputState,{nativeSequence:false}),a=new Float32Array(128).fill(.1),b=new Float32Array(128).fill(-.2),l=new Float32Array(128),r=new Float32Array(128),x=new Float32Array(128),y=new Float32Array(128);bypassed.process(l,r,undefined,a,b);quiet.process(x,y);assert.deepEqual(l,x,'Disabled live input changed original sonics');assert.deepEqual(r,y);
      if(entry.id==='spool'){
        // Canonical capture is deliberately prepared/finished outside render;
        // native UI recording needs its own off-thread asset/state handoff.
        input.setInput({enabled:true});input.core.startCapture(0,{input:'mic',quantize:false});
        for(let at=0;at<1024;at+=128)input.process(l,r,undefined,a,b);
        const capture=input.core.finishCapture();assert.equal(capture.frames,1024);assert.equal(capture.pcm[256*2],a[0]);assert.equal(capture.pcm[256*2+1],b[0]);
      }
    }
    console.log(entry.id + ': exact canonical DSP parity, MIDI offset, host clock, state, automation and live gates passed'); count++;
  } catch (error) { console.error(entry.id + ': ' + error.stack); process.exitCode = 1; }
}
assert.equal(count, entries.length, 'Every selected portable Core instrument must pass.');
console.log('All ' + count + ' canonical Kitchen Core instruments passed.');
