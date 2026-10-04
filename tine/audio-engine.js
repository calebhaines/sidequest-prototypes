/* TINE: force-driven modal physical percussion. No samples, oscillators, or dependencies. */
(function () {
  'use strict';
  const TAU = Math.PI * 2, LOG1000 = Math.log(1000), EPSILON = 0.000001;
  const MODELS = ['string', 'beam', 'marimba', 'drumhead', 'membrane', 'plate'];
  const COLORS = ['white', 'pink', 'brown', 'blue', 'velvet', 'crackle'];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(+value) ? +value : min));
  function randomGenerator(seed) {
    let value = seed >>> 0;
    return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function readTrack(input) {
    if (window.TineModel && typeof window.TineModel.normalizeTrack === 'function') return window.TineModel.normalizeTrack(input);
    const track = input || {};
    const defaults = { pitchHz: 220, decay: .55, tone: .5, stiffness: .1, damping: .35, position: .23, mallet: .8, hardness: .5, strikeTime: .002, noise: .1, noiseAttack: .0005, noiseDecay: .035, noiseCutoff: 6000, direct: .1, pitchEnv: 0, pitchTime: .035, variation: .035, velocityTone: .3, level: .5, pan: 0 };
    const ranges = { pitchHz: [20, 2000], decay: [.04, 4], position: [.02, .98], strikeTime: [.0003, .03], noiseAttack: [.0005, .3], noiseDecay: [.005, 1], noiseCutoff: [100, 16000], pitchEnv: [-24, 24], pitchTime: [.002, .5], pan: [-1, 1] };
    const result = { model: MODELS.includes(track.model) ? track.model : 'membrane', noiseColor: COLORS.includes(track.noiseColor) ? track.noiseColor : 'pink' };
    Object.keys(defaults).forEach(key => { const range = ranges[key] || [0, 1]; const raw = key === 'decay' && track.decay === undefined ? track.decayT60 : track[key]; result[key] = clamp(raw === undefined ? defaults[key] : raw, range[0], range[1]); });
    return result;
  }
  // Spatial mode shapes: fixed-end string/rectangular surfaces, circular Bessel
  // modes, and free bending bars. The strike position is a physical coupling,
  // rather than a filter sweeping over an otherwise fixed sound.
  function bessel(order, x) {
    let term = Math.pow(x * .5, order), factorial = 1;
    for (let i = 2; i <= order; i++) factorial *= i;
    term /= factorial; let sum = term;
    for (let k = 1; k < 60; k++) { term *= -(x * x * .25) / (k * (k + order)); sum += term; if (Math.abs(term) < 1e-12) break; }
    return sum;
  }
  const circular = [[0, 2.404826], [1, 3.831706], [2, 5.135622], [0, 5.520078], [3, 6.380162], [1, 7.015587], [4, 7.588342], [2, 8.417244], [0, 8.653728], [5, 8.771484], [3, 9.761024], [6, 9.936110], [1, 10.173468], [4, 11.064709], [2, 11.619841], [0, 11.791534]];
  const rectangular = [[1,1], [1,2], [2,2], [1,3], [2,3], [1,4], [3,3], [2,4], [1,5], [3,4], [2,5], [4,4], [1,6], [3,5], [2,6], [4,5]];
  const beam = [1, 2.756, 5.404, 8.933, 13.344, 18.638, 24.813, 31.871, 39.812, 48.635, 58.340, 68.928, 80.398, 92.750, 105.985, 120.102];
  const marimba = [1, 4.01, 10.02, 17.96, 28.05, 40.02, 54.16, 70.21, 88.36, 108.6, 131, 155.5, 182, 210.6, 241, 273.9];
  function inspectModes(data, sampleRate = 44100) {
    const t = readTrack(data), result = [];
    const sr = clamp(sampleRate, 8000, 192000), limit = sr * .43;
    for (let index = 0; index < 16; index++) {
      let ratio, shape;
      if (t.model === 'string') { const n = index + 1; ratio = n * Math.sqrt((1 + .008 * t.stiffness * n * n) / (1 + .008 * t.stiffness)); shape = Math.sin(Math.PI * n * t.position); }
      else if (t.model === 'beam' || t.model === 'marimba') {
        const list = t.model === 'beam' ? beam : marimba;
        ratio = list[index] * (1 + t.stiffness * .032 * Math.pow(list[index] - 1, .72));
        shape = index === 0 ? .55 + .45 * Math.sin(Math.PI * t.position) : Math.cos(Math.PI * (index + 1.5) * (t.position - .5));
      } else if (t.model === 'drumhead') {
        const [order, root] = circular[index]; ratio = root / circular[0][1];
        ratio *= Math.sqrt((1 + t.stiffness * .085 * ratio * ratio) / (1 + t.stiffness * .085));
        shape = bessel(order, root * t.position) * (order ? 2.1 : 1);
      } else {
        const [m, n] = rectangular[index], squared = (m * m + n * n) / 2;
        ratio = t.model === 'plate' ? squared : Math.sqrt(squared);
        ratio *= Math.sqrt((1 + t.stiffness * .08 * ratio * ratio) / (1 + t.stiffness * .08));
        const otherPosition = .31 + t.position * .27;
        shape = Math.sin(Math.PI * m * t.position) * Math.sin(Math.PI * n * otherPosition);
      }
      const frequency = t.pitchHz * ratio;
      const startFrequency = frequency * Math.pow(2, t.pitchEnv / 12);
      if (frequency > limit || startFrequency > limit) continue;
      const materialLoss = { string: .016, beam: .12, marimba: .17, drumhead: .07, membrane: .065, plate: .028 }[t.model];
      const t60 = Math.max(.015, t.decay / (1 + (materialLoss + t.damping * 1.3) * Math.pow(ratio - 1, .8)));
      // RBJ bandpass pole radius gives this exact digital T60. The usual
      // Q=pi*f*T60/log(1000) approximation over-rings at high frequencies.
      const q = Math.sin(TAU * frequency / sr) / (2 * Math.tanh(LOG1000 / (sr * t60)));
      const spectral = Math.pow(ratio, -(.16 + (1 - t.tone) * 1.8));
      const weight = Math.abs(shape) * spectral;
      result.push({ frequency, ratio, t60, decay: t60, weight, gain: weight, q, shape });
    }
    const total = result.reduce((sum, mode) => sum + mode.weight, 0) || 1;
    result.forEach(mode => { mode.weight /= total; mode.gain = mode.weight; });
    return result;
  }
  function makeMallet(context, t) {
    const count = Math.max(3, Math.ceil(t.strikeTime * context.sampleRate));
    const buffer = context.createBuffer(1, count, context.sampleRate), data = buffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < count; i++) { data[i] = Math.pow(Math.max(0, Math.sin(Math.PI * i / (count - 1))), .7 + t.hardness * 6); sum += data[i]; }
    // Discrete area of one: a longer contact physically removes high-mode
    // energy without adding energy simply because there are more samples.
    for (let i = 0; i < count; i++) data[i] /= sum || 1;
    return { buffer, directScale: Math.min(12, Math.sqrt(count)) * .72 };
  }
  function makeNoise(context, t, random) {
    const sr = context.sampleRate, duration = t.noiseAttack + t.noiseDecay + .008;
    const count = Math.max(16, Math.ceil(duration * sr)), buffer = context.createBuffer(1, count, sr), data = buffer.getChannelData(0);
    let pink = 0, brown = 0, previous = 0, crackle = 0, nextImpulse = 0, energy = 0;
    for (let i = 0; i < count; i++) {
      const white = random() * 2 - 1; let value = white;
      if (t.noiseColor === 'pink') { pink = pink * .96 + white * .14; value = pink; }
      else if (t.noiseColor === 'brown') { brown = (brown + white * .025) / 1.025; value = brown; }
      else if (t.noiseColor === 'blue') value = (white - previous) * .7;
      else if (t.noiseColor === 'velvet') { value = 0; if (i >= nextImpulse) { value = random() < .5 ? -1 : 1; nextImpulse = i + Math.max(1, Math.round(sr / 1900 * (.45 + random()))); } }
      else if (t.noiseColor === 'crackle') { crackle *= .74; if (random() < .018) crackle += (random() * 2 - 1) * (1 + random()); value = crackle + white * .03; }
      previous = white; data[i] = value; energy += value * value;
    }
    const colorScale = 1 / Math.max(.06, Math.sqrt(energy / count));
    const effectiveSamples = sr * (t.noiseAttack / 3 + t.noiseDecay / (2 * LOG1000));
    const forceScale = .9 / Math.sqrt(Math.max(1, effectiveSamples));
    const coefficient = 1 - Math.exp(-TAU * Math.min(t.noiseCutoff, sr * .43) / sr);
    let low = 0, dc = 0;
    for (let i = 0; i < count; i++) {
      low += coefficient * (data[i] * colorScale - low);
      dc += .001 * (low - dc);
      const time = i / sr;
      const envelope = time < t.noiseAttack ? time / t.noiseAttack : Math.exp(-LOG1000 * (time - t.noiseAttack) / t.noiseDecay);
      const endFade = Math.min(1, (count - i - 1) / (sr * .006));
      data[i] = (low - dc) * envelope * forceScale * Math.max(0, endFade);
    }
    return { buffer, directScale: Math.sqrt(Math.max(1, effectiveSamples)) * .18, duration };
  }
  function impulse(context) {
    const length = Math.floor(context.sampleRate * 1.8), buffer = context.createBuffer(2, length, context.sampleRate), random = randomGenerator(60471);
    for (let channel = 0; channel < 2; channel++) { const data = buffer.getChannelData(channel); let smooth = 0; for (let i = 0; i < length; i++) { smooth = smooth * .35 + (random() * 2 - 1) * .65; const time = i / context.sampleRate; data[i] = smooth * Math.pow(1 - i / length, 3.8) * (time < .013 ? time / .013 : 1); } [.019, .033, .057, .091].forEach((time, index) => { data[Math.floor((time + channel * .003) * context.sampleRate)] += .24 / (index + 1); }); }
    return buffer;
  }
  function saturation(amount) {
    const curve = new Float32Array(4096), strength = 1 + amount * 12, normalizer = Math.tanh(strength);
    for (let i = 0; i < curve.length; i++) { const x = i * 2 / (curve.length - 1) - 1; curve[i] = amount < .001 ? x : Math.tanh(x * strength) / normalizer; }
    return curve;
  }
  function buildGraph(context, values) {
    const input = context.createGain(), dc = context.createBiquadFilter(), drive = context.createWaveShaper(), trim = context.createGain(), dry = context.createGain(), reverb = context.createConvolver(), wet = context.createGain(), limiter = context.createDynamicsCompressor(), master = context.createGain(), ceiling = context.createWaveShaper();
    dc.type = 'highpass'; dc.frequency.value = 15; dc.Q.value = .707;
    drive.oversample = '2x'; reverb.buffer = impulse(context);
    limiter.threshold.value = -5; limiter.knee.value = 6; limiter.ratio.value = 18; limiter.attack.value = .002; limiter.release.value = .13;
    const curve = new Float32Array(4096);
    for (let i = 0; i < curve.length; i++) { const x = i * 2 / (curve.length - 1) - 1; curve[i] = Math.abs(x) <= .92 ? x : Math.sign(x) * (.92 + .06 * Math.tanh((Math.abs(x) - .92) / .06)); }
    ceiling.curve = curve; input.connect(dc); dc.connect(drive); drive.connect(trim); trim.connect(dry); trim.connect(reverb); dry.connect(limiter); reverb.connect(wet); wet.connect(limiter); limiter.connect(master); master.connect(ceiling); ceiling.connect(context.destination);
    const graph = { input, dc, drive, trim, dry, reverb, wet, limiter, master, ceiling, lastDrive: -1 };
    updateGraph(context, graph, values, true); return graph;
  }
  function updateGraph(context, graph, values, immediate) {
    const now = context.currentTime, drive = clamp(values.drive || 0, 0, 1), space = clamp(values.space || 0, 0, 1);
    const set = (param, value) => { if (immediate) param.value = value; else param.setTargetAtTime(value, now, .02); };
    if (drive !== graph.lastDrive) { graph.drive.curve = saturation(drive); graph.lastDrive = drive; set(graph.trim.gain, 1 / (1 + drive * 2)); }
    set(graph.dry.gain, 1 - space * .12); set(graph.wet.gain, space * .55);
    if (values.master !== undefined) set(graph.master.gain, clamp(values.master, 0, 1));
  }
  function createEnvironment(context, graph, seed, offline = false) { return { context, graph, random: randomGenerator(seed), voices: new Set(), offline, stolen: 0 }; }
  function fadeVoice(voice, at, duration = .01) {
    if (!voice || voice.disposed) return;
    voice.stolen = true;
    voice.bus.gain.cancelScheduledValues(at); voice.bus.gain.setValueAtTime(voice.startTime > at ? EPSILON : voice.volume, at); voice.bus.gain.linearRampToValueAtTime(0, at + duration);
    voice.stopTime = Math.min(voice.stopTime, at + duration + .002);
    voice.sources.forEach(source => { try { source.stop(at + duration + .002); } catch (_) {} });
  }
  function synthesize(environment, data, time, accent) {
    const t = readTrack(data); if (t.level <= 0 || t.mallet <= 0 && t.noise <= 0) return null;
    const { context, graph, random } = environment, now = Math.max(time, context.currentTime);
    const active = Array.from(environment.voices).filter(voice => !voice.disposed && !voice.stolen && voice.startTime <= now && voice.stopTime > now), sameTrack = active.filter(voice => voice.track === data);
    if (sameTrack.length >= 6) { fadeVoice(sameTrack[0], now); environment.stolen++; }
    if (active.filter(voice => !voice.stolen).length >= 48) { fadeVoice(active.find(voice => !voice.stolen), now); environment.stolen++; }
    if (t.variation) { t.pitchHz *= Math.pow(2, (random() * 2 - 1) * t.variation * .4 / 12); t.position = clamp(t.position + (random() * 2 - 1) * t.variation * .045, .02, .98); t.decay = clamp(t.decay * (1 + (random() * 2 - 1) * t.variation * .08), .04, 4); }
    t.tone = clamp(t.tone + (accent ? .24 : -.025) * t.velocityTone, 0, 1); t.hardness = clamp(t.hardness + (accent ? .22 : -.025) * t.velocityTone, 0, 1); t.noiseCutoff = clamp(t.noiseCutoff * Math.pow(2, (accent ? .7 : 0) * t.velocityTone), 100, 16000);
    const modes = inspectModes(t, context.sampleRate);
    const excitationDuration = Math.max(t.mallet > 0 ? t.strikeTime : 0, t.noise > 0 ? t.noiseAttack + t.noiseDecay + .008 : 0);
    const longest = Math.max(t.decay, ...modes.map(mode => mode.t60));
    const duration = excitationDuration + longest + .035;
    const bus = context.createGain(), panner = context.createStereoPanner(), force = context.createGain();
    const volume = t.level * (accent ? 1.12 : .86); bus.gain.value = volume; panner.pan.value = t.pan; force.gain.value = 1; bus.connect(panner); panner.connect(graph.input);
    const voice = { track: data, bus, volume, startTime: now, stopTime: now + duration, sources: [], nodes: [bus, panner, force], disposed: false, stolen: false, modes };
    environment.voices.add(voice);
    const add = node => { voice.nodes.push(node); return node; };
    const clean = () => { if (voice.disposed) return; voice.disposed = true; voice.nodes.forEach(node => { try { node.disconnect(); } catch (_) {} }); environment.voices.delete(voice); };
    let pending = 0;
    const source = (buffer, amount, directScale) => {
      const node = add(context.createBufferSource()), level = add(context.createGain()); node.buffer = buffer; level.gain.value = amount; node.connect(level); level.connect(force);
      if (t.direct > 0) { const direct = add(context.createGain()); direct.gain.value = t.direct * directScale; level.connect(direct); direct.connect(bus); }
      // Excitation ends naturally while the resonator lifetime clock keeps
      // the filter state alive. Offline nodes stay connected before rendering.
      node.loop = false; node.onended = () => { pending--; if (!pending && context.currentTime >= voice.stopTime - .005) clean(); };
      node.start(now); node.stop(now + duration); voice.sources.push(node); pending++;
    };
    modes.forEach(mode => {
      const filter = add(context.createBiquadFilter()), gain = add(context.createGain()); filter.type = 'bandpass';
      const finalFrequency = mode.frequency, firstFrequency = clamp(finalFrequency * Math.pow(2, t.pitchEnv / 12), 10, context.sampleRate * .43);
      filter.frequency.setValueAtTime(firstFrequency, now); filter.frequency.exponentialRampToValueAtTime(finalFrequency, now + t.pitchTime);
      const radiusTerm = 2 * Math.tanh(LOG1000 / (context.sampleRate * mode.t60));
      const firstQ = Math.sin(TAU * firstFrequency / context.sampleRate) / radiusTerm;
      filter.Q.setValueAtTime(Math.max(.05, firstQ), now); filter.Q.exponentialRampToValueAtTime(Math.max(.05, mode.q), now + t.pitchTime);
      gain.gain.value = mode.weight * .74 / radiusTerm;
      // Compensation precedes the filter: browsers otherwise prune the tiny
      // unamplified filter tail while it is still audible after compensation.
      force.connect(gain); gain.connect(filter); filter.connect(bus);
    });
    if (t.mallet > 0) { const mallet = makeMallet(context, t); source(mallet.buffer, t.mallet, mallet.directScale); }
    if (t.noise > 0) { const noise = makeNoise(context, t, random); source(noise.buffer, t.noise, noise.directScale); }
    // BufferSource ends at its short force duration. A tiny DC clock owns
    // resonator cleanup and preserves the full natural ringing tail.
    // A numerical floor (about -240 dB) keeps native filter kernels active.
    // Chrome otherwise prunes a perfectly silent input before high-Q rings
    // finish; the master DC guard removes this inaudible constant force.
    const clock = add(context.createConstantSource()); clock.offset.value = 1e-12; clock.connect(force); clock.onended = clean; clock.start(now); clock.stop(now + duration); voice.sources.push(clock);
    bus.gain.setValueAtTime(volume, now + duration - .02); bus.gain.linearRampToValueAtTime(0, now + duration);
    return voice;
  }
  function stopVoices(environment, at) { if (environment) environment.voices.forEach(voice => fadeVoice(voice, at)); }
  function stepLength(state, step) { const seconds = 60 / clamp(state.bpm || 120, 40, 240) / 4, swing = clamp(state.swing || 0, 0, .6); return seconds * (step % 2 === 0 ? 1 + swing : 1 - swing); }
  function playStep(environment, state, step, time) { const tracks = Array.isArray(state.tracks) ? state.tracks.slice(0, 8) : [], hasSolo = tracks.some(track => track.solo); tracks.forEach(track => { const hit = track.steps && track.steps[step]; if (hit && !track.mute && (!hasSolo || track.solo)) synthesize(environment, track, time, Number(hit) >= 2); }); }
  function encodeWav(audio) {
    const frames = audio.length, left = audio.getChannelData(0), right = audio.getChannelData(1), buffer = new ArrayBuffer(44 + frames * 4), view = new DataView(buffer);
    const string = (at, value) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
    string(0, 'RIFF'); view.setUint32(4, 36 + frames * 4, true); string(8, 'WAVE'); string(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true); view.setUint32(24, audio.sampleRate, true); view.setUint32(28, audio.sampleRate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true); string(36, 'data'); view.setUint32(40, frames * 4, true);
    let peak = 0; for (let i = 0; i < frames; i++) { if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) throw new Error('Audio rendering failed. Please retry with a current browser.'); peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i])); } const scale = peak > .985 ? .985 / peak : 1;
    for (let i = 0; i < frames; i++) { const l = clamp(left[i] * scale, -1, 1), r = clamp(right[i] * scale, -1, 1); view.setInt16(44 + i * 4, Math.round(l * (l < 0 ? 32768 : 32767)), true); view.setInt16(46 + i * 4, Math.round(r * (r < 0 ? 32768 : 32767)), true); }
    return new Blob([buffer], { type: 'audio/wav' });
  }
  class TineEngine {
    constructor() { this.context = null; this.graph = null; this.environment = null; this.running = false; this.state = null; this.onStep = null; this.currentStep = 0; this.nextNoteTime = 0; this.timer = null; this.worker = null; this.displayTimers = new Set(); this.generation = 0; this.values = { master: .8, drive: 0, space: .15 }; this._initPromise = null; this._disposingPromise = null; }
    static inspectModes(track, sampleRate) { return inspectModes(track, sampleRate); }
    async init() {
      if (this._disposingPromise) await this._disposingPromise;
      if (this._initPromise) await this._initPromise;
      if (!this.context) { this._initPromise = (async () => { const AudioContext = window.AudioContext || window.webkitAudioContext; if (!AudioContext) throw new Error('This browser does not support Web Audio. Please use a current browser.'); try { this.context = new AudioContext({ latencyHint: 'interactive' }); } catch (_) { this.context = new AudioContext(); } this.graph = buildGraph(this.context, this.values); this.environment = createEnvironment(this.context, this.graph, Date.now()); })(); try { await this._initPromise; } catch (error) { this._initPromise = null; throw error; } }
      if (this.context && this.context.state === 'suspended') await this.context.resume(); return this;
    }
    async start(state, onStep) {
      const generation = ++this.generation; await this.init(); if (generation !== this.generation) return;
      this._stopTransport(); this.state = state || { bpm: 120, tracks: [] }; this.onStep = typeof onStep === 'function' ? onStep : null; this.running = true; this.currentStep = 0; this.nextNoteTime = this.context.currentTime + .045;
      this.values = { master: this.state.master === undefined ? this.values.master : clamp(this.state.master, 0, 1), drive: clamp(this.state.drive || 0, 0, 1), space: clamp(this.state.space || 0, 0, 1) }; updateGraph(this.context, this.graph, this.values, false); this._schedule(); this._startTimer();
    }
    _startTimer() {
      if (typeof Worker === 'function' && typeof URL.createObjectURL === 'function') { let url; try { url = URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},25);'], { type: 'application/javascript' })); this.worker = new Worker(url); this.worker.onmessage = () => this._schedule(); this.worker.onerror = () => { if (this.worker) this.worker.terminate(); this.worker = null; if (this.running && !this.timer) this.timer = setInterval(() => this._schedule(), 25); }; URL.revokeObjectURL(url); return; } catch (_) { if (url) URL.revokeObjectURL(url); } }
      this.timer = setInterval(() => this._schedule(), 25);
    }
    _schedule() {
      if (!this.running || !this.context || this.context.state !== 'running') return;
      const currentTime = this.context.currentTime; let skipped = 0;
      while (this.nextNoteTime < currentTime - .035 && skipped < 4096) { this.nextNoteTime += stepLength(this.state, this.currentStep); this.currentStep = (this.currentStep + 1) % 16; skipped++; }
      if (skipped >= 4096) this.nextNoteTime = currentTime + .025;
      while (this.nextNoteTime < currentTime + .13) { const step = this.currentStep, when = Math.max(this.nextNoteTime, currentTime); playStep(this.environment, this.state, step, when); if (this.onStep) { const generation = this.generation, latency = Math.min(.06, this.context.outputLatency || this.context.baseLatency || 0); const timer = setTimeout(() => { this.displayTimers.delete(timer); if (this.running && generation === this.generation && this.onStep) this.onStep(step); }, Math.max(0, (when - this.context.currentTime + latency) * 1000)); this.displayTimers.add(timer); } this.nextNoteTime += stepLength(this.state, step); this.currentStep = (step + 1) % 16; }
    }
    _stopTransport() { this.running = false; if (this.timer) clearInterval(this.timer); this.timer = null; if (this.worker) this.worker.terminate(); this.worker = null; this.displayTimers.forEach(timer => clearTimeout(timer)); this.displayTimers.clear(); if (this.context) stopVoices(this.environment, this.context.currentTime); }
    stop() { this.generation++; this._stopTransport(); this.currentStep = 0; }
    async preview(track, bpm = 120) { const generation = this.generation; await this.init(); if (generation !== this.generation || !this.environment || this.context.state === 'closed') return; synthesize(this.environment, track, this.context.currentTime + .005, false); }
    setMasterVolume(value) { this.values.master = clamp(value, 0, 1); if (this.context && this.graph) this.graph.master.gain.setTargetAtTime(this.values.master, this.context.currentTime, .015); }
    setEffects(values) { values = values || {}; if (values.drive !== undefined) this.values.drive = clamp(values.drive, 0, 1); if (values.space !== undefined) this.values.space = clamp(values.space, 0, 1); if (this.context && this.graph) updateGraph(this.context, this.graph, this.values, false); }
    async exportWav(state) {
      const OfflineAudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OfflineAudioContext) throw new Error('WAV rendering is unavailable in this browser.');
      const snapshot = JSON.parse(JSON.stringify(state || { bpm: 120, tracks: [] })), sampleRate = 44100, duration = 16 * 60 / clamp(snapshot.bpm || 120, 40, 240), tracks = Array.isArray(snapshot.tracks) ? snapshot.tracks.slice(0, 8) : [], hasSolo = tracks.some(track => track.solo); let longest = 0;
      tracks.forEach(data => { if (data.mute || hasSolo && !data.solo || !data.steps || !data.steps.some(Boolean)) return; const t = readTrack(data); if (t.level <= 0 || t.mallet <= 0 && t.noise <= 0) return; longest = Math.max(longest, t.decay + Math.max(t.mallet > 0 ? t.strikeTime : 0, t.noise > 0 ? t.noiseAttack + t.noiseDecay + .008 : 0) + .035); });
      const tail = Math.max(.22, longest + (clamp(snapshot.space || 0, 0, 1) > 0 ? 1.8 : 0) + .17), context = new OfflineAudioContext(2, Math.ceil((duration + tail) * sampleRate), sampleRate);
      const graph = buildGraph(context, { master: snapshot.master === undefined ? this.values.master : snapshot.master, drive: snapshot.drive || 0, space: snapshot.space || 0 }), environment = createEnvironment(context, graph, 0x5A17C0DE, true);
      let time = .015; for (let i = 0; i < 64; i++) { const step = i % 16; playStep(environment, snapshot, step, time); time += stepLength(snapshot, step); }
      graph.master.gain.setValueAtTime(graph.master.gain.value, duration + tail - .12); graph.master.gain.linearRampToValueAtTime(0, duration + tail); const rendered = await context.startRendering(); return encodeWav(rendered);
    }
    async dispose() {
      if (this._disposingPromise) return this._disposingPromise; this.stop(); const context = this.context;
      this._disposingPromise = (async () => { try { if (context && context.state !== 'closed') await context.close(); } finally { if (this.context === context) { this.context = null; this.graph = null; this.environment = null; this._initPromise = null; } } })();
      try { await this._disposingPromise; } finally { this._disposingPromise = null; }
    }
  }
  window.TineEngine = TineEngine;
}());
