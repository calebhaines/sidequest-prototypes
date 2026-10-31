/** A fixed 20-trial ABX run; feedback and chance comparison wait until completion. */
const PROTOCOL = 'temperament-abx-v1';
const TRIAL_LIMIT = 20;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isID = value => typeof value === 'string' && value.length > 0 && value.trim() === value;
const isChoice = value => value === 'A' || value === 'B';

function validateConfig({ tuningA, tuningB, level, timbre, trialLimit }) {
  // The caller checks catalog membership. This module never normalizes IDs.
  if (!isID(tuningA) || !isID(tuningB) || tuningA === tuningB) {
    throw new RangeError('Choose two distinct temperament IDs.');
  }
  if (typeof level !== 'string' || !/^level-[1-8]$/.test(level)) {
    throw new RangeError('Choose a temperament level from level-1 through level-8.');
  }
  if (!['warm', 'sine', 'piano'].includes(timbre)) {
    throw new RangeError('Choose a warm, sine, or piano timbre.');
  }
  if (trialLimit !== TRIAL_LIMIT) throw new RangeError('An ABX test has exactly 20 trials.');
}

function validateTrial(trial) {
  if (!isObject(trial) || !isChoice(trial.answer) || !isChoice(trial.response)) {
    throw new RangeError('ABX answers and responses must be A or B.');
  }
}

function validateState(state) {
  if (!isObject(state) || state.protocol !== PROTOCOL) throw new RangeError('Invalid ABX protocol state.');
  validateConfig(state);
  if (!Array.isArray(state.trials) || state.trials.length > TRIAL_LIMIT) {
    throw new RangeError('Invalid ABX trial history.');
  }
  for (const trial of state.trials) validateTrial(trial);
  const correct = state.trials.filter(trial => trial.answer === trial.response).length;
  if (state.trialCount !== state.trials.length || state.correctCount !== correct
      || state.complete !== (state.trialCount === TRIAL_LIMIT)) {
    throw new RangeError('ABX counts must match the trial history.');
  }
}

export function createTemperamentTest(options = {}) {
  if (!isObject(options)) throw new RangeError('ABX configuration must be an object.');
  const { tuningA, tuningB, level, timbre, trialLimit = TRIAL_LIMIT } = options;
  validateConfig({ tuningA, tuningB, level, timbre, trialLimit });
  return {
    protocol: PROTOCOL, tuningA, tuningB, level, timbre, trialLimit,
    trialCount: 0, correctCount: 0, trials: [], complete: false,
  };
}

/** Pure transition: a completed run cannot accept a twenty-first response. */
export function answerTemperamentTest(state, trial) {
  validateState(state);
  validateTrial(trial);
  const next = {
    ...state,
    trials: state.trials.map(({ answer, response }) => ({ answer, response })),
  };
  if (state.complete) return next;
  next.trials.push({ answer: trial.answer, response: trial.response });
  next.trialCount += 1;
  next.correctCount += Number(trial.answer === trial.response);
  next.complete = next.trialCount === TRIAL_LIMIT;
  return next;
}

function binomialTail(trials, correct) {
  // At n=20, every coefficient and the numerator are exact small integers.
  // Dividing by 2^n gives the exact one-sided fair-guess probability.
  let coefficient = 1, numerator = 0;
  for (let successes = 0; successes <= trials; successes++) {
    if (successes >= correct) numerator += coefficient;
    coefficient = coefficient * (trials - successes) / (successes + 1);
  }
  return numerator / 2 ** trials;
}

export function summarizeTemperamentTest(state) {
  validateState(state);
  const pValue = state.complete ? binomialTail(state.trialCount, state.correctCount) : null;
  return {
    trials: state.trialCount,
    correct: state.correctCount,
    accuracy: state.trialCount ? state.correctCount / state.trialCount * 100 : 0,
    chance: 50,
    pValue,
    aboveChance: pValue === null ? null : pValue <= .05,
  };
}
