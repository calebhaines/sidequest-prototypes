'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let timer = 0;
const context = vm.createContext({ window: {}, Blob, Float32Array, ArrayBuffer, DataView, DOMException, Uint8Array, atob, btoa, setTimeout: () => ++timer, clearTimeout, setInterval, clearInterval });
context.window = context;
for (const file of ['schema.js', 'presets.js', 'audio-engine.js']) vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, file), 'utf8'), context, { filename: file });
const { MireSchema: S, MireAudio: Audio, MirePresets: presets } = context.window;
const plain = value => JSON.parse(JSON.stringify(value));
const original = plain(presets[0].state); delete original.patternLength; original.sources.forEach(s => s.steps = s.steps.slice(0, 16));
const legacy = S.parseProject(JSON.stringify({ format: 'mire-project', formatVersion: 1, state: original }));
assert.equal(legacy.patternLength, 16);
assert(legacy.sources.every(s => s.steps.length === 32 && s.steps.slice(16).every(st => !st.on)));
const state = S.normalize(legacy); state.tempo = 120; state.swing = 0; state.patternLength = 32;
state.sources.forEach(s => s.steps.forEach(st => st.on = false));
state.sources[0].steps[31] = { on: true, velocity: .9, probability: 1, ratchet: 2 };
const engine = new Audio(state), events = [];
engine.context = { currentTime: 0, sampleRate: 8000 }; engine.isPlaying = true; engine._step = 0; engine._nextTime = 0; engine._send = message => { if (message.type === 'trigger') events.push(message.event); };
for (let i = 0; i < 40; i++) { engine.context.currentTime = i * .1; engine._schedule(); }
assert.deepEqual(events.map(e => ({ index: e.index, frame: e.frame, velocity: e.velocity })), [{ index: 0, frame: 31000, velocity: .9 }, { index: 0, frame: 31500, velocity: .9 * .88 }]);
const saved = S.parseProject(S.serializeProject(state)); assert.deepEqual(plain(saved), plain(state));
saved.patternLength = 16; assert.equal(S.normalize(saved).sources[0].steps[31].ratchet, 2);
assert.throws(() => S.parseProject(JSON.stringify({ format: 'mire-project', formatVersion: 1, state: { ...plain(state), patternLength: 24 } })), /16- or 32/);

context.setTimeout = setTimeout;
// Exercise the production offline renderer with no audio-device initialization.
(async () => {
  const offline = new Audio(state); offline.init = async () => {}; offline._samples = [];
  const wav = await offline.renderWav(2, 0), bytes = new DataView(await wav.arrayBuffer());
  assert.equal(bytes.getUint32(40, true), 48000 * 4 * 4);
  let firstPagePeak = 0, secondPagePeak = 0;
  for (let frame = 0; frame < 48000 * 4; frame++) {
    const amplitude = Math.abs(bytes.getInt16(44 + frame * 4, true));
    if (frame < 48000 * 2) firstPagePeak = Math.max(firstPagePeak, amplitude); else secondPagePeak = Math.max(secondPagePeak, amplitude);
  }
  assert.equal(firstPagePeak, 0); assert(secondPagePeak > 100);
  const frozen = S.normalize(state); frozen.garden.freeze = true;
  const held = new Audio(frozen); held.init = async () => {}; held._samples = [];
  const frozenWav = await held.renderWav(2, 0), frozenBytes = new DataView(await frozenWav.arrayBuffer());
  let peak = 0; for (let at = 44; at < frozenBytes.byteLength; at += 2) peak = Math.max(peak, Math.abs(frozenBytes.getInt16(at, true)));
  assert(peak > 100, 'Frozen render warms up the entire 32-step pattern, including step 32.');
  console.log('PASS REDUCE: legacy import, 32-step live ratchet timing, retained second page, WAV audio, and full-pattern Freeze warmup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
