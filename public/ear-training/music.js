// Overtone: procedural listening exercises. MIDI 60 is middle C (C4).
export const LEVELS = [
  { id: 'beginner', title: 'Foundation' },
  { id: 'intermediate', title: 'Developing' },
  { id: 'advanced', title: 'Deep listening' }
];

export const MODES = [
  { id: 'intervals', title: 'Intervals', short: 'Intervals', tag: '01 / DISTANCE', description: 'Hear the space between two notes.', prompt: 'Which interval do you hear?', lesson: 'An interval measures pitch distance. A major third spans four semitones; a perfect fifth spans seven. Listen to the relationship, rather than the starting note.' },
  { id: 'chords', title: 'Chord quality', short: 'Chords', tag: '02 / COLOR', description: 'Find the character inside a chord.', prompt: 'What kind of chord is this?', lesson: 'Chord quality comes from the intervals above its root. Major has a major third; minor has a minor third. Inversions reorder the notes without changing the quality.' },
  { id: 'progressions', title: 'Progressions', short: 'Progressions', tag: '03 / MOVEMENT', description: 'Follow harmony from chord to chord.', prompt: 'Which progression do you hear?', lesson: 'Roman numerals describe chords relative to the key. Uppercase means major, lowercase means minor, and ° means diminished. First hear the tonic reference, then follow the bass and harmonic movement.' },
  { id: 'melody', title: 'Melody memory', short: 'Melody', tag: '04 / RECALL', description: 'Listen, remember, and rebuild a phrase.', prompt: 'Rebuild the melody in order.', lesson: 'Use the tonic reference to orient yourself. Notice the opening pitch, then remember steps, leaps, and repeated notes. Enter the exact pitches in their original octave.' },
  { id: 'scales', title: 'Scale colors', short: 'Scales', tag: '05 / TONALITY', description: 'Recognize the sound of a scale.', prompt: 'Which scale do you hear?', lesson: 'Scales have characteristic step patterns. Major has a bright major third; natural minor lowers the third, sixth, and seventh. Modes change which degrees are raised or lowered relative to major.' },
  { id: 'rhythm', title: 'Rhythm memory', short: 'Rhythm', tag: '06 / TIME', description: 'Reconstruct a bar, one pulse at a time.', prompt: 'Rebuild the rhythm on the grid.', lesson: 'Hear four count-in beats, then one bar in 4/4. Each grid cell is an eighth note (or a sixteenth note at advanced level). Turn on the cells where a sound occurs. This tests the pattern, not tap timing.' }
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
  return {
    prompt: 'Which interval do you hear?', context: `Two notes · ${direction} · identify their distance`,
    answer: interval.value, answerLabel: interval.label, choices: choices(pool),
    events: direction === 'simultaneous' ? [event(0, 1.1, [root, second])] : [event(0, .55, [root]), event(.72, .75, [second])],
    explanation: `${interval.label}: ${interval.semitones} semitone${interval.semitones === 1 ? '' : 's'}. The notes were ${noteName(root)} and ${noteName(second)}${direction === 'simultaneous' ? ', played together' : `, played ${direction}`}.`
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

export function generateQuestion(mode, level = 'beginner', rng = Math.random) {
  if (!GENERATORS[mode]) throw new RangeError(`Unknown exercise: ${mode}`);
  if (!LEVELS.some(item => item.id === level)) throw new RangeError(`Unknown difficulty: ${level}`);
  return { mode, level, ...GENERATORS[mode](level, rng) };
}

export function isCorrect(question, response) {
  const expected = question.answer;
  if (!Array.isArray(expected)) return typeof response === 'string' && expected === response;
  return Array.isArray(response) && response.length === expected.length && expected.every((value, i) => value === response[i]);
}
