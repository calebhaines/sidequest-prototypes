/* CUPBOARD · a small recording stage, four microphones, one selected channel. */
(function (scope) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const colors = ['#e5c58b', '#d99873', '#a9c6a3', '#a9bdc7'];
  function create(options) {
    const { element, getParams, getDefinition, getMeters = () => null, getGeneration = () => 0, onChange = () => {}, onStatus = () => {} } = options;
    if (!element || typeof getParams !== 'function') throw Error('CUPBOARD needs its editor and current settings.');
    const def = typeof getDefinition === 'function' ? getDefinition() : getDefinition || scope.LoomCabinetCatalog?.[0];
    if (!def) throw Error('CUPBOARD’s model catalog has not loaded.');
    const descriptors = new Map(def.params.map(param => [param.key, param]));
    if (!descriptors.has('mix')) descriptors.set('mix', { key: 'mix', label: 'Dry / cabinet', type: 'range', min: 0, max: 1, step: .01, default: 1, unit: '' });
    let disposed = false, visible = true, selected = 1, view = 'top', pointer = null, keyboard = null, range = null, generation = getGeneration();
    const p = () => getParams() || def.defaults, $ = selector => element.querySelector(selector);
    const value = key => p()[key] ?? descriptors.get(key)?.default ?? def.defaults[key];
    const scale = key => /(?:X|Y|Pan|Distance)$/.test(key) || ['mix', 'room'].includes(key) ? 100 : 1;
    const unit = key => /Distance$/.test(key) ? 'cm' : /(?:X|Y|Pan)$/.test(key) || ['mix', 'room'].includes(key) ? '%' : descriptors.get(key)?.unit || '';
    const log = d => d.min > 0 && (d.unit === 'Hz' || /Distance$/.test(d.key));
    const fraction = (d, number) => log(d) ? Math.log(number / d.min) / Math.log(d.max / d.min) : (number - d.min) / (d.max - d.min);
    const label = d => d.label.replace(/^Mic \d /, '').replace(/^across face$/, 'Across face').replace(/^height$/, 'Height').replace(/^distance$/, 'Distance').replace(/^angle$/, 'Angle').replace(/^level$/, 'Level').replace(/^pan$/, 'Pan').replace(/^type$/, 'Microphone').replace(/^polarity$/, 'Polarity');
    function format(key, number) {
      if (!Number.isFinite(number)) return '—';
      if (/Pan$/.test(key)) return Math.abs(number) < .005 ? 'Center' : Math.round(Math.abs(number) * 100) + '% ' + (number < 0 ? 'L' : 'R');
      if (descriptors.get(key)?.unit === 'Hz') return number >= 1000 ? Number((number / 1000).toFixed(1)) + ' kHz' : Math.round(number) + ' Hz';
      const scaled = number * scale(key), places = /Distance$/.test(key) ? scaled < 10 ? 1 : 0 : unit(key) === 'dB' ? 1 : 0;
      return (unit(key) === 'dB' && number > 0 ? '+' : '') + Number(scaled.toFixed(places)) + (unit(key) ? ' ' + unit(key) : '');
    }
    function exact(d) {
      return '<label class="cabinet-exact"><input type="number" data-cabinet-number="' + esc(d.key) + '" aria-label="' + esc(d.label + ' exact value' + (unit(d.key) ? ' in ' + unit(d.key) : '')) + '" min="' + d.min * scale(d.key) + '" max="' + d.max * scale(d.key) + '" step="' + d.step * scale(d.key) + '"><span>' + esc(unit(d.key)) + '</span></label>';
    }
    function control(key, rotary = true) {
      const d = descriptors.get(key); if (!d) return '';
      if (d.type === 'select') return '<label class="cabinet-select" data-cabinet-control="' + esc(key) + '"><span>' + esc(label(d)) + '</span><select data-cabinet-select="' + esc(key) + '" aria-label="' + esc(d.label) + '">' + d.options.map(option => '<option value="' + esc(option.value) + '">' + esc(option.label) + '</option>').join('') + '</select></label>';
      const name = esc(label(d));
      if (rotary) return '<div class="cabinet-control cabinet-knob-control" data-cabinet-control="' + esc(key) + '"><label id="cabinet-label-' + esc(key) + '">' + name + '</label><button type="button" class="cabinet-knob" role="slider" data-cabinet-knob="' + esc(key) + '" aria-labelledby="cabinet-label-' + esc(key) + '" aria-valuemin="' + d.min + '" aria-valuemax="' + d.max + '"><svg viewBox="0 0 72 72" aria-hidden="true"><path class="cabinet-dial-ring" d="M15 57a29 29 0 1 1 42 0"/><circle class="cabinet-dial-shadow" cx="36" cy="39" r="23"/><circle class="cabinet-dial-cap" cx="36" cy="36" r="23"/><circle class="cabinet-dial-inner" cx="36" cy="36" r="17"/><path class="cabinet-dial-pointer" d="M36 36V20"/></svg></button>' + exact(d) + '</div>';
      return '<div class="cabinet-control" data-cabinet-control="' + esc(key) + '"><label for="cabinet-range-' + esc(key) + '"><span>' + name + '</span><output data-cabinet-value="' + esc(key) + '"></output></label><div class="cabinet-range-row"><input id="cabinet-range-' + esc(key) + '" type="range" data-cabinet-param="' + esc(key) + '" aria-label="' + esc(d.label) + '" min="' + d.min + '" max="' + d.max + '" step="' + d.step + '">' + exact(d) + '</div></div>';
    }
    const categories = [...new Set(def.models.map(model => model.category))];
    element.innerHTML = '<div class="cabinet-console">' +
      '<div class="cabinet-recipe-bar"><label for="cabinetPreset"><span class="eyebrow">HOUSE RECIPES / COMPLETE RECORDING SETUPS</span><select id="cabinetPreset" aria-label="CUPBOARD recipe"><option value="">Custom setup</option>' + def.presets.map(recipe => '<option value="' + esc(recipe.id) + '">' + esc(recipe.name) + '</option>').join('') + '</select></label><p data-cabinet-recipe-note></p></div>' +
      '<section class="cabinet-source" aria-label="Cabinet, speaker or body"><div class="cabinet-source-choice"><span class="eyebrow">01 / SOMETHING TO SPEAK THROUGH</span><label for="cabinetModel">Cabinet / speaker / body</label><select id="cabinetModel" data-cabinet-model aria-label="Cabinet, speaker or resonant body">' + categories.map(category => '<optgroup label="' + esc(category) + '">' + def.models.filter(model => model.category === category).map(model => '<option value="' + esc(model.id) + '">' + esc(model.name) + '</option>').join('') + '</optgroup>').join('') + '</select><p data-cabinet-model-note></p></div><div class="cabinet-main-trims">' + ['input', 'output', 'mix'].map(key => control(key)).join('') + '</div></section>' +
      '<section class="cabinet-placement" aria-labelledby="cabinetPlacementTitle"><div class="cabinet-stage-heading"><div><span class="eyebrow">02 / PUT YOUR EARS SOMEWHERE</span><h3 id="cabinetPlacementTitle">The recording position.</h3></div><div class="cabinet-view-switch" role="group" aria-label="Microphone placement view"><button type="button" data-cabinet-view="top" aria-pressed="true">Top</button><button type="button" data-cabinet-view="face" aria-pressed="false">Face</button></div></div>' +
      '<div class="cabinet-mic-strip" role="tablist" aria-label="Microphone channels">' + [1, 2, 3, 4].map(index => '<button type="button" role="tab" id="cabinet-mic-tab-' + index + '" data-cabinet-mic="' + index + '" aria-controls="cabinet-mic-panel-' + index + '" style="--cabinet-mic:' + colors[index - 1] + '"><b>' + String(index).padStart(2, '0') + '</b><span><strong data-cabinet-mic-name="' + index + '"></strong><small data-cabinet-mic-state="' + index + '"></small></span><i aria-hidden="true"></i></button>').join('') + '</div>' +
      '<div class="cabinet-stage-wrap"><svg class="cabinet-stage" data-cabinet-stage viewBox="0 0 600 330" role="group" aria-label="Virtual microphone placement" aria-describedby="cabinetStageHelp"><defs><pattern id="cabinetStageGrid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="currentColor" stroke-width=".5"/></pattern><linearGradient id="cabinetGrille" x1="0" x2="1"><stop stop-color="#52604d"/><stop offset=".5" stop-color="#293b31"/><stop offset="1" stop-color="#4a5e4c"/></linearGradient></defs><rect class="cabinet-stage-grid" x="38" y="32" width="524" height="242" fill="url(#cabinetStageGrid)"/><path class="cabinet-stage-center" d="M300 35V275"/><g data-cabinet-top-art><path class="cabinet-source-edge" d="M208 277H392V310H208Z"/><path class="cabinet-grille" d="M218 283H382V303H218Z"/><path class="cabinet-speaker-cone" d="M256 282Q300 258 344 282"/><text class="cabinet-stage-label" x="300" y="323" text-anchor="middle">SOURCE FACE</text></g><g data-cabinet-face-art style="display:none"><rect class="cabinet-source-outline" x="207" y="58" width="186" height="211" rx="8"/><circle class="cabinet-source-outline" cx="300" cy="163" r="73"/><circle class="cabinet-source-outline" cx="300" cy="163" r="23"/><path class="cabinet-stage-center" d="M208 163H392"/></g><g class="cabinet-distance-ticks" data-cabinet-ticks></g><text class="cabinet-stage-axis" x="16" y="23" data-cabinet-y-label>FAR</text><text class="cabinet-stage-axis" x="16" y="273" data-cabinet-y-bottom>NEAR</text><text class="cabinet-stage-axis" x="70" y="24">LEFT</text><text class="cabinet-stage-axis" x="530" y="24" text-anchor="end">RIGHT</text>' + [1, 2, 3, 4].map(index => '<path class="cabinet-sound-path" data-cabinet-path="' + index + '" style="--cabinet-mic:' + colors[index - 1] + '"/><g class="cabinet-mic-marker" data-cabinet-marker="' + index + '" role="button" tabindex="0" aria-label="Position microphone ' + index + '" style="--cabinet-mic:' + colors[index - 1] + '"><circle class="cabinet-marker-halo" r="24"/><g data-cabinet-bearing="' + index + '"><path class="cabinet-mic-stem" d="M0 10V27M-8 27H8"/><path class="cabinet-mic-capsule" d="M-6-13H6V8H-6Z"/><path class="cabinet-mic-lines" d="M-6-7H6M-6-2H6"/></g><circle class="cabinet-marker-number-bg" cx="17" cy="-16" r="10"/><text class="cabinet-marker-number" x="17" y="-12" text-anchor="middle">' + index + '</text></g>').join('') + '</svg></div><div class="cabinet-stage-footer"><p id="cabinetStageHelp">Drag a mic left/right and nearer/further. Face view changes height. Arrow keys move the focused mic; Shift makes finer moves.</p><button type="button" data-cabinet-action="add">+ Add microphone</button></div></section>' +
      '<section class="cabinet-selected" aria-labelledby="cabinetSelectedTitle"><div class="cabinet-selected-heading"><div><span class="eyebrow">03 / ONE CHANNEL AT A TIME</span><h3 id="cabinetSelectedTitle">Microphone <span data-cabinet-selected-number>01</span></h3></div><div class="cabinet-mic-switches"><button type="button" data-cabinet-action="power" aria-pressed="true">Mic on</button><button type="button" data-cabinet-action="solo" aria-pressed="false">Solo</button></div></div>' + [1, 2, 3, 4].map(index => '<div id="cabinet-mic-panel-' + index + '" class="cabinet-mic-panel" role="tabpanel" aria-labelledby="cabinet-mic-tab-' + index + '" data-cabinet-mic-panel="' + index + '"><div class="cabinet-mic-selection">' + control('mic' + index + 'Type') + control('mic' + index + 'Polarity') + '</div><p class="cabinet-mic-note" data-cabinet-mic-note="' + index + '"></p><div class="cabinet-position-knobs">' + ['Distance', 'X', 'Y', 'Angle', 'Level', 'Pan'].map(key => control('mic' + index + key)).join('') + '</div></div>').join('') + '</section>' +
      '<details class="cabinet-finishing"><summary><span><strong>Arrival, routing & finishing</strong><small>Phase alignment · source channels · filters · room</small></span><span aria-hidden="true">+</span></summary><div class="cabinet-finish-body"><div class="cabinet-finish-selects">' + ['alignment', 'stereo'].map(key => control(key)).join('') + '</div><p data-cabinet-alignment-note></p><div class="cabinet-finish-ranges">' + ['lowCut', 'highCut', 'room'].map(key => control(key, false)).join('') + '</div></div></details>' +
      '<div class="cabinet-signal"><span data-cabinet-signal>Ready</span><div><span>Input</span><output data-cabinet-meter="inputDb">—</output><span>Output</span><output data-cabinet-meter="outputDb">—</output></div></div><p class="cabinet-scope-note">Original modeled impulse responses and microphone families. For an amp-and-cab rig, place CUPBOARD after BROILER, SUNDAY or CELLAR with the amp’s own cabinet set to DI.</p></div>';
    function snap(key, next) { const d = descriptors.get(key); return Number(clamp(Math.round(next / d.step) * d.step, d.min, d.max).toFixed(6)); }
    function emit(patch, meta = {}) {
      if (disposed) return false;
      try { const result = onChange(patch, meta); render(); return result !== false; }
      catch (error) { onStatus(error.message); render(); return false; }
    }
    function commit(patch, active, key = Object.keys(patch)[0]) {
      const changed = Object.fromEntries(Object.entries(patch).filter(([name, number]) => Number.isFinite(number) && snap(name, number) !== value(name)).map(([name, number]) => [name, snap(name, number)]));
      if (!Object.keys(changed).length) return;
      const first = !active?.remembered; if (active) active.remembered = true;
      emit(changed, { key, first, phase: active ? 'input' : 'single' });
    }
    const valid = active => active && active.generation === getGeneration();
    function end(active) { if (valid(active) && active.remembered) onChange({}, { key: active.key, first: false, phase: 'end' }); }
    function cancelGestures() {
      if (pointer) { pointer.element.classList.remove('is-adjusting'); try { if (pointer.element.hasPointerCapture?.(pointer.id)) pointer.element.releasePointerCapture(pointer.id); } catch (_) {} }
      pointer = keyboard = range = null;
    }
    function finishGesture() { end(pointer); end(keyboard); end(range); cancelGestures(); }
    function selectMic(index, focus = false) { finishGesture(); selected = clamp(index, 1, 4); render(); const marker = $('[data-cabinet-marker="' + selected + '"]'); marker.parentNode.appendChild(marker); if (focus) $('[data-cabinet-mic="' + selected + '"]').focus({ preventScroll: true }); }
    function distanceY(distance) { return 250 - clamp(Math.log(distance / .02) / Math.log(150), 0, 1) * 206; }
    function markerPoint(index, settings = p()) {
      const prefix = 'mic' + index;
      return { x: 70 + (clamp(settings[prefix + 'X'] ?? 0, -1, 1) + 1) * 230, y: view === 'top' ? distanceY(settings[prefix + 'Type'] === 'contact' ? .02 : settings[prefix + 'Distance'] ?? .08) : 155 - clamp(settings[prefix + 'Y'] ?? 0, -1, 1) * 106 };
    }
    function paintStage(settings = p()) {
      const solo = [1, 2, 3, 4].some(index => settings['mic' + index + 'Enabled'] === 'on' && settings['mic' + index + 'Solo'] === 'on');
      for (let index = 1; index <= 4; index++) {
        const prefix = 'mic' + index, point = markerPoint(index, settings), marker = $('[data-cabinet-marker="' + index + '"]'), enabled = settings[prefix + 'Enabled'] === 'on', audible = enabled && (!solo || settings[prefix + 'Solo'] === 'on');
        marker.setAttribute('transform', 'translate(' + point.x.toFixed(2) + ' ' + point.y.toFixed(2) + ')'); marker.setAttribute('aria-pressed', String(index === selected));
        marker.setAttribute('aria-label', 'Microphone ' + index + ', ' + format(prefix + 'X', settings[prefix + 'X']) + ' across, height ' + format(prefix + 'Y', settings[prefix + 'Y']) + (settings[prefix + 'Type'] === 'contact' ? ', contact pickup on the surface' : ', ' + format(prefix + 'Distance', settings[prefix + 'Distance']) + ' away') + (enabled ? '' : ', off'));
        marker.classList.toggle('is-selected', index === selected); marker.classList.toggle('is-off', !enabled); marker.classList.toggle('is-muted-by-solo', enabled && !audible);
        $('[data-cabinet-bearing="' + index + '"]').setAttribute('transform', 'rotate(' + (['contact', 'omni'].includes(settings[prefix + 'Type']) ? 0 : settings[prefix + 'Angle'] || 0) + ')');
        const path = $('[data-cabinet-path="' + index + '"]'); path.setAttribute('d', 'M300 ' + (view === 'top' ? 278 : 155) + 'L' + point.x.toFixed(2) + ' ' + point.y.toFixed(2)); path.classList.toggle('is-off', !audible);
      }
    }
    function render() {
      if (disposed) return;
      const force = generation !== getGeneration(); if (force) { cancelGestures(); generation = getGeneration(); }
      const settings = p(); if (settings['mic' + selected + 'Type'] === 'contact') view = 'face'; const model = def.models.find(model => model.id === settings.model), recipe = def.presets.find(recipe => Object.entries(recipe.params).every(([key, expected]) => settings[key] === expected));
      if (force || document.activeElement !== $('#cabinetModel')) $('#cabinetModel').value = settings.model;
      if (force || document.activeElement !== $('#cabinetPreset')) $('#cabinetPreset').value = recipe?.id || '';
      $('[data-cabinet-recipe-note]').textContent = recipe?.description || 'Keep your positions while changing the source. A recipe replaces the complete setup.';
      $('[data-cabinet-model-note]').textContent = model?.description || '';
      element.classList.toggle('cabinet-is-bypassed', settings.bypass === true);
      for (const d of descriptors.values()) {
        const current = value(d.key), micType = /^mic[1-4]/.test(d.key) ? value(d.key.slice(0, 4) + 'Type') : '', inactive = /Distance$/.test(d.key) && micType === 'contact' || /Angle$/.test(d.key) && ['contact', 'omni'].includes(micType), knob = $('[data-cabinet-knob="' + d.key + '"]'), slider = $('[data-cabinet-param="' + d.key + '"]'), select = $('[data-cabinet-select="' + d.key + '"]');
        if (knob) { knob.disabled = inactive; knob.title = inactive ? micType === 'contact' ? 'Surface pickup · air distance and angle do not apply' : 'Omnidirectional pickup · facing angle does not apply' : ''; knob.setAttribute('aria-valuenow', current); knob.setAttribute('aria-valuetext', format(d.key, current)); knob.querySelector('.cabinet-dial-pointer').setAttribute('transform', 'rotate(' + (-135 + clamp(fraction(d, current), 0, 1) * 270).toFixed(2) + ' 36 36)'); }
        if (slider) { slider.disabled = inactive; if (force || document.activeElement !== slider) slider.value = current; }
        if (select && (force || document.activeElement !== select)) select.value = current;
        for (const input of element.querySelectorAll('[data-cabinet-number="' + d.key + '"]')) { input.disabled = inactive; if (force || document.activeElement !== input) input.value = Number((current * scale(d.key)).toFixed(3)); }
        for (const control of element.querySelectorAll('[data-cabinet-control="' + d.key + '"]')) control.classList.toggle('is-inactive', inactive);
        for (const output of element.querySelectorAll('[data-cabinet-value="' + d.key + '"]')) output.textContent = format(d.key, current);
      }
      const prefix = 'mic' + selected, enabled = value(prefix + 'Enabled') === 'on';
      for (let index = 1; index <= 4; index++) {
        const mic = def.mics.find(mic => mic.id === value('mic' + index + 'Type')), active = value('mic' + index + 'Enabled') === 'on', tab = $('[data-cabinet-mic="' + index + '"]'), panel = $('[data-cabinet-mic-panel="' + index + '"]');
        tab.setAttribute('aria-selected', String(selected === index)); tab.tabIndex = selected === index ? 0 : -1; tab.classList.toggle('is-off', !active);
        $('[data-cabinet-mic-name="' + index + '"]').textContent = mic?.shortName || 'Microphone';
        $('[data-cabinet-mic-state="' + index + '"]').textContent = active ? value('mic' + index + 'Solo') === 'on' ? 'SOLO' : format('mic' + index + 'Distance', value('mic' + index + 'Distance')) : 'OFF · SELECT TO PREPARE';
        panel.hidden = selected !== index; panel.classList.toggle('is-off', !active); $('[data-cabinet-mic-note="' + index + '"]').textContent = (mic?.description || '') + (mic?.id === 'contact' ? ' Use Face view for surface placement; air distance and angle are inactive.' : mic?.id === 'omni' ? ' Facing angle is inactive for this omnidirectional pickup.' : '');
      }
      $('[data-cabinet-selected-number]').textContent = String(selected).padStart(2, '0');
      const power = $('[data-cabinet-action="power"]'), soloButton = $('[data-cabinet-action="solo"]');
      power.setAttribute('aria-pressed', String(enabled)); power.textContent = enabled ? 'Mic on' : 'Enable mic'; power.style.setProperty('--cabinet-mic', colors[selected - 1]);
      soloButton.setAttribute('aria-pressed', String(value(prefix + 'Solo') === 'on')); soloButton.disabled = !enabled;
      const allOn = [1, 2, 3, 4].every(index => value('mic' + index + 'Enabled') === 'on'), add = $('[data-cabinet-action="add"]'); add.disabled = allOn; add.textContent = allOn ? 'Four microphones ready' : '+ Add microphone';
      for (const button of element.querySelectorAll('[data-cabinet-view]')) { button.setAttribute('aria-pressed', String(button.dataset.cabinetView === view)); button.disabled = button.dataset.cabinetView === 'top' && value(prefix + 'Type') === 'contact'; }
      $('[data-cabinet-top-art]').style.display = view === 'top' ? '' : 'none'; $('[data-cabinet-face-art]').style.display = view === 'face' ? '' : 'none';
      $('[data-cabinet-y-label]').textContent = view === 'top' ? 'FAR' : 'HIGH'; $('[data-cabinet-y-bottom]').textContent = view === 'top' ? 'NEAR' : 'LOW';
      $('[data-cabinet-ticks]').innerHTML = (view === 'top' ? [.02, .1, .5, 1.5, 3].map(distance => '<text x="566" y="' + (distanceY(distance) + 3).toFixed(2) + '">' + Math.round(distance * 100) + '</text>') : [-1, -.5, 0, .5, 1].map(height => '<text x="566" y="' + (155 - height * 106 + 3).toFixed(2) + '">' + height * 100 + '</text>')).join('');
      $('[data-cabinet-alignment-note]').textContent = settings.alignment === 'natural' ? 'Natural arrival keeps each microphone’s modeled travel time. Combining positions can add phase color; use Polarity and levels to compare.' : 'Aligned arrival compensates relative microphone travel-time offsets. Position still changes each microphone’s tonal perspective.';
      paintStage(settings); paint();
    }
    function paint(reading = getMeters()) {
      if (disposed || !visible || document.hidden) return;
      const settings = p(), meter = reading?.cupboard || reading || {}, available = (meter.type === undefined || meter.type === 'cupboard') && !settings.bypass;
      $('[data-cabinet-signal]').textContent = settings.bypass ? 'Bypassed' : meter.pendingIR ? 'Preparing response…' : Number.isFinite(meter.outputDb) && meter.outputDb > -90 ? 'Signal active' : 'Ready';
      for (const output of element.querySelectorAll('[data-cabinet-meter]')) { const number = meter[output.dataset.cabinetMeter]; output.textContent = available && Number.isFinite(number) ? number <= -119 ? '−∞ dBFS' : number.toFixed(1) + ' dBFS' : '—'; }
      // Automation changes the sound without replacing the editor's saved knobs.
      // A DSP may expose its smoothed positions separately for the stage view.
      if (!pointer && !keyboard && Array.isArray(meter.mics) && meter.mics.length) {
        const live = { ...settings };
        meter.mics.forEach((mic, index) => { for (const [suffix, name] of [['X', 'x'], ['Y', 'y'], ['Distance', 'distance'], ['Angle', 'angle']]) if (Number.isFinite(mic?.[name])) live['mic' + (index + 1) + suffix] = mic[name]; });
        paintStage(live);
      }
    }
    function stagePatch(event, index) {
      const stage = $('[data-cabinet-stage]'), matrix = stage.getScreenCTM(), position = stage.createSVGPoint(), prefix = 'mic' + index;
      position.x = event.clientX; position.y = event.clientY;
      const rect = matrix ? null : stage.getBoundingClientRect(), point = matrix ? position.matrixTransform(matrix.inverse()) : { x: (event.clientX - rect.left) / rect.width * 600, y: (event.clientY - rect.top) / rect.height * 330 }, x = point.x, y = point.y;
      return { [prefix + 'X']: clamp((x - 70) / 230 - 1, -1, 1), [prefix + (view === 'top' ? 'Distance' : 'Y')]: view === 'top' ? .02 * Math.pow(150, clamp((250 - y) / 206, 0, 1)) : clamp((155 - y) / 106, -1, 1) };
    }
    function pointerDown(event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const knob = event.target.closest('[data-cabinet-knob]'), stage = event.target.closest('[data-cabinet-stage]'), slider = event.target.closest('[data-cabinet-param]');
      if (slider) { end(range); range = { key: slider.dataset.cabinetParam, remembered: false, generation: getGeneration() }; return; }
      if (!knob && !stage || pointer || knob?.disabled) return;
      event.preventDefault(); end(keyboard); keyboard = null;
      if (stage) { const marker = event.target.closest('[data-cabinet-marker]'); if (marker) selected = Number(marker.dataset.cabinetMarker); render(); pointer = { kind: 'stage', key: 'mic' + selected + 'X', mic: selected, id: event.pointerId, remembered: false, generation: getGeneration(), element: stage }; if (!marker) commit(stagePatch(event, selected), pointer); }
      else pointer = { kind: 'knob', key: knob.dataset.cabinetKnob, id: event.pointerId, y: event.clientY, value: value(knob.dataset.cabinetKnob), remembered: false, generation: getGeneration(), element: knob };
      (stage ? $('[data-cabinet-marker="' + selected + '"]') : pointer.element).focus?.({ preventScroll: true }); try { pointer.element.setPointerCapture?.(event.pointerId); } catch (_) {} pointer.element.classList.add('is-adjusting');
    }
    function pointerMove(event) {
      if (!pointer || event.pointerId !== pointer.id) return;
      if (!valid(pointer)) { cancelGestures(); return; }
      if (pointer.kind === 'stage') commit(stagePatch(event, pointer.mic), pointer, pointer.key);
      else { const d = descriptors.get(pointer.key), delta = (pointer.y - event.clientY) / (event.shiftKey ? 1600 : 220); commit({ [d.key]: log(d) ? pointer.value * Math.pow(d.max / d.min, delta) : pointer.value + delta * (d.max - d.min) }, pointer); }
    }
    function pointerEnd(event) { if (pointer?.id === event.pointerId) { const active = pointer; pointer = null; active.element.classList.remove('is-adjusting'); try { if (active.element.hasPointerCapture?.(active.id)) active.element.releasePointerCapture(active.id); } catch (_) {} end(active); } if (range) { end(range); range = null; } }
    function keyDown(event) {
      const tab = event.target.closest('[data-cabinet-mic]');
      if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); selectMic(event.key === 'Home' ? 1 : event.key === 'End' ? 4 : (Number(tab.dataset.cabinetMic) - 1 + (event.key === 'ArrowLeft' ? 3 : 1)) % 4 + 1, true); return; }
      const marker = event.target.closest('[data-cabinet-marker]'), knob = event.target.closest('[data-cabinet-knob]');
      if (knob?.disabled || !marker && !knob || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = marker ? Number(marker.dataset.cabinetMarker) : null, key = marker ? 'mic' + index + 'X' : knob.dataset.cabinetKnob;
      if (!valid(keyboard) || keyboard.key !== key) { end(keyboard); keyboard = { key, remembered: false, generation: getGeneration() }; }
      if (marker) {
        selected = index; const prefix = 'mic' + index, fine = event.shiftKey ? .25 : 1, patch = {};
        if (event.key === 'Home') { patch[prefix + 'X'] = def.defaults[prefix + 'X']; patch[prefix + 'Y'] = def.defaults[prefix + 'Y']; patch[prefix + 'Distance'] = def.defaults[prefix + 'Distance']; }
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') patch[prefix + 'X'] = value(prefix + 'X') + (event.key === 'ArrowLeft' ? -1 : 1) * .025 * fine;
        else if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(event.key)) { const up = event.key.endsWith('Up'), suffix = view === 'top' ? 'Distance' : 'Y'; patch[prefix + suffix] = value(prefix + suffix) + (up ? 1 : -1) * (view === 'top' ? .01 : .025) * fine * (event.key.startsWith('Page') ? 10 : 1); }
        commit(patch, keyboard, key); render();
      } else { const d = descriptors.get(key), step = d.step * (event.shiftKey ? 10 : 1) * (event.key.startsWith('Page') ? 10 : 1); commit({ [key]: event.key === 'Home' ? d.min : event.key === 'End' ? d.max : value(key) + (['ArrowUp', 'ArrowRight', 'PageUp'].includes(event.key) ? step : -step) }, keyboard); }
    }
    const handlers = {
      pointerdown: pointerDown, pointermove: pointerMove, pointerup: pointerEnd, pointercancel: pointerEnd,
      keydown: keyDown, keyup(event) { if (keyboard && event.target.closest('[data-cabinet-knob],[data-cabinet-marker]')) { end(keyboard); keyboard = null; } },
      input(event) { const input = event.target.closest('[data-cabinet-param]'); if (!input) return; const key = input.dataset.cabinetParam; if (!valid(range) || range.key !== key) range = { key, remembered: false, generation: getGeneration() }; commit({ [key]: Number(input.value) }, range); },
      change(event) {
        const input = event.target, number = input.dataset.cabinetNumber, key = input.dataset.cabinetSelect;
        if (number) { const d = descriptors.get(number), next = input.valueAsNumber / scale(number); if (!Number.isFinite(next) || next < d.min || next > d.max) { onStatus('Use a value from ' + d.min * scale(number) + ' to ' + d.max * scale(number) + (unit(number) ? ' ' + unit(number) : '') + '.'); render(); return; } commit({ [number]: next }, null, number); }
        else if (key) { finishGesture(); if (value(key) !== input.value) emit({ [key]: input.value }, { key, first: true, phase: 'single' }); }
        else if (input.id === 'cabinetModel') { finishGesture(); if (value('model') !== input.value) emit({ model: input.value }, { key: 'model', first: true, phase: 'single' }); }
        else if (input.id === 'cabinetPreset') { const recipe = def.presets.find(recipe => recipe.id === input.value); if (recipe) { finishGesture(); emit({ ...recipe.params }, { first: true, phase: 'single', recipe: recipe.id }); onStatus(recipe.name + ' loaded.'); } }
        else if (input.hasAttribute('data-cabinet-param')) { end(range); range = null; }
      },
      click(event) {
        const tab = event.target.closest('[data-cabinet-mic]'), viewButton = event.target.closest('[data-cabinet-view]'), action = event.target.closest('[data-cabinet-action]');
        if (tab) selectMic(Number(tab.dataset.cabinetMic));
        else if (viewButton) { finishGesture(); view = viewButton.dataset.cabinetView; render(); }
        else if (action && !action.disabled) {
          finishGesture(); const command = action.dataset.cabinetAction;
          if (command === 'add') { const index = [1, 2, 3, 4].find(index => value('mic' + index + 'Enabled') !== 'on'); if (index) { selected = index; emit({ ['mic' + index + 'Enabled']: 'on' }, { key: 'mic' + index + 'Enabled', first: true, phase: 'single' }); } }
          else { const key = 'mic' + selected + (command === 'power' ? 'Enabled' : 'Solo'); emit({ [key]: value(key) === 'on' ? 'off' : 'on' }, { key, first: true, phase: 'single' }); }
        }
      },
      dblclick(event) { const knob = event.target.closest('[data-cabinet-knob]'); if (knob) { finishGesture(); const key = knob.dataset.cabinetKnob; commit({ [key]: descriptors.get(key).default }, null, key); } }
    };
    for (const [name, handler] of Object.entries(handlers)) element.addEventListener(name, handler);
    scope.addEventListener?.('blur', finishGesture); render();
    return { render, paint, finishGesture, setVisible(next) { if (visible && !next) finishGesture(); visible = !!next; }, dispose() { if (disposed) return; finishGesture(); disposed = true; for (const [name, handler] of Object.entries(handlers)) element.removeEventListener(name, handler); scope.removeEventListener?.('blur', finishGesture); element.innerHTML = ''; }, get selectedMic() { return selected; }, get element() { return element; } };
  }
  scope.LoomCabinetUI = Object.freeze({ create });
})(typeof window === 'undefined' ? globalThis : window);
