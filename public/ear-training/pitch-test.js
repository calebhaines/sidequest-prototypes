/**
 * A short, uncalibrated pitch-direction practice staircase.
 * Two consecutive correct answers narrow the gap; one incorrect answer widens it.
 * The result describes this practice run, not a clinical hearing threshold.
 */
const START_CENTS = 100;
const FLOOR_CENTS = 2;
const CEILING_CENTS = 200;
const STEP_FACTOR = 1.5;
const TRIAL_LIMIT = 24;

export function createPitchTest() {
  return {
    trialCount: 0,
    trialLimit: TRIAL_LIMIT,
    cents: START_CENTS,
    correctCount: 0,
    correctRun: 0,
    reversals: [],
    trials: [],
    lastDirection: 0,
    complete: false,
  };
}

/** Returns a new state. Reversals record the gap that was heard on that trial. */
export function answerPitchTest(state, correct) {
  const next = {
    ...state,
    reversals: [...state.reversals],
    trials: state.trials.map(trial => ({ ...trial })),
  };
  if (state.complete || state.trialCount >= state.trialLimit) {
    next.complete = true;
    return next;
  }

  const wasCorrect = correct === true;
  const testedCents = state.cents;
  next.trialCount += 1;
  next.correctCount += Number(wasCorrect);
  next.correctRun = wasCorrect ? state.correctRun + 1 : 0;
  next.trials.push({ cents: testedCents, correct: wasCorrect });

  let targetCents = testedCents;
  if (!wasCorrect) {
    targetCents *= STEP_FACTOR;
  } else if (next.correctRun >= 2) {
    targetCents /= STEP_FACTOR;
    next.correctRun = 0;
  }
  next.cents = Math.max(FLOOR_CENTS, Math.min(CEILING_CENTS, targetCents));

  const direction = Math.sign(next.cents - testedCents);
  if (direction !== 0) {
    if (state.lastDirection !== 0 && direction !== state.lastDirection) {
      next.reversals.push(testedCents);
    }
    next.lastDirection = direction;
  }
  next.complete = next.trialCount >= next.trialLimit;
  return next;
}

/** Estimate from the last six reversals, requiring at least four reversals. */
export function summarizePitchTest(state) {
  const summary = {
    trialCount: state.trialCount,
    correctCount: state.correctCount,
    accuracy: state.trialCount ? state.correctCount / state.trialCount * 100 : 0,
    reversalCount: state.reversals.length,
    estimateCents: null,
    range: 'insufficient',
  };
  const finalFour = state.trials.slice(-4);
  if (finalFour.length === 4) {
    const correct = finalFour.filter(trial => trial.correct).length;
    if (finalFour.every(trial => trial.cents === FLOOR_CENTS) && correct >= 3) {
      summary.estimateCents = FLOOR_CENTS;
      summary.range = 'floor';
      return summary;
    }
    if (finalFour.every(trial => trial.cents === CEILING_CENTS) && correct <= 1) {
      summary.estimateCents = CEILING_CENTS;
      summary.range = 'ceiling';
      return summary;
    }
  }
  if (state.reversals.length >= 4) {
    const recent = state.reversals.slice(-6);
    summary.estimateCents = Math.exp(recent.reduce((sum, cents) => sum + Math.log(cents), 0) / recent.length);
    summary.range = 'estimate';
  }
  return summary;
}
