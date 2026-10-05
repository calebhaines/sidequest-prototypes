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
      tremor: { division: ['1/8', '1/32', '1/16', '1/8.', '1/4', '1/4.', '1/2', '1', '2'], shape: ['sine', 'triangle', 'gate', 'pulse'], depth: [0, 1, 0.65], pan: [0, 1, 0.5], duty: [0.05, 0.95, 0.5], phase: [0, 360, 0], smooth: [0, 80, 4], mix: [0, 1, 1] },
      broiler: { model: ['clean-bass', 'flip-top', 'valve-stack', 'modern-grind', 'doom-fuzz', 'american-clean', 'british-crunch', 'high-gain'], input: [-18, 24, 0], drive: [0, 36, 6], cleanLow: [0, 1, 0.35], crossover: [50, 500, 150], bass: [-15, 15, 2], mid: [-18, 18, -1], midFreq: [80, 2500, 550], treble: [-15, 15, 0], presence: [0, 1, 0.35], depth: [0, 1, 0.4], master: [0, 1, 0.45], sag: [0, 1, 0.3], gate: [-90, -20, -75], gateRelease: [20, 800, 160], cabinet: ['bass410', 'di', 'bass15', 'bass810', 'guitar112open', 'guitar212', 'guitar412', 'metalbox'], speakerDrive: [0, 1, 0.2], mic: [0, 1, 0.45], distance: [0, 1, 0.15], air: [0, 1, 0.3], stereo: ['stereo', 'mono'], output: [-24, 12, -4], mix: [0, 1, 1] }
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
      let update, run, reset, fastSet, tail = () => 0;
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
      } else if (type === 'broiler') {
        // Character models, rather than claims of circuit-exact brand emulation.
        // Nonlinear preamp, power and speaker stages all run at 4x the host rate.
        // Each channel has its own state; stereo input never leaks across channels.
        const models = {
          'clean-bass': { stages: 1, gain: 0.85, next: 1, bias: 0, cut: 18, inter: 11500, coupling: 8, shape: 'soft', level: 1.15, power: 0.8, powerBias: 0, bass: 0, mid: 0, midFreq: 650, treble: 0 },
          'flip-top': { stages: 2, gain: 1.05, next: 1.35, bias: 0.15, cut: 24, inter: 6200, coupling: 16, shape: 'valve', level: 0.95, power: 1.05, powerBias: 0.08, bass: 2, mid: 1.5, midFreq: 360, treble: -2 },
          'valve-stack': { stages: 3, gain: 1.1, next: 1.2, bias: 0.1, cut: 22, inter: 7900, coupling: 22, shape: 'valve', level: 0.83, power: 1.2, powerBias: 0.05, bass: 1, mid: 1.5, midFreq: 720, treble: 0 },
          'modern-grind': { stages: 3, gain: 1.45, next: 1.35, bias: -0.04, cut: 38, inter: 10200, coupling: 38, shape: 'diode', level: 0.77, power: 0.95, powerBias: 0, bass: -1, mid: -2.5, midFreq: 470, treble: 2 },
          'doom-fuzz': { stages: 2, gain: 1.8, next: 1.5, bias: 0.22, cut: 20, inter: 5300, coupling: 12, shape: 'fuzz', level: 0.67, power: 1.4, powerBias: 0.12, bass: 3, mid: 2, midFreq: 300, treble: -3 },
          'american-clean': { stages: 1, gain: 0.9, next: 1, bias: 0.04, cut: 50, inter: 12200, coupling: 25, shape: 'valve', level: 1.18, power: 0.8, powerBias: 0.02, bass: 0, mid: -3, midFreq: 650, treble: 3 },
          'british-crunch': { stages: 3, gain: 1.35, next: 1.2, bias: 0.13, cut: 60, inter: 8800, coupling: 48, shape: 'valve', level: 0.84, power: 1.2, powerBias: 0.1, bass: -1, mid: 3.5, midFreq: 980, treble: 1 },
          'high-gain': { stages: 4, gain: 1.65, next: 1.5, bias: -0.025, cut: 85, inter: 9600, coupling: 70, shape: 'diode', level: 0.7, power: 1.05, powerBias: 0.01, bass: 0, mid: -2.5, midFreq: 620, treble: 2 }
        };
        const cabinets = {
          di: null,
          bass15: { cut: 30, resonance: 72, bump: 4.5, notch: 640, scoop: -2, upper: 1850, bite: 1, roll: 4300, reflection: 1.35, polarity: -1, damping: 0.25 },
          bass410: { cut: 38, resonance: 94, bump: 3, notch: 380, scoop: -2.5, upper: 2350, bite: 2.5, roll: 6800, reflection: 0.75, polarity: 1, damping: 0.13 },
          bass810: { cut: 33, resonance: 85, bump: 4, notch: 460, scoop: -1.5, upper: 1900, bite: 2.2, roll: 5600, reflection: 1.65, polarity: -1, damping: 0.2 },
          guitar112open: { cut: 74, resonance: 125, bump: 2, notch: 500, scoop: -3.5, upper: 2450, bite: 3.5, roll: 6200, reflection: 0.63, polarity: 1, damping: 0.13 },
          guitar212: { cut: 67, resonance: 118, bump: 3, notch: 650, scoop: -2, upper: 2800, bite: 4, roll: 5500, reflection: 1.1, polarity: -1, damping: 0.18 },
          guitar412: { cut: 63, resonance: 104, bump: 4.5, notch: 530, scoop: -3, upper: 2400, bite: 4.5, roll: 4900, reflection: 1.55, polarity: -1, damping: 0.21 },
          metalbox: { cut: 80, resonance: 180, bump: 5, notch: 750, scoop: -5, upper: 1450, bite: 6.5, roll: 3800, reflection: 2.35, polarity: 1, damping: 0.45 }
        };
        const states = Array.from({ length: 15 }, () => new Float64Array(4));
        const previous = new Float64Array(2), interLP = new Float64Array(8), couplingPrevious = new Float64Array(8), couplingOut = new Float64Array(8), antiAlias = new Float64Array(8);
        const sagEnvelope = new Float64Array(2), gateEnvelope = new Float64Array(2), gateGain = new Float64Array(2), dcPrevious = new Float64Array(2), dcOut = new Float64Array(2);
        const reflectionLength = Math.ceil(sr * 0.009) + 4, reflections = [new Float32Array(reflectionLength), new Float32Array(reflectionLength)];
        // Fourth-order Butterworth low-pass before decimation. The oversampled
        // Nyquist is four times higher; remove those newly generated harmonics
        // before returning to host rate rather than relying on cabinet roll-off.
        const decimationFilters = [biquad('lowpass', sr * 0.37, 0.5411961, 0, sr * 4), biquad('lowpass', sr * 0.37, 1.306563, 0, sr * 4)];
        const decimated = new Float64Array(2), dcCoefficient = Math.exp(-TAU * 12 / sr), sagAttack = Math.exp(-1 / (sr * 0.004)), gateSmooth = 1 - Math.exp(-1 / (sr * 0.00035));
        let model, cabinet, coefficients = [], crossoverCoefficient, cabCoefficients = [], modelKey = '', toneKey = '', cabKey = '', crossKey = -1;
        let lastInput, lastDrive, driveModel = '', lastMaster, powerModel = '', lastSpeaker, speakerCabinet, lastOutput, lastSag, lastGate, lastRelease, wasMono = false, quietFrames = Infinity;
        let trim = 1, preGain = 1, preNormalization = 1, interCoefficient = 1, couplingCoefficient = 1, powerGain = 1, powerNormalization = 1, powerZero = 0, level = 1, sagRelease = 1, gateRelease = 1, gateThreshold = 0, reflectionDelay = 1, reflectionAmount = 0, reflectionPosition = 0, speakerGain = 1, speakerNormalization = 1;
        const biasZeros = new Float64Array(4);
        function ampBound(value) { return value > 8 ? 8 : value < -8 ? -8 : value === value ? value : 0; }
        function ampFilter(value, coefficients, state, offset) {
          const result = ampBound(coefficients[0] * value + state[offset]);
          state[offset] = ampBound(coefficients[1] * value - coefficients[3] * result + state[offset + 1]);
          state[offset + 1] = ampBound(coefficients[2] * value - coefficients[4] * result);
          return result;
        }
        // A bounded, smooth rational valve curve avoids dozens of transcendental
        // calls per sample when many tracks use the amp at the same time.
        function saturate(value) { if (value >= 3) return 1; if (value <= -3) return -1; const square = value * value; return value * (27 + square) / (27 + 9 * square); }
        function nonlinear(value, bias, stage) {
          if (model.shape === 'fuzz') return value / (0.14 + Math.abs(value));
          if (model.shape === 'diode') return value >= 0 ? saturate(value) : saturate(value * 1.35) / 1.35;
          return saturate(value + bias) - biasZeros[stage];
        }
        update = () => {
          model = models[p.model]; cabinet = cabinets[p.cabinet];
          if (lastInput !== p.input) { lastInput = p.input; trim = db(p.input); }
          if (lastDrive !== p.drive || driveModel !== p.model) { lastDrive = p.drive; driveModel = p.model; preGain = db(p.drive * (p.model === 'clean-bass' || p.model === 'american-clean' ? 0.7 : 0.85)) * model.gain; preNormalization = model.level * Math.pow(preGain, -0.19); }
          if (lastMaster !== p.master || powerModel !== p.model) { lastMaster = p.master; powerModel = p.model; powerGain = model.power * (1 + 3.5 * p.master); powerNormalization = 1 / Math.pow(powerGain, 0.55); powerZero = saturate(model.powerBias); }
          if (lastSpeaker !== p.speakerDrive || speakerCabinet !== !!cabinet) { lastSpeaker = p.speakerDrive; speakerCabinet = !!cabinet; speakerGain = cabinet ? 1 + p.speakerDrive * 1.8 : 1; speakerNormalization = 1 / Math.pow(speakerGain, 0.7); }
          if (lastOutput !== p.output) { lastOutput = p.output; level = db(p.output); }
          if (lastSag !== p.sag) { lastSag = p.sag; sagRelease = Math.exp(-1 / (sr * (0.06 + p.sag * 0.24))); }
          if (lastRelease !== p.gateRelease) { lastRelease = p.gateRelease; gateRelease = Math.exp(-1 / (sr * p.gateRelease * 0.001)); }
          if (lastGate !== p.gate) { lastGate = p.gate; gateThreshold = db(p.gate); }
          if (modelKey !== p.model) { modelKey = p.model; coefficients[0] = biquad('highpass', model.cut, 0.707, 0, sr); interCoefficient = lowpass(model.inter, sr * 4); couplingCoefficient = Math.exp(-TAU * model.coupling / (sr * 4)); for (let stage = 0; stage < 4; stage++) biasZeros[stage] = saturate(model.bias * (stage & 1 ? -0.7 : 1)); }
          const nextTone = [p.model, p.bass, p.mid, p.midFreq, p.treble, p.presence, p.depth].join('|');
          if (nextTone !== toneKey) {
            toneKey = nextTone;
            coefficients[1] = biquad('low', 110, 0.707, p.bass + model.bass, sr);
            coefficients[2] = biquad('peak', model.midFreq, 0.7, model.mid, sr);
            coefficients[3] = biquad('peak', p.midFreq, 0.8, p.mid, sr);
            coefficients[4] = biquad('high', 2800, 0.707, p.treble + model.treble, sr);
            coefficients[5] = biquad('high', 3400, 0.707, -2 + p.presence * 9, sr);
            coefficients[6] = biquad('low', 65, 0.707, p.depth * 7, sr);
          }
          if (crossKey !== p.crossover) { crossKey = p.crossover; crossoverCoefficient = biquad('lowpass', p.crossover, 0.707, 0, sr); }
          const nextCab = [p.cabinet, p.mic, p.distance, p.air].join('|');
          if (nextCab !== cabKey) {
            cabKey = nextCab;
            if (cabinet) {
              const roll = cabinet.roll * (0.65 + p.mic * 0.5) * (1 - p.distance * 0.22);
              cabCoefficients = [biquad('highpass', cabinet.cut, 0.707, 0, sr), biquad('peak', cabinet.resonance, 1.1, cabinet.bump, sr), biquad('peak', cabinet.notch, 0.85, cabinet.scoop, sr), biquad('peak', cabinet.upper, 0.9, cabinet.bite * (0.35 + p.mic * 0.65), sr), biquad('lowpass', roll, 0.62, 0, sr), biquad('high', 5000, 0.707, -3 + p.air * 9, sr)];
              reflectionDelay = clamp(sr * (cabinet.reflection + p.distance * 3.5) * 0.001, 1, reflectionLength - 3);
              reflectionAmount = cabinet.damping * (0.35 + p.distance * 0.65) * cabinet.polarity;
            }
          }
        };
        fastSet = next => {
          if (!next || typeof next !== 'object') return;
          let changed = false;
          for (const key of Object.keys(next)) {
            if (key !== 'bypass' && !Object.prototype.hasOwnProperty.call(specifications.broiler, key)) continue;
            const rule = specifications.broiler[key]; let value;
            if (key === 'bypass') value = next.bypass === true;
            else if (!rule) continue;
            else if (typeof rule[0] === 'number') { value = typeof next[key] === 'number' && Number.isFinite(next[key]) ? next[key] : rule[2]; value = value < rule[0] ? rule[0] : value > rule[1] ? rule[1] : value; }
            else value = rule.includes(next[key]) ? next[key] : rule[0];
            if (p[key] !== value) { p[key] = value; changed = true; }
          }
          if (changed) update();
        };
        function channelSample(dry, channel) {
          const offset = channel * 4, stateOffset = channel * 2, trimmed = ampBound(dry * trim), peak = Math.abs(trimmed);
          gateEnvelope[channel] = peak > gateEnvelope[channel] ? peak : gateEnvelope[channel] * gateRelease;
          const open = clamp((gateEnvelope[channel] / gateThreshold - 0.5), 0, 1);
          gateGain[channel] += gateSmooth * (open - gateGain[channel]);
          const envelopeCoefficient = peak > sagEnvelope[channel] ? sagAttack : sagRelease;
          sagEnvelope[channel] = envelopeCoefficient * sagEnvelope[channel] + (1 - envelopeCoefficient) * peak;
          const supply = 1 / (1 + p.sag * sagEnvelope[channel] * 1.8);
          const head = ampFilter(trimmed, coefficients[0], states[0], stateOffset), prior = previous[channel];
          for (let sub = 1; sub <= 4; sub++) {
            let value = (prior + (head - prior) * sub * 0.25) * preGain;
            for (let stage = 0; stage < model.stages; stage++) {
              const index = offset + stage, gain = stage ? model.next : 1;
              value = nonlinear(value * gain, model.bias * (stage & 1 ? -0.7 : 1), stage);
              interLP[index] += interCoefficient * (value - interLP[index]); value = interLP[index];
              couplingOut[index] = value - couplingPrevious[index] + couplingCoefficient * couplingOut[index]; couplingPrevious[index] = value; value = couplingOut[index];
            }
            value *= preNormalization;
            value = (saturate(value * powerGain * supply + model.powerBias) - powerZero) * powerNormalization;
            if (cabinet && p.speakerDrive > 0) value = saturate(value * speakerGain) * speakerNormalization;
            value = ampFilter(value, decimationFilters[0], antiAlias, offset);
            value = ampFilter(value, decimationFilters[1], antiAlias, offset + 2);
            decimated[channel] = value;
          }
          previous[channel] = head;
          let wet = decimated[channel];
          if (cabinet) {
            for (let b = 0; b < cabCoefficients.length; b++) wet = ampFilter(wet, cabCoefficients[b], states[7 + b], stateOffset);
            reflections[channel][reflectionPosition] = wet;
            wet = (wet + read(reflections[channel], reflectionPosition, reflectionDelay) * reflectionAmount + read(reflections[channel], reflectionPosition, reflectionDelay * 0.53) * reflectionAmount * 0.37) / (1 + Math.abs(reflectionAmount) * 0.3);
          }
          // Replace only the amp's low band, so blending clean lows never reduces
          // upper-band drive and a bass cabinet cannot swallow the fundamental.
          const cleanBand = ampFilter(trimmed, crossoverCoefficient, states[13], stateOffset);
          const ampBand = ampFilter(wet, crossoverCoefficient, states[14], stateOffset);
          wet += p.cleanLow * (cleanBand - ampBand);
          for (let b = 1; b < coefficients.length; b++) wet = ampFilter(wet, coefficients[b], states[b], stateOffset);
          const dc = ampBound(wet - dcPrevious[channel] + dcCoefficient * dcOut[channel]); dcPrevious[channel] = wet; dcOut[channel] = dc;
          // The safety ceiling stays perfectly linear at normal musical levels,
          // so it does not introduce new host-rate distortion after oversampling.
          const magnitude = Math.abs(dc), ceiling = magnitude <= 2.5 ? dc : (dc < 0 ? -1 : 1) * (2.5 + 0.75 * saturate((magnitude - 2.5) / 0.75));
          return ampBound(ceiling * level * gateGain[channel]);
        }
        function synchronizeMonoState() {
          for (const state of states) { state[2] = state[0]; state[3] = state[1]; }
          for (const state of [interLP, couplingPrevious, couplingOut, antiAlias]) for (let i = 0; i < 4; i++) state[4 + i] = state[i];
          for (const state of [previous, decimated, sagEnvelope, gateEnvelope, gateGain, dcPrevious, dcOut]) state[1] = state[0];
          reflections[1].set(reflections[0]);
        }
        run = (left, right) => {
          const mix = p.mix;
          const monoInput = p.stereo === 'mono';
          if (wasMono && !monoInput) synchronizeMonoState();
          wasMono = monoInput;
          // An empty, settled amp has no oscillator or independent modulation.
          // Skip genuinely silent racks after a conservative one-second decay.
          let silent = true;
          for (let i = 0; i < left.length; i++) if (left[i] !== 0 || right[i] !== 0) { silent = false; break; }
          if (silent && quietFrames === Infinity) { left.fill(0); right.fill(0); return; }
          for (let i = 0; i < left.length; i++) {
            const dryL = input(left[i]), dryR = input(right[i]), mono = (dryL + dryR) * 0.5;
            quietFrames = dryL === 0 && dryR === 0 ? quietFrames + 1 : 0;
            if (quietFrames >= sr) { if (quietFrames !== Infinity) reset(); left[i] = dryL; right[i] = dryR; continue; }
            const wetL = channelSample(monoInput ? mono : dryL, 0), wetR = monoInput ? wetL : channelSample(dryR, 1);
            left[i] = output(dryL, wetL, mix); right[i] = output(dryR, wetR, mix);
            if (++reflectionPosition === reflectionLength) reflectionPosition = 0;
          }
          wasMono = monoInput;
          meter.reductionDb = 20 * Math.log10(1 + p.sag * Math.max(sagEnvelope[0], monoInput ? sagEnvelope[0] : sagEnvelope[1]) * 1.8);
        };
        reset = () => { states.forEach(clear); [previous, interLP, couplingPrevious, couplingOut, antiAlias, decimated, sagEnvelope, gateEnvelope, gateGain, dcPrevious, dcOut].forEach(clear); reflections.forEach(clear); reflectionPosition = 0; wasMono = false; quietFrames = Infinity; meter.reductionDb = 0; };
        tail = () => 0.35;
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
        setParams(next) { if (fastSet) return fastSet(next); p = normalize(type, Object.assign({}, p, next && typeof next === 'object' ? next : {})); update(); },
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
