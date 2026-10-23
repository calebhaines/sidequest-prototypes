import assert from 'node:assert/strict';
import { createPitchTest, answerPitchTest, summarizePitchTest } from '../public/ear-training/pitch-test.js';
import { AudioEngine } from '../public/ear-training/audio.js';

const near = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-10, message ?? `${actual} ≈ ${expected}`);
function answerMany(answers, initial = createPitchTest()) {
  return answers.reduce((state, correct) => answerPitchTest(state, correct), initial);
}
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

const initial = createPitchTest();
assert.deepEqual(initial, {
  trialCount: 0, trialLimit: 24, cents: 100, correctCount: 0, correctRun: 0,
  reversals: [], trials: [], lastDirection: 0, complete: false,
});
assert.notEqual(createPitchTest().trials, initial.trials, 'runs do not share state');
assert.deepEqual(summarizePitchTest(initial), {
  trialCount: 0, correctCount: 0, accuracy: 0, reversalCount: 0,
  estimateCents: null, range: 'insufficient',
});

const oneCorrect = answerPitchTest(deepFreeze(initial), true);
assert.equal(oneCorrect.cents, 100, 'one correct answer does not narrow the gap');
assert.equal(oneCorrect.correctRun, 1);
assert.equal(oneCorrect.lastDirection, 0);
assert.notEqual(oneCorrect, initial);
assert.notEqual(oneCorrect.trials, initial.trials);
assert.equal(initial.trialCount, 0, 'input state is unchanged');
const twoCorrect = answerPitchTest(deepFreeze(oneCorrect), true);
near(twoCorrect.cents, 100 / 1.5);
assert.equal(twoCorrect.correctRun, 0);
assert.equal(twoCorrect.lastDirection, -1);
assert.deepEqual(twoCorrect.reversals, []);
assert.deepEqual(twoCorrect.trials, [{ cents: 100, correct: true }, { cents: 100, correct: true }]);
const incorrect = answerPitchTest(twoCorrect, false);
near(incorrect.cents, 100);
assert.equal(incorrect.correctRun, 0);
assert.equal(incorrect.lastDirection, 1);
assert.deepEqual(incorrect.reversals, [100 / 1.5], 'reversal stores heard gap, not next target');
const hold = answerPitchTest(incorrect, true);
assert.equal(hold.lastDirection, 1, 'a stationary trial preserves last actual movement');
assert.deepEqual(hold.reversals, incorrect.reversals);
const reversedAgain = answerPitchTest(hold, true);
assert.deepEqual(reversedAgain.reversals, [100 / 1.5, 100]);
near(reversedAgain.cents, 100 / 1.5);
const reset = answerMany([true, false, true]);
assert.equal(reset.correctRun, 1, 'incorrect answer breaks the consecutive-correct run');
assert.equal(reset.cents, 150);

const lower = answerMany(Array(24).fill(true));
assert.equal(lower.cents, 2, 'gap clamps to floor');
assert.equal(lower.trialCount, 24);
assert.equal(lower.correctCount, 24);
assert.equal(lower.complete, true);
assert.deepEqual(lower.reversals, [], 'repeated floor hits are not reversals');
assert.equal(summarizePitchTest(lower).range, 'floor');
assert.equal(summarizePitchTest(lower).estimateCents, 2);
assert.equal(summarizePitchTest(lower).accuracy, 100);
const upper = answerMany(Array(24).fill(false));
assert.equal(upper.cents, 200, 'gap clamps to ceiling');
assert.equal(upper.lastDirection, 1);
assert.equal(upper.complete, true);
assert.deepEqual(upper.reversals, []);
assert.equal(summarizePitchTest(upper).range, 'ceiling');
assert.equal(summarizePitchTest(upper).estimateCents, 200);
assert.equal(summarizePitchTest(upper).accuracy, 0);
const afterComplete = answerPitchTest(deepFreeze(lower), false);
assert.notEqual(afterComplete, lower);
assert.deepEqual(afterComplete, lower, 'completed runs cannot accumulate another answer');
assert.notEqual(afterComplete.trials[0], lower.trials[0], 'completed return is independently serializable');

let alternating = createPitchTest();
for (let trial = 0; trial < 24; trial++) {
  assert.equal(alternating.complete, false, `run remains active before trial ${trial + 1}`);
  alternating = answerPitchTest(alternating, trial % 3 !== 2);
}
assert.equal(alternating.complete, true);
assert.equal(alternating.trials.length, 24);
assert.equal(alternating.correctCount, 16);
assert.equal(alternating.reversals.length, 15);
const summary = summarizePitchTest(alternating);
assert.equal(summary.range, 'estimate');
near(summary.estimateCents, Math.sqrt(100 * (100 / 1.5)));
near(summary.accuracy, 100 * 2 / 3);
assert.deepEqual(JSON.parse(JSON.stringify(alternating)), alternating, 'state round-trips through JSON');

const fabricated = {
  ...createPitchTest(), trialCount: 24, correctCount: 18,
  reversals: [2, 200, 4, 16, 4, 16, 4, 16],
  trials: [{ cents: 40, correct: false }],
};
const fabricatedBefore = JSON.stringify(fabricated);
near(summarizePitchTest(fabricated).estimateCents, 8, 'only the latest six reversals enter the geometric mean');
assert.equal(JSON.stringify(fabricated), fabricatedBefore, 'summarizing never mutates a run');
assert.equal(summarizePitchTest({ ...fabricated, reversals: [10, 20, 10] }).range, 'insufficient');
near(summarizePitchTest({ ...fabricated, reversals: [4, 16, 4, 16] }).estimateCents, 8, 'four reversals suffice');
for (const [cents, corrects, expected] of [
  [2, [true, true, true, false], 'floor'],
  [2, [true, true, false, false], 'estimate'],
  [200, [false, false, true, false], 'ceiling'],
  [200, [false, true, true, false], 'estimate'],
]) {
  const state = { ...fabricated, trials: corrects.map(correct => ({ cents, correct })) };
  assert.equal(summarizePitchTest(state).range, expected, 'bound criteria override reversal estimate only when met');
}
assert.equal(summarizePitchTest({ ...fabricated, trials: [
  { cents: 2, correct: true }, { cents: 2, correct: true }, { cents: 2.0001, correct: true }, { cents: 2, correct: true },
] }).range, 'estimate', 'bound classification requires four exact-bound trials');
assert.equal(summarizePitchTest({ ...fabricated, trials: Array(3).fill({ cents: 2, correct: true }) }).range, 'estimate');
const floorPreservesDirection = answerPitchTest({ ...createPitchTest(), cents: 2, correctRun: 1, lastDirection: -1 }, true);
assert.equal(floorPreservesDirection.lastDirection, -1);
assert.deepEqual(floorPreservesDirection.reversals, []);
const leavesFloor = answerPitchTest(floorPreservesDirection, false);
assert.deepEqual(leavesFloor.reversals, [2], 'leaving a bound can produce a genuine reversal');

// Audio uses fractional MIDI unchanged: one cent is a frequency ratio of 2^(1/1200).
const engine = new AudioEngine();
engine.timbre = 'sine';
const frequencies = [];
engine._partial = frequency => frequencies.push(frequency);
for (const cents of [-200, -35, -2, 0, 2, 35, 200]) {
  engine._note(69 + cents / 100, 0, 0.5, 0.8, 1);
  near(frequencies.at(-1), 440 * 2 ** (cents / 1200), `fractional MIDI preserves ${cents}-cent tuning`);
}
console.log('Pitch checks passed: immutable 24-trial staircase, 2-down/1-up, reversals, bounds, summaries, geometric mean, and fractional-MIDI audio.');
