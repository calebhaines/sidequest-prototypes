'use strict';
// Native lifecycle checks: real host/bridge/scheduler code, no browser or timing benchmark.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const passed = [];
async function check(name, run) { await run(); passed.push(name); console.log('PASS ' + name); }
class Frame { constructor() { this.contentWindow = {}; this.srcdoc = 'instrument'; } removeAttribute() {} }
function hostFixture() {
  const scope = { DOMException, AbortController, HTMLIFrameElement: Frame, URL, performance, setTimeout, clearTimeout, document: { baseURI: 'http://localhost/loom/' } }; scope.window = scope;
  vm.runInNewContext(source('instrument-host.js'), scope);
  const host = new scope.LoomInstrumentHost({ getTrackInput() {}, baseURL: 'http://localhost/' });
  function record(id, getState, options = {}) {
    const frame = new Frame(), calls = { closes: 0, prepares: 0, stops: 0, notes: 0 }, adapter = { getState, prepare() { calls.prepares++; }, panic() { calls.stops++; }, cancelNotes() {}, scheduleNote() { calls.notes++; } };
    const value = { trackId: id, key: id + Math.random(), id: 'fixture', active: true, loaded: options.loaded !== false, initialized: options.initialized !== false, iframe: frame, definition: null, descriptor: options.descriptor || {}, ready: Promise.resolve(), abortController: new AbortController(), operation: 0, soundEnabled: true, storage: {} };
    frame.contentWindow.__LoomBridge = { adapter, storage: { edited: 'latest' }, mute(muted) { value.soundEnabled = !muted; }, async command(name) { return adapter[name]?.(); }, async dispose() { calls.closes++; } };
    host.records.set(id, value); scope.__LoomHostRegistry[value.key] = value; return { value, frame, calls };
  }
  return { scope, host, record };
}

(async () => {
  await check('Host power gates immediately, saves latest edits and fully unloads only its own frame', async () => {
    const { host, record } = hostFixture(), pending = deferred(), a = record('track-1', () => pending.promise), b = record('track-2', () => ({ untouched: true }));
    const stopping = host.setDisabled('track-1', true); assert(host.isDisabled('track-1')); assert.equal(a.value.soundEnabled, false);
    assert.equal(host.scheduleNote('track-1', {}), false); assert.equal(await host.command('track-1', 'prepare'), false);
    await assert.rejects(host.load('track-1', { id: 'fixture' }, a.frame), /Enable/); assert.equal(a.calls.prepares, 0);
    pending.resolve({ cutoff: 3210, phrase: [60, 64, 67] }); const snapshot = await stopping;
    assert.deepEqual(plain(snapshot.state), { cutoff: 3210, phrase: [60, 64, 67] }); assert.deepEqual(plain(snapshot.storage), { edited: 'latest' });
    assert.equal(a.calls.closes, 1); assert.equal(a.frame.srcdoc, ''); assert(!host.records.has('track-1')); assert(host.isDisabled('track-1'));
    assert.equal(host.records.get('track-2'), b.value); assert.equal(b.calls.closes, 0); assert.equal(b.value.soundEnabled, true);
    await host.setDisabled('track-1', false); assert(!host.isDisabled('track-1')); await host.setDisabled('empty-disabled', true); assert(host.isDisabled('empty-disabled')); host.dispose();
  });
  await check('Snapshot failures roll back without discarding edits; loading frames use their authoritative descriptor', async () => {
    const { host, record } = hostFixture(), a = record('track-1', () => { throw Error('Cannot serialize current patch'); });
    await assert.rejects(host.setDisabled('track-1', true), /Cannot serialize/); assert(!host.isDisabled('track-1')); assert.equal(host.records.get('track-1'), a.value); assert.equal(a.calls.closes, 0); assert(a.value.soundEnabled);
    const stored = { format: 'loom-instrument-state', version: 1, app: 'fixture', state: { patch: 9 }, storage: {} };
    for (const loaded of [false, true]) {
      const loading = record('track-2', () => { throw Error('Never inspect an unfinished frame'); }, { loaded, initialized: false, descriptor: { snapshot: stored } });
      assert.deepEqual(plain(await host.setDisabled('track-2', true)), stored); assert.equal(loading.calls.closes, 1); await host.setDisabled('track-2', false);
    }
    host.dispose();
  });
  await check('An old snapshot cannot unload, ungate or resurrect a replacement instrument', async () => {
    const { host, record } = hostFixture(), oldState = deferred(), old = record('track-1', () => oldState.promise), first = host.setDisabled('track-1', true);
    const rejected = assert.rejects(first, error => error.name === 'AbortError'); host.unload('track-1'); await host.setDisabled('track-1', false);
    const fresh = record('track-1', () => ({ newest: true })); const latest = await host.setDisabled('track-1', true); await rejected; oldState.resolve({ stale: true });
    assert.deepEqual(plain(latest.state), { newest: true }); assert.equal(old.calls.closes, 1); assert.equal(fresh.calls.closes, 1); assert(host.isDisabled('track-1')); assert(!host.records.has('track-1')); host.dispose();
  });
  await check('Hosted Worklets preserve enabled samples and stop even after disconnect, without stopping a sibling facade', async () => {
    class Node { constructor() { this.gain = { value: 1, setValueAtTime() {} }; } connect() {} disconnect() {} }
    class Port {
      constructor() { this.listeners = []; }
      addEventListener(type, listener) { this.listeners.push(listener); } start() {}
      set onmessage(listener) { this.addEventListener('message', event => listener?.(event)); }
      receive(data) { const event = { data, stopped: false, stopImmediatePropagation() { this.stopped = true; } }; for (const listener of this.listeners) { listener(event); if (event.stopped) break; } }
    }
    const processors = new Map(), blobs = new Map(); let serial = 0;
    const audioScope = { AudioWorkletProcessor: class { constructor() { this.port = new Port(); } }, registerProcessor(name, type) { processors.set(name, type); } }; vm.createContext(audioScope);
    const instrumentModule = 'class Fixture extends AudioWorkletProcessor { static get parameterDescriptors(){return [{name:"gain",defaultValue:.5}]} constructor(){super();this.calls=0;this.messages=0;this.port.onmessage=()=>this.messages++} process(inputs,outputs,parameters){this.calls++;outputs[0][0].set(inputs[0][0]);return true}} registerProcessor("fixture",Fixture); class Instance extends globalThis.AudioWorkletProcessor {constructor(){super();this.calls=0;this.process=()=>{this.calls++;return true}}} globalThis.registerProcessor("instance",Instance);';
    const raw = { state: 'running', currentTime: 0, createGain: () => new Node(), audioWorklet: { async addModule(url) { vm.runInContext('{' + await blobs.get(url).text() + '}', audioScope); } } };
    const record = { active: true, soundEnabled: true, storage: {}, trackId: 'track-1', getContext: () => raw, getInput: () => new Node(), notify() {} };
    class Worklet extends Node { constructor(context, name) { super(); this.processor = new (processors.get(name))(); this.port = { postMessage: value => this.processor.port.receive(value) }; } }
    const scope = { parent: { __LoomHostRegistry: { fixture: record } }, navigator: {}, document: { addEventListener() {} }, Blob, DOMException, Event, AudioWorkletNode: Worklet, addEventListener() {}, fetch: async () => ({ ok: true, text: async () => instrumentModule }), URL: { createObjectURL(blob) { const id = 'blob:' + ++serial; blobs.set(id, blob); return id; }, revokeObjectURL(id) { blobs.delete(id); } } }; scope.window = scope; vm.createContext(scope);
    vm.runInContext(source('host-bridge.js'), scope); vm.runInContext(scope.LoomHostBridge.source('fixture'), scope);
    const a = new scope.AudioContext(), b = new scope.AudioContext(); await a.audioWorklet.addModule('fixture.js'); await b.audioWorklet.addModule('fixture.js');
    const first = new scope.AudioWorkletNode(a, 'fixture'), sibling = new scope.AudioWorkletNode(b, 'fixture'), instance = new scope.AudioWorkletNode(a, 'instance');
    const input = [[new Float32Array([.125, -.25, .75])]], output = [[new Float32Array(3)]];
    assert.equal(first.processor.process(input, output, { gain: new Float32Array([.5]) }), true); assert.deepEqual(Array.from(output[0][0]), Array.from(input[0][0]));
    assert.equal(first.processor.constructor.parameterDescriptors[0].name, 'gain'); first.port.postMessage({ type: 'ordinary' }); assert.equal(first.processor.messages, 1);
    instance.processor.process(); first.disconnect(); instance.disconnect(); assert.equal(a._worklets.size, 2);
    await a.close(); assert.equal(first.processor.process(input, output, {}), false); assert.equal(instance.processor.process(), false); assert.equal(first.processor.calls, 1); assert.equal(instance.processor.calls, 1); assert.equal(first.processor.messages, 1);
    assert.equal(sibling.processor.process(input, output, {}), true); assert.equal(raw.state, 'running'); assert.equal(a._worklets.size, 0); await b.close();
  });
  await check('Disabling and rejoining a note track preserves every other held note and uses the current transport', async () => {
    const packet = { lengthBeats: 8, swing: 0, seed: 1, voices: [{ id: 'keys' }], notes: [{ id: 'held', voice: 'keys', pitch: 60, velocity: .8, probability: 1, beat: 0, duration: 8 }] }, notes = [], canceled = [], ensured = [];
    const state = { tempo: 120, tracks: [1, 2].map(index => ({ id: 'track-' + index, name: 'Track ' + index, instrument: { id: 'fixture' }, instrumentLive: false, clips: [{ id: 'clip-' + index, type: 'notes', pattern: packet, start: 0, length: 8, sourceOffset: 0, rate: 1, loop: false, gain: 1, transpose: 0, voiceMap: {} }] })) };
    const clock = { playing: true, revision: 1, contextTime: 1, beat: 0, absoluteBeat: 0, tempo: 120, countInBeatsRemaining: 0, endBeat: 16, loopEnabled: false, cycle: 0 }, adapter = { notes: { pitched: true, voices: [{ id: 'keys' }] }, scheduleNote() {} };
    const host = { records: new Map(), getPatternAdapter: () => adapter, command: async () => true, setClockDriven() {}, cancelNotes(id, options) { canceled.push({ id, options }); }, scheduleNote(id, event) { notes.push({ id, event }); return true; } };
    const scope = { DOMException, AbortController, setInterval: () => 1, clearInterval() {} }; scope.window = scope; vm.runInNewContext(source('note-playback.js'), scope);
    const playback = new scope.LoomNotePlayback({ audio: { getTransport: () => clock, subscribeTransport: () => () => {} }, host, getState: () => state, ensureInstrument: async track => { ensured.push(track.id); return true; } });
    await playback.prepare(); playback.start(); const initialOtherNotes = notes.filter(note => note.id === 'track-2').length; canceled.length = 0;
    state.tracks[0].disabled = true; playback.setState(); assert(!playback.tracks.has('track-1')); assert.equal(canceled.filter(note => note.id === 'track-2').length, 0);
    clock.contextTime = 2; clock.beat = clock.absoluteBeat = 2; state.tracks[0].disabled = false; playback.setState(); for (let i = 0; i < 12; i++) await Promise.resolve();
    assert(playback.tracks.has('track-1')); assert.equal(canceled.filter(note => note.id === 'track-2').length, 0); assert.equal(notes.filter(note => note.id === 'track-2').length, initialOtherNotes);
    const resumed = notes.filter(note => note.id === 'track-1').at(-1); assert(resumed.event.when >= clock.contextTime); assert(resumed.event.durationSeconds < 3.01 && resumed.event.durationSeconds > 2.9); playback.dispose();
    state.tracks[0].disabled = true; ensured.length = 0; const cold = new scope.LoomNotePlayback({ audio: { getTransport: () => clock, subscribeTransport: () => () => {} }, host, getState: () => state, ensureInstrument: async track => { ensured.push(track.id); return true; } }); await cold.prepare(); assert.deepEqual(ensured, ['track-2']); cold.dispose();
  });
  await check('Disabled note renders allocate no hidden instrument frames and active owned sessions cancel independently', async () => {
    let frames = 0, disposed = 0;
    const scope = { DOMException, Float32Array, setTimeout, document: { createElement: () => ({ style: {}, setAttribute() {}, remove() {} }), body: { append() { frames++; } } }, LoomInstrumentHost: class { dispose() { disposed++; } } }; scope.window = scope; vm.runInNewContext(source('note-renderer.js'), scope);
    const renderer = new scope.LoomNoteRenderer(), track = { id: 'track-1', disabled: true, clips: [{ id: 'part', type: 'notes' }] }, state = { tracks: [track] };
    assert.equal((await renderer.prepareNotes(state)).generatedIds.length, 0); assert.equal((await renderer.prepareNotes(state, {}, { preserveTails: true })).generatedIds.length, 0);
    await assert.rejects(renderer.print(state, 'track-1', 'part'), /Enable/); assert.equal(frames, 0);
    const first = renderer._session(null, ['track-1']), other = renderer._session(null, ['track-2']); await renderer.setDisabled('track-1'); assert(first.closed); assert(!other.closed); assert.equal(disposed, 1); await renderer.dispose(); assert.equal(disposed, 2);
  });
  console.log(passed.length + ' disabled hosted-instrument lifecycle groups passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
