/* Eight complete reductions. Every preset contains its complete, editable patch. */
(() => {
  'use strict';
  const presets = [];
  function add(id, name, description, edit) {
    const state = MireSchema.defaultState();
    state.name = name;
    edit?.(state);
    presets.push({ id, name, description, state: MireSchema.normalize(state) });
  }
  const beats = (source, positions, velocity = .7, probability = 1, ratchet = 1) => {
    source.steps = Array.from({ length: 16 }, (_, i) => ({ on: positions.includes(i), velocity: i % 4 === 0 ? Math.min(1, velocity + .12) : velocity, probability, ratchet }));
  };
  const types = (state, ids) => ids.forEach((model, i) => state.nodes[i].model = model);
  const pitches = (state, notes) => notes.forEach((pitch, i) => state.nodes[i].pitch = pitch);
  const kinds = (state, ids) => ids.forEach((kind, i) => state.sources[i].kind = kind);

  add('patient', 'The patient stockpot', 'Short droplets and copper echoes. The stockpot is considering a second opinion.');

  add('copper', 'The saucepan has opinions', 'Ringing bowls and springy replies. The saucepan has overruled the teaspoon.', s => {
    s.tempo = 92; s.swing = .04; s.garden = { circulation: .66, damping: .15, freeze: false };
    types(s, ['bowl', 'bowl', 'spring', 'tape']); pitches(s, [48, 55, 60, 67]);
    kinds(s, ['chime', 'pluck', 'pulse', 'drop']);
    s.sources.forEach((source, i) => { source.pitch = [60, 67, 72, 48][i]; source.decay = [780, 220, 85, 260][i]; source.level = [.35, .4, .22, .45][i]; source.destination = i; });
    beats(s.sources[0], [0, 7, 13], .75); beats(s.sources[1], [3, 10], .65); beats(s.sources[2], [5, 14], .6, .7); beats(s.sources[3], [0, 8], .8);
    s.nodes.forEach(n => { n.resonance = .66; n.tone = 9400; n.drift = .04; });
    s.modulators = [{ shape: 'sine', rate: .042, depth: .23, target: 'n0.pan' }, { shape: 'triangle', rate: .065, depth: .18, target: 'n1.tone' }];
  });

  add('corners', 'After-hours bain-marie', 'Slow reflections and bowed air. The heat lamp refuses to clock out.', s => {
    s.tempo = 68; s.swing = 0; types(s, ['diffuser', 'cloud', 'tape', 'cloud']);
    s.garden.circulation = .83; s.garden.damping = .37; s.master.mix = .98; s.master.drive = .07;
    kinds(s, ['bow', 'reed', 'dust', 'chime']);
    s.sources.forEach((source, i) => { source.pitch = [48, 55, 60, 67][i]; source.decay = [1800, 1700, 600, 1100][i]; source.level = [.30, .25, .15, .20][i]; source.destination = i; });
    beats(s.sources[0], [0], .75); beats(s.sources[1], [9], .65); beats(s.sources[2], [5, 14], .45, .6); beats(s.sources[3], [12], .55, .65);
    s.nodes.forEach((n, i) => { n.time = [450, 940, 750, 1350][i]; n.sync = false; n.decay = .94; n.drift = .28; n.tone = [2800, 3600, 2400, 4100][i]; });
    s.routing = [[.4, .35, .12, .1], [.14, .4, .16, .26], [.25, .12, .42, .15], [.32, .25, .1, .3]];
    s.modulators = [{ shape: 'sine', rate: .025, depth: .2, target: 'n1.time' }, { shape: 'sine', rate: .037, depth: .45, target: 'n3.pan' }];
  });

  add('roots', 'Cutlery reduction', 'Four tuned bodies, plucked in passing. The cutlery has joined the sauce.', s => {
    s.tempo = 116; s.swing = .11; types(s, ['string', 'spring', 'string', 'cloud']); pitches(s, [48, 55, 60, 64]);
    s.garden.circulation = .59; s.garden.damping = .22; kinds(s, ['pluck', 'pulse', 'drop', 'pluck']);
    s.sources.forEach((source, i) => { source.pitch = [48, 55, 64, 67][i]; source.destination = i; source.level = [.45, .24, .35, .30][i]; source.decay = [180, 60, 140, 240][i]; });
    beats(s.sources[0], [0, 6, 10], .8); beats(s.sources[1], [3, 7, 11, 15], .62); beats(s.sources[2], [4, 12], .65); beats(s.sources[3], [2, 9, 14], .6, .85);
    s.nodes.forEach(n => { n.resonance = .78; n.decay = .84; n.drift = .05; n.tone = 7800; });
    s.modulators = [{ shape: 'triangle', rate: .13, depth: .24, target: 'n2.tone' }, { shape: 'sine', rate: .073, depth: .34, target: 'n3.pan' }];
  });

  add('radio', 'Ticket printer soup', 'A crooked pulse train. The ticket printer appears to be making stock.', s => {
    s.tempo = 128; s.swing = .18; types(s, ['tape', 'string', 'spring', 'diffuser']);
    s.garden.circulation = .63; s.garden.damping = .32; s.master.drive = .34; s.master.mix = .72;
    kinds(s, ['pulse', 'reed', 'dust', 'pluck']);
    s.sources.forEach((source, i) => { source.pitch = [36, 48, 72, 55][i]; source.decay = [110, 360, 45, 180][i]; source.level = [.52, .29, .25, .32][i]; source.texture = .62; source.destination = i; });
    beats(s.sources[0], [0, 6, 8, 14], .9); beats(s.sources[1], [3, 11], .6); beats(s.sources[2], [2, 4, 7, 10, 12, 15], .55, .88); s.sources[2].steps[15].ratchet = 2; beats(s.sources[3], [5, 13], .7);
    s.nodes[0].division = '3/16'; s.nodes[1].division = '1/16'; s.nodes[2].division = '1/8'; s.nodes[3].division = '1/4';
    s.modulators = [{ shape: 'random', rate: .42, depth: .18, target: 'n2.tone' }, { shape: 'triangle', rate: .12, depth: .16, target: 'drive' }];
  });

  add('weather', 'Steam in the sauce', 'Scattered noise and swelling friction. The sauce has reached atmospheric pressure.', s => {
    s.tempo = 82; s.swing = .04; types(s, ['cloud', 'diffuser', 'cloud', 'bowl']); pitches(s, [48, 55, 60, 67]);
    s.garden.circulation = .79; s.garden.damping = .17; s.master.mix = .94; kinds(s, ['dust', 'bow', 'dust', 'chime']);
    s.sources.forEach((source, i) => { source.decay = [260, 2100, 120, 650][i]; source.level = [.23, .29, .18, .20][i]; source.texture = [ .85, .55, .95, .42 ][i]; source.destination = i; });
    beats(s.sources[0], [1, 4, 7, 11, 14], .55, .62); beats(s.sources[1], [0, 10], .75, .7); beats(s.sources[2], [3, 6, 9, 15], .45, .55, 2); beats(s.sources[3], [8], .7, .65);
    s.nodes.forEach((n, i) => { n.drift = .42; n.decay = .91; n.sync = false; n.time = [370, 680, 1030, 530][i]; });
    s.modulators = [{ shape: 'random', rate: .08, depth: .22, target: 'n0.time' }, { shape: 'sine', rate: .038, depth: .37, target: 'n3.pitch' }];
  });

  add('walking', 'Four pans, no handles', 'An uneven procession of echoes. The saucepan has escaped the line.', s => {
    s.tempo = 106; s.swing = .12; types(s, ['spring', 'diffuser', 'tape', 'bowl']); pitches(s, [45, 52, 57, 64]);
    kinds(s, ['pluck', 'drop', 'reed', 'pulse']); s.garden.circulation = .73;
    s.sources.forEach((source, i) => { source.pitch = [45, 52, 57, 64][i]; source.destination = i; source.level = [.35, .50, .26, .23][i]; });
    beats(s.sources[0], [0, 5, 10, 15], .75); beats(s.sources[1], [3, 9], .8); beats(s.sources[2], [7, 14], .65); beats(s.sources[3], [2, 6, 11], .6, .82);
    s.routing = [[.3, .55, .1, 0], [0, .3, .55, .1], [.1, 0, .3, .55], [.55, .1, 0, .3]];
    s.modulators = [{ shape: 'sine', rate: .16, depth: .45, target: 'n0.pan' }, { shape: 'sine', rate: .11, depth: .48, target: 'n3.pan' }];
  });

  add('thursday', 'Reduced beyond recognition', 'A slow luminous loop. Chef cannot remember what went in first.', s => {
    s.tempo = 58; s.swing = 0; types(s, ['tape', 'cloud', 'diffuser', 'string']); pitches(s, [48, 55, 60, 67]);
    kinds(s, ['bow', 'chime', 'reed', 'dust']); s.garden.circulation = .90; s.garden.damping = .28; s.master.drive = .06; s.master.mix = .98;
    s.sources.forEach((source, i) => { source.pitch = [48, 67, 55, 72][i]; source.decay = [2500, 900, 1800, 500][i]; source.level = [.25, .21, .23, .12][i]; source.destination = i; });
    beats(s.sources[0], [0], .75); beats(s.sources[1], [11], .55); beats(s.sources[2], [7], .65); beats(s.sources[3], [4, 14], .5, .45);
    s.nodes.forEach((n, i) => { n.sync = false; n.time = [620, 1250, 870, 1010][i]; n.decay = .96; n.drift = .22; n.tone = [3500, 4300, 3200, 5700][i]; });
    s.routing = [[.25, .62, .1, 0], [0, .25, .62, .1], [.1, 0, .25, .62], [.62, .1, 0, .25]];
    s.modulators = [{ shape: 'sine', rate: .024, depth: .20, target: 'n1.time' }, { shape: 'triangle', rate: .02, depth: .35, target: 'n2.tone' }];
  });
  window.MirePresets = presets;
})();
