/* PICNIC's native sample voices. The live and offline paths build the same graph. */
(function (global) {
  'use strict';
  const VOICES = 32, EPSILON = 1e-7, LOOKAHEAD = .14, INTERVAL = 25;
  const PART_IDS = ['melody', 'chords', 'bass', 'drums', 'neighbors', 'texture'];
  const pcmCache = new Map(), contextBuffers = new WeakMap();
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, low, high, fallback = low) => Math.max(low, Math.min(high, finite(value, fallback)));
  const copy = value => JSON.parse(JSON.stringify(value));
  const aborted = signal => { if (signal?.aborted) throw new DOMException('PICNIC rendering cancelled.', 'AbortError'); };
  const library = () => { if (!global.PicnicLibrary?.presets || !global.PicnicLibrary?.samples) throw Error('The PICNIC sample library is unavailable.'); return global.PicnicLibrary; };
  const presetFor = id => {
    const presets = library().presets;
    const preset = Array.isArray(presets) ? presets.find(item => item.id === id) : presets[id];
    if (!preset || !Array.isArray(preset.regions)) throw Error('The selected PICNIC sound is unavailable: ' + id);
    return preset;
  };
  const partsOf = state => PART_IDS.map(id => state.parts?.find(part => part.id === id)).filter(Boolean);
  const audible = (state, part) => !part.mute && (!state.parts.some(item => item.solo) || part.solo);
  const sequenceSignature = state => JSON.stringify({ swing: state.swing, seed: state.seed, selectedBank: state.selectedBank, chain: state.chain, chainOrder: state.chainOrder, banks: state.banks, musicLabPattern: state.musicLabPattern, parts: partsOf(state).map(part => ({ id: part.id, presetId: part.presetId, transpose: part.transpose, mute: part.mute, solo: part.solo })) });

  function decodeSample(id) {
    if (pcmCache.has(id)) return pcmCache.get(id);
    const sample = library().samples[id];
    if (!sample || typeof sample.data !== 'string') throw Error('A PICNIC factory sample is missing: ' + id);
    const raw = global.atob(sample.data), frames = Number(sample.frames);
    if (!Number.isInteger(frames) || frames < 1 || raw.length !== frames * 2 || !Number.isFinite(sample.sampleRate) || sample.sampleRate < 8000 || sample.sampleRate > 192000) throw Error('A PICNIC sample has invalid PCM data: ' + id);
    const pcm = new Float32Array(frames);
    for (let index = 0; index < frames; index++) { const word = raw.charCodeAt(index * 2) | raw.charCodeAt(index * 2 + 1) << 8; pcm[index] = (word & 32768 ? word - 65536 : word) / 32768; }
    const decoded = { pcm, sampleRate: sample.sampleRate }; pcmCache.set(id, decoded); return decoded;
  }
  function bufferFor(context, id) {
    let buffers = contextBuffers.get(context); if (!buffers) { buffers = new Map(); contextBuffers.set(context, buffers); }
    if (!buffers.has(id)) { const sample = decodeSample(id), buffer = context.createBuffer(1, sample.pcm.length, sample.sampleRate); buffer.getChannelData(0).set(sample.pcm); buffers.set(id, buffer); }
    return buffers.get(id);
  }
  function prepareBuffers(context, state) {
    const regions = new Map();
    for (const part of partsOf(state)) {
      const preset = presetFor(part.presetId);
      regions.set(part.id, preset.regions.map(region => ({ region, buffer: bufferFor(context, region.sample) })));
    }
    return regions;
  }
  function parameter(param, value, now) { param.cancelScheduledValues(now); param.setValueAtTime(value, now); }
  function impulse(context) {
    const length = Math.ceil(context.sampleRate * 1.45), buffer = context.createBuffer(2, length, context.sampleRate);
    let seed = 0x5049434e;
    for (let channel = 0; channel < 2; channel++) {
      const values = buffer.getChannelData(channel);
      for (let index = 0; index < length; index++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; values[index] = ((seed >>> 0) / 2147483648 - 1) * Math.pow(1 - index / length, 3.3) * .3; }
    }
    return buffer;
  }
  function makeGraph(context, state, destination) {
    const sum = context.createGain(), tone = context.createBiquadFilter(), volume = context.createGain(), limiter = context.createDynamicsCompressor(), guardInput = context.createGain(), guard = context.createWaveShaper(), output = context.createGain();
    tone.type = 'lowpass'; tone.Q.value = .35;
    limiter.threshold.value = -5; limiter.knee.value = 14; limiter.ratio.value = 4; limiter.attack.value = .003; limiter.release.value = .16;
    const curve = new Float32Array(32769); for (let index = 0; index < curve.length; index++) curve[index] = Math.tanh((index / (curve.length - 1) * 2 - 1) * 4);
    guardInput.gain.value = .25; guard.curve = curve; guard.oversample = 'none';
    sum.connect(tone); tone.connect(volume); volume.connect(limiter); limiter.connect(guardInput); guardInput.connect(guard); guard.connect(output); output.connect(destination);
    const reverb = context.createConvolver(), reverbOut = context.createGain(); reverb.buffer = impulse(context); reverbOut.gain.value = .65; reverb.connect(reverbOut); reverbOut.connect(sum);
    const delay = context.createDelay(2), feedback = context.createGain(), delayTone = context.createBiquadFilter(), delayOut = context.createGain();
    feedback.gain.value = .26; delayTone.type = 'lowpass'; delayTone.frequency.value = 4500; delayOut.gain.value = .65;
    delay.connect(delayTone); delayTone.connect(feedback); feedback.connect(delay); delayTone.connect(delayOut); delayOut.connect(sum);
    const parts = new Map();
    for (const id of PART_IDS) {
      const input = context.createGain(), filter = context.createBiquadFilter(), pan = context.createStereoPanner(), gain = context.createGain(), reverbSend = context.createGain(), delaySend = context.createGain();
      filter.type = 'lowpass'; filter.Q.value = .35; input.connect(filter); filter.connect(pan); pan.connect(gain); gain.connect(sum); gain.connect(reverbSend); reverbSend.connect(reverb); gain.connect(delaySend); delaySend.connect(delay);
      parts.set(id, { input, filter, pan, gain, reverbSend, delaySend });
    }
    const nodes = [sum, tone, volume, limiter, guardInput, guard, output, reverb, reverbOut, delay, feedback, delayTone, delayOut, ...[...parts.values()].flatMap(part => Object.values(part))];
    const graph = { context, parts, output, delay, update(next, at = context.currentTime) {
      parameter(tone.frequency, clamp(next.master?.tone, 100, 18000, 14000), at);
      parameter(volume.gain, clamp(next.master?.level, 0, 1, .72), at);
      parameter(delay.delayTime, Math.min(1.9, 60 / clamp(next.tempo, 20, 400, 96) * .75), at);
      for (const part of partsOf(next)) {
        const node = parts.get(part.id);
        parameter(node.filter.frequency, clamp(part.cutoff, 100, 18000, 14000), at);
        parameter(node.pan.pan, clamp(part.pan, -1, 1, 0), at);
        parameter(node.gain.gain, audible(next, part) ? clamp(part.level, 0, 1, .7) : 0, at);
        parameter(node.reverbSend.gain, clamp(part.reverb, 0, 1, .25) * clamp(next.master?.reverb, 0, 1, .18), at);
        parameter(node.delaySend.gain, clamp(part.delay, 0, 1, .1) * clamp(next.master?.delay, 0, 1, .1), at);
      }
    }, dispose() { for (const node of nodes) { try { node.disconnect(); } catch (_) {} } } };
    graph.update(state, 0); return graph;
  }

  class VoicePool {
    constructor(context, graph, state, regions, statistics) { this.context = context; this.graph = graph; this.state = state; this.regions = regions; this.statistics = statistics; this.slots = Array.from({ length: VOICES }, () => []); this.voices = new Set(); this.serial = 0; this.cancellationBarriers = new Map(); }
    update(state, regions) { this.state = state; this.regions = regions; }
    active(at = this.context.currentTime) { return [...this.voices].filter(voice => voice.when <= at + EPSILON && voice.stopAt > at + EPSILON).length; }
    _removeReservation(voice) { const reservations = this.slots[voice.slot], index = reservations.indexOf(voice); if (index >= 0) reservations.splice(index, 1); }
    _disconnect(voice) { if (voice.disconnected) return; voice.disconnected = true; this.voices.delete(voice); this._removeReservation(voice); for (const node of [voice.gain, voice.pan, ...voice.sources]) { try { node.disconnect(); } catch (_) {} } }
    _index(reservations, when) { let low = 0, high = reservations.length; while (low < high) { const middle = (low + high) >>> 1; if (reservations[middle].when < when) low = middle + 1; else high = middle; } return low; }
    _conflicts(reservations, when, end) {
      let index = this._index(reservations, when); if (index && reservations[index - 1].stopAt > when + EPSILON) index--;
      const result = []; for (; index < reservations.length && reservations[index].when < end - EPSILON; index++) if (reservations[index].stopAt > when + EPSILON) result.push(reservations[index]);
      return result;
    }
    _allocate(when, end) {
      let selected = 0, selectedConflicts = null, earliestEnd = Infinity, oldestSerial = Infinity;
      for (let slot = 0; slot < VOICES; slot++) {
        const conflicts = this._conflicts(this.slots[slot], when, end); if (!conflicts.length) return slot;
        const finish = Math.max(...conflicts.map(voice => voice.stopAt)), oldest = Math.min(...conflicts.map(voice => voice.serial));
        if (finish < earliestEnd - EPSILON || Math.abs(finish - earliestEnd) < EPSILON && oldest < oldestSerial) { selected = slot; selectedConflicts = conflicts; earliestEnd = finish; oldestSerial = oldest; }
      }
      // Reservations remain in their slot until ended, even when another note
      // has already reserved a later interval. This also bounds out-of-order
      // manual notes inserted behind the native/host lookahead window.
      for (const voice of selectedConflicts) { this._stop(voice, when); this.statistics.stolen++; }
      return selected;
    }
    _stop(voice, when) {
      const at = Math.max(this.context.currentTime, finite(when, this.context.currentTime));
      if (at >= voice.stopAt - EPSILON) return;
      voice.stopAt = at;
      if (voice.when >= at - EPSILON) this._removeReservation(voice);
      try { voice.gain.gain.cancelScheduledValues(at); voice.gain.gain.setValueAtTime(0, at); } catch (_) {}
      for (const source of voice.sources) { try { source.stop(at); } catch (_) {} }
      this.statistics.cancelled++;
      if (at <= this.context.currentTime + EPSILON) this._disconnect(voice);
    }
    cancel({ source, when } = {}) { const at = Math.max(this.context.currentTime, finite(when, this.context.currentTime)); if (source !== undefined && Number.isFinite(when) && when > this.context.currentTime + EPSILON) this.cancellationBarriers.set(source, Math.min(at, this.cancellationBarriers.get(source) ?? Infinity)); for (const voice of [...this.voices]) if (source === undefined || voice.source === source) this._stop(voice, at); }
    schedule(event) {
      const part = this.state.parts.find(item => item.id === event.voice);
      if (!part || !audible(this.state, part) || !Number.isFinite(event.pitch) || event.pitch < 0 || event.pitch > 127 || !Number.isFinite(event.when) || !Number.isFinite(event.durationSeconds) || event.durationSeconds <= 0 || !Number.isFinite(event.velocity) || event.velocity <= 0) return false;
      const pitch = event.pitch + clamp(part.transpose, -24, 24, 0); if (pitch < 0 || pitch > 127) return false;
      const when = Math.max(this.context.currentTime, event.when), barrier = this.cancellationBarriers.get(event.source);
      if (barrier !== undefined && when >= barrier - EPSILON) return false;
      const velocity = clamp(event.velocity, 0, 1), midiVelocity = Math.max(1, Math.min(127, Math.round(velocity * 127)));
      const selected = (this.regions.get(part.id) || []).filter(({ region }) => pitch >= (region.key?.[0] ?? 0) && pitch <= (region.key?.[1] ?? 127) && midiVelocity >= (region.velocity?.[0] ?? 0) && midiVelocity <= (region.velocity?.[1] ?? 127));
      if (!selected.length) return false;
      const ids = [];
      for (const { region, buffer } of selected) {
        const attack = clamp(clamp(region.attack, 0, 120, .002) + clamp(part.attack, 0, 2, 0), .0005, 122), decay = clamp(region.decay, .0005, 120, .1), sustain = clamp(region.sustain, .00001, 1, 1), release = clamp(clamp(region.release, 0, 120, .12) + clamp(part.release, .005, 5, .02), .005, 125);
        const releaseAt = when + Math.min(120, event.durationSeconds), endAt = releaseAt + release, slot = this._allocate(when, Math.min(endAt, barrier ?? Infinity));
        const gain = this.context.createGain(), pan = this.context.createStereoPanner(), source = this.context.createBufferSource();
        source.buffer = buffer;
        const rate = Math.pow(2, (pitch - finite(region.root, 60) + finite(region.tune, 0) / 100) / 12);
        source.playbackRate.setValueAtTime(rate, when);
        const loopStart = clamp(region.loopStart, 0, buffer.length - 1, 0), loopEnd = clamp(region.loopEnd, loopStart + 1, buffer.length, buffer.length);
        const loopMode = region.loopMode === 3 ? 3 : region.loopMode === 1 ? 1 : 0, looping = region.loop !== false && loopMode !== 0 && loopEnd > loopStart;
        source.loop = looping; if (looping) { source.loopStart = loopStart / buffer.sampleRate; source.loopEnd = loopEnd / buffer.sampleRate; }
        const peak = clamp(region.gain, 0, 16, 1) * velocity * velocity;
        const held = releaseAt < when + attack ? peak * (releaseAt - when) / attack : releaseAt < when + attack + decay ? peak * Math.pow(sustain, (releaseAt - when - attack) / decay) : peak * sustain;
        gain.gain.setValueAtTime(0, when);
        if (releaseAt <= when + attack) gain.gain.linearRampToValueAtTime(held, releaseAt);
        else { gain.gain.linearRampToValueAtTime(peak, when + attack); if (peak > 0) gain.gain.exponentialRampToValueAtTime(Math.max(.000000001, releaseAt < when + attack + decay ? held : peak * sustain), Math.min(releaseAt, when + attack + decay)); }
        gain.gain.setValueAtTime(held, releaseAt); if (held > 0) gain.gain.exponentialRampToValueAtTime(Math.max(.000000001, held * .00001), endAt); gain.gain.setValueAtTime(0, endAt);
        pan.pan.setValueAtTime(clamp(region.pan, -1, 1, 0), when); source.connect(gain); gain.connect(pan); pan.connect(this.graph.parts.get(part.id).input);
        const voice = { id: String(event.id || 'picnic-note') + ':' + (++this.serial), serial: this.serial, slot, source: event.source, part: part.id, pitch, when, releaseAt, stopAt: endAt, gain, pan, sources: [source], disconnected: false };
        const reservations = this.slots[slot]; reservations.splice(this._index(reservations, when), 0, voice); this.voices.add(voice);
        if (looping && loopMode === 3) {
          // AudioBufferSource.loop is not an AudioParam. A phase-matched tail
          // starts at release, so offline and live never depend on JS timers.
          const tail = this.context.createBufferSource(); tail.buffer = buffer; tail.playbackRate.setValueAtTime(rate, releaseAt); tail.connect(gain);
          const travelled = (releaseAt - when) * rate * buffer.sampleRate;
          const offsetFrames = travelled < loopEnd ? travelled : loopStart + (travelled - loopStart) % (loopEnd - loopStart);
          source.start(when); source.stop(releaseAt); tail.start(releaseAt, Math.min(buffer.duration - 1 / buffer.sampleRate, offsetFrames / buffer.sampleRate)); tail.stop(endAt); voice.sources.push(tail); tail.onended = () => this._disconnect(voice);
        } else { source.start(when); source.stop(endAt); source.onended = () => this._disconnect(voice); }
        if (barrier !== undefined && barrier < voice.stopAt) this._stop(voice, barrier);
        this.statistics.scheduled++; if (event.source === 'picnic-native') this.statistics.nativeScheduled++; ids.push(voice.id);
      }
      return ids.length === 1 ? ids[0] : ids;
    }
    dispose() { this.cancel(); for (const voice of [...this.voices]) this._disconnect(voice); for (const reservations of this.slots) reservations.length = 0; }
  }

  class PicnicAudioEngine {
    constructor({ getState, onStep, onStatus } = {}) {
      if (typeof getState !== 'function') throw TypeError('Provide PICNIC getState.');
      this.getState = getState; this.onStep = onStep || (() => {}); this.onStatus = onStatus || (() => {});
      this._context = null; this._graph = null; this._pool = null; this._state = null; this._init = null; this._playing = false; this._timer = null; this._anchorBeat = 0; this._anchorTime = 0; this._tempo = 96; this._generation = 0; this._scheduled = new Map(); this._lastStep = ''; this._disposed = false;
      this.schedulingStatistics = { scheduled: 0, cancelled: 0, stolen: 0, nativeScheduled: 0 };
    }
    get context() { return this._context; }
    get output() { return this._graph?.output || null; }
    get isPlaying() { return this._playing; }
    get activeVoices() { return this._pool?.active() || 0; }
    get maxVoices() { return VOICES; }
    get nativeBeat() { if (!this._playing || !this._context) return this._anchorBeat; return this._anchorBeat + Math.max(0, this._context.currentTime - this._anchorTime) * this._tempo / 60; }
    async init() {
      if (this._disposed) throw Error('PICNIC audio has been disposed.');
      if (this._init) return this._init;
      this._init = (async () => {
        const Context = global.AudioContext || global.webkitAudioContext; if (!Context) throw Error('Web Audio is unavailable in this browser.');
        this._context = new Context({ latencyHint: 'interactive' });
        const state = copy(this.getState()); this._tempo = clamp(state.tempo, 40, 240, 96); this._state = state;
        const regions = prepareBuffers(this._context, state); this._graph = makeGraph(this._context, state, this._context.destination); this._pool = new VoicePool(this._context, this._graph, state, regions, this.schedulingStatistics);
        return this._context;
      })();
      try { return await this._init; } catch (error) { this._init = null; try { this._context?.close(); } catch (_) {} this._context = null; throw error; }
    }
    async update(state = this.getState()) {
      await this.init(); if (this._disposed) throw Error('PICNIC audio has been disposed.');
      const next = copy(state), regions = prepareBuffers(this._context, next);
      const previous = this._state, changedSequence = sequenceSignature(previous) !== sequenceSignature(next); const changedPresets = partsOf(next).filter(part => previous?.parts?.find(old => old.id === part.id)?.presetId !== part.presetId).map(part => part.id);
      for (const voice of [...this._pool.voices]) if (changedPresets.includes(voice.part)) this._pool._stop(voice, this._context.currentTime);
      const tempo = clamp(next.tempo, 40, 240, 96); if (tempo !== this._tempo) this.setTempo(tempo);
      this._state = next; this._pool.update(next, regions); this._graph.update(next);
      // Only native sequence notes are replaced by sequence/mix edits. Incoming
      // GALLEY note generations keep their own exact cancellation ownership.
      if (this._playing && changedSequence) { this._pool.cancel({ source: 'picnic-native' }); this._scheduled.clear(); this._tick(true); }
      return true;
    }
    scheduleNote(event) { if (!this._pool || this._disposed) return false; return this._pool.schedule(event || {}); }
    cancelNotes(options = {}) { this._pool?.cancel(options); return true; }
    async play({ when, beat = 0 } = {}) {
      const generation = ++this._generation; await this.init(); await this._context.resume(); if (generation !== this._generation || this._disposed) return false;
      await this.update(this.getState()); if (generation !== this._generation || this._disposed) return false;
      this.stop(); this._pool.cancellationBarriers.delete('picnic-native'); this._playing = true; this._anchorTime = Math.max(this._context.currentTime, finite(when, this._context.currentTime + .012)); this._anchorBeat = Math.max(0, finite(beat, 0)); this._scheduled.clear(); this._lastStep = '';
      this._tick(true); if (!this._playing) return false; this._timer = global.setInterval(() => this._tick(), INTERVAL); return true;
    }
    _tick(catchHeld = false) {
      if (!this._playing || !this._pool || this._disposed) return;
      try {
        const heldLookback = Math.max(2, ...(this._state.musicLabPattern?.pattern?.notes || []).map(note => finite(note.duration, 0)));
        const now = this._context.currentTime, beat = this.nativeBeat, startBeat = Math.max(0, beat - (catchHeld ? heldLookback : .015)), endBeat = this._anchorBeat + Math.max(0, now + LOOKAHEAD - this._anchorTime) * this._tempo / 60;
        const sequence = global.PicnicSequence; if (!sequence?.events) throw Error('PICNIC sequencing is unavailable.');
        if (endBeat <= startBeat + EPSILON) return;
        const events = sequence.events(this._state, { startBeat, lengthBeats: Math.max(0, endBeat - startBeat), realizeProbability: true });
        for (const event of events) {
          const key = [event.voice, event.id, event.startBeat, event.pitch].join(':'); if (this._scheduled.has(key)) continue;
          const eventWhen = this._anchorTime + (event.startBeat - this._anchorBeat) * 60 / this._tempo, eventEnd = eventWhen + event.durationBeats * 60 / this._tempo;
          if (eventEnd <= now + .0005 || eventWhen < now - .02 && !catchHeld) continue;
          const at = Math.max(now + .002, eventWhen, this._anchorTime), durationSeconds = eventEnd - at;
          if (durationSeconds <= .0001) continue;
          this.scheduleNote({ id: 'native:' + key, voice: event.voice, pitch: event.pitch, velocity: event.velocity, when: at, durationSeconds, source: 'picnic-native' }); this._scheduled.set(key, eventEnd);
        }
        for (const [key, end] of this._scheduled) if (end < now - 2) this._scheduled.delete(key);
        const length = Math.max(.25, sequence.lengthBeats(this._state)), phase = ((beat % length) + length) % length, step = Math.floor(phase * 4), stamp = step + ':' + Math.floor(beat / length);
        if (now >= this._anchorTime && stamp !== this._lastStep) { this._lastStep = stamp; let bank = this._state.selectedBank || 0, localStep = step; if (this._state.chain) for (const selected of this._state.chainOrder || [0]) { const size = this._state.banks[selected].length; if (localStep < size) { bank = selected; break; } localStep -= size; } this.onStep({ beat, step: localStep, bank, playing: true }); }
      } catch (error) { this.stop(); this.onStatus(error.message || 'PICNIC playback stopped.'); }
    }
    setTempo(value) {
      const tempo = clamp(value, 40, 240, 96), phase = this.nativeBeat;
      this._tempo = tempo; if (this._state) this._state.tempo = tempo;
      if (this._playing && this._context) { this._anchorBeat = phase; this._anchorTime = this._context.currentTime; this._pool.cancel({ source: 'picnic-native' }); this._scheduled.clear(); this._tick(true); }
      if (this._graph && this._state) this._graph.update(this._state); return tempo;
    }
    stop() { this._generation++; if (this._playing) this._anchorBeat = this.nativeBeat; this._playing = false; global.clearInterval(this._timer); this._timer = null; this._pool?.cancel({ source: 'picnic-native' }); this._scheduled.clear(); this._lastStep = ''; this.onStep({ beat: this._anchorBeat, step: -1, bank: this._state?.selectedBank || 0, playing: false }); }
    panic() { this.stop(); this._pool?.cancel(); if (this._graph && this._state && !this._closing) { const regions = this._pool.regions; this._pool.dispose(); this._graph.dispose(); this._graph = makeGraph(this._context, this._state, this._context.destination); this._pool = new VoicePool(this._context, this._graph, this._state, regions, this.schedulingStatistics); } }
    getDiagnostics() { const now = this._context?.currentTime || 0, voices = [...(this._pool?.voices || [])], sources = {}; for (const voice of voices) { const id = String(voice.source || 'unspecified'); sources[id] ||= { active: 0, pending: 0, stopAt: null }; if (voice.stopAt > now + EPSILON) sources[id][voice.when <= now + EPSILON ? 'active' : 'pending']++; sources[id].stopAt = sources[id].stopAt === null ? voice.stopAt : Math.max(sources[id].stopAt, voice.stopAt); } return { playing: this._playing, beat: this.nativeBeat, activeVoices: this.activeVoices, maxVoices: VOICES, preparedSamples: this._context ? contextBuffers.get(this._context)?.size || 0 : 0, scheduled: { ...this.schedulingStatistics }, sources, parts: Object.fromEntries(PART_IDS.map(id => [id, voices.filter(voice => voice.part === id && voice.when <= now && voice.stopAt > now).length])) }; }
    async renderNotes(options) { return PicnicAudioEngine.renderNotes(options); }
    static async renderNotes({ state, events, tempo, lengthBeats, tailSeconds = 0, signal } = {}) {
      aborted(signal); if (!state || !Array.isArray(events)) throw Error('Choose a PICNIC state and note events to render.');
      const saved = copy(state), bpm = tempo === undefined ? saved.tempo : tempo, beats = lengthBeats, tail = tailSeconds;
      if (!Number.isFinite(bpm) || bpm < 20 || bpm > 400 || !Number.isFinite(tail) || tail < 0 || tail > 30 || !Number.isFinite(beats)) throw Error('PICNIC render tempo must be 20–400 BPM and tail 0–30 seconds, with finite note length.');
      const seconds = beats * 60 / bpm + tail;
      if (!(beats > 0) || !Number.isFinite(seconds) || seconds > 120 + EPSILON) throw Error('PICNIC exports must be between one sample and 120 seconds.');
      if (events.length > 100000) throw Error('This PICNIC export contains too many notes.');
      const Offline = global.OfflineAudioContext || global.webkitOfflineAudioContext; if (!Offline) throw Error('Offline Web Audio rendering is unavailable.');
      const sampleRate = 44100, context = new Offline(2, Math.max(1, Math.ceil(seconds * sampleRate)), sampleRate); saved.tempo = bpm;
      const regions = prepareBuffers(context, saved); aborted(signal);
      const graph = makeGraph(context, saved, context.destination), pool = new VoicePool(context, graph, saved, regions, { scheduled: 0, cancelled: 0, stolen: 0, nativeScheduled: 0 });
      let abortListener;
      try {
        const sorted = events.map((event, index) => ({ ...event, _order: index })).sort((a, b) => a.startBeat - b.startBeat || a._order - b._order);
        for (let index = 0; index < sorted.length; index++) {
          if (index % 256 === 0) { aborted(signal); if (index) await new Promise(resolve => global.setTimeout(resolve, 0)); }
          const event = sorted[index]; if (!Number.isFinite(event.startBeat) || !Number.isFinite(event.durationBeats) || event.durationBeats <= 0 || event.startBeat >= beats || event.startBeat + event.durationBeats <= 0) continue;
          const start = Math.max(0, event.startBeat), duration = Math.min(beats, event.startBeat + event.durationBeats) - start;
          if (duration > 0) pool.schedule({ ...event, when: start * 60 / bpm, durationSeconds: duration * 60 / bpm, source: 'picnic-render' });
        }
        aborted(signal);
        let rejectAbort; const cancelled = new Promise((_, reject) => { rejectAbort = reject; });
        abortListener = () => { rejectAbort(new DOMException('PICNIC rendering cancelled.', 'AbortError')); };
        signal?.addEventListener('abort', abortListener, { once: true });
        const rendered = await Promise.race([context.startRendering(), cancelled]); aborted(signal);
        const left = rendered.getChannelData(0), right = rendered.getChannelData(1), pcm = new Float32Array(rendered.length * 2);
        for (let index = 0; index < rendered.length; index++) { const l = left[index], r = right[index]; if (!Number.isFinite(l) || !Number.isFinite(r)) throw Error('PICNIC produced invalid audio.'); pcm[index * 2] = l; pcm[index * 2 + 1] = r; }
        return { pcm, sampleRate: rendered.sampleRate };
      } finally { signal?.removeEventListener('abort', abortListener); pool.dispose(); graph.dispose(); }
    }
    async dispose() { if (this._disposed) return; this._closing = true; this.panic(); this._disposed = true; this._pool?.dispose(); this._graph?.dispose(); const context = this._context; this._context = null; this._graph = null; this._pool = null; if (context?.state !== 'closed') await context?.close(); }
  }
  global.PicnicAudioEngine = PicnicAudioEngine;
})(window);
