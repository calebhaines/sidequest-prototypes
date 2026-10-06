/* Existing and future Kitchen instruments, hosted with their real interfaces and engines. */
(function (global) {
  'use strict';
  const manifest = Object.freeze([
    { id: 'grain', name: 'SIZZLE', description: 'Noise drum machine', facade: 'GrainApp', storageKey: 'grain-drum-machine-v2', color: '#e1c98c' },
    { id: 'form', name: 'HOTPLATE', description: 'Electronic drum groovebox', facade: 'FormApp', storageKey: 'form-studio-v2', color: '#ee7948' },
    { id: 'tine', name: 'CLATTER', description: 'Physical modeling drum machine', facade: 'TineApp', storageKey: 'tine-drum-machine-v1', color: '#bfc4bd' },
    { id: 'mire', name: 'REDUCE', description: 'Feedback network instrument', facade: 'MireApp', storageKey: 'mire-project-v1', color: '#cfad71' },
    { id: 'spool', name: 'ROTISSERIE', description: 'Four-deck tape instrument', facade: 'SpoolApp', storageKey: 'spool-project-v1', color: '#e2ad65' },
    { id: 'haze', name: 'STEAM', description: 'Spectral sound painter', facade: 'HazeApp', storageKey: 'haze-project-v1', color: '#9eafb3' },
    { id: 'bower', name: 'SKEWER', description: 'Generative physical strings', facade: 'BowerApp', storageKey: 'musiclab-bower-score-v1', color: '#c9be98' },
    { id: 'ravel', name: 'DICER', description: 'Stereo sample slicer', facade: 'RavelApp', storageKey: 'ravel-project-v1', color: '#ef9b70' },
    { id: 'fable', name: 'STOCK', description: 'Polyphonic multisample instrument', facade: 'FableApp', storageKey: 'fable-project-v1', color: '#acb9b3' },
    { id: 'roux', name: 'ROUX', description: 'Circular recipe bass synthesizer', facade: 'RouxApp', storageKey: 'roux-project-v1', color: '#ddbf67' },
    { id: 'batter', name: 'BATTER', description: 'Recorded acoustic drums and intricate rhythms', facade: 'BatterApp', storageKey: 'batter-project-v1', color: '#dcaa6b' }
  ].map(item => Object.freeze({ ...item, url: '../' + item.id + '/index.html' })));
  const clone = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
  const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const cancelledError = () => new DOMException('This instrument operation was cancelled.', 'AbortError');
  function withAbort(value, signals) {
    const active = signals.filter(Boolean); if (active.some(signal => signal.aborted)) return Promise.reject(cancelledError());
    let remove = () => {};
    const canceled = new Promise((_, reject) => { const abort = () => reject(cancelledError()); active.forEach(signal => signal.addEventListener('abort', abort, { once: true })); remove = () => active.forEach(signal => signal.removeEventListener('abort', abort)); });
    return Promise.race([Promise.resolve(value), canceled]).finally(remove);
  }

  function instrumentHTML(html, key, baseURL, id) {
    const document = new DOMParser().parseFromString(html, 'text/html');
    document.querySelectorAll('base,meta[http-equiv="Content-Security-Policy"],meta[http-equiv="refresh"]').forEach(node => node.remove());
    const base = document.createElement('base'); base.href = baseURL; document.head.prepend(base);
    const bridge = document.createElement('script'); bridge.textContent = global.LoomHostBridge.source(key); base.after(bridge);
    if (id === 'form' && !html.includes('musiclab:app-ready')) {
      // HOTPLATE's React reducer is exposed only in this hosted copy. The standalone bundle is untouched.
      let integrated = false;
      document.querySelectorAll('script[type="module"]').forEach(script => {
        const signature = 'We.current={project:f,masterVolume:Te,solo:ae};';
        if (!script.textContent.includes(signature)) return;
        const expose = 'window.FormApp={getState:()=>pn(We.current.project),getProject:()=>pn(We.current.project),isPlaying:()=>q,get engine(){return Ge.current},prepare:()=>il().preload(We.current.project.sounds),play:()=>_(!0),stop:()=>{_(!1);Ge.current?.stopAll()},panic:()=>{_(!1);Ge.current?.stopAll()},setTempo:value=>c({type:"change",update:p=>({...p,bpm:Math.max(40,Math.min(240,Number(value)||120))})}),loadState:value=>{const p=value?.project||value;if(!sf(p))throw Error("Invalid HOTPLATE project.");_(!1);Ge.current?.stopAll();c({type:"load",project:{...p,sounds:p.sounds.map(Ll)}});S(0);ce(null)}};';
        script.textContent = script.textContent.replace(signature, signature + expose); integrated = true;
      });
      if (!integrated) throw new Error('This HOTPLATE version needs an updated host adapter.');
    }
    return '<!doctype html>\n' + document.documentElement.outerHTML;
  }

  class LoomInstrumentHost {
    constructor({ context, getTrackInput, transport, onStatus, onStateChange, baseURL, embedded } = {}) {
      if (typeof getTrackInput !== 'function') throw new TypeError('Provide getTrackInput(trackId).');
      this.context = context; this.getTrackInput = getTrackInput; this.onStatus = onStatus || (() => {}); this.onStateChange = onStateChange || (() => {});
      this.baseURL = baseURL || new URL('../', document.baseURI).href;
      this.embedded = embedded || global.LoomEmbeddedInstruments || {};
      this.transport = typeof transport === 'function' ? transport : () => ({ beat: 0, tempo: this.tempo, when: this._context()?.currentTime || 0, playing: false, revision: 0 });
      this.records = new Map(); this.generation = 0; this.tempo = 120; this.disposed = false;
      global.__LoomHostRegistry ||= Object.create(null);
    }
    get manifest() { return manifest; }
    _context() { return typeof this.context === 'function' ? this.context() : this.context; }
    _current(record) { return record.active && this.records.get(record.trackId) === record && !this.disposed; }
    _notify(record, type, value) {
      if (!this._current(record)) return;
      if (type === 'change') {
        clearTimeout(record.changeTimer); record.changeTimer = setTimeout(() => { if (this._current(record)) this.onStateChange(record.trackId); }, 300);
      } else if (type === 'error') this.onStatus(record.trackId, value, 'error');
      else if (type === 'status') this.onStatus(record.trackId, value, 'info');
    }
    async load(trackId, descriptor, iframe) {
      if (this.disposed) throw new Error('This instrument host has been disposed.');
      if (!(iframe instanceof HTMLIFrameElement)) throw new TypeError('Provide an instrument iframe.');
      this.unload(trackId);
      const definition = manifest.find(item => item.id === descriptor?.id);
      const id = definition?.id || descriptor?.id || 'custom';
      const supplied = descriptor?.snapshot || descriptor?.state;
      const snapshot = supplied?.format === 'loom-instrument-state' ? supplied : null;
      if (snapshot && snapshot.app !== id) throw new Error('This saved instrument state belongs to another app.');
      const state = snapshot ? snapshot.state : supplied;
      const storage = Object.assign(Object.create(null), snapshot?.storage || {});
      if (state && definition?.storageKey) {
        const primed = id === 'form' ? state.project || state : state;
        storage[definition.storageKey] = JSON.stringify(primed);
      }
      const key = 'loom-' + Date.now().toString(36) + '-' + (++this.generation) + '-' + Math.random().toString(36).slice(2);
      const record = { key, trackId, id, definition, iframe, descriptor: { ...descriptor }, storage, active: true, loaded: false, soundEnabled: false, tempo: this.tempo, abortController: new AbortController(), operation: 0 };
      record.getContext = () => { if (!this._current(record)) throw cancelledError(); return this._context(); };
      record.getInput = () => { if (!this._current(record)) throw cancelledError(); return this.getTrackInput(trackId); };
      record.getTransport = () => { if (!this._current(record)) throw cancelledError(); return this.transport(); };
      record.notify = (type, value) => this._notify(record, type, value);
      this.records.set(trackId, record); global.__LoomHostRegistry[key] = record;
      const ready = this._load(record, descriptor || {}, state);
      record.ready = ready; ready.catch(() => {}); return ready;
    }
    async _load(record, descriptor, state) {
      const { id, iframe, definition } = record;
      this.onStatus(record.trackId, 'Opening ' + (definition?.name || descriptor.name || 'instrument') + '…', 'loading');
      try {
        let html = descriptor.html || this.embedded[id];
        let baseURL = new URL(id + '/index.html', this.baseURL).href;
        if (!html) {
          const url = new URL(descriptor.url || definition?.url || '', descriptor.url ? document.baseURI : new URL('loom/', this.baseURL));
          if (!['http:', 'https:'].includes(url.protocol) || url.origin !== location.origin) throw new Error('Use a same-site instrument URL or upload a self-contained HTML file.');
          baseURL = url.href;
          const response = await fetch(url.href, { signal: record.abortController.signal });
          if (!response.ok) throw new Error('The instrument page could not be loaded (' + response.status + ').');
          html = await response.text();
        }
        if (typeof html !== 'string' || !html.trim() || html.length > 32 * 1024 * 1024) throw new Error('Choose an instrument HTML file smaller than 32 MB.');
        const expectsPattern = html.includes('MusicLabPatternInstrument');
        if (!this._current(record)) throw cancelledError();
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-downloads allow-modals');
        iframe.setAttribute('allow', 'autoplay; microphone');
        iframe.setAttribute('title', (definition?.name || descriptor.name || 'Custom instrument') + ' instrument editor');
        iframe.srcdoc = instrumentHTML(html, record.key, baseURL, id);
        const deadline = performance.now() + 15000;
        while (performance.now() < deadline) {
          if (!this._current(record)) throw cancelledError();
          const child = iframe.contentWindow;
          const appReady = child?.__LoomBridge && (child.__LoomBridge.adapter || (definition && child[definition.facade]) || (!definition && child.document.readyState === 'complete'));
          if (appReady && (!expectsPattern || child.MusicLabPatternInstrument)) break;
          await delay(35);
        }
        if (!this._current(record)) throw cancelledError();
        if (!iframe.contentWindow?.__LoomBridge || (definition && !iframe.contentWindow[definition.facade] && !iframe.contentWindow.__LoomBridge.adapter)) throw new Error('The instrument did not become ready.');
        if (expectsPattern && !iframe.contentWindow.MusicLabPatternInstrument) throw new Error('The instrument pattern adapter did not become ready.');
        record.loaded = true;
        if (state) await this._restore(record, state);
        await this._tempo(record, this.tempo);
        this.onStatus(record.trackId, (definition?.name || descriptor.name || 'Instrument') + ' ready', 'ready');
        return { id, name: definition?.name || descriptor.name || 'Custom instrument', ready: true, capabilities: this.capabilities(record.trackId) };
      } catch (error) {
        if (this._current(record)) { this.onStatus(record.trackId, error.message || 'Instrument could not open.', 'error'); this.unload(record.trackId); }
        throw error;
      }
    }
    _parts(record) { const child = record.iframe.contentWindow; return { child, bridge: child?.__LoomBridge, app: record.definition ? child?.[record.definition.facade] : null }; }
    getPatternAdapter(trackId) {
      const record = this.records.get(trackId); if (!record?.loaded || !this._current(record)) return null;
      const { child, bridge } = this._parts(record);
      return child?.MusicLabPatternInstrument || (bridge?.adapter?.scheduleNote || bridge?.adapter?.exportPattern || bridge?.adapter?.transport ? bridge.adapter : null);
    }
    capabilities(trackId) {
      const record = this.records.get(trackId); if (!record?.loaded) return { ready: false };
      const { bridge, app } = this._parts(record), adapter = bridge?.adapter, patterns = this.getPatternAdapter(trackId);
      const importer = adapter?.importAudio ? adapter : app?.importAudio ? app : null;
      return { ready: true, transport: !!(adapter?.start || app), state: !!(adapter?.getState || app?.getState || bridge), tempo: !!(adapter?.tempo || app), custom: !record.definition,
        importAudio: !!importer, audioImport: importer?.audioImport ? clone(importer.audioImport) : null, exportAudio: !!(adapter?.exportAudio || app?.exportAudio), audioExport: clone(adapter?.audioExport || app?.audioExport || null),
        notes: patterns?.scheduleNote && patterns?.notes ? clone(patterns.notes) : null, patternImport: patterns?.importPattern ? clone(patterns.patternImport || {}) : null, patternExport: patterns?.exportPattern ? clone(patterns.patternExport || {}) : null, renderPattern: typeof patterns?.renderPattern === 'function' };
    }
    async _patternReady(trackId, signal) {
      if (signal?.aborted) throw cancelledError();
      const record = this.records.get(trackId); if (!record) throw Error('Load an instrument on this track first.');
      await record.ready;
      if (!this._current(record) || signal?.aborted) throw cancelledError();
      const adapter = this.getPatternAdapter(trackId); if (!adapter) throw Error('This instrument does not support Kitchen patterns.');
      return { record, adapter };
    }
    async exportPattern(trackId, options = {}) {
      const { record, adapter } = await this._patternReady(trackId, options.signal);
      if (typeof adapter.exportPattern !== 'function') throw Error('This instrument cannot export patterns.');
      const value = await adapter.exportPattern(options);
      if (!this._current(record) || options.signal?.aborted) throw cancelledError();
      return global.MusicLabPatternSchema ? global.MusicLabPatternSchema.normalize(clone(value)) : clone(value);
    }
    async importPattern(trackId, pattern, options = {}) {
      const normalized = global.MusicLabPatternSchema ? global.MusicLabPatternSchema.normalize(clone(pattern)) : clone(pattern);
      const { record, adapter } = await this._patternReady(trackId, options.signal);
      if (typeof adapter.importPattern !== 'function') throw Error('This instrument cannot receive patterns.');
      if (record.patternImporting) throw Error('A pattern transfer is already in progress on this track.');
      record.patternImporting = true;
      try {
        const value = await adapter.importPattern({ pattern: normalized, options: { ...options }, signal: options.signal });
        if (!this._current(record) || options.signal?.aborted) throw cancelledError();
        if (value === false) throw Error('The receiving instrument declined this pattern.');
        this._notify(record, 'change', null); return value === undefined ? true : value;
      } finally { record.patternImporting = false; }
    }
    scheduleNote(trackId, event) {
      const record = this.records.get(trackId), adapter = this.getPatternAdapter(trackId);
      if (!record || !adapter?.scheduleNote || !this._current(record)) return false;
      for (const key of ['pitch', 'velocity', 'when', 'durationSeconds']) if (!Number.isFinite(event?.[key])) throw TypeError('A scheduled note contains invalid ' + key + '.');
      if (!Number.isInteger(event.pitch) || event.pitch < 0 || event.pitch > 127 || event.velocity < 0 || event.velocity > 1 || event.when < 0 || event.durationSeconds <= 0 || event.durationSeconds > 768) throw RangeError('A scheduled note is outside the supported range.');
      this._parts(record).bridge?.mute(false);
      return adapter.scheduleNote({ ...event });
    }
    cancelNotes(trackId, options = {}) {
      const adapter = this.getPatternAdapter(trackId); if (!adapter?.cancelNotes) return false;
      return adapter.cancelNotes(options);
    }
    async renderPattern(trackId, request = {}) {
      const { record, adapter } = await this._patternReady(trackId, request.signal);
      if (typeof adapter.renderPattern !== 'function') throw Error('This instrument cannot render note patterns.');
      if (record.patternRendering) throw Error('This instrument is already rendering a pattern.');
      const pattern = global.MusicLabPatternSchema ? global.MusicLabPatternSchema.normalize(clone(request.pattern)) : clone(request.pattern);
      record.patternRendering = true;
      try { const value = await withAbort(adapter.renderPattern({ ...request, pattern }), [request.signal, record.abortController.signal]); if (!this._current(record) || request.signal?.aborted) throw cancelledError(); return value; }
      finally { record.patternRendering = false; }
    }
    transportInstrument(trackId, clock) {
      const adapter = this.getPatternAdapter(trackId); if (!adapter?.transport) return false;
      return adapter.transport({ ...clock, when: clock.when ?? clock.contextTime ?? this._context()?.currentTime ?? 0 });
    }
    setClockDriven(trackId, value) { const record = this.records.get(trackId); if (record) record.externalClock = value === true; }
    async exportAudio(trackId, options = {}) {
      if(options.signal?.aborted)throw cancelledError();
      const record=this.records.get(trackId);if(!record)throw Error('Load an instrument on this track first.');await record.ready;if(!this._current(record))throw cancelledError();
      if(options.signal?.aborted)throw cancelledError();
      const {bridge,app}=this._parts(record),exporter=bridge.adapter?.exportAudio?bridge.adapter:app?.exportAudio?app:null;if(!exporter)throw Error('Record this instrument into GALLEY before sharing its sound.');
      if(record.exporting)throw Error('This instrument is already rendering audio.');record.exporting=true;
      try{const result=await exporter.exportAudio(options);if(!this._current(record)||options.signal?.aborted)throw cancelledError();return result;}finally{record.exporting=false;}
    }
    async importAudio(trackId, audio, options = {}) {
      if (options.signal?.aborted) throw cancelledError();
      const record = this.records.get(trackId);
      if (!record) throw new Error('Load an instrument on the destination track first.');
      await record.ready;
      if (!this._current(record) || options.signal?.aborted) throw cancelledError();
      if (record.importing) throw new Error('An audio transfer is already in progress on this track.');
      const { bridge, app } = this._parts(record);
      const importer = bridge.adapter?.importAudio ? bridge.adapter : app?.importAudio ? app : null;
      if (!importer) throw new Error('This instrument does not accept audio transfers.');
      const sampleRate = Number(audio?.sampleRate), pcm = audio?.pcm;
      if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || Object.prototype.toString.call(pcm) !== '[object Float32Array]' || pcm.length < 4 || pcm.length % 2) throw new TypeError('Provide interleaved stereo Float32 audio and a valid sample rate.');
      const maxSeconds = Math.min(120, Number(importer.audioImport?.maxSeconds) || 120);
      if (pcm.length / 2 / sampleRate > maxSeconds) throw new Error('This instrument accepts audio up to ' + maxSeconds + ' seconds. Shorten the clip before sending it.');
      for (let i = 0; i < pcm.length; i++) if (!Number.isFinite(pcm[i])) throw new TypeError('Audio transfers must contain finite samples.');
      const payload = { pcm: new Float32Array(pcm), sampleRate, tempo: audio.tempo, name: typeof audio.name === 'string' ? audio.name : 'GALLEY clip', signal:options.signal, options: {...(clone({...options,signal:undefined}) || {}),signal:options.signal} };
      record.importing = true;
      try {
        const result = bridge.adapter?.importAudio ? await bridge.command('importAudio', payload) : await app.importAudio(payload);
        if (!this._current(record) || options.signal?.aborted) throw cancelledError();
        if (result === false) throw new Error('The receiving instrument declined this audio.');
        this._notify(record, 'change', null);
        return result === undefined ? true : result;
      } finally { record.importing = false; }
    }
    async command(trackId, command, payload) {
      const record = this.records.get(trackId); if (!record) return false;
      const operation = ++record.operation;
      if (command !== 'stop' && command !== 'panic') await record.ready;
      if (!this._current(record) || !record.loaded || operation !== record.operation) return false;
      const { child, bridge, app } = this._parts(record);
      if (command === 'start' && record.externalClock) { bridge?.mute(false); return true; }
      if (command === 'tempo') return this._tempo(record, typeof payload === 'number' ? payload : payload?.tempo);
      if (command === 'prepare') {
        if (bridge.adapter?.prepare) await bridge.command('prepare', payload);
        else if (app?.prepare) await app.prepare();
        else await app?.engine?.init?.();
        await this.getPatternAdapter(trackId)?.prepare?.();
        return this._current(record) && operation === record.operation;
      }
      if (command === 'panic' || command === 'stop') { this.cancelNotes(trackId, { source: 'loom' }); this.cancelNotes(trackId, { source: 'loom-live' }); }
      if (command === 'panic') { bridge.mute(true); bridge.releaseMedia(); this.getPatternAdapter(trackId)?.panic?.(); }
      if (bridge.adapter?.[command] || (command === 'start' && bridge.adapter?.play)) {
        if (command === 'start') bridge.mute(false);
        return bridge.command(command === 'start' && !bridge.adapter.start ? 'play' : command, payload);
      }
      if (!app) {
        if (command === 'panic' || command === 'stop') { bridge.mute(true); return true; }
        this.onStatus(trackId, 'Use this instrument’s editor to play. Add MusicLabHost.registerInstrument for DAW transport control.', 'info'); return false;
      }
      const playing = () => { const current = record.definition ? child[record.definition.facade] : app; return typeof current?.isPlaying === 'function' ? current.isPlaying() : !!current?.engine?.isPlaying; };
      const playButton = child.document.getElementById(record.id === 'bower' || record.id === 'ravel' ? 'playButton' : 'play-button') || child.document.querySelector('.transport-play');
      if (command === 'start') {
        bridge.mute(false); if (playing()) return true;
        if (app.play) await app.play(); else if (playButton) playButton.click(); else await app.engine?.start?.();
        const deadline = performance.now() + 12000;
        while (!playing() && performance.now() < deadline && this._current(record) && operation === record.operation) await delay(20);
        return this._current(record) && operation === record.operation && playing();
      }
      if (command === 'stop' || command === 'panic') {
        if (app.stop) app.stop();
        else if (playing() && playButton) playButton.click();
        app.engine?.stop?.();
        if (command === 'panic') {
          if (app.panic) app.panic(); else app.engine?.panic?.();
          if (!app.engine?.panic && !app.panic) { bridge.mute(true); await app.engine?.dispose?.(); }
        }
        return true;
      }
      throw new Error('Unknown instrument command: ' + command);
    }
    async _tempo(record, value) {
      if (!Number.isFinite(Number(value))) return false;
      const tempo = Math.max(40, Math.min(240, Number(value))); record.tempo = tempo;
      const { child, bridge, app } = this._parts(record); bridge?.setTempo(tempo);
      if (bridge?.adapter?.tempo) { await bridge.command('tempo', tempo); return true; }
      if (app?.setTempo) { app.setTempo(tempo); await delay(0); return true; }
      const input = child?.document.getElementById('tempo') || child?.document.querySelector('input[aria-label="Tempo BPM"]');
      if (!input) return false;
      const actual = Math.max(Number(input.min) || 40, Math.min(Number(input.max) || 240, tempo));
      Object.getOwnPropertyDescriptor(child.HTMLInputElement.prototype, 'value').set.call(input, String(actual));
      input.dispatchEvent(new child.Event('input', { bubbles: true })); input.dispatchEvent(new child.Event('change', { bubbles: true }));
      return true;
    }
    setTempo(value) { this.tempo = Math.max(40, Math.min(240, Number(value) || 120)); return Promise.allSettled([...this.records.values()].filter(record => record.loaded).map(record => this._tempo(record, this.tempo))); }
    async snapshot(trackId) {
      const record = this.records.get(trackId); if (!record) return null; await record.ready;
      if (!this._current(record)) return null;
      const { bridge, app } = this._parts(record);
      const state = bridge.adapter?.getState ? await bridge.command('getState') : app?.getProject ? app.getProject() : app?.getState ? app.getState() : null;
      return { format: 'loom-instrument-state', version: 1, app: record.id, state: clone(state), storage: clone(bridge.storage) };
    }
    async restore(trackId, value) {
      const record = this.records.get(trackId); if (!record) return false; await record.ready;
      if (!this._current(record)) return false;
      const envelope = value?.format === 'loom-instrument-state' ? value : null;
      if (envelope && envelope.app !== record.id) throw new Error('This instrument state belongs to another app.');
      return this._restore(record, envelope ? envelope.state : value);
    }
    async _restore(record, state) {
      if (state === undefined || state === null) return true;
      const { child, bridge, app } = this._parts(record);
      if (bridge.adapter?.setState) { await bridge.command('setState', clone(state)); return true; }
      if (app?.loadState) { app.loadState(clone(state)); await delay(0); return true; }
      if (record.id === 'grain' || record.id === 'tine') {
        const input = child.document.getElementById('project-file');
        if (!input) throw new Error('The instrument project loader is unavailable.');
        const transfer = new child.DataTransfer(); transfer.items.add(new child.File([JSON.stringify(state)], record.id + '-host-project.json', { type: 'application/json' }));
        input.files = transfer.files; input.dispatchEvent(new child.Event('change', { bubbles: true }));
        await delay(80); if (!this._current(record)) throw cancelledError(); return true;
      }
      return false;
    }
    unload(trackId) {
      const record = this.records.get(trackId); if (!record) return;
      const { bridge, app } = this._parts(record);
      try { this.cancelNotes(trackId, { source: 'loom' }); this.cancelNotes(trackId, { source: 'loom-live' }); this.getPatternAdapter(trackId)?.panic?.(); } catch (_) {}
      try { app?.stop?.(); app?.engine?.panic?.(); Promise.resolve(bridge?.adapter?.panic?.()).catch(() => {}); } catch (_) {}
      record.active = false; record.operation++; record.abortController.abort(); clearTimeout(record.changeTimer);
      // Closing a child facade only disconnects that child's nodes, never the DAW context.
      bridge?.dispose().catch(() => {});
      this.records.delete(trackId); delete global.__LoomHostRegistry[record.key];
      record.iframe.removeAttribute('src'); record.iframe.srcdoc = '';
    }
    dispose() { if (this.disposed) return; [...this.records.keys()].forEach(id => this.unload(id)); this.disposed = true; }
  }
  global.LoomInstrumentManifest = manifest;
  global.LoomInstrumentHost = LoomInstrumentHost;
})(window);
