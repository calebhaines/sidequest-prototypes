/* MORSEL — routed, deterministic pitched words for live notes and native prints. */
(function (global) {
  'use strict';
  const VOICES = ['alto', 'tenor', 'bass', 'robot'], RATE = 48000, MIN_PITCH = 36, MAX_PITCH = 84;
  const MAX_WORD_BYTES = 64 * 1024 * 1024, MAX_NOTE_BYTES = 64 * 1024 * 1024;
  const copy = value => JSON.parse(JSON.stringify(value));
  const clamp = (value, min, max, fallback = min) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  const abort = signal => { if (signal?.aborted) throw new DOMException('MORSEL rendering cancelled.', 'AbortError'); };
  const frequency = pitch => 440 * Math.pow(2, (pitch - 69) / 12);
  const hash = text => { let value = 2166136261; for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619); return value >>> 0; };
  function settings(value = {}) {
    return { ...value, voice: VOICES.includes(value.voice) ? value.voice : 'alto', lyric: typeof value.lyric === 'string' ? value.lyric : 'ah',
      tone: clamp(value.tone, 0, 1, .75), air: clamp(value.air, 0, 1, .03), vibrato: clamp(value.vibrato, 0, 1, .02), space: clamp(value.space, 0, 1, .12),
      volume: clamp(value.volume, 0, 1, .65), attack: clamp(value.attack, .001, .5, .008), release: clamp(value.release, .005, 2, .09) };
  }
  function identity(event = {}, state = {}) {
    const pitch = event.pitch ?? event.note ?? 60, voice = event.voice ?? event.voiceId ?? state.voice ?? 'alto';
    const supplied = event.lyric ?? state.lyric ?? 'ah', lyric = typeof supplied === 'string' && !supplied.trim() ? (typeof state.lyric === 'string' && state.lyric.trim() ? state.lyric : 'ah') : supplied;
    if (!Number.isInteger(pitch) || pitch < MIN_PITCH || pitch > MAX_PITCH) throw new Error('MORSEL notes span C2–C6 (MIDI 36–84).');
    if (!VOICES.includes(voice)) throw new Error('Choose one of MORSEL’s four voices for this note.');
    if (typeof lyric !== 'string' || !lyric.trim() || lyric.length > 160 || /[\u0000-\u001f\u007f]/.test(lyric)) throw new Error('Enter a word or sound of 1–160 characters for this note.');
    return { pitch, voice, lyric: lyric.trim().replace(/\s+/g, ' ') };
  }
  const wordKey = note => note.voice + '\u0000' + note.lyric;
  const read = (data, index) => { if (index < 0 || index >= data.length - 1) return index >= 0 && index < data.length ? data[index | 0] : 0; const at = index | 0; return data[at] + (data[at + 1] - data[at]) * (index - at); };

  function trimSpeech(raw) {
    const original = raw.left, sampleRate = raw.sampleRate;
    const source = original instanceof Float32Array ? new Float32Array(original.length) : original;
    if (original instanceof Float32Array) { let previous = 0, filtered = 0; const decay = Math.exp(-2 * Math.PI * 16 / sampleRate); for (let i = 0; i < original.length; i++) { filtered = original[i] - previous + decay * filtered; previous = original[i]; source[i] = filtered; } }
    if (!(source instanceof Float32Array) || !source.length || !Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error('The voice returned invalid audio.');
    let peak = 0; for (const value of source) { if (!Number.isFinite(value)) throw new Error('The voice returned invalid audio.'); peak = Math.max(peak, Math.abs(value)); }
    if (peak < .000001) throw new Error('This text did not produce a spoken sound. Try a word or a vowel such as “ah”.');
    const threshold = Math.max(.00001, peak * .0005), padding = Math.ceil(sampleRate * .003), window = Math.max(1, Math.round(sampleRate * .01));
    const powers = new Float64Array(Math.ceil(source.length / window)); let maximumPower = 0;
    for (let block = 0; block < powers.length; block++) { const from = block * window, to = Math.min(source.length, from + window); let power = 0; for (let frame = from; frame < to; frame++) power += source[frame] * source[frame]; powers[block] = power / Math.max(1, to - from); maximumPower = Math.max(maximumPower, powers[block]); }
    // Neural decoders can leave a tiny initial impulse followed by almost a
    // second of inaudible residue. Align real speech energy, retaining 40 ms
    // before it for quiet fricatives, aspiration and consonant attacks.
    // A 3% RMS floor also excludes the quiet decoder island that precedes
    // some Tenor/Bass words, separated from speech by a near-silent gap.
    const floor = Math.max(1e-10, maximumPower * .0009); let first = 0;
    while (first < powers.length - 1 && powers[first] < floor) first++;
    let start = Math.max(0, first * window - Math.ceil(sampleRate * .04)), end = source.length;
    while (end > start && Math.abs(source[end - 1]) < threshold) end--;
    end = Math.min(source.length, end + padding);
    const left = source.slice(start, end), pitchHz = clamp(raw.pitchHz, 40, 1000, 180);
    return { left, sampleRate, pitchHz, lyric: raw.text || '', sourceFrames: source.length, trimStart: start, trimEnd: end };
  }

  // Natural speech keeps its intonation. Track voiced frames to move the
  // speaker's median register onto a musical note, without flattening it.
  function analyzeSpeech(audio) {
    const data = audio.left, sr = audio.sampleRate, hop = Math.max(64, Math.round(sr * .02));
    const size = Math.max(64, Math.min(Math.round(sr * .04), Math.floor(data.length * .55))), minimum = Math.max(3, Math.floor(sr / 1300)), maximum = Math.min(Math.round(sr / 45), size - 2, data.length - size - 1);
    let peak = 0; for (const value of data) peak = Math.max(peak, Math.abs(value));
    const voicedFrames = [], masks = new Float32Array(Math.ceil(data.length / hop) + 1);
    for (let center = Math.round(size / 2); center + size / 2 + maximum < data.length; center += hop) {
      const begin = Math.round(center - size / 2); let power = 0;
      for (let i = 0; i < size; i++) power += data[begin + i] * data[begin + i];
      const energy = Math.sqrt(power / size); if (energy < Math.max(.0015, peak * .012)) continue;
      const differences = new Float64Array(maximum + 1); let cumulative = 0;
      for (let lag = 1; lag <= maximum; lag++) {
        let difference = 0;
        for (let i = 0; i < size; i++) { const delta = data[begin + i] - data[begin + i + lag]; difference += delta * delta; }
        cumulative += difference; differences[lag] = cumulative > 1e-16 ? difference * lag / cumulative : 1;
      }
      let best = minimum;
      while (best < maximum - 1) {
        if (differences[best] < .16) { while (best < maximum - 1 && differences[best + 1] < differences[best]) best++; break; }
        best++;
      }
      if (best >= maximum - 1) { best = minimum; for (let lag = minimum + 1; lag < maximum; lag++) if (differences[lag] < differences[best]) best = lag; }
      if (differences[best] > .3 || best <= minimum || best >= maximum) continue;
      const left = differences[best - 1], middle = differences[best], right = differences[best + 1], denominator = left - 2 * middle + right;
      const correction = denominator ? clamp(.5 * (left - right) / denominator, -.5, .5, 0) : 0;
      const hz = sr / (best + correction), confidence = 1 - middle;
      voicedFrames.push({ frame: center, hz, confidence, energy }); masks[Math.round(center / hop)] = confidence;
    }
    const vowel = ['ah', 'ee', 'oo', 'oh', 'mm'].includes((audio.lyric || '').trim().toLowerCase());
    if (!voicedFrames.length && vowel && data.length < sr * .24) {
      const firstLag = Math.max(3, Math.floor(sr / 600)), lastLag = Math.min(Math.ceil(sr / 65), Math.floor(data.length / 2)), count = data.length - lastLag;
      const values = []; let best = -1, confidence = 0;
      for (let lag = firstLag; lag <= lastLag; lag++) {
        let cross = 0, a = 0, b = 0;
        for (let i = 0; i < count; i++) { const x = data[i], y = data[i + lag]; cross += x * y; a += x * x; b += y * y; }
        values.push(cross / Math.sqrt(a * b + 1e-20));
      }
      for (let i = 1; i < values.length - 1; i++) if (values[i] > .72 && values[i] >= values[i - 1] && values[i] > values[i + 1]) { best = i; confidence = values[i]; break; }
      if (best >= 0) {
        const a = values[best - 1], b = values[best], c = values[best + 1], denominator = a - 2 * b + c, shift = denominator ? clamp(.5 * (a - c) / denominator, -.5, .5, 0) : 0;
        let power = 0; for (const value of data) power += value * value;
        voicedFrames.push({ frame: Math.round(data.length / 2), hz: sr / (firstLag + best + shift), confidence, energy: Math.sqrt(power / data.length) });
      }
    }
    if (vowel && !audio.vowelCoreTrimmed && voicedFrames.length) {
      const reliable = voicedFrames.filter(frame => frame.confidence > .65), maximumEnergy = reliable.reduce((value, frame) => Math.max(value, frame.energy), 0);
      const active = reliable.filter(frame => frame.energy >= maximumEnergy * .25);
      if (active.length) {
        const begin = Math.max(0, Math.round(active[0].frame - size * .5 - sr * .005)), end = Math.min(data.length, Math.round(active[active.length - 1].frame + size * .5 + sr * .008));
        if (end > begin && (begin > sr * .005 || data.length - end > sr * .02)) {
          // Exact vowel/hum aliases should sound on the note, rather than
          // spending most of it on a decoder's breath/quiet prefix. Real words
          // never take this path: their consonants retain the phonetic prepad.
          const left = data.slice(begin, end), fade = Math.min(Math.round(sr * .003), Math.floor(left.length / 8));
          for (let frame = 0; frame < fade; frame++) { const gain = .5 - .5 * Math.cos(Math.PI * (frame + 1) / fade); left[frame] *= gain; left[left.length - 1 - frame] *= gain; }
          return analyzeSpeech({ ...audio, left, vowelCoreTrimmed: true, vowelCoreStartFrame: begin, pitchHz: audio.pitchHz });
        }
      }
    }
    const ordered = voicedFrames.slice().sort((a, b) => a.hz - b.hz), weight = ordered.reduce((sum, frame) => sum + frame.energy * frame.confidence, 0);
    let total = 0, median = Number.isFinite(audio.pitchHz) && audio.pitchHz > 0 ? audio.pitchHz : 180;
    for (const frame of ordered) { total += frame.energy * frame.confidence; if (total >= weight / 2) { median = frame.hz; break; } }
    // A high-energy voiced centre is a safer sustain region than the old
    // longest periodic run, which frequently selected a quiet final nasal.
    let strongest = null;
    for (const frame of voicedFrames) if (frame.frame > Math.min(sr * .04, data.length * .2) && frame.frame < data.length - Math.min(sr * .04, data.length * .2) && (!strongest || frame.energy * frame.confidence > strongest.energy * strongest.confidence)) strongest = frame;
    const holdBegin = strongest ? Math.max(0, Math.round(strongest.frame - sr * .04)) : 0;
    const holdEnd = strongest ? Math.min(data.length, Math.round(strongest.frame + sr * .04)) : 0;
    const pitchConfidence = weight > 0 ? voicedFrames.reduce((sum, frame) => sum + frame.confidence, 0) / voicedFrames.length : 0;
    if (vowel && !audio.sustainSeeded && data.length < sr * .24 && pitchConfidence > .6) {
      // Very short neural vowel/hum tokens contain only a handful of glottal
      // cycles. Extend complete source-pitch cycles before any pitch shift,
      // rather than asking an FFT window to stretch 40 ms into a whole note.
      const period = sr / median, cycles = Math.max(1, Math.min(3, Math.floor(data.length * .45 / period))), loopLength = Math.max(8, Math.round(period * cycles));
      const half = Math.round(data.length * .5); let centre = half, maximum = -Infinity;
      for (let i = Math.max(loopLength, Math.round(half - period / 2)); i < Math.min(data.length - loopLength, half + period / 2); i++) if (data[i] > maximum) { maximum = data[i]; centre = i; }
      const begin = Math.max(Math.ceil(period * .3), Math.min(data.length - loopLength - 1, centre - Math.round(loopLength / 2))), end = begin + loopLength;
      if (begin >= 0 && end < data.length) {
        const crossfade = Math.max(2, Math.min(begin, Math.round(period * .35))), loop = data.slice(begin, end);
        for (let i = loopLength - crossfade; i < loopLength; i++) { const mix = (i - loopLength + crossfade + 1) / crossfade; loop[i] = loop[i] * (1 - mix) + data[begin + i - loopLength] * mix; }
        const repeats = Math.max(2, Math.ceil((sr * .34 - data.length) / loopLength) + 1), left = new Float32Array(data.length + (repeats - 1) * loopLength);
        left.set(data.subarray(0, begin)); for (let repetition = 0; repetition < repeats; repetition++) left.set(loop, begin + repetition * loopLength);
        const suffix = begin + repeats * loopLength; left.set(data.subarray(end), suffix);
        for (let i = 0; i < Math.min(crossfade, data.length - end); i++) { const mix = (i + 1) / crossfade; left[suffix + i] = loop[i] * (1 - mix) + data[end + i] * mix; }
        return analyzeSpeech({ ...audio, left, sustainSeeded: true, originalFrames: audio.originalFrames || data.length, pitchHz: median });
      }
    }
    return { ...audio, pitchHz: median, pitchConfidence, voicedFrames, masks, hop, holdBegin, holdEnd, hasHold: holdEnd - holdBegin >= sr * .04 };
  }

  function waitFor(promise, signal) {
    abort(signal); if (!signal) return promise;
    return new Promise((resolve, reject) => {
      const cancel = () => { cleanup(); reject(new DOMException('Vocal preparation cancelled.', 'AbortError')); };
      const cleanup = () => signal.removeEventListener('abort', cancel);
      signal.addEventListener('abort', cancel, { once: true });
      promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    });
  }

  function runStretchWorker(createModule) {
    'use strict';
    let module;
    const ready = createModule().then(value => { module = value; module._main(); self.postMessage({ ready: true }); });
    const bounded = (value, low, high) => Math.max(low, Math.min(high, value));
    function fit(audio, pitch, seconds) {
      const data = audio.left, sr = audio.sampleRate, length = Math.max(1, Math.round(seconds * sr));
      const extended = audio.hasHold && length > data.length * 1.6, cadence = extended ? 1.25 : length / data.length;
      const extra = extended ? length - data.length * cadence : 0, first = audio.holdBegin * cadence, last = audio.holdEnd * cadence, span = audio.holdEnd - audio.holdBegin;
      function position(frame) {
        if (!extended) return frame / cadence;
        if (frame < first) return frame / cadence;
        if (frame < last + extra) return audio.holdBegin + (frame - first) * span / (last - first + extra);
        return (frame - extra) / cadence;
      }
      // Duration changes alter how long each part of a natural pitch contour
      // is heard. Weight the median accordingly so held vowels stay on-register.
      const frames = (audio.voicedFrames || []).map(frame => ({ hz: frame.hz, weight: frame.energy * frame.confidence *
        (extended && frame.frame >= audio.holdBegin && frame.frame <= audio.holdEnd ? cadence + extra / span : cadence) })).sort((a, b) => a.hz - b.hz);
      let sum = 0, median = audio.pitchHz; const half = frames.reduce((value, frame) => value + frame.weight, 0) / 2;
      for (const frame of frames) { sum += frame.weight; if (sum >= half) { median = frame.hz; break; } }
      const targetHz = 440 * Math.pow(2, (pitch - 69) / 12), semitones = audio.pitchConfidence > .45 ? 12 * Math.log2(targetHz / median) : 0;
      if (Math.abs(semitones) < .015 && length === data.length) return data.slice();
      module._presetDefault(1, sr); module._reset();
      module._setTransposeSemitones(semitones, Math.min(8000, sr * .45) / sr);
      module._setFormantSemitones(0, true); module._setFormantBase(median / sr);
      const inputLatency = module._inputLatency(), outputLatency = module._outputLatency(), window = inputLatency + outputLatency, block = 128;
      const pointer = module._setBuffers(1, window), memory = module.HEAP8.buffer;
      const input = new Float32Array(memory, pointer, window), output = new Float32Array(memory, pointer + window * 4, window), result = new Float32Array(length);
      for (let at = 0; at < length; at += block) {
        const outFrame = at + outputLatency, sourceCenter = position(outFrame), speed = bounded((position(outFrame + block) - sourceCenter) / block, .005, 32);
        const end = Math.round(sourceCenter + inputLatency), begin = end - window;
        input.fill(0);
        const copyStart = Math.max(0, begin), copyEnd = Math.min(data.length, end);
        if (copyEnd > copyStart) input.set(data.subarray(copyStart, copyEnd), copyStart - begin);
        module._seek(window, speed); const count = Math.min(block, length - at); module._process(0, count);
        result.set(output.subarray(0, count), at);
      }
      let rawPower = 0, power = 0, peak = 0;
      for (const value of data) rawPower += value * value;
      for (const value of result) { if (!Number.isFinite(value)) throw new Error('The vocal processor returned invalid audio.'); power += value * value; peak = Math.max(peak, Math.abs(value)); }
      const compensation = Math.min(1.6, Math.sqrt(rawPower / Math.max(1, data.length) / (power / length + 1e-20))), gain = Math.min(compensation, peak > 0 ? .94 / peak : 1);
      if (gain !== 1) for (let frame = 0; frame < length; frame++) result[frame] *= gain;
      return result;
    }
    self.onmessage = async event => {
      const job = event.data;
      try {
        await ready;
        if (job.kind === 'analyze') { const audio = analyzeSpeech(job.audio); self.postMessage({ id: job.id, audio }, [audio.left.buffer, audio.masks.buffer]); }
        else { const left = fit(job.audio, job.pitch, job.seconds); self.postMessage({ id: job.id, left }, [left.buffer]); }
      }
      catch (error) { self.postMessage({ id: job.id, error: error?.message || String(error) }); }
    };
    ready.catch(error => self.postMessage({ failed: error?.message || String(error) }));
  }

  class StretchPreparer {
    constructor() { this.worker = null; this.ready = null; this.pending = new Map(); this.ordinal = 0; this.disposed = false; this.boot = null; }
    prepare() {
      if (this.disposed) return Promise.reject(new DOMException('Vocal preparation cancelled.', 'AbortError'));
      if (this.ready) return this.ready;
      const source = global.MorselStretchAssets?.core;
      if (typeof source !== 'string') return Promise.reject(new Error('MORSEL’s vocal processor has not loaded. Reopen the complete instrument HTML.'));
      this.ready = new Promise((resolve, reject) => {
        let url;
        try {
          url = URL.createObjectURL(new Blob([source + '\nconst clamp=' + clamp.toString() + ';\nconst analyzeSpeech=' + analyzeSpeech.toString() + ';\n(' + runStretchWorker.toString() + ')(SignalsmithStretch);'], { type: 'application/javascript' }));
          this.worker = new global.Worker(url); this.boot = { reject, url, timer: setTimeout(() => this.close(new Error('The vocal processor took too long to prepare. Reopen MORSEL.')), 30000) };
          this.worker.onmessage = event => {
            const message = event.data;
            if (message.ready) { clearTimeout(this.boot.timer); URL.revokeObjectURL(this.boot.url); this.boot = null; resolve(); return; }
            if (message.failed) { this.close(new Error(message.failed)); return; }
            const job = this.pending.get(message.id); if (!job) return;
            this.pending.delete(message.id); job.cleanup();
            if (message.error) job.reject(new Error(message.error));
            else if (message.audio?.left instanceof Float32Array && message.audio.masks instanceof Float32Array) job.resolve(message.audio);
            else if (message.left instanceof Float32Array) job.resolve(message.left);
            else job.reject(new Error('The vocal processor returned invalid audio.'));
          };
          this.worker.onerror = event => this.close(new Error(event.message || 'MORSEL could not prepare its vocal processor.'));
        } catch (error) { if (url) URL.revokeObjectURL(url); this.close(error); reject(error); }
      });
      this.ready.catch(() => { if (!this.disposed) this.ready = null; }); return this.ready;
    }
    async analyze(audio) {
      await this.prepare(); if (this.disposed) throw new DOMException('Vocal preparation cancelled.', 'AbortError');
      return new Promise((resolve, reject) => {
        const id = ++this.ordinal, left = audio.left.slice();
        this.pending.set(id, { resolve, reject, cleanup() {} });
        this.worker.postMessage({ id, kind: 'analyze', audio: { ...audio, left } }, [left.buffer]);
      });
    }
    async fit(audio, pitch, seconds, signal) {
      abort(signal); if (!Number.isInteger(pitch) || pitch < MIN_PITCH || pitch > MAX_PITCH) throw new Error('MORSEL notes span C2–C6 (MIDI 36–84).'); if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 122) throw new Error('A MORSEL note must be no longer than 120 seconds plus its release.');
      await this.prepare(); abort(signal); if (this.disposed) throw new DOMException('Vocal preparation cancelled.', 'AbortError');
      return new Promise((resolve, reject) => {
        const id = ++this.ordinal, cancel = () => { this.pending.delete(id); reject(new DOMException('Vocal preparation cancelled.', 'AbortError')); };
        const cleanup = () => signal?.removeEventListener('abort', cancel);
        this.pending.set(id, { resolve, reject, cleanup }); signal?.addEventListener('abort', cancel, { once: true });
        const left = audio.left.slice(), snapshot = { left, sampleRate: audio.sampleRate, pitchHz: audio.pitchHz, pitchConfidence: audio.pitchConfidence,
          voicedFrames: audio.voicedFrames, holdBegin: audio.holdBegin, holdEnd: audio.holdEnd, hasHold: audio.hasHold };
        this.worker.postMessage({ id, audio: snapshot, pitch, seconds }, [left.buffer]);
      });
    }
    close(error = new DOMException('Vocal preparation cancelled.', 'AbortError')) {
      if (this.boot) { clearTimeout(this.boot.timer); URL.revokeObjectURL(this.boot.url); this.boot.reject(error); this.boot = null; }
      if (this.worker) { this.worker.onmessage = this.worker.onerror = null; this.worker.terminate(); } this.worker = null;
      for (const job of this.pending.values()) { job.cleanup(); job.reject(error); } this.pending.clear(); this.ready = null;
    }
    dispose() { if (this.disposed) return; this.disposed = true; this.close(); }
  }
  let diagnosticStretch;
  async function fitSpeech(audio, pitch, seconds, options = {}) { return (diagnosticStretch ||= new StretchPreparer()).fit(audio, pitch, seconds, options.signal); }
  function disposeDiagnostics() { diagnosticStretch?.dispose(); diagnosticStretch = null; }
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
      this.stretch = new StretchPreparer(); this.pendingNotes = new Map(); this.reservedNoteBytes = 0; this.records = new Set(); this.sourceCuts = new Map(); this.preparing = 0; this.generation = 0; this.disposed = false; this._init = null; this._roomTimer = null; this._clock = null;
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
        const raw = await global.MorselSpeech.render(note.lyric, { voice: note.voice });
        if (this.disposed) throw new DOMException('MORSEL has been closed.', 'AbortError');
        const audio = await this.stretch.analyze(trimSpeech({ ...raw, text: note.lyric })), bytes = audio.left.byteLength + audio.masks.byteLength + audio.voicedFrames.length * 32;
        if (this.disposed) throw new DOMException('MORSEL has been closed.', 'AbortError');
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
        const additions = [...required].reduce((bytes, [key, value]) => bytes + (this.noteCache.has(key) || this.pendingNotes.has(key) ? 0 : value.bytes), 0);
        if (this.noteBytes + this.reservedNoteBytes + additions > MAX_NOTE_BYTES) throw new Error('These prepared notes exceed MORSEL’s 64 MiB note budget. Shorten or split the phrase, or reopen MORSEL to clear older prepared notes.');
        for (const value of required.values()) { abort(signal); await this._prepareNote(value.note, value.seconds, signal); abort(signal); }
        return true;
      } finally { this.preparing--; }
    }
    async _prepareNote(note, seconds, signal) {
      const base = this.words.get(wordKey(note)); if (!base) throw new Error('Prepare this word before playing it.');
      const key = wordKey(note) + '\u0000' + note.pitch + '\u0000' + Math.round(seconds * base.sampleRate);
      if (this.noteCache.has(key)) return this.noteCache.get(key);
      if (this.pendingNotes.has(key)) return waitFor(this.pendingNotes.get(key), signal);
      const bytes = Math.round(seconds * base.sampleRate) * 4;
      if (this.noteBytes + this.reservedNoteBytes + bytes > MAX_NOTE_BYTES) throw new Error('These prepared notes exceed MORSEL’s 64 MiB note budget. Shorten or split the phrase, or reopen MORSEL to clear older prepared notes.');
      this.reservedNoteBytes += bytes;
      const promise = (async () => {
        const left = await this.stretch.fit(base, note.pitch, seconds);
        if (this.disposed) throw new DOMException('MORSEL has been closed.', 'AbortError');
        const value = { left, sampleRate: base.sampleRate, key, identity: wordKey(note), pitch: note.pitch };
        if (left.byteLength <= MAX_NOTE_BYTES) {
          this.noteCache.set(key, value); this.noteBytes += left.byteLength;
        }
        return value;
      })();
      this.pendingNotes.set(key, promise);
      const completed = () => { this.reservedNoteBytes = Math.max(0, this.reservedNoteBytes - bytes); if (this.pendingNotes.get(key) === promise) this.pendingNotes.delete(key); };
      promise.then(completed, completed);
      return waitFor(promise, signal);
    }
    _preparedNote(note, seconds) {
      const base = this.words.get(wordKey(note)); if (!base) throw new Error('Prepare this word before playing it.');
      const key = wordKey(note) + '\u0000' + note.pitch + '\u0000' + Math.round(seconds * base.sampleRate);
      if (this.noteCache.has(key)) { const value = this.noteCache.get(key); this.noteCache.delete(key); this.noteCache.set(key, value); return value; }
      // A seek or loop can shorten a previously prepared note's remaining gate.
      // Reuse its prepared waveform; never invoke speech or stretching on the
      // real-time scheduler. Authored note lengths are fitted asynchronously.
      let nearest = null, difference = Infinity;
      for (const value of this.noteCache.values()) if (value.identity === wordKey(note) && value.pitch === note.pitch) {
        const distance = Math.abs(value.left.length / value.sampleRate - seconds);
        if (distance < difference) { nearest = value; difference = distance; }
      }
      if (nearest) return nearest;
      throw new Error('Prepare this note before playing it.');
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
      this.stretch.dispose(); this.words.clear(); this.pendingWords.clear(); this.pendingNotes.clear(); this.noteCache.clear(); this.wordBytes = this.noteBytes = this.reservedNoteBytes = 0;
      if (context) try { await context.close(); } catch (_) { /* Already closed or unloaded. */ }
    }
  }
  global.MorselAudioDSP = Object.freeze({ settings, identity, frequency, trimSpeech, analyzeSpeech, fitSpeech, disposeDiagnostics, breathBuffer, encodeWav, MIN_PITCH, MAX_PITCH });
  global.MorselAudio = MorselAudio;
})(typeof window === 'object' ? window : globalThis);
