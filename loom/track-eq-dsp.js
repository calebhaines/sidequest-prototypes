/* GALLEY channel EQ: four gains, with two sweepable mid bells. */
(function (scope) {
  'use strict';
  function createLoomTrackEQDSP() {
    'use strict';
    const clamp = (value, low, high, fallback = low) => Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;
    const gainKeys = ['low', 'lowMid', 'highMid', 'high'];
    const keys = [...gainKeys, 'lowMidFreq', 'highMidFreq'];
    const frequencies = [100, 400, 2500, 10000];
    const specifications = { low: [-12, 12, 0], lowMid: [-12, 12, 0], highMid: [-12, 12, 0], high: [-12, 12, 0], lowMidFreq: [80, 2000, 400], highMidFreq: [400, 10000, 2500] };
    class TrackEQ {
      constructor(sampleRate, params = {}) {
        this.sampleRate = clamp(sampleRate, 8000, 192000, 48000);
        this.rampFrames = Math.max(1, Math.round(this.sampleRate * .006));
        this.params = {}; this.mask = 0;
        this.bands = gainKeys.map((key, index) => {
          const frequency = Math.min(frequencies[index], this.sampleRate * .45), angle = 2 * Math.PI * frequency / this.sampleRate;
          return { key, index, frequencyKey: index === 1 ? 'lowMidFreq' : index === 2 ? 'highMidFreq' : null, frequency, sine: Math.sin(angle), cosine: Math.cos(angle), coefficients: new Float64Array(5), target: new Float64Array(5), step: new Float64Array(5), state: new Float64Array(4), remaining: 0 };
        });
        this.setParams(params); this.reset();
      }
      _coefficients(band, gain, target) {
        // Preserve the released arithmetic at the original four frequencies.
        const A = Math.pow(10, gain / 40), c = band.cosine, alpha = band.sine / (2 * Math.SQRT1_2), t = 2 * Math.sqrt(A) * alpha;
        let b0, b1, b2, a0, a1, a2;
        if (band.index === 0) {
          b0 = A * ((A + 1) - (A - 1) * c + t); b1 = 2 * A * ((A - 1) - (A + 1) * c); b2 = A * ((A + 1) - (A - 1) * c - t);
          a0 = (A + 1) + (A - 1) * c + t; a1 = -2 * ((A - 1) + (A + 1) * c); a2 = (A + 1) + (A - 1) * c - t;
        } else if (band.index === 3) {
          b0 = A * ((A + 1) + (A - 1) * c + t); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - t);
          a0 = (A + 1) - (A - 1) * c + t; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - t;
        } else {
          b0 = 1 + alpha * A; b1 = -2 * c; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * c; a2 = 1 - alpha / A;
        }
        target[0] = gain === 0 ? 1 : b0 / a0; target[1] = b1 / a0; target[2] = b2 / a0; target[3] = a1 / a0; target[4] = a2 / a0;
      }
      setParams(params = {}) {
        for (const band of this.bands) {
          const key = band.key, frequencyKey = band.frequencyKey;
          const oldGain = this.params[key], gain = Object.prototype.hasOwnProperty.call(params, key) ? clamp(params[key], -12, 12, 0) : oldGain ?? 0;
          let frequency = band.frequency;
          if (frequencyKey) {
            const rule = specifications[frequencyKey], oldFrequency = this.params[frequencyKey];
            const setting = Object.prototype.hasOwnProperty.call(params, frequencyKey) ? clamp(params[frequencyKey], rule[0], rule[1], rule[2]) : oldFrequency ?? rule[2];
            this.params[frequencyKey] = setting; frequency = Math.min(setting, this.sampleRate * .45);
          }
          const frequencyChanged = frequency !== band.frequency;
          this.params[key] = gain;
          if (gain === oldGain && !frequencyChanged) continue;
          if (frequencyChanged) { const angle = 2 * Math.PI * frequency / this.sampleRate; band.frequency = frequency; band.sine = Math.sin(angle); band.cosine = Math.cos(angle); }
          this._coefficients(band, gain, band.target);
          const bit = 1 << band.index;
          if (!(this.mask & bit) && gain === 0 && oldGain === 0) {
            // Sweeping an inactive, flat bell has no signal to ramp. Update
            // its unity-transfer denominator without waking the audio path.
            band.coefficients.set(band.target); band.step.fill(0); band.remaining = 0;
            continue;
          }
          // Retain each unity-transfer denominator at zero. Interpolation
          // between stable biquad denominators stays inside their convex
          // stability region, even if a sweep receives another target early.
          if (!(this.mask & bit)) this._coefficients(band, 0, band.coefficients);
          for (let index = 0; index < 5; index++) band.step[index] = (band.target[index] - band.coefficients[index]) / this.rampFrames;
          band.remaining = this.rampFrames; this.mask |= bit;
        }
      }
      reset() {
        this.mask = 0;
        for (const band of this.bands) {
          band.coefficients.set(band.target); band.state.fill(0); band.remaining = 0;
          if (this.params[band.key] !== 0) this.mask |= 1 << band.index;
        }
      }
      process(left, right) {
        if (!this.mask) return;
        const safe = value => Number.isFinite(value) ? Math.max(-65536, Math.min(65536, value)) : 0;
        for (let frame = 0; frame < left.length; frame++) {
          let l = safe(left[frame]), r = safe(right[frame]);
          for (const band of this.bands) {
            const bit = 1 << band.index;
            if (!(this.mask & bit)) continue;
            const c = band.coefficients, state = band.state;
            if (band.remaining) {
              if (--band.remaining === 0) c.set(band.target);
              else for (let index = 0; index < 5; index++) c[index] += band.step[index];
            }
            const nextL = safe(c[0] * l + state[0]), nextR = safe(c[0] * r + state[2]);
            state[0] = safe(c[1] * l - c[3] * nextL + state[1]); state[1] = safe(c[2] * l - c[4] * nextL);
            state[2] = safe(c[1] * r - c[3] * nextR + state[3]); state[3] = safe(c[2] * r - c[4] * nextR);
            l = nextL; r = nextR;
            if (!band.remaining && this.params[band.key] === 0 && Math.max(Math.abs(state[0]), Math.abs(state[1]), Math.abs(state[2]), Math.abs(state[3])) < 1e-12) { state.fill(0); this.mask &= ~bit; }
          }
          left[frame] = l; right[frame] = r;
          if (!this.mask) return;
        }
      }
    }
    return { TrackEQ, keys, gainKeys, specifications };
  }
  scope.createLoomTrackEQDSP = createLoomTrackEQDSP;
})(typeof window === 'undefined' ? globalThis : window);
