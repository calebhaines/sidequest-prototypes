/* Kitchen native editors. The web view is a controller, never an audio device. */
(function (global) {
  'use strict';
  if (global.KitchenNativeEditor) return;
  const facades = Object.freeze({ grain: 'GrainApp', form: 'FormApp', tine: 'TineApp', mire: 'MireApp', spool: 'SpoolApp', haze: 'HazeApp', bower: 'BowerApp', ravel: 'RavelApp', fable: 'FableApp', roux: 'RouxApp', batter: 'BatterApp', proof: 'ProofApp', marinade: 'MarinadeApp', picnic: 'PicnicApp', morsel: 'MorselApp', heirloom: 'HeirloomApp', brine: 'BrineApp', citrus: 'CitrusApp' });
  const parse = value => { if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch (_) { return value; } };
  const initial = parse(global.__JUCE__?.initialisationData?.kitchenProduct?.[0] ?? global.__JUCE__?.initialisationData?.kitchenProduct);
  let descriptor = parse(global.KitchenPluginDescriptor) || initial || {}, backend = null, app = null, registered = null, engine = null;
  let disposed = false, applying = 0, restored = false, snapshotBusy = false, snapshotAgain = false, changed = false, serial = 0, lastJSON = '', lastNativeJSON = '', status = '';
  let snapshotTimer = 0, parameterTimer = 0, attachTimer = 0, nativeState, generation = 0, preparedBank = null, preparation = null, pendingParameters = null, parameterRestoreBusy = false, previousProject = null, stateRestorePending = null;
  const subscriptions = new Map(), backendListeners = [], controls = new Map(), held = new Map(), heldChannels = new Map(), releases = new Map(), timers = new Set(), patched = new WeakSet(), contexts = new Set();
  const parameterValues = new Map(), eventQueue = [], storageValues = Object.create(null);
  const diagnostics = { nativeAudioContexts: 0, offlineContexts: 0, snapshots: 0, parameterMessages: 0, midiMessages: 0, restored: false, ready: false, errors: [] };
  let clock = { tempo: 120, beat: 0, playing: false, sampleRate: 48000, samplePosition: 0, revision: 0, timeSigNum: 4, timeSigDen: 4 };
  const id = () => String(descriptor.sourceId || descriptor.instrumentId || descriptor.effectId || descriptor.id || '').replace(/^(?:instrument|effect)[:-]/, '');
  const instrument = () => descriptor.kind !== 'effect' && descriptor.kind !== 'utility' && !!facades[id()];
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  function later(callback, delay) { const token = setTimeout(() => { timers.delete(token); if (!disposed) callback(); }, delay); timers.add(token); return token; }
  function notify(type, value) { for (const callback of subscriptions.get(type) || []) { try { callback(value); } catch (error) { report(error); } } }
  function report(error) { const message = error?.message || String(error); diagnostics.errors.push(message); setStatus(message); }
  function send(type, payload = {}) {
    if (disposed) return false;
    connectBackend();
    if (backend?.emitEvent) { backend.emitEvent(type, payload); return true; }
    if (eventQueue.length >= 32) eventQueue.shift(); eventQueue.push([type, payload]);
    global.dispatchEvent(new CustomEvent('kitchen:native-message', { detail: { type, payload } })); return false;
  }
  function connectBackend() {
    if (backend || !global.__JUCE__?.backend) return;
    backend = global.__JUCE__.backend;
    for (const type of ['kitchenReady', 'kitchenState', 'kitchenParameters', 'kitchenClock', 'kitchenStatus', 'kitchenMeters']) {
      const listener = value => receive(type, parse(value));
      backendListeners.push([type, backend.addEventListener?.(type, listener), listener]);
    }
    for (const [type, payload] of eventQueue.splice(0)) backend.emitEvent(type, payload);
  }
  function subscribe(type, callback) { if (!subscriptions.has(type)) subscriptions.set(type, new Set()); subscriptions.get(type).add(callback); return () => subscriptions.get(type)?.delete(callback); }
  function setStatus(message) { status = String(message || ''); const output = document.getElementById('kitchenNativeStatus'); if (output && output.textContent !== status) output.textContent = status; notify('status', status); }
  function privateStorage() {
    const methods = { getItem: key => own(storageValues, String(key)) ? storageValues[String(key)] : null, setItem(key, value) { storageValues[String(key)] = String(value); scheduleSnapshot(); }, removeItem(key) { delete storageValues[String(key)]; }, clear() { for (const key of Object.keys(storageValues)) delete storageValues[key]; }, key: index => Object.keys(storageValues)[index] ?? null };
    return new Proxy(methods, { get(target, key) { return key === 'length' ? Object.keys(storageValues).length : key in target ? target[key] : storageValues[key]; }, set(_, key, value) { methods.setItem(key, value); return true; }, deleteProperty(_, key) { methods.removeItem(key); return true; }, ownKeys: () => Object.keys(storageValues), getOwnPropertyDescriptor(_, key) { return own(storageValues, key) ? { value: storageValues[key], configurable: true, enumerable: true, writable: true } : undefined; } });
  }
  function silenceBrowserAudio() {
    if (!instrument()) return;
    const Offline = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    if (!Offline) { setStatus('This editor requires an offline Web Audio context for sample editing.'); return; }
    function ControllerAudioContext(options = {}) {
      // A never-rendered OfflineAudioContext can decode files and build the
      // original editor's graphs, but cannot connect to an OS audio device.
      const raw = new Offline(2, 1, Number(options.sampleRate) || 48000);
      diagnostics.offlineContexts++; let closed = false, facade;
      const methods = new Map();
      facade = new Proxy(raw, {
        get(target, key) {
          if (key === 'audioWorklet') return undefined;
          if (key === 'state') return closed ? 'closed' : 'running';
          if (key === 'currentTime') return Number(clock.samplePosition || 0) / Number(clock.sampleRate || target.sampleRate);
          if (key === 'baseLatency' || key === 'outputLatency') return 0;
          if (key === 'resume' || key === 'suspend') return async () => {};
          if (key === 'close') return async () => { closed = true; contexts.delete(facade); };
          if (key === 'startRendering') return () => Promise.reject(Error('The editor does not render live audio. Use the native plugin or an explicit offline export.'));
          const value = Reflect.get(target, key, target);
          if (typeof value !== 'function') return value;
          if (!methods.has(key)) methods.set(key, value.bind(target));
          return methods.get(key);
        },
        set(target, key, value) { return Reflect.set(target, key, value, target); }
      });
      contexts.add(facade);
      queueMicrotask(() => { const candidate = app || global[facades[id()]]; if (candidate?.engine) patchEngine(candidate.engine); });
      return facade;
    }
    for (const key of ['AudioContext', 'webkitAudioContext']) Object.defineProperty(global, key, { value: ControllerAudioContext, configurable: true, writable: true });
    if (global.navigator?.mediaDevices?.getUserMedia) Object.defineProperty(global.navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { throw Error('Route audio to this plugin through your DAW. The editor does not open a separate microphone.'); } });
    try { Object.defineProperty(global, 'localStorage', { configurable: true, get: privateStorage }); Object.defineProperty(global, 'sessionStorage', { configurable: true, get: privateStorage }); } catch (_) {}
    const library = new Map();
    const collection = Object.freeze({ persistent: false, list: async () => [...library.values()], get: async key => library.get(String(key)) || null, save: async value => { const key = String(value.id || 'item-' + (++serial)); library.set(key, value); return key; }, remove: async key => library.delete(String(key)) });
    let context;
    const host = { version: 1, trackId: 'native-plugin', get tempo() { return clock.tempo; }, get transport() { return { ...clock, when: clock.samplePosition / clock.sampleRate }; }, get context() { return context ||= new ControllerAudioContext({ sampleRate: clock.sampleRate }); }, get destination() { return this.context.destination; }, createAudioContext: options => new ControllerAudioContext(options), audioLibrary: collection, patternLibrary: collection,
      registerInstrument(value) { registered = value; scheduleAttach(); return host; }, notifyStateChange() { scheduleParameters(); scheduleSnapshot(); }, requestAudition() { return true; }, status: message => setStatus(message) };
    Object.defineProperty(global, 'MusicLabHost', { configurable: true, value: host });
  }
  function parameters() { return descriptor.parameters || descriptor.definition?.parameters || []; }
  function optionValue(option) { return option && typeof option === 'object' ? option.value : option; }
  function normalized(definition, value) {
    if (definition.type === 'boolean' || definition.type === 'bool') return value ? 1 : 0;
    if (definition.type === 'select' || Array.isArray(definition.options)) { const options = definition.options || [], at = options.findIndex(option => optionValue(option) === value); return Math.max(0, at) / Math.max(1, options.length - 1); }
    const low = Number(definition.min ?? 0), high = Number(definition.max ?? 1), number = Number(value);
    return Number.isFinite(number) && high > low ? clamp((number - low) / (high - low), 0, 1) : 0;
  }
  function actual(definition, value) {
    const ratio = clamp(Number(value) || 0, 0, 1);
    if (definition.type === 'boolean' || definition.type === 'bool') return ratio >= .5;
    if (definition.type === 'select' || Array.isArray(definition.options)) { const options = definition.options || []; return optionValue(options[Math.round(ratio * Math.max(0, options.length - 1))]); }
    const low = Number(definition.min ?? 0), high = Number(definition.max ?? 1), step = Number(definition.step || 0); let number = low + ratio * (high - low);
    if (step > 0) number = low + Math.round((number - low) / step) * step;
    return clamp(number, low, high);
  }
  function byPath(state, path) {
    const candidates = [path, path.replace(/^(?:recipe|state|project)\./, ''), path.replace(/^params\./, '')];
    for (const source of [state, state?.state, state?.project, state?.recipe, state?.params]) for (const candidate of candidates) {
      let value = source; for (const key of String(candidate).split('.')) value = value?.[key];
      if (value !== undefined) return value;
    }
    return undefined;
  }
  function assignByPath(state, path, value) {
    const candidates = [path, path.replace(/^(?:recipe|state|project)\./, '')];
    for (const source of [state, state?.state, state?.project, state?.recipe]) for (const candidate of candidates) {
      const keys = String(candidate).split('.'); let target = source;
      for (const key of keys.slice(0, -1)) target = target?.[key];
      if (target && own(target, keys.at(-1))) { target[keys.at(-1)] = value; return true; }
    }
    return false;
  }
  function parameterLocations(state) {
    const locations = new WeakMap();
    for (const definition of parameters()) {
      const path = definition.path || definition.key || '', candidates = [path, path.replace(/^(?:recipe|state|project)\./, '')];
      let found = false;
      for (const source of [state, state?.state, state?.project, state?.recipe]) {
        for (const candidate of candidates) {
          const keys = candidate.split('.'); let target = source;
          for (const key of keys.slice(0, -1)) target = target?.[key];
          if (target && own(target, keys.at(-1))) { if (!locations.has(target)) locations.set(target, new Set()); locations.get(target).add(keys.at(-1)); found = true; break; }
        }
        if (found) break;
      }
    }
    return locations;
  }
  function sameNonParameterState(left, right) {
    if (!left || !right) return false;
    const aLocations = parameterLocations(left), bLocations = parameterLocations(right);
    function same(a, b) {
      if (a === b) return true;
      if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
      const aKeys = Object.keys(a).filter(key => !aLocations.get(a)?.has(key)), bKeys = Object.keys(b).filter(key => !bLocations.get(b)?.has(key));
      if (aKeys.length !== bKeys.length) return false;
      for (const key of aKeys) if (!own(b, key) || !same(a[key], b[key])) return false;
      return true;
    }
    return same(left, right);
  }
  async function applyParameters(list) {
    if (!Array.isArray(list)) return;
    pendingParameters = list;
    if (!app || !restored || parameterRestoreBusy || disposed) return;
    parameterRestoreBusy = true;
    try {
      while (stateRestorePending) await stateRestorePending;
      while (pendingParameters && !disposed) {
        const next = pendingParameters; pendingParameters = null;
        const recipe = currentRecipe(), patch = [];
        next.forEach((item, index) => {
          const d = parameters()[index]; if (!d) return;
          const ratio = item?.normalized ?? (typeof item === 'number' ? item : undefined);
          if (ratio === undefined) return;
          const value = actual(d, ratio), path = d.path || d.key;
          parameterValues.set(index, value);
          if (path === '_nativeSequence') { const field = document.getElementById('kitchenNativeSequence'); if (field) field.checked = !!value; }
          else if (recipe && byPath(recipe, path) !== undefined && byPath(recipe, path) !== value) patch.push([path, value]);
        });
        if (!patch.length) continue;
        const project = await projectSnapshot(); if (disposed || !project) continue;
        let dirty = false; for (const [path, value] of patch) dirty = assignByPath(project, path, value) || dirty;
        if (!dirty) continue;
        const loader = app.loadState || app.setState || app.applyState || registered?.setState;
        if (!loader) continue;
        applying++;
        try {
          await loader.call(app, project, { history: false });
          if (id() === 'form') await restoreFormVolume(project.masterVolume);
          // Do not echo DAW automation back as a new project or retransmit a
          // prepared MORSEL bank. Native parameter atomics already own it.
          changed = false; generation++;
        } finally { applying--; }
      }
    } catch (error) { report(error); }
    finally { parameterRestoreBusy = false; }
  }
  function setParameter(index, value, options = {}) {
    const definition = parameters()[index]; if (!definition) return false;
    const ratio = options.normalized ? clamp(Number(value) || 0, 0, 1) : normalized(definition, value);
    parameterValues.set(index, options.normalized ? actual(definition, ratio) : value); diagnostics.parameterMessages++;
    return send('kitchenSetParameter', { index, normalized: ratio, path: definition.path || definition.key, gesture: options.gesture || 'single' });
  }
  function formVolume() { return document.querySelector('input[aria-label="Master playback volume"]'); }
  async function restoreFormVolume(value) {
    const field = formVolume(); if (!field || !Number.isFinite(value) || Number(field.value) === value) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, String(value));
    field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  function currentRecipe() {
    const value = typeof global.KitchenEditorPeekState === 'function' ? global.KitchenEditorPeekState() : app?.getState?.() ?? registered?.getState?.();
    if (!value || typeof value.then === 'function') return null;
    return id() === 'form' && formVolume() ? { ...value, masterVolume: Number(formVolume().value) } : value;
  }
  function scheduleParameters() {
    if (!app || applying || !restored || parameterTimer) return;
    parameterTimer = later(() => {
      parameterTimer = 0; if (applying) return;
      const recipe = currentRecipe(); if (!recipe) return;
      parameters().forEach((definition, index) => {
        const value = byPath(recipe, definition.path || definition.key || '');
        if (value !== undefined && parameterValues.get(index) !== value) setParameter(index, value, { gesture: 'edit' });
      });
    }, 32);
  }
  function scheduleSnapshot() {
    if (!instrument() || applying || !restored || !app || disposed) return;
    changed = true; clearTimeout(snapshotTimer); timers.delete(snapshotTimer);
    snapshotTimer = later(() => { snapshotTimer = 0; captureState().catch(report); }, 300);
  }
  async function projectSnapshot() {
    const getter = app?.getProject || registered?.getProject || app?.getState || registered?.getState;
    if (!getter) return null;
    const value = parse(await getter.call(app?.getProject || app?.getState ? app : registered));
    return id() === 'form' && formVolume() ? { ...value, masterVolume: Number(formVolume().value) } : value;
  }
  async function captureState() {
    if (disposed || applying || !restored || !changed) return;
    if (snapshotBusy) { snapshotAgain = true; return; }
    snapshotBusy = true; changed = false;
    try {
      if (id() === 'morsel') { scheduleParameters(); setStatus('Word or phrase edits are ready to prepare.'); return; }
      const state = await projectSnapshot(); if (state == null || applying || disposed) return;
      // Native parameter atomics already preserve smooth knob edits and save
      // with the DAW project. Only structural recipe edits replace the DSP.
      const parameterOnly = sameNonParameterState(previousProject, state); previousProject = state;
      if (parameterOnly) return;
      const json = JSON.stringify(state); if (json === lastJSON || json === lastNativeJSON) return;
      lastJSON = json; diagnostics.snapshots++; send('kitchenSetState', { state, clientRevision: ++serial });
    } finally { snapshotBusy = false; if (snapshotAgain) { snapshotAgain = false; scheduleSnapshot(); } }
  }
  async function applyState(value) {
    const requested = parse(value); if (!app || requested == null || disposed) { nativeState = requested; return; }
    while (stateRestorePending) await stateRestorePending;
    if (disposed) return;
    nativeState = requested;
    let state = id() === 'morsel' && requested.recipe ? requested.recipe : requested;
    const json = JSON.stringify(requested); if (json === lastJSON || json === lastNativeJSON) { restored = true; diagnostics.restored = true; return; }
    const loader = app.loadState || app.setState || app.applyState || registered?.setState;
    if (!loader) throw Error('This instrument does not expose native project restore.');
    let release; const pending = stateRestorePending = new Promise(resolve => { release = resolve; }); applying++;
    try {
      // Percussion facade loaders validate their complete bank/chain envelope.
      // A first native instance may provide its raw normalized default state.
      if (['grain', 'tine'].includes(id()) && !state.state && app.getProject) { const project = await app.getProject(); state = { ...project, state: { ...project.state, ...state } }; }
      await loader.call(app, clone(state));
      if (id() === 'form') await restoreFormVolume(state.masterVolume ?? state.project?.masterVolume);
      if (id() === 'morsel' && requested.bank) { preparedBank = requested.bank; await global.KitchenMorselPreparation?.hydrateBank?.(app.engine, preparedBank); }
      lastNativeJSON = json; lastJSON = json; changed = false; generation++; parameterValues.clear();
      previousProject = await projectSnapshot();
      const recipe = currentRecipe(); if (recipe) parameters().forEach((definition, index) => parameterValues.set(index, byPath(recipe, definition.path || definition.key || '')));
      restored = true; diagnostics.restored = true; setStatus('Native audio ready. Transport follows your DAW.');
    } finally { applying--; if (stateRestorePending === pending) stateRestorePending = null; release(); }
  }
  function voicePitch(voice) {
    const recipe = currentRecipe(), state = recipe?.state || recipe?.project || recipe, tracks = state?.tracks || state?.lanes || state?.parts || state?.sounds;
    if (Array.isArray(tracks)) { const index = typeof voice === 'number' ? voice : tracks.findIndex(value => value.id === voice || value.name === voice); if (index >= 0) return 36 + index; }
    const voices = global.MusicLabPatternInstrument?.notes?.voices || registered?.notes?.voices || [];
    const match = typeof voice === 'string' ? voices.find(value => value.id === voice) : voices[Number(voice) || 0];
    return Number.isInteger(match?.pitch) ? match.pitch : 36 + (Number.isInteger(voice) ? voice : Math.max(0, voices.indexOf(match)));
  }
  function midi(type, note, velocity = .8, channel = 1, noteId) {
    if (!Number.isFinite(Number(note))) return false;
    const pitch = clamp(Math.round(Number(note)), 0, 127), token = String(noteId ?? channel + ':' + pitch);
    if (releases.has(token)) { const timer = releases.get(token); clearTimeout(timer); timers.delete(timer); releases.delete(token); }
    if (type === 'on') { held.set(token, pitch); heldChannels.set(token, channel); } else if (type === 'off') { note = held.get(token) ?? pitch; channel = heldChannels.get(token) ?? channel; held.delete(token); heldChannels.delete(token); }
    diagnostics.midiMessages++; return send('kitchenMidi', { type, pitch: type === 'off' ? Number(note) : pitch, velocity: clamp(Number(velocity) || 0, 0, 1), channel: clamp(Number(channel) || 1, 1, 16), id: token });
  }
  function audition(pitch, velocity = .8, duration = .35, token, channel = 1) { token ??= 'editor-preview-' + (++serial); midi('on', pitch, velocity, channel, token); releases.set(String(token), later(() => midi('off', pitch, 0, channel, token), clamp(Number(duration) || .35, .01, 768) * 1000)); return true; }
  function patchEngine(value) {
    if (!value || patched.has(value)) return; patched.add(value); engine = value;
    const replace = (name, fn) => { if (typeof value[name] !== 'function') return; try { value[name] = fn; } catch (_) {} };
    if (id() === 'morsel') {
      const init = value.init.bind(value), prepareNotes = value.prepareNotes.bind(value);
      // Original keyboard warm-up is unnecessary beside the native prepared
      // bank. Neural workers run only for an explicit Prepare voices action.
      replace('init', () => preparation ? init() : Promise.resolve((value.context ||= new global.AudioContext(), value)));
      replace('prepareNotes', options => preparation ? prepareNotes(options) : Promise.resolve(true));
    }
    for (const name of ['start', 'play']) if (!(id() === 'form' && name === 'play')) replace(name, async () => { setStatus('Start playback in your DAW. This instrument follows its clock.'); return true; });
    for (const name of ['stop', 'stopAll', 'panic']) replace(name, () => {});
    const originalMeters = typeof value.getMeters === 'function' ? value.getMeters.bind(value) : () => ({});
    replace('getMeters', () => { let base = {}; try { base = originalMeters() || {}; } catch (_) {} return { ...base, ...(clock.meters || {}), beat: clock.beat, playing: clock.playing, step: Math.floor(Math.max(0, clock.beat) * 4) % 16, peak: clock.meters?.peak || clock.meters?.outputPeak || 0 }; });
    for (const key of ['playing', 'isPlaying']) try { if (Object.getOwnPropertyDescriptor(value, key)?.configurable !== false) Object.defineProperty(value, key, { configurable: true, get: () => !!clock.playing, set() {} }); } catch (_) {}
    replace('scheduleNote', event => {
      const recipe = currentRecipe(), state = recipe?.state || recipe;
      const voice = Number(event.voiceId ?? event.voice ?? 0);
      let pitch = event.pitch ?? event.note ?? voicePitch(event.voiceId ?? event.voice), channel = 1;
      if (['mire', 'bower'].includes(id())) channel = 1 + (Number.isFinite(voice) ? voice : 0);
      if (id() === 'haze' && global.HazeDSP?.frequencyForBand && Number.isFinite(voice)) pitch = 69 + 12 * Math.log2(global.HazeDSP.frequencyForBand(state, voice) / 440);
      if (id() === 'picnic') channel = 1 + Math.max(0, state?.parts?.findIndex(value => value.id === event.voice) ?? 0);
      return audition(pitch, event.velocity, event.durationSeconds, event.id || event.source, channel);
    });
    replace('noteOn', (...args) => {
      if (args[0] && typeof args[0] === 'object') { const event = args[0]; return midi('on', event.pitch ?? event.note ?? voicePitch(event.voiceId), event.velocity ?? .8, (event.channel || 0) + 1, event.id || event.source); }
      return midi('on', args[0], args[1] ?? .8, 1, args[2]?.source);
    });
    replace('noteOff', (event, options = {}) => { if (event && typeof event === 'object') return midi('off', event.pitch ?? event.note ?? held.get(String(event.id)) ?? 60, 0, (event.channel || 0) + 1, event.id || event.source); if (typeof event === 'string' && held.has(event)) return midi('off', held.get(event), 0, 1, event); return midi('off', event, 0, 1, options.source); });
    replace('liveNote', (pitch, velocity, duration) => audition(pitch, velocity, duration));
    replace('triggerSlice', (slice, options = {}) => audition(60 + Number(options.pitch || 0), options.velocity ?? .8, options.durationSeconds ?? .35, undefined, Number(slice) + 1));
    replace('triggerNode', node => audition(60, .85, .35, undefined, 13 + Number(node)));
    replace('preview', track => { if (id() === 'morsel') return Promise.resolve(audition(track.pitch ?? 60, track.velocity ?? .8, track.durationSeconds ?? 1, track.source)); const tracks = currentRecipe()?.tracks || []; const index = Math.max(0, tracks.findIndex(value => value.id === track?.id || value.name === track?.name)); return Promise.resolve(audition(voicePitch(index), 1)); });
    replace('trigger', (note, velocity, duration, source) => Promise.resolve(audition(id() === 'mire' ? currentRecipe()?.sources?.[Number(note)]?.pitch ?? 60 : ['grain', 'tine', 'batter'].includes(id()) ? voicePitch(note) : note, velocity, typeof duration === 'object' ? duration.duration : duration, source ?? 'key:' + note, id() === 'mire' ? Number(note) + 1 : 1)));
    replace('release', (note, source) => midi('off', note, 0, 1, source ?? 'key:' + note));
    replace('pluck', (lane, degree = 0, velocity = .8, note = null) => Promise.resolve(audition(note ?? global.BowerSchema?.degreeMidi(currentRecipe(), lane, degree) ?? 60, velocity, .8, undefined, Number(lane) + 1)));
    replace('strum', () => { for (let lane = 0; lane < 4; lane++) later(() => value.pluck(lane, [0, 2, 4, 7][lane], .9), lane * 45); return Promise.resolve(true); });
    replace('setSustain', down => send('kitchenMidi', { type: 'cc', controller: 64, value: down ? 1 : 0, channel: 1 }));
    for (const name of ['cancelNotes', 'stopNotes']) replace(name, () => { for (const [key, pitch] of [...held]) midi('off', pitch, 0, 1, key); return true; });
    if (id() === 'form') for (const name of ['play', 'schedulePrepared']) replace(name, (sound, velocity, when, pitch, fifth, sixth, seventh) => Promise.resolve(audition(36 + (Number(name === 'play' ? sixth : seventh) || 0), velocity ?? .8)));
    if (id() === 'form') replace('preload', () => Promise.resolve());
  }
  function header() {
    if (document.getElementById('kitchenNativeBar')) return;
    const bar = document.createElement('div'); bar.id = 'kitchenNativeBar'; bar.className = 'kitchen-native-bar';
    const sequenceIndex = parameters().findIndex(value => value.path === '_nativeSequence');
    bar.innerHTML = '<span class="kitchen-native-title">KITCHEN / DAW</span><output id="kitchenNativeClock">120 BPM · Stopped</output>' + (sequenceIndex >= 0 ? '<label><input type="checkbox" id="kitchenNativeSequence" checked> DAW pattern</label>' : '') + '<span id="kitchenNativeStatus" role="status">Opening native audio…</span>' + (id() === 'morsel' ? '<button type="button" id="kitchenPrepareVoices">Prepare voices</button><button type="button" id="kitchenCancelVoices" hidden>Cancel</button>' : '');
    const style = document.createElement('style'); style.textContent = '.kitchen-native-bar{box-sizing:border-box;position:sticky;top:0;z-index:2147483000;display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:9px 16px;background:#1d3025;color:#e6ddba;border-bottom:1px solid #8b9770;font:11px/1.5 ui-monospace,monospace}.kitchen-native-title{font-weight:700;letter-spacing:.13em}.kitchen-native-bar output{color:#d4c58c}.kitchen-native-bar [role=status]{flex:1;min-width:100px;color:#b7c2a4}.kitchen-native-bar button{font:inherit;color:#eee2bd;background:#354633;border:1px solid #9b9e73;border-radius:3px;padding:5px 9px}.kitchen-native-bar [hidden]{display:none!important}.kitchen-native-bar button:focus-visible{outline:2px solid #e5c58b;outline-offset:2px}'; document.head.append(style); document.body.prepend(bar);
    document.getElementById('kitchenPrepareVoices')?.addEventListener('click', prepareVoices);
    document.getElementById('kitchenCancelVoices')?.addEventListener('click', () => preparation?.abort());
    document.getElementById('kitchenNativeSequence')?.addEventListener('change', event => setParameter(sequenceIndex, event.target.checked));
    paintClock(); if (status) setStatus(status);
  }
  async function prepareVoices() {
    if (preparation || !app?.engine) return;
    if (!global.KitchenMorselPreparation?.prepareBank) { setStatus('The native voice preparation helper is missing.'); return; }
    const controller = preparation = new AbortController(), revision = generation;
    const button = document.getElementById('kitchenPrepareVoices'), cancel = document.getElementById('kitchenCancelVoices'); if (button) button.disabled = true; if (cancel) cancel.hidden = false;
    try {
      const project = await projectSnapshot(), recipe = project?.state || project;
      const signature = global.KitchenMorselPreparation.signature || JSON.stringify, requestedSignature = signature(recipe);
      const bank = await global.KitchenMorselPreparation.prepareBank({ audio: app.engine, state: recipe, keyboardDuration: .8, pitches: Array.from({ length: 49 }, (_, i) => i + 36), voices: ['alto', 'tenor', 'bass', 'robot'], tempos: [...new Set([recipe.tempo, clock.tempo, 60, 80, 90, 96, 100, 110, 120, 128, 140, 160])], signal: controller.signal, onProgress: (value, total) => setStatus('Preparing voices · ' + Math.round(clamp(Number(value?.progress ?? (total ? value / total : value)) || 0, 0, 1) * 100) + '%') });
      if (controller.signal.aborted || disposed) return;
      const current = await projectSnapshot();
      if (signature(current?.state || current) !== requestedSignature) { setStatus('The words or timing changed while preparing. Prepare voices again.'); return; }
      preparedBank = bank; const state = { recipe, bank }; lastJSON = JSON.stringify(state); changed = false; diagnostics.snapshots++; send('kitchenSetState', { state, clientRevision: ++serial }); setStatus('Prepared voices sent to native audio.');
    } catch (error) { setStatus(error.name === 'AbortError' ? 'Voice preparation cancelled. Previous native voices are retained.' : error.message); }
    finally { if (preparation === controller) preparation = null; if (button) button.disabled = false; if (cancel) cancel.hidden = true; }
  }
  function paintClock() {
    const output = document.getElementById('kitchenNativeClock'); if (!output) return;
    const text = Number(clock.tempo || 120).toFixed(2).replace(/\.00$/, '') + ' BPM · ' + (clock.playing ? 'Playing ' + (Math.floor(Math.max(0, clock.beat) / (clock.timeSigNum || 4)) + 1) + ':' + (Math.floor(Math.max(0, clock.beat)) % (clock.timeSigNum || 4) + 1) : 'Stopped');
    if (output.textContent !== text) output.textContent = text;
    for (const field of document.querySelectorAll('input#tempo,input#bpm,input#tempo-input,input#tempoInput,input[aria-label="Tempo BPM"],input[data-host-tempo]')) { field.disabled = true; field.title = 'Tempo follows your DAW'; if (document.activeElement !== field) field.value = String(clock.tempo); }
  }
  async function receive(type, value = {}) {
    if (disposed) return; value ||= {};
    if (value.descriptor) { descriptor = value.descriptor; global.KitchenPluginDescriptor = descriptor; }
    if (type === 'kitchenClock') { clock = { ...clock, ...value, tempo: Number(value.tempo ?? value.bpm ?? clock.tempo), beat: Number(value.beat ?? value.ppq ?? clock.beat), samplePosition: Number(value.samplePosition ?? value.hostSamplePosition ?? clock.samplePosition), timeSigNum: Number(value.timeSigNum ?? value.numerator ?? clock.timeSigNum), timeSigDen: Number(value.timeSigDen ?? value.denominator ?? clock.timeSigDen) }; paintClock(); notify('clock', clock); return; }
    if (type === 'kitchenParameters') { if (instrument()) await applyParameters(value); notify('parameters', value); return; }
    if (type === 'kitchenStatus') { setStatus(value.message ?? value.status ?? value); return; }
    if (type === 'kitchenMeters') { clock.meters = value; notify('meters', value); return; }
    if (type === 'kitchenReady') { diagnostics.ready = true; setStatus('Native audio ready. Transport follows your DAW.'); notify('ready', value); }
    if (own(value, 'state')) { nativeState = parse(value.state); if (instrument()) { try { await applyState(nativeState); } catch (error) { report(error); } } notify('state', { ...value, state: nativeState }); }
    if (value.parameters) { if (instrument()) await applyParameters(value.parameters); notify('parameters', value.parameters); }
    if (value.status) setStatus(value.status.message || value.status);
    if (!app && instrument()) scheduleAttach();
  }
  function scheduleAttach() { if (attachTimer || disposed || !instrument()) return; attachTimer = later(() => { attachTimer = 0; attach(); }, 20); }
  function attach() {
    if (disposed || !instrument()) return;
    const found = global[facades[id()]];
    if (!found) { scheduleAttach(); return; }
    if (app !== found) {
      app = found; header(); patchEngine(app.engine || global.BatterUI?.engine);
      app.onStateChange?.(() => { scheduleParameters(); scheduleSnapshot(); });
      if (nativeState !== undefined) applyState(nativeState).then(() => pendingParameters && applyParameters(pendingParameters)).catch(report);
      send('kitchenReady', { request: true, editorReady: true, sourceId: id() });
    }
    // React HOTPLATE creates its engine lazily after the facade is exposed.
    if (app.engine && app.engine !== engine) patchEngine(app.engine);
  }
  function transportAction(event) {
    if (!instrument()) return;
    const target = event.target?.closest?.('button,[role=button]'); if (!target) return;
    const key = (target.id || '').replace(/[-_]/g, '').toLowerCase();
    if (/^(?:playbutton|stopbutton|pausebutton|restartbutton|play|stop|startbutton|transportplay|transportstop)$/.test(key) || target.matches('.transport-play,.transport-stop,[aria-label="Restart sequencer from beginning"]')) { event.preventDefault(); event.stopImmediatePropagation(); setStatus('Start or stop playback in your DAW.'); return; }
    if (/^(?:recordbutton|capturemix)$/.test(key)) { event.preventDefault(); event.stopImmediatePropagation(); setStatus('Record the plugin output in your DAW.'); return; }
    if (/^(?:panicbutton|panic)$/.test(key)) { event.preventDefault(); event.stopImmediatePropagation(); send('kitchenMidi', { type: 'allOff' }); held.clear(); setStatus('All native notes released.'); }
  }
  function edited() { if (app?.engine && app.engine !== engine) patchEngine(app.engine); scheduleParameters(); scheduleSnapshot(); }
  function dispose() {
    if (disposed) return; for (const [key, pitch] of held) midi('off', pitch, 0, 1, key);
    disposed = true; preparation?.abort(); for (const timer of timers) clearTimeout(timer); timers.clear();
    for (const [type, token, listener] of backendListeners) { try { backend.removeEventListener?.(token ?? type, listener); } catch (_) {} }
    for (const context of contexts) context.close().catch(() => {}); contexts.clear(); subscriptions.clear();
  }
  silenceBrowserAudio(); connectBackend();
  for (const type of ['input', 'change', 'musiclab:state-change', 'musiclab:patternchange']) document.addEventListener(type, edited);
  document.addEventListener('pointerup', () => later(edited, 0)); document.addEventListener('click', () => later(edited, 0));
  document.addEventListener('click', transportAction, true);
  document.addEventListener('keydown', event => { if (!instrument() || event.target.closest?.('input,textarea,select,[contenteditable=true]')) return; if (event.code === 'Space') { event.preventDefault(); event.stopImmediatePropagation(); setStatus('Transport follows your DAW.'); } else if (event.code === 'Escape' && !document.querySelector('dialog[open]')) { send('kitchenMidi', { type: 'allOff' }); held.clear(); } }, true);
  document.addEventListener('musiclab:app-ready', scheduleAttach);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { if (instrument()) { header(); scheduleAttach(); } send('kitchenReady', { request: true }); }, { once: true });
  else { if (instrument()) { header(); scheduleAttach(); } send('kitchenReady', { request: true }); }
  global.addEventListener('pagehide', dispose);
  global.KitchenNativeEditor = Object.freeze({ send, subscribe, receive, setParameter, normalized, actual, prepareVoices, attach, captureState, getProject: projectSnapshot, dispose, get descriptor() { return descriptor; }, get state() { return nativeState; }, get clock() { return { ...clock }; }, get diagnostics() { return { ...diagnostics, errors: [...diagnostics.errors], attached: !!app, browserContexts: contexts.size }; } });
})(window);
