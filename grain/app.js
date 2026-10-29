(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
  const colors = ['#ff8d45', '#dcc85e', '#bbc7c4', '#88adb5', '#d6a870', '#e4e0d1', '#bd976f', '#adb285'];
  const sources = [
    { id: 'white', name: 'White', color: '#d5d9c9', description: 'Full spectrum. The extraction hood at full capacity.' },
    { id: 'pink', name: 'Pink', color: '#cba8ad', description: 'Equal energy per octave. A steady fry across every octave.' },
    { id: 'brown', name: 'Brown', color: '#be9176', description: 'Low, warm rumble. The extractor has opinions.' },
    { id: 'blue', name: 'Blue', color: '#88a9be', description: 'Rising energy. The kettle has skipped inspection.' },
    { id: 'violet', name: 'Violet', color: '#b09abd', description: 'High-frequency energy. The sharp end of a very small whisk.' },
    { id: 'grey', name: 'Grey', color: '#a1a89b', description: 'A sculpted spectrum. Steam through a carefully adjusted vent.' },
    { id: 'velvet', name: 'Velvet', color: '#b4b087', description: 'Sparse impulses. Fine crumbs falling through the service hatch.' },
    { id: 'crackle', name: 'Crackle', color: '#c5a776', description: 'Broken sparks. The griddle is filing a hot complaint.' },
    { id: 'metallic', name: 'Metallic', color: '#8faaa9', description: 'Inharmonic frequencies. The cutlery tray during a minor incident.' },
    { id: 'digital', name: 'Digital', color: '#a4b982', description: 'Crushed bits. An order printer chewing its ticket.' },
    { id: 'dust', name: 'Dust', color: '#ae997e', description: 'Scattered impulses. Pepper arriving one speck at a time.' },
    { id: 'radio', name: 'Radio', color: '#92a17e', description: 'A wandering signal. The kitchen radio between official announcements.' }
  ];
  const modes = ['kick', 'snare', 'hat', 'clap', 'rim', 'perc', 'texture', 'bass'];
  const engine = new window.NoiseEngine();
  let state = { ...clone(window.NOISE_PRESETS[0]), master: 0.78, stepCount: 16 };
  state.tracks.forEach((track) => window.GrainSynth.ensureTrack(track));
  let voiceLab, voiceFxEditor, voiceFxGesture = null;
  let banks = [state.tracks.map((t) => [...t.steps]), ...Array.from({ length: 3 }, () => Array.from({ length: 8 }, () => Array(16).fill(0)))];
  let bankLocks = window.GrainSequence.emptyLocks(banks), chain = window.GrainSequence.emptyChain();
  let bank = 0, selected = 0, sequencePage = 0, playing = false, busy = false, playGeneration = 0, currentStep = -1, currentBar = 0;
  let stepEditMode = false, stepTarget = null, playbackPosition = null;
  let history = [], toastTimer, saveTimer, exporting = false;
  // Playback highlights reuse the current row DOM; audio scheduling stays in the engine.
  let playheadColumns = Array.from({ length: 32 }, () => []);
  const storageKey = 'grain-drum-machine-v2';
  const icon = (name) => '<svg aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  const pretty = (str) => str.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());

  function project() {
    banks[bank] = state.tracks.map((t) => [...t.steps]);
    return { format: 'grain-project', version: 5, state: clone(state), banks: clone(banks), bankLocks: clone(bankLocks), chain: clone(chain), bank, selected };
  }
  function validateProject(data) {
    if (!data || data.format !== 'grain-project' || ![1, 2, 3, 4, 5].includes(data.version) || !data.state || !Array.isArray(data.state.tracks) || data.state.tracks.length !== 8) throw new Error('Please open a SIZZLE project file.');
    const s = data.state;
    if (s.musicLabPattern !== undefined) {
      const overlay = s.musicLabPattern;
      if (!overlay || !window.MusicLabPatternSchema || !overlay.voiceMap || typeof overlay.voiceMap !== 'object' || Array.isArray(overlay.voiceMap)) throw new Error('Invalid shared pattern.');
      const pattern = window.MusicLabPatternSchema.normalize(overlay.pattern);
      if (pattern.voices.some(voice => !/^voice-[0-7]$/.test(overlay.voiceMap[voice.id]))) throw new Error('Invalid shared voice mapping.');
    }
    if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 80) throw new Error('The project needs a valid name.');
    const isNumber = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
    if (!isNumber(s.bpm, 40, 240) || !isNumber(s.swing, 0, .6) || !['master', 'drive', 'space'].every((key) => isNumber(s[key], 0, 1))) throw new Error('The project contains invalid sound settings.');
    if (data.version >= 3 && ![16, 32].includes(s.stepCount)) throw new Error('The project contains an invalid sequence length.');
    const stepLengths = data.version >= 3 ? (s.stepCount === 32 ? [32] : [16, 32]) : [16];
    const validSteps = (steps) => Array.isArray(steps) && stepLengths.includes(steps.length) && Array.from(steps).every((v) => v === 0 || v === 1 || v === 2);
    s.tracks.forEach((track) => {
      if (!track || typeof track.name !== 'string' || track.name.length > 40 || !sources.some((n) => n.id === track.noise) || !modes.includes(track.mode) || !validSteps(track.steps) || !['level', 'tone', 'decay', 'pitch'].every((key) => isNumber(track[key], 0, 1)) || !isNumber(track.pan, -1, 1) || typeof track.mute !== 'boolean' || typeof track.solo !== 'boolean') throw new Error('The project contains an invalid voice.');
      if (data.version >= 5 && track.galleyFx === undefined) throw new Error('The project is missing a voice effects rack.');
      if (track.galleyFx !== undefined) window.GrainSynth.normalizeVoiceEffects(track.galleyFx, true);
      if ((data.version >= 2 || track.synth !== undefined) && !window.GrainSynth.validate(track.synth)) throw new Error('The project contains invalid synthesis settings.');
    });
    if (!Array.isArray(data.banks) || data.banks.length !== 4 || !data.banks.every((b) => Array.isArray(b) && b.length === 8 && b.every(validSteps))) throw new Error('The project contains an invalid pattern.');
    if (data.version >= 4) { window.GrainSequence.validateChain(data.chain); window.GrainSequence.validateLocks(data.banks, data.bankLocks); }
    else if (data.chain !== undefined || data.bankLocks !== undefined) throw new Error('Step overrides and chains require a version 4 project.');
    if (!Number.isInteger(data.bank) || data.bank < 0 || data.bank > 3 || !Number.isInteger(data.selected) || data.selected < 0 || data.selected > 7) throw new Error('The project contains invalid bank settings.');
    return data;
  }
  function restore(data) {
    const valid = validateProject(data);
    voiceFxEditor?.close(); voiceFxGesture = null;
    state = { ...clone(valid.state), stepCount: valid.version >= 3 ? valid.state.stepCount : 16 }; banks = clone(valid.banks); bank = valid.bank; selected = valid.selected;
    bankLocks = valid.version >= 4 ? clone(valid.bankLocks) : window.GrainSequence.emptyLocks(banks);
    chain = valid.version >= 4 ? clone(valid.chain) : window.GrainSequence.emptyChain();
    if (state.stepCount === 16) sequencePage = 0;
    state.tracks.forEach((t, i) => { t.steps = [...banks[bank][i]]; window.GrainSynth.ensureTrack(t); t.galleyFx = window.GrainSynth.normalizeVoiceEffects(t.galleyFx, true); });
  }
  for (const key of [storageKey, 'grain-drum-machine-v1']) {
    try { const stored = localStorage.getItem(key); if (stored) { restore(JSON.parse(stored)); break; } } catch (_) { /* Try the older project, or start fresh if browser storage is unavailable. */ }
  }
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(storageKey, JSON.stringify(project())); } catch (_) {} }, 250);
  }
  function useNativeGrid() {
    if (!state.musicLabPattern) return;
    const resume = playing || busy;
    if (resume) stop();
    delete state.musicLabPattern;
    if (resume) queueMicrotask(play);
  }
  function bankSteps(index) { return index === bank ? state.tracks.map(track => track.steps) : banks[index]; }
  function nextPattern(previous) {
    const signature = JSON.stringify(chain);
    let entry = 0, repeat = 0;
    if (chain.enabled && chain.entries.length) {
      if (previous?.chain && previous.signature === signature) {
        entry = previous.entry; repeat = previous.repeat + 1;
        if (repeat >= chain.entries[entry].repeats) { entry++; repeat = 0; }
        if (entry >= chain.entries.length) { if (!chain.loop) return null; entry = 0; }
      }
      return { bank: chain.entries[entry].bank, entry, repeat, repeats: chain.entries[entry].repeats, totalEntries: chain.entries.length, chain: true, signature, bpm: state.bpm, swing: state.swing, stepCount: state.stepCount };
    }
    return { bank, entry: -1, repeat: 0, chain: false, signature, bpm: state.bpm, swing: state.swing, stepCount: state.stepCount };
  }
  function sequenceFrames(scope) {
    const useChain = scope === 'chain' || scope === undefined && chain.enabled;
    if (useChain && !chain.entries.length) throw new Error('Add a bank to the chain first.');
    const entries = useChain ? chain.entries : [{ bank, repeats: 1 }];
    const frames = [];
    entries.forEach(entry => {
      for (let repeat = 0; repeat < entry.repeats; repeat++) frames.push({ bank: entry.bank, steps: clone(bankSteps(entry.bank)), locks: clone(bankLocks[entry.bank]), bpm: state.bpm, swing: state.swing, stepCount: state.stepCount });
    });
    return frames;
  }
  function getSequencerPattern(options = {}) {
    const scope = options.scope, voice = options.voice === undefined ? selected : Number(options.voice);
    if (![undefined, 'pattern', 'chain', 'voice'].includes(scope) || scope === 'voice' && (!Number.isInteger(voice) || voice < 0 || voice > 7)) throw new Error('Choose a current pattern, chain, or voice pattern.');
    const frames = sequenceFrames(scope === 'voice' ? 'pattern' : scope);
    const lengthBeats = frames.length * state.stepCount / 4;
    if (lengthBeats > 256) throw new Error('This chain exceeds 256 beats. Remove entries or reduce repeats before sharing it.');
    const voices = state.tracks.map((track, index) => ({ id: 'voice-' + index, name: track.name, pitch: 36 + index }));
    const hasSolo = state.tracks.some(track => track.solo), notes = [];
    frames.forEach((frame, frameIndex) => state.tracks.forEach((track, index) => {
      if (scope === 'voice' ? index !== voice : track.mute || hasSolo && !track.solo) return;
      frame.steps[index].slice(0, frame.stepCount).forEach((hit, step) => {
        if (!hit) return;
        const beat = frameIndex * frame.stepCount / 4 + step / 4 + (step % 2 ? frame.swing / 4 : 0);
        const note = { id: 'note-' + notes.length, voice: voices[index].id, pitch: voices[index].pitch, beat, duration: Math.min(.25, frame.stepCount / 4 - step / 4 - (step % 2 ? frame.swing / 4 : 0)), velocity: hit >= 2 ? 1 : .73, probability: 1 };
        const locks = frame.locks[index][step]; if (Object.keys(locks).length) note.locks = clone(locks);
        notes.push(note);
      });
    }));
    if (notes.length > 4096) throw new Error('This sequence exceeds 4,096 notes. Shorten the chain or reduce its hits before sharing it.');
    const packet = { format: 'musiclab-pattern', version: 1, name: state.name + ' · SIZZLE', sourceApp: 'grain', kind: 'drums', tempo: state.bpm, swing: 0, lengthBeats, meter: [4, 4], voices, notes, seed: 0x5a17c0de };
    return window.MusicLabPatternSchema ? window.MusicLabPatternSchema.normalize(packet) : packet;
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
    toast('Previous change restored.');
  }
  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3000);
  }
  function syncEffects() {
    engine.setVoiceState(state);
    engine.setMasterVolume(state.master);
    engine.setEffects({ drive: state.drive, space: state.space });
  }
  function audioReady() {
    $('audio-status').textContent = 'AUDIO ON · ' + (engine.context ? (engine.context.sampleRate / 1000).toFixed(1) + ' KHZ' : 'PURE SYNTHESIS');
    $('status-dot').classList.add('ready');
  }
  async function audition(track, locks) {
    try { await engine.preview(track, state.bpm, locks); syncEffects(); audioReady(); } catch (error) { toast(error.message || 'Audio could not start. Please try again.'); }
  }
  async function play() {
    if (busy || playing) return;
    const generation = ++playGeneration;
    busy = true;
    try {
      currentBar = 0;
      await engine.start(state, (step, position) => {
        if (!playing) return;
        playbackPosition = position;
        if (step % 16 === 0) currentBar = currentBar % 4 + 1;
        setPlayhead(step);
        $('beat-position').textContent = currentBar + ' . ' + (Math.floor(step % 16 / 4) + 1) + ' . ' + (step % 4 + 1);
        renderChainStatus();
      });
      if (generation !== playGeneration || !engine.running) return;
      playing = true;
      startHeroAnimation();
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
    playing = false; engine.stop(); finishPlayback();
  }
  function finishPlayback() {
    playing = false; playbackPosition = null; setPlayhead(-1);
    stopHeroAnimation();
    $('play-button').innerHTML = icon('play') + '<span>Play</span>';
    $('play-button').setAttribute('aria-label', 'Play sequencer');
    $('play-button').classList.remove('playing');
    $('master-led').classList.remove('playing');
    document.body.classList.remove('is-playing');
    $('beat-position').textContent = '1 . 1 . 1';
    renderChainStatus();
  }
  function setPlayhead(step) {
    if (currentStep >= 0) playheadColumns[currentStep].forEach((el) => el.classList.remove('current'));
    if (step >= 0 && (!playbackPosition || playbackPosition.bank === bank)) playheadColumns[step].forEach((el) => el.classList.add('current'));
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
  function renderSequenceControls() {
    $('sequence-length').value = state.stepCount;
    $('sequence-page').hidden = state.stepCount === 16;
    $('sequence-page').value = sequencePage;
    $('step-numbers').replaceChildren();
    for (let index = 0; index < 16; index++) {
      const step = sequencePage * 16 + index;
      const label = document.createElement('span');
      label.className = 'step-number' + (step % 4 === 0 ? ' beat' : '') + (currentStep === step && (!playbackPosition || playbackPosition.bank === bank) ? ' current' : '');
      label.dataset.step = step; label.textContent = String(step + 1).padStart(2, '0'); $('step-numbers').append(label);
    }
  }
  function renderRows() {
    engine.setVoiceState(state);
    renderSequenceControls();
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
        if (Math.floor(stepIndex / 16) !== sequencePage) return;
        const button = document.createElement('button'); button.dataset.step = stepIndex; button.dataset.track = index;
        button.dataset.focusKey = 'step-' + index + '-' + stepIndex;
        updateStep(button, index, stepIndex);
        let holdTimer, touchStartX, touchStartY, held = false;
        const edit = (accent) => {
          remember(); useNativeGrid();
          const previous = track.steps[stepIndex];
          track.steps[stepIndex] = accent ? (previous === 2 ? 1 : 2) : (previous ? 0 : 1);
          updateStep(button, index, stepIndex); persist();
          if (track.steps[stepIndex] && !playing) audition(track, bankLocks[bank][index][stepIndex]);
        };
        button.addEventListener('click', (event) => {
          if (held) { held = false; return; }
          if (stepEditMode && !event.shiftKey) { openStep(index, stepIndex); return; }
          edit(event.shiftKey);
        });
        button.addEventListener('pointerdown', (event) => {
          if (event.pointerType !== 'touch') return;
          held = false; touchStartX = event.clientX; touchStartY = event.clientY;
          holdTimer = setTimeout(() => { held = true; openStep(index, stepIndex); }, 450);
        });
        button.addEventListener('pointermove', (event) => { if (event.pointerType === 'touch' && (Math.abs(event.clientX - touchStartX) > 8 || Math.abs(event.clientY - touchStartY) > 8)) clearTimeout(holdTimer); });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => button.addEventListener(type, () => clearTimeout(holdTimer)));
        button.addEventListener('contextmenu', (event) => { event.preventDefault(); openStep(index, stepIndex); });
        button.addEventListener('keydown', (event) => {
          if (event.key.toLowerCase() === 'e') { event.preventDefault(); openStep(index, stepIndex); return; }
          const delta = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
          if (!delta) return;
          event.preventDefault();
          const nextRow = (index + delta[0] + 8) % 8, nextStep = (stepIndex + delta[1] + state.stepCount) % state.stepCount;
          if (Math.floor(nextStep / 16) !== sequencePage) { sequencePage = Math.floor(nextStep / 16); renderRows(); }
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
    playheadColumns = Array.from({ length: 32 }, () => []);
    document.querySelectorAll('[data-step]').forEach((el) => playheadColumns[Number(el.dataset.step)].push(el));
    if (focused) { const replacement = container.querySelector('[data-focus-key="' + focused + '"]'); if (replacement) replacement.focus({ preventScroll: true }); }
  }
  function updateStep(button, row, step) {
    const value = state.tracks[row].steps[step];
    const locked = Object.keys(bankLocks[bank][row][step] || {}).length > 0;
    button.className = 'step' + (step % 4 === 0 ? ' beat' : '') + (value ? ' active' : '') + (value === 2 ? ' accent' : '') + (locked ? ' has-locks' : '') + (currentStep === step && (!playbackPosition || playbackPosition.bank === bank) ? ' current' : '');
    button.setAttribute('aria-pressed', value > 0);
    button.setAttribute('aria-label', pretty(state.tracks[row].name) + ', step ' + (step + 1) + ', ' + (value === 2 ? 'accent' : value ? 'on' : 'off') + (locked ? ', sound overrides' : ''));
    button.title = 'Step ' + (step + 1) + (value === 2 ? ' · Accent' : '') + (locked ? ' · Sound overrides' : '') + ' · Shift + click to accent · Right-click or E to edit sound';
  }
  function renderBanks() {
    document.querySelectorAll('[data-bank]').forEach((button) => { const active = Number(button.dataset.bank) === bank; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
  }
  function renderChainStatus() {
    if (!$('chain-button')) return;
    const position = playbackPosition;
    $('chain-button').textContent = playing && position?.chain ? 'Chain ' + 'ABCD'[position.bank] + ' · ' + (position.entry + 1) + '/' + position.totalEntries + ' · ×' + (position.repeat + 1) + '/' + position.repeats : 'Chain · ' + (chain.enabled ? chain.entries.length + (chain.loop ? ' ↻' : ' once') : 'off');
    const status = playing && position ? 'Playing ' + 'ABCD'[position.bank] + (position.chain ? ' · entry ' + (position.entry + 1) + '/' + position.totalEntries + ' · repeat ' + (position.repeat + 1) + '/' + position.repeats : '') : chain.enabled ? 'Ready · ' + (chain.loop ? 'loop chain' : 'play once') : 'Chain off';
    $('chain-position').textContent = status + (playing && position && position.signature !== JSON.stringify(chain) ? ' · revised sequence queued' : '');
    $('chain-button').setAttribute('aria-label', 'Edit chain. ' + $('chain-position').textContent);
    document.querySelectorAll('[data-bank]').forEach(button => button.classList.toggle('playing-bank', playing && position?.bank === Number(button.dataset.bank)));
    document.querySelectorAll('[data-chain-index]').forEach(row => row.classList.toggle('chain-playing', playing && position?.chain && position.signature === JSON.stringify(chain) && Number(row.dataset.chainIndex) === position.entry));
  }
  function changeChain(edit) {
    remember(); useNativeGrid(); edit();
    if (!chain.entries.length) chain.enabled = false;
    renderChainEditor(); persist();
  }
  function renderChainEditor() {
    if (!$('chain-entries')) return;
    const focus = document.activeElement?.dataset.chainFocus;
    $('chain-enabled').checked = chain.enabled;
    $('chain-enabled').disabled = !chain.entries.length;
    $('chain-loop').checked = chain.loop;
    $('chain-add').disabled = chain.entries.length >= 16;
    $('chain-clear').disabled = !chain.entries.length;
    const list = $('chain-entries'); list.replaceChildren();
    chain.entries.forEach((entry, index) => {
      const row = document.createElement('div'); row.className = 'chain-entry'; row.dataset.chainIndex = index;
      const label = document.createElement('span'); label.className = 'chain-entry-number'; label.textContent = String(index + 1).padStart(2, '0');
      const select = document.createElement('select'); select.dataset.chainBank = ''; select.dataset.chainFocus = index + '-bank'; select.setAttribute('aria-label', 'Pattern for chain entry ' + (index + 1));
      ['A', 'B', 'C', 'D'].forEach((name, value) => { const option = document.createElement('option'); option.value = value; option.textContent = 'Pattern ' + name; select.append(option); });
      select.value = entry.bank; select.addEventListener('change', () => changeChain(() => { entry.bank = Number(select.value); }));
      const repeats = document.createElement('input'); repeats.type = 'number'; repeats.min = 1; repeats.max = 16; repeats.step = 1; repeats.value = entry.repeats; repeats.dataset.chainRepeats = ''; repeats.dataset.chainFocus = index + '-repeats'; repeats.setAttribute('aria-label', 'Repeats for chain entry ' + (index + 1));
      repeats.addEventListener('change', () => { const value = Math.round(clamp(repeats.value || entry.repeats, 1, 16)); changeChain(() => { entry.repeats = value; }); });
      const repeatLabel = document.createElement('label'); repeatLabel.className = 'chain-repeat-label'; repeatLabel.append(document.createTextNode('× '), repeats);
      const actions = document.createElement('div'); actions.className = 'chain-entry-actions';
      [['up', '↑', 'Move up'], ['down', '↓', 'Move down'], ['duplicate', '+', 'Duplicate'], ['remove', '×', 'Remove']].forEach(([action, text, name]) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'chain-action'; button.dataset.chainAction = action; button.dataset.chainFocus = index + '-' + action; button.textContent = text; button.setAttribute('aria-label', name + ' chain entry ' + (index + 1));
        button.disabled = action === 'up' && index === 0 || action === 'down' && index === chain.entries.length - 1 || action === 'duplicate' && chain.entries.length >= 16;
        button.addEventListener('click', () => changeChain(() => {
          if (action === 'remove') chain.entries.splice(index, 1);
          else if (action === 'duplicate') chain.entries.splice(index + 1, 0, clone(entry));
          else { const next = index + (action === 'up' ? -1 : 1); [chain.entries[index], chain.entries[next]] = [chain.entries[next], chain.entries[index]]; }
        })); actions.append(button);
      });
      row.append(label, select, repeatLabel, actions); list.append(row);
    });
    $('chain-empty').hidden = chain.entries.length > 0;
    renderChainStatus();
    if (focus) list.querySelector('[data-chain-focus="' + focus + '"]')?.focus({ preventScroll: true });
  }
  const stepLockFields = [
    ['cutoff', 'Noise cutoff · Hz', 40, 18000, 1], ['resonance', 'Noise resonance · Q', .1, 20, .1],
    ['decay', 'Noise decay · seconds', .005, 3, .005], ['drive', 'Noise saturation · 0–1', 0, 1, .01],
    ['pan', 'Pan · −1 left / +1 right', -1, 1, .01], ['level', 'Voice level · 0–1', 0, 1, .01]
  ];
  function openStep(voice, step) {
    stepTarget = { bank, voice, step }; selected = voice;
    renderRows(); renderVoice(); renderStepInspector();
    if (!$('step-dialog').open) $('step-dialog').showModal();
  }
  function renderStepInspector() {
    if (!stepTarget) return;
    const { bank: targetBank, voice, step } = stepTarget;
    if (!bankLocks[targetBank]?.[voice]?.[step]) { stepTarget = null; $('step-dialog').close(); return; }
    const track = state.tracks[voice], synth = window.GrainSynth.ensureTrack(track), locks = bankLocks[targetBank][voice][step];
    $('step-title').textContent = 'Pattern ' + 'ABCD'[targetBank] + ' · ' + pretty(track.name) + ' · step ' + (step + 1);
    $('step-hit').value = bankSteps(targetBank)[voice][step];
    const fields = $('step-lock-fields'); fields.replaceChildren();
    stepLockFields.forEach(([key, title, min, max, increment]) => {
      const field = document.createElement('div'); field.className = 'step-lock-field';
      const label = document.createElement('label'); label.htmlFor = 'step-lock-' + key; label.textContent = title;
      const input = document.createElement('input'); input.type = 'number'; input.id = 'step-lock-' + key; input.min = min; input.max = max; input.step = increment;
      const inherited = locks[key] === undefined;
      const base = ['pan', 'level'].includes(key) ? track[key] : key === 'resonance' && ['lowpass', 'highpass'].includes(synth.noise.filter) ? Math.pow(10, synth.noise.resonance / 20) : synth.noise[key];
      input.value = inherited ? Number(base.toFixed(4)) : locks[key]; input.disabled = inherited;
      const cutoffDescriptor = key === 'cutoff' ? window.GrainSynth.descriptors.noise.find(item => item.key === 'cutoff') : null;
      const slider = cutoffDescriptor ? document.createElement('input') : null;
      if (slider) {
        slider.type = 'range'; slider.min = 0; slider.max = 1000; slider.step = 1; slider.className = 'step-cutoff-slider'; slider.id = 'step-range-cutoff'; slider.disabled = inherited;
        slider.setAttribute('aria-label', 'Noise cutoff, logarithmic frequency');
        slider.value = window.GrainSynth.toNormalized(Number(input.value), cutoffDescriptor) * 1000;
        slider.setAttribute('aria-valuetext', input.value + ' Hz');
        slider.addEventListener('input', () => { input.value = Math.round(window.GrainSynth.fromNormalized(Number(slider.value) / 1000, cutoffDescriptor)); slider.setAttribute('aria-valuetext', input.value + ' Hz'); });
        slider.addEventListener('change', () => commit(Number(input.value)));
      }
      const inherit = document.createElement('input'); inherit.type = 'checkbox'; inherit.id = 'step-inherit-' + key; inherit.checked = inherited;
      const inheritLabel = document.createElement('label'); inheritLabel.className = 'step-inherit'; inheritLabel.append(inherit, document.createTextNode('Inherit'));
      const commit = (value) => {
        remember(); useNativeGrid();
        if (value === undefined) delete locks[key]; else locks[key] = value;
        renderRows(); persist();
      };
      inherit.addEventListener('change', () => { commit(inherit.checked ? undefined : clamp(base, min, max)); renderStepInspector(); if (!inherit.checked) $('step-lock-' + key).focus(); });
      input.addEventListener('change', () => {
        if (input.value === '' || !Number.isFinite(input.valueAsNumber) || input.valueAsNumber < min || input.valueAsNumber > max) { input.value = locks[key]; toast('Use a value from ' + min + ' to ' + max + '.'); return; }
        commit(input.valueAsNumber);
        if (slider) { slider.value = window.GrainSynth.toNormalized(input.valueAsNumber, cutoffDescriptor) * 1000; slider.setAttribute('aria-valuetext', input.value + ' Hz'); }
      });
      field.append(label); if (slider) field.append(slider); field.append(input, inheritLabel); fields.append(field);
    });
    $('step-clear-locks').disabled = !Object.keys(locks).length;
    const silentNoise = synth.noise.level === 0;
    $('step-lock-note').textContent = silentNoise ? 'This voice’s noise layer is silent. Raise NOISE in Voice Station to hear its cutoff, resonance, decay and saturation overrides.' : 'Adjust a control for this strike. Inherit returns it to the voice’s sound; following unlocked steps keep their original sound.';
  }
  function knobControl(param, label, value, formatter, change) {
    const control = document.createElement('div'); control.className = 'knob-control';
    const knob = document.createElement('div'); knob.className = 'knob'; knob.setAttribute('role', 'slider'); knob.tabIndex = 0; knob.setAttribute('aria-label', label); knob.setAttribute('aria-valuemin', '0'); knob.setAttribute('aria-valuemax', '100'); knob.dataset.param = param;
    knob.innerHTML = '<svg viewBox="0 0 56 56" aria-hidden="true"><circle class="knob-track" cx="28" cy="28" r="23"/><circle class="knob-progress" cx="28" cy="28" r="23"/></svg><span class="knob-disc"></span>';
    const progress = knob.querySelector('.knob-progress');
    const name = document.createElement('span'); name.className = 'knob-label'; name.textContent = label;
    const number = document.createElement('span'); number.className = 'knob-value';
    const draw = (val) => { value = val; knob.style.setProperty('--rotation', (-135 + val * 270) + 'deg'); progress.style.strokeDasharray = (val * 108.4) + ' 144.5'; number.textContent = formatter(val); knob.setAttribute('aria-valuenow', Math.round(val * 100)); knob.setAttribute('aria-valuetext', formatter(val)); };
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
    control.append(knob, name, number); control.updateValue = draw; return control;
  }
  function refreshMixer() {
    const track = state.tracks[selected], synth = window.GrainSynth.ensureTrack(track);
    const values = { 'body-level': synth.body.level, 'noise-level': synth.noise.level, level: track.level, pan: (track.pan + 1) / 2 };
    Array.from($('voice-knobs').children).forEach((control) => { const knob = control.querySelector('.knob'); if (knob && control.updateValue) control.updateValue(values[knob.dataset.param]); });
  }
  function renderVoice() {
    voiceFxEditor?.close();
    const active = document.activeElement;
    const focusedParam = ($('voice-knobs').contains(active) || $('synthesis-knobs').contains(active)) ? active.dataset.param : null;
    const focusedSelector = $('synthesis-selectors').contains(active) ? active.id : null;
    const track = state.tracks[selected];
    const synth = window.GrainSynth.ensureTrack(track);
    $('selected-voice-index').textContent = 'VOICE 0' + (selected + 1);
    $('selected-voice-name').textContent = pretty(track.name);
    const descriptions = { kick: 'A low thump from the walk-in. Nobody ordered that.', snare: 'A sharp slap from the prep counter.', hat: track.decay > .35 ? 'A long hiss from the pressure valve.' : 'A short hiss. The pan means business.', rim: 'One precise knock on the service hatch.', clap: 'Three chopping boards. One strongly held opinion.', perc: 'A utensil dropped with suspicious timing.', texture: 'A little residue from an ambitious service.', bass: 'The walk-in compressor has taken the bass part.' };
    $('voice-description').textContent = descriptions[track.mode];
    $('selected-noise-label').textContent = track.noise.toUpperCase() + ' NOISE';
    $('synthesis-voice').textContent = '0' + (selected + 1) + ' / ' + track.name;
    $('voice-knobs').replaceChildren();
    const percent = (v) => Math.round(v * 100) + '%';
    const refresh = () => { drawVoice(); if (voiceLab) { voiceLab.draw(); voiceLab.updateNote(); } };
    $('voice-knobs').append(knobControl('body-level', 'BODY', synth.body.level, percent, (value) => { synth.body.level = value; refresh(); }));
    $('voice-knobs').append(knobControl('noise-level', 'NOISE', synth.noise.level, percent, (value) => { synth.noise.level = value; refresh(); }));
    $('voice-knobs').append(knobControl('level', 'LEVEL', track.level, percent, (value) => { track.level = value; refresh(); }));
    $('voice-knobs').append(knobControl('pan', 'PAN', (track.pan + 1) / 2, (value) => Math.abs(value - .5) < .005 ? 'Center' : (value < .5 ? 'L ' : 'R ') + Math.round(Math.abs(value - .5) * 200), (value) => { track.pan = value * 2 - 1; refresh(); }));
    document.querySelectorAll('.noise-source').forEach((button) => { const active = button.dataset.noise === track.noise; button.classList.toggle('selected', active); button.setAttribute('aria-pressed', active); });
    const source = sources.find((n) => n.id === track.noise);
    $('noise-caption').textContent = source.name + ' noise. ' + source.description;
    drawVoice();
    if (voiceLab) voiceLab.render();
    renderNoiseBench();
    voiceFxEditor?.render();
    if (focusedParam) { const replacement = Array.from(document.querySelectorAll('.knob')).find((knob) => knob.dataset.param === focusedParam); if (replacement) replacement.focus({ preventScroll: true }); }
    else if (focusedSelector && $(focusedSelector)) $(focusedSelector).focus({ preventScroll: true });
  }
  // View state stays in the DOM; recipes write only existing saved noise parameters.
  function renderNoiseBench() {
    const track = state.tracks[selected], noise = window.GrainSynth.ensureTrack(track).noise;
    $('bench-voice-label').textContent = '0' + (selected + 1) + ' / ' + pretty(track.name);
    $('bench-filter').value = noise.filter; $('bench-curve').value = noise.curve;
    const container = $('noise-bench-knobs'); container.replaceChildren();
    ['cutoff', 'decay', 'attack', 'drive', 'rate', 'bursts'].forEach((key) => {
      const descriptor = window.GrainSynth.descriptors.noise.find(item => item.key === key);
      const formatter = value => window.GrainSynth.format(window.GrainSynth.fromNormalized(value, descriptor), descriptor);
      const control = knobControl('bench-' + key, descriptor.label, window.GrainSynth.toNormalized(noise[key], descriptor), formatter, value => {
        noise[key] = window.GrainSynth.fromNormalized(value, descriptor);
        drawVoice(); if (voiceLab) { voiceLab.render(); voiceLab.draw(); }
      });
      control.querySelector('.knob').title = descriptor.title; container.append(control);
    });
  }
  function updateRecipeDescription() {
    const recipe = (window.NOISE_RECIPES || []).find(item => item.id === $('noise-recipe-select').value);
    $('noise-recipe-description').textContent = recipe ? recipe.description : '';
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
    renderRows(); renderBanks(); renderVoice(); renderMaster(); renderChainEditor();
  }
  function random() {
    remember(); useNativeGrid();
    state.tracks.forEach((track, row) => {
      const hidden = track.steps.slice(state.stepCount);
      track.steps = Array.from({ length: state.stepCount }, (_, index) => {
        const step = index % 16;
        let chance = [.12, .04, .14, .06, .04, .02, .12, .06][row];
        if (row === 0 && (step === 0 || step === 8)) return 2;
        if ((row === 1 || row === 5) && (step === 4 || step === 12)) return row === 1 ? 2 : 1;
        if (row === 2) chance = step % 2 ? .32 : .94;
        if (row === 3 && step % 8 === 6) chance = .8;
        if (row === 4 && step % 4 === 2) chance = .4;
        if (row === 6 && step % 4 === 3) chance = .5;
        if (row === 7 && step === 0) return 1;
        return Math.random() < chance ? (Math.random() < .15 ? 2 : 1) : 0;
      }).concat(hidden);
    });
    bankLocks[bank] = bankLocks[bank].map(row => row.map((lock, step) => step < state.stepCount ? {} : lock));
    renderRows(); persist(); toast('New groove. The crumbs have rearranged themselves.');
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function safeName(name = state.name) { return String(name || 'my-groove').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-groove'; }
  async function exportAudio({ scope = 'pattern', bars = 1, tailSeconds, signal } = {}) {
    if (signal?.aborted) throw new DOMException('Audio export cancelled.', 'AbortError');
    if (!['pattern', 'chain', 'voice', 'hit'].includes(scope)) throw new Error('Choose a pattern, chain, selected voice pattern, or selected voice hit.');
    if (exporting) throw new Error('Wait for the current SIZZLE render to finish.');
    const snapshot = clone(state), voice = selected;
    snapshot.stepLocks = clone(bankLocks[bank]);
    if (scope === 'voice' || scope === 'hit') { snapshot.tracks = [{ ...snapshot.tracks[voice], mute: false, solo: false }]; snapshot.stepLocks = [snapshot.stepLocks[voice]]; }
    if (scope === 'hit') snapshot.tracks[0].steps = [1, ...Array(15).fill(0)];
    if (scope === 'hit') delete snapshot.stepLocks;
    const sequence = scope === 'chain' ? sequenceFrames('chain') : undefined;
    if (sequence) getSequencerPattern({ scope: 'chain' });
    const sourceLabel = scope === 'pattern' || scope === 'chain' ? snapshot.name : snapshot.tracks[0].name || 'Voice ' + (voice + 1);
    exporting = true;
    try {
      const blob = await engine.exportWav(snapshot, { bars, scope: scope === 'hit' ? 'hit' : 'pattern', tailSeconds, signal, sequence });
      return { blob, sampleRate: 44100, name: 'sizzle-' + safeName(sourceLabel) + '-' + scope + '.wav', tempo: snapshot.bpm, sourceApp: 'grain', sourceLabel, scope };
    } finally { exporting = false; }
  }
  async function exportWav() {
    if (exporting) return;
    exporting = true; $('export-button').disabled = true; $('export-button').innerHTML = icon('download') + '<span>Rendering…</span>';
    const snapshot = clone(state), filename = 'sizzle-' + safeName(snapshot.name) + '-' + snapshot.bpm + 'bpm.wav';
    snapshot.stepLocks = clone(bankLocks[bank]);
    toast(chain.enabled ? 'Rendering the complete chain…' : 'Rendering four bars of audio…');
    try {
      const sequence = chain.enabled ? sequenceFrames('chain') : undefined;
      if (sequence) getSequencerPattern({ scope: 'chain' });
      const blob = await engine.exportWav(snapshot, { sequence }); download(blob, filename); toast(chain.enabled ? 'Your full chain is ready. Effect tail included.' : 'Your four-bar loop is ready. Effect tail included.');
    }
    catch (error) { toast(error.message || 'Could not render audio. Please try again.'); }
    finally { exporting = false; $('export-button').disabled = false; $('export-button').innerHTML = icon('download') + '<span>Export WAV</span>'; }
  }

  // The displays are drawn locally so the entire instrument travels in one file.
  let heroTime = 0, lastFrame = 0, heroFrame = null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function drawHero(time) {
    const canvas = $('hero-wave'), ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#3b4447'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    for (let x = 2; x < w; x += 4) {
      const env = Math.sin(x / w * Math.PI) ** 1.8;
      const beat = .3 + .7 * Math.abs(Math.sin(x * .014 + time * .4));
      const signal = Math.abs(Math.sin(x * .73 + time) * Math.cos(x * .17 - time * .5));
      const amplitude = (3 + signal * 40) * env * beat;
      ctx.strokeStyle = x < w * .48 ? '#ff8d45' : '#dcc85e'; ctx.globalAlpha = .3 + signal * .7; ctx.beginPath(); ctx.moveTo(x, h / 2 - amplitude); ctx.lineTo(x, h / 2 + amplitude); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function drawVoice() {
    const canvas = $('voice-wave'), ctx = canvas.getContext('2d'); if (!ctx) return;
    const track = state.tracks[selected], synth = window.GrainSynth.ensureTrack(track), w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h); ctx.strokeStyle = '#3b4447'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.strokeStyle = colors[selected]; ctx.lineWidth = 1.3; ctx.beginPath();
    const noiseIndex = sources.findIndex((s) => s.id === track.noise);
    const duration = Math.max(.08, synth.body.level ? synth.body.attack + synth.body.hold + synth.body.decay : 0, synth.noise.level ? synth.noise.attack + synth.noise.hold + synth.noise.decay : 0);
    const envelope = (time, layer) => {
      if (time < layer.attack) return time / layer.attack;
      if (time < layer.attack + layer.hold) return 1;
      const phase = (time - layer.attack - layer.hold) / layer.decay;
      if (phase >= 1) return 0;
      return layer.curve === 'linear' ? 1 - phase : Math.exp(-9.2 * phase);
    };
    for (let x = 0; x < w; x++) {
      const time = x / w * duration;
      const body = Math.sin(time * synth.body.frequency * Math.PI * 2) * synth.body.level * envelope(time, synth.body);
      const noise = Math.sin(x * (1.8 + noiseIndex * .41) * synth.noise.rate) * Math.cos(x * .29) * synth.noise.level * envelope(time, synth.noise);
      const signal = (body + noise * .7) / Math.max(1, synth.body.level + synth.noise.level * .7);
      const y = h / 2 + signal * track.level * 31;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  function animate(timestamp) {
    heroFrame = null;
    if (!playing || reducedMotion || document.hidden) return;
    if (playing && !reducedMotion && timestamp - lastFrame > 60) { heroTime += .065; drawHero(heroTime); lastFrame = timestamp; }
    heroFrame = requestAnimationFrame(animate);
  }
  function startHeroAnimation() {
    // This loop animates decoration only. Parameter diagrams still draw immediately.
    if (heroFrame === null && playing && !reducedMotion && !document.hidden) heroFrame = requestAnimationFrame(animate);
  }
  function stopHeroAnimation() {
    if (heroFrame !== null) cancelAnimationFrame(heroFrame);
    heroFrame = null;
  }

  window.NOISE_PRESETS.forEach((preset, i) => { const option = document.createElement('option'); option.value = i; option.textContent = preset.name; $('preset-select').append(option); });
  const recipeGroups = new Map();
  (window.NOISE_RECIPES || []).forEach(recipe => {
    if (!recipeGroups.has(recipe.family)) { const group = document.createElement('optgroup'); group.label = recipe.family; recipeGroups.set(recipe.family, group); $('noise-recipe-select').append(group); }
    const option = document.createElement('option'); option.value = recipe.id; option.textContent = recipe.name; recipeGroups.get(recipe.family).append(option);
  });
  updateRecipeDescription();
  $('noise-recipe-select').addEventListener('change', updateRecipeDescription);
  $('apply-noise-recipe').addEventListener('click', () => {
    const recipe = (window.NOISE_RECIPES || []).find(item => item.id === $('noise-recipe-select').value); if (!recipe) return;
    remember(); const track = state.tracks[selected]; track.noise = recipe.source;
    window.GrainSynth.ensureTrack(track).noise = clone(recipe.noise);
    renderRows(); renderVoice(); persist();
    toast(recipe.name + ' applied to noise only. Body, rhythm, mix and modulation kept.');
    if (!playing) audition(track);
  });
  ['filter', 'curve'].forEach(key => $('bench-' + key).addEventListener('change', () => {
    remember(); window.GrainSynth.ensureTrack(state.tracks[selected]).noise[key] = $('bench-' + key).value;
    drawVoice(); if (voiceLab) voiceLab.render(); persist();
  }));
  $('noise-bench').addEventListener('toggle', () => $('open-noise-bench').setAttribute('aria-expanded', $('noise-bench').open));
  $('open-noise-bench').addEventListener('click', () => {
    const panel = $('noise-bench'); panel.open = true;
    panel.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
  });
  const customOption = document.createElement('option'); customOption.value = 'custom'; customOption.textContent = 'Custom groove'; customOption.hidden = true; $('preset-select').append(customOption);
  sources.forEach((source) => {
    const button = document.createElement('button'); button.className = 'noise-source'; button.dataset.noise = source.id; button.style.setProperty('--noise-color', source.color); button.innerHTML = '<span aria-hidden="true"></span>' + source.name;
    button.title = source.name + ' noise — ' + source.description; button.setAttribute('aria-label', 'Use ' + source.name.toLowerCase() + ' noise');
    button.addEventListener('click', () => { if (state.tracks[selected].noise === source.id) return; remember(); state.tracks[selected].noise = source.id; renderRows(); renderVoice(); persist(); if (!playing) audition(state.tracks[selected]); });
    $('noise-sources').append(button);
  });
  $('play-button').addEventListener('click', () => playing || busy ? stop() : play());
  $('restart-button').addEventListener('click', () => { stop(); play(); });
  $('audition-button').addEventListener('click', () => audition(state.tracks[selected]));
  $('tempo').addEventListener('change', () => { remember(); state.bpm = Math.round(clamp($('tempo').value || state.bpm, 40, 240)); $('tempo').value = state.bpm; persist(); if (voiceLab) { voiceLab.draw(); voiceLab.updateNote(); } });
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
    state = { ...clone(preset), master: state.master, stepCount: 16 }; banks = [state.tracks.map((t) => [...t.steps]), ...Array.from({ length: 3 }, () => Array.from({ length: 8 }, () => Array(16).fill(0)))]; bank = 0; sequencePage = 0;
    bankLocks = window.GrainSequence.emptyLocks(banks); chain = window.GrainSequence.emptyChain();
    state.tracks.forEach((track) => window.GrainSynth.ensureTrack(track));
    renderAll(); persist(); toast(preset.tagline); if (wasPlaying) play();
  });
  document.querySelectorAll('[data-bank]').forEach((button) => button.addEventListener('click', () => {
    const next = Number(button.dataset.bank); if (next === bank) return;
    remember(); useNativeGrid();
    banks[bank] = state.tracks.map((t) => [...t.steps]); bank = next; state.tracks.forEach((t, i) => { t.steps = [...banks[bank][i]]; }); renderRows(); renderBanks(); persist();
  }));
  $('copy-pattern').addEventListener('click', () => { remember(); const next = (bank + 1) % 4; banks[next] = state.tracks.map((t) => [...t.steps]); bankLocks[next] = clone(bankLocks[bank]); persist(); toast('Pattern ' + 'ABCD'[bank] + ' and its overrides copied to ' + 'ABCD'[next] + '.'); });
  $('sequence-length').addEventListener('change', () => {
    const length = Number($('sequence-length').value); if (length === state.stepCount) return;
    remember(); useNativeGrid(); state.stepCount = length;
    if (length === 32) {
      const extend = (steps) => steps.concat(Array(Math.max(0, 32 - steps.length)).fill(0));
      state.tracks.forEach((track) => { track.steps = extend(track.steps); }); banks = banks.map((pattern) => pattern.map(extend));
      bankLocks = bankLocks.map(pattern => pattern.map(row => row.concat(Array.from({ length: Math.max(0, 32 - row.length) }, () => ({})))));
    } else sequencePage = 0;
    renderRows(); persist();
  });
  $('sequence-page').addEventListener('change', () => { sequencePage = Number($('sequence-page').value); renderRows(); });
  $('clear-button').addEventListener('click', () => { remember(); useNativeGrid(); state.tracks.forEach((track) => { track.steps = track.steps.map((value, step) => step < state.stepCount ? 0 : value); }); bankLocks[bank] = bankLocks[bank].map(row => row.map((lock, step) => step < state.stepCount ? {} : lock)); renderRows(); persist(); toast('Pattern and active step overrides cleared.'); });
  $('random-button').addEventListener('click', random);
  $('undo-button').addEventListener('click', undo);
  $('save-button').addEventListener('click', () => { download(new Blob([JSON.stringify(project(), null, 2)], { type: 'application/json' }), 'sizzle-' + safeName() + '.json'); toast('Project saved.'); });
  $('open-button').addEventListener('click', () => $('project-file').click());
  $('project-file').addEventListener('change', async (event) => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('That file is too large for a SIZZLE project.');
      const data = validateProject(JSON.parse(await file.text())); remember(); stop(); restore(data); renderAll(); persist(); toast('Project opened.');
    } catch (error) { toast(error instanceof SyntaxError ? 'That file is not a valid SIZZLE project.' : error.message); }
    finally { event.target.value = ''; }
  });
  $('export-button').addEventListener('click', exportWav);
  $('edit-synthesis').addEventListener('click', () => { $('synthesis-panel').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' }); });
  $('lab-audition').addEventListener('click', () => audition(state.tracks[selected]));
  $('help-button').addEventListener('click', () => $('help-dialog').showModal());
  $('close-help').addEventListener('click', () => $('help-dialog').close());
  $('help-dialog').addEventListener('click', (event) => { if (event.target === $('help-dialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); } });
  $('chain-button').addEventListener('click', () => { renderChainEditor(); $('chain-dialog').showModal(); });
  $('chain-close').addEventListener('click', () => $('chain-dialog').close());
  $('chain-enabled').addEventListener('change', () => changeChain(() => { chain.enabled = $('chain-enabled').checked; }));
  $('chain-loop').addEventListener('change', () => changeChain(() => { chain.loop = $('chain-loop').checked; }));
  $('chain-add').addEventListener('click', () => { if (chain.entries.length < 16) changeChain(() => chain.entries.push({ bank: Number($('chain-add-bank').value), repeats: 1 })); });
  $('chain-clear').addEventListener('click', () => changeChain(() => { chain.entries = []; }));
  $('chain-undo').addEventListener('click', () => { undo(); renderChainEditor(); });
  $('step-edit-button').addEventListener('click', () => { stepEditMode = !stepEditMode; $('step-edit-button').setAttribute('aria-pressed', stepEditMode); toast(stepEditMode ? 'Choose a step to edit its sound. Shift + click still accents.' : 'Step editing off. Click steps to toggle hits.'); });
  $('step-close').addEventListener('click', () => $('step-dialog').close());
  $('step-hit').addEventListener('change', () => {
    if (!stepTarget) return;
    remember(); useNativeGrid(); bankSteps(stepTarget.bank)[stepTarget.voice][stepTarget.step] = Number($('step-hit').value);
    renderRows(); persist();
  });
  $('step-clear-locks').addEventListener('click', () => {
    if (!stepTarget) return;
    remember(); useNativeGrid(); bankLocks[stepTarget.bank][stepTarget.voice][stepTarget.step] = {};
    renderRows(); renderStepInspector(); persist();
  });
  $('step-undo').addEventListener('click', () => { undo(); renderStepInspector(); });
  $('step-audition').addEventListener('click', () => { if (stepTarget) audition(state.tracks[stepTarget.voice], bankLocks[stepTarget.bank][stepTarget.voice][stepTarget.step]); });
  [$('chain-dialog'), $('step-dialog')].forEach(dialog => dialog.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.target.matches('input,select')) { event.preventDefault(); undo(); renderChainEditor(); renderStepInspector(); }
  }));
  document.querySelector('.brand').addEventListener('click', (event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' }); });
  document.addEventListener('keydown', (event) => {
    if (document.querySelector('dialog[open]') || event.target.matches('input,select,textarea') || event.target.isContentEditable) return;
    if (event.code === 'Space' && !event.target.matches('button,[role=slider]')) { event.preventDefault(); playing || busy ? stop() : play(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
    if (!event.ctrlKey && !event.metaKey && /^[1-8]$/.test(event.key)) { selected = Number(event.key) - 1; renderRows(); renderVoice(); audition(state.tracks[selected]); persist(); }
  });
  window.addEventListener('pagehide', () => { try { localStorage.setItem(storageKey, JSON.stringify(project())); } catch (_) {} engine.stop(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && playing && engine.context && engine.context.state !== 'running') { stop(); toast('Audio paused. Press play to pick up the rhythm.'); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopHeroAnimation(); else startHeroAnimation(); });
  voiceLab = new window.GrainVoiceLab({ getTrack: () => state.tracks[selected], getBpm: () => state.bpm, remember, persist, knobControl, onChange: () => { refreshMixer(); drawVoice(); renderNoiseBench(); persist(); }, audition: () => audition(state.tracks[selected]) });
  if (window.KitchenVoiceEffects) voiceFxEditor = window.KitchenVoiceEffects.mount($('voice-effects'), {
    getSlots: () => state.tracks[selected].galleyFx,
    onUndo: undo,
    getMeters: () => engine.environment?.voiceBank?.getMeters(selected) || [null, null],
    getLabel: () => 'SIZZLE · Voice ' + (selected + 1) + ' · ' + pretty(state.tracks[selected].name),
    onChange: (slots, meta = {}) => {
      if (meta.gesture !== voiceFxGesture || !meta.gesture) { remember(); voiceFxGesture = meta.gesture || null; }
      state.tracks[selected].galleyFx = window.GrainSynth.normalizeVoiceEffects(slots, true);
      engine.setVoiceState(state); persist();
      window.MusicLabHost?.notifyStateChange?.();
    }
  });
  engine.sequenceSource = { next: nextPattern, read: position => ({ steps: bankSteps(position.bank), locks: bankLocks[position.bank] }), ended: finishPlayback };
  renderAll(); drawHero(0);
  window.GrainApp = { prepare: async () => { await engine.init(); engine.setVoiceState(state); syncEffects(); }, getState: () => clone(state), getProject: project, getSequencerPattern, get sequenceLoop() { return !chain.enabled || chain.loop; }, isPlaying: () => playing, play, stop, engine, exportAudio,
    applyMusicLabPattern(overlay) {
      const next = project(); if (overlay) next.state.musicLabPattern = clone(overlay); else delete next.state.musicLabPattern;
      validateProject(next); remember(); stop(); restore(next); renderAll(); persist();
    },
    loadState(data) { const next = validateProject(clone(data)); remember(); stop(); restore(next); renderAll(); persist(); },
    audioExport: { scopes: [{ id: 'pattern', label: 'Current bank mix' }, { id: 'chain', label: 'Complete chain', usesBars: false }, { id: 'voice', label: 'Selected voice pattern' }, { id: 'hit', label: 'Selected voice hit', usesBars: false }], defaultBars: 1, maxBars: 16 } };
}());
