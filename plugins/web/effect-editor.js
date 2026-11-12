/* Catalogue-driven native Kitchen effects; original specialist panels are reused. */
(function (global) {
  'use strict';
  const bridge = global.KitchenNativeEditor;
  if (!bridge) throw Error('The Kitchen native editor bridge must load first.');
  let descriptor = bridge.descriptor, state = descriptor.defaultState || descriptor.defaults || descriptor.definition?.defaults || { params: {} }, generation = 0, special = null, capturePanel = null, drag = null, keyboard = null, values = new Map(), nodes = new Map();
  let captureTake = null, captureSerial = 0, captureTimer = 0, captureLoading = false;
  const captureRequests = new Map(), captureListeners = new Set();
  const $ = id => document.getElementById(id), copy = value => JSON.parse(JSON.stringify(value)), esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const productId = () => descriptor.sourceId || descriptor.effectId || String(descriptor.id || '').replace(/^effect[:-]/, '');
  const definition = () => descriptor.catalog || descriptor.definition?.webDefinition || descriptor.definition?.catalog || global.LoomEffectsCatalog?.find(value => value.id === productId()) || descriptor.definition || descriptor;
  const params = () => state.params || state;
  const hostParameters = () => descriptor.parameters || descriptor.definition?.parameters || [];
  function captureRequest(action) {
    const requestId = 'editor-' + (++captureSerial);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { captureRequests.delete(requestId); reject(Error('The audio engine did not answer. Start the DAW audio engine and try again.')); }, 10000);
      captureRequests.set(requestId, { resolve, reject, timer }); bridge.send('kitchenCapture', { action, requestId, afterNote: action === 'start' || action === 'clear' ? 0 : captureTake?.notes?.length || 0, maxNotes: 64 });
    });
  }
  function pollCapture() {
    clearTimeout(captureTimer); captureTimer = 0;
    if (captureTake?.capturing && $('fermentMidiPanel')?.open) captureTimer = setTimeout(() => captureRequest('poll').catch(error => bridge.send('kitchenGetState', { reason: error.message })), 200);
  }
  function lockCaptureControls() {
    if (!captureLoading) return;
    for (const button of $('pluginCaptureEditor').querySelectorAll('button')) button.disabled = true;
    const status = $('fermentMidiStatus'); if (status) status.textContent = 'Loading captured notes · ' + (captureTake?.notes?.length || 0) + ' / ' + (captureTake?.noteCount || '…');
  }
  function captureFailed(error) {
    if (captureLoading) captureTake = null;
    captureLoading = false; clearTimeout(captureTimer); captureTimer = 0;
    for (const listener of captureListeners) listener(); $('pluginStatus').textContent = error.message || String(error);
  }
  bridge.subscribe('capture', value => {
    const pending = captureRequests.get(value.requestId); if (pending) { clearTimeout(pending.timer); captureRequests.delete(value.requestId); }
    if (value.ok === false || value.error) { const error = Error(value.error || 'The capture action failed.'); captureFailed(error); pending?.reject(error); return; }
    const incoming = value.take;
    if (!incoming) captureTake = null;
    else {
      const notes = captureTake?.token === incoming.token ? [...captureTake.notes] : [], offset = Number(incoming.notesOffset || 0);
      if (offset > notes.length) { const error = Error('The captured note pages were incomplete. Reopen Capture MIDI to poll the take again.'); captureLoading = true; captureFailed(error); pending?.reject(error); return; }
      for (let index = 0; index < (incoming.notes?.length || 0); index++) notes[offset + index] = incoming.notes[index];
      captureTake = { ...incoming, notes };
    }
    captureLoading = !!incoming?.moreNotes;
    for (const listener of captureListeners) listener(); lockCaptureControls();
    if (incoming?.moreNotes) {
      clearTimeout(captureTimer); captureTimer = 0;
      captureRequest('poll').then(take => pending?.resolve(take), error => { captureFailed(error); pending?.reject(error); });
    } else { pollCapture(); pending?.resolve(captureTake); }
  });
  const captureEngine = {
    getPedalMidiTake: () => captureTake,
    startPedalMidi: () => captureRequest('start'), stopPedalMidi: () => captureRequest('stop'),
    clearPedalMidiTake: () => { captureRequest('clear').catch(error => $('pluginStatus').textContent = error.message); },
    subscribePedalMidi(listener) { captureListeners.add(listener); return () => captureListeners.delete(listener); }
  };
  function descriptorFor(key) { const list = hostParameters(); const index = list.findIndex(value => value.key === key || value.path === key || value.path === 'params.' + key); return { index, value: list[index] }; }
  function emit(patch, meta = {}) {
    const next = { ...params(), ...patch }; state = { ...state, params: next };
    for (const [key, value] of Object.entries(patch)) { const entry = descriptorFor(key); if (entry.index >= 0) bridge.setParameter(entry.index, value, { gesture: meta.phase || (meta.first === false ? 'edit' : 'single') }); }
    render();
  }
  function format(d, value) {
    if (d.type === 'boolean') return value ? 'On' : 'Off';
    if (d.type === 'select') return d.options?.find(option => (option?.value ?? option) === value)?.label || String(value ?? '');
    if (!Number.isFinite(value)) return '—';
    if (d.unit === 'Hz') return value >= 1000 ? Number((value / 1000).toFixed(2)) + ' kHz' : Math.round(value) + ' Hz';
    return (d.unit === 'dB' && value > 0 ? '+' : '') + Number(value.toFixed((d.step || 1) < .01 ? 3 : 2)) + (d.unit ? ' ' + d.unit : '');
  }
  const logarithmic = d => d.min > 0 && (d.scale === 'log' || d.unit === 'Hz' && d.max / d.min > 16);
  const ratio = (d, value) => Math.max(0, Math.min(1, logarithmic(d) ? Math.log(Math.max(d.min, value) / d.min) / Math.log(d.max / d.min) : (value - d.min) / (d.max - d.min)));
  const atRatio = (d, position) => logarithmic(d) ? d.min * (d.max / d.min) ** position : d.min + position * (d.max - d.min);
  function control(d) {
    const key = esc(d.key), label = esc(d.label || d.key), path = 'params.' + d.key;
    if (d.type === 'select') return '<div class="kp-parameter kp-select-parameter" data-control="' + key + '"><label for="parameter-' + key + '">' + label + '</label><select id="parameter-' + key + '" data-select="' + key + '" data-parameter-path="' + esc(path) + '">' + (d.options || []).map(option => '<option value="' + esc(option?.value ?? option) + '">' + esc(option?.label ?? option?.value ?? option) + '</option>').join('') + '</select></div>';
    if (d.type === 'boolean' || d.type === 'bool') return '<div class="kp-parameter" data-control="' + key + '"><span>' + label + '</span><label class="kp-boolean"><input type="checkbox" data-boolean="' + key + '" aria-label="' + label + '"><span data-value="' + key + '"></span></label></div>';
    return '<div class="kp-parameter" data-control="' + key + '"><label id="label-' + key + '">' + label + '</label><button type="button" class="kp-knob" role="slider" aria-labelledby="label-' + key + '" aria-valuemin="' + d.min + '" aria-valuemax="' + d.max + '" data-knob="' + key + '"><svg viewBox="0 0 68 68" aria-hidden="true"><path class="kp-ring" d="M14 54a28 28 0 1 1 40 0"/><circle class="kp-shadow" cx="34" cy="36" r="22"/><circle class="kp-cap" cx="34" cy="34" r="22"/><circle class="kp-cap-inner" cx="34" cy="34" r="18"/><path class="kp-pointer" d="M34 34V18"/></svg></button><output class="kp-value" data-value="' + key + '"></output><div class="kp-exact"><input type="number" data-number="' + key + '" aria-label="' + label + ' exact value" min="' + d.min + '" max="' + d.max + '" step="' + (d.step || .001) + '"><span>' + esc(d.unit || '') + '</span></div></div>';
  }
  function build() {
    const def = definition(), p = params();
    document.title = (descriptor.name || def.name || 'Kitchen') + ' · Kitchen'; $('pluginName').textContent = descriptor.name || def.name || 'Kitchen effect'; $('pluginDescription').textContent = def.subtitle || descriptor.description || '';
    document.documentElement.style.setProperty('--effect-color', def.color || '#d9c181');
    const host = hostParameters();
    const definitions = (def.params || host.map(value => ({ ...value, key: value.key || String(value.path || '').replace(/^params\./, '') }))).filter(value => value.key !== 'bypass');
    values = new Map(definitions.map(value => [value.key, { ...value, type: value.type === 'bool' ? 'boolean' : value.type }]));
    const used = new Set(), groups = [];
    for (const group of def.groups || []) {
      const keys = (group.keys || group.params || []).filter(key => values.has(key) && !used.has(key));
      if (keys.length) { keys.forEach(key => used.add(key)); groups.push({ ...group, keys }); }
    }
    const remaining = [...values.keys()].filter(key => !used.has(key)); if (remaining.length) groups.push({ id: 'sound', label: groups.length ? 'Additional controls' : 'Sound', help: '', keys: remaining });
    $('pluginControls').innerHTML = groups.map((group, index) => {
      const title = esc(group.label || group.title || group.id), help = group.help || group.description;
      const content = (help ? '<p class="kp-group-help">' + esc(help) + '</p>' : '') + '<div class="kp-group-grid">' + group.keys.map(key => control(values.get(key))).join('') + '</div>';
      return index === 0 ? '<section class="kp-control-group"><h2>' + title + '</h2>' + content + '</section>' : '<details class="kp-control-group"><summary>' + title + '</summary>' + content + '</details>';
    }).join('');
    nodes = new Map([...values].map(([key, d]) => [key, { d, knob: document.querySelector('[data-knob="' + CSS.escape(key) + '"]'), number: document.querySelector('[data-number="' + CSS.escape(key) + '"]'), select: document.querySelector('[data-select="' + CSS.escape(key) + '"]'), boolean: document.querySelector('[data-boolean="' + CSS.escape(key) + '"]'), output: document.querySelector('[data-value="' + CSS.escape(key) + '"]') }]));
    $('pluginRecipe').replaceChildren(new Option('Custom settings', ''), ...(def.presets || []).map(recipe => new Option(recipe.name, recipe.id)));
    $('pluginRecipeLabel').hidden = !(def.presets?.length);
    special?.dispose?.(); special = null; $('pluginSpecialEditor').replaceChildren();
    const factories = { sunday: global.LoomDeluxeUI, cellar: global.LoomSVTUI, board: global.LoomGuitarPedalsUI, cupboard: global.LoomCabinetUI };
    if (factories[productId()]?.create && def.params) {
      special = factories[productId()].create({ element: $('pluginSpecialEditor'), getParams: params, getDefinition: () => def, getGeneration: () => generation, getMeters: () => bridge.clock.meters || null, onChange: emit, onStatus: message => $('pluginStatus').textContent = message });
      $('pluginControls').classList.add('kp-original-controls'); $('pluginControls').hidden = true;
      // The original specialist panels include the full model/control set.
      // Generic controls remain available when the original panel is absent.
    } else $('pluginControls').hidden = false;
    capturePanel?.dispose(); capturePanel = null; clearTimeout(captureTimer); $('pluginCaptureEditor').replaceChildren();
    if (productId() === 'ferment' && global.LoomPedalMidiUI?.create) {
      capturePanel = global.LoomPedalMidiUI.create({ element: $('pluginCaptureEditor'), engine: captureEngine, getOwnerId: () => 'plugin', getSlot: () => 0, getGeneration: () => generation, onStatus: message => $('pluginStatus').textContent = message });
      $('fermentMidiPanel').addEventListener('toggle', () => { if ($('fermentMidiPanel').open) captureRequest('poll').catch(error => $('pluginStatus').textContent = error.message); else clearTimeout(captureTimer); });
      lockCaptureControls(); if (!captureRequests.size) captureRequest('poll').catch(error => $('pluginStatus').textContent = error.message);
    }
    render();
  }
  function render() {
    const p = params(), def = definition(); $('pluginBypass').checked = !!p.bypass; document.body.classList.toggle('kp-is-bypassed', !!p.bypass);
    for (const [key, refs] of nodes) {
      const value = p[key] ?? refs.d.default ?? refs.d.defaultValue ?? 0;
      if (refs.knob) { refs.knob.setAttribute('aria-valuenow', value); refs.knob.setAttribute('aria-valuetext', format(refs.d, value)); refs.knob.querySelector('.kp-pointer').style.transform = 'rotate(' + (-135 + ratio(refs.d, value) * 270) + 'deg)'; }
      if (refs.number && document.activeElement !== refs.number) refs.number.value = value;
      if (refs.select && refs.select.value !== String(value)) refs.select.value = String(value);
      if (refs.boolean) refs.boolean.checked = !!value;
      if (refs.output) refs.output.textContent = format(refs.d, value);
    }
    const recipe = (def.presets || []).find(value => Object.entries(value.params || {}).every(([key, expected]) => p[key] === expected));
    if (document.activeElement !== $('pluginRecipe')) $('pluginRecipe').value = recipe?.id || '';
    special?.render?.();
  }
  function change(key, value, meta = {}) {
    const d = values.get(key); if (!d || !Number.isFinite(value)) return;
    const step = Number(d.step || .001); value = Math.max(d.min, Math.min(d.max, Math.round((value - d.min) / step) * step + d.min));
    value = Number(value.toFixed(8)); if (params()[key] !== value) emit({ [key]: value }, meta);
  }
  document.addEventListener('pointerdown', event => {
    const knob = event.target.closest('[data-knob]'); if (!knob || event.button !== 0 && event.pointerType === 'mouse') return;
    event.preventDefault(); const key = knob.dataset.knob; drag = { key, id: event.pointerId, y: event.clientY, position: ratio(values.get(key), params()[key]), element: knob }; knob.focus({ preventScroll: true }); knob.setPointerCapture?.(event.pointerId); knob.classList.add('is-adjusting');
  });
  document.addEventListener('pointermove', event => { if (!drag || drag.id !== event.pointerId) return; drag.position = Math.max(0, Math.min(1, drag.position + (drag.y - event.clientY) / (event.shiftKey ? 1600 : 220))); drag.y = event.clientY; change(drag.key, atRatio(values.get(drag.key), drag.position), { phase: 'input' }); });
  function endPointer(event) { if (!drag || drag.id !== event.pointerId) return; drag.element.classList.remove('is-adjusting'); if (drag.element.hasPointerCapture?.(event.pointerId)) drag.element.releasePointerCapture(event.pointerId); drag = null; }
  document.addEventListener('pointerup', endPointer); document.addEventListener('pointercancel', endPointer);
  document.addEventListener('keydown', event => {
    const knob = event.target.closest('[data-knob]'); if (!knob || !['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const key = knob.dataset.knob, d = values.get(key), step = (d.step || .001) * (event.shiftKey ? 10 : 1) * (event.key.startsWith('Page') ? 10 : 1);
    change(key, event.key === 'Home' ? d.min : event.key === 'End' ? d.max : Number(params()[key]) + (['ArrowUp', 'ArrowRight', 'PageUp'].includes(event.key) ? step : -step), { phase: keyboard === key ? 'input' : 'start' }); keyboard = key;
  });
  document.addEventListener('keyup', () => { keyboard = null; });
  document.addEventListener('dblclick', event => { const knob = event.target.closest('[data-knob]'); if (knob) { const d = values.get(knob.dataset.knob); change(d.key, d.default ?? definition().defaults?.[d.key] ?? d.min); } });
  document.addEventListener('change', event => {
    const target = event.target;
    if (target.dataset.number) change(target.dataset.number, Number(target.value));
    if (target.dataset.select) { const d = values.get(target.dataset.select), value = d.options.find(option => String(option?.value ?? option) === target.value); emit({ [d.key]: value?.value ?? value }); }
    if (target.dataset.boolean) emit({ [target.dataset.boolean]: target.checked });
    if (target.id === 'pluginBypass') emit({ bypass: target.checked });
    if (target.id === 'pluginRecipe') { const recipe = definition().presets?.find(value => value.id === target.value); if (recipe) emit({ ...definition().defaults, ...recipe.params }); }
  });
  $('pluginReset').addEventListener('click', () => { generation++; emit(copy(definition().defaults || descriptor.defaultState?.params || {})); });
  bridge.subscribe('ready', value => { if (value.descriptor) { descriptor = value.descriptor; build(); } });
  bridge.subscribe('state', value => { state = value.state || state; render(); });
  bridge.subscribe('parameters', list => {
    const patch = {};
    if (Array.isArray(list)) list.forEach((value, index) => { const d = hostParameters()[index]; if (d) patch[d.key || String(d.path).replace(/^params\./, '')] = value?.normalized !== undefined ? bridge.actual(d, value.normalized) : typeof value === 'number' ? bridge.actual(d, value) : value?.value; });
    state = { ...state, params: { ...params(), ...patch } }; render();
  });
  bridge.subscribe('clock', clock => { $('pluginClock').textContent = Number(clock.tempo || 120).toFixed(2).replace(/\.00$/, '') + ' BPM · ' + (clock.playing ? 'PLAYING' : 'STOPPED'); special?.paint?.(clock.meters); });
  bridge.subscribe('meters', value => special?.paint?.(value));
  bridge.subscribe('status', value => $('pluginStatus').textContent = value);
  build(); bridge.send('kitchenReady', { request: true, editorReady: true });
  global.addEventListener('pagehide', () => { special?.dispose?.(); capturePanel?.dispose(); clearTimeout(captureTimer); for (const pending of captureRequests.values()) clearTimeout(pending.timer); captureRequests.clear(); });
  global.KitchenEffectEditor = Object.freeze({ get state() { return state; }, get parameterCount() { return nodes.size + 1; }, render, emit });
})(window);
