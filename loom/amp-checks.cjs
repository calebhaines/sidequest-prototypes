'use strict';

// Actual BROILER DSP, including the serialized factory used by AudioWorklet.
// No browser or audio device is needed. Run: node loom/amp-checks.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
globalThis.window = globalThis;
for (const name of ['effects-catalog.js', 'effects.js', 'schema.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, name), 'utf8'), { filename: name });
}
const definition = LoomEffectsCatalog.find(effect => effect.id === 'broiler');
const effects = createLoomEffectsDSP();
const workletFactory = vm.runInNewContext('(' + createLoomEffectsDSP.toString() + ')', { Math, Number, Float32Array, Float64Array, Int32Array });
const workletEffects = workletFactory();
const passed = [];
const check = (name, test) => { test(); passed.push(name); };
const options = key => definition.params.find(param => param.key === key).options.map(option => option.value);
const sr = 48000;
function signal(rate = sr, seconds = .45, pitch = 55, amplitude = .15) {
  return Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => {
    const t = i / rate, envelope = Math.min(1, t * 120) * (0.7 + .3 * Math.cos(t * 8));
    return envelope * (amplitude * Math.sin(2 * Math.PI * pitch * t) + amplitude * .45 * Math.sin(2 * Math.PI * pitch * 2 * t) + amplitude * .2 * Math.sin(2 * Math.PI * 1200 * t) + amplitude * .12 * Math.sin(2 * Math.PI * 3800 * t));
  });
}
function sine(frequency, amplitude = .15, rate = sr, seconds = .4) {
  return Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => amplitude * Math.sin(2 * Math.PI * frequency * i / rate));
}
function render(params = {}, source = signal(), blockSize = 128, rate = sr, factory = effects, rightSource = source) {
  const insert = factory.create('broiler', rate, { ...definition.defaults, ...params });
  const left = source.slice(), right = rightSource.slice();
  for (let at = 0; at < left.length; at += blockSize) insert.process(left.subarray(at, Math.min(at + blockSize, left.length)), right.subarray(at, Math.min(at + blockSize, right.length)), { tempo: 120 });
  return { left, right, insert };
}
function rms(data, start = 0) { let energy = 0; for (let i = start; i < data.length; i++) energy += data[i] * data[i]; return Math.sqrt(energy / (data.length - start)); }
function peak(data) { let value = 0; for (const sample of data) value = Math.max(value, Math.abs(sample)); return value; }
function fingerprint(data) { return createHash('sha256').update(Buffer.from(data.buffer, data.byteOffset, data.byteLength)).digest('hex'); }
function difference(a, b) { let energy = 0; for (let i = 0; i < a.length; i++) energy += (a[i] - b[i]) ** 2; return Math.sqrt(energy / a.length); }
function amplitudeAt(data, frequency, rate = sr) {
  let real = 0, imaginary = 0; const start = Math.floor(data.length / 2), length = data.length - start;
  for (let i = start; i < data.length; i++) { const phase = 2 * Math.PI * frequency * i / rate; real += data[i] * Math.cos(phase); imaginary += data[i] * Math.sin(phase); }
  return 2 * Math.hypot(real, imaginary) / length;
}
function finiteAudio(data) { assert(data.every(value => Number.isFinite(value) && Math.abs(value) <= 8), 'Nonfinite or unbounded audio'); }

check('BROILER adds a ninth effect and preserves eight tracks with four slots', () => {
  assert.equal(LoomEffectsCatalog.length, 9);
  assert.deepEqual(LoomEffectsCatalog.slice(0, 8).map(effect => effect.id), ['prism', 'velvet', 'cinder', 'undertow', 'parallax', 'vestige', 'halo', 'tremor']);
  assert.equal(options('model').length, 8); assert.equal(options('cabinet').length, 8);
  const state = LoomSchema.defaultState(); assert.equal(state.tracks.length, 8); assert(state.tracks.every(track => track.effects.length === 4));
});

check('Catalog, DSP defaults, preset values and project serialization agree', () => {
  assert.deepEqual(effects.normalize('broiler', {}), definition.defaults);
  for (const preset of definition.presets) {
    assert.deepEqual(effects.normalize('broiler', preset.params), preset.params, preset.name);
    const state = LoomSchema.defaultState(); state.tracks[0].effects[0] = { type: 'broiler', params: preset.params };
    const restored = LoomSchema.parseProject(LoomSchema.serializeProject(state));
    assert.deepEqual(restored.tracks[0].effects[0].params, preset.params);
    for (const p of definition.params.filter(p => p.type === 'range')) assert(LoomSchema.automationTargets(restored.tracks[0]).some(target => target.target === 'fx:0:' + p.key && target.min === p.min && target.max === p.max));
  }
  assert.equal(new Set(definition.groups.flatMap(group => group.keys)).size, definition.params.length);
});

check('All eight amplifier characters and eight cabinets are audible and distinct', () => {
  for (const key of ['model', 'cabinet']) {
    const hashes = new Set();
    for (const value of options(key)) {
      const audio = render({ [key]: value }).left; finiteAudio(audio); assert(rms(audio) > .004, key + ': ' + value);
      hashes.add(fingerprint(audio));
    }
    assert.equal(hashes.size, options(key).length, key + ' should change actual audio');
  }
});

check('Every preset produces useful finite audio without injecting noise into silence', () => {
  for (const preset of definition.presets) {
    const source = signal(sr, .3, preset.params.model.includes('bass') || ['flip-top', 'valve-stack', 'modern-grind', 'doom-fuzz'].includes(preset.params.model) ? 55 : 165);
    const audio = render(preset.params, source).left; finiteAudio(audio); assert(rms(audio) > .008, preset.name); assert(peak(audio) < 1.6, preset.name + ' excessive preset output');
    assert.equal(peak(render(preset.params, new Float32Array(6000)).left), 0, preset.name + ' injected signal into silence');
  }
});

check('Protected clean lows preserve a low-B fundamental underneath extreme distortion', () => {
  const fundamental = 30.8677, source = sine(fundamental, .15), patch = { model: 'doom-fuzz', cabinet: 'metalbox', drive: 36, crossover: 180, bass: 0, mid: 0, treble: 0, depth: 0, presence: 2 / 9, master: .8, sag: .7, output: 0, gate: -90 };
  const full = render({ ...patch, cleanLow: 1 }, source).left, distorted = render({ ...patch, cleanLow: 0 }, source).left;
  assert(amplitudeAt(full, fundamental) > .12, 'Clean crossover should retain substantial sub-bass');
  assert(amplitudeAt(full, fundamental) > amplitudeAt(distorted, fundamental) * 1.3, 'Clean low blend should improve the cabinet-damaged low-B fundamental');
  assert(amplitudeAt(full, fundamental * 3) / amplitudeAt(full, fundamental) < amplitudeAt(distorted, fundamental * 3) / amplitudeAt(distorted, fundamental), 'Protected lows should improve the fundamental relative to distorted harmonics');
  assert(difference(full, distorted) > .015);
});

check('Drive changes harmonic structure and output trim accurately controls level', () => {
  const source = sine(330, .2), patch = { model: 'clean-bass', cabinet: 'di', cleanLow: 0, bass: 0, mid: 0, treble: 0, presence: 2 / 9, depth: 0, master: .2, sag: 0, gate: -90, output: -6 };
  const mild = render({ ...patch, drive: 0 }, source).left, hot = render({ ...patch, drive: 30 }, source).left;
  const mildRatio = amplitudeAt(mild, 990) / amplitudeAt(mild, 330), hotRatio = amplitudeAt(hot, 990) / amplitudeAt(hot, 330);
  assert(hotRatio > mildRatio * 2, 'Drive should create harmonics');
  const boosted = render({ ...patch, drive: 0, output: 0 }, source).left;
  assert(Math.abs(rms(boosted) / rms(mild) - Math.pow(10, 6 / 20)) < 1e-6, 'Output should be a true post-simulation gain');
});

check('Tone, power, cabinet and microphone controls all shape actual audio', () => {
  const source = signal(sr, .5, 82, .28), base = { model: 'valve-stack', drive: 15, cabinet: 'bass410', cleanLow: .3, mid: 4 };
  const baseline = render(base, source).left;
  const changes = { input: 9, drive: 29, cleanLow: .85, crossover: 420, bass: -10, mid: -10, midFreq: 1700, treble: -10, presence: .95, depth: .9, master: .95, sag: .95, speakerDrive: .9, mic: .95, distance: .95, air: .95, output: 5 };
  for (const [key, value] of Object.entries(changes)) assert(difference(baseline, render({ ...base, [key]: value }, source).left) > .00008, key + ' must change the signal');
  const direct = render({ ...base, cabinet: 'di' }, source).left;
  const directWithCabKnobs = render({ ...base, cabinet: 'di', speakerDrive: 1, mic: 1, distance: 1, air: 1 }, source).left;
  assert.deepEqual(directWithCabKnobs, direct, 'DI should honestly bypass cabinet controls');
});

check('Stereo channels remain independent; mono input sums before the amplifier', () => {
  const source = signal(), silence = new Float32Array(source.length);
  const stereo = render({ stereo: 'stereo' }, source, 128, sr, effects, silence);
  assert(rms(stereo.left) > .01); assert.equal(peak(stereo.right), 0, 'No channel leakage');
  const mono = render({ stereo: 'mono' }, source, 128, sr, effects, silence);
  assert.deepEqual(mono.left, mono.right); assert(rms(mono.left) > .01);
  const opposite = Float32Array.from(source, value => -value);
  assert.equal(peak(render({ stereo: 'mono' }, source, 128, sr, effects, opposite).left), 0, 'Anti-phase input should cancel in mono');
});

check('Gate opens for quiet notes, rejects low noise and releases with the chosen timing', () => {
  const quiet = sine(220, .002);
  assert(rms(render({ gate: -90 }, quiet).left) > .001);
  assert.equal(peak(render({ gate: -20 }, quiet).left), 0);
  const insert = effects.create('broiler', sr, { ...definition.defaults, gate: -45, gateRelease: 40 });
  const active = sine(55, .2, sr, .1); insert.process(active, active.slice());
  const tails = new Float32Array(sr); insert.process(tails, tails.slice());
  assert(rms(tails.subarray(sr / 2)) < 1e-8, 'No persistent tail or injected hum');
  assert.equal(insert.getTailTime(), .35);
});

check('Bypass and zero wet amount preserve exact stereo samples; reset is deterministic', () => {
  const left = signal(), right = signal(sr, .45, 82);
  for (const params of [{ bypass: true }, { mix: 0 }]) {
    const result = render(params, left, 128, sr, effects, right); assert.deepEqual(result.left, left); assert.deepEqual(result.right, right);
  }
  const result = render({ model: 'flip-top', cabinet: 'bass15' }); result.insert.reset();
  const repeat = signal(), other = repeat.slice(); result.insert.process(repeat, other);
  assert.deepEqual(repeat, result.left); assert.deepEqual(other, result.right);
});

check('Worklet factory and offline blocks produce bit-identical stereo audio', () => {
  for (const model of options('model')) {
    const source = signal(sr, .2), patch = { model, cabinet: 'metalbox', cleanLow: .45 };
    const live = render(patch, source, 128), offline = render(patch, source, 2048), worklet = render(patch, source, 128, sr, workletEffects);
    assert.deepEqual(live.left, offline.left, model + ' block invariant'); assert.deepEqual(live.right, offline.right);
    assert.deepEqual(live.left, worklet.left, model + ' self-contained Worklet factory');
  }
});

check('Silent-rack skipping stays sample-exact across block sizes and parameter changes', () => {
  const source = new Float32Array(sr * 2); source.set(signal(sr, .1));
  const live = render({ model: 'high-gain' }, source, 128), offline = render({ model: 'high-gain' }, source, 2048);
  assert.deepEqual(live.left, offline.left); assert.deepEqual(live.right, offline.right);
  assert.equal(peak(live.left.subarray(Math.round(sr * 1.2))), 0, 'Settled amp should become exactly silent');
  live.insert.setParams({ model: 'doom-fuzz', drive: 36, cabinet: 'metalbox', bass: 15, master: 1 });
  const silent = new Float32Array(1024); live.insert.process(silent, silent.slice()); assert.equal(peak(silent), 0, 'Changing a settled amp must not create sound');
  const awakened = signal(sr, .1), right = awakened.slice(); live.insert.process(awakened, right);
  assert(rms(awakened) > .005); finiteAudio(awakened); assert.deepEqual(awakened, right);
});

check('Mono-to-stereo changes synchronize history and discard old opposite-channel tails', () => {
  const insert = effects.create('broiler', sr, { ...definition.defaults, cabinet: 'metalbox' });
  insert.process(signal(sr, .1, 55), signal(sr, .1, 330));
  insert.setParams({ stereo: 'mono' });
  const monoL = signal(sr, .001, 82), monoR = monoL.slice(); insert.process(monoL, monoR); assert.deepEqual(monoL, monoR);
  insert.setParams({ stereo: 'stereo' });
  const stereoL = signal(sr, .05, 110), stereoR = stereoL.slice(); insert.process(stereoL, stereoR);
  assert.deepEqual(stereoL, stereoR, 'No stale right-channel reflection or envelope after mono');
});

check('Partial, unchanged and malformed parameter updates retain normalizer behavior', () => {
  const source = signal(sr, .15), patch = { ...definition.defaults, model: 'high-gain', drive: 22, cabinet: 'metalbox' };
  const updated = effects.create('broiler', sr, patch);
  updated.setParams({ drive: undefined, input: Infinity, model: 'missing', constructor: 'ignore', unknown: 100 });
  updated.setParams(JSON.parse('{"__proto__":{"polluted":true}}'));
  updated.setParams(null); updated.setParams({});
  const expected = effects.normalize('broiler', { ...patch, drive: undefined, input: Infinity, model: 'missing' });
  const left = source.slice(), right = source.slice(); updated.process(left, right);
  const reference = render(expected, source); assert.deepEqual(left, reference.left); assert.deepEqual(right, reference.right);
  assert.equal({}.polluted, undefined);
});

check('Extreme parameters, sample rates, parameter updates and invalid inputs remain bounded', () => {
  for (const rate of [8000, 44100, 48000, 96000, 192000]) {
    for (const extreme of ['min', 'max']) {
      const patch = { ...definition.defaults, model: 'high-gain', cabinet: 'metalbox', gate: -90 };
      for (const p of definition.params) if (p.type === 'range') patch[p.key] = p[extreme];
      patch.mix = 1; patch.gate = -90;
      const insert = effects.create('broiler', rate, patch), left = signal(rate, .1, 41, 1.5), right = left.slice();
      left[0] = NaN; right[1] = Infinity; left[2] = -Infinity; right[3] = 1e30;
      for (let at = 0; at < left.length; at += 128) {
        insert.setParams({ drive: at / left.length * 36, midFreq: 80 + at / left.length * 2400, mic: at / left.length });
        insert.process(left.subarray(at, Math.min(at + 128, left.length)), right.subarray(at, Math.min(at + 128, right.length)));
      }
      finiteAudio(left); finiteAudio(right);
      insert.setParams({ drive: NaN, input: Infinity, output: -Infinity, model: 'unknown', cabinet: 'missing' });
      const tail = new Float32Array(Math.round(rate * .4)); insert.process(tail, tail.slice()); finiteAudio(tail); assert(rms(tail.subarray(Math.round(rate * .3))) < .0001);
    }
  }
});

// Informational CPU result, never a machine-dependent pass/fail threshold.
const benchmarkSource = signal(sr, 1), benchmark = effects.create('broiler', sr, { ...definition.defaults, model: 'high-gain' });
benchmark.process(benchmarkSource.slice(), benchmarkSource.slice()); benchmark.reset();
const benchmarkL = benchmarkSource.slice(), benchmarkR = benchmarkSource.slice(), started = performance.now();
benchmark.process(benchmarkL, benchmarkR); const processingMs = performance.now() - started;
for (const name of passed) console.log('PASS ' + name);
console.log(`${passed.length} BROILER checks passed. Worst-stage stereo 1 s / 48 kHz: ${processingMs.toFixed(1)} ms (informational).`);
