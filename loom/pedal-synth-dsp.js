/* FERMENT · causal string synthesis, bandlimited oscillators and nonlinear TPT filters. */
(function (scope) {
  'use strict';
  function createLoomPedalSynthDSP(trackerFactory, midiFactory) {
    'use strict';
    const makeTracker = typeof trackerFactory === 'function' ? trackerFactory : typeof globalThis !== 'undefined' && typeof globalThis.createLoomPedalTrackerDSP === 'function' ? globalThis.createLoomPedalTrackerDSP : null;
    const makeMidi = typeof midiFactory === 'function' ? midiFactory : typeof globalThis !== 'undefined' && typeof globalThis.createLoomPedalMidiDSP === 'function' ? globalThis.createLoomPedalMidiDSP : null;
    const PI = Math.PI, TAU = PI * 2, LN2 = Math.LN2;
    const specifications = {
      mode: ['track', 'chord'], inputRange: ['auto', 'guitar', 'bass'], register: ['played', 'bass', 'guitar'],
      cutoff: [30, 16000, 1200], resonance: [0, 1, .35], envAmount: [-72, 72, 24], synthLevel: [0, 1, .75],
      osc1Wave: ['saw', 'pulse', 'triangle', 'sine'], osc1Octave: [-2, 2, 0], osc2Wave: ['pulse', 'saw', 'triangle', 'sine'], osc2Level: [0, 1, .35], interval: [-24, 24, 0], detune: [-30, 30, 7], pulseWidth: [.05, .95, .5], subLevel: [0, 1, .3], drift: [0, 1, .12],
      filterModel: ['ladder', 'ota', 'svf'], filterMode: ['lowpass', 'bandpass', 'highpass'], drive: [0, 24, 3], keyTrack: [0, 1, .5],
      sensitivity: [-24, 24, 0], gate: [-90, -24, -60], tracking: [0, 1, .5], glide: [0, 500, 20], retrigger: ['legato', 'each'],
      envMode: ['follower', 'adsr'], attack: [1, 1000, 8], decay: [5, 2000, 180], sustain: [0, 1, .65], release: [5, 3000, 180], velocity: [0, 1, .5],
      clock: ['free', 'sync'], rate: [.02, 15, .8], division: ['1/4', '1/32', '1/16', '1/8', '1/8.', '1/2', '1', '2', '4'], wave: ['sine', 'triangle'], depth: [0, 1, .25], filterLfo: [-48, 48, 0], pwm: [0, .9, .1], vibrato: [0, 100, 0],
      direct: [0, 1, .15], output: [-24, 12, -3], width: [0, 1, .25], mix: [0, 1, .8]
    };
    const divisions = { '1/32': .125, '1/16': .25, '1/8': .5, '1/8.': .75, '1/4': 1, '1/2': 2, '1': 4, '2': 8, '4': 16 };
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const finite = (x, fallback) => typeof x === 'number' && Number.isFinite(x) ? x : fallback;
    const safe = x => x >= -32 && x <= 32 ? x : Number.isFinite(x) ? clamp(x, -32, 32) : 0;
    const outputSafe = x => x >= -8 && x <= 8 ? x : Number.isFinite(x) ? clamp(x, -8, 8) : 0;
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
    // Polynomial residuals repair the waveform's step/slope discontinuities.
    // The triangle uses the integrated residual, rather than a naive corner.
    function blep(t, dt) {
      if (t < dt) { const x = t / dt; return x + x - x * x - 1; }
      if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; }
      return 0;
    }
    function blamp(t, dt) {
      if (t < dt) { const x = 1 - t / dt; return x * x * x / 3; }
      if (t > 1 - dt) { const x = 1 + (t - 1) / dt; return x * x * x / 3; }
      return 0;
    }
    function oscillatorSample(phase, increment, wave, width = .5) {
      const t = phase - Math.floor(phase), dt = clamp(Math.abs(increment), 1e-9, .45);
      if (wave === 'sine') return Math.sin(TAU * t);
      if (wave === 'triangle') { const half = t < .5 ? t + .5 : t - .5; return (t < .5 ? -1 + 4 * t : 3 - 4 * t) + 4 * dt * (blamp(t, dt) - blamp(half, dt)); }
      if (wave === 'pulse') {
        const pw = clamp(width, dt, 1 - dt), shifted = t >= pw ? t - pw : t - pw + 1;
        return (t < pw ? 1 : -1) + blep(t, dt) - blep(shifted, dt) - (2 * pw - 1);
      }
      return 2 * t - 1 - blep(t, dt);
    }
    // Bounded rational differential-pair law; unity small-signal slope.
    function soft(x) { if (x >= 3) return 1; if (x <= -3) return -1; const q = x * x; return x * (27 + q) / (27 + 9 * q); }
    function create(sampleRate, params) {
      if (!makeTracker) throw Error('FERMENT requires createLoomPedalTrackerDSP.');
      let p = normalize(params);
      const sr = clamp(finite(sampleRate, 48000), 8000, 192000), maxHz = Math.min(16000, sr * .42), subRate = sr * 2;
      const tracker = makeTracker().create(sr, { range: p.inputRange, tracking: p.tracking, sensitivity: p.gate });
      let midiCapture = null;
      const filters = new Float64Array(8), previousFilterInput = new Float64Array(2), hpLow = new Float64Array(2), dcInput = new Float64Array(2), dcState = new Float64Array(2);
      const lastWet = new Float64Array(2), correction = new Float64Array(2);
      const slowDetectorCoefficient = 1 - Math.exp(-1 / (sr * .06));
      const retriggerFrames = Math.round(sr * .035), velocityFrames = Math.round(sr * .025), pitchHoldFrames = Math.round(sr * .22), quietFrames = Math.round(sr * .25);
      const driftStep1 = .137 / sr, driftStep2 = .193 / sr, otaBias = soft(.04);
      const fadeFrames = Math.max(1, Math.round(sr * .006)), slew = 1 - Math.exp(-1 / (sr * .006)), detectorAttack = 1 - Math.exp(-1 / (sr * .0007)), detectorRelease = Math.exp(-1 / (sr * .03)), gateDecay = Math.exp(-1 / (sr * .01)), peakDecay = Math.exp(-1 / (sr * .12)), dcDecay = Math.exp(-TAU * 9 / sr);
      let sensitivityGain = 1, threshold = .001, hpCoefficient = 0, attackCoefficient = 0, decayCoefficient = 0, releaseCoefficient = 0, glideCoefficient = 1, driveTarget = 1, outputTarget = 1, ratio1 = 1, ratio2 = 1;
      let targetCutoffLog = Math.log(p.cutoff);
      let gain = 1, outputGain = 1, cutoffLog = Math.log(p.cutoff), resonance = p.resonance, synthLevel = p.synthLevel, direct = p.direct, width = p.width;
      let mix = p.bypass ? 0 : p.mix, mixTarget = mix, mixRemaining = 0, suspended = mix === 0, idle = true;
      let phase1 = .5, phase2 = .25, subPhase = .5, lfoPhase = 0, driftPhase1 = .17, driftPhase2 = .61, lfo = 0, pitchRatio1 = 1, pitchRatio2 = 1, pulse = p.pulseWidth;
      let targetFrequency = 0, frequency = 0, acceptedFrequency = 0, oscillatorGain = 0, detector = 0, gateDetector = 0, slowDetector = 0, inputGate = false, ampEnvelope = 0, filterEnvelope = 0, envelopeStage = 0, retriggerGuard = 0;
      let g = .01, targetG = .01, actualCutoff = p.cutoff, controlFrame = 0, sampleClock = 0, expectedBeat = NaN, wetTransition = 0, pendingTransition = false, quietSamples = 0;
      let filterK = 0, filterA = 0, filterG = 0, filterG2 = 0, filterG3 = 0, filterG4 = 0, filterDenominator = 1, filterOutputDrive = 1, oscillatorDenominator = 1, attackIncrement = 0, followerRelease = 0;
      let noteVelocity = 1, velocityWindow = 0, lastTouch = 0, releaseTouch = 0, voiceAuthorized = false, pitchHold = 0;
      let inputPeak = 0, synthPeak = 0, outputPeak = 0, lastTopology = '', initialized = false;
      function clear() {
        tracker.reset(); filters.fill(0); previousFilterInput.fill(0); hpLow.fill(0); dcInput.fill(0); dcState.fill(0);
        lastWet.fill(0); correction.fill(0); phase1 = .5; phase2 = .25; subPhase = .5; lfoPhase = 0; driftPhase1 = .17; driftPhase2 = .61;
        targetFrequency = frequency = acceptedFrequency = oscillatorGain = detector = gateDetector = slowDetector = ampEnvelope = filterEnvelope = 0;
        inputGate = false; voiceAuthorized = false; pitchHold = 0; noteVelocity = 1; velocityWindow = 0; lastTouch = releaseTouch = 0; envelopeStage = retriggerGuard = wetTransition = controlFrame = sampleClock = quietSamples = 0; pendingTransition = false; expectedBeat = NaN; idle = true;
      }
      function update(previous) {
        if (midiCapture?.active && previous) {
          if (['mode', 'inputRange', 'gate', 'sensitivity', 'tracking'].some(key => previous[key] !== p[key])) midiCapture.stop('tracking settings changed');
          else if (p.bypass || p.mix === 0) midiCapture.stop(p.bypass ? 'bypassed' : 'zero blend');
        }
        sensitivityGain = db(p.sensitivity); threshold = db(p.gate);
        hpCoefficient = 1 - Math.exp(-TAU * (p.inputRange === 'bass' ? 20 : p.inputRange === 'guitar' ? 45 : 25) / sr);
        attackCoefficient = 1 - Math.exp(-6.907755278982137 / (sr * p.attack * .001));
        decayCoefficient = 1 - Math.exp(-6.907755278982137 / (sr * p.decay * .001));
        releaseCoefficient = Math.exp(-6.907755278982137 / (sr * p.release * .001));
        attackIncrement = 1 / (sr * p.attack * .001); followerRelease = 1 - releaseCoefficient;
        glideCoefficient = p.glide === 0 ? 1 : 1 - Math.exp(-1 / (sr * p.glide * .001));
        driveTarget = db(p.drive); outputTarget = db(p.output); targetCutoffLog = Math.log(p.cutoff);
        const register = p.register === 'bass' ? .5 : p.register === 'guitar' ? 2 : 1;
        ratio1 = register * Math.pow(2, p.osc1Octave); ratio2 = register * Math.pow(2, (p.interval + p.detune / 100) / 12);
        oscillatorDenominator = 1 + p.osc2Level + p.subLevel;
        tracker.setParams({ range: p.inputRange, tracking: p.tracking, sensitivity: p.gate });
        if (previous && previous.envMode !== p.envMode) { envelopeStage = inputGate ? 1 : ampEnvelope > 0 ? 4 : 0; noteVelocity = clamp(detector * 7, .02, 1); velocityWindow = 0; }
        const topology = [p.mode, p.filterModel, p.filterMode, p.osc1Wave, p.osc2Wave, p.register].join('|');
        if (initialized && topology !== lastTopology) {
          filters.fill(0); previousFilterInput.fill(0); dcInput.fill(0); dcState.fill(0); pendingTransition = true;
          if (previous && previous.mode !== p.mode) { tracker.reset(); targetFrequency = frequency = acceptedFrequency = oscillatorGain = 0; voiceAuthorized = false; pitchHold = 0; }
        }
        lastTopology = topology;
        const nextMix = p.bypass ? 0 : p.mix;
        if (nextMix !== mixTarget) { mixTarget = nextMix; mixRemaining = fadeFrames; }
        if (suspended && nextMix > 0) { clear(); suspended = false; mix = 0; mixRemaining = fadeFrames; }
        if (!initialized) {
          gain = driveTarget; outputGain = outputTarget; cutoffLog = Math.log(p.cutoff); resonance = p.resonance; synthLevel = p.synthLevel; direct = p.direct; width = p.width;
          actualCutoff = clamp(p.cutoff, 20, maxHz); g = targetG = Math.tan(PI * actualCutoff / subRate); initialized = true;
        }
      }
      function trigger() { envelopeStage = 1; retriggerGuard = retriggerFrames; noteVelocity = .02; velocityWindow = velocityFrames; }
      function filterCoefficients() {
        // The existing g/resonance smoothers advance once per output sample.
        // Both channels and both half steps therefore share these exact values.
        if (p.filterModel === 'svf') { filterK = 2 - 1.94 * resonance; filterA = 1 / (1 + g * (g + filterK)); }
        else { filterG = g / (1 + g); filterG2 = filterG * filterG; filterG3 = filterG2 * filterG; filterG4 = filterG2 * filterG2; filterK = resonance * (p.filterModel === 'ota' ? 3.72 : 3.96); filterDenominator = 1 + filterK * filterG4; filterOutputDrive = 1 + resonance * .55; }
      }
      function filterSample(x, channel) {
        const at = channel * 4;
        if (p.filterModel === 'svf') {
          const k = filterK, a = filterA;
          const driven = soft(x), v3 = driven - filters[at + 1], v1 = a * (filters[at] + g * v3), v2 = filters[at + 1] + g * v1;
          filters[at] = safe(2 * v1 - filters[at]); filters[at + 1] = safe(2 * v2 - filters[at + 1]);
          const result = p.filterMode === 'highpass' ? driven - k * v1 - v2 : p.filterMode === 'bandpass' ? k * v1 : v2;
          return soft(result * .8) / .8;
        }
        const G = filterG, G2 = filterG2, G3 = filterG3;
        const ota = p.filterModel === 'ota', k = filterK;
        const s0 = filters[at], s1 = filters[at + 1], s2 = filters[at + 2], s3 = filters[at + 3];
        const memory = (1 - G) * (G3 * s0 + G2 * s1 + G * s2 + s3);
        let u = (x - k * memory) / filterDenominator;
        u = ota ? soft(u * 1.08 + .04) - otaBias : soft(u);
        let v = (u - s0) * G, y1 = v + s0; filters[at] = safe(y1 + v);
        let input = ota ? soft(y1 * 1.08) / 1.08 : y1;
        v = (input - s1) * G; const y2 = v + s1; filters[at + 1] = safe(y2 + v);
        input = ota ? soft(y2 * .96) / .96 : y2;
        v = (input - s2) * G; const y3 = v + s2; filters[at + 2] = safe(y3 + v);
        input = ota ? soft(y3 * 1.12) / 1.12 : y3;
        v = (input - s3) * G; const y4 = v + s3; filters[at + 3] = safe(y4 + v);
        const result = p.filterMode === 'highpass' ? u - 4 * y1 + 6 * y2 - 4 * y3 + y4 : p.filterMode === 'bandpass' ? 4 * (y2 - 2 * y3 + y4) : y4;
        return soft(result * filterOutputDrive);
      }
      function filtered(x, channel) {
        const previous = previousFilterInput[channel]; previousFilterInput[channel] = x;
        filterSample((previous + x) * .5, channel); return filterSample(x, channel);
      }
      function process(left, right, context) {
        if (!left || !right || left.length !== right.length) throw Error('FERMENT requires equal stereo blocks.');
        const capture = midiCapture?.active ? midiCapture : null;
        if (suspended) { if (capture) capture.advance(left.length); for (let frame = 0; frame < left.length; frame++) { if (!Number.isFinite(left[frame])) left[frame] = 0; if (!Number.isFinite(right[frame])) right[frame] = 0; } return; }
        if (idle && !mixRemaining) {
          let silent = true; for (let frame = 0; frame < left.length; frame++) if (left[frame] !== 0 || right[frame] !== 0) { silent = false; break; }
          if (silent) { if (capture) capture.advance(left.length); return; }
        }
        const tempo = clamp(finite(context && context.tempo, 120), 40, 300), cycleBeats = divisions[p.division], running = context?.playing !== false;
        const lfoRate = p.clock === 'sync' ? tempo / (60 * cycleBeats) : p.rate, lfoStep = lfoRate / sr;
        const beat = finite(context && context.beat, 0), beatAdvance = tempo / (60 * sr);
        if (p.clock === 'sync' && running && (!Number.isFinite(expectedBeat) || Math.abs(beat - expectedBeat) > 1e-4)) lfoPhase = ((beat / cycleBeats) % 1 + 1) % 1;
        expectedBeat = running ? beat + left.length * beatAdvance : beat;
        for (let frame = 0; frame < left.length; frame++) {
          const dryL = Number.isFinite(left[frame]) ? left[frame] : 0, dryR = Number.isFinite(right[frame]) ? right[frame] : 0;
          if (suspended) { if (capture?.active) capture.advance(1); left[frame] = dryL; right[frame] = dryR; continue; }
          if (idle && dryL === 0 && dryR === 0) {
            if (capture?.active) capture.advance(1);
            if (mixRemaining) { mix += (mixTarget - mix) / mixRemaining; if (--mixRemaining === 0) { mix = mixTarget; if (mix === 0) suspended = true; } }
            left[frame] = dryL; right[frame] = dryR; continue;
          }
          if (idle) {
            idle = false; controlFrame = 0;
            if (p.clock === 'sync' && running) lfoPhase = (((beat + frame * beatAdvance) / cycleBeats) % 1 + 1) % 1;
          }
          const inputL = clamp(dryL, -8, 8), inputR = clamp(dryR, -8, 8);
          hpLow[0] += hpCoefficient * (inputL - hpLow[0]); hpLow[1] += hpCoefficient * (inputR - hpLow[1]);
          const conditionedL = inputL - hpLow[0], conditionedR = inputR - hpLow[1], monoInput = (conditionedL + conditionedR) * .5;
          const detectorInput = Math.min(8, Math.max(Math.abs(conditionedL), Math.abs(conditionedR)) * sensitivityGain);
          const beforeDetector = detector;
          detector = detectorInput > detector ? detector + detectorAttack * (detectorInput - detector) : detector * detectorRelease;
          slowDetector += slowDetectorCoefficient * (detector - slowDetector);
          gateDetector = detectorInput > gateDetector ? gateDetector + detectorAttack * (detectorInput - gateDetector) : gateDetector * gateDecay;
          const priorGate = inputGate; inputGate = gateDetector >= threshold * (inputGate ? .7 : 1.2);
          let midiOnset = capture && inputGate && !priorGate, midiFresh = false;
          if (inputGate && !priorGate) trigger();
          if (!inputGate && priorGate) releaseTouch = lastTouch;
          if (retriggerGuard > 0) retriggerGuard--;
          if ((p.retrigger === 'each' || capture?.active) && inputGate && retriggerGuard === 0 && detector > Math.max(threshold * 4, slowDetector * 1.75) && detector > beforeDetector * 1.005) { if (capture) midiOnset = true; if (p.retrigger === 'each') trigger(); }
          if (p.mode === 'track') {
            const changed = tracker.push(monoInput * sensitivityGain);
            if (capture) midiFresh = changed;
            if (changed && tracker.active && tracker.frequency > 0) {
              const nextFrequency = tracker.frequency;
              if (p.retrigger === 'each' && acceptedFrequency > 0 && Math.abs(Math.log(nextFrequency / acceptedFrequency)) > .055 && inputGate) trigger();
              acceptedFrequency = nextFrequency; targetFrequency = nextFrequency;
              if (!frequency) frequency = nextFrequency;
            }
          } else if (capture?.active) midiFresh = tracker.push(monoInput * sensitivityGain);
          const confident = p.mode === 'track' && inputGate && tracker.active && tracker.confidence >= .45 && targetFrequency > 0;
          if (confident) { voiceAuthorized = true; pitchHold = pitchHoldFrames; }
          else if (inputGate && voiceAuthorized && pitchHold > 0 && --pitchHold === 0) voiceAuthorized = false;
          if (!inputGate && ampEnvelope <= 1e-7) voiceAuthorized = false;
          // A detector can retire before the slower amplitude gate closes. Hold
          // that accepted note through a short dropout and its release, rather
          // than dipping out and reappearing at the release boundary.
          const locked = p.mode === 'track' && voiceAuthorized && targetFrequency > 0 && (inputGate || ampEnvelope > 1e-7);
          oscillatorGain += ((locked ? 1 : 0) - oscillatorGain) * slew;
          if (Math.abs(oscillatorGain) < 1e-12) oscillatorGain = 0;
          if (targetFrequency > 0) frequency += (targetFrequency - frequency) * glideCoefficient;
          const touch = clamp(detector * 7, 0, 1);
          if (capture?.active) capture.observe(tracker.active ? tracker.frequency : 0, tracker.confidence, touch, inputGate, midiFresh, midiOnset);
          if (velocityWindow > 0) { if (inputGate) noteVelocity = Math.max(noteVelocity, touch); velocityWindow--; }
          if (inputGate) lastTouch = touch;
          if (p.envMode === 'follower') {
            const goal = inputGate ? touch : 0;
            ampEnvelope += (goal - ampEnvelope) * (goal >= ampEnvelope ? attackCoefficient : followerRelease);
          } else {
            if (!inputGate && envelopeStage !== 0) envelopeStage = 4;
            if (envelopeStage === 1) { ampEnvelope += attackIncrement; if (ampEnvelope >= 1) { ampEnvelope = 1; envelopeStage = 2; } }
            else if (envelopeStage === 2) { ampEnvelope += (p.sustain - ampEnvelope) * decayCoefficient; if (Math.abs(ampEnvelope - p.sustain) < 1e-5) { ampEnvelope = p.sustain; envelopeStage = 3; } }
            else if (envelopeStage === 3) ampEnvelope = p.sustain;
            else if (envelopeStage === 4) ampEnvelope *= releaseCoefficient;
          }
          if (ampEnvelope < 1e-7 && !inputGate) { ampEnvelope = 0; envelopeStage = 0; }
          filterEnvelope = ampEnvelope;
          gain += (driveTarget - gain) * slew; outputGain += (outputTarget - outputGain) * slew; resonance += (p.resonance - resonance) * slew; synthLevel += (p.synthLevel - synthLevel) * slew; direct += (p.direct - direct) * slew; width += (p.width - width) * slew;
          cutoffLog += (targetCutoffLog - cutoffLog) * slew;
          if ((controlFrame++ & 15) === 0) {
            lfo = p.wave === 'triangle' ? 1 - 4 * Math.abs(lfoPhase - .5) : Math.sin(TAU * lfoPhase);
            const vibrato = p.mode === 'track' ? lfo * p.depth * p.vibrato : 0;
            const drift1 = p.drift > 0 ? Math.sin(TAU * driftPhase1) * p.drift * 7 : 0, drift2 = p.drift > 0 ? Math.sin(TAU * driftPhase2) * p.drift * 9 : 0;
            pitchRatio1 = ratio1 * Math.pow(2, (vibrato + drift1) / 1200); pitchRatio2 = ratio2 * Math.pow(2, (vibrato + drift2) / 1200);
            const key = p.mode === 'track' && frequency > 0 ? p.keyTrack * Math.log(Math.max(20, frequency) / 261.6255653005986) : 0;
            const cutoff = clamp(Math.exp(cutoffLog + key + LN2 / 12 * (p.envAmount * filterEnvelope + p.filterLfo * p.depth * lfo)), 20, maxHz);
            actualCutoff = cutoff; targetG = Math.tan(PI * cutoff * (p.filterModel === 'ota' ? 1.08 : 1) / subRate);
          }
          g += (targetG - g) * .12;
          filterCoefficients();
          pulse += (clamp(p.pulseWidth + lfo * p.depth * p.pwm * .45, .05, .95) - pulse) * slew;
          let rawL, rawR;
          if (p.mode === 'track') {
            const inc1 = clamp(frequency * pitchRatio1 / sr, 0, .42), inc2 = clamp(frequency * pitchRatio2 / sr, 0, .42), incSub = inc1 * .5;
            const a = oscillatorSample(phase1, inc1, p.osc1Wave, pulse), b = oscillatorSample(phase2, inc2, p.osc2Wave, pulse), sub = oscillatorSample(subPhase, incSub, 'pulse', .5);
            phase1 += inc1; if (phase1 >= 1) phase1 -= 1; phase2 += inc2; if (phase2 >= 1) phase2 -= 1; subPhase += incSub; if (subPhase >= 1) subPhase -= 1;
            const source = (a + b * p.osc2Level + sub * p.subLevel) / oscillatorDenominator, side = (a - b) * p.osc2Level * width * .22;
            const oscillator = synthLevel * oscillatorGain * (1 - direct);
            rawL = (source + side) * oscillator + conditionedL * direct; rawR = (source - side) * oscillator + conditionedR * direct;
          } else {
            const middle = monoInput, spread = (conditionedL - conditionedR) * width * .5;
            rawL = soft((middle + spread) * 6) * synthLevel * (1 - direct) + conditionedL * direct;
            rawR = soft((middle - spread) * 6) * synthLevel * (1 - direct) + conditionedR * direct;
          }
          const dynamics = p.envMode === 'adsr' ? noteVelocity : inputGate ? touch : releaseTouch;
          const amplitude = ampEnvelope * ((1 - p.velocity) + p.velocity * dynamics), normalization = 1 / Math.sqrt(Math.max(1, gain));
          let wetL = filtered(rawL * gain, 0) * normalization * amplitude * outputGain, wetR = filtered(rawR * gain, 1) * normalization * amplitude * outputGain;
          let dc = wetL - dcInput[0] + dcDecay * dcState[0]; dcInput[0] = wetL; dcState[0] = safe(dc); wetL = dcState[0];
          dc = wetR - dcInput[1] + dcDecay * dcState[1]; dcInput[1] = wetR; dcState[1] = safe(dc); wetR = dcState[1];
          if (pendingTransition) { correction[0] = lastWet[0] - wetL; correction[1] = lastWet[1] - wetR; wetTransition = fadeFrames; pendingTransition = false; }
          if (wetTransition) { const amount = .5 - .5 * Math.cos(PI * wetTransition / fadeFrames); wetL += correction[0] * amount; wetR += correction[1] * amount; wetTransition--; }
          lastWet[0] = wetL; lastWet[1] = wetR;
          left[frame] = outputSafe(mix === 1 ? wetL : dryL + (wetL - dryL) * mix); right[frame] = outputSafe(mix === 1 ? wetR : dryR + (wetR - dryR) * mix);
          inputPeak = Math.max(inputPeak * peakDecay, Math.abs(dryL), Math.abs(dryR)); synthPeak = Math.max(synthPeak * peakDecay, Math.abs(wetL), Math.abs(wetR)); outputPeak = Math.max(outputPeak * peakDecay, Math.abs(left[frame]), Math.abs(right[frame]));
          if (mixRemaining) { mix += (mixTarget - mix) / mixRemaining; if (--mixRemaining === 0) { mix = mixTarget; if (mix === 0) suspended = true; } }
          lfoPhase += lfoStep; if (lfoPhase >= 1) lfoPhase -= Math.floor(lfoPhase);
          driftPhase1 += driftStep1; if (driftPhase1 >= 1) driftPhase1--; driftPhase2 += driftStep2; if (driftPhase2 >= 1) driftPhase2--;
          sampleClock++;
          if (!inputGate && ampEnvelope === 0 && detector < threshold * .1) quietSamples++; else quietSamples = 0;
          if (quietSamples >= quietFrames) {
            clear(); inputPeak = synthPeak = outputPeak = 0;
          }
        }
      }
      update();
      return {
        setParams(values) { const previous = p; p = normalize(Object.assign({}, p, values && typeof values === 'object' ? values : {})); update(previous); },
        process,
        startMidiCapture(options) { if (!makeMidi) throw Error('FERMENT note capture is unavailable.'); if (p.bypass || p.mix === 0) throw Error('Enable FERMENT and raise Blend before capturing notes.'); if (!midiCapture) midiCapture = new (makeMidi().Capture)(sr); const take = midiCapture.start(options); if (p.mode === 'chord') tracker.reset(); return take; },
        stopMidiCapture(reason = 'stopped') { return midiCapture ? midiCapture.stop(reason) : null; },
        drainMidiEvents() { return midiCapture ? midiCapture.drain() : null; },
        reset() { if (midiCapture?.active) midiCapture.stop('reset'); clear(); gain = driveTarget; outputGain = outputTarget; cutoffLog = Math.log(p.cutoff); resonance = p.resonance; synthLevel = p.synthLevel; direct = p.direct; width = p.width; mix = mixTarget = p.bypass ? 0 : p.mix; mixRemaining = 0; suspended = mix === 0; actualCutoff = clamp(p.cutoff, 20, maxHz); g = targetG = Math.tan(PI * actualCutoff / subRate); },
        getTailTime() { return suspended || idle ? 0 : Math.min(6, p.release * .001 * 1.8 + .4); },
        getMeters() { return { frequencyHz: p.mode === 'track' && !idle ? tracker.frequency : 0, synthFrequencyHz: p.mode === 'track' && !idle ? frequency * ratio1 : 0, confidence: p.mode === 'track' && !idle ? tracker.confidence : 0, trackingLatencyMs: p.mode === 'track' ? tracker.trackingLatencyMs : 0, inputDb: levelDb(inputPeak), synthDb: levelDb(synthPeak), outputDb: levelDb(outputPeak), cutoffHz: actualCutoff, envelope: ampEnvelope, gateOpen: inputGate, mode: p.mode, active: !suspended && !idle }; }
      };
    }
    return { specifications, normalize, create, oscillatorSample };
  }
  scope.createLoomPedalSynthDSP = createLoomPedalSynthDSP;
})(typeof window === 'undefined' ? globalThis : window);
