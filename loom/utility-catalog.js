/* SCALES · calibration, channel housekeeping, and a properly peculiar balance. */
(function (scope) {
  'use strict';
  const range = (key, label, min, max, step, value, unit) => ({ key, label, type: 'range', min, max, step, default: value, unit: unit || '' });
  const select = (key, label, value, options) => ({ key, label, type: 'select', default: value, options: options.map(([value, label]) => ({ value, label })) });
  const toggle = (key, label, value = 'off') => select(key, label, value, [['off', 'Off'], ['on', 'On']]);
  const params = [
    select('tuner', 'Tuner', 'on', [['on', 'On'], ['off', 'Off']]),
    select('tunerChannel', 'Listen to', 'auto', [['auto', 'Auto · stronger channel'], ['left', 'Left channel'], ['right', 'Right channel'], ['mid', 'Mid · mono sum']]),
    range('reference', 'A4 reference', 430, 450, .1, 440, 'Hz'),
    select('tuning', 'String guide', 'chromatic', [['chromatic', 'Chromatic · any note'], ['guitar', 'Guitar · standard'], ['dropD', 'Guitar · drop D'], ['bass', 'Bass · four strings'], ['bass5', 'Bass · five strings'], ['ukulele', 'Ukulele · high G']]),
    select('target', 'Target selection', 'auto', [['auto', 'Auto · nearest note / string'], ['manual', 'Manual · chosen note']]),
    range('targetNote', 'Target note', 21, 95, 1, 69, 'MIDI'),
    range('sensitivity', 'Minimum input', -90, -24, 1, -60, 'dB'),
    range('tolerance', 'In-tune tolerance', 1, 10, 1, 3, 'cents'),
    range('input', 'Input trim', -24, 24, .1, 0, 'dB'),
    range('output', 'Output trim', -24, 24, .1, 0, 'dB'),
    range('balance', 'Stereo balance', -1, 1, .01, 0, ''),
    select('mode', 'Channel routing', 'stereo', [['stereo', 'Stereo · preserve channels'], ['mono', 'Mono · (L + R) / 2'], ['left', 'Left → both channels'], ['right', 'Right → both channels'], ['swap', 'Swap left and right'], ['mid', 'Mid → both channels'], ['side', 'Side → both channels']]),
    select('polarity', 'Invert polarity', 'normal', [['normal', 'Neither channel'], ['left', 'Left channel'], ['right', 'Right channel'], ['both', 'Both channels']]),
    range('width', 'Stereo width', 0, 2, .01, 1, '%'),
    toggle('monoBass', 'Mono low end'), range('bassFreq', 'Bass crossover', 40, 400, 1, 120, 'Hz'),
    toggle('dc', 'Remove DC offset'), toggle('highpass', 'Low cut'), range('lowcut', 'Low-cut frequency', 20, 500, 1, 30, 'Hz'),
    toggle('lowpass', 'High cut'), range('highcut', 'High-cut frequency', 1000, 20000, 1, 18000, 'Hz'),
    toggle('guard', 'Peak guard'), range('ceiling', 'Final peak ceiling', -24, 0, .1, -1, 'dB'), toggle('mute', 'Mute output')
  ];
  scope.LoomUtilityCatalog = {
    id: 'scales', name: 'SCALES', subtitle: 'Everything weighed. Several things questioned.', color: '#a9cfc3', accent: '#f0d3a0', visual: 'scales', panel: 'utility',
    description: 'A chromatic and string-guided tuner, stereo meters, channel routing, polarity, width, mono bass, cleanup filters, trims, and a final peak guard. The default recipe passes your audio unchanged.',
    params,
    defaults: Object.assign(Object.fromEntries(params.map(p => [p.key, p.default])), { mix: 1, bypass: false }),
    tunings: { chromatic: [], guitar: [40, 45, 50, 55, 59, 64], dropD: [38, 45, 50, 55, 59, 64], bass: [28, 33, 38, 43], bass5: [23, 28, 33, 38, 43], ukulele: [67, 60, 64, 69] },
    groups: [
      { id: 'tuner', label: '01 · Tune the utensils', description: 'Measures one note entering this insert, before its processing. Auto listens to the stronger channel. Pluck one string, let it settle, and mute the others. String guides choose the nearest listed string; manual target holds a chosen note.', keys: ['tuner', 'tunerChannel', 'tuning', 'reference', 'target', 'targetNote', 'sensitivity', 'tolerance'] },
      { id: 'trim', label: '02 · Weigh the portions', description: 'Input trim feeds the utility; output trim sets the processed level. Balance turns down one stereo side without moving audio across channels. The tuner and input reading remain before these trims.', keys: ['input', 'output', 'balance'] },
      { id: 'routing', label: '03 · Rearrange the cutlery', description: 'Choose which channels reach the output, invert polarity, or change stereo width. 100% width preserves stereo; 0% is mono. Mid is (L + R) / 2 and Side is (L − R) / 2, each sent to both outputs. Mono can cancel opposing channels.', keys: ['mode', 'polarity', 'width'] },
      { id: 'bass', label: '04 · Keep the floor steady', description: 'Mono low end progressively narrows the low stereo difference around the crossover while retaining the upper stereo image. Its complementary filters preserve the signal when width is at 100% and mono bass is off.', keys: ['monoBass', 'bassFreq'] },
      { id: 'cleanup', label: '05 · Sweep under the bench', description: 'DC removal recentres a shifted waveform. Low cut removes rumble; high cut softens the top end. Each stage has its own switch. These filters shape sound and can change its phase.', keys: ['dc', 'highpass', 'lowcut', 'lowpass', 'highcut'] },
      { id: 'output', label: '06 · Mind the pass', description: 'Dry / wet blends the processed signal with the original input. Peak guard caps the final blend without lookahead; heavy limiting is hard clipping and can sound rough. Mute silences the final output while the tuner keeps listening. Bypass skips the entire utility, including mute and analysis.', keys: ['mix', 'guard', 'ceiling', 'mute'] }
    ],
    presets: [
      { id: 'calibration', name: 'Calibration · transparent', description: 'Tuner and meters only. Original stereo audio passes through unchanged.', params: {} },
      { id: 'mono-check', name: 'One plate · mono check', description: 'Hear the mono sum to check stereo cancellation. Compare with Bypass.', params: { mode: 'mono' } },
      { id: 'steady-floor', name: 'Steady floor · tidy lows', description: 'Narrows low stereo width around 120 Hz, with DC removal and a gentle 30 Hz rumble cut.', params: { monoBass: 'on', bassFreq: 120, dc: 'on', highpass: 'on', lowcut: 30 } },
      { id: 'left-service', name: 'Left service · mono input', description: 'Feed the left channel to both speakers. The tuner listens to Left.', params: { mode: 'left', tunerChannel: 'left' } },
      { id: 'guarded-pass', name: 'Guarded pass · ceiling', description: 'Keep stereo intact and cap final peaks at −1 dBFS. Lower trim if clipping sounds rough.', params: { guard: 'on', ceiling: -1 } }
    ]
  };
})(typeof window === 'undefined' ? globalThis : window);
