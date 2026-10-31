// Overtone: procedural listening exercises. MIDI 60 is middle C (C4).
import { ENSEMBLE_MODE, ENSEMBLE_LEVELS, generateEnsembleQuestion, gradeEnsemble } from './ensemble.js?v=5';
import { TEMPERAMENT_MODE, TEMPERAMENT_LEVELS, generateTemperamentQuestion } from './temperaments.js?v=5';
export const LEGACY_LEVELS = [
  { id: 'beginner', title: 'Foundation' },
  { id: 'intermediate', title: 'Developing' },
  { id: 'advanced', title: 'Deep listening' }
];
export const LEVELS = ['First steps', 'Finding shape', 'Landmarks', 'Wider palette', 'Fine detail', 'Fluent listening', 'Deep listening', 'Close focus']
  .map((title, i) => ({ id: `level-${i + 1}`, number: i + 1, title: `${String(i + 1).padStart(2, '0')} · ${title}` }));
export const LEVEL_MIGRATION = { beginner: 'level-3', intermediate: 'level-5', advanced: 'level-7' };

export const MODES = [
  { id: 'intervals', title: 'Intervals', short: 'Intervals', tag: '01 / DISTANCE', description: 'Hear the space between two notes.', prompt: 'Which interval do you hear?', lesson: 'An interval measures pitch distance. A major third spans four semitones; a perfect fifth spans seven. Listen to the relationship, rather than the starting note.' },
  { id: 'chords', title: 'Chord quality', short: 'Chords', tag: '02 / COLOR', description: 'Find the character inside a chord.', prompt: 'What kind of chord is this?', lesson: 'Chord quality comes from the intervals above its root. Major has a major third; minor has a minor third. Inversions reorder the notes without changing the quality.' },
  { id: 'progressions', title: 'Progressions', short: 'Progressions', tag: '03 / MOVEMENT', description: 'Follow harmony from chord to chord.', prompt: 'Which progression do you hear?', lesson: 'Roman numerals describe chords relative to the key. Uppercase means major, lowercase means minor, and ° means diminished. First hear the tonic reference, then follow the bass and harmonic movement.' },
  { id: 'melody', title: 'Melody memory', short: 'Melody', tag: '04 / RECALL', description: 'Listen, remember, and rebuild a phrase.', prompt: 'Rebuild the melody in order.', lesson: 'Use the tonic reference to orient yourself. Notice the opening pitch, then remember steps, leaps, and repeated notes. Enter the exact pitches in their original octave.' },
  { id: 'scales', title: 'Scale colors', short: 'Scales', tag: '05 / TONALITY', description: 'Recognize the sound of a scale.', prompt: 'Which scale do you hear?', lesson: 'Scales have characteristic step patterns. Major has a bright major third; natural minor lowers the third, sixth, and seventh. Modes change which degrees are raised or lowered relative to major.' },
  { id: 'rhythm', title: 'Rhythm memory', short: 'Rhythm', tag: '06 / TIME', description: 'Reconstruct a bar, one pulse at a time.', prompt: 'Rebuild the rhythm on the grid.', lesson: 'Hear four count-in beats, then one bar in 4/4. Each grid cell is an eighth note at levels 1–5, or a sixteenth note at levels 6–8. Turn on the cells where a sound occurs. This tests the pattern, not tap timing.' },
  { id: 'pitch', title: 'Pitch discrimination', short: 'Pitch detail', tag: '07 / RESOLUTION', description: 'Hear tiny changes in pitch.', prompt: 'Is the second tone higher or lower?', lesson: 'Listen to two equally long tones and decide whether the second is higher or lower. One semitone is 100 cents. Small differences can be subtle: replay freely and compare the pitch, rather than loudness or timing.' },
  ENSEMBLE_MODE,
  TEMPERAMENT_MODE
];

const PITCHES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export function noteName(midi, withOctave = true) {
  const n = Math.round(midi);
  return PITCHES[((n % 12) + 12) % 12] + (withOctave ? Math.floor(n / 12) - 1 : '');
}

export const INTERVALS = [
  { value: 'm2', label: 'Minor 2nd', semitones: 1 },
  { value: 'M2', label: 'Major 2nd', semitones: 2 },
  { value: 'm3', label: 'Minor 3rd', semitones: 3 },
  { value: 'M3', label: 'Major 3rd', semitones: 4 },
  { value: 'P4', label: 'Perfect 4th', semitones: 5 },
  { value: 'TT', label: 'Tritone', semitones: 6 },
  { value: 'P5', label: 'Perfect 5th', semitones: 7 },
  { value: 'm6', label: 'Minor 6th', semitones: 8 },
  { value: 'M6', label: 'Major 6th', semitones: 9 },
  { value: 'm7', label: 'Minor 7th', semitones: 10 },
  { value: 'M7', label: 'Major 7th', semitones: 11 },
  { value: 'P8', label: 'Octave', semitones: 12 }
];

const NATURAL_PITCHES = [0, 2, 4, 5, 7, 9, 11];
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const INTERVAL_LETTER_STEPS = { m2: 1, M2: 1, m3: 2, M3: 2, P4: 3, TT: 3, P5: 4, m6: 5, M6: 5, m7: 6, M7: 6, P8: 7 };
// Alternative names for each starting pitch. Prefer familiar flats where the
// interval permits them, then choose the spelling with the simplest ending note.
const ROOT_SPELLINGS = [
  [[0, 0]], [[1, -1], [0, 1]], [[1, 0]], [[2, -1], [1, 1]],
  [[2, 0]], [[3, 0]], [[3, 1], [4, -1]], [[4, 0]],
  [[5, -1], [4, 1]], [[5, 0]], [[6, -1], [5, 1]], [[6, 0]]
];

/** Spell a chromatic interval with the letter distance its name requires.
 * The tritone is spelled as an augmented fourth. MIDI pitches are unchanged.
 */
export function spellIntervalNotes(firstMidi, secondMidi, intervalId) {
  const interval = INTERVALS.find(item => item.value === intervalId);
  if (!interval || !Number.isInteger(firstMidi) || !Number.isInteger(secondMidi)
    || Math.abs(secondMidi - firstMidi) !== interval.semitones) {
    throw new RangeError('Interval spelling requires two matching integer MIDI pitches and an interval id.');
  }
  const direction = Math.sign(secondMidi - firstMidi);
  const octave = Math.floor(firstMidi / 12) - 1;
  const pitchClass = ((firstMidi % 12) + 12) % 12;
  let best;
  for (const [letter, accidental] of ROOT_SPELLINGS[pitchClass]) {
    const secondDegree = octave * 7 + letter + direction * INTERVAL_LETTER_STEPS[intervalId];
    const secondOctave = Math.floor(secondDegree / 7);
    const secondLetter = ((secondDegree % 7) + 7) % 7;
    const secondAccidental = secondMidi - ((secondOctave + 1) * 12 + NATURAL_PITCHES[secondLetter]);
    const complexity = Math.abs(accidental) + Math.abs(secondAccidental) + (Math.abs(secondAccidental) > 1 ? 100 : 0);
    if (!best || complexity < best.complexity) best = { complexity, letter, accidental, secondLetter, secondAccidental, secondOctave };
  }
  const format = (letter, accidental, octave) => LETTERS[letter]
    + (accidental < 0 ? '♭'.repeat(-accidental) : '♯'.repeat(accidental)) + octave;
  return [format(best.letter, best.accidental, octave), format(best.secondLetter, best.secondAccidental, best.secondOctave)];
}

/** A third comparison keeps the question's first pitch and presentation intact. */
export function thirdComparisonEvents(question, quality = 'm3') {
  if (question?.mode !== 'intervals' || !['m3', 'M3'].includes(quality)
    || !Array.isArray(question.events) || question.events.flatMap(e => e.notes || []).length !== 2) {
    throw new RangeError('Third comparisons require an interval question and m3 or M3 quality.');
  }
  const pitches = question.events.flatMap(e => e.notes);
  if (!pitches.every(Number.isFinite) || pitches[0] === pitches[1]) throw new RangeError('Invalid interval comparison pitches.');
  const second = pitches[0] + Math.sign(pitches[1] - pitches[0]) * (quality === 'm3' ? 3 : 4);
  let noteIndex = 0;
  return question.events.map(e => ({ ...e, notes: e.notes.map(midi => noteIndex++ === 1 ? second : midi) }));
}

export const CHORDS = [
  { value: 'major', label: 'Major', notes: [0, 4, 7], hint: 'a major third and a perfect fifth' },
  { value: 'minor', label: 'Minor', notes: [0, 3, 7], hint: 'a minor third and a perfect fifth' },
  { value: 'diminished', label: 'Diminished', notes: [0, 3, 6], hint: 'a minor third and a diminished fifth' },
  { value: 'augmented', label: 'Augmented', notes: [0, 4, 8], hint: 'a major third and an augmented fifth' },
  { value: 'sus2', label: 'Suspended 2nd', notes: [0, 2, 7], hint: 'a major second in place of the third' },
  { value: 'sus4', label: 'Suspended 4th', notes: [0, 5, 7], hint: 'a perfect fourth in place of the third' },
  { value: 'dominant7', label: 'Dominant 7th', notes: [0, 4, 7, 10], hint: 'a major triad with a minor seventh' },
  { value: 'major7', label: 'Major 7th', notes: [0, 4, 7, 11], hint: 'a major triad with a major seventh' },
  { value: 'minor7', label: 'Minor 7th', notes: [0, 3, 7, 10], hint: 'a minor triad with a minor seventh' },
  { value: 'half-diminished', label: 'Half-diminished 7th', notes: [0, 3, 6, 10], hint: 'a diminished triad with a minor seventh' }
];

export const SCALES = [
  { value: 'major', label: 'Major', notes: [0, 2, 4, 5, 7, 9, 11], hint: '1–2–3–4–5–6–7; semitones between 3–4 and 7–8' },
  { value: 'natural-minor', label: 'Natural minor', notes: [0, 2, 3, 5, 7, 8, 10], hint: '1–2–♭3–4–5–♭6–♭7' },
  { value: 'major-pentatonic', label: 'Major pentatonic', notes: [0, 2, 4, 7, 9], hint: '1–2–3–5–6; five notes, with no semitone steps' },
  { value: 'minor-pentatonic', label: 'Minor pentatonic', notes: [0, 3, 5, 7, 10], hint: '1–♭3–4–5–♭7; five notes, with no semitone steps' },
  { value: 'dorian', label: 'Dorian', notes: [0, 2, 3, 5, 7, 9, 10], hint: 'minor with a raised sixth: 1–2–♭3–4–5–6–♭7' },
  { value: 'mixolydian', label: 'Mixolydian', notes: [0, 2, 4, 5, 7, 9, 10], hint: 'major with a lowered seventh: 1–2–3–4–5–6–♭7' },
  { value: 'harmonic-minor', label: 'Harmonic minor', notes: [0, 2, 3, 5, 7, 8, 11], hint: 'natural minor with a raised seventh, creating a three-semitone leap from ♭6 to 7' },
  { value: 'lydian', label: 'Lydian', notes: [0, 2, 4, 6, 7, 9, 11], hint: 'major with a raised fourth: 1–2–3–♯4–5–6–7' },
  { value: 'phrygian', label: 'Phrygian', notes: [0, 1, 3, 5, 7, 8, 10], hint: 'minor with a lowered second: 1–♭2–♭3–4–5–♭6–♭7' }
];

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const KEYS = [
  { root: 60, name: 'C', labels: ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'] },
  { root: 62, name: 'D', labels: ['D', 'E', 'F♯', 'G', 'A', 'B', 'C♯', 'D'] },
  { root: 65, name: 'F', labels: ['F', 'G', 'A', 'B♭', 'C', 'D', 'E', 'F'] },
  { root: 55, name: 'G', labels: ['G', 'A', 'B', 'C', 'D', 'E', 'F♯', 'G'] },
  { root: 57, name: 'A', labels: ['A', 'B', 'C♯', 'D', 'E', 'F♯', 'G♯', 'A'] },
  { root: 58, name: 'B♭', labels: ['B♭', 'C', 'D', 'E♭', 'F', 'G', 'A', 'B♭'] }
];
export const PROGRESSIONS = [
  { value: 'I-IV-V-I', label: 'I – IV – V – I', degrees: [0, 3, 4, 0], hint: 'tonic → subdominant → dominant → tonic; the final V–I resolves home' },
  { value: 'I-V-vi-IV', label: 'I – V – vi – IV', degrees: [0, 4, 5, 3], hint: 'tonic → dominant → relative minor → subdominant' },
  { value: 'I-vi-IV-V', label: 'I – vi – IV – V', degrees: [0, 5, 3, 4], hint: 'tonic → relative minor → subdominant → dominant; the ending wants to return to I' },
  { value: 'I-IV-I-V', label: 'I – IV – I – V', degrees: [0, 3, 0, 4], hint: 'tonic → subdominant → tonic → dominant; listen for the return to I in the third chord' },
  { value: 'vi-IV-I-V', label: 'vi – IV – I – V', degrees: [5, 3, 0, 4], hint: 'relative minor → subdominant → tonic → dominant; the first chord is not the tonic' },
  { value: 'ii-V-I-I', label: 'ii – V – I – I', degrees: [1, 4, 0, 0], hint: 'supertonic → dominant → tonic → tonic; two final tonic chords settle the cadence' },
  { value: 'I-iii-vi-IV', label: 'I – iii – vi – IV', degrees: [0, 2, 5, 3], hint: 'tonic → mediant → relative minor → subdominant; two minor chords fill the middle' },
  { value: 'iii-vi-ii-V', label: 'iii – vi – ii – V', degrees: [2, 5, 1, 4], hint: 'mediant → relative minor → supertonic → dominant; descending-fifth root motion leads toward I' }
];

const pick = (items, rng) => items[Math.min(items.length - 1, Math.max(0, Math.floor(rng() * items.length)))];
const integer = (min, max, rng) => min + Math.min(max - min, Math.max(0, Math.floor(rng() * (max - min + 1))));
const choices = items => items.map(({ value, label }) => ({ value, label }));
const event = (at, duration, notes, extra = {}) => ({ at, duration, notes, ...extra });
const tonic = root => [event(0, .65, [root, root + 4, root + 7], { velocity: .7 })];
function invert(notes, amount) {
  const result = [...notes];
  for (let i = 0; i < amount; i++) result.push(result.shift() + 12);
  return result;
}

function intervalQuestion(level, rng) {
  const pool = level === 'beginner' ? INTERVALS.filter(i => ['m3', 'M3', 'P4', 'P5', 'P8'].includes(i.value)) : INTERVALS;
  const interval = pick(pool, rng);
  const direction = level === 'advanced' ? pick(['ascending', 'descending', 'simultaneous'], rng) : 'ascending';
  const root = integer(55, 67, rng);
  const second = root + (direction === 'descending' ? -interval.semitones : interval.semitones);
  const [firstName, secondName] = spellIntervalNotes(root, second, interval.value);
  return {
    prompt: 'Which interval do you hear?', context: `Two notes · ${direction} · identify their distance`,
    answer: interval.value, answerLabel: interval.label, choices: choices(pool),
    events: direction === 'simultaneous' ? [event(0, 1.1, [root, second])] : [event(0, .55, [root]), event(.72, .75, [second])],
    explanation: `${interval.label}: ${interval.semitones} semitone${interval.semitones === 1 ? '' : 's'}. The notes were ${firstName} and ${secondName}${direction === 'simultaneous' ? ', played together' : `, played ${direction}`}.`
  };
}

function chordQuestion(level, rng) {
  // Suspended triads stay in root position: sus2 and sus4 inversions can be the same pitch collection.
  const pool = CHORDS.slice(0, level === 'beginner' ? 4 : level === 'intermediate' ? 6 : 10);
  const chord = pick(pool, rng);
  const root = integer(48, 60, rng);
  const inversion = level === 'advanced' && !chord.value.startsWith('sus') ? integer(0, chord.notes.length - 1, rng) : 0;
  const notes = invert(chord.notes.map(n => root + n), inversion);
  return {
    prompt: 'What kind of chord is this?', context: level === 'advanced' ? 'Root position or inversion · suspended chords stay in root position' : 'One chord · root position',
    answer: chord.value, answerLabel: chord.label, choices: choices(pool), events: [event(0, 1.35, notes)],
    explanation: `${chord.label} contains ${chord.hint}. Root: ${noteName(root, false)}. ${inversion ? `This was inversion ${inversion}; the root was not the lowest note.` : 'This was in root position.'}`
  };
}

function progressionQuestion(level, rng) {
  const pool = PROGRESSIONS.slice(0, level === 'beginner' ? 4 : level === 'intermediate' ? 6 : 8);
  const progression = pick(pool, rng);
  const key = level === 'beginner' ? KEYS[0] : pick(KEYS, rng);
  const events = progression.degrees.map((degree, i) => {
    const notes = [degree, degree + 2, degree + 4].map(d => key.root + MAJOR[d % 7] + 12 * Math.floor(d / 7));
    const voiced = level === 'advanced' ? invert(notes, integer(0, 2, rng)) : notes;
    // A separate root bass keeps the harmonic root audible when upper voices invert.
    return event(i * .9, .73, [key.root - 12 + MAJOR[degree], ...voiced], { velocity: .8 });
  });
  return {
    prompt: 'Which progression do you hear?', context: `${key.name} major · tonic reference, then four chords`, keyLabel: `${key.name} major`,
    answer: progression.value, answerLabel: progression.label, choices: choices(pool), reference: tonic(key.root), events,
    explanation: `${progression.label}: ${progression.hint}. The reference chord established ${key.name} major. ${level === 'advanced' ? 'Upper voices may be inverted; the bass still plays each chord’s root.' : 'Each chord was played in root position.'}`
  };
}

function melodyQuestion(level, rng) {
  const key = level === 'beginner' ? KEYS[0] : pick(KEYS, rng);
  const pool = (level === 'beginner' ? MAJOR.slice(0, 5) : level === 'intermediate' ? MAJOR : [...MAJOR, 12]);
  const length = level === 'beginner' ? 4 : level === 'intermediate' ? 5 : 7;
  const indices = [integer(0, pool.length - 1, rng)];
  for (let i = 1; i < length; i++) {
    const previous = indices[i - 1];
    const maxLeap = level === 'advanced' ? 3 : 2;
    const nearby = pool.map((_, j) => j).filter(j => Math.abs(j - previous) <= maxLeap);
    indices.push(pick(nearby, rng));
  }
  const answer = indices.map(i => key.root + pool[i]);
  const keyboard = pool.map((n, i) => ({ midi: key.root + n, label: `${key.labels[i]}${Math.floor((key.root + n) / 12) - 1}`, degree: i === 7 ? '8' : String(i + 1) }));
  const gap = level === 'beginner' ? .57 : level === 'intermediate' ? .49 : .42;
  return {
    prompt: 'Rebuild the melody in order.', context: `${key.name} major · ${length} notes · exact pitches, same octave`, keyLabel: `${key.name} major`,
    answer, answerLabel: indices.map(i => keyboard[i].label).join(' → '), choices: [], inputLength: length, keyboard,
    reference: tonic(key.root), events: answer.map((n, i) => event(i * gap, gap * .72, [n])),
    explanation: `The melody was ${indices.map(i => keyboard[i].label).join(' → ')}. Scale degrees: ${indices.map(i => i + 1).join(' – ')}. Use the tonic reference to locate the first note, then track each step or leap.`
  };
}

function scaleQuestion(level, rng) {
  const pool = SCALES.slice(0, level === 'beginner' ? 2 : level === 'intermediate' ? 4 : 9);
  const scale = pick(pool, rng);
  const root = integer(55, 66, rng);
  const ascending = [...scale.notes, 12];
  const shape = [...ascending, ...ascending.slice(0, -1).reverse()];
  return {
    prompt: 'Which scale do you hear?', context: 'One scale · ascending and descending · listen to the step pattern',
    answer: scale.value, answerLabel: scale.label, choices: choices(pool), events: shape.map((n, i) => event(i * .25, .2, [root + n])),
    explanation: `${scale.label}: ${scale.hint}. The tonic was ${noteName(root)}. The same scale was played up to the octave and back down.`
  };
}

export function rhythmLabels(steps) {
  return Array.from({ length: steps }, (_, i) => {
    const subdivisions = steps / 4;
    const beat = Math.floor(i / subdivisions) + 1;
    return String(beat) + (subdivisions === 2 ? ['', '&'][i % subdivisions] : ['', 'e', '&', 'a'][i % subdivisions]);
  });
}

function rhythmQuestion(level, rng) {
  const steps = level === 'advanced' ? 16 : 8;
  const stepDuration = level === 'beginner' ? .3 : level === 'intermediate' ? .25 : .16;
  const beatDuration = stepDuration * steps / 4;
  let answer;
  if (level === 'beginner') {
    const patterns = [
      [0, 2, 4, 6], [0, 1, 2, 4, 6], [0, 2, 3, 4, 6],
      [0, 2, 4, 5, 6], [0, 2, 4, 6, 7], [0, 1, 2, 4, 5, 6]
    ];
    const hits = pick(patterns, rng);
    answer = Array.from({ length: steps }, (_, i) => hits.includes(i));
  } else {
    answer = Array.from({ length: steps }, (_, i) => i === 0 || rng() < (steps === 16 ? .45 : .55));
    if (answer.filter(Boolean).length < 3) { answer[steps / 2] = true; answer[steps - 2] = true; }
    if (answer.every(Boolean)) answer[steps - 1] = false;
  }
  const labels = rhythmLabels(steps);
  return {
    prompt: 'Rebuild the rhythm on the grid.',
    context: `4/4 · four count-in beats · one bar of ${steps === 8 ? 'eighth' : 'sixteenth'} notes · ${Math.round(60 / beatDuration)} BPM`,
    answer, answerLabel: answer.map((on, i) => on ? labels[i] : null).filter(Boolean).join(' · '), choices: [], rhythmSteps: steps, stepDuration,
    reference: Array.from({ length: 4 }, (_, i) => event(i * beatDuration, beatDuration, [i === 0 ? 88 : 81], { voice: 'click', velocity: .55 })),
    events: answer.flatMap((on, i) => on ? [event(i * stepDuration, .07, [76], { voice: 'click', velocity: .85 })] : []),
    explanation: `The hits fell on ${answer.map((on, i) => on ? labels[i] : null).filter(Boolean).join(', ')}. Each cell lasts one ${steps === 8 ? 'eighth' : 'sixteenth'} note. The four count-in clicks were not part of the answer.`
  };
}

const GENERATORS = { intervals: intervalQuestion, chords: chordQuestion, progressions: progressionQuestion, melody: melodyQuestion, scales: scaleQuestion, rhythm: rhythmQuestion };

// Each row changes the actual sound or answer pool. Legacy generation below is
// deliberately kept separate so saved history and earlier checks remain valid.
export const LEVEL_CONFIGS = {
  intervals: [
    { pool: ['P5', 'P8'], directions: ['ascending'], duration: .7, gap: .9, rootMin: 55, rootMax: 67, description: 'Perfect fifth or octave · ascending · spacious pacing.' },
    { pool: ['M3', 'P5', 'P8'], directions: ['ascending'], duration: .68, gap: .86, rootMin: 55, rootMax: 67, description: 'Major third, perfect fifth, or octave · ascending.' },
    { pool: ['m3', 'M3', 'P4', 'P5', 'P8'], directions: ['ascending'], duration: .6, gap: .78, rootMin: 55, rootMax: 67, description: 'Five landmarks: minor/major thirds, fourth, fifth, and octave · ascending.' },
    { pool: ['m2', 'M2', 'm3', 'M3', 'P4', 'P5', 'P8'], directions: ['ascending'], duration: .57, gap: .73, rootMin: 55, rootMax: 67, description: 'Seven intervals · adds minor and major seconds · ascending.' },
    { pool: INTERVALS.map(i => i.value), directions: ['ascending'], duration: .55, gap: .72, rootMin: 55, rootMax: 67, description: 'All 12 intervals through the octave · ascending.' },
    { pool: INTERVALS.map(i => i.value), directions: ['ascending', 'descending'], duration: .5, gap: .66, rootMin: 55, rootMax: 67, description: 'All 12 intervals · ascending or descending · quicker pacing.' },
    { pool: INTERVALS.map(i => i.value), directions: ['ascending', 'descending', 'simultaneous'], duration: .45, gap: .6, rootMin: 55, rootMax: 67, description: 'All 12 intervals · ascending, descending, or played together.' },
    { pool: INTERVALS.map(i => i.value), directions: ['simultaneous'], duration: .75, gap: .5, rootMin: 48, rootMax: 72, description: 'All 12 intervals · simultaneous notes only · wider starting register.' }
  ],
  chords: [
    { count: 2, maxInversion: 0, duration: 1.5, description: 'Major or minor triads · root position.' },
    { count: 3, maxInversion: 0, duration: 1.45, description: 'Major, minor, and diminished triads · root position.' },
    { count: 4, maxInversion: 0, duration: 1.35, description: 'Adds augmented triads · four qualities in root position.' },
    { count: 6, maxInversion: 0, duration: 1.3, description: 'Adds suspended 2nd and 4th chords · six qualities in root position.' },
    { count: 8, maxInversion: 0, duration: 1.25, description: 'Adds dominant 7th and major 7th · eight qualities in root position.' },
    { count: 10, maxInversion: 0, duration: 1.2, description: 'Adds minor 7th and half-diminished 7th · ten qualities in root position.' },
    { count: 10, maxInversion: 1, duration: 1.15, description: 'Ten qualities · root position or first inversion; suspended chords stay in root position.' },
    { count: 10, maxInversion: 3, duration: .95, description: 'Ten qualities · all inversions · shorter chords; suspended chords stay in root position.' }
  ],
  progressions: [
    { count: 2, keyCount: 1, maxInversion: 0, gap: 1.1, description: 'Two four-chord patterns · C major · slow root-position chords.' },
    { count: 3, keyCount: 1, maxInversion: 0, gap: 1.05, description: 'Three four-chord patterns · C major · root position.' },
    { count: 4, keyCount: 1, maxInversion: 0, gap: .95, description: 'Four four-chord patterns · C major · root position.' },
    { count: 5, keyCount: 4, maxInversion: 0, gap: .9, description: 'Five patterns · C, D, F, or G major · root position.' },
    { count: 6, keyCount: 6, maxInversion: 0, gap: .85, description: 'Six patterns across six major keys · root position.' },
    { count: 7, keyCount: 6, maxInversion: 0, gap: .8, description: 'Seven patterns across six keys · quicker root-position chords.' },
    { count: 8, keyCount: 6, maxInversion: 1, gap: .75, description: 'Eight patterns · upper voices may use first inversion · root bass retained.' },
    { count: 8, keyCount: 6, maxInversion: 2, gap: .6, description: 'Eight patterns · all upper-voice inversions · faster pacing · root bass retained.' }
  ],
  melody: [
    { length: 2, poolCount: 3, keyCount: 1, maxLeap: 1, gap: .72, description: '2 notes from C–D–E · C major · steps and repeated notes.' },
    { length: 3, poolCount: 4, keyCount: 1, maxLeap: 1, gap: .66, description: '3 notes from C–D–E–F · C major · steps and repeated notes.' },
    { length: 4, poolCount: 5, keyCount: 1, maxLeap: 2, gap: .6, description: '4 notes from C–D–E–F–G · steps and small leaps.' },
    { length: 5, poolCount: 5, keyCount: 3, maxLeap: 2, gap: .56, description: '5 notes from the first five scale degrees · C, D, or F major.' },
    { length: 6, poolCount: 6, keyCount: 4, maxLeap: 2, gap: .52, description: '6 notes from six scale degrees · four major keys.' },
    { length: 7, poolCount: 7, keyCount: 6, maxLeap: 3, gap: .48, description: '7 notes from the full major scale · six keys · larger leaps.' },
    { length: 8, poolCount: 8, keyCount: 6, maxLeap: 3, gap: .43, description: '8 notes across a full octave · six keys · quicker recall.' },
    { length: 9, poolCount: 8, keyCount: 6, maxLeap: 4, gap: .38, description: '9 notes across a full octave · six keys · wider leaps and faster pacing.' }
  ],
  scales: [
    { count: 2, gap: .38, ascendingOnly: false, rootMin: 60, rootMax: 60, description: 'Major or natural minor · C tonic · up and down slowly.' },
    { count: 3, gap: .35, ascendingOnly: false, rootMin: 58, rootMax: 62, description: 'Adds major pentatonic · three scale colors · up and down.' },
    { count: 4, gap: .32, ascendingOnly: false, rootMin: 55, rootMax: 66, description: 'Adds minor pentatonic · four scales · changing tonics.' },
    { count: 5, gap: .29, ascendingOnly: false, rootMin: 55, rootMax: 66, description: 'Adds Dorian · five scale colors · up and down.' },
    { count: 6, gap: .27, ascendingOnly: false, rootMin: 55, rootMax: 66, description: 'Adds Mixolydian · six scale colors · up and down.' },
    { count: 7, gap: .25, ascendingOnly: false, rootMin: 55, rootMax: 66, description: 'Adds harmonic minor · seven scale colors · up and down.' },
    { count: 8, gap: .23, ascendingOnly: true, rootMin: 55, rootMax: 66, description: 'Adds Lydian · eight scales · ascending only.' },
    { count: 9, gap: .21, ascendingOnly: true, rootMin: 55, rootMax: 66, description: 'Adds Phrygian · nine scales · ascending only at a faster pace.' }
  ],
  rhythm: [
    { steps: 8, bpm: 72, style: 'onbeat', minHits: 2, maxHits: 3, anchor: true, description: '8-cell grid · quarter-note hits and rests · 72 BPM.' },
    { steps: 8, bpm: 80, style: 'add-one', minHits: 5, maxHits: 5, anchor: true, description: '8-cell grid · four beats plus one offbeat eighth note · 80 BPM.' },
    { steps: 8, bpm: 88, style: 'add-two', minHits: 5, maxHits: 6, anchor: true, description: '8-cell grid · four beats plus one or two offbeats · 88 BPM.' },
    { steps: 8, bpm: 96, style: 'syncopated', minHits: 3, maxHits: 5, anchor: true, description: '8-cell grid · offbeats and beat rests · first beat anchored · 96 BPM.' },
    { steps: 8, bpm: 108, style: 'syncopated', minHits: 3, maxHits: 6, anchor: false, description: '8-cell grid · freer syncopation, including opening rests · 108 BPM.' },
    { steps: 16, bpm: 84, style: 'sixteenth-intro', minHits: 5, maxHits: 7, anchor: true, description: '16-cell grid · mostly eighth notes plus one sixteenth-note offbeat · 84 BPM.' },
    { steps: 16, bpm: 96, style: 'syncopated', minHits: 5, maxHits: 9, anchor: false, description: '16-cell grid · freely placed sixteenth-note hits and rests · 96 BPM.' },
    { steps: 16, bpm: 116, style: 'syncopated', minHits: 6, maxHits: 11, anchor: false, description: '16-cell grid · denser sixteenth-note syncopation · 116 BPM.' }
  ],
  pitch: [200, 100, 50, 25, 15, 10, 5, 2].map(cents => ({ cents, description: `Two equal-length tones · ${cents}-cent difference · decide whether the second is higher or lower.` })),
  ensemble: ENSEMBLE_LEVELS,
  temperaments: TEMPERAMENT_LEVELS
};

export function getLevelDescription(mode, level) {
  if (!MODES.some(m => m.id === mode)) return '';
  const id = LEVEL_MIGRATION[level] || level;
  const index = LEVELS.findIndex(l => l.id === id);
  return index < 0 ? '' : LEVEL_CONFIGS[mode][index].description;
}

function graduatedInterval(c, rng) {
  const pool = INTERVALS.filter(i => c.pool.includes(i.value));
  const interval = pick(pool, rng);
  const direction = pick(c.directions, rng);
  const root = integer(c.rootMin, c.rootMax, rng);
  const second = root + (direction === 'descending' ? -interval.semitones : interval.semitones);
  const [firstName, secondName] = spellIntervalNotes(root, second, interval.value);
  return {
    prompt: 'Which interval do you hear?', context: `Two notes · ${direction} · identify their distance`,
    answer: interval.value, answerLabel: interval.label, choices: choices(pool),
    events: direction === 'simultaneous' ? [event(0, c.duration, [root, second])] : [event(0, c.duration, [root]), event(c.gap, c.duration, [second])],
    explanation: `${interval.label}: ${interval.semitones} semitone${interval.semitones === 1 ? '' : 's'}. The notes were ${firstName} and ${secondName}${direction === 'simultaneous' ? ', played together' : `, played ${direction}`}.`
  };
}

function graduatedChord(c, rng) {
  const pool = CHORDS.slice(0, c.count);
  const chord = pick(pool, rng);
  const root = integer(48, 60, rng);
  const inversion = chord.value.startsWith('sus') ? 0 : integer(0, Math.min(c.maxInversion, chord.notes.length - 1), rng);
  return {
    prompt: 'What kind of chord is this?',
    context: c.maxInversion ? `${c.maxInversion === 1 ? 'Root position or first inversion' : 'Root position or inversion'} · suspended chords stay in root position` : 'One chord · root position',
    answer: chord.value, answerLabel: chord.label, choices: choices(pool), events: [event(0, c.duration, invert(chord.notes.map(n => root + n), inversion))],
    explanation: `${chord.label} contains ${chord.hint}. Root: ${noteName(root, false)}. ${inversion ? `This was inversion ${inversion}; the root was not the lowest note.` : 'This was in root position.'}`
  };
}

function graduatedProgression(c, rng) {
  const pool = PROGRESSIONS.slice(0, c.count);
  const progression = pick(pool, rng);
  const key = pick(KEYS.slice(0, c.keyCount), rng);
  return {
    prompt: 'Which progression do you hear?', context: `${key.name} major · tonic reference, then four chords`, keyLabel: `${key.name} major`,
    answer: progression.value, answerLabel: progression.label, choices: choices(pool), reference: tonic(key.root),
    events: progression.degrees.map((degree, i) => {
      const upper = [degree, degree + 2, degree + 4].map(d => key.root + MAJOR[d % 7] + 12 * Math.floor(d / 7));
      const voiced = invert(upper, integer(0, c.maxInversion, rng));
      return event(i * c.gap, c.gap * .8, [key.root - 12 + MAJOR[degree], ...voiced], { velocity: .8 });
    }),
    explanation: `${progression.label}: ${progression.hint}. The reference established ${key.name} major. ${c.maxInversion ? 'Upper voices may be inverted; the bass plays each chord’s root.' : 'Each chord was in root position.'}`
  };
}

function graduatedMelody(c, rng) {
  const key = pick(KEYS.slice(0, c.keyCount), rng);
  const pool = [...MAJOR, 12].slice(0, c.poolCount);
  const indices = [integer(0, pool.length - 1, rng)];
  while (indices.length < c.length) {
    const previous = indices.at(-1);
    indices.push(pick(pool.map((_, i) => i).filter(i => Math.abs(i - previous) <= c.maxLeap), rng));
  }
  const keyboard = pool.map((n, i) => ({ midi: key.root + n, label: `${key.labels[i]}${Math.floor((key.root + n) / 12) - 1}`, degree: String(i + 1) }));
  const answer = indices.map(i => keyboard[i].midi);
  const answerLabel = indices.map(i => keyboard[i].label).join(' → ');
  return {
    prompt: 'Rebuild the melody in order.', context: `${key.name} major · ${c.length} notes · exact pitches, same octave`, keyLabel: `${key.name} major`,
    answer, answerLabel, choices: [], inputLength: c.length, keyboard, reference: tonic(key.root),
    events: answer.map((n, i) => event(i * c.gap, c.gap * .72, [n])),
    explanation: `The melody was ${answerLabel}. Scale degrees: ${indices.map(i => i + 1).join(' – ')}. Use the tonic reference to locate the first note, then track each step or leap.`
  };
}

function graduatedScale(c, rng) {
  const pool = SCALES.slice(0, c.count);
  const scale = pick(pool, rng);
  const root = integer(c.rootMin, c.rootMax, rng);
  const ascending = [...scale.notes, 12];
  const shape = c.ascendingOnly ? ascending : [...ascending, ...ascending.slice(0, -1).reverse()];
  return {
    prompt: 'Which scale do you hear?', context: `One scale · ${c.ascendingOnly ? 'ascending only' : 'ascending and descending'} · listen to the step pattern`,
    answer: scale.value, answerLabel: scale.label, choices: choices(pool), events: shape.map((n, i) => event(i * c.gap, c.gap * .8, [root + n])),
    explanation: `${scale.label}: ${scale.hint}. The tonic was ${noteName(root)}. The scale was played ${c.ascendingOnly ? 'up to the octave once' : 'up to the octave and back down'}.`
  };
}

function sample(items, count, rng) {
  const available = [...items];
  const selected = [];
  while (selected.length < count && available.length) selected.push(available.splice(integer(0, available.length - 1, rng), 1)[0]);
  return selected;
}

function graduatedRhythm(c, rng) {
  const all = Array.from({ length: c.steps }, (_, i) => i);
  const even = all.filter(i => i % 2 === 0);
  const odd = all.filter(i => i % 2 !== 0);
  const count = integer(c.minHits, c.maxHits, rng);
  let hits;
  if (c.style === 'onbeat') hits = [0, ...sample([2, 4, 6], count - 1, rng)];
  else if (c.style === 'add-one' || c.style === 'add-two') hits = [...even, ...sample(odd, count - even.length, rng)];
  else if (c.style === 'sixteenth-intro') hits = [0, ...sample(even.filter(i => i !== 0), count - 2, rng), pick(odd, rng)];
  else {
    // Include an offbeat so these levels really introduce syncopation. At the
    // later levels the first subdivision can be a rest, unlike the anchored levels.
    const first = c.anchor ? 0 : null;
    const offbeat = pick(odd, rng);
    const fixed = first === null ? [offbeat] : [first, offbeat];
    hits = [...fixed, ...sample(all.filter(i => !fixed.includes(i)), count - fixed.length, rng)];
  }
  const answer = all.map(i => hits.includes(i));
  const stepDuration = 60 / c.bpm / (c.steps / 4);
  const beatDuration = 60 / c.bpm;
  const labels = rhythmLabels(c.steps);
  const answerLabel = hits.slice().sort((a, b) => a - b).map(i => labels[i]).join(' · ');
  return {
    prompt: 'Rebuild the rhythm on the grid.', context: `4/4 · four count-in beats · one bar of ${c.steps === 8 ? 'eighth' : 'sixteenth'} notes · ${c.bpm} BPM`,
    answer, answerLabel, choices: [], rhythmSteps: c.steps, stepDuration,
    reference: Array.from({ length: 4 }, (_, i) => event(i * beatDuration, beatDuration, [i === 0 ? 88 : 81], { voice: 'click', velocity: .55 })),
    events: answer.flatMap((on, i) => on ? [event(i * stepDuration, .07, [76], { voice: 'click', velocity: .85 })] : []),
    explanation: `The hits fell on ${answerLabel}. Each cell lasts one ${c.steps === 8 ? 'eighth' : 'sixteenth'} note. The four count-in clicks were not part of the answer.`
  };
}

export function generatePitchQuestion(cents, rng = Math.random) {
  const numeric = Number(cents);
  const pitchCents = Number.isFinite(numeric) ? Math.max(2, Math.min(200, numeric)) : 100;
  const direction = rng() < .5 ? -1 : 1;
  const root = integer(55, 72, rng);
  const second = root + direction * pitchCents / 100;
  const answer = direction > 0 ? 'higher' : 'lower';
  const ratio = 2 ** (pitchCents / 1200);
  return {
    mode: 'pitch', level: 'adaptive', pitchCents,
    prompt: 'Is the second tone higher or lower?', context: 'Two tones · compare the second tone with the first',
    answer, answerLabel: `Second tone ${answer} · ${pitchCents} cents`,
    choices: [{ value: 'higher', label: 'Higher' }, { value: 'lower', label: 'Lower' }],
    events: [event(0, .65, [root], { velocity: .8 }), event(.95, .65, [second], { velocity: .8 })],
    explanation: `The second tone was ${answer} by ${pitchCents} cents. One semitone is 100 cents. Its frequency was ${direction > 0 ? 'multiplied' : 'divided'} by ${ratio.toFixed(6)}; timing, voice, and loudness were matched.`
  };
}

const GRADUATED_GENERATORS = { intervals: graduatedInterval, chords: graduatedChord, progressions: graduatedProgression, melody: graduatedMelody, scales: graduatedScale, rhythm: graduatedRhythm };

export function generateQuestion(mode, level = 'beginner', rng = Math.random) {
  if (!MODES.some(item => item.id === mode)) throw new RangeError(`Unknown exercise: ${mode}`);
  if (mode === 'ensemble') return generateEnsembleQuestion(level,rng);
  if (mode === 'temperaments') return generateTemperamentQuestion(level,rng);
  if (LEGACY_LEVELS.some(item => item.id === level) && GENERATORS[mode]) return { mode, level, ...GENERATORS[mode](level, rng) };
  const index = LEVELS.findIndex(item => item.id === level);
  if (index < 0) throw new RangeError(`Unknown difficulty: ${level}`);
  const config = LEVEL_CONFIGS[mode][index];
  const question = mode === 'pitch' ? generatePitchQuestion(config.cents, rng) : GRADUATED_GENERATORS[mode](config, rng);
  return { ...question, mode, level, levelNumber: index + 1, levelConfig: { ...config } };
}

export function isCorrect(question, response) {
  if (question.mode === 'ensemble') return gradeEnsemble(question,response).correct;
  const expected = question.answer;
  if (!Array.isArray(expected)) return typeof response === 'string' && expected === response;
  return Array.isArray(response) && response.length === expected.length && expected.every((value, i) => value === response[i]);
}
