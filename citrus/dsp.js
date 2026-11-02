/* CITRUS · monophonic acid voice. Original implementation of a reduced-order
 * TB-303 circuit-informed model; see 303-CIRCUITS.md for sources and limits. */
(function (scope) {
  'use strict';
  function createCitrusDSP() {
    'use strict';
    const specifications = Object.freeze({
      wave: ['saw', 'square'], tune: [-100, 100, 0], cutoff: [30, 8000, 700],
      resonance: [0, 1, .65], envMod: [0, 1, .55], decay: [.2, 2, .55],
      accent: [0, 1, .65], volume: [0, 1, .65], quality: ['high', 'eco'],
      slideTime: [.005, .12, .022], filterDrive: [.5, 2, 1], drift: [0, 1, 0]
    });
    const defaults = Object.freeze(Object.fromEntries(Object.entries(specifications).map(([key, rule]) => [key, typeof rule[0] === 'number' ? rule[2] : rule[0]])));
    const clamp = (value, low, high, fallback = low) => typeof value === 'number' && Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;
    function normalize(raw = {}) {
      raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      const result = {};
      for (const [key, rule] of Object.entries(specifications)) result[key] = typeof rule[0] === 'number' ? clamp(raw[key], rule[0], rule[1], rule[2]) : rule.includes(raw[key]) ? raw[key] : rule[0];
      return result;
    }
    // Monotonic bounded Padé tanh and its analytic derivative. No exponential
    // evaluation or allocation in the implicit diode-current solver.
    function soft(value) { if (value <= -3) return -1; if (value >= 3) return 1; const square = value * value; return value * (27 + square) / (27 + 9 * square); }
    function softDerivative(value) { if (value <= -3 || value >= 3) return 0; const square = value * value, denominator = square + 3; return (square - 9) * (square - 9) / (9 * denominator * denominator); }
    function blep(phase, increment) {
      if (phase < increment) { const t = phase / increment; return t + t - t * t - 1; }
      if (phase > 1 - increment) { const t = (phase - 1) / increment; return t * t + t + t + 1; }
      return 0;
    }
    // Hamming-windowed half-band FIR. Every second tap is exactly zero. Two
    // inexpensive 2:1 stages decimate 4x High; Eco uses the final 2:1 stage.
    const halfBandTaps = [];
    let tapSum = 0;
    for (let n = 0; n < 31; n++) {
      const offset = n - 15, value = offset === 0 ? .5 : offset % 2 === 0 ? 0 : Math.sin(Math.PI * .5 * offset) / (Math.PI * offset) * (.54 - .46 * Math.cos(2 * Math.PI * n / 30));
      halfBandTaps.push(value); tapSum += value;
    }
    const activeTaps = halfBandTaps.map((value, index) => [index, value / tapSum]).filter(pair => pair[1] !== 0);
    class HalfBand {
      constructor() { this.samples = new Float64Array(32); this.position = 0; }
      reset() { this.samples.fill(0); this.position = 0; }
      push(value) { this.samples[this.position] = value; this.position = (this.position + 1) & 31; }
      read() { let value = 0; for (let i = 0; i < activeTaps.length; i++) value += activeTaps[i][1] * this.samples[(this.position - 1 - activeTaps[i][0]) & 31]; return value; }
    }
    /** Four coupled capacitor states. Linearization is the unbuffered diode
     * ladder transfer, not four isolated Moog poles. The last equivalent
     * capacitor has half value. TPT plus a bounded Newton solve closes the
     * nonlinear feedback loop without a sample-delay approximation. */
    class DiodeLadder {
      constructor() { this.state = new Float64Array(4); this.reset(); }
      reset() { this.state.fill(0); this.y1 = this.y2 = this.y3 = this.y4 = this.hp1 = this.hp2 = 0; }
      process(input, g, feedback = 0, hpG1 = 0, hpG2 = 0, iterations = 3) {
        const state = this.state, thermal = .65, inverseThermal = 1 / thermal;
        const h1 = 1 / (1 + hpG1), h2 = 1 / (1 + hpG2), direct = h1 * h2, memory = -direct * this.hp1 - h2 * this.hp2;
        let y1 = this.y1, y2 = this.y2, y3 = this.y3, y4 = this.y4;
        for (let iteration = 0; iteration < iterations; iteration++) {
          const a = (input - feedback * (direct * y4 + memory) - y1) * inverseThermal;
          const b = (y1 - y2) * inverseThermal, c = (y2 - y3) * inverseThermal, d = (y3 - y4) * inverseThermal;
          const f0 = thermal * soft(a), f1 = thermal * soft(b), f2 = thermal * soft(c), f3 = thermal * soft(d);
          const r1 = state[0] + g * (f0 - f1) - y1, r2 = state[1] + g * (f1 - f2) - y2;
          const r3 = state[2] + g * (f2 - f3) - y3, r4 = state[3] + 2 * g * f3 - y4;
          if (Math.abs(r1) + Math.abs(r2) + Math.abs(r3) + Math.abs(r4) < 1e-10) break;
          const d0 = softDerivative(a), d1 = softDerivative(b), d2 = softDerivative(c), d3 = softDerivative(d);
          const a11 = 1 + g * (d0 + d1), a12 = -g * d1, a14 = g * feedback * direct * d0;
          const a21 = a12, a22 = 1 + g * (d1 + d2), a23 = -g * d2;
          const a32 = a23, a33 = 1 + g * (d2 + d3), a34 = -g * d3, a43 = -2 * g * d3, a44 = 1 + 2 * g * d3;
          // Eliminate the lower tridiagonal subsystem as affine functions of
          // delta1; its sole cyclic term is the resonant-feedback entry a14.
          const denominator3 = a33 - a34 * a43 / a44, rhs3 = r3 - a34 * r4 / a44;
          const denominator2 = a22 - a23 * a32 / denominator3, rhs2 = r2 - a23 * rhs3 / denominator3;
          const c2 = rhs2 / denominator2, q2 = -a21 / denominator2;
          const c3 = (rhs3 - a32 * c2) / denominator3, q3 = -a32 * q2 / denominator3;
          const c4 = (r4 - a43 * c3) / a44, q4 = -a43 * q3 / a44;
          const delta1 = (r1 - a12 * c2 - a14 * c4) / (a11 + a12 * q2 + a14 * q4);
          y1 += clamp(delta1, -1, 1, 0); y2 += clamp(c2 + q2 * delta1, -1, 1, 0);
          y3 += clamp(c3 + q3 * delta1, -1, 1, 0); y4 += clamp(c4 + q4 * delta1, -1, 1, 0);
        }
        if (!Number.isFinite(y1 + y2 + y3 + y4) || Math.max(Math.abs(y1), Math.abs(y2), Math.abs(y3), Math.abs(y4)) > 8) { this.reset(); return 0; }
        state[0] = 2 * y1 - state[0]; state[1] = 2 * y2 - state[1]; state[2] = 2 * y3 - state[2]; state[3] = 2 * y4 - state[3];
        this.y1 = y1; this.y2 = y2; this.y3 = y3; this.y4 = y4;
        const v1 = hpG1 * h1 * (y4 - this.hp1), lp1 = v1 + this.hp1, high1 = y4 - lp1;
        this.hp1 = lp1 + v1;
        const v2 = hpG2 * h2 * (high1 - this.hp2), lp2 = v2 + this.hp2;
        this.hp2 = lp2 + v2;
        return y4;
      }
    }
    class Core {
      constructor(sampleRate = 48000, patch = {}) {
        this.sampleRate = clamp(sampleRate, 8000, 192000, 48000);
        this.params = normalize(patch); this.filter = new DiodeLadder(); this.decimatorA = new HalfBand(); this.decimatorB = new HalfBand();
        this.slew = 1 - Math.exp(-1 / (.012 * this.sampleRate)); this.tuneSlew = 1 - Math.exp(-1 / (.003 * this.sampleRate));
        this.attackFrames = Math.max(1, Math.round(.003 * this.sampleRate)); this.onsetFrames = Math.max(0, Math.round(.004 * this.sampleRate));
        this.offHoldFrames = Math.max(1, Math.round(.008 * this.sampleRate)); this.offReleaseFrames = Math.max(1, Math.round(.008 * this.sampleRate));
        this.accentVcaCoefficient = 1 - Math.exp(-1 / (.001551 * this.sampleRate));
        this.volumeDecayCoefficient = Math.exp(-1 / (3.5 * this.sampleRate)); this.accentDecayCoefficient = Math.exp(-1 / (.2 * this.sampleRate));
        this.reset(); this.setState(this.params);
      }
      _quality(quality) {
        const next = quality === 'eco' ? 2 : 4;
        if (this.oversample === next) return;
        if (this.oversample) { this.qualityPrevious = this.lastOutput; this.qualityFade = Math.round(.004 * this.sampleRate); }
        this.oversample = next; this.internalSampleRate = this.sampleRate * next;
        this.hpG1 = Math.tan(Math.PI * 7 / this.internalSampleRate); this.hpG2 = Math.tan(Math.PI * 92 / this.internalSampleRate);
        this.inputCouplingCoefficient = 1 - Math.exp(-2 * Math.PI * 14 / this.internalSampleRate);
        this.outputCouplingCoefficient = 1 - Math.exp(-2 * Math.PI * 7 / this.internalSampleRate);
        this.decimatorA.reset(); this.decimatorB.reset(); this.g = 0; this.gStep = 0;
      }
      setState(patch = {}) {
        this.params = normalize({ ...this.params, ...patch });
        this.targetCutoffLog = Math.log(this.params.cutoff);
        this.glideCoefficient = 1 - Math.exp(-1 / (this.params.slideTime * this.sampleRate));
        this.normalDecayCoefficient = Math.exp(-1 / (this.params.decay * this.sampleRate));
        this._quality(this.params.quality);
        return { ...this.params };
      }
      reset() {
        this.filter.reset(); this.decimatorA.reset(); this.decimatorB.reset();
        this.phase = 0; this.currentPitch = this.targetPitch = 36; this.frequencyHz = 65.4063913251; this.frequencyPitch = NaN;
        this.mainEnvelope = this.volumeEnvelope = this.accentCap = this.accentVca = this.vegetableGain = 0;
        this.gate = this.accentGate = this.running = false; this.noteId = null; this.serial = 0;
        this.onDelay = this.attack = this.attackStep = this.releaseHold = this.releaseRemaining = this.releaseLevel = 0;
        this.inputDc = this.outputDc = this.lastOutput = this.peak = this.clock = this.qualityFade = 0;
        this.qualityPrevious = 0; this.chargeCoefficient = this.leakCoefficient = this.feedback = 0; this.velocityGain = 1; this.g = this.gStep = 0; this.filterCutoffHz = this.params.cutoff;
        this.cutoffLog = Math.log(this.params.cutoff); this.resonance = this.params.resonance; this.envMod = this.params.envMod;
        this.accentAmount = this.params.accent; this.level = this.params.volume; this.tune = this.params.tune; this.drive = this.params.filterDrive;
        this.waveMix = this.params.wave === 'square' ? 1 : 0;
      }
      panic() { this.reset(); }
      allNotesOff() { return this.noteOff(this.noteId); }
      noteOn(event = {}) {
        event = event && typeof event === 'object' ? event : {};
        const pitch = clamp(event.pitch, 0, 127, 48), tied = event.slide === true && this.gate;
        this.noteId = event.id ?? 'citrus-note-' + (++this.serial); this.targetPitch = pitch;
        this.velocityGain = Math.sqrt(clamp(event.velocity, 0, 1, .8)); this.accentGate = event.accent === true;
        if (!tied) {
          this.currentPitch = pitch; this.mainEnvelope = this.volumeEnvelope = 1;
          this.onDelay = this.vegetableGain < 1e-7 ? this.onsetFrames : 0;
          this.attack = Math.min(1, this.vegetableGain); this.attackStep = (1 - this.attack) / this.attackFrames;
        }
        this.releaseHold = this.releaseRemaining = 0; this.gate = this.running = true;
        return this.noteId;
      }
      noteOff(id) {
        if (!this.gate || id !== this.noteId) return false;
        this.gate = false; this.accentGate = false; this.releaseHold = this.offHoldFrames; this.releaseRemaining = this.offReleaseFrames; this.releaseLevel = this.vegetableGain;
        return true;
      }
      getMeters() {
        return { gate: this.gate, accentGate: this.accentGate, noteId: this.noteId, pitch: this.currentPitch, targetPitch: this.targetPitch, frequencyHz: this.frequencyHz, filterCutoffHz: this.filterCutoffHz,
          mainEnvelope: this.mainEnvelope, volumeEnvelope: this.volumeEnvelope, accentCap: this.accentCap, accentVca: this.accentVca, vca: this.vegetableGain,
          phase: this.phase, sampleClock: this.clock, oversample: this.oversample, peak: this.peak };
      }
      process(left, right = left) {
        const length = Math.min(left.length, right.length), sr = this.sampleRate;
        if (!this.running) { left.fill(0, 0, length); if (right !== left) right.fill(0, 0, length); this.peak = 0; return; }
        const p = this.params, factor = this.oversample, osr = this.internalSampleRate, maxFrequency = Math.min(24000, sr * .45), iterations = factor === 4 ? 3 : 2;
        let peak = 0;
        for (let frame = 0; frame < length; frame++) {
          this.cutoffLog += this.slew * (this.targetCutoffLog - this.cutoffLog); this.resonance += this.slew * (p.resonance - this.resonance);
          this.envMod += this.slew * (p.envMod - this.envMod); this.accentAmount += this.slew * (p.accent - this.accentAmount);
          this.level += this.slew * (p.volume - this.level); this.drive += this.slew * (p.filterDrive - this.drive); this.tune += this.tuneSlew * (p.tune - this.tune);
          this.waveMix += this.slew * ((p.wave === 'square' ? 1 : 0) - this.waveMix);
          this.currentPitch += this.glideCoefficient * (this.targetPitch - this.currentPitch);
          if (Math.abs(this.targetPitch - this.currentPitch) < 1e-9) this.currentPitch = this.targetPitch;
          const drift = p.drift === 0 ? 0 : p.drift * (1.3 * Math.sin(this.clock * 2 * Math.PI * .077 / sr) + .7 * Math.sin(this.clock * 2 * Math.PI * .173 / sr));
          const frequencyPitch = this.currentPitch + (this.tune + drift) * .01;
          if (frequencyPitch !== this.frequencyPitch) { this.frequencyPitch = frequencyPitch; this.frequencyHz = Math.min(sr * .45, 440 * Math.pow(2, (frequencyPitch - 69) / 12)); }
          this.mainEnvelope *= this.accentGate ? this.accentDecayCoefficient : this.normalDecayCoefficient;
          this.volumeEnvelope *= this.volumeDecayCoefficient;
          const pulse = this.accentGate ? this.mainEnvelope : 0;
          this.accentVca += this.accentVcaCoefficient * (pulse - this.accentVca);
          if ((this.clock & 7) === 0 || !this.chargeCoefficient) {
            this.chargeCoefficient = 1 - Math.exp(-1 / ((.047 + .10 * this.resonance) * sr));
            this.leakCoefficient = 1 - Math.exp(-1 / ((.20 - .10 * this.resonance) * sr));
            this.feedback = 16.7 * (1 - Math.exp(-3 * this.resonance)) / (1 - Math.exp(-3));
          }
          this.accentCap += this.chargeCoefficient * Math.max(0, pulse - .025 - this.accentCap) - this.leakCoefficient * this.accentCap;
          if (this.accentCap < 1e-14) this.accentCap = 0;
          if (this.gate) {
            if (this.onDelay > 0) { this.onDelay--; this.vegetableGain = 0; }
            else { this.attack = Math.min(1, this.attack + this.attackStep); this.vegetableGain = this.attack * this.volumeEnvelope; }
          } else if (this.releaseHold > 0) { this.releaseHold--; this.vegetableGain = this.releaseLevel; }
          else if (this.releaseRemaining > 0) { this.vegetableGain = this.releaseLevel * this.releaseRemaining / this.offReleaseFrames; this.releaseRemaining--; }
          else this.vegetableGain = 0;
          if ((this.clock & 7) === 0 || this.g === 0) {
            const accentSweep = this.accentAmount * (2.2 * (1 - this.resonance) * pulse + 4 * this.resonance * this.accentCap);
            this.filterCutoffHz = clamp(Math.exp(this.cutoffLog) * Math.pow(2, (.2 + 5 * this.envMod) * this.mainEnvelope + accentSweep), 20, maxFrequency, 700);
            const target = Math.tan(Math.PI * this.filterCutoffHz / (Math.SQRT2 * osr));
            if (this.g === 0) this.g = target;
            this.gStep = (target - this.g) / 8;
          }
          this.g += this.gStep;
          const feedback = this.feedback;
          const amp = .70 * this.vegetableGain + this.accentAmount * (.85 * this.accentVca + .14 * this.accentCap);
          const increment = Math.min(.45, this.frequencyHz / osr);
          let output = 0;
          for (let sample = 0; sample < factor; sample++) {
            const phase = this.phase, saw = 2 * phase - 1 - blep(phase, increment);
            let shifted = phase + .5; if (shifted >= 1) shifted -= 1;
            const square = (phase < .5 ? 1 : -1) + blep(phase, increment) - blep(shifted, increment);
            let signal = (.36 * saw * (1 - this.waveMix) + .34 * square * this.waveMix) * this.drive;
            this.inputDc += this.inputCouplingCoefficient * (signal - this.inputDc); signal -= this.inputDc;
            const filtered = this.filter.process(signal, this.g, feedback, this.hpG1, this.hpG2, iterations);
            const shaped = soft(filtered * amp * 5.6);
            this.outputDc += this.outputCouplingCoefficient * (shaped - this.outputDc);
            const wet = (shaped - this.outputDc) * this.level * this.velocityGain;
            if (factor === 4) { this.decimatorA.push(wet); if (sample & 1) this.decimatorB.push(this.decimatorA.read()); }
            else this.decimatorB.push(wet);
            if (sample === factor - 1) output = this.decimatorB.read();
            this.phase += increment; if (this.phase >= 1) this.phase -= 1;
          }
          if (this.qualityFade > 0) { const total = Math.max(1, Math.round(.004 * sr)), blend = 1 - this.qualityFade / total; output = this.qualityPrevious * (1 - blend) + output * blend; this.qualityFade--; }
          if (!Number.isFinite(output)) { this.panic(); output = 0; }
          left[frame] = right[frame] = output; peak = Math.max(peak, Math.abs(output)); this.lastOutput = output; this.clock++;
          if (!this.gate && this.releaseHold === 0 && this.releaseRemaining === 0 && amp < 1e-10 && this.accentCap < 1e-9 && Math.abs(output) < 1e-10 && Math.abs(this.outputDc) < 1e-10) {
            this.running = false; this.filter.reset(); this.decimatorA.reset(); this.decimatorB.reset(); this.inputDc = this.outputDc = this.lastOutput = 0;
            left.fill(0, frame + 1, length); if (right !== left) right.fill(0, frame + 1, length); break;
          }
        }
        this.peak = peak;
      }
    }
    return { specifications, defaults, normalize, Core, DiodeLadder };
  }
  scope.createCitrusDSP = createCitrusDSP;
})(typeof window === 'undefined' ? globalThis : window);
