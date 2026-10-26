'use strict';
// Actual STRAINER DSP: spectral measurements, follower dynamics, timing,
// serialization, partitioning and extreme settings. No substitute model.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
for (const file of ['filter-dsp.js', 'filter-catalog.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), { filename: file });
const factory = createLoomFilterDSP(), definition = LoomFilterCatalog[0], sr = 48000, passed = [];
const serialized = vm.runInNewContext('(' + createLoomFilterDSP.toString() + ')', { Math, Number, Object, Float32Array, Float64Array })();
const check = (name, test) => { test(); passed.push(name); };
function tone(hz, amplitude = .1, seconds = .4, rate = sr) { return Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => amplitude * Math.sin(2 * Math.PI * hz * i / rate)); }
function rms(source, start = Math.floor(source.length / 2)) { let sum = 0; for (let i = start; i < source.length; i++) sum += source[i] ** 2; return Math.sqrt(sum / (source.length - start)); }
function difference(a, b) { let peak = 0; for (let i = 0; i < a.length; i++) peak = Math.max(peak, Math.abs(a[i] - b[i])); return peak; }
function render(params, source = tone(440), options = {}) {
  const rate = options.rate || sr, fx = (options.factory || factory).create('strainer', rate, params), left = source.slice(), right = (options.right || source).slice(), size = options.size || 128;
  for (let at = 0; at < left.length; at += size) fx.process(left.subarray(at, at + size), right.subarray(at, at + size), { tempo: options.tempo || 120, playing: true, beat: at / rate * (options.tempo || 120) / 60 });
  return { left, right, fx };
}
check('Catalog, defaults, parameter bounds, groups and meter contract agree', () => {
  assert.equal(definition.id, 'strainer'); assert.deepEqual(factory.normalize('strainer', {}), definition.defaults);
  assert.deepEqual([...definition.params.map(param => param.key), 'mix'].sort(), Object.keys(factory.specifications.strainer).sort());
  for (const param of definition.params) {
    const rule = factory.specifications.strainer[param.key];
    if (param.type === 'range') { assert.equal(param.min, rule[0]); assert.equal(param.max, rule[1]); assert.equal(param.default, rule[2]); }
    else assert.deepEqual(param.options.map(option => option.value).sort(), [...rule].sort());
  }
  assert.deepEqual(definition.groups.flatMap(group => group.keys).sort(), [...definition.params.map(param => param.key), 'mix'].sort());
  assert(definition.meters.every(meter => Number.isFinite(render({}).fx.getMeters()[meter.key])));
  assert.throws(() => factory.normalize('missing', {}), /Unknown/);
  const normalized = factory.normalize('strainer', { cutoff: Infinity, resonance: 3, envAttack: -1, model: 'missing' });
  assert.equal(normalized.cutoff, 1200); assert.equal(normalized.resonance, 1); assert.equal(normalized.envAttack, .1); assert.equal(normalized.model, 'clean');
});
check('True low/high/band/notch responses and the steeper slope are audible and measurable', () => {
  const params = { cutoff: 1000, resonance: 0, mode: 'lowpass' }, low = tone(80), center = tone(1000), high = tone(8000);
  const lpLow = rms(render(params, low).left), lpHigh = rms(render(params, high).left);
  assert(lpLow > rms(low) * .98); assert(lpHigh < rms(high) * .018);
  assert(rms(render({ ...params, slope: '24' }, high).left) < lpHigh * .025);
  assert(rms(render({ ...params, mode: 'highpass' }, low).left) < rms(low) * .007);
  assert(rms(render({ ...params, mode: 'highpass' }, high).left) > rms(high) * .98);
  assert(rms(render({ ...params, mode: 'bandpass', resonance: .7 }, center).left) > rms(center) * .97);
  assert(rms(render({ ...params, mode: 'bandpass', resonance: .7 }, high).left) < rms(high) * .012);
  assert(rms(render({ ...params, mode: 'notch' }, center).left) < rms(center) * .0001);
  assert(rms(render({ ...params, mode: 'notch' }, low).left) > rms(low) * .98);
});
check('Resonance changes the spectral peak; four circuits produce distinct character', () => {
  const source = tone(1000, .002), mild = render({ cutoff: 1000, resonance: 0 }, source), resonant = render({ cutoff: 1000, resonance: .8 }, source);
  assert(rms(resonant.left) > rms(mild.left) * 20);
  const colors = ['clean', 'ladder', 'diode', 'comb'].map(model => render({ model, cutoff: 800, resonance: .7, drive: 6 }, Float32Array.from(tone(380), (x, i) => x + .04 * Math.sin(i * .71))).left);
  for (let a = 0; a < colors.length; a++) for (let b = a + 1; b < colors.length; b++) assert(difference(colors[a], colors[b]) > .005, a + ' and ' + b + ' must differ');
});
check('Stereo-linked peak and RMS followers open, close and release from actual input', () => {
  for (const envMode of ['peak', 'rms']) {
    const source = tone(330, .3, .6), rising = render({ cutoff: 200, envMode, envAmount: 48, sensitivity: -20, envAttack: 2, envRelease: 80 }, source, { right: Float32Array.from(source, x => -x) });
    const active = rising.fx.getMeters(); assert(active.envelope > .95); assert(active.cutoffLHz > 2700); assert.equal(active.cutoffLHz, active.cutoffRHz);
    const negative = render({ cutoff: 3200, envMode, envAmount: -48, sensitivity: -20, envAttack: 2 }, source).fx.getMeters(); assert(negative.cutoffLHz < 240);
    const silence = new Float32Array(sr); for (let at = 0; at < silence.length; at += 128) rising.fx.process(silence.slice(at, at + 128), silence.slice(at, at + 128));
    const released = rising.fx.getMeters(); assert(released.envelope < .003); assert(released.cutoffLHz < 204); assert(released.envelopeDb < -65);
  }
  const quiet = render({ cutoff: 200, envAmount: 48, sensitivity: -10 }, tone(440, .002)).fx.getMeters(); assert(quiet.cutoffLHz < 205);
  const body = tone(40, .1), open = render({ envAmount: 48, detectorHP: 20 }, body).fx.getMeters(), ignored = render({ envAmount: 48, detectorHP: 1500 }, body).fx.getMeters(); assert(open.envelope > ignored.envelope * 20);
});
check('LFO sync follows tempo, stereo offset moves channels, and sample/hold is deterministic', () => {
  const params = { clock: 'sync', division: '1/4', lfoAmount: 24, cutoff: 1000, stereo: 1, shape: 'sine' }, source = tone(220, .1, .13);
  const moving = render(params, source).fx.getMeters(); assert(Math.abs(moving.cutoffLHz - moving.cutoffRHz) > 1000);
  const slow = render({ ...params, stereo: 0 }, source, { tempo: 60 }).fx.getMeters(), fast = render({ ...params, stereo: 0 }, source, { tempo: 240 }).fx.getMeters(); assert(Math.abs(slow.cutoffLHz - fast.cutoffLHz) > 1000);
  const held = { ...params, shape: 'samplehold', stereo: .6 }; assert.deepEqual(render(held, source).left, render(held, source).left);
});
check('No onset is removed or advanced, dry/bypass are exact, and reset restores the initial result', () => {
  const impulse = new Float32Array(2048); impulse[41] = .25;
  for (const model of ['clean', 'ladder', 'diode', 'comb']) {
    const result = render({ model, cutoff: 1000, resonance: .7 }, impulse); assert.equal(result.left.findIndex(x => x !== 0), 41, model + ' must retain source onset');
    assert.deepEqual(render({ model, mix: 0, drive: 20, output: 10 }, impulse).left, impulse);
    assert.deepEqual(render({ model, bypass: true, drive: 20, output: 10 }, impulse).left, impulse);
    result.fx.reset(); const again = impulse.slice(); result.fx.process(again, impulse.slice(), { tempo: 120, playing: true, beat: 0 }); assert.deepEqual(again, result.left);
  }
});
check('Serialized factory and changing render partitions preserve stereo audio', () => {
  const source = Float32Array.from(tone(110, .2, .2), (x, i) => x + .05 * Math.sin(i * .173));
  for (const model of ['clean', 'ladder', 'diode', 'comb']) {
    const params = { model, cutoff: 1700, resonance: .75, envAmount: -19, lfoAmount: 17, shape: 'triangle', stereo: .7, drive: 4, mix: .7 };
    const reference = render(params, source, { size: 128 });
    assert.deepEqual(render(params, source, { factory: serialized }).left, reference.left);
    for (const size of [1, 43, 511]) { const other = render(params, source, { size }); assert.equal(difference(reference.left, other.left), 0); assert.equal(difference(reference.right, other.right), 0); }
    const synced = { ...params, clock: 'sync', division: '1/32', shape: 'samplehold' };
    assert(difference(render(synced, source, { size: 128 }).left, render(synced, source, { size: 43 }).left) < 1e-6);
  }
});
check('Turning Input heat back to zero cannot expose an unsmoothed high-gain path', () => {
  const fx = factory.create('strainer', sr, { cutoff: 18000, resonance: 0, drive: 30 }), signal = new Float32Array(4096).fill(.15), right = signal.slice();
  fx.process(signal, right); let previous = signal[signal.length - 1];
  fx.setParams({ drive: 0 });
  const changed = new Float32Array(128).fill(.15); fx.process(changed, changed.slice());
  for (const sample of changed) { assert(Math.abs(sample - previous) < .02, 'No gain-switch discontinuity'); assert(Math.abs(sample) < .4); previous = sample; }
  const settled = new Float32Array(sr / 2).fill(.15); fx.process(settled, settled.slice()); assert(Math.abs(settled[settled.length - 1] - .15) < .0001);
});
check('Every preset, circuit, response and extreme remains finite at supported sample rates', () => {
  for (const rate of [8000, 44100, 48000, 96000, 192000]) {
    const source = Float32Array.from(tone(173, 1.5, .04, rate), (x, i) => x + (i % 31 === 0 ? 4 : 0));
    for (const model of ['clean', 'ladder', 'diode', 'comb']) for (const mode of ['lowpass', 'highpass', 'bandpass', 'notch']) for (const cutoff of [20, 20000]) {
      const result = render({ model, mode, cutoff, resonance: 1, slope: '24', drive: 30, output: 12, envAmount: 72, envAttack: .1, envRelease: 5, rate: 20, lfoAmount: 72, stereo: 1 }, source, { rate });
      assert(result.left.every(x => Number.isFinite(x) && Math.abs(x) <= 8)); assert(result.right.every(x => Number.isFinite(x) && Math.abs(x) <= 8));
      assert(Object.values(result.fx.getMeters()).every(Number.isFinite));
    }
  }
  for (const preset of definition.presets) { const result = render({ ...definition.defaults, ...preset.params }); assert(rms(result.left, 0) > 1e-5, preset.name + ' audible'); }
});
const benchmark = {};
check('Warm 128-frame processing stays inside one insert’s realtime budget', () => {
  for (const rate of [44100, 48000, 96000]) for (const model of ['clean', 'ladder', 'diode', 'comb']) {
    const fx = factory.create('strainer', rate, { model, cutoff: 1100, resonance: .8, envAmount: 24, lfoAmount: 24, stereo: 1, slope: '24' }), source = tone(330, .2, 128 / rate, rate);
    for (let n = 0; n < 200; n++) fx.process(source.slice(), source.slice(), { tempo: 120 });
    const left = source.slice(), right = source.slice(), start = performance.now(); for (let n = 0; n < 1200; n++) fx.process(left, right, { tempo: 120 });
    benchmark[model + '@' + rate] = (performance.now() - start) / 1200; assert(benchmark[model + '@' + rate] < 128 / rate * 1000 * .7, model + ' deadline: ' + benchmark[model + '@' + rate]);
  }
});
console.log(JSON.stringify({ passed, averageBlockMs: benchmark }, null, 2));
