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
for (const filename of ['vocal-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'effects.js', 'audio-engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, filename), 'utf8'), scope, { filename });
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

function latencyFixture(options = {}) {
  scope.performance.now = () => 10000;
  const state = session(); state.recording = { micCompensation: 'auto', micOffsetMs: 0, ...options.recording };
  const engine = new scope.LoomAudio(state); engine.mode = options.mode || 'worklet'; engine._processingFrames = options.processingFrames || 128;
  engine.context = { state: 'running', currentTime: 10.2, sampleRate: 48000, baseLatency: .01, outputLatency: .02, ...options.context };
  engine._mic = { stream: { getAudioTracks: () => [{ getSettings: () => ({ latency: .04, ...options.input }) }] } };
  return engine;
}
function near(actual, expected) { assert(Math.abs(actual - expected) < 1e-8, `${actual} should equal ${expected}`); }

check('An output timestamp replaces reported output delays and includes render buffering exactly once', () => {
  const engine = latencyFixture({ recording: { micOffsetMs: 5 }, context: { getOutputTimestamp: () => ({ contextTime: 10, performanceTime: 9950 }) } });
  const estimate = engine.getMicrophoneLatency(); near(estimate.outputMs, 150); near(estimate.compensationMs, 195);
  near(estimate.processingMs, 128 / 48); assert.equal(estimate.outputSource, 'timestamp'); assert.equal(estimate.estimateComplete, true);
});

check('Reported output fallback never adds the Worklet or ScriptProcessor block a second time', () => {
  for (const [mode, frames] of [['worklet', 128], ['fallback', 256], ['fallback', 512], ['fallback', 1024]]) {
    const engine = latencyFixture({ mode, processingFrames: frames, recording: { micOffsetMs: 5 } }), estimate = engine.getMicrophoneLatency();
    near(estimate.outputMs, 30); near(estimate.compensationMs, 75); near(estimate.processingMs, frames / 48);
    assert.equal(estimate.outputSource, 'reported'); assert.equal(estimate.estimateComplete, true);
  }
});

check('Malformed, unstarted, stale, future and suspended output timestamps fall back safely', () => {
  const invalid = [
    { contextTime: 10.1 }, { contextTime: 10.1, performanceTime: NaN }, { contextTime: NaN, performanceTime: 10000 },
    { contextTime: 0, performanceTime: 10000 }, { contextTime: 10.1, performanceTime: 0 },
    { contextTime: 9.5, performanceTime: 9600 }, { contextTime: 10.1, performanceTime: 10001 },
    { contextTime: 10.3, performanceTime: 10000 }, { contextTime: 8, performanceTime: 10000 }
  ];
  for (const stamp of invalid) {
    const estimate = latencyFixture({ context: { getOutputTimestamp: () => stamp } }).getMicrophoneLatency();
    near(estimate.compensationMs, 70); assert.equal(estimate.outputSource, 'reported');
  }
  for (const state of ['suspended', 'closed', 'interrupted']) {
    const estimate = latencyFixture({ context: { state, getOutputTimestamp: () => ({ contextTime: 10.1, performanceTime: 10000 }) } }).getMicrophoneLatency();
    near(estimate.compensationMs, 70); assert.equal(estimate.outputSource, 'reported');
  }
  const thrown = latencyFixture({ context: { getOutputTimestamp() { throw Error('Unavailable'); } } }).getMicrophoneLatency();
  near(thrown.compensationMs, 70);
});

check('Nonmonotonic output mappings are rejected, while a new AudioContext resets the timestamp history', () => {
  let stamp = { contextTime: 10, performanceTime: 9950 };
  const engine = latencyFixture({ context: { getOutputTimestamp: () => stamp } }); assert.equal(engine.getMicrophoneLatency().outputSource, 'timestamp');
  stamp = { contextTime: 9.99, performanceTime: 9970 }; assert.equal(engine.getMicrophoneLatency().outputSource, 'reported');
  stamp = { contextTime: 10.05, performanceTime: 9940 }; assert.equal(engine.getMicrophoneLatency().outputSource, 'reported');
  engine.context = { ...engine.context }; assert.equal(engine.getMicrophoneLatency().outputSource, 'timestamp');
});

check('Initialized near-zero timestamp gaps and reported zero delays remain valid without fabricated latency', () => {
  const engine = latencyFixture({ input: { latency: 0 }, context: { getOutputTimestamp: () => ({ contextTime: 10.15, performanceTime: 9950 }) } });
  const estimate = engine.getMicrophoneLatency(); near(estimate.outputMs, 0); near(estimate.compensationMs, 0); assert.equal(estimate.outputSource, 'timestamp');
  const zero = latencyFixture({ input: { latency: 0 }, context: { baseLatency: 0, outputLatency: 0 } }).getMicrophoneLatency();
  near(zero.compensationMs, 0); assert.equal(zero.estimateComplete, true); assert.equal(zero.reportedInput, true);
});

check('Unknown and invalid device delays stay partial and contribute no guessed processing block', () => {
  for (const missing of [undefined, null, NaN, Infinity, -1, '0.02', 1.01]) {
    const estimate = latencyFixture({ input: { latency: missing }, context: { baseLatency: missing, outputLatency: missing } }).getMicrophoneLatency();
    near(estimate.compensationMs, 0); assert.equal(estimate.reportedInput, false); assert.equal(estimate.reportedOutput, false); assert.equal(estimate.outputSource, 'unreported'); assert.equal(estimate.estimateComplete, false);
  }
  const partial = latencyFixture({ context: { outputLatency: undefined } }).getMicrophoneLatency();
  near(partial.compensationMs, 50); assert.equal(partial.reportedOutput, true); assert.equal(partial.outputComplete, false); assert.equal(partial.estimateComplete, false);
});

check('Manual and Off alignment ignore all automatic terms and preserve signed offsets exactly', () => {
  const engine = latencyFixture({ context: { getOutputTimestamp: () => ({ contextTime: 10, performanceTime: 9950 }) } });
  for (const offset of [-500, -80, 0, 123.5, 500]) {
    engine.state.recording.micCompensation = 'manual'; engine.state.recording.micOffsetMs = offset; assert.equal(engine.getMicrophoneLatency().compensationMs, offset);
    engine.state.recording.micCompensation = 'off'; assert.equal(engine.getMicrophoneLatency().compensationMs, 0);
  }
  engine.state.recording.micCompensation = 'auto'; engine.state.recording.micOffsetMs = -200; near(engine.getMicrophoneLatency().compensationMs, -10);
});

check('Known round-trip impulses align to the exact performance frames in both recording modes', () => {
  const sampleRate = 48000, logicalStart = 500, length = 2000, physicalDelay = 1440;
  for (const [mode, block] of [['worklet', 128], ['fallback', 512]]) {
    const engine = latencyFixture({ mode, processingFrames: block, input: { latency: .01 }, context: { currentTime: 10, getOutputTimestamp: () => ({ contextTime: 9.98, performanceTime: 10000 }) } });
    const compensationFrames = Math.round(engine.getMicrophoneLatency().compensationMs * sampleRate / 1000); assert.equal(compensationFrames, physicalDelay);
    const chunks = [], recorder = new DSP.Recorder(sampleRate, chunk => chunks.push(chunk));
    recorder.start(20, [3], 0, sampleRate, { requireTransport: true, countInBeats: 1, microphone: { inputIndex: 8, compensationFrames } });
    function feed(start, count) {
      for (let at = start; at < start + count; at += block) {
        const n = Math.min(block, start + count - at), list = Array.from({ length: 9 }, () => [new Float32Array(n), new Float32Array(n)]);
        for (let f = 0; f < n; f++) for (const hit of [137, 1709]) if (at + f === logicalStart + physicalDelay + hit) { list[8][0][f] = .7; list[8][1][f] = -.3; }
        recorder.capture(list, n, { timelineBeats: Float64Array.from({ length: n }, (_, f) => Math.max(0, at + f - logicalStart) / 24000), timelineCountIn: Uint8Array.from({ length: n }, (_, f) => at + f < logicalStart ? 1 : 0), timelinePlaying: new Uint8Array(n).fill(1) });
      }
    }
    feed(0, logicalStart + length); assert.equal(recorder.stop(41).pending, true); feed(logicalStart + length, physicalDelay);
    const left = flattened(chunks), right = flattened(chunks, 'right'); assert.equal(left.length, length);
    assert.deepEqual(Array.from(left.keys()).filter(index => left[index]), [137, 1709]);
    for (const hit of [137, 1709]) { near(left[hit], Math.fround(.7)); near(right[hit], Math.fround(-.3)); }
  }
});

for (const name of passed) console.log('PASS', name);
console.log(`${passed.length} microphone engine checks passed.`);
