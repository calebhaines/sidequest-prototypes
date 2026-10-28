/* BROILER pedal audio: circuits, timing, tails, stereo isolation and Worklet parity. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'broiler-pedals.js'), 'utf8'));
const dsp = createLoomBroilerPedalsDSP(), sr = 48000, passed = [], measurements = {};
const isolated = vm.runInNewContext('(' + createLoomBroilerPedalsDSP.toString() + ')')();
function check(name, run) { run(); passed.push(name); }
function rms(audio, start = 0, end = audio.length) { let sum = 0; for (let i = start; i < end; i++) sum += audio[i] * audio[i]; return Math.sqrt(sum / Math.max(1, end - start)); }
function difference(a, b) { let sum = 0; for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2; return Math.sqrt(sum / a.length); }
function peak(audio, start = 0, end = audio.length) { let p = 0; for (let i = start; i < end; i++) p = Math.max(p, Math.abs(audio[i])); return p; }
function noise(frames, scale = .2) { let seed = 981237; return Float64Array.from({ length: frames }, () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 4294967296 * 2 - 1) * scale; }); }
function tone(hz, frames = sr / 2, scale = .2, rate = sr) { return Float64Array.from({ length: frames }, (_, i) => scale * Math.sin(2 * Math.PI * hz * i / rate)); }
function projection(audio, hz, rate = sr, start = Math.floor(audio.length / 2)) { let a = 0, b = 0; for (let i = start; i < audio.length; i++) { a += audio[i] * Math.sin(2 * Math.PI * hz * i / rate); b += audio[i] * Math.cos(2 * Math.PI * hz * i / rate); } return 2 * Math.hypot(a, b) / (audio.length - start); }
function render(type, params, source, right = source, rate = sr, factory = dsp, block = 128, insert = null) {
  const effect = insert || factory.create(rate, Object.assign({ type, enabled: true }, params));
  const left = new Float64Array(source.length), other = new Float64Array(source.length);
  for (let at = 0; at < source.length; at += block) for (let i = at; i < Math.min(source.length, at + block); i++) { left[i] = effect.sample(source[i], 0); other[i] = effect.sample(right[i], 1); }
  return { left, right: other, effect };
}

check('All specified pedal types normalize safely, and disabled/empty/zero-mix slots are exact dry', () => {
  assert.equal(dsp.types.length, 14); assert.equal(new Set(dsp.types).size, 14);
  const input = noise(2000, 4);
  for (const type of dsp.types) for (const params of [{ enabled: false }, { mix: 0 }]) {
    const result = render(type, { ...params, level: 12 }, input); assert.deepEqual(result.left, input); assert.deepEqual(result.right, input); assert.equal(result.effect.getTailTime(), 0);
  }
  assert.deepEqual(render('none', {}, input).left, input);
  assert.equal(dsp.normalize({ enabled: 'off' }).enabled, false); assert.equal(dsp.normalize({ enabled: 'on' }).enabled, true);
  assert.deepEqual(dsp.normalize({ type: 'bad', drive: NaN, tone: Infinity, level: -100, mix: 2 }), { type: 'none', enabled: false, drive: .5, tone: .5, level: -18, mix: 1 });
});

check('The seven dirt circuits have distinct sounds and useful independent gain/tone controls', () => {
  const input = Float64Array.from({ length: sr / 2 }, (_, i) => .15 * Math.sin(2 * Math.PI * 220 * i / sr) + .07 * Math.sin(2 * Math.PI * 1753 * i / sr));
  const dirtTypes = dsp.types.slice(1, 8), outputs = [];
  for (const type of dirtTypes) {
    const result = render(type, { drive: .7, tone: .6 }, input).left;
    assert(rms(result) > .01, type + ' must produce sound'); outputs.push(result);
    assert(difference(render(type, { drive: 0, tone: .5 }, input).left, render(type, { drive: 1, tone: .5 }, input).left) > .02, type + '/drive');
    assert(difference(render(type, { drive: .7, tone: 0 }, input).left, render(type, { drive: .7, tone: 1 }, input).left) > .015, type + '/tone');
  }
  for (let i = 0; i < outputs.length; i++) for (let j = i + 1; j < outputs.length; j++) assert(difference(outputs[i], outputs[j]) > .03, dirtTypes[i] + '/' + dirtTypes[j]);
  const sine = tone(200, sr, .25), symmetric = render('green-808', { drive: .7, tone: 1 }, sine).left, asymmetric = render('orange-one', { drive: .7, tone: .5 }, sine).left;
  assert(projection(symmetric, 600) > .01, 'Symmetric diodes generate odd harmonics');
  assert(projection(asymmetric, 400) > projection(symmetric, 400) * 20 + .01, 'Unequal diode counts generate real even harmonics');
  const bass = tone(100), lowerRange = render('treble-boost', { drive: .3, tone: 0 }, bass).left, upperRange = render('treble-boost', { drive: .3, tone: 1 }, bass).left;
  assert(rms(upperRange, 12000) < rms(lowerRange, 12000) * .2, 'Treble booster range changes the actual input coupling pole');
});

check('Implicit diode lookup converges to a finer numerical circuit solution', () => {
  const fineFactory = vm.runInNewContext('(' + createLoomBroilerPedalsDSP.toString().replace('const tableSegments = 2048;', 'const tableSegments = 8192;') + ')')();
  const input = noise(16000, 1.4);
  let error = 0;
  for (const type of dsp.types.slice(1, 7)) {
    const actual = render(type, { drive: .91, tone: .27 }, input).left, fine = render(type, { drive: .91, tone: .27 }, input, input, sr, fineFactory).left;
    const delta = difference(actual, fine); error = Math.max(error, delta); assert(delta < .00015, type + ' circuit convergence: ' + delta);
  }
  measurements.maximumCircuitTableRmsError = error;
});

check('Oversampling suppresses extreme treble clipping aliases, including the compensated Rodent stage', () => {
  const input = tone(9000, sr / 2, .2), aliases = {};
  for (const type of ['green-808', 'rodent', 'muffin', 'wool-fuzz']) {
    const audio = render(type, { drive: 1, tone: 1 }, input).left;
    const ratio = projection(audio, 3000) / projection(audio, 9000);
    aliases[type] = 20 * Math.log10(ratio);
    assert(aliases[type] < -24, type + ': a 9 kHz carrier must not generate a prominent 3 kHz fold: ' + aliases[type]);
  }
  measurements.extremeTrebleFoldDb = aliases;
});

check('Compression changes dynamics and attack; wah sweeps a real resonant band', () => {
  const low = tone(330, sr / 2, .015), high = tone(330, sr / 2, .6), params = { drive: .9, tone: .5 };
  const lowGain = rms(render('studio-comp', params, low).left, 12000) / rms(low, 12000), highGain = rms(render('studio-comp', params, high).left, 12000) / rms(high, 12000);
  assert(highGain < lowGain * .25, 'Loud notes receive greater gain reduction than quiet notes');
  const burst = new Float64Array(8000); burst.fill(.7, 1000, 6000);
  const fast = render('studio-comp', { drive: .9, tone: 0 }, burst).left, slow = render('studio-comp', { drive: .9, tone: 1 }, burst).left;
  assert(rms(slow, 1100, 1600) > rms(fast, 1100, 1600) * 1.3, 'Attack changes the actual transient envelope');
  for (const [d, hz] of [[0, 280], [1, 2400]]) {
    const on = projection(render('wah', { drive: d, tone: .9 }, tone(hz)).left, hz), off = projection(render('wah', { drive: 1 - d, tone: .9 }, tone(hz)).left, hz);
    assert(on > off * 8, 'Wah resonance follows its sweep control');
  }
});

check('Chorus and phaser create actual time-varying modulation without stereo crosstalk', () => {
  const input = tone(997, sr, .2), silent = new Float64Array(input.length);
  for (const type of ['chorus', 'phaser']) {
    const slow = render(type, { drive: .05, tone: .8 }, input, silent), fast = render(type, { drive: .9, tone: .8 }, input);
    assert.equal(peak(slow.right), 0, type + ' must not leak left audio into right');
    assert(difference(slow.left, fast.left) > .04, type + ' LFO rate must alter the audio');
    assert(rms(slow.left) > .01);
  }
  const impulse = new Float64Array(4000); impulse[500] = .5;
  const delayed = render('chorus', { drive: .3, tone: .8 }, impulse).left;
  assert.equal(peak(delayed, 0, 500 + Math.floor(sr * .007)), 0, 'Wet chorus is a physical, causal delay');
  assert(peak(delayed) > .02);
});

check('Echo has correctly timed decaying repeats, and spring has a diffuse, length-dependent tail', () => {
  const input = new Float64Array(sr * 2); input[0] = .3;
  const echo = render('echo', { drive: 0, tone: .6 }, input).left, first = Math.round(.06 * sr);
  assert.equal(peak(echo, 0, first), 0); assert(peak(echo, first, first + 8) > .1);
  assert(peak(echo, first * 2, first * 2 + 16) > .03); assert(peak(echo, first * 2, first * 2 + 16) < peak(echo, first, first + 8));
  const lowFeedback = render('echo', { drive: 0, tone: 0 }, input).left;
  assert(rms(echo, first * 5, first * 8) > rms(lowFeedback, first * 5, first * 8) * 50);
  const short = render('spring', { drive: 0, tone: .4 }, input).left, long = render('spring', { drive: 1, tone: .4 }, input).left;
  assert.equal(peak(long, 0, Math.floor(sr * .029)), 0); assert(peak(long) > .01);
  assert(rms(long, sr, sr * 2) > rms(short, sr, sr * 2) * 100, 'Length controls physical network feedback, rather than a gain knob');
  for (const type of ['echo', 'spring']) {
    const rate = 8000, effect = dsp.create(rate, { type, enabled: true, drive: 1, tone: 1 });
    const duration = Math.ceil((effect.getTailTime() + .2) * rate); let endPeak = 0;
    for (let i = 0; i < duration; i++) { const y = effect.sample(i === 0 ? .5 : 0, 0); if (i > duration - rate / 10) endPeak = Math.max(endPeak, Math.abs(y)); }
    assert(endPeak < 1e-5, type + ' advertised tail must include its audible decay: ' + endPeak);
  }
});

check('Reset, bypass, removal and type changes cannot resurrect old buffered audio', () => {
  for (const type of dsp.types.slice(1)) {
    const effect = dsp.create(sr, { type, enabled: true, drive: .8, tone: .8 });
    render(type, {}, noise(8000), undefined, sr, dsp, 128, effect);
    effect.reset(); const clean = render(type, {}, new Float64Array(3000), undefined, sr, dsp, 128, effect); assert.equal(peak(clean.left), 0, type + '/reset');
    render(type, {}, noise(8000), undefined, sr, dsp, 128, effect);
    effect.setParams({ enabled: false }); assert.equal(effect.sample(.193, 0), .193);
    effect.setParams({ enabled: true }); assert.equal(peak(render(type, {}, new Float64Array(3000), undefined, sr, dsp, 128, effect).left), 0, type + '/bypass');
    effect.setParams({ mix: 0 }); assert.equal(effect.sample(-.139, 1), -.139); effect.setParams({ mix: .8 });
    assert.equal(peak(render(type, {}, new Float64Array(3000), undefined, sr, dsp, 128, effect).left), 0, type + '/zero mix');
    effect.setParams({ type: 'echo' }); effect.setParams({ type });
    assert.equal(peak(render(type, {}, new Float64Array(3000), undefined, sr, dsp, 128, effect).left), 0, type + '/type');
  }
});

check('Stereo state, arbitrary block boundaries, mono synchronization and serialized factories match exactly', () => {
  const input = noise(12000), other = Float64Array.from(input, (x, i) => x * Math.sin(i * .11));
  for (const type of dsp.types.slice(1)) {
    const params = { drive: .77, tone: .62, mix: .7, level: -2 };
    const normal = render(type, params, input, other), tiny = render(type, params, input, other, sr, dsp, 1), large = render(type, params, input, other, sr, dsp, 511), worklet = render(type, params, input, other, sr, isolated);
    for (const result of [tiny, large, worklet]) { assert.deepEqual(result.left, normal.left, type); assert.deepEqual(result.right, normal.right, type); }
    normal.effect.reset(); assert.deepEqual(render(type, {}, input, other, sr, dsp, 128, normal.effect).left, normal.left);
    const mono = dsp.create(sr, { type, enabled: true, ...params }); for (let i = 0; i < 2000; i++) mono.sample(input[i], 0);
    mono.synchronizeMonoState(); for (let i = 2000; i < 3000; i++) assert.equal(mono.sample(input[i], 0), mono.sample(input[i], 1), type + '/mono state');
    const separated = dsp.create(sr, { type, enabled: true, ...params }); const left = Float64Array.from(input, x => separated.sample(x, 0)), right = Float64Array.from(other, x => separated.sample(x, 1));
    assert.deepEqual(left, normal.left); assert.deepEqual(right, normal.right);
  }
});

check('Pedal order is audible, while dry mix and level retain their stated meanings', () => {
  const input = noise(12000, .3);
  function board(reverse) { const a = dsp.create(sr, { type: 'rodent', enabled: true, drive: .7, tone: .7 }), b = dsp.create(sr, { type: 'wah', enabled: true, drive: .25, tone: .8 }); return Float64Array.from(input, x => reverse ? a.sample(b.sample(x, 0), 0) : b.sample(a.sample(x, 0), 0)); }
  assert(difference(board(false), board(true)) > .1);
  const unity = render('wah', { level: 0 }, input).left, minusSix = render('wah', { level: -6.020599913279624 }, input).left, half = render('wah', { level: 0, mix: .5 }, input).left;
  assert(difference(minusSix, Float64Array.from(unity, x => x * .5)) < 1e-12);
  assert(difference(half, Float64Array.from(unity, (x, i) => .5 * (x + input[i]))) < 1e-12);
});

check('Continuous level automation and reactivation ramp without an abrupt gain step', () => {
  const reference = dsp.create(sr, { type: 'wah', enabled: true, drive: .5, tone: .5 });
  const automated = dsp.create(sr, { type: 'wah', enabled: true, drive: .5, tone: .5 });
  for (let i = 0; i < 4000; i++) { const x = .1 * Math.sin(2 * Math.PI * 600 * i / sr); reference.sample(x, 0); automated.sample(x, 0); }
  automated.setParams({ level: 12 }); let firstDelta = 0, endRatio = 0;
  for (let i = 4000; i < 8000; i++) { const x = .1 * Math.sin(2 * Math.PI * 600 * i / sr), a = reference.sample(x, 0), b = automated.sample(x, 0); if (i === 4000) firstDelta = Math.abs(a - b); if (i === 7999) endRatio = b / a; }
  assert(firstDelta < .003); assert(Math.abs(endRatio - Math.pow(10, 12 / 20)) < 1e-6);
  const echo = dsp.create(sr, { type: 'echo', enabled: false, mix: 1 }); echo.setParams({ enabled: true });
  assert(Math.abs(echo.sample(.3, 0) - .3) < .003, 'A newly activated empty delay fades into its wet path');
});

check('All sample rates, extreme controls, automation and silence remain finite and bounded', () => {
  for (const rate of [8000, 44100, 48000, 96000, 192000]) for (const type of dsp.types.slice(1)) {
    const effect = dsp.create(rate, { type, enabled: true, drive: 1, tone: 1, level: 12 });
    for (let i = 0; i < 3000; i++) { const y = effect.sample(i & 1 ? 100 : -100, i & 1); assert(Number.isFinite(y) && Math.abs(y) <= 16, rate + '/' + type); }
    effect.setParams({ drive: 0, tone: 0, level: -18, mix: .1 });
    for (let i = 0; i < 1000; i++) assert(Number.isFinite(effect.sample(.1 * Math.sin(i * .4), i & 1)));
    effect.reset(); for (let i = 0; i < 1000; i++) assert.equal(effect.sample(0, i & 1), 0, rate + '/' + type + '/silence');
    assert(Number.isFinite(effect.getTailTime()) && effect.getTailTime() >= 0 && effect.getTailTime() <= 45);
  }
});

check('Four stereo pedals leave useful CPU headroom for the amp', () => {
  const pedals = Array.from({ length: 4 }, () => dsp.create(sr, { type: 'muffin', enabled: true, drive: .85, tone: .8 }));
  let total = 0;
  function block(at) { for (let i = 0; i < 128; i++) { let a = .2 * Math.sin((at + i) * .03), b = .2 * Math.sin((at + i) * .05); for (let j = 0; j < 4; j++) { a = pedals[j].sample(a, 0); b = pedals[j].sample(b, 1); } total += a + b; } }
  for (let i = 0; i < 500; i++) block(i * 128);
  const start = performance.now(); for (let i = 0; i < 1500; i++) block(i * 128);
  const averageBlockMs = (performance.now() - start) / 1500, deadlineMs = 128 / sr * 1000;
  measurements.fourMuffinStereo = { averageBlockMs, deadlineMs, realtimeFraction: averageBlockMs / deadlineMs };
  assert(Number.isFinite(total)); assert(averageBlockMs < deadlineMs * .55, JSON.stringify(measurements.fourMuffinStereo));
});

console.log(JSON.stringify({ passed, measurements }, null, 2));
