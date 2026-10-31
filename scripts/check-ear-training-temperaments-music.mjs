import assert from 'node:assert/strict';
import { TUNINGS, TEMPERAMENT_MODE, TEMPERAMENT_LEVELS, getTuning, tunedMidi, applyTuning, generateScore, tuningDifference, generateTemperamentQuestion } from '../public/ear-training/temperaments.js';

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const cents = ratio => 1200 * Math.log2(ratio);
const mod = value => ((value % 1200) + 1200) % 1200;
const fifth = cents(3 / 2);
const syntonic = cents(81 / 80);
const pythagorean = cents(531441 / 524288);
const ratio = (first, second, id) => 2 ** ((tunedMidi(second, id) - tunedMidi(first, id)) / 12);
const timing = events => events.map(({ notes, ...rest }) => rest);
const shape = events => events.map(event => event.notes.length);

assert.equal(TEMPERAMENT_MODE.id, 'temperaments');
assert.equal(TUNINGS.length, 8);
assert.equal(new Set(TUNINGS.map(tuning => tuning.id)).size, 8);
assert.equal(TEMPERAMENT_LEVELS.length, 8);
assert.equal(new Set(TEMPERAMENT_LEVELS.map(({ description, id, number, ...config }) => JSON.stringify(config))).size, 8);
assert.throws(() => getTuning('unknown'), RangeError);
assert.throws(() => tunedMidi(60.5, '12edo'), RangeError);
assert.throws(() => generateTemperamentQuestion('missing'), RangeError);
assert.throws(() => generateTemperamentQuestion('level-1', Math.random, { task: 'same-different' }), RangeError);
assert.throws(() => generateTemperamentQuestion('level-1', Math.random, { tuningA: '12edo', tuningB: '12edo' }), RangeError);

// Independent published C-relative values: Scala werck3, vallotti, kirnberger3k.
const fixtures = {
  'werckmeister-iii': [0, 90.225, 192.180, 294.135, 390.225, 498.045, 588.270, 696.090, 792.180, 888.270, 996.090, 1092.180],
  vallotti: [0, 94.135, 196.090, 298.045, 392.180, 501.955, 592.180, 698.045, 796.090, 894.135, 1000, 1090.225],
  'kirnberger-iii': [0, 90.225, 193.15686, 294.135, 386.31371, 498.045, 590.22372, 696.57843, 792.180, 889.73529, 996.090, 1088.26871]
};
for (const [id, pitches] of Object.entries(fixtures)) pitches.forEach((pitch, i) => close(getTuning(id).cents[i], pitch, .00002));

for (const tuning of TUNINGS) {
  assert.equal(tuning.cents.length, 12);
  assert.equal(tuning.cents[0], 0);
  assert.ok(tuning.cents.every((pitch, i) => Number.isFinite(pitch) && pitch >= 0 && pitch < 1200 && (i === 0 || pitch > tuning.cents[i - 1])));
  assert.ok(tuning.sources.every(source => /^https:\/\//.test(source.url)));
  assert.equal(tunedMidi(69, tuning.id), 69, 'all presets must share A4 = 440 Hz exactly');
  close(440 * 2 ** ((tunedMidi(69, tuning.id) - 69) / 12), 440);
  for (let midi = 0; midi <= 115; midi++) {
    close(tunedMidi(midi + 12, tuning.id) - tunedMidi(midi, tuning.id), 12, 2e-14);
    close(ratio(midi, midi + 12, tuning.id), 2, 1e-13);
    if (tuning.id === '12edo') assert.equal(tunedMidi(midi, tuning.id), midi);
    const pc = midi % 12;
    const expectedOffset = (tuning.cents[pc] - 100 * pc) - (tuning.cents[9] - 900);
    close((tunedMidi(midi, tuning.id) - midi) * 100, expectedOffset, 1e-10);
  }
}

// Independent ratio checks, including the actual meantone and Pythagorean wolves.
close(ratio(57, 61, 'meantone-quarter'), 5 / 4);
close(ratio(57, 61, 'pythagorean'), 81 / 64);
for (const id of ['pythagorean', 'meantone-quarter', 'meantone-sixth']) {
  const expectedFifth = id === 'pythagorean' ? fifth : fifth - syntonic / (id === 'meantone-quarter' ? 4 : 6);
  for (let step = -3; step < 8; step++) {
    const first = ((step * 7) % 12 + 12) % 12;
    const second = (((step + 1) * 7) % 12 + 12) % 12;
    close(mod(getTuning(id).cents[second] - getTuning(id).cents[first]), expectedFifth);
  }
  close(mod(getTuning(id).cents[3] - getTuning(id).cents[8]), mod(-11 * expectedFifth));
}
const duodeneRatios = [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8];
duodeneRatios.forEach((value, pc) => close(ratio(60, 60 + pc, 'just-duodene'), value));
for (const id of ['meantone-quarter', 'kirnberger-iii', 'just-duodene']) close(ratio(60, 64, id), 5 / 4);

const expectedNarrowing = {
  'werckmeister-iii': { 0: pythagorean / 4, 7: pythagorean / 4, 2: pythagorean / 4, 11: pythagorean / 4 },
  vallotti: { 5: pythagorean / 6, 0: pythagorean / 6, 7: pythagorean / 6, 2: pythagorean / 6, 9: pythagorean / 6, 4: pythagorean / 6 },
  'kirnberger-iii': { 0: syntonic / 4, 7: syntonic / 4, 2: syntonic / 4, 9: syntonic / 4, 6: pythagorean - syntonic }
};
for (const [id, links] of Object.entries(expectedNarrowing)) {
  for (let root = 0; root < 12; root++) close(mod(getTuning(id).cents[(root + 7) % 12] - getTuning(id).cents[root]), fifth - (links[root] || 0));
}

const sourceScore = [{ at: 0, duration: 1, notes: [60, 64, 67], velocity: .75, voice: 'warm' }, { at: 1.25, duration: .5, notes: [69], velocity: .8 }];
const sourceBefore = JSON.stringify(sourceScore);
for (const tuning of TUNINGS) {
  const applied = applyTuning(sourceScore, tuning.id);
  assert.deepEqual(timing(applied), timing(sourceScore));
  assert.notEqual(applied[0], sourceScore[0]);
  assert.notEqual(applied[0].notes, sourceScore[0].notes);
  assert.equal(JSON.stringify(sourceScore), sourceBefore);
}
close(tuningDifference(sourceScore, 'meantone-quarter', 'kirnberger-iii'), 0, 1e-7); // Deliberate ambiguous triad.
assert.ok(tuningDifference([{ at: 0, duration: 1, notes: [65] }], 'meantone-quarter', 'kirnberger-iii') > 5);
const ambiguousProbe = generateTemperamentQuestion('level-3', () => .45, { tuningA: 'meantone-quarter', tuningB: 'kirnberger-iii' });
assert.equal(ambiguousProbe.diagnostic, true, 'a C/E/G-only tie must be replaced with a distinguishable probe');
assert.ok(tuningDifference(ambiguousProbe.score, 'meantone-quarter', 'kirnberger-iii') > 1e-7);

let checked = 0;
let diagnosticCount = 0;
for (const config of TEMPERAMENT_LEVELS) {
  const score = generateScore(config.id, seeded(12));
  assert.ok(score.every(event => event.notes.every(Number.isInteger)));
  const rng = seeded(55);
  for (let iteration = 0; iteration < 60; iteration++) {
    for (const task of ['abx', 'identify']) {
      const q = generateTemperamentQuestion(config.id, rng, { task });
      checked++;
      assert.equal(q.mode, 'temperaments');
      assert.equal(q.level, config.id);
      assert.equal(q.task, task);
      assert.ok(q.score.every(event => event.notes.every(midi => Number.isInteger(midi) && midi >= 0 && midi <= 127)));
      assert.ok(q.events.every(event => event.notes.every(Number.isFinite)));
      assert.equal(q.choices.filter(choice => choice.value === q.answer).length, 1);
      assert.deepEqual(q.events, applyTuning(q.score, q.tuningX));
      assert.deepEqual(timing(q.events), timing(q.score));
      assert.deepEqual(q.reference, []);
      assert.equal(q.totalDuration, Math.max(...q.score.map(event => event.at + event.duration)));
      assert.equal(JSON.parse(JSON.stringify(q)).answer, q.answer);
      if (q.diagnostic) diagnosticCount++;
      if (task === 'abx') {
        assert.notEqual(q.tuningA, q.tuningB);
        assert.equal(q.tuningX, q.answer === 'A' ? q.tuningA : q.tuningB);
        assert.deepEqual(q.events, q.answer === 'A' ? q.referenceA : q.referenceB);
        assert.ok(tuningDifference(q.score, q.tuningA, q.tuningB) > 1e-7);
        assert.deepEqual(timing(q.referenceA), timing(q.referenceB));
        assert.deepEqual(timing(q.referenceA), timing(q.events));
        assert.deepEqual(shape(q.referenceA), shape(q.referenceB));
        assert.deepEqual(q.choices, [{ value: 'A', label: 'Matches A' }, { value: 'B', label: 'Matches B' }]);
        assert.ok(TUNINGS.every(tuning => !q.context.includes(tuning.name) && !q.prompt.includes(tuning.name)), 'blind ABX context cannot name a tuning');
      } else {
        assert.equal(q.answer, q.tuningX);
        assert.equal(q.choices.length, config.tuningIds.length);
        assert.deepEqual(q.referenceA, []);
        assert.deepEqual(q.referenceB, []);
        for (let i = 0; i < q.choices.length; i++) for (let j = i + 1; j < q.choices.length; j++) {
          assert.ok(tuningDifference(q.score, q.choices[i].value, q.choices[j].value) > 1e-7, 'named answers must never be acoustically identical');
        }
      }
    }
  }
}

// Every ordered pair can be requested at every level, including presets outside
// its automatic pool. Exercise both possible X identities on an identical score.
let pairs = 0;
for (const config of TEMPERAMENT_LEVELS) {
  for (const a of TUNINGS) for (const b of TUNINGS) {
    if (a.id === b.id) continue;
    const make = x => { let calls = 0; return generateTemperamentQuestion(config.id, () => calls++ === 0 ? .45 : x, { tuningA: a.id, tuningB: b.id }); };
    const qa = make(0), qb = make(1);
    pairs++;
    assert.equal(qa.tuningA, a.id); assert.equal(qa.tuningB, b.id);
    assert.equal(qa.answer, 'A'); assert.equal(qb.answer, 'B');
    assert.deepEqual(qa.score, qb.score, 'correct source cannot change probe notes or timing');
    assert.equal(qa.context, qb.context);
    assert.deepEqual(qa.referenceA, qb.referenceA); assert.deepEqual(qa.referenceB, qb.referenceB);
    assert.deepEqual(qa.events, qa.referenceA); assert.deepEqual(qb.events, qb.referenceB);
    assert.ok(tuningDifference(qa.score, a.id, b.id) > 1e-7);
  }
}
console.log(`PASS: ${checked} temperament questions and ${pairs} exhaustive ordered pair/level combinations; exact source fixtures, ratio definitions, fixed A440 anchor/layout, octaves, diagnostic probes, blind ABX identity, and equal score/timing/velocity.`);
