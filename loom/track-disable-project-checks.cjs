'use strict';
const assert = require('node:assert/strict');
const { load } = require('./performance-2026-checks.cjs');
const { S, scope } = load(), copy = value => JSON.parse(JSON.stringify(value));
let groups = 0;
function check(name, run) { run(); groups++; console.log('PASS ' + name); }

check('Older projects inherit enabled tracks without changing their musical data', () => {
  const state = S.defaultState(), old = JSON.parse(S.serializeProject(state));
  old.appVersion = '1.35.0'; old.state.tracks.forEach(track => delete track.disabled);
  const parsed = S.parseProject(JSON.stringify(old));
  assert(parsed.tracks.every(track => track.disabled === false));
  assert.deepEqual(parsed, state);
});

check('Save/Open retains parked recordings, note articulation, patch and processing', () => {
  const state = S.defaultState(), track = state.tracks[0];
  const audio = Float32Array.from({ length: 256 }, (_, i) => Math.sin(i * .11) * .1);
  const asset = S.encodeAsset({ left: audio, right: audio, sampleRate: 8000, id: 'parked-audio', name: 'Kept recording' });
  state.assets.push(asset);
  track.disabled = true; track.armed = true; track.solo = true; track.instrumentLive = true;
  track.instrument = { id: 'citrus', name: 'CITRUS', snapshot: { format: 'loom-instrument-state', version: 1, app: 'citrus', state: { synth: { cutoff: 1234, resonance: .731 }, patterns: [{ name: 'Kept part' }] }, storage: {} } };
  track.eq.low = 3; track.eq.highMidFreq = 3500; track.sends = [.3, .1]; track.sendPre = [true, false];
  const effect = scope.LoomEffectsCatalog.find(item => item.id === 'sunday'); assert(effect);
  track.effects[0] = { type: effect.id, params: copy(effect.defaults) };
  track.automation = [{ target: 'level', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: .2 }, { beat: 4, value: .9 }] }];
  const pattern = scope.MusicLabPatternSchema.normalize({ format: 'musiclab-pattern', version: 1, name: 'Kept acid', sourceApp: 'citrus', kind: 'notes', tempo: 120, lengthBeats: 4, voices: [{ id: 'bass', name: 'Bass' }], notes: [{ id: 'slide', voice: 'bass', beat: .125, duration: .75, pitch: 36, velocity: .7, accent: true, slide: true }] });
  track.clips.push(S.noteClip({ id: 'parked-notes', name: pattern.name, pattern, type: 'notes', start: 0, length: 4 }, state.lengthBars * 4));
  track.clips.push({ id: 'parked-recording', name: asset.name, type: 'audio', assetId: asset.id, start: 4, length: 1, sourceStart: 0, sourceEnd: asset.duration, sourceOffset: 0, rate: 1, reverse: false, loop: true, gain: 1, fadeIn: 0, fadeOut: 0 });
  const normalized = S.normalize(state), parsed = S.parseProject(S.serializeProject(normalized));
  assert.deepEqual(parsed, normalized);
  const before = copy(parsed.tracks[0]); parsed.tracks[0].disabled = false; before.disabled = false;
  assert.deepEqual(S.normalize(parsed).tracks[0], before);
});

check('Project power values reject strings, numbers and null rather than silently enabling', () => {
  for (const value of ['false', 'true', 0, 1, null, {}]) {
    const project = JSON.parse(S.serializeProject(S.defaultState())); project.state.tracks[0].disabled = value;
    assert.throws(() => S.parseProject(JSON.stringify(project)), /power setting/);
  }
});

check('Powering a frozen track off preserves its valid cache and editable source', () => {
  const state = S.defaultState(); state.lengthBars = 1; state.tempo = 120; state.loopEnd = 4;
  const track = state.tracks[0], sampleRate = 8000, frames = 16000;
  const asset = S.encodeFreezeAsset({ left: new Float32Array(frames), sampleRate, id: 'parked-freeze', name: 'Frozen recipe' });
  state.freezeAssets = [asset];
  track.freeze = { version: 1, sampleRate, tempo: 120, lengthBeats: 4, bodyFrames: frames, totalFrames: frames, tailFrames: 0, fingerprint: S.freezeFingerprint(state, track.id), chunks: [{ startFrame: 0, frames, main: asset.id, sendA: null, sendB: null }] };
  const fingerprint = track.freeze.fingerprint;
  track.disabled = true; assert.equal(S.freezeFingerprint(state, track.id), fingerprint); assert.equal(S.freezeValid(state, track.id), true);
  const parsed = S.parseProject(S.serializeProject(state)); assert.equal(parsed.tracks[0].disabled, true); assert.equal(S.freezeValid(parsed, track.id), true);
  parsed.tracks[0].disabled = false; assert.equal(S.freezeFingerprint(parsed, track.id), fingerprint); assert.equal(S.freezeValid(parsed, track.id), true);
  parsed.tracks[0].eq.low = 4; assert.equal(S.freezeValid(parsed, track.id), false);
});

console.log(groups + ' track power project groups passed.');
