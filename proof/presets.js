(() => {
  'use strict';
  const S = window.ProofSchema;

  // These are complete, editable recipes. The four trays are deliberately
  // related variations, with stronger accents protected during mutation.
  const chord = (degree, quality, bars = 1, inversion = 0, spread = 0) =>
    ({ degree, quality, bars, inversion, spread, enabled: true });
  const seedFor = id => {
    let seed = 2166136261;
    for (const character of id) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
    return seed >>> 0;
  };

  function tray(name, phrase, options = {}) {
    const tokens = phrase.replace(/\s/g, '');
    if (!tokens.length || tokens.length > 16 || /[^xo.\-23]/.test(tokens)) {
      throw new Error('Invalid LEAVEN factory tray: ' + name);
    }
    const steps = Array.from({ length: 16 }, (_, index) => {
      const token = tokens[index] || '.';
      const step = Object.assign(S.step(), {
        on: index < tokens.length && token !== '.',
        velocity: token === 'x' ? (options.accent ?? .92) : (options.velocity ?? .73),
        gate: token === '-' ? 1 : (options.gate ?? .9),
        probability: 1,
        ratchet: token === '2' ? 2 : token === '3' ? 3 : 1,
        tie: token === '-',
        protect: (options.protect || [0]).includes(index)
      });
      if (options.steps && options.steps[index]) Object.assign(step, options.steps[index]);
      return step;
    });
    return { name, length: tokens.length, steps };
  }

  function make(id, name, group, mood, description, recipe) {
    const state = S.defaultState();
    for (const key of ['tempo', 'swing', 'root', 'scale', 'source', 'selectedChord', 'selectedPattern']) {
      if (recipe[key] !== undefined) state[key] = recipe[key];
    }
    state.name = name;
    state.seed = seedFor(id);
    Object.assign(state.arp, recipe.arp || {});
    if (recipe.chords) {
      state.chords = recipe.chords.concat(state.chords.slice(recipe.chords.length)
        .map(value => Object.assign({}, value, { enabled: false })));
    }
    if (recipe.trays) state.patterns = recipe.trays.map((value, index) =>
      tray(String.fromCharCode(65 + index), value[0], value[1]));
    for (const [key, value] of Object.entries(recipe.synth || {})) {
      if (['filter', 'amp', 'filterEnv', 'lfo'].includes(key)) Object.assign(state.synth[key], value);
      else state.synth[key] = value;
    }
    Object.assign(state.fx, recipe.fx || {});
    state.heldNotes = recipe.heldNotes || S.chordNotes(state, state.chords[state.selectedChord]).slice(0, 8);
    return Object.assign(S.normalize(state), { id, group, mood, description });
  }

  const presets = [
    Object.assign(S.defaultState(), {
      id: 'after-hours-proof', group: 'DCO · Warm enamel', mood: 'Nocturnal',
      description: 'An A-minor ninth rises through F and C major sevenths to an open G. Warm saws, amber chorus and a dotted echo.'
    }),

    make('amber-brioche', 'Amber brioche', 'DCO · Warm enamel', 'Bright',
      'D-major sunrise: added ninths, a lifting bass line and small double-hit crumbs at the turn of each tray.', {
        tempo: 112, swing: .06, root: 50, scale: 'major',
        arp: { direction: 'up', division: '1/16', octaves: 2, gate: .52, spice: .02, fold: 'rise', foldEvery: 4 },
        chords: [chord(0, 'add9'), chord(4, 'major', 1, 1), chord(5, 'min7'), chord(3, 'maj7')],
        trays: [
          ['xooo xoo. xooo xo2.', { steps: { 6: { velocity: .62 }, 14: { velocity: .66 } }, protect: [0, 8] }],
          ['xo.o xooo xo.o xoo2', { gate: .78, protect: [0, 8] }],
          ['xoo. .oo. xoo. .o2.', { velocity: .66, protect: [0, 8] }],
          ['xooo xo2. xooo x23.', { steps: { 14: { octave: 1, velocity: .64 } }, protect: [0, 8] }]
        ],
        synth: { model: 'dco', wave: 'saw', mix: .62, sub: .14, detune: .09,
          filter: { cutoff: 1600, resonance: .18, envAmount: 2.1 },
          amp: { attack: .005, decay: .28, sustain: .24, release: .22 },
          filterEnv: { attack: .002, decay: .33, sustain: .06, release: .18 },
          lfo: { shape: 'sine', rate: .32, depth: .1, target: 'cutoff' } },
        fx: { chorus: .57, delay: .14, feedback: .24, space: .19, width: .9 }
      }),

    make('butter-in-the-pan', 'Butter in the pan', 'DCO · Warm enamel', 'Bass groove',
      'A-Dorian bass with a D-major lift. Repeated pulse notes leave the offbeats open for a tight dotted echo.', {
        tempo: 118, swing: .19, root: 45, scale: 'dorian',
        arp: { direction: 'skip', division: '1/16', octaves: 1, gate: .47, repeat: 2, spice: 0, fold: 'none' },
        chords: [chord(0, 'min7'), chord(3, 'major'), chord(0, 'min7'), chord(6, 'major')],
        trays: [
          ['x.o. oo.o x.o. o.2.', { velocity: .69, gate: .74, steps: { 5: { offset: -.03 }, 15: { probability: .78 } }, protect: [0, 8] }],
          ['x.o. xo.o x.o. oo2.', { velocity: .67, gate: .7, protect: [0, 4, 8] }],
          ['x... oo.o x... o.o.', { velocity: .62, protect: [0, 8] }],
          ['x.o. oo2. x.o. o232', { velocity: .65, steps: { 15: { velocity: .55 } }, protect: [0, 8] }]
        ],
        synth: { model: 'dco', wave: 'pulse', mix: .38, sub: .3, pulseWidth: .34, detune: .045, octave: -1,
          filter: { cutoff: 700, resonance: .27, envAmount: 3.1, keytrack: .28 },
          amp: { attack: .003, decay: .2, sustain: .12, release: .14 },
          filterEnv: { attack: .001, decay: .22, sustain: 0, release: .12 },
          lfo: { shape: 'triangle', rate: .41, sync: '1/4', depth: .08, target: 'pulse' }, drive: .24 },
        fx: { chorus: .24, delay: .12, feedback: .18, space: .07, width: .65 }
      }),

    make('blue-tile-dawn', 'Blue-tile dawn', 'DCO · Warm enamel', 'Gentle',
      'G-Lydian light through blue tiles. Long pulse notes and tied answers let a little A-major colour linger.', {
        tempo: 82, swing: .04, root: 55, scale: 'lydian',
        arp: { direction: 'downup', division: '1/8', octaves: 1, gate: .94, spice: 0, fold: 'mirror', foldEvery: 4 },
        chords: [chord(0, 'maj7', 2), chord(1, 'major', 2, 1), chord(4, 'sus2', 2), chord(0, 'maj7', 2, 0, 1)],
        trays: [
          ['xo-. oo-. xo-. oo-.', { velocity: .65, accent: .84, gate: 1.08, protect: [0, 8] }],
          ['xo-. .o-. xo-. .o-.', { velocity: .62, accent: .81, gate: 1.12, protect: [0, 8] }],
          ['x--. o--. x--. o--.', { velocity: .61, accent: .78, gate: 1.16, protect: [0, 8] }],
          ['xo-o oo-. xo-o oo-.', { velocity: .63, accent: .82, protect: [0, 8] }]
        ],
        synth: { model: 'dco', wave: 'pulse', mix: .35, sub: .03, detune: .16, pulseWidth: .24,
          filter: { type: 'lp12', cutoff: 1450, resonance: .12, envAmount: 1.2, keytrack: .52 },
          amp: { attack: .04, decay: 1.1, sustain: .6, release: .7 },
          filterEnv: { attack: .08, decay: 1.6, sustain: .32, release: .65 },
          lfo: { shape: 'sine', rate: .19, depth: .1, target: 'pulse' }, drive: .08 },
        fx: { chorus: .61, chorusRate: .24, delay: .2, feedback: .32, space: .36, width: .96, volume: .66 }
      }),

    make('last-loaf-home', 'Last loaf home', 'DCO · Warm enamel', 'Tender',
      'F-major sevenths and a C-dominant homecoming, with a triplet tray that folds back like a quiet final refrain.', {
        tempo: 97, swing: 0, root: 53, scale: 'major',
        arp: { direction: 'outsidein', division: '1/16T', octaves: 2, gate: .7, spice: .01, fold: 'rotate', foldEvery: 4 },
        chords: [chord(0, 'maj7'), chord(3, 'maj7', 1, 1), chord(1, 'min7'), chord(4, 'dominant7'), chord(0, 'major', 2)],
        trays: [
          ['xoo. oo.o xoo. oo-.', { velocity: .67, accent: .87, protect: [0, 8] }],
          ['xo.o oo-. xo.o oo-.', { velocity: .64, accent: .85, protect: [0, 8] }],
          ['xoo. .o.. xoo. .o..', { velocity: .59, accent: .81, gate: 1.05, protect: [0, 8] }],
          ['xoo2 oo.o xoo2 oo-.', { velocity: .65, accent: .88, protect: [0, 8] }]
        ],
        synth: { model: 'dco', wave: 'pulse', mix: .48, sub: .09, detune: .13, pulseWidth: .41,
          filter: { cutoff: 1300, resonance: .15, envAmount: 1.7 },
          amp: { attack: .008, decay: .55, sustain: .32, release: .4 },
          filterEnv: { attack: .006, decay: .65, sustain: .16, release: .38 },
          lfo: { shape: 'sine', rate: .28, depth: .08, target: 'cutoff' }, drive: .12 },
        fx: { chorus: .48, delay: .22, feedback: .29, space: .27, width: .91, volume: .69 }
      }),

    make('copper-kettle', 'Copper kettle', 'Twin VCO · Copper coils', 'Bass groove',
      'A low C-minor machine with an A-flat detour and a real G-dominant turnaround. Twin saws simmer beneath the accents.', {
        tempo: 106, swing: .14, root: 36, scale: 'harmonic',
        arp: { direction: 'updown', division: '1/16', octaves: 1, gate: .46, repeat: 2, spice: 0, fold: 'none' },
        chords: [chord(0, 'min9'), chord(5, 'major'), chord(3, 'min7'), chord(4, 'dominant7')],
        trays: [
          ['x.o. oo.o x.o. o.o.', { velocity: .71, gate: .77, protect: [0, 8], steps: { 5: { offset: -.025 }, 14: { velocity: .6 } } }],
          ['x.oo o..o x.oo o.2.', { velocity: .69, protect: [0, 8] }],
          ['x... o..o x... o.o.', { velocity: .66, gate: .82, protect: [0, 8] }],
          ['x.o. oo2. x.o. o232', { velocity: .67, protect: [0, 8] }]
        ],
        synth: { model: 'vco', wave: 'saw', mix: .52, sub: .21, detune: .21, crossmod: .035,
          filter: { cutoff: 680, resonance: .3, envAmount: 3, keytrack: .25 },
          amp: { attack: .003, decay: .25, sustain: .16, release: .15 },
          filterEnv: { attack: .001, decay: .23, sustain: .02, release: .13 },
          lfo: { shape: 'sine', rate: .22, depth: .04, target: 'cutoff' }, drive: .26 },
        fx: { chorus: .14, delay: .13, feedback: .2, space: .06, width: .6 }
      }),

    make('countertop-disco', 'Countertop disco', 'Twin VCO · Copper coils', 'Dance',
      'A-Dorian sawtooth disco, rising into D seventh and G major seventh. The third tray strips the groove back for a breakdown.', {
        tempo: 126, swing: .07, root: 45, scale: 'dorian',
        arp: { direction: 'up', division: '1/16', octaves: 2, gate: .5, spice: .025, fold: 'rotate', foldEvery: 4 },
        chords: [chord(0, 'min7'), chord(3, 'dominant7'), chord(6, 'maj7', 1, 1), chord(0, 'min7')],
        trays: [
          ['xoo. xo.o xoo. xo2.', { velocity: .73, gate: .78, protect: [0, 4, 8, 12] }],
          ['xo.o xoo. xo.o xoo2', { velocity: .72, gate: .74, protect: [0, 4, 8, 12] }],
          ['x... .o.o x... .o.o', { velocity: .63, gate: .8, protect: [0, 8] }],
          ['xoo2 xo.o xoo2 xo23', { velocity: .68, steps: { 15: { octave: 1, velocity: .59 } }, protect: [0, 4, 8, 12] }]
        ],
        synth: { model: 'vco', wave: 'saw', mix: .58, sub: .13, detune: .26, crossmod: .03,
          filter: { cutoff: 1600, resonance: .22, envAmount: 2.4, keytrack: .4 },
          amp: { attack: .004, decay: .24, sustain: .2, release: .2 },
          filterEnv: { attack: .002, decay: .28, sustain: .07, release: .18 },
          lfo: { shape: 'triangle', rate: .36, sync: '1/8', depth: .075, target: 'cutoff' }, drive: .18 },
        fx: { chorus: .35, delay: .19, feedback: .26, space: .13, width: .87 }
      }),

    make('midnight-mixer', 'Midnight mixer', 'Twin VCO · Copper coils', 'Nocturnal',
      'C-minor ninths and spread major sevenths on a slowly breathing pair of oscillators. Soft ghost notes leave room for the room.', {
        tempo: 96, swing: .12, root: 48, scale: 'minor',
        arp: { direction: 'outsidein', division: '1/16', octaves: 2, gate: .7, spice: .035, fold: 'rotate', foldEvery: 4 },
        chords: [chord(0, 'min9', 2), chord(5, 'maj7', 1, 1), chord(2, 'maj7', 1, 0, 1), chord(6, 'sus4', 2)],
        trays: [
          ['xo.o oo-. xo.o oo.o', { velocity: .65, accent: .85, steps: { 3: { probability: .78, velocity: .55 }, 11: { probability: .78, velocity: .55 } }, protect: [0, 8] }],
          ['xoo. .o-. xoo. .o-.', { velocity: .63, accent: .83, protect: [0, 8] }],
          ['x--. o... x--. o...', { velocity: .6, accent: .79, gate: 1.05, protect: [0, 8] }],
          ['xo2. oo-. xo2. oo.o', { velocity: .64, accent: .84, protect: [0, 8] }]
        ],
        synth: { model: 'vco', wave: 'saw', mix: .42, sub: .12, detune: .35, crossmod: .07,
          filter: { type: 'lp12', cutoff: 1050, resonance: .16, envAmount: 1.6, keytrack: .47 },
          amp: { attack: .015, decay: .75, sustain: .42, release: .65 },
          filterEnv: { attack: .025, decay: .8, sustain: .16, release: .5 },
          lfo: { shape: 'sine', rate: .15, depth: .14, target: 'cutoff' }, drive: .14 },
        fx: { chorus: .32, chorusRate: .2, delay: .27, feedback: .35, space: .3, width: .96, volume: .65 }
      }),

    make('warm-steel-rush', 'Warm steel rush', 'Twin VCO · Copper coils', 'Driving',
      'An E-minor running line meets C, D and a B-dominant pickup. Light cross-modulation gives the steel an edge.', {
        tempo: 138, swing: .025, root: 40, scale: 'minor',
        arp: { direction: 'skip', division: '1/16', octaves: 2, gate: .48, repeat: 1, spice: .025, fold: 'reverse', foldEvery: 2 },
        chords: [chord(0, 'minor'), chord(5, 'major'), chord(6, 'major'), chord(4, 'dominant7')],
        trays: [
          ['xooo xo.o xooo xo2.', { velocity: .75, gate: .77, protect: [0, 8] }],
          ['xoox oo.o xoox oo2.', { velocity: .71, gate: .74, protect: [0, 3, 8, 11] }],
          ['x.o. x.o. x.o. x.o.', { velocity: .68, protect: [0, 4, 8, 12] }],
          ['xoo2 xo2. xoo2 xo23', { velocity: .66, steps: { 15: { velocity: .55 } }, protect: [0, 8] }]
        ],
        synth: { model: 'vco', wave: 'saw', mix: .61, sub: .2, detune: .12, crossmod: .18,
          filter: { cutoff: 2300, resonance: .26, envAmount: 1.3, keytrack: .42 },
          amp: { attack: .002, decay: .18, sustain: .17, release: .13 },
          filterEnv: { attack: .001, decay: .22, sustain: 0, release: .12 },
          lfo: { shape: 'triangle', rate: .4, depth: .055, target: 'cutoff' }, drive: .24 },
        fx: { chorus: .16, delay: .12, feedback: .21, space: .08, width: .75, volume: .67 }
      }),

    make('tea-towel-waltz', 'Tea towel waltz', 'Twin VCO · Copper coils', 'Lilting',
      'Six-step phrases drift over long D-major changes. A warm triangle pair and tied endings make a gentle kitchen hemiola.', {
        tempo: 87, swing: .06, root: 50, scale: 'major',
        arp: { direction: 'downup', division: '1/8', octaves: 1, gate: .91, spice: 0, fold: 'fall', foldEvery: 3 },
        chords: [chord(0, 'maj7', 2), chord(5, 'min7', 2), chord(1, 'min7', 2, 1), chord(4, 'sus4', 1), chord(4, 'dominant7', 1)],
        trays: [
          ['xoo-xo', { velocity: .62, accent: .84, gate: 1.06, protect: [0, 4] }],
          ['xo-xo-', { velocity: .63, accent: .81, gate: 1.08, protect: [0, 3] }],
          ['x--o--', { velocity: .57, accent: .77, gate: 1.12, protect: [0] }],
          ['xoo2xo', { velocity: .62, accent: .82, protect: [0, 4] }]
        ],
        synth: { model: 'vco', wave: 'triangle', mix: .44, sub: .06, detune: .19, crossmod: .018,
          filter: { type: 'lp12', cutoff: 2000, resonance: .1, envAmount: .85, keytrack: .52 },
          amp: { attack: .014, decay: .72, sustain: .36, release: .62 },
          filterEnv: { attack: .012, decay: .9, sustain: .18, release: .5 },
          lfo: { shape: 'sine', rate: .24, depth: .025, target: 'pitch' }, drive: .08 },
        fx: { chorus: .28, delay: .17, delayDivision: '1/8T', feedback: .26, space: .3, width: .88, volume: .68 }
      }),

    make('sugar-snap', 'Sugar snap', 'Hard sync · Blue flame', 'Bright',
      'C-Mixolydian candy with a B-flat turn. Hard sync makes crisp attacks; two-hit sprinkles catch the last offbeat.', {
        tempo: 124, swing: .035, root: 48, scale: 'mixolydian',
        arp: { direction: 'up', division: '1/16', octaves: 2, gate: .43, spice: .015, fold: 'rise', foldEvery: 4 },
        chords: [chord(0, 'add9'), chord(6, 'major'), chord(3, 'major', 1, 1), chord(0, 'sus4')],
        trays: [
          ['xoo. xo2. xoo. xo2.', { velocity: .69, gate: .72, protect: [0, 8] }],
          ['xo2. xoo. xo2. xoo.', { velocity: .66, gate: .74, protect: [0, 8] }],
          ['x... oo.. x... oo..', { velocity: .6, protect: [0, 8] }],
          ['xoo2 xo2. xoo2 x23.', { velocity: .61, steps: { 13: { octave: 1, velocity: .58 } }, protect: [0, 8] }]
        ],
        synth: { model: 'sync', wave: 'saw', mix: .57, sub: .08, detune: .035, sync: 3,
          filter: { cutoff: 1900, resonance: .2, envAmount: 3.4, keytrack: .36 },
          amp: { attack: .002, decay: .18, sustain: .07, release: .15 },
          filterEnv: { attack: .001, decay: .19, sustain: 0, release: .14 },
          lfo: { shape: 'triangle', rate: .5, sync: '1/16', depth: .085, target: 'cutoff', retrigger: true }, drive: .13 },
        fx: { chorus: .23, delay: .2, feedback: .25, space: .13, width: .9, volume: .64 }
      }),

    make('burner-blue', 'Burner blue', 'Hard sync · Blue flame', 'Restless',
      'A seeded G-minor walk over E-flat, C minor and D seventh. A resonant sync sweep pushes between the empty steps.', {
        tempo: 116, swing: .105, root: 43, scale: 'minor',
        arp: { direction: 'walk', division: '1/16', octaves: 2, gate: .4, spice: .075, fold: 'reverse', foldEvery: 2 },
        chords: [chord(0, 'min7'), chord(5, 'maj7'), chord(3, 'min7'), chord(4, 'dominant7')],
        trays: [
          ['xo.o .o2. xo.o o.o.', { velocity: .69, gate: .78, steps: { 5: { offset: .04 }, 14: { probability: .8 } }, protect: [0, 8] }],
          ['x.o2 .o.o x.o2 .o.o', { velocity: .66, protect: [0, 8] }],
          ['x... .o.. x.o. .o..', { velocity: .63, gate: .95, protect: [0, 8] }],
          ['xo.o .o23 xo.o o232', { velocity: .62, protect: [0, 8] }]
        ],
        synth: { model: 'sync', wave: 'saw', mix: .66, sub: .1, detune: .02, sync: 4.2,
          filter: { cutoff: 1200, resonance: .44, envAmount: 3.2, keytrack: .38 },
          amp: { attack: .005, decay: .25, sustain: .14, release: .17 },
          filterEnv: { attack: .003, decay: .24, sustain: .02, release: .14 },
          lfo: { shape: 'sine', rate: .31, depth: .08, target: 'cutoff' }, drive: .21 },
        fx: { chorus: .15, delay: .18, feedback: .29, space: .11, width: .82, volume: .63 }
      }),

    make('proofing-alarm', 'Proofing alarm', 'Hard sync · Blue flame', 'Chord stabs',
      'An A-seventh alarm rings as a whole chord, with a high-pass bite and gaps between the stabs. Switch to progression for the D and E replies.', {
        tempo: 132, swing: .045, root: 45, scale: 'dorian', source: 'single',
        arp: { direction: 'chord', division: '1/8', octaves: 1, gate: .16, spice: 0, fold: 'none' },
        chords: [chord(0, 'dominant7'), chord(3, 'maj7'), chord(4, 'min7'), chord(0, 'dominant7')],
        trays: [
          ['x..o 2..o x..o 2...', { velocity: .63, accent: .84, gate: .72, protect: [0, 8] }],
          ['x..o .... x..o 2.o.', { velocity: .62, accent: .82, protect: [0, 8] }],
          ['x... .... x... ....', { velocity: .6, accent: .8, protect: [0, 8] }],
          ['x..2 o..2 x..2 o.2.', { velocity: .56, accent: .77, protect: [0, 8] }]
        ],
        synth: { model: 'sync', wave: 'saw', mix: .5, sub: .03, detune: .025, sync: 2,
          filter: { type: 'hp', cutoff: 850, resonance: .22, envAmount: 1, keytrack: .25 },
          amp: { attack: .003, decay: .14, sustain: .03, release: .12 },
          filterEnv: { attack: .001, decay: .18, sustain: 0, release: .1 },
          lfo: { shape: 'sine', rate: .38, depth: .08, target: 'cutoff' }, drive: .17 },
        fx: { chorus: .13, delay: .21, delayDivision: '3/16', feedback: .24, space: .12, width: .88, volume: .58 }
      }),

    make('flambe-runner', 'Flambé runner', 'Hard sync · Blue flame', 'Driving',
      'C harmonic minor, a G-seventh flare and an inside-out lead. Ties and a little glide join the quick double-hit flourishes.', {
        tempo: 140, swing: 0, root: 48, scale: 'harmonic',
        arp: { direction: 'insideout', division: '1/16', octaves: 2, gate: .8, repeat: 2, spice: .015, fold: 'rise', foldEvery: 2 },
        chords: [chord(0, 'minor'), chord(5, 'major'), chord(3, 'min7'), chord(4, 'dominant7')],
        trays: [
          ['xoo- xo2. xoo- xo2.', { velocity: .71, accent: .88, protect: [0, 8] }],
          ['xo-o xo2. xo-o xo2.', { velocity: .68, accent: .87, protect: [0, 8] }],
          ['x--. o.o. x--. o.o.', { velocity: .63, accent: .83, gate: 1.06, protect: [0, 8] }],
          ['xoo2 xo2. xoo2 xo3.', { velocity: .62, accent: .84, protect: [0, 8] }]
        ],
        synth: { model: 'sync', wave: 'saw', mix: .62, sub: .04, detune: .015, sync: 1.6, glide: .035,
          filter: { cutoff: 2700, resonance: .18, envAmount: 1.4, keytrack: .5 },
          amp: { attack: .004, decay: .31, sustain: .65, release: .2 },
          filterEnv: { attack: .003, decay: .38, sustain: .24, release: .19 },
          lfo: { shape: 'triangle', rate: .28, depth: .055, target: 'cutoff' }, drive: .16 },
        fx: { chorus: .16, delay: .14, feedback: .24, space: .13, width: .83, volume: .64 }
      }),

    make('glass-sugar', 'Glass sugar', 'FM · Porcelain & glass', 'Sparkling',
      'A-minor ninths tumble downward like glass sugar. Parallel four-operator FM keeps the attack clear and the echo delicate.', {
        tempo: 108, swing: .055, root: 57, scale: 'minor',
        arp: { direction: 'down', division: '1/16', octaves: 2, gate: .58, spice: .025, fold: 'fall', foldEvery: 4 },
        chords: [chord(0, 'min9'), chord(5, 'maj7'), chord(2, 'maj7', 1, 1), chord(6, 'add9')],
        trays: [
          ['x..o .xo. .o.. xo.o', { velocity: .66, accent: .87, steps: { 3: { octave: -1 }, 15: { probability: .82 } }, protect: [0, 5, 12] }],
          ['xo.. .xo. xo.. .xo.', { velocity: .64, accent: .84, protect: [0, 5, 8, 13] }],
          ['x... .o.. x... .o..', { velocity: .6, accent: .81, gate: 1.1, protect: [0, 8] }],
          ['x..2 .xo2 .o.. xo2.', { velocity: .61, accent: .84, protect: [0, 5, 12] }]
        ],
        synth: { model: 'fm', wave: 'sine', mix: .52, sub: 0, detune: .025,
          fmRatio: 2, fmIndex: 1.75, fmFeedback: .05, fmAlgorithm: 'parallel',
          filter: { type: 'lp12', cutoff: 7600, resonance: .06, envAmount: .1, keytrack: .55 },
          amp: { attack: .002, decay: .88, sustain: .12, release: .5 },
          filterEnv: { attack: .001, decay: .7, sustain: .1, release: .35 },
          lfo: { shape: 'sine', rate: .2, depth: .035, target: 'pan' }, drive: .035 },
        fx: { chorus: .26, delay: .27, feedback: .32, space: .3, width: .96, volume: .69 }
      }),

    make('porcelain-rain', 'Porcelain rain', 'FM · Porcelain & glass', 'Floating',
      'A seeded F-Lydian rain: major seventh, E minor seventh and open G and C colours. Slow FM droplets overlap gently.', {
        tempo: 84, swing: 0, root: 53, scale: 'lydian',
        arp: { direction: 'random', division: '1/8T', octaves: 1, gate: .63, spice: .025, fold: 'mirror', foldEvery: 4 },
        chords: [chord(0, 'maj7', 2), chord(6, 'min7', 2), chord(1, 'sus2', 2), chord(4, 'maj7', 2)],
        trays: [
          ['xo.. o.o. x..o .o..', { velocity: .61, accent: .81, steps: { 6: { probability: .76, velocity: .5 }, 13: { velocity: .53 } }, protect: [0, 8] }],
          ['x.o. .o.. xo.. .o.o', { velocity: .58, accent: .79, protect: [0, 8] }],
          ['x... o... x... o...', { velocity: .56, accent: .76, gate: 1.12, protect: [0, 8] }],
          ['xo.. o.2. x..o .o2.', { velocity: .56, accent: .79, protect: [0, 8] }]
        ],
        synth: { model: 'fm', wave: 'sine', mix: .4, sub: 0, detune: .035,
          fmRatio: 3, fmIndex: 3, fmFeedback: .08, fmAlgorithm: 'cascade',
          filter: { type: 'lp12', cutoff: 4800, resonance: .07, envAmount: .7, keytrack: .6 },
          amp: { attack: .003, decay: 1.7, sustain: .1, release: .9 },
          filterEnv: { attack: .002, decay: 1.5, sustain: .1, release: .6 },
          lfo: { shape: 'sine', rate: .13, depth: .08, target: 'pan' }, drive: .025 },
        fx: { chorus: .17, delay: .29, delayDivision: '1/8T', feedback: .34, space: .44, width: 1, volume: .64 }
      }),

    make('icebox-bells', 'Icebox bells', 'FM · Porcelain & glass', 'Bell tones',
      'G-pentatonic suspended bells with an E-minor reply. A fractional FM ratio and a long room turn each rest into part of the phrase.', {
        tempo: 72, swing: 0, root: 55, scale: 'pentatonic',
        arp: { direction: 'updown', division: '1/8', octaves: 2, gate: .52, spice: 0, fold: 'rotate', foldEvery: 4 },
        chords: [chord(0, 'sus2', 2), chord(3, 'sus2', 2), chord(4, 'min7', 2), chord(0, 'add9', 2)],
        trays: [
          ['x... o.o. x... .o..', { velocity: .59, accent: .8, gate: 1.05, protect: [0, 8] }],
          ['x.o. .... x..o .o..', { velocity: .57, accent: .77, protect: [0, 8] }],
          ['x... .... o... ....', { velocity: .54, accent: .74, gate: 1.3, protect: [0] }],
          ['x... o.2. x... .o2.', { velocity: .53, accent: .77, protect: [0, 8] }]
        ],
        synth: { model: 'fm', wave: 'sine', mix: .63, sub: 0, detune: .015,
          fmRatio: 1.5, fmIndex: 2.7, fmFeedback: .13, fmAlgorithm: 'feedback',
          filter: { type: 'lp12', cutoff: 9200, resonance: .04, envAmount: .2, keytrack: .45 },
          amp: { attack: .001, decay: 2.4, sustain: 0, release: 1.8 },
          filterEnv: { attack: .001, decay: 2, sustain: 0, release: 1.2 },
          lfo: { shape: 'sine', rate: .11, depth: .07, target: 'pan' }, drive: .025 },
        fx: { chorus: .11, delay: .23, delayDivision: '1/4', feedback: .3, space: .49, width: 1, volume: .65 }
      }),

    make('soft-spoon-polyrhythm', 'Soft spoon polyrhythm', 'FM · Porcelain & glass', 'Polymetric',
      'A thirteen-step D-Dorian spoon dance shifts against the chord rack. Soft half-ratio FM and tiny timing nudges keep it human.', {
        tempo: 101, swing: .09, root: 50, scale: 'dorian',
        arp: { direction: 'insideout', division: '1/16', octaves: 1, gate: .64, rotate: 2, spice: .01, fold: 'none' },
        chords: [chord(0, 'min9'), chord(3, 'dominant7'), chord(6, 'maj7'), chord(4, 'min7')],
        trays: [
          ['xo.o x.o. xo.o.', { velocity: .62, accent: .83, gate: .82, steps: { 3: { offset: .035 }, 6: { offset: -.02 }, 11: { velocity: .53 } }, protect: [0, 4, 8] }],
          ['x.oo x.o. x.o2.', { velocity: .59, accent: .8, protect: [0, 4, 8] }],
          ['x... o.o. x...o', { velocity: .55, accent: .77, gate: 1.02, protect: [0, 8] }],
          ['xo.o x.2. xo.23', { velocity: .56, accent: .8, protect: [0, 4, 8] }]
        ],
        synth: { model: 'fm', wave: 'sine', mix: .47, sub: 0, detune: .018,
          fmRatio: .5, fmIndex: 1.2, fmFeedback: .05, fmAlgorithm: 'parallel',
          filter: { type: 'lp12', cutoff: 3600, resonance: .09, envAmount: .7, keytrack: .45 },
          amp: { attack: .004, decay: .48, sustain: .08, release: .25 },
          filterEnv: { attack: .002, decay: .4, sustain: .04, release: .24 },
          lfo: { shape: 'sine', rate: .31, depth: .06, target: 'pan' }, drive: .04 },
        fx: { chorus: .22, delay: .19, feedback: .26, space: .18, width: .87 }
      }),

    make('tinned-peaches', 'Tinned peaches', 'FM · Porcelain & glass', 'Sweet',
      'C-major electric-piano sweetness, through A minor and D minor to G seventh. Tray B starts with a little more air between the peaches.', {
        tempo: 120, swing: .16, root: 48, scale: 'major', selectedPattern: 1,
        arp: { direction: 'up', division: '1/16', octaves: 2, gate: .67, repeat: 2, spice: .015, fold: 'fall', foldEvery: 4 },
        chords: [chord(0, 'add9'), chord(5, 'min7'), chord(1, 'min7', 1, 1), chord(4, 'dominant7')],
        trays: [
          ['xooo xo.o xooo xo.o', { velocity: .67, accent: .86, protect: [0, 8] }],
          ['xo.o .oo. xo.o .oo.', { velocity: .65, accent: .85, steps: { 3: { offset: .025 }, 11: { offset: .025 } }, protect: [0, 8] }],
          ['x... oo.. x... oo..', { velocity: .59, accent: .8, gate: 1.04, protect: [0, 8] }],
          ['xo.o .oo2 xo.o .o23', { velocity: .6, accent: .83, protect: [0, 8] }]
        ],
        synth: { model: 'fm', wave: 'sine', mix: .51, sub: 0, detune: .025,
          fmRatio: 1, fmIndex: .8, fmFeedback: .02, fmAlgorithm: 'cascade',
          filter: { type: 'lp12', cutoff: 4200, resonance: .05, envAmount: .6, keytrack: .5 },
          amp: { attack: .003, decay: .82, sustain: .16, release: .46 },
          filterEnv: { attack: .002, decay: .7, sustain: .08, release: .4 },
          lfo: { shape: 'sine', rate: .26, depth: .035, target: 'pitch' }, drive: .04 },
        fx: { chorus: .34, delay: .14, feedback: .25, space: .18, width: .9, volume: .7 }
      }),

    make('steam-window', 'Steam window', 'Vector · Steam & light', 'Floating',
      'D-minor ninths blur into B-flat and F major sevenths. A glass spectrum breathes slowly while tied notes fog the window.', {
        tempo: 78, swing: 0, root: 50, scale: 'minor',
        arp: { direction: 'downup', division: '1/8', octaves: 2, gate: .95, spice: 0, fold: 'reverse', foldEvery: 4 },
        chords: [chord(0, 'min9', 2), chord(5, 'maj7', 2, 1), chord(2, 'maj7', 2), chord(6, 'sus2', 2)],
        trays: [
          ['xo-. .o-. xo-. .o-.', { velocity: .59, accent: .79, gate: 1.08, protect: [0, 8] }],
          ['x--. o--. x--. o--.', { velocity: .56, accent: .76, gate: 1.15, protect: [0, 8] }],
          ['x--- .... o--- ....', { velocity: .54, accent: .72, gate: 1.18, protect: [0] }],
          ['xo-o .o-. xo-o .o-.', { velocity: .57, accent: .77, protect: [0, 8] }]
        ],
        synth: { model: 'vector', wave: 'sine', mix: .5, sub: .025, detune: .12, table: 'glass', vector: .67,
          filter: { type: 'lp12', cutoff: 2500, resonance: .14, envAmount: .7, keytrack: .48 },
          amp: { attack: .08, decay: 1.4, sustain: .52, release: 1.2 },
          filterEnv: { attack: .16, decay: 1.7, sustain: .32, release: 1 },
          lfo: { shape: 'sine', rate: .08, depth: .42, target: 'vector' }, drive: .055 },
        fx: { chorus: .38, chorusRate: .2, delay: .25, feedback: .32, space: .42, width: 1, volume: .64 }
      }),

    make('ovenlight-choir', 'Ovenlight choir', 'Vector · Steam & light', 'Chord clouds',
      'C-Lydian chords glow under the oven lamp. Triplet chord pulses and ties hold a choir spectrum across long, open changes.', {
        tempo: 92, swing: 0, root: 48, scale: 'lydian',
        arp: { direction: 'chord', division: '1/4T', octaves: 1, gate: .9, spice: 0, fold: 'none' },
        chords: [chord(0, 'maj7', 2, 0, 1), chord(1, 'major', 2, 1), chord(4, 'add9', 2), chord(5, 'min7', 2, 1)],
        trays: [
          ['x-.o -..o x-.o -...', { velocity: .56, accent: .76, gate: 1.12, protect: [0, 8] }],
          ['x--. o--. x--. o--.', { velocity: .53, accent: .72, gate: 1.15, protect: [0, 8] }],
          ['x--- .... o--- ....', { velocity: .51, accent: .7, gate: 1.2, protect: [0] }],
          ['x-.o -..o x-.o -.o.', { velocity: .54, accent: .73, protect: [0, 8] }]
        ],
        synth: { model: 'vector', wave: 'sine', mix: .62, sub: .015, detune: .09, table: 'choir', vector: .35,
          filter: { type: 'lp12', cutoff: 1800, resonance: .12, envAmount: 1.2, keytrack: .48 },
          amp: { attack: .18, decay: 1.2, sustain: .64, release: 1.1 },
          filterEnv: { attack: .28, decay: 1.7, sustain: .4, release: 1.2 },
          lfo: { shape: 'sine', rate: .17, depth: .11, target: 'cutoff' }, drive: .04 },
        fx: { chorus: .3, delay: .16, delayDivision: '1/4', feedback: .25, space: .46, width: .98, volume: .58 }
      }),

    make('reed-basket', 'Reed basket', 'Vector · Steam & light', 'Woodwind groove',
      'A-Dorian reeds weave a seeded line through D seventh and G major. A band-pass filter makes this tray dry, woody and nimble.', {
        tempo: 110, swing: .14, root: 45, scale: 'dorian',
        arp: { direction: 'walk', division: '1/16', octaves: 2, gate: .6, spice: .045, fold: 'reverse', foldEvery: 3 },
        chords: [chord(0, 'min7'), chord(3, 'dominant7'), chord(6, 'maj7'), chord(0, 'min9')],
        trays: [
          ['xo.o xo-. xo.o o.2.', { velocity: .65, accent: .86, steps: { 3: { offset: -.025 }, 13: { velocity: .54 } }, protect: [0, 8] }],
          ['x.oo x.o. x.oo x.o.', { velocity: .62, accent: .83, protect: [0, 4, 8, 12] }],
          ['x... o--. x... o--.', { velocity: .57, accent: .78, gate: 1.03, protect: [0, 8] }],
          ['xo.o xo2. xo.o o232', { velocity: .58, accent: .82, protect: [0, 8] }]
        ],
        synth: { model: 'vector', wave: 'pulse', mix: .46, sub: .03, detune: .07, table: 'reed', vector: .18,
          filter: { type: 'bp', cutoff: 950, resonance: .34, envAmount: 1.3, keytrack: .58 },
          amp: { attack: .007, decay: .32, sustain: .26, release: .19 },
          filterEnv: { attack: .004, decay: .38, sustain: .1, release: .18 },
          lfo: { shape: 'triangle', rate: .6, sync: '1/4', depth: .2, target: 'vector' }, drive: .11 },
        fx: { chorus: .19, delay: .2, feedback: .26, space: .16, width: .86, volume: .7 }
      }),

    make('silver-flour', 'Silver flour', 'Vector · Steam & light', 'Crystalline',
      'An F-sharp minor ninth rests on the held tray. Spectral morphing, rotating order and a gentle pan make the flour shimmer.', {
        tempo: 98, swing: 0, root: 54, scale: 'harmonic', source: 'held', heldNotes: [54, 57, 61, 64, 68],
        arp: { direction: 'outsidein', division: '1/32', octaves: 1, gate: .66, spice: .04, fold: 'rotate', foldEvery: 2 },
        chords: [chord(0, 'min9', 2), chord(5, 'maj7', 2), chord(2, 'maj7', 2), chord(4, 'dominant7', 2)],
        trays: [
          ['xo.. o.oo x.o. .o..', { velocity: .61, accent: .82, steps: { 7: { probability: .8, velocity: .52 } }, protect: [0, 8] }],
          ['x.o. oo.. x.o. .oo.', { velocity: .58, accent: .79, protect: [0, 8] }],
          ['x... o... x... .o..', { velocity: .56, accent: .76, gate: 1.07, protect: [0, 8] }],
          ['xo.. o.2o x.o. .o2.', { velocity: .56, accent: .78, protect: [0, 8] }]
        ],
        synth: { model: 'vector', wave: 'sine', mix: .42, sub: 0, detune: .05, table: 'spectrum', vector: .72,
          filter: { type: 'lp12', cutoff: 4500, resonance: .08, envAmount: 1, keytrack: .55 },
          amp: { attack: .004, decay: .44, sustain: .1, release: .31 },
          filterEnv: { attack: .002, decay: .55, sustain: .07, release: .3 },
          lfo: { shape: 'sine', rate: .37, depth: .34, target: 'pan' }, drive: .04 },
        fx: { chorus: .28, delay: .27, delayDivision: '1/8T', feedback: .32, space: .31, width: 1, volume: .66 }
      }),

    make('slow-bloom', 'Slow bloom', 'Vector · Steam & light', 'Gentle',
      'C added ninth opens into F major seventh and A minor, then hangs on G suspended. Slow hollow spectra let every chord rise.', {
        tempo: 68, swing: 0, root: 48, scale: 'major',
        arp: { direction: 'updown', division: '1/4', octaves: 2, gate: .98, spice: 0, fold: 'rise', foldEvery: 8 },
        chords: [chord(0, 'add9', 2, -1, 1), chord(3, 'maj7', 2, 1), chord(5, 'min7', 2), chord(4, 'sus4', 2)],
        trays: [
          ['xo-- o-.. xo-- o-..', { velocity: .56, accent: .75, gate: 1.12, protect: [0, 8] }],
          ['x--- o--- x--- o---', { velocity: .53, accent: .72, gate: 1.16, protect: [0, 8] }],
          ['x--- .... o--- ....', { velocity: .5, accent: .69, gate: 1.22, protect: [0] }],
          ['xo-o o-.. xo-o o-..', { velocity: .54, accent: .73, protect: [0, 8] }]
        ],
        synth: { model: 'vector', wave: 'sine', mix: .48, sub: .06, detune: .11, table: 'hollow', vector: .27,
          filter: { cutoff: 900, resonance: .14, envAmount: 2.2, keytrack: .42 },
          amp: { attack: .15, decay: .9, sustain: .57, release: 1.6 },
          filterEnv: { attack: .3, decay: 1.6, sustain: .35, release: 1.4 },
          lfo: { shape: 'sine', rate: .055, depth: .26, target: 'vector' }, drive: .065 },
        fx: { chorus: .25, chorusRate: .18, delay: .2, feedback: .29, space: .44, width: .97, volume: .64 }
      })
  ];

  window.ProofPresets = presets;
})();
