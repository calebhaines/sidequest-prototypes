// Four accompaniment chords and a simultaneous melody, reconstructed separately.
// This module is independent of music.js so that the shared mode registry can import it.
export const ENSEMBLE_MODE = {
  id: 'ensemble', title: 'Harmony + melody', short: 'Reconstruct', tag: '08 / TWO PARTS',
  description: 'Separate a melody from its harmony, then rebuild both.',
  prompt: 'Rebuild the four chords and the melody.',
  lesson: 'Hear a tonic reference, then four chords with a melody above them. Reconstruct each chord’s root and quality and every melody pitch. All twelve chromatic notes C5–B5 are available; empty slots keep their original place in time.'
};

const QUALITIES = {
  major: { label: 'Major', notes: [0, 4, 7] },
  minor: { label: 'Minor', notes: [0, 3, 7] },
  diminished: { label: 'Diminished', notes: [0, 3, 6] },
  sus2: { label: 'Suspended 2nd', notes: [0, 2, 7] },
  sus4: { label: 'Suspended 4th', notes: [0, 5, 7] },
  dominant7: { label: 'Dominant 7th', notes: [0, 4, 7, 10] },
  minor7: { label: 'Minor 7th', notes: [0, 3, 7, 10] },
  major7: { label: 'Major 7th', notes: [0, 4, 7, 11] },
  'half-diminished': { label: 'Half-diminished 7th', notes: [0, 3, 6, 10] }
};
const QUALITY_POOLS = [
  ['major', 'minor'],
  ['major', 'minor'],
  ['major', 'minor', 'diminished'],
  ['major', 'minor', 'diminished', 'sus4'],
  ['major', 'minor', 'diminished', 'sus2', 'sus4', 'dominant7'],
  ['major', 'minor', 'diminished', 'sus2', 'sus4', 'dominant7', 'minor7'],
  ['major', 'minor', 'diminished', 'sus2', 'sus4', 'dominant7', 'minor7', 'major7', 'half-diminished'],
  ['major', 'minor', 'diminished', 'sus2', 'sus4', 'dominant7', 'minor7', 'major7', 'half-diminished']
];

export const ENSEMBLE_LEVELS = [
  { notesPerChord: 1, chordDuration: 1.3, keyCount: 1, progressionCount: 2, maxInversion: 0, chromaticChance: 0, description: '4 melody notes · C major · major/minor root-position chords · chord-tone melody.' },
  { notesPerChord: 1, chordDuration: 1.15, keyCount: 2, progressionCount: 4, maxInversion: 0, chromaticChance: 0, description: '4 melody notes · C or G major · four harmonic patterns · quicker root-position chords.' },
  { notesPerChord: 2, chordDuration: 1.6, keyCount: 3, progressionCount: 5, maxInversion: 0, chromaticChance: 0, description: '8 melody notes · three keys · adds diminished chords · chord-tone melody.' },
  { notesPerChord: 2, chordDuration: 1.45, keyCount: 4, progressionCount: 6, maxInversion: 0, chromaticChance: 0, description: '8 melody notes · four keys · adds suspended 4th chords and their resolution.' },
  { notesPerChord: 2, chordDuration: 1.3, keyCount: 6, progressionCount: 7, maxInversion: 0, chromaticChance: .25, description: '8 melody notes · six keys · adds dominant 7ths and occasional chromatic approach notes.' },
  { notesPerChord: 3, chordDuration: 1.65, keyCount: 8, progressionCount: 8, maxInversion: 1, chromaticChance: .35, description: '12 melody notes · eight keys · adds minor 7ths, upper-voice first inversions, and chromatic approaches.' },
  { notesPerChord: 3, chordDuration: 1.45, keyCount: 10, progressionCount: 10, maxInversion: 2, chromaticChance: .55, description: '12 melody notes · ten keys · adds major 7ths and half-diminished chords · more inversions and chromatic notes.' },
  { notesPerChord: 4, chordDuration: 1.6, keyCount: 12, progressionCount: 12, maxInversion: 3, chromaticChance: .75, description: '16 melody notes · all twelve major keys · full upper-voice inversions and frequent chromatic approaches.' }
].map((config, i) => ({ id: `level-${i + 1}`, number: i + 1, ...config, qualities: [...QUALITY_POOLS[i]] }));

const PITCH_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const ROOT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const KEY_ROOTS = [0, 7, 2, 5, 9, 10, 3, 8, 4, 11, 6, 1];
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const PROGRESSIONS = [
  [[0, 'major'], [3, 'major'], [4, 'major'], [0, 'major']],
  [[0, 'major'], [5, 'minor'], [3, 'major'], [4, 'major']],
  [[0, 'major'], [4, 'major'], [5, 'minor'], [3, 'major']],
  [[5, 'minor'], [3, 'major'], [0, 'major'], [4, 'major']],
  [[0, 'major'], [1, 'minor'], [6, 'diminished'], [0, 'major']],
  [[1, 'minor'], [4, 'sus4'], [4, 'major'], [0, 'major']],
  [[0, 'major'], [1, 'minor'], [4, 'dominant7'], [0, 'major']],
  [[5, 'minor'], [1, 'minor7'], [4, 'dominant7'], [0, 'major']],
  [[0, 'major7'], [3, 'major7'], [4, 'dominant7'], [0, 'major7']],
  [[1, 'minor7'], [6, 'half-diminished'], [4, 'dominant7'], [0, 'major7']],
  [[0, 'sus2'], [3, 'major'], [4, 'sus4'], [0, 'major']],
  [[2, 'minor7'], [5, 'minor7'], [1, 'minor7'], [4, 'dominant7']]
];
const integer = (minimum, maximum, rng) => minimum + Math.max(0, Math.min(maximum - minimum, Math.floor(rng() * (maximum - minimum + 1))));
const pick = (items, rng) => items[integer(0, items.length - 1, rng)];
const pitchClass = midi => ((midi % 12) + 12) % 12;
const melodyName = midi => `${PITCH_NAMES[pitchClass(midi)]}${Math.floor(midi / 12) - 1}`;

function chordVoicing(root, quality, maximumInversion, rng) {
  const shape = QUALITIES[quality].notes;
  const upper = shape.map(n => 48 + root + n);
  // A root bass remains present. Only the upper voices invert, and suspended
  // chords stay root-position above it to avoid confusing sus2/sus4 equivalence.
  const inversion = quality.startsWith('sus') ? 0 : integer(0, Math.min(maximumInversion, upper.length - 1), rng);
  for (let i = 0; i < inversion; i++) upper.push(upper.shift() + 12);
  while (Math.max(...upper) > 70) upper.forEach((n, i) => { upper[i] = n - 12; });
  return [36 + root, ...upper];
}

function chooseMelodyNote(pool, previous, rng) {
  if (previous === null) return pick(pool, rng);
  const near = pool.filter(midi => Math.abs(midi - previous) <= 5);
  if (near.length) return pick(near, rng);
  const distance = Math.min(...pool.map(midi => Math.abs(midi - previous)));
  return pick(pool.filter(midi => Math.abs(midi - previous) === distance), rng);
}

function sortedEvents(events) {
  return events.sort((a, b) => a.at - b.at || (a.part === 'chords' ? -1 : 1));
}

export function generateEnsembleQuestion(level, rng = Math.random) {
  const config = ENSEMBLE_LEVELS.find(item => item.id === level);
  if (!config) throw new RangeError(`Unknown ensemble difficulty: ${level}`);
  const keyRoot = pick(KEY_ROOTS.slice(0, config.keyCount), rng);
  const progression = pick(PROGRESSIONS.slice(0, config.progressionCount), rng);
  const chordOptions = Array.from({ length: 12 }, (_, root) => config.qualities.map(quality => ({
    value: `${root}:${quality}`, label: `${ROOT_NAMES[root]} ${QUALITIES[quality].label.toLowerCase()}`,
    root, quality, notes: chordVoicing(root, quality, config.maxInversion, rng)
  }))).flat();
  const chordValues = progression.map(([degree, quality]) => `${(keyRoot + MAJOR_SCALE[degree]) % 12}:${quality}`);
  const chosenChords = chordValues.map(value => chordOptions.find(option => option.value === value));
  const inputLength = 4 * config.notesPerChord;
  const stepDuration = config.chordDuration / config.notesPerChord;
  const melody = [];
  chosenChords.forEach(chord => {
    const tones = [...new Set(chord.notes.map(n => 72 + pitchClass(n)))].sort((a, b) => a - b);
    for (let j = 0; j < config.notesPerChord; j++) melody.push(chooseMelodyNote(tones, melody.at(-1) ?? null, rng));
  });
  // Non-chord slots can approach the following chord tone by a semitone.
  // Their pitch is outside the key's major scale, making the chromatic step real.
  const diatonic = new Set(MAJOR_SCALE.map(n => (keyRoot + n) % 12));
  for (let i = 1; i < melody.length - 1; i++) {
    if (i % config.notesPerChord === 0 || !config.chromaticChance || rng() >= config.chromaticChance) continue;
    const target = melody[i + 1];
    const approaches = [target - 1, target + 1].filter(midi => midi >= 72 && midi <= 83 && !diatonic.has(pitchClass(midi)));
    if (approaches.length) {
      melody[i] = pick(approaches, rng);
      i++; // Keep the following chord-tone resolution intact.
    }
  }
  const chordEvents = chosenChords.map((chord, i) => ({
    at: i * config.chordDuration, duration: config.chordDuration, notes: [...chord.notes],
    velocity: .48, voice: 'warm', part: 'chords'
  }));
  const melodyTimes = melody.map((_, i) => Math.floor(i / config.notesPerChord) * config.chordDuration
    + (i % config.notesPerChord) * stepDuration);
  const melodyDurations = melody.map((_, i) => i === melody.length - 1 ? stepDuration : stepDuration * .78);
  const melodyEvents = melody.map((midi, i) => ({
    at: melodyTimes[i], duration: melodyDurations[i], notes: [midi], velocity: .9, part: 'melody'
  }));
  const keyLabel = `${ROOT_NAMES[keyRoot]} major`;
  const referenceTonic = chordOptions.find(chord => chord.root === keyRoot && chord.quality === 'major');
  const chordLabels = chosenChords.map(chord => chord.label);
  return {
    mode: 'ensemble', level, prompt: ENSEMBLE_MODE.prompt,
    context: `${keyLabel} · four chords with a ${inputLength}-note melody · C5–B5 keyboard`, keyLabel,
    answer: { chords: chordValues, melody },
    answerLabel: `${chordLabels.join(' → ')} · ${inputLength} melody notes`,
    explanation: `Harmony: ${chordLabels.join(' → ')}. Melody: ${melody.map(melodyName).join(' → ')}. The tonic reference established ${keyLabel}. Chord roots remain in the bass; upper chord voices may invert at higher levels.`,
    choices: [], events: sortedEvents([...chordEvents, ...melodyEvents].map(e => ({ ...e, notes: [...e.notes] }))),
    reference: [{ at: 0, duration: .65, notes: [...referenceTonic.notes], velocity: .48, voice: 'warm' }],
    chordOptions,
    keyboard: Array.from({ length: 12 }, (_, i) => ({ midi: 72 + i, label: melodyName(72 + i) })),
    inputLength, melodyTimes, melodyDurations,
    notesPerChord: config.notesPerChord, chordDuration: config.chordDuration,
    totalDuration: 4 * config.chordDuration, chordEvents, melodyEvents,
    levelConfig: { ...config, qualities: [...config.qualities] }
  };
}

export function gradeEnsemble(question, response) {
  if (question?.mode !== 'ensemble' || !question.answer) throw new RangeError('Expected a harmony + melody question.');
  const chords = Array.isArray(response?.chords) ? response.chords : [];
  const melody = Array.isArray(response?.melody) ? response.melody : [];
  const chordsCorrect = question.answer.chords.filter((value, i) => value === chords[i]).length;
  const melodyCorrect = question.answer.melody.filter((value, i) => value === melody[i]).length;
  return {
    correct: chords.length === 4 && melody.length === question.inputLength && chordsCorrect === 4 && melodyCorrect === question.inputLength,
    chordsCorrect, melodyCorrect, chordTotal: 4, melodyTotal: question.inputLength
  };
}

/** Omit blank inputs while preserving their original positions on the time grid. */
export function ensembleResponseEvents(question, response, { part = 'both' } = {}) {
  if (question?.mode !== 'ensemble' || !['both', 'chords', 'melody'].includes(part)) throw new RangeError('Invalid ensemble preview.');
  const events = [];
  if (part !== 'melody') {
    for (let i = 0; i < 4; i++) {
      const selected = question.chordOptions.find(option => option.value === response?.chords?.[i]);
      if (selected) events.push({ ...question.chordEvents[i], notes: [...selected.notes] });
    }
  }
  if (part !== 'chords') {
    for (let i = 0; i < question.inputLength; i++) {
      const midi = response?.melody?.[i];
      if (Number.isInteger(midi) && midi >= 72 && midi <= 83) events.push({ ...question.melodyEvents[i], notes: [midi] });
    }
  }
  return sortedEvents(events);
}
