/* SAUTÉ · microphone preamp characters and a small circuit workshop. */
(function (scope) {
  'use strict';
  const range = (key, label, min, max, step, value, unit = '') => ({ key, label, type: 'range', min, max, step, default: value, unit });
  const select = (key, label, value, options) => ({ key, label, type: 'select', default: value, options: options.map(([value, label]) => ({ value, label })) });
  const startingPoint = (colour, impedance, transformer, headroom, bias, feedback, slew) => ({ colour, impedance, transformer, headroom, bias, feedback, slew });
  const models = [
    { id: 'iron-73', name: 'Iron 73', inspiration: 'Neve 1073 class-A transformer preamp family', description: 'A rounded class-A character with a broad low-mid foundation, transformer memory and a restrained high-frequency edge. Push Drive for denser harmonics; lower Feedback for a less restrained transfer.', defaults: startingPoint(.65, 1200, .7, 0, .12, .35, .4) },
    { id: 'clean', name: 'Clear', inspiration: 'Transparent modern microphone preamp reference', description: 'A transparent gain stage. Gain, pad, polarity and tone controls still work; Colour and the circuit workshop are inactive. Useful for comparing a coloured preamp against a clean gain path.', defaults: startingPoint(0, 2400, 0, 12, 0, 1, 0) },
    { id: 'punch-312', name: 'Punch 312', inspiration: 'API 312 / 512 discrete op-amp preamp family', description: 'A forward discrete op-amp character with firmer transients, faster recovery and output-transformer weight. A useful starting point for drums, picked bass and close microphones.', defaults: startingPoint(.65, 1500, .55, 3, -.03, .65, .2) },
    { id: 'console-4k', name: 'Console 4K', inspiration: 'SSL 4000 E / G console microphone preamp family', description: 'A controlled console input with a precise midrange, relatively symmetrical overload and a taut low end. Keep Feedback high for clean service or push the stage into a firmer edge.', defaults: startingPoint(.55, 1200, .12, 5, 0, .8, .18) },
    { id: 'super-9k', name: 'Super 9K', inspiration: 'SSL 9000 J / K SuperAnalogue microphone preamp family', description: 'A wide-band, high-headroom transformerless console character with fast transient handling. Transformer core is inactive; the remaining circuit controls stay available. Its model stays distinct from Clear while leaving more space before overload.', inactiveControls: ['transformer'], defaults: startingPoint(.45, 1500, 0, 10, 0, .92, .06) },
    { id: 'tube-610', name: 'Tube 610', inspiration: 'Universal Audio 610 valve microphone preamp family', description: 'A soft valve front end with asymmetric harmonics, a softer high end and slower overload recovery. Drive and Headroom expose the transition from subtle body to a rounded overdrive.', defaults: startingPoint(.7, 2000, .55, -2, .24, .25, .65) },
    { id: 'redd-47', name: 'Red 47', inspiration: 'EMI REDD.47 valve microphone amplifier', description: 'A lively valve amplifier character with pronounced upper-mid presence and a more immediate bite than Tube 610. Bias shifts the balance of even and odd harmonics without adding constant DC.', defaults: startingPoint(.7, 2400, .6, 1, .18, .4, .32) },
    { id: 'valve-72', name: 'Valve 72', inspiration: 'Telefunken V72 valve microphone amplifier family', description: 'A dense, rounded valve character with a narrower bandwidth, stronger iron memory and a soft overload knee. Useful when a source needs weight and a gentler leading edge.', defaults: startingPoint(.7, 2000, .8, -1, .2, .45, .7) },
    { id: 'helios-69', name: 'Helium 69', inspiration: 'Helios Type 69 console microphone preamp family', description: 'A vivid discrete console character with a focused middle, open upper presence and lively overload. Its voicing is a preamp interpretation; it does not reproduce the full Type 69 equalizer.', defaults: startingPoint(.65, 1200, .5, 1, .08, .3, .3) },
    { id: 'trident-a', name: 'Trident A', inspiration: 'Trident A-Range console microphone preamp family', description: 'A broad discrete console character with a textured midrange and gently rounded transients. The workshop can move it from restrained console colour to a rougher, more asymmetrical sound.', defaults: startingPoint(.6, 1200, .4, 2, .06, .45, .4) },
    { id: 'isa-110', name: 'Blue 110', inspiration: 'Focusrite ISA 110 transformer microphone preamp family', description: 'A clean, extended transformer input with restrained saturation, a firm bottom end and generous headroom. Virtual loading and Transformer core let you add weight while keeping the stage open.', defaults: startingPoint(.5, 1400, .45, 7, .02, .8, .15) },
    { id: 'avalon-737', name: 'Air 737', inspiration: 'Avalon VT-737sp valve preamp section', description: 'An open valve character with a smooth overload curve and a subtle upper lift. This models the preamp family only; it adds no hidden optical compressor or channel-strip equalizer.', defaults: startingPoint(.55, 1500, .3, 6, .16, .55, .3) },
    { id: 'tg-2', name: 'TG Two', inspiration: 'Chandler Limited TG2 / EMI TG transistor amplifier family', description: 'A thick transistor character with assertive upper mids, stronger harmonic density and a transformer-led low end. Lower Headroom and more Drive turn its firm edge into an intentional distortion.', defaults: startingPoint(.7, 1200, .75, -1, -.12, .3, .42) }
  ];
  const params = [
    select('model', 'Preamp model', 'iron-73', models.map(model => [model.id, model.name + (model.id === 'clean' ? ' · transparent' : '')])),
    range('input', 'Input gain', -24, 24, .1, 0, 'dB'), range('drive', 'Drive', 0, 36, .1, 6, 'dB'), range('colour', 'Colour', 0, 1, .01, .65), range('output', 'Output trim', -36, 18, .1, 0, 'dB'),
    select('compensate', 'Drive compensation', 'on', [['on', 'On · trim Drive gain'], ['off', 'Off · keep Drive gain']]),
    select('pad', 'Input pad', 'off', [['off', 'Off'], ['10', '−10 dB'], ['20', '−20 dB']]), select('polarity', 'Wet polarity', 'normal', [['normal', 'Normal'], ['invert', 'Invert']]),
    range('impedance', 'Virtual input loading', 150, 10000, 1, 2400, 'Ω'), range('transformer', 'Transformer core', 0, 1, .01, .5), range('headroom', 'Stage headroom', -12, 18, .1, 0, 'dB'), range('bias', 'Bias asymmetry', -1, 1, .01, 0), range('feedback', 'Circuit feedback', 0, 1, .01, .5), range('slew', 'Slew character', 0, 1, .01, .5),
    range('lowCut', 'High-pass', 0, 400, 1, 0, 'Hz'), range('highCut', 'Low-pass', 2000, 22000, 1, 22000, 'Hz'), range('lowFreq', 'Low shelf frequency', 40, 400, 1, 110, 'Hz'), range('lowGain', 'Low shelf gain', -12, 12, .1, 0, 'dB'), range('highFreq', 'High shelf frequency', 2000, 16000, 1, 6000, 'Hz'), range('highGain', 'High shelf gain', -12, 12, .1, 0, 'dB')
  ];
  const defaults = Object.assign(Object.fromEntries(params.map(param => [param.key, param.default])), { mix: 1, bypass: false });
  // A complete recipe is deliberately different from changing a model: it
  // starts from every house control, then applies that circuit's starting point.
  const recipe = (id, name, description, model, patch = {}) => ({ id, name, description, params: Object.assign({}, defaults, models.find(item => item.id === model).defaults, { model }, patch) });
  scope.LoomPreampCatalog = [{
    id: 'saute', name: 'SAUTÉ', subtitle: 'Prepare the signal. Bring out its character.', color: '#b48b60', accent: '#edcf9b', visual: 'preamp', panel: 'preamp',
    description: 'Twelve classic microphone preamp families and a transparent reference, with distinct reduced-order transfer, bandwidth, transient and transformer-memory responses. Input and Drive set the push; Output trim sets the serving level. Open the workshop for virtual loading, core saturation, headroom, bias, feedback, slew and tone. These are musical circuit interpretations rather than measured replicas of individual units.',
    params, defaults, models,
    groups: [
      { id: 'main', section: 'main', label: 'Preamp face', help: 'Model changes preserve your adjustments. Drive compensation subtracts only the additional Drive gain; it is nominal gain compensation, not automatic loudness matching.', keys: ['model', 'input', 'drive', 'colour', 'output', 'mix', 'compensate'] },
      { id: 'input', section: 'advanced', label: 'Input & routing', help: 'The pad is digital attenuation before Input gain. Virtual loading changes the model’s spectral response; it cannot change your microphone or audio interface impedance. Polarity affects the wet signal, so a partial Dry / wet blend can cancel.', keys: ['pad', 'polarity', 'impedance'] },
      { id: 'circuit', section: 'advanced', label: 'Circuit workshop', help: 'Transformer core changes iron saturation and memory. Headroom shifts the stage’s overload point; Bias changes asymmetry. More Feedback restrains distortion; more Slew character softens fast changes. Clear leaves these circuit controls inactive. Super 9K is transformerless, so its Transformer core control is inactive.', keys: ['transformer', 'headroom', 'bias', 'feedback', 'slew'] },
      { id: 'tone', section: 'advanced', label: 'Tone & cleanup', help: 'The high-pass is off at 0 Hz and the low-pass is off at 22,000 Hz. The two shelves are additional musical controls, not reproductions of each original preamp’s equalizer. Tone, output and wet polarity remain active when Colour is 0.', keys: ['lowCut', 'highCut', 'lowFreq', 'lowGain', 'highFreq', 'highGain'] }
    ],
    meters: [{ key: 'inputDb', label: 'Input', unit: 'dB' }, { key: 'stageDb', label: 'Stage', unit: 'dB' }, { key: 'outputDb', label: 'Output', unit: 'dB' }],
    presets: [
      recipe('iron-house', 'House iron', 'Iron 73 body with moderate Drive, neutral shelves and nominal Drive compensation.', 'iron-73'),
      recipe('punch-close', 'Close-mic punch', 'Punch 312 with a restrained low cut and a little more stage push for close drums.', 'punch-312', { drive: 8, lowCut: 45 }),
      recipe('console-desk', 'At the desk', 'Console 4K precision with light colour and a tidy subsonic floor.', 'console-4k', { drive: 4, colour: .45, lowCut: 25 }),
      recipe('super-open', 'Wide-open service', 'Super 9K headroom and light colour for an open stereo source.', 'super-9k', { drive: 3, colour: .3 }),
      recipe('tube-vocal', 'Warm vocal service', 'Tube 610 at moderate Drive with a vocal high-pass and a soft upper shelf.', 'tube-610', { drive: 9, lowCut: 70, highGain: -.7, highFreq: 9000 }),
      recipe('red-presence', 'Red presence', 'Red 47 presence and a little extra Drive for a source that needs to step forward.', 'redd-47', { drive: 8, lowCut: 45 }),
      recipe('valve-weight', 'Valve weight', 'Valve 72 iron and a gentle high cut for a dense, rounded sound.', 'valve-72', { drive: 8, highCut: 14000 }),
      recipe('helium-room', 'Helium room', 'Helium 69 character for a lively room or rhythm part, with low rumble removed.', 'helios-69', { drive: 7, lowCut: 55 }),
      recipe('trident-texture', 'Textured console', 'Trident A at a controlled level, leaving room for the source’s dynamics.', 'trident-a', { drive: 6 }),
      recipe('blue-detail', 'Blue detail', 'Blue 110 transformer weight with ample headroom and a clean upper range.', 'isa-110', { drive: 4, lowCut: 30 }),
      recipe('air-vocal', 'Air on the pass', 'Air 737 preamp character, a vocal high-pass and a broad upper shelf.', 'avalon-737', { drive: 5, lowCut: 75, highGain: 1.5, highFreq: 10000 }),
      recipe('tg-forward', 'TG forward', 'TG Two with a lower overload point and a slightly denser midrange.', 'tg-2', { drive: 9, headroom: -3, lowCut: 35 }),
      recipe('clear-reference', 'Clear reference', 'Transparent unity reference: no extra Drive, no tone shaping and no coloured circuit.', 'clean', { drive: 0 }),
      recipe('iron-bass', 'Iron for bass', 'Iron 73 foundation with more core memory and a small low shelf.', 'iron-73', { drive: 10, transformer: .85, lowCut: 25, lowFreq: 90, lowGain: 1.5, highCut: 14000 }),
      recipe('tube-breakup', 'Small valve overdrive', 'A deliberate Tube 610 overdrive with lower headroom, full colour and a softened top. Adjust Output for the source.', 'tube-610', { drive: 24, colour: 1, headroom: -7, feedback: .15, highCut: 9000, output: -2 }),
      recipe('parallel-tg', 'Parallel TG edge', 'A strongly driven TG Two blended with the original source. Polarity stays normal for predictable parallel colour.', 'tg-2', { drive: 22, colour: 1, headroom: -5, mix: .25, output: -1 })
    ]
  }];
})(typeof window === 'undefined' ? globalThis : window);
