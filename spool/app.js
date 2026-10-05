/* ROTISSERIE interface. Tape playback, recording and export share audio-engine.js. */
(() => {
  'use strict';
  const S = window.SpoolSchema, presets = window.SpoolPresets;
  const $ = id => document.getElementById(id), clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = v => Math.round(v * 100) + '%', hz = v => v >= 1000 ? (v / 1000).toFixed(1).replace('.0', '') + 'k Hz' : Math.round(v) + ' Hz';
  const seconds = v => v < 10 ? v.toFixed(2) + ' s' : v.toFixed(1) + ' s';
  const ms = v => v >= 1000 ? (v / 1000).toFixed(2) + ' s' : Math.round(v) + ' ms';
  const pan = v => Math.abs(v) < .02 ? 'Center' : Math.round(Math.abs(v) * 100) + (v < 0 ? ' L' : ' R');
  const clock = v => String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(Math.floor(v % 60)).padStart(2, '0');
  const rateText = v => v.toFixed(2) + '×', colors = ['#ff8d45', '#a6bac0', '#d7bd64', '#f1ead8'];
  const descriptions = ['The rhythm keeps rotating through service.', 'Low heat. A substantial bass reduction.', 'A fresh chord batch, turning evenly.', 'Steam and harmonics in continuous rotation.'];
  // Translate known factory labels for display; saved names and project data stay intact.
  const displayDeckName = name => ({ 'The pocket clock': 'The rhythm spit', 'A warm rumour': 'Low simmer', 'Borrowed keys': 'Fresh chord batch', 'Air, wound twice': 'Recirculated steam' })[name] || name;
  const storageKey = 'spool-project-v1';
  let state = S.normalize(presets[0].state), presetId = presets[0].id, selectedDeck = 0, activeTab = 'loop';
  let engine, busy = false, playBusy = false, micBusy = false, recordBusy = false, captureBusy = false;
  let waveformObserver, history = [], gesture = false, autosaveTimer, toastTimer, storageWarned = false, dirty = false;
  let generation = 0, pendingConfirm = null, captureStart = 0, takeStarted = 0, lastRecordStatus = 'idle';
  let operationToken = 0, playToken = 0;
  let animationTime = 0, runningTime = 0, lastFrame = 0, reelAngles = [0, 0, 0, 0], waveforms = [null, null, null, null];
  let heldNotes = new Map(), pointers = new Map(), brakeHeld = false, reverseHeld = false, reverseBefore = null;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { const saved = localStorage.getItem(storageKey); if (saved) { state = S.parseProject(saved); presetId = 'custom'; dirty = true; } } catch (_) { /* Saved project downloads remain available on restricted origins. */ }
  engine = new window.SpoolAudio(state);

  function snapshot() {
    return { ...state, master: { ...state.master }, source: { ...state.source }, record: { ...state.record }, decks: state.decks.map(d => ({ ...d })), assets: state.assets.slice() };
  }
  function remember() { const entry = snapshot(); history.push(entry); if (history.length > 28) history.shift(); $('undo-button').disabled = false; return entry; }
  function forget(entry) { if (!entry) return; const i = history.indexOf(entry); if (i >= 0) history.splice(i, 1); $('undo-button').disabled = !history.length || !!engine.deckRecording; }
  function gestureStart() { if (!gesture) { remember(); gesture = true; } }
  function gestureEnd() { gesture = false; }
  function toast(text) { $('toast').textContent = text; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3900); }
  function errorMessage(e) { return e?.message || 'This action could not be completed.'; }
  function saveSoon() {
    clearTimeout(autosaveTimer); autosaveTimer = setTimeout(() => {
      try { localStorage.setItem(storageKey, S.serializeProject(state)); }
      catch (_) { if (!storageWarned) { storageWarned = true; toast('Browser storage is unavailable or full. Save project keeps all your loops.'); } }
    }, 850);
  }
  function changed() { engine.setState(state); dirty = true; presetId = 'custom'; $('preset-select').value = 'custom'; saveSoon(); updateDeckReadouts(); syncRanges(); }
  function syncRanges() {
    document.querySelectorAll('.parameter[data-path]').forEach(wrap => { const value = wrap.dataset.path.split('.').reduce((o, key) => o?.[key], state); const input = wrap.querySelector('input'); if (!Number.isFinite(value) || !input) return; input.value = clamp(input._spoolToUnit(value)); input.style.setProperty('--fill', pct(+input.value)); const text = input._spoolFormat(value); wrap.querySelector('output').textContent = text; input.setAttribute('aria-valuetext', text); });
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 20000);
  }
  function filename(suffix) { return 'ROTISSERIE-' + state.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 48).toLowerCase() + suffix; }
  function optionList(items, selected) { return items.map(o => { const id = typeof o === 'string' ? o : o.id; return `<option value="${esc(id)}"${id === selected ? ' selected' : ''}>${esc(typeof o === 'string' ? o : o.name)}</option>`; }).join(''); }
  function range(label, min, max, value, format, onChange, config = {}) {
    const wrapper = document.createElement('div'); wrapper.className = 'parameter';
    const lab = document.createElement('label'); lab.className = 'parameter-label'; const title = document.createElement('span'); title.textContent = label;
    const output = document.createElement('output'); output.textContent = format(value); lab.append(title, output);
    const input = document.createElement('input'); input.type = 'range'; input.min = 0; input.max = 1; input.step = config.integer ? String(1 / (max - min)) : '.001';
    const toUnit = v => config.log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min);
    const fromUnit = u => { const v = config.log ? min * Math.pow(max / min, u) : min + (max - min) * u; return config.integer ? Math.round(v) : v; };
    input.value = clamp(toUnit(value)); input.style.setProperty('--fill', pct(+input.value)); input.setAttribute('aria-label', config.aria || label);
    input.setAttribute('aria-valuetext', format(value)); if (config.disabled) input.disabled = true;
    input.addEventListener('pointerdown', gestureStart); input.addEventListener('keydown', e => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) gestureStart(); });
    input.addEventListener('input', () => { gestureStart(); const next = fromUnit(+input.value); const actual = onChange(next) ?? next; output.textContent = format(actual); input.value = clamp(toUnit(actual)); input.style.setProperty('--fill', pct(+input.value)); input.setAttribute('aria-valuetext', format(actual)); changed(); });
    ['change', 'pointerup', 'keyup', 'blur'].forEach(event => input.addEventListener(event, gestureEnd));
    wrapper.append(lab, input); if (config.path) { wrapper.dataset.path = config.path; input._spoolFormat = format; input._spoolToUnit = toUnit; }
    if (config.help) { const p = document.createElement('p'); p.className = 'parameter-help'; p.textContent = config.help; wrapper.append(p); }
    return wrapper;
  }
  function field(label, options, value, callback, aria) {
    const wrap = document.createElement('label'); wrap.className = 'field-label'; wrap.textContent = label;
    const select = document.createElement('select'); select.innerHTML = optionList(options, value); select.setAttribute('aria-label', aria || label);
    select.addEventListener('change', () => { remember(); callback(select.value); changed(); }); wrap.append(select); return wrap;
  }
  function loopDuration(i) { const d = state.decks[i], original = S.assetDuration(state.assets[i]) * (d.end - d.start); return original / Math.max(.0001, actualSpeed(i)); }
  function actualSpeed(i) { if (engine.getPlaybackRate) return Math.abs(engine.getPlaybackRate(i)); const d = state.decks[i], original = S.assetDuration(state.assets[i]) * (d.end - d.start); return Math.min(12, d.sync ? original * state.tempo / (d.beats * 60) * d.rate : d.rate); }
  function durationLabel(i) { return state.assets[i] ? seconds(loopDuration(i)) : 'NO LOOP'; }
  function updateDeckReadouts() {
    state.decks.forEach((d, i) => {
      const card = document.querySelector(`.deck[data-deck="${i}"]`); if (!card) return;
      card.classList.toggle('muted', d.mute || (state.decks.some(deck => deck.solo) && !d.solo)); card.classList.toggle('running', engine.isPlaying && !!state.assets[i]);
      const levelSlider = card.querySelector('input'); levelSlider.value = d.level; levelSlider.style.setProperty('--fill', pct(d.level / 1.5)); card.querySelector('output').textContent = pct(d.level);
      card.querySelector('.deck-speed').textContent = (d.reverse ? '−' : '') + rateText(actualSpeed(i)); card.querySelector('.deck-duration').textContent = durationLabel(i);
      card.querySelector('.deck-mode').textContent = d.sync ? d.beats + ' BEATS · SYNC' : 'FREE LOOP';
      card.querySelector('.deck-mute').classList.toggle('active', d.mute); card.querySelector('.deck-mute').setAttribute('aria-pressed', String(d.mute));
      card.querySelector('.deck-solo').classList.toggle('active', d.solo); card.querySelector('.deck-solo').setAttribute('aria-pressed', String(d.solo));
    });
    $('loop-duration').textContent = state.assets[selectedDeck] ? seconds(loopDuration(selectedDeck)) + ' / ' + (12 * Math.log2(Math.max(.001, actualSpeed(selectedDeck)))).toFixed(1) + ' st' : 'EMPTY DECK';
  }
  function renderTransport() {
    $('tempo').value = state.tempo; $('preset-select').innerHTML = optionList(presets, presetId) + `<option value="custom"${presetId === 'custom' ? ' selected' : ''}>Custom recipe</option>`; updatePlayback();
  }
  function updatePlayback() {
    const playing = !!engine.isPlaying; $('play-button').classList.toggle('playing', playing); $('play-button').querySelector('use').setAttribute('href', playing ? '#i-stop' : '#i-play');
    $('play-button').querySelector('span').textContent = playing ? 'Stop' : 'Play'; $('play-button').setAttribute('aria-label', playing ? 'Stop loops' : 'Play loops');
    $('audio-status-dot').classList.toggle('active', playing || engine.micEnabled); $('audio-status').textContent = playing ? 'TAPE IN MOTION' : engine.micEnabled ? 'MICROPHONE ENABLED' : 'READY WHEN YOU ARE'; updateDeckReadouts();
  }
  function renderDecks() {
    waveformObserver?.disconnect();
    $('deck-grid').innerHTML = state.decks.map((d, i) => `<article class="deck${i === selectedDeck ? ' selected' : ''}${!state.assets[i] ? ' deck-empty' : ''}" data-deck="${i}" style="--deck-color:${colors[i]}"><div class="deck-top"><button class="deck-select" aria-label="Select deck ${String.fromCharCode(65 + i)}: ${esc(displayDeckName(d.name))}" aria-pressed="${i === selectedDeck}"><span class="deck-letter">${String.fromCharCode(65 + i)}</span><span class="deck-title"><b>${esc(displayDeckName(d.name))}</b><small>STEREO TAPE · 0${i + 1}</small></span></button><i class="deck-light" aria-hidden="true"></i></div><div class="reel-stage" aria-hidden="true"><div class="reel left"><i class="reel-hole"></i><i class="reel-hole"></i><i class="reel-hole"></i></div><div class="reel right"><i class="reel-hole"></i><i class="reel-hole"></i><i class="reel-hole"></i></div><i class="tape-head"></i></div><div class="deck-waveform"><canvas width="512" height="128" role="img" aria-label="Deck ${String.fromCharCode(65 + i)} waveform. Drag region edges to trim the loop."></canvas><span class="wave-label">${state.assets[i] ? 'LOOP REGION' : 'EMPTY TAPE'}</span><span class="wave-duration">${state.assets[i] ? seconds(S.assetDuration(state.assets[i])) : '—'}</span>${state.assets[i] ? '' : '<span class="loop-empty">READY FOR A BATCH</span>'}</div><div class="deck-meta"><strong class="deck-speed">1.00×</strong><span class="deck-mode">FREE LOOP</span><span class="deck-duration">0.00 s</span></div><div class="deck-mix"><div class="deck-level"><label>LEVEL <output>${pct(d.level)}</output></label><input type="range" min="0" max="1.5" step=".01" value="${d.level}" aria-label="Deck ${String.fromCharCode(65 + i)} level" style="--fill:${pct(d.level / 1.5)}"></div><div class="deck-mix-buttons"><button class="deck-mix-button deck-mute" aria-label="Mute deck ${String.fromCharCode(65 + i)}" aria-pressed="${d.mute}" title="Mute">M</button><button class="deck-mix-button deck-solo" aria-label="Solo deck ${String.fromCharCode(65 + i)}" aria-pressed="${d.solo}" title="Solo">S</button></div></div></article>`).join('');
    document.querySelectorAll('.deck').forEach(card => {
      const i = +card.dataset.deck;
      card.querySelector('.deck-select').addEventListener('click', () => selectDeck(i)); card.querySelector('.reel-stage').addEventListener('click', () => selectDeck(i));
      card.querySelector('.deck-mute').addEventListener('click', () => { remember(); state.decks[i].mute = !state.decks[i].mute; changed(); });
      card.querySelector('.deck-solo').addEventListener('click', () => { remember(); state.decks[i].solo = !state.decks[i].solo; changed(); });
      const slider = card.querySelector('input'); slider.addEventListener('pointerdown', gestureStart); slider.addEventListener('keydown', gestureStart);
      slider.addEventListener('input', () => { gestureStart(); state.decks[i].level = +slider.value; slider.style.setProperty('--fill', pct(+slider.value / 1.5)); card.querySelector('output').textContent = pct(+slider.value); changed(); });
      ['change', 'pointerup', 'keyup', 'blur'].forEach(event => slider.addEventListener(event, gestureEnd)); wireWaveform(card.querySelector('canvas'), i);
    });
    refreshWaveforms(); updateDeckReadouts(); updateRecordUI();
    if ('ResizeObserver' in window) { waveformObserver = new ResizeObserver(entries => { for (const entry of entries) sizeCanvas(entry.target); }); document.querySelectorAll('.deck-waveform canvas').forEach(canvas => waveformObserver.observe(canvas)); } else requestAnimationFrame(resizeCanvases);
  }
  function selectDeck(i) {
    selectedDeck = clamp(Math.round(i), 0, 3); document.querySelectorAll('.deck').forEach((card, index) => { card.classList.toggle('selected', index === selectedDeck); card.querySelector('.deck-select').setAttribute('aria-pressed', String(index === selectedDeck)); });
    renderEditor(); updateRecordUI();
  }
  function refreshWaveforms() { for (let i = 0; i < 4; i++) { try { waveforms[i] = engine.getWaveform(i); } catch (_) { waveforms[i] = null; } } }
  function renderEditor() {
    const d = state.decks[selectedDeck], asset = state.assets[selectedDeck], letter = String.fromCharCode(65 + selectedDeck), prefix = 'Deck ' + letter + ' ';
    $('selected-deck-label').textContent = 'DECK ' + letter + ' / SELECTED'; $('selected-deck-label').style.color = colors[selectedDeck]; $('deck-editor-title').textContent = displayDeckName(d.name);
    $('deck-name').value = d.name; $('deck-description').textContent = asset?.kind === 'pcm' ? asset.name + ' · ' + seconds(S.assetDuration(asset)) + ' · ' + asset.channels + ' channel' + (asset.channels === 1 ? '' : 's') : descriptions[selectedDeck];
    const loop = $('loop-controls'); loop.replaceChildren();
    const specs = [
      ['SPEED', 'rate', .25, 2, rateText, { log: true }], ['REGION START', 'start', 0, 1, pct, {}], ['REGION END', 'end', 0, 1, pct, {}],
      ['PHASE', 'phase', 0, 1, pct, {}], ['LOOP BEATS', 'beats', 1, 64, v => Math.round(v) + ' beats', { integer: true }], ['SEAM FADE', 'seam', 0, 80, ms, {}],
      ['PAN', 'pan', -1, 1, pan, {}], ['LEVEL', 'level', 0, 1.5, pct, {}],
    ];
    specs.forEach(([label, key, min, max, format, config]) => loop.append(range(label, min, max, d[key], format, v => { if (key === 'start') v = Math.min(v, d.end - .002); if (key === 'end') v = Math.max(v, d.start + .002); d[key] = v; return v; }, { ...config, aria: prefix + label.toLowerCase(), path: 'decks.' + selectedDeck + '.' + key })));
    const tape = $('tape-controls'); tape.replaceChildren();
    [['LOW-PASS', 'tone', 200, 18000, hz, { log: true }], ['HIGH-PASS', 'highpass', 20, 3000, hz, { log: true }], ['SATURATION', 'saturation', 0, 1, pct], ['WOW', 'wow', 0, 1, pct], ['FLUTTER', 'flutter', 0, 1, pct], ['WEAR', 'wear', 0, 1, pct], ['HISS', 'hiss', 0, 1, pct], ['DROPOUTS', 'dropouts', 0, 1, pct]].forEach(([label, key, min, max, format, config]) => tape.append(range(label, min, max, d[key], format, v => { d[key] = v; }, { ...config, aria: prefix + label.toLowerCase(), path: 'decks.' + selectedDeck + '.' + key })));
    $('reverse-button').classList.toggle('active', d.reverse); $('reverse-button').setAttribute('aria-pressed', String(d.reverse)); $('sync-toggle').checked = d.sync;
    const seed = $('seed-controls'); seed.replaceChildren();
    const recipe = asset?.kind === 'seed' ? asset : S.seedAsset('keys', d.name, { tempo: state.tempo, bars: 2, pitch: state.source.root });
    let pendingRecipe = { ...recipe };
    const recipeField = (label, options, value, key) => { const wrap = document.createElement('label'); wrap.className = 'field-label'; wrap.textContent = label; const select = document.createElement('select'); select.innerHTML = optionList(options, value); select.setAttribute('aria-label', prefix + label); select.addEventListener('change', () => { pendingRecipe[key] = key === 'id' ? select.value : +select.value; }); wrap.append(select); return wrap; };
    seed.append(recipeField('New loop recipe', S.SEED_TYPES, pendingRecipe.id, 'id'), recipeField('Length', [1, 2, 3, 4].map(v => ({ id: String(v), name: v + (v === 1 ? ' bar' : ' bars') })), String(pendingRecipe.bars), 'bars'), recipeField('Root note', Array.from({ length: 61 }, (_, i) => ({ id: String(i + 24), name: S.noteName(i + 24) })), String(pendingRecipe.pitch), 'pitch'));
    const generate = document.createElement('button'); generate.className = 'button'; generate.id = 'generate-loop-button'; generate.innerHTML = '<svg><use href="#i-spark"/></svg>Make loop';
    generate.addEventListener('click', async () => {
      const index = selectedDeck; if (destructiveBlocked()) return;
      if (state.assets[index]?.kind === 'pcm' && !await confirmAction('Replace this loop?', 'This replaces the selected recorded or imported loop with a synthesized phrase. Undo can restore it.', 'Replace loop')) return;
      if (destructiveBlocked()) return; remember(); const a = { ...pendingRecipe, name: S.SEED_TYPES.find(t => t.id === pendingRecipe.id).name, seed: randomSeed(), tempo: state.tempo };
      state.assets[index] = a; resetClipGeometry(index, a, true); changed(); renderDecks(); renderEditor(); toast('New loop prepared. Another batch is ready to turn.');
    }); seed.append(generate);
    const recipeNote = document.createElement('p'); recipeNote.className = 'seed-description'; recipeNote.textContent = 'Generate a fresh phrase locally. Recorded and imported loops are replaced only when you choose Make loop.'; seed.append(recipeNote);
    $('record-source').value = state.record.input; $('record-bars').value = String(state.record.bars); $('record-quantize').checked = state.record.quantize;
    const overdub = $('overdub-controls'); overdub.replaceChildren(range('OVERDUB FEEDBACK', 0, 1, state.record.feedback, pct, v => { state.record.feedback = v; }, { aria: 'Overdub feedback', help: 'Previous layer kept on each pass' }));
    updateDeckReadouts(); updateRecordUI(); switchTab(activeTab, false);
  }
  function renderInstrument() {
    $('instrument-type').innerHTML = optionList(S.VOICES, state.source.voice); $('instrument-octave').value = String(Math.floor(state.source.root / 12) - 1); $('instrument-monitor').checked = state.source.monitor;
    const c = $('instrument-controls'); c.replaceChildren();
    [['DECAY', 'decay', 80, 3000, ms, { log: true }], ['TONE', 'tone', 200, 16000, hz, { log: true }], ['LEVEL', 'level', 0, 1, pct, {}]].forEach(([label, key, min, max, format, config]) => c.append(range(label, min, max, state.source[key], format, v => { state.source[key] = v; }, { ...config, aria: 'Instrument ' + label.toLowerCase(), path: 'source.' + key })));
    renderPiano();
  }
  function renderPiano() {
    releaseNotes(); const mappings = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k'];
    const whites = [0, 2, 4, 5, 7, 9, 11, 12], blacks = [1, 3, 6, 8, 10];
    $('piano').innerHTML = whites.map((semitone, i) => `<button class="piano-key" data-note="${state.source.root + semitone}" aria-label="Play ${S.noteName(state.source.root + semitone)}"><span>${mappings[semitone].toUpperCase()}</span></button>`).join('') + blacks.map(semitone => { const offset = [1, 3].includes(semitone) ? (semitone + 1) / 2 : (semitone + 2) / 2; return `<button class="piano-key black" style="left:calc(${offset * 12.5}% - 3.6%)" data-note="${state.source.root + semitone}" aria-label="Play ${S.noteName(state.source.root + semitone)}"><span>${mappings[semitone].toUpperCase()}</span></button>`; }).join('');
    $('piano').querySelectorAll('button').forEach(key => {
      key.addEventListener('pointerdown', async e => { e.preventDefault(); key.setPointerCapture(e.pointerId); const note = +key.dataset.note; pointers.set(e.pointerId, note); await playNote(note, 'p' + e.pointerId); });
      const release = e => { const note = pointers.get(e.pointerId); if (note != null) { pointers.delete(e.pointerId); releaseNote(note, 'p' + e.pointerId); } };
      key.addEventListener('pointerup', release); key.addEventListener('pointercancel', release); key.addEventListener('lostpointercapture', release);
      key.addEventListener('keydown', e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); if (!e.repeat) playNote(+key.dataset.note, 'b' + key.dataset.note); } });
      key.addEventListener('keyup', e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); releaseNote(+key.dataset.note, 'b' + key.dataset.note); } });
      key.addEventListener('blur', () => releaseNote(+key.dataset.note, 'b' + key.dataset.note));
    });
  }
  async function playNote(note, id) {
    if (heldNotes.has(id)) return; heldNotes.set(id, note);
    try { const played = await engine.noteOn(note, .85); if (played === false) { heldNotes.delete(id); return; } if (!heldNotes.has(id)) engine.noteOff(note); else document.querySelectorAll(`.piano-key[data-note="${note}"]`).forEach(key => key.classList.add('pressed')); }
    catch (e) { heldNotes.delete(id); toast(errorMessage(e)); }
  }
  function releaseNote(note, id) { heldNotes.delete(id); if (![...heldNotes.values()].includes(note)) { engine.noteOff(note); document.querySelectorAll(`.piano-key[data-note="${note}"]`).forEach(key => key.classList.remove('pressed')); } }
  function releaseNotes() { for (const note of heldNotes.values()) engine.noteOff(note); heldNotes.clear(); pointers.clear(); document.querySelectorAll('.piano-key.pressed').forEach(key => key.classList.remove('pressed')); }
  function renderMaster() {
    const m = state.master, c = $('master-controls'); c.replaceChildren();
    [['OUTPUT', 'volume', 0, 1, pct], ['STEREO WIDTH', 'width', 0, 1, pct], ['ECHO', 'echo', 0, 1, pct], ['ECHO FEEDBACK', 'feedback', 0, .85, pct], ['SPACE', 'space', 0, 1, pct]].forEach(([label, key, min, max, format]) => c.append(range(label, min, max, m[key], format, v => { m[key] = v; }, { aria: 'Master ' + label.toLowerCase(), path: 'master.' + key })));
    c.append(field('ECHO DIVISION', S.DIVISIONS, m.echoDivision, v => { m.echoDivision = v; }, 'Master echo division'));
    const p = $('performance-controls'); p.replaceChildren(range('ECHO THROW', 0, 1, m.echo, pct, v => { m.echo = v; }, { aria: 'Performance echo throw', path: 'master.echo' }), range('SPACE', 0, 1, m.space, pct, v => { m.space = v; }, { aria: 'Performance space', path: 'master.space' }));
  }
  function switchTab(tab, focus = false) {
    activeTab = tab; document.querySelectorAll('.editor-tab').forEach(b => { const selected = b.dataset.tab === tab; b.classList.toggle('active', selected); b.setAttribute('aria-selected', String(selected)); b.tabIndex = selected ? 0 : -1; if (focus && selected) b.focus(); });
    ['loop', 'tape', 'record'].forEach(id => { $(id + '-panel').hidden = id !== tab; });
  }
  function updateRecordUI() {
    const take = engine.deckRecording, active = !!take, onThisDeck = take?.index === selectedDeck;
    $('deck-record-button').classList.toggle('recording', onThisDeck); $('deck-record-button').querySelector('span').textContent = onThisDeck ? take.status === 'armed' ? 'Cancel armed take' : 'Stop recording' : 'Record loop';
    $('deck-record-button').disabled = busy || recordBusy || (active && !onThisDeck);
    $('deck-record-status').textContent = onThisDeck ? take.status === 'armed' ? 'ARMED · NEXT BAR' : 'RECORDING' : active ? 'RECORDING DECK ' + String.fromCharCode(65 + take.index) : 'READY TO RECORD';
    $('deck-record-status').classList.toggle('record-countdown', onThisDeck); $('deck-record-time').textContent = onThisDeck ? clock(Math.max(0, (performance.now() - takeStarted) / 1000)) : '00:00';
    $('mic-button').classList.toggle('recording', engine.micEnabled); $('mic-button').querySelector('span').textContent = engine.micEnabled ? 'Disable microphone' : 'Enable microphone'; $('mic-button').setAttribute('aria-pressed', String(!!engine.micEnabled)); $('mic-button').disabled = micBusy || busy || active;
    ['import-button', 'duplicate-button', 'clear-deck-button', 'preset-select', 'open-button', 'project-file', 'new-tapes-button', 'undo-button', 'generate-loop-button'].forEach(id => { const el = $(id); if (el) el.disabled = active || busy || (id === 'undo-button' && !history.length); });
    ['record-source', 'record-mode', 'record-bars', 'record-quantize'].forEach(id => { $(id).disabled = active || busy; });
    document.querySelectorAll('.deck').forEach((card, i) => card.classList.toggle('deck-recording', take?.index === i));
    $('capture-button').classList.toggle('recording', engine.isRecording); $('capture-button').querySelector('span').textContent = engine.isRecording ? 'Stop & save' : 'Record output'; $('capture-button').disabled = captureBusy || busy;
  }
  function renderAll() { renderTransport(); renderDecks(); renderEditor(); renderInstrument(); renderMaster(); updateRecordUI(); }
  function destructiveBlocked() { if (busy || engine.deckRecording) { toast(engine.deckRecording ? 'Finish or cancel the current take before replacing loops.' : 'Please wait for the current action to finish.'); return true; } return false; }
  function setBusy(value) { busy = value; updateRecordUI(); $('render-button').disabled = value; $('deck-export-button').disabled = value; }
  function randomSeed() { const arr = new Uint32Array(1); try { crypto.getRandomValues(arr); return arr[0] || 1; } catch (_) { return Math.floor(Math.random() * 0xfffffffe) + 1; } }
  function resetClipGeometry(index, asset, sync = false, beats) {
    const d = state.decks[index]; d.start = 0; d.end = 1; d.rate = 1; d.reverse = false; d.phase = 0; d.sync = sync;
    d.beats = beats || clamp(Math.round(S.assetDuration(asset) * state.tempo / 60), 1, 64);
  }
  function importAudio({ pcm, sampleRate, name = 'Audio sample', options = {} } = {}) {
    if (busy || micBusy || recordBusy || engine.deckRecording || captureBusy || engine.isRecording) throw new Error('Finish the current ROTISSERIE recording or action before sending audio.');
    const index = options.target ?? options.deck ?? selectedDeck;
    if (!Number.isInteger(index) || index < 0 || index > 3) throw new Error('Choose a ROTISSERIE deck from A to D.');
    if (state.assets[index] && options.replace !== true) throw new Error('Confirm replacing the loop on deck ' + String.fromCharCode(65 + index) + ' before sending audio.');
    if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || Object.prototype.toString.call(pcm) !== '[object Float32Array]' || pcm.length < 4 || pcm.length % 2) throw new Error('Provide valid interleaved stereo audio.');
    if (pcm.length / 2 / sampleRate > 30) throw new Error('ROTISSERIE accepts clips up to 30 seconds. Shorten the clip before sending it.');
    for (let i = 0; i < pcm.length; i++) if (!Number.isFinite(pcm[i])) throw new Error('The incoming audio contains invalid samples.');
    const targetRate = Math.min(48000, sampleRate), frames = Math.max(2, Math.floor(pcm.length / 2 * targetRate / sampleRate));
    if (targetRate !== sampleRate) {
      const sourceFrames = pcm.length / 2, resampled = new Float32Array(frames * 2);
      for (let i = 0; i < frames; i++) {
        const position = i * sampleRate / targetRate, at = Math.floor(position), fraction = position - at;
        for (let channel = 0; channel < 2; channel++) resampled[i * 2 + channel] = pcm[Math.min(at, sourceFrames - 1) * 2 + channel] * (1 - fraction) + pcm[Math.min(at + 1, sourceFrames - 1) * 2 + channel] * fraction;
      }
      pcm = resampled;
    }
    const asset = S.normalizeAsset(SpoolAudio.encodePCM(pcm, targetRate, String(name).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 100) || 'Audio sample'));
    if (!asset) throw new Error('The incoming audio could not be stored as a ROTISSERIE loop.');
    remember(); state.assets[index] = asset; state.decks[index].name = asset.name.slice(0, 48); resetClipGeometry(index, asset);
    changed(); renderDecks(); selectDeck(index); window.MusicLabHost?.notifyStateChange();
    toast('Audio sample received on deck ' + String.fromCharCode(65 + index) + '. Undo restores the previous loop.');
    return { deck: index, name: asset.name, duration: asset.duration, sampleRate: asset.sampleRate };
  }
  async function exportAudio({ scope = 'mix', bars = 1, tailSeconds = 4, signal, deck, target } = {}) {
    if (signal?.aborted) throw new DOMException('Audio export cancelled.', 'AbortError');
    if (!['mix', 'deck', 'source'].includes(scope)) throw new Error('Choose the deck mix, a processed deck, or its unprocessed source.');
    if (busy || micBusy || recordBusy || engine.deckRecording || captureBusy || engine.isRecording) throw new Error('Finish the current ROTISSERIE recording or action before sharing audio.');
    const index = target ?? deck ?? selectedDeck, score = snapshot();
    if (!Number.isInteger(index) || index < 0 || index > 3) throw new Error('Choose a ROTISSERIE deck from A to D.');
    if (scope !== 'mix' && !score.assets[index]) throw new Error('This deck has no loop to share.');
    const sourceLabel = scope === 'mix' ? score.name : score.decks[index].name;
    const name = 'spool-' + String(sourceLabel).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() + '-' + scope + '.wav';
    setBusy(true);
    try {
      if (scope === 'source') {
        const audio = SpoolAudio.decodePCM(score.assets[index]);
        if (signal?.aborted) throw new DOMException('Audio export cancelled.', 'AbortError');
        return { pcm: audio.pcm, sampleRate: audio.sampleRate, name, tempo: score.assets[index].tempo || score.tempo, sourceApp: 'spool', sourceLabel, scope };
      }
      const blob = scope === 'mix' ? await engine.renderWav(bars, tailSeconds, { signal }) : await engine.renderDeckWav(index, { signal });
      return { blob, sampleRate: 48000, name, tempo: score.tempo, sourceApp: 'spool', sourceLabel, scope };
    } finally { setBusy(false); }
  }
  function confirmAction(title, message, action) {
    if (pendingConfirm) pendingConfirm(false); $('confirm-title').textContent = title; $('confirm-message').textContent = message; $('confirm-accept').textContent = action; $('confirm-dialog').showModal();
    return new Promise(resolve => { pendingConfirm = resolve; });
  }
  function finishConfirm(accept) { $('confirm-dialog').close(); const done = pendingConfirm; pendingConfirm = null; done?.(accept); }
  function installState(next, options = {}) {
    generation++; operationToken++; playToken++; releaseNotes(); engine.panic(); brakeHeld = false; reverseHeld = false; reverseBefore = null; $('brake-button').classList.remove('active'); $('reverse-all-button').classList.remove('active');
    state = S.normalize(next); engine.setState(state); presetId = options.presetId || 'custom'; dirty = options.dirty ?? true; runningTime = 0; renderAll(); saveSoon();
  }
  function undo() {
    if (destructiveBlocked() || !history.length) return; const previous = history.pop(); installState(previous); $('undo-button').disabled = !history.length; toast('Previous edit restored.');
  }
  async function togglePlay() {
    if (busy) return; if (playBusy) { playToken++; engine.stop(); updatePlayback(); return; } const token = ++playToken; playBusy = true; $('play-button').disabled = true;
    try { if (engine.isPlaying) { if (engine.deckRecording?.status === 'armed') engine.cancelDeckRecording(); else if (engine.deckRecording) await engine.stopDeckRecording(); engine.stop(); releaseNotes(); } else { const started = await engine.start(); if (started !== false && token === playToken) runningTime = 0; } if (token === playToken) { updatePlayback(); updateRecordUI(); } }
    catch (e) { toast(errorMessage(e)); } finally { playBusy = false; $('play-button').disabled = false; }
  }
  function panic() { generation++; operationToken++; playToken++; releaseNotes(); engine.panic(); brakeHeld = false; reverseHeld = false; if (reverseBefore) { state.decks.forEach((d, i) => { d.reverse = reverseBefore[i]; }); reverseBefore = null; engine.setState(state); } $('brake-button').classList.remove('active'); $('reverse-all-button').classList.remove('active'); $('brake-button').setAttribute('aria-pressed', 'false'); $('reverse-all-button').setAttribute('aria-pressed', 'false'); updatePlayback(); updateRecordUI(); toast('Playback stopped. Active take cancelled.'); }
  function showDialog(id) { $(id).showModal(); }
  function wireWaveform(canvas, index) {
    let drag = null;
    canvas.addEventListener('pointerdown', e => {
      if (selectedDeck !== index) { selectDeck(index); return; } if (!state.assets[index] || engine.deckRecording) return;
      const rect = canvas.getBoundingClientRect(), x = clamp((e.clientX - rect.left) / rect.width), d = state.decks[index];
      const distanceStart = Math.abs(x - d.start) * rect.width, distanceEnd = Math.abs(x - d.end) * rect.width;
      if (Math.min(distanceStart, distanceEnd) > 18 && !e.shiftKey && !e.altKey) return;
      e.preventDefault(); drag = e.shiftKey ? 'end' : e.altKey ? 'start' : distanceStart < distanceEnd ? 'start' : 'end'; gestureStart(); canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => { if (!drag) return; const rect = canvas.getBoundingClientRect(), x = clamp((e.clientX - rect.left) / rect.width), d = state.decks[index]; d[drag] = drag === 'start' ? Math.min(x, d.end - .002) : Math.max(x, d.start + .002); changed(); });
    const end = () => { if (drag) { drag = null; gestureEnd(); renderEditor(); } }; canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('lostpointercapture', end);
  }
  function sizeCanvas(canvas) { const dpr = window.devicePixelRatio || 1, width = Math.max(1, Math.round(canvas.clientWidth * dpr)), height = Math.max(1, Math.round(canvas.clientHeight * dpr)); if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; } }
  function resizeCanvases() { document.querySelectorAll('.deck-waveform canvas').forEach(sizeCanvas); }
  window.addEventListener('resize', resizeCanvases);
  function drawWaveform(canvas, index, position = 0) {
    const c = canvas.getContext('2d'), w = canvas.width, h = canvas.height, d = state.decks[index], peaks = waveforms[index]; c.clearRect(0, 0, w, h);
    c.strokeStyle = '#313435'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
    for (let i = 0; i < 9; i++) { c.beginPath(); c.strokeStyle = '#262829'; c.moveTo(i * w / 8, 0); c.lineTo(i * w / 8, h); c.stroke(); }
    if (!state.assets[index]) return;
    if (peaks?.length) {
      c.strokeStyle = colors[index] + 'aa'; c.lineWidth = 1.7;
      const count = Math.min(256, Math.floor(w / 2)); c.beginPath();
      for (let x = 0; x < count; x++) {
        const item = peaks[Math.floor(x / count * peaks.length)], value = Array.isArray(item) ? Math.max(Math.abs(item[0]), Math.abs(item[1])) : Math.abs(item);
        const amplitude = Math.max(.008, Math.min(1, Number.isFinite(value) ? value : 0)) * (h * .32);
        c.moveTo(x / count * w, h / 2 - amplitude); c.lineTo(x / count * w, h / 2 + amplitude);
      } c.stroke();
    }
    c.fillStyle = '#0a0908aa'; c.fillRect(0, 0, d.start * w, h); c.fillRect(d.end * w, 0, (1 - d.end) * w, h);
    c.fillStyle = colors[index] + '0c'; c.fillRect(d.start * w, 0, (d.end - d.start) * w, h);
    c.strokeStyle = colors[index] + (selectedDeck === index ? 'cc' : '55'); c.lineWidth = 1.5;
    for (const edge of [d.start, d.end]) { c.beginPath(); c.moveTo(edge * (w - 3) + 1.5, 0); c.lineTo(edge * (w - 3) + 1.5, h); c.stroke(); if (selectedDeck === index) { c.fillStyle = colors[index]; c.fillRect(edge * (w - 3), h / 2 - 12, 4, 24); } }
    if (engine.isPlaying) { const p = clamp(position), x = d.start + p * (d.end - d.start); c.strokeStyle = '#f1ead8'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x * w, 22); c.lineTo(x * w, h - 8); c.stroke(); c.fillStyle = '#f1ead8'; c.beginPath(); c.moveTo(x * w - 3, 22); c.lineTo(x * w + 3, 22); c.lineTo(x * w, 28); c.fill(); }
  }
  function animate(time) {
    const dt = Math.min(.1, Math.max(0, (time - lastFrame) / 1000)); lastFrame = time; animationTime += dt;
    let meters; try { meters = engine.getMeters(); } catch (_) { meters = {}; }
    if (engine.isPlaying) runningTime += dt;
    document.querySelectorAll('.deck').forEach((card, i) => {
      if (engine.isPlaying && state.assets[i] && !reducedMotion) { reelAngles[i] += dt * 40 * actualSpeed(i) * (state.decks[i].reverse ? -1 : 1) * (brakeHeld ? .18 : 1); card.querySelector('.reel.left').style.transform = 'rotate(' + reelAngles[i] + 'deg)'; card.querySelector('.reel.right').style.transform = 'rotate(' + (reelAngles[i] * .91 + 30) + 'deg)'; }
      drawWaveform(card.querySelector('canvas'), i, meters?.positions?.[i] || 0);
    });
    const rms = Number.isFinite(meters?.rms) ? meters.rms : 0, peak = Number.isFinite(meters?.peak) ? meters.peak : rms;
    const meter = v => clamp((20 * Math.log10(Math.max(.00001, v)) + 48) / 48) * 100;
    $('meter-left').style.width = meter(meters?.rmsLeft ?? rms) + '%'; $('meter-right').style.width = meter(meters?.rmsRight ?? rms) + '%'; $('output-level').textContent = peak > .00001 ? (20 * Math.log10(peak)).toFixed(1) + ' dB' : '−∞ dB';
    const beats = Number.isFinite(meters?.beat) ? meters.beat : runningTime * state.tempo / 60, bars = Math.floor(beats / 4), beat = Math.floor(beats % 4), frac = Math.floor((beats % 1) * 100);
    $('transport-position').textContent = String(bars + 1).padStart(2, '0') + ' : ' + String(beat + 1).padStart(2, '0') + ' : ' + String(frac).padStart(2, '0');
    if (engine.isRecording) $('capture-time').textContent = clock(meters?.mixRecordSeconds ?? Math.max(0, (time - captureStart) / 1000));
    if (engine.deckRecording?.index === selectedDeck) $('deck-record-time').textContent = engine.deckRecording.status === 'armed' ? 'ARMED' : clock(meters?.deckRecordSeconds ?? meters?.recordSeconds ?? Math.max(0, (time - takeStarted) / 1000));
    $('input-meter').firstElementChild.style.width = meter(meters?.input || 0) + '%';
    requestAnimationFrame(animate);
  }

  engine.onStatus = message => { if (message) toast(message); };
  engine.onDeckRecorded = result => {
    if (!result?.asset || !Number.isInteger(result.index)) return;
    state.assets[result.index] = result.asset;
    if (result.mode === 'replace') resetClipGeometry(result.index, result.asset, !!result.sync, result.beats);
    engine.setState(state); changed(); renderDecks(); renderEditor(); updatePlayback();
    toast(result.limit ? 'Recording reached its limit. The loop is saved.' : result.mode === 'overdub' ? 'Overdub recorded. Another layer joins the batch.' : 'Loop recorded. One batch, ready for rotation.');
  };
  engine.onRecordState = info => { if (info?.status === 'recording' && lastRecordStatus !== 'recording') takeStarted = performance.now(); lastRecordStatus = info?.status || 'idle'; updateRecordUI(); updatePlayback(); };
  engine.onRecordingLimit = async () => { if (captureBusy) return; const token = operationToken; try { const blob = await engine.stopRecording(); if (token !== operationToken) return; if (blob?.size > 44) download(blob, filename('-live.wav')); updateRecordUI(); toast('Output recording reached 3 minutes and was saved.'); } catch (e) { toast(errorMessage(e)); } };

  $('play-button').addEventListener('click', togglePlay); $('panic-button').addEventListener('click', panic);
  $('rewind-button').addEventListener('click', () => { if (engine.deckRecording) return toast('Finish the take before rewinding.'); remember(); state.decks.forEach(d => { d.phase = 0; }); engine.setState(state); if (engine.rewind) engine.rewind(); else { const playing = engine.isPlaying; engine.stop(); if (playing) engine.start().catch(e => toast(errorMessage(e))); } runningTime = 0; changed(); renderEditor(); toast('All loops rewound.'); });
  $('tempo').addEventListener('change', () => { remember(); state.tempo = clamp(Math.round(+$('tempo').value || state.tempo), 40, 180); $('tempo').value = state.tempo; changed(); renderEditor(); });
  $('preset-select').addEventListener('change', async e => {
    const id = e.target.value, preset = presets.find(p => p.id === id); if (!preset) return;
    if (destructiveBlocked()) { $('preset-select').value = presetId; return; }
    if (dirty && !await confirmAction('Replace this recipe?', 'This replaces the four loops and their settings. Save project first to keep your current work. Undo can restore it.', 'Load recipe')) { $('preset-select').value = presetId; return; }
    if (destructiveBlocked()) return; remember(); installState(preset.state, { presetId: id, dirty: false }); toast(preset.description);
  });
  $('new-tapes-button').addEventListener('click', () => {
    if (destructiveBlocked()) return; const seeds = state.assets.filter(a => a?.kind === 'seed'); if (!seeds.length) return toast('No built-in phrases to regenerate. Use Make loop on an empty deck.');
    remember(); state.assets = state.assets.map(a => a?.kind === 'seed' ? { ...a, seed: randomSeed() } : a); changed(); renderDecks(); renderEditor(); toast('Built-in phrases regenerated. Imported and recorded loops are kept.');
  });
  $('undo-button').addEventListener('click', undo); $('save-button').addEventListener('click', () => { try { download(new Blob([S.serializeProject(state)], { type: 'application/json' }), filename('.spool.json')); toast('Project saved with all loop audio.'); } catch (e) { toast(errorMessage(e)); } });
  $('open-button').addEventListener('click', () => { if (!destructiveBlocked()) $('project-file').click(); });
  $('project-file').addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file || destructiveBlocked()) return; if (file.size > 32 * 1024 * 1024) return toast('Choose a ROTISSERIE project smaller than 32 MB.');
    const oldGeneration = generation; setBusy(true);
    try { const next = S.parseProject(await file.text()); if (generation !== oldGeneration) return; remember(); installState(next); toast('Project opened.'); }
    catch (error) { toast(errorMessage(error)); } finally { setBusy(false); }
  });
  $('import-button').addEventListener('click', () => { if (!destructiveBlocked()) $('audio-file').click(); });
  $('audio-file').addEventListener('change', async e => {
    const file = e.target.files[0], index = selectedDeck; e.target.value = ''; if (!file || destructiveBlocked()) return; if (file.size > 20 * 1024 * 1024) return toast('Choose an audio file smaller than 20 MB.');
    const oldGeneration = generation; setBusy(true);
    try { const asset = await engine.decodeSample(file); if (generation !== oldGeneration) return; remember(); state.assets[index] = asset; state.decks[index].name = asset.name.replace(/\.[a-z0-9]{1,5}$/i, '').slice(0, 48); resetClipGeometry(index, asset); changed(); renderDecks(); renderEditor(); toast('Audio imported into deck ' + String.fromCharCode(65 + index) + '. Loops keep up to 30 seconds.'); }
    catch (error) { toast(errorMessage(error)); } finally { setBusy(false); }
  });
  $('clear-deck-button').addEventListener('click', async () => {
    const index = selectedDeck; if (destructiveBlocked() || !state.assets[index]) return;
    if (!await confirmAction('Erase this loop?', 'The selected loop will be cleared. Undo can restore it.', 'Erase loop')) return;
    if (destructiveBlocked()) return; remember(); state.assets[index] = null; changed(); renderDecks(); renderEditor(); toast('Deck ' + String.fromCharCode(65 + index) + ' cleared.');
  });
  $('duplicate-button').addEventListener('click', async () => {
    const from = selectedDeck; if (destructiveBlocked()) return; if (!state.assets[from]) return toast('Import or record a loop before duplicating it.');
    let to = state.assets.findIndex((a, i) => !a && i !== from); if (to < 0) { to = (from + 1) % 4; if (!await confirmAction('Replace deck ' + String.fromCharCode(65 + to) + '?', 'All decks are occupied. Duplicate deck ' + String.fromCharCode(65 + from) + ' into the next deck. Undo can restore its previous loop.', 'Duplicate deck')) return; }
    if (destructiveBlocked()) return; remember(); state.assets[to] = state.assets[from]; state.decks[to] = { ...state.decks[from], name: (state.decks[from].name + ' II').slice(0, 48), solo: false }; changed(); renderDecks(); selectDeck(to); toast('Loop duplicated into deck ' + String.fromCharCode(65 + to) + '.');
  });
  $('deck-editor-title').addEventListener('click', () => { $('deck-editor-title').hidden = true; $('deck-name').hidden = false; $('deck-name').focus(); $('deck-name').select(); });
  function finishName(cancel = false) { if ($('deck-name').hidden) return; const name = $('deck-name').value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 48); if (!cancel && name && name !== state.decks[selectedDeck].name) { remember(); state.decks[selectedDeck].name = name; changed(); renderDecks(); } $('deck-editor-title').hidden = false; $('deck-name').hidden = true; renderEditor(); }
  $('deck-name').addEventListener('blur', () => finishName()); $('deck-name').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishName(e.key === 'Escape'); } });
  $('reverse-button').addEventListener('click', () => { remember(); state.decks[selectedDeck].reverse = !state.decks[selectedDeck].reverse; changed(); renderEditor(); });
  $('sync-toggle').addEventListener('change', e => { remember(); state.decks[selectedDeck].sync = e.target.checked; changed(); renderEditor(); });
  $('reset-region-button').addEventListener('click', () => { remember(); state.decks[selectedDeck].start = 0; state.decks[selectedDeck].end = 1; changed(); renderEditor(); });
  $('reset-phase-button').addEventListener('click', () => { remember(); state.decks[selectedDeck].phase = 0; changed(); renderEditor(); });
  document.querySelectorAll('.editor-tab').forEach((tab, index, tabs) => { tab.addEventListener('click', () => switchTab(tab.dataset.tab)); tab.addEventListener('keydown', e => { let next = index; if (e.key === 'ArrowRight') next = (index + 1) % tabs.length; else if (e.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length; else if (e.key === 'Home') next = 0; else if (e.key === 'End') next = tabs.length - 1; else return; e.preventDefault(); switchTab(tabs[next].dataset.tab, true); }); });
  $('record-source').addEventListener('change', e => { remember(); state.record.input = e.target.value; changed(); }); $('record-bars').addEventListener('change', e => { remember(); state.record.bars = +e.target.value; changed(); }); $('record-quantize').addEventListener('change', e => { remember(); state.record.quantize = e.target.checked; changed(); });
  $('mic-button').addEventListener('click', async () => { if (micBusy || busy || engine.deckRecording) return; micBusy = true; updateRecordUI(); const token = operationToken; try { const enabled = !engine.micEnabled; const result = await engine.setMic(enabled); if (token !== operationToken || (enabled && result === false)) return; updatePlayback(); toast(engine.micEnabled ? 'Microphone enabled. Choose Microphone or Keys + microphone to record it.' : 'Microphone disabled.'); } catch (e) { toast(errorMessage(e)); } finally { micBusy = false; updateRecordUI(); } });
  $('deck-record-button').addEventListener('click', async () => {
    if (recordBusy || busy) return; const index = selectedDeck; let recordSnapshot = null; recordBusy = true; updateRecordUI();
    try {
      if (engine.deckRecording) { if (engine.deckRecording.status === 'armed') { engine.cancelDeckRecording(); toast('Armed take cancelled.'); } else await engine.stopDeckRecording(); }
      else { if ((state.record.input === 'mic' || state.record.input === 'both') && !engine.micEnabled) throw new Error('Enable microphone first, then press Record loop.'); const mode = $('record-mode').value; if (mode === 'overdub' && !state.assets[index]) throw new Error('Record or import a loop before overdubbing.'); recordSnapshot = remember(); const started = await engine.startDeckRecording(index, { mode, ...state.record }); if (started === false) forget(recordSnapshot); else { takeStarted = performance.now(); if (engine.deckRecording?.status === 'armed') toast('Recording armed for the next bar.'); } }
    } catch (e) { forget(recordSnapshot); toast(errorMessage(e)); } finally { recordBusy = false; updateRecordUI(); updatePlayback(); }
  });
  $('instrument-type').addEventListener('change', e => { releaseNotes(); remember(); state.source.voice = e.target.value; changed(); });
  $('instrument-octave').addEventListener('change', e => { releaseNotes(); remember(); state.source.root = (+e.target.value + 1) * 12; changed(); renderPiano(); });
  $('instrument-monitor').addEventListener('change', e => { remember(); state.source.monitor = e.target.checked; changed(); });
  function holdButton(id, down, up) {
    const button = $(id); let held = false;
    const press = () => { if (held) return; held = true; button.classList.add('active'); button.setAttribute('aria-pressed', 'true'); down(); };
    const release = () => { if (!held) return; held = false; button.classList.remove('active'); button.setAttribute('aria-pressed', 'false'); up(); };
    button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); press(); }); ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach(event => button.addEventListener(event, release));
    button.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) press(); } }); button.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(); } }); return release;
  }
  const releaseBrake = holdButton('brake-button', () => { brakeHeld = true; engine.brake(true); }, () => { brakeHeld = false; engine.brake(false); });
  const releaseReverse = holdButton('reverse-all-button', () => { reverseHeld = true; reverseBefore = state.decks.map(d => d.reverse); state.decks.forEach(d => { d.reverse = !d.reverse; }); engine.setState(state); updateDeckReadouts(); }, () => { reverseHeld = false; if (reverseBefore) { state.decks.forEach((d, i) => { d.reverse = reverseBefore[i]; }); reverseBefore = null; engine.setState(state); updateDeckReadouts(); } });
  $('capture-button').addEventListener('click', async () => {
    if (captureBusy || busy) return; captureBusy = true; updateRecordUI();
    const token = operationToken; try { if (engine.isRecording) { const blob = await engine.stopRecording(); if (token !== operationToken) return; if (blob?.size > 44) { download(blob, filename('-live.wav')); toast('Output recording saved.'); } else toast('No recorded audio to save.'); } else { const started = await engine.startRecording(); if (token !== operationToken || started === false) return; captureStart = performance.now(); $('capture-time').textContent = '00:00'; toast('Recording stereo output. Perform, then press Stop & save.'); } }
    catch (e) { toast(errorMessage(e)); } finally { captureBusy = false; updateRecordUI(); }
  });
  $('export-button').addEventListener('click', () => { $('export-target').value = 'mix'; $('export-bars').disabled = false; $('export-tail').disabled = false; $('export-status').textContent = ''; showDialog('export-dialog'); });
  $('deck-export-button').addEventListener('click', () => { if (!state.assets[selectedDeck]) return toast('This deck has no loop to export.'); $('export-target').value = String(selectedDeck); $('export-bars').disabled = true; $('export-tail').disabled = true; $('export-status').textContent = 'Single-deck export renders one complete loop with its current tape settings.'; showDialog('export-dialog'); });
  $('export-target').addEventListener('change', () => { const single = $('export-target').value !== 'mix'; $('export-bars').disabled = single; $('export-tail').disabled = single; $('export-status').textContent = single ? 'Single-deck export renders one complete loop with its current tape settings.' : ''; });
  $('render-button').addEventListener('click', async () => {
    if (busy || engine.deckRecording) return toast('Finish the current take before exporting.'); const target = $('export-target').value; if (target !== 'mix' && !state.assets[+target]) return toast('This deck has no loop to export.'); setBusy(true); $('export-status').textContent = 'Rendering stereo audio…';
    try { const blob = target === 'mix' ? await engine.renderWav(+$('export-bars').value, +$('export-tail').value) : await engine.renderDeckWav(+target); download(blob, filename(target === 'mix' ? '-mix.wav' : '-deck-' + String.fromCharCode(65 + +target) + '.wav')); $('export-status').textContent = 'WAV exported.'; toast('Stereo WAV exported.'); }
    catch (e) { $('export-status').textContent = errorMessage(e); } finally { setBusy(false); }
  });
  $('help-button').addEventListener('click', () => showDialog('help-dialog')); $('about-button').addEventListener('click', () => showDialog('help-dialog'));
  $('close-help').addEventListener('click', () => $('help-dialog').close()); $('close-export').addEventListener('click', () => $('export-dialog').close());
  $('confirm-cancel').addEventListener('click', () => finishConfirm(false)); $('close-confirm').addEventListener('click', () => finishConfirm(false)); $('confirm-accept').addEventListener('click', () => finishConfirm(true)); $('confirm-dialog').addEventListener('cancel', e => { e.preventDefault(); finishConfirm(false); });
  document.querySelectorAll('dialog').forEach(dialog => { dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { if (dialog.id === 'confirm-dialog') finishConfirm(false); else dialog.close(); } } }); });
  const keyMap = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12 };
  const typing = e => e.target.closest('input,select,textarea,[contenteditable="true"]');
  document.addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') { e.preventDefault(); panic(); return; } if (typing(e)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (!e.repeat) undo(); return; } if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space') { if (e.target.tagName === 'BUTTON') return; e.preventDefault(); if (!e.repeat) togglePlay(); return; }
    if (/^[1-4]$/.test(e.key)) { if (!e.repeat) selectDeck(+e.key - 1); return; }
    const key = e.key.toLowerCase(); if (key in keyMap) { e.preventDefault(); if (!e.repeat) playNote(state.source.root + keyMap[key], 'k' + key); }
  });
  document.addEventListener('keyup', e => { const id = 'k' + e.key.toLowerCase(), note = heldNotes.get(id); if (note != null) releaseNote(note, id); });
  window.addEventListener('blur', () => { releaseNotes(); releaseBrake(); releaseReverse(); gestureEnd(); }); document.addEventListener('visibilitychange', () => { if (document.hidden) { releaseNotes(); releaseBrake(); releaseReverse(); } });
  if (location.protocol === 'file:') { $('music-home').href = 'https://calebhaines.github.io/sidequest-prototypes/music/'; $('download-html').href = 'https://calebhaines.github.io/sidequest-prototypes/music/spool/index.html'; $('download-source').href = 'https://calebhaines.github.io/sidequest-prototypes/music/spool/SPOOL-source.zip'; }
  window.SpoolApp = Object.freeze({ get state() { return snapshot(); }, get engine() { return engine; }, getState: snapshot, loadState(next) { installState(next); },
    applyMusicLabPattern(overlay) {
      if (destructiveBlocked()) throw new Error('Finish the current recording or import before replacing the pattern.');
      const next = snapshot(); if (overlay) next.musicLabPattern = JSON.parse(JSON.stringify(overlay)); else delete next.musicLabPattern;
      const validated = S.normalize(next); remember(); installState(validated);
    }, selectDeck, importAudio, exportAudio,
    audioExport: { scopes: [{ id: 'mix', label: 'All decks / with master effects' }, { id: 'deck', label: 'Selected deck / tape processing', usesBars: false }, { id: 'source', label: 'Selected deck source / unprocessed', usesBars: false }], defaultBars: 1, maxBars: 16 },
    get audioImport() { return { maxSeconds: 30, decks: 4, targets: state.decks.map((deck, id) => ({ id, name: 'Deck ' + String.fromCharCode(65 + id), occupied: !!state.assets[id], assetName: state.assets[id]?.name || '' })) }; }
  });
  renderAll(); requestAnimationFrame(animate);
})();
