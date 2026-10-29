'use strict';
// Portable channel EQ project, migration, automation and SERVICE checks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
globalThis.window = globalThis;
globalThis.crypto ||= webcrypto;
globalThis.btoa ||= value => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ||= value => Buffer.from(value, 'base64').toString('binary');
const shared = fs.existsSync(path.join(__dirname, 'shared', 'pattern-schema.js')) ? path.join(__dirname, 'shared', 'pattern-schema.js') : path.join(__dirname, '..', 'shared', 'pattern-schema.js');
vm.runInThisContext(fs.readFileSync(shared, 'utf8'), { filename: 'pattern-schema.js' });
for (const name of ['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'preamp-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'effects.js', 'service-schema.js', 'schema.js', 'audio-engine.js', 'service-capture.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, name), 'utf8'), { filename: name });
const S = LoomSchema, P = LoomServiceSchema, C = LoomServiceCapture, passed = [];
const clone = value => JSON.parse(JSON.stringify(value));
const keys = ['low', 'lowMid', 'highMid', 'high'];
const flat = () => ({ low: 0, lowMid: 0, highMid: 0, high: 0 });
const envelope = (state = S.defaultState(), version = S.VERSION) => ({ format: 'loom-project', formatVersion: 1, appVersion: version, state });
const parse = value => S.parseProject(JSON.stringify(value));
const lane = (key, index = 0) => ({ target: 'eq:' + key, enabled: true, interpolation: index % 2 ? 'hold' : 'linear', points: [{ beat: 0, value: -12 }, { beat: 8, value: 12 }] });
function check(name, run) { run(); passed.push(name); console.log('PASS ' + name); }

check('Eight independent flat EQs retain four insert slots, fixed bands and track-only ownership', () => {
  const state = S.defaultState(); assert.equal(S.VERSION, '1.18.0'); assert.equal(state.tracks.length, 8);
  assert.deepEqual(S.defaultTrackEq(), flat());
  assert.deepEqual(S.TRACK_EQ_BANDS.map(band => [band.key, band.frequency, band.type, band.q]), [['low', 100, 'lowshelf', .707], ['lowMid', 400, 'peaking', .707], ['highMid', 2500, 'peaking', .707], ['high', 10000, 'highshelf', .707]]);
  assert(Object.isFrozen(S.TRACK_EQ_BANDS) && S.TRACK_EQ_BANDS.every(Object.isFrozen));
  for (const track of state.tracks) { assert.deepEqual(track.eq, flat()); assert.equal(track.effects.length, 4); }
  state.tracks[0].eq.low = 5; assert.equal(state.tracks[1].eq.low, 0); assert.equal(S.defaultState().tracks[0].eq.low, 0);
  assert(!('eq' in state.master)); assert(state.returns.every(bus => !('eq' in bus)));
  assert(!S.automationTargets(state.master).some(d => d.target.startsWith('eq:')));
  for (const bus of state.returns) assert(!S.automationTargets(bus).some(d => d.target.startsWith('eq:')));
});

check('Released projects inherit only absent EQs and retain every supplied track and effect value', () => {
  const original = S.defaultState(); original.name = 'Before the channel EQ'; original.selectedTrack = 5;
  original.tracks[0].effects[0] = S.effect({ type: 'saute', params: LoomEffectsCatalog.find(effect => effect.id === 'saute').defaults });
  original.tracks[0].level = .437; original.tracks[3].sends = [.25, .7]; original.tracks[3].sendPre = [true, false];
  original.tracks[7].eq = { low: -2.5, lowMid: 4.1, highMid: -6.2, high: 8.3 };
  for (const version of [undefined, '0.9.0', '1.0.0', '1.13.0', '1.16.0', '1.17.0', '1.17.99']) {
    const saved = envelope(clone(original), version); if (version === undefined) delete saved.appVersion;
    saved.state.tracks.slice(0, 7).forEach(track => delete track.eq);
    const before = JSON.stringify(saved), actual = parse(saved);
    assert.equal(JSON.stringify(saved), before, 'The parser does not mutate the supplied envelope');
    assert.deepEqual(actual, original, 'Migration changed existing settings for ' + version);
  }
});

check('Provided malformed EQs reject on old and new projects; current and future projects require EQ', () => {
  const bad = [null, false, [], 2, 'flat', {}, { low: 0 }, { ...flat(), highMid: null }, { ...flat(), low: '3' }, { ...flat(), high: 12.01 }, { ...flat(), lowMid: -12.01 }, { ...flat(), extra: 0 }];
  for (const version of ['1.17.0', S.VERSION]) for (const eq of bad) {
    const saved = envelope(S.defaultState(), version); saved.state.tracks[4].eq = eq;
    assert.throws(() => parse(saved), /EQ/i, version + ': ' + JSON.stringify(eq));
  }
  for (const version of [S.VERSION, '1.18.1', '1.99.0', '2.0.0', null, 'invalid']) {
    const saved = envelope(S.defaultState(), version); delete saved.state.tracks[0].eq;
    assert.throws(() => parse(saved), /EQ/i, 'Missing current EQ: ' + version);
  }
  for (const owner of ['master', 'return-1', 'return-2']) {
    const saved = envelope(); S.automationOwner(saved.state, owner).eq = flat();
    assert.throws(() => parse(saved), /bus|return|master/i, owner + ' cannot have a track EQ');
  }
});

check('All bands and automation survive portable saving on all tracks without effect references', () => {
  const state = S.defaultState();
  for (const [index, track] of state.tracks.entries()) {
    track.eq = { low: -12 + index, lowMid: 11.9 - index, highMid: index ? -.1 * index : 0, high: index * .3 };
    track.automation = keys.map(lane);
    const targets = S.automationTargets(track), eq = targets.slice(-4);
    assert.deepEqual(eq.map(d => d.target), keys.map(key => 'eq:' + key));
    assert.deepEqual(targets.slice(0, 4).map(d => d.target), ['level', 'pan', 'send:0', 'send:1']);
    for (const d of eq) { assert.equal(d.min, -12); assert.equal(d.max, 12); assert.equal(d.step, .1); assert.equal(d.default, 0); assert.equal(d.unit, 'dB'); assert.equal(d.effectType, undefined); assert.equal(d.value, track.eq[d.target.slice(3)]); }
  }
  const actual = S.parseProject(S.serializeProject(state));
  for (let index = 0; index < 8; index++) { assert.deepEqual(actual.tracks[index].eq, state.tracks[index].eq); assert.deepEqual(actual.tracks[index].automation, state.tracks[index].automation); }
  const occupied = S.defaultState().tracks[0]; occupied.effects.fill(S.effect({ type: 'broiler', params: LoomEffectsCatalog.find(effect => effect.id === 'broiler').defaults }));
  const targets = S.automationTargets(occupied); assert(targets.length > 64); assert(targets.slice(4, -4).every(d => d.target.startsWith('fx:'))); assert.deepEqual(targets.slice(-4).map(d => d.target), keys.map(key => 'eq:' + key));
});

check('EQ automation rejects wrong ownership, stale effect types, duplicates and invalid points atomically', () => {
  const invalid = [
    state => { state.tracks[0].automation = [lane('unknown')]; },
    state => { state.tracks[0].automation = [{ ...lane('low'), effectType: 'prism' }]; },
    state => { state.tracks[0].automation = [lane('low'), lane('low')]; },
    state => { state.tracks[0].automation = [{ ...lane('low'), points: [{ beat: 0, value: 12.1 }] }]; },
    state => { state.master.automation = [lane('low')]; },
    state => { state.returns[0].automation = [lane('high')]; }
  ];
  for (const mutate of invalid) { const saved = envelope(); mutate(saved.state); assert.throws(() => parse(saved), /automation|point/i); }
});

check('Tolerant state loading defaults and clamps EQs without sharing objects or mutating input', () => {
  const raw = S.defaultState(); delete raw.tracks[0].eq; raw.tracks[1].eq = null; raw.tracks[2].eq = { low: -99, high: 99, lowMid: '5', highMid: 3.27, extra: 1 };
  raw.master.eq = { low: 4 }; raw.returns[0].eq = { high: 2 };
  const before = JSON.stringify(raw), actual = S.normalize(raw);
  assert.equal(JSON.stringify(raw), before); assert.deepEqual(actual.tracks[0].eq, flat()); assert.deepEqual(actual.tracks[1].eq, flat());
  assert.deepEqual(actual.tracks[2].eq, { low: -12, lowMid: 0, highMid: 3.27, high: 12 }); assert(!('eq' in actual.master)); assert(!('eq' in actual.returns[0]));
  actual.tracks[0].eq.high = 2; assert.equal(actual.tracks[1].eq.high, 0);
});

function serviceFixture() {
  const state = S.defaultState(); state.tempo = 120; state.lengthBars = 4; state.loopEnabled = false; state.loopEnd = 16;
  const left = Float32Array.from({ length: 8000 }, (_, i) => .1 * Math.sin(2 * Math.PI * 400 * i / 8000)), asset = S.encodeAsset({ left, right: left, sampleRate: 8000, id: 'eq-source', name: 'EQ source' });
  state.assets = [asset]; state.tracks[0].eq = { low: 3, lowMid: -2, highMid: 1, high: 4 };
  state.tracks[0].clips = [{ id: 'eq-clip', name: 'EQ clip', type: 'audio', assetId: asset.id, start: 0, length: 2, sourceStart: 0, sourceEnd: 1, sourceOffset: 0, rate: 1, reverse: false, loop: true, gain: 1, fadeIn: 0, fadeOut: 0 }];
  return state;
}
check('SERVICE exposes valid track EQ mappings, rejects bus/stale targets and retains macro references in projects', () => {
  const state = serviceFixture(), service = P.defaults();
  service.macros[0].mappings = keys.map(key => ({ trackId: 'track-1', target: 'eq:' + key, min: -12, max: 12, baseline: state.tracks[0].eq[key], polarity: 'normal' }));
  assert(P.validate(service, state)); assert.deepEqual(P.normalize(service, state).macros[0].mappings, service.macros[0].mappings);
  state.service = service; assert.deepEqual(S.parseProject(S.serializeProject(state)).service.macros[0].mappings, service.macros[0].mappings);
  for (const patch of [{ trackId: 'master' }, { trackId: 'return-1' }, { target: 'eq:unknown' }, { effectType: 'prism' }]) {
    const bad = clone(service); Object.assign(bad.macros[0].mappings[0], patch); assert.throws(() => P.validate(bad, state), /target|effect|reference/i);
  }
});

check('SERVICE take compilation retains independent EQ settings and compiles EQ override lanes with no FX slot use', () => {
  const state = serviceFixture(), before = JSON.stringify(state), clips = ['eq-clip', null, null, null, null, null, null, null];
  const take = { lengthBeats: 4, events: [
    { kind: 'scene', beat: 0, sceneId: 'eq-scene', clips },
    { kind: 'performance', beat: 1, drops: Array(8).fill(false), stutterBeats: 0, fill: false, overrides: [{ trackId: 'track-1', target: 'eq:lowMid', value: 9 }] },
    { kind: 'performance', beat: 3, drops: Array(8).fill(false), stutterBeats: 0, fill: false, overrides: [] }
  ] };
  const out = C.compile({ state, take }); assert.equal(JSON.stringify(state), before); assert.deepEqual(out.tracks[0].eq, state.tracks[0].eq); assert.equal(out.tracks[0].effects.length, 4);
  assert.deepEqual(out.tracks[0].automation, [{ target: 'eq:lowMid', enabled: true, interpolation: 'hold', points: [{ beat: 0, value: -2 }, { beat: 1, value: 9 }, { beat: 3, value: -2 }] }]);
  out.tracks[0].eq.low = -10; assert.equal(state.tracks[0].eq.low, 3);
  assert.deepEqual(S.parseProject(S.serializeProject(out)).tracks[0].automation, out.tracks[0].automation);
});

console.log(passed.length + ' track EQ project and SERVICE checks passed.');
