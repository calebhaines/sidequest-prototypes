'use strict';

// Portable project/schema regressions; no browser, audio device, or Git needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
globalThis.window = globalThis;
globalThis.crypto ||= webcrypto;
globalThis.btoa ||= value => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ||= value => Buffer.from(value, 'base64').toString('binary');
const shared = fs.existsSync(path.join(__dirname, 'shared', 'pattern-schema.js')) ? path.join(__dirname, 'shared') : path.join(__dirname, '..', 'shared');
vm.runInThisContext(fs.readFileSync(path.join(shared, 'pattern-schema.js'), 'utf8'), { filename: 'pattern-schema.js' });
for (const name of ['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'preamp-catalog.js', 'effects-catalog.js', 'schema.js', 'service-schema.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, name), 'utf8'), { filename: name });
const S = LoomSchema, passed = [];
const check = (name, run) => { run(); passed.push(name); };
const clone = value => JSON.parse(JSON.stringify(value));
const definition = type => LoomEffectsCatalog.find(effect => effect.id === type);
const fx = (type, params = {}) => S.effect({ type, params: { ...definition(type).defaults, ...params } });
const packet = () => ({ format: 'musiclab-pattern', version: 1, name: 'Saved score', sourceApp: 'roux', kind: 'notes', tempo: 117, swing: 0, lengthBeats: 4, meter: [4, 4], voices: [{ id: 'bass', name: 'Bass' }], notes: [{ id: 'note-a', voice: 'bass', beat: 0, duration: 1, pitch: 36, velocity: .7, probability: 1 }] });
const lane = (target, points = [[0, .2], [4, .8]], effectType) => ({ target, enabled: true, interpolation: 'linear', points: points.map(([beat, value]) => ({ beat, value })), ...(effectType ? { effectType } : {}) });
const envelope = (state = S.defaultState(), version = S.VERSION) => ({ format: 'loom-project', formatVersion: 1, ...(version === undefined ? {} : { appVersion: version }), state });
const parse = project => S.parseProject(JSON.stringify(project));
function stripBuses(state) {
  const result = clone(state); delete result.returns;
  result.master = { level: result.master.level, metronome: result.master.metronome };
  result.tracks.forEach(track => { delete track.sends; delete track.sendPre; }); return result;
}
function richState() {
  const state = S.defaultState();
  state.name = 'A service worth keeping'; state.tempo = 117; state.selectedTrack = 6;
  state.master.level = .67; state.master.metronome = true; state.view.follow = false;
  state.recording.micInputGainDb = 3; state.markers = [{ id: 'section-a', name: 'Prep', beat: 2, color: '#90b6bd' }];
  const descriptor = { id: 'roux', name: 'ROUX', snapshot: { format: 'loom-instrument-state', version: 1, app: 'roux', state: { seed: 21, custom: ['preserve', 7] }, storage: { 'roux-test': 'saved' } } };
  state.tracks[0].instrument = descriptor; state.tracks[0].level = .53; state.tracks[0].pan = -.37;
  state.tracks[0].effects[0] = fx('cinder', { drive: 13.4, mix: .62 });
  state.tracks[0].automation = [lane('fx:0:drive', [[0, 6], [4, 13.4]], 'cinder')];
  const notes = S.noteClip({ id: 'notes-a', name: 'Original score', type: 'notes', pattern: packet(), voiceMap: { bass: 'notes' }, start: 0, length: 4, sourceOffset: 0, rate: 1, loop: false, gain: .8, fadeIn: .03, fadeOut: .04, transpose: -12 });
  state.tracks[0].clips = [notes];
  const asset = S.encodeAsset({ left: Float32Array.from({ length: 64 }, (_, i) => Math.sin(i * .23) * .2), sampleRate: 8000, name: 'A printed take', id: 'audio-a' });
  state.assets = [asset];
  state.tracks[1].clips = [{ id: 'clip-a', name: 'Printed part', type: 'audio', assetId: asset.id, start: 1, length: 1, sourceStart: 0, sourceEnd: asset.duration, sourceOffset: .001, rate: .75, reverse: true, loop: true, gain: .6, fadeIn: .02, fadeOut: .04, origin: { format: 'loom-render-source', version: 1, instrument: descriptor, pattern: packet(), voiceMap: { bass: 'notes' }, tempo: 117, tailSeconds: 1, renderedAt: 1, sourceClip: notes } }];
  state.service = LoomServiceSchema.defaults(); return S.normalize(state);
}

check('Defaults add two wet returns and a four-slot master without adding instrument tracks', () => {
  const state = S.defaultState(); assert.equal(S.VERSION, '1.18.0'); assert.equal(state.version, 1);
  assert.equal(state.tracks.length, 8); assert.equal(S.LIMITS.tracks, 8); assert.equal(S.LIMITS.returns, 2);
  assert.deepEqual(state.master, { id: 'master', name: 'Master', level: .8, metronome: false, mute: false, effects: [null, null, null, null], automation: [] });
  for (const track of state.tracks) { assert.equal(track.effects.length, 4); assert.deepEqual(track.sends, [0, 0]); assert.deepEqual(track.sendPre, [false, false]); }
  for (const [index, bus] of state.returns.entries()) {
    assert.equal(bus.id, 'return-' + (index + 1)); assert.equal(bus.name, index ? 'Return B' : 'Return A');
    assert.equal(bus.level, 1); assert.equal(bus.pan, 0); assert.equal(bus.mute, false); assert.equal(bus.solo, false);
    assert.equal(bus.effects.length, 4); assert.deepEqual(bus.effects[0], fx(index ? 'parallax' : 'vestige', { mix: 1 })); assert.deepEqual(bus.automation, []);
    for (const key of ['instrument', 'instrumentLive', 'clips', 'armed', 'sends', 'sendPre']) assert.equal(Object.hasOwn(bus, key), false, key);
  }
  const first = S.defaultReturn(0), second = S.defaultReturn(0); first.effects[0].params.mix = .2; first.automation.push(lane('level'));
  assert.equal(second.effects[0].params.mix, 1); assert.equal(second.automation.length, 0);
  state.tracks[0].sends[0] = .7; assert.equal(state.tracks[1].sends[0], 0); assert.throws(() => S.defaultReturn(2), /Return A or Return B/);
});

check('Legacy migration adds only missing buses and preserves clips, PCM, snapshots, mix and SERVICE', () => {
  const original = richState(), legacy = stripBuses(original), before = JSON.stringify(legacy);
  for (const version of [undefined, '1.0.0', '1.13.2', '1.15.0']) {
    const saved = envelope(clone(legacy)); if (version === undefined) delete saved.appVersion; else saved.appVersion = version;
    const restored = parse(saved); assert.deepEqual(stripBuses(restored), legacy, String(version));
    assert.deepEqual(restored.returns, S.defaultState().returns); assert.equal(restored.master.level, .67); assert.equal(restored.master.metronome, true);
    assert(restored.tracks.every(track => track.sends.every(value => value === 0) && track.sendPre.every(value => value === false)));
  }
  assert.equal(JSON.stringify(legacy), before, 'Parsing does not mutate the input fixture.');
  const provided = S.defaultState(); provided.master.mute = true; delete provided.master.automation;
  provided.tracks[7].sends = [.21, .63]; provided.tracks[7].sendPre = [true, false]; provided.returns[0].level = .43; provided.returns[0].effects[0].params.mix = .31;
  const restored = parse(envelope(provided, '1.15.0'));
  assert.equal(restored.master.mute, true); assert.deepEqual(restored.master.automation, []); assert.deepEqual(restored.tracks[7].sends, [.21, .63]); assert.deepEqual(restored.tracks[7].sendPre, [true, false]); assert.equal(restored.returns[0].level, .43); assert.equal(restored.returns[0].effects[0].params.mix, .31);
});

check('Current projects must include every new master field, return array and track send vector', () => {
  const base = envelope();
  const mutations = [p => delete p.state.returns, ...['id', 'name', 'mute', 'effects', 'automation'].map(key => p => delete p.state.master[key])];
  for (let index = 0; index < 8; index++) for (const key of ['sends', 'sendPre']) mutations.push(p => delete p.state.tracks[index][key]);
  for (const mutate of mutations) { const saved = clone(base); mutate(saved); assert.throws(() => parse(saved), /master|return|send/i); }
  assert.equal(parse(base).selectedTrack, 0);
});

check('Provided malformed sends reject in both legacy and current projects', () => {
  const badSends = [null, 0, [], [.2], [.2, .3, .4], [null, 0], ['.2', 0], [-.01, 0], [0, 1.01]];
  const badPre = [null, false, [], [true], [false, false, false], [0, false], ['false', true], [null, false]];
  for (const version of ['1.15.0', S.VERSION]) for (const [key, values] of [['sends', badSends], ['sendPre', badPre]]) for (const value of values) {
    const saved = envelope(S.defaultState(), version); saved.state.tracks[3][key] = value; assert.throws(() => parse(saved), /send/i, key + ' ' + JSON.stringify(value));
  }
});

check('Return IDs, counts, bounds and bus-only ownership reject unsupported routing atomically', () => {
  const mutations = [p => p.state.returns = null, p => p.state.returns.pop(), p => p.state.returns.push(S.defaultReturn(0)), p => p.state.returns[0] = null,
    p => p.state.master.id = 'track-1', p => p.state.master.mute = 1, p => p.state.returns[0].id = 'return-2', p => p.state.returns.reverse(),
    p => p.state.returns[0].level = 1.51, p => p.state.returns[0].level = null, p => p.state.returns[0].pan = -1.01, p => p.state.returns[1].solo = 'yes',
    p => delete p.state.returns[0].automation, p => p.state.returns[1].name = '', p => p.state.master.effects = [null], p => p.state.returns[1].effects = []];
  for (const key of ['sends', 'sendPre', 'routes', 'target', 'output', 'instrument', 'instrumentLive', 'armed', 'clips']) for (const owner of ['master', 'return']) mutations.push(p => { (owner === 'master' ? p.state.master : p.state.returns[0])[key] = []; });
  for (const key of ['pan', 'solo']) mutations.push(p => { p.state.master[key] = 0; });
  for (const version of ['1.15.0', S.VERSION]) for (const mutate of mutations) { const saved = envelope(S.defaultState(), version), before = S.serializeProject(S.defaultState()); mutate(saved); assert.throws(() => parse(saved), /master|return/i); assert.equal(S.serializeProject(S.defaultState()), before); }
});

check('Bus effects validate complete fields and numeric bounds without repairing provided values', () => {
  for (const owner of ['master', 'return']) for (const patch of [slot => delete slot.params.decay, slot => slot.params.decay = null, slot => slot.params.decay = 100, slot => slot.params.mix = 1.01, slot => slot.params.bypass = 0, slot => slot.type = 'missing']) {
    const saved = envelope(), bus = owner === 'master' ? saved.state.master : saved.state.returns[0]; bus.effects[0] = fx('vestige'); patch(bus.effects[0]); assert.throws(() => parse(saved), /effect|invalid|settings/i);
  }
  const saved = envelope(); saved.state.returns[1].effects[0] = fx('parallax', { mix: .27, clock: 'free', time: 563 });
  assert.equal(parse(saved).returns[1].effects[0].params.mix, .27, 'Existing return dry/wet is never forced to 1.');
});

check('Owner lookup and automation descriptors address only the appropriate faders, sends and four inserts', () => {
  const state = S.defaultState(); state.master.effects[3] = fx('velvet'); state.returns[0].effects[2] = fx('broiler');
  for (const owner of [...state.tracks, ...state.returns, state.master]) assert.equal(S.automationOwner(state, owner.id), owner);
  for (const id of [undefined, null, 0, 'track-9', 'return-3', 'clip-a', 'constructor']) assert.equal(S.automationOwner(state, id), null);
  const master = S.automationTargets(state.master), wet = S.automationTargets(state.returns[0]), track = S.automationTargets(state.tracks[0]);
  assert(!master.some(d => d.target === 'pan' || d.target.startsWith('send:'))); assert(!wet.some(d => d.target.startsWith('send:')));
  assert.equal(master.find(d => d.target === 'level').label, 'Master volume'); assert.equal(wet.find(d => d.target === 'level').default, 1);
  assert.deepEqual(track.filter(d => d.target.startsWith('send:')).map(d => [d.target, d.min, d.max, d.default]), [['send:0', 0, 1, 0], ['send:1', 0, 1, 0]]);
  assert(master.some(d => d.target === 'fx:3:colour' && d.effectType === 'velvet')); assert(wet.some(d => d.target === 'fx:2:pedal4Mix' && d.effectType === 'broiler'));
});

check('All fifteen effects, bus/send automation and manual wet blends survive portable round trips', () => {
  assert.equal(LoomEffectsCatalog.length, 15);
  for (let offset = 0; offset < LoomEffectsCatalog.length; offset += 4) {
    const state = richState(), owners = [state.master, ...state.returns];
    for (const [ownerIndex, owner] of owners.entries()) {
      owner.effects = Array.from({ length: 4 }, (_, slot) => fx(LoomEffectsCatalog[(offset + slot + ownerIndex) % LoomEffectsCatalog.length].id, { mix: .31 + ownerIndex * .1 }));
      owner.automation = [lane('level', [[0, .2], [4, 1.1]]), ...(owner.id === 'master' ? [] : [lane('pan', [[0, -.6], [4, .5]])]), lane('fx:3:mix', [[0, .23], [4, .71]], owner.effects[3].type)];
    }
    state.tracks[0].sends = [.3, .7]; state.tracks[0].sendPre = [true, false]; state.tracks[0].automation.push(lane('send:0'), lane('send:1', [[0, .8], [4, .1]]));
    state.master.mute = true; state.returns[1].name = 'Plate and echo'; state.returns[1].solo = true;
    const saved = S.serializeProject(state), restored = S.parseProject(saved); assert.equal(S.serializeProject(restored), saved); assert.equal(restored.tracks.length, 8); assert.equal(restored.selectedTrack, 6);
    for (const [index, owner] of [restored.master, ...restored.returns].entries()) assert.equal(owner.effects[0].params.mix, .31 + index * .1);
  }
});

check('Bus automation rejects illegal cross-bus targets, duplicate lanes, values and effect types', () => {
  const mutations = [p => p.state.master.automation = [lane('pan')], p => p.state.master.automation = [lane('send:0')], p => p.state.returns[0].automation = [lane('send:1')], p => p.state.tracks[0].automation = [lane('send:2')],
    p => p.state.returns[0].automation = [lane('level'), lane('level')], p => p.state.returns[0].automation = [lane('fx:0:mix', [[0, .5]], 'parallax')],
    p => p.state.master.automation = [lane('level', [[0, 1.6]])], p => p.state.returns[0].automation = [lane('pan', [[0, -2]])], p => p.state.returns[0].automation = [lane('level', [[65, .5]])],
    p => p.state.returns[0].automation = [{ ...lane('level'), enabled: 1 }], p => p.state.master.automation = [{ ...lane('level'), points: [{ beat: 0, value: null }] }]];
  for (const mutate of mutations) { const saved = envelope(); mutate(saved); assert.throws(() => parse(saved), /automation/i); }
});

check('Each bus keeps the existing 64-lane and 4096-point automation budgets', () => {
  const state = S.defaultState(); state.master.effects.fill(fx('broiler'));
  state.master.automation = S.automationTargets(state.master).slice(0, 64).map(d => lane(d.target, [[0, d.default]], d.effectType));
  assert.equal(state.master.automation.length, 64); assert.equal(parse(envelope(state)).master.automation.length, 64);
  const tooMany = clone(state); const next = S.automationTargets(tooMany.master)[64]; tooMany.master.automation.push(lane(next.target, [[0, next.default]], next.effectType)); assert.throws(() => parse(envelope(tooMany)), /automation/i);
  const wet = S.defaultState(); wet.returns[0].automation = [lane('level', Array.from({ length: 4096 }, (_, i) => [i * 64 / 4096, i % 2]))];
  assert.equal(parse(envelope(wet)).returns[0].automation[0].points.length, 4096); wet.returns[0].automation[0].points.push({ beat: 64, value: .5 }); assert.throws(() => parse(envelope(wet)), /automation/i);
});

check('Legacy BROILER and BUTTER field migrations also apply to provided bus effects', () => {
  const workshop = ['ampEnable', 'preampTube', 'powerTube', 'toneStack', 'bias', 'voltage', 'feedback', 'tightness', 'bright', 'coupling', 'cathode', 'transformer', 'powerScale', 'micType', 'cabLowCut', 'cabHighCut', 'cabResonance', ...Array.from({ length: 4 }, (_, i) => ['Type', 'Enabled', 'Route', 'Drive', 'Tone', 'Level', 'Mix'].map(key => 'pedal' + (i + 1) + key)).flat()];
  const analog = ['model', 'input', 'colour', 'timing', 'link', 'fetMode', 'thrust'];
  const saved = envelope(S.defaultState(), '1.13.0'); saved.state.master.effects[0] = fx('velvet', { threshold: -23 }); saved.state.returns[0].effects[0] = fx('broiler', { drive: 11 });
  analog.forEach(key => delete saved.state.master.effects[0].params[key]); workshop.forEach(key => delete saved.state.returns[0].effects[0].params[key]);
  const actual = parse(saved); assert.deepEqual(actual.master.effects[0], fx('velvet', { threshold: -23 })); assert.deepEqual(actual.returns[0].effects[0], fx('broiler', { drive: 11 }));
  const malformed = clone(saved); malformed.state.master.effects[0].params.model = 'missing'; assert.throws(() => parse(malformed), /invalid/i);
  const missingOriginal = clone(saved); delete missingOriginal.state.master.effects[0].params.threshold; assert.throws(() => parse(missingOriginal), /invalid/i);
  const current = clone(saved); current.appVersion = S.VERSION; assert.throws(() => parse(current), /invalid/i);
});

check('Tolerant raw-state normalization fills old defaults, clamps vectors and never mutates input', () => {
  const raw = stripBuses(richState()), before = JSON.stringify(raw); const normalized = S.normalize(raw);
  assert.deepEqual(stripBuses(normalized), raw); assert.equal(JSON.stringify(raw), before);
  raw.tracks[0].sends = [-1, 2]; raw.tracks[0].sendPre = ['yes', true]; raw.returns = [{ level: 4, pan: -4, effects: [fx('vestige', { mix: .28 })] }, { effects: [] }];
  raw.master.effects = [fx('velvet')]; raw.master.automation = [lane('pan'), lane('level')]; const snapshot = JSON.stringify(raw), result = S.normalize(raw);
  assert.deepEqual(result.tracks[0].sends, [0, 1]); assert.deepEqual(result.tracks[0].sendPre, [false, true]); assert.equal(result.returns[0].level, 1.5); assert.equal(result.returns[0].pan, -1); assert.equal(result.returns[0].effects[0].params.mix, .28); assert.deepEqual(result.returns[1].effects, [null, null, null, null]); assert.deepEqual(result.master.automation.map(lane => lane.target), ['level']); assert.equal(JSON.stringify(raw), snapshot);
});

for (const name of passed) console.log('PASS ' + name);
console.log(passed.length + ' bus schema and migration checks passed.');
