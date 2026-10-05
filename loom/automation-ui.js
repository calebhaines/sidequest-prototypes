/* GALLEY automation. A line may wander; its coordinates remain quite sensible. */
(() => {
  'use strict';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const round = v => Math.round(v * 1000000) / 1000000;
  const stamp = () => globalThis.performance?.now?.() ?? Date.now();

  class LoomAutomationEditor {
    constructor({ element, getState, getTrack, getBeat, getPlaying = () => false, remember = () => {}, onChange = () => {}, status = () => {} }) {
      this.element = element; this.getState = getState; this.getTrack = getTrack; this.getBeat = getBeat; this.getPlaying = getPlaying;
      this.remember = remember; this.onChange = onChange; this.status = status;
      this.target = 'level'; this.point = -1; this.write = false; this.zoom = 24; this.fitMode = true; this.snap = null; this.trackId = null;
      this.drag = null; this.captures = new Map(); this.writeBaselines = new Map(); this.drawFrame = 0; this.lastPlaying = null;
      element.classList.add('automation-editor', 'panel');
      element.addEventListener('click', e => this.click(e));
      element.addEventListener('change', e => this.change(e));
      element.addEventListener('pointerdown', e => this.pointerDown(e));
      element.addEventListener('pointermove', e => this.pointerMove(e));
      element.addEventListener('pointerup', e => this.pointerEnd(e));
      element.addEventListener('pointercancel', e => this.pointerEnd(e));
      element.addEventListener('keydown', e => this.keydown(e));
      this.resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.draw()) : null;
      this.resizeObserver?.observe(element);
      this.render();
    }
    track() { const t = this.getTrack(); return typeof t === 'number' ? this.getState().tracks[t] : t; }
    targets() { return window.LoomSchema.automationTargets(this.track()); }
    lanes() { return this.track().automation ||= []; }
    definition(target = this.target) { return this.targets().find(d => d.target === target); }
    lane(target = this.target) { const d = this.definition(target); return this.lanes().find(l => l.target === target && (!d?.effectType || l.effectType === d.effectType)); }
    beats() { return this.getState().lengthBars * 4; }
    value(d) { return Number.isFinite(d?.value) ? d.value : d?.default ?? 0; }
    label(d, value) {
      if (!d || !Number.isFinite(value)) return '—';
      if (d.target === 'level') return value <= 0 ? '−∞ dB' : (20 * Math.log10(value)).toFixed(1) + ' dB';
      if (d.target === 'pan') return Math.abs(value) < .005 ? 'Center' : Math.round(Math.abs(value) * 100) + '% ' + (value < 0 ? 'L' : 'R');
      const precision = d.step >= 1 ? 0 : d.step >= .1 ? 1 : d.step >= .01 ? 2 : 3;
      return value.toFixed(precision) + (d.unit ? ' ' + d.unit : '');
    }
    formatBeat(beat) { return Math.floor(beat / 4) + 1 + '.' + (Math.floor(beat % 4) + 1); }
    normalizePoint(point, d, snapped = true) {
      const snap = this.snap ?? this.getState().view?.snap ?? .25;
      let beat = clamp(point.beat, 0, this.beats());
      if (snapped && snap) beat = clamp(Math.round(beat / snap) * snap, 0, this.beats());
      const step = d.step || .001;
      return { beat: round(beat), value: round(clamp(Math.round(point.value / step) * step, d.min, d.max)) };
    }
    putPoint(lane, point) {
      const same = lane.points.findIndex(p => Math.abs(p.beat - point.beat) < .00001);
      if (same >= 0) lane.points[same] = point;
      else {
        if (lane.points.length >= (window.LoomSchema.LIMITS.automationPoints || 4096)) { this.status('This lane has reached its point limit. Clear or remove some points before adding more.'); return -1; }
        lane.points.push(point);
      }
      lane.points.sort((a, b) => a.beat - b.beat);
      return lane.points.indexOf(point);
    }
    createLane(d, initial = true) {
      if (this.lanes().length >= (window.LoomSchema.LIMITS.automationLanes || 64)) { this.status('This track has reached its automation lane limit.'); return null; }
      const lane = { target: d.target, enabled: true, interpolation: 'linear', points: initial ? [{ beat: 0, value: this.value(d) }] : [] };
      if (d.effectType) lane.effectType = d.effectType;
      this.lanes().push(lane); return lane;
    }
    notify() { this.onChange({ automation: true }); }
    render() {
      if (this.drag) return;
      const state = this.getState(), track = this.track(); if (!track) return;
      if (this.trackId !== track.id) { this.trackId = track.id; this.point = -1; this.write = false; this.captures.clear(); this.writeBaselines.clear(); }
      const targets = this.targets(), lanes = this.lanes();
      if (!targets.some(d => d.target === this.target)) { this.target = targets[0]?.target || 'level'; this.point = -1; }
      const lane = this.lane(), d = this.definition(), playing = !!this.getPlaying();
      if (this.point >= (lane?.points.length || 0)) this.point = -1;
      const scroll = this.element.querySelector('.auto-canvas-scroll')?.scrollLeft || 0;
      const active = document.activeElement?.closest?.('[data-auto-field]');
      const focus = active && this.element.contains(active) ? active.dataset.autoField : null;
      this.element.innerHTML = `<div class="panel-heading auto-heading"><div><h2><span class="section-number">↝</span>Automation</h2><p class="auto-subtitle">Timed instructions for equipment with opinions.</p></div><div class="auto-heading-right"><span class="auto-track">TRACK ${String(state.selectedTrack + 1).padStart(2, '0')} · ${escape(track.name)}</span><button type="button" class="auto-write ${this.write ? 'armed' : ''}" data-auto-action="write" aria-pressed="${this.write}" title="Record selected-track mixer and effect movements while playback runs"><i></i>Write</button></div></div>
        <div class="auto-layout"><div class="auto-lane-panel"><label class="auto-target-label" for="loomAutoTarget">PARAMETER</label><div class="auto-target-row"><select id="loomAutoTarget" data-auto-field="target" aria-label="Automation parameter">${targets.map(t => `<option value="${escape(t.target)}" ${t.target === this.target ? 'selected' : ''}>${escape(t.label)}</option>`).join('')}</select><button type="button" data-auto-action="add" aria-label="Add automation lane" title="Add a lane for this parameter" ${lane ? 'disabled' : ''}>+</button></div><div class="auto-lane-list" role="group" aria-label="Automation lanes">${lanes.length ? lanes.map(l => { const ld = targets.find(t => t.target === l.target && (!t.effectType || t.effectType === l.effectType)); return `<button type="button" class="auto-lane ${l === lane ? 'selected' : ''} ${l.enabled ? '' : 'disabled-lane'}" data-auto-lane="${escape(l.target)}" ${ld ? '' : 'disabled'} aria-pressed="${l === lane}"><i></i><span>${escape(ld?.label || 'Unavailable parameter')}<small>${l.points.length} point${l.points.length === 1 ? '' : 's'} · ${l.enabled ? 'Read' : 'Off'}</small></span><span class="auto-lane-arrow">↗</span></button>`; }).join('') : '<div class="auto-no-lanes"><span>↝</span><p>Add a lane to draw how a sound changes through the piece.</p></div>'}</div><p class="auto-write-hint" data-auto-write-hint>${this.write ? playing ? 'Writing mixer and effect movements during playback.' : 'Write armed. Press Play, then move a mixer or effect control.' : 'Draw points, or arm Write and move controls during playback.'}</p></div>
        <div class="auto-curve-panel"><div class="auto-curve-tools"><div class="auto-lane-title"><strong>${escape(d?.label || 'Automation')}</strong><output data-auto-live-value>${this.label(d, window.LoomSchema.automationValue(lane, this.getBeat() || 0, this.value(d)))}</output></div><div class="auto-curve-options"><label class="auto-read"><input type="checkbox" data-auto-field="enabled" ${lane?.enabled ? 'checked' : ''} ${lane ? '' : 'disabled'}>Read</label><select data-auto-field="interpolation" aria-label="Automation interpolation" ${lane ? '' : 'disabled'}><option value="linear" ${lane?.interpolation !== 'hold' ? 'selected' : ''}>Linear</option><option value="hold" ${lane?.interpolation === 'hold' ? 'selected' : ''}>Hold</option></select><label>SNAP<select data-auto-field="snap" aria-label="Automation point snap">${[[0,'Off'],[.0625,'1/64'],[.125,'1/32'],[.25,'1/16'],[.5,'1/8'],[1,'Beat'],[4,'Bar']].map(([v,l]) => `<option value="${v}" ${v === (this.snap ?? state.view?.snap ?? .25) ? 'selected' : ''}>${l}</option>`).join('')}</select></label><button type="button" data-auto-action="fit" title="Fit the complete arrangement">Fit</button><button type="button" data-auto-action="zoom-out" aria-label="Zoom automation out">−</button><button type="button" data-auto-action="zoom-in" aria-label="Zoom automation in">+</button></div></div><div class="auto-canvas-scroll"><svg class="auto-canvas" tabindex="0" role="group" aria-label="${escape(d?.label)} automation. Click to add a point; drag points to edit. Press Enter to add at the playhead."></svg></div><div class="auto-point-editor"></div><div class="auto-curve-footer"><span>Click to add · drag to shape · arrows to adjust · Delete to remove</span><div><button type="button" data-auto-action="clear" ${lane?.points.length ? '' : 'disabled'}>Clear points</button><button type="button" data-auto-action="remove" ${lane ? '' : 'disabled'}>Remove lane</button></div></div></div></div>`;
      this.draw(); this.renderPoint(); this.tick();
      const scroller = this.element.querySelector('.auto-canvas-scroll'); if (scroller) scroller.scrollLeft = scroll;
      if (focus) this.element.querySelector(`[data-auto-field="${focus}"]`)?.focus({ preventScroll: true });
    }
    metrics() {
      const viewport = this.element.querySelector('.auto-canvas-scroll')?.clientWidth || 620;
      if (this.fitMode) this.zoom = clamp((viewport-66)/this.beats(), .25, 96);
      const width = Math.max(viewport, this.beats() * this.zoom + 66);
      return { width, viewport, height: 232, left: 46, top: 32, bottom: 196, plot: width - 66, ppb: (width - 66) / this.beats() };
    }
    draw() {
      const svg = this.element.querySelector('.auto-canvas'); if (!svg) return;
      const m = this.metrics(), d = this.definition(), lane = this.lane(); if (!d) return;
      const x = beat => m.left + beat * m.ppb, y = value => m.bottom - (value - d.min) / (d.max - d.min || 1) * (m.bottom - m.top);
      const total = this.beats(), stride = m.ppb < 2 ? 64 : m.ppb < 4 ? 32 : m.ppb < 8 ? 16 : m.ppb < 16 ? 8 : 4, grid = [];
      for (let beat = 0; beat <= total; beat += stride) grid.push(`<line class="auto-bar-line" x1="${x(beat)}" x2="${x(beat)}" y1="25" y2="${m.bottom}"/><text class="auto-bar-label" x="${x(beat) + 5}" y="17">${String(Math.floor(beat / 4) + 1).padStart(2, '0')}</text>`);
      if (m.ppb >= 24) for (let beat = 1; beat < total; beat++) if (beat % 4) grid.push(`<line class="auto-beat-line" x1="${x(beat)}" x2="${x(beat)}" y1="25" y2="${m.bottom}"/>`);
      for (let row = 0; row < 5; row++) { const yy = m.top + (m.bottom - m.top) * row / 4; grid.push(`<line class="auto-value-line" x1="${m.left}" x2="${m.width}" y1="${yy}" y2="${yy}"/>`); }
      if (d.min < 0 && d.max > 0) grid.push(`<line class="auto-zero-line" x1="${m.left}" x2="${m.width}" y1="${y(0)}" y2="${y(0)}"/>`);
      let path = '', fill = '';
      if (lane?.points.length) {
        const points = lane.points; path = `M${x(0)},${y(points[0].value)}`;
        for (let i = 0; i < points.length; i++) path += lane.interpolation === 'hold' ? `H${x(points[i].beat)}V${y(points[i].value)}` : `L${x(points[i].beat)},${y(points[i].value)}`;
        path += `H${x(total)}`; fill = path + `L${x(total)},${m.bottom}L${x(0)},${m.bottom}Z`;
      }
      const loop = this.getState().loopEnabled ? `<rect class="auto-loop-area" x="${x(this.getState().loopStart)}" y="25" width="${Math.max(0,(this.getState().loopEnd-this.getState().loopStart)*m.ppb)}" height="${m.bottom-25}"/>` : '';
      svg.setAttribute('width', m.width); svg.setAttribute('height', m.height); svg.setAttribute('viewBox', `0 0 ${m.width} ${m.height}`);
      svg.innerHTML = `<defs><linearGradient id="loomAutoFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ff8d45" stop-opacity=".16"/><stop offset="1" stop-color="#ff8d45" stop-opacity="0"/></linearGradient></defs>${loop}${grid.join('')}<text class="auto-axis" x="7" y="${m.top + 4}">${escape(this.axisLabel(d,d.max))}</text><text class="auto-axis" x="7" y="${m.bottom + 3}">${escape(this.axisLabel(d,d.min))}</text>${path ? `<path class="auto-area" d="${fill}"/><path class="auto-curve ${lane.enabled ? '' : 'inactive'}" d="${path}"/>${lane.points.map((p,i) => `<g class="auto-point ${i === this.point ? 'selected' : ''}" data-auto-point="${i}" tabindex="0" role="slider" aria-label="Point ${i+1}, beat ${(p.beat+1).toFixed(3)}" aria-valuemin="${d.min}" aria-valuemax="${d.max}" aria-valuenow="${p.value}" aria-valuetext="${escape(this.label(d,p.value))}, beat ${p.beat+1}"><circle class="auto-point-hit" cx="${x(p.beat)}" cy="${y(p.value)}" r="12"/><circle class="auto-point-dot" cx="${x(p.beat)}" cy="${y(p.value)}" r="${i === this.point ? 5 : 3.5}"/></g>`).join('')}` : `<path class="auto-ghost-curve" d="M${x(0)},135 C${x(total*.18)},135 ${x(total*.2)},70 ${x(total*.34)},70 S${x(total*.52)},159 ${x(total*.66)},159 S${x(total*.83)},106 ${x(total)},106"/><text class="auto-empty-title" x="${Math.min(m.width/2,m.viewport/2)}" y="102" text-anchor="middle">${lane ? 'The timer awaits its first instruction.' : 'Give this parameter a little movement.'}</text><text class="auto-empty-caption" x="${Math.min(m.width/2,m.viewport/2)}" y="126" text-anchor="middle">${lane ? 'Click anywhere to place a point.' : 'Click the graph or + to add a lane.'}</text>`}<line class="auto-playhead" data-auto-playhead x1="${x(this.getBeat()||0)}" x2="${x(this.getBeat()||0)}" y1="25" y2="${m.bottom}"/><text class="auto-time-label" x="${m.left}" y="221">BARS / BEATS</text>`;
    }
    axisLabel(d, value) { if (d.target === 'level') return Math.round(value*100)+'%'; if (d.target === 'pan') return value < 0 ? 'L' : 'R'; if(Math.abs(value)>=1000)return round(value/1000)+'k'; return round(value); }
    renderPoint() {
      const holder = this.element.querySelector('.auto-point-editor'), lane = this.lane(), point = lane?.points[this.point], d = this.definition(); if (!holder) return;
      holder.innerHTML = point ? `<span class="auto-point-caption">POINT ${String(this.point+1).padStart(2,'0')}</span><label>BEAT<input type="number" data-auto-field="point-beat" min="1" max="${this.beats()+1}" step=".001" value="${round(point.beat+1)}" aria-label="Selected automation point beat"></label><label>VALUE${d.unit ? ' ('+escape(d.unit)+')' : ''}<input type="number" data-auto-field="point-value" min="${d.min}" max="${d.max}" step="${d.step || .001}" value="${point.value}" aria-label="Selected automation point value"></label><output>${this.label(d,point.value)}</output><button type="button" data-auto-action="delete-point">Delete point</button>` : '<span class="auto-point-caption">POINT EDITOR</span><p>Select a point to enter its exact beat and value.</p>';
    }
    tick() {
      if (!this.element.isConnected) return;
      const track = this.track(); if (track && track.id !== this.trackId) { this.render(); return; }
      const beat = clamp(this.getBeat() || 0, 0, this.beats()), m = this.metrics(), line = this.element.querySelector('[data-auto-playhead]');
      if (line) { const x = m.left + beat*m.ppb; line.setAttribute('x1', x); line.setAttribute('x2', x); }
      const d = this.definition(), out = this.element.querySelector('[data-auto-live-value]'); if (out && d) out.textContent = this.label(d, window.LoomSchema.automationValue(this.lane(), beat, this.value(d)));
      const playing = !!this.getPlaying(); this.element.classList.toggle('is-writing', this.write && playing);
      if (playing !== this.lastPlaying) { this.lastPlaying = playing; if (!playing) this.captures.clear(); const hint = this.element.querySelector('[data-auto-write-hint]'); if (hint) hint.textContent = this.write ? playing ? 'Writing mixer and effect movements during playback.' : 'Write armed. Press Play, then move a mixer or effect control.' : 'Draw points, or arm Write and move controls during playback.'; }
    }
    click(e) {
      const laneButton = e.target.closest('[data-auto-lane]'); if (laneButton) { this.target = laneButton.dataset.autoLane; this.point = -1; this.render(); return; }
      const action = e.target.closest('[data-auto-action]')?.dataset.autoAction; if (!action) return;
      if (action === 'write') { this.write = !this.write; this.captures.clear(); this.writeBaselines = new Map(this.targets().map(d=>[d.target,this.value(d)])); this.lastPlaying = null; this.render(); this.status(this.write ? 'Automation Write armed for the selected track. Press Play and move mixer or effect controls.' : 'Automation Write disarmed. Existing lanes still play when Read is enabled.'); return; }
      if (action === 'fit' || action.startsWith('zoom-')) { const scroll = this.element.querySelector('.auto-canvas-scroll'); this.fitMode = action === 'fit'; this.zoom = action === 'fit' ? clamp(((scroll?.clientWidth || 620)-66)/this.beats(),.25,96) : clamp(this.zoom * (action === 'zoom-in' ? 1.5 : 1/1.5),.25,96); this.draw(); this.tick(); return; }
      const lane = this.lane(), d = this.definition();
      if (action === 'add' && !lane && d) { this.remember(); this.createLane(d); this.point = 0; this.notify(); this.render(); return; }
      if (!lane) return;
      if (action === 'delete-point') { this.deletePoint(); return; }
      if (action === 'clear' && lane.points.length) { this.remember(); lane.points = []; this.point = -1; this.notify(); this.render(); this.element.querySelector('.auto-canvas')?.focus({preventScroll:true}); return; }
      if (action === 'remove') { this.remember(); this.track().automation = this.lanes().filter(l => l !== lane); this.point = -1; this.notify(); this.render(); this.element.querySelector('[data-auto-field="target"]')?.focus({preventScroll:true}); }
    }
    change(e) {
      const field = e.target.dataset.autoField; if (!field) return;
      if (field === 'target') { this.target = e.target.value; this.point = -1; this.render(); return; }
      if (field === 'snap') { this.snap = Number(e.target.value); return; }
      const lane = this.lane(), d = this.definition(); if (!lane || !d) return;
      if (field === 'enabled' || field === 'interpolation') { this.remember(); lane[field] = field === 'enabled' ? e.target.checked : e.target.value; this.notify(); this.render(); return; }
      const point = lane.points[this.point]; if (!point || !['point-beat','point-value'].includes(field) || !Number.isFinite(Number(e.target.value))) return;
      this.remember(); const updated = this.normalizePoint({ beat: field === 'point-beat' ? Number(e.target.value)-1 : point.beat, value: field === 'point-value' ? Number(e.target.value) : point.value }, d, false);
      lane.points.splice(this.point, 1); this.point = this.putPoint(lane, updated); this.notify(); this.draw(); this.renderPoint(); this.element.querySelector(`[data-auto-field="${field}"]`)?.focus({preventScroll:true});
    }
    coordinate(e) { const svg = this.element.querySelector('.auto-canvas'), rect = svg.getBoundingClientRect(), m = this.metrics(), d = this.definition(); return this.normalizePoint({ beat:(e.clientX-rect.left-m.left)/m.ppb, value:d.max-(e.clientY-rect.top-m.top)/(m.bottom-m.top)*(d.max-d.min) },d); }
    pointerDown(e) {
      if (e.button !== 0 || !e.target.closest('.auto-canvas') || !this.definition()) return;
      e.preventDefault(); e.stopPropagation();
      const d = this.definition(), existing = this.lane(), pointElement = e.target.closest('[data-auto-point]');
      if (!pointElement) this.remember(); const lane = existing || this.createLane(d, false); if (!lane) return;
      let selected = pointElement ? Number(pointElement.dataset.autoPoint) : this.putPoint(lane,this.coordinate(e)); if (selected < 0) return;
      this.point = selected;
      this.drag = { pointer: e.pointerId, lane, track: this.track(), point: lane.points[selected], moved: !pointElement, remembered: !pointElement, lastNotify: stamp() };
      this.element.setPointerCapture(e.pointerId); this.draw(); this.renderPoint();
      if (!existing) { const add = this.element.querySelector('[data-auto-action="add"]'); if(add)add.disabled=true; }
    }
    pointerMove(e) {
      if (!this.drag || e.pointerId !== this.drag.pointer) return;
      e.preventDefault(); const drag = this.drag, point = this.coordinate(e);
      if (Math.abs(point.beat-drag.point.beat)<.000001 && Math.abs(point.value-drag.point.value)<.000001) return;
      if (!drag.remembered) { this.remember(); drag.remembered = true; }
      const collision = drag.lane.points.findIndex(p => p !== drag.point && Math.abs(p.beat-point.beat)<.00001);
      if (collision >= 0) drag.lane.points.splice(collision,1);
      drag.point.beat = point.beat; drag.point.value = point.value; drag.lane.points.sort((a,b)=>a.beat-b.beat); this.point = drag.lane.points.indexOf(drag.point); drag.moved = true;
      this.queueDraw();
      if (stamp()-drag.lastNotify > 90) { drag.lastNotify = stamp(); this.notify(); }
    }
    pointerEnd(e) {
      if (!this.drag || e.pointerId !== this.drag.pointer) return;
      const pointer = this.drag.pointer, moved = this.drag.moved; this.drag = null; if(this.element.hasPointerCapture(pointer))this.element.releasePointerCapture(pointer);
      if (this.drawFrame) { cancelAnimationFrame(this.drawFrame); this.drawFrame = 0; }
      if(moved)this.notify(); this.render(); this.element.querySelector(`[data-auto-point="${this.point}"]`)?.focus({preventScroll:true});
    }
    queueDraw() { if(this.drawFrame)return; this.drawFrame = requestAnimationFrame(()=>{this.drawFrame=0;this.draw();this.renderPoint();}); }
    deletePoint() {
      const lane = this.lane(); if(!lane || this.point < 0 || !lane.points[this.point])return;
      this.remember(); lane.points.splice(this.point,1); this.point = Math.min(this.point,lane.points.length-1); this.notify(); this.render(); (this.element.querySelector(`[data-auto-point="${this.point}"]`)||this.element.querySelector('.auto-canvas'))?.focus({preventScroll:true});
    }
    keydown(e) {
      if (!e.target.closest('.auto-canvas')) return;
      const pointElement = e.target.closest('[data-auto-point]'), lane = this.lane(), d = this.definition(); if (!d) return;
      if (pointElement) this.point = Number(pointElement.dataset.autoPoint);
      if (e.key === 'Enter' && !pointElement) { e.preventDefault();e.stopPropagation();this.remember();const l=lane||this.createLane(d,false);if(!l)return;this.point=this.putPoint(l,this.normalizePoint({beat:this.getBeat()||0,value:window.LoomSchema.automationValue(l,this.getBeat()||0,this.value(d))},d));this.notify();this.render();this.element.querySelector(`[data-auto-point="${this.point}"]`)?.focus({preventScroll:true});return; }
      if (!pointElement || !lane?.points[this.point]) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); this.deletePoint(); return; }
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
      e.preventDefault();e.stopPropagation(); const p = lane.points[this.point], step = this.snap ?? this.getState().view?.snap ?? .25, coarse = e.shiftKey ? 4 : 1;
      this.remember(); const next = this.normalizePoint({beat:p.beat+(['ArrowLeft','ArrowRight'].includes(e.key)?(e.key==='ArrowLeft'?-1:1)*(step||.0625)*coarse:0),value:p.value+(['ArrowDown','ArrowUp'].includes(e.key)?(e.key==='ArrowDown'?-1:1)*(d.step||.01)*coarse:0)},d,false);
      lane.points.splice(this.point,1);this.point=this.putPoint(lane,next);this.notify();this.draw();this.renderPoint();this.element.querySelector(`[data-auto-point="${this.point}"]`)?.focus({preventScroll:true});
    }
    capture(target, value, { remembered = false } = {}) {
      if (!this.write || !this.getPlaying() || !Number.isFinite(value)) return false;
      const track = this.track(); if (track.id !== this.trackId) { this.render(); return false; }
      const d = this.definition(target); if (!d) return false;
      const now = stamp(), beat = clamp(this.getBeat() || 0,0,this.beats()), previous = this.captures.get(target), fresh = !previous || now-previous.lastInput > 500;
      const coalesced = previous && !fresh && now-previous.time < 35 && Math.abs(beat-previous.beat) < .125;
      if (!remembered && fresh) this.remember();
      let lane = this.lane(target); const created = !lane;
      const baseline = this.writeBaselines.get(target) ?? this.value(d), oldValue = window.LoomSchema.automationValue(lane,beat,baseline);
      if(!lane)lane=this.createLane(d,false);if(!lane)return false;
      if(created)this.putPoint(lane,{beat:0,value:baseline});
      if(fresh&&beat>.015625)this.putPoint(lane,{beat:round(beat-.015625),value:oldValue});
      lane.enabled = true;
      const point = this.normalizePoint({beat:coalesced?previous.beat:beat,value},d,false);
      if (previous && !fresh) {
        const state = this.getState(), wrapped = state.loopEnabled && beat < previous.beat-.125;
        if(wrapped){this.putPoint(lane,{beat:state.loopEnd,value:previous.value});this.putPoint(lane,{beat:state.loopStart,value:point.value});}
        else if(beat>=previous.beat && beat-previous.beat<2)lane.points=lane.points.filter(p=>p.beat<=previous.beat||p.beat>=point.beat);
      }
      const index = this.putPoint(lane,point);if(index<0)return false;
      this.captures.set(target,{time:coalesced?previous.time:now,lastInput:now,beat:point.beat,value:point.value});
      if(created)this.render();
      for(const button of this.element.querySelectorAll('[data-auto-lane]'))if(button.dataset.autoLane===target){button.classList.remove('disabled-lane');const count=button.querySelector('small');if(count)count.textContent=lane.points.length+' point'+(lane.points.length===1?'':'s')+' · Read';}
      if(this.target===target){const read=this.element.querySelector('[data-auto-field="enabled"]');if(read)read.checked=true;}
      if(this.target===target){this.point=index;this.queueDraw();}
      this.notify(); return true;
    }
    disarm() { this.write = false; this.captures.clear(); this.writeBaselines.clear(); this.lastPlaying = null; this.render(); }
  }
  window.LoomAutomationEditor = LoomAutomationEditor;
})();
