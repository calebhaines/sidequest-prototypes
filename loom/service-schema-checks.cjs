'use strict';
// Optional performance metadata must not alter existing arrangements or audio.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const scope = { Math, Number, Map, Set, crypto: webcrypto, btoa: v => Buffer.from(v, 'binary').toString('base64'), atob: v => Buffer.from(v, 'base64').toString('binary') };
scope.window = scope;
vm.createContext(scope);
const shared = fs.existsSync(path.join(__dirname, 'shared', 'pattern-schema.js')) ? path.join(__dirname, 'shared') : path.join(__dirname, '..', 'shared');
vm.runInContext(fs.readFileSync(path.join(shared, 'pattern-schema.js'), 'utf8'), scope, { filename: 'pattern-schema.js' });
for (const name of ['vocal-catalog.js', 'effects-catalog.js', 'service-schema.js', 'schema.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, name), 'utf8'), scope, { filename: name });
const S = scope.LoomSchema, P = scope.LoomServiceSchema;
const passed = [];
const clone = v => JSON.parse(JSON.stringify(v));
function check(name, run) { run(); passed.push(name); }
function fixture() {
  const s = S.defaultState();
  const samples = Float32Array.from({ length: 8000 }, (_, i) => .2 * Math.sin(i * Math.PI * 2 * 110 / 8000));
  s.assets = [S.encodeAsset({ left: samples, sampleRate: 8000, id: 'source', name: 'Dry recording' })];
  for (let i = 0; i < 8; i++) {
    s.tracks[i].clips.push({ id: 'source-' + (i + 1), name: 'Source ' + (i + 1), type: 'audio', assetId: 'source', start: i, length: 4, sourceStart: 0, sourceEnd: 1, sourceOffset: 0, rate: 1, reverse: false, loop: true, gain: .8, fadeIn: .01, fadeOut: .02 });
  }
  const char = scope.LoomEffectsCatalog.find(e => e.id === 'cinder');
  s.tracks[0].effects[0] = S.effect({ type: char.id, params: char.defaults });
  s.tracks[0].automation = [{ target: 'level', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: .4 }, { beat: 16, value: .8 }] }];
  return S.normalize(s);
}
function service(s = fixture()) {
  const p = P.defaults();
  p.scenes = [{ id: 'first-service', name: 'First service', lengthBeats: 8, slots: s.tracks.map(t => ({ mode: 'clip', clipId: t.clips[0].id })) }];
  p.selectedSceneId = p.scenes[0].id;
  p.macros[0].mappings = [
    { trackId: 'track-1', target: 'level', min: .2, max: 1.2, baseline: .8, polarity: 'normal' },
    { trackId: 'track-1', target: 'fx:0:drive', effectType: 'cinder', min: 0, max: 24, baseline: 8, polarity: 'normal' },
    { trackId: 'track-1', target: 'fx:0:mix', effectType: 'cinder', min: 0, max: 1, baseline: .65, polarity: 'inverse' }
  ];
  p.midiBindings = [
    { id: 'scene-trigger', inputId: '*', channel: null, type: 'note', number: 36, target: 'scene:first-service' },
    { id: 'macro-knob', inputId: 'keyboard', channel: 0, type: 'cc', number: 21, target: 'macro:macro-1' },
    { id: 'fill-pad', inputId: '*', channel: 15, type: 'note', number: 127, target: 'pad:fill' }
  ];
  p.take = { lengthBeats: 16, events: [
    { kind: 'scene', beat: 0, sceneId: 'first-service', clips: s.tracks.map(t => t.clips[0].id), sceneBeat: 0, padBeat: 0, phaseOrigins: s.tracks.map(t => t.clips[0].start), sceneStarts: Array(8).fill(0), padBeats: Array(8).fill(0), tempo: 96 },
    { kind: 'performance', beat: 4, drops: Array(8).fill(false), stutterBeats: .25, fill: 1, overrides: [{ trackId: 'track-1', target: 'fx:0:mix', effectType: 'cinder', value: .9 }], sceneBeat: 0, padBeat: 4, phaseOrigins: s.tracks.map(t => t.clips[0].start), sceneStarts: Array(8).fill(0), padBeats: Array(8).fill(4), tempo: 96 }
  ] };
  return clone(p);
}
function invalid(mutate, pattern = /SERVICE/) { const s = fixture(), p = service(s); mutate(p); assert.throws(() => P.validate(p, s), pattern); }

check('Legacy defaults, project bytes, audio, automation and arrangement remain unchanged without SERVICE', () => {
  assert.equal(Object.hasOwn(S.defaultState(), 'service'), false);
  const s = fixture(), before = S.serializeProject(s), restored = S.parseProject(before);
  assert.equal(S.serializeProject(restored), before);
  assert.equal(Object.hasOwn(restored, 'service'), false);
  assert.equal(restored.assets[0].pcm, s.assets[0].pcm);
  const withService = S.normalize({ ...s, service: service(s) });
  delete withService.service;
  assert.equal(S.serializeProject(withService), before);
  assert.deepEqual(clone(withService), clone(s));
});
check('SERVICE scenes, macros, MIDI and authoritative take phases round-trip in project version 1', () => {
  const s = fixture(); s.service = service(s);
  const json = S.serializeProject(s), envelope = JSON.parse(json), restored = S.parseProject(json);
  assert.equal(envelope.formatVersion, 1); assert.equal(envelope.state.version, 1); assert.equal(restored.service.version, 1);
  assert.equal(S.serializeProject(restored), json);
  assert.deepEqual(clone(restored.service), service(s));
  assert.equal(restored.tracks.length, 8); assert(restored.tracks.every(t => t.effects.length === 4));
  assert.equal(restored.view.tab, 'arrange'); assert.equal(restored.assets[0].pcm, s.assets[0].pcm);
});
check('Four macros are neutral at their baselines, with explicit endpoints and polarity', () => {
  assert.equal(P.defaults().macros.length, 4); assert(P.defaults().macros.every(m => m.value === .5));
  const mapping = { min: .1, max: .9, baseline: .7, polarity: 'normal' };
  assert.equal(P.mappingValue(mapping, .5), .7); assert.equal(P.mappingValue(mapping, 0), .1); assert.equal(P.mappingValue(mapping, 1), .9);
  assert.equal(P.mappingValue({ ...mapping, polarity: 'inverse' }, .5), .7);
  assert.equal(P.mappingValue({ ...mapping, polarity: 'inverse' }, 0), .9); assert.equal(P.mappingValue({ ...mapping, polarity: 'inverse' }, 1), .1);
  assert.equal(P.mappingValue({ min: .6, max: .6, baseline: .6 }, 1), .6);
});
check('SERVICE adds effect mix descriptors without changing arrangement automation descriptors', () => {
  const track = fixture().tracks[0], old = JSON.stringify(S.automationTargets(track)), descriptors = P.targets(track);
  assert.equal(descriptors.find(d => d.target === 'fx:0:mix').effectType, 'cinder');
  assert.equal(descriptors.find(d => d.target === 'fx:0:mix').value, .65);
  assert(!descriptors.some(d => d.target === 'fx:1:mix'));
  assert.equal(JSON.stringify(S.automationTargets(track)), old);
});
check('Deleted or wrong-track scene sources become silence; stale take source IDs become null', () => {
  const s = fixture(), p = service(s);
  p.scenes[0].slots[0].clipId = 'source-2';
  p.scenes[0].slots[1].clipId = 'deleted-source';
  p.scenes[0].slots[2] = { mode: 'hold' };
  p.take.events[0].clips[0] = 'deleted-source';
  assert.equal(P.validate(p, s), true);
  const result = P.normalize(p, s);
  assert.equal(result.scenes[0].slots[0].mode, 'silence'); assert.equal(result.scenes[0].slots[1].mode, 'silence'); assert.equal(result.scenes[0].slots[2].mode, 'hold');
  assert.equal(result.take.events[0].clips[0], null); assert.equal(result.take.events[0].clips[1], 'source-2');
  assert.equal(P.validate(result, s), true);
});
check('Removed or replaced effects cannot be driven through stale mappings or take overrides', () => {
  const s = fixture(), p = service(s), prism = scope.LoomEffectsCatalog.find(e => e.id === 'prism');
  s.tracks[0].effects[0] = S.effect({ type: 'prism', params: prism.defaults });
  assert.equal(P.validate(p, s), true);
  const result = P.normalize(p, s);
  assert.deepEqual(result.macros[0].mappings.map(m => m.target), ['level']);
  assert.equal(result.take.events[1].overrides.length, 0);
  assert.equal(P.validate(result, s), true);
});
check('Scene and selected-scene references tolerate deletion without accidental launches', () => {
  const s = fixture(), p = service(s); p.scenes = [];
  const result = P.normalize(p, s);
  assert.equal(P.validate(p, s), true); assert.equal(result.selectedSceneId, null);
  assert.equal(result.take.events[0].sceneId, null); assert.equal(result.midiBindings.length, 2);
  assert(!result.midiBindings.some(b => b.target.startsWith('scene:')));
});
check('Strict import rejects malformed settings, scenes, macro ranges and slot capacity', () => {
  for (const mutate of [
    p => p.version = 2, p => p.quantize = 3, p => p.selectedSceneId = {}, p => p.scenes[0].slots.pop(), p => p.scenes[0].slots[0].mode = 'launch',
    p => p.scenes[0].lengthBeats = Infinity, p => p.scenes[0].lengthBeats = 257, p => p.scenes.push(clone(p.scenes[0])), p => p.macros.pop(),
    p => p.macros[0].value = NaN, p => p.macros[0].id = 'macro-5', p => p.macros[0].mappings[0].max = 2,
    p => p.macros[0].mappings[0].baseline = -.1, p => p.macros[0].mappings[1].target = 'fx:4:drive', p => delete p.macros[0].mappings[1].effectType
  ]) invalid(mutate);
  const s = fixture(); s.service = service(s); s.service.scenes[0].slots.pop();
  assert.throws(() => S.parseProject(JSON.stringify({ format: 'loom-project', formatVersion: 1, state: s })), /SERVICE/);
});
check('MIDI data is bounded and restricted to explicitly supported performance actions', () => {
  for (const mutate of [p => p.midiBindings[0].channel = 16, p => p.midiBindings[0].number = -1, p => p.midiBindings[0].type = 'sysex', p => p.midiBindings[0].inputId = {}, p => p.midiBindings[0].target = 'control:eval', p => p.midiBindings.push(clone(p.midiBindings[0]))]) invalid(mutate);
  const s = fixture(), p = service(s); p.midiBindings[0].target = 'scene:removed';
  assert.equal(P.validate(p, s), true); assert.equal(P.normalize(p, s).midiBindings.length, 2);
});
check('Recorded gestures reject invalid times, phases, tempo, drops and parameter values', () => {
  for (const mutate of [
    p => p.take.lengthBeats = 257, p => p.take.events[0].beat = -1, p => p.take.events[1].beat = 17,
    p => p.take.events[1].kind = 'eval', p => p.take.events[1].drops[0] = 1, p => p.take.events[1].stutterBeats = 2,
    p => p.take.events[1].fill = .5, p => p.take.events[1].overrides[0].value = 2, p => p.take.events[1].phaseOrigins.pop(),
    p => p.take.events[1].phaseOrigins[0] = Infinity, p => p.take.events[1].sceneStarts[0] = 5, p => p.take.events[1].padBeats[0] = -1,
    p => p.take.events[1].tempo = 500, p => p.take.events[1].overrides.push(clone(p.take.events[1].overrides[0]))
  ]) invalid(mutate);
});
check('Take normalization preserves same-beat event order and handles optional phase metadata', () => {
  const s = fixture(), p = service(s), scene = clone(p.take.events[0]), performance = clone(p.take.events[1]);
  scene.beat = 4; p.take.events = [performance, scene, { ...clone(scene), beat: 0 }];
  const events = P.normalize(p, s).take.events;
  assert.deepEqual(clone(events.map(e => [e.beat, e.kind])), [[0, 'scene'], [4, 'performance'], [4, 'scene']]);
  const bare = service(s); bare.take.events.forEach(e => { for (const key of ['phaseOrigins', 'sceneStarts', 'padBeats', 'sceneBeat', 'padBeat', 'tempo']) delete e[key]; });
  assert.equal(P.validate(bare, s), true); assert.equal(Object.hasOwn(P.normalize(bare, s).take.events[0], 'phaseOrigins'), false);
});
check('Limits bound normalization work while strict import rejects oversized performance data', () => {
  const s = fixture(), p = service(s);
  p.scenes = Array.from({ length: 17 }, (_, i) => ({ ...clone(p.scenes[0]), id: 'scene-' + i }));
  assert.throws(() => P.validate(p, s), /capacity/); assert.equal(P.normalize(p, s).scenes.length, 16);
  const large = service(s); large.take.events = Array.from({ length: 8193 }, () => clone(large.take.events[0]));
  assert.throws(() => P.validate(large, s), /take/); assert.equal(P.normalize(large, s).take.events.length, 8192);
  const mappings = service(s); mappings.macros[0].mappings = Array.from({ length: 33 }, () => clone(mappings.macros[0].mappings[0]));
  assert.throws(() => P.validate(mappings, s), /macro/); assert.equal(P.normalize(mappings, s).macros[0].mappings.length, 32);
});
check('SERVICE retains only known properties and never copies prototype keys', () => {
  const s = fixture(), p = service(s);
  const malicious = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"script":"run()"}');
  Object.assign(p, malicious); Object.assign(p.macros[0], malicious); Object.assign(p.take.events[0], malicious);
  const result = P.normalize(p, s);
  assert.equal(Object.prototype.polluted, undefined); assert.equal(Object.hasOwn(result, '__proto__'), false); assert.equal(Object.hasOwn(result, 'script'), false);
  assert.equal(Object.hasOwn(result.macros[0], 'constructor'), false); assert.equal(Object.hasOwn(result.take.events[0], 'script'), false);
});
check('Legacy projects still work without the optional module; new projects fail clearly if it is missing', () => {
  const s = fixture(), before = S.serializeProject(s), module = scope.LoomServiceSchema;
  scope.LoomServiceSchema = undefined;
  try {
    assert.equal(S.serializeProject(S.parseProject(before)), before);
    s.service = service(s);
    assert.throws(() => S.normalize(s), /SERVICE.*unavailable/);
    assert.throws(() => S.parseProject(JSON.stringify({ format: 'loom-project', formatVersion: 1, state: s })), /SERVICE.*unavailable/);
  } finally { scope.LoomServiceSchema = module; }
});
console.log('SERVICE schema: ' + passed.length + ' checks passed.');
for (const name of passed) console.log('  ✓ ' + name);
