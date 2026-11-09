/* CELLAR · five original reduced-order studies of the SVT-CL/6550 platform.
 * Controls: ampeg.com/pdf/SVTCL_OM.pdf. Stage ordering: SVT-Classic-Audio-
 * Schematic.pdf (theTubeStore), CL preamp075519-11rev1, page2.
 * Original reduced-order models, not measured hardware captures. The James
 * stage preserves verified R/C connections with disclosed source/load/taper
 * reductions. Selectable-mid and Ultra circuits are calibrated equivalents.
 */
(function (scope) {
  'use strict';
  function createLoomSVTDSP() {
    'use strict';
    // Self-contained: this factory is also serialized into an AudioWorklet.
    const PI = Math.PI, TAU = PI * 2;
    const specifications = {
      model: ['loadline', 'charge', 'feedback', 'adaa', 'reactive'], input: [-24, 18, 0], gain: [0, 10, 3], master: [0, 10, 5], bass: [0, 10, 5], mid: [0, 10, 5], treble: [0, 10, 5], midFreq: ['800', '220', '450', '1600', '3000'], ultraLow: ['off', 'on'], ultraHigh: ['off', 'on'], pad: ['off', 'on'], output: [-30, 12, 0], mix: [0, 1, 1],
      headroom: [-6, 24, 0], supply: [.8, 1.2, 1], bias: [-.5, .5, 0], sag: [0, 1, .2], feedback: [0, 1, .6], transformer: [0, 1, .5], speakerLoad: [0, 1, .5], speakerDrive: [0, 1, 0], cabinet: ['810', 'di'], mic: [0, 1, .4], distance: [0, 1, .2], air: [0, 1, .2], stereo: ['mono', 'stereo'], trim: ['matched', 'raw'], quality: ['high', 'eco']
    };
    const keys = Object.keys(specifications), models = specifications.model, rawTrim = [1, 1.015, .985, 1.008, .992];
    const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
    const finite = (x, fallback) => typeof x === 'number' && Number.isFinite(x) ? x : fallback;
    const safe = x => x >= -32 && x <= 32 ? x : Number.isFinite(x) ? clamp(x, -32, 32) : 0;
    const db = x => Math.pow(10, x / 20), levelDb = x => 20 * Math.log10(Math.max(1e-6, x));
    function normalize(values) { const input = values && typeof values === 'object' ? values : {}, p = {}; for (const key of keys) { const r = specifications[key]; p[key] = typeof r[0] === 'number' ? clamp(finite(input[key], r[2]), r[0], r[1]) : r.includes(input[key]) ? input[key] : r[0]; } p.bypass = input.bypass === true; return p; }
    // Dimensionless monotone plate/load KCL: u = v + a*v² + b*v³.
    // Four bounded Newton steps solve the load line. Its derivative is positive
    // for every permitted a,b, so quiet signals keep their original level ratio.
    function solvePlate(u, a, b) { let v = Math.abs(u) > 4 ? Math.sign(u) * Math.cbrt(Math.abs(u) / b) : u / (1 + .16 * Math.abs(u)); for (let i = 0; i < 4; i++) { const v2 = v * v; v -= (v + a * v2 + b * v2 * v - u) / (1 + 2 * a * v + 3 * b * v2); } return v; }
    function solveFeedback(n, loopGain, asymmetry) {
      let y = solvePlate(n, -Math.sign(n) * Math.abs(asymmetry) / loopGain, .24 / loopGain);
      // Eliminate the internal driver voltage analytically. This is the Schur
      // complement of two plate KCL equations and the global-feedback sum;
      // it avoids repeatedly nesting separate nonlinear solves.
      for (let i = 0; i < 10; i++) { const y2 = y * y, driver = y + asymmetry * y2 + .205 * y2 * y, derivative = (1 + .105 * driver * driver) * (1 + 2 * asymmetry * y + .615 * y2) + loopGain - 1, residual = driver + .035 * driver * driver * driver + (loopGain - 1) * y - loopGain * n; y -= residual / derivative; if (Math.abs(residual) < 1e-11 * (1 + Math.abs(n))) break; }
      return y;
    }
    function plateArea(v, a, b) { const v2 = v * v; return .5 * v2 + (2 / 3) * a * v2 * v + .75 * b * v2 * v2; }
    // Actual CL passive James graph, drawing075519-11rev1: C11/C16=100n,
    // C20=1n,C21=10n,C23=470p,C27=4.7n; R48=220k,R37=22k,
    // R30/R32=100k, both pots1MA. Representative20% Bass/10% Treble midpoint
    // laws calibrate noon behavior; the schematic does not specify pot curves.
    // The plate source is reduced to38k; R40's cathode-bootstrapped470k grid
    // return is approximated as470k to ground. Six capacitor currents form a
    // passive TPT state-space realization; only control changes solve nodes.
    const jamesCaps = [[0, 1, 100e-9], [2, 3, 1e-9], [3, 4, 10e-9], [1, 5, 470e-12], [7, -1, 4.7e-9], [6, 8, 100e-9]];
    function jamesCoefficients(sr, bass, treble, out = new Float64Array(49), workspace = new Float64Array(162)) {
      const matrix = workspace, width = 18, n = 9, sourceG = 1 / 38000; matrix.fill(0);
      const edge = (a, b, g) => { matrix[a * width + a] += g; if (b >= 0) { matrix[b * width + b] += g; matrix[a * width + b] -= g; matrix[b * width + a] -= g; } };
      const bt = Math.pow(clamp(bass, 0, 10) / 10, 2.321928094887362), tt = Math.pow(clamp(treble, 0, 10) / 10, 3.321928094887362);
      edge(0, -1, sourceG); edge(1, 2, 1 / 220000); edge(2, 3, 1 / Math.max(1, 1000000 * (1 - bt))); edge(3, 4, 1 / Math.max(1, 1000000 * bt)); edge(4, -1, 1 / 22000);
      edge(3, 6, 1 / 100000); edge(6, -1, 1 / 100000); edge(5, 6, 1 / Math.max(1, 1000000 * (1 - tt))); edge(6, 7, 1 / Math.max(1, 1000000 * tt)); edge(8, -1, 1 / 470000);
      for (const [a, b, c] of jamesCaps) edge(a, b, 2 * sr * c);
      for (let row = 0; row < n; row++) matrix[row * width + n + row] = 1;
      for (let col = 0; col < n; col++) { let pivot = col; for (let row = col + 1; row < n; row++) if (Math.abs(matrix[row * width + col]) > Math.abs(matrix[pivot * width + col])) pivot = row; if (pivot !== col) for (let k = 0; k < width; k++) { const t = matrix[col * width + k]; matrix[col * width + k] = matrix[pivot * width + k]; matrix[pivot * width + k] = t; } const scale = matrix[col * width + col]; for (let k = 0; k < width; k++) matrix[col * width + k] /= scale; for (let row = 0; row < n; row++) if (row !== col) { const value = matrix[row * width + col]; for (let k = 0; k < width; k++) matrix[row * width + k] -= value * matrix[col * width + k]; } }
      const inverse = (a, b) => a < 0 || b < 0 ? 0 : matrix[a * width + n + b];
      for (let row = 0; row < 6; row++) { const [a, b, c] = jamesCaps[row], g = 2 * sr * c, at = row * 7; out[at] = -2 * g * sourceG * (inverse(a, 0) - inverse(b, 0)); for (let j = 0; j < 6; j++) { const [from, to] = jamesCaps[j]; out[at + 1 + j] = -2 * g * (inverse(a, to) - inverse(a, from) - inverse(b, to) + inverse(b, from)) - (row === j ? 1 : 0); } }
      out[42] = sourceG * inverse(8, 0); for (let j = 0; j < 6; j++) out[43 + j] = inverse(8, jamesCaps[j][1]) - inverse(8, jamesCaps[j][0]); return out;
    }
    // Equivalent active RC shelves and a series-RLC mid branch. For the mid
    // branch, (1+Rgain*Yrlc) gives H(s)=(s²+G*w/Q*s+w²)/(s²+w/Q*s+w²).
    // Bilinear/TPT coefficients preserve those network poles at every rate.
    function analogBiquad(b2, b1, b0, a2, a1, a0, sr, out, at) {
      const k = 2 * sr, kk = k * k, d = a2 * kk + a1 * k + a0;
      out[at] = (b2 * kk + b1 * k + b0) / d; out[at + 1] = 2 * (b0 - b2 * kk) / d; out[at + 2] = (b2 * kk - b1 * k + b0) / d;
      out[at + 3] = 2 * (a0 - a2 * kk) / d; out[at + 4] = (a2 * kk - a1 * k + a0) / d;
    }
    function shelf(sr, hz, gainDb, high, out, at) {
      const g = db(gainDb), root = Math.sqrt(g), w = 2 * sr * Math.tan(PI * Math.min(hz, sr * .42) / sr);
      if (high) analogBiquad(0, root, w, 0, 1 / root, w, sr, out, at);
      else analogBiquad(0, 1, w * root, 0, 1, w / root, sr, out, at);
    }
    function bell(sr, hz, gainDb, q, out, at) { const w = 2 * sr * Math.tan(PI * Math.min(hz, sr * .42) / sr), g = db(gainDb); analogBiquad(1, g * w / q, w * w, 1, w / q, w * w, sr, out, at); }
    function toneCoefficients(sr, values, out = new Float64Array(30)) {
      const p = normalize(values), midDb = (p.mid - 5) * (p.mid < 5 ? 4 : 2);
      shelf(sr, 200, 0, false, out, 0); bell(sr, Number(p.midFreq), midDb, 1, out, 5); shelf(sr, 700, 0, true, out, 10);
      shelf(sr, 120, p.ultraLow === 'on' ? 2.6 : 0, false, out, 15); bell(sr, 500, p.ultraLow === 'on' ? -10.4 : 0, .8, out, 20); shelf(sr, 1800, p.ultraHigh === 'on' ? 9 : 0, true, out, 25);
      return out;
    }
    // Short original windowed-sinc half-band interpolation/decimation filters.
    // High cascades two stages, Eco one; the circuit is never replaced by EQ.
    const taps = []; let tapSum = 0;
    for (let n = 0; n < 17; n++) { const x = n - 8, v = x === 0 ? .5 : x % 2 === 0 ? 0 : Math.sin(PI * .5 * x) / (PI * x) * (.54 - .46 * Math.cos(TAU * n / 16)); taps.push(v); tapSum += v; }
    const activeTaps = taps.map((v, i) => [i, i === 8 ? .5 : v * .5 / (tapSum - .5)]).filter(pair => pair[1] !== 0);
    class HalfBand { constructor() { this.ring = new Float64Array(32); this.at = 0; } reset() { this.ring.fill(0); this.at = 0; } push(x) { this.ring[this.at] = x; this.at = (this.at + 1) & 31; } read() { let x = 0; for (let i = 0; i < activeTaps.length; i++) x += activeTaps[i][1] * this.ring[(this.at - 1 - activeTaps[i][0]) & 31]; return x; } }
    function create(sampleRate, values) {
      const sr = clamp(finite(sampleRate, 48000), 8000, 192000); let p = normalize(values), os = p.quality === 'high' ? 4 : 2, subRate = sr * os, model = models.indexOf(p.model);
      const ramp = Math.max(1, Math.round(sr * .006)), slew = 1 - Math.exp(-1 / (sr * .006)), meterDecay = Math.exp(-1 / (sr * .12)), energyRate = 1 - Math.exp(-1 / (sr * .05));
      let inputGain = 1, inputTarget = 1, gain = 1, gainTarget = 1, master = 1, masterTarget = 1, output = 1, outputTarget = 1, head = 2.5, headTarget = 2.5, preHead = 6, preTarget = 6, trim = 1;
      let mix = p.bypass ? 0 : p.mix, mixTarget = mix, mixRemaining = 0, suspended = mix === 0, sleeping = true, quiet = 0;
      let peakIn = 0, peakOut = 0, energyIn = 0, energyOut = 0, powerPeak = 0, powerMeterPeak = 0, currentPeak = 0, actualHead = 2.5, supplyState = 0, sagDepth = 0, previousDemand = 0;
      const coefficients = new Float64Array(30), targets = new Float64Array(30), steps = new Float64Array(30), toneState = new Float64Array(24); let toneRemaining = 0, toneMask = 0, targetMask = 0;
      const james = new Float64Array(49), jamesTarget = new Float64Array(49), jamesStep = new Float64Array(49), jamesWorkspace = new Float64Array(162), jamesHistory = new Float64Array(12), jamesNext = new Float64Array(6); let jamesRemaining = 0;
      const previousNode = new Float64Array(8), previousArea = new Float64Array(8), previousA = new Float64Array(8), previousB = new Float64Array(8), charge = new Float64Array(8), cathode = new Float64Array(8), flux = new Float64Array(2), magnet = new Float64Array(2), load = new Float64Array(2), feedbackY = new Float64Array(2);
      const inputDc = new Float64Array(2), bandwidth = new Float64Array(2), outputDcIn = new Float64Array(2), outputDc = new Float64Array(2);
      const upA = [new HalfBand(), new HalfBand()], upB = [new HalfBand(), new HalfBand()], upSamples = new Float64Array(8), decimA = [new HalfBand(), new HalfBand()], decimB = [new HalfBand(), new HalfBand()], cabinetCoefficients = new Float64Array(20), cabinetTargets = new Float64Array(20), cabinetSteps = new Float64Array(20), cabinetState = new Float64Array(16); let cabinetRemaining = 0;
      const room = [new Float64Array(Math.ceil(sr * .025) + 2), new Float64Array(Math.ceil(sr * .025) + 2)]; let roomAt = 0, roomDelay = 1, roomTarget = 1;
      const lastWet = new Float64Array(2), transitionOffset = new Float64Array(2); let transition = 0, pendingTransition = false;
      let couplingRate = 0, bandwidthRate = 0, cathodeRate = 0, chargeAttack = 0, chargeRelease = 0, fluxRate = 0, magnetRate = 0, loadRate = 0, dcRate = 0, feedback = 1, powerB = .1, powerA = 0, preA = .025;
      const sagAttack = 1 - Math.exp(-1 / (sr * .04)), sagRelease = 1 - Math.exp(-1 / (sr * .28));
      function clearAudio() {
        for (const state of [toneState, jamesHistory, jamesNext, upSamples, previousNode, previousArea, previousA, previousB, charge, cathode, flux, magnet, load, feedbackY, inputDc, bandwidth, outputDcIn, outputDc, cabinetState]) state.fill(0);
        for (const f of [...upA, ...upB, ...decimA, ...decimB]) f.reset(); for (const r of room) r.fill(0); roomAt = 0; supplyState = previousDemand = sagDepth = quiet = 0; sleeping = true;
      }
      function update(old) {
        const oldOs = os; os = p.quality === 'high' ? 4 : 2; subRate = sr * os; model = models.indexOf(p.model);
        inputTarget = db(p.input - (p.pad === 'on' ? 15 : 0)); gainTarget = Math.pow(p.gain / 3, 1.8); masterTarget = Math.pow(p.master / 5, 2); outputTarget = db(p.output);
        headTarget = 2.5 * db(p.headroom) * p.supply; preTarget = 6 * db(p.headroom) * Math.sqrt(p.supply); feedback = 1 + p.feedback * 2.4; powerB = .24 / feedback; powerA = p.bias * .08 / feedback; preA = .025 + p.bias * .025;
        trim = rawTrim[model] * (p.trim === 'matched' ? 1 / rawTrim[model] : 1); roomTarget = Math.min(room[0].length - 2, sr * (.002 + p.distance * .018)); if (!old) roomDelay = roomTarget;
        if (!old || oldOs !== os) { couplingRate = 1 - Math.exp(-TAU * 5 / subRate); bandwidthRate = 1 - Math.exp(-TAU * Math.min(18000, sr * .44) / subRate); cathodeRate = 1 - Math.exp(-1 / (subRate * .08)); chargeAttack = 1 - Math.exp(-1 / (subRate * .001)); chargeRelease = 1 - Math.exp(-1 / (subRate * .09)); fluxRate = 1 - Math.exp(-TAU * 18 / subRate); magnetRate = 1 - Math.exp(-1 / (subRate * .022)); loadRate = 1 - Math.exp(-TAU * 90 / subRate); dcRate = Math.exp(-TAU * 2 / sr); }
        if (!old || oldOs !== os || old.mid !== p.mid || old.midFreq !== p.midFreq || old.ultraLow !== p.ultraLow || old.ultraHigh !== p.ultraHigh) {
          toneCoefficients(subRate, p, targets); targetMask = (p.mid !== 5 ? 2 : 0) | (p.ultraLow === 'on' ? 24 : 0) | (p.ultraHigh === 'on' ? 32 : 0);
          if (!old || oldOs !== os) { coefficients.set(targets); toneMask = targetMask; toneRemaining = 0; } else { toneMask |= targetMask; toneRemaining = ramp * os; for (let i = 0; i < 30; i++) steps[i] = (targets[i] - coefficients[i]) / toneRemaining; }
        }
        if (!old || oldOs !== os || old.bass !== p.bass || old.treble !== p.treble) { jamesCoefficients(subRate, p.bass, p.treble, jamesTarget, jamesWorkspace); if (!old || oldOs !== os) { james.set(jamesTarget); jamesRemaining = 0; } else { jamesRemaining = ramp * os; for (let i = 0; i < 49; i++) jamesStep[i] = (jamesTarget[i] - james[i]) / jamesRemaining; } }
        if (!old || old.speakerLoad !== p.speakerLoad || old.mic !== p.mic || old.air !== p.air || old.distance !== p.distance) {
          const w = 2 * sr * Math.tan(PI * Math.min(35 + p.speakerLoad * 8, sr * .4) / sr); analogBiquad(1, 0, 0, 1, w / .7, w * w, sr, cabinetTargets, 0);
          const hi = 2 * sr * Math.tan(PI * Math.min(3900 + p.mic * 1600 + p.air * 1800 - p.distance * 700, sr * .42) / sr); analogBiquad(0, 0, hi * hi, 1, hi / .68, hi * hi, sr, cabinetTargets, 5);
          bell(sr, 90, 1.5 + p.speakerLoad * 2, 1, cabinetTargets, 10); bell(sr, 1700 + p.mic * 700, 1 + p.mic * 2 - p.distance, .8, cabinetTargets, 15);
          if (!old) cabinetCoefficients.set(cabinetTargets); else { cabinetRemaining = ramp; for (let i = 0; i < 20; i++) cabinetSteps[i] = (cabinetTargets[i] - cabinetCoefficients[i]) / ramp; }
        }
        const nextMix = p.bypass ? 0 : p.mix; if (nextMix !== mixTarget) { mixTarget = nextMix; mixRemaining = ramp; }
        if (suspended && nextMix > 0) { clearAudio(); suspended = false; mix = 0; mixRemaining = ramp; }
        if (old && (old.model !== p.model || oldOs !== os || old.stereo !== p.stereo || old.cabinet !== p.cabinet)) {
          const l = lastWet[0], r = lastWet[1]; clearAudio(); lastWet[0] = l; lastWet[1] = r; pendingTransition = true;
        }
      }
      function biquadSample(x, channel, c, state, band) { const ci = band * 5, zi = channel * (state === toneState ? 12 : 8) + band * 2, y = c[ci] * x + state[zi]; state[zi] = c[ci + 1] * x - c[ci + 3] * y + state[zi + 1]; state[zi + 1] = c[ci + 2] * x - c[ci + 4] * y; return y; }
      function toneSample(x, channel, bands) { const mask = toneMask & bands; for (let i = 0; i < 6; i++) if (mask & (1 << i)) x = biquadSample(x, channel, coefficients, toneState, i); return x; }
      function powerSample(x, channel) {
        const n = clamp(x / actualHead, -24, 24); flux[channel] += (n - flux[channel]) * fluxRate; load[channel] += (n - load[channel]) * loadRate;
        let y;
        if (model === 2) {
          const at = channel * 4 + 3, midpoint = (n + previousNode[at]) * .5; previousNode[at] = n;
          // Coupled driver/power/negative-feedback KCL, rather than a delayed
          // feedback waveshaper. Both stages have the same unity rest slope.
          y = solveFeedback(midpoint, feedback, p.bias * .08);
          feedbackY[channel] = y; y *= actualHead;
        } else if (model === 4) {
          const at = channel * 4 + 3, midpoint = (n + previousNode[at]) * .5; previousNode[at] = n;
          const f = flux[channel], excess = Math.max(0, Math.abs(f) - .25), target = f * excess * excess; magnet[channel] += (target - magnet[channel]) * magnetRate;
          // Reduced transformer magnetizing current plus reactive-load current.
          // The added state vanishes at the linear operating point.
          const reactive = p.speakerLoad * .06 * (n - load[channel]) * Math.max(0, Math.abs(midpoint) - .4), current = midpoint - p.transformer * .12 * magnet[channel] + reactive;
          y = actualHead * solvePlate(current, powerA, powerB * (1 + p.transformer * .5 * excess));
        } else { const nodeInput = x, nodeThreshold = actualHead, nodeA = powerA, nodeB = powerB; let nodeValue; nodeStage3: { const u = nodeInput, stage = 3, threshold = nodeThreshold, a = nodeA, b = nodeB;
        const at = channel * 4 + stage, n = clamp(u / threshold, -24, 24), previous = previousNode[at], midpoint = (n + previous) * .5; previousNode[at] = n;
        if (model === 3) { if (previousA[at] !== a || previousB[at] !== b) { previousArea[at] = plateArea(solvePlate(previous, a, b), a, b); previousA[at] = a; previousB[at] = b; } const v = solvePlate(n, a, b), integral = plateArea(v, a, b), difference = n - previous; let y = Math.abs(difference) < 1e-5 * (1 + Math.abs(n) + Math.abs(previous)) ? solvePlate(midpoint, a, b) : (integral - previousArea[at]) / difference; previousArea[at] = integral; nodeValue = safe(y * threshold); break nodeStage3; }
        let x = midpoint;
        if (model === 1) { const conduction = Math.max(0, (stage === 3 ? Math.abs(x) : x) - .55); charge[at] += (conduction - charge[at]) * (conduction > charge[at] ? chargeAttack : chargeRelease); cathode[at] += (Math.max(0, x * x - .16) - cathode[at]) * cathodeRate; x = (x - charge[at] * .22 * (stage === 3 ? Math.sign(x) : 1)) / (1 + cathode[at] * .04); }
        nodeValue = threshold * solvePlate(x, a, b); break nodeStage3;

              } y = nodeValue; }
        // Common transformer curvature, referenced to one fixed voltage scale.
        // No signal-following gain, RMS normalizer or clean-signal compressor.
        const normalized = y / actualHead, bend = p.transformer * .025 * normalized * normalized; y /= 1 + bend;
        powerPeak = Math.max(powerPeak, Math.abs(y)); currentPeak = Math.max(currentPeak, Math.abs(n)); return safe(y);
      }
      function cabinetSample(x, channel) {
        if (p.cabinet === 'di') return x;
        for (let band = 0; band < 4; band++) x = biquadSample(x, channel, cabinetCoefficients, cabinetState, band);
        if (p.speakerDrive > 0) x = solvePlate(x, 0, .07 * p.speakerDrive);
        const ring = room[channel], position = (roomAt + ring.length - roomDelay) % ring.length, index = Math.floor(position), fraction = position - index, reflection = ring[index] + (ring[(index + 1) % ring.length] - ring[index]) * fraction; ring[roomAt] = x; return x + reflection * p.distance * .1;
      }
      function process(left, right) {
        if (!left || !right || left.length !== right.length) throw Error('CELLAR requires equal stereo blocks.');
        if (suspended) { const decay = Math.pow(meterDecay, left.length); peakIn *= decay; peakOut *= decay; powerMeterPeak *= decay; return; }
        for (let frame = 0; frame < left.length; frame++) {
          const dryL = left[frame], dryR = right[frame], a = safe(dryL), b = safe(dryR); peakIn = Math.max(Math.abs(a), Math.abs(b), peakIn * meterDecay); energyIn += ((a * a + b * b) * .5 - energyIn) * energyRate;
          if (sleeping && a === 0 && b === 0 && !mixRemaining && !pendingTransition) { left[frame] = dryL; right[frame] = dryR; peakOut *= meterDecay; powerMeterPeak *= meterDecay; energyOut *= 1 - energyRate; continue; }
          sleeping = false; inputGain += (inputTarget - inputGain) * slew; gain += (gainTarget - gain) * slew; master += (masterTarget - master) * slew; output += (outputTarget - output) * slew; head += (headTarget - head) * slew; preHead += (preTarget - preHead) * slew;
          if (cabinetRemaining && --cabinetRemaining === 0) cabinetCoefficients.set(cabinetTargets); else if (cabinetRemaining) for (let i = 0; i < 20; i++) cabinetCoefficients[i] += cabinetSteps[i]; roomDelay += (roomTarget - roomDelay) * slew;
          const excess = Math.max(0, previousDemand - .5), desired = Math.min(2, excess * excess); supplyState += (desired - supplyState) * (desired > supplyState ? sagAttack : sagRelease); sagDepth = p.sag * supplyState * .16; actualHead = head / (1 + sagDepth); powerPeak = currentPeak = 0;
          const mono = p.stereo === 'mono', xL = (mono ? (a + b) * .5 : a) * inputGain, xR = (mono ? (a + b) * .5 : b) * inputGain; let wetL = 0, wetR = 0;
          for (let channel = 0; channel < (mono ? 1 : 2); channel++) for (let phase = 0; phase < 2; phase++) {
            upA[channel].push(phase === 0 ? (channel ? xR : xL) * 2 : 0); const value = upA[channel].read();
            if (os === 2) upSamples[channel * 4 + phase] = value;
            else for (let phase2 = 0; phase2 < 2; phase2++) { upB[channel].push(phase2 === 0 ? value * 2 : 0); upSamples[channel * 4 + phase * 2 + phase2] = upB[channel].read(); }
          }
          for (let sub = 0; sub < os; sub++) {
            if (toneRemaining && --toneRemaining === 0) { coefficients.set(targets); toneMask = targetMask; } else if (toneRemaining) for (let i = 0; i < 30; i++) coefficients[i] += steps[i];
            if (jamesRemaining && --jamesRemaining === 0) james.set(jamesTarget); else if (jamesRemaining) for (let i = 0; i < 49; i++) james[i] += jamesStep[i];
            for (let channel = 0; channel < (mono ? 1 : 2); channel++) {
              const interpolated = upSamples[channel * 4 + sub];
              inputDc[channel] += (interpolated - inputDc[channel]) * couplingRate; let v; { const nodeInput = interpolated - inputDc[channel], nodeThreshold = preHead, nodeA = preA, nodeB = .12; let nodeValue; nodeStage0: { const u = nodeInput, stage = 0, threshold = nodeThreshold, a = nodeA, b = nodeB;
        const at = channel * 4 + stage, n = clamp(u / threshold, -24, 24), previous = previousNode[at], midpoint = (n + previous) * .5; previousNode[at] = n;
        if (model === 3) { if (previousA[at] !== a || previousB[at] !== b) { previousArea[at] = plateArea(solvePlate(previous, a, b), a, b); previousA[at] = a; previousB[at] = b; } const v = solvePlate(n, a, b), integral = plateArea(v, a, b), difference = n - previous; let y = Math.abs(difference) < 1e-5 * (1 + Math.abs(n) + Math.abs(previous)) ? solvePlate(midpoint, a, b) : (integral - previousArea[at]) / difference; previousArea[at] = integral; nodeValue = safe(y * threshold); break nodeStage0; }
        let x = midpoint;
        if (model === 1) { const conduction = Math.max(0, (stage === 3 ? Math.abs(x) : x) - .55); charge[at] += (conduction - charge[at]) * (conduction > charge[at] ? chargeAttack : chargeRelease); cathode[at] += (Math.max(0, x * x - .16) - cathode[at]) * cathodeRate; x = (x - charge[at] * .22 * (stage === 3 ? Math.sign(x) : 1)) / (1 + cathode[at] * .04); }
        nodeValue = threshold * solvePlate(x, a, b); break nodeStage0;

              } v = nodeValue; }
              // Verified CL order: stage1 → UltraLo/Gain → stage2 → James
              // bass/treble and selectable-mid stage → Master/buffer/driver.
              // The mid branch is a linear equivalent of the feedback network.
              v = toneSample(v, channel, 24) * gain; { const nodeInput = v, nodeThreshold = preHead * .75, nodeA = preA * .65, nodeB = .16; let nodeValue; nodeStage1: { const u = nodeInput, stage = 1, threshold = nodeThreshold, a = nodeA, b = nodeB;
        const at = channel * 4 + stage, n = clamp(u / threshold, -24, 24), previous = previousNode[at], midpoint = (n + previous) * .5; previousNode[at] = n;
        if (model === 3) { if (previousA[at] !== a || previousB[at] !== b) { previousArea[at] = plateArea(solvePlate(previous, a, b), a, b); previousA[at] = a; previousB[at] = b; } const v = solvePlate(n, a, b), integral = plateArea(v, a, b), difference = n - previous; let y = Math.abs(difference) < 1e-5 * (1 + Math.abs(n) + Math.abs(previous)) ? solvePlate(midpoint, a, b) : (integral - previousArea[at]) / difference; previousArea[at] = integral; nodeValue = safe(y * threshold); break nodeStage1; }
        let x = midpoint;
        if (model === 1) { const conduction = Math.max(0, (stage === 3 ? Math.abs(x) : x) - .55); charge[at] += (conduction - charge[at]) * (conduction > charge[at] ? chargeAttack : chargeRelease); cathode[at] += (Math.max(0, x * x - .16) - cathode[at]) * cathodeRate; x = (x - charge[at] * .22 * (stage === 3 ? Math.sign(x) : 1)) / (1 + cathode[at] * .04); }
        nodeValue = threshold * solvePlate(x, a, b); break nodeStage1;

              } v = nodeValue; }
              {
                // Keep the network in its caller to avoid a floating-point
                // helper argument/return at every oversampled channel step.
                // Read the same immutable history vector, in the same order.
                const x = v, h = channel * 6, h0 = jamesHistory[h], h1 = jamesHistory[h + 1], h2 = jamesHistory[h + 2], h3 = jamesHistory[h + 3], h4 = jamesHistory[h + 4], h5 = jamesHistory[h + 5];
                let y = james[42] * x;
                y += james[43] * h0; y += james[44] * h1; y += james[45] * h2;
                y += james[46] * h3; y += james[47] * h4; y += james[48] * h5;
                for (let row = 0; row < 6; row++) {
                  const at = row * 7; let next = james[at] * x;
                  next += james[at + 1] * h0; next += james[at + 2] * h1; next += james[at + 3] * h2;
                  next += james[at + 4] * h3; next += james[at + 5] * h4; next += james[at + 6] * h5;
                  jamesNext[row] = next;
                }
                for (let row = 0; row < 6; row++) jamesHistory[h + row] = jamesNext[row];
                v = y * 20;
              }
              v = toneSample(v, channel, 39); { const nodeInput = v, nodeThreshold = preHead * .85, nodeA = preA * .55, nodeB = .12; let nodeValue; nodeStage2: { const u = nodeInput, stage = 2, threshold = nodeThreshold, a = nodeA, b = nodeB;
        const at = channel * 4 + stage, n = clamp(u / threshold, -24, 24), previous = previousNode[at], midpoint = (n + previous) * .5; previousNode[at] = n;
        if (model === 3) { if (previousA[at] !== a || previousB[at] !== b) { previousArea[at] = plateArea(solvePlate(previous, a, b), a, b); previousA[at] = a; previousB[at] = b; } const v = solvePlate(n, a, b), integral = plateArea(v, a, b), difference = n - previous; let y = Math.abs(difference) < 1e-5 * (1 + Math.abs(n) + Math.abs(previous)) ? solvePlate(midpoint, a, b) : (integral - previousArea[at]) / difference; previousArea[at] = integral; nodeValue = safe(y * threshold); break nodeStage2; }
        let x = midpoint;
        if (model === 1) { const conduction = Math.max(0, (stage === 3 ? Math.abs(x) : x) - .55); charge[at] += (conduction - charge[at]) * (conduction > charge[at] ? chargeAttack : chargeRelease); cathode[at] += (Math.max(0, x * x - .16) - cathode[at]) * cathodeRate; x = (x - charge[at] * .22 * (stage === 3 ? Math.sign(x) : 1)) / (1 + cathode[at] * .04); }
        nodeValue = threshold * solvePlate(x, a, b); break nodeStage2;

              } v = nodeValue; } v *= master;
              v = powerSample(v, channel); bandwidth[channel] += (v - bandwidth[channel]) * bandwidthRate;
              if (os === 4) { decimA[channel].push(bandwidth[channel]); if ((sub & 1) === 0) decimB[channel].push(decimA[channel].read()); } else decimB[channel].push(bandwidth[channel]);
              if (sub === 0) { if (channel === 0) wetL = decimB[channel].read(); else wetR = decimB[channel].read(); }
            }
          }
          if (mono) wetR = wetL; previousDemand = currentPeak; powerMeterPeak = Math.max(powerPeak, powerMeterPeak * meterDecay);
          wetL = cabinetSample(wetL * trim, 0); wetR = mono ? wetL : cabinetSample(wetR * trim, 1); roomAt = (roomAt + 1) % room[0].length;
          const dcL = wetL - outputDcIn[0] + dcRate * outputDc[0], dcR = wetR - outputDcIn[1] + dcRate * outputDc[1]; outputDcIn[0] = wetL; outputDcIn[1] = wetR; outputDc[0] = dcL; outputDc[1] = dcR; wetL = dcL * output; wetR = dcR * output;
          if (pendingTransition) { transitionOffset[0] = lastWet[0] - wetL; transitionOffset[1] = lastWet[1] - wetR; transition = ramp; pendingTransition = false; }
          if (transition) { const weight = transition / ramp; wetL += transitionOffset[0] * weight; wetR += transitionOffset[1] * weight; transition--; }
          lastWet[0] = wetL; lastWet[1] = wetR;
          if (mixRemaining) { mix += (mixTarget - mix) / mixRemaining; if (--mixRemaining === 0) mix = mixTarget; }
          const outL = mix === 0 ? dryL : mix === 1 ? clamp(safe(wetL), -8, 8) : clamp(a + (safe(wetL) - a) * mix, -8, 8), outR = mix === 0 ? dryR : mix === 1 ? clamp(safe(wetR), -8, 8) : clamp(b + (safe(wetR) - b) * mix, -8, 8); left[frame] = outL; right[frame] = outR;
          peakOut = Math.max(Math.abs(outL), Math.abs(outR), peakOut * meterDecay); energyOut += ((outL * outL + outR * outR) * .5 - energyOut) * energyRate;
          if (mix === 0 && mixTarget === 0 && !mixRemaining) { clearAudio(); suspended = true; break; }
          if (a === 0 && b === 0 && Math.max(Math.abs(wetL), Math.abs(wetR)) < 1e-10) quiet++; else quiet = 0;
          if (quiet > sr * .25) clearAudio();
        }
      }
      update(null); inputGain = inputTarget; gain = gainTarget; master = masterTarget; output = outputTarget; head = actualHead = headTarget; preHead = preTarget;
      return {
        process, setParams(next) { if (!next || typeof next !== 'object') return; let changed = null; for (const key of Object.keys(next)) { const rule = specifications[key]; if (!rule && key !== 'bypass') continue; const value = key === 'bypass' ? next[key] === true : typeof rule[0] === 'number' ? clamp(finite(next[key], rule[2]), rule[0], rule[1]) : rule.includes(next[key]) ? next[key] : rule[0]; if (value !== p[key]) { if (!changed) changed = { ...p }; changed[key] = value; } } if (changed) { const old = p; p = changed; update(old); } },
        reset() { clearAudio(); coefficients.set(targets); toneMask = targetMask; toneRemaining = 0; james.set(jamesTarget); jamesRemaining = 0; cabinetCoefficients.set(cabinetTargets); cabinetRemaining = 0; roomDelay = roomTarget; inputGain = inputTarget; gain = gainTarget; master = masterTarget; output = outputTarget; head = actualHead = headTarget; preHead = preTarget; mix = mixTarget = p.bypass ? 0 : p.mix; mixRemaining = 0; suspended = mix === 0; pendingTransition = false; transition = 0; lastWet.fill(0); transitionOffset.fill(0); peakIn = peakOut = energyIn = energyOut = powerPeak = powerMeterPeak = currentPeak = 0; },
        getTailTime() { return suspended || sleeping ? 0 : 2; },
        getMeters() { const inRms = Math.sqrt(Math.max(0, energyIn)), outRms = Math.sqrt(Math.max(0, energyOut)); return { model: p.model, active: !suspended && !sleeping, cabinet: p.cabinet, inputDb: levelDb(peakIn), outputDb: levelDb(peakOut), inputRmsDb: levelDb(inRms), outputRmsDb: levelDb(outRms), inputCrestDb: Math.max(0, levelDb(peakIn) - levelDb(inRms)), outputCrestDb: Math.max(0, levelDb(peakOut) - levelDb(outRms)), headroomDb: clamp(levelDb(actualHead) - levelDb(Math.max(powerMeterPeak, 1e-6)), -60, 120), sagDb: -20 * Math.log10(1 + sagDepth), latencySamples: os === 4 ? 12.5 : 9, oversampling: os, current: currentPeak, transformerFlux: Math.max(Math.abs(flux[0]), Math.abs(flux[1])) }; },
        getState() { return { model: p.model, charge: Array.from(charge), cathode: Array.from(cathode), flux: Array.from(flux), magnet: Array.from(magnet), feedback: Array.from(feedbackY), supplyState, actualHead, sleeping, suspended }; }
      };
    }
    return { specifications, normalize, create, solvePlate, solveFeedback, plateArea, toneCoefficients, jamesCoefficients };
  }
  scope.createLoomSVTDSP = createLoomSVTDSP;
})(typeof window === 'undefined' ? globalThis : window);
