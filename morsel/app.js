/* MORSEL · the front panel. Words are ingredients. */
(function (global) {
  'use strict';
  const S = global.MorselSchema, $ = id => document.getElementById(id), copy = value => JSON.parse(JSON.stringify(value));
  if (!S || !global.MorselAudio) throw new Error('MORSEL needs its recipe and voice engine before opening.');
  const engine = new global.MorselAudio(), RECOVERY = 'kitchen-morsel-project-v1', MAX_HISTORY = 80;
  let state = S.defaultState(), selectedStep = 0, playingStep = -1, keyboardBase = 48, presetId = '', lastGesture = null, gestureOrdinal = 0, customDurationStep = -1;
  let history = [], future = [], persistTimer = null, warmTimer = null, warmSignature = '', exporting = null, previewGeneration = 0, playing = false, preparing = false, disposed = false;
  const keyStates = new Set(), downKeys = new Map();
  let durationDrag = null;
  const knobDefaults = { tone: .75, air: .03, vibrato: .02, space: .12, volume: .65 };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const controller = () => { if (!global.MorselController) throw new Error('MORSEL is still getting ready. Try again in a moment.'); return global.MorselController; };
  function setStatus(message) { $('status').textContent = String(message || ''); }
  function persist() {
    if (global.MusicLabHost || disposed) return;
    try { localStorage.setItem(RECOVERY, S.serializeProject(state)); }
    catch (_) { /* Portable recipe downloads remain available when browser storage is unavailable. */ }
  }
  function saveLater() { clearTimeout(persistTimer); persistTimer = setTimeout(persist, 220); }
  function notify() {
    global.dispatchEvent(new CustomEvent('morsel:change', { detail: { state: copy(state) } }));
    document.dispatchEvent(new CustomEvent('musiclab:patternchange', { detail: { app: 'morsel' } }));
    global.MusicLabHost?.notifyStateChange?.();
  }
  function replace(next, { remember = true, gesture = null, message = '', keepPreset = false, force = false } = {}) {
    const normalized = S.normalize(next);
    if (JSON.stringify(normalized) === JSON.stringify(state)) { if (message) setStatus(message); return false; }
    if (remember && (!gesture || gesture !== lastGesture)) {
      history.push(copy(state)); if (history.length > MAX_HISTORY) history.shift(); future = [];
    }
    lastGesture = gesture; state = normalized;
    if (!keepPreset) presetId = '';
    selectedStep = Math.max(0, Math.min(state.length - 1, selectedStep));
    engine.setState(state); render(force); saveLater(); notify();
    if (message) setStatus(message);
    return true;
  }
  function change(mutator, options) { const next = copy(state); mutator(next); return replace(next, options); }
  function undo() {
    if (!history.length) return false;
    controller().stop(); future.push(copy(state)); state = history.pop(); lastGesture = null; presetId = '';
    selectedStep = Math.min(selectedStep, state.length - 1); customDurationStep = -1; engine.setState(state); render(true); saveLater(); notify(); setStatus('Previous recipe restored.'); return true;
  }
  function redo() {
    if (!future.length) return false;
    controller().stop(); history.push(copy(state)); state = future.pop(); lastGesture = null; presetId = '';
    selectedStep = Math.min(selectedStep, state.length - 1); customDurationStep = -1; engine.setState(state); render(true); saveLater(); notify(); setStatus('Recipe change restored.'); return true;
  }
  async function loadState(value) {
    const next = S.parseProject(value);
    global.MorselController?.stop(); previewGeneration++; selectedStep = 0; customDurationStep = -1;
    replace(next, { message: 'Recipe ready.', force: true });
    render(true); return copy(state);
  }
  function setInput(id, value, force = false) {
    const element = $(id);
    if (force || document.activeElement !== element) element.value = String(value);
  }
  const percent = value => Math.round(value * 100) + '%';
  const lengthNames = new Map([[.0625, '1/64'], [.125, '1/32'], [.25, '1/16'], [.5, '1/8'], [.75, 'Dotted 1/8'], [1, '1/4'], [1.5, 'Dotted 1/4'], [2, '1/2'], [3, 'Dotted 1/2'], [4, 'Whole'], [8, '2 bars'], [16, '4 bars'], [32, '8 bars']]);
  const roundBeat = value => Number(value.toFixed(4));
  const beatLabel = value => roundBeat(value) + (Math.abs(value - 1) < 1e-7 ? ' beat' : ' beats');
  const lengthBadge = value => (lengthNames.get(value) || roundBeat(value) + 'b').replace('Dotted ', '') + (value === .75 || value === 1.5 || value === 3 ? '.' : '');
  const noteTiming = index => global.MorselSequence.noteTiming(state, index);
  function displayedDuration() {
    const stored = state.steps[selectedStep];
    if (!durationDrag || durationDrag.state !== state || durationDrag.index !== selectedStep || durationDrag.value === null) return { step: stored, timing: noteTiming(selectedStep), draft: false };
    const steps = state.steps.slice(), step = { ...stored, duration: durationDrag.value }; steps[selectedStep] = step;
    return { step, timing: global.MorselSequence.noteTiming({ ...state, steps }, selectedStep), draft: true };
  }
  function renderDuration(display = displayedDuration()) {
    const { step, timing } = display, total = state.length * state.division;
    const actual = roundBeat(timing.duration), start = timing.beat / total * 100, width = timing.duration / total * 100;
    $('durationSummary').textContent = (step.duration === null ? 'Auto · ' : '') + (lengthNames.has(actual) ? lengthNames.get(actual) + ' · ' : '') + beatLabel(actual);
    $('durationRuler').style.setProperty('--step-width', 100 / state.length + '%');
    $('durationRuler').classList.toggle('off', !step.on);
    $('durationStart').style.left = start + '%'; $('durationBar').style.left = start + '%'; $('durationBar').style.width = width + '%';
    $('durationWord').textContent = step.lyric || state.lyric || 'ah';
    const handle = $('durationHandle'); handle.setAttribute('aria-valuenow', String(actual)); handle.setAttribute('aria-valuemax', String(roundBeat(total - timing.beat))); handle.setAttribute('aria-valuetext', beatLabel(actual));
    $('durationHint').textContent = timing.clipped ? 'This note ends at the phrase boundary. Add steps or widen spacing for a longer note.' : step.duration === null ? 'Auto fits the gap before the next word. Choose a note length to set this note independently.' : 'Drag the right edge to change this note’s length. Notes can overlap.';
  }
  function renderStepEditor(force = false) {
    const step = state.steps[selectedStep];
    $('selectedStepNumber').textContent = String(selectedStep + 1).padStart(2, '0'); $('stepOn').checked = step.on;
    setInput('stepLyric', step.lyric, force); setInput('stepPitch', step.pitch, force); setInput('stepVoice', step.voice, force);
    setInput('stepVelocity', step.velocity, force); setInput('stepGate', step.gate, force);
    $('stepVelocityValue').textContent = percent(step.velocity); $('stepGateValue').textContent = percent(step.gate);
    const display = displayedDuration(), duration = display.step.duration, common = [...$('stepDuration').options].some(option => option.value === String(duration));
    setInput('stepDuration', duration === null ? 'auto' : display.draft || customDurationStep === selectedStep || !common ? 'custom' : duration, force);
    setInput('stepDurationBeats', duration === null ? roundBeat(display.timing.duration) : duration, force);
    $('stepDurationBeats').disabled = duration === null; $('stepGateField').hidden = duration !== null;
    renderDuration(display);
  }
  function renderSteps() {
    $('steps').innerHTML = state.steps.slice(0, state.length).map((step, index) => {
      const voice = step.voice === 'inherit' ? state.voice : step.voice;
      const voiceName = S.VOICES.find(item => item.id === voice)?.name || voice;
      const timing = noteTiming(index), duration = timing.duration, durationText = beatLabel(duration);
      return `<div class="word-step${index === selectedStep ? ' selected' : ''}${index === playingStep ? ' playing' : ''}${step.on ? '' : ' off'}" data-step-cell="${index}"><button type="button" class="step-select" data-step="${index}" aria-label="Step ${index + 1}, ${escape(step.lyric || 'keyboard word')}, ${escape(S.noteName(step.pitch))}, ${escape(voiceName)}, ${durationText}${step.on ? '' : ', off'}" aria-pressed="${index === selectedStep}"><span class="step-index">${String(index + 1).padStart(2, '0')}</span><span class="step-word">${escape(step.lyric || '—')}</span><span class="step-note"><span>${escape(S.noteName(step.pitch))}</span><span class="step-length" title="${step.duration === null ? 'Auto: ' : ''}${durationText}${timing.clipped ? '; ends at phrase boundary' : ''}">${lengthBadge(duration)}</span><span class="step-voice-tag">${step.voice === 'inherit' ? '' : escape(voiceName[0].toUpperCase())}</span></span></button><label class="step-toggle" title="Step ${index + 1} on / off"><input type="checkbox" data-step-toggle="${index}" aria-label="Step ${index + 1} on"${step.on ? ' checked' : ''}></label></div>`;
    }).join('');
  }
  function renderKnobs(force = false) {
    for (const key of Object.keys(knobDefaults)) {
      const input = document.querySelector(`[data-knob="${key}"]`), value = state[key];
      if (force || document.activeElement !== input) input.value = String(value);
      input.parentElement.style.setProperty('--angle', (value * 270 - 135) + 'deg');
      $('knob-' + key + '-value').textContent = percent(value);
      input.setAttribute('aria-valuetext', percent(value));
    }
  }
  function render(force = false) {
    setInput('projectName', state.name, force); setInput('phraseInput', state.phrase, force); setInput('tempo', state.tempo, force);
    setInput('sequenceLength', state.length, force); setInput('division', state.division, force); setInput('swing', Math.round(state.swing * 100), force);
    setInput('playLyric', state.lyric, force); $('presetSelect').value = presetId;
    for (const button of $('voices').querySelectorAll('[data-voice]')) {
      const active = button.dataset.voice === state.voice; button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
    }
    for (const button of document.querySelectorAll('[data-sound]')) button.setAttribute('aria-pressed', String(button.dataset.sound === state.lyric));
    $('undoButton').disabled = !history.length; $('redoButton').disabled = !future.length;
    const words = state.steps.slice(0, state.length).filter(step => step.on).length, bars = state.length * state.division / 4;
    $('phraseSummary').textContent = words + (words === 1 ? ' WORD' : ' WORDS') + ' / ' + bars + (bars === 1 ? ' BAR' : ' BARS');
    $('importedNotice').hidden = !state.musicLabPattern;
    renderSteps(); renderStepEditor(force); renderKnobs(force);
    if (!playing) $('position').textContent = String(selectedStep + 1).padStart(2, '0') + ' / ' + state.length;
    if (!presetId) $('presetDescription').textContent = 'Your words. Your melody. Seasoned to taste.';
  }
  function renderKeyboard() {
    const white = [], black = [], blackClasses = [1, 3, 6, 8, 10];
    for (let offset = 0; offset < 24; offset++) {
      const pitch = keyboardBase + offset, sharp = blackClasses.includes(pitch % 12);
      const label = S.noteName(pitch), className = sharp ? 'black' : 'white';
      if (sharp) black.push(`<button type="button" class="piano-key ${className}" data-note="${pitch}" aria-label="Play ${escape(label)}" style="left:${white.length / 14 * 100}%"><span>${escape(label)}</span></button>`);
      else white.push(`<button type="button" class="piano-key ${className}" data-note="${pitch}" aria-label="Play ${escape(label)}"><span>${pitch % 12 === 0 ? escape(label) : ''}</span></button>`);
    }
    $('keyboard').innerHTML = white.join('') + black.join('');
    $('keyboardOctave').textContent = S.noteName(keyboardBase) + ' — ' + S.noteName(keyboardBase + 23);
    $('octaveDown').disabled = keyboardBase <= 36; $('octaveUp').disabled = keyboardBase >= 60;
  }
  function warmKeyboard() {
    clearTimeout(warmTimer);
    warmTimer = setTimeout(async () => {
      if (disposed || !state.lyric.trim()) return;
      const current = state.voice + '\u0000' + state.lyric;
      if (current === warmSignature) return;
      try {
        await engine.prepareNotes({ state: copy(state), events: [{ id: 'keyboard-word', pitch: 60, voice: state.voice, lyric: state.lyric, beat: 0, duration: 1, velocity: .8, probability: 1 }], tempo: state.tempo });
        warmSignature = current;
      } catch (_) { /* An explicit audition reports preparation errors in context. */ }
    }, 350);
  }
  function setKeyActive(pitch, active) {
    for (const key of $('keyboard').querySelectorAll(`[data-note="${pitch}"]`)) key.classList.toggle('active', active);
  }
  async function preview(note, { button, pitch = note.pitch } = {}) {
    if (!(note.lyric ?? state.lyric).trim()) { setStatus('Type a word or sound to hear it.'); $('playLyric').focus(); return; }
    const generation = previewGeneration;
    if (button) button.disabled = true;
    setStatus('Preparing ' + (note.lyric || state.lyric) + '…');
    setKeyActive(pitch, true);
    try {
      await controller().preview(note);
      if (generation === previewGeneration) setStatus((note.lyric || state.lyric) + ' · ' + S.noteName(pitch) + ' · ' + S.VOICES.find(voice => voice.id === (note.voice === 'inherit' || !note.voice ? state.voice : note.voice)).name);
    } catch (error) { if (error.name !== 'AbortError' && generation === previewGeneration) setStatus(error.message); }
    finally { if (button) button.disabled = false; if (!keyStates.has(pitch)) setTimeout(() => setKeyActive(pitch, false), 170); }
  }
  function selectedNote() {
    const step = state.steps[selectedStep], seconds = 60 / state.tempo;
    return { pitch: step.pitch, voice: step.voice === 'inherit' ? state.voice : step.voice, lyric: step.lyric?.trim() ? step.lyric : state.lyric, velocity: step.velocity, durationSeconds: noteTiming(selectedStep).duration * seconds };
  }
  function inputGesture(element) { if (!element._morselGesture) element._morselGesture = 'input-' + ++gestureOrdinal; return element._morselGesture; }
  function bindValue(id, apply, { numeric = false, scale = 1, warm = false, event = 'input' } = {}) {
    const element = $(id);
    element.addEventListener('focus', () => { element._morselGesture = 'input-' + ++gestureOrdinal; });
    element.addEventListener('blur', () => { element._morselGesture = null; lastGesture = null; });
    element.addEventListener(event, () => {
      const value = numeric ? Number(element.value) / scale : element.value;
      if (numeric && (!Number.isFinite(value) || element.value === '')) return;
      change(next => apply(next, value), { gesture: event === 'change' ? null : inputGesture(element), force: event === 'change' });
      if (warm) warmKeyboard();
    });
  }
  function download(blob, filename) {
    if (!(blob instanceof Blob)) throw new Error('The audio renderer did not return a downloadable file.');
    const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function safeFilename(value) { return String(value || 'MORSEL').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 75) || 'MORSEL'; }
  async function exportWav(scope) {
    if (exporting) return;
    const abort = new AbortController(); exporting = abort;
    $('exportPhrase').disabled = $('exportNote').disabled = true; $('cancelExport').hidden = false; setStatus('Preparing your audio…');
    try {
      const result = await controller().exportAudio({ scope, tailSeconds: .35, signal: abort.signal });
      if (abort.signal.aborted) return;
      download(result.blob, safeFilename(result.name || state.name) + '.wav'); setStatus(scope === 'note' ? 'Your selected word is ready to take home.' : 'Your word phrase is ready to take home.');
    } catch (error) { setStatus(error.name === 'AbortError' ? 'Audio export cancelled.' : error.message); }
    finally { if (exporting === abort) exporting = null; $('exportPhrase').disabled = $('exportNote').disabled = false; $('cancelExport').hidden = true; }
  }
  function buildKnobs() {
    $('knobs').innerHTML = Object.keys(knobDefaults).map(key => `<label class="knob" data-key="${key}"><span class="knob-title">${key.toUpperCase()}</span><span class="dial"><span class="dial-marker"></span><input type="range" data-knob="${key}" min="0" max="1" step="0.01" value="${state[key]}" aria-label="${key[0].toUpperCase() + key.slice(1)}" title="Drag up or down; double-click to reset"></span><output id="knob-${key}-value">${percent(state[key])}</output></label>`).join('');
    for (const input of $('knobs').querySelectorAll('[data-knob]')) {
      const key = input.dataset.knob; let pointer = null;
      input.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault(); input.focus(); input.setPointerCapture(event.pointerId); pointer = { id: event.pointerId, y: event.clientY, value: state[key], gesture: 'knob-' + ++gestureOrdinal };
      });
      input.addEventListener('pointermove', event => {
        if (!pointer || event.pointerId !== pointer.id) return;
        const amount = (pointer.y - event.clientY) / (event.shiftKey ? 1000 : 180), value = Math.round(Math.max(0, Math.min(1, pointer.value + amount)) * 100) / 100;
        input.value = String(value); change(next => { next[key] = value; }, { gesture: pointer.gesture });
      });
      const release = event => { if (!pointer || event.pointerId !== pointer.id) return; pointer = null; lastGesture = null; if (input.hasPointerCapture(event.pointerId)) input.releasePointerCapture(event.pointerId); };
      input.addEventListener('pointerup', release); input.addEventListener('pointercancel', release);
      input.addEventListener('input', () => change(next => { next[key] = Number(input.value); }, { gesture: inputGesture(input) }));
      input.addEventListener('keyup', () => { input._morselGesture = null; lastGesture = null; });
      input.addEventListener('blur', () => { input._morselGesture = null; lastGesture = null; });
      input.addEventListener('dblclick', () => { input.value = String(knobDefaults[key]); change(next => { next[key] = knobDefaults[key]; }); });
    }
  }

  const app = {
    getState: () => copy(state), getProject: () => JSON.parse(S.serializeProject(state)), loadState, setState: loadState,
    get engine() { return engine; }, get selectedStep() { return selectedStep; }, undo, redo, setStatus,
    render: () => render(true),
    selectStep(index) { if (!Number.isInteger(index) || index < 0 || index >= state.length) return false; selectedStep = index; render(); return true; }
  };
  global.MorselApp = app;

  for (let pitch = 36; pitch <= 84; pitch++) { const option = document.createElement('option'); option.value = String(pitch); option.textContent = S.noteName(pitch); $('stepPitch').append(option); }
  for (const preset of global.MorselPresets || []) { const option = document.createElement('option'); option.value = preset.id; option.textContent = preset.name; $('presetSelect').append(option); }
  buildKnobs();
  let recovered = false;
  if (!global.MusicLabHost) try { const previous = localStorage.getItem(RECOVERY); if (previous) { state = S.parseProject(previous); recovered = true; } } catch (_) { /* Invalid recovery never replaces the playable starting recipe. */ }
  engine.setState(state); render(true); renderKeyboard();
  if (recovered) setStatus('Recovered your last recipe. Save a copy to keep it.');

  bindValue('projectName', (next, value) => { next.name = value; });
  bindValue('phraseInput', (next, value) => { next.phrase = value; });
  bindValue('playLyric', (next, value) => { next.lyric = value; }, { warm: true, event: 'change' });
  bindValue('tempo', (next, value) => { next.tempo = value; }, { numeric: true, event: 'change' });
  bindValue('swing', (next, value) => { next.swing = value; }, { numeric: true, scale: 100, event: 'change' });
  bindValue('sequenceLength', (next, value) => { next.length = value; }, { numeric: true, event: 'change' });
  bindValue('division', (next, value) => { next.division = value; }, { numeric: true, event: 'change' });
  bindValue('stepLyric', (next, value) => { next.steps[selectedStep].lyric = value; }, { event: 'change' });
  bindValue('stepPitch', (next, value) => { next.steps[selectedStep].pitch = value; }, { numeric: true, event: 'change' });
  bindValue('stepVoice', (next, value) => { next.steps[selectedStep].voice = value; }, { event: 'change' });
  bindValue('stepVelocity', (next, value) => { next.steps[selectedStep].velocity = value; }, { numeric: true });
  bindValue('stepGate', (next, value) => { next.steps[selectedStep].gate = value; }, { numeric: true });
  $('stepDuration').addEventListener('change', event => {
    const value = event.target.value;
    customDurationStep = value === 'custom' ? selectedStep : -1;
    const duration = value === 'auto' ? null : value === 'custom' ? state.steps[selectedStep].duration ?? noteTiming(selectedStep).duration : Number(value);
    change(next => { next.steps[selectedStep].duration = duration; }, { force: true });
    renderStepEditor(true);
    if (value === 'custom') { $('stepDurationBeats').focus(); $('stepDurationBeats').select(); }
  });
  bindValue('stepDurationBeats', (next, value) => { next.steps[selectedStep].duration = value; customDurationStep = selectedStep; }, { numeric: true, event: 'change' });
  $('durationHandle').addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
    durationDrag = { pointer: event.pointerId, index: selectedStep, state, value: null };
  });
  $('durationHandle').addEventListener('pointermove', event => {
    if (!durationDrag || durationDrag.pointer !== event.pointerId || durationDrag.index !== selectedStep || durationDrag.state !== state) return;
    const bounds = $('durationRuler').getBoundingClientRect(), total = state.length * state.division, start = noteTiming(selectedStep).beat;
    const max = Math.min(S.DURATION_RANGE[1], total - start), raw = (event.clientX - bounds.left) / bounds.width * total - start;
    const duration = roundBeat(Math.max(S.DURATION_RANGE[0], Math.min(max, Math.round(raw * 16) / 16)));
    durationDrag.value = duration;
    renderStepEditor(true);
  });
  const releaseDuration = event => {
    if (!durationDrag || durationDrag.pointer !== event.pointerId) return;
    const draft = durationDrag; durationDrag = null; lastGesture = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (event.type === 'pointerup' && draft.index === selectedStep && draft.state === state && draft.value !== null) {
      customDurationStep = selectedStep;
      change(next => { next.steps[draft.index].duration = draft.value; }, { force: true });
    }
    renderStepEditor(true);
  };
  $('durationHandle').addEventListener('pointerup', releaseDuration); $('durationHandle').addEventListener('pointercancel', releaseDuration);
  $('durationHandle').addEventListener('lostpointercapture', releaseDuration);
  $('durationHandle').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const timing = noteTiming(selectedStep), maximum = Math.min(S.DURATION_RANGE[1], state.length * state.division - timing.beat), delta = event.key.startsWith('Page') ? 1 : event.shiftKey ? .25 : .0625;
    const desired = event.key === 'Home' ? S.DURATION_RANGE[0] : event.key === 'End' ? maximum : timing.duration + (['ArrowLeft', 'ArrowDown', 'PageDown'].includes(event.key) ? -delta : delta);
    const duration = roundBeat(Math.max(S.DURATION_RANGE[0], Math.min(maximum, desired)));
    customDurationStep = selectedStep; change(next => { next.steps[selectedStep].duration = duration; });
  });
  $('stepOn').addEventListener('change', event => change(next => { next.steps[selectedStep].on = event.target.checked; }));

  $('voices').addEventListener('click', event => {
    const button = event.target.closest('[data-voice]'); if (!button) return;
    change(next => { next.voice = button.dataset.voice; }, { message: S.VOICES.find(voice => voice.id === button.dataset.voice).name + ' is at the table.' }); warmKeyboard();
  });
  $('steps').addEventListener('click', event => { const button = event.target.closest('[data-step]'); if (button) { selectedStep = Number(button.dataset.step); renderSteps(); renderStepEditor(true); if (!playing) $('position').textContent = String(selectedStep + 1).padStart(2, '0') + ' / ' + state.length; } });
  $('steps').addEventListener('change', event => { const input = event.target.closest('[data-step-toggle]'); if (input) { selectedStep = Number(input.dataset.stepToggle); change(next => { next.steps[selectedStep].on = input.checked; }); } });
  $('steps').addEventListener('keydown', event => {
    const button = event.target.closest('[data-step]'); if (!button || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); const columns = getComputedStyle($('steps')).gridTemplateColumns.split(' ').length;
    const amount = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -columns : columns;
    selectedStep = Math.max(0, Math.min(state.length - 1, Number(button.dataset.step) + amount)); renderSteps(); renderStepEditor(true); $('steps').querySelector(`[data-step="${selectedStep}"]`).focus();
  });
  $('distributeWords').addEventListener('click', () => {
    const words = state.phrase.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { setStatus('Write a few words first, or try ah, ee and oo.'); $('phraseInput').focus(); return; }
    if (words.length > 32) { setStatus('Use up to 32 words in one phrase.'); $('phraseInput').focus(); return; }
    if (words.some(word => word.length > 160)) { setStatus('Keep each word or sound to 160 characters.'); return; }
    selectedStep = 0;
    change(next => {
      if (words.length > next.length) next.length = 32;
      next.steps.slice(0, next.length).forEach(step => { step.on = false; });
      words.forEach((lyric, index) => { const position = Math.floor(index * next.length / words.length); Object.assign(next.steps[position], { on: true, lyric }); });
      delete next.musicLabPattern;
    }, { message: words.length + ' words spread across ' + (words.length > state.length ? 32 : state.length) + ' steps.', force: true });
  });
  $('presetSelect').addEventListener('change', () => {
    const preset = (global.MorselPresets || []).find(item => item.id === $('presetSelect').value); if (!preset) return;
    controller().stop(); selectedStep = 0; customDurationStep = -1; const next = preset.create(); presetId = preset.id;
    replace(next, { keepPreset: true, message: preset.description, force: true }); $('presetDescription').textContent = preset.description; warmKeyboard();
  });
  $('useNativeSequence').addEventListener('click', () => change(next => { delete next.musicLabPattern; }, { message: 'Your original word phrase is ready.' }));
  $('auditionStep').addEventListener('click', () => preview(selectedNote(), { button: $('auditionStep') }));
  $('previewButton').addEventListener('click', () => preview({ pitch: state.steps[selectedStep].pitch, voice: state.voice, lyric: state.lyric, velocity: .8, durationSeconds: 1 }, { button: $('previewButton') }));
  for (const button of document.querySelectorAll('[data-sound]')) button.addEventListener('click', () => {
    change(next => { next.lyric = button.dataset.sound; }, { message: button.dataset.sound + ' is ready on the keyboard.', force: true }); warmKeyboard();
  });
  $('keyboard').addEventListener('pointerdown', event => {
    const button = event.target.closest('[data-note]'); if (!button || event.button !== 0) return;
    event.preventDefault(); button.focus(); const pitch = Number(button.dataset.note); button.setPointerCapture(event.pointerId); keyStates.add(pitch); setKeyActive(pitch, true);
    preview({ pitch, voice: state.voice, lyric: state.lyric, velocity: .85, durationSeconds: 1, source: 'morsel-keyboard-' + ++gestureOrdinal });
  });
  const releasePointer = event => { const button = event.target.closest('[data-note]'); if (!button) return; const pitch = Number(button.dataset.note); keyStates.delete(pitch); setKeyActive(pitch, false); if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId); };
  $('keyboard').addEventListener('pointerup', releasePointer); $('keyboard').addEventListener('pointercancel', releasePointer);
  $('keyboard').addEventListener('click', event => { if (event.detail !== 0) return; const button = event.target.closest('[data-note]'); if (button) preview({ pitch: Number(button.dataset.note), voice: state.voice, lyric: state.lyric, durationSeconds: 1 }); });
  $('octaveDown').addEventListener('click', () => { keyboardBase = Math.max(36, keyboardBase - 12); keyStates.clear(); renderKeyboard(); });
  $('octaveUp').addEventListener('click', () => { keyboardBase = Math.min(60, keyboardBase + 12); keyStates.clear(); renderKeyboard(); });

  async function play() { try { if (playing || preparing) controller().stop(); else await controller().start(); } catch (error) { setStatus(error.message); } }
  $('playButton').addEventListener('click', play);
  $('stopButton').addEventListener('click', () => { previewGeneration++; controller().stop(); setStatus('All words stopped.'); });
  $('panicButton').addEventListener('click', () => { previewGeneration++; controller().panic(); keyStates.clear(); for (const key of $('keyboard').querySelectorAll('.active')) key.classList.remove('active'); });
  $('undoButton').addEventListener('click', undo); $('redoButton').addEventListener('click', redo);
  $('saveButton').addEventListener('click', () => {
    try { download(new Blob([S.serializeProject(state)], { type: 'application/json' }), safeFilename(state.name) + '.morsel.json'); setStatus('Recipe saved, words and all.'); }
    catch (error) { setStatus(error.message); }
  });
  $('openButton').addEventListener('click', () => $('openProjectFile').click());
  $('openProjectFile').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try { if (file.size > S.MAX_PROJECT_BYTES) throw new Error('Choose a MORSEL recipe smaller than 2 MiB.'); await loadState(await file.text()); setStatus('Opened ' + state.name + '.'); }
    catch (error) { setStatus(error.message); }
    finally { event.target.value = ''; }
  });
  $('exportPhrase').addEventListener('click', () => exportWav('phrase')); $('exportNote').addEventListener('click', () => exportWav('note')); $('cancelExport').addEventListener('click', () => exporting?.abort());
  $('helpButton').addEventListener('click', () => $('helpDialog').showModal()); $('closeHelp').addEventListener('click', () => $('helpDialog').close());

  document.addEventListener('morsel:transport', event => {
    const detail = event.detail || {}; playing = detail.playing === true; preparing = detail.preparing === true;
    $('playButton').setAttribute('aria-pressed', String(playing)); $('playLabel').textContent = preparing ? 'Preparing…' : playing ? 'Stop phrase' : 'Play phrase'; $('playGlyph').innerHTML = playing || preparing ? '<svg viewBox="0 0 12 12"><path d="M2 2h8v8H2Z"/></svg>' : '<svg viewBox="0 0 12 12"><path d="M2 1.5 10 6 2 10.5Z"/></svg>';
    $('statusLight').classList.toggle('active', playing); $('statusLight').classList.toggle('preparing', preparing);
    $('transportLabel').textContent = preparing ? 'WORDS WARMING UP' : playing ? 'SERVICE IN PROGRESS' : 'TABLE READY';
    if (Number.isInteger(detail.step)) {
      if (playingStep >= 0) $('steps').querySelector(`[data-step-cell="${playingStep}"]`)?.classList.remove('playing');
      playingStep = detail.step;
      if (playingStep >= 0) { $('steps').querySelector(`[data-step-cell="${playingStep}"]`)?.classList.add('playing'); $('position').textContent = String(playingStep + 1).padStart(2, '0') + ' / ' + state.length; }
      else $('position').textContent = String(selectedStep + 1).padStart(2, '0') + ' / ' + state.length;
    }
    if (detail.message) setStatus(detail.message);
  });
  const computerKeys = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k', 'o', 'l', 'p', ';'];
  global.addEventListener('keydown', event => {
    if ($('helpDialog').open) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
    if (event.key === 'Escape') { event.preventDefault(); previewGeneration++; controller().panic(); return; }
    if (event.target.closest('input,select,textarea,[contenteditable=true]') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) play(); return; }
    const offset = computerKeys.indexOf(event.key.toLowerCase()); if (offset < 0 || event.repeat || downKeys.has(event.code)) return;
    event.preventDefault(); const pitch = keyboardBase + offset; if (pitch > 84) return;
    downKeys.set(event.code, pitch); keyStates.add(pitch); setKeyActive(pitch, true); preview({ pitch, voice: state.voice, lyric: state.lyric, velocity: .85, durationSeconds: 1, source: 'morsel-keyboard-' + ++gestureOrdinal });
  });
  global.addEventListener('keyup', event => { const pitch = downKeys.get(event.code); if (pitch === undefined) return; downKeys.delete(event.code); keyStates.delete(pitch); setKeyActive(pitch, false); });
  global.addEventListener('blur', () => { keyStates.clear(); downKeys.clear(); for (const key of $('keyboard').querySelectorAll('.active')) key.classList.remove('active'); });
  global.addEventListener('pagehide', event => {
    persist(); disposed = !event.persisted; previewGeneration++; clearTimeout(persistTimer); clearTimeout(warmTimer); exporting?.abort();
    const expectedUnload = error => {
      if (error?.name === 'AbortError' || error?.message === 'The instrument has been unloaded.' || error?.name === 'InvalidStateError' && engine.context?.state === 'closed') return;
      throw error;
    };
    try {
      // A cached page keeps its engine for the return trip. A removed editor
      // only releases its resources; ordinary Stop can create a fresh graph.
      const cleanup = event.persisted ? global.MorselController?.stop() : global.MorselController?.dispose ? global.MorselController.dispose() : engine.dispose?.();
      cleanup?.catch?.(expectedUnload);
    } catch (error) { expectedUnload(error); }
  });
})(typeof window === 'object' ? window : globalThis);
