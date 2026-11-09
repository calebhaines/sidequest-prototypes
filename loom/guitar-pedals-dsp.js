/* BOARD · four original guitar pedals, with a component-derived stock BD-2 study. */
(function (scope) {
  'use strict';
  function createLoomGuitarPedalsDSP() {
    'use strict';
    // Self-contained: this factory is serialized unchanged into AudioWorklet.
    const PI = Math.PI, TAU = 2 * PI, TYPES = ['none', 'bluesdriver', 'screamer', 'rodent', 'fuzz', 'compressor', 'wah', 'chorus', 'phaser', 'delay', 'reverb'];
    const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
    const finite = (x, otherwise) => typeof x === 'number' && Number.isFinite(x) ? x : otherwise;
    const db = x => Math.pow(10, x / 20), dbfs = x => Math.max(-120, 20 * Math.log10(Math.max(1e-6, x)));
    const safe = x => typeof x === 'number' && x >= -64 && x <= 64 ? x : Number.isFinite(x) ? clamp(x, -64, 64) : 0;
    const specifications = { input: [-24, 24, 0], output: [-24, 12, 0], quality: ['high', 'eco'], mix: [0, 1, 1] };
    const localRules = { Type: TYPES, Enabled: ['on', 'off'], Drive: [0, 1, .35], Tone: [0, 1, .5], Volume: [0, 1, .5], Level: [-24, 18, 0], Mix: [0, 1, 1], Rate: [.05, 12, 1], Depth: [0, 1, .5], Time: [20, 1500, 350], Feedback: [0, .92, .35], Value: [0, 1, .5], ChorusDelay: [2, 30, 12], WahMode: ['manual', 'auto'], PhaserStages: ['4', '6'], DelayMode: ['analog', 'digital'], Clock: ['free', 'sync'], Division: ['1/4', '1/8', '1/8.', '1/16', '1/2', '1', '2'], ReverbMode: ['spring', 'room'], Attack: [.5, 50, 8], Release: [20, 800, 160], Predelay: [0, 180, 20], Decay: [.2, 8, 2] };
    for (let index = 1; index <= 4; index++) for (const key of Object.keys(localRules)) specifications['pedal' + index + key] = key === 'Type' && index === 1 ? ['bluesdriver', ...TYPES.filter(type => type !== 'bluesdriver')] : localRules[key];
    const normalized = (key, value) => { if (key === 'bypass') return value === true; const rule = specifications[key]; return typeof rule[0] === 'number' ? clamp(finite(value, rule[2]), rule[0], rule[1]) : rule.includes(value) ? value : rule[0]; };
    function normalize(value) { const result = {}, source = value && typeof value === 'object' ? value : {}; for (const key of Object.keys(specifications)) result[key] = normalized(key, source[key]); result.bypass = source.bypass === true; return result; }
    const divisions = { '1/16': .25, '1/8': .5, '1/8.': .75, '1/4': 1, '1/2': 2, '1': 4, '2': 8 };
    const taper = x => (Math.pow(10, 2 * x) - 1) / 99;

    function inverse(matrix, count) {
      const width = count * 2, rows = new Float64Array(count * width);
      for (let i = 0; i < count; i++) for (let j = 0; j < count; j++) { rows[i * width + j] = matrix[i * count + j]; rows[i * width + count + j] = i === j ? 1 : 0; }
      for (let i = 0; i < count; i++) {
        let pivot = i; for (let row = i + 1; row < count; row++) if (Math.abs(rows[row * width + i]) > Math.abs(rows[pivot * width + i])) pivot = row;
        if (Math.abs(rows[pivot * width + i]) < 1e-16) throw Error('BOARD circuit has a singular conductance matrix.');
        if (pivot !== i) for (let col = 0; col < width; col++) { const v = rows[i * width + col]; rows[i * width + col] = rows[pivot * width + col]; rows[pivot * width + col] = v; }
        const scale = 1 / rows[i * width + i]; for (let col = 0; col < width; col++) rows[i * width + col] *= scale;
        for (let row = 0; row < count; row++) if (row !== i) { const value = rows[row * width + i]; for (let col = 0; col < width; col++) rows[row * width + col] -= value * rows[i * width + col]; }
      }
      const result = new Float64Array(count * count); for (let i = 0; i < count; i++) for (let j = 0; j < count; j++) result[i * count + j] = rows[i * width + count + j]; return result;
    }
    // Two series switching diodes in each direction. Parameters are nominal
    // silicon estimates, not a measured fit of one particular 1SS133 specimen.
    const diodeVt = 2 * 1.75 * .02585, diodeIs = 2.5e-9;
    function solveDiode(input, resistance) {
      const sign = input < 0 ? -1 : 1, b = Math.abs(input), k = resistance * diodeIs;
      let lo = 0, hi = Math.min(b, diodeVt * Math.log1p(b / Math.max(1e-30, k))), value = hi;
      for (let i = 0; i < 12; i++) { const a = Math.exp(Math.min(40, value / diodeVt)), inv = 1 / a, f = value + k * (a - inv) - b; if (f > 0) hi = value; else lo = value; const next = value - f / (1 + k * (a + inv) / diodeVt); value = next >= lo && next <= hi ? next : (lo + hi) * .5; }
      return sign * value;
    }
    const diodeTables = new Map();
    function diodeTable(resistance) {
      const key = resistance.toPrecision(12); if (diodeTables.has(key)) return diodeTables.get(key);
      const table = new Float64Array(4097); for (let i = 0; i <= 4096; i++) table[i] = solveDiode(i / 512, resistance);
      if (diodeTables.size >= 16) diodeTables.delete(diodeTables.keys().next().value); diodeTables.set(key, table); return table;
    }
    function tableDiode(input, table) { const at = Math.min(4095.999999, Math.abs(input) * 512), i = Math.floor(at), value = table[i] + (at - i) * (table[i + 1] - table[i]); return input < 0 ? -value : value; }
    // Trapezoidal companion models preserve every coupling-capacitor charge.
    // -1 is AC ground; -2 is the low-impedance stage driving the network.
    class PassiveNetwork {
      constructor(rate, count, resistors, capacitors, diodeNode = -1) { this.rate = rate; this.count = count; this.io = new Float64Array(1); this.capacitors = capacitors; this.capacitorA = Int32Array.from(capacitors, part => part[0]); this.capacitorB = Int32Array.from(capacitors, part => part[1]); this.g = Float64Array.from(capacitors, part => 2 * rate * part[2]); this.historyGain = Float64Array.from(this.g, g => -2 * g); this.diodeNode = diodeNode; this.configure(resistors); }
      configure(resistors, rampFrames = 0) {
        this.resistors = resistors; const n = this.count, matrix = new Float64Array(n * n); this.source = new Float64Array(n);
        const stamp = (a, b, g) => { if (a >= 0) { matrix[a * n + a] += g; if (b >= 0) matrix[a * n + b] -= g; else if (b === -2) this.source[a] += g; } if (b >= 0) { matrix[b * n + b] += g; if (a >= 0) matrix[b * n + a] -= g; else if (a === -2) this.source[b] += g; } };
        for (const [a, b, r] of resistors) stamp(a, b, 1 / r); this.capacitors.forEach(([a, b], i) => stamp(a, b, this.g[i]));
        this.matrix = matrix; const next = inverse(matrix, n);
        if (!this.inv || !rampFrames) { this.inv = next; this.rampRemaining = 0; }
        else { this.invTarget = next; this.invStep = Float64Array.from(next, (value, i) => (value - this.inv[i]) / rampFrames); this.rampRemaining = rampFrames; }
        if (this.diodeNode >= 0) { this.resistance = this.inv[this.diodeNode * n + this.diodeNode]; this.table = diodeTable(this.resistance); }
      }
      advance() { if (this.rampRemaining) { for (let i = 0; i < this.inv.length; i++) this.inv[i] += this.invStep[i]; if (--this.rampRemaining === 0) this.inv.set(this.invTarget); } }
      state() { return { h: new Float64Array(this.capacitors.length), rhs: new Float64Array(this.count), volts: new Float64Array(this.count) }; }
      process(input, state, output) { this.io[0] = input; this.tickBuffer(this.io, state, output); return this.io[0]; }
      tickBuffer(io, state, output) {
        const input = io[0];
        const n = this.count, rhs = state.rhs, volts = state.volts, capacitorA = this.capacitorA, capacitorB = this.capacitorB;
        for (let i = 0; i < n; i++) rhs[i] = this.source[i] * input;
        for (let i = 0; i < capacitorA.length; i++) { const a = capacitorA[i], b = capacitorB[i], h = state.h[i]; if (a >= 0) rhs[a] -= h; if (b >= 0) rhs[b] += h; }
        const inv = this.inv;
        if (n === 5) {
          const r0 = rhs[0], r1 = rhs[1], r2 = rhs[2], r3 = rhs[3], r4 = rhs[4];
          for (let i = 0; i < 5; i++) {
            const at = i * 5; let sum = 0;
            sum += inv[at] * r0; sum += inv[at + 1] * r1; sum += inv[at + 2] * r2;
            sum += inv[at + 3] * r3; sum += inv[at + 4] * r4; volts[i] = sum;
          }
        } else if (n === 6) {
          const r0 = rhs[0], r1 = rhs[1], r2 = rhs[2], r3 = rhs[3], r4 = rhs[4], r5 = rhs[5];
          for (let i = 0; i < 6; i++) {
            const at = i * 6; let sum = 0;
            sum += inv[at] * r0; sum += inv[at + 1] * r1; sum += inv[at + 2] * r2;
            sum += inv[at + 3] * r3; sum += inv[at + 4] * r4; sum += inv[at + 5] * r5; volts[i] = sum;
          }
        } else {
          for (let i = 0; i < n; i++) { let sum = 0; for (let j = 0; j < n; j++) sum += inv[i * n + j] * rhs[j]; volts[i] = sum; }
        }
        if (this.diodeNode >= 0) { const node = this.diodeNode, change = (tableDiode(volts[node], this.table) - volts[node]) / this.resistance; for (let i = 0; i < n; i++) volts[i] += this.inv[i * n + node] * change; }
        for (let i = 0; i < capacitorA.length; i++) { const a = capacitorA[i], b = capacitorB[i], va = a >= 0 ? volts[a] : a === -2 ? input : 0, vb = b >= 0 ? volts[b] : b === -2 ? input : 0; state.h[i] = safe(this.historyGain[i] * (va - vb) - state.h[i]); }
        io[0] = volts[output];
      }
    }
    class RC {
      constructor(rate, hz) { this.z = 0; this.set(rate, hz); }
      set(rate, hz) { const g = Math.tan(PI * clamp(hz, 1, rate * .44) / rate); this.targetG = g / (1 + g); this.slew = 1 - Math.exp(-1 / (rate * .004)); if (this.g === undefined) this.g = this.targetG; }
      low(x) { if (this.g !== this.targetG) { this.g += (this.targetG - this.g) * this.slew; if (Math.abs(this.g - this.targetG) < 1e-12) this.g = this.targetG; } const v = (x - this.z) * this.g, y = v + this.z; this.z = y + v; if (Math.abs(this.z) < 1e-25) this.z = 0; return y; }
      high(x) { return x - this.low(x); }
    }
    function lowpass(rate, hz, q) { const w = TAU * hz / rate, c = Math.cos(w), a = Math.sin(w) / (2 * q), norm = 1 / (1 + a); return [(1 - c) * .5 * norm, (1 - c) * norm, (1 - c) * .5 * norm, -2 * c * norm, (1 - a) * norm]; }
    function filter(x, coefficients, state, offset = 0) { const y = coefficients[0] * x + state[offset]; state[offset] = coefficients[1] * x - coefficients[3] * y + state[offset + 1]; state[offset + 1] = coefficients[2] * x - coefficients[4] * y; return y; }
    // A reduced-order discrete JFET/PNP amplifier. Actual feedback R/C values
    // remain in the implicit loop. The finite gain and rail law are estimates;
    // this is not a full transistor SPICE model or a hardware measurement fit.
    class DiscreteStage {
      constructor(rate, base, ground, cap, feedbackCap) { this.rate = rate; this.base = base; this.ground = ground; this.cg = 2 * rate * cap; this.groundCap = 1 + ground * this.cg; this.cf = 2 * rate * feedbackCap; this.hf = this.hg = 0; this.io = new Float64Array(1); this.set(.35); }
      set(drive, immediate = false) { this.targetRf = this.base + 250000 * taper(drive); if (this.rf === undefined || immediate) this.rf = this.targetRf; this.remaining = this.rf === this.targetRf ? 0 : Math.max(1, Math.round(this.rate * .004)); this.rfStep = this.remaining ? (this.targetRf - this.rf) / this.remaining : 0; this.configure(); }
      configure() { const sum = 1 / this.rf + this.cf, yg = this.cg / this.groundCap; this.alpha = sum / (sum + yg); this.scale = 1 / (sum + yg); this.yg = yg; }
      process(x) { this.io[0] = x; this.tickBuffer(this.io); return this.io[0]; }
      tickBuffer(io) {
        const x = io[0];
        if (this.remaining) { this.rf += this.rfStep; if (--this.remaining === 0) this.rf = this.targetRf; this.configure(); }
        const h = this.hg / this.groundCap, beta = -(this.hf + h) * this.scale, u = x - beta, magnitude = Math.abs(u), rail = u < 0 ? 4 : 3.8, a = this.alpha;
        // +8 V supply/+4 V reference, PNP sourcing stage and2k2 pull-down:
        // nominal .2 V PNP saturation leaves +3.8/−4 V available swing.
        // These are circuit-informed estimates, not measured device curves.
        // Exact positive root of y = rail*A*(u-a*y)/(rail+|A*(u-a*y)|).
        const b = magnitude + a * rail + rail / 1600, determinant = Math.max(0, b * b - 4 * a * magnitude * rail);
        const y = (u < 0 ? -1 : 1) * 2 * magnitude * rail / Math.max(1e-30, b + Math.sqrt(determinant));
        const v = a * y + beta, current = this.yg * v + h, capacitor = v - this.ground * current;
        this.hg = -2 * this.cg * capacitor - this.hg; this.hf = -2 * this.cf * (v - y) - this.hf; io[0] = y;
      }
    }
    function bassCoefficients(rate) {
      // Stock active bass network: 6k8||2n2 feedback; series56n into the
      // 1k2/470k/56n emitter-follower gyrator. Nominal follower gain .991
      // accounts for finite gm/loading; transistor spread is not modeled.
      const r = 1200, rb = 470000, c = 56e-9, rf = 6800, cf = 2.2e-9, d = c * (r + .009 * rb);
      const n = [1, d + c * r, c * r * rb * c], den = [1, n[1] + rf * cf, n[2] + rf * cf * n[1], rf * cf * n[2]], num = den.slice();
      num[1] += rf * c; num[2] += rf * c * d;
      const basis = [[1, 3, 3, 1], [1, 1, -1, -1], [1, -1, -1, 1], [1, -3, 3, -1]], a = new Float64Array(4), b = new Float64Array(4), k = 2 * rate;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const scale = Math.pow(k, i) * basis[i][j]; a[j] += den[i] * scale; b[j] += num[i] * scale; }
      const norm = a[0]; for (let i = 0; i < 4; i++) { a[i] /= norm; b[i] /= norm; } return { a, b };
    }
    class BlueDriver {
      constructor(rate, controls) {
        this.rate = rate; this.io = new Float64Array(1);
        this.inter = new PassiveNetwork(rate, 5, [[-2, 0, 100000], [4, 1, 330000], [1, 2, 1e6], [2, -1, 15000], [3, -1, 1e6]], [[-2, 4, 220e-12], [0, 1, 100e-9], [0, 2, 47e-9], [1, 3, 2.2e-9]], 1);
        this.tone = new PassiveNetwork(rate, 6, [[-2, 0, 5600], [1, 3, 5000], [3, 2, 5000], [3, 4, 90000], [4, -1, 10000], [5, -1, 470000]], [[-2, 0, 6.8e-9], [0, -1, 5.6e-9], [0, 1, 18e-9], [2, -1, 18e-9], [4, 5, 47e-9]]);
        this.bass = bassCoefficients(rate);
        this.states = [0, 1].map(() => ({ input: new RC(rate, 1 / (TAU * 47e-9 * 1e6)), couple: new RC(rate, 1 / (TAU * 100e-9 * 220000)), first: new DiscreteStage(rate, 22000, 1500, 150e-9, 47e-12), inter: this.inter.state(), second: new DiscreteStage(rate, 33000, 2200, 1e-6, 100e-12), tone: this.tone.state(), bass: new Float64Array(3), out: new RC(rate, 1 / (TAU * 1e-6 * 100000)) }));
        this.set(controls); this.initialized = true;
      }
      set(p, changed = null) {
        if (!changed || changed.has('Drive')) for (const state of this.states) { state.first.set(p.Drive, !this.initialized); state.second.set(p.Drive, !this.initialized); }
        // Representative 10%-at-midpoint 100kA volume law, before the bass
        // amplifier. Software Level is a separate post-pedal dB trim.
        this.volumeZero = p.Volume === 0;
        if (!changed || changed.has('Tone') || changed.has('Volume')) {
          const position = (Math.pow(81, p.Volume) - 1) / 80, tone = p.Tone;
          this.tone.configure([[-2, 0, 5600], [1, 3, Math.max(1, 10000 * (1 - tone))], [3, 2, Math.max(1, 10000 * tone)], [3, 4, Math.max(1, 100000 * (1 - position))], [4, -1, Math.max(1, 100000 * position)], [5, -1, 470000]], this.initialized ? Math.max(1, Math.round(this.rate * .004)) : 0);
        }
      }
      sample(x, channel) { this.io[0] = x; this.tickBuffer(this.io, channel); return this.io[0]; }
      tickBuffer(io, channel) {
        const s = this.states[channel]; io[0] = s.couple.high(s.input.high(io[0])); s.first.tickBuffer(io);
        this.inter.tickBuffer(io, s.inter, 3); s.second.tickBuffer(io); this.tone.tickBuffer(io, s.tone, 5); const y = io[0];
        const b = this.bass.b, a = this.bass.a, z = s.bass, out = b[0] * y + z[0]; z[0] = b[1] * y - a[1] * out + z[1]; z[1] = b[2] * y - a[2] * out + z[2]; z[2] = b[3] * y - a[3] * out;
        const result = s.out.high(clamp(out, -2.9, 2.9)); io[0] = this.volumeZero ? 0 : result;
      }
    }

    class Dirt {
      constructor(rate, quality, type, p) {
        this.type = type; this.os = quality === 'eco' ? 2 : 4; this.rate = rate; this.osr = rate * this.os; this.gainSlew = 1 - Math.exp(-1 / (this.osr * .004));
        const hz = Math.min(20000, rate * .44); this.pre = [.5411961001, 1.306562965].map(q => lowpass(this.osr, hz, q)); this.post = [.51763809, .7071067812, 1.931851653].map(q => lowpass(this.osr, hz, q));
        this.states = [0, 1].map(() => ({ previous: 0, pre: new Float64Array(4), post: new Float64Array(6), high: new RC(this.osr, 80), low: new RC(this.osr, 5000), memory: new RC(this.osr, 25), feedback: new RC(this.osr, 8), rail: 0, transistor: 0 }));
        this.result = new Float64Array(2); this.mono = true; this.blue = type === 'bluesdriver' ? new BlueDriver(this.osr, p) : null; if (this.blue) this.p = { ...p }; else this.set(p);
      }
      synchronizeRight() {
        // While the inputs have identical histories there is one circuit to
        // solve. Materialize the second history before controls or stereo
        // input can cause the two channels to take different paths.
        const left = this.states[0], right = this.states[1];
        right.previous = left.previous; right.pre.set(left.pre); right.post.set(left.post);
        for (const key of ['high', 'low', 'memory', 'feedback']) { right[key].z = left[key].z; right[key].g = left[key].g; }
        for (const key of ['rail', 'transistor', 'amount']) right[key] = left[key];
        if (this.blue) {
          const a = this.blue.states[0], b = this.blue.states[1];
          for (const key of ['input', 'couple', 'out']) { b[key].z = a[key].z; b[key].g = a[key].g; }
          for (const key of ['first', 'second']) for (const field of ['hf', 'hg', 'rf', 'remaining', 'rfStep', 'alpha', 'scale', 'yg']) b[key][field] = a[key][field];
          for (const key of ['inter', 'tone']) { b[key].h.set(a[key].h); b[key].rhs.set(a[key].rhs); b[key].volts.set(a[key].volts); }
          b.bass.set(a.bass);
        }
      }
      set(p, changed = null) {
        if (this.mono) this.synchronizeRight();
        this.p = { ...p }; if (this.blue) { this.blue.set(p, changed); return; }
        if (changed && !changed.has('Drive') && !changed.has('Tone')) return;
        const type = this.type; this.amount = type === 'screamer' ? (51000 + 500000 * taper(p.Drive)) / 4700 : type === 'rodent' ? 8 + 250 * p.Drive * p.Drive : 4 + 100 * p.Drive * p.Drive;
        const hp = type === 'screamer' ? 1 / (TAU * 4700 * 47e-9) : type === 'rodent' ? 70 : 14;
        const lp = type === 'screamer' ? 900 * Math.pow(7, p.Tone) : type === 'rodent' ? 600 * Math.pow(18, p.Tone) : 1600 * Math.pow(6, p.Tone);
        this.diode = diodeTable(type === 'screamer' ? 6000 : 1800);
        for (const s of this.states) { if (s.amount === undefined) s.amount = this.amount; s.high.set(this.osr, hp); s.low.set(this.osr, Math.min(lp, this.rate * .43)); }
      }
      pair(left, right) {
        const mono = this.mono && Object.is(left, right);
        if (this.mono && !mono) { this.synchronizeRight(); this.mono = false; }
        const result = this.result, leftPrevious = this.states[0].previous, rightPrevious = this.states[1].previous, channels = mono ? 1 : 2;
        for (let sub = 1; sub <= this.os; sub++) {
          if (this.blue) this.blue.tone.advance();
          for (let channel = 0; channel < channels; channel++) {
          const s = this.states[channel], input = channel === 0 ? left : right, previous = channel === 0 ? leftPrevious : rightPrevious;
          if (!this.blue && s.amount !== this.amount) { s.amount += this.gainSlew * (this.amount - s.amount); if (Math.abs(s.amount - this.amount) < 1e-10) s.amount = this.amount; }
          let x = previous + (input - previous) * sub / this.os; for (let i = 0; i < 2; i++) {
            const coefficients = this.pre[i], at = i * 2, value = coefficients[0] * x + s.pre[at];
            s.pre[at] = coefficients[1] * x - coefficients[3] * value + s.pre[at + 1];
            s.pre[at + 1] = coefficients[2] * x - coefficients[4] * value; x = value;
          }
          let y;
          if (this.blue) { this.blue.io[0] = x; this.blue.tickBuffer(this.blue.io, channel); y = this.blue.io[0]; }
          else if (this.type === 'screamer') { const high = s.high.high(x), clipped = tableDiode(high * s.amount, this.diode) * .5; y = s.low.low((x + clipped) * .65); }
          else if (this.type === 'rodent') { const high = s.high.high(x), target = clamp(high * s.amount, -3.4, 3.4), coefficient = 1 - Math.exp(-TAU * Math.min(18000, 2e6 / s.amount) / this.osr); s.rail += coefficient * (target - s.rail); y = s.low.low(tableDiode(s.rail, this.diode) * .65); }
          else {
            // Two biased transistor stages with collector-to-input feedback,
            // emitter degeneration and charge memory; original reduced order.
            const high = s.high.high(x), feedback = s.feedback.low(s.transistor), first = Math.tanh((high - feedback * .06) * (3 + s.amount * .18) + .12) - Math.tanh(.12);
            const charge = s.memory.low(Math.abs(first)), bias = .18 + .28 * charge, second = Math.tanh(first * (2 + s.amount * .18) - bias) + Math.tanh(bias); s.transistor = second;
            y = s.low.low(second * .38);
          }
          for (let i = 0; i < 3; i++) {
            const coefficients = this.post[i], at = i * 2, value = coefficients[0] * y + s.post[at];
            s.post[at] = coefficients[1] * y - coefficients[3] * value + s.post[at + 1];
            s.post[at + 1] = coefficients[2] * y - coefficients[4] * value; y = value;
          } result[channel] = safe(y);
          }
        }
        if (mono) result[1] = result[0];
        this.states[0].previous = left; this.states[1].previous = right; return result;
      }
    }
    function read(buffer, at, samples) { let position = at - samples; while (position < 0) position += buffer.length; const i = Math.floor(position), fraction = position - i; return buffer[i] + (buffer[(i + 1) % buffer.length] - buffer[i]) * fraction; }
    class Pedal {
      constructor(rate, quality, type, params) {
        this.rate = rate; this.type = type; this.phase = this.control = this.at = 0; this.envelope = 0; this.compGain = 1; this.reductionDb = 0; this.delay = null; this.tank = null;
        this.result = new Float64Array(2); this.apCoefficients = new Float64Array(6); this.apStep = new Float64Array(6); this.apRemaining = 0;
        this.state = [0, 1].map(() => ({ low: new RC(rate, 5000), high: new RC(rate, 100), ap: new Float64Array(6), feedback: 0, s1: 0, s2: 0 }));
        this.dirt = ['bluesdriver', 'screamer', 'rodent', 'fuzz'].includes(type) ? new Dirt(rate, quality, type, params) : null;
        if (type === 'chorus') this.delay = [new Float32Array(Math.ceil(rate * .04) + 4), new Float32Array(Math.ceil(rate * .04) + 4)];
        if (type === 'reverb') this.allocateReverb(params.ReverbMode);
        this.set(params); this.delaySamples = this.delayTarget || params.Time * .001 * rate;
      }
      allocateReverb(mode) {
        const times = mode === 'spring' ? [.0233, .0311, .0397, .0449, .0037, .0083] : [.0297, .0371, .0411, .0437, .0043, .0109];
        this.tank = [0, 1].map(channel => ({ lines: times.map((time, i) => new Float32Array(Math.max(2, Math.round((time + channel * .00071 * (i + 1)) * this.rate)))), at: new Int32Array(6), low: new Float64Array(4), taps: new Float64Array(4), pre: new Float32Array(Math.ceil(this.rate * .18) + 2), preAt: 0 }));
      }
      set(params, changed = null) {
        const previousMode = this.p?.ReverbMode;
        if (!this.p) this.p = { ...params }; else if (changed) { for (const key of changed) this.p[key] = params[key]; } else Object.assign(this.p, params);
        const p = this.p, has = key => !changed || changed.has(key);
        if (this.dirt && (!changed || changed.has('Drive') || changed.has('Tone') || this.type === 'bluesdriver' && changed.has('Volume'))) this.dirt.set(p, changed);
        if (this.type === 'reverb' && previousMode && p.ReverbMode !== previousMode) this.allocateReverb(p.ReverbMode);
        if (has('Level')) { this.levelTarget = db(p.Level); if (this.level === undefined) this.level = this.levelTarget; }
        if (has('Attack')) this.attack = 1 - Math.exp(-1 / (this.rate * p.Attack * .001));
        if (has('Release')) this.release = 1 - Math.exp(-1 / (this.rate * p.Release * .001));
        if (has('Rate')) this.lfoStep = TAU * p.Rate / this.rate;
        if (has('Drive')) this.feedback = .82 * p.Drive;
        if (has('PhaserStages')) { const stages = Number(p.PhaserStages); if (this.stages && this.stages !== stages) { for (const state of this.state) { state.ap.fill(0); state.feedback = 0; } this.control = 0; this.apCoefficients.fill(0); this.apStep.fill(0); this.apRemaining = 0; } this.stages = stages; }
        if (this.type === 'wah' && ['Value', 'Drive', 'Tone', 'WahMode'].some(has)) { this.wahBase = 280 * Math.pow(2, p.Tone - .5); this.wahG = Math.tan(PI * Math.min(this.wahBase * Math.pow(10, p.Value), this.rate * .4) / this.rate); this.wahR = 1 / (.7 + 7 * p.Drive * p.Drive); }
        if (has('Tone')) { this.damping = 1 - Math.exp(-TAU * Math.min(this.rate * .4, 700 * Math.pow(14, p.Tone)) / this.rate); for (const s of this.state) { s.low.set(this.rate, Math.min(this.rate * .43, 900 * Math.pow(13, p.Tone))); s.high.set(this.rate, 80 * Math.pow(10, p.Tone)); } }
        if (this.type === 'delay' && (!changed || ['Time', 'Clock', 'Division'].some(has))) this.setTempo(this.tempo || 120);
        if (this.tank && (!changed || has('Decay') || has('ReverbMode'))) this.tank.forEach(s => { s.gains = s.lines.slice(0, 4).map(line => Math.pow(.001, line.length / this.rate / p.Decay)); });
        if (!this.compSlew) { this.compSlew = 1 - Math.exp(-1 / (this.rate * .001)); this.delaySlew = 1 - Math.exp(-1 / (this.rate * .035)); this.levelSlew = 1 - Math.exp(-1 / (this.rate * .006)); }
      }
      setTempo(tempo) {
        const p = this.p; if (this.type !== 'delay') return; this.tempo = clamp(finite(tempo, 120), 40, 300);
        this.delayTarget = this.rate * (p.Clock === 'sync' ? divisions[p.Division] * 60 / this.tempo : p.Time * .001);
        const required = Math.ceil(Math.max(this.rate * 1.51, this.delayTarget + 4));
        if (!this.delay || this.delay[0].length < required) {
          const length = Math.ceil(Math.min(this.rate * 12 + 4, Math.max(required, this.delay ? this.delay[0].length * 1.5 : required)));
          const old = this.delay, oldAt = this.at, next = [new Float32Array(length), new Float32Array(length)];
          if (old) for (let channel = 0; channel < 2; channel++) for (let i = 1; i < old[channel].length; i++) next[channel][length - i] = old[channel][(oldAt - i + old[channel].length) % old[channel].length];
          this.delay = next; this.at = 0;
        }
      }
      pair(left, right) {
        const p = this.p, result = this.result;
        if (this.level !== this.levelTarget) { this.level += (this.levelTarget - this.level) * this.levelSlew; if (Math.abs(this.level - this.levelTarget) < 1e-12) this.level = this.levelTarget; }
        if (this.dirt) { const wet = this.dirt.pair(left, right); result[0] = safe(wet[0] * this.level); result[1] = safe(wet[1] * this.level); return result; }
        if (this.type === 'compressor' || this.type === 'wah' && p.WahMode === 'auto') {
          let detector = Math.max(Math.abs(left), Math.abs(right));
          if (this.type === 'compressor') detector = Math.max(Math.abs(left - this.state[0].high.low(left) * p.Tone), Math.abs(right - this.state[1].high.low(right) * p.Tone));
          this.envelope += (detector > this.envelope ? this.attack : this.release) * (detector - this.envelope);
        }
        if (this.type === 'compressor') {
          const threshold = db(-10 - 34 * p.Drive), ratio = 2 + 8 * p.Drive, over = Math.max(1, this.envelope / threshold), wanted = Math.pow(over, 1 / ratio - 1);
          this.compGain += this.compSlew * (wanted - this.compGain); this.reductionDb = -dbfs(this.compGain);
        }
        if (this.type === 'delay') this.delaySamples += this.delaySlew * (this.delayTarget - this.delaySamples);
        if (this.type === 'wah' && p.WahMode === 'auto') { const position = clamp(p.Value + (Math.min(1, this.envelope * 8) - .5) * p.Depth, 0, 1); this.wahG = Math.tan(PI * Math.min(this.wahBase * Math.pow(10, position), this.rate * .4) / this.rate); }
        if (this.type === 'phaser' && (this.control++ & 15) === 0) {
          const centre = 160 * Math.pow(12, p.Tone) * Math.pow(2, Math.sin(this.phase) * p.Depth * 2.5);
          for (let i = 0; i < this.stages; i++) { const g = Math.tan(PI * clamp(centre * Math.pow(1.4, i - this.stages / 2), 25, this.rate * .4) / this.rate); this.apStep[i] = ((g - 1) / (g + 1) - this.apCoefficients[i]) / 16; } this.apRemaining = 16;
        }
        if (this.type === 'phaser' && this.apRemaining) { for (let i = 0; i < this.stages; i++) this.apCoefficients[i] += this.apStep[i]; this.apRemaining--; }
        for (let channel = 0; channel < 2; channel++) {
          const x = channel === 0 ? left : right, s = this.state[channel]; let y = x;
          if (this.type === 'compressor') y = x * this.compGain;
          else if (this.type === 'wah') {
            const g = this.wahG, r = this.wahR, hp = (x - (r + g) * s.s1 - s.s2) / (1 + r * g + g * g), bp = g * hp + s.s1, low = g * bp + s.s2;
            s.s1 = safe(g * hp + bp); s.s2 = safe(g * bp + low); y = x * .12 + bp * .72;
          } else if (this.type === 'chorus') {
            const ms = p.ChorusDelay + Math.min(p.ChorusDelay * .8, 4) * p.Depth * Math.sin(this.phase + channel * PI * .5), delayed = read(this.delay[channel], this.at, ms * this.rate * .001);
            this.delay[channel][this.at] = Math.tanh(x * .6) / .6; y = .5 * (x + s.low.low(delayed));
          } else if (this.type === 'phaser') {
            y = x + s.feedback * this.feedback;
            for (let i = 0; i < this.stages; i++) { const a = this.apCoefficients[i], v = a * y + s.ap[i]; s.ap[i] = safe(y - a * v); y = v; } s.feedback = safe(y); y = (x + y) * .5;
          } else if (this.type === 'delay') {
            const delayed = read(this.delay[channel], this.at, clamp(this.delaySamples, 1, this.delay[channel].length - 2)), filtered = s.low.low(delayed);
            const feedback = p.DelayMode === 'analog' ? Math.tanh(filtered * 1.3) / 1.3 : filtered;
            this.delay[channel][this.at] = safe(x + p.Feedback * feedback); y = p.DelayMode === 'analog' ? filtered : delayed;
          } else if (this.type === 'reverb') {
            const tank = this.tank[channel], pre = p.Predelay * .001 * this.rate; let input = pre > 0 ? read(tank.pre, tank.preAt, Math.max(1, pre)) : x;
            tank.pre[tank.preAt] = x; tank.preAt = (tank.preAt + 1) % tank.pre.length; input = s.high.high(input);
            for (let i = 4; i < 6; i++) { const line = tank.lines[i], at = tank.at[i], delayed = line[at], amount = .25 + p.Depth * .45, v = delayed - input * amount; line[at] = safe(input + amount * v); tank.at[i] = (at + 1) % line.length; input = v; }
            const taps = tank.taps; for (let i = 0; i < 4; i++) taps[i] = tank.lines[i][tank.at[i]];
            let sum = 0; for (let i = 0; i < 4; i++) { const coupled = this.p.ReverbMode === 'room' ? (taps[i] - .5 * (taps[0] + taps[1] + taps[2] + taps[3])) : taps[i]; tank.low[i] += this.damping * (coupled - tank.low[i]); tank.lines[i][tank.at[i]] = safe(input * .35 + tank.low[i] * tank.gains[i]); tank.at[i] = (tank.at[i] + 1) % tank.lines[i].length; sum += taps[i] * (i & 1 ? -1 : 1); } y = sum * .5;
          }
          result[channel] = safe(y * this.level);
        }
        if (this.delay) this.at = (this.at + 1) % this.delay[0].length;
        this.phase += this.lfoStep; if (this.phase >= TAU) this.phase -= TAU; return result;
      }
      tail() { const p = this.p; if (this.type === 'delay') return Math.min(120, this.delayTarget / this.rate * (p.Feedback > .001 ? Math.log(.0001) / Math.log(p.Feedback) : 1) + .15); if (this.type === 'reverb') return p.Decay + p.Predelay * .001 + .1; if (this.type === 'chorus') return .1; return .4; }
    }
    function create(sampleRate, values) {
      const sr = clamp(finite(sampleRate, 48000), 8000, 192000), fadeFrames = Math.max(1, Math.round(sr * .006)), smooth = 1 - Math.exp(-1 / (sr * .006)), peakDecay = Math.exp(-1 / (sr * .15));
      let p = normalize(values), input = db(p.input), output = db(p.output), inputTarget = input, outputTarget = output, blend = p.bypass ? 0 : p.mix, blendTarget = blend, blendRemaining = 0, inputPeak = 0, outputPeak = 0, idle = true, quiet = 0;
      const slots = Array.from({ length: 4 }, (_, index) => ({ index, model: null, type: 'none', mix: 0, target: 0, remaining: 0, inputPeak: 0, outputPeak: 0, controls: {}, changed: new Set() }));
      function controls(index) { const result = {}, prefix = 'pedal' + (index + 1); for (const key of Object.keys(localRules)) result[key] = p[prefix + key]; return result; }
      function configure(slot, reset = false) {
        if (!slot.controls.Type) slot.controls = controls(slot.index);
        const next = slot.controls, enabled = next.Type !== 'none' && next.Enabled === 'on' && next.Mix > 0 && !p.bypass && p.mix > 0;
        const changedType = slot.type !== next.Type, changedQuality = slot.quality !== p.quality && ['bluesdriver', 'screamer', 'rodent', 'fuzz'].includes(next.Type);
        if (changedType || changedQuality || reset) { slot.model = null; slot.mix = 0; slot.type = next.Type; slot.quality = p.quality; }
        if (enabled && !slot.model) slot.model = new Pedal(sr, p.quality, next.Type, next);
        else if (slot.model && slot.changed.size) slot.model.set(next, slot.changed);
        slot.controls = next; slot.changed.clear(); const target = enabled ? next.Mix : 0;
        if (reset) { slot.mix = target; slot.remaining = 0; } else if (target !== slot.target || changedType || changedQuality) slot.remaining = fadeFrames;
        slot.target = target; if (!slot.mix && !slot.target) slot.model = null;
      }
      slots.forEach(slot => configure(slot, true));
      function clear() { for (const slot of slots) { slot.model = null; slot.mix = 0; slot.target = 0; slot.remaining = 0; slot.inputPeak = slot.outputPeak = 0; } idle = true; quiet = 0; }
      return {
        setParams(partial) {
          if (!partial || typeof partial !== 'object') return;
          let affected = 0, qualityChanged = false, activationChanged = false;
          for (const key of Object.keys(partial)) {
            if (p[key] === partial[key]) continue;
            if (key !== 'bypass' && !Object.prototype.hasOwnProperty.call(specifications, key)) continue;
            const value = normalized(key, partial[key]); if (p[key] === value) continue; p[key] = value;
            const match = /^pedal([1-4])(.+)$/.exec(key); if (match) { const index = Number(match[1]) - 1, slot = slots[index]; slot.controls[match[2]] = value; slot.changed.add(match[2]); affected |= 1 << index; }
            else if (key === 'quality') qualityChanged = true; else if (key === 'bypass' || key === 'mix') activationChanged = true; else if (key === 'input') inputTarget = db(value); else if (key === 'output') outputTarget = db(value);
          }
          if (qualityChanged || activationChanged) affected = 15;
          for (let i = 0; i < 4; i++) if (affected & 1 << i) configure(slots[i]);
          blendTarget = p.bypass ? 0 : p.mix; if (blendTarget !== blend) blendRemaining = fadeFrames;
        },
        process(left, right, context = {}) {
          if (!left || !right || left.length !== right.length) throw Error('BOARD requires equal stereo buffers.');
          if (blend === 0 && blendTarget === 0 && !blendRemaining) return;
          let hasModels = false;
          for (let i = 0; i < slots.length; i++) if (slots[i].model) { hasModels = true; break; }
          if (!hasModels && !blendRemaining && input === 1 && output === 1 && inputTarget === 1 && outputTarget === 1) return;
          let firstFrame = 0;
          if (idle) { while (firstFrame < left.length && left[firstFrame] === 0 && right[firstFrame] === 0) firstFrame++; if (firstFrame === left.length) return; }
          const tempo = clamp(finite(context.tempo, 120), 40, 300); for (const slot of slots) if (slot.model?.type === 'delay' && tempo !== slot.model.tempo) slot.model.setTempo(tempo);
          let maximumTail = .5;
          for (let i = 0; i < slots.length; i++) if (slots[i].model) maximumTail = Math.max(maximumTail, slots[i].model.tail());
          const idleAfter = Math.ceil(sr * maximumTail);
          for (let frame = firstFrame; frame < left.length; frame++) {
            if (idle && left[frame] === 0 && right[frame] === 0) continue;
            idle = false;
            const dryL = finite(left[frame], 0), dryR = finite(right[frame], 0); if (input !== inputTarget) { input += smooth * (inputTarget - input); if (Math.abs(input - inputTarget) < 1e-12) input = inputTarget; } if (output !== outputTarget) { output += smooth * (outputTarget - output); if (Math.abs(output - outputTarget) < 1e-12) output = outputTarget; }
            let l = dryL * input, r = dryR * input; inputPeak = Math.max(inputPeak * peakDecay, Math.abs(dryL), Math.abs(dryR));
            for (const slot of slots) if (slot.model) {
              slot.inputPeak = Math.max(slot.inputPeak * peakDecay, Math.abs(l), Math.abs(r)); const wet = slot.model.pair(l, r);
              if (slot.remaining) { slot.mix += (slot.target - slot.mix) / slot.remaining; if (--slot.remaining === 0) { slot.mix = slot.target; if (slot.mix === 0) slot.model = null; } }
              l += (wet[0] - l) * slot.mix; r += (wet[1] - r) * slot.mix; slot.outputPeak = Math.max(slot.outputPeak * peakDecay, Math.abs(l), Math.abs(r));
            }
            if (blendRemaining) { blend += (blendTarget - blend) / blendRemaining; if (--blendRemaining === 0) blend = blendTarget; }
            left[frame] = safe(dryL + (l * output - dryL) * blend); right[frame] = safe(dryR + (r * output - dryR) * blend); outputPeak = Math.max(outputPeak * peakDecay, Math.abs(left[frame]), Math.abs(right[frame]));
            if (Math.max(Math.abs(dryL), Math.abs(dryR), Math.abs(left[frame]), Math.abs(right[frame])) < 1e-10) quiet++; else quiet = 0;
            if (quiet >= idleAfter) { idle = true; quiet = 0; inputPeak = outputPeak = 0; }
          }
          if (blend === 0 && blendTarget === 0) { clear(); inputPeak = outputPeak = 0; }
        },
        reset() { clear(); input = db(p.input); output = db(p.output); blend = blendTarget = p.bypass ? 0 : p.mix; blendRemaining = 0; slots.forEach(slot => configure(slot, true)); inputPeak = outputPeak = 0; },
        getMeters() { return { type: 'board', active: !p.bypass && p.mix > 0 && (p.input !== 0 || p.output !== 0 || slots.some(slot => slot.model && slot.target > 0)), inputDb: dbfs(inputPeak), outputDb: dbfs(outputPeak), quality: p.quality, oversampling: p.quality === 'eco' ? 2 : 4, slots: slots.map(slot => ({ type: slot.type, active: !!slot.model && slot.target > 0, inputDb: dbfs(slot.inputPeak), outputDb: dbfs(slot.outputPeak), reductionDb: slot.model?.reductionDb || 0, bufferFrames: slot.model?.delay?.[0].length || 0 })) }; },
        getTailTime() { return p.bypass || p.mix === 0 || idle ? 0 : Math.max(0, ...slots.filter(slot => slot.model && slot.target > 0).map(slot => slot.model.tail())); }
      };
    }
    return { specifications, normalize, create, circuits: { solveDiode, diodeVt, diodeIs, PassiveNetwork, DiscreteStage, BlueDriver, bassCoefficients } };
  }
  scope.createLoomGuitarPedalsDSP = createLoomGuitarPedalsDSP;
})(typeof window === 'undefined' ? globalThis : window);
