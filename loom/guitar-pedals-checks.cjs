'use strict';
// BOARD signal/circuit checks. No browser or CPU timing benchmark.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
require('./guitar-pedals-dsp.js'); const F = createLoomGuitarPedalsDSP(), C = F.circuits, passed = [], evidence = {};
const plain = value => JSON.parse(JSON.stringify(value));
function check(name, run) { run(); passed.push(name); console.log('PASS ' + name); }
const peak = audio => { let p = 0; for (const x of audio) { assert(Number.isFinite(x)); p = Math.max(p, Math.abs(x)); } return p; };
function tone(rate, frames, hz = 220, amplitude = .05) { return Float32Array.from({ length: frames }, (_, i) => amplitude * Math.sin(2 * Math.PI * hz * i / rate)); }
function render(params, input, rate = 48000, blocks = [128], factory = F) { const d = factory.create(rate, params), left = input.slice(), right = input.slice(); let count = 0; for (let at = 0; at < left.length;) { const end = Math.min(left.length, at + blocks[count++ % blocks.length]); d.process(left.subarray(at, end), right.subarray(at, end), { tempo: 120 }); at = end; } return { d, left, right }; }
function projection(audio, hz, rate, start = Math.floor(audio.length / 2)) { let re = 0, im = 0; for (let i = start; i < audio.length; i++) { const a = 2 * Math.PI * hz * i / rate; re += audio[i] * Math.cos(a); im -= audio[i] * Math.sin(a); } return Math.hypot(re, im) * 2 / (audio.length - start); }
function sampleNetwork(network, output, rate, hz, amplitude = 1e-6) { const s = network.state(), audio = new Float64Array(Math.round(rate * .4)); for (let i = 0; i < audio.length; i++) audio[i] = network.process(amplitude * Math.sin(2 * Math.PI * hz * i / rate), s, output); return projection(audio, hz, rate, Math.round(rate * .2)) / amplitude; }
// Independent complex nodal analysis uses s=j*2Fs*tan(pi*f/Fs), matching
// trapezoidal integration without borrowing production matrices or coefficients.
const add = (a, b) => [a[0] + b[0], a[1] + b[1]], sub = (a, b) => [a[0] - b[0], a[1] - b[1]], mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]], div = (a, b) => { const d = b[0] ** 2 + b[1] ** 2; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
function nodal(count, resistors, capacitors, output, hz, rate, diode = -1) {
  const omega = 2 * rate * Math.tan(Math.PI * hz / rate), a = Array.from({ length: count }, () => Array.from({ length: count }, () => [0, 0])), b = Array.from({ length: count }, () => [0, 0]);
  const stamp = (i, j, y) => { if (i >= 0) { a[i][i] = add(a[i][i], y); if (j >= 0) a[i][j] = sub(a[i][j], y); else if (j === -2) b[i] = add(b[i], y); } if (j >= 0) { a[j][j] = add(a[j][j], y); if (i >= 0) a[j][i] = sub(a[j][i], y); else if (i === -2) b[j] = add(b[j], y); } };
  resistors.forEach(([i, j, r]) => stamp(i, j, [1 / r, 0])); capacitors.forEach(([i, j, c]) => stamp(i, j, [0, omega * c])); if (diode >= 0) stamp(diode, -1, [2 * 2.5e-9 / (2 * 1.75 * .02585), 0]);
  for (let i = 0; i < count; i++) { let p = i; for (let j = i + 1; j < count; j++) if (Math.hypot(...a[j][i]) > Math.hypot(...a[p][i])) p = j; [a[i], a[p]] = [a[p], a[i]]; [b[i], b[p]] = [b[p], b[i]]; const z = a[i][i]; for (let j = i; j < count; j++) a[i][j] = div(a[i][j], z); b[i] = div(b[i], z); for (let row = 0; row < count; row++) if (row !== i) { const k = a[row][i]; for (let col = i; col < count; col++) a[row][col] = sub(a[row][col], mul(k, a[i][col])); b[row] = sub(b[row], mul(k, b[i])); } }
  return Math.hypot(...b[output]);
}

check('All catalog controls and recipes normalize exactly; the serialized factory needs no outside DSP dependency', () => {
  const scope = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'guitar-pedals-catalog.js'), 'utf8'), scope); const catalog = scope.window.LoomGuitarPedalsCatalog[0];
  assert.deepEqual(plain(F.normalize({})), plain(catalog.defaults)); assert.equal(catalog.pedalTypes.length, 11);
  for (const preset of catalog.presets) assert.deepEqual(plain(F.normalize(preset.params)), plain(preset.params));
  const isolated = vm.runInNewContext('(' + createLoomGuitarPedalsDSP.toString() + ')')(), input = tone(8000, 2049, 173, .03), a = render({}, input, 8000), b = render({}, input, 8000, [137], isolated); assert.deepEqual(b.left, a.left); assert.deepEqual(b.right, a.right);
});
check('Empty powered-off and globally bypassed boards are exact dry without pedal buffers or audio-rate math', () => {
  let count = 0, watch = false; const math = new Proxy(Math, { get(target, key) { const value = target[key]; return typeof value === 'function' ? (...args) => { if (watch) count++; return value(...args); } : value; } });
  const factory = vm.runInNewContext('(' + createLoomGuitarPedalsDSP.toString() + ')', { Math: math })(), input = tone(48000, 1024, 431, .2);
  for (const params of [{ pedal1Type: 'none' }, { bypass: true, pedal1Type: 'delay' }, { mix: 0, pedal1Type: 'reverb' }, { pedal1Enabled: 'off' }]) {
    const d = factory.create(48000, params), left = input.slice(), right = input.slice(); count = 0; watch = true; d.process(left, right); watch = false;
    assert.equal(count, 0); assert.deepEqual(left, input); assert.deepEqual(right, input); assert(d.getMeters().slots.every(slot => !slot.active && slot.bufferFrames === 0)); assert.equal(d.getTailTime(), 0);
  }
});
check('The two-series antiparallel diode solve and its audio-rate table satisfy independent Shockley-node references', () => {
  let maximumVoltageError = 0, maximumRootResidual = 0;
  for (const resistance of [100, 1800, 10000, 100000, 1e6]) {
    const network = new C.PassiveNetwork(48000, 1, [[-2, 0, resistance]], [], 0), state = network.state();
    for (let i = 0; i <= 160; i++) {
      const input = i / 20, k = resistance * 2.5e-9, vt = 2 * 1.75 * .02585; let lo = 0, hi = input;
      for (let iteration = 0; iteration < 70; iteration++) { const m = (lo + hi) / 2; if (m + k * (Math.exp(m / vt) - Math.exp(-m / vt)) > input) hi = m; else lo = m; }
      const expected = (lo + hi) / 2, solved = C.solveDiode(input, resistance), actual = network.process(input, state, 0);
      maximumVoltageError = Math.max(maximumVoltageError, Math.abs(actual - expected)); maximumRootResidual = Math.max(maximumRootResidual, Math.abs(solved + k * (Math.exp(solved / vt) - Math.exp(-solved / vt)) - input));
      assert(Math.abs(network.process(-input, state, 0) + actual) < 1e-12);
    }
  }
  assert(maximumVoltageError < 3e-6, 'Diode lookup voltage error ' + maximumVoltageError); assert(maximumRootResidual < 1e-8, 'Nonlinear root residual ' + maximumRootResidual); evidence.diode = { maximumVoltageError, maximumRootResidual };
});
check('Stock interstage and loaded tone networks match independently assembled original-component AC analyses', () => {
  const rate = 48000, interR = [[-2, 0, 100000], [4, 1, 330000], [1, 2, 1e6], [2, -1, 15000], [3, -1, 1e6]], interC = [[-2, 4, 220e-12], [0, 1, 100e-9], [0, 2, 47e-9], [1, 3, 2.2e-9]], inter = new C.PassiveNetwork(rate, 5, interR, interC, 1);
  let maxDbError = 0; const response = {};
  for (const hz of [40, 120, 400, 1000, 4000, 10000]) { const expected = nodal(5, interR, interC, 3, hz, rate, 1), actual = sampleNetwork(inter, 3, rate, hz); maxDbError = Math.max(maxDbError, Math.abs(20 * Math.log10(actual / expected))); response[hz] = actual; }
  for (const control of [0, .5, 1]) {
    const resistors = [[-2, 0, 5600], [1, 3, Math.max(1, 10000 * (1 - control))], [3, 2, Math.max(1, 10000 * control)], [3, 4, 90000], [4, -1, 10000], [5, -1, 470000]], capacitors = [[-2, 0, 6.8e-9], [0, -1, 5.6e-9], [0, 1, 18e-9], [2, -1, 18e-9], [4, 5, 47e-9]], network = new C.PassiveNetwork(rate, 6, resistors, capacitors);
    for (const hz of [120, 400, 1000, 4000, 10000]) { const expected = nodal(6, resistors, capacitors, 5, hz, rate), actual = sampleNetwork(network, 5, rate, hz); maxDbError = Math.max(maxDbError, Math.abs(20 * Math.log10(actual / expected))); }
  }
  assert(maxDbError < .03, 'Independent passive AC mismatch ' + maxDbError + ' dB'); evidence.passive = { maxDbError, interstageResponse: response };
});
check('Discrete gain stages retain their feedback-capacitor KCL and bounded asymmetric nominal rail law', () => {
  let residual = 0; const rate = 192000, gain = .72, rf = 22000 + 250000 * (10 ** (2 * gain) - 1) / 99, rg = 1500, cg = 2 * rate * 150e-9, cf = 2 * rate * 47e-12, stage = new C.DiscreteStage(rate, 22000, rg, 150e-9, 47e-12); stage.set(gain, true);
  let positive = 0, negative = 0;
  for (let i = 0; i < 24000; i++) {
    const x = .8 * Math.sin(2 * Math.PI * 997 * i / rate), oldGround = stage.hg, oldFeedback = stage.hf, y = stage.process(x), gf = 1 / rf + cf, yg = cg / (1 + rg * cg), h = oldGround / (1 + rg * cg), v = (gf * y - oldFeedback - h) / (gf + yg);
    const kcl = (v - y) / rf + cf * (v - y) + oldFeedback + yg * v + h, e = 1600 * (x - v), rail = e < 0 ? 4 : 3.8, reference = rail * e / (rail + Math.abs(e));
    residual = Math.max(residual, Math.abs(kcl), Math.abs(y - reference)); positive = Math.max(positive, y); negative = Math.min(negative, y);
  }
  assert(residual < 1e-9, 'Implicit amplifier residual ' + residual); assert(positive <= 3.8 && negative >= -4); assert(Math.abs(negative) > positive, 'Nominal PNP headroom must not be forced odd-symmetric.'); evidence.discreteStage = { residual, positive, negative };
});
check('The active bass stage follows the 56n/1k2/470k gyrator, including its finite-follower damping assumption', () => {
  const rate = 48000, filter = C.bassCoefficients(rate), results = {}; let maximumDb = 0;
  for (const hz of [40, 120, 400, 1000, 5000]) {
    const omega = 2 * rate * Math.tan(Math.PI * hz / rate), s = [0, omega], rf = div([6800, 0], add([1, 0], mul(s, [6800 * 2.2e-9, 0]))), gyrator = div(mul([1200, 0], add([1, 0], mul(s, [470000 * 56e-9, 0]))), add([1, 0], mul(s, [56e-9 * (1200 + .009 * 470000), 0]))), ground = add(div([1, 0], mul(s, [56e-9, 0])), gyrator), response = add([1, 0], div(rf, ground));
    const z = new Float64Array(3), audio = new Float64Array(rate / 2); for (let i = 0; i < audio.length; i++) { const x = 1e-5 * Math.sin(2 * Math.PI * hz * i / rate), y = filter.b[0] * x + z[0]; z[0] = filter.b[1] * x - filter.a[1] * y + z[1]; z[1] = filter.b[2] * x - filter.a[2] * y + z[2]; z[2] = filter.b[3] * x - filter.a[3] * y; audio[i] = y; } const actual = projection(audio, hz, rate, rate / 4) / 1e-5, expected = Math.hypot(...response); maximumDb = Math.max(maximumDb, Math.abs(20 * Math.log10(actual / expected))); results[hz] = actual;
  }
  assert(maximumDb < .03); assert(results[120] > results[1000] * 1.5); evidence.gyrator = { maximumDb, response: results };
});
check('Physical BD-2 Level spans full off/full on before the bass amplifier; software output trim remains independent', () => {
  const input = tone(48000, 16000, 220, .05), off = render({ pedal1Volume: 0 }, input), middle = render({ pedal1Volume: .5 }, input), full = render({ pedal1Volume: 1 }, input), trim = render({ pedal1Volume: .5, pedal1Level: 12 }, input);
  assert.equal(peak(off.left), 0); assert(peak(full.left) > peak(middle.left) * 5);
  const multiplier = 10 ** (12 / 20); for (let i = 0; i < input.length; i++) assert(Math.abs(trim.left[i] - middle.left[i] * multiplier) < 3e-7);
  assert.equal(F.normalize({}).pedal1Volume, .5); evidence.physicalVolume = { off: peak(off.left), midpoint: peak(middle.left), full: peak(full.left) };
});
check('All ten pedals are deterministic across odd blocks, rates and qualities, with no unintended stereo crosstalk', () => {
  const types = ['bluesdriver', 'screamer', 'rodent', 'fuzz', 'compressor', 'wah', 'chorus', 'phaser', 'delay', 'reverb'];
  for (const rate of [8000, 44100, 48000]) for (const quality of ['eco', 'high']) for (const type of types) {
    const input = tone(rate, Math.round(rate * .12) + 13, 173, .08), params = { quality, pedal1Type: type }, a = render(params, input, rate), b = render(params, input, rate, [1, 17, 137, 251]); assert.deepEqual(a.left, b.left, type + '/' + rate + '/' + quality); peak(a.left);
    const d = F.create(rate, params), left = input.slice(), right = new Float32Array(input.length); d.process(left, right); assert.equal(peak(right), 0, type + ' leaked left audio into a silent right input.');
  }
  const input = tone(48000, 24000, 7000, .4), aliases = {};
  for (const type of ['bluesdriver', 'screamer', 'rodent', 'fuzz']) {
    const params = { pedal1Type: type, pedal1Drive: 1, pedal1Tone: 1 }, eco = render({ ...params, quality: 'eco' }, input), high = render({ ...params, quality: 'high' }, input), ecoAlias = projection(eco.left, 13000, 48000, 12000), highAlias = projection(high.left, 13000, 48000, 12000);
    // A7kHz sinusoid's5th harmonic is35kHz, folding to13kHz at48kHz.
    // It is not an in-band harmonic of the original input.
    assert(highAlias < ecoAlias * .8, type + ' High mode did not reduce the folded fifth harmonic.'); aliases[type] = 20 * Math.log10(highAlias / ecoAlias);
  }
  evidence.highVsEcoFoldedFifthDb = aliases;
});
check('Bypass/reset and pedal removal close histories; reactivation cannot revive an old echo', () => {
  for (const action of ['global', 'pedal', 'reset', 'type']) {
    const d = F.create(8000, { pedal1Type: 'delay', pedal1Time: 40, pedal1Feedback: .8 }), pulse = new Float32Array(1024); pulse[0] = .2; d.process(pulse, pulse.slice());
    if (action === 'global') d.setParams({ bypass: true }); else if (action === 'pedal') d.setParams({ pedal1Enabled: 'off' }); else if (action === 'type') d.setParams({ pedal1Type: 'none' }); else d.reset();
    const tail = new Float32Array(2048); d.process(tail, tail.slice()); if (action === 'global') d.setParams({ bypass: false }); else if (action === 'pedal') d.setParams({ pedal1Enabled: 'on' }); else if (action === 'type') d.setParams({ pedal1Type: 'delay' });
    const clean = new Float32Array(8192); d.process(clean, clean.slice()); assert.equal(peak(clean), 0, action + ' revived old delay audio.');
  }
  const phaser = F.create(8000, { pedal1Type: 'phaser', pedal1PhaserStages: '6' }), played = tone(8000, 1024, 173, .1); phaser.process(played, played.slice()); phaser.setParams({ pedal1PhaserStages: '4' }); const silent = new Float32Array(8192); phaser.process(silent, silent.slice()); phaser.setParams({ pedal1PhaserStages: '6' }); const resumed = new Float32Array(1024); phaser.process(resumed, resumed.slice()); assert.equal(peak(resumed), 0, 'A retired phaser stage revived old audio.');
});
check('Free and tempo-synced digital echoes land on their metronome frames, including twelve-second two-bar delay', () => {
  for (const [rate, params, tempo, seconds] of [[8000, { pedal1Clock: 'free', pedal1Time: 80 }, 120, .08], [8000, { pedal1Clock: 'sync', pedal1Division: '1/8' }, 120, .25], [8000, { pedal1Clock: 'sync', pedal1Division: '2' }, 40, 12]]) {
    const d = F.create(rate, { pedal1Type: 'delay', pedal1DelayMode: 'digital', pedal1Feedback: 0, ...params }), frames = Math.ceil((seconds + .1) * rate), left = new Float32Array(frames), right = new Float32Array(frames); left[0] = right[0] = .2; d.process(left, right, { tempo });
    let at = 0; for (let i = 1; i < left.length; i++) if (Math.abs(left[i]) > Math.abs(left[at])) at = i;
    assert(Math.abs(at - Math.round(seconds * rate)) <= 1, 'Echo landed at ' + at + ' rather than ' + seconds * rate); assert(Math.abs(left[at] - .2) < .001); assert(d.getMeters().slots[0].bufferFrames > seconds * rate); assert(d.getTailTime() >= seconds); evidence['echo-' + seconds] = at;
  }
});
check('Partial software-level updates preserve other positions and their live delay histories', () => {
  const params = { pedal1Type: 'delay', pedal1Time: 50, pedal1Feedback: .6, pedal2Type: 'none' }, a = F.create(8000, params), b = F.create(8000, params), source = new Float32Array(1600); source[0] = .2;
  const left = source.slice(), right = source.slice(), other = source.slice(), otherRight = source.slice();
  for (let at = 0; at < source.length; at += 32) { a.setParams({ pedal2Level: at % 64 ? 12 : -12 }); a.process(left.subarray(at, at + 32), right.subarray(at, at + 32)); b.process(other.subarray(at, at + 32), otherRight.subarray(at, at + 32)); }
  assert.deepEqual(left, other); assert.deepEqual(right, otherRight); assert.equal(a.getMeters().slots[0].bufferFrames, b.getMeters().slots[0].bufferFrames);
});
check('Parameter endpoints and extreme supported rates remain bounded and quiet from a clean reset', () => {
  for (const rate of [8000, 44100, 48000, 96000, 192000]) for (const type of ['bluesdriver', 'screamer', 'rodent', 'fuzz', 'compressor', 'wah', 'chorus', 'phaser', 'delay', 'reverb']) {
    const params = { pedal1Type: type, pedal1Drive: 1, pedal1Tone: 1, pedal1Volume: 1, pedal1Rate: 12, pedal1Depth: 1, pedal1Feedback: .92, pedal1ChorusDelay: 2, pedal1Decay: 8 }, d = F.create(rate, params), input = Float32Array.from({ length: 257 }, (_, i) => i % 17 ? Math.sin(i) * 4 : i % 2 ? NaN : Infinity), right = input.slice(); d.process(input, right); assert(peak(input) <= 64); assert(peak(right) <= 64); d.reset(); const quiet = new Float32Array(257); d.process(quiet, quiet.slice()); assert.equal(peak(quiet), 0);
  }
});
console.log(passed.length + ' BOARD circuit/signal groups passed.'); console.log(JSON.stringify(evidence));
