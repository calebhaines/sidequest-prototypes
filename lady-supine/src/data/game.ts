import type { InvestigationProgress } from './investigationTypes';

export type GameState = {
  version: 1;
  scene: string;
  location: string;
  act: number;
  time: number;
  flags: string[];
  items: string[];
  unlocked: string[];
  visited: string[];
  journal: { scene: string; speaker: string; text: string; timestamp: number }[];
  solved: string[];
  playSeconds: number;
  ending: string | null;
  investigations: Record<string, InvestigationProgress>;
};

export const SAVE_KEY = 'lady-supine-adventure-v1';
export function isGameSave(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  const stringList = (list: unknown) => Array.isArray(list) && list.every(entry => typeof entry === 'string');
  const cases = candidate.investigations;
  if (cases !== undefined && (!cases || typeof cases !== 'object' || Array.isArray(cases) || !Object.values(cases).every(progress => {
    if (!progress || typeof progress !== 'object' || !Number.isInteger(progress.stage) || progress.stage < 0 || progress.stage > 6 || typeof progress.started !== 'boolean' || typeof progress.finished !== 'boolean' || !progress.challenges || typeof progress.challenges !== 'object' || Array.isArray(progress.challenges)) return false;
    return Object.values(progress.challenges).every((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return false;
      const challenge = entry as Record<string, unknown>;
      return typeof challenge.solved === 'boolean' && typeof challenge.hints === 'number' && Number.isInteger(challenge.hints) && challenge.hints >= 0 && challenge.hints <= 3
        && challenge.answers !== null && typeof challenge.answers === 'object' && !Array.isArray(challenge.answers) && Object.values(challenge.answers as object).every(answer => typeof answer === 'string')
        && (challenge.order === undefined || stringList(challenge.order))
        && (challenge.route === undefined || Array.isArray(challenge.route) && challenge.route.every(cell => typeof cell === 'number' && Number.isInteger(cell)))
        && (challenge.lamps === undefined || Array.isArray(challenge.lamps) && challenge.lamps.every(lamp => typeof lamp === 'boolean'));
    });
  }))) return false;
  return candidate.version === 1 && typeof candidate.scene === 'string' && typeof candidate.location === 'string'
    && typeof candidate.act === 'number' && Number.isInteger(candidate.act) && candidate.act >= 1 && candidate.act <= 6
    && typeof candidate.time === 'number' && Number.isFinite(candidate.time) && candidate.time >= 0
    && typeof candidate.playSeconds === 'number' && Number.isFinite(candidate.playSeconds) && candidate.playSeconds >= 0
    && ['flags', 'items', 'unlocked', 'visited', 'solved'].every(key => stringList(candidate[key]))
    && Array.isArray(candidate.journal) && candidate.journal.every(entry => entry && typeof entry.scene === 'string' && typeof entry.speaker === 'string' && typeof entry.text === 'string' && typeof entry.timestamp === 'number')
    && (candidate.ending === null || typeof candidate.ending === 'string');
}
export const freshGame = (): GameState => ({
  version: 1,
  scene: 'gate_arrival',
  location: 'entrance',
  act: 1,
  time: 47 * 60 + 12,
  flags: [],
  items: [],
  unlocked: ['entrance', 'shanty', 'lake', 'library'],
  visited: ['gate_arrival'],
  journal: [],
  solved: [],
  playSeconds: 0,
  ending: null,
  investigations: {},
});

export function readSave(): GameState {
  try {
    const value = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (isGameSave(value)) return { ...freshGame(), ...value, investigations: value.investigations || {} };
  } catch { /* A blocked browser store should not prevent play. */ }
  return freshGame();
}

export function matchesRequirement(requirement: string | undefined, flags: string[]): boolean {
  if (!requirement) return true;
  return requirement.startsWith('!') ? !flags.includes(requirement.slice(1)) : flags.includes(requirement);
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${Math.floor(safe % 60).toString().padStart(2, '0')}`;
}
