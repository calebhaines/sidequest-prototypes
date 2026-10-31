'use strict';
// Portable source checks for the real-time/offline SAUTÉ DSP factory.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
for (const name of ['preamp-catalog.js', 'preamp-dsp.js', 'tape-dsp.js', 'char-dsp.js', 'effects.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, name), 'utf8'), { filename: name });
const factory = createLoomPreampDSP(), models = factory.specifications.model, passed = [];
function check(name, fn) { fn(); passed.push(name); console.log('PASS ' + name); }
function feed(effect, input, block = 137) {
  const left = input.slice(), right = input.slice();
  for (let at = 0; at < input.length; at += block) effect.process(left.subarray(at, at + block), right.subarray(at, at + block));
  return { left, right };
}
function rms(a, start = 0) { let sum = 0; for (let i = start; i < a.length; i++) sum += a[i] ** 2; return Math.sqrt(sum / Math.max(1, a.length - start)); }
function tone(hz, frames = 12000, rate = 48000, amplitude = .2) { return Float32Array.from({ length: frames }, (_, i) => amplitude * Math.sin(2 * Math.PI * hz * i / rate)); }
function projection(a, hz, rate = 48000) {
  let x = 0, y = 0; const start = a.length / 2;
  for (let i = start; i < a.length; i++) { x += a[i] * Math.cos(2 * Math.PI * hz * i / rate); y += a[i] * Math.sin(2 * Math.PI * hz * i / rate); }
  return 2 * Math.hypot(x, y) / (a.length - start);
}
check('The catalog and self-contained seventh factory have the same parameter contract and no silent fallback', () => {
  const definition = LoomPreampCatalog[0];
  assert.equal(models.length, 13); assert.equal(new Set(models).size, 13);
  assert.deepEqual(factory.normalize({}), definition.defaults);
  const malformed = { input: NaN, drive: Infinity, colour: '1', model: 'missing', bypass: 'true' }, snapshot = { ...malformed };
  const normalized = factory.normalize(malformed);
  assert.deepEqual(malformed, snapshot); assert.deepEqual(normalized, definition.defaults);
  for (const param of definition.params) {
    const spec = factory.specifications[param.key]; assert(spec, param.key);
    if (param.type === 'range') assert.deepEqual(spec, [param.min, param.max, param.default], param.key);
    else { assert.deepEqual(new Set(spec), new Set(param.options.map(item => item.value))); assert.equal(normalized[param.key], param.default); }
  }
  const context = { Math, Number, Object, Float32Array, Float64Array, Int32Array };
  const isolatedFactory = vm.runInNewContext('(' + createLoomPreampDSP.toString() + ')', context);
  const isolatedEffects = vm.runInNewContext('(' + createLoomEffectsDSP.toString() + ')', context);
  const effects = isolatedEffects(null, null, null, null, null, null, isolatedFactory);
  const a = tone(739);
  for (const model of models) assert.deepEqual(feed(effects.create('saute', 48000, { model }), a), feed(factory.create(48000, { model }), a), model);
  assert.throws(() => isolatedEffects().create('saute', 48000, {}), /requires createLoomPreampDSP/);
});
check('Every model is causal, quiet at rest and bounded under malformed audio at four sample rates', () => {
  for (const rate of [8000, 44100, 48000, 192000]) for (const model of models) {
    const effect = factory.create(rate, { model, input: 24, drive: 36, colour: 1, transformer: 1, headroom: -12, bias: -1, feedback: 1, slew: 1 });
    const zero = feed(effect, new Float32Array(257)); assert(zero.left.every(x => x === 0), model + ' silence at ' + rate);
    const input = new Float32Array(1031); input[139] = .2; input[200] = NaN; input[220] = Infinity; input[250] = -Infinity; input[360] = 1e30;
    const audio = feed(effect, input, 73); assert(audio.left.subarray(0, 139).every(x => x === 0), model + ' causality');
    assert(audio.left.every(x => Number.isFinite(x) && Math.abs(x) <= 8), model + ' finite safety');
    assert.deepEqual(audio.left, audio.right, model + ' stereo consistency');
  }
});
check('Calibrated RMS meters measure input, driven stage and actual blended output', () => {
  const effect = factory.create(48000, { model: 'clean', input: 6, drive: 12, output: -2, compensate: 'on', mix: 1 });
  const input = new Float32Array(1024).fill(.1); feed(effect, input, 1024);
  const meter = effect.getMeters();
  assert(Math.abs(meter.inputDb + 20) < 1e-5); assert(Math.abs(meter.stageDb + 2) < 1e-5); assert(Math.abs(meter.outputDb + 16) < 1e-5);
  assert(Math.abs(meter.inputPeak - .1) < 1e-6); assert(Math.abs(meter.outputPeak - .1 * 10 ** (4 / 20)) < 1e-6);
  meter.inputDb = 99; assert.notEqual(effect.getMeters().inputDb, 99, 'meter snapshots cannot mutate DSP');
  effect.setParams({ bypass: true }); feed(effect, input, 1024); assert(Math.abs(effect.getMeters().outputDb + 20) < 1e-5, 'bypass output meter reads dry');
  effect.reset(); assert.deepEqual(effect.getMeters(), { inputDb: -120, stageDb: -120, outputDb: -120, inputPeak: 0, outputPeak: 0 });
});
check('The preamp tone filters reject the intended bands and the low-pass off position preserves treble', () => {
  const audio = (patch, hz) => feed(factory.create(48000, { model: 'clean', drive: 0, ...patch }), tone(hz)).left;
  assert(rms(audio({ lowCut: 400 }, 40), 6000) < rms(audio({}, 40), 6000) * .13, 'high-pass low-frequency rejection');
  assert(rms(audio({ highCut: 2000 }, 12000), 6000) < rms(audio({ highCut: 22000 }, 12000), 6000) * .22, 'low-pass high-frequency rejection');
  assert(rms(audio({ lowGain: 12, lowFreq: 200 }, 40), 6000) > rms(audio({}, 40), 6000) * 3, 'low shelf boosts lows');
  assert(rms(audio({ highGain: 12, highFreq: 2000 }, 12000), 6000) > rms(audio({}, 12000), 6000) * 3, 'high shelf boosts highs');
});
check('Low-frequency cleanup tails include a maximally amplified one-hertz high-pass decay', () => {
  for (const rate of [8000, 48000]) for (const model of ['clean', 'iron-73']) {
    const effect = factory.create(rate, { model, colour: 0, lowCut: 1, compensate: 'off', input: 24, drive: 36, output: 18, lowGain: 12, highGain: 12 });
    feed(effect, new Float32Array(Math.ceil(rate * .02)).fill(.8));
    assert(effect.getTailTime() > 2, 'one-hertz high-pass needs more than the ordinary circuit tail');
    const tail = feed(effect, new Float32Array(Math.ceil(rate * (effect.getTailTime() + .025))));
    assert(tail.left.subarray(-Math.ceil(rate * .025)).every(x => Math.abs(x) < 1e-6), model + ' tail advertised too short');
  }
});
check('The four-times nonlinear path keeps a folded high-frequency fifth harmonic below minus thirty dBc', () => {
  const measurements = {};
  for (const model of ['iron-73', 'punch-312', 'tube-610', 'redd-47', 'tg-2']) {
    const audio = feed(factory.create(48000, { model, drive: 24, colour: 1 }), tone(9000, 24000)).left;
    const folded = 20 * Math.log10(Math.max(1e-12, projection(audio, 3000)) / Math.max(1e-12, projection(audio, 9000)));
    assert(folded < -30, model + ' folded alias too strong: ' + folded); measurements[model] = Number(folded.toFixed(2));
  }
  console.log('Folded 3 kHz from a 9 kHz carrier, dBc: ' + JSON.stringify(measurements));
});
console.log(passed.length + ' SAUTÉ DSP checks passed.');
