'use strict';
// Portable CLATTER native-project checks using the real shared GALLEY catalog.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
globalThis.window = globalThis;
const shared = fs.existsSync(path.join(__dirname, 'shared', 'voice-effects.js')) ? path.join(__dirname, 'shared') : path.join(__dirname, '..', 'shared');
const galley = fs.existsSync(path.join(shared, 'galley-effects', 'effects.js')) ? path.join(shared, 'galley-effects') : path.join(__dirname, '..', 'loom');
for (const name of ['vocal-catalog.js','utility-catalog.js','filter-catalog.js','creative-catalog.js','preamp-catalog.js','tape-catalog.js','char-catalog.js','effects-catalog.js','vocal-dsp.js','utility-dsp.js','filter-dsp.js','creative-dsp.js','broiler-pedals.js','compressor-dsp.js','preamp-dsp.js','tape-dsp.js','char-dsp.js','effects.js']) vm.runInThisContext(fs.readFileSync(path.join(galley, name), 'utf8'), { filename: name });
for (const file of [path.join(shared, 'pattern-schema.js'),path.join(shared, 'voice-effects.js'),path.join(__dirname, 'synth-schema.js'),path.join(__dirname, 'presets.js'),path.join(__dirname, 'audio-engine.js')]) vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: path.basename(file) });
const M = TineModel, copy = value => JSON.parse(JSON.stringify(value)), passed = [];
function check(name, run) { run(); passed.push(name); console.log('PASS ' + name); }
function project() {
  const preset = TINE_PRESETS[0], tracks = copy(preset.tracks);
  return { app: 'TINE', version: 5, state: { name: preset.name, bpm: preset.bpm, swing: preset.swing, drive: preset.drive, space: preset.space, master: .78, stepCount: 16, chain: M.defaultChain(), tracks }, banks: Array.from({length:4}, () => tracks.map(track => track.steps.slice())), bankLocks: Array.from({length:4}, () => M.emptyLocks()), bank:0, selected:0 };
}
const effect = type => { const definition = LoomEffectsCatalog.find(value => value.id === type); return { type, params:copy(definition.defaults) }; };
check('Every native voice owns two independent empty insert slots, with legacy normalization preserved', () => {
  const a = M.defaults('bell'), b = M.defaults('bell'); assert.deepEqual(a.galleyFx, [null,null]); assert.notEqual(a.galleyFx, b.galleyFx);
  const old = copy(a); delete old.galleyFx; assert(M.validateTrack(old)); assert.deepEqual(M.normalizeTrack(old).galleyFx, [null,null]);
  assert(M.validateProject(project()));
});
check('Every GALLEY effect and all complete model controls survive each of eight voice slots', () => {
  assert.equal(LoomEffectsCatalog.length, 16);
  for (const definition of LoomEffectsCatalog) for (let voice=0;voice<8;voice++) for (let slot=0;slot<2;slot++) {
    const p = project(), fx = effect(definition.id); p.state.tracks[voice].galleyFx[slot] = fx;
    assert(M.validateProject(p), definition.id + ':' + voice + ':' + slot);
    const restored = M.upgradeProject(copy(p)); assert.deepEqual(restored, p);
    const track = M.normalizeTrack(restored.state.tracks[voice]); assert.deepEqual(track.galleyFx[slot], fx);
    assert.notEqual(track.galleyFx[slot].params, restored.state.tracks[voice].galleyFx[slot].params);
  }
});
check('Versions one through four migrate only missing racks while preserving old native fields and banks', () => {
  for (const version of [1,2,3,4]) {
    const p = project(); p.version = version; p.state.tracks.forEach(track => delete track.galleyFx);
    if (version < 4) { delete p.state.chain; delete p.bankLocks; }
    if (version < 3) delete p.state.stepCount;
    if (version === 1) p.state.tracks.forEach(track => ['strikeMaterial','contactTexture','rebound','reboundTime'].forEach(key => delete track[key]));
    const before = copy(p); assert(M.validateProject(p), 'legacy v' + version); const restored = M.upgradeProject(p);
    assert.equal(restored.version, 5); assert.deepEqual(p, before, 'migration must not mutate source');
    assert.deepEqual(restored.banks, p.banks); assert(restored.state.tracks.every(track => track.galleyFx.every(slot => slot === null)));
    for (let voice=0;voice<8;voice++) for (const [key,value] of Object.entries(p.state.tracks[voice])) assert.deepEqual(restored.state.tracks[voice][key], value, key);
  }
  const supplied = project(); supplied.version=4; supplied.state.tracks[3].galleyFx=[effect('saute'),effect('parallax')]; assert(M.validateProject(supplied)); assert.deepEqual(M.upgradeProject(supplied).state.tracks[3].galleyFx, supplied.state.tracks[3].galleyFx);
});
check('Current missing racks and all malformed supplied racks reject atomically in legacy and current files', () => {
  const edits = [
    p => p.state.tracks[0].galleyFx = null,
    p => p.state.tracks[0].galleyFx = [null],
    p => p.state.tracks[0].galleyFx = [null,null,null],
    p => p.state.tracks[0].galleyFx = [{type:'unknown',params:{}},null],
    p => {p.state.tracks[0].galleyFx=[effect('velvet'),null];delete p.state.tracks[0].galleyFx[0].params.model;},
    p => {p.state.tracks[0].galleyFx=[effect('prism'),null];p.state.tracks[0].galleyFx[0].params.low=13e3;},
    p => {p.state.tracks[0].galleyFx=[effect('saute'),null];p.state.tracks[0].galleyFx[0].params.bypass='true';},
    p => {p.state.tracks[0].galleyFx=[effect('broiler'),null];p.state.tracks[0].galleyFx[0].params.extra=1;}
  ];
  for (const version of [4,5]) for (const edit of edits) { const p = project();p.version=version;edit(p);const before=copy(p);assert.equal(M.validateProject(p),false);assert.throws(()=>M.upgradeProject(p),/Invalid CLATTER project/);assert.deepEqual(p,before); }
  const current = project(); delete current.state.tracks[0].galleyFx; assert.equal(M.validateProject(current), false);
});
check('FX remain patch data and do not leak into portable rhythm packets or sequencer state', () => {
  const p = project(); p.state.tracks[0].galleyFx=[effect('saute'),effect('parallax')]; const before=JSON.stringify(p);
  const packet = M.sequencerPattern(p); assert(packet.notes.length > 0); assert(!JSON.stringify(packet).includes('galleyFx')); assert.equal(JSON.stringify(p), before);
});
check('Global host Stop and revision changes clear FX, while note anchors and scoped cancellation preserve other tails', () => {
  const resets = [], gates = [], clocks = [], engine = Object.create(TineEngine.prototype);
  engine.context = { currentTime: 10 }; engine._voiceTempo = 108;
  const direct = {}, rack = {};
  engine.environment = { graph:{input:direct}, voices: new Set(), explicitUntil: Array(8).fill(50), voiceEffects: { input:index=>index===1?direct:rack, reset: (index, time) => resets.push({index,time}), setAudible: (index, value) => gates.push({index,value}), setClock: clock => clocks.push({...clock}) } };
  engine.followTransport({ tempo: 120, beat: 4, audioTime: 10.1, playing: true, revision: 1 });
  assert.equal(engine.environment.fxClock.time, 10.1); assert.equal(resets.length, 0);
  engine.followTransport({ tempo: 120, beat: 4.5, time: 10.35, playing: true, external: true, noteAnchor: true });
  engine.followTransport({ tempo: 120, beat: 4.6, audioTime: 10.4, playing: true, revision: 1 });
  assert.equal(resets.length, 0, 'a note anchor must not erase the host revision and reset every following frame');
  const nativeCuts = [], cancelled = { voiceIndex:0, fadeAt:10.4, stopTime:14, bus:{gain:{cancelScheduledValues:time=>nativeCuts.push(['cancel',time]),setValueAtTime:(value,time)=>nativeCuts.push(['gain',value,time])}}, sources:[{stop:time=>nativeCuts.push(['stop',time])}] };
  const unrelated = { stopTime:15, bus:{gain:{cancelScheduledValues:()=>assert.fail('new/unrelated voice was cut'),setValueAtTime:()=>assert.fail('new/unrelated voice was cut')}}, sources:[{stop:()=>assert.fail('new/unrelated voice was stopped')}] };
  const legacyEmpty = { ...unrelated,voiceIndex:1,fadeAt:10.4 };
  engine.environment.voices.add(cancelled);engine.environment.voices.add(unrelated);engine.environment.voices.add(legacyEmpty);
  engine.followTransport({ tempo: 120, beat: 0, audioTime: 10.5, playing: true, revision: 2 });
  assert.deepEqual(resets, [{index:undefined,time:10.5}]); assert(engine.environment.explicitUntil.every(value=>value===0)); assert.equal(gates.length,0,'seek keeps the running route open');
  assert.deepEqual(nativeCuts,[['cancel',10.5],['gain',0,10.5],['stop',10.5]]);assert.equal(cancelled.stopTime,10.5);engine.environment.voices.clear();
  engine.followTransport({ tempo: 120, beat: 0, audioTime: 10.6, playing: false, revision: 2 });
  assert.equal(resets.length,2); assert(Math.abs(resets[1].time-10.616)<1e-12); assert.equal(gates.length,8); assert(gates.every(gate=>gate.value===false));
  engine.followTransport({ tempo: 120, beat: 0, audioTime: 10.7, playing: false, revision: 2 });
  assert.equal(resets.length,2,'a repeated stopped frame must not repeatedly reset audio');
  engine.cancelNativeNotes({source:'loom',when:10}); assert.equal(resets.length,2,'scoped cancellation must not clear unrelated rack history');
  assert.equal(engine._voiceTransportClock.revision,2); assert.equal(clocks.at(-1).playing,false);
});
console.log(passed.length + ' CLATTER voice effects schema checks passed.');
