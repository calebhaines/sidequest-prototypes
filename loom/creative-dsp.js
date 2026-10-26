/* GALLEY · deterministic phase cancellation and digital sample-clock texture. */
(function (scope) {
  'use strict';
  function createLoomCreativeDSP() {
    'use strict';
    // This entire factory is serialized into an AudioWorklet. No outer globals.
    const PI = Math.PI, TAU = PI * 2;
    const divisions = { '1/32': .125, '1/16': .25, '1/8': .5, '1/8.': .75, '1/4': 1, '1/2': 2, '1': 4, '2': 8, '4': 16 };
    const specifications = {
      swirl: {
        stages: ['8', '4', '12'], center: [40, 6000, 650], spread: [0, 3, 1.2], feedback: [-.85, .85, .3], polarity: ['add', 'subtract'],
        clock: ['sync', 'free'], rate: [.02, 8, .25], division: ['1', '1/32', '1/16', '1/8', '1/8.', '1/4', '1/2', '2', '4'], shape: ['sine', 'triangle'], depth: [0, 72, 30], stereo: [0, 180, 90],
        envAmount: [-48, 48, 0], sensitivity: [-36, 24, 6], attack: [.2, 200, 8], release: [5, 2000, 240], output: [-24, 12, 0], mix: [0, 1, 1]
      },
      crumble: {
        bits: [2, 16, 10], sampleRate: [100, 48000, 12000], jitter: [0, 1, .08], dither: [0, 1, 0], stereo: ['linked', 'independent'], prefilter: ['raw', 'soft'], drive: [0, 24, 0],
        tone: [500, 20000, 12000], transient: [0, 1, .15], output: [-24, 12, -3], mix: [0, 1, .65]
      }
    };
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    const finite = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    const safe = value => Number.isFinite(value) ? clamp(value, -8, 8) : 0;
    const db = value => Math.pow(10, value / 20);
    const decibels = value => Math.max(-120, 20 * Math.log10(Math.max(1e-6, value)));
    function normalize(type, params) {
      const spec = specifications[type]; if (!spec) throw Error('Unknown creative effect: ' + type);
      const source = params && typeof params === 'object' ? params : {}, result = {};
      for (const key of Object.keys(spec)) {
        const rule = spec[key]; result[key] = typeof rule[0] === 'number' ? clamp(finite(source[key], rule[2]), rule[0], rule[1]) : rule.includes(source[key]) ? source[key] : rule[0];
      }
      result.bypass = source.bypass === true; return result;
    }
    function create(type, sampleRate, params) {
      let p = normalize(type, params);
      const sr = clamp(finite(sampleRate, 48000), 8000, 192000), smooth = 1 - Math.exp(-1 / (sr * .004)), peakDecay = Math.exp(-1 / (sr * .12));
      let peakIn = 0, peakOut = 0, currentMix = p.mix, currentOutput = db(p.output);
      let run, resetState, tail, meters, update;
      const meterSample = (a, b, l, r) => { peakIn = Math.max(Math.abs(a), Math.abs(b), peakIn * peakDecay); peakOut = Math.max(Math.abs(l), Math.abs(r), peakOut * peakDecay); };
      if (type === 'swirl') {
        const states = new Float64Array(24), coefficients = new Float64Array(24), targetCoefficients = new Float64Array(24);
        let stages = Number(p.stages), phase = 0, envelope = 0, lastL = 0, lastR = 0, controlFrame = 0, fade = 1;
        let centre = Math.log2(p.center), spread = p.spread, depth = p.depth, stereo = p.stereo / 360, envAmount = p.envAmount, feedback = p.feedback, polarity = p.polarity === 'subtract' ? -1 : 1;
        let detectorGain = db(p.sensitivity), attack = 0, release = 0, rateHz = p.rate, centreL = p.center, centreR = p.center;
        const coefficientSmooth = 1 - Math.exp(-1 / (sr * .001)), fadeStep = 1 / (sr * .005);
        update = previous => {
          attack = 1 - Math.exp(-1 / (sr * p.attack * .001)); release = 1 - Math.exp(-1 / (sr * p.release * .001));
          if (previous && previous.stages !== p.stages) { states.fill(0); lastL = lastR = 0; stages = Number(p.stages); controlFrame = 0; fade = 0; }
        };
        const wave = value => p.shape === 'triangle' ? 1 - 4 * Math.abs(value - Math.floor(value) - .5) : Math.sin(TAU * value);
        const tune = (channel, hz) => {
          for (let stage = 0; stage < stages; stage++) {
            const stagePosition = stages > 1 ? stage / (stages - 1) - .5 : 0;
            const frequency = clamp(hz * Math.pow(2, stagePosition * spread), 15, sr * .43);
            const g = Math.tan(PI * frequency / sr); targetCoefficients[channel * 12 + stage] = (g - 1) / (g + 1);
          }
        };
        tune(0, p.center); tune(1, p.center); coefficients.set(targetCoefficients);
        run = (left, right, context) => {
          const tempo = clamp(finite(context?.tempo, 120), 40, 300), sync = p.clock === 'sync';
          rateHz = sync ? tempo / (60 * divisions[p.division]) : p.rate;
          const increment = rateHz / sr;
          if (sync && context?.playing && Number.isFinite(context.beat)) phase = ((context.beat / divisions[p.division]) % 1 + 1) % 1;
          for (let i = 0; i < left.length; i++) {
            const dryL = safe(left[i]), dryR = safe(right[i]), detector = Math.max(Math.abs(dryL), Math.abs(dryR));
            envelope += (detector > envelope ? attack : release) * (detector - envelope);
            centre += smooth * (Math.log2(p.center) - centre); spread += smooth * (p.spread - spread); depth += smooth * (p.depth - depth); stereo += smooth * (p.stereo / 360 - stereo);
            envAmount += smooth * (p.envAmount - envAmount); detectorGain += smooth * (db(p.sensitivity) - detectorGain); feedback += smooth * (p.feedback - feedback);
            currentMix += smooth * (p.mix - currentMix); currentOutput += smooth * (db(p.output) - currentOutput); polarity += smooth * ((p.polarity === 'subtract' ? -1 : 1) - polarity);
            if (controlFrame === 0) {
              const envelopeOffset = clamp(envelope * detectorGain, 0, 1) * envAmount / 12;
              centreL = clamp(Math.pow(2, centre + wave(phase) * depth / 24 + envelopeOffset), 15, sr * .43);
              centreR = clamp(Math.pow(2, centre + wave(phase + stereo) * depth / 24 + envelopeOffset), 15, sr * .43);
              tune(0, centreL); tune(1, centreR);
            }
            controlFrame = (controlFrame + 1) & 7;
            let a = dryL + feedback * lastL, b = dryR + feedback * lastR;
            for (let stage = 0; stage < stages; stage++) {
              const rightIndex = stage + 12;
              coefficients[stage] += coefficientSmooth * (targetCoefficients[stage] - coefficients[stage]); coefficients[rightIndex] += coefficientSmooth * (targetCoefficients[rightIndex] - coefficients[rightIndex]);
              const yL = safe(coefficients[stage] * a + states[stage]), yR = safe(coefficients[rightIndex] * b + states[rightIndex]);
              states[stage] = safe(a - coefficients[stage] * yL); states[rightIndex] = safe(b - coefficients[rightIndex] * yR); a = yL; b = yR;
            }
            lastL = safe(a); lastR = safe(b); fade = Math.min(1, fade + fadeStep);
            const wetL = .5 * (dryL + polarity * lastL) * currentOutput, wetR = .5 * (dryR + polarity * lastR) * currentOutput;
            const outL = safe(dryL + (wetL - dryL) * currentMix * fade), outR = safe(dryR + (wetR - dryR) * currentMix * fade);
            left[i] = outL; right[i] = outR; meterSample(dryL, dryR, outL, outR);
            phase += increment; if (phase >= 1) phase -= Math.floor(phase);
          }
        };
        resetState = () => {
          states.fill(0); phase = envelope = lastL = lastR = controlFrame = 0; fade = 1;
          centre = Math.log2(p.center); spread = p.spread; depth = p.depth; stereo = p.stereo / 360; envAmount = p.envAmount; feedback = p.feedback; detectorGain = db(p.sensitivity); polarity = p.polarity === 'subtract' ? -1 : 1;
          centreL = centreR = p.center; tune(0, centreL); tune(1, centreR); coefficients.set(targetCoefficients);
        };
        tail = () => Math.min(6, .06 + stages * Math.log(1000) / (TAU * 15) / Math.max(.15, 1 - Math.abs(p.feedback)));
        meters = () => ({ centerLeftHz: centreL, centerRightHz: centreR, envelope: clamp(envelope * detectorGain, 0, 1), rateHz });
      } else {
        let seed = 0x4352554d, untilL = 0, untilR = 0, heldL = 0, heldR = 0, preL = 0, preR = 0, pre2L = 0, pre2R = 0, toneL = 0, toneR = 0, fast = 0, slow = 0, transient = 0;
        let bitDepth = p.bits, clock = Math.min(sr, p.sampleRate), jitter = p.jitter, dither = p.dither, drive = db(p.drive), cutoff = p.tone, recovery = p.transient;
        const fastCoefficient = 1 - Math.exp(-1 / (sr * .0005)), slowCoefficient = 1 - Math.exp(-1 / (sr * .02));
        const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
        const quantize = (sample, levels) => {
          const noise = Math.abs(sample) > 1e-12 && dither > 1e-9 ? (random() - random()) * dither : 0;
          return Math.round(clamp(sample, -1, 1) * levels + noise) / levels;
        };
        update = previous => { if (previous && previous.stereo !== p.stereo) untilR = untilL; };
        run = (left, right) => {
          for (let i = 0; i < left.length; i++) {
            const dryL = safe(left[i]), dryR = safe(right[i]);
            bitDepth += smooth * (p.bits - bitDepth); clock += smooth * (Math.min(sr, p.sampleRate) - clock); jitter += smooth * (p.jitter - jitter); dither += smooth * (p.dither - dither);
            drive += smooth * (db(p.drive) - drive); cutoff += smooth * (p.tone - cutoff); recovery += smooth * (p.transient - recovery);
            currentMix += smooth * (p.mix - currentMix); currentOutput += smooth * (db(p.output) - currentOutput);
            const inputL = dryL * drive, inputR = dryR * drive, preCoefficient = 1 - Math.exp(-TAU * Math.min(sr * .45, clock * .45) / sr);
            preL += preCoefficient * (inputL - preL); preR += preCoefficient * (inputR - preR); pre2L += preCoefficient * (preL - pre2L); pre2R += preCoefficient * (preR - pre2R);
            const feedL = p.prefilter === 'soft' ? pre2L : inputL, feedR = p.prefilter === 'soft' ? pre2R : inputR, levels = Math.pow(2, bitDepth - 1);
            if (untilL <= 0) {
              heldL = quantize(feedL, levels);
              if (p.stereo === 'linked') heldR = quantize(feedR, levels);
              untilL += Math.max(1, sr / clock * (1 + (jitter > 1e-9 ? (random() * 2 - 1) * jitter * .9 : 0)));
            }
            if (p.stereo === 'independent') {
              if (untilR <= 0) { heldR = quantize(feedR, levels); untilR += Math.max(1, sr / clock * (1 + (jitter > 1e-9 ? (random() * 2 - 1) * jitter * .9 : 0))); }
              untilR -= 1;
            }
            untilL -= 1;
            const toneCoefficient = 1 - Math.exp(-TAU * Math.min(sr * .45, cutoff) / sr);
            toneL += toneCoefficient * (heldL - toneL); toneR += toneCoefficient * (heldR - toneR);
            const detector = Math.max(Math.abs(dryL), Math.abs(dryR)); fast += fastCoefficient * (detector - fast); slow += slowCoefficient * (detector - slow);
            transient = clamp(6 * (fast - slow) / (slow + .04), 0, 1);
            const restore = recovery * transient, wetL = (toneL + (dryL - toneL) * restore) * currentOutput, wetR = (toneR + (dryR - toneR) * restore) * currentOutput;
            const outL = safe(dryL + (wetL - dryL) * currentMix), outR = safe(dryR + (wetR - dryR) * currentMix);
            left[i] = outL; right[i] = outR; meterSample(dryL, dryR, outL, outR);
          }
        };
        resetState = () => {
          seed = 0x4352554d; untilL = untilR = heldL = heldR = preL = preR = pre2L = pre2R = toneL = toneR = fast = slow = transient = 0;
          bitDepth = p.bits; clock = Math.min(sr, p.sampleRate); jitter = p.jitter; dither = p.dither; drive = db(p.drive); cutoff = p.tone; recovery = p.transient;
        };
        tail = () => .15;
        meters = () => ({ effectiveRateHz: clock, bitDepth, transient, clockJitter: jitter });
      }
      update(null);
      return {
        setParams(next) { const previous = p; p = normalize(type, Object.assign({}, p, next && typeof next === 'object' ? next : {})); update(previous); },
        process(left, right, context) {
          if (!left || !right || left.length !== right.length) throw Error('GALLEY creative effects require equal stereo blocks.');
          if (p.bypass) { for (let i = 0; i < left.length; i++) { left[i] = safe(left[i]); right[i] = safe(right[i]); } return; }
          run(left, right, context || null);
        },
        reset() { resetState(); peakIn = peakOut = 0; currentMix = p.mix; currentOutput = db(p.output); },
        getTailTime: tail,
        getMeters() { return Object.assign({ inputDb: decibels(peakIn), outputDb: decibels(peakOut), reductionDb: 0 }, meters()); },
        getParams() { return Object.assign({}, p); }
      };
    }
    return { specifications, normalize, create };
  }
  scope.createLoomCreativeDSP = createLoomCreativeDSP;
})(typeof window === 'undefined' ? globalThis : window);
