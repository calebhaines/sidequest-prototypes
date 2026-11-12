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
console.log('PASS native scheduled-source boundary activation, ConstantSource sample timing, offset automation, stop replacement, ended once and 1,000 retired graph lifetimes');
