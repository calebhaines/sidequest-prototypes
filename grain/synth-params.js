/* Shared synthesis settings. Physical units keep the editor and audio engine in agreement. */
(function () {
  'use strict';

  const VERSION = 2;
  const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const legacy = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 1) : fallback;
  const parameter = (key, label, min, max, scale, unit, title) => Object.freeze({ key, label, min, max, scale, unit, title });

  const descriptors = Object.freeze({
    body: Object.freeze([
      parameter('frequency', 'Fundamental', 20, 2000, 'log', 'Hz', 'The settled pitch of the drum body.'),
      parameter('harmonics', 'Harmonics', 0, 1, 'linear', '%', 'Blend in the second oscillator for a richer, more resonant body.'),
      parameter('detune', 'Detune', -50, 50, 'linear', 'ct', 'Offset the body oscillator pitch in cents.'),
      parameter('pitchAmount', 'Pitch sweep', -24, 48, 'linear', 'st', 'Starting pitch above or below the settled fundamental, in semitones.'),
      parameter('pitchTime', 'Sweep time', 0.002, 0.5, 'log', 's', 'How long the body takes to reach its settled pitch.'),
      parameter('attack', 'Attack', 0.001, 0.2, 'log', 's', 'Time for the body to rise from silence to full level.'),
      parameter('hold', 'Hold', 0, 0.3, 'linear', 's', 'Time the body stays at full level before its decay.'),
      parameter('decay', 'Decay', 0.01, 2, 'log', 's', 'Time for the body to fade after its attack and hold.')
    ]),
    noise: Object.freeze([
      parameter('rate', 'Playback', 0.25, 4, 'log', '', 'Noise playback speed. Slower rates add weight; faster rates shift its texture upward.'),
      parameter('cutoff', 'Cutoff', 40, 18000, 'log', 'Hz', 'Cutoff frequency, or center frequency for band-pass and notch filters.'),
      parameter('resonance', 'Resonance', 0.1, 12, 'log', '', 'Filter Q. Higher values emphasize a narrower range of frequencies.'),
      parameter('attack', 'Attack', 0.001, 0.3, 'log', 's', 'Time for each noise burst to rise to full level.'),
      parameter('hold', 'Hold', 0, 0.4, 'linear', 's', 'Time each noise burst stays at full level before its decay.'),
      parameter('decay', 'Decay', 0.005, 3, 'log', 's', 'Time for the noise to fade after its attack and hold.'),
      parameter('drive', 'Saturation', 0, 1, 'linear', '%', 'Add warmth, grit, and density to the noise layer.'),
      parameter('envAmount', 'Filter sweep', -48, 48, 'linear', 'st', 'Starting filter offset, in semitones. The filter returns to its cutoff as the noise decays.'),
      parameter('bursts', 'Bursts', 1, 6, 'linear', 'int', 'Repeat the noise attack for claps, flams, and rattling textures.'),
      parameter('spacing', 'Burst gap', 0.005, 0.06, 'log', 's', 'Time between successive noise bursts.')
    ]),
    mod: Object.freeze([
      parameter('rate', 'Rate', 0.1, 40, 'log', 'Hz', 'Modulation speed in free mode. Tempo sync uses the chosen note division.'),
      parameter('depth', 'Depth', 0, 1, 'linear', '%', 'How strongly modulation moves the selected destination.')
    ])
  });

  const enums = Object.freeze({
    body: Object.freeze({
      wave: Object.freeze(['sine', 'triangle', 'sawtooth', 'square']),
      curve: Object.freeze(['exponential', 'linear'])
    }),
    noise: Object.freeze({
      filter: Object.freeze(['lowpass', 'highpass', 'bandpass', 'notch']),
      curve: Object.freeze(['exponential', 'linear'])
    }),
    mod: Object.freeze({
      target: Object.freeze(['off', 'filter', 'amplitude', 'pitch', 'pan']),
      wave: Object.freeze(['sine', 'triangle', 'square', 'sawtooth', 'samplehold']),
      division: Object.freeze(['1/4', '1/8', '1/16', '1/32'])
    })
  });
  const level = parameter('level', 'Level', 0, 1, 'linear', '%', 'Layer level.');

  function defaults(track) {
    track = isRecord(track) ? track : {};
    const tone = legacy(track.tone, 0.5);
    const decay = legacy(track.decay, 0.35);
    const pitch = legacy(track.pitch, 0.5);
    const body = {
      level: 1, wave: 'sine', frequency: 220, harmonics: 1, detune: 0,
      pitchAmount: 0, pitchTime: 0.04, attack: 0.001, hold: 0, decay: 0.12,
      curve: 'exponential'
    };
    const noise = {
      level: 1, rate: 0.72 + pitch * 0.85, filter: 'bandpass', cutoff: 3000,
      resonance: 0.707, attack: 0.001, hold: 0, decay: 0.16,
      curve: 'exponential', drive: 0, envAmount: 0, bursts: 1, spacing: 0.0175
    };
    let length = 0.085 + decay * 0.34;
    let startFrequency = 190 + pitch * 180;
    let highpass = 620 + tone * 1050;
    let lowpass = 3400 + tone * 13800;
    body.frequency = 115 + pitch * 145;
    body.decay = length * 0.51 - body.attack;
    noise.decay = length - noise.attack;

    switch (track.mode) {
      case 'kick':
        length = 0.13 + decay * 0.51;
        body.frequency = 33 + pitch * 34;
        startFrequency = 108 + pitch * 126;
        body.pitchTime = 0.038 + decay * 0.025;
        body.decay = length - body.attack;
        noise.filter = 'lowpass';
        lowpass = 1300 + tone * 11000;
        noise.decay = 0.014 + tone * 0.023 - noise.attack;
        break;
      case 'hat':
        body.level = 0;
        body.frequency = startFrequency = 220;
        body.decay = 0.08;
        highpass = 3700 + tone * 5200;
        lowpass = 9500 + tone * 10000;
        noise.decay = 0.025 + decay * 0.28 - noise.attack;
        break;
      case 'clap':
        body.level = 0;
        body.frequency = startFrequency = 220;
        body.decay = 0.14;
        highpass = 700 + tone * 750;
        lowpass = 2600 + tone * 8800;
        noise.decay = 0.08 + decay * 0.37 - noise.attack;
        noise.bursts = 4;
        break;
      case 'rim':
        length = 0.026 + decay * 0.13;
        body.wave = 'triangle';
        body.frequency = 330 + pitch * 950;
        startFrequency = 390 + pitch * 1150;
        body.pitchTime = 0.014;
        body.decay = length - body.attack;
        highpass = 800 + tone * 900;
        lowpass = 2100 + tone * 10000;
        noise.resonance = 2.1;
        noise.decay = length * 0.6 - noise.attack;
        break;
      case 'perc':
        length = 0.065 + decay * 0.43;
        body.frequency = 100 + pitch * 590;
        startFrequency = body.frequency * 1.9;
        body.pitchTime = 0.04 + decay * 0.04;
        body.decay = length - body.attack;
        highpass = 250 + tone * 2000;
        lowpass = 1200 + tone * 12800;
        noise.resonance = 1.4;
        noise.decay = length * 0.79 - noise.attack;
        break;
      case 'texture':
        body.level = 0;
        body.frequency = startFrequency = 220;
        body.decay = 0.12;
        highpass = 40 + pitch * pitch * 2300;
        lowpass = 450 + tone * tone * 17800;
        noise.attack = 0.01 + decay * 0.025;
        noise.decay = 0.24 + decay * 1.7 - noise.attack;
        break;
      case 'bass':
        length = 0.13 + decay * 0.65;
        body.frequency = 29 + pitch * 119;
        startFrequency = body.frequency * 1.28;
        body.pitchTime = 0.035;
        body.attack = 0.004;
        body.decay = length - body.attack;
        noise.filter = 'lowpass';
        lowpass = 140 + tone * 1700;
        noise.attack = 0.003;
        noise.decay = length * 0.5 - noise.attack;
        break;
      default:
        break;
    }
    body.pitchAmount = clamp(12 * Math.log2(startFrequency / body.frequency), -24, 48);
    noise.cutoff = clamp(noise.filter === 'lowpass' ? lowpass : Math.sqrt(highpass * lowpass), 40, 18000);
    body.decay = clamp(body.decay, 0.01, 2);
    noise.decay = clamp(noise.decay, 0.005, 3);
    return {
      version: VERSION,
      body,
      noise,
      mod: { target: 'off', wave: 'sine', rate: 4, depth: 0, sync: false, division: '1/16' }
    };
  }

  function ensureTrack(track) {
    if (!isRecord(track)) throw new TypeError('A voice must be an object.');
    const initial = defaults(track);
    if (track.synth === undefined || track.synth === null) track.synth = initial;
    if (!isRecord(track.synth)) return track.synth;
    if (track.synth.version === undefined) track.synth.version = VERSION;
    ['body', 'noise', 'mod'].forEach((group) => {
      if (track.synth[group] === undefined || track.synth[group] === null) track.synth[group] = initial[group];
      if (!isRecord(track.synth[group])) return;
      Object.keys(initial[group]).forEach((key) => {
        if (track.synth[group][key] === undefined) track.synth[group][key] = initial[group][key];
      });
    });
    return track.synth;
  }

  function validParameter(value, descriptor) {
    return typeof value === 'number' && Number.isFinite(value)
      && value >= descriptor.min && value <= descriptor.max
      && (descriptor.unit !== 'int' || Number.isInteger(value));
  }

  function validate(synth) {
    if (!isRecord(synth) || (synth.version !== undefined && synth.version !== VERSION)) return false;
    if (Object.keys(synth).some((key) => !['version', 'body', 'noise', 'mod'].includes(key))) return false;
    for (const group of ['body', 'noise', 'mod']) {
      const values = synth[group];
      if (!isRecord(values)) return false;
      const numeric = group === 'mod' ? descriptors[group] : [level, ...descriptors[group]];
      if (!numeric.every((descriptor) => validParameter(values[descriptor.key], descriptor))) return false;
      if (!Object.keys(enums[group]).every((key) => enums[group][key].includes(values[key]))) return false;
      if (group === 'mod' && typeof values.sync !== 'boolean') return false;
      const known = new Set([...numeric.map((descriptor) => descriptor.key), ...Object.keys(enums[group])]);
      if (group === 'mod') known.add('sync');
      if (Object.keys(values).some((key) => !known.has(key))) return false;
    }
    return true;
  }

  function toNormalized(value, descriptor) {
    const number = typeof value === 'number' && Number.isFinite(value) ? value : descriptor.min;
    const limited = clamp(number, descriptor.min, descriptor.max);
    if (descriptor.scale === 'log') return Math.log(limited / descriptor.min) / Math.log(descriptor.max / descriptor.min);
    return (limited - descriptor.min) / (descriptor.max - descriptor.min);
  }

  function fromNormalized(value, descriptor) {
    const normalized = clamp(typeof value === 'number' && Number.isFinite(value) ? value : 0, 0, 1);
    const physical = descriptor.scale === 'log'
      ? descriptor.min * Math.pow(descriptor.max / descriptor.min, normalized)
      : descriptor.min + normalized * (descriptor.max - descriptor.min);
    return descriptor.unit === 'int' ? Math.round(physical) : clamp(physical, descriptor.min, descriptor.max);
  }

  const readable = (value, digits) => String(Number(value.toFixed(digits)));
  function format(value, descriptor) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    switch (descriptor.unit) {
      case 'Hz': return value >= 1000 ? readable(value / 1000, 2) + ' kHz' : readable(value, value < 10 ? 1 : 0) + ' Hz';
      case 's': return value < 1 ? readable(value * 1000, value < 0.01 ? 1 : 0) + ' ms' : readable(value, 2) + ' s';
      case '%': return Math.round(value * 100) + '%';
      case 'st': return (value > 0 ? '+' : '') + readable(value, 1) + ' st';
      case 'ct': return (value > 0 ? '+' : '') + readable(value, 0) + ' ct';
      case 'int': return String(Math.round(value));
      default: return descriptor.key === 'rate' ? readable(value, 2) + '×' : readable(value, 2);
    }
  }

  window.GrainSynth = Object.freeze({ version: VERSION, descriptors, enums, defaults, ensureTrack, validate, toNormalized, fromNormalized, format });
}());
