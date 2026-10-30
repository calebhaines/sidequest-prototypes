'use strict';
// Independent SAUTÉ signal-law probes. These use the portable source factory,
// known linear gain identities, and spectral projections rather than UI state.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
for (const name of ['preamp-dsp.js', 'tape-dsp.js', 'effects.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, name), 'utf8'), { filename: name });
const dsp = createLoomPreampDSP(), sr = 48000, models = dsp.specifications.model, passed = [], measurements = {};
const safeContext = { Math, Number, Object, Float32Array, Float64Array, Int32Array, Uint8Array };
const isolated = vm.runInNewContext('(' + createLoomPreampDSP.toString() + ')', safeContext)();
function check(name, fn) { fn(); passed.push(name); console.log('PASS ' + name); }
function source(frames = 8192, rate = sr) {
  let word = 0x165379a2;
  return Float32Array.from({ length: frames }, (_, i) => {
    word ^= word << 13; word ^= word >>> 17; word ^= word << 5;
    return .11 * Math.sin(2 * Math.PI * 93 * i / rate) + .065 * Math.sin(2 * Math.PI * 1913 * i / rate) + .018 * ((word >>> 0) / 4294967296 * 2 - 1);
  });
}
function tone(hz, amplitude = .2, frames = sr / 2, rate = sr) { return Float32Array.from({ length: frames }, (_, i) => amplitude * Math.sin(2 * Math.PI * hz * i / rate)); }
function rms(a, from = 0) { let sum = 0; for (let i = from; i < a.length; i++) sum += a[i] * a[i]; return Math.sqrt(sum / Math.max(1, a.length - from)); }
function delta(a, b, from = 0) { let sum = 0; for (let i = from; i < a.length; i++) sum += (a[i] - b[i]) ** 2; return Math.sqrt(sum / Math.max(1, a.length - from)); }
function maximum(a) { let p = 0; for (const x of a) p = Math.max(p, Math.abs(x)); return p; }
function feed(e, a, b = a, block = 128) { const l = a.slice(), r = b.slice(); for (let at = 0; at < a.length; at += block) e.process(l.subarray(at, at + block), r.subarray(at, at + block)); return { l, r }; }
function render(p, a = source(), b = a, rate = sr, factory = dsp, block = 128) { return feed(factory.create(rate, p), a, b, block); }
function projection(a, hz, rate = sr, from = a.length / 2) { let re = 0, im = 0; for (let i = from; i < a.length; i++) { re += a[i] * Math.cos(2 * Math.PI * hz * i / rate); im += a[i] * Math.sin(2 * Math.PI * hz * i / rate); } return 2 * Math.hypot(re, im) / (a.length - from); }
function nominalGain(p) { return 10 ** (((p.input || 0) + ((p.compensate || 'on') === 'off' ? p.drive || 0 : 0) + (p.output || 0) - Number(p.pad === 'off' || p.pad === undefined ? 0 : p.pad)) / 20) * (p.polarity === 'invert' ? -1 : 1); }

check('Analytic local feedback stays monotone and solves its stated circuit equation across the complete operating range', () => {
  // Compile the shipped local-loop function itself into a test-only scope. A
  // separate bisection solves the implicit feedback equation numerically, so
  // this regression catches wrong-sign/descending approximate-solver results.
  const source = createLoomPreampDSP.toString(), start = source.indexOf('function closedLoop('), end = source.indexOf('let firstBaseline', start);
  assert(start >= 0 && end > start, 'The documented local feedback solver must be available for numerical review');
  const actual = vm.runInNewContext('(' + source.slice(start, end).trim() + ')', { Math });
  let largestResidual = 0, largestError = 0;
  for (const feedback of [0, .1, .5, 2, 6, 12, 17.6]) {
    let prior = -Infinity;
    for (let i = 0; i <= 800; i++) {
      const input = -4 + i * .01, y = actual(input, feedback), u = (1 + feedback) * input - feedback * y, residual = Math.abs(y - u / (1 + Math.abs(u)));
      let lo = -1, hi = 1;
      for (let j = 0; j < 48; j++) { const middle = (lo + hi) / 2, feed = (1 + feedback) * input - feedback * middle; if (middle > feed / (1 + Math.abs(feed))) hi = middle; else lo = middle; }
      const error = Math.abs(y - (lo + hi) / 2);
      largestResidual = Math.max(largestResidual, residual); largestError = Math.max(largestError, error);
      assert(y >= prior - 1e-12, 'Descending transfer at feedback ' + feedback + ', input ' + input);
      assert(residual < 1e-10 && error < 1e-10, 'Unconverged feedback solution at ' + feedback + '/' + input);
      prior = y;
    }
  }
  measurements.maximumFeedbackEquationResidual = largestResidual; measurements.maximumFeedbackBisectionError = largestError;
});

check('Nominal gain compensation removes Drive only; pad, Input, Output, wet polarity and blend retain their meanings', () => {
  const a = source(4096), b = Float32Array.from(a, (x, i) => x * Math.cos(i * .019));
  const cases = [
    { input: 6, drive: 24, output: -3, pad: 'off', compensate: 'on' },
    { input: 20, drive: 36, output: 0, pad: '20', compensate: 'on' },
    { input: -4, drive: 12, output: -8, pad: '10', compensate: 'off' },
    { input: 3, drive: 9, output: -6, compensate: 'on', polarity: 'invert', mix: .37 }
  ];
  let maxError = 0;
  for (const model of models) for (const patch of cases) {
    const p = { model, colour: 0, lowCut: 0, highCut: 22000, lowGain: 0, highGain: 0, ...patch }, got = render(p, a, b), gain = nominalGain(p), mix = p.mix ?? 1;
    for (const [audio, input] of [[got.l, a], [got.r, b]]) for (let i = 0; i < a.length; i++) {
      const expected = Math.fround(input[i] + (input[i] * gain - input[i]) * mix), error = Math.abs(audio[i] - expected); maxError = Math.max(maxError, error);
      assert(error < 2e-7, model + ' gain identity at ' + i + ': ' + audio[i] + ' vs ' + expected);
    }
  }
  measurements.maximumLinearGainIdentityError = maxError;
});

check('Compensated Drive automation cannot create a temporary loudness burst in the uncoloured gain path', () => {
  let largestError = 0;
  for (const model of ['clean', 'iron-73', 'tube-610']) for (const [from, to] of [[0, 36], [36, 0], [6, 24]]) {
    const e = dsp.create(sr, { model, colour: 0, drive: from, compensate: 'on', input: 3, output: -3 });
    const a = new Float32Array(4096).fill(.01); feed(e, a); e.setParams({ drive: to }); const got = feed(e, a).l;
    for (const x of got) { largestError = Math.max(largestError, Math.abs(x - a[0])); assert(Math.abs(x - a[0]) < 2e-7, model + ' compensated Drive ' + from + ' to ' + to + ' created a gain burst: ' + x); }
  }
  measurements.maximumCompensatedDriveAutomationError = largestError;
});

check('Transparent mode ignores circuit controls, and every insert begins on the source sample without a block delay', () => {
  const impulse = new Float32Array(1024); impulse[139] = .037;
  const clean = render({ model: 'clean', colour: 1, transformer: 1, headroom: -12, bias: 1, feedback: 0, slew: 1, impedance: 150, input: 0, drive: 36, output: 0, compensate: 'on' }, impulse).l;
  assert.deepEqual(clean, impulse, 'Transparent reference must ignore the circuit workshop');
  for (const model of models) {
    const got = render({ model, drive: 12, colour: .8 }, impulse).l;
    assert.equal(maximum(got.subarray(0, 139)), 0, model + ' must be causal');
    assert(Math.abs(got[139]) > 1e-5, model + ' added a pure sample/buffer delay');
  }
});

check('Stereo circuits are dual mono, and silent channels stay silent under bias, saturation and model changes', () => {
  const a = source(8192), silent = new Float32Array(a.length);
  for (const model of models) {
    const p = { model, drive: 24, colour: 1, bias: .8, transformer: .9 }, e = dsp.create(sr, p), stereo = feed(e, a, silent);
    assert.equal(maximum(stereo.r), 0, model + ' crosstalk or autonomous bias offset');
    const mono = render(p, a).l; assert.deepEqual(stereo.l, mono, model + ' opposite channel affected the signal');
    e.setParams({ model: model === 'tube-610' ? 'iron-73' : 'tube-610', bias: -.8 });
    assert.equal(maximum(feed(e, a, silent).r), 0, model + ' model switch generated noise on the silent channel');
  }
});

check('Analog model responses differ beyond a scalar output gain at identical controls', () => {
  const a = source(16384), audio = models.map(model => render({ model, drive: 18, colour: 1 }, a).l), normalized = audio.map(x => Float32Array.from(x, v => v / Math.max(1e-10, rms(x))));
  let minDistance = Infinity, nearest = '';
  for (let i = 0; i < audio.length; i++) {
    assert(rms(audio[i]) > .002, models[i] + ' inaudible');
    for (let j = 0; j < i; j++) {
      const d = delta(normalized[i], normalized[j]);
      if (d < minDistance) { minDistance = d; nearest = models[i] + '/' + models[j]; }
      assert(d > .001, models[i] + ' and ' + models[j] + ' differ only in gain');
    }
  }
  measurements.minimumNormalizedModelDistance = minDistance; measurements.nearestModels = nearest;
});

check('Circuit workshop and tone controls change actual audio, while virtual loading has no effect on the transparent path', () => {
  const a = source(16384), base = { model: 'iron-73', colour: 1, drive: 18 }, values = {
    impedance: [150, 10000], transformer: [0, 1], headroom: [-12, 18], bias: [-1, 1], feedback: [0, 1], slew: [0, 1],
    lowCut: [0, 400], highCut: [2000, 22000], lowGain: [-12, 12], highGain: [-12, 12]
  };
  const differences = {};
  for (const [key, [lo, hi]] of Object.entries(values)) {
    const input = key === 'slew' ? tone(11000, .4, 16384) : a;
    const x = render({ ...base, [key]: lo }, input).l, y = render({ ...base, [key]: hi }, input).l, d = delta(x, y);
    differences[key] = d; assert(d > 1e-5, key + ' does not affect the signal: ' + d);
  }
  for (const p of [{ model: 'clean', colour: 1 }, { model: 'iron-73', colour: 0 }]) assert.deepEqual(render({ ...p, impedance: 150 }, a), render({ ...p, impedance: 10000 }, a));
  const top = render({ ...base, impedance: 10000 }, a).l, middle = render({ ...base, impedance: 2400 }, a).l;
  assert(delta(top, middle) > 1e-5, 'Virtual loading above 2400 ohms must still change the modeled circuit');
  measurements.workshopRmsDifferences = differences;
});

check('Circuit model and discrete gain-stage switches do not introduce a hard waveform discontinuity', () => {
  const constant = new Float32Array(4096).fill(.07);
  let largestFirstJump = 0;
  for (const from of ['iron-73', 'tube-610', 'clean']) for (const to of ['punch-312', 'tg-2', 'clean']) {
    const e = dsp.create(sr, { model: from, drive: 18, colour: 1 }), before = feed(e, constant).l;
    e.setParams({ model: to }); const after = feed(e, constant).l, jump = Math.abs(after[0] - before[before.length - 1]);
    largestFirstJump = Math.max(largestFirstJump, jump);
    assert(jump < .001, from + ' to ' + to + ' hard model-switch jump: ' + jump);
  }
  for (const patch of [{ pad: '20' }, { polarity: 'invert' }, { compensate: 'off' }]) {
    const e = dsp.create(sr, { model: 'iron-73', drive: 12, colour: 0 }), before = feed(e, constant).l;
    e.setParams(patch); const after = feed(e, constant).l, jump = Math.abs(after[0] - before[before.length - 1]);
    assert(jump < .003, JSON.stringify(patch) + ' hard gain-stage jump: ' + jump);
  }
  measurements.maximumModelSwitchFirstSampleJump = largestFirstJump;
});

check('Reset and zero-wet/bypass cannot reveal stale circuit state; factory serialization and arbitrary blocks remain exact', () => {
  const a = source(10001), b = tone(721, .1, a.length);
  for (const model of models) {
    const p = { model, colour: .9, drive: 21, bias: .5, lowGain: 2, highGain: -1 }, e = dsp.create(sr, p), original = feed(e, a, b, 128);
    e.reset(); assert.deepEqual(feed(e, a, b, 31), original, model + ' reset history');
    assert.deepEqual(render(p, a, b, sr, isolated, 997), original, model + ' serialization or partition mismatch');
    e.setParams({ mix: 0 }); assert.deepEqual(feed(e, a, b), { l: a, r: b }, model + ' immediate zero wet');
    feed(e, new Float32Array(sr / 2)); e.setParams({ mix: 1 });
    assert(maximum(feed(e, new Float32Array(1024)).l) < 1e-6, model + ' stale zero-wet state');
    e.setParams({ bypass: true }); assert.deepEqual(feed(e, a, b), { l: a, r: b }, model + ' exact bypass');
    feed(e, new Float32Array(sr / 2)); e.setParams({ bypass: false });
    assert(maximum(feed(e, new Float32Array(1024)).l) < 1e-6, model + ' stale bypass state');
  }
});

check('Absolute-sample automation stays identical when unchanged settings are resent at engine control boundaries', () => {
  const a = source(12289), b = tone(2137, .07, a.length);
  const changes = [{ at: 0, patch: { model: 'iron-73', drive: 9, output: -2, lowCut: 40 } }, { at: 4096, patch: { model: 'tube-610', input: 4, bias: .3, lowGain: 1 } }, { at: 8192, patch: { model: 'tg-2', output: -7, impedance: 400, headroom: -3 } }];
  function run(block, repeat) {
    const e = dsp.create(sr, {}), l = a.slice(), r = b.slice(); let at = 0, command = 0, last = {};
    while (at < a.length) {
      if (changes[command]?.at === at) { last = { ...last, ...changes[command++].patch }; e.setParams(last); }
      if (repeat) e.setParams(last);
      const n = Math.min(block, a.length - at, changes[command]?.at - at || Infinity);
      e.process(l.subarray(at, at + n), r.subarray(at, at + n)); at += n;
    }
    return { l, r };
  }
  const reference = run(128, false); assert.deepEqual(run(32, true), reference); assert.deepEqual(run(997, false), reference);
});

check('Extreme valid circuits settle inside their advertised tails without self-oscillation or non-finite output', () => {
  let tailPeak = 0;
  for (const rate of [8000, 48000, 192000]) for (const model of models) {
    const e = dsp.create(rate, { model, input: 24, drive: 36, output: -12, compensate: 'off', colour: 1, transformer: 1, headroom: -12, bias: 1, feedback: 0, slew: 1, impedance: 150, lowCut: 400, highCut: 2000, lowGain: 12, highGain: 12 });
    const hot = feed(e, tone(1173, 6, Math.ceil(rate * .02), rate), undefined, 37);
    for (const channel of [hot.l, hot.r]) assert(channel.every(x => Number.isFinite(x) && Math.abs(x) <= 8), model + ' unstable at ' + rate);
    // Probe the initial recovery and bounded state at every rate. The complete
    // physical-time decay is covered for every model at 8 kHz; repeating that
    // same two-second integration at 192 kHz adds work without a new scenario.
    const seconds = rate === 8000 ? Math.max(.08, e.getTailTime() + .05) : .06, tail = feed(e, new Float32Array(Math.ceil(rate * seconds)), undefined, 997);
    assert(tail.l.every(x => Number.isFinite(x) && Math.abs(x) <= 8), model + ' unstable recovery at ' + rate);
    if (rate === 8000) {
      const p = maximum(tail.l.subarray(Math.floor(tail.l.length - rate * .025))); tailPeak = Math.max(tailPeak, p);
      assert(p < 1e-5, model + ' audible after advertised tail at ' + rate + ': ' + p);
    }
    assert(Object.values(e.getMeters()).filter(x => typeof x === 'number').every(Number.isFinite), model + ' non-finite meter');
  }
  measurements.maximumPostTailPeak = tailPeak;
});

check('A one-hertz cleanup pole with maximum digital gain reports enough export tail to retain its actual decay', () => {
  const rate = 8000, e = dsp.create(rate, { model: 'clean', colour: 0, lowCut: 1, compensate: 'off', input: 24, drive: 36, output: 18 });
  feed(e, new Float32Array(160).fill(.8));
  const seconds = e.getTailTime(); assert(seconds > 2, 'The one-hertz high-pass cannot use the ordinary two-second circuit tail');
  const tail = feed(e, new Float32Array(Math.ceil((seconds + .025) * rate))).l, endPeak = maximum(tail.subarray(tail.length - 200));
  assert(endPeak < 1e-5, 'The advertised cleanup tail ended while still audible: ' + endPeak);
  measurements.oneHertzMaximumGainTailSeconds = seconds; measurements.oneHertzPostTailPeak = endPeak;
});

// Diagnostic alias measurements use a 9 kHz carrier and a 3 kHz folded fifth
// harmonic. Genuine in-band harmonics at 18 kHz are intentionally not counted.
const folded = {};
for (const model of ['iron-73', 'punch-312', 'tube-610', 'redd-47', 'tg-2']) {
  const a = tone(9000, .2), out = render({ model, drive: 24, colour: 1 }, a).l;
  folded[model] = 20 * Math.log10(Math.max(1e-12, projection(out, 3000)) / Math.max(1e-12, projection(out, 9000)));
}
measurements.nineKhzCarrierFoldedThreeKhzDb = folded;
const timings = [];
for (const model of ['clean', 'iron-73', 'tube-610']) {
  const e = dsp.create(sr, { model }), a = new Float32Array(128).fill(.1), b = new Float32Array(128).fill(-.07);
  for (let i = 0; i < 200; i++) { a.fill(.1); b.fill(-.07); e.process(a, b); }
  const began = performance.now(); for (let i = 0; i < 300; i++) { a.fill(.1); b.fill(-.07); e.process(a, b); }
  timings.push({ model, stereo128FrameMilliseconds: (performance.now() - began) / 300 });
}
console.log(JSON.stringify({ independentGroups: passed.length, measurements, timings }, null, 2));
