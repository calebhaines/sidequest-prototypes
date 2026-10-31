/* GALLEY · four sample-clock modulation sources. No recursive signal graphs. */
(function (scope) {
  'use strict';
  function createLoomLFODSP() {
    'use strict';
    const COUNT = 4, MAX_ROUTES = 16, CONTROL_FRAMES = 32;
    const clamp = (v, lo, hi, fallback = lo) => typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
    const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
    const waves = ['sine', 'triangle', 'saw', 'ramp', 'square', 'hold', 'random'];
    const parameters = Object.freeze({
      rate: { label: 'Free rate', min: .01, max: 40, step: .01, default: 1, unit: 'Hz', scale: 'log' },
      division: { label: 'Cycle length', min: .0625, max: 128, step: .0625, default: 4, unit: 'beats', scale: 'log' },
      depth: { label: 'Depth', min: 0, max: 1, step: .01, default: 1, unit: '' },
      offset: { label: 'Offset', min: -1, max: 1, step: .01, default: 0, unit: '' },
      phase: { label: 'Phase', min: 0, max: 1, step: .01, default: 0, unit: 'turn' },
      symmetry: { label: 'Symmetry', min: .05, max: .95, step: .01, default: .5, unit: '' },
      smoothing: { label: 'Smoothing', min: 0, max: 1000, step: 1, default: 10, unit: 'ms' }
    });
    const defaultLFOs = () => Array.from({ length: COUNT }, (_, index) => ({ id: 'lfo-' + (index + 1), enabled: false, wave: 'sine', sync: true, ...Object.fromEntries(Object.entries(parameters).map(([key, d]) => [key, d.default])), retrigger: 'transport', routes: [] }));
    const logTarget = d => d.min > 0 && (d.scale === 'log' || /(?:cutoff|freq|frequency|crossover|damping|sidechain|lowcut|highcut|lowpass|highpass|tone|rate|division|wowrate|flutterrate)$/i.test(d.target.split(':').pop()));
    function targets(state, automationTargets, specifications) {
      const result = [], owners = [...(state?.tracks || []), ...(state?.returns || []), ...(state?.master ? [state.master] : [])];
      for (const owner of owners) {
        let descriptors;
        if (typeof automationTargets === 'function') descriptors = automationTargets(owner);
        else {
          const master = owner.id === 'master', track = /^track-[1-8]$/.test(owner.id);
          descriptors = [{ target: 'level', label: 'Volume', min: 0, max: 1.5, step: .01, default: master || track ? .8 : 1, value: owner.level }];
          if (!master) descriptors.push({ target: 'pan', label: 'Pan', min: -1, max: 1, step: .01, default: 0, value: owner.pan });
          if (track) {
            for (let index = 0; index < 2; index++) descriptors.push({ target: 'send:' + index, label: 'Send ' + (index ? 'B' : 'A'), min: 0, max: 1, step: .01, default: 0, value: owner.sends?.[index] });
            for (const key of ['low', 'lowMid', 'highMid', 'high']) descriptors.push({ target: 'eq:' + key, label: 'EQ ' + key, min: -12, max: 12, step: .1, default: 0, value: owner.eq?.[key], unit: 'dB' });
            for (const [key, label, min, max, value] of [['lowMidFreq', 'Lo mid sweep', 80, 2000, 400], ['highMidFreq', 'Hi mid sweep', 400, 10000, 2500]]) descriptors.push({ target: 'eq:' + key, label: 'EQ ' + label, min, max, step: 1, default: value, value: owner.eq?.[key], unit: 'Hz', scale: 'log' });
          }
          for (let slot = 0; slot < (track ? 5 : 4); slot++) {
            const effect = owner.effects?.[slot], spec = specifications?.[effect?.type];
            if (!spec) continue;
            for (const [key, rule] of Object.entries(spec)) if (typeof rule[0] === 'number') descriptors.push({ target: 'fx:' + slot + ':' + key, label: (slot + 1) + ' · ' + effect.type + ' · ' + key, min: rule[0], max: rule[1], step: .001, default: rule[2], value: effect.params?.[key], effectType: effect.type });
          }
        }
        const group = owner.id === 'master' ? 'Master' : /^return-/.test(owner.id) ? owner.name || owner.id : 'Track ' + (Number(owner.id.split('-')[1]) || 1) + ' · ' + (owner.name || '');
        for (const descriptor of descriptors) result.push({ ...descriptor, ownerId: owner.id, key: owner.id + '|' + descriptor.target, group, scale: logTarget(descriptor) ? 'log' : 'linear', value: clamp(descriptor.value, descriptor.min, descriptor.max, descriptor.default) });
      }
      const lfos = state?.lfos || defaultLFOs();
      for (let index = 0; index < COUNT; index++) for (const [key, d] of Object.entries(parameters)) result.push({ ...d, ownerId: 'lfo-' + (index + 1), target: key, key: 'lfo-' + (index + 1) + '|' + key, group: 'LFO ' + (index + 1), scale: d.scale || 'linear', value: clamp(lfos[index]?.[key], d.min, d.max, d.default) });
      return result;
    }
    function normalize(raw, state, definitions = targets(state)) {
      const available = new Map(definitions.map(d => [d.key, d]));
      return defaultLFOs().map((base, index) => {
        const value = plain(raw?.[index]) ? raw[index] : {}, result = { ...base, enabled: value.enabled === true, wave: waves.includes(value.wave) ? value.wave : 'sine', sync: typeof value.sync === 'boolean' ? value.sync : true, retrigger: value.retrigger === 'loop' ? 'loop' : 'transport' };
        for (const [key, d] of Object.entries(parameters)) result[key] = clamp(value[key], d.min, d.max, d.default);
        const seen = new Set(), ids = new Set();
        for (const [routeIndex, route] of (Array.isArray(value.routes) ? value.routes : []).slice(0, MAX_ROUTES).entries()) {
          const key = route?.ownerId + '|' + route?.target, descriptor = available.get(key);
          if (!plain(route) || !descriptor || seen.has(key) || descriptor.effectType && route.effectType !== descriptor.effectType) continue;
          seen.add(key);
          let id = typeof route.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(route.id) ? route.id : base.id + '-route-' + (routeIndex + 1);
          if (ids.has(id)) id = base.id + '-route-' + (routeIndex + 1); ids.add(id);
          const normalized = { id, ownerId: descriptor.ownerId, target: descriptor.target, amount: clamp(route.amount, -1, 1, .25), enabled: typeof route.enabled === 'boolean' ? route.enabled : true };
          if (descriptor.effectType) normalized.effectType = descriptor.effectType;
          if (Array.isArray(route.gate)) { const points = new Map(); for (const point of route.gate.slice(0, 4096)) if (Number.isFinite(point?.beat) && (point.value === 0 || point.value === 1)) points.set(clamp(point.beat, 0, 256, 0), point.value); normalized.gate = [...points].sort((a,b) => a[0]-b[0]).map(([beat,value]) => ({beat,value})); }
          result.routes.push(normalized);
        }
        return result;
      });
    }
    function validate(raw, state, definitions = targets(state)) {
      if (raw === undefined) return;
      if (!Array.isArray(raw) || raw.length !== COUNT) throw Error('A GALLEY project must contain four LFOs.');
      const descriptors = new Map(definitions.map(d => [d.key, d]));
      for (let index = 0; index < COUNT; index++) {
        const value = raw[index], seen = new Set(), ids = new Set();
        if (!plain(value) || value.id !== 'lfo-' + (index + 1) || typeof value.enabled !== 'boolean' || !waves.includes(value.wave) || typeof value.sync !== 'boolean' || !['transport', 'loop'].includes(value.retrigger) || !Array.isArray(value.routes) || value.routes.length > MAX_ROUTES) throw Error('An LFO contains invalid controls or too many targets.');
        for (const [key, d] of Object.entries(parameters)) if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < d.min || value[key] > d.max) throw Error('An LFO control is outside its valid range.');
        for (const route of value.routes) {
          const key = route?.ownerId + '|' + route?.target, descriptor = descriptors.get(key);
          if (!plain(route) || typeof route.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(route.id) || ids.has(route.id) || !descriptor || seen.has(key) || typeof route.enabled !== 'boolean' || typeof route.amount !== 'number' || !Number.isFinite(route.amount) || route.amount < -1 || route.amount > 1 || descriptor.effectType && route.effectType !== descriptor.effectType || !descriptor.effectType && route.effectType !== undefined) throw Error('An LFO target is invalid or no longer matches its effect.');
          if (route.gate !== undefined) { if (!Array.isArray(route.gate) || route.gate.length > 4096) throw Error('An LFO target contains too many or invalid performance gates.'); let previous = -1; for (const point of route.gate) { if (!plain(point) || !Number.isFinite(point.beat) || point.beat < 0 || point.beat > 256 || point.beat <= previous || point.value !== 0 && point.value !== 1) throw Error('An LFO target contains invalid performance gate points.'); previous = point.beat; } }
          seen.add(key); ids.add(route.id);
        }
      }
    }
    function randomValue(cycle, seed) {
      let n = (Math.imul((Math.floor(cycle) | 0) ^ Math.imul(seed + 1, 0x9e3779b9), 0x85ebca6b) + 0x165667b1) | 0;
      n ^= n >>> 16; n = Math.imul(n, 0x7feb352d); n ^= n >>> 15; n = Math.imul(n, 0x846ca68b); n ^= n >>> 16;
      return (n >>> 0) / 2147483648 - 1;
    }
    function evaluateWave(wave, phase, symmetry = .5, seed = 0) {
      const cycle = Math.floor(phase), p = phase - cycle, duty = clamp(symmetry, .05, .95, .5), warped = p < duty ? p / duty * .5 : .5 + (p - duty) / (1 - duty) * .5;
      if (wave === 'triangle') return 1 - 4 * Math.abs(warped - .5);
      if (wave === 'saw') return 1 - 2 * warped;
      if (wave === 'ramp') return 2 * warped - 1;
      if (wave === 'square') return p < duty ? 1 : -1;
      if (wave === 'hold') return randomValue(cycle, seed);
      if (wave === 'random') { const a = randomValue(cycle, seed), b = randomValue(cycle + 1, seed), f = p * p * (3 - 2 * p); return a + (b - a) * f; }
      return Math.sin(2 * Math.PI * warped);
    }
    function mapValue(base, amount, d) {
      const source = clamp(base, d.min, d.max, d.default);
      if (!amount) return source;
      if (d.scale === 'log' && d.min > 0) return Math.exp(Math.log(d.min) + clamp((Math.log(source) - Math.log(d.min)) / Math.log(d.max / d.min) + amount, 0, 1) * Math.log(d.max / d.min));
      return clamp(source + amount * (d.max - d.min), d.min, d.max, d.default);
    }
    function gateValue(points, beat) {
      if (!points?.length || beat < points[0].beat) return 1;
      let lo = 0, hi = points.length - 1; while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (points[mid].beat <= beat) lo = mid; else hi = mid - 1; } return points[lo].value;
    }
    class Runtime {
      constructor(sampleRate, state, definitions) {
        this.sampleRate = clamp(sampleRate, 8000, 192000, 48000); this.entries = new Map(); this.output = new Float64Array(COUNT); this.previous = new Float64Array(COUNT); this.phase = new Float64Array(COUNT); this.effective = defaultLFOs(); this.lastBeat = null; this.initialized = false;
        this.setState(state, definitions); this.reset(0, state?.tempo || 120);
      }
      setState(state, definitions) {
        this.configurationDirty = true; this.state = state || {}; this.definitions = definitions || targets(state); this.descriptors = new Map(this.definitions.map(d => [d.key, d])); this.lfos = normalize(state?.lfos, state, this.definitions); this.routes = [];
        const retained = new Map();
        for (const entry of this.entries.values()) for (const route of entry.routes) { route.retired = true; retained.set(route.identity, route); }
        for (let index = 0; index < COUNT; index++) for (const route of this.lfos[index].routes) {
          if (!route.enabled) continue;
          const key = route.ownerId + '|' + route.target, descriptor = this.descriptors.get(key);
          if (!descriptor || descriptor.effectType && route.effectType !== descriptor.effectType) continue;
          const identity = index + '|' + route.id + '|' + key + '|' + (descriptor.effectType || '');
          const item = retained.get(identity) || { identity, delta: 0, goal: 0 }; Object.assign(item, { index, amount: route.amount, key, descriptor, gate: route.gate, retired: false }); this.routes.push(item);
          if (route.ownerId.startsWith('lfo-')) continue;
          let entry = this.entries.get(key);
          if (entry && entry.descriptor.effectType !== descriptor.effectType) { this.entries.delete(key); entry = null; }
          if (!entry) { entry = { key, descriptor, routes: [], delta: 0, values: null }; this.entries.set(key, entry); }
          entry.descriptor = descriptor; if (!entry.routes.includes(item)) entry.routes.push(item);
        }
        for (const [key, entry] of this.entries) {
          entry.routes = entry.routes.filter(route => !route.retired || Math.abs(route.delta) > 1e-10);
          if (!this.descriptors.has(key) || this.descriptors.get(key).effectType !== entry.descriptor.effectType || !entry.routes.length) this.entries.delete(key);
        }
        this.effectTargetKeys = new Map();
        for (const entry of this.entries.values()) {
          const match = /^fx:([0-4]):(.+)$/.exec(entry.descriptor.target); if (!match) continue;
          const key = entry.descriptor.ownerId + '|' + match[1]; if (!this.effectTargetKeys.has(key)) this.effectTargetKeys.set(key, []); this.effectTargetKeys.get(key).push(match[2]);
        }
        this.active = this.entries.size > 0 || this.lfos.some(lfo => lfo.enabled);
      }
      reset(beat = 0, tempo = 120) {
        for (let index = 0; index < COUNT; index++) { const lfo = this.lfos[index]; this.phase[index] = lfo.sync ? beat / lfo.division : beat * 60 / clamp(tempo, 40, 240, 120) * lfo.rate; this.output[index] = this.previous[index] = 0; this.effective[index] = { ...lfo }; }
        for (const entry of this.entries.values()) { entry.delta = 0; for (const route of entry.routes) route.delta = route.goal = 0; }
        this.lastBeat = beat; this.initialized = true;
      }
      has(ownerId, target) { return this.entries.has(ownerId + '|' + target); }
      effectKeys(ownerId, slot) { return this.effectTargetKeys.get(ownerId + '|' + slot) || []; }
      apply(ownerId, target, frame, base) { const entry = this.entries.get(ownerId + '|' + target); return entry ? mapValue(base, entry.values?.[frame] || 0, entry.descriptor) : base; }
      _tick(tempo, beat, running) {
        this.previous.set(this.output);
        // Every cross/self modulation reads one common previous-tick snapshot.
        // This bounded, causal feedback cannot recurse or depend on LFO order.
        for (let index = 0; index < COUNT; index++) {
          const lfo = this.lfos[index], next = this.effective[index];
          if (running || this.configurationDirty) for (const [key, d] of Object.entries(parameters)) {
            let delta = 0;
            for (const route of this.routes) if (route.descriptor.ownerId === lfo.id && route.descriptor.target === key && this.lfos[route.index].enabled) delta += this.previous[route.index] * route.amount * gateValue(route.gate, beat);
            next[key] = mapValue(lfo[key], delta, d);
          }
          const wave = evaluateWave(lfo.wave, this.phase[index] + next.phase, next.symmetry, index), goal = lfo.enabled ? clamp(wave * next.depth + next.offset, -1, 1, 0) : 0;
          const slew = next.smoothing > 0 ? 1 - Math.exp(-CONTROL_FRAMES / (this.sampleRate * next.smoothing * .001)) : 1;
          this.output[index] += (goal - this.output[index]) * slew;
          if (Math.abs(goal - this.output[index]) < 1e-12) this.output[index] = goal;
          next.frequency = lfo.sync ? tempo / (60 * next.division) : next.rate;
        }
        this.configurationDirty = false;
        for (const entry of this.entries.values()) for (const route of entry.routes) route.goal = route.retired ? 0 : this.output[route.index] * route.amount;
      }
      render(beats, playing, countIn, sampleClock, tempo, liveGate) {
        if (!this.active) return;
        const length = beats.length, slew = 1 - Math.exp(-1 / (this.sampleRate * .006));
        for (const entry of this.entries.values()) if (entry.values?.length !== length) entry.values = new Float64Array(length);
        for (let frame = 0; frame < length; frame++) {
          const running = playing[frame] === 1 && countIn[frame] === 0, beat = beats[frame];
          if (running && this.lastBeat !== null && beat < this.lastBeat - 1e-8) for (let index = 0; index < COUNT; index++) if (this.lfos[index].retrigger === 'loop') this.phase[index] = 0;
          if ((sampleClock + frame) % CONTROL_FRAMES === 0) this._tick(tempo, beat, running);
          for (const entry of this.entries.values()) { let delta = 0; for (const route of entry.routes) { route.delta += (route.goal - route.delta) * slew; if (Math.abs(route.goal - route.delta) < 1e-12) route.delta = route.goal; delta += route.delta * gateValue(route.gate, beat); } if (liveGate) delta *= liveGate(entry.descriptor.ownerId, entry.descriptor.target, beat); entry.values[frame] = entry.delta = clamp(delta, -16, 16, 0); }
          if (running) for (let index = 0; index < COUNT; index++) this.phase[index] += (this.effective[index].frequency || (this.lfos[index].sync ? tempo / (60 * this.lfos[index].division) : this.lfos[index].rate)) / this.sampleRate;
          this.lastBeat = beat;
        }
      }
      getMeters(baseValue) {
        const values = {};
        for (const entry of this.entries.values()) { const d = entry.descriptor, base = typeof baseValue === 'function' ? baseValue(d.ownerId, d.target) : d.value; values[entry.key] = mapValue(base, entry.delta, d); }
        for (let index = 0; index < COUNT; index++) for (const key of Object.keys(parameters)) values['lfo-' + (index + 1) + '|' + key] = this.effective[index][key];
        return { outputs: Array.from(this.output), phases: Array.from(this.phase, (value, index) => ((value + this.effective[index].phase) % 1 + 1) % 1), values };
      }
    }
    return { COUNT, MAX_ROUTES, CONTROL_FRAMES, waves, parameters, defaultLFOs, targets, normalize, validate, evaluateWave, mapValue, gateValue, Runtime };
  }
  scope.createLoomLFODSP = createLoomLFODSP;
})(typeof window === 'undefined' ? globalThis : window);
