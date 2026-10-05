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

  // GrainSynth supplies the public schema. These compact defaults also let the
  // audio engine run by itself, and the final clamps protect AudioParams even
  // when a caller bypasses the project's import validation.
  function readSynth(data, track) {
    const t = track.tone, d = track.decay, p = track.pitch;
    const legacy = {
      kick: [33 + p * 34, 108 + p * 126, 0.038 + d * 0.025, 0.13 + d * 0.51, 1300 + t * 11000, 0.014 + t * 0.023],
      snare: [115 + p * 145, 190 + p * 180, 0.04, (0.085 + d * 0.34) * 0.51, Math.sqrt((620 + t * 1050) * (3400 + t * 13800)), 0.085 + d * 0.34],
      hat: [220, 220, 0.025, 0.12, Math.sqrt((3700 + t * 5200) * (9500 + t * 10000)), 0.025 + d * 0.28],
      clap: [220, 220, 0.025, 0.12, Math.sqrt((700 + t * 750) * (2600 + t * 8800)), 0.08 + d * 0.37],
      rim: [330 + p * 950, 390 + p * 1150, 0.014, 0.026 + d * 0.13, Math.sqrt((800 + t * 900) * (2100 + t * 10000)), (0.026 + d * 0.13) * 0.6],
      perc: [100 + p * 590, (100 + p * 590) * 1.9, 0.04 + d * 0.04, 0.065 + d * 0.43, Math.sqrt((250 + t * 2000) * (1200 + t * 12800)), (0.065 + d * 0.43) * 0.79],
      texture: [220, 220, 0.025, 0.12, 450 + t * t * 17800, 0.24 + d * 1.7],
      bass: [29 + p * 119, (29 + p * 119) * 1.28, 0.035, 0.13 + d * 0.65, 140 + t * 1700, (0.13 + d * 0.65) * 0.5]
    }[track.mode];
    const fallback = {
      body: { level: ['hat', 'clap', 'texture'].includes(track.mode) ? 0 : 1, wave: track.mode === 'rim' ? 'triangle' : 'sine', frequency: legacy[0], harmonics: 1, detune: 0, pitchAmount: 12 * Math.log2(legacy[1] / legacy[0]), pitchTime: legacy[2], attack: track.mode === 'bass' ? 0.004 : 0.001, hold: 0, decay: legacy[3], curve: 'exponential' },
      noise: { level: 1, rate: 0.72 + p * 0.85, filter: ['kick', 'bass', 'texture'].includes(track.mode) ? 'lowpass' : 'bandpass', cutoff: legacy[4], resonance: 0.707, attack: track.mode === 'texture' ? 0.01 + d * 0.025 : 0.001, hold: 0, decay: legacy[5], curve: 'exponential', drive: 0, envAmount: 0, bursts: track.mode === 'clap' ? 4 : 1, spacing: 0.0175 },
      mod: { target: 'off', wave: 'sine', rate: 4, depth: 0, sync: false, division: '1/16' }
    };
    let raw = data && data.synth || fallback;
    if (window.GrainSynth && typeof window.GrainSynth.ensureTrack === 'function' && data && typeof data === 'object') raw = window.GrainSynth.ensureTrack(data);
    const number = (group, key, min, max) => clamp(raw[group] && raw[group][key] !== undefined ? raw[group][key] : fallback[group][key], min, max);
    const choice = (group, key, options) => options.includes(raw[group] && raw[group][key]) ? raw[group][key] : fallback[group][key];
    return {
      body: {
        level: number('body', 'level', 0, 1), wave: choice('body', 'wave', ['sine', 'triangle', 'sawtooth', 'square']), frequency: number('body', 'frequency', 20, 2000), harmonics: number('body', 'harmonics', 0, 1), detune: number('body', 'detune', -50, 50), pitchAmount: number('body', 'pitchAmount', -24, 48), pitchTime: number('body', 'pitchTime', 0.002, 0.5), attack: number('body', 'attack', 0.001, 0.2), hold: number('body', 'hold', 0, 0.3), decay: number('body', 'decay', 0.01, 2), curve: choice('body', 'curve', ['exponential', 'linear'])
      },
      noise: {
        level: number('noise', 'level', 0, 1), rate: number('noise', 'rate', 0.25, 4), filter: choice('noise', 'filter', ['lowpass', 'highpass', 'bandpass', 'notch']), cutoff: number('noise', 'cutoff', 40, 18000), resonance: number('noise', 'resonance', 0.1, 12), attack: number('noise', 'attack', 0.001, 0.3), hold: number('noise', 'hold', 0, 0.4), decay: number('noise', 'decay', 0.005, 3), curve: choice('noise', 'curve', ['exponential', 'linear']), drive: number('noise', 'drive', 0, 1), envAmount: number('noise', 'envAmount', -48, 48), bursts: Math.round(number('noise', 'bursts', 1, 6)), spacing: number('noise', 'spacing', 0.005, 0.06)
      },
      mod: {
        target: choice('mod', 'target', ['off', 'filter', 'amplitude', 'pitch', 'pan']), wave: choice('mod', 'wave', ['sine', 'triangle', 'square', 'sawtooth', 'samplehold']), rate: number('mod', 'rate', 0.1, 40), depth: number('mod', 'depth', 0, 1), sync: !!(raw.mod && raw.mod.sync), division: choice('mod', 'division', ['1/4', '1/8', '1/16', '1/32'])
      }
    };
  }

  function envelopeLength(settings) {
    return settings.attack + settings.hold + settings.decay + 0.004;
  }

  function noiseLength(settings) {
    return envelopeLength(settings) + (settings.bursts - 1) * settings.spacing;
  }

  function modulationRate(settings, bpm) {
    return settings.sync ? clamp(bpm || 120, 30, 300) / 60 * (Number(settings.division.split('/')[1]) / 4) : settings.rate;
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
    return { context, graph, buffers: new Map(), voices: new Set(), hats: new Set(), random: randomGenerator(seed), modRandom: randomGenerator(seed ^ 0x71A39B5D) };
  }

  function fadeVoice(voice, at, duration = 0.008) {
    if (voice.disposed) return;
    voice.bus.gain.cancelScheduledValues(at);
    voice.bus.gain.setValueAtTime(voice.startTime > at ? EPSILON : voice.volume, at);
    voice.bus.gain.exponentialRampToValueAtTime(EPSILON, at + duration);
    voice.sources.forEach(node => {
      const end = Math.min(voice.sourceEnds.get(node), at + duration + 0.002);
      voice.sourceEnds.set(node, end);
      try { node.stop(end); } catch (_) {}
    });
    voice.stopTime = Math.min(voice.stopTime, at + duration + 0.002);
    voice.stolen = true;
  }

  function synthesize(environment, trackData, time, accent, bpm = 120) {
    const track = readTrack(trackData);
    if (track.level <= 0) return null;
    const settings = readSynth(trackData, track);
    const body = settings.body, noise = settings.noise, mod = settings.mod;
    if (body.level <= 0 && noise.level <= 0) return null;
    const { context, graph } = environment;
    const now = Math.max(time, context.currentTime);
    // Long edited envelopes can otherwise accumulate hundreds of resonant
    // filters. Steal the oldest hits gently; the same limits apply offline.
    const active = Array.from(environment.voices).filter(voice => !voice.disposed && !voice.stolen && voice.startTime <= now && voice.stopTime > now);
    const sameTrack = active.filter(voice => voice.track === trackData);
    if (sameTrack.length >= 16) fadeVoice(sameTrack[0], now);
    if (active.filter(voice => !voice.stolen).length >= 128) fadeVoice(active.find(voice => !voice.stolen), now);
    const frequencyLimit = context.sampleRate * 0.46;
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
    const volume = track.level * (accent ? 1.2 : 0.88);
    bus.gain.value = volume;
    bus.connect(panner);
    panner.connect(graph.input);
    const voice = { sources: [], sourceEnds: new Map(), nodes: [bus, panner], bus, volume, startTime: now, stopTime: now, ended: 0, disposed: false, mode: track.mode, track: trackData, stolen: false };
    environment.voices.add(voice);
    const add = node => { voice.nodes.push(node); return node; };
    const clean = () => {
      if (voice.disposed) return;
      voice.disposed = true;
      voice.nodes.forEach(node => { try { node.disconnect(); } catch (_) {} });
      environment.voices.delete(voice);
      environment.hats.delete(voice);
    };
    const source = (node, duration) => {
      voice.sources.push(node);
      voice.sourceEnds.set(node, now + duration + 0.014);
      add(node);
      voice.stopTime = Math.max(voice.stopTime, now + duration + 0.014);
      node.onended = () => {
        voice.ended++;
        if (voice.ended >= voice.sources.length) clean();
      };
      node.stop(now + duration + 0.014);
    };
    const envelope = (peak, values, destination, offset = 0, scale = 1) => {
      const gain = add(context.createGain());
      const begin = now + offset;
      const attackEnd = begin + values.attack;
      const holdEnd = attackEnd + values.hold * scale;
      const decayEnd = holdEnd + values.decay * scale;
      gain.gain.setValueAtTime(0, now);
      if (offset) gain.gain.setValueAtTime(0, begin);
      gain.gain.linearRampToValueAtTime(peak, attackEnd);
      gain.gain.setValueAtTime(peak, holdEnd);
      if (values.curve === 'linear') gain.gain.linearRampToValueAtTime(0, decayEnd);
      else {
        gain.gain.exponentialRampToValueAtTime(Math.max(1e-8, peak * 0.0001), decayEnd);
        gain.gain.linearRampToValueAtTime(0, decayEnd + 0.004);
      }
      gain.connect(destination);
      return gain;
    };
    const oscillator = (wave, startFrequency, finalFrequency, sweepTime, peak, scale = 1, detune = body.detune) => {
      const node = context.createOscillator();
      node.type = wave;
      node.detune.value = detune;
      node.frequency.setValueAtTime(clamp(startFrequency, 20, frequencyLimit), now);
      node.frequency.exponentialRampToValueAtTime(clamp(finalFrequency, 20, frequencyLimit), now + sweepTime);
      node.connect(envelope(peak, body, bus, 0, scale));
      node.start(now);
      source(node, body.attack + (body.hold + body.decay) * scale + 0.004);
    };

    if (track.mode === 'hat') {
      environment.hats.forEach(hat => {
        if (!hat.disposed && hat.startTime <= now && hat.stopTime > now) {
          fadeVoice(hat, now, 0.006);
        }
      });
      environment.hats.add(voice);
    }

    // The secondary partial retains each drum's original harmonic character.
    // Frequency, sweep, detune and layer envelopes remain independently editable.
    if (body.level > 0) {
      const p = track.pitch, t = track.tone;
      const character = {
        kick: [0.95, 'triangle', 2.6 * (33 + p * 34) / (108 + p * 126), 1, 0.11 + t * 0.09, 0.46],
        snare: [0.49, 'triangle', (300 + p * 260) / (190 + p * 180), (210 + p * 190) / (115 + p * 145), 0.14, 0.57],
        rim: [0.45, 'sine', (1020 + p * 2400) / (390 + p * 1150), (950 + p * 2100) / (330 + p * 950), 0.19, 0.55],
        perc: [0.61, 'triangle', 2.01 / 1.9, 1.51, 0.12 + t * 0.12, 0.65],
        bass: [0.73, 'triangle', 1 / 1.28, 1, 0.1 + t * 0.17, 0.8],
        hat: [0.54, 'triangle', 2.76, 2.76, 0.12, 0.65],
        clap: [0.54, 'triangle', 1.51, 1.51, 0.12, 0.65],
        texture: [0.54, 'triangle', 2, 2, 0.12, 0.8]
      }[track.mode];
      const startFrequency = body.frequency * Math.pow(2, body.pitchAmount / 12);
      oscillator(body.wave, startFrequency, body.frequency, body.pitchTime, character[0] * body.level);
      if (body.harmonics > 0) oscillator(character[1], startFrequency * character[2], body.frequency * character[3], Math.max(0.002, body.pitchTime * 0.85), character[4] * body.level * body.harmonics, character[5], body.detune * -0.6);
    }

    let noiseSource = null, noiseFilter = null, amplitude = null;
    if (noise.level > 0) {
      if (!environment.buffers.has(track.noise)) environment.buffers.set(track.noise, makeNoise(context, track.noise));
      noiseSource = context.createBufferSource();
      noiseSource.buffer = environment.buffers.get(track.noise);
      noiseSource.loop = true;
      noiseSource.playbackRate.value = noise.rate;
      // A DC guard precedes the user's filter; envelopes follow both filter and
      // drive, so even extreme resonance cannot ring after a layer has ended.
      const dc = add(context.createBiquadFilter());
      dc.type = 'highpass'; dc.frequency.value = 20; dc.Q.value = 0.707;
      noiseFilter = add(context.createBiquadFilter());
      noiseFilter.type = noise.filter;
      noiseFilter.Q.value = noise.resonance;
      const cutoff = clamp(noise.cutoff, 20, frequencyLimit);
      const initialCutoff = clamp(cutoff * Math.pow(2, noise.envAmount / 12), 20, frequencyLimit);
      noiseFilter.frequency.setValueAtTime(initialCutoff, now);
      noiseFilter.frequency.setValueAtTime(initialCutoff, now + noise.attack + noise.hold);
      noiseFilter.frequency.exponentialRampToValueAtTime(cutoff, now + noise.attack + noise.hold + noise.decay);
      noiseSource.connect(dc); dc.connect(noiseFilter);
      let signal = noiseFilter;
      if (noise.drive > 0) {
        const drive = add(context.createWaveShaper());
        drive.curve = saturation(noise.drive);
        drive.oversample = '2x';
        const trim = add(context.createGain());
        trim.gain.value = 1 / (1 + noise.drive * 1.9);
        signal.connect(drive); drive.connect(trim); signal = trim;
      }
      amplitude = add(context.createGain());
      amplitude.gain.value = 1;
      amplitude.connect(bus);
      const strength = { kick: 0.19 + track.tone * 0.18, snare: 1.28, hat: 1.15, clap: 1.4, rim: 0.56, perc: 0.7, texture: 0.81, bass: 0.28 + track.tone * 0.12 }[track.mode];
      for (let burst = 0; burst < noise.bursts; burst++) {
        const gain = envelope(strength * noise.level / noise.bursts, noise, amplitude, burst * noise.spacing);
        signal.connect(gain);
      }
      noiseSource.start(now, environment.random() * 1.5);
      source(noiseSource, noiseLength(noise));
    }

    let target = null, depth = 0;
    if (mod.depth > 0) {
      if (mod.target === 'filter' && noiseFilter) { target = noiseFilter.detune; depth = mod.depth * 4800; }
      else if (mod.target === 'pitch' && noiseSource && noiseSource.detune) { target = noiseSource.detune; depth = mod.depth * 2400; }
      else if (mod.target === 'amplitude' && amplitude) {
        amplitude.gain.value = 1 - mod.depth * 0.5;
        target = amplitude.gain; depth = mod.depth * 0.5;
      } else if (mod.target === 'pan') {
        target = panner.pan || panner.positionX || null;
        depth = mod.depth * (1 - Math.abs(track.pan));
      }
    }
    if (target && depth > 0) {
      const duration = Math.max(body.level > 0 ? envelopeLength(body) : 0, noise.level > 0 ? noiseLength(noise) : 0);
      const rate = clamp(modulationRate(mod, bpm), 0.1, 40);
      let lfo;
      if (mod.wave === 'samplehold' && typeof context.createConstantSource === 'function') {
        lfo = context.createConstantSource();
        for (let offset = 0; offset < duration + 0.014; offset += 1 / rate) lfo.offset.setValueAtTime(environment.modRandom() * 2 - 1, now + offset);
      } else if (mod.wave === 'samplehold') {
        // Compatible fallback with a low-rate buffer, never a ScriptProcessor.
        const sampleRate = 3000;
        const buffer = context.createBuffer(1, Math.max(128, Math.ceil((duration + 0.03) * sampleRate)), sampleRate);
        const samples = buffer.getChannelData(0);
        let value = 0, last = -1;
        for (let i = 0; i < samples.length; i++) {
          const step = Math.floor(i / sampleRate * rate);
          if (step !== last) { value = environment.modRandom() * 2 - 1; last = step; }
          samples[i] = value;
        }
        lfo = context.createBufferSource(); lfo.buffer = buffer;
      } else {
        lfo = context.createOscillator(); lfo.type = mod.wave; lfo.frequency.value = rate;
      }
      const amount = add(context.createGain()); amount.gain.value = depth;
      lfo.connect(amount); amount.connect(target);
      lfo.start(now); source(lfo, duration);
      voice.lfo = lfo;
      voice.modulationRate = rate;
    }
    if (!voice.sources.length) clean();
    return voice;
  }

  function stopVoices(environment, at) {
    if (!environment) return;
    environment.voices.forEach(voice => {
      fadeVoice(voice, at);
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
      if (hit && !track.mute && (!hasSolo || track.solo)) synthesize(environment, track, time, Number(hit) >= 2, state.bpm);
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

    async preview(track, bpm) {
      const generation = this.generation;
      await this.init();
      if (generation !== this.generation || !this.environment || this.context.state === 'closed') return;
      synthesize(this.environment, track, this.context.currentTime + 0.005, false, bpm === undefined ? this.state && this.state.bpm || 120 : bpm);
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

    async exportWav(state, options = {}) {
      const checkCancelled = () => { if (options.signal?.aborted) throw new DOMException('Audio export cancelled.', 'AbortError'); };
      checkCancelled();
      const OfflineAudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!OfflineAudioContext) throw new Error('WAV rendering is unavailable in this browser.');
      // Snapshot the instrument so changes during rendering cannot alter the file.
      const snapshot = JSON.parse(JSON.stringify(state || { bpm: 120, tracks: [] }));
      const sampleRate = 44100;
      const hit = options.scope === 'hit', bars = Math.max(1, Math.min(16, Math.round(Number(options.bars) || 4)));
      const duration = hit ? 0 : bars * 240 / clamp(snapshot.bpm || 120, 30, 300);
      const tracks = Array.isArray(snapshot.tracks) ? snapshot.tracks : [];
      const hasSolo = tracks.some(track => track.solo);
      let longest = 0;
      tracks.forEach(data => {
        if (data.mute || hasSolo && !data.solo || !data.steps || !data.steps.some(Boolean)) return;
        const track = readTrack(data);
        if (track.level <= 0) return;
        const settings = readSynth(data, track);
        longest = Math.max(longest, settings.body.level > 0 ? envelopeLength(settings.body) : 0, settings.noise.level > 0 ? noiseLength(settings.noise) : 0);
      });
      const naturalTail = Math.max(0.22, longest + (clamp(snapshot.space || 0, 0, 1) > 0 ? 1.8 : 0) + 0.17);
      const extraTail = Math.max(0, Math.min(15, Number(options.tailSeconds) || 0));
      const tail = options.tailSeconds === undefined ? naturalTail : hit ? Math.max(.22, longest + extraTail + .035) : extraTail;
      const context = new OfflineAudioContext(2, Math.ceil((duration + tail) * sampleRate), sampleRate);
      const graph = buildGraph(context, {
        master: snapshot.master === undefined ? this.values.master : snapshot.master,
        drive: snapshot.drive || 0,
        space: snapshot.space || 0
      });
      const environment = createRenderEnvironment(context, graph, 0x5A17C0DE);
      let time = 0.015;
      for (let i = 0; i < (hit ? 1 : bars * 16); i++) {
        if (i % 16 === 0) {
          checkCancelled();
          if (options.signal) await new Promise(resolve => setTimeout(resolve, 0));
          checkCancelled();
        }
        const step = i % 16;
        playStep(environment, snapshot, step, time);
        time += stepLength(snapshot, step);
      }
      // Preserve long texture and reverb decays, then end at a silent boundary.
      graph.master.gain.setValueAtTime(graph.master.gain.value, duration + tail - 0.12);
      graph.master.gain.linearRampToValueAtTime(0, duration + tail);
      const rendered = await context.startRendering();
      checkCancelled();
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
