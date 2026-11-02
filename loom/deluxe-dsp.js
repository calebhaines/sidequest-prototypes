/* SUNDAY · five original AB763 interpretations, with unforced playing dynamics. */
(function (scope) {
  'use strict';
  function createLoomDeluxeDSP() {
    'use strict';
    // Self-contained: GALLEY serializes this factory into its AudioWorklet.
    const PI = Math.PI, TAU = PI * 2;
    const specifications = {
      model: ['nodal', 'charge', 'feedback', 'adaa', 'reactive'],
      input: [-24, 18, 0], volume: [0, 10, 3], bass: [0, 10, 5], treble: [0, 10, 5], reverb: [0, 10, 2], speed: [1, 10, 4], intensity: [0, 10, 0], output: [-30, 12, 0], mix: [0, 1, 1],
      channel: ['vibrato', 'normal'], jack: ['high', 'low'], headroom: [-12, 12, 0], mid: [0, 10, 5], bright: ['stock', 'off', 'on'], supply: [.8, 1.2, 1], bias: [-.5, .5, 0], sag: [0, 1, .2], feedback: [0, 1, .5], speakerDrive: [0, 1, 0], speakerLoad: [0, 1, .5], cabinet: ['open112', 'di'], mic: [0, 1, .45], distance: [0, 1, .2], air: [0, 1, .2], stereo: ['mono', 'stereo'], trim: ['matched', 'raw'], quality: ['high', 'eco']
    };
    const keys = Object.keys(specifications), modelNames = specifications.model;
    const rawGain = [1.04, .97, 1.09, .94, 1.02];
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const finite = (x, fallback) => typeof x === 'number' && Number.isFinite(x) ? x : fallback;
    const safe = x => x >= -32 && x <= 32 ? x : Number.isFinite(x) ? clamp(x, -32, 32) : 0;
    const bound = x => x >= -8 && x <= 8 ? x : Number.isFinite(x) ? clamp(x, -8, 8) : 0;
    const db = x => Math.pow(10, x / 20);
    const levelDb = x => 20 * Math.log10(Math.max(1e-6, x));
    function normalize(value) {
      const source = value && typeof value === 'object' ? value : {}, p = {};
      for (const key of keys) { const r = specifications[key]; p[key] = typeof r[0] === 'number' ? clamp(finite(source[key], r[2]), r[0], r[1]) : r.includes(source[key]) ? source[key] : r[0]; }
      p.bypass = source.bypass === true; return p;
    }
    // The same verified AB763 passive network is used by all five studies.
    // S=plate source, A=slope junction, T=treble top, B=bass top,
    // M=fixed mid leg, W=treble wiper/1M volume load. The treble LOWER end
    // terminates at B (not M); this preserves the bass/treble interaction.
    function toneCoefficients(sr, bass, treble, mid, out) {
      const n = 6, matrix = new Float64Array(72), capG = [2 * sr * 250e-12, 2 * sr * .1e-6, 2 * sr * .047e-6], ca = [0, 1, 1], cb = [2, 3, 4], sourceG = 1 / 38000;
      const edge = (a, b, g) => { matrix[a * 12 + a] += g; if (b >= 0) { matrix[b * 12 + b] += g; matrix[a * 12 + b] -= g; matrix[b * 12 + a] -= g; } };
      edge(0, -1, sourceG); edge(0, 1, 1 / 100000);
      edge(3, 4, 1 / (1 + 250000 * Math.pow(bass / 10, 2)));
      edge(4, -1, 1 / (6800 * Math.pow(10, (mid - 5) / 10)));
      edge(2, 5, 1 / (1 + 250000 * (1 - treble / 10)));
      edge(5, 3, 1 / (1 + 250000 * treble / 10)); edge(5, -1, 1 / 1000000);
      for (let c = 0; c < 3; c++) edge(ca[c], cb[c], capG[c]);
      for (let row = 0; row < n; row++) matrix[row * 12 + 6 + row] = 1;
      for (let col = 0; col < n; col++) {
        let pivot = col; for (let row = col + 1; row < n; row++) if (Math.abs(matrix[row * 12 + col]) > Math.abs(matrix[pivot * 12 + col])) pivot = row;
        if (pivot !== col) for (let k = 0; k < 12; k++) { const t = matrix[col * 12 + k]; matrix[col * 12 + k] = matrix[pivot * 12 + k]; matrix[pivot * 12 + k] = t; }
        const scale = matrix[col * 12 + col]; for (let k = 0; k < 12; k++) matrix[col * 12 + k] /= scale;
        for (let row = 0; row < n; row++) if (row !== col) { const scale = matrix[row * 12 + col]; for (let k = 0; k < 12; k++) matrix[row * 12 + k] -= scale * matrix[col * 12 + k]; }
      }
      for (let row = 0; row < n; row++) { const at = row * 4; out[at] = matrix[row * 12 + 6] * sourceG; for (let c = 0; c < 3; c++) out[at + 1 + c] = matrix[row * 12 + 6 + cb[c]] - matrix[row * 12 + 6 + ca[c]]; }
      return capG;
    }
    function biquad(kind, hz, gain, q, sr, c) {
      const w = TAU * clamp(hz, 5, sr * .44) / sr, cs = Math.cos(w), sn = Math.sin(w), a = sn / (2 * q), A = Math.pow(10, gain / 40); let b0, b1, b2, a0, a1, a2;
      if (kind === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + a; a1 = -2 * cs; a2 = 1 - a; }
      else if (kind === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + a; a1 = -2 * cs; a2 = 1 - a; }
      else { b0 = 1 + a * A; b1 = -2 * cs; b2 = 1 - a * A; a0 = 1 + a / A; a1 = -2 * cs; a2 = 1 - a / A; }
      c[0] = b0 / a0; c[1] = b1 / a0; c[2] = b2 / a0; c[3] = a1 / a0; c[4] = a2 / a0;
    }
    const makeFilter = () => ({ c: new Float64Array(5), state: new Float64Array(4) });
    function filter(f, x, channel) { const at = channel * 2, c = f.c, z = f.state, y = c[0] * x + z[at]; z[at] = c[1] * x - c[3] * y + z[at + 1]; z[at + 1] = c[2] * x - c[4] * y; return y; }
    // Analytic odd plate law and its antiderivative. The central portion is
    // exactly linear; a playing envelope never sets its gain or threshold.
    function knee(x) { const a = Math.abs(x); return a <= .5 ? x : Math.sign(x) * (1.5 - 1 / (a + .5)); }
    function area(x) { const a = Math.abs(x); if (a <= .5) return .5 * a * a; const t = a - .5; return .125 + 1.5 * t - Math.log1p(t); }
    function node(x, strength, asymmetry) {
      let y = x / (1 + strength * x * x * .45);
      for (let i = 0; i < 3; i++) { const y2 = y * y, f = y + strength * y * y2 + asymmetry * y2 / (1 + y2) - x, d = 1 + 3 * strength * y2 + 2 * asymmetry * y / ((1 + y2) * (1 + y2)); y = clamp(y - f / d, -6, 6); }
      return y;
    }
    function create(sampleRate, values) {
      const sr = clamp(finite(sampleRate, 48000), 8000, 192000); let p = normalize(values), os = p.quality === 'high' ? 4 : 2, subRate = sr * os;
      const ramp = Math.max(1, Math.round(sr * .006)), slew = 1 - Math.exp(-1 / (sr * .006)), meterDecay = Math.exp(-1 / (sr * .12));
      let model = modelNames.indexOf(p.model), inputGain = 1, inputTarget = 1, volumeGain = 1, volumeTarget = 1, outGain = 1, outTarget = 1, mix = p.bypass ? 0 : p.mix, mixTarget = mix, mixRemaining = 0, suspended = mix === 0;
      let threshold = 1, preThreshold = 4, matched = 1, brightAmount = 0, brightTarget = 0, revAmount = 0, revTarget = 0, tremAmount = 0, tremTarget = 0, tremHz = 4, tremPhase = 0;
      let supplyState = 0, demand = 0, actualHead = 1, sagDepth = 0, quiet = 0, sleeping = false, peakIn = 0, peakOut = 0, energyIn = 0, energyOut = 0, powerPeak = 0, lastPowerPeak = 0, powerMeterPeak = 0;
      const tone = new Float64Array(24), toneTarget = new Float64Array(24), toneStep = new Float64Array(24), toneHistory = new Float64Array(6), toneV = new Float64Array(6); let capG = new Float64Array(3), toneRemaining = 0;
      const previousInput = new Float64Array(2), previousPower = new Float64Array(2), preDown = new Float64Array(8), powerDown = new Float64Array(8), brightLow = new Float64Array(2), dcIn = new Float64Array(2), dcOut = new Float64Array(2);
      const charge = new Float64Array(8), cathode = new Float64Array(8), adaaPrevious = new Float64Array(8), load = new Float64Array(2), flux = new Float64Array(2), pairMemory = new Float64Array(2);
      const cabinet = [makeFilter(), makeFilter(), makeFilter(), makeFilter()], room = [new Float64Array(Math.ceil(sr * .025) + 2), new Float64Array(Math.ceil(sr * .025) + 2)]; let roomAt = 0;
      const lengths = [.0297, .0371, .0473], tank = [0, 1].map(ch => lengths.map((seconds, index) => new Float64Array(Math.max(17, Math.round(sr * (seconds + ch * .00031 + index * .00017))))));
      const tankAt = new Int32Array(6), tankLow = new Float64Array(6), dispersion = [0, 1].map(ch => [.00113, .00171, .00227].map((seconds, i) => new Float64Array(Math.max(3, Math.round(sr * (seconds + ch * .00007 + i * .00009))))));
      const dispersionAt = new Int32Array(6), springLow = new Float64Array(2), lastWet = new Float64Array(2), transitionOffset = new Float64Array(2); let transition = 0, pendingTransition = false;
      let aa = 0, brightCoefficient = 0, couplingCoefficient = 0, cathodeCoefficient = 0, dcCoefficient = 0, loadCoefficient = 0, fluxCoefficient = 0, revDamp = 0, springHp = 0;
      let preLaterHead = 1, preAsymmetry = 0, reactiveAsymmetry = 0, powerFeedback = 0, powerHeadScale = 1, powerAsymmetry = 0, powerBiasKnee = 0, feedbackGain = 1, feedbackDenominator = 1, feedbackNormalization = 1;
      let loadAmount = 0, reactiveLoadAmount = 0, reactiveStrength = 0, powerBiasAmount = 0, speakerGain = 1, roomDelay = 0, tremStep = 0, safeThreshold = 1;
      const sagAttack = 1 - Math.exp(-1 / (sr * .035)), sagRelease = 1 - Math.exp(-1 / (sr * .22)), energyCoefficient = 1 - Math.exp(-1 / (sr * .05));
      function clearAudio(all = true) {
        toneHistory.fill(0); previousInput.fill(0); previousPower.fill(0); preDown.fill(0); powerDown.fill(0); brightLow.fill(0); dcIn.fill(0); dcOut.fill(0); charge.fill(0); cathode.fill(0); adaaPrevious.fill(0); load.fill(0); flux.fill(0); pairMemory.fill(0);
        for (const f of cabinet) f.state.fill(0); for (const r of room) r.fill(0); roomAt = 0;
        for (const rows of tank) for (const ring of rows) ring.fill(0); for (const rows of dispersion) for (const ring of rows) ring.fill(0);
        tankAt.fill(0); tankLow.fill(0); dispersionAt.fill(0); springLow.fill(0); lastWet.fill(0); transitionOffset.fill(0); transition = 0; pendingTransition = false; supplyState = demand = quiet = lastPowerPeak = powerPeak = powerMeterPeak = 0; actualHead = threshold; sleeping = true;
        if (all) tremPhase = 0;
      }
      function update(previous) {
        const oldOs = os; os = p.quality === 'high' ? 4 : 2; subRate = sr * os;
        model = modelNames.indexOf(p.model);
        if (!previous || previous.input !== p.input || previous.jack !== p.jack) inputTarget = db(p.input) * (p.jack === 'low' ? .5011872336 : 1);
        // Reference DI scale: .126 peak (-18 dBFS) at Volume3 has substantial
        // voltage margin. Output is a separate post-amp listening trim.
        if (!previous || previous.volume !== p.volume) volumeTarget = Math.pow(p.volume / 3, 2);
        if (!previous || previous.output !== p.output) outTarget = db(p.output);
        if (!previous || previous.headroom !== p.headroom || previous.supply !== p.supply) { threshold = 1.05 * db(p.headroom) * p.supply; preThreshold = 4.2 * db(p.headroom) * Math.sqrt(p.supply); }
        // These depend only on the current controls, not the oversampled
        // voltage/state. Preserve the original arithmetic and its grouping.
        preLaterHead = preThreshold * .7; preAsymmetry = .035 + p.bias * .035; reactiveAsymmetry = preAsymmetry * 1.4;
        powerFeedback = p.feedback * 1.3; powerHeadScale = model === 2 ? 1 : 1 + .25 * (p.feedback - .5); powerAsymmetry = p.bias * .09; powerBiasKnee = knee(powerAsymmetry);
        feedbackGain = 1 + powerFeedback; feedbackDenominator = 1 + powerFeedback * .72; feedbackNormalization = feedbackDenominator / feedbackGain;
        loadAmount = .018 * p.speakerLoad; reactiveLoadAmount = .065 * p.speakerLoad; reactiveStrength = .16 + p.speakerLoad * .06; powerBiasAmount = p.bias * .035;
        speakerGain = 1 + p.speakerDrive * 1.5; roomDelay = Math.min(room[0].length - 1, Math.round(sr * (.003 + p.distance * .018))); safeThreshold = Math.max(threshold, 1e-6);
        if (!previous || previous.model !== p.model || previous.trim !== p.trim) matched = rawGain[model] * (p.trim === 'matched' ? 1 / rawGain[model] : 1);
        if (!previous || previous.bright !== p.bright || previous.channel !== p.channel || previous.volume !== p.volume) brightTarget = p.bright === 'on' || p.bright === 'stock' && p.channel === 'vibrato' ? .28 * (1 - p.volume / 10) : 0;
        if (!previous || previous.channel !== p.channel || previous.reverb !== p.reverb) revTarget = p.channel === 'vibrato' ? Math.pow(p.reverb / 10, 1.5) * .65 : 0;
        tremTarget = p.channel === 'vibrato' ? p.intensity / 10 * .92 : 0; tremHz = 1.5 + p.speed * .7; tremStep = tremHz / sr;
        if (!previous || oldOs !== os) {
          aa = 1 - Math.exp(-TAU * Math.min(18000, sr * .42) / subRate); brightCoefficient = 1 - Math.exp(-TAU * 1900 / subRate); couplingCoefficient = 1 - Math.exp(-TAU * 12 / subRate); cathodeCoefficient = 1 - Math.exp(-TAU * 9 / subRate); dcCoefficient = Math.exp(-TAU * 7 / sr); loadCoefficient = 1 - Math.exp(-TAU * 95 / subRate); fluxCoefficient = 1 - Math.exp(-TAU * 28 / subRate); revDamp = 1 - Math.exp(-TAU * 4100 / sr); springHp = 1 - Math.exp(-TAU * 170 / sr);
        }
        if (!previous || oldOs !== os || previous.bass !== p.bass || previous.treble !== p.treble || previous.mid !== p.mid) {
          capG = toneCoefficients(subRate, p.bass, p.treble, p.mid, toneTarget);
          if (!previous || oldOs !== os) { tone.set(toneTarget); toneStep.fill(0); toneRemaining = 0; }
          else { toneRemaining = ramp * os; for (let i = 0; i < 24; i++) toneStep[i] = (toneTarget[i] - tone[i]) / toneRemaining; }
        }
        if (!previous || previous.speakerLoad !== p.speakerLoad) biquad('hp', 68 - p.speakerLoad * 9, 0, .7, sr, cabinet[0].c);
        if (!previous || previous.mic !== p.mic || previous.air !== p.air || previous.distance !== p.distance) biquad('lp', 4000 + p.mic * 2100 + p.air * 900 - p.distance * 650, 0, .64, sr, cabinet[1].c);
        if (!previous || previous.mic !== p.mic || previous.distance !== p.distance) biquad('peak', 2400 + p.mic * 700, 1.1 + p.mic * 2.4 - p.distance * 2, .7, sr, cabinet[2].c);
        if (!previous || previous.speakerLoad !== p.speakerLoad) biquad('peak', 92 + p.speakerLoad * 15, p.speakerLoad * 3.5, .85, sr, cabinet[3].c);
        const nextMix = p.bypass ? 0 : p.mix;
        if (nextMix !== mixTarget) { mixTarget = nextMix; mixRemaining = ramp; }
        if (suspended && nextMix > 0) { clearAudio(); suspended = false; mix = 0; mixRemaining = ramp; }
        if (previous && (previous.model !== p.model || oldOs !== os || previous.channel !== p.channel || previous.cabinet !== p.cabinet || previous.stereo !== p.stereo)) {
          pendingTransition = true; charge.fill(0); cathode.fill(0); adaaPrevious.fill(0); pairMemory.fill(0); flux.fill(0); load.fill(0);
          if (oldOs !== os) { toneHistory.fill(0); preDown.fill(0); powerDown.fill(0); }
          if (previous.channel !== p.channel) {
            for (const rows of tank) for (const ring of rows) ring.fill(0);
            for (const rows of dispersion) for (const ring of rows) ring.fill(0);
            tankLow.fill(0); springLow.fill(0); tankAt.fill(0); dispersionAt.fill(0);
          }
          if (previous.cabinet !== p.cabinet) { for (const f of cabinet) f.state.fill(0); for (const ring of room) ring.fill(0); roomAt = 0; }
          if (previous.stereo !== p.stereo) {
            // Mono owns one actual amp/tank. An inactive right channel must
            // never replay its old tone, spring, room or nonlinear histories
            // when a stereo pair is selected later. Keep only the last audible
            // samples for the short continuity ramp; clear every hidden state.
            const audibleL = lastWet[0], audibleR = lastWet[1];
            clearAudio(false); lastWet[0] = audibleL; lastWet[1] = audibleR; pendingTransition = true;
          }
        }
      }
      function toneSample(x, channel) {
        const h = channel * 3;
        for (let row = 0; row < 6; row++) { const at = row * 4; toneV[row] = tone[at] * x + tone[at + 1] * toneHistory[h] + tone[at + 2] * toneHistory[h + 1] + tone[at + 3] * toneHistory[h + 2]; }
        toneHistory[h] = -2 * capG[0] * (toneV[0] - toneV[2]) - toneHistory[h]; toneHistory[h + 1] = -2 * capG[1] * (toneV[1] - toneV[3]) - toneHistory[h + 1]; toneHistory[h + 2] = -2 * capG[2] * (toneV[1] - toneV[4]) - toneHistory[h + 2];
        return toneV[5] * 12;
      }
      function valve(x, channel, stage) {
        const at = channel * 4 + stage, head = stage ? preLaterHead : preThreshold * 1, n = clamp(x / head, -20, 20), asym = preAsymmetry;
        if (model === 0) return head * node(n, .11, asym);
        if (model === 1) {
          const conduction = Math.max(0, n - .65); charge[at] += (conduction - charge[at]) * (conduction > charge[at] ? .035 : couplingCoefficient);
          cathode[at] += (n * n - cathode[at]) * cathodeCoefficient;
          const shifted = n - charge[at] * .19; return head * knee(shifted) / (1 + Math.min(2, cathode[at]) * .018);
        }
        if (model === 2) { const u = n + asym * n * n / (1 + n * n); return head * (Math.atan(u * .66) / .66); }
        if (model === 3) { const previous = adaaPrevious[at], difference = n - previous; adaaPrevious[at] = n; const y = Math.abs(difference) < 1e-7 ? knee((n + previous) * .5) : (area(n) - area(previous)) / difference; return head * y; }
        cathode[at] += (n - cathode[at]) * cathodeCoefficient;
        const conductance = 1 + .16 * Math.max(0, Math.abs(n) - .35), shift = n - cathode[at] * .025;
        return head * node(shift / conductance, .065, reactiveAsymmetry);
      }
      function powerSample(x, channel) {
        const feedback = powerFeedback, h = actualHead * powerHeadScale, asym = powerAsymmetry;
        let n = clamp(x / h, -32, 32), y;
        load[channel] += (n - load[channel]) * loadCoefficient;
        n += loadAmount * (n - load[channel]);
        if (model === 0) { const a = node(n * feedbackGain + asym, .20, .018), b = node(-n * feedbackGain + asym, .20, .018); y = .5 * (a - b) / feedbackDenominator; }
        else if (model === 1) {
          const conduction = Math.max(0, Math.abs(n) - .7), at = channel * 4 + 3; charge[at] += (conduction - charge[at]) * (conduction > charge[at] ? .04 : couplingCoefficient);
          const v = n / (1 + charge[at] * .16); y = v / Math.pow(1 + Math.pow(Math.abs(v), 6), 1 / 6);
        } else if (model === 2) {
          y = pairMemory[channel];
          for (let i = 0; i < 4; i++) { const v = feedbackGain * n - feedback * y, z = v + asym, f = knee(z) - powerBiasKnee, a = Math.abs(z), derivative = a <= .5 ? 1 : 1 / ((a + .5) * (a + .5)); y -= (y - f) / (1 + feedback * derivative); }
          pairMemory[channel] = y;
        } else if (model === 3) {
          const at = channel * 4 + 3, v = n * 1.08, previous = adaaPrevious[at], d = v - previous; adaaPrevious[at] = v; y = (Math.abs(d) < 1e-7 ? knee((v + previous) * .5) : (area(v) - area(previous)) / d) / 1.08;
        } else {
          flux[channel] += (n - flux[channel]) * fluxCoefficient;
          const current = n + reactiveLoadAmount * (n - load[channel]), stiffness = 1 + .09 * Math.max(0, Math.abs(flux[channel]) - .3);
          y = node(current / stiffness, reactiveStrength, asym) + loadAmount * (n - load[channel]);
        }
        if (model === 1 || model === 3 || model === 4) y += powerBiasAmount * n * n / (1 + n * n);
        // Individual formulations have unity static gain at their rest point.
        if (model === 0) y *= feedbackNormalization;
        const result = safe(y * h); powerPeak = Math.max(powerPeak, Math.abs(result)); return result;
      }
      function downSample(state, x, channel) {
        const at = channel * 4; state[at] += (x - state[at]) * aa; state[at + 1] += (state[at] - state[at + 1]) * aa; state[at + 2] += (state[at + 1] - state[at + 2]) * aa; state[at + 3] += (state[at + 2] - state[at + 3]) * aa; return state[at + 3];
      }
      const preampOutput = new Float64Array(2);
      function preampPair(xL, xR) {
        const lastL = previousInput[0], lastR = previousInput[1];
        for (let step = 1; step <= os; step++) {
          if (toneRemaining) { if (--toneRemaining === 0) tone.set(toneTarget); else for (let i = 0; i < 24; i++) tone[i] += toneStep[i]; }
          for (let channel = 0; channel < (p.stereo === 'mono' ? 1 : 2); channel++) {
            const x = channel ? xR : xL, last = channel ? lastR : lastL;
            let v = valve(last + (x - last) * step / os, channel, 0); v = toneSample(v, channel); brightLow[channel] += (v - brightLow[channel]) * brightCoefficient; v += (v - brightLow[channel]) * brightAmount; v *= volumeGain;
            v = valve(v, channel, 1); if (p.channel === 'vibrato') v = valve(v * 1.035, channel, 2) / 1.035;
            preampOutput[channel] = downSample(preDown, v, channel);
          }
        }
        if (p.stereo === 'mono') preampOutput[1] = preampOutput[0];
        previousInput[0] = xL; previousInput[1] = xR;
      }
      function spring(x, channel) {
        let y = x;
        for (let i = 0; i < 3; i++) { const at = channel * 3 + i, ring = dispersion[channel][i], pos = dispersionAt[at], old = ring[pos], out = old - .56 * y; ring[pos] = y + out * .56; dispersionAt[at] = (pos + 1) % ring.length; y = out; }
        let sum = 0;
        for (let i = 0; i < 3; i++) { const at = channel * 3 + i, ring = tank[channel][i], pos = tankAt[at], old = ring[pos]; tankLow[at] += (old - tankLow[at]) * revDamp; ring[pos] = safe(y * .22 + tankLow[at] * (.92 - i * .018)); tankAt[at] = (pos + 1) % ring.length; sum += old; }
        springLow[channel] += (sum - springLow[channel]) * springHp; return sum - springLow[channel];
      }
      function cabinetSample(x, channel) {
        if (p.cabinet === 'di') return x;
        let y = x;
        for (const f of cabinet) y = filter(f, y, channel);
        if (p.speakerDrive > 0) { const drive = speakerGain, n = y * drive; y += (knee(n) / drive - y) * p.speakerDrive; }
        const ring = room[channel], at = (roomAt + ring.length - roomDelay) % ring.length, reflection = ring[at]; ring[roomAt % ring.length] = y;
        return y + reflection * p.distance * .13;
      }
      function process(left, right) {
        if (!left || !right || left.length !== right.length) throw Error('SUNDAY requires equal stereo blocks.');
        if (suspended) { peakIn *= Math.pow(meterDecay, left.length); peakOut *= Math.pow(meterDecay, left.length); return; }
        for (let frame = 0; frame < left.length; frame++) {
          const dryL = left[frame], dryR = right[frame], a = safe(dryL), b = safe(dryR); let l, r;
          const peak = Math.max(Math.abs(a), Math.abs(b)); peakIn = Math.max(peak, peakIn * meterDecay); energyIn += ((a * a + b * b) * .5 - energyIn) * energyCoefficient;
          if (sleeping && a === 0 && b === 0 && !mixRemaining && !pendingTransition) { left[frame] = dryL; right[frame] = dryR; peakOut *= meterDecay; energyOut *= 1 - energyCoefficient; continue; }
          sleeping = false;
          inputGain += (inputTarget - inputGain) * slew; volumeGain += (volumeTarget - volumeGain) * slew; outGain += (outTarget - outGain) * slew; brightAmount += (brightTarget - brightAmount) * slew; revAmount += (revTarget - revAmount) * slew; tremAmount += (tremTarget - tremAmount) * slew;
          const xL = (p.stereo === 'mono' ? (a + b) * .5 : a) * inputGain, xR = (p.stereo === 'mono' ? (a + b) * .5 : b) * inputGain;
          preampPair(xL, xR); l = preampOutput[0]; r = preampOutput[1];
          if (revAmount > 1e-6 || revTarget > 0) { l += spring(l, 0) * revAmount; if (p.stereo === 'mono') r = l; else r += spring(r, 1) * revAmount; }
          const trem = tremAmount === 0 ? 1 : 1 - tremAmount * (.5 + .5 * Math.sin(TAU * tremPhase)); tremPhase += tremStep; if (tremPhase >= 1) tremPhase -= 1;
          l *= trem; r *= trem;
          // Supply responds only to overload POWER demand; it never tracks the
          // input envelope to normalize quiet or ordinary picking levels.
          const excessive = Math.max(0, lastPowerPeak / safeThreshold - .55), desired = Math.min(1.5, excessive * excessive);
          supplyState += (desired - supplyState) * (desired > supplyState ? sagAttack : sagRelease); sagDepth = p.sag * supplyState * .22; actualHead = threshold / (1 + sagDepth);
          powerPeak = 0; let wetL = 0, wetR = 0;
          for (let step = 1; step <= os; step++) { wetL = downSample(powerDown, powerSample(previousPower[0] + (l - previousPower[0]) * step / os, 0), 0); if (p.stereo === 'mono') wetR = wetL; else wetR = downSample(powerDown, powerSample(previousPower[1] + (r - previousPower[1]) * step / os, 1), 1); }
          previousPower[0] = l; previousPower[1] = r; lastPowerPeak = powerPeak;
          // Display a short held power peak. The instantaneous physical demand
          // above remains the ONLY source of sag; this meter never sets gain.
          powerMeterPeak = Math.max(powerPeak, powerMeterPeak * meterDecay);
          wetL = cabinetSample(wetL * matched, 0); wetR = p.stereo === 'mono' ? wetL : cabinetSample(wetR * matched, 1); roomAt++; if (roomAt > 0x3fffffff) roomAt %= room[0].length * room[1].length;
          if (p.stereo === 'mono') wetR = wetL;
          const dcL = wetL - dcIn[0] + dcCoefficient * dcOut[0], dcR = wetR - dcIn[1] + dcCoefficient * dcOut[1]; dcIn[0] = wetL; dcIn[1] = wetR; dcOut[0] = dcL; dcOut[1] = dcR; wetL = dcL * outGain; wetR = dcR * outGain;
          if (pendingTransition) { transitionOffset[0] = lastWet[0] - wetL; transitionOffset[1] = lastWet[1] - wetR; transition = ramp; pendingTransition = false; }
          if (transition) { const amount = transition / ramp; wetL += transitionOffset[0] * amount; wetR += transitionOffset[1] * amount; transition--; }
          lastWet[0] = wetL; lastWet[1] = wetR;
          if (mixRemaining) { mix += (mixTarget - mix) / mixRemaining; mixRemaining--; if (!mixRemaining) mix = mixTarget; }
          const outL = mix === 0 ? dryL : bound(a + (wetL - a) * mix), outR = mix === 0 ? dryR : bound(b + (wetR - b) * mix); left[frame] = outL; right[frame] = outR;
          peakOut = Math.max(Math.abs(outL), Math.abs(outR), peakOut * meterDecay); energyOut += ((outL * outL + outR * outR) * .5 - energyOut) * energyCoefficient;
          if (mix === 0 && mixTarget === 0 && !mixRemaining) { clearAudio(); suspended = true; break; }
          if (peak < 1e-9 && Math.max(Math.abs(wetL), Math.abs(wetR)) < 1e-7) quiet++; else quiet = 0;
          if (quiet > sr * .3) clearAudio(false);
        }
      }
      update(null); inputGain = inputTarget; volumeGain = volumeTarget; outGain = outTarget; brightAmount = brightTarget; revAmount = revTarget; tremAmount = tremTarget; actualHead = threshold;
      return {
        setParams(values) { const old = p; p = normalize(Object.assign({}, p, values && typeof values === 'object' ? values : {})); update(old); }, process,
        reset() { clearAudio(); inputGain = inputTarget; volumeGain = volumeTarget; outGain = outTarget; brightAmount = brightTarget; revAmount = revTarget; tremAmount = tremTarget; mix = mixTarget = p.bypass ? 0 : p.mix; mixRemaining = 0; suspended = mix === 0; peakIn = peakOut = energyIn = energyOut = 0; },
        getTailTime() { return suspended || sleeping ? 0 : revTarget ? 3.5 : .45; },
        getMeters() { const inRms = Math.sqrt(Math.max(0, energyIn)), outRms = Math.sqrt(Math.max(0, energyOut)); return { model: p.model, active: !suspended && !sleeping, cabinet: p.cabinet, inputDb: levelDb(peakIn), outputDb: levelDb(peakOut), inputRmsDb: levelDb(inRms), outputRmsDb: levelDb(outRms), inputCrestDb: Math.max(0, levelDb(peakIn) - levelDb(inRms)), outputCrestDb: Math.max(0, levelDb(peakOut) - levelDb(outRms)), headroomDb: clamp(levelDb(actualHead) - levelDb(Math.max(powerMeterPeak, 1e-6)), -60, 120), sagDb: -20 * Math.log10(1 + sagDepth), latencySamples: 0, oversampling: os }; }
      };
    }
    return { specifications, normalize, create, toneCoefficients };
  }
  scope.createLoomDeluxeDSP = createLoomDeluxeDSP;
})(typeof window === 'undefined' ? globalThis : window);
