'use strict';

// Native adapter boundaries. The browser checks exercise real shared sample
// transfers and GALLEY prints; these checks isolate validation and timing so a
// rejected operation cannot quietly reach the engine or alter a source patch.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const local = __dirname;
const shared = fs.existsSync(path.join(local, 'shared', 'pattern-schema.js')) ? path.join(local, 'shared') : path.join(local, '..', 'shared');
const root = path.dirname(local);
const events = [], calls = [], passed = [];
let state, registered, playing = false, renderHook;
class EventFixture { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }
const document = { addEventListener() {}, dispatchEvent(event) { events.push(event); } };
const scope = { Blob, DOMException, TextEncoder, TextDecoder, Math, Number, Map, Set, Promise, Float32Array, Uint8Array, ArrayBuffer, DataView,
  setTimeout, clearTimeout, AbortController, CustomEvent: EventFixture, document,
  btoa: value => Buffer.from(value, 'binary').toString('base64'), atob: value => Buffer.from(value, 'base64').toString('binary') };
scope.window = scope; scope.globalThis = scope; vm.createContext(scope);
const run = file => vm.runInContext(fs.readFileSync(file, 'utf8'), scope, { filename: path.basename(file) });
run(path.join(shared, 'pattern-schema.js'));
for (const name of ['schema.js', 'sequence.js', 'sources.js']) run(path.join(local, name));
const S = scope.MarinadeSchema, P = scope.MusicLabPatternSchema;
const copy = value => JSON.parse(JSON.stringify(value));
state = S.defaultState();
const engine = {
  context: null,
  async init() { calls.push(['init']); this.context ||= { state: 'suspended', async resume() { this.state = 'running'; } }; },
  scheduleNote(request) { calls.push(['note', request]); return request; },
  stopNotes(request) { calls.push(['cancel', request]); return true; },
  followTransport(clock) { calls.push(['clock', clock]); return true; },
  async renderNotes(request) {
    calls.push(['render', request]); if (renderHook) await renderHook(request);
    const frames = Math.round((request.lengthBeats * 60 / request.tempo + request.tailSeconds) * 48000);
    const pcm = new Float32Array(frames * 2); pcm[1] = .25;
    return { pcm, blob: new Blob([new Uint8Array(44)]), sampleRate: 48000, channels: 2, name: 'Rendered snapshot' };
  }
};
scope.MarinadeApp = {
  engine, getState: () => copy(state), getProject: () => JSON.parse(S.serializeProject(state)),
  async loadState(value) { const next = S.parseProject(value); calls.push(['load', copy(next)]); state = next; },
  async setTempo(tempo) { calls.push(['tempo', tempo]); state.tempo = tempo; },
  async play(options) { calls.push(['play', options]); playing = true; },
  stop() { calls.push(['stop']); playing = false; }, panic() { calls.push(['panic']); playing = false; }, isPlaying: () => playing,
  audioExport: { scopes: [{ id: 'pattern', label: 'Current phrase' }], defaultBars: 4, maxBars: 16 },
  get audioImport() { return { maxSeconds: 20, targets: [{ id: 'a', name: 'Source A', occupied: true }, { id: 'b', name: 'Source B', occupied: true }] }; },
  exportAudio: options => { calls.push(['export', options]); return Promise.resolve({ pcm: new Float32Array(4), sampleRate: 48000 }); },
  importAudio: payload => { calls.push(['import-audio', payload]); return Promise.resolve({ target: payload.options.target }); }
};
scope.MusicLabHost = { registerInstrument(adapter) { registered = adapter; }, notifyStateChange() { calls.push(['changed']); } };
run(path.join(local, 'adapters.js'));
const adapter = scope.MusicLabPatternInstrument;
function packet(overrides = {}) {
  return P.normalize({ format: 'musiclab-pattern', version: 1, name: 'Fractional pantry', sourceApp: 'FIXTURE', tempo: 120, swing: .3,
    lengthBeats: 4, meter: [4, 4], seed: 17, tags: ['integration'], voices: [{ id: 'keys', name: 'Keys' }, { id: 'bell', name: 'Bell' }],
    notes: [{ id: 'n1', beat: .25, duration: .6, pitch: 60, velocity: .9, probability: 1, voice: 'keys' },
      { id: 'n2', beat: .375, duration: .5, pitch: 67, velocity: .7, probability: .35, voice: 'bell' },
      { id: 'n3', beat: 1.125, duration: 1.75, pitch: 72, velocity: .6, probability: 1, voice: 'keys' }], ...overrides });
}
async function check(name, callback) { state = S.defaultState(); calls.length = 0; renderHook = undefined; playing = false; await callback(); passed.push(name); }
(async () => {
  await check('Adapter declares polyphony, exact pitched notes, scheduled cancellation and typed audio destinations', async () => {
    assert(adapter && registered); assert.equal(adapter.app, 'marinade'); assert.equal(adapter.notes.polyphonic, true);
    assert.equal(adapter.notes.scheduledCancel, true); assert.deepEqual(copy(adapter.notes.pitchRange), [0, 127]);
    assert.deepEqual(copy(registered.audioImport.targets.map(target => target.id)), ['a', 'b']);
    assert.equal(registered.audioImport.maxSeconds, 20); assert.equal(adapter.latency, 0);
  });
  await check('Incomplete, unknown and unsafe voice maps reject without state or engine mutation', async () => {
    const before = JSON.stringify(state), part = packet();
    for (const voiceMap of [undefined, {}, { keys: 'synth' }, { keys: 'synth', bell: 'wrong' }, { keys: 'synth', bell: 'synth', extra: 'synth' }]) {
      await assert.rejects(adapter.importPattern({ pattern: part, options: { replace: true, voiceMap } }), /Map|Choose|unknown/);
      assert.equal(JSON.stringify(state), before); assert.equal(calls.length, 0);
    }
  });
  await check('Occupied pattern replacement and cancellation are explicit', async () => {
    const before = JSON.stringify(state), part = packet(), voiceMap = { keys: 'synth', bell: 'synth' };
    await assert.rejects(adapter.importPattern({ pattern: part, options: { voiceMap } }), /replacing/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(adapter.importPattern({ pattern: part, signal: controller.signal, options: { voiceMap, replace: true } }), error => error.name === 'AbortError');
    assert.equal(JSON.stringify(state), before); assert.equal(calls.length, 0);
  });
  await check('Imported notes retain fractional timing, durations, seeded probability and all source mappings', async () => {
    const part = packet(), patch = copy(state.synth), samples = copy(state.samples);
    await adapter.importPattern({ pattern: part, options: { replace: true, voiceMap: { keys: 'synth', bell: 'synth' } } });
    assert.deepEqual(copy(state.musicLabPattern.pattern), copy(part)); assert.deepEqual(copy(state.synth), patch); assert.deepEqual(copy(state.samples), samples);
    const exported = adapter.exportPattern(); assert.equal(exported.sourceApp, 'marinade');
    assert.equal(exported.swing, part.swing); assert.deepEqual(copy(exported.notes), part.notes.map(note => ({ ...copy(note), voice: 'synth' })));
    assert(events.some(event => event.type === 'musiclab:patternchange'));
  });
  await check('Native export realizes the sequence once and leaves exact imported notes untouched', async () => {
    await adapter.importPattern({ pattern: packet(), options: { replace: true, voiceMap: { keys: 'synth', bell: 'synth' } } });
    const before = JSON.stringify(state.musicLabPattern), native = adapter.exportPattern({ scope: 'native' });
    assert.equal(native.swing, 0); assert(native.notes.every(note => note.probability === 1 && note.voice === 'synth'));
    assert.equal(JSON.stringify(state.musicLabPattern), before);
    await adapter.clearImportedPattern(); assert(!state.musicLabPattern); assert.equal(await adapter.clearImportedPattern(), false);
  });
  await check('Malformed notes and timestamps never reach the scheduler; valid sources remain independent', async () => {
    await adapter.prepare(); assert.equal(engine.context.state, 'running'); calls.length = 0;
    const valid = { pitch: 60, voice: 'synth', velocity: .7, when: 3.25, durationSeconds: .8, source: 'clip-one' };
    for (const bad of [{ pitch: 60.2 }, { pitch: 128 }, { voice: 'keys' }, { velocity: NaN }, { when: -1 }, { durationSeconds: 0 }, { source: '' }]) {
      assert.throws(() => adapter.scheduleNote({ ...valid, ...bad })); assert.equal(calls.length, 0);
    }
    adapter.scheduleNote(valid); assert.equal(calls[0][1].note, 60); assert.equal(calls[0][1].when, 3.25);
    adapter.cancelNotes({ source: 'clip-one', when: 4 }); assert.deepEqual(copy(calls[1]), ['cancel', { source: 'clip-one', when: 4 }]);
    const before = calls.length; assert.throws(() => adapter.cancelNotes({ source: 'clip-two', when: Infinity })); assert.equal(calls.length, before);
  });
  await check('Shared clock updates do not start a second native sequencer', async () => {
    const clock = { beat: 7.25, tempo: 144, when: 6.1, playing: true, revision: 9 };
    adapter.transport(clock); assert.deepEqual(calls, [['clock', clock]]); assert.equal(playing, false);
  });
  await check('Host tempo uses a runtime-preserving setter and start awaits it', async () => {
    playing = true; await registered.setTempo(156); assert.equal(state.tempo, 156); assert.equal(playing, true);
    assert.deepEqual(calls, [['tempo', 156]]); calls.length = 0;
    await registered.start({ tempo: 174, when: 9, beat: 12 });
    assert.equal(calls[0][0], 'tempo'); assert.equal(calls[1][0], 'init'); assert.equal(calls[2][0], 'play');
    assert.deepEqual(copy(calls[2][1]), { when: 9, beat: 12 });
  });
  await check('Native printing captures custom source audio and requests exact 48 kHz Float32 PCM', async () => {
    const left = new Float32Array(2205), right = new Float32Array(2205);
    for (let i = 0; i < left.length; i++) { left[i] = .3 * Math.sin(2 * Math.PI * 220 * i / 22050); right[i] = .1 * Math.sin(2 * Math.PI * 330 * i / 22050); }
    const ref = scope.MarinadeSources.encodeAudio({ pcm: [left, right], sampleRate: 22050, name: 'Custom stereo ingredient' });
    state.samples[0].ref = ref; state.synth.morph = .73;
    const saved = JSON.parse(S.serializeProject(state));
    const snapshot = { format: 'loom-instrument-state', version: 1, app: 'marinade', state: saved, storage: {} };
    renderHook = async request => { saved.state.synth.morph = .1; assert.equal(request.state.synth.morph, .73); };
    const result = await adapter.renderPattern({ pattern: packet(), state: snapshot, tempo: 120, tailSeconds: 0, voiceMap: { keys: 'synth', bell: 'synth' } });
    const request = calls.find(call => call[0] === 'render')[1]; assert.equal(request.includePCM, true);
    assert.deepEqual(copy(request.state.samples[0].ref), copy(ref)); assert.equal(result.sampleRate, 48000); assert.equal(result.channels, 2);
    assert.equal(result.pcm.length / 2, 96000); assert.equal(result.sourceApp, 'marinade');
    const expected = scope.MarinadeSequence.events({ ...request.state, tempo: 120, musicLabPattern: { pattern: packet(), voiceMap: { keys: 'synth', bell: 'synth' } } }, { startBeat: 0, lengthBeats: 4 });
    assert.deepEqual(copy(request.events), copy(expected)); assert.equal(request.events[0].startBeat, .325);
  });
  await check('Wrong-app snapshots, excessive renders and cancelled jobs reject before native rendering', async () => {
    await assert.rejects(adapter.renderPattern({ pattern: packet(), state: { format: 'loom-instrument-state', version: 1, app: 'proof', state } }), /MARINADE/);
    await assert.rejects(adapter.renderPattern({ pattern: packet({ lengthBeats: 256 }), tempo: 20 }), /120 seconds/);
    const controller = new AbortController(); controller.abort(); await assert.rejects(adapter.renderPattern({ pattern: packet(), signal: controller.signal }), error => error.name === 'AbortError');
    assert(!calls.some(call => call[0] === 'render'));
  });
  await check('Host audio import forwards typed destinations and explicit replacement inside the shared single payload', async () => {
    const pcm = new Float32Array([.1, .2, .3, .4]), controller = new AbortController();
    const payload = { pcm, sampleRate: 48000, name: 'Stock transfer', signal: controller.signal, options: { target: 'b', replace: true, signal: controller.signal } };
    const result = await registered.importAudio(payload); assert.equal(result.target, 'b');
    assert.equal(calls[0][1], payload); assert.equal(calls[0][1].options.replace, true);
  });
  if (fs.existsSync(path.join(root, 'loom', 'schema.js'))) await check('GALLEY registers thirteen native instruments and keeps exactly eight tracks with four inserts', async () => {
    for (const file of ['vocal-catalog.js', 'effects-catalog.js', 'schema.js', 'instrument-host.js']) run(path.join(root, 'loom', file));
    const studio = scope.LoomSchema.defaultState(); assert.equal(studio.tracks.length, 8); assert(studio.tracks.every(track => track.effects.length === 4));
    assert.equal(scope.LoomInstrumentManifest.length, 13); assert(scope.LoomSchema.BUILT_INS.includes('marinade'));
    const native = scope.LoomInstrumentManifest.find(item => item.id === 'marinade'); assert.equal(native.facade, 'MarinadeApp'); assert.equal(native.storageKey, 'marinade-project-v1');
  });
  console.log(JSON.stringify({ passed: passed.length, checks: passed }, null, 2));
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
