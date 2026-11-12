'use strict';
// Exercise the production bundle and its pinned Web Audio dependency, without
// running a browser or changing the canonical instrument graphs.
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const rootArg = process.argv.indexOf('--plugin-root');
const root = rootArg >= 0 ? path.resolve(process.argv[rootArg + 1]) : path.resolve(__dirname, '..');
const requirePlugin = createRequire(path.join(root, 'package.json'));
const esbuild = requirePlugin('esbuild');
const bundled = esbuild.buildSync({ entryPoints: [path.join(root, 'js/vendor-entry.js')], bundle: true, write: false,
  platform: 'browser', format: 'iife', target: 'es2022' }).outputFiles[0].text;
const g = { console };
vm.createContext(g); vm.runInContext(bundled, g, { filename: 'kitchen-vendor.js' });
const sampleRate = 48000, quantum = 128;
function setup() {
  const context = g.KitchenWebAudio.createContext(sampleRate);
  const source = context.createConstantSource(); source.connect(context.destination);
  let ended = 0, endedAt = -1;
  source.onended = () => { ended++; endedAt = context._impl.currentSampleFrame; };
  return { context, source, get ended() { return ended; }, get endedAt() { return endedAt; } };
}
function render(context, count) {
  const frames = Math.ceil(count / quantum) * quantum, result = new Float32Array(frames);
  const channels = [new Float32Array(quantum), new Float32Array(quantum)];
  for (let at = 0; at < frames; at += quantum) {
    context._impl.process(channels, 0); result.set(channels[0], at);
    for (let i = 0; i < quantum; i++) assert.equal(channels[1][i], channels[0][i], 'mono source maps to both stereo channels');
  }
  return result;
}
function expectRange(actual, begin, end, value) {
  for (let i = 0; i < actual.length; i++) assert.equal(actual[i], i >= begin && i < end ? value : 0, 'PCM at frame ' + i);
}
for (const [start, stop] of [[0, 128], [13, 117], [13, 141], [128, 128], [141, 384], [127.49, 300], [127.51, 300]]) {
  const test = setup(); test.source.offset.value = .25;
  test.source.start(start / sampleRate); test.source.stop(stop / sampleRate);
  expectRange(render(test.context, 768), Math.round(start), Math.round(stop), .25);
  assert.equal(test.ended, 1, 'exactly one ended event at ' + start + '/' + stop);
  assert.equal(test.endedAt, Math.max(Math.floor(Math.round(start) / quantum) * quantum, Math.ceil(Math.round(stop) / quantum) * quantum - quantum),
    'ended belongs to the quantum containing the last active sample');
  assert.equal(test.source._impl.outputs[0].isEnabled(), false, 'finished source no longer pulls the graph');
}
// 3456 / 48000 does not survive a floating-point sample conversion exactly.
// Both scheduled-source families must start in the current quantum, rather
// than leaving their activation task forever in an already-rendered quantum.
for (const type of ['constant', 'buffer']) {
  const context = g.KitchenWebAudio.createContext(sampleRate); render(context, 3456);
  const source = type === 'constant' ? context.createConstantSource() : context.createBufferSource();
  if (type === 'constant') source.offset.value = .25;
  else { source.buffer = context.createBuffer(1, 256, sampleRate); source.buffer.getChannelData(0).fill(.25); }
  source.connect(context.destination); let ended = 0; source.onended = () => { ended++; source.disconnect(); };
  source.start(context.currentTime); source.stop(context.currentTime + quantum / sampleRate);
  expectRange(render(context, quantum), 0, quantum, .25);
  assert.equal(ended, 1, type + ' boundary source must complete');
  assert.equal(Object.keys(context._impl._sched).length, 0, type + ' leaves no past activation task');
}
for (const [initial, replacement] of [[400, 173], [150, 400]]) {
  const test = setup(); test.source.offset.value = .5; test.source.start(0);
  test.source.stop(initial / sampleRate); test.source.stop(replacement / sampleRate);
  expectRange(render(test.context, 768), 0, replacement, .5); assert.equal(test.ended, 1);
  test.source.stop(900 / sampleRate); render(test.context, 512); assert.equal(test.ended, 1, 'ended cannot fire again');
}
{
  const test = setup(); test.source.offset.setValueAtTime(.125, 0);
  test.source.offset.setValueAtTime(.5, 64 / sampleRate);
  test.source.start(13 / sampleRate); test.source.stop(190 / sampleRate);
  const output = render(test.context, 512);
  for (let i = 0; i < output.length; i++) assert.equal(output[i], i < 13 || i >= 190 ? 0 : i < 64 ? .125 : .5);
  assert.equal(test.ended, 1);
}
// Retire many real graph lifetimes, just as the CLATTER clock releases its voice.
{
  const context = g.KitchenWebAudio.createContext(sampleRate); let ended = 0;
  const channels = [new Float32Array(quantum), new Float32Array(quantum)];
  for (let i = 0; i < 1000; i++) {
    const source = context.createConstantSource(), gain = context.createGain();
    source.offset.value = 1e-12; source.connect(gain); gain.connect(context.destination);
    source.onended = () => { ended++; source.disconnect(); gain.disconnect(); };
    source.start(context.currentTime); source.stop(context.currentTime + quantum / sampleRate);
    context._impl.process(channels, 0);
    assert.equal(ended, i + 1, 'the voice lifetime completed');
    assert.equal(context._impl._destination.inputs[0].outputs.length, 0, 'no expired voice remains connected');
    assert.equal(Object.keys(context._impl._sched).length, 0, 'no completed source scheduling task remains');
  }
  context._impl.process(channels, 0); assert(channels.every(channel => channel.every(value => value === 0)));
}
// Compare managed smoothing to the original unpruned automation table through
// thousands of updates, including varied targets and smoothing constants.
function smoothingGraph() {
  const context = g.KitchenWebAudio.createContext(sampleRate), source = context.createConstantSource(), gain = context.createGain();
  source.offset.value = 1; gain.gain.value = .37; source.connect(gain); gain.connect(context.destination); source.start(0);
  return { context, param: gain.gain, channels: [new Float32Array(quantum), new Float32Array(quantum)] };
}
let smoothingError = 0, maximumHistory = 0;
{
  const managed = smoothingGraph(), reference = smoothingGraph();
  for (let update = 0; update < 2400; update++) {
    const target = .5 + .45 * Math.sin(update * .071), tau = .001 + (update % 9) * .003;
    g.KitchenWebAudio.setTargetAtCurrentTime(managed.param, target, tau);
    reference.param.setTargetAtTime(target, reference.context.currentTime, tau);
    maximumHistory = Math.max(maximumHistory, managed.param._impl._timeline.length);
    managed.context._impl.process(managed.channels, 0); reference.context._impl.process(reference.channels, 0);
    for (let i = 0; i < quantum; i++) smoothingError = Math.max(smoothingError, Math.abs(managed.channels[0][i] - reference.channels[0][i]));
  }
  assert(maximumHistory <= 64, 'completed smoothing history remains bounded');
  assert(reference.param._impl._timeline.length > 2000, 'reference preserves the original long history');
  assert(smoothingError < 1e-6, 'checkpoint preserves the Float32 output trajectory: ' + smoothingError);
}
// A helper call must behave exactly like the original API if an arbitrary
// ramp, curve or future event is present; those envelopes are never compacted.
for (const mode of ['future', 'ramp', 'curve']) {
  const managed = smoothingGraph(), reference = smoothingGraph();
  for (const graph of [managed, reference]) {
    for (let i = 0; i < 70; i++) graph.param.setTargetAtTime(.2 + i / 200, i / sampleRate, .01);
    if (mode === 'future') graph.param.setValueAtTime(.8, .01);
    else if (mode === 'ramp') graph.param.linearRampToValueAtTime(.9, .01);
    else graph.param.setValueCurveAtTime(new Float32Array([.2, .8, .3]), .01, .01);
    for (let block = 0; block < (mode === 'future' ? 1 : 12); block++) graph.context._impl.process(graph.channels, 0);
  }
  g.KitchenWebAudio.setTargetAtCurrentTime(managed.param, .6, .01);
  reference.param.setTargetAtTime(.6, reference.context.currentTime, .01);
  assert.equal(JSON.stringify(managed.param._impl._timeline), JSON.stringify(reference.param._impl._timeline), mode + ' event table is preserved exactly');
  assert(managed.param._impl._timeline.length > 64, mode + ' history is deliberately not compacted');
  for (let block = 0; block < 16; block++) {
    managed.context._impl.process(managed.channels, 0); reference.context._impl.process(reference.channels, 0);
    assert.deepEqual(managed.channels[0], reference.channels[0], mode + ' future PCM is identical');
  }
}
console.log('PASS native scheduled-source boundaries, ConstantSource lifetimes, 2,400 smoothing updates (max history ' + maximumHistory + ', max PCM error ' + smoothingError + '), and untouched future/ramp/curve automation');
