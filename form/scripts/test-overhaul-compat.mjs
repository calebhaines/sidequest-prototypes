/** HOTPLATE's real DSP and portable native/shared pattern boundary.
 * Runs without a browser; test:exchange and test:overhaul-browser cover the
 * actual React facade, recording conversion, Web Audio, and GALLEY host.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { loadDsp } from './dsp-loader.mjs';

const { audio, sequencing, cleanup } = await loadDsp(['audio', 'sequencing']);
after(cleanup);
const plain = value => JSON.parse(JSON.stringify(value));
const close = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} != ${expected}`);
const sharedDirectory = await (async () => {
  for (const candidate of [new URL('../shared/', import.meta.url), new URL('../../shared/', import.meta.url)]) {
    try { await access(new URL('pattern-drums.js', candidate)); return candidate; } catch {}
  }
  throw Error('Missing packaged shared pattern adapters.');
})();
const schemaSource = await readFile(new URL('pattern-schema.js', sharedDirectory), 'utf8');
const adapterSource = await readFile(new URL('pattern-drums.js', sharedDirectory), 'utf8');

function project(length = 16) {
  return {
    name: 'Compatibility service', sounds: audio.buildDefaultKit(),
    steps: Array.from({ length: 8 }, () => Array(length).fill(false)),
    muted: Array(8).fill(false), bpm: 120, swing: 0,
  };
}

function harness(initial = project()) {
  let state = plain(initial), interval = null;
  const scheduled = [], cancelled = [], notifications = [], renders = [];
  const engine = { context: { currentTime: 0, state: 'running' }, stop() {}, cancelNativeNotes: options => cancelled.push(options) };
  const native = {
    engine, getState: () => plain(state), getPatternState: () => plain(state),
    prepare: async () => {}, loadState: next => { state = plain(next); },
    applyMusicLabPattern: overlay => { if (overlay) state.musicLabPattern = plain(overlay); else delete state.musicLabPattern; },
    scheduleNativeNote: (voice, when, options) => scheduled.push({ voice, when, ...options }),
    renderNativeEvents: async (events, options) => { renders.push({ events: plain(events), options }); return audio.renderNativeEvents(state.sounds, events, options); },
    renderNativeSnapshotEvents: async (snapshot, events, options) => { renders.push({ events: plain(events), options }); return audio.renderNativeEvents(snapshot.sounds, events, options); },
  };
  const scope = {
    console, Math, Number, JSON, Map, Set, Object, Array, TextEncoder, DOMException,
    FormApp: native,
    document: { title: 'HOTPLATE', documentElement: { dataset: { musiclabApp: 'form' } },
      addEventListener() {}, dispatchEvent: event => notifications.push(event) },
    CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    setInterval: callback => { interval = callback; return 1; }, clearInterval: () => { interval = null; },
  };
  scope.window = scope;
  vm.createContext(scope);
  vm.runInContext(schemaSource, scope);
  vm.runInContext(adapterSource, scope);
  return { adapter: scope.MusicLabPatternInstrument, schema: scope.MusicLabPatternSchema, native, engine,
    scheduled, cancelled, notifications, renders, getState: () => plain(state),
    tick: time => { engine.context.currentTime = time; interval?.(); } };
}

test('archived FORM patches retain the exact pre-overhaul percussion, FM, wavetable, and granular PCM', () => {
  // Captured from the released 2.0.3 production DSP, not the new implementation.
  const fixtures = [
    ['dry-snap', 4461, '08124ecf8da77a98679944e03bb97505ccca57e81c1084cb96faef54f65d95cb'],
    ['sub-foundation', 9312, '073859e220d2095f88e31bfec5cdbab64c358b1d8395042fc38df56dac0ef11c'],
    ['furnace-kick', 7881, 'a72bde6ba054170cc3e0f94f0632897e6c345daf89a1f93698a21aab4e8dbefa'],
    ['chrome-snare', 4794, '155646e93370efe95bb2d632c3852d3051b60bec586ef597a9380de0fbcde352'],
    ['sand-engine', 2942, 'dcbced4d738b2453e0e7f42b44ef2e16e33d50fa36db6ab7c380715cbbcd50df'],
    ['molecular-clap', 37750, '3b626ddd9bb573dd6b5e8e46434b1e8daf00376ad837f61276b9450604ccb514'],
    ['ice-shards', 38531, 'e48daaeadae1a14b4b475850c93a4c2e761d1642d96ea68c1080abba411eebad'],
  ];
  for (const [id, frames, expected] of fixtures) {
    const sound = audio.PRESETS.find(preset => preset.id === id);
    assert(sound, `Saved preset ID ${id} must remain available`);
    const pcm = audio.renderSound(sound.params, 22050);
    assert.equal(pcm.length, frames, id);
    assert.equal(createHash('sha256').update(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)).digest('hex'), expected, id);
  }
});

test('legacy grids without details keep beat accents, swing, voice IDs, and mute/solo export', () => {
  const p = project(); p.swing = 35; p.steps[0][0] = p.steps[0][1] = p.steps[1][4] = true;
  const h = harness(p), packet = h.adapter.exportPattern();
  assert.equal(packet.sourceApp, 'form'); assert.equal(packet.lengthBeats, 4); assert.equal(packet.swing, 0);
  assert.deepEqual(plain(packet.voices).map(voice => voice.id), Array.from({ length: 8 }, (_, i) => `voice-${i}`));
  assert.deepEqual(plain(packet.notes).map(note => [note.voice, note.beat, note.velocity, note.pitch]),
    [['voice-0', 0, 1, 36], ['voice-0', .3375, .86, 36], ['voice-1', 1, 1, 37]]);
  p.muted[1] = true; p.solo = 0; h.native.loadState(p);
  assert(h.adapter.exportPattern().notes.every(note => note.voice === 'voice-0'));
  assert.equal(h.adapter.exportPattern({ scope: 'voice', voice: 1 }).notes.length, 0);
});

test('portable HOTPLATE notes preserve 32-step timing, swing-aware ratchets, pitch, and velocity', () => {
  const p = project(32); p.swing = 60; p.seed = 0;
  p.steps[0][0] = p.steps[0][3] = p.steps[2][17] = p.steps[4][31] = true;
  p.stepDetails = sequencing.createStepDetails(p.steps);
  Object.assign(p.stepDetails[0][0], { timing: -.3, ratchet: 3, pitch: -12, velocity: .71 });
  Object.assign(p.stepDetails[0][3], { timing: .45, ratchet: 4, pitch: 7, velocity: .28 });
  Object.assign(p.stepDetails[2][17], { timing: -.22, ratchet: 2, pitch: 19, velocity: .9 });
  Object.assign(p.stepDetails[4][31], { timing: .15, ratchet: 4, pitch: -24, velocity: .63 });
  const h = harness(p), packet = h.adapter.exportPattern();
  assert.equal(packet.lengthBeats, 8); assert.equal(packet.seed, 0);
  const expected = [];
  for (let step = 0; step < 32; step++) for (const event of sequencing.eventsForStep(p.steps, p.stepDetails, step, 0, p.bpm, p.swing, p.seed))
    expected.push({ voice: `voice-${event.voice}`, beat: (step * 15 / p.bpm + event.offset) * p.bpm / 60, pitch: 36 + event.voice + event.pitch, velocity: event.velocity });
  const actual = plain(packet.notes).map(({ voice, beat, pitch, velocity }) => ({ voice, beat, pitch, velocity }));
  const sort = values => values.sort((a, b) => a.voice.localeCompare(b.voice) || a.beat - b.beat);
  sort(expected); sort(actual); assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) { assert.equal(actual[i].voice, expected[i].voice); assert.equal(actual[i].pitch, expected[i].pitch); close(actual[i].beat, expected[i].beat, 'portable event onset'); close(actual[i].velocity, expected[i].velocity, 'portable velocity'); }
  assert(packet.notes.every(note => note.duration > 0 && note.beat + note.duration <= packet.lengthBeats + 1e-9));
});

test('portable expansion preserves each hit probability instead of silently baking one random performance', () => {
  const p = project(); p.steps[3][5] = p.steps[6][8] = true;
  p.stepDetails = sequencing.createStepDetails(p.steps);
  Object.assign(p.stepDetails[3][5], { probability: .37, ratchet: 4, velocity: .46 });
  Object.assign(p.stepDetails[6][8], { probability: 0, ratchet: 2, velocity: 0 });
  const packet = harness(p).adapter.exportPattern();
  assert.deepEqual(plain(packet.notes).map(note => note.probability), [.37, .37, .37, .37, 0, 0]);
  assert.deepEqual(plain(packet.notes).map(note => note.velocity), [.46, .46, .46, .46, 0, 0]);
});

test('embedded granular PCM and optional details survive portable JSON without changing rendered sound', () => {
  const p = project(32);
  p.sounds[6] = audio.cloneParams(audio.PRESETS.find(preset => preset.id === 'sand-engine').params);
  const layers = p.sounds[6].architecture.layers;
  layers.forEach((layer, index) => { layer.enabled = index === 0; });
  layers[0].engine = 'granular'; layers[0].granular.source = 'sample';
  layers[0].granular.sample = { name: 'Legacy grain asset', sampleRate: 22050, data: Array.from({ length: 2205 }, (_, i) => Number((Math.sin(i * .137) * .31).toFixed(5))) };
  p.steps[6][30] = true; p.stepDetails = sequencing.createStepDetails(p.steps);
  Object.assign(p.stepDetails[6][30], { probability: .43, velocity: .23, timing: -.19, ratchet: 3, pitch: -7 });
  const restored = plain(p); restored.sounds = restored.sounds.map(audio.sanitizeParams);
  assert.deepEqual(restored.stepDetails, p.stepDetails);
  assert.deepEqual(restored.sounds[6].architecture.layers[0].granular.sample, layers[0].granular.sample);
  assert.deepEqual(audio.renderSound(restored.sounds[6], 22050), audio.renderSound(p.sounds[6], 22050));
  assert(audio.renderSound(restored.sounds[6], 22050).some(value => Math.abs(value) > .005));
});

function received(h) {
  return h.schema.normalize({ format: 'musiclab-pattern', version: 1, name: 'An exact received part', sourceApp: 'batter', kind: 'drums', tempo: 137,
    lengthBeats: 4, meter: [4, 4], swing: .6, seed: 0,
    voices: [{ id: 'kick-from-elsewhere', name: 'Source kick', pitch: 36 }, { id: 'tin-from-elsewhere', name: 'Source tin', pitch: 39 }],
    // Deliberately unsorted. Swing delays the on-grid quarter-sixteenth hit
    // past the nearby off-grid note, exercising actual-time scheduling order.
    notes: [
      { id: 'late', voice: 'tin-from-elsewhere', beat: 3.713, duration: .087, pitch: 49, velocity: .31, probability: .63 },
      { id: 'swayed', voice: 'kick-from-elsewhere', beat: .25, duration: .031, pitch: 32, velocity: .79, probability: 1 },
      { id: 'early-off-grid', voice: 'tin-from-elsewhere', beat: .31, duration: .046, pitch: 40, velocity: .2, probability: .51 },
      { id: 'opening', voice: 'kick-from-elsewhere', beat: 0, duration: .19, pitch: 36, velocity: .92, probability: 1 },
      { id: 'unplayed', voice: 'kick-from-elsewhere', beat: 2, duration: .04, pitch: 39, velocity: .55, probability: 0 },
    ], tags: ['compatibility'] });
}
const voiceMap = { 'kick-from-elsewhere': 'voice-0', 'tin-from-elsewhere': 'voice-3' };

test('received parts remain lossless through import, JSON snapshots, sound edits, and explicit native restoration', async () => {
  const h = harness(), packet = received(h), before = h.getState();
  await h.adapter.importPattern({ pattern: packet, options: { target: 'current', voiceMap, replace: true } });
  assert.deepEqual(h.getState().musicLabPattern, { pattern: plain(packet), voiceMap });
  assert.deepEqual(h.getState().steps, before.steps);
  const changed = h.getState(); changed.sounds[0].tone.frequency *= 1.13; changed.muted[3] = true;
  h.native.loadState(plain(changed));
  assert.deepEqual(plain(h.adapter.getImportedPattern()), plain(packet));
  const exported = h.adapter.exportPattern();
  assert.equal(exported.notes.length, packet.notes.length);
  for (const note of packet.notes) assert.deepEqual(plain(exported.notes.find(item => item.id === note.id)), { ...plain(note), voice: voiceMap[note.voice] });
  h.adapter.clearImportedPattern(); assert.equal(h.getState().musicLabPattern, undefined);
  assert.deepEqual(h.getState().steps, before.steps); assert.equal(h.adapter.exportPattern().notes.length, 0);
});

test('standalone exact received playback and repeated audio exports make identical probability and timing decisions', async () => {
  const h = harness(), packet = received(h);
  await h.adapter.importPattern({ pattern: packet, options: { voiceMap, replace: true } });
  const expected = plain(h.adapter.getImportedPatternEvents({ repetitions: 4 }));
  h.adapter.startPattern();
  const end = expected.durationSeconds;
  for (let time = .01; time < end - .055; time += .01) h.tick(time);
  h.adapter.stopPattern();
  // Stop before the next cycle's scheduling horizon enters loop five.
  const played = h.scheduled.filter(event => event.when - .055 < end - 1e-9);
  assert.equal(played.length, expected.events.length);
  expected.events.forEach((event, index) => {
    const actual = played[index]; assert.equal(actual.voice, event.voice); assert.equal(actual.pitch, event.pitch); close(actual.velocity, event.velocity, 'received velocity');
    close(actual.when - .055, event.at, 'received scheduled timestamp'); close(actual.duration, event.duration, 'received duration');
  });
  assert.equal(expected.events.some(event => event.at === 1), false, 'probability zero must never sound');
  assert.deepEqual(plain(h.adapter.getImportedPattern()), plain(packet));
});

test('received playback/export mute and solo do not remove notes or change other voices probability rolls', async () => {
  const p = project(), h = harness(p), packet = received(h);
  await h.adapter.importPattern({ pattern: packet, options: { voiceMap, replace: true } });
  const all = plain(h.adapter.getImportedPatternEvents({ repetitions: 4 }));
  const muted = h.getState(); muted.muted[3] = true; h.native.loadState(muted);
  assert.deepEqual(plain(h.adapter.getImportedPatternEvents({ repetitions: 4 })).events, all.events.filter(event => event.voice !== 3));
  muted.muted[3] = false; muted.solo = 3; h.native.loadState(muted);
  assert.deepEqual(plain(h.adapter.getImportedPatternEvents({ repetitions: 4 })).events, all.events.filter(event => event.voice === 3));
  assert.deepEqual(plain(h.adapter.getImportedPattern()), plain(packet));
  assert.equal(h.adapter.exportPattern().notes.length, packet.notes.length);
});

test('GALLEY scheduling uses native pitched voices and preserves independent note cancellation', async () => {
  const h = harness(); await h.adapter.prepare();
  h.adapter.scheduleNote({ voice: 'voice-2', pitch: 50, when: 1.25, durationSeconds: .14, velocity: .27, source: 'loom-live:track-2:new' });
  assert.deepEqual(h.scheduled[0], { voice: 2, when: 1.25, velocity: .27, pitch: 12, duration: .14, tempo: 120, source: 'loom-live:track-2:new' });
  h.adapter.cancelNotes({ source: 'loom-live:track-2:old', from: 2, future: true });
  assert.deepEqual(h.cancelled[0], { source: 'loom-live:track-2:old', from: 2, future: true });
  for (const patch of [{ voice: 'unknown' }, { pitch: 120 }, { velocity: NaN }, { when: Infinity }, { durationSeconds: 0 }])
    assert.throws(() => h.adapter.scheduleNote({ voice: 'voice-2', pitch: 38, when: 1.4, durationSeconds: .1, velocity: .5, ...patch }));
  assert.equal(h.scheduled.length, 1);
});

test('GALLEY clip render uses the exact received event set and the supplied sound snapshot', async () => {
  const h = harness(), packet = received(h);
  await h.adapter.importPattern({ pattern: packet, options: { voiceMap, replace: true } });
  const snapshot = h.getState(); snapshot.sounds[0].mix.pan = -1; snapshot.sounds[3].mix.pan = 1;
  const expected = h.adapter.getImportedPatternEvents({ state: snapshot, tempo: 144 }).events;
  const result = await h.adapter.renderPattern({ pattern: packet, state: { project: snapshot }, tempo: 144, tailSeconds: .08 });
  assert.deepEqual(h.renders[0].events, plain(expected));
  const direct = await audio.renderNativeEvents(snapshot.sounds, plain(expected), { durationSeconds: 4 * 60 / 144, tailSeconds: .08 });
  assert.deepEqual(result.pcm, direct.pcm); assert.equal(result.sampleRate, 48000); assert.equal(result.sourceApp, 'form');
  assert(result.pcm.every(Number.isFinite)); assert(result.pcm.some(value => Math.abs(value) > .01));
});

test('exact standalone audio renders selected rates, tails, transposition, and stereo placement', () => {
  const sounds = audio.buildDefaultKit(); sounds[0].mix.pan = -1;
  const events = [{ voice: 0, at: .21, duration: .1, velocity: .61, pitch: -12 }];
  for (const sampleRate of [22050, 44100, 48000, 96000]) {
    const [left, right] = audio.renderExactPatternEvents(sounds, events, { sampleRate, durationSeconds: .6, tailSeconds: .17, master: 1 });
    assert.equal(left.length, Math.ceil(.77 * sampleRate)); assert.equal(right.length, left.length);
    assert(left.subarray(0, Math.round(.21 * sampleRate)).every(value => value === 0));
    assert(right.every(value => value === 0), 'hard-left voice stays out of right channel');
    assert(left.some(value => Math.abs(value) > .005)); assert(left.every(Number.isFinite));
    const repeated = audio.renderExactPatternEvents(sounds, events, { sampleRate, durationSeconds: .6, tailSeconds: .17, master: 1 });
    assert.deepEqual(left, repeated[0]);
  }
});

test('invalid mappings, replacement, snapshot bounds, and cancelled transfers preserve the current project', async () => {
  const h = harness(), packet = received(h), before = h.getState();
  for (const map of [{}, { ...voiceMap, 'unknown-source': 'voice-1' }, { ...voiceMap, 'tin-from-elsewhere': 'voice-8' }])
    await assert.rejects(h.adapter.importPattern({ pattern: packet, options: { voiceMap: map, replace: true } }));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(h.adapter.importPattern({ pattern: packet, options: { voiceMap, replace: true }, signal: controller.signal }), { name: 'AbortError' });
  assert.deepEqual(h.getState(), before);
  await h.adapter.importPattern({ pattern: packet, options: { voiceMap, replace: true } });
  const imported = h.getState();
  await assert.rejects(h.adapter.importPattern({ pattern: packet, options: { voiceMap } }));
  for (const options of [{ tempo: NaN }, { tempo: 0 }, { repetitions: 0 }, { repetitions: 5 }, { repetitions: 1.5 }]) assert.throws(() => h.adapter.getImportedPatternEvents(options));
  await assert.rejects(h.adapter.renderPattern({ pattern: packet, signal: controller.signal }), { name: 'AbortError' });
  assert.deepEqual(h.getState(), imported);
});
