/* PRESERVE · a causal, deterministic reduced-order stereo tape machine. */
(function (scope) {
  'use strict';
  function createLoomTapeDSP() {
    'use strict';
    // Everything used by this factory travels with its AudioWorklet source.
    const TAU = Math.PI * 2;
    const specifications = {
      model: ['studio', 'valve', 'home', 'cassette'], speed: ['15', '30', '7.5', '3.75', '1.875'], formula: ['oxide', 'high-output', 'low-noise'],
      input: [-18, 18, 0], drive: [0, 24, 4], warmth: [0, 1, .45], wear: [0, 1, 0], output: [-24, 12, 0],
      bias: [-1, 1, 0], calibration: [-6, 6, 0], headBump: [0, 1, .3], lowTrim: [-6, 6, 0], highTrim: [-6, 6, 0], autoGain: ['on', 'off'],
      wow: [0, 1.5, 0], wowRate: [.1, 2, .4], flutter: [0, .5, 0], flutterRate: [2, 15, 6], noise: [0, 1, 0], dropouts: [0, 1, 0],
      azimuth: [-1, 1, 0], crosstalk: [0, .1, 0], stereoLink: [0, 1, 1], mix: [0, 1, 1]
    };
    const parameterKeys = Object.keys(specifications);
    const finite = (x, fallback) => typeof x === 'number' && Number.isFinite(x) ? x : fallback;
    const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
    const safe = x => Number.isFinite(x) ? clamp(x, -8, 8) : 0;
    const db = x => Math.pow(10, x / 20);
    const toDb = x => Math.max(-120, 20 * Math.log10(Math.max(1e-12, x)));
    function normalize(source) {
      source = source && typeof source === 'object' ? source : {};
      const result = {};
      for (const key of parameterKeys) {
        const rule = specifications[key];
        result[key] = typeof rule[0] === 'number' ? clamp(finite(source[key], rule[2]), rule[0], rule[1]) : rule.includes(source[key]) ? source[key] : rule[0];
      }
      result.bypass = source.bypass === true;
      return result;
    }
    // These musical voicings are not measured replicas. Nominal speed, tape
    // overload, bandwidth, head gap, LF coupling, asymmetry, magnetic memory.
    const machines = {
      studio: [15, .95, 25000, 60, 7, .015, .08],
      valve: [15, .70, 18500, 78, 13, .16, .22],
      home: [7.5, .58, 16500, 180, 22, .045, .15],
      cassette: [1.875, .40, 12000, 600, 32, .025, .20]
    };
    const stocks = { oxide: [1, 1, 1], 'high-output': [1.45, 1.08, .8], 'low-noise': [1.18, 1.12, .52] };
    function soft(x) {
      if (x >= 3) return 1; if (x <= -3) return -1;
      const square = x * x; return x * (27 + square) / (27 + 9 * square);
    }
    function lowpass(frequency, rate) { return 1 - Math.exp(-TAU * Math.min(rate * .45, Math.max(.5, frequency)) / rate); }
    function lowpassCoefficients(frequency, q, rate) {
      const angle = TAU * frequency / rate, cosine = Math.cos(angle), alpha = Math.sin(angle) / (2 * q), a0 = 1 + alpha;
      return new Float64Array([(1 - cosine) * .5 / a0, (1 - cosine) / a0, (1 - cosine) * .5 / a0, -2 * cosine / a0, (1 - alpha) / a0]);
    }
    function peakCoefficients(frequency, gain, rate, target) {
      const angle = TAU * clamp(frequency, 12, rate * .4) / rate, cosine = Math.cos(angle), alpha = Math.sin(angle) / (2 * .72), amplitude = Math.pow(10, gain / 40), a0 = 1 + alpha / amplitude;
      target[0] = (1 + alpha * amplitude) / a0; target[1] = -2 * cosine / a0; target[2] = (1 - alpha * amplitude) / a0;
      target[3] = -2 * cosine / a0; target[4] = (1 - alpha / amplitude) / a0;
    }
    function filter(x, c, state, at) {
      const y = c[0] * x + state[at];
      state[at] = c[1] * x - c[3] * y + state[at + 1]; state[at + 1] = c[2] * x - c[4] * y;
      return y;
    }
    function create(sampleRate, source) {
      const sr = clamp(finite(sampleRate, 48000), 8000, 192000), osr = sr * 4;
      let p = normalize(source), dirty = true, first = true, tick = 0;
      // Numeric derived controls: gain staging is smoothed jointly, so opposing
      // Drive and compensation gains cannot cause an automation level surge.
      const V = { pre: 0, net: 1, warmth: 2, wear: 3, headroom: 4, asymmetry: 5, memory: 6, emphasis: 7, lowGain: 8, highGain: 9, lowCut: 10, headL: 11, headR: 12,
        wowAmplitude: 13, flutterAmplitude: 14, wowRate: 15, flutterRate: 16, noise: 17, dropout: 18, crosstalk: 19, link: 20, mix: 21, inverseCoefficient: 22, ageGain: 23, outputGain: 24, active: 25 };
      const values = new Float64Array(26), targets = new Float64Array(26), bump = new Float64Array(5), bumpTarget = new Float64Array(5);
      const smooth = 1 - Math.exp(-1 / (sr * .012));
      const previous = new Float64Array(2), recordLow = new Float64Array(2), magnet = new Float64Array(2), nonlinearFilters = new Float64Array(8), deEmphasis = new Float64Array(2);
      const dcPrevious = new Float64Array(2), dcState = new Float64Array(2), bumpState = new Float64Array(4), cutState = new Float64Array(2), head1 = new Float64Array(2), head2 = new Float64Array(2);
      const lowTone = new Float64Array(2), highTone = new Float64Array(2), hissLow = new Float64Array(2), hissHigh = new Float64Array(2);
      const dropoutGain = new Float64Array([1, 1]), dropoutTarget = new Float64Array([1, 1]), dropoutFrames = new Int32Array(2);
      const ringSize = Math.ceil(sr * .15) + 8, dryRing = [new Float32Array(ringSize), new Float32Array(ringSize)], tapeRing = [new Float32Array(ringSize), new Float32Array(ringSize)];
      const aa = [lowpassCoefficients(sr * .39, .5411961, osr), lowpassCoefficients(sr * .39, 1.306563, osr)];
      const recordCoefficient = lowpass(4200, osr), memoryCoefficient = lowpass(78, osr), dcDecay = Math.exp(-TAU * 8 / sr), lowToneCoefficient = lowpass(180, sr), highToneCoefficient = lowpass(4200, sr);
      const hissHighCoefficient = lowpass(1250, sr), hissLowCoefficient = lowpass(Math.min(14000, sr * .4), sr);
      const gateAttack = 1 - Math.exp(-1 / (sr * .003)), gateRelease = 1 - Math.exp(-1 / (sr * .08)), dropoutSmoothing = 1 - Math.exp(-1 / (sr * .008));
      let write = 0, wowPhase = 0, flutterPhase = 0, wearPhase = 0, gate = 0, seed = 0x52a9f3c1, scrub = 1024, dormant = false;
      const meter = { inputDb: -120, tapeDb: -120, outputDb: -120, compressionDb: 0, transportMs: 0 };
      const history = [previous, recordLow, magnet, nonlinearFilters, deEmphasis, dcPrevious, dcState, bumpState, cutState, head1, head2, lowTone, highTone, hissLow, hissHigh];
      function random() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }
      function clock() {
        wowPhase += TAU * values[V.wowRate] / sr; flutterPhase += TAU * values[V.flutterRate] / sr; wearPhase += TAU * .41 / sr;
        if (wowPhase > TAU * 10000) wowPhase -= TAU * 10000;
        if (flutterPhase > TAU * 10000) flutterPhase -= TAU * 10000;
        if (wearPhase > TAU) wearPhase -= TAU;
      }
      function clearSignal() {
        for (const state of history) state.fill(0);
        for (const ring of dryRing) ring.fill(0); for (const ring of tapeRing) ring.fill(0);
        dropoutGain.fill(1); dropoutTarget.fill(1); dropoutFrames.fill(0); write = 0; gate = 0;
      }
      function update() {
        const machine = machines[p.model], stock = stocks[p.formula], speed = Number(p.speed), bandwidth = machine[2] * Math.pow(speed / machine[0], .44) * stock[1] * (1 - .72 * p.wear) * (1 - .17 * p.bias);
        targets[V.pre] = db(p.input + p.drive + p.calibration);
        targets[V.net] = db(p.input + p.output + (p.autoGain === 'off' ? p.drive : 0));
        targets[V.warmth] = p.warmth; targets[V.wear] = p.wear;
        targets[V.headroom] = machine[1] * stock[0] * (1 + .18 * p.bias); targets[V.asymmetry] = machine[5] + .035 * p.bias; targets[V.memory] = machine[6];
        targets[V.emphasis] = 1.25 + .8 * (1 - p.bias) + .6 * p.warmth;
        targets[V.inverseCoefficient] = lowpass(4200 / targets[V.emphasis], sr);
        targets[V.ageGain] = db(-p.wear * 1.25);
        targets[V.outputGain] = db(p.output);
        targets[V.lowGain] = db(p.lowTrim) - 1; targets[V.highGain] = db(p.highTrim) - 1;
        targets[V.lowCut] = lowpass(machine[4] * Math.sqrt(machine[0] / speed), sr);
        targets[V.headL] = lowpass(bandwidth / (1 + Math.max(0, -p.azimuth) * 3 + Math.max(0, p.azimuth) * .55), sr);
        targets[V.headR] = lowpass(bandwidth / (1 + Math.max(0, p.azimuth) * 3 + Math.max(0, -p.azimuth) * .55), sr);
        targets[V.wowAmplitude] = p.wow * .01 / (TAU * p.wowRate * (.75 + .25 * .37));
        targets[V.flutterAmplitude] = p.flutter * .01 / (TAU * p.flutterRate * (.8 + .2 * 2.47));
        targets[V.wowRate] = p.wowRate; targets[V.flutterRate] = p.flutterRate;
        targets[V.noise] = p.noise * p.noise * .012 * stock[2] * (p.model === 'cassette' ? 1.3 : 1);
        targets[V.dropout] = p.dropouts; targets[V.crosstalk] = p.crosstalk; targets[V.link] = p.stereoLink;
        // Retain the running head position while fading to direct dry. Pulling
        // its whole delay back to zero would create an artificial pitch swipe.
        targets[V.mix] = p.mix > 0 ? p.mix : first ? 0 : values[V.mix];
        targets[V.active] = p.bypass || p.mix === 0 ? 0 : 1;
        peakCoefficients(machine[3] * speed / 15, p.headBump * (p.model === 'studio' ? 5 : 7), sr, bumpTarget);
        if (first) { values.set(targets); bump.set(bumpTarget); first = false; }
        dirty = false;
      }
      // Causal cubic Lagrange interpolation uses the current and three older
      // samples; it never requests an as-yet-unwritten sample at tiny delays.
      function read(buffer, delay) {
        if (delay <= 1e-9) return buffer[write];
        const whole = Math.floor(delay), fraction = delay - whole;
        let at = write - whole; if (at < 0) at += ringSize;
        const a = buffer[at], b = buffer[at === 0 ? ringSize - 1 : at - 1], c = buffer[(at + ringSize - 2) % ringSize], d = buffer[(at + ringSize - 3) % ringSize];
        return a * (1 - fraction) * (2 - fraction) * (3 - fraction) / 6 + b * fraction * (2 - fraction) * (3 - fraction) / 2 - c * fraction * (1 - fraction) * (3 - fraction) / 2 + d * fraction * (1 - fraction) * (2 - fraction) / 6;
      }
      function record(x, channel) {
        const prior = previous[channel], increment = (x - prior) * .25, headroom = values[V.headroom], warmth = values[V.warmth];
        let delta = 0;
        for (let sub = 1; sub <= 4; sub++) {
          const interpolated = prior + increment * sub;
          recordLow[channel] += recordCoefficient * (interpolated - recordLow[channel]);
          const emphasized = interpolated + (values[V.emphasis] - 1) * (interpolated - recordLow[channel]);
          magnet[channel] += memoryCoefficient * (soft(emphasized / (headroom * 1.7)) - magnet[channel]);
          const bias = values[V.asymmetry] + values[V.memory] * magnet[channel], baseline = soft(bias), square = bias * bias;
          // Near-zero slope normalization prevents a model's bias from acting
          // as an unlabelled input gain. Magnetic memory still changes shape.
          const slope = 1 / Math.max(.4, (729 - 162 * square + 9 * square * square) / ((27 + 9 * square) * (27 + 9 * square)));
          const saturated = headroom * (soft(emphasized / headroom + bias) - baseline) * slope;
          delta = saturated - emphasized;
          delta = filter(delta, aa[0], nonlinearFilters, channel * 4);
          delta = filter(delta, aa[1], nonlinearFilters, channel * 4 + 2);
        }
        previous[channel] = x;
        // Apply the inverse record emphasis to the nonlinear delta only. The
        // undelayed linear path remains intact when Warmth is zero.
        const inverse = 1 / values[V.emphasis];
        deEmphasis[channel] += values[V.inverseCoefficient] * (delta - deEmphasis[channel]);
        delta = inverse * delta + (1 - inverse) * deEmphasis[channel];
        const cleaned = delta - dcPrevious[channel] + dcDecay * dcState[channel];
        dcPrevious[channel] = delta; dcState[channel] = Math.abs(cleaned) < 1e-26 ? 0 : cleaned;
        return x + warmth * dcState[channel];
      }
      function reproduce(x, channel) {
        cutState[channel] += values[V.lowCut] * (x - cutState[channel]); x -= cutState[channel];
        x = filter(x, bump, bumpState, channel * 2);
        const coefficient = values[channel ? V.headR : V.headL];
        head1[channel] += coefficient * (x - head1[channel]); head2[channel] += coefficient * (head1[channel] - head2[channel]); x = head2[channel];
        lowTone[channel] += lowToneCoefficient * (x - lowTone[channel]); x += values[V.lowGain] * lowTone[channel];
        highTone[channel] += highToneCoefficient * (x - highTone[channel]); x += values[V.highGain] * (x - highTone[channel]);
        return x;
      }
      function process(left, right) {
        if (!left || !right || left.length !== right.length) throw new Error('PRESERVE requires equal stereo blocks.');
        let inputPower = 0, tapePower = 0, magneticPower = 0, outputPower = 0, transport = 0;
        if (!dirty && values[V.active] === 0 && targets[V.active] === 0) {
          // Settled dry does not pay for an oversampled tape circuit. Retain
          // the independent transport/random clock, and discard stale signal
          // memory before a later fade-in can reveal it.
          dormant = true;
          for (let frame = 0; frame < left.length; frame++) {
            for (let key = 0; key < values.length; key++) values[key] += smooth * (targets[key] - values[key]);
            for (let key = 0; key < 5; key++) bump[key] += smooth * (bumpTarget[key] - bump[key]);
            const l = safe(left[frame]), r = safe(right[frame]); left[frame] = l; right[frame] = r;
            inputPower += l * l + r * r;
            random(); random(); random(); random(); clock(); tick++;
            if (--scrub === 0) scrub = 1024;
          }
          meter.inputDb = meter.outputDb = toDb(Math.sqrt(inputPower / Math.max(1, left.length * 2)));
          meter.tapeDb = -120; meter.compressionDb = 0; meter.transportMs = 0;
          return;
        }
        for (let frame = 0; frame < left.length; frame++) {
          if (tick++ % 32 === 0 && dirty) update();
          if (dormant && targets[V.active] > 0) { clearSignal(); dormant = false; }
          for (let key = 0; key < values.length; key++) values[key] += smooth * (targets[key] - values[key]);
          if (targets[V.active] === 0 && values[V.active] < 1e-7) {
            values[V.active] = 0; dormant = true;
            if (p.mix === 0) values[V.mix] = targets[V.mix] = 0;
          }
          for (let key = 0; key < 5; key++) bump[key] += smooth * (bumpTarget[key] - bump[key]);
          if (--scrub === 0) { for (const state of history) for (let cell = 0; cell < state.length; cell++) if (Math.abs(state[cell]) < 1e-28) state[cell] = 0; scrub = 1024; }
          const dryL = safe(left[frame]), dryR = safe(right[frame]), maximum = Math.max(Math.abs(dryL), Math.abs(dryR));
          gate += (maximum > gate ? gateAttack : gateRelease) * (maximum - gate);
          if (gate < 1e-8) gate = 0;
          const gateGain = gate / (gate + .003);
          const drivenL = clamp(dryL * values[V.pre], -65536, 65536), drivenR = clamp(dryR * values[V.pre], -65536, 65536);
          inputPower += dryL * dryL + dryR * dryR; tapePower += drivenL * drivenL + drivenR * drivenR;
          const magneticL = record(drivenL, 0), magneticR = record(drivenR, 1);
          magneticPower += magneticL * magneticL + magneticR * magneticR;
          let wetL = reproduce(magneticL, 0) * values[V.net] / values[V.pre], wetR = reproduce(magneticR, 1) * values[V.net] / values[V.pre];
          const commonRandom = random(), randomL = random(), randomR = random(), noiseRandom = random();
          for (let channel = 0; channel < 2; channel++) {
            const eventRandom = noiseRandom < values[V.link] ? commonRandom : channel ? randomR : randomL;
            if (dropoutFrames[channel] > 0) dropoutFrames[channel]--;
            else {
              dropoutTarget[channel] = 1;
              if (values[V.dropout] > 1e-6 && eventRandom < values[V.dropout] * 1.7 / sr) {
                dropoutTarget[channel] = 1 - values[V.dropout] * (.35 + .6 * noiseRandom);
                dropoutFrames[channel] = Math.round(sr * (.035 + .19 * noiseRandom));
              }
            }
            dropoutGain[channel] += dropoutSmoothing * (dropoutTarget[channel] - dropoutGain[channel]);
            const noise = ((channel ? randomR : randomL) * 2 - 1);
            hissHigh[channel] += hissHighCoefficient * (noise - hissHigh[channel]);
            hissLow[channel] += hissLowCoefficient * (noise - hissHigh[channel] - hissLow[channel]);
            const age = values[V.ageGain] * (values[V.wear] > 1e-8 ? 1 - .01957 * values[V.wear] * Math.sin(wearPhase + channel * (1 - values[V.link])) : 1);
            const gain = age * dropoutGain[channel], hiss = hissLow[channel] * values[V.noise] * gateGain * values[V.outputGain];
            if (channel) wetR = wetR * gain + hiss; else wetL = wetL * gain + hiss;
          }
          const beforeL = wetL; wetL += (wetR - wetL) * values[V.crosstalk]; wetR += (beforeL - wetR) * values[V.crosstalk];
          dryRing[0][write] = dryL; dryRing[1][write] = dryR; tapeRing[0][write] = safe(wetL); tapeRing[1][write] = safe(wetR);
          let outputL = dryL, outputR = dryR;
          for (let channel = 0; channel < 2; channel++) {
            let delay = 0;
            if (values[V.wowAmplitude] > 1e-12 || values[V.flutterAmplitude] > 1e-12) {
              const loose = channel * (1 - values[V.link]), wow = .75 * Math.sin(wowPhase + loose * .83) + .25 * Math.sin(wowPhase * .37 + loose * 1.37), flutter = .8 * Math.sin(flutterPhase + loose * 1.1) + .2 * Math.sin(flutterPhase * 2.47 + loose * .73);
              delay = clamp((values[V.wowAmplitude] * (1 - wow) + values[V.flutterAmplitude] * (1 - flutter)) * sr * values[V.mix], 0, ringSize - 5);
            }
            const dry = read(dryRing[channel], delay), wet = read(tapeRing[channel], delay);
            const direct = channel ? dryR : dryL, blended = dry + (wet - dry) * values[V.mix];
            const output = values[V.active] === 0 ? direct : safe(direct + (blended - direct) * values[V.active]);
            if (channel) outputR = output; else outputL = output;
            transport += delay / sr * 500 * values[V.active];
          }
          left[frame] = outputL; right[frame] = outputR; outputPower += outputL * outputL + outputR * outputR;
          if (++write === ringSize) write = 0;
          // Keep the phase clock long enough for the incommensurate components
          // without a discontinuity each time the primary oscillator wraps.
          clock();
        }
        const count = Math.max(1, left.length * 2);
        meter.inputDb = toDb(Math.sqrt(inputPower / count)); meter.tapeDb = toDb(Math.sqrt(tapePower / count)); meter.outputDb = toDb(Math.sqrt(outputPower / count));
        meter.compressionDb = tapePower > 1e-18 ? clamp(10 * Math.log10((tapePower + 1e-24) / (magneticPower + 1e-24)), 0, 60) : 0;
        meter.transportMs = transport / Math.max(1, left.length);
      }
      update();
      function setParams(next) {
        if (!next || typeof next !== 'object') return;
        for (const key of parameterKeys) if (Object.prototype.hasOwnProperty.call(next, key)) {
          const rule = specifications[key], value = typeof rule[0] === 'number' ? clamp(finite(next[key], rule[2]), rule[0], rule[1]) : rule.includes(next[key]) ? next[key] : rule[0];
          if (p[key] !== value) { p[key] = value; dirty = true; }
        }
        if (Object.prototype.hasOwnProperty.call(next, 'bypass') && p.bypass !== (next.bypass === true)) { p.bypass = next.bypass === true; dirty = true; }
      }
      return {
        setParams, process,
        reset() {
          clearSignal(); dormant = false;
          write = 0; wowPhase = 0; flutterPhase = 0; wearPhase = 0; gate = 0; seed = 0x52a9f3c1; scrub = 1024; tick = 0;
          first = true; update();
          Object.assign(meter, { inputDb: -120, tapeDb: -120, outputDb: -120, compressionDb: 0, transportMs: 0 });
        },
        getTailTime() {
          if (p.bypass || p.mix === 0) return values[V.active] === 0 ? 0 : .25;
          const wow = p.wow * .01 / (TAU * p.wowRate * (.75 + .25 * .37)), flutter = p.flutter * .01 / (TAU * p.flutterRate * (.8 + .2 * 2.47));
          // Include the slowest permitted head-bump/filter decay, nonlinear DC
          // cleanup, finite signal-following hiss release and transport buffer.
          return (p.noise > 0 ? 2.2 : 1.5) + Math.min(.15, (wow + flutter) * 2) * p.mix;
        },
        getLatencyTime() { return meter.transportMs * .001; },
        getMeters() { return Object.assign({}, meter); }
      };
    }
    return { specifications, normalize, create };
  }
  scope.createLoomTapeDSP = createLoomTapeDSP;
})(typeof window === 'undefined' ? globalThis : window);
