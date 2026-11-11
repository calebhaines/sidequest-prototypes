/* One instance per native JavaScriptCore context. Only the native preparation
 * worker constructs/replaces an instance; render uses preallocated 128-frame
 * channel views and the host's sample/MIDI clock, without an open web editor. */
(function (g) {
  'use strict';
  const QUANTUM = 128, EVENT_FIELDS = 8, MAX_EVENTS = 4096;
  const env = g.KitchenNativeEnvironment;
  if (!env) throw Error('Load the native language environment before the host runtime.');
  let descriptors = [], backend = null, descriptor = null, sourceId = '', family = '', rate = 48000, capacity = 0;
  let parameters = [], parameterValues = [], ready = false, preparing = false, error = '', generation = 0;
  let captureTake = null, captureSerial = 0, captureClearedToken = null;
  let frameEpoch = null, frameBase = 0, lastBackendEnd = 0, lastRawEnd = null, lastTempo = 120, fallbackBeat = 0;
  let scratchL, scratchR, viewsL, viewsR, indices;
  const clock = { sampleRate: 48000, tempo: 120, bpm: 120, beat: 0, ppqPosition: 0, playing: false, frame: 0, samplePosition: 0, revision: 0, timeSigNumerator: 4, timeSigDenominator: 4, timeSig: { numerator: 4, denominator: 4 }, looping: false, loopStart: 0, loopEnd: 0, recording: false };
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
  function fail(cause) { error = cause instanceof Error ? cause.message : String(cause); ready = false; preparing = false; throw cause instanceof Error ? cause : Error(error); }
  function configureDescriptors(data) {
    const list = Array.isArray(data) ? data : Array.isArray(data?.products) ? data.products : data && typeof data === 'object' && data.id ? [data] : [];
    if (!list.length) throw Error('Native plugin product descriptors are missing.');
    descriptors = list; return descriptors.length;
  }
  function registryFor(product, id) {
    const choices = [
      ['effect', g.KitchenEffectPlugins], ['core', g.KitchenCoreInstruments],
      ['web-audio', g.KitchenWebAudioInstruments], ['morsel', g.KitchenMorselPlugin]
    ].filter(([, registry]) => registry && registry.ids && Array.from(registry.ids).includes(id));
    const kind = product.kind || product.definition?.kind || (String(product.id).startsWith('effect') ? 'effect' : '');
    const selected = kind === 'effect' ? choices.filter(([name]) => name === 'effect') : kind === 'instrument' ? choices.filter(([name]) => name !== 'effect') : choices;
    if (selected.length !== 1) throw Error(selected.length ? 'Ambiguous native source ' + id + '; supply product.kind.' : 'Missing original DSP adapter for ' + id + '.');
    return selected[0];
  }
  function optionsFor(definition) { return definition.options || definition.choices || definition.values || []; }
  function valueOf(option) { return option && typeof option === 'object' && own(option, 'value') ? option.value : option; }
  function actualValue(definition, normalized) {
    const n = clamp(normalized, 0, 1), options = optionsFor(definition);
    if (definition.type === 'boolean' || definition.type === 'toggle') return n >= .5;
    if (options.length) return valueOf(options[Math.round(n * (options.length - 1))]);
    const minimum = finite(definition.min, 0), maximum = finite(definition.max, 1);
    return minimum + n * (maximum - minimum);
  }
  function normalizedValue(definition, value) {
    const options = optionsFor(definition);
    if (definition.type === 'boolean' || definition.type === 'toggle') return value ? 1 : 0;
    if (options.length) { const at = options.findIndex(option => valueOf(option) === value); return at < 0 || options.length < 2 ? 0 : at / (options.length - 1); }
    const minimum = finite(definition.min, 0), maximum = finite(definition.max, 1);
    return maximum > minimum && Number.isFinite(value) ? clamp((value - minimum) / (maximum - minimum), 0, 1) : 0;
  }
  function atPath(object, path) { const parts = Array.isArray(path) ? path : String(path).replace(/\[(\d+)\]/g, '.$1').split('.'); for (const key of parts) { if (object == null) return undefined; object = object[key]; } return object; }
  function pathOf(definition) { return Array.isArray(definition.path) ? definition.path.join('.') : String(definition.path || definition.key || definition.id || ''); }
  function resourcePath(name) {
    const path = String(name).replace(/^\.\//, '');
    if (!path || path.startsWith('/') || path.includes('..') || path.includes(':') || path.includes('\\')) throw Error('Invalid native resource path.');
    return path.startsWith('assets/') ? path : 'assets/' + sourceId + '/' + path;
  }
  function readResource(name, asText) {
    if (typeof g.KitchenNativeReadResource !== 'function') throw Error('Native resource reader is unavailable: ' + name);
    const result = g.KitchenNativeReadResource(resourcePath(name), asText);
    if (result == null) throw Error('Missing native resource: ' + resourcePath(name));
    if (asText) return String(result);
    if (result instanceof ArrayBuffer) return new Uint8Array(result);
    if (ArrayBuffer.isView(result)) return new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
    throw Error('Native resource reader did not provide bytes.');
  }
  function makeResources() {
    const resources = { nativeSequence: true, followHost: true, followDAW: true, readText: name => readResource(name, true), readBytes: name => readResource(name, false) };
    return resources;
  }
  function stateValue(text) {
    if (text === undefined || text === null || text === '') return undefined;
    if (typeof text === 'string') return JSON.parse(text);
    if (typeof text !== 'object') throw TypeError('Native state must be a JSON object.');
    return text;
  }
  function status() { return { ready, preparing, error: error || null, id: descriptor?.id || null, sourceId: sourceId || null, family: family || null, latencySamples: backend ? latency() : 0 }; }
  function watchPreparation(result, token) {
    if (result && typeof result.then === 'function') {
      preparing = true; ready = false;
      Promise.resolve(result).then(() => { if (generation !== token) return; preparing = false; ready = true; }, cause => { if (generation !== token) return; preparing = false; ready = false; error = cause?.message || String(cause); });
    } else { preparing = false; ready = true; }
  }
  function create(id, sampleRate, maxBlock, stateJSON) {
    try {
      if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw RangeError('Native sample rate must be 8–192 kHz.');
      if (!Number.isInteger(maxBlock) || maxBlock < 1 || maxBlock > 65536) throw RangeError('Native block capacity must be 1–65536 frames.');
      if (!descriptors.length) configureDescriptors(g.KitchenPluginDescriptors || g.KitchenPluginProducts || g.KitchenPluginDescriptor);
      const product = descriptors.find(value => value.id === id); if (!product) throw Error('Unknown native plugin product ' + id + '.');
      if (backend?.dispose) backend.dispose();
      backend = null; captureTake = null; captureClearedToken = null; descriptor = product; sourceId = String(product.sourceId || product.instrumentId || product.effectId || product.id).replace(/^(?:instrument|effect)[:-]/, '');
      const selection = registryFor(product, sourceId); family = selection[0]; rate = sampleRate; capacity = maxBlock;
      parameters = product.parameters || product.definition?.parameters || selection[1].definitions().find(definition => definition.id === sourceId)?.parameters || [];
      frameEpoch = null; frameBase = lastBackendEnd = 0; lastRawEnd = null; fallbackBeat = 0; lastTempo = 120;
      scratchL = new Float32Array(QUANTUM); scratchR = new Float32Array(QUANTUM);
      viewsL = Array.from({ length: QUANTUM + 1 }, (_, length) => scratchL.subarray(0, length)); viewsR = Array.from({ length: QUANTUM + 1 }, (_, length) => scratchR.subarray(0, length)); indices = new Int32Array(MAX_EVENTS);
      ready = false; preparing = true; error = ''; env.configure({ sampleRate, clearTimers: true });
      const resources = makeResources();
      // Only generated, trusted local scripts are evaluated, on preparation.
      for (const script of product.bootstrapScripts || product.definition?.bootstrapScripts || []) (0, eval)(resources.readText(script));
      let initial = stateValue(stateJSON);
      if (initial == null) {
        if (product.defaultStateResource) initial = JSON.parse(resources.readText(product.defaultStateResource));
        else if (product.defaultState != null) initial = product.defaultState;
      }
      if (sourceId === 'morsel' && !initial?.bank && !g.KitchenMorselDefaultBank) {
        const name = product.defaultBankResource || product.definition?.defaultBankResource || 'morsel-bank.json';
        resources.morselBank = JSON.parse(resources.readText(name));
      }
      const token = ++generation;
      backend = selection[1].create(sourceId, sampleRate, initial, resources);
      if (!backend || typeof backend.process !== 'function' || typeof backend.getState !== 'function') throw Error('The original DSP adapter has an incomplete native interface.');
      const state = backend.getState();
      parameterValues = parameters.map(definition => {
        const path = pathOf(definition), value = path === '_nativeSequence' ? (sourceId === 'morsel' ? state.followHost !== false : true) : atPath(state, path) ?? atPath(state.state, path) ?? definition.default;
        return normalizedValue(definition, value);
      });
      const preparation = typeof backend.prepare === 'function' ? backend.prepare() : backend.ready;
      watchPreparation(preparation, token); return status();
    } catch (cause) { return fail(cause); }
  }
  function prepareTick(milliseconds = 1) {
    try { if (error) throw Error(error); if (preparing) env.prepareTick(milliseconds); return JSON.stringify(status()); }
    catch (cause) { return fail(cause); }
  }
  function ioForRender(frames) {
    const io = g.KitchenHostIO;
    if (!io || !ArrayBuffer.isView(io.clock) || io.clock.length < 16) throw Error('Native host clock is missing.');
    for (const key of ['inputLeft', 'inputRight', 'outputLeft', 'outputRight']) if (!(io[key] instanceof Float32Array) || io[key].length < frames) throw Error('Native host stereo buffers are missing or too short.');
    if (io.outputLeft.buffer === io.outputRight.buffer && io.outputLeft.byteOffset === io.outputRight.byteOffset) throw Error('Native stereo output channels must be independent.');
    const count = Number(io.eventCount || 0);
    if (!Number.isInteger(count) || count < 0 || count > MAX_EVENTS || count && (!ArrayBuffer.isView(io.events) || io.events.length < count * EVENT_FIELDS)) throw Error('Invalid native MIDI event buffer.');
    return io;
  }
  function populateClock(raw, offset, baseBeat, localStart) {
    const tempo = raw[0] > 0 && Number.isFinite(raw[0]) ? raw[0] : lastTempo;
    const playing = !!raw[2], unwrapped = baseBeat + (playing ? offset * tempo / (60 * rate) : 0);
    const looping = !!raw[5] && Number.isFinite(raw[6]) && Number.isFinite(raw[7]) && raw[7] > raw[6];
    const span = looping ? raw[7] - raw[6] : 0, wraps = looping && unwrapped >= raw[7] ? Math.floor((unwrapped - raw[6]) / span) : 0;
    clock.sampleRate = rate; clock.tempo = clock.bpm = tempo;
    clock.beat = clock.ppqPosition = wraps ? raw[6] + ((unwrapped - raw[6]) % span + span) % span : unwrapped;
    clock.playing = playing; clock.frame = localStart + offset;
    clock.samplePosition = raw[15] && Number.isFinite(raw[8]) ? raw[8] + offset : localStart + offset;
    clock.revision = finite(raw[10], 0) + wraps;
    clock.timeSigNumerator = clock.timeSig.numerator = Math.max(1, Math.round(finite(raw[3], 4)));
    clock.timeSigDenominator = clock.timeSig.denominator = Math.max(1, Math.round(finite(raw[4], 4)));
    clock.looping = looping; clock.loopStart = finite(raw[6], 0); clock.loopEnd = finite(raw[7], 0); clock.recording = !!raw[13];
    return clock;
  }
  function indexEvents(io, frames) {
    const count = io.eventCount || 0, rows = io.events;
    for (let i = 0; i < count; i++) {
      const at = i * EVENT_FIELDS, offset = rows[at], type = rows[at + 1];
      if (!Number.isInteger(offset) || offset < 0 || offset > frames || !Number.isInteger(type) || type < 1 || type > 5 || !Number.isFinite(rows[at + 2]) || !Number.isFinite(rows[at + 3])) throw Error('Invalid native MIDI event.');
      let insert = i; while (insert > 0 && rows[indices[insert - 1] * EVENT_FIELDS] > offset) { indices[insert] = indices[insert - 1]; insert--; } indices[insert] = i;
    }
    return count;
  }
  function panic() { if (backend.allNotesOff) backend.allNotesOff(); else if (backend.panic) backend.panic(); }
  function dispatch(io, index, frame) {
    const at = index * EVENT_FIELDS, rows = io.events, type = rows[at + 1], first = Math.round(rows[at + 2]);
    const channel = clamp(Math.round(finite(rows[at + 4], 1)), 1, 16) - 1, identity = rows[at + 5];
    const event = { pitch: clamp(first, 0, 127), velocity: clamp(rows[at + 3], 0, 1), channel, frame, id: Number.isFinite(identity) && identity !== 0 ? identity : channel + ':' + first };
    if (type === 1 && event.velocity > 0) { if (backend.noteOn) backend.noteOn(event); }
    else if (type === 2 || type === 1) { if (backend.noteOff) backend.noteOff(event); }
    else if (type === 3) { if (first === 120 || first === 123) panic(); else if (backend.controlChange) backend.controlChange({ controller: clamp(first, 0, 127), value: clamp(rows[at + 3], 0, 1), channel, frame }); }
    else if (type === 4) { if (backend.pitchBend) backend.pitchBend({ value: clamp(rows[at + 3], -1, 1), channel, frame }); }
    else panic();
  }
  function render(frames) {
    try {
      if (!backend || !ready || error) throw Error(error || 'Native plugin preparation has not completed.');
      if (!Number.isInteger(frames) || frames < 0 || frames > capacity) throw RangeError('Render exceeds native block capacity.');
      const io = ioForRender(frames), raw = io.clock;
      if (raw[11] && raw[11] !== rate) throw Error('Sample-rate changes require preparing a new native engine.');
      const rawStart = finite(raw[9], lastRawEnd === null ? 0 : lastRawEnd);
      if (frameEpoch === null) { frameEpoch = rawStart; env.startAudio(frameBase); }
      if (lastRawEnd !== null && rawStart < lastRawEnd) throw Error('The native local sample clock moved backwards; reset the engine first.');
      const localStart = frameBase + rawStart - frameEpoch;
      const baseBeat = raw[14] && Number.isFinite(raw[1]) ? raw[1] : fallbackBeat;
      const eventCount = indexEvents(io, frames); let next = 0, offset = 0;
      io.outputEventCount = 0;
      env.advanceToFrame(localStart);
      do {
        populateClock(raw, offset, baseBeat, localStart);
        if (backend.transport) backend.transport(clock);
        while (next < eventCount && io.events[indices[next] * EVENT_FIELDS] === offset) dispatch(io, indices[next++], localStart + offset);
        env.advanceToFrame(localStart + offset);
        if (offset === frames) break;
        let count = Math.min(QUANTUM, frames - offset);
        if (next < eventCount) count = Math.min(count, io.events[indices[next] * EVENT_FIELDS] - offset);
        if (clock.looping && clock.playing && clock.beat < clock.loopEnd) {
          const boundary = Math.ceil((clock.loopEnd - clock.beat) * 60 * rate / clock.tempo - 1e-7); if (boundary > 0) count = Math.min(count, boundary);
        }
        const due = env.nextTimerFrame(); if (Number.isFinite(due)) count = Math.min(count, Math.max(1, due - (localStart + offset)));
        const left = viewsL[count], right = viewsR[count];
        if (family === 'effect') { for (let i = 0; i < count; i++) { left[i] = io.inputLeft[offset + i]; right[i] = io.inputRight[offset + i]; } }
        else { left.fill(0); right.fill(0); }
        backend.process(left, right, clock);
        for (let i = 0; i < count; i++) { io.outputLeft[offset + i] = left[i]; io.outputRight[offset + i] = right[i]; }
        offset += count; env.advanceToFrame(localStart + offset);
      } while (offset <= frames);
      lastBackendEnd = localStart + frames; lastRawEnd = rawStart + frames; lastTempo = clock.tempo;
      // The DAW position is authoritative whenever supplied. Fallback transport
      // progresses only while playing, including offline blocks with no PPQ.
      fallbackBeat = baseBeat + (raw[2] ? frames * lastTempo / (60 * rate) : 0);
      if (clock.looping && fallbackBeat >= clock.loopEnd) fallbackBeat = clock.loopStart + ((fallbackBeat - clock.loopStart) % (clock.loopEnd - clock.loopStart));
      return true;
    } catch (cause) { return fail(cause); }
  }
  function setParameter(index, normalized) {
    try {
      if (!backend || !Number.isInteger(index) || index < 0 || index >= parameters.length || !Number.isFinite(normalized)) throw RangeError('Invalid native parameter index or normalized value.');
      const definition = parameters[index], n = clamp(normalized, 0, 1), path = pathOf(definition), actual = actualValue(definition, n);
      let result;
      if (path === '_nativeSequence' && backend.setNativeSequence) result = backend.setNativeSequence(actual);
      else if (path === '_nativeSequence' && sourceId === 'morsel') result = backend.setParameter('followHost', actual);
      else { if (!backend.setParameter) throw Error('This instrument does not expose the requested native parameter.'); result = backend.setParameter(path, actual); }
      if (result && typeof result.then === 'function') throw Error('This parameter requires preparing a new engine outside the audio callback.');
      parameterValues[index] = n; if (g.KitchenHostIO?.parameters && index < g.KitchenHostIO.parameters.length) g.KitchenHostIO.parameters[index] = n;
      return actual;
    } catch (cause) { return fail(cause); }
  }
  function reset() {
    try {
      if (!backend) return;
      if (backend.reset) backend.reset(); else panic();
      frameBase = family === 'web-audio' || family === 'morsel' ? lastBackendEnd : 0;
      frameEpoch = null; lastRawEnd = null; fallbackBeat = 0;
      env.rebaseAudio(frameBase); return true;
    } catch (cause) { return fail(cause); }
  }
  function requireCapture() { if (!backend?.startMidiCapture || !backend?.stopMidiCapture || !backend?.drainMidiEvents) throw Error('This effect has no note-capture facility.'); }
  function updateCapture(batch) {
    if (!batch || batch.token === captureClearedToken) return;
    if (!captureTake || captureTake.token !== batch.token) captureTake = { token: batch.token, ownerId: 'plugin', slot: 0, sampleRate: batch.sampleRate, tempo: batch.tempo, frames: 0, capturing: false, reason: '', notes: [] };
    captureTake.sampleRate = batch.sampleRate; captureTake.tempo = batch.tempo; captureTake.frames = batch.frames;
    captureTake.capturing = !batch.done; captureTake.reason = batch.reason || '';
    for (const event of batch.events || []) {
      if (captureTake.notes.length >= 4096) throw Error('The FERMENT capture exceeds its 4,096-note limit.');
      captureTake.notes.push(event);
    }
  }
  function drainCapture() { requireCapture(); const batch = backend.drainMidiEvents(); updateCapture(batch); return batch; }
  function startCapture(options = {}) {
    requireCapture(); drainCapture();
    if (captureTake?.capturing) throw Error('Stop the current FERMENT capture before starting another.');
    const metadata = backend.startMidiCapture({ ...options, tempo: Number.isFinite(options.tempo) ? options.tempo : lastTempo, token: options.token || 'ferment-native-' + (++captureSerial) });
    captureTake = null; captureClearedToken = null; updateCapture(metadata); return metadata;
  }
  function stopCapture(reason = 'stopped') { requireCapture(); const metadata = backend.stopMidiCapture(reason); updateCapture(metadata); drainCapture(); return metadata; }
  // Called only by the native audio owner, in response to a bounded UI command.
  // Export remains in the original web helper: historical startFrame values
  // cannot truthfully be sent as live DAW MIDI after a note has already ended.
  function captureSnapshot(request) {
    if (!captureTake) return null;
    const total = captureTake.notes.length;
    const offset = clamp(Math.floor(finite(request.afterNote, 0)), 0, total);
    const limit = clamp(Math.floor(finite(request.maxNotes, 64)), 0, 128), end = Math.min(total, offset + limit);
    return { token: captureTake.token, ownerId: captureTake.ownerId, slot: captureTake.slot, sampleRate: captureTake.sampleRate, tempo: captureTake.tempo, frames: captureTake.frames, capturing: captureTake.capturing, reason: captureTake.reason, notes: captureTake.notes.slice(offset, end), notesOffset: offset, noteCount: total, moreNotes: end < total };
  }
  function captureRequestJSON(requestJSON) {
    let request = {};
    try {
      request = stateValue(requestJSON) || {}; requireCapture();
      const action = request.action || 'poll';
      if (action === 'start') startCapture({ token: request.token, tempo: request.tempo, maxNotes: request.captureMaxNotes, maxBeats: request.maxBeats });
      else if (action === 'stop') stopCapture(request.reason || 'stopped');
      else if (action === 'clear') { drainCapture(); if (captureTake?.capturing) throw Error('Stop FERMENT capture before clearing its take.'); captureClearedToken = captureTake?.token || captureClearedToken; captureTake = null; }
      else if (action === 'poll' || action === 'drain' || action === 'export') drainCapture();
      else throw Error('Unknown FERMENT capture command.');
      return JSON.stringify({ requestId: request.requestId ?? null, ok: true, error: null, take: captureSnapshot(request) });
    } catch (cause) {
      // An unavailable/bypassed capture is a normal UI error; audio continues.
      return JSON.stringify({ requestId: request.requestId ?? null, ok: false, error: cause?.message || String(cause), take: captureSnapshot(request) });
    }
  }
  function latency() { return Math.max(0, Math.round(finite(backend?.getLatencySamples?.(), finite(descriptor?.latencySamples, 0)))); }
  function getStateJSON() { try { if (!backend) throw Error('Native plugin is not created.'); return JSON.stringify(backend.getState()); } catch (cause) { return fail(cause); } }
  function setStateJSON(json) { if (!descriptor) throw Error('Native plugin is not created.'); return create(descriptor.id, rate, capacity, json); }
  const api = {
    configureDescriptors, create, render, prepareTick, getStateJSON, setStateJSON, setParameter, reset,
    getLatencySamples: latency, getStatusJSON: () => JSON.stringify(status()),
    getParameterValues: () => parameterValues.slice(),
    getTailSeconds: () => Math.max(0, finite(backend?.getTailSeconds?.(), 0)),
    getMetersJSON: () => JSON.stringify(backend?.getMeters?.() || {}),
    startMidiCapture: startCapture, stopMidiCapture: stopCapture,
    drainMidiEventsJSON() { return JSON.stringify(drainCapture()); },
    captureRequestJSON
  };
  g.KitchenNativePlugin = Object.freeze(api);
})(globalThis);
