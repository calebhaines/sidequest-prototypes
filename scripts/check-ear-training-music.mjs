import assert from 'node:assert/strict';
import { MODES, LEVELS, generateQuestion, isCorrect, noteName } from '../public/ear-training/music.js';

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const pc = notes => [...new Set(notes.map(n => (n % 12 + 12) % 12))].sort((a, b) => a - b);
const relative = notes => notes.map(n => n - notes[0]);

assert.equal(noteName(60), 'C4');
assert.equal(noteName(69), 'A4');
assert.equal(noteName(48, false), 'C');
assert.equal(noteName(72), 'C5');
assert.throws(() => generateQuestion('missing'), RangeError);
assert.throws(() => generateQuestion('intervals', 'missing'), RangeError);

// Independently specified auditory signatures, rather than the generator's data tables.
const intervalDistances = { m2: 1, M2: 2, m3: 3, M3: 4, P4: 5, TT: 6, P5: 7, m6: 8, M6: 9, m7: 10, M7: 11, P8: 12 };
const chordSignatures = {
  major: [0, 4, 7], minor: [0, 3, 7], diminished: [0, 3, 6], augmented: [0, 4, 8],
  sus2: [0, 2, 7], sus4: [0, 5, 7], dominant7: [0, 4, 7, 10], major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10], 'half-diminished': [0, 3, 6, 10]
};
const scaleSignatures = {
  major: [0, 2, 4, 5, 7, 9, 11, 12], 'natural-minor': [0, 2, 3, 5, 7, 8, 10, 12],
  'major-pentatonic': [0, 2, 4, 7, 9, 12], 'minor-pentatonic': [0, 3, 5, 7, 10, 12],
  dorian: [0, 2, 3, 5, 7, 9, 10, 12], mixolydian: [0, 2, 4, 5, 7, 9, 10, 12],
  'harmonic-minor': [0, 2, 3, 5, 7, 8, 11, 12], lydian: [0, 2, 4, 6, 7, 9, 11, 12],
  phrygian: [0, 1, 3, 5, 7, 8, 10, 12]
};
const degreeOffsets = { I: 0, ii: 2, iii: 4, IV: 5, V: 7, vi: 9 };
const coverage = Object.fromEntries(MODES.map(m => [m.id, new Set()]));
let checked = 0;
for (const { id: mode } of MODES) {
  for (const { id: level } of LEVELS) {
    const rng = seeded(1);
    for (let iteration = 0; iteration < 300; iteration++) {
      const q = generateQuestion(mode, level, rng);
      checked++;
      assert.equal(q.mode, mode);
      assert.equal(q.level, level);
      assert.ok(q.prompt && q.context && q.answerLabel && q.explanation);
      assert.ok(isCorrect(q, q.answer));
      assert.ok(!isCorrect(q, null));
      assert.ok(!isCorrect(q, []));
      assert.ok(Array.isArray(q.events) && q.events.length);
      for (const e of [...q.events, ...(q.reference || [])]) {
        assert.ok(Number.isFinite(e.at) && e.at >= 0);
        assert.ok(Number.isFinite(e.duration) && e.duration > 0);
        assert.ok(e.notes.length > 0);
        assert.ok(e.notes.every(n => Number.isInteger(n) && n >= 36 && n <= 96));
      }
      if (q.choices.length) {
        assert.equal(new Set(q.choices.map(c => c.value)).size, q.choices.length);
        assert.equal(q.choices.filter(c => c.value === q.answer).length, 1);
        assert.ok(!isCorrect(q, q.choices.find(c => c.value !== q.answer).value));
        coverage[mode].add(q.answer);
      }
      if (mode === 'intervals') {
        const notes = q.events.flatMap(e => e.notes);
        assert.equal(Math.abs(notes[0] - notes[1]), intervalDistances[q.answer]);
        if (q.context.includes('descending')) assert.ok(notes[1] < notes[0]);
      } else if (mode === 'chords') {
        const notes = q.events[0].notes;
        const target = pc(notes);
        const equivalent = Array.from({ length: 12 }, (_, root) => root).some(root =>
          JSON.stringify(pc(chordSignatures[q.answer].map(n => n + root))) === JSON.stringify(target));
        assert.ok(equivalent, `${q.answer} must match its independent pitch-class signature`);
        if (level !== 'advanced' || q.answer.startsWith('sus')) assert.deepEqual(relative(notes), chordSignatures[q.answer]);
      } else if (mode === 'progressions') {
        assert.equal(q.events.length, 4);
        assert.equal(q.events.at(-1).at, 2.7);
        const tonic = q.reference[0].notes[0];
        const expected = q.answer.split('-').map(numeral => degreeOffsets[numeral]);
        assert.deepEqual(q.events.map(e => ((e.notes[0] - tonic) % 12 + 12) % 12), expected);
        // Every triad is diatonic, and the bass is the declared chord's root.
        for (const e of q.events) assert.ok(e.notes.every(n => [0, 2, 4, 5, 7, 9, 11].includes(((n - tonic) % 12 + 12) % 12)));
      } else if (mode === 'melody') {
        assert.equal(q.answer.length, q.inputLength);
        assert.deepEqual(q.events.map(e => e.notes[0]), q.answer);
        assert.ok(q.answer.every(n => q.keyboard.some(k => k.midi === n)));
        assert.ok(!isCorrect(q, q.answer.map(n => n + 12)), 'octave-shifted melody must not count as exact reconstruction');
        assert.ok(!isCorrect(q, q.answer.slice(1)), 'partial reconstruction cannot be correct');
      } else if (mode === 'scales') {
        const signature = scaleSignatures[q.answer];
        const pitches = q.events.map(e => e.notes[0]);
        assert.deepEqual(relative(pitches.slice(0, signature.length)), signature);
        assert.deepEqual(pitches.slice(signature.length), pitches.slice(0, signature.length - 1).reverse());
      } else if (mode === 'rhythm') {
        assert.equal(q.answer.length, q.rhythmSteps);
        assert.equal(q.reference.length, 4);
        const beat = q.stepDuration * q.rhythmSteps / 4;
        assert.ok(Math.abs(q.reference[3].at + q.reference[3].duration - beat * 4) < 1e-9);
        assert.ok(q.answer.every(on => typeof on === 'boolean'));
        const hitSteps = q.events.map(e => Math.round(e.at / q.stepDuration));
        assert.deepEqual(hitSteps, q.answer.flatMap((on, i) => on ? [i] : []));
        assert.ok(!isCorrect(q, q.answer.map(on => !on)));
        coverage[mode].add(q.answer.join(''));
      }
    }
  }
}
assert.equal(coverage.intervals.size, 12);
assert.equal(coverage.chords.size, 10);
assert.equal(coverage.progressions.size, 8);
assert.equal(coverage.scales.size, 9);
assert.ok(coverage.rhythm.size > 50);
console.log(`PASS: ${checked} seeded questions; musical signatures, ranges, answer pools, rhythm timing, exact reconstruction, and full content coverage.`);
