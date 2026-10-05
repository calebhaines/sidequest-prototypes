'use strict';

// Sample-level microphone timing and routing checks. Browser device/routing
// checks live in microphone-browser-checks.cjs; this suite needs only Node.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const scope = { Blob, DOMException, TextEncoder, Math, Number, Map, Set, Promise, setTimeout, navigator: {}, performance: { now: () => 10000 } };
scope.window = scope;
vm.createContext(scope);
for (const filename of ['effects-catalog.js', 'effects.js', 'audio-engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, filename), 'utf8'), scope, { filename });
const DSP = scope.createLoomEngineDSP(scope.createLoomEffectsDSP);
const rate = 8000;
const passed = [];
function check(name, run) { run(); passed.push(name); }
function pcm(index) { return index < 0 ? 0 : (index + 1) / 100000; }
function inputs(at, n, microphone = true) {
  const list = Array.from({ length: 9 }, () => [new Float32Array(n), new Float32Array(n)]);
  list[3][0].fill(-.75); list[3][1].fill(.55);
  if (microphone) for (let f = 0; f < n; f++) { list[8][0][f] = pcm(at + f); list[8][1][f] = -pcm(at + f); }
  return list;
}
function flattened(chunks, side = 'left') { return Float32Array.from(chunks.flatMap(chunk => Array.from(chunk[side]))); }
function expectedPcm(first, count) { return Float32Array.from({ length: count }, (_, index) => pcm(first + index)); }
function recorderFixture(compensationFrames, preRoll = 0) {
  const chunks = [], limits = [];
  const recorder = new DSP.Recorder(rate, chunk => chunks.push(chunk), info => limits.push(info));
  if (preRoll) recorder.capture(inputs(0, preRoll), preRoll);
  return { recorder, chunks, limits };
}
function scheduledPunch(compensationFrames) {
  const fixture = recorderFixture(compensationFrames, 1000), { recorder } = fixture;
  const schedule = { countInBeats: 1, punchEnabled: true, punchStart: .25, punchEnd: .5, requireTransport: true, microphone: { inputIndex: 8, compensationFrames } };
  recorder.start(11, [3], 0, rate * 120, schedule);
  for (let at = 0; at < 2900; at += 137) {
    const n = Math.min(137, 2900 - at), beats = Float64Array.from({ length: n }, (_, f) => Math.max(0, at + f - 500) / 4000);
    recorder.capture(inputs(1000 + at, n), n, { timelineBeats: beats, timelineCountIn: Uint8Array.from({ length: n }, (_, f) => at + f < 500 ? 1 : 0), timelinePlaying: new Uint8Array(n).fill(1) });
  }
  return fixture;
}

for (const offset of [-80, 0, 80]) check(`Signed ${offset}-frame compensation preserves the exact count-in/punch source window`, () => {
  const { chunks, limits } = scheduledPunch(offset), result = flattened(chunks);
  assert.equal(result.length, 1000);
  assert.deepEqual(result, expectedPcm(2500 + offset, 1000));
  assert.deepEqual(flattened(chunks, 'right'), Float32Array.from(result, value => -value));
  assert.equal(limits.length, 1); assert.equal(limits[0].reason, 'punch'); assert.equal(limits[0].startBeat, .25);
  assert(chunks.every(chunk => chunk.trackIndex === 3));
});

check('Positive compensation finishes with bounded post-roll and retains the final transient', () => {
  const { recorder, chunks, limits } = recorderFixture(80);
  recorder.start(12, [3], 0, rate * 120, { microphone: { inputIndex: 8, compensationFrames: 80 } });
  recorder.capture(inputs(0, 400), 400);
  assert.equal(recorder.stop(31).pending, true);
  recorder.capture(inputs(400, 80), 80);
  assert.deepEqual(flattened(chunks), expectedPcm(80, 400));
  assert.equal(limits.length, 1); assert.equal(limits[0].stopId, 31); assert.equal(limits[0].frames, 400);
});

check('A negative take at absolute zero pads only missing history and keeps the attack', () => {
  const { recorder, chunks } = recorderFixture(-80);
  recorder.start(13, [3], 0, rate * 120, { microphone: { inputIndex: 8, compensationFrames: -80 } });
  recorder.capture(inputs(0, 400), 400); assert.equal(recorder.stop().frames, 400);
  assert.deepEqual(flattened(chunks), Float32Array.from({ length: 400 }, (_, f) => pcm(f - 80)));
});

check('Continuous monitoring supplies signed pre-roll, while replacing the physical stream clears its history', () => {
  const { recorder, chunks } = recorderFixture(-80, 1000);
  recorder.start(14, [3], 2, rate * 120, { microphone: { inputIndex: 8, compensationFrames: -80 } });
  recorder.capture(inputs(1000, 200), 200); recorder.stop();
  assert.deepEqual(flattened(chunks), expectedPcm(920, 200));
  chunks.length = 0; recorder.clearMicrophoneHistory();
  recorder.start(15, [3], 2, rate * 120, { microphone: { inputIndex: 8, compensationFrames: -80 } });
  recorder.capture(inputs(1200, 200), 200); recorder.stop();
  const expected = Float32Array.from({ length: 200 }, (_, f) => f < 80 ? 0 : pcm(1200 + f - 80));
  assert.deepEqual(flattened(chunks), expected);
});

check('Stopping during count-in returns no empty microphone take or post-roll', () => {
  const { recorder, chunks, limits } = recorderFixture(80);
  recorder.start(16, [3], 0, rate * 120, { countInBeats: 4, requireTransport: true, microphone: { inputIndex: 8, compensationFrames: 80 } });
  recorder.capture(inputs(0, 400), 400, { timelineCountIn: new Uint8Array(400).fill(1), timelinePlaying: new Uint8Array(400).fill(1) });
  const stopped = recorder.stop(32); assert.equal(stopped.frames, 0); assert.equal(stopped.pending, undefined); assert.equal(chunks.length, 0); assert.equal(limits.length, 0);
});

check('The microphone recording budget counts compensated audio rather than pre/post-roll', () => {
  const { recorder, chunks, limits } = recorderFixture(80);
  recorder.start(17, [3], 0, 240, { microphone: { inputIndex: 8, compensationFrames: 80 } });
  recorder.capture(inputs(0, 480), 480);
  assert.equal(limits[0].frames, 240); assert.deepEqual(flattened(chunks), expectedPcm(80, 240));
});

function session() {
  return { tempo: 120, lengthBars: 4, loopEnabled: false, master: { level: 1, metronome: false }, tracks: Array.from({ length: 8 }, (_, i) => ({ id: `track-${i + 1}`, level: 1, pan: 0, mute: false, solo: false, instrumentLive: false, effects: Array(4).fill(null), clips: [] })) };
}
function renderCore(core, source, blocks = 20) {
  let result;
  for (let block = 0; block < blocks; block++) { const left = new Float32Array(128), right = new Float32Array(128); core.processBlock(left, right, source); result = [left, right]; }
  return result;
}
check('Stopped monitoring traverses the actual track rack once and excludes its hosted instrument', () => {
  const state = session(), source = inputs(0, 128, false); source[8][0].fill(.1); source[8][1].fill(-.08);
  state.tracks[3].effects[0] = { type: 'cinder', params: { ...scope.LoomEffectsCatalog.find(item => item.id === 'cinder').defaults, drive: 25 } };
  const monitored = new DSP.Core(state, {}, rate); monitored.setMicrophoneMonitor(3, true);
  // Record-only gates belong to hosted sources and cannot silence a dedicated mic.
  monitored.setRecordOnly(3, true);
  const reference = new DSP.Core({ ...state, tracks: state.tracks.map((track, i) => ({ ...track, instrumentLive: i === 3 })) }, {}, rate);
  const referenceInputs = Array.from({ length: 9 }, () => [new Float32Array(128), new Float32Array(128)]); referenceInputs[3] = source[8];
  const actual = renderCore(monitored, source), expected = renderCore(reference, referenceInputs);
  assert.deepEqual(actual, expected); assert(actual[0].some(sample => Math.abs(sample) > .01));
  assert.equal(monitored.tracks.length, 8); assert(monitored.slots.every(row => row.length === 4));
});

check('Count-in keeps live microphone effects audible, and mixer mute/solo remain authoritative', () => {
  const state = session(), source = inputs(0, 128, false); source[8][0].fill(.1); source[8][1].fill(.1);
  const monitor = new DSP.Core(state, {}, rate); monitor.setMicrophoneMonitor(3, true); monitor.beginRecording({ countInBeats: 4 });
  assert(renderCore(monitor, source)[0].some(value => Math.abs(value) > .03));
  const muted = session(); muted.tracks[3].mute = true; const muteCore = new DSP.Core(muted, {}, rate); muteCore.setMicrophoneMonitor(3, true); assert(renderCore(muteCore, source)[0].every(value => value === 0));
  const solo = session(); solo.tracks[0].solo = true; const soloCore = new DSP.Core(solo, {}, rate); soloCore.setMicrophoneMonitor(3, true); assert(renderCore(soloCore, source)[0].every(value => value === 0));
});

check('Automatic latency uses input plus elapsed-time-corrected output timestamp; manual/off remain exact', () => {
  const state = session(); state.recording = { micCompensation: 'auto', micOffsetMs: 5 };
  const engine = new scope.LoomAudio(state); engine.mode = 'worklet'; engine.context = { currentTime: 10.2, sampleRate: 48000, baseLatency: .01, outputLatency: .02, getOutputTimestamp: () => ({ contextTime: 10, performanceTime: 9950 }) };
  engine._mic = { stream: { getAudioTracks: () => [{ getSettings: () => ({ latency: .04 }) }] } };
  const estimate = engine.getMicrophoneLatency(); assert(Math.abs(estimate.outputMs - 150) < 1e-8); assert(Math.abs(estimate.compensationMs - (40 + 150 + 128 / 48 + 5)) < 1e-8);
  state.recording.micCompensation = 'manual'; state.recording.micOffsetMs = -80; assert.equal(engine.getMicrophoneLatency().compensationMs, -80);
  state.recording.micCompensation = 'off'; assert.equal(engine.getMicrophoneLatency().compensationMs, 0);
  state.recording.micCompensation = 'auto'; engine.context.getOutputTimestamp = () => ({ contextTime: NaN }); assert(Math.abs(engine.getMicrophoneLatency().outputMs - 30) < 1e-8);
});

for (const name of passed) console.log('PASS', name);
console.log(`${passed.length} microphone engine checks passed.`);
