/* GALLEY motion timers: four shared LFOs, with the wiring kept in plain sight. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const rounded = value => Math.round(value * 1e6) / 1e6;
  const paintAttribute = (element, name, value) => { value = String(value); if (element.getAttribute(name) !== value) element.setAttribute(name, value); };
  const paintText = (element, value) => { if (element.textContent !== value) element.textContent = value; };
  const paintOpacity = (element, value) => { if (element.style.opacity !== value) element.style.opacity = value; };
  const waves = [['sine', 'Sine'], ['triangle', 'Triangle'], ['saw', 'Saw down'], ['ramp', 'Saw up'], ['square', 'Pulse'], ['hold', 'Sample & hold'], ['random', 'Smooth random']];
  const divisions = [[.0625, '1/64'], [.125, '1/32'], [.25, '1/16'], [1 / 3, '1/8 triplet'], [.5, '1/8'], [.75, '1/8 dotted'], [1, '1/4'], [1.5, '1/4 dotted'], [2, '1/2'], [3, '1/2 dotted'], [4, '1 bar'], [8, '2 bars'], [16, '4 bars'], [32, '8 bars'], [64, '16 bars'], [128, '32 bars']];
  const definitions = {
    rate: { label: 'Rate', min: .01, max: 40, step: .01, default: 1, unit: 'Hz', log: true },
    division: { label: 'Cycle', min: .0625, max: 128, step: .001, default: 4, unit: 'beats', log: true },
    depth: { label: 'Depth', min: 0, max: 1, step: .01, default: 1, percent: true },
    offset: { label: 'Offset', min: -1, max: 1, step: .01, default: 0, percent: true },
    phase: { label: 'Phase', min: 0, max: 1, step: .001, default: 0, degrees: true },
    symmetry: { label: 'Shape', min: .05, max: .95, step: .01, default: .5, percent: true },
    smoothing: { label: 'Slew', min: 0, max: 1000, step: 1, default: 10, unit: 'ms' }
  };
  const fieldValue = (definition, value) => rounded(value * (definition.percent ? 100 : definition.degrees ? 360 : 1));
  const unit = definition => definition.percent ? '%' : definition.degrees ? '°' : definition.unit || '';
  const numberText = value => Number.isFinite(value) ? Number(value.toFixed(Math.abs(value) < 1 ? 3 : Math.abs(value) < 10 ? 2 : 1)).toString() : '—';
  const valueLabel = (definition, value) => numberText(fieldValue(definition, value)) + (unit(definition) ? ' ' + unit(definition) : '');
  const normalized = (definition, value) => definition.log ? Math.log(value / definition.min) / Math.log(definition.max / definition.min) : (value - definition.min) / (definition.max - definition.min);
  const fromNormal = (definition, value) => definition.log ? definition.min * Math.pow(definition.max / definition.min, value) : definition.min + value * (definition.max - definition.min);
  const motion = typeof window.createLoomLFODSP === 'function' ? window.createLoomLFODSP() : null;
  const maxRoutes = motion?.MAX_ROUTES || 16;
  // This is a static cycle illustration. Live needles and readings use the
  // engine's own sample-clock meters, including cross-modulation and slew.
  function illustration(lfo, phase) {
    const seed = Math.max(0, Number(lfo.id?.split('-')[1]) - 1) || 0;
    const value = motion?.evaluateWave(lfo.wave, phase, lfo.symmetry, seed) ?? Math.sin(phase * Math.PI * 2);
    return clamp(value * lfo.depth + lfo.offset, -1, 1);
  }
  function wavePath(lfo, width, height) {
    const margin = 3, span = height - margin * 2;
    return Array.from({ length: 161 }, (_, index) => {
      const phase = index / 160, value = illustration(lfo, phase * (['hold', 'random'].includes(lfo.wave) ? 4 : 1));
      return (index ? 'L' : 'M') + (phase * width).toFixed(2) + ',' + (margin + (1 - value) * span / 2).toFixed(2);
    }).join('');
  }

  class LoomLFOEditor {
    constructor({ element, getState, getBeat = () => 0, getPlaying = () => false, getMeters = () => null, remember = () => {}, onChange = () => {}, status = () => {} }) {
      Object.assign(this, { element, getState, getBeat, getPlaying, getMeters, remember, onChange, status });
      this.selected = 0; this.drag = null; this.keyboard = null; this.ranges = new WeakMap(); this.stateRef = null; this.lfosRef = null; this.topology = ''; this.advanced = false; this.lastTick = 0;
      element.classList.add('lfo-bank'); element.setAttribute('aria-label', 'Four shared LFOs');
      element.addEventListener('click', event => this.click(event));
      element.addEventListener('change', event => this.change(event));
      element.addEventListener('input', event => this.input(event));
      element.addEventListener('pointerdown', event => this.pointerDown(event));
      element.addEventListener('pointermove', event => this.pointerMove(event));
      element.addEventListener('pointerup', event => this.pointerEnd(event));
      element.addEventListener('pointercancel', event => this.pointerEnd(event));
      element.addEventListener('lostpointercapture', event => this.pointerEnd(event));
      element.addEventListener('keydown', event => this.keydown(event));
      element.addEventListener('keyup', event => { if (event.target.closest('[data-lfo-knob]')) this.finishKeyboard(); });
      element.addEventListener('focusout', () => this.finishKeyboard());
      element.addEventListener('dblclick', event => { const knob = event.target.closest('[data-lfo-knob]'); if (knob) { event.preventDefault(); event.stopPropagation(); this.setField(knob.dataset.lfoKnob, definitions[knob.dataset.lfoKnob].default); } });
      element.addEventListener('toggle', event => { if (event.target.matches('[data-lfo-advanced]')) this.advanced = event.target.open; }, true);
      this.render();
    }
    lfos() { return this.getState().lfos || []; }
    lfo() { return this.lfos()[this.selected]; }
    targets() { return window.LoomSchema.lfoTargets?.(this.getState()) || []; }
    topologyKey() {
      const state = this.getState();
      return [...state.tracks, ...(state.returns || []), state.master].map(owner => owner.id + ':' + owner.name + ':' + owner.effects.map(effect => effect?.type || '').join(',')).join('|');
    }
    current(gesture) { return gesture && gesture.state === this.getState() && gesture.lfo === this.lfo(); }
    notify() { this.onChange({ lfos: true }); }
    targetKey(route) { return route.ownerId + '|' + route.target; }
    routeDefinition(route) { return this.descriptors.find(target => target.key === this.targetKey(route) && (!target.effectType || target.effectType === route.effectType)); }
    knob(key, lfo) {
      const definition = definitions[key], value = lfo[key], proportion = normalized(definition, value), angle = -135 + 270 * proportion;
      return `<div class="lfo-knob-control"><label for="lfo-${key}">${definition.label}</label><button id="lfo-${key}" type="button" role="slider" class="lfo-knob" data-lfo-knob="${key}" data-lfo-control="knob-${key}" aria-label="LFO ${this.selected + 1} ${definition.label}" aria-valuemin="${definition.min}" aria-valuemax="${definition.max}" aria-valuenow="${value}" aria-valuetext="${esc(valueLabel(definition, value))}" aria-orientation="vertical" title="Drag vertically; Shift for fine adjustment. Arrows adjust, Home/End select limits. Double-click, Enter or Space resets."><svg viewBox="0 0 64 64" aria-hidden="true"><path class="lfo-knob-arc" d="M12.2 51.8a28 28 0 1 1 39.6 0"/><circle class="lfo-knob-cap" cx="32" cy="32" r="22"/><circle class="lfo-knob-inner" cx="32" cy="32" r="17"/><path class="lfo-knob-needle" d="M32 28V16" transform="rotate(${angle} 32 32)"/></svg></button><div class="lfo-number"><input type="number" data-lfo-number="${key}" data-lfo-control="number-${key}" aria-label="LFO ${this.selected + 1} exact ${definition.label}${unit(definition) ? ' in ' + unit(definition) : ''}" min="${fieldValue(definition, definition.min)}" max="${fieldValue(definition, definition.max)}" step="${fieldValue(definition, definition.step)}" value="${fieldValue(definition, value)}"><span>${unit(definition)}</span></div></div>`;
    }
    advancedField(key, lfo, note) {
      const definition = definitions[key];
      return `<label class="lfo-fine-control"><span>${definition.label}<small>${esc(note)}</small></span><div><input type="range" data-lfo-field="${key}" data-lfo-control="field-${key}" min="${definition.min}" max="${definition.max}" step="${definition.step}" value="${lfo[key]}" aria-label="LFO ${this.selected + 1} ${definition.label}"><div class="lfo-number"><input type="number" data-lfo-number="${key}" data-lfo-control="number-${key}" min="${fieldValue(definition, definition.min)}" max="${fieldValue(definition, definition.max)}" step="${fieldValue(definition, definition.step)}" value="${fieldValue(definition, lfo[key])}" aria-label="LFO ${this.selected + 1} exact ${definition.label}"><span>${unit(definition)}</span></div></div></label>`;
    }
    routeMarkup(route, index) {
      const definition = this.routeDefinition(route), used = new Set(this.lfo().routes.filter(item => item !== route).map(item => this.targetKey(item))), owners = [...new Map(this.descriptors.map(target => [target.ownerId, target.group])).entries()], available = this.descriptors.filter(target => target.ownerId === route.ownerId);
      return `<div class="lfo-route ${route.enabled === false ? 'is-disabled' : ''} ${definition ? '' : 'is-unavailable'}" data-lfo-route="${esc(route.id)}"><span class="lfo-route-index">${String(index + 1).padStart(2, '0')}</span><label class="lfo-route-power" title="Enable this target"><input type="checkbox" data-lfo-route-enabled data-lfo-control="route-enabled-${esc(route.id)}" ${route.enabled !== false ? 'checked' : ''} aria-label="Enable LFO ${this.selected + 1} target ${index + 1}"><span></span></label><div class="lfo-destination"><select data-lfo-route-owner data-lfo-control="route-owner-${esc(route.id)}" aria-label="LFO ${this.selected + 1} target ${index + 1} destination">${owners.map(([id, label]) => `<option value="${esc(id)}" ${id === route.ownerId ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select><select data-lfo-route-target data-lfo-control="route-target-${esc(route.id)}" aria-label="LFO ${this.selected + 1} target ${index + 1} parameter">${!definition ? `<option value="" selected>Choose a parameter · previous effect unavailable</option>` : ''}${available.map(target => `<option value="${esc(target.key)}" ${definition === target ? 'selected' : ''} ${used.has(target.key) ? 'disabled' : ''}>${esc(target.label)}</option>`).join('')}</select></div><div class="lfo-route-amount"><label><span>AMOUNT</span><input type="range" data-lfo-route-amount data-lfo-control="route-amount-${esc(route.id)}" min="-1" max="1" step=".01" value="${route.amount}" aria-label="LFO ${this.selected + 1} target ${index + 1} amount"></label><div class="lfo-number"><input type="number" data-lfo-route-number data-lfo-control="route-number-${esc(route.id)}" min="-100" max="100" step="1" value="${rounded(route.amount * 100)}" aria-label="LFO ${this.selected + 1} target ${index + 1} exact amount in percent"><span>%</span></div></div><output class="lfo-route-value" data-lfo-route-value>${definition ? '—' : 'Unavailable'}</output><button type="button" class="lfo-route-remove" data-lfo-action="remove-route" data-lfo-control="route-remove-${esc(route.id)}" aria-label="Remove LFO ${this.selected + 1} target ${index + 1}" title="Remove target">×</button></div>`;
    }
    render() {
      if (this.drag || this.keyboard) return;
      const lfo = this.lfo(); if (!lfo) { this.element.innerHTML = ''; return; }
      const focus = this.element.contains(document.activeElement) ? document.activeElement.dataset.lfoControl : null;
      const advanced = this.element.querySelector('[data-lfo-advanced]'); if (advanced) this.advanced = advanced.open;
      this.stateRef = this.getState(); this.lfosRef = this.lfos(); this.topology = this.topologyKey(); this.descriptors = this.targets();
      const division = divisions.find(([value]) => Math.abs(value - lfo.division) < .00001), routes = lfo.routes || [];
      this.element.innerHTML = `<div class="lfo-bank-heading"><div><h3>Motion timers <span>4 SHARED LFOs</span></h3><p>One motion. As many ingredients as you like.</p></div><span class="lfo-global-label">ALL TRACKS · RETURNS · MASTER</span></div><div class="lfo-tabs" role="tablist" aria-label="Choose an LFO">${this.lfos().map((item, index) => `<button type="button" role="tab" id="lfo-tab-${index}" data-lfo-select="${index}" data-lfo-control="select-${index}" aria-selected="${index === this.selected}" aria-controls="lfo-selected-panel" tabindex="${index === this.selected ? 0 : -1}" class="lfo-tab ${index === this.selected ? 'selected' : ''} ${item.enabled ? 'is-on' : ''}"><span><i></i><strong>LFO ${index + 1}</strong><small>${item.enabled ? item.routes.filter(route => route.enabled !== false).length + ' target' + (item.routes.filter(route => route.enabled !== false).length === 1 ? '' : 's') : 'Off'}</small></span><svg viewBox="0 0 140 34" aria-hidden="true"><path d="M0 17H140" class="lfo-wave-zero"/><path class="lfo-wave" data-lfo-mini-wave="${index}" d="${wavePath(item, 140, 34)}"/><circle class="lfo-wave-dot" data-lfo-mini-dot="${index}" cx="0" cy="17" r="2.5"/></svg></button>`).join('')}</div>
        <div id="lfo-selected-panel" class="lfo-selected-panel" role="tabpanel" aria-labelledby="lfo-tab-${this.selected}"><div class="lfo-motion"><div class="lfo-motion-controls"><div class="lfo-source-row"><label class="lfo-power"><input type="checkbox" data-lfo-field="enabled" data-lfo-control="field-enabled" ${lfo.enabled ? 'checked' : ''} aria-label="Enable LFO ${this.selected + 1}"><span></span>On</label><label class="lfo-wave-select"><span>WAVE</span><select data-lfo-field="wave" data-lfo-control="field-wave" aria-label="LFO ${this.selected + 1} waveform">${waves.map(([value, label]) => `<option value="${value}" ${lfo.wave === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="lfo-clock-select"><span>CLOCK</span><select data-lfo-field="sync" data-lfo-control="field-sync" aria-label="LFO ${this.selected + 1} clock"><option value="sync" ${lfo.sync ? 'selected' : ''}>Tempo</option><option value="free" ${!lfo.sync ? 'selected' : ''}>Free</option></select></label></div><div class="lfo-knobs">${this.knob(lfo.sync ? 'division' : 'rate', lfo)}${this.knob('depth', lfo)}${this.knob('offset', lfo)}</div>${lfo.sync ? `<label class="lfo-division"><span>MUSICAL CYCLE</span><select data-lfo-field="division" data-lfo-control="field-division" aria-label="LFO ${this.selected + 1} musical cycle">${!division ? `<option value="${lfo.division}" selected>Custom · ${numberText(lfo.division)} beats</option>` : ''}${divisions.map(([value, label]) => `<option value="${value}" ${division?.[0] === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>` : '<p class="lfo-clock-hint">Free rate in cycles per second.</p>'}</div><div class="lfo-scope"><div class="lfo-scope-heading"><span>${['hold', 'random'].includes(lfo.wave) ? '4-CYCLE SHAPE PREVIEW' : 'SHAPE PREVIEW'} / LFO ${this.selected + 1}</span><output data-lfo-output aria-label="LFO ${this.selected + 1} live output">0.000</output></div><svg viewBox="0 0 420 108" preserveAspectRatio="none" role="img" aria-label="LFO ${this.selected + 1} static waveform preview"><path class="lfo-scope-grid" d="M0 3H420M0 54H420M0 105H420M105 0V108M210 0V108M315 0V108"/><path class="lfo-wave" data-lfo-scope-wave d="${wavePath(lfo, 420, 108)}"/><line class="lfo-scope-needle" data-lfo-scope-phase x1="0" x2="0" y1="0" y2="108"/></svg><div class="lfo-scope-footer"><span>START</span><span data-lfo-running>${lfo.enabled ? 'Press Play to move' : 'Off · settings retained'}</span><span>${['hold', 'random'].includes(lfo.wave) ? '4 CYCLES' : '1 CYCLE'}</span></div><p>Depth sets the swing; Offset moves its centre. Targets add to manual settings and drawn automation.</p></div></div>
        <details class="lfo-advanced" data-lfo-advanced ${this.advanced ? 'open' : ''}><summary>Shape & timing <span>Phase · symmetry · slew · restart</span></summary><div class="lfo-advanced-grid">${this.advancedField('phase', lfo, 'Starting point in the cycle')}${this.advancedField('symmetry', lfo, 'Balance the two halves')}${this.advancedField('smoothing', lfo, 'Round abrupt transitions')}<label class="lfo-retrigger"><span>Restart<small>Choose the cycle origin</small></span><select data-lfo-field="retrigger" data-lfo-control="field-retrigger" aria-label="LFO ${this.selected + 1} restart"><option value="transport" ${lfo.retrigger !== 'loop' ? 'selected' : ''}>Song position</option><option value="loop" ${lfo.retrigger === 'loop' ? 'selected' : ''}>Loop start</option></select></label></div><div class="lfo-advanced-footer"><p>Other LFOs can move every motion control. Target Free rate with the Free clock, or Cycle length with Tempo. Feedback routes stay within each control’s range.</p><button type="button" data-lfo-action="reset" data-lfo-control="reset" title="Restore motion controls while keeping your targets and On setting">Reset motion</button></div></details>
        <div class="lfo-routes-heading"><h4>Targets <span>${routes.length}</span></h4><button type="button" data-lfo-action="add-route" data-lfo-control="add-route" ${routes.length >= (window.LoomSchema.LIMITS.lfoRoutes || maxRoutes) ? 'disabled' : ''}>+ Add target</button></div><div class="lfo-routes" aria-label="LFO ${this.selected + 1} targets">${routes.length ? routes.map((route, index) => this.routeMarkup(route, index)).join('') : '<p class="lfo-no-targets">Add a target, choose its parameter, then turn this LFO on. Add more targets to move several controls together.</p>'}</div><p class="lfo-route-help">Amount is a share of the parameter’s range; negative amounts invert the motion. Frequency and rate targets move on a musical logarithmic scale.</p></div>`;
      this.lastTick = 0; this.tick();
      if (focus) [...this.element.querySelectorAll('[data-lfo-control]')].find(control => control.dataset.lfoControl === focus)?.focus({ preventScroll: true });
    }
    paintField(key, value) {
      const definition = definitions[key]; if (!definition) return;
      for (const input of this.element.querySelectorAll(`[data-lfo-field="${key}"]`)) if (input !== document.activeElement || input.type === 'range') {
        if (input.tagName === 'SELECT' && key === 'division') {
          let option = [...input.options].find(item => Math.abs(Number(item.value) - value) < .00001);
          if (!option) { option = document.createElement('option'); option.value = value; option.textContent = 'Custom · ' + numberText(value) + ' beats'; input.prepend(option); }
          input.value = option.value;
        } else input.value = value;
      }
      for (const input of this.element.querySelectorAll(`[data-lfo-number="${key}"]`)) if (input !== document.activeElement) input.value = fieldValue(definition, value);
      const knob = this.element.querySelector(`[data-lfo-knob="${key}"]`);
      if (knob) { knob.setAttribute('aria-valuenow', value); knob.setAttribute('aria-valuetext', valueLabel(definition, value)); knob.querySelector('.lfo-knob-needle').setAttribute('transform', `rotate(${-135 + 270 * normalized(definition, value)} 32 32)`); }
      const lfo = this.lfo();
      this.element.querySelector('[data-lfo-scope-wave]')?.setAttribute('d', wavePath(lfo, 420, 108));
      this.element.querySelector(`[data-lfo-mini-wave="${this.selected}"]`)?.setAttribute('d', wavePath(lfo, 140, 34));
    }
    setField(key, value, gesture = null) {
      const lfo = this.lfo(), definition = definitions[key]; if (!lfo || gesture && !this.current(gesture)) return false;
      if (definition) value = rounded(clamp(value, definition.min, definition.max));
      if (lfo[key] === value) return false;
      if (gesture) { if (!gesture.remembered) { this.remember(); gesture.remembered = true; } } else this.remember();
      lfo[key] = value; this.notify(); this.paintField(key, value); return true;
    }
    routeFor(element) { return this.lfo()?.routes.find(route => route.id === element.closest('[data-lfo-route]')?.dataset.lfoRoute); }
    setAmount(element, value, gesture = null) {
      const route = this.routeFor(element); if (!route || gesture && !this.current(gesture)) return;
      value = rounded(clamp(value, -1, 1)); if (route.amount === value) return;
      if (gesture) { if (!gesture.remembered) { this.remember(); gesture.remembered = true; } } else this.remember();
      route.amount = value;
      const row = element.closest('[data-lfo-route]');
      const range = row.querySelector('[data-lfo-route-amount]'), number = row.querySelector('[data-lfo-route-number]');
      range.value = value; if (number !== document.activeElement) number.value = rounded(value * 100);
      this.notify();
    }
    click(event) {
      event.stopPropagation();
      const tab = event.target.closest('[data-lfo-select]');
      if (tab) { this.finishGesture(); this.selected = Number(tab.dataset.lfoSelect); this.render(); this.element.querySelector(`[data-lfo-select="${this.selected}"]`)?.focus({ preventScroll: true }); return; }
      const action = event.target.closest('[data-lfo-action]')?.dataset.lfoAction, lfo = this.lfo(); if (!action || !lfo) return;
      if (action === 'add-route') {
        if (lfo.routes.length >= (window.LoomSchema.LIMITS.lfoRoutes || maxRoutes)) return;
        const state = this.getState(), preferred = state.tracks[state.selectedTrack]?.id;
        const used = new Set(lfo.routes.map(route => this.targetKey(route))), available = this.descriptors.filter(target => !used.has(target.key));
        const definition = available.find(target => target.ownerId === preferred && target.target === 'pan') || available.find(target => target.ownerId === preferred) || available[0]; if (!definition) return;
        this.remember(); const route = { id: window.LoomSchema.uid('lfo-route'), ownerId: definition.ownerId, target: definition.target, amount: .25, enabled: true }; if (definition.effectType) route.effectType = definition.effectType;
        lfo.routes.push(route); this.notify(); this.render(); this.element.querySelector(`[data-lfo-route="${route.id}"] [data-lfo-route-owner]`)?.focus({ preventScroll: true });
      } else if (action === 'remove-route') {
        const route = this.routeFor(event.target); if (!route) return;
        this.remember(); lfo.routes = lfo.routes.filter(item => item !== route); this.notify(); this.render(); this.element.querySelector('[data-lfo-action="add-route"]')?.focus({ preventScroll: true });
      } else if (action === 'reset') {
        const defaults = window.LoomSchema.defaultLFOs?.()[this.selected]; if (!defaults) return;
        this.remember(); this.getState().lfos[this.selected] = { ...defaults, enabled: lfo.enabled, routes: lfo.routes }; this.notify(); this.render(); this.status('LFO ' + (this.selected + 1) + ' motion reset. Its targets are retained.');
      }
    }
    change(event) {
      event.stopPropagation(); const input = event.target, lfo = this.lfo(); if (!lfo) return;
      const key = input.dataset.lfoField, numberKey = input.dataset.lfoNumber;
      if (numberKey) {
        const definition = definitions[numberKey], value = input.value.trim() ? Number(input.value) : NaN;
        if (Number.isFinite(value)) this.setField(numberKey, value / (definition.percent ? 100 : definition.degrees ? 360 : 1));
        input.value = fieldValue(definition, lfo[numberKey]); return;
      }
      if (key) {
        if (input.type === 'range') { this.ranges.delete(input); return; }
        const value = key === 'enabled' ? input.checked : key === 'sync' ? input.value === 'sync' : definitions[key] ? Number(input.value) : input.value;
        if (definitions[key] && !Number.isFinite(value)) return;
        this.setField(key, value); this.render(); return;
      }
      const route = this.routeFor(input); if (!route) return;
      if (input.hasAttribute('data-lfo-route-amount')) { this.ranges.delete(input); return; }
      if (input.hasAttribute('data-lfo-route-number')) { const value = input.value.trim() ? Number(input.value) / 100 : NaN; if (Number.isFinite(value)) this.setAmount(input, value); input.value = rounded(route.amount * 100); return; }
      if (input.hasAttribute('data-lfo-route-enabled')) { if (route.enabled !== input.checked) { this.remember(); route.enabled = input.checked; this.notify(); this.render(); } return; }
      let definition;
      if (input.hasAttribute('data-lfo-route-owner')) {
        const destination = this.lfos().find(item => item.id === input.value), available = this.descriptors.filter(target => target.ownerId === input.value && !lfo.routes.some(item => item !== route && this.targetKey(item) === target.key));
        definition = (destination ? available.find(target => target.target === (destination.sync ? 'division' : 'rate')) : null) || available[0];
      }
      else if (input.hasAttribute('data-lfo-route-target')) definition = this.descriptors.find(target => target.key === input.value);
      if (!definition || lfo.routes.some(item => item !== route && this.targetKey(item) === definition.key)) { this.render(); return; }
      if (this.targetKey(route) === definition.key && route.effectType === definition.effectType) return;
      this.remember(); route.ownerId = definition.ownerId; route.target = definition.target; delete route.gate; delete route.effectType; if (definition.effectType) route.effectType = definition.effectType; this.notify(); this.render();
    }
    input(event) {
      const input = event.target; if (input.type !== 'range') return;
      event.stopPropagation();
      const key = input.dataset.lfoField; if (!key && !input.hasAttribute('data-lfo-route-amount')) return;
      let gesture = this.ranges.get(input); if (!gesture) { gesture = { state: this.getState(), lfo: this.lfo(), remembered: false }; this.ranges.set(input, gesture); }
      if (key) this.setField(key, Number(input.value), gesture); else this.setAmount(input, Number(input.value), gesture);
    }
    pointerDown(event) {
      const element = event.target.closest('[data-lfo-knob]'); if (!element || event.button !== 0) return;
      event.preventDefault(); event.stopPropagation(); this.finishKeyboard();
      const key = element.dataset.lfoKnob, definition = definitions[key];
      this.drag = { element, key, state: this.getState(), lfo: this.lfo(), pointer: event.pointerId, y: event.clientY, position: normalized(definition, this.lfo()[key]), remembered: false };
      element.classList.add('is-adjusting'); element.focus({ preventScroll: true }); element.setPointerCapture(event.pointerId);
    }
    pointerMove(event) {
      const gesture = this.drag; if (!gesture || gesture.pointer !== event.pointerId) return;
      event.preventDefault(); event.stopPropagation(); if (!this.current(gesture)) { this.finishGesture(); this.render(); return; }
      const definition = definitions[gesture.key], delta = (gesture.y - event.clientY) / (event.shiftKey ? 1400 : 180), position = clamp(gesture.position + delta, 0, 1);
      let value = fromNormal(definition, position);
      if (gesture.key === 'division' && !event.shiftKey) value = divisions.reduce((best, item) => Math.abs(Math.log(item[0] / value)) < Math.abs(Math.log(best / value)) ? item[0] : best, divisions[0][0]);
      else value = Math.round(value / definition.step) * definition.step;
      this.setField(gesture.key, value, gesture);
    }
    pointerEnd(event) {
      if (!this.drag || event && this.drag.pointer !== event.pointerId) return;
      event?.stopPropagation(); this.finishGesture();
    }
    finishGesture() {
      const gesture = this.drag; this.drag = null;
      if (gesture) { gesture.element.classList.remove('is-adjusting'); if (gesture.element.hasPointerCapture?.(gesture.pointer)) gesture.element.releasePointerCapture(gesture.pointer); }
      this.finishKeyboard();
    }
    finishKeyboard() { const gesture = this.keyboard; this.keyboard = null; gesture?.element.classList.remove('is-adjusting'); }
    keydown(event) {
      const tab = event.target.closest('[data-lfo-select]');
      if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); this.selected = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (Number(tab.dataset.lfoSelect) + (event.key === 'ArrowRight' ? 1 : 3)) % 4; this.render(); this.element.querySelector(`[data-lfo-select="${this.selected}"]`)?.focus({ preventScroll: true }); return; }
      const element = event.target.closest('[data-lfo-knob]'); if (!element || event.ctrlKey || event.metaKey || event.altKey) return;
      const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Enter', ' ']; if (!keys.includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const key = element.dataset.lfoKnob, definition = definitions[key];
      if (!this.keyboard || this.keyboard.element !== element) { this.finishKeyboard(); this.keyboard = { element, key, state: this.getState(), lfo: this.lfo(), remembered: false }; element.classList.add('is-adjusting'); }
      if (!this.current(this.keyboard)) { this.finishKeyboard(); this.render(); return; }
      let value = this.lfo()[key];
      if (event.key === 'Home') value = definition.min;
      else if (event.key === 'End') value = definition.max;
      else if (event.key === 'Enter' || event.key === ' ') value = definition.default;
      else {
        const direction = ['ArrowDown', 'ArrowLeft', 'PageDown'].includes(event.key) ? -1 : 1, large = event.shiftKey || event.key.startsWith('Page');
        if (key === 'division') {
          const options = divisions.map(item => item[0]); value = direction > 0 ? options.find(item => item > value + .00001) ?? definition.max : options.slice().reverse().find(item => item < value - .00001) ?? definition.min;
        } else value += direction * definition.step * (large ? 10 : 1);
      }
      this.setField(key, value, this.keyboard);
    }
    tick() {
      if (!this.element.isConnected) return;
      if (this.stateRef !== this.getState() || this.lfosRef !== this.lfos()) { this.finishGesture(); this.ranges = new WeakMap(); this.render(); return; }
      const now = globalThis.performance?.now?.() || Date.now(); if (now - this.lastTick < 50) return; this.lastTick = now;
      if (this.topology !== this.topologyKey() && !this.drag && !this.keyboard) { this.render(); return; }
      const meters = this.getMeters()?.lfos, playing = !!this.getPlaying(), lfo = this.lfo(); if (!lfo) return;
      this.lfos().forEach((item, index) => {
        const phase = Number.isFinite(meters?.phases?.[index]) ? meters.phases[index] : 0, output = Number.isFinite(meters?.outputs?.[index]) ? meters.outputs[index] : 0;
        const dot = this.element.querySelector(`[data-lfo-mini-dot="${index}"]`); if (dot) { paintAttribute(dot, 'cx', clamp(phase, 0, 1) * 140); paintAttribute(dot, 'cy', 3 + (1 - clamp(output, -1, 1)) * 14); paintOpacity(dot, item.enabled && playing && !['hold', 'random'].includes(item.wave) ? '1' : '0'); }
      });
      const output = lfo.enabled && Number.isFinite(meters?.outputs?.[this.selected]) ? meters.outputs[this.selected] : 0, phase = Number.isFinite(meters?.phases?.[this.selected]) ? meters.phases[this.selected] : 0;
      const reading = this.element.querySelector('[data-lfo-output]'); if (reading) paintText(reading, (output >= 0 ? '+' : '') + output.toFixed(3));
      const needle = this.element.querySelector('[data-lfo-scope-phase]'); if (needle) { paintAttribute(needle, 'x1', clamp(phase, 0, 1) * 420); paintAttribute(needle, 'x2', clamp(phase, 0, 1) * 420); paintOpacity(needle, lfo.enabled && playing && !['hold', 'random'].includes(lfo.wave) ? '1' : '0'); }
      const running = this.element.querySelector('[data-lfo-running]'); if (running) paintText(running, !lfo.enabled ? 'Off · settings retained' : playing ? meters ? 'Live · sample clock' : 'Running' : 'Press Play to move');
      for (const row of this.element.querySelectorAll('[data-lfo-route]')) {
        const route = lfo.routes.find(item => item.id === row.dataset.lfoRoute), definition = route && this.routeDefinition(route), value = route && meters?.values?.[this.targetKey(route)], field = row.querySelector('[data-lfo-route-value]');
        if (!definition || !field) continue;
        const text = route.enabled === false ? 'Off' : Number.isFinite(value) && playing && lfo.enabled ? numberText(value) + (definition.unit ? ' ' + definition.unit : '') : 'Ready';
        if (field.textContent !== text) field.textContent = text;
        paintAttribute(field, 'title', definition.label + ' · ' + (Number.isFinite(value) && playing ? 'Current combined value' : 'Signed amount: ' + numberText(route.amount * 100) + '% of range'));
      }
    }
  }
  window.LoomLFOEditor = LoomLFOEditor;
})();
