/* A dependency-free noise percussion engine. Works directly from file://. */
(function () {
  'use strict';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(+value) ? +value : min));
  const TYPES = new Set(['white', 'pink', 'brown', 'blue', 'violet', 'grey', 'velvet', 'crackle', 'metallic', 'digital', 'dust', 'radio']);
  const MODES = new Set(['kick', 'snare', 'hat', 'clap', 'rim', 'perc', 'texture', 'bass']);
  const EPSILON = 0.0001;

  function randomGenerator(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6D2B79F5;
      let t = value;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function readTrack(track) {
    track = track || {};
    return {
      noise: TYPES.has(track.noise) ? track.noise : 'white',
      mode: MODES.has(track.mode) ? track.mode : 'snare',
      level: clamp(track.level === undefined ? 0.75 : track.level, 0, 1),
      pan: clamp(track.pan || 0, -1, 1),
      tone: clamp(track.tone === undefined ? 0.5 : track.tone, 0, 1),
      decay: clamp(track.decay === undefined ? 0.35 : track.decay, 0, 1),
      pitch: clamp(track.pitch === undefined ? 0.5 : track.pitch, 0, 1)
    };
  }

  function makeNoise(context, type) {
    const length = context.sampleRate * 2;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    const rng = randomGenerator(1977 + Array.from(TYPES).indexOf(type) * 701);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let brown = 0, previous = 0, previous2 = 0, low = 0, mid = 0, dust = 0, held = 0;
    let nextHold = 0, nextVelvet = 0;
    let energy = 0;
    const sr = context.sampleRate;
    for (let i = 0; i < length; i++) {
      const white = rng() * 2 - 1;
      let value = white;
      switch (type) {
        case 'pink':
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          value = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
          b6 = white * 0.115926;
          break;
        case 'brown':
          brown = (brown + white * 0.025) / 1.025;
          value = brown * 3.8;
          break;
        case 'blue':
          value = (white - previous) * 0.5;
          previous = white;
          break;
        case 'violet':
          value = (white - 2 * previous + previous2) * 0.28;
          previous2 = previous;
          previous = white;
          break;
        case 'grey':
          low += 0.008 * (white - low);
          mid += 0.2 * (white - mid);
          value = low * 4.8 + (white - mid) * 0.5;
          break;
        case 'velvet':
          value = 0;
          if (i >= nextVelvet) {
            value = rng() < 0.5 ? -1 : 1;
            nextVelvet = i + Math.floor(sr / 1900 * (0.45 + rng()));
          }
          break;
        case 'crackle':
          dust *= 0.88;
          if (rng() < 0.009) dust += (rng() * 2 - 1) * (0.5 + rng() * 2);
          value = dust + white * 0.025;
          break;
        case 'dust':
          dust *= 0.64;
          if (rng() < 0.002) dust += (rng() < 0.5 ? -1 : 1) * (0.5 + rng());
          value = dust;
          break;
        case 'metallic': {
          const t = i / sr;
          value = (Math.sin(t * Math.PI * 2 * 731) * Math.sin(t * Math.PI * 2 * 1083)
            + Math.sin(t * Math.PI * 2 * 1733) * Math.sin(t * Math.PI * 2 * 2549)
            + Math.sin(t * Math.PI * 2 * 3517) * Math.sin(t * Math.PI * 2 * 4679)) * 0.35 + white * 0.12;
          break;
        }
        case 'digital':
          if (i >= nextHold) {
            held = Math.round(white * 5) / 5;
            nextHold = i + Math.max(1, Math.floor(sr / 6800 * (0.7 + rng() * 0.7)));
          }
          value = held;
          break;
        case 'radio':
          low += 0.04 * (white - low);
          mid += 0.4 * (white - mid);
          dust *= 0.97;
          if (rng() < 0.0008) dust += white * 0.7;
          value = (mid - low) * (0.5 + 0.5 * Math.sin(i / sr * 17)) + dust;
          break;
      }
      data[i] = value;
      energy += value * value;
    }
    // Equal RMS keeps color changes musical. Sparse noise preserves its clicks.
    const scale = Math.min(4, 0.31 / Math.sqrt(energy / length || 1));
    for (let i = 0; i < length; i++) data[i] = Math.tanh(data[i] * scale * 1.15);
    return buffer;
  }

  function impulse(context) {
    const length = Math.floor(context.sampleRate * 1.8);
    const buffer = context.createBuffer(2, length, context.sampleRate);
    const random = randomGenerator(60471);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let smooth = 0;
      for (let i = 0; i < length; i++) {
        smooth = smooth * 0.35 + (random() * 2 - 1) * 0.65;
        const time = i / context.sampleRate;
        data[i] = smooth * Math.pow(1 - i / length, 3.8) * (time < 0.013 ? time / 0.013 : 1);
      }
      [0.019, 0.033, 0.057, 0.091].forEach((time, index) => {
        data[Math.floor((time + channel * 0.003) * context.sampleRate)] += 0.24 / (index + 1);
      });
    }
    return buffer;
  }

  function saturation(amount) {
    const curve = new Float32Array(4096);
    const strength = 1 + amount * 17;
    const normalizer = Math.tanh(strength);
    for (let i = 0; i < curve.length; i++) {
      const x = i * 2 / (curve.length - 1) - 1;
      curve[i] = amount < 0.001 ? x : Math.tanh(x * strength) / normalizer;
    }
    return curve;
  }

  function buildGraph(context, values) {
    const input = context.createGain();
    const drive = context.createWaveShaper();
    drive.oversample = '2x';
    const driveTrim = context.createGain();
    const dry = context.createGain();
    const reverb = context.createConvolver();
    reverb.buffer = impulse(context);
    const wet = context.createGain();
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -5;
    limiter.knee.value = 5;
    limiter.ratio.value = 16;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.13;
    const master = context.createGain();
    const ceiling = context.createWaveShaper();
    const ceilingCurve = new Float32Array(4096);
    for (let i = 0; i < ceilingCurve.length; i++) {
      const value = i * 2 / (ceilingCurve.length - 1) - 1;
      const magnitude = Math.abs(value);
      ceilingCurve[i] = magnitude <= 0.94 ? value : Math.sign(value) * (0.94 + 0.045 * Math.tanh((magnitude - 0.94) / 0.045));
    }
    ceiling.curve = ceilingCurve;
    input.connect(drive);
    drive.connect(driveTrim);
    driveTrim.connect(dry);
    driveTrim.connect(reverb);
    dry.connect(limiter);
    reverb.connect(wet);
    wet.connect(limiter);
    limiter.connect(master);
    master.connect(ceiling);
    ceiling.connect(context.destination);
    const graph = { input, drive, driveTrim, dry, wet, master, limiter, reverb, ceiling, lastDrive: -1 };
    updateGraph(context, graph, values || {}, true);
    return graph;
  }

  function updateGraph(context, graph, values, immediate) {
    const now = context.currentTime;
    const drive = clamp(values.drive || 0, 0, 1);
    const space = clamp(values.space || 0, 0, 1);
    const set = (param, value) => {
      if (immediate) param.value = value;
      else param.setTargetAtTime(value, now, 0.02);
    };
    if (graph.lastDrive !== drive) {
      graph.drive.curve = saturation(drive);
      graph.lastDrive = drive;
      set(graph.driveTrim.gain, 1 / (1 + drive * 1.9));
    }
    set(graph.dry.gain, 1 - space * 0.12);
    set(graph.wet.gain, space * 0.55);
    if (values.master !== undefined) set(graph.master.gain, clamp(values.master, 0, 1));
  }

  function createRenderEnvironment(context, graph, seed) {
    return { context, graph, buffers: new Map(), voices: new Set(), hats: new Set(), random: randomGenerator(seed) };
  }

  function synthesize(environment, trackData, time, accent) {
    const track = readTrack(trackData);
    if (track.level <= 0) return null;
    const { context, graph } = environment;
    const now = Math.max(time, context.currentTime);
    const tone = track.tone, decay = track.decay, pitch = track.pitch;
    const bus = context.createGain();
    const panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : context.createPanner();
    if (panner.pan) panner.pan.value = track.pan;
    else {
      panner.panningModel = 'equalpower';
      if (panner.positionX) {
        panner.positionX.value = track.pan;
        panner.positionZ.value = 1 - Math.abs(track.pan);
      } else panner.setPosition(track.pan, 0, 1 - Math.abs(track.pan));
    }
    const velocity = accent ? 1.2 : 0.88;
    const volume = track.level * velocity;
    bus.gain.value = volume;
    bus.connect(panner);
    panner.connect(graph.input);
    const voice = { sources: [], nodes: [bus, panner], bus, volume, startTime: now, stopTime: now, ended: 0, disposed: false, mode: track.mode };
    environment.voices.add(voice);

    const clean = () => {
      if (voice.disposed) return;
      voice.disposed = true;
      voice.nodes.forEach(node => { try { node.disconnect(); } catch (_) {} });
      environment.voices.delete(voice);
      environment.hats.delete(voice);
    };
    const source = (node, duration) => {
      voice.sources.push(node);
      voice.nodes.push(node);
      voice.stopTime = Math.max(voice.stopTime, now + duration + 0.02);
      node.onended = () => {
        voice.ended++;
        if (voice.ended >= voice.sources.length) clean();
      };
      node.stop(now + duration + 0.02);
    };
    const envelope = (peak, attack, duration, destination = bus, pattern = null) => {
      const gain = context.createGain();
      gain.gain.setValueAtTime(EPSILON, now);
      if (pattern) {
        pattern.forEach(([offset, value]) => gain.gain.linearRampToValueAtTime(Math.max(EPSILON, value * peak), now + offset));
      } else gain.gain.linearRampToValueAtTime(Math.max(EPSILON, peak), now + attack);
      gain.gain.exponentialRampToValueAtTime(EPSILON, now + Math.max(duration, attack + 0.001));
      gain.connect(destination);
      voice.nodes.push(gain);
      return gain;
    };
    const filter = (type, frequency, q, destination) => {
      const node = context.createBiquadFilter();
      node.type = type;
      node.frequency.value = clamp(frequency, 20, context.sampleRate * 0.46);
      node.Q.value = q || 0.707;
      node.connect(destination);
      voice.nodes.push(node);
      return node;
    };
    const noise = (duration, peak, highpass, lowpass, attack = 0.001, pattern = null, color = track.noise, resonance = 0.707) => {
      if (!environment.buffers.has(color)) environment.buffers.set(color, makeNoise(context, color));
      const node = context.createBufferSource();
      node.buffer = environment.buffers.get(color);
      node.loop = true;
      node.playbackRate.value = 0.72 + pitch * 0.85;
      let destination = envelope(peak, attack, duration, bus, pattern);
      if (lowpass) destination = filter('lowpass', lowpass, resonance, destination);
      if (highpass) destination = filter('highpass', highpass, 0.707, destination);
      node.connect(destination);
      node.start(now, environment.random() * 1.5);
      source(node, duration);
      return node;
    };
    const oscillator = (wave, startFrequency, endFrequency, fallTime, peak, duration, attack = 0.001) => {
      const node = context.createOscillator();
      node.type = wave;
      node.frequency.setValueAtTime(Math.max(20, startFrequency), now);
      if (endFrequency !== undefined) node.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + fallTime);
      node.connect(envelope(peak, attack, duration));
      node.start(now);
      source(node, duration);
      return node;
    };

    switch (track.mode) {
      case 'kick': {
        const length = 0.13 + decay * 0.51;
        const low = 33 + pitch * 34;
        oscillator('sine', 108 + pitch * 126, low, 0.038 + decay * 0.025, 0.95, length);
        oscillator('triangle', low * 2.6, low, 0.04, 0.11 + tone * 0.09, length * 0.46);
        noise(0.014 + tone * 0.023, 0.19 + tone * 0.18, 120, 1300 + tone * 11000);
        break;
      }
      case 'snare': {
        const length = 0.085 + decay * 0.34;
        noise(length, 1.28, 620 + tone * 1050, 3400 + tone * 13800);
        oscillator('sine', 190 + pitch * 180, 115 + pitch * 145, 0.04, 0.49, length * 0.51);
        oscillator('triangle', 300 + pitch * 260, 210 + pitch * 190, 0.027, 0.14, length * 0.29);
        noise(0.018, 0.25, 2200, 17000);
        break;
      }
      case 'hat': {
        environment.hats.forEach(hat => {
          if (!hat.disposed && hat.startTime <= now && hat.stopTime > now) {
            hat.bus.gain.cancelScheduledValues(now);
            hat.bus.gain.setValueAtTime(hat.volume, now);
            hat.bus.gain.exponentialRampToValueAtTime(EPSILON, now + 0.006);
            hat.sources.forEach(node => { try { node.stop(now + 0.008); } catch (_) {} });
            hat.stopTime = now + 0.008;
          }
        });
        environment.hats.add(voice);
        const length = 0.025 + decay * 0.28;
        noise(length, 1.1, 3700 + tone * 5200, 9500 + tone * 10000);
        noise(length * 0.75, 0.18 + tone * 0.08, 6500, 18000, 0.001, null, 'metallic');
        break;
      }
      case 'clap': {
        const length = 0.08 + decay * 0.37;
        const bursts = [[0.001, 1], [0.012, 0.03], [0.018, 0.8], [0.029, 0.03], [0.035, 0.9], [0.047, 0.04], [0.054, 0.65]];
        noise(length, 1.4, 700 + tone * 750, 2600 + tone * 8800, 0.001, bursts);
        noise(length * 0.75, 0.19, 1200, 7000, 0.011);
        break;
      }
      case 'rim': {
        const length = 0.026 + decay * 0.13;
        oscillator('triangle', 390 + pitch * 1150, 330 + pitch * 950, 0.014, 0.45, length);
        oscillator('sine', 1020 + pitch * 2400, 950 + pitch * 2100, 0.015, 0.19, length * 0.55);
        noise(length * 0.6, 0.56, 800 + tone * 900, 2100 + tone * 10000, 0.0005, null, track.noise, 2.1);
        break;
      }
      case 'perc': {
        const length = 0.065 + decay * 0.43;
        const frequency = 100 + pitch * 590;
        oscillator('sine', frequency * 1.9, frequency, 0.04 + decay * 0.04, 0.61, length);
        oscillator('triangle', frequency * 2.01, frequency * 1.51, 0.033, 0.12 + tone * 0.12, length * 0.65);
        noise(length * 0.79, 0.7, 250 + tone * 2000, 1200 + tone * 12800, 0.001, null, track.noise, 1.4);
        break;
      }
      case 'texture': {
        const length = 0.24 + decay * 1.7;
        noise(length, 0.81, 40 + pitch * pitch * 2300, 450 + tone * tone * 17800, 0.01 + decay * 0.025);
        break;
      }
      case 'bass': {
        const length = 0.13 + decay * 0.65;
        const frequency = 29 + pitch * 119;
        oscillator('sine', frequency * 1.28, frequency, 0.035, 0.73, length, 0.004);
        oscillator('triangle', frequency, frequency, 0.02, 0.1 + tone * 0.17, length * 0.8, 0.004);
        noise(length * 0.5, 0.28 + tone * 0.12, 25, 140 + tone * 1700, 0.003);
        break;
      }
    }
    return voice;
  }

  function stopVoices(environment, at) {
    if (!environment) return;
    environment.voices.forEach(voice => {
      if (voice.disposed) return;
      voice.bus.gain.cancelScheduledValues(at);
      voice.bus.gain.setValueAtTime(voice.startTime > at ? EPSILON : voice.volume, at);
      voice.bus.gain.exponentialRampToValueAtTime(EPSILON, at + 0.008);
      voice.sources.forEach(node => { try { node.stop(at + 0.01); } catch (_) {} });
    });
    environment.hats.clear();
  }

  function stepLength(state, step) {
    const seconds = 60 / clamp(state.bpm || 120, 30, 300) / 4;
    const swing = clamp(state.swing || 0, 0, 0.6);
    return seconds * (step % 2 === 0 ? 1 + swing : 1 - swing);
  }

  function playStep(environment, state, step, time) {
    const tracks = Array.isArray(state.tracks) ? state.tracks : [];
    const hasSolo = tracks.some(track => track.solo);
    tracks.forEach(track => {
      const hit = track.steps && track.steps[step];
      if (hit && !track.mute && (!hasSolo || track.solo)) synthesize(environment, track, time, Number(hit) >= 2);
    });
  }

  function encodeWav(audioBuffer) {
    const frames = audioBuffer.length;
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left;
    const buffer = new ArrayBuffer(44 + frames * 4);
    const view = new DataView(buffer);
    const string = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
    string(0, 'RIFF');
    view.setUint32(4, 36 + frames * 4, true);
    string(8, 'WAVE');
    string(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, audioBuffer.sampleRate, true);
    view.setUint32(28, audioBuffer.sampleRate * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    string(36, 'data');
    view.setUint32(40, frames * 4, true);
    let peak = 0;
    for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    const scale = peak > 0.985 ? 0.985 / peak : 1;
    for (let i = 0; i < frames; i++) {
      const l = clamp(left[i] * scale, -1, 1);
      const r = clamp(right[i] * scale, -1, 1);
      view.setInt16(44 + i * 4, Math.round(l * (l < 0 ? 32768 : 32767)), true);
      view.setInt16(46 + i * 4, Math.round(r * (r < 0 ? 32768 : 32767)), true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  class NoiseEngine {
    constructor() {
      this.context = null;
      this.graph = null;
      this.environment = null;
      this.running = false;
      this.state = null;
      this.onStep = null;
      this.currentStep = 0;
      this.nextNoteTime = 0;
      this.timer = null;
      this.worker = null;
      this.displayTimers = new Set();
      this.generation = 0;
      this.values = { master: 0.8, drive: 0, space: 0.15 };
      this._initPromise = null;
      this._disposingPromise = null;
    }

    async init() {
      if (this._disposingPromise) await this._disposingPromise;
      if (this._initPromise) await this._initPromise;
      if (!this.context) {
        this._initPromise = (async () => {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) throw new Error('This browser does not support Web Audio. Please use a current version of Chrome, Firefox, Safari, or Edge.');
          try { this.context = new AudioContext({ latencyHint: 'interactive' }); }
          catch (_) { this.context = new AudioContext(); }
          this.graph = buildGraph(this.context, this.values);
          this.environment = createRenderEnvironment(this.context, this.graph, Date.now());
        })();
        try { await this._initPromise; }
        catch (error) { this._initPromise = null; throw error; }
      }
      if (this.context && this.context.state === 'suspended') await this.context.resume();
      return this;
    }

    async start(state, onStep) {
      const generation = ++this.generation;
      await this.init();
      if (generation !== this.generation) return;
      this._stopTransport();
      this.state = state || { bpm: 120, tracks: [] };
      this.onStep = typeof onStep === 'function' ? onStep : null;
      this.running = true;
      this.currentStep = 0;
      this.nextNoteTime = this.context.currentTime + 0.045;
      this.values = {
        master: this.state.master === undefined ? this.values.master : clamp(this.state.master, 0, 1),
        drive: clamp(this.state.drive || 0, 0, 1),
        space: clamp(this.state.space || 0, 0, 1)
      };
      updateGraph(this.context, this.graph, this.values, false);
      this._schedule();
      this._startTimer();
    }

    _startTimer() {
      // A blob worker keeps the audio clock steady when the tab loses focus.
      if (typeof Worker === 'function' && typeof URL.createObjectURL === 'function') {
        let url;
        try {
          url = URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},25);'], { type: 'application/javascript' }));
          this.worker = new Worker(url);
          this.worker.onmessage = () => this._schedule();
          this.worker.onerror = () => {
            if (this.worker) this.worker.terminate();
            this.worker = null;
            if (this.running && !this.timer) this.timer = setInterval(() => this._schedule(), 25);
          };
          URL.revokeObjectURL(url);
          return;
        } catch (_) {
          if (url) URL.revokeObjectURL(url);
        }
      }
      this.timer = setInterval(() => this._schedule(), 25);
    }

    _schedule() {
      if (!this.running || !this.context || this.context.state !== 'running') return;
      const currentTime = this.context.currentTime;
      let skipped = 0;
      while (this.nextNoteTime < currentTime - 0.035 && skipped < 4096) {
        this.nextNoteTime += stepLength(this.state, this.currentStep);
        this.currentStep = (this.currentStep + 1) % 16;
        skipped++;
      }
      if (skipped >= 4096) this.nextNoteTime = currentTime + 0.025;
      while (this.nextNoteTime < currentTime + 0.13) {
        const step = this.currentStep;
        const when = Math.max(this.nextNoteTime, currentTime);
        playStep(this.environment, this.state, step, when);
        if (this.onStep) {
          const generation = this.generation;
          const latency = Math.min(0.06, this.context.outputLatency || this.context.baseLatency || 0);
          const displayTimer = setTimeout(() => {
            this.displayTimers.delete(displayTimer);
            if (this.running && generation === this.generation && this.onStep) this.onStep(step);
          }, Math.max(0, (when - this.context.currentTime + latency) * 1000));
          this.displayTimers.add(displayTimer);
        }
        this.nextNoteTime += stepLength(this.state, step);
        this.currentStep = (step + 1) % 16;
      }
    }

    _stopTransport() {
      this.running = false;
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      if (this.worker) this.worker.terminate();
      this.worker = null;
      this.displayTimers.forEach(timer => clearTimeout(timer));
      this.displayTimers.clear();
      if (this.context) stopVoices(this.environment, this.context.currentTime);
    }

    stop() {
      this.generation++;
      this._stopTransport();
      this.currentStep = 0;
    }

    async preview(track) {
      const generation = this.generation;
      await this.init();
      if (generation !== this.generation || !this.environment || this.context.state === 'closed') return;
      synthesize(this.environment, track, this.context.currentTime + 0.005, false);
    }

    setMasterVolume(value) {
      this.values.master = clamp(value, 0, 1);
      if (this.context && this.graph) this.graph.master.gain.setTargetAtTime(this.values.master, this.context.currentTime, 0.015);
    }

    setEffects(values) {
      values = values || {};
      if (values.drive !== undefined) this.values.drive = clamp(values.drive, 0, 1);
      if (values.space !== undefined) this.values.space = clamp(values.space, 0, 1);
      if (this.context && this.graph) updateGraph(this.context, this.graph, this.values, false);
    }

    async exportWav(state) {
      const OfflineAudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!OfflineAudioContext) throw new Error('WAV rendering is unavailable in this browser.');
      // Snapshot the instrument so changes during rendering cannot alter the file.
      const snapshot = JSON.parse(JSON.stringify(state || { bpm: 120, tracks: [] }));
      const sampleRate = 44100;
      const duration = 16 * 60 / clamp(snapshot.bpm || 120, 30, 300);
      const tail = 3.85;
      const context = new OfflineAudioContext(2, Math.ceil((duration + tail) * sampleRate), sampleRate);
      const graph = buildGraph(context, {
        master: snapshot.master === undefined ? this.values.master : snapshot.master,
        drive: snapshot.drive || 0,
        space: snapshot.space || 0
      });
      const environment = createRenderEnvironment(context, graph, 0x5A17C0DE);
      let time = 0.015;
      for (let i = 0; i < 64; i++) {
        const step = i % 16;
        playStep(environment, snapshot, step, time);
        time += stepLength(snapshot, step);
      }
      // Preserve long texture and reverb decays, then end at a silent boundary.
      graph.master.gain.setValueAtTime(graph.master.gain.value, duration + tail - 0.12);
      graph.master.gain.linearRampToValueAtTime(0, duration + tail);
      const rendered = await context.startRendering();
      return encodeWav(rendered);
    }

    // Optional cleanup for applications that mount and unmount the instrument.
    async dispose() {
      if (this._disposingPromise) return this._disposingPromise;
      this.stop();
      const context = this.context;
      this._disposingPromise = (async () => {
        try {
          if (context && context.state !== 'closed') await context.close();
        } finally {
          if (this.context === context) {
            this.context = null;
            this.graph = null;
            this.environment = null;
            this._initPromise = null;
          }
        }
      })();
      try { await this._disposingPromise; }
      finally { this._disposingPromise = null; }
    }
  }

  window.NoiseEngine = NoiseEngine;
})();
