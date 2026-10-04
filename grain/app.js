(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
  const colors = ['#e8aa80', '#d0b782', '#adb895', '#93aaa2', '#a69db7', '#c1a08d', '#b4b982', '#839889'];
  const sources = [
    { id: 'white', name: 'White', color: '#d5d9c9', description: 'Full spectrum. Crisp, bright, and endlessly versatile.' },
    { id: 'pink', name: 'Pink', color: '#cba8ad', description: 'Equal energy per octave. Soft edges, natural warmth.' },
    { id: 'brown', name: 'Brown', color: '#be9176', description: 'Warm, deep, and beautifully uneven.' },
    { id: 'blue', name: 'Blue', color: '#88a9be', description: 'Rising energy. Airy fizz with a sharp little bite.' },
    { id: 'violet', name: 'Violet', color: '#b09abd', description: 'High-frequency energy. Electric, glassy, and precise.' },
    { id: 'grey', name: 'Grey', color: '#a1a89b', description: 'A sculpted spectrum. Balanced, textured, and human.' },
    { id: 'velvet', name: 'Velvet', color: '#b4b087', description: 'A thousand tiny impulses. Sparse, soft, and silky.' },
    { id: 'crackle', name: 'Crackle', color: '#c5a776', description: 'Broken little sparks. The warmth of worn vinyl.' },
    { id: 'metallic', name: 'Metallic', color: '#8faaa9', description: 'Inharmonic frequencies. Ringing, rough, and resonant.' },
    { id: 'digital', name: 'Digital', color: '#a4b982', description: 'Crushed bits. Angular edges and restless circuitry.' },
    { id: 'dust', name: 'Dust', color: '#ae997e', description: 'Scattered impulses. Dry, delicate, and imperfect.' },
    { id: 'radio', name: 'Radio', color: '#92a17e', description: 'A wandering signal. Tuned static and distant interference.' }
  ];
  const modes = ['kick', 'snare', 'hat', 'clap', 'rim', 'perc', 'texture', 'bass'];
  const engine = new window.NoiseEngine();
  let state = { ...clone(window.NOISE_PRESETS[0]), master: 0.78 };
  let banks = [state.tracks.map((t) => [...t.steps]), ...Array.from({ length: 3 }, () => Array.from({ length: 8 }, () => Array(16).fill(0)))];
  let bank = 0, selected = 0, playing = false, busy = false, playGeneration = 0, currentStep = -1, currentBar = 0;
  let history = [], toastTimer, saveTimer, exporting = false;
  const storageKey = 'grain-drum-machine-v1';
  const icon = (name) => '<svg aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  const pretty = (str) => str.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());

  function project() {
    banks[bank] = state.tracks.map((t) => [...t.steps]);
    return { format: 'grain-project', version: 1, state: clone(state), banks: clone(banks), bank, selected };
  }
  function validateProject(data) {
    if (!data || data.format !== 'grain-project' || data.version !== 1 || !data.state || !Array.isArray(data.state.tracks) || data.state.tracks.length !== 8) throw new Error('Please open a GRAIN project file.');
    const s = data.state;
    if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 80) throw new Error('The project needs a valid name.');
    const isNumber = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
    if (!isNumber(s.bpm, 40, 240) || !isNumber(s.swing, 0, .6) || !['master', 'drive', 'space'].every((key) => isNumber(s[key], 0, 1))) throw new Error('The project contains invalid sound settings.');
    const validSteps = (steps) => Array.isArray(steps) && steps.length === 16 && steps.every((v) => v === 0 || v === 1 || v === 2);
    s.tracks.forEach((track) => {
      if (!track || typeof track.name !== 'string' || track.name.length > 40 || !sources.some((n) => n.id === track.noise) || !modes.includes(track.mode) || !validSteps(track.steps) || !['level', 'tone', 'decay', 'pitch'].every((key) => isNumber(track[key], 0, 1)) || !isNumber(track.pan, -1, 1) || typeof track.mute !== 'boolean' || typeof track.solo !== 'boolean') throw new Error('The project contains an invalid voice.');
    });
    if (!Array.isArray(data.banks) || data.banks.length !== 4 || !data.banks.every((b) => Array.isArray(b) && b.length === 8 && b.every(validSteps))) throw new Error('The project contains an invalid pattern.');
    if (!Number.isInteger(data.bank) || data.bank < 0 || data.bank > 3 || !Number.isInteger(data.selected) || data.selected < 0 || data.selected > 7) throw new Error('The project contains invalid bank settings.');
    return data;
  }
  function restore(data) {
    const valid = validateProject(data);
    state = clone(valid.state); banks = clone(valid.banks); bank = valid.bank; selected = valid.selected;
    state.tracks.forEach((t, i) => { t.steps = [...banks[bank][i]]; });
  }
  try { const stored = localStorage.getItem(storageKey); if (stored) restore(JSON.parse(stored)); } catch (_) { /* A blocked storage area still permits making music. */ }
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(storageKey, JSON.stringify(project())); } catch (_) {} }, 250);
  }
  function remember() {
    history.push(project());
    if (history.length > 70) history.shift();
    $('undo-button').disabled = false;
  }
  function undo() {
    if (!history.length) return;
    const wasPlaying = playing || busy;
    if (wasPlaying) stop();
    restore(history.pop()); renderAll(); persist();
    $('undo-button').disabled = !history.length;
    if (wasPlaying) play();
    toast('One step back. Keep exploring.');
  }
  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3000);
  }
  function syncEffects() {
    engine.setMasterVolume(state.master);
    engine.setEffects({ drive: state.drive, space: state.space });
  }
  function audioReady() {
    $('audio-status').textContent = 'AUDIO ON · ' + (engine.context ? (engine.context.sampleRate / 1000).toFixed(1) + ' KHZ' : 'PURE SYNTHESIS');
    $('status-dot').classList.add('ready');
  }
  async function audition(track) {
    try { await engine.preview(track); syncEffects(); audioReady(); } catch (error) { toast(error.message || 'Audio could not start. Please try again.'); }
  }
  async function play() {
    if (busy || playing) return;
    const generation = ++playGeneration;
    busy = true;
    try {
      currentBar = 0;
      await engine.start(state, (step) => {
        if (!playing) return;
        if (step === 0) currentBar = currentBar % 4 + 1;
        setPlayhead(step);
        $('beat-position').textContent = currentBar + ' . ' + (Math.floor(step / 4) + 1) + ' . ' + (step % 4 + 1);
      });
      if (generation !== playGeneration || !engine.running) return;
      playing = true;
      syncEffects(); audioReady();
      $('play-button').innerHTML = icon('pause') + '<span>Pause</span>';
      $('play-button').setAttribute('aria-label', 'Pause sequencer');
      $('play-button').classList.add('playing');
      $('master-led').classList.add('playing');
      document.body.classList.add('is-playing');
    } catch (error) { toast(error.message || 'Your browser could not start audio.'); }
    finally { if (generation === playGeneration) busy = false; }
  }
  function stop() {
    playGeneration++; busy = false;
    playing = false; engine.stop(); setPlayhead(-1);
    $('play-button').innerHTML = icon('play') + '<span>Play</span>';
    $('play-button').setAttribute('aria-label', 'Play sequencer');
    $('play-button').classList.remove('playing');
    $('master-led').classList.remove('playing');
    document.body.classList.remove('is-playing');
    $('beat-position').textContent = '1 . 1 . 1';
  }
  function setPlayhead(step) {
    document.querySelectorAll('.current').forEach((el) => el.classList.remove('current'));
    if (step >= 0) document.querySelectorAll('[data-step="' + step + '"]').forEach((el) => el.classList.add('current'));
    currentStep = step;
  }

  const wavePaths = {
    kick: 'M1 14h3l2-9 3 19 3-17 3 12 3-8 3 6 3-4 3 2h4',
    snare: 'M1 14h4l2-8 2 16 2-19 2 21 2-14 2 8 2-12 2 15 2-9 2 5 2-2h3',
    hat: 'M1 14h5l2-10 2 20 2-18 2 15 2-12 2 9 2-6 2 3h9',
    rim: 'M1 14h7l2-11 2 22 2-18 2 12 2-7 2 4 2-2h9',
    clap: 'M1 14h3l2-9 2 18 2-16 2 15 2-18 2 19 2-16 2 12 2-8 2 6 2-4 2 1h3',
    perc: 'M1 14h4l3-10 3 20 3-15 3 10 3-6 3 2h8',
    texture: 'M1 14h2l2-6 2 13 2-9 2 3 2-9 2 14 2-11 2 9 2-3 2-9 2 12 2-5h4',
    bass: 'M1 14q3-12 6 0t6 0t6 0t6 0h6'
  };
  function renderRows() {
    const container = $('track-rows');
    const focused = container.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null;
    container.replaceChildren();
    const hasSolo = state.tracks.some((t) => t.solo);
    state.tracks.forEach((track, index) => {
      const row = document.createElement('div');
      row.className = 'track-row' + (index === selected ? ' selected' : '') + (track.mute || hasSolo && !track.solo ? ' muted' : '');
      row.style.setProperty('--track-color', colors[index]);
      const nameButton = document.createElement('button');
      nameButton.className = 'track-name-button'; nameButton.setAttribute('aria-label', 'Edit ' + pretty(track.name)); nameButton.setAttribute('aria-pressed', index === selected);
      nameButton.dataset.focusKey = 'voice-' + index;
      nameButton.innerHTML = '<svg class="track-mini-wave" viewBox="0 0 34 28" aria-hidden="true"><path d="' + wavePaths[track.mode] + '"/></svg><span class="track-info"><span class="track-name"></span><span class="track-noise"></span></span><span class="track-index">0' + (index + 1) + '</span>';
      nameButton.querySelector('.track-name').textContent = track.name;
      nameButton.querySelector('.track-noise').textContent = track.noise + ' noise';
      nameButton.addEventListener('click', () => { selected = index; renderRows(); renderVoice(); persist(); });
      row.append(nameButton);
      const steps = document.createElement('div'); steps.className = 'step-buttons'; steps.setAttribute('role', 'group'); steps.setAttribute('aria-label', pretty(track.name) + ' steps');
      track.steps.forEach((value, stepIndex) => {
        const button = document.createElement('button'); button.dataset.step = stepIndex; button.dataset.track = index;
        button.dataset.focusKey = 'step-' + index + '-' + stepIndex;
        updateStep(button, index, stepIndex);
        let holdTimer, touchStartX, touchStartY, held = false;
        const edit = (accent) => {
          remember();
          const previous = track.steps[stepIndex];
          track.steps[stepIndex] = accent ? (previous === 2 ? 1 : 2) : (previous ? 0 : 1);
          updateStep(button, index, stepIndex); persist();
          if (track.steps[stepIndex] && !playing) audition(track);
        };
        button.addEventListener('click', (event) => {
          if (held) { held = false; return; }
          edit(event.shiftKey);
        });
        button.addEventListener('pointerdown', (event) => {
          if (event.pointerType !== 'touch') return;
          held = false; touchStartX = event.clientX; touchStartY = event.clientY;
          holdTimer = setTimeout(() => { held = true; edit(true); }, 450);
        });
        button.addEventListener('pointermove', (event) => { if (event.pointerType === 'touch' && (Math.abs(event.clientX - touchStartX) > 8 || Math.abs(event.clientY - touchStartY) > 8)) clearTimeout(holdTimer); });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => button.addEventListener(type, () => clearTimeout(holdTimer)));
        button.addEventListener('contextmenu', (event) => event.preventDefault());
        button.addEventListener('keydown', (event) => {
          const delta = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
          if (!delta) return;
          event.preventDefault();
          const nextRow = (index + delta[0] + 8) % 8, nextStep = (stepIndex + delta[1] + 16) % 16;
          container.querySelector('[data-track="' + nextRow + '"][data-step="' + nextStep + '"]').focus();
        });
        steps.append(button);
      });
      row.append(steps);
      const mix = document.createElement('div'); mix.className = 'track-mix';
      ['mute', 'solo'].forEach((type) => {
        const button = document.createElement('button'); button.className = 'mix-button' + (track[type] ? ' ' + type + '-on' : '');
        button.textContent = type === 'mute' ? 'M' : 'S'; button.setAttribute('aria-label', (type === 'mute' ? 'Mute ' : 'Solo ') + pretty(track.name)); button.setAttribute('aria-pressed', track[type]);
        button.dataset.focusKey = type + '-' + index;
        button.title = (type === 'mute' ? 'Mute ' : 'Solo ') + pretty(track.name);
        button.addEventListener('click', () => { remember(); track[type] = !track[type]; renderRows(); persist(); });
        mix.append(button);
      });
      row.append(mix); container.append(row);
    });
    if (focused) { const replacement = container.querySelector('[data-focus-key="' + focused + '"]'); if (replacement) replacement.focus({ preventScroll: true }); }
  }
  function updateStep(button, row, step) {
    const value = state.tracks[row].steps[step];
    button.className = 'step' + (step % 4 === 0 ? ' beat' : '') + (value ? ' active' : '') + (value === 2 ? ' accent' : '') + (currentStep === step ? ' current' : '');
    button.setAttribute('aria-pressed', value > 0);
    button.setAttribute('aria-label', pretty(state.tracks[row].name) + ', step ' + (step + 1) + ', ' + (value === 2 ? 'accent' : value ? 'on' : 'off'));
    button.title = 'Step ' + (step + 1) + (value === 2 ? ' · Accent' : '') + ' · Shift + click to accent';
  }
  function renderBanks() {
    document.querySelectorAll('[data-bank]').forEach((button) => { const active = Number(button.dataset.bank) === bank; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
  }
  function knobControl(param, label, value, formatter, change) {
    const control = document.createElement('div'); control.className = 'knob-control';
    const knob = document.createElement('div'); knob.className = 'knob'; knob.setAttribute('role', 'slider'); knob.tabIndex = 0; knob.setAttribute('aria-label', label); knob.setAttribute('aria-valuemin', '0'); knob.setAttribute('aria-valuemax', '100'); knob.dataset.param = param;
    knob.innerHTML = '<svg viewBox="0 0 56 56" aria-hidden="true"><circle class="knob-track" cx="28" cy="28" r="23"/><circle class="knob-progress" cx="28" cy="28" r="23"/></svg><span class="knob-disc"></span>';
    const name = document.createElement('span'); name.className = 'knob-label'; name.textContent = label;
    const number = document.createElement('span'); number.className = 'knob-value';
    const draw = (val) => { value = val; knob.style.setProperty('--rotation', (-135 + val * 270) + 'deg'); knob.querySelector('.knob-progress').style.strokeDasharray = (val * 108.4) + ' 144.5'; number.textContent = formatter(val); knob.setAttribute('aria-valuenow', Math.round(val * 100)); knob.setAttribute('aria-valuetext', formatter(val)); };
    draw(value);
    let startY = 0, startX = 0, startValue = value, dragging = false;
    knob.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault(); knob.focus(); remember(); startY = event.clientY; startX = event.clientX; startValue = value; dragging = true; knob.setPointerCapture(event.pointerId);
    });
    knob.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const next = clamp(startValue + (startY - event.clientY + (event.clientX - startX) * .35) / (event.shiftKey ? 700 : 160), 0, 1);
      draw(next); change(next); persist();
    });
    const release = () => { dragging = false; };
    knob.addEventListener('pointerup', release); knob.addEventListener('pointercancel', release); knob.addEventListener('lostpointercapture', release);
    knob.addEventListener('keydown', (event) => {
      let next;
      if (['ArrowUp', 'ArrowRight'].includes(event.key)) next = value + (event.shiftKey ? .01 : .05);
      if (['ArrowDown', 'ArrowLeft'].includes(event.key)) next = value - (event.shiftKey ? .01 : .05);
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = 1;
      if (next === undefined) return;
      event.preventDefault(); remember(); next = clamp(next, 0, 1); draw(next); change(next); persist();
    });
    control.append(knob, name, number); return control;
  }
  function renderVoice() {
    const track = state.tracks[selected];
    $('selected-voice-index').textContent = 'VOICE 0' + (selected + 1);
    $('selected-voice-name').textContent = pretty(track.name);
    const descriptions = { kick: 'Deep, warm & a little unruly.', snare: 'Snap, body & beautiful friction.', hat: track.decay > .35 ? 'Let a little air into the room.' : 'A sharp edge. A steady pulse.', rim: 'Small sound. Plenty of character.', clap: 'A few hands. One big impression.', perc: 'The unexpected in the pocket.', texture: 'The details between the beats.', bass: 'Low frequencies. High feeling.' };
    $('voice-description').textContent = descriptions[track.mode];
    $('selected-noise-label').textContent = track.noise.toUpperCase() + ' NOISE';
    $('voice-knobs').replaceChildren();
    const percent = (v) => Math.round(v * 100) + '%';
    [['tone', 'TONE', percent], ['decay', 'DECAY', percent], ['pitch', 'PITCH', percent], ['level', 'LEVEL', percent]].forEach(([param, label, formatter]) => {
      $('voice-knobs').append(knobControl(param, label, track[param], formatter, (value) => { track[param] = value; drawVoice(); }));
    });
    document.querySelectorAll('.noise-source').forEach((button) => { const active = button.dataset.noise === track.noise; button.classList.toggle('selected', active); button.setAttribute('aria-pressed', active); });
    const source = sources.find((n) => n.id === track.noise);
    $('noise-caption').textContent = source.name + ' noise. ' + source.description;
    drawVoice();
  }
  function renderMaster() {
    const container = $('master-knobs'); container.replaceChildren();
    [['drive', 'DRIVE'], ['space', 'SPACE']].forEach(([param, label]) => container.append(knobControl(param, label, state[param], (v) => Math.round(v * 100) + '%', (value) => { state[param] = value; syncEffects(); })));
    $('master-volume').value = Math.round(state.master * 100); $('volume-value').textContent = Math.round(state.master * 100) + '%';
    syncEffects();
  }
  function renderAll() {
    $('tempo').value = state.bpm; $('swing').value = Math.round(state.swing * 100);
    $('swing-value').innerHTML = Math.round(state.swing * 100) + '<span>%</span>';
    const presetIndex = window.NOISE_PRESETS.findIndex((p) => p.name === state.name);
    $('preset-select').value = presetIndex >= 0 ? String(presetIndex) : 'custom';
    renderRows(); renderBanks(); renderVoice(); renderMaster();
  }
  function random() {
    remember();
    state.tracks.forEach((track, row) => {
      track.steps = Array.from({ length: 16 }, (_, step) => {
        let chance = [.12, .04, .14, .06, .04, .02, .12, .06][row];
        if (row === 0 && (step === 0 || step === 8)) return 2;
        if ((row === 1 || row === 5) && (step === 4 || step === 12)) return row === 1 ? 2 : 1;
        if (row === 2) chance = step % 2 ? .32 : .94;
        if (row === 3 && step % 8 === 6) chance = .8;
        if (row === 4 && step % 4 === 2) chance = .4;
        if (row === 6 && step % 4 === 3) chance = .5;
        if (row === 7 && step === 0) return 1;
        return Math.random() < chance ? (Math.random() < .15 ? 2 : 1) : 0;
      });
    });
    renderRows(); persist(); toast('A fresh pocket of chaos.');
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function safeName(name = state.name) { return String(name || 'my-groove').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-groove'; }
  async function exportWav() {
    if (exporting) return;
    exporting = true; $('export-button').disabled = true; $('export-button').innerHTML = icon('download') + '<span>Rendering…</span>';
    const snapshot = clone(state), filename = 'grain-' + safeName(snapshot.name) + '-' + snapshot.bpm + 'bpm.wav';
    toast('Rendering four bars of beautiful noise…');
    try { const blob = await engine.exportWav(snapshot); download(blob, filename); toast('Your four-bar loop is ready. Effect tail included.'); }
    catch (error) { toast(error.message || 'Could not render audio. Please try again.'); }
    finally { exporting = false; $('export-button').disabled = false; $('export-button').innerHTML = icon('download') + '<span>Export WAV</span>'; }
  }

  // The displays are drawn locally so the entire instrument travels in one file.
  let heroTime = 0, lastFrame = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function drawHero(time) {
    const canvas = $('hero-wave'), ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#38432d'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    for (let x = 2; x < w; x += 4) {
      const env = Math.sin(x / w * Math.PI) ** 1.8;
      const beat = .3 + .7 * Math.abs(Math.sin(x * .014 + time * .4));
      const signal = Math.abs(Math.sin(x * .73 + time) * Math.cos(x * .17 - time * .5));
      const amplitude = (3 + signal * 40) * env * beat;
      ctx.strokeStyle = x < w * .48 ? '#c59672' : '#74865e'; ctx.globalAlpha = .3 + signal * .7; ctx.beginPath(); ctx.moveTo(x, h / 2 - amplitude); ctx.lineTo(x, h / 2 + amplitude); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function drawVoice() {
    const canvas = $('voice-wave'), ctx = canvas.getContext('2d'); if (!ctx) return;
    const track = state.tracks[selected], w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h); ctx.strokeStyle = '#344128'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.strokeStyle = colors[selected]; ctx.lineWidth = 1.3; ctx.beginPath();
    const noiseIndex = sources.findIndex((s) => s.id === track.noise);
    for (let x = 0; x < w; x++) {
      const envelope = Math.exp(-x / (w * (.09 + track.decay * .65))) * Math.min(1, x / 8);
      const signal = Math.sin(x * (.22 + track.pitch * .4)) * .65 + Math.sin(x * (1.8 + noiseIndex * .41)) * (.1 + track.tone * .4);
      const y = h / 2 + signal * envelope * 30;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  function animate(timestamp) {
    if (playing && !reducedMotion && timestamp - lastFrame > 60) { heroTime += .065; drawHero(heroTime); lastFrame = timestamp; }
    requestAnimationFrame(animate);
  }

  window.NOISE_PRESETS.forEach((preset, i) => { const option = document.createElement('option'); option.value = i; option.textContent = preset.name; $('preset-select').append(option); });
  const customOption = document.createElement('option'); customOption.value = 'custom'; customOption.textContent = 'My own beautiful noise'; customOption.hidden = true; $('preset-select').append(customOption);
  for (let i = 0; i < 16; i++) { const label = document.createElement('span'); label.className = 'step-number' + (i % 4 === 0 ? ' beat' : ''); label.dataset.step = i; label.textContent = String(i + 1).padStart(2, '0'); $('step-numbers').append(label); }
  sources.forEach((source) => {
    const button = document.createElement('button'); button.className = 'noise-source'; button.dataset.noise = source.id; button.style.setProperty('--noise-color', source.color); button.innerHTML = '<span aria-hidden="true"></span>' + source.name;
    button.title = source.name + ' noise — ' + source.description; button.setAttribute('aria-label', 'Use ' + source.name.toLowerCase() + ' noise');
    button.addEventListener('click', () => { if (state.tracks[selected].noise === source.id) return; remember(); state.tracks[selected].noise = source.id; renderRows(); renderVoice(); persist(); if (!playing) audition(state.tracks[selected]); });
    $('noise-sources').append(button);
  });
  $('play-button').addEventListener('click', () => playing || busy ? stop() : play());
  $('restart-button').addEventListener('click', () => { stop(); play(); });
  $('audition-button').addEventListener('click', () => audition(state.tracks[selected]));
  $('tempo').addEventListener('change', () => { remember(); state.bpm = Math.round(clamp($('tempo').value || state.bpm, 40, 240)); $('tempo').value = state.bpm; persist(); });
  $('swing').addEventListener('pointerdown', remember);
  const rangeKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
  $('swing').addEventListener('keydown', (event) => { if (rangeKeys.includes(event.key)) remember(); });
  $('swing').addEventListener('input', () => { state.swing = clamp($('swing').value / 100, 0, .6); $('swing-value').innerHTML = Math.round(state.swing * 100) + '<span>%</span>'; persist(); });
  $('master-volume').addEventListener('pointerdown', remember);
  $('master-volume').addEventListener('keydown', (event) => { if (rangeKeys.includes(event.key)) remember(); });
  $('master-volume').addEventListener('input', () => { state.master = clamp($('master-volume').value / 100, 0, 1); $('volume-value').textContent = Math.round(state.master * 100) + '%'; engine.setMasterVolume(state.master); persist(); });
  $('preset-select').addEventListener('change', () => {
    const preset = window.NOISE_PRESETS[Number($('preset-select').value)]; if (!preset) return;
    remember(); const wasPlaying = playing || busy; if (wasPlaying) stop();
    state = { ...clone(preset), master: state.master }; banks = [state.tracks.map((t) => [...t.steps]), ...Array.from({ length: 3 }, () => Array.from({ length: 8 }, () => Array(16).fill(0)))]; bank = 0;
    renderAll(); persist(); toast(preset.tagline); if (wasPlaying) play();
  });
  document.querySelectorAll('[data-bank]').forEach((button) => button.addEventListener('click', () => {
    const next = Number(button.dataset.bank); if (next === bank) return;
    banks[bank] = state.tracks.map((t) => [...t.steps]); bank = next; state.tracks.forEach((t, i) => { t.steps = [...banks[bank][i]]; }); renderRows(); renderBanks(); persist();
  }));
  $('copy-pattern').addEventListener('click', () => { remember(); const next = (bank + 1) % 4; banks[next] = state.tracks.map((t) => [...t.steps]); persist(); toast('Pattern ' + 'ABCD'[bank] + ' copied to ' + 'ABCD'[next] + '.'); });
  $('clear-button').addEventListener('click', () => { remember(); state.tracks.forEach((track) => { track.steps = Array(16).fill(0); }); renderRows(); persist(); toast('A clean canvas.'); });
  $('random-button').addEventListener('click', random);
  $('undo-button').addEventListener('click', undo);
  $('save-button').addEventListener('click', () => { download(new Blob([JSON.stringify(project(), null, 2)], { type: 'application/json' }), 'grain-' + safeName() + '.json'); toast('Project saved. Take your noise anywhere.'); });
  $('open-button').addEventListener('click', () => $('project-file').click());
  $('project-file').addEventListener('change', async (event) => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('That file is too large for a GRAIN project.');
      const data = validateProject(JSON.parse(await file.text())); remember(); stop(); restore(data); renderAll(); persist(); toast('Your noise, right where you left it.');
    } catch (error) { toast(error instanceof SyntaxError ? 'That file is not a valid GRAIN project.' : error.message); }
    finally { event.target.value = ''; }
  });
  $('export-button').addEventListener('click', exportWav);
  $('help-button').addEventListener('click', () => $('help-dialog').showModal());
  $('close-help').addEventListener('click', () => $('help-dialog').close());
  $('help-dialog').addEventListener('click', (event) => { if (event.target === $('help-dialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); } });
  document.querySelector('.brand').addEventListener('click', (event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' }); });
  document.addEventListener('keydown', (event) => {
    if ($('help-dialog').open || event.target.matches('input,select,textarea') || event.target.isContentEditable) return;
    if (event.code === 'Space' && !event.target.matches('button,[role=slider]')) { event.preventDefault(); playing || busy ? stop() : play(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
    if (!event.ctrlKey && !event.metaKey && /^[1-8]$/.test(event.key)) { selected = Number(event.key) - 1; renderRows(); renderVoice(); audition(state.tracks[selected]); persist(); }
  });
  window.addEventListener('pagehide', () => { try { localStorage.setItem(storageKey, JSON.stringify(project())); } catch (_) {} engine.stop(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && playing && engine.context && engine.context.state !== 'running') { stop(); toast('Audio paused. Press play to pick up the rhythm.'); } });
  renderAll(); drawHero(0); requestAnimationFrame(animate);
  window.GrainApp = { getState: () => clone(state), getProject: project, isPlaying: () => playing, play, stop, engine };
}());
