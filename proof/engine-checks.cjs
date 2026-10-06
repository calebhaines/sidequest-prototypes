'use strict';
// Run: node proof/engine-checks.cjs. Exercises the actual schema, arpeggiator and DSP.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const coreOnly = process.argv.includes('--core');
const scope = { console, Blob, URL, AbortController, DOMException, TextEncoder, TextDecoder,
  setTimeout, clearTimeout, performance, Float32Array, Float64Array, Uint8Array, Int16Array, ArrayBuffer,
  requestAnimationFrame: callback => setTimeout(() => callback(performance.now()), 0),
  location: { protocol: 'file:' }, navigator: {}, addEventListener() {}, removeEventListener() {} };
scope.window = scope; scope.self = scope;
const sharedSchema = fs.existsSync(path.join(__dirname, 'shared', 'pattern-schema.js')) ? 'shared/pattern-schema.js' : '../shared/pattern-schema.js';
for (const file of [sharedSchema, 'schema.js', 'arp.js', 'presets.js', 'audio-engine.js']) {
  if (coreOnly && file === 'presets.js') continue;
  // Arp creator is an explicit lexical dependency, as it is in the AudioWorklet source.
  new Function('window', 'self', 'createProofArp', fs.readFileSync(path.join(__dirname, file), 'utf8'))(scope, scope, scope.createProofArp);
}
const S = scope.ProofSchema;
const arp = scope.createProofArp();
const DSP = scope.ProofDSP || scope.createProofDSP();
const sr = 48000;
const plain = value => JSON.parse(JSON.stringify(value));
const copy = value => S.copy(value);
const results = [], failures = [];
async function check(name, run) {
  if (coreOnly && /authored presets|24 preset/.test(name)) return;
  const began = performance.now();
  try { const evidence = await run(); results.push({ name, milliseconds: Math.round(performance.now() - began), evidence }); console.log('PASS ' + name + (evidence ? ' ' + JSON.stringify(evidence) : '')); }
  catch (error) { failures.push({ name, message: error.stack || String(error) }); console.error('FAIL ' + name + '\n' + (error.stack || error)); }
}
function factory(state) { return new DSP.Core(sr, S.normalize(state)); }
function dryState() {
  const state = S.defaultState();
  Object.assign(state.fx, { chorus: 0, delay: 0, feedback: 0, space: 0, width: 1, volume: .7 });
  Object.assign(state.synth, { model: 'dco', wave: 'saw', mix: 0, sub: 0, detune: 0, drive: 0, glide: 0, velocity: 0 });
  Object.assign(state.synth.filter, { cutoff: 18000, resonance: 0, envAmount: 0, keytrack: 0 });
  Object.assign(state.synth.amp, { attack: .001, decay: .001, sustain: 1, release: .08 });
  state.synth.lfo.depth = 0;
  return state;
}
function render(core, seconds, chunk = 128) {
  const count = Math.round(seconds * sr), left = new Float32Array(count), right = new Float32Array(count);
  for (let at = 0; at < count; at += chunk) core.processBlock(left.subarray(at, Math.min(count, at + chunk)), right.subarray(at, Math.min(count, at + chunk)));
  return { left, right, meters: plain(core.getMeters()) };
}
function notePCM(state, { note = 69, velocity = .85, duration = .6, seconds = 1.2, chunk = 128 } = {}) {
  const core = factory(state); core.scheduleNote({ note, velocity, duration, frame: 0, source: 'test' });
  return render(core, seconds, chunk);
}
function stats(pcm, from = 0, to = pcm.left.length) {
  let energy = 0, peak = 0, sum = 0, nonfinite = 0;
  for (let i = from; i < to; i++) for (const channel of [pcm.left, pcm.right]) {
    const sample = channel[i]; if (!Number.isFinite(sample)) nonfinite++;
    energy += sample * sample; sum += sample; peak = Math.max(peak, Math.abs(sample));
  }
  const n = Math.max(1, (to - from) * 2);
  return { rms: Math.sqrt(energy / n), peak, mean: sum / n, nonfinite };
}
function difference(a, b, from = 0, to = a.left.length) {
  let squared = 0, maximum = 0;
  assert.equal(a.left.length, b.left.length);
  for (let i = from; i < to; i++) for (const key of ['left', 'right']) {
    const delta = a[key][i] - b[key][i]; squared += delta * delta; maximum = Math.max(maximum, Math.abs(delta));
  }
  return { rms: Math.sqrt(squared / Math.max(1, (to - from) * 2)), maximum };
}
function spectrum(samples, offset = 4096, size = 32768) {
  const real = new Float64Array(size), imaginary = new Float64Array(size);
  for (let i = 0; i < size; i++) real[i] = (samples[offset + i] || 0) * (.5 - .5 * Math.cos(2 * Math.PI * i / (size - 1)));
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { const value = real[i]; real[i] = real[j]; real[j] = value; }
  }
  for (let len = 2; len <= size; len <<= 1) {
    const angle = -2 * Math.PI / len, wr = Math.cos(angle), wi = Math.sin(angle);
    for (let base = 0; base < size; base += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = base + j, b = a + len / 2;
        const tr = real[b] * cr - imaginary[b] * ci, ti = real[b] * ci + imaginary[b] * cr;
        real[b] = real[a] - tr; imaginary[b] = imaginary[a] - ti; real[a] += tr; imaginary[a] += ti;
        const next = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = next;
      }
    }
  }
  return Array.from({ length: size / 2 }, (_, i) => Math.hypot(real[i], imaginary[i]));
}
function peakHz(magnitudes, wanted, range = 20) {
  const size = magnitudes.length * 2, low = Math.max(2, Math.floor((wanted - range) * size / sr)), high = Math.ceil((wanted + range) * size / sr);
  let bin = low; for (let i = low + 1; i <= high; i++) if (magnitudes[i] > magnitudes[bin]) bin = i;
  const a = Math.log(magnitudes[bin - 1] + 1e-15), b = Math.log(magnitudes[bin] + 1e-15), c = Math.log(magnitudes[bin + 1] + 1e-15);
  const delta = .5 * (a - c) / (a - 2 * b + c);
  return (bin + (Number.isFinite(delta) ? delta : 0)) * sr / size;
}
function basicArp() {
  const state = S.defaultState(); state.source = 'held'; state.heldNotes = [60, 64, 67]; state.swing = 0;
  Object.assign(state.arp, { direction: 'up', division: '1/16', octaves: 1, gate: .75, transpose: 0, repeat: 1, rotate: 0, spice: 0, fold: 'none' });
  state.selectedPattern = 0; state.patterns[0].length = 16;
  state.patterns[0].steps = Array.from({ length: 16 }, () => S.step());
  return state;
}
function events(state, beats = 4) { return plain(arp.events(state, { startBeat: 0, lengthBeats: beats })); }
function validPacket() {
  return { format: 'musiclab-pattern', version: 1, name: 'Exact borrowed chord', sourceApp: 'stock', kind: 'notes', tempo: 120,
    swing: 0, lengthBeats: 4, meter: [4, 4], seed: 19, voices: [{ id: 'felt', name: 'Felt' }], notes: [
      { id: 'n1', voice: 'felt', pitch: 60, beat: 0, duration: .73, velocity: .61, probability: 1 },
      { id: 'n2', voice: 'felt', pitch: 64, beat: .37, duration: 1.11, velocity: .88, probability: 1 } ], tags: [] };
}
function projectState(project) { return project.state || project; }

(async () => {
  await check('Project JSON restores all controls and rejects malformed, oversized and nonfinite input', () => {
    const state = S.defaultState(); state.synth.model = 'fm'; state.synth.fmRatio = 3; state.patterns[2].steps[5].tie = true;
    const serialized = S.serialize(state); assert.equal(typeof serialized, 'string');
    const restored = S.parseProject(serialized); assert.equal(S.serialize(restored), serialized);
    assert.throws(() => S.parseProject('{broken'));
    assert.throws(() => S.parseProject(' '.repeat(1024 * 1024 + 1)));
    for (const edit of [s => s.tempo = NaN, s => s.swing = Infinity, s => s.synth.filter.cutoff = NaN,
      s => s.synth.amp.release = Infinity, s => s.patterns[0].steps[0].probability = NaN,
      s => s.chords[0].degree = NaN, s => s.synth.model = 'fake-model']) {
      const project = JSON.parse(serialized); edit(projectState(project)); assert.throws(() => S.parseProject(project));
    }
    const raw = copy(state); raw.unrecognized = 'discard'; raw.synth.unrecognized = 123;
    const normalized = S.normalize(raw); assert.equal(normalized.unrecognized, undefined); assert.equal(normalized.synth.unrecognized, undefined);
    raw.patterns[0].steps[0].velocity = .01; assert.notEqual(normalized.patterns[0].steps[0].velocity, .01);
  });
  await check('Exact shared notes and typed voice maps survive projects and reject corrupt imports', () => {
    const state = S.defaultState(); state.musicLabPattern = { pattern: validPacket(), voiceMap: { felt: 'synth' } };
    const restored = S.parseProject(S.serialize(state)); assert.deepEqual(plain(restored.musicLabPattern.pattern), validPacket());
    assert.deepEqual(plain(restored.musicLabPattern.voiceMap), { felt: 'synth' });
    for (const edit of [s => s.musicLabPattern.pattern.notes[0].pitch = 128, s => s.musicLabPattern.pattern.notes[0].duration = 0,
      s => s.musicLabPattern.pattern.notes[0].beat = -1, s => s.musicLabPattern.pattern.notes[0].voice = 'missing',
      s => s.musicLabPattern.voiceMap.felt = 'unknown', s => s.musicLabPattern.voiceMap.felt = 4, s => s.musicLabPattern.pattern.notes[1].id = 'n1']) {
      const project = JSON.parse(S.serialize(state)); edit(projectState(project)); assert.throws(() => S.parseProject(project));
    }
  });
  await check('All authored presets and every declared oscillator model are available', () => {
    assert.equal(scope.ProofPresets.length, 24);
    assert.deepEqual(plain(S.MODELS), ['dco', 'vco', 'sync', 'fm', 'vector']);
    const named = new Set();
    for (const preset of scope.ProofPresets) {
      assert(preset.name && !named.has(preset.name), 'unique preset names'); named.add(preset.name);
      const state = S.normalize(preset.state || preset); assert.equal(S.serialize(S.parseProject(S.serialize(state))), S.serialize(state));
    }
  });
  await check('Held source realizes musical orders, octave repetition and transposition', () => {
    const expected = { up: [60, 64, 67, 60, 64, 67], down: [67, 64, 60, 67, 64, 60], updown: [60, 64, 67, 64, 60, 64], downup: [67, 64, 60, 64, 67, 64] };
    for (const [direction, notes] of Object.entries(expected)) {
      const state = basicArp(); state.arp.direction = direction; assert.deepEqual(events(state).slice(0, 6).map(e => e.note), notes, direction);
    }
    const state = basicArp(); state.arp.octaves = 2; state.arp.transpose = 2;
    assert.deepEqual(events(state).slice(0, 6).map(e => e.note), [62, 66, 69, 74, 78, 81]);
    state.arp.octaves = 1; state.arp.transpose = 0; state.arp.repeat = 2;
    assert.deepEqual(events(state).slice(0, 6).map(e => e.note), [60, 60, 64, 64, 67, 67]);
    state.arp.direction = 'chord'; const first = events(state).filter(e => e.startBeat === 0); assert.deepEqual(first.map(e => e.note), [60, 64, 67]);
  });
  await check('All ten orders, seeded spice and folds are deterministic and range safe', () => {
    for (const direction of S.DIRECTIONS) for (const fold of S.FOLDS) {
      const state = basicArp(); Object.assign(state.arp, { direction, fold, foldEvery: 1, spice: .4, octaves: 4 });
      const a = events(state, 16); assert.deepEqual(events(state, 16), a); assert(a.length > 0);
      for (const e of a) { assert(Number.isInteger(e.note) && e.note >= 0 && e.note <= 127); assert(Number.isFinite(e.startBeat)); assert(e.durationBeats > 0 && Number.isFinite(e.durationBeats)); }
    }
    const state = basicArp(); state.arp.direction = 'random'; const a = events(state, 16); state.seed++;
    assert.notDeepEqual(events(state, 16), a, 'seed must change random order');
  });
  await check('Enabled chord bars drive progression; single selection and harmonic loops preserve pitches', () => {
    const state = basicArp(); state.source = 'progression'; state.root = 60; state.scale = 'major';
    state.chords.forEach(c => c.enabled = false); Object.assign(state.chords[0], { enabled: true, degree: 0, quality: 'major', bars: 1 });
    Object.assign(state.chords[2], { enabled: true, degree: 4, quality: 'major', bars: 2 });
    assert.equal(arp.progressionLength(state), 12);
    const a = events(state, 16); assert(a.filter(e => e.startBeat < 4).every(e => e.chord === 0));
    assert(a.filter(e => e.startBeat >= 4 && e.startBeat < 12).every(e => e.chord === 2));
    assert(a.filter(e => e.startBeat >= 12).every(e => e.chord === 0));
    state.source = 'single'; state.selectedChord = 2; assert(events(state).every(e => e.chord === 2));
    for (const scale of Object.keys(S.SCALES)) for (const quality of Object.keys(S.QUALITIES)) {
      state.scale = scale; state.chords[2].quality = quality; const notes = plain(S.chordNotes(state, state.chords[2]));
      assert(notes.length > 0 && notes.every(n => Number.isInteger(n) && n >= 0 && n <= 127));
    }
  });
  await check('Per step chance, ratchets, ties, swing and microtiming change realized events', () => {
    const state = basicArp(); state.patterns[0].steps.forEach(step => step.probability = 0); assert.equal(events(state).length, 0);
    state.patterns[0].steps.forEach(step => step.probability = 1); assert.equal(events(state).length, 16);
    state.patterns[0].steps.forEach(step => step.ratchet = 4); const ratchets = events(state); assert.equal(ratchets.length, 64);
    assert(ratchets[1].startBeat > ratchets[0].startBeat && ratchets[1].startBeat < .25);
    state.patterns[0].steps = Array.from({ length: 16 }, () => S.step()); state.patterns[0].steps[1].tie = true;
    const tied = events(state); assert.equal(tied.filter(e => Math.abs(e.startBeat - .25) < 1e-8).length, 0);
    assert(tied[0].durationBeats >= .25, 'tie extends previous note');
    state.patterns[0].steps[1].tie = false; state.swing = .3; assert(events(state)[1].startBeat > .25);
    state.swing = 0; state.patterns[0].steps[2].offset = -.25; assert(events(state)[2].startBeat < .5);
    state.patterns[0].steps[2].octave = 1; assert.equal(events(state)[2].note, 79);
  });
  await check('Live ticks and complete phrases make identical deterministic probability decisions', () => {
    const state = basicArp(); state.arp.direction = 'walk'; state.arp.spice = .3; state.swing = .2;
    state.patterns[0].steps.forEach((step, i) => { step.probability = .45; step.ratchet = i % 3 + 1; });
    const complete = events(state, 4);
    const ticks = Array.from({ length: 16 }, (_, tick) => plain(arp.tickEvents(state, tick))).flat();
    const sort = list => list.sort((a, b) => a.startBeat - b.startBeat || a.note - b.note);
    assert.deepEqual(sort(ticks), sort(complete));
  });
  await check('Each oscillator produces finite audible stereo PCM with a distinct spectrum', () => {
    const rendered = {}, evidence = {};
    for (const model of S.MODELS) {
      const state = dryState(); state.synth.model = model; state.synth.mix = .45; state.synth.detune = .15;
      rendered[model] = notePCM(state, { duration: 1, seconds: 1.2 }); const info = stats(rendered[model]);
      assert.equal(info.nonfinite, 0, model); assert(info.rms > .0005, model + ' audible'); assert(info.peak <= 1.00001, model + ' headroom');
      assert(Math.abs(info.mean) < .04, model + ' DC'); evidence[model] = info;
    }
    for (let i = 0; i < S.MODELS.length; i++) for (let j = i + 1; j < S.MODELS.length; j++) {
      const a = S.MODELS[i], b = S.MODELS[j]; assert(difference(rendered[a], rendered[b]).rms > .001, a + ' / ' + b + ' distinct PCM');
      const x = spectrum(rendered[a].left), y = spectrum(rendered[b].left);
      let dot = 0, xx = 0, yy = 0; for (let k = 1; k < x.length; k++) { dot += x[k] * y[k]; xx += x[k] ** 2; yy += y[k] ** 2; }
      const similarity = dot / Math.sqrt(xx * yy); assert(similarity < .99995, a + ' / ' + b + ' distinct spectra: ' + similarity);
    }
    return evidence;
  });
  await check('Actual PCM fundamental follows MIDI pitch and octave within one hertz', () => {
    const measurements = {};
    for (const note of [57, 69, 81]) {
      const state = dryState(); const pcm = notePCM(state, { note, duration: 1, seconds: 1 });
      const wanted = 440 * 2 ** ((note - 69) / 12), measured = peakHz(spectrum(pcm.left), wanted);
      assert(Math.abs(measured - wanted) < 1, note + ' expected ' + wanted + ', got ' + measured); measurements[note] = measured;
    }
    return measurements;
  });
  await check('Model-specific parameters, filter envelopes, LFO modes and all six vector tables change actual audio', () => {
    const experiments = [
      ['DCO pulse width', 'dco', s => { s.synth.wave = 'pulse'; s.synth.pulseWidth = .15; }, s => s.synth.pulseWidth = .75],
      ['DCO detune', 'dco', s => { s.synth.mix = .5; s.synth.detune = 0; }, s => s.synth.detune = .8],
      ['VCO cross modulation', 'vco', s => { s.synth.mix = .5; s.synth.crossmod = 0; }, s => s.synth.crossmod = .8],
      ['Hard sync ratio', 'sync', s => s.synth.sync = 2, s => s.synth.sync = 6],
      ['FM ratio', 'fm', s => s.synth.fmRatio = 1, s => s.synth.fmRatio = 3],
      ['FM upper index range', 'fm', s => { s.synth.fmRatio = 1; s.synth.fmIndex = 12; }, s => s.synth.fmIndex = 20],
      ['FM feedback', 'fm', s => { s.synth.fmAlgorithm = 'feedback'; s.synth.fmFeedback = 0; }, s => s.synth.fmFeedback = .9],
      ['FM algorithm', 'fm', s => s.synth.fmAlgorithm = 'cascade', s => s.synth.fmAlgorithm = 'parallel'],
      ['Vector morph', 'vector', s => s.synth.vector = 0, s => s.synth.vector = .85],
      ['Filter type', 'dco', s => { s.synth.filter.cutoff = 900; s.synth.filter.type = 'lp24'; }, s => s.synth.filter.type = 'hp'],
      ['Filter envelope', 'dco', s => { s.synth.filter.cutoff = 400; s.synth.filter.envAmount = 0; }, s => s.synth.filter.envAmount = 4],
      ['Sample hold LFO', 'dco', s => { s.synth.lfo.depth = 1; s.synth.lfo.rate = 7; s.synth.lfo.target = 'pitch'; s.synth.lfo.shape = 'sine'; }, s => s.synth.lfo.shape = 'sampleHold'],
      ['Triplet synchronized LFO', 'dco', s => { s.synth.lfo.depth = 1; s.synth.lfo.target = 'pan'; s.synth.lfo.sync = '1/4'; }, s => s.synth.lfo.sync = '1/4T'],
      ['Stereo chorus', 'dco', s => s.fx.chorus = 0, s => s.fx.chorus = .8],
      ['Tempo delay', 'dco', s => s.fx.delay = 0, s => s.fx.delay = .8],
      ['Damped room', 'dco', s => s.fx.space = 0, s => s.fx.space = .8]
    ], evidence = {};
    for (const [name, model, prepare, edit] of experiments) {
      const a = dryState(); a.synth.model = model; prepare(a); const b = copy(a); edit(b);
      const delta = difference(notePCM(a, { note: 48, duration: .5, seconds: .8 }), notePCM(b, { note: 48, duration: .5, seconds: .8 })).rms;
      assert(delta > .00002, name + ' must affect audible samples'); evidence[name] = +delta.toFixed(6);
    }
    const tables = S.TABLES.map(table => { const state = dryState(); state.synth.model = 'vector'; state.synth.table = table; state.synth.vector = 0; return notePCM(state, { duration: .5, seconds: .65 }); });
    for (let i = 0; i < tables.length; i++) for (let j = i + 1; j < tables.length; j++) assert(difference(tables[i], tables[j]).rms > .0005, S.TABLES[i] + ' / ' + S.TABLES[j]);
    return evidence;
  });
  await check('ADSR attack changes PCM and scheduled releases leave no stuck voices', () => {
    const fast = dryState(), slow = copy(fast); slow.synth.amp.attack = .3;
    const a = notePCM(fast, { duration: .6, seconds: 1.5 }), b = notePCM(slow, { duration: .6, seconds: 1.5 });
    assert(stats(b, 0, 2400).rms < stats(a, 0, 2400).rms * .6, 'attack must affect rendered envelope');
    for (const pcm of [a, b]) { assert(stats(pcm, sr, Math.round(1.5 * sr)).rms < .0001); assert.equal(pcm.meters.voices, 0); }
    const sustain = dryState(); sustain.synth.amp.sustain = .1; sustain.synth.amp.decay = .1;
    const c = notePCM(sustain, { duration: .6, seconds: .7 }); assert(stats(c, 12000, 24000).rms < stats(a, 12000, 24000).rms * .3);
  });
  await check('Native transport PCM is invariant under worklet, fallback and irregular chunk lengths', () => {
    const state = S.defaultState(), outputs = [];
    for (const size of [128, 1024, 257]) { const core = factory(state); core.start({ beat: 0, frame: 0 }); outputs.push(render(core, 1.8, size)); }
    assert.equal(difference(outputs[0], outputs[1]).maximum, 0); assert.equal(difference(outputs[0], outputs[2]).maximum, 0);
    assert(stats(outputs[0]).rms > .001); return { frames: outputs[0].left.length, peak: stats(outputs[0]).peak };
  });
  await check('Future tempo changes and seeks retain sample-identical PCM across arbitrary blocks', () => {
    const state = S.defaultState(); state.synth.lfo.sync = '1/8T'; state.synth.lfo.depth = .7; state.fx.delay = .55;
    const outputs = [];
    for (const size of [128, 1024, 257]) {
      const core = factory(state); core.start({ beat: 0, frame: 0 });
      core.setTransport({ beat: 1.5, tempo: 173, playing: true, revision: 1, frame: 15013 });
      core.setTransport({ beat: 5.1, tempo: 67, playing: true, revision: 2, frame: 42017 });
      outputs.push(render(core, 1.4, size));
    }
    assert.equal(difference(outputs[0], outputs[1]).maximum, 0); assert.equal(difference(outputs[0], outputs[2]).maximum, 0);
  });
  await check('Future source cancellation occurs at its timestamp and preserves unrelated notes', () => {
    const state = dryState(); const cancelled = factory(state), reference = factory(state), otherOnly = factory(state);
    for (const core of [cancelled, reference]) {
      core.scheduleNote({ note: 57, velocity: .8, frame: 0, duration: 2.5, source: 'first' });
      core.scheduleNote({ note: 60, velocity: .8, frame: Math.round(.6 * sr), duration: .5, source: 'first' });
      core.scheduleNote({ note: 64, velocity: .8, frame: Math.round(1.3 * sr), duration: .5, source: 'first' });
    }
    for (const core of [cancelled, reference, otherOnly]) core.scheduleNote({ note: 81, velocity: .7, frame: 0, duration: 2.5, source: 'unrelated' });
    cancelled.stopNotes({ source: 'first', frame: sr });
    const a = render(cancelled, 2), b = render(reference, 2), c = render(otherOnly, 2);
    assert.equal(difference(a, b, 0, sr).maximum, 0, 'future stop may not alter earlier audio');
    assert(difference(a, c, Math.round(1.5 * sr), 2 * sr).rms < .00005, 'cancelled future notes removed; unrelated source retained');
    assert(stats(a, Math.round(1.5 * sr), 2 * sr).rms > .001, 'unrelated source still audible');
    assert(difference(a, b, Math.round(1.5 * sr), 2 * sr).rms > .001);
  });
  await check('Panic clears current voices, queued notes and effect tails; note work remains bounded', () => {
    const core = factory(S.defaultState());
    for (let i = 0; i < 4000; i++) core.scheduleNote({ note: i % 88 + 20, velocity: .8, frame: i < 40 ? 0 : sr, duration: 4, source: 'flood' });
    render(core, .1); assert(core.getMeters().voices <= 32); core.panic();
    const pcm = render(core, 1.5); assert(stats(pcm).rms < .0001); assert.equal(pcm.meters.voices, 0);
  });
  await check('Extreme synthesis and effect controls stay finite and bounded for every model', () => {
    const evidence = {};
    for (const model of S.MODELS) for (const side of [0, 1]) {
      const state = S.defaultState(); state.synth.model = model;
      Object.assign(state.synth, { detune: side, crossmod: side, sync: side ? 16 : 1, pulseWidth: side ? .98 : .02, fmRatio: side ? 16 : .125, fmIndex: side ? 16 : 0, fmFeedback: side, vector: side, drive: side, sub: side });
      Object.assign(state.synth.filter, { cutoff: side ? 20000 : 20, resonance: side, envAmount: side ? 5 : -5 });
      Object.assign(state.synth.lfo, { rate: side ? 20 : .01, depth: side });
      Object.assign(state.fx, { chorus: side, delay: side, feedback: side, space: side, width: side, volume: side ? 1 : .7 });
      const core = factory(state); for (let i = 0; i < 32; i++) core.scheduleNote({ note: i % 2 ? 120 : 12, velocity: 1, frame: 0, duration: .4, source: 'stress' });
      const pcm = render(core, .9), info = stats(pcm); assert.equal(info.nonfinite, 0, model); assert(info.peak <= 1.00001, model); assert(pcm.meters.voices <= 32); evidence[model + side] = info.peak;
    }
    return evidence;
  });
  await check('All 24 preset voices render finite audible PCM through the actual DSP', () => {
    const evidence = [];
    for (const preset of scope.ProofPresets) {
      const state = S.normalize(preset.state || preset); const core = factory(state); core.start({ beat: 0, frame: 0 });
      const info = stats(render(core, .45)); assert.equal(info.nonfinite, 0, preset.name); assert(info.rms > .0001, preset.name); assert(info.peak <= 1.00001, preset.name);
      evidence.push({ name: preset.name, model: state.synth.model, rms: +info.rms.toFixed(5), peak: +info.peak.toFixed(5) });
    }
    return evidence;
  });
  await check('Exact imported notes bypass the native arp and retain timestamps and durations', () => {
    const state = dryState(); state.tempo = 120; state.musicLabPattern = { pattern: validPacket(), voiceMap: { felt: 'synth' } };
    const imported = factory(state); imported.start({ beat: 0, frame: 0 });
    const direct = factory(dryState());
    for (const e of validPacket().notes) direct.scheduleNote({ note: e.pitch, velocity: e.velocity, frame: Math.round(e.beat * sr * .5), duration: e.duration * .5, source: 'proof-arp' });
    const a = render(imported, 1), b = render(direct, 1); assert(difference(a, b).maximum < 1e-6, 'import must play the exact direct notes');
  });
  await check('Imported chance, packet swing and event order use deterministic realized notes', () => {
    const zero = dryState(); const packet = validPacket(); packet.notes.forEach(n => n.probability = 0); zero.musicLabPattern = { pattern: packet, voiceMap: { felt: 'synth' } };
    const silent = factory(zero); silent.start({ beat: 0, frame: 0 }); const silence = render(silent, .8); assert.equal(stats(silence).peak, 0); assert.equal(silence.meters.voices, 0);
    const state = dryState(); state.tempo = 120; const imported = validPacket(); imported.swing = .4; imported.notes = [];
    for (let i = 0; i < 16; i++) imported.notes.push({ id: 'n' + i, voice: 'felt', pitch: 48 + i % 7, beat: i / 4, duration: .18, velocity: .8, probability: .6 });
    imported.notes.reverse(); state.musicLabPattern = { pattern: imported, voiceMap: { felt: 'synth' } };
    const realized = events(state, 8); assert.deepEqual(events(state, 8), realized); assert(realized.length > 0 && realized.length < 32);
    const native = factory(state); native.start({ beat: 0, frame: 0 }); const exact = factory(dryState());
    for (const e of realized) exact.scheduleNote({ note: e.note, velocity: e.velocity, frame: Math.round(e.startBeat * sr * .5), duration: e.durationBeats * .5, source: 'proof-arp' });
    assert.equal(difference(render(native, 4), render(exact, 4)).maximum, 0);
    imported.seed++; assert.notDeepEqual(events(state, 8), realized, 'packet seed changes actual chance');
  });
  await check('Offline exports are deterministic stereo PCM WAVs and do not mutate the live instrument', async () => {
    const audio = new scope.ProofAudio(S.defaultState()), before = S.serialize(audio.state), liveCore = audio.core, liveContext = audio.context;
    const state = dryState(), supplied = [{ note: 69, velocity: .8, startBeat: .2, durationBeats: .6, voiceId: 'synth' }];
    const one = await audio.renderNotes({ state, events: supplied, tempo: 120, lengthBeats: 1, tailSeconds: .2 });
    const two = await audio.renderNotes({ state, events: supplied, tempo: 120, lengthBeats: 1, tailSeconds: .2 });
    assert.equal(one.sourceApp, 'proof'); assert.equal(one.sampleRate, sr); assert.equal(one.tempo, 120); assert(one.blob instanceof Blob);
    const bytes = Buffer.from(await one.blob.arrayBuffer()); assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
    assert.equal(bytes.readUInt16LE(22), 2); assert.equal(bytes.readUInt32LE(24), sr); assert.equal(bytes.readUInt16LE(34), 16);
    assert.deepEqual(Buffer.from(await two.blob.arrayBuffer()), bytes); assert.equal(S.serialize(audio.state), before); assert.equal(audio.core, liveCore); assert.equal(audio.context, liveContext);
    let peak = 0; for (let i = 44; i + 1 < bytes.length; i += 2) peak = Math.max(peak, Math.abs(bytes.readInt16LE(i))); assert(peak > 50);
    const abort = new AbortController(); abort.abort(); await assert.rejects(audio.renderWav({ bars: 1, signal: abort.signal }), /abort|cancel/i);
    const pending = new AbortController(); const renderPromise = audio.renderWav({ bars: 16, signal: pending.signal }); setTimeout(() => pending.abort(), 1);
    await assert.rejects(renderPromise, /abort|cancel/i); return { bytes: bytes.length, peakPCM16: peak };
  });
  await check('Native PCM is opt-in and retains exact phrase frames for hosts at another sample rate', async () => {
    const audio = new scope.ProofAudio(S.defaultState()), before = S.serialize(audio.state), state = dryState();
    const events = [{ note: 69, velocity: .8, startBeat: .2, durationBeats: .6, voiceId: 'synth' }], options = { state, events, tempo: 120, lengthBeats: 4, tailSeconds: 0 };
    const ordinary = await audio.renderNotes(options); assert.equal(ordinary.pcm, undefined, 'phone exports need no duplicate full PCM buffer');
    const native = await audio.renderNotes({ ...options, includePCM: true }); assert(native.pcm instanceof Float32Array); assert.equal(native.pcm.length, 96000 * 2); assert.equal(native.sampleRate, 48000);
    assert.deepEqual(Buffer.from(await native.blob.arrayBuffer()), Buffer.from(await ordinary.blob.arrayBuffer()));
    let peak = 0; for (const sample of native.pcm) { assert(Number.isFinite(sample)); peak = Math.max(peak, Math.abs(sample)); } assert(peak > .001);
    assert.equal(S.serialize(audio.state), before); assert.equal(audio.context, null); return { nativeFrames: native.pcm.length / 2, sampleRate: native.sampleRate, peak };
  });
  const report = { checkedAt: new Date().toISOString(), passed: results.length, failed: failures.length, results, failures };
  if (process.env.PROOF_QA_REPORT) fs.writeFileSync(process.env.PROOF_QA_REPORT, JSON.stringify(report, null, 2) + '\n');
  console.log('\nLEAVEN: ' + results.length + ' passed, ' + failures.length + ' failed.');
  if (failures.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
