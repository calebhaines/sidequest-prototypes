/* GALLEY · reversible, prepared master speed and pitch. Neutral stays on the live engine. */
(function (scope) {
  'use strict';
  const T = () => scope.LoomMasterTransform;
  const copy = value => scope.LoomSchema.copy(value);
  const aborted = () => new DOMException('Master preparation canceled.', 'AbortError');
  const empty = () => ({ peak: 0, rms: 0, rmsLeft: 0, rmsRight: 0 });
  const conflict = 'Reset master Speed & Pitch before recording, live monitoring, instrument audition or SERVICE.';
  function closeLoop(audio) {
    // Correct an edit-sized jump at the circular seam without overlapping beats.
    for (const data of [audio.left, audio.right]) {
      const n = data.length; if (n < 8) continue;
      let step = 0;
      for (let i = 1; i <= 3; i++) step = Math.max(step, Math.abs(data[i] - data[i - 1]), Math.abs(data[n - i] - data[n - i - 1]));
      if (Math.abs(data[0] - data[n - 1]) <= step * 1.25 + 1e-5) continue;
      const delta = 2 * data[n - 1] - data[n - 2] - data[0], fade = Math.min(Math.floor(n / 2), Math.max(2, Math.round(audio.sampleRate * .003)));
      for (let i = 0; i < fade; i++) { const x = i / (fade - 1); data[i] += delta * (1 - x * x * (3 - 2 * x)); }
    }
  }
  function soundKey(state) {
    const owner = value => ({ level: value.level, pan: value.pan, mute: value.mute, solo: value.solo, eq: value.eq, sends: value.sends, sendPre: value.sendPre, effects: value.effects, automation: value.automation, output: value.output });
    const instrument = value => value && ({ id: value.id, url: value.url, html: value.html, snapshot: value.snapshot?.state != null ? { app: value.snapshot.app, state: value.snapshot.state } : value.snapshot });
    return JSON.stringify({ tempo: state.tempo, lengthBars: state.lengthBars, loopEnabled: state.loopEnabled, loopStart: state.loopStart, loopEnd: state.loopEnd,
      master: { ...owner(state.master), metronome: state.master.metronome, mastering: state.master.mastering }, returns: state.returns?.map(owner), buses: state.buses?.map(owner), lfos: state.lfos,
      // Parked channels cannot contribute audio. Keep their large editable
      // recipes out of cache comparisons until the channel is enabled again.
      tracks: state.tracks.map(track => track.disabled === true ? { disabled: true } : ({ ...owner(track), clips: track.clips.map(({ origin, ...clip }) => clip), freeze: track.freeze, instrumentLive: track.instrumentLive, instrument: track.instrument && (track.instrumentLive || track.clips.some(clip => clip.type === 'notes')) ? instrument(track.instrument) : null })) });
  }
  function encodeWav(audio, signal) {
    const buffer = new ArrayBuffer(44 + audio.left.length * 4), view = new DataView(buffer);
    const text = (at, value) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
    text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true); view.setUint32(24, audio.sampleRate, true); view.setUint32(28, audio.sampleRate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, audio.left.length * 4, true);
    return (async () => {
      for (let at = 0; at < audio.left.length; at += 65536) {
        if (signal?.aborted) throw aborted();
        for (let i = at; i < Math.min(at + 65536, audio.left.length); i++) for (let channel = 0; channel < 2; channel++) {
          const value = Math.max(-1, Math.min(1, (channel ? audio.right : audio.left)[i]));
          view.setInt16(44 + i * 4 + channel * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
        }
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      return new Blob([buffer], { type: 'audio/wav' });
    })();
  }
  class MasterPlayback {
    constructor(options) {
      Object.assign(this, options); this.getGeneration ||= (() => 0); this.onPause ||= (() => {}); this.onStatus ||= (() => {}); this.onChange ||= (() => {});
      this.position = 0; this.revision = 0; this.playing = false; this.ended = false; this.source = null; this.cache = null; this.sourceCache = null; this.controller = null; this.processor = null; this.disposed = false; this.retiring = new Set();
      this.status = { phase: this.altered() ? 'stale' : 'idle', progress: 0, message: this.altered() ? 'Press Play to prepare master Speed & Pitch.' : 'Original speed and pitch. Playback uses the live mix.' };
      this.sourceKey = this.altered() ? soundKey(this.getState()) : null; this.settingsKey = JSON.stringify(this.settings());
    }
    settings(state = this.getState()) { return T().normalize(state.master?.playback); }
    altered(state = this.getState()) { return !T().isNeutral(this.settings(state)); }
    getStatus() { return { ...this.status, cached: !!this.cache, sourceCached: !!this.sourceCache, playing: this.playing }; }
    _status(phase, progress, message) { this.status = { phase, progress, message }; this.onChange(this.getStatus()); }
    attach() {
      if (this.original) return this;
      const engine = this.engine, names = ['play', 'stop', 'seek', 'panic', 'getMeters', 'getTransport', 'setState', 'setAssets', 'dispose', 'renderWav', 'startRecording', 'startMicrophoneRecording', 'setMicrophoneMonitoring', 'startService', 'resumeAudition', 'applyAudioSettings'];
      this.original = Object.fromEntries(names.filter(key => typeof engine[key] === 'function').map(key => [key, engine[key].bind(engine)]));
      engine.play = beat => this.altered() ? this.play(beat) : this.original.play(beat);
      engine.stop = options => { if (this.altered() || this.playing || this.controller) this.stop(); return this.original.stop(options); };
      engine.seek = beat => this.altered() ? this.seek(beat) : this.original.seek(beat);
      engine.getTransport = time => this.altered() ? this.getTransport(time) : this.original.getTransport(time);
      engine.getMeters = () => this.altered() ? this.getMeters() : this.original.getMeters();
      engine.panic = () => { if (this.playing) this.position = this.getTransport().beat; this.cancel(); this._stopSource(true); this.revision++; this.cache = this.sourceCache = this.assetRefs = null; this.ended = false; return this.original.panic(); };
      engine.setState = state => {
        const settings = JSON.stringify(this.settings(state)), oldAltered = !T().isNeutral(JSON.parse(this.settingsKey));
        const key = oldAltered || !T().isNeutral(this.settings(state)) || this.sourceCache ? soundKey(state) : null;
        if (settings !== this.settingsKey && engine.recordingBusy) throw Error('Finish the current take before changing master Speed & Pitch.');
        if (key !== this.sourceKey || settings !== this.settingsKey) {
          if (oldAltered || !T().isNeutral(this.settings(state))) { this.position = (oldAltered ? this.getTransport() : this.original.getTransport()).beat; this.invalidate(key !== this.sourceKey); }
          else { this.cache = this.sourceCache = null; }
          this.sourceKey = key; this.settingsKey = settings;
        }
        const result = this.original.setState(state);
        if (oldAltered && T().isNeutral(this.settings(state))) { this.sourceCache = this.assetRefs = null; this.original.seek(this.position); this._status('idle', 0, 'Original speed and pitch. Playback uses the live mix.'); }
        return result;
      };
      engine.setAssets = assets => {
        const next = assets instanceof Map ? assets : new Map(Object.entries(assets || {}));
        if ((this.sourceCache || this.controller) && (next.size !== this.assetRefs?.size || [...next].some(([id, audio]) => this.assetRefs.get(id) !== audio))) this.invalidate(true);
        return this.original.setAssets(assets);
      };
      for (const key of ['startRecording', 'startMicrophoneRecording', 'startService', 'resumeAudition']) if (this.original[key]) engine[key] = (...args) => { if (this.altered()) throw Error(conflict); return this.original[key](...args); };
      if (this.original.setMicrophoneMonitoring) engine.setMicrophoneMonitoring = (id, options = {}) => { if (options.enabled === true && this.altered()) throw Error(conflict); return this.original.setMicrophoneMonitoring(id, options); };
      if (this.original.applyAudioSettings) engine.applyAudioSettings = async (...args) => { if (!this.altered()) return this.original.applyAudioSettings(...args); if (this.playing || this.controller) throw Error('Pause master playback before changing the audio interface.'); const result = await this.original.applyAudioSettings(...args); this.invalidate(true); return result; };
      engine.renderWav = (state = this.getState(), assets = this.getAssets(), options = {}) => this.altered(state) && options.trackId == null && options.returnId == null && options.busId == null ? this.renderWav(state, assets, options) : this.original.renderWav(state, assets, options);
      engine.dispose = async () => { this.dispose(); return this.original.dispose(); };
      return this;
    }
    _stopSource(immediate = false) {
      if (this.source) {
        const source = this.source, gain = this.gain, context = this.engine.context;
        const cleanup = () => { try { source.disconnect(); gain?.disconnect(); } catch {} this.retiring.delete(cleanup); };
        cleanup.stop = () => { source.onended = null; try { source.stop(); } catch {} cleanup(); };
        source.onended = cleanup; this.retiring.add(cleanup);
        try {
          if (!immediate && context?.state === 'running' && gain) {
            const now = context.currentTime; gain.gain.cancelAndHoldAtTime?.(now); gain.gain.linearRampToValueAtTime(0, now + .006); source.stop(now + .006);
          } else cleanup.stop();
        } catch { cleanup.stop(); }
        this.source = null; this.gain = null;
      }
      if (immediate) for (const cleanup of [...this.retiring]) cleanup.stop();
      this.playing = false;
    }
    cancel() { this.controller?.abort(); this.controller = null; this.processor?.dispose(); this.processor = null; if (!this.disposed) this._status(this.cache ? 'ready' : 'stale', 0, 'Preparation canceled. Press Play to prepare the current mix.'); }
    invalidate(clearSource = true) {
      if (this.playing) this.position = this.getTransport().beat;
      this.cancel(); this._stopSource(); this.cache = null; if (clearSource) this.sourceCache = this.assetRefs = null;
      this.original?.stop(); this.onPause(); this.revision++;
      this._status('stale', 0, 'Mix changed. Press Play to prepare Speed & Pitch.');
    }
    stop() {
      this.position = this.getTransport().beat; this.cancel(); this._stopSource(); this.ended = false; this.revision++;
      this._status(this.cache ? 'ready' : 'stale', 1, this.cache ? 'Paused. The prepared mix is ready to resume.' : 'Press Play to prepare the current mix.');
      this.engine._notifyTransport?.('stop');
    }
    seek(beat) {
      if (this.controller) this.cancel();
      const wasPlaying = this.playing, range = this._range(this.getState());
      this._stopSource(); this.position = Math.max(0, Math.min(this.getState().lengthBars * 4, Number(beat) || 0)); this.ended = false; this.revision++;
      if (wasPlaying && this.cache) this._start(this.position < range.start || this.position >= range.end ? range.start : this.position);
      this.engine._notifyTransport?.('seek'); return this.position;
    }
    _range(state) { return state.loopEnabled ? { start: state.loopStart, end: state.loopEnd, loop: true } : { start: 0, end: state.lengthBars * 4, loop: false }; }
    async play(beat = this.position) {
      if (this.disposed) throw Error('Master playback is closed.');
      if (this.engine.recordingBusy || this.engine.getServiceState?.().active || this.engine.getMicrophoneStatus?.().enabled) throw Error('Stop recording, live monitoring and SERVICE before using master Speed & Pitch.');
      this.cancel(); this._stopSource(); this.original.stop();
      const controller = new AbortController(), signal = controller.signal, generation = this.getGeneration(), settingsKey = this.settingsKey;
      let sourceKey = this.sourceKey;
      this.controller = controller; this.assetRefs = new Map(this.getAssets() instanceof Map ? this.getAssets() : Object.entries(this.getAssets()));
      const active = () => { if (signal.aborted || this.disposed || generation !== this.getGeneration() || sourceKey !== this.sourceKey || settingsKey !== this.settingsKey) throw aborted(); };
      try {
        await this.onPause(); active(); this.original.panic();
        await this.engine.init(); active(); await this.engine.context.resume(); active();
        const state = copy(this.getState()), settings = this.settings(state), range = this._range(state);
        if (!this.cache) {
          if (!this.sourceCache) {
            this._status('rendering', 0, 'Preparing the original stereo master and its automation…');
            const prepared = await this.prepareSources(state, this.getAssets(), { signal, startBeat: range.start, endBeat: range.end,
              onSnapshot: (id, snapshot) => { active(); const track = this.getState().tracks.find(item => item.id === id); if (track?.instrument && track.instrument.id === snapshot.app) { track.instrument.snapshot = copy(snapshot); this.sourceKey = sourceKey = soundKey(this.getState()); } },
              onProgress: p => this._status('rendering', p * .3, 'Preparing instruments…') }); active();
            const audio = await this.engine.renderMasterPCM(prepared.state, prepared.assets, { signal, startBeat: range.start, endBeat: range.end, previewLoop: range.loop, tailSeconds: range.loop ? 0 : 8, includeMetronome: true, onProgress: p => this._status('rendering', .3 + p * .7, 'Rendering effects and automation…') }); active();
            this.sourceCache = { audio, range }; this.assetRefs = new Map(this.getAssets() instanceof Map ? this.getAssets() : Object.entries(this.getAssets()));
          }
          const { audio } = this.sourceCache, outputFrames = T().durationFrames(audio.frames, settings);
          if (audio.frames * 16 + outputFrames * 16 > 512 * 1024 * 1024) throw Error('This speed needs too much preview memory. Choose a shorter loop or increase Speed.');
          this.processor ||= new (T().Processor)();
          this._status('stretching', 0, 'Preparing pitch and speed…');
          const transformed = await this.processor.process(audio, settings, { signal, onProgress: p => this._status('stretching', p, 'Preparing pitch and speed…') }); active();
          if (range.loop) closeLoop(transformed);
          const buffer = this.engine.context.createBuffer(2, transformed.left.length, transformed.sampleRate);
          buffer.copyToChannel(transformed.left, 0); buffer.copyToChannel(transformed.right, 1);
          this.cache = { buffer, range, speed: settings.speed, tempo: state.tempo, bodyFrames: T().durationFrames(audio.bodyFrames, settings), frames: transformed.left.length, sampleRate: transformed.sampleRate };
          this.processor.dispose(); this.processor = null;
        }
        active(); this.controller = null;
        this._start(beat < range.start || beat >= range.end ? range.start : beat); return true;
      } catch (error) {
        if (this.controller === controller) { this.controller = null; this.processor?.dispose(); this.processor = null; this._status(error.name === 'AbortError' ? 'stale' : 'error', 0, error.message); }
        if (error.name === 'AbortError') return false; throw error;
      }
    }
    _start(beat) {
      const cache = this.cache, context = this.engine.context;
      this._stopSource(); this.position = beat; this.offset = cache.range.loop ? (beat - cache.range.start) / (cache.range.end - cache.range.start) * cache.bodyFrames / cache.sampleRate : (beat - cache.range.start) * 60 / cache.tempo / cache.speed; this.started = context.currentTime; this.playing = true; this.ended = false; this.revision++;
      const source = context.createBufferSource(), gain = context.createGain(); source.buffer = cache.buffer; source.loop = cache.range.loop;
      if (source.loop) { source.loopStart = 0; source.loopEnd = cache.bodyFrames / cache.sampleRate; }
      gain.gain.setValueAtTime(0, this.started); gain.gain.linearRampToValueAtTime(1, this.started + .006);
      source.connect(gain); gain.connect(context.destination); this.source = source; this.gain = gain;
      source.onended = () => {
        if (this.source !== source || source.loop) return;
        this.position = cache.range.end; this._stopSource(); this.ended = true; this.revision++;
        this._status('ready', 1, 'Arrangement complete. The prepared mix is ready.'); this.engine._notifyTransport?.('end');
        this.engine.onTransportEnd?.({ beat: this.position });
      };
      source.start(this.started, this.offset); this._status('playing', 1, 'Playing the prepared stereo master. Edits pause playback.'); this.engine._notifyTransport?.('play');
    }
    getTransport(time = this.engine.context?.currentTime || 0) {
      const state = this.getState(), settings = this.settings(state), range = this.cache?.range || this._range(state), speed = this.playing && this.cache ? this.cache.speed : settings.speed, sourceTempo = this.playing && this.cache ? this.cache.tempo : state.tempo, tempo = sourceTempo * speed;
      let beat = this.position, cycle = 0, outputSeconds = this.offset || 0;
      if (this.playing) {
        outputSeconds += Math.max(0, time - this.started); beat = range.start + outputSeconds * speed * sourceTempo / 60;
        if (range.loop && this.cache) {
          const period = this.cache.bodyFrames / this.cache.sampleRate;
          cycle = Math.floor(outputSeconds / period); beat = range.start + (outputSeconds / period - cycle) * (range.end - range.start);
        } else beat = Math.min(range.end, beat);
      }
      return { beat, absoluteBeat: beat + cycle * (range.end - range.start), cycle, contextTime: time, anchorTime: time, anchorBeat: beat, tempo, playing: this.playing, revision: this.revision, loopEnabled: range.loop, loopStart: range.start, loopEnd: range.end, endBeat: range.end, countInBeatsRemaining: 0, mode: 'master-preview', outputSeconds };
    }
    getMeters() {
      const clock = this.getTransport(), master = empty(), cache = this.cache;
      if (clock.playing && cache) {
        const left = cache.buffer.getChannelData(0), right = cache.buffer.getChannelData(1), end = Math.floor(clock.outputSeconds * cache.sampleRate); let l = 0, r = 0, count = 0;
        for (let frame = Math.max(0, end - 256); frame < end; frame++) {
          const at = cache.range.loop ? frame % cache.bodyFrames : frame; if (at >= left.length) break;
          const a = left[at], b = right[at]; master.peak = Math.max(master.peak, Math.abs(a), Math.abs(b)); l += a * a; r += b * b; count++;
        }
        if (count) { master.rmsLeft = Math.sqrt(l / count); master.rmsRight = Math.sqrt(r / count); master.rms = Math.sqrt((l + r) / (2 * count)); }
      }
      return { beat: clock.beat, cycle: clock.cycle, playing: clock.playing, ended: this.ended, recording: false, recordingPending: false, mode: clock.mode, countInBeatsRemaining: 0, tracks: Array.from({ length: 10 }, empty), returns: [empty(), empty()], buses: (this.getState().buses || []).map(empty), master, effects: Array.from({ length: 10 }, () => []), returnEffects: [[], []], busEffects: (this.getState().buses || []).map(() => []), masterEffects: [], microphone: this.engine.getMicrophoneStatus?.(), masterPlayback: this.getStatus() };
    }
    async renderWav(state, assets, options) {
      const signal = options.signal, processor = new (T().Processor)(); this.engine._exportCount++;
      try {
        if (this.controller) throw Error('Finish or cancel master preparation before exporting.');
        const prepared = await this.prepareSources(copy(state), assets, { ...options, onProgress: p => options.onProgress?.(p * .2) });
        const audio = await this.engine.renderMasterPCM(prepared.state, prepared.assets, { ...options, tailSeconds: options.tailSeconds ?? 0, onProgress: p => options.onProgress?.(.2 + p * .4) });
        const result = await processor.process(audio, this.settings(state), { signal, onProgress: p => options.onProgress?.(.6 + p * .35) });
        const blob = await encodeWav(result, signal); options.onProgress?.(1); return blob;
      } finally { processor.dispose(); this.engine._exportCount--; }
    }
    dispose() { if (this.disposed) return; this.cancel(); this._stopSource(true); this.cache = this.sourceCache = this.assetRefs = null; this.disposed = true; }
  }
  scope.LoomMasterPlayback = Object.freeze({ create: options => new MasterPlayback(options), soundKey, encodeWav });
})(typeof window !== 'undefined' ? window : globalThis);
