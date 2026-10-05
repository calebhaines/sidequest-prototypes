/* GALLEY effects · clear controls, finishing tools. No external assets. */
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
    },
    {
      id: 'broiler', name: 'BROILER', subtitle: 'The low end is having a very hot service.', color: '#ef8b4f', accent: '#ffd39b', visual: 'broiler', panel: 'amp',
      description: 'Nine bass and three guitar characters, with four original Ampeg-inspired models: B-15 Portaflex, classic SVT, V-4B, and modern SVT-PRO. Oversampled preamp and power stages, protected clean lows, eleven cabinets. Hear the head, move the mic, feed the speaker. Character models, not circuit-exact recreations.',
      params: [
        select('model', 'Amplifier', 'clean-bass', [['clean-bass', 'Bass · solid-state clean'], ['flip-top', 'Bass · warm flip-top'], ['valve-stack', 'Bass · valve stack'], ['modern-grind', 'Bass · modern grind'], ['doom-fuzz', 'Bass · doom fuzz'], ['american-clean', 'Guitar · American clean'], ['british-crunch', 'Guitar · British crunch'], ['high-gain', 'Guitar · high gain'], ['portaflex-64', 'Bass · Ampeg B-15 inspired'], ['svt-69', 'Bass · Ampeg classic SVT inspired'], ['v4b-71', 'Bass · Ampeg V-4B inspired'], ['svt-pro', 'Bass · Ampeg SVT-PRO inspired']]),
        range('input', 'Input gain', -18, 24, 0.1, 0, 'dB'), range('drive', 'Preamp drive', 0, 36, 0.1, 6, 'dB'),
        range('cleanLow', 'Clean low blend', 0, 1, 0.01, 0.35, ''), range('crossover', 'Low crossover', 50, 500, 1, 150, 'Hz'),
        range('bass', 'Bass', -15, 15, 0.1, 2, 'dB'), range('mid', 'Middle', -18, 18, 0.1, -1, 'dB'), range('midFreq', 'Middle frequency', 80, 2500, 1, 550, 'Hz'), range('treble', 'Treble', -15, 15, 0.1, 0, 'dB'),
        range('presence', 'Presence', 0, 1, 0.01, 0.35, ''), range('depth', 'Low depth', 0, 1, 0.01, 0.4, ''),
        range('master', 'Power drive', 0, 1, 0.01, 0.45, ''), range('sag', 'Power sag', 0, 1, 0.01, 0.3, ''),
        range('gate', 'Gate threshold', -90, -20, 1, -75, 'dB'), range('gateRelease', 'Gate release', 20, 800, 1, 160, 'ms'),
        select('cabinet', 'Speaker cabinet', 'bass410', [['di', 'DI · cabinet off'], ['bass15', 'Bass · 1 × 15 round'], ['bass410', 'Bass · 4 × 10 tight'], ['bass810', 'Bass · 8 × 10 stack'], ['guitar112open', 'Guitar · 1 × 12 open'], ['guitar212', 'Guitar · 2 × 12 combo'], ['guitar412', 'Guitar · 4 × 12 closed'], ['metalbox', 'Oddity · steel cupboard'], ['portaflex115', 'Bass · flip-top 1 × 15 vintage'], ['sealed810', 'Bass · sealed 8 × 10 fridge'], ['ported410', 'Bass · ported 4 × 10 modern']]),
        range('speakerDrive', 'Speaker breakup', 0, 1, 0.01, 0.2, ''), range('mic', 'Mic position', 0, 1, 0.01, 0.45, ''), range('distance', 'Mic distance', 0, 1, 0.01, 0.15, ''), range('air', 'Cabinet air', 0, 1, 0.01, 0.3, ''),
        select('stereo', 'Input channels', 'stereo', [['stereo', 'Preserve stereo'], ['mono', 'Mono amp input']]), range('output', 'Output gain', -24, 12, 0.1, -4, 'dB')
      ],
      groups: [
        { label: '01 · Input & amplifier', keys: ['model', 'input', 'drive', 'stereo'] },
        { label: '02 · Low end & tone', keys: ['cleanLow', 'crossover', 'bass', 'mid', 'midFreq', 'treble', 'presence', 'depth'] },
        { label: '03 · Power & dynamics', keys: ['master', 'sag', 'gate', 'gateRelease'] },
        { label: '04 · Cabinet & output', keys: ['cabinet', 'speakerDrive', 'mic', 'distance', 'air', 'output', 'mix'] }
      ],
      defaults: { model: 'clean-bass', input: 0, drive: 6, cleanLow: 0.35, crossover: 150, bass: 2, mid: -1, midFreq: 550, treble: 0, presence: 0.35, depth: 0.4, master: 0.45, sag: 0.3, gate: -75, gateRelease: 160, cabinet: 'bass410', speakerDrive: 0.2, mic: 0.45, distance: 0.15, air: 0.3, stereo: 'stereo', output: -4, mix: 1, bypass: false },
      presets: [
        { id: 'house-bass', name: 'House bass', description: 'Clean, firm lows. The station is open.', params: { model: 'clean-bass', drive: 3, cabinet: 'bass410', cleanLow: 0.5, bass: 2, depth: 0.3, presence: 0.4, master: 0.3, sag: 0.15 } },
        { id: 'sunday-stock', name: 'Sunday stock', description: 'Soft valves and a broad fifteen-inch pot.', params: { model: 'flip-top', drive: 9, cabinet: 'bass15', cleanLow: 0.25, bass: 3, mid: 1.5, midFreq: 350, treble: -3, depth: 0.55, presence: 0.15, master: 0.5, sag: 0.65, air: 0.2 } },
        { id: 'full-stack', name: 'Full stack service', description: 'Eight tens, warm grind, plenty of floor.', params: { model: 'valve-stack', drive: 14, cabinet: 'bass810', cleanLow: 0.45, mid: 3, midFreq: 750, presence: 0.45, depth: 0.5, master: 0.55, sag: 0.35, speakerDrive: 0.3, output: -5 } },
        { id: 'knife-edge', name: 'Knife edge', description: 'Tight modern attack over a clean foundation.', params: { model: 'modern-grind', drive: 18, cabinet: 'bass410', cleanLow: 0.7, crossover: 190, bass: 1, mid: -2, midFreq: 450, treble: 2, presence: 0.65, master: 0.4, sag: 0.1, mic: 0.75, output: -6 } },
        { id: 'burnt-bottom', name: 'Burnt at the bottom', description: 'Doom fuzz with enough clean bass to stand on.', params: { model: 'doom-fuzz', drive: 24, cabinet: 'bass810', cleanLow: 0.65, crossover: 180, bass: 4, mid: 2, midFreq: 300, treble: -3, presence: 0.2, depth: 0.7, master: 0.7, sag: 0.6, speakerDrive: 0.6, output: -7 } },
        { id: 'glassware', name: 'Good glassware', description: 'American clean, open back, a little cabinet air.', params: { model: 'american-clean', drive: 2, cabinet: 'guitar112open', cleanLow: 0, bass: 0, mid: -2, midFreq: 650, treble: 3, presence: 0.5, depth: 0.1, master: 0.3, sag: 0.2, mic: 0.65, air: 0.65, output: -3 } },
        { id: 'hot-pass', name: 'The hot pass', description: 'British crunch through a barking two-by-twelve.', params: { model: 'british-crunch', drive: 15, cabinet: 'guitar212', cleanLow: 0, bass: 1, mid: 4, midFreq: 900, treble: 1, presence: 0.5, depth: 0.25, master: 0.6, sag: 0.4, speakerDrive: 0.35, output: -5 } },
        { id: 'after-hours', name: 'After-hours alarm', description: 'High gain, a closed stack, and a sensible gate.', params: { model: 'high-gain', drive: 23, cabinet: 'guitar412', cleanLow: 0, bass: 2, mid: -3, midFreq: 650, treble: 2, presence: 0.65, depth: 0.4, master: 0.5, sag: 0.2, gate: -55, gateRelease: 100, speakerDrive: 0.35, mic: 0.65, output: -7 } },
        { id: 'steel-cupboard', name: 'Inside the steel cupboard', description: 'A resonant little accident, with protected low end.', params: { model: 'modern-grind', drive: 13, cabinet: 'metalbox', cleanLow: 0.55, crossover: 120, bass: 1, mid: 2, midFreq: 1100, treble: -1, presence: 0.25, depth: 0.3, master: 0.4, sag: 0.25, speakerDrive: 0.45, mic: 0.35, distance: 0.8, air: 0.2, output: -6 } },
        { id: 'blue-plate', name: 'Blue-plate special', description: 'B-15-inspired warmth: pillowy fifteen, soft power bloom, rounded fingers.', params: { model: 'portaflex-64', drive: 7, cabinet: 'portaflex115', cleanLow: 0.3, crossover: 125, bass: 1.5, mid: 0.5, midFreq: 350, treble: -1.5, presence: 0.12, depth: 0.35, master: 0.55, sag: 0.65, speakerDrive: 0.22, mic: 0.35, distance: 0.22, air: 0.15, output: -5 } },
        { id: 'walk-in-fridge', name: 'Walk-in fridge', description: 'Classic SVT-inspired muscle into eight sealed tens. Large service, firm handshake.', params: { model: 'svt-69', drive: 12, cabinet: 'sealed810', cleanLow: 0.4, crossover: 150, bass: 2, mid: 2.5, midFreq: 800, treble: 0.5, presence: 0.4, depth: 0.4, master: 0.55, sag: 0.25, speakerDrive: 0.3, mic: 0.55, distance: 0.12, air: 0.25, output: -6 } },
        { id: 'four-burner', name: 'Four-burner racket', description: 'V-4B-inspired bark: open mids, lively power crunch, pick-friendly bite.', params: { model: 'v4b-71', drive: 14, cabinet: 'sealed810', cleanLow: 0.35, crossover: 160, bass: 1, mid: 2.5, midFreq: 1000, treble: 0.5, presence: 0.48, depth: 0.25, master: 0.7, sag: 0.4, speakerDrive: 0.32, mic: 0.6, distance: 0.15, air: 0.28, output: -6 } },
        { id: 'night-service', name: 'Night service PRO', description: 'SVT-PRO-inspired hybrid attack and modern ported tens. A clean floor beneath the sizzle.', params: { model: 'svt-pro', drive: 8, cabinet: 'ported410', cleanLow: 0.6, crossover: 170, bass: 1.5, mid: -1, midFreq: 450, treble: 1.5, presence: 0.55, depth: 0.3, master: 0.4, sag: 0.1, speakerDrive: 0.15, mic: 0.65, distance: 0.1, air: 0.45, output: -5 } }
      ]
    }
  ];
  if (scope.LoomVocalCatalog) catalog.push(...(Array.isArray(scope.LoomVocalCatalog) ? scope.LoomVocalCatalog : [scope.LoomVocalCatalog]));
  if (scope.LoomUtilityCatalog) catalog.push(...(Array.isArray(scope.LoomUtilityCatalog) ? scope.LoomUtilityCatalog : [scope.LoomUtilityCatalog]));
  catalog.forEach(effect => { effect.params.push(range('mix', 'Dry / wet', 0, 1, 0.01, effect.defaults.mix, '')); if (effect.presets) effect.presets.forEach(preset => { preset.params = Object.assign({}, effect.defaults, preset.params); }); });
  scope.LoomEffectsCatalog = catalog;
})(typeof window === 'undefined' ? globalThis : window);
