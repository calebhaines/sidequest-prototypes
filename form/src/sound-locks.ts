/** Portable per-strike controls. An absent key inherits the saved burner. */
export type SoundLocks = Partial<Record<"cutoff" | "resonance" | "decay" | "pan" | "level" | "tone" | "drive", number>>;
export const SOUND_LOCK_RANGES = {
  cutoff: [20, 20000], resonance: [.1, 20], decay: [.005, 10],
  pan: [-1, 1], level: [0, 1], tone: [0, 1], drive: [0, 1],
} as const;
export function validSoundLocks(input: unknown): input is SoundLocks {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  return Object.entries(input).every(([key, value]) => {
    const range = SOUND_LOCK_RANGES[key as keyof SoundLocks];
    return !!range && typeof value === "number" && Number.isFinite(value) && value >= range[0] && value <= range[1];
  });
}
export function normalizeSoundLocks(input: unknown, strict = false): SoundLocks {
  if (input === undefined) return {};
  if (strict && !validSoundLocks(input)) throw new Error("Invalid HOTPLATE step sound overrides.");
  const source = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const result: SoundLocks = {};
  for (const key of Object.keys(SOUND_LOCK_RANGES) as (keyof SoundLocks)[]) {
    const value = source[key], range = SOUND_LOCK_RANGES[key];
    if (typeof value === "number" && Number.isFinite(value)) result[key] = Math.max(range[0], Math.min(range[1], value));
  }
  return result;
}
