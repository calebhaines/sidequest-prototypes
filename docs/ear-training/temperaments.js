// Fixed twelve-note keyboard tunings. Every preset is normalized to A4 = 440 Hz.
// Score transposition changes the notes played; it never rotates a tuning layout.
export const TEMPERAMENT_MODE = {
  id: 'temperaments', title: 'Temperament lab', short: 'Temperaments', tag: '09 / TUNING',
  description: 'Compare the small pitch differences between twelve-note tunings.',
  prompt: 'Which reference matches the unknown?',
  lesson: 'In ABX, hear references A and B, then decide which tuning produced X. Every sample uses the same notes, timing, voice, and level. All presets share A4 = 440 Hz. Keys move across a fixed keyboard layout; just intonation here is one fixed C-major layout, not an adaptive tuning system.'
};

const OCTAVE = 1200;
const PURE_FIFTH = OCTAVE * Math.log2(3 / 2);
const SYNTONIC_COMMA = OCTAVE * Math.log2(81 / 80);
const PYTHAGOREAN_COMMA = 12 * PURE_FIFTH - 7 * OCTAVE;
const SCHISMA = PYTHAGOREAN_COMMA - SYNTONIC_COMMA;
const centsOf = ratio => OCTAVE * Math.log2(ratio);
const mod = (number, modulus) => ((number % modulus) + modulus) % modulus;
const PITCH_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const KEY_ROOTS = [9, 0, 5, 7, 2, 10, 3, 4, 8, 11, 6, 1];
const SCALA_URL = 'https://www.huygens-fokker.org/docs/scales.zip';
const EXPLANATION_URL = 'https://leware.net/temper/temper.htm';

function fifthChain(fifth) {
  const pitches = Array(12).fill(0);
  // Eb–Bb–F–C–G–D–A–E–B–F#–C#–G#: the unused closing fifth is G#–Eb.
  for (let steps = -3; steps <= 8; steps++) pitches[mod(7 * steps, 12)] = mod(steps * fifth, OCTAVE);
  pitches[0] = 0;
  return pitches;
}

function circleOfFifths(narrowing) {
  const pitches = Array(12).fill(0);
  let root = 0;
  let pitch = 0;
  for (let i = 1; i < 12; i++) {
    pitch += PURE_FIFTH - (narrowing[root] || 0);
    root = (root + 7) % 12;
    pitches[root] = mod(pitch, OCTAVE);
  }
  return pitches;
}

const DUODENE_RATIOS = [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8];

function makeTuning({ id, name, description, cents, scalaFile, construction, type }) {
  const deviations = cents.map((value, pc) => value - pc * 100);
  const aOffset = deviations[9];
  return Object.freeze({
    id, name, label: name, description, type, anchor: 'A4 = 440 Hz',
    cents: Object.freeze([...cents]),
    // C-relative cents above describe the historical layout. Anchored deviations
    // below express its playable difference from 12EDO after matching A4.
    anchoredDeviations: Object.freeze(deviations.map(value => value - aOffset)),
    construction: Object.freeze({ ...construction }),
    sources: Object.freeze([
      ...(scalaFile ? [Object.freeze({ title: `Scala archive: ${scalaFile}`, url: SCALA_URL, file: scalaFile })] : []),
      Object.freeze({ title: 'Pierre Lewis — Understanding Temperaments', url: EXPLANATION_URL })
    ])
  });
}

export const TUNINGS = Object.freeze([
  makeTuning({
    id: '12edo', name: '12-tone equal temperament', type: 'equal',
    description: 'Twelve equal 100-cent steps. Every fifth is 700 cents and every major third is 400 cents.',
    cents: Array.from({ length: 12 }, (_, i) => i * 100), construction: { kind: 'equal', divisions: 12 }
  }),
  makeTuning({
    id: 'pythagorean', name: 'Pythagorean', type: 'pythagorean', scalaFile: 'pyth_12.scl',
    description: 'Eleven pure 3:2 fifths on the Eb–G# chain. The closing G#–Eb fifth is a narrow wolf; regular major thirds are wide.',
    cents: fifthChain(PURE_FIFTH), construction: { kind: 'fifth-chain', fifthCents: PURE_FIFTH, first: 'Eb', last: 'G#', wolf: 'G#–Eb' }
  }),
  makeTuning({
    id: 'meantone-quarter', name: '¼-comma meantone', type: 'meantone', scalaFile: 'meanquar.scl',
    description: 'Each regular fifth is narrowed by one quarter of the syntonic comma. Regular major thirds are pure 5:4; the wolf is G#–Eb.',
    cents: fifthChain(PURE_FIFTH - SYNTONIC_COMMA / 4),
    construction: { kind: 'fifth-chain', fifthCents: PURE_FIFTH - SYNTONIC_COMMA / 4, commaFraction: '1/4 syntonic', first: 'Eb', last: 'G#', wolf: 'G#–Eb' }
  }),
  makeTuning({
    id: 'meantone-sixth', name: '⅙-comma meantone', type: 'meantone', scalaFile: 'meansixth.scl',
    description: 'Regular fifths are narrowed by one sixth of the syntonic comma. Thirds are less pure than quarter-comma meantone, with a milder wolf.',
    cents: fifthChain(PURE_FIFTH - SYNTONIC_COMMA / 6),
    construction: { kind: 'fifth-chain', fifthCents: PURE_FIFTH - SYNTONIC_COMMA / 6, commaFraction: '1/6 syntonic', first: 'Eb', last: 'G#', wolf: 'G#–Eb' }
  }),
  makeTuning({
    id: 'werckmeister-iii', name: 'Werckmeister III', type: 'well', scalaFile: 'werck3.scl',
    description: 'C–G, G–D, D–A, and B–F# are each narrowed by one quarter of the Pythagorean comma; the other fifths are pure.',
    cents: circleOfFifths({ 0: PYTHAGOREAN_COMMA / 4, 7: PYTHAGOREAN_COMMA / 4, 2: PYTHAGOREAN_COMMA / 4, 11: PYTHAGOREAN_COMMA / 4 }),
    construction: { kind: 'closed-fifths', narrowFifths: 'C–G, G–D, D–A, B–F#', narrowingCents: PYTHAGOREAN_COMMA / 4 }
  }),
  makeTuning({
    id: 'vallotti', name: 'Vallotti', type: 'well', scalaFile: 'vallotti.scl',
    description: 'The six fifths F–C–G–D–A–E–B are each narrowed by one sixth of the Pythagorean comma; the other six fifths are pure.',
    cents: circleOfFifths({ 5: PYTHAGOREAN_COMMA / 6, 0: PYTHAGOREAN_COMMA / 6, 7: PYTHAGOREAN_COMMA / 6, 2: PYTHAGOREAN_COMMA / 6, 9: PYTHAGOREAN_COMMA / 6, 4: PYTHAGOREAN_COMMA / 6 }),
    construction: { kind: 'closed-fifths', narrowFifths: 'F–C, C–G, G–D, D–A, A–E, E–B', narrowingCents: PYTHAGOREAN_COMMA / 6 }
  }),
  makeTuning({
    id: 'kirnberger-iii', name: 'Kirnberger III (Kellner)', type: 'well', scalaFile: 'kirnberger3k.scl',
    description: 'Kellner’s 1976 interpretation: C–G–D–A–E fifths are quarter-syntonic-comma narrow; F#–C# absorbs the schisma. The remaining fifths are pure.',
    cents: circleOfFifths({ 0: SYNTONIC_COMMA / 4, 7: SYNTONIC_COMMA / 4, 2: SYNTONIC_COMMA / 4, 9: SYNTONIC_COMMA / 4, 6: SCHISMA }),
    construction: { kind: 'closed-fifths', interpretation: 'Herbert Anton Kellner (1976)', narrowFifths: 'C–G, G–D, D–A, A–E', narrowingCents: SYNTONIC_COMMA / 4, schismaFifth: 'F#–C#', schismaCents: SCHISMA }
  }),
  makeTuning({
    id: 'just-duodene', name: '5-limit just (Ellis Duodene)', type: 'fixed-just', scalaFile: 'duodene.scl',
    description: 'One fixed C-major twelve-note layout using 5-limit ratios. C, F, and G major triads have pure thirds; remote keys need not be pure. This is not adaptive just intonation.',
    cents: DUODENE_RATIOS.map(centsOf), construction: { kind: 'fixed-ratios', tonic: 'C', ratios: Object.freeze([...DUODENE_RATIOS]) }
  })
]);

export const TEMPERAMENT_LEVELS = [
  { tuningIds: ['12edo', 'meantone-quarter'], kind: 'third', keyCount: 1, hold: 2.2, gap: .35, description: 'Slow sustained major third · equal vs quarter-comma meantone · one reference key.' },
  { tuningIds: ['12edo', 'pythagorean', 'meantone-quarter'], kind: 'triad', keyCount: 1, hold: 2.2, gap: .35, description: 'Sustained major triad · adds Pythagorean tuning · compare third and fifth together.' },
  { tuningIds: ['12edo', 'pythagorean', 'meantone-quarter', 'meantone-sixth'], kind: 'third-fifth', keyCount: 3, hold: 1.25, gap: .3, description: 'Major third then perfect fifth · three keys · adds sixth-comma meantone.' },
  { tuningIds: ['12edo', 'pythagorean', 'meantone-quarter', 'meantone-sixth', 'just-duodene'], kind: 'cadence', keyCount: 4, hold: 1.05, gap: .15, description: 'Four-chord cadence · four keys · adds fixed C-major 5-limit just tuning.' },
  { tuningIds: ['12edo', 'pythagorean', 'meantone-quarter', 'meantone-sixth', 'just-duodene', 'werckmeister-iii'], kind: 'third-sequence', keyCount: 6, hold: 1.1, gap: .15, description: 'Several major thirds across a key · six keys · adds Werckmeister III.' },
  { tuningIds: ['12edo', 'pythagorean', 'meantone-quarter', 'meantone-sixth', 'just-duodene', 'werckmeister-iii', 'vallotti'], kind: 'cadence', keyCount: 8, hold: .85, gap: .12, description: 'Quicker four-chord cadence · eight keys · adds Vallotti.' },
  { tuningIds: TUNINGS.map(tuning => tuning.id), kind: 'chromatic-chords', keyCount: 12, hold: .95, gap: .1, description: 'Four chromatically separated major chords · all keys · all eight tuning presets.' },
  { tuningIds: TUNINGS.map(tuning => tuning.id), kind: 'phrase', keyCount: 12, hold: .75, gap: .1, description: 'Moving harmony with an upper melody and inversions · all keys · all eight presets.' }
].map((config, i) => Object.freeze({ id: `level-${i + 1}`, number: i + 1, ...config, tuningIds: Object.freeze([...config.tuningIds]) }));

export function getTuning(id) {
  const tuning = TUNINGS.find(item => item.id === id);
  if (!tuning) throw new RangeError(`Unknown tuning: ${id}`);
  return tuning;
}

export function tunedMidi(midi, tuningId) {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) throw new RangeError('Tuning requires integer MIDI score notes from 0 to 127.');
  const tuning = getTuning(tuningId);
  return midi + tuning.anchoredDeviations[midi % 12] / 100;
}

/** Clone score events, changing pitch only; no event or input note is mutated. */
export function applyTuning(score, tuningId) {
  getTuning(tuningId);
  if (!Array.isArray(score)) throw new TypeError('Expected an array of score events.');
  return score.map(event => {
    if (!Array.isArray(event.notes)) throw new TypeError('Score events need a notes array.');
    return { ...event, notes: event.notes.map(midi => tunedMidi(midi, tuningId)) };
  });
}

const integer = (minimum, maximum, rng) => minimum + Math.max(0, Math.min(maximum - minimum, Math.floor(rng() * (maximum - minimum + 1))));
const pick = (items, rng) => items[integer(0, items.length - 1, rng)];
const event = (at, duration, notes, velocity = .8) => ({ at, duration, notes, velocity });
const triad = root => [root, root + 4, root + 7];

function scoreInKey(config, keyRoot) {
  const root = 48 + keyRoot;
  const interval = config.hold + config.gap;
  if (config.kind === 'third') return [event(0, config.hold, [root, root + 4])];
  if (config.kind === 'triad') return [event(0, config.hold, triad(root))];
  if (config.kind === 'third-fifth') return [event(0, config.hold, [root, root + 4]), event(interval, config.hold, [root, root + 7])];
  if (config.kind === 'third-sequence') return [0, 5, 7, 0].map((offset, i) => event(i * interval, config.hold, [root + offset, root + offset + 4]));
  if (config.kind === 'chromatic-chords') return [0, 1, 6, 7].map((offset, i) => event(i * interval, config.hold, triad(root + offset)));
  const roots = [0, 5, 7, 0];
  if (config.kind === 'cadence') return roots.map((offset, i) => event(i * interval, config.hold, triad(root + offset)));
  if (config.kind === 'phrase') {
    const events = roots.map((offset, i) => {
      const upper = triad(root + offset);
      if (i % 2) upper.push(upper.shift() + 12);
      return event(i * interval, config.hold, [root + offset - 12, ...upper], .65);
    });
    const melody = [12, 16, 17, 21, 19, 23, 24, 19];
    melody.forEach((offset, i) => events.push(event(Math.floor(i / 2) * interval + (i % 2) * interval / 2, interval * .4, [root + offset], .85)));
    return events.sort((a, b) => a.at - b.at);
  }
  throw new RangeError(`Unknown tuning stimulus: ${config.kind}`);
}

/** Plain integer-MIDI events suitable for applyTuning() or the reference desk. */
export function generateScore(configOrLevel, rng = Math.random) {
  const config = typeof configOrLevel === 'string' ? TEMPERAMENT_LEVELS.find(item => item.id === configOrLevel) : configOrLevel;
  if (!config || !Number.isInteger(config.keyCount) || config.keyCount < 1 || config.keyCount > 12) throw new RangeError('Unknown temperament score configuration.');
  return scoreInKey(config, pick(KEY_ROOTS.slice(0, config.keyCount), rng));
}

/** Maximum pitch difference in cents between two applications of one score. */
export function tuningDifference(score, tuningA, tuningB) {
  const a = applyTuning(score, tuningA);
  const b = applyTuning(score, tuningB);
  return Math.max(0, ...a.flatMap((event, i) => event.notes.map((midi, j) => Math.abs(midi - b[i].notes[j]) * 100)));
}

function distinguishes(score, tuningIds) {
  for (let i = 0; i < tuningIds.length; i++) {
    for (let j = i + 1; j < tuningIds.length; j++) if (tuningDifference(score, tuningIds[i], tuningIds[j]) <= 1e-7) return false;
  }
  return true;
}

function diagnosticScore(config, tuningIds, rng) {
  let score = generateScore(config, rng);
  if (distinguishes(score, tuningIds)) return { score, diagnostic: false };
  // Some tunings share entire pure triads. Changing the *score key* preserves
  // their fixed historical layouts while avoiding an acoustically identical ABX.
  for (const key of KEY_ROOTS) {
    const alternative = scoreInKey(config, key);
    if (distinguishes(alternative, tuningIds)) return { score: alternative, diagnostic: true };
  }
  // Named identification can require more pitch classes than a single interval
  // provides. A shared chromatic probe distinguishes every offered preset.
  const end = Math.max(...score.map(e => e.at + e.duration)) + .35;
  score = [...score, ...Array.from({ length: 12 }, (_, i) => event(end + i * .22, .18, [60 + i]))];
  if (!distinguishes(score, tuningIds)) throw new Error('The chosen tunings are identical for the diagnostic score.');
  return { score, diagnostic: true };
}

const STIMULUS_NAMES = {
  third: 'sustained major third', triad: 'sustained major triad',
  'third-fifth': 'major third, then perfect fifth', cadence: 'four-chord cadence',
  'third-sequence': 'a sequence of major thirds', 'chromatic-chords': 'chromatically separated major chords', phrase: 'harmony with an upper melody'
};

export function generateTemperamentQuestion(level, rng = Math.random, { task = 'abx', tuningA, tuningB } = {}) {
  const config = TEMPERAMENT_LEVELS.find(item => item.id === level);
  if (!config) throw new RangeError(`Unknown temperament difficulty: ${level}`);
  if (!['abx', 'identify'].includes(task)) throw new RangeError(`Unknown temperament task: ${task}`);
  const pool = [...config.tuningIds];
  let a = null;
  let b = null;
  if (task === 'abx') {
    if (tuningA !== undefined) getTuning(tuningA);
    if (tuningB !== undefined) getTuning(tuningB);
    a = tuningA ?? pick(pool.filter(id => id !== tuningB), rng);
    b = tuningB ?? pick(pool.filter(id => id !== a), rng);
    if (a === b) throw new RangeError('ABX references must use two different tunings.');
  }
  const { score, diagnostic } = diagnosticScore(config, task === 'abx' ? [a, b] : pool, rng);
  // X selection follows score construction, so diagnostic choices cannot depend
  // on the correct response. References and X always retain identical timing.
  const answer = task === 'abx' ? pick(['A', 'B'], rng) : pick(pool, rng);
  const x = task === 'abx' ? answer === 'A' ? a : b : answer;
  const keyRoot = score[0].notes[0] % 12;
  const keyLabel = `${PITCH_NAMES[keyRoot]} major`;
  const events = applyTuning(score, x);
  const nameX = getTuning(x).name;
  return {
    mode: 'temperaments', level, task,
    prompt: task === 'abx' ? 'Which reference matches the unknown?' : 'Which tuning do you hear?',
    context: `${keyLabel} · ${STIMULUS_NAMES[config.kind]}${diagnostic ? ' · diagnostic probe' : ''} · A4 = 440 Hz`, keyLabel,
    choices: task === 'abx' ? [{ value: 'A', label: 'Matches A' }, { value: 'B', label: 'Matches B' }]
      : pool.map(id => ({ value: id, label: getTuning(id).name })),
    answer, answerLabel: task === 'abx' ? `Matches ${answer} · ${nameX}` : nameX,
    explanation: task === 'abx'
      ? `X used ${nameX}, exactly matching reference ${answer}. A used ${getTuning(a).name}; B used ${getTuning(b).name}. Every sample used the same score, articulation, voice, level, and A4 = 440 Hz anchor. Listen to beating and the sizes of thirds and fifths.`
      : `${nameX}. ${getTuning(x).description} The keyboard layout stayed fixed while the score used ${keyLabel}; the same tuning is not equally pure in every key.`,
    events, reference: [],
    referenceA: task === 'abx' ? applyTuning(score, a) : [],
    referenceB: task === 'abx' ? applyTuning(score, b) : [],
    score: score.map(event => ({ ...event, notes: [...event.notes] })),
    tuningA: a, tuningB: b, tuningX: x,
    diagnostic, totalDuration: Math.max(...events.map(event => event.at + event.duration)),
    levelConfig: { ...config, tuningIds: [...config.tuningIds] }
  };
}
