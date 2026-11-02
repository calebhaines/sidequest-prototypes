'use strict';
/* Parked channels stay cold through source workflows, SERVICE and master caches.
 * The actual mixer/audio comparisons live in track-disable engine checks.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const q = require('./deluxe-checks.cjs');
const release = q.load(), scope = release.scope, S = release.S;
const copy = value => JSON.parse(JSON.stringify(value));
for (const name of ['master-playback.js', 'note-workflow.js', 'service-ui.js', 'service.js']) {
  Function('window', 'globalThis', fs.readFileSync(path.join(__dirname, name), 'utf8'))(scope, scope);
}
const packet = () => scope.MusicLabPatternSchema.normalize({ format: 'musiclab-pattern', version: 1,
  name: 'Parked notes', sourceApp: 'citrus', kind: 'notes', tempo: 120, swing: 0,
  lengthBeats: 4, meter: [4, 4], voices: [{ id: 'bass', name: 'Bass', pitch: 36 }],
  notes: [{ id: 'held-note', voice: 'bass', beat: 0, duration: 2, pitch: 36, velocity: .7, probability: 1 }], seed: 1, tags: [] });
function fixture() {
  const state = S.defaultState(); state.tempo = 120; state.lengthBars = 8; state.loopEnd = 4;
  const audio = Float32Array.from({ length: 256 }, (_, index) => (index % 31 - 15) / 200);
  const asset = S.encodeAsset({ left: audio, right: audio, sampleRate: 8000, id: 'small-audio', name: 'Loop' });
  state.assets.push(asset);
  state.tracks[0].disabled = true;
  state.tracks[0].instrumentLive = true;
  state.tracks[0].instrument = { id: 'citrus', name: 'CITRUS', snapshot: { format: 'loom-instrument-state', version: 1, app: 'citrus', state: { cutoff: 900 }, storage: {} } };
  state.tracks[0].automation = [{ target: 'level', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: .2 }, { beat: 28, value: .7 }] }];
  state.tracks[0].clips.push(S.noteClip({ id: 'parked-source', name: 'Keep this part', type: 'notes', pattern: packet(),
    voiceMap: { bass: 'bass' }, start: 20, length: 4, sourceOffset: 0, rate: 1, loop: true, gain: 1, fadeIn: 0, fadeOut: 0, transpose: 0 }, 32));
  state.tracks[1].clips.push({ id: 'playing-source', name: 'Playing part', type: 'audio', assetId: asset.id,
    start: 0, length: 4, sourceStart: 0, sourceEnd: asset.duration, sourceOffset: 0,
    rate: 1, reverse: false, loop: true, gain: .7, fadeIn: .01, fadeOut: .02 });
  return state;
}
function workflow(state) {
  let current = state, ensures = 0, opens = 0;
  const instance = Object.create(scope.LoomNoteWorkflow.prototype);
  Object.assign(instance, { getState: () => current, getGeneration: () => 0,
    getLocation: () => ({ track: current.tracks[0], clip: current.tracks[0].clips[0] }),
    ensureInstrument: async () => { ensures++; throw Error('A disabled instrument was opened.'); },
    commit: next => { current = next; }, host: { getPatternAdapter: () => null }, engine: { getMeters: () => ({ beat: 0 }) },
    snap: value => value, render() {}, status() {}, piano: { open: () => { opens++; }, close() {} },
    operation: 0, controller: null, sourceEdit: null });
  return { instance, state: () => current, ensures: () => ensures, opens: () => opens };
}
const passed = [];
async function check(name, test) { await test(); passed.push(name); console.log('PASS', name); }
(async () => {
  await check('Master sound keys and prepared-source caches react to disabling without changing enabled keys', () => {
    let state = fixture(); state.tracks[0].disabled = false;
    const key = scope.LoomMasterPlayback.soundKey(state), missing = copy(state); delete missing.tracks[0].disabled;
    assert.equal(scope.LoomMasterPlayback.soundKey(missing), key);
    state.master.playback = { speed: .5, pitch: 0, preservePitch: true };
    scope.LoomMasterTransform = { normalize: value => ({ speed: 1, pitch: 0, preservePitch: true, ...value }), isNeutral: value => value.speed === 1 && value.pitch === 0 };
    let stops = 0;
    const engine = { setState() {}, stop() { stops++; }, getTransport: () => ({ beat: 0 }), getMeters: () => ({}) };
    const master = scope.LoomMasterPlayback.create({ engine, getState: () => state, getAssets: () => ({}) }).attach();
    master.cache = {}; master.sourceCache = {};
    state = copy(state); state.tracks[0].disabled = true; engine.setState(state);
    assert.equal(master.cache, null); assert.equal(master.sourceCache, null); assert.equal(master.getStatus().phase, 'stale'); assert.equal(stops, 1);
    const disabledKey = scope.LoomMasterPlayback.soundKey(state), cached = {};
    master.sourceCache = cached; master.cache = cached;
    state = copy(state); state.tracks[0].instrument.snapshot.state.cutoff = 1200; state.tracks[0].level = .9;
    assert.equal(scope.LoomMasterPlayback.soundKey(state), disabledKey); engine.setState(state);
    assert.equal(master.sourceCache, cached); assert.equal(master.cache, cached); assert.equal(stops, 1);
    state.tracks[0].disabled = false;
    assert.notEqual(scope.LoomMasterPlayback.soundKey(state), disabledKey);
    engine.setState(state); assert.equal(master.sourceCache, null); assert.equal(master.cache, null); assert.equal(stops, 2);
  });
  await check('Disabled sound workflows reject before loading or rendering while stored-note export editing and restoration stay cold', async () => {
    const f = workflow(fixture()), w = f.instance;
    await assert.rejects(w.prepareTarget({ target: 'track-1' }), /Enable/);
    await assert.rejects(w.print(), /Enable/);
    await assert.rejects(w.exportPattern({ scope: 'instrument' }), /Enable/);
    assert.deepEqual(copy(await w.exportPattern()), copy(packet()));
    await w.editNotes(); assert.equal(f.ensures(), 0); assert.equal(f.opens(), 1);
    const state = fixture(), notes = copy(state.tracks[0].clips[0]);
    state.tracks[0].clips[0] = { ...state.tracks[1].clips[0], id: notes.id, name: notes.name, start: notes.start, length: notes.length,
      origin: S.renderSource({ format: 'loom-render-source', version: 1, instrument: copy(state.tracks[0].instrument),
        pattern: packet(), voiceMap: { bass: 'bass' }, tempo: 120, tailSeconds: 0, sourceClip: notes, renderedAt: 123 }) };
    const restored = workflow(state); await restored.instance.restoreNotes();
    assert.equal(restored.ensures(), 0); assert.equal(restored.state().tracks[0].disabled, true);
    assert.deepEqual(copy(restored.state().tracks[0].clips[0]), notes);
  });
  await check('Importing stored notes on a disabled channel keeps its disabled flag and does not initialize an instrument', async () => {
    const state = fixture(); state.tracks[0].clips = []; state.tracks[0].instrument = null;
    const f = workflow(state);
    await f.instance.importPattern({ pattern: packet(), options: { target: 'track-1', voiceMap: { bass: 'bass' } } });
    assert.equal(f.ensures(), 0); assert.equal(f.state().tracks[0].disabled, true);
    assert.equal(f.state().tracks[0].instrument.id, 'citrus'); assert.equal(f.state().tracks[0].clips.length, 1);
    assert.deepEqual(copy(f.state().tracks[0].clips[0].pattern), copy(packet()));
  });
  await check('Freeze refuses a disabled channel before audio initialization or rendering', async () => {
    let initializations = 0, renders = 0;
    const state = fixture(), freezer = new scope.LoomTrackFreeze({ getState: () => state,
      engine: { init: () => { initializations++; } }, noteRenderer: { prepareNotes: () => { renders++; } }, commit() {} });
    await assert.rejects(freezer.freeze('track-1'), /Enable/);
    assert.equal(initializations, 0); assert.equal(renders, 0); assert.equal(freezer.getStatus().busy, false);
  });
  await check('SERVICE resolves disabled scene cells and held cells to silence and omits their macros and Drop work', () => {
    const state = fixture(), controller = Object.create(scope.LoomServiceController.prototype);
    const mapping = id => ({ trackId: id, target: 'level', min: 0, max: 1.5, baseline: .8, polarity: 'normal' });
    const config = scope.LoomServiceSchema.defaults(); config.macros[0].mappings = [mapping('track-1'), mapping('track-2')]; config.macros[0].value = .75;
    Object.assign(controller, { options: { getState: () => state }, config, prepared: { state: copy(state) },
      activeClips: ['parked-source', 'playing-source'], padHolds: new Map([['drop', { kind: 'drop', trackIds: ['track-1', 'track-2'] }]]) });
    const scene = { id: 's', lengthBeats: 4, slots: state.tracks.map((track, index) => ({ mode: index < 2 ? 'hold' : 'silence' })) };
    const resolved = controller._scenePacket(scene), performance = controller._performance();
    assert.equal(resolved.clips[0], null); assert.equal(resolved.holds[0], false);
    assert.equal(resolved.clips[1].id, 'playing-source'); assert.equal(resolved.holds[1], true);
    assert.equal(performance.drops[0], false); assert.equal(performance.drops[1], true);
    assert.deepEqual(performance.overrides.map(item => item.trackId), ['track-2']);
    state.tracks[0].disabled = false;
    assert.equal(controller._scenePacket(scene).clips[0], null, 'A note source still needs dry preparation.');
    assert.deepEqual(controller._performance().overrides.map(item => item.trackId), ['track-1', 'track-2']);
  });
  await check('SERVICE capture skips unrendered disabled notes and retains parked clips automation settings and arrangement extent', () => {
    const state = fixture(), before = copy(state.tracks[0]), selections = state.tracks.map(track => track.clips[0]?.id || null);
    const take = { lengthBeats: 4, events: [
      { kind: 'scene', beat: 0, sceneId: 's', clips: selections },
      { kind: 'performance', beat: 1, drops: state.tracks.map((_, index) => index === 0), stutterBeats: .25, fill: false, overrides: [{ trackId: 'track-1', target: 'level', value: 1.1 }] },
      { kind: 'performance', beat: 2, drops: Array(10).fill(false), stutterBeats: 0, fill: false, overrides: [] }
    ] };
    const compiled = scope.LoomServiceCapture.compile({ state, take });
    assert.deepEqual(copy(compiled.tracks[0]), before); assert.equal(compiled.lengthBars, 8);
    assert(compiled.tracks[1].clips.length > 0); assert.equal(compiled.tracks[0].clips[0].type, 'notes');
    assert.deepEqual(copy(state.tracks[0]), before);
    state.tracks[1].disabled = true;
    assert.throws(() => scope.LoomServiceCapture.compile({ state, take }), /no audible source clips/);
  });
  await check('SERVICE shows parked cells and locks only their playback-source and Drop controls', () => {
    const state = fixture(), ui = Object.create(scope.LoomServiceUI.prototype), tracks = state.tracks;
    const scene = { id: 's', name: 'Scene', lengthBeats: 4, slots: tracks.map(track => ({ mode: 'clip', clipId: track.clips[0]?.id })) };
    Object.assign(ui, { selectedSceneId: scene.id, padTracks: new Set(['track-1']), padRate: .25 });
    const row = ui.sceneRow(scene, 0, tracks), editor = ui.sceneEditor({ tracks, service: { scenes: [scene] } }), pads = ui.padPanel(tracks);
    assert.match(row, /Off · sources kept/);
    assert.match(editor, /data-service-slot="0"[^>]*disabled/); assert.doesNotMatch(editor, /data-service-slot="1"[^>]*disabled/);
    assert.match(pads, /data-service-pad-track="track-1"[^>]*disabled/); assert.doesNotMatch(pads, /data-service-pad-track="track-2"[^>]*disabled/);
  });
  console.log(passed.length + ' track disable integration groups passed.');
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
