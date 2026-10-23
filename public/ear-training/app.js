import { MODES, LEVELS, LEGACY_LEVELS, LEVEL_MIGRATION, getLevelDescription, generateQuestion, generatePitchQuestion, isCorrect, noteName } from './music.js?v=2';
import { AudioEngine } from './audio.js?v=2';
import { createPitchTest, answerPitchTest, summarizePitchTest } from './pitch-test.js?v=2';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escape = (value) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORAGE_KEY = 'overtone.practice.v1';
const modeIds = MODES.map(m => m.id);
const historyLevels = [...LEVELS, ...LEGACY_LEVELS.map(l => ({...l, title:`Legacy · ${l.title}`}))];
const levelIds = historyLevels.map(l => l.id);
const currentLevelIds = LEVELS.map(l => l.id);
const levelTitle = id => historyLevels.find(l => l.id === id)?.title || id;
const audio = new AudioEngine();
let storageAvailable = true;
let toastTimer;
let playbackId = 0;
const defaults = {mode:'intervals', level:'level-1', timbre:'warm', volume:0.65};
let saved = {version:1, settings:{...defaults}, attempts:[], pitchTests:[]};

function validAttempt(a) {
  return a && modeIds.includes(a.mode) && levelIds.includes(a.level)
    && ['correct','incorrect','revealed'].includes(a.outcome)
    && typeof a.timestamp === 'string' && Number.isFinite(Date.parse(a.timestamp));
}
function testState(record) {
  let result = createPitchTest();
  for (const trial of record.trials) result = answerPitchTest(result, trial.correct);
  return result;
}
function validPitchTest(record) {
  if (!record || record.protocol !== '2d1u-v1' || typeof record.timestamp !== 'string' || !Number.isFinite(Date.parse(record.timestamp))
    || !Array.isArray(record.trials) || record.trials.length !== 24) return false;
  let result = createPitchTest();
  for (const trial of record.trials) {
    if (!trial || typeof trial.correct !== 'boolean' || !Number.isFinite(trial.cents)
      || Math.abs(trial.cents - result.cents) > 1e-8) return false;
    result = answerPitchTest(result, trial.correct);
  }
  return result.complete;
}
function cleanPitchTest(record) {
  return {protocol:'2d1u-v1', timestamp:new Date(record.timestamp).toISOString(),
    trials:record.trials.map(t => ({cents:t.cents,correct:t.correct}))};
}
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const data = JSON.parse(raw);
    if (data.version === 1 && Array.isArray(data.attempts)) {
      saved.attempts = data.attempts.filter(validAttempt).slice(-2000).map(cleanAttempt);
      if (modeIds.includes(data.settings?.mode)) saved.settings.mode = data.settings.mode;
      if (currentLevelIds.includes(data.settings?.level)) saved.settings.level = data.settings.level;
      else if (LEVEL_MIGRATION[data.settings?.level]) saved.settings.level = LEVEL_MIGRATION[data.settings.level];
      if (Array.isArray(data.pitchTests)) saved.pitchTests = data.pitchTests.filter(validPitchTest).slice(-50).map(cleanPitchTest);
      if (['warm','piano','sine'].includes(data.settings?.timbre)) saved.settings.timbre = data.settings.timbre;
      if (Number.isFinite(data.settings?.volume)) saved.settings.volume = Math.max(0, Math.min(1, data.settings.volume));
    }
  }
} catch { storageAvailable = false; }

function cleanAttempt(a) {
  return {mode:a.mode, level:a.level, outcome:a.outcome, timestamp:new Date(a.timestamp).toISOString()};
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); storageAvailable = true; }
  catch { storageAvailable = false; }
  $('#storage-status').textContent = storageAvailable ? 'LOCAL / PRIVATE' : 'SESSION ONLY';
}
function notify(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}
const newSession = () => ({round:0, correct:0, answered:0, skipped:0, streak:0, results:[]});
const state = {mode:saved.settings.mode, level:saved.settings.level, page:'practice', question:null,
  heard:false, answered:false, busy:false, response:null, input:[], rhythm:[], replays:0, session:newSession(), test:null};
audio.volume = saved.settings.volume;
audio.timbre = saved.settings.timbre;
$('#volume').value = Math.round(audio.volume * 100);
$('#timbre').value = audio.timbre;
$('#level').innerHTML = LEVELS.map(l => `<option value="${l.id}">${escape(l.title)}</option>`).join('');
$('#level').value = state.level;
$('#progress-level').innerHTML += `<optgroup label="Eight-level practice">${LEVELS.map(l => `<option value="${l.id}">${escape(l.title)}</option>`).join('')}</optgroup><optgroup label="Earlier scores — original settings">${historyLevels.filter(l => !currentLevelIds.includes(l.id)).map(l => `<option value="${l.id}">${escape(l.title)}</option>`).join('')}</optgroup>`;
$('#storage-status').textContent = storageAvailable ? 'LOCAL / PRIVATE' : 'SESSION ONLY';

const lessonTitles = {intervals:'Hear the space.', chords:'Hear the color.', progressions:'Hear the journey.', melody:'Hold the phrase.', scales:'Hear the landscape.', rhythm:'Find the pocket.',pitch:'Hear the smallest shift.'};
const symbols = {intervals:'↗', chords:'≋', progressions:'→', melody:'⌁', scales:'⋰', rhythm:'▥',pitch:'↕'};
const lessonCopy = {
  intervals:'An interval is the distance between two notes. Sing the lower note, then reach for the other. Does it feel close, open, or tense?',
  chords:'A chord has a character, even when its root changes. Listen to the whole color before trying to pick out individual notes.',
  progressions:'First, find home in the tonic chord. Follow the bass and listen for tension moving away from home, then finding its way back.',
  melody:'Listen to the shape first: rising, falling, or repeating. Then rebuild the exact notes in order. The tonic gives you a place to start.',
  scales:'Every scale has a pattern of steps. Listen for the notes that give it a distinctive shade, especially the third, sixth, and seventh.',
  rhythm:'The count-in sets the beat. Each grid cell is one subdivision. Listen for where the sound lands and where the silence lives.',
  pitch:'Compare two tones. Is the second a little higher or a little lower? One semitone is 100 cents. At the smallest gaps, listen for a subtle change rather than a new note name.'
};

$('#mode-nav').innerHTML = MODES.map((m,i) => `<button class="mode-button" data-mode="${m.id}" aria-pressed="false"><span class="mode-index">${String(i+1).padStart(2,'0')}</span><span class="mode-copy"><strong>${escape(m.short || m.title)}</strong><small>${escape(m.tag || m.description)}</small></span><span class="mode-arrow" aria-hidden="true">↗</span></button>`).join('');
$('#progress-mode').innerHTML += MODES.map(m => `<option value="${m.id}">${escape(m.short || m.title)}</option>`).join('');
$('#waveform').innerHTML = Array.from({length:65},(_,i) => {
  const envelope = Math.sin((i / 64) * Math.PI) ** 0.7;
  const height = 5 + envelope * (16 + Math.abs(Math.sin(i * 2.41)) * 63);
  return `<span style="--h:${height.toFixed(1)};--i:${i}"></span>`;
}).join('');

function stopPlayback() {
  playbackId++;
  audio.stop();
  state.busy = false;
  $('#waveform').classList.remove('is-playing');
  updatePlayback();
}
audio.onStateChange = playing => { $('#waveform').classList.toggle('is-playing', playing); };

function combinedEvents(reference = [], events = [], gap = 0.45) {
  if (!reference.length) return events;
  const end = Math.max(...reference.map(e => e.at + e.duration)) + gap;
  return [...reference, ...events.map(e => ({...e, at:e.at + end}))];
}

function fullBar(events, q) {
  if (q.mode !== 'rhythm' || !events.length) return events;
  // Click sounds stay short in the synth; the final event also holds the clock
  // through any trailing rests, so the answer grid opens at the end of the bar.
  return events.map((e,i) => i === events.length - 1
    ? {...e, duration:Math.max(e.duration, q.rhythmSteps*q.stepDuration - e.at)} : e);
}

function melodyLabel(midi) {
  return state.question?.keyboard?.find(k => k.midi === midi)?.label || noteName(midi);
}

async function performAudio(events, {markHeard=false, message='PLAYING SIGNAL'} = {}) {
  const question = state.question;
  const token = ++playbackId;
  state.busy = true;
  $('#audio-status').textContent = message;
  updatePlayback();
  renderAnswer();
  try {
    const result = await audio.play(events);
    if (token !== playbackId || question !== state.question) return;
    state.busy = false;
    if (!result.cancelled && markHeard) { state.heard = true; state.replays++; }
    updatePlayback();
    renderAnswer();
  } catch (error) {
    if (token !== playbackId) return;
    state.busy = false;
    updatePlayback();
    renderAnswer();
    notify(`Audio could not start. ${error.message || 'Please try again.'}`);
  }
}

function playSignal() {
  if (!state.question || state.busy || (state.test && state.heard)) return;
  const q = state.question;
  performAudio(combinedEvents(q.reference, fullBar(q.events, q), q.mode === 'rhythm' ? 0 : 0.45), {markHeard:true});
}

function updatePlayback() {
  $('#play').disabled = state.busy || Boolean(state.test && state.heard);
  $('#stop').disabled = !state.busy;
  $('#reference').disabled = state.busy;
  if (!state.busy) {
    $('#audio-status').innerHTML = `<span class="status-dot"></span> ${state.heard ? 'READY FOR YOUR ANSWER' : 'AWAITING PLAYBACK'}`;
    if (state.answered) $('#audio-status').innerHTML = `<span class="status-dot"></span> ${state.test ? 'RESPONSE RECORDED' : 'SIGNAL DECODED'}`;
  }
  $('#play').innerHTML = `<span aria-hidden="true">▶</span> ${state.test && state.heard ? 'Pair played' : state.replays ? 'Replay signal' : 'Play signal'} <kbd>SPACE</kbd>`;
  $('#play-hint').textContent = state.test ? state.busy ? 'Compare the second tone with the first.' : state.heard ? 'Choose higher or lower. Results come at the end.' : 'One complete listen per trial. Press play when ready.' : state.busy ? 'Listen to the whole phrase. Take your time.' : state.heard ? 'Sing it back. Trust your ear. Replay whenever you like.' : 'Press play to begin. Replays are always free.';
  $('#replay-count').textContent = state.test ? 'ONE LISTEN / RESULTS AT THE END' : state.replays > 1 ? `${state.replays - 1} REPLAY${state.replays === 2 ? '' : 'S'} / NO PENALTY` : 'UNLIMITED REPLAYS';
}

function updateTestControls() {
  $('#pitch-test-panel').hidden = state.mode !== 'pitch';
  $('#pitch-test-intro').hidden = Boolean(state.test);
  $('#pitch-test-status').hidden = !state.test;
  $('#level').disabled = Boolean(state.test);
  $('#timbre').disabled = Boolean(state.test);
  $('#timbre').value = audio.timbre;
  $('#practice-mantra').innerHTML = state.test ? 'One complete listen per trial.<br>Take your time to choose.' : 'Listen as often as you need.<br>Curiosity beats a perfect score.';
  $('#space-shortcut-label').textContent = state.test ? 'play once' : 'play / replay';
  $('#level-description').textContent = state.test ? 'Adaptive / the gap adjusts after your answers. Practice-level scores are kept separate.' : getLevelDescription(state.mode,state.level);
  if (state.test) {
    $('#pitch-test-progress').textContent = state.test.complete ? '24 of 24 complete. Your result has been saved.' : state.answered ? `${state.test.trialCount} of 24 recorded. Continue when ready.` : `Trial ${state.test.trialCount + 1} of 24. One listen, then choose.`;
    $('#end-pitch-test').textContent = state.test.complete ? 'Return to fixed practice' : 'End test';
  }
}

function startPitchTest() {
  stopPlayback();
  state.test = createPitchTest();
  state.session = newSession();
  audio.timbre = 'sine';
  newQuestion();
  $('#play').focus();
}

function endPitchTest(showNotice=true) {
  const unfinished = state.test && !state.test.complete;
  stopPlayback();
  state.test = null;
  state.session = newSession();
  audio.timbre = saved.settings.timbre;
  updateTestControls();
  if (showNotice && unfinished) notify('Test ended. Unfinished tests are not saved.');
}

function recordTestAnswer(response) {
  const correct = isCorrect(state.question,response);
  state.test = answerPitchTest(state.test,correct);
  if (state.test.complete) {
    saved.pitchTests.push(cleanPitchTest({protocol:'2d1u-v1',timestamp:new Date().toISOString(),trials:state.test.trials}));
    saved.pitchTests = saved.pitchTests.slice(-50);
    save();
  }
  $('#feedback').className = 'feedback recorded';
  $('#feedback').innerHTML = '<h4>✓ Response recorded.</h4><p>Continue when you are ready. Your accuracy and pitch estimate will appear after the final trial.</p>';
  $('#feedback').hidden = false;
  $('#reveal').hidden = true;
  $('#next').hidden = false;
  $('#next').textContent = state.test.complete ? 'View results →' : 'Next pair →';
  renderAnswer(); renderSession(); updatePlayback(); updateTestControls();
  $('#next').focus({preventScroll:true});
}

function pitchEstimate(summary) {
  if (summary.range === 'floor') return '≤ 2 cents';
  if (summary.range === 'ceiling') return '≥ 200 cents';
  if (summary.range === 'estimate') return `≈ ${summary.estimateCents.toFixed(1)} cents`;
  return 'No stable estimate';
}

function finishPitchTest() {
  stopPlayback();
  const result = summarizePitchTest(state.test);
  const description = result.range === 'floor' ? 'You distinguished the smallest gap in the final trials. Finer differences were not tested.'
    : result.range === 'ceiling' ? 'You reached the largest gap in this test. Start with fixed practice and try another test in a quiet setting.'
    : result.range === 'insufficient' ? 'There were too few changes in difficulty direction for a stable estimate. Your full test is saved; try another run.'
    : `The estimate uses the geometric mean of the last ${Math.min(6,result.reversalCount)} changes in difficulty direction.`;
  $('#question-area').hidden = true;
  $('#set-summary').hidden = false;
  $('#set-summary').innerHTML = `<div class="pitch-result"><p class="eyebrow">PITCH DISCRIMINATION / TEST COMPLETE</p><div class="summary-score">${pitchEstimate(result)}<span>${result.range === 'floor' || result.range === 'ceiling' ? 'TEST RANGE REACHED' : 'PRACTICE ESTIMATE'}</span></div><p>${description}</p><div class="pitch-result-details"><span>${result.correctCount} / ${result.trialCount} correct</span><span>${Math.round(result.accuracy)}% accuracy</span><span>${result.reversalCount} reversals</span></div><p class="test-note">100 cents = one semitone. Two consecutive correct answers narrow the gap; a miss widens it. This short result describes this listening session, rather than a calibrated hearing measurement. Compare runs with the same volume and listening setup.</p><div class="input-actions"><button id="retake-pitch-test" class="primary">Try another test →</button><button id="fixed-pitch-practice" class="secondary">Fixed-level practice</button><button data-page="progress" class="quiet">View test history</button></div></div>`;
  $('#retake-pitch-test').focus({preventScroll:true});
}

function setMode(mode) {
  if (!modeIds.includes(mode)) return;
  if (state.test) endPitchTest();
  stopPlayback();
  state.mode = mode;
  saved.settings.mode = mode;
  state.session = newSession();
  save();
  showPage('practice');
  newQuestion();
}

function newQuestion() {
  stopPlayback();
  state.question = state.test ? generatePitchQuestion(state.test.cents) : generateQuestion(state.mode, state.level);
  state.heard = false;
  state.answered = false;
  state.response = null;
  state.input = [];
  state.rhythm = Array(state.question.rhythmSteps || 0).fill(false);
  state.replays = 0;
  const m = MODES.find(m => m.id === state.mode);
  const i = modeIds.indexOf(state.mode);
  $$('#mode-nav button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === state.mode));
  $('#exercise-title').textContent = m.title;
  $('#exercise-tag').textContent = m.tag || 'LISTEN / RECOGNIZE / REPEAT';
  $('#module-number').textContent = String(i + 1).padStart(2,'0');
  $('#question-prompt').textContent = state.question.prompt;
  $('#question-context').textContent = state.question.context;
  $('#question-counter').textContent = state.test ? `TEST ${String(state.test.trialCount + 1).padStart(2,'0')} / 24` : `QUESTION ${String(state.session.round + 1).padStart(2,'0')} / 10`;
  $('#reference').hidden = !state.question.reference?.length;
  $('#reference').textContent = state.mode === 'rhythm' ? 'Play count-in' : 'Play tonic';
  $('#lesson-title').textContent = lessonTitles[state.mode];
  $('#lesson-text').textContent = lessonCopy[state.mode];
  $('#note-symbol').textContent = symbols[state.mode];
  $('#question-area').hidden = false;
  $('#set-summary').hidden = true;
  $('#feedback').hidden = true;
  $('#next').hidden = true;
  $('#reveal').hidden = Boolean(state.test);
  updateTestControls();
  renderAnswer();
  renderSession();
  updatePlayback();
}

function renderAnswer() {
  const q = state.question;
  if (!q) return;
  const disabled = !state.heard || state.busy || state.answered;
  $('#answer-hint').textContent = state.answered ? state.test ? 'Response stored. Continue when ready.' : 'Compare what you heard.' : state.busy ? 'Listening…' : !state.heard ? 'Listen first, then choose.' : q.mode === 'melody' ? `${state.input.length} / ${q.inputLength} notes placed` : q.mode === 'rhythm' ? 'Light the cells where a sound lands.' : 'Use the buttons or number keys.';
  $('#response-label').textContent = q.mode === 'melody' ? '02 / REBUILD THE PHRASE' : q.mode === 'rhythm' ? '02 / REBUILD THE RHYTHM' : q.mode === 'pitch' ? '02 / WHICH WAY DID IT MOVE?' : '02 / IDENTIFY THE SOUND';
  if (q.mode === 'melody') {
    const shortcuts = 'ASDFGHJKL';
    $('#answer-area').innerHTML = `<div class="melody-slots">${Array.from({length:q.inputLength},(_,i) => `<button class="note-slot ${state.input[i] !== undefined ? 'is-filled' : ''}" data-slot="${i}" ${disabled || state.input[i] === undefined ? 'disabled' : ''} aria-label="${state.input[i] !== undefined ? `Remove note ${i+1}: ${escape(melodyLabel(state.input[i]))}` : `Note ${i+1}, empty`}"><small>${String(i+1).padStart(2,'0')}</small><span>${state.input[i] !== undefined ? escape(melodyLabel(state.input[i])) : '·'}</span></button>`).join('')}</div><div class="piano-keys">${q.keyboard.map((k,i) => `<button class="piano-key ${[1,3,6,8,10].includes(k.midi%12) ? 'black' : 'white'}" data-midi="${k.midi}" ${disabled || state.input.length >= q.inputLength ? 'disabled' : ''} aria-label="Add ${escape(k.label)}"><span class="key-degree">${escape(k.degree ?? '')}</span><span class="key-label">${escape(k.label)}</span>${shortcuts[i] ? `<kbd>${shortcuts[i]}</kbd>` : ''}</button>`).join('')}</div><div class="input-actions"><button class="secondary" data-action="undo" ${disabled || !state.input.length ? 'disabled' : ''}>Undo</button><button class="quiet" data-action="clear" ${disabled || !state.input.length ? 'disabled' : ''}>Clear</button><button class="secondary" data-action="play-mine" ${state.busy || !state.input.length ? 'disabled' : ''}>▶ My phrase</button><button class="primary" data-action="check" ${disabled || state.input.length !== q.inputLength ? 'disabled' : ''}>Check phrase →</button></div>`;
  } else if (q.mode === 'rhythm') {
    const stepsPerBeat = q.rhythmSteps / 4;
    $('#answer-area').innerHTML = `<div class="rhythm-grid" style="--steps:${q.rhythmSteps}">${state.rhythm.map((hit,i) => `<button class="step ${i%stepsPerBeat === 0 ? 'downbeat' : ''} ${state.answered && q.answer[i] !== hit ? 'step-mismatch' : ''}" data-step="${i}" aria-pressed="${hit}" aria-label="${i%stepsPerBeat === 0 ? `Beat ${i/stepsPerBeat+1}` : `Subdivision ${i+1}`}: ${hit ? 'sound' : 'rest'}" ${disabled ? 'disabled' : ''}><span>${hit ? '●' : '·'}</span><small class="beat-label">${i%stepsPerBeat === 0 ? i/stepsPerBeat+1 : q.rhythmSteps === 8 ? '&' : ['','e','&','a'][i%4]}</small></button>`).join('')}</div><div class="input-actions"><button class="quiet" data-action="clear" ${disabled ? 'disabled' : ''}>Clear grid</button><button class="secondary" data-action="play-mine" ${state.busy || !state.heard ? 'disabled' : ''}>▶ My rhythm</button><button class="primary" data-action="check" ${disabled ? 'disabled' : ''}>Check rhythm →</button></div>`;
  } else {
    $('#answer-area').innerHTML = `<div class="answer-grid ${q.choices.length > 6 ? 'many-choices' : ''}">${q.choices.map((c,i) => `<button class="answer-choice ${state.answered && !state.test && c.value === q.answer ? 'correct' : ''} ${state.answered && !state.test && c.value === state.response && c.value !== q.answer ? 'incorrect' : ''}" data-answer="${escape(c.value)}" ${disabled ? 'disabled' : ''}><kbd>${i < 9 ? i+1 : '·'}</kbd><span><span class="label">${escape(c.label)}</span>${c.sub ? `<small>${escape(c.sub)}</small>` : ''}</span>${state.answered && !state.test && c.value === q.answer ? '<span class="choice-mark" aria-label="Correct answer">✓</span>' : ''}</button>`).join('')}</div>`;
  }
}

function addNote(midi) {
  if (!state.heard || state.busy || state.answered || state.input.length >= state.question.inputLength) return;
  state.input.push(midi);
  audio.preview(midi).catch(() => notify('Audio could not start. Try pressing Play again.'));
  renderAnswer();
}

function submit(response, revealed=false) {
  if (state.answered || (revealed && state.test) || (!revealed && (!state.heard || state.busy))) return;
  stopPlayback();
  state.answered = true;
  state.response = response;
  if (state.test) { recordTestAnswer(response); return; }
  const q = state.question;
  const correct = !revealed && isCorrect(q, response);
  const outcome = revealed ? 'revealed' : correct ? 'correct' : 'incorrect';
  state.session.round++;
  if (revealed) { state.session.skipped++; state.session.streak = 0; }
  else {
    state.session.answered++;
    if (correct) { state.session.correct++; state.session.streak++; }
    else state.session.streak = 0;
  }
  state.session.results.push(outcome);
  saved.attempts.push({mode:state.mode, level:state.level, outcome, timestamp:new Date().toISOString()});
  saved.attempts = saved.attempts.slice(-2000);
  save();
  let detail = '';
  if (!revealed && !correct && ['melody','rhythm'].includes(q.mode)) {
    const matching = q.answer.filter((value,i) => value === response[i]).length;
    detail = `<p class="feedback-detail">${matching} of ${q.answer.length} ${q.mode === 'melody' ? 'notes in the right position' : 'cells matched'}.</p>`;
  }
  const sequence = q.mode === 'melody' ? `<div class="correct-sequence" aria-label="Correct melody">${q.answer.map(n => `<span>${escape(melodyLabel(n))}</span>`).join('')}</div>` : q.mode === 'rhythm' ? `<div class="correct-sequence rhythm-solution" aria-label="Correct rhythm">${q.answer.map((hit,i) => `<span class="${hit ? 'hit' : ''}"><small>${i+1}</small>${hit ? '●' : '·'}</span>`).join('')}</div>` : '';
  $('#feedback').className = `feedback ${outcome}`;
  $('#feedback').innerHTML = `<h4><span aria-hidden="true">${revealed ? '↗' : correct ? '✓' : '↳'}</span> ${revealed ? 'A sound to remember.' : correct ? 'You heard it.' : 'Keep this one in your ear.'}</h4><p class="feedback-answer">${escape(q.answerLabel)}</p>${sequence}${detail}<p>${escape(q.explanation)}</p><p class="small muted">${revealed ? 'Revealed / saved as a skip. Accuracy unchanged.' : 'First attempt saved. Replay to connect the sound with its name.'}</p>`;
  $('#feedback').hidden = false;
  $('#reveal').hidden = true;
  $('#next').hidden = false;
  $('#next').innerHTML = state.session.round >= 10 ? 'Finish set →' : 'Next signal →';
  renderAnswer();
  renderSession();
  updatePlayback();
  $('#next').focus({preventScroll:true});
}

function renderSession() {
  const s = state.session;
  $('#score-title').textContent = state.test ? 'THIS TEST' : 'THIS SET';
  $('#score-caption').textContent = state.test ? 'trials recorded' : 'correct / answered';
  $('#accuracy-caption').textContent = state.test ? 'shown at the end' : 'first attempts only';
  $('#streak-title').textContent = state.test ? 'VOICE' : 'STREAK';
  $('#streak-caption').textContent = state.test ? 'constant during the test' : 'consecutive correct';
  $('#goal-title').textContent = state.test ? 'ONE LISTEN PER TRIAL' : 'A LITTLE, OFTEN';
  if (state.test) {
    $('#session-score').innerHTML = `${state.test.trialCount}<span> / 24</span>`;
    $('#session-accuracy').textContent = '—';
    $('#session-streak').textContent = 'SINE';
    $('#goal-dots').innerHTML = Array.from({length:24},(_,i) => `<span class="${i < state.test.trialCount ? 'done' : ''}" aria-hidden="true"></span>`).join('');
    $('#goal-dots').setAttribute('aria-label', `${state.test.trialCount} of 24 trials completed`);
    $('#goal-label').textContent = `${state.test.trialCount} / 24 recorded · results at the end`;
    return;
  }
  $('#session-score').innerHTML = `${s.correct}<span> / ${s.answered}</span>`;
  $('#session-accuracy').textContent = s.answered ? `${Math.round(100*s.correct/s.answered)}%` : '—';
  $('#session-streak').innerHTML = `${s.streak}<span> in a row</span>`;
  $('#goal-dots').innerHTML = Array.from({length:10},(_,i) => `<span class="${s.results[i] || ''}" aria-hidden="true"></span>`).join('');
  $('#goal-dots').setAttribute('aria-label', `${s.round} of 10 questions completed`);
  $('#goal-label').textContent = s.round ? `${s.round} / 10 explored${s.skipped ? ` · ${s.skipped} revealed` : ''}` : '10 signals. Your own pace.';
}

function finishSet() {
  stopPlayback();
  const s = state.session;
  $('#question-area').hidden = true;
  $('#set-summary').hidden = false;
  $('#set-summary').innerHTML = `<p class="eyebrow">SET COMPLETE / NICE LISTENING</p><div class="summary-score">${s.answered ? Math.round(100*s.correct/s.answered)+'%' : '10'}<span>${s.answered ? 'FIRST-ATTEMPT ACCURACY' : 'SOUNDS EXPLORED'}</span></div><h3>A little more in tune.</h3><p class="muted">${s.correct} correct out of ${s.answered} answered. ${s.skipped} revealed.<br>Take a breath, try another module, or stay with this sound.</p><div class="input-actions"><button id="another-set" class="primary">Another ten →</button><button data-page="progress" class="secondary">View your progress</button></div>`;
  $('#another-set').focus({preventScroll:true});
}

function showPage(page) {
  if (!['practice','progress','guide'].includes(page)) page = 'practice';
  if (page !== 'practice' && state.test) { endPitchTest(); newQuestion(); }
  if (page !== state.page) { stopPlayback(); renderAnswer(); }
  state.page = page;
  ['practice','progress','guide'].forEach(p => { $(`#page-${p}`).hidden = p !== page; });
  $$('.top-nav button').forEach(b => {
    if (b.dataset.page === page) b.setAttribute('aria-current','page');
    else b.removeAttribute('aria-current');
  });
  history.replaceState(null, '', `#${page}`);
  if (page === 'progress') renderProgress();
}

function metrics(attempts) {
  const answered = attempts.filter(a => a.outcome !== 'revealed');
  const correct = answered.filter(a => a.outcome === 'correct').length;
  return {answered:answered.length, correct, revealed:attempts.length-answered.length, accuracy:answered.length ? Math.round(100*correct/answered.length)+'%' : '—'};
}

function renderProgress() {
  const mode = $('#progress-mode').value;
  const level = $('#progress-level').value;
  renderPitchHistory(mode);
  const attempts = saved.attempts.filter(a => (mode === 'all' || a.mode === mode) && (level === 'all' || a.level === level));
  const stats = metrics(attempts);
  const activeDays = new Set(attempts.map(a => new Date(a.timestamp).toLocaleDateString())).size;
  $('#progress-summary').innerHTML = [
    ['SIGNALS ANSWERED', stats.answered], ['ACCURACY', stats.accuracy], ['PRACTICE DAYS', activeDays], ['SOUNDS REVEALED', stats.revealed]
  ].map(([label,value]) => `<div class="metric"><span class="eyebrow">${label}</span><strong>${value}</strong></div>`).join('');
  if (!attempts.length) {
    $('#progress-content').innerHTML = `<div class="empty-state"><span class="accent">[ . . . ]</span><h2>${saved.attempts.length ? 'No signals at these settings.' : 'Your first listen starts the log.'}</h2><p class="muted">${saved.attempts.length ? 'Try another module or level filter.' : 'Try a practice set. Each first answer is saved here, one sound at a time.'}</p><button class="primary" data-page="practice">Back to listening →</button></div>`;
    return;
  }
  const days = Array.from({length:28},(_,i) => {
    const date = new Date(); date.setDate(date.getDate()-27+i);
    const sameDay = attempts.filter(a => new Date(a.timestamp).toLocaleDateString() === date.toLocaleDateString());
    return {label:date.toLocaleDateString(undefined,{month:'short',day:'numeric'}), count:sameDay.length};
  });
  const max = Math.max(1,...days.map(d => d.count));
  const rows = MODES.filter(m => mode === 'all' || m.id === mode).map(m => {
    const s = metrics(attempts.filter(a => a.mode === m.id));
    return `<tr><th scope="row">${escape(m.short || m.title)}</th><td>${s.answered}</td><td>${s.accuracy}</td><td>${s.revealed}</td></tr>`;
  }).join('');
  const recent = attempts.slice(-20).reverse().map(a => `<tr><td>${escape(new Date(a.timestamp).toLocaleDateString(undefined,{month:'short',day:'numeric'}))}<small>${escape(new Date(a.timestamp).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}))}</small></td><td>${escape(MODES.find(m => m.id === a.mode).short || a.mode)}<small>${escape(levelTitle(a.level))}</small></td><td><span class="outcome ${a.outcome}">${a.outcome === 'correct' ? '✓ Correct' : a.outcome === 'revealed' ? '↗ Revealed' : '↳ Practice again'}</span></td></tr>`).join('');
  $('#progress-content').innerHTML = `<section class="progress-panel"><div class="section-heading"><h2>A rhythm of practice.</h2><span class="eyebrow">LAST 28 DAYS / QUESTIONS EXPLORED</span></div><div class="activity-chart">${days.map(d => `<div class="day-column"><div class="day-bar" style="--height:${Math.max(3, d.count/max*100)}%" title="${d.label}: ${d.count} questions" role="img" aria-label="${d.label}: ${d.count} questions"></div></div>`).join('')}</div><div class="chart-labels"><span>${days[0].label}</span><span>Today</span></div></section><div class="progress-tables"><section class="progress-panel"><h2>By module</h2><div class="table-scroll" tabindex="0" role="region" aria-label="Practice statistics by module"><table class="log-table"><thead><tr><th>Module</th><th>Answered</th><th>Accuracy</th><th>Revealed</th></tr></thead><tbody>${rows}</tbody></table></div></section><section class="progress-panel"><h2>Recent signals</h2><div class="table-scroll" tabindex="0" role="region" aria-label="Recent practice questions"><table class="log-table"><thead><tr><th>When</th><th>Exercise / level</th><th>Result</th></tr></thead><tbody>${recent}</tbody></table></div></section></div>`;
}

function renderPitchHistory(mode) {
  $('#pitch-test-history').hidden = mode !== 'all' && mode !== 'pitch';
  if (!saved.pitchTests.length) {
    $('#pitch-test-history').innerHTML = '<section class="progress-panel"><p class="eyebrow">ADAPTIVE PITCH TESTS</p><h2>A closer listen.</h2><p class="muted">Completed 24-question tests will appear here, separate from fixed-level practice.</p><button class="text-button" data-mode="pitch">Try pitch discrimination →</button></section>';
    return;
  }
  const rows = saved.pitchTests.slice().reverse().map(record => {
    const result = summarizePitchTest(testState(record));
    return `<tr><td>${escape(new Date(record.timestamp).toLocaleDateString(undefined,{month:'short',day:'numeric'}))}<small>${escape(new Date(record.timestamp).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}))}</small></td><td>${pitchEstimate(result)}<small>${result.range === 'floor' || result.range === 'ceiling' ? 'Test range reached' : result.range === 'insufficient' ? 'Too few reversals' : 'Practice estimate'}</small></td><td>${result.correctCount} / ${result.trialCount}</td><td>${result.reversalCount}</td></tr>`;
  }).join('');
  $('#pitch-test-history').innerHTML = `<section class="progress-panel"><div class="section-heading"><h2>Pitch discrimination tests</h2><span class="eyebrow">${saved.pitchTests.length} COMPLETED / PURE SINE</span></div><p class="muted small">A separate log for adaptive tests. Level filters apply to fixed practice above. Compare runs with the same listening setup; bounds indicate the test range was reached.</p><div class="table-scroll" tabindex="0" role="region" aria-label="Completed adaptive pitch tests"><table class="log-table"><thead><tr><th>When</th><th>Pitch gap</th><th>Correct</th><th>Reversals</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

const guideExamples = {
  intervals:['Distance, not pitch names.','A perfect fifth spans seven semitones. The same distance keeps its identity when the starting note changes. The eight levels add interval types, descending notes, simultaneous notes, and shorter presentations.','P5 → 7 semitones'],
  chords:['One root. Many colors.','Major uses a major third and perfect fifth; minor lowers the third by a semitone. Diminished and augmented change the fifth. Higher levels add suspended and seventh chords, then inversions.','MAJOR [0, 4, 7] · MINOR [0, 3, 7]'],
  progressions:['Give every chord a home.','Roman numerals describe chords relative to a major key: I is home, IV and V lead away, and vi is the relative minor. A tonic reference plays before each four-chord progression.','I → V → vi → IV'],
  melody:['Shape, then detail.','Listen for repetition and direction, then place the exact pitches on the keys. Every slot is one note; octaves matter. Play your phrase to compare. The key and starting reference are given.','LISTEN → SING → REBUILD'],
  scales:['A family of steps.','Major and natural minor are starting landmarks. Pentatonic scales use five notes. Modes such as Dorian and Mixolydian change the color of familiar step patterns. Later levels add more scales and shorter, ascending-only examples.','MAJOR: W W H W W W H'],
  rhythm:['Silence has a place.','After a four-beat count-in, hear one bar. Levels 1–5 use eight eighth-note cells: 1 & 2 & 3 & 4 &. Levels 6–8 use sixteen sixteenth-note cells: 1 e & a. Later patterns include syncopation and opening rests. Light each cell that has a hit.','● = SOUND · = REST'],
  pitch:['Notice a smaller shift.','Hear two tones and identify whether the second is higher or lower. One semitone is 100 cents. Fixed practice narrows the gap from 200 to 2 cents. The 24-trial adaptive test uses pure sine tones and one listen per trial. Two consecutive correct answers narrow its gap; a miss widens it. Its result is a practice estimate, with bounds when the test range is reached.','100 CENTS = 1 SEMITONE']
};
$('#guide-grid').innerHTML = MODES.map((m,i) => `<article class="guide-card"><span class="guide-number">${String(i+1).padStart(2,'0')} / ${escape(m.short || m.title)}</span><h3>${guideExamples[m.id][0]}</h3><p>${guideExamples[m.id][1]}</p><div class="guide-example">${guideExamples[m.id][2]}</div><details class="level-ladder"><summary>Explore the eight levels</summary>${LEVELS.map(l => `<div class="level-row"><span class="level-badge">${String(l.number).padStart(2,'0')}</span><span>${escape(getLevelDescription(m.id,l.id))}</span></div>`).join('')}</details><button class="text-button" data-mode="${m.id}">Practice this →</button></article>`).join('');
$('#free-keyboard').innerHTML = `<div class="piano-keys">${Array.from({length:13},(_,i) => `<button class="piano-key ${[1,3,6,8,10].includes(i%12) ? 'black' : 'white'}" data-preview="${60+i}" aria-label="Play ${escape(noteName(60+i))}"><span class="key-label">${escape(noteName(60+i))}</span></button>`).join('')}</div>`;

document.addEventListener('click', e => {
  const button = e.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.page) { showPage(button.dataset.page); window.scrollTo({top:0,behavior:'instant'}); }
  else if (button.dataset.mode) setMode(button.dataset.mode);
  else if (button.hasAttribute('data-answer')) submit(button.dataset.answer);
  else if (button.hasAttribute('data-midi')) addNote(Number(button.dataset.midi));
  else if (button.hasAttribute('data-preview')) audio.preview(Number(button.dataset.preview)).catch(() => notify('Audio unavailable. Try again in a browser with Web Audio.'));
  else if (button.hasAttribute('data-slot')) { state.input.splice(Number(button.dataset.slot),1); renderAnswer(); }
  else if (button.hasAttribute('data-step')) {
    const i = Number(button.dataset.step); state.rhythm[i] = !state.rhythm[i]; renderAnswer();
    // Replacing the grid should preserve keyboard focus on the toggled cell.
    $(`[data-step="${i}"]`)?.focus({preventScroll:true});
  } else if (button.dataset.action === 'undo') { state.input.pop(); renderAnswer(); }
  else if (button.dataset.action === 'clear') { state.input = []; state.rhythm.fill(false); renderAnswer(); }
  else if (button.dataset.action === 'check') submit(state.mode === 'melody' ? [...state.input] : [...state.rhythm]);
  else if (button.dataset.action === 'play-mine') {
    const q = state.question;
    const events = state.mode === 'melody'
      ? state.input.map((midi,i) => ({at:i*0.5,duration:0.4,notes:[midi]}))
      : state.rhythm.flatMap((hit,i) => hit ? [{at:i*q.stepDuration,duration:0.09,notes:[76],voice:'click'}] : []);
    if (!events.length) { notify('This grid is all rests. Add a hit to hear your rhythm.'); return; }
    performAudio(combinedEvents(q.reference, fullBar(events, q), q.mode === 'rhythm' ? 0 : 0.45), {message:'PLAYING YOUR ANSWER'});
  } else if (button.id === 'play') playSignal();
  else if (button.id === 'start-pitch-test' || button.id === 'retake-pitch-test') startPitchTest();
  else if (button.id === 'end-pitch-test' || button.id === 'fixed-pitch-practice') { endPitchTest(); newQuestion(); $('#play').focus(); }
  else if (button.id === 'stop') { stopPlayback(); renderAnswer(); }
  else if (button.id === 'reference') performAudio(state.question.reference, {message:state.mode === 'rhythm' ? 'COUNTING IN' : 'PLAYING TONIC'});
  else if (button.id === 'reveal') submit(null,true);
  else if (button.id === 'next') {
    if (state.test?.complete) finishPitchTest();
    else if (!state.test && state.session.round >= 10) finishSet();
    else { newQuestion(); $('#play').focus(); }
  } else if (button.id === 'another-set') { state.session = newSession(); newQuestion(); $('#play').focus(); }
  else if (button.id === 'export-progress') {
    const blob = new Blob([JSON.stringify(saved,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `overtone-progress-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  }
});

$('#level').addEventListener('change', () => {
  if (state.test) endPitchTest();
  state.level = $('#level').value;
  saved.settings.level = state.level;
  state.session = newSession();
  save(); newQuestion();
});
$('#timbre').addEventListener('change', () => {
  stopPlayback(); audio.timbre = $('#timbre').value;
  saved.settings.timbre = audio.timbre; save(); renderAnswer();
});
$('#volume').addEventListener('input', () => { audio.volume = Number($('#volume').value)/100; saved.settings.volume = audio.volume; save(); });
$('#progress-mode').addEventListener('change', renderProgress);
$('#progress-level').addEventListener('change', renderProgress);
$('#import-progress').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    if (file.size > 1_500_000) throw new Error('This file is too large.');
    const data = JSON.parse(await file.text());
    if (data.version !== 1 || !Array.isArray(data.attempts) || data.attempts.length > 2000 || !data.attempts.every(validAttempt)
      || (data.pitchTests !== undefined && (!Array.isArray(data.pitchTests) || data.pitchTests.length > 50 || !data.pitchTests.every(validPitchTest)))) throw new Error('Choose an Overtone version 1 progress backup.');
    // Merge by exact record identity so importing the same backup twice is harmless.
    const map = new Map([...saved.attempts,...data.attempts.map(cleanAttempt)].map(a => [JSON.stringify(a),a]));
    saved.attempts = [...map.values()].sort((a,b) => Date.parse(a.timestamp)-Date.parse(b.timestamp)).slice(-2000);
    const tests = new Map([...saved.pitchTests,...(data.pitchTests || []).map(cleanPitchTest)].map(t => [JSON.stringify(t),t]));
    saved.pitchTests = [...tests.values()].sort((a,b) => Date.parse(a.timestamp)-Date.parse(b.timestamp)).slice(-50);
    save(); renderProgress(); notify('Backup imported. Existing practice has been kept.');
  } catch (error) { notify(`Import failed. ${error.message}`); }
  e.target.value = '';
});

document.addEventListener('keydown', e => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || state.page !== 'practice') return;
  if (e.target.closest('input,select,textarea,a,[contenteditable="true"]')) return;
  // Buttons retain their native Enter/Space behavior when focused.
  if ((e.code === 'Space' || e.key === 'Enter') && e.target.closest('button')) return;
  if (e.code === 'Space') { e.preventDefault(); if (!state.busy && !$('#question-area').hidden) playSignal(); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    if (state.answered && !$('#next').hidden) $('#next').click();
    else $('[data-action="check"]:not(:disabled)')?.click();
  } else if (!state.answered && state.heard && !state.busy) {
    if (/^[1-9]$/.test(e.key) && state.question.choices.length) {
      const choice = state.question.choices[Number(e.key)-1]; if (choice) submit(choice.value);
    } else if (state.mode === 'melody') {
      const i = 'asdfghjkl'.indexOf(e.key.toLowerCase());
      if (i >= 0 && state.question.keyboard[i]) { e.preventDefault(); addNote(state.question.keyboard[i].midi); }
      else if (e.key === 'Backspace') { e.preventDefault(); state.input.pop(); renderAnswer(); }
    }
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopPlayback(); renderAnswer(); }
});
window.addEventListener('pagehide', () => audio.stop());
window.addEventListener('hashchange', () => showPage(location.hash.slice(1)));
newQuestion();
showPage(location.hash.slice(1) || 'practice');
