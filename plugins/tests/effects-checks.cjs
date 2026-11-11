'use strict';
// Tests run the real adapter and unmodified GALLEY DSP in a headless JS realm.
// Native/macOS VST validation belongs to the native host checks; these are PCM,
// state, transport and automation-contract regressions, not a DAW benchmark.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugins/effects-manifest.json'), 'utf8'));
const scope = {}; scope.window = scope; scope.globalThis = scope;
vm.createContext(scope);
for (const file of [...manifest.catalogSources, ...manifest.dspSources, manifest.adapter]) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), scope, { filename: file });
const API = scope.KitchenEffectPlugins, factory = scope.createLoomEffectsDSP();
const plain = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function check(name, test) { test(); passed++; console.log('PASS', name); }
function bytes(data) { return Buffer.from(data.buffer, data.byteOffset, data.byteLength); }
function exact(a, b, label) { assert(bytes(a).equals(bytes(b)), label + ': PCM differs'); }
function signal(at, frames, sampleRate) {
  const left = new Float32Array(frames), right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const n = at + i, attack = Math.min(1, n / 33), envelope = .65 + .35 * Math.cos(n * .00023);
    left[i] = attack * envelope * (.09 * Math.sin(2 * Math.PI * 109 * n / sampleRate) + .03 * Math.cos(2 * Math.PI * 317 * n / sampleRate));
    right[i] = attack * envelope * (.07 * Math.sin(2 * Math.PI * 173 * n / sampleRate) - .02 * Math.cos(2 * Math.PI * 421 * n / sampleRate));
    if (n % 4093 === 81) { left[i] += .21; right[i] -= .17; }
  }
  return [left, right];
}
function configured(def) {
  const p = plain(def.defaults.params);
  if (def.id === 'prism') p.low = 6;
  if (def.id === 'scales' || def.id === 'saute') p.input = 6;
  if (def.id === 'track-eq') Object.assign(p, { low: 3, lowMid: -2, lowMidFreq: 270, highMid: 1.5, highMidFreq: 3100, high: -1 });
  if (def.id === 'mastering') Object.assign(p, { enabled: true, cleanup: true, eq: true, highGain: 1.5, glue: true, threshold: -24, limiter: true, ceiling: -3 });
  return p;
}
function reference(id, rate, params) {
  if (id === 'track-eq') {
    const processor = new (scope.createLoomTrackEQDSP().TrackEQ)(rate, params); let p = { ...params };
    return { setParams(next) { p = { ...p, ...next }; processor.setParams(next); }, process(left, right) { if (!p.bypass) processor.process(left, right); }, reset() { processor.reset(); } };
  }
  return id === 'mastering' ? scope.createLoomMasteringDSP().create(rate, params) : factory.create(id, rate, params);
}
const definitions = API.definitions();
check('Every current insert plus channel EQ and mastering has unique complete metadata and explicit bypass', () => {
  assert.equal(definitions.length, 24);
  assert.deepEqual(Array.from(API.ids), manifest.insertIds.concat(manifest.utilityIds));
  assert.equal(new Set(definitions.map(def => def.id)).size, 24);
  assert.deepEqual(definitions.filter(def => def.category === 'insert').map(def => def.id).sort(), scope.LoomEffectsCatalog.map(def => def.id).sort());
  for (const def of definitions) {
    assert(def.name && def.kind === 'effect' && def.vst3Category.startsWith('Fx|'));
    if (def.category === 'insert') {
      assert.equal(def.webDefinition.id, def.id);
      assert(Array.isArray(def.webDefinition.params));
      assert.deepEqual(def.webDefinition.defaults, def.defaults.params);
    }
    assert.equal(new Set(def.parameters.map(d => d.path)).size, def.parameters.length);
    assert(def.parameters.some(d => d.path === 'params.bypass' && d.type === 'boolean'));
    for (const d of def.parameters) {
      assert(own(def.defaults.params, d.key), def.id + ': missing default for ' + d.path);
      assert(d.normalizedDefault >= 0 && d.normalizedDefault <= 1);
    }
  }
  const first = API.definitions(); first[0].name = 'Mutated'; first[0].defaults.params.low = 99;
  assert.equal(API.definitions()[0].name, 'MANDOLINE'); assert.equal(API.definitions()[0].defaults.params.low, 0);
});
function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
const proof = [];
for (const def of definitions) check(def.name + ': exact canonical PCM with tempo/PPQ changes, parameters, bypass, state and reset', () => {
  const sampleRate = 48000, params = configured(def), plugin = API.create(def.id, sampleRate, { params }), canonical = reference(def.id, sampleRate, params);
  const digest = createHash('sha256'); let frame = 0, changed = false, energy = 0, difference = 0;
  const chunks = [1, 17, 128, 61, 256, 63, 512, 127];
  for (let turn = 0; frame < 16384; turn++) {
    const count = Math.min(chunks[turn % chunks.length], 16384 - frame);
    if (!changed && frame >= 1024) {
      const key = def.parameters.some(d => d.key === 'mix') ? 'mix' : def.id === 'track-eq' ? 'lowMidFreq' : 'input';
      const value = key === 'mix' ? .37 : key === 'lowMidFreq' ? 630 : -1;
      plugin.setParameter('params.' + key, value); canonical.setParams({ [key]: value }); changed = true;
    }
    if (turn === 20 || turn === 25) { const bypass = turn === 20; plugin.setParameter('bypass', bypass); canonical.setParams({ bypass }); }
    if (turn === 30) {
      const state = plain(plugin.getState());
      if (own(state.params, 'output')) state.params.output = -2;
      else if (own(state.params, 'high')) state.params.high = 2;
      plugin.setState(state); canonical.setParams(state.params);
    }
    const tempo = frame < 2048 ? 137 : frame < 6144 ? 91 : 173;
    const beat = frame < 4096 ? 3.5 + frame / sampleRate * tempo / 60 : frame < 8192 ? -.25 + (frame - 4096) / sampleRate * tempo / 60 : .5 + (frame - 8192) / sampleRate * tempo / 60;
    const clock = { sampleRate, tempo, beat, playing: !(frame >= 5000 && frame < 6000), frame, samplePosition: frame - 4096, revision: Math.floor(frame / 4096), timeSigNumerator: 7, timeSigDenominator: 8 };
    const input = signal(frame, count, sampleRate), left = input[0].slice(), right = input[1].slice(), expectedL = left.slice(), expectedR = right.slice();
    canonical.process(expectedL, expectedR, clock); plugin.process(left, right, clock);
    exact(left, expectedL, def.id + '/left/' + frame); exact(right, expectedR, def.id + '/right/' + frame);
    for (let i = 0; i < count; i++) { assert(Number.isFinite(left[i]) && Number.isFinite(right[i])); energy += left[i] * left[i] + right[i] * right[i]; difference += Math.abs(left[i] - input[0][i]) + Math.abs(right[i] - input[1][i]); }
    digest.update(bytes(left)); digest.update(bytes(right)); frame += count;
  }
  assert(energy > 0, def.id + ': no audio'); assert(difference > 1e-4, def.id + ': processor did not change the configured signal');
  const state = plain(plugin.getState()), detached = plugin.getState(); detached.params.bypass = !state.params.bypass;
  assert.deepEqual(plain(plugin.getState()), state);
  const reopened = API.create(def.id, sampleRate, JSON.parse(JSON.stringify(state))); assert.deepEqual(plain(reopened.getState()), state);
  plugin.reset(); canonical.reset();
  const after = signal(31, 257, sampleRate), expectedL = after[0].slice(), expectedR = after[1].slice();
  canonical.process(expectedL, expectedR, { tempo: 127, beat: 0, playing: true }); plugin.process(after[0], after[1], { tempo: 127, beat: 0, playing: true });
  exact(after[0], expectedL, def.id + '/reset/left'); exact(after[1], expectedR, def.id + '/reset/right');
  assert(Number.isFinite(plugin.getTailSeconds()) && plugin.getTailSeconds() >= 0); assert.equal(plugin.getLatencySamples(), 0);
  assert.equal(typeof plugin.getMeters(), 'object');
  proof.push({ id: def.id, frames: frame, channels: 2, sampleRate, sha256: digest.digest('hex') });
});
check('All parameter types round-trip through native normalized values without changing enum or boolean meaning', () => {
  for (const def of definitions) {
    const plugin = API.create(def.id, 48000);
    for (const d of def.parameters) {
      if (d.type === 'select') for (const option of d.options) {
        const n = API.parameterToNormalized(def.id, d.path, option.value);
        assert.equal(API.parameterFromNormalized(def.id, d.path, n), option.value);
      }
      else if (d.type === 'boolean') {
        assert.equal(API.parameterFromNormalized(def.id, d.path, .4999), false);
        assert.equal(API.parameterFromNormalized(def.id, d.path, .5), true);
      } else {
        for (const value of [d.min, d.max, d.default]) {
          const n = API.parameterToNormalized(def.id, d.path, value), actual = API.parameterFromNormalized(def.id, d.path, n);
          assert(Math.abs(actual - value) < Math.max(1e-10, Math.abs(value) * 1e-12), def.id + ':' + d.path);
        }
      }
    }
    plugin.setNormalizedParameter('params.bypass', 1); assert.equal(plugin.getState().params.bypass, true);
    plugin.setNormalizedParameter('params.bypass', 0); assert.equal(plugin.getState().params.bypass, false);
    assert.throws(() => plugin.setNormalizedParameter('params.bypass', NaN), /finite/);
  }
});
check('Clock-only updates and implicit sub-block advancement retain canonical PPQ phase without an editor', () => {
  for (const id of ['tremor', 'strainer', 'swirl', 'parallax', 'glaze', 'ferment', 'board']) {
    const def = definitions.find(value => value.id === id), params = configured(def), plugin = API.create(id, 48000, { params }), canonical = reference(id, 48000, params);
    const clock = { tempo: 113.25, beat: -1.25, playing: true, frame: 300, samplePosition: -3200 };
    plugin.transport(clock);
    for (const size of [17, 128, 1, 511, 63]) {
      const input = signal(500, size, 48000), expectedL = input[0].slice(), expectedR = input[1].slice();
      canonical.process(expectedL, expectedR, clock); plugin.process(input[0], input[1]);
      exact(input[0], expectedL, id + ': implicit clock left'); exact(input[1], expectedR, id + ': implicit clock right');
      clock.frame += size; clock.samplePosition += size; clock.beat += size / 48000 * clock.tempo / 60;
    }
  }
});
check('Explicit supported sample rates use the original processor at 44.1, 96 and 192 kHz', () => {
  for (const sampleRate of [44100, 96000, 192000]) for (const id of ['prism', 'velvet', 'strainer', 'preserve', 'board', 'cupboard', 'track-eq', 'mastering']) {
    const def = definitions.find(item => item.id === id), params = configured(def), plugin = API.create(id, sampleRate, { params }), canonical = reference(id, sampleRate, params);
    const input = signal(44, 257, sampleRate), expectedL = input[0].slice(), expectedR = input[1].slice(), clock = { tempo: 127, beat: 17.25, playing: true };
    plugin.process(input[0], input[1], clock); canonical.process(expectedL, expectedR, clock);
    exact(input[0], expectedL, id + '/' + sampleRate); exact(input[1], expectedR, id + '/' + sampleRate);
  }
});
check('FERMENT retains canonical guitar-to-MIDI capture events and sample-frame timing', () => {
  const sampleRate = 48000, def = definitions.find(item => item.id === 'ferment'), params = { ...def.defaults.params, mode: 'track', gate: -70, inputRange: 'guitar', mix: 1 };
  const plugin = API.create('ferment', sampleRate, { params }), canonical = reference('ferment', sampleRate, params);
  const options = { token: 'native-midi-test', tempo: 120, maxBeats: 4 };
  assert.deepEqual(plain(plugin.startMidiCapture(options)), plain(canonical.startMidiCapture(options)));
  for (let frame = 0; frame < 48000; frame += 128) {
    const count = Math.min(128, 48000 - frame), left = new Float32Array(count), right = new Float32Array(count);
    for (let i = 0; i < count; i++) { const at = frame + i; left[i] = right[i] = at < 35000 ? .2 * Math.sin(2 * Math.PI * 220 * at / sampleRate) : 0; }
    const expectedL = left.slice(), expectedR = right.slice(), clock = { tempo: 120, beat: frame / 24000, playing: true };
    canonical.process(expectedL, expectedR, clock); plugin.process(left, right, clock);
    exact(left, expectedL, 'ferment capture left'); exact(right, expectedR, 'ferment capture right');
  }
  plugin.stopMidiCapture('test stopped'); canonical.stopMidiCapture('test stopped');
  const batch = plain(plugin.drainMidiEvents()), expected = plain(canonical.drainMidiEvents());
  assert.deepEqual(batch, expected); assert(batch.events.length > 0, 'The capture must contain real detected notes');
  assert(batch.events.some(event => event.pitch === 57));
});
check('Unknown products, malformed state, invalid transport and aliased channel buffers reject explicitly', () => {
  assert.throws(() => API.create('not-a-product', 48000), /Unknown/);
  for (const rate of [0, 7999, 192001, NaN, Infinity]) assert.throws(() => API.create('prism', rate), /sample rates/);
  const plugin = API.create('prism', 48000), before = plain(plugin.getState());
  for (const state of ['bad', [], { params: null }]) assert.throws(() => plugin.setState(state), /state|params/);
  assert.throws(() => plugin.setParameter('params.unknown', 1), /Unknown parameter/);
  assert.throws(() => plugin.setParameter('params.low', Infinity), /finite/);
  assert.throws(() => plugin.setParameter('params.filter', 'invented'), /Unknown/);
  assert.deepEqual(plain(plugin.getState()), before);
  assert.throws(() => plugin.transport({ tempo: NaN }), /clock/);
  assert.throws(() => plugin.transport({ tempo: 0 }), /positive/);
  assert.throws(() => plugin.transport({ sampleRate: 44100 }), /sample rate changes/);
  const values = new Float32Array(16);
  assert.throws(() => plugin.process(values, values), /alias/);
  assert.throws(() => plugin.process(values, new Float32Array(15)), /equal-length/);
  assert.throws(() => plugin.process([], []), /Float32/);
});
console.log(JSON.stringify({ passed, products: definitions.length, exactFramesPerProduct: 16384, proof }, null, 2));
