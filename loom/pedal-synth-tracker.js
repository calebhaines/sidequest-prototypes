/* FERMENT · causal, incrementally updated guitar/bass pitch analysis. */
(function (scope) {
  'use strict';
  function createLoomPedalTrackerDSP() {
    'use strict';
    const TAU = Math.PI * 2;
    const clamp = (value, low, high) => value < low ? low : value > high ? high : value;
    const finite = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    const ranges = { auto: [27, 1600], guitar: [50, 1600], bass: [27, 660] };
    function create(sampleRate, params) {
      const sr = clamp(finite(sampleRate, 48000), 8000, 192000), stride = Math.max(1, Math.ceil(sr / 8000)), rate = sr / stride;
      const maximumLag = Math.ceil(rate / 27) + 4, minimumWindow = Math.max(24, Math.round(rate * .006));
      let ringLength = 1; while (ringLength < maximumLag * 3.5 + minimumWindow + 16) ringLength *= 2;
      const ringMask = ringLength - 1, ring = new Float64Array(ringLength);
      // Dense short lags preserve high guitar pitches. The two-sample grid at
      // longer periods halves the work; fractional refinement restores pitch.
      const lagList = [];
      for (let lag = 2; lag <= maximumLag; lag += lag < 48 ? 1 : 2) lagList.push(lag);
      const lags = new Int32Array(lagList), windows = new Int32Array(lags.length), differences = new Float64Array(lags.length), energies = new Float64Array(lags.length), scores = new Float64Array(lags.length);
      for (let i = 0; i < lags.length; i++) windows[i] = Math.max(minimumWindow, Math.round(lags[i] * 1.3));
      const analysisInterval = Math.max(8, Math.round(rate * .0025));
      const spectralLength = 64, spectralHop = 12, spectralWindow = new Float64Array(spectralLength);
      const interpolationWeights = new Float64Array(8), interpolationDenominators = new Float64Array(8);
      for (let i = 0; i < 8; i++) { let denominator = 1; for (let j = 0; j < 8; j++) if (i !== j) denominator *= i - j; interpolationDenominators[i] = 1 / denominator; }
      for (let i = 0; i < spectralLength; i++) spectralWindow[i] = .5 - .5 * Math.cos(TAU * i / (spectralLength - 1));
      const lowCoefficient = 1 - Math.exp(-TAU * Math.min(1800, sr * .22) / sr), dcCoefficient = Math.exp(-TAU * 12 / sr);
      const attack = 1 - Math.exp(-1 / (sr * .001)), release = 1 - Math.exp(-1 / (sr * .035));
      let p, threshold = .001, firstIndex = 0, lastIndex = lags.length - 1, updateFirst = 0, updateLast = lags.length - 1;
      let write = 0, seen = 0, decimation = 0, interval = 0, sampleClock = 0, quietFrames = 0, idle = true;
      let dcInput = 0, dcOutput = 0, low1 = 0, low2 = 0, low3 = 0, low4 = 0;
      let lastGoodClock = -1, candidateHz = 0, candidateCount = 0, successful = 0;
      const api = { frequency: 0, confidence: 0, active: false, level: 0, period: 0, trackingLatencyMs: 0, analysisRate: rate, push, process: push, setParams, reset, getMeters };
      function clearAnalysis() {
        ring.fill(0); differences.fill(0); energies.fill(0); scores.fill(2);
        write = seen = decimation = interval = 0; dcInput = dcOutput = low1 = low2 = low3 = low4 = 0;
        lastGoodClock = -1; candidateHz = candidateCount = successful = 0;
        api.frequency = api.confidence = api.period = api.trackingLatencyMs = 0; api.active = false;
      }
      function reset() { clearAnalysis(); sampleClock = quietFrames = 0; api.level = 0; idle = true; }
      function setParams(values) {
        const previous = p;
        const source = Object.assign({}, p || {}, values && typeof values === 'object' ? values : {});
        p = { range: Object.prototype.hasOwnProperty.call(ranges, source.range) ? source.range : 'auto', tracking: clamp(finite(source.tracking, .5), 0, 1), sensitivity: clamp(finite(source.sensitivity, -60), -96, -6) };
        threshold = Math.pow(10, p.sensitivity / 20);
        const bounds = ranges[p.range]; firstIndex = 0; lastIndex = lags.length - 1;
        while (firstIndex < lastIndex && lags[firstIndex] < rate / bounds[1] - .5) firstIndex++;
        while (lastIndex > firstIndex && lags[lastIndex] > rate / bounds[0] + 1) lastIndex--;
        updateFirst = 0; updateLast = Math.min(lags.length - 1, lastIndex + 1);
        if (previous && previous.range !== p.range) { clearAnalysis(); idle = true; }
      }
      function refinedLag(index) {
        const period = lags[index];
        if (index <= 0 || index >= lags.length - 1 || scores[index - 1] >= 1.5 || scores[index + 1] >= 1.5) return period;
        const a = scores[index - 1], b = scores[index], c = scores[index + 1], left = period - lags[index - 1], right = lags[index + 1] - period;
        const slopeLeft = (b - a) / left, slopeRight = (c - b) / right, curve = (slopeRight - slopeLeft) / (left + right);
        if (!(curve > 1e-12)) return period;
        const gradient = slopeLeft + curve * left;
        let shift = clamp(-gradient / (2 * curve), -left * .75, right * .75);
        // A sinusoidal trough is curved at short periods. This trigonometric
        // correction avoids the high-note bias of a plain parabolic fit.
        if (period < 32 && left === right) for (let pass = 0; pass < 3; pass++) {
          const omega = TAU * left / Math.max(2, period + shift);
          shift = clamp(Math.atan((a - c) / (a + c - 2 * b) * Math.tan(omega * .5)) / omega * left, -left * .75, right * .75);
        }
        return period + shift;
      }
      function minimumError(index) {
        const value = scores[index];
        if (index <= 0 || index >= lags.length - 1) return value;
        const a = scores[index - 1], c = scores[index + 1], left = lags[index] - lags[index - 1], right = lags[index + 1] - lags[index];
        const slopeLeft = (value - a) / left, slopeRight = (c - value) / right, curve = (slopeRight - slopeLeft) / (left + right), gradient = slopeLeft + curve * left;
        return curve > 1e-12 && a < 1.5 && c < 1.5 ? Math.max(0, value - gradient * gradient / (4 * curve)) : value;
      }
      function continuousError(period, fallback) {
        const whole = Math.floor(period), t = whole - period, span = Math.max(minimumWindow, Math.round(period * 1.3));
        if (seen < span + whole + 4) return fallback;
        if (period < 32) {
          // An eighth-order sample grid has appreciably less high-harmonic
          // attenuation than cubic interpolation. Its -4..+3 nodes remain
          // causal at this detector's minimum period, with no lookahead.
          if (t === 0) { interpolationWeights.fill(0); interpolationWeights[4] = 1; }
          else {
            let product = 1; for (let j = 0; j < 8; j++) product *= t - (j - 4);
            for (let j = 0; j < 8; j++) interpolationWeights[j] = product / (t - (j - 4)) * interpolationDenominators[j];
          }
          let difference = 0, energy = 0;
          for (let i = 0; i < span; i++) {
            const at = write - 1 - i, x = ring[at & ringMask], base = at - whole;
            let y = 0; for (let j = 0; j < 8; j++) y += interpolationWeights[j] * ring[(base + j - 4) & ringMask];
            const delta = x - y; difference += delta * delta; energy += x * x + y * y;
          }
          return energy > 1e-14 ? clamp(difference / energy, 0, 2) : fallback;
        }
        const a = -(t + 1) * t * (t - 1) / 6, b = (t + 2) * t * (t - 1) / 2, c = -(t + 2) * (t + 1) * (t - 1) / 2, d = (t + 2) * (t + 1) * t / 6;
        let difference = 0, energy = 0;
        // Evaluate the chosen fractional period rather than comparing the
        // interpolation residue of different integer-grid troughs. Otherwise
        // a perfectly good F0 can lose to a numerically cleaner suboctave.
        for (let i = 0; i < span; i++) {
          const at = write - 1 - i, x = ring[at & ringMask], base = at - whole;
          const y = a * ring[(base - 2) & ringMask] + b * ring[(base - 1) & ringMask] + c * ring[base & ringMask] + d * ring[(base + 1) & ringMask], delta = x - y;
          difference += delta * delta; energy += x * x + y * y;
        }
        return energy > 1e-14 ? clamp(difference / energy, 0, 2) : fallback;
      }
      function phaseRefinement(frequency) {
        if (frequency < 500 || seen < spectralLength + spectralHop + 24) return frequency;
        let strongest = 0, bestRealA = 0, bestImagA = 0, bestRealB = 0, bestImagB = 0, bestHarmonic = 1;
        // A tiny lock-in comparison refines the already selected octave. A
        // dominant second harmonic is useful here, even when F0 is absent.
        // Only three narrow frequencies are probed; there is no FFT or job.
        for (let harmonic = 1; harmonic <= 3; harmonic++) {
          const nominal = frequency * harmonic;
          if (nominal >= rate * .46) break;
          const omega = TAU * nominal / rate, cosine = Math.cos(omega), sine = Math.sin(omega);
          let c = 1, q = 0, realA = 0, imagA = 0, realB = 0, imagB = 0;
          for (let i = 0; i < spectralLength; i++) {
            const weight = spectralWindow[i], a = ring[(write - spectralLength + i) & ringMask] * weight, b = ring[(write - spectralLength - spectralHop + i) & ringMask] * weight;
            realA += a * c; imagA -= a * q; realB += b * c; imagB -= b * q;
            const nextC = c * cosine - q * sine; q = q * cosine + c * sine; c = nextC;
          }
          const power = Math.min(realA * realA + imagA * imagA, realB * realB + imagB * imagB);
          if (power > strongest) { strongest = power; bestRealA = realA; bestImagA = imagA; bestRealB = realB; bestImagB = imagB; bestHarmonic = harmonic; }
        }
        if (strongest < 1e-14) return frequency;
        const phase = Math.atan2(bestImagA * bestRealB - bestRealA * bestImagB, bestRealA * bestRealB + bestImagA * bestImagB);
        let residual = phase - TAU * frequency * bestHarmonic * spectralHop / rate;
        residual -= TAU * Math.round(residual / TAU);
        const refined = frequency + residual * rate / (TAU * spectralHop * bestHarmonic);
        return Math.abs(refined / frequency - 1) <= .08 ? refined : frequency;
      }
      function analyse() {
        let first = -1;
        const maximumError = .22 - p.tracking * .045;
        for (let i = updateFirst; i <= updateLast; i++) {
          const energy = energies[i];
          scores[i] = seen >= windows[i] + lags[i] + 2 && energy > 1e-14 ? clamp(differences[i] / energy, 0, 2) : Infinity;
        }
        let crossedLobe = false;
        for (let i = 0; i <= lastIndex; i++) {
          // Near-flat parts of a low bass wave can resemble a short period.
          // A true repeat must follow a substantially decorrelated first lobe.
          if (scores[i] > .6 && Number.isFinite(scores[i])) crossedLobe = true;
          if (i >= firstIndex && crossedLobe && Number.isFinite(scores[i - 1]) && Number.isFinite(scores[i + 1]) && scores[i] < scores[i - 1] && scores[i] <= scores[i + 1] && minimumError(i) < .35) { first = i; break; }
        }
        if (first < 0) {
          if (lastGoodClock >= 0 && sampleClock - lastGoodClock > sr * Math.max(.03, 2.5 / Math.max(27, api.frequency))) {
            api.confidence *= .8;
            if (api.confidence < .45) { api.frequency = api.period = 0; api.active = false; }
          }
          return false;
        }
        let selected = first, period = rate / phaseRefinement(rate / refinedLag(first));
        let error = continuousError(period, minimumError(first));
        // Four-tap fractional sampling has a larger irreducible residue for
        // short, harmonic-rich periods near the detector Nyquist limit.
        const initialPeriod = period, cleanError = rate / period > 500 ? .07 : .025;
        // An unresolved very short period should wait for the narrow-band
        // phase comparison, instead of speaking an octave error for a few ms.
        if (!api.active && rate / period > 500 && error > cleanError && seen < spectralLength + spectralHop + 24) return false;
        for (let multiple = 2; multiple <= 4 && error > cleanError; multiple++) {
          const target = initialPeriod * multiple;
          if (target > lags[lastIndex] + 2) break;
          let best = -1, bestError = 2, bestPeriod = 0;
          for (let i = first + 1; i <= lastIndex; i++) if (Number.isFinite(scores[i - 1]) && Number.isFinite(scores[i + 1]) && Math.abs(lags[i] - target) <= Math.max(2.5, target * .10) && scores[i] < scores[i - 1] && scores[i] <= scores[i + 1]) {
            const candidatePeriod = rate / phaseRefinement(rate / refinedLag(i)), e = continuousError(candidatePeriod, minimumError(i));
            if (e < bestError) { best = i; bestError = e; bestPeriod = candidatePeriod; }
          }
          if (best >= 0 && bestError < error * .45 && error - bestError > .01) {
            selected = best; error = bestError; period = bestPeriod;
            if (error <= cleanError) break;
          }
        }
        const lag = period, frequency = rate / period, bounds = ranges[p.range], certainty = clamp(1 - error, 0, 1);
        if (error > maximumError) return false;
        if (frequency < bounds[0] * .98 || frequency > bounds[1] * 1.02 || api.level < threshold) return false;
        // Delay a merely plausible early harmonic until enough data exists to
        // check the lower octave. A very clean period can speak immediately.
        if (!api.active && certainty < .985 && seen < Math.min((windows[selected] + lags[selected]) * 2, windows[lastIndex] + lags[lastIndex])) return false;
        const close = candidateHz > 0 && Math.abs(Math.log2(frequency / candidateHz)) < .035;
        candidateCount = close ? candidateCount + 1 : 1; candidateHz = frequency;
        const changing = api.active && Math.abs(Math.log2(frequency / api.frequency)) > .065;
        if (changing && Math.abs(Math.log2(frequency / api.frequency)) > .65 && certainty < .93) return false;
        const needed = changing || certainty < .985 ? 2 : 1;
        if (candidateCount < needed) return false;
        if (api.active && Math.abs(Math.log2(frequency / api.frequency)) < .025) api.frequency += (frequency - api.frequency) * .65;
        else api.frequency = frequency;
        api.confidence = certainty; api.period = sr / api.frequency; api.active = true;
        api.trackingLatencyMs = (Math.max(windows[selected] + lag, frequency >= 500 && seen >= spectralLength + spectralHop + 24 ? spectralLength + spectralHop + 24 : 0) + analysisInterval * needed) * 1000 / rate;
        lastGoodClock = sampleClock; successful++; return true;
      }
      function push(value) {
        const x = clamp(finite(value, 0), -8, 8), magnitude = Math.abs(x); sampleClock++;
        api.level += (magnitude - api.level) * (magnitude > api.level ? attack : release);
        if (api.level < 1e-12) api.level = 0;
        if (api.level < threshold) {
          quietFrames++;
          if (quietFrames > sr * .012 && api.active) { api.active = false; api.frequency = api.confidence = api.period = 0; candidateCount = 0; }
          if (quietFrames > sr * .06 && !idle) { clearAnalysis(); idle = true; }
        } else { quietFrames = 0; idle = false; }
        if (idle) return false;
        const dc = x - dcInput + dcCoefficient * dcOutput; dcInput = x; dcOutput = dc;
        low1 += lowCoefficient * (dc - low1); low2 += lowCoefficient * (low1 - low2); low3 += lowCoefficient * (low2 - low3); low4 += lowCoefficient * (low3 - low4);
        if (++decimation < stride) return false;
        decimation = 0;
        const current = low4; ring[write] = current;
        // Each lag's finite-window difference and energy are maintained in
        // constant work. No complete autocorrelation is launched on a quantum.
        for (let i = updateFirst; i <= updateLast; i++) {
          const lag = lags[i], oldAt = (write - windows[i]) & ringMask;
          const delayed = ring[(write - lag) & ringMask], old = ring[oldAt], oldDelayed = ring[(oldAt - lag) & ringMask];
          const difference = current - delayed, oldDifference = old - oldDelayed;
          differences[i] += difference * difference - oldDifference * oldDifference;
          energies[i] += current * current + delayed * delayed - old * old - oldDelayed * oldDelayed;
        }
        write = (write + 1) & ringMask; seen++;
        if (++interval < analysisInterval) return false;
        interval = 0; return analyse();
      }
      function getMeters() {
        return { frequencyHz: api.frequency, detectedHz: api.frequency, confidence: api.confidence, active: api.active, levelDb: Math.max(-120, 20 * Math.log10(Math.max(api.level, 1e-6))), trackingLatencyMs: api.trackingLatencyMs, analysisRate: rate, successfulEstimates: successful, minHz: ranges[p.range][0], maxHz: ranges[p.range][1] };
      }
      setParams(params); return api;
    }
    return { create };
  }
  scope.createLoomPedalTrackerDSP = createLoomPedalTrackerDSP;
})(typeof window === 'undefined' ? globalThis : window);
