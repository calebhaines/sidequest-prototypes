import assert from 'node:assert/strict';
import { createTemperamentTest, answerTemperamentTest, summarizeTemperamentTest } from '../public/ear-training/temperament-test.js';
import { AudioEngine } from '../public/ear-training/audio.js';

const config = { tuningA: '12tet', tuningB: 'just', level: 'level-3', timbre: 'warm' };
const create = () => createTemperamentTest(config);
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}
function run(correct) {
  let state = create();
  for (let i = 0; i < 20; i++) {
    const answer = i % 2 ? 'A' : 'B';
    state = answerTemperamentTest(state, { answer, response: i < correct ? answer : answer === 'A' ? 'B' : 'A' });
  }
  return state;
}

const initial = create();
assert.deepEqual(initial, {
  protocol: 'temperament-abx-v1', ...config, trialLimit: 20,
  trialCount: 0, correctCount: 0, trials: [], complete: false,
});
assert.notEqual(initial.trials, create().trials, 'runs do not share history');
assert.deepEqual(summarizeTemperamentTest(initial), {
  trials: 0, correct: 0, accuracy: 0, chance: 50, pValue: null, aboveChance: null,
});
const first = answerTemperamentTest(freeze(initial), freeze({ answer: 'B', response: 'B' }));
assert.notEqual(first, initial);
assert.equal(first.trialCount, 1);
assert.equal(first.correctCount, 1);
assert.equal(first.complete, false);
assert.equal(initial.trialCount, 0);
const firstBefore = JSON.stringify(first);
const second = answerTemperamentTest(freeze(first), { answer: 'A', response: 'B' });
assert.equal(second.correctCount, 1);
assert.equal(second.trialCount, 2);
assert.notEqual(second.trials, first.trials);
assert.notEqual(second.trials[0], first.trials[0], 'old trial objects are copied too');
assert.equal(JSON.stringify(first), firstBefore, 'transitions do not alter a prior run');
assert.equal(summarizeTemperamentTest(second).accuracy, 50);
assert.equal(summarizeTemperamentTest(second).pValue, null);
assert.equal(summarizeTemperamentTest(second).aboveChance, null);

// Known exact P(X >= k), X ~ Binomial(20, .5), with integer numerators.
for (const [correct, numerator] of [[0,1048576],[10,616666],[14,60460],[15,21700],[20,1]]) {
  const state = run(correct), before = JSON.stringify(state);
  const summary = summarizeTemperamentTest(freeze(state));
  assert.equal(state.trialCount, 20);
  assert.equal(state.correctCount, correct);
  assert.equal(state.complete, true);
  assert.equal(summary.pValue, numerator / 1048576, `${correct}/20 exact one-sided tail`);
  assert.equal(summary.aboveChance, correct >= 15);
  assert.equal(summary.accuracy, correct / 20 * 100);
  assert.equal(JSON.stringify(state), before, 'summarizing never changes history');
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state, 'states serialize without loss');
  const afterComplete = answerTemperamentTest(state, { answer: 'A', response: 'A' });
  assert.notEqual(afterComplete, state);
  assert.notEqual(afterComplete.trials[0], state.trials[0]);
  assert.deepEqual(afterComplete, state, 'completed runs cannot add a response');
}
let previousP = 1;
for (let correct = 0; correct <= 20; correct++) {
  const summary = summarizeTemperamentTest(run(correct));
  assert(Number.isFinite(summary.pValue) && summary.pValue >= 0 && summary.pValue <= 1);
  assert(summary.pValue <= previousP, 'one-sided tails decrease with more correct responses');
  previousP = summary.pValue;
}
let partial = create();
for (let i = 0; i < 19; i++) partial = answerTemperamentTest(partial, { answer: 'A', response: 'A' });
assert.equal(partial.complete, false);
assert.equal(summarizeTemperamentTest(partial).pValue, null, 'even 19 correct responses do not release an early p-value');
assert.equal(summarizeTemperamentTest(partial).aboveChance, null);
assert.equal(answerTemperamentTest(partial, { answer: 'A', response: 'A' }).complete, true);

for (const options of [null, [], 'config', {},
  {...config, tuningA: ''}, {...config, tuningA: ' just'}, {...config, tuningA: 12},
  {...config, tuningA: config.tuningB}, {...config, tuningB: null},
  {...config, level: 'level-0'}, {...config, level: 'level-9'}, {...config, level: 3},
  {...config, timbre: 'triangle'}, {...config, trialLimit: 0}, {...config, trialLimit: 21},
]) assert.throws(() => createTemperamentTest(options), RangeError);
assert.throws(() => createTemperamentTest(), RangeError);
for (const trial of [null, [], {}, {answer:'a',response:'B'}, {answer:'A',response:'C'}, {answer:1,response:'A'}]) {
  assert.throws(() => answerTemperamentTest(create(), trial), RangeError);
  assert.throws(() => answerTemperamentTest(run(20), trial), RangeError);
}
const sparseTrials = Array(20);
for (let i = 0; i < 15; i++) sparseTrials[i] = {answer:'A',response:'A'};
for (const state of [null, {}, {...create(),protocol:'other'}, {...create(),trialCount:1},
  {...create(),correctCount:1}, {...create(),complete:true}, {...create(),trialLimit:19},
  {...create(),trials:[{answer:'A',response:'C'}]}, {...run(20),trials:Array(21).fill({answer:'A',response:'A'})},
  {...create(),trialCount:1,trials:Array(1)}, {...run(15),trials:sparseTrials},
]) {
  assert.throws(() => answerTemperamentTest(state, {answer:'A',response:'A'}), RangeError);
  assert.throws(() => summarizeTemperamentTest(state), RangeError);
}

// Temperament offsets survive as fractional MIDI in the unchanged synthesizer.
const engine = new AudioEngine();
engine.timbre = 'sine';
const frequencies = [];
engine._partial = frequency => frequencies.push(frequency);
for (const cents of [-31.174093530875, -13.686286135165, 0, 1.955000865387, 17.59628786594]) {
  engine._note(69 + cents / 100, 0, .5, .8, 1);
  assert(Math.abs(frequencies.at(-1) - 440 * 2 ** (cents / 1200)) < 1e-10, 'fractional MIDI preserves temperament offsets');
}
console.log('Temperament ABX checks passed: immutable 20-trial protocol, strict configuration/response validation, completion guard, withheld early inference, exact binomial tails, serialization, and fractional-MIDI audio.');
