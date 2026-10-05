(() => {
  'use strict';
  const studies = [
    ['politely', 'Sixteen cuts, chef insists they’re even', 'kit', 104, .12, [0,4,8,12,2,6,10,14,1,5,9,13,3,7,11,15]],
    ['cupboard', 'A prep tray of small incidents', 'foley', 118, .26, [0,7,2,11,4,13,6,1,8,3,10,5,12,9,14,15]],
    ['doors', 'Sixteen keys to the cold room', 'keys', 92, .18, [0,4,8,12,1,5,9,13,2,6,10,14,3,7,11,15]],
    ['bell', 'The service bell keeps ringing', 'bells', 80, .04, [0,8,4,12,3,11,7,15,2,10,6,14,1,9,5,13]],
    ['reed', 'The reed orders off-menu', 'reed', 126, .3, [0,3,6,9,12,15,2,5,8,11,14,1,4,7,10,13]],
    ['low', 'The basement prep station', 'bass', 110, .2, [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]],
    ['weather', 'The extractor has an opinion', 'noise', 74, .05, [0,8,2,10,4,12,6,14,1,9,3,11,5,13,7,15]],
    ['objections', 'Sixteen portions, one complaint', 'percussion', 138, .13, [0,6,12,2,8,14,4,10,1,7,13,3,9,15,5,11]]
  ];
  const presets = studies.map((x, n) => {
    const state = RavelSchema.defaultState(); state.name = x[1]; state.tempo = x[3]; state.swing = x[4]; state.asset = { kind: 'seed', name: RavelSchema.RECIPES[n].name, recipe: x[2], seed: 9817 + n * 817, tempo: x[3] }; state.seed = 28177 + n;
    state.master.space = n === 3 || n === 6 ? .4 : .15; state.master.echo = n === 2 || n === 4 ? .3 : .12; state.master.drive = n === 5 ? .32 : .12;
    for (let p = 0; p < 4; p++) state.patterns[p].steps.forEach((s, i) => { s.on = n < 2 || n === 5 || n === 7 ? i % 2 === 0 || i % 4 === 3 : i % 4 === 0 || i % 4 === 2; s.slice = x[5][(i + p * 3) % 16]; s.velocity = i % 4 === 0 ? .95 : .62 + (i % 3) * .09; s.probability = p === 3 && i % 2 ? .65 : 1; s.ratchet = p === 2 && i % 8 === 7 ? 3 : 1; s.reverse = p === 1 && i % 4 === 2; s.pitch = p === 2 && i % 4 === 2 ? 7 : p === 3 && i % 4 === 3 ? -5 : 0; s.gate = n === 3 || n === 6 ? 2 : .88; });
    return { id: x[0], name: x[1], state: RavelSchema.normalize(state) };
  });
  window.RavelPresets = presets;
})();
