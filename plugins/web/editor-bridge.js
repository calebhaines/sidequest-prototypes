/* Kitchen native editors. The web view is a controller, never an audio device. */
(function (global) {
  'use strict';
  if (global.KitchenNativeEditor) return;
  const facades = Object.freeze({ grain: 'GrainApp', form: 'FormApp', tine: 'TineApp', mire: 'MireApp', spool: 'SpoolApp', haze: 'HazeApp', bower: 'BowerApp', ravel: 'RavelApp', fable: 'FableApp', roux: 'RouxApp', batter: 'BatterApp', proof: 'ProofApp', marinade: 'MarinadeApp', picnic: 'PicnicApp', morsel: 'MorselApp', heirloom: 'HeirloomApp', brine: 'BrineApp', citrus: 'CitrusApp' });
  const parse = value => { if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch (_) { return value; } };
  const initial = parse(global.__JUCE__?.initialisationData?.kitchenProduct?.[0] ?? global.__JUCE__?.initialisationData?.kitchenProduct);
  let descriptor = parse(global.KitchenPluginDescriptor) || initial || {}, backend = null, app = null, registered = null, engine = null;
  let disposed = false, applying = 0, restored = false, snapshotBusy = false, snapshotAgain = false, changed = false, serial = 0, lastJSON = '', lastNativeJSON = '', status = '';
  let snapshotTimer = 0, parameterTimer = 0, attachTimer = 0, nativeState, generation = 0, preparedBank = null, preparation = null, pendingParameters = null, parameterRestoreBusy = false, previousProject = null, stateRestorePending = null, nativeIdSerial = 0x80000000;
  let hydrationReceives = 0, hydrationTouched = performance.now(), parameterRevision = 0;
  const subscriptions = new Map(), backendListeners = [], controls = new Map(), held = new Map(), heldChannels = new Map(), heldIds = new Map(), releases = new Map(), timers = new Set(), patched = new WeakSet(), contexts = new Set();
  const parameterValues = new Map(), localParameters = new Map(), eventQueue = [], storageValues = Object.create(null), sessionValues = Object.create(null);
  const patternStoragePrefix = '__kitchenPattern:', storageLimit = 16 * 1024 * 1024;
  let localStorageFacade, sessionStorageFacade;
  const diagnostics = { nativeAudioContexts: 0, offlineContexts: 0, snapshots: 0, parameterMessages: 0, midiMessages: 0, scalarParameterUpdates: 0, restored: false, ready: false, errors: [] };
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
    for (const type of ['kitchenReady', 'kitchenState', 'kitchenParameters', 'kitchenParameterAck', 'kitchenClock', 'kitchenStatus', 'kitchenMeters', 'kitchenCapture', 'kitchenDownloadResult', 'kitchenEditorStorage']) {
      const listener = value => receive(type, parse(value));
      backendListeners.push([type, backend.addEventListener?.(type, listener), listener]);
    }
    for (const [type, payload] of eventQueue.splice(0)) backend.emitEvent(type, payload);
  }
  function subscribe(type, callback) { if (!subscriptions.has(type)) subscriptions.set(type, new Set()); subscriptions.get(type).add(callback); return () => subscriptions.get(type)?.delete(callback); }
  function setStatus(message) { status = String(message || ''); const output = document.getElementById('kitchenNativeStatus'); if (output && output.textContent !== status) output.textContent = status; notify('status', status); }
  function storageSize(values) { return new TextEncoder().encode(JSON.stringify(values)).length; }
  function recoveryStorageKey() { return ({ grain: 'grain-drum-machine-v2', tine: 'tine-drum-machine-v1', form: 'form-studio-v2', batter: 'kitchen.batter.project.v1', bower: 'musiclab-bower-score-v1', morsel: 'kitchen-morsel-project-v1' })[id()] || id() + '-project-v1'; }
  function privateStorage(values, persistent) {
    const methods = {
      getItem: key => own(values, String(key)) ? values[String(key)] : null,
      setItem(key, value) {
        key = String(key); value = String(value); if (values[key] === value) return;
        // Original async imports commit their project before writing recovery.
        // Preset/library metadata writes never trigger this DSP snapshot path.
        if (persistent && key === recoveryStorageKey()) { scheduleParameters(); scheduleSnapshot(); }
        if (!key.length) throw new DOMException('Use a nonempty key for plugin editor storage.', 'DataError');
        if (key.length > 1024 || storageSize({ ...values, [key]: value }) > storageLimit) { const message = 'Plugin editor storage is full (16 MiB). Export or remove a saved preset or pattern first.'; setStatus(message); throw new DOMException(message, 'QuotaExceededError'); }
        values[key] = value; if (persistent) send('kitchenEditorStorage', { action: 'set', key, value });
      },
      removeItem(key) { key = String(key); if (!own(values, key)) return; delete values[key]; if (persistent) send('kitchenEditorStorage', { action: 'remove', key }); },
      clear() { if (!Object.keys(values).length) return; for (const key of Object.keys(values)) delete values[key]; if (persistent) send('kitchenEditorStorage', { action: 'clear' }); },
      key: index => Object.keys(values)[index] ?? null
    };
    return new Proxy(methods, { get(target, key) { return key === 'length' ? Object.keys(values).length : key in target ? target[key] : values[key]; }, set(_, key, value) { methods.setItem(key, value); return true; }, deleteProperty(_, key) { methods.removeItem(key); return true; }, ownKeys: () => Object.keys(values), getOwnPropertyDescriptor(_, key) { return own(values, key) ? { value: values[key], configurable: true, enumerable: true, writable: true } : undefined; } });
  }
  function restoreEditorStorage(value) {
    value = parse(value); if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    for (const key of Object.keys(storageValues)) if (!own(value, key)) delete storageValues[key];
    for (const [key, item] of Object.entries(value)) if (typeof item === 'string') storageValues[key] = item;
    global.KitchenNativeEditorStorage = { ...storageValues }; notify('storage', { ...storageValues });
  }
  function installEditorStorage() {
    restoreEditorStorage(global.KitchenNativeEditorStorage || {});
    localStorageFacade = privateStorage(storageValues, true); sessionStorageFacade = privateStorage(sessionValues, false);
    try { Object.defineProperty(global, 'localStorage', { configurable: true, get: () => localStorageFacade }); Object.defineProperty(global, 'sessionStorage', { configurable: true, get: () => sessionStorageFacade }); } catch (error) { report(error); }
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
    if (global.navigator?.mediaDevices?.getUserMedia) Object.defineProperty(global.navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { throw Error('Record audio in your DAW, then import the recording into this instrument. The editor does not open a separate microphone.'); } });
    const library = new Map();
    const collection = Object.freeze({ persistent: false, list: async () => [...library.values()], get: async key => library.get(String(key)) || null, save: async value => { const key = String(value.id || 'item-' + (++serial)); library.set(key, value); setStatus('This shared audio shelf lasts until the editor closes. Export the sample or save it in the instrument’s project to keep it.'); return { ...value, id: key }; }, remove: async key => library.delete(String(key)) });
    const patternRecords = () => Object.keys(storageValues).filter(key => key.startsWith(patternStoragePrefix)).map(key => parse(storageValues[key])).filter(value => value && typeof value === 'object' && value.id && Array.isArray(value.notes));
    const patternMetadata = record => ({ id: record.id, name: record.name, sourceApp: record.sourceApp, createdAt: record.createdAt, tempo: record.tempo, swing: record.swing, lengthBeats: record.lengthBeats, meter: record.meter, kind: record.kind || 'notes', notes: record.notes.length, voices: record.voices?.length || 0, tags: record.tags, bytes: record.bytes });
    const paintLibraryNotice = () => { const line = document.querySelector('.ml-pat-storage'); if (line) line.textContent = 'Saved with this plugin instance and its DAW project. Export a pattern file to share it with another instrument.'; };
    const patternCollection = Object.freeze({ persistent: true, list: async () => { later(paintLibraryNotice, 0); return patternRecords().map(patternMetadata); }, get: async key => clone(parse(storageValues[patternStoragePrefix + String(key)])) || null,
      save: async value => { const pattern = global.MusicLabPatternSchema?.normalize ? global.MusicLabPatternSchema.normalize(value) : clone(value), records = patternRecords(); if (records.length >= 128) throw Error('The pattern library is full (128 patterns). Delete an entry or export it first.'); const key = global.crypto?.randomUUID?.() || 'pattern-' + Date.now() + '-' + (++serial), record = { ...pattern, id: key, createdAt: Date.now(), bytes: storageSize(pattern) }; localStorageFacade.setItem(patternStoragePrefix + key, JSON.stringify(record)); setStatus('Pattern saved with this plugin instance and its DAW project.'); return patternMetadata(record); },
      remove: async key => localStorageFacade.removeItem(patternStoragePrefix + String(key)) });
    let context;
    const host = { version: 1, trackId: 'native-plugin', get tempo() { return clock.tempo; }, get transport() { return { ...clock, when: clock.samplePosition / clock.sampleRate }; }, get context() { return context ||= new ControllerAudioContext({ sampleRate: clock.sampleRate }); }, get destination() { return this.context.destination; }, createAudioContext: options => new ControllerAudioContext(options), audioLibrary: collection, patternLibrary: patternCollection,
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
  function parameterEqual(definition, left, right) { return left !== undefined && right !== undefined && Math.abs(normalized(definition, left) - normalized(definition, right)) < .000001; }
  function acceptParameters(list) {
    if (!Array.isArray(list)) return list;
    const accepted = list.slice();
    list.forEach((item, index) => {
      const pending = localParameters.get(index), ratio = item?.normalized ?? (typeof item === 'number' ? item : undefined);
      if (!pending || ratio === undefined) return;
      if (Math.abs(ratio - pending.normalized) < .000001) { localParameters.delete(index); parameterValues.set(index, pending.value); }
      // A control edit owns its value until the native write is acknowledged.
      // Late timer snapshots may still describe the value before that gesture.
      else if (performance.now() - pending.at < 1500) delete accepted[index];
      else localParameters.delete(index);
    });
    return accepted;
  }
  async function parameterAck(value) {
    const index = Number(value.index), pending = localParameters.get(index);
    if (!pending || pending.clientRevision !== value.clientRevision) return;
    localParameters.delete(index);
    if (Math.abs(Number(value.normalized) - pending.normalized) >= .000001) await receive('kitchenParameters', Object.assign([], { [index]: value.normalized }));
  }
  async function applyParameters(list) {
    if (!Array.isArray(list)) return;
    pendingParameters = list;
    if (!app || !restored || parameterRestoreBusy || disposed) return;
    parameterRestoreBusy = true;
    try {
      while (stateRestorePending) await stateRestorePending;
      while (pendingParameters && !disposed) {
        const next = acceptParameters(pendingParameters); pendingParameters = null;
        const recipe = currentRecipe(), patch = [];
        next.forEach((item, index) => {
          const d = parameters()[index]; if (!d) return;
          const ratio = item?.normalized ?? (typeof item === 'number' ? item : undefined);
          if (ratio === undefined) return;
          const value = actual(d, ratio), path = d.path || d.key;
          parameterValues.set(index, value);
          if (path === '_nativeSequence' || path === 'followHost') { const field = document.getElementById('kitchenNativeSequence'); if (field) field.checked = !!value; }
          else if (path === '_nativeInput') { if (engine) engine.micEnabled = !!value; paintNativeInput(); }
          else if (path === '_nativeInputDestination') paintNativeInput();
          else if (recipe && byPath(recipe, path) !== undefined && !parameterEqual(d, byPath(recipe, path), value)) patch.push([path, value, index]);
        });
        if (!patch.length) continue;
        if (typeof global.KitchenEditorSetParameter === 'function') {
          applying++;
          try {
            const remaining = [];
            for (const [path, value, index] of patch) { if (global.KitchenEditorSetParameter(path, value) === undefined) remaining.push([path, value, index]); else diagnostics.scalarParameterUpdates++; }
            patch.splice(0, patch.length, ...remaining); generation++;
          } finally { applying--; }
          if (!patch.length) continue;
        }
        const project = await projectSnapshot(); if (disposed || !project) continue;
        let dirty = false; for (const [path, value, index] of patch) { const local = localParameters.get(index); if (!local || parameterEqual(parameters()[index], local.value, value)) dirty = assignByPath(project, path, value) || dirty; }
        if (!dirty) continue;
        const loader = app.loadState || app.setState || app.applyState || registered?.setState;
        if (!loader) continue;
        applying++;
        try {
          await loader.call(app, project, { history: false });
          if (id() === 'form') await restoreFormVolume(localParameters.get(parameters().findIndex(d => d.path === 'masterVolume'))?.value ?? project.masterVolume);
          // Do not echo DAW automation back as a new project or retransmit a
          // prepared MORSEL bank. Native parameter atomics already own it.
          changed = false; generation++;
        } finally { applying--; }
      }
    } catch (error) { report(error); }
    finally { parameterRestoreBusy = false; hydrationTouched = performance.now(); }
  }
  function setParameter(index, value, options = {}) {
    const definition = parameters()[index]; if (!definition) return false;
    const ratio = options.normalized ? clamp(Number(value) || 0, 0, 1) : normalized(definition, value);
    value = options.normalized ? actual(definition, ratio) : value;
    const clientRevision = ++parameterRevision;
    localParameters.set(index, { value, normalized: ratio, clientRevision, at: performance.now() });
    parameterValues.set(index, value); diagnostics.parameterMessages++;
    return send('kitchenSetParameter', { index, normalized: ratio, path: definition.path || definition.key, gesture: options.gesture || 'single', clientRevision });
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
    if (!app || !restored || parameterTimer) return;
    parameterTimer = later(() => {
      parameterTimer = 0; if (applying) { scheduleParameters(); return; }
      const recipe = currentRecipe(); if (!recipe) return;
      parameters().forEach((definition, index) => {
        const value = byPath(recipe, definition.path || definition.key || '');
        if (value !== undefined && !parameterEqual(definition, parameterValues.get(index), value)) setParameter(index, value, { gesture: 'edit' });
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
    localParameters.clear();
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
    } finally { applying--; if (stateRestorePending === pending) stateRestorePending = null; hydrationTouched = performance.now(); release(); }
  }
  function voicePitch(voice) {
    const recipe = currentRecipe(), state = recipe?.state || recipe?.project || recipe, tracks = state?.tracks || state?.lanes || state?.parts || state?.sounds;
    if (Array.isArray(tracks)) { const index = typeof voice === 'number' ? voice : tracks.findIndex(value => value.id === voice || value.name === voice); if (index >= 0) return 36 + index; }
    const voices = global.MusicLabPatternInstrument?.notes?.voices || registered?.notes?.voices || [];
    const match = typeof voice === 'string' ? voices.find(value => value.id === voice) : voices[Number(voice) || 0];
    return Number.isInteger(match?.pitch) ? match.pitch : 36 + (Number.isInteger(voice) ? voice : Math.max(0, voices.indexOf(match)));
  }
  function midi(type, note, velocity = .8, channel = 1, noteId) {
    if (applying) return false;
    if (!Number.isFinite(Number(note))) return false;
    const pitch = clamp(Math.round(Number(note)), 0, 127), token = String(noteId ?? channel + ':' + pitch);
    if (type === 'off' && !held.has(token)) return false;
    if (type === 'on' && held.has(token)) midi('off', held.get(token), 0, heldChannels.get(token) || channel, token);
    if (releases.has(token)) { const timer = releases.get(token); clearTimeout(timer); timers.delete(timer); releases.delete(token); }
    let nativeId;
    if (type === 'on') { do { nativeIdSerial = nativeIdSerial >= 0xffffffff ? 0x80000001 : nativeIdSerial + 1; } while ([...heldIds.values()].includes(nativeIdSerial)); nativeId = nativeIdSerial; held.set(token, pitch); heldChannels.set(token, channel); heldIds.set(token, nativeId); }
    else if (type === 'off') { note = held.get(token) ?? pitch; channel = heldChannels.get(token) ?? channel; nativeId = heldIds.get(token); held.delete(token); heldChannels.delete(token); heldIds.delete(token); }
    diagnostics.midiMessages++; return send('kitchenMidi', { type, pitch: type === 'off' ? Number(note) : pitch, velocity: clamp(Number(velocity) || 0, 0, 1), channel: clamp(Number(channel) || 1, 1, 16), id: token, nativeId });
  }
  function audition(pitch, velocity = .8, duration = .35, token, channel = 1) { if (applying) return false; token ??= 'editor-preview-' + (++serial); midi('on', pitch, velocity, channel, token); releases.set(String(token), later(() => midi('off', pitch, 0, channel, token), clamp(Number(duration) || .35, .01, 768) * 1000)); return true; }
  function panicNative(all = false) { for (const [key, pitch] of [...held]) midi('off', pitch, 0, heldChannels.get(key) || 1, key); for (const timer of releases.values()) { clearTimeout(timer); timers.delete(timer); } releases.clear(); held.clear(); heldChannels.clear(); heldIds.clear(); if (all) send('kitchenMidi', { type: 'allOff', explicit: true }); }
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
    for (const name of ['stop', 'stopAll']) replace(name, () => {});
    replace('panic', () => { if (!applying) panicNative(); });
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
    replace('triggerSlice', (slice, options = {}) => audition(60 + Number(options.pitch || 0), options.velocity ?? .8, options.durationSeconds ?? 20, undefined, Number(slice) + 1));
    replace('triggerNode', node => audition(60, 1, 20, undefined, 13 + Number(node)));
    replace('preview', track => {
      if (id() === 'morsel') {
        const recipe = currentRecipe(), voice = !track.voice || track.voice === 'inherit' ? recipe.voice : track.voice, word = value => String(value || '').trim().replace(/\s+/g, ' ');
        if (voice !== recipe.voice || word(track.lyric || recipe.lyric) !== word(recipe.lyric)) { setStatus('Play the phrase in your DAW to hear this step’s assigned word and voice.'); return Promise.resolve(false); }
        return Promise.resolve(audition(track.pitch ?? 60, track.velocity ?? .8, track.durationSeconds ?? 1, track.source));
      }
      const tracks = currentRecipe()?.tracks || [], index = Math.max(0, tracks.findIndex(value => value.id === track?.id || value.name === track?.name)); return Promise.resolve(audition(voicePitch(index), 1, 20));
    });
    replace('trigger', (note, velocity, duration, source) => {
      if (id() === 'batter' && duration && typeof duration === 'object' && (duration.sampleId || duration.soloSource)) { setStatus(duration.sampleId ? 'Use this sample first to audition through the plugin. Lane pads audition the assigned sound.' : 'Source-only audition is available in the web instrument. Lane pads play the complete native voice.'); return Promise.resolve(false); }
      const gate = id() === 'mire' ? duration ?? Math.min(16.1, (currentRecipe()?.sources?.[Number(note)]?.decay ?? 1000) * .0016 + .05) : typeof duration === 'object' ? duration.duration ?? 20 : duration ?? 20;
      return Promise.resolve(audition(id() === 'mire' ? currentRecipe()?.sources?.[Number(note)]?.pitch ?? 60 : ['grain', 'tine', 'batter'].includes(id()) ? voicePitch(note) : note, velocity, gate, source ?? 'key:' + note, id() === 'mire' ? Number(note) + 1 : 1));
    });
    replace('release', (note, source) => midi('off', note, 0, 1, source ?? 'key:' + note));
    replace('pluck', (lane, degree = 0, velocity = .8, note = null) => Promise.resolve(audition(note ?? global.BowerSchema?.degreeMidi(currentRecipe(), lane, degree) ?? 60, velocity, 20, undefined, Number(lane) + 1)));
    replace('strum', () => { for (let lane = 0; lane < 4; lane++) later(() => value.pluck(lane, [0, 2, 4, 7][lane], .9), lane * 45); return Promise.resolve(true); });
    replace('setSustain', down => !applying && send('kitchenMidi', { type: 'cc', controller: 64, value: down ? 1 : 0, channel: 1 }));
    if (['mire', 'spool'].includes(id())) replace('setMic', async (enabled, destination = 0) => {
      if (applying) return !!value.micEnabled;
      const input = parameters().findIndex(d => d.path === '_nativeInput'), target = parameters().findIndex(d => d.path === '_nativeInputDestination');
      if (input < 0) throw Error('Record audio in your DAW, then import the recording into this instrument.');
      if (target >= 0) setParameter(target, clamp(Math.round(Number(destination) || 0), 0, 3));
      setParameter(input, !!enabled); value.micEnabled = !!enabled; paintNativeInput(); setStatus(enabled ? 'DAW audio input enabled. Route audio to this plugin’s input bus in your DAW.' : 'DAW audio input disabled.'); return !!enabled;
    });
    if (id() === 'spool') {
      replace('startDeckRecording', async () => { const message = 'Record audio in your DAW, then import it into the selected deck. Native deck recording is not available.'; setStatus(message); throw Error(message); });
      replace('stopDeckRecording', async () => null);
      replace('cancelDeckRecording', () => { value.deckRecording = null; });
    }
    for (const name of ['cancelNotes', 'stopNotes']) replace(name, (options = {}) => { if (applying) return true; const source = typeof options === 'string' ? options : options.source; for (const [key, pitch] of [...held]) if (!source || key === source || key.startsWith(source + ':')) midi('off', pitch, 0, 1, key); return true; });
    if (id() === 'form') for (const name of ['play', 'schedulePrepared']) replace(name, (sound, velocity, when, pitch, fifth, sixth, seventh) => Promise.resolve(audition(36 + (Number(name === 'play' ? sixth : seventh) || 0), velocity ?? .8, 20)));
    if (id() === 'form') replace('preload', () => Promise.resolve());
  }
  function header() {
    if (document.getElementById('kitchenNativeBar')) return;
    const bar = document.createElement('div'); bar.id = 'kitchenNativeBar'; bar.className = 'kitchen-native-bar';
    const sequenceIndex = parameters().findIndex(value => value.path === '_nativeSequence' || value.path === 'followHost');
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
    const controller = preparation = new AbortController();
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
    paintNativeInput();
  }
  function paintNativeInput() {
    if (!['mire', 'spool'].includes(id()) || !parameters().some(d => d.path === '_nativeInput')) return;
    const button = document.getElementById('mic-button'), enabled = !!engine?.micEnabled;
    if (button) { button.title = 'Enable or disable the plugin’s DAW audio input bus'; button.setAttribute('aria-label', enabled ? 'Disable DAW audio input' : 'Enable DAW audio input'); button.setAttribute('aria-pressed', String(enabled)); button.classList.toggle('mic-active', enabled); if (id() === 'spool') button.classList.toggle('recording', enabled); const text = button.querySelector('span'), label = enabled ? 'DAW input live' : 'DAW input'; if (text && text.textContent !== label) text.textContent = label; }
    const destination = document.querySelector('.mic-destination'); if (destination) { destination.title = 'DAW audio input destination'; destination.setAttribute('aria-label', 'DAW audio input destination'); const index = parameters().findIndex(d => d.path === '_nativeInputDestination'); if (index >= 0 && parameterValues.has(index) && destination.value !== String(parameterValues.get(index))) { destination.value = String(parameterValues.get(index)); applying++; try { destination.dispatchEvent(new Event('change', { bubbles: true })); } finally { applying--; } } for (const option of destination.options) { const text = 'Input → ' + String.fromCharCode(65 + Number(option.value)); if (option.textContent !== text) option.textContent = text; } }
  }
  async function receive(type, value = {}) {
    if (disposed) return; value ||= {};
    const hydrating = ['kitchenReady', 'kitchenState', 'kitchenParameters'].includes(type);
    if (hydrating) { hydrationReceives++; hydrationTouched = performance.now(); }
    try {
    if (type === 'kitchenEditorStorage') { restoreEditorStorage(value.editorStorage || value); return; }
    if (own(value, 'editorStorage')) restoreEditorStorage(value.editorStorage);
    if (value.descriptor) { descriptor = value.descriptor; global.KitchenPluginDescriptor = descriptor; }
    if (type === 'kitchenClock') { clock = { ...clock, ...value, tempo: Number(value.tempo ?? value.bpm ?? clock.tempo), beat: Number(value.beat ?? value.ppq ?? clock.beat), samplePosition: Number(value.samplePosition ?? value.hostSamplePosition ?? clock.samplePosition), timeSigNum: Number(value.timeSigNum ?? value.numerator ?? clock.timeSigNum), timeSigDen: Number(value.timeSigDen ?? value.denominator ?? clock.timeSigDen) }; paintClock(); notify('clock', clock); return; }
    if (type === 'kitchenParameterAck') { await parameterAck(value); return; }
    if (type === 'kitchenParameters') { const accepted = acceptParameters(value); if (instrument()) await applyParameters(accepted); notify('parameters', accepted); return; }
    if (type === 'kitchenCapture') { notify('capture', value); return; }
    if (type === 'kitchenDownloadResult') { setStatus(value.ok ? 'Saved ' + (value.filename || 'your export') + '.' : value.error || 'Export save cancelled.'); notify('download', value); return; }
    if (type === 'kitchenStatus') { setStatus(value.message ?? value.status ?? value); return; }
    if (type === 'kitchenMeters') { clock.meters = value; notify('meters', value); return; }
    if (type === 'kitchenReady') { diagnostics.ready = true; setStatus('Native audio ready. Transport follows your DAW.'); notify('ready', value); }
    if (own(value, 'state')) { nativeState = parse(value.state); if (instrument()) { try { await applyState(nativeState); } catch (error) { report(error); } } notify('state', { ...value, state: nativeState }); }
    if (value.parameters) { const accepted = acceptParameters(value.parameters); if (instrument()) await applyParameters(accepted); notify('parameters', accepted); }
    if (value.status) setStatus(value.status.message || value.status);
    if (!app && instrument()) scheduleAttach();
    } finally { if (hydrating) { hydrationReceives--; hydrationTouched = performance.now(); } }
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
    if (id() === 'marinade' && /^(?:auditiona|auditionb)$/.test(key) || id() === 'fable' && key === 'recordpreview') { event.preventDefault(); event.stopImmediatePropagation(); setStatus('Source-only previews are available in the web instrument. Use the native keyboard or chord audition to hear this plugin.'); return; }
    if (/^(?:playbutton|stopbutton|pausebutton|restartbutton|play|stop|startbutton|transportplay|transportstop)$/.test(key) || target.matches('.transport-play,.transport-stop,[aria-label="Restart sequencer from beginning"]')) { event.preventDefault(); event.stopImmediatePropagation(); setStatus('Start or stop playback in your DAW.'); return; }
    if (id() === 'spool' && key === 'deckrecordbutton') { event.preventDefault(); event.stopImmediatePropagation(); setStatus('Record audio in your DAW, then import it into the selected deck. Native deck recording is not available.'); return; }
    if (/^(?:recordbutton|capturebutton|capturemix)$/.test(key)) { event.preventDefault(); event.stopImmediatePropagation(); setStatus('Record the plugin output in your DAW.'); return; }
    if (/^(?:panicbutton|panic)$/.test(key)) { event.preventDefault(); event.stopImmediatePropagation(); panicNative(true); setStatus('All native notes released.'); }
  }
  function edited(event) {
    if (app?.engine && app.engine !== engine) patchEngine(app.engine);
    // React commits HOTPLATE asynchronously; MORSEL emits its state change
    // before the debounced parameter send. Capture their small control values
    // now so an already queued native echo cannot undo the user's gesture.
    if (restored && (!applying || event?.isTrusted) && ['input', 'change'].includes(event?.type)) {
      const path = id() === 'form' && event.target === formVolume() ? 'masterVolume' : id() === 'morsel' && event.target?.matches?.('input[data-knob]') ? 'recipe.' + event.target.dataset.knob : null;
      const index = path ? parameters().findIndex(d => d.path === path) : -1;
      if (index >= 0) {
        const value = byPath(currentRecipe(), path), definition = parameters()[index];
        if (value !== undefined && !parameterEqual(definition, parameterValues.get(index), value)) localParameters.set(index, { value, normalized: normalized(definition, value), clientRevision: 0, at: performance.now() });
      }
    }
    scheduleParameters(); scheduleSnapshot();
  }
  async function downloadAction(event) {
    const link = event.target?.closest?.('a[download]');
    if (!link || !/^(?:blob:|data:)/.test(link.href)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    try {
      const blob = await (await fetch(link.href)).blob();
      const encoded = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(reader.error || Error('The export could not be prepared.')); reader.readAsDataURL(blob); });
      send('kitchenDownload', { filename: link.download || 'kitchen-export', mimeType: blob.type || 'application/octet-stream', base64: encoded });
      setStatus('Choose where to save your export.');
    } catch (error) { report(error); }
  }
  function hydrated() { return diagnostics.ready && (instrument() ? !!app && restored : !!global.KitchenEffectEditor) && !applying && !parameterRestoreBusy && !stateRestorePending && !pendingParameters && !hydrationReceives; }
  async function whenHydrated(timeoutMs = 10000) {
    const start = performance.now();
    while (!disposed && performance.now() - start < timeoutMs) {
      // Wait beyond the native 200 ms parameter poll as well as all promise
      // continuations and React commits belonging to the initial snapshot.
      if (hydrated() && performance.now() - hydrationTouched >= 260) return true;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw Error('The original editor did not finish native hydration.');
  }
  async function runSmokeTest() {
    const result = { sourceId: id(), pass: false, ready: false, restored: false };
    try {
      await whenHydrated();
      result.ready = diagnostics.ready; result.restored = instrument() ? restored : !!global.KitchenEffectEditor;
      if (!result.ready || !result.restored) throw Error('The original editor did not finish native hydration.');
      const probes = { brine: ['input[data-slider="pwmAmount"]', 'synth.pwmAmount'], form: ['input[aria-label="Master playback volume"]', 'masterVolume'], morsel: ['input[data-knob="tone"]', 'recipe.tone'], sunday: ['input[data-deluxe-number="input"]', 'params.input'] };
      const probe = probes[id()]; if (!probe) throw Error('No native smoke control is configured for ' + id());
      const field = document.querySelector(probe[0]), index = parameters().findIndex(value => value.path === probe[1]);
      if (!field || index < 0) throw Error('The original native smoke control or its parameter is missing.');
      const recipe = () => instrument() ? currentRecipe() : global.KitchenEffectEditor?.state;
      const before = byPath(recipe(), probe[1]), count = diagnostics.parameterMessages, low = Number(field.min || 0), high = Number(field.max || 1), step = Number(field.step || .01), current = Number(field.value);
      const next = clamp(current + (current + step * 2 <= high ? step * 2 : -step * 2), low, high);
      result.controlName = field.getAttribute('aria-label') || field.id;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, String(next));
      field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true }));
      for (let attempt = 0; attempt < 100 && diagnostics.parameterMessages === count; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
      const after = byPath(recipe(), probe[1]); result.parameter = { index, path: probe[1], before, after, normalizedAfter: normalized(parameters()[index], after) }; result.parameterMessages = diagnostics.parameterMessages - count;
      result.pass = before !== after && result.parameterMessages > 0;
      if (!result.pass) throw Error('The original control edit did not round-trip through native parameters.');
    } catch (error) { result.error = error.message || String(error); }
    send('kitchenSmokeResult', result); return result;
  }
  async function runNeuralSmokeTest() {
    const result = { sourceId: id(), pass: false, word: 'zucchini', voice: 'alto', pitch: 60, tempo: 120, workersCreated: 0, nativeBankPublished: false, workerTrace: [], environment: { protocol: location.protocol, secureContext: global.isSecureContext, userAgent: String(navigator.userAgent).slice(0, 180) } }, started = performance.now();
    let audio, saved, controller, WorkerConstructor, CountingWorker, BlobConstructor, DiagnosticBlob, recipeBefore, snapshotsBefore, neuralWorkerReady = false, stretchWorkerReady = false, fitCalls = 0, analysisCalls = 0;
    const trace = value => { if (result.workerTrace.length < 48) result.workerTrace.push({ ms: Math.round(performance.now() - started), ...value }); };
    try {
      await whenHydrated();
      if (id() !== 'morsel' || !app?.engine || !global.KitchenMorselPreparation?.prepareBank) throw Error('Open the complete MORSEL native editor before running its neural smoke test.');
      if (preparation || app.engine.preparing || app.engine.pendingWords.size || app.engine.pendingNotes.size) throw Error('Another MORSEL preparation is still active.');
      result.blobWorkerProbe = await new Promise((resolve, reject) => {
        const source = 'self.onmessage=e=>self.postMessage({echo:e.data,wasm:typeof WebAssembly==="object",decompressionStream:typeof DecompressionStream==="function",readableStreamAsyncIterator:typeof ReadableStream!=="undefined"&&typeof ReadableStream.prototype[Symbol.asyncIterator]==="function",origin:self.origin,secureContext:self.isSecureContext});';
        const url = URL.createObjectURL(new Blob([source], { type: 'application/javascript' })); let worker;
        const timer = setTimeout(() => { worker?.terminate(); URL.revokeObjectURL(url); reject(Error('The native Blob Worker echo timed out after 3 seconds.')); }, 3000);
        try { worker = new global.Worker(url); worker.onmessage = event => { clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(url); resolve(event.data); }; worker.onerror = event => { clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(url); reject(Error(event.message || 'The native Blob Worker echo failed.')); }; worker.postMessage('kitchen-native-worker'); } catch (error) { clearTimeout(timer); worker?.terminate(); URL.revokeObjectURL(url); reject(error); }
      });
      audio = app.engine; recipeBefore = JSON.stringify(await projectSnapshot()); snapshotsBefore = diagnostics.snapshots;
      saved = { words: audio.words, noteCache: audio.noteCache, pendingWords: audio.pendingWords, pendingNotes: audio.pendingNotes, wordBytes: audio.wordBytes, noteBytes: audio.noteBytes, reservedNoteBytes: audio.reservedNoteBytes, preparing: audio.preparing, fit: Object.getOwnPropertyDescriptor(audio.stretch, 'fit'), analyze: Object.getOwnPropertyDescriptor(audio.stretch, 'analyze') };
      audio.words = new Map(); audio.noteCache = new Map(); audio.pendingWords = new Map(); audio.pendingNotes = new Map(); audio.wordBytes = audio.noteBytes = audio.reservedNoteBytes = 0;
      controller = preparation = new AbortController(); WorkerConstructor = global.Worker;
      BlobConstructor = global.Blob;
      DiagnosticBlob = function (parts = [], options) {
        const transformed = parts.map(part => {
          if (typeof part !== 'string' || !part.includes('function runWorker') || !part.includes('const plainIPA')) return part;
          let source = part;
          for (const [needle, stage] of [['const plainIPA =', 'phonemize-start'], ['const ipa =', 'phonemize-done'], ['const output = await session.run(', 'inference-start'], ['const generated =', 'inference-done']]) source = source.replace(needle, '__kitchenNeuralReport(' + JSON.stringify(stage) + ');' + needle);
          const prefix = 'const __kitchenNeuralReport=(stage,error)=>self.postMessage({kitchenNeuralStage:stage,message:String(error?.message||error||"").slice(0,500),stack:String(error?.stack||"").slice(0,900)});self.addEventListener("error",e=>__kitchenNeuralReport("worker-global-error",e.error||e.message));self.addEventListener("unhandledrejection",e=>__kitchenNeuralReport("worker-unhandled-rejection",e.reason));self.postMessage({kitchenNeuralStage:"worker-features",message:JSON.stringify({streamAsyncIterator:typeof ReadableStream.prototype[Symbol.asyncIterator]==="function"})});\n';
          trace({ event: 'neural-stage-instrumentation' }); return prefix + source;
        });
        return new BlobConstructor(transformed, options);
      };
      DiagnosticBlob.prototype = BlobConstructor.prototype; Object.setPrototypeOf(DiagnosticBlob, BlobConstructor); global.Blob = DiagnosticBlob;
      CountingWorker = function (...args) {
        const worker = new WorkerConstructor(...args), number = ++result.workersCreated; trace({ worker: number, event: 'created', type: args[1]?.type || 'classic', url: String(args[0]).slice(0, 120) });
        const post = worker.postMessage.bind(worker);
        try { worker.postMessage = function (value, ...transfer) { trace({ worker: number, event: 'out', id: value?.id, kind: value?.kind || (value?.text ? 'render-word' : 'fit'), text: value?.text ? String(value.text).slice(0, 60) : undefined, frames: value?.audio?.left?.length }); return post(value, ...transfer); }; } catch (_) {}
        worker.addEventListener('message', event => { const value = event.data; if (value?.ready) { if (value.backend) neuralWorkerReady = true; else stretchWorkerReady = true; } trace({ worker: number, event: 'in', id: value?.id, kind: value?.kitchenNeuralStage || (value?.ready ? 'ready' : value?.result ? 'word-result' : value?.left ? 'fit-result' : value?.audio ? 'analysis-result' : 'other'), backend: value?.backend, message: String(value?.initializationError || value?.error || value?.message || '').slice(0, 500), stack: String(value?.stack || '').slice(0, 900) }); });
        worker.addEventListener('error', event => trace({ worker: number, event: 'error', message: String(event.message || '').slice(0, 500), filename: String(event.filename || '').slice(0, 160), line: event.lineno, column: event.colno, stack: String(event.error?.stack || '').slice(0, 900) }));
        worker.addEventListener('messageerror', () => trace({ worker: number, event: 'messageerror' })); return worker;
      };
      CountingWorker.prototype = WorkerConstructor.prototype; Object.setPrototypeOf(CountingWorker, WorkerConstructor); global.Worker = CountingWorker;
      const fit = audio.stretch.fit, analyze = audio.stretch.analyze;
      audio.stretch.fit = function (...args) { fitCalls++; return fit.apply(this, args); };
      audio.stretch.analyze = function (...args) { analysisCalls++; return analyze.apply(this, args); };
      const state = global.MorselSchema.normalize({ ...app.getState(), voice: 'alto', lyric: 'zucchini', phrase: '', tempo: 120, musicLabPattern: undefined, steps: Array.from({ length: 32 }, () => ({ ...global.MorselSchema.step(), on: false })) });
      const helper = global.KitchenMorselPreparation, bank = await helper.prepareBank({ audio, state, voices: ['alto'], pitches: [60], tempos: [120], keyboardDuration: .8, signal: controller.signal });
      const measure = entry => { if (!entry) throw Error('Neural preparation returned no PCM.'); const pcm = helper.decode(entry.pcm, entry.frames); let peak = 0, energy = 0; for (const value of pcm) { if (!Number.isFinite(value)) throw Error('Neural preparation returned non-finite PCM.'); peak = Math.max(peak, Math.abs(value)); energy += value * value; } return { frames: pcm.length, sampleRate: entry.sampleRate, seconds: pcm.length / entry.sampleRate, finite: true, peak, rms: Math.sqrt(energy / Math.max(1, pcm.length)) }; };
      const word = bank.words[0], note = bank.notes.find(entry => entry.pitch === 60);
      result.backend = bank.backend; result.modelHash = String(bank.modelHash || global.MorselSpeech?.modelHash || '').slice(0, 64); result.neuralReady = !!global.MorselSpeech?.ready; result.neuralWorkerReady = neuralWorkerReady;
      result.signalsmith = { analysisCalls, fitCalls, ready: !!audio.stretch.worker && !!audio.stretch.ready, workerReady: stretchWorkerReady };
      result.wordFit = { ...measure(word), voicedFrames: word.voicedFrames?.length || 0, maskFrames: word.maskFrames || 0 }; result.noteFit = measure(note);
      result.emptyPattern = global.MorselSequence.events(state, { realizeProbability: false }).length === 0;
      if (bank.words.length !== 1 || bank.notes.length !== 1 || !result.neuralReady || !result.signalsmith.ready || analysisCalls < 1 || fitCalls < 1 || result.wordFit.peak < 1e-5 || result.noteFit.peak < 1e-5 || !result.emptyPattern) throw Error('The real neural word and Signalsmith note-fit proof is incomplete.');
      result.pass = true;
    } catch (error) { result.error = error.message || String(error); }
    finally {
      if (WorkerConstructor && global.Worker === CountingWorker) global.Worker = WorkerConstructor;
      if (BlobConstructor && global.Blob === DiagnosticBlob) global.Blob = BlobConstructor;
      result.neuralReady = !!global.MorselSpeech?.ready; result.neuralWorkerReady = neuralWorkerReady;
      result.signalsmith ||= { analysisCalls, fitCalls, ready: !!audio?.stretch?.worker && !!audio?.stretch?.ready, workerReady: stretchWorkerReady };
      if (!result.pass && audio) { controller?.abort(); global.MorselSpeech?.dispose?.(); audio.stretch?.close?.(); }
      if (audio && saved) {
        for (const key of ['words', 'noteCache', 'pendingWords', 'pendingNotes', 'wordBytes', 'noteBytes', 'reservedNoteBytes', 'preparing']) audio[key] = saved[key];
        for (const key of ['fit', 'analyze']) { if (saved[key]) Object.defineProperty(audio.stretch, key, saved[key]); else delete audio.stretch[key]; }
        result.cachesRestored = audio.words === saved.words && audio.noteCache === saved.noteCache && audio.wordBytes === saved.wordBytes && audio.noteBytes === saved.noteBytes;
      }
      if (preparation === controller) preparation = null;
      try { result.recipeUnchanged = recipeBefore !== undefined && recipeBefore === JSON.stringify(await projectSnapshot()); } catch (error) { result.recipeUnchanged = false; result.error ||= error.message || String(error); } result.nativeBankPublished = snapshotsBefore !== undefined && diagnostics.snapshots !== snapshotsBefore;
      result.elapsedMs = Math.round(performance.now() - started); result.pass = result.pass && result.cachesRestored && result.recipeUnchanged && !result.nativeBankPublished;
      send('kitchenNeuralSmokeResult', result);
    }
    return result;
  }
  const anchorClick = global.HTMLAnchorElement?.prototype.click;
  if (anchorClick) global.HTMLAnchorElement.prototype.click = function (...args) {
    if (this.hasAttribute('download') && /^(?:blob:|data:)/.test(this.href)) { downloadAction({ target: this, preventDefault() {}, stopImmediatePropagation() {} }); return; }
    return anchorClick.apply(this, args);
  };
  function dispose() {
    if (disposed) return; for (const [key, pitch] of held) midi('off', pitch, 0, 1, key);
    disposed = true; preparation?.abort(); for (const timer of timers) clearTimeout(timer); timers.clear();
    for (const [type, token, listener] of backendListeners) { try { backend.removeEventListener?.(token ?? type, listener); } catch (_) {} }
    for (const context of contexts) context.close().catch(() => {}); contexts.clear(); subscriptions.clear();
  }
  installEditorStorage(); silenceBrowserAudio(); connectBackend();
  for (const type of ['input', 'change', 'musiclab:state-change', 'musiclab:patternchange']) document.addEventListener(type, edited);
  document.addEventListener('pointerup', () => later(edited, 0)); document.addEventListener('click', () => later(edited, 0));
  document.addEventListener('click', transportAction, true);
  document.addEventListener('click', downloadAction, true);
  document.addEventListener('keydown', event => { if (!instrument() || event.target.closest?.('input,textarea,select,[contenteditable=true]')) return; if (event.code === 'Space') { event.preventDefault(); event.stopImmediatePropagation(); setStatus('Transport follows your DAW.'); } else if (event.code === 'Escape' && !document.querySelector('dialog[open]')) panicNative(true); }, true);
  document.addEventListener('musiclab:app-ready', scheduleAttach);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { if (instrument()) { header(); scheduleAttach(); } send('kitchenReady', { request: true }); }, { once: true });
  else { if (instrument()) { header(); scheduleAttach(); } send('kitchenReady', { request: true }); }
  global.addEventListener('pagehide', dispose);
  global.KitchenNativeEditor = Object.freeze({ send, subscribe, receive, setParameter, normalized, actual, prepareVoices, attach, captureState, getProject: projectSnapshot, whenHydrated, runSmokeTest, runNeuralSmokeTest, dispose, get descriptor() { return descriptor; }, get state() { return nativeState; }, get clock() { return { ...clock }; }, get diagnostics() { return { ...diagnostics, errors: [...diagnostics.errors], attached: !!app, hydrated: hydrated(), hydrationReceives, pendingLocalParameters: localParameters.size, browserContexts: contexts.size }; } });
})(window);
