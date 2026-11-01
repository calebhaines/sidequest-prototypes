'use strict';
/* Master playback project state: strict portable settings, migration and caches.
 * Run with node loom/master-playback-schema-checks.cjs (or in the source ZIP).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const scope = { Blob, console, crypto: webcrypto, btoa: value => Buffer.from(value, 'binary').toString('base64'), atob: value => Buffer.from(value, 'base64').toString('binary') };
scope.window = scope; scope.globalThis = scope; vm.createContext(scope);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'schema.js'), 'utf8'), scope, { filename: 'schema.js' });
const S = scope.LoomSchema, plain = value => JSON.parse(JSON.stringify(value));
const neutral = { speed: 1, pitch: 0, preservePitch: true }, passed = [];
function check(name, run) { run(); passed.push(name); console.log('PASS ' + name); }
function envelope(state = S.defaultState(), version = S.VERSION) {
  const project = { format: 'loom-project', formatVersion: 1, state: S.copy(state) };
  if (version !== undefined) project.appVersion = version;
  return project;
}
function parse(project) { return S.parseProject(JSON.stringify(project)); }
function frozenFixture() {
  const state = S.defaultState(); state.tempo = 120; state.lengthBars = 1; state.loopEnabled = false; state.loopStart = 0; state.loopEnd = 4; state.recording.punchEnd = 4;
  const rate = 8000, frames = 16000, left = Float32Array.from({ length: frames }, (_, frame) => .04 * Math.sin(2 * Math.PI * 173 * frame / rate)), right = Float32Array.from(left, value => value * .6);
  const original = S.encodeAsset({ id: 'playback-source', name: 'Original guitar take', sampleRate: rate, left, right });
  state.assets = [original];
  const track = state.tracks[8]; track.level = .7;
  track.clips = [{ id: 'playback-source-clip', name: 'Original guitar part', type: 'audio', assetId: original.id, start: 0, length: 4, sourceStart: 0, sourceEnd: 2, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: 1, fadeIn: 0, fadeOut: 0 }];
  const frozen = S.encodeFreezeAsset({ id: 'playback-frozen', name: 'Frozen guitar take', sampleRate: rate, left, right });
  state.freezeAssets = [frozen];
  track.freeze = { version: 1, sampleRate: rate, tempo: state.tempo, lengthBeats: 4, bodyFrames: frames, totalFrames: frames, tailFrames: 0, fingerprint: S.freezeFingerprint(state, track.id), chunks: [{ startFrame: 0, frames, main: frozen.id, sendA: null, sendB: null }] };
  assert(S.freezeValid(state, track.id));
  return { state, trackId: track.id, sourcePcm: original.pcm, frozenPcm: frozen.pcm };
}
check('Master playback defaults are neutral independent project objects and survive normal project copying', () => {
  assert.equal(S.VERSION, '1.34.0');
  assert.deepEqual(plain(S.defaultMasterPlayback()), neutral);
  const first = S.defaultState(), second = S.defaultState();
  assert.deepEqual(plain(first.master.playback), neutral);
  first.master.playback.speed = .5; assert.deepEqual(plain(second.master.playback), neutral);
  const history = S.copy(first); first.master.playback.pitch = 7; first.master.playback.preservePitch = false;
  assert.deepEqual(plain(history.master.playback), { speed: .5, pitch: 0, preservePitch: true });
  assert.deepEqual(plain(S.copy(history).master.playback), plain(history.master.playback));
});
check('Tolerant normalization clamps finite numbers and safely defaults malformed values without mutating input', () => {
  const input = { speed: -10, pitch: 80, preservePitch: false, unused: true }, before = plain(input);
  assert.deepEqual(plain(S.normalizeMasterPlayback(input)), { speed: .25, pitch: 24, preservePitch: false }); assert.deepEqual(plain(input), before);
  assert.deepEqual(plain(S.normalizeMasterPlayback({ speed: 50, pitch: -80 })), { speed: 2, pitch: -24, preservePitch: true });
  for (const bad of [undefined, null, [], 'wrong', { speed: NaN, pitch: Infinity, preservePitch: 'false' }, { speed: '1.5', pitch: null, preservePitch: 0 }]) assert.deepEqual(plain(S.normalizeMasterPlayback(bad)), neutral);
  const normalized = S.normalize({ master: { playback: { speed: .75, pitch: -3.5, preservePitch: false, unrelated: 'discard' } } });
  assert.deepEqual(plain(normalized.master.playback), { speed: .75, pitch: -3.5, preservePitch: false });
});
check('Complete playback settings including exact endpoints and fractional values round-trip in saved projects', () => {
  for (const playback of [{ speed: .25, pitch: -24, preservePitch: false }, { speed: 2, pitch: 24, preservePitch: true }, { speed: .73125, pitch: 3.125, preservePitch: false }, neutral]) {
    const state = S.defaultState(); state.name = 'Tempo / pitch — 音楽'; state.master.playback = { ...playback }; state.master.level = .42; state.tracks[9].pan = -.31;
    const json = S.serializeProject(state), reopened = S.parseProject(json);
    assert.deepEqual(plain(reopened.master.playback), playback); assert.equal(reopened.master.level, .42); assert.equal(reopened.tracks[9].pan, -.31); assert.equal(reopened.name, state.name);
    assert.equal(S.serializeProject(reopened), json);
  }
});
check('Only missing playback in legacy or unversioned files inherits neutral playback without changing other settings', () => {
  for (const version of ['1.33.9', '1.33.0', '1.32.0', '1.18.0', '0.9.0', null]) {
    const state = S.defaultState(); state.master.level = .37; state.tracks[9].name = 'A saved tenth track';
    const project = envelope(state, version || S.VERSION); if (version === null) delete project.appVersion;
    delete project.state.master.playback; const raw = JSON.stringify(project), restored = S.parseProject(raw);
    assert.deepEqual(plain(restored.master.playback), neutral, String(version)); assert.equal(restored.master.level, .37); assert.equal(restored.tracks[9].name, state.tracks[9].name); assert.equal(JSON.stringify(project), raw);
  }
  const oldEight = envelope(S.defaultState(), '1.31.0'); oldEight.state.tracks.length = 8; oldEight.state.selectedTrack = 7; delete oldEight.state.master.playback; delete oldEight.state.master.mastering;
  const restored = parse(oldEight); assert.equal(restored.tracks.length, 10); assert.equal(restored.selectedTrack, 7); assert.deepEqual(plain(restored.master.playback), neutral);
  const supplied = envelope(S.defaultState(), '1.33.0'); supplied.state.master.playback = { speed: .66, pitch: 2.75, preservePitch: false }; assert.deepEqual(plain(parse(supplied).master.playback), supplied.state.master.playback);
});
check('Current and future project formats reject missing playback and every supplied malformed playback record', () => {
  for (const version of ['1.34.0', '1.34.1', '1.40.0', '2.0.0', 'not-a-version']) { const project = envelope(S.defaultState(), version); delete project.state.master.playback; assert.throws(() => parse(project), /master|playback|bus/i, version); }
  const invalid = [null, [], false, 'wrong', {}, { speed: 1, pitch: 0 }, { speed: 1, pitch: 0, preservePitch: true, quality: 'high' }, { speed: '1', pitch: 0, preservePitch: true }, { speed: .249999, pitch: 0, preservePitch: true }, { speed: 2.000001, pitch: 0, preservePitch: true }, { speed: 1, pitch: -24.00001, preservePitch: true }, { speed: 1, pitch: 24.00001, preservePitch: true }, { speed: 1, pitch: '0', preservePitch: true }, { speed: NaN, pitch: 0, preservePitch: true }, { speed: 1, pitch: Infinity, preservePitch: true }, { speed: 1, pitch: 0, preservePitch: 1 }, { speed: 1, pitch: 0, preservePitch: 'true' }];
  for (const version of ['1.33.0', S.VERSION]) for (const playback of invalid) { const project = envelope(S.defaultState(), version); project.state.master.playback = playback; const original = JSON.stringify(project); assert.throws(() => S.parseProject(original), /playback|speed|pitch/i, String(version) + ' ' + JSON.stringify(playback)); assert.equal(JSON.stringify(project), original); }
});
check('Playback fields stay master-only and cannot be saved as real-time automation targets', () => {
  const state = S.defaultState();
  assert(!S.automationTargets(state.master).some(target => /playback|preservePitch|^speed$|^pitch$/.test(target.target)));
  for (const target of ['playback:speed', 'playback:pitch', 'masterPlayback:speed', 'speed', 'pitch']) { const project = envelope(state); project.state.master.automation = [{ target, enabled: true, interpolation: 'linear', points: [{ beat: 0, value: 1 }] }]; assert.throws(() => parse(project), /automation/i, target); }
  const returned = envelope(state); returned.state.returns[0].playback = { ...neutral }; assert.throws(() => parse(returned), /Return A|routing|settings/i);
});
check('Master playback edits preserve valid frozen recipes and exact original and baked audio through save/open', () => {
  const fixture = frozenFixture(), state = fixture.state, fingerprint = S.freezeFingerprint(state, fixture.trackId);
  for (const playback of [{ speed: .25, pitch: 24, preservePitch: false }, { speed: 2, pitch: -24, preservePitch: true }, neutral]) {
    state.master.playback = { ...playback }; assert.equal(S.freezeFingerprint(state, fixture.trackId), fingerprint); assert(S.freezeValid(state, fixture.trackId));
    const reopened = S.parseProject(S.serializeProject(state)); assert(S.freezeValid(reopened, fixture.trackId)); assert.equal(S.freezeFingerprint(reopened, fixture.trackId), fingerprint); assert.equal(reopened.assets[0].pcm, fixture.sourcePcm); assert.equal(reopened.freezeAssets[0].pcm, fixture.frozenPcm); assert.deepEqual(plain(reopened.master.playback), playback);
  }
  const oldProject = envelope(state, '1.33.0'); delete oldProject.state.master.playback; const migrated = parse(oldProject); assert(S.freezeValid(migrated, fixture.trackId)); assert.deepEqual(plain(migrated.master.playback), neutral);
  const stale = S.copy(state); stale.tracks[8].level = .99; assert(!S.freezeValid(stale, fixture.trackId)); assert.throws(() => S.serializeProject(stale), /stale freeze/i);
});
console.log(passed.length + ' master playback schema groups passed.');
