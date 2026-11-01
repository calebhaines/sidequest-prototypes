/* SUNDAY · five circuit studies of one Deluxe Reverb, with the touch left in. */
(function (scope) {
  'use strict';
  const range = (key, label, min, max, step, value, unit = '') => ({ key, label, type: 'range', min, max, step, default: value, unit });
  const select = (key, label, value, options) => ({ key, label, type: 'select', default: value, options: options.map(([value, label]) => ({ value, label })) });
  const models = [
    { id: 'nodal', letter: 'A', name: 'Open clean', method: 'Implicit triode load-line', description: 'A load-line study of the AB763 gain stages and push-pull output pair. Iterative triode and output-stage solves provide the reference interpretation, with a wide clean region before the valves bend.', listeningNotes: 'Start here. Compare the body of a lightly picked chord with the attack of the same chord played firmly.' },
    { id: 'charge', letter: 'B', name: 'Elastic edge', method: 'Grid charge and cathode memory', description: 'A separate stateful formulation adds coupling-charge and cathode memory around nonlinear grid conduction. The stages retain a little of the recent overload history while recovering between phrases.', listeningNotes: 'Turn Volume up, play a strong chord, then a softer note. Listen to the way the edge recovers rather than only its brightness.' },
    { id: 'feedback', letter: 'C', name: 'Firm response', method: 'Implicit global-feedback solve', description: 'A bounded feedback solve surrounds the 6V6-style output pair. This interpretation treats the negative-feedback interaction inside the nonlinear calculation, giving a different transition from clean output to driven response.', listeningNotes: 'Compare low-string pick definition and how firmly a loud chord holds together as the output stage is pushed.' },
    { id: 'adaa', letter: 'D', name: 'Smooth breakup', method: 'Antiderivative anti-aliasing', description: 'An antiderivative formulation evaluates the nonlinear triode and output-pair laws over each sample interval. It is a distinct way of handling the curved transfer and breakup detail within the same amp platform.', listeningNotes: 'Try sustained upper notes and double-stops at a pushed Volume setting; compare the grain of the decay and upper edge.' },
    { id: 'reactive', letter: 'E', name: 'Reactive feel', method: 'Dynamic conductance and reactive load', description: 'A conductance-based formulation feeds transformer and speaker-load state back into the amplifier response. It emphasizes the interaction of the driven circuit and its changing load.', listeningNotes: 'Compare a low chord followed by a short high note. Adjust Speaker load to explore how the returning energy changes the feel.' }
  ];
  const params = [
    select('model', 'Emulation', 'nodal', models.map(model => [model.id, model.letter + ' · ' + model.name])),
    range('input', 'Input trim', -24, 18, .1, 0, 'dB'),
    range('volume', 'Volume', 0, 10, .1, 3), range('bass', 'Bass', 0, 10, .1, 5), range('treble', 'Treble', 0, 10, .1, 5),
    range('reverb', 'Reverb', 0, 10, .1, 2), range('speed', 'Speed', 1, 10, .1, 4), range('intensity', 'Intensity', 0, 10, .1, 0),
    range('output', 'Output trim', -30, 12, .1, 0, 'dB'),
    select('channel', 'Amp channel', 'vibrato', [['vibrato', 'Vibrato · reverb & tremolo'], ['normal', 'Normal · dry channel']]),
    select('jack', 'Input jack', 'high', [['high', 'Input 1 · full sensitivity'], ['low', 'Input 2 · −6 dB']]),
    range('headroom', 'Extra headroom', -12, 12, .1, 0, 'dB'), range('mid', 'Mid resistor', 0, 10, .1, 5),
    select('bright', 'Bright capacitor', 'stock', [['stock', 'Stock · follow channel'], ['off', 'Off'], ['on', 'On · 47 pF']]),
    range('supply', 'Supply voltage', .8, 1.2, .01, 1, '×'), range('bias', 'Output bias', -.5, .5, .01, 0), range('sag', 'Supply sag', 0, 1, .01, .2), range('feedback', 'Negative feedback', 0, 1, .01, .5),
    range('speakerDrive', 'Speaker breakup', 0, 1, .01, 0), range('speakerLoad', 'Speaker load', 0, 1, .01, .5),
    select('cabinet', 'Cabinet', 'open112', [['open112', 'Open-back 1 × 12'], ['di', 'DI · external cabinet']]),
    range('mic', 'Mic position', 0, 1, .01, .45), range('distance', 'Mic distance', 0, 1, .01, .2), range('air', 'Air', 0, 1, .01, .2),
    select('stereo', 'Amp routing', 'mono', [['mono', 'Mono · one combo'], ['stereo', 'Stereo · two paths']]),
    select('trim', 'Comparison trim', 'matched', [['matched', 'Matched · fixed clean-level trim'], ['raw', 'Raw model level']]),
    select('quality', 'Nonlinear quality', 'high', [['high', 'High · 4×'], ['eco', 'Economy · 2×']])
  ];
  const defaults = Object.assign(Object.fromEntries(params.map(param => [param.key, param.default])), { mix: 1, bypass: false });
  const recipe = (id, name, description, patch = {}) => ({ id, name, description, params: { ...defaults, ...patch } });
  const clean = { volume: 3, reverb: 0, intensity: 0, speakerDrive: 0, trim: 'matched', quality: 'high' };
  scope.LoomDeluxeCatalog = [{
    id: 'sunday', name: 'SUNDAY', subtitle: 'One familiar combo. Five ways to find its touch.', inspiration: 'Fender Deluxe Reverb AB763 · 22 W / fixed-bias 6V6 pair', color: '#b6b8aa', accent: '#ecdcb6', visual: 'deluxe', panel: 'deluxe', mixLabel: 'Blend',
    description: 'Five original circuit-informed interpretations of the Fender Deluxe Reverb AB763 platform: 12AX7-style gain stages, a scooped passive tone stack, a 6V6-style push-pull output pair, spring reverb, optical-style tremolo and an open-back 1 × 12. Change A–E while keeping the controls in place, then compare soft and firm picking. Each uses a separate nonlinear or stateful amp formulation. The clean region preserves input-level changes; overload, supply and speaker response emerge as the amp is driven. These are original reduced-order models informed by the circuit, with a shared cabinet platform for comparison.',
    params, defaults, models,
    normalInactive: ['reverb', 'speed', 'intensity'],
    cabinetInactive: ['speakerDrive', 'mic', 'distance', 'air'], diLoadModels: models.map(model => model.id),
    groups: [
      { id: 'main', section: 'main', label: 'At the amplifier', help: 'Select one of five emulations without resetting your knobs. Volume sets amp drive and changes the bright-cap interaction; Output sets listening level after the amp. Bass and Treble interact in the passive tone stack. Reverb, Speed and Intensity belong to the Vibrato channel. Its historic Vibrato control is amplitude tremolo, so it changes level rather than pitch.', keys: ['model', 'channel', 'input', 'volume', 'bass', 'treble', 'reverb', 'speed', 'intensity', 'output', 'mix'] },
      { id: 'input', section: 'advanced', label: 'Input & comparison', help: 'Input trim calibrates your recorded or monitored instrument. Input 2 has fixed lower sensitivity. Matched applies a fixed per-model clean-level trim so quiet-to-loud playing is retained; Raw leaves each model at its own level. Use Output to compare driven sounds at a similar listening level. Extra headroom moves the virtual overload margin; zero is the stock starting point. High uses 4× nonlinear processing and Economy uses 2×. Mono folds the wet source into one combo; Stereo processes the two source channels separately.', keys: ['jack', 'headroom', 'trim', 'quality', 'stereo'] },
      { id: 'circuit', section: 'advanced', label: 'Circuit bench', help: 'The hardware has no Mid knob: Mid resistor at 5 represents its stock 6.8 kΩ leg. Other values explore departures from that fixed network. Stock Bright follows the channel: the Vibrato path has the 47 pF volume bright capacitor and Normal does not. Supply voltage, Output bias, Supply sag and Negative feedback let you explore the operating point. Supply and sag recovery concern driven circuit behavior; the input is not automatically leveled. Start from stock values to compare the five methods fairly.', keys: ['mid', 'bright', 'supply', 'bias', 'sag', 'feedback'] },
      { id: 'cabinet', section: 'advanced', label: 'Speaker & microphone', help: 'The open-back 1 × 12 is an original speaker/cabinet interpretation shared by all five methods. Mic position, distance and Air set the recording perspective. Speaker breakup starts at zero to retain a clean attack; raise it deliberately for a harder-worked cone. Speaker load changes the shared cabinet network and each amplifier’s feedback/load interaction; E adds a stronger dynamic reactive coupling. The control remains active with DI, which removes the built-in cabinet and microphone path while retaining amplifier load response for an external cabinet processor.', keys: ['cabinet', 'speakerLoad', 'speakerDrive', 'mic', 'distance', 'air'] }
    ],
    meters: [
      { key: 'inputDb', label: 'Input peak', unit: 'dBFS' }, { key: 'outputDb', label: 'Output peak', unit: 'dBFS' },
      { key: 'inputRmsDb', label: 'Input RMS', unit: 'dBFS' }, { key: 'outputRmsDb', label: 'Output RMS', unit: 'dBFS' },
      { key: 'inputCrestDb', label: 'Input crest', unit: 'dB' }, { key: 'outputCrestDb', label: 'Output crest', unit: 'dB' },
      { key: 'headroomDb', label: 'Power-stage margin', unit: 'dB' }, { key: 'sagDb', label: 'Supply movement', unit: 'dB' }
    ],
    presets: [
      recipe('clean-comparison', 'Clean comparison', 'A common dry starting point for A–E. Change only the emulation and play the same passage softly, then firmly.', clean),
      ...models.map(model => recipe('clean-' + model.id, model.letter + ' · ' + model.name, 'The same dry clean-comparison controls, using ' + model.name + '. All five clean recipes differ only in emulation.', { ...clean, model: model.id })),
      recipe('edge-of-sunday', 'Edge of Sunday', 'Raise amp Volume for touch-dependent breakup, with a restrained spring and lower listening trim.', { volume: 6.3, reverb: 1.4, output: -5 }),
      recipe('normal-breakfast', 'Normal breakfast', 'The simpler dry Normal channel, with moderate volume and no stock volume bright capacitor.', { channel: 'normal', volume: 4.5, bass: 4.2, treble: 5.8, reverb: 0 }),
      recipe('spring-table', 'Spring at the table', 'A clean, bright Vibrato-channel voice with a generous spring return. Pull Reverb down to judge the dry touch.', { model: 'charge', volume: 3.8, bass: 3.5, treble: 6.2, reverb: 7.5, output: -1 }),
      recipe('optical-evening', 'Optical evening', 'A moderate optical-style pulse and quiet spring behind an open amp response. Speed sets the tremolo rate.', { model: 'feedback', volume: 4.2, speed: 4.2, intensity: 5.5, reverb: 2.5 }),
      recipe('second-input', 'Second input', 'The lower-sensitivity input leaves more room for a hotter pickup or an already-strong recorded signal.', { jack: 'low', volume: 4.3, bass: 4.5, treble: 5.3, reverb: 1.5 }),
      recipe('external-cabinet', 'Bring another cabinet', 'The amp with its built-in cabinet/microphone path removed. Follow SUNDAY with an external cabinet processor.', { cabinet: 'di', reverb: 0, intensity: 0 })
    ]
  }];
})(typeof window === 'undefined' ? globalThis : window);
