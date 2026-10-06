/** The native HOTPLATE grid, shared by the live scheduler and offline renderer. */
export type StepDetail = {
  velocity: number;
  probability: number;
  ratchet: number;
  /** Signed fraction of one nominal sixteenth note. */
  timing: number;
  /** Semitones relative to the saved burner sound. */
  pitch: number;
};

export type StepEvent = {
  voice: number;
  /** Seconds relative to the nominal, unswung start of this step. */
  offset: number;
  velocity: number;
  pitch: number;
  ratchetIndex: number;
};

export const STEP_DEFAULTS: Readonly<StepDetail> = Object.freeze({
  velocity: 1,
  probability: 1,
  ratchet: 1,
  timing: 0,
  pitch: 0,
});

export const SEQUENCE_SEED = 0x48504c54;

const finite = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const bound = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Missing details retain the original downbeat / offbeat velocity accents. */
export function normalizeStepDetail(input: unknown, stepIndex = 0): StepDetail {
  const value = input && typeof input === "object" && !Array.isArray(input)
    ? input as Partial<StepDetail>
    : {};
  return {
    velocity: bound(finite(value.velocity, stepIndex % 4 === 0 ? 1 : 0.86), 0, 1),
    probability: bound(finite(value.probability, 1), 0, 1),
    ratchet: Math.round(bound(finite(value.ratchet, 1), 1, 4)),
    timing: bound(finite(value.timing, 0), -0.45, 0.45),
    pitch: Math.round(bound(finite(value.pitch, 0), -24, 24)),
  };
}

/** Always returns fresh, bounded objects aligned exactly with the boolean grid. */
export function normalizeStepDetails(
  steps: readonly (readonly boolean[])[],
  input: unknown,
): StepDetail[][] {
  const rows = Array.isArray(input) ? input : [];
  return steps.map((row, voice) => {
    const values = Array.isArray(rows[voice]) ? rows[voice] : [];
    return row.map((_, step) => normalizeStepDetail(values[step], step));
  });
}

export function createStepDetails(steps: readonly (readonly boolean[])[]): StepDetail[][] {
  return normalizeStepDetails(steps, undefined);
}

/** Stateless integer hash: a loop varies, but live playback and export agree. */
function chance(seed: number, absoluteStep: number, voice: number): number {
  let hash = (seed >>> 0) ^ Math.imul((absoluteStep + 1) >>> 0, 0x9e3779b1)
    ^ Math.imul((voice + 1) >>> 0, 0x85ebca6b);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x100000000;
}

/**
 * Schedule against constant nominal sixteenth-note starts. This helper adds
 * swing itself, so callers must not also alternate the nominal step duration.
 * Call ahead of the earliest signed timing offset; neither audio nor UI timers
 * should clamp a normal negative offset to the current clock.
 *
 * Ratchets end before the next swung step. A late hit shortens their spacing;
 * an early hit extends it. At extreme odd-step swing, late timing is bounded
 * to the available gap. Only the first loop's opening hit is clamped to zero.
 */
export function eventsForStep(
  tracks: readonly (readonly boolean[])[],
  details: readonly (readonly StepDetail[])[] | undefined,
  step: number,
  cycle: number,
  bpm: number,
  swing: number,
  seed = SEQUENCE_SEED,
  fill = false,
): StepEvent[] {
  const length = Math.max(0, ...tracks.map(row => row.length));
  if (!length) return [];
  const position = ((Math.floor(finite(step, 0)) % length) + length) % length;
  const loop = Math.max(0, Math.floor(finite(cycle, 0)));
  const stepTime = 15 / bound(finite(bpm, 120), 30, 300);
  const amount = bound(finite(swing, 0), 0, 75) / 100;
  const delay = position % 2 ? amount * stepTime : 0;
  const gap = (position % 2 ? 1 - amount : 1 + amount) * stepTime;
  const next = delay + gap;
  const events: StepEvent[] = [];
  const sequenceSeed = finite(seed, SEQUENCE_SEED) >>> 0;
  for (let voice = 0; voice < tracks.length; voice++) {
    const row = tracks[voice];
    if (!row.length) continue;
    const rowStep = position % row.length;
    if (row[rowStep] !== true) continue;
    const detail = normalizeStepDetail(details?.[voice]?.[rowStep], rowStep);
    if (detail.velocity === 0 || detail.probability === 0) continue;
    if (detail.probability < 1 &&
      chance(sequenceSeed, loop * length + position, voice) >= detail.probability) continue;
    const repeats = fill && position >= length - 4
      ? Math.max(2, detail.ratchet)
      : detail.ratchet;
    // Keep a strictly positive gap even at the most extreme legal timing.
    let onset = Math.min(delay + detail.timing * stepTime, next - stepTime * 0.001);
    if (loop === 0 && position === 0) onset = Math.max(0, onset);
    const spacing = (next - onset) / repeats;
    for (let repeat = 0; repeat < repeats; repeat++) {
      events.push({
        voice,
        offset: onset + spacing * repeat,
        velocity: detail.velocity,
        pitch: detail.pitch,
        ratchetIndex: repeat,
      });
    }
  }
  return events;
}
