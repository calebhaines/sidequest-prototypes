/* GALLEY · the mastering bench. Original low-latency stages and opt-in meters. */
(function (scope) {
  'use strict';
  function createLoomMasteringDSP() {
    'use strict';
    // Keep this factory self-contained: it is serialized into AudioWorklet.
    const PI = Math.PI, TAU = PI * 2;
    const specifications = {
      enabled: [false, true], bypass: [false, true], cleanup: [false, true], eq: [false, true], glue: [false, true], stereo: [false, true], color: [false, true], limiter: [false, true],
      input: [-18, 18, 0], lowCut: [15, 180, 25],
      lowGain: [-9, 9, 0], lowFreq: [30, 400, 100], midGain: [-9, 9, 0], midFreq: [200, 6000, 1200], midQ: [.25, 4, .7], highGain: [-9, 9, 0], highFreq: [2000, 18000, 10000],
      threshold: [-48, 0, -18], ratio: [1, 10, 2], attack: [.1, 100, 30], release: [20, 2000, 250], knee: [0, 18, 6], makeup: [-12, 12, 0], sidechain: [20, 300, 80], link: [0, 1, 1], compMix: [0, 1, 1],
      width: [0, 2, 1], monoBass: [0, 400, 0], drive: [0, 18, 0], colorMix: [0, 1, .25], ceiling: [-12, 0, -1], limiterRelease: [10, 1000, 100], output: [-18, 12, 0]
    };
    const keys = Object.keys(specifications), stages = ['cleanup', 'eq', 'glue', 'stereo', 'color', 'limiter'];
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const finite = (v, fallback) => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    const db = value => Math.pow(10, value / 20);
    const toDb = value => value > 1e-6 ? 20 * Math.log10(value) : -120;
    const safe = value => Number.isFinite(value) ? clamp(value, -65536, 65536) : 0;
    function normalize(value) {
      const source = value && typeof value === 'object' ? value : {}, result = {};
      for (const key of keys) {
        const rule = specifications[key];
        result[key] = typeof rule[0] === 'boolean' ? source[key] === true : clamp(finite(source[key], rule[2]), rule[0], rule[1]);
      }
      return result;
    }
    function coefficients(kind, frequency, gain, q, sr, out) {
      const w = TAU * clamp(frequency, 5, sr * .45) / sr, cosine = Math.cos(w), sine = Math.sin(w), alpha = sine / (2 * q), A = Math.pow(10, gain / 40), beta = 2 * Math.sqrt(A) * alpha;
      let b0, b1, b2, a0, a1, a2;
      if (kind === 'highpass') { b0 = (1 + cosine) / 2; b1 = -(1 + cosine); b2 = b0; a0 = 1 + alpha; a1 = -2 * cosine; a2 = 1 - alpha; }
      else if (kind === 'low') { b0 = A * ((A + 1) - (A - 1) * cosine + beta); b1 = 2 * A * ((A - 1) - (A + 1) * cosine); b2 = A * ((A + 1) - (A - 1) * cosine - beta); a0 = A + 1 + (A - 1) * cosine + beta; a1 = -2 * ((A - 1) + (A + 1) * cosine); a2 = A + 1 + (A - 1) * cosine - beta; }
      else if (kind === 'high') { b0 = A * ((A + 1) + (A - 1) * cosine + beta); b1 = -2 * A * ((A - 1) + (A + 1) * cosine); b2 = A * ((A + 1) + (A - 1) * cosine - beta); a0 = A + 1 - (A - 1) * cosine + beta; a1 = 2 * ((A - 1) - (A + 1) * cosine); a2 = A + 1 - (A - 1) * cosine - beta; }
      else { b0 = 1 + alpha * A; b1 = -2 * cosine; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cosine; a2 = 1 - alpha / A; }
      out[0] = b0 / a0; out[1] = b1 / a0; out[2] = b2 / a0; out[3] = a1 / a0; out[4] = a2 / a0;
    }
    function makeFilter() { return { c: new Float64Array([1, 0, 0, 0, 0]), target: new Float64Array([1, 0, 0, 0, 0]), step: new Float64Array(5), state: new Float64Array(4), remaining: 0, active: false }; }
    function tickFilter(filter) {
      if (!filter.remaining) return;
      if (--filter.remaining === 0) filter.c.set(filter.target);
      else for (let i = 0; i < 5; i++) filter.c[i] += filter.step[i];
    }
    function filterSample(filter, input, channel) {
      const c = filter.c, s = filter.state, at = channel * 2, output = safe(c[0] * input + s[at]);
      s[at] = safe(c[1] * input - c[3] * output + s[at + 1]); s[at + 1] = safe(c[2] * input - c[4] * output);
      return output;
    }
    // Antiderivative anti-aliasing of an odd differential-pair approximation.
    // The color stage has no lookahead; its optional blend may change HF phase.
    const colorIntegralAtThree = .5 + 4 / 3 * Math.log(4);
    function soft(value) { if (value >= 3) return 1; if (value <= -3) return -1; const q = value * value; return value * (27 + q) / (27 + 9 * q); }
    function integral(value) { const x = Math.abs(value); return x >= 3 ? colorIntegralAtThree + x - 3 : x * x / 18 + 4 / 3 * Math.log1p(x * x / 3); }
    function create(sampleRate, params = {}) {
      const sr = clamp(finite(sampleRate, 48000), 8000, 192000), rampFrames = Math.max(1, Math.round(sr * .006)), rampStep = 1 / rampFrames, slew = 1 - Math.exp(-1 / (sr * .006));
      let p = normalize(params), initialized = false, wet = 0, wetTarget = 0, analysisEnabled = false, analyzer = null;
      const amounts = new Float64Array(stages.length), targets = new Float64Array(stages.length), filters = Array.from({ length: 5 }, makeFilter);
      const hp = filters[0], low = filters[1], mid = filters[2], high = filters[3], sidechain = filters[4];
      const detector = new Float64Array(2), compGain = new Float64Array([1, 1]), compTarget = new Float64Array([1, 1]), colorPrevious = new Float64Array(2), colorArea = new Float64Array(2);
      let inputGain = 1, outputGain = 1, makeupGain = 1, driveGain = 1, width = 1, monoAmount = 0, monoLow1 = 0, monoLow2 = 0;
      let inputTarget = 1, outputTarget = 1, makeupTarget = 1, driveTarget = 1, ceiling = db(-1), monoCoefficient = 0, attackCoefficient = 0, releaseCoefficient = 0, limiterCoefficient = 0, limiterGain = 1;
      const detectorCoefficient = 1 - Math.exp(-1 / (sr * .003)), peakDecay = Math.exp(-1 / (sr * .6));
      let controlFrame = 0, inputPeak = 0, outputPeak = 0, previousSignature = '';
      function filterSetting(filter, kind, frequency, gain, q, force = false) {
        const oldActive = filter.active;
        coefficients(kind, frequency, gain, q, sr, filter.target);
        const active = kind === 'highpass' || gain !== 0;
        filter.active = active || oldActive;
        if (force || !oldActive && !active) { filter.c.set(filter.target); filter.step.fill(0); filter.remaining = 0; }
        else { for (let i = 0; i < 5; i++) filter.step[i] = (filter.target[i] - filter.c[i]) / rampFrames; filter.remaining = rampFrames; }
      }
      function update(previous) {
        inputTarget = db(p.input); outputTarget = db(p.output); makeupTarget = db(p.makeup); driveTarget = db(p.drive); ceiling = db(p.ceiling);
        monoCoefficient = 1 - Math.exp(-TAU * Math.max(15, p.monoBass) / sr);
        attackCoefficient = 1 - Math.exp(-1 / (sr * p.attack * .001)); releaseCoefficient = 1 - Math.exp(-1 / (sr * p.release * .001)); limiterCoefficient = 1 - Math.exp(-1 / (sr * p.limiterRelease * .001));
        const fresh = !initialized;
        if (fresh || p.lowCut !== previous.lowCut) filterSetting(hp, 'highpass', p.lowCut, 0, Math.SQRT1_2, fresh);
        if (fresh || p.lowFreq !== previous.lowFreq || p.lowGain !== previous.lowGain) filterSetting(low, 'low', p.lowFreq, p.lowGain, Math.SQRT1_2, fresh);
        if (fresh || p.midFreq !== previous.midFreq || p.midGain !== previous.midGain || p.midQ !== previous.midQ) filterSetting(mid, 'peak', p.midFreq, p.midGain, p.midQ, fresh);
        if (fresh || p.highFreq !== previous.highFreq || p.highGain !== previous.highGain) filterSetting(high, 'high', p.highFreq, p.highGain, Math.SQRT1_2, fresh);
        if (fresh || p.sidechain !== previous.sidechain) filterSetting(sidechain, 'highpass', p.sidechain, 0, Math.SQRT1_2, fresh);
        let hasStage = false;
        for (let i = 0; i < stages.length; i++) { targets[i] = p[stages[i]] ? 1 : 0; hasStage ||= targets[i] !== 0; }
        wetTarget = p.enabled && !p.bypass && (hasStage || p.input !== 0 || p.output !== 0) ? 1 : 0;
        if (fresh) { wet = wetTarget; amounts.set(targets); inputGain = inputTarget; outputGain = outputTarget; makeupGain = makeupTarget; driveGain = driveTarget; width = p.width; monoAmount = p.monoBass > 0 ? 1 : 0; initialized = true; }
        const signature = [p.cleanup, p.eq, p.glue, p.stereo, p.color].join('|');
        if (signature !== previousSignature) {
          if (!previous?.cleanup && p.cleanup) hp.state.fill(0);
          if (!previous?.eq && p.eq) { low.state.fill(0); mid.state.fill(0); high.state.fill(0); }
          if (!previous?.glue && p.glue) { sidechain.state.fill(0); detector.fill(0); compGain.fill(1); compTarget.fill(1); }
          if (!previous?.stereo && p.stereo) monoLow1 = monoLow2 = 0;
          if (!previous?.color && p.color) { colorPrevious.fill(0); colorArea.fill(0); }
          previousSignature = signature;
        }
      }
      function clearAudio() {
        for (const filter of filters) { filter.state.fill(0); filter.c.set(filter.target); filter.remaining = 0; }
        detector.fill(0); compGain.fill(1); compTarget.fill(1); colorPrevious.fill(0); colorArea.fill(0); monoLow1 = monoLow2 = 0; limiterGain = 1; controlFrame = 0;
      }
      function reduction(level) {
        const over = level - p.threshold, slope = 1 - 1 / p.ratio;
        if (p.knee > 0 && over > -p.knee / 2 && over < p.knee / 2) { const x = over + p.knee / 2; return slope * x * x / (2 * p.knee); }
        return over > 0 ? slope * over : 0;
      }
      function colorSample(value, channel) {
        const driven = value * driveGain, area = integral(driven), delta = driven - colorPrevious[channel];
        const shaped = Math.abs(delta) > 1e-5 ? (area - colorArea[channel]) / delta : soft((driven + colorPrevious[channel]) * .5);
        colorPrevious[channel] = driven; colorArea[channel] = area;
        return shaped / driveGain;
      }
      function isActive() { return wetTarget !== 0 || wet > 0; }
      function process(left, right, options) {
        if (!left || !right || left.length !== right.length) throw Error('Mastering requires equal stereo blocks.');
        if (isActive()) for (let frame = 0; frame < left.length; frame++) {
          const dryL = left[frame], dryR = right[frame]; let l = safe(dryL), r = safe(dryR);
          if (wet !== wetTarget) wet = wetTarget > wet ? Math.min(wetTarget, wet + rampStep) : Math.max(wetTarget, wet - rampStep);
          for (let i = 0; i < stages.length; i++) if (amounts[i] !== targets[i]) amounts[i] = targets[i] > amounts[i] ? Math.min(targets[i], amounts[i] + rampStep) : Math.max(targets[i], amounts[i] - rampStep);
          inputGain += (inputTarget - inputGain) * slew; outputGain += (outputTarget - outputGain) * slew; makeupGain += (makeupTarget - makeupGain) * slew; driveGain += (driveTarget - driveGain) * slew;
          inputPeak = Math.max(Math.abs(l), Math.abs(r), inputPeak * peakDecay);
          l *= inputGain; r *= inputGain;
          if (amounts[0]) { tickFilter(hp); const a = filterSample(hp, l, 0), b = filterSample(hp, r, 1); l += (a - l) * amounts[0]; r += (b - r) * amounts[0]; }
          if (amounts[1]) {
            const oldL = l, oldR = r;
            for (let index = 1; index < 4; index++) { const band = filters[index]; if (!band.active) continue; tickFilter(band); l = filterSample(band, l, 0); r = filterSample(band, r, 1); }
            l = oldL + (l - oldL) * amounts[1]; r = oldR + (r - oldR) * amounts[1];
          }
          if (amounts[2]) {
            tickFilter(sidechain); const a = filterSample(sidechain, l, 0), b = filterSample(sidechain, r, 1);
            detector[0] += (a * a - detector[0]) * detectorCoefficient; detector[1] += (b * b - detector[1]) * detectorCoefficient;
            if ((controlFrame & 7) === 0) {
              const linked = Math.max(detector[0], detector[1]);
              for (let channel = 0; channel < 2; channel++) { const energy = detector[channel] + (linked - detector[channel]) * p.link, level = 10 * Math.log10(Math.max(energy, 1e-15)); compTarget[channel] = db(-reduction(level)); }
            }
            for (let channel = 0; channel < 2; channel++) compGain[channel] += (compTarget[channel] - compGain[channel]) * (compTarget[channel] < compGain[channel] ? attackCoefficient : releaseCoefficient);
            const blend = p.compMix * amounts[2]; l += (l * compGain[0] * makeupGain - l) * blend; r += (r * compGain[1] * makeupGain - r) * blend;
          }
          if (amounts[3]) {
            const center = (l + r) * .5, side = (l - r) * .5;
            width += (p.width - width) * slew; monoAmount += ((p.monoBass > 0 ? 1 : 0) - monoAmount) * slew;
            monoLow1 += (side - monoLow1) * monoCoefficient;
            const highSide = side - monoLow1;
            monoLow2 += (highSide - monoLow2) * monoCoefficient;
            const narrowed = highSide - monoLow2, spread = (side + (narrowed - side) * monoAmount) * width;
            l += (center + spread - l) * amounts[3]; r += (center - spread - r) * amounts[3];
          }
          if (amounts[4]) { const blend = p.colorMix * amounts[4], a = colorSample(l, 0), b = colorSample(r, 1); l += (a - l) * blend; r += (b - r) * blend; }
          l *= outputGain; r *= outputGain;
          l = safe(dryL + (l - dryL) * wet); r = safe(dryR + (r - dryR) * wet);
          if (amounts[5]) {
            const maximum = Math.max(Math.abs(l), Math.abs(r)), desired = maximum > ceiling ? ceiling / maximum : 1;
            limiterGain = desired < limiterGain ? desired : limiterGain + (desired - limiterGain) * limiterCoefficient;
            // On enable the safety ceiling takes effect immediately. On disable
            // its gain reduction fades out with the rest of the bypass path.
            const amount = p.enabled && !p.bypass && p.limiter ? 1 : wet * amounts[5], gain = 1 + (limiterGain - 1) * amount;
            l *= gain; r *= gain;
          }
          outputPeak = Math.max(Math.abs(l), Math.abs(r), outputPeak * peakDecay);
          left[frame] = l; right[frame] = r; controlFrame++;
          if (wet === 0 && wetTarget === 0) { clearAudio(); break; }
        }
        if (analysisEnabled && options?.analyze !== false) analyze(left, right);
      }
      // K weighting follows the BS.1770 pre-filter and RLB high-pass family.
      // Integrated gating uses exact block energies in bounded 0.01-LU bins;
      // it is useful programme metering, not a laboratory certification claim.
      function makeAnalyzer() {
        const shelf = makeFilter(), rlb = makeFilter(), K = Math.tan(PI * 1681.974450955533 / sr), Q = .7071752369554196, Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, .4996667741545416), a0 = 1 + K / Q + K * K;
        shelf.c.set([(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]);
        const k = Math.tan(PI * 38.13547087602444 / sr), q = .5003270373238773, denominator = 1 + k / q + k * k;
        rlb.c.set([1, -2, 1, 2 * (k * k - 1) / denominator, (1 - k / q + k * k) / denominator]);
        const taps = 16, phases = new Float64Array(3 * taps);
        for (let phase = 0; phase < 3; phase++) {
          const fraction = (phase + 1) / 4; let sum = 0;
          for (let tap = 0; tap < taps; tap++) { const x = tap - 8 + fraction, sinc = Math.abs(x) < 1e-12 ? 1 : Math.sin(PI * x) / (PI * x), w = .42 - .5 * Math.cos(TAU * (tap + .5) / taps) + .08 * Math.cos(2 * TAU * (tap + .5) / taps); const coefficient = sinc * w; phases[phase * taps + tap] = coefficient; sum += coefficient; }
          for (let tap = 0; tap < taps; tap++) phases[phase * taps + tap] /= sum;
        }
        return { shelf, rlb, phases, ringL: new Float64Array(taps), ringR: new Float64Array(taps), ringAt: 0, bins: new Float64Array(300), binFrames: Math.max(1, Math.round(sr * .01)), binSum: 0, binAt: 0, binSeen: 0, binFrame: 0, momentSum: 0, shortSum: 0, histogram: new Float64Array(10001), energies: new Float64Array(10001), first: 10000, last: 0, absoluteSum: 0, absoluteCount: 0, samplePeak: 0, truePeak: 0, sampleHold: 0, trueHold: 0, rawL: 0, rawR: 0, cross: 0, momentary: null, shortTerm: null, integrated: null, frames: 0 };
      }
      function loudness(energy) { return energy > 0 ? -.691 + 10 * Math.log10(energy) : null; }
      function analyze(left, right) {
        if (!analysisEnabled) return;
        if (!left || !right || left.length !== right.length) throw Error('Mastering analysis requires equal stereo blocks.');
        const a = analyzer || (analyzer = makeAnalyzer()), decay = peakDecay, smooth = 1 - Math.exp(-1 / (sr * .3));
        for (let frame = 0; frame < left.length; frame++) {
          const l = safe(left[frame]), r = safe(right[frame]), zL = filterSample(a.rlb, filterSample(a.shelf, l, 0), 0), zR = filterSample(a.rlb, filterSample(a.shelf, r, 1), 1);
          a.binSum += zL * zL + zR * zR; a.frames++;
          a.rawL += (l * l - a.rawL) * smooth; a.rawR += (r * r - a.rawR) * smooth; a.cross += (l * r - a.cross) * smooth;
          const peak = Math.max(Math.abs(l), Math.abs(r)); a.samplePeak = Math.max(peak, a.samplePeak * decay); a.sampleHold = Math.max(a.sampleHold, peak);
          a.ringL[a.ringAt] = l; a.ringR[a.ringAt] = r;
          let interpolated = peak;
          for (let phase = 0; phase < 3; phase++) { let x = 0, y = 0; const base = phase * 16; for (let tap = 0; tap < 16; tap++) { const at = (a.ringAt - tap + 16) & 15, coefficient = a.phases[base + tap]; x += a.ringL[at] * coefficient; y += a.ringR[at] * coefficient; } interpolated = Math.max(interpolated, Math.abs(x), Math.abs(y)); }
          a.ringAt = (a.ringAt + 1) & 15; a.truePeak = Math.max(interpolated, a.truePeak * decay); a.trueHold = Math.max(a.trueHold, interpolated);
          if (++a.binFrame < a.binFrames) continue;
          const value = a.binSum, old = a.bins[a.binAt], oldMoment = a.binSeen >= 40 ? a.bins[(a.binAt + 260) % 300] : 0;
          a.bins[a.binAt] = value; a.binAt = (a.binAt + 1) % 300; a.binSeen++; a.binSum = a.binFrame = 0;
          a.momentSum += value - oldMoment; a.shortSum += value - old;
          if (a.binSeen >= 40) a.momentary = loudness(Math.max(0, a.momentSum) / (40 * a.binFrames));
          if (a.binSeen >= 300) a.shortTerm = loudness(Math.max(0, a.shortSum) / (300 * a.binFrames));
          if (a.binSeen >= 40 && a.binSeen % 10 === 0) {
            const energy = Math.max(0, a.momentSum) / (40 * a.binFrames), lu = loudness(energy);
            if (lu !== null && lu >= -70) { const index = clamp(Math.floor((lu + 70) * 100), 0, 10000); a.histogram[index]++; a.energies[index] += energy; a.absoluteSum += energy; a.absoluteCount++; a.first = Math.min(a.first, index); a.last = Math.max(a.last, index); }
            if (a.absoluteCount) {
              const gate = Math.max(-70, loudness(a.absoluteSum / a.absoluteCount) - 10), first = Math.max(a.first, Math.ceil((gate + 70) * 100)); let sum = 0, count = 0;
              for (let i = first; i <= a.last; i++) { sum += a.energies[i]; count += a.histogram[i]; }
              a.integrated = count ? loudness(sum / count) : null;
            }
          }
        }
      }
      function resetAnalysis() { analyzer = null; }
      function getMeters() {
        const a = analyzer, frames = a?.frames || 0, correlation = a && a.rawL > 1e-12 && a.rawR > 1e-12 ? clamp(a.cross / Math.sqrt(a.rawL * a.rawR), -1, 1) : null;
        return { enabled: p.enabled, bypass: p.bypass, active: isActive(), analysisEnabled, analysisActive: analysisEnabled, analyzedFrames: frames, analysisSeconds: frames / sr, lufsMomentary: a?.momentary ?? null, lufsShortTerm: a?.shortTerm ?? null, lufsIntegrated: a?.integrated ?? null, rmsDb: frames ? toDb(Math.sqrt((a.rawL + a.rawR) * .5)) : null, samplePeakDb: frames ? toDb(a.samplePeak) : null, truePeakDb: frames ? toDb(a.truePeak) : null, samplePeakHoldDb: frames ? toDb(a.sampleHold) : null, truePeakHoldDb: frames ? toDb(a.trueHold) : null, correlation, compressorReductionDb: p.enabled && !p.bypass && amounts[2] ? -toDb(Math.min(compGain[0], compGain[1])) : 0, limiterReductionDb: p.enabled && !p.bypass && amounts[5] ? -toDb(limiterGain) : 0, inputPeakDb: toDb(inputPeak), outputPeakDb: toDb(outputPeak), latencySamples: 0, peakMethod: '4x 16-tap windowed-sinc interpolation estimate', loudnessMethod: 'K-weighted 400 ms / 3 s; -70 LUFS absolute and -10 LU relative gated integrated' };
      }
      update(null);
      return {
        setParams(values) { const previous = p; p = normalize(Object.assign({}, p, values && typeof values === 'object' ? values : {})); update(previous); },
        process, analyze, isActive,
        setAnalysis(enabled) { analysisEnabled = enabled === true; }, resetAnalysis, resetMeters: resetAnalysis,
        reset() { clearAudio(); wet = wetTarget; amounts.set(targets); inputGain = inputTarget; outputGain = outputTarget; makeupGain = makeupTarget; driveGain = driveTarget; width = p.width; monoAmount = p.monoBass > 0 ? 1 : 0; inputPeak = outputPeak = 0; resetAnalysis(); },
        getMeters, getTailTime() { return 0; }
      };
    }
    return { specifications, normalize, create };
  }
  scope.createLoomMasteringDSP = createLoomMasteringDSP;
})(typeof window === 'undefined' ? globalThis : window);
