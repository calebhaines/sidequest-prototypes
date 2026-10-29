'use strict';

// Independent pre-bus Core fingerprints. Goldens were authored from 18edcf6;
// this check reads only the shipped source and JSON, never a Git checkout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const sourceFiles = ['vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'effects.js', 'audio-engine.js'];
const clone = value => JSON.parse(JSON.stringify(value));
function loadSources(read = name => fs.readFileSync(path.join(__dirname, name), 'utf8')) {
  const scope = { Math, Number, Object, Map, Set, Promise, Float32Array, Float64Array, Int32Array, Uint8Array, Blob, DOMException, TextEncoder, setTimeout, navigator: {} };
  scope.window = scope; vm.createContext(scope);
  for (const name of sourceFiles) vm.runInContext(read(name), scope, { filename: name });
  return scope;
}
// Pure integer PCM generation avoids a platform-dependent sine/random fixture.
function signal(frame, track, channel, amplitude = .035) {
  let word = Math.imul(frame + 1, 1103515245) ^ Math.imul((track + 1) * 31 + (channel + 1) * 113, -1640531535);
  word ^= word >>> 16; word = Math.imul(word, -2048144789); word ^= word >>> 13;
  return ((word >>> 0) / 4294967296 * 2 - 1) * amplitude + (((frame + track * 7) % 251) / 251 - .5) * amplitude * .3;
}
function assetsFor(fixture) {
  return new Map((fixture.assets || []).map(item => [item.id, { sampleRate: item.sampleRate, left: Float32Array.from({ length: item.frames }, (_, i) => signal(i, item.seed, 0, item.amplitude)), right: Float32Array.from({ length: item.frames }, (_, i) => signal(i, item.seed, 1, item.amplitude)) }]));
}
function inputsFor(fixture, start, frames) {
  if (fixture.inputs === 'none') return [];
  return Array.from({ length: 9 }, (_, track) => [0, 1].map(channel => Float32Array.from({ length: frames }, (_, i) => signal(start + i, track, channel, track === 8 ? .17 : fixture.inputAmplitude ?? .035))));
}
function renderCase(scope, fixture, state = clone(fixture.state)) {
  const DSP = scope.createLoomEngineDSP(scope.createLoomEffectsDSP), core = new DSP.Core(state, assetsFor(fixture), fixture.sampleRate, fixture.options || {});
  const left = new Float32Array(fixture.frames), right = new Float32Array(fixture.frames), commands = fixture.commands || [], blocks = fixture.blocks || [128];
  let at = 0, command = 0, block = 0;
  while (at < fixture.frames) {
    while (commands[command]?.at === at) { const op = commands[command++]; assert.equal(typeof core[op.method], 'function', op.method); core[op.method](...(clone(op.args) || [])); }
    const n = Math.min(blocks[block++ % blocks.length], fixture.frames - at, commands[command] ? commands[command].at - at : Infinity);
    assert(n > 0, fixture.id + ': commands must be chronological and in range');
    core.processBlock(left.subarray(at, at + n), right.subarray(at, at + n), inputsFor(fixture, at, n)); at += n;
  }
  return { left, right, core };
}
function fingerprint(left, right) {
  const floats = Buffer.alloc(left.length * 8), pcm = Buffer.alloc(left.length * 4); let peak = 0, power = 0;
  for (let i = 0; i < left.length; i++) for (let channel = 0; channel < 2; channel++) {
    const value = channel ? right[i] : left[i], index = i * 2 + channel;
    floats.writeFloatLE(value, index * 4); pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * (value < 0 ? 32768 : 32767)), index * 2);
    peak = Math.max(peak, Math.abs(value)); power += value * value;
  }
  const frames = [...new Set([0, 1, 31, 127, 128, 511, 1023, 2047, Math.floor(left.length / 2), left.length - 1].filter(i => i < left.length))];
  return { float32StereoSha256: crypto.createHash('sha256').update(floats).digest('hex'), pcm16StereoSha256: crypto.createHash('sha256').update(pcm).digest('hex'), peak, rms: Math.sqrt(power / (left.length * 2)), samples: frames.map(frame => ({ frame, left: left[frame], right: right[frame] })) };
}
function addSilentBuses(scope, original) {
  const state = clone(original), effects = scope.createLoomEffectsDSP();
  state.master = Object.assign({ id: 'master', name: 'Master', mute: false, effects: [null, null, null, null], automation: [] }, state.master);
  state.tracks.forEach(track => { track.sends = [0, 0]; track.sendPre = [false, false]; });
  state.returns = ['vestige', 'parallax'].map((type, index) => ({ id: 'return-' + (index + 1), name: index ? 'Return B' : 'Return A', level: 1, pan: 0, mute: false, solo: false, effects: [{ type, bypass: false, params: Object.assign(effects.normalize(type, {}), { mix: 1 }) }, null, null, null], automation: [] }));
  return state;
}
function maximumDelta(a, b) { let maximum = 0; for (let i = 0; i < a.length; i++) maximum = Math.max(maximum, Math.abs(a[i] - b[i])); return maximum; }
function energyDifference(a, b) { let power = 0; for (let i = 0; i < a.length; i++) power += (a[i] - b[i]) ** 2; return Math.sqrt(power / a.length); }
function routingFixture(scope) {
  const effects = scope.createLoomEffectsDSP(), state = addSilentBuses(scope, { tempo: 120, lengthBars: 4, loopEnabled: false, loopStart: 0, loopEnd: 16, master: { level: .75, metronome: false }, tracks: Array.from({ length: 8 }, (_, index) => ({ id: 'track-' + (index + 1), level: .35 + index * .04, pan: (index - 3.5) * .15, mute: index === 6, solo: false, instrumentLive: false, effects: [null, null, null, null], automation: [], clips: [{ id: 'source-' + index, type: 'audio', assetId: 'source-' + index, start: 0, length: 4, sourceStart: 0, sourceEnd: .5, sourceOffset: 0, rate: 1, reverse: index % 2 === 1, loop: true, gain: .9, fadeIn: 0, fadeOut: 0 }] })) });
  state.tracks.forEach((track, index) => { track.sends = [.15 + .02 * index, .08 + .01 * index]; track.sendPre = [index % 3 === 0, index % 2 === 0]; });
  state.returns[0].effects = [{ type: 'cinder', params: effects.normalize('cinder', { drive: 21, shape: 'diode', output: -12, mix: 1 }) }, null, null, null];
  state.returns[0].level = .7; state.returns[0].pan = -.2;
  state.returns[1].effects = [{ type: 'parallax', params: effects.normalize('parallax', { clock: 'free', time: 44, feedback: .4, spread: .8, damping: 4000, mix: 1 }) }, null, null, null];
  state.returns[1].level = .6; state.returns[1].pan = .3;
  return { id: 'ten-stems-shared-nonlinear-returns', sampleRate: 8000, frames: 3072, blocks: [137, 31, 128], state, options: { linear: true }, assets: Array.from({ length: 8 }, (_, index) => ({ id: 'source-' + index, sampleRate: 8000, frames: 4096, seed: index + 30, amplitude: .06 })), inputs: 'none', commands: [{ at: 0, method: 'start', args: [0] }] };
}
function renderStems(scope, fixture) {
  const stems = fixture.state.tracks.map(track => renderCase(scope, { ...fixture, options: { linear: true, trackId: track.id } }));
  for (const bus of fixture.state.returns) stems.push(renderCase(scope, { ...fixture, options: { linear: true, returnId: bus.id } }));
  return stems;
}
function stemSum(stems, channel) { return Float64Array.from({ length: stems[0][channel].length }, (_, frame) => stems.reduce((sum, stem) => sum + stem[channel][frame], 0)); }
function reviewRouting(scope) {
  const fixture = routingFixture(scope), full = renderCase(scope, fixture), stems = renderStems(scope, fixture), measurements = {};
  assert(fingerprint(full.left, full.right).peak < .5, 'The linear stem comparison must stay below the shared safety limiter');
  assert.equal(stems.length, 10);
  for (const channel of ['left', 'right']) {
    const error = maximumDelta(full[channel], stemSum(stems, channel)); assert(error < 1e-7, 'Eight dry track stems plus two shared wet return stems must reconstruct the pre-master mix: ' + error); measurements[channel + 'TenStemMaximumError'] = error;
  }
  assert(fingerprint(stems[8].left, stems[8].right).peak > .01, 'The nonlinear shared-return fixture must be audible');
  assert(fingerprint(stems[9].left, stems[9].right).peak > .001, 'The second return must be audible');

  const solo = clone(fixture); solo.state.returns[0].solo = true; solo.state.tracks[0].solo = solo.state.tracks[1].solo = true;
  const soloMix = renderCase(scope, solo), soloStems = renderStems(scope, solo);
  for (let i = 0; i < 8; i++) assert.equal(fingerprint(soloStems[i].left, soloStems[i].right).peak, 0, 'Return solo suppresses dry export stems');
  assert.equal(fingerprint(soloStems[9].left, soloStems[9].right).peak, 0, 'A nonsolo return is suppressed in its export stem');
  assert(fingerprint(soloMix.left, soloMix.right).peak > .005, 'Return solo must continue receiving the normally audible source tracks');
  for (const channel of ['left', 'right']) assert(maximumDelta(soloMix[channel], stemSum(soloStems, channel)) < 1e-7);

  const master = clone(fixture), effects = scope.createLoomEffectsDSP();
  master.state.master.effects[0] = { type: 'cinder', params: effects.normalize('cinder', { drive: 24, shape: 'diode', output: -9, mix: 1 }) };
  const mastered = renderCase(scope, master), masterStems = renderStems(scope, master);
  assert(energyDifference(mastered.left, full.left) > .015, 'A nonlinear master insert must audibly process the complete mix');
  for (let i = 0; i < stems.length; i++) { assert.deepEqual(masterStems[i].left, stems[i].left, 'Master inserts must be excluded from every dry/wet stem'); assert.deepEqual(masterStems[i].right, stems[i].right); }
  measurements.masteredMixVsStemSumRms = energyDifference(mastered.left, stemSum(masterStems, 'left'));

  const shared = clone(fixture); shared.id = 'one-shared-return-nonlinearity'; shared.options = { linear: true, returnId: 'return-1' };
  shared.assets[0].amplitude = .18;
  shared.state.tracks.forEach((track, index) => { track.mute = index > 1; track.solo = false; track.level = .5; track.pan = 0; track.sends = [1, 0]; track.sendPre = [false, false]; track.clips = [clone(shared.state.tracks[0].clips[0])]; });
  shared.state.returns[0].pan = 0; shared.state.returns[0].level = 1;
  shared.state.returns[0].effects[0] = { type: 'cinder', params: effects.normalize('cinder', { shape: 'diode', drive: 36, output: -12, mix: 1 }) };
  const two = renderCase(scope, shared), oneState = clone(shared.state); oneState.tracks[1].mute = true;
  const one = renderCase(scope, shared, oneState), twoIndependent = Float64Array.from(one.left, value => value * 2);
  assert(fingerprint(two.left, two.right).peak < .9 && fingerprint(one.left, one.right).peak * 2 < .9, 'Shared-return proof must not rely on safety limiting');
  measurements.sharedVsPerTrackNonlinearRms = energyDifference(two.left, twoIndependent);
  assert(measurements.sharedVsPerTrackNonlinearRms > .025, 'One nonlinear return after the source sum must differ from cloned per-track effects');
  shared.state.returns[0].effects.fill(null); oneState.returns[0].effects.fill(null);
  const linearTwo = renderCase(scope, shared), linearOne = renderCase(scope, shared, oneState);
  assert(maximumDelta(linearTwo.left, Float64Array.from(linearOne.left, value => 2 * value)) < 1e-7, 'Removing the nonlinear return must restore exact source superposition');
  return measurements;
}
function reviewSoloTransition(scope) {
  const fixture = routingFixture(scope), initial = clone(fixture.state), rate = 8000, frames = 8192;
  initial.tracks.forEach((track, index) => { track.clips = []; track.effects.fill(null); track.instrumentLive = index === 0; track.level = 1; track.pan = 0; track.mute = false; track.solo = false; track.sends = [0, 0]; });
  initial.master.level = 1; initial.returns.forEach(bus => { bus.effects.fill(null); bus.solo = false; });
  function simulate(blocks) {
    const state = clone(initial), core = new (scope.createLoomEngineDSP(scope.createLoomEffectsDSP).Core)(state, {}, rate, { linear: true }); core.start();
    const left = new Float32Array(frames), right = new Float32Array(frames); let at = 0, block = 0;
    while (at < frames) {
      if (at === 3072 || at === 6144) { state.returns[0].solo = at === 3072; core.setState(clone(state)); }
      const until = at < 3072 ? 3072 : at < 6144 ? 6144 : frames, n = Math.min(blocks[block++ % blocks.length], until - at);
      core.processBlock(left.subarray(at, at + n), right.subarray(at, at + n), [[new Float32Array(n).fill(.1), new Float32Array(n).fill(.1)]]); at += n;
    }
    return { left, right };
  }
  const regular = simulate([128]), odd = simulate([137, 31, 256]), pole = Math.exp(-1 / (rate * .012));
  assert.deepEqual(regular.left, odd.left, 'Return-solo dry fades must follow the absolute sample clock');
  assert.deepEqual(regular.right, odd.right);
  assert(Math.abs(regular.left[3072] / regular.left[3071] - pole) < 1e-6, 'Solo must begin a 12 ms fade, rather than hard-cutting a nonzero dry waveform');
  assert.equal(regular.left[6143], 0, 'The wet-only audition reaches exact dry silence');
  assert(regular.left[6144] > 0 && regular.left[6144] < .003, 'Leaving wet-only audition fades the dry signal back in');
  return { soloFirstSampleRatio: regular.left[3072] / regular.left[3071], expectedTwelveMillisecondPole: pole, unsoloFirstSample: regular.left[6144] };
}
function main() {
  const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'bus-legacy-fixtures.json'), 'utf8')), scope = loadSources(), passed = [];
  assert.equal(fixtures.baselineCommit, '18edcf6');
  for (const fixture of fixtures.cases) {
    for (const [label, state] of [['legacy missing routing', fixture.state], ['explicit zero sends/default wet returns', addSilentBuses(scope, fixture.state)]]) {
      const rendered = renderCase(scope, fixture, clone(state)), actual = fingerprint(rendered.left, rendered.right);
      assert.equal(actual.float32StereoSha256, fixture.expected.float32StereoSha256, fixture.id + '/' + label + ': exact Float32 PCM changed');
      assert.equal(actual.pcm16StereoSha256, fixture.expected.pcm16StereoSha256, fixture.id + '/' + label + ': WAV PCM changed');
      assert(actual.peak > 0, fixture.id + ' must not be a vacuous silent fixture');
      assert.equal(rendered.core.getMeters().tracks.length, 8);
    }
    passed.push(fixture.id);
  }
  const routingReview = reviewRouting(scope);
  const soloTransition = reviewSoloTransition(scope);
  console.log(JSON.stringify({ baselineCommit: fixtures.baselineCommit, exactLegacyCases: passed, checks: ['whole-buffer Float32 PCM', 'whole-buffer WAV PCM16', 'legacy missing fields', 'explicit zero sends with wet default returns', 'eight instrument meter lanes', 'ten separate stems reconstruct the pre-master mix', 'track/return solo matches every stem', 'nonlinear master inserts are excluded from every stem', 'one shared nonlinear return after the source sum', 'return solo fades the dry signal over 12 ms with exact block invariance'], routingReview, soloTransition }, null, 2));
}
module.exports = { sourceFiles, clone, loadSources, signal, assetsFor, inputsFor, renderCase, fingerprint, addSilentBuses, routingFixture, renderStems, stemSum, reviewRouting, reviewSoloTransition };
if (require.main === module) main();
