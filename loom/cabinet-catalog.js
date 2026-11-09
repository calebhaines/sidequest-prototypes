/* CUPBOARD · original cabinet, speaker and body responses with four microphones. */
(function (scope) {
  'use strict';
  const range = (key, label, min, max, step, value, unit = '') => ({ key, label, type: 'range', min, max, step, default: value, unit });
  const select = (key, label, value, options) => ({ key, label, type: 'select', default: value, options: options.map(([value, label]) => ({ value, label })) });
  const models = [
    { id: 'open112', name: 'Open one-twelve', category: 'Cabinets', reference: 'American open-back 1 × 12 family', description: 'An airy open-back guitar cabinet, with a rounded low resonance and a clear paper-cone edge.' },
    { id: 'tweed110', name: 'Small tweed ten', category: 'Cabinets', reference: 'Small open-back 1 × 10 combo family', description: 'A compact, woody ten-inch voice with less deep bass and a lively upper-mid bite.' },
    { id: 'british212', name: 'British two-twelve', category: 'Cabinets', reference: 'British open-back 2 × 12 family', description: 'A broad, chiming pair of guitar speakers with a more open low-mid response.' },
    { id: 'british412', name: 'British four-twelve', category: 'Cabinets', reference: 'Closed-back British 4 × 12 family', description: 'A closed cabinet with a firm low-mid push and a textured guitar-speaker rolloff.' },
    { id: 'modern412', name: 'Modern four-twelve', category: 'Cabinets', reference: 'Modern high-power closed 4 × 12 family', description: 'A tighter, deeper cabinet interpretation with a pronounced upper-mid attack.' },
    { id: 'bass410', name: 'Ported four-ten', category: 'Cabinets', reference: 'Ported bass 4 × 10 family', description: 'Fast bass-speaker definition, a ported low end and a restrained high-frequency edge.' },
    { id: 'bass810', name: 'Sealed eight-ten', category: 'Cabinets', reference: 'Sealed bass 8 × 10 family', description: 'A substantial sealed bass enclosure with an even low-mid body and compact cone attack.' },
    { id: 'bass115', name: 'Deep one-fifteen', category: 'Cabinets', reference: 'Bass reflex 1 × 15 family', description: 'A large bass speaker with a lower, rounder resonance and a softer upper range.' },
    { id: 'rotary', name: 'Rotary enclosure · still', category: 'Speakers', reference: 'Rotary-speaker enclosure at a fixed orientation', description: 'Horn-and-drum enclosure coloration at a stationary orientation. This response does not add rotary modulation.' },
    { id: 'radio', name: 'Table radio', category: 'Speakers', reference: 'Small paper radio speaker and enclosure', description: 'A narrow paper-cone voice, with small-box resonances and a worn midrange focus.' },
    { id: 'megaphone', name: 'Public address', category: 'Speakers', reference: 'Portable megaphone and public-address horn', description: 'An assertive, sharply focused midrange with little deep bass or top-octave air.' },
    { id: 'horn', name: 'Folded horn', category: 'Speakers', reference: 'Large folded horn loudspeaker', description: 'A resonant horn path with a forceful acoustic focus and distinct reflection spacing.' },
    { id: 'electrostatic', name: 'Charged panel', category: 'Speakers', reference: 'Dipole electrostatic loudspeaker panel', description: 'A light, extended panel character with a different low-frequency and off-axis balance.' },
    { id: 'underwater', name: 'Submerged driver', category: 'Speakers', reference: 'Creative submerged-radiator interpretation', description: 'A dense, dark pressure response with water-like modal color. An imagined recording surface, rather than a measured underwater capture.' },
    { id: 'acousticguitar', name: 'Guitar soundbox', category: 'Bodies', reference: 'Air and wood modes of an acoustic guitar body', description: 'Coupled wood-and-air resonances put a plucked soundbox around the source.' },
    { id: 'violin', name: 'Violin body', category: 'Bodies', reference: 'Small bowed-string body resonances', description: 'A compact, focused wooden resonator with a bright bridge-like response.' },
    { id: 'cello', name: 'Cello body', category: 'Bodies', reference: 'Large bowed-string body resonances', description: 'A broader, lower wooden body that emphasizes singing low and middle resonances.' },
    { id: 'grandpiano', name: 'Piano soundboard', category: 'Bodies', reference: 'Piano soundboard and coupled modal resonances', description: 'A wide resonant surface with a more complex, lingering pattern of modal reflections.' },
    { id: 'metalbowl', name: 'Bronze mixing bowl', category: 'Bodies', reference: 'Inharmonic metal-bowl modes', description: 'An uneven family of metallic modes. Useful for turning ordinary attacks into a struck resonant vessel.' },
    { id: 'woodenbox', name: 'Wooden crate', category: 'Bodies', reference: 'Hollow wooden box and panel resonances', description: 'A hollow wooden enclosure with a papery knock and short internal reflections.' }
  ];
  const mics = [
    { id: 'dynamic57', name: 'Needle 57 · dynamic', shortName: '57 dynamic', reference: 'Shure SM57 cardioid moving-coil family', description: 'A cardioid dynamic interpretation with close-mic presence and a useful upper-mid edge.' },
    { id: 'dynamic421', name: 'Broad 421 · dynamic', shortName: '421 dynamic', reference: 'Sennheiser MD421 cardioid moving-coil family', description: 'A fuller dynamic family for the body of a cabinet, with a broad presence region.' },
    { id: 'dynamic20', name: 'Low 20 · dynamic', shortName: '20 dynamic', reference: 'Electro-Voice RE20 directional moving-coil family', description: 'A low-reaching dynamic family with restrained proximity buildup and a smooth upper range.' },
    { id: 'ribbon121', name: 'Ribbon 121', shortName: '121 ribbon', reference: 'Royer R121 figure-eight ribbon family', description: 'A softer ribbon-style top end and substantial low-mid weight. Position and angle change its balance.' },
    { id: 'ribbon160', name: 'Ribbon 160', shortName: '160 ribbon', reference: 'Beyerdynamic M160 hypercardioid double-ribbon family', description: 'A focused double-ribbon family with a narrower pickup interpretation and rounded top.' },
    { id: 'condenser87', name: 'Large 87 · cardioid', shortName: '87 condenser', reference: 'Neumann U87 large-diaphragm family, fixed cardioid interpretation', description: 'A large-diaphragm cardioid interpretation, combining low-mid body with a detailed presence region.' },
    { id: 'condenser414', name: 'Square 414 · cardioid', shortName: '414 condenser', reference: 'AKG C414 large-diaphragm family, fixed cardioid interpretation', description: 'A broad, open condenser-style response for distant cabinet sound and resonant bodies.' },
    { id: 'small184', name: 'Pencil 184', shortName: '184 pencil', reference: 'Neumann KM184 small-diaphragm cardioid family', description: 'A small-diaphragm cardioid family with precise attack and a light upper-frequency lift.' },
    { id: 'omni', name: 'Omni measurement', shortName: 'Omni', reference: 'Omnidirectional pressure measurement microphone', description: 'An open pressure pickup with minimal directional shading, useful for hearing more of the modeled response.' },
    { id: 'contact', name: 'Contact pickup', shortName: 'Contact', reference: 'Piezo contact-transducer family', description: 'A surface-coupled pickup interpretation. Placement shapes body modes; distance is a creative coupling perspective, rather than a literal air-microphone spacing.' }
  ];
  const params = [
    select('model', 'Cabinet / speaker / body', 'open112', models.map(model => [model.id, model.name])),
    range('input', 'Input trim', -24, 24, .1, 0, 'dB'), range('output', 'Output trim', -24, 12, .1, 0, 'dB'),
    select('stereo', 'Source routing', 'mono', [['mono', 'Mono · one source'], ['split', 'Stereo · preserve both channels']]),
    select('alignment', 'Arrival alignment', 'aligned', [['aligned', 'Aligned · common arrival'], ['natural', 'Natural · retain travel time']]),
    range('lowCut', 'Low cut', 20, 400, 1, 40, 'Hz'), range('highCut', 'High cut', 1500, 20000, 1, 18000, 'Hz'), range('room', 'Room reflections', 0, 1, .01, 0)
  ];
  const positions = [
    { Enabled: 'on', Type: 'dynamic57', X: 0, Y: 0, Distance: .08, Angle: 0, Level: 0, Pan: 0 },
    { Enabled: 'off', Type: 'ribbon121', X: -.3, Y: 0, Distance: .18, Angle: 20, Level: -6, Pan: -.25 },
    { Enabled: 'off', Type: 'condenser87', X: .45, Y: 0, Distance: .65, Angle: -25, Level: -9, Pan: .25 },
    { Enabled: 'off', Type: 'omni', X: 0, Y: 0, Distance: 1.8, Angle: 0, Level: -12, Pan: 0 }
  ];
  for (let i = 1; i <= 4; i++) {
    const prefix = 'mic' + i, d = positions[i - 1], label = 'Mic ' + i + ' ';
    params.push(select(prefix + 'Enabled', label + 'power', d.Enabled, [['on', 'On'], ['off', 'Off']]), select(prefix + 'Type', label + 'type', d.Type, mics.map(mic => [mic.id, mic.name])),
      range(prefix + 'X', label + 'across face', -1, 1, .01, d.X), range(prefix + 'Y', label + 'height', -1, 1, .01, d.Y), range(prefix + 'Distance', label + 'distance', .02, 3, .01, d.Distance, 'm'),
      range(prefix + 'Angle', label + 'angle', -180, 180, 1, d.Angle, '°'), range(prefix + 'Level', label + 'level', -60, 12, .1, d.Level, 'dB'), range(prefix + 'Pan', label + 'pan', -1, 1, .01, d.Pan),
      select(prefix + 'Polarity', label + 'polarity', 'normal', [['normal', 'Normal'], ['invert', 'Invert']]), select(prefix + 'Solo', label + 'solo', 'off', [['off', 'Off'], ['on', 'Solo']])
    );
  }
  const defaults = Object.assign(Object.fromEntries(params.map(param => [param.key, param.default])), { mix: 1, bypass: false });
  const recipe = (id, name, description, patch = {}) => ({ id, name, description, params: { ...defaults, ...patch } });
  scope.LoomCabinetCatalog = [{
    id: 'cupboard', name: 'CUPBOARD', subtitle: 'Something to speak through. Somewhere to listen.', color: '#c7a879', accent: '#eee1b5', visual: 'cabinet', panel: 'cabinet', mixLabel: 'Dry / cabinet',
    description: 'Twenty original modeled impulse responses span guitar and bass cabinets, unusual speakers and resonant bodies. Blend up to four microphone interpretations and place each across the face, at a height, distance and angle. Close and distant perspectives affect the sound; natural arrival offsets can be retained or aligned. Place after an amplifier with its built-in cabinet set to DI, or use a body as a creative resonator.',
    params, defaults, models, mics, microphones: mics, positions: 4,
    groups: [
      { id: 'source', label: 'Source & arrival', keys: ['stereo', 'alignment'], help: 'Mono uses one summed source; Stereo retains the two input channels. Natural keeps microphone travel-time offsets, which can create phase interaction. Aligned compensates the relative arrival offsets while retaining each microphone’s tone and perspective.' },
      { id: 'finish', label: 'Finishing filters & room', keys: ['lowCut', 'highCut', 'room'], help: 'Low cut and High cut shape the completed microphone blend. Room adds modeled early reflections. With several microphones, adjust levels and polarity deliberately; no automatic gain riding changes your performance.' }
    ],
    meters: [{ key: 'inputDb', label: 'Input peak', unit: 'dBFS' }, { key: 'outputDb', label: 'Output peak', unit: 'dBFS' }],
    presets: [
      recipe('close-combo', 'Close to the combo', 'A single close dynamic and an open-back one-twelve. A clear starting point after an amp set to DI.'),
      recipe('dynamic-ribbon', 'Two at the grille', 'A close dynamic and a quieter ribbon share a British four-twelve. Aligned arrivals keep the first comparison straightforward.', { model: 'british412', mic2Enabled: 'on', mic2Distance: .11, mic2Level: -7, mic1X: -.12, mic2X: .28 }),
      recipe('wide-bass', 'The bass cupboard', 'A sealed eight-ten with a close large dynamic and a softer pencil perspective.', { model: 'bass810', mic1Type: 'dynamic20', mic1Distance: .12, mic2Enabled: 'on', mic2Type: 'small184', mic2Distance: .65, mic2Level: -12, lowCut: 25, highCut: 12000 }),
      recipe('room-pair', 'A little further back', 'An open two-twelve with a condenser pair and restrained room reflections.', { model: 'british212', mic1Type: 'condenser414', mic1Distance: .55, mic1X: -.32, mic1Pan: -.55, mic1Level: -4, mic2Enabled: 'on', mic2Type: 'condenser414', mic2Distance: .68, mic2X: .32, mic2Pan: .55, mic2Level: -4, room: .2 }),
      recipe('radio-service', 'Staff radio', 'A small paper speaker through one dynamic, for a deliberately narrow voice.', { model: 'radio', mic1Type: 'dynamic57', mic1Distance: .22, mic1Angle: 25, lowCut: 150, highCut: 6500 }),
      recipe('wood-air', 'Wood and air', 'A guitar soundbox with a pencil microphone and a lightly blended contact pickup.', { model: 'acousticguitar', mic1Type: 'small184', mic1X: -.28, mic1Distance: .32, mic2Enabled: 'on', mic2Type: 'contact', mic2X: .4, mic2Distance: .02, mic2Level: -13, highCut: 14000 }),
      recipe('bronze-vessel', 'The bronze vessel', 'A resonant mixing bowl with a close contact pickup and a distant omni. Natural arrival keeps the two perspectives apart.', { model: 'metalbowl', alignment: 'natural', mic1Type: 'contact', mic1X: .45, mic1Distance: .02, mic1Level: -5, mic2Enabled: 'on', mic2Type: 'omni', mic2X: -.4, mic2Distance: 1.25, mic2Level: -11, room: .12 }),
      recipe('charged-room', 'Panel in the room', 'A charged-panel interpretation heard by a large condenser and a quiet room pickup.', { model: 'electrostatic', mic1Type: 'condenser87', mic1Distance: .42, mic2Enabled: 'on', mic2Type: 'omni', mic2Distance: 1.6, mic2Level: -13, mic2Pan: .35, room: .16 })
    ]
  }];
})(typeof window === 'undefined' ? globalThis : window);
