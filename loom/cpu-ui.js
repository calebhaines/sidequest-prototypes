/* GALLEY · an inspection hatch. Closed means no profiling or painting. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const text = (element, value) => { if (element && element.textContent !== String(value)) element.textContent = String(value); };
  const clockNow = () => globalThis.performance?.now?.() ?? Date.now();
  const amount = value => finite(value) ? Number(value.toFixed(value < 1 ? 3 : value < 10 ? 2 : 1)).toString() : '—';
  const ownerName = (owner, index) => owner.id === 'master' ? 'Master' : owner.id.startsWith('return-') ? (owner.id === 'return-1' ? 'Return A' : 'Return B') : 'Track ' + String(index + 1).padStart(2, '0');
  const modes = { light: 'Light · 1 in 16 blocks', balanced: 'Balanced · 1 in 4 blocks', deep: 'Deep · every block' };
  const statistics = ['meanMs', 'p95Ms', 'maxMs', 'meanPercent', 'samples'];
  const statLabels = { meanMs: 'Mean', p95Ms: 'P95 est.', maxMs: 'Worst', meanPercent: 'Budget', samples: 'Samples' };
  const exportFields = ['enabled', 'mode', 'revision', 'reportRevision', 'status', 'available', 'clock', 'sampleRate', 'blockFrames', 'budgetMs', 'processedBlocks', 'sampledBlocks', 'validSampledBlocks', 'sampledFrames', 'validSampledFrames', 'coverage', 'elapsedSeconds', 'total', 'timerReads', 'invalidTimings', 'estimated', 'windowSize'];
  const rowFields = ['id', 'kind', 'ownerId', 'slot', 'effectType', 'active', 'bypassed', 'samples', 'totalSamples', 'meanMs', 'p95Ms', 'maxMs', 'meanPercent', 'p95Percent', 'maxPercent', 'overBudget', 'zeroSamples', 'calls', 'windowCalls', 'estimated', 'percentileMethod', 'percentileBins', 'p95MsLower', 'p95MsUpper', 'p95PercentLower', 'p95PercentUpper'];

  class LoomCPUInspector {
    constructor({ element, engine, getState, host = null, status = () => {}, selectEffect = null }) {
      Object.assign(this, { element, engine, getState, host, status, selectEffect });
      this.visible = true; this.intersecting = false; this.paused = false; this.mode = 'light'; this.active = false; this.interval = 0; this.frame = 0; this.offscreenTimer = 0; this.history = []; this.sequence = ''; this.topology = ''; this.disposed = false; this.monitorUI = false;
      this.uiStats = { longTasks: 0, longTaskMs: 0, longestTaskMs: 0, frameGaps: 0, worstFrameMs: 0, frames: 0, supported: false };
      this.visibilityChanged = () => this.sync(); this.contextRef = this.engine.context || null; this.lastProcessed = null;
      this.scrollChanged = () => { const box = this.element.getBoundingClientRect(); this.intersecting = box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight; clearTimeout(this.offscreenTimer); this.offscreenTimer = 0; if (this.intersecting) this.setActive(!this.paused); else this.offscreenTimer = setTimeout(() => { this.offscreenTimer = 0; this.setActive(false); }, 300); };
      this.element.classList.add('cpu-inspector', 'panel');
      this.element.innerHTML = `<summary class="cpu-summary"><span class="cpu-summary-title"><span class="section-number">◴</span>CPU resources<small>Inspect the engine room</small></span><span class="cpu-summary-state" data-cpu-summary>Profiling off</span><span class="cpu-chevron" aria-hidden="true">+</span></summary>
        <div class="cpu-content"><div class="cpu-intro"><div><p class="eyebrow">GALLEY MIX / EFFECT DSP</p><h2>Where the mix spends its time.</h2><p>Sample the mixer, channel EQ and each insert. Instrument synthesis and its per-voice effects run outside this measurement.</p></div><div class="cpu-actions"><label>DETAIL<select data-cpu-mode aria-label="CPU profiling detail">${Object.entries(modes).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label><button type="button" data-cpu-action="pause" aria-pressed="false">Pause</button><button type="button" data-cpu-action="reset">Reset readings</button><button type="button" data-cpu-action="download">Save report</button></div></div>
        <p class="cpu-message" data-cpu-message role="status">Open this hatch to collect sampled timings. Audio starts only when you use the transport or monitoring.</p>
        <div class="cpu-overview"><div class="cpu-card cpu-load"><span>MEASURED CALLBACK LOAD</span><output data-cpu-overview="meanPercent">—</output><small data-cpu-mean-ms>Waiting for audio</small></div><div class="cpu-card"><span>95TH PERCENTILE · EST.</span><output data-cpu-overview="p95Ms">—</output><small>Wall time per sampled callback</small></div><div class="cpu-card"><span>WORST OBSERVED</span><output data-cpu-overview="maxMs">—</output><small data-cpu-budget>Available block time: —</small></div><div class="cpu-card"><span>SAMPLED OVER BUDGET</span><output data-cpu-overview="overBudget">—</output><small>Timing observations, not detected audio dropouts</small></div></div>
        <div class="cpu-live-grid"><section class="cpu-history"><div class="cpu-subheading"><h3>Recent callback load</h3><span data-cpu-history-label>Up to 30 seconds · sampled</span></div><svg data-cpu-history viewBox="0 0 720 130" role="img" aria-label="History of sampled GALLEY callback load"><path class="cpu-history-grid" d="M0 15H720M0 65H720M0 115H720"/><path class="cpu-history-budget" data-cpu-history-budget d="M0 15H720"/><path class="cpu-history-area" data-cpu-history-area d=""/><path class="cpu-history-line" data-cpu-history-line d=""/><text x="3" y="12" data-cpu-history-axis>100%</text></svg><div class="cpu-history-footer"><span>Earlier</span><span>100% = one callback’s time budget</span><span>Now</span></div></section><section class="cpu-hotspots"><div class="cpu-subheading"><h3>Insert hotspots</h3><span>Mean time</span></div><ol data-cpu-hotspots>${Array.from({ length: 5 }, () => '<li hidden><span><strong></strong><small></small></span><output></output></li>').join('')}</ol><p data-cpu-hotspots-empty>No insert timings yet.</p></section></div>
        <details class="cpu-fold" data-cpu-owner-fold open><summary>Tracks, returns &amp; master <span>Inserts / EQ / channel mixing</span></summary><p class="cpu-fold-help">Owner times include their inserts, EQ and mixing. Open a station to inspect its components; these rows overlap and must not be added together.</p><div data-cpu-owners></div></details>
        <details class="cpu-fold" data-cpu-stages-fold><summary>Other engine work <span>Clip rendering / modulation / capture</span></summary><p class="cpu-fold-help">Measured stages may include work shown in the station view. “Engine” is an inclusive timing, not an extra processor.</p><div data-cpu-stages></div></details>
        <details class="cpu-fold" data-cpu-system-fold><summary>Browser &amp; audio context <span>Clock / buffer / interface responsiveness</span></summary><dl class="cpu-facts" data-cpu-facts></dl><div class="cpu-browser-monitor"><label><input type="checkbox" data-cpu-monitor-ui> Monitor interface stalls while this panel is visible</label><p>Optional main-thread long-task and animation-gap observations. They do not measure audio dropouts or total CPU usage.</p><dl class="cpu-facts" data-cpu-browser></dl></div><div class="cpu-instrument-note"><strong>Instrument activity</strong><p data-cpu-instruments>No instruments loaded.</p><small>Native synthesis, per-voice instrument effects, browser rendering and other audio processors are outside GALLEY’s measured callback. A low reading here does not guarantee the whole audio graph meets its deadline.</small></div></details>
        <div class="cpu-footer"><p data-cpu-coverage>Profiling is off while this panel is collapsed, hidden or out of view.</p><p>These are sampled elapsed-time estimates, including scheduling interruptions, rather than operating-system CPU percentages. Reports contain timing and engine metadata; no audio, notes, patches or device identifiers.</p></div></div>`;
      this.element.addEventListener('toggle', this.onToggle = event => { if (event.target === this.element) this.sync(); else if (this.element.open && this.visible && !document.hidden) this.render(); }, true);
      this.element.addEventListener('click', this.onClick = event => this.click(event));
      this.element.addEventListener('change', this.onChange = event => this.change(event));
      document.addEventListener('visibilitychange', this.visibilityChanged);
      this.sync();
    }
    owners() { const state = this.getState(); return [...state.tracks, ...(state.returns || []), state.master].filter(Boolean); }
    setVisible(value) { value = value !== false; if (value === this.visible) return; this.visible = value; this.sync(); }
    sync() {
      if (this.disposed) return;
      const opened = this.element.open && this.visible && !document.hidden && this.element.isConnected;
      if (!opened) {
        clearTimeout(this.offscreenTimer); this.offscreenTimer = 0; this.observer?.disconnect(); this.observer = null; this.stopScrollGuard(); this.intersecting = false; this.setActive(false); return;
      }
      if (!this.observer && typeof IntersectionObserver === 'function') {
        this.observer = new IntersectionObserver(entries => {
          const entry = entries[entries.length - 1]; this.intersecting = entry.isIntersecting && entry.intersectionRatio > 0;
          clearTimeout(this.offscreenTimer); this.offscreenTimer = 0;
          if (this.intersecting) this.setActive(!this.paused && this.visible && !document.hidden && this.element.open);
          else this.offscreenTimer = setTimeout(() => { this.offscreenTimer = 0; this.setActive(false); }, 300);
        });
        this.observer.observe(this.element);
      } else if (typeof IntersectionObserver !== 'function') {
        if (!this.scrollGuard) { this.scrollGuard = true; window.addEventListener('scroll', this.scrollChanged, { passive: true, capture: true }); window.addEventListener('resize', this.scrollChanged, { passive: true }); }
        this.scrollChanged();
      }
      this.setActive(this.intersecting && !this.paused);
      this.render();
    }
    stopScrollGuard() { if (!this.scrollGuard) return; window.removeEventListener('scroll', this.scrollChanged, true); window.removeEventListener('resize', this.scrollChanged); this.scrollGuard = false; }
    setActive(value) {
      value = Boolean(value && this.element.open && this.visible && !document.hidden && !this.disposed);
      if (value === this.active) return;
      this.active = value;
      this.engine.setDiagnostics?.({ enabled: value, mode: this.mode });
      clearInterval(this.interval); this.interval = 0;
      if (value) { this.interval = setInterval(() => this.render(), 250); this.startBrowserMonitor(); }
      else this.stopBrowserMonitor();
      this.render();
    }
    click(event) {
      const action = event.target.closest('[data-cpu-action]')?.dataset.cpuAction;
      if (action === 'pause') { this.paused = !this.paused; text(this.element.querySelector('[data-cpu-action="pause"]'), this.paused ? 'Resume' : 'Pause'); this.element.querySelector('[data-cpu-action="pause"]').setAttribute('aria-pressed', String(this.paused)); this.sync(); }
      else if (action === 'reset') {
        this.engine.resetDiagnostics?.(); this.history = []; this.sequence = ''; this.uiStats = { ...this.uiStats, longTasks: 0, longTaskMs: 0, longestTaskMs: 0, frameGaps: 0, worstFrameMs: 0, frames: 0 }; this.lastFrame = null; this.render();
      } else if (action === 'download') this.download();
      const effect = event.target.closest('[data-cpu-effect-owner]');
      if (effect && !effect.disabled && this.selectEffect) this.selectEffect(effect.dataset.cpuEffectOwner, Number(effect.dataset.cpuSlot));
    }
    change(event) {
      if (event.target.matches('[data-cpu-mode]')) { this.mode = Object.hasOwn(modes, event.target.value) ? event.target.value : 'light'; this.engine.setDiagnostics?.({ enabled: this.active, mode: this.mode }); this.history = []; this.sequence = ''; this.render(); }
      else if (event.target.matches('[data-cpu-monitor-ui]')) { this.monitorUI = event.target.checked; if (this.active && this.monitorUI) this.startBrowserMonitor(); else this.stopBrowserMonitor(); this.render(); }
    }
    format(row, key, snapshot) {
      const value = row?.[key];
      if (!finite(value) || row?.samples === 0) return '—';
      if (key === 'samples' || key === 'overBudget') return Math.round(value).toLocaleString();
      const coarse = snapshot?.clock?.coarse, resolution = snapshot?.clock?.resolutionMs || 1;
      if (snapshot?.clock && value === 0 && (key.endsWith('Ms') || key.endsWith('Percent'))) return key.endsWith('Ms') && snapshot.clock?.resolutionKnown === true && finite(snapshot.clock?.resolutionMs) ? '<' + amount(resolution) + ' ms' : '< clock';
      return (coarse || key.startsWith('p95') && row?.percentileMethod === 'histogram' ? '≈' : '') + amount(value) + (key.endsWith('Percent') ? '%' : ' ms');
    }
    component(id, label, { ownerId, slot, effectType, subtitle = '' } = {}) {
      const effect = Number.isInteger(slot), button = effect && !!effectType && !!this.selectEffect;
      return `<div class="cpu-component" data-cpu-row="${esc(id)}"><${button ? 'button type="button"' : 'div'} class="cpu-component-name" ${button ? `data-cpu-effect-owner="${esc(ownerId)}" data-cpu-slot="${slot}" title="Open this insert"` : ''}><strong>${esc(label)}</strong><small>${esc(subtitle)}</small></${button ? 'button' : 'div'}><div class="cpu-values">${statistics.map(key => `<span><small>${statLabels[key]}</small><output data-cpu-stat="${key}">—</output></span>`).join('')}</div></div>`;
    }
    rebuildOwners(owners = this.owners()) {
      const key = owners.map(owner => owner.id + '|' + owner.name + '|' + (owner.effects || []).map(effect => effect ? effect.type + ':' + (effect.params?.bypass ? '1' : '0') : '').join(',')).join(';');
      if (key === this.topology) return; this.topology = key;
      const open = new Set([...this.element.querySelectorAll('[data-cpu-owner][open]')].map(element => element.dataset.cpuOwner));
      const active = this.element.contains(document.activeElement) ? document.activeElement : null, focus = active?.dataset.cpuEffectOwner ? active.dataset.cpuEffectOwner + '|' + active.dataset.cpuSlot : null;
      this.element.querySelector('[data-cpu-owners]').innerHTML = owners.map((owner, index) => {
        const slots = window.LoomSchema?.effectSlotCount?.(owner) || owner.effects?.length || (owner.id.startsWith('track-') ? 5 : 4);
        const label = ownerName(owner, index), effects = Array.from({ length: slots }, (_, slot) => {
          const effect = owner.effects?.[slot], definition = (window.LoomEffectsCatalog || []).find(item => item.id === effect?.type);
          return this.component(owner.id + ':fx:' + slot, String(slot + 1).padStart(2, '0') + ' · ' + (definition?.name || effect?.type || 'Empty insert'), { ownerId: owner.id, slot, effectType: effect?.type, subtitle: effect ? 'Serial insert · ' + (effect.params?.bypass ? 'bypassed' : 'enabled') : 'No processor assigned' });
        }).join('');
        return `<details class="cpu-owner" data-cpu-owner="${esc(owner.id)}" ${open.has(owner.id) ? 'open' : ''}><summary><span class="cpu-owner-label"><strong>${label}</strong><small>${esc(owner.name || label)}</small></span><span class="cpu-owner-meter"><i data-cpu-owner-bar="${esc(owner.id)}"></i></span><output data-cpu-owner-percent="${esc(owner.id)}">—</output><output data-cpu-owner-time="${esc(owner.id)}">—</output></summary><div class="cpu-owner-components">${effects}${owner.id.startsWith('track-') ? this.component(owner.id + ':eq', 'Four-band channel EQ', { subtitle: 'After inserts · sweepable mids · before sends' }) : ''}${this.component(owner.id + ':mix', 'Channel mixing', { subtitle: owner.id === 'master' ? 'Master gain / output' : 'Gain / pan / routing' })}</div></details>`;
      }).join('');
      if (focus) [...this.element.querySelectorAll('[data-cpu-effect-owner]')].find(element => element.dataset.cpuEffectOwner + '|' + element.dataset.cpuSlot === focus)?.focus({ preventScroll: true });
    }
    paintRow(element, row, snapshot, ownerById) {
      const fields = element._loomCPUFields || (element._loomCPUFields = statistics.map(key => element.querySelector(`[data-cpu-stat="${key}"]`)));
      for (let index = 0; index < statistics.length; index++) text(fields[index], this.format(row, statistics[index], snapshot));
      element.classList.toggle('cpu-row-warm', !row?.samples);
      const type = ownerById?.get(row?.ownerId)?.effects?.[row?.slot]?.type;
      if (row?.kind === 'effect' && row.effectType && type && type !== row.effectType) for (const output of element.querySelectorAll('output')) text(output, '—');
    }
    render() {
      if (this.disposed) return;
      if (!this.element.open) { text(this.element.querySelector('[data-cpu-summary]'), 'Profiling off'); return; }
      const snapshot = this.engine.getDiagnostics?.() || {};
      const context = this.engine.context || null, processed = snapshot.processedBlocks || 0;
      if (context !== this.contextRef || this.lastProcessed !== null && processed < this.lastProcessed) { this.history = []; this.sequence = ''; }
      this.contextRef = context; this.lastProcessed = processed;
      const summary = this.element.querySelector('[data-cpu-summary]');
      const warming = (snapshot.total?.samples || 0) < (snapshot.clock?.coarse ? 64 : 16), unsupported = snapshot.status === 'unsupported', reportRevision = snapshot.reportRevision === undefined ? snapshot.revision : snapshot.reportRevision, pending = reportRevision !== null && reportRevision !== snapshot.revision;
      text(summary, !this.element.open ? 'Profiling off' : this.paused ? 'Readings paused' : !this.active ? 'Profiling paused · out of view' : unsupported ? 'Timing unavailable' : pending ? 'Refreshing measurements' : snapshot.status === 'waiting' ? 'Waiting for audio' : snapshot.total?.samples ? warming ? 'Sampling · warming up' : 'Sampling · ' + this.format(snapshot.total, 'meanPercent', snapshot) : 'Waiting for audio');
      if (!this.element.open || !this.visible || document.hidden) return;
      const owners = this.owners(), ownerById = new Map(owners.map(owner => [owner.id, owner]));
      this.rebuildOwners(owners);
      const diagnostics = this.engine.getAudioDiagnostics?.() || {}, stats = snapshot.total, available = snapshot.available !== false, contextState = this.engine.context?.state || (diagnostics.active ? 'active' : 'not started');
      const precision = snapshot.clock?.coarse ? `This audio worklet uses a coarse millisecond clock (${snapshot.clock.resolutionKnown === false ? 'at least ' : ''}${amount(snapshot.clock.resolutionMs || 1)} ms). Short timings are estimates; “< clock” does not mean free.` : snapshot.clock?.name && snapshot.clock.name !== 'unavailable' ? 'Timings are sampled wall time in GALLEY’s mixer and effect callback.' : 'The timing clock is not available yet.';
      const message = this.paused ? 'Readings held. Resume to collect new samples.' : this.active && pending ? 'Collecting the next profiling window; previous readings are shown until it arrives.' : !this.active ? 'Profiling paused while this hatch is hidden or out of view.' : !diagnostics.active ? 'Start playback or monitoring to open audio. This panel does not start audio itself.' : unsupported ? 'This browser does not expose a usable audio timing clock. Context information remains available.' : contextState === 'suspended' ? 'The audio context is suspended; timings are held until audio resumes.' : (warming ? 'Collecting timing samples. ' : '') + precision;
      text(this.element.querySelector('[data-cpu-message]'), message);
      this.element.querySelector('.cpu-load').dataset.cpuLoadState = finite(stats?.meanPercent) && stats.meanPercent >= 100 ? 'high' : finite(stats?.meanPercent) && stats.meanPercent >= 70 ? 'busy' : 'normal';
      for (const key of ['meanPercent', 'p95Ms', 'maxMs', 'overBudget']) text(this.element.querySelector(`[data-cpu-overview="${key}"]`), this.format(stats, key, snapshot));
      text(this.element.querySelector('[data-cpu-mean-ms]'), stats?.samples ? this.format(stats, 'meanMs', snapshot) + ' mean sampled wall time' : 'Waiting for audio');
      const budget = finite(snapshot.budgetMs) ? snapshot.budgetMs : diagnostics.processingMs;
      text(this.element.querySelector('[data-cpu-budget]'), 'Available block time: ' + (finite(budget) ? amount(budget) + ' ms' : '—'));
      const rows = new Map((snapshot.rows || []).map(row => [row.id, row]));
      for (const owner of this.element.querySelectorAll('[data-cpu-owner]')) {
        const id = owner.dataset.cpuOwner, row = rows.get(id);
        text(owner.querySelector('[data-cpu-owner-percent]'), this.format(row, 'meanPercent', snapshot)); text(owner.querySelector('[data-cpu-owner-time]'), this.format(row, 'meanMs', snapshot));
        const bar = owner.querySelector('[data-cpu-owner-bar]'); if (bar) { const transform = 'scaleX(' + Math.min(1, Math.max(0, (row?.meanPercent || 0) / 100)) + ')'; if (bar.style.transform !== transform) bar.style.transform = transform; }
        if (owner.open) for (const component of owner.querySelectorAll('[data-cpu-row]')) this.paintRow(component, rows.get(component.dataset.cpuRow), snapshot, ownerById);
      }
      if (this.element.querySelector('[data-cpu-stages-fold]').open) {
        const stageRows = (snapshot.rows || []).filter(row => row.kind === 'stage'), holder = this.element.querySelector('[data-cpu-stages]'), key = stageRows.map(row => row.id).join('|');
        if (holder.dataset.rows !== key) { holder.dataset.rows = key; holder.innerHTML = stageRows.map(row => this.component(row.id, row.label || row.id, { subtitle: row.id === 'engine' ? 'Inclusive engine processing' : 'Measured engine stage' })).join('') || '<p class="cpu-no-data">No stage timings yet.</p>'; }
        for (const component of holder.querySelectorAll('[data-cpu-row]')) this.paintRow(component, rows.get(component.dataset.cpuRow), snapshot, ownerById);
      }
      const hot = (snapshot.rows || []).filter(row => row.kind === 'effect' && row.active !== false && row.samples >= (snapshot.clock?.coarse ? 64 : 16) && finite(row.meanMs) && row.meanMs > 0 && ownerById.get(row.ownerId)?.effects?.[row.slot]?.type === row.effectType).sort((a, b) => b.meanMs - a.meanMs).slice(0, 5), items = this.element.querySelectorAll('[data-cpu-hotspots] li');
      items.forEach((item, index) => { const row = hot[index]; item.hidden = !row; if (!row) return; const owner = ownerById.get(row.ownerId), definition = (window.LoomEffectsCatalog || []).find(effect => effect.id === row.effectType); text(item.querySelector('strong'), definition?.name || row.effectType || 'Insert'); text(item.querySelector('small'), (owner ? ownerName(owner, owners.indexOf(owner)) : row.ownerId) + ' · slot ' + (Number(row.slot) + 1) + (row.bypassed ? ' · bypassed' : '')); text(item.querySelector('output'), this.format(row, 'meanMs', snapshot)); });
      const emptyHotspots = this.element.querySelector('[data-cpu-hotspots-empty]'), assignedInserts = owners.reduce((count, owner) => count + (owner.effects || []).filter(Boolean).length, 0); emptyHotspots.hidden = hot.length > 0; text(emptyHotspots, !assignedInserts ? 'No insert processors assigned.' : warming ? 'Collecting enough observations to compare inserts.' : snapshot.available && stats?.samples ? 'Insert timings are below the clock resolution. Longer sampling may reveal sustained differences.' : 'No insert timings yet.');
      const sequence = [reportRevision, snapshot.sampledBlocks].join(':');
      if (this.active && !pending && reportRevision !== null && sequence !== this.sequence && finite(stats?.meanPercent) && stats?.samples > 0) { this.sequence = sequence; const now = clockNow(); this.history.push({ time: now, value: stats.meanPercent }); this.history = this.history.filter(point => point.time >= now - 30000).slice(-120); }
      this.paintHistory();
      if (this.element.querySelector('[data-cpu-system-fold]').open) this.paintSystem(snapshot, diagnostics);
      const coverage = finite(snapshot.coverage) ? snapshot.coverage * 100 : finite(snapshot.processedBlocks) && snapshot.processedBlocks ? snapshot.sampledBlocks / snapshot.processedBlocks * 100 : null;
      text(this.element.querySelector('[data-cpu-coverage]'), `${Math.round(snapshot.sampledBlocks || 0).toLocaleString()} sampled / ${Math.round(snapshot.processedBlocks || 0).toLocaleString()} processed blocks${finite(coverage) ? ' · ' + amount(coverage) + '% observed' : ''}. Recent window: up to ${snapshot.windowSize || 256} samples. ${this.active ? 'Live' : 'Held'}; closing this hatch stops profiling.`);
    }
    paintHistory() {
      const maximum = Math.max(100, Math.ceil(Math.max(...this.history.map(point => point.value), 0) / 50) * 50), first = this.history[0]?.time || 0, last = this.history[this.history.length - 1]?.time || first, span = last - first;
      let line = '', area = '', segment = [], previous = null;
      const close = () => { if (!segment.length) return; area += 'M' + segment[0][0] + ',115' + segment.map(([x, y]) => 'L' + x + ',' + y).join('') + 'L' + segment[segment.length - 1][0] + ',115Z'; segment = []; };
      for (const point of this.history) {
        const x = (span > 0 ? (point.time - first) / span * 720 : 0).toFixed(1), y = (115 - Math.max(0, Math.min(maximum, point.value)) / maximum * 100).toFixed(1), gap = previous && point.time - previous.time > 1000;
        if (gap) close(); line += (!previous || gap ? 'M' : 'L') + x + ',' + y; segment.push([x, y]); previous = point;
      }
      close();
      const set = (selector, value) => { const element = this.element.querySelector(selector); if (element.getAttribute('d') !== value) element.setAttribute('d', value); };
      set('[data-cpu-history-line]', line); set('[data-cpu-history-area]', area);
      const y = 115 - 100 / maximum * 100; set('[data-cpu-history-budget]', 'M0 ' + y + 'H720');
      text(this.element.querySelector('[data-cpu-history-axis]'), maximum + '%');
      text(this.element.querySelector('[data-cpu-history-label]'), span > 0 ? amount(span / 1000) + ' seconds · sampled' : 'Waiting for sampled callbacks');
    }
    facts(holder, entries) {
      const key = entries.map(([label]) => label).join('|');
      if (holder.dataset.facts !== key) { holder.dataset.facts = key; holder.innerHTML = entries.map(([label]) => `<div><dt>${esc(label)}</dt><dd></dd></div>`).join(''); }
      [...holder.children].forEach((row, index) => text(row.querySelector('dd'), entries[index][1]));
    }
    paintSystem(snapshot, diagnostics) {
      const mode = diagnostics.mode || this.engine.mode || 'idle', heap = globalThis.performance?.memory;
      this.facts(this.element.querySelector('[data-cpu-facts]'), [
        ['Audio engine', mode === 'worklet' ? 'AudioWorklet' : mode === 'fallback' ? 'ScriptProcessor fallback' : 'Not started'], ['Context state', this.engine.context?.state || 'Not started'],
        ['Sample rate', finite(diagnostics.sampleRate) ? diagnostics.sampleRate.toLocaleString() + ' Hz' : '—'], ['Callback frames', diagnostics.processingFrames || snapshot.blockFrames || '—'],
        ['Block time', finite(diagnostics.processingMs) ? amount(diagnostics.processingMs) + ' ms' : '—'], ['Base latency', finite(diagnostics.baseLatencyMs) ? amount(diagnostics.baseLatencyMs) + ' ms' : 'Not reported'],
        ['Output latency', finite(diagnostics.outputLatencyMs) ? amount(diagnostics.outputLatencyMs) + ' ms' : 'Not reported'], ['Timing clock', snapshot.clock?.name ? snapshot.clock.name + (snapshot.clock.coarse ? ' · coarse estimates' : '') : 'Not available'],
        ['Clock resolution', finite(snapshot.clock?.resolutionMs) ? (snapshot.clock.resolutionKnown === false ? '≥' : '') + amount(snapshot.clock.resolutionMs) + ' ms' + (snapshot.clock.resolutionKnown === false ? ' · browser-dependent' : '') : 'Not reported'], ['Timer reads', Math.round(snapshot.timerReads || 0).toLocaleString()],
        ['Invalid timing samples', Math.round(snapshot.invalidTimings || 0).toLocaleString()], ['Reported JS heap', finite(heap?.usedJSHeapSize) ? amount(heap.usedJSHeapSize / 1048576) + ' MiB · browser estimate' : 'Not exposed by this browser']
      ]);
      this.facts(this.element.querySelector('[data-cpu-browser]'), [
        ['Monitor', !this.monitorUI ? 'Off' : this.active ? 'Watching visible interface' : 'Paused'], ['Long tasks ≥50 ms', this.monitorUI ? this.uiStats.supported ? this.uiStats.longTasks.toLocaleString() : 'Not supported' : '—'],
        ['Long-task wall time', this.monitorUI && this.uiStats.supported ? amount(this.uiStats.longTaskMs) + ' ms' : '—'], ['Longest task', this.monitorUI && this.uiStats.supported ? amount(this.uiStats.longestTaskMs) + ' ms' : '—'],
        ['Animation gaps >50 ms', this.monitorUI ? this.uiStats.frameGaps.toLocaleString() : '—'], ['Worst animation gap', this.monitorUI && this.uiStats.frames ? amount(this.uiStats.worstFrameMs) + ' ms' : '—']
      ]);
      const loaded = this.getState().tracks.filter(track => track.instrument).map(track => { const record = this.host?.records?.get(track.id); const name = window.LoomSchema?.instrumentName?.(track.instrument) || track.instrument.id; return name + ' on track ' + track.id.split('-')[1] + (record?.loaded ? record.soundEnabled ? ' · routed' : ' · loaded' : ' · saved patch'); });
      text(this.element.querySelector('[data-cpu-instruments]'), loaded.length ? loaded.join('; ') : 'No instruments loaded.');
    }
    startBrowserMonitor() {
      if (!this.monitorUI || !this.active || this.frame) return;
      this.lastFrame = null;
      if (typeof PerformanceObserver === 'function' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        try { this.longTaskObserver = new PerformanceObserver(list => { for (const entry of list.getEntries()) { this.uiStats.longTasks++; this.uiStats.longTaskMs += entry.duration; this.uiStats.longestTaskMs = Math.max(this.uiStats.longestTaskMs, entry.duration); } }); this.longTaskObserver.observe({ type: 'longtask', buffered: false }); this.uiStats.supported = true; } catch { this.uiStats.supported = false; }
      }
      const tick = now => { if (!this.active || !this.monitorUI || document.hidden || this.disposed) { this.frame = 0; return; } if (this.lastFrame !== null) { const gap = now - this.lastFrame; this.uiStats.frames++; this.uiStats.worstFrameMs = Math.max(this.uiStats.worstFrameMs, gap); if (gap > 50) this.uiStats.frameGaps++; } this.lastFrame = now; this.frame = requestAnimationFrame(tick); };
      this.frame = requestAnimationFrame(tick);
    }
    stopBrowserMonitor() { if (this.frame) cancelAnimationFrame(this.frame); this.frame = 0; this.lastFrame = null; this.longTaskObserver?.disconnect(); this.longTaskObserver = null; }
    download() {
      const snapshot = this.engine.getDiagnostics?.() || {}, diagnostics = this.engine.getAudioDiagnostics?.() || {}, report = { format: 'galley-cpu-diagnostics', version: 1, appVersion: window.LoomSchema?.VERSION || '', exportedAt: new Date().toISOString(), scope: 'GALLEY mixer, channel EQ and insert processing only; native instrument synthesis and per-voice effects excluded. Sampled elapsed time, not operating-system CPU usage.', profiling: Object.fromEntries(exportFields.filter(key => snapshot[key] !== undefined).map(key => [key, snapshot[key]])), rows: (snapshot.rows || []).map(row => Object.fromEntries(rowFields.filter(key => row[key] !== undefined).map(key => [key, row[key]]))), audio: { mode: diagnostics.mode, contextState: this.engine.context?.state || 'idle', sampleRate: diagnostics.sampleRate, callbackFrames: diagnostics.processingFrames, callbackMs: diagnostics.processingMs, baseLatencyMs: diagnostics.baseLatencyMs, outputLatencyMs: diagnostics.outputLatencyMs }, interfaceObservations: { enabled: this.monitorUI, ...this.uiStats } };
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })), link = document.createElement('a');
      link.href = url; link.download = 'GALLEY-CPU-diagnostics.json'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); this.status('CPU timing report downloaded. Audio, notes, patches and device identifiers are excluded.');
    }
    dispose() {
      if (this.disposed) return; this.setActive(false); this.disposed = true; clearTimeout(this.offscreenTimer); this.observer?.disconnect(); this.stopScrollGuard(); this.stopBrowserMonitor();
      document.removeEventListener('visibilitychange', this.visibilityChanged); this.element.removeEventListener('toggle', this.onToggle, true); this.element.removeEventListener('click', this.onClick); this.element.removeEventListener('change', this.onChange);
    }
  }
  window.LoomCPUInspector = LoomCPUInspector;
})();
