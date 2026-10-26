/* STRAINER · resonant filtering, controlled by the sound going through it. */
(function (scope) {
  'use strict';
  const range = (key, label, min, max, step, value, unit = '') => ({ key, label, type: 'range', min, max, step, default: value, unit });
  const select = (key, label, value, options) => ({ key, label, type: 'select', default: value, options: options.map(([value, label]) => ({ value, label })) });
  const divisions = [['1/32', '1/32 note'], ['1/16', '1/16 note'], ['1/8', '1/8 note'], ['1/8.', 'Dotted eighth'], ['1/4', 'Quarter note'], ['1/2', 'Half note'], ['1', 'One bar'], ['2', 'Two bars'], ['4', 'Four bars']];
  scope.LoomFilterCatalog = [{
    id: 'strainer', name: 'STRAINER', subtitle: 'Let the good frequencies through.', color: '#d8c56f', accent: '#fff0ad', visual: 'strainer', panel: 'creative',
    description: 'A stereo filter with clean state-variable, four-pole ladder, asymmetric diode, and tuned comb resonance. Its linked envelope follower opens or closes the cutoff with your playing; a free or tempo-locked LFO adds motion. All four responses remain available in every circuit. These are original character models, not circuit-exact emulations.',
    params: [
      select('model', 'Resonance circuit', 'clean', [['clean', 'Clean · state variable'], ['ladder', 'Ladder · rounded feedback'], ['diode', 'Diode · asymmetric bite'], ['comb', 'Comb · tuned reflections']]),
      select('mode', 'Filter response', 'lowpass', [['lowpass', 'Low-pass'], ['highpass', 'High-pass'], ['bandpass', 'Band-pass'], ['notch', 'Notch']]),
      select('slope', 'Slope', '12', [['12', '12 dB / octave'], ['24', '24 dB / octave']]),
      range('cutoff', 'Cutoff', 20, 20000, 1, 1200, 'Hz'), range('resonance', 'Resonance', 0, 1, .01, .25, '%'),
      range('drive', 'Input heat', 0, 30, .1, 0, 'dB'), range('output', 'Output trim', -24, 12, .1, 0, 'dB'),
      range('envAmount', 'Envelope sweep', -72, 72, .1, 0, 'st'), range('sensitivity', 'Full-sweep level', -60, 0, .1, -18, 'dB'),
      range('envAttack', 'Envelope attack', .1, 250, .1, 8, 'ms'), range('envRelease', 'Envelope release', 5, 2000, 1, 180, 'ms'),
      select('envMode', 'Detector', 'peak', [['peak', 'Peak · quick transients'], ['rms', 'RMS · body and sustain']]), range('detectorHP', 'Detector low cut', 20, 2000, 1, 35, 'Hz'),
      select('clock', 'LFO clock', 'free', [['free', 'Free rate'], ['sync', 'Follow session tempo']]), select('division', 'LFO cycle', '1', divisions),
      range('rate', 'Free LFO rate', .01, 20, .01, .35, 'Hz'), select('shape', 'LFO shape', 'sine', [['sine', 'Sine'], ['triangle', 'Triangle'], ['saw', 'Rising ramp'], ['samplehold', 'Seeded sample & hold']]),
      range('lfoAmount', 'LFO sweep', 0, 72, .1, 0, 'st'), range('stereo', 'LFO stereo offset', 0, 1, .01, 0, '%'), range('phase', 'LFO starting phase', 0, 360, 1, 0, '°')
    ],
    defaults: { model: 'clean', mode: 'lowpass', slope: '12', cutoff: 1200, resonance: .25, drive: 0, output: 0, envAmount: 0, sensitivity: -18, envAttack: 8, envRelease: 180, envMode: 'peak', detectorHP: 35, clock: 'free', division: '1', rate: .35, shape: 'sine', lfoAmount: 0, stereo: 0, phase: 0, mix: 1, bypass: false },
    groups: [
      { label: '01 · Sieve & resonance', keys: ['model', 'mode', 'slope', 'cutoff', 'resonance', 'drive'], help: 'Choose the circuit and response, then tune its cutoff. More resonance rings around that frequency; Input heat drives the circuit.' },
      { label: '02 · Follow the ingredients', keys: ['envAmount', 'sensitivity', 'envAttack', 'envRelease', 'envMode', 'detectorHP'], help: 'Positive sweep opens with your playing; negative sweep closes. Full-sweep level sets how loud the input must be for the whole sweep. The detector is stereo-linked.' },
      { label: '03 · Stir the spectrum', keys: ['clock', 'division', 'rate', 'shape', 'lfoAmount', 'stereo', 'phase'], help: 'Free rate uses hertz; Follow session tempo uses the cycle. Stereo offset moves the right LFO up to half a cycle. LFO sweep must be above zero to hear motion.' },
      { label: '04 · The pass', keys: ['output', 'mix'], help: 'Trim resonant peaks to match the bypassed level. Dry / wet blends the processed filter with the original signal.' }
    ],
    meters: [{ key: 'cutoffLHz', label: 'Left cutoff', unit: 'Hz' }, { key: 'cutoffRHz', label: 'Right cutoff', unit: 'Hz' }, { key: 'envelopeDb', label: 'Detector', unit: 'dB' }, { key: 'inputDb', label: 'Input peak', unit: 'dB' }, { key: 'outputDb', label: 'Output peak', unit: 'dB' }],
    guides: {
      circuit: 'Clean is a precise state-variable filter. Ladder takes two or four taps from a saturating four-pole feedback chain. Diode adds asymmetric feedback limiting to a state-variable filter. Comb adds cutoff-tuned, damped reflections before the selected state-variable response; its high resonance can ring after the input stops.',
      envelope: 'Positive Envelope sweep opens the filter as the input grows; negative values close it. Full-sweep level is the detector level that reaches the whole sweep: lower values react to quieter playing. The stereo-linked detector uses the stronger channel, so stereo images do not tug the cutoff apart. Detector low cut affects the follower only.',
      motion: 'Free LFO rate works in hertz. Follow session tempo uses LFO cycle instead; one bar means four beats. The stereo offset moves the right LFO up to half a cycle. Slope steepens the selected response; the comb reflections keep their own harmonic spacing.'
    },
    presets: [
      { id: 'clean-sieve', name: 'Clean sieve', description: 'A smooth low-pass starting point; let the cutoff do the work.', params: { cutoff: 2400, resonance: .2, slope: '24' } },
      { id: 'bass-wah', name: 'Bass in the colander', description: 'A quick envelope opens a resonant band with each bass note.', params: { mode: 'bandpass', cutoff: 180, resonance: .52, envAmount: 36, sensitivity: -20, envAttack: 3, envRelease: 140, detectorHP: 25, output: -3 } },
      { id: 'ladder-supper', name: 'Ladder supper', description: 'Rounded four-pole resonance with a touch of heat.', params: { model: 'ladder', slope: '24', cutoff: 850, resonance: .65, drive: 7, envAmount: 24, sensitivity: -18, envRelease: 260, output: -3 } },
      { id: 'diode-pickles', name: 'Diode pickles', description: 'A biting, narrow midrange sweep for sharp ingredients.', params: { model: 'diode', mode: 'bandpass', cutoff: 640, resonance: .7, drive: 12, envAmount: 19, envAttack: 1, envRelease: 100, output: -5 } },
      { id: 'reverse-service', name: 'Reverse service', description: 'Loud notes close the high-pass rather than opening it.', params: { mode: 'highpass', cutoff: 5600, resonance: .4, envAmount: -48, sensitivity: -19, envAttack: 4, envRelease: 280 } },
      { id: 'slow-stir', name: 'Slow stir', description: 'A wide stereo low-pass drifts over two bars.', params: { cutoff: 1100, resonance: .48, clock: 'sync', division: '2', shape: 'triangle', lfoAmount: 30, stereo: .8, output: -2 } },
      { id: 'notch-board', name: 'Notch board', description: 'Opposing notches sweep the stereo field in quarter-note cycles.', params: { mode: 'notch', slope: '24', cutoff: 1500, resonance: .35, clock: 'sync', division: '1/4', lfoAmount: 24, stereo: 1, mix: .8 } },
      { id: 'sieve-jam', name: 'Sieve jam', description: 'A seeded stepped filter changes with every eighth-note cycle.', params: { model: 'diode', cutoff: 1000, resonance: .5, clock: 'sync', division: '1/8', shape: 'samplehold', lfoAmount: 32, stereo: .4, drive: 4, output: -3 } },
      { id: 'cutlery-ring', name: 'Cutlery ringing', description: 'Tuned comb reflections leave a small metallic tail.', params: { model: 'comb', cutoff: 330, resonance: .8, mode: 'lowpass', slope: '12', envAmount: 7, envAttack: 20, envRelease: 400, mix: .65, output: -4 } }
    ]
  }];
})(typeof window === 'undefined' ? globalThis : window);
