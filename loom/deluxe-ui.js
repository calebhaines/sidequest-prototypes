/* SUNDAY · five Deluxe Reverb circuit studies, one set of familiar controls. */
(function (scope) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const face = ['volume', 'bass', 'treble', 'reverb', 'speed', 'intensity'];
  const front = ['channel', 'jack', 'trim'], trims = ['input', 'output'];
  const percentages = new Set(['mix', 'sag', 'feedback', 'speakerDrive', 'speakerLoad', 'mic', 'distance', 'air']);
  const clone = value => Object.fromEntries(Object.entries(value || {}));
  function create(options) {
    const { element, getParams, getDefinition, getMeters = () => null, getGeneration = () => 0, onChange = () => {}, onStatus = () => {} } = options;
    if (!element || typeof getParams !== 'function') throw Error('SUNDAY needs an amp editor and its current settings.');
    let disposed = false, visible = true, pointer = null, keyboard = null, range = null, generation = getGeneration();
    const definition = () => typeof getDefinition === 'function' ? getDefinition() : getDefinition || scope.LoomDeluxeCatalog?.[0];
    const def = definition(), descriptors = new Map((def?.params || []).map(param => [param.key, param]));
    const p = () => getParams() || def.defaults, $ = id => element.querySelector('#' + id);
    const models = def.models || [], groups = def.groups || [];
    const scale = d => percentages.has(d.key) ? 100 : 1;
    const log = d => d.min > 0 && (d.scale === 'log' || d.unit === 'Hz' && d.max / d.min > 8);
    const ratio = (d, value) => log(d) ? Math.log(value / d.min) / Math.log(d.max / d.min) : (value - d.min) / (d.max - d.min);
    const bounded = (d, value) => Math.max(d.min, Math.min(d.max, value));
    function format(d, value) {
      if (!Number.isFinite(value)) return '—';
      if (percentages.has(d.key)) return Math.round(value * 100) + '%';
      if (d.unit === 'dB') return (value > 0 ? '+' : '') + value.toFixed(1) + ' dB';
      if (d.unit === 'Hz') return value >= 1000 ? (value / 1000).toFixed(1) + ' kHz' : Math.round(value) + ' Hz';
      if (d.unit === 'ms') return value.toFixed(value < 10 ? 1 : 0) + ' ms';
      if (d.key === 'supply') return value.toFixed(2) + '×';
      return Number(value.toFixed(2)) + (d.unit ? ' ' + d.unit : '');
    }
    function exact(d) {
      return '<div class="deluxe-exact"><input type="number" data-deluxe-number="' + esc(d.key) + '" aria-label="' + esc(d.label) + ' exact value" min="' + d.min * scale(d) + '" max="' + d.max * scale(d) + '" step="' + d.step * scale(d) + '"><span>' + (percentages.has(d.key) ? '%' : esc(d.unit || '')) + '</span></div>';
    }
    function control(key, rotary) {
      const d = descriptors.get(key); if (!d) return '';
      const label = esc(d.label);
      if (d.type === 'select') return '<label class="deluxe-select-control" data-deluxe-control="' + esc(key) + '"><span>' + label + '</span><select data-deluxe-select="' + esc(key) + '" aria-label="' + label + '">' + d.options.map(option => '<option value="' + esc(option.value) + '">' + esc(option.label) + '</option>').join('') + '</select></label>';
      if (d.type !== 'range') return '';
      if (rotary) return '<div class="deluxe-control deluxe-knob-control" data-deluxe-control="' + esc(key) + '"><label id="deluxe-label-' + esc(key) + '">' + label + '</label><button type="button" class="deluxe-knob" role="slider" data-deluxe-knob="' + esc(key) + '" aria-labelledby="deluxe-label-' + esc(key) + '" aria-valuemin="' + d.min + '" aria-valuemax="' + d.max + '" aria-valuenow="' + d.default + '"><svg viewBox="0 0 84 84" aria-hidden="true"><path class="deluxe-dial-ring" d="M17 65a32 32 0 1 1 50 0"/><circle class="deluxe-dial-shadow" cx="42" cy="45" r="26"/><circle class="deluxe-dial-cap" cx="42" cy="42" r="26"/><circle class="deluxe-dial-inner" cx="42" cy="42" r="21"/><path class="deluxe-dial-pointer" d="M42 42V23"/></svg></button>' + exact(d) + '</div>';
      return '<div class="deluxe-control" data-deluxe-control="' + esc(key) + '"><label for="deluxe-range-' + esc(key) + '"><span>' + label + '</span><output data-deluxe-value="' + esc(key) + '"></output></label><div class="deluxe-value-row"><input id="deluxe-range-' + esc(key) + '" type="range" data-deluxe-param="' + esc(key) + '" aria-label="' + label + '" min="' + (log(d) ? 0 : d.min) + '" max="' + (log(d) ? 1 : d.max) + '" step="' + (log(d) ? .001 : d.step) + '">' + exact(d) + '</div></div>';
    }
    const frontKeys = new Set([...face, ...front, ...trims, 'model', 'bypass']);
    const folds = groups.map(group => ({ ...group, keys: (group.keys || []).filter(key => !frontKeys.has(key) && descriptors.has(key)) })).filter(group => group.keys.length);
    const included = new Set(folds.flatMap(group => group.keys));
    const remaining = [...descriptors.keys()].filter(key => !frontKeys.has(key) && !included.has(key));
    if (remaining.length) folds.push({ id: 'extra', label: 'Finishing adjustments', help: 'Fine adjustments for this amp study.', keys: remaining });
    element.innerHTML = '<div class="deluxe-console">' +
      '<div class="deluxe-recipe-bar"><label for="deluxePreset"><span class="eyebrow">HOUSE RECIPES / COMPLETE AMP SETTINGS</span><select id="deluxePreset" aria-label="SUNDAY recipe"><option value="">Custom settings</option>' + (def.presets || []).map(recipe => '<option value="' + esc(recipe.id) + '">' + esc(recipe.name) + '</option>').join('') + '</select></label><p id="deluxePresetNote"></p></div>' +
      '<section class="deluxe-audition" aria-labelledby="deluxeAuditionTitle"><div class="deluxe-section-heading"><div><span class="eyebrow">FIVE WAYS INTO THE SAME COMBO</span><h3 id="deluxeAuditionTitle">Choose a circuit study.</h3></div><span>Switch the study. Keep your settings.</span></div><div class="deluxe-models" role="radiogroup" aria-label="Deluxe Reverb emulation" aria-describedby="deluxeModelNote deluxeListeningNote">' + models.map((model, index) => '<button type="button" role="radio" data-deluxe-model="' + esc(model.id) + '" aria-checked="false" tabindex="-1"><span class="deluxe-model-letter">' + esc(model.letter || String.fromCharCode(65 + index)) + '</span><span><strong>' + esc(model.name) + '</strong><small>' + esc(model.method || model.subtitle || '') + '</small></span><i aria-hidden="true">◦</i></button>').join('') + '</div><div class="deluxe-model-note"><div><strong id="deluxeModelName"></strong><span id="deluxeModelMethod"></span></div><p id="deluxeModelNote"></p><small id="deluxeListeningNote"></small></div></section>' +
      '<section class="deluxe-amp" aria-labelledby="deluxeAmpTitle"><div class="deluxe-face"><div class="deluxe-face-heading"><div><span class="deluxe-brand" id="deluxeAmpTitle">Sunday</span><span>DELUXE REVERB / CIRCUIT STUDIES</span></div><span id="deluxeSignalStatus" class="deluxe-signal-status">Ready</span></div><div class="deluxe-selectors">' + front.map(key => control(key)).join('') + '</div><div class="deluxe-face-knobs">' + face.map(key => control(key, true)).join('') + '</div><p id="deluxeChannelNote" class="deluxe-channel-note"></p><div class="deluxe-face-trims">' + trims.map(key => control(key)).join('') + '</div></div><div class="deluxe-grille" aria-hidden="true"><span id="deluxeCabinetCaption">SMALL COMBO / OPEN BACK / ONE TWELVE</span><span class="deluxe-cab-badge">S · 22</span></div></section>' +
      '<section class="deluxe-touch" aria-label="Actual amp signal readings"><div class="deluxe-touch-heading"><span class="eyebrow">TOUCH / HEADROOM / PLAYING LEVEL</span><strong>Leave room for the pick.</strong></div><div class="deluxe-meters">' + [['inputDb', 'Input peak'], ['outputDb', 'Output peak'], ['inputCrestDb', 'Input crest'], ['outputCrestDb', 'Output crest'], ['headroomDb', 'Power margin estimate'], ['sagDb', 'Supply drop']].map(([key, label]) => '<div><span>' + label + '</span><output data-deluxe-meter="' + key + '">—</output>' + (key === 'inputDb' || key === 'outputDb' ? '<i aria-hidden="true"><b data-deluxe-meter-bar="' + key + '"></b></i>' : '') + '</div>').join('') + '</div><p id="deluxeTouchNote">Set Input for your guitar or DI, then use Volume to approach breakup. Output changes listening level independently. These studies have no automatic gain riding, compressor or noise gate.</p><small>Crest compares peak with RMS level; it is a signal reading, not a compression score. Power margin is a model estimate.</small></section>' +
      '<div class="deluxe-folds">' + folds.map(group => '<details data-deluxe-fold="' + esc(group.id) + '"><summary><span><strong>' + esc(group.label || group.title || group.id) + '</strong><small>' + esc(group.help || group.description || '') + '</small></span><span aria-hidden="true">+</span></summary><div class="deluxe-fold-body"><div class="deluxe-deep-controls">' + group.keys.map(key => control(key)).join('') + '</div></div></details>').join('') + '</div>' +
      '<p class="deluxe-scope-note">Five original circuit interpretations of the Fender Deluxe Reverb, built for comparison. They are not five measured hardware captures. Static matching aligns their low-level gain; it does not compress your playing. BROILER is unchanged.</p></div>';
    function emit(patch, meta) {
      if (disposed) return;
      try { onChange(patch, meta); } catch (error) { onStatus(error.message); }
      render();
    }
    function changed(key, value, active) {
      const d = descriptors.get(key); if (!d || !Number.isFinite(value)) return;
      const next = Number((Math.round(bounded(d, value) / d.step) * d.step).toFixed(6));
      if (Math.abs(next - p()[key]) < d.step * .001) return;
      const first = !active?.remembered; if (active) active.remembered = true;
      emit({ [key]: next }, { key, first, phase: active ? 'input' : 'single' });
    }
    const valid = active => active && active.generation === getGeneration();
    function end(active) { if (valid(active) && active.remembered) onChange({}, { key: active.key, first: false, phase: 'end' }); }
    function cancelGestures() {
      if (pointer) { pointer.element.classList.remove('is-adjusting'); if (pointer.element.hasPointerCapture?.(pointer.id)) pointer.element.releasePointerCapture(pointer.id); }
      pointer = keyboard = range = null;
    }
    function render() {
      if (disposed) return;
      const force = generation !== getGeneration();
      if (force) { cancelGestures(); generation = getGeneration(); }
      const value = p(), model = models.find(model => model.id === value.model), recipe = (def.presets || []).find(recipe => Object.entries(recipe.params).every(([key, expected]) => value[key] === expected));
      if (force || document.activeElement !== $('deluxePreset')) $('deluxePreset').value = recipe?.id || '';
      $('deluxePresetNote').textContent = recipe?.description || 'Keep the amp settings while auditioning A–E. A recipe replaces the complete setup.';
      for (const button of element.querySelectorAll('[data-deluxe-model]')) { const selected = button.dataset.deluxeModel === value.model; button.setAttribute('aria-checked', String(selected)); button.tabIndex = selected ? 0 : -1; }
      $('deluxeModelName').textContent = model ? (model.letter || String.fromCharCode(65 + models.indexOf(model))) + ' · ' + model.name : 'Circuit study';
      $('deluxeModelMethod').textContent = model?.method || model?.subtitle || '';
      $('deluxeModelNote').textContent = model?.description || 'Choose a study to compare its response at the same amp settings.';
      const listening = model?.listeningNotes || model?.listeningNote || ''; $('deluxeListeningNote').textContent = Array.isArray(listening) ? listening.join(' · ') : listening;
      const normal = value.channel === 'normal', direct = value.cabinet === 'di';
      $('deluxeCabinetCaption').textContent = direct ? 'DIRECT / BUILT-IN CABINET BYPASSED' : 'SMALL COMBO / OPEN BACK / ONE TWELVE';
      $('deluxeChannelNote').textContent = normal ? 'Normal channel · spring reverb and tremolo are inactive. Their settings stay ready for the Vibrato channel.' : 'Vibrato channel · spring reverb and opto-style tremolo. Speed and Intensity move volume, as on the amp.';
      element.classList.toggle('deluxe-is-bypassed', value.bypass);
      element.classList.toggle('deluxe-normal-channel', normal);
      for (const d of descriptors.values()) {
        const current = value[d.key], off = normal && (def.normalInactive || ['reverb', 'speed', 'intensity']).includes(d.key) || direct && (def.cabinetInactive || ['speakerDrive', 'mic', 'distance', 'air']).includes(d.key), knob = element.querySelector('[data-deluxe-knob="' + d.key + '"]'), slider = element.querySelector('[data-deluxe-param="' + d.key + '"]'), select = element.querySelector('[data-deluxe-select="' + d.key + '"]');
        if (knob) { knob.disabled = off; knob.setAttribute('aria-valuenow', current); knob.setAttribute('aria-valuetext', format(d, current)); knob.querySelector('.deluxe-dial-pointer').style.transform = 'rotate(' + (-135 + Math.max(0, Math.min(1, ratio(d, current))) * 270) + 'deg)'; }
        if (slider) { slider.disabled = off; if (force || document.activeElement !== slider) slider.value = log(d) ? ratio(d, current) : current; slider.setAttribute('aria-valuetext', format(d, current)); }
        if (select && (force || document.activeElement !== select)) select.value = current;
        for (const number of element.querySelectorAll('[data-deluxe-number="' + d.key + '"]')) { number.disabled = off; if (force || document.activeElement !== number) number.value = Number((current * scale(d)).toFixed(4)); }
        for (const output of element.querySelectorAll('[data-deluxe-value="' + d.key + '"]')) output.textContent = format(d, current);
        for (const control of element.querySelectorAll('[data-deluxe-control="' + d.key + '"]')) control.classList.toggle('deluxe-control-off', off);
      }
      paint();
    }
    function paint(reading = getMeters()) {
      if (disposed || !visible || document.hidden) return;
      const value = p(), meter = reading?.sunday || reading || {}, available = meter.type === undefined || meter.type === 'sunday';
      const signal = available && !value.bypass && meter.active === true && Number.isFinite(meter.inputDb) && meter.inputDb > -90;
      $('deluxeSignalStatus').textContent = value.bypass ? 'Bypassed' : signal ? 'Signal active' : 'Ready';
      element.classList.toggle('deluxe-has-signal', signal);
      for (const output of element.querySelectorAll('[data-deluxe-meter]')) {
        const key = output.dataset.deluxeMeter, number = meter[key], level = key === 'inputDb' || key === 'outputDb', usable = available && !value.bypass && Number.isFinite(number) && (level || signal);
        output.textContent = usable ? level && number <= -119 ? '−∞ dBFS' : (key === 'headroomDb' && number > 0 ? '+' : '') + number.toFixed(1) + (level ? ' dBFS' : ' dB') : '—';
        const bar = element.querySelector('[data-deluxe-meter-bar="' + key + '"]');
        if (bar) bar.style.transform = 'scaleX(' + (usable ? Math.max(0, Math.min(1, (number + 60) / 60)) : 0) + ')';
      }
    }
    function pointerDown(event) {
      const button = event.target.closest('[data-deluxe-knob]'); if (!button || button.disabled || event.button !== 0 && event.pointerType === 'mouse') return;
      event.preventDefault(); if (pointer) return; end(keyboard); keyboard = null;
      pointer = { key: button.dataset.deluxeKnob, id: event.pointerId, y: event.clientY, value: p()[button.dataset.deluxeKnob], remembered: false, generation: getGeneration(), element: button };
      button.focus({ preventScroll: true }); button.setPointerCapture?.(event.pointerId); button.classList.add('is-adjusting');
    }
    function pointerMove(event) {
      if (!pointer || event.pointerId !== pointer.id) return;
      if (!valid(pointer)) { cancelGestures(); return; }
      const d = descriptors.get(pointer.key), fraction = (pointer.y - event.clientY) / (event.shiftKey ? 1600 : 220);
      changed(d.key, log(d) ? pointer.value * Math.pow(d.max / d.min, fraction) : pointer.value + fraction * (d.max - d.min), pointer);
    }
    function pointerEnd(event) {
      if (pointer && event.pointerId === pointer.id) { const active = pointer; pointer = null; active.element.classList.remove('is-adjusting'); if (active.element.hasPointerCapture?.(active.id)) active.element.releasePointerCapture(active.id); end(active); }
      if (range) { end(range); range = null; }
    }
    function keyDown(event) {
      const modelButton = event.target.closest('[data-deluxe-model]');
      if (modelButton && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); const current = models.findIndex(model => model.id === modelButton.dataset.deluxeModel), index = event.key === 'Home' ? 0 : event.key === 'End' ? models.length - 1 : (current + (event.key === 'ArrowLeft' ? -1 : 1) + models.length) % models.length;
        emit({ model: models[index].id }, { key: 'model', first: true, phase: 'single' }); element.querySelector('[data-deluxe-model="' + models[index].id + '"]').focus(); return;
      }
      const knob = event.target.closest('[data-deluxe-knob]'); if (!knob || knob.disabled || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const key = knob.dataset.deluxeKnob, d = descriptors.get(key);
      if (!valid(keyboard) || keyboard.key !== key) { end(keyboard); keyboard = { key, remembered: false, generation: getGeneration() }; }
      const step = d.step * (event.shiftKey ? 10 : 1) * (event.key.startsWith('Page') ? 10 : 1);
      changed(key, event.key === 'Home' ? d.min : event.key === 'End' ? d.max : p()[key] + (['ArrowUp', 'ArrowRight', 'PageUp'].includes(event.key) ? step : -step), keyboard);
    }
    const handlers = {
      pointerdown: event => { pointerDown(event); const slider = event.target.closest('[data-deluxe-param]'); if (slider && !slider.disabled) range = { key: slider.dataset.deluxeParam, remembered: false, generation: getGeneration() }; event.stopPropagation(); },
      pointermove: pointerMove, pointerup: pointerEnd, pointercancel: pointerEnd,
      keydown: event => { keyDown(event); const slider = event.target.closest('[data-deluxe-param]'); if (slider && !slider.disabled && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key) && !range) range = { key: slider.dataset.deluxeParam, remembered: false, generation: getGeneration() }; event.stopPropagation(); },
      keyup: event => { end(keyboard); keyboard = null; if (range) { end(range); range = null; } event.stopPropagation(); },
      focusout: () => { end(keyboard); keyboard = null; if (range) { end(range); range = null; } render(); },
      input: event => { const slider = event.target.closest('[data-deluxe-param]'); if (slider) { if (range && !valid(range)) { range = null; render(); return; } const d = descriptors.get(slider.dataset.deluxeParam); changed(d.key, log(d) ? d.min * Math.pow(d.max / d.min, Number(slider.value)) : Number(slider.value), range); } event.stopPropagation(); },
      change: event => {
        const number = event.target.closest('[data-deluxe-number]'), select = event.target.closest('[data-deluxe-select]');
        if (number) { const d = descriptors.get(number.dataset.deluxeNumber); if (number.value !== '') changed(d.key, Number(number.value) / scale(d)); number.value = Number((p()[d.key] * scale(d)).toFixed(4)); }
        if (select) emit({ [select.dataset.deluxeSelect]: select.value }, { key: select.dataset.deluxeSelect, first: true, phase: 'single' });
        if (event.target.id === 'deluxePreset') { const recipe = (def.presets || []).find(recipe => recipe.id === event.target.value); if (recipe) emit({ ...clone(def.defaults), ...clone(recipe.params) }, { key: null, first: true, phase: 'single' }); }
        event.stopPropagation();
      },
      click: event => { const button = event.target.closest('[data-deluxe-model]'); if (button && button.dataset.deluxeModel !== p().model) emit({ model: button.dataset.deluxeModel }, { key: 'model', first: true, phase: 'single' }); event.stopPropagation(); }
    };
    for (const [event, handler] of Object.entries(handlers)) element.addEventListener(event, handler);
    render();
    return { render, paint, setVisible(value) { visible = !!value; }, dispose() { if (disposed) return; disposed = true; cancelGestures(); for (const [event, handler] of Object.entries(handlers)) element.removeEventListener(event, handler); element.innerHTML = ''; }, get element() { return element; } };
  }
  scope.LoomDeluxeUI = Object.freeze({ create });
})(typeof window === 'undefined' ? globalThis : window);
