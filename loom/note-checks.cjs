'use strict';
// Regression checks for immutable native rendering, musical timing and reversible prints.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const frames = new Set(), calls = [], hosts = [];
let badAudio = false, deferredRender = null, parentCloses = 0;
const parentContext = { state: 'running', destination: {}, createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }), close() { parentCloses++; return Promise.resolve(); } };
class FixtureHost {
  constructor(options) { this.options = options; this.disposed = false; hosts.push(this); }
  async load(id, instrument, frame) { this.instrument = instrument; this.id = id; this.frame = frame; }
  getPatternAdapter() { return { notes: { voices: [{ id: 'keys', name: 'Keyboard' }] }, renderPattern() {} }; }
  capabilities() { return { notes: true }; }
  async renderPattern(id, request) {
    calls.push({ id, request });
    if (deferredRender) await deferredRender(request);
    if (this.disposed || request.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const sampleRate = 8000, duration = request.pattern.lengthBeats * 60 / request.tempo + request.tailSeconds;
    const pcm = new Float32Array(Math.round(duration * sampleRate) * 2);
    const pitch = request.pattern.notes[0]?.pitch || 60, frequency = 440 * 2 ** ((pitch - 69) / 12), gain = request.state.gain || .2;
    for (let i = 0; i < pcm.length / 2; i++) { pcm[i * 2] = gain * Math.sin(2 * Math.PI * frequency * i / sampleRate); pcm[i * 2 + 1] = -pcm[i * 2]; }
    if (badAudio) pcm[17] = NaN;
    return { pcm, sampleRate, name: request.pattern.name };
  }
  dispose() { this.disposed = true; }
}
const document = { querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; }, createElement() { const frame = { style: {}, setAttribute() {}, remove() { frames.delete(this); } }; return frame; }, body: { append(frame) { frames.add(frame); } } };
const scope = { Blob, DOMException, TextEncoder, Math, Number, Map, Set, Promise, Float32Array, setTimeout, crypto: webcrypto, document,
  btoa: value => Buffer.from(value, 'binary').toString('base64'), atob: value => Buffer.from(value, 'base64').toString('binary'), LoomInstrumentHost: FixtureHost };
scope.window = scope;
vm.createContext(scope);
const patternSchemaPath = fs.existsSync(path.join(__dirname, 'shared', 'pattern-schema.js')) ? path.join(__dirname, 'shared', 'pattern-schema.js') : path.join(__dirname, '..', 'shared', 'pattern-schema.js');
vm.runInContext(fs.readFileSync(patternSchemaPath, 'utf8'), scope, { filename: 'pattern-schema.js' });
for (const file of ['vocal-catalog.js', 'effects-catalog.js', 'schema.js', 'note-renderer.js', 'note-workflow.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), scope, { filename: file });
const S = scope.LoomSchema, Renderer = scope.LoomNoteRenderer;
function packet() { return { format: 'musiclab-pattern', version: 1, name: 'A little staircase', sourceApp: 'fixture', tempo: 120, swing: 0, meter: [4, 4], lengthBeats: 4, voices: [{ id: 'melody', name: 'Melody' }], notes: [{ id: 'one', beat: 0, duration: 1, pitch: 60, velocity: .8, voice: 'melody', probability: 1 }], seed: 7, tags: [] }; }
function instrument() { return { id: 'fable', name: 'FABLE', snapshot: { format: 'loom-instrument-state', version: 1, app: 'fable', state: { gain: .2 }, storage: {} } }; }
function note(id = 'notes') { return { id, name: 'Staircase', type: 'notes', pattern: packet(), voiceMap: { melody: 'keys' }, start: 0, length: 4, sourceOffset: 0, rate: 1, loop: false, gain: .7, fadeIn: .1, fadeOut: .3, transpose: 0 }; }
function session() { const s = S.defaultState(); s.tempo = 120; s.tracks[0].instrument = instrument(); s.tracks[0].clips.push(note()); return s; }
function renderer(options) { return new Renderer({ context: () => parentContext, ...options }); }
const passed = [];
async function check(name, run) { await run(); assert.equal(frames.size, 0, name + ' leaked an instrument frame'); passed.push(name); }
(async () => {
  await check('Native pattern provenance selects its original instrument on empty tracks without replacing assigned instruments', async () => {
    const fixture = (assigned = null) => {
      let current = S.defaultState(); current.tracks[0].instrument = assigned;
      const workflow = new scope.LoomNoteWorkflow({
        getState: () => current, getLocation: () => null, getGeneration: () => 0,
        commit: next => { current = next; }, ensureInstrument: async () => true,
        host: { getPatternAdapter: () => ({ notes: { voices: [{ id: 'bass', name: 'Bass' }] } }), command: async () => true },
        engine: { getMeters: () => ({ beat: 0 }) }, snap: value => value,
        changed() {}, remember() {}, status() {}
      });
      return { workflow, state: () => current };
    };
    for (const [sourceApp, expected] of [['ROUX', 'roux'], ['roux', 'roux'], [' GRAIN ', 'grain'], ['grain', 'grain']]) {
      const ready = fixture(); await ready.workflow.prepareTarget({ target: 'track-1', pattern: { sourceApp } });
      assert.equal(ready.state().tracks[0].instrument.id, expected);
      const received = fixture(), part = { ...packet(), sourceApp };
      await received.workflow.importPattern({ pattern: part, options: { target: 'track-1', voiceMap: { melody: 'bass' } } });
      assert.equal(received.state().tracks[0].instrument.id, expected);
      assert.equal(received.state().tracks[0].clips[0].pattern.sourceApp, sourceApp);
      assert.equal(received.state().tracks.length, 8); assert(received.state().tracks.every(track => track.effects.length === 4));
    }
    const assigned = fixture({ id: 'roux', name: 'ROUX' });
    await assigned.workflow.prepareTarget({ target: 'track-1', pattern: { sourceApp: 'GRAIN' } });
    await assigned.workflow.importPattern({ pattern: { ...packet(), sourceApp: 'GRAIN' }, options: { target: 'track-1', voiceMap: { melody: 'bass' } } });
    assert.equal(assigned.state().tracks[0].instrument.id, 'roux');
    for (const sourceApp of [null, {}, 'unknown-app']) {
      const unknown = fixture(); await unknown.workflow.prepareTarget({ target: 'track-1', pattern: { sourceApp } });
      assert.equal(unknown.state().tracks[0].instrument.id, 'fable');
    }
  });
  await check('Identical pattern sources render once and retain eight tracks / four inserts', async () => {
    const state = session(), before = JSON.stringify(state), next = note('second'); next.start = 4; state.tracks[0].clips.push(next);
    const source = JSON.stringify(state), r = renderer(), previous = calls.length, result = await r.prepareNotes(state, {});
    assert.equal(calls.length - previous, 1); assert.equal(result.generatedIds.length, 1); assert.equal(result.state.tracks.length, 8); assert(result.state.tracks.every(t => t.effects.length === 4));
    assert.equal(result.state.tracks[0].clips[0].assetId, result.state.tracks[0].clips[1].assetId); assert.equal(JSON.stringify(state), source); assert.notEqual(before, source); await r.dispose();
  });
  await check('Tempo scaling changes musical time while transposition remains explicit', async () => {
    const state = session(), c = state.tracks[0].clips[0]; c.rate = 2; c.transpose = 12; c.sourceOffset = 1;
    const r = renderer(), result = await r.print(state, 'track-1', c.id), request = calls.at(-1).request;
    assert.equal(request.tempo, 240); assert.equal(request.pattern.notes[0].pitch, 72); assert.equal(request.pattern.notes[0].voice, 'keys'); assert.equal(result.asset.duration, 1);
    assert.equal(result.clip.rate, 1); assert.equal(result.clip.sourceOffset, .25); assert.equal(result.origin.sourceClip.rate, 2); assert.equal(result.origin.sourceClip.transpose, 12); assert.equal(result.origin.tempo, 120); await r.dispose();
  });
  await check('Source capture precedes every asynchronous native operation', async () => {
    const state = session(), r = renderer(); const promise = r.print(state, 'track-1', 'notes'); state.tracks[0].instrument.snapshot.state.gain = .9; state.tracks[0].clips[0].pattern.notes[0].pitch = 90;
    const result = await promise; assert.equal(result.origin.instrument.snapshot.state.gain, .2); assert.equal(result.origin.pattern.notes[0].pitch, 60); assert.equal(calls.at(-1).request.state.gain, .2); await r.dispose();
  });
  await check('Loop sources fold native release tails into one bounded musical cycle', async () => {
    const state = session(); state.tracks[0].clips[0].loop = true; state.tracks[0].clips[0].length = 64;
    const r = renderer(), result = await r.prepareNotes(state, {}, { tailSeconds: 1 }); const c = result.state.tracks[0].clips[0], audio = result.assets[c.assetId];
    assert.equal(audio.left.length, 16000); assert.equal(c.sourceEnd, 2); assert.equal(c.length, 64); assert.equal(c.loop, true); assert(audio.left.every(Number.isFinite)); await r.dispose();
  });
  await check('Range and stem preparation leave unrelated audio and automation unchanged', async () => {
    const state = session(), signal = new Float32Array(8000).fill(.1), asset = S.encodeAsset({ left: signal, sampleRate: 8000, name: 'Existing' }); state.assets = [asset];
    state.tracks[0].automation = [{ target: 'level', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: .1 }, { beat: 8, value: .9 }] }];
    state.tracks[1].instrument = instrument(); state.tracks[1].clips = [note('other')]; const audio = S.decodeAsset(asset), r = renderer();
    const result = await r.prepareNotes(state, { [asset.id]: audio }, { trackId: 'track-1', startBeat: 0, endBeat: 4 }); assert.equal(result.assets[asset.id], audio); assert.equal(result.state.tracks[1].clips.length, 0); assert.equal(JSON.stringify(result.state.tracks[0].automation), JSON.stringify(state.tracks[0].automation)); await r.dispose();
  });
  await check('Print stores the complete native patch and editable notes without baking inserts', async () => {
    const state = session(); state.tracks[0].effects[0] = { type: 'cinder', params: { arbitrary: 1 } }; const before = JSON.stringify(state), r = renderer(), result = await r.print(state, 'track-1', 'notes');
    assert.equal(result.origin.format, 'loom-render-source'); assert.equal(result.origin.version, 1); assert.equal(result.origin.sourceClip.type, 'notes'); assert.equal(result.origin.sourceClip.origin, undefined); assert.equal(JSON.stringify(state), before); assert.equal(calls.at(-1).request.effects, undefined); assert.equal(result.audio.left.length, result.asset.frames); await r.dispose();
  });
  await check('Updating a shorter pattern keeps all existing audio geometry and mix controls', async () => {
    const state = session(), r = renderer(), initial = await r.print(state, 'track-1', 'notes'); state.assets.push(initial.asset); const old = { ...initial.clip, start: 5, length: 7, sourceStart: .2, sourceEnd: 1.9, sourceOffset: .3, rate: .8, reverse: true, gain: .4, fadeIn: .2, fadeOut: .8 }; state.tracks[0].clips = [old];
    const smaller = packet(); smaller.lengthBeats = 2; const original = JSON.stringify(state), result = await r.update(state, 'track-1', old.id, { pattern: smaller });
    for (const key of ['id', 'name', 'start', 'length', 'sourceStart', 'sourceEnd', 'sourceOffset', 'rate', 'reverse', 'loop', 'gain', 'fadeIn', 'fadeOut']) assert.equal(result.clip[key], old[key], key);
    assert(result.asset.duration >= 1.9); assert.notEqual(result.asset.id, old.assetId); assert.equal(result.origin.pattern.lengthBeats, 2); assert.equal(JSON.stringify(state), original); await r.dispose();
  });
  await check('Already cancelled and mid-render requests leave no frame or source cache', async () => {
    const state = session(), r = renderer(), first = new AbortController(); first.abort(); await assert.rejects(r.print(state, 'track-1', 'notes', { signal: first.signal }), { name: 'AbortError' });
    const controller = new AbortController(); deferredRender = async () => { controller.abort(); await new Promise(resolve => setTimeout(resolve, 0)); }; await assert.rejects(r.print(state, 'track-1', 'notes', { signal: controller.signal }), { name: 'AbortError' }); deferredRender = null; assert.equal(r.cache.size, 0); assert.equal(r.operations.size, 0); await r.dispose();
  });
  await check('Long patterns and incompatible voice mappings fail clearly without mutation', async () => {
    const state = session(), r = renderer(); state.tempo = 40; state.tracks[0].clips[0].pattern.lengthBeats = 100; const before = JSON.stringify(state);
    await assert.rejects(r.print(state, 'track-1', 'notes'), /120 seconds.*Split/i); assert.equal(JSON.stringify(state), before);
    state.tracks[0].clips[0].pattern.lengthBeats = 4; state.tracks[0].clips[0].voiceMap = { melody: 'missing' }; await assert.rejects(r.print(state, 'track-1', 'notes'), /Map.*Melody/); await r.dispose();
  });
  await check('Non-finite native audio and decoded budget excess cannot enter a project', async () => {
    const state = session(), r = renderer(); badAudio = true; await assert.rejects(r.print(state, 'track-1', 'notes'), /non-finite/); badAudio = false; assert.equal(r.cache.size, 0); await r.dispose();
    const small = renderer({ maxBytes: 1024 }); await assert.rejects(small.print(state, 'track-1', 'notes'), /64 MiB limit/); await small.dispose();
  });
  await check('Stored sources update from their original patch unless explicitly replaced', async () => {
    const state = session(), r = renderer(), initial = await r.print(state, 'track-1', 'notes'); state.assets = [initial.asset]; state.tracks[0].clips = [initial.clip]; state.tracks[0].instrument.snapshot.state.gain = .9;
    const result = await r.update(state, 'track-1', initial.clip.id); assert.equal(result.origin.instrument.snapshot.state.gain, .2);
    const changed = await r.update(state, 'track-1', initial.clip.id, { instrument: state.tracks[0].instrument }); assert.equal(changed.origin.instrument.snapshot.state.gain, .9); await r.dispose();
  });
  assert.equal(parentCloses, 0, 'Rendering closed the user’s audio context'); assert(hosts.every(host => host.disposed));
  process.stdout.write(JSON.stringify({ passed: passed.length, checks: passed, nativeSourceCalls: calls.length, parentContextCloses: parentCloses }, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
