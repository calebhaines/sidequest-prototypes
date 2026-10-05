/* GALLEY native note sources. Offline prints use private, muted instrument editors. */
(function (global) {
  'use strict';
  const MAX_SECONDS = 120, MAX_BYTES = 64 * 1024 * 1024;
  const abort = () => new DOMException('Note rendering was cancelled.', 'AbortError');
  const check = signal => { if (signal?.aborted) throw abort(); };
  const copy = value => global.LoomSchema?.copy ? global.LoomSchema.copy(value) : JSON.parse(JSON.stringify(value));
  const floatArray = value => Object.prototype.toString.call(value) === '[object Float32Array]';
  const clamp = (value, low, high, fallback) => Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));
  function pattern(value) {
    if (!global.MusicLabPatternSchema) throw Error('The portable note-pattern schema is unavailable.');
    return global.MusicLabPatternSchema.normalize(value);
  }
  function fingerprint(text) {
    // Two independent hashes plus length; keys contain no duplicate PCM strings.
    let a = 2166136261, b = 5381;
    for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b, 33) ^ c; }
    return (a >>> 0).toString(16) + '-' + (b >>> 0).toString(16) + '-' + text.length;
  }
  function captureInstrument(value) {
    if (!value || typeof value.id !== 'string') throw Error('Choose an instrument for this note clip before rendering it.');
    const descriptor = copy(value);
    if (!descriptor.snapshot || descriptor.snapshot.format !== 'loom-instrument-state' || descriptor.snapshot.version !== 1 || descriptor.snapshot.app !== descriptor.id) throw Error('Save the instrument’s current patch before rendering this note clip.');
    return descriptor;
  }
  function mapping(value, packet) {
    if (global.LoomSchema?.voiceMap) return global.LoomSchema.voiceMap(value || {}, packet);
    const result = {};
    if (value != null && (typeof value !== 'object' || Array.isArray(value))) throw Error('This note clip has an invalid voice mapping.');
    for (const voice of packet.voices) {
      const target = value?.[voice.id];
      if (target !== undefined) {
        if (typeof target !== 'string' || !target || target.length > 100 || ['__proto__', 'constructor', 'prototype'].includes(target)) throw Error('Choose a valid destination for every mapped voice.');
        result[voice.id] = target;
      }
    }
    return result;
  }
  function noteClip(raw) {
    if (!raw || raw.type !== 'notes') throw Error('Select a note clip to print.');
    const clip = copy(raw); delete clip.origin;
    for (const key of ['assetId', 'sourceStart', 'sourceEnd', 'reverse']) delete clip[key];
    clip.pattern = pattern(clip.pattern); clip.voiceMap = mapping(clip.voiceMap, clip.pattern);
    if (global.LoomSchema?.noteClip) return global.LoomSchema.noteClip(clip, 256, true);
    if (!Number.isFinite(clip.start) || !Number.isFinite(clip.length) || clip.length <= 0 || !Number.isFinite(clip.rate) || clip.rate < .125 || clip.rate > 8 || !Number.isFinite(clip.sourceOffset) || clip.sourceOffset < 0) throw Error('This note clip has invalid timing.');
    return clip;
  }
  function findClip(state, trackId, clipId) {
    const track = typeof trackId === 'number' ? state?.tracks?.[trackId] : state?.tracks?.find(track => track.id === trackId);
    const clip = track?.clips?.find(clip => clip.id === clipId);
    if (!track || !clip) throw Error('The selected clip is no longer in this session.');
    return { track, clip };
  }
  function preparedPacket(packet, voiceMap, transpose, adapter) {
    const voices = adapter?.notes?.voices || adapter?.patternImport?.voices || [];
    const destinations = new Map(voices.map(voice => [String(voice.id), voice]));
    const mapped = new Map();
    for (const voice of packet.voices) {
      const target = voiceMap[voice.id] || voice.id;
      if (destinations.size && !destinations.has(target)) throw Error('Map “' + voice.name + '” to a voice in this instrument before rendering.');
      if (!mapped.has(target)) mapped.set(target, { id: target, name: destinations.get(target)?.name || voice.name, ...(voice.pitch === undefined ? {} : { pitch: voice.pitch }) });
    }
    const result = copy(packet); result.voices = [...mapped.values()];
    result.notes = packet.notes.map(note => {
      const pitch = note.pitch + transpose;
      if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) throw Error('This transposition moves a note outside the MIDI pitch range.');
      return { ...note, pitch, voice: voiceMap[note.voice] || note.voice };
    });
    return pattern(result);
  }
  function decodedBytes(audio) { return audio.left.byteLength + (audio.right === audio.left ? 0 : audio.right.byteLength); }

  class LoomNoteRenderer {
    constructor({ host, context, baseURL, embedded, maxBytes = MAX_BYTES } = {}) {
      this.host = host || null; this.context = context; this.baseURL = baseURL || host?.baseURL; this.embedded = embedded || host?.embedded || global.LoomEmbeddedInstruments;
      this.maxBytes = clamp(maxBytes, 1024, MAX_BYTES, MAX_BYTES);
      this.cache = new Map(); this.cacheBytes = 0; this.operations = new Set(); this.disposed = false;
    }
    _active(signal) { check(signal); if (this.disposed) throw abort(); }
    _session(signal) {
      this._active(signal);
      if (!global.LoomInstrumentHost || !global.document) throw Error('The native instrument renderer is unavailable.');
      let context = null, input = null, ownContext = false, closed = false;
      const frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
      Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: '1200px', height: '900px', opacity: '0', pointerEvents: 'none' });
      (document.body || document.documentElement).append(frame);
      const getContext = () => {
        if (closed) throw abort();
        if (!context) {
          context = typeof this.context === 'function' ? this.context() : this.context;
          if (!context) context = this.host?._context?.();
          if (!context || context.state === 'closed') { const Context = global.AudioContext || global.webkitAudioContext; if (!Context) throw Error('Web Audio is unavailable.'); context = new Context(); ownContext = true; }
        }
        return context;
      };
      const getInput = () => {
        if (!input) { const raw = getContext(); input = raw.createGain(); input.gain.value = 0; input.connect(raw.destination); }
        return input;
      };
      const host = new global.LoomInstrumentHost({ context: getContext, getTrackInput: getInput, baseURL: this.baseURL, embedded: this.embedded });
      const operation = { host, frame, async close() {
        if (closed) return; closed = true; signal?.removeEventListener('abort', cancel);
        try { host.dispose(); } finally { frame.remove(); try { input?.disconnect(); } catch (_) {} if (ownContext) await context?.close().catch(() => {}); }
      } };
      const cancel = () => { this.operations.delete(operation); operation.close().catch(() => {}); };
      signal?.addEventListener('abort', cancel, { once: true });
      this.operations.add(operation);
      return operation;
    }
    async _close(session) { this.operations.delete(session); await session.close(); }
    _key(descriptor, packet, map, tempo, transpose, tailSeconds, loop) {
      return fingerprint(JSON.stringify({ descriptor, packet, map, tempo, transpose, tailSeconds, loop }));
    }
    _cached(key) {
      const value = this.cache.get(key); if (!value) return null;
      this.cache.delete(key); this.cache.set(key, value); return value;
    }
    _remember(key, audio) {
      const bytes = decodedBytes(audio), cap = Math.min(this.maxBytes, 32 * 1024 * 1024);
      if (bytes > cap) return;
      if (this.cache.has(key)) { this.cacheBytes -= decodedBytes(this.cache.get(key)); this.cache.delete(key); }
      while (this.cacheBytes + bytes > cap && this.cache.size) { const first = this.cache.keys().next().value; this.cacheBytes -= decodedBytes(this.cache.get(first)); this.cache.delete(first); }
      this.cache.set(key, audio); this.cacheBytes += bytes;
    }
    async _audio(result, session, signal) {
      this._active(signal);
      let left, right, sampleRate;
      if (floatArray(result?.pcm)) {
        sampleRate = result.sampleRate;
        if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || !result.pcm.length || result.pcm.length % 2) throw Error('The instrument returned invalid stereo audio.');
        const frames = result.pcm.length / 2;
        if (frames > MAX_SECONDS * sampleRate || frames * 8 > this.maxBytes) throw Error('The rendered note source exceeds the 120-second or 64 MiB limit. Split the pattern into smaller parts.');
        left = new Float32Array(frames); right = new Float32Array(frames);
        for (let at = 0; at < frames; at += 32768) {
          this._active(signal); const end = Math.min(frames, at + 32768);
          for (let i = at; i < end; i++) { const l = result.pcm[i * 2], r = result.pcm[i * 2 + 1]; if (!Number.isFinite(l) || !Number.isFinite(r)) throw Error('The instrument returned non-finite audio.'); left[i] = l; right[i] = r; }
          if (end < frames) await pause();
        }
      } else if (result?.blob && typeof result.blob.arrayBuffer === 'function') {
        if (result.blob.size > this.maxBytes) throw Error('The rendered source exceeds the audio budget. Split the pattern into smaller parts.');
        const bytes = await result.blob.arrayBuffer(); this._active(signal);
        // Decoding uses the private facade's raw shared context, never its destination.
        let context = session.host._context?.();
        if (!context?.decodeAudioData) throw Error('This browser cannot decode the instrument’s rendered WAV.');
        const buffer = await context.decodeAudioData(bytes); this._active(signal);
        sampleRate = buffer.sampleRate;
        if (buffer.length > MAX_SECONDS * sampleRate || buffer.length * 8 > this.maxBytes) throw Error('The rendered note source exceeds the 120-second or 64 MiB limit. Split the pattern into smaller parts.');
        left = new Float32Array(buffer.getChannelData(0)); right = new Float32Array(buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1)));
        for (let at = 0; at < left.length; at += 32768) { this._active(signal); for (let i = at; i < Math.min(left.length, at + 32768); i++) if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) throw Error('The instrument returned non-finite audio.'); if (at + 32768 < left.length) await pause(); }
      } else throw Error('This instrument did not return a WAV or stereo PCM note render.');
      this._active(signal); return { left, right, sampleRate };
    }
    async _render(session, captured, options) {
      const { signal } = options; this._active(signal);
      const { instrument, packet, voiceMap, renderTempo: tempo, transpose, tailSeconds, loop } = captured;
      const seconds = packet.lengthBeats * 60 / tempo;
      if (seconds + tailSeconds > MAX_SECONDS + 1e-8) throw Error('This pattern lasts more than 120 seconds at the session tempo. Split it into smaller patterns before rendering. Long note clips can loop a shorter pattern.');
      const key = this._key(instrument, packet, voiceMap, tempo, transpose, tailSeconds, loop), cached = this._cached(key);
      if (cached) return { audio: cached, key };
      await session.host.load('render-source', instrument, session.frame); this._active(signal);
      const adapter = session.host.getPatternAdapter?.('render-source');
      if (!adapter?.renderPattern && !session.host.capabilities('render-source')?.notes) throw Error('This instrument needs a native note-rendering adapter before it can print note clips.');
      const mapped = preparedPacket(packet, voiceMap, transpose, adapter);
      const result = await session.host.renderPattern('render-source', { pattern: mapped, state: copy(instrument.snapshot.state), tempo, tailSeconds, signal });
      this._active(signal); let audio = await this._audio(result, session, signal);
      const cycleFrames = Math.max(1, Math.round(seconds * audio.sampleRate));
      if (audio.left.length < cycleFrames) throw Error('The instrument returned a source shorter than the requested pattern.');
      if (loop) {
        const left = new Float32Array(cycleFrames), right = new Float32Array(cycleFrames);
        for (let at = 0; at < audio.left.length; at += 32768) {
          this._active(signal);
          for (let i = at; i < Math.min(audio.left.length, at + 32768); i++) { const target = i % cycleFrames; left[target] += audio.left[i]; right[target] += audio.right[i]; if (!Number.isFinite(left[target]) || !Number.isFinite(right[target])) throw Error('The instrument returned an overflowing loop tail. Reduce its output level.'); }
          if (at + 32768 < audio.left.length) await pause();
        }
        audio = { left, right, sampleRate: audio.sampleRate };
      }
      this._active(signal); this._remember(key, audio); return { audio, key };
    }
    _capture(state, track, clip, options = {}) {
      const sourceClip = noteClip(options.clip || clip);
      const packet = pattern(options.pattern || sourceClip.pattern), voiceMap = mapping(options.voiceMap || sourceClip.voiceMap, packet);
      const instrument = captureInstrument(options.instrument || track.instrument);
      const tempo = options.tempo ?? state.tempo;
      if (!Number.isFinite(tempo) || tempo < 40 || tempo > 240) throw Error('Choose a GALLEY tempo between 40 and 240 BPM.');
      const tailSeconds = options.tailSeconds ?? 0;
      if (!Number.isFinite(tailSeconds) || tailSeconds < 0 || tailSeconds > 20) throw Error('Choose a source tail between 0 and 20 seconds.');
      const transpose = sourceClip.transpose || 0;
      if (!Number.isInteger(transpose) || transpose < -127 || transpose > 127) throw Error('This note clip has an invalid transposition.');
      sourceClip.pattern = packet; sourceClip.voiceMap = voiceMap;
      return { instrument, packet, voiceMap, tempo, renderTempo: tempo * sourceClip.rate, transpose, tailSeconds, sourceClip, loop: sourceClip.loop === true };
    }
    async prepareNotes(state, assets = {}, options = {}) {
      this._active(options.signal);
      // Freeze all source descriptors, notes and arrangement geometry before awaiting any frame.
      const renderState = copy(state), renderAssets = Object.assign(Object.create(null), assets instanceof Map ? Object.fromEntries(assets) : assets);
      const captures = [];
      for (const track of renderState.tracks || []) {
        if (options.trackId != null && (typeof options.trackId === 'number' ? renderState.tracks[options.trackId]?.id : options.trackId) !== track.id) continue;
        for (const clip of track.clips || []) if (clip.type === 'notes') {
          if (options.startBeat != null && clip.start + clip.length <= options.startBeat || options.endBeat != null && clip.start >= options.endBeat) continue;
          captures.push({ track, clip, captured: this._capture(renderState, track, clip, options) });
        }
      }
      // Unselected sources are removed only from this export snapshot so the DSP cannot
      // mistake beat-based note geometry for an audio source.
      for (const track of renderState.tracks || []) track.clips = (track.clips || []).filter(clip => clip.type !== 'notes' || captures.some(item => item.clip === clip));
      if (!captures.length) { options.onProgress?.(1); return { state: renderState, assets: renderAssets, generatedIds: [] }; }
      const session = this._session(options.signal), rendered = new Map(), generatedIds = []; let used = 0;
      try {
        options.onProgress?.(0);
        for (let i = 0; i < captures.length; i++) {
          this._active(options.signal); const { clip, captured } = captures[i];
          const key = this._key(captured.instrument, captured.packet, captured.voiceMap, captured.renderTempo, captured.transpose, captured.tailSeconds, captured.loop);
          let prepared = rendered.get(key);
          if (!prepared) {
            const { audio } = await this._render(session, captured, options); this._active(options.signal);
            const bytes = decodedBytes(audio); if (used + bytes > this.maxBytes) throw Error('These unique note sources exceed GALLEY’s 64 MiB render budget. Print shorter patterns, reuse a loop, or export one track at a time.');
            used += bytes; const id = 'notes-render-' + key; prepared = { id, audio }; rendered.set(key, prepared); renderAssets[id] = audio; generatedIds.push(id);
          }
          const secondsPerBeat = 60 / captured.renderTempo;
          Object.assign(clip, { type: 'audio', assetId: prepared.id, sourceStart: 0, sourceEnd: prepared.audio.left.length / prepared.audio.sampleRate, sourceOffset: clip.sourceOffset * secondsPerBeat, rate: 1, reverse: false });
          delete clip.pattern; delete clip.voiceMap; delete clip.transpose;
          options.onProgress?.((i + 1) / captures.length);
        }
        this._active(options.signal); return { state: renderState, assets: renderAssets, generatedIds };
      } finally { await this._close(session); }
    }
    async print(state, trackId, clipId, options = {}) {
      this._active(options.signal); const { track, clip } = findClip(state, trackId, clipId), captured = this._capture(state, track, clip, options);
      const used = (state.assets || []).reduce((sum, value) => sum + value.frames * value.channels * 2, 0);
      const session = this._session(options.signal);
      try {
        options.onProgress?.(0); const { audio } = await this._render(session, captured, options); this._active(options.signal);
        const encodedBytes = Math.floor(audio.left.length * Math.min(48000, audio.sampleRate) / audio.sampleRate) * 4;
        if (used + encodedBytes > global.LoomSchema.LIMITS.pcmBytes) throw Error('This print would exceed GALLEY’s 64 MiB audio budget. Remove unused audio or shorten the pattern.');
        const asset = global.LoomSchema.encodeAsset({ ...audio, name: options.name || captured.sourceClip.name || captured.packet.name });
        if (used + asset.frames * asset.channels * 2 > global.LoomSchema.LIMITS.pcmBytes) throw Error('This print would exceed GALLEY’s 64 MiB audio budget. Remove unused audio or shorten the pattern.');
        let origin = { format: 'loom-render-source', version: 1, instrument: captured.instrument, pattern: captured.packet, voiceMap: captured.voiceMap, tempo: captured.tempo, tailSeconds: captured.tailSeconds, sourceClip: captured.sourceClip, renderedAt: Date.now() };
        if (global.LoomSchema.renderSource) origin = global.LoomSchema.renderSource(origin);
        const audioClip = { id: captured.sourceClip.id, name: captured.sourceClip.name, type: 'audio', assetId: asset.id, start: captured.sourceClip.start, length: captured.sourceClip.length, sourceStart: 0, sourceEnd: asset.duration, sourceOffset: captured.sourceClip.sourceOffset * 60 / captured.renderTempo, rate: 1, reverse: false, loop: captured.sourceClip.loop === true, gain: captured.sourceClip.gain, fadeIn: captured.sourceClip.fadeIn, fadeOut: captured.sourceClip.fadeOut, origin };
        this._active(options.signal); options.onProgress?.(1); return { asset, audio, origin, clip: audioClip };
      } finally { await this._close(session); }
    }
    async update(state, trackId, clipId, options = {}) {
      this._active(options.signal); const { track, clip } = findClip(state, trackId, clipId), source = clip.origin;
      if (source?.format !== 'loom-render-source' || source.version !== 1 || !source.sourceClip || !source.instrument) throw Error('This audio clip has no editable instrument source.');
      const snapshot = copy(state), target = findClip(snapshot, trackId, clipId);
      target.clip.type = 'notes'; target.clip.pattern = copy(source.pattern); target.clip.voiceMap = copy(source.voiceMap);
      const fake = { ...target.clip, ...copy(source.sourceClip), id: clipId, type: 'notes' }; delete fake.origin;
      target.track.clips[target.track.clips.indexOf(target.clip)] = fake;
      // Budget excludes the replaced asset only when no other arrangement clip uses it.
      if (!(snapshot.tracks || []).some(t => (t.clips || []).some(c => c !== fake && c.assetId === clip.assetId))) snapshot.assets = snapshot.assets.filter(asset => asset.id !== clip.assetId);
      const geometry = copy(clip);
      const result = await this.print(snapshot, trackId, clipId, { ...options, instrument: options.instrument || source.instrument, pattern: options.pattern || source.pattern, voiceMap: options.voiceMap || source.voiceMap, tempo: options.tempo ?? state.tempo, tailSeconds: options.tailSeconds ?? source.tailSeconds });
      this._active(options.signal);
      if (result.asset.duration + 1 / result.asset.sampleRate < geometry.sourceEnd) {
        if (geometry.sourceEnd > MAX_SECONDS) throw Error('The edited audio source exceeds the 120-second asset limit.');
        const frames = Math.ceil(geometry.sourceEnd * result.audio.sampleRate), left = new Float32Array(frames), right = new Float32Array(frames);
        left.set(result.audio.left); right.set(result.audio.right); result.audio = { left, right, sampleRate: result.audio.sampleRate };
        result.asset = global.LoomSchema.encodeAsset({ ...result.audio, id: result.asset.id, name: result.asset.name });
        const used = snapshot.assets.reduce((sum, value) => sum + value.frames * value.channels * 2, 0);
        if (used + result.asset.frames * result.asset.channels * 2 > global.LoomSchema.LIMITS.pcmBytes) throw Error('This update would exceed GALLEY’s 64 MiB audio budget.');
      }
      result.clip = { ...geometry, assetId: result.asset.id, origin: result.origin };
      this._active(options.signal); return result;
    }
    async dispose() {
      if (this.disposed) return; this.disposed = true;
      await Promise.allSettled([...this.operations].map(session => this._close(session)));
      this.cache.clear(); this.cacheBytes = 0;
    }
  }
  global.LoomNoteRenderer = LoomNoteRenderer;
})(window);
