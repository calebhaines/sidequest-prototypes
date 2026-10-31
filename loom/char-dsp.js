/* CHAR · the three original circuits and twelve new ways to overcook a signal. */
(function (scope) {
  'use strict';
  function createLoomCharDSP() {
    'use strict';
    // This complete factory is serialized into GALLEY and percussion Worklets.
    const PI = Math.PI, TAU = PI * 2;
    const original = new Set(['soft', 'diode', 'fold']);
    const specifications = {
      shape: ['soft', 'diode', 'fold', 'hard', 'cubic', 'arctan', 'rectifier', 'valve', 'pushpull', 'transistor', 'opamp', 'led', 'gated', 'sinefold', 'broken'],
      drive: [0, 36, 8], bias: [-.75, .75, 0], tone: [300, 20000, 10000], output: [-24, 6, -3], mix: [0, 1, .65]
    };
    const finite = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    const safe = value => Number.isFinite(value) ? clamp(value, -8, 8) : 0;
    const db = value => Math.pow(10, value / 20);
    const output = (dry, wet, mix) => safe(dry + (wet - dry) * mix);
    const lowpass = (frequency, rate) => 1 - Math.exp(-TAU * Math.min(frequency, rate * .45) / rate);
    function normalize(source) {
      source = source && typeof source === 'object' ? source : {};
      const result = {};
      for (const [key, rule] of Object.entries(specifications)) result[key] = typeof rule[0] === 'number' ? clamp(finite(source[key], rule[2]), rule[0], rule[1]) : rule.includes(source[key]) ? source[key] : rule[0];
      result.bypass = source.bypass === true; return result;
    }
    function coefficients(frequency, q, rate) {
      const angle = TAU * frequency / rate, cosine = Math.cos(angle), alpha = Math.sin(angle) / (2 * q), a0 = 1 + alpha;
      return new Float64Array([(1 - cosine) * .5 / a0, (1 - cosine) / a0, (1 - cosine) * .5 / a0, -2 * cosine / a0, (1 - alpha) / a0]);
    }
    function filter(value, c, history, offset) {
      const result = c[0] * value + history[offset];
      history[offset] = c[1] * value - c[3] * result + history[offset + 1];
      history[offset + 1] = c[2] * value - c[4] * result;
      return result;
    }
    const circuits = {
      hard: { tilt: 0, pre: 0, cap: 20000, curve: x => clamp(x, -1, 1) },
      cubic: { tilt: 0, pre: 0, cap: 20000, curve: x => { x = clamp(x, -1.5, 1.5); return x - 4 / 27 * x * x * x; } },
      arctan: { tilt: 0, pre: 0, cap: 20000, curve: x => 2 / PI * Math.atan(PI * .5 * x) },
      rectifier: { tilt: 0, pre: 0, cap: 16000, curve: x => { const y = Math.tanh(x); return Math.sqrt(y * y + .0009) - .03; } },
      valve: { tilt: -.18, pre: 250, cap: 15000, dynamic: true, curve: (x, memory) => { const headroom = 1 + .2 * Math.min(3, memory); return 1.05 * headroom * Math.tanh(x / headroom + .22 + .025 * memory); } },
      pushpull: { tilt: 0, pre: 0, cap: 18000, curve: x => Math.sign(x) * .88 * Math.tanh(Math.max(0, Math.abs(x) - .085) * 1.55) },
      transistor: { tilt: .7, pre: 280, cap: 6200, curve: x => .78 * Math.tanh(2.6 * x + .15) + .1 * Math.tanh(6 * x - .08) },
      opamp: { tilt: .45, pre: 650, cap: 7800, curve: x => clamp(x / (1 + .72 * Math.abs(x)), -.95, .95) },
      led: { tilt: 0, pre: 0, cap: 20000, curve: x => { const magnitude = Math.abs(x); return magnitude <= 1.2 ? x : Math.sign(x) * (1.2 + .25 * (1 - Math.exp(-(magnitude - 1.2) / .25))); } },
      gated: { tilt: .3, pre: 160, cap: 10000, dynamic: true, curve: (x, memory, gate) => .85 * Math.tanh(x * 3.6) * gate / (1 + .12 * Math.min(3, memory)) },
      sinefold: { tilt: 0, pre: 0, cap: 18000, curve: x => Math.sin(x * 1.5) / 1.5 },
      broken: { tilt: -.2, pre: 120, cap: 4800, dynamic: true, curve: (x, memory) => { const sag = 1 - .27 * Math.min(2.5, memory), shifted = x + .14 * Math.min(2, memory); return shifted < 0 ? .32 * Math.tanh(shifted * 3.8) : sag * Math.tanh(shifted * 1.1); } }
    };
    function create(sampleRate, source) {
      const sr = clamp(finite(sampleRate, 48000), 8000, 192000), osr = sr * 4;
      let p = normalize(source), circuit = circuits[p.shape] || null;
      // These variables and arithmetic are deliberately the released Cinder
      // implementation. The original three choices retain their exact sound.
      let prevL = 0, prevR = 0, toneL = 0, toneR = 0, dcL = 0, dcR = 0, outL = 0, outR = 0, gain = 1, level = 1, coefficient = 1, biasOutput = 0;
      const dc = Math.exp(-TAU * 15 / sr);
      function legacyShape(value) {
        if (p.shape === 'diode') return value >= 0 ? 1 - Math.exp(-value) : -.65 * (1 - Math.exp(value / .65));
        if (p.shape === 'fold') return 2 / PI * Math.asin(Math.sin(value * PI * .5));
        return Math.tanh(value);
      }
      function updateLegacy() { gain = db(p.drive); level = db(p.output); coefficient = lowpass(p.tone, sr * 2); biasOutput = legacyShape(p.bias); }
      function resetLegacy() { prevL = prevR = toneL = toneR = dcL = dcR = outL = outR = 0; }
      function runLegacy(left, right) {
        if (p.bypass) { for (let i = 0; i < left.length; i++) { left[i] = safe(left[i]); right[i] = safe(right[i]); } return; }
        const mix = p.mix;
        for (let i = 0; i < left.length; i++) {
          const dryL = safe(left[i]), dryR = safe(right[i]);
          toneL += coefficient * (legacyShape((dryL + prevL) * .5 * gain + p.bias) - biasOutput - toneL);
          toneR += coefficient * (legacyShape((dryR + prevR) * .5 * gain + p.bias) - biasOutput - toneR);
          const middleL = toneL, middleR = toneR;
          toneL += coefficient * (legacyShape(dryL * gain + p.bias) - biasOutput - toneL);
          toneR += coefficient * (legacyShape(dryR * gain + p.bias) - biasOutput - toneR);
          const filteredL = (middleL + toneL) * .5, filteredR = (middleR + toneR) * .5;
          outL = filteredL - dcL + dc * outL; outR = filteredR - dcR + dc * outR; dcL = filteredL; dcR = filteredR; prevL = dryL; prevR = dryR;
          left[i] = output(dryL, outL * level, mix); right[i] = output(dryR, outR * level, mix);
        }
      }
      const previous = new Float64Array(2), preLow = new Float64Array(2), tone = new Float64Array(2), memory = new Float64Array(2), gate = new Float64Array([1, 1]), gateTarget = new Float64Array([1, 1]);
      const aaState = new Float64Array(8), dcPrevious = new Float64Array(2), dcOut = new Float64Array(2), lastDry = new Float64Array(2), lastOutput = new Float64Array(2);
      const values = new Float64Array(6), targets = new Float64Array(6);
      const aa = [coefficients(sr * .39, .5411961, osr), coefficients(sr * .39, 1.306563, osr)];
      const smooth = 1 - Math.exp(-1 / (sr * .004)), activitySmooth = 1 - Math.exp(-1 / (sr * .006));
      const attack = 1 - Math.exp(-1 / (osr * .0006)), release = 1 - Math.exp(-1 / (osr * .045)), gateCoefficient = 1 - Math.exp(-1 / (osr * .0008));
      const transitionFrames = Math.max(1, Math.round(sr * .005)), correction = new Float64Array(2);
      let transitionPending = false, transitionRemaining = 0, dormant = false, inputPeak = 0, outputPeak = 0;
      let preCoefficient = 0, biasCurve = null, biasInput = NaN, biasZero = 0;
      function updateTargets() {
        circuit = circuits[p.shape] || null;
        preCoefficient = circuit?.pre > 0 ? lowpass(circuit.pre, osr) : 0;
        targets[0] = db(p.drive); targets[1] = p.bias; targets[2] = lowpass(Math.min(p.tone, circuit?.cap || 20000), osr); targets[3] = db(p.output); targets[4] = p.mix; targets[5] = p.bypass ? 0 : 1;
      }
      function clearNew() {
        for (const history of [previous, preLow, tone, memory, aaState, dcPrevious, dcOut]) history.fill(0);
        gate.fill(1); gateTarget.fill(1);
      }
      function finishFrame(left, right, frame) {
          if (transitionPending) { correction[0] = lastOutput[0] - left[frame]; correction[1] = lastOutput[1] - right[frame]; transitionRemaining = transitionFrames; transitionPending = false; }
          if (transitionRemaining > 0) {
            const progress = 1 - transitionRemaining / transitionFrames, weight = 1 - progress * progress * (3 - 2 * progress);
            left[frame] = safe(left[frame] + correction[0] * weight); right[frame] = safe(right[frame] + correction[1] * weight); transitionRemaining--;
          }
          lastOutput[0] = left[frame]; lastOutput[1] = right[frame];
      }
      function bridge(left, right) { for (let frame = 0; frame < left.length; frame++) finishFrame(left, right, frame); }
      function runNew(left, right) {
        inputPeak = outputPeak = 0;
        const nonlinear = circuit.curve;
        for (let frame = 0; frame < left.length; frame++) {
          for (let key = 0; key < values.length; key++) { values[key] += (targets[key] - values[key]) * (key === 5 ? activitySmooth : smooth); if (Math.abs(targets[key] - values[key]) < 1e-10) values[key] = targets[key]; }
          const blend = values[4] * values[5];
          if (blend === 0 && !transitionPending && !transitionRemaining) {
            if (!dormant) { clearNew(); dormant = true; }
            for (let channel = 0; channel < 2; channel++) { const data = channel ? right : left, dry = safe(data[frame]); data[frame] = dry; lastDry[channel] = previous[channel] = dry; inputPeak = Math.max(inputPeak, Math.abs(dry)); }
            finishFrame(left, right, frame);
            outputPeak = Math.max(outputPeak, Math.abs(left[frame]), Math.abs(right[frame]));
            continue;
          }
          // A settled dry/bypassed insert resumes from the present source,
          // rather than resurrecting an interpolator sample from its past.
          if (dormant) { clearNew(); previous[0] = safe(left[frame]); previous[1] = safe(right[frame]); dormant = false; }
          const bias = values[1];
          if (!circuit.dynamic && (biasCurve !== nonlinear || biasInput !== bias)) { biasCurve = nonlinear; biasInput = bias; biasZero = nonlinear(bias, 0, 1); }
          const zero = circuit.dynamic ? 0 : biasZero;
          for (let channel = 0; channel < 2; channel++) {
            const data = channel ? right : left, dry = safe(data[frame]), before = previous[channel]; let wet = 0;
            inputPeak = Math.max(inputPeak, Math.abs(dry));
            for (let step = 1; step <= 4; step++) {
              const driven = (before + (dry - before) * (step * .25)) * values[0];
              let excited = driven;
              if (preCoefficient) { preLow[channel] += preCoefficient * (driven - preLow[channel]); excited += circuit.tilt * (driven - preLow[channel]); }
              if (circuit.dynamic) {
                const magnitude = Math.min(64, Math.abs(driven)); memory[channel] += (magnitude - memory[channel]) * (magnitude > memory[channel] ? attack : release);
                if (p.shape === 'gated') { if (memory[channel] > .07) gateTarget[channel] = 1; else if (memory[channel] < .035) gateTarget[channel] = 0; gate[channel] += (gateTarget[channel] - gate[channel]) * gateCoefficient; }
              }
              const base = circuit.dynamic ? nonlinear(bias, memory[channel], gate[channel]) : zero;
              const shaped = nonlinear(excited + bias, memory[channel], gate[channel]) - base;
              tone[channel] += values[2] * (shaped - tone[channel]);
              wet = filter(filter(tone[channel], aa[0], aaState, channel * 2), aa[1], aaState, 4 + channel * 2);
            }
            previous[channel] = lastDry[channel] = dry;
            const cleaned = wet - dcPrevious[channel] + dc * dcOut[channel]; dcPrevious[channel] = wet; dcOut[channel] = cleaned;
            data[frame] = output(dry, cleaned * values[3], blend);
          }
          finishFrame(left, right, frame);
          outputPeak = Math.max(outputPeak, Math.abs(left[frame]), Math.abs(right[frame]));
        }
      }
      updateLegacy(); updateTargets(); values.set(targets);
      return {
        setParams(next) {
          const before = p; p = normalize(Object.assign({}, p, next && typeof next === 'object' ? next : {}));
          if (before.shape !== p.shape) {
            transitionPending = true;
            if (original.has(p.shape)) { resetLegacy(); prevL = lastDry[0]; prevR = lastDry[1]; }
            else { clearNew(); previous.set(lastDry); dormant = false; if (original.has(before.shape)) { values[0] = db(before.drive); values[1] = before.bias; values[3] = db(before.output); values[4] = before.mix; values[5] = before.bypass ? 0 : 1; } }
          }
          updateLegacy(); updateTargets();
        },
        process(left, right) {
          if (!left || !right || left.length !== right.length) throw Error('CHAR requires equal stereo blocks.');
          if (original.has(p.shape)) {
            if (left.length) { lastDry[0] = safe(left[left.length - 1]); lastDry[1] = safe(right[right.length - 1]); }
            runLegacy(left, right);
            if (transitionPending || transitionRemaining) bridge(left, right);
            else if (left.length) { lastOutput[0] = left[left.length - 1]; lastOutput[1] = right[right.length - 1]; }
          } else runNew(left, right);
        },
        reset() { resetLegacy(); clearNew(); lastDry.fill(0); lastOutput.fill(0); correction.fill(0); transitionPending = false; transitionRemaining = 0; dormant = false; updateTargets(); values.set(targets); inputPeak = outputPeak = 0; },
        getTailTime() { return original.has(p.shape) ? .1 : values[4] * values[5] === 0 && !transitionPending && !transitionRemaining ? 0 : .3; },
        getLatencyTime() { return 0; },
        getMeters() { return original.has(p.shape) ? { reductionDb: 0 } : { reductionDb: 0, inputDb: Math.max(-120, 20 * Math.log10(Math.max(1e-12, inputPeak))), outputDb: Math.max(-120, 20 * Math.log10(Math.max(1e-12, outputPeak))) }; }
      };
    }
    return { specifications, normalize, create };
  }
  scope.createLoomCharDSP = createLoomCharDSP;
})(typeof window === 'undefined' ? globalThis : window);
