'use strict';
// Sweepable channel EQ: actual stereo signal, legacy PCM and serialized factory.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'track-eq-dsp.js'), 'utf8'), { filename: 'track-eq-dsp.js' });
const D = createLoomTrackEQDSP(), { TrackEQ } = D;
const flat = { low: 0, lowMid: 0, highMid: 0, high: 0, lowMidFreq: 400, highMidFreq: 2500 };
let passed = 0;
function check(label, run) { run(); passed++; console.log('PASS ' + label); }
function tone(hz, frames = 24000, rate = 48000, amplitude = .01) { return Float32Array.from({ length: frames }, (_, i) => amplitude * Math.sin(2 * Math.PI * hz * i / rate)); }
function noise(frames, seed = 17) { let value = seed; return Float32Array.from({ length: frames }, () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return value / 2147483648 * .03; }); }
function feed(eq, left, right = left, blocks = [128], start = 0) { const l = left.slice(), r = right.slice(); let at = 0, part = start; while (at < l.length) { const end = Math.min(l.length, at + blocks[part++ % blocks.length]); eq.process(l.subarray(at, end), r.subarray(at, end)); at = end; } return { left: l, right: r }; }
function rms(audio, from = 0) { let sum = 0; for (let i = from; i < audio.length; i++) sum += audio[i] * audio[i]; return Math.sqrt(sum / (audio.length - from)); }
function peak(audio) { let largest = 0; for (const value of audio) { assert(Number.isFinite(value), 'Non-finite EQ output'); largest = Math.max(largest, Math.abs(value)); } return largest; }
function legacy() {
  // The optional engine dependency deliberately retains its released inline
  // implementation for source consumers that have not loaded the new module.
  const scope = { Math, Number, Object, Array, Map, Set, Float32Array, Float64Array, Uint8Array, Int32Array, Blob, DOMException, TextEncoder, setTimeout, navigator: {}, createLoomEffectsDSP: () => ({ specifications: {}, create: () => null }) };
  scope.window = scope; vm.createContext(scope); vm.runInContext(fs.readFileSync(path.join(__dirname, 'audio-engine.js'), 'utf8'), scope, { filename: 'audio-engine.js' });
  return scope.createLoomEngineDSP(scope.createLoomEffectsDSP).TrackEQ;
}

check('The two bell sweeps have bounded defaults, partial updates and independent caller state', () => {
  assert.deepEqual(D.gainKeys, ['low', 'lowMid', 'highMid', 'high']); assert.deepEqual(D.keys, [...D.gainKeys, 'lowMidFreq', 'highMidFreq']);
  assert.deepEqual(D.specifications.lowMidFreq, [80, 2000, 400]); assert.deepEqual(D.specifications.highMidFreq, [400, 10000, 2500]);
  const params = { lowMid: 6, lowMidFreq: 900, highMidFreq: 5500 }, before = { ...params }, eq = new TrackEQ(48000, params);
  assert.deepEqual(params, before); assert.equal(eq.params.lowMid, 6); assert.equal(eq.params.lowMidFreq, 900);
  eq.setParams({ highMid: -3 }); assert.equal(eq.params.lowMidFreq, 900); assert.equal(eq.params.highMidFreq, 5500); assert.equal(eq.params.lowMid, 6);
  eq.setParams({ lowMidFreq: -1, highMidFreq: 1e10 }); assert.equal(eq.params.lowMidFreq, 80); assert.equal(eq.params.highMidFreq, 10000);
  eq.setParams({ lowMidFreq: NaN, highMidFreq: Infinity }); assert.equal(eq.params.lowMidFreq, 400); assert.equal(eq.params.highMidFreq, 2500);
});
check('Released fixed-frequency stereo PCM and gain gestures stay exactly unchanged', () => {
  const OldEQ = legacy(), left = noise(8193), right = noise(left.length, 9167);
  for (const rate of [8000, 44100, 48000, 96000, 192000]) for (const gains of [{}, { low: 3, lowMid: -4, highMid: 5, high: 2 }, { low: -12, lowMid: 12, highMid: -12, high: 12 }]) {
    const modern = new TrackEQ(rate, gains), old = new OldEQ(rate, gains);
    assert.deepEqual(feed(modern, left, right, [137, 31, 251]), feed(old, left, right, [137, 31, 251]), 'Legacy PCM at ' + rate + ' Hz');
    for (const update of [{ lowMid: 9 }, { low: -7, highMid: 4 }, { lowMid: 0, highMid: 0 }, { high: -3 }]) { modern.setParams(update); old.setParams(update); assert.deepEqual(feed(modern, left.subarray(0, 1024), right.subarray(0, 1024), [37]), feed(old, left.subarray(0, 1024), right.subarray(0, 1024), [37])); }
  }
});
check('Each sweep moves its bell to the selected frequency with the labelled cut or boost', () => {
  for (const [key, frequencyKey, frequencies] of [['lowMid', 'lowMidFreq', [80, 180, 400, 1100, 2000]], ['highMid', 'highMidFreq', [400, 900, 2500, 6000, 10000]]]) for (const frequency of frequencies) for (const gain of [-12, 6, 12]) {
    const source = tone(frequency), output = feed(new TrackEQ(48000, { ...flat, [key]: gain, [frequencyKey]: frequency }), source).left;
    const actual = 20 * Math.log10(rms(output, 12000) / rms(source, 12000)); assert(Math.abs(actual - gain) < .02, key + ' at ' + frequency + ' Hz: ' + actual + ' dB');
  }
  const source = tone(2000), centered = feed(new TrackEQ(48000, { lowMid: 12, lowMidFreq: 2000 }), source).left, oldCenter = feed(new TrackEQ(48000, { lowMid: 12 }), source).left;
  assert(rms(centered, 12000) > rms(oldCenter, 12000) * 2, 'Sweep must materially change the response, not only its label.');
});
check('Flat sweeps remain sample-exact, arithmetic-free and free of stale filter audio', () => {
  const eq = new TrackEQ(48000, flat), left = noise(4097), right = noise(left.length, 401);
  for (const [lowMidFreq, highMidFreq] of [[80, 10000], [2000, 400], [900, 5000], [400, 2500]]) {
    eq.setParams({ lowMidFreq, highMidFreq }); assert.equal(eq.mask, 0); assert.deepEqual(feed(eq, left, right), { left, right });
  }
  eq.setParams({ lowMid: 12, highMid: 12 }); feed(eq, left, right); eq.setParams({ lowMid: 0, highMid: 0 }); feed(eq, new Float32Array(24000)); assert.equal(eq.mask, 0);
  eq.setParams({ lowMidFreq: 80, highMidFreq: 10000 }); assert.equal(eq.mask, 0); eq.setParams({ lowMid: 12, highMid: -12 }); assert.equal(peak(feed(eq, new Float32Array(4096)).left), 0, 'A new boost cannot revive a previous note.');
});
check('Sweep targets ramp smoothly and unchanged updates preserve stereo histories', () => {
  const params = { low: 0, lowMid: 12, highMid: -6, high: 0, lowMidFreq: 400, highMidFreq: 2500 };
  const eq = new TrackEQ(48000, params), dc = new Float32Array(12000).fill(.01); const before = feed(eq, dc).left.at(-1);
  eq.setParams({ lowMidFreq: 2000, highMidFreq: 400 }); const transition = feed(eq, dc).left;
  assert(Math.abs(transition[0] - before) < .0001, 'A frequency edit must not step straight to its new filter coefficients.'); assert(Math.abs(transition.at(-1) - .01) < .00001);
  const left = noise(12001), right = noise(left.length, 321);
  function repeated(repeat) { const e = new TrackEQ(48000, { ...params, lowMidFreq: 1400, highMidFreq: 7000 }), l = left.slice(), r = right.slice(); for (let at = 0; at < l.length; at += 32) { if (repeat) e.setParams({ lowMidFreq: 1400, highMidFreq: 7000, lowMid: 12 }); e.process(l.subarray(at, at + 32), r.subarray(at, at + 32)); } return { left: l, right: r }; }
  assert.deepEqual(repeated(true), repeated(false));
});
check('Continuous log sweeps and their gain changes are deterministic across odd block partitions', () => {
  const frames = 48000, left = noise(frames), right = noise(frames, 221), boundaries = Array.from({ length: 151 }, (_, i) => i * 317).filter(i => i < frames);
  function run(blocks) { const eq = new TrackEQ(48000, { lowMid: 9, highMid: -9 }), l = left.slice(), r = right.slice(); let at = 0, update = 0, part = 0; while (at < frames) { if (at === boundaries[update]) { const f = update / (boundaries.length - 1); eq.setParams({ lowMidFreq: 80 * 25 ** f, highMidFreq: 10000 / 25 ** f, lowMid: 9 * Math.cos(f * Math.PI), highMid: -9 * Math.cos(f * Math.PI) }); update++; } const end = Math.min(frames, at + blocks[part++ % blocks.length], boundaries[update] ?? frames); eq.process(l.subarray(at, end), r.subarray(at, end)); at = end; } return { left: l, right: r, eq }; }
  const a = run([128]), b = run([137, 31, 251]); assert.deepEqual(a.left, b.left); assert.deepEqual(a.right, b.right); assert(peak(a.left) < .5 && peak(a.right) < .5, 'A musical sweep must remain at a plausible level.');
  a.eq.reset(); assert.deepEqual(feed(a.eq, left, right), feed(new TrackEQ(48000, a.eq.params), left, right));
});
check('Low sample rates clamp to safe frequencies, and abrupt extreme sweeps stay finite and quiet at rest', () => {
  for (const rate of [8000, 44100, 48000, 96000, 192000]) {
    const eq = new TrackEQ(rate, { lowMid: 12, highMid: -12, lowMidFreq: 2000, highMidFreq: 10000 }); assert(eq.bands.every(band => band.frequency <= rate * .45));
    const zero = new Float32Array(128); assert.equal(peak(feed(eq, zero).left), 0);
    for (let index = 0; index < 64; index++) { eq.setParams({ lowMidFreq: index % 2 ? 80 : 2000, highMidFreq: index % 2 ? 10000 : 400, lowMid: index % 3 ? 12 : -12 }); const out = feed(eq, tone(137, 128, rate, .005)); assert(peak(out.left) < 2, 'Extreme sweep transient at ' + rate + ' Hz'); }
    eq.setParams(flat); feed(eq, new Float32Array(Math.floor(rate / 2))); assert.equal(eq.mask, 0); assert.equal(peak(feed(eq, zero).left), 0);
  }
  const eq = new TrackEQ(8000, { highMid: 12, highMidFreq: 10000 }), source = tone(3600, 8000, 8000); const actual = 20 * Math.log10(rms(feed(eq, source).left, 4000) / rms(source, 4000)); assert(Math.abs(actual - 12) < .02, 'The clamped bell must have its requested gain at the effective frequency.');
});
check('The sweep factory runs in an isolated audio realm and adds no pure sample delay or channel crosstalk', () => {
  const isolated = vm.runInNewContext('(' + createLoomTrackEQDSP.toString() + ')', { Math, Number, Object, Array, Float32Array, Float64Array }); const params = { low: 2, lowMid: -4, highMid: 8, high: -3, lowMidFreq: 1600, highMidFreq: 7500 }, left = noise(4097), right = noise(left.length, 111);
  assert.deepEqual(feed(new (isolated().TrackEQ)(48000, params), left, right, [37]), feed(new TrackEQ(48000, params), left, right, [137]));
  const impulse = new Float32Array(1024); impulse[0] = .1; const result = feed(new TrackEQ(48000, params), impulse, new Float32Array(impulse.length)); assert(Math.abs(result.left[0]) > .001); assert.equal(peak(result.right), 0);
});
console.log(passed + ' sweepable track-EQ signal groups passed.');
