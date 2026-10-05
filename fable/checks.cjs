'use strict';

// Persistent portable-state and sample-analysis checks; no browser dependency.
// Run `node fable/checks.cjs` from the repository, or `node checks.cjs` in the source download.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
let decodes = 0;
const scope = { console, crypto: webcrypto, TextEncoder, TextDecoder, Float32Array, Float64Array, Uint8Array, DataView, ArrayBuffer,
  btoa: value => Buffer.from(value, 'binary').toString('base64'),
  atob: value => { decodes++; return Buffer.from(value, 'base64').toString('binary'); } };
scope.window = scope;
vm.createContext(scope);
for (const file of ['schema.js', 'presets.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), scope, { filename: file });
const S = scope.FableSchema;
const passed = [];
function check(name, run) { run(); passed.push(name); }
function portable(state) { return JSON.parse(S.serializeProject(state)); }
function rejectEdit(edit, pattern) { const project = portable(S.defaultState()); edit(project.state); assert.throws(() => S.parseProject(JSON.stringify(project)), pattern); }
function tone(frequency, seconds = .4, sampleRate = 48000, antiPhase = false) {
  const frames = Math.round(seconds * sampleRate), left = new Float32Array(frames), right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) { left[i] = .5 * Math.sin(2 * Math.PI * frequency * i / sampleRate); right[i] = antiPhase ? -left[i] : left[i]; }
  return { left, right, sampleRate };
}

check('The default instrument is playable and exactly round-trips', () => {
  const initial = S.defaultState();
  assert(initial.zones.some(zone => zone.enabled));
  assert(initial.patterns[0].steps.some(step => step.on));
  assert(initial.patterns.every(pattern => pattern.steps.every(step => Number.isInteger(step.note) && step.note >= 0 && step.note <= 127)));
  const serialized = S.serializeProject(initial);
  assert.equal(S.serializeProject(S.parseProject(serialized)), serialized);
  assert.equal(initial.patterns.length, 4);
  assert(initial.patterns.every(pattern => pattern.steps.length === 64 && pattern.length === 16));
});

check('All eight house presets are complete, distinct, and portable', () => {
  assert.equal(scope.FablePresets.length, 8);
  assert.equal(new Set(scope.FablePresets.map(preset => preset.id)).size, 8);
  const fingerprints = new Set();
  for (const preset of scope.FablePresets) {
    const first = preset.create(), second = preset.create();
    assert.equal(S.serializeProject(S.parseProject(S.serializeProject(first))), S.serializeProject(first));
    first.zones[0].level = .1;
    assert.notEqual(second.zones[0].level, .1, 'Preset creation must return independent control state.');
    assert(first.assets.length > 1 && first.zones.length > 1, 'Seed presets must exercise multisampling/layering.');
    fingerprints.add(second.assets.map(asset => asset.recipe).join(',') + '/' + second.zones.map(zone => zone.engine).join(','));
    for (const pattern of second.patterns) for (const step of pattern.steps.filter(step => step.on)) {
      const velocity = Math.round(step.velocity * 127);
      assert(second.zones.some(zone => zone.enabled && step.note >= zone.low && step.note <= zone.high && velocity >= zone.velLow && velocity <= zone.velHigh), preset.id + ' contains an unmapped active note.');
    }
  }
  assert.equal(fingerprints.size, 8);
});

check('PCM preserves stereo, polarity, endpoints, rates, roots, and names', () => {
  const pcm = Float32Array.from([-1, 1, -.72, .43, .02, -.03, 0, .99]);
  const asset = S.encodeAsset({ pcm, sampleRate: 192000, name: 'Stereo specimen ♫', root: 43 });
  assert.equal(asset.channels, 2); assert.equal(asset.frames, 4); assert.equal(asset.root, 43);
  assert.equal(asset.duration, 4 / 192000); assert.equal(asset.name, 'Stereo specimen ♫');
  const decoded = S.decodeAsset(asset);
  for (let i = 0; i < 4; i++) {
    assert(Math.abs(decoded.left[i] - pcm[i * 2]) < 1 / 32767);
    assert(Math.abs(decoded.right[i] - pcm[i * 2 + 1]) < 1 / 32767);
  }
  assert.equal(decoded.left[0], -1); assert.equal(decoded.right[0], 1);
  const state = S.defaultState(); state.assets = [asset]; state.zones = [S.createZone(asset, { id: 'zone-stereo' })]; state.selectedZone = 'zone-stereo';
  const restored = S.parseProject(S.serializeProject(state));
  assert.equal(restored.assets[0].pcm, asset.pcm); assert.equal(restored.zones[0].assetId, asset.id);
  const mono = S.encodeAsset({ pcm: Float32Array.of(-.5, .5), channels: 1, sampleRate: 8000 });
  const monoAudio = S.decodeAsset(mono); assert.equal(monoAudio.left, monoAudio.right);
});

check('Malformed audio dimensions, padding, and metadata reject before decoding', () => {
  const asset = S.encodeAsset({ pcm: Float32Array.of(.2, -.3), sampleRate: 48000 });
  const before = decodes;
  for (const edit of [a => a.frames++, a => a.sampleRate = 7999, a => a.sampleRate = 192001, a => a.sampleRate = 48000.5, a => a.channels = 3, a => a.channels = 0, a => a.duration += .01, a => a.pcm = a.pcm.slice(0, -4), a => a.pcm += 'AAAA', a => a.pcm = '!!!!!!!!', a => a.pcm = a.pcm.slice(0, -2) + 'A=', a => a.id = '__proto__', a => a.kind = 'remote', a => a.root = 128]) {
    const broken = { ...asset }; edit(broken); assert.throws(() => S.decodeAsset(broken));
  }
  assert.equal(decodes, before, 'Malformed assets must not allocate decoded audio.');
  const noncanonical = { ...asset, pcm: asset.pcm.slice(0, -3) + 'B==' };
  assert.throws(() => S.normalizeAsset(noncanonical), /padding/i);
});

check('Encoding rejects invalid buffers, partial frames, NaN and Infinity', () => {
  for (const pcm of [Float32Array.of(.1), Float32Array.of(NaN, 0), Float32Array.of(Infinity, 0), new Int16Array([2, 3]), Float32Array.of()]) assert.throws(() => S.encodeAsset({ pcm, sampleRate: 48000 }));
  assert.throws(() => S.encodeAsset({ pcm: Float32Array.of(0, 0), sampleRate: NaN }));
  assert.throws(() => S.encodeAsset({ pcm: Float32Array.of(0, 0), sampleRate: 48000, channels: 1.5 }));
});

check('Project budgets, duplicate identities and missing references cannot lose samples', () => {
  const initial = S.defaultState();
  assert.throws(() => S.normalize({ ...initial, assets: [initial.assets[0], initial.assets[0]] }), /duplicate sample/i);
  assert.throws(() => S.normalize({ ...initial, zones: [initial.zones[0], initial.zones[0]] }), /duplicate zone/i);
  assert.throws(() => S.normalize({ ...initial, assets: [] }), /missing sample/i);
  assert.throws(() => S.normalize({ ...initial, assets: Array.from({ length: 33 }, (_, i) => ({ ...initial.assets[0], id: 's-' + i })) }), /32 sample/i);
  assert.throws(() => S.normalize({ ...initial, zones: Array.from({ length: 65 }, (_, i) => ({ ...initial.zones[0], id: 'z-' + i })) }), /64 zone/i);
  const oversized = Array.from({ length: 32 }, (_, i) => ({ ...initial.assets[0], id: 'large-' + i, duration: 12 }));
  assert.throws(() => S.normalize({ ...initial, assets: oversized, zones: [] }), /64 MiB/i);
  assert.throws(() => S.normalizeAsset({ ...initial.assets[0], duration: 120, sampleRate: 192000 }), /64 MiB/i);
  assert.throws(() => S.normalizeAsset({ ...initial.assets[0], channels: 1 }), /two channels/i);
  assert.throws(() => S.parseProject(' '.repeat(S.MAX_PROJECT_BYTES + 1)), /64 MiB/i);
  const empty = S.normalize({ ...initial, assets: [], zones: [], selectedZone: '' });
  assert.equal(S.parseProject(S.serializeProject(empty)).zones.length, 0);
});

check('Portable state rejects corrupted controls instead of silently repairing them', () => {
  rejectEdit(s => s.zones[0].root = null, /root/i);
  rejectEdit(s => s.zones[0].filter.cutoff = 0, /cutoff/i);
  rejectEdit(s => s.zones[0].loopMode = 'magic', /loopMode/i);
  rejectEdit(s => s.zones[0].loopStart = .95, /loopEnd/i);
  rejectEdit(s => s.zones[0].enabled = 'yes', /enabled/i);
  rejectEdit(s => s.zones[0].low = 128, /low/i);
  rejectEdit(s => s.master.polyphony = 1000, /polyphony/i);
  rejectEdit(s => s.patterns[0].steps.pop(), /steps/i);
  rejectEdit(s => s.patterns[0].steps[0].note = 60.5, /note/i);
  rejectEdit(s => s.patterns[0].length = 17, /length/i);
  rejectEdit(s => s.modulation[0].source = 'microphone', /source/i);
  rejectEdit(s => s.selectedZone = 'missing', /selectedZone/i);
  rejectEdit(s => delete s.master, /master/i);
  rejectEdit(s => s.version = '9000.0.0', /version/i);
  assert.throws(() => S.parseProject(JSON.stringify({ format: 'other-project', formatVersion: 1, state: S.defaultState() })), /STOCK/i);
});

check('Undo copies controls independently while reusing immutable validated audio', () => {
  const asset = S.encodeAsset({ pcm: Float32Array.of(.1, .2), sampleRate: 24000 });
  const state = S.normalize({ ...S.defaultState(), assets: [asset], zones: [S.createZone(asset, { id: 'zone-undo' })], selectedZone: 'zone-undo' });
  const snapshot = S.copy(state);
  assert.equal(snapshot.assets[0], state.assets[0]); assert(Object.isFrozen(snapshot.assets[0]));
  assert.equal(S.normalizeAsset(snapshot.assets[0]), snapshot.assets[0]);
  snapshot.zones[0].envelope.attack = 7; snapshot.patterns[0].steps[0].velocity = .1;
  assert.notEqual(state.zones[0].envelope.attack, 7); assert.notEqual(state.patterns[0].steps[0].velocity, .1);
  const badMutable = { ...asset, frames: 100 };
  assert.throws(() => S.normalizeAsset(badMutable));
});

check('Automatic keys and velocity maps cover every note/velocity without gaps', () => {
  const asset = S.defaultState().assets[0];
  const zones = [48, 60, 72].map((root, i) => S.createZone(asset, { id: 'mapped-' + i, root, transpose: i, level: .42 + i * .1, loopMode: 'forward' }));
  const keys = S.autoMap(zones, 'keys');
  for (let note = 0; note < 128; note++) assert.equal(keys.filter(zone => note >= zone.low && note <= zone.high).length, 1);
  const velocity = S.autoMap(zones, 'velocity');
  for (let value = 1; value <= 127; value++) assert.equal(velocity.filter(zone => value >= zone.velLow && value <= zone.velHigh).length, 1);
  const layered = [...zones, S.createZone(asset, { id: 'layer', root: 60, velLow: 81 })];
  const mapped = S.autoMap(layered, 'keys'); assert.equal(mapped[1].low, mapped[3].low); assert.equal(mapped[1].high, mapped[3].high); assert.equal(mapped[3].velLow, 81);
  const drums = S.autoMap(zones, 'drums'); drums.forEach((zone, i) => { assert.equal(zone.low, 36 + i); assert.equal(zone.high, zone.low); assert.equal(zone.root, zones[i].root); assert.equal(zone.tracking, false); });
  keys.forEach((zone, i) => { assert.equal(zone.assetId, zones[i].assetId); assert.equal(zone.level, zones[i].level); assert.equal(zone.loopMode, 'forward'); });
  keys[0].filter.cutoff = 44; assert.notEqual(zones[0].filter.cutoff, 44);
});

check('Pitch detection handles bass, stereo polarity, late notes and silence', () => {
  for (const frequency of [27.5, 55, 110, 220, 440, 880, 1760]) {
    const result = S.detectPitch(tone(frequency, .5, 48000, true));
    assert(result, 'No pitch for ' + frequency);
    assert(Math.abs(1200 * Math.log2(result.frequency / frequency)) < 12, 'Pitch error for ' + frequency + ': ' + JSON.stringify(result));
    assert(result.confidence > .9);
  }
  const delayed = tone(440, 1); delayed.left.fill(0, 0, 24000); delayed.right.fill(0, 0, 24000);
  assert.equal(S.detectPitch(delayed).note, 69);
  assert.equal(S.detectPitch({ left: new Float32Array(8000), sampleRate: 8000 }), null);
  assert.equal(S.detectPitch({ left: new Float32Array(1024).fill(.7), sampleRate: 48000 }), null);
  const broken = tone(440); broken.right[0] = NaN; assert.throws(() => S.detectPitch(broken), /non-finite/i);
});

check('Silence trim and onset boundaries retain meaningful stereo transients', () => {
  const left = new Float32Array(48000), right = new Float32Array(48000);
  for (const frame of [4800, 14400, 28800, 38400]) for (let i = 0; i < 1800; i++) right[frame + i] = .7 * Math.exp(-i / 500) * Math.sin(2 * Math.PI * 800 * i / 48000);
  const audio = { left, right, sampleRate: 48000 }, trimmed = S.trimSilence(audio);
  assert(trimmed.start > .09 && trimmed.start < .105); assert(trimmed.end > .8 && trimmed.end < .86);
  const boundaries = S.onsets(audio, 8);
  assert.equal(boundaries[0], 0); assert.equal(boundaries[boundaries.length - 1], 1);
  assert(boundaries.length >= 5 && boundaries.length <= 9);
  for (const onset of [.1, .3, .6, .8]) assert(boundaries.some(value => Math.abs(value - onset) < .012), 'Missing transient at ' + onset);
  for (let i = 1; i < boundaries.length; i++) assert(boundaries[i] > boundaries[i - 1]);
  const silent = { left: new Float32Array(8000), sampleRate: 8000 };
  assert.equal(JSON.stringify(S.trimSilence(silent)), '{"start":0,"end":1}');
  assert.equal(JSON.stringify(S.onsets(silent)), '[0,1]');
});

console.log('STOCK: ' + passed.length + ' checks passed.');
for (const name of passed) console.log('  ✓ ' + name);
