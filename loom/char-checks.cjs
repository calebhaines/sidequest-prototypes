'use strict';
// CHAR: legacy fidelity, fifteen distinct circuits, lifecycle and serialized DSP.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
globalThis.window = globalThis;
for (const file of ['char-catalog.js', 'char-dsp.js', 'effects.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), { filename: file });
const C = createLoomCharDSP(), E = createLoomEffectsDSP(), definition = LoomCharCatalog;
// Shadow optional globals while keeping the old factory in this JS realm;
// contextified Math lookups otherwise make the fidelity fixtures needlessly slow.
const legacy = vm.runInThisContext('(function(globalThis){return (' + createLoomEffectsDSP.toString() + ');})')({})();
const isolated = vm.runInNewContext('(' + createLoomCharDSP.toString() + ')')();
const passed = [];
function check(name, run) { run(); passed.push(name); console.log('PASS ' + name); }
function signal(frames = 8192, rate = 48000, amplitude = .3) { return [0, 1].map(channel => Float32Array.from({ length: frames }, (_, i) => amplitude * (Math.sin(2 * Math.PI * (channel ? 233 : 997) * i / rate) + .17 * Math.sin(2 * Math.PI * (channel ? 1427 : 233) * i / rate)))); }
function feed(effect, audio = signal(), block = 137) { const output = audio.map(channel => channel.slice()); for (let at = 0; at < output[0].length; at += block) effect.process(output[0].subarray(at, at + block), output[1].subarray(at, at + block)); return output; }
function rms(data, from = 0, to = data.length) { let sum = 0; for (let i = from; i < to; i++) sum += data[i] * data[i]; return Math.sqrt(sum / Math.max(1, to - from)); }
function distance(a, b, start = 0) { let sum = 0, max = 0; for (let i = start; i < a.length; i++) { const delta = a[i] - b[i]; sum += delta * delta; max = Math.max(max, Math.abs(delta)); } return { rms: Math.sqrt(sum / Math.max(1, a.length - start)), max }; }
function projection(data, hz, rate = 48000, from = data.length / 2) { let real = 0, imaginary = 0; for (let i = from; i < data.length; i++) { real += data[i] * Math.cos(2 * Math.PI * hz * i / rate); imaginary += data[i] * Math.sin(2 * Math.PI * hz * i / rate); } return 2 * Math.hypot(real, imaginary) / (data.length - from); }
function sine(hz, frames = 24000, amplitude = .3, rate = 48000) { return Float32Array.from({ length: frames }, (_, i) => amplitude * Math.sin(2 * Math.PI * hz * i / rate)); }

check('Fifteen named circuits retain the complete original CHAR control and factory contract', () => {
  assert.equal(C.specifications.shape.length, 15); assert.equal(new Set(C.specifications.shape).size, 15);
  assert.deepEqual(C.specifications.shape, definition.params.find(param => param.key === 'shape').options.map(option => option.value));
  assert.deepEqual(C.normalize({}), definition.defaults); assert.deepEqual(E.normalize('cinder', {}), definition.defaults);
  assert.deepEqual(Object.keys(C.specifications).sort(), ['shape', 'drive', 'bias', 'tone', 'output', 'mix'].sort());
  assert.equal(definition.models.length, 15); assert(definition.models.every(model => model.description.length > 20));
  assert.deepEqual(C.normalize({ shape: 'missing', drive: NaN, tone: Infinity, bypass: 'true' }), definition.defaults);
  for (const model of C.specifications.shape) assert.equal(E.normalize('cinder', { shape: model }).shape, model);
});

check('The original soft, diode and fold audio remains bit-identical at every legacy control boundary', () => {
  const patches = [{}, { drive: 0, bias: -.75, tone: 300, output: -24, mix: 1 }, { drive: 36, bias: .75, tone: 20000, output: 6, mix: .35 }, { drive: 18, bias: .2, mix: 0 }, { drive: 24, bypass: true }];
  for (const rate of [8000, 44100, 48000, 96000]) for (const shape of ['soft', 'diode', 'fold']) for (const patch of patches) {
    const audio = signal(2057, rate), params = { ...patch, shape }, old = legacy.create('cinder', rate, params), current = C.create(rate, params);
    assert.deepEqual(feed(current, audio), feed(old, audio), shape + ' / ' + rate + ' / ' + JSON.stringify(patch));
    for (const update of [{ drive: 4, output: 0, mix: .8 }, { bias: -.17, tone: 1850 }, { bypass: false, mix: 1 }]) { current.setParams(update); old.setParams(update); assert.deepEqual(feed(current, audio), feed(old, audio), 'Legacy partial control update'); }
    current.reset(); old.reset(); assert.deepEqual(feed(current, audio), feed(old, audio), 'Legacy reset');
  }
});

check('Every circuit is independently audible beyond gain, and the twelve additions are not preset aliases', () => {
  const audio = signal(12000, 48000, .32), result = C.specifications.shape.map(shape => {
    const wet = feed(C.create(48000, { shape, drive: 12, output: 0, mix: 1, tone: 20000 }), audio)[0].subarray(4000), level = rms(wet); assert(level > .005, shape + ' has a usable signal'); return { shape, normalized: Float32Array.from(wet, value => value / level) };
  });
  let minimum = Infinity, pair;
  for (let a = 0; a < result.length; a++) for (let b = a + 1; b < result.length; b++) { const delta = distance(result[a].normalized, result[b].normalized).rms; if (delta < minimum) { minimum = delta; pair = [result[a].shape, result[b].shape]; } assert(delta > .004, result[a].shape + '/' + result[b].shape + ' must differ beyond level: ' + delta); }
  console.log('  closest normalized circuits:', pair.join('/'), minimum.toFixed(5));
});

check('The self-contained ninth factory, arbitrary blocks and in-flight circuit changes give identical stereo audio', () => {
  for (const shape of C.specifications.shape) { const params = { shape, drive: 19, bias: -.13, output: -3, mix: .7 }; assert.deepEqual(feed(C.create(48000, params)), feed(isolated.create(48000, params), signal(), 251), shape); }
  const audio = signal(12000), changes = [{ at: 1431, patch: { shape: 'gated' } }, { at: 3317, patch: { shape: 'diode', drive: 7 } }, { at: 5209, patch: { shape: 'broken', mix: 0 } }, { at: 5423, patch: { mix: .8, bias: .27 } }, { at: 8327, patch: { shape: 'sinefold', bypass: true } }, { at: 9071, patch: { bypass: false } }];
  function render(block) { const effect = C.create(48000, { shape: 'opamp', drive: 15, mix: 1 }), result = audio.map(channel => channel.slice()); let change = 0; for (let at = 0; at < audio[0].length;) { if (changes[change]?.at === at) effect.setParams(changes[change++].patch); const end = Math.min(audio[0].length, at + block, changes[change]?.at ?? Infinity); effect.process(result[0].subarray(at, end), result[1].subarray(at, end)); at = end; } return result; }
  const reference = render(1); for (const block of [73, 128, 251, 1024]) assert.deepEqual(render(block), reference, 'Control transitions must not depend on block size ' + block);
  const isolatedEffects = vm.runInNewContext('(' + createLoomEffectsDSP.toString() + ')');
  const linked = isolatedEffects(null, null, null, null, null, null, null, null, vm.runInNewContext('(' + createLoomCharDSP.toString() + ')'));
  assert.deepEqual(feed(linked.create('cinder', 48000, { shape: 'broken', drive: 18 })), feed(C.create(48000, { shape: 'broken', drive: 18 })));
});

check('All modes stay causal, silent at rest, bounded and finite across sample-rate and input extremes', () => {
  for (const rate of [8000, 44100, 48000, 192000]) for (const shape of C.specifications.shape) {
    const effect = C.create(rate, { shape, drive: 36, bias: .75, tone: 20000, output: 6, mix: 1 }); assert(feed(effect, [new Float32Array(193), new Float32Array(193)])[0].every(value => value === 0), shape + ' silence');
    const left = new Float32Array(1331), right = new Float32Array(1331); left[139] = .7; left[211] = NaN; left[351] = Infinity; left[511] = 1e30; right[181] = -.5; const out = feed(effect, [left, right]);
    assert(out[0].subarray(0, 139).every(value => value === 0)); assert(out[1].subarray(0, 181).every(value => value === 0));
    for (const channel of out) assert(channel.every(value => Number.isFinite(value) && Math.abs(value) <= 8), shape);
    for (const value of Object.values(effect.getMeters())) assert(Number.isFinite(value)); assert.equal(effect.getLatencyTime(), 0);
    effect.reset(); assert(feed(effect, [new Float32Array(512), new Float32Array(512)])[0].every(value => value === 0));
  }
});

check('New circuit changes and parameter moves are continuous; bypass and Blend endpoints settle to exact dry', () => {
  const audio = [sine(137, 26000, .16), sine(211, 26000, .12)];
  for (const shape of C.specifications.shape.slice(3)) {
    const effect = C.create(48000, { shape: 'soft', drive: 15, mix: 1 }), before = feed(effect, audio.map(channel => channel.subarray(0, 9000))); effect.setParams({ shape }); const after = feed(effect, audio.map(channel => channel.subarray(9000)));
    assert(Math.abs(after[0][0] - before[0][before[0].length - 1]) < 1e-7, shape + ' starts its circuit change on the previous output');
    const impulse = new Float32Array(64); impulse[0] = .8; assert(Math.abs(feed(C.create(48000, { shape, drive: 12, output: 0, mix: 1 }), [impulse, impulse])[0][0]) > 1e-9, shape + ' responds on its first input frame');
    for (const endpoint of [{ bypass: true }, { mix: 0 }]) { const moving = C.create(48000, { shape, drive: 24, mix: 1 }); feed(moving); moving.setParams(endpoint); const dry = signal(16000); const settled = feed(moving, dry); assert.deepEqual(settled[0].subarray(14000), dry[0].subarray(14000)); assert.deepEqual(settled[1].subarray(14000), dry[1].subarray(14000)); moving.setParams({ mix: 1, bypass: false }); const quiet = feed(moving, [new Float32Array(1024), new Float32Array(1024)]); assert(quiet[0].every(value => value === 0), shape + ' cannot resurrect old signal history'); }
  }
});

check('Rectification adds octave content, LED clipping leaves more attack, and the starved gate closes on quiet tails', () => {
  const tone = sine(997, 24000, .3), render = (shape, patch = {}) => feed(C.create(48000, { shape, drive: 12, output: 0, tone: 20000, mix: 1, ...patch }), [tone, tone])[0];
  const soft = render('soft'), rectified = render('rectifier'); assert(projection(rectified, 1994) > projection(soft, 1994) * 10 + .01, 'Rectifier must generate meaningful even harmonics.');
  const attackTone = sine(997, 24000, .45), hard = feed(C.create(48000, { shape: 'hard', drive: 8, output: 0, mix: 1, tone: 20000 }), [attackTone, attackTone])[0], led = feed(C.create(48000, { shape: 'led', drive: 8, output: 0, mix: 1, tone: 20000 }), [attackTone, attackTone])[0]; assert(projection(hard, 2991) > projection(led, 2991) * 3 + .002, 'LED has a higher clipping knee, rather than a renamed hard clip.');
  const gated = C.create(48000, { shape: 'gated', drive: 12, output: 0, mix: 1 }), reference = C.create(48000, { shape: 'hard', drive: 12, output: 0, mix: 1 }); feed(gated, signal()); feed(reference, signal()); const quiet = sine(997, 24000, .001), closed = feed(gated, [quiet, quiet])[0], open = feed(reference, [quiet, quiet])[0]; assert(rms(closed, 20000) < rms(open, 20000) * .1, 'The gate must close on a low-level tail.');
});

check('The new oversampled clipping path suppresses folded high harmonics against naive host-rate hard clipping', () => {
  const tone = sine(9000, 24000, .35), wet = feed(C.create(48000, { shape: 'hard', drive: 18, output: 0, mix: 1, tone: 20000 }), [tone, tone])[0], naive = Float32Array.from(tone, value => Math.max(-1, Math.min(1, value * 10 ** (18 / 20))));
  const relative = data => projection(data, 3000) / Math.max(1e-9, projection(data, 9000));
  const reduction = 20 * Math.log10(relative(naive) / Math.max(1e-9, relative(wet))); assert(reduction > 6, 'Four-times path should reduce the folded fifth relative to its carrier: ' + reduction + ' dB'); console.log('  high-tone folded fifth improvement:', reduction.toFixed(1), 'dB');
});

console.log(passed.length + ' CHAR circuit, legacy, signal and lifecycle groups passed.');
