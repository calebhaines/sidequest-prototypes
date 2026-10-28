/* BROILER · reduced-order pedal circuits, independent of the amp and its cabinet. */
(function (scope) {
  'use strict';
  function createLoomBroilerPedalsDSP() {
    'use strict';
    // Serialized verbatim into the AudioWorklet: keep every dependency in here.
    const PI = Math.PI, TAU = 2 * PI;
    const types = ['none', 'green-808', 'gold-klone', 'rodent', 'orange-one', 'wool-fuzz', 'muffin', 'treble-boost', 'studio-comp', 'wah', 'chorus', 'phaser', 'echo', 'spring'];
    const dirt = ['green-808', 'gold-klone', 'rodent', 'orange-one', 'wool-fuzz', 'muffin', 'treble-boost'];
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const number = (v, fallback) => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    const safe = v => Number.isFinite(v) ? clamp(v, -16, 16) : 0;
    const gain = v => Math.pow(10, v / 20);
    function normalize(params) {
      const p = params && typeof params === 'object' ? params : {};
      return { type: types.includes(p.type) ? p.type : 'none', enabled: p.enabled === true || p.enabled === 'on', drive: clamp(number(p.drive, .5), 0, 1), tone: clamp(number(p.tone, .5), 0, 1), level: clamp(number(p.level, 0), -18, 12), mix: clamp(number(p.mix, 1), 0, 1) };
    }
    function create(sampleRate, params) {
      const sr = clamp(number(sampleRate, 48000), 8000, 192000), oversampling = 4, osr = sr * oversampling;
      const smooth = 1 - Math.exp(-1 / (sr * .004)), fadeStep = 1 / (sr * .003), delaySmooth = 1 - Math.exp(-1 / (sr * .04));
      const dcCoefficient = 1 - Math.exp(-TAU * 12 / sr);
      // Fourth-order Butterworth reconstruction before decimation of the
      // nonlinear sample. Keep this separate from each pedal's musical tone.
      const antiAliasCoefficients = new Float64Array(10);
      for (let section = 0; section < 2; section++) {
        const w = TAU * .37 * sr / osr, cosine = Math.cos(w), alpha = Math.sin(w) / (2 * (section === 0 ? .541196100146197 : 1.306562964876377));
        const scale = 1 / (1 + alpha), at = section * 5;
        antiAliasCoefficients[at] = (1 - cosine) * .5 * scale; antiAliasCoefficients[at + 1] = (1 - cosine) * scale; antiAliasCoefficients[at + 2] = antiAliasCoefficients[at];
        antiAliasCoefficients[at + 3] = -2 * cosine * scale; antiAliasCoefficients[at + 4] = (1 - alpha) * scale;
      }
      const midCoefficient = 1 - Math.exp(-TAU * 850 / osr), couplingCoefficient = 1 - Math.exp(-TAU * 60 / osr), scoopCoefficient = 1 - Math.exp(-TAU * 1000 / osr);
      const fuzzAttack = 1 - Math.exp(-1 / (osr * .0035)), fuzzRelease = 1 - Math.exp(-1 / (osr * .07));
      const gainSmooth = 1 - Math.exp(-1 / (sr * .001)), phaseSmooth = 1 - Math.exp(-1 / (sr * .00025)), springHighpass = 1 - Math.exp(-TAU * 40 / sr);
      const springTimes = [.0297, .0371, .0411, .0437], springApTimes = [.0017, .0043];
      let p = normalize(params), isDirt = dirt.includes(p.type), targetLevel = gain(p.level);
      const tableSegments = 2048;
      let clipPositive = null, clipNegative = null;
      function solveNode(magnitude, vt, k) {
        let upper = Math.min(magnitude, vt * Math.log1p(magnitude / k)), lower = 0, v = upper;
        for (let i = 0; i < 5; i++) {
          const e = Math.exp(Math.min(24, v / vt)), f = v + k * (e - 1) - magnitude;
          if (f > 0) upper = v; else lower = v;
          const next = v - f / (1 + k * e / vt);
          v = next >= lower && next <= upper ? next : .5 * (lower + upper);
        }
        return v;
      }
      function configureClip() {
        clipPositive = clipNegative = null;
        if (!isDirt || p.type === 'treble-boost') return;
        let positive = .044, negative = .044, resistanceIs = .000035, frequency = 10000;
        if (p.type === 'gold-klone') { positive = .035; negative = .042; resistanceIs = .000025; frequency = 12000; }
        else if (p.type === 'rodent') { positive = negative = .038; resistanceIs = .00002; frequency = 6500; }
        else if (p.type === 'orange-one') { positive = .038; negative = .076; resistanceIs = .000025; frequency = 9500; }
        else if (p.type === 'wool-fuzz') { positive = .055; negative = .085; resistanceIs = .00002; frequency = 7500; }
        else if (p.type === 'muffin') { positive = negative = .043; resistanceIs = .00003; frequency = 11000; }
        const k = resistanceIs * (1 - Math.exp(-TAU * frequency / osr));
        clipPositive = new Float64Array(tableSegments + 1); clipNegative = positive === negative ? clipPositive : new Float64Array(tableSegments + 1);
        for (let i = 0; i <= tableSegments; i++) {
          const magnitude = 24 * (i / tableSegments) * (i / tableSegments);
          clipPositive[i] = solveNode(magnitude, positive, k);
          if (clipNegative !== clipPositive) clipNegative[i] = solveNode(magnitude, negative, k);
        }
      }
      function makeState() {
        return {
          drive: p.drive, tone: p.tone, level: gain(p.level), mix: p.mix, fade: 1, clock: 0,
          previous: 0, hp: 0, mid: 0, lp: 0, dc: 0, node1: 0, node2: 0, slew: 0, envelope: 0, compGain: 1, antiAlias: new Float64Array(4),
          phase: 0, feedback: 0, delaySamples: (.06 + .79 * p.drive) * sr, delayIndex: 0, delay: null,
          ap: new Float64Array(4), apCoefficient: new Float64Array(4), apTarget: new Float64Array(4),
          spring: null, springIndices: new Int32Array(6), springLow: new Float64Array(4), springFeedback: new Float64Array(4),
          hpCoefficient: 0, lpCoefficient: 0, rc: 0, stageGain: 1, opampCoefficient: 0, rate: 0, depth: 0, feedbackAmount: 0,
          detectorAttack: 0, detectorRelease: 0, threshold: .1, ratio: 4, makeup: 1, wahG: 0, wahR: 1, wah1: 0, wah2: 0
        };
      }
      const states = [makeState(), makeState()];
      function allocate(s) {
        if (p.type === 'echo' || p.type === 'chorus') s.delay = new Float64Array(Math.ceil(sr * (p.type === 'echo' ? .9 : .06)) + 2);
        if (p.type === 'spring') {
          s.spring = springTimes.concat(springApTimes).map(t => new Float64Array(Math.max(2, Math.round(t * sr))));
        }
      }
      function tune(s) {
        const d = s.drive, t = s.tone;
        let highpass = 60, lowpass = 5000;
        if (p.type === 'green-808') { highpass = 720; lowpass = 1100 * Math.pow(5.5, t); s.stageGain = 2 + 42 * d * d; s.rc = 1 - Math.exp(-TAU * 10000 / osr); }
        else if (p.type === 'gold-klone') { highpass = 200; lowpass = 1800 * Math.pow(5, t); s.stageGain = 1.5 + 26 * d * d; s.rc = 1 - Math.exp(-TAU * 12000 / osr); }
        else if (p.type === 'rodent') {
          highpass = 80; lowpass = 700 * Math.pow(7500 / 700, t); s.stageGain = 4 + 180 * d * d; s.rc = 1 - Math.exp(-TAU * 6500 / osr);
          s.opampCoefficient = 1 - Math.exp(-TAU * clamp(350000 / (1 + s.stageGain), 1200, 14000) / osr);
        }
        else if (p.type === 'orange-one') { highpass = 110; lowpass = 6500; s.stageGain = 5 + 70 * d * d; s.rc = 1 - Math.exp(-TAU * 9500 / osr); }
        else if (p.type === 'wool-fuzz') { highpass = 35; lowpass = 6200; s.stageGain = 8 + 100 * d * d; s.rc = 1 - Math.exp(-TAU * 7500 / osr); }
        else if (p.type === 'muffin') { highpass = 45; lowpass = 9000; s.stageGain = 5 + 75 * d * d; s.rc = 1 - Math.exp(-TAU * 11000 / osr); }
        else if (p.type === 'treble-boost') { highpass = 150 * Math.pow(1700 / 150, t); lowpass = 12500; s.stageGain = 1 + 11 * d; s.rc = 1 - Math.exp(-TAU * 14000 / osr); }
        s.hpCoefficient = 1 - Math.exp(-TAU * Math.min(highpass, sr * .4) / osr);
        s.lpCoefficient = 1 - Math.exp(-TAU * Math.min(lowpass, sr * .44) / osr);
        if (p.type === 'studio-comp') {
          s.detectorAttack = 1 - Math.exp(-1 / (sr * (.0008 + .0342 * t * t)));
          s.detectorRelease = 1 - Math.exp(-1 / (sr * (.08 + .22 * d)));
          s.threshold = .4 * Math.pow(.1, d); s.ratio = 2 + 8 * d; s.makeup = 1 + 1.7 * d;
        } else if (p.type === 'wah') {
          s.wahG = Math.tan(PI * Math.min(280 * Math.pow(2400 / 280, d), sr * .35) / sr); s.wahR = 1 / (.8 + 6 * t * t);
        } else if (p.type === 'chorus') {
          s.rate = .15 + 3.85 * d * d; s.depth = (.0005 + .0045 * t) * sr; s.lpCoefficient = 1 - Math.exp(-TAU * Math.min(6500, sr * .4) / sr);
        } else if (p.type === 'phaser') {
          s.rate = .05 + 3.95 * d * d; s.feedbackAmount = .7 * t;
          const centre = 700 * Math.pow(2, 2.8 * Math.sin(TAU * s.phase));
          for (let i = 0; i < 4; i++) { const g = Math.tan(PI * clamp(centre * Math.pow(1.55, i - 1.5), 35, sr * .4) / sr); s.apTarget[i] = (g - 1) / (g + 1); }
        } else if (p.type === 'echo') {
          s.feedbackAmount = .08 + .7 * t; s.lpCoefficient = 1 - Math.exp(-TAU * Math.min(4300, sr * .4) / sr);
        } else if (p.type === 'spring') {
          s.lpCoefficient = 1 - Math.exp(-TAU * Math.min(7500 * Math.pow(1200 / 7500, t), sr * .4) / sr);
          const rt60 = .45 + 3.35 * d;
          for (let i = 0; i < 4; i++) s.springFeedback[i] = Math.pow(.001, s.spring[i].length / sr / rt60);
        }
      }
      function clear(s, fade) {
        s.drive = p.drive; s.tone = p.tone; s.level = gain(p.level); s.mix = p.mix; s.fade = fade;
        s.clock = s.previous = s.hp = s.mid = s.lp = s.dc = s.node1 = s.node2 = s.slew = s.envelope = s.phase = s.feedback = s.delayIndex = s.wah1 = s.wah2 = 0;
        s.compGain = 1; s.delaySamples = (.06 + .79 * p.drive) * sr;
        s.ap.fill(0); s.antiAlias.fill(0); s.springIndices.fill(0); s.springLow.fill(0);
        if (s.delay) s.delay.fill(0);
        if (s.spring) for (let i = 0; i < s.spring.length; i++) s.spring[i].fill(0);
        tune(s); s.apCoefficient.set(s.apTarget);
      }
      configureClip();
      for (let i = 0; i < 2; i++) { allocate(states[i]); clear(states[i], 1); }

      // Backward-Euler RC node with antiparallel diode current. Each sign can
      // have a different series diode count. Solve v+k(expm1(v/Vt))=b rather
      // than applying a memoryless clip: capacitor charge survives every sample.
      // The monotone equation has one root. Five bounded Newton steps solve it
      // at setup; a square-root-spaced table evaluates the same implicit node
      // cheaply at audio rate. The capacitor state is still updated at 4x.
      function diode(input, previous, rc) {
        const b = clamp(previous * (1 - rc) + input * rc, -24, 24), magnitude = Math.abs(b), table = b < 0 ? clipNegative : clipPositive;
        const position = Math.sqrt(magnitude / 24) * tableSegments, index = Math.min(tableSegments - 1, Math.floor(position));
        const value = table[index] + (position - index) * (table[index + 1] - table[index]);
        return b < 0 ? -value : value;
      }
      function dirtSample(x, s) {
        let result = 0;
        const previous = s.previous; s.previous = x;
        for (let sub = 0; sub < oversampling; sub++) {
          const input = previous + (x - previous) * (sub + 1) / oversampling;
          s.hp += s.hpCoefficient * (input - s.hp);
          const high = input - s.hp;
          let wet = high;
          if (p.type === 'green-808') {
            s.node1 = diode(high * s.stageGain, s.node1, s.rc);
            wet = s.node1 * 1.8 + input * .22;
          } else if (p.type === 'gold-klone') {
            s.node1 = diode(high * s.stageGain, s.node1, s.rc);
            const clean = .72 * (1 - s.drive) * (1 - s.drive);
            wet = input * clean + s.node1 * (1.8 - clean);
          } else if (p.type === 'rodent') {
            const preamp = high * s.stageGain, target = preamp / (1 + Math.abs(preamp) / 8);
            // A compensated op-amp loses closed-loop bandwidth as gain rises.
            // Smooth rails and this physical pole avoid the high-frequency
            // subharmonics produced by a discrete hard slew-rate limiter.
            s.slew += s.opampCoefficient * (target - s.slew);
            s.node1 = diode(s.slew, s.node1, s.rc); wet = s.node1 * 2.2;
          } else if (p.type === 'orange-one') {
            s.node1 = diode(high * s.stageGain, s.node1, s.rc);
            s.mid += midCoefficient * (s.node1 - s.mid);
            wet = (s.mid * (1.7 - 1.2 * s.tone) + (s.node1 - s.mid) * (.4 + 1.3 * s.tone)) * 2;
          } else if (p.type === 'wool-fuzz') {
            const a = Math.abs(high); s.envelope += (a > s.envelope ? fuzzAttack : fuzzRelease) * (a - s.envelope);
            const bias = -.35 + .8 * s.tone + .22 * s.envelope;
            const transistor = Math.tanh(high * s.stageGain + bias) - Math.tanh(bias);
            s.node1 = diode(transistor * (2.4 - Math.min(.9, s.envelope)), s.node1, s.rc);
            const gate = Math.max(0, s.tone - .6) * .025;
            wet = s.node1 * 2.5 * s.envelope / (s.envelope + gate + 1e-12);
          } else if (p.type === 'muffin') {
            s.node1 = diode(high * s.stageGain, s.node1, s.rc);
            s.mid += couplingCoefficient * (s.node1 - s.mid);
            s.node2 = diode((s.node1 - s.mid) * (2 + 6 * s.drive), s.node2, s.rc);
            s.slew += scoopCoefficient * (s.node2 - s.slew);
            wet = (s.slew * (1.9 - 1.6 * s.tone) + (s.node2 - s.slew) * (.25 + 2 * s.tone)) * 2;
          } else {
            // Single biased transistor boost: its input coupling capacitor sets
            // the range, while the collector progressively runs out of headroom.
            const bias = .19;
            wet = (Math.tanh(high * s.stageGain * .75 + bias) - Math.tanh(bias)) / .75;
          }
          s.lp += s.lpCoefficient * (wet - s.lp); result = s.lp;
          for (let section = 0; section < 2; section++) {
            const at = section * 5, state = section * 2, y = antiAliasCoefficients[at] * result + s.antiAlias[state];
            s.antiAlias[state] = antiAliasCoefficients[at + 1] * result - antiAliasCoefficients[at + 3] * y + s.antiAlias[state + 1];
            s.antiAlias[state + 1] = antiAliasCoefficients[at + 2] * result - antiAliasCoefficients[at + 4] * y; result = y;
          }
        }
        s.dc += dcCoefficient * (result - s.dc);
        return result - s.dc;
      }
      function readDelay(buffer, index, samples) {
        let at = index - samples; if (at < 0) at += buffer.length;
        const whole = Math.floor(at), fraction = at - whole, next = whole + 1 === buffer.length ? 0 : whole + 1;
        return buffer[whole] + fraction * (buffer[next] - buffer[whole]);
      }
      function wetSample(x, s) {
        if (isDirt) return dirtSample(x, s);
        if (p.type === 'studio-comp') {
          const detector = Math.abs(x); s.envelope += (detector > s.envelope ? s.detectorAttack : s.detectorRelease) * (detector - s.envelope);
          const over = Math.max(1, s.envelope / s.threshold), wanted = Math.pow(over, 1 / s.ratio - 1);
          s.compGain += gainSmooth * (wanted - s.compGain); return x * s.compGain * s.makeup;
        }
        if (p.type === 'wah') {
          const g = s.wahG, r = s.wahR, hp = (x - (r + g) * s.wah1 - s.wah2) / (1 + r * g + g * g);
          const bp = g * hp + s.wah1, lp = g * bp + s.wah2;
          s.wah1 = safe(g * hp + bp); s.wah2 = safe(g * bp + lp); return .18 * x + bp * .7;
        }
        if (p.type === 'phaser') {
          let y = x + s.feedbackAmount * s.feedback;
          for (let i = 0; i < 4; i++) { s.apCoefficient[i] += phaseSmooth * (s.apTarget[i] - s.apCoefficient[i]); const a = s.apCoefficient[i], z = safe(a * y + s.ap[i]); s.ap[i] = safe(y - a * z); y = z; }
          s.feedback = safe(y); s.phase += s.rate / sr; if (s.phase >= 1) s.phase -= 1;
          return .5 * (x + y);
        }
        if (p.type === 'chorus') {
          const delay = .012 * sr + s.depth * Math.sin(TAU * s.phase), delayed = readDelay(s.delay, s.delayIndex, delay);
          s.lp += s.lpCoefficient * (delayed - s.lp); s.delay[s.delayIndex] = x;
          if (++s.delayIndex === s.delay.length) s.delayIndex = 0;
          s.phase += s.rate / sr; if (s.phase >= 1) s.phase -= 1; return s.lp;
        }
        if (p.type === 'echo') {
          s.delaySamples += delaySmooth * ((.06 + .79 * s.drive) * sr - s.delaySamples);
          const delayed = readDelay(s.delay, s.delayIndex, s.delaySamples);
          s.lp += s.lpCoefficient * (delayed - s.lp);
          // Feedback stays below unity even at the brightest/loudest settings.
          s.delay[s.delayIndex] = Math.tanh(x + s.lp * s.feedbackAmount);
          if (++s.delayIndex === s.delay.length) s.delayIndex = 0;
          return s.lp;
        }
        if (p.type === 'spring') {
          s.hp += springHighpass * (x - s.hp); let input = x - s.hp;
          // Short allpass sections disperse the excitation before four lossy
          // waveguides. This is a spring-like network, not an impulse response
          // or a claim to recreate a particular physical tank.
          for (let i = 4; i < 6; i++) {
            const buffer = s.spring[i], at = s.springIndices[i], delayed = buffer[at], y = delayed - .63 * input;
            buffer[at] = safe(input + .63 * y); s.springIndices[i] = at + 1 === buffer.length ? 0 : at + 1; input = y;
          }
          let sum = 0;
          for (let i = 0; i < 4; i++) {
            const buffer = s.spring[i], at = s.springIndices[i], delayed = buffer[at];
            s.springLow[i] += s.lpCoefficient * (delayed - s.springLow[i]);
            buffer[at] = safe(input * .45 + s.springLow[i] * s.springFeedback[i]); s.springIndices[i] = at + 1 === buffer.length ? 0 : at + 1;
            sum += delayed * (i & 1 ? -1 : 1);
          }
          return sum * .5;
        }
        return x;
      }
      return {
        setParams(next) {
          const old = p; p = normalize(Object.assign({}, p, next && typeof next === 'object' ? next : {})); isDirt = dirt.includes(p.type); targetLevel = gain(p.level);
          const changedType = old.type !== p.type, wasActive = old.enabled && old.type !== 'none' && old.mix > 0, active = p.enabled && p.type !== 'none' && p.mix > 0;
          if (changedType) { configureClip(); for (let i = 0; i < 2; i++) { states[i].delay = null; states[i].spring = null; allocate(states[i]); clear(states[i], active ? 0 : 1); } }
          else if (wasActive !== active) for (let i = 0; i < 2; i++) clear(states[i], active ? 0 : 1);
        },
        sample(value, channel) {
          const x = Number.isFinite(value) ? value : 0;
          if (!p.enabled || p.type === 'none' || p.mix === 0) return x;
          const s = states[channel === 1 ? 1 : 0];
          s.drive += smooth * (p.drive - s.drive); s.tone += smooth * (p.tone - s.tone); s.level += smooth * (targetLevel - s.level); s.mix += smooth * (p.mix - s.mix);
          if (s.clock === 0) tune(s); s.clock = (s.clock + 1) & 15;
          const wet = safe(wetSample(safe(x), s) * s.level); s.fade = Math.min(1, s.fade + fadeStep);
          return safe(x + (wet - x) * s.mix * s.fade);
        },
        reset() { for (let i = 0; i < 2; i++) clear(states[i], 1); },
        getTailTime() {
          if (!p.enabled || p.type === 'none' || p.mix === 0) return 0;
          if (p.type === 'echo') {
            const time = Math.max((.06 + .79 * p.drive), states[0].delaySamples / sr, states[1].delaySamples / sr);
            const feedback = .08 + .7 * Math.max(p.tone, states[0].tone, states[1].tone);
            // Include one buffer traversal when an automated time knob leaves
            // older material behind the moving read head.
            return Math.min(45, time * Math.log(1e-5) / Math.log(feedback) + 1);
          }
          if (p.type === 'spring') return (.45 + 3.35 * p.drive) * 1.7 + .1;
          if (p.type === 'chorus') return .06;
          if (p.type === 'studio-comp') return .6;
          return isDirt ? .25 : .5;
        },
        synchronizeMonoState() {
          const from = states[0], to = states[1];
          for (const key of Object.keys(from)) {
            if (typeof from[key] === 'number') to[key] = from[key];
            else if (key === 'spring') { if (from.spring) for (let i = 0; i < from.spring.length; i++) to.spring[i].set(from.spring[i]); }
            else if (from[key]) to[key].set(from[key]);
          }
        },
        getParams() { return Object.assign({}, p); }
      };
    }
    return { types: types.slice(), normalize, create };
  }
  scope.createLoomBroilerPedalsDSP = createLoomBroilerPedalsDSP;
})(typeof window === 'undefined' ? globalThis : window);
