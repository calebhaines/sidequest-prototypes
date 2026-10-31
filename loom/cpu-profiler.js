/* GALLEY: sampled audio callback timing. A budget share, not system CPU usage. */
(function (scope) {
  'use strict';
  function createLoomCPUProfiler() {
    'use strict';
    const MODES = Object.freeze({ light: 16, balanced: 4, deep: 1 });
    const WINDOW = 256, BINS = 64;
    const finite = value => typeof value === 'number' && Number.isFinite(value);
    const clamp = (value, low, high, fallback) => finite(value) ? Math.max(low, Math.min(high, value)) : fallback;
    function normalizeConfig(value = {}, previous = {}) {
      return {
        enabled: typeof value.enabled === 'boolean' ? value.enabled : previous.enabled === true,
        mode: Object.prototype.hasOwnProperty.call(MODES, value.mode) ? value.mode : Object.prototype.hasOwnProperty.call(MODES, previous.mode) ? previous.mode : 'light',
        revision: Number.isSafeInteger(value.revision) && value.revision >= 0 ? value.revision : Number.isSafeInteger(previous.revision) && previous.revision >= 0 ? previous.revision : 0
      };
    }
    function defaultClock() {
      if (typeof globalThis.performance?.now === 'function') return { now: () => globalThis.performance.now(), name: 'performance.now', resolutionMs: null, coarse: false, resolutionKnown: false };
      if (typeof Date === 'function' && typeof Date.now === 'function') return { now: () => Date.now(), name: 'Date.now', resolutionMs: 1, coarse: true, resolutionKnown: false };
      return null;
    }
    function upperBounds(lowExponent, highExponent) {
      const values = new Float64Array(BINS); values[0] = 0;
      for (let index = 1; index < BINS - 1; index++) values[index] = Math.pow(2, lowExponent + (highExponent - lowExponent) * (index - 1) / (BINS - 3));
      values[BINS - 1] = Infinity; return values;
    }
    const timeBounds = upperBounds(-10, 6), loadBounds = upperBounds(-10, 12);
    function bucket(value, bounds) {
      if (value <= 0) return 0;
      let low = 1, high = BINS - 1;
      while (low < high) { const middle = (low + high) >>> 1; if (value <= bounds[middle]) high = middle; else low = middle + 1; }
      return low;
    }
    function newStats() { return { times: new Float64Array(WINDOW), loads: new Float64Array(WINDOW), calls: new Uint32Array(WINDOW), timeBins: new Uint8Array(WINDOW), loadBins: new Uint8Array(WINDOW), timeHistogram: new Uint32Array(BINS), loadHistogram: new Uint32Array(BINS), sumMs: 0, sumPercent: 0, windowCalls: 0, zeroSamples: 0, overBudget: 0, index: 0, count: 0, totalSamples: 0, totalCalls: 0 }; }
    function clearStats(stats) {
      for (const key of ['times', 'loads', 'calls', 'timeBins', 'loadBins', 'timeHistogram', 'loadHistogram']) stats[key].fill(0);
      stats.sumMs = stats.sumPercent = stats.windowCalls = stats.zeroSamples = stats.overBudget = stats.index = stats.count = stats.totalSamples = stats.totalCalls = 0;
    }
    function record(stats, elapsed, budget, calls) {
      const at = stats.index;
      if (stats.count === WINDOW) {
        stats.sumMs -= stats.times[at]; stats.sumPercent -= stats.loads[at]; stats.windowCalls -= stats.calls[at];
        if (stats.times[at] === 0) stats.zeroSamples--; if (stats.loads[at] > 100) stats.overBudget--;
        stats.timeHistogram[stats.timeBins[at]]--; stats.loadHistogram[stats.loadBins[at]]--;
      }
      const load = budget > 0 ? elapsed * 100 / budget : 0, timeBin = bucket(elapsed, timeBounds), loadBin = bucket(load, loadBounds);
      stats.times[at] = elapsed; stats.loads[at] = load; stats.calls[at] = calls; stats.timeBins[at] = timeBin; stats.loadBins[at] = loadBin;
      stats.sumMs += elapsed; stats.sumPercent += load; stats.windowCalls += calls;
      if (elapsed === 0) stats.zeroSamples++; if (load > 100) stats.overBudget++;
      stats.timeHistogram[timeBin]++; stats.loadHistogram[loadBin]++;
      stats.index = (at + 1) % WINDOW; stats.count = Math.min(WINDOW, stats.count + 1); stats.totalSamples++; stats.totalCalls += calls;
    }
    function percentileBucket(histogram, count) {
      const rank = Math.max(1, Math.ceil(count * .95)); let sum = 0, index = 0;
      while (index < BINS - 1) { sum += histogram[index]; if (sum >= rank) break; index++; }
      return index;
    }
    function summarize(stats, available, estimated) {
      const samples = stats.count;
      const result = { samples, totalSamples: stats.totalSamples, calls: stats.totalCalls, windowCalls: stats.windowCalls, meanMs: null, p95Ms: null, p95MsLower: null, p95MsUpper: null, maxMs: null, meanPercent: null, p95Percent: null, p95PercentLower: null, p95PercentUpper: null, maxPercent: null, overBudget: stats.overBudget, zeroSamples: stats.zeroSamples, estimated, percentileMethod: 'histogram', percentileBins: BINS };
      if (!available || !samples || !stats.windowCalls) return result;
      let max = 0, loadMax = 0;
      for (let index = 0; index < samples; index++) {
        const elapsed = stats.times[index], load = stats.loads[index];
        max = Math.max(max, elapsed); loadMax = Math.max(loadMax, load);
      }
      const timeBin = percentileBucket(stats.timeHistogram, samples), loadBin = percentileBucket(stats.loadHistogram, samples);
      result.meanMs = Math.max(0, stats.sumMs / samples); result.maxMs = max;
      result.p95MsLower = timeBin === 0 ? 0 : timeBounds[timeBin - 1]; result.p95MsUpper = timeBin === BINS - 1 ? max : Math.min(timeBounds[timeBin], max); result.p95Ms = result.p95MsUpper;
      result.meanPercent = Math.max(0, stats.sumPercent / samples); result.maxPercent = loadMax;
      result.p95PercentLower = loadBin === 0 ? 0 : loadBounds[loadBin - 1]; result.p95PercentUpper = loadBin === BINS - 1 ? loadMax : Math.min(loadBounds[loadBin], loadMax); result.p95Percent = result.p95PercentUpper;
      return result;
    }
    function descriptor(raw) {
      return { id: String(raw.id), kind: typeof raw.kind === 'string' ? raw.kind : 'stage', ownerId: typeof raw.ownerId === 'string' ? raw.ownerId : null, slot: Number.isInteger(raw.slot) ? raw.slot : null, effectType: typeof raw.effectType === 'string' ? raw.effectType : null, identity: typeof raw.identity === 'string' ? raw.identity : null, label: typeof raw.label === 'string' ? raw.label : String(raw.id), bypassed: raw.bypassed === true, active: raw.active !== false };
    }
    function sameIdentity(a, b) { return a.id === b.id && a.kind === b.kind && a.ownerId === b.ownerId && a.slot === b.slot && a.effectType === b.effectType && a.identity === b.identity; }
    class Runtime {
      constructor(sampleRate = 48000, options = {}) {
        this.sampleRate = clamp(sampleRate, 8000, 192000, 48000);
        const supplied = options.clock;
        this.clock = supplied === null ? null : typeof supplied === 'function' ? { now: supplied, name: 'injected', resolutionMs: null, coarse: false, resolutionKnown: false } : supplied && typeof supplied.now === 'function' ? { name: 'injected', resolutionMs: null, coarse: false, resolutionKnown: finite(supplied.resolutionMs), ...supplied } : defaultClock();
        this.available = Boolean(this.clock && typeof this.clock.now === 'function');
        this.config = normalizeConfig(options); this.enabled = this.config.enabled; this.mode = this.config.mode; this.revision = this.config.revision;
        this.rows = []; this.rowIndex = new Map(); this.durations = new Float64Array(0); this.touched = new Uint8Array(0); this.stageCalls = new Uint32Array(0); this.total = newStats();
        this.current = false; this.processedBlocks = 0; this.processedFrames = 0; this.sampledBlocks = 0; this.sampledFrames = 0; this.validSampledBlocks = 0; this.validSampledFrames = 0; this.invalidTimings = 0; this.timerReads = 0; this.blockFrames = 0; this.budgetMs = 0; this.observedResolutionMs = null; this._dueFrames = 0; this._cursor = 0; this._seed = 0x6d2b79f5; this._offset = 0; this._stamp = NaN; this._lastStamp = NaN; this._bad = false;
      }
      configure(value = {}) {
        const next = normalizeConfig(value, this.config);
        if (next.mode !== this.mode) { this._cursor = 0; this._seed = 0x6d2b79f5; this._offset = 0; }
        this.config = next; this.enabled = next.enabled; this.mode = next.mode; this.revision = next.revision;
        if (!this.enabled) this.current = false;
        return { ...next };
      }
      setTopology(descriptors = []) {
        const seen = new Set(), next = [];
        for (const raw of descriptors) if (raw && typeof raw.id === 'string' && raw.id && !seen.has(raw.id)) { seen.add(raw.id); next.push(descriptor(raw)); }
        if (next.length === this.rows.length && next.every((meta, index) => sameIdentity(meta, this.rows[index]))) {
          for (let index = 0; index < next.length; index++) Object.assign(this.rows[index], next[index]);
          return;
        }
        const old = new Map(this.rows.map(row => [row.id, row]));
        this.rows = next.map(meta => { const row = old.get(meta.id); return { ...meta, stats: row && sameIdentity(row, meta) ? row.stats : newStats() }; });
        this.rowIndex = new Map(this.rows.map((row, index) => [row.id, index]));
        this.durations = new Float64Array(this.rows.length); this.touched = new Uint8Array(this.rows.length); this.stageCalls = new Uint32Array(this.rows.length);
        if (this.current) this._bad = true;
      }
      reset() {
        clearStats(this.total); for (const row of this.rows) clearStats(row.stats);
        this.current = false; this.processedBlocks = this.processedFrames = this.sampledBlocks = this.sampledFrames = this.validSampledBlocks = this.validSampledFrames = this.invalidTimings = this.timerReads = this.blockFrames = this.budgetMs = this._dueFrames = this._cursor = 0;
        this.observedResolutionMs = null; this._stamp = this._lastStamp = NaN; this._seed = 0x6d2b79f5; this._offset = 0; this._bad = false;
      }
      _now() {
        this.timerReads++;
        let stamp;
        try { stamp = this.clock.now(); } catch { stamp = NaN; }
        if (!finite(stamp)) { this._bad = true; return NaN; }
        if (finite(this._lastStamp)) {
          const delta = stamp - this._lastStamp;
          if (delta < 0 || this.clock.coarse === true && delta > 1000) this._bad = true;
          if (delta > 0 && (this.observedResolutionMs === null || delta < this.observedResolutionMs)) this.observedResolutionMs = delta;
        }
        this._lastStamp = stamp; return stamp;
      }
      begin(frames) {
        this.current = false;
        if (!this.enabled) return false;
        const count = Math.max(1, Math.floor(clamp(frames, 1, 1048576, 128)));
        this.blockFrames = count; this.budgetMs = count * 1000 / this.sampleRate;
        this.processedBlocks++; this.processedFrames += count; this._dueFrames += count;
        const stride = MODES[this.mode], cursor = this._cursor++, group = Math.floor(cursor / stride), within = cursor % stride;
        // One sample per group, with a seeded xorshift offset in each group.
        // Fixed every-sixteenth-block sampling can alias a musical loop or FFT.
        if (within === 0) {
          if (group === 0) this._offset = 0;
          else { this._seed ^= this._seed << 13; this._seed ^= this._seed >>> 17; this._seed ^= this._seed << 5; this._offset = (this._seed >>> 0) & (stride - 1); }
        }
        const selected = within === this._offset;
        if (!selected || !this.available) return false;
        this.current = true; this.sampledBlocks++; this.sampledFrames += count; this._bad = false; this._lastStamp = NaN;
        this.durations.fill(0); this.touched.fill(0); this.stageCalls.fill(0);
        this._stamp = this._now(); return true;
      }
      start(id) { return this.current && this.rowIndex.has(id) ? this._now() : NaN; }
      endStage(id, stamp) {
        if (!this.current || !finite(stamp)) return;
        const index = this.rowIndex.get(id); if (index === undefined) return;
        const end = this._now(), elapsed = end - stamp;
        if (!finite(elapsed) || elapsed < 0 || this.clock.coarse === true && elapsed > 1000) { this._bad = true; return; }
        this.durations[index] += elapsed; this.touched[index] = 1; this.stageCalls[index]++;
      }
      finish() {
        if (!this.current) return;
        const elapsed = this._now() - this._stamp;
        this.current = false;
        if (this._bad || !finite(elapsed) || elapsed < 0 || this.clock.coarse === true && elapsed > 1000) { this.invalidTimings++; return; }
        record(this.total, elapsed, this.budgetMs, 1); this.validSampledBlocks++; this.validSampledFrames += this.blockFrames;
        // Every row uses the same callback window. An absent execution adds a
        // zero contribution; a window with no calls still reports null timing.
        for (let index = 0; index < this.rows.length; index++) record(this.rows[index].stats, this.durations[index], this.budgetMs, this.stageCalls[index]);
      }
      consumeReportDue() {
        if (!this.enabled || this._dueFrames < this.sampleRate * .25) return false;
        this._dueFrames %= this.sampleRate * .25; return true;
      }
      getSnapshot() {
        const estimated = this.clock?.coarse === true;
        return { enabled: this.enabled, mode: this.mode, revision: this.revision, status: !this.available ? 'unsupported' : !this.enabled ? this.processedBlocks ? 'paused' : 'idle' : this.total.count ? 'running' : 'collecting', available: this.available,
          clock: { name: this.clock?.name || 'unavailable', resolutionMs: finite(this.clock?.resolutionMs) ? this.clock.resolutionMs : null, observedResolutionMs: this.observedResolutionMs, coarse: estimated, resolutionKnown: this.clock?.resolutionKnown === true },
          sampleRate: this.sampleRate, blockFrames: this.blockFrames, budgetMs: this.budgetMs, processedBlocks: this.processedBlocks, sampledBlocks: this.sampledBlocks, validSampledBlocks: this.validSampledBlocks, sampledFrames: this.sampledFrames, validSampledFrames: this.validSampledFrames, coverage: this.processedBlocks ? this.sampledBlocks / this.processedBlocks : 0, elapsedSeconds: this.processedFrames / this.sampleRate, windowSize: WINDOW, estimated,
          total: summarize(this.total, this.available, estimated), rows: this.rows.map(row => {
            const result = summarize(row.stats, this.available, estimated);
            result.id = row.id; result.kind = row.kind; result.ownerId = row.ownerId; result.slot = row.slot; result.effectType = row.effectType; result.label = row.label; result.bypassed = row.bypassed; result.active = row.active;
            return result;
          }), timerReads: this.timerReads, invalidTimings: this.invalidTimings };
      }
    }
    return { Runtime, normalizeConfig, MODES, WINDOW, BINS };
  }
  scope.createLoomCPUProfiler = createLoomCPUProfiler;
})(typeof window === 'undefined' ? globalThis : window);
