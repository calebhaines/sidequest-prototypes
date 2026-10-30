(function (global) {
  'use strict';
  const recipe = (id, name, description, options, words, pitches, voices, durations) => ({
    id, name, description,
    create() {
      const state = global.MorselSchema.defaultState();
      Object.assign(state, options, { name, phrase: words.join(' ') });
      state.steps.forEach(step => { step.on = false; });
      words.forEach((lyric, index) => {
        const position = Math.floor(index * state.length / words.length);
        Object.assign(state.steps[position], { on: true, lyric, pitch: pitches[index % pitches.length], voice: voices?.[index % voices.length] || 'inherit', velocity: .8, gate: .9, probability: 1, ...(durations ? { duration: durations[index % durations.length] } : {}) });
      });
      return state;
    }
  });
  global.MorselPresets = [
    recipe('first-words', 'First words', 'Long words, short words. Each note has room of its own.', { voice: 'alto', tempo: 96, tone: .75, air: .03, vibrato: .02, space: .12, lyric: 'hello' }, ['hello', 'from', 'the', 'kitchen'], [60, 63, 67, 63], undefined, [1.5, .5, .5, 1.5]),
    recipe('velvet-vowels', 'Velvet vowels', 'Overlapping vowels, soft air and a little space.', { voice: 'alto', tempo: 84, tone: .42, air: .24, vibrato: .22, space: .36, lyric: 'ah' }, ['ah', 'oo', 'ee', 'oh'], [60, 67, 65, 63], undefined, [3, 2.5, 2.5, 2]),
    recipe('low-and-slow', 'Low and slow', 'The bass voice takes the long way home.', { voice: 'bass', tempo: 78, tone: .43, air: .08, vibrato: .08, space: .15, lyric: 'down' }, ['down', 'in', 'the', 'kitchen'], [48, 51, 55, 50]),
    recipe('table-talk', 'Table talk', 'Four characters pass the phrase around the table.', { voice: 'alto', tempo: 100, tone: .6, air: .12, vibrato: .06, space: .22, lyric: 'hello' }, ['hello', 'how', 'are', 'you'], [60, 64, 55, 67], ['alto', 'tenor', 'bass', 'robot']),
    recipe('tin-supper', 'Top shelf', 'Bright soprano vowels with long notes and a gentle lift.', { voice: 'robot', tempo: 88, tone: .62, air: .05, vibrato: .08, space: .24, lyric: 'ah' }, ['ah', 'oo', 'ee', 'oh'], [67, 69, 72, 74], undefined, [2.5, 1.5, 2.5, 2]),
    recipe('counting-in', 'Counting in', 'A short eighth, a dotted eighth, a quarter and a longer finish.', { voice: 'tenor', tempo: 110, tone: .64, air: .08, vibrato: .08, space: .14, lyric: 'one' }, ['one', 'two', 'three', 'four'], [60, 62, 64, 67], undefined, [.5, .75, 1, 1.5])
  ];
})(typeof window === 'object' ? window : globalThis);
