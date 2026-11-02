/* CELLAR · five SVT-inspired studies, with a common amplifier face. */
(function (scope) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const face = ['gain', 'bass', 'mid', 'treble', 'master'], switches = ['pad', 'ultraLow', 'ultraHigh'];
  const percentages = new Set(['mix', 'sag', 'feedback', 'transformer', 'speakerLoad', 'speakerDrive', 'mic', 'distance', 'air']);
  const put = (element, value) => { if (element && element.textContent !== String(value)) element.textContent = String(value); };
  const attribute = (element, key, value) => { if (element && element.getAttribute(key) !== String(value)) element.setAttribute(key, String(value)); };
  function create({ element, getParams, getDefinition, getMeters = () => null, getGeneration = () => 0, onChange = () => {}, onStatus = () => {} }) {
    if (!element || typeof getParams !== 'function') throw Error('CELLAR needs its editor and current amplifier settings.');
    const def = (typeof getDefinition === 'function' ? getDefinition() : getDefinition) || scope.LoomSVTCatalog?.[0];
    if (!def) throw Error('The CELLAR control definitions are missing.');
    const descriptors = new Map(def.params.map(d => [d.key, d])), models = def.models || [], p = () => getParams() || def.defaults;
    let disposed = false, visible = true, pointer = null, keyboard = null, range = null, generation = getGeneration();
    const scale = d => percentages.has(d.key) ? 100 : 1;
    const logarithmic = d => d.min > 0 && (d.scale === 'log' || d.unit === 'Hz' && d.max / d.min > 8);
    const ratio = (d, value) => logarithmic(d) ? Math.log(value / d.min) / Math.log(d.max / d.min) : (value - d.min) / (d.max - d.min);
    const valueAt = (d, position) => logarithmic(d) ? d.min * Math.pow(d.max / d.min, position) : d.min + position * (d.max - d.min);
    const bounded = (d, value) => Math.max(d.min, Math.min(d.max, value));
    function format(d, value) {
      if (!Number.isFinite(value)) return '—';
      if (percentages.has(d.key)) return Math.round(value * 100) + '%';
      if (d.unit === 'dB') return (value > 0 ? '+' : '') + value.toFixed(1) + ' dB';
      if (d.unit === 'Hz') return value >= 1000 ? Number((value / 1000).toFixed(2)) + ' kHz' : Math.round(value) + ' Hz';
      return Number(value.toFixed(2)) + (d.unit ? ' ' + d.unit : '');
    }
    function exact(d) { return '<span class="svt-exact"><input type="number" data-svt-number="' + esc(d.key) + '" aria-label="' + esc(d.label) + ' exact value" min="' + d.min * scale(d) + '" max="' + d.max * scale(d) + '" step="' + d.step * scale(d) + '"><span>' + esc(percentages.has(d.key) ? '%' : d.unit || '') + '</span></span>'; }
    function control(key, rotary = false) {
      const d = descriptors.get(key); if (!d) return '';
      if (d.type === 'select') return '<label class="svt-select"><span>' + esc(d.label) + '</span><select data-svt-select="' + esc(key) + '" aria-label="' + esc(d.label) + '">' + d.options.map(option => '<option value="' + esc(option.value) + '">' + esc(option.label) + '</option>').join('') + '</select></label>';
      if (d.type !== 'range') return '';
      if (rotary) return '<div class="svt-control svt-rotary" data-svt-control="' + esc(key) + '"><label id="svt-label-' + esc(key) + '">' + esc(d.label) + '</label><button type="button" class="svt-knob" role="slider" data-svt-knob="' + esc(key) + '" aria-labelledby="svt-label-' + esc(key) + '" aria-valuemin="' + d.min + '" aria-valuemax="' + d.max + '" aria-valuenow="' + d.default + '"><svg viewBox="0 0 84 84" aria-hidden="true"><path class="svt-dial-ring" d="M17 65a32 32 0 1 1 50 0"/><circle class="svt-dial-shadow" cx="42" cy="45" r="26"/><circle class="svt-dial-cap" cx="42" cy="42" r="26"/><circle class="svt-dial-inner" cx="42" cy="42" r="20"/><path class="svt-dial-pointer" d="M42 42V23"/></svg></button>' + exact(d) + '</div>';
      return '<div class="svt-control" data-svt-control="' + esc(key) + '"><label><span>' + esc(d.label) + '</span><output data-svt-value="' + esc(key) + '"></output></label><div class="svt-value-row"><input type="range" data-svt-param="' + esc(key) + '" aria-label="' + esc(d.label) + '" min="' + (logarithmic(d) ? 0 : d.min) + '" max="' + (logarithmic(d) ? 1 : d.max) + '" step="' + (logarithmic(d) ? .001 : d.step) + '">' + exact(d) + '</div></div>';
    }
    const frontKeys = new Set([...face, ...switches, 'midFreq', 'model', 'mix', 'bypass']);
    const folds = (def.groups || []).map(group => ({ ...group, keys: (group.keys || []).filter(key => !frontKeys.has(key) && descriptors.has(key)) })).filter(group => group.keys.length);
    const included = new Set(folds.flatMap(group => group.keys)), remaining = [...descriptors.keys()].filter(key => !frontKeys.has(key) && !included.has(key));
    if (remaining.length) folds.push({ id: 'calibration', label: 'Input & finishing adjustments', help: 'Calibrate your instrument and listening level.', keys: remaining });
    element.innerHTML = '<div class="svt-console"><div class="svt-recipe-bar"><label><span class="eyebrow">HOUSE RECIPES / COMPLETE AMP SETTINGS</span><select data-svt-preset aria-label="CELLAR recipe"><option value="">Custom settings</option>' + (def.presets || []).map(recipe => '<option value="' + esc(recipe.id) + '">' + esc(recipe.name) + '</option>').join('') + '</select></label><p data-svt-recipe-note></p></div>' +
      '<section class="svt-studies" aria-label="Five amplifier studies"><div class="svt-heading"><div><span class="eyebrow">ONE BIG BASS HEAD / FIVE INTERPRETATIONS</span><h3>Find your kind of authority.</h3></div><p>Change A–E. Keep your knobs.</p></div><div class="svt-models" role="radiogroup" aria-label="SVT amplifier interpretation">' + models.map((model, index) => '<button type="button" role="radio" data-svt-model="' + esc(model.id) + '" aria-checked="false" tabindex="-1"><b>' + esc(model.letter || String.fromCharCode(65 + index)) + '</b><span>' + esc(model.name) + '</span></button>').join('') + '</div><div class="svt-model-note"><strong data-svt-model-name></strong><p data-svt-model-note></p><small data-svt-listening-note></small></div></section>' +
      '<section class="svt-amplifier" aria-label="CELLAR amplifier"><div class="svt-face"><div class="svt-brand-row"><div><strong>Cellar</strong><span>SUPER VALVE / BASS AMPLIFIER</span></div><span class="svt-signal" data-svt-signal>Ready</span></div><div class="svt-switch-row"><div class="svt-switches">' + switches.map(key => '<button type="button" data-svt-switch="' + key + '" aria-pressed="false"><i aria-hidden="true"></i>' + esc(descriptors.get(key)?.label || key) + '</button>').join('') + '</div>' + control('midFreq') + '</div><div class="svt-face-knobs">' + face.map(key => control(key, true)).join('') + '</div><p class="svt-face-note">Gain drives the preamp. Master pushes the power section. Output trim sets listening level.</p></div><div class="svt-grille" aria-hidden="true"><span data-svt-cabinet-caption>SEALED CABINET / EIGHT TENS</span><b>C / 300</b></div></section>' +
      '<section class="svt-touch" aria-label="Actual signal readings"><div class="svt-heading"><div><span class="eyebrow">INPUT / TOUCH / HEADROOM</span><h3>Keep the quiet notes quiet.</h3></div><span>Fixed levels. No automatic gain riding.</span></div><div class="svt-meters">' + [['inputDb', 'Input peak'], ['outputDb', 'Output peak'], ['inputCrestDb', 'Input crest'], ['outputCrestDb', 'Output crest'], ['headroomDb', 'Power margin estimate'], ['sagDb', 'Supply movement']].map(([key, label]) => '<div><span>' + label + '</span><output data-svt-meter="' + key + '">—</output>' + (key === 'inputDb' || key === 'outputDb' ? '<i aria-hidden="true"><b data-svt-meter-bar="' + key + '"></b></i>' : '') + '</div>').join('') + '</div><p>Start with a low Gain setting and set Input trim for your bass or DI. Compare soft and firm playing before adding drive. Crest compares peak with RMS; power margin is an estimate.</p></section>' +
      '<div class="svt-folds">' + folds.map(group => '<details data-svt-fold="' + esc(group.id) + '"><summary><span><strong>' + esc(group.label || group.title || group.id) + '</strong><small>' + esc(group.help || group.description || '') + '</small></span><b aria-hidden="true">+</b></summary><div class="svt-deep-controls">' + group.keys.map(key => control(key)).join('') + '</div></details>').join('') + '</div><details class="svt-operating-notes"><summary>Operating notes &amp; circuit references</summary><p>Five original SVT-inspired circuit studies share the controls and cabinet so you can compare their response. They are reduced-order interpretations, not measured hardware captures. Matched uses a fixed clean-level trim; it does not level your playing. Circuit and cabinet adjustments extend beyond the original front panel. DI removes the built-in cabinet and microphone path for use with an external cabinet effect.</p></details></div>';
    const query = selector => element.querySelector(selector), controls = new Map([...descriptors].map(([key, d]) => [key, { d, knob: query('[data-svt-knob="' + key + '"]'), slider: query('[data-svt-param="' + key + '"]'), number: query('[data-svt-number="' + key + '"]'), select: query('[data-svt-select="' + key + '"]'), output: query('[data-svt-value="' + key + '"]'), holder: query('[data-svt-control="' + key + '"]') }]));
    const references = { recipe: query('[data-svt-preset]'), recipeNote: query('[data-svt-recipe-note]'), modelName: query('[data-svt-model-name]'), modelNote: query('[data-svt-model-note]'), listening: query('[data-svt-listening-note]'), signal: query('[data-svt-signal]'), caption: query('[data-svt-cabinet-caption]') };
    const modelButtons = [...element.querySelectorAll('[data-svt-model]')], switchButtons = [...element.querySelectorAll('[data-svt-switch]')], meters = [...element.querySelectorAll('[data-svt-meter]')].map(output => ({ output, key: output.dataset.svtMeter, bar: query('[data-svt-meter-bar="' + output.dataset.svtMeter + '"]') }));
    function emit(patch, meta) { if (disposed) return; try { onChange(patch, meta); } catch (error) { onStatus(error.message); } render(); }
    function changed(key, value, active) {
      const d = descriptors.get(key); if (!d || !Number.isFinite(value)) return;
      const next = Number(bounded(d, Math.round(bounded(d, value) / d.step) * d.step).toFixed(6));
      if (Math.abs(next - p()[key]) < d.step * .001) return;
      const first = !active?.remembered; if (active) active.remembered = true;
      emit({ [key]: next }, { key, first, phase: active ? 'input' : 'single' });
    }
    const valid = active => active && active.generation === getGeneration();
    function end(active) { if (valid(active) && active.remembered) onChange({}, { key: active.key, first: false, phase: 'end' }); }
    function cancelGestures() { const active = pointer; pointer = keyboard = range = null; if (active) { active.element.classList.remove('is-adjusting'); if (active.element.hasPointerCapture?.(active.id)) active.element.releasePointerCapture(active.id); } }
    function finishGesture() { end(pointer); end(keyboard); end(range); cancelGestures(); }
    function render() {
      if (disposed) return;
      const force = generation !== getGeneration(); if (force) { cancelGestures(); generation = getGeneration(); }
      const value = p(), model = models.find(item => item.id === value.model), recipe = (def.presets || []).find(item => Object.entries(item.params).every(([key, expected]) => value[key] === expected));
      if (force || document.activeElement !== references.recipe) references.recipe.value = recipe?.id || '';
      put(references.recipeNote, recipe?.description || 'A–E changes only the interpretation. A recipe replaces the complete amplifier setup.');
      for (const button of modelButtons) { const selected = button.dataset.svtModel === value.model; attribute(button, 'aria-checked', selected); button.tabIndex = selected ? 0 : -1; }
      put(references.modelName, model ? (model.letter || String.fromCharCode(65 + models.indexOf(model))) + ' · ' + model.name : 'Choose a study'); put(references.modelNote, model?.description || '');
      put(references.listening, Array.isArray(model?.listeningNotes) ? model.listeningNotes.join(' · ') : model?.listeningNotes || model?.listeningNote || '');
      for (const button of switchButtons) attribute(button, 'aria-pressed', value[button.dataset.svtSwitch] === 'on');
      put(references.caption, value.cabinet === 'di' ? 'DIRECT / EXTERNAL CABINET READY' : 'SEALED CABINET / EIGHT TENS'); element.classList.toggle('svt-is-bypassed', !!value.bypass);
      const inactive = value.cabinet === 'di' ? new Set(def.cabinetInactive || ['speakerDrive', 'mic', 'distance', 'air']) : new Set();
      for (const [key, refs] of controls) {
        const { d, knob, slider, number, select, output, holder } = refs, current = value[key], off = inactive.has(key);
        if (knob) { knob.disabled = off; attribute(knob, 'aria-valuenow', current); attribute(knob, 'aria-valuetext', format(d, current)); const transform = 'rotate(' + (-135 + Math.max(0, Math.min(1, ratio(d, current))) * 270) + 'deg)'; const needle = knob.querySelector('.svt-dial-pointer'); if (needle.style.transform !== transform) needle.style.transform = transform; }
        if (slider) { slider.disabled = off; if (force || document.activeElement !== slider) slider.value = logarithmic(d) ? ratio(d, current) : current; attribute(slider, 'aria-valuetext', format(d, current)); }
        if (number) { number.disabled = off; if (force || document.activeElement !== number) number.value = Number((current * scale(d)).toFixed(4)); }
        if (select && (force || document.activeElement !== select)) select.value = current;
        put(output, format(d, current)); holder?.classList.toggle('svt-control-off', off);
      }
      paint();
    }
    function paint(reading = getMeters()) {
      if (disposed || !visible || document.hidden) return;
      const value = p(), meter = reading?.cellar || reading || {}, available = meter.type === undefined || meter.type === 'cellar', signal = available && !value.bypass && meter.active === true && Number.isFinite(meter.inputDb) && meter.inputDb > -90;
      put(references.signal, value.bypass ? 'Bypassed' : signal ? 'Signal active' : 'Ready'); element.classList.toggle('svt-has-signal', signal);
      for (const { output, key, bar } of meters) { const number = meter[key], level = key === 'inputDb' || key === 'outputDb', usable = available && !value.bypass && Number.isFinite(number) && (level || signal); put(output, usable ? level && number <= -119 ? '−∞ dBFS' : (key === 'headroomDb' && number > 0 ? '+' : '') + number.toFixed(1) + (level ? ' dBFS' : ' dB') : '—'); if (bar) { const transform = 'scaleX(' + (usable ? Math.max(0, Math.min(1, (number + 60) / 60)) : 0) + ')'; if (bar.style.transform !== transform) bar.style.transform = transform; } }
    }
    function pointerEnd(event) { if (pointer && event.pointerId === pointer.id) { const active = pointer; pointer = null; active.element.classList.remove('is-adjusting'); if (active.element.hasPointerCapture?.(active.id)) active.element.releasePointerCapture(active.id); end(active); } if (range) { end(range); range = null; } }
    const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'];
    const handlers = {
      pointerdown(event) { const knob = event.target.closest('[data-svt-knob]'), slider = event.target.closest('[data-svt-param]'); if (knob && !knob.disabled && !pointer && (event.button === 0 || event.pointerType !== 'mouse')) { event.preventDefault(); end(keyboard); keyboard = null; const key = knob.dataset.svtKnob; pointer = { key, id: event.pointerId, y: event.clientY, position: ratio(descriptors.get(key), p()[key]), remembered: false, generation: getGeneration(), element: knob }; knob.focus({ preventScroll: true }); knob.setPointerCapture?.(event.pointerId); knob.classList.add('is-adjusting'); } if (slider && !slider.disabled) range = { key: slider.dataset.svtParam, remembered: false, generation: getGeneration() }; event.stopPropagation(); },
      pointermove(event) { if (!pointer || pointer.id !== event.pointerId) return; if (!valid(pointer)) { cancelGestures(); return; } pointer.position = Math.max(0, Math.min(1, pointer.position + (pointer.y - event.clientY) / (event.shiftKey ? 1600 : 220))); pointer.y = event.clientY; changed(pointer.key, valueAt(descriptors.get(pointer.key), pointer.position), pointer); },
      pointerup: pointerEnd, pointercancel: pointerEnd, lostpointercapture: pointerEnd,
      keydown(event) {
        const model = event.target.closest('[data-svt-model]'); if (model && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); const current = models.findIndex(item => item.id === model.dataset.svtModel), index = event.key === 'Home' ? 0 : event.key === 'End' ? models.length - 1 : (current + (event.key === 'ArrowLeft' ? -1 : 1) + models.length) % models.length; if (models[index].id !== p().model) emit({ model: models[index].id }, { key: 'model', first: true, phase: 'single' }); modelButtons[index].focus(); return; }
        const knob = event.target.closest('[data-svt-knob]'), slider = event.target.closest('[data-svt-param]'); if (!arrows.includes(event.key) || event.ctrlKey || event.metaKey) return;
        if (knob && !knob.disabled) { event.preventDefault(); event.stopPropagation(); const key = knob.dataset.svtKnob, d = descriptors.get(key); if (!valid(keyboard) || keyboard.key !== key) { end(keyboard); keyboard = { key, remembered: false, generation: getGeneration() }; } const step = d.step * (event.shiftKey ? 10 : 1) * (event.key.startsWith('Page') ? 10 : 1); changed(key, event.key === 'Home' ? d.min : event.key === 'End' ? d.max : p()[key] + (['ArrowUp', 'ArrowRight', 'PageUp'].includes(event.key) ? step : -step), keyboard); }
        if (slider && !slider.disabled) { if (!range) range = { key: slider.dataset.svtParam, remembered: false, generation: getGeneration() }; event.stopPropagation(); }
      },
      keyup(event) { if (arrows.includes(event.key)) { end(keyboard); keyboard = null; end(range); range = null; event.stopPropagation(); } },
      focusout() { end(keyboard); keyboard = null; end(range); range = null; render(); },
      input(event) { const slider = event.target.closest('[data-svt-param]'); if (slider) { if (range && !valid(range)) { range = null; render(); return; } const d = descriptors.get(slider.dataset.svtParam); changed(d.key, logarithmic(d) ? valueAt(d, Number(slider.value)) : Number(slider.value), range); } event.stopPropagation(); },
      change(event) { const number = event.target.closest('[data-svt-number]'), select = event.target.closest('[data-svt-select]'); if (number) { const d = descriptors.get(number.dataset.svtNumber); if (number.value !== '') changed(d.key, Number(number.value) / scale(d)); number.value = Number((p()[d.key] * scale(d)).toFixed(4)); } if (select && select.value !== p()[select.dataset.svtSelect]) emit({ [select.dataset.svtSelect]: select.value }, { key: select.dataset.svtSelect, first: true, phase: 'single' }); if (event.target === references.recipe) { const recipe = (def.presets || []).find(item => item.id === event.target.value); if (recipe) emit({ ...def.defaults, ...recipe.params }, { key: null, first: true, phase: 'single' }); } if (range) { end(range); range = null; } event.stopPropagation(); },
      click(event) { const model = event.target.closest('[data-svt-model]'), toggle = event.target.closest('[data-svt-switch]'); if (model && model.dataset.svtModel !== p().model) emit({ model: model.dataset.svtModel }, { key: 'model', first: true, phase: 'single' }); if (toggle) { const key = toggle.dataset.svtSwitch; emit({ [key]: p()[key] === 'on' ? 'off' : 'on' }, { key, first: true, phase: 'single' }); } event.stopPropagation(); }
    };
    for (const [event, handler] of Object.entries(handlers)) element.addEventListener(event, handler);
    scope.addEventListener?.('blur', finishGesture);
    render();
    return { render, paint, finishGesture, setVisible(value) { if (visible && !value) finishGesture(); visible = !!value; }, dispose() { if (disposed) return; disposed = true; cancelGestures(); for (const [event, handler] of Object.entries(handlers)) element.removeEventListener(event, handler); scope.removeEventListener?.('blur', finishGesture); element.innerHTML = ''; }, get element() { return element; } };
  }
  scope.LoomSVTUI = Object.freeze({ create });
})(typeof window === 'undefined' ? globalThis : window);
