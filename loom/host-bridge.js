/* LOOM hosted-instrument bridge. Installed before any instrument script runs. */
(function (global) {
  'use strict';

  function bootstrap(key) {
    'use strict';
    const record = parent.__LoomHostRegistry[key];
    if (!record || !record.active) throw new Error('This instrument has been unloaded.');
    const contexts = new Set(), rawNodes = new WeakMap(), wrappedNodes = new WeakMap();
    const nativeNodeConstructors = new Map();
    const nativeGetUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    const streams = new Set();
    let adapter = null, defaultContext = null, sequence = 0, tempo = record.tempo || 120;
    const clone = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const cancelled = () => !record.active;
    const abort = () => new DOMException('The instrument has been unloaded.', 'AbortError');
    const requireActive = () => { if (cancelled()) throw abort(); };
    const unwrap = value => rawNodes.get(value) || value?.__loomRawContext || value;
    const notify = (type, value) => { if (!cancelled()) record.notify(type, value); };

    // All storage lives in this DAW instance. Standalone instruments' keys are never touched.
    function makeStorage(values) {
      const data = Object.assign(Object.create(null), values || {});
      const methods = {
        getItem(name) { name = String(name); return Object.hasOwn(data, name) ? data[name] : null; },
        setItem(name, value) { data[String(name)] = String(value); notify('change', null); },
        removeItem(name) { delete data[String(name)]; notify('change', null); },
        clear() { Object.keys(data).forEach(name => delete data[name]); notify('change', null); },
        key(index) { return Object.keys(data)[Number(index)] ?? null; }
      };
      return { data, facade: new Proxy(methods, {
        get(target, property) { if (property === 'length') return Object.keys(data).length; return property in target ? target[property] : data[property]; },
        set(_, property, value) { methods.setItem(property, value); return true; },
        deleteProperty(_, property) { methods.removeItem(property); return true; },
        ownKeys() { return Object.keys(data); },
        getOwnPropertyDescriptor(_, property) { return Object.hasOwn(data, property) ? { configurable: true, enumerable: true, writable: true, value: data[property] } : undefined; }
      }) };
    }
    const local = makeStorage(record.storage), session = makeStorage();
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => local.facade });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get: () => session.facade });
    // Future instruments that use IndexedDB also receive a separate namespace.
    let nativeIndexedDB; try { nativeIndexedDB = window.indexedDB; } catch (_) {}
    if (nativeIndexedDB) {
      const prefix = key + ':';
      const isolatedIndexedDB = new Proxy(nativeIndexedDB, { get(target, property) {
        if (property === 'open') return (name, version) => { requireActive(); return version === undefined ? target.open(prefix + String(name)) : target.open(prefix + String(name), version); };
        if (property === 'deleteDatabase') return name => { requireActive(); return target.deleteDatabase(prefix + String(name)); };
        if (property === 'databases' && typeof target.databases === 'function') return async () => (await target.databases()).filter(database => database.name?.startsWith(prefix)).map(database => ({ ...database, name: database.name.slice(prefix.length) }));
        const value = Reflect.get(target, property, target); return typeof value === 'function' ? value.bind(target) : value;
      } });
      Object.defineProperty(window, 'indexedDB', { configurable: true, get: () => isolatedIndexedDB });
    }

    function wrapNode(node, facade) {
      if (!node || typeof node.connect !== 'function') return node;
      if (wrappedNodes.has(node)) return wrappedNodes.get(node);
      facade._nodes.add(node);
      const proxy = new Proxy(node, {
        get(target, property) {
          if (property === 'context') return facade;
          const value = Reflect.get(target, property, target);
          if (property === 'constructor') return value;
          if (typeof value !== 'function') return value;
          return (...args) => {
            if (property === 'connect' || property === 'start') requireActive();
            const result = value.apply(target, args.map(unwrap));
            return result && typeof result.connect === 'function' ? wrapNode(result, facade) : result;
          };
        },
        set(target, property, value) { return Reflect.set(target, property, unwrap(value), target); }
      });
      rawNodes.set(proxy, node); wrappedNodes.set(node, proxy);
      return proxy;
    }

    function createContext() {
      requireActive();
      const raw = record.getContext();
      if (!raw) throw new Error('Start LOOM audio before playing an instrument.');
      const output = raw.createGain(); output.gain.value = record.soundEnabled ? 1 : 0; output.connect(record.getInput());
      const listeners = new Set(), modules = new Map(), nodes = new Set();
      const processorPrefix = 'loom-' + key.replace(/[^a-zA-Z0-9-]/g, '-') + '-' + (++sequence) + '-';
      let closed = false, suspended = false;
      const facade = {
        _nodes: nodes,
        get __loomRawContext() { return raw; },
        get destination() { return wrapNode(output, proxy); },
        get state() { return closed || cancelled() ? 'closed' : suspended ? 'suspended' : raw.state; },
        get audioWorklet() {
          if (!raw.audioWorklet) return undefined;
          return { addModule: async (url, options) => {
            requireActive();
            const address = String(url);
            if (modules.has(address)) return modules.get(address);
            const pending = (async () => {
            // Processor names belong to the shared context; give every hosted context its own names.
            const response = await fetch(url); if (!response.ok) throw new Error('Could not load the instrument processor.');
            const source = await response.text(); requireActive();
            const renamed = 'const registerProcessor=(name,processor)=>globalThis.registerProcessor(' + JSON.stringify(processorPrefix) + '+name,processor);\n' + source.replace(/globalThis\.registerProcessor\s*\(/g, 'registerProcessor(');
            const blobURL = URL.createObjectURL(new Blob([renamed], { type: 'text/javascript' }));
            try { await raw.audioWorklet.addModule(blobURL, options); requireActive(); }
            finally { URL.revokeObjectURL(blobURL); }
            })();
            modules.set(address, pending);
            try { return await pending; } catch (error) { modules.delete(address); throw error; }
          } };
        },
        async resume() { requireActive(); if (closed) throw new DOMException('This context is closed.', 'InvalidStateError'); suspended = false; output.gain.setValueAtTime(record.soundEnabled ? 1 : 0, raw.currentTime); if (raw.state === 'suspended' && record.soundEnabled) await raw.resume(); requireActive(); dispatch(); },
        async suspend() { if (closed) return; suspended = true; output.gain.setValueAtTime(0, raw.currentTime); dispatch(); },
        async close() { if (closed) return; closed = true; output.gain.setValueAtTime(0, raw.currentTime); nodes.forEach(node => { try { node.stop?.(); } catch (_) {} try { node.disconnect(); } catch (_) {} }); try { output.disconnect(); } catch (_) {} contexts.delete(proxy); dispatch(); },
        addEventListener(type, listener) { if (type === 'statechange') listeners.add(listener); },
        removeEventListener(type, listener) { if (type === 'statechange') listeners.delete(listener); },
        dispatchEvent(event) { if (event.type === 'statechange') dispatch(); return true; },
        _processorName(name) { return processorPrefix + name; }
      };
      function dispatch() { const event = new Event('statechange'); listeners.forEach(listener => typeof listener === 'function' ? listener.call(proxy, event) : listener.handleEvent?.(event)); proxy.onstatechange?.(event); }
      const proxy = new Proxy(facade, {
        get(target, property) {
          if (property in target) return Reflect.get(target, property, target);
          const value = Reflect.get(raw, property, raw);
          if (typeof value !== 'function') return value;
          return (...args) => { requireActive(); if (closed) throw new DOMException('This context is closed.', 'InvalidStateError'); return wrapNode(value.apply(raw, args.map(unwrap)), proxy); };
        },
        set(target, property, value) { target[property] = value; return true; }
      });
      contexts.add(proxy); return proxy;
    }
    function HostedAudioContext() { return createContext(); }
    Object.defineProperty(window, 'AudioContext', { configurable: true, writable: true, value: HostedAudioContext });
    Object.defineProperty(window, 'webkitAudioContext', { configurable: true, writable: true, value: HostedAudioContext });
    // Constructor-style Web Audio is supported as well as createGain/createBufferSource.
    const constructorNames = ['AudioWorkletNode', 'AnalyserNode', 'AudioBufferSourceNode', 'BiquadFilterNode', 'ChannelMergerNode', 'ChannelSplitterNode', 'ConstantSourceNode', 'ConvolverNode', 'DelayNode', 'DynamicsCompressorNode', 'GainNode', 'IIRFilterNode', 'MediaElementAudioSourceNode', 'MediaStreamAudioSourceNode', 'MediaStreamAudioDestinationNode', 'OscillatorNode', 'PannerNode', 'StereoPannerNode', 'WaveShaperNode'];
    constructorNames.forEach(name => {
      const Native = window[name]; if (!Native) return; nativeNodeConstructors.set(name, Native);
      window[name] = new Proxy(Native, { construct(target, args) {
        const facade = args[0]; if (!facade?.__loomRawContext) return Reflect.construct(target, args);
        requireActive(); if (facade.state === 'closed') throw new DOMException('This context is closed.', 'InvalidStateError'); const rawArgs = [...args]; rawArgs[0] = facade.__loomRawContext;
        if (name === 'AudioWorkletNode') rawArgs[1] = facade._processorName(rawArgs[1]);
        return wrapNode(Reflect.construct(target, rawArgs), facade);
      } });
    });
    if (nativeGetUserMedia) navigator.mediaDevices.getUserMedia = async constraints => {
      requireActive(); const stream = await nativeGetUserMedia(constraints);
      if (cancelled()) { stream.getTracks().forEach(track => track.stop()); throw abort(); }
      streams.add(stream); return stream;
    };

    const publicAPI = Object.freeze({
      version: 1, trackId: record.trackId,
      get tempo() { return tempo; },
      get context() { if (!defaultContext || defaultContext.state === 'closed') defaultContext = createContext(); return defaultContext; },
      get destination() { return this.context.destination; },
      createAudioContext: createContext,
      registerInstrument(value) { if (!value || typeof value !== 'object') throw new TypeError('Register an instrument adapter object.'); adapter = value; notify('registered', null); return publicAPI; },
      notifyStateChange() { notify('change', null); },
      status(message) { notify('status', String(message)); }
    });
    Object.defineProperty(window, 'MusicLabHost', { value: publicAPI, writable: false });
    Object.defineProperty(window, '__LoomBridge', { value: Object.freeze({
      get adapter() { return adapter; },
      get storage() { return clone(local.data); },
      get contexts() { return contexts.size; },
      setTempo(value) { tempo = value; },
      mute(value) { record.soundEnabled = !value; contexts.forEach(context => { try { context.destination.gain.setValueAtTime(value ? 0 : 1, context.currentTime); } catch (_) {} }); },
      releaseMedia() { streams.forEach(stream => stream.getTracks().forEach(track => track.stop())); streams.clear(); },
      async dispose() { streams.forEach(stream => stream.getTracks().forEach(track => track.stop())); streams.clear(); await Promise.allSettled([...contexts].map(context => context.close())); },
      async command(command, payload) { requireActive(); if (!adapter || typeof adapter[command] !== 'function') return undefined; return adapter[command](payload); }
    }), writable: false });
    window.addEventListener('error', event => notify('error', event.message));
    window.addEventListener('unhandledrejection', event => { if (event.reason?.name !== 'AbortError') notify('error', event.reason?.message || String(event.reason)); });
    document.addEventListener('click', event => {
      const anchor = event.target.closest?.('a[href]'); if (!anchor || anchor.hasAttribute('download') || anchor.getAttribute('href').startsWith('#')) return;
      event.preventDefault(); window.open(anchor.href, '_blank', 'noopener');
    });
    document.addEventListener('input', () => notify('change', null), true);
    document.addEventListener('change', () => notify('change', null), true);
    document.addEventListener('click', () => { setTimeout(() => notify('change', null), 250); }, true);
    const userAudioAction = event => { if (event.isTrusted && !cancelled()) window.__LoomBridge.mute(false); };
    document.addEventListener('pointerdown', userAudioAction, true);
    document.addEventListener('keydown', userAudioAction, true);
    notify('booted', null);
  }

  global.LoomHostBridge = Object.freeze({
    version: 1,
    source(key) { return '(' + bootstrap.toString() + ')(' + JSON.stringify(String(key)) + ');'; }
  });
})(window);
