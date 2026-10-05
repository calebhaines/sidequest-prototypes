/* LOOM · deterministic stereo insert DSP, shared by Worklet and offline render. */
(function (scope) {
  'use strict';
  function createLoomEffectsDSP() {
    'use strict';
    const PI = Math.PI, TAU = 2 * PI, SQRT_HALF = Math.SQRT1_2;
    const divisions = { '1/32': 0.125, '1/16': 0.25, '1/8': 0.5, '1/8.': 0.75, '1/4': 1, '1/4.': 1.5, '1/2': 2, '1': 4, '2': 8 };
    const specifications = {
      prism: { low: [-18, 18, 0], mid: [-18, 18, 0], high: [-18, 18, 0], midFreq: [120, 6000, 1000], filter: ['off', 'lowpass', 'highpass', 'bandpass'], cutoff: [30, 20000, 12000], resonance: [0.3, 8, 0.707], mix: [0, 1, 1] },
      velvet: { threshold: [-48, 0, -18], ratio: [1, 20, 4], attack: [0.2, 100, 12], release: [20, 1500, 180], knee: [0, 18, 6], makeup: [-12, 24, 3], sidechain: [20, 500, 30], mix: [0, 1, 1] },
      cinder: { shape: ['soft', 'diode', 'fold'], drive: [0, 36, 8], bias: [-0.75, 0.75, 0], tone: [300, 20000, 10000], output: [-24, 6, -3], mix: [0, 1, 0.65] },
      undertow: { mode: ['chorus', 'flanger'], rate: [0.02, 8, 0.35], delay: [1, 35, 12], depth: [0, 12, 5], feedback: [-0.9, 0.9, 0.12], spread: [0, 1, 0.75], mix: [0, 1, 0.5] },
      parallax: { clock: ['sync', 'free'], division: ['1/8.', '1/32', '1/16', '1/8', '1/4', '1/4.', '1/2', '1'], time: [20, 2000, 375], feedback: [0, 0.92, 0.42], damping: [500, 18000, 6000], spread: [0, 1, 1], mix: [0, 1, 0.3] },
      vestige: { size: [0, 1, 0.55], decay: [0.2, 12, 2.8], damping: [800, 18000, 6500], predelay: [0, 180, 22], diffusion: [0, 1, 0.75], width: [0, 1, 0.9], mix: [0, 1, 0.25] },
      halo: { semitones: [-24, 24, 7], fine: [-50, 50, 0], window: [20, 120, 60], feedback: [0, 0.65, 0.12], tone: [1000, 20000, 12000], spread: [0, 1, 0.65], mix: [0, 1, 0.35] },
      tremor: { division: ['1/8', '1/32', '1/16', '1/8.', '1/4', '1/4.', '1/2', '1', '2'], shape: ['sine', 'triangle', 'gate', 'pulse'], depth: [0, 1, 0.65], pan: [0, 1, 0.5], duty: [0.05, 0.95, 0.5], phase: [0, 360, 0], smooth: [0, 80, 4], mix: [0, 1, 1] }
    };
    const finite = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    const bounded = value => Number.isFinite(value) ? clamp(value, -8, 8) : 0;
    const input = value => Number.isFinite(value) ? clamp(value, -8, 8) : 0;
    const output = (dry, wet, mix) => bounded(dry + (wet - dry) * mix);
    const db = value => Math.pow(10, value / 20);
    const lowpass = (freq, sr) => 1 - Math.exp(-TAU * Math.min(freq, sr * 0.45) / sr);
    const tempoOf = context => clamp(finite(context && context.tempo, 120), 40, 300);
    const clear = array => array.fill(0);

    function normalize(type, params) {
      const spec = specifications[type];
      if (!spec) throw new Error('Unknown LOOM effect: ' + type);
      const source = params && typeof params === 'object' ? params : {};
      const result = {};
      for (const key of Object.keys(spec)) {
        const rule = spec[key];
        result[key] = typeof rule[0] === 'number' ? clamp(finite(source[key], rule[2]), rule[0], rule[1]) : rule.includes(source[key]) ? source[key] : rule[0];
      }
      result.bypass = source.bypass === true;
      return result;
    }

    function read(buffer, write, delay) {
      let position = write - delay;
      position %= buffer.length;
      if (position < 0) position += buffer.length;
      const index = Math.floor(position), fraction = position - index;
      const next = index + 1 === buffer.length ? 0 : index + 1;
      return buffer[index] + (buffer[next] - buffer[index]) * fraction;
    }

    function biquad(mode, freq, q, gain, sr) {
      const w = TAU * clamp(freq, 10, sr * 0.45) / sr, c = Math.cos(w), s = Math.sin(w);
      const A = Math.pow(10, gain / 40), alpha = s / (2 * q);
      let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
      if (mode === 'peak') {
        b0 = 1 + alpha * A; b1 = -2 * c; b2 = 1 - alpha * A;
        a0 = 1 + alpha / A; a1 = -2 * c; a2 = 1 - alpha / A;
      } else if (mode === 'low' || mode === 'high') {
        const t = Math.sqrt(2) * s * Math.sqrt(A);
        if (mode === 'low') {
          b0 = A * ((A + 1) - (A - 1) * c + t); b1 = 2 * A * ((A - 1) - (A + 1) * c); b2 = A * ((A + 1) - (A - 1) * c - t);
          a0 = (A + 1) + (A - 1) * c + t; a1 = -2 * ((A - 1) + (A + 1) * c); a2 = (A + 1) + (A - 1) * c - t;
        } else {
          b0 = A * ((A + 1) + (A - 1) * c + t); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - t);
          a0 = (A + 1) - (A - 1) * c + t; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - t;
        }
      } else if (mode === 'lowpass') {
        b0 = (1 - c) * 0.5; b1 = 1 - c; b2 = b0; a0 = 1 + alpha; a1 = -2 * c; a2 = 1 - alpha;
      } else if (mode === 'highpass') {
        b0 = (1 + c) * 0.5; b1 = -(1 + c); b2 = b0; a0 = 1 + alpha; a1 = -2 * c; a2 = 1 - alpha;
      } else if (mode === 'bandpass') {
        b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * c; a2 = 1 - alpha;
      }
      return new Float64Array([b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0]);
    }
    function filterSample(value, coefficients, state, offset) {
      const result = bounded(coefficients[0] * value + state[offset]);
      state[offset] = bounded(coefficients[1] * value - coefficients[3] * result + state[offset + 1]);
      state[offset + 1] = bounded(coefficients[2] * value - coefficients[4] * result);
      return result;
    }

    function create(type, sampleRate, params) {
      let p = normalize(type, params);
      const sr = clamp(finite(sampleRate, 48000), 8000, 192000);
      let update, run, reset, tail = () => 0;
      const meter = { reductionDb: 0 };

      if (type === 'prism') {
        const states = [new Float64Array(4), new Float64Array(4), new Float64Array(4), new Float64Array(4)];
        let coefficients = [];
        update = () => { coefficients = [biquad('low', 220, 0.707, p.low, sr), biquad('peak', p.midFreq, 0.8, p.mid, sr), biquad('high', 4500, 0.707, p.high, sr), biquad(p.filter, p.cutoff, p.resonance, 0, sr)]; };
        run = (left, right) => {
          const mix = p.mix;
          for (let i = 0; i < left.length; i++) {
            const dryL = input(left[i]), dryR = input(right[i]);
            let wetL = dryL, wetR = dryR;
            for (let b = 0; b < 4; b++) { wetL = filterSample(wetL, coefficients[b], states[b], 0); wetR = filterSample(wetR, coefficients[b], states[b], 2); }
            left[i] = output(dryL, wetL, mix); right[i] = output(dryR, wetR, mix);
          }
        };
        reset = () => states.forEach(clear);
        tail = () => p.filter === 'off' ? 0.04 : Math.min(2, 0.03 + Math.log(1000) * p.resonance / (PI * p.cutoff));
      } else if (type === 'velvet') {
        let envelope = 0, previousL = 0, previousR = 0, hpL = 0, hpR = 0, attack = 0, release = 0, hp = 0, makeup = 1;
        update = () => { attack = Math.exp(-1 / (sr * p.attack * 0.001)); release = Math.exp(-1 / (sr * p.release * 0.001)); hp = Math.exp(-TAU * Math.min(p.sidechain, sr * 0.4) / sr); makeup = db(p.makeup); };
        run = (left, right) => {
          const mix = p.mix, strength = 1 - 1 / p.ratio, halfKnee = p.knee * 0.5;
          for (let i = 0; i < left.length; i++) {
            const dryL = input(left[i]), dryR = input(right[i]);
            hpL = dryL - previousL + hp * hpL; hpR = dryR - previousR + hp * hpR; previousL = dryL; previousR = dryR;
            const peak = Math.max(Math.abs(hpL), Math.abs(hpR));
            const coefficient = peak > envelope ? attack : release;
            envelope = coefficient * envelope + (1 - coefficient) * peak;
            const over = 20 * Math.log10(Math.max(envelope, 1e-12)) - p.threshold;
            let reduction = 0;
            if (p.knee > 0 && over > -halfKnee && over < halfKnee) reduction = strength * (over + halfKnee) * (over + halfKnee) / (2 * p.knee);
            else if (over >= halfKnee) reduction = strength * over;
            const gain = db(-reduction) * makeup;
            meter.reductionDb = reduction;
            left[i] = output(dryL, dryL * gain, mix); right[i] = output(dryR, dryR * gain, mix);
          }
        };
        reset = () => { envelope = previousL = previousR = hpL = hpR = 0; meter.reductionDb = 0; };
      } else if (type === 'cinder') {
        let prevL = 0, prevR = 0, toneL = 0, toneR = 0, dcL = 0, dcR = 0, outL = 0, outR = 0, gain = 1, level = 1, coefficient = 1, dc = Math.exp(-TAU * 15 / sr), biasOutput = 0;
        function shape(value) {
          if (p.shape === 'diode') return value >= 0 ? 1 - Math.exp(-value) : -0.65 * (1 - Math.exp(value / 0.65));
          if (p.shape === 'fold') return 2 / PI * Math.asin(Math.sin(value * PI * 0.5));
          return Math.tanh(value);
        }
        update = () => { gain = db(p.drive); level = db(p.output); coefficient = lowpass(p.tone, sr * 2); biasOutput = shape(p.bias); };
        run = (left, right) => {
          const mix = p.mix;
          for (let i = 0; i < left.length; i++) {
            const dryL = input(left[i]), dryR = input(right[i]);
            toneL += coefficient * (shape((dryL + prevL) * 0.5 * gain + p.bias) - biasOutput - toneL);
            toneR += coefficient * (shape((dryR + prevR) * 0.5 * gain + p.bias) - biasOutput - toneR);
            const middleL = toneL, middleR = toneR;
            toneL += coefficient * (shape(dryL * gain + p.bias) - biasOutput - toneL);
            toneR += coefficient * (shape(dryR * gain + p.bias) - biasOutput - toneR);
            const filteredL = (middleL + toneL) * 0.5, filteredR = (middleR + toneR) * 0.5;
            outL = filteredL - dcL + dc * outL; outR = filteredR - dcR + dc * outR; dcL = filteredL; dcR = filteredR; prevL = dryL; prevR = dryR;
            left[i] = output(dryL, outL * level, mix); right[i] = output(dryR, outR * level, mix);
          }
        };
        reset = () => { prevL = prevR = toneL = toneR = dcL = dcR = outL = outR = 0; };
        tail = () => 0.1;
      } else if (type === 'undertow') {
        const length = Math.ceil(sr * 0.08) + 4, bufferL = new Float32Array(length), bufferR = new Float32Array(length);
        let write = 0, phase = 0, delay = 0, depth = 0, increment = 0;
        update = () => { const scale = p.mode === 'flanger' ? 0.15 : 1; delay = Math.max(1, p.delay * 0.001 * sr * scale); depth = p.depth * 0.001 * sr * scale; increment = TAU * p.rate / sr; };
        run = (left, right) => {
          const mix = p.mix, cross = p.spread * 0.2, flange = p.mode === 'flanger';
          for (let i = 0; i < left.length; i++) {
            const dryL = input(left[i]), dryR = input(right[i]);
            const delayedL = read(bufferL, write, delay + depth * (0.5 + 0.5 * Math.sin(phase)));
            const delayedR = read(bufferR, write, delay + depth * (0.5 + 0.5 * Math.sin(phase + p.spread * PI)));
            bufferL[write] = bounded(dryL + p.feedback * (delayedL * (1 - cross) + delayedR * cross));
            bufferR[write] = bounded(dryR + p.feedback * (delayedR * (1 - cross) + delayedL * cross));
            const wetL = flange ? dryL * 0.65 + delayedL * 0.7 : delayedL, wetR = flange ? dryR * 0.65 + delayedR * 0.7 : delayedR;
            left[i] = output(dryL, wetL, mix); right[i] = output(dryR, wetR, mix);
            if (++write === length) write = 0;
            phase += increment; if (phase >= TAU) phase -= TAU;
          }
        };
        reset = () => { clear(bufferL); clear(bufferR); write = 0; phase = 0; };
        tail = () => Math.min(6, 0.08 * (1 + Math.log(0.001) / Math.log(Math.max(0.001, Math.abs(p.feedback)))));
      } else if (type === 'parallax') {
        const length = Math.ceil(sr * 6) + 4, bufferL = new Float32Array(length), bufferR = new Float32Array(length);
        let write = 0, dampL = 0, dampR = 0, hpL = 0, hpR = 0, prevL = 0, prevR = 0, delay = -1, coefficient = 1;
        const slew = 1 - Math.exp(-1 / (sr * 0.04)), hp = Math.exp(-TAU * 18 / sr);
        const seconds = context => p.clock === 'free' ? p.time * 0.001 : divisions[p.division] * 60 / tempoOf(context);
        update = () => { coefficient = lowpass(p.damping, sr); };
        run = (left, right, context) => {
          const targetDelay = clamp(seconds(context) * sr, 1, length - 3), mix = p.mix, spread = p.spread;
          if (delay < 0) delay = targetDelay;
          for (let i = 0; i < left.length; i++) {
            const dryL = input(left[i]), dryR = input(right[i]);
            delay += slew * (targetDelay - delay);
            const delayedL = read(bufferL, write, delay), delayedR = read(bufferR, write, delay);
            dampL += coefficient * (delayedL - dampL); dampR += coefficient * (delayedR - dampR);
            hpL = dampL - prevL + hp * hpL; hpR = dampR - prevR + hp * hpR; prevL = dampL; prevR = dampR;
            const mid = (dryL + dryR) * 0.5;
            bufferL[write] = bounded(dryL * (1 - spread) + mid * spread + p.feedback * (hpL * (1 - spread) + hpR * spread));
            bufferR[write] = bounded(dryR * (1 - spread) + p.feedback * (hpR * (1 - spread) + hpL * spread));
            left[i] = output(dryL, dampL, mix); right[i] = output(dryR, dampR, mix);
            if (++write === length) write = 0;
          }
        };
        reset = () => { clear(bufferL); clear(bufferR); write = 0; dampL = dampR = hpL = hpR = prevL = prevR = 0; delay = -1; };
        tail = context => Math.min(60, seconds(context) * (1 + Math.log(0.001) / Math.log(Math.max(0.001, p.feedback))));
      } else if (type === 'vestige') {
        const primes = [1493, 1601, 1747, 1867, 1999, 2131, 2281, 2411], lines = [], positions = new Int32Array(8), lengths = new Int32Array(8), gains = new Float64Array(8), damp = new Float64Array(8), matrix = new Float64Array(8);
        for (let j = 0; j < 8; j++) lines.push(new Float32Array(Math.ceil(primes[j] * 2.2 * sr / 48000) + 4));
        const preLength = Math.ceil(sr * 0.18) + 4, preL = new Float32Array(preLength), preR = new Float32Array(preLength);
        const apLengths = [Math.round(sr * 0.0037), Math.round(sr * 0.0109)], apL = apLengths.map(length => new Float32Array(Math.max(2, length))), apR = apLengths.map(length => new Float32Array(Math.max(2, length + 7))), apPositionL = new Int32Array(2), apPositionR = new Int32Array(2);
        let preWrite = 0, preDelay = 0, coefficient = 1;
        update = () => {
          const scale = (0.7 + p.size * 1.5) * sr / 48000;
          for (let j = 0; j < 8; j++) { lengths[j] = Math.max(2, Math.round(primes[j] * scale)); positions[j] %= lengths[j]; gains[j] = Math.pow(10, -3 * lengths[j] / (sr * p.decay)); }
          preDelay = p.predelay * 0.001 * sr; coefficient = lowpass(p.damping, sr);
        };
        run = (left, right) => {
          const mix = p.mix, diffusion = p.diffusion * 0.7, normalization = 1 / Math.sqrt(8);
          for (let i = 0; i < left.length; i++) {
            const dryL = input(left[i]), dryR = input(right[i]);
            preL[preWrite] = dryL; preR[preWrite] = dryR;
            let diffuseL = preDelay > 0 ? read(preL, preWrite, preDelay) : dryL, diffuseR = preDelay > 0 ? read(preR, preWrite, preDelay) : dryR;
            if (++preWrite === preLength) preWrite = 0;
            if (diffusion > 0) {
              for (let j = 0; j < 2; j++) {
                const valueL = apL[j][apPositionL[j]] - diffusion * diffuseL, valueR = apR[j][apPositionR[j]] - diffusion * diffuseR;
                apL[j][apPositionL[j]] = bounded(diffuseL + diffusion * valueL); apR[j][apPositionR[j]] = bounded(diffuseR + diffusion * valueR); diffuseL = valueL; diffuseR = valueR;
                if (++apPositionL[j] === apL[j].length) apPositionL[j] = 0; if (++apPositionR[j] === apR[j].length) apPositionR[j] = 0;
              }
            }
            let sumL = 0, sumR = 0;
            for (let j = 0; j < 8; j++) {
              const value = lines[j][positions[j]];
              damp[j] += coefficient * (value - damp[j]); matrix[j] = damp[j];
              sumL += value * ((j & 1) ? -1 : 1); sumR += value * ((j & 2) ? -1 : 1);
            }
            for (let size = 1; size < 8; size *= 2) {
              for (let start = 0; start < 8; start += size * 2) for (let j = 0; j < size; j++) { const a = matrix[start + j], b = matrix[start + j + size]; matrix[start + j] = a + b; matrix[start + j + size] = a - b; }
            }
            const mid = (diffuseL + diffuseR) * 0.5, side = (diffuseL - diffuseR) * 0.5;
            for (let j = 0; j < 8; j++) {
              const injection = (mid + side * ((j & 1) ? -1 : 1)) * 0.24;
              lines[j][positions[j]] = bounded(matrix[j] * normalization * gains[j] + injection);
              if (++positions[j] === lengths[j]) positions[j] = 0;
            }
            const rawL = sumL * normalization * 0.8 + diffuseL * 0.16, rawR = sumR * normalization * 0.8 + diffuseR * 0.16;
            const wetMid = (rawL + rawR) * 0.5, wetSide = (rawL - rawR) * 0.5 * p.width;
            left[i] = output(dryL, wetMid + wetSide, mix); right[i] = output(dryR, wetMid - wetSide, mix);
          }
        };
        reset = () => { lines.forEach(clear); apL.forEach(clear); apR.forEach(clear); clear(preL); clear(preR); positions.fill(0); apPositionL.fill(0); apPositionR.fill(0); damp.fill(0); matrix.fill(0); preWrite = 0; };
        tail = () => p.predelay * 0.001 + p.decay + 0.25;
      } else if (type === 'halo') {
        const length = Math.ceil(sr * 0.15) + 8, bufferL = new Float32Array(length), bufferR = new Float32Array(length), baseDelay = sr * 0.004;
        const analysisStride = Math.max(1, Math.round(sr / 12000)), analysisSpan = Math.round(sr * 0.012), analysisInterval = Math.round(sr * 0.035), windowSlew = 1 - Math.exp(-1 / (sr * 0.018));
        let write = 0, phase = 0.25, previousWetL = 0, previousWetR = 0, toneL = 0, toneR = 0, windowSamples = 1, nominalWindow = 1, targetWindow = 1, ratioDifference = 0, upward = true, unison = false, coefficient = 1, analyzed = 0, samplesSeen = 0;
        update = () => {
          const ratio = Math.pow(2, (p.semitones + p.fine / 100) / 12), nextWindow = sr * p.window * 0.001;
          if (nextWindow !== nominalWindow) { nominalWindow = targetWindow = windowSamples = nextWindow; analyzed = 0; }
          ratioDifference = Math.abs(1 - ratio); upward = ratio > 1; unison = Math.abs(ratio - 1) < 1e-8; coefficient = lowpass(p.tone, sr);
        };
        // Correlation aligns the two splices to the incoming waveform. A fixed
        // grain period can otherwise pull the strongest spectral peak out of
        // tune. This bounded search runs every 35 ms, never once per sample.
        function correlation(lag) {
          let a = write, b = write - lag, cross = 0, energyA = 0, energyB = 0;
          if (b < 0) b += length;
          for (let j = 0; j < analysisSpan; j += analysisStride) {
            const xL = bufferL[a], xR = bufferR[a], yL = bufferL[b], yR = bufferR[b];
            cross += xL * yL + xR * yR; energyA += xL * xL + xR * xR; energyB += yL * yL + yR * yR;
            a -= analysisStride; b -= analysisStride; if (a < 0) a += length; if (b < 0) b += length;
          }
          return energyA * energyB > 1e-12 ? cross / Math.sqrt(energyA * energyB) : 0;
        }
        function alignWindow() {
          const center = nominalWindow * 0.5, minimum = Math.max(2, Math.round(center * 0.85)), maximum = Math.min(length - analysisSpan - 2, Math.round(center * 1.15));
          let bestLag = Math.round(center), bestScore = -2, bestCorrelation = 0;
          for (let lag = minimum; lag <= maximum; lag += analysisStride) {
            const value = correlation(lag), score = value - 0.02 * Math.abs(lag - center) / center;
            if (score > bestScore) { bestScore = score; bestLag = lag; bestCorrelation = value; }
          }
          const nearStart = Math.max(minimum, bestLag - analysisStride), nearEnd = Math.min(maximum, bestLag + analysisStride);
          for (let lag = nearStart; lag <= nearEnd; lag++) {
            const value = correlation(lag), score = value - 0.02 * Math.abs(lag - center) / center;
            if (score > bestScore) { bestScore = score; bestLag = lag; bestCorrelation = value; }
          }
          if (bestCorrelation > 0.8) {
            const before = correlation(bestLag - 1), middle = correlation(bestLag), after = correlation(bestLag + 1), denominator = before - 2 * middle + after;
            const fraction = Math.abs(denominator) > 1e-12 ? clamp(0.5 * (before - after) / denominator, -0.5, 0.5) : 0;
            targetWindow = clamp(2 * (bestLag + fraction), nominalWindow * 0.85, nominalWindow * 1.15);
          } else targetWindow = nominalWindow;
        }
        function shifted(buffer, cursor, phaseValue) {
          if (unison) return read(buffer, cursor, baseDelay);
          const phase2 = phaseValue < 0.5 ? phaseValue + 0.5 : phaseValue - 0.5;
          const sine = Math.sin(PI * phaseValue), weight = sine * sine;
          const delay1 = baseDelay + windowSamples * (upward ? 1 - phaseValue : phaseValue);
          const delay2 = baseDelay + windowSamples * (upward ? 1 - phase2 : phase2);
          return read(buffer, cursor, delay1) * weight + read(buffer, cursor, delay2) * (1 - weight);
        }
        run = (left, right) => {
          const mix = p.mix, cross = p.spread * 0.3;
          for (let i = 0; i < left.length; i++) {
            const dryL = input(left[i]), dryR = input(right[i]);
            bufferL[write] = bounded(dryL + p.feedback * (previousWetL * (1 - cross) + previousWetR * cross));
            bufferR[write] = bounded(dryR + p.feedback * (previousWetR * (1 - cross) + previousWetL * cross));
            samplesSeen++; analyzed++;
            if (!unison && analyzed >= analysisInterval && samplesSeen > nominalWindow * 0.575 + analysisSpan) { alignWindow(); analyzed = 0; }
            windowSamples += windowSlew * (targetWindow - windowSamples);
            let phaseR = phase + p.spread * 0.17; if (phaseR >= 1) phaseR -= 1;
            toneL += coefficient * (shifted(bufferL, write, phase) - toneL); toneR += coefficient * (shifted(bufferR, write, phaseR) - toneR);
            previousWetL = toneL; previousWetR = toneR;
            left[i] = output(dryL, toneL, mix); right[i] = output(dryR, toneR, mix);
            if (++write === length) write = 0;
            phase += ratioDifference / windowSamples; if (phase >= 1) phase -= Math.floor(phase);
          }
        };
        reset = () => { clear(bufferL); clear(bufferR); write = 0; phase = 0.25; previousWetL = previousWetR = toneL = toneR = 0; targetWindow = windowSamples = nominalWindow; analyzed = samplesSeen = 0; };
        tail = () => Math.min(4, (p.window * 0.001 * 1.15 + 0.004) * (1 + Math.log(0.001) / Math.log(Math.max(0.001, p.feedback))));
      } else if (type === 'tremor') {
        let phase = 0, gainL = 1, gainR = 1, coefficient = 1;
        update = () => { coefficient = p.smooth <= 0 ? 1 : 1 - Math.exp(-1 / (sr * p.smooth * 0.001)); };
        run = (left, right, context) => {
          const beats = divisions[p.division], increment = tempoOf(context) / (60 * sr * beats), mix = p.mix;
          if (context && context.playing && Number.isFinite(context.beat)) phase = context.beat / beats + p.phase / 360;
          else phase += p.phase / 360;
          phase -= Math.floor(phase);
          for (let i = 0; i < left.length; i++) {
            const dryL = input(left[i]), dryR = input(right[i]);
            let wave;
            if (p.shape === 'triangle') wave = 1 - Math.abs(2 * phase - 1);
            else if (p.shape === 'gate') wave = phase < p.duty ? 1 : 0;
            else if (p.shape === 'pulse') wave = phase < p.duty ? Math.sin(PI * phase / p.duty) : 0;
            else wave = 0.5 - 0.5 * Math.cos(TAU * phase);
            const amplitude = 1 - p.depth + p.depth * wave, angle = PI * 0.25 + Math.sin(TAU * phase) * p.pan * PI * 0.25;
            gainL += coefficient * (amplitude * Math.cos(angle) / SQRT_HALF - gainL); gainR += coefficient * (amplitude * Math.sin(angle) / SQRT_HALF - gainR);
            left[i] = output(dryL, dryL * gainL, mix); right[i] = output(dryR, dryR * gainR, mix);
            phase += increment; if (phase >= 1) phase -= 1;
          }
          if (!(context && context.playing && Number.isFinite(context.beat))) { phase -= p.phase / 360; phase -= Math.floor(phase); }
        };
        reset = () => { phase = 0; gainL = gainR = 1; };
      }
      update();
      return {
        setParams(next) { p = normalize(type, Object.assign({}, p, next && typeof next === 'object' ? next : {})); update(); },
        process(left, right, context) {
          if (!left || !right || left.length !== right.length) throw new Error('LOOM effects require equal stereo blocks.');
          if (p.bypass) { for (let i = 0; i < left.length; i++) { left[i] = input(left[i]); right[i] = input(right[i]); } return; }
          run(left, right, context || null);
        },
        reset,
        getTailTime(context) { return tail(context || null); },
        getMeters() { return { reductionDb: meter.reductionDb }; }
      };
    }
    return { create, normalize };
  }
  scope.createLoomEffectsDSP = createLoomEffectsDSP;
})(typeof window === 'undefined' ? globalThis : window);
