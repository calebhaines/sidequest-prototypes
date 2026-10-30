'use strict';
/* Portable saved-word, sequence and native-adapter regressions. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = __dirname, shared = fs.existsSync(path.join(root, 'shared/pattern-schema.js')) ? path.join(root, 'shared') : path.join(root, '../shared');
const copy = value => JSON.parse(JSON.stringify(value));
const equal = (actual, expected) => assert.deepEqual(copy(actual), copy(expected));
const scope = { window: null, globalThis: null, TextEncoder, console, DOMException, AbortController };
scope.window = scope.globalThis = scope; vm.createContext(scope);
for (const file of [path.join(shared, 'pattern-schema.js'), path.join(root, 'schema.js'), path.join(root, 'sequence.js')]) vm.runInContext(fs.readFileSync(file, 'utf8'), scope, { filename: file });
const S = scope.MorselSchema, Q = scope.MorselSequence, P = scope.MusicLabPatternSchema;
let groups = 0;
async function check(name, run) { await run(); groups++; console.log('PASS ' + name); }
function packet() { return P.normalize({ format: 'musiclab-pattern', version: 1, kind: 'notes', name: 'Words on notes', sourceApp: 'morsel', tempo: 120, swing: 0, lengthBeats: 4, meter: [4, 4], tags: [],
  voices: [{ id: 'low', name: 'Low words' }, { id: 'high', name: 'High words' }], notes: [
    { id: 'one', pitch: 48, beat: .5, duration: .75, voice: 'low', velocity: .8, probability: 1, lyric: 'hello' },
    { id: 'two', pitch: 72, beat: 2, duration: 1, voice: 'high', velocity: .6, probability: 1, lyric: 'kitchen' }
  ] }); }
const map = { low: 'bass', high: 'alto' };
function harness() {
  const listeners = new Map(), docListeners = new Map(), timers = new Map(); let timerId = 0;
  const calls = { prepare: [], schedule: [], stop: [], render: [], events: [], previews: [], previewScheduled: [], panic: 0, globalStop: 0, dispose: 0, init: 0 }, mutable = { state: S.defaultState(), wait: null, initWait: null, previewWait: null };
  const emit = (collection, event) => { for (const callback of collection.get(event.type) || []) callback(event); return true; };
  const listen = (collection, type, callback) => collection.set(type, [...(collection.get(type) || []), callback]);
  const audio = {
    context: { currentTime: 10, state: 'running', resume: async () => {} },
    setState() {}, async init() { calls.init++; if (mutable.initWait) await mutable.initWait; },
    async prepareNotes(options) { calls.prepare.push(copy({ state: options.state, events: options.events, tempo: options.tempo })); if (mutable.wait) await mutable.wait; },
    scheduleNote(note) { calls.schedule.push(copy(note)); return 'scheduled-' + calls.schedule.length; },
    stopNotes(options) { calls.stop.push(copy(options)); }, stop() { calls.globalStop++; }, panic() { calls.panic++; }, async dispose() { calls.dispose++; }, followTransport(clock) { calls.clock = copy(clock); },
    async preview(note) { calls.preview = copy(note); calls.previews.push(copy(note)); if (mutable.previewWait) await mutable.previewWait; if (note.signal?.aborted) throw new DOMException('Cancelled.', 'AbortError'); calls.previewScheduled.push(copy(note)); return true; },
    async renderNotes(options) { calls.render.push(copy({ state: options.state, events: options.events, tempo: options.tempo, lengthBeats: options.lengthBeats, tailSeconds: options.tailSeconds })); if (mutable.wait) await mutable.wait; return { pcm: new Float32Array(8), sampleRate: 48000, blob: {} }; }
  };
  const target = { ...scope, MorselSchema: S, MorselSequence: Q, MusicLabPatternSchema: P, window: null, globalThis: null, AbortController,
    document: { addEventListener(type, callback) { listen(docListeners, type, callback); }, dispatchEvent(event) { calls.events.push(copy({ type: event.type, detail: event.detail })); return emit(docListeners, event); } },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    addEventListener(type, callback) { listen(listeners, type, callback); }, removeEventListener(type, callback) { listeners.set(type, (listeners.get(type) || []).filter(value => value !== callback)); }, dispatchEvent(event) { return emit(listeners, event); },
    setTimeout(callback) { const id = ++timerId; timers.set(id, { callback, interval: false }); return id; }, clearTimeout(id) { timers.delete(id); },
    setInterval(callback) { const id = ++timerId; timers.set(id, { callback, interval: true }); return id; }, clearInterval(id) { timers.delete(id); },
    MusicLabHost: { registerInstrument(adapter) { calls.host = adapter; }, notifyStateChange() { calls.notified = (calls.notified || 0) + 1; } },
    MorselApp: { engine: audio, getState: () => copy(mutable.state), getProject: () => JSON.parse(S.serializeProject(mutable.state)), async loadState(next) { mutable.state = S.parseProject(next); }, selectedStep: 0 }
  };
  target.window = target.globalThis = target; vm.createContext(target); vm.runInContext(fs.readFileSync(path.join(root, 'adapters.js'), 'utf8'), target, { filename: 'adapters.js' });
  return { target, calls, mutable, audio, timers, adapter: target.MusicLabPatternInstrument, controller: target.MorselController };
}
(async () => {
  await check('Four distinct named voices and independent native steps round-trip without shared caller state', () => {
    equal(copy(S.VOICE_IDS), ['alto', 'tenor', 'bass', 'robot']);
    const a = S.defaultState(), b = S.defaultState(), source = copy(a);
    a.steps[0].lyric = 'different'; assert.equal(b.steps[0].lyric, 'hello'); assert.equal(a.steps[1].lyric, 'ah');
    const parsed = S.parseProject(S.serializeProject(b)); equal(copy(parsed), source);
    parsed.steps[0].pitch = 84; assert.equal(b.steps[0].pitch, 60);
    const tolerant = S.normalize({ volume: 8, voice: 'unknown', steps: [{ pitch: 12, lyric: 'a\nword' }] });
    assert.equal(tolerant.volume, 1); assert.equal(tolerant.voice, 'alto'); assert.equal(tolerant.steps[0].pitch, 36); assert.equal(tolerant.steps[0].lyric, 'a word');
  });
  await check('Strict project loading rejects malformed supplied words, voices, bounds and formats atomically', () => {
    const base = S.defaultState(), cases = [
      value => { value.steps[0].pitch = 35; }, value => { value.steps[0].pitch = 84.1; }, value => { value.steps[0].voice = 'soprano'; },
      value => { value.steps[0].lyric = 'x'.repeat(161); }, value => { value.lyric = 'bad\u0000word'; }, value => { value.phrase = 'x'.repeat(513); },
      value => { value.steps[0].gate = 0; }, value => { value.tempo = '96'; }, value => { value.steps.pop(); }, value => { value.steps[2] = null; },
      value => { value.unrecognized = 1; }, value => { delete value.tone; }, value => { value.volume = NaN; }
    ];
    for (const mutate of cases) { const input = copy(base); mutate(input); const before = JSON.stringify(input); assert.throws(() => S.parseProject(input)); assert.equal(JSON.stringify(input), before); }
    assert.throws(() => S.parseProject('{no')); assert.throws(() => S.parseProject({ format: 'morsel-project', formatVersion: 2, appVersion: S.VERSION, state: base }));
    assert.throws(() => S.parseProject({ format: 'morsel-project', formatVersion: 1, appVersion: '9.0.0', state: base }));
    assert.throws(() => S.parseProject(' '.repeat(S.MAX_PROJECT_BYTES + 1)));
  });
  await check('Sparse native words keep rests, exact onsets, gate lengths and per-note voice overrides', () => {
    const value = S.defaultState(), before = JSON.stringify(value), events = Q.events(value);
    equal(events.map(note => note.beat), [0, 2, 4, 6]); equal(events.map(note => note.duration), [1.8, 1.8, 1.8, 1.8]);
    equal(events.map(note => note.lyric), ['hello', 'from', 'the', 'kitchen']); assert.equal(JSON.stringify(value), before);
    Object.assign(value.steps[1], { on: true, lyric: 'ee', pitch: 67, voice: 'robot' });
    const crowded = Q.events(value); assert.equal(crowded[0].duration, .45); assert.equal(crowded[1].voice, 'robot'); assert.equal(crowded[1].lyric, 'ee');
    value.steps[2].on = true; value.swing = .75;
    const swung = Q.events(value), odd = swung.find(note => note.step === 1), following = swung.find(note => note.step === 2);
    assert(Math.abs(odd.duration - .1125) < 1e-12); assert(odd.beat + odd.duration <= following.beat);
    value.steps[31].on = true; value.length = 32; value.swing = .75;
    for (const event of Q.events(value)) { assert(event.beat >= 0); assert(event.duration > 0); assert(event.beat + event.duration <= Q.lengthBeats(value) + 1e-9); }
  });
  await check('Probability is repeatable per cycle while portable phrases retain editable probabilities and words', () => {
    const value = S.defaultState(); value.steps[0].probability = .5; value.steps[4].probability = 0;
    const first = JSON.stringify(Q.events(value, { cycle: 2 })); assert.equal(JSON.stringify(Q.events(value, { cycle: 2 })), first);
    assert(!Q.events(value).some(note => note.lyric === 'from'));
    const present = new Set(Array.from({ length: 32 }, (_, cycle) => Q.events(value, { cycle }).some(note => note.lyric === 'hello'))); assert.equal(present.size, 2);
    const exported = Q.pattern(value); assert.equal(exported.notes.find(note => note.lyric === 'hello').probability, .5); assert.equal(exported.notes.find(note => note.lyric === 'from').probability, 0);
    equal(exported.notes.map(note => note.lyric), ['hello', 'from', 'the', 'kitchen']);
  });
  await check('Received per-note words, exact note timing, mappings and absent-word fallback survive native projects', () => {
    const value = S.defaultState(), incoming = packet(); delete incoming.notes[1].lyric;
    value.musicLabPattern = { pattern: incoming, voiceMap: map }; value.lyric = 'oo';
    const saved = S.parseProject(S.serializeProject(value)), events = Q.events(saved);
    equal(events.map(note => [note.beat, note.duration, note.voice, note.lyric]), [[.5, .75, 'bass', 'hello'], [2, 1, 'alto', 'oo']]);
    assert.equal(saved.musicLabPattern.pattern.notes[1].lyric, undefined); equal(copy(saved.musicLabPattern.voiceMap), map);
    const exported = Q.pattern(saved); assert.equal(exported.notes[0].lyric, 'hello'); assert.equal(exported.notes[1].lyric, 'oo');
    const invalidPitch = copy(saved); invalidPitch.musicLabPattern.pattern.notes[0].pitch = 35; assert.throws(() => S.parseProject(invalidPitch));
    saved.musicLabPattern.voiceMap.low = 'unknown'; assert.throws(() => S.parseProject(saved));
  });
  await check('Native adapters await complete word preparation, map lyrics and retain effective musical rates', async () => {
    const h = harness(), incoming = packet(), before = JSON.stringify(incoming);
    assert.equal(h.adapter.notes.lyrics, true); assert.equal(h.adapter.notes.scheduledCancel, true);
    await h.adapter.preparePattern({ pattern: incoming, voiceMap: map, tempo: 960 });
    assert.equal(h.calls.prepare.length, 1); assert.equal(h.calls.prepare[0].tempo, 960);
    equal(h.calls.prepare[0].events.map(note => [note.voice, note.lyric, note.beat, note.duration]), [['bass', 'hello', .5, .75], ['alto', 'kitchen', 2, 1]]);
    assert.equal(JSON.stringify(incoming), before); assert.equal(h.calls.schedule.length, 0);
    const token = h.adapter.scheduleNote({ pitch: 48, voice: 'bass', lyric: 'hello', velocity: .7, when: 13.125, durationSeconds: .375, source: 'track-A' });
    assert.equal(token, 'scheduled-1'); equal(h.calls.schedule[0], { pitch: 48, voice: 'bass', lyric: 'hello', velocity: .7, when: 13.125, durationSeconds: .375, source: 'track-A' });
    h.adapter.cancelNotes({ source: 'track-A', when: 13.25 }); equal(h.calls.stop.at(-1), { source: 'track-A', when: 13.25 });
    assert.throws(() => h.adapter.scheduleNote({ pitch: 85, voice: 'alto', when: 14, durationSeconds: 1 }));
  });
  await check('Private native rendering snapshots the whole patch and lyrics before awaiting without editing live state', async () => {
    const h = harness(), incoming = packet(), original = copy(h.mutable.state), nativeBefore = JSON.stringify(h.mutable.state), sourceBefore = JSON.stringify(incoming);
    let release; h.mutable.wait = new Promise(resolve => { release = resolve; });
    const rendering = h.adapter.renderPattern({ pattern: incoming, state: original, voiceMap: map, tempo: 180, tailSeconds: .2 });
    original.volume = 0; incoming.notes[0].lyric = 'changed'; release();
    const result = await rendering; assert.equal(result.sampleRate, 48000); assert.equal(result.sourceApp, 'morsel'); assert.equal(result.name, 'Words on notes');
    assert.equal(h.calls.render[0].state.volume, .65); assert.equal(h.calls.render[0].events[0].lyric, 'hello'); assert.equal(h.calls.render[0].events[0].beat, .5);
    assert.equal(JSON.stringify(h.mutable.state), nativeBefore); assert.notEqual(JSON.stringify(incoming), sourceBefore);
    const previous = h.calls.prepare.length; const signal = AbortSignal.abort(); await assert.rejects(h.adapter.preparePattern({ pattern: packet(), voiceMap: map, signal }), { name: 'AbortError' }); assert.equal(h.calls.prepare.length, previous);
  });
  await check('Fallback-word preparation signature follows actual inherited words while explicit note words remain intact', async () => {
    const h = harness(), incoming = packet(), original = h.adapter.preparationSignature;
    assert.equal(h.calls.host.preparationSignature, original);
    h.mutable.state.volume = .25; h.mutable.state.tone = .8; assert.equal(h.adapter.preparationSignature, original);
    h.mutable.state.lyric = 'new word'; assert.notEqual(h.adapter.preparationSignature, original);
    const changed = h.adapter.preparationSignature; h.mutable.state.lyric = ' new   word '; assert.equal(h.adapter.preparationSignature, changed);
    delete incoming.notes[1].lyric;
    await h.adapter.preparePattern({ pattern: incoming, voiceMap: map, tempo: 120 });
    assert.equal(h.calls.prepare.at(-1).events[0].lyric, 'hello'); assert.equal(h.calls.prepare.at(-1).events[1].lyric, ' new   word ');
    h.mutable.state.lyric = ''; assert.equal(h.adapter.preparationSignature, original);
    assert.throws(() => h.adapter.scheduleNote({ pitch: 60, voice: 'alto', when: 12, durationSeconds: 121 }), /120/);
  });
  await check('Selected-word exports preserve a saved silent velocity instead of turning it into an audible default', async () => {
    const h = harness(); h.mutable.state.steps[0].velocity = 0;
    const before = JSON.stringify(h.mutable.state); await h.controller.exportAudio({ scope: 'note', tailSeconds: 0 });
    assert.equal(h.calls.render.at(-1).events[0].velocity, 0); assert.equal(JSON.stringify(h.mutable.state), before);
    h.mutable.state.steps[0].velocity = .35; await h.controller.exportAudio({ scope: 'note', tailSeconds: 0 });
    assert.equal(h.calls.render.at(-1).events[0].velocity, .35); assert.equal(h.calls.render.at(-1).events[0].lyric, 'hello');
  });
  await check('Word import validation rejects huge unique preparations and malformed mappings before replacing a recipe', async () => {
    const h = harness(), before = JSON.stringify(h.mutable.state);
    await assert.rejects(h.adapter.importPattern({ pattern: packet(), options: { voiceMap: map } }), /replacing/); assert.equal(JSON.stringify(h.mutable.state), before);
    await assert.rejects(h.adapter.importPattern({ pattern: packet(), options: { voiceMap: { low: 'bass' }, replace: true } })); assert.equal(JSON.stringify(h.mutable.state), before);
    const large = packet(); large.lengthBeats = 128; large.notes = Array.from({ length: 65 }, (_, i) => ({ id: 'unique-' + i, pitch: 60, voice: 'low', beat: i, duration: .5, velocity: .8, probability: 1, lyric: 'word ' + i }));
    assert.throws(() => h.adapter.validatePattern({ pattern: large, voiceMap: map }), /64 different/);
    await h.adapter.importPattern({ pattern: packet(), options: { voiceMap: map, replace: true } });
    assert.equal(h.mutable.state.musicLabPattern.pattern.notes[0].lyric, 'hello'); assert.equal(h.adapter.exportPattern().notes[1].lyric, 'kitchen');
  });
  await check('Native transport prepares before its first timed note, preserves other sources and cancels pending starts', async () => {
    const h = harness(); await h.controller.start({ when: 12, beat: 0 }); assert.equal(h.controller.isPlaying(), true); assert.equal(h.calls.schedule.length, 0);
    h.audio.context.currentTime = 11.9; for (const entry of h.timers.values()) if (entry.interval) entry.callback();
    assert.equal(h.calls.schedule[0].when, 12); assert.equal(h.calls.schedule[0].lyric, 'hello'); assert.equal(h.calls.schedule[0].source, 'morsel-native');
    h.controller.stop(); assert.equal(h.controller.isPlaying(), false); assert.equal(h.timers.size, 0); equal(h.calls.stop.at(-1), {});
    let release; h.mutable.wait = new Promise(resolve => { release = resolve; }); const pending = h.controller.start(); h.controller.stop(); release(); assert.equal(await pending, false); assert.equal(h.controller.isPlaying(), false);
  });
  await check('Stop during initial preview preparation cannot resurrect an old audition after preparation resolves', async () => {
    const h = harness(); let release; h.mutable.initWait = new Promise(resolve => { release = resolve; });
    const pending = h.controller.preview({ pitch: 60, lyric: 'old word' }); h.controller.stop(); release();
    assert.equal(await pending, false); assert.equal(h.calls.preview, undefined); assert.equal(h.controller.isPlaying(), false);
  });
  await check('Rapid voice edits cancel pending speech auditions while independent keyboard notes remain polyphonic', async () => {
    const h = harness(); let release; h.mutable.previewWait = new Promise(resolve => { release = resolve; });
    const first = h.controller.preview({ pitch: 60 }), second = h.controller.preview({ pitch: 64 });
    for (let i = 0; i < 5; i++) await Promise.resolve(); assert.equal(h.calls.previews.length, 2);
    h.mutable.state.voice = 'bass'; h.target.dispatchEvent(new h.target.CustomEvent('morsel:change', { detail: { state: copy(h.mutable.state) } })); release();
    equal(await Promise.all([first, second]), [false, false]); assert.equal(h.calls.previewScheduled.length, 0);
    h.mutable.previewWait = null;
    equal(await Promise.all([h.controller.preview({ pitch: 60 }), h.controller.preview({ pitch: 64 })]), [true, true]);
    equal(h.calls.previewScheduled.map(note => note.pitch), [60, 64]);
  });
  await check('Controller disposal cancels timers and pending preparation without invoking ordinary Stop or creating replacement audio', async () => {
    const h = harness(); await h.controller.start({ when: 12 }); const stops = h.calls.stop.length;
    const first = h.controller.dispose(), second = h.controller.dispose(); assert.equal(first, second); await first;
    assert.equal(h.calls.dispose, 1); assert.equal(h.calls.stop.length, stops); assert.equal(h.calls.globalStop, 0); assert.equal(h.calls.panic, 0); assert.equal(h.timers.size, 0);
    h.controller.stop(); h.controller.panic(); assert.equal(h.calls.globalStop, 0); assert.equal(h.calls.panic, 0);
    assert.equal(await h.controller.start(), false); assert.equal(await h.controller.preview(), false); assert.equal(h.adapter.scheduleNote({ pitch: 60, voice: 'alto', when: 12 }), false);
    await assert.rejects(h.adapter.prepare(), { name: 'AbortError' });
    const pending = harness(); let release; pending.mutable.initWait = new Promise(resolve => { release = resolve; });
    const start = pending.controller.start(), preview = pending.controller.preview(), preparation = pending.adapter.preparePattern({ pattern: packet(), voiceMap: map, tempo: 120 });
    const rejected = assert.rejects(preparation, { name: 'AbortError' }); await pending.controller.dispose(); release();
    equal(await Promise.all([start, preview]), [false, false]); await rejected;
    assert.equal(pending.calls.schedule.length, 0); assert.equal(pending.calls.previews.length, 0); assert.equal(pending.calls.dispose, 1);
  });
  console.log(groups + ' MORSEL saved-word, sequence and native-adapter groups passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
