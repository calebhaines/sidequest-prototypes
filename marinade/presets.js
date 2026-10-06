(function (root) {
  'use strict';
  const schema = root.MarinadeSchema;
  const sourceRoots = Object.fromEntries(root.MarinadeSources.catalog.map(item => [item.id, item.rootNote]));
  const copy = value => JSON.parse(JSON.stringify(value));
  function merge(target, source) {
    Object.keys(source || {}).forEach(key => {
      const value = source[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) target[key] = merge(target[key] && typeof target[key] === 'object' ? target[key] : {}, value);
      else target[key] = copy(value);
    });
    return target;
  }
  const scales = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], pentatonic: [0, 3, 5, 7, 10], chromatic: Array.from({ length: 12 }, (_, i) => i) };
  function noteFor(degree, base, scale) {
    const notes = scales[scale] || scales.minor, octave = Math.floor(degree / notes.length), index = ((degree % notes.length) + notes.length) % notes.length;
    return base + octave * 12 + notes[index];
  }
  function phrase(degrees, options) {
    options = options || {};
    const velocities = options.velocities || [.86, .58, .73, .65, .9, .62, .78, .57, .84, .61, .76, .66, .92, .64, .8, .7];
    const steps = Array.from({ length: 16 }, (_, i) => {
      const degree = degrees[i % degrees.length], active = degree !== null;
      return {
        on: active, note: noteFor(active ? degree : 0, options.root == null ? 60 : options.root, options.scale || 'minor'),
        velocity: velocities[i % velocities.length], gate: options.gates ? options.gates[i % options.gates.length] : 1,
        probability: options.chance && options.chance[i] != null ? options.chance[i] : 1,
        ratchet: options.ratchets && options.ratchets[i] || 1, offset: options.offsets && options.offsets[i] || 0,
        chord: options.chords && options.chords[i] || 'single', protect: false
      };
    });
    return { division: options.division || '1/8', length: options.length || 16, transpose: 0, gate: options.gate == null ? .7 : options.gate, steps };
  }
  function sample(id, options) {
    return Object.assign({ ref: { kind: 'factory', id }, rootNote: sourceRoots[id], trimStart: 0, trimEnd: 1, position: .15, freeze: false, reverse: false, gain: 1 }, options || {});
  }
  function freeze(value) { if (value && typeof value === 'object') { Object.keys(value).forEach(key => freeze(value[key])); Object.freeze(value); } return value; }
  function recipe(id, name, description, tags, config) {
    const base = schema.defaultState();
    const defaults = {
      name, tempo: 96, swing: .07, root: 60, scale: 'minor', seed: 195936478,
      samples: [sample('glass-bell'), sample('vowel-choir', { position: .32 })],
      synth: {
        morph: .52, pitchBlend: .38, texture: .08, textureBlend: .5, transient: .16, transientBlend: .5, scanRate: .3, scanMode: 'pingpong', formantShift: 0, formantLock: true, inharmonic: .04, smear: .12, spread: .45,
        amp: { attack: .018, decay: .48, sustain: .63, release: 1.2 },
        filter: { type: 'lp', cutoff: 8400, resonance: .09, envAmount: .5, keytrack: .25 },
        filterEnv: { attack: .008, decay: .5, sustain: .2, release: .7 },
        lfo: { shape: 'sine', rate: .21, sync: 'free', depth: .09, target: 'morph', retrigger: false }
      },
      morphPath: { enabled: true, beats: 8, depth: .55, points: [.18, .2, .26, .35, .46, .61, .72, .8, .82, .76, .65, .5, .38, .29, .23, .18] },
      sequence: phrase([0, 4, 7, 2, 4, 9, 7, 4, 0, 5, 8, 3, 5, 10, 8, 5]),
      fx: { drive: .06, chorus: .24, delay: .18, delayDivision: '3/16', feedback: .28, space: .32, width: 1.08, volume: .67 }
    };
    merge(base, defaults);
    merge(base, config);
    base.name = name;
    return freeze({ id, name, description, tags: tags.slice(), state: schema.normalize(base) });
  }
  const list = [
    recipe('glass-in-the-walk-in', 'Glass in the Walk-in', 'A glass strike opens into a vowel choir. Play a chord, or let the sixteen-step phrase keep the kitchen lit.', ['Keys', 'Choir', 'Start here'], {
      tempo: 94, samples: [sample('glass-bell', { position: .1 }), sample('vowel-choir', { position: .36 })],
      synth: { formantLock: false, textureBlend: 0.65, transientBlend: 0.06, morph: .48, pitchBlend: .28, transient: .19, scanRate: .2, amp: { attack: .012, decay: .7, sustain: .67, release: 1.7 } },
      sequence: phrase([0, 4, 7, 2, 4, 9, 7, null, 0, 5, 8, 3, 5, 10, 8, 4], { gates: [1.2, .85, 1, .8], gate: .76 }),
      fx: { delay: .22, space: .4 }
    }),
    recipe('porcelain-lullaby', 'Porcelain Lullaby', 'Ceramic chimes softened by felt tines: a rounded, spacious set of playable keys.', ['Keys', 'Soft'], {
      tempo: 82, scale: 'major', samples: [sample('ceramic-chime', { position: .08 }), sample('felt-keys', { position: .14 })],
      synth: { formantLock: false, textureBlend: 0.4, transientBlend: 0.65, morph: .58, pitchBlend: .3, transient: .28, texture: .02, scanRate: .08, smear: .08, amp: { attack: .004, decay: .95, sustain: .23, release: 1.35 }, filter: { cutoff: 6400 } },
      morphPath: { enabled: false }, sequence: phrase([0, 2, 4, null, 7, 4, 2, null, -1, 1, 3, null, 6, 3, 1, null], { scale: 'major', gate: 1.2 }),
      fx: { chorus: .14, delay: .12, space: .45 }
    }),
    recipe('rain-on-the-keys', 'Rain on the Keys', 'A piano wire wears the bright, scattered texture of rain in a metal tray.', ['Keys', 'Texture'], {
      tempo: 110, samples: [sample('piano-wire', { position: .09 }), sample('rain-pan', { position: .45 })],
      synth: { formantLock: false, textureBlend: 0.95, transientBlend: 0.12, morph: .28, pitchBlend: .12, texture: .28, transient: .38, scanRate: .42, smear: .2, amp: { attack: .004, decay: .58, sustain: .27, release: .8 } },
      sequence: phrase([0, null, 2, 4, 7, null, 4, 2, 0, null, 3, 5, 8, 7, 5, 3], { division: '1/16', gate: .82, ratchets: { 7: 2, 15: 2 } }),
      fx: { chorus: .12, delay: .23, space: .29 }
    }),
    recipe('biscuit-tin-harp', 'Biscuit Tin Harp', 'Plucked wire and glass produce an intimate, metallic harp with a flickering upper register.', ['Keys', 'Plucked'], {
      tempo: 102, scale: 'dorian', samples: [sample('plucked-string', { position: .07 }), sample('glass-bell', { position: .16 })],
      synth: { formantLock: false, textureBlend: 0.35, transientBlend: 0.15, morph: .39, pitchBlend: .42, transient: .36, scanRate: .12, amp: { attack: .003, decay: .8, sustain: .16, release: .9 }, filter: { cutoff: 11200 } },
      morphPath: { enabled: true, beats: 4, depth: .23 }, sequence: phrase([0, 4, 7, 9, 6, 4, 2, null, 0, 3, 7, 8, 5, 3, 2, 1], { scale: 'dorian', gate: .92 }),
      fx: { delay: .24, delayDivision: '1/8', space: .25, chorus: .16 }
    }),
    recipe('felt-and-bottle', 'Felt and Bottle', 'Soft tine attacks melt into a hollow bottle-flute sustain, with gentle stereo movement.', ['Keys', 'Warm'], {
      tempo: 76, samples: [sample('felt-keys', { position: .07 }), sample('breath-flute', { position: .3 })],
      synth: { formantLock: false, textureBlend: 0.9, transientBlend: 0.05, morph: .61, pitchBlend: .15, transient: .23, scanRate: .06, amp: { attack: .013, decay: .8, sustain: .55, release: 1.8 }, lfo: { target: 'pan', depth: .12, rate: .16 } },
      morphPath: { beats: 16, depth: .25 }, sequence: phrase([0, null, 4, null, 2, null, 7, null, -1, null, 3, null, 1, null, 6, null], { division: '1/8', gate: 1.6, chords: { 0: 'fifth', 8: 'fifth' } }),
      fx: { delay: .12, space: .39, chorus: .34 }
    }),
    recipe('the-pass-sings-back', 'The Pass Sings Back', 'Two vowel sources trade their formants, making an airy choir that stays clear as you transpose.', ['Choir', 'Pad'], {
      tempo: 72, samples: [sample('vowel-choir', { position: .32 }), sample('whisper-vowel', { position: .57 })],
      synth: { textureBlend: 0.65, transientBlend: 0.4, morph: .42, pitchBlend: .55, texture: .17, transient: .02, scanRate: .11, smear: .21, amp: { attack: .65, decay: 1.2, sustain: .82, release: 3.1 }, lfo: { target: 'formant', depth: .09, rate: .14 } },
      morphPath: { beats: 16, depth: .72 }, sequence: phrase([0, null, null, null, 3, null, null, null, -2, null, null, null, 2, null, null, null], { division: '1/4', gate: 2, gates: [2], chords: { 0: 'minor', 4: 'major', 8: 'major', 12: 'fifth' } }),
      fx: { space: .62, chorus: .39, delay: .1, width: 1.28 }
    }),
    recipe('choir-of-the-cold-room', 'Choir of the Cold Room', 'A rubbed glass edge adds a pale halo to a sustained, high choir.', ['Choir', 'Glass'], {
      tempo: 68, root: 72, samples: [sample('vowel-choir', { position: .6 }), sample('bowed-glass', { position: .42 })],
      synth: { textureBlend: 0.35, transientBlend: 0.3, morph: .44, pitchBlend: .23, formantShift: 3, texture: .05, transient: 0, smear: .3, scanRate: .05, amp: { attack: .9, decay: 1.5, sustain: .85, release: 4.1 } },
      morphPath: { depth: .42, beats: 16 }, sequence: phrase([0, null, null, null, 4, null, null, null, 3, null, null, null, 5, null, null, null], { root: 72, division: '1/4', gate: 2, gates: [2], chords: { 0: 'fifth', 4: 'sus2', 8: 'fifth', 12: 'sus2' } }),
      fx: { space: .73, delay: .15, feedback: .42, width: 1.4, volume: .6 }
    }),
    recipe('whispered-order', 'Whispered Order', 'A hushed vowel follows a plucked string, giving each note a soft mouth-like finish.', ['Voice', 'Plucked'], {
      tempo: 118, samples: [sample('plucked-string', { position: .08 }), sample('whisper-vowel', { position: .28 })],
      synth: { textureBlend: 0.95, transientBlend: 0.1, morph: .55, pitchBlend: .17, texture: .26, transient: .26, scanRate: .37, formantShift: -2, amp: { attack: .008, decay: .28, sustain: .35, release: .45 } },
      morphPath: { beats: 2, depth: .63, points: [.05, .07, .1, .18, .35, .62, .78, .86, .84, .72, .55, .39, .25, .16, .1, .06] },
      sequence: phrase([0, 4, null, 2, 0, null, 3, 5, 7, null, 5, 3, 2, null, 1, 4], { division: '1/16', gate: .58, ratchets: { 5: 2, 13: 3 } }),
      fx: { delay: .26, chorus: .17, space: .22 }
    }),
    recipe('brass-behind-the-door', 'Brass Behind the Door', 'A nasal call and a copper swell make a bold, vowel-bearing lead.', ['Lead', 'Brass'], {
      tempo: 104, root: 57, scale: 'dorian', samples: [sample('brass-vowel', { position: .22 }), sample('copper-brass', { position: .29 })],
      synth: { morph: .46, pitchBlend: .55, transient: .13, texture: .1, scanRate: .22, formantShift: -1, amp: { attack: .035, decay: .35, sustain: .68, release: .3 }, filter: { cutoff: 5600, resonance: .21, envAmount: 1.2 }, lfo: { target: 'formant', depth: .13, rate: 2.1 } },
      morphPath: { enabled: false }, sequence: phrase([0, 2, 3, null, 4, 3, 2, 0, -2, null, 0, 2, 4, 6, 5, 3], { root: 57, scale: 'dorian', gate: .71 }),
      fx: { drive: .17, chorus: .13, delay: .14, space: .2 }
    }),
    recipe('bottle-message', 'Bottle Message', 'Breathy flute and a narrow reed create a nimble, round-edged melody voice.', ['Lead', 'Wind'], {
      tempo: 126, scale: 'pentatonic', samples: [sample('breath-flute', { position: .39 }), sample('reed-organ', { position: .42 })],
      synth: { morph: .37, pitchBlend: .44, texture: .11, transient: .04, scanRate: .18, smear: .05, amp: { attack: .015, decay: .3, sustain: .58, release: .25 }, lfo: { target: 'pitchBlend', depth: .06, rate: 4.7 } },
      morphPath: { enabled: false }, sequence: phrase([0, 2, 4, 2, 5, null, 4, 3, 2, 0, null, 2, 3, 4, 2, 1], { scale: 'pentatonic', division: '1/16', gate: .65 }),
      fx: { delay: .21, delayDivision: '3/16', space: .24, chorus: .1 }
    }),
    recipe('pantry-after-hours', 'Pantry After Hours', 'A harmonium and low bowed string create a dark, slowly breathing chord bed.', ['Pad', 'Warm'], {
      tempo: 66, root: 48, samples: [sample('reed-organ', { position: .54 }), sample('cello-scrape', { position: .49 })],
      synth: { morph: .48, pitchBlend: .3, texture: .15, transient: .02, smear: .4, scanRate: .07, formantShift: -3, amp: { attack: 1.2, decay: 1.8, sustain: .86, release: 3.8 }, filter: { cutoff: 3100, envAmount: .7, resonance: .08 }, lfo: { target: 'cutoff', depth: .15, rate: .08 } },
      morphPath: { beats: 16, depth: .44 }, sequence: phrase([0, null, null, null, 5, null, null, null, 3, null, null, null, -1, null, null, null], { root: 48, division: '1/4', gate: 2, gates: [2], chords: { 0: 'minor', 4: 'major', 8: 'major', 12: 'fifth' } }),
      fx: { chorus: .45, space: .49, delay: .1, width: 1.25, volume: .6 }
    }),
    recipe('a-room-full-of-steam', 'A Room Full of Steam', 'Air and bowed glass bloom into a wide, almost weightless pad.', ['Pad', 'Air'], {
      tempo: 64, samples: [sample('bowed-glass', { position: .38 }), sample('steam-hiss', { position: .47 })],
      synth: { textureBlend: 0.97, transientBlend: 0.2, morph: .35, pitchBlend: .12, texture: .37, transient: 0, smear: .52, scanRate: .09, spread: .8, amp: { attack: 1.8, decay: 2, sustain: .9, release: 5 }, filter: { cutoff: 6700, envAmount: .2 }, lfo: { target: 'pan', depth: .26, rate: .07 } },
      morphPath: { beats: 32, depth: .45 }, sequence: phrase([0, null, null, null, null, null, null, null, 3, null, null, null, null, null, null, null], { division: '1/4', gate: 2, gates: [2], chords: { 0: 'sus2', 8: 'major' } }),
      fx: { space: .77, chorus: .35, delay: .13, width: 1.5, volume: .58 }
    }),
    recipe('underwater-service', 'Underwater Service', 'Liquid bubbles tint a low organ with slow, rippling formant movement.', ['Pad', 'Liquid'], {
      tempo: 88, root: 48, samples: [sample('reed-organ', { position: .51 }), sample('water-bubbles', { position: .33 })],
      synth: { textureBlend: 0.9, transientBlend: 0.65, morph: .34, pitchBlend: .24, texture: .3, transient: .08, smear: .3, scanRate: .24, amp: { attack: .28, decay: .8, sustain: .65, release: 2 }, filter: { cutoff: 2200, resonance: .3, envAmount: .8 }, lfo: { target: 'formant', depth: .24, rate: .2 } },
      morphPath: { beats: 8, depth: .47 }, sequence: phrase([0, null, 4, null, 2, null, 5, null, -2, null, 2, null, 3, null, 0, null], { root: 48, gate: 1.8, chords: { 0: 'fifth', 8: 'fifth' } }),
      fx: { chorus: .42, delay: .32, feedback: .4, space: .4 }
    }),
    recipe('bowed-copper', 'Bowed Copper', 'String friction meets a brass spectrum: warm in the middle, rough at the edges.', ['Bowed', 'Lead'], {
      tempo: 90, root: 48, samples: [sample('cello-scrape', { position: .46 }), sample('copper-brass', { position: .4 })],
      synth: { morph: .31, pitchBlend: .41, texture: .21, transient: .03, scanRate: .12, formantShift: -2, amp: { attack: .17, decay: .65, sustain: .72, release: .85 }, filter: { cutoff: 4300, resonance: .17 }, lfo: { target: 'pitchBlend', depth: .09, rate: 3.8 } },
      morphPath: { beats: 8, depth: .35 }, sequence: phrase([0, null, 2, 3, 4, null, 3, 2, -2, null, 0, 2, 3, null, 2, 1], { root: 48, gate: 1.25 }),
      fx: { drive: .13, chorus: .17, space: .3, delay: .16 }
    }),
    recipe('cellar-resonance', 'Cellar Resonance', 'A clean bass bloom takes on the walk-in motor’s harmonic teeth without losing its weight.', ['Bass', 'Warm'], {
      tempo: 116, root: 36, samples: [sample('sub-bloom', { position: .2, freeze: true }), sample('motor-hum', { position: .49 })],
      synth: { formantLock: false, textureBlend: 0.8, transientBlend: 0.06, morph: .27, pitchBlend: .09, texture: .05, transient: .08, smear: .09, scanRate: .14, spread: .13, amp: { attack: .006, decay: .24, sustain: .62, release: .14 }, filter: { cutoff: 1900, resonance: .2, envAmount: 1.1, keytrack: .4 }, lfo: { target: 'cutoff', sync: '1/8', depth: .12, rate: .5 } },
      morphPath: { enabled: false }, sequence: phrase([0, null, 0, 7, 0, null, 3, 2, -2, null, -2, 5, -2, 0, 2, null], { root: 36, division: '1/16', gate: .62 }),
      fx: { drive: .22, chorus: 0, delay: .03, space: .07, width: .5, volume: .71 }
    }),
    recipe('low-order-growl', 'Low Order Growl', 'A bass swell grows a low vocal mouth, with animated formants and a short, punchy phrase.', ['Bass', 'Vocal'], {
      tempo: 132, root: 36, samples: [sample('sub-bloom', { position: .16, freeze: true }), sample('brass-vowel', { position: .27 })],
      synth: { formantLock: false, textureBlend: 0.66, transientBlend: 0.12, morph: .41, pitchBlend: .11, texture: .09, transient: .17, formantShift: -7, smear: .12, scanRate: .3, spread: .1, amp: { attack: .004, decay: .22, sustain: .34, release: .12 }, filter: { cutoff: 2400, resonance: .24, envAmount: 1.7 }, lfo: { target: 'formant', sync: '1/8', depth: .3 } },
      morphPath: { enabled: true, beats: 2, depth: .35 }, sequence: phrase([0, null, 0, 2, null, 0, 3, null, -2, null, -2, 1, null, 2, 0, null], { root: 36, division: '1/16', gate: .5, ratchets: { 7: 2, 14: 2 } }),
      fx: { drive: .31, chorus: .04, delay: .06, space: .08, width: .45 }
    }),
    recipe('compressor-conversation', 'Compressor Conversation', 'Two machine clips become a tuned, sputtering bass with changing spectral teeth.', ['Bass', 'Machine'], {
      tempo: 124, root: 36, samples: [sample('motor-hum', { position: .41 }), sample('gear-rattle', { position: .32 })],
      synth: { formantLock: false, textureBlend: 0.8, transientBlend: 0.7, morph: .4, pitchBlend: .28, texture: .2, transient: .15, scanRate: .5, inharmonic: .12, smear: .07, spread: .18, amp: { attack: .005, decay: .18, sustain: .44, release: .11 }, filter: { cutoff: 2900, resonance: .3, envAmount: 1.2 }, lfo: { target: 'morph', sync: '1/16', shape: 'triangle', depth: .24 } },
      morphPath: { enabled: false }, sequence: phrase([0, 0, null, 4, 0, null, 2, 3, -2, null, -2, 2, null, 3, 2, 0], { root: 36, division: '1/16', gate: .52, ratchets: { 3: 2, 11: 3 } }),
      fx: { drive: .38, delay: .1, delayDivision: '1/8', space: .09, chorus: .06, width: .6 }
    }),
    recipe('wood-glass-cutlery', 'Wood, Glass, Cutlery', 'A chopping-board attack rings into porcelain. Short, dry, and unexpectedly pitched.', ['Percussion', 'Wood'], {
      tempo: 138, root: 48, samples: [sample('wooden-knock', { position: .025, freeze: true }), sample('ceramic-chime', { position: .05, freeze: true })],
      synth: { formantLock: false, textureBlend: 0.4, transientBlend: 0.05, morph: .34, pitchBlend: .36, texture: .05, transient: .85, scanRate: 0, scanMode: 'oneShot', smear: .03, amp: { attack: .001, decay: .13, sustain: .03, release: .12 }, filter: { cutoff: 8200, resonance: .05 }, lfo: { depth: 0 } },
      morphPath: { enabled: false }, sequence: phrase([0, null, 4, null, 0, 2, null, 7, 0, null, 3, 5, null, 4, 2, null], { root: 48, division: '1/16', gate: .27, ratchets: { 6: 3, 13: 2 }, offsets: { 5: -.08, 11: .1 } }),
      fx: { delay: .14, delayDivision: '1/16', space: .11, chorus: .03 }
    }),
    recipe('brush-and-simmer', 'Brush and Simmer', 'A baking-tray brush takes on liquid cavities, turning a drum-like source into little tuned glugs.', ['Percussion', 'Liquid'], {
      tempo: 146, swing: .13, root: 48, samples: [sample('brushed-snare', { position: .04, freeze: true }), sample('water-bubbles', { position: .36 })],
      synth: { formantLock: false, textureBlend: 0.85, transientBlend: 0.2, morph: .48, pitchBlend: .31, texture: .43, transient: .68, scanRate: .7, smear: .08, amp: { attack: .001, decay: .09, sustain: 0, release: .13 }, filter: { cutoff: 9600, resonance: .2 }, lfo: { target: 'position', sync: '1/8', depth: .33, shape: 'sampleHold' } },
      morphPath: { beats: 2, depth: .47 }, sequence: phrase([0, null, 2, 4, null, 0, null, 5, 0, 3, null, 2, null, 7, 4, null], { root: 48, division: '1/16', gate: .28, ratchets: { 3: 2, 10: 3, 15: 4 }, chance: { 3: .85, 10: .7, 15: .7 } }),
      fx: { delay: .16, feedback: .17, space: .13, chorus: .05, drive: .13 }
    }),
    recipe('rack-of-small-accidents', 'Rack of Small Accidents', 'Metal collisions borrow a glass bell’s tuning, making fractured but musical percussion.', ['Percussion', 'Metal'], {
      tempo: 154, swing: .04, root: 60, samples: [sample('iron-chain', { position: .1 }), sample('glass-bell', { position: .08, freeze: true })],
      synth: { formantLock: false, textureBlend: 0.05, transientBlend: 0.35, morph: .57, pitchBlend: .64, texture: .3, transient: .67, scanRate: .65, inharmonic: .21, smear: .05, amp: { attack: .001, decay: .16, sustain: .05, release: .21 }, lfo: { target: 'morph', sync: '1/8T', depth: .22, shape: 'triangle' } },
      morphPath: { enabled: false }, sequence: phrase([0, null, 4, null, 7, 2, null, 9, null, 5, 3, null, 8, null, 4, 2], { division: '1/16', gate: .3, ratchets: { 2: 2, 7: 3, 12: 2 }, offsets: { 7: -.14, 14: .13 } }),
      fx: { delay: .23, delayDivision: '3/16', space: .24, drive: .16, chorus: .09 }
    }),
    recipe('ice-cube-counterpoint', 'Ice Cube Counterpoint', 'Fine ice fractures settle into bright, fluttering felt-key notes.', ['Keys', 'Percussion'], {
      tempo: 128, scale: 'major', samples: [sample('felt-keys', { position: .11 }), sample('ice-crackle', { position: .47 })],
      synth: { formantLock: false, textureBlend: 1, transientBlend: 0.1, morph: .29, pitchBlend: .16, texture: .38, transient: .34, scanRate: .8, smear: .09, spread: .64, amp: { attack: .003, decay: .3, sustain: .08, release: .37 } },
      morphPath: { depth: .34, beats: 4 }, sequence: phrase([0, 4, 2, 7, 4, 9, 7, 2, 1, 5, 3, 8, 5, 10, 8, 3], { scale: 'major', division: '1/16', gate: .46, ratchets: { 7: 2, 15: 2 } }),
      fx: { delay: .23, feedback: .31, space: .31, chorus: .15 }
    }),
    recipe('tin-whisk-telegraph', 'Tin Whisk Telegraph', 'A metal scrape and reed spectrum make a sharp, animated spectral pluck.', ['Lead', 'Metal'], {
      tempo: 136, samples: [sample('reed-organ', { position: .4, freeze: true }), sample('tin-scrape', { position: .34 })],
      synth: { formantLock: false, textureBlend: 0.95, transientBlend: 0.8, morph: .33, pitchBlend: .14, texture: .29, transient: .33, scanRate: .6, inharmonic: .09, smear: .04, amp: { attack: .002, decay: .12, sustain: .14, release: .17 }, filter: { cutoff: 6200, resonance: .23, envAmount: 1.2 }, lfo: { target: 'morph', sync: '1/16', depth: .17, shape: 'square' } },
      morphPath: { enabled: false }, sequence: phrase([0, 4, null, 2, 7, null, 3, 4, 0, 5, null, 3, 8, 7, 5, null], { division: '1/16', gate: .36, ratchets: { 3: 2, 11: 2, 15: 3 } }),
      fx: { drive: .21, delay: .19, space: .17, chorus: .07 }
    }),
    recipe('rain-through-the-reeds', 'Rain Through the Reeds', 'A reed chord slowly gathers the hollow, shimmering body of a rain-filled roasting pan.', ['Pad', 'Texture'], {
      tempo: 80, scale: 'dorian', samples: [sample('reed-organ', { position: .5 }), sample('rain-pan', { position: .61 })],
      synth: { textureBlend: 0.95, transientBlend: 0.65, morph: .3, pitchBlend: .12, texture: .32, transient: .08, scanRate: .2, smear: .34, spread: .7, amp: { attack: .42, decay: 1, sustain: .72, release: 2.3 }, filter: { cutoff: 4600, resonance: .1 }, lfo: { target: 'pan', depth: .17, rate: .12 } },
      morphPath: { beats: 16, depth: .43 }, sequence: phrase([0, null, null, 4, null, null, 2, null, 3, null, null, 6, null, null, 5, null], { scale: 'dorian', division: '1/8', gate: 1.7, chords: { 0: 'fifth', 8: 'fifth' } }),
      fx: { space: .53, chorus: .33, delay: .2, width: 1.35 }
    }),
    recipe('the-order-bends', 'The Order Bends', 'Brass and glass disagree politely about pitch while the morph path pushes their spectra together.', ['Lead', 'Experimental'], {
      tempo: 112, samples: [sample('copper-brass', { position: .37 }), sample('glass-bell', { position: .11 })],
      synth: { morph: .44, pitchBlend: .65, texture: .1, transient: .15, scanRate: .33, formantLock: false, inharmonic: .2, smear: .07, amp: { attack: .024, decay: .33, sustain: .58, release: .45 }, lfo: { target: 'pitchBlend', depth: .24, sync: '1/4', shape: 'triangle' } },
      morphPath: { depth: .65, beats: 4, points: [.08, .15, .24, .42, .65, .8, .91, .95, .91, .8, .65, .42, .24, .15, .08, .05] },
      sequence: phrase([0, 2, 4, null, 7, 4, 2, 3, 0, 3, 5, null, 8, 5, 3, 2], { gate: .68 }),
      fx: { drive: .16, delay: .25, feedback: .35, space: .27, chorus: .2 }
    }),
    recipe('frozen-silver', 'Frozen Silver', 'Two frozen metal moments become a steady, glass-like keyboard patch with a shifting shimmer.', ['Frozen', 'Keys'], {
      tempo: 92, samples: [sample('glass-bell', { position: .18, freeze: true }), sample('iron-chain', { position: .42, freeze: true })],
      synth: { formantLock: false, textureBlend: 0.85, transientBlend: 0.65, morph: .27, pitchBlend: .24, texture: .09, transient: .1, scanRate: 0, smear: .19, inharmonic: .13, spread: .6, amp: { attack: .035, decay: .6, sustain: .54, release: 1.7 }, lfo: { target: 'morph', depth: .2, rate: .23 } },
      morphPath: { depth: .32, beats: 8 }, sequence: phrase([0, 4, 7, null, 2, 5, 9, null, -2, 2, 5, null, 1, 4, 8, null], { gate: 1.15 }),
      fx: { space: .48, delay: .19, chorus: .32, width: 1.3 }
    }),
    recipe('backwards-banquet', 'Backwards Banquet', 'A reversed piano tail opens into a bowed-glass tone: gently swelling, clear, and a little impossible.', ['Reverse', 'Pad'], {
      tempo: 74, samples: [sample('piano-wire', { trimEnd: .83, position: .36, reverse: true }), sample('bowed-glass', { position: .54 })],
      synth: { textureBlend: 0.25, transientBlend: 0.05, morph: .55, pitchBlend: .34, texture: .07, transient: .03, scanRate: .35, scanMode: 'oneShot', smear: .23, amp: { attack: .32, decay: .9, sustain: .72, release: 2.7 }, lfo: { target: 'position', depth: .1, rate: .16 } },
      morphPath: { depth: .6, beats: 8 }, sequence: phrase([0, null, null, 4, null, null, 2, null, -1, null, null, 3, null, null, 1, null], { gate: 1.7, chords: { 0: 'fifth', 8: 'fifth' } }),
      fx: { space: .6, chorus: .3, delay: .22, feedback: .37, width: 1.33 }
    }),
    recipe('formant-tasting-menu', 'Formant Tasting Menu', 'A bright choir shifts its mouth shapes against a dark bowed string. Try the formant knob while holding a chord.', ['Voice', 'Experimental'], {
      tempo: 100, root: 57, samples: [sample('brass-vowel', { position: .58 }), sample('cello-scrape', { position: .43 })],
      synth: { textureBlend: 0.6, transientBlend: 0.3, morph: .48, pitchBlend: .41, texture: .18, transient: .07, scanRate: -.19, formantShift: 5, smear: .12, amp: { attack: .11, decay: .4, sustain: .64, release: .8 }, lfo: { target: 'formant', sync: '1/2', depth: .35, shape: 'sine' } },
      morphPath: { depth: .4, beats: 4 }, sequence: phrase([0, 2, null, 4, 7, null, 5, 3, -2, 0, null, 2, 5, 4, 2, null], { root: 57, gate: 1.1 }),
      fx: { drive: .12, chorus: .25, delay: .17, space: .35 }
    }),
    recipe('service-lift-stars', 'Service Lift Stars', 'A compressor’s low spectrum is lifted into a bright piano-like constellation, with moving texture underneath.', ['Keys', 'Machine'], {
      tempo: 108, root: 72, scale: 'major', samples: [sample('felt-keys', { position: .13 }), sample('motor-hum', { position: .63 })],
      synth: { formantLock: false, textureBlend: 0.9, transientBlend: 0.05, morph: .32, pitchBlend: .2, texture: .23, transient: .25, formantShift: 7, scanRate: .27, smear: .16, spread: .7, amp: { attack: .006, decay: .45, sustain: .22, release: .85 }, filter: { cutoff: 10900, envAmount: .25 }, lfo: { target: 'position', depth: .24, sync: '1/2' } },
      morphPath: { depth: .29, beats: 8 }, sequence: phrase([0, 4, 2, 7, 4, null, 9, 7, 1, 5, 3, 8, 5, null, 10, 8], { root: 72, scale: 'major', division: '1/16', gate: .82 }),
      fx: { delay: .29, feedback: .4, chorus: .29, space: .42, width: 1.35 }
    })
  ];
  const byId = new Map(list.map(item => [item.id, item]));
  root.MarinadePresets = Object.freeze({
    list: Object.freeze(list),
    get(id) { const entry = byId.get(id) || list[0]; return copy(entry.state); },
    defaultId: list[0].id
  });
})(typeof window !== 'undefined' ? window : globalThis);
