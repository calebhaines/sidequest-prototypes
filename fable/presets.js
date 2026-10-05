(() => {
  'use strict';
  const S = window.FableSchema;
  const colors = ['#ff8d45', '#f3cb4f', '#b8c4cb', '#e0b995', '#d3c9b2', '#a6b7bd', '#cba689', '#ffac85'];
  function asset(recipe, root, index, duration = 2.4) {
    return { id: 'preset-' + recipe + '-' + root + '-' + index, kind: 'seed', name: recipe[0].toUpperCase() + recipe.slice(1) + ' · ' + ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][root % 12] + (Math.floor(root / 12) - 1) + ' / ' + (index + 1), recipe, seed: 28741 + root * 73 + index * 1937, duration, sampleRate: 24000, channels: 2, root };
  }
  function patch(name, recipe, roots, variants = 1, configure = () => {}) {
    const state = S.defaultState(); state.name = name; state.assets = []; state.zones = [];
    for (const root of roots) for (let variant = 0; variant < variants; variant++) {
      const sample = asset(recipe, root, variant, recipe === 'kit' ? .85 : recipe === 'choir' || recipe === 'tape' ? 3 : 2.4);
      state.assets.push(sample);
      const zone = S.createZone(sample, { id: 'zone-' + sample.id, color: colors[S.RECIPES.indexOf(recipe)], name: sample.name });
      configure(zone, variant, root, state); state.zones.push(zone);
    }
    state.zones = S.autoMap(state.zones, 'keys'); state.selectedZone = state.zones[0].id;
    return state;
  }
  function patterns(state, notes, { sparse = false, bass = false, drums = false } = {}) {
    for (let p = 0; p < 4; p++) {
      state.patterns[p].name = ['Opening order', 'Second seating', 'Chef’s amendment', 'Last call'][p];
      state.patterns[p].steps.forEach((step, i) => {
        step.on = sparse ? i % 4 === 0 || p === 2 && i % 8 === 6 : drums ? i % 2 === 0 || i % 8 === 7 : bass ? i % 4 === 0 || i % 4 === 3 : i % 2 === 0 || p === 1 && i % 8 === 7;
        step.note = notes[(Math.floor(i / (sparse ? 4 : 2)) + p * 2 + Math.floor(i / 16)) % notes.length];
        if (drums) step.note = i % 8 === 0 ? 36 : i % 8 === 4 ? 38 : i % 16 === 15 ? 43 : i % 4 === 2 ? 42 : 38;
        step.velocity = i % 4 === 0 ? .92 : i % 4 === 2 ? .7 : .48 + ((i * 7 + p) % 4) * .06;
        step.gate = sparse ? 1.8 : bass ? .64 : drums ? .38 : .82;
        step.probability = p === 3 && i % 4 !== 0 ? .72 : 1;
        step.ratchet = p === 2 && i % 16 === 14 ? 2 : 1;
      });
    }
    return state;
  }
  const presets = [
    { id: 'bells', name: 'The Bell at the Service Hatch', description: 'Three sampled registers, each with a soft and a bright velocity layer.', create() {
      const state = patch(this.name, 'bell', [48, 60, 72], 2, (zone, variant) => { zone.velLow = variant ? 77 : 1; zone.velHigh = variant ? 127 : 76; zone.level = variant ? .7 : .85; zone.filter.cutoff = variant ? 18000 : 5500; zone.envelope = { attack: .002, decay: .85, sustain: .24, release: .9 }; });
      state.tempo = 96; state.master.space = .34; state.master.delay = .2;
      return S.normalize(patterns(state, [60, 67, 64, 72, 69, 67, 62, 64]));
    } },
    { id: 'felt', name: 'Quiet Prep, Felt Piano', description: 'A felt piano with three registers and paired round-robin strikes.', create() {
      const state = patch(this.name, 'felt', [48, 60, 72], 2, (zone, variant) => { zone.roundRobin = 1; zone.filter.cutoff = 9000; zone.level = .9; zone.pan = variant ? .08 : -.08; zone.envelope = { attack: .002, decay: .65, sustain: .23, release: .65 }; });
      state.tempo = 88; state.swing = .16; state.master.drive = .04; state.master.space = .25;
      return S.normalize(patterns(state, [48, 60, 55, 64, 57, 67, 53, 62]));
    } },
    { id: 'reed', name: 'The Reed Orders Off-Menu', description: 'Looped sampled reeds; filter envelope, wheel brightness, and gentle breath.', create() {
      const state = patch(this.name, 'reed', [48, 60, 72], 1, zone => { zone.loopMode = 'forward'; zone.loopStart = .18; zone.loopEnd = .78; zone.crossfade = .04; zone.envelope = { attack: .025, decay: .2, sustain: .8, release: .16 }; zone.filter.cutoff = 3200; zone.filter.amount = 2; zone.filter.envelope = { attack: .015, decay: .22, sustain: .15, release: .18 }; });
      state.tempo = 118; state.swing = .22; state.master.chorus = .16; state.master.delay = .2; state.modulation[0] = { source: 'wheel', target: 'cutoff', amount: .55 }; state.modulation[1] = { source: 'lfo1', target: 'pitch', amount: .008 }; state.lfos[0].rate = 4.9;
      return S.normalize(patterns(state, [60, 62, 67, 65, 64, 72, 69, 67]));
    } },
    { id: 'tape', name: 'Yesterday’s Special, Reheated', description: 'Two time-stretched tape samples with slow granular movement.', create() {
      const state = patch(this.name, 'tape', [48, 60], 1, zone => { zone.engine = 'texture'; zone.stretch = 3.2; zone.grainSize = .13; zone.grainDensity = 18; zone.jitter = .12; zone.loopMode = 'pingpong'; zone.envelope = { attack: .22, decay: .6, sustain: .85, release: 1.8 }; zone.filter.cutoff = 6200; zone.width = 1.45; });
      state.tempo = 72; state.master.chorus = .3; state.master.space = .45; state.master.delay = .2; state.master.drive = .15; state.modulation[0] = { source: 'lfo2', target: 'position', amount: .23 }; state.modulation[1] = { source: 'lfo1', target: 'pan', amount: .2 }; state.lfos[0].rate = .13;
      return S.normalize(patterns(state, [48, 55, 60, 64, 52, 59, 62, 67], { sparse: true }));
    } },
    { id: 'choir', name: 'The Night Shift Choir', description: 'Looped stereo choir samples with pressure-controlled spectral movement.', create() {
      const state = patch(this.name, 'choir', [48, 60, 72], 1, zone => { zone.loopMode = 'pingpong'; zone.loopStart = .14; zone.loopEnd = .88; zone.crossfade = .065; zone.envelope = { attack: .16, decay: .5, sustain: .82, release: 1.4 }; zone.filter.cutoff = 7200; zone.width = 1.3; });
      state.tempo = 76; state.master.space = .5; state.master.chorus = .3; state.master.drive = .02; state.modulation[0] = { source: 'pressure', target: 'cutoff', amount: .5 }; state.modulation[1] = { source: 'lfo2', target: 'pan', amount: .18 };
      return S.normalize(patterns(state, [60, 64, 67, 72, 57, 60, 65, 69], { sparse: true }));
    } },
    { id: 'dust', name: 'The Extractor’s Secret Seasoning', description: 'Dust and glass, with velocity layers, texture grains, and random position.', create() {
      const state = patch(this.name, 'dust', [60], 3, (zone, variant) => { zone.engine = 'texture'; zone.grainSize = [.04, .09, .17][variant]; zone.grainDensity = 20; zone.stretch = 1.7; zone.jitter = .3; zone.loopMode = 'forward'; zone.filter.type = variant === 2 ? 'highpass' : 'lowpass'; zone.filter.cutoff = variant === 2 ? 1500 : 3500 + variant * 2500; zone.envelope = { attack: .03, decay: .5, sustain: .5, release: .7 }; zone.pan = (variant - 1) * .4; });
      state.zones = S.autoMap(state.zones, 'velocity'); state.tempo = 84; state.master.space = .4; state.master.delay = .3; state.modulation[0] = { source: 'random', target: 'position', amount: .45 }; state.modulation[1] = { source: 'lfo1', target: 'cutoff', amount: .2 }; state.lfos[0].rate = .24;
      return S.normalize(patterns(state, [60, 67, 62, 72, 65, 69, 57, 64]));
    } },
    { id: 'sub', name: 'Bass from the Cold Room', description: 'Two sampled bass registers; a resonant filter and expressive pitch bend.', create() {
      const state = patch(this.name, 'sub', [36, 48], 2, (zone, variant) => { zone.velLow = variant ? 81 : 1; zone.velHigh = variant ? 127 : 80; zone.loopMode = 'forward'; zone.loopStart = .25; zone.loopEnd = .75; zone.crossfade = .025; zone.filter.cutoff = variant ? 2200 : 750; zone.filter.q = 2.1; zone.filter.amount = 2.4; zone.filter.drive = .2; zone.filter.envelope = { attack: .003, decay: .19, sustain: .08, release: .12 }; zone.envelope = { attack: .003, decay: .22, sustain: .65, release: .1 }; });
      state.tempo = 112; state.swing = .2; state.master.polyphony = 8; state.master.drive = .25; state.master.space = .08; state.master.delay = .1; state.master.bendRange = 12; state.modulation[0] = { source: 'wheel', target: 'cutoff', amount: .5 };
      return S.normalize(patterns(state, [36, 36, 43, 39, 36, 48, 46, 43], { bass: true }));
    } },
    { id: 'kit', name: 'The Utensils Have Formed a Band', description: 'Kick, snare, and hats, with paired round robins and a closed/open choke group.', create() {
      const state = patch(this.name, 'kit', [36, 38, 42, 43], 2, (zone, variant, root) => { zone.low = zone.high = root; zone.tracking = false; zone.roundRobin = root <= 36 ? 1 : root <= 40 ? 2 : root === 42 ? 3 : 4; zone.playMode = 'oneshot'; zone.choke = root >= 42 ? 1 : 0; zone.end = root === 42 ? .22 : root === 43 ? .84 : 1; zone.loopStart = Math.min(zone.loopStart, zone.end * .2); zone.loopEnd = zone.end * .9; zone.filter.cutoff = root >= 42 ? 15000 : 12000; zone.envelope = { attack: .001, decay: root === 42 ? .06 : .35, sustain: 0, release: .08 }; zone.level = root <= 36 ? .9 : .65; });
      // Key mapping for the melodic patches is deliberately overridden by this drum layout.
      state.zones.forEach(zone => { zone.low = zone.high = zone.root; });
      state.tempo = 116; state.swing = .13; state.master.drive = .21; state.master.chorus = 0; state.master.space = .12; state.master.delay = .08;
      return S.normalize(patterns(state, [36, 38, 42, 43], { drums: true }));
    } }
  ];
  window.FablePresets = Object.freeze(presets.map(preset => Object.freeze({ id: preset.id, name: preset.name, description: preset.description, create: () => preset.create() })));
})();
