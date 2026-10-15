/* PICNIC's village desk. Scores own notes; the native engine owns every sound. */
(() => {
  'use strict';
  const S = window.PicnicSchema, Q = window.PicnicSequence, L = window.PicnicLibrary;
  const $ = id => document.getElementById(id), clone = value => S.clone(value);
  const hosted = !!window.MusicLabHost || window.parent !== window;
  const storageKey = 'picnic-project-v1', MAX_HISTORY = 40;
  const colors = ['#6b8e6f', '#bb8b57', '#698999', '#c17d60', '#9c8aaa', '#91a170'];
  const softColors = ['#d5e2c9', '#eadcc1', '#d6e3e3', '#edd4c3', '#e5daeb', '#e1e6c9'];
  const icons = ['♪', '♮', '♩', '⋮', '✧', '≈'];
  const shortNames = ['Melody', 'Chords', 'Bass', 'Drums', 'Neighbors', 'Texture'];
  const presets = Array.isArray(L.presets) ? L.presets : Object.entries(L.presets || {}).map(([id, p]) => ({ ...p, id: p.id || id }));
  const presetMap = new Map(presets.map(p => [p.id, p]));
  const libraryBanks = Array.isArray(L.banks) ? L.banks : Object.values(L.banks || {});
  const bankMap = new Map(); libraryBanks.forEach(bank => { bankMap.set(bank.originalBank || bank.id, bank); if (bank.id) bankMap.set(bank.id, bank); });
  const capitalize = text => String(text || '').replace(/^./, c => c.toUpperCase());
  const pct = value => Math.round(value * 100) + '%';
  const hz = value => value >= 1000 ? (value / 1000).toFixed(value < 10000 ? 1 : 0) + ' kHz' : Math.round(value) + ' Hz';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const noteName = value => Q.noteName ? Q.noteName(value) : ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'][value % 12] + (Math.floor(value / 12) - 1);
  let state = S.createDefault(), selectedPart = state.parts[0].id, selectedStep = 0, page = 0;
  let undoStack = [], redoStack = [], gesture = null, recoveryTimer, storageFailed = false;
  let playOperation = 0, loadOperation = 0, syncPromise = null, syncRequested = false;
  let playingStep = -1, playingBank = -1, previewSerial = 0, octave = 4, visiblePresets = 48, renderAbort = null;
  const heldKeys = new Map(), listeners = new Set();
  function status(text, error = false) { $('appStatus').textContent = text; $('appStatus').classList.toggle('error', error); }
  try {
    if (!hosted) {
      const saved = localStorage.getItem(storageKey);
      if (saved) state = S.parseProject(saved);
    }
  } catch (error) { storageFailed = true; status('Your saved score could not open. A fresh picnic is ready; Open can restore a project file.', true); }
  if (!state.banks.some(bank => Object.values(bank.tracks).some(steps => steps.some(step => step.on)))) {
    state = Q.compose(state, { allBanks: true });
  }
  const engine = new window.PicnicAudioEngine({ getState: () => state, onStep(value) {
    if (typeof value === 'number') { playingStep = value; playingBank = state.selectedBank; }
    else if (value) { playingStep = Number.isFinite(value.step) ? value.step : Math.floor((value.beat || 0) * 4) % bank().length; playingBank = value.bank ?? state.selectedBank; }
    paintPlayhead();
  }, onStatus: message => status(String(message)) });
  const part = () => state.parts.find(value => value.id === selectedPart) || state.parts[0];
  const bank = () => state.banks[state.selectedBank];
  const step = () => bank().tracks[selectedPart][selectedStep];
  const partIndex = id => state.parts.findIndex(value => value.id === id);
  function storageNotice() {
    $('storageStatus').textContent = hosted ? 'Your sounds and score travel with the studio project.' : storageFailed ? 'Browser recovery is unavailable. Save a project to keep this song.' : 'Your score is kept in this browser. Save a portable copy, too.';
  }
  function saveRecovery() {
    clearTimeout(recoveryTimer);
    if (hosted) return;
    recoveryTimer = setTimeout(() => {
      try { localStorage.setItem(storageKey, S.serializeProject(state)); storageFailed = false; }
      catch (_) { storageFailed = true; }
      storageNotice();
    }, 500);
  }
  function notify() {
    saveRecovery(); window.MusicLabHost?.notifyStateChange?.();
    document.dispatchEvent(new CustomEvent('musiclab:state-change', { detail: { app: 'picnic' } }));
    for (const listener of listeners) { try { listener(clone(state)); } catch (_) {} }
  }
  async function updateEngine() {
    syncRequested = true;
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
      while (syncRequested) { syncRequested = false; await engine.update(clone(state)); }
    })();
    try { await syncPromise; } finally { syncPromise = null; }
  }
  function queueEngineUpdate() { if (engine.context) updateEngine().catch(error => status(error.message, true)); }
  function remember(previous = state) {
    undoStack.push(clone(previous)); if (undoStack.length > MAX_HISTORY) undoStack.shift(); redoStack = []; renderHistory();
  }
  function renderHistory() { $('undoButton').disabled = !undoStack.length; $('redoButton').disabled = !redoStack.length; }
  function finishGesture() { gesture = null; }
  function mutate(callback, { native = false, message, render = true, history = true } = {}) {
    const before = clone(state), candidate = clone(state);
    try {
      callback(candidate); if (native) delete candidate.musicLabPattern;
      const next = S.normalize(candidate);
      if (JSON.stringify(next) === JSON.stringify(state)) return false;
      if (history) remember(before);
      state = next; selectedStep = Math.min(selectedStep, bank().length - 1); page = Math.floor(selectedStep / 16);
      queueEngineUpdate(); notify(); if (render) renderAll(); if (message) status(message); return true;
    } catch (error) { status(error.message, true); if (render) renderAll(); return false; }
  }
  function editControl(input, callback, { native = false, render = false, after } = {}) {
    const type = input.type;
    if (type === 'range') {
      const begin = () => { if (!gesture || gesture.input !== input) { gesture = { input }; remember(); } };
      input.addEventListener('pointerdown', begin);
      input.addEventListener('keydown', event => { if (event.key.startsWith('Arrow') || ['Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) begin(); });
      input.addEventListener('input', () => { begin(); mutate(candidate => callback(candidate, Number(input.value)), { native, render, history: false }); after?.(); });
      input.addEventListener('change', finishGesture); input.addEventListener('blur', finishGesture); input.addEventListener('pointerup', finishGesture);
    } else input.addEventListener('change', () => { finishGesture(); mutate(candidate => callback(candidate, type === 'checkbox' ? input.checked : ['number'].includes(type) ? Number(input.value) : input.value), { native, render }); after?.(); });
  }
  function setInput(id, value) { const node = $(id); if (document.activeElement !== node) node.value = value; }
  function applyPartColor(element, index) { element.style.setProperty('--part-color', colors[index]); element.style.setProperty('--part-soft', softColors[index]); }
  function renderTransport() {
    const playing = !!engine.isPlaying;
    $('playButton').innerHTML = '<span aria-hidden="true">' + (playing ? 'Ⅱ' : '▶') + '</span> ' + (playing ? 'Pause' : 'Play');
    $('playButton').setAttribute('aria-pressed', String(playing)); $('transportLight').classList.toggle('active', playing);
    setInput('tempoInput', state.tempo); setInput('swingInput', state.swing); $('swingValue').textContent = pct(state.swing);
    if (!playing) $('transportPosition').textContent = 'READY WHEN YOU ARE';
  }
  function renderScore() {
    const b = bank();
    document.querySelectorAll('[data-bank]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.bank) === state.selectedBank)));
    document.querySelectorAll('[data-page]').forEach(button => { button.setAttribute('aria-pressed', String(Number(button.dataset.page) === page)); button.disabled = Number(button.dataset.page) === 1 && b.length === 16; });
    $('patternPages').hidden = b.length === 16;
    setInput('patternLength', b.length); $('chainInput').checked = state.chain;
    $('bankCaption').textContent = (state.musicLabPattern ? 'RECEIVED NOTES · NATIVE GRID IS PARKED' : 'PATTERN ' + b.name + ' · ' + (b.length / 16) + ' ' + (b.length === 16 ? 'BAR' : 'BARS'));
    const grid = $('scoreGrid'); grid.replaceChildren();
    const origin = document.createElement('span'); origin.className = 'step-number'; origin.textContent = 'PART'; grid.append(origin);
    for (let x = 0; x < 16; x++) { const label = document.createElement('span'); label.className = 'step-number' + (x % 4 === 0 ? ' beat-start' : ''); label.textContent = String(page * 16 + x + 1).padStart(2, '0'); grid.append(label); }
    state.parts.forEach((p, row) => {
      const label = document.createElement('button'); label.className = 'part-select' + (p.id === selectedPart ? ' selected' : ''); label.dataset.part = p.id; label.setAttribute('aria-label', 'Select ' + shortNames[row] + ' part'); label.setAttribute('aria-pressed', String(p.id === selectedPart)); applyPartColor(label, row);
      label.innerHTML = '<span aria-hidden="true">' + icons[row] + '</span><span>' + shortNames[row] + '</span>'; grid.append(label);
      for (let x = 0; x < 16; x++) {
        const index = page * 16 + x, value = b.tracks[p.id][index], button = document.createElement('button');
        button.className = 'score-step' + (value.on ? ' on' : '') + (p.id === selectedPart && index === selectedStep ? ' selected' : ''); button.dataset.part = p.id; button.dataset.step = String(index); button.disabled = index >= b.length;
        button.setAttribute('aria-label', shortNames[row] + ', step ' + (index + 1) + ', ' + (value.on ? 'on' : 'off') + ', ' + value.notes.map(noteName).join(' ') + ', velocity ' + pct(value.velocity) + ', chance ' + pct(value.probability)); button.setAttribute('aria-pressed', String(value.on));
        button.title = shortNames[row] + ' · Step ' + (index + 1) + '\n' + (value.notes.map(noteName).join(' · ') || 'No notes') + '\nShift-click to inspect';
        applyPartColor(button, row); button.style.setProperty('--velocity', String(value.velocity));
        if (value.on) { button.append(document.createTextNode(value.notes.length > 1 ? value.notes.length + '♪' : value.notes.length ? noteName(value.notes[0]) : '·')); if (value.ratchet > 1) button.insertAdjacentHTML('beforeend', '<span class="step-ratchet">×' + value.ratchet + '</span>'); if (value.probability < 1) button.insertAdjacentHTML('beforeend', '<span class="step-chance">·</span>'); }
        grid.append(button);
      }
    });
    renderInspector(); paintPlayhead();
  }
  function paintPlayhead() {
    $('scoreGrid').querySelectorAll('.score-step.playing').forEach(button => button.classList.remove('playing'));
    if (engine.isPlaying && playingBank === state.selectedBank && playingStep >= 0) {
      $('scoreGrid').querySelectorAll('.score-step[data-step="' + playingStep + '"]').forEach(button => button.classList.add('playing'));
      $('transportPosition').textContent = String.fromCharCode(65 + Math.max(0, playingBank)) + ' / ' + String(Math.floor(playingStep / 4) + 1).padStart(2, '0') + ' : ' + (playingStep % 4 + 1);
    }
  }
  function renderInspector() {
    const value = step(); $('stepTitle').textContent = shortNames[partIndex(selectedPart)] + ' · Step ' + String(selectedStep + 1).padStart(2, '0');
    $('stepOn').checked = value.on; setInput('stepNotes', value.notes.join(', ')); setInput('stepVelocity', value.velocity); setInput('stepGate', value.gate); setInput('stepProbability', Math.round(value.probability * 100)); setInput('stepRatchet', value.ratchet); setInput('stepOffset', value.offset);
  }
  function renderComposition() {
    setInput('songName', state.name); setInput('keySelect', state.key); setInput('scaleSelect', state.scale); setInput('hourInput', state.hour); setInput('seasonSelect', state.season); setInput('weatherSelect', state.weather); setInput('seedInput', state.seed); setInput('chordProgression', bank().chords.join(', '));
    const time = state.hour < 5 || state.hour >= 21 ? 'night' : state.hour < 12 ? 'morning' : state.hour < 17 ? 'afternoon' : 'evening';
    $('dayReadout').textContent = (state.weather === 'clear' ? 'A clear ' : state.weather === 'cloudy' ? 'A cloudy ' : state.weather === 'rain' ? 'A rainy ' : 'A snowy ') + state.season + ' ' + time;
    $('weatherGlyph').textContent = state.weather === 'rain' ? '☂' : state.weather === 'snow' ? '❄' : state.weather === 'cloudy' ? '☁' : time === 'night' ? '☾' : '☀';
    $('postmark').innerHTML = String(state.hour).padStart(2, '0') + ':00<br>' + state.season.toUpperCase();
    document.querySelector('.village-header').classList.toggle('night', time === 'night'); document.querySelector('.village-header').classList.toggle('rain', state.weather === 'rain'); document.querySelector('.village-header').classList.toggle('snow', state.weather === 'snow');
    $('densityValue').textContent = pct(Number($('densityInput').value));
  }
  function renderPartTabs() {
    $('soundPartTabs').innerHTML = state.parts.map((p, index) => '<button data-sound-part="' + p.id + '" aria-pressed="' + (selectedPart === p.id) + '">' + escape(shortNames[index]) + '</button>').join('');
  }
  function presetCollection(p) { return p.bankName || bankMap.get(p.originalBank || p.bank)?.name || p.originalBank?.replace(/^BANK_|\.sf2$/gi, '').replace(/_/g, ' ') || p.category || 'Village collection'; }
  function matchesCollection(p, collection) { return p.originalBank === collection || p.bank === collection || p.bankId === collection; }
  function aliasesFor(p) { return (p.aliases || []).map(alias => typeof alias === 'string' ? { name: alias } : alias); }
  function presetPresentation(p, collection) { return collection !== 'all' ? aliasesFor(p).find(alias => matchesCollection(alias, collection)) || p : p; }
  function renderSound() {
    const p = part(), index = partIndex(p.id), preset = presetMap.get(p.presetId);
    renderPartTabs(); $('selectedPartIcon').textContent = icons[index]; $('selectedPartLabel').textContent = shortNames[index].toUpperCase(); $('selectedPresetName').textContent = preset?.name || 'Choose a sound'; $('selectedPresetBank').textContent = preset ? presetCollection(preset) : '';
    applyPartColor(document.querySelector('.current-sound'), index);
    for (const [id, key] of [['soundTranspose','transpose'],['soundAttack','attack'],['soundRelease','release'],['soundCutoff','cutoff'],['soundReverb','reverb'],['soundDelay','delay']]) setInput(id, p[key]);
    renderSoundReadouts(); $('pianoTitle').textContent = 'Play the ' + shortNames[index].toLowerCase() + '.';
    renderPresets();
  }
  function renderSoundReadouts() {
    const p = part(); $('soundAttackValue').textContent = p.attack < 1 ? Math.round(p.attack * 1000) + ' ms' : p.attack.toFixed(2) + ' s'; $('soundReleaseValue').textContent = p.release.toFixed(2) + ' s'; $('soundCutoffValue').textContent = hz(p.cutoff); $('soundReverbValue').textContent = pct(p.reverb); $('soundDelayValue').textContent = pct(p.delay);
  }
  function renderPresets() {
    const search = $('presetSearch').value.trim().toLowerCase(), category = $('presetCategory').value, collection = $('presetBank').value;
    const filtered = presets.filter(p => (category === 'all' || p.category === category) && (collection === 'all' || matchesCollection(p, collection) || aliasesFor(p).some(alias => matchesCollection(alias, collection))) && (!search || [p.name, p.category, p.originalBank, presetCollection(p), ...aliasesFor(p).flatMap(alias => [alias.name, alias.originalBank, alias.bank, alias.sourcePresetName, presetCollection(alias)])].join(' ').toLowerCase().includes(search)));
    $('searchCount').textContent = filtered.length + ' ' + (filtered.length === 1 ? 'sound' : 'sounds') + ' on the shelves'; $('noPresets').hidden = filtered.length > 0; $('morePresetsButton').hidden = filtered.length <= visiblePresets;
    $('presetList').innerHTML = filtered.slice(0, visiblePresets).map(p => { const shown = presetPresentation(p, collection); return '<article class="preset-card' + (p.id === part().presetId ? ' selected' : '') + '" data-preset="' + escape(p.id) + '"><button class="preset-choose" data-preset="' + escape(p.id) + '" aria-pressed="' + (p.id === part().presetId) + '" title="Choose ' + escape(shown.name) + '"><strong>' + escape(shown.name) + '</strong><small>' + escape(presetCollection(shown)) + '</small></button><button class="preset-audition" data-audition="' + escape(p.id) + '" aria-label="Load and audition ' + escape(shown.name) + '" title="Load this sound and hear it">♫</button></article>'; }).join('');
  }
  function renderMixer() {
    $('mixerGrid').innerHTML = state.parts.map((p, index) => '<div class="mixer-row" style="--part-color:' + colors[index] + '"><button class="mixer-part" data-mixer-part="' + p.id + '" title="Select ' + shortNames[index] + '"><span aria-hidden="true">' + icons[index] + '</span>' + shortNames[index] + '</button><label class="mixer-level"><span>LEVEL <output data-level-readout="' + p.id + '">' + pct(p.level) + '</output></span><input type="range" data-level="' + p.id + '" min="0" max="1" step="0.01" value="' + p.level + '" aria-label="' + shortNames[index] + ' level"></label><label class="mixer-pan"><span>PAN <output data-pan-readout="' + p.id + '">' + panName(p.pan) + '</output></span><input type="range" data-pan="' + p.id + '" min="-1" max="1" step="0.01" value="' + p.pan + '" aria-label="' + shortNames[index] + ' pan"></label><button class="mix-switch" data-mute="' + p.id + '" aria-label="Mute ' + shortNames[index] + '" aria-pressed="' + p.mute + '">M</button><button class="mix-switch solo" data-solo="' + p.id + '" aria-label="Solo ' + shortNames[index] + '" aria-pressed="' + p.solo + '">S</button></div>').join('');
    $('mixerGrid').querySelectorAll('[data-level],[data-pan]').forEach(input => {
      const key = input.hasAttribute('data-level') ? 'level' : 'pan', id = input.dataset[key];
      editControl(input, (candidate, value) => { candidate.parts.find(p => p.id === id)[key] = value; }, { after() { const value = state.parts.find(p => p.id === id)[key]; $('mixerGrid').querySelector('[data-' + key + '-readout="' + id + '"]').textContent = key === 'level' ? pct(value) : panName(value); } });
    });
    for (const [id, key] of [['masterLevel','level'],['masterReverb','reverb'],['masterDelay','delay'],['masterTone','tone']]) setInput(id, state.master[key]); renderMasterReadouts();
  }
  function panName(value) { return Math.abs(value) < .02 ? 'C' : Math.round(Math.abs(value) * 100) + (value < 0 ? ' L' : ' R'); }
  function renderMasterReadouts() { for (const [id, key] of [['masterLevel','level'],['masterReverb','reverb'],['masterDelay','delay'],['masterTone','tone']]) $(id + 'Value').textContent = key === 'tone' ? hz(state.master[key]) : pct(state.master[key]); }
  function renderAll() { renderHistory(); renderTransport(); renderScore(); renderComposition(); renderSound(); renderMixer(); storageNotice(); }
  function selectPart(id) {
    if (!state.parts.some(p => p.id === id)) return;
    releaseKeyboard(); selectedPart = id; renderScore(); renderSound(); renderPianoActivity();
  }
  function parseNotes(text) {
    const pieces = text.trim().split(/[\s,;]+/).filter(Boolean);
    if (pieces.length > 6) throw new Error('A step can hold up to six notes.');
    const result = pieces.map(piece => {
      if (/^\d+$/.test(piece)) return Number(piece);
      const match = /^([a-g])([#♯b♭]?)(-?\d)$/i.exec(piece); if (!match) throw new Error('Write MIDI numbers (60, 64, 67) or note names (C4, E4, G4).');
      return (Number(match[3]) + 1) * 12 + ({ C:0, D:2, E:4, F:5, G:7, A:9, B:11 })[match[1].toUpperCase()] + (['#','♯'].includes(match[2]) ? 1 : ['b','♭'].includes(match[2]) ? -1 : 0);
    });
    if (result.some(note => !Number.isInteger(note) || note < 0 || note > 127)) throw new Error('Choose notes from MIDI 0 through 127.');
    if (new Set(result).size !== result.length) throw new Error('Each note needs to appear only once in a step.');
    return result;
  }
  function choosePreset(id) { if (!presetMap.has(id)) return; mutate(candidate => { candidate.parts.find(p => p.id === selectedPart).presetId = id; }, { message: presetMap.get(id).name + ' has joined the ' + shortNames[partIndex(selectedPart)].toLowerCase() + ' part.' }); }
  async function prepare() { await engine.init(); await updateEngine(); if (engine.context?.state === 'suspended') await engine.context.resume(); return true; }
  async function play(options = {}) {
    const operation = ++playOperation;
    try { await prepare(); if (operation !== playOperation) return false; const result = await engine.play(options); if (operation !== playOperation) { engine.stop(); return false; } renderTransport(); status('A little music for the neighborhood.'); return result; }
    catch (error) { if (operation === playOperation) { status(error.message, true); renderTransport(); } throw error; }
  }
  function stop() { ++playOperation; engine.stop(); releaseKeyboard(); playingStep = playingBank = -1; paintPlayhead(); renderTransport(); status('Taking a little breather. The notes are right where you left them.'); }
  function panic() { ++playOperation; releaseKeyboard(); engine.panic(); playingStep = playingBank = -1; paintPlayhead(); renderTransport(); status('A quiet moment. Every note has been silenced.'); }
  async function loadState(value, { history = true } = {}) {
    const next = S.parseProject(value), operation = ++loadOperation;
    finishGesture(); if (history) remember(); panic(); renderAbort?.abort(); state = next;
    selectedPart = state.parts.some(p => p.id === selectedPart) ? selectedPart : state.parts[0].id; selectedStep = 0; page = 0;
    renderAll(); notify(); if (engine.context) await updateEngine(); if (operation === loadOperation) status('“' + state.name + '” is open. Everyone is here.'); return clone(state);
  }
  async function setTempo(value) {
    if (!Number.isFinite(value) || value < 40 || value > 240) throw new Error('Choose a tempo between 40 and 240 BPM.');
    state = S.normalize({ ...state, tempo: value }); engine.setTempo(value); setInput('tempoInput', value); notify(); return true;
  }
  async function previewNotes(notes, { voice = selectedPart, velocity = .75, duration = .55 } = {}) {
    const operation = playOperation, source = 'picnic-preview-' + (++previewSerial);
    try { await prepare(); if (operation !== playOperation) return; const when = engine.context.currentTime + .015; notes.forEach((pitch, index) => engine.scheduleNote({ id: source + ':' + index, voice, pitch, velocity, when, durationSeconds: duration, source })); }
    catch (error) { status(error.message, true); }
  }
  function auditionPart() {
    const p = part(), id = p.id, key = state.key, preset = presetMap.get(p.presetId);
    const wanted = id === 'chords' || id === 'texture' ? [60 + key, 64 + key, 67 + key] : id === 'bass' ? [36 + key] : id === 'drums' ? [36] : [60 + key];
    // Audition chooses a mapped note; playback never changes a score to fit a sound.
    // The engine applies transpose once, so check coverage after that transpose.
    const transpose = p.transpose || 0, preferredVelocity = Math.round(.75 * 127);
    const regions = (preset?.regions || []).filter(region => Math.max(region.key?.[0] ?? 0, transpose, 0) <= Math.min(region.key?.[1] ?? 127, 127 + transpose, 127) && (region.velocity?.[1] ?? 127) >= 1 && region.gain !== 0);
    const pitchCovered = (region, pitch) => pitch + transpose >= (region.key?.[0] ?? 0) && pitch + transpose <= (region.key?.[1] ?? 127);
    const velocityCovered = (region, velocity) => velocity >= (region.velocity?.[0] ?? 0) && velocity <= (region.velocity?.[1] ?? 127);
    const region = regions.find(r => wanted.some(pitch => pitchCovered(r, pitch)) && velocityCovered(r, preferredVelocity)) || regions.find(r => wanted.some(pitch => pitchCovered(r, pitch))) || regions.find(r => velocityCovered(r, preferredVelocity)) || regions[0];
    if (!region) { status('This sound has no playable note at the current transpose. Choose another octave or sound.', true); return; }
    const midiVelocity = Math.max(1, region.velocity?.[0] ?? 0, Math.min(region.velocity?.[1] ?? 127, preferredVelocity));
    let notes = wanted.filter(pitch => regions.some(r => pitchCovered(r, pitch) && velocityCovered(r, midiVelocity)));
    if (!notes.length) { const low = Math.max(region.key?.[0] ?? 0, transpose, 0), high = Math.min(region.key?.[1] ?? 127, 127 + transpose, 127); notes = [Math.round(Math.max(low, Math.min(high, region.root ?? low))) - transpose]; }
    return previewNotes(notes, { voice: id, velocity: midiVelocity / 127, duration: id === 'texture' ? 1 : .6 });
  }
  async function keyDown(key, pitch) {
    if (heldKeys.has(key)) return;
    const source = 'picnic-key-' + key + ':' + (++previewSerial), entry = { source, pitch, voice: selectedPart, operation: playOperation }; heldKeys.set(key, entry); renderPianoActivity();
    try { await prepare(); if (heldKeys.get(key) !== entry || entry.operation !== playOperation) return; engine.scheduleNote({ id: source, source, pitch, voice: entry.voice, velocity: .8, when: engine.context.currentTime + .008, durationSeconds: 30 }); }
    catch (error) { heldKeys.delete(key); renderPianoActivity(); status(error.message, true); }
  }
  function keyUp(key) { const entry = heldKeys.get(key); if (!entry) return; heldKeys.delete(key); engine.cancelNotes({ source: entry.source }); renderPianoActivity(); }
  function releaseKeyboard() { for (const key of [...heldKeys.keys()]) keyUp(key); }
  function renderPiano() {
    releaseKeyboard(); const root = (octave + 1) * 12, keys = $('pianoKeys'); keys.replaceChildren(); const whiteOffsets = [0,2,4,5,7,9,11,12,14,16,17,19,21,23];
    for (let i = 0; i < 24; i++) {
      const pitch = root + i, black = [1,3,6,8,10].includes(i % 12), button = document.createElement('button'); button.className = 'piano-key' + (black ? ' black' : ''); button.dataset.note = pitch; button.setAttribute('aria-label', 'Play ' + noteName(pitch)); button.textContent = noteName(pitch); button.type = 'button';
      if (black) { const preceding = whiteOffsets.filter(offset => offset < i).length; button.style.left = (preceding / 14 * 100 - 2.05) + '%'; }
      button.addEventListener('pointerdown', event => { if (event.button && event.pointerType === 'mouse') return; event.preventDefault(); button.setPointerCapture(event.pointerId); keyDown('pointer:' + event.pointerId, pitch); });
      for (const name of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(name, event => keyUp('pointer:' + event.pointerId));
      button.addEventListener('keydown', event => { if ([' ', 'Enter'].includes(event.key) && !event.repeat) { event.preventDefault(); keyDown('button:' + pitch, pitch); } }); button.addEventListener('keyup', event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); keyUp('button:' + pitch); } });
      keys.append(button);
    }
    $('pianoOctave').textContent = 'C' + octave + '–B' + (octave + 1);
  }
  function renderPianoActivity() { const notes = new Set([...heldKeys.values()].map(entry => entry.pitch)); $('pianoKeys').querySelectorAll('[data-note]').forEach(button => button.classList.toggle('active', notes.has(Number(button.dataset.note)))); }
  function wav(pcm, sampleRate) {
    if (Object.prototype.toString.call(pcm) !== '[object Float32Array]' || !pcm.length || pcm.length % 2 || !Number.isInteger(sampleRate)) throw new Error('The audio renderer returned an incomplete stereo song.');
    const bytes = new ArrayBuffer(44 + pcm.length * 2), view = new DataView(bytes); const tag = (at, value) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
    tag(0,'RIFF'); view.setUint32(4,36 + pcm.length * 2,true); tag(8,'WAVE'); tag(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,2,true); view.setUint32(24,sampleRate,true); view.setUint32(28,sampleRate * 4,true); view.setUint16(32,4,true); view.setUint16(34,16,true); tag(36,'data'); view.setUint32(40,pcm.length * 2,true);
    for (let i = 0; i < pcm.length; i++) { if (!Number.isFinite(pcm[i])) throw new Error('The audio renderer returned a nonfinite sample.'); const v = Math.min(1,Math.max(-1,pcm[i])); view.setInt16(44 + i * 2,Math.round(v * (v < 0 ? 32768 : 32767)),true); }
    return new Blob([bytes], { type: 'audio/wav' });
  }
  async function exportAudio({ scope = 'pattern', bars = 4, tailSeconds = 0, signal } = {}) {
    if (scope !== 'pattern' && scope !== 'phrase') throw new Error('Choose the current pattern export.');
    if (!Number.isInteger(bars) || bars < 1 || bars > 16 || !Number.isFinite(tailSeconds) || tailSeconds < 0 || tailSeconds > 30) throw new Error('Choose 1–16 bars and a tail of 0–30 seconds.');
    if (signal?.aborted) throw new DOMException('Audio export cancelled.', 'AbortError');
    const snapshot = clone(state), lengthBeats = bars * 4, duration = lengthBeats * 60 / snapshot.tempo + tailSeconds;
    if (duration > 120) throw new Error('Keep the song and its tail within two minutes. Choose fewer bars or a shorter tail.');
    const events = Q.events(snapshot, { startBeat: 0, lengthBeats });
    const result = await engine.renderNotes({ state: snapshot, events, tempo: snapshot.tempo, lengthBeats, tailSeconds, signal });
    if (signal?.aborted) throw new DOMException('Audio export cancelled.', 'AbortError');
    return { ...result, blob: wav(result.pcm, result.sampleRate), channels: 2, name: snapshot.name, tempo: snapshot.tempo, bars, duration, sourceApp: 'picnic', sourceLabel: 'PICNIC' };
  }
  function download(blob, name) { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 15000); }
  function fileName(suffix) { return 'PICNIC-' + (state.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0,70) || 'afternoon') + suffix; }
  function openDialog(id) { const dialog = $(id); if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); }

  // Persistent editing controls. Range gestures make one Undo entry each.
  editControl($('songName'), (candidate, value) => { candidate.name = value.trim(); });
  $('tempoInput').addEventListener('change', () => { const value = Number($('tempoInput').value); if (!Number.isFinite(value) || value < 40 || value > 240) { status('Choose a tempo between 40 and 240 BPM.', true); setInput('tempoInput', state.tempo); return; } remember(); setTempo(value).catch(error => status(error.message, true)); });
  editControl($('swingInput'), (candidate, value) => { candidate.swing = value; }, { after: renderTransport });
  $('bankButtons').addEventListener('click', event => { const button = event.target.closest('[data-bank]'); if (!button) return; selectedStep = 0; page = 0; mutate(candidate => { candidate.selectedBank = Number(button.dataset.bank); }, { native: true }); });
  $('patternPages').addEventListener('click', event => { const button = event.target.closest('[data-page]'); if (!button || button.disabled) return; page = Number(button.dataset.page); selectedStep = page * 16 + selectedStep % 16; renderScore(); });
  editControl($('patternLength'), (candidate, value) => { candidate.banks[candidate.selectedBank].length = Number(value); }, { native: true, render: true });
  editControl($('chainInput'), (candidate, value) => { candidate.chain = value; }, { native: true, render: true });
  $('scoreGrid').addEventListener('click', event => {
    const label = event.target.closest('.part-select'); if (label) { selectPart(label.dataset.part); return; }
    const button = event.target.closest('.score-step'); if (!button || button.disabled) return; selectedPart = button.dataset.part; selectedStep = Number(button.dataset.step);
    if (!event.shiftKey) mutate(candidate => { const value = candidate.banks[candidate.selectedBank].tracks[selectedPart][selectedStep]; value.on = !value.on; if (value.on && !value.notes.length) value.notes = [selectedPart === 'drums' ? 36 : selectedPart === 'bass' ? 36 + state.key : 60 + state.key]; }, { native: true });
    else { renderScore(); renderSound(); }
  });
  $('scoreGrid').addEventListener('contextmenu', event => { const button = event.target.closest('.score-step'); if (!button) return; event.preventDefault(); selectedPart = button.dataset.part; selectedStep = Number(button.dataset.step); renderScore(); renderSound(); $('stepNotes').focus(); });
  for (const [id, key, transform] of [['stepOn','on',v=>v],['stepNotes','notes',parseNotes],['stepVelocity','velocity',Number],['stepGate','gate',Number],['stepProbability','probability',v=>Number(v)/100],['stepRatchet','ratchet',Number],['stepOffset','offset',Number]]) {
    editControl($(id), (candidate, value) => { candidate.banks[candidate.selectedBank].tracks[selectedPart][selectedStep][key] = transform(value); }, { native: true, render: true });
  }
  $('clearPartButton').addEventListener('click', () => mutate(candidate => { candidate.banks[candidate.selectedBank].tracks[selectedPart].forEach(value => { value.on = false; }); }, { native: true, message: 'A fresh page for the ' + shortNames[partIndex(selectedPart)].toLowerCase() + '. Undo brings every note back.' }));
  $('copyBankButton').addEventListener('click', () => mutate(candidate => { const target = (candidate.selectedBank + 1) % 4, name = candidate.banks[target].name; candidate.banks[target] = clone(candidate.banks[candidate.selectedBank]); candidate.banks[target].name = name; }, { native: true, message: 'This pattern is copied to the next bank. Undo restores its previous notes.' }));
  for (const [id, key] of [['keySelect','key'],['scaleSelect','scale'],['hourInput','hour'],['seasonSelect','season'],['weatherSelect','weather'],['seedInput','seed']]) editControl($(id), (candidate, value) => { candidate[key] = ['key','hour','seed'].includes(key) ? Number(value) : value; }, { render: true });
  editControl($('chordProgression'), (candidate, value) => { candidate.banks[candidate.selectedBank].chords = value.split(',').map(v => v.trim()).filter(Boolean); }, { render: true });
  $('densityInput').addEventListener('input', () => { $('densityValue').textContent = pct(Number($('densityInput').value)); });
  function compose(allBanks, seed = state.seed) {
    finishGesture(); const before = clone(state);
    try { const source = clone(state); source.seed = seed; const next = Q.compose(source, { allBanks, seed, density: Number($('densityInput').value) }); remember(before); state = S.normalize(next); delete state.musicLabPattern; queueEngineUpdate(); notify(); renderAll(); status(allBanks ? 'Four original patterns, ready for a little walk. Undo restores your previous score.' : 'A new little phrase. Every note is yours to change.'); }
    catch (error) { status(error.message, true); }
  }
  $('composeButton').addEventListener('click', () => compose(false)); $('composeAllButton').addEventListener('click', () => compose(true));
  $('newSeedButton').addEventListener('click', () => { const words = new Uint32Array(1); if (window.crypto?.getRandomValues) crypto.getRandomValues(words); else words[0] = Date.now() >>> 0; compose(false, words[0]); });
  $('soundPartTabs').addEventListener('click', event => { const button = event.target.closest('[data-sound-part]'); if (button) selectPart(button.dataset.soundPart); });
  for (const [id, key] of [['soundTranspose','transpose'],['soundAttack','attack'],['soundRelease','release'],['soundCutoff','cutoff'],['soundReverb','reverb'],['soundDelay','delay']]) editControl($(id), (candidate, value) => { candidate.parts.find(p => p.id === selectedPart)[key] = value; }, { after: renderSoundReadouts });
  for (const id of ['presetSearch','presetCategory','presetBank']) $(id).addEventListener(id === 'presetSearch' ? 'input' : 'change', () => { visiblePresets = 48; renderPresets(); });
  $('presetList').addEventListener('click', event => { const choose = event.target.closest('[data-preset]'), audition = event.target.closest('[data-audition]'); if (audition) { choosePreset(audition.dataset.audition); auditionPart(); } else if (choose) choosePreset(choose.dataset.preset); });
  $('morePresetsButton').addEventListener('click', () => { visiblePresets += 48; renderPresets(); });
  $('auditionPartButton').addEventListener('click', auditionPart); $('auditionStepButton').addEventListener('click', () => previewNotes(step().notes, { velocity: step().velocity, duration: Math.max(.08, step().gate * 15 / state.tempo) }));
  $('mixerGrid').addEventListener('click', event => { const select = event.target.closest('[data-mixer-part]'); if (select) return selectPart(select.dataset.mixerPart); const button = event.target.closest('[data-mute],[data-solo]'); if (!button) return; const key = button.hasAttribute('data-mute') ? 'mute' : 'solo'; mutate(candidate => { const p = candidate.parts.find(p => p.id === button.dataset[key]); p[key] = !p[key]; }); });
  for (const [id, key] of [['masterLevel','level'],['masterReverb','reverb'],['masterDelay','delay'],['masterTone','tone']]) editControl($(id), (candidate, value) => { candidate.master[key] = value; }, { after: renderMasterReadouts });
  $('playButton').addEventListener('click', () => { if (engine.isPlaying) stop(); else play().catch(() => {}); }); $('stopButton').addEventListener('click', stop); $('panicButton').addEventListener('click', panic);
  async function undo() { if (!undoStack.length) return; finishGesture(); const previous = undoStack.pop(); redoStack.push(clone(state)); await loadState(previous, { history: false }); status('One step back. The previous idea is safe.'); }
  async function redo() { if (!redoStack.length) return; finishGesture(); const next = redoStack.pop(); undoStack.push(clone(state)); await loadState(next, { history: false }); status('That idea is back on the table.'); }
  $('undoButton').addEventListener('click', () => undo().catch(error => status(error.message, true))); $('redoButton').addEventListener('click', () => redo().catch(error => status(error.message, true)));
  $('saveButton').addEventListener('click', () => { try { download(new Blob([S.serializeProject(state)], { type: 'application/json' }), fileName('.picnic.json')); status('Your whole picnic, packed into a project file.'); } catch (error) { status(error.message, true); } });
  $('openButton').addEventListener('click', () => { $('projectFile').value = ''; $('projectFile').click(); });
  $('projectFile').addEventListener('change', async () => { const file = $('projectFile').files[0]; if (!file) return; try { if (file.size > 2 * 1024 * 1024) throw new Error('Choose a PICNIC project smaller than 2 MiB.'); await loadState(await file.text()); } catch (error) { status(error.message, true); } finally { $('projectFile').value = ''; } });
  $('octaveDown').addEventListener('click', () => { octave = Math.max(0, octave - 1); renderPiano(); }); $('octaveUp').addEventListener('click', () => { octave = Math.min(7, octave + 1); renderPiano(); });
  $('exportButton').addEventListener('click', () => { $('exportStatus').textContent = ''; openDialog('exportDialog'); });
  $('renderWavButton').addEventListener('click', async () => { if (renderAbort) return; const controller = new AbortController(); renderAbort = controller; $('renderWavButton').disabled = true; $('exportStatus').textContent = 'Making a stereo postcard. You can close this window to cancel.'; try { const result = await exportAudio({ bars: Number($('exportBars').value), tailSeconds: Number($('exportTail').value), signal: controller.signal }); if (controller.signal.aborted) return; download(result.blob, fileName('.wav')); $('exportStatus').textContent = 'Your song is ready. Stereo, 16-bit WAV.'; } catch (error) { if (error.name !== 'AbortError') $('exportStatus').textContent = error.message; } finally { if (renderAbort === controller) renderAbort = null; $('renderWavButton').disabled = false; } });
  $('exportDialog').addEventListener('close', () => { renderAbort?.abort(); }); $('helpButton').addEventListener('click', () => openDialog('helpDialog'));
  for (const id of ['helpDialog','exportDialog']) $(id).addEventListener('click', event => { if (event.target !== $(id)) return; const rect = $(id).getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $(id).close(); });
  const keyboardMap = new Map(['a','w','s','e','d','f','t','g','y','h','u','j','k','o','l','p',';'].map((key,index) => [key,index]));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { if (!$('helpDialog').open && !$('exportDialog').open) { event.preventDefault(); panic(); } return; }
    const typing = event.target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || '');
    if (typing || $('helpDialog').open || $('exportDialog').open) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); (event.shiftKey ? redo() : undo()).catch(error => status(error.message, true)); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'Space' && event.target?.tagName !== 'BUTTON') { event.preventDefault(); if (!event.repeat) { if (engine.isPlaying) stop(); else play().catch(() => {}); } return; }
    const key = event.key.toLowerCase(); if (keyboardMap.has(key) && !event.repeat) { event.preventDefault(); keyDown('letter:' + key, (octave + 1) * 12 + keyboardMap.get(key)); }
  });
  document.addEventListener('keyup', event => keyUp('letter:' + event.key.toLowerCase())); window.addEventListener('blur', releaseKeyboard);
  window.addEventListener('pointerup', finishGesture);
  window.addEventListener('pagehide', () => { ++playOperation; releaseKeyboard(); renderAbort?.abort(); clearTimeout(recoveryTimer); if (!hosted) { try { localStorage.setItem(storageKey, S.serializeProject(state)); } catch (_) {} } engine.dispose(); });

  // Static library choices are built once; only the visible result page changes.
  $('keySelect').innerHTML = (Array.isArray(S.KEYS) ? S.KEYS : Object.values(S.KEYS)).map((name,index) => '<option value="' + index + '">' + escape(typeof name === 'string' ? name : name.name || name.label) + '</option>').join('');
  const scaleEntries = Array.isArray(S.SCALES) ? S.SCALES.map(scale => [scale.id || scale, scale.name || scale.label || scale.id || scale]) : Object.keys(S.SCALES).map(id => [id, capitalize(id)]);
  $('scaleSelect').innerHTML = scaleEntries.map(([id,name]) => '<option value="' + escape(id) + '">' + escape(name) + '</option>').join('');
  if ((S.WEATHER || []).includes('cloudy')) $('weatherSelect').insertAdjacentHTML('beforeend', '<option value="cloudy">Cloudy</option>');
  for (const category of [...new Set(presets.map(p => p.category).filter(Boolean))].sort()) $('presetCategory').insertAdjacentHTML('beforeend', '<option value="' + escape(category) + '">' + escape(category) + '</option>');
  const collections = new Map(); libraryBanks.forEach(source => collections.set(source.originalBank || source.id, source.name || source.originalBank || source.id));
  presets.filter(p => p.authored).forEach(p => collections.set(p.originalBank || p.bankId || p.bank, presetCollection(p)));
  for (const [id,name] of [...collections].sort((a,b) => a[1].localeCompare(b[1]))) $('presetBank').insertAdjacentHTML('beforeend', '<option value="' + escape(id) + '">' + escape(name) + '</option>');
  $('presetCount').innerHTML = presets.length + ' SOUNDS<br>' + libraryBanks.length + ' SOURCE BANKS'; $('helpLibrarySummary').textContent = presets.length + ' sample presets from ' + libraryBanks.length + ' source banks, plus PICNIC’s percussion mapping. Playback and exports work offline; the sounds load only when you use them.';
  const canonicalKitchen = 'https://calebhaines.github.io/sidequest-prototypes/music/';
  const detachedPage = ['file:','about:','data:','blob:'].includes(location.protocol);
  document.querySelector('.kitchen-link').href = detachedPage ? canonicalKitchen : '../';
  $('downloadHtml').href = location.protocol === 'file:' ? location.href.split('#')[0] : detachedPage ? canonicalKitchen + 'picnic/index.html' : location.href.split('#')[0];
  $('downloadSource').href = detachedPage ? canonicalKitchen + 'picnic/PICNIC-source.zip' : './PICNIC-source.zip';
  window.PicnicApp = { engine, getState: () => clone(state), getProject: () => ({ format: 'picnic-project', version: 1, state: clone(state) }), loadState, prepare, play, stop, panic, isPlaying: () => !!engine.isPlaying, setTempo, exportAudio,
    audioExport: { scopes: [{ id: 'pattern', label: 'Current pattern or pattern chain' }], defaultBars: 4, maxBars: 16 },
    onStateChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    selectPart, selectStep(index) { selectedStep = Math.min(bank().length - 1, Math.max(0, Math.round(index))); page = Math.floor(selectedStep / 16); renderScore(); } };
  renderAll(); renderPiano();
  let lastMeter = 0;
  function meterFrame(now) { if (now - lastMeter > 120) { lastMeter = now; const text = (engine.activeVoices || 0) + ' / ' + (engine.maxVoices || 32) + ' voices'; if ($('voiceReadout').textContent !== text) $('voiceReadout').textContent = text; if (($('playButton').getAttribute('aria-pressed') === 'true') !== !!engine.isPlaying) renderTransport(); } requestAnimationFrame(meterFrame); }
  requestAnimationFrame(meterFrame);
  document.dispatchEvent(new CustomEvent('musiclab:app-ready', { bubbles: true, detail: { app: 'picnic' } }));
})();
