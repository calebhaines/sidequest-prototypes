/* SWIRL and CRUMBLE · phase motion and deliberately imperfect digital texture. */
(function (scope) {
  'use strict';
  const range = (key, label, min, max, step, value, unit = '') => ({ key, label, type: 'range', min, max, step, default: value, unit });
  const select = (key, label, value, options) => ({ key, label, type: 'select', default: value, options: options.map(([value, label]) => ({ value, label })) });
  const divisions = [['1/32', '1/32 note'], ['1/16', '1/16 note'], ['1/8', 'Eighth note'], ['1/8.', 'Dotted eighth'], ['1/4', 'Quarter note'], ['1/2', 'Half note'], ['1', 'One bar'], ['2', 'Two bars'], ['4', 'Four bars']];
  const swirl = [
    select('stages', 'All-pass stages', '8', [['4', '4 · broad'], ['8', '8 · deep'], ['12', '12 · dense']]),
    range('center', 'Sweep centre', 40, 6000, 1, 650, 'Hz'), range('spread', 'Stage spread', 0, 3, .01, 1.2, 'oct'),
    range('feedback', 'Feedback', -.85, .85, .01, .3), select('polarity', 'Cancellation', 'add', [['add', 'Add · classic notches'], ['subtract', 'Subtract · hollow']]),
    select('clock', 'LFO clock', 'sync', [['sync', 'Tempo sync'], ['free', 'Free rate']]), range('rate', 'Free rate', .02, 8, .01, .25, 'Hz'), select('division', 'LFO cycle', '1', divisions),
    select('shape', 'LFO shape', 'sine', [['sine', 'Sine'], ['triangle', 'Triangle']]), range('depth', 'LFO sweep', 0, 72, .1, 30, 'st'), range('stereo', 'Stereo phase', 0, 180, 1, 90, '°'),
    range('envAmount', 'Envelope sweep', -48, 48, .1, 0, 'st'), range('sensitivity', 'Detector gain', -36, 24, .1, 6, 'dB'), range('attack', 'Envelope attack', .2, 200, .1, 8, 'ms'), range('release', 'Envelope release', 5, 2000, 1, 240, 'ms'),
    range('output', 'Output trim', -24, 12, .1, 0, 'dB')
  ];
  const crumble = [
    range('bits', 'Bit depth', 2, 16, .1, 10, 'bits'), range('sampleRate', 'Sample clock', 100, 48000, 1, 12000, 'Hz'), range('jitter', 'Clock jitter', 0, 1, .01, .08),
    range('dither', 'Triangular dither', 0, 1, .01, 0), select('stereo', 'Sample clocks', 'linked', [['linked', 'Linked stereo'], ['independent', 'Independent · wandering stereo']]),
    select('prefilter', 'Alias character', 'raw', [['raw', 'Raw · aliasing'], ['soft', 'Soft · input low-pass']]), range('drive', 'Input drive', 0, 24, .1, 0, 'dB'),
    range('tone', 'Output low-pass', 500, 20000, 1, 12000, 'Hz'), range('transient', 'Recover attacks', 0, 1, .01, .15), range('output', 'Output trim', -24, 12, .1, -3, 'dB')
  ];
  scope.LoomCreativeCatalog = [
    {
      id: 'swirl', name: 'SWIRL', subtitle: 'Fold the phase. Keep the spoon moving.', color: '#89b9ba', accent: '#e4cf97', visual: 'swirl', panel: 'creative',
      description: 'A stereo phaser with four, eight, or twelve all-pass stages. Phase cancellation makes moving notches; a tempo-synced or free LFO and an input envelope move them independently. Signed feedback and alternate cancellation change the character without using a delay-line chorus.',
      meters: [{ key: 'centerLeftHz', label: 'Left sweep centre', unit: 'Hz' }, { key: 'centerRightHz', label: 'Right sweep centre', unit: 'Hz' }, { key: 'envelope', label: 'Envelope', unit: '%' }, { key: 'rateHz', label: 'LFO rate', unit: 'Hz' }, { key: 'inputDb', label: 'Input peak', unit: 'dB' }, { key: 'outputDb', label: 'Output peak', unit: 'dB' }],
      params: swirl, defaults: Object.assign(Object.fromEntries(swirl.map(p => [p.key, p.default])), { mix: 1, bypass: false }),
      groups: [
        { id: 'phase', label: '01 · Fold the phase', description: 'Stage count sets the number of moving notches. Centre and stage spread place the all-pass poles; feedback sharpens the cancellations. Subtract changes the internal dry/phase relationship.', keys: ['stages', 'center', 'spread', 'feedback', 'polarity'] },
        { id: 'motion', label: '02 · Keep stirring', description: 'The LFO sweeps symmetrically around the centre in semitones. Tempo sync follows GALLEY’s musical position; Free rate keeps moving while the transport is stopped. Stereo phase offsets the right-hand sweep.', keys: ['clock', 'division', 'rate', 'shape', 'depth', 'stereo'] },
        { id: 'envelope', label: '03 · Follow the serving', description: 'A stereo-linked peak envelope follows the stronger channel, so opposing stereo signals still trigger the sweep. Positive amounts open the phase network; negative amounts close it. Detector gain changes its sensitivity.', keys: ['envAmount', 'sensitivity', 'attack', 'release'] },
        { id: 'output', label: '04 · At the pass', description: 'SWIRL’s wet signal already combines the all-pass network with an internal dry signal to make notches. Use Dry / wet for a gentler effect. No lookahead or intentional audio delay is added.', keys: ['output', 'mix'] }
      ],
      presets: [
        { id: 'slow-fold', name: 'Slow fold', description: 'A deep stereo sweep over two bars. Good on sustained chords and strings.', params: { stages: '8', division: '2', depth: 36, stereo: 100, feedback: .35 } },
        { id: 'four-spoons', name: 'Four spoons', description: 'Broad classic four-stage movement with a quarter-note pulse.', params: { stages: '4', division: '1/4', center: 900, spread: .8, depth: 22, stereo: 35, feedback: .15 } },
        { id: 'responsive-sauce', name: 'Responsive sauce', description: 'No LFO: each played attack lifts the phaser, then settles back.', params: { stages: '8', center: 280, depth: 0, envAmount: 36, sensitivity: 12, attack: 3, release: 350, stereo: 0, feedback: .45 } },
        { id: 'inside-out', name: 'Inside out', description: 'Twelve stages, reverse feedback and subtract cancellation for a hollow wide swirl.', params: { stages: '12', clock: 'free', rate: .17, center: 1200, depth: 42, spread: 2.1, feedback: -.65, polarity: 'subtract', stereo: 180, output: -2 } },
        { id: 'held-fold', name: 'Held fold', description: 'A stationary phase sculpture. Move the centre by hand or automate it.', params: { stages: '8', center: 800, spread: 1, feedback: .3, depth: 0, envAmount: 0, stereo: 0 } }
      ]
    },
    {
      id: 'crumble', name: 'CRUMBLE', subtitle: 'Digital crumbs. All the useful imperfections.', color: '#c4ab83', accent: '#f1d6a0', visual: 'crumble', panel: 'creative',
      description: 'A deliberate digital reducer with fractional bit depth, a reduced sample clock, seeded clock jitter, signal-gated triangular dither, and optional input filtering. Recover attacks in parallel and soften the result with an output low-pass. Raw mode deliberately aliases; this is a texture effect, not a transparent sample-rate converter.',
      meters: [{ key: 'effectiveRateHz', label: 'Sample clock', unit: 'Hz' }, { key: 'bitDepth', label: 'Bit depth', unit: 'bits' }, { key: 'transient', label: 'Attack detector', unit: '%' }, { key: 'clockJitter', label: 'Clock jitter', unit: '%' }, { key: 'inputDb', label: 'Input peak', unit: 'dB' }, { key: 'outputDb', label: 'Output peak', unit: 'dB' }],
      params: crumble, defaults: Object.assign(Object.fromEntries(crumble.map(p => [p.key, p.default])), { mix: .65, bypass: false }),
      groups: [
        { id: 'digital', label: '01 · Make the crumbs', description: 'Bit depth quantizes amplitude; Sample clock holds each sample until the next capture. Lower clocks fold high frequencies into inharmonic aliases. Jitter varies capture spacing, and independent clocks can spread that movement across stereo.', keys: ['bits', 'sampleRate', 'jitter', 'stereo'] },
        { id: 'character', label: '02 · Choose the texture', description: 'Dither adds a small triangular noise before quantization only while an input sample is present. Soft mode low-passes the input before reduction to soften aliases. Input drive pushes the quantizer into clipping.', keys: ['dither', 'prefilter', 'drive'] },
        { id: 'finish', label: '03 · Save the good bits', description: 'Recover attacks blends original transients back around the reducer. Output low-pass softens digital edges. Dry / wet is a parallel blend with the original stereo input; no lookahead is used.', keys: ['transient', 'tone', 'output', 'mix'] }
      ],
      presets: [
        { id: 'old-sampler', name: 'Old sampler', description: 'Twelve-bit texture and a softened 22 kHz clock, with attacks intact.', params: { bits: 12, sampleRate: 22000, jitter: .02, prefilter: 'soft', tone: 10000, transient: .35, mix: 1, output: 0 } },
        { id: 'crumb-trail', name: 'Crumb trail', description: 'Crunchy six-bit steps and an audible wandering clock.', params: { bits: 6, sampleRate: 6000, jitter: .3, tone: 10000, transient: .15, mix: .8, output: -3 } },
        { id: 'broken-ticket', name: 'Broken ticket printer', description: 'Four bits at 2.8 kHz: hard, sputtering digital punctuation.', params: { bits: 4, sampleRate: 2800, jitter: .45, drive: 6, tone: 8000, transient: 0, mix: 1, output: -6 } },
        { id: 'dusty-stereo', name: 'Dusty stereo', description: 'Independent clock errors and dither make quiet notes roughen and drift.', params: { bits: 8, sampleRate: 10000, jitter: .7, dither: .5, stereo: 'independent', tone: 7000, mix: .7, output: -2 } },
        { id: 'soft-crust', name: 'Soft crust', description: 'A narrow sample clock under a smooth top, with the first bite recovered.', params: { bits: 9, sampleRate: 4000, prefilter: 'soft', jitter: 0, tone: 2200, transient: .7, mix: .75, output: 0 } }
      ]
    }
  ];
})(typeof window === 'undefined' ? globalThis : window);
