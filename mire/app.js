/* REDUCE interface. All synthesis lives in audio-engine.js. */
(() => {
  'use strict';
  const S = window.MireSchema, presets = window.MirePresets;
  const $ = id => document.getElementById(id);
  const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = v => Math.round(v * 100) + '%';
  const hz = v => v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 1 : 2).replace(/0$/, '') + 'k Hz' : Math.round(v) + ' Hz';
  const ms = v => v >= 1000 ? (v / 1000).toFixed(2) + ' s' : Math.round(v) + ' ms';
  const pan = v => Math.abs(v) < .02 ? 'Center' : Math.round(Math.abs(v) * 100) + (v < 0 ? ' L' : ' R');
  const copy = value => JSON.parse(JSON.stringify(value));
  const colors = ['#ff8d45', '#d6c05b', '#a2b7bd', '#ef7357'];
  const storageKey = 'mire-project-v1';
  let state = S.normalize(presets[0].state), engine, selectedNode = 0, selectedSource = 0, selectedStep = 0;
  let autosaveTimer, toastTimer, storageWarned = false, busy = false, playBusy = false, recordBusy = false, recordStarted = 0, popover;
  let currentStep = -1, presetId = presets[0].id, history = [], activeGesture = false, micDestination = 0;
  let sourceFlashes = [0, 0, 0, 0], stepTimers = new Set();
  try { const saved = localStorage.getItem(storageKey); if (saved) { state = S.parseProject(saved); presetId = 'custom'; } } catch (_) { /* File origins and private sessions may not offer storage. */ }
  engine = new window.MireAudio(state);

  function snapshot() { const saved = copy({ ...state, samples: [] }); saved.samples = state.samples.slice(); return saved; }
  function remember() { history.push(snapshot()); if (history.length > 32) history.shift(); $('undo-button').disabled = false; }
  function gestureStart() { if (!activeGesture) { remember(); activeGesture = true; } }
  function gestureEnd() { activeGesture = false; }
  function markChanged() {
    engine.setState(state); presetId = 'custom'; $('preset-select').value = 'custom';
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      try { localStorage.setItem(storageKey, S.serializeProject(state)); }
      catch (_) { if (!storageWarned) { storageWarned = true; toast('Browser storage is unavailable or full. Save project keeps your work.'); } }
    }, 650);
  }
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3800); }
  function errorMessage(error) { return error?.message || 'This action could not be completed.'; }
  function download(blob, filename) { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 20000); }
  function filename(suffix) { return 'REDUCE-' + state.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 50).toLowerCase() + suffix; }
  function optionList(options, selected) { return options.map(o => { const id = typeof o === 'string' ? o : o.id; return `<option value="${esc(id)}"${id === selected ? ' selected' : ''}>${esc(typeof o === 'string' ? o : o.name)}</option>`; }).join(''); }
  function field(label, options, value, callback, ariaLabel) {
    const wrap = document.createElement('div'); wrap.className = 'parameter compact';
    const lab = document.createElement('label'); lab.className = 'control-label'; lab.textContent = label;
    const select = document.createElement('select'); select.innerHTML = optionList(options, value); select.setAttribute('aria-label', ariaLabel || label); select.addEventListener('change', () => { remember(); callback(select.value); markChanged(); });
    lab.appendChild(select); wrap.appendChild(lab); return wrap;
  }
  function range(label, min, max, value, formatter, callback, config = {}) {
    const wrap = document.createElement('div'); wrap.className = 'parameter';
    const lab = document.createElement('label'); lab.className = 'parameter-label';
    const title = document.createElement('span'); title.textContent = label;
    const output = document.createElement('output'); output.textContent = formatter(value);
    lab.append(title, output); const input = document.createElement('input'); input.type = 'range';
    const toUnit = v => config.log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min);
    const fromUnit = unit => { const v = config.log ? min * Math.pow(max / min, unit) : min + (max - min) * unit; return config.integer ? Math.round(v) : v; };
    input.min = '0'; input.max = '1'; input.step = config.integer ? String(1 / (max - min)) : '.001'; input.value = clamp(toUnit(value));
    input.setAttribute('aria-label', config.aria || label); input.setAttribute('aria-valuetext', formatter(value)); input.style.setProperty('--fill', pct(toUnit(value)));
    input.addEventListener('pointerdown', gestureStart); input.addEventListener('keydown', e => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) gestureStart(); });
    input.addEventListener('input', () => { gestureStart(); const next = fromUnit(+input.value); callback(next); output.textContent = formatter(next); input.setAttribute('aria-valuetext', formatter(next)); input.style.setProperty('--fill', pct(+input.value)); markChanged(); });
    input.addEventListener('change', gestureEnd); input.addEventListener('pointerup', gestureEnd); input.addEventListener('keyup', gestureEnd); input.addEventListener('blur', gestureEnd);
    wrap.append(lab, input); return wrap;
  }

  function renderTransport() {
    $('tempo').value = state.tempo; $('swing').value = state.swing; $('swing').style.setProperty('--fill', pct(state.swing / .45)); $('swing-value').textContent = pct(state.swing);
    $('preset-select').innerHTML = optionList(presets, presetId) + `<option value="custom"${presetId === 'custom' ? ' selected' : ''}>Custom reduction</option>`;
    updatePlayback(); updateFreeze();
  }
  function updatePlayback() { const playing = !!engine.isPlaying; $('play-button').classList.toggle('playing', playing); $('play-button').setAttribute('aria-label', playing ? 'Stop sequencer' : 'Play sequencer'); $('play-button').querySelector('use').setAttribute('href', playing ? '#icon-stop' : '#icon-play'); $('play-button').querySelector('span').textContent = playing ? 'Stop' : 'Play'; $('audio-status-dot').classList.toggle('active', playing || engine.micEnabled); updateMic(); }
  function updateFreeze() { $('freeze-button').classList.toggle('active', state.garden.freeze); $('freeze-button').setAttribute('aria-pressed', String(state.garden.freeze)); $('network-status').textContent = state.garden.freeze ? 'THE RETURN IS HELD' : engine.isPlaying ? 'CIRCULATING SOUND' : 'AWAITING INGREDIENTS'; }
  function updateMic() { $('mic-button').classList.toggle('mic-active', !!engine.micEnabled); $('mic-button').setAttribute('aria-pressed', String(!!engine.micEnabled)); $('mic-button').querySelector('span').textContent = engine.micEnabled ? 'Mic live' : 'Microphone'; }
  function nodeShort(index) { const name = state.nodes[index].name.replace(/^[A-D]\s*[·:]\s*/, ''); return ({ Moss: 'Stockpot', Silt: 'Bain-marie', Reed: 'Saucepan', Hollow: 'Kettle' })[name] || name; }
  function renderNodeButtons() {
    $('node-buttons').innerHTML = state.nodes.map((n, i) => `<button class="node-select${selectedNode === i ? ' active' : ''}" data-node="${i}" style="--node-color:${colors[i]}" aria-pressed="${selectedNode === i}" aria-label="Select node ${String.fromCharCode(65 + i)}: ${esc(nodeShort(i))}"><span class="node-symbol" aria-hidden="true"></span><span><b>${esc(nodeShort(i))}</b><small>${String.fromCharCode(65 + i)} · ${esc(S.NODE_MODELS.find(m => m.id === n.model)?.name || n.model)}</small></span></button>`).join('');
    $('node-buttons').querySelectorAll('button').forEach(button => button.addEventListener('click', () => { selectedNode = +button.dataset.node; renderNodeButtons(); renderNodeEditor(); }));
  }
  function renderNodeEditor() {
    const n = state.nodes[selectedNode], prefix = `Node ${String.fromCharCode(65 + selectedNode)} `;
    $('node-index').textContent = 'NODE ' + String.fromCharCode(65 + selectedNode) + ' / ' + String(selectedNode + 1).padStart(2, '0');
    $('node-title').textContent = nodeShort(selectedNode); $('node-model').innerHTML = optionList(S.NODE_MODELS, n.model); $('model-description').textContent = S.NODE_MODELS.find(m => m.id === n.model).description;
    const container = $('node-controls'); container.replaceChildren();
    const specs = [
      ['TIME', 'time', 20, 1500, ms, { log: true }], ['PITCH', 'pitch', 24, 96, S.noteName, { integer: true }],
      ['TONE', 'tone', 120, 18000, hz, { log: true }], ['DECAY', 'decay', .05, .98, pct],
      ['RESONANCE', 'resonance', 0, 1, pct], ['DRIFT', 'drift', 0, 1, pct],
      ['PAN', 'pan', -1, 1, pan], ['LEVEL', 'level', 0, 1.25, pct],
    ];
    specs.forEach(([label, key, min, max, formatter, cfg]) => container.append(range(label, min, max, n[key], formatter, v => { n[key] = v; }, { ...cfg, aria: prefix + label.toLowerCase() })));
    if (n.sync) { const beats = { '1/16': .25, '1/8': .5, '3/16': .75, '1/4': 1, '3/8': 1.5, '1/2': 2, '3/4': 3, '1/1': 4 }; const timeControl = container.firstElementChild; timeControl.querySelector('input').disabled = true; timeControl.querySelector('input').title = 'Disable Sync time to adjust delay freely.'; timeControl.querySelector('output').textContent = ms(60000 / state.tempo * beats[n.division]); timeControl.querySelector('.parameter-label > span').textContent = 'TIME · SYNC'; }
    const row = document.createElement('div'); row.className = 'sync-field'; row.innerHTML = `<label class="switch-control"><input type="checkbox"${n.sync ? ' checked' : ''} aria-label="${prefix}tempo sync">Sync time</label><select aria-label="${prefix}tempo division">${optionList(S.DIVISIONS, n.division)}</select><label class="switch-control node-mute"><input type="checkbox"${n.mute ? ' checked' : ''} aria-label="${prefix}mute">Mute</label>`;
    const checkboxes = row.querySelectorAll('input'); checkboxes[0].addEventListener('change', () => { remember(); n.sync = checkboxes[0].checked; markChanged(); renderNodeEditor(); }); checkboxes[1].addEventListener('change', () => { remember(); n.mute = checkboxes[1].checked; markChanged(); }); row.querySelector('select').addEventListener('change', e => { remember(); n.division = e.target.value; markChanged(); renderNodeEditor(); }); container.append(row);
  }
  function renderSources() {
    $('step-numbers').innerHTML = Array.from({ length: 16 }, (_, i) => `<span${i % 4 === 0 ? ' class="bar-start"' : ''}>${String(i + 1).padStart(2, '0')}</span>`).join('');
    $('source-rows').innerHTML = state.sources.map((s, i) => `<div class="source-row"><button class="source-select${selectedSource === i ? ' active' : ''}" data-source="${i}" aria-pressed="${selectedSource === i}" aria-label="Edit source ${i + 1}: ${esc(s.name)}"><span class="source-dot">0${i + 1}</span><span><b>${esc(s.name)}</b><small>${esc(S.SOURCE_KINDS.find(k => k.id === s.kind)?.name)} → ${String.fromCharCode(65 + s.destination)}</small></span></button><div class="steps" role="group" aria-label="${esc(s.name)} 16-step sequence">${s.steps.map((step, j) => `<button class="step${step.on ? ' on' : ''}${step.velocity >= .9 ? ' accent' : ''}${currentStep === j ? ' current' : ''}" data-source="${i}" data-step="${j}" aria-label="Source ${i + 1}, step ${j + 1}, ${step.on ? 'on' : 'off'}${step.velocity >= .9 ? ', accented' : ''}, probability ${pct(step.probability)}, repeats ${step.ratchet}" aria-pressed="${step.on}" title="Click: toggle · Shift + click: accent · Right click / long press: step settings"><span class="step-detail">${step.ratchet > 1 ? '×' + step.ratchet : step.probability < 1 ? '?' : ''}</span></button>`).join('')}</div><button class="mute-button${s.mute ? ' active' : ''}" data-source="${i}" aria-label="Mute source ${i + 1}" aria-pressed="${s.mute}">M</button></div>`).join('');
    $('source-rows').querySelectorAll('.source-select').forEach(button => button.addEventListener('click', () => { selectedSource = +button.dataset.source; renderSources(); renderSourceEditor(); }));
    $('source-rows').querySelectorAll('.mute-button').forEach(button => button.addEventListener('click', () => { remember(); state.sources[+button.dataset.source].mute = !state.sources[+button.dataset.source].mute; markChanged(); renderSources(); }));
    $('source-rows').querySelectorAll('.step').forEach(button => {
      let holdTimer, didHold = false;
      button.addEventListener('pointerdown', e => { didHold = false; if (e.pointerType === 'touch') holdTimer = setTimeout(() => { didHold = true; showStepPopover(button); }, 500); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => button.addEventListener(type, () => clearTimeout(holdTimer)));
      button.addEventListener('click', e => { if (didHold) return; closePopover(); selectedSource = +button.dataset.source; selectedStep = +button.dataset.step; remember(); const step = state.sources[+button.dataset.source].steps[+button.dataset.step]; if (e.shiftKey) { step.on = true; step.velocity = step.velocity >= .9 ? .65 : 1; } else step.on = !step.on; markChanged(); renderSources(); renderSourceEditor(); });
      button.addEventListener('contextmenu', e => { e.preventDefault(); showStepPopover(button); });
      button.addEventListener('keydown', e => { if (e.key === 'Enter' && e.altKey) { e.preventDefault(); showStepPopover(button); } });
    });
  }
  function closePopover() { if (popover) { popover.remove(); popover = null; } }
  function showStepPopover(button) {
    closePopover(); const i = +button.dataset.source, j = +button.dataset.step; selectedSource = i; selectedStep = j; const step = state.sources[i].steps[j];
    popover = document.createElement('div'); popover.className = 'step-popover'; popover.setAttribute('role', 'dialog'); popover.setAttribute('aria-label', 'Step settings');
    const heading = document.createElement('h3'); heading.textContent = `SOURCE ${i + 1} / STEP ${String(j + 1).padStart(2, '0')}`; popover.append(heading);
    popover.append(range('VELOCITY', .1, 1, step.velocity, pct, v => { step.velocity = v; renderSources(); }, { aria: 'Step velocity' }));
    popover.append(range('PROBABILITY', 0, 1, step.probability, pct, v => { step.probability = v; renderSources(); }, { aria: 'Step probability' }));
    popover.append(range('RATCHETS', 1, 4, step.ratchet, v => Math.round(v) + ' hits', v => { step.ratchet = v; renderSources(); }, { integer: true, aria: 'Step ratchets' }));
    const note = document.createElement('p'); note.className = 'step-popover-note'; note.textContent = 'Click outside to close. Alt + Enter opens settings from a focused step.'; popover.append(note); document.body.append(popover);
    const rect = button.getBoundingClientRect(); popover.style.left = Math.max(12, Math.min(innerWidth - 250, rect.left)) + 'px'; popover.style.top = Math.max(12, Math.min(innerHeight - 255, rect.bottom + 8)) + 'px'; popover.querySelector('input').focus();
  }
  function renderSourceEditor() {
    const source = state.sources[selectedSource], prefix = `Source ${selectedSource + 1} `;
    $('source-index').textContent = 'SOURCE ' + String(selectedSource + 1).padStart(2, '0'); $('source-name').textContent = source.name;
    $('source-type').innerHTML = optionList(S.SOURCE_KINDS, source.kind); const asset = state.samples[selectedSource]; $('sample-status').textContent = source.kind === 'sample' ? asset ? `${asset.name} · ${asset.duration.toFixed(1)} s` : 'Import a sample · first 10 seconds' : '';
    $('source-type').title = S.SOURCE_KINDS.find(k => k.id === source.kind)?.description || '';
    const container = $('source-controls'); container.replaceChildren();
    const specs = [['PITCH', 'pitch', 24, 96, S.noteName, { integer: true }], ['DECAY', 'decay', 15, 10000, ms, { log: true }], ['TONE', 'tone', 120, 18000, hz, { log: true }], ['TEXTURE', 'texture', 0, 1, pct], ['LEVEL', 'level', 0, 1, pct]];
    specs.forEach(([label, key, min, max, formatter, cfg]) => container.append(range(label, min, max, source[key], formatter, v => { source[key] = v; }, { ...cfg, aria: prefix + label.toLowerCase() })));
    container.append(field('DESTINATION', state.nodes.map((_, i) => ({ id: String(i), name: `${String.fromCharCode(65 + i)} · ${nodeShort(i)}` })), String(source.destination), value => { source.destination = +value; renderSources(); }, prefix + 'destination'));
  }
  function renderRouting() {
    const matrix = $('routing-matrix'); matrix.replaceChildren(); const empty = document.createElement('span'); matrix.append(empty);
    for (let i = 0; i < 4; i++) { const label = document.createElement('span'); label.className = 'matrix-label'; label.textContent = String.fromCharCode(65 + i); label.style.color = colors[i]; matrix.append(label); }
    for (let i = 0; i < 4; i++) {
      const label = document.createElement('span'); label.className = 'matrix-label row'; label.textContent = String.fromCharCode(65 + i) + ' →'; label.style.color = colors[i]; matrix.append(label);
      for (let j = 0; j < 4; j++) {
        const cell = document.createElement('label'); cell.className = 'route-cell' + (i === j ? ' self' : '') + (state.routing[i][j] < .001 ? ' zero' : ''); cell.style.setProperty('--route-level', pct(state.routing[i][j]));
        cell.innerHTML = `<i class="route-fill"></i><output class="route-readout">${Math.round(state.routing[i][j] * 100)}</output><input type="range" min="0" max="1" step="0.01" value="${state.routing[i][j]}" aria-label="Route ${String.fromCharCode(65 + i)} to ${String.fromCharCode(65 + j)}" aria-valuetext="${pct(state.routing[i][j])}" title="${String.fromCharCode(65 + i)} → ${String.fromCharCode(65 + j)}: drag horizontally or use arrow keys">`;
        const input = cell.querySelector('input'); input.addEventListener('pointerdown', gestureStart); input.addEventListener('keydown', gestureStart); input.addEventListener('input', () => { gestureStart(); const value = +input.value; state.routing[i][j] = value; cell.classList.toggle('zero', value < .001); cell.style.setProperty('--route-level', pct(value)); cell.querySelector('output').textContent = Math.round(value * 100); input.setAttribute('aria-valuetext', pct(value)); markChanged(); }); ['change', 'pointerup', 'keyup', 'blur'].forEach(type => input.addEventListener(type, gestureEnd)); matrix.append(cell);
      }
    }
    $('network-controls').replaceChildren(range('CIRCULATION', 0, 1, state.garden.circulation, pct, v => { state.garden.circulation = v; }, { aria: 'Feedback circulation' }), range('DAMPING', 0, 1, state.garden.damping, pct, v => { state.garden.damping = v; }, { aria: 'Feedback damping' }));
  }
  function renderModulation() {
    const container = $('lfo-controls'); container.replaceChildren();
    state.modulators.forEach((mod, i) => {
      const panel = document.createElement('div'); panel.className = 'lfo-panel'; panel.innerHTML = `<div class="lfo-title"><span>LFO 0${i + 1}</span><svg class="lfo-wave" viewBox="0 0 75 18" aria-hidden="true"><path d="M0 9 Q9 -4 18 9 T36 9 T54 9 T72 9"/></svg></div>`;
      const selects = document.createElement('div'); selects.className = 'lfo-selects'; selects.append(field('WAVE', [{ id: 'sine', name: 'Sine' }, { id: 'triangle', name: 'Triangle' }, { id: 'random', name: 'Random' }], mod.shape, v => { mod.shape = v; }, `LFO ${i + 1} wave`), field('DESTINATION', S.LFO_TARGETS, mod.target, v => { mod.target = v; }, `LFO ${i + 1} destination`));
      const ranges = document.createElement('div'); ranges.className = 'lfo-ranges'; ranges.append(range('RATE', .02, 8, mod.rate, v => v.toFixed(v < 1 ? 3 : 2) + ' Hz', v => { mod.rate = v; }, { log: true, aria: `LFO ${i + 1} rate` }), range('DEPTH', 0, 1, mod.depth, pct, v => { mod.depth = v; }, { aria: `LFO ${i + 1} depth` })); panel.append(selects, ranges); container.append(panel);
    });
  }
  const targetName = id => S.LFO_TARGETS.find(t => t.id === id)?.name || 'Unassigned';
  function applyPerformanceTarget(id, unit) {
    if (id === 'none') return;
    if (id === 'circulation') state.garden.circulation = unit;
    else if (id === 'drive') state.master.drive = unit;
    else { const match = /^n([0-3])\.(\w+)$/.exec(id); if (!match) return; const node = state.nodes[+match[1]], key = match[2]; if (key === 'time') node.sync = false; node[key] = key === 'tone' ? 120 * Math.pow(150, unit) : key === 'time' ? 20 + 1480 * unit : key === 'pitch' ? Math.round(24 + 72 * unit) : key === 'pan' ? -1 + 2 * unit : key === 'decay' ? .05 + .93 * unit : node[key]; }
  }
  function performanceUnit(id, fallback) {
    if (id === 'circulation') return clamp(state.garden.circulation);
    if (id === 'drive') return clamp(state.master.drive);
    const match = /^n([0-3])\.(\w+)$/.exec(id); if (!match) return fallback;
    const node = state.nodes[+match[1]], key = match[2], value = node[key];
    return clamp(key === 'tone' ? Math.log(value / 120) / Math.log(150) : key === 'time' ? (value - 20) / 1480 : key === 'pitch' ? (value - 24) / 72 : key === 'pan' ? (value + 1) / 2 : key === 'decay' ? (value - .05) / .93 : fallback);
  }
  function updateXYVisual() { const p = state.performance; $('xy-point').style.left = pct(p.x); $('xy-point').style.top = pct(1 - p.y); $('xy-position').textContent = `X ${Math.round(p.x * 100)} · Y ${Math.round(p.y * 100)}`; $('xy-x-label').textContent = targetName(p.xTarget).toUpperCase() + ' →'; $('xy-y-label').textContent = targetName(p.yTarget).toUpperCase(); }
  function renderPerformance() {
    const p = state.performance, controls = $('xy-controls'); p.x = performanceUnit(p.xTarget, p.x); p.y = performanceUnit(p.yTarget, p.y); controls.replaceChildren();
    controls.append(field('X AXIS', S.LFO_TARGETS, p.xTarget, value => { p.xTarget = value; renderPerformance(); }, 'X axis destination'), field('Y AXIS', S.LFO_TARGETS, p.yTarget, value => { p.yTarget = value; renderPerformance(); }, 'Y axis destination'));
    controls.append(range('X POSITION', 0, 1, p.x, pct, value => { p.x = value; applyPerformanceTarget(p.xTarget, value); updateXYVisual(); }, { aria: 'Performance X position' }), range('Y POSITION', 0, 1, p.y, pct, value => { p.y = value; applyPerformanceTarget(p.yTarget, value); updateXYVisual(); }, { aria: 'Performance Y position' })); controls.querySelectorAll('input').forEach(input => input.addEventListener('change', () => { renderNodeEditor(); renderRouting(); renderMaster(); })); updateXYVisual();
  }
  function renderMaster() { $('master-controls').replaceChildren(...[['OUTPUT', 'volume'], ['WET / DRY', 'mix'], ['DRIVE', 'drive'], ['WIDTH', 'width']].map(([label, key]) => range(label, 0, 1, state.master[key], pct, value => { state.master[key] = value; }, { aria: 'Master ' + key }))); }
  function renderAll() { closePopover(); renderTransport(); renderNodeButtons(); renderNodeEditor(); renderSources(); renderSourceEditor(); renderRouting(); renderModulation(); renderPerformance(); renderMaster(); }
  function loadState(newState, name = 'custom', keepUndo = true) { if (keepUndo) remember(); state = S.normalize(newState); presetId = name; engine.setState(state); renderAll(); clearTimeout(autosaveTimer); autosaveTimer = setTimeout(() => { try { localStorage.setItem(storageKey, S.serializeProject(state)); } catch (_) { /* Save project remains available. */ } }, 650); }

  function installSample(index, asset) {
    remember(); state.samples[index] = asset; state.sources[index].kind = 'sample';
    state.sources[index].decay = Math.max(15, asset.duration * 1000);
    state.sources[index].name = asset.name.replace(/\.[^.]+$/, '').slice(0, 30);
    selectedSource = index; markChanged(); renderSources(); renderSourceEditor();
    window.MusicLabHost?.notifyStateChange();
  }
  function importAudio({ pcm, sampleRate, name = 'Shared sample', options = {} } = {}) {
    if (busy || recordBusy || engine.isRecording) throw new Error('Finish the current REDUCE recording or render before importing audio.');
    const target = options.deck ?? options.target ?? selectedSource;
    const index = typeof target === 'string' && /^[0-3]$/.test(target) ? Number(target) : target;
    if (!Number.isInteger(index) || index < 0 || index > 3) throw new Error('Choose a REDUCE source from 1 to 4.');
    if (state.samples[index] && options.replace !== true) throw new Error('Confirm replacing the sample on source ' + (index + 1) + ' before importing audio.');
    const asset = engine.createSample(pcm, sampleRate, name);
    installSample(index, asset);
    toast('Sample received on source ' + (index + 1) + '. Undo restores the previous sample.');
    return { deck: index, name: asset.name, duration: asset.duration, sampleRate: asset.sampleRate, channels: 1 };
  }
  async function exportAudio({ scope = 'pattern', bars = 1, tailSeconds = 0, signal } = {}) {
    if (busy || recordBusy || engine.isRecording) throw new Error('Finish the current REDUCE recording or render before sharing audio.');
    if (scope !== 'pattern') throw new Error('Choose the current REDUCE network pattern to export.');
    if (signal?.aborted) throw new DOMException('Render canceled.', 'AbortError');
    if (!Number.isInteger(bars) || bars < 1 || bars > 16 || !Number.isFinite(tailSeconds) || tailSeconds < 0 || tailSeconds > 30) throw new Error('Choose 1–16 bars and an effect tail from 0 to 30 seconds.');
    const tempo = state.tempo, name = state.name;
    busy = true; $('render-button').disabled = true;
    try {
      const blob = await engine.renderWav(bars, tailSeconds, { signal });
      if (signal?.aborted) throw new DOMException('Render canceled.', 'AbortError');
      return { blob, name: name + ' · ' + bars + (bars === 1 ? ' bar' : ' bars'), sampleRate: 48000, channels: 2, duration: bars * 240 / tempo + tailSeconds, tempo, bars, sourceApp: 'mire', sourceLabel: 'Current network pattern' };
    } finally { busy = false; $('render-button').disabled = false; }
  }

  engine.onStatus = message => { $('audio-status').textContent = String(message).toUpperCase(); updatePlayback(); };
  engine.onStep = (step, audioTime) => {
    if (!Number.isInteger(step) || step < 0 || step >= 16) { clearStep(); return; }
    const delay = engine.context ? Math.max(0, (audioTime - engine.context.currentTime) * 1000) : 0;
    const timer = setTimeout(() => { stepTimers.delete(timer); if (!engine.isPlaying) return; currentStep = step; document.querySelectorAll('.step').forEach(button => button.classList.toggle('current', +button.dataset.step === step)); $('beat-position').textContent = `1 . ${Math.floor(step / 4) + 1} . ${step % 4 + 1}`; state.sources.forEach((source, i) => { if (source.steps[step].on && !source.mute) sourceFlashes[source.destination] = performance.now(); }); }, delay); stepTimers.add(timer);
  };
  engine.onRecordingLimit = () => { finishRecording('Recording reached the three-minute limit.'); };
  function clearStep() { for (const timer of stepTimers) clearTimeout(timer); stepTimers.clear(); currentStep = -1; document.querySelectorAll('.step.current').forEach(button => button.classList.remove('current')); $('beat-position').textContent = '1 . 1 . 1'; }
  async function togglePlayback() { if (playBusy) return; playBusy = true; $('play-button').disabled = true; try { if (engine.isPlaying) { engine.stop(); clearStep(); } else await engine.start(); updatePlayback(); updateFreeze(); } catch (error) { toast(errorMessage(error)); } finally { playBusy = false; $('play-button').disabled = false; } }
  async function audition(index) { try { if (await engine.trigger(index, .85) === false) return; sourceFlashes[state.sources[index].destination] = performance.now(); $('audio-status-dot').classList.add('active'); $('audio-status').textContent = 'A SOUND HAS BEEN PLANTED'; } catch (error) { toast(errorMessage(error)); } }
  function panic() { engine.panic(); $('mic-button').classList.remove('mic-active'); $('mic-button').setAttribute('aria-pressed', 'false'); $('mic-button').querySelector('span').textContent = 'Microphone'; state.garden.freeze = false; clearStep(); updatePlayback(); updateFreeze(); renderTransport(); markChanged(); $('audio-status').textContent = 'NETWORK SILENCED'; toast('Network silenced. The reduction is off the heat.'); }
  async function finishRecording(message) {
    try { const blob = await engine.stopRecording(); recordStarted = 0; $('record-button').classList.remove('recording'); $('record-button').querySelector('span').textContent = 'Record output'; $('record-time').textContent = '00:00'; if (blob?.size) { download(blob, filename('-live.wav')); toast(message || 'Live stereo recording saved.'); } else toast('No audio was recorded.'); }
    catch (error) { recordStarted = 0; $('record-button').classList.remove('recording'); $('record-button').querySelector('span').textContent = 'Record output'; toast(errorMessage(error)); }
  }

  $('play-button').addEventListener('click', togglePlayback);
  $('panic-button').addEventListener('click', panic);
  $('freeze-button').addEventListener('click', () => { remember(); state.garden.freeze = !state.garden.freeze; markChanged(); updateFreeze(); toast(state.garden.freeze ? 'Freeze enabled. New input is suspended.' : 'Freeze released. New input can enter.'); });
  $('tempo').addEventListener('change', () => { remember(); const value = +$('tempo').value; state.tempo = Number.isFinite(value) ? clamp(value, 40, 200) : state.tempo; $('tempo').value = state.tempo; markChanged(); renderNodeEditor(); });
  $('swing').addEventListener('pointerdown', gestureStart); $('swing').addEventListener('input', () => { gestureStart(); state.swing = +$('swing').value; $('swing-value').textContent = pct(state.swing); $('swing').style.setProperty('--fill', pct(state.swing / .45)); markChanged(); }); $('swing').addEventListener('change', gestureEnd);
  $('preset-select').addEventListener('change', e => { const preset = presets.find(p => p.id === e.target.value); if (!preset) return; engine.panic(); clearStep(); loadState(preset.state, preset.id); toast(preset.description); });
  $('node-model').addEventListener('change', e => { remember(); state.nodes[selectedNode].model = e.target.value; markChanged(); renderNodeButtons(); $('model-description').textContent = S.NODE_MODELS.find(m => m.id === e.target.value).description; });
  $('node-reset').addEventListener('click', () => { remember(); const defaults = S.defaultState().nodes[selectedNode]; state.nodes[selectedNode] = { ...defaults, name: state.nodes[selectedNode].name, model: state.nodes[selectedNode].model }; markChanged(); renderNodeEditor(); toast('Selected node reset.'); });
  $('node-audition').addEventListener('click', async () => { const nodeIndex = selectedNode; try { if (await engine.triggerNode(nodeIndex) === false) return; sourceFlashes[nodeIndex] = performance.now(); $('audio-status').textContent = 'A PULSE HAS BEEN PLANTED'; } catch (error) { toast(errorMessage(error)); } });
  $('source-type').addEventListener('change', e => { remember(); const source = state.sources[selectedSource]; source.kind = e.target.value; source.name = S.SOURCE_KINDS.find(k => k.id === source.kind).name; markChanged(); renderSources(); renderSourceEditor(); });
  $('source-audition').addEventListener('click', () => audition(selectedSource));
  $('undo-button').addEventListener('click', () => { if (!history.length) return; const previous = history.pop(); loadState(previous, 'custom', false); $('undo-button').disabled = !history.length; toast('Last edit undone.'); });
  $('step-settings-button').addEventListener('click', () => { const button = $('source-rows').querySelector(`.step[data-source="${selectedSource}"][data-step="${selectedStep}"]`); if (button) showStepPopover(button); });
  $('clear-button').addEventListener('click', () => { remember(); state.sources.forEach(source => source.steps.forEach(step => { step.on = false; })); markChanged(); renderSources(); toast('All source patterns cleared.'); });
  $('random-button').addEventListener('click', () => {
    remember(); const choose = list => list[Math.floor(Math.random() * list.length)];
    state.name = 'An unsupervised reduction'; state.garden.freeze = false; state.garden.circulation = .48 + Math.random() * .34;
    state.nodes.forEach((n, i) => { n.model = choose(S.NODE_MODELS).id; n.pitch = choose([36, 43, 48, 55, 60, 67, 72]); n.tone = 1400 + Math.random() * 7200; n.decay = .55 + Math.random() * .36; n.drift = Math.random() * .32; n.resonance = .2 + Math.random() * .45; n.division = choose(['1/8', '3/16', '1/4', '3/8']); n.time = 120 + Math.random() * 700; n.pan = i % 2 ? .3 + Math.random() * .4 : -.3 - Math.random() * .4; n.mute = false; });
    state.routing = state.nodes.map((_, i) => state.nodes.map((__, j) => i === j ? .3 + Math.random() * .3 : Math.random() > .55 ? Math.random() * .38 : 0));
    state.sources.forEach((source, i) => { source.kind = choose(S.SOURCE_KINDS.filter(kind => kind.id !== 'sample')).id; source.name = S.SOURCE_KINDS.find(k => k.id === source.kind).name; source.destination = i; source.pitch = choose([36, 43, 48, 55, 60, 67, 72]); source.level = .2 + Math.random() * .32; source.mute = false; source.steps.forEach((step, j) => { step.on = Math.random() < (i === 0 ? .21 : .15) || (i === 0 && j === 0); step.velocity = .45 + Math.random() * .45; step.probability = Math.random() < .15 ? .65 : 1; step.ratchet = 1; }); });
    markChanged(); renderAll(); toast('New recipe. The sauce is withholding its reasons.');
  });
  $('save-button').addEventListener('click', () => { download(new Blob([S.serializeProject(state)], { type: 'application/json' }), filename('.mire.json')); toast('Project saved, including imported samples.'); });
  $('open-button').addEventListener('click', () => $('project-file').click());
  $('project-file').addEventListener('change', async e => { const file = e.target.files[0]; if (!file) return; try { if (file.size > 32 * 1024 * 1024) throw new Error('Choose a REDUCE project smaller than 32 MB.'); const imported = S.parseProject(await file.text()); engine.panic(); clearStep(); loadState(imported); toast('Project opened.'); } catch (error) { toast(errorMessage(error)); } finally { e.target.value = ''; } });
  $('import-sample-button').addEventListener('click', () => $('sample-file').click());
  $('sample-file').addEventListener('change', async e => { const file = e.target.files[0]; if (!file) return; const sourceIndex = selectedSource; const button = $('import-sample-button'); button.disabled = true; try { if (file.size > 20 * 1024 * 1024) throw new Error('Choose an audio file smaller than 20 MB.'); const asset = await engine.decodeSample(file); installSample(sourceIndex, asset); toast('Sample loaded. Imports use the first 10 seconds.'); } catch (error) { toast(errorMessage(error)); } finally { button.disabled = false; e.target.value = ''; } });
  const micSelect = document.createElement('select'); micSelect.className = 'mic-destination'; micSelect.setAttribute('aria-label', 'Microphone destination'); micSelect.title = 'Live microphone input destination'; micSelect.innerHTML = state.nodes.map((_, i) => `<option value="${i}">Mic → ${String.fromCharCode(65 + i)}</option>`).join(''); $('mic-button').after(micSelect);
  $('mic-button').title = 'Enable live microphone input into the selected microphone destination';
  $('mic-button').addEventListener('click', async () => { const button = $('mic-button'); button.disabled = true; try { const enabled = !engine.micEnabled; await engine.setMic(enabled, micDestination); button.classList.toggle('mic-active', !!engine.micEnabled); button.setAttribute('aria-pressed', String(!!engine.micEnabled)); button.querySelector('span').textContent = engine.micEnabled ? 'Mic live' : 'Microphone'; updatePlayback(); toast(engine.micEnabled ? 'Live microphone enabled. Use headphones to avoid acoustic feedback.' : 'Microphone disabled.'); } catch (error) { toast(errorMessage(error)); } finally { button.disabled = false; } });
  micSelect.addEventListener('change', async () => { micDestination = +micSelect.value; if (engine.micEnabled) { try { await engine.setMic(true, micDestination); } catch (error) { toast(errorMessage(error)); } } });
  $('record-button').addEventListener('click', async () => { if (recordBusy) return; recordBusy = true; $('record-button').disabled = true; try { if (engine.isRecording) { await finishRecording(); return; } await engine.init(); engine.startRecording(); recordStarted = Date.now(); $('record-button').classList.add('recording'); $('record-button').querySelector('span').textContent = 'Stop & save'; toast('Recording live stereo output. Maximum duration: 3 minutes.'); } catch (error) { toast(errorMessage(error)); } finally { recordBusy = false; $('record-button').disabled = false; } });
  $('export-button').addEventListener('click', () => { $('export-status').textContent = ''; $('export-dialog').showModal(); });
  $('close-export').addEventListener('click', () => $('export-dialog').close());
  $('render-button').addEventListener('click', async () => { if (busy) return; busy = true; const button = $('render-button'); button.disabled = true; $('export-status').textContent = 'Rendering stereo audio…'; try { const blob = await engine.renderWav(+$('export-bars').value, +$('export-tail').value); download(blob, filename('-' + $('export-bars').value + '-bars.wav')); $('export-status').textContent = 'Stereo WAV exported.'; toast('Stereo WAV exported.'); } catch (error) { $('export-status').textContent = errorMessage(error); } finally { button.disabled = false; busy = false; } });
  $('help-button').addEventListener('click', () => $('help-dialog').showModal()); $('close-help').addEventListener('click', () => $('help-dialog').close());
  [$('help-dialog'), $('export-dialog')].forEach(dialog => dialog.addEventListener('click', e => { if (e.target === dialog) { const rect = dialog.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) dialog.close(); } }));
  $('download-html').href = location.href.split('#')[0];
  $('download-source').href = location.protocol === 'file:' || location.protocol === 'about:' || location.protocol === 'data:' ? 'https://calebhaines.github.io/sidequest-prototypes/music/mire/MIRE-source.zip' : './MIRE-source.zip';
  $('music-home').addEventListener('click', e => { if (location.protocol === 'file:' || location.protocol === 'data:' || location.protocol === 'about:') { e.preventDefault(); window.open('https://calebhaines.github.io/sidequest-prototypes/music/', '_blank', 'noopener'); } });
  document.addEventListener('pointerdown', e => { if (popover && !popover.contains(e.target) && !e.target.classList.contains('step')) closePopover(); });
  document.addEventListener('keydown', e => {
    if (e.repeat && (e.code === 'Space' || /^[1-4]$/.test(e.key))) return;
    if (e.key === 'Escape') { if (popover) { closePopover(); e.preventDefault(); return; } if (!$('help-dialog').open && !$('export-dialog').open) panic(); return; }
    const typing = e.target.isContentEditable || e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && !['range', 'checkbox', 'button'].includes(e.target.type));
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing && !$('help-dialog').open && !$('export-dialog').open) { e.preventDefault(); $('undo-button').click(); return; }
    if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target.tagName) || e.target.isContentEditable || $('help-dialog').open || $('export-dialog').open) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlayback(); }
    else if (/^[1-4]$/.test(e.key)) { e.preventDefault(); audition(+e.key - 1); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); $('undo-button').click(); }
  });
  let xyDragging = false;
  function xyMove(e) { const rect = $('xy-pad').getBoundingClientRect(), p = state.performance; p.x = clamp((e.clientX - rect.left) / rect.width); p.y = 1 - clamp((e.clientY - rect.top) / rect.height); applyPerformanceTarget(p.xTarget, p.x); applyPerformanceTarget(p.yTarget, p.y); updateXYVisual(); markChanged(); }
  $('xy-pad').addEventListener('pointerdown', e => { gestureStart(); xyDragging = true; $('xy-pad').setPointerCapture(e.pointerId); xyMove(e); });
  $('xy-pad').addEventListener('pointermove', e => { if (xyDragging) xyMove(e); });
  function xyEnd() { if (!xyDragging) return; xyDragging = false; gestureEnd(); renderPerformance(); renderNodeEditor(); renderRouting(); renderMaster(); }
  $('xy-pad').addEventListener('pointerup', xyEnd); $('xy-pad').addEventListener('pointercancel', xyEnd);
  window.addEventListener('pointerup', gestureEnd);
  window.addEventListener('beforeunload', () => { try { localStorage.setItem(storageKey, S.serializeProject(state)); } catch (_) {} engine.dispose(); });

  /* The station diagram is a live view of routes and actual node energy. */
  const canvas = $('garden-canvas'), ctx = canvas.getContext('2d');
  let cw = 600, ch = 350, gardenPoints = [], lastMeters = { nodes: [0, 0, 0, 0], peak: 0, rms: 0 }, lastMeterTime = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function resizeCanvas() { const rect = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); cw = rect.width; ch = rect.height; canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); gardenPoints = [{ x: cw * .26, y: ch * .29 }, { x: cw * .74, y: ch * .29 }, { x: cw * .28, y: ch * .74 }, { x: cw * .72, y: ch * .74 }]; }
  if (window.ResizeObserver) new ResizeObserver(resizeCanvas).observe(canvas); else window.addEventListener('resize', resizeCanvas);
  canvas.addEventListener('click', e => { const rect = canvas.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top; let closest = -1, distance = 60; gardenPoints.forEach((p, i) => { const d = Math.hypot(x - p.x, y - p.y); if (d < distance) { closest = i; distance = d; } }); if (closest >= 0) { selectedNode = closest; renderNodeButtons(); renderNodeEditor(); } });
  function bezierPoint(a, b, c, d, t) { const u = 1 - t; return { x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x, y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y }; }
  function drawGarden(now) {
    if (!cw || !ch) { requestAnimationFrame(drawGarden); return; }
    if (now - lastMeterTime > 70) {
      try { lastMeters = engine.getMeters() || lastMeters; } catch (_) {} lastMeterTime = now;
      const rms = Math.max(0, lastMeters.rms || 0), peak = Math.max(0, lastMeters.peak || 0); $('master-meter').style.width = pct(clamp(Math.sqrt(rms) * 1.6)); $('master-meter').style.background = lastMeters.clipped ? '#ef7357' : '#ff8d45'; $('meter-value').textContent = rms > .0001 ? Math.max(-80, 20 * Math.log10(rms)).toFixed(1) + ' dB' : '−∞ dB'; $('network-status-dot').classList.toggle('active', peak > .0001 || engine.isPlaying || state.garden.freeze);
      const routes = state.routing.reduce((n, row) => n + row.filter(v => v > .005).length, 0); $('route-summary').textContent = routes + ' OPEN PATHS';
      if (recordStarted) { const seconds = Math.floor((Date.now() - recordStarted) / 1000); $('record-time').textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0'); }
    }
    ctx.clearRect(0, 0, cw, ch); const time = reducedMotion ? 0 : now / 1000;
    for (let x = 18; x < cw; x += 22) for (let y = 13; y < ch; y += 22) { ctx.fillStyle = 'rgba(163,177,183,.10)'; ctx.fillRect(x, y, 1, 1); }
    ctx.strokeStyle = '#a2abaf10'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cw / 2, ch * .515, cw * .39, ch * .39, -.1, 0, Math.PI * 2); ctx.stroke();
    gardenPoints.forEach((a, i) => gardenPoints.forEach((d, j) => {
      const amount = state.routing[i][j]; if (amount < .005) return;
      const activity = clamp((lastMeters.nodes?.[i] || 0) * 3 + (now - sourceFlashes[i] < 450 ? .25 : 0)); let b, c;
      if (i === j) { const dx = i % 2 ? 1 : -1, dy = i < 2 ? -1 : 1; b = { x: a.x + dx * 71, y: a.y + dy * 64 }; c = { x: a.x - dx * 35, y: a.y + dy * 77 }; }
      else { const dx = d.x - a.x, dy = d.y - a.y, bend = (i < j ? 1 : -1) * Math.min(cw, ch) * .13; b = { x: a.x + dx * .26 - dy / (Math.hypot(dx, dy) || 1) * bend, y: a.y + dy * .26 + dx / (Math.hypot(dx, dy) || 1) * bend }; c = { x: a.x + dx * .72 - dy / (Math.hypot(dx, dy) || 1) * bend, y: a.y + dy * .72 + dx / (Math.hypot(dx, dy) || 1) * bend }; }
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.bezierCurveTo(b.x, b.y, c.x, c.y, d.x, d.y); ctx.strokeStyle = colors[i]; ctx.globalAlpha = .10 + amount * .19 + activity * .23; ctx.lineWidth = .8 + amount * 1.2; ctx.stroke();
      if (activity > .005 || engine.isPlaying || state.garden.freeze) for (let k = 0; k < 3; k++) { const progress = (time * (.12 + amount * .08) + k / 3 + i * .11 + j * .17) % 1, point = bezierPoint(a, b, c, d, progress); ctx.globalAlpha = .35 + activity * .6; ctx.shadowColor = colors[i]; ctx.shadowBlur = 9; ctx.fillStyle = colors[i]; ctx.beginPath(); ctx.arc(point.x, point.y, 1 + amount, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
      ctx.globalAlpha = 1;
    }));
    gardenPoints.forEach((p, i) => {
      const energy = clamp((lastMeters.nodes?.[i] || 0) * 4), pulse = Math.max(0, 1 - (now - sourceFlashes[i]) / 550), selected = i === selectedNode, radius = cw < 400 ? 28 : 34;
      const glow = ctx.createRadialGradient(p.x, p.y, radius * .6, p.x, p.y, radius * 2.1); glow.addColorStop(0, colors[i] + (selected ? '15' : '0a')); glow.addColorStop(1, colors[i] + '00'); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(p.x, p.y, radius * 2.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#202426'; ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill();
      for (let ring = 0; ring < 3; ring++) { ctx.strokeStyle = colors[i]; ctx.globalAlpha = (selected ? .6 : .27) - ring * .07 + energy * .35; ctx.lineWidth = ring === 0 ? 1.2 : .7; ctx.beginPath(); const r = radius - ring * 7; ctx.ellipse(p.x, p.y, r, r * (1 - .12 * Math.sin(time * .35 + i + ring)), time * .035 + i * .8, 0, Math.PI * 2); ctx.stroke(); }
      if (pulse > 0) { ctx.globalAlpha = pulse * .55; ctx.beginPath(); ctx.arc(p.x, p.y, radius + (1 - pulse) * 22, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.fillStyle = colors[i]; ctx.font = '12px "Courier New",monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String.fromCharCode(65 + i), p.x, p.y);
      ctx.font = '7px "Courier New",monospace'; ctx.fillStyle = selected ? '#f1ead8' : '#a8b0b1'; ctx.fillText(nodeShort(i).toUpperCase(), p.x, p.y + radius + 16); ctx.fillStyle = '#80898b'; ctx.font = '6px "Courier New",monospace'; ctx.fillText(S.NODE_MODELS.find(m => m.id === state.nodes[i].model).name.toUpperCase(), p.x, p.y + radius + 28);
      if (state.nodes[i].mute) { ctx.strokeStyle = '#ef7357'; ctx.globalAlpha = .8; ctx.beginPath(); ctx.moveTo(p.x - 13, p.y - 13); ctx.lineTo(p.x + 13, p.y + 13); ctx.stroke(); ctx.globalAlpha = 1; }
    });
    requestAnimationFrame(drawGarden);
  }
  renderAll(); resizeCanvas(); requestAnimationFrame(drawGarden);
  Object.defineProperty(window, 'MireApp', { value: Object.freeze({ get state() { return state; }, get engine() { return engine; }, getState: () => snapshot(), loadState: newState => loadState(newState), importAudio, exportAudio,
    get audioImport() { return { maxSeconds: 10, decks: 4, channels: 1, targets: state.sources.map((source, id) => ({ id, name: 'Source ' + (id + 1), occupied: !!state.samples[id], assetName: state.samples[id]?.name || '' })) }; },
    get audioExport() { return { scopes: [{ id: 'pattern', label: 'Current network pattern' }], defaultBars: 1, maxBars: 16 }; },
    selectNode: i => { selectedNode = clamp(Math.round(i), 0, 3); renderNodeButtons(); renderNodeEditor(); }, selectSource: i => { selectedSource = clamp(Math.round(i), 0, 3); renderSources(); renderSourceEditor(); } }), writable: false });
})();
