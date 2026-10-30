(function (global) {
  'use strict';
  const recipe = (id, name, description, options, words, pitches, voices) => ({
    id, name, description,
    create() {
      const state = global.MorselSchema.defaultState();
      Object.assign(state, options, { name, phrase: words.join(' ') });
      state.steps.forEach(step => { step.on = false; });
      words.forEach((lyric, index) => {
        const position = Math.floor(index * state.length / words.length);
        Object.assign(state.steps[position], { on: true, lyric, pitch: pitches[index % pitches.length], voice: voices?.[index % voices.length] || 'inherit', velocity: .8, gate: .9, probability: 1 });
      });
      return state;
    }
  });
  global.MorselPresets = [
    recipe('first-words', 'First words', 'A warm introduction. Four words, with room to breathe.', { voice: 'alto', tempo: 96, tone: .55, air: .12, vibrato: .1, space: .18, lyric: 'hello' }, ['hello', 'from', 'the', 'kitchen'], [60, 63, 67, 63]),
    recipe('velvet-vowels', 'Velvet vowels', 'Sustained vowel shapes, soft air and a little space.', { voice: 'alto', tempo: 84, tone: .42, air: .24, vibrato: .22, space: .36, lyric: 'ah' }, ['ah', 'oo', 'ee', 'oh'], [60, 67, 65, 63]),
    recipe('low-and-slow', 'Low and slow', 'The bass voice takes the long way home.', { voice: 'bass', tempo: 78, tone: .43, air: .08, vibrato: .08, space: .15, lyric: 'down' }, ['down', 'in', 'the', 'kitchen'], [48, 51, 55, 50]),
    recipe('table-talk', 'Table talk', 'Four characters pass the phrase around the table.', { voice: 'alto', tempo: 100, tone: .6, air: .12, vibrato: .06, space: .22, lyric: 'hello' }, ['hello', 'how', 'are', 'you'], [60, 64, 55, 67], ['alto', 'tenor', 'bass', 'robot']),
    recipe('tin-supper', 'Tin supper', 'A precise little machine with impeccable table manners.', { voice: 'robot', tempo: 112, tone: .7, air: .02, vibrato: 0, space: .1, lyric: 'tick' }, ['tick', 'tock', 'dinner', 'time'], [60, 60, 67, 63]),
    recipe('counting-in', 'Counting in', 'Bright tenor, clear words and an easy four-note phrase.', { voice: 'tenor', tempo: 110, tone: .64, air: .08, vibrato: .08, space: .14, lyric: 'one' }, ['one', 'two', 'three', 'four'], [60, 62, 64, 67])
  ];
})(typeof window === 'object' ? window : globalThis);
