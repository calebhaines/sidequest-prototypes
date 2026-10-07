/* SERVICE: an opt-in performance desk. Saved arrangement geometry remains private
   to GALLEY until the player explicitly creates an arrangement from a take. */
(function (global) {
  'use strict';
  const copy = value => global.LoomSchema.copy(value);
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));
  const QUANTIZE = { 0: 'immediate', 1: 'beat', 2: 'halfbar', 4: 'bar', 8: '2bar', 16: '4bar' };
  // Some browser resamplers decode an exact-duration WAV one frame short.
  // Keep this accommodation private to SERVICE: the arrangement renderer and
  // every already decoded sample remain unchanged.
  if (global.LoomNoteRenderer) global.LoomServiceNoteRenderer = class extends global.LoomNoteRenderer {
    _render(session, captured, options) {
      session.serviceSourceSeconds = captured.packet.lengthBeats * 60 / captured.renderTempo;
      return super._render(session, captured, options);
    }
    async _audio(result, session, signal) {
      const audio = await super._audio(result, session, signal);
      const expected = Math.round(session.serviceSourceSeconds * audio.sampleRate);
      if (!result?.blob?.slice || result.sampleRate === audio.sampleRate || audio.left.length !== expected - 1) return audio;
      const bytes = await result.blob.slice(0, 44).arrayBuffer(); this._active(signal);
      if (bytes.byteLength !== 44) return audio;
      const view = new DataView(bytes), word = at => String.fromCharCode(...new Uint8Array(bytes, at, 4));
      if (word(0) !== 'RIFF' || view.getUint32(4, true) !== result.blob.size - 8 || word(8) !== 'WAVE' || word(12) !== 'fmt ' || view.getUint32(16, true) !== 16 || word(36) !== 'data' || view.getUint16(20, true) !== 1) return audio;
      const channels = view.getUint16(22, true), rate = view.getUint32(24, true), bits = view.getUint16(34, true), size = view.getUint32(40, true);
      if (channels < 1 || channels > 2 || ![16, 24, 32].includes(bits) || rate < 8000 || rate > 192000 || rate !== result.sampleRate || size > result.blob.size - 44 || size % (channels * bits / 8) || size / (channels * bits / 8 * rate) + 1e-12 < session.serviceSourceSeconds) return audio;
      if (view.getUint16(32, true) !== channels * bits / 8 || view.getUint32(28, true) !== rate * channels * bits / 8) return audio;
      const left = new Float32Array(expected), right = new Float32Array(expected);
      left.set(audio.left); right.set(audio.right);
      return { ...audio, left, right };
    }
  };
  class LoomServiceController {
    constructor(options) {
      this.options = options; this.engine = options.engine; this.isOpen = false;
      this.listeners = new Set(); this.prepared = null; this.busy = false; this.running = false;
      this.activeSceneId = null; this.queuedSceneId = null; this.selectedSceneId = null;
      this.activeClips = Array(8).fill(null); this.padHolds = new Map(); this.holdOrder = 0;
      this.padTargets=[options.getState().tracks[options.getState().selectedTrack].id];
      this.captureEnabled = false; this.captureRecording = false; this.message = 'Prepare a scene, then press Play. Nothing is written to the arrangement until you create one.';
      this.operation = 0; this.abort = null; this.timer = null; this.beat = 0;
      this.config = null; this.take = null; this.runtime = null; this.requestedScenes = new Map();
      this.unsubscribeEngine = this.engine.subscribeService(event => this._onEngine(event));
      this.midi = new global.LoomServiceMidi({
        getBindings: () => this._config().midiBindings,
        setBindings: bindings => { this._config().midiBindings = bindings; this._save(); },
        onAction: (target, value, meta) => this._midiAction(target, value, meta),
        onStatus: message => this._message(message)
      });
      this.unsubscribeMidi = this.midi.subscribe(() => this._notify());
      this.ui = new global.LoomServiceUI({ controller: this });
    }
    _project() { return this.options.getState(); }
    _config() { if (!this.config) this._loadConfig(); return this.config; }
    _loadConfig() {
      const state = this._project(), schema = global.LoomServiceSchema;
      this.config = state.service ? schema.normalize(state.service, state) : schema.defaults();
      this.take = this.config.take ? copy(this.config.take) : null;
      if (!state.service) {
        this.config.scenes = this._scenesFor('markers');
        if (!this.config.scenes.length) this.config.scenes = this._scenesFor('loop');
        this._suggestMacros();
      }
      this.selectedSceneId = this.config.selectedSceneId || this.config.scenes[0]?.id || null;
    }
    _suggestMacros() {
      const state = this._project(), schema = global.LoomServiceSchema;
      const names = ['Pressure', 'Heat', 'Space', 'Spread'];
      this.config.macros.forEach((macro, i) => { macro.name = names[i]; macro.value = .5; });
      state.tracks.forEach((track, index) => {
        const targets = schema.targets(track);
        const add = (macro, descriptor, min, max, polarity = 'normal') => {
          if (!descriptor || this.config.macros[macro].mappings.length >= 32) return;
          this.config.macros[macro].mappings.push({ trackId: track.id, target: descriptor.target,
            min: clamp(min, descriptor.min, descriptor.max), max: clamp(max, descriptor.min, descriptor.max),
            baseline: descriptor.value, polarity, ...(descriptor.effectType ? { effectType: descriptor.effectType } : {}) });
        };
        add(0, targets.find(t => t.target === 'level'), 0, Math.min(1.5, Math.max(track.level, track.level * 1.5)));
        add(3, targets.find(t => t.target === 'pan'), -1, 1, index % 2 ? 'normal' : 'inverse');
        for (const target of targets) {
          if (/^fx:[0-3]:(drive|grit|fold|saturation)$/.test(target.target)) add(1, target, target.min, target.max);
          if (/^fx:[0-3]:mix$/.test(target.target) && ['vestige', 'parallax', 'undertow', 'halo'].includes(target.effectType)) add(2, target, 0, Math.max(target.value, .65));
        }
      });
    }
    _slotsAt(start, end) {
      return this._project().tracks.map(track => {
        const clips = track.clips;
        const clip = clips.find(c => c.start <= start + 1e-8 && c.start + c.length > start + 1e-8)
          || clips.find(c => c.start < end && c.start + c.length > start);
        return clip ? { mode: 'clip', clipId: clip.id } : { mode: 'silence' };
      });
    }
    _scenesFor(source) {
      const state = this._project(), uid = global.LoomSchema.uid;
      if (source === 'empty') return [{ id: uid('scene'), name: 'New order', lengthBeats: 16, slots: Array.from({ length: 8 }, () => ({ mode: 'silence' })) }];
      if (source === 'markers') return state.markers.slice(0, 16).map((marker, index, markers) => {
        const end = markers[index + 1]?.beat || state.lengthBars * 4;
        return { id: uid('scene'), name: marker.name, lengthBeats: clamp(end - marker.beat, 4, 256), slots: this._slotsAt(marker.beat, end) };
      });
      return [{ id: uid('scene'), name: 'First service', lengthBeats: clamp(state.loopEnd - state.loopStart, 4, 256), slots: this._slotsAt(state.loopStart, state.loopEnd) }];
    }
    _save({ remember = true } = {}) {
      if (this.take) { this.config.take = copy(this.take); if(this.captureRecording)this.config.take.lengthBeats=Math.min(256,Math.ceil(Math.max(this.beat,this.take.lengthBeats)*64)/64); } else delete this.config.take;
      this.config.selectedSceneId = this.selectedSceneId;
      this.config = global.LoomServiceSchema.normalize(this.config, this._project());
      this.options.persist(copy(this.config), { remember });
      this._notify();
    }
    subscribe(listener) { this.listeners.add(listener); listener(this.getSnapshot()); return () => this.listeners.delete(listener); }
    _notify() { if (!this.listeners.size) return; const snapshot = this.getSnapshot(); for (const listener of this.listeners) listener(snapshot); }
    _message(message) { this.message = String(message || ''); this._notify(); }
    getSnapshot() {
      const state = this._project(), config = this._config(), meters = this.engine.getMeters();
      const durationBeats = this.captureRecording ? Math.min(256, this.beat) : this.take?.lengthBeats || 0;
      const pads = this._performance();
      return { open: this.isOpen, running: this.running, busy: this.busy, beat: this.beat, tempo: state.tempo,
        activeSceneId: this.activeSceneId, queuedSceneId: this.queuedSceneId, selectedSceneId: this.selectedSceneId,
        service: copy({ ...config, take: undefined }),
        tracks: state.tracks.map(track => ({ id: track.id, name: track.name, color: track.color,
          clips: track.clips.map(c => ({ id: c.id, name: c.name, type: c.type, length: c.length })),
          targets: global.LoomServiceSchema.targets(track) })),
        meters: meters.tracks?.map(track => track.peak || 0) || Array(8).fill(0),
        capture: { enabled: this.captureEnabled, recording: this.captureRecording, events: this.take?.events.length || 0,
          durationBeats, canApply: !this.running && !this.busy && !!this.take?.events.length && durationBeats > 0 },
        padState: { stutter: pads.stutterBeats, stutterBeats: pads.stutterBeats, fill: pads.fill, drops: pads.drops, trackIds: state.tracks.filter((_, i) => pads.drops[i]).map(t => t.id),targetIds:this.padTargets.slice() },
        midi: this.midi?.getSnapshot() || { supported: !!global.navigator?.requestMIDIAccess, inputs: [], bindings: [] },
        message: this.message };
    }
    async open() {
      if (this.isOpen) return true;
      if (this.opening) return false;
      if (this.options.canOpen && !this.options.canOpen()) { this.options.status?.('Finish the current recording or operation before opening SERVICE.'); return false; }
      const operation=++this.operation;this.opening=true;
      this._loadConfig(); this.originalBeat = this.engine.getMeters().beat || 0;
      this.padTargets=[this._project().tracks[this._project().selectedTrack].id];
      try{await this.options.suspendArrangement();}catch(error){if(operation===this.operation)this.opening=false;this.options.status?.(error.message);return false;}
      if(operation!==this.operation||!this.opening)return false;
      this.opening=false;
      this.isOpen = true; this.beat = 0; this.prepared = null; this.activeSceneId = null; this.queuedSceneId = null;
      this.activeClips.fill(null); this.midi.setActive(true); this.ui.open();
      this.timer = setInterval(() => this._tick(), 60); this._notify(); return true;
    }
    async close() {
      if (!this.isOpen) { if(this.opening){++this.operation;this.opening=false;} return; }
      await this._stop(); this.midi.setActive(false); this.midi.cancelLearn();
      clearInterval(this.timer); this.timer = null; this.isOpen = false; this.ui.close();
      this.options.restoreArrangement(this.originalBeat);
      if(global.location?.hash==='#service'){try{global.history.replaceState(null,'',global.location.href.replace(/#service$/,''));}catch{}}
      this._notify();
    }
    reset() {
      ++this.operation;this.opening=false; this.abort?.abort(); this.abort = null; this.prepared = null; this.config = null; this.take = null;
      this.captureRecording = false; this.captureEnabled = false; this.padHolds.clear(); this.running = false;this.busy=false;this.applyingOperation=null;
      this.activeSceneId = null; this.queuedSceneId = null; this.requestedScenes.clear();
      if (this.isOpen) { this.engine.stopService().catch(()=>{}); this.midi.setActive(false); clearInterval(this.timer); this.isOpen = false; this.ui.close(); }
      this._notify();
    }
    _tick() {
      if (!this.isOpen) return;
      if (this.running) this.beat = this.engine.getServiceState().beat ?? this.engine.getMeters().beat ?? this.beat;
      if (this.captureRecording && this.beat >= 256) {
        this._finishCapture(256); this._message('The 64-bar capture is complete. You can keep playing or stop and create its arrangement.');
      }
      this._notify();
    }
    async _prepare() {
      if (this.prepared) return this.prepared;
      const operation = ++this.operation; this.abort = new AbortController(); this.busy = true;
      this._message('Preparing saved note patches privately. Your original clips stay untouched.');
      try {
        const result = await this.options.prepareSources({ signal: this.abort.signal });
        if (operation !== this.operation) throw new DOMException('Preparation cancelled.', 'AbortError');
        this.prepared = result; return result;
      } finally { if (operation === this.operation) { this.busy = false; this.abort = null; this._notify(); } }
    }
    _scenePacket(scene) {
      const prepared = this.prepared?.state || this._project(), holds = [];
      const clips = scene.slots.map((slot, index) => {
        holds[index] = slot.mode === 'hold';
        const id = slot.mode === 'hold' ? this.activeClips[index] : slot.mode === 'clip' ? slot.clipId : null;
        const clip = prepared.tracks[index].clips.find(c => c.id === id);
        return clip && clip.type !== 'notes' ? { ...copy(clip), start: 0 } : null;
      });
      return { id: scene.id, clips, holds, lengthBeats: scene.lengthBeats, loop: true };
    }
    async _play() {
      if (!this.isOpen || this.running || this.busy) return;
      const scene = this._config().scenes.find(s => s.id === (this.selectedSceneId || this.activeSceneId)) || this.config.scenes[0];
      if (!scene) throw Error('Create a scene and choose clips for its tracks first.');
      const initializeOperation=++this.operation;this.busy=true;this._message('Starting the audio device…');
      try{
        const initialization=this.engine.init(),unlock=this.engine.context?.resume?.();
        await Promise.all([initialization,unlock]);
        if(initializeOperation!==this.operation||!this.isOpen)return;
      }finally{if(initializeOperation===this.operation)this.busy=false;}
      const prepared = await this._prepare(); if (!this.isOpen) return;
      this.engine.setAssets(prepared.assets); this.padHolds.clear(); this.beat = 0;
      if (this.captureEnabled) { this.take = { lengthBeats: 0, events: [] }; this.captureRecording = true; }
      this.activeClips.fill(null);this.queuedSeq=null;
      this.running = true; this.queuedSceneId = scene.id;
      const operation=this.operation;
      try {
        await this.engine.startService({ fromBeat: 0, scene: this._scenePacket(scene), performance: this._performance() });
        if(operation!==this.operation||!this.isOpen){await this.engine.stopService();this.running=false;this.engine.setAssets(this.options.getAssets());return;}
        this._message(this.captureRecording ? 'Capturing the service. Scene launches and controls use the audio clock.' : 'In service. Queue a scene or play the finishing controls.');
      } catch (error) { this.running = false; this.captureRecording = false; this.engine.setAssets(this.options.getAssets()); throw error; }
      this._notify();
    }
    _finishCapture(length = this.beat) {
      if (!this.captureRecording) return;
      this.captureRecording = false;
      this.take.lengthBeats = Math.min(256, Math.ceil(Math.max(0, length) * 64) / 64);
      this.take.events = this.take.events.filter(event => event.beat <= this.take.lengthBeats);
      this._save({ remember: false });
    }
    async _stop() {
      if(this.stopPending)return this.stopPending;
      this.stopPending=(async()=>{
        ++this.operation; this.abort?.abort(); this.abort = null; this.busy = false;
        if (this.running) this.beat = this.engine.getServiceState().beat ?? this.engine.getMeters().beat ?? this.beat;
        const stopped=await this.engine.stopService();
        if(Number.isFinite(stopped?.beat))this.beat=stopped.beat;
        this._finishCapture(); this.running = false; this.padHolds.clear(); this.queuedSceneId = null;
        this.engine.setAssets(this.options.getAssets()); this._notify();
      })();
      try{return await this.stopPending;}finally{this.stopPending=null;}
    }
    _performance() {
      const state = this._project(), overrides = new Map(), schema = global.LoomServiceSchema;
      for (const macro of this._config().macros) for (const mapping of macro.mappings) {
        const track = state.tracks.find(t => t.id === mapping.trackId), descriptor = track && schema.targets(track).find(t => t.target === mapping.target);
        if (!descriptor || (mapping.effectType && mapping.effectType !== descriptor.effectType)) continue;
        const key = mapping.trackId + '/' + mapping.target, previous = overrides.get(key);
        const delta = schema.mappingValue(mapping, macro.value) - mapping.baseline;
        const value = (previous?.value ?? descriptor.value) + delta;
        overrides.set(key, { trackId: mapping.trackId, target: mapping.target, value: clamp(value, descriptor.min, descriptor.max), ...(descriptor.effectType ? { effectType: descriptor.effectType } : {}) });
      }
      const held = [...this.padHolds.values()], stutter = held.filter(pad => pad.kind === 'stutter').sort((a, b) => b.order - a.order)[0];
      return { drops: state.tracks.map(track => held.some(pad => pad.kind === 'drop' && pad.trackIds.includes(track.id))),
        stutterBeats: stutter?.rate || 0, fill: held.some(pad => pad.kind === 'fill'), overrides: [...overrides.values()] };
    }
    _sendPerformance() { if (this.running) this.engine.setServicePerformance(this._performance()); this._notify(); }
    _onEngine(event) {
      if (!this.isOpen) return;
      if (Number.isFinite(event.beat)) this.beat = event.beat;
      if (event.type === 'scene' || event.kind === 'scene') {
        const scene = event.scene; this.activeSceneId = scene?.id || event.id;
        if(this.queuedSeq==null||event.seq===this.queuedSeq){this.queuedSceneId=null;this.queuedSeq=null;}
        this.requestedScenes.delete(event.seq);
        if (scene?.clips) this.activeClips = scene.clips.map(clip => clip?.id || null);
      }
      if (!this.captureRecording || !this.take || event.beat > 256) { this._notify(); return; }
      let captured;
      if (event.type === 'scene' || event.kind === 'scene') {
        const scene = event.scene;
        captured = { kind: 'scene', beat: event.beat, sceneId: scene?.id || event.id, clips: (scene?.clips || []).map(clip => clip?.id || null) };
        if (captured.clips.length !== 8) return;
      } else if (event.type === 'performance' || event.kind === 'performance') {
        const performance = event.performance;
        if (!performance) return;
        captured = { kind: 'performance', beat: event.beat, drops: performance.drops, stutterBeats: performance.stutterBeats || 0,
          fill: performance.fill ? 1 : 0, overrides: performance.overrides || [] };
      } else return;
      for (const key of ['sceneStarts', 'padBeats', 'phaseOrigins', 'sceneBeat', 'padBeat', 'tempo']) if (event[key] !== undefined) captured[key] = copy(event[key]);
      this.take.events.push(captured);
      if (this.take.events.length >= 8192) { this._finishCapture(event.beat); this._message('The capture event limit is reached. Stop to create this take’s arrangement.'); }
      this._notify();
    }
    _pad(payload) {
      const kind = payload.kind, rate = [.125, .25, .5].includes(payload.rate) ? payload.rate : .25;
      if (!['stutter', 'fill', 'drop'].includes(kind)) return;
      const key = (payload.source || 'ui') + ':' + kind + (kind === 'stutter' ? ':' + rate : '');
      if (payload.active) this.padHolds.set(key, { kind, rate, trackIds: (payload.trackIds || this.padTargets).filter(id => this._project().tracks.some(t => t.id === id)), order: ++this.holdOrder });
      else this.padHolds.delete(key);
      this._sendPerformance();
    }
    _midiAction(target, value, meta) {
      if (!this.isOpen) return;
      const [kind, id] = target.split(':');
      if (kind === 'macro') this.perform('macro-value', { macroId: id, value });
      else if (kind === 'scene' && value > .5) this.perform('scene-launch', { sceneId: id });
      else if (kind === 'control' && value > .5) this.perform(id);
      else if (kind === 'pad') this.perform('pad', { kind: id, active: value > .5, source: 'midi-' + (meta.bindingId || target) });
    }
    async _apply() {
      if(this.applyingOperation!=null)return false;
      if (this.running || this.busy || !this.take?.events.length || !this.take.lengthBeats) throw Error('Stop a captured performance before creating its arrangement.');
      const operation=++this.operation,sourceIdentity=this._project(),take=copy(this.take);this.abort=new AbortController();this.applyingOperation=operation;
      this.busy = true; this._message('Preparing an editable arrangement. The current session can be restored with one Undo.');
      try {
        const prepared = this.prepared || await this.options.prepareSources({ signal: this.abort.signal });
        if(operation!==this.operation||!this.isOpen||sourceIdentity!==this._project())throw new DOMException('Capture creation cancelled.','AbortError');
        const state = copy(prepared.state), sourceState = this._project(), needed = new Set(take.events.flatMap(event => event.kind === 'scene' ? event.clips.filter(Boolean) : []));
        const original = new Map(sourceState.tracks.flatMap(track => track.clips.map(clip => [clip.id, { track, clip }])));
        const assetIds = new Set(state.assets.map(asset => asset.id));
        for (const track of state.tracks) for (const clip of track.clips) if (needed.has(clip.id) && !assetIds.has(clip.assetId)) {
          const audio = prepared.assets[clip.assetId]; if (!audio) throw Error('A prepared note source is no longer available. Press Play to prepare the service again.');
          const encoded = global.LoomSchema.encodeAsset({ ...audio, id: clip.assetId, name: clip.name });
          state.assets.push(encoded); assetIds.add(encoded.id);
          const source = original.get(clip.id);
          if (source?.clip.type === 'notes' && source.track.instrument?.snapshot) clip.origin = global.LoomSchema.renderSource({
            format: 'loom-render-source', version: 1, instrument: copy(track.instrument || source.track.instrument), pattern: copy(source.clip.pattern),
            voiceMap: copy(source.clip.voiceMap || {}), tempo: sourceState.tempo, tailSeconds: 0, sourceClip: copy(source.clip), renderedAt: Date.now() });
        }
        const next = global.LoomServiceCapture.compile({ state, take });
        await this.close();
        if(this.applyingOperation!==operation||sourceIdentity!==this._project())throw new DOMException('Capture creation cancelled.','AbortError');
        delete next.service;
        await this.options.applyArrangement(next);
        this.config = null; this.take = null; this.prepared = null;
      } finally { if(this.applyingOperation===operation){this.busy=false;this.abort=null;this.applyingOperation=null;this._notify();} }
    }
    async perform(action, payload = {}) {
      try {
        if (action === 'close') return await this.close();
        if (!this.isOpen) return;
        if((this.busy||this.applyingOperation!=null)&&!['stop','panic'].includes(action))return false;
        const config = this._config();
        if (action === 'play') return await this._play();
        if (action === 'stop' || action === 'panic') { await this._stop(); if (action === 'panic') this.engine.panic(); this._message(action === 'panic' ? 'SERVICE is silent. Your captured take is retained.' : 'Service stopped. Choose a scene, or create an arrangement from the take.'); return; }
        if (action === 'scene-launch') {
          const scene = config.scenes.find(s => s.id === payload.sceneId); if (!scene) return;
          this.selectedSceneId = scene.id;
          this._save({remember:false});
          if (!this.running) { this._message(scene.name + ' is ready. Press Play to start.'); return; }
          const seq = this.engine.queueServiceScene(this._scenePacket(scene), { quantize: QUANTIZE[config.quantize] || 'bar' });
          this.requestedScenes.clear();this.requestedScenes.set(seq, scene.id);this.queuedSeq=seq; this.queuedSceneId = scene.id; this._message(scene.name + ' queued.'); return;
        }
        if (action === 'scene-create') {
          const scenes = this._scenesFor(payload.source || 'empty');
          if (config.scenes.length >= 16) throw Error('The scene bank has sixteen orders. Remove one before adding another.');
          const added = scenes.slice(0, 16 - config.scenes.length); config.scenes.push(...added); this.selectedSceneId = added[0]?.id || this.selectedSceneId;
          this._save(); return;
        }
        if (action === 'scene-update') { const scene = config.scenes.find(s => s.id === payload.sceneId); if (!scene) return; Object.assign(scene, copy(payload.patch)); this._save(); return; }
        if (action === 'scene-duplicate') {
          const scene = config.scenes.find(s => s.id === payload.sceneId); if (!scene) return;
          if (config.scenes.length >= 16) throw Error('The bank is full. Remove a scene before duplicating another.');
          const duplicate = { ...copy(scene), id: global.LoomSchema.uid('scene'), name: scene.name + ' / again' }; config.scenes.push(duplicate); this.selectedSceneId = duplicate.id; this._save(); return;
        }
        if (action === 'scene-remove') { config.scenes = config.scenes.filter(scene => scene.id !== payload.sceneId); if (this.selectedSceneId === payload.sceneId) this.selectedSceneId = config.scenes[0]?.id || null; this._save(); return; }
        if (action === 'quantize') { config.quantize = Number(payload.value); this._save(); return; }
        if (action === 'macro-value') { const macro = config.macros.find(m => m.id === payload.macroId); if (!macro) return; macro.value = clamp(payload.value, 0, 1); this._save({ remember: false }); this._sendPerformance(); return; }
        if (action === 'macro-update') { const macro = config.macros.find(m => m.id === payload.macroId); if (!macro) return; Object.assign(macro, copy(payload.patch)); this._save(); this._sendPerformance(); return; }
        if (action === 'pad') { this._pad(payload); return; }
        if(action==='pad-targets'){this.padTargets=(payload.trackIds||[]).filter(id=>this._project().tracks.some(t=>t.id===id));for(const pad of this.padHolds.values())if(pad.kind==='drop')pad.trackIds=this.padTargets.slice();this._sendPerformance();return;}
        if(action==='release-pads'){this.padHolds.clear();this.midi.releaseAll();this._sendPerformance();return;}
        if (action === 'capture-toggle') {
          if (this.running && payload.enabled) throw Error('Stop first, then arm capture so the next performance starts at bar one.');
          if (this.running && !payload.enabled) this._finishCapture();
          this.captureEnabled = !!payload.enabled; this._notify(); return;
        }
        if (action === 'capture-clear') { if (this.running) throw Error('Stop before clearing a take.'); this.take = null; this._save(); return; }
        if (action === 'capture-apply') return await this._apply();
        if (action === 'midi-enable') { await this.midi.enable(); this._notify(); return; }
        if (action === 'midi-learn') { this.midi.learn(payload.target); this._notify(); return; }
        if (action === 'midi-clear') { this.midi.clear(payload.id || payload.target); this._notify(); return; }
        if (action === 'midi-cancel') { this.midi.cancelLearn(); this._notify(); return; }
      } catch (error) { if (error.name !== 'AbortError') this._message(error.message); return false; }
    }
    destroy() { this.reset(); this.unsubscribeEngine?.(); this.unsubscribeMidi?.(); this.midi.destroy(); this.ui.destroy(); this.listeners.clear(); }
  }
  global.LoomServiceController = LoomServiceController;
})(window);
