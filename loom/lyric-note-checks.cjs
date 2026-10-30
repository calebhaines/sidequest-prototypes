'use strict';
// Real portable schema, scheduler, piano editor and source-aware Print. Deferred
// preparation proves no asynchronous word generation can leak into note timing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const portableShared = path.join(__dirname, 'shared');
const shared = fs.existsSync(path.join(portableShared, 'pattern-schema.js')) ? portableShared : path.join(__dirname, '..', 'shared');
const plain = value => JSON.parse(JSON.stringify(value));
const pause = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function realm(extra = {}) {
  const scope = { console, TextEncoder, TextDecoder, DOMException, AbortController, Blob, Float32Array, setTimeout, clearTimeout,
    setInterval: () => 1, clearInterval() {}, ...extra };
  scope.window = scope; vm.createContext(scope);
  vm.runInContext(fs.readFileSync(path.join(shared, 'pattern-schema.js'), 'utf8'), scope);
  for (const name of ['note-playback.js', 'piano-roll.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, name), 'utf8'), scope, { filename: name });
  return scope;
}
function packet(lyric = 'hello') {
  return { format: 'musiclab-pattern', version: 1, name: 'Legacy voice fixture', sourceApp: 'proof', kind: 'notes', tempo: 120, swing: 0, lengthBeats: 4, meter: [4, 4],
    voices: [{ id: 'synth', name: 'Synth' }], notes: [{ id: 'one', pitch: 60, beat: 0, duration: 1, velocity: .8, voice: 'synth', probability: 1, ...(lyric === undefined ? {} : { lyric }) }], tags: [] };
}
function clip(lyric = 'hello') { return { id: 'phrase', type: 'notes', start: 0, length: 4, rate: 1, sourceOffset: 0, loop: true, gain: 1, transpose: 0, voiceMap: { synth: 'alto' }, pattern: packet(lyric) }; }
function fixture({ live = false, legacy = false } = {}) {
  const scope = realm(), scheduled = [], prepared = [], statuses = [], clock = { playing: false, tempo: 120, beat: 0, absoluteBeat: 0, contextTime: 10, cycle: 0, revision: 1, countInBeatsRemaining: 0, loopEnabled: true, loopStart: 0, loopEnd: 4, endBeat: 16 };
  const state = { tempo: 120, tracks: [{ id: 'track-1', name: 'Voice', instrument: { id: 'morsel' }, instrumentLive: live, clips: live ? [] : [clip()] }] };
  let subscriber, prepareRequest = async () => {}, native = packet(); native.voices = [{ id: 'alto', name: 'Alto' }]; native.notes[0].voice = 'alto';
  const adapter = { notes: { voices: [{ id: 'alto', name: 'Alto' }], pitched: true, scheduledCancel: true, lyrics: true }, prepare: async () => {}, scheduleNote() {},
    validateNote() {}, validatePattern() {}, exportPattern() {}, transport() {},
    ...(legacy ? {} : { async preparePattern(request) { prepared.push(request); await prepareRequest(request); } }) };
  const host = { records: new Map(), getPatternAdapter: () => adapter, scheduleNote(id, note) { scheduled.push({ trackId: id, ...plain(note) }); return true; },
    cancelNotes() {}, command: async () => true, setClockDriven() {}, transportInstrument() {}, exportPattern: async () => plain(native) };
  const audio = { getTransport: () => ({ ...clock }), subscribeTransport(fn) { subscriber = fn; return () => {}; } };
  const playback = new scope.LoomNotePlayback({ audio, host, getState: () => state, onStatus: value => statuses.push(value) });
  return { scope, state, clock, host, adapter, scheduled, prepared, statuses, playback,
    setPrepare: fn => { prepareRequest = fn; }, setNative: value => { native = value; }, native: () => plain(native),
    start() { clock.playing = true; playback.lastRefresh = clock.contextTime; return playback.start(); },
    transport(reason) { subscriber({ ...clock }, reason); } };
}
const groups = [];
async function check(name, test) { await test(); groups.push(name); console.log('PASS ' + name); }
(async () => {
  await check('Optional words are bounded portable data and absent words retain the exact legacy identity', () => {
    const P = realm().MusicLabPatternSchema, legacy = packet(); delete legacy.notes[0].lyric;
    assert.equal(P.fingerprint(legacy), 'pattern-v1-40c527ba');
    assert.equal(P.serialize(legacy), JSON.stringify(legacy));
    const p = packet('  café & "tea"  '), copy = P.parse(P.serialize(p));
    assert.equal(copy.notes[0].lyric, p.notes[0].lyric); assert.notEqual(P.fingerprint(p), P.fingerprint(legacy));
    p.notes[0].lyric = 'edited'; assert.equal(copy.notes[0].lyric, '  café & "tea"  ');
    for (const lyric of [null, 12, {}, [], 'a'.repeat(161), 'a\nb', 'a\u0000', 'a\u007f']) assert.throws(() => P.normalize(packet(lyric)), /lyric/);
    for (const lyric of ['', 'a'.repeat(160), '<script>ah</script>']) assert.equal(P.normalize(packet(lyric)).notes[0].lyric, lyric);
  });
  await check('Initial preparation awaits the transposed, mapped words before exact synchronous scheduling', async () => {
    const f = fixture(), gate = deferred(); f.setPrepare(() => gate.promise); f.state.tracks[0].clips[0].transpose = 12; f.state.tracks[0].clips[0].rate = 2;
    const ready = f.playback.prepare(); await pause();
    assert.equal(f.prepared.length, 1); assert.equal(f.playback.tracks.size, 0); assert.equal(f.scheduled.length, 0);
    const request = f.prepared[0]; assert.equal(request.pattern.notes[0].pitch, 72); assert.equal(request.pattern.notes[0].lyric, 'hello'); assert.equal(request.voiceMap.synth, 'alto'); assert.equal(request.tempo, 240); assert(request.signal instanceof AbortSignal);
    assert.equal(f.state.tracks[0].clips[0].pattern.notes[0].pitch, 60);
    gate.resolve(); await ready; f.start();
    assert.equal(f.scheduled[0].lyric, 'hello'); assert.equal(f.scheduled[0].pitch, 72); assert.equal(f.scheduled[0].voice, 'alto'); assert.equal(f.scheduled[0].when, 10.004);
    assert(Math.abs(f.scheduled[0].durationSeconds - .246) < 1e-9); assert.deepEqual(f.statuses, []); f.playback.dispose();
  });
  await check('Legacy adapters retain their original scheduled payload and never require a preparation hook', async () => {
    const f = fixture({ legacy: true }); delete f.state.tracks[0].clips[0].pattern.notes[0].lyric;
    await f.playback.prepare(); f.start(); assert.equal(f.prepared.length, 0); assert.equal(f.scheduled.length, 1); assert.equal(f.scheduled[0].when, 10.004);
    assert(!Object.prototype.hasOwnProperty.call(f.scheduled[0], 'lyric')); assert.deepEqual(f.statuses, []); f.playback.dispose();
  });
  await check('Initial preparation retries the latest words, pitch, voice mapping and tempo before accepting Start', async () => {
    for (const tempoOnly of [false, true]) {
      const f = fixture(), gate = deferred(); let attempts = 0;
      f.adapter.notes.voices.push({ id: 'tenor', name: 'Tenor' }); f.setPrepare(() => ++attempts === 1 ? gate.promise : Promise.resolve());
      const ready = f.playback.prepare(); await pause();
      if (!tempoOnly) { const c = f.state.tracks[0].clips[0]; c.pattern.notes[0].lyric = 'latest'; c.pattern.notes[0].pitch = 67; c.voiceMap.synth = 'tenor'; }
      f.state.tempo = f.clock.tempo = 90; f.playback.setState(); gate.resolve(); await ready;
      assert(attempts >= 2); assert.equal(f.prepared.at(-1).tempo, 90);
      if (!tempoOnly) { const request = f.prepared.at(-1); assert.equal(request.pattern.notes[0].lyric, 'latest'); assert.equal(request.pattern.notes[0].pitch, 67); assert.equal(request.voiceMap.synth, 'tenor'); }
      f.start(); assert.equal(f.scheduled[0].lyric, tempoOnly ? 'hello' : 'latest'); assert.equal(f.scheduled[0].pitch, tempoOnly ? 60 : 67); assert.equal(f.scheduled[0].voice, tempoOnly ? 'alto' : 'tenor');
      assert.equal(f.playback.active, true); assert.deepEqual(f.statuses, []); f.playback.dispose();
    }
  });
  await check('Initial native phrase preparation retries word edits and same-ID adapter replacement', async () => {
    const f = fixture({ live: true }), gate = deferred(); let attempts = 0; f.setPrepare(() => ++attempts === 1 ? gate.promise : Promise.resolve());
    const ready = f.playback.prepare(); await pause(); const latest = f.native(); latest.notes[0].lyric = 'fresh native'; f.setNative(latest); gate.resolve(); await ready;
    assert(attempts >= 2); assert.equal(f.playback.tracks.get('track-1').live.notes[0].lyric, 'fresh native'); f.playback.dispose();
    const replacement = fixture(), old = deferred(); replacement.setPrepare(() => old.promise);
    const preparing = replacement.playback.prepare(); await pause(); let newlyPrepared = 0;
    const current = { ...replacement.adapter, preparePattern: async () => { newlyPrepared++; } }; replacement.host.getPatternAdapter = () => current;
    old.resolve(); await preparing; assert.equal(newlyPrepared, 1); assert.equal(replacement.playback.tracks.get('track-1').adapter, current); replacement.playback.dispose();
  });
  await check('Fallback word edits prepare before scheduling, including further edits while preparation is pending', async () => {
    const f = fixture(), prepared = new Set(), spoken = []; let word = 'ah', pending = null;
    Object.defineProperty(f.adapter, 'preparationSignature', { get: () => JSON.stringify([word]) });
    const notes = f.state.tracks[0].clips[0].pattern.notes; delete notes[0].lyric; notes.push({ ...notes[0], id: 'two', beat: 1 });
    f.setPrepare(async () => { const requested = word, wait = pending; if (wait) await wait.promise; prepared.add(requested); });
    f.host.scheduleNote = (id, note) => { const text = note.lyric ?? word; assert(prepared.has(text), 'No unprepared fallback word reaches synchronous scheduling'); spoken.push(text); return true; };
    await f.playback.prepare(); f.start(); assert.deepEqual(spoken, ['ah']);
    word = 'kitchen'; pending = deferred(); f.clock.beat = f.clock.absoluteBeat = .95; f.clock.contextTime = 10.475; f.playback.lastRefresh = f.clock.contextTime;
    f.playback._tick(); await pause(); assert(f.playback.tracks.get('track-1').preparing); assert.deepEqual(spoken, ['ah']);
    word = 'tea'; const first = pending; pending = null; first.resolve(); await pause();
    assert(prepared.has('tea')); assert(spoken.includes('tea')); assert(!spoken.includes('kitchen')); assert.equal(f.playback.active, true); assert.deepEqual(f.statuses, []); f.playback.dispose();
  });
  await check('Fallback-word preparation stays local when a later mixer edit updates the parent state', async () => {
    const f = fixture(), cancelled = []; let word = 'ah';
    delete f.state.tracks[0].clips[0].pattern.notes[0].lyric;
    Object.defineProperty(f.adapter, 'preparationSignature', { get: () => JSON.stringify([word]) });
    const legacy = { ...f.adapter, preparePattern: undefined };
    f.state.tracks.push({ ...f.state.tracks[0], id: 'track-2', instrument: { id: 'proof' }, clips: [clip('unchanged phrase')], level: .7 });
    f.host.getPatternAdapter = id => id === 'track-1' ? f.adapter : legacy;
    f.host.cancelNotes = (id, options) => cancelled.push({ id, ...options });
    await f.playback.prepare(); f.start(); cancelled.length = 0;
    const gate = deferred(); f.setPrepare(() => gate.promise); word = 'kitchen'; f.playback._tick(); await pause();
    assert(f.playback.tracks.get('track-1').preparing);
    f.state.tracks[1].level = .4; f.playback.setState(); assert.deepEqual(cancelled, [], 'A mixer edit must not turn word readiness into an arrangement reset');
    gate.resolve(); await pause(); assert.equal(f.playback.tracks.get('track-1').preparing, false);
    f.state.tracks[1].level = .6; f.playback.setState(); assert.deepEqual(cancelled, []); assert.deepEqual(f.statuses, []); f.playback.dispose();
  });
  await check('Stop aborts in-flight initial word preparation and cannot install or play a late track', async () => {
    const f = fixture(), gate = deferred(); f.setPrepare(() => gate.promise);
    const ready = f.playback.prepare(); await pause(); f.playback.stop(); assert(f.prepared[0].signal.aborted);
    gate.resolve(); await assert.rejects(ready, { name: 'AbortError' }); assert.equal(f.playback.tracks.size, 0); assert.equal(f.scheduled.length, 0); f.playback.dispose();
  });
  await check('Playing clip edits wait for words; superseded edits and Stop never resurrect stale notes', async () => {
    const f = fixture(); await f.playback.prepare(); f.start(); const first = deferred(), second = deferred();
    f.setPrepare(request => request.pattern.notes[0].lyric === 'first' ? first.promise : second.promise);
    f.state.tracks[0].clips[0].pattern.notes[0].lyric = 'first'; f.playback.setState(); await pause(); const firstSignal = f.prepared.at(-1).signal;
    const count = f.scheduled.length; f.playback._tick(); assert.equal(f.scheduled.length, count); assert(f.playback.tracks.get('track-1').preparing);
    f.state.tracks[0].clips[0].pattern.notes[0].lyric = 'second'; f.playback.setState(); await pause(); assert(firstSignal.aborted);
    second.resolve(); await pause(); assert.equal(f.scheduled.at(-1).lyric, 'second');
    const accepted = f.scheduled.length; first.resolve(); await pause(); assert.equal(f.scheduled.length, accepted);
    const stopped = deferred(); f.setPrepare(() => stopped.promise); f.state.tracks[0].clips[0].pattern.notes[0].lyric = 'stopped'; f.playback.setState(); await pause(); f.playback.stop();
    stopped.resolve(); await pause(); assert.equal(f.scheduled.length, accepted); assert.deepEqual(f.statuses, []); f.playback.dispose();
  });
  await check('A newly added track is unavailable to the scheduler until its words are prepared', async () => {
    const f = fixture(); await f.playback.prepare(); f.start(); const gate = deferred();
    f.setPrepare(request => request.pattern.notes[0].lyric === 'new lane' ? gate.promise : Promise.resolve());
    f.state.tracks.push({ ...f.state.tracks[0], id: 'track-2', clips: [clip('new lane')] }); f.playback.setState(); await pause();
    assert(!f.playback.tracks.has('track-2')); assert(!f.scheduled.some(note => note.trackId === 'track-2'));
    gate.resolve(); await pause(); assert(f.playback.tracks.has('track-2')); assert(f.scheduled.some(note => note.trackId === 'track-2' && note.lyric === 'new lane')); f.playback.dispose();
  });
  await check('Native phrase changes retain the old phrase until ready and discard an obsolete prepared phrase', async () => {
    const f = fixture({ live: true }); await f.playback.prepare(); f.start();
    const gate = deferred(), changed = f.native(); changed.notes[0].lyric = 'new phrase'; f.setNative(changed); f.setPrepare(() => gate.promise);
    const refresh = f.playback._refreshLive(); await pause(); const entry = f.playback.tracks.get('track-1'); assert.equal(entry.live.notes[0].lyric, 'hello'); assert.equal(entry.pending, null);
    const latest = f.native(); latest.notes[0].lyric = 'latest phrase'; f.setNative(latest); gate.resolve(); await refresh;
    assert.equal(entry.pending, null); assert.equal(entry.live.notes[0].lyric, 'hello');
    f.setPrepare(async () => {}); await f.playback._refreshLive(); assert.equal(entry.pending.pattern.notes[0].lyric, 'latest phrase');
    const before = entry.pending, stopGate = deferred(), stopped = f.native(); stopped.notes[0].lyric = 'do not launch'; f.setNative(stopped); f.setPrepare(() => stopGate.promise);
    const pending = f.playback._refreshLive(); await pause(); f.playback.stop(); stopGate.resolve(); await pending; assert.equal(entry.pending, before); f.playback.dispose();
  });
  await check('The selected-note word inspector is scoped, escaped, undoable and preserves other words', () => {
    const scope = realm(), p = packet('<ah & "oh">'), c = clip(), state = { tracks: [{ instrument: { id: 'morsel' } }] }; c.pattern = p;
    const holder = { innerHTML: '', querySelector() { return { insertAdjacentHTML(where, value) { holder.innerHTML = holder.innerHTML.replace('<button', value + '<button'); } }; } };
    const element = { querySelector(selector) { return selector === '.piano-note-editor' ? holder : { focus() {} }; }, querySelectorAll: () => [] };
    const editor = Object.create(scope.LoomPianoRollEditor.prototype); let remembered = 0, changed = 0, audition;
    Object.assign(editor, { element, getState: () => state, getClip: () => ({ trackIndex: 0, clip: c }), selected: new Set(['one']), remember() { remembered++; }, notify() { changed++; }, draw() {}, status() {}, onAudition: event => { audition = event; } });
    editor.renderSelection(); assert(holder.innerHTML.includes('data-piano-field="note-lyric"')); assert(holder.innerHTML.includes('&lt;ah &amp; &quot;oh&quot;&gt;')); assert(!holder.innerHTML.includes('value="<ah'));
    editor.change({ target: { dataset: { pianoField: 'note-lyric' }, value: 'kitchen' } }); assert.equal(p.notes[0].lyric, 'kitchen'); assert.equal(remembered, 1); assert.equal(changed, 1);
    editor.audition(p.notes[0]); assert.equal(audition.lyric, 'kitchen'); editor.change({ target: { dataset: { pianoField: 'note-lyric' }, value: '' } }); assert(!Object.hasOwn(p.notes[0], 'lyric'));
    state.tracks[0].instrument.id = 'proof'; editor.renderSelection(); assert(!holder.innerHTML.includes('note-lyric'));
    p.notes[0].lyric = 'saved lyric'; editor.renderSelection(); assert(holder.innerHTML.includes('note-lyric'));
  });
  console.log(groups.length + ' lyric/schema/preparation/editor groups passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
