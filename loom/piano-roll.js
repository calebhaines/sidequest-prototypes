/* LOOM piano roll. Notes are little windows, with quite ordinary coordinates. */
(() => {
  'use strict';
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const round = value => Math.round(value * 1000000) / 1000000;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const pitchName = pitch => ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][pitch % 12] + (Math.floor(pitch / 12) - 1);
  const black = pitch => [1, 3, 6, 8, 10].includes(pitch % 12);
  const MIN_DURATION = 1 / 1024;
  class LoomPianoRollEditor {
    constructor({ element, getState, getClip, remember = () => {}, onChange = () => {}, status = () => {}, onAudition = () => {}, getBeat = () => 0, getVoices = () => [] }) {
      this.element = element; this.getState = getState; this.getClip = getClip; this.remember = remember; this.onChange = onChange; this.status = status; this.onAudition = onAudition; this.getBeat = getBeat; this.getVoices = getVoices;
      this.selected = new Set(); this.clipId = null; this.voice = null; this.mode = 'piano'; this.tool = 'draw'; this.pan = false; this.snap = .25; this.duration = .5; this.velocity = .8; this.zoom = 52; this.fitMode = true; this.lowPitch = 48; this.highPitch = 83; this.drag = null; this.copyBuffer = []; this.opened = false; this.frame = 0;
      element.classList.add('piano-roll-panel');
      element.addEventListener('click', event => this.click(event));
      element.addEventListener('change', event => this.change(event));
      element.addEventListener('pointerdown', event => this.pointerDown(event));
      element.addEventListener('pointermove', event => this.pointerMove(event));
      element.addEventListener('pointerup', event => this.pointerEnd(event));
      element.addEventListener('pointercancel', event => this.pointerEnd(event));
      element.addEventListener('keydown', event => this.keydown(event));
      element.addEventListener('scroll', event => { if (event.target.matches?.('.piano-canvas-scroll')) this.pinAxes(); }, true);
      element.addEventListener('contextmenu', event => { const note = event.target.closest('[data-piano-note]'); if (note) { event.preventDefault(); this.selected = new Set([note.dataset.pianoNote]); this.deleteSelected(); } });
      this.resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!element.hidden) this.draw(); }) : null;
      this.resizeObserver?.observe(element);
    }
    location() { const location = this.getClip(); return location?.clip?.type === 'notes' ? location : null; }
    clip() { return this.location()?.clip; }
    pattern() { return this.clip()?.pattern; }
    targetVoices() { try { const voices = this.getVoices(this.location()?.trackIndex); return Array.isArray(voices) ? voices.slice(0, 256) : []; } catch { return []; } }
    open() { if (!this.location()) return; this.opened = true; this.element.hidden = false; this.render(); this.element.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' }); }
    close() { this.opened = false; this.element.hidden = true; this.drag = null; this.element.classList.remove('is-panning'); }
    notify() { this.onChange({ notes: true, arrangement: true, inspector: true }); }
    noteSelection() { return (this.pattern()?.notes || []).filter(note => this.selected.has(note.id)); }
    fitPitches() {
      const notes = this.pattern()?.notes || [], pitches = notes.map(note => note.pitch);
      const min = pitches.length ? Math.min(...pitches) : 60, max = pitches.length ? Math.max(...pitches) : 72;
      this.lowPitch = clamp(Math.floor((min - 5) / 12) * 12, 0, 92); this.highPitch = clamp(Math.max(this.lowPitch + 35, max + 5), this.lowPitch + 11, 127);
    }
    render() {
      if (this.drag) return;
      const location = this.location();
      if (!location) { this.element.hidden = true; this.clipId = null; this.selected.clear(); return; }
      if (!this.opened) { this.element.hidden = true; return; }
      const clip = location.clip, pattern = clip.pattern, state = this.getState(), instrument = state.tracks[location.trackIndex]?.instrument;
      if (this.clipId !== clip.id) { this.clipId = clip.id; this.selected.clear(); this.voice = pattern.voices[0]?.id; this.pan = false; this.mode = pattern.kind === 'drums' ? 'drums' : ['notes', 'melodic'].includes(pattern.kind) ? 'piano' : pattern.voices.length > 1 && pattern.voices.some(voice => voice.pitch !== undefined) ? 'drums' : 'piano'; this.fitMode = true; this.fitPitches(); }
      this.selected = new Set([...this.selected].filter(id => pattern.notes.some(note => note.id === id)));
      if (!pattern.voices.some(voice => voice.id === this.voice)) this.voice = pattern.voices[0]?.id;
      const scroller = this.element.querySelector('.piano-canvas-scroll'), scroll = { x: scroller?.scrollLeft || 0, y: scroller?.scrollTop || 0 }, active = document.activeElement?.closest?.('[data-piano-field]'), focus = active && this.element.contains(active) ? active.dataset.pianoField : null;
      this.element.innerHTML = `<div class="panel-heading piano-heading"><div><h2><span class="section-number">♫</span>The notes have gathered.</h2><p class="piano-subtitle">A score with several quite reasonable escape routes.</p></div><div class="piano-heading-right"><span>TRACK ${String(location.trackIndex + 1).padStart(2, '0')} · ${escape(instrument?.name || 'Choose a track instrument')}</span><button type="button" data-piano-action="close" aria-label="Close piano roll">×</button></div></div>
      <div class="piano-tools"><label>VIEW<select data-piano-field="mode" aria-label="Note editor view"><option value="piano" ${this.mode === 'piano' ? 'selected' : ''}>Piano roll</option><option value="drums" ${this.mode === 'drums' ? 'selected' : ''}>Voice lanes</option></select></label><label>SOURCE VOICE<select data-piano-field="voice" aria-label="New note source voice">${pattern.voices.map(voice => `<option value="${escape(voice.id)}" ${voice.id === this.voice ? 'selected' : ''}>${escape(voice.name)}</option>`).join('')}</select></label><label>PATTERN BEATS<input type="number" data-piano-field="length" value="${pattern.lengthBeats}" min=".25" max="256" step=".25" aria-label="Pattern length in beats"></label><label>SNAP<select data-piano-field="snap" aria-label="Piano roll grid snap">${[[0,'Off'],[.0625,'1/64'],[.125,'1/32'],[.25,'1/16'],[.5,'1/8'],[1,'Beat'],[4,'Bar']].map(([value, name]) => `<option value="${value}" ${value === this.snap ? 'selected' : ''}>${name}</option>`).join('')}</select></label><label>NEW DURATION<input type="number" data-piano-field="new-duration" min=".015625" max="256" step=".0625" value="${this.duration}" aria-label="New note duration in beats"></label><div class="piano-tool-buttons"><button type="button" data-piano-action="tool" aria-pressed="${this.tool === 'select'}" title="Selection tool: drag a box, or Shift-click notes">${this.tool === 'select' ? '▧ Select' : '✎ Draw'}</button><button type="button" data-piano-action="pan" aria-pressed="${this.pan}" title="Pan the score without editing notes (P when the grid has focus)">✥ Pan</button><button type="button" data-piano-action="fit">Fit</button><button type="button" data-piano-action="octave-down" aria-label="Show lower octave">↓ octave</button><button type="button" data-piano-action="octave-up" aria-label="Show higher octave">↑ octave</button><button type="button" class="piano-zoom" data-piano-action="zoom-out" aria-label="Zoom notes out">−</button><button type="button" class="piano-zoom" data-piano-action="zoom-in" aria-label="Zoom notes in">+</button></div></div>
      <div class="piano-canvas-scroll"><svg class="piano-canvas ${this.pan ? 'piano-pan' : ''}" tabindex="0" role="group" aria-label="Piano roll. Click to add a note, drag to move, pull its right edge to resize. Shift-click for multiple notes; arrow keys move selection; Delete removes notes. Press P to toggle Pan, then drag to scroll without editing."></svg></div><div class="piano-note-editor"></div><div class="piano-mapping"></div><div class="piano-footer"><span>${this.pan ? 'Pan mode · drag to scroll · press P or Pan to return to drawing' : 'Click to add · drag to move · pull edge to resize · Shift-click to select more · right-click to delete'}</span><div><button type="button" data-piano-action="add">+ Note</button><button type="button" data-piano-action="select-all">Select all</button><button type="button" data-piano-action="quantize">Quantize</button><button type="button" data-piano-action="duplicate">Duplicate</button><button type="button" data-piano-action="delete">Delete notes</button></div></div>`;
      this.draw(); this.renderSelection(); this.renderMapping(); this.tick();
      const nextScroll = this.element.querySelector('.piano-canvas-scroll'); nextScroll.scrollLeft = scroll.x; nextScroll.scrollTop = scroll.y;
      this.pinAxes();
      if (focus) this.element.querySelector(`[data-piano-field="${focus}"]`)?.focus({ preventScroll: true });
    }
    metrics() {
      const pattern = this.pattern(), viewport = this.element.querySelector('.piano-canvas-scroll')?.clientWidth || 600, left = this.mode === 'drums' ? 115 : 54;
      if (this.fitMode) this.zoom = clamp((viewport - left - 18) / (pattern?.lengthBeats || 4), 1, 110);
      const ppb = this.zoom, width = Math.max(viewport, left + (pattern?.lengthBeats || 4) * ppb + 18), rowHeight = this.mode === 'drums' ? 31 : 18, rows = this.mode === 'drums' ? (pattern?.voices.length || 1) : this.highPitch - this.lowPitch + 1;
      return { width, viewport, left, top: 27, ppb, rowHeight, rows, height: 27 + rows * rowHeight + 1 };
    }
    rowFor(note) { return this.mode === 'drums' ? this.pattern().voices.findIndex(voice => voice.id === note.voice) : this.highPitch - note.pitch; }
    draw() {
      const svg = this.element.querySelector('.piano-canvas'), pattern = this.pattern(); if (!svg || !pattern) return;
      const m = this.metrics(), x = beat => m.left + beat * m.ppb, rows = [], keys = [], grid = [], labels = [];
      for (let row = 0; row < m.rows; row++) {
        const pitch = this.mode === 'drums' ? (pattern.voices[row].pitch ?? 60) : this.highPitch - row, label = this.mode === 'drums' ? pattern.voices[row].name : pitchName(pitch), yy = m.top + row * m.rowHeight;
        rows.push(`<rect class="piano-row ${this.mode === 'piano' && black(pitch) ? 'black' : ''}" x="${m.left}" y="${yy}" width="${m.width - m.left}" height="${m.rowHeight}"/><line class="piano-row-line" x1="${m.left}" x2="${m.width}" y1="${yy + m.rowHeight}" y2="${yy + m.rowHeight}"/>`);
        keys.push(`<g class="piano-key ${this.mode === 'piano' && black(pitch) ? 'black' : ''}" data-piano-key="${pitch}" ${this.mode === 'drums' ? `data-piano-voice="${escape(pattern.voices[row].id)}"` : ''} tabindex="0" role="button" aria-label="Audition ${escape(label)}"><rect x="0" y="${yy}" width="${m.left - 1}" height="${m.rowHeight}"/><text x="${m.left - 7}" y="${yy + m.rowHeight * .66}" text-anchor="end">${escape(label.length > 17 ? label.slice(0, 16) + '…' : label)}</text></g>`);
      }
      const stride = m.ppb < 3 ? 32 : m.ppb < 6 ? 16 : m.ppb < 12 ? 8 : 4;
      for (let beat = 0; beat <= pattern.lengthBeats; beat += stride) { grid.push(`<line class="piano-bar-line" x1="${x(beat)}" x2="${x(beat)}" y1="0" y2="${m.height}"/>`); labels.push(`<text class="piano-bar-label" x="${x(beat) + 5}" y="17">${Math.floor(beat / 4) + 1}</text>`); }
      if (m.ppb >= 18) for (let beat = 1; beat < pattern.lengthBeats; beat++) if (beat % 4) grid.push(`<line class="piano-beat-line" x1="${x(beat)}" x2="${x(beat)}" y1="${m.top}" y2="${m.height}"/>`);
      if (this.snap && this.snap < 1 && this.snap * m.ppb >= 9) for (let beat = this.snap; beat < pattern.lengthBeats; beat += this.snap) if (Math.abs(beat - Math.round(beat)) > .000001) grid.push(`<line class="piano-snap-line" x1="${x(beat)}" x2="${x(beat)}" y1="${m.top}" y2="${m.height}"/>`);
      const notes = pattern.notes.map(note => {
        const row = this.rowFor(note); if (row < 0 || row >= m.rows) return '';
        const yy = m.top + row * m.rowHeight + 3, width = Math.max(5, note.duration * m.ppb - 1), height = m.rowHeight - 6, selected = this.selected.has(note.id);
        return `<g class="piano-note ${selected ? 'selected' : ''}" data-piano-note="${escape(note.id)}" tabindex="0" role="button" aria-label="${escape(pitchName(note.pitch))}, beat ${round(note.beat + 1)}, duration ${round(note.duration)} beats, velocity ${Math.round(note.velocity * 127)}, ${escape(pattern.voices.find(voice => voice.id === note.voice)?.name || note.voice)}" aria-pressed="${selected}"><rect class="piano-note-body" x="${x(note.beat)}" y="${yy}" width="${width}" height="${height}"/><rect class="piano-note-velocity" x="${x(note.beat) + 2}" y="${yy + height - 2}" width="${Math.max(1, (width - 4) * note.velocity)}" height="2"/>${width > 35 ? `<text x="${x(note.beat) + 5}" y="${yy + height * .73}">${escape(pitchName(note.pitch))}</text>` : ''}<path class="piano-note-edge-mark" d="M${x(note.beat) + width - 4} ${yy + 3}v${Math.max(2, height - 6)}"/><rect class="piano-note-edge" data-piano-edge="right" x="${x(note.beat) + width - Math.min(10, Math.max(2, width * .35))}" y="${yy}" width="${Math.min(10, Math.max(2, width * .35))}" height="${height}"/></g>`;
      }).join('');
      const empty = !pattern.notes.length ? `<text class="piano-empty-title" x="${m.left + Math.min(m.viewport - m.left, m.width - m.left) / 2}" y="${Math.min(m.height / 2, 175)}" text-anchor="middle">The notes are fashionably late.</text><text class="piano-empty-subtitle" x="${m.left + Math.min(m.viewport - m.left, m.width - m.left) / 2}" y="${Math.min(m.height / 2, 175) + 24}" text-anchor="middle">Click a square to invite the first one.</text>` : '';
      const box = this.drag?.mode === 'box' ? `<rect class="piano-selection-box" x="${Math.min(this.drag.x, this.drag.currentX)}" y="${Math.min(this.drag.y, this.drag.currentY)}" width="${Math.abs(this.drag.currentX - this.drag.x)}" height="${Math.abs(this.drag.currentY - this.drag.y)}"/>` : '';
      svg.setAttribute('width', m.width); svg.setAttribute('height', m.height); svg.setAttribute('viewBox', `0 0 ${m.width} ${m.height}`);
      svg.innerHTML = `<rect class="piano-ruler" x="0" y="0" width="${m.width}" height="${m.top}"/>${rows.join('')}${grid.join('')}<line class="piano-pattern-end" x1="${x(pattern.lengthBeats)}" x2="${x(pattern.lengthBeats)}" y1="0" y2="${m.height}"/>${empty}${notes}${box}<g data-piano-keys>${keys.join('')}</g><line class="piano-playhead" data-piano-playhead x1="${m.left}" x2="${m.left}" y1="0" y2="${m.height}"/><g data-piano-ruler><rect class="piano-ruler" x="0" y="0" width="${m.width}" height="${m.top}"/>${labels.join('')}</g>`;
      this.pinAxes(); this.tick();
    }
    pinAxes() {
      const scroll = this.element.querySelector('.piano-canvas-scroll'); if (!scroll) return;
      this.element.querySelector('[data-piano-keys]')?.setAttribute('transform', `translate(${scroll.scrollLeft},0)`);
      this.element.querySelector('[data-piano-ruler]')?.setAttribute('transform', `translate(0,${scroll.scrollTop})`);
    }
    renderSelection() {
      const holder = this.element.querySelector('.piano-note-editor'); if (!holder) return;
      const notes = this.noteSelection(), note = notes[0];
      holder.innerHTML = note ? `<span class="piano-selection-caption">${notes.length === 1 ? 'SELECTED NOTE' : notes.length + ' SELECTED NOTES'}</span><label>PITCH<input type="number" data-piano-field="note-pitch" min="0" max="127" step="1" value="${note.pitch}" aria-label="Selected note MIDI pitch"></label><output>${escape(pitchName(note.pitch))}</output><label>BEAT<input type="number" data-piano-field="note-beat" min="1" max="${this.pattern().lengthBeats + 1}" step=".001" value="${round(note.beat + 1)}" aria-label="Selected note start beat"></label><label>DURATION<input type="number" data-piano-field="note-duration" min=".000977" max="${this.pattern().lengthBeats}" step=".0625" value="${note.duration}" aria-label="Selected note duration in beats"></label><label>VELOCITY<input type="number" data-piano-field="note-velocity" min="0" max="127" step="1" value="${Math.round(note.velocity * 127)}" aria-label="Selected note velocity"></label><label>CHANCE %<input type="number" data-piano-field="note-probability" min="0" max="100" step="1" value="${Math.round((note.probability ?? 1) * 100)}" aria-label="Selected note probability percent"></label><button type="button" data-piano-action="delete">Delete selected</button>` : `<span class="piano-selection-caption">NOTE INSPECTOR</span><p>${this.pattern().notes.length} notes · Select a note to edit its pitch, beat, duration, velocity, and probability.</p>`;
      for (const button of this.element.querySelectorAll('[data-piano-action="delete"], [data-piano-action="quantize"], [data-piano-action="duplicate"]')) button.disabled = !notes.length;
    }
    renderMapping() {
      const holder = this.element.querySelector('.piano-mapping'), pattern = this.pattern(), clip = this.clip(); if (!holder || !pattern || !clip) return;
      const targets = this.targetVoices(), unresolved = pattern.voices.filter(voice => !clip.voiceMap?.[voice.id] || (targets.length && !targets.some(target => target.id === clip.voiceMap[voice.id])));
      holder.innerHTML = `<div class="piano-mapping-summary"><div><strong>Voice destinations ${unresolved.length ? '· ' + unresolved.length + ' to map' : '· mapped'}</strong><p>Notes keep their source voice. Choose which instrument voice should play each one.${targets.length ? '' : ' Open the track instrument to load its available voices.'}</p></div><span class="fineprint">${targets.length} target voices</span></div><div class="piano-map-grid">${pattern.voices.map(voice => { const value = clip.voiceMap?.[voice.id] || '', current = value && !targets.some(target => target.id === value) ? [{ id: value, name: value + ' (saved)' }] : []; return `<label><span>${escape(voice.name)}</span><select data-piano-map="${escape(voice.id)}" aria-label="Destination for ${escape(voice.name)}"><option value="">Choose…</option>${[...targets, ...current].map(target => `<option value="${escape(target.id)}" ${target.id === value ? 'selected' : ''}>${escape(target.name)}</option>`).join('')}</select></label>`; }).join('')}</div>`;
    }
    tick() {
      const clip = this.clip(), line = this.element.querySelector('[data-piano-playhead]'); if (!clip || !line) return;
      const m = this.metrics(), relative = (this.getBeat() - clip.start) * clip.rate + clip.sourceOffset, within = this.getBeat() >= clip.start && this.getBeat() <= clip.start + clip.length;
      const beat = clip.loop ? ((relative % clip.pattern.lengthBeats) + clip.pattern.lengthBeats) % clip.pattern.lengthBeats : relative;
      line.style.display = within && beat >= 0 && beat <= clip.pattern.lengthBeats ? '' : 'none'; line.setAttribute('x1', m.left + beat * m.ppb); line.setAttribute('x2', m.left + beat * m.ppb);
    }
    point(event) {
      const svg = this.element.querySelector('.piano-canvas'), rect = svg.getBoundingClientRect(), m = this.metrics(), x = event.clientX - rect.left, y = event.clientY - rect.top;
      const rawBeat = (x - m.left) / m.ppb, beat = this.snap ? Math.round(rawBeat / this.snap) * this.snap : round(rawBeat), row = clamp(Math.floor((y - m.top) / m.rowHeight), 0, m.rows - 1);
      return { x, y, beat: clamp(round(beat), 0, this.pattern().lengthBeats - MIN_DURATION), row, pitch: this.mode === 'drums' ? (this.pattern().voices[row].pitch ?? 60) : this.highPitch - row, voice: this.mode === 'drums' ? this.pattern().voices[row].id : this.voice };
    }
    audition(note) { try { Promise.resolve(this.onAudition({ pitch: note.pitch + (this.clip()?.transpose || 0), velocity: note.velocity ?? .8, voice: this.clip()?.voiceMap?.[note.voice] || note.voice, durationSeconds: Math.min(1, (note.duration || .5) * 60 / this.getState().tempo) })).catch(error => this.status('Audition: ' + error.message)); } catch (error) { this.status('Audition: ' + error.message); } }
    addNote(point, remember = true) {
      const pattern = this.pattern(); if (!pattern || pattern.notes.length >= (window.MusicLabPatternSchema?.MAX_NOTES || 4096)) { this.status('A pattern can hold up to 4,096 notes.'); return null; }
      const note = { id: window.LoomSchema.uid('note'), pitch: clamp(Math.round(point.pitch ?? 60), 0, 127), beat: clamp(point.beat ?? 0, 0, pattern.lengthBeats - MIN_DURATION), duration: Math.max(MIN_DURATION, Math.min(this.duration, pattern.lengthBeats - (point.beat ?? 0))), velocity: this.velocity, voice: point.voice || this.voice || pattern.voices[0].id, probability: 1 };
      if (remember) this.remember(); pattern.notes.push(note); this.selected = new Set([note.id]); this.audition(note); return note;
    }
    pointerDown(event) {
      if (event.button !== 0 || !event.target.closest('.piano-canvas') || !this.pattern()) return;
      if (this.pan) {
        event.preventDefault(); event.stopPropagation(); const scroll = this.element.querySelector('.piano-canvas-scroll');
        this.drag = { mode: 'pan', pointer: event.pointerId, x: event.clientX, y: event.clientY, scrollLeft: scroll.scrollLeft, scrollTop: scroll.scrollTop };
        this.element.setPointerCapture(event.pointerId); this.element.classList.add('is-panning'); return;
      }
      if (event.target.closest('[data-piano-ruler]')) return;
      const key = event.target.closest('[data-piano-key]'); if (key) { event.preventDefault(); event.stopPropagation(); this.audition({ pitch: Number(key.dataset.pianoKey), voice: key.dataset.pianoVoice || this.voice, velocity: this.velocity }); return; }
      const p = this.point(event), m = this.metrics(); if (p.x < m.left || p.y < m.top) return;
      event.preventDefault(); event.stopPropagation(); const el = event.target.closest('[data-piano-note]'), note = el && this.pattern().notes.find(note => note.id === el.dataset.pianoNote);
      if (note) {
        if (event.shiftKey) { if (this.selected.has(note.id)) this.selected.delete(note.id); else this.selected.add(note.id); this.draw(); this.renderSelection(); return; }
        if (!this.selected.has(note.id)) this.selected = new Set([note.id]);
        this.drag = { mode: event.target.closest('[data-piano-edge]') ? 'resize' : 'move', pointer: event.pointerId, x: p.x, y: p.y, row: p.row, anchor: note, notes: this.noteSelection().map(item => ({ item, original: { ...item } })), remembered: false, moved: false };
        this.audition(note);
      } else if (this.tool === 'select' || event.shiftKey) {
        if (!event.shiftKey) this.selected.clear(); this.drag = { mode: 'box', pointer: event.pointerId, x: p.x, y: p.y, currentX: p.x, currentY: p.y, initial: new Set(this.selected) };
      } else {
        const added = this.addNote(p); if (!added) return;
        this.drag = { mode: 'resize-new', pointer: event.pointerId, x: p.x, y: p.y, anchor: added, notes: [{ item: added, original: { ...added } }], remembered: true, moved: true };
      }
      this.element.setPointerCapture(event.pointerId); this.draw(); this.renderSelection();
    }
    pointerMove(event) {
      const drag = this.drag; if (!drag || drag.pointer !== event.pointerId || !this.pattern()) return;
      if (drag.mode === 'pan') {
        event.preventDefault(); const scroll = this.element.querySelector('.piano-canvas-scroll');
        scroll.scrollLeft = Math.max(0, drag.scrollLeft + drag.x - event.clientX); scroll.scrollTop = Math.max(0, drag.scrollTop + drag.y - event.clientY); this.pinAxes(); return;
      }
      event.preventDefault(); const p = this.point(event), m = this.metrics();
      if (drag.mode === 'box') {
        drag.currentX = p.x; drag.currentY = p.y; const x1 = Math.min(drag.x, p.x), x2 = Math.max(drag.x, p.x), y1 = Math.min(drag.y, p.y), y2 = Math.max(drag.y, p.y);
        this.selected = new Set(drag.initial);
        for (const note of this.pattern().notes) { const row = this.rowFor(note), xx = m.left + note.beat * m.ppb, yy = m.top + row * m.rowHeight; if (row >= 0 && row < m.rows && xx < x2 && xx + note.duration * m.ppb > x1 && yy < y2 && yy + m.rowHeight > y1) this.selected.add(note.id); }
        this.queueDraw(); return;
      }
      let beatDelta = (p.x - drag.x) / m.ppb; if (this.snap) beatDelta = Math.round(beatDelta / this.snap) * this.snap; beatDelta = round(beatDelta);
      const rowDelta = p.row - drag.row;
      if (drag.mode === 'move') {
        beatDelta = clamp(beatDelta, -Math.min(...drag.notes.map(entry => entry.original.beat)), this.pattern().lengthBeats - Math.max(...drag.notes.map(entry => entry.original.beat + entry.original.duration)));
        const pitchDelta = this.mode === 'piano' ? clamp(-rowDelta, -Math.min(...drag.notes.map(entry => entry.original.pitch)), 127 - Math.max(...drag.notes.map(entry => entry.original.pitch))) : 0;
        if (!drag.remembered && !beatDelta && !pitchDelta && (this.mode !== 'drums' || !rowDelta)) return;
        if (!drag.remembered) { this.remember(); drag.remembered = true; }
        for (const { item, original } of drag.notes) { item.beat = clamp(round(original.beat + beatDelta), 0, this.pattern().lengthBeats - original.duration); item.pitch = original.pitch + pitchDelta; if (this.mode === 'drums') { const row = this.pattern().voices.findIndex(voice => voice.id === original.voice), voice = this.pattern().voices[clamp(row + rowDelta, 0, this.pattern().voices.length - 1)]; item.voice = voice.id; item.pitch = voice.pitch ?? original.pitch; } }
      } else {
        if (drag.mode === 'resize-new') beatDelta = (p.beat - drag.anchor.beat) + (this.snap || MIN_DURATION) - drag.notes[0].original.duration;
        const minimum = Math.max(...drag.notes.map(entry => MIN_DURATION - entry.original.duration)), maximum = Math.min(...drag.notes.map(entry => this.pattern().lengthBeats - entry.original.beat - entry.original.duration)); beatDelta = clamp(beatDelta, minimum, maximum);
        if (!beatDelta && !drag.remembered) return; if (!drag.remembered) { this.remember(); drag.remembered = true; }
        for (const { item, original } of drag.notes) item.duration = Math.min(this.pattern().lengthBeats - item.beat, round(Math.max(MIN_DURATION, original.duration + beatDelta)));
      }
      drag.moved = true; this.queueDraw();
    }
    queueDraw() { if (this.frame) return; this.frame = requestAnimationFrame(() => { this.frame = 0; this.draw(); this.renderSelection(); }); }
    pointerEnd(event) {
      const drag = this.drag; if (!drag || drag.pointer !== event.pointerId) return;
      this.drag = null; this.element.classList.remove('is-panning'); if (this.element.hasPointerCapture(event.pointerId)) this.element.releasePointerCapture(event.pointerId); if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
      if (drag.moved) this.notify(); this.render(); this.element.querySelector('.piano-canvas')?.focus({ preventScroll: true });
    }
    click(event) {
      const action = event.target.closest('[data-piano-action]')?.dataset.pianoAction; if (!action || !this.pattern()) return;
      if (action === 'close') { this.close(); return; }
      if (action === 'pan') { this.pan = !this.pan; if (!this.pan) this.tool = 'draw'; this.render(); return; }
      if (action === 'tool') { this.tool = this.pan ? 'draw' : this.tool === 'draw' ? 'select' : 'draw'; this.pan = false; this.render(); return; }
      if (action === 'fit') { this.fitMode = true; this.fitPitches(); this.draw(); return; }
      if (action === 'zoom-in' || action === 'zoom-out') { this.fitMode = false; this.zoom = clamp(this.zoom * (action === 'zoom-in' ? 1.5 : 1 / 1.5), 1, 240); this.draw(); return; }
      if (action.startsWith('octave-')) { const delta = action === 'octave-up' ? 12 : -12, range = this.highPitch - this.lowPitch; this.lowPitch = clamp(this.lowPitch + delta, 0, 127 - range); this.highPitch = this.lowPitch + range; this.draw(); return; }
      if (action === 'select-all') { this.selected = new Set(this.pattern().notes.map(note => note.id)); this.draw(); this.renderSelection(); return; }
      if (action === 'delete') { this.deleteSelected(); return; }
      if (action === 'duplicate') { this.duplicateSelected(); return; }
      if (action === 'quantize') { const notes = this.noteSelection(); if (!notes.length || !this.snap) return; this.remember(); for (const note of notes) note.beat = clamp(round(Math.round(note.beat / this.snap) * this.snap), 0, this.pattern().lengthBeats - note.duration); this.notify(); this.render(); return; }
      if (action === 'add') { const beat = this.noteSelection()[0]?.beat ?? 0, voice = this.pattern().voices.find(voice => voice.id === this.voice), note = this.addNote({ beat, pitch: voice?.pitch ?? this.noteSelection()[0]?.pitch ?? 60, voice: this.voice }); if (note) { this.notify(); this.render(); } }
    }
    change(event) {
      const field = event.target.dataset.pianoField, map = event.target.dataset.pianoMap, pattern = this.pattern(); if (!pattern) return;
      if (map) { const value = event.target.value; this.remember(); const clip = this.clip(); clip.voiceMap ||= {}; if (value) clip.voiceMap[map] = value; else delete clip.voiceMap[map]; this.notify(); this.renderMapping(); return; }
      if (!field) return;
      if (field === 'mode') { this.mode = event.target.value; this.render(); return; }
      if (field === 'voice') { this.voice = event.target.value; return; }
      if (field === 'snap') { this.snap = Number(event.target.value); this.draw(); return; }
      const value = Number(event.target.value); if (!Number.isFinite(value)) { this.render(); return; }
      if (field === 'new-duration') { this.duration = clamp(value, MIN_DURATION, 256); event.target.value = this.duration; return; }
      if (field === 'length') { const length = clamp(value, .25, 256), end = Math.max(.25, ...pattern.notes.map(note => note.beat + note.duration)); if (length < end - .000001) { this.status('This pattern still has notes beyond that end. Move or delete those notes before shortening it.'); event.target.value = pattern.lengthBeats; return; } this.remember(); pattern.lengthBeats = length; this.clip().sourceOffset = Math.min(this.clip().sourceOffset, length); this.notify(); this.render(); return; }
      const notes = this.noteSelection(); if (!notes.length) return;
      this.remember();
      if (field === 'note-pitch') { const delta = clamp(Math.round(value) - notes[0].pitch, -Math.min(...notes.map(note => note.pitch)), 127 - Math.max(...notes.map(note => note.pitch))); for (const note of notes) note.pitch += delta; }
      if (field === 'note-beat') { const delta = clamp(value - 1 - notes[0].beat, -Math.min(...notes.map(note => note.beat)), pattern.lengthBeats - Math.max(...notes.map(note => note.beat + note.duration))); for (const note of notes) note.beat = clamp(round(note.beat + delta), 0, pattern.lengthBeats - note.duration); }
      if (field === 'note-duration') for (const note of notes) note.duration = Math.min(pattern.lengthBeats - note.beat, round(clamp(value, MIN_DURATION, pattern.lengthBeats - note.beat)));
      if (field === 'note-velocity') { this.velocity = clamp(value / 127, 0, 1); for (const note of notes) note.velocity = this.velocity; }
      if (field === 'note-probability') for (const note of notes) note.probability = clamp(value / 100, 0, 1);
      this.notify(); this.draw(); this.renderSelection(); this.element.querySelector(`[data-piano-field="${field}"]`)?.focus({ preventScroll: true });
    }
    deleteSelected() { if (!this.noteSelection().length) return; this.remember(); this.pattern().notes = this.pattern().notes.filter(note => !this.selected.has(note.id)); this.selected.clear(); this.notify(); this.render(); this.element.querySelector('.piano-canvas')?.focus({ preventScroll: true }); }
    duplicateSelected(offset) {
      const notes = this.noteSelection(); if (!notes.length) return;
      const pattern = this.pattern(); if (pattern.notes.length + notes.length > (window.MusicLabPatternSchema?.MAX_NOTES || 4096)) { this.status('Duplicating these notes would exceed the 4,096-note pattern limit.'); return; }
      const first = Math.min(...notes.map(note => note.beat)), end = Math.max(...notes.map(note => note.beat + note.duration)), delta = offset ?? Math.max(this.snap || .25, end - first), available = pattern.lengthBeats - end;
      if (delta > available + .000001) { this.status('Make the pattern longer to leave room for these duplicated notes.'); return; }
      this.remember(); const copies = notes.map(note => ({ ...note, id: window.LoomSchema.uid('note'), beat: round(note.beat + delta) })); pattern.notes.push(...copies); this.selected = new Set(copies.map(note => note.id)); this.notify(); this.render();
    }
    keydown(event) {
      if (!event.target.closest('.piano-canvas')) return;
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'p') { event.preventDefault(); event.stopPropagation(); this.pan = !this.pan; if (!this.pan) this.tool = 'draw'; this.render(); this.element.querySelector('.piano-canvas')?.focus({ preventScroll: true }); return; }
      if (this.pan && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.pan = false; this.tool = 'draw'; this.render(); this.element.querySelector('.piano-canvas')?.focus({ preventScroll: true }); return; }
      const key = event.target.closest('[data-piano-key]'); if (key && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); this.audition({ pitch: Number(key.dataset.pianoKey), voice: key.dataset.pianoVoice || this.voice }); return; }
      const noteElement = event.target.closest('[data-piano-note]'); if (noteElement && !this.selected.has(noteElement.dataset.pianoNote)) this.selected = new Set([noteElement.dataset.pianoNote]);
      if ((event.ctrlKey || event.metaKey) && ['a', 'c', 'v', 'd'].includes(event.key.toLowerCase())) {
        event.preventDefault(); event.stopPropagation(); const command = event.key.toLowerCase();
        if (command === 'a') { this.selected = new Set(this.pattern().notes.map(note => note.id)); this.draw(); this.renderSelection(); }
        if (command === 'c') { this.copyBuffer = this.noteSelection().map(note => ({ ...note })); this.status(this.copyBuffer.length + ' notes copied in the piano roll.'); }
        if (command === 'd') this.duplicateSelected();
        if (command === 'v' && this.copyBuffer.length) { const pattern = this.pattern(), first = Math.min(...this.copyBuffer.map(note => note.beat)), destination = this.noteSelection().length ? Math.max(...this.noteSelection().map(note => note.beat + note.duration)) : 0, copies = this.copyBuffer.map(note => ({ ...note, id: window.LoomSchema.uid('note'), beat: round(note.beat - first + destination) })); if (pattern.notes.length + copies.length > 4096 || copies.some(note => note.beat + note.duration > pattern.lengthBeats || !pattern.voices.some(voice => voice.id === note.voice))) { this.status('The copied notes need more pattern space or a matching source voice.'); return; } this.remember(); pattern.notes.push(...copies); this.selected = new Set(copies.map(note => note.id)); this.notify(); this.render(); }
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.selected.clear(); this.draw(); this.renderSelection(); return; }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); event.stopPropagation(); this.deleteSelected(); return; }
      if (event.key.toLowerCase() === 'd') { event.preventDefault(); event.stopPropagation(); this.duplicateSelected(); return; }
      if (event.key === 'Enter' && !noteElement) { event.preventDefault(); event.stopPropagation(); const note = this.addNote({ pitch: 60, beat: 0, voice: this.voice }); if (note) { this.notify(); this.render(); } return; }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation(); const notes = this.noteSelection(); if (!notes.length) return; const step = this.snap || .0625;
      this.remember();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { const sign = event.key === 'ArrowLeft' ? -1 : 1; if (event.shiftKey) { const delta = clamp(sign * step, Math.max(...notes.map(note => MIN_DURATION - note.duration)), Math.min(...notes.map(note => this.pattern().lengthBeats - note.beat - note.duration))); for (const note of notes) note.duration = Math.min(this.pattern().lengthBeats - note.beat, round(Math.max(MIN_DURATION, note.duration + delta))); } else { const delta = clamp(sign * step, -Math.min(...notes.map(note => note.beat)), this.pattern().lengthBeats - Math.max(...notes.map(note => note.beat + note.duration))); for (const note of notes) note.beat = clamp(round(note.beat + delta), 0, this.pattern().lengthBeats - note.duration); } }
      else { const sign = event.key === 'ArrowUp' ? 1 : -1, delta = clamp(sign * (event.shiftKey ? 12 : 1), -Math.min(...notes.map(note => note.pitch)), 127 - Math.max(...notes.map(note => note.pitch))); for (const note of notes) note.pitch += delta; }
      this.notify(); this.draw(); this.renderSelection(); this.element.querySelector('.piano-canvas')?.focus({ preventScroll: true });
    }
    dispose() { this.resizeObserver?.disconnect(); if (this.frame) cancelAnimationFrame(this.frame); this.drag = null; }
  }
  window.LoomPianoRollEditor = LoomPianoRollEditor;
})();
