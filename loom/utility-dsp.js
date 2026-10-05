/* SCALES · transparent stereo utilities and a sliced, monophonic tuner. */
(function (scope) {
  'use strict';
  function createLoomUtilityDSP() {
    'use strict';
    // All dependencies remain inside this factory for AudioWorklet serialization.
    const TAU = Math.PI * 2;
    const specifications = {
      input: [-24, 24, 0], output: [-24, 24, 0], balance: [-1, 1, 0],
      mode: ['stereo', 'mono', 'left', 'right', 'swap', 'mid', 'side'], width: [0, 2, 1], polarity: ['normal', 'left', 'right', 'both'],
      monoBass: ['off', 'on'], bassFreq: [40, 400, 120], dc: ['off', 'on'], highpass: ['off', 'on'], lowcut: [20, 500, 30], lowpass: ['off', 'on'], highcut: [1000, 20000, 18000],
      guard: ['off', 'on'], ceiling: [-24, 0, -1], mute: ['off', 'on'], tuner: ['on', 'off'], tunerChannel: ['auto', 'left', 'right', 'mid'], reference: [430, 450, 440],
      tuning: ['chromatic', 'guitar', 'dropD', 'bass', 'bass5', 'ukulele'], target: ['auto', 'manual'], targetNote: [21, 95, 69], sensitivity: [-90, -24, -60], tolerance: [1, 10, 3], mix: [0, 1, 1]
    };
    const clamp = (x, low, high) => x < low ? low : x > high ? high : x;
    const finite = (x, fallback) => typeof x === 'number' && Number.isFinite(x) ? x : fallback;
    const db = x => Math.pow(10, x / 20);
    const logDb = x => Math.max(-120, 20 * Math.log10(Math.max(1e-6, x)));
    const safe = x => Number.isFinite(x) ? clamp(x, -64, 64) : 0;
    function normalize(params) {
      const source = params && typeof params === 'object' ? params : {}, result = {};
      for (const key of Object.keys(specifications)) {
        const rule = specifications[key];
        result[key] = typeof rule[0] === 'number' ? clamp(finite(source[key], rule[2]), rule[0], rule[1]) : rule.includes(source[key]) ? source[key] : rule[0];
      }
      result.targetNote = Math.round(result.targetNote);
      result.bypass = source.bypass === true;
      return result;
    }
    function biquad(type, hz, sr, out) {
      const w = TAU * clamp(hz, 5, sr * 0.45) / sr, c = Math.cos(w), alpha = Math.sin(w) * Math.SQRT1_2, a0 = 1 + alpha;
      const b = type === 'highpass' ? (1 + c) * 0.5 : (1 - c) * 0.5;
      out[0] = b / a0; out[1] = (type === 'highpass' ? -2 : 2) * b / a0; out[2] = b / a0; out[3] = -2 * c / a0; out[4] = (1 - alpha) / a0;
    }
    function filter(x, c, state, at) {
      const y = safe(c[0] * x + state[at]);
      state[at] = safe(c[1] * x - c[3] * y + state[at + 1]); state[at + 1] = safe(c[2] * x - c[4] * y);
      return y;
    }
    function create(sampleRate, params) {
      const sr = clamp(finite(sampleRate, 48000), 8000, 192000);
      let p = normalize(params), trim = 1, level = 1, ceiling = 1, balanceL = 1, balanceR = 1, bassCoefficient = 0, bassLow = 0, identity = true, threshold = 0;
      const hpCoefficients = new Float64Array(5), lpCoefficients = new Float64Array(5), hpState = new Float64Array(4), lpState = new Float64Array(4);
      let dcPreviousL = 0, dcPreviousR = 0, dcOutputL = 0, dcOutputR = 0;
      const dcCoefficient = Math.exp(-TAU * 8 / sr), powerCoefficient = 1 - Math.exp(-1 / (sr * 0.16)), peakDecay = Math.exp(-1 / (sr * 0.5));
      let inputPeakL = 0, inputPeakR = 0, inputPowerL = 0, inputPowerR = 0, inputMeanL = 0, inputMeanR = 0;
      let outputPeakL = 0, outputPeakR = 0, outputPowerL = 0, outputPowerR = 0, outputCross = 0, outputMeanL = 0, outputMeanR = 0, holdL = 0, holdR = 0, clipL = false, clipR = false;
      // About 12 kHz analysis bandwidth preserves accurate high guitar notes,
      // while decimation and early lag completion keep tuner cost bounded.
      const stride = Math.max(1, Math.ceil(sr / 12000)), analysisRate = sr / stride, span = Math.ceil(analysisRate * 0.048), maxLag = Math.ceil(analysisRate / 24), minLag = Math.max(2, Math.floor(analysisRate / 2050));
      const observationLength = span + maxLag + 12;
      let ringLength = 1; while (ringLength < observationLength * 1.75) ringLength *= 2;
      const ringMask = ringLength - 1, ringL = new Float64Array(ringLength), ringR = new Float64Array(ringLength), scratch = new Float64Array(observationLength), differences = new Float64Array(maxLag + 3), normalized = new Float64Array(maxLag + 3), probeDifferences = new Float64Array(9), fractionalWeights = new Float64Array(12), fractionalErrors = new Float64Array(3);
      const analysisLowpass = 1 - Math.exp(-TAU * Math.min(3000, sr * 0.36) / sr), interval = Math.round(sr * 0.065), staleFrames = Math.round(sr * 0.16);
      let analysisLowL = 0, analysisLowR = 0, analysisLow2L = 0, analysisLow2R = 0, analysisLow3L = 0, analysisLow3R = 0, analysisLow4L = 0, analysisLow4R = 0, decimation = 0, ringWrite = 0, ringSeen = 0, waitFrames = 0, quietFrames = 0;
      let job = 0, lag = 1, at = 0, difference = 0, cumulative = 0, energy = 0, candidateLag = 0, candidateError = 0, refinedLag = 0, refinedError = 0, probeMultiple = 2, probeAt = 0, probeBase = 0, selectedLag = 0, detectedHz = 0, confidence = 0;
      let lastHz = 0, stableCount = 0;
      const recentPitches = new Float64Array(3); let recentCount = 0, recentWrite = 0;
      let fractionalCenter = 0, fractionalLag = 0, fractionalIndex = 0, fractionalProbe = false, fractionalPass = 0, fractionalIteration = 0, fractionalEpsilon = 0, fractionalFirstError = 0;
      function clearPitch() { detectedHz = confidence = lastHz = stableCount = recentCount = recentWrite = 0; recentPitches.fill(0); }
      function resetAnalysis() {
        ringL.fill(0); ringR.fill(0); scratch.fill(0); differences.fill(0); normalized.fill(0); probeDifferences.fill(0);
        analysisLowL = analysisLowR = analysisLow2L = analysisLow2R = analysisLow3L = analysisLow3R = analysisLow4L = analysisLow4R = decimation = ringWrite = ringSeen = waitFrames = quietFrames = job = lag = at = difference = cumulative = energy = 0;
        clearPitch();
      }
      function update() {
        trim = db(p.input); level = db(p.output); ceiling = db(p.ceiling); threshold = db(p.sensitivity);
        balanceL = p.balance > 0 ? 1 - p.balance : 1; balanceR = p.balance < 0 ? 1 + p.balance : 1;
        bassCoefficient = 1 - Math.exp(-TAU * p.bassFreq / sr);
        biquad('highpass', p.lowcut, sr, hpCoefficients); biquad('lowpass', p.highcut, sr, lpCoefficients);
        identity = p.input === 0 && p.output === 0 && p.balance === 0 && p.mode === 'stereo' && p.width === 1 && p.polarity === 'normal' && p.monoBass === 'off' && p.dc === 'off' && p.highpass === 'off' && p.lowpass === 'off';
      }
      function setParams(next) {
        const previous = p; p = normalize(Object.assign({}, p, next));
        if (previous.tuner !== p.tuner || previous.tunerChannel !== p.tunerChannel || previous.bypass !== p.bypass) resetAnalysis();
        if (previous.monoBass !== p.monoBass) bassLow = 0;
        if (previous.highpass !== p.highpass) hpState.fill(0);
        if (previous.lowpass !== p.lowpass) lpState.fill(0);
        if (previous.dc !== p.dc) dcPreviousL = dcPreviousR = dcOutputL = dcOutputR = 0;
        update();
      }
      function resetMeters() { holdL = holdR = 0; clipL = clipR = false; }
      function reset() {
        bassLow = dcPreviousL = dcPreviousR = dcOutputL = dcOutputR = 0; hpState.fill(0); lpState.fill(0);
        inputPeakL = inputPeakR = inputPowerL = inputPowerR = inputMeanL = inputMeanR = outputPeakL = outputPeakR = outputPowerL = outputPowerR = outputCross = outputMeanL = outputMeanR = 0;
        resetMeters(); resetAnalysis();
      }
      function startAnalysis() {
        let sum = 0;
        const channel = p.tunerChannel === 'auto' ? inputPowerL - inputMeanL * inputMeanL >= inputPowerR - inputMeanR * inputMeanR ? 'left' : 'right' : p.tunerChannel;
        for (let i = 0; i < observationLength; i++) {
          const position = (ringWrite - observationLength + i) & ringMask;
          const x = channel === 'mid' ? (ringL[position] + ringR[position]) * 0.5 : channel === 'right' ? ringR[position] : ringL[position];
          scratch[i] = x; sum += x;
        }
        const mean = sum / observationLength; energy = 0;
        for (let i = 0; i < observationLength; i++) { scratch[i] -= mean; if (i >= 6 && i < span + 6) energy += scratch[i] * scratch[i]; }
        waitFrames = 0;
        if (energy / span < threshold * threshold) { clearPitch(); job = 0; return; }
        differences.fill(0); normalized.fill(1); normalized[0] = 1;
        lag = 1; at = difference = cumulative = 0; candidateLag = 0; job = 1;
      }
      function interpolation(array, index, period) {
        const a = array[index - 1], b = array[index], c = array[index + 1], denominator = a - 2 * b + c;
        let shift = Math.abs(denominator) > 1e-20 ? clamp((a - c) / (2 * denominator), -0.5, 0.5) : 0;
        // At short periods a sinusoidal trough is measurably curved: a plain
        // quadratic fit can miss a high guitar note by several cents.
        if (period < 24) for (let i = 0; i < 3; i++) { const w = TAU / (period + shift); shift = clamp(Math.atan((a - c) / denominator * Math.tan(w * 0.5)) / w, -0.5, 0.5); }
        return Number.isFinite(shift) ? shift : 0;
      }
      function finishPitch() {
        const hz = analysisRate / selectedLag;
        if (hz < 24.5 || hz > 2050 || !Number.isFinite(hz) || candidateError > 0.17) { clearPitch(); job = 0; return; }
        const certainty = clamp(1 - candidateError, 0, 1);
        // Independent observations must agree before a new note is trusted.
        // This rejects one-off accidental periodicities in broadband noise.
        if (lastHz > 0 && Math.abs(1200 * Math.log2(hz / lastHz)) < 45) stableCount++;
        else { stableCount = 1; recentCount = recentWrite = 0; }
        lastHz = hz;
        recentPitches[recentWrite] = hz; recentWrite = (recentWrite + 1) % 3; recentCount = Math.min(3, recentCount + 1);
        const steadyHz = recentCount === 3 ? recentPitches[0] + recentPitches[1] + recentPitches[2] - Math.min(recentPitches[0], recentPitches[1], recentPitches[2]) - Math.max(recentPitches[0], recentPitches[1], recentPitches[2]) : hz;
        if (stableCount >= 2 || certainty > 0.985) { detectedHz = steadyHz; confidence = certainty; }
        else { detectedHz = confidence = 0; }
        job = 0;
      }
      function prepareProbe() {
        probeBase = Math.round(refinedLag * probeMultiple); probeAt = 0; probeDifferences.fill(0); at = difference = 0;
        if (probeBase + 4 > maxLag || probeBase - 4 < 2 || probeMultiple > 4 || refinedError < energy * 0.0015) { finishPitch(); return; }
        job = 2;
      }
      function prepareFractionalPass() {
        fractionalLag = fractionalCenter + (fractionalPass - 1) * fractionalEpsilon;
        const base = Math.floor(fractionalLag), position = fractionalLag - base + 5;
        fractionalIndex = base - 5;
        for (let j = 0; j < 12; j++) { let weight = 1; for (let k = 0; k < 12; k++) if (k !== j) weight *= (position - k) / (j - k); fractionalWeights[j] = weight; }
        at = difference = 0; job = 3;
      }
      function startFractional(period, isProbe) {
        fractionalCenter = period; fractionalProbe = isProbe; fractionalIteration = 0;
        fractionalEpsilon = isProbe ? period < 16 ? 0.15 : 0.5 : analysisRate / period > 400 ? period < 16 ? 0.15 : 0.07 : 0;
        fractionalPass = fractionalEpsilon ? 0 : 1; prepareFractionalPass();
      }
      function completeFractionalPass() {
        fractionalErrors[fractionalPass] = difference;
        if (fractionalEpsilon && fractionalPass < 2) { fractionalPass++; prepareFractionalPass(); return; }
        let error = fractionalErrors[1];
        if (fractionalEpsilon) {
          const denominator = fractionalErrors[0] - 2 * error + fractionalErrors[2];
          const shift = denominator > 1e-20 ? clamp((fractionalErrors[0] - fractionalErrors[2]) / (2 * denominator), -1, 1) : 0;
          fractionalCenter += shift * fractionalEpsilon; error = Math.max(0, error - 0.5 * denominator * shift * shift);
          if (fractionalIteration++ === 0) { fractionalEpsilon = 0.015; fractionalPass = 0; prepareFractionalPass(); return; }
        }
        if (!fractionalProbe) {
          refinedLag = selectedLag = fractionalCenter; refinedError = fractionalFirstError = error; probeMultiple = 1.5;
        } else if (fractionalFirstError > energy * 0.0015 && error < fractionalFirstError * 0.22) {
          selectedLag = fractionalCenter; refinedError = error;
        }
        if (fractionalProbe) probeMultiple += 0.5;
        prepareProbe();
      }
      function workAnalysis(budget) {
        while (job && budget > 0) {
          if (job === 3) {
            const count = Math.min(span - at, Math.floor(budget / 12));
            if (!count) break;
            for (let end = at + count; at < end; at++) {
              let delayed = 0; for (let j = 0; j < 12; j++) delayed += fractionalWeights[j] * scratch[at + 6 + fractionalIndex + j];
              const d = scratch[at + 6] - delayed; difference += d * d;
            }
            budget -= count * 12;
            if (at === span) completeFractionalPass();
            continue;
          }
          const currentLag = job === 1 ? lag : probeBase - 4 + probeAt;
          const count = Math.min(span - at, budget);
          for (let end = at + count; at < end; at++) { const d = scratch[at + 6] - scratch[at + 6 + currentLag]; difference += d * d; }
          budget -= count;
          if (at < span) break;
          if (job === 1) {
            differences[lag] = difference; cumulative += difference; normalized[lag] = cumulative > 1e-20 ? difference * lag / cumulative : 1;
            if (lag > minLag && normalized[lag - 1] < 0.15 && normalized[lag - 1] <= normalized[lag - 2] && normalized[lag - 1] < normalized[lag]) {
              candidateLag = lag - 1; candidateError = normalized[candidateLag];
              const shift = interpolation(differences, candidateLag, candidateLag), d0 = differences[candidateLag], denominator = differences[candidateLag - 1] - 2 * d0 + differences[candidateLag + 1];
              refinedLag = selectedLag = candidateLag + shift; refinedError = Math.max(0, d0 - 0.5 * denominator * shift * shift);
              startFractional(refinedLag, false);
            } else if (++lag > maxLag) { clearPitch(); job = 0; }
          } else {
            probeDifferences[probeAt] = difference;
            if (++probeAt === 9) {
              let minimum = 1; for (let i = 2; i < 8; i++) if (probeDifferences[i] < probeDifferences[minimum]) minimum = i;
              const shift = interpolation(probeDifferences, minimum, probeBase - 4 + minimum), d0 = probeDifferences[minimum], denominator = probeDifferences[minimum - 1] - 2 * d0 + probeDifferences[minimum + 1], error = Math.max(0, d0 - 0.5 * denominator * shift * shift);
              // A much cleaner longer period can reveal a bass fundamental
              // hidden below strong second/third harmonics. Small differences
              // from integer lag quantization never alone select an octave.
              if (fractionalFirstError > energy * 0.0015 && error < fractionalFirstError * 0.6) startFractional(probeBase - 4 + minimum + shift, true);
              else { probeMultiple += 0.5; prepareProbe(); }
            }
          }
          at = difference = 0;
        }
      }
      function getMeters() {
        const varianceL = Math.max(0, outputPowerL - outputMeanL * outputMeanL), varianceR = Math.max(0, outputPowerR - outputMeanR * outputMeanR), denominator = Math.sqrt(varianceL * varianceR);
        const aggregatePeak = Math.max(outputPeakL, outputPeakR), aggregateRms = Math.sqrt((outputPowerL + outputPowerR) * 0.5);
        return {
          inputDb: logDb(Math.max(inputPeakL, inputPeakR)), outputDb: logDb(aggregatePeak),
          peakLeftDb: logDb(outputPeakL), peakRightDb: logDb(outputPeakR), rmsLeftDb: logDb(Math.sqrt(outputPowerL)), rmsRightDb: logDb(Math.sqrt(outputPowerR)),
          holdLeftDb: logDb(holdL), holdRightDb: logDb(holdR), clipLeft: clipL, clipRight: clipR,
          correlation: denominator > 1e-12 ? clamp((outputCross - outputMeanL * outputMeanR) / denominator, -1, 1) : 0,
          dcLeft: outputMeanL, dcRight: outputMeanR, crestDb: aggregateRms > 1e-6 ? Math.max(0, logDb(aggregatePeak) - logDb(aggregateRms)) : 0,
          detectedHz, confidence, analysisMs: observationLength * 1000 / analysisRate,
          reference: p.reference, targetNote: p.targetNote, tolerance: p.tolerance,
          inputPeakLeftDb: logDb(inputPeakL), inputPeakRightDb: logDb(inputPeakR), inputRmsLeftDb: logDb(Math.sqrt(inputPowerL)), inputRmsRightDb: logDb(Math.sqrt(inputPowerR))
        };
      }
      function process(left, right) {
        if (!left || !right || left.length !== right.length) throw new Error('SCALES requires equal stereo blocks.');
        const analyze = p.tuner === 'on' && !p.bypass;
        for (let i = 0; i < left.length; i++) {
          const dryL = Number.isFinite(left[i]) ? left[i] : 0, dryR = Number.isFinite(right[i]) ? right[i] : 0;
          inputPeakL = Math.max(Math.abs(dryL), inputPeakL * peakDecay); inputPeakR = Math.max(Math.abs(dryR), inputPeakR * peakDecay);
          inputPowerL += powerCoefficient * (dryL * dryL - inputPowerL); inputPowerR += powerCoefficient * (dryR * dryR - inputPowerR);
          inputMeanL += powerCoefficient * (dryL - inputMeanL); inputMeanR += powerCoefficient * (dryR - inputMeanR);
          if (analyze) {
            analysisLowL += analysisLowpass * (dryL - analysisLowL); analysisLowR += analysisLowpass * (dryR - analysisLowR);
            analysisLow2L += analysisLowpass * (analysisLowL - analysisLow2L); analysisLow2R += analysisLowpass * (analysisLowR - analysisLow2R);
            analysisLow3L += analysisLowpass * (analysisLow2L - analysisLow3L); analysisLow3R += analysisLowpass * (analysisLow2R - analysisLow3R);
            analysisLow4L += analysisLowpass * (analysisLow3L - analysisLow4L); analysisLow4R += analysisLowpass * (analysisLow3R - analysisLow4R);
            if (++decimation >= stride) { decimation = 0; ringL[ringWrite] = analysisLow4L; ringR[ringWrite] = analysisLow4R; ringWrite = (ringWrite + 1) & ringMask; ringSeen = Math.min(ringLength, ringSeen + 1); }
            waitFrames++;
            quietFrames = Math.max(Math.abs(dryL), Math.abs(dryR)) < threshold ? quietFrames + 1 : 0;
            if (quietFrames === staleFrames) { clearPitch(); job = 0; }
          }
          let outL = dryL, outR = dryR;
          if (!p.bypass) {
            if (!identity && p.mix !== 0) {
              let wetL = safe(dryL * trim), wetR = safe(dryR * trim);
              if (p.mode === 'mono' || p.mode === 'mid') wetL = wetR = (wetL + wetR) * 0.5;
              else if (p.mode === 'left') wetR = wetL;
              else if (p.mode === 'right') wetL = wetR;
              else if (p.mode === 'swap') { const swap = wetL; wetL = wetR; wetR = swap; }
              else if (p.mode === 'side') wetL = wetR = (wetL - wetR) * 0.5;
              if (p.polarity === 'left' || p.polarity === 'both') wetL = -wetL;
              if (p.polarity === 'right' || p.polarity === 'both') wetR = -wetR;
              const mid = (wetL + wetR) * 0.5; let side = (wetL - wetR) * 0.5 * p.width;
              if (p.monoBass === 'on') { bassLow += bassCoefficient * (side - bassLow); side -= bassLow; }
              wetL = mid + side; wetR = mid - side;
              if (p.dc === 'on') {
                dcOutputL = safe(wetL - dcPreviousL + dcCoefficient * dcOutputL); dcOutputR = safe(wetR - dcPreviousR + dcCoefficient * dcOutputR);
                dcPreviousL = wetL; dcPreviousR = wetR; wetL = dcOutputL; wetR = dcOutputR;
              }
              if (p.highpass === 'on') { wetL = filter(wetL, hpCoefficients, hpState, 0); wetR = filter(wetR, hpCoefficients, hpState, 2); }
              if (p.lowpass === 'on') { wetL = filter(wetL, lpCoefficients, lpState, 0); wetR = filter(wetR, lpCoefficients, lpState, 2); }
              wetL *= balanceL * level; wetR *= balanceR * level;
              outL = safe(dryL + (wetL - dryL) * p.mix); outR = safe(dryR + (wetR - dryR) * p.mix);
            }
            if (p.guard === 'on') { outL = clamp(outL, -ceiling, ceiling); outR = clamp(outR, -ceiling, ceiling); }
            if (p.mute === 'on') outL = outR = 0;
          }
          left[i] = outL; right[i] = outR;
          const absoluteL = Math.abs(outL), absoluteR = Math.abs(outR);
          outputPeakL = Math.max(absoluteL, outputPeakL * peakDecay); outputPeakR = Math.max(absoluteR, outputPeakR * peakDecay);
          holdL = Math.max(holdL, absoluteL); holdR = Math.max(holdR, absoluteR); clipL = clipL || absoluteL >= 1; clipR = clipR || absoluteR >= 1;
          outputPowerL += powerCoefficient * (outL * outL - outputPowerL); outputPowerR += powerCoefficient * (outR * outR - outputPowerR); outputCross += powerCoefficient * (outL * outR - outputCross);
          outputMeanL += powerCoefficient * (outL - outputMeanL); outputMeanR += powerCoefficient * (outR - outputMeanR);
        }
        if (analyze && quietFrames < staleFrames) {
          if (!job && ringSeen >= observationLength && waitFrames >= interval) startAnalysis();
          // At most 20 arithmetic work units per rendered sample: no full scan
          // can unexpectedly monopolize a 128-frame AudioWorklet callback.
          workAnalysis(left.length * 20);
        }
      }
      update();
      return { setParams, set: setParams, setParam(key, value) { setParams({ [key]: value }); }, process, reset, resetMeters, getTailTime() { return 0; }, getMeters, getParams() { return Object.assign({}, p); }, get params() { return Object.assign({}, p); } };
    }
    return { specifications, normalize, create };
  }
  scope.createLoomUtilityDSP = createLoomUtilityDSP;
})(typeof window === 'undefined' ? globalThis : window);
