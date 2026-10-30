/* MORSEL — routed, deterministic pitched words for live notes and native prints. */
(function (global) {
  'use strict';
  const VOICES = ['alto', 'tenor', 'bass', 'robot'], RATE = 48000, MIN_PITCH = 36, MAX_PITCH = 84;
  const BASE_PITCH = 57, MAX_WORD_BYTES = 64 * 1024 * 1024, MAX_NOTE_BYTES = 64 * 1024 * 1024;
  const copy = value => JSON.parse(JSON.stringify(value));
  const clamp = (value, min, max, fallback = min) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  const abort = signal => { if (signal?.aborted) throw new DOMException('MORSEL rendering cancelled.', 'AbortError'); };
  const frequency = pitch => 440 * Math.pow(2, (pitch - 69) / 12);
  const hash = text => { let value = 2166136261; for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619); return value >>> 0; };
  function settings(value = {}) {
    return { ...value, voice: VOICES.includes(value.voice) ? value.voice : 'alto', lyric: typeof value.lyric === 'string' ? value.lyric : 'ah',
      tone: clamp(value.tone, 0, 1, .55), air: clamp(value.air, 0, 1, .12), vibrato: clamp(value.vibrato, 0, 1, .1), space: clamp(value.space, 0, 1, .18),
      volume: clamp(value.volume, 0, 1, .65), attack: clamp(value.attack, .001, .5, .008), release: clamp(value.release, .005, 2, .09) };
  }
  function identity(event = {}, state = {}) {
    const pitch = event.pitch ?? event.note ?? 60, voice = event.voice ?? event.voiceId ?? state.voice ?? 'alto';
    const supplied = event.lyric ?? state.lyric ?? 'ah', lyric = typeof supplied === 'string' && !supplied.trim() ? (typeof state.lyric === 'string' && state.lyric.trim() ? state.lyric : 'ah') : supplied;
    if (!Number.isInteger(pitch) || pitch < MIN_PITCH || pitch > MAX_PITCH) throw new Error('MORSEL notes span C2–C6 (MIDI 36–84).');
    if (!VOICES.includes(voice)) throw new Error('Choose Alto, Tenor, Bass or Robot for this note.');
    if (typeof lyric !== 'string' || !lyric.trim() || lyric.length > 160 || /[\u0000-\u001f\u007f]/.test(lyric)) throw new Error('Enter a word or sound of 1–160 characters for this note.');
    return { pitch, voice, lyric: lyric.trim().replace(/\s+/g, ' ') };
  }
  const wordKey = note => note.voice + '\u0000' + note.lyric;
  const read = (data, index) => { if (index < 0 || index >= data.length - 1) return index >= 0 && index < data.length ? data[index | 0] : 0; const at = index | 0; return data[at] + (data[at + 1] - data[at]) * (index - at); };

  function trimSpeech(raw) {
    const source = raw.left, sampleRate = raw.sampleRate;
    if (!(source instanceof Float32Array) || !source.length || !Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error('The voice returned invalid audio.');
    let peak = 0; for (const value of source) { if (!Number.isFinite(value)) throw new Error('The voice returned invalid audio.'); peak = Math.max(peak, Math.abs(value)); }
    if (peak < .000001) throw new Error('This text did not produce a spoken sound. Try a word or a vowel such as “ah”.');
    const threshold = Math.max(.00001, peak * .0005), padding = Math.ceil(sampleRate * .003);
    let start = 0, end = source.length;
    while (start < end && Math.abs(source[start]) < threshold) start++;
    while (end > start && Math.abs(source[end - 1]) < threshold) end--;
    start = Math.max(0, start - padding); end = Math.min(source.length, end + padding);
    const left = source.slice(start, end), pitchHz = clamp(raw.pitchHz, 40, 1000, frequency(BASE_PITCH));
    return { left, sampleRate, pitchHz, sourceFrames: source.length, trimStart: start, trimEnd: end };
  }

  // The speech source has a fixed measured fundamental. Pitch-synchronous
  // overlap-add moves its glottal pulses without moving the vocal formants.
  // Unvoiced consonants retain their noise rather than acquiring a pitched buzz.
  function analyzeSpeech(audio) {
    const data = audio.left, sr = audio.sampleRate, period = sr / audio.pitchHz, hop = Math.max(16, Math.round(sr * .008));
    const size = Math.max(32, Math.round(period * 3)), masks = new Float32Array(Math.ceil(data.length / hop) + 1);
    let peak = 0; for (const value of data) peak = Math.max(peak, Math.abs(value));
    for (let block = 0; block < masks.length; block++) {
      const center = block * hop, begin = Math.max(0, Math.round(center - size / 2)), end = Math.min(data.length - Math.ceil(period) - 1, begin + size);
      let a = 0, b = 0, cross = 0;
      for (let i = begin; i < end; i++) { const x = data[i], y = read(data, i + period); a += x * x; b += y * y; cross += x * y; }
      const rms = Math.sqrt(a / Math.max(1, end - begin)), correlation = cross / Math.sqrt(a * b + 1e-20);
      masks[block] = rms < peak * .008 ? 0 : clamp((correlation - .26) / .42, 0, 1, 0);
    }
    let bestStart = 0, bestEnd = 0, run = -1;
    for (let i = 0; i <= masks.length; i++) {
      if (i < masks.length && masks[i] > .72) { if (run < 0) run = i; }
      else if (run >= 0) { if (i - run > bestEnd - bestStart) { bestStart = run; bestEnd = i; } run = -1; }
    }
    const holdBegin = Math.min(data.length - 1, Math.round((bestStart + (bestEnd - bestStart) * .25) * hop));
    const holdEnd = Math.min(data.length, Math.round((bestStart + (bestEnd - bestStart) * .75) * hop));
    return { ...audio, period, hop, masks, holdBegin, holdEnd, hasHold: holdEnd - holdBegin >= sr * .015 };
  }
  function sourcePosition(audio, frame, targetLength) {
    const length = audio.left.length;
    if (targetLength <= length || !audio.hasHold) return frame * length / targetLength;
    const extra = targetLength - length, first = audio.holdBegin, last = audio.holdEnd;
    if (frame < first) return frame;
    if (frame < last + extra) return first + (frame - first) * (last - first) / (last - first + extra);
    return frame - extra;
  }
  function fitSpeech(audio, pitch, seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 122) throw new Error('A MORSEL note must be no longer than 120 seconds plus its release.');
    const data = audio.left, sr = audio.sampleRate, length = Math.max(1, Math.round(seconds * sr));
    const targetHz = frequency(pitch), targetPeriod = sr / targetHz, radius = Math.max(8, Math.round(audio.period)), output = new Float32Array(length), weights = new Float32Array(length);
    const search = Math.max(2, Math.round(audio.period * .48));
    // Grains are centred on a strong local glottal peak, preserving phase across
    // vowels even when eSpeak resets phase at a consonant boundary.
    for (let pulse = 0; pulse < length + radius; pulse += targetPeriod) {
      const estimate = sourcePosition(audio, Math.min(length - 1, pulse), length);
      let center = Math.max(0, Math.min(data.length - 1, Math.round(estimate))), maximum = -1;
      const searchStart = Math.max(0, center - search), searchEnd = Math.min(data.length - 1, center + search);
      for (let at = searchStart; at <= searchEnd; at++) {
        const value = data[at]; if (value > maximum) { maximum = value; center = at; }
      }
      const destination = Math.round(pulse);
      for (let offset = -radius; offset <= radius; offset++) {
        const at = destination + offset;
        if (at < 0 || at >= length) continue;
        const weight = .5 + .5 * Math.cos(Math.PI * offset / radius);
        output[at] += read(data, center + offset) * weight; weights[at] += weight;
      }
    }
    let peak = 0;
    for (let frame = 0; frame < length; frame++) {
      const position = sourcePosition(audio, frame, length), voiced = read(audio.masks, position / audio.hop);
      const pitched = output[frame] / Math.max(1, weights[frame]);
      output[frame] = pitched * voiced + read(data, position) * (1 - voiced);
      peak = Math.max(peak, Math.abs(output[frame]));
    }
    // Avoid changing word loudness when low notes need less grain overlap.
    let sourcePower = 0, outputPower = 0;
    for (let i = 0; i < data.length; i++) sourcePower += data[i] * data[i];
    for (let i = 0; i < output.length; i++) outputPower += output[i] * output[i];
    const compensation = Math.min(2, Math.sqrt(sourcePower / Math.max(1, data.length) / (outputPower / length + 1e-20)));
    const gain = Math.min(compensation, peak > 0 ? .92 / peak : 1);
    if (gain !== 1) for (let frame = 0; frame < output.length; frame++) output[frame] *= gain;
    return output;
  }
  function breathBuffer(data, seed) {
    const out = new Float32Array(data.length); let envelope = 0, previous = 0, last = 0, random = seed || 1;
    for (let frame = 0; frame < data.length; frame++) {
      random ^= random << 13; random ^= random >>> 17; random ^= random << 5;
      const noise = (random >>> 0) / 2147483648 - 1;
      envelope += (Math.abs(data[frame]) - envelope) * .015;
      const high = noise - previous + .62 * last; previous = noise; last = high;
      out[frame] = high * envelope * 2;
    }
    return out;
  }
  function encodeWav(pcm, sampleRate = RATE) {
    const bytes = new Uint8Array(44 + pcm.length * 2), view = new DataView(bytes.buffer);
    const word = (at, text) => { for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i); };
    word(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); word(8, 'WAVE'); word(12, 'fmt '); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, 2, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true); word(36, 'data'); view.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) { const value = clamp(pcm[i], -1, 1, 0); view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true); }
    return new Blob([bytes], { type: 'audio/wav' });
  }
  function impulse(context) {
    const length = Math.round(context.sampleRate * 1.25), result = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const out = result.getChannelData(channel); let random = 0x95ba37 + channel * 0x12479, previous = 0;
      for (let i = Math.round(context.sampleRate * (.012 + channel * .002)); i < length; i++) {
        random ^= random << 13; random ^= random >>> 17; random ^= random << 5;
        previous += (((random >>> 0) / 2147483648 - 1) - previous) * .48;
        out[i] = previous * Math.exp(-i / context.sampleRate * 5.3) * .022;
      }
    }
    return result;
  }
  function createGraph(context, state, destination = context.destination) {
    const input = context.createGain(), highpass = context.createBiquadFilter(), tone = context.createBiquadFilter(), master = context.createGain(), wet = context.createGain(), room = context.createConvolver(), analyser = context.createAnalyser();
    highpass.type = 'highpass'; highpass.frequency.value = 24; highpass.Q.value = .707;
    tone.type = 'lowpass'; tone.Q.value = .65; analyser.fftSize = 1024; room.normalize = false; room.buffer = impulse(context);
    input.connect(highpass); highpass.connect(tone); tone.connect(master); tone.connect(room); room.connect(wet); wet.connect(master); master.connect(analyser); analyser.connect(destination);
    const graph = { input, highpass, tone, master, output: master, room, wet, analyser, impulse: room.buffer, destination };
    updateGraph(context, graph, state, true); return graph;
  }
  function assign(param, value, time, immediate) {
    if (immediate || typeof param.setTargetAtTime !== 'function') param.value = value;
    else param.setTargetAtTime(value, time, .012);
  }
  function updateGraph(context, graph, state, immediate = false) {
    assign(graph.master.gain, state.volume, context.currentTime, immediate);
    assign(graph.tone.frequency, Math.min(context.sampleRate * .44, 900 * Math.pow(20, state.tone)), context.currentTime, immediate);
    assign(graph.wet.gain, state.space * .65, context.currentTime, immediate);
  }
  function clearRoom(context, graph) {
    try { graph.tone.disconnect(graph.room); } catch (_) {} try { graph.room.disconnect(); } catch (_) {}
    const room = context.createConvolver(); room.normalize = false; room.buffer = graph.impulse; graph.tone.connect(room); room.connect(graph.wet); graph.room = room;
  }
  function disposeGraph(graph) { if (!graph) return; for (const key of ['input', 'highpass', 'tone', 'master', 'wet', 'room', 'analyser']) try { graph[key]?.disconnect(); } catch (_) {} }

  class MorselAudio {
    constructor(state = {}) {
      this.state = settings(state); this.context = null; this.graph = null; this.output = null; this.retiredGraphs = new Map(); this.words = new Map(); this.pendingWords = new Map(); this.noteCache = new Map(); this.wordBytes = 0; this.noteBytes = 0;
      this.records = new Set(); this.sourceCuts = new Map(); this.preparing = 0; this.generation = 0; this.disposed = false; this._init = null; this._roomTimer = null; this._clock = null;
    }
    setState(value) {
      this.state = settings(copy(value || {}));
      if (this.context && this.graph) {
        updateGraph(this.context, this.graph, this.state);
        for (const record of this.records) {
          assign(record.airGain.gain, this.state.air * .35, this.context.currentTime, false);
          assign(record.vibratoDepth.gain, this.state.vibrato * 38, this.context.currentTime, false);
        }
      }
      return this.state;
    }
    async init() {
      if (this.disposed) throw new Error('This MORSEL instrument has been closed.');
      if (this._init) return this._init;
      this._init = (async () => {
        if (!global.MorselSpeech) throw new Error('MORSEL’s voice synthesis has not loaded.');
        const Constructor = global.AudioContext || global.webkitAudioContext;
        if (!Constructor) throw new Error('This browser does not support Web Audio.');
        if (!this.context || this.context.state === 'closed') this.context = new Constructor({ latencyHint: 'interactive' });
        // Construct the routed context during the initiating user gesture;
        // preparing the offline voice worker may take a moment afterwards.
        if (!this.output) { this.output = this.context.createGain(); this.output.connect(this.context.destination); }
        if (!this.graph) { this.graph = createGraph(this.context, this.state, this.output); this.graph.output = this.output; }
        await global.MorselSpeech.prepare();
        if (this.disposed) throw new DOMException('MORSEL has been closed.', 'AbortError');
        return this;
      })();
      try { return await this._init; } catch (error) { this._init = null; throw error; }
    }
    async _word(note) {
      const key = wordKey(note);
      if (this.words.has(key)) return this.words.get(key);
      if (this.pendingWords.has(key)) return this.pendingWords.get(key);
      const promise = (async () => {
        const raw = await global.MorselSpeech.render(note.lyric, { voice: note.voice, pitch: BASE_PITCH, speed: 170 });
        if (this.disposed) throw new DOMException('MORSEL has been closed.', 'AbortError');
        const audio = analyzeSpeech(trimSpeech(raw)), bytes = audio.left.byteLength + audio.masks.byteLength;
        if (bytes + this.wordBytes > MAX_WORD_BYTES) throw new Error('These words exceed MORSEL’s prepared voice memory. Use a shorter phrase or reopen the instrument.');
        if (!this.disposed) { this.words.set(key, audio); this.wordBytes += bytes; }
        return audio;
      })();
      this.pendingWords.set(key, promise);
      try { return await promise; } finally { this.pendingWords.delete(key); }
    }
    async prepareNotes({ state = this.state, events = [], tempo = state.tempo ?? 96, signal, onProgress } = {}) {
      if (this.disposed) throw new Error('This MORSEL instrument has been closed.');
      abort(signal); if (!global.MorselSpeech) throw new Error('MORSEL’s voice synthesis has not loaded.');
      const snapshot = settings(copy(state)), notes = events.map(event => identity(event, snapshot)), unique = new Map(notes.map(note => [wordKey(note), note]));
      if (unique.size > 64) throw new Error('Use at most 64 different voice-and-word combinations in one MORSEL phrase.');
      if (!Number.isFinite(tempo) || tempo < 2.5 || tempo > 3200) throw new Error('Choose a valid MORSEL preparation tempo.');
      this.preparing++; let completed = 0;
      try {
        await global.MorselSpeech.prepare();
        if (this.disposed) throw new DOMException('MORSEL has been closed.', 'AbortError');
        onProgress?.(0, unique.size);
        for (const note of unique.values()) { abort(signal); await this._word(note); abort(signal); if (this.disposed) throw new DOMException('MORSEL has been closed.', 'AbortError'); onProgress?.(++completed, unique.size); }
        const required = new Map();
        for (let i = 0; i < notes.length; i++) {
          const event = events[i], seconds = event.durationSeconds ?? event.duration * 60 / tempo;
          if (Number.isFinite(seconds) && seconds > 0) {
            if (seconds > 120) throw new Error('A MORSEL note must fit within 120 seconds.');
            const base = this.words.get(wordKey(notes[i])), frames = Math.round((seconds + snapshot.release) * base.sampleRate);
            required.set(wordKey(notes[i]) + '\u0000' + notes[i].pitch + '\u0000' + frames, { note: notes[i], seconds: seconds + snapshot.release, bytes: frames * 4 });
          }
        }
        if ([...required.values()].reduce((bytes, value) => bytes + value.bytes, 0) > MAX_NOTE_BYTES) throw new Error('This word phrase exceeds MORSEL’s 64 MiB prepared-note budget. Shorten or split the phrase.');
        for (const value of required.values()) { abort(signal); this._preparedNote(value.note, value.seconds); }
        return true;
      } finally { this.preparing--; }
    }
    _preparedNote(note, seconds) {
      const base = this.words.get(wordKey(note));
      if (!base) throw new Error('Prepare this word before playing it.');
      const key = wordKey(note) + '\u0000' + note.pitch + '\u0000' + Math.round(seconds * base.sampleRate);
      if (this.noteCache.has(key)) { const value = this.noteCache.get(key); this.noteCache.delete(key); this.noteCache.set(key, value); return value; }
      const left = fitSpeech(base, note.pitch, seconds), value = { left, sampleRate: base.sampleRate, key };
      if (left.byteLength <= MAX_NOTE_BYTES) {
        while (this.noteBytes + left.byteLength > MAX_NOTE_BYTES && this.noteCache.size) { const oldest = this.noteCache.keys().next().value; this.noteBytes -= this.noteCache.get(oldest).left.byteLength; this.noteCache.delete(oldest); }
        this.noteCache.set(key, value); this.noteBytes += left.byteLength;
      }
      return value;
    }
    _schedule(context, graph, records, event, state) {
      const note = identity(event, state), at = Math.max(context.currentTime, event.when ?? context.currentTime), duration = event.durationSeconds ?? .8;
      if (!Number.isFinite(at) || at < 0 || !Number.isFinite(duration) || duration <= 0 || duration > 120) throw new Error('Choose a finite note time and a duration up to 120 seconds.');
      const velocity = event.velocity ?? .8;
      if (!Number.isFinite(velocity) || velocity < 0 || velocity > 1) throw new Error('Choose a velocity from zero to one.');
      if (!velocity) return true;
      const prepared = this._preparedNote(note, duration + state.release), source = context.createBufferSource(), air = context.createBufferSource(), bus = context.createGain(), airGain = context.createGain(), vibrato = context.createOscillator(), vibratoDepth = context.createGain();
      const buffer = context.createBuffer(1, prepared.left.length, prepared.sampleRate); buffer.getChannelData(0).set(prepared.left); source.buffer = buffer;
      const noise = context.createBuffer(1, prepared.left.length, prepared.sampleRate); noise.getChannelData(0).set(breathBuffer(prepared.left, hash(prepared.key))); air.buffer = noise;
      airGain.gain.value = state.air * .35; air.connect(airGain); airGain.connect(bus); source.connect(bus); bus.connect(graph.input);
      vibrato.type = 'sine'; vibrato.frequency.value = 5.2; vibratoDepth.gain.value = state.vibrato * 38; vibrato.connect(vibratoDepth); vibratoDepth.connect(source.detune);
      const attack = Math.min(state.attack, duration * .4), end = at + duration + state.release, gain = velocity * .9;
      bus.gain.setValueAtTime(0, at); bus.gain.linearRampToValueAtTime(gain, at + attack); bus.gain.setValueAtTime(gain, at + duration); bus.gain.linearRampToValueAtTime(0, end);
      const record = { source, air, bus, airGain, vibrato, vibratoDepth, scope: event.source ?? 'morsel', start: at, gate: at + duration, end, attack, gain, stopped: false, cancelledAt: undefined, cancelEnd: undefined };
      records.add(record);
      const cleanup = () => { if (record.cleaned) return; record.cleaned = true; records.delete(record); for (const node of [source, air, bus, airGain, vibrato, vibratoDepth]) try { node.disconnect(); } catch (_) {} };
      record.cleanup = cleanup; source.onended = cleanup;
      source.start(at); air.start(at); vibrato.start(at); source.stop(end + .001); air.stop(end + .001); vibrato.stop(end + .001);
      return record;
    }
    scheduleNote(event = {}) {
      if (!this.context || !this.graph || this.context.state === 'closed') throw new Error('Prepare MORSEL before scheduling notes.');
      const scope = event.source ?? 'morsel';
      if (typeof scope !== 'string' || !scope || scope.length > 200) throw new Error('Choose a valid note source.');
      const when = event.when ?? this.context.currentTime;
      if (!Number.isFinite(when) || when < 0) throw new Error('Choose a valid note timestamp.');
      for (const key of [scope, '*']) { const cut = this.sourceCuts.get(key); if (Number.isFinite(cut) && this.context.currentTime < cut && when >= cut) return false; }
      if (this.records.size >= 32) {
        const oldest = [...this.records].sort((a, b) => a.start - b.start)[0]; this._cancel(oldest, this.context.currentTime, true);
      }
      return this._schedule(this.context, this.graph, this.records, { ...event, source: scope }, this.state);
    }
    _cancel(record, when, hard = false) {
      if (record.cleaned || record.cancelledAt !== undefined && record.cancelledAt <= when && !hard) return;
      const at = Math.max(this.context.currentTime, when), end = hard || record.start >= at ? at : at + .008;
      let gain = record.gain;
      if (at < record.start) gain = 0;
      else if (at < record.start + record.attack) gain *= (at - record.start) / record.attack;
      else if (at > record.gate) gain *= Math.max(0, (record.end - at) / Math.max(.001, record.end - record.gate));
      const param = record.bus.gain;
      if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(at);
      else { param.cancelScheduledValues(at); param.setValueAtTime(gain, at); }
      if (end === at) param.setValueAtTime(0, at); else param.linearRampToValueAtTime(0, end);
      record.cancelledAt = at; record.cancelEnd = end;
      for (const node of [record.source, record.air, record.vibrato]) try { node.stop(end + (hard ? 0 : .001)); } catch (_) {}
      if (hard && at <= this.context.currentTime) record.cleanup();
    }
    stopNotes({ source, when } = {}) {
      if (!this.context) return;
      if (source !== undefined && (typeof source !== 'string' || !source || source.length > 200)) throw new Error('Choose a valid cancellation source.');
      const at = when === undefined ? this.context.currentTime : when;
      if (!Number.isFinite(at) || at < 0) throw new Error('Choose a valid cancellation timestamp.');
      if (at > this.context.currentTime) this.sourceCuts.set(source ?? '*', at); else if (source === undefined) this.sourceCuts.clear(); else this.sourceCuts.delete(source);
      for (const record of [...this.records]) if (source === undefined || record.scope === source) this._cancel(record, at);
    }
    async preview(event = {}) {
      abort(event.signal);
      const generation = this.generation, snapshot = copy(this.state), note = identity(event, snapshot);
      await this.init(); abort(event.signal);
      if (generation !== this.generation || this.disposed) return false;
      await this.prepareNotes({ state: snapshot, events: [{ ...note, durationSeconds: event.durationSeconds ?? .8 }], signal: event.signal });
      abort(event.signal);
      if (generation !== this.generation || this.disposed) return false;
      if (this.context.state === 'suspended') await this.context.resume();
      abort(event.signal);
      if (generation !== this.generation || this.disposed) return false;
      return this.scheduleNote({ ...event, ...note, when: this.context.currentTime + .005, source: event.source ?? 'morsel-preview' });
    }
    followTransport(clock = {}) {
      if (!clock || this.disposed || !this.context || this.context.state === 'closed' || !this.graph) return;
      const previous = this._clock; this._clock = { ...previous, ...clock };
      const time = clock.audioTime ?? clock.when ?? clock.time ?? this.context.currentTime;
      const reset = previous && Number.isFinite(clock.revision) && clock.revision !== previous.revision || clock.playing === false && previous?.playing !== false;
      if (!reset) return;
      const at = Math.max(this.context.currentTime, Number.isFinite(time) ? time : this.context.currentTime);
      // A cancelled source must not refill the freshly cleared room during its
      // short release. Independent sources and normal scoped cancellation remain.
      for (const record of this.records) if (record.cancelledAt !== undefined && record.cancelledAt <= at && record.cancelEnd > at) this._cancel(record, at, true);
      clearTimeout(this._roomTimer);
      if (at <= this.context.currentTime + .001) this._clearPerformanceHistory();
      else this._roomTimer = setTimeout(() => { if (!this.disposed && this.context && this.graph) this._clearPerformanceHistory(); }, Math.max(0, (at - this.context.currentTime) * 1000));
    }
    _clearPerformanceHistory() {
      const old = this.graph;
      this.graph = createGraph(this.context, this.state, this.output); this.graph.output = this.output;
      for (const record of this.records) {
        try { record.bus.disconnect(old.input); } catch (_) {}
        record.bus.connect(this.graph.input);
      }
      disposeGraph(old);
    }
    stop() {
      if (this.disposed) return false;
      this.generation++; clearTimeout(this._roomTimer);
      if (this.context?.state === 'closed') { this._cleanupAudio(); return false; }
      this.stopNotes();
      if (!this.context || !this.graph) return;
      // Let the old performance fade through its own room, while a fresh graph
      // is immediately ready for a new audition. Old fades cannot refill it.
      const old = this.graph, now = this.context.currentTime;
      if (typeof old.master.gain.cancelAndHoldAtTime === 'function') old.master.gain.cancelAndHoldAtTime(now);
      else { old.master.gain.cancelScheduledValues(now); old.master.gain.setValueAtTime(old.master.gain.value, now); }
      old.master.gain.linearRampToValueAtTime(0, now + .008);
      this.graph = createGraph(this.context, this.state, this.output); this.graph.output = this.output;
      const timer = setTimeout(() => { disposeGraph(old); this.retiredGraphs.delete(old); }, 24);
      this.retiredGraphs.set(old, timer);
    }
    panic() {
      if (this.disposed) return false;
      this.generation++; clearTimeout(this._roomTimer); this.sourceCuts.clear();
      if (this.context?.state === 'closed') { this._cleanupAudio(); return false; }
      if (this.context) for (const record of [...this.records]) this._cancel(record, this.context.currentTime, true);
      for (const [graph, timer] of this.retiredGraphs) { clearTimeout(timer); disposeGraph(graph); } this.retiredGraphs.clear();
      if (this.context && this.graph) { const previous = this.graph; this.graph = createGraph(this.context, this.state, this.output); this.graph.output = this.output; disposeGraph(previous); }
    }
    getMeters() {
      let peak = 0, power = 0;
      if (this.graph?.analyser) { const samples = new Float32Array(this.graph.analyser.fftSize); this.graph.analyser.getFloatTimeDomainData(samples); for (const value of samples) { peak = Math.max(peak, Math.abs(value)); power += value * value; } power = Math.sqrt(power / samples.length); }
      return { peak, rms: power, activeVoices: this.records.size, readyWords: this.words.size, preparing: this.preparing };
    }
    async renderNotes({ state = this.state, events = [], tempo = state.tempo ?? 96, lengthBeats = 4, tailSeconds = 0, signal, onProgress, includePCM = true } = {}) {
      abort(signal); const snapshot = settings(copy(state)), sourceEvents = copy(events);
      if (!Number.isFinite(tempo) || tempo < 2.5 || tempo > 3200 || !Number.isFinite(lengthBeats) || lengthBeats <= 0 || !Number.isFinite(tailSeconds) || tailSeconds < 0 || tailSeconds > 30) throw new Error('Choose a valid MORSEL phrase length, tempo and tail.');
      const seconds = lengthBeats * 60 / tempo + tailSeconds;
      if (seconds > 120) throw new Error('Split MORSEL prints into parts no longer than 120 seconds including their tail.');
      await this.prepareNotes({ state: snapshot, events: sourceEvents, tempo, signal, onProgress }); abort(signal);
      const Constructor = global.OfflineAudioContext || global.webkitOfflineAudioContext;
      if (!Constructor) throw new Error('This browser does not support offline audio rendering.');
      const context = new Constructor(2, Math.max(1, Math.round(seconds * RATE)), RATE), graph = createGraph(context, snapshot), records = new Set();
      try {
        for (const event of sourceEvents) {
          abort(signal); if (event.velocity === 0 || event.probability === 0) continue;
          const beat = event.beat ?? event.startBeat ?? 0, duration = event.duration ?? event.durationBeats;
          if (!Number.isFinite(beat) || beat < 0 || beat >= lengthBeats || !Number.isFinite(duration) || duration <= 0) throw new Error('A MORSEL event has invalid timing.');
          this._schedule(context, graph, records, { ...event, when: beat * 60 / tempo, durationSeconds: Math.min(duration, lengthBeats - beat) * 60 / tempo, source: 'morsel-render' }, snapshot);
        }
        const rendered = await context.startRendering(); abort(signal);
        const left = rendered.getChannelData(0), right = rendered.getChannelData(1), pcm = new Float32Array(rendered.length * 2);
        for (let i = 0; i < left.length; i++) { pcm[i * 2] = left[i]; pcm[i * 2 + 1] = right[i]; }
        const result = { pcm, sampleRate: RATE, duration: rendered.length / RATE, blob: encodeWav(pcm, RATE) };
        return includePCM ? result : { blob: result.blob, sampleRate: RATE, duration: result.duration };
      } finally { for (const record of records) record.cleanup(); disposeGraph(graph); }
    }
    _cleanupAudio() {
      clearTimeout(this._roomTimer); this._roomTimer = null; this.sourceCuts.clear();
      let now = 0; try { now = this.context?.currentTime || 0; } catch (_) {}
      for (const record of [...this.records]) {
        for (const node of [record.source, record.air, record.vibrato]) try { node.stop(now); } catch (_) {}
        record.cleanup();
      }
      this.records.clear();
      for (const [graph, timer] of this.retiredGraphs) { clearTimeout(timer); disposeGraph(graph); } this.retiredGraphs.clear();
      disposeGraph(this.graph); this.graph = null;
      try { this.output?.disconnect(); } catch (_) {} this.output = null;
    }
    async dispose() {
      if (this.disposed) return;
      // Host teardown can invalidate its context facade before pagehide. This
      // path only releases existing resources; it must never create a graph.
      this.disposed = true; this.generation++; this._cleanupAudio();
      const context = this.context; this.context = null;
      this.words.clear(); this.pendingWords.clear(); this.noteCache.clear(); this.wordBytes = this.noteBytes = 0;
      if (context) try { await context.close(); } catch (_) { /* Already closed or unloaded. */ }
    }
  }
  global.MorselAudioDSP = Object.freeze({ settings, identity, frequency, trimSpeech, analyzeSpeech, fitSpeech, breathBuffer, encodeWav, MIN_PITCH, MAX_PITCH });
  global.MorselAudio = MorselAudio;
})(typeof window === 'object' ? window : globalThis);
