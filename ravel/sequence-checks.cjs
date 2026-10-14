'use strict';
// Run: node ravel/sequence-checks.cjs. Native DSP and portable state, no browser fixture engine.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const scope = { console, Float32Array, Uint8Array, ArrayBuffer, DataView, Math, Number, JSON, Map, Set,
  DOMException, Blob, URL, atob, btoa, setTimeout, clearTimeout };
scope.window = scope; vm.createContext(scope);
for (const file of ['schema.js', 'presets.js', 'audio-engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), scope, { filename: file });
const S = scope.RavelSchema, DSP = scope.RavelDSP, sampleRate = 48000;
const pcm = Float32Array.from({ length: sampleRate * 2 }, (_, i) => Math.sin(Math.floor(i / 2) * Math.PI * 880 / sampleRate) * .5);
const sample = { pcm, sampleRate }, plain = value => JSON.parse(JSON.stringify(value));
function render(core, frames) {
  const left = new Float32Array(frames), right = new Float32Array(frames);
  for (let at = 0; at < frames; at += 128) core.processBlock(left.subarray(at, Math.min(frames, at + 128)), right.subarray(at, Math.min(frames, at + 128)));
  return left;
}
function peak(audio) { let result = 0; for (const value of audio) { assert(Number.isFinite(value)); result = Math.max(result, Math.abs(value)); } return result; }
(async () => {
  const legacy = plain(scope.RavelPresets[0].state);
  for (const pattern of legacy.patterns) { delete pattern.length; pattern.steps = pattern.steps.slice(0, 16); }
  const loaded = S.parseProject(JSON.stringify({ format: 'ravel-project', formatVersion: 1, state: legacy }));
  assert(loaded.patterns.every(pattern => pattern.length === 16 && pattern.steps.length === 32 && pattern.steps.slice(16).every(step => !step.on)));
  const oldCore = DSP.createCore(legacy, sample, sampleRate), compatibleCore = DSP.createCore(loaded, sample, sampleRate);
  oldCore.start(); compatibleCore.start(); assert.deepEqual(render(oldCore, 120000), render(compatibleCore, 120000));
  console.log('PASS legacy sixteen-step projects retain sample-identical playback and silent added capacity');

  const state = S.defaultState(); state.tempo = 120; state.swing = 0;
  state.asset = scope.RavelAudio.encodePCM(pcm, sampleRate, 'Sequence test tone');
  state.patterns.forEach(pattern => pattern.steps.forEach(step => step.on = false));
  Object.assign(state.patterns[0], { length: 32 });
  Object.assign(state.patterns[0].steps[20], { on: true, slice: 0, gate: .8 });
  Object.assign(state.patterns[0].steps[31], { on: true, slice: 0, gate: .8, pitch: 7 });
  state.sample.fade = 0; state.master.echo = state.master.space = state.master.drive = 0;
  const core = DSP.createCore(state, sample, sampleRate); core.start();
  assert.equal(core.nextBar, 192000); assert.equal(core.events.filter(event => event.marker).length, 32);
  assert.deepEqual(plain(core.events.filter(event => event.settings).map(event => event.frame)), [120000, 186000]);
  const audio = render(core, 192000); assert.equal(peak(audio.subarray(0, 120000)), 0);
  assert(peak(audio.subarray(120000, 125000)) > .01); assert(peak(audio.subarray(186000)) > .01);
  assert.equal(core.lastStep, 31); assert.equal(core.triggered, 2);
  console.log('PASS steps 21 and 32 schedule at their exact sixteenth-note positions in the native DSP');

  state.patterns[0].length = 16;
  const restored = S.parseProject(S.serializeProject(state));
  assert.deepEqual(plain(restored.patterns[0].steps[31]), plain(state.patterns[0].steps[31]));
  assert.equal(restored.patterns[0].length, 16); restored.patterns[0].length = 32;
  assert.equal(S.parseProject(S.serializeProject(restored)).patterns[0].length, 32);
  for (const edit of [project => project.state.patterns[0].steps.pop(), project => project.state.patterns[0].length = 17,
    project => project.state.patterns[0].steps = project.state.patterns[0].steps.slice(0, 16)]) {
    const project = JSON.parse(S.serializeProject(restored)); edit(project); assert.throws(() => S.parseProject(JSON.stringify(project)));
  }
  console.log('PASS shortened patterns preserve hidden steps through portable projects and reject incomplete capacity');

  const chained = S.normalize(restored); chained.chain = true;
  const chainCore = DSP.createCore(chained, sample, sampleRate); chainCore.start(); chainCore.scheduleBar();
  assert.equal(chainCore.pattern, 1); assert.equal(chainCore.nextBar, 288000);
  const queued = DSP.createCore(restored, sample, sampleRate); queued.start(); queued.setState({ ...restored, selectedPattern: 2 });
  assert.equal(queued.pattern, 0); assert.equal(queued.pending, 2); queued.scheduleBar();
  assert.equal(queued.pattern, 2); assert.equal(queued.nextBar, 288000);
  console.log('PASS Chain and queued bank changes respect each playing pattern length');

  const engine = new scope.RavelAudio(restored), before = S.serializeProject(engine.state);
  const blob = await engine.renderWav(2, 0), wave = new DataView(await blob.arrayBuffer());
  assert.equal(wave.getUint32(40, true), 192000 * 4); let laterPeak = 0;
  for (let at = 44 + 186000 * 4; at < wave.byteLength; at += 2) laterPeak = Math.max(laterPeak, Math.abs(wave.getInt16(at, true) / 32768));
  assert(laterPeak > .01); assert.equal(S.serializeProject(engine.state), before);
  console.log('PASS two-bar WAV includes step 32 and preserves the live project');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
