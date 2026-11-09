/* HOOD · fifteen deterministic spaces and deliberately unnatural envelopes. */
(function (scope) {
  'use strict';
  function createLoomHoodDSP() {
    'use strict';
    // Serialized into the audio Worklet; all dependencies stay in this factory.
    const TAU = 2 * Math.PI;
    const specifications = {
      model: ['original', 'room', 'chamber', 'hall', 'cathedral', 'plate', 'spring', 'tile', 'ambience', 'digital', 'modulated', 'shimmer', 'gated', 'reverse', 'bloom', 'nonlinear'],
      size: [0, 1, .55], decay: [.2, 12, 2.8], damping: [800, 18000, 6500], predelay: [0, 180, 22], diffusion: [0, 1, .75], width: [0, 1, .9], mix: [0, 1, .25]
    };
    const finite = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    const safe = value => typeof value === 'number' && value >= -8 && value <= 8 ? value : Number.isFinite(value) ? clamp(value, -8, 8) : 0;
    const lp = (frequency, rate) => 1 - Math.exp(-TAU * Math.min(frequency, rate * .43) / rate);
    const profiles = {
      room:       { count: 8, scale: .56, matrix: 'house', early: .72, late: .8,  spread: .7,  highpass: 75,  motion: 0 },
      chamber:    { count: 8, scale: .87, matrix: 'hadamard', early: .43, late: 1, spread: 1.2, highpass: 90, motion: .000025 },
      hall:       { count: 8, scale: 1.32, matrix: 'house', early: .26, late: 1.12, spread: 1.8, highpass: 65, motion: .00006 },
      cathedral:  { count: 16, scale: 1.8, matrix: 'hadamard', early: .38, late: 1.12, spread: 2.9, highpass: 100, motion: .000035 },
      plate:      { count: 4, scale: .94, matrix: 'cross', early: 0, late: 1.16, spread: .5, highpass: 180, motion: .00009 },
      spring:     { count: 2, scale: .72, matrix: 'cross', early: .12, late: .95, spread: .8, highpass: 170, motion: 0 },
      tile:       { count: 8, scale: .43, matrix: 'house', early: .95, late: .69, spread: .42, highpass: 140, motion: 0 },
      ambience:   { count: 8, scale: .27, matrix: 'house', early: .9, late: .42, spread: .38, highpass: 100, motion: 0 },
      digital:    { count: 8, scale: 1.05, matrix: 'comb', early: .16, late: .95, spread: 1, highpass: 65, motion: 0 },
      modulated:  { count: 8, scale: 1.13, matrix: 'hadamard', early: .2, late: 1.1, spread: 1.3, highpass: 80, motion: .00085 },
      shimmer:    { count: 8, scale: 1.23, matrix: 'hadamard', early: .12, late: 1.12, spread: 1.5, highpass: 130, motion: .00021 },
      gated:      { count: 0, scale: 1, matrix: 'fir', highpass: 90 },
      reverse:    { count: 0, scale: 1, matrix: 'fir', highpass: 110 },
      bloom:      { count: 8, scale: 1.4, matrix: 'hadamard', early: 0, late: 1.35, spread: 2.2, highpass: 100, motion: .00014 },
      nonlinear:  { count: 0, scale: 1, matrix: 'fir', highpass: 150 }
    };
    function normalize(params) {
      const source = params && typeof params === 'object' ? params : {}, result = {};
      for (const key of Object.keys(specifications)) {
        const rule = specifications[key];
        result[key] = typeof rule[0] === 'number' ? clamp(finite(source[key], rule[2]), rule[0], rule[1]) : rule.includes(source[key]) ? source[key] : rule[0];
      }
      result.bypass = source.bypass === true; return result;
    }
    function read(buffer, write, delay) {
      let at = write - delay;
      if (at < 0) at += buffer.length;
      const index = Math.floor(at), fraction = at - index, next = index + 1 === buffer.length ? 0 : index + 1;
      return buffer[index] + (buffer[next] - buffer[index]) * fraction;
    }
    function allpass(length, gain) { return { buffer: new Float32Array(Math.max(2, length)), at: 0, gain }; }
    function apSample(x, state, gain) {
      const delayed = state.buffer[state.at], y = delayed - gain * x;
      state.buffer[state.at] = safe(x + gain * y);
      if (++state.at === state.buffer.length) state.at = 0;
      return y;
    }
    function clearAP(state) { state.buffer.fill(0); state.at = 0; }
    function envelopeSeconds(model, params) {
      // The existing Decay knob displays seconds. Finite envelopes use that
      // same duration; Size changes reflection distribution, not the time unit.
      return params.decay;
    }
    function kernel(sampleRate, initial) {
      let p = initial;
      const sr = sampleRate, model = p.model, profile = profiles[model];
      if (!profile) throw new Error('The original HOOD is provided by the legacy reverb processor.');
      const count = profile.count, isFIR = profile.matrix === 'fir', spring = model === 'spring', plate = model === 'plate', bloom = model === 'bloom', shimmer = model === 'shimmer';
      const preL = new Float32Array(Math.ceil(sr * .181) + 4), preR = new Float32Array(preL.length);
      const earlyL = new Float32Array(Math.ceil(sr * .8) + 8), earlyR = new Float32Array(earlyL.length);
      const diffuserTimes = spring ? [.00073, .00137, .00211, .00317] : plate ? [.00477, .00359, .01273, .00931] : [.00173, .00413, .00731, .01271];
      const apL = diffuserTimes.map((time, i) => allpass(Math.round(sr * time), .65)), apR = diffuserTimes.map((time, i) => allpass(Math.round(sr * time * (1.07 + i * .013)), .65));
      const base = spring ? [.0297, .0411] : plate ? [.0327, .0419, .0531, .0617] : [.0297, .0371, .0411, .0437, .0531, .0617, .0719, .0797, .0893, .0971, .1091, .1171, .1277, .1373, .1499, .1637];
      const lines = [], lineAt = new Int32Array(count), delays = new Float64Array(count), targetDelays = new Float64Array(count), gains = new Float64Array(count), targetGains = new Float64Array(count), damp = new Float64Array(count), matrix = new Float64Array(count);
      const offsetSin = new Float64Array(count), offsetCos = new Float64Array(count), tankDiffusers = [], dispersion = [];
      for (let j = 0; j < count; j++) {
        lines.push(new Float32Array(Math.ceil(sr * base[j] * profile.scale * 1.9 + sr * .002) + 8));
        offsetSin[j] = Math.sin(j * 2.399963229728653); offsetCos[j] = Math.cos(j * 2.399963229728653);
        if (plate || bloom) tankDiffusers.push(allpass(Math.round(sr * (.0043 + j * .00131)), .57));
        if (spring) dispersion.push([.00029, .00043, .00071, .00103, .00137, .00179, .00217, .00271].map((time, k) => allpass(Math.round(sr * time * (j ? 1.13 : 1)), .62 + k * .032)));
      }
      const earlyTimes = model === 'tile' ? [.003, .006, .010, .014, .021, .028, .036, .049, .062, .081, .103, .127] : model === 'chamber' ? [.011, .019, .031, .043, .061, .079, .103, .127, .163, .191, .227, .269] : [.007, .013, .023, .037, .047, .061, .079, .101, .127, .157, .193, .239];
      const firL = isFIR ? new Float32Array(Math.ceil(sr * 12.05) + 8) : null, firR = isFIR ? new Float32Array(firL.length) : null;
      const tapPosition = new Float64Array(isFIR ? 64 : 0), tapSkew = new Float64Array(tapPosition.length), tapL = new Float64Array(tapPosition.length), tapR = new Float64Array(tapPosition.length);
      if (isFIR) {
        let normL = 0, normR = 0;
        for (let j = 0; j < tapPosition.length; j++) {
          const u = (j + .35 + .18 * Math.sin(j * 1.79)) / tapPosition.length;
          tapPosition[j] = u; tapSkew[j] = Math.sin(Math.PI * u);
          let envelope;
          if (model === 'reverse') envelope = .005 + Math.pow(u, 2.7);
          else if (model === 'nonlinear') envelope = .14 + .8 * Math.exp(-Math.pow((u - .19) / .075, 2)) + .6 * Math.exp(-Math.pow((u - .52) / .10, 2)) + Math.exp(-Math.pow((u - .86) / .065, 2));
          else envelope = .55 + .45 * Math.sin(Math.PI * clamp(u * 1.7, 0, 1));
          tapL[j] = envelope * (Math.sin(j * 12.9898 + .8) >= 0 ? 1 : -1);
          tapR[j] = envelope * (Math.sin(j * 8.1413 + 2.1) >= 0 ? 1 : -1);
          normL += tapL[j] * tapL[j]; normR += tapR[j] * tapR[j];
        }
        for (let j = 0; j < tapPosition.length; j++) { tapL[j] *= .75 / Math.sqrt(normL); tapR[j] *= .75 / Math.sqrt(normR); }
      }
      const pitchLength = Math.ceil(sr * .075) + 8, pitchL = shimmer ? new Float32Array(pitchLength) : null, pitchR = shimmer ? new Float32Array(pitchLength) : null;
      const pitchWindow = sr * .06, pitchBase = sr * .003, pitchStep = 1 / pitchWindow;
      const slew = 1 - Math.exp(-1 / (sr * .025)), slowSlew = 1 - Math.exp(-1 / (sr * .05)), peakDecay = Math.exp(-1 / (sr * .15));
      const rotation = TAU * (model === 'modulated' ? .37 : .19) / sr, rotationSin = Math.sin(rotation), rotationCos = Math.cos(rotation);
      const highpassCoefficient = Math.exp(-TAU * profile.highpass / sr);
      const dcCoefficient = 1 - Math.exp(-TAU * 6 / sr);
      let preAt = 0, earlyAt = 0, firAt = 0, pitchAt = 0, pitchPhase = .25, shiftedL = 0, shiftedR = 0;
      let predelay = p.predelay * sr * .001, size = p.size, diffusion = p.diffusion, width = p.width, mix = p.mix, damping = lp(p.damping, sr), targetDamping = damping;
      let mixFadeRemaining = 0, mixFadeStep = 0, mixFadeTarget = mix;
      const mixFadeFrames = Math.max(1, Math.round(sr * .025));
      let windowSamples = isFIR ? envelopeSeconds(model, p) * sr : 0, targetWindow = windowSamples, inputAge = Infinity, oscillatorSin = 0, oscillatorCos = 1;
      let configured = false, quietFrames = Infinity, quietLimit = 0;
      let hpInputL = 0, hpInputR = 0, hpOutputL = 0, hpOutputR = 0, inputPeak = 0, outputPeak = 0, dcL = 0, dcR = 0;
      function update(next, instant) {
        const old = p; p = next;
        if (!configured || old.damping !== p.damping) targetDamping = lp(p.damping * (spring ? .8 : model === 'digital' ? .88 : 1), sr);
        if (isFIR && (!configured || old.decay !== p.decay)) targetWindow = Math.min(firL.length - 4, envelopeSeconds(model, p) * sr);
        if (!configured || old.size !== p.size || old.decay !== p.decay) {
          const scale = .45 + p.size * 1.4;
          for (let j = 0; j < count; j++) {
            targetDelays[j] = Math.max(3, Math.min(lines[j].length - sr * .0019 - 3, sr * base[j] * profile.scale * scale));
            const decay = p.decay * (model === 'ambience' ? .32 : model === 'tile' ? .72 : 1);
            targetGains[j] = Math.exp(-6.907755278982137 * targetDelays[j] / (sr * decay)) * (shimmer ? .93 : 1);
          }
        }
        if (instant) { delays.set(targetDelays); gains.set(targetGains); predelay = p.predelay * sr * .001; size = p.size; diffusion = p.diffusion; width = p.width; mix = p.mix; damping = targetDamping; windowSamples = targetWindow; }
        quietLimit = Math.ceil(sr * (.18 + (isFIR ? p.decay + .15 : p.decay * (model === 'ambience' ? .6 : model === 'tile' ? 1.1 : 1.65) + (bloom ? 1.3 : .85))));
        configured = true;
      }
      function reset() {
        preL.fill(0); preR.fill(0); earlyL.fill(0); earlyR.fill(0); apL.forEach(clearAP); apR.forEach(clearAP); lines.forEach(line => line.fill(0)); tankDiffusers.forEach(clearAP); dispersion.forEach(stages => stages.forEach(clearAP));
        if (firL) { firL.fill(0); firR.fill(0); }
        if (pitchL) { pitchL.fill(0); pitchR.fill(0); }
        lineAt.fill(0); damp.fill(0); matrix.fill(0); preAt = earlyAt = firAt = pitchAt = 0; pitchPhase = .25;
        shiftedL = shiftedR = hpInputL = hpInputR = hpOutputL = hpOutputR = inputPeak = outputPeak = dcL = dcR = 0;
        oscillatorSin = 0; oscillatorCos = 1; inputAge = quietFrames = Infinity; update(p, true);
        mixFadeRemaining = 0; mixFadeStep = 0; mixFadeTarget = mix;
      }
      function process(left, right, frames) {
        const n = frames === undefined ? Math.min(left.length, right.length) : frames;
        if (p.bypass || mix === 0 && p.mix === 0) return;
        for (let i = 0; i < n; i++) {
          const dryL = safe(left[i]), dryR = safe(right[i]);
          // A zero mix is a true suspension, reached by a finite sample-clocked
          // fade. Finish the audible fade before discarding the tank history.
          if (mixFadeRemaining > 0) {
            mix += mixFadeStep;
            if (--mixFadeRemaining === 0) {
              mix = mixFadeTarget;
              if (mix === 0) { reset(); left[i] = dryL; right[i] = dryR; continue; }
            }
          } else mix += slew * (p.mix - mix);
          if (mix === 0 && p.mix === 0) { left[i] = dryL; right[i] = dryR; continue; }
          // Idle is sample-based so a block split cannot change modulation
          // phase at the next excitation. Settled empty returns do no tank work.
          if (dryL === 0 && dryR === 0) {
            if (quietFrames === Infinity) { left[i] = right[i] = 0; continue; }
            if (++quietFrames >= quietLimit) { reset(); left[i] = right[i] = 0; continue; }
          } else quietFrames = 0;
          width += slew * (p.width - width); size += slowSlew * (p.size - size); diffusion += slew * (p.diffusion - diffusion); damping += slew * (targetDamping - damping); predelay += slowSlew * (p.predelay * sr * .001 - predelay);
          preL[preAt] = dryL; preR[preAt] = dryR;
          let exciteL = predelay < .001 ? dryL : read(preL, preAt, predelay), exciteR = predelay < .001 ? dryR : read(preR, preAt, predelay);
          if (++preAt === preL.length) preAt = 0;
          hpOutputL = exciteL - hpInputL + highpassCoefficient * hpOutputL; hpOutputR = exciteR - hpInputR + highpassCoefficient * hpOutputR; hpInputL = exciteL; hpInputR = exciteR;
          inputAge = Math.abs(exciteL) + Math.abs(exciteR) > 1e-8 ? 0 : inputAge + 1;
          const originalL = hpOutputL, originalR = hpOutputR;
          exciteL = originalL; exciteR = originalR;
          const apGain = .35 + .35 * diffusion;
          for (let j = 0; j < 4; j++) { exciteL = apSample(exciteL, apL[j], apGain); exciteR = apSample(exciteR, apR[j], apGain); }
          exciteL = originalL + diffusion * (exciteL - originalL); exciteR = originalR + diffusion * (exciteR - originalR);
          let wetL = 0, wetR = 0;
          if (isFIR) {
            windowSamples += slowSlew * (targetWindow - windowSamples);
            firL[firAt] = exciteL; firR[firAt] = exciteR;
            for (let j = 0; j < tapPosition.length; j++) {
              const delay = Math.max(1, (tapPosition[j] + (size - .5) * .22 * tapSkew[j]) * windowSamples);
              const a = read(firL, firAt, delay), b = read(firR, firAt, Math.min(firR.length - 3, delay * 1.003));
              wetL += (a * .86 + b * .14) * tapL[j]; wetR += (b * .86 + a * .14) * tapR[j];
            }
            if (++firAt === firL.length) firAt = 0;
            // A finite reflection kernel plus an excitation-aware smooth end:
            // short diffusers cannot leave a conventional decay after the gate.
            const fade = Math.min(sr * .025, windowSamples * .12), remaining = windowSamples - inputAge;
            const end = remaining >= fade ? 1 : remaining <= 0 ? 0 : .5 - .5 * Math.cos(Math.PI * remaining / fade);
            wetL *= end; wetR *= end;
          } else {
            earlyL[earlyAt] = exciteL; earlyR[earlyAt] = exciteR;
            let reflectionsL = 0, reflectionsR = 0;
            if (profile.early) for (let j = 0; j < earlyTimes.length; j++) {
              const delay = Math.min(earlyL.length - 3, sr * earlyTimes[j] * profile.spread * (.45 + size * 1.15));
              const polarity = j % 3 === 0 ? -1 : 1, gain = polarity * (.2 - j * .0105);
              reflectionsL += read(earlyL, earlyAt, delay) * gain;
              reflectionsR += read(earlyR, earlyAt, Math.min(earlyR.length - 3, delay * (j & 1 ? 1.13 : .91))) * gain * (j & 1 ? -1 : 1);
            }
            // Bloom defers the late-field injection, instead of merely fading
            // the output of the same immediate hall.
            if (bloom) {
              const buildup = sr * (.025 + size * .16);
              exciteL = read(earlyL, earlyAt, buildup) * .45 + read(earlyR, earlyAt, buildup * 1.83) * .35 + read(earlyL, earlyAt, buildup * 2.77) * .2;
              exciteR = read(earlyR, earlyAt, buildup * 1.09) * .45 + read(earlyL, earlyAt, buildup * 1.71) * .35 + read(earlyR, earlyAt, buildup * 2.53) * .2;
            }
            if (++earlyAt === earlyL.length) earlyAt = 0;
            let sum = 0;
            for (let j = 0; j < count; j++) {
              delays[j] += slowSlew * (targetDelays[j] - delays[j]); gains[j] += slowSlew * (targetGains[j] - gains[j]);
              const motion = profile.motion * sr * (oscillatorSin * offsetCos[j] + oscillatorCos * offsetSin[j]);
              let value = read(lines[j], lineAt[j], delays[j] + motion);
              damp[j] += damping * (value - damp[j]); value = damp[j];
              if (spring) for (let k = 0; k < dispersion[j].length; k++) value = apSample(value, dispersion[j][k], dispersion[j][k].gain);
              if (plate || bloom) value = apSample(value, tankDiffusers[j], .45 + diffusion * .22);
              // Truncation has an absorbing zero. Rounding a feedback sample
              // can otherwise sustain an audible one-quantum limit cycle.
              if (model === 'digital') value = Math.trunc(value * 16384) / 16384;
              matrix[j] = safe(value); sum += matrix[j];
              wetL += value * (j & 1 ? -1 : 1); wetR += value * (j & 2 ? -1 : 1);
            }
            // A two-spring tank must have two independent pickup projections.
            if (spring) { wetL = matrix[0] + matrix[1] * .43; wetR = matrix[1] - matrix[0] * .31; }
            if (profile.matrix === 'hadamard') {
              for (let stride = 1; stride < count; stride *= 2) for (let start = 0; start < count; start += stride * 2) for (let j = 0; j < stride; j++) {
                const a = matrix[start + j], b = matrix[start + j + stride]; matrix[start + j] = a + b; matrix[start + j + stride] = a - b;
              }
              const scale = 1 / Math.sqrt(count); for (let j = 0; j < count; j++) matrix[j] *= scale;
            } else if (profile.matrix === 'house') {
              for (let j = 0; j < count; j++) matrix[j] -= 2 * sum / count;
            } else if (profile.matrix === 'cross') {
              const first = matrix[0]; for (let j = 0; j < count - 1; j++) matrix[j] = matrix[j + 1]; matrix[count - 1] = -first;
            }
            const mid = .5 * (exciteL + exciteR), side = .5 * (exciteL - exciteR), injection = spring ? .44 : count === 16 ? .21 : .27;
            for (let j = 0; j < count; j++) {
              const pitch = shimmer ? ((j & 1 ? shiftedR : shiftedL) * .035) : 0;
              lines[j][lineAt[j]] = safe(matrix[j] * gains[j] + (mid + side * (j & 1 ? -1 : 1)) * injection + pitch);
              if (++lineAt[j] === lines[j].length) lineAt[j] = 0;
            }
            const normalization = profile.late / Math.sqrt(count);
            wetL = wetL * normalization + reflectionsL * profile.early; wetR = wetR * normalization + reflectionsR * profile.early;
            if (shimmer) {
              pitchL[pitchAt] = wetL; pitchR[pitchAt] = wetR;
              const phaseB = pitchPhase < .5 ? pitchPhase + .5 : pitchPhase - .5, weight = .5 - .5 * Math.cos(TAU * pitchPhase);
              // Decreasing delay at one sample/sample gives exactly 2x read
              // speed. Overlapped windows remove the sawtooth splice.
              shiftedL = read(pitchL, pitchAt, pitchBase + (1 - pitchPhase) * pitchWindow) * weight + read(pitchL, pitchAt, pitchBase + (1 - phaseB) * pitchWindow) * (1 - weight);
              shiftedR = read(pitchR, pitchAt, pitchBase + (1 - pitchPhase) * pitchWindow) * weight + read(pitchR, pitchAt, pitchBase + (1 - phaseB) * pitchWindow) * (1 - weight);
              wetL += shiftedL * .38; wetR += shiftedR * .38;
              if (++pitchAt === pitchLength) pitchAt = 0;
              pitchPhase += pitchStep; if (pitchPhase >= 1) pitchPhase -= 1;
            }
            const nextSin = oscillatorSin * rotationCos + oscillatorCos * rotationSin;
            oscillatorCos = oscillatorCos * rotationCos - oscillatorSin * rotationSin; oscillatorSin = nextSin;
          }
          // Reject DC from long feedback structures; this has no dry-path effect.
          // The finite modes already high-pass their excitation. A further
          // output IIR would create a tail after their deliberate hard horizon.
          if (!isFIR) { dcL += dcCoefficient * (wetL - dcL); dcR += dcCoefficient * (wetR - dcR); wetL -= dcL; wetR -= dcR; }
          const wetMid = (wetL + wetR) * .5, wetSide = (wetL - wetR) * .5 * width;
          const outL = safe(dryL + (wetMid + wetSide - dryL) * mix), outR = safe(dryR + (wetMid - wetSide - dryR) * mix);
          left[i] = outL; right[i] = outR;
          inputPeak = Math.max(Math.abs(dryL), Math.abs(dryR), inputPeak * peakDecay); outputPeak = Math.max(Math.abs(outL), Math.abs(outR), outputPeak * peakDecay);
        }
      }
      update(p, true);
      return { model, process, reset, setParams(next) {
        const oldBypass = p.bypass, oldMixTarget = p.mix;
        update(next, false);
        if (oldBypass !== p.bypass) { reset(); return; }
        if (oldMixTarget === 0 && p.mix > 0 && mix === 0) {
          // A suspended return contains no useful history. Resume from dry,
          // rather than snapping the freshly cleared tank to the new mix.
          reset(); mix = 0;
          mixFadeTarget = p.mix; mixFadeRemaining = mixFadeFrames; mixFadeStep = p.mix / mixFadeFrames;
        } else if (oldMixTarget !== p.mix && (oldMixTarget === 0 || p.mix === 0 || mixFadeRemaining > 0)) {
          // Retarget an interrupted fade from its current audible value.
          if (p.mix === 0 && mix === 0) reset();
          else { mixFadeTarget = p.mix; mixFadeRemaining = mixFadeFrames; mixFadeStep = (p.mix - mix) / mixFadeFrames; }
        }
      }, getTailTime() {
        if (p.bypass) return 0;
        if (p.mix === 0) return mixFadeRemaining / sr;
        return p.predelay * .001 + (isFIR ? Math.max(targetWindow, windowSamples) / sr + .12 : p.decay * (model === 'ambience' ? .6 : model === 'tile' ? 1.1 : 1.65) + (bloom ? 1.3 : .85));
      }, getMeters() { return { model, inputDb: 20 * Math.log10(Math.max(1e-6, inputPeak)), outputDb: 20 * Math.log10(Math.max(1e-6, outputPeak)) }; } };
    }
    function create(sampleRate, params) {
      const sr = clamp(finite(sampleRate, 48000), 8000, 192000);
      let p = normalize(params), current = kernel(sr, p), previous = null, fadeAt = 0;
      const fadeFrames = Math.max(16, Math.round(sr * .04));
      let scratchL = new Float32Array(128), scratchR = new Float32Array(128);
      function setParams(next) {
        const nextParams = normalize(Object.assign({}, p, next));
        if (nextParams.model !== p.model) { previous = current; current = kernel(sr, nextParams); fadeAt = 0; }
        else current.setParams(nextParams);
        p = nextParams;
      }
      function process(left, right) {
        const frames = Math.min(left.length, right.length);
        if (!previous) { current.process(left, right, frames); return; }
        if (scratchL.length < frames) { scratchL = new Float32Array(frames); scratchR = new Float32Array(frames); }
        scratchL.set(left); scratchR.set(right); previous.process(scratchL, scratchR, frames); current.process(left, right, frames);
        for (let i = 0; i < frames; i++) {
          const x = Math.min(1, fadeAt++ / fadeFrames), blend = x * x * (3 - 2 * x);
          left[i] = scratchL[i] + (left[i] - scratchL[i]) * blend; right[i] = scratchR[i] + (right[i] - scratchR[i]) * blend;
        }
        if (fadeAt >= fadeFrames) previous = null;
      }
      return { process, setParams, reset() { previous = null; fadeAt = 0; current.reset(); }, getParams() { return Object.assign({}, p); }, getMeters() { return current.getMeters(); }, getTailTime() { return Math.max(current.getTailTime(), previous ? previous.getTailTime() : 0); } };
    }
    return { specifications, normalize, create };
  }
  scope.createLoomHoodDSP = createLoomHoodDSP;
})(typeof window === 'undefined' ? globalThis : window);
