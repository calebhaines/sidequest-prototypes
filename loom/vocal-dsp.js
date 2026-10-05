/* GALLEY · GLAZE vocal strip. Pure DSP; the factory is serialized into Worklets. */
(function (scope) {
  'use strict';
  function createLoomVocalDSP() {
    'use strict';
    const PI = Math.PI, TAU = PI * 2;
    const specifications = {
      clean: ['on', 'off'], input: [-18, 24, 0], highpass: [20, 400, 75], gate: [-90, -12, -70], gateRange: [0, 60, 45], gateRelease: [20, 1000, 180],
      deess: ['on', 'off'], deessFreq: [2500, 11000, 6500], deessThreshold: [-60, -3, -24], deessAmount: [0, 1, 0.45],
      compressor: ['on', 'off'], threshold: [-48, 0, -18], ratio: [1, 20, 3], attack: [0.2, 80, 5], release: [20, 1200, 120], makeup: [0, 18, 2],
      eq: ['on', 'off'], body: [-15, 15, 0], bodyFreq: [100, 600, 220], mud: [-15, 15, -1], mudFreq: [180, 1200, 420], presence: [-15, 15, 1], presenceFreq: [1200, 7000, 3200], air: [-15, 15, 1.5],
      saturation: ['off', 'warm', 'edge', 'fold'], drive: [0, 30, 3], satMix: [0, 1, 0.25],
      pitch: ['off', 'shift', 'correct'], semitones: [-24, 24, 0], fine: [-100, 100, 0], key: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], scale: ['chromatic', 'major', 'minor', 'pentatonic', 'harmonic-minor'], speed: [0, 1, 0.65], pitchWindow: [20, 100, 50], pitchMix: [0, 1, 1],
      harmony: ['off', 'on'], harmonyA: [-24, 24, 7], harmonyB: [-24, 24, 12], harmonyMix: [0, 1, 0.3], harmonyWidth: [0, 1, 0.7],
      doubler: ['off', 'on'], doubleAmount: [0, 1, 0.3], doubleSpread: [0, 1, 0.8], doubleTime: [8, 45, 18], doubleDetune: [0, 25, 7],
      vowel: ['off', 'ah', 'eh', 'ee', 'oh', 'oo'], formant: [-12, 12, 0], vowelMix: [0, 1, 0.5],
      robot: ['off', 'ring', 'vocoder'], carrier: ['saw', 'square', 'pulse'], carrierNote: [24, 84, 45], carrierChord: ['single', 'fifth', 'minor', 'major'], robotMix: [0, 1, 0.65], robotFreq: [20, 2000, 120],
      delay: ['off', 'on'], delayClock: ['sync', 'free'], delayDivision: ['1/8.', '1/32', '1/16', '1/8', '1/4', '1/4.', '1/2', '1'], delayTime: [20, 2000, 375], delayFeedback: [0, 0.88, 0.35], delayTone: [500, 14000, 5500], delayWidth: [0, 1, 0.85], delayMix: [0, 1, 0.15], delayDuck: [0, 1, 0.5],
      reverb: ['off', 'on'], reverbSize: [0, 1, 0.45], reverbDecay: [0.2, 10, 2.4], predelay: [0, 150, 18], reverbTone: [800, 14000, 6500], reverbWidth: [0, 1, 0.8], reverbMix: [0, 1, 0.18], reverbDuck: [0, 1, 0.5],
      chop: ['off', 'on'], chopDivision: ['1/16', '1/32', '1/8', '1/8.', '1/4', '1/4.', '1/2', '1', '2'], chopDepth: [0, 1, 1], chopDuty: [0.05, 0.95, 0.5], chopSmooth: [0.2, 40, 3],
      guard: ['on', 'off'], ceiling: [-12, 0, -0.5], output: [-24, 12, 0], mix: [0, 1, 1]
    };
    const divisions = { '1/32': 0.125, '1/16': 0.25, '1/8': 0.5, '1/8.': 0.75, '1/4': 1, '1/4.': 1.5, '1/2': 2, '1': 4, '2': 8 };
    const scales = { chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], pentatonic: [0, 2, 4, 7, 9], 'harmonic-minor': [0, 2, 3, 5, 7, 8, 11] };
    const vowels = { ah: [800, 1150, 2800], eh: [500, 1750, 2450], ee: [300, 2200, 3000], oh: [450, 800, 2830], oo: [325, 700, 2530] };
    const clamp = (x, lo, hi) => x < lo ? lo : x > hi ? hi : x;
    const finite = (x, fallback) => typeof x === 'number' && Number.isFinite(x) ? x : fallback;
    const bounded = x => Number.isFinite(x) ? clamp(x, -8, 8) : 0;
    const db = x => Math.pow(10, x / 20);
    const lp = (hz, sr) => 1 - Math.exp(-TAU * Math.min(hz, sr * 0.44) / sr);
    const slew = (ms, sr) => Math.exp(-1 / (Math.max(ms, 0.05) * 0.001 * sr));
    function normalize(params) {
      const source = params && typeof params === 'object' ? params : {}, result = {};
      for (const key of Object.keys(specifications)) {
        const rule = specifications[key];
        result[key] = typeof rule[0] === 'number' ? clamp(finite(source[key], rule[2]), rule[0], rule[1]) : rule.includes(source[key]) ? source[key] : rule[0];
      }
      result.bypass = source.bypass === true;
      return result;
    }
    function biquad(type, frequency, q, gain, sr, target) {
      const w = TAU * clamp(frequency, 10, sr * 0.44) / sr, c = Math.cos(w), s = Math.sin(w), a = Math.pow(10, gain / 40), alpha = s / (2 * q);
      let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
      if (type === 'highpass') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + alpha; a1 = -2 * c; a2 = 1 - alpha; }
      else if (type === 'bandpass') { b0 = alpha; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * c; a2 = 1 - alpha; }
      else if (type === 'peak') { b0 = 1 + alpha * a; b1 = -2 * c; b2 = 1 - alpha * a; a0 = 1 + alpha / a; a1 = -2 * c; a2 = 1 - alpha / a; }
      else if (type === 'high') {
        const t = Math.sqrt(2) * s * Math.sqrt(a);
        b0 = a * ((a + 1) + (a - 1) * c + t); b1 = -2 * a * ((a - 1) + (a + 1) * c); b2 = a * ((a + 1) + (a - 1) * c - t);
        a0 = (a + 1) - (a - 1) * c + t; a1 = 2 * ((a - 1) - (a + 1) * c); a2 = (a + 1) - (a - 1) * c - t;
      }
      const result = target || new Float64Array(5);
      result[0] = b0 / a0; result[1] = b1 / a0; result[2] = b2 / a0; result[3] = a1 / a0; result[4] = a2 / a0;
      return result;
    }
    function filter(x, c, state, offset) {
      const y = bounded(c[0] * x + state[offset]);
      state[offset] = bounded(c[1] * x - c[3] * y + state[offset + 1]); state[offset + 1] = bounded(c[2] * x - c[4] * y);
      return y;
    }
    function read(buffer, cursor, delay) {
      let position = cursor - delay;
      position %= buffer.length; if (position < 0) position += buffer.length;
      const index = Math.floor(position), next = index + 1 === buffer.length ? 0 : index + 1, fraction = position - index;
      return buffer[index] + (buffer[next] - buffer[index]) * fraction;
    }
    function soft(x) { if (x > 3) return 1; if (x < -3) return -1; const square = x * x; return x * (27 + square) / (27 + 9 * square); }
    function blep(phase, step) {
      if (phase < step) { const x = phase / step; return x + x - x * x - 1; }
      if (phase > 1 - step) { const x = (phase - 1) / step; return x * x + x + x + 1; }
      return 0;
    }
    function create(sampleRate, params) {
      const sr = clamp(finite(sampleRate, 48000), 8000, 192000);
      let p = normalize(params), coefficients = [], gateEnvelope = 0, gateGain = 1, compEnvelope = 0, deessEnvelope = 0, duckEnvelope = 0;
      const states = Array.from({ length: 6 }, () => new Float64Array(4)), deessState = new Float64Array(4), deessToneState = new Float64Array(4), deessShelf = new Float64Array(5), vowelStates = Array.from({ length: 3 }, () => new Float64Array(4));
      let deessCounter = 0, deessShelfDb = 0;
      let vowelCoefficients = [], trim = 1, makeup = 1, level = 1, ceiling = 1, drive = 1, driveNormalization = 1;
      let gateRelease = 1, gateAttack = 1, gateSmooth = 1, attack = 1, release = 1, deessAttack = 1, deessRelease = 1, duckAttack = 1, duckRelease = 1;
      let threshold = 0, gateFloor = 0, deessThreshold = 0, chopCoefficient = 1, reverbCoefficient = 1, delayCoefficient = 1;
      const pitchLength = Math.ceil(sr * 0.16) + 8, pitchBuffers = [new Float32Array(pitchLength), new Float32Array(pitchLength)], pitchPhases = new Float64Array([0.25, 0.31, 0.73]);
      const pitchRatios = new Float64Array([1, Math.pow(2, 7 / 12), 2]);
      let pitchWrite = 0, nominalWindow = 1, grainWindow = 1, targetWindow = 1, ratio = 1, targetRatio = 1, ratioSlew = 1, windowSlew = 1, shiftBase = sr * 0.004, seen = 0;
      const analysisStride = Math.max(1, Math.round(sr / 12000)), analysisRate = sr / analysisStride, analysisLength = 1024;
      const analysisBuffer = new Float64Array(analysisLength), analysisScratch = new Float64Array(768), differences = new Float64Array(256);
      const analysisSpan = 512, minLag = Math.max(2, Math.floor(analysisRate / 950)), maxLag = Math.min(250, Math.ceil(analysisRate / 65));
      let analysisWrite = 0, analysisSamples = 0, analysisDecimation = 0, analysisCounter = 0, analysisLow = 0, analysisLow2 = 0, lastDetected = 0;
      const analysisLP = lp(2500, sr), analysisInterval = Math.round(sr * 0.02);
      let doublePhase = 0, robotPhase = 0, carrierPhases = new Float64Array(3), carrierSteps = new Float64Array(3), carrierCount = 1;
      const vocoderFreqs = [100, 150, 220, 330, 470, 680, 1000, 1500, 2200, 3300, 4700, 6800];
      const vocoderCoefficients = vocoderFreqs.map(hz => biquad('bandpass', hz, 3.2, 0, sr)), vocoderInput = new Float64Array(24), vocoderCarrier = new Float64Array(24), vocoderEnvelopes = new Float64Array(12);
      const vocoderAttack = slew(1.8, sr), vocoderRelease = slew(65, sr);
      const delayLength = Math.ceil(sr * 2.6) + 8, delayBuffers = [new Float32Array(delayLength), new Float32Array(delayLength)], delayDamp = new Float64Array(2);
      let delayWrite = 0, delayFrames = sr * 0.375, delayTarget = delayFrames, delaySlew = 1 - slew(12, sr), delayPrimed = false;
      const preLength = Math.ceil(sr * 0.151) + 4, preBuffers = [new Float32Array(preLength), new Float32Array(preLength)]; let preWrite = 0;
      const combBase = [0.0297, 0.0371, 0.0411, 0.0437, 0.0309, 0.0383, 0.0423, 0.0449];
      const combLines = combBase.map(seconds => new Float32Array(Math.ceil(sr * seconds * 1.65) + 4)), combLengths = new Int32Array(8), combPositions = new Int32Array(8), combDamp = new Float64Array(8), combFeedback = new Float64Array(8);
      const apLengths = [Math.max(3, Math.round(sr * 0.0047)), Math.max(3, Math.round(sr * 0.0017)), Math.max(3, Math.round(sr * 0.0051)), Math.max(3, Math.round(sr * 0.0019))], apLines = apLengths.map(length => new Float32Array(length)), apPositions = new Int32Array(4);
      let chopPhase = 0, chopGain = 1, inputPeak = 0, outputPeak = 0, quietFrames = Infinity;
      const meter = { reductionDb: 0, deessDb: 0, gateReductionDb: 0, limiterReductionDb: 0, inputDb: -120, outputDb: -120, detectedHz: 0, confidence: 0, tuningCents: 0, pitchLatencyMs: 0, pitchMinLatencyMs: 0, pitchMaxLatencyMs: 0, coreLatencyMs: 0 };
      function update() {
        trim = db(p.input); makeup = db(p.makeup); level = db(p.output); ceiling = db(p.ceiling); drive = db(p.drive); driveNormalization = 1 / Math.pow(drive, 0.55);
        coefficients = [biquad('highpass', p.highpass, 0.707, 0, sr), biquad('peak', p.bodyFreq, 0.8, p.body, sr), biquad('peak', p.mudFreq, 0.95, p.mud, sr), biquad('peak', p.presenceFreq, 0.8, p.presence, sr), biquad('high', 8500, 0.707, p.air, sr)];
        coefficients[5] = biquad('highpass', 12, 0.707, 0, sr);
        deessCoefficient = biquad('highpass', p.deessFreq * 0.72, 0.707, 0, sr);
        biquad('high', p.deessFreq, 0.707, deessShelfDb, sr, deessShelf);
        gateRelease = slew(p.gateRelease, sr); gateAttack = slew(1, sr); gateSmooth = 1 - slew(0.5, sr); threshold = db(p.gate); gateFloor = db(-p.gateRange);
        attack = slew(p.attack, sr); release = slew(p.release, sr); deessAttack = slew(0.6, sr); deessRelease = slew(55, sr); deessThreshold = db(p.deessThreshold); duckAttack = slew(4, sr); duckRelease = slew(220, sr);
        ratioSlew = 1 - slew(2 + (1 - p.speed) * 170, sr); windowSlew = 1 - slew(25, sr);
        const nextWindow = sr * p.pitchWindow * 0.001;
        if (nextWindow !== nominalWindow) grainWindow = targetWindow = nominalWindow = nextWindow;
        pitchRatios[1] = Math.pow(2, p.harmonyA / 12); pitchRatios[2] = Math.pow(2, p.harmonyB / 12);
        if (p.pitch !== 'correct') targetRatio = Math.pow(2, (p.semitones + p.fine / 100) / 12);
        if (p.pitch === 'off') ratio = targetRatio = 1;
        const frequencies = vowels[p.vowel] || vowels.ah, formantRatio = Math.pow(2, p.formant / 12);
        vowelCoefficients = frequencies.map((hz, i) => biquad('bandpass', hz * formantRatio, [5, 7, 9][i], 0, sr));
        const chord = p.carrierChord === 'major' ? [0, 4, 7] : p.carrierChord === 'minor' ? [0, 3, 7] : p.carrierChord === 'fifth' ? [0, 7] : [0]; carrierCount = chord.length;
        for (let i = 0; i < carrierCount; i++) carrierSteps[i] = Math.min(0.35, 440 * Math.pow(2, (p.carrierNote + chord[i] - 69) / 12) / sr);
        delayCoefficient = lp(p.delayTone, sr); reverbCoefficient = lp(p.reverbTone, sr); chopCoefficient = 1 - slew(p.chopSmooth, sr);
        for (let i = 0; i < 8; i++) {
          const length = clamp(Math.round(sr * combBase[i] * (0.65 + p.reverbSize)), 3, combLines[i].length);
          if (combLengths[i] !== length) { combLines[i].fill(0); combPositions[i] = 0; combDamp[i] = 0; }
          combLengths[i] = length; combFeedback[i] = Math.exp(-6.907755 * length / (p.reverbDecay * sr));
        }
        updateLatency();
      }
      let deessCoefficient;
      function updateLatency() {
        const active = (p.pitch !== 'off' && p.pitchMix > 0) || (p.harmony === 'on' && p.harmonyMix > 0);
        meter.pitchMinLatencyMs = active ? 4 : 0;
        meter.pitchMaxLatencyMs = active ? 4 + grainWindow * 1000 / sr : 0;
        meter.pitchLatencyMs = active ? 4 + grainWindow * 500 / sr : 0;
      }
      function nearestNote(note) {
        const root = specifications.key.indexOf(p.key), allowed = scales[p.scale];
        let closest = note, distance = Infinity;
        for (let n = Math.floor(note) - 3; n <= Math.ceil(note) + 3; n++) {
          const pitchClass = ((n - root) % 12 + 12) % 12;
          if (allowed.includes(pitchClass) && Math.abs(n - note) < distance) { closest = n; distance = Math.abs(n - note); }
        }
        return closest;
      }
      // Downsampled YIN: a bounded 512-sample difference search every 20 ms.
      // Analysis uses past input only. It never inserts a delay into cleanup.
      function analyse() {
        if (analysisSamples < analysisSpan + maxLag) return;
        const count = analysisSpan + maxLag;
        let cursor = analysisWrite - count; if (cursor < 0) cursor += analysisLength;
        let energy = 0;
        for (let j = 0; j < count; j++) { const x = analysisBuffer[cursor]; analysisScratch[j] = x; if (j < analysisSpan) energy += x * x; if (++cursor === analysisLength) cursor = 0; }
        if (energy / analysisSpan < 1e-7) { meter.detectedHz = meter.confidence = 0; meter.tuningCents = 0; targetRatio = Math.pow(2, (p.semitones + p.fine / 100) / 12); return; }
        let sum = 0;
        differences[0] = 1;
        for (let lag = 1; lag <= maxLag; lag++) {
          let value = 0;
          for (let j = 0; j < analysisSpan; j++) { const delta = analysisScratch[j] - analysisScratch[j + lag]; value += delta * delta; }
          sum += value; differences[lag] = sum > 1e-16 ? value * lag / sum : 1;
        }
        let lag = 0, best = 1;
        for (let candidate = minLag; candidate < maxLag; candidate++) {
          if (differences[candidate] < best) { best = differences[candidate]; lag = candidate; }
          if (differences[candidate] < 0.15 && differences[candidate] <= differences[candidate - 1] && differences[candidate] < differences[candidate + 1]) { lag = candidate; best = differences[candidate]; break; }
        }
        if (!lag || best > 0.35) { meter.detectedHz = meter.confidence = 0; meter.tuningCents = 0; targetRatio = Math.pow(2, (p.semitones + p.fine / 100) / 12); return; }
        const before = differences[lag - 1], middle = differences[lag], after = differences[lag + 1], denominator = before - 2 * middle + after;
        const fraction = Math.abs(denominator) > 1e-12 ? clamp(0.5 * (before - after) / denominator, -0.5, 0.5) : 0;
        lastDetected = analysisRate / (lag + fraction); meter.detectedHz = lastDetected; meter.confidence = clamp(1 - best, 0, 1);
        const note = 69 + 12 * Math.log2(lastDetected / 440), correction = p.pitch === 'correct' ? (nearestNote(note) - note) * p.speed : 0;
        meter.tuningCents = correction * 100;
        targetRatio = Math.pow(2, (p.semitones + p.fine / 100 + correction) / 12);
        // A whole number of source periods between the two overlapping heads
        // avoids pulling a stable sung note to a grain-rate spectral sideband.
        const period = sr / lastDetected, periods = Math.floor(nominalWindow * 0.5 / period), aligned = 2 * periods * period;
        targetWindow = periods > 0 && aligned >= nominalWindow * 0.65 ? aligned : nominalWindow;
      }
      function shifted(buffer, phase, pitchRatio) {
        if (Math.abs(pitchRatio - 1) < 1e-6) return read(buffer, pitchWrite, shiftBase);
        const second = phase < 0.5 ? phase + 0.5 : phase - 0.5, sine = Math.sin(PI * phase), weight = sine * sine;
        const up = pitchRatio > 1;
        return read(buffer, pitchWrite, shiftBase + grainWindow * (up ? 1 - phase : phase)) * weight + read(buffer, pitchWrite, shiftBase + grainWindow * (up ? 1 - second : second)) * (1 - weight);
      }
      function carrierSample() {
        let value = 0;
        for (let i = 0; i < carrierCount; i++) {
          let phase = carrierPhases[i], step = carrierSteps[i], wave;
          if (p.carrier === 'saw') wave = 2 * phase - 1 - blep(phase, step);
          else { const duty = p.carrier === 'pulse' ? 0.24 : 0.5; wave = phase < duty ? 1 : -1; wave += blep(phase, step); let edge = phase - duty; if (edge < 0) edge += 1; wave -= blep(edge, step); }
          value += wave; phase += step; if (phase >= 1) phase -= 1; carrierPhases[i] = phase;
        }
        return value / Math.sqrt(carrierCount);
      }
      function run(left, right, context) {
        const tempo = clamp(finite(context && context.tempo, 120), 40, 300), chopBeats = divisions[p.chopDivision], chopStep = tempo / (60 * sr * chopBeats);
        const delaySeconds = p.delayClock === 'sync' ? divisions[p.delayDivision] * 60 / tempo : p.delayTime * 0.001;
        delayTarget = clamp(delaySeconds * sr, 1, delayLength - 3);
        if (!delayPrimed) { delayFrames = delayTarget; delayPrimed = true; }
        if (context && context.playing && Number.isFinite(context.beat)) { chopPhase = context.beat / chopBeats; chopPhase -= Math.floor(chopPhase); }
        const pitchActive = p.pitch !== 'off' || p.harmony === 'on', storePitch = pitchActive || p.doubler === 'on';
        const compStrength = 1 - 1 / p.ratio, doubleStep = 0.17 / sr, doubleDepth = (Math.pow(2, p.doubleDetune / 1200) - 1) * sr / (TAU * 0.17), doubleCenter = p.doubleTime * sr * 0.001;
        const doubleMaximum = Math.max(1, Math.min(doubleDepth, doubleCenter * 0.85)), duckStrength = 3;
        for (let i = 0; i < left.length; i++) {
          const dryL = bounded(left[i]), dryR = bounded(right[i]);
          const sourcePeak = Math.max(Math.abs(dryL), Math.abs(dryR)); inputPeak = Math.max(sourcePeak, inputPeak * 0.9995);
          if (sourcePeak > 1e-7) quietFrames = 0; else quietFrames++;
          let wetL = dryL * trim, wetR = dryR * trim;
          if (p.clean === 'on') {
            wetL = filter(wetL, coefficients[0], states[0], 0); wetR = filter(wetR, coefficients[0], states[0], 2);
            const peak = Math.max(Math.abs(wetL), Math.abs(wetR)), smoothing = peak > gateEnvelope ? gateAttack : gateRelease;
            gateEnvelope = smoothing * gateEnvelope + (1 - smoothing) * peak;
            const open = clamp((gateEnvelope - threshold * 0.45) / (threshold * 0.55 + 1e-15), 0, 1), gain = gateFloor + (1 - gateFloor) * open * open;
            gateGain += gateSmooth * (gain - gateGain); wetL *= gateGain; wetR *= gateGain;
            meter.gateReductionDb = -20 * Math.log10(Math.max(gateGain, 1e-6));
          } else meter.gateReductionDb = 0;
          if (p.deess === 'on' && p.deessAmount > 0) {
            const sL = filter(wetL, deessCoefficient, deessState, 0), sR = filter(wetR, deessCoefficient, deessState, 2), peak = Math.max(Math.abs(sL), Math.abs(sR));
            const smoothing = peak > deessEnvelope ? deessAttack : deessRelease; deessEnvelope = smoothing * deessEnvelope + (1 - smoothing) * peak;
            const excess = Math.max(0, 1 - deessThreshold / Math.max(deessEnvelope, 1e-12)), attenuation = clamp(excess * p.deessAmount, 0, 0.96);
            meter.deessDb = -20 * Math.log10(Math.max(1 - attenuation, 0.001));
            if (++deessCounter >= 32) {
              deessCounter = 0;
              if (Math.abs(deessShelfDb + meter.deessDb) > 0.1) { deessShelfDb = -meter.deessDb; biquad('high', p.deessFreq, 0.707, deessShelfDb, sr, deessShelf); }
            }
            wetL = filter(wetL, deessShelf, deessToneState, 0); wetR = filter(wetR, deessShelf, deessToneState, 2);
          } else meter.deessDb = 0;
          if (p.compressor === 'on') {
            const peak = Math.max(Math.abs(wetL), Math.abs(wetR)), smoothing = peak > compEnvelope ? attack : release;
            compEnvelope = smoothing * compEnvelope + (1 - smoothing) * peak;
            const over = 20 * Math.log10(Math.max(compEnvelope, 1e-12)) - p.threshold;
            const reduction = over < -3 ? 0 : over < 3 ? compStrength * (over + 3) * (over + 3) / 12 : compStrength * over;
            const gain = db(-reduction) * makeup; wetL *= gain; wetR *= gain; meter.reductionDb = reduction;
          } else meter.reductionDb = 0;
          if (p.eq === 'on') for (let band = 1; band <= 4; band++) { wetL = filter(wetL, coefficients[band], states[band], 0); wetR = filter(wetR, coefficients[band], states[band], 2); }
          if (p.saturation !== 'off' && p.satMix > 0) {
            const xL = wetL * drive, xR = wetR * drive;
            let sL, sR;
            if (p.saturation === 'fold') { sL = Math.asin(Math.sin(xL * PI * 0.5)) * 2 / PI; sR = Math.asin(Math.sin(xR * PI * 0.5)) * 2 / PI; }
            else if (p.saturation === 'edge') { sL = xL >= 0 ? soft(xL) : soft(xL * 1.6) / 1.6; sR = xR >= 0 ? soft(xR) : soft(xR * 1.6) / 1.6; }
            else { sL = soft(xL); sR = soft(xR); }
            wetL += (sL * driveNormalization - wetL) * p.satMix; wetR += (sR * driveNormalization - wetR) * p.satMix;
            wetL = filter(wetL, coefficients[5], states[5], 0); wetR = filter(wetR, coefficients[5], states[5], 2);
          }
          if (storePitch) {
            pitchBuffers[0][pitchWrite] = bounded(wetL); pitchBuffers[1][pitchWrite] = bounded(wetR); seen++;
            if (pitchActive) {
              analysisLow += analysisLP * ((wetL + wetR) * 0.5 - analysisLow); analysisLow2 += analysisLP * (analysisLow - analysisLow2);
              if (++analysisDecimation >= analysisStride) { analysisDecimation = 0; analysisBuffer[analysisWrite] = analysisLow2; if (++analysisWrite === analysisLength) analysisWrite = 0; analysisSamples++; }
              if (++analysisCounter >= analysisInterval) { analysisCounter = 0; analyse(); }
              grainWindow += windowSlew * (targetWindow - grainWindow); ratio += ratioSlew * (targetRatio - ratio); pitchRatios[0] = ratio;
              if (p.pitch !== 'off') { const sL = shifted(pitchBuffers[0], pitchPhases[0], ratio), sR = shifted(pitchBuffers[1], pitchPhases[0], ratio); wetL += (sL - wetL) * p.pitchMix; wetR += (sR - wetR) * p.pitchMix; }
              if (p.harmony === 'on' && p.harmonyMix > 0) {
                const aL = shifted(pitchBuffers[0], pitchPhases[1], pitchRatios[1]), aR = shifted(pitchBuffers[1], pitchPhases[1], pitchRatios[1]), bL = shifted(pitchBuffers[0], pitchPhases[2], pitchRatios[2]), bR = shifted(pitchBuffers[1], pitchPhases[2], pitchRatios[2]);
                const midA = (aL + aR) * 0.5, midB = (bL + bR) * 0.5, pan = p.harmonyWidth;
                wetL = wetL * (1 - p.harmonyMix * 0.45) + p.harmonyMix * 0.6 * (midA * (1 + pan) + midB * (1 - pan));
                wetR = wetR * (1 - p.harmonyMix * 0.45) + p.harmonyMix * 0.6 * (midA * (1 - pan) + midB * (1 + pan));
              }
              for (let voice = 0; voice < 3; voice++) { pitchPhases[voice] += Math.abs(1 - pitchRatios[voice]) / grainWindow; if (pitchPhases[voice] >= 1) pitchPhases[voice] -= Math.floor(pitchPhases[voice]); }
            }
            if (p.doubler === 'on' && p.doubleAmount > 0) {
              const motion = Math.sin(TAU * doublePhase), dL = read(pitchBuffers[0], pitchWrite, doubleCenter + motion * doubleMaximum), dR = read(pitchBuffers[1], pitchWrite, doubleCenter - motion * doubleMaximum);
              const mid = (dL + dR) * 0.5, side = (dL - dR) * 0.5 * p.doubleSpread;
              wetL += p.doubleAmount * 0.7 * (mid + side); wetR += p.doubleAmount * 0.7 * (mid - side); doublePhase += doubleStep; if (doublePhase >= 1) doublePhase -= 1;
            }
            if (++pitchWrite === pitchLength) pitchWrite = 0;
          }
          if (p.vowel !== 'off' && p.vowelMix > 0) {
            let vL = 0, vR = 0;
            for (let band = 0; band < 3; band++) { const gain = band === 0 ? 1.7 : band === 1 ? 1.3 : 0.9; vL += filter(wetL, vowelCoefficients[band], vowelStates[band], 0) * gain; vR += filter(wetR, vowelCoefficients[band], vowelStates[band], 2) * gain; }
            wetL += (vL - wetL) * p.vowelMix; wetR += (vR - wetR) * p.vowelMix;
          }
          if (p.robot === 'ring') {
            const carrier = Math.sin(TAU * robotPhase); wetL += (wetL * carrier - wetL) * p.robotMix; wetR += (wetR * carrier - wetR) * p.robotMix;
            robotPhase += p.robotFreq / sr; if (robotPhase >= 1) robotPhase -= 1;
          } else if (p.robot === 'vocoder') {
            const carrier = carrierSample(), mono = (wetL + wetR) * 0.5; let voice = 0;
            for (let band = 0; band < 12; band++) {
              const detected = Math.abs(filter(mono, vocoderCoefficients[band], vocoderInput, band * 2)), smoothing = detected > vocoderEnvelopes[band] ? vocoderAttack : vocoderRelease;
              vocoderEnvelopes[band] = smoothing * vocoderEnvelopes[band] + (1 - smoothing) * detected;
              voice += filter(carrier, vocoderCoefficients[band], vocoderCarrier, band * 2) * vocoderEnvelopes[band] * 10;
            }
            wetL += (voice - wetL) * p.robotMix; wetR += (voice - wetR) * p.robotMix;
          }
          if (p.chop === 'on' && p.chopDepth > 0) {
            const goal = 1 - p.chopDepth + p.chopDepth * (chopPhase < p.chopDuty ? 1 : 0); chopGain += chopCoefficient * (goal - chopGain); wetL *= chopGain; wetR *= chopGain;
            chopPhase += chopStep; if (chopPhase >= 1) chopPhase -= 1;
          }
          const peak = Math.max(Math.abs(wetL), Math.abs(wetR)), duckSmoothing = peak > duckEnvelope ? duckAttack : duckRelease;
          duckEnvelope = duckSmoothing * duckEnvelope + (1 - duckSmoothing) * peak;
          if (p.delay === 'on') {
            delayFrames += delaySlew * (delayTarget - delayFrames);
            const echoL = read(delayBuffers[0], delayWrite, delayFrames), echoR = read(delayBuffers[1], delayWrite, delayFrames), cross = p.delayWidth;
            delayDamp[0] += delayCoefficient * (echoL - delayDamp[0]); delayDamp[1] += delayCoefficient * (echoR - delayDamp[1]);
            delayBuffers[0][delayWrite] = bounded(wetL + p.delayFeedback * (delayDamp[0] * (1 - cross) + delayDamp[1] * cross)); delayBuffers[1][delayWrite] = bounded(wetR + p.delayFeedback * (delayDamp[1] * (1 - cross) + delayDamp[0] * cross));
            const duck = 1 / (1 + p.delayDuck * duckStrength * duckEnvelope); wetL += echoL * p.delayMix * duck; wetR += echoR * p.delayMix * duck;
            if (++delayWrite === delayLength) delayWrite = 0;
          }
          if (p.reverb === 'on') {
            preBuffers[0][preWrite] = bounded(wetL); preBuffers[1][preWrite] = bounded(wetR);
            const preDelay = p.predelay * sr * 0.001, preL = read(preBuffers[0], preWrite, preDelay), preR = read(preBuffers[1], preWrite, preDelay);
            if (++preWrite === preLength) preWrite = 0;
            let roomL = 0, roomR = 0;
            for (let line = 0; line < 8; line++) {
              const value = combLines[line][combPositions[line]]; combDamp[line] += reverbCoefficient * (value - combDamp[line]);
              combLines[line][combPositions[line]] = bounded((line < 4 ? preL : preR) * 0.25 + combDamp[line] * combFeedback[line]);
              if (line < 4) roomL += value; else roomR += value;
              if (++combPositions[line] === combLengths[line]) combPositions[line] = 0;
            }
            for (let line = 0; line < 4; line++) {
              const incoming = line < 2 ? roomL : roomR, delayed = apLines[line][apPositions[line]], next = delayed - incoming * 0.55;
              apLines[line][apPositions[line]] = bounded(incoming + next * 0.55); if (++apPositions[line] === apLengths[line]) apPositions[line] = 0;
              if (line < 2) roomL = next; else roomR = next;
            }
            const mid = (roomL + roomR) * 0.5, side = (roomL - roomR) * 0.5 * p.reverbWidth, duck = 1 / (1 + p.reverbDuck * duckStrength * duckEnvelope);
            wetL += (mid + side) * p.reverbMix * duck; wetR += (mid - side) * p.reverbMix * duck;
          }
          wetL = bounded(wetL * level); wetR = bounded(wetR * level);
          const beforeGuard = Math.max(Math.abs(wetL), Math.abs(wetR));
          if (p.guard === 'on') { wetL = clamp(wetL, -ceiling, ceiling); wetR = clamp(wetR, -ceiling, ceiling); }
          const resultL = dryL + (wetL - dryL) * p.mix, resultR = dryR + (wetR - dryR) * p.mix;
          const guardReduction = p.guard === 'on' && beforeGuard > ceiling ? 20 * Math.log10(beforeGuard / ceiling) : 0;
          meter.limiterReductionDb = p.guard === 'on' ? Math.max(guardReduction, meter.limiterReductionDb * 0.9998) : 0;
          left[i] = bounded(resultL); right[i] = bounded(resultR); outputPeak = Math.max(Math.abs(left[i]), Math.abs(right[i]), outputPeak * 0.9995);
        }
        meter.inputDb = Math.max(-120, 20 * Math.log10(Math.max(inputPeak, 1e-6))); meter.outputDb = Math.max(-120, 20 * Math.log10(Math.max(outputPeak, 1e-6))); updateLatency();
      }
      function reset() {
        states.forEach(state => state.fill(0)); deessState.fill(0); deessToneState.fill(0); deessCounter = 0; deessShelfDb = 0; biquad('high', p.deessFreq, 0.707, 0, sr, deessShelf); vowelStates.forEach(state => state.fill(0));
        pitchBuffers.forEach(buffer => buffer.fill(0)); pitchWrite = 0; pitchPhases.set([0.25, 0.31, 0.73]); grainWindow = targetWindow = nominalWindow; ratio = targetRatio = Math.pow(2, (p.semitones + p.fine / 100) / 12);
        analysisBuffer.fill(0); analysisScratch.fill(0); differences.fill(0); analysisWrite = analysisSamples = analysisDecimation = analysisCounter = analysisLow = analysisLow2 = lastDetected = seen = 0;
        gateEnvelope = compEnvelope = deessEnvelope = duckEnvelope = 0; gateGain = 1; doublePhase = robotPhase = chopPhase = 0; chopGain = 1; carrierPhases.fill(0);
        vocoderInput.fill(0); vocoderCarrier.fill(0); vocoderEnvelopes.fill(0); delayBuffers.forEach(buffer => buffer.fill(0)); delayDamp.fill(0); delayWrite = 0; delayFrames = p.delayTime * sr * 0.001; delayPrimed = false;
        preBuffers.forEach(buffer => buffer.fill(0)); preWrite = 0; combLines.forEach(buffer => buffer.fill(0)); combDamp.fill(0); combPositions.fill(0); apLines.forEach(buffer => buffer.fill(0)); apPositions.fill(0);
        inputPeak = outputPeak = 0; quietFrames = Infinity;
        for (const key of Object.keys(meter)) meter[key] = key === 'inputDb' || key === 'outputDb' ? -120 : 0;
        updateLatency();
      }
      function setParams(next) {
        const old = p; p = normalize(Object.assign({}, p, next && typeof next === 'object' ? next : {}));
        const oldPitch = old.pitch !== 'off' || old.harmony === 'on', newPitch = p.pitch !== 'off' || p.harmony === 'on';
        if (!newPitch) meter.detectedHz = meter.confidence = meter.tuningCents = 0;
        if (!oldPitch && newPitch) { analysisWrite = analysisSamples = analysisDecimation = analysisCounter = analysisLow = analysisLow2 = 0; analysisBuffer.fill(0); meter.detectedHz = meter.confidence = meter.tuningCents = 0; }
        if (!(oldPitch || old.doubler === 'on') && (newPitch || p.doubler === 'on')) { pitchBuffers.forEach(buffer => buffer.fill(0)); pitchWrite = 0; pitchPhases.set([0.25, 0.31, 0.73]); }
        if (old.delay !== p.delay) { delayBuffers.forEach(buffer => buffer.fill(0)); delayDamp.fill(0); delayWrite = 0; delayPrimed = false; }
        if (old.reverb !== p.reverb) { combLines.forEach(buffer => buffer.fill(0)); combDamp.fill(0); combPositions.fill(0); apLines.forEach(buffer => buffer.fill(0)); apPositions.fill(0); preBuffers.forEach(buffer => buffer.fill(0)); preWrite = 0; }
        if (old.robot !== p.robot) { vocoderInput.fill(0); vocoderCarrier.fill(0); vocoderEnvelopes.fill(0); carrierPhases.fill(0); robotPhase = 0; }
        update();
      }
      function getTailTime(context) {
        if (p.bypass) return 0;
        let seconds = 0.05;
        if ((p.pitch !== 'off' && p.pitchMix > 0) || (p.harmony === 'on' && p.harmonyMix > 0)) seconds = Math.max(seconds, 0.004 + p.pitchWindow * 0.001);
        if (p.doubler === 'on' && p.doubleAmount > 0) seconds = Math.max(seconds, p.doubleTime * 0.002);
        if (p.delay === 'on' && p.delayMix > 0) {
          const tempo = clamp(finite(context && context.tempo, 120), 40, 300), time = p.delayClock === 'sync' ? Math.min(2.6, divisions[p.delayDivision] * 60 / tempo) : p.delayTime * 0.001;
          seconds = Math.max(seconds, time * (1 + Math.log(0.001) / Math.log(Math.max(0.001, p.delayFeedback))));
        }
        if (p.reverb === 'on' && p.reverbMix > 0) seconds += p.predelay * 0.001 + p.reverbDecay + 0.15;
        if (p.robot === 'vocoder') seconds = Math.max(seconds, 0.5);
        return Math.min(60, seconds);
      }
      update();
      const insert = {
        setParams, set: setParams,
        setParam(key, value) { setParams({ [key]: value }); },
        process(left, right, context) {
          if (!left || !right || left.length !== right.length) throw new Error('GLAZE requires equal stereo blocks.');
          if (p.bypass) { for (let i = 0; i < left.length; i++) { left[i] = bounded(left[i]); right[i] = bounded(right[i]); } return; }
          run(left, right, context || null);
        }, reset, getTailTime, getMeters() { return Object.assign({}, meter); }, getParams() { return Object.assign({}, p); },
        getLatency() { return { directMs: 0, pitchMs: meter.pitchLatencyMs, pitchMinMs: meter.pitchMinLatencyMs, pitchMaxMs: meter.pitchMaxLatencyMs, trackingResponseMs: p.pitch === 'correct' ? (analysisSpan + maxLag) * 1000 / analysisRate + 20 : 0 }; },
        get params() { return Object.assign({}, p); }
      };
      return insert;
    }
    return { specifications, normalize, create };
  }
  scope.createLoomVocalDSP = createLoomVocalDSP;
})(typeof window === 'undefined' ? globalThis : window);
