/* Run with node picnic/sequence-checks.cjs. No browser, audio device or decoded samples. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const scope = { console, TextEncoder, Map, Set, Math, Number, JSON };
scope.window = scope; scope.globalThis = scope;
vm.createContext(scope);
const run = file => vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), scope, { filename: file });
run(fs.existsSync(path.join(__dirname, 'shared/pattern-schema.js')) ? 'shared/pattern-schema.js' : '../shared/pattern-schema.js');
if (fs.existsSync(path.join(__dirname, 'assets/manifest.js'))) run('assets/manifest.js');
else scope.PicnicLibrary = { presets: Array.from({ length: 6 }, (_, i) => ({ id: 'sound-' + i })), defaults: Object.fromEntries(['melody', 'chords', 'bass', 'drums', 'neighbors', 'texture'].map((id, i) => [id, 'sound-' + i])) };
run('schema.js'); run('sequence.js');
const S = scope.PicnicSchema, Q = scope.PicnicSequence, P = scope.MusicLabPatternSchema;
const plain = value => JSON.parse(JSON.stringify(value));
const groups = [];
function check(name, test) { test(); groups.push(name); console.log('PASS ' + name); }
function empty() {
  const state = S.createDefault(); state.swing = 0;
  for (const bank of state.banks) for (const part of S.PARTS) bank.tracks[part.id] = Array.from({ length: 32 }, () => S.createStep());
  return state;
}
function put(state, bank, voice, index, settings) { state.banks[bank].tracks[voice][index] = S.createStep({ on: true, notes: [60], ...settings }); }
function packet() { return P.normalize({ format: 'musiclab-pattern', version: 1, name: 'An exact off-grid visitor', sourceApp: 'test', kind: 'notes', tempo: 91, swing: 0, lengthBeats: 2.5,
  voices: [{ id: 'guest', name: 'A guest' }], seed: 713,
  notes: [{ id: 'first', pitch: 46, beat: .137, duration: .731, velocity: .613, probability: 1, voice: 'guest' }, { id: 'last', pitch: 81, beat: 2.3, duration: .2, velocity: .7, probability: .42, voice: 'guest' }] }); }
check('Factory defaults are complete, musical, independent and portable without sample payloads', () => {
  const a = S.createDefault(), b = S.createDefault();
  assert.equal(a.parts.length, 6); assert.equal(a.banks.length, 4);
  for (const part of a.parts) assert(scope.PicnicLibrary.presets.some(preset => preset.id === part.presetId));
  assert.equal(a.parts[0].presetId, scope.PicnicLibrary.defaults.melody);
  assert(Q.events(a).length > 20); assert(Q.events(a).some(event => event.voice === 'neighbors'));
  a.banks[0].tracks.melody[0].notes[0] = 1; assert.notEqual(b.banks[0].tracks.melody[0].notes[0], 1);
  assert(!S.serializeProject(b).includes('base64')); assert(!('samples' in b));
  assert.deepEqual(plain(S.normalize({})), plain(b));
  assert.deepEqual(plain(S.parseProject(S.serializeProject(b))), plain(b));
});
check('Strict project parsing rejects malformed inputs atomically instead of normalizing them away', () => {
  const before = S.createDefault(), kept = JSON.stringify(before);
  const edits = [
    state => { state.version = 2; }, state => { state.tempo = NaN; }, state => { state.master.tone = Infinity; },
    state => { state.parts[0].presetId = 'missing-sound'; }, state => { state.parts[0].pan = -2; },
    state => { state.parts[0].id = state.parts[1].id; }, state => { state.parts.pop(); },
    state => { state.banks.pop(); }, state => { state.banks[0].length = 24; },
    state => { state.banks[0].tracks.melody.pop(); }, state => { state.banks[0].tracks.melody[0].notes = [128]; },
    state => { state.banks[0].tracks.melody[0].notes = [60.5]; }, state => { state.banks[0].tracks.melody[0].notes = [60, 60]; },
    state => { state.banks[0].tracks.melody[0].ratchet = 5; }, state => { state.banks[0].tracks.melody[0].offset = .5; },
    state => { state.banks[0].tracks.melody[0].gate = 0; }, state => { delete state.banks[0].tracks.melody[0].velocity; },
    state => { state.parts[0].release = undefined; }, state => { state.chainOrder = [4]; }, state => { state.chainOrder = []; },
    state => { state.scale = 'unknown'; }, state => { state.weather = 'flood'; }, state => { state.banks[0].chords = ['not-a-chord']; }
  ];
  for (const edit of edits) { const candidate = S.clone(before); edit(candidate); assert.throws(() => S.parseProject(candidate), /PICNIC|factory/); }
  assert.throws(() => S.parseProject({ format: 'picnic-project', version: 2, state: before }), /version/);
  assert.throws(() => S.parseProject('{oops'), /JSON/);
  assert.throws(() => S.parseProject(' '.repeat(S.MAX_PROJECT_BYTES + 1)), /2 MiB/);
  assert.equal(JSON.stringify(before), kept);
});
check('The second page survives shortening, composition and complete project round trips', () => {
  const state = empty(); put(state, 0, 'melody', 31, { notes: [83, 87], velocity: .91, offset: -.31, gate: 4 });
  const last = plain(state.banks[0].tracks.melody[31]); state.banks[0].length = 16;
  assert.equal(Q.events(state).length, 0); assert.equal(Q.lengthBeats(state), 4);
  const composed = Q.compose(state, { seed: 813 });
  assert.deepEqual(plain(composed.banks[0].tracks.melody[31]), last);
  const restored = S.parseProject(S.serializeProject(composed)); restored.banks[0].length = 32;
  assert(Q.events(restored).some(event => event.pitch === 87 && event.startBeat > 7.5));
});
check('Final-step chords and four ratchets remain inside the phrase at extreme swing and timing', () => {
  const state = empty(); state.swing = .75;
  put(state, 0, 'chords', 31, { notes: [60, 64, 71], ratchet: 4, offset: .49, gate: 6 });
  const output = Q.events(state);
  assert.equal(output.length, 12); assert(output.every(event => event.startBeat >= 7.75 && event.startBeat < 8));
  assert(output.every(event => event.durationBeats === 6 / 16));
  assert.equal(new Set(output.map(event => event.id)).size, output.length);
  assert.deepEqual(plain(Q.events(state, { startBeat: 7.75, lengthBeats: .25 })), plain(output));
});
check('Swing and microtiming share exact ratchet onsets, while first-step pickups stay at zero', () => {
  const state = empty(); state.swing = .2;
  put(state, 0, 'melody', 1, { ratchet: 2, offset: -.1, gate: 2 });
  const output = Q.events(state); assert.equal(output.length, 2);
  assert(Math.abs(output[0].startBeat - .275) < 1e-12); assert(Math.abs(output[1].startBeat - .3875) < 1e-12);
  put(state, 0, 'melody', 0, { notes: [64], offset: -.49 });
  assert.equal(Q.events(state)[0].startBeat, 0);
});
check('Ordered chains use actual bank lengths and repeat without losing notes or identities', () => {
  const state = empty(); state.banks[1].length = 16; state.chain = true; state.chainOrder = [1, 0, 1];
  put(state, 1, 'melody', 0, { notes: [70] }); put(state, 0, 'bass', 31, { notes: [40] });
  assert.equal(Q.lengthBeats(state), 16);
  const output = Q.events(state, { lengthBeats: 32 });
  assert.deepEqual(plain(output.map(event => event.startBeat)), [0, 11.75, 12, 16, 27.75, 28]);
  assert.equal(new Set(output.map(event => event.id)).size, 6);
});
check('Probability is deterministic across scheduler chunk sizes and preserves whole chord gestures', () => {
  const state = empty(); state.seed = 2491; state.swing = .17;
  for (let index = 0; index < 32; index++) put(state, 0, 'chords', index, { notes: [60, 64, 69], ratchet: 2, probability: .47 });
  const all = Q.events(state, { lengthBeats: 64 }), chunks = [];
  for (let startBeat = 0; startBeat < 64; startBeat += .5) chunks.push(...Q.events(state, { startBeat, lengthBeats: .5 }));
  assert.deepEqual(plain(chunks), plain(all)); assert(all.length > 0 && all.length < 32 * 3 * 2 * 8);
  assert.equal(all.length % 6, 0);
  const unrolled = Q.events(state, { realizeProbability: false });
  assert.equal(unrolled.length, 192); assert(unrolled.every(event => event.probability === .47));
  assert.notDeepEqual(plain(Q.events({ ...state, seed: 2492 }, { lengthBeats: 64 })), plain(all));
});
check('Exact received notes take priority, retain fractional timing and obey mute/solo without patch transposition', () => {
  const state = empty(); put(state, 0, 'melody', 0, { notes: [100] });
  state.parts.find(part => part.id === 'neighbors').transpose = 24;
  state.musicLabPattern = { pattern: packet(), voiceMap: { guest: 'neighbors' } };
  const before = JSON.stringify(state), restored = S.parseProject(S.serializeProject(state));
  assert.deepEqual(plain(restored), plain(state)); assert.equal(Q.lengthBeats(state), 2.5);
  const output = Q.events(state, { lengthBeats: 5, realizeProbability: false });
  assert.deepEqual(plain(output.map(event => event.startBeat)), [.137, 2.3, 2.637, 4.8]);
  assert.deepEqual(plain(output.map(event => event.pitch)), [46, 81, 46, 81]);
  assert.equal(output[0].durationBeats, .731); assert.equal(output[0].velocity, .613); assert.equal(output[1].probability, .42);
  assert.equal(JSON.stringify(state), before);
  restored.parts.find(part => part.id === 'melody').solo = true; assert.equal(Q.events(restored).length, 0);
  restored.parts.find(part => part.id === 'neighbors').solo = true; assert(Q.events(restored).length > 0);
  restored.parts.find(part => part.id === 'neighbors').mute = true; assert.equal(Q.events(restored).length, 0);
});
check('Malformed exact overlays and extra or unavailable voice mappings reject without affecting the original', () => {
  const state = empty(); state.musicLabPattern = { pattern: packet(), voiceMap: { guest: 'melody' } }; const original = JSON.stringify(state);
  for (const edit of [
    value => { value.musicLabPattern.voiceMap.guest = 'missing'; }, value => { value.musicLabPattern.voiceMap.extra = 'bass'; },
    value => { value.musicLabPattern.pattern.notes[0].duration = 3; }, value => { value.musicLabPattern.pattern.notes[0].pitch = -1; },
    value => { delete value.musicLabPattern.voiceMap; }, value => { value.musicLabPattern.pattern.version = 2; }
  ]) { const candidate = S.clone(state); edit(candidate); assert.throws(() => S.parseProject(candidate)); }
  assert.equal(JSON.stringify(state), original);
});
check('Original composition uses key, harmony, hour, season and weather while retaining sound choices', () => {
  const state = S.createDefault(); state.banks[0].chords = ['I6/9', 'vi7', 'ii7', 'V9'];
  state.musicLabPattern = { pattern: packet(), voiceMap: { guest: 'melody' } };
  const before = JSON.stringify(state), a = Q.compose(state, { allBanks: true, seed: 128 }), b = Q.compose(state, { allBanks: true, seed: 128 });
  assert.deepEqual(plain(a), plain(b)); assert.equal(JSON.stringify(state), before); assert(!a.musicLabPattern);
  assert.deepEqual(plain(a.parts), plain(state.parts)); assert.deepEqual(plain(a.master), plain(state.master));
  assert.deepEqual(plain(a.banks[0].chords), plain(state.banks[0].chords));
  assert.equal(new Set(a.banks.map(bank => JSON.stringify(bank.tracks))).size, 4);
  assert(Q.events(a, { realizeProbability: false }).some(event => event.voice === 'chords'));
  assert.deepEqual(plain(Q.chordNotes({ ...state, key: 0 }, 'I6/9')), [48, 52, 57, 62]);
  const shifted = Q.compose({ ...state, key: 2 }, { seed: 128 });
  assert.equal(shifted.banks[0].tracks.chords[0].notes[0] - a.banks[0].tracks.chords[0].notes[0], 2);
  for (const setting of [{ hour: 2 }, { season: 'winter' }, { weather: 'rain' }]) {
    const changed = Q.compose({ ...state, ...setting }, { allBanks: true, seed: 128 });
    assert.notDeepEqual(plain(changed.banks[0].tracks), plain(a.banks[0].tracks));
  }
  const otherBanks = JSON.stringify(state.banks.slice(1)); Q.compose(state, { seed: 18 }); assert.equal(JSON.stringify(state.banks.slice(1)), otherBanks);
});
check('Native sound transposition stays independent of exported notes and event ranges are bounded', () => {
  const state = empty(); put(state, 0, 'melody', 0, { notes: [60] }); state.parts[0].transpose = 12;
  assert.equal(Q.events(state)[0].pitch, 60);
  for (const request of [{ startBeat: -1 }, { startBeat: NaN }, { lengthBeats: 0 }, { lengthBeats: 16385 }, { lengthBeats: Infinity }]) assert.throws(() => Q.events(state, request), /finite/);
  assert.equal(Q.noteName(60), 'C4');
});
console.log('Passed ' + groups.length + ' PICNIC score and composition checks.');
