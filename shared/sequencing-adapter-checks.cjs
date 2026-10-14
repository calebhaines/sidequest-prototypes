'use strict';
// Export through the installed production adapters, using small native fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const copy = value => JSON.parse(JSON.stringify(value));
const score = rows => Array.from({ length: rows }, () => Array(32).fill(0));
const checks = [];
function installed(id, initial, pitched = false) {
  let state = copy(initial);
  const engine = { state, setState(next) { state = next; this.state = next; }, start() {}, stop() {}, panic() {}, stopNotes() {}, clearClockPositions() {}, seekBeat() {} };
  const name = id[0].toUpperCase() + id.slice(1);
  const scope = { console, Math, Number, JSON, Map, Set, DOMException, TextEncoder, TextDecoder, setTimeout, clearTimeout, setInterval, clearInterval,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    document: { documentElement: { dataset: { musiclabApp: id } }, title: '', addEventListener() {}, dispatchEvent() {} } };
  scope.window = scope;
  scope[name + 'App'] = { engine, getState: () => copy(state), loadState(next) { engine.setState(next); } };
  scope[name + 'Schema'] = { normalize: copy, copy, degreeMidi: (s, lane, degree) => s.root + lane * 7 + degree,
    DIVISIONS: { '1/16': .25 } };
  scope.HazeDSP = { frequencyForBand: (s, band) => 440 * Math.pow(2, (48 + band - 69) / 12) };
  vm.createContext(scope);
  for (const file of ['pattern-schema.js', pitched ? 'pattern-pitched.js' : 'pattern-drums.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), scope, { filename: file });
  return { adapter: scope.MusicLabPatternInstrument, state: () => state };
}
function check(name, run) { run(); checks.push(name); }

for (const id of ['grain', 'tine']) check(id + ': step 32 exports, hidden steps survive a shorter phrase, and accents remain intact', () => {
  const s = { name: 'Two bars', bpm: 120, swing: 0, stepCount: 32,
    tracks: Array.from({ length: 8 }, (_, i) => ({ name: 'Drum ' + i, mute: false, solo: false, steps: Array(32).fill(0) })) };
  s.tracks[0].steps[0] = 1; s.tracks[0].steps[31] = 2;
  const { adapter, state } = installed(id, s);
  let packet = adapter.exportPattern(); assert.equal(packet.lengthBeats, 8); assert.equal(packet.notes.length, 2);
  assert.equal(packet.notes[1].beat, 7.75); assert.equal(packet.notes[1].velocity, 1);
  state().stepCount = 16; packet = adapter.exportPattern(); assert.equal(packet.lengthBeats, 4); assert.equal(packet.notes.length, 1);
  assert.equal(state().tracks[0].steps[31], 2); state().stepCount = 32; assert.equal(adapter.exportPattern().notes.length, 2);
});

check('DICER: second-bar slices retain pitch, ratchets, and timing in portable notes', () => {
  const hit = { on: false, slice: 0, velocity: .8, probability: 1, ratchet: 1, pitch: 0, gate: .8, micro: 0 };
  const s = { name: 'Two-bar slices', tempo: 120, swing: 0, selectedPattern: 0,
    patterns: Array.from({ length: 4 }, () => ({ length: 32, steps: Array.from({ length: 32 }, () => ({ ...hit })) })) };
  s.patterns[0].steps[31] = { ...hit, on: true, slice: 7, pitch: 12, velocity: .9, ratchet: 2 };
  const { adapter, state } = installed('ravel', s); const packet = adapter.exportPattern();
  assert.equal(packet.lengthBeats, 8); assert.equal(packet.notes.length, 2);
  assert.equal(packet.notes[0].beat, 7.75); assert.equal(packet.notes[1].beat, 7.875);
  assert.equal(packet.notes[0].voice, 'slice-7'); assert.equal(packet.notes[0].pitch, 79);
  state().patterns[0].length = 16; assert.equal(adapter.exportPattern().notes.length, 0);
  assert.equal(state().patterns[0].steps[31].slice, 7);
});

check('REDUCE: source patterns export all 32 steps and preserve the dormant second half', () => {
  const s = { name: 'Two-bar network', tempo: 120, swing: 0, patternLength: 32,
    sources: Array.from({ length: 4 }, (_, i) => ({ name: 'Source ' + i, pitch: 48 + i, kind: 'sample', decay: 80, mute: false,
      steps: Array.from({ length: 32 }, () => ({ on: false, velocity: .8, probability: 1, ratchet: 1 })) })) };
  s.sources[2].steps[31].on = true;
  const { adapter, state } = installed('mire', s, true); const packet = adapter.exportPattern();
  assert.equal(packet.lengthBeats, 8); assert.equal(packet.notes[0].beat, 7.75); assert.equal(packet.notes[0].voice, '2');
  state().patternLength = 16; assert.equal(adapter.exportPattern().notes.length, 0); assert(state().sources[2].steps[31].on);
});

check('SKEWER: bank B plays absolute pitches while original string patterns remain separate', () => {
  const lanes = Array.from({ length: 4 }, (_, i) => ({ name: 'String ' + i, mute: false, solo: false, decay: .2,
    length: 16, division: '1/16', direction: 'forward', evolve: 0,
    steps: Array.from({ length: 32 }, () => ({ on: false, degree: 0, velocity: .8, probability: 1 })) }));
  const banks = Array.from({ length: 4 }, () => ({ length: 32,
    lanes: Array.from({ length: 4 }, () => ({ steps: Array.from({ length: 32 }, () => ({ on: false, note: 60, velocity: .8, probability: 1 })) })) }));
  banks[1].lanes[2].steps[31] = { on: true, note: 72, velocity: .65, probability: .75 };
  const s = { name: 'Straight strings', tempo: 120, root: 48, swing: 0, seed: 3, evolution: false,
    sequenceMode: 'pattern', lanes, pattern: { selected: 1, banks } };
  const { adapter, state } = installed('bower', s, true); let packet = adapter.exportPattern();
  assert.equal(packet.lengthBeats, 8); assert.equal(packet.notes.length, 1);
  assert.equal(packet.notes[0].beat, 7.75); assert.equal(packet.notes[0].pitch, 72); assert.equal(packet.notes[0].probability, .75);
  state().root = 60; assert.equal(adapter.exportPattern().notes[0].pitch, 72, 'Absolute notes do not follow the native scale root');
  state().pattern.selected = 0; assert.equal(adapter.exportPattern().notes.length, 0);
  state().sequenceMode = 'strings'; packet = adapter.exportPattern(); assert.equal(packet.lengthBeats, 16); assert.equal(packet.notes.length, 0);
  assert.equal(state().pattern.banks[1].lanes[2].steps[31].note, 72);
});

check('STEAM: step-pattern banks use discrete live notes while painting keeps continuous transport', () => {
  const patternBanks = Array.from({ length: 4 }, () => ({ length: 32, gate: .5, score: score(24) }));
  patternBanks[1].score[3][31] = .7;
  const s = { name: 'Band steps', tempo: 120, sequenceMode: 'pattern', selectedPattern: 1,
    patternBanks, score: score(24), direction: 'forward', bars: 1 };
  const { adapter, state } = installed('haze', s, true); const packet = adapter.exportPattern();
  assert.equal(adapter.patternImport.mode, 'notes'); assert.equal(packet.lengthBeats, 8);
  assert.equal(packet.notes[0].beat, 7.75); assert.equal(packet.notes[0].voice, '3');
  assert.equal(packet.notes[0].duration, .125); assert.equal(packet.notes[0].velocity, .7);
  state().selectedPattern = 0; assert.equal(adapter.exportPattern().notes.length, 0);
  state().sequenceMode = 'native'; assert.equal(adapter.patternImport.mode, 'bands');
  assert.equal(adapter.exportPattern().lengthBeats, 4); assert.equal(state().patternBanks[1].score[3][31], .7);
});

check('ROTISSERIE: gated deck patterns use discrete live notes while original loops keep continuous transport', () => {
  const patternBanks = Array.from({ length: 4 }, () => ({ length: 32, gate: .75, score: score(4) }));
  patternBanks[2].score[1][31] = .9;
  const s = { name: 'Tape steps', tempo: 120, sequenceMode: 'pattern', selectedPattern: 2, patternBanks,
    decks: Array.from({ length: 4 }, (_, i) => ({ name: 'Tape ' + i, mute: false, solo: false, beats: 4 })), assets: [{}, {}, {}, {}] };
  const { adapter, state } = installed('spool', s); const packet = adapter.exportPattern();
  assert.equal(adapter.patternImport.mode, 'drums'); assert.equal(packet.lengthBeats, 8);
  assert.equal(packet.notes.length, 1); assert.equal(packet.notes[0].beat, 7.75);
  assert.equal(packet.notes[0].voice, 'deck-1'); assert.equal(packet.notes[0].duration, .1875);
  state().patternBanks[2].length = 16; assert.equal(adapter.exportPattern().notes.length, 0);
  state().sequenceMode = 'native'; assert.equal(adapter.patternImport.mode, 'decks');
  assert.equal(adapter.exportPattern().notes.length, 4); assert.equal(state().patternBanks[2].score[1][31], .9);
});

console.log('Passed ' + checks.length + ' native sequencing adapter checks:\n' + checks.map(name => '  ✓ ' + name).join('\n'));
