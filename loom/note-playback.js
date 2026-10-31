/* GALLEY note clips and instrument patterns share the DAW's Web Audio clock. */
(function (global) {
  'use strict';
  const EPSILON = 1e-7, LOOKAHEAD = .12, INTERVAL = 25;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const abortError = () => new DOMException('Note playback was canceled.', 'AbortError');
  function randomFor(seed, text) {
    let hash = (seed >>> 0) || 2166136261;
    for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    hash ^= hash >>> 16; hash = Math.imul(hash, 0x7feb352d); hash ^= hash >>> 15;
    return (hash >>> 0) / 4294967296;
  }
  function mapVoice(adapter, pattern, voiceMap, voice) {
    const targets = adapter?.notes?.voices || [], target = voiceMap?.[voice] || voice;
    if (targets.some(item => item.id === target)) return target;
    if (adapter?.notes?.pitched && targets.length === 1 && !voiceMap?.[voice]) return targets[0].id;
    const name = pattern.voices?.find(item => item.id === voice)?.name || voice;
    throw Error('Map “' + name + '” to a voice in this instrument before playing the pattern.');
  }
  class LoomNotePlayback {
    constructor({ audio, host, getState, ensureInstrument, onStatus } = {}) {
      if (!audio?.getTransport || !host || typeof getState !== 'function') throw TypeError('Provide GALLEY audio, instrument host, and getState.');
      this.audio = audio; this.host = host; this.getState = getState; this.ensureInstrument = ensureInstrument;
      this.onStatus = onStatus || (() => {}); this.active = false; this.disposed = false; this.generation = 0;
      this.tracks = new Map(); this.scheduled = new Map(); this.revision = -1; this.timer = null; this.refreshing = false; this.lastRefresh = 0;
      this.recordingTracks = new Set(); this.stateSignature = '';
      this.compiledPatterns = new WeakMap();
      this.addingTracks = new Map(); this.prepareAbort = null;
      this.unsubscribe = audio.subscribeTransport((clock, reason) => {
        if (!this.active) return;
        if (!clock.playing || ['stop', 'panic', 'end'].includes(reason)) { this.stop(); return; }
        if (clock.revision !== this.revision) this._reset(clock);
      });
    }
    _patternSignature(pattern, loop = true) {
      return (global.MusicLabPatternSchema?.fingerprint(pattern) || JSON.stringify(pattern)) + (loop === false ? ':once' : ':loop');
    }
    _preparationKey(adapter, tempo) { return adapter?.preparePattern ? JSON.stringify([tempo, adapter.preparationSignature ?? null]) : null; }
    async prepare() {
      if (this.disposed) throw Error('Note playback has been disposed.');
      this.prepareAbort?.abort(); this.prepareAbort = typeof AbortController === 'function' ? new AbortController() : null;
      const signal = this.prepareAbort?.signal;
      const generation = ++this.generation;
      // A Start request stays pending while the user edits words. Retry from
      // the latest arrangement rather than marking old prepared words current.
      for (;;) {
        const signature = this._signature(), state = this.getState(), tempo = state.tempo, relevant = state.tracks.filter(track => !track.freeze && track.instrument && (track.instrumentLive || this.recordingTracks.has(track.id) || track.clips.some(clip => clip.type === 'notes')));
        const entries = await Promise.all(relevant.map(async track => {
          if (this.ensureInstrument && !await this.ensureInstrument(track)) throw Error('The instrument on ' + track.name + ' could not open.');
          const record = this.host.records.get(track.id); if (record) await record.ready;
          if (generation !== this.generation || this.disposed) throw abortError();
          const adapter = this.host.getPatternAdapter(track.id), noteClips = track.clips.filter(clip => clip.type === 'notes');
          if (noteClips.length && !adapter?.scheduleNote) throw Error(track.name + ' needs a Kitchen note-compatible instrument.');
          await adapter?.prepare?.();
          if (generation !== this.generation || this.disposed) throw abortError();
          const preparationKey = this._preparationKey(adapter, tempo);
          for (const clip of noteClips) await this._prepareClip(adapter, clip, tempo, signal);
          const entry = { id: track.id, adapter, preparationKey, live: null, signature: '', phaseBeat: 0, liveGeneration: 0, sources: new Set(), pending: null, continuous: !!adapter?.transport && ['bands', 'decks'].includes(adapter?.patternImport?.mode) && !adapter?.importedPattern };
          if (this._nativeLive(track) && adapter?.exportPattern && adapter?.scheduleNote && !entry.continuous) {
            entry.live = await this.host.exportPattern(track.id);
            entry.liveLoop = adapter.nativeSequenceLoop !== false;
            entry.signature = this._patternSignature(entry.live, entry.liveLoop);
            await this._prepareClip(adapter, { pattern: entry.live, voiceMap: {} }, tempo, signal);
          }
          return [track.id, entry];
        }));
        if (generation !== this.generation || this.disposed) throw abortError();
        if (entries.some(([, entry]) => entry.adapter?.preparePattern)) {
          const stale = () => signature !== this._signature() || tempo !== this.getState().tempo || entries.some(([id, entry]) => this.host.getPatternAdapter(id) !== entry.adapter || entry.preparationKey !== this._preparationKey(entry.adapter, this.getState().tempo));
          if (stale()) continue;
          let changed = false;
          for (const [id, entry] of entries) if (entry.adapter?.preparePattern && entry.live) {
            const latest = await this.host.exportPattern(id);
            if (this._patternSignature(latest, entry.adapter.nativeSequenceLoop !== false) !== entry.signature) changed = true;
          }
          if (generation !== this.generation || this.disposed) throw abortError();
          if (changed || stale()) continue;
        }
        if (signature !== this._signature()) continue;
        this.tracks = new Map(entries); this.stateSignature = this._signature(); return true;
      }
    }
    _nativeLive(track) {
      // Arming a note arrangement captures that arrangement. An instrument's
      // own sequencer joins it only through the explicit Live switch. Empty
      // armed tracks still record the instrument's native performance.
      return !track?.freeze && (track?.instrumentLive === true || this.recordingTracks.has(track?.id) && !track?.clips.some(clip => clip.type === 'notes'));
    }
    _clockDriven(track, entry) {
      return !!entry.live || track?.clips.some(clip => clip.type === 'notes') && (!entry.continuous || !this._nativeLive(track));
    }
    _validateClip(adapter, clip) {
      const spec = adapter?.notes, mappingAdapter = { notes: spec };
      for (const voice of clip.pattern.voices) mapVoice(mappingAdapter, clip.pattern, clip.voiceMap, voice.id);
      for (const note of clip.pattern.notes) if (note.pitch + (clip.transpose || 0) < 0 || note.pitch + (clip.transpose || 0) > 127) throw Error('This note clip transposes a note outside MIDI’s 0–127 pitch range.');
      const range = spec?.pitchRange;
      if (Array.isArray(range) && range.length === 2) for (const note of clip.pattern.notes) if (note.pitch + (clip.transpose || 0) < range[0] || note.pitch + (clip.transpose || 0) > range[1]) throw Error('This instrument supports MIDI notes ' + range[0] + '–' + range[1] + '. Transpose the note clip into that range before playing.');
      for (const note of clip.pattern.notes) {
        const voice = spec?.voices?.find(item => item.id === mapVoice(mappingAdapter, clip.pattern, clip.voiceMap, note.voice)), limits = voice?.pitchRange, pitch = note.pitch + (clip.transpose || 0);
        if (Array.isArray(limits) && limits.length === 2 && (pitch < limits[0] || pitch > limits[1])) throw Error('“' + (voice.name || voice.id) + '” supports MIDI notes ' + limits[0] + '–' + limits[1] + '. Transpose the clip or map this part to another voice before playing.');
        adapter?.validateNote?.({ pitch, voice: voice?.id, ...(note.lyric === undefined ? {} : { lyric: note.lyric }) });
      }
      if (adapter?.validatePattern) {
        const pattern = clip.transpose ? { ...clip.pattern, notes: clip.pattern.notes.map(note => ({ ...note, pitch: note.pitch + clip.transpose })) } : clip.pattern;
        const voiceMap = Object.fromEntries(clip.pattern.voices.map(voice => [voice.id, mapVoice(mappingAdapter, clip.pattern, clip.voiceMap, voice.id)]));
        adapter.validatePattern({ pattern, voiceMap });
      }
    }
    async _prepareClip(adapter, clip, tempo, signal) {
      this._validateClip(adapter, clip);
      if (!adapter?.preparePattern) return;
      if (signal?.aborted) throw abortError();
      // Only opted-in engines do asynchronous word/sample preparation. The
      // request is detached so an async adapter cannot edit the arrangement.
      const pattern = JSON.parse(JSON.stringify(clip.pattern));
      for (const note of pattern.notes) note.pitch += clip.transpose || 0;
      const voiceMap = Object.fromEntries(pattern.voices.map(voice => [voice.id, mapVoice(adapter, pattern, clip.voiceMap, voice.id)]));
      await adapter.preparePattern({ pattern, voiceMap, tempo: tempo * (clip.rate || 1), signal });
      if (signal?.aborted) throw abortError();
    }
    _prepareChangedTrack(entry, track, tempo = this.getState().tempo) {
      if (!entry.adapter?.preparePattern) return;
      entry.prepareAbort?.abort(); entry.prepareAbort = typeof AbortController === 'function' ? new AbortController() : null;
      const signal = entry.prepareAbort?.signal, revision = entry.prepareRevision = (entry.prepareRevision || 0) + 1, generation = this.generation, preparationKey = this._preparationKey(entry.adapter, tempo);
      entry.preparing = true;
      (async () => {
        for (const clip of track.clips.filter(clip => clip.type === 'notes')) await this._prepareClip(entry.adapter, clip, tempo, signal);
        if (!this.active || generation !== this.generation || entry.prepareRevision !== revision || this.tracks.get(track.id) !== entry) return;
        const currentTempo = this.audio.getTransport().tempo ?? this.getState().tempo;
        if (preparationKey !== this._preparationKey(entry.adapter, currentTempo)) { this._prepareChangedTrack(entry, this.getState().tracks.find(item => item.id === track.id) || track, currentTempo); return; }
        entry.preparationKey = preparationKey; entry.preparing = false; entry.catchHeld = true; this._tick();
      })().catch(error => { if (this.active && generation === this.generation && entry.prepareRevision === revision && this.tracks.get(track.id) === entry && error.name !== 'AbortError') this.onStatus(error.message); });
    }
    start() {
      if (this.disposed || !this.audio.getTransport().playing) return false;
      this.active = true;
      for (const [id, entry] of this.tracks) {
        if (this._clockDriven(this.getState().tracks.find(track => track.id === id), entry)) {
          // Stop autonomous app clocks before handing the same native engine
          // timestamped notes. Subsequent host Start commands stay clock driven.
          this.host.command(id, 'stop').catch(error => this.onStatus(error.message));
          this.host.setClockDriven(id, true);
        }
      }
      this._reset(this.audio.getTransport());
      clearInterval(this.timer); this.timer = setInterval(() => this._tick(), INTERVAL); this._tick(); return true;
    }
    _cancel() {
      for (const [id, entry] of this.tracks) {
        try { this.host.cancelNotes(id, { source: 'loom' }); this.host.cancelNotes(id, { source: 'loom-live' }); for (const source of entry.sources || []) this.host.cancelNotes(id, { source }); } catch (error) { this.onStatus(error.message); }
      }
      this.scheduled.clear();
    }
    _newSource(entry) { const source = 'loom-live:' + entry.id + ':' + (++entry.liveGeneration); entry.sources.add(source); return source; }
    _nextBoundary(clock) {
      const nextBar = (Math.floor((clock.beat + EPSILON) / 4) + 1) * 4, boundary = clock.loopEnabled ? Math.min(nextBar, clock.loopEnd) : Math.min(nextBar, clock.endBeat);
      const distance = Math.max(0, boundary - clock.beat), wrapped = clock.loopEnabled && boundary >= clock.loopEnd - EPSILON;
      return { absoluteBeat: clock.absoluteBeat + distance, phaseBeat: wrapped ? clock.loopStart : boundary, phaseCycle: (clock.cycle || 0) + (wrapped ? 1 : 0), when: clock.contextTime + (distance + clock.countInBeatsRemaining) * 60 / clock.tempo };
    }
    _commit(entry) {
      const pending = entry.pending; if (!pending) return;
      if (!pending.precise) this.host.cancelNotes(entry.id, { source: entry.liveSource });
      if (entry.liveSource) { entry.retired ||= new Map(); entry.retired.set(entry.liveSource, pending.when); }
      entry.live = pending.pattern; entry.liveLoop = pending.loop !== false; entry.signature = pending.signature; entry.phaseBeat = pending.phaseBeat; entry.phaseCycle = pending.phaseCycle || 0; entry.liveSource = pending.source; entry.pending = null; this.catchHeld = true;
    }
    _queuePattern(entry, pattern, signature, clock, loop = true) {
      const previous = entry.pending;
      if (previous) { this.host.cancelNotes(entry.id, { source: previous.source }); for (const key of [...this.scheduled.keys()]) if (key.includes(':live-' + entry.id + ':' + previous.source + ':')) this.scheduled.delete(key); entry.sources.delete(previous.source); }
      const boundary = previous || this._nextBoundary(clock), source = this._newSource(entry);
      entry.pending = { pattern, loop, signature, absoluteBeat: boundary.absoluteBeat, phaseBeat: signature === entry.signature ? entry.phaseBeat : boundary.phaseBeat, phaseCycle: signature === entry.signature ? entry.phaseCycle || 0 : boundary.phaseCycle || 0, when: boundary.when, source, precise: entry.adapter?.notes?.scheduledCancel === true };
      // Source generations keep already queued new notes independent of the
      // old pattern's sample-accurate release at the shared bar boundary.
      if (!previous && entry.pending.precise) this.host.cancelNotes(entry.id, { source: entry.liveSource, when: boundary.when });
    }
    _reset(clock) {
      for (const entry of this.tracks.values()) if (entry.pending && clock.absoluteBeat >= entry.pending.absoluteBeat - EPSILON) this._commit(entry);
      this._cancel(); this.revision = clock.revision; this.catchHeld = true;
      for (const entry of this.tracks.values()) {
        entry.sources = new Set(); entry.retired = new Map(); if (entry.live) entry.liveSource = this._newSource(entry);
        if (entry.pending) { const boundary = this._nextBoundary(clock); entry.pending = { ...entry.pending, ...boundary, phaseBeat: entry.pending.signature === entry.signature ? entry.phaseBeat : boundary.phaseBeat, phaseCycle: entry.pending.signature === entry.signature ? entry.phaseCycle || 0 : boundary.phaseCycle, source: this._newSource(entry) }; if (entry.pending.precise) this.host.cancelNotes(entry.id, { source: entry.liveSource, when: boundary.when }); }
      }
      for (const [id, entry] of this.tracks) if (entry.adapter?.voiceEffectsClock || entry.continuous && this._nativeLive(this.getState().tracks.find(track => track.id === id))) {
        try { this.host.transportInstrument(id, { ...clock, when: clock.contextTime + (entry.adapter?.voiceEffectsClock ? 0 : .005), playing: true }); } catch (error) { this.onStatus(error.message); }
      }
    }
    stop() {
      this.active = false; this.generation++; this.prepareAbort?.abort(); this.addingTracks.clear(); clearInterval(this.timer); this.timer = null; this._cancel();
      const clock = this.audio.getTransport();
      for (const [id, entry] of this.tracks) { entry.prepareAbort?.abort(); this.host.setClockDriven(id, false); if (entry.adapter?.transport) { try { this.host.transportInstrument(id, { ...clock, playing: false }); } catch (_) {} } }
    }
    panic() { this.stop(); }
    setRecordingTracks(ids = []) { this.recordingTracks = new Set(ids); }
    _signature() {
      const state = this.getState();
      return JSON.stringify(state.tracks.filter(track => !track.freeze).map(track => ({ id: track.id, instrument: track.instrument?.id, live: track.instrumentLive, record: this.recordingTracks.has(track.id),
        notes: track.clips.filter(clip => clip.type === 'notes').map(clip => ({ id: clip.id, start: clip.start, length: clip.length, sourceOffset: clip.sourceOffset, rate: clip.rate, loop: clip.loop, gain: clip.gain, transpose: clip.transpose, voiceMap: clip.voiceMap, pattern: global.MusicLabPatternSchema?.fingerprint(clip.pattern) || clip.pattern })) })));
    }
    setState() {
      for (const track of this.getState().tracks) if (track.freeze) {
        const entry = this.tracks.get(track.id);
        entry?.prepareAbort?.abort();
        if (entry) {
          for (const source of new Set(['loom', 'loom-live', ...(entry.sources || [])])) this.host.cancelNotes(track.id, { source });
          this.host.setClockDriven(track.id, false); this.tracks.delete(track.id);
        }
        this.addingTracks.delete(track.id);
      }
      if (!this.active) return;
      const signature = this._signature(), adapterChanged = [...this.tracks].some(([id, entry]) => this.host.getPatternAdapter(id) !== entry.adapter);
      if (signature === this.stateSignature && !adapterChanged) return;
      this.stateSignature = signature;
      this.compiledPatterns = new WeakMap();
      const clock = this.audio.getTransport(); this._reset(clock);
      // New note tracks are prepared without interrupting the other lanes.
      const state = this.getState(), relevant = state.tracks.filter(track => !track.freeze && track.instrument && (track.instrumentLive || this.recordingTracks.has(track.id) || track.clips.some(clip => clip.type === 'notes')));
      for (const id of [...this.tracks.keys()]) if (!relevant.some(track => track.id === id)) { this.tracks.get(id).prepareAbort?.abort(); this.host.cancelNotes(id, { source: 'loom' }); this.host.cancelNotes(id, { source: 'loom-live' }); this.host.setClockDriven(id, false); this.tracks.delete(id); }
      for (const track of relevant) {
        const entry = this.tracks.get(track.id);
        if (entry && entry.adapter !== this.host.getPatternAdapter(track.id)) this.tracks.delete(track.id);
        if (!this.tracks.has(track.id)) this._addTrack(track);
        else if (entry) {
          if (entry.live && !this._nativeLive(track)) { entry.live = null; entry.pending = null; entry.sources.clear(); }
          this.host.setClockDriven(track.id, this._clockDriven(track, entry));
          this._prepareChangedTrack(entry, track);
        }
      }
      this._tick(); if (!this.refreshing) this._refreshLive();
    }
    async _addTrack(track) {
      if (!track || track.freeze) return;
      const generation = this.generation, operation = {}; this.addingTracks.set(track.id, operation);
      try {
        if (this.ensureInstrument && !await this.ensureInstrument(track)) return;
        const record = this.host.records.get(track.id); if (record) await record.ready;
        const adapter = this.host.getPatternAdapter(track.id); await adapter?.prepare?.();
        if (!this.active || generation !== this.generation || this.addingTracks.get(track.id) !== operation) return;
        const tempo = this.getState().tempo, preparationKey = this._preparationKey(adapter, tempo);
        const entry = { id: track.id, adapter, preparationKey, live: null, signature: '', phaseBeat: 0, liveGeneration: 0, sources: new Set(), pending: null, continuous: !!adapter?.transport && ['bands', 'decks'].includes(adapter?.patternImport?.mode) && !adapter?.importedPattern };
        for (const clip of track.clips.filter(clip => clip.type === 'notes')) await this._prepareClip(adapter, clip, this.getState().tempo, this.prepareAbort?.signal);
        if (this._nativeLive(track) && adapter?.exportPattern && adapter?.scheduleNote && !entry.continuous) { entry.live = await this.host.exportPattern(track.id); entry.liveLoop = adapter.nativeSequenceLoop !== false; entry.signature = this._patternSignature(entry.live, entry.liveLoop); await this._prepareClip(adapter, { pattern: entry.live, voiceMap: {} }, this.getState().tempo, this.prepareAbort?.signal); }
        if (!this.active || generation !== this.generation || this.addingTracks.get(track.id) !== operation || !this.getState().tracks.some(item => item.id === track.id && item.instrument && !item.freeze)) return;
        if (adapter?.preparePattern && preparationKey !== this._preparationKey(adapter, this.audio.getTransport().tempo ?? this.getState().tempo)) { this._addTrack(this.getState().tracks.find(item => item.id === track.id)); return; }
        if (this._clockDriven(track, entry)) { this.host.command(track.id, 'stop').catch(() => {}); this.host.setClockDriven(track.id, true); }
        this.tracks.set(track.id, entry);
        if (entry.live) entry.liveSource = this._newSource(entry);
        if (entry.adapter?.voiceEffectsClock || entry.continuous && this._nativeLive(track)) this.host.transportInstrument(track.id, { ...this.audio.getTransport(), playing: true });
        this.catchHeld = true; this._tick();
      } catch (error) { if (this.active && this.addingTracks.get(track.id) === operation && error.name !== 'AbortError') this.onStatus(error.message); }
      finally { if (this.addingTracks.get(track.id) === operation) this.addingTracks.delete(track.id); }
    }
    _segments(clock) {
      const secondsPerBeat = 60 / clock.tempo, delay = clock.countInBeatsRemaining * secondsPerBeat;
      if (delay >= LOOKAHEAD) return [];
      let beat = clock.beat, cycle = clock.cycle || 0, when = clock.contextTime + delay, remaining = (LOOKAHEAD - delay) / secondsPerBeat;
      const segments = [], span = clock.loopEnd - clock.loopStart;
      while (remaining > EPSILON && segments.length < 16) {
        const boundary = clock.loopEnabled ? clock.loopEnd : clock.endBeat, take = Math.min(remaining, Math.max(0, boundary - beat));
        if (take > EPSILON) segments.push({ start: beat, end: beat + take, boundary, cycle, when, absolute: beat + cycle * span });
        remaining -= take; when += take * secondsPerBeat;
        if (!clock.loopEnabled || take <= EPSILON) break;
        beat = clock.loopStart; cycle++;
      }
      return segments;
    }
    _tick() {
      if (!this.active || this.disposed) return;
      const clock = this.audio.getTransport(); if (!clock.playing) { this.stop(); return; }
      if (clock.revision !== this.revision) this._reset(clock);
      const state = this.getState(), segments = this._segments(clock);
      for (const [key, when] of this.scheduled) if (when < clock.contextTime - 2) this.scheduled.delete(key);
      for (const entry of this.tracks.values()) for (const [source, when] of entry.retired || []) if (when < clock.contextTime - .5) { entry.sources.delete(source); entry.retired.delete(source); }
      try {
        for (const track of state.tracks) {
          const entry = this.tracks.get(track.id); if (!entry || track.freeze) continue;
          if (entry.adapter?.preparePattern && !entry.preparing && entry.preparationKey !== this._preparationKey(entry.adapter, clock.tempo)) this._prepareChangedTrack(entry, track, clock.tempo);
          if (entry.preparing) continue;
          if (entry.adapter?.voiceEffectsClock || entry.continuous && this._nativeLive(track)) for (const segment of segments) if (segment.cycle > (clock.cycle || 0)) {
            const key = [clock.revision, segment.cycle, track.id, 'transport'].join(':');
            if (!this.scheduled.has(key)) { this.host.transportInstrument(track.id, { ...clock, beat: segment.start, when: segment.when, playing: true }); this.scheduled.set(key, segment.when); }
          }
          for (const clip of track.clips) if (clip.type === 'notes') for (const segment of segments) this._clip(track, entry, clip, segment, clock, 'loom');
          if (this._nativeLive(track) && entry.live) {
            if (entry.pending && clock.absoluteBeat >= entry.pending.absoluteBeat - EPSILON) this._commit(entry);
            for (const segment of segments) {
              const pending = entry.pending, span = segment.end - segment.start, switchBeat = pending ? segment.start + pending.absoluteBeat - segment.absolute : Infinity;
              const oldEnd = Math.min(segment.end, switchBeat);
              if (oldEnd > segment.start + EPSILON) this._liveClip(track, entry, entry.live, entry.liveSource, entry.phaseBeat, { ...segment, end: oldEnd, boundary: Math.min(segment.boundary, switchBeat) }, clock, entry.liveLoop, entry.phaseCycle || 0);
              if (pending?.precise && switchBeat < segment.end - EPSILON && pending.absoluteBeat < segment.absolute + span) {
                const start = Math.max(segment.start, switchBeat), offset = start - segment.start;
                this._liveClip(track, entry, pending.pattern, pending.source, pending.phaseBeat, { ...segment, start, when: segment.when + offset * 60 / clock.tempo, absolute: segment.absolute + offset, catchHeld: true }, clock, pending.loop, pending.phaseCycle || 0);
              }
            }
          }
          if (segments.length) entry.catchHeld = false;
        }
      } catch (error) { this.stop(); this.onStatus(error.message); return; }
      if (segments.length) this.catchHeld = false;
      if (clock.contextTime - this.lastRefresh > .25 && !this.refreshing) { this.lastRefresh = clock.contextTime; this._refreshLive(); }
    }
    _liveClip(track, entry, pattern, source, phaseBeat, segment, clock, loop = true, phaseCycle = 0) {
      const offset = ((-phaseBeat % pattern.lengthBeats) + pattern.lengthBeats) % pattern.lengthBeats;
      // Native once-mode is finite. A GALLEY arrangement loop is still the
      // outer clock, so entering its next cycle restarts that finite source.
      const start = loop === false ? segment.cycle > phaseCycle && clock.loopEnabled ? clock.loopStart : phaseBeat : 0;
      const clip = { id: 'live-' + track.id, name: pattern.name, pattern, start, length: loop === false ? pattern.lengthBeats : clock.endBeat, sourceOffset: loop === false ? 0 : offset, rate: 1, loop: loop !== false, gain: 1, transpose: 0, voiceMap: {} };
      this._clip(track, entry, clip, segment, clock, source);
    }
    _clip(track, entry, clip, segment, clock, source) {
      if (segment.end <= clip.start + EPSILON || segment.start >= clip.start + clip.length - EPSILON) return;
      const rate = clamp(Number(clip.rate) || 1, .125, 8), offset = Number(clip.sourceOffset) || 0, period = clip.pattern.lengthBeats / rate;
      const localStart = Math.max(0, segment.start - clip.start), localEnd = Math.min(clip.length, segment.end - clip.start);
      const first = clip.loop ? Math.max(0, Math.floor((localStart * rate + offset) / clip.pattern.lengthBeats) - 1) : 0;
      const last = clip.loop ? Math.min(first + 1024, Math.floor((localEnd * rate + offset) / clip.pattern.lengthBeats) + 1) : 0;
      let compiled = this.compiledPatterns.get(clip.pattern);
      if (!compiled) {
        const events = clip.pattern.notes.map(note => { const grid = note.beat * 4, swing = Math.abs(grid - Math.round(grid)) < EPSILON && Math.round(grid) % 2 ? (clip.pattern.swing || 0) / 4 : 0, beat = note.beat + swing; return { note, beat, duration: Math.min(note.duration, clip.pattern.lengthBeats - beat) }; }).sort((a, b) => a.beat - b.beat);
        compiled = { events, maxDuration: events.reduce((maximum, event) => Math.max(maximum, event.duration), 0) }; this.compiledPatterns.set(clip.pattern, compiled);
      }
      const targets = { notes: entry.adapter?.notes }, catchHeld = this.catchHeld || entry.catchHeld || segment.catchHeld || segment.cycle > (clock.cycle || 0);
      const lowerBound = value => { let low = 0, high = compiled.events.length; while (low < high) { const mid = (low + high) >>> 1; if (compiled.events[mid].beat < value) low = mid + 1; else high = mid; } return low; };
      for (let repetition = first; repetition <= last; repetition++) {
        const base = repetition * clip.pattern.lengthBeats, low = lowerBound((segment.start - clip.start) * rate + offset - base - (catchHeld ? compiled.maxDuration : EPSILON)), high = lowerBound((segment.end - clip.start) * rate + offset - base + EPSILON);
        for (let index = low; index < high; index++) {
        const { note, beat: eventBeat, duration: eventDuration } = compiled.events[index];
        const beat = clip.start + (eventBeat + repetition * clip.pattern.lengthBeats - offset) / rate;
        const end = Math.min(clip.start + clip.length, beat + eventDuration / rate, segment.boundary);
        if (end <= segment.start + EPSILON || beat >= segment.end - EPSILON || end <= beat || end <= clip.start) continue;
        if (beat < segment.start - EPSILON && !this.catchHeld && !entry.catchHeld && !segment.catchHeld && segment.cycle <= (clock.cycle || 0)) continue;
        const key = [clock.revision, segment.cycle, track.id, clip.id, source, repetition, note.id].join(':'); if (this.scheduled.has(key)) continue;
        if (randomFor(clip.pattern.seed, key.replace(/^\d+:/, '')) >= (note.probability ?? 1)) { this.scheduled.set(key, segment.when); continue; }
        const audibleBeat = Math.max(beat, segment.start, clip.start), when = Math.max(clock.contextTime + .004, segment.when + (audibleBeat - segment.start) * 60 / clock.tempo);
        const remaining = (end - audibleBeat) * 60 / clock.tempo - Math.max(0, when - (segment.when + (audibleBeat - segment.start) * 60 / clock.tempo));
        if (remaining <= .0001) continue;
        const token = this.host.scheduleNote(track.id, { id: key, pitch: note.pitch + (clip.transpose || 0), velocity: clamp(note.velocity * (clip.gain ?? 1), 0, 1), voice: mapVoice(targets, clip.pattern, clip.voiceMap, note.voice), when, beat: audibleBeat, tempo: clock.tempo, durationSeconds: remaining, source, ...(note.locks ? { locks: { ...note.locks } } : {}), ...(note.lyric === undefined ? {} : { lyric: note.lyric }) });
        if (token !== false) this.scheduled.set(key, when);
        }
      }
    }
    async _refreshLive() {
      this.refreshing = true; const generation = this.generation;
      try {
        for (const [id, entry] of this.tracks) {
          if (!this.active || generation !== this.generation) break;
          const track = this.getState().tracks.find(item => item.id === id);
          if (!this._nativeLive(track) || entry.preparing) continue;
          const continuous = !!entry.adapter?.transport && ['bands', 'decks'].includes(entry.adapter?.patternImport?.mode) && !entry.adapter?.importedPattern;
          if (continuous !== entry.continuous) {
            entry.continuous = continuous; for (const source of entry.sources) this.host.cancelNotes(id, { source }); entry.sources.clear(); entry.live = null; entry.pending = null; entry.signature = '';
            for (const key of [...this.scheduled.keys()]) if (key.includes(':live-' + id + ':') || key.endsWith(':' + id + ':transport')) this.scheduled.delete(key);
            this.host.setClockDriven(id, !continuous);
            if (continuous) this.host.transportInstrument(id, { ...this.audio.getTransport(), playing: true });
            else { await this.host.command(id, 'stop'); this.host.setClockDriven(id, true); for (const key of [...this.scheduled.keys()]) if (key.includes(':' + id + ':')) this.scheduled.delete(key); this.catchHeld = true; }
          }
          if (!entry.adapter?.scheduleNote || !entry.adapter?.exportPattern || entry.continuous) continue;
          const pattern = await this.host.exportPattern(id), loop = entry.adapter.nativeSequenceLoop !== false, signature = this._patternSignature(pattern, loop);
          if (!this.active || generation !== this.generation) break;
          if (entry.adapter.preparePattern) {
            await this._prepareClip(entry.adapter, { pattern, voiceMap: {} }, this.getState().tempo, this.prepareAbort?.signal);
            if (!this.active || generation !== this.generation || this.tracks.get(id) !== entry || entry.preparing) continue;
            // Words may have changed again while speech preparation ran. Keep
            // the old live phrase until the most recent phrase is prepared.
            const latest = await this.host.exportPattern(id);
            if (!this.active || generation !== this.generation || this.tracks.get(id) !== entry || this._patternSignature(latest, entry.adapter.nativeSequenceLoop !== false) !== signature) continue;
          }
          if (signature !== (entry.pending?.signature || entry.signature)) {
            this._validateClip(entry.adapter, { pattern, voiceMap: {} });
            if (!entry.live) { entry.live = pattern; entry.liveLoop = loop; entry.signature = signature; entry.liveSource = this._newSource(entry); this.catchHeld = true; }
            else this._queuePattern(entry, pattern, signature, this.audio.getTransport(), loop);
            this.host.setClockDriven(id, true);
          }
        }
      } catch (error) { if (this.active) this.onStatus(error.message); }
      finally { this.refreshing = false; }
    }
    dispose() { this.stop(); this.disposed = true; this.unsubscribe?.(); this.tracks.clear(); }
  }
  global.LoomNotePlayback = LoomNotePlayback;
})(window);
