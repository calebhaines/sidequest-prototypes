(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
  const model = window.TineModel;
  const presets = window.TINE_PRESETS;
  const engine = new window.TineEngine();
  const storageKey = 'tine-drum-machine-v1';
  const colors = ['#efab8e', '#cdaea7', '#d4c2a0', '#aaafa4', '#b9acd0', '#b5bca7', '#98b0ba', '#cf9c8b'];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rangeKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
  function presetState(preset, master = .78) {
    return { name: preset.name, bpm: preset.bpm, swing: preset.swing, drive: preset.drive, space: preset.space, master, tracks: preset.tracks.map((track) => model.normalizeTrack(track)) };
  }
  let state = presetState(presets[0]);
  let banks = [state.tracks.map((track) => [...track.steps]), ...Array.from({ length: 3 }, emptyBank)];
  let bank = 0, selected = 0, tab = 'resonance';
  let playing = false, loading = false, playGeneration = 0, currentStep = -1, currentBar = 0;
  let exporting = false, history = [], saveTimer, toastTimer;
  function emptyBank() { return Array.from({ length: 8 }, () => Array(16).fill(0)); }
  function modelInfo(id) { return model.models.find((item) => item.id === id) || model.models[0]; }
  function project() {
    banks[bank] = state.tracks.map((track) => [...track.steps]);
    return { app: 'TINE', version: 2, state: clone(state), banks: clone(banks), bank, selected };
  }
  function validateProject(data) {
    try { return model.upgradeProject(data); }
    catch (_) { throw new Error('Please choose a valid TINE project. Its sound and pattern settings must be complete.'); }
  }
  function restore(data) {
    const valid = validateProject(data);
    state = clone(valid.state); banks = clone(valid.banks); bank = valid.bank; selected = valid.selected;
    state.tracks = state.tracks.map((track, index) => { const next = model.normalizeTrack(track); next.steps = [...banks[bank][index]]; return next; });
  }
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) { restore(JSON.parse(saved)); localStorage.setItem(storageKey, JSON.stringify(project())); }
  } catch (_) { /* A private or offline browser can play without storage. */ }
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(storageKey, JSON.stringify(project())); } catch (_) {} }, 240);
  }
  function remember() { history.push(project()); if (history.length > 70) history.shift(); $('undo-button').disabled = false; }
  function focusKey() {
    const active = document.activeElement;
    return active && (active.dataset.focusKey || active.id) || null;
  }
  function restoreFocus(key) {
    if (!key) return;
    const target = Array.from(document.querySelectorAll('[data-focus-key]')).find((item) => item.dataset.focusKey === key) || $(key);
    if (target) target.focus({ preventScroll: true });
  }
  function undo() {
    if (!history.length) return;
    const focus = focusKey(), resume = playing || loading;
    if (resume) stop(); restore(history.pop()); renderAll(); restoreFocus(focus); persist();
    $('undo-button').disabled = !history.length;
    toast('Previous move restored.'); if (resume) play();
  }
  function toast(message) {
    $('toast').textContent = String(message); $('toast').classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500);
  }
  function syncEffects() { engine.setMasterVolume(state.master); engine.setEffects({ drive: state.drive, space: state.space }); }
  function audioReady() {
    $('audio-status').textContent = engine.context ? 'AUDIO ON · ' + (engine.context.sampleRate / 1000).toFixed(1) + ' KHZ' : 'AUDIO ON';
    $('status-dot').classList.add('ready');
  }
  async function audition(track = state.tracks[selected]) {
    try { await engine.preview(track, state.bpm); syncEffects(); audioReady(); }
    catch (error) { toast(error.message || 'Audio could not start. Try playing again.'); }
  }
  function playButton(active) {
    const button = $('play-button');
    button.replaceChildren();
    const mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); mark.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', active ? '#i-pause' : '#i-play'); mark.append(use);
    const text = document.createElement('span'); text.textContent = active ? 'Pause' : 'Play';
    button.append(mark, text); button.classList.toggle('playing', active); button.setAttribute('aria-label', active ? 'Pause sequencer' : 'Play sequencer');
    $('master-led').classList.toggle('playing', active); document.body.classList.toggle('is-playing', active);
  }
  async function play() {
    if (playing || loading) return;
    const generation = ++playGeneration; loading = true; currentBar = 0;
    $('play-button').setAttribute('aria-busy', 'true');
    try {
      await engine.start(state, (step) => {
        if (!playing || generation !== playGeneration) return;
        if (step === 0) currentBar = currentBar % 4 + 1;
        setPlayhead(step);
        $('beat-position').textContent = currentBar + ' . ' + (Math.floor(step / 4) + 1) + ' . ' + (step % 4 + 1);
      });
      if (generation !== playGeneration || !engine.running) return;
      playing = true; syncEffects(); audioReady(); playButton(true);
    } catch (error) { if (generation === playGeneration) { stop(); toast(error.message || 'Your browser could not start audio.'); } }
    finally { if (generation === playGeneration) { loading = false; $('play-button').removeAttribute('aria-busy'); } }
  }
  function stop() {
    ++playGeneration; loading = false; playing = false; engine.stop(); setPlayhead(-1); playButton(false);
    $('play-button').removeAttribute('aria-busy'); $('beat-position').textContent = '1 . 1 . 1';
  }
  function setPlayhead(step) {
    document.querySelectorAll('.current').forEach((item) => item.classList.remove('current'));
    if (step >= 0) document.querySelectorAll('[data-step="' + step + '"]').forEach((item) => item.classList.add('current'));
    currentStep = step;
  }
  function updateStep(button, row, step) {
    const track = state.tracks[row], value = track.steps[step];
    button.className = 'step' + (step % 4 === 0 ? ' beat' : '') + (value ? ' active' : '') + (value === 2 ? ' accent' : '') + (currentStep === step ? ' current' : '');
    button.setAttribute('aria-pressed', value > 0);
    button.setAttribute('aria-label', track.name + ', step ' + (step + 1) + ', ' + (value === 2 ? 'accent' : value ? 'on' : 'off'));
    button.title = 'Step ' + (step + 1) + ' · Shift + click or touch and hold to accent';
  }
  function glyph(id) {
    const paths = {
      membrane: 'M4 14c6-17 20-17 26 0M4 14c6 17 20 17 26 0M4 14h26',
      drumhead: 'M5 9c0-7 24-7 24 0v13c0 7-24 7-24 0zM5 9c0 7 24 7 24 0M10 12v12M24 12v12',
      plate: 'M4 9l15-6 12 12-15 10zM7 10l19 10M15 5l-4 18',
      string: 'M3 15h6q4-20 8 0t8 0h6',
      beam: 'M4 8h26v14H4zM8 8v14M26 8v14M9 15q8-10 16 0',
      marimba: 'M4 7h7v19H4zM14 5h7v19h-7zM24 3h7v19h-7z',
      bell: 'M6 23c5-4 4-7 5-12 1-9 11-9 12 0 1 5 0 8 5 12zM6 23c7 4 15 4 22 0M15 27h4M17 2v4',
      bowl: 'M4 12c0-6 26-6 26 0M4 12c2 18 24 18 26 0M4 12c0 6 26 6 26 0M11 7l-4-4',
      tube: 'M8 6c0-4 18-4 18 0v18c0 4-18 4-18 0zM8 6c0 4 18 4 18 0M8 24c0-4 18-4 18 0M12 10v10M22 10v10'
    };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 34 30'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', paths[id] || paths.membrane); path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.3'); svg.append(path); return svg;
  }
  function renderRows() {
    const container = $('track-rows'), focus = container.contains(document.activeElement) ? focusKey() : null;
    container.replaceChildren(); const hasSolo = state.tracks.some((track) => track.solo);
    state.tracks.forEach((track, index) => {
      const row = document.createElement('div'); row.className = 'track-row' + (index === selected ? ' selected' : '') + (track.mute || hasSolo && !track.solo ? ' muted' : ''); row.style.setProperty('--track-color', colors[index]);
      const choose = document.createElement('button'); choose.className = 'track-info'; choose.dataset.focusKey = 'voice-' + index;
      choose.setAttribute('aria-label', 'Edit ' + track.name); choose.setAttribute('aria-pressed', index === selected);
      const symbol = glyph(track.model); symbol.classList.add('track-icon');
      const labels = document.createElement('span'); labels.className = 'track-label';
      const name = document.createElement('span'); name.className = 'track-name'; name.textContent = track.name;
      const meta = document.createElement('span'); meta.className = 'track-meta'; meta.textContent = modelInfo(track.model).name + ' · ' + Math.round(track.pitchHz) + ' Hz';
      const number = document.createElement('span'); number.className = 'track-index'; number.textContent = String(index + 1).padStart(2, '0');
      labels.append(name, meta); choose.append(symbol, labels, number);
      choose.addEventListener('click', () => { selected = index; renderRows(); renderVoice(); persist(); }); row.append(choose);
      const steps = document.createElement('div'); steps.className = 'step-grid'; steps.setAttribute('role', 'group'); steps.setAttribute('aria-label', track.name + ' steps');
      track.steps.forEach((_, stepIndex) => {
        const button = document.createElement('button'); button.dataset.step = stepIndex; button.dataset.track = index; button.dataset.focusKey = 'step-' + index + '-' + stepIndex; updateStep(button, index, stepIndex);
        let holdTimer, touchX = 0, touchY = 0, held = false;
        const edit = (accent) => {
          remember(); const previous = track.steps[stepIndex]; track.steps[stepIndex] = accent ? previous === 2 ? 1 : 2 : previous ? 0 : 1;
          updateStep(button, index, stepIndex); persist(); if (track.steps[stepIndex] && !playing) audition(track);
        };
        button.addEventListener('click', (event) => { if (held) { held = false; return; } edit(event.shiftKey); });
        button.addEventListener('pointerdown', (event) => { if (event.pointerType !== 'touch') return; held = false; touchX = event.clientX; touchY = event.clientY; holdTimer = setTimeout(() => { held = true; edit(true); }, 450); });
        button.addEventListener('pointermove', (event) => { if (event.pointerType === 'touch' && (Math.abs(event.clientX - touchX) > 8 || Math.abs(event.clientY - touchY) > 8)) clearTimeout(holdTimer); });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => button.addEventListener(type, () => clearTimeout(holdTimer)));
        button.addEventListener('contextmenu', (event) => event.preventDefault());
        button.addEventListener('keydown', (event) => {
          const delta = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key]; if (!delta) return;
          event.preventDefault(); const nextRow = (index + delta[0] + 8) % 8, nextStep = (stepIndex + delta[1] + 16) % 16;
          container.querySelector('[data-track="' + nextRow + '"][data-step="' + nextStep + '"]').focus();
        }); steps.append(button);
      }); row.append(steps);
      const actions = document.createElement('div'); actions.className = 'track-actions';
      ['mute', 'solo'].forEach((key) => {
        const button = document.createElement('button'); button.className = 'mix-button' + (track[key] ? ' ' + key + '-on' : ''); button.dataset.focusKey = key + '-' + index; button.textContent = key === 'mute' ? 'M' : 'S';
        button.setAttribute('aria-label', (key === 'mute' ? 'Mute ' : 'Solo ') + track.name); button.setAttribute('aria-pressed', track[key]);
        button.addEventListener('click', () => { remember(); track[key] = !track[key]; renderRows(); persist(); }); actions.append(button);
      }); row.append(actions); container.append(row);
    }); restoreFocus(focus);
  }
  function renderBanks() { document.querySelectorAll('[data-bank]').forEach((button) => { const active = Number(button.dataset.bank) === bank; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); }); }
  function normalized(descriptor, value) {
    return clamp(descriptor.log ? Math.log(value / descriptor.min) / Math.log(descriptor.max / descriptor.min) : (value - descriptor.min) / (descriptor.max - descriptor.min), 0, 1);
  }
  function physical(descriptor, value) {
    return descriptor.log ? descriptor.min * (descriptor.max / descriptor.min) ** value : descriptor.min + (descriptor.max - descriptor.min) * value;
  }
  function knob(descriptor, initial, change, prefix = '') {
    const key = descriptor.key || descriptor.id, label = descriptor.label;
    const tile = document.createElement('div'); tile.className = 'knob-control'; tile.dataset.param = key; tile.title = descriptor.hint || label;
    const control = document.createElement('button'); control.type = 'button'; control.className = 'slider-knob'; control.setAttribute('role', 'slider'); control.setAttribute('aria-label', label); control.setAttribute('aria-valuemin', descriptor.min); control.setAttribute('aria-valuemax', descriptor.max); control.dataset.param = key; control.dataset.focusKey = prefix + 'param-' + key;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 56 56'); svg.setAttribute('aria-hidden', 'true');
    ['knob-track', 'knob-progress'].forEach((className) => { const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); circle.setAttribute('class', className); circle.setAttribute('cx', '28'); circle.setAttribute('cy', '28'); circle.setAttribute('r', '23'); svg.append(circle); });
    const disk = document.createElement('span'); disk.className = 'knob-dial'; control.append(svg, disk);
    const title = document.createElement('span'); title.className = 'knob-label'; title.textContent = label;
    const output = document.createElement('span'); output.className = 'knob-value';
    let value = initial, dragging = false, originY = 0, originX = 0, originValue = 0;
    const format = (number) => descriptor.format ? descriptor.format(number) : model.format(descriptor, number);
    const draw = (number) => {
      value = clamp(number, descriptor.min, descriptor.max); const position = normalized(descriptor, value);
      control.style.setProperty('--rotation', (-135 + position * 270) + 'deg'); control.querySelector('.knob-progress').style.strokeDasharray = (position * 108.4) + ' 144.5';
      output.textContent = format(value); control.setAttribute('aria-valuenow', Number(value.toFixed(6))); control.setAttribute('aria-valuetext', format(value));
    };
    const update = (position) => { const next = physical(descriptor, clamp(position, 0, 1)); draw(next); change(value); persist(); };
    control.addEventListener('pointerdown', (event) => { if (event.button !== 0) return; event.preventDefault(); control.focus(); remember(); originY = event.clientY; originX = event.clientX; originValue = normalized(descriptor, value); dragging = true; control.setPointerCapture(event.pointerId); });
    control.addEventListener('pointermove', (event) => { if (dragging) update(originValue + (originY - event.clientY + (event.clientX - originX) * .2) / (event.shiftKey ? 900 : 180)); });
    const release = () => { dragging = false; }; ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((event) => control.addEventListener(event, release));
    control.addEventListener('keydown', (event) => {
      let next; const position = normalized(descriptor, value), amount = event.shiftKey ? .005 : .025;
      if (event.key === 'ArrowUp' || event.key === 'ArrowRight') next = position + amount;
      if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') next = position - amount;
      if (event.key === 'Home') next = 0; if (event.key === 'End') next = 1;
      if (next === undefined) return; event.preventDefault(); remember(); update(next);
    });
    draw(initial); tile.append(control, title, output); tile.updateValue = draw; return tile;
  }
  function renderVoice() {
    const focus = $('knob-grid').contains(document.activeElement) || $('selectors').contains(document.activeElement) ? focusKey() : null;
    const track = state.tracks[selected], info = modelInfo(track.model);
    $('voice-index').textContent = 'VOICE ' + String(selected + 1).padStart(2, '0'); $('voice-name').textContent = track.name;
    $('voice-description').textContent = info.description; $('model-description').textContent = info.description;
    document.querySelectorAll('.model-button').forEach((button) => { const active = button.dataset.model === track.model; button.classList.toggle('selected', active); button.setAttribute('aria-pressed', active); });
    document.querySelectorAll('button[data-tab]').forEach((button) => { const active = button.dataset.tab === tab; button.classList.toggle('active', active); button.setAttribute('aria-selected', active); button.tabIndex = active ? 0 : -1; });
    $('knob-grid').setAttribute('aria-labelledby', 'tab-' + tab); $('knob-grid').dataset.group = tab; $('knob-grid').dataset.tab = tab;
    const note = document.querySelector('.editor-note');
    if (note) note.textContent = ({ resonance: 'Strike position changes which modes vibrate. Damping shortens their upper harmonics.', exciter: 'Striking material shapes the contact. Texture adds surface detail; rebound creates diminishing repeat strikes.', motion: 'Each accent is louder. Accent color brightens it; variation gives each strike small differences.' })[tab];
    $('knob-grid').replaceChildren();
    const addKnob = (descriptor) => {
      const key = descriptor.key || descriptor.id;
      $('knob-grid').append(knob(descriptor, track[key], (value) => { track[key] = value; drawVoice(); refreshTrackMeta(); }));
    };
    if (tab === 'exciter') {
      [
        ['Contact', ['mallet', 'hardness', 'strikeTime', 'contactTexture']],
        ['Noise', ['noise', 'noiseAttack', 'noiseDecay', 'noiseCutoff']],
        ['Rebound & mix', ['rebound', 'reboundTime', 'direct']]
      ].forEach(([label, keys]) => {
        const heading = document.createElement('div'); heading.className = 'knob-section'; heading.setAttribute('role', 'heading'); heading.setAttribute('aria-level', '3'); heading.textContent = label;
        $('knob-grid').append(heading);
        keys.forEach((key) => { const descriptor = model.groups.exciter.find((item) => (item.key || item.id) === key); if (descriptor) addKnob(descriptor); });
      });
    } else model.groups[tab].forEach(addKnob);
    $('selectors').replaceChildren();
    if (tab === 'exciter') {
      const materialWrapper = document.createElement('div'); materialWrapper.className = 'selector synthesis-selector material-selector';
      const materialLabel = document.createElement('label'); materialLabel.htmlFor = 'strike-material'; materialLabel.textContent = 'Striking material';
      const materialSelect = document.createElement('select'); materialSelect.id = 'strike-material'; materialSelect.dataset.focusKey = 'strike-material'; materialSelect.setAttribute('aria-describedby', 'strike-material-description');
      const materialDescription = document.createElement('p'); materialDescription.className = 'selector-description'; materialDescription.id = 'strike-material-description';
      const describeMaterial = () => {
        const selectedMaterial = model.strikeMaterials.find((item) => item.id === track.strikeMaterial) || model.strikeMaterials[0];
        materialDescription.textContent = selectedMaterial.description || selectedMaterial.hint;
        materialSelect.title = selectedMaterial.hint || selectedMaterial.description || selectedMaterial.name;
      };
      model.strikeMaterials.forEach((material) => { const option = document.createElement('option'); option.value = material.id; option.textContent = material.name; option.title = material.description || material.hint || material.name; materialSelect.append(option); });
      materialSelect.value = track.strikeMaterial;
      materialSelect.addEventListener('change', () => { remember(); track.strikeMaterial = materialSelect.value; describeMaterial(); drawVoice(); persist(); if (!playing) audition(track); });
      materialWrapper.append(materialLabel, materialSelect); $('selectors').append(materialWrapper);
      const wrapper = document.createElement('div'); wrapper.className = 'selector synthesis-selector noise-selector';
      const label = document.createElement('label'); label.htmlFor = 'noise-color'; label.textContent = 'Noise color';
      const select = document.createElement('select'); select.id = 'noise-color'; select.dataset.focusKey = 'noise-color'; select.setAttribute('aria-label', 'Noise color');
      ['white', 'pink', 'brown', 'blue', 'velvet', 'crackle'].forEach((color) => { const option = document.createElement('option'); option.value = color; option.textContent = color.charAt(0).toUpperCase() + color.slice(1); select.append(option); }); select.value = track.noiseColor;
      select.addEventListener('change', () => { remember(); track.noiseColor = select.value; drawVoice(); persist(); }); wrapper.append(label, select); $('selectors').append(wrapper, materialDescription); describeMaterial();
    }
    drawVoice(); restoreFocus(focus);
  }
  function refreshTrackMeta() {
    const meta = $('track-rows').children[selected].querySelector('.track-meta'), track = state.tracks[selected];
    meta.textContent = modelInfo(track.model).name + ' · ' + Math.round(track.pitchHz) + ' Hz';
  }
  function renderMaster() {
    const focus = $('master-knobs').contains(document.activeElement) ? focusKey() : null; $('master-knobs').replaceChildren();
    [['drive', 'DRIVE'], ['space', 'SPACE']].forEach(([key, label]) => {
      $('master-knobs').append(knob({ id: key, key, label, min: 0, max: 1, format: (value) => Math.round(value * 100) + '%' }, state[key], (value) => { state[key] = value; syncEffects(); }, 'master-'));
    }); $('master-volume').value = Math.round(state.master * 100); $('volume-value').textContent = Math.round(state.master * 100) + '%'; syncEffects(); restoreFocus(focus);
  }
  function renderAll() {
    $('tempo').value = state.bpm; $('swing').value = Math.round(state.swing * 100); $('swing-value').textContent = Math.round(state.swing * 100) + '%';
    const preset = presets.findIndex((item) => item.name === state.name); $('preset-select').value = preset >= 0 ? String(preset) : 'custom';
    renderRows(); renderBanks(); renderVoice(); renderMaster(); $('undo-button').disabled = !history.length;
  }
  function mutateVoice() {
    remember(); const track = state.tracks[selected];
    ['tone', 'stiffness', 'damping', 'position', 'mallet', 'hardness', 'noise', 'variation', 'velocityTone', 'contactTexture', 'rebound'].forEach((key) => {
      const min = key === 'position' ? .02 : 0, max = key === 'position' ? .98 : 1;
      const amount = key === 'contactTexture' || key === 'rebound' ? .16 : key === 'noise' ? .24 : .35;
      track[key] = clamp(track[key] + (Math.random() - .5) * amount, min, max);
    });
    track.pitchHz = clamp(track.pitchHz * 2 ** ((Math.random() - .5) * .5), 20, 2000);
    track.decay = clamp(track.decay * (.75 + Math.random() * .5), .04, 4);
    track.pitchEnv = clamp(track.pitchEnv + (Math.random() - .5) * 6, -24, 24);
    track.reboundTime = clamp(track.reboundTime * (.85 + Math.random() * .3), .002, .08);
    renderVoice(); refreshTrackMeta(); persist(); audition(track); toast('Voice mutated. The saucepan has changed its mind.');
  }
  function randomPattern() {
    remember(); state.tracks.forEach((track, row) => {
      track.steps = Array.from({ length: 16 }, (_, step) => {
        if (row === 0 && (step === 0 || step === 8)) return 2;
        if (row === 1 && (step === 4 || step === 12)) return 2;
        if (row === 7 && step === 0) return 1;
        const chance = row === 2 ? step % 2 ? .28 : .85 : row === 3 ? .2 : row === 4 ? .15 : row === 5 ? .17 : row === 6 ? .16 : .1;
        return Math.random() < chance ? Math.random() < .15 ? 2 : 1 : 0;
      });
    }); renderRows(); persist(); toast('New groove generated. The teaspoons have voted.');
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function safeName(name = state.name) { return String(name || 'my-pattern').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-pattern'; }
  async function exportAudio({ scope = 'pattern', bars = 1, tailSeconds, signal } = {}) {
    if (signal?.aborted) throw new DOMException('Audio export cancelled.', 'AbortError');
    if (!['pattern', 'voice', 'hit'].includes(scope)) throw new Error('Choose a pattern, selected voice pattern, or selected voice hit.');
    if (exporting) throw new Error('Wait for the current TINE render to finish.');
    const snapshot = clone(state), voice = selected;
    if (scope !== 'pattern') snapshot.tracks = [{ ...snapshot.tracks[voice], mute: false, solo: false }];
    if (scope === 'hit') snapshot.tracks[0].steps = [1, ...Array(15).fill(0)];
    const sourceLabel = scope === 'pattern' ? snapshot.name : snapshot.tracks[0].name || 'Voice ' + (voice + 1);
    exporting = true;
    try {
      const blob = await engine.exportWav(snapshot, { bars, scope: scope === 'hit' ? 'hit' : 'pattern', tailSeconds, signal });
      return { blob, sampleRate: 44100, name: 'tine-' + safeName(sourceLabel) + '-' + scope + '.wav', tempo: snapshot.bpm, sourceApp: 'tine', sourceLabel, scope };
    } finally { exporting = false; }
  }
  async function exportWav() {
    if (exporting) return; exporting = true; $('export-button').disabled = true;
    const oldChildren = Array.from($('export-button').childNodes, (node) => node.cloneNode(true)); $('export-button').textContent = 'Rendering…'; $('export-button').setAttribute('aria-busy', 'true');
    const snapshot = clone(state); toast('Rendering four bars and the full resonator tail…');
    try { const blob = await engine.exportWav(snapshot); download(blob, 'tine-' + safeName(snapshot.name) + '-' + snapshot.bpm + 'bpm.wav'); toast('Four bars rendered. The natural decay and effect tail are included.'); }
    catch (error) { toast(error.message || 'Audio could not render. Please try again.'); }
    finally { exporting = false; $('export-button').disabled = false; $('export-button').replaceChildren(...oldChildren); $('export-button').removeAttribute('aria-busy'); }
  }
  function canvasContext(id) {
    const canvas = $(id); if (!canvas) return null; const ctx = canvas.getContext('2d'); if (!ctx) return null;
    const rect = canvas.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2), width = Math.max(1, Math.round(rect.width)), height = Math.max(1, Math.round(rect.height));
    if (rect.width && rect.height && (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio))) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height); return { ctx, width, height };
  }
  function modesFor(track) {
    try {
      const inspected = window.TineEngine.inspectModes(track, engine.context ? engine.context.sampleRate : 44100);
      const items = Array.isArray(inspected) ? inspected : inspected && (inspected.modes || inspected.partials);
      if (Array.isArray(items)) return items.map((item, index) => typeof item === 'number' ? { frequency: item, gain: 1 / (index + 1), decay: track.decay } : { frequency: item.frequency || item.frequencyHz || item.freq || track.pitchHz * (index + 1), gain: item.gain === undefined ? item.amplitude === undefined ? 1 / (index + 1) : item.amplitude : item.gain, decay: item.decay || item.t60 || track.decay });
    } catch (_) { /* The diagram remains available before the audio context starts. */ }
    return Array.from({ length: 12 }, (_, index) => ({ frequency: track.pitchHz * (index + 1) ** (track.model === 'plate' ? 1.3 : track.model === 'beam' ? 1.5 : 1), gain: Math.exp(-index * (.14 + track.damping * .3)), decay: track.decay }));
  }
  function exciterFor(track) {
    try {
      const inspected = window.TineEngine.inspectExciter(track);
      if (inspected && Array.isArray(inspected.contacts)) return inspected;
    } catch (_) { /* The diagram can draw before audio starts. */ }
    return { material: { id: track.strikeMaterial, label: track.strikeMaterial }, duration: track.strikeTime, contactDuration: track.strikeTime, contacts: [{ time: 0, duration: track.strikeTime, gain: 1 }], pulseExponent: .7 + track.hardness * 6, rippleDepth: 0, rippleCycles: 0 };
  }
  function drawVoice() {
    const track = state.tracks[selected], modes = modesFor(track), graph = canvasContext('resonator-canvas');
    if (graph) {
      const { ctx, width: w, height: h } = graph, baseline = h - 25, maxFrequency = 16000;
      ctx.strokeStyle = '#3b3733'; ctx.lineWidth = 1;
      [100, 1000, 10000].forEach((frequency) => { const x = 12 + Math.log(frequency / 20) / Math.log(maxFrequency / 20) * (w - 24); ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, baseline); ctx.stroke(); ctx.fillStyle = '#8d8780'; ctx.font = '9px monospace'; ctx.fillText(frequency < 1000 ? frequency + 'Hz' : frequency / 1000 + 'k', x + 3, h - 7); });
      ctx.strokeStyle = '#5a4b43'; ctx.beginPath(); ctx.moveTo(10, baseline); ctx.lineTo(w - 10, baseline); ctx.stroke();
      const maxGain = Math.max(.001, ...modes.map((item) => Math.abs(item.gain)));
      modes.forEach((item, index) => {
        const x = 12 + Math.log(Math.max(20, item.frequency) / 20) / Math.log(maxFrequency / 20) * (w - 24); if (x > w - 10) return;
        const strength = Math.abs(item.gain) / maxGain, y = baseline - strength * (h - 42);
        const gradient = ctx.createLinearGradient(0, y, 0, baseline); gradient.addColorStop(0, colors[selected]); gradient.addColorStop(1, '#5c463c');
        ctx.strokeStyle = gradient; ctx.lineWidth = index === 0 ? 3 : 2; ctx.beginPath(); ctx.moveTo(x, baseline); ctx.lineTo(x, y); ctx.stroke(); ctx.fillStyle = colors[selected]; ctx.beginPath(); ctx.arc(x, y, index === 0 ? 3 : 2, 0, Math.PI * 2); ctx.fill();
      });
    }
    $('mode-summary').textContent = modes.length + ' MODES · ' + Math.round(track.pitchHz) + ' Hz · T60 ' + track.decay.toFixed(2) + ' s';
    const excitation = canvasContext('exciter-canvas');
    if (excitation) {
      const { ctx, width: w, height: h } = excitation, exciter = exciterFor(track);
      const contacts = exciter.contacts.filter((contact) => contact.duration > 0 && contact.gain > 0);
      const contactDuration = Math.max(.003, exciter.duration * 1.13), noiseDuration = Math.max(.03, track.noiseAttack + track.noiseDecay);
      const contactBaseline = h * .46, noiseBaseline = h - 5, amplitude = h * .27;
      const axis = (baseline) => { ctx.strokeStyle = '#3b3733'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(8, baseline); ctx.lineTo(w - 8, baseline); ctx.stroke(); };
      axis(contactBaseline); axis(noiseBaseline);
      const milliseconds = (duration) => (duration * 1000 < 10 ? (duration * 1000).toFixed(1) : Math.round(duration * 1000)) + ' ms';
      ctx.font = '8px monospace'; ctx.fillStyle = colors[selected]; ctx.fillText('CONTACT', 9, 9);
      ctx.textAlign = 'right'; ctx.fillStyle = '#918a83'; ctx.fillText(milliseconds(contactDuration), w - 9, 9); ctx.textAlign = 'left';
      ctx.fillStyle = '#9daead'; ctx.fillText('NOISE', 9, h * .55);
      ctx.textAlign = 'right'; ctx.fillStyle = '#918a83'; ctx.fillText(milliseconds(noiseDuration), w - 9, h * .55); ctx.textAlign = 'left';
      const strikeAt = (time) => contacts.reduce((sum, contact) => {
        const phase = (time - contact.time) / contact.duration;
        if (phase <= 0 || phase >= 1) return sum;
        const ripple = 1 + (exciter.rippleDepth || 0) * Math.cos(Math.PI * 2 * (exciter.rippleCycles || 0) * phase);
        return sum + Math.max(0, Math.sin(Math.PI * phase)) ** exciter.pulseExponent * ripple * contact.gain;
      }, 0);
      // Sample every contact independently so even sub-millisecond impacts stay visible.
      const contactTimes = [0, contactDuration];
      contacts.forEach((contact) => { for (let point = 0; point <= 72; point++) contactTimes.push(contact.time + contact.duration * point / 72); });
      contactTimes.sort((a, b) => a - b);
      const peak = Math.max(1, ...contactTimes.map(strikeAt));
      ctx.strokeStyle = colors[selected]; ctx.lineWidth = 1.5; ctx.beginPath();
      contactTimes.forEach((time, index) => { const x = 8 + time / contactDuration * (w - 16), y = contactBaseline - strikeAt(time) / peak * track.mallet * amplitude; if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke();
      ctx.strokeStyle = '#9daead'; ctx.beginPath();
      for (let x = 8; x <= w - 8; x++) {
        const time = (x - 8) / (w - 16) * noiseDuration;
        const noise = time < track.noiseAttack ? time / track.noiseAttack : Math.exp(-6.9 * (time - track.noiseAttack) / track.noiseDecay);
        const y = noiseBaseline - Math.max(0, noise) * track.noise * amplitude; if (x === 8) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      } ctx.stroke();
      $('exciter-canvas').setAttribute('aria-label', (exciter.material.label || track.strikeMaterial) + ' contact envelope, ' + contacts.length + ' impact' + (contacts.length === 1 ? '' : 's') + ', and ' + track.noiseColor + ' noise envelope. Contact scale ' + milliseconds(contactDuration) + '; noise scale ' + milliseconds(noiseDuration) + '.');
    }
  }
  let heroTime = 0, lastFrame = 0;
  function drawHero(time = 0) {
    const graph = canvasContext('hero-canvas'); if (!graph) return; const { ctx, width: w, height: h } = graph;
    const wide = w > 210, center = w * .5, middle = h * .5;
    if (wide) {
      ctx.strokeStyle = '#55444d'; ctx.lineWidth = 1; ctx.setLineDash([2, 5]); ctx.beginPath(); ctx.moveTo(w * .015, middle); ctx.lineTo(w * .985, middle); ctx.stroke(); ctx.setLineDash([]);
      const trace = (start, end, signal, color) => {
        ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.beginPath();
        for (let x = start; x <= end; x++) { const phase = (x - start) / (end - start), y = middle + signal(phase) * h * .23; if (x === start) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke();
      };
      trace(w * .02, w * .29, (x) => Math.sin(x * Math.PI * 2 * 5) * Math.exp(-(((x - .42) * 7) ** 2)), '#d8aa86');
      trace(w * .71, w * .98, (x) => Math.sin(x * Math.PI * 2 * 8 + time) * Math.exp(-x * 3.4) * Math.min(1, x * 18), '#aa92b5');
      [w * .31, w * .69].forEach((x) => { ctx.strokeStyle = '#766173'; ctx.beginPath(); ctx.moveTo(x - 3, middle - 3); ctx.lineTo(x, middle); ctx.lineTo(x - 3, middle + 3); ctx.stroke(); });
    }
    for (let ring = 0; ring < 7; ring++) {
      const radius = Math.min(wide ? w * .33 : w, h) * (.13 + ring * .054), phase = time + ring * .5;
      ctx.beginPath();
      for (let i = 0; i <= 180; i++) { const angle = i / 180 * Math.PI * 2, amplitude = Math.sin(angle * (3 + ring % 3) + phase) * (playing && !reducedMotion ? 3.2 : 1.7); const r = radius + amplitude; const x = center + Math.cos(angle) * r * 1.25, y = middle + Math.sin(angle) * r; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.strokeStyle = ring % 2 ? '#68554a' : '#b38268'; ctx.globalAlpha = .24 + ring * .065; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.fillStyle = '#e7a686'; ctx.beginPath(); ctx.arc(center, middle, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#524139'; ctx.beginPath(); ctx.moveTo(center, middle); ctx.lineTo(w * .62, h * .21); ctx.stroke();
  }
  function animate(timestamp) { if (playing && !reducedMotion && timestamp - lastFrame > 65) { heroTime += .075; drawHero(heroTime); lastFrame = timestamp; } requestAnimationFrame(animate); }

  presets.forEach((preset, index) => { const option = document.createElement('option'); option.value = index; option.textContent = preset.name; $('preset-select').append(option); });
  const custom = document.createElement('option'); custom.value = 'custom'; custom.textContent = 'Custom groove'; custom.hidden = true; $('preset-select').append(custom);
  for (let step = 0; step < 16; step++) { const label = document.createElement('span'); label.className = 'step-number' + (step % 4 === 0 ? ' beat' : ''); label.dataset.step = step; label.textContent = String(step + 1).padStart(2, '0'); $('step-numbers').append(label); }
  model.models.forEach((info) => {
    const button = document.createElement('button'); button.className = 'model-button'; button.dataset.model = info.id; button.dataset.focusKey = 'model-' + info.id; button.setAttribute('aria-label', 'Use ' + info.name + ' model');
    const name = document.createElement('span'); name.className = 'model-name'; name.textContent = info.name;
    const subtitle = document.createElement('span'); subtitle.className = 'model-subtitle'; subtitle.textContent = ({ membrane: 'Flexible surface', drumhead: 'Skin & drums', plate: 'Metal & cymbals', string: 'Plucks & wires', beam: 'Wood & bars', marimba: 'Tuned wood', bell: 'Cast & metallic', bowl: 'Singing vessel', tube: 'Hollow column' })[info.id] || 'Resonant material'; button.append(glyph(info.id), name, subtitle);
    button.addEventListener('click', () => {
      const previous = state.tracks[selected]; if (previous.model === info.id) return; remember();
      previous.model = info.id;
      renderRows(); renderVoice(); persist(); if (!playing) audition();
    }); $('model-buttons').append(button);
  });
  if ($('model-count')) $('model-count').textContent = model.models.length + ' MODELS';
  document.querySelectorAll('button[data-tab]').forEach((button, index, buttons) => {
    button.id = 'tab-' + button.dataset.tab;
    button.addEventListener('click', () => { tab = button.dataset.tab; renderVoice(); });
    button.addEventListener('keydown', (event) => { let next; if (event.key === 'ArrowRight') next = (index + 1) % buttons.length; if (event.key === 'ArrowLeft') next = (index + buttons.length - 1) % buttons.length; if (event.key === 'Home') next = 0; if (event.key === 'End') next = buttons.length - 1; if (next === undefined) return; event.preventDefault(); tab = buttons[next].dataset.tab; renderVoice(); buttons[next].focus(); });
  });
  $('play-button').addEventListener('click', () => playing || loading ? stop() : play());
  $('restart-button').addEventListener('click', () => { stop(); play(); });
  $('audition-button').addEventListener('click', () => audition());
  $('voice-reset').addEventListener('click', () => {
    remember(); const previous = state.tracks[selected]; state.tracks[selected] = { ...model.defaults(previous.model), name: previous.name, level: previous.level, pan: previous.pan, mute: previous.mute, solo: previous.solo, steps: [...previous.steps] };
    renderVoice(); refreshTrackMeta(); persist(); toast('This model’s sound settings restored.');
  });
  $('voice-mutate').addEventListener('click', mutateVoice);
  $('tempo').addEventListener('change', () => { const next = Math.round(clamp($('tempo').value || state.bpm, 40, 240)); if (next !== state.bpm) { remember(); state.bpm = next; persist(); } $('tempo').value = state.bpm; });
  function rangeHistory(id) { $(id).addEventListener('pointerdown', remember); $(id).addEventListener('keydown', (event) => { if (rangeKeys.includes(event.key)) remember(); }); }
  rangeHistory('swing'); rangeHistory('master-volume');
  $('swing').addEventListener('input', () => { state.swing = clamp($('swing').value / 100, 0, .6); $('swing-value').textContent = Math.round(state.swing * 100) + '%'; persist(); });
  $('master-volume').addEventListener('input', () => { state.master = clamp($('master-volume').value / 100, 0, 1); $('volume-value').textContent = Math.round(state.master * 100) + '%'; engine.setMasterVolume(state.master); persist(); });
  $('preset-select').addEventListener('change', () => {
    const preset = presets[Number($('preset-select').value)]; if (!preset) return;
    remember(); const resume = playing || loading; if (resume) stop(); const master = state.master;
    state = presetState(preset, master); banks = [state.tracks.map((track) => [...track.steps]), ...Array.from({ length: 3 }, emptyBank)]; bank = 0;
    renderAll(); persist(); toast(preset.tagline || preset.name + ' loaded.'); if (resume) play();
  });
  document.querySelectorAll('[data-bank]').forEach((button) => button.addEventListener('click', () => {
    const next = Number(button.dataset.bank); if (next === bank) return; remember(); banks[bank] = state.tracks.map((track) => [...track.steps]); bank = next;
    state.tracks.forEach((track, index) => { track.steps = [...banks[bank][index]]; }); renderRows(); renderBanks(); persist();
  }));
  $('copy-pattern').addEventListener('click', () => { remember(); const next = (bank + 1) % 4; banks[next] = state.tracks.map((track) => [...track.steps]); persist(); toast('Pattern ' + 'ABCD'[bank] + ' copied to ' + 'ABCD'[next] + '.'); });
  $('clear-button').addEventListener('click', () => { remember(); state.tracks.forEach((track) => { track.steps = Array(16).fill(0); }); renderRows(); persist(); toast('Pattern cleared. Your sounds are preserved.'); });
  $('random-button').addEventListener('click', randomPattern); $('undo-button').addEventListener('click', undo);
  $('save-button').addEventListener('click', () => { download(new Blob([JSON.stringify(project(), null, 2)], { type: 'application/json' }), 'tine-' + safeName() + '.json'); toast('Project saved. Sounds, patterns, and all four banks included.'); });
  $('open-button').addEventListener('click', () => $('project-file').click());
  $('project-file').addEventListener('change', async (event) => {
    const file = event.target.files[0]; if (!file) return;
    try { if (file.size > 1024 * 1024) throw new Error('That file is too large for a TINE project.'); const data = validateProject(JSON.parse(await file.text())); remember(); stop(); restore(data); renderAll(); persist(); toast('Project opened.'); }
    catch (error) { toast(error instanceof SyntaxError ? 'That file is not a valid TINE project.' : error.message || 'Could not open that project.'); }
    finally { event.target.value = ''; }
  });
  $('export-button').addEventListener('click', exportWav);
  $('help-button').addEventListener('click', () => $('help-dialog').showModal()); $('close-help').addEventListener('click', () => $('help-dialog').close());
  $('help-dialog').addEventListener('click', (event) => { if (event.target !== $('help-dialog')) return; const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); });
  document.addEventListener('keydown', (event) => {
    if ($('help-dialog').open || event.target.isContentEditable) return;
    const field = event.target.matches('input,select,textarea');
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && (!field || event.target.matches('input[type=range]'))) { event.preventDefault(); undo(); return; }
    if (field) return;
    if (event.code === 'Space' && !event.target.matches('button,[role=slider]')) { event.preventDefault(); playing || loading ? stop() : play(); }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && /^[1-8]$/.test(event.key)) { selected = Number(event.key) - 1; renderRows(); renderVoice(); persist(); audition(); }
  });
  if (window.location.protocol === 'file:' && $('music-home')) $('music-home').hidden = true;
  window.addEventListener('pagehide', () => { try { localStorage.setItem(storageKey, JSON.stringify(project())); } catch (_) {} stop(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && playing && engine.context && engine.context.state !== 'running') { stop(); toast('Audio paused. Press Play to continue.'); } });
  let resizeTimer; window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { drawVoice(); drawHero(heroTime); }, 80); });
  renderAll(); drawHero(); requestAnimationFrame(animate);
  window.TineApp = { getState: () => clone(state), getProject: project, isPlaying: () => playing, play, stop, engine, exportAudio,
    audioExport: { scopes: [{ id: 'pattern', label: 'Pattern mix' }, { id: 'voice', label: 'Selected voice pattern' }, { id: 'hit', label: 'Selected voice hit', usesBars: false }], defaultBars: 1, maxBars: 16 } };
}());
