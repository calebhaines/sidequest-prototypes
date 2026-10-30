'use strict';
// Real PRESERVE signals: contract, spectral behaviour, motion, lifecycle and CPU.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
for (const file of ['tape-catalog.js', 'tape-dsp.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), { filename: file });
const factory = createLoomTapeDSP(), definition = LoomTapeCatalog[0], passed = [];
function check(name, run) { run(); passed.push(name); console.log('PASS ' + name); }
function tone(hz, count = 24000, amplitude = .2, rate = 48000) { return Float32Array.from({ length: count }, (_, i) => amplitude * Math.sin(2 * Math.PI * hz * i / rate)); }
function feed(effect, input, block = 137, rightInput = input) {
  const left = input.slice(), right = rightInput.slice();
  for (let at = 0; at < left.length; at += block) effect.process(left.subarray(at, at + block), right.subarray(at, at + block));
  return { left, right };
}
function rms(data, from = 0, to = data.length) { let power = 0; for (let i = from; i < to; i++) power += data[i] * data[i]; return Math.sqrt(power / Math.max(1, to - from)); }
function difference(a, b) { let maximum = 0, power = 0; for (let i = 0; i < a.length; i++) { const delta = a[i] - b[i]; maximum = Math.max(maximum, Math.abs(delta)); power += delta * delta; } return { maximum, rms: Math.sqrt(power / a.length) }; }
function projection(data, hz, rate = 48000, from = data.length / 2) { let real = 0, imaginary = 0; for (let i = from; i < data.length; i++) { real += data[i] * Math.cos(2 * Math.PI * hz * i / rate); imaginary += data[i] * Math.sin(2 * Math.PI * hz * i / rate); } return 2 * Math.hypot(real, imaginary) / (data.length - from); }
const audio = (patch, hz, amplitude = .2, count = 24000) => feed(factory.create(48000, patch), tone(hz, count, amplitude)).left;

check('Catalog, complete recipes and isolated Worklet factory share the exact 24-control contract', () => {
  assert.deepEqual(factory.normalize({}), definition.defaults);
  const malformed = { input: NaN, drive: Infinity, model: 'missing', speed: 15, bypass: 'true' }, before = { ...malformed };
  assert.deepEqual(factory.normalize(malformed), definition.defaults); assert.deepEqual(malformed, before);
  for (const param of definition.params) {
    const rule = factory.specifications[param.key]; assert(rule, param.key);
    if (param.type === 'range') assert.deepEqual(rule, [param.min, param.max, param.default], param.key);
    else assert.deepEqual(rule, param.options.map(option => option.value), param.key);
  }
  assert.equal(Object.keys(factory.specifications).length, 24);
  assert.equal(definition.presets.length, 8);
  const isolated = vm.runInNewContext('(' + createLoomTapeDSP.toString() + ')')();
  for (const recipe of definition.presets) {
    assert.deepEqual(factory.normalize(recipe.params), recipe.params, recipe.name);
    assert.deepEqual(feed(factory.create(48000, recipe.params), tone(731)), feed(isolated.create(48000, recipe.params), tone(731)), recipe.name);
  }
});

check('All machines are causal, silent at rest and finite at every supported sample-rate extreme', () => {
  for (const rate of [8000, 44100, 48000, 96000, 192000]) for (const model of factory.specifications.model) {
    const effect = factory.create(rate, { model, drive: 24, input: 18, output: 12, calibration: 6, warmth: 1, wear: 1, bias: -1, headBump: 1, wow: 1.5, flutter: .5, noise: 1, dropouts: 1, azimuth: 1, crosstalk: .1 });
    const quiet = feed(effect, new Float32Array(199)); assert(quiet.left.every(value => value === 0)); assert(quiet.right.every(value => value === 0));
    const input = new Float32Array(1559); input[139] = .7; input[200] = NaN; input[301] = Infinity; input[410] = -Infinity; input[512] = 1e30;
    const output = feed(effect, input, 73);
    assert(output.left.subarray(0, 139).every(value => value === 0), 'No audio before its impulse');
    for (const channel of [output.left, output.right]) assert(channel.every(value => Number.isFinite(value) && Math.abs(value) <= 8));
    for (const value of Object.values(effect.getMeters())) assert(Number.isFinite(value));
  }
});

check('Fresh and settled dry remain exact, and bypass/zero endpoints fade smoothly from a running head', () => {
  const input = tone(521, 16000), patch = { drive: 24, warmth: 1, wow: 1, flutter: .3, noise: .8, dropouts: .8 };
  for (const change of [{ mix: 0 }, { bypass: true }]) {
    const fresh = factory.create(48000, { ...patch, ...change }); assert.deepEqual(feed(fresh, input).left, input);
    const effect = factory.create(48000, patch); feed(effect, tone(731)); effect.setParams(change);
    const result = feed(effect, input); assert.deepEqual(result.left.subarray(12000), input.subarray(12000)); assert.deepEqual(result.right.subarray(12000), input.subarray(12000));
    assert.equal(effect.getMeters().transportMs, 0); assert.equal(effect.getLatencyTime(), 0); assert.equal(effect.getTailTime(), 0);
    const carrier = tone(997, 48000), moving = factory.create(48000, { warmth: .1, drive: 0, wow: .65, flutter: .08 });
    const before = feed(moving, carrier.subarray(0, 24000)); moving.setParams(change);
    assert(moving.getTailTime() > 0, 'A pending fade advertises its finite remaining tail');
    const after = feed(moving, carrier.subarray(24000));
    assert(Math.abs(after.left[0] - before.left[before.left.length - 1]) < .045, 'An endpoint cannot jump directly from a displaced head to direct dry');
    assert.deepEqual(after.left.subarray(12000), carrier.subarray(36000));
    moving.setParams({ bypass: false, mix: 1 }); const resumed = feed(moving, new Float32Array(12000));
    assert(resumed.left.every(value => value === 0), 'Re-enabling after settled dry cannot reveal stale tape/noise history');
  }
  const effect = factory.create(48000, {}), impulse = new Float32Array(64); impulse[0] = .2;
  const result = feed(effect, impulse);
  assert(Math.abs(result.left[0]) > .05, 'Default colour responds on the original first frame');
  assert.equal(effect.getMeters().transportMs, 0); assert.equal(effect.getLatencyTime(), 0);
});

check('Output trims the complete wet tape, including opted-in hiss', () => {
  const patch = { drive: 7, warmth: .7, noise: 1 }, input = tone(701, 24000, .08);
  const unity = feed(factory.create(48000, patch), input), quiet = feed(factory.create(48000, { ...patch, output: -24 }), input), clean = feed(factory.create(48000, { ...patch, noise: 0 }), input);
  const gain = 10 ** (-24 / 20), scaled = Float32Array.from(unity.left, value => value * gain);
  assert(difference(quiet.left, scaled).maximum < 1e-6, 'Hiss and tone share the same final output gain');
  assert(difference(unity.left, clean.left).rms > .001, 'The regression measures an actual hiss contribution');
});

check('Warmth rounds peaks and adds harmonics while Drive compensation and calibration retain their meanings', () => {
  const plain = audio({ warmth: 0, drive: 18, headBump: 0 }, 1000), warm = audio({ warmth: 1, drive: 18, headBump: 0 }, 1000);
  assert(projection(warm, 3000) > .002, 'Tape softening creates a real third harmonic');
  assert(projection(plain, 3000) < 1e-6, 'Warmth zero retains the linear head path');
  const low = rms(audio({ warmth: 1, drive: 12 }, 1000, .02), 12000) / .02, hot = rms(audio({ warmth: 1, drive: 12 }, 1000, .8), 12000) / .8;
  assert(hot < low * .65, 'Hot peaks compress instead of receiving a fixed waveshape gain');
  const linear = patch => rms(audio({ warmth: 0, headBump: 0, ...patch }, 1000, .001), 12000);
  const base = linear({ drive: 0 }), compensated = linear({ drive: 18 }), uncompensated = linear({ drive: 18, autoGain: 'off' }), calibrated = linear({ calibration: 6 });
  assert(Math.abs(compensated / base - 1) < 1e-5);
  assert(Math.abs(20 * Math.log10(uncompensated / compensated) - 18) < 1e-4);
  assert(Math.abs(calibrated / base - 1) < 1e-5, 'Calibration changes overload reference, not linear level');
  assert(difference(audio({ warmth: 1, drive: 12, calibration: -6 }, 1000), audio({ warmth: 1, drive: 12, calibration: 6 }, 1000)).rms > .005);
});

check('Speed, stock, model, bias, head bump and oxide wear make independent audible changes', () => {
  for (const model of factory.specifications.model) {
    const slow = rms(audio({ model, speed: '1.875', warmth: 0 }, 9000), 12000), fast = rms(audio({ model, speed: '30', warmth: 0 }, 9000), 12000);
    assert(fast > slow * 1.1, model + ' faster speed opens the head response');
  }
  const clean = audio({ warmth: 0, wear: 0 }, 9000), worn = audio({ warmth: 0, wear: 1 }, 9000);
  assert(rms(worn, 12000) < rms(clean, 12000) * .7, 'Wear ages HF without any wow/flutter');
  assert(rms(audio({ warmth: 0, headBump: 1 }, 60), 12000) > rms(audio({ warmth: 0, headBump: 0 }, 60), 12000) * 1.4);
  for (const stock of ['high-output', 'low-noise']) assert(difference(audio({ formula: stock, drive: 18, warmth: 1 }, 1000), audio({ formula: 'oxide', drive: 18, warmth: 1 }, 1000)).rms > .003);
  assert(difference(audio({ bias: -1, warmth: 1, drive: 18 }, 1100), audio({ bias: 1, warmth: 1, drive: 18 }, 1100)).rms > .003);
  assert(rms(audio({ warmth: 0, lowTrim: 6 }, 60), 12000) > rms(audio({ warmth: 0, lowTrim: -6 }, 60), 12000) * 2);
  assert(rms(audio({ warmth: 0, highTrim: 6 }, 9000), 12000) > rms(audio({ warmth: 0, highTrim: -6 }, 9000), 12000) * 2);
});

check('The four-times nonlinear path suppresses a folded fifth harmonic under hard tape drive', () => {
  const readings = {};
  for (const model of factory.specifications.model) {
    const output = audio({ model, warmth: 1, drive: 24, bias: -1 }, 9000), ratio = projection(output, 3000) / projection(output, 9000), dbc = 20 * Math.log10(Math.max(1e-12, ratio));
    assert(dbc < -35, model + ' folded alias: ' + dbc.toFixed(2) + 'dBc'); readings[model] = Number(dbc.toFixed(2));
  }
  console.log('9kHz carrier, folded fifth at3kHz dBc: ' + JSON.stringify(readings));
});

check('Transport is causal, percent-speed-based, independently audible and stereo linked without channel collapse', () => {
  const base = audio({ warmth: 0 }, 1000, .2, 48000), wow = audio({ warmth: 0, wow: .6 }, 1000, .2, 48000), flutter = audio({ warmth: 0, flutter: .2 }, 1000, .2, 48000);
  assert(difference(base, wow).rms > .02); assert(difference(base, flutter).rms > .01); assert(difference(wow, flutter).rms > .02);
  const input = tone(331, 48000), linked = factory.create(48000, { wow: .6, flutter: .15 }), loose = factory.create(48000, { wow: .6, flutter: .15, stereoLink: 0 });
  const a = feed(linked, input), b = feed(loose, input);
  assert.deepEqual(a.left, a.right, 'Linked mono remains centered'); assert(difference(b.left, b.right).rms > .01, 'Independent transport actually loosens the image');
  assert(linked.getMeters().transportMs > 0 && linked.getMeters().transportMs < linked.getTailTime() * 1000);
  const stereo = feed(factory.create(48000, {}), input, 128, new Float32Array(input.length)); assert(stereo.right.every(value => value === 0), 'Tape preserves an empty right channel by default');
  const cross = feed(factory.create(48000, { crosstalk: .1 }), input, 128, new Float32Array(input.length)); assert(rms(cross.right, 24000) > .005);
  const skew = feed(factory.create(48000, { azimuth: .9 }), tone(8000)); assert(difference(skew.left, skew.right).rms > .01);
});

check('Seeded hiss/dropouts and moving tape survive arbitrary block splits and reset exactly', () => {
  const patch = { model: 'home', wow: .7, flutter: .2, noise: .6, dropouts: 1, stereoLink: .5, wear: .8 }, input = tone(371, 48000 * 3);
  const a = factory.create(48000, patch), first = feed(a, input, 128), odd = feed(factory.create(48000, patch), input, 997);
  assert.deepEqual(first, odd, 'The sample clock and random sequence do not depend on block size');
  a.reset(); assert.deepEqual(feed(a, input, 73), first);
  const steady = feed(factory.create(48000, { ...patch, dropouts: 0 }), input); assert(difference(first.left, steady.left).rms > .001, 'Opted-in dropout losses occur, including partial stereo link');
  const noise = feed(factory.create(48000, { ...patch, dropouts: 0, noise: 0 }), input); assert(difference(steady.left, noise.left).rms > .0001, 'Signal-following hiss is real audio');
});

check('Meters measure real input/record/output energy and declared tails include gated hiss and hot head/filter decay', () => {
  const effect = factory.create(48000, { warmth: 0, input: 6, drive: 12, output: -2, headBump: 0 }), input = tone(1000, 48000, .1), output = feed(effect, input, input.length);
  const meter = effect.getMeters();
  assert(Math.abs(meter.inputDb - 20 * Math.log10(rms(input))) < 1e-5);
  assert(Math.abs(meter.tapeDb - meter.inputDb - 18) < 1e-5);
  assert(Math.abs(meter.outputDb - 20 * Math.log10(rms(output.left))) < 1e-5);
  assert(Math.abs(meter.compressionDb) < 1e-8); meter.inputDb = 1; assert.notEqual(effect.getMeters().inputDb, 1);
  for (const [rate, model] of [[8000, 'studio'], [8000, 'cassette'], [48000, 'valve']]) {
    const patch = { model, drive: 24, input: 18, output: 12, warmth: 1, headBump: 1, noise: 1, wow: 1.5, wowRate: .1, flutter: .5, flutterRate: 2, lowTrim: 6, highTrim: 6 };
    const instance = factory.create(rate, patch); feed(instance, new Float32Array(Math.round(rate * .02)).fill(8));
    const tail = feed(instance, new Float32Array(Math.ceil(rate * (instance.getTailTime() + .1))));
    assert(tail.left.subarray(-Math.round(rate * .05)).every(value => Math.abs(value) < 1e-6), model + ' advertised tail is too short');
    instance.reset(); assert.deepEqual(instance.getMeters(), { inputDb: -120, tapeDb: -120, outputDb: -120, compressionDb: 0, transportMs: 0 });
    assert(feed(instance, new Float32Array(1024)).left.every(value => value === 0), 'Panic/reset cannot generate idle hiss');
  }
});

check('Automated controls preserve finite audio and never reset the seeded transport clock', () => {
  const instance = factory.create(48000, { wow: .8, noise: .1 }), input = tone(417, 24000), left = input.slice(), right = input.slice();
  for (let at = 0; at < input.length; at += 32) {
    instance.setParams({ drive: (at / 32) % 25, warmth: (at % 1000) / 1000, bias: Math.sin(at / 3000), output: Math.sin(at / 5000) * 6 });
    instance.process(left.subarray(at, at + 32), right.subarray(at, at + 32));
  }
  assert(left.every(value => Number.isFinite(value) && Math.abs(value) <= 8)); assert(instance.getMeters().transportMs > 0);
  assert(difference(left, input).rms > .01);
  const renderBypass = block => {
    const effect = factory.create(48000, { wow: .6, flutter: .1 }), input = tone(311, 48000), left = input.slice(), right = input.slice();
    const changes = [[4800, { bypass: true }], [16800, { wowRate: 1.1, flutterRate: 11 }], [24000, { bypass: false }], [48000, null]];
    let at = 0;
    for (const [end, patch] of changes) {
      while (at < end) { const next = Math.min(end, at + block); effect.process(left.subarray(at, next), right.subarray(at, next)); at = next; }
      if (patch) effect.setParams(patch);
    }
    return { left, right };
  };
  assert.deepEqual(renderBypass(137), renderBypass(997), 'Rate edits during settled bypass retain a block-independent clock and clean re-enable');
});

// Informational timing uses reusable input/output blocks: it reports a practical
// desktop cost, without encoding a hardware-dependent pass/fail threshold.
const benchmark = [];
for (const patch of [{}, { model: 'cassette', wow: .8, flutter: .2, noise: .4, wear: .8, dropouts: .6 }, { bypass: true }, { mix: 0 }]) {
  const instances = Array.from({ length: 8 }, () => factory.create(48000, patch));
  const original = tone(731, 128), left = original.slice(), right = original.slice();
  for (let warm = 0; warm < 40; warm++) for (const effect of instances) { left.set(original); right.set(original); effect.process(left, right); }
  const began = performance.now();
  for (let at = 0; at < 24000; at += 128) for (const effect of instances) { left.set(original); right.set(original); effect.process(left, right); }
  benchmark.push({ instances: 8, patch: patch.bypass ? 'settled bypass' : patch.mix === 0 ? 'settled zero blend' : patch.model ? 'moving worn cassette with hiss/dropouts' : 'default steady studio', audioSeconds: .5, wallMilliseconds: Math.round(performance.now() - began) });
}
console.log('PRESERVE practical CPU timing: ' + JSON.stringify(benchmark));
console.log(passed.length + ' PRESERVE DSP checks passed.');
