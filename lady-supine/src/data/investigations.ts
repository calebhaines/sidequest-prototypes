import { INVESTIGATIONS_EARLY } from './investigationsEarly';
import { INVESTIGATIONS_MIDDLE } from './investigationsMiddle';
import { INVESTIGATIONS_LATE } from './investigationsLate';
import { challengeSolved } from './investigationTypes';
import type { Investigation, InvestigationProgress } from './investigationTypes';

export const INVESTIGATIONS: Investigation[] = [...INVESTIGATIONS_EARLY, ...INVESTIGATIONS_MIDDLE, ...INVESTIGATIONS_LATE].sort((a, b) => a.act - b.act);
export const caseFlag = (id: string): string => `case_${id}_done`;

export const INVESTIGATION_GATES: Record<string, string> = {
  library_identity: 'missing_tomorrow',
  museum_arrival: 'abundance_audit',
  supine_wish: 'portrait_testimony',
  supine_banishment: 'portrait_testimony',
  hospital_provision: 'continuity_patient',
  castle_minders: 'listening_castle',
  infinite_open: 'common_tomorrow',
};

export function requiredInvestigation(nextScene: string | undefined, finishedIds: string[]): string | null {
  if (!nextScene) return null;
  const directlyRequired = INVESTIGATION_GATES[nextScene];
  if (directlyRequired && !finishedIds.includes(directlyRequired)) return directlyRequired;
  if (nextScene === 'infinite_question' || nextScene.startsWith('ending_')) return INVESTIGATIONS.find(investigation => !finishedIds.includes(investigation.id))?.id || null;
  return null;
}

export function caseIsComplete(investigation: Investigation, progress: InvestigationProgress | undefined): boolean {
  return Boolean(progress?.finished && investigation.challenges.length === 6 && investigation.challenges.every(challenge => {
    const saved = progress.challenges[challenge.id];
    return saved?.solved && challengeSolved(challenge.board, saved);
  }));
}
