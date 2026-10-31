/* CHAR · one compact face, fifteen different transfers. */
(function (scope) {
  'use strict';
  const range = (key, label, min, max, step, value, unit = '') => ({ key, label, type: 'range', min, max, step, default: value, unit });
  const models = [
    ['soft', 'Soft saturation', 'The original smooth, symmetrical saturation curve.'],
    ['diode', 'Asymmetric diode', 'The original unequal positive/negative diode knees.'],
    ['fold', 'Wavefolder', 'The original triangular folding transfer.'],
    ['hard', 'Hard clip · silicon', 'A firm symmetrical ceiling and bright clipping edges.'],
    ['cubic', 'Cubic overdrive', 'A rounded polynomial knee that reaches a flat saturation ceiling.'],
    ['arctan', 'Round drive · arctan', 'A broad, gradual knee for softer harmonic density.'],
    ['rectifier', 'Rectifier · octave up', 'Smoothed full-wave rectification emphasizes even harmonics and the upper octave.'],
    ['valve', 'Class-A valve', 'An asymmetric valve transfer with a lightly moving overload point and softened upper range.'],
    ['pushpull', 'Push-pull · crossover', 'A cold complementary stage leaves a small crossover notch around zero.'],
    ['transistor', 'Transistor fuzz', 'Pre-emphasis and unequal cascaded clipping give a forward, grainy fuzz.'],
    ['opamp', 'Op-amp · feedback drive', 'Mid-focused pre-emphasis and rational feedback limiting give a tighter drive.'],
    ['led', 'LED clip · wide headroom', 'A higher clipping threshold preserves more attack before a wide, bright knee.'],
    ['gated', 'Starved fuzz · gate', 'A strong fuzz closes its envelope-controlled gate as the note decays.'],
    ['sinefold', 'Sine fold', 'A smooth periodic transfer folds stronger signals into changing harmonics.'],
    ['broken', 'Broken transistor', 'Unequal clipping and a memory-dependent bias/headroom collapse give a darker, unstable edge.']
  ].map(([id, name, description]) => ({ id, name, description }));
  scope.LoomCharCatalog = {
    id: 'cinder', name: 'CHAR', subtitle: 'A little colour. A small incident.', color: '#ef7648', accent: '#f5bc69', visual: 'embers',
    description: 'Fifteen distortion circuits: the original saturation, diode and wavefolder, plus silicon clipping, cubic and arctan drives, octave rectification, valve and push-pull stages, transistor and gated fuzz, feedback drive, LED clipping, sine folding and a sagging broken transistor. Drive finds each circuit’s knee; Bias changes its symmetry. The twelve new modes use a four-times oversampled nonlinear path and a DC-cleaned output. These are original reduced-order character circuits, not measured replicas.',
    params: [
      { key: 'shape', label: 'Circuit', type: 'select', default: 'soft', options: models.map(model => ({ value: model.id, label: model.name })) },
      range('drive', 'Drive', 0, 36, .1, 8, 'dB'), range('bias', 'Bias', -.75, .75, .01, 0), range('tone', 'Tone', 300, 20000, 1, 10000, 'Hz'), range('output', 'Output gain', -24, 6, .1, -3, 'dB')
    ],
    defaults: { shape: 'soft', drive: 8, bias: 0, tone: 10000, output: -3, mix: .65, bypass: false }, models
  };
})(typeof window === 'undefined' ? globalThis : window);
