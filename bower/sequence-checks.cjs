'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ window: {}, Blob, Float32Array, ArrayBuffer, DataView, DOMException, setTimeout, clearTimeout });
for (const file of ['schema.js', 'presets.js', 'audio-engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context, { filename: file });
const { BowerSchema: S, BowerDSP: DSP, BowerAudio: Audio, BowerPresets: presets } = context.window;
const plain = value => JSON.parse(JSON.stringify(value));
const state = S.normalize(presets[0].state);
assert.equal(state.sequenceMode, 'strings');
assert.equal(state.lanes[0].steps.length, 32);
assert(state.lanes.every(l => l.steps.slice(16).every(st => !st.on)));
const legacy = plain(state); delete legacy.pattern; delete legacy.sequenceMode;
legacy.lanes.forEach(l => l.steps = l.steps.slice(0, 16));
const imported = S.parseProject(JSON.stringify({ format: 'bower-project', formatVersion: 1, state: legacy }));
assert.equal(imported.sequenceMode, 'strings');
assert.deepEqual(plain(imported.lanes[0].steps.slice(0, 16)), legacy.lanes[0].steps);
assert.equal(imported.pattern.banks[0].lanes[0].steps[0].note, S.degreeMidi(imported, 0, legacy.lanes[0].steps[0].degree));
assert(imported.pattern.banks.slice(1).every(b => b.lanes.every(l => l.steps.every(st => !st.on))));

// A second-page hit must reach audio, rather than only surviving the editor.
state.tempo = 120; state.swing = 0; state.humanize = 0; state.evolution = true;
state.sequenceMode = 'pattern'; state.pattern.selected = 2;
state.pattern.banks[2].length = 32;
state.pattern.banks[2].lanes[0].steps[31] = { on: true, note: 79, velocity: .9, probability: 1 };
state.lanes[0].direction = 'reverse'; state.lanes[0].division = '1/2'; state.lanes[0].evolve = 1;
const nativeBefore = plain(state.lanes), core = new DSP.Core(8000, state), notes = [];
core.pluck = (lane, degree, velocity, note, duration) => notes.push({ lane, note, velocity, duration, frame: core.frame });
core.start(); core.processBlock(new Float32Array(33000), new Float32Array(33000));
assert.deepEqual(notes, [{ lane: 0, note: 79, velocity: .9, duration: .125, frame: 31000 }]);
assert.deepEqual(plain(core.state.lanes), nativeBefore);
assert.equal(core.positions[0], 0); // wraps only after visiting all 32 steps
const roundtrip = S.parseProject(S.serialize(state));
assert.deepEqual(plain(roundtrip.pattern), plain(state.pattern));
roundtrip.pattern.banks[2].length = 16;
assert.equal(S.normalize(roundtrip).pattern.banks[2].lanes[0].steps[31].note, 79);
roundtrip.pattern.banks[2].length = 32;
roundtrip.pattern.selected = 1;
assert(S.normalize(roundtrip).pattern.banks[1].lanes.every(l => l.steps.every(st => !st.on)));
const broken = JSON.parse(S.serialize(state)); broken.state.pattern.banks[0].lanes[0].steps.pop();
assert.throws(() => S.parseProject(JSON.stringify(broken)), /incomplete/);
for (const patch of [{note:79.5},{note:23},{note:101},{velocity:.01},{velocity:1.1},{probability:-.1},{probability:1.1}]) {
  const invalid = JSON.parse(S.serialize(state)); Object.assign(invalid.state.pattern.banks[2].lanes[0].steps[31], patch);
  assert.throws(() => S.parseProject(JSON.stringify(invalid)), /incomplete/, JSON.stringify(patch));
}
const incompleteNative = { format:'bower-project', formatVersion:1, state:plain(legacy) }; incompleteNative.state.lanes[0].length=32;
assert.throws(() => S.parseProject(JSON.stringify(incompleteNative)), /complete/);

// The last swung step has the same gate standalone and when shared with GALLEY.
const fixture = S.normalize(state); fixture.swing=.4;
const gates = [], gateCore = new DSP.Core(8000, fixture);
gateCore.pluck = (lane, degree, velocity, note, duration) => gates.push({lane,note,duration});
gateCore.start(); gateCore.processBlock(new Float32Array(32000),new Float32Array(32000));
assert.equal(gates.length, 1); assert.equal(gates[0].note,79);
const adapterScope = { Math, Number, JSON, Map, Set, DOMException, TextEncoder, TextDecoder, setTimeout, clearTimeout, setInterval, clearInterval,
  document:{addEventListener(){},dispatchEvent(){}},CustomEvent:class{},BowerSchema:S,
  BowerApp:{getState:()=>plain(fixture),engine:{state:plain(fixture),setState(){},start(){},stop(){},panic(){},stopNotes(){}}} };
adapterScope.window=adapterScope;vm.createContext(adapterScope);
for (const file of ['pattern-schema.js','pattern-pitched.js']) vm.runInContext(fs.readFileSync(path.join(root,'shared',file),'utf8'),adapterScope);
const exported = adapterScope.MusicLabPatternInstrument.exportPattern(); assert.equal(exported.notes.length,1);
const exportedSeconds=exported.notes[0].duration*60/fixture.tempo;
assert(Math.abs(gates[0].duration-exportedSeconds)<1e-9, 'Native and portable gates agree at the swung bank boundary.');
assert(Math.abs(gates[0].duration-.1)<1e-9);

const native = S.normalize(state); native.sequenceMode = 'strings'; native.evolution = false;
native.lanes.forEach(l => { l.length = 32; l.division = '1/16'; l.direction = 'forward'; l.steps.forEach(st => st.on = false); });
native.lanes[1].steps[31].on = true;
const nativeCore = new DSP.Core(8000, native), nativeHits = [];
nativeCore.pluck = (lane, degree) => nativeHits.push({ lane, degree, frame: nativeCore.frame });
nativeCore.start(); nativeCore.processBlock(new Float32Array(32000), new Float32Array(32000));
assert.deepEqual(nativeHits, [{ lane: 1, degree: native.lanes[1].steps[31].degree, frame: 31000 }]);
assert.equal(S.euclidean(32, 11).slice(0, 32).filter(Boolean).length, 11);
(async () => {
  const renderState = S.normalize(state); renderState.lanes.forEach(l => { l.mute = false; l.solo = false; });
  const wav = await new Audio(renderState).renderWav(2, 0), bytes = new DataView(await wav.arrayBuffer());
  assert.equal(bytes.getUint32(40, true), 48000 * 4 * 4);
  let firstPagePeak = 0, secondPagePeak = 0;
  for (let frame = 0; frame < 48000 * 4; frame++) {
    const amplitude = Math.abs(bytes.getInt16(44 + frame * 4, true));
    if (frame < 48000 * 2) firstPagePeak = Math.max(firstPagePeak, amplitude); else secondPagePeak = Math.max(secondPagePeak, amplitude);
  }
  assert.equal(firstPagePeak, 0); assert(secondPagePeak > 100);
  console.log('PASS SKEWER: legacy import, four bank persistence, 32-step native/pattern timing, independent clocks retained, and second-page WAV audio.');
})().catch(error => { console.error(error); process.exitCode = 1; });
