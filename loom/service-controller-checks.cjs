'use strict';

// Controller-level checks use the real project/SERVICE schemas, MIDI router and
// capture compiler. Only the desk UI, hardware and asynchronous engine boundary
// are replaced, so lifecycle races can be exercised without browser timing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const clone = value => JSON.parse(JSON.stringify(value));
const passed = [], failures = [];
const fixtures = new Set();
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const withoutService = state => { const value = clone(state); delete value.service; return value; };

class EventTarget {
  constructor() { this.events = new Map(); }
  addEventListener(name, fn) { if (!this.events.has(name)) this.events.set(name, new Set()); this.events.get(name).add(fn); }
  removeEventListener(name, fn) { this.events.get(name)?.delete(fn); }
  emit(name, value = {}) { for (const fn of [...this.events.get(name) || []]) fn(value); }
}
function fixture(options = {}) {
  const scope = new EventTarget(), document = new EventTarget(), access = new EventTarget(), input = new EventTarget();
  document.visibilityState = 'visible'; Object.assign(input, { id: 'controller-one', type: 'input', name: 'Fake pads', state: 'connected' });
  input.send = (...data) => input.emit('midimessage', { data: new Uint8Array(data), receivedTime: 9 }); access.inputs = new Map([[input.id, input]]);
  const intervals = new Map(); let timerId = 0, midiRequests = 0;
  Object.assign(scope, { Blob, DOMException, AbortController, TextEncoder, Map, Set, Promise, Number, Math, Date, Float32Array,
    setTimeout, clearTimeout, crypto: webcrypto, document, isSecureContext: true,
    setInterval: fn => { const id = ++timerId; intervals.set(id, fn); return id; }, clearInterval: id => intervals.delete(id),
    navigator: { requestMIDIAccess: async () => { midiRequests++; return access; } },
    btoa: value => Buffer.from(value, 'binary').toString('base64'), atob: value => Buffer.from(value, 'base64').toString('binary') });
  scope.window = scope; vm.createContext(scope);
  const shared = fs.existsSync(path.join(__dirname, 'shared', 'pattern-schema.js')) ? path.join(__dirname, 'shared', 'pattern-schema.js') : path.join(__dirname, '..', 'shared', 'pattern-schema.js');
  vm.runInContext(fs.readFileSync(shared, 'utf8'), scope, { filename: 'pattern-schema.js' });
  for (const filename of ['vocal-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'effects.js', 'schema.js', 'audio-engine.js', 'service-schema.js', 'service-midi.js', 'service-capture.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, filename), 'utf8'), scope, { filename });
  }
  const S = scope.LoomSchema;
  let state = S.defaultState(); state.name = 'Controller fixture'; state.tempo = 120; state.lengthBars = 8; state.loopStart = 0; state.loopEnd = 8;
  state.markers = [{ id: 'marker-one', name: 'First order', beat: 0, color: S.COLORS[0] }, { id: 'marker-two', name: 'Second order', beat: 4, color: S.COLORS[1] }];
  const pcm = Float32Array.from({ length: 16000 }, (_, frame) => .08 * Math.sin(2 * Math.PI * 83 * frame / 8000));
  const source = S.encodeAsset({ left: pcm, right: pcm, sampleRate: 8000, id: 'fixture-audio', name: 'Dry source' }); state.assets.push(source);
  const fx = scope.LoomEffectsCatalog.find(effect => effect.id === 'cinder');
  state.tracks.forEach((track, index) => {
    track.name = 'Station ' + (index + 1); track.effects[0] = S.effect({ type: fx.id, params: fx.defaults });
    for (let part = 0; part < 2; part++) track.clips.push({ id: `source-${index + 1}-${part + 1}`, name: `Original ${index + 1}/${part + 1}`, type: 'audio', assetId: source.id, start: part * 4, length: 4,
      sourceStart: 0, sourceEnd: 2, sourceOffset: 0, rate: 1, reverse: !!(index % 2), loop: true, gain: .7, fadeIn: .01, fadeOut: .02 });
  });
  if (options.notes) {
    state.tracks[0].instrument = { id: 'fable', name: 'STOCK', snapshot: { format: 'loom-instrument-state', version: 1, app: 'fable', state: { gain: .2 }, storage: {} } };
    state.tracks[0].clips[0] = { id: 'source-1-1', name: 'Editable notes', type: 'notes', pattern: { format: 'musiclab-pattern', version: 1, name: 'Original notes', sourceApp: 'fable', tempo: 120, swing: 0, meter: [4, 4], lengthBeats: 4,
      voices: [{ id: 'melody', name: 'Melody' }], notes: [{ id: 'note-one', beat: 0, duration: 1, pitch: 60, velocity: .8, voice: 'melody', probability: 1 }], seed: 7, tags: [] },
      voiceMap: { melody: 'keys' }, start: 0, length: 4, sourceOffset: 0, rate: 1, loop: true, gain: .7, fadeIn: .01, fadeOut: .02, transpose: 0 };
  }
  const initial = clone(state), assets = S.decodeAssets(state.assets), persist = [], commits = [], statuses = [], restores = [], preparations = [], starts = [], performances = [], queued = [], lifecycle = [];
  const control = { prepareError: null, prepareDeferred: null, suspendDeferred: null, initDeferred: null, initError: null, resumeDeferred: null, startDeferred: null, stopDeferred: null, stopBeat: null, allowed: true }, engineListeners = new Set();
  let engineGeneration = 0, engineActive = false, beat = 7.25, engineAssets = assets, suspendCount = 0, stopCount = 0;
  const engine = {
    context: null,
    init() {
      lifecycle.push('init'); if (control.initError) throw control.initError;
      if (!this.context) this.context = { state: 'suspended', resume() {
        lifecycle.push('resume');
        const complete = () => { this.state = 'running'; };
        return control.resumeDeferred ? control.resumeDeferred.promise.then(complete) : Promise.resolve().then(complete);
      } };
      return control.initDeferred ? control.initDeferred.promise : Promise.resolve(this.context);
    },
    subscribeService(fn) { engineListeners.add(fn); return () => engineListeners.delete(fn); },
    emit(event) { for (const fn of engineListeners) fn(event); },
    getMeters() { return { beat, playing: engineActive, tracks: state.tracks.map(() => ({ peak: .1 })) }; },
    getServiceState() { return { active: engineActive, beat }; },
    setAssets(value) { engineAssets = value; },
    async startService(packet) {
      lifecycle.push('start');
      const generation = ++engineGeneration; starts.push(clone(packet));
      if (control.startDeferred) await control.startDeferred.promise;
      if (generation !== engineGeneration) return false;
      beat = packet.fromBeat || 0; engineActive = true;
      this.emit({ type: 'scene', beat, scene: clone(packet.scene), sceneStarts: Array(8).fill(beat), padBeats: Array(8).fill(beat), phaseOrigins: Array(8).fill(0), tempo: state.tempo });
      this.setServicePerformance(packet.performance); return true;
    },
    stopService() {
      engineGeneration++; stopCount++; engineActive = false;
      const result = { active: false, beat: control.stopBeat ?? beat };
      return control.stopDeferred ? control.stopDeferred.promise.then(() => result) : Promise.resolve(result);
    },
    queueServiceScene(scene, config) { const seq = queued.length + 1; queued.push({ scene: clone(scene), config: clone(config), seq }); return seq; },
    setServicePerformance(performance) {
      performances.push(clone(performance));
      if (engineActive) this.emit({ type: 'performance', beat, performance: clone(performance), padBeats: Array(8).fill(beat), phaseOrigins: Array(8).fill(0), tempo: state.tempo });
    },
    panic() { this.stopService(); }
  };
  let ui;
  scope.LoomServiceUI = class {
    constructor(settings) { this.settings = settings; this.opens = 0; this.closes = 0; this.destroyed = false; ui = this; }
    open() { this.opens++; } close() { this.closes++; } destroy() { this.destroyed = true; }
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'service.js'), 'utf8'), scope, { filename: 'service.js' });
  const controller = new scope.LoomServiceController({ engine, getState: () => state, getAssets: () => assets, canOpen: () => control.allowed,
    persist(value, settings) { persist.push({ value: clone(value), settings: clone(settings) }); state.service = clone(value); },
    async prepareSources({ signal }) {
      lifecycle.push('prepare');
      const captured = S.copy(state); preparations.push({ signal });
      if (control.prepareDeferred) await control.prepareDeferred.promise;
      if (control.prepareError) throw control.prepareError;
      const renderedAssets = { ...assets };
      if (options.notes) {
        const print = S.encodeAsset({ left: pcm, right: pcm, sampleRate: 8000, id: 'private-notes', name: 'Private note print' });
        renderedAssets[print.id] = S.decodeAsset(print);
        const clip = captured.tracks[0].clips[0]; Object.assign(clip, { type: 'audio', assetId: print.id, sourceStart: 0, sourceEnd: 2, reverse: false }); delete clip.pattern; delete clip.voiceMap; delete clip.transpose;
      }
      return { state: captured, assets: renderedAssets, generatedIds: options.notes ? ['private-notes'] : [] };
    },
    async suspendArrangement() { suspendCount++; if (control.suspendDeferred) await control.suspendDeferred.promise; },
    restoreArrangement(value) { restores.push(value); beat = value; },
    async applyArrangement(next) { commits.push(clone(next)); state = S.copy(next); }, status: message => statuses.push(message) });
  const f = { controller, scope, document, access, input, engine, control, initial, assets, persist, commits, statuses, restores, preparations, starts, performances, queued, intervals, lifecycle,
    state: () => state, replaceState: value => { state = S.copy(value); }, ui: () => ui, requests: () => midiRequests,
    engineActive: () => engineActive, engineAssets: () => engineAssets, suspendCount: () => suspendCount, stopCount: () => stopCount,
    advance(value) { beat = value; controller._tick(); },
    flushScene(at = queued.length - 1) { const packet = queued[at]; engine.emit({ type: 'scene', seq: packet.seq, beat, scene: packet.scene, sceneStarts: Array(8).fill(beat), padBeats: Array(8).fill(beat), phaseOrigins: Array(8).fill(0), tempo: state.tempo }); },
    async open() { assert.equal(await controller.open(), true); },
    async capture() { await this.open(); await controller.perform('capture-toggle', { enabled: true }); await controller.perform('play'); this.advance(1); await controller.perform('macro-value', { macroId: 'macro-1', value: .8 }); this.advance(4); await controller.perform('scene-launch', { sceneId: controller.getSnapshot().service.scenes[1].id }); this.flushScene(); this.advance(8); await controller.perform('stop'); }
  };
  fixtures.add(f); return f;
}
async function check(name, run) {
  try { await run(); passed.push(name); }
  catch (error) { failures.push({ name, error }); }
  finally { for (const f of fixtures) { try { f.controller.destroy(); } catch (_) {} } fixtures.clear(); }
}

(async () => {
  await check('Opening and closing preserves every arrangement field, eight tracks, four slots and the original needle', async () => {
    const f = fixture(); const before = JSON.stringify(f.state()); await f.open();
    const snapshot = f.controller.getSnapshot(); assert.equal(snapshot.tracks.length, 8); assert(snapshot.service.scenes.every(scene => scene.slots.length === 8));
    assert.equal(f.state().tracks.length, 8); assert(f.state().tracks.every(track => track.effects.length === 4)); assert.equal(f.persist.length, 0); assert.equal(f.requests(), 0);
    await f.controller.close(); assert.equal(JSON.stringify(f.state()), before); assert.deepEqual(f.restores, [7.25]); assert.equal(f.intervals.size, 0); assert.equal(f.ui().opens, 1); assert.equal(f.ui().closes, 1);
  });
  await check('A blocked recording/operation never suspends Arrange, mounts the desk or requests MIDI', async () => {
    const f = fixture(); f.control.allowed = false; assert.equal(await f.controller.open(), false); assert.equal(f.suspendCount(), 0); assert.equal(f.ui().opens, 0); assert.equal(f.requests(), 0); assert.equal(f.persist.length, 0);
  });
  await check('Concurrent open requests mount one desk and own exactly one refresh timer', async () => {
    const f = fixture(); f.control.suspendDeferred = deferred(); const first = f.controller.open(), second = f.controller.open();
    f.control.suspendDeferred.resolve(); await Promise.all([first, second]); assert.equal(f.suspendCount(), 1); assert.equal(f.ui().opens, 1); assert.equal(f.intervals.size, 1);
    await f.controller.close(); assert.equal(f.intervals.size, 0);
  });
  await check('Close or reset during a pending open cannot reopen SERVICE after suspension finishes', async () => {
    for (const action of ['close', 'reset']) {
      const f = fixture(); f.control.suspendDeferred = deferred(); const opening = f.controller.open();
      if (action === 'close') await f.controller.close(); else f.controller.reset();
      f.control.suspendDeferred.resolve(); await opening; assert.equal(f.controller.isOpen, false); assert.equal(f.intervals.size, 0); assert.equal(f.persist.length, 0);
    }
  });
  await check('Preparation failure retains the source project and asset map and never starts playback', async () => {
    const f = fixture(); await f.open(); f.control.prepareError = Error('Private source failed'); const before = JSON.stringify(f.state());
    assert.equal(await f.controller.perform('play'), false); assert.equal(f.starts.length, 0); assert.equal(f.engineActive(), false); assert.equal(f.controller.getSnapshot().busy, false); assert.equal(f.engineAssets(), f.assets); assert.equal(JSON.stringify(f.state()), before);
    assert.match(f.controller.getSnapshot().message, /Private source failed/);
  });
  await check('The trusted Play call initializes and unlocks audio synchronously before private source preparation', async () => {
    const f = fixture(); await f.open(); const playing = f.controller.perform('play');
    assert.deepEqual(f.lifecycle, ['init', 'resume']); assert.equal(f.preparations.length, 0);
    await playing; assert.deepEqual(f.lifecycle, ['init', 'resume', 'prepare', 'start']); assert.equal(f.engine.context.state, 'running'); assert.equal(f.starts.length, 1);
  });
  await check('Stop, close and reset during pending audio initialization or unlock cannot prepare sources or play later', async () => {
    for (const pending of ['initDeferred', 'resumeDeferred']) for (const action of ['stop', 'close', 'reset']) {
      const f = fixture(); await f.open(); f.control[pending] = deferred(); const playing = f.controller.perform('play');
      assert.deepEqual(f.lifecycle, ['init', 'resume']); assert.equal(f.controller.getSnapshot().busy, true);
      if (action === 'reset') f.controller.reset(); else await f.controller.perform(action);
      f.control[pending].resolve(); await playing;
      assert.equal(f.preparations.length, 0); assert.equal(f.starts.length, 0); assert.equal(f.engineActive(), false); assert.equal(f.engineAssets(), f.assets); assert.equal(f.controller.getSnapshot().busy, false); assert.equal(f.persist.length, 0);
    }
  });
  await check('A synchronous audio-device initialization failure leaves SERVICE usable and the project unchanged', async () => {
    const f = fixture(); await f.open(); f.control.initError = Error('Audio device unavailable');
    assert.equal(await f.controller.perform('play'), false); assert.equal(f.preparations.length, 0); assert.equal(f.starts.length, 0); assert.equal(f.controller.getSnapshot().busy, false); assert.deepEqual(clone(f.state()), f.initial);
    f.control.initError = null; await f.controller.perform('play'); assert.equal(f.starts.length, 1);
  });
  await check('Stop, close and reset invalidate even an uncancellable pending source preparation', async () => {
    for (const action of ['stop', 'close', 'reset']) {
      const f = fixture(); await f.open(); f.control.prepareDeferred = deferred(); const playing = f.controller.perform('play');
      for (let turn = 0; turn < 20 && !f.preparations.length; turn++) await Promise.resolve(); assert.equal(f.preparations.length, 1);
      assert.equal(f.controller.getSnapshot().busy, true); if (action === 'reset') f.controller.reset(); else await f.controller.perform(action);
      assert.equal(f.preparations[0].signal.aborted, true); f.control.prepareDeferred.resolve(); await playing;
      assert.equal(f.starts.length, 0); assert.equal(f.engineActive(), false); assert.equal(f.engineAssets(), f.assets); assert.equal(f.commits.length, 0); assert.equal(f.controller.getSnapshot().busy, false);
    }
  });
  await check('SERVICE packets preserve source sound controls while placing independent clip copies at beat zero', async () => {
    const f = fixture(); await f.open(); await f.controller.perform('play'); assert.equal(f.starts.length, 1);
    const packet = f.starts[0]; assert.equal(packet.scene.clips.length, 8); assert.equal(packet.scene.holds.length, 8); assert.equal(packet.performance.drops.length, 8);
    packet.scene.clips.forEach((clip, index) => { assert.equal(clip.start, 0); for (const field of ['assetId', 'sourceStart', 'sourceEnd', 'sourceOffset', 'rate', 'reverse', 'loop', 'gain', 'fadeIn', 'fadeOut']) assert.equal(clip[field], f.initial.tracks[index].clips[0][field]); });
    for (const override of packet.performance.overrides) if (override.target === 'level') assert.equal(override.value, .8); else if (override.target === 'pan') assert.equal(override.value, 0); else if (override.target === 'fx:0:drive') assert.equal(override.value, 8);
    assert.deepEqual(withoutService(f.state()), f.initial); assert.equal(f.persist.length, 0); await f.controller.close(); assert.equal(f.engineAssets(), f.assets);
  });
  await check('Stop or close during an asynchronous engine start cannot revive playback or replace a stop message', async () => {
    for (const action of ['stop', 'close']) {
      const f = fixture(); await f.open(); f.control.startDeferred = deferred(); const playing = f.controller.perform('play');
      for (let turn = 0; turn < 20 && !f.starts.length; turn++) await Promise.resolve(); assert.equal(f.starts.length, 1);
      await f.controller.perform(action); const message = f.controller.getSnapshot().message; f.control.startDeferred.resolve(); await playing;
      assert.equal(f.controller.getSnapshot().running, false); assert.equal(f.engineActive(), false); assert.equal(f.engineAssets(), f.assets); assert.equal(f.controller.getSnapshot().message, message); assert.equal(f.persist.length, 0);
    }
  });
  await check('Scene queues use configured quantization and active clip cells update only on engine launch events', async () => {
    const f = fixture(); await f.open(); await f.controller.perform('play'); const first = f.controller.getSnapshot().activeSceneId, second = f.controller.getSnapshot().service.scenes[1].id;
    await f.controller.perform('quantize', { value: 8 }); await f.controller.perform('scene-launch', { sceneId: second }); assert.equal(f.queued[0].config.quantize, '2bar');
    assert.equal(f.controller.getSnapshot().queuedSceneId, second); assert.equal(f.controller.getSnapshot().activeSceneId, first);
    f.advance(8); f.flushScene(); assert.equal(f.controller.getSnapshot().activeSceneId, second); assert.equal(f.controller.getSnapshot().queuedSceneId, null); assert.deepEqual(f.controller.activeClips, f.initial.tracks.map(track => track.clips[1].id));
  });
  await check('A late launch acknowledgement cannot erase the next scene already queued by the player', async () => {
    const f = fixture(); await f.open(); await f.controller.perform('play'); const [first, second] = f.controller.getSnapshot().service.scenes;
    await f.controller.perform('scene-launch', { sceneId: second.id }); await f.controller.perform('scene-launch', { sceneId: first.id }); f.advance(4); f.flushScene(0);
    assert.equal(f.controller.getSnapshot().activeSceneId, second.id); assert.equal(f.controller.getSnapshot().queuedSceneId, first.id); f.advance(8); f.flushScene(1); assert.equal(f.controller.getSnapshot().queuedSceneId, null);
  });
  await check('Macros and overlapping UI pads emit bounded performance payloads without changing arrangement parameters', async () => {
    const f = fixture(); await f.open(); await f.controller.perform('play'); await f.controller.perform('macro-value', { macroId: 'macro-1', value: 999 });
    assert.equal(f.controller.getSnapshot().service.macros[0].value, 1); assert(f.performances.at(-1).overrides.filter(item => item.target === 'level').every(item => item.value <= 1.5));
    await f.controller.perform('pad', { kind: 'stutter', rate: .5, active: true, source: 'pointer-one' }); await f.controller.perform('pad', { kind: 'stutter', rate: .125, active: true, source: 'pointer-two' }); assert.equal(f.performances.at(-1).stutterBeats, .125);
    await f.controller.perform('pad', { kind: 'stutter', rate: .125, active: false, source: 'pointer-two' }); assert.equal(f.performances.at(-1).stutterBeats, .5);
    await f.controller.perform('pad', { kind: 'drop', active: true, trackIds: ['track-2'], source: 'pointer-drop' }); assert.deepEqual(f.performances.at(-1).drops, [false, true, false, false, false, false, false, false]);
    assert.deepEqual(withoutService(f.state()), f.initial); await f.controller.perform('stop'); assert.equal(f.controller.getSnapshot().padState.stutter, 0); assert(f.controller.getSnapshot().padState.drops.every(value => value === false));
  });
  await check('Drop targets can be chosen before pressing the pad, changed while held and released with all other pads', async () => {
    const f = fixture(); await f.open(); await f.controller.perform('play'); await f.controller.perform('pad-targets', { trackIds: ['track-3', 'track-7', 'unknown-track'] });
    await f.controller.perform('pad', { kind: 'drop', active: true, source: 'test-drop' }); assert.deepEqual(f.performances.at(-1).drops, [false, false, true, false, false, false, true, false]);
    await f.controller.perform('pad-targets', { trackIds: ['track-2'] }); assert.deepEqual(f.performances.at(-1).drops, [false, true, false, false, false, false, false, false]);
    await f.controller.perform('pad', { kind: 'fill', active: true }); await f.controller.perform('pad', { kind: 'stutter', active: true, rate: .5 }); await f.controller.perform('release-pads');
    assert(f.performances.at(-1).drops.every(value => value === false)); assert.equal(f.performances.at(-1).fill, false); assert.equal(f.performances.at(-1).stutterBeats, 0); assert.deepEqual(withoutService(f.state()), f.initial);
  });
  await check('MIDI Learn persists only explicit bindings and MIDI cannot trigger closed SERVICE', async () => {
    const f = fixture(); await f.open(); await f.controller.perform('midi-enable'); assert.equal(f.requests(), 1);
    await f.controller.perform('midi-learn', { target: 'macro:macro-1' }); f.input.send(0xb0, 74, 64); assert.equal(f.state().service.midiBindings.length, 1); assert.equal(f.controller.getSnapshot().service.macros[0].value, .5);
    f.input.send(0xb0, 74, 127); assert.equal(f.controller.getSnapshot().service.macros[0].value, 1); assert.deepEqual(withoutService(f.state()), f.initial);
    await f.controller.close(); const saves = f.persist.length; f.input.send(0xb0, 74, 0); assert.equal(f.persist.length, saves); assert.equal(f.starts.length, 0);
  });
  await check('MIDI momentary pads are released by blur and desk close through the real MIDI lifecycle', async () => {
    const f = fixture(); await f.open(); await f.controller.perform('midi-enable'); await f.controller.perform('midi-learn', { target: 'pad:fill' }); f.input.send(0x90, 60, 127); f.input.send(0x80, 60, 0);
    await f.controller.perform('play'); f.input.send(0x90, 60, 127); assert.equal(f.controller.getSnapshot().padState.fill, true);
    f.scope.emit('blur'); assert.equal(f.controller.getSnapshot().padState.fill, false); f.input.send(0x90, 60, 127); assert.equal(f.controller.getSnapshot().padState.fill, false);
    f.scope.emit('focus'); f.input.send(0x90, 60, 127); assert.equal(f.controller.getSnapshot().padState.fill, true); await f.controller.close(); assert.equal(f.controller.getSnapshot().midi.active, false); assert.equal(f.controller.getSnapshot().padState.fill, false);
  });
  await check('Stopping a captured take persists SERVICE metadata but never silently replaces source clips', async () => {
    const f = fixture(); await f.capture(); const take = f.state().service.take; assert.equal(take.lengthBeats, 8); assert(take.events.length >= 4); assert(take.events.some(event => event.kind === 'scene' && event.beat === 4));
    assert.equal(f.commits.length, 0); assert.deepEqual(withoutService(f.state()), f.initial); assert.equal(f.persist.at(-1).settings.remember, false); assert.equal(f.controller.getSnapshot().capture.canApply, true);
    const project = f.scope.LoomSchema.parseProject(f.scope.LoomSchema.serializeProject(f.state())); assert.deepEqual(clone(project.service.take), take);
  });
  await check('Create arrangement is one explicit commit through the real compiler and preserves all eight tracks/four slots', async () => {
    const f = fixture(); await f.capture(); const before = clone(f.state()); await f.controller.perform('capture-apply'); assert.equal(f.commits.length, 1);
    const applied = f.commits[0]; assert.equal(applied.tracks.length, 8); assert(applied.tracks.every(track => track.effects.length === 4)); assert.equal(applied.lengthBars, 2); assert(applied.tracks.every(track => track.clips.length > 0)); assert.equal(applied.service, undefined); assert.equal(f.controller.isOpen, false);
    assert.deepEqual(applied.tracks.map(track => track.effects), before.tracks.map(track => track.effects)); assert.deepEqual(applied.assets, before.assets); assert(applied.tracks.some(track => track.automation.some(lane => lane.target === 'level')));
  });
  await check('Concurrent Create arrangement clicks cannot commit the same take twice while close awaits the audio engine', async () => {
    const f = fixture(); await f.capture(); await Promise.all([f.controller.perform('capture-apply'), f.controller.perform('capture-apply')]); assert.equal(f.commits.length, 1); assert.equal(f.controller.isOpen, false);
  });
  await check('Capture ends at the acknowledged audio-clock beat rather than the last UI refresh', async () => {
    const f = fixture(); await f.open(); await f.controller.perform('capture-toggle', { enabled: true }); await f.controller.perform('play'); f.advance(8); f.control.stopBeat = 8.125;
    await f.controller.perform('stop'); assert.equal(f.state().service.take.lengthBeats, 8.125); assert.equal(f.controller.getSnapshot().beat, 8.125);
  });
  await check('Concurrent Stop and Close share the audio acknowledgement and finish capture once before restoring Arrange', async () => {
    const f = fixture(); await f.open(); await f.controller.perform('capture-toggle', { enabled: true }); await f.controller.perform('play'); f.advance(8);
    f.control.stopBeat = 8.125; f.control.stopDeferred = deferred(); const stopping = f.controller.perform('stop'), secondStop = f.controller.perform('stop'), closing = f.controller.close();
    assert.equal(f.stopCount(), 1); assert.equal(f.persist.filter(entry => entry.value.take).length, 0); f.control.stopDeferred.resolve(); await Promise.all([stopping, secondStop, closing]);
    assert.equal(f.state().service.take.lengthBeats, 8.125); assert.equal(f.persist.filter(entry => entry.value.take).length, 1); assert.deepEqual(f.restores, [7.25]); assert.equal(f.controller.isOpen, false); assert.equal(f.intervals.size, 0);
  });
  await check('Privately prepared notes stay editable in the source project and embed their patch/provenance only when applying', async () => {
    const f = fixture({ notes: true }); await f.capture(); assert.equal(f.state().tracks[0].clips[0].type, 'notes'); assert.equal(f.state().assets.length, 1); assert.equal(f.commits.length, 0);
    await f.controller.perform('capture-apply'); assert.equal(f.commits.length, 1); const applied = f.commits[0], printed = applied.tracks[0].clips.find(clip => clip.assetId === 'private-notes');
    assert(printed); assert.equal(printed.origin.instrument.id, 'fable'); assert.equal(printed.origin.sourceClip.type, 'notes'); assert.deepEqual(printed.origin.pattern, clone(f.scope.LoomSchema.pattern(f.initial.tracks[0].clips[0].pattern))); assert(applied.assets.some(asset => asset.id === 'private-notes'));
  });
  await check('Failed capture preparation cannot close SERVICE, commit an arrangement or discard the saved take', async () => {
    const f = fixture(); await f.capture(); f.controller.prepared = null; f.control.prepareError = Error('Print could not be prepared'); const before = clone(f.state().service.take);
    assert.equal(await f.controller.perform('capture-apply'), false); assert.equal(f.commits.length, 0); assert.equal(f.controller.isOpen, true); assert.deepEqual(f.state().service.take, before); assert.equal(f.controller.getSnapshot().busy, false);
  });
  await check('Reset or close during capture preparation cancels the pending apply and cannot overwrite a replacement project', async () => {
    for (const action of ['close', 'reset']) {
      const f = fixture(); await f.capture(); f.controller.prepared = null; f.control.prepareDeferred = deferred(); const applying = f.controller.perform('capture-apply');
      if (action === 'close') await f.controller.close(); else f.controller.reset(); const replacement = clone(f.initial); replacement.name = 'New session must survive'; f.replaceState(replacement);
      assert.equal(f.preparations.at(-1).signal.aborted, true); f.control.prepareDeferred.resolve(); await applying; assert.equal(f.commits.length, 0); assert.equal(f.state().name, replacement.name); assert.equal(f.controller.isOpen, false); assert.equal(f.controller.getSnapshot().busy, false);
    }
  });
  await check('Replacing the project during the final close acknowledgement cannot commit a stale compiled take', async () => {
    const f = fixture(); await f.capture(); const applying = f.controller.perform('capture-apply');
    f.controller.reset(); const replacement = clone(f.initial); replacement.name = 'Replacement during commit must survive'; f.replaceState(replacement); await applying;
    assert.equal(f.commits.length, 0); assert.equal(f.state().name, replacement.name); assert.equal(f.controller.isOpen, false);
  });
  await check('Destroy unsubscribes the engine/MIDI and clears the timer after held controls', async () => {
    const f = fixture(); await f.open(); await f.controller.perform('play'); await f.controller.perform('pad', { kind: 'fill', active: true }); f.controller.destroy();
    assert.equal(f.intervals.size, 0); assert.equal(f.controller.isOpen, false); assert.equal(f.engineActive(), false); assert.equal(f.ui().destroyed, true); assert.equal(f.controller.getSnapshot().midi.enabled, false); assert.equal(f.controller.padHolds.size, 0);
  });
  for (const name of passed) console.log('PASS', name);
  for (const item of failures) console.error('FAIL', item.name, '\n' + item.error.stack);
  console.log(`SERVICE controller: ${passed.length} passed, ${failures.length} failed.`);
  if (failures.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
