/* GALLEY effects · clear controls, eight finishing tools. No external assets. */
(function (scope) {
  'use strict';
  const range = (key, label, min, max, step, value, unit) => ({ key, label, type: 'range', min, max, step, default: value, unit: unit || '' });
  const select = (key, label, value, options) => ({ key, label, type: 'select', default: value, options: options.map(([value, label]) => ({ value, label })) });
  const rhythmic = [['1/32', '1/32 note'], ['1/16', '1/16 note'], ['1/8', '1/8 note'], ['1/8.', 'Dotted eighth'], ['1/4', 'Quarter note'], ['1/4.', 'Dotted quarter'], ['1/2', 'Half note'], ['1', 'One bar'], ['2', 'Two bars']];
  const catalog = [
    {
      id: 'prism', name: 'MANDOLINE', subtitle: 'Slice the spectrum. Mind the corners.', color: '#dfcba4', accent: '#f2e8d2', visual: 'facets',
      description: 'Three musical EQ bands and a resonant filter sculpt the spectrum.',
      params: [range('low', 'Low shelf', -18, 18, 0.1, 0, 'dB'), range('mid', 'Mid bell', -18, 18, 0.1, 0, 'dB'), range('high', 'High shelf', -18, 18, 0.1, 0, 'dB'), range('midFreq', 'Mid frequency', 120, 6000, 1, 1000, 'Hz'), select('filter', 'Filter', 'off', [['off', 'Off'], ['lowpass', 'Low-pass'], ['highpass', 'High-pass'], ['bandpass', 'Band-pass']]), range('cutoff', 'Cutoff', 30, 20000, 1, 12000, 'Hz'), range('resonance', 'Resonance', 0.3, 8, 0.01, 0.707, 'Q')],
      defaults: { low: 0, mid: 0, high: 0, midFreq: 1000, filter: 'off', cutoff: 12000, resonance: 0.707, mix: 1, bypass: false }
    },
    {
      id: 'velvet', name: 'BUTTER', subtitle: 'Smooth the peaks. Chef asked for more.', color: '#e4c365', accent: '#f6e1a0', visual: 'ribbons',
      description: 'A stereo-linked compressor with a soft knee and a filtered detector.',
      params: [range('threshold', 'Threshold', -48, 0, 0.1, -18, 'dB'), range('ratio', 'Ratio', 1, 20, 0.1, 4, ':1'), range('attack', 'Attack', 0.2, 100, 0.1, 12, 'ms'), range('release', 'Release', 20, 1500, 1, 180, 'ms'), range('knee', 'Soft knee', 0, 18, 0.1, 6, 'dB'), range('makeup', 'Makeup gain', -12, 24, 0.1, 3, 'dB'), range('sidechain', 'Detector high-pass', 20, 500, 1, 30, 'Hz')],
      defaults: { threshold: -18, ratio: 4, attack: 12, release: 180, knee: 6, makeup: 3, sidechain: 30, mix: 1, bypass: false }
    },
    {
      id: 'cinder', name: 'CHAR', subtitle: 'A little colour. A small incident.', color: '#ef7648', accent: '#f5bc69', visual: 'embers',
      description: 'Oversampled saturation, asymmetric diode color, or folding distortion.',
      params: [select('shape', 'Circuit', 'soft', [['soft', 'Soft saturation'], ['diode', 'Asymmetric diode'], ['fold', 'Wavefolder']]), range('drive', 'Drive', 0, 36, 0.1, 8, 'dB'), range('bias', 'Bias', -0.75, 0.75, 0.01, 0, ''), range('tone', 'Tone', 300, 20000, 1, 10000, 'Hz'), range('output', 'Output gain', -24, 6, 0.1, -3, 'dB')],
      defaults: { shape: 'soft', drive: 8, bias: 0, tone: 10000, output: -3, mix: 0.65, bypass: false }
    },
    {
      id: 'undertow', name: 'DOUBLE', subtitle: 'Two cooks. One slightly moving spoon.', color: '#9fb9bf', accent: '#dce4df', visual: 'ripples',
      description: 'Modulated stereo delay gives chorus drift or metallic flanging.',
      params: [select('mode', 'Mode', 'chorus', [['chorus', 'Chorus'], ['flanger', 'Flanger']]), range('rate', 'Rate', 0.02, 8, 0.01, 0.35, 'Hz'), range('delay', 'Base delay', 1, 35, 0.1, 12, 'ms'), range('depth', 'Modulation depth', 0, 12, 0.1, 5, 'ms'), range('feedback', 'Feedback', -0.9, 0.9, 0.01, 0.12, ''), range('spread', 'Stereo spread', 0, 1, 0.01, 0.75, '')],
      defaults: { mode: 'chorus', rate: 0.35, delay: 12, depth: 5, feedback: 0.12, spread: 0.75, mix: 0.5, bypass: false }
    },
    {
      id: 'parallax', name: 'LEFTOVERS', subtitle: 'Yesterday’s special. Again. And again.', color: '#dda973', accent: '#f2d1a6', visual: 'orbits',
      description: 'A tempo-aware stereo delay, from independent echoes to ping-pong.',
      params: [select('clock', 'Clock', 'sync', [['sync', 'Tempo sync'], ['free', 'Milliseconds']]), select('division', 'Division', '1/8.', rhythmic.slice(0, 8)), range('time', 'Delay time', 20, 2000, 1, 375, 'ms'), range('feedback', 'Feedback', 0, 0.92, 0.01, 0.42, ''), range('damping', 'Echo tone', 500, 18000, 1, 6000, 'Hz'), range('spread', 'Ping-pong amount', 0, 1, 0.01, 1, '')],
      defaults: { clock: 'sync', division: '1/8.', time: 375, feedback: 0.42, damping: 6000, spread: 1, mix: 0.3, bypass: false }
    },
    {
      id: 'vestige', name: 'HOOD', subtitle: 'Room for a much larger kitchen.', color: '#b7bfb6', accent: '#e2dac2', visual: 'vaults',
      description: 'An eight-line feedback network creates a diffuse, breathing space.',
      params: [range('size', 'Room size', 0, 1, 0.01, 0.55, ''), range('decay', 'Decay', 0.2, 12, 0.1, 2.8, 's'), range('damping', 'Damping', 800, 18000, 1, 6500, 'Hz'), range('predelay', 'Pre-delay', 0, 180, 1, 22, 'ms'), range('diffusion', 'Diffusion', 0, 1, 0.01, 0.75, ''), range('width', 'Stereo width', 0, 1, 0.01, 0.9, '')],
      defaults: { size: 0.55, decay: 2.8, damping: 6500, predelay: 22, diffusion: 0.75, width: 0.9, mix: 0.25, bypass: false }
    },
    {
      id: 'halo', name: 'PROOF', subtitle: 'Leave the note somewhere warm. It rises.', color: '#d8c984', accent: '#f2e5b6', visual: 'haloes',
      description: 'Two crossfading read heads shift pitch and feed a drifting harmony.',
      params: [range('semitones', 'Pitch', -24, 24, 1, 7, 'st'), range('fine', 'Fine tune', -50, 50, 1, 0, 'cents'), range('window', 'Window', 20, 120, 1, 60, 'ms'), range('feedback', 'Feedback', 0, 0.65, 0.01, 0.12, ''), range('tone', 'Harmony tone', 1000, 20000, 1, 12000, 'Hz'), range('spread', 'Stereo spread', 0, 1, 0.01, 0.65, '')],
      defaults: { semitones: 7, fine: 0, window: 60, feedback: 0.12, tone: 12000, spread: 0.65, mix: 0.35, bypass: false }
    },
    {
      id: 'tremor', name: 'WHISK', subtitle: 'Keep moving until something happens.', color: '#eea950', accent: '#f2d6a6', visual: 'teeth',
      description: 'Tempo-locked amplitude motion, rhythmic gates, and stereo auto-pan.',
      params: [select('division', 'Cycle', '1/8', rhythmic), select('shape', 'Shape', 'sine', [['sine', 'Sine'], ['triangle', 'Triangle'], ['gate', 'Gate'], ['pulse', 'Rounded pulse']]), range('depth', 'Gate depth', 0, 1, 0.01, 0.65, ''), range('pan', 'Auto-pan', 0, 1, 0.01, 0.5, ''), range('duty', 'Open length', 0.05, 0.95, 0.01, 0.5, ''), range('phase', 'Phase', 0, 360, 1, 0, '°'), range('smooth', 'Smoothing', 0, 80, 0.1, 4, 'ms')],
      defaults: { division: '1/8', shape: 'sine', depth: 0.65, pan: 0.5, duty: 0.5, phase: 0, smooth: 4, mix: 1, bypass: false }
    }
  ];
  catalog.forEach(effect => { effect.params.push(range('mix', 'Dry / wet', 0, 1, 0.01, effect.defaults.mix, '')); });
  scope.LoomEffectsCatalog = catalog;
})(typeof window === 'undefined' ? globalThis : window);
