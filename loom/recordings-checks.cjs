'use strict';
// Project-audio deletion is transactional and never changes surviving PCM.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
globalThis.window = globalThis;
globalThis.crypto ||= webcrypto;
globalThis.btoa ||= value => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ||= value => Buffer.from(value, 'base64').toString('binary');
const shared = fs.existsSync(path.join(__dirname, 'shared/pattern-schema.js')) ? path.join(__dirname, 'shared/pattern-schema.js') : path.join(__dirname, '../shared/pattern-schema.js');
vm.runInThisContext(fs.readFileSync(shared, 'utf8'), { filename: 'pattern-schema.js' });
for (const name of ['schema.js', 'recordings.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, name), 'utf8'), { filename: name });
const S = LoomSchema, R = LoomRecordings, passed = [];
const clip = (id, assetId, start = 0) => ({ id, name: id, type: 'audio', assetId, start, length: .25, sourceStart: 0, sourceEnd: .2, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: 1, fadeIn: 0, fadeOut: 0 });
function fixture() {
  let state = S.defaultState(); state.lengthBars = 1; state.tempo = 120; state.loopEnd = 4;
  const sound = new Float32Array(1600); for (let i = 0; i < sound.length; i++) sound[i] = .15 * Math.sin(i * .031);
  state.assets = ['guitar', 'bass', 'unused'].map((id, index) => S.encodeAsset({ id, name: id === 'guitar' ? '<Guitar> & 🎸' : id, sampleRate: 8000, left: sound.map(sample => sample * (index + 1) / 3) }));
  state.tracks[0].clips = [clip('first', 'guitar'), clip('duplicate', 'guitar', 1)];
  state.tracks[1].clips = [clip('shared', 'guitar'), clip('bass-part', 'bass', 1)];
  const pattern = { format: 'musiclab-pattern', version: 1, name: 'Keep these notes', sourceApp: 'test', tempo: 120, lengthBeats: 4, voices: [{ id: 'lead', name: 'Lead' }], notes: [{ id: 'note', pitch: 60, beat: 0, duration: .5, velocity: .8, voice: 'lead' }] };
  state.tracks[0].clips.push({ id: 'notes', name: 'Written melody', type: 'notes', pattern, start: 2, length: 1, sourceOffset: 0, rate: 1, loop: false, gain: 1, fadeIn: 0, fadeOut: 0, transpose: 0, voiceMap: {} });
  state = S.normalize(state);
  const frames = 16000, left = new Float32Array(frames); for (let i = 0; i < frames; i++) left[i] = .08 * Math.sin(i * .05);
  state.freezeAssets = ['main-one', 'send-one', 'main-two', 'unused-cache'].map(id => S.encodeFreezeAsset({ id, name: id, sampleRate: 8000, left }));
  for (const index of [0, 1]) {
    const t = state.tracks[index];
    t.freeze = { version: 1, sampleRate: 8000, tempo: state.tempo, lengthBeats: 4, bodyFrames: frames, totalFrames: frames, tailFrames: 0, fingerprint: S.freezeFingerprint(state, t.id), chunks: [{ startFrame: 0, frames, main: index ? 'main-two' : 'main-one', sendA: index ? null : 'send-one', sendB: null }] };
  }
  return S.normalize(state);
}
function check(name, run) { run(); passed.push(name); console.log('PASS ' + name); }

check('Every source, grouped frozen render and unreferenced cached recording has a stable browser entry', () => {
  const state = fixture(), before = S.copy(state), rows = R.list(state);
  assert.equal(rows.length, 6); assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
  const guitar = rows.find(row => row.id === 'audio:guitar'); assert.equal(guitar.name, '<Guitar> & 🎸'); assert.equal(guitar.duration, .2); assert.equal(guitar.channels, 2); assert.equal(guitar.sampleRate, 8000); assert.equal(guitar.useCount, 3); assert.deepEqual(guitar.uses.map(use => use.clipId), ['first', 'duplicate', 'shared']); assert.equal(guitar.decodedBytes, 1600 * 8); assert.equal(guitar.pcmBytes, 1600 * 4);
  assert.equal(rows.find(row => row.id === 'audio:unused').unused, true); assert.equal(rows.find(row => row.id === 'audio:unused').savedEncodedBytes, 0);
  const frozen = rows.find(row => row.id === 'freeze:track-1'); assert.equal(frozen.duration, 2); assert.equal(frozen.chunkCount, 1); assert.deepEqual(frozen.planes, ['main', 'sendA']); assert.equal(frozen.encodedBytes, state.freezeAssets[0].pcm.length + state.freezeAssets[1].pcm.length);
  const orphan = rows.find(row => row.id === 'freeze-unused:unused-cache'); assert(orphan.unused); assert.equal(orphan.savedEncodedBytes, 0); assert.equal(orphan.chunks[0].main, 'unused-cache');
  assert.deepEqual(state, before);
  const mono = S.copy(state); mono.assets.push({ id: 'mono', name: 'Mono take', sampleRate: 8000, channels: 1, frames: 800, duration: .1, pcm: Buffer.alloc(1600).toString('base64') });
  const monoRow = R.list(S.normalize(mono)).find(row => row.assetId === 'mono'); assert.equal(monoRow.pcmBytes, 1600); assert.equal(monoRow.decodedBytes, 6400, 'GALLEY expands a mono source into stereo Float32 playback');
});

check('Listing, storage summaries and deletion planning never decode or copy large PCM payloads', () => {
  const state = fixture(), native = atob;
  globalThis.atob = () => { throw Error('Browsing must not decode PCM'); };
  try {
    const total = R.storage(state), plan = R.planDelete(state, ['audio:guitar']); R.list(state);
    assert.equal(total.encodedBytes, [...state.assets, ...state.freezeAssets].reduce((sum, asset) => sum + asset.pcm.length, 0));
    assert.equal(total.savedEncodedBytes, total.encodedBytes - state.assets[2].pcm.length - state.freezeAssets[3].pcm.length);
    assert.equal(total.freezeAssetCount, 4); assert.equal(total.frozenTrackCount, 2); assert.equal(plan.clipCount, 3);
  } finally { globalThis.atob = native; }
});

check('Deleting a shared source removes every clip use and releases only its affected frozen tracks', () => {
  const original = fixture(), before = S.copy(original), { state, plan } = R.remove(original, ['audio:guitar']);
  assert.equal(plan.clipCount, 3); assert.deepEqual(plan.tracks.map(track => track.id), ['track-1', 'track-2']); assert.deepEqual(plan.unfreezeIds, ['track-1', 'track-2']);
  assert.deepEqual(plan.removedSourceIds, ['guitar']); assert.deepEqual(plan.removedFreezeIds, ['main-one', 'send-one', 'main-two']);
  assert.deepEqual(state.assets.map(asset => asset.id), ['bass', 'unused']); assert.deepEqual(state.freezeAssets.map(asset => asset.id), ['unused-cache']);
  assert(!state.tracks[0].freeze && !state.tracks[1].freeze); assert.deepEqual(state.tracks[0].clips.map(c => c.id), ['notes']); assert.deepEqual(state.tracks[1].clips.map(c => c.id), ['bass-part']);
  assert.equal(state.assets[0].pcm, original.assets[1].pcm); assert.equal(state.assets[1].pcm, original.assets[2].pcm); assert.equal(state.freezeAssets[0].pcm, original.freezeAssets[3].pcm);
  assert.deepEqual(state.tracks[0].clips[0], original.tracks[0].clips.find(c => c.id === 'notes')); assert.deepEqual(state.tracks[1].effects, original.tracks[1].effects); assert.deepEqual(state.tracks[1].eq, original.tracks[1].eq); assert.deepEqual(original, before);
});

check('Deleting a frozen render restores its original clips without touching another render or the source recordings', () => {
  const original = fixture(), { state, plan } = R.remove(original, ['freeze:track-1']);
  assert.equal(plan.clipCount, 0); assert.deepEqual(plan.unfreezeIds, ['track-1']); assert.deepEqual(plan.removedSourceIds, []);
  assert.deepEqual(state.assets, original.assets); assert.deepEqual(state.tracks[0].clips, original.tracks[0].clips); assert(!state.tracks[0].freeze); assert(S.freezeValid(state, 'track-2'));
  assert.deepEqual(state.freezeAssets.map(asset => asset.id), ['main-two', 'unused-cache']); assert.equal(state.freezeAssets[0].pcm, original.freezeAssets[2].pcm);
});

check('A frozen audio chunk is retained until its final track owner is removed', () => {
  const original = fixture(); original.tracks[1].freeze.chunks[0].main = 'main-one'; const state = S.normalize(original);
  const one = R.remove(state, ['freeze:track-1']); assert.deepEqual(one.plan.removedFreezeIds, ['send-one']); assert(one.state.freezeAssets.some(asset => asset.id === 'main-one')); assert(S.freezeValid(one.state, 'track-2'));
  const both = R.remove(state, ['freeze:track-1', 'freeze:track-2']); assert.deepEqual(both.plan.removedFreezeIds, ['main-one', 'send-one']); assert(!both.state.freezeAssets.some(asset => asset.id === 'main-one')); assert.equal(both.plan.encodedBytes, state.freezeAssets[0].pcm.length + state.freezeAssets[1].pcm.length);
});

check('Unused selections stay distinct from saved-file savings and never sweep unrelated recordings', () => {
  const original = fixture(), source = R.remove(original, ['audio:unused']);
  assert.equal(source.plan.clipCount, 0); assert.equal(source.plan.savedEncodedBytes, 0); assert.equal(source.plan.encodedBytes, original.assets[2].pcm.length); assert.deepEqual(source.plan.unfreezeIds, []); assert(S.freezeValid(source.state, 'track-1')); assert(S.freezeValid(source.state, 'track-2'));
  assert.equal(S.serializeProject(source.state), S.serializeProject(original));
  const cache = R.remove(original, ['freeze-unused:unused-cache']); assert.equal(cache.plan.savedEncodedBytes, 0); assert.equal(cache.state.assets.length, 3); assert.equal(cache.state.freezeAssets.length, 3); assert(S.freezeValid(cache.state, 'track-1')); assert(S.freezeValid(cache.state, 'track-2'));
});

check('Unknown or malformed selections reject atomically; repeated IDs never double-count removal', () => {
  const original = fixture(), before = S.copy(original);
  for (const ids of [['audio:guitar', 'audio:missing'], ['freeze:track-9'], [null], 'audio:guitar', null]) assert.throws(() => R.remove(original, ids), /recording|Choose/i);
  assert.deepEqual(original, before);
  const once = R.planDelete(original, ['audio:guitar']), twice = R.planDelete(original, ['audio:guitar', 'audio:guitar']); assert.deepEqual(once, twice);
  assert.deepEqual(R.remove(original, []).state, original); assert.equal(R.planDelete(original, []).encodedBytes, 0);
});

check('A saved and reopened cleaned project drops deleted PCM while every remaining playback sample remains exact', () => {
  const original = fixture(), before = S.serializeProject(original), expected = S.decodeAssets([original.assets[1]]).bass;
  const result = R.remove(original, ['audio:guitar']), after = S.serializeProject(result.state), reopened = S.parseProject(after), audio = S.decodeAssets(reopened.assets).bass;
  assert.equal(reopened.assets.length, 1); assert.equal(reopened.assets[0].id, 'bass'); assert(!reopened.freezeAssets); assert(!after.includes(original.assets[0].pcm));
  assert(Buffer.byteLength(before) - Buffer.byteLength(after) > result.plan.savedEncodedBytes); assert.deepEqual(audio.left, expected.left); assert.deepEqual(audio.right, expected.right);
  assert.equal(reopened.tracks[1].clips.length, 1); assert.equal(reopened.tracks[1].clips[0].assetId, 'bass'); assert.equal(reopened.tracks[0].clips[0].type, 'notes');
});

console.log(passed.length + ' recordings model groups passed.');
module.exports = { fixture, passed };
