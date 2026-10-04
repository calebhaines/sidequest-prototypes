/* Eight complete tape studies, synthesized locally from portable seed assets. */
(() => {
  'use strict';
  const presets = [];
  function add(id, name, description, edit) {
    const state = SpoolSchema.defaultState(); state.name = name; edit?.(state);
    presets.push({ id, name, description, state: SpoolSchema.normalize(state) });
  }
  function tapes(s, ids, pitch = [36, 36, 48, 60], bars = [2, 2, 2, 2]) {
    s.assets = ids.map((id, i) => SpoolSchema.seedAsset(id, SpoolSchema.SEED_TYPES.find(t => t.id === id).name, { seed: 901 + i * 379, tempo: s.tempo, bars: bars[i], pitch: pitch[i] }));
    s.decks.forEach((deck, i) => { deck.beats = bars[i] * 4; });
  }
  add('yesterday', 'Yesterday, wound incorrectly', 'The clock arrived early. The tape has asked it to wait.');
  add('biscuit', 'A biscuit tin orchestra', 'Four small phrases, borrowed from a cupboard that hums.', s => {
    s.tempo = 108; tapes(s, ['drums', 'bass', 'pluck', 'bells'], [36, 43, 55, 67]);
    s.decks[2].pan = -.45; s.decks[3].pan = .45; s.decks[3].phase = .25; s.decks[3].level = .36;
    s.master.echo = .22; s.master.space = .22; s.source.voice = 'bell';
  });
  add('afterwards', 'A room full of afterwards', 'Slow keys and long air. Yesterday is sitting in the left speaker.', s => {
    s.tempo = 64; tapes(s, ['keys', 'texture', 'bells', 'reed'], [48, 48, 60, 55], [4, 4, 2, 4]);
    s.decks.forEach((deck, i) => { deck.wow = .28; deck.flutter = .09; deck.wear = .22; deck.level = [.70, .30, .37, .42][i]; deck.pan = [-.42, .45, .18, -.12][i]; });
    s.decks[2].reverse = true; s.decks[3].phase = .45; s.master.space = .52; s.master.echo = .33; s.master.feedback = .48;
    s.source.voice = 'sine'; s.source.decay = 2500;
  });
  add('postcard', 'Postcard from the other side', 'Reverse bells, a patient pulse. The postman has become an echo.', s => {
    s.tempo = 88; tapes(s, ['rhythm', 'bass', 'bells', 'keys'], [48, 36, 67, 55]);
    s.decks[2].reverse = true; s.decks[2].phase = .18; s.decks[3].reverse = true; s.decks[3].rate = .5;
    s.decks[0].saturation = .36; s.decks[1].tone = 4900; s.master.echo = .30; s.master.space = .36;
  });
  add('crumbs', 'Crumbs in the capstan', 'A grainy little groove. Several beats have fallen under the sofa.', s => {
    s.tempo = 122; tapes(s, ['drums', 'bass', 'rhythm', 'pluck'], [36, 36, 60, 55]);
    s.decks.forEach((deck, i) => { deck.wear = .55; deck.saturation = .46; deck.wow = .24; deck.flutter = .35; deck.dropouts = .19; deck.hiss = .12; deck.tone = [8700, 4100, 7300, 6200][i]; });
    s.decks[2].level = .40; s.decks[3].phase = .375; s.master.echo = .19; s.master.space = .1;
  });
  add('unspooled', 'The tune has come unspooled', 'Four different revolutions. Nobody remembers which way is Tuesday.', s => {
    s.tempo = 92; tapes(s, ['pluck', 'bells', 'keys', 'texture'], [48, 67, 55, 60], [2, 1, 4, 3]);
    s.decks.forEach((deck, i) => { deck.sync = false; deck.rate = [1, .75, .5, 1.25][i]; deck.pan = [-.55, .55, -.1, .2][i]; deck.level = [.65, .38, .5, .32][i]; deck.wow = .2; });
    s.decks[1].reverse = true; s.master.space = .38; s.master.echo = .29;
  });
  add('velvet', 'Velvet under the floorboards', 'A warm bass, soft keys, and the house practising its breathing.', s => {
    s.tempo = 78; tapes(s, ['drums', 'bass', 'keys', 'texture'], [36, 36, 48, 55], [2, 2, 4, 4]);
    s.decks.forEach((deck, i) => { deck.tone = [6500, 3300, 5100, 4200][i]; deck.wear = .29; deck.saturation = .32; deck.wow = .18; deck.level = [.56, .8, .60, .24][i]; });
    s.master.echo = .10; s.master.space = .23; s.source.voice = 'reed'; s.source.tone = 5100;
  });
  add('clean', 'A most unreasonable blank', 'Four empty reels. The tape insists you have already begun.', s => {
    s.assets = [null, null, null, null]; s.decks.forEach((deck, i) => { deck.name = 'Reel ' + String.fromCharCode(65 + i); deck.sync = false; deck.wow = .06; deck.flutter = .04; deck.wear = .07; deck.hiss = .01; });
    s.master.echo = .1; s.master.space = .15; s.source.voice = 'pluck'; s.record.bars = 2;
  });
  window.SpoolPresets = presets;
})();
