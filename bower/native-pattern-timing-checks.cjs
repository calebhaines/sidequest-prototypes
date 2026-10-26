/* Native SKEWER sequencing and portable capture must consume the same clock
 * and PRNG, including string excitation, humanization and probability. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const scope = { window: {}, Blob, Float32Array, Float64Array, ArrayBuffer, DataView, DOMException, setTimeout, clearTimeout };
vm.createContext(scope);
for (const file of ['schema.js', 'presets.js', 'audio-engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), scope, { filename: file });
const { BowerSchema: S, BowerDSP: DSP, BowerPresets: presets } = scope.window;
const plain = value => JSON.parse(JSON.stringify(value));
function nativeEvents(state, sr, beats) {
  const core = new DSP.Core(sr, state), result = [], pluck = core.pluck;
  core.pluck = function(laneIndex, degree, velocity, note, duration, source) {
    const lane = this.lanes[laneIndex], solo = this.lanes.some(lane => lane.solo);
    if (!lane.mute && (!solo || lane.solo)) result.push({ lane: laneIndex, note: note ?? this.degreeMidi(laneIndex, degree), velocity,
      beat: this.frame / this.stepsPerBeat, durationBeats: (duration ?? lane.decay) * this.tempo / 60 });
    return pluck.call(this, laneIndex, degree, velocity, note, duration, source);
  };
  core.start();
  const frames = Math.round(beats * core.stepsPerBeat);
  for (let at = 0; at < frames; at += 128) {
    const size = Math.min(128, frames - at); core.processBlock(new Float32Array(size), new Float32Array(size));
  }
  return result;
}
let cases = 0;
for (const preset of presets) {
  const state = S.normalize(preset.state), before = JSON.stringify(state), sr = 8000;
  assert.deepEqual(plain(DSP.captureEvents(sr, state, 16)), plain(nativeEvents(state, sr, 16)), preset.name + ' captures actual native scheduling and all excitation PRNG draws');
  assert.equal(JSON.stringify(state), before, 'Capturing leaves the native patch and sequence unchanged'); cases++;
}
const generative = S.defaultState(); generative.tempo = 151; generative.humanize = .045; generative.evolution = true;
generative.lanes.forEach((lane, index) => { lane.direction = index % 2 ? 'random' : 'pendulum'; lane.evolve = .75; lane.steps.forEach((step, at) => { step.on = at % 2 === 0; step.probability = .63; }); });
generative.lanes[3].mute = true;
assert.deepEqual(plain(DSP.captureEvents(48000, generative, 4)), plain(nativeEvents(generative, 48000, 4)), 'Maximum humanization, evolving/random lanes, probability and muted-lane PRNG agree'); cases++;
const bank = S.normalize(generative); bank.sequenceMode = 'pattern'; bank.pattern.banks[0].length = 32; bank.swing = .4;
assert.deepEqual(plain(DSP.captureEvents(48000, bank, 8)), plain(nativeEvents(bank, 48000, 8)), 'Pattern mode follows its real timing and gate lengths'); cases++;

// The adapter uses the real capture, then filters a lane after all voices have
// consumed their RNG. Changing the export scope must never move its notes.
let fixture = generative;
const adapterScope = { Math, Number, JSON, Map, Set, DOMException, TextEncoder, TextDecoder, setTimeout, clearTimeout, setInterval, clearInterval,
  document: { addEventListener() {}, dispatchEvent() {} }, CustomEvent: class {}, BowerSchema: S, BowerDSP: DSP,
  BowerApp: { getState: () => plain(fixture), engine: { state: plain(generative), setState() {}, start() {}, stop() {}, panic() {}, stopNotes() {} } } };
adapterScope.window = adapterScope; vm.createContext(adapterScope);
const shared = fs.existsSync(path.join(__dirname, 'shared', 'pattern-schema.js')) ? path.join(__dirname, 'shared') : path.join(__dirname, '..', 'shared');
for (const file of ['pattern-schema.js', 'pattern-pitched.js']) vm.runInContext(fs.readFileSync(path.join(shared, file), 'utf8'), adapterScope);
const adapter = adapterScope.MusicLabPatternInstrument, all = plain(adapter.exportPattern()), lane = plain(adapter.exportPattern({ scope: 'voice-1' }));
const strip = note => ({ beat: note.beat, pitch: note.pitch, velocity: note.velocity, duration: note.duration, probability: note.probability });
assert.deepEqual(lane.notes.map(strip), all.notes.filter(note => note.voice === '1').map(strip));
assert(all.notes.some(note => Math.abs(note.beat * 4 - Math.round(note.beat * 4)) > .001), 'The portable packet retains audible native humanization');

// Authored banks stay an editable probabilistic score. They do not use native
// humanization and must not be replaced with a single realized performance.
fixture = S.normalize(bank); fixture.sequenceMode = 'pattern'; fixture.pattern.selected = 0;
fixture.pattern.banks[0].lanes.forEach(lane => lane.steps.forEach(step => { step.on = false; }));
fixture.lanes.forEach(lane => { lane.mute = false; lane.solo = false; });
fixture.pattern.banks[0].lanes[0].steps[3] = { on: true, note: 64, velocity: .6, probability: .01 };
const authored = plain(adapter.exportPattern());
assert.equal(authored.notes.length, 1, 'A low-probability authored hit remains present in the portable score');
assert.equal(authored.notes[0].probability, .01, 'Authored per-step probability stays editable');
assert.equal(authored.notes[0].pitch, 64);
console.log('PASS SKEWER native/portable timing: ' + cases + ' real DSP scenarios; exact generative humanization, probability, seeded excitation chronology, scope/source preservation, and editable authored probability.');
