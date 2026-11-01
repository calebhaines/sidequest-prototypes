'use strict';
/* FERMENT · independent pitch, synthesis, state and exact-audio contracts.
 * node loom/pedal-synth-checks.cjs [--bench]
 * Benchmarks are informational: reserve the machine and close Chromium first.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto, createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const directory = __dirname, root = path.resolve(directory, '..');
const BASELINE = '96692e865db605361c6f34ab3b7e5c34f691d68f';
const catalogs = ['vocal', 'utility', 'filter', 'creative', 'preamp', 'tape', 'char', 'lofi'];
const dsps = ['vocal', 'utility', 'filter', 'creative', 'preamp', 'tape', 'char', 'lofi'];
const modules = [...catalogs.map(name => name + '-catalog.js'), 'pedal-synth-catalog.js', 'deluxe-catalog.js', 'effects-catalog.js', ...dsps.map(name => name + '-dsp.js'), 'pedal-synth-tracker.js', 'pedal-synth-dsp.js', 'deluxe-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'effects.js'];
function source(name, ref) {
  if (ref) return execFileSync('git', ['show', ref + ':loom/' + name], { cwd: root, maxBuffer: 12 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  return fs.readFileSync(path.join(directory, name), 'utf8');
}
function load(ref) {
  const scope = { console, performance, Date, crypto: webcrypto, Blob, AbortController, DOMException, setTimeout, clearTimeout, TextEncoder, TextDecoder, structuredClone };
  scope.window = scope; scope.globalThis = scope;
  scope.atob = value => Buffer.from(value, 'base64').toString('binary'); scope.btoa = value => Buffer.from(value, 'binary').toString('base64');
  for (const name of modules) {
    if (ref && (name.startsWith('pedal-synth-') || name.startsWith('deluxe-'))) continue;
    Function('window', 'globalThis', 'crypto', 'atob', 'btoa', source(name, ref) + '\n//# sourceURL=ferment-' + name)(scope, scope, scope.crypto, scope.atob, scope.btoa);
  }
  const E = scope.createLoomEffectsDSP(scope.createLoomVocalDSP, scope.createLoomUtilityDSP, scope.createLoomFilterDSP, scope.createLoomCreativeDSP, scope.createLoomBroilerPedalsDSP, scope.createLoomCompressorDSP, scope.createLoomPreampDSP, scope.createLoomTapeDSP, scope.createLoomCharDSP, scope.createLoomLoFiDSP, scope.createLoomPedalSynthDSP, scope.createLoomPedalTrackerDSP, scope.createLoomDeluxeDSP);
  return { scope, E, F: scope.createLoomPedalSynthDSP?.(scope.createLoomPedalTrackerDSP), T: scope.createLoomPedalTrackerDSP?.(), definition: scope.LoomEffectsCatalog.find(effect => effect.id === 'ferment') };
}
const plain = value => JSON.parse(JSON.stringify(value));
const hash = channels => { const h = createHash('sha256'); for (const c of channels) h.update(Buffer.from(c.buffer, c.byteOffset, c.byteLength)); return h.digest('hex'); };
const cents = (frequency, target) => 1200 * Math.log2(frequency / target);
const quantile = (values, at = .5) => { assert(values.length, 'No observations'); const sorted = values.slice().sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * at))]; };
function signal(frames, rate = 48000, gain = .08) { return [0, 1].map(channel => Float32Array.from({ length: frames }, (_, frame) => gain * (Math.sin(2 * Math.PI * (channel ? 229 : 137) * frame / rate) + .27 * Math.sin(2 * Math.PI * (channel ? 2371 : 1723) * frame / rate)))); }
function tone(hz, frames = 48000, rate = 48000, gain = .08) { const data = Float32Array.from({ length: frames }, (_, frame) => gain * Math.sin(2 * Math.PI * hz * frame / rate)); return [data, data.slice()]; }
function pluck(hz, seconds = 1, rate = 48000, options = {}) {
  const harmonics = options.harmonics || [1, .4, .22, .12, .08], gain = options.gain ?? .14, onset = Math.round((options.onset || 0) * rate), result = new Float32Array(Math.ceil(seconds * rate));
  const normalization = harmonics.reduce((sum, weight) => sum + Math.abs(weight), 0) || 1;
  for (let frame = onset; frame < result.length; frame++) {
    const time = (frame - onset) / rate, envelope = (1 - Math.exp(-time * 1300)) * Math.exp(-time / (options.decay || 2)); let value = 0;
    for (let harmonic = 0; harmonic < harmonics.length; harmonic++) value += harmonics[harmonic] * Math.sin(2 * Math.PI * hz * (harmonic + 1) * time + harmonic * .31);
    result[frame] = gain * envelope * value / normalization;
  }
  return result;
}
function feed(fx, input, blocks = 137, events = [], rate = 48000) {
  const audio = input.map(channel => channel.slice()), sizes = Array.isArray(blocks) ? blocks : [blocks]; let at = 0, step = 0, event = 0;
  while (at < audio[0].length) {
    while (event < events.length && events[event].at === at) { const item = events[event++]; if (item.reset) fx.reset(); if (item.patch) fx.setParams(item.patch); }
    const end = Math.min(audio[0].length, at + sizes[step++ % sizes.length], events[event]?.at ?? Infinity);
    fx.process(audio[0].subarray(at, end), audio[1].subarray(at, end), { tempo: 120, beat: at / rate * 2, playing: true }); at = end;
  }
  return audio;
}
function rms(data, start = 0, end = data.length) { let sum = 0; for (let frame = start; frame < end; frame++) sum += data[frame] * data[frame]; return Math.sqrt(sum / Math.max(1, end - start)); }
function projection(data, hz, rate = 48000, start = Math.floor(data.length / 2), end = data.length) { let real = 0, imaginary = 0; for (let frame = start; frame < end; frame++) { const phase = 2 * Math.PI * hz * frame / rate; real += data[frame] * Math.cos(phase); imaginary += data[frame] * Math.sin(phase); } return 2 * Math.hypot(real, imaginary) / Math.max(1, end - start); }
function difference(a, b) { assert.equal(a.length, b.length); let max = 0, sum = 0; for (let frame = 0; frame < a.length; frame++) { assert(Number.isFinite(a[frame]) && Number.isFinite(b[frame])); const error = a[frame] - b[frame]; max = Math.max(max, Math.abs(error)); sum += error * error; } return { max, rms: Math.sqrt(sum / Math.max(1, a.length)) }; }
function finite(audio, limit = 8) { for (const channel of audio) for (const value of channel) assert(Number.isFinite(value) && Math.abs(value) <= limit, 'Non-finite or unbounded audio: ' + value); }
function track(T, input, rate = 48000, patch = {}) {
  const tracker = T.create(rate, patch), observations = [];
  for (let frame = 0; frame < input.length; frame++) if (tracker.push(input[frame])) {
    observations.push({ frame, ms: frame / rate * 1000, frequencyHz: tracker.frequency, confidence: tracker.confidence, active: tracker.active, latencyMs: tracker.trackingLatencyMs });
  }
  return { tracker, observations };
}
function goodPitch(observations, hz, sinceMs, label, options = {}) {
  const confidence = options.confidence ?? .65, data = observations.filter(item => item.ms >= sinceMs && item.active && item.confidence >= confidence && item.frequencyHz > 0);
  assert(data.length >= 5, label + ' has no stable pitch: ' + JSON.stringify(observations.slice(-8)));
  const errors = data.map(item => Math.abs(cents(item.frequencyHz, hz))), median = quantile(errors), p95 = quantile(errors, .95), octaveErrors = errors.filter(error => error > 700).length;
  assert(median < (options.median ?? 12), label + ' median cents ' + median);
  assert(p95 < (options.p95 ?? 30), label + ' 95th-percentile cents ' + p95);
  assert(octaveErrors <= (options.octaveErrors ?? 0), label + ' octave errors ' + octaveErrors);
  return { updates: data.length, medianCents: median, p95Cents: p95, firstLockedMs: observations.find(item => item.active && item.confidence >= confidence && Math.abs(cents(item.frequencyHz, hz)) < 30)?.ms, reportedLatencyMs: quantile(data.map(item => item.latencyMs)) };
}
function fixedTracker(frequency = 110) {
  return function createFixedTracker() {
    return { create() { return { frequency, confidence: 1, active: true, level: .1, period: 48000 / frequency, trackingLatencyMs: 0, push() { return true; }, process() { return true; }, reset() {}, setParams() {}, getMeters() { return { frequencyHz: frequency, confidence: 1, active: true, levelDb: -20, trackingLatencyMs: 0 }; } }; } };
  };
}
module.exports = { BASELINE, load, source, plain, hash, cents, quantile, signal, tone, pluck, feed, rms, projection, difference, finite, track, goodPitch, fixedTracker };
async function run() {
  const release = load(), { F, E, T, definition } = release, evidence = {}, passed = [];
  const check = async (name, test) => { if (process.env.FERMENT_QA_FILTER && !new RegExp(process.env.FERMENT_QA_FILTER).test(name)) return; await test(); passed.push(name); console.log('PASS ' + name); };
  assert(F && T && definition, 'FERMENT catalog, tracker and DSP must be registered');
  await check('Catalog, tracker dependency and self-contained synthesis agree on defaults and limits', () => {
    assert.equal(definition.id, 'ferment'); assert.equal(definition.name, 'FERMENT'); assert.equal(new Set(definition.params.map(param => param.key)).size, definition.params.length);
    assert.deepEqual(plain(F.normalize({})), plain(definition.defaults)); assert.deepEqual(plain(E.normalize('ferment', {})), plain(definition.defaults));
    for (const param of definition.params) { const rule = F.specifications[param.key]; assert(rule, 'Missing DSP control ' + param.key); if (param.type === 'range') assert.deepEqual(plain(rule), [param.min, param.max, param.default], param.key); else assert.deepEqual(plain(rule).sort(), plain(param.options.map(option => option.value)).sort(), param.key); }
    const isolatedTracker = vm.runInNewContext('(' + release.scope.createLoomPedalTrackerDSP.toString() + ')'), isolatedSynth = vm.runInNewContext('(' + release.scope.createLoomPedalSynthDSP.toString() + ')');
    const isolated = isolatedSynth(isolatedTracker); assert.deepEqual(plain(isolated.normalize({})), plain(F.normalize({})));
    const input = tone(110, 3072); assert.deepEqual(feed(isolated.create(48000, { mode: 'chord' }), input), feed(F.create(48000, { mode: 'chord' }), input));
    const dirty = { cutoff: Infinity, resonance: NaN, synthLevel: '1', mode: 'missing', inputRange: 'missing', bypass: 'true' }, before = plain(dirty); assert.deepEqual(plain(F.normalize(dirty)), plain(definition.defaults)); assert.deepEqual(plain(dirty), before);
  });
  await check('Clean guitar and five-string bass fundamentals acquire within causal observation bounds', () => {
    const report = {};
    for (const [hz, range] of [[30.867706, 'bass'], [41.203445, 'bass'], [55, 'bass'], [82.406889, 'guitar'], [110, 'auto'], [164.813778, 'guitar'], [329.627557, 'guitar'], [659.255114, 'guitar'], [1318.510228, 'guitar']]) {
      const result = track(T, pluck(hz, .8, 48000, { harmonics: [1], decay: 5 }), 48000, { range, sensitivity: -65 });
      const metrics = goodPitch(result.observations, hz, 220, hz + ' Hz ' + range); assert(metrics.firstLockedMs <= (hz < 60 ? 140 : 80), 'Acquisition takes too long: ' + JSON.stringify(metrics));
      assert(metrics.reportedLatencyMs >= 1000 / hz, 'A causal period estimate cannot claim zero observation time'); assert(metrics.reportedLatencyMs < 180); report[hz] = metrics;
    }
    evidence.cleanTracking = report;
  });
  await check('The first authorized bass estimate is the fundamental, not a transient treble or octave blip', () => {
    const report = {};
    for (const hz of [27, 30.867706, 41.203445, 82.406889]) for (const [name, harmonics] of [['sine', [1]], ['picked', [.18, 1, .45, .25]], ['missing', [0, .8, .55]]]) {
      const result = track(T, pluck(hz, .45, 48000, { harmonics, decay: 5 }), 48000, { range: hz < 60 ? 'bass' : 'guitar', sensitivity: -65 });
      const authorized = result.observations.filter(item => item.active && item.confidence >= .45 && item.frequencyHz > 0); assert(authorized.length > 5, 'No first lock for ' + hz + ' ' + name);
      const first = authorized[0], firstError = Math.abs(cents(first.frequencyHz, hz)); assert(firstError < 35, 'First audible pitch is wrong: ' + JSON.stringify({ hz, name, first, firstError }));
      for (const item of authorized.filter(item => item.ms < 250)) assert(Math.abs(cents(item.frequencyHz, hz)) < 70, 'An early octave/transient blip escaped: ' + JSON.stringify({ hz, name, item }));
      report[hz + '-' + name] = { firstMs: first.ms, firstHz: first.frequencyHz, firstCents: firstError };
    }
    evidence.firstAuthorizedPitch = report;
  });
  await check('The advertised range endpoints remain detectable instead of excluding boundary minima', () => {
    const report = {};
    for (const [hz, range] of [[27, 'auto'], [50, 'guitar'], [660, 'bass'], [1600, 'guitar']]) {
      const result = track(T, pluck(hz, .7, 48000, { harmonics: [1], decay: 5 }), 48000, { range, sensitivity: -65 });
      report[range + '-' + hz] = goodPitch(result.observations, hz, 250, range + ' endpoint ' + hz, { median: 8, p95: 16 });
    }
    evidence.rangeEndpoints = report;
  });
  await check('The detector lag-grid transition preserves E3 and nearby string pitches without suboctaves', () => {
    const report = {};
    for (const rate of [8000, 44100, 48000, 96000, 192000]) {
      const analysisRate = rate / Math.ceil(rate / 8000), boundary = analysisRate / 48;
      const frequencies = rate === 48000 ? [...Array.from({ length: 21 }, (_, index) => 155 + index), 164.813778, boundary] : [boundary * .96, boundary, boundary * 1.04, 164.813778];
      for (const hz of frequencies) for (const [name, harmonics] of [['sine', [1]], ['picked', [.18, 1, .45, .25]], ['missing', [0, .8, .55]]]) {
        const result = track(T, pluck(hz, .5, rate, { harmonics, decay: 5 }), rate, { range: 'guitar', sensitivity: -65 });
        const label = rate + '/' + hz + '/' + name;
        report[label] = goodPitch(result.observations, hz, 180, label, { median: 20, p95: 35 });
        for (const item of result.observations.filter(item => item.active && item.confidence >= .65)) assert(Math.abs(cents(item.frequencyHz, hz)) < 70, 'Lag spacing produced an authorized false note: ' + JSON.stringify({ rate, hz, name, item }));
      }
    }
    evidence.lagGridTransition = report;
  });
  await check('Every chromatic guitar and bass note tracks across the advertised range without octave substitutions', () => {
    const rate = 48000, report = { cases: 0, worstMedianCents: 0, worstP95Cents: 0, worstOnset: null };
    for (let midi = 21; midi <= 91; midi++) {
      const hz = 440 * Math.pow(2, (midi - 69) / 12);
      if (hz < 27 || hz > 1600) continue;
      for (const [name, harmonics] of [['sine', [1]], ['picked', [.18, 1, .45, .25]], ['missing', [0, .8, .55]]]) {
        // A missing F0 is identifiable from H2+H3 only while both harmonics
        // survive the detector's analysis Nyquist. H2 alone is ambiguous.
        if (name === 'missing' && hz * 3 >= 4000) continue;
        const result = track(T, pluck(hz, .6, rate, { harmonics, decay: 5 }), rate, { range: hz < 50 ? 'bass' : 'guitar', sensitivity: -65 });
        const metrics = goodPitch(result.observations, hz, 180, 'Chromatic MIDI ' + midi + ' ' + name, { median: 20, p95: 40 });
        const authorized = result.observations.filter(item => item.active && item.confidence >= .45), first = authorized[0], firstCents = Math.abs(cents(first.frequencyHz, hz));
        for (const item of authorized) assert(Math.abs(cents(item.frequencyHz, hz)) < 25, 'A chromatic onset authorized a detuned note: ' + JSON.stringify({ midi, hz, name, item }));
        const refined = authorized.find(item => Math.abs(cents(item.frequencyHz, hz)) < 5);
        assert(refined && refined.ms - first.ms <= 15, 'Initial tuning does not refine promptly: ' + JSON.stringify({ midi, hz, name, first, refined }));
        if (!report.worstOnset || firstCents > report.worstOnset.firstCents) report.worstOnset = { midi, hz, profile: name, firstMs: first.ms, firstCents, under5Ms: refined.ms, refinementMs: refined.ms - first.ms };
        report.cases++; report.worstMedianCents = Math.max(report.worstMedianCents, metrics.medianCents); report.worstP95Cents = Math.max(report.worstP95Cents, metrics.p95Cents);
      }
    }
    evidence.chromaticTracking = report;
  });
  await check('Picked harmonic-rich and missing-fundamental strings do not jump to the dominant overtone', () => {
    const report = {};
    for (const hz of [30.867706, 41.203445, 82.406889, 146.832384]) for (const [name, harmonics] of [['plucked', [.18, 1, .45, .25, .12]], ['missing fundamental', [0, .8, .55, .14]]]) {
      const result = track(T, pluck(hz, 1, 48000, { harmonics }), 48000, { range: hz < 60 ? 'bass' : 'guitar', sensitivity: -65, tracking: .5 });
      report[hz + ' ' + name] = goodPitch(result.observations, hz, 300, hz + ' ' + name, { median: 20, p95: 40 });
    }
    evidence.harmonicTracking = report;
  });
  await check('High guitar harmonics retain the missing fundamental instead of inheriting interpolation detune', () => {
    const report = {};
    for (const hz of [659.255114, 1318.510228]) {
      const result = track(T, pluck(hz, .7, 48000, { harmonics: [0, .8, .55], decay: 5 }), 48000, { range: 'guitar', sensitivity: -65 });
      report[hz] = goodPitch(result.observations, hz, 200, 'Treble missing fundamental ' + hz, { median: 5, p95: 12 });
    }
    evidence.highHarmonicTracking = report;
  });
  await check('Pitch changes settle on the new note and silence clears confidence instead of holding a false oscillator', () => {
    const rate = 48000, notes = [55, 82.406889, 146.832384], input = new Float32Array(rate * 2); notes.forEach((hz, index) => input.set(pluck(hz, .45, rate), Math.round(index * .45 * rate)));
    const { tracker, observations } = track(T, input, rate, { range: 'auto', sensitivity: -60 });
    for (let index = 0; index < notes.length; index++) { const start = index * 450 + 180, end = (index + 1) * 450; goodPitch(observations.filter(item => item.ms < end), notes[index], start, 'Legato note ' + index, { median: 20, p95: 40 }); }
    assert(!tracker.active && tracker.confidence < .3, 'Quiet input retains an active tracked note'); evidence.transitionTracking = observations.filter(item => item.ms >= 1250 && item.ms < 1450).slice(0, 8);
  });
  await check('Tracker sample-rate scaling and reset retain bass and guitar tuning', () => {
    const report = {};
    for (const rate of [8000, 44100, 48000, 96000, 192000]) {
      const input = pluck(82.406889, .6, rate, { harmonics: [1, .25, .1] }), first = track(T, input, rate, { range: 'guitar', sensitivity: -65 });
      report[rate] = goodPitch(first.observations, 82.406889, 200, '82 Hz at ' + rate, { median: 18, p95: 35 });
      const tracker = T.create(rate, { range: 'guitar', sensitivity: -65 }), readings = [];
      for (const sample of input) if (tracker.push(sample)) readings.push([tracker.frequency, tracker.confidence]); tracker.reset(); const replay = [];
      for (const sample of input) if (tracker.push(sample)) replay.push([tracker.frequency, tracker.confidence]); assert.deepEqual(readings, replay, 'Tracker reset is not deterministic at ' + rate);
    }
    evidence.sampleRates = report;
  });
  await check('Tracking synthesis and chord texture are causal and distinct, with no unplayed drone', () => {
    const frames = 48000, start = 4096, input = [new Float32Array(frames), new Float32Array(frames)]; for (let c = 0; c < 2; c++) input[c].set(pluck(110, (frames - start) / 48000, 48000), start);
    const outputs = {};
    for (const mode of ['track', 'chord']) { const fx = F.create(48000, { mode, mix: 1, direct: 0, release: 80 }); const output = feed(fx, input); assert(output.every(channel => channel.subarray(0, start).every(value => value === 0)), mode + ' sounds before the input'); finite(output); assert(rms(output[0], start + 12000) > .001, mode + ' is silent'); const tail = feed(fx, [new Float32Array(48000 * 4), new Float32Array(48000 * 4)]); assert(rms(tail[0], tail[0].length - 12000) < 1e-5, mode + ' leaves a drone after release'); outputs[mode] = output; }
    assert(difference(outputs.track[0], outputs.chord[0]).rms > .001); evidence.synthModes = Object.fromEntries(Object.entries(outputs).map(([mode, audio]) => [mode, hash(audio)]));
  });
  await check('Output register can produce bass or guitar octaves from the same detected string', () => {
    const rate = 48000, input = tone(110, rate), patch = { direct: 0, mix: 1, osc1Wave: 'sine', osc2Wave: 'sine', osc2Level: 0, subLevel: 0, drift: 0, envAmount: 0, keyTrack: 0, cutoff: 16000, resonance: 0, filterLfo: 0, vibrato: 0, pwm: 0, envMode: 'adsr', attack: 1, decay: 5, sustain: 1 };
    const controlled = release.scope.createLoomPedalSynthDSP(fixedTracker(110)), result = {};
    for (const [register, expected] of [['played', 110], ['bass', 55], ['guitar', 220]]) { const audio = feed(controlled.create(rate, { ...patch, register }), input); const amplitude = projection(audio[0], expected, rate); assert(amplitude > .005, register + ' lacks the requested oscillator octave'); for (const hz of [55, 110, 220]) if (hz !== expected) assert(amplitude > projection(audio[0], hz, rate) * 5, register + ' does not move the oscillator pitch'); result[register] = { expectedHz: expected, amplitude }; }
    evidence.outputRegisters = result;
  });
  await check('Oscillator shapes and sub/PWM controls produce distinct synthesized spectra', () => {
    const controlled = release.scope.createLoomPedalSynthDSP(fixedTracker(220)), input = tone(110, 24000), patch = { direct: 0, mix: 1, osc2Level: 0, subLevel: 0, drift: 0, envAmount: 0, keyTrack: 0, cutoff: 16000, resonance: 0, filterLfo: 0, vibrato: 0, pwm: 0, envMode: 'adsr', attack: 1, decay: 5, sustain: 1 }, shapes = ['saw', 'pulse', 'triangle', 'sine'], outputs = shapes.map(osc1 => feed(controlled.create(48000, { ...patch, osc1Wave: osc1 }), input)[0]);
    for (let a = 0; a < outputs.length; a++) for (let b = a + 1; b < outputs.length; b++) assert(difference(outputs[a], outputs[b]).rms > 1e-4, shapes[a] + ' equals ' + shapes[b]);
    const sineHarmonics = (projection(outputs[3], 440) + projection(outputs[3], 660)) / projection(outputs[3], 220), sawHarmonics = (projection(outputs[0], 440) + projection(outputs[0], 660)) / projection(outputs[0], 220); assert(sawHarmonics > sineHarmonics + .05);
    const sub = feed(controlled.create(48000, { ...patch, osc1Wave: 'sine', subLevel: .8 }), input)[0]; assert(projection(sub, 110) > projection(outputs[3], 110) + .01); const pulseA = feed(controlled.create(48000, { ...patch, osc1Wave: 'pulse', pulseWidth: .2 }), input)[0], pulseB = feed(controlled.create(48000, { ...patch, osc1Wave: 'pulse', pulseWidth: .8 }), input)[0]; assert(difference(pulseA, pulseB).rms > .01); evidence.oscillatorSpectra = { sineHarmonics, sawHarmonics };
  });
  await check('Production bandlimited oscillators suppress folded energy relative to naive waveforms', () => {
    assert.equal(typeof F.oscillatorSample, 'function', 'Export the actual production oscillator, not a separate test implementation');
    const rate = 48000, hz = 3137, frames = rate, report = {};
    const residual = data => { let mean = 0, power = 0; for (const value of data) { mean += value; power += value * value; } mean /= frames; power /= frames; let harmonics = 0; for (let n = 1; n * hz < rate / 2; n++) { const amplitude = projection(data, n * hz, rate, 0); harmonics += amplitude * amplitude * .5; } return Math.max(0, power - mean * mean - harmonics) / power; };
    for (const wave of ['saw', 'pulse', 'triangle']) {
      const naive = new Float32Array(frames), corrected = new Float32Array(frames); let phase = 0;
      for (let frame = 0; frame < frames; frame++) { naive[frame] = wave === 'saw' ? 2 * phase - 1 : wave === 'pulse' ? (phase < .31 ? 1 : -1) : phase < .5 ? -1 + 4 * phase : 3 - 4 * phase; corrected[frame] = F.oscillatorSample(phase, hz / rate, wave, .31); phase = (phase + hz / rate) % 1; }
      const before = residual(naive), after = residual(corrected); assert(after < before * .5, wave + ' does not reduce alias energy: ' + JSON.stringify({ before, after })); report[wave] = { naiveAliasRatio: before, correctedAliasRatio: after, reduction: before / Math.max(after, 1e-15) };
    }
    evidence.aliasEnergy = report;
  });
  await check('ADSR releases retain the accepted pitch without a dropout or reappearing oscillator', () => {
    const rate = 48000, frames = Math.round(rate * 1.4), body = Math.round(rate * .6), input = [new Float32Array(frames), new Float32Array(frames)]; for (let channel = 0; channel < 2; channel++) input[channel].set(tone(110, body)[channel]);
    const patch = { osc1Wave: 'sine', osc2Level: 0, subLevel: 0, direct: 0, drift: 0, pwm: 0, vibrato: 0, filterLfo: 0, envAmount: 0, keyTrack: 0, cutoff: 16000, resonance: 0, drive: 0, envMode: 'adsr', attack: 1, decay: 5, sustain: 1, release: 500, mix: 1, width: 0, glide: 0 }, report = {};
    for (const velocity of [0, 1]) {
      const audio = feed(F.create(rate, { ...patch, velocity }), input), windows = [];
      for (let at = .62; at < .9; at += .02) windows.push(rms(audio[0], Math.round(at * rate), Math.round((at + .02) * rate)));
      for (let index = 1; index < windows.length; index++) assert(windows[index] <= windows[index - 1] * 1.3 + 1e-5, 'Release disappears and comes back: ' + JSON.stringify({ velocity, windows }));
      const fundamental = projection(audio[0], 110, rate, Math.round(rate * .76), Math.round(rate * .9)); assert(fundamental > .001, 'A long release has lost its accepted oscillator pitch'); report[velocity] = { windows, fundamental };
    }
    evidence.releaseContinuity = report;
  });
  await check('Follower dynamics and triggered ADSR produce independently useful amplitude responses', () => {
    const rate = 48000, controlled = release.scope.createLoomPedalSynthDSP(fixedTracker(110)), patch = { osc1Wave: 'sine', osc2Level: 0, subLevel: 0, direct: 0, drift: 0, pwm: 0, vibrato: 0, filterLfo: 0, envAmount: 0, keyTrack: 0, cutoff: 16000, resonance: 0, drive: 0, attack: 1, decay: 5, sustain: 1, release: 80, velocity: 0, mix: 1, width: 0 }, report = {};
    for (const envMode of ['follower', 'adsr']) { report[envMode] = []; for (const amplitude of [.025, .15]) { const audio = feed(controlled.create(rate, { ...patch, envMode }), tone(110, rate / 2, rate, amplitude)); report[envMode].push(rms(audio[0], rate / 4)); } }
    assert(report.follower[1] > report.follower[0] * 1.5, 'Follower envelope ignores input dynamics'); const ratio = report.adsr[1] / report.adsr[0]; assert(ratio > .95 && ratio < 1.05, 'Velocity-off ADSR should hold the same oscillator level above its gate'); evidence.envelopeResponse = report;
  });
  await check('An unvoiced signal cannot keep an old tracked note or restart it when the input gate closes', () => {
    const rate = 48000;
    function dropoutTrackerFactory() { return { create() { let count = 0; return { frequency: 110, confidence: 1, active: true, level: .1, trackingLatencyMs: 0, push() { count++; this.active = count < 24000; this.confidence = this.active ? 1 : 0; this.frequency = this.active ? 110 : 0; return true; }, setParams() {}, reset() { count = 0; this.frequency = 110; this.confidence = 1; this.active = true; } }; } }; }
    const controlled = release.scope.createLoomPedalSynthDSP(dropoutTrackerFactory), frames = rate * 2, input = [new Float32Array(frames), new Float32Array(frames)]; for (let channel = 0; channel < 2; channel++) input[channel].set(tone(110, rate)[channel]);
    const audio = feed(controlled.create(rate, { osc1Wave: 'sine', osc2Level: 0, subLevel: 0, direct: 0, drift: 0, pwm: 0, envAmount: 0, keyTrack: 0, cutoff: 16000, resonance: 0, envMode: 'adsr', attack: 1, decay: 5, sustain: 1, release: 500, velocity: 0, mix: 1, width: 0, glide: 0 }), input);
    assert(rms(audio[0], rate / 4, rate / 2) > .01, 'The fixture never acquired its original note'); assert(rms(audio[0], Math.round(rate * .85), Math.round(rate * 1.5)) < 1e-5, 'Retired pitch survives unvoiced input or reappears at gate close');
  });
  await check('Analog filter circuits and low/band/high-pass responses shape the actual input-derived synthesis', () => {
    const rate = 48000, input = signal(24000, rate, .08), patch = { mode: 'chord', direct: 0, mix: 1, cutoff: 1000, envAmount: 0, keyTrack: 0, resonance: .6, filterLfo: 0, vibrato: 0, pwm: 0 }, outputs = {};
    for (const filter of ['ladder', 'ota', 'svf']) { outputs[filter] = feed(F.create(rate, { ...patch, filterModel: filter }), input); finite(outputs[filter]); }
    for (const [a, b] of [['ladder', 'ota'], ['ota', 'svf']]) assert(difference(outputs[a][0], outputs[b][0]).rms > 1e-5, a + ' and ' + b + ' collapse to one filter');
    const response = {};
    for (const filterMode of ['lowpass', 'bandpass', 'highpass']) { const byTone = {}; for (const hz of [120, 1000, 6500]) byTone[hz] = rms(feed(F.create(rate, { ...patch, resonance: .1, filterModel: 'svf', filterMode }), tone(hz, 24000))[0], 12000); response[filterMode] = byTone; }
    assert(response.lowpass[120] > response.lowpass[6500] * 3, 'Low-pass does not reject treble'); assert(response.highpass[6500] > response.highpass[120] * 3, 'High-pass does not reject bass'); assert(response.bandpass[1000] > response.bandpass[120] * 2, 'Band-pass lacks its middle'); evidence.filterResponse = response;
  });
  await check('Seeded oscillators, envelopes and partial parameter edits are independent of caller block sizes', () => {
    const input = tone(110, 48000), events = [{ at: 193, patch: { cutoff: 700, resonance: .75 } }, { at: 4097, patch: { osc1Wave: 'pulse', pulseWidth: .27, drift: .5 } }, { at: 8193, patch: { filterModel: 'ota', filterMode: 'bandpass', envAmount: -24 } }, { at: 12007, patch: { mode: 'chord', drive: 12 } }, { at: 16031, patch: { mode: 'track', register: 'bass', glide: 80 } }, { at: 24001, patch: { bypass: true } }, { at: 25003, patch: { bypass: false } }, { at: 29011, patch: { mix: 0 } }, { at: 30013, patch: { mix: .7 } }, { at: 36017, reset: true }];
    const a = feed(F.create(48000, {}), input, 128, events), b = feed(F.create(48000, {}), input, [1, 17, 137, 251], events); assert.deepEqual(a, b); evidence.seededPcm = hash(a); const fx = F.create(48000, { mode: 'chord', drift: .6 }); const first = feed(fx, input); fx.reset(); assert.deepEqual(feed(fx, input), first);
  });
  await check('Cold bypass/zero Blend are exact stereo dry and live transitions settle without a lingering synth', () => {
    const input = signal(12000); input[0][0] = -0; for (const patch of [{ bypass: true }, { mix: 0 }]) { const fx = F.create(48000, { drive: 24, resonance: 1, ...patch }); assert.deepEqual(feed(fx, input), input); assert.equal(fx.getTailTime(), 0); }
    for (const patch of [{ bypass: true }, { mix: 0 }]) { const fx = F.create(48000, { mode: 'chord', resonance: .8 }); feed(fx, input); fx.setParams(patch); const audio = feed(fx, input, [17, 137, 256]); for (let c = 0; c < 2; c++) assert.deepEqual(audio[c].subarray(512), input[c].subarray(512)); assert.equal(fx.getTailTime(), 0); }
  });
  await check('Quiet/released effects suspend tracking and synthesis and wake deterministically', () => {
    const rate = 48000, body = tone(110, 4096), pause = rate * 4, frames = 8192 + pause, input = [new Float32Array(frames), new Float32Array(frames)]; for (let c = 0; c < 2; c++) { input[c].set(body[c]); input[c].set(body[c], 4096 + pause); }
    const patch = { release: 60, mode: 'track' }, a = feed(F.create(rate, patch), input, 128), b = feed(F.create(rate, patch), input, [1, 17, 137, 251]); assert.deepEqual(a, b); assert(a.every(channel => channel.subarray(4096 + pause - 12000, 4096 + pause).every(value => value === 0))); assert(rms(a[0], 4096 + pause) > 1e-5);
    const counters = {}, math = Object.create(Math); for (const key of ['sin', 'cos', 'tan', 'tanh', 'exp', 'pow', 'sqrt', 'log', 'log2', 'log10']) math[key] = (...args) => { counters[key] = (counters[key] || 0) + 1; return Math[key](...args); };
    const trackerFactory = Function('Math', 'return (' + release.scope.createLoomPedalTrackerDSP.toString() + ');')(math), factory = Function('Math', 'return (' + release.scope.createLoomPedalSynthDSP.toString() + ');')(math)(trackerFactory), fx = factory.create(rate, patch); feed(fx, body); feed(fx, [new Float32Array(pause), new Float32Array(pause)]); for (const key of Object.keys(counters)) delete counters[key]; feed(fx, [new Float32Array(4096), new Float32Array(4096)]); assert.deepEqual(counters, {}, 'Idle synthesis still performs signal math');
  });
  await check('Every filter and oscillator remains bounded for hot audio, DC and extreme settings at all supported sample rates', () => {
    const report = {};
    for (const rate of [8000, 44100, 48000, 96000, 192000]) { let peak = 0; for (const filter of ['ladder', 'ota', 'svf']) for (const mode of ['track', 'chord']) { const fx = F.create(rate, { mode, filterModel: filter, drive: 24, resonance: 1, cutoff: 16000, envAmount: 72, sensitivity: 24, synthLevel: 1, output: 24, release: 10 }); const input = signal(4096, rate, 3); for (const channel of input) { channel[37] = Infinity; channel[71] = NaN; channel[113] = -Infinity; channel[193] = 1e30; } const audio = feed(fx, input, [1, 137, 251], [], rate); finite(audio); for (const channel of audio) for (const value of channel) peak = Math.max(peak, Math.abs(value)); fx.reset(); feed(fx, [new Float32Array(2048).fill(.4), new Float32Array(2048).fill(.4)], 128, [], rate); const tail = feed(fx, [new Float32Array(Math.ceil(rate * .5)), new Float32Array(Math.ceil(rate * .5))], 128, [], rate); finite(tail); assert(rms(tail[0], tail[0].length - Math.min(2048, tail[0].length)) < 1e-3, filter + ' DC tail at ' + rate); } report[rate] = peak; }
    evidence.safetyPeaks = report;
  });
  await check('The released seventeen effects retain identical PCM and meter histories', () => {
    let before; try { before = load(BASELINE); } catch (error) { if (!fs.existsSync(path.join(root, '.git'))) { console.log('SKIP published-source comparison outside a Git checkout'); return; } throw error; }
    const types = Object.keys(before.E.specifications), input = signal(4096), events = [{ at: 193, patch: { mix: .37 } }, { at: 503, patch: { bypass: true } }, { at: 907, patch: { bypass: false } }, { at: 1501, patch: { mix: 0 } }, { at: 1999, patch: { mix: 1 } }, { at: 2503, reset: true }]; assert.equal(types.length, 17);
    for (const type of types) { const a = E.create(type, 48000, {}), b = before.E.create(type, 48000, {}); assert.deepEqual(feed(a, input, [17, 128, 193], events), feed(b, input, [17, 128, 193], events), type + ' audio changed'); assert.deepEqual(plain(a.getMeters()), plain(b.getMeters()), type + ' meters changed'); } evidence.unchangedEffects = types;
  });
  if (process.argv.includes('--bench')) await check('Exclusive informational native DSP cost for one and eight tracking synth pedals', () => {
    const measure = count => { const frequencies = count === 1 ? [82.406889] : Array.from({ length: count }, (_, index) => [30.867706, 82.406889, 220, 1318.510228][index % 4]), effects = frequencies.map((hz, index) => F.create(48000, { inputRange: hz < 80 ? 'bass' : 'guitar', filterModel: ['ladder', 'ota', 'svf'][index % 3] })), sources = frequencies.map(hz => pluck(hz, .25, 48000, { decay: 10 })), left = new Float32Array(128), right = left.slice(); let frame = 0; const block = () => { for (let index = 0; index < effects.length; index++) { const body = sources[index]; for (let sample = 0; sample < 128; sample++) left[sample] = right[sample] = body[(frame + sample) % body.length]; effects[index].process(left, right, { tempo: 120, beat: frame / 24000, playing: true }); } frame += 128; }; for (let index = 0; index < 500; index++) block(); const trials = []; for (let trial = 0; trial < 3; trial++) { const began = performance.now(); for (let index = 0; index < 300; index++) block(); trials.push((performance.now() - began) / 300); } return { instances: count, frequenciesHz: frequencies, millisecondsPer128Frames: quantile(trials), trials }; };
    evidence.cpu = { sampleRate: 48000, quantumBudgetMs: 128 / 48000 * 1000, single: measure(1), eight: measure(8) }; console.log('TIMING ' + JSON.stringify(evidence.cpu));
  });
  console.log(passed.length + ' FERMENT DSP/tracking groups passed.'); console.log(JSON.stringify(evidence)); return { passed, evidence };
}
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
