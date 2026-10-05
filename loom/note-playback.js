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
      this.unsubscribe = audio.subscribeTransport((clock, reason) => {
        if (!this.active) return;
        if (!clock.playing || ['stop', 'panic', 'end'].includes(reason)) { this.stop(); return; }
        if (clock.revision !== this.revision) this._reset(clock);
      });
    }
    async prepare() {
      if (this.disposed) throw Error('Note playback has been disposed.');
      const generation = ++this.generation, state = this.getState(), relevant = state.tracks.filter(track => track.instrument && (track.instrumentLive || this.recordingTracks.has(track.id) || track.clips.some(clip => clip.type === 'notes')));
      const entries = await Promise.all(relevant.map(async track => {
        if (this.ensureInstrument && !await this.ensureInstrument(track)) throw Error('The instrument on ' + track.name + ' could not open.');
        const record = this.host.records.get(track.id); if (record) await record.ready;
        if (generation !== this.generation || this.disposed) throw abortError();
        const adapter = this.host.getPatternAdapter(track.id), noteClips = track.clips.filter(clip => clip.type === 'notes');
        if (noteClips.length && !adapter?.scheduleNote) throw Error(track.name + ' needs a Kitchen note-compatible instrument.');
        await adapter?.prepare?.();
        if (generation !== this.generation || this.disposed) throw abortError();
        for (const clip of noteClips) this._validateClip(adapter, clip);
        const entry = { id: track.id, adapter, live: null, signature: '', phaseBeat: 0, liveGeneration: 0, sources: new Set(), pending: null, continuous: !!adapter?.transport && ['bands', 'decks'].includes(adapter?.patternImport?.mode) && !adapter?.importedPattern };
        if ((track.instrumentLive || this.recordingTracks.has(track.id)) && adapter?.exportPattern && adapter?.scheduleNote && !entry.continuous) {
          entry.live = await this.host.exportPattern(track.id);
          entry.signature = global.MusicLabPatternSchema?.fingerprint(entry.live) || JSON.stringify(entry.live);
          this._validateClip(adapter, { pattern: entry.live, voiceMap: {} });
        }
        return [track.id, entry];
      }));
      if (generation !== this.generation || this.disposed) throw abortError();
      this.tracks = new Map(entries); this.stateSignature = this._signature(); return true;
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
        adapter?.validateNote?.({ pitch, voice: voice?.id });
      }
      if (adapter?.validatePattern) {
        const pattern = clip.transpose ? { ...clip.pattern, notes: clip.pattern.notes.map(note => ({ ...note, pitch: note.pitch + clip.transpose })) } : clip.pattern;
        const voiceMap = Object.fromEntries(clip.pattern.voices.map(voice => [voice.id, mapVoice(mappingAdapter, clip.pattern, clip.voiceMap, voice.id)]));
        adapter.validatePattern({ pattern, voiceMap });
      }
    }
    start() {
      if (this.disposed || !this.audio.getTransport().playing) return false;
      this.active = true;
      for (const [id, entry] of this.tracks) {
        if (entry.live) {
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
      return { absoluteBeat: clock.absoluteBeat + distance, phaseBeat: wrapped ? clock.loopStart : boundary, when: clock.contextTime + (distance + clock.countInBeatsRemaining) * 60 / clock.tempo };
    }
    _commit(entry) {
      const pending = entry.pending; if (!pending) return;
      if (!pending.precise) this.host.cancelNotes(entry.id, { source: entry.liveSource });
      if (entry.liveSource) { entry.retired ||= new Map(); entry.retired.set(entry.liveSource, pending.when); }
      entry.live = pending.pattern; entry.signature = pending.signature; entry.phaseBeat = pending.phaseBeat; entry.liveSource = pending.source; entry.pending = null; this.catchHeld = true;
    }
    _queuePattern(entry, pattern, signature, clock) {
      const previous = entry.pending;
      if (previous) { this.host.cancelNotes(entry.id, { source: previous.source }); for (const key of [...this.scheduled.keys()]) if (key.includes(':live-' + entry.id + ':' + previous.source + ':')) this.scheduled.delete(key); entry.sources.delete(previous.source); }
      const boundary = previous || this._nextBoundary(clock), source = this._newSource(entry);
      entry.pending = { pattern, signature, absoluteBeat: boundary.absoluteBeat, phaseBeat: signature === entry.signature ? entry.phaseBeat : boundary.phaseBeat, when: boundary.when, source, precise: entry.adapter?.notes?.scheduledCancel === true };
      // Source generations keep already queued new notes independent of the
      // old pattern's sample-accurate release at the shared bar boundary.
      if (!previous && entry.pending.precise) this.host.cancelNotes(entry.id, { source: entry.liveSource, when: boundary.when });
    }
    _reset(clock) {
      for (const entry of this.tracks.values()) if (entry.pending && clock.absoluteBeat >= entry.pending.absoluteBeat - EPSILON) this._commit(entry);
      this._cancel(); this.revision = clock.revision; this.catchHeld = true;
      for (const entry of this.tracks.values()) {
        entry.sources = new Set(); entry.retired = new Map(); if (entry.live) entry.liveSource = this._newSource(entry);
        if (entry.pending) { const boundary = this._nextBoundary(clock); entry.pending = { ...entry.pending, ...boundary, phaseBeat: entry.pending.signature === entry.signature ? entry.phaseBeat : boundary.phaseBeat, source: this._newSource(entry) }; if (entry.pending.precise) this.host.cancelNotes(entry.id, { source: entry.liveSource, when: boundary.when }); }
      }
      for (const [id, entry] of this.tracks) if (entry.continuous && (this.getState().tracks.find(track => track.id === id)?.instrumentLive || this.recordingTracks.has(id))) {
        try { this.host.transportInstrument(id, { ...clock, when: clock.contextTime + .005, playing: true }); } catch (error) { this.onStatus(error.message); }
      }
    }
    stop() {
      this.active = false; this.generation++; clearInterval(this.timer); this.timer = null; this._cancel();
      const clock = this.audio.getTransport();
      for (const [id, entry] of this.tracks) { this.host.setClockDriven(id, false); if (entry.adapter?.transport) { try { this.host.transportInstrument(id, { ...clock, playing: false }); } catch (_) {} } }
    }
    panic() { this.stop(); }
    setRecordingTracks(ids = []) { this.recordingTracks = new Set(ids); }
    _signature() {
      return JSON.stringify(this.getState().tracks.map(track => ({ id: track.id, instrument: track.instrument?.id, live: track.instrumentLive, record: this.recordingTracks.has(track.id),
        notes: track.clips.filter(clip => clip.type === 'notes').map(clip => ({ id: clip.id, start: clip.start, length: clip.length, sourceOffset: clip.sourceOffset, rate: clip.rate, loop: clip.loop, gain: clip.gain, transpose: clip.transpose, voiceMap: clip.voiceMap, pattern: global.MusicLabPatternSchema?.fingerprint(clip.pattern) || clip.pattern })) })));
    }
    setState() {
      if (!this.active) return;
      const signature = this._signature(), adapterChanged = [...this.tracks].some(([id, entry]) => this.host.getPatternAdapter(id) !== entry.adapter);
      if (signature === this.stateSignature && !adapterChanged) return;
      this.stateSignature = signature;
      this.compiledPatterns = new WeakMap();
      const clock = this.audio.getTransport(); this._reset(clock);
      // New note tracks are prepared without interrupting the other lanes.
      const state = this.getState(), relevant = state.tracks.filter(track => track.instrument && (track.instrumentLive || this.recordingTracks.has(track.id) || track.clips.some(clip => clip.type === 'notes')));
      for (const id of [...this.tracks.keys()]) if (!relevant.some(track => track.id === id)) { this.host.cancelNotes(id, { source: 'loom' }); this.host.cancelNotes(id, { source: 'loom-live' }); this.host.setClockDriven(id, false); this.tracks.delete(id); }
      for (const track of relevant) {
        const entry = this.tracks.get(track.id);
        if (entry && entry.adapter !== this.host.getPatternAdapter(track.id)) this.tracks.delete(track.id);
        if (!this.tracks.has(track.id)) this._addTrack(track);
        else if (entry?.live && !track.instrumentLive && !this.recordingTracks.has(track.id)) { entry.live = null; entry.pending = null; entry.sources.clear(); this.host.setClockDriven(track.id, false); }
        else if (entry && (track.instrumentLive || this.recordingTracks.has(track.id)) && !entry.continuous) this.host.setClockDriven(track.id, true);
      }
      this._tick(); if (!this.refreshing) this._refreshLive();
    }
    async _addTrack(track) {
      const generation = this.generation;
      try {
        if (this.ensureInstrument && !await this.ensureInstrument(track)) return;
        const record = this.host.records.get(track.id); if (record) await record.ready;
        const adapter = this.host.getPatternAdapter(track.id); await adapter?.prepare?.();
        if (!this.active || generation !== this.generation) return;
        const entry = { id: track.id, adapter, live: null, signature: '', phaseBeat: 0, liveGeneration: 0, sources: new Set(), pending: null, continuous: !!adapter?.transport && ['bands', 'decks'].includes(adapter?.patternImport?.mode) && !adapter?.importedPattern };
        for (const clip of track.clips.filter(clip => clip.type === 'notes')) this._validateClip(adapter, clip);
        if ((track.instrumentLive || this.recordingTracks.has(track.id)) && adapter?.exportPattern && adapter?.scheduleNote && !entry.continuous) { entry.live = await this.host.exportPattern(track.id); entry.signature = global.MusicLabPatternSchema?.fingerprint(entry.live) || JSON.stringify(entry.live); this.host.command(track.id, 'stop').catch(() => {}); this.host.setClockDriven(track.id, true); }
        if (!this.active || generation !== this.generation) return;
        this.tracks.set(track.id, entry);
        if (entry.live) entry.liveSource = this._newSource(entry);
        if (entry.continuous && (track.instrumentLive || this.recordingTracks.has(track.id))) this.host.transportInstrument(track.id, { ...this.audio.getTransport(), playing: true });
        this.catchHeld = true; this._tick();
      } catch (error) { if (this.active) this.onStatus(error.message); }
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
          const entry = this.tracks.get(track.id); if (!entry) continue;
          if (entry.continuous && (track.instrumentLive || this.recordingTracks.has(track.id))) for (const segment of segments) if (segment.cycle > (clock.cycle || 0)) {
            const key = [clock.revision, segment.cycle, track.id, 'transport'].join(':');
            if (!this.scheduled.has(key)) { this.host.transportInstrument(track.id, { ...clock, beat: segment.start, when: segment.when, playing: true }); this.scheduled.set(key, segment.when); }
          }
          for (const clip of track.clips) if (clip.type === 'notes') for (const segment of segments) this._clip(track, entry, clip, segment, clock, 'loom');
          if ((track.instrumentLive || this.recordingTracks.has(track.id)) && entry.live) {
            if (entry.pending && clock.absoluteBeat >= entry.pending.absoluteBeat - EPSILON) this._commit(entry);
            for (const segment of segments) {
              const pending = entry.pending, span = segment.end - segment.start, switchBeat = pending ? segment.start + pending.absoluteBeat - segment.absolute : Infinity;
              const oldEnd = Math.min(segment.end, switchBeat);
              if (oldEnd > segment.start + EPSILON) this._liveClip(track, entry, entry.live, entry.liveSource, entry.phaseBeat, { ...segment, end: oldEnd, boundary: Math.min(segment.boundary, switchBeat) }, clock);
              if (pending?.precise && switchBeat < segment.end - EPSILON && pending.absoluteBeat < segment.absolute + span) {
                const start = Math.max(segment.start, switchBeat), offset = start - segment.start;
                this._liveClip(track, entry, pending.pattern, pending.source, pending.phaseBeat, { ...segment, start, when: segment.when + offset * 60 / clock.tempo, absolute: segment.absolute + offset, catchHeld: true }, clock);
              }
            }
          }
        }
      } catch (error) { this.stop(); this.onStatus(error.message); return; }
      if (segments.length) this.catchHeld = false;
      if (clock.contextTime - this.lastRefresh > .25 && !this.refreshing) { this.lastRefresh = clock.contextTime; this._refreshLive(); }
    }
    _liveClip(track, entry, pattern, source, phaseBeat, segment, clock) {
      const offset = ((-phaseBeat % pattern.lengthBeats) + pattern.lengthBeats) % pattern.lengthBeats;
      const clip = { id: 'live-' + track.id, name: pattern.name, pattern, start: 0, length: clock.endBeat, sourceOffset: offset, rate: 1, loop: true, gain: 1, transpose: 0, voiceMap: {} };
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
      const targets = { notes: entry.adapter?.notes }, catchHeld = this.catchHeld || segment.catchHeld || segment.cycle > (clock.cycle || 0);
      const lowerBound = value => { let low = 0, high = compiled.events.length; while (low < high) { const mid = (low + high) >>> 1; if (compiled.events[mid].beat < value) low = mid + 1; else high = mid; } return low; };
      for (let repetition = first; repetition <= last; repetition++) {
        const base = repetition * clip.pattern.lengthBeats, low = lowerBound((segment.start - clip.start) * rate + offset - base - (catchHeld ? compiled.maxDuration : EPSILON)), high = lowerBound((segment.end - clip.start) * rate + offset - base + EPSILON);
        for (let index = low; index < high; index++) {
        const { note, beat: eventBeat, duration: eventDuration } = compiled.events[index];
        const beat = clip.start + (eventBeat + repetition * clip.pattern.lengthBeats - offset) / rate;
        const end = Math.min(clip.start + clip.length, beat + eventDuration / rate, segment.boundary);
        if (end <= segment.start + EPSILON || beat >= segment.end - EPSILON || end <= beat || end <= clip.start) continue;
        if (beat < segment.start - EPSILON && !this.catchHeld && !segment.catchHeld && segment.cycle <= (clock.cycle || 0)) continue;
        const key = [clock.revision, segment.cycle, track.id, clip.id, source, repetition, note.id].join(':'); if (this.scheduled.has(key)) continue;
        if (randomFor(clip.pattern.seed, key.replace(/^\d+:/, '')) >= (note.probability ?? 1)) { this.scheduled.set(key, segment.when); continue; }
        const audibleBeat = Math.max(beat, segment.start, clip.start), when = Math.max(clock.contextTime + .004, segment.when + (audibleBeat - segment.start) * 60 / clock.tempo);
        const remaining = (end - audibleBeat) * 60 / clock.tempo - Math.max(0, when - (segment.when + (audibleBeat - segment.start) * 60 / clock.tempo));
        if (remaining <= .0001) continue;
        const token = this.host.scheduleNote(track.id, { id: key, pitch: note.pitch + (clip.transpose || 0), velocity: clamp(note.velocity * (clip.gain ?? 1), 0, 1), voice: mapVoice(targets, clip.pattern, clip.voiceMap, note.voice), when, durationSeconds: remaining, source });
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
          if (!track?.instrumentLive && !this.recordingTracks.has(id)) continue;
          const continuous = !!entry.adapter?.transport && ['bands', 'decks'].includes(entry.adapter?.patternImport?.mode) && !entry.adapter?.importedPattern;
          if (continuous !== entry.continuous) {
            entry.continuous = continuous; for (const source of entry.sources) this.host.cancelNotes(id, { source }); entry.sources.clear(); entry.live = null; entry.pending = null; entry.signature = '';
            for (const key of [...this.scheduled.keys()]) if (key.includes(':live-' + id + ':') || key.endsWith(':' + id + ':transport')) this.scheduled.delete(key);
            this.host.setClockDriven(id, !continuous);
            if (continuous) this.host.transportInstrument(id, { ...this.audio.getTransport(), playing: true });
            else { await this.host.command(id, 'stop'); this.host.setClockDriven(id, true); for (const key of [...this.scheduled.keys()]) if (key.includes(':' + id + ':')) this.scheduled.delete(key); this.catchHeld = true; }
          }
          if (!entry.adapter?.scheduleNote || !entry.adapter?.exportPattern || entry.continuous) continue;
          const pattern = await this.host.exportPattern(id), signature = global.MusicLabPatternSchema?.fingerprint(pattern) || JSON.stringify(pattern);
          if (!this.active || generation !== this.generation) break;
          if (signature !== (entry.pending?.signature || entry.signature)) {
            this._validateClip(entry.adapter, { pattern, voiceMap: {} });
            if (!entry.live) { entry.live = pattern; entry.signature = signature; entry.liveSource = this._newSource(entry); this.catchHeld = true; }
            else this._queuePattern(entry, pattern, signature, this.audio.getTransport());
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
