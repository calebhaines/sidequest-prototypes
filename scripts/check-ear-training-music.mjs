import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { MODES, LEVELS, LEGACY_LEVELS, LEVEL_MIGRATION, LEVEL_CONFIGS, generateQuestion, generatePitchQuestion, getLevelDescription, isCorrect, noteName, spellIntervalNotes, thirdComparisonEvents } from '../public/ear-training/music.js';

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
assert.deepEqual(LEVELS.map(l => l.id), ['level-1', 'level-2', 'level-3', 'level-4', 'level-5', 'level-6', 'level-7', 'level-8']);
assert.deepEqual(LEVELS.map(l => l.number), [1, 2, 3, 4, 5, 6, 7, 8]);
assert.deepEqual(LEVEL_MIGRATION, { beginner: 'level-3', intermediate: 'level-5', advanced: 'level-7' });
assert.deepEqual(MODES.map(m => m.id), ['intervals', 'chords', 'progressions', 'melody', 'scales', 'rhythm', 'pitch', 'ensemble']);

// The full content fingerprint intentionally changes for correct interval note
// spellings. The independent sound/answer baseline was captured from git HEAD
// e17e782 before this change and must remain identical, including RNG behavior.
const legacyQuestions = [];
const legacyRng = seeded(94571);
for (const mode of MODES.filter(m => !['pitch','ensemble'].includes(m.id))) {
  for (const level of LEGACY_LEVELS) {
    for (let i = 0; i < 40; i++) legacyQuestions.push(generateQuestion(mode.id, level.id, legacyRng));
  }
}
assert.equal(createHash('sha256').update(JSON.stringify(legacyQuestions)).digest('hex'), '0146a7d92021614bb68cd7bd7e86d53da9edadb46e3dd3ee542c97df5f4e8092');
const legacySoundsAndAnswers = legacyQuestions.map(q => ({mode:q.mode, level:q.level, answer:q.answer, events:q.events, reference:q.reference}));
assert.equal(createHash('sha256').update(JSON.stringify(legacySoundsAndAnswers)).digest('hex'), 'a0ce7e31a6fec8d7d47840656939853e8b3133ff9f3c09c17da4991c911e6888');

for (const mode of MODES) {
  const behaviors = LEVEL_CONFIGS[mode.id].map(({ description, ...config }) => JSON.stringify(config));
  assert.equal(new Set(behaviors).size, 8, `${mode.id} must have eight actual sound/coverage configurations`);
  LEVELS.forEach(level => assert.ok(getLevelDescription(mode.id, level.id).length > 20));
}

// Independently specified auditory signatures, rather than the generator's data tables.
const intervalDistances = { m2: 1, M2: 2, m3: 3, M3: 4, P4: 5, TT: 6, P5: 7, m6: 8, M6: 9, m7: 10, M7: 11, P8: 12 };
const intervalLetterSteps = { m2: 1, M2: 1, m3: 2, M3: 2, P4: 3, TT: 3, P5: 4, m6: 5, M6: 5, m7: 6, M7: 6, P8: 7 };
const naturalNotes = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};
function readSpelling(name) {
  const match = /^([A-G])([♯♭]*)(-?\d+)$/.exec(name);
  assert.ok(match, `valid note spelling: ${name}`);
  const accidental = [...match[2]].reduce((total, sign) => total + (sign === '♯' ? 1 : -1), 0);
  return {
    midi:(Number(match[3])+1)*12+naturalNotes[match[1]]+accidental,
    degree:Number(match[3])*7+'CDEFGAB'.indexOf(match[1]), accidental
  };
}
for (const [first, second, quality, names] of [
  [60,63,'m3',['C4','E♭4']], [60,64,'M3',['C4','E4']],
  [60,57,'m3',['C4','A3']], [60,56,'M3',['C4','A♭3']],
  [61,64,'m3',['C♯4','E4']], [61,65,'M3',['D♭4','F4']],
  [63,67,'M3',['E♭4','G4']], [66,69,'m3',['F♯4','A4']],
  [71,74,'m3',['B4','D5']], [71,75,'M3',['B4','D♯5']],
  [60,66,'TT',['C4','F♯4']], [60,54,'TT',['C4','G♭3']]
]) assert.deepEqual(spellIntervalNotes(first,second,quality), names);
let spellingCases = 0;
for (const [quality, semitones] of Object.entries(intervalDistances)) {
  for (let first = 24; first <= 96; first++) {
    for (const direction of [-1,1]) {
      const second = first + direction*semitones;
      const names = spellIntervalNotes(first,second,quality).map(readSpelling);
      assert.equal(names[0].midi,first);
      assert.equal(names[1].midi,second);
      assert.equal(names[1].degree-names[0].degree,direction*intervalLetterSteps[quality]);
      assert.ok(names.every(n => Math.abs(n.accidental) <= 1), 'choose an enharmonic root rather than require double accidentals');
      spellingCases++;
    }
  }
}
assert.throws(() => spellIntervalNotes(60,64,'m3'),RangeError);
assert.throws(() => spellIntervalNotes(60.1,63.1,'m3'),RangeError);
assert.throws(() => thirdComparisonEvents({mode:'chords',events:[]}),RangeError);
assert.throws(() => thirdComparisonEvents(generateQuestion('intervals','level-3'),'P5'),RangeError);
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
const expectedChoices = {
  intervals: [2, 3, 5, 7, 12, 12, 12, 12], chords: [2, 3, 4, 6, 8, 10, 10, 10],
  progressions: [2, 3, 4, 5, 6, 7, 8, 8], scales: [2, 3, 4, 5, 6, 7, 8, 9],
  pitch: [2, 2, 2, 2, 2, 2, 2, 2]
};
const pitchDifferences = [200, 100, 50, 25, 15, 10, 5, 2];
const directionCoverage = new Map();
let checked = 0;
for (const { id: mode } of MODES) {
  const levels = ['pitch','ensemble'].includes(mode) ? LEVELS : [...LEGACY_LEVELS, ...LEVELS];
  for (const { id: level } of levels) {
    const rng = seeded(1);
    const levelIndex = LEVELS.findIndex(l => l.id === level);
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
        assert.ok(e.notes.every(n => Number.isFinite(n) && n >= 36 && n <= 96));
        if (mode !== 'pitch') assert.ok(e.notes.every(Number.isInteger));
      }
      if (q.choices.length) {
        assert.equal(new Set(q.choices.map(c => c.value)).size, q.choices.length);
        assert.equal(q.choices.filter(c => c.value === q.answer).length, 1);
        assert.ok(!isCorrect(q, q.choices.find(c => c.value !== q.answer).value));
        coverage[mode].add(q.answer);
        if (levelIndex >= 0) assert.equal(q.choices.length, expectedChoices[mode][levelIndex]);
      }
      if (mode === 'intervals') {
        const notes = q.events.flatMap(e => e.notes);
        assert.equal(Math.abs(notes[0] - notes[1]), intervalDistances[q.answer]);
        if (q.context.includes('descending')) assert.ok(notes[1] < notes[0]);
        if (q.context.includes('ascending')) assert.ok(notes[1] > notes[0]);
        const direction = q.events.length === 1 ? 'simultaneous' : notes[1] < notes[0] ? 'descending' : 'ascending';
        const directions = directionCoverage.get(level) || new Set(); directions.add(direction); directionCoverage.set(level, directions);
        const spelling = spellIntervalNotes(notes[0],notes[1],q.answer);
        assert.ok(q.explanation.includes(`notes were ${spelling[0]} and ${spelling[1]}`));
        const original = JSON.stringify(q);
        for (const quality of ['m3','M3']) {
          const comparison = thirdComparisonEvents(q,quality);
          assert.equal(comparison.length,q.events.length);
          const comparedNotes = comparison.flatMap(e => e.notes);
          assert.equal(comparedNotes[0],notes[0], 'comparison must start on the exact question pitch');
          assert.equal(comparedNotes[1]-comparedNotes[0],Math.sign(notes[1]-notes[0])*(quality==='m3'?3:4));
          comparison.forEach((e,i) => {
            assert.notEqual(e,q.events[i]);
            assert.notEqual(e.notes,q.events[i].notes);
            assert.deepEqual({...e,notes:undefined},{...q.events[i],notes:undefined},'comparison must preserve timing, duration, voice, and velocity');
          });
          assert.equal(JSON.stringify(q),original,'comparison must not mutate question or answer');
        }
        assert.deepEqual(thirdComparisonEvents(q),thirdComparisonEvents(q,'m3'));
      } else if (mode === 'chords') {
        const notes = q.events[0].notes;
        const target = pc(notes);
        const equivalent = Array.from({ length: 12 }, (_, root) => root).some(root =>
          JSON.stringify(pc(chordSignatures[q.answer].map(n => n + root))) === JSON.stringify(target));
        assert.ok(equivalent, `${q.answer} must match its independent pitch-class signature`);
        if ((q.levelConfig?.maxInversion ?? (level === 'advanced' ? 3 : 0)) === 0 || q.answer.startsWith('sus')) assert.deepEqual(relative(notes), chordSignatures[q.answer]);
      } else if (mode === 'progressions') {
        assert.equal(q.events.length, 4);
        assert.ok(Math.abs(q.events.at(-1).at - (q.levelConfig?.gap || .9) * 3) < 1e-9);
        assert.ok(q.events.every(e => e.duration === q.events[0].duration));
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
        assert.ok(q.keyboard.length <= 8);
        if (levelIndex >= 0) {
          assert.equal(q.inputLength, levelIndex + 2);
          assert.equal(q.keyboard.length, [3, 4, 5, 5, 6, 7, 8, 8][levelIndex]);
        }
      } else if (mode === 'scales') {
        const signature = scaleSignatures[q.answer];
        const pitches = q.events.map(e => e.notes[0]);
        assert.deepEqual(relative(pitches.slice(0, signature.length)), signature);
        if (q.levelConfig?.ascendingOnly) assert.equal(pitches.length, signature.length);
        else assert.deepEqual(pitches.slice(signature.length), pitches.slice(0, signature.length - 1).reverse());
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
        if (levelIndex >= 0) {
          assert.equal(q.rhythmSteps, levelIndex < 5 ? 8 : 16);
          assert.ok(Math.abs(beat - 60 / [72, 80, 88, 96, 108, 84, 96, 116][levelIndex]) < 1e-9);
          const hits = q.answer.filter(Boolean).length;
          assert.ok(hits >= q.levelConfig.minHits && hits <= q.levelConfig.maxHits);
          if (q.levelConfig.anchor) assert.ok(q.answer[0]);
          if (levelIndex === 0) assert.ok(q.answer.every((on, i) => !on || i % 2 === 0));
          if (levelIndex === 1 || levelIndex === 2) assert.ok([0, 2, 4, 6].every(i => q.answer[i]));
          if (levelIndex === 5) assert.equal(q.answer.filter((on, i) => on && i % 2 !== 0).length, 1);
        }
      } else if (mode === 'pitch') {
        assert.equal(q.pitchCents, pitchDifferences[levelIndex]);
        assert.equal(q.events.length, 2);
        assert.equal(q.events[0].duration, q.events[1].duration);
        assert.equal(q.events[0].velocity, q.events[1].velocity);
        assert.equal(q.events[0].voice, q.events[1].voice);
        const signedSemitones = q.events[1].notes[0] - q.events[0].notes[0];
        assert.ok(Math.abs(Math.abs(signedSemitones) * 100 - q.pitchCents) < 1e-9);
        assert.equal(q.answer, signedSemitones > 0 ? 'higher' : 'lower');
        const frequencyRatio = 2 ** (q.events[1].notes[0] / 12) / 2 ** (q.events[0].notes[0] / 12);
        assert.ok(Math.abs(1200 * Math.log2(frequencyRatio) - Math.sign(signedSemitones) * q.pitchCents) < 1e-8);
        assert.ok(!q.context.includes(String(q.pitchCents)), 'pre-answer context must not expose the exact pitch difference');
      }
    }
  }
}
assert.equal(coverage.intervals.size, 12);
assert.equal(coverage.chords.size, 10);
assert.equal(coverage.progressions.size, 8);
assert.equal(coverage.scales.size, 9);
assert.ok(coverage.rhythm.size > 50);
assert.equal(coverage.pitch.size, 2);
assert.deepEqual([...directionCoverage.get('level-6')].sort(), ['ascending', 'descending']);
assert.deepEqual([...directionCoverage.get('level-7')].sort(), ['ascending', 'descending', 'simultaneous']);
assert.deepEqual([...directionCoverage.get('level-8')], ['simultaneous']);
for (const cents of [-10, 0, 1, 2, 2.5, 5, 25, 200, 999, undefined, Infinity, 'bad']) {
  for (const sign of [.25, .75]) {
    const q = generatePitchQuestion(cents, () => sign);
    assert.equal(q.mode, 'pitch'); assert.equal(q.level, 'adaptive');
    assert.ok(q.pitchCents >= 2 && q.pitchCents <= 200);
    assert.ok(isCorrect(q, sign < .5 ? 'lower' : 'higher'));
    assert.ok(Math.abs(Math.abs(q.events[1].notes[0] - q.events[0].notes[0]) * 100 - q.pitchCents) < 1e-9);
  }
}
console.log(`PASS: ${checked} seeded questions across 64 graduated configurations and 18 legacy configurations; ${spellingCases} exhaustive interval spellings, same-root third comparisons, unchanged legacy sound/answer fingerprint, independent musical signatures, fractional-cent pitch accuracy, ranges, answer pools, rhythm timing, and exact reconstruction.`);
