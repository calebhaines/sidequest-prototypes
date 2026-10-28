'use strict';
// Cross-instrument contracts: portable strike locks, complete sequence hooks,
// native scheduling/rendering, and GALLEY's finite versus looping Live sources.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..'), plain = value => JSON.parse(JSON.stringify(value)), checks = [];
const packet = () => ({ format: 'musiclab-pattern', version: 1, name: 'Locks fixture', sourceApp: 'grain', kind: 'drums', tempo: 120, swing: 0, lengthBeats: 4, meter: [4, 4], voices: [{ id: 'voice-0', name: 'Voice 1', pitch: 36 }], notes: [{ id: 'one', pitch: 36, beat: 0, duration: .25, velocity: .8, voice: 'voice-0', probability: 1 }], seed: 9, tags: [] });
function realm(extra = {}) {
  const scope = { console, Math, Number, JSON, Map, Set, WeakMap, TextEncoder, TextDecoder, DOMException, Float32Array, setTimeout, clearTimeout,
    setInterval() { return 1; }, clearInterval() {},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    document: { documentElement: { dataset: {} }, title: '', addEventListener() {}, dispatchEvent() {} }, ...extra };
  scope.window = scope; vm.createContext(scope); return scope;
}
function load(scope, file) {
  const canonical = path.join(root, file), archive = file.startsWith('loom/') ? path.join(root, file.slice(5)) : canonical;
  vm.runInContext(fs.readFileSync(fs.existsSync(canonical) ? canonical : archive, 'utf8'), scope, { filename: file });
}
const schemaRealm = realm(); load(schemaRealm, 'shared/pattern-schema.js'); const S = schemaRealm.MusicLabPatternSchema;
async function check(name, test) { await test(); checks.push(name); }
function fixture(id, withHook = true) {
  let state = id === 'form'
    ? { name: 'Native fixture', tempo: 120, swing: 0, sounds: Array.from({ length: 8 }, (_, i) => ({ name: 'Voice ' + (i + 1) })), steps: Array.from({ length: 8 }, () => Array(16).fill(false)), muted: Array(8).fill(false), solo: null }
    : { name: 'Native fixture', bpm: 120, swing: 0, stepCount: 16, tracks: Array.from({ length: 8 }, (_, i) => ({ name: 'Voice ' + (i + 1), steps: Array(16).fill(0), mute: false, solo: false })) };
  const scheduled = [], renders = [], requests = [], context = { currentTime: 10, state: 'running' };
  const engine = { context, init: async () => {}, start() {}, stop() {}, cancelNativeNotes() {},
    scheduleNativeNote(voice, when, options) { scheduled.push({ voice, when, options }); },
    async renderNativeEvents(snapshot, events, options) { renders.push({ snapshot, events, options }); return { pcm: new Float32Array(16), sampleRate: 48000 }; } };
  const app = { engine, sequenceLoop: true, getState: () => plain(state), loadState(next) { state = plain(next); },
    scheduleNativeNote(voice, when, options) { return engine.scheduleNativeNote(voice, when, options); },
    async renderNativeEvents(events, options) { return engine.renderNativeEvents(plain(state), events, options); },
    async renderNativeSnapshotEvents(snapshot, events, options) { return engine.renderNativeEvents(snapshot, events, options); } };
  let exported = packet(); exported.lengthBeats = 12; exported.notes[0].locks = { cutoff: 680, decay: .13 };
  exported.notes.push({ ...exported.notes[0], id: 'second-bank', beat: 8, locks: { cutoff: 4200, pan: .35 } });
  if (withHook) app.getSequencerPattern = options => { requests.push({ ...options }); return plain(exported); };
  const name = { grain: 'GrainApp', tine: 'TineApp', form: 'FormApp' }[id], scope = realm({ [name]: app });
  scope.document.documentElement.dataset.musiclabApp = id; load(scope, 'shared/pattern-schema.js'); load(scope, 'shared/pattern-drums.js');
  return { scope, app, engine, adapter: scope.MusicLabPatternInstrument, scheduled, renders, requests, state: () => state, exported: () => exported };
}

(async () => {
  await check('Legacy v1 identities stay exact; empty locks omit and real locks normalize without aliases', () => {
    const old = packet(); assert.equal(S.fingerprint(old), 'pattern-v1-d93219fb');
    const empty = packet(); empty.notes[0].locks = {}; assert.equal(S.serialize(empty), S.serialize(old)); assert.equal(S.fingerprint(empty), S.fingerprint(old));
    const raw = packet(); raw.notes[0].locks = { drive: .7, level: .5, cutoff: 700, resonance: 3, decay: .13, pan: -.4, tone: .2 };
    const normalized = S.normalize(raw), before = S.fingerprint(normalized); raw.notes[0].locks.cutoff = 19000;
    assert.equal(normalized.notes[0].locks.cutoff, 700); assert.deepEqual(Object.keys(normalized.notes[0].locks), ['cutoff', 'resonance', 'decay', 'pan', 'level', 'tone', 'drive']);
    const copied = S.clone(normalized); copied.notes[0].locks.cutoff = 200; assert.equal(S.fingerprint(normalized), before); assert.notEqual(S.fingerprint(copied), before);
    assert.equal(S.serialize(S.parse(S.serialize(normalized))), S.serialize(normalized));
    assert.equal(S.VERSION, 1);
  });
  await check('All canonical boundaries accept and malformed or unsafe lock fields reject atomically', () => {
    for (const [key, [min, max]] of Object.entries(S.LOCK_RANGES)) {
      assert.equal(S.normalizeLocks({ [key]: min })[key], min); assert.equal(S.normalizeLocks({ [key]: max })[key], max);
      for (const value of [min - .001, max + .001, Infinity, NaN, null, '1', undefined]) assert.throws(() => S.normalizeLocks({ [key]: value }));
    }
    for (const locks of [null, [], 4, 'cutoff', { pitch: 3 }, { cuttof: 1000 }, JSON.parse('{"__proto__":1}'), { constructor: 1 }]) {
      const raw = packet(); raw.notes[0].locks = locks; assert.throws(() => S.normalize(raw));
    }
    const excessive = packet(); excessive.lengthBeats = 256; excessive.notes = Array.from({ length: 4097 }, (_, index) => ({ ...excessive.notes[0], id: 'n' + index, beat: index / 32, locks: { cutoff: 1000 } }));
    assert.throws(() => S.normalize(excessive), /4,096/);
  });
  for (const id of ['grain', 'tine', 'form']) {
    await check(id + ': sequence hook exports all banks, translates automatic scope and keeps explicit choices', () => {
      const f = fixture(id), before = JSON.stringify(f.state()); let value = f.adapter.exportPattern();
      assert.equal(value.lengthBeats, 12); assert.deepEqual(plain(value.notes.map(note => note.locks)), [{ cutoff: 680, decay: .13 }, { cutoff: 4200, pan: .35 }]);
      assert.equal(f.requests.at(-1).scope, undefined); f.adapter.exportPattern({ scope: 'sequence' }); assert.equal(f.requests.at(-1).scope, undefined);
      for (const scope of ['pattern', 'chain', 'voice']) { f.adapter.exportPattern({ scope, voice: 3 }); assert.equal(f.requests.at(-1).scope, scope); assert.equal(f.requests.at(-1).voice, 3); }
      assert.equal(f.adapter.patternExport.defaultScope, 'sequence'); assert(f.adapter.patternExport.scopes.some(item => item.id === 'chain'));
      assert.equal(JSON.stringify(f.state()), before); assert.equal(f.adapter.nativeSequenceLoop, true); f.app.sequenceLoop = false; assert.equal(f.adapter.nativeSequenceLoop, false);
      value.notes[0].locks.cutoff = 20; assert.equal(f.exported().notes[0].locks.cutoff, 680);
    });
    await check(id + ': live/native renders preserve locks as private per-note options, with validation before sound', async () => {
      const f = fixture(id), locks = { cutoff: 780, resonance: 2.3, decay: .21, pan: -.2, level: .65, tone: .4, drive: .3 };
      f.adapter.scheduleNote({ pitch: 36, velocity: .8, voice: 'voice-0', when: 10.1, durationSeconds: .2, locks });
      assert.deepEqual(plain(f.scheduled[0].options.locks), locks); assert.equal(f.scheduled[0].when, 10.1);
      if (id === 'grain' || id === 'tine') assert.equal(f.scheduled[0].options.voiceKey, 'voice-0', 'Hosted snapshots retain the native lane polyphony budget');
      locks.cutoff = 16000; assert.equal(f.scheduled[0].options.locks.cutoff, 780);
      assert.throws(() => f.adapter.scheduleNote({ pitch: 36, velocity: .8, voice: 'voice-0', when: 10.2, durationSeconds: .2, locks: { cutoff: Infinity } })); assert.equal(f.scheduled.length, 1);
      const p = packet(); p.notes[0].locks = { cutoff: 640, drive: .2 }; p.notes.push({ ...p.notes[0], id: 'unlocked', beat: 1 }); delete p.notes[1].locks;
      const before = JSON.stringify(p), nativeBefore = JSON.stringify(f.state());
      await f.adapter.renderPattern({ pattern: p, state: { state: f.state() }, tempo: 120 });
      assert.deepEqual(plain(f.renders[0].events[0].locks), { cutoff: 640, drive: .2 }); assert.equal(f.renders[0].events[1].locks, undefined);
      f.renders[0].events[0].locks.cutoff = 20000; assert.equal(JSON.stringify(p), before); assert.equal(JSON.stringify(f.state()), nativeBefore);
      assert.equal(f.renders[0].events[1].at, .5, 'Unlocked following strike retains its own timing');
    });
    await check(id + ': received overlays take precedence and carry locks through exact playback/export', async () => {
      const f = fixture(id), p = packet(); p.notes[0].locks = { cutoff: 900, level: .4 };
      await f.adapter.importPattern({ pattern: p, options: { target: 'current', replace: true, voiceMap: { 'voice-0': 'voice-0' } } });
      const count = f.requests.length; assert.deepEqual(plain(f.adapter.exportPattern().notes[0].locks), p.notes[0].locks); assert.equal(f.requests.length, count, 'Received part bypasses native chain hook');
      f.app.sequenceLoop = false; assert.equal(f.adapter.nativeSequenceLoop, true, 'Received parts retain their existing looping behavior');
      f.adapter.startPattern(); assert.deepEqual(plain(f.scheduled[0].options.locks), p.notes[0].locks); f.adapter.stopPattern();
      if (id === 'form') { const result = f.adapter.getImportedPatternEvents({ repetitions: 2 }); assert.equal(result.events.length, 2); assert.deepEqual(plain(result.events[1].locks), p.notes[0].locks); assert.equal(result.events[1].at, 2); }
      f.adapter.clearImportedPattern(); assert.equal(f.state().musicLabPattern, undefined); assert.equal(f.adapter.exportPattern().lengthBeats, 12);
    });
  }
  await check('GALLEY forwards independent lock snapshots and finite Live chains only once per host cycle', () => {
    const scope = realm(); load(scope, 'shared/pattern-schema.js'); load(scope, 'loom/note-playback.js');
    const events = [], host = { scheduleNote(track, note) { events.push(note); }, cancelNotes() {} }, audio = { getTransport: () => ({ playing: false }), subscribeTransport: () => () => {} };
    const playback = new scope.LoomNotePlayback({ audio, host, getState: () => ({ tracks: [] }) });
    const p = packet(); p.notes[0].locks = { cutoff: 730, pan: .2 }; const entry = { adapter: { notes: { voices: p.voices } } }, track = { id: 'track-1' };
    const clock = { revision: 1, tempo: 120, contextTime: 10, endBeat: 32, cycle: 0, loopEnabled: false, loopStart: 0, loopEnd: 16 };
    playback._liveClip(track, entry, p, 'live', 0, { start: 0, end: .2, boundary: 32, when: 10, cycle: 0 }, clock, false);
    assert.equal(events.length, 1); assert.deepEqual(plain(events[0].locks), p.notes[0].locks); events[0].locks.cutoff = 18000; assert.equal(p.notes[0].locks.cutoff, 730);
    playback._liveClip(track, entry, p, 'live', 0, { start: 4, end: 4.2, boundary: 32, when: 12, cycle: 0 }, { ...clock, contextTime: 12 }, false); assert.equal(events.length, 1, 'Once source does not repeat at the next pattern');
    playback._liveClip(track, entry, p, 'live', 0, { start: 4, end: 4.2, boundary: 32, when: 12, cycle: 0 }, { ...clock, contextTime: 12 }); assert.equal(events.length, 2, 'Missing flag preserves looping defaults');
    playback._liveClip(track, entry, p, 'live', 0, { start: 8, end: 8.2, boundary: 24, when: 18, cycle: 1 }, { ...clock, contextTime: 18, cycle: 1, loopEnabled: true, loopStart: 8, loopEnd: 24 }, false); assert.equal(events.length, 3, 'Outer arrangement loop restarts a once chain at loopStart');
    assert.notEqual(playback._patternSignature(p, true), playback._patternSignature(p, false), 'Loop-only edits create a new Live revision');
    const live = { id: 'track-1', phaseBeat: 0, liveSource: 'old', liveGeneration: 0, sources: new Set(), adapter: { notes: { scheduledCancel: true } }, signature: playback._patternSignature(p, true) };
    playback._queuePattern(live, p, playback._patternSignature(p, false), { ...clock, beat: 1, absoluteBeat: 1, countInBeatsRemaining: 0 }, false);
    assert.equal(live.pending.loop, false); assert.equal(live.pending.phaseBeat, 4); playback._commit(live); assert.equal(live.liveLoop, false); assert.equal(live.phaseBeat, 4);
    const laterClock = { ...clock, beat: 10, absoluteBeat: 26, cycle: 1, loopEnabled: true, loopStart: 8, loopEnd: 24, contextTime: 19, countInBeatsRemaining: 0 };
    const revised = plain(p); revised.notes[0].locks.cutoff = 860;
    playback._queuePattern(live, revised, playback._patternSignature(revised, false), laterClock, false); assert.equal(live.pending.phaseCycle, 1);
    playback._liveClip(track, entry, revised, 'new-once', live.pending.phaseBeat, { start: 12, end: 12.2, boundary: 24, when: 20, cycle: 1 }, { ...laterClock, contextTime: 20 }, false, live.pending.phaseCycle);
    assert.equal(events.length, 4, 'A newly queued once chain starts at its boundary inside a later global loop cycle');
  });
  console.log('Passed ' + checks.length + ' pattern-lock integration checks:\n' + checks.map(name => '  ✓ ' + name).join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; });
