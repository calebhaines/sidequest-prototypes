'use strict';

// Actual SCALES audio and sliced tuner checks, including the serialized Worklet
// factory. No audio device or browser is required: node loom/utility-checks.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'utility-dsp.js'), 'utf8'), { filename: 'utility-dsp.js' });
vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'utility-catalog.js'), 'utf8'), { filename: 'utility-catalog.js' });
const utility = createLoomUtilityDSP(), definition = LoomUtilityCatalog;
const serialized = vm.runInNewContext('(' + createLoomUtilityDSP.toString() + ')', { Math, Number, Object, Float32Array, Float64Array })();
const sr = 48000, passed = [], benchmarks = {};
function check(name, test) { test(); passed.push(name); }
function rng(seed = 7) { let value = seed; return () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) / 4294967296 * 2 - 1; }; }
function tone(frequency, harmonics = [1], seconds = 1, rate = sr, options = {}) {
  const random = rng(13), scale = .3 / harmonics.reduce((a, b) => a + Math.abs(b), 0);
  return Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => {
    const time = i / rate; let sample = 0;
    for (let h = 0; h < harmonics.length; h++) sample += harmonics[h] * Math.sin(2 * Math.PI * frequency * (h + 1) * time + h * .2);
    if (options.pluck) sample *= Math.exp(-(time % .65) * 1.8);
    return scale * sample + (options.pluck && time % .65 < .004 ? random() * .02 : 0);
  });
}
function render(params = {}, leftSource = tone(110), rightSource = leftSource, blockSize = 128, rate = sr, factory = utility) {
  const insert = factory.create(rate, params), left = leftSource.slice(), right = rightSource.slice();
  for (let at = 0; at < left.length; at += blockSize) insert.process(left.subarray(at, Math.min(at + blockSize, left.length)), right.subarray(at, Math.min(at + blockSize, right.length)), { tempo: 120 });
  return { insert, left, right };
}
function continueFeed(insert, leftSource, rightSource = leftSource, blockSize = 128) {
  for (let at = 0; at < leftSource.length; at += blockSize) insert.process(leftSource.slice(at, at + blockSize), rightSource.slice(at, at + blockSize));
}
function rms(data, start = Math.floor(data.length / 2)) { let power = 0; for (let i = start; i < data.length; i++) power += data[i] * data[i]; return Math.sqrt(power / (data.length - start)); }
function mean(data, start = Math.floor(data.length / 2)) { let total = 0; for (let i = start; i < data.length; i++) total += data[i]; return total / (data.length - start); }
function peak(data) { let result = 0; for (const sample of data) result = Math.max(result, Math.abs(sample)); return result; }
function difference(a, b) { let total = 0; for (let i = 0; i < a.length; i++) total += (a[i] - b[i]) ** 2; return Math.sqrt(total / a.length); }
function cents(actual, expected) { return 1200 * Math.log2(actual / expected); }
function assertPitch(insert, frequency, tolerance = 2, label = '') { const meters = insert.getMeters(); assert(meters.confidence > .8 && meters.detectedHz > 0, label + ' no confident note'); assert(Math.abs(cents(meters.detectedHz, frequency)) < tolerance, `${label} expected ${frequency} Hz; got ${meters.detectedHz} Hz (${cents(meters.detectedHz, frequency)} cents)`); }

check('Catalog defaults and every parameter agree with the utility factory', () => {
  assert.equal(definition.id, 'scales'); assert.deepEqual(utility.normalize({}), definition.defaults);
  const keys = definition.params.map(p => p.key).concat('mix');
  assert.deepEqual(keys.sort(), Object.keys(utility.specifications).sort());
  for (const descriptor of definition.params) {
    const rule = utility.specifications[descriptor.key];
    if (descriptor.type === 'range') { assert.equal(descriptor.min, rule[0]); assert.equal(descriptor.max, rule[1]); assert.equal(descriptor.default, rule[2]); }
    else assert.deepEqual(descriptor.options.map(o => o.value), rule);
  }
  assert.equal(new Set(definition.groups.flatMap(g => g.keys)).size, keys.length);
});

check('Malformed parameters normalize to finite bounded values and integer targets', () => {
  const params = utility.normalize({ input: Infinity, output: 100, mode: 'missing', width: -3, targetNote: 33.6, reference: NaN, bypass: 1 });
  assert.equal(params.input, 0); assert.equal(params.output, 24); assert.equal(params.mode, 'stereo'); assert.equal(params.width, 0); assert.equal(params.targetNote, 34); assert.equal(params.reference, 440); assert.equal(params.bypass, false);
  assert.throws(() => utility.create(sr).process(new Float32Array(1), new Float32Array(2)), /equal stereo/);
});

check('Default, tuner-off, dry-only and bypassed audio are sample-identical across block sizes', () => {
  const random = rng(63), left = Float32Array.from({ length: 8000 }, () => random() * 2), right = Float32Array.from({ length: left.length }, () => random() * 2);
  for (const size of [1, 128, 511, 2048]) for (const params of [{}, { tuner: 'off' }, { input: 20, output: 20, width: 0, mode: 'mono', mix: 0 }, { input: 24, mute: 'on', guard: 'on', bypass: true }]) {
    const result = render(params, left, right, size); assert.deepEqual(result.left, left); assert.deepEqual(result.right, right);
  }
});

check('Serialized Worklet factory needs no hidden globals and produces exactly the same audio', () => {
  const source = tone(82.4069, [1, .7, .4], .45), params = { input: 3, output: -4, width: 1.7, monoBass: 'on', dc: 'on', highpass: 'on', lowcut: 43, lowpass: 'on', highcut: 8700, guard: 'on', ceiling: -4, mix: .73 };
  const native = render(params, source, Float32Array.from(source, x => -x * .6));
  const worklet = render(params, source, Float32Array.from(source, x => -x * .6), 128, sr, serialized);
  assert.deepEqual(native.left, worklet.left); assert.deepEqual(native.right, worklet.right); assert.equal(native.insert.getTailTime(), 0);
});

check('Input/output trims and balance use exact dB gain without crossing channels', () => {
  const left = new Float32Array(256).fill(.2), right = new Float32Array(256).fill(.05);
  const result = render({ input: 6, output: -3, balance: -.5 }, left, right);
  assert(Math.abs(result.left[20] - .2 * Math.pow(10, 3 / 20)) < 1e-7); assert(Math.abs(result.right[20] - .025 * Math.pow(10, 3 / 20)) < 1e-7);
  assert.equal(render({ balance: 1 }, left, right).left[0], 0); assert.equal(render({ balance: -1 }, left, right).right[0], 0);
});

check('All channel routes have the specified average, side, swap and duplication behavior', () => {
  const left = new Float32Array(8).fill(.25), right = new Float32Array(8).fill(.75);
  const expected = { stereo: [.25, .75], mono: [.5, .5], left: [.25, .25], right: [.75, .75], swap: [.75, .25], mid: [.5, .5], side: [-.25, -.25] };
  for (const [mode, values] of Object.entries(expected)) { const result = render({ mode }, left, right); assert.equal(result.left[0], values[0], mode); assert.equal(result.right[0], values[1], mode); }
});

check('Polarity and width preserve common audio while scaling only stereo difference', () => {
  const left = new Float32Array(8).fill(.25), right = new Float32Array(8).fill(.75);
  for (const [polarity, expected] of Object.entries({ normal: [.25, .75], left: [-.25, .75], right: [.25, -.75], both: [-.25, -.75] })) { const result = render({ polarity }, left, right); assert.equal(result.left[0], expected[0]); assert.equal(result.right[0], expected[1]); }
  const narrow = render({ width: 0 }, left, right), wide = render({ width: 2 }, left, right);
  assert.equal(narrow.left[0], .5); assert.equal(narrow.right[0], .5); assert.equal(wide.left[0], 0); assert.equal(wide.right[0], 1);
});

check('Complementary mono bass narrows low sides and leaves the common signal unchanged', () => {
  const low = tone(30), high = tone(3000), params = { monoBass: 'on', bassFreq: 120 };
  const lowResult = render(params, low, Float32Array.from(low, x => -x));
  const highResult = render(params, high, Float32Array.from(high, x => -x));
  assert(rms(lowResult.left) < rms(low) * .26); assert(rms(highResult.left) > rms(high) * .98);
  const common = render(params, low); assert.deepEqual(common.left, low); assert.deepEqual(common.right, low);
});

check('DC removal recentres both channels independently without affecting disabled audio', () => {
  const source = Float32Array.from(tone(440), x => x + .31), right = Float32Array.from(tone(660), x => x - .18), result = render({ dc: 'on' }, source, right);
  assert(Math.abs(mean(result.left)) < .001); assert(Math.abs(mean(result.right)) < .001);
  assert(Math.abs(result.insert.getMeters().dcLeft) < .005); assert.deepEqual(render({ dc: 'off' }, source, right).left, source);
});

check('Optional low and high cuts attenuate their stop bands and retain their pass bands', () => {
  const low = tone(20), middle = tone(440), high = tone(6000), hp = { highpass: 'on', lowcut: 100 }, lp = { lowpass: 'on', highcut: 1000 };
  assert(rms(render(hp, low).left) < rms(low) * .05); assert(rms(render(hp, middle).left) > rms(middle) * .98);
  assert(rms(render(lp, high).left) < rms(high) * .03); assert(rms(render(lp, tone(100)).left) > rms(tone(100)) * .999);
});

check('Routing, polarity, width, dry/wet, guard and mute follow the documented order', () => {
  const left = new Float32Array(32).fill(.2), right = new Float32Array(32).fill(.6);
  const cancelled = render({ input: 6, mode: 'mono', polarity: 'left', width: 0 }, left, right);
  assert.equal(peak(cancelled.left), 0); assert.equal(peak(cancelled.right), 0);
  const blended = render({ output: 20, mix: .5, guard: 'on', ceiling: -6 }, left, right);
  assert(Math.abs(blended.left[0] - Math.pow(10, -6 / 20)) < 1e-7); assert(Math.abs(blended.right[0] - Math.pow(10, -6 / 20)) < 1e-7);
  const muted = render({ mix: 0, mute: 'on' }, left, right); assert.equal(peak(muted.left), 0); assert.equal(peak(muted.right), 0);
});

check('Meter peaks, RMS, clip latches and peak holds describe output and reset separately', () => {
  const source = tone(440, [1], 1.3), result = render({}, source), meters = result.insert.getMeters();
  assert(Math.abs(meters.holdLeftDb - 20 * Math.log10(.3)) < .001); assert(Math.abs(meters.rmsLeftDb - 20 * Math.log10(.3 / Math.SQRT2)) < .1); assert.equal(meters.correlation, 1);
  continueFeed(result.insert, new Float32Array(128).fill(1.2), new Float32Array(128).fill(.2));
  assert.equal(result.insert.getMeters().clipLeft, true); assert.equal(result.insert.getMeters().clipRight, false);
  const before = result.insert.getMeters(); result.insert.resetMeters(); const after = result.insert.getMeters();
  assert.equal(after.holdLeftDb, -120); assert.equal(after.holdRightDb, -120); assert.equal(after.clipLeft, false);
  for (const key of ['detectedHz', 'confidence', 'correlation', 'dcLeft', 'dcRight', 'rmsLeftDb', 'peakLeftDb']) assert.equal(after[key], before[key], key + ' was changed by meter reset');
});

check('Correlation distinguishes mono, inverted stereo, unrelated channels and silence', () => {
  const source = tone(110), inverted = render({}, source, Float32Array.from(source, x => -x));
  assert(inverted.insert.getMeters().correlation < -.9999);
  const independent = render({}, tone(110, [1], 1.3), tone(773, [1], 1.3)); assert(Math.abs(independent.insert.getMeters().correlation) < .03);
  const silence = render({}, new Float32Array(1000)).insert.getMeters(); assert.equal(silence.correlation, 0); assert.equal(silence.rmsLeftDb, -120);
});

check('Filters and mono-bass state remain exactly continuous across block sizes and meter reset', () => {
  const source = tone(87, [1, .8, .4], .4), right = tone(131, [1, .4], .4), params = { input: 3, output: -2, width: 1.6, monoBass: 'on', dc: 'on', highpass: 'on', lowcut: 71, lowpass: 'on', highcut: 6700, mix: .65 };
  const reference = render(params, source, right, 1);
  for (const size of [128, 511, 2048]) { const result = render(params, source, right, size); assert.deepEqual(result.left, reference.left); assert.deepEqual(result.right, reference.right); }
  const a = utility.create(sr, params), b = utility.create(sr, params);
  for (let at = 0; at < source.length; at += 128) { const l = source.slice(at, at + 128), r = right.slice(at, at + 128), l2 = l.slice(), r2 = r.slice(); if (at % 512 === 0) a.resetMeters(); a.process(l, r); b.process(l2, r2); assert.deepEqual(l, l2); assert.deepEqual(r, r2); }
});

check('Tuner measures sine fundamentals from 25 Hz through 2 kHz without adding audio latency', () => {
  for (const frequency of [25, 30.8677063, 41.2034446, 55, 82.4068892, 110, 220, 440, 745, 1000, 1440, 1760, 1900, 2000]) {
    const source = tone(frequency, [1], 1.1), result = render({}, source); assertPitch(result.insert, frequency, .6, 'sine ' + frequency); assert.deepEqual(result.left, source);
  }
  const impulse = new Float32Array(128); impulse[0] = .7; assert.deepEqual(render({}, impulse).left, impulse);
});

check('Harmonic-rich bass, guitar and noisy plucks retain the fundamental without octave errors', () => {
  for (const frequency of [25, 30.8677063, 41.2034446, 55, 82.4068892, 110, 220, 440, 880, 1760]) for (const [name, harmonics, options] of [
    ['rich', [1, .7, .45, .3, .2, .1, .08, .05], {}],
    ['weak', [.12, .8, .7, .3, .2, .1], {}],
    ['pluck', [1, .7, .45, .3, .2, .1], { pluck: true }]
  ]) assertPitch(render({}, tone(frequency, harmonics, 1.5, sr, options)).insert, frequency, 2.2, `${name} ${frequency}`);
});

check('A dominant second harmonic still reports the quieter low-bass fundamental', () => {
  for (const frequency of [30.8677063, 55, 110, 220, 440, 880]) assertPitch(render({}, tone(frequency, [.1, 1], 1.4)).insert, frequency, .5, 'second harmonic ' + frequency);
});

check('A dominant third harmonic above the tuner band does not invent a lower harmonic note', () => {
  assertPitch(render({}, tone(1318.5102, [.07, .05, 1, .15, .1, .08], 1.6)).insert, 1318.5102, 2, 'third harmonic high guitar');
});

check('Fourth-harmonic-dominant bass retains accurate low B rather than a biased period multiple', () => {
  for (const frequency of [30.8677063, 41.2034446, 82.4068892]) assertPitch(render({}, tone(frequency, [.07, .1, .1, 1, .2, .1], 1.6)).insert, frequency, .5, 'fourth harmonic bass ' + frequency);
});

check('Detected frequency remains accurate for detuning and across common audio sample rates', () => {
  for (const base of [30.8677063, 82.4068892, 440]) for (const detune of [-23.7, 7.2, 38]) { const frequency = base * Math.pow(2, detune / 1200); assertPitch(render({}, tone(frequency, [1, .8, .4], 1.2)).insert, frequency, .5); }
  for (const rate of [8000, 44100, 96000, 192000]) for (const frequency of [30.8677063, 1900]) assertPitch(render({}, tone(frequency, [1], 1.2, rate), undefined, 128, rate).insert, frequency, .6, `${rate} Hz sample rate`);
});

check('Stereo Auto detects the stronger independent channel even when mid cancels', () => {
  const source = tone(82.4069), inverted = Float32Array.from(source, x => -x), silence = new Float32Array(source.length);
  assertPitch(render({ tunerChannel: 'auto' }, source, inverted).insert, 82.4069);
  assertPitch(render({ tunerChannel: 'auto' }, silence, source).insert, 82.4069);
  assertPitch(render({ tunerChannel: 'left' }, source, inverted).insert, 82.4069); assertPitch(render({ tunerChannel: 'right' }, source, inverted).insert, 82.4069);
  const cancelled = render({ tunerChannel: 'mid' }, source, inverted).insert.getMeters(); assert.equal(cancelled.detectedHz, 0); assert.equal(cancelled.confidence, 0);
});

check('Tuner listens before processing and remains useful with output mute, extreme routing and guard', () => {
  const source = tone(55, [1, .7, .4], 1.2), result = render({ input: -24, output: 24, width: 0, mode: 'side', highpass: 'on', lowcut: 500, guard: 'on', mute: 'on' }, source);
  assertPitch(result.insert, 55); assert.equal(peak(result.left), 0); assert.equal(result.insert.getMeters().outputDb, -120); assert(result.insert.getMeters().inputDb > -20);
});

check('Silence, broadband noise, DC, and inputs below sensitivity produce no invented pitch', () => {
  const silent = new Float32Array(sr), random = rng(71), white = Float32Array.from(silent, () => random() * .2), dc = new Float32Array(sr).fill(.3);
  for (const source of [silent, white, dc, Float32Array.from(tone(110), x => x * .00001)]) { const m = render({}, source).insert.getMeters(); assert.equal(m.detectedHz, 0); assert.equal(m.confidence, 0); }
  for (const seed of [11, 19, 31]) { const noise = rng(seed); let pink = 0; const source = Float32Array.from({ length: sr }, () => { pink += .018 * (noise() - pink); return pink; }); const m = render({}, source).insert.getMeters(); assert.equal(m.detectedHz, 0); }
});

check('Stale notes expire after silence or invalid noise and turning analysis off clears pitch', () => {
  const insert = render({}, tone(110, [1, .7], .8)).insert; assertPitch(insert, 110);
  continueFeed(insert, new Float32Array(Math.round(sr * .2))); assert.equal(insert.getMeters().detectedHz, 0);
  continueFeed(insert, tone(55, [1, .6], .8)); assertPitch(insert, 55);
  const random = rng(29); continueFeed(insert, Float32Array.from({ length: sr }, () => random() * .2)); assert.equal(insert.getMeters().detectedHz, 0);
  continueFeed(insert, tone(110)); insert.setParams({ tuner: 'off' }); assert.equal(insert.getMeters().detectedHz, 0);
  insert.setParams({ tuner: 'on' }); continueFeed(insert, tone(110)); assertPitch(insert, 110); insert.setParams({ bypass: true }); assert.equal(insert.getMeters().detectedHz, 0);
});

check('Calibration, guide and target changes leave measured pitch and actual audio unchanged', () => {
  const source = tone(442, [1, .4], 1.1), params = { reference: 442, tuning: 'bass5', target: 'manual', targetNote: 23, tolerance: 1 };
  const result = render(params, source); assertPitch(result.insert, 442, .1); assert.deepEqual(result.left, source);
  assert.equal(result.insert.getMeters().reference, 442); assert.equal(result.insert.getMeters().targetNote, 23); assert.equal(result.insert.getMeters().tolerance, 1);
  const detected = result.insert.getMeters().detectedHz; result.insert.setParams({ reference: 430, tuning: 'guitar', targetNote: 40, tolerance: 10 }); assert.equal(result.insert.getMeters().detectedHz, detected);
  assert.equal(result.insert.getMeters().reference, 430); assert.equal(result.insert.getMeters().targetNote, 40); assert.equal(result.insert.getMeters().tolerance, 10);
});

check('Full reset clears every filter, meter, clip and tuner state and silence remains silent', () => {
  const insert = render({ input: 24, highpass: 'on', lowpass: 'on', dc: 'on', monoBass: 'on' }, tone(55)).insert;
  insert.reset(); const meters = insert.getMeters();
  for (const key of ['detectedHz', 'confidence', 'dcLeft', 'dcRight', 'crestDb', 'correlation']) assert.equal(meters[key], 0, key);
  assert.equal(meters.clipLeft, false); assert.equal(meters.peakLeftDb, -120); assert.equal(meters.holdLeftDb, -120);
  const left = new Float32Array(128), right = left.slice(); insert.process(left, right); assert.equal(peak(left), 0); assert.equal(peak(right), 0);
});

check('All extreme parameter combinations and nonfinite input stay bounded and meter values finite', () => {
  const random = rng(83), source = Float32Array.from({ length: 4096 }, () => random() * 2); source[0] = NaN; source[1] = Infinity;
  for (const mode of utility.specifications.mode) {
    const result = render({ input: 24, output: 24, balance: -.3, mode, width: 2, polarity: 'both', monoBass: 'on', bassFreq: 400, dc: 'on', highpass: 'on', lowcut: 500, lowpass: 'on', highcut: 1000, mix: .9 }, source);
    assert(result.left.every(x => Number.isFinite(x) && Math.abs(x) <= 64)); assert(result.right.every(x => Number.isFinite(x) && Math.abs(x) <= 64));
    for (const [key, value] of Object.entries(result.insert.getMeters())) assert(typeof value === 'boolean' || Number.isFinite(value), key);
  }
});

check('Low B locks promptly and eight simultaneous utilities remain practical for 128-frame monitoring', () => {
  const insert = utility.create(sr), source = tone(30.8677063, [1, .8, .4], .8); let settled = 0;
  for (let at = 0; at < source.length; at += 128) { const left = source.slice(at, at + 128), right = left.slice(); insert.process(left, right); if (!settled && insert.getMeters().detectedHz > 0) settled = (at + left.length) / sr; }
  assert(settled > 0 && settled < .65, 'Low B tuner did not settle promptly'); benchmarks.lowBSettleMs = settled * 1000;
  const count = 8, inserts = Array.from({ length: count }, () => utility.create(sr)), pairs = Array.from({ length: count }, () => [new Float32Array(128), new Float32Array(128)]), timings = [];
  for (let frame = 0; frame < 950; frame++) {
    for (let voice = 0; voice < count; voice++) for (let j = 0; j < 128; j++) pairs[voice][0][j] = pairs[voice][1][j] = .2 * Math.sin(2 * Math.PI * (31 + voice * 9) * (frame * 128 + j) / sr);
    const before = performance.now(); for (let voice = 0; voice < count; voice++) inserts[voice].process(...pairs[voice]); if (frame > 250) timings.push(performance.now() - before);
  }
  timings.sort((a, b) => a - b); benchmarks.eightInsertMeanMs = timings.reduce((a, b) => a + b, 0) / timings.length; benchmarks.eightInsertP95Ms = timings[Math.floor(timings.length * .95)];
  // Broad machine-independent guard catches accidental full scan per callback,
  // rather than treating unrelated host scheduling noise as an audio failure.
  assert(benchmarks.eightInsertP95Ms < 8, 'Utility analysis has excessive frame cost');
});

console.log(JSON.stringify({ passed: passed.length, checks: passed, benchmarks }, null, 2));
