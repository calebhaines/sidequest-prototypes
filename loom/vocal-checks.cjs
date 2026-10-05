'use strict';

// Exercise the same self-contained GLAZE factory used by live and offline audio.
// Run: node loom/vocal-checks.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
globalThis.window = globalThis;
for (const name of ['vocal-dsp.js', 'vocal-catalog.js', 'effects-catalog.js', 'effects.js', 'schema.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, name), 'utf8'), { filename: name });
const dsp = createLoomVocalDSP(), effects = createLoomEffectsDSP(createLoomVocalDSP);
const serializedFactory = vm.runInNewContext('(' + createLoomVocalDSP.toString() + ')', { Math, Number, Object, Float32Array, Float64Array, Int32Array });
const isolated = serializedFactory();
const sr = 48000, off = { clean: 'off', deess: 'off', compressor: 'off', eq: 'off', guard: 'off' }, passed = [];
function check(name, action) { action(); passed.push(name); }
function tone(hz, amp = .15, rate = sr, seconds = .7) { return Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => amp * Math.sin(2 * Math.PI * hz * i / rate)); }
function voice(rate = sr, seconds = .7, frequency = 220, amp = .16) {
  return Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => {
    const t = i / rate, envelope = Math.min(1, t * 80) * (.75 + .25 * Math.sin(t * 9));
    return envelope * amp * (Math.sin(2 * Math.PI * frequency * t) + .42 * Math.sin(2 * Math.PI * frequency * 2 * t) + .24 * Math.sin(2 * Math.PI * frequency * 4 * t) + .1 * Math.sin(2 * Math.PI * 6800 * t));
  });
}
function render(params = {}, source = voice(), block = 128, rate = sr, module = dsp, rightSource = source, context = { tempo: 120 }) {
  const insert = module.create(rate, params), left = source.slice(), right = rightSource.slice();
  for (let at = 0; at < left.length; at += block) {
    const end = Math.min(at + block, left.length), ctx = { ...context };
    if (context.playing) ctx.beat = (context.beat || 0) + at / rate * context.tempo / 60;
    insert.process(left.subarray(at, end), right.subarray(at, end), ctx);
  }
  return { left, right, insert };
}
function rms(audio, start = 0) { let sum = 0; for (let i = start; i < audio.length; i++) sum += audio[i] * audio[i]; return Math.sqrt(sum / Math.max(1, audio.length - start)); }
function peak(audio) { let p = 0; for (const x of audio) p = Math.max(p, Math.abs(x)); return p; }
function difference(a, b) { let sum = 0; for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2; return Math.sqrt(sum / a.length); }
function amplitudeAt(audio, hz, rate = sr) {
  const start = Math.floor(audio.length * .6), length = audio.length - start; let real = 0, imaginary = 0;
  for (let i = start; i < audio.length; i++) { const phase = 2 * Math.PI * hz * i / rate; real += audio[i] * Math.cos(phase); imaginary += audio[i] * Math.sin(phase); }
  return 2 * Math.hypot(real, imaginary) / length;
}
function strongest(audio, lo, hi, step = .5, rate = sr) { let best = lo, level = -1; for (let hz = lo; hz <= hi; hz += step) { const value = amplitudeAt(audio, hz, rate); if (value > level) { level = value; best = hz; } } return { hz: best, level }; }
function finiteAudio(audio) { assert(audio.every(x => Number.isFinite(x) && Math.abs(x) <= 8), 'Nonfinite or unbounded output'); }
function fingerprint(audio) { return createHash('sha256').update(Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength)).digest('hex'); }

check('Catalog, factories, presets, automation and project round trips agree', () => {
  const definition = LoomEffectsCatalog.find(effect => effect.id === 'glaze'); assert(definition, 'GLAZE is registered');
  assert.deepEqual(dsp.normalize({}), definition.defaults);
  assert.deepEqual(effects.normalize('glaze', {}), definition.defaults);
  for (const preset of definition.presets) {
    assert.deepEqual(dsp.normalize(preset.params), preset.params, preset.name);
    const state = LoomSchema.defaultState(); state.tracks[0].effects[0] = { type: 'glaze', params: preset.params };
    const restored = LoomSchema.parseProject(LoomSchema.serializeProject(state));
    assert.deepEqual(restored.tracks[0].effects[0].params, preset.params, preset.name);
    for (const param of definition.params.filter(p => p.type === 'range')) assert(LoomSchema.automationTargets(restored.tracks[0]).some(target => target.target === 'fx:0:' + param.key && target.min === param.min && target.max === param.max), param.key);
  }
  const grouped = definition.groups.flatMap(group => [group.enableKey, ...group.keys]).filter(Boolean);
  for (const param of definition.params) assert(grouped.includes(param.key), param.key + ' has no UI group');
});

check('Self-contained serialized factory produces byte-identical live/offline audio', () => {
  const params = { pitch: 'correct', key: 'A', scale: 'minor', speed: .9, harmony: 'on', doubler: 'on', saturation: 'warm', delay: 'on', reverb: 'on' }, source = voice(sr, 1.2, 231);
  assert.deepEqual(render(params, source).left, render(params, source, 128, sr, isolated).left);
  const wrapper = vm.runInNewContext('(' + createLoomEffectsDSP.toString() + ')', { Math, Number, Object, Float32Array, Float64Array, Int32Array });
  const insert = wrapper(serializedFactory).create('glaze', sr, params), left = source.slice(), right = source.slice();
  for (let at = 0; at < left.length; at += 128) insert.process(left.subarray(at, at + 128), right.subarray(at, at + 128), { tempo: 120 });
  assert.deepEqual(left, render(params, source).left);
});

check('Practical default begins at frame zero and keeps pitch buffering disabled', () => {
  const impulse = new Float32Array(128); impulse[0] = .15;
  const { left, insert } = render({}, impulse); assert(left[0] > .1, 'Cleanup must not delay live voice');
  assert.equal(insert.getMeters().pitchLatencyMs, 0); assert.equal(insert.getLatency().directMs, 0);
  const audio = render({}, voice()); assert(rms(audio.left) > .06); assert(peak(audio.left) < 1);
});

check('Bypass and zero mix preserve true dry audio, including output and ceiling controls', () => {
  const source = voice(), extreme = { pitch: 'shift', semitones: 12, saturation: 'fold', drive: 30, robot: 'vocoder', delay: 'on', reverb: 'on', output: 12, ceiling: -12 };
  assert.deepEqual(render({ ...extreme, bypass: true }, source).left, source);
  assert.deepEqual(render({ ...extreme, mix: 0 }, source).left, source);
  const insert = dsp.create(sr, { ...off }); insert.setParam('mix', 0); assert.equal(insert.params.mix, 0);
  const snapshot = insert.params; snapshot.mix = 1; assert.equal(insert.params.mix, 0, 'Returned params are a copy');
});

check('Cleanup rejects rumble while leaving the vocal band and has a useful soft gate', () => {
  const patch = { ...off, clean: 'on', highpass: 150, gate: -90, gateRange: 0 };
  const rumble = render(patch, tone(35)).left, voiceBand = render(patch, tone(1000)).left;
  assert(rms(rumble, 12000) < rms(voiceBand, 12000) * .09, 'Low cut should remove rumble');
  const quiet = tone(220, .00008, sr, 2), gated = render({ ...off, clean: 'on', highpass: 20, gate: -45, gateRange: 45, gateRelease: 40 }, quiet).left;
  assert(rms(gated, 48000) < rms(quiet, 48000) * .02, 'Gate should attenuate low-level spill');
  const loud = render({ ...off, clean: 'on', highpass: 20, gate: -45 }, tone(1000, .2)).left;
  assert(rms(loud, 12000) > .135, 'Gate should open for a voice');
});

check('De-esser selectively reduces sibilance without broadband phrase ducking', () => {
  const patch = { ...off, deess: 'on', deessFreq: 6000, deessThreshold: -36, deessAmount: .9 };
  const high = tone(8500, .18), low = tone(350, .18);
  assert(rms(render(patch, high).left, 12000) < rms(high, 12000) * .5, 'Sibilance should be reduced');
  assert(rms(render(patch, low).left, 12000) > rms(low, 12000) * .95, 'Vocal fundamentals should remain');
  const mixed = Float32Array.from(low, (x, i) => x + high[i]), output = render(patch, mixed);
  assert(amplitudeAt(output.left, 350) > amplitudeAt(mixed, 350) * .9); assert(output.insert.getMeters().deessDb > 6);
});

check('Compression, attack/release, gain reduction and makeup respond to real dynamics', () => {
  const source = tone(1000, .5), patch = { ...off, compressor: 'on', threshold: -24, ratio: 8, attack: 1, release: 80, makeup: 0 };
  const squeezed = render(patch, source); assert(rms(squeezed.left, 12000) < rms(source, 12000) * .25); assert(squeezed.insert.getMeters().reductionDb > 12);
  const makeup = render({ ...patch, makeup: 6 }, source); assert(Math.abs(rms(makeup.left, 12000) / rms(squeezed.left, 12000) - Math.pow(10, 6 / 20)) < 1e-5);
  const transient = new Float32Array(4800); for (let i = 0; i < 1000; i++) transient[i] = .7;
  const fast = render({ ...patch, attack: .2 }, transient).left, slow = render({ ...patch, attack: 80 }, transient).left;
  assert(rms(fast.subarray(100, 500)) < rms(slow.subarray(100, 500)) * .5, 'Attack should affect transients');
});

check('Every tone band and saturation mode changes the signal without injecting silence', () => {
  const source = voice(), base = render({ ...off }, source).left;
  for (const [key, value] of Object.entries({ body: 12, mud: -12, presence: 12, air: -12 })) assert(difference(base, render({ ...off, eq: 'on', body: 0, mud: 0, presence: 0, air: 0, [key]: value }, source).left) > .003, key);
  const hashes = new Set();
  for (const saturation of ['warm', 'edge', 'fold']) {
    const patch = { ...off, saturation, drive: 24, satMix: 1 }, audio = render(patch, source).left; finiteAudio(audio); hashes.add(fingerprint(audio));
    assert.equal(peak(render(patch, new Float32Array(5000)).left), 0);
  }
  assert.equal(hashes.size, 3); const driven = render({ ...off, saturation: 'warm', drive: 24, satMix: 1 }, tone(220)).left;
  assert(amplitudeAt(driven, 660) > .008, 'Saturation should create harmonics');
});

check('Pitch transpose moves real fundamentals an octave up and down with honest latency', () => {
  const source = tone(220, .2, sr, 1.2);
  const up = render({ ...off, pitch: 'shift', semitones: 12 }, source), down = render({ ...off, pitch: 'shift', semitones: -12 }, source);
  assert(amplitudeAt(up.left, 440) > .16); assert(amplitudeAt(up.left, 220) < .02);
  assert(amplitudeAt(down.left, 110) > .16); assert(amplitudeAt(down.left, 220) < .02);
  assert(Math.abs(up.insert.getMeters().detectedHz - 220) < 1); assert(up.insert.getMeters().pitchLatencyMs > 15);
  assert(up.insert.getMeters().pitchMaxLatencyMs <= 54.001); assert.equal(up.insert.getMeters().coreLatencyMs, 0);
});

check('Real YIN tracking corrects a detuned monophonic note toward its selected scale', () => {
  const source = tone(231, .2, sr, 1.5), patch = { ...off, pitch: 'correct', key: 'A', scale: 'minor', speed: 1, pitchWindow: 60 };
  const output = render(patch, source), dominant = strongest(output.left, 215, 240);
  assert(Math.abs(dominant.hz - 220) < 1, 'Expected A3, got ' + dominant.hz);
  assert(output.insert.getMeters().confidence > .9); assert(Math.abs(output.insert.getMeters().detectedHz - 231) < 1);
  assert(output.insert.getMeters().tuningCents < -70);
  const transparent = render({ ...patch, speed: 0 }, source); assert(amplitudeAt(transparent.left, 231) > .16, 'Zero correction strength should keep original pitch');
  const chromatic = render({ ...patch, key: 'C', scale: 'chromatic' }, tone(243, .2, sr, 1.5));
  assert(Math.abs(strongest(chromatic.left, 225, 255).hz - 246.94) < 1.5, 'Chromatic scale should snap to B3');
});

check('Pitch tracker rejects silence/unvoiced noise instead of claiming a tuned note', () => {
  let seed = 98765;
  const noise = Float32Array.from({ length: 48000 }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return ((seed >>> 8) / 0xffffff - .5) * .2; });
  const output = render({ ...off, pitch: 'correct' }, noise); assert.equal(output.insert.getMeters().detectedHz, 0); assert.equal(output.insert.getMeters().tuningCents, 0); finiteAudio(output.left);
  assert.equal(peak(render({ pitch: 'correct', harmony: 'on' }, new Float32Array(10000)).left), 0);
});

check('Two harmonies create two actual pitches and a controllable stereo image', () => {
  const source = tone(220, .2, sr, 1.3), output = render({ ...off, harmony: 'on', harmonyA: 12, harmonyB: -12, harmonyMix: .8, harmonyWidth: 1 }, source);
  assert(amplitudeAt(output.left, 440) > .1); assert(amplitudeAt(output.right, 110) > .1);
  assert(amplitudeAt(output.left, 110) < amplitudeAt(output.right, 110) * .1);
  assert(amplitudeAt(output.right, 440) < amplitudeAt(output.left, 440) * .1);
  assert(amplitudeAt(output.left, 220) > .1, 'Original should stay in harmony mix');
});

check('Doubler is a parallel delayed drift, retaining an immediate lead', () => {
  const impulse = new Float32Array(6000); impulse[0] = .2;
  const output = render({ ...off, doubler: 'on', doubleAmount: 1, doubleTime: 20, doubleDetune: 10, doubleSpread: 1 }, impulse);
  assert.equal(output.left[0], impulse[0]); assert(peak(output.left.subarray(300, 1500)) > .04); assert(difference(output.left, output.right) > .0001);
  assert.equal(output.insert.getMeters().pitchLatencyMs, 0, 'Doubler must not claim the dry path is delayed');
});

check('Five vowel resonators and their shifted resonances provide audible distinct filters', () => {
  const source = voice(sr, .5, 130), hashes = new Set();
  for (const vowel of ['ah', 'eh', 'ee', 'oh', 'oo']) { const audio = render({ ...off, vowel, vowelMix: 1 }, source).left; assert(rms(audio) > .003, vowel); hashes.add(fingerprint(audio)); }
  assert.equal(hashes.size, 5);
  const a = render({ ...off, vowel: 'ah', vowelMix: 1, formant: -8 }, source).left, b = render({ ...off, vowel: 'ah', vowelMix: 1, formant: 8 }, source).left;
  assert(difference(a, b) > .025);
});

check('Ring modulation creates sidebands and vocoder articulates a silent-by-default carrier', () => {
  const output = render({ ...off, robot: 'ring', robotMix: 1, robotFreq: 100 }, tone(440));
  assert(amplitudeAt(output.left, 340) > .05); assert(amplitudeAt(output.left, 540) > .05); assert(amplitudeAt(output.left, 440) < .001);
  const source = voice(sr, 1.2, 130), hashes = new Set();
  for (const carrier of ['saw', 'square', 'pulse']) {
    const patch = { ...off, robot: 'vocoder', robotMix: 1, carrier, carrierNote: 48, carrierChord: 'minor' }, audio = render(patch, source).left;
    finiteAudio(audio); assert(rms(audio, 20000) > .005, carrier); hashes.add(fingerprint(audio));
    assert.equal(peak(render(patch, new Float32Array(5000)).left), 0, 'Carrier must not sound without input');
  }
  assert.equal(hashes.size, 3);
  const single = render({ ...off, robot: 'vocoder', robotMix: 1, carrierChord: 'single' }, source).left, chord = render({ ...off, robot: 'vocoder', robotMix: 1, carrierChord: 'major' }, source).left;
  assert(difference(single, chord) > .005);
});

check('Tempo delay has exact first-repeat timing, stereo feedback and useful ducking', () => {
  const source = new Float32Array(48000); source[0] = .2;
  const patch = { ...off, delay: 'on', delayClock: 'sync', delayDivision: '1/8', delayMix: 1, delayFeedback: .5, delayWidth: 1, delayDuck: 0 };
  const fast = render(patch, source), slow = render(patch, source, 128, sr, dsp, source, { tempo: 60 });
  assert.equal(fast.left[12000], source[0]); assert.equal(slow.left[24000], source[0]); assert.equal(peak(fast.left.subarray(1, 12000)), 0);
  const mono = render(patch, source, 128, sr, dsp, new Float32Array(source.length)); assert(mono.right[24000] > .01, 'Ping-pong repeat should cross channels');
  const phrase = tone(220, .5, sr, 1.1), unducked = render({ ...patch, delayFeedback: 0, delayDuck: 0 }, phrase).left, ducked = render({ ...patch, delayFeedback: 0, delayDuck: 1 }, phrase).left;
  assert(rms(ducked, 20000) < rms(unducked, 20000) * .85); assert(fast.insert.getTailTime({ tempo: 60 }) > fast.insert.getTailTime({ tempo: 120 }));
});

check('Reverb produces a finite stereo tail and switching it off discards stale history', () => {
  const source = new Float32Array(48000); source[0] = .5;
  const output = render({ ...off, reverb: 'on', reverbMix: 1, reverbDecay: 2, predelay: 10, reverbDuck: 0 }, source);
  assert.equal(output.left[0], source[0]); assert(rms(output.left, 2000) > .0001); assert(difference(output.left, output.right) > .0001); assert(output.insert.getTailTime({ tempo: 120 }) > 2);
  output.insert.setParams({ reverb: 'off' }); output.insert.setParams({ reverb: 'on' }); const silence = new Float32Array(12000), right = silence.slice(); output.insert.process(silence, right, { tempo: 120 }); assert.equal(peak(silence), 0);
});

check('Rhythmic chop follows tempo/transport phase and smoothing changes its edges', () => {
  const source = new Float32Array(48000).fill(.2), patch = { ...off, chop: 'on', chopDepth: 1, chopDivision: '1/16', chopDuty: .5, chopSmooth: .2 };
  const fast = render(patch, source, 128, sr, dsp, source, { tempo: 120, playing: true, beat: 0 }), slow = render(patch, source, 128, sr, dsp, source, { tempo: 60, playing: true, beat: 0 });
  assert(fast.left[4000] < .001); assert(slow.left[4000] > .19); assert(Math.abs(rms(fast.left) - .2 / Math.sqrt(2)) < .002);
  const smooth = render({ ...patch, chopSmooth: 40 }, source).left; assert(difference(fast.left, smooth) > .04);
});

check('Stereo cleanup paths are independent and real peak guard respects its ceiling', () => {
  const source = voice(), silence = new Float32Array(source.length), output = render({}, source, 128, sr, dsp, silence);
  assert.equal(peak(output.right), 0, 'Practical strip must not leak across channels');
  const guarded = render({ ...off, guard: 'on', ceiling: -6, output: 12 }, tone(220, .8)).left;
  assert(peak(guarded) <= Math.pow(10, -6 / 20) + 1e-7);
  assert.equal(peak(render({ pitch: 'shift', harmony: 'on', doubler: 'on', robot: 'vocoder', delay: 'on', reverb: 'on', saturation: 'edge' }, silence).left), 0);
});

check('Different block sizes and a full reset give deterministic samples', () => {
  const source = voice(sr, 1, 231), patch = { pitch: 'correct', key: 'A', scale: 'minor', speed: .9, harmony: 'on', doubler: 'on', vowel: 'ah', formant: 3, robot: 'vocoder', robotMix: .2, chop: 'on', chopDepth: .3, delay: 'on', reverb: 'on', saturation: 'edge' };
  const reference = render(patch, source, 128), large = render(patch, source, 1024), irregular = render(patch, source, 73);
  assert.deepEqual(reference.left, large.left); assert.deepEqual(reference.left, irregular.left);
  reference.insert.reset(); const left = source.slice(), right = source.slice();
  for (let at = 0; at < left.length; at += 128) reference.insert.process(left.subarray(at, at + 128), right.subarray(at, at + 128), { tempo: 120 });
  assert.deepEqual(left, reference.left, 'Reset should reproduce the original render');
});

check('Invalid controls, pathological input and parameter changes stay bounded at 44.1/48/96 kHz', () => {
  const bad = Object.fromEntries(Object.keys(dsp.specifications).map(key => [key, NaN])), normalized = dsp.normalize(bad); assert.deepEqual(normalized, dsp.normalize({}));
  for (const rate of [44100, 48000, 96000]) {
    for (const extreme of ['min', 'max']) {
      const patch = { pitch: 'correct', harmony: 'on', doubler: 'on', robot: 'vocoder', reverb: 'on', delay: 'on', chop: 'on', vowel: 'ee', saturation: 'fold' };
      for (const [key, rule] of Object.entries(dsp.specifications)) if (typeof rule[0] === 'number') patch[key] = rule[extreme === 'min' ? 0 : 1];
      const source = voice(rate, .35), result = render(patch, source, 128, rate); finiteAudio(result.left); finiteAudio(result.right); assert(Number.isFinite(result.insert.getTailTime({ tempo: 40 })));
      result.insert.setParams({ pitchWindow: 25, robot: 'ring', robotFreq: 2000, reverbSize: .01, mix: .4 }); result.insert.process(source.subarray(0, 128), source.slice(0, 128), { tempo: 300 }); finiteAudio(source);
    }
    for (const preset of LoomEffectsCatalog.find(effect => effect.id === 'glaze').presets) {
      const source = voice(rate, .2), audio = render(preset.params, source, 128, rate).left; finiteAudio(audio); assert(rms(audio) > .002, rate + ' ' + preset.name);
    }
  }
  const source = Float32Array.from([NaN, Infinity, -Infinity, 1e20, -1e20, .1]); finiteAudio(render({ robot: 'vocoder', delay: 'on', reverb: 'on' }, source).left);
  assert.throws(() => dsp.create(sr).process(new Float32Array(1), new Float32Array(2)), /equal stereo blocks/);
});

let performanceReport;
check('Practical and full creative 128-frame paths stay comfortably within a realtime budget', () => {
  function measure(params) {
    const insert = dsp.create(sr, params), left = new Float32Array(128), right = new Float32Array(128), costs = [];
    for (let block = 0; block < 900; block++) {
      for (let i = 0; i < 128; i++) left[i] = right[i] = .12 * Math.sin(2 * Math.PI * 231 * (block * 128 + i) / sr);
      const at = performance.now(); insert.process(left, right, { tempo: 128 }); const cost = performance.now() - at;
      if (block > 300) costs.push(cost);
    }
    costs.sort((a, b) => a - b);
    return { averageMs: costs.reduce((a, b) => a + b, 0) / costs.length, p99Ms: costs[Math.floor(costs.length * .99)], maximumMs: costs.at(-1) };
  }
  performanceReport = { quantumMs: 128 / sr * 1000, practical: measure({}), creative: measure({ pitch: 'correct', harmony: 'on', doubler: 'on', robot: 'vocoder', reverb: 'on', delay: 'on', chop: 'on', vowel: 'ah', saturation: 'warm' }) };
  // Wall-clock maxima may include OS scheduling. The 99th percentile includes
  // detector update blocks; browser QA independently measures the actual Core.
  assert(performanceReport.practical.p99Ms < performanceReport.quantumMs, JSON.stringify(performanceReport));
  assert(performanceReport.creative.p99Ms < performanceReport.quantumMs, JSON.stringify(performanceReport));
});

console.log(JSON.stringify({ suite: 'GLAZE vocal DSP', passed: passed.length, checks: passed, performance: performanceReport }, null, 2));
