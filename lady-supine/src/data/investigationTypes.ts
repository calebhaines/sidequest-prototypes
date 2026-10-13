export type Evidence = { title: string; text: string };
export type Field = { id: string; label: string; min?: number; max?: number; suffix?: string };
export type InvestigationBoard =
  | { kind: 'ledger'; rows: { id: string; title: string }[]; columns: { id: string; title: string; options: string[] }[]; solution: Record<string, string> }
  | { kind: 'cipher'; inscription: string; fields: { id: string; label: string }[]; solution: Record<string, string> }
  | { kind: 'balance'; fields: Field[]; equations: string[]; solution: Record<string, string> }
  | { kind: 'sequence'; cards: { id: string; title: string; description: string }[]; solution: string[] }
  | { kind: 'route'; width: number; height: number; blocked: number[]; start: number; end: number; waypoints: number[]; maxSteps: number; solution: number[] }
  | { kind: 'circuit'; size: number; initial: boolean[]; target: boolean[]; solution: number[] };

export type InvestigationChallenge = {
  id: string;
  title: string;
  narrative: string[];
  task: string;
  evidence: Evidence[];
  board: InvestigationBoard;
  hints: [string, string, string];
  resolution: string[];
  minutes: { min: number; typical: number; max: number };
};

export type Investigation = {
  id: string;
  act: number;
  title: string;
  subtitle: string;
  location: string;
  premise: string[];
  challenges: InvestigationChallenge[];
  conclusion: string[];
};

export type ChallengeProgress = {
  answers: Record<string, string>;
  order?: string[];
  route?: number[];
  lamps?: boolean[];
  hints: number;
  solved: boolean;
};

export type InvestigationProgress = {
  stage: number;
  started: boolean;
  finished: boolean;
  challenges: Record<string, ChallengeProgress>;
};

export const emptyInvestigation = (): InvestigationProgress => ({ stage: 0, started: false, finished: false, challenges: {} });

export function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function challengeSolved(board: InvestigationBoard, progress: ChallengeProgress): boolean {
  if (board.kind === 'balance') {
    return Object.entries(board.solution).every(([key, answer]) => {
      const value = progress.answers[key]?.trim();
      return Boolean(value) && Number.isFinite(Number(value)) && Number(value) === Number(answer);
    });
  }
  if (board.kind === 'ledger' || board.kind === 'cipher') {
    return Object.entries(board.solution).every(([key, answer]) => normalizeAnswer(progress.answers[key] || '') === normalizeAnswer(answer));
  }
  if (board.kind === 'sequence') return (progress.order || []).join('|') === board.solution.join('|');
  if (board.kind === 'circuit') {
    const lamps = progress.lamps || board.initial;
    return lamps.length === board.size * board.size && board.target.length === lamps.length && lamps.every((lamp, index) => lamp === board.target[index]);
  }
  const path = progress.route || [board.start];
  if (path[0] !== board.start || path.at(-1) !== board.end || path.length - 1 > board.maxSteps) return false;
  if (new Set(path).size !== path.length) return false;
  let waypoint = 0;
  for (let index = 0; index < path.length; index++) {
    const cell = path[index];
    if (cell < 0 || cell >= board.width * board.height || board.blocked.includes(cell)) return false;
    if (cell === board.waypoints[waypoint]) waypoint++;
    else if (board.waypoints.includes(cell)) return false;
    if (index > 0) {
      const before = path[index - 1];
      const distance = Math.abs(Math.floor(cell / board.width) - Math.floor(before / board.width)) + Math.abs(cell % board.width - before % board.width);
      if (distance !== 1) return false;
    }
  }
  return waypoint === board.waypoints.length;
}

export function toggleCircuit(lamps: boolean[], cell: number, size: number): boolean[] {
  const row = Math.floor(cell / size); const column = cell % size;
  const toggled = [cell];
  if (row > 0) toggled.push(cell - size);
  if (row < size - 1) toggled.push(cell + size);
  if (column > 0) toggled.push(cell - 1);
  if (column < size - 1) toggled.push(cell + 1);
  return lamps.map((lamp, index) => toggled.includes(index) ? !lamp : lamp);
}
