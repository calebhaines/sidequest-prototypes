/* STRAINER · deterministic, stereo-linked envelope filtering. No lookahead. */
(function (scope) {
  'use strict';
  function createLoomFilterDSP() {
    'use strict';
    // This factory is serialized into the AudioWorklet. Keep dependencies local.
    const PI = Math.PI, TAU = PI * 2;
    const spec = {
      model: ['clean', 'ladder', 'diode', 'comb'], mode: ['lowpass', 'highpass', 'bandpass', 'notch'], slope: ['12', '24'],
      cutoff: [20, 20000, 1200], resonance: [0, 1, .25], drive: [0, 30, 0], output: [-24, 12, 0],
      envAmount: [-72, 72, 0], sensitivity: [-60, 0, -18], envAttack: [.1, 250, 8], envRelease: [5, 2000, 180], envMode: ['peak', 'rms'], detectorHP: [20, 2000, 35],
      clock: ['free', 'sync'], division: ['1', '1/32', '1/16', '1/8', '1/8.', '1/4', '1/2', '2', '4'], rate: [.01, 20, .35], shape: ['sine', 'triangle', 'saw', 'samplehold'],
      lfoAmount: [0, 72, 0], stereo: [0, 1, 0], phase: [0, 360, 0], mix: [0, 1, 1]
    };
    const divisions = { '1/32': .125, '1/16': .25, '1/8': .5, '1/8.': .75, '1/4': 1, '1/2': 2, '1': 4, '2': 8, '4': 16 };
    const finite = (x, fallback) => typeof x === 'number' && Number.isFinite(x) ? x : fallback;
    const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
    const safe = x => Number.isFinite(x) ? clamp(x, -8, 8) : 0;
    const db = x => Math.pow(10, x / 20);
    const logDb = x => Math.max(-120, 20 * Math.log10(Math.max(1e-6, x)));
    const specifications = { strainer: spec };
    function normalize(type, params) {
      if (type !== 'strainer') throw Error('Unknown STRAINER effect: ' + type);
      const source = params && typeof params === 'object' ? params : {}, result = {};
      for (const key of Object.keys(spec)) {
        const rule = spec[key]; result[key] = typeof rule[0] === 'number' ? clamp(finite(source[key], rule[2]), rule[0], rule[1]) : rule.includes(source[key]) ? source[key] : rule[0];
      }
      result.bypass = source.bypass === true; return result;
    }
    function wave(phase, shape) {
      const cycle = Math.floor(phase), fraction = phase - cycle;
      if (shape === 'triangle') return 1 - 4 * Math.abs(fraction - .5);
      if (shape === 'saw') return 2 * fraction - 1;
      if (shape === 'samplehold') {
        let seed = (cycle | 0) ^ 0x5a17c0de; seed = Math.imul(seed ^ seed >>> 16, 0x45d9f3b); seed = Math.imul(seed ^ seed >>> 16, 0x45d9f3b);
        return ((seed ^ seed >>> 16) >>> 0) / 2147483648 - 1;
      }
      return Math.sin(TAU * fraction);
    }
    function create(type, sampleRate, params) {
      let p = normalize(type, params);
      const sr = clamp(finite(sampleRate, 48000), 8000, 192000), maxHz = Math.min(20000, sr * .43);
      // State-variable integrators: 2 stages × 2 states × 2 independent channels.
      const sv = new Float64Array(8), ladder = new Float64Array(8), previousInput = new Float64Array(2);
      const combLength = Math.ceil(sr / 20) + 4, combL = new Float64Array(combLength), combR = new Float64Array(combLength);
      let combAt = 0, combToneL = 0, combToneR = 0;
      let env = 0, detectorL = 0, detectorR = 0, detectorPreviousL = 0, detectorPreviousR = 0, lfoPhase = 0, controlFrame = 0, expectedBeat = NaN;
      let cutoffLog = Math.log(p.cutoff), res = p.resonance, gain = db(p.drive), level = db(p.output), mix = p.mix, sweep = p.envAmount, lfoDepth = p.lfoAmount, stereo = p.stereo;
      let attack = 0, release = 0, detectorCoefficient = 0, sensitivity = 1;
      let targetLog = Math.log(p.cutoff), targetGain = db(p.drive), targetLevel = db(p.output), controlLogL = NaN, controlLogR = NaN;
      const slew = 1 - Math.exp(-1 / (sr * .008)), frequencySlew = 1 - Math.exp(-1 / (sr * .012)), peakDecay = Math.exp(-1 / (sr * .15));
      let gL = Math.tan(PI * p.cutoff / sr), gR = gL, targetGL = gL, targetGR = gR, hzL = p.cutoff, hzR = p.cutoff;
      let inputPeak = 0, outputPeak = 0, envelopeResponse = 0, modulation = 0, dcInputL = 0, dcInputR = 0, dcOutputL = 0, dcOutputR = 0;
      const dcCoefficient = Math.exp(-TAU * 8 / sr);
      function update() {
        targetLog = Math.log(p.cutoff); targetGain = db(p.drive); targetLevel = db(p.output);
        // RMS follows power internally; twice the coefficient rate gives its
        // amplitude release the same millisecond meaning as the peak follower.
        const scale = p.envMode === 'rms' ? 2 : 1;
        attack = Math.exp(-scale / (sr * p.envAttack * .001)); release = Math.exp(-scale / (sr * p.envRelease * .001));
        detectorCoefficient = Math.exp(-TAU * Math.min(p.detectorHP, sr * .4) / sr); sensitivity = db(-p.sensitivity);
      }
      function reset() {
        sv.fill(0); ladder.fill(0); previousInput.fill(0); combL.fill(0); combR.fill(0);
        combAt = combToneL = combToneR = env = detectorL = detectorR = detectorPreviousL = detectorPreviousR = lfoPhase = controlFrame = inputPeak = outputPeak = envelopeResponse = modulation = 0;
        dcInputL = dcInputR = dcOutputL = dcOutputR = 0;
        expectedBeat = NaN; controlLogL = controlLogR = NaN;
        cutoffLog = Math.log(p.cutoff); res = p.resonance; gain = db(p.drive); level = db(p.output); mix = p.mix; sweep = p.envAmount; lfoDepth = p.lfoAmount; stereo = p.stereo;
        hzL = hzR = Math.min(p.cutoff, maxHz); gL = gR = targetGL = targetGR = Math.tan(PI * hzL / sr);
      }
      function setParams(next) {
        const previous = p; p = normalize(type, Object.assign({}, p, next));
        if (previous.envMode !== p.envMode) env = 0;
        if (previous.clock !== p.clock || previous.division !== p.division) expectedBeat = NaN;
        // Distinct circuit memories cannot usefully be interpreted as each other.
        if (previous.model !== p.model) { sv.fill(0); ladder.fill(0); combL.fill(0); combR.fill(0); combToneL = combToneR = dcInputL = dcInputR = dcOutputL = dcOutputR = 0; }
        update();
      }
      function stateVariable(x, g, q, channel, stage, nonlinear) {
        const at = channel * 4 + stage * 2, k = 1 / q;
        if (nonlinear) {
          // Unequal diode knees limit the resonant feedback, rather than merely
          // saturating the output. The bounded feedback remains stable at high Q.
          const feedback = sv[at] * .16 * res;
          x -= feedback >= 0 ? .6 * Math.tanh(feedback / .6) : .38 * Math.tanh(feedback / .38);
        }
        const a = 1 / (1 + g * (g + k)), v1 = a * (sv[at] + g * (x - sv[at + 1])), v2 = sv[at + 1] + g * v1;
        sv[at] = safe(2 * v1 - sv[at]); sv[at + 1] = safe(2 * v2 - sv[at + 1]);
        const high = x - k * v1 - v2;
        if (p.mode === 'highpass') return safe(high);
        if (p.mode === 'bandpass') return safe(k * v1);
        if (p.mode === 'notch') return safe(high + v2);
        return safe(v2);
      }
      function ladderSample(x, g, channel) {
        // Two half steps reduce feedback instability near Nyquist. The stages
        // are nonlinear leaky integrators with resonance around all four poles.
        const at = channel * 4, alpha = 1 - Math.exp(-Math.atan(g)), feedback = res * 3.78;
        let a = 0, b = 0, c = 0, d = 0;
        for (let step = 0; step < 2; step++) {
          const input = step === 0 ? (previousInput[channel] + x) * .5 : x;
          let value = Math.tanh(input - feedback * ladder[at + 3]);
          for (let stage = 0; stage < 4; stage++) {
            const index = at + stage; ladder[index] = safe(ladder[index] + alpha * (value - Math.tanh(ladder[index]))); value = Math.tanh(ladder[index]);
          }
          a = ladder[at]; b = ladder[at + 1]; c = ladder[at + 2]; d = ladder[at + 3];
        }
        previousInput[channel] = x;
        let low, high, band;
        if (p.slope === '24') { low = d; high = x - 4 * a + 6 * b - 4 * c + d; band = 2 * (b - d); }
        else { low = b; high = x - 2 * a + b; band = 2 * (a - b); }
        const compensation = 1 + res * 1.2;
        return safe((p.mode === 'highpass' ? high : p.mode === 'bandpass' ? band : p.mode === 'notch' ? low + high : low) * compensation);
      }
      function combRead(buffer, hz) {
        let position = combAt - clamp(sr / hz, 2, combLength - 2); if (position < 0) position += combLength;
        const index = Math.floor(position), next = index + 1 === combLength ? 0 : index + 1;
        return buffer[index] + (buffer[next] - buffer[index]) * (position - index);
      }
      function process(left, right, context) {
        if (!left || !right || left.length !== right.length) throw Error('STRAINER requires equal stereo blocks.');
        const tempo = clamp(finite(context && context.tempo, 120), 40, 300), period = divisions[p.division], increment = (p.clock === 'sync' ? tempo / (60 * period) : p.rate) / sr;
        if (p.clock === 'sync' && context && context.playing && Number.isFinite(context.beat)) {
          // Re-anchor on seeks, not on every block. Repeated floating-point
          // reconstruction could otherwise change a held step at a boundary.
          if (!Number.isFinite(expectedBeat) || Math.abs(context.beat - expectedBeat) > 1e-6) lfoPhase = context.beat / period;
          expectedBeat = context.beat + left.length / sr * tempo / 60;
        } else expectedBeat = NaN;
        if (p.bypass) {
          for (let i = 0; i < left.length; i++) {
            left[i] = safe(left[i]); right[i] = safe(right[i]);
            const peak = Math.max(Math.abs(left[i]), Math.abs(right[i])); inputPeak = Math.max(peak, inputPeak * peakDecay); outputPeak = Math.max(peak, outputPeak * peakDecay);
          }
          lfoPhase += left.length * increment; return;
        }
        for (let i = 0; i < left.length; i++) {
          const dryL = safe(left[i]), dryR = safe(right[i]);
          inputPeak = Math.max(Math.abs(dryL), Math.abs(dryR), inputPeak * peakDecay);
          detectorL = dryL - detectorPreviousL + detectorCoefficient * detectorL; detectorR = dryR - detectorPreviousR + detectorCoefficient * detectorR;
          detectorPreviousL = dryL; detectorPreviousR = dryR;
          let detection = Math.max(Math.abs(detectorL), Math.abs(detectorR)); if (p.envMode === 'rms') detection *= detection;
          const coefficient = detection > env ? attack : release; env = coefficient * env + (1 - coefficient) * detection;
          envelopeResponse = clamp((p.envMode === 'rms' ? Math.sqrt(Math.max(0, env)) : env) * sensitivity, 0, 1);
          cutoffLog += frequencySlew * (targetLog - cutoffLog); res += slew * (p.resonance - res); gain += slew * (targetGain - gain); level += slew * (targetLevel - level); mix += slew * (p.mix - mix);
          sweep += slew * (p.envAmount - sweep); lfoDepth += slew * (p.lfoAmount - lfoDepth); stereo += slew * (p.stereo - stereo);
          if (controlFrame === 0) {
            const base = cutoffLog + sweep * envelopeResponse * Math.LN2 / 12, offset = p.phase / 360;
            const movementL = lfoDepth * wave(lfoPhase + offset, p.shape), movementR = lfoDepth * wave(lfoPhase + offset + stereo * .5, p.shape);
            const nextLogL = base + movementL * Math.LN2 / 12, nextLogR = base + movementR * Math.LN2 / 12;
            if (nextLogL !== controlLogL) { controlLogL = nextLogL; hzL = clamp(Math.exp(nextLogL), 20, maxHz); targetGL = Math.tan(PI * hzL / sr); }
            if (nextLogR !== controlLogR) { controlLogR = nextLogR; hzR = clamp(Math.exp(nextLogR), 20, maxHz); targetGR = Math.tan(PI * hzR / sr); }
            modulation = sweep * envelopeResponse + movementL;
          }
          // Continuous coefficient interpolation avoids steps from control-rate
          // updates. Its phase is kept across blocks, including offline chunks.
          gL += .25 * (targetGL - gL); gR += .25 * (targetGR - gR);
          controlFrame = (controlFrame + 1) & 7; lfoPhase += increment;
          let wetL = dryL * gain, wetR = dryR * gain;
          if (gain > 1.0000001 || p.model === 'diode') {
            const compensation = 1 / Math.sqrt(Math.max(1, gain));
            if (p.model === 'diode') {
              wetL = (wetL >= 0 ? Math.tanh(wetL) : .62 * Math.tanh(wetL / .62)) * compensation;
              wetR = (wetR >= 0 ? Math.tanh(wetR) : .62 * Math.tanh(wetR / .62)) * compensation;
            } else {
              // Fade the nonlinear path in near unity gain, using the smoothed
              // gain rather than switching as the target drive crosses zero.
              const blend = Math.min(1, (gain - 1) * 8);
              wetL += blend * (Math.tanh(wetL) * compensation - wetL); wetR += blend * (Math.tanh(wetR) * compensation - wetR);
            }
          }
          if (p.model === 'ladder') { wetL = ladderSample(wetL, gL, 0); wetR = ladderSample(wetR, gR, 1); }
          else {
            if (p.model === 'comb') {
              const feedback = res * .94;
              combToneL += .65 * (combRead(combL, hzL) - combToneL); combToneR += .65 * (combRead(combR, hzR) - combToneR);
              wetL = safe(wetL + feedback * combToneL); wetR = safe(wetR + feedback * combToneR);
              combL[combAt] = Math.tanh(wetL); combR[combAt] = Math.tanh(wetR); combAt++; if (combAt === combLength) combAt = 0;
            }
            const q = .5 + res * res * (p.model === 'diode' ? 16 : p.model === 'comb' ? 3 : 24);
            wetL = stateVariable(wetL, gL, q, 0, 0, p.model === 'diode'); wetR = stateVariable(wetR, gR, q, 1, 0, p.model === 'diode');
            if (p.slope === '24') { wetL = stateVariable(wetL, gL, Math.SQRT1_2, 0, 1, p.model === 'diode'); wetR = stateVariable(wetR, gR, Math.SQRT1_2, 1, 1, p.model === 'diode'); }
          }
          if (p.model === 'diode') {
            dcOutputL = safe(wetL - dcInputL + dcCoefficient * dcOutputL); dcOutputR = safe(wetR - dcInputR + dcCoefficient * dcOutputR);
            dcInputL = wetL; dcInputR = wetR; wetL = dcOutputL; wetR = dcOutputR;
          }
          // The wet path is bounded; exact bypass and mix=0 keep the direct
          // samples unchanged. Filter topology adds phase response, not lookahead.
          const outL = p.bypass ? dryL : safe(dryL + (safe(wetL * level) - dryL) * mix), outR = p.bypass ? dryR : safe(dryR + (safe(wetR * level) - dryR) * mix);
          left[i] = outL; right[i] = outR; outputPeak = Math.max(Math.abs(outL), Math.abs(outR), outputPeak * peakDecay);
        }
      }
      function getMeters() {
        return { cutoffLHz: Math.atan(gL) * sr / PI, cutoffRHz: Math.atan(gR) * sr / PI, envelopeDb: logDb(p.envMode === 'rms' ? Math.sqrt(Math.max(0, env)) : env), envelope: envelopeResponse, inputDb: logDb(inputPeak), outputDb: logDb(outputPeak), modulation, resonance: res };
      }
      update(); reset();
      return { setParams, process, reset, getMeters, getParams() { return Object.assign({}, p); },
        getTailTime() { return p.bypass || p.mix === 0 ? 0 : p.model === 'comb' ? Math.min(6, .05 + Math.log(.001) / Math.log(Math.max(.001, p.resonance * .94)) / Math.max(20, Math.min(hzL, hzR))) : Math.min(3, .05 + 7 * (.5 + p.resonance * p.resonance * 24) / (PI * Math.max(20, Math.min(hzL, hzR)))); }
      };
    }
    return { specifications, normalize, create };
  }
  scope.createLoomFilterDSP = createLoomFilterDSP;
})(typeof window === 'undefined' ? globalThis : window);
