/* GALLEY SAUTÉ · deterministic, reduced-order microphone preamp circuit families. */
(function (scope) {
  'use strict';
  function createLoomPreampDSP() {
    'use strict';
    // Self-contained: the same factory is serialized into AudioWorklet.
    const TAU = 2 * Math.PI;
    const specifications = {
      model: ['iron-73', 'clean', 'punch-312', 'console-4k', 'super-9k', 'tube-610', 'redd-47', 'valve-72', 'helios-69', 'trident-a', 'isa-110', 'avalon-737', 'tg-2'],
      input: [-24, 24, 0], drive: [0, 36, 6], output: [-36, 18, 0], compensate: ['on', 'off'], colour: [0, 1, .65], pad: ['off', '10', '20'], polarity: ['normal', 'invert'],
      impedance: [150, 10000, 2400], transformer: [0, 1, .5], headroom: [-12, 18, 0], bias: [-1, 1, 0], feedback: [0, 1, .5], slew: [0, 1, .5],
      lowCut: [0, 400, 0], highCut: [2000, 22000, 22000], lowFreq: [40, 400, 110], lowGain: [-12, 12, 0], highFreq: [2000, 16000, 6000], highGain: [-12, 12, 0], mix: [0, 1, 1]
    };
    const finite = (x, fallback) => typeof x === 'number' && Number.isFinite(x) ? x : fallback;
    const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
    const bound = x => Number.isFinite(x) ? clamp(x, -8, 8) : 0;
    const safe = x => Number.isFinite(x) ? clamp(x, -65536, 65536) : 0;
    const db = x => Math.pow(10, x / 20);
    const levelDb = x => 20 * Math.log10(Math.max(x, 1e-12));
    function normalize(params) {
      const source = params && typeof params === 'object' ? params : {}, result = {};
      for (const key of Object.keys(specifications)) {
        const rule = specifications[key];
        result[key] = typeof rule[0] === 'number' ? clamp(finite(source[key], rule[2]), rule[0], rule[1]) : rule.includes(source[key]) ? source[key] : rule[0];
      }
      result.bypass = source.bypass === true;
      return result;
    }
    // Relative voicing constants, not measured component values. Profiles alter
    // coupling, low/mid/high response, bandwidth, iron memory, amplifier law,
    // negative feedback and slew rate. Model selection never rewrites controls.
    // h, iron, coreHz, LF, mid, HF, bandwidth, slew/s, asymmetry, hardness, loop, second stage
    const profiles = {
      'iron-73': [1.35, .90, 55, .10, -.04, -.06, 28000, 80000, .10, .04, 1.6, .18],
      'punch-312': [1.15, .50, 75, .015, .09, .03, 45000, 180000, .025, .23, 3.0, 0],
      'console-4k': [1.70, .04, 95, -.01, .025, .025, 60000, 350000, 0, .50, 5.0, 0],
      'super-9k': [2.80, 0, 110, 0, .008, .008, 95000, 650000, 0, .30, 8.0, 0],
      'tube-610': [1.20, .65, 38, .08, -.02, -.10, 22000, 25000, .20, .015, .50, .60],
      'redd-47': [1.00, .70, 65, .01, .08, .01, 30000, 40000, .15, .18, .90, .40],
      'valve-72': [1.40, .85, 32, .13, -.02, -.13, 16000, 18000, .10, .025, 1.3, .50],
      'helios-69': [1.10, .70, 58, .03, .14, .06, 35000, 95000, .06, .15, 1.1, .12],
      'trident-a': [1.50, .25, 72, -.02, .055, .13, 40000, 125000, -.04, .26, 2.3, .08],
      'isa-110': [2.20, .35, 62, .045, .01, .045, 65000, 280000, .025, .10, 3.5, .05],
      'avalon-737': [2.50, .08, 42, .035, -.02, .07, 72000, 190000, .12, .01, 2.0, .45],
      'tg-2': [1.25, .75, 48, .08, .09, -.01, 28000, 65000, -.08, .22, 1.7, .28]
    };
    // Rational tanh approximation for the transformer core: unity slope at
    // zero and a bounded, flat endpoint.
    function soft(x) {
      if (x >= 3) return 1; if (x <= -3) return -1;
      const q = x * x; return x * (27 + q) / (27 + 9 * q);
    }
    function coefficients(frequency, q, rate) {
      const w = TAU * frequency / rate, c = Math.cos(w), alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
      return new Float64Array([(1 - c) * .5 / a0, (1 - c) / a0, (1 - c) * .5 / a0, -2 * c / a0, (1 - alpha) / a0]);
    }
    function filter(x, c, state, at) {
      const y = c[0] * x + state[at];
      state[at] = c[1] * x - c[3] * y + state[at + 1]; state[at + 1] = c[2] * x - c[4] * y;
      return y;
    }
    function create(sampleRate, params) {
      let p = normalize(params);
      const sr = clamp(finite(sampleRate, 48000), 8000, 192000), osr = sr * 4;
      const meter = { inputDb: -120, stageDb: -120, outputDb: -120, inputPeak: 0, outputPeak: 0 };
      const keys = ['preGain', 'netGain', 'colour', 'mix', 'headroom', 'iron', 'bias', 'loop', 'slewStep', 'load', 'loadLP', 'lowShelf', 'highShelf', 'lowLP', 'highLP', 'hp', 'hpOn', 'lp', 'lpOn', 'polarity'];
      const values = new Float64Array(keys.length), targets = new Float64Array(keys.length);
      const smooth = 1 - Math.exp(-1 / (sr * .006));
      const declickFrames = Math.max(1, Math.round(sr * .006));
      const lastWet = new Float64Array(2), declickOffset = new Float64Array(2), declickRemaining = new Int32Array(2), pending = new Int32Array(2);
      const previous = new Float64Array(2), core = new Float64Array(2), magnet = new Float64Array(2), circuitLow = new Float64Array(2), circuitMid = new Float64Array(2), circuitHigh = new Float64Array(2), loaded = new Float64Array(2), bandwidth = new Float64Array(2), slewState = new Float64Array(2);
      const deltaState = new Float64Array(8), dcPrevious = new Float64Array(2), dcState = new Float64Array(2);
      const lowTone = new Float64Array(2), highTone = new Float64Array(2), cutLow = new Float64Array(2), cutHigh = new Float64Array(2);
      const history = [previous, core, magnet, circuitLow, circuitMid, circuitHigh, loaded, bandwidth, slewState, deltaState, dcPrevious, dcState, lowTone, highTone, cutLow, cutHigh];
      let scrubIn = 1024;
      const deltaFilters = [coefficients(sr * .39, .5411961, osr), coefficients(sr * .39, 1.306563, osr)];
      const midCoefficient = 1 - Math.exp(-TAU * 800 / osr), highCoefficient = 1 - Math.exp(-TAU * 4800 / osr), dcCoefficient = Math.exp(-TAU * 6 / sr);
      let profile = profiles[p.model] || profiles['iron-73'], coreCoefficient = 0, magnetCoefficient = 0, bandwidthCoefficient = 0, initialized = false, oldTopology = '';
      function clearCircuit() {
        for (const state of [previous, core, magnet, circuitLow, circuitMid, circuitHigh, loaded, bandwidth, slewState, deltaState, dcPrevious, dcState]) state.fill(0);
      }
      function update() {
        profile = profiles[p.model] || profiles['iron-73'];
        const topology = p.model + ':' + p.compensate + ':' + p.pad + ':' + p.polarity + ':' + p.bypass;
        if (initialized && topology !== oldTopology) {
          pending.fill(1); clearCircuit();
        }
        oldTopology = topology;
        const pad = p.pad === 'off' ? 0 : Number(p.pad);
        const headroom = profile[0] * db(p.headroom);
        const load = Math.log(2400 / p.impedance) / Math.log(16);
        const next = [
          db(p.input + p.drive - pad), db(p.input - pad + p.output + (p.compensate === 'off' ? p.drive : 0)), p.colour, p.mix,
          headroom, p.transformer * profile[1], profile[8] + p.bias * .38, profile[10] * (.2 + p.feedback * 2),
          p.slew <= 0 ? 65536 : headroom * profile[7] / (osr * (.12 + p.slew * 3)), load,
          1 - Math.exp(-TAU * Math.min(38000 / (1 + (load + .55) * 3), osr * .4) / osr),
          db(p.lowGain) - 1, db(p.highGain) - 1, 1 - Math.exp(-TAU * p.lowFreq / sr), 1 - Math.exp(-TAU * p.highFreq / sr),
          1 - Math.exp(-TAU * Math.max(1, p.lowCut) / sr), p.lowCut > 0 ? 1 : 0,
          1 - Math.exp(-TAU * Math.min(p.highCut, sr * .45) / sr), p.highCut < 22000 ? 1 : 0,
          p.polarity === 'invert' ? -1 : 1
        ];
        targets.set(next);
        if (!initialized) values.set(targets);
        coreCoefficient = 1 - Math.exp(-TAU * profile[2] / osr);
        magnetCoefficient = 1 - Math.exp(-TAU * (profile[2] * .19) / osr);
        bandwidthCoefficient = 1 - Math.exp(-TAU * Math.min(profile[6], osr * .42) / osr);
        initialized = true;
      }
      // A closed-form solution of y = u/(1+abs(u)),
      // u=(1+F)*x-F*y. The rationalized quadratic avoids cancellation
      // at low levels, has unity small-signal gain, and cannot diverge.
      // This reduced-order local loop is a behaviour model, not a SPICE
      // simulation of a particular amplifier or its open-loop response.
      function closedLoop(x, feedback) {
        const magnitude = Math.abs(x), a = (1 + feedback) * (1 + magnitude);
        const y = 2 * (1 + feedback) * magnitude / (a + Math.sqrt(a * a - 4 * feedback * (1 + feedback) * magnitude));
        return x < 0 ? -y : y;
      }
      let firstBaseline = 0, firstNormalization = 1, secondBaseline = 0, secondNormalization = 1, baselineBias = NaN, baselineLoop = NaN;
      function loopNormalization(y, feedback) {
        const slope = (1 - Math.abs(y)) * (1 - Math.abs(y));
        return (1 + feedback * slope) / ((1 + feedback) * slope);
      }
      function amplifier(x, h, bias, loop, hardness, baseline, normalization) {
        const u = x / h;
        return h * (closedLoop(u + hardness * u * u * u + bias, loop) - baseline) * normalization;
      }
      function circuit(x, channel) {
        const h = values[4], iron = values[5], bias = values[6], loop = values[7];
        loaded[channel] += values[10] * (x - loaded[channel]);
        const loading = x + (values[9] + .55) * .37 * (loaded[channel] - x);
        core[channel] += coreCoefficient * (loading - core[channel]);
        magnet[channel] += magnetCoefficient * (soft(core[channel] / (h * 1.5)) - magnet[channel]);
        circuitLow[channel] += coreCoefficient * (loading - circuitLow[channel]);
        circuitMid[channel] += midCoefficient * (loading - circuitMid[channel]);
        circuitHigh[channel] += highCoefficient * (loading - circuitHigh[channel]);
        let driven = loading + profile[3] * circuitLow[channel] + profile[4] * (circuitHigh[channel] - circuitMid[channel]) + profile[5] * (loading - circuitHigh[channel]);
        if (iron > 0) {
          const magneticBias = magnet[channel] * .12;
          const transformed = h * 1.8 * (soft(driven / (h * 1.8) + magneticBias) - soft(magneticBias));
          driven += iron * (.52 * (transformed - driven) + .065 * circuitLow[channel]);
        }
        let shaped = amplifier(driven, h, bias, loop, profile[9], firstBaseline, firstNormalization);
        if (profile[11]) {
          const second = amplifier(shaped, h * 1.3, -bias * .55, loop * .7, profile[9] * .65, secondBaseline, secondNormalization);
          shaped += profile[11] * (second - shaped);
        }
        const step = values[8];
        slewState[channel] += clamp(shaped - slewState[channel], -step, step);
        bandwidth[channel] += bandwidthCoefficient * (slewState[channel] - bandwidth[channel]);
        return bandwidth[channel];
      }
      function tone(x, channel) {
        cutLow[channel] += values[15] * (x - cutLow[channel]);
        x -= values[16] * cutLow[channel];
        lowTone[channel] += values[13] * (x - lowTone[channel]);
        x += values[11] * lowTone[channel];
        highTone[channel] += values[14] * (x - highTone[channel]);
        x += values[12] * (x - highTone[channel]);
        cutHigh[channel] += values[17] * (x - cutHigh[channel]);
        return x + values[18] * (cutHigh[channel] - x);
      }
      function process(left, right) {
        if (!left || !right || left.length !== right.length) throw new Error('SAUTÉ requires equal stereo blocks.');
        let inputEnergy = 0, stageEnergy = 0, outputEnergy = 0, inputPeak = 0, outputPeak = 0;
        const count = left.length;
        for (let i = 0; i < count; i++) {
          // Absolute sample clock keeps denormal cleanup independent of host
          // block sizes and avoids per-sample branches on each filter cell.
          if (--scrubIn === 0) {
            for (const state of history) for (let cell = 0; cell < state.length; cell++) if (Math.abs(state[cell]) < 1e-30) state[cell] = 0;
            scrubIn = 1024;
          }
          for (let j = 0; j < values.length; j++) values[j] += smooth * (targets[j] - values[j]);
          if (p.model !== 'clean' && (values[6] !== baselineBias || values[7] !== baselineLoop)) {
            // Bias/feedback may settle between edits; reuse their exact
            // transforms without changing the per-sample control smoothing.
            baselineBias = values[6]; baselineLoop = values[7];
            firstBaseline = closedLoop(values[6], values[7]); firstNormalization = loopNormalization(firstBaseline, values[7]);
            secondBaseline = closedLoop(-values[6] * .55, values[7] * .7); secondNormalization = loopNormalization(secondBaseline, values[7] * .7);
          }
          for (let channel = 0; channel < 2; channel++) {
            const data = channel ? right : left, dry = bound(data[i]);
            const driven = safe(dry * values[0]);
            inputEnergy += dry * dry; stageEnergy += driven * driven; inputPeak = Math.max(inputPeak, Math.abs(dry));
            let coloured = driven;
            if (p.model !== 'clean') {
              const prior = previous[channel], increment = (driven - prior) * .25;
              let delta = 0;
              for (let sub = 1; sub <= 4; sub++) {
                const upsampled = prior + increment * sub;
                delta = circuit(upsampled, channel) - upsampled;
                delta = filter(delta, deltaFilters[0], deltaState, channel * 4);
                delta = filter(delta, deltaFilters[1], deltaState, channel * 4 + 2);
              }
              previous[channel] = driven;
              // Remove nonlinear DC only from the delta. The undelayed linear
              // path survives Colour=0 and neutral clean settings unchanged.
              const cleaned = delta - dcPrevious[channel] + dcCoefficient * dcState[channel];
              dcPrevious[channel] = delta; dcState[channel] = Math.abs(cleaned) < 1e-24 ? 0 : cleaned;
              coloured += values[2] * dcState[channel];
            }
            // Smooth stage gain and net linear gain, then derive the output
            // ratio jointly. Independently smoothing reciprocal stage/output
            // gains would create a large gain surge during Drive automation.
            let wet = tone(coloured, channel) * (values[1] / values[0]) * values[19];
            if (pending[channel]) {
              declickOffset[channel] = lastWet[channel] - wet; declickRemaining[channel] = declickFrames; pending[channel] = 0;
            }
            if (declickRemaining[channel] > 0) {
              wet += declickOffset[channel] * declickRemaining[channel] / declickFrames;
              declickRemaining[channel]--;
            }
            lastWet[channel] = wet;
            // Exact dry immediately, irrespective of previous wet/colour history.
            const output = p.bypass || p.mix === 0 ? dry : bound(dry + (wet - dry) * values[3]);
            data[i] = output; outputEnergy += output * output; outputPeak = Math.max(outputPeak, Math.abs(output));
          }
        }
        const samples = Math.max(1, count * 2);
        meter.inputDb = Math.max(-120, levelDb(Math.sqrt(inputEnergy / samples)));
        meter.stageDb = Math.max(-120, levelDb(Math.sqrt(stageEnergy / samples)));
        meter.outputDb = Math.max(-120, levelDb(Math.sqrt(outputEnergy / samples)));
        meter.inputPeak = inputPeak; meter.outputPeak = outputPeak;
      }
      update();
      return {
        setParams(next) { p = normalize(Object.assign({}, p, next && typeof next === 'object' ? next : {})); update(); },
        process,
        reset() {
          clearCircuit();
          for (const state of [lowTone, highTone, cutLow, cutHigh, lastWet, declickOffset, declickRemaining, pending]) state.fill(0);
          values.set(targets); scrubIn = 1024;
          Object.assign(meter, { inputDb: -120, stageDb: -120, outputDb: -120, inputPeak: 0, outputPeak: 0 });
        },
        getTailTime() {
          if (p.bypass || p.mix === 0 || (p.model === 'clean' && p.lowCut === 0 && p.lowGain === 0 && p.highGain === 0 && p.highCut === 22000)) return 0;
          // A 1 Hz user high-pass can hold a hot gain-staged DC step well
          // beyond the circuit's ordinary two-second decay. Bound that pole
          // from the permitted input, gain and shelf boost rather than hiding
          // its last samples behind an arbitrarily short advertised tail.
          const gainBound = 8 * db(p.input + (p.compensate === 'off' ? p.drive : 0) + p.output + Math.max(0, p.lowGain) + Math.max(0, p.highGain));
          return p.lowCut > 0 ? Math.max(2, (Math.log(Math.max(1, gainBound) / 1e-7) + 4) / (TAU * p.lowCut)) : 2;
        },
        getMeters() { return Object.assign({}, meter); }
      };
    }
    return { specifications, normalize, create };
  }
  scope.createLoomPreampDSP = createLoomPreampDSP;
})(typeof window === 'undefined' ? globalThis : window);
