import { createStepDetails, eventsForStep, normalizeStepDetails, type StepDetail } from "./sequencing";
import { validSoundLocks, type SoundLocks } from "./sound-locks";

export type PatternBank = { length: 16 | 32; steps: boolean[][]; stepDetails: StepDetail[][] };
export type ChainEntry = { bank: number; repeats: number };
export type PatternChain = { enabled: boolean; loop: boolean; entries: ChainEntry[] };
export type PatternState = {
  steps: boolean[][]; stepDetails?: StepDetail[][]; selectedBank?: number;
  patternBanks?: PatternBank[]; chain?: PatternChain;
};
export const EMPTY_CHAIN: PatternChain = { enabled: false, loop: true, entries: [] };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
export function validStepDetail(value: unknown): value is StepDetail {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const d = value as StepDetail;
  return Number.isFinite(d.velocity) && d.velocity >= 0 && d.velocity <= 1 &&
    Number.isFinite(d.probability) && d.probability >= 0 && d.probability <= 1 &&
    Number.isInteger(d.ratchet) && d.ratchet >= 1 && d.ratchet <= 4 &&
    Number.isFinite(d.timing) && d.timing >= -.45 && d.timing <= .45 &&
    Number.isInteger(d.pitch) && d.pitch >= -24 && d.pitch <= 24 &&
    (d.locks === undefined || validSoundLocks(d.locks));
}
export function validPatternState(p: PatternState): boolean {
  if (p.selectedBank !== undefined && (!Number.isInteger(p.selectedBank) || p.selectedBank < 0 || p.selectedBank > 3)) return false;
  if (p.patternBanks !== undefined && (!Array.isArray(p.patternBanks) || p.patternBanks.length !== 4 || !p.patternBanks.every(bank =>
    bank && [16, 32].includes(bank.length) && Array.isArray(bank.steps) && bank.steps.length === 8 && bank.steps.every(row => Array.isArray(row) && row.length === 32 && row.every(value => typeof value === "boolean")) &&
    Array.isArray(bank.stepDetails) && bank.stepDetails.length === 8 && bank.stepDetails.every(row => Array.isArray(row) && row.length === 32 && row.every(validStepDetail))))) return false;
  if (p.chain !== undefined) {
    const chain = p.chain;
    if (!chain || typeof chain !== "object" || typeof chain.enabled !== "boolean" || typeof chain.loop !== "boolean" || !Array.isArray(chain.entries) || chain.entries.length > 32 ||
      chain.entries.some(entry => !entry || !Number.isInteger(entry.bank) || entry.bank < 0 || entry.bank > 3 || !Number.isInteger(entry.repeats) || entry.repeats < 1 || entry.repeats > 16) || chain.enabled && !chain.entries.length) return false;
    if (chain.entries.reduce((sum, entry) => sum + (entry.bank === (p.selectedBank ?? 0) ? p.steps[0].length : p.patternBanks?.[entry.bank]?.length ?? 16) / 4 * entry.repeats, 0) > 256) return false;
  }
  return true;
}
/** Current grid is authoritative; banks retain their hidden second halves. */
export function syncPatternState<T extends PatternState>(project: T): T & { selectedBank: number; patternBanks: PatternBank[]; chain: PatternChain } {
  const selectedBank = project.selectedBank ?? 0;
  const patternBanks = Array.from({ length: 4 }, (_, bank) => {
    const saved = project.patternBanks?.[bank];
    const steps = saved ? saved.steps.map(row => [...row]) : Array.from({ length: 8 }, () => Array(32).fill(false) as boolean[]);
    const stepDetails = saved ? normalizeStepDetails(steps, saved.stepDetails) : createStepDetails(steps);
    return { length: saved?.length ?? (bank === selectedBank ? project.steps[0].length as 16 | 32 : 16), steps, stepDetails };
  });
  const active = patternBanks[selectedBank]; active.length = project.steps[0].length as 16 | 32;
  const details = normalizeStepDetails(project.steps, project.stepDetails);
  project.steps.forEach((row, voice) => row.forEach((hit, step) => { active.steps[voice][step] = hit; active.stepDetails[voice][step] = clone(details[voice][step]); }));
  return { ...project, selectedBank, patternBanks, chain: clone(project.chain ?? EMPTY_CHAIN) };
}
export function bankPattern(project: PatternState, bank = project.selectedBank ?? 0): PatternBank {
  if (bank === (project.selectedBank ?? 0)) return { length: project.steps[0].length as 16 | 32, steps: project.steps.map(row => [...row]), stepDetails: normalizeStepDetails(project.steps, project.stepDetails) };
  const saved = project.patternBanks?.[bank];
  const length = saved?.length ?? 16;
  const steps = saved ? saved.steps.map(row => row.slice(0, length)) : Array.from({ length: 8 }, () => Array(length).fill(false) as boolean[]);
  return { length, steps, stepDetails: normalizeStepDetails(steps, saved?.stepDetails) };
}
export function selectPatternBank<T extends PatternState>(project: T, bank: number): T {
  const saved = syncPatternState(project), target = saved.patternBanks[bank];
  return { ...saved, selectedBank: bank, steps: target.steps.map(row => row.slice(0, target.length)), stepDetails: target.stepDetails.map(row => clone(row.slice(0, target.length))) };
}
export function resizePattern<T extends PatternState>(project: T, length: 16 | 32): T {
  const saved = syncPatternState(project), target = saved.patternBanks[saved.selectedBank];
  return { ...saved, steps: target.steps.map(row => row.slice(0, length)), stepDetails: target.stepDetails.map(row => clone(row.slice(0, length))) };
}
export function chainLength(project: PatternState, entries = project.chain?.entries ?? []): number {
  return entries.reduce((sum, entry) => sum + bankPattern(project, entry.bank).length / 4 * entry.repeats, 0);
}
export type PatternRun = { bank: number; entry: number; repeat: number; startStep: number; pattern: PatternBank };
export function sequenceRuns(project: PatternState, scope?: string): PatternRun[] {
  const chain = project.chain;
  const useChain = scope === "chain" || scope === undefined && chain?.enabled;
  const entries = useChain ? chain?.entries ?? [] : [{ bank: project.selectedBank ?? 0, repeats: 1 }];
  if (!entries.length) throw new Error("Add a pattern to the HOTPLATE chain first.");
  let startStep = 0; const runs: PatternRun[] = [];
  entries.forEach((entry, index) => {
    const pattern = bankPattern(project, entry.bank);
    for (let repeat = 0; repeat < entry.repeats; repeat++) {
      runs.push({ bank: entry.bank, entry: index, repeat, startStep, pattern }); startStep += pattern.length;
    }
  });
  if (startStep > 1024) throw new Error("The HOTPLATE chain exceeds 256 beats. Use fewer repeats or shorter patterns.");
  return runs;
}
export type SequencerEvent = { voice: number; at: number; velocity: number; pitch: number; locks?: SoundLocks };
type SequencerProject = PatternState & { name: string; bpm: number; swing: number; muted: boolean[]; sounds: { name: string }[] };
export function sequencerEvents(project: SequencerProject, options: { scope?: string; repetitions?: number; solo?: number | null; portable?: boolean; voice?: number } = {}) {
  const runs = sequenceRuns(project, options.scope), repetitions = options.repetitions ?? 1;
  const totalSteps = runs.reduce((sum, run) => sum + run.pattern.length, 0), events: (SequencerEvent & { probability?: number })[] = [];
  let cycle = 0;
  for (let iteration = 0; iteration < repetitions; iteration++) for (const run of runs) {
    const details = options.portable ? run.pattern.stepDetails.map(row => row.map(detail => ({ ...detail, probability: 1 }))) : run.pattern.stepDetails;
    for (let step = 0; step < run.pattern.length; step++) for (const event of eventsForStep(run.pattern.steps, details, step, cycle, project.bpm, project.swing)) {
      if (options.scope === "voice" ? event.voice !== (options.voice ?? 0) : project.muted[event.voice] || options.solo != null && options.solo !== event.voice) continue;
      events.push({ voice: event.voice, at: Math.max(0, (iteration * totalSteps + run.startStep + step) * 15 / project.bpm + event.offset), velocity: event.velocity, pitch: event.pitch,
        ...(event.locks ? { locks: { ...event.locks } } : {}), ...(options.portable ? { probability: run.pattern.stepDetails[event.voice][step].probability } : {}) });
    }
    cycle++;
  }
  return { events, steps: totalSteps * repetitions, durationSeconds: totalSteps * repetitions * 15 / project.bpm };
}
export function sequencerPattern(project: SequencerProject, options: { scope?: string; voice?: number; solo?: number | null } = {}) {
  if (![undefined, "pattern", "chain", "voice"].includes(options.scope)) throw new Error("Choose the current pattern, complete chain, or selected voice.");
  const source = sequencerEvents(project, { ...options, portable: true });
  if (source.events.length > 4096) throw new Error("This HOTPLATE sequence exceeds 4,096 portable notes. Reduce repeats or ratchets.");
  return { format: "musiclab-pattern", version: 1, name: project.name + " · HOTPLATE", sourceApp: "form", kind: "drums", tempo: project.bpm, swing: 0, lengthBeats: source.steps / 4, meter: [4, 4],
    seed: 0x48504c54, voices: project.sounds.map((voice, index) => ({ id: "voice-" + index, name: voice.name, pitch: 36 + index })),
    notes: source.events.map((event, index) => ({ id: "note-" + index, voice: "voice-" + event.voice, beat: event.at * project.bpm / 60, duration: Math.min(.25, source.steps / 4 - event.at * project.bpm / 60), velocity: event.velocity, pitch: 36 + event.voice + event.pitch, probability: event.probability ?? 1, ...(event.locks ? { locks: { ...event.locks } } : {}) })) };
}
