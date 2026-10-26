/* Actual SWIRL/CRUMBLE DSP: spectra, envelopes, sample clocks and Worklet parity. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
for (const file of ['creative-dsp.js', 'creative-catalog.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), { filename: file });
const dsp = createLoomCreativeDSP(), passed = [], sr = 48000;
const isolated = vm.runInNewContext('(' + createLoomCreativeDSP.toString() + ')', { Math, Number, Object, Float32Array, Float64Array })();
function check(label, test) { test(); passed.push(label); }
function noise(frames, amplitude = .2) { let seed = 98123; return Float32Array.from({ length: frames }, () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 4294967296 * 2 - 1) * amplitude; }); }
function tone(frequency, frames = sr, amplitude = .3, rate = sr) { return Float32Array.from({ length: frames }, (_, i) => amplitude * Math.sin(2 * Math.PI * frequency * i / rate)); }
function rms(values, begin = 0) { let sum = 0; for (let i = begin; i < values.length; i++) sum += values[i] * values[i]; return Math.sqrt(sum / (values.length - begin)); }
function difference(a, b) { let sum = 0; for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2; return Math.sqrt(sum / a.length); }
function projection(values, frequency, rate = sr, begin = Math.floor(values.length / 3)) { let a = 0, b = 0; for (let i = begin; i < values.length; i++) { const phase = 2 * Math.PI * frequency * i / rate; a += values[i] * Math.sin(phase); b += values[i] * Math.cos(phase); } return 2 * Math.hypot(a, b) / (values.length - begin); }
function render(type, params, source, right = source, blockSize = 128, rate = sr, factory = dsp, transport = false, insert = null) {
  const effect = insert || factory.create(type, rate, params), left = source.slice(), other = right.slice();
  for (let at = 0; at < left.length; at += blockSize) effect.process(left.subarray(at, at + blockSize), other.subarray(at, at + blockSize), { tempo: 120, playing: transport, beat: at / rate * 2 });
  return { left, right: other, effect };
}

check('Catalog defaults, ranges, groups and recipes agree with the actual DSP', () => {
  for (const definition of LoomCreativeCatalog) {
    assert.deepEqual(dsp.normalize(definition.id, {}), definition.defaults);
    const keys = definition.params.map(p => p.key).concat('mix');
    assert.deepEqual(keys.slice().sort(), Object.keys(dsp.specifications[definition.id]).sort());
    assert.deepEqual(definition.groups.flatMap(group => group.keys).sort(), keys.slice().sort());
    for (const param of definition.params) {
      const spec = dsp.specifications[definition.id][param.key];
      if (param.type === 'range') { assert.equal(param.min, spec[0]); assert.equal(param.max, spec[1]); assert.equal(param.default, spec[2]); }
      else { assert.deepEqual(param.options.map(option => option.value).sort(), spec.slice().sort()); assert.equal(param.default, spec[0]); }
    }
    for (const preset of definition.presets) {
      const normalized = dsp.normalize(definition.id, Object.assign({}, definition.defaults, preset.params));
      for (const [key, value] of Object.entries(preset.params)) assert.equal(normalized[key], value, preset.id + '/' + key);
    }
  }
});

check('Dry and bypass preserve stereo exactly; malformed parameters remain bounded', () => {
  const left = noise(4000), right = noise(4000, .4);
  for (const type of ['swirl', 'crumble']) for (const params of [{ mix: 0, output: 12 }, { bypass: true, output: 12 }]) {
    const audio = render(type, params, left, right); assert.deepEqual(audio.left, left); assert.deepEqual(audio.right, right);
  }
  assert.equal(dsp.normalize('swirl', { stages: 'bad', center: NaN, feedback: Infinity }).center, 650);
  assert.equal(dsp.normalize('crumble', { bits: -2, sampleRate: 999999 }).bits, 2);
  assert.throws(() => dsp.create('swirl', sr).process(new Float32Array(1), new Float32Array(2)), /equal stereo/);
  assert.throws(() => dsp.create('unknown', sr), /Unknown/);
});

check('Phaser produces physical all-pass cancellation notches with a flat pass frequency', () => {
  const params = { stages: '4', center: 800, spread: 0, feedback: 0, depth: 0, envAmount: 0, stereo: 0, output: 0, mix: 1 };
  const notch = sr / Math.PI * Math.atan(Math.tan(Math.PI * 800 / sr) * Math.tan(Math.PI / 8));
  const cut = render('swirl', params, tone(notch, sr / 3)), pass = render('swirl', params, tone(800, sr / 3));
  assert(projection(cut.left, notch) < .003, 'First theoretical cancellation is at least 40 dB down');
  assert(Math.abs(projection(pass.left, 800) - .3) < .005, 'The four-stage full-cycle phase frequency passes at unity');
  const input = noise(24000), four = render('swirl', { ...params, stages: '4', spread: 1.5 }, input), eight = render('swirl', { ...params, stages: '8', spread: 1.5 }, input), twelve = render('swirl', { ...params, stages: '12', spread: 1.5 }, input);
  assert(difference(four.left, eight.left) > .02); assert(difference(eight.left, twelve.left) > .02);
});

check('Stereo-linked envelope follows anti-phase input and releases back to the original centre', () => {
  const effect = dsp.create('swirl', sr, { center: 200, spread: 0, depth: 0, envAmount: 24, sensitivity: 12, attack: 1, release: 50, stereo: 0 });
  const input = tone(110, 24000, .8), result = render('swirl', {}, input, Float32Array.from(input, x => -x), 128, sr, dsp, false, effect);
  const raised = effect.getMeters(); assert(raised.envelope > .9); assert(raised.centerLeftHz > 750, 'The actual input envelope lifts the poles by two octaves');
  render('swirl', {}, new Float32Array(24000), undefined, 128, sr, dsp, false, effect);
  const released = effect.getMeters(); assert(released.envelope < .001); assert(released.centerLeftHz < 202);
  assert(rms(result.left) > .01); assert(rms(result.right) > .01);
});

check('Stereo LFO motion and musical clock are real and independent of envelope modulation', () => {
  const result = render('swirl', { clock: 'free', rate: .7, depth: 50, stereo: 160, envAmount: 0 }, noise(sr));
  assert(difference(result.left, result.right) > .025);
  assert.equal(result.effect.getMeters().rateHz, .7);
  const sync = dsp.create('swirl', sr, { clock: 'sync', division: '1/4', depth: 20 });
  sync.process(new Float32Array(128), new Float32Array(128), { tempo: 150, beat: 3, playing: true }); assert.equal(sync.getMeters().rateHz, 2.5);
  sync.setParams({ division: '2' }); sync.process(new Float32Array(128), new Float32Array(128), { tempo: 150, beat: 3, playing: true }); assert.equal(sync.getMeters().rateHz, .3125);
});

check('Sample-clock reduction creates the expected alias, and input filtering softens it', () => {
  const input = tone(10000, sr / 2), params = { bits: 16, sampleRate: 8000, jitter: 0, dither: 0, transient: 0, tone: 20000, output: 0, mix: 1 };
  const raw = render('crumble', { ...params, prefilter: 'raw' }, input), soft = render('crumble', { ...params, prefilter: 'soft' }, input);
  const alias = projection(raw.left, 2000), filtered = projection(soft.left, 2000);
  assert(alias > .15, '10 kHz at an 8 kHz sample clock folds to 2 kHz');
  assert(filtered < alias * .25, 'The actual two-pole input stage reduces that folded tone');
  const low = render('crumble', { ...params, sampleRate: sr, bits: 2 }, new Float32Array(2000).fill(.12));
  const high = render('crumble', { ...params, sampleRate: sr, bits: 16 }, new Float32Array(2000).fill(.12));
  assert(rms(low.left, 1000) < 1e-8); assert(Math.abs(rms(high.left, 1000) - .12) < 1e-4);
});

check('Jitter and dither are deterministic, with linked or independent stereo clocks', () => {
  const input = tone(333, 24000, .15), params = { bits: 7, sampleRate: 3000, jitter: .8, transient: 0, output: 0, mix: 1 };
  const linked = render('crumble', params, input), independent = render('crumble', { ...params, stereo: 'independent' }, input);
  assert.deepEqual(linked.left, linked.right); assert(difference(independent.left, independent.right) > .01);
  const dither = render('crumble', { ...params, dither: 1 }, input), repeat = render('crumble', { ...params, dither: 1 }, input);
  assert.deepEqual(dither.left, repeat.left); assert.deepEqual(dither.right, repeat.right); assert(difference(linked.left, dither.left) > .001);
  const silent = render('crumble', { ...params, dither: 1 }, new Float32Array(24000)); assert.equal(rms(silent.left), 0, 'Dither does not generate unrequested noise from silence');
});

check('Transient recovery restores an attack the slow sample clock otherwise misses, without moving it early', () => {
  const input = new Float32Array(2000); input[200] = .5;
  const params = { bits: 8, sampleRate: 1000, jitter: 0, dither: 0, tone: 20000, output: 0, mix: 1 };
  const crushed = render('crumble', { ...params, transient: 0 }, input), recovered = render('crumble', { ...params, transient: 1 }, input);
  assert.equal(rms(crushed.left), 0, 'The raw sample clock misses the narrow impulse');
  assert(recovered.left[200] > .49); assert(recovered.left.subarray(0, 200).every(x => x === 0), 'The parallel transient stays at its input sample');
});

check('Block partition, reset and serialized AudioWorklet factories preserve the exact effect', () => {
  const input = noise(12000), right = Float32Array.from(input, (x, i) => x * Math.sin(i * .19));
  for (const [type, params] of [['swirl', { stages: '12', clock: 'free', rate: 1.2, envAmount: 36, feedback: -.7 }], ['crumble', { bits: 5.7, sampleRate: 2300, jitter: .8, dither: .7, stereo: 'independent', prefilter: 'soft', transient: .4 }]]) {
    const normal = render(type, params, input, right, 128), tiny = render(type, params, input, right, 1), large = render(type, params, input, right, 511), worklet = render(type, params, input, right, 128, sr, isolated);
    for (const result of [tiny, large, worklet]) { assert.deepEqual(result.left, normal.left, type); assert.deepEqual(result.right, normal.right, type); }
    normal.effect.reset(); const reset = render(type, {}, input, right, 128, sr, dsp, false, normal.effect); assert.deepEqual(reset.left, normal.left); assert.deepEqual(reset.right, normal.right);
  }
  const params = { clock: 'sync', division: '1/8.', stereo: 130, depth: 60 }, reference = render('swirl', params, input, right, 128, sr, dsp, true), repartition = render('swirl', params, input, right, 511, sr, dsp, true);
  assert(difference(reference.left, repartition.left) < 1e-7, 'Musical-position phase locking is independent of block boundaries');
});

check('Extreme controls, automation and silence tails remain finite at 8 / 44.1 / 48 / 96 kHz', () => {
  for (const rate of [8000, 44100, 48000, 96000]) for (const type of ['swirl', 'crumble']) {
    const spec = dsp.specifications[type], params = Object.fromEntries(Object.entries(spec).map(([key, rule]) => [key, typeof rule[0] === 'number' ? rule[1] : rule[rule.length - 1]]));
    const effect = dsp.create(type, rate, params), source = noise(Math.round(rate * .15), 2), audio = render(type, {}, source, Float32Array.from(source, x => -x), 128, rate, dsp, false, effect);
    assert([...audio.left, ...audio.right].every(x => Number.isFinite(x) && Math.abs(x) <= 8));
    effect.setParams(Object.fromEntries(Object.entries(spec).map(([key, rule]) => [key, rule[0]])));
    const changed = render(type, {}, source, source, 128, rate, dsp, false, effect); assert(changed.left.every(Number.isFinite));
    effect.reset(); const silent = render(type, {}, new Float32Array(rate / 4), undefined, 128, rate, dsp, false, effect); assert.equal(rms(silent.left), 0);
    assert(Number.isFinite(effect.getTailTime())); assert(Object.values(effect.getMeters()).every(Number.isFinite));
  }
});

const cpu = {};
check('Representative stereo processing fits a 128-frame render deadline with headroom', () => {
  for (const type of ['swirl', 'crumble']) {
    const effect = dsp.create(type, sr, type === 'swirl' ? { stages: '12', depth: 60, feedback: .8, envAmount: 36 } : { bits: 5.7, sampleRate: 7000, jitter: .9, dither: .8, prefilter: 'soft', stereo: 'independent' });
    const left = new Float32Array(128), right = new Float32Array(128); let time = 0;
    for (let block = 0; block < 2000; block++) { for (let i = 0; i < 128; i++) { left[i] = .25 * Math.sin((time + i) * .03); right[i] = .2 * Math.sin((time + i) * .07); } effect.process(left, right, { tempo: 140 }); time += 128; }
    const start = performance.now();
    for (let block = 0; block < 2000; block++) { left.fill(.1); right.fill(-.1); effect.process(left, right, { tempo: 140 }); }
    cpu[type] = { averageBlockMs: (performance.now() - start) / 2000, deadlineMs: 128 / sr * 1000 };
    assert(cpu[type].averageBlockMs < cpu[type].deadlineMs * .65, JSON.stringify(cpu[type]));
  }
});
console.log(JSON.stringify({ passed, cpu }, null, 2));
