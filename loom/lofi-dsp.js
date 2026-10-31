/* TIN CAN · microphone transducers, narrow-band lines and small digital recorders. */
(function (scope) {
  'use strict';
  function createLoomLoFiDSP() {
    'use strict';
    // Self-contained so this exact implementation can run in AudioWorklet.
    const TAU = Math.PI * 2;
    const specifications = {
      model: ['rotary-50', 'carbon-30', 'pushbutton-80', 'payphone', 'intercom', 'bullet', 'cassette', 'toy', 'megaphone', 'piezo', 'mobile-8k', 'answerphone'],
      drive: [0, 30, 6], tone: [-1, 1, 0], wear: [0, 1, .15], output: [-24, 12, 0], mix: [0, 1, 1],
      bandwidth: [.25, 2, 1], resonance: [0, 1, .35], compression: [0, 1, .3], distance: [0, 1, .2],
      noise: [0, 1, 0], crackle: [0, 1, 0], hum: [0, 1, 0], humFrequency: ['50', '60'],
      digital: ['model', 'off', 'pcm', 'mulaw', 'adpcm'], clock: [1000, 16000, 8000], bits: [4, 12, 8], jitter: [0, 1, 0], stereo: ['mono', 'stereo']
    };
    const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
    const finite = (x, fallback) => typeof x === 'number' && Number.isFinite(x) ? x : fallback;
    const safe = x => x <= 65536 && x >= -65536 ? x : Number.isFinite(x) ? clamp(x, -65536, 65536) : 0;
    const bounded = x => x <= 8 && x >= -8 ? x : Number.isFinite(x) ? clamp(x, -8, 8) : 0;
    const db = x => Math.pow(10, x / 20);
    const levelDb = x => Math.max(-120, 20 * Math.log10(Math.max(x, 1e-6)));
    function normalize(params) {
      const source = params && typeof params === 'object' ? params : {}, result = {};
      for (const key of Object.keys(specifications)) {
        const rule = specifications[key];
        result[key] = typeof rule[0] === 'number' ? clamp(finite(source[key], rule[2]), rule[0], rule[1]) : rule.includes(source[key]) ? source[key] : rule[0];
      }
      result.bypass = source.bypass === true; return result;
    }
    // Behavioural voicings, not measured impulse responses of named products.
    // low/high, presence frequency/gain/Q, cavity frequency/gain/Q,
    // transducer sensitivity/asymmetry/hardness/memory Hz, detector weighting, codec.
    const profiles = {
      'carbon-30': [220, 3000, 1500, 6, 1.0, 2450, 2.5, 1.4, 2.7, .40, .55, 180, .85, 'off'],
      'rotary-50': [300, 3300, 1750, 4.5, .90, 2450, -2.5, 1.3, 2.2, .25, .65, 120, .65, 'off'],
      'pushbutton-80': [280, 3500, 1250, 1.5, .75, 2850, 1, .9, 1.3, .055, .28, 75, .40, 'off'],
      payphone: [360, 2800, 1050, 5, 1.0, 2400, 3, 1.5, 2.8, .18, .90, 100, .90, 'off'],
      intercom: [450, 2600, 1650, 7, 1.35, 750, -3, 1.0, 2.6, -.12, .75, 150, 1.0, 'off'],
      bullet: [85, 6200, 1800, 6, 1.15, 4200, -2, .8, 2.0, .14, .40, 45, .65, 'off'],
      cassette: [130, 9500, 3300, 3, .8, 950, -1.5, .8, 1.2, .16, .25, 65, .85, 'off'],
      toy: [350, 5200, 2700, 8, 1.9, 850, -5, 1.0, 2.8, -.20, 1.0, 220, .60, 'off'],
      megaphone: [450, 4500, 1450, 8, 1.45, 3000, 5, 1.6, 3.2, .14, 1.25, 95, 1.15, 'off'],
      piezo: [180, 9000, 3800, 9, 2.4, 1100, -4, 1.1, 1.25, .055, .18, 450, .18, 'off'],
      'mobile-8k': [300, 3400, 1450, .5, .75, 2800, -1, 1.0, 1.1, .025, .15, 90, .75, 'mulaw'],
      answerphone: [220, 3100, 1250, 2, .8, 2100, -1.5, .9, 1.6, .10, .35, 75, .95, 'adpcm']
    };
    // ITU G.711 μ-law's 8-bit segmented companding. The external helpers use
    // signed linear PCM16 and actual code bytes; Bits never alters this codec.
    function encodeMuLaw(sample) {
      let value = clamp(Math.round(finite(sample, 0)), -32768, 32767), sign = 0;
      if (value < 0) { sign = 0x80; value = -value; }
      value = Math.min(32635, value) + 0x84;
      let exponent = 7;
      for (let mask = 0x4000; exponent > 0 && !(value & mask); mask >>= 1) exponent--;
      return (~(sign | (exponent << 4) | ((value >> (exponent + 3)) & 15))) & 255;
    }
    function decodeMuLaw(code) {
      const value = (~(finite(code, 255) & 255)) & 255, magnitude = (((value & 15) << 3) + 0x84) << ((value >> 4) & 7);
      return value & 0x80 ? 0x84 - magnitude : magnitude - 0x84;
    }
    // IMA/DVI 4-bit ADPCM. Encoder and decoder carry independent states, just
    // like a stored nibble stream. A model change/reset clears both together.
    const stepTable = [7,8,9,10,11,12,13,14,16,17,19,21,23,25,28,31,34,37,41,45,50,55,60,66,73,80,88,97,107,118,130,143,157,173,190,209,230,253,279,307,337,371,408,449,494,544,598,658,724,796,876,963,1060,1166,1282,1411,1552,1707,1878,2066,2272,2499,2749,3024,3327,3660,4026,4428,4871,5358,5894,6484,7132,7845,8630,9493,10442,11487,12635,13899,15289,16818,18500,20350,22385,24623,27086,29794,32767];
    const indexTable = [-1,-1,-1,-1,2,4,6,8,-1,-1,-1,-1,2,4,6,8];
    function encodeIMA(sample, state) {
      const index = clamp(Math.round(finite(state.index, 0)), 0, 88), predictor = clamp(Math.round(finite(state.predictor, 0)), -32768, 32767), step = stepTable[index];
      let difference = clamp(Math.round(finite(sample, 0)), -32768, 32767) - predictor, code = difference < 0 ? 8 : 0;
      if (difference < 0) difference = -difference;
      let delta = step >> 3;
      if (difference >= step) { code |= 4; difference -= step; delta += step; }
      if (difference >= (step >> 1)) { code |= 2; difference -= step >> 1; delta += step >> 1; }
      if (difference >= (step >> 2)) { code |= 1; delta += step >> 2; }
      state.predictor = clamp(predictor + (code & 8 ? -delta : delta), -32768, 32767);
      state.index = clamp(index + indexTable[code], 0, 88); return code;
    }
    function decodeIMA(code, state) {
      code = finite(code, 0) & 15;
      const index = clamp(Math.round(finite(state.index, 0)), 0, 88), step = stepTable[index];
      let delta = step >> 3;
      if (code & 4) delta += step; if (code & 2) delta += step >> 1; if (code & 1) delta += step >> 2;
      state.predictor = clamp(Math.round(finite(state.predictor, 0)) + (code & 8 ? -delta : delta), -32768, 32767);
      state.index = clamp(index + indexTable[code], 0, 88); return state.predictor;
    }
    function soft(x) {
      if (x >= 3) return 1; if (x <= -3) return -1;
      const square = x * x; return x * (27 + square) / (27 + 9 * square);
    }
    function create(sampleRate, params) {
      let p = normalize(params);
      const sr = clamp(finite(sampleRate, 48000), 8000, 192000), fadeFrames = Math.max(1, Math.round(sr * .006)), coefficientFrames = Math.max(1, Math.round(sr * .004));
      const smooth = 1 - Math.exp(-1 / (sr * .006)), attack = 1 - Math.exp(-1 / (sr * .0015)), release = 1 - Math.exp(-1 / (sr * .10));
      const peakDecay = Math.exp(-1 / (sr * .12)), crackleDecay = Math.exp(-1 / (sr * .00065)), dcCoefficient = Math.exp(-TAU * 12 / sr);
      // Eight biquads per channel; the last two only run for digital paths.
      const coefficient = new Float64Array(40), target = new Float64Array(40), delta = new Float64Array(40), next = new Float64Array(40), filterState = new Float64Array(32);
      const memory = new Float64Array(2), held = new Float64Array(2), noiseLow = new Float64Array(2), crackleState = new Float64Array(2), dcInput = new Float64Array(2), dcOutput = new Float64Array(2), lastWet = new Float64Array(2), declick = new Float64Array(2);
      const encoders = [{ predictor: 0, index: 0 }, { predictor: 0, index: 0 }], decoders = [{ predictor: 0, index: 0 }, { predictor: 0, index: 0 }];
      let profile = profiles[p.model], codec = 'off', oldTopology = '', initialized = false, coefficientsRemaining = 0, declickRemaining = 0, pendingDeclick = false;
      let inputPeak = 0, outputPeak = 0, envelope = 0, compressionGain = 1, seed = 0x54494e43, clockRemaining = 0, noiseGate = 0, humSin = 0, humCos = 1, humSteps = 0;
      let lowCut = 300, highCut = 3300, memoryCoefficient = 0, noiseCoefficient = 0, humStepSin = 0, humStepCos = 1;
      let mixValue = p.bypass ? 0 : p.mix, mixTarget = mixValue, mixRemaining = 0, suspended = mixValue === 0, idle = true, quietSamples = 0, scrubRemaining = 1024;
      const idleFrames = Math.ceil(sr * 3);
      let drive = db(p.drive), driveTarget = drive, driveCompensation = db(-p.drive * .72), compensationTarget = driveCompensation, outputGain = db(p.output), outputTarget = outputGain;
      let wear = p.wear, compression = p.compression, noise = p.noise, crackle = p.crackle, hum = p.hum, bitDepth = p.bits, jitter = p.jitter, clock = Math.min(sr, p.clock), parameterMask = 0, cachedBits = -1, pcmLevels = 128;
      const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
      function setFilter(index, kind, hz, q, gain = 0) {
        const at = index * 5, w = TAU * clamp(hz, 10, sr * .45) / sr, cosine = Math.cos(w), sine = Math.sin(w), alpha = sine / (2 * q);
        let b0, b1, b2, a0, a1, a2;
        if (kind === 'peak') {
          const a = Math.pow(10, gain / 40);
          b0 = 1 + alpha * a; b1 = -2 * cosine; b2 = 1 - alpha * a; a0 = 1 + alpha / a; a1 = -2 * cosine; a2 = 1 - alpha / a;
        } else {
          a0 = 1 + alpha; a1 = -2 * cosine; a2 = 1 - alpha;
          if (kind === 'high') { b0 = (1 + cosine) * .5; b1 = -(1 + cosine); b2 = b0; }
          else { b0 = (1 - cosine) * .5; b1 = 1 - cosine; b2 = b0; }
        }
        next[at] = b0 / a0; next[at + 1] = b1 / a0; next[at + 2] = b2 / a0; next[at + 3] = a1 / a0; next[at + 4] = a2 / a0;
      }
      function clearCircuit() {
        filterState.fill(0); memory.fill(0); held.fill(0); noiseLow.fill(0); crackleState.fill(0); dcInput.fill(0); dcOutput.fill(0);
        encoders[0].predictor = encoders[0].index = encoders[1].predictor = encoders[1].index = 0;
        decoders[0].predictor = decoders[0].index = decoders[1].predictor = decoders[1].index = 0;
        envelope = noiseGate = clockRemaining = 0; compressionGain = 1; seed = 0x54494e43; humSin = 0; humCos = 1; humSteps = 0;
      }
      function update(previous) {
        profile = profiles[p.model]; codec = p.digital === 'model' ? profile[13] : p.digital;
        const topology = p.model + ':' + codec + ':' + p.stereo;
        if (initialized && topology !== oldTopology) { clearCircuit(); pendingDeclick = !suspended && !idle; }
        oldTopology = topology;
        const highLimit = codec === 'off' ? sr * .43 : Math.min(sr * .43, p.clock * .42);
        highCut = clamp(profile[1] * Math.sqrt(p.bandwidth) * Math.pow(2, p.tone * .9) * (1 - (p.distance - .2) * .4) * (1 - (p.wear - .15) * .15), 160, highLimit);
        lowCut = clamp(profile[0] / Math.sqrt(p.bandwidth) * Math.pow(2, p.tone * .45) * (1 + (p.distance - .2) * 1.4), 20, highCut * .65);
        const focus = clamp(profile[2] * Math.pow(2, p.tone * .18), lowCut * 1.2, highCut * .94), cavity = clamp(profile[5], lowCut * 1.1, highCut * .98);
        setFilter(0, 'high', lowCut, .5411961); setFilter(1, 'high', lowCut, 1.306563);
        setFilter(2, 'peak', focus, clamp(profile[4] * (.7 + p.resonance * .95), .3, 5), profile[3] * (.35 + p.resonance * 1.85));
        setFilter(3, 'low', highCut, .5411961); setFilter(4, 'low', highCut, 1.306563);
        setFilter(5, 'peak', cavity, clamp(profile[7] * (.7 + p.resonance), .3, 5), profile[6] * (.4 + p.resonance * 1.7));
        setFilter(6, 'low', highCut, .5411961); setFilter(7, 'low', highCut, 1.306563);
        let changed = false;
        for (let i = 0; i < 40; i++) if (next[i] !== target[i]) { changed = true; break; }
        if (!initialized || suspended || idle) { coefficient.set(next); target.set(next); coefficientsRemaining = 0; }
        else if (changed) { target.set(next); for (let i = 0; i < 40; i++) delta[i] = (target[i] - coefficient[i]) / coefficientFrames; coefficientsRemaining = coefficientFrames; }
        memoryCoefficient = 1 - Math.exp(-TAU * profile[11] / sr); noiseCoefficient = 1 - Math.exp(-TAU * Math.min(3500, highCut) / sr);
        const humAngle = TAU * Number(p.humFrequency) / sr; humStepSin = Math.sin(humAngle); humStepCos = Math.cos(humAngle);
        driveTarget = db(p.drive); compensationTarget = db(-p.drive * .72); outputTarget = db(p.output);
        if (previous) {
          if (previous.drive !== p.drive) parameterMask |= 1; if (previous.output !== p.output) parameterMask |= 2;
          if (previous.wear !== p.wear) parameterMask |= 4; if (previous.compression !== p.compression) parameterMask |= 8;
          if (previous.noise !== p.noise) parameterMask |= 16; if (previous.crackle !== p.crackle) parameterMask |= 32;
          if (previous.hum !== p.hum) parameterMask |= 64; if (previous.bits !== p.bits) parameterMask |= 128;
          if (previous.jitter !== p.jitter) parameterMask |= 256; if (previous.clock !== p.clock) parameterMask |= 512;
        }
        if (idle) { parameterMask = 0; drive = driveTarget; driveCompensation = compensationTarget; outputGain = outputTarget; wear = p.wear; compression = p.compression; noise = p.noise; crackle = p.crackle; hum = p.hum; bitDepth = p.bits; jitter = p.jitter; clock = Math.min(sr, p.clock); }
        const goal = p.bypass ? 0 : p.mix;
        if (goal !== mixTarget) { mixTarget = goal; mixRemaining = fadeFrames; }
        if (suspended && goal > 0) {
          clearCircuit(); coefficient.set(target); coefficientsRemaining = 0;
          drive = driveTarget; driveCompensation = compensationTarget; outputGain = outputTarget;
          wear = p.wear; compression = p.compression; noise = p.noise; crackle = p.crackle; hum = p.hum; bitDepth = p.bits; jitter = p.jitter; clock = Math.min(sr, p.clock);
          parameterMask = 0; mixValue = 0; mixRemaining = fadeFrames; suspended = false; idle = true; quietSamples = 0; pendingDeclick = false; declickRemaining = 0;
        }
        initialized = true;
      }
      function filter(x, channel, index) {
        const at = index * 5, state = channel * 16 + index * 2;
        const y = safe(coefficient[at] * x + filterState[state]);
        filterState[state] = safe(coefficient[at + 1] * x - coefficient[at + 3] * y + filterState[state + 1]);
        filterState[state + 1] = safe(coefficient[at + 2] * x - coefficient[at + 4] * y); return y;
      }
      function quantize(x, channel) {
        const clipped = clamp(x, -1, 1);
        if (codec === 'mulaw') return decodeMuLaw(encodeMuLaw(Math.round(clipped * 32767))) / 32768;
        if (codec === 'adpcm') { const code = encodeIMA(Math.round(clipped * 32767), encoders[channel]); return decodeIMA(code, decoders[channel]) / 32768; }
        const bits = Math.round(bitDepth);
        if (bits !== cachedBits) { cachedBits = bits; pcmLevels = Math.pow(2, bits - 1); }
        return clamp(Math.round(clipped * pcmLevels), -pcmLevels, pcmLevels - 1) / pcmLevels;
      }
      function transduce(x, channel) {
        let y = filter(x, channel, 0); y = filter(y, channel, 1); y = filter(y, channel, 2); y = filter(y, channel, 3);
        memory[channel] += memoryCoefficient * (y - memory[channel]);
        const sensitivity = profile[8] * (1 + wear * 2), charge = soft(memory[channel] * drive * .7);
        const contact = y * drive * sensitivity * (1 + profile[9] * charge * (.45 + wear));
        const asymmetric = contact + profile[9] * (.4 + wear) * contact * contact / (1 + Math.abs(contact));
        const driven = asymmetric * (1 + profile[10] * wear * .8);
        y = soft(driven) / sensitivity * driveCompensation * compressionGain;
        if (p.model === 'piezo') y += (y - soft(memory[channel] * drive) * driveCompensation) * wear * .13;
        y = filter(y, channel, 4); return filter(y, channel, 5);
      }
      function process(left, right) {
        if (!left || !right || left.length !== right.length) throw Error('TIN CAN requires equal stereo blocks.');
        if (suspended) {
          // No colour processing, clocks, envelopes, RNG or coefficient work.
          for (let frame = 0; frame < left.length; frame++) { if (!Number.isFinite(left[frame])) left[frame] = 0; if (!Number.isFinite(right[frame])) right[frame] = 0; }
          return;
        }
        if (idle && !mixRemaining) {
          let silent = true;
          for (let frame = 0; frame < left.length; frame++) {
            if (!Number.isFinite(left[frame])) left[frame] = 0; if (!Number.isFinite(right[frame])) right[frame] = 0;
            if (left[frame] !== 0 || right[frame] !== 0) silent = false;
          }
          if (silent) return;
        }
        const mono = p.stereo === 'mono';
        for (let frame = 0; frame < left.length; frame++) {
          const dryL = Number.isFinite(left[frame]) ? left[frame] : 0, dryR = Number.isFinite(right[frame]) ? right[frame] : 0;
          if (suspended) { left[frame] = dryL; right[frame] = dryR; continue; }
          if (idle && dryL === 0 && dryR === 0) {
            left[frame] = dryL; right[frame] = dryR;
            if (mixRemaining) { mixValue += (mixTarget - mixValue) / mixRemaining; if (--mixRemaining === 0) { mixValue = mixTarget; if (mixValue === 0) suspended = true; } }
            continue;
          }
          idle = false;
          if (coefficientsRemaining) {
            if (--coefficientsRemaining === 0) coefficient.set(target);
            else for (let i = 0; i < 40; i++) coefficient[i] += delta[i];
          }
          // Unchanged controls do no per-sample smoothing. Each bit retires
          // only at an exact floating-point fixed point, without snapping.
          if (parameterMask) {
            if (parameterMask & 1) { const a = drive, b = driveCompensation; drive += smooth * (driveTarget - drive); driveCompensation += smooth * (compensationTarget - driveCompensation); if (a === drive && b === driveCompensation) parameterMask &= ~1; }
            if (parameterMask & 2) { const value = outputGain; outputGain += smooth * (outputTarget - outputGain); if (value === outputGain) parameterMask &= ~2; }
            if (parameterMask & 4) { const value = wear; wear += smooth * (p.wear - wear); if (value === wear) parameterMask &= ~4; }
            if (parameterMask & 8) { const value = compression; compression += smooth * (p.compression - compression); if (value === compression) parameterMask &= ~8; }
            if (parameterMask & 16) { const value = noise; noise += smooth * (p.noise - noise); if (value === noise) parameterMask &= ~16; }
            if (parameterMask & 32) { const value = crackle; crackle += smooth * (p.crackle - crackle); if (value === crackle) parameterMask &= ~32; }
            if (parameterMask & 64) { const value = hum; hum += smooth * (p.hum - hum); if (value === hum) parameterMask &= ~64; }
            if (parameterMask & 128) { const value = bitDepth; bitDepth += smooth * (p.bits - bitDepth); if (value === bitDepth) parameterMask &= ~128; }
            if (parameterMask & 256) { const value = jitter; jitter += smooth * (p.jitter - jitter); if (value === jitter) parameterMask &= ~256; }
            if (parameterMask & 512) { const value = clock; clock += smooth * (Math.min(sr, p.clock) - clock); if (value === clock) parameterMask &= ~512; }
          }
          const inputL = clamp(mono ? (dryL + dryR) * .5 : dryL, -32, 32), inputR = clamp(dryR, -32, 32), detector = mono ? Math.abs(inputL) : Math.max(Math.abs(inputL), Math.abs(inputR));
          envelope += (detector > envelope ? attack : release) * (detector - envelope); if (envelope < 1e-12) envelope = 0;
          noiseGate = Math.min(1, envelope * 16);
          compressionGain = 1 / Math.sqrt(1 + Math.max(0, envelope - .055) * compression * profile[12] * 28);
          quietSamples = inputL === 0 && (mono || inputR === 0) ? quietSamples + 1 : 0;
          const capture = codec !== 'off' && clockRemaining <= 0;
          if (capture) clockRemaining += Math.max(1, sr / clock * (jitter > 1e-10 ? 1 + (random() * 2 - 1) * jitter * .45 : 1));
          let wetL = 0, wetR = 0;
          for (let channel = 0; channel < (mono ? 1 : 2); channel++) {
            let wet = transduce(channel ? inputR : inputL, channel);
            if (codec !== 'off') { if (capture) held[channel] = quantize(wet, channel); wet = filter(held[channel], channel, 6); wet = filter(wet, channel, 7); }
            if (noise > 1e-10 && noiseGate > 1e-10) {
              const white = random() * 2 - 1; noiseLow[channel] += noiseCoefficient * (white - noiseLow[channel]);
              wet += (noiseLow[channel] * .65 + white * .15) * noise * .024 * noiseGate;
            }
            if (crackle > 1e-10 && noiseGate > 1e-10 && random() < crackle * (p.model === 'carbon-30' ? 14 : 6) / sr) crackleState[channel] += (random() * 2 - 1) * crackle * .14 * noiseGate;
            crackleState[channel] *= crackleDecay; wet += crackleState[channel];
            if (hum > 1e-10 && noiseGate > 1e-10) wet += (humSin + .22 * (2 * humSin * humCos)) * hum * .018 * noiseGate;
            const dc = wet - dcInput[channel] + dcCoefficient * dcOutput[channel]; dcInput[channel] = wet; dcOutput[channel] = safe(dc); wet = safe(dc) * outputGain;
            if (channel) wetR = wet; else wetL = wet;
          }
          if (mono) wetR = wetL;
          if (codec !== 'off') clockRemaining--;
          if (hum > 1e-10 && noiseGate > 1e-10) {
            const sine = humSin * humStepCos + humCos * humStepSin; humCos = humCos * humStepCos - humSin * humStepSin; humSin = sine;
            if (++humSteps === 2048) { const length = Math.sqrt(humSin * humSin + humCos * humCos); humSin /= length; humCos /= length; humSteps = 0; }
          }
          if (pendingDeclick) { declick[0] = lastWet[0] - wetL; declick[1] = lastWet[1] - wetR; declickRemaining = fadeFrames; pendingDeclick = false; }
          if (declickRemaining) { const weight = .5 - .5 * Math.cos(Math.PI * declickRemaining / fadeFrames); wetL += declick[0] * weight; wetR += declick[1] * weight; declickRemaining--; }
          lastWet[0] = wetL; lastWet[1] = wetR;
          // Advance after rendering, making the first re-enabled sample dry.
          const outL = mixValue === 0 ? dryL : bounded(mixValue === 1 ? wetL : dryL + (wetL - dryL) * mixValue);
          const outR = mixValue === 0 ? dryR : bounded(mixValue === 1 ? wetR : dryR + (wetR - dryR) * mixValue);
          left[frame] = outL; right[frame] = outR;
          inputPeak = Math.max(Math.abs(dryL), Math.abs(dryR), inputPeak * peakDecay); outputPeak = Math.max(Math.abs(outL), Math.abs(outR), outputPeak * peakDecay);
          if (mixRemaining) { mixValue += (mixTarget - mixValue) / mixRemaining; if (--mixRemaining === 0) { mixValue = mixTarget; if (mixValue === 0) suspended = true; } }
          if (quietSamples >= idleFrames && envelope === 0 && Math.abs(wetL) < 1e-11 && Math.abs(wetR) < 1e-11 && !pendingDeclick && !declickRemaining) {
            // Once a genuinely silent input has exhausted the tiny circuit
            // tail, keep no charged codec/filter state and do no colour work.
            // This decision is sample-counted, independent of caller blocks.
            clearCircuit(); coefficient.set(target); coefficientsRemaining = 0; lastWet.fill(0); declick.fill(0);
            inputPeak = outputPeak = 0; idle = true; quietSamples = 0;
          }
          if (--scrubRemaining === 0) {
            for (let i = 0; i < filterState.length; i++) if (Math.abs(filterState[i]) < 1e-20) filterState[i] = 0;
            scrubRemaining = 1024;
          }
        }
      }
      update();
      return {
        setParams(values) { const previous = p; p = normalize(Object.assign({}, p, values && typeof values === 'object' ? values : {})); update(previous); },
        process,
        reset() {
          clearCircuit(); coefficient.set(target); coefficientsRemaining = 0; declick.fill(0); lastWet.fill(0); declickRemaining = 0; pendingDeclick = false;
          drive = driveTarget; driveCompensation = compensationTarget; outputGain = outputTarget; wear = p.wear; compression = p.compression; noise = p.noise; crackle = p.crackle; hum = p.hum; bitDepth = p.bits; jitter = p.jitter; clock = Math.min(sr, p.clock);
          parameterMask = 0; mixValue = mixTarget = p.bypass ? 0 : p.mix; mixRemaining = 0; suspended = mixValue === 0; idle = true; quietSamples = 0; inputPeak = outputPeak = 0; scrubRemaining = 1024;
        },
        getTailTime() { return suspended || idle ? 0 : 3; },
        getMeters() { return { inputDb: levelDb(inputPeak), outputDb: levelDb(outputPeak), compressionDb: Math.max(0, -20 * Math.log10(Math.max(compressionGain, 1e-12))), lowCutHz: lowCut, highCutHz: highCut, clockHz: codec === 'off' ? 0 : Math.min(sr, p.clock), active: !suspended && !idle }; }
      };
    }
    return { specifications, normalize, create, codecs: { encodeMuLaw, decodeMuLaw, encodeIMA, decodeIMA } };
  }
  scope.createLoomLoFiDSP = createLoomLoFiDSP;
})(typeof window === 'undefined' ? globalThis : window);
