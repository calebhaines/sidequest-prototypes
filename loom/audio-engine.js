/* GALLEY: one sample clock, ten stereo lanes, and the same signal path for playback and printing. */
(() => {
  'use strict';
  const TRACK_COUNT = 10, INPUT_COUNT = TRACK_COUNT + 1;

  function createLoomEngineDSP(effectsFactory, lfoFactory, cpuFactory, eqFactory, masteringFactory) {
    const TRACK_COUNT = 10, RETURN_OFFSET = TRACK_COUNT, MASTER_INDEX = TRACK_COUNT + 2, BUS_OFFSET = TRACK_COUNT + 3;
    const clamp = (v, lo, hi, fallback = lo) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
    const effects = effectsFactory();
    const makeCPU = typeof cpuFactory === 'function' ? cpuFactory : typeof globalThis.createLoomCPUProfiler === 'function' ? globalThis.createLoomCPUProfiler : null;
    const cpuDSP = makeCPU ? makeCPU() : null;
    const makeEQ = typeof eqFactory === 'function' ? eqFactory : typeof globalThis.createLoomTrackEQDSP === 'function' ? globalThis.createLoomTrackEQDSP : null;
    const eqDSP = makeEQ ? makeEQ() : null;
    const makeMastering = typeof masteringFactory === 'function' ? masteringFactory : typeof globalThis.createLoomMasteringDSP === 'function' ? globalThis.createLoomMasteringDSP : null;
    const masteringModule = makeMastering ? makeMastering() : null;
    const masteringKeys = masteringModule ? Object.keys(masteringModule.specifications).filter(key => typeof masteringModule.specifications[key][0] === 'number') : [];
    const masteringAudioOptions = Object.freeze({ analyze: false });
    const effectSlotCount = owner => /^track-(?:[1-9]|10)$/.test(owner?.id) ? 5 : 4;
    const makeLFO = typeof lfoFactory === 'function' ? lfoFactory : typeof globalThis.createLoomLFODSP === 'function' ? globalThis.createLoomLFODSP : null;
    const lfoDSP = makeLFO ? makeLFO() : null;
    const emptyModulation = Object.freeze([]);
    const serviceGeometry = (options, beat) => {
      const clip = options.clip, nativeRate = clamp(clip.rate, .125, 8, 1), nativeLength = clamp(clip.length, .0001, 256, 1), stutter = [.125, .25, .5].includes(options.stutterBeats) ? options.stutterBeats : 0;
      const rate = stutter ? nativeRate : options.fill ? Math.min(8, nativeRate * 2) : nativeRate, factor = rate / nativeRate, length = stutter || nativeLength / factor;
      const phase = Number(options.phaseOrigin) || 0, padBeat = Number(options.padBeat) || 0, sceneBeat = Number(options.sceneBeat) || 0;
      const origin = stutter ? padBeat : options.fill ? padBeat - phase / factor : sceneBeat, start = origin + Math.floor((beat - origin + 1e-10) / length) * length;
      const span = Number(clip.sourceEnd) - Number(clip.sourceStart), offset = clamp(clip.sourceOffset, 0, 120, 0) + (stutter ? phase * 60 / clamp(options.tempo, 40, 240, 120) * nativeRate : 0);
      return { start, length, sourceOffset: stutter && span > 0 ? ((offset % span) + span) % span : offset, rate, loop: stutter > 0 || clip.loop === true, fadeIn: Math.min(length / 2, clamp(clip.fadeIn, 0, 32, 0) / factor), fadeOut: Math.min(length / 2, clamp(clip.fadeOut, 0, 32, 0) / factor) };
    };
    const automationValue = (lane, beat, fallback) => {
      const points = lane?.points;
      if (!lane || lane.enabled === false || !points?.length) return fallback;
      if (beat <= points[0].beat) return points[0].value;
      let lo = 0, hi = points.length - 1;
      while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (points[mid].beat <= beat) lo = mid; else hi = mid - 1; }
      const a = points[lo], b = points[lo + 1];
      return !b || lane.interpolation === 'hold' ? a.value : a.value + (b.value - a.value) * ((beat - a.beat) / Math.max(1e-12, b.beat - a.beat));
    };
    // Built-in channel EQ follows the track inserts without consuming a slot.
    // The optional EQ module adds sweepable mids and is serialized into the Worklet.
    // Keep the original fixed-frequency class here for module-less legacy callers.
    const trackEqGainKeys = ['low', 'lowMid', 'highMid', 'high'];
    const trackEqKeys = [...trackEqGainKeys, 'lowMidFreq', 'highMidFreq'];
    const trackEqRules = { low: [-12, 12, 0], lowMid: [-12, 12, 0], highMid: [-12, 12, 0], high: [-12, 12, 0], lowMidFreq: [80, 2000, 400], highMidFreq: [400, 10000, 2500] };
    const trackEqValue = (key, value) => clamp(value, ...trackEqRules[key]);
    const trackEqFrequencies = [100, 400, 2500, 10000];
    class LegacyTrackEQ {
      constructor(sampleRate, params = {}) {
        this.sampleRate = clamp(sampleRate, 8000, 192000, 48000);
        this.rampFrames = Math.max(1, Math.round(this.sampleRate * .006));
        this.params = {}; this.mask = 0;
        this.bands = trackEqGainKeys.map((key, index) => {
          const frequency = Math.min(trackEqFrequencies[index], this.sampleRate * .45), angle = 2 * Math.PI * frequency / this.sampleRate;
          return { key, index, sine: Math.sin(angle), cosine: Math.cos(angle), coefficients: new Float64Array(5), target: new Float64Array(5), step: new Float64Array(5), state: new Float64Array(4), remaining: 0 };
        });
        this.setParams(params); this.reset();
      }
      _coefficients(band, gain, target) {
        const A = Math.pow(10, gain / 40), c = band.cosine, alpha = band.sine / (2 * Math.SQRT1_2), t = 2 * Math.sqrt(A) * alpha;
        let b0, b1, b2, a0, a1, a2;
        if (band.index === 0) {
          b0 = A * ((A + 1) - (A - 1) * c + t); b1 = 2 * A * ((A - 1) - (A + 1) * c); b2 = A * ((A + 1) - (A - 1) * c - t);
          a0 = (A + 1) + (A - 1) * c + t; a1 = -2 * ((A - 1) + (A + 1) * c); a2 = (A + 1) + (A - 1) * c - t;
        } else if (band.index === 3) {
          b0 = A * ((A + 1) + (A - 1) * c + t); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - t);
          a0 = (A + 1) - (A - 1) * c + t; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - t;
        } else {
          b0 = 1 + alpha * A; b1 = -2 * c; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * c; a2 = 1 - alpha / A;
        }
        target[0] = gain === 0 ? 1 : b0 / a0; target[1] = b1 / a0; target[2] = b2 / a0; target[3] = a1 / a0; target[4] = a2 / a0;
      }
      setParams(params = {}) {
        for (const band of this.bands) {
          const key = band.key;
          if (!Object.prototype.hasOwnProperty.call(params, key) && Object.prototype.hasOwnProperty.call(this.params, key)) continue;
          const gain = clamp(params[key], -12, 12, 0);
          if (gain === this.params[key]) continue;
          this.params[key] = gain;
          this._coefficients(band, gain, band.target);
          // Retain the fixed-frequency unity-transfer denominator at zero. A
          // coefficient ramp can then cross zero without moving its poles to
          // DC or instantly deleting an audible filter history.
          if (!(this.mask & (1 << band.index))) this._coefficients(band, 0, band.coefficients);
          for (let j = 0; j < 5; j++) band.step[j] = (band.target[j] - band.coefficients[j]) / this.rampFrames;
          band.remaining = this.rampFrames;
          this.mask |= 1 << band.index;
        }
      }
      reset() {
        this.mask = 0;
        for (const band of this.bands) {
          band.coefficients.set(band.target); band.state.fill(0); band.remaining = 0;
          if (this.params[band.key] !== 0) this.mask |= 1 << band.index;
        }
      }
      process(left, right) {
        if (!this.mask) return; // Missing/flat legacy EQ does no arithmetic.
        const safe = value => Number.isFinite(value) ? Math.max(-65536, Math.min(65536, value)) : 0;
        for (let frame = 0; frame < left.length; frame++) {
          let l = safe(left[frame]), r = safe(right[frame]);
          for (const band of this.bands) {
            const bit = 1 << band.index;
            if (!(this.mask & bit)) continue;
            const c = band.coefficients, state = band.state;
            if (band.remaining) {
              if (--band.remaining === 0) c.set(band.target);
              else for (let j = 0; j < 5; j++) c[j] += band.step[j];
            }
            const nextL = safe(c[0] * l + state[0]), nextR = safe(c[0] * r + state[2]);
            state[0] = safe(c[1] * l - c[3] * nextL + state[1]); state[1] = safe(c[2] * l - c[4] * nextL);
            state[2] = safe(c[1] * r - c[3] * nextR + state[3]); state[3] = safe(c[2] * r - c[4] * nextR);
            l = nextL; r = nextR;
            // At exactly flat, keep the old filter tail until it is inaudible,
            // then clear it and restore the arithmetic-free dry path. New
            // boosts cannot resurrect samples from a previous EQ setting.
            if (!band.remaining && this.params[band.key] === 0 && Math.max(Math.abs(state[0]), Math.abs(state[1]), Math.abs(state[2]), Math.abs(state[3])) < 1e-12) { state.fill(0); this.mask &= ~bit; }
          }
          left[frame] = l; right[frame] = r;
          if (!this.mask) return;
        }
      }
    }
    const TrackEQ = eqDSP?.TrackEQ || LegacyTrackEQ;
    const emptyMeter = () => ({ peak: 0, rms: 0, rmsLeft: 0, rmsRight: 0 });
    const disabledMeter = Object.freeze(emptyMeter());
    const idleBusMeters = Object.freeze([disabledMeter, disabledMeter]);
    const disabledEffectMeters = Object.freeze(Array(5).fill(null));
    const emptyBusEffectMeters = Object.freeze(Array(4).fill(null));
    const writeMeter = (target, peak, powerL, powerR, frames) => {
      const meter = target || {};
      meter.peak = peak; meter.rms = Math.sqrt((powerL + powerR) / (2 * frames)); meter.rmsLeft = Math.sqrt(powerL / frames); meter.rmsRight = Math.sqrt(powerR / frames);
      return meter;
    };
    const sameSuppliedParams = (current, next) => {
      if (!current) return false;
      for (const key of Object.keys(next)) if (!Object.prototype.hasOwnProperty.call(current, key) || current[key] !== next[key]) return false;
      return true;
    };
    const indexFor = (id, tracks) => typeof id === 'number' ? Math.floor(id) : tracks.findIndex(t => t.id === id);
    const sampleData = (data, position) => {
      if (!data || position < 0 || position >= data.length) return 0;
      const index = Math.floor(position), fraction = position - index;
      return (data[index] || 0) * (1 - fraction) + (data[Math.min(index + 1, data.length - 1)] || 0) * fraction;
    };
    function boundedContinuation(outgoing, incoming, history, offset, stride) {
      if (Math.abs(outgoing - incoming) <= 1e-5) return outgoing;
      const last = history[offset], previous = history[offset + stride], adjacent = Math.max(Math.abs(last - previous), Math.abs(previous - history[offset + 2 * stride]), Math.abs(history[offset + 2 * stride] - history[offset + 3 * stride]));
      // A future attack outside the loop is not a valid declick anchor. Keep
      // continuous waveform steps; otherwise continue the genuinely played slope.
      return Math.abs(outgoing - last) > adjacent * 1.25 + 1e-5 ? 2 * last - previous : outgoing;
    }
    function loopDelta(data, start, end, reverse) {
      if (end - start < 4) return 0;
      const direction = reverse ? -1 : 1, firstPosition = reverse ? end - 1 : start, lastPosition = reverse ? start : end - 1;
      const first = sampleData(data, firstPosition), last = sampleData(data, lastPosition);
      let adjacent = 0;
      for (let index = 1; index <= 3; index++) {
        adjacent = Math.max(adjacent,
          Math.abs(sampleData(data, firstPosition + direction * index) - sampleData(data, firstPosition + direction * (index - 1))),
          Math.abs(sampleData(data, lastPosition - direction * index) - sampleData(data, lastPosition - direction * (index - 1))));
      }
      // A normal waveform step at a periodic boundary is not an edit. Only
      // repair a jump larger than the neighbouring source sample changes.
      if (Math.abs(first - last) <= adjacent * 1.25 + 1e-5) return 0;
      const previous = sampleData(data, lastPosition - direction);
      return 2 * last - previous - first;
    }
    function compileClip(clip, asset) {
      const sr = clamp(asset?.sampleRate, 8000, 192000, 48000), duration = asset?.left?.length / sr || 0;
      const sourceStart = clamp(clip.sourceStart, 0, duration, 0), sourceEnd = clamp(clip.sourceEnd, sourceStart, duration, duration);
      const item = { start: Number(clip.start) || 0, length: clamp(clip.length, .0001, clip.freezeTailSource === true ? 384 : 256, 1), left: asset?.left, right: asset?.right || asset?.left, sampleRate: sr, freezeTailSource: clip.freezeTailSource === true,
        sourceStart, sourceEnd, span: sourceEnd - sourceStart, sourceOffset: clamp(clip.sourceOffset, 0, 120, 0), rate: clamp(clip.rate, .125, 8, 1), reverse: clip.reverse === true,
        loop: clip.loop === true, gain: clamp(clip.gain, 0, 4, 1), fadeIn: clamp(clip.fadeIn, 0, 32, 0), fadeOut: clamp(clip.fadeOut, 0, 32, 0) };
      item.loopDeltaLeft = item.loop && item.left ? loopDelta(item.left, sourceStart * sr, sourceEnd * sr, item.reverse) : 0;
      item.loopDeltaRight = item.loop && item.right ? loopDelta(item.right, sourceStart * sr, sourceEnd * sr, item.reverse) : 0;
      item.loopCorrectionSpan = Math.min(.003 * item.rate, item.span * .5);
      item.initialSourceCycle = item.span > 0 ? Math.floor((item.sourceOffset + Math.min(1e-9, item.span * .0001)) / item.span) : 0;
      return item;
    }
    function clipSourceSample(item, position, channel) {
      const data = channel ? item.right : item.left, start = item.sourceStart * item.sampleRate;
      const end = item.sourceEnd * item.sampleRate, lastPosition = Math.max(start, end - 1);
      if (item.loop && !item.reverse && position > lastPosition) {
        // A selected source region owns its circular interpolation boundary.
        // Reading the following asset sample here can insert a one-sample pop
        // even when the selected region itself is perfectly seamless.
        const last = sampleData(data, lastPosition);
        if ((channel ? item.loopDeltaRight : item.loopDeltaLeft) === 0) return last + (position - lastPosition) * (sampleData(data, start) - last);
        const previous = sampleData(data, Math.max(start, lastPosition - 1));
        return last + (position - lastPosition) * (last - previous);
      }
      if (item.loop && item.reverse && position < start) {
        // Reverse playback starts on the last selected sample. At fractional
        // rates its final interpolation can run less than one sample before
        // the region; extend its local slope instead of reading outside it or
        // inserting zero before the wrap.
        const first = sampleData(data, start);
        if ((channel ? item.loopDeltaRight : item.loopDeltaLeft) === 0) {
          const previous = sampleData(data, Math.max(start, item.sourceEnd * item.sampleRate - 1));
          return first + (start - position) * (previous - first);
        }
        const next = sampleData(data, Math.min(start + 1, Math.max(start, item.sourceEnd * item.sampleRate - 1)));
        return first + (position - start) * (next - first);
      }
      return sampleData(data, position);
    }
    function readClip(item, beat, secondsPerBeat, pair) {
      pair[0] = pair[1] = 0;
      const localBeat = beat - item.start;
      if (localBeat < 0 || localBeat >= item.length || !item.left?.length || item.span <= 0) return;
      let offset = localBeat * secondsPerBeat * item.rate + item.sourceOffset, correction = 0;
      if (item.loop) {
        const cycle = Math.floor((offset + Math.min(1e-9, item.span * .0001)) / item.span);
        offset = Math.max(0, offset - cycle * item.span);
        if (cycle > item.initialSourceCycle && offset < item.loopCorrectionSpan) {
          const progress = offset / item.loopCorrectionSpan;
          correction = 1 - progress * progress * (3 - 2 * progress);
        }
      } else if (offset >= item.span) return;
      const position = (item.reverse ? item.sourceEnd - 1 / item.sampleRate - offset : item.sourceStart + offset) * item.sampleRate;
      const minimumFade = .003 / secondsPerBeat;
      const fadeIn = item.blockFadeIn ?? Math.min(item.length * .5, Math.max(minimumFade, item.fadeIn));
      const fadeOut = item.blockFadeOut ?? Math.min(item.length * .5, Math.max(minimumFade, item.fadeOut));
      let gain = item.gain;
      if (!item.freezeTailSource) {
        gain *= Math.min(1, localBeat / fadeIn, (item.length - localBeat) / fadeOut);
        if (!item.loop) gain *= Math.min(1, offset / .003, (item.span - offset) / .003);
      }
      const start = item.sourceStart * item.sampleRate, lastPosition = Math.max(start, item.sourceEnd * item.sampleRate - 1);
      if (item.loop && (!item.reverse && position > lastPosition || item.reverse && position < start)) {
        pair[0] = (clipSourceSample(item, position, 0) + item.loopDeltaLeft * correction) * gain;
        pair[1] = (clipSourceSample(item, position, 1) + item.loopDeltaRight * correction) * gain;
      } else {
        // Keep ordinary interpolation in this writer. Avoiding per-sample
        // scalar helper returns reduces realtime temporary allocation.
        // Circular/reverse seam reads above keep their original arithmetic.
        const left = item.left, right = item.right;
        let a = 0, b = 0;
        if (left && !(position < 0 || position >= left.length)) {
          const index = Math.floor(position), fraction = position - index;
          a = (left[index] || 0) * (1 - fraction) + (left[Math.min(index + 1, left.length - 1)] || 0) * fraction;
        }
        if (right && !(position < 0 || position >= right.length)) {
          const index = Math.floor(position), fraction = position - index;
          b = (right[index] || 0) * (1 - fraction) + (right[Math.min(index + 1, right.length - 1)] || 0) * fraction;
        }
        pair[0] = (a + item.loopDeltaLeft * correction) * gain;
        pair[1] = (b + item.loopDeltaRight * correction) * gain;
      }
    }
    class Core {
      constructor(state, assets, sampleRate = 48000, options = {}) {
        this.sampleRate = clamp(sampleRate, 8000, 192000, 48000);
        this.options = options;
        this.cpuProfiler = null; this._cpuExternal = false; this._cpuSampled = false; this._cpuKeys = null;
        this._diagnosticsConfig = { enabled: false, mode: 'light', revision: 0 };
        this.beat = 0;
        this.pedalMidi = null; this.pedalMidiBatches = [];
        this.playing = false;
        this.ended = false;
        this.recordingHold = false;
        this.countInRemaining = 0;
        this.countInTotal = 0;
        this.recordingPunch = false;
        this.sampleClock = 0;
        this.transportCycle = 0;
        this.silent = false;
        this.lastOutput = [0, 0];
        this.seekOrigin = [0, 0];
        this.seekFadeFrames = Math.max(1, Math.round(this.sampleRate * .006));
        this.seekFadeRemaining = 0;
        this.clipSample = [0, 0];
        this.wrapProbe = new Float64Array(24);
        this.clipWrapOffsets = Array.from({ length: TRACK_COUNT }, () => [0, 0]);
        this.clipWrapFrames = Math.max(1, Math.round(this.sampleRate * .003));
        this.clipWrapRemaining = 0;
        this.clipWrapContinuation = null;
        this.recordOnly = new Set();
        this.auditionTracks = new Set();
        this.microphoneMonitor = { track: -1, enabled: false };
        this.microphonePeak = 0;
        this.slots = Array.from({ length: TRACK_COUNT }, () => Array(5).fill(null));
        this._automationCompileCache = new Map(); this._clipAssetsRevision = 0; this._clipCompileKey = null;
        this._clipCandidates = Array.from({ length: TRACK_COUNT }, () => []);
        this._meterPool = { tracks: Array.from({ length: TRACK_COUNT }, emptyMeter), returns: Array.from({ length: 2 }, emptyMeter), buses: Array.from({ length: 2 }, emptyMeter), master: emptyMeter(), trackRows: Array(TRACK_COUNT).fill(disabledMeter), returnRows: Array(2).fill(disabledMeter), busRows: Array(2).fill(disabledMeter), block: {} };
        this._reuseMeters = false; this._metersPooled = false;
        this.buffers = [];
        this.trackEq = Array.from({ length: TRACK_COUNT }, () => null);
        this.eqAutomationValues = Array(TRACK_COUNT).fill(null);
        this.returnSlots = Array.from({ length: 2 }, () => Array(4).fill(null));
        this.masterSlots = Array(4).fill(null);
        this.busSlots = Array.from({ length: 2 }, () => Array(4).fill(null));
        this.busBuffers = []; this.busGains = Array.from({ length: 2 }, () => [1, 1]);
        this.busTailFrames = [0, 0]; this.busRouteCounts = [0, 0];
        this.outputRoutes = Array.from({ length: TRACK_COUNT }, () => [1, 0, 0]);
        this.outputTargets = Array(TRACK_COUNT).fill(0); this.outputRoutingInitialized = false;
        this.returnBuffers = [];
        this.returnGains = Array.from({ length: 2 }, () => [0, 0]);
        this.sendGains = Array.from({ length: TRACK_COUNT }, () => [0, 0]);
        this.preGains = Array.from({ length: TRACK_COUNT }, () => [0, 0]);
        this.sendPreMix = Array.from({ length: TRACK_COUNT }, () => [0, 0]);
        this.routingInitialized = false;
        this.masterMuteGain = 1;
        this.dryGain = 1;
        this.gains = Array.from({ length: TRACK_COUNT }, () => [0, 0]);
        this.masterGain = this.options.busId != null ? 1 : 0;
        this.limitGain = 1;
        this.limitRelease = 1 - Math.exp(-1 / (.08 * this.sampleRate));
        this.mixSlew = 1 - Math.exp(-1 / (.012 * this.sampleRate));
        this.panCurves = Array.from({ length: TRACK_COUNT + 5 }, () => ({ value: NaN, cosine: 1, sine: 0 }));
        this.clickPhase = 0;
        this.clickRemaining = 0;
        this.previousClickBeat = -1;
        this.modulation = null;
        this.service = null;
        this.serviceEvents = [];
        this.frozen = Array(TRACK_COUNT).fill(null); this.freezeFrame = 0; this.freezeTail = false; this.freezeContinuation = null;
        this.freezeSourceTailActive = false; this.freezeSourceTailFrame = 0; this.freezeSourceTailBase = 0;
        this.masteringDSP = null; this.masteringSettings = null; this.masteringAnalysis = false; this.masteringAutomationValues = null;
        this.setAssets(assets);
        this.setState(state);
        this.meters = { beat: 0, playing: false, ended: false, tracks: Array.from({ length: TRACK_COUNT }, emptyMeter), returns: Array.from({ length: 2 }, emptyMeter), buses: idleBusMeters, master: emptyMeter() };
      }
      _pedalMidiTarget(ownerId, slot) {
        const index = this.tracks.findIndex(track => track.id === ownerId);
        const owner = index >= 0 ? this.tracks[index] : ownerId === 'master' ? this.master : this.returns.find(bus => bus.id === ownerId) || this.buses.find(bus => bus.id === ownerId);
        const row = index >= 0 ? this.slots[index] : ownerId === 'master' ? this.masterSlots : /^bus-[12]$/.test(ownerId) ? this.busSlots[ownerId === 'bus-1' ? 0 : 1] : this.returnSlots[this.returns.findIndex(bus => bus.id === ownerId)];
        return { owner, slot: row?.[slot], index };
      }
      startPedalMidi(settings) {
        if (this.service || this.freezeCaptureIndex >= 0) throw Error('Stop SERVICE or offline rendering before capturing live MIDI.');
        const { ownerId, slot, token } = settings || {}, target = this._pedalMidiTarget(ownerId, slot);
        if (!Number.isInteger(slot) || slot < 0 || slot >= effectSlotCount(target.owner) || !target.owner || target.owner.disabled === true || target.owner.freeze || target.slot?.type !== 'ferment' || typeof target.slot.dsp.startMidiCapture !== 'function') throw Error('Choose an enabled, unfrozen FERMENT insert for MIDI capture.');
        const params = target.owner.effects?.[slot]?.params;
        if (params?.bypass || params?.mix === 0 || params?.mode === 'chord') throw Error('Enable FERMENT in Pitch Tracking mode before capturing a single-note line.');
        if (typeof token !== 'string' || !token || token.length > 120) throw Error('Choose a valid MIDI capture session.');
        this.stopPedalMidi('restarted');
        target.slot.dsp.startMidiCapture({ token, tempo: clamp(settings.tempo, 40, 240, this.tempo), maxNotes: 4096, maxBeats: 256 });
        this.pedalMidi = { token, ownerId, slot, runtime: target.slot, dsp: target.slot.dsp };
        this.resumeAudition(target.index >= 0 ? target.index : undefined);
        return { token, sampleRate: this.sampleRate };
      }
      stopPedalMidi(reason = 'stopped') {
        const session = this.pedalMidi;
        if (!session) return;
        session.dsp.stopMidiCapture(reason);
        const batch = session.dsp.drainMidiEvents();
        if (batch) this.pedalMidiBatches.push({ ...batch, ownerId: session.ownerId, slot: session.slot });
        this.pedalMidi = null;
      }
      drainPedalMidi() {
        const session = this.pedalMidi;
        if (session) {
          const target = this._pedalMidiTarget(session.ownerId, session.slot);
          if (target.owner?.disabled === true || target.owner?.freeze || target.slot !== session.runtime) this.stopPedalMidi('target-changed');
          else {
            const batch = session.dsp.drainMidiEvents();
            if (batch) { this.pedalMidiBatches.push({ ...batch, ownerId: session.ownerId, slot: session.slot }); if (batch.done) this.pedalMidi = null; }
          }
        }
        const result = this.pedalMidiBatches; this.pedalMidiBatches = []; return result;
      }
      _configureMastering() {
        const params = this.master?.mastering || {};
        if (this.options.trackId != null || this.options.returnId != null || this.options.busId != null || this.options.freezeCaptureTrackId != null) { this.masteringSettings = params; return; }
        if (params.enabled === true && !masteringModule) throw Error('The mastering processor has not loaded.');
        if (!this.masteringDSP && masteringModule && (params.enabled === true || this.masteringAnalysis)) this.masteringDSP = masteringModule.create(this.sampleRate, params);
        if (this.masteringDSP) {
          const values = { ...params };
          for (const key of this.masteringControlKeys || []) if (this.masteringAutomationValues && Object.prototype.hasOwnProperty.call(this.masteringAutomationValues, key)) values[key] = this.masteringAutomationValues[key];
          if (!sameSuppliedParams(this._masteringAppliedParams, values)) { this.masteringDSP.setParams(values); Object.assign(this._masteringAppliedParams || (this._masteringAppliedParams = {}), values); }
          this.masteringDSP.setAnalysis(this.masteringAnalysis);
        }
        this.masteringSettings = params;
      }
      setMasteringAnalysis(enabled) { this.masteringAnalysis = enabled === true; this._configureMastering(); if (this.cpuProfiler?.enabled) this._syncDiagnosticsTopology(); }
      resetMasteringMeters() { this.masteringDSP?.resetAnalysis(); }
      setDiagnostics(value = {}) {
        this._diagnosticsConfig = cpuDSP ? cpuDSP.normalizeConfig(value, this._diagnosticsConfig) : { ...this._diagnosticsConfig, ...value, enabled: value.enabled === true };
        if (!this._diagnosticsConfig.enabled && value.release === true) {
          this.cpuProfiler = null; this._cpuKeys = null; this._cpuExternal = this._cpuSampled = false;
          return this.getDiagnostics();
        }
        if (cpuDSP && this._diagnosticsConfig.enabled && !this.cpuProfiler) this.cpuProfiler = new cpuDSP.Runtime(this.sampleRate, { clock: this.options.diagnosticsClock });
        if (this.cpuProfiler) {
          this.cpuProfiler.configure(this._diagnosticsConfig);
          if (this._diagnosticsConfig.enabled) this._syncDiagnosticsTopology();
        }
        return this._diagnosticsConfig.enabled ? this.getDiagnostics() : { ...this._diagnosticsConfig, status: 'paused' };
      }
      resetDiagnostics(revision = this._diagnosticsConfig.revision) {
        this._diagnosticsConfig.revision = revision;
        if (this.cpuProfiler) { this.cpuProfiler.reset(); this.cpuProfiler.configure(this._diagnosticsConfig); }
        return this.getDiagnostics();
      }
      getDiagnostics() {
        if (this.cpuProfiler) return this.cpuProfiler.getSnapshot();
        return { ...this._diagnosticsConfig, status: this._diagnosticsConfig.enabled ? 'unsupported' : 'idle', available: false, clock: { name: 'unavailable', resolutionMs: null, coarse: false }, sampleRate: this.sampleRate, blockFrames: 0, budgetMs: 0, processedBlocks: 0, sampledBlocks: 0, sampledFrames: 0, coverage: 0, elapsedSeconds: 0, total: { samples: 0, meanMs: null, p95Ms: null, maxMs: null, meanPercent: null, p95Percent: null, maxPercent: null, overBudget: 0, zeroSamples: 0 }, rows: [], timerReads: 0, invalidTimings: 0 };
      }
      _syncDiagnosticsTopology() {
        if (!this.cpuProfiler?.enabled) return;
        const owners = [...this.tracks, ...this.returns, this.master, ...this.buses], racks = [...this.slots, ...this.returnSlots, this.masterSlots, ...this.busSlots], rows = [];
        this._cpuKeys = owners.map((owner, index) => {
          const ownerId = index < TRACK_COUNT ? 'track-' + (index + 1) : index < MASTER_INDEX ? 'return-' + (index - RETURN_OFFSET + 1) : index === MASTER_INDEX ? 'master' : 'bus-' + (index - BUS_OFFSET + 1);
          const label = owner.name || (index < TRACK_COUNT ? 'Track ' + (index + 1) : index < MASTER_INDEX ? 'Return ' + (index === RETURN_OFFSET ? 'A' : 'B') : index === MASTER_INDEX ? 'Master' : 'Bus ' + (index - BUS_OFFSET + 1));
          const busActive = index < BUS_OFFSET || this.busRouteCounts[index - BUS_OFFSET] > 0 || this.busTailFrames[index - BUS_OFFSET] > 0;
          const disabled = index < TRACK_COUNT && owner.disabled === true, frozen = index < TRACK_COUNT && !!this.frozen[index], identity = JSON.stringify([owner.effects?.map(effect => effect?.type || null), frozen, disabled]);
          rows.push({ id: ownerId, kind: 'owner', ownerId, label, identity, active: !disabled && busActive, disabled });
          for (let slot = 0; slot < racks[index].length; slot++) {
            const effect = owner.effects?.[slot], dsp = racks[index][slot], id = ownerId + ':fx:' + slot;
            if (dsp) dsp.diagnosticsId = id;
            rows.push({ id, kind: 'effect', ownerId, slot, effectType: effect?.type || null, label: effect?.type || 'Empty slot', identity: JSON.stringify([effect?.type || null, disabled]), active: !!effect && !frozen && !disabled && busActive, disabled, bypassed: disabled || frozen || effect?.params?.bypass === true || dsp?.bypass === true });
          }
          const mix = ownerId + ':mix', eq = ownerId + ':eq';
          rows.push({ id: mix, kind: 'mix', ownerId, label: index === MASTER_INDEX ? 'Output, metronome and limiter' : 'Pan, level, sends and metering', identity: String(disabled), active: !disabled && busActive, disabled });
          if (index < TRACK_COUNT) rows.push({ id: eq, kind: 'eq', ownerId, label: 'Four-band channel EQ', identity: String(disabled), active: !frozen && !disabled, disabled });
          return { owner: ownerId, mix, eq };
        });
        rows.push({ id: 'master:mastering', kind: 'mix', ownerId: 'master', label: 'Mastering tools and analysis', identity: 'mastering', active: !!this.masteringDSP?.isActive() || this.masteringAnalysis });
        rows.push(...[
          ['engine', 'GALLEY engine including inserts'], ['clips', 'Clip, input and timeline preparation'], ['modulation', 'LFO modulation'], ['recorder', 'Recording and input history'], ['events', 'Transport and SERVICE events'], ['meters', 'Live meter reports'], ['report', 'Diagnostics report preparation']
        ].map(([id, label]) => ({ id, kind: 'stage', label, active: true })));
        this.cpuProfiler.setTopology(rows);
      }
      beginDiagnostics(frames) {
        const profiler = this.cpuProfiler;
        if (!profiler?.enabled) return false;
        this._cpuExternal = true; this._cpuSampled = profiler.begin(frames); return true;
      }
      endDiagnostics() { if (this.cpuProfiler?.enabled) this.cpuProfiler.finish(); this._cpuExternal = this._cpuSampled = false; }
      diagnosticsStart(id) { return this._cpuSampled ? this.cpuProfiler.start(id) : NaN; }
      diagnosticsEnd(id, stamp) { if (this._cpuSampled) this.cpuProfiler.endStage(id, stamp); }
      diagnosticsReportDue() { return this.cpuProfiler?.enabled && this.cpuProfiler.consumeReportDue(); }
      setAssets(assets) {
        this.assets = assets instanceof Map ? assets : new Map(Object.entries(assets || {}));
        this._clipAssetsRevision++;
        if (this.tracks) this._compileClips();
      }
      updateAssets(additions, removals = []) {
        for (const id of removals) this.assets.delete(id);
        for (const [id, asset] of additions instanceof Map ? additions : Object.entries(additions || {})) this.assets.set(id, asset);
        this._clipAssetsRevision++;
        if (this.tracks) this._compileClips();
      }
      _compileClips() {
        // Mixer gestures send fresh project objects. Only source geometry,
        // freeze metadata, enabled lanes or decoded assets can change a read.
        // Capture values rather than object identity: callers can edit in place.
        const compileKey = JSON.stringify([this._clipAssetsRevision, this.tracks.map(track => [track.id, track.disabled === true, track.freeze || null, track.clips || []])]);
        if (compileKey === this._clipCompileKey) return;
        // A freeze owns only lightweight routing metadata and decoded Float32
        // chunks. The original clips stay in the song for immediate unfreezing.
        const hadFrozen = this.hasFrozen, previousFlags = this.frozen.map(Boolean);
        this.frozen = this.tracks.map((track, index) => {
          const spec = track.freeze;
          if (!spec || track.disabled === true || this.options.freezeCaptureTrackId != null) return null;
          if (spec.sampleRate !== this.sampleRate) throw Error('Unfreeze tracks before changing their audio sample rate.');
          const key = JSON.stringify([spec.sampleRate, spec.bodyFrames, spec.totalFrames, spec.fingerprint, spec.chunks]);
          const previous = this.frozen?.[index], selected = this.options.trackId == null ? -1 : indexFor(this.options.trackId, this.tracks), audible = !track.mute && (!(this.tracks.some(item => item.disabled !== true && item.solo === true) || this.buses.some(bus => bus.solo === true)) || track.solo || this.buses.some(bus => bus.id === track.output && bus.solo === true)) && (selected < 0 || selected === index);
          const runtime = previous?.key === key ? previous : { key, gate: audible ? 1 : 0, last: new Float64Array(6), wrapOffsets: new Float64Array(6), wrapRemaining: 0, stopRemaining: 0, chunk: 0 };
          runtime.spec = spec;
          runtime.chunks = (spec.chunks || []).map(chunk => ({ ...chunk, planes: ['main', 'sendA', 'sendB'].map(name => chunk[name] ? this.assets.get(chunk[name]) : null) }));
          return runtime;
        });
        this.hasFrozen = this.frozen.some(Boolean);
        if (this.playing && this.frozen.some((frozen, index) => this.tracks[index].disabled !== true && !!frozen !== previousFlags[index])) {
          // The live and baked processors have different internal histories.
          // Reuse the output declick without resetting shared bus processing.
          this.seekOrigin[0] = this.lastOutput[0]; this.seekOrigin[1] = this.lastOutput[1];
          this.seekFadeRemaining = this.seekFadeFrames;
        }
        if (this.hasFrozen && !hadFrozen) {
          // Undo can restore the first frozen lane while transport keeps
          // running. Its cursor must join the current musical position.
          const frame = this.beat * 60 / this.tempo * this.sampleRate, nearest = Math.round(frame);
          this.freezeFrame = Math.abs(frame - nearest) < .02 ? nearest : frame;
          this.freezeTail = false; this.freezeContinuation = null;
        }
        this.clipLists = this.tracks.map((track, index) => track.disabled === true || this.frozen[index] || this.options.freezeCaptureTrackId != null && index !== indexFor(this.options.freezeCaptureTrackId, this.tracks) ? [] : (track.clips || []).map(clip => compileClip(clip, this.assets.get(clip.assetId))).filter(item => item.left?.length && item.span > 0));
        this._clipCompileKey = compileKey;
      }
      setState(state) {
        if (this.service) { this.service.baseState = state || {}; this._setState(this._serviceState()); }
        else this._setState(state);
      }
      _setState(state) {
        if (this.options.freezeCaptureTrackId == null && (state?.tracks || []).some(track => track.freeze && track.freeze.sampleRate !== this.sampleRate)) throw Error('Unfreeze tracks before changing their audio sample rate.');
        this.state = state || {};
        this.tempo = clamp(this.state.tempo, 40, 240, 120);
        this.tracks = Array.from({ length: TRACK_COUNT }, (_, i) => this.state.tracks?.[i] || { id: `track-${i + 1}`, clips: [], effects: [] });
        this.activeTrackIndices = [];
        for (let index = 0; index < TRACK_COUNT; index++) {
          if (this.tracks[index].disabled !== true) { this.activeTrackIndices.push(index); continue; }
          if (this.pedalMidi?.ownerId === this.tracks[index].id) this.stopPedalMidi('track-disabled');
          this.auditionTracks.delete(index); this.recordOnly.delete(index);
          if (this.microphoneMonitor.track === index) this.microphoneMonitor.enabled = false;
          this.gains[index].fill(0); this.preGains[index].fill(0); this.sendGains[index].fill(0);
          for (let bus = 0; bus < 2; bus++) this.sendPreMix[index][bus] = this.tracks[index].sendPre?.[bus] === true ? 1 : 0;
          this.clipWrapOffsets[index].fill(0); this.buffers[index] = null;
        }
        this.freezeCaptureIndex = this.options.freezeCaptureTrackId == null ? -1 : indexFor(this.options.freezeCaptureTrackId, this.tracks);
        if (this.options.freezeCaptureTrackId != null && (this.freezeCaptureIndex < 0 || this.freezeCaptureIndex >= TRACK_COUNT)) throw Error('Choose one of the ten tracks to freeze.');
        if (this.freezeCaptureIndex >= 0 && this.tracks[this.freezeCaptureIndex].disabled === true) throw Error('Enable the track before freezing it.');
        this.buses = Array.from({ length: 2 }, (_, index) => this.state.buses?.[index] || { id: 'bus-' + (index + 1), name: 'Bus ' + (index + 1), level: 1, pan: 0, mute: false, solo: false, effects: [null, null, null, null], automation: [] });
        this.busRouteCounts.fill(0);
        for (let t = 0; t < TRACK_COUNT; t++) {
          const target = this.tracks[t].output === 'bus-1' ? 1 : this.tracks[t].output === 'bus-2' ? 2 : 0;
          this.outputTargets[t] = target;
          if (!this.outputRoutingInitialized) { this.outputRoutes[t].fill(0); this.outputRoutes[t][target] = 1; }
          if (target && this.tracks[t].disabled !== true) this.busRouteCounts[target - 1]++;
        }
        this.outputRoutingInitialized = true;
        this.groupRoutingPresent = this.busRouteCounts.some(Boolean) || this.busTailFrames.some(Boolean) || this.outputRoutes.some((route, t) => this.tracks[t].disabled !== true && (route[1] !== 0 || route[2] !== 0));
        this._compileClips();
        this.master = this.state.master || {};
        this.returns = Array.from({ length: 2 }, (_, index) => this.state.returns?.[index] || {
          id: 'return-' + (index + 1), name: 'Return ' + (index ? 'B' : 'A'), level: 1, pan: 0, mute: false, solo: false,
          effects: effects.normalize ? [{ type: index ? 'parallax' : 'vestige', params: { ...effects.normalize(index ? 'parallax' : 'vestige', {}), mix: 1 } }, null, null, null] : [null, null, null, null], automation: []
        });
        if ([this.options.trackId, this.options.returnId, this.options.busId].filter(value => value != null).length > 1) throw Error('Choose one track, return or group bus stem.');
        if (this.options.trackId != null) { const selected = indexFor(this.options.trackId, this.tracks); if (!Number.isInteger(selected) || selected < 0 || selected >= TRACK_COUNT) throw Error('Choose one of the ten tracks for the stem.'); }
        if (this.options.returnId != null && !['return-1', 'return-2'].includes(this.options.returnId)) throw Error('Choose Return A or Return B for the return stem.');
        if (this.options.busId != null && !['bus-1', 'bus-2'].includes(this.options.busId)) throw Error('Choose Bus 1 or Bus 2 for the group stem.');
        this.automation = this.tracks.map((track, index) => this._compileAutomation(track.disabled === true || this.frozen[index] || this.freezeCaptureIndex >= 0 && index !== this.freezeCaptureIndex ? {} : track, 5));
        this.returnAutomation = this.returns.map(bus => this._compileAutomation(bus, 4));
        this.busAutomation = this.buses.map(bus => this._compileAutomation(bus, 4));
        this.masterAutomation = this._compileAutomation(this.master, 4);
        if (lfoDSP) { const definitions = ((this.state.lfos || []).some(lfo => lfo?.routes?.length) || this.modulation?.entries.size) ? lfoDSP.targets(this.state, null, effects.specifications, masteringModule?.specifications).filter(target => {
          if (target.ownerId.startsWith('lfo-')) return true;
          const index = indexFor(target.ownerId, this.tracks);
          return this.freezeCaptureIndex >= 0 ? index === this.freezeCaptureIndex : index < 0 || this.tracks[index].disabled !== true && !this.frozen[index];
        }) : []; if (this.modulation) this.modulation.setState(this.state, definitions); else this.modulation = new lfoDSP.Runtime(this.sampleRate, this.state, definitions); }
        this._compileModulationHandles();
        this._configureMastering();
        for (let t = 0; t < TRACK_COUNT; t++) {
          if (this.tracks[t].disabled === true || this.frozen[t] || this.freezeCaptureIndex >= 0 && t !== this.freezeCaptureIndex) { this._updateRack({}, this.slots[t]); this.trackEq[t] = null; this.eqAutomationValues[t] = null; continue; }
          this._updateRack(this.tracks[t], this.slots[t], this.automation[t]);
          const params = {};
          for (const key of trackEqKeys) params[key] = (this.automation[t].eq[key] || this.modulation?.has(this.tracks[t].id, 'eq:' + key)) && this.eqAutomationValues[t]?.[key] !== undefined ? this.eqAutomationValues[t][key] : trackEqValue(key, this.tracks[t].eq?.[key]);
          // Performance macros and a compiled take share the absolute control
          // clock. An event between ticks must not start its live EQ ramp
          // earlier than the corresponding captured automation point.
          if (this.trackEq[t]) { if (!this.service) this.trackEq[t].setParams(params); }
          else this.trackEq[t] = new TrackEQ(this.sampleRate, params);
        }
        for (let bus = 0; bus < 2; bus++) this._updateRack(this.freezeCaptureIndex >= 0 ? {} : this.returns[bus], this.returnSlots[bus], this.returnAutomation[bus]);
        this._updateRack(this.freezeCaptureIndex >= 0 ? {} : this.master, this.masterSlots, this.masterAutomation);
        for (let bus = 0; bus < 2; bus++) this._updateRack(this.freezeCaptureIndex >= 0 || !(this.busRouteCounts[bus] || this.busTailFrames[bus]) ? {} : this.buses[bus], this.busSlots[bus], this.busAutomation[bus]);
        if (!this.routingInitialized) {
          for (let t = 0; t < TRACK_COUNT; t++) for (let bus = 0; bus < 2; bus++) this.sendPreMix[t][bus] = this.tracks[t].sendPre?.[bus] === true ? 1 : 0;
          for (let bus = 0; bus < 2; bus++) { const owner = this.buses[bus], level = owner.mute === true ? 0 : clamp(owner.level, 0, 1.5, 1), pan = clamp(owner.pan, -1, 1, 0), angle = (pan + 1) * Math.PI / 4; this.busGains[bus][0] = pan === 0 ? level : level * Math.cos(angle) * Math.SQRT2; this.busGains[bus][1] = pan === 0 ? level : level * Math.sin(angle) * Math.SQRT2; }
          this.masterMuteGain = this.options.busId == null && this.master.mute === true ? 0 : 1;
          this.dryGain = this.options.returnId != null || this.returns.some(bus => bus.solo === true) ? 0 : 1;
          this.routingInitialized = true;
        }
        if (this.pedalMidi) { const target = this._pedalMidiTarget(this.pedalMidi.ownerId, this.pedalMidi.slot); if (target.owner?.disabled === true || target.owner?.freeze || target.slot !== this.pedalMidi.runtime) this.stopPedalMidi('target-changed'); }
        if (this.cpuProfiler?.enabled) this._syncDiagnosticsTopology();
      }
      _compileModulationHandles() {
        const runtime = this.modulation, owners = [...this.tracks, ...this.returns, this.master, ...this.buses];
        this.modulationOwners = owners.map((owner, index) => {
          const target = key => runtime?.target(owner.id, key) || null;
          const eq = Object.fromEntries(trackEqKeys.map(key => [key, target('eq:' + key)]));
          return {
            mastering: owner.id === 'master' ? Object.fromEntries(masteringKeys.map(key => [key, target('mastering:' + key)])) : {},
            level: target('level'), pan: target('pan'), sends: [target('send:0'), target('send:1')], eq,
            dynamicEq: index < TRACK_COUNT && trackEqKeys.some(key => this.automation[index].eq[key] || eq[key]),
            effects: Array.from({ length: effectSlotCount(owner) }, (_, slot) => runtime ? runtime.effectKeys(owner.id, slot).map(key => ({ key, target: target('fx:' + slot + ':' + key) })) : emptyModulation)
          };
        });
        this.masteringControlKeys = masteringKeys.filter(key => this.masterAutomation.mastering[key] || this.modulationOwners[MASTER_INDEX].mastering[key]);
      }
      _compileAutomation(owner, slots = effectSlotCount(owner)) {
        const source = owner.automation || [], effectInputs = [];
        for (const lane of source) {
          const match = /^fx:([0-4]):([a-zA-Z][a-zA-Z0-9]*)$/.exec(lane.target || '');
          if (match) { const spec = owner.effects?.[Number(match[1])]; effectInputs.push([spec?.type, typeof spec?.params?.[match[2]]]); }
        }
        const cacheId = (owner.id || 'empty') + ':' + slots, compileKey = JSON.stringify([source, effectInputs]), cached = this._automationCompileCache.get(cacheId);
        if (cached?.key === compileKey) return cached.value;
        const result = { level: null, pan: null, mastering: {}, sends: [null, null], eq: Object.fromEntries(trackEqKeys.map(key => [key, null])), effects: Array.from({ length: slots }, () => []) };
        for (const lane of source) {
          if (lane.enabled === false || !lane.points?.length) continue;
          const compiled = { ...lane, points: lane.points.filter(p => Number.isFinite(p.beat) && Number.isFinite(p.value)).slice().sort((a, b) => a.beat - b.beat) };
          if (!compiled.points.length) continue;
          if (lane.target === 'level' || lane.target === 'pan') result[lane.target] = compiled;
          else if (owner.id === 'master' && lane.target?.startsWith('mastering:') && masteringKeys.includes(lane.target.slice(10))) result.mastering[lane.target.slice(10)] = compiled;
          else if (/^send:[01]$/.test(lane.target || '')) result.sends[Number(lane.target.slice(5))] = compiled;
          else if (/^eq:(low|lowMid|highMid|high|lowMidFreq|highMidFreq)$/.test(lane.target || '') && /^track-(?:[1-9]|10)$/.test(owner.id || '')) result.eq[lane.target.slice(3)] = compiled;
          else {
            const match = /^fx:([0-4]):([a-zA-Z][a-zA-Z0-9]*)$/.exec(lane.target || ''), index = match ? Number(match[1]) : -1, spec = index >= 0 && index < result.effects.length && owner.effects?.[index];
            if (spec && (!lane.effectType || lane.effectType === spec.type) && typeof spec.params?.[match[2]] === 'number') result.effects[index].push({ key: match[2], lane: compiled });
          }
        }
        this._automationCompileCache.set(cacheId, { key: compileKey, value: result });
        return result;
      }
      _updateRack(owner, row, automation = null) {
        for (let slot = 0; slot < row.length; slot++) {
          const spec = owner.effects?.[slot], old = row[slot];
          if (!spec || typeof spec.type !== 'string') { if (old) old.dsp.reset(); row[slot] = null; continue; }
          if (old && old.type === spec.type) {
            let retained = null;
            if (automation && old.automationValues) for (const key of new Set([...automation.effects[slot].map(item => item.key), ...(this.modulation?.effectKeys(owner.id, slot) || [])])) if (Object.prototype.hasOwnProperty.call(old.automationValues, key)) { if (!retained) retained = {}; retained[key] = old.automationValues[key]; }
            const values = retained ? { ...spec.params, ...retained } : spec.params || {};
            if (!sameSuppliedParams(old.appliedParams, values)) { old.dsp.setParams(values); Object.assign(old.appliedParams || (old.appliedParams = {}), values); }
            old.bypass = spec.bypass === true; old.automationValues = retained;
          }
          else { if (old) old.dsp.reset(); const dsp = effects.create(spec.type, this.sampleRate, spec.params || {}); row[slot] = dsp ? { type: spec.type, dsp, bypass: spec.bypass === true, appliedParams: { ...spec.params } } : null; }
        }
      }
      _processRack(owner, row, automation, left, right, blockBeat, blockPlaying, modulation) {
        const n = left.length;
        for (let slotIndex = 0; slotIndex < row.length; slotIndex++) {
          const slot = row[slotIndex];
          if (!slot || slot.bypass) continue;
          const cpu = this._cpuSampled ? this.cpuProfiler : null, cpuStart = cpu ? cpu.start(slot.diagnosticsId) : NaN;
          const lanes = automation.effects[slotIndex], modulated = modulation?.effects[slotIndex] || emptyModulation;
          if (!lanes.length && !modulated.length) slot.dsp.process(left, right, { tempo: this.tempo, beat: blockBeat, playing: blockPlaying });
          else for (let start = 0; start < n;) {
            const length = Math.min(n - start, 32 - ((this.sampleClock + start) % 32)), beat = this.timelineBeats[start];
            if ((this.sampleClock + start) % 32 === 0) {
              const values = {};
              for (const { key, lane } of lanes) values[key] = automationValue(lane, beat, owner.effects[slotIndex].params[key]);
              for (const { key, target } of modulated) values[key] = this.modulation.applyTarget(target, start, values[key] ?? owner.effects[slotIndex].params[key]);
              let changed = null;
              for (const key of Object.keys(values)) if (!slot.automationValues || values[key] !== slot.automationValues[key]) { if (!changed) changed = {}; changed[key] = values[key]; }
              // Every production effect merges partial parameter updates. The
              // manual base was already applied by _updateRack; only changed
              // automation values need to cross the 32-sample control boundary.
              if (changed) { slot.dsp.setParams(changed); Object.assign(slot.appliedParams || (slot.appliedParams = {}), changed); slot.automationValues = values; }
            }
            slot.dsp.process(left.subarray(start, start + length), right.subarray(start, start + length), { tempo: this.tempo, beat, playing: this.timelinePlaying[start] === 1 && this.timelineCountIn[start] === 0 });
            start += length;
          }
          if (cpu) cpu.endStage(slot.diagnosticsId, cpuStart);
        }
      }
      _processTrackEq(index, left, right) {
        const track = this.tracks[index], eq = this.trackEq[index], lanes = this.automation[index].eq, modulation = this.modulationOwners[index];
        let staticControls = !modulation.dynamicEq;
        if (staticControls && this.service) {
          // SERVICE applies macro changes on the absolute 32-frame clock.
          // Once those exact values are applied, unchanged controls need no
          // more setter objects or sub-block views until the next change.
          const applied = this.eqAutomationValues[index];
          for (const key of trackEqKeys) if (applied?.[key] !== track.eq?.[key]) { staticControls = false; break; }
        }
        if (staticControls) { eq.process(left, right); return; }
        for (let start = 0; start < left.length;) {
          const length = Math.min(left.length - start, 32 - ((this.sampleClock + start) % 32));
          if ((this.sampleClock + start) % 32 === 0) {
            const values = {};
            for (const key of trackEqKeys) values[key] = trackEqValue(key, this._lfoValue(modulation.eq[key], start, automationValue(lanes[key], this.timelineBeats[start], track.eq?.[key])));
            eq.setParams(values); this.eqAutomationValues[index] = values;
          }
          eq.process(left.subarray(start, start + length), right.subarray(start, start + length));
          start += length;
        }
      }
      _lfoValue(target, frame, base) { return target ? this.modulation.applyTarget(target, frame, base) : base; }
      _processMastering(left, right) {
        const processor = this.masteringDSP;
        if (!processor) return;
        const lanes = this.masterAutomation.mastering, modulation = this.modulationOwners[MASTER_INDEX].mastering;
        const keys = this.masteringControlKeys;
        if (!keys.length) { processor.process(left, right, masteringAudioOptions); return; }
        for (let start = 0; start < left.length;) {
          const length = Math.min(left.length - start, 32 - ((this.sampleClock + start) % 32));
          if ((this.sampleClock + start) % 32 === 0) {
            const values = {};
            for (const key of keys) values[key] = this._lfoValue(modulation[key], start, automationValue(lanes[key], this.timelineBeats[start], this.master.mastering?.[key]));
            processor.setParams(values); Object.assign(this._masteringAppliedParams || (this._masteringAppliedParams = {}), values); this.masteringAutomationValues = values;
          }
          processor.process(left.subarray(start, start + length), right.subarray(start, start + length), masteringAudioOptions);
          start += length;
        }
      }
      _resetTrackEq() {
        for (let index = 0; index < TRACK_COUNT; index++) {
          if (!this.trackEq[index]) continue;
          const values = {}, track = this.tracks[index], lanes = this.automation[index].eq;
          for (const key of trackEqKeys) values[key] = trackEqValue(key, automationValue(lanes[key], this.beat, track.eq?.[key]));
          this.trackEq[index].setParams(values); this.trackEq[index].reset(); this.eqAutomationValues[index] = values;
        }
      }
      _resetBuses() {
        for (const row of [...this.returnSlots, ...this.busSlots]) for (const slot of row) if (slot) slot.dsp.reset();
        this.busTailFrames.fill(0);
        for (let bus = 0; bus < 2; bus++) { const owner = this.buses[bus], level = owner.mute === true ? 0 : clamp(owner.level, 0, 1.5, 1), pan = clamp(owner.pan, -1, 1, 0), angle = (pan + 1) * Math.PI / 4; this.busGains[bus][0] = pan === 0 ? level : level * Math.cos(angle) * Math.SQRT2; this.busGains[bus][1] = pan === 0 ? level : level * Math.sin(angle) * Math.SQRT2; }
        for (let t = 0; t < TRACK_COUNT; t++) { this.outputRoutes[t].fill(0); this.outputRoutes[t][this.outputTargets[t]] = 1; }
        for (const slot of this.masterSlots) if (slot) slot.dsp.reset();
        this.masteringDSP?.reset();
        for (const rows of [this.returnGains, this.sendGains, this.preGains]) for (const pair of rows) pair.fill(0);
        for (let track = 0; track < TRACK_COUNT; track++) for (let bus = 0; bus < 2; bus++) this.sendPreMix[track][bus] = this.tracks[track].sendPre?.[bus] === true ? 1 : 0;
        for (const pair of this.returnBuffers) for (const buffer of pair) buffer.fill(0);
        this.masterMuteGain = this.options.busId == null && this.master.mute === true ? 0 : 1;
        this.dryGain = this.options.returnId != null || this.returns.some(bus => bus.solo === true) ? 0 : 1;
      }

      get endBeat() { return clamp(this.state.lengthBars, 1, 64, 4) * 4; }
      start(beat = this.beat) { if (this.service) this.stopService(); this.seek(beat); this.playing = true; this.silent = false; this.meters = { ...this.meters, beat: this.beat, playing: true, ended: false }; }
      stop() {
        if (this.pedalMidi) this.stopPedalMidi('transport-stopped');
        if (this.service) { this.stopService(); return; }
        if (this.freezeCaptureIndex >= 0 && this.playing) { this.freezeSourceTailActive = this.beat >= this.endBeat - 2 * this.tempo / (60 * this.sampleRate); this.freezeSourceTailFrame = 0; this.freezeSourceTailBase = Math.round(this.endBeat * 60 / this.tempo * this.sampleRate); }
        this.freezeTail = this.hasFrozen && (this.ended || this.options.linear && this.beat >= this.endBeat - 1e-7);
        if (!this.freezeTail) for (const frozen of this.frozen) if (frozen) frozen.stopRemaining = this.seekFadeFrames;
        this.playing = false; this.countInRemaining = 0; this.clickRemaining = 0; this.meters = { ...this.meters, beat: this.beat, playing: false, ended: this.ended, countInBeatsRemaining: 0 };
      }
      seek(beat) {
        if (this.pedalMidi) this.stopPedalMidi('seek');
        this.beat = clamp(beat, 0, this.options.linear ? 256 : this.endBeat, 0); this.ended = false; this.previousClickBeat = -1; this.clickRemaining = 0;
        this.transportCycle = 0;
        this.sampleClock = 0;
        this.freezeFrame = this.beat * 60 / this.tempo * this.sampleRate; this.freezeTail = false; this.freezeContinuation = null;
        this.freezeSourceTailActive = false; this.freezeSourceTailFrame = 0;
        for (const frozen of this.frozen) if (frozen) { frozen.chunk = 0; frozen.wrapRemaining = 0; frozen.stopRemaining = 0; frozen.last.fill(0); frozen.wrapOffsets.fill(0); }
        this.clipWrapRemaining = 0; this.clipWrapContinuation = null;
        for (const pair of this.clipWrapOffsets) pair.fill(0);
        if (!this.options.linear) {
          // Discard audio from the previous timeline position, then crossfade the
          // last audible sample into the new position over six milliseconds.
          this.seekOrigin[0] = this.lastOutput[0]; this.seekOrigin[1] = this.lastOutput[1];
          this.seekFadeRemaining = this.playing || Math.abs(this.lastOutput[0]) + Math.abs(this.lastOutput[1]) > 1e-8 ? this.seekFadeFrames : 0;
          for (const row of this.slots) for (const slot of row) if (slot) slot.dsp.reset();
        }
        this.modulation?.reset(this.beat, this.tempo);
        this._resetTrackEq();
        this._resetBuses();
        this.meters = { ...this.meters, beat: this.beat, cycle: 0, playing: this.playing, ended: false };
        return this.beat;
      }
      setRecordingHold(value) { this.recordingHold = value === true; }
      beginRecording(schedule = {}) {
        this.recordingPunch = schedule.punchEnabled === true;
        if (schedule.startTransport !== false && !this.playing) this.start(this.beat);
        this.countInTotal = this.countInRemaining = Math.max(0, Math.round(clamp(schedule.countInBeats, 0, 8, 0) * 60 / this.tempo * this.sampleRate));
        this.meters = { ...this.meters, playing: this.playing, countInBeatsRemaining: this.countInRemaining * this.tempo / (60 * this.sampleRate) };
        this.previousClickBeat = -1; this.clickRemaining = 0;
      }
      endRecording() { this.countInRemaining = 0; this.recordingPunch = false; }
      setRecordOnly(index, value) { if (value && this.tracks[index]?.disabled !== true) this.recordOnly.add(index); else this.recordOnly.delete(index); }
      setMicrophoneMonitor(track, enabled) { const valid = Number.isInteger(track) && track >= 0 && track < TRACK_COUNT && this.tracks[track].disabled !== true; this.microphoneMonitor = { track: valid ? track : -1, enabled: valid && enabled === true }; if (this.microphoneMonitor.enabled) this.silent = false; }
      resumeAudition(index) { if (Number.isInteger(index) && this.tracks[index]?.disabled === true) return; this.silent = false; if (Number.isInteger(index)) this.auditionTracks.add(index); }
      clearAudition(index) { if (Number.isInteger(index)) this.auditionTracks.delete(index); else this.auditionTracks.clear(); }
      panic() {
        if (this.pedalMidi) this.stopPedalMidi('panic');
        if (this.service) this.stopService();
        this.playing = false; this.ended = false; this.silent = true; this.clickRemaining = 0; this.limitGain = 1; this.auditionTracks.clear();
        this.countInRemaining = 0; this.recordingPunch = false;
        this.freezeTail = false; this.freezeContinuation = null; for (const frozen of this.frozen) if (frozen) { frozen.wrapRemaining = 0; frozen.stopRemaining = 0; frozen.last.fill(0); }
        this.freezeSourceTailActive = false; this.freezeSourceTailFrame = 0;
        this.lastOutput.fill(0); this.seekOrigin.fill(0); this.seekFadeRemaining = 0;
        this.clipWrapRemaining = 0; this.clipWrapContinuation = null;
        for (const pair of this.clipWrapOffsets) pair.fill(0);
        this.masterGain = this.options.busId != null ? 1 : 0;
        for (const pair of this.gains) pair.fill(0);
        for (const row of this.slots) for (const slot of row) if (slot) slot.dsp.reset();
        for (const pair of this.buffers) if (pair) for (const buffer of pair) buffer.fill(0);
        this.modulation?.reset(this.beat, this.tempo);
        this._resetTrackEq();
        this._resetBuses();
        this.meters = { beat: this.beat, playing: false, ended: false, tracks: Array.from({ length: TRACK_COUNT }, emptyMeter), returns: Array.from({ length: 2 }, emptyMeter), buses: idleBusMeters, master: emptyMeter() };
      }
      setMeterDetail(value) {
        this._meterDetail = value === undefined ? undefined : value && typeof value.ownerId === 'string' && Number.isInteger(value.slot) && value.slot >= 0 && value.slot < 5 ? { ownerId: value.ownerId, slot: value.slot } : null;
      }
      getMeters() {
        const detail = this._meterDetail;
        const rackMeters = (owner, row) => {
          if (detail !== undefined && (!detail || detail.ownerId !== owner.id)) return row.length === 5 ? disabledEffectMeters : emptyBusEffectMeters;
          return row.map((slot, insert) => slot && (detail === undefined || detail.slot === insert) ? { type: slot.type, ...slot.dsp.getMeters(), bypass: slot.bypass || owner.effects?.[insert]?.params?.bypass === true } : null);
        };
        const meters = this.meters;
        // Realtime hosts ignore processBlock's return value. Their private
        // working rows can be reused, but every exposed snapshot owns its rows.
        const levels = this._metersPooled ? { tracks: meters.tracks.map(row => ({ ...row })), returns: meters.returns.map(row => ({ ...row })), buses: meters.buses.map(row => ({ ...row })), master: { ...meters.master } } : null;
        return { ...meters, ...levels, mastering: this.masteringDSP?.getMeters() || null, lfos: this.modulation?.getMeters((ownerId, target) => {
          const index = /^track-/.test(ownerId) ? indexFor(ownerId, this.tracks) : -1, returnIndex = this.returns.findIndex(owner => owner.id === ownerId), owner = index >= 0 ? this.tracks[index] : returnIndex >= 0 ? this.returns[returnIndex] : this.buses.find(bus => bus.id === ownerId) || this.master;
          const lane = owner.automation?.find(lane => lane.target === target), parts = target.split(':'), base = target === 'level' || target === 'pan' ? owner[target] : parts[0] === 'send' ? owner.sends?.[Number(parts[1])] : parts[0] === 'eq' ? owner.eq?.[parts[1]] : parts[0] === 'fx' ? owner.effects?.[Number(parts[1])]?.params?.[parts[2]] : parts[0] === 'mastering' ? owner.mastering?.[parts[1]] : 0;
          return automationValue(lane, this.beat, base);
        }), effects: this.slots.map((row, track) => this.tracks[track].disabled === true ? disabledEffectMeters : rackMeters(this.tracks[track], row)), returnEffects: this.returnSlots.map((row, bus) => rackMeters(this.returns[bus], row)), busEffects: this.busSlots.map((row, bus) => rackMeters(this.buses[bus], row)), masterEffects: rackMeters(this.master, this.masterSlots) };
      }
      resetEffectMeters(ownerId, insert) {
        if (!Number.isInteger(insert) || insert < 0 || insert >= 5) return false;
        let row;
        if (ownerId === 'master') row = this.masterSlots;
        else if (ownerId === 'return-1' || ownerId === 'return-2') row = this.returnSlots[ownerId === 'return-1' ? 0 : 1];
        else if (ownerId === 'bus-1' || ownerId === 'bus-2') row = this.busSlots[ownerId === 'bus-1' ? 0 : 1];
        else { const index = indexFor(ownerId, this.tracks); if (!Number.isInteger(index) || index < 0 || index >= TRACK_COUNT) return false; row = this.slots[index]; }
        if (insert >= row.length) return false;
        const slot = row[insert];
        if (!slot || slot.type !== 'scales' || typeof slot.dsp.resetMeters !== 'function') return false;
        slot.dsp.resetMeters(); return true;
      }
      _sample(asset, position, channel) {
        return sampleData(channel ? (asset.right || asset.left) : asset.left, position);
      }
      // SERVICE is an opt-in runtime overlay. The arrangement renderer below
      // receives the same state, clips and block sizes whenever it is inactive.
      startService(scene, fromBeat = 0, seq = 0, performance = null) {
        if (this.hasFrozen) throw Error('Unfreeze tracks before starting SERVICE.');
        if (this.service) this.stopService(seq);
        const baseState = this.state, arrangementBeat = this.beat, options = this.options;
        this.stop(); this.seek(clamp(fromBeat, 0, Number.MAX_SAFE_INTEGER, 0));
        this.service = { baseState, arrangementBeat, options, scene: this._serviceScene(scene), sceneBeat: this.beat, sceneStarts: Array(TRACK_COUNT).fill(this.beat), padBeat: this.beat, padBeats: Array(TRACK_COUNT).fill(this.beat), phaseOrigins: Array(TRACK_COUNT).fill(0), performance: { drops: Array(TRACK_COUNT).fill(false), stutterBeats: 0, fill: false, overrides: [] }, pending: [] };
        if (performance) this.service.performance = this._servicePerformance(performance);
        this.options = { ...options, linear: true };
        this._setState(this._serviceState()); this._resetTrackEq(); this.playing = true; this.silent = false; this.ended = false;
        this.meters = { ...this.meters, beat: this.beat, cycle: 0, playing: true, ended: false };
        this._emitService('start', seq); this._emitService('scene', seq); this._emitService('performance', seq);
      }
      _serviceScene(scene) {
        if (!scene || !Array.isArray(scene.clips) || scene.clips.length !== TRACK_COUNT) throw Error('A SERVICE scene needs ten clip cells.');
        return { ...scene, clips: scene.clips.map(clip => clip ? { ...clip, start: 0 } : null) };
      }
      queueService(type, value, quantize = 'immediate', seq = 0) {
        if (!this.service) throw Error('Start SERVICE before launching a scene or performance control.');
        let quantum = { beat: 1, halfbar: 2, bar: 4, '2bar': 8, '4bar': 16 }[quantize];
        if (!quantum && type === 'performance' && ((value?.stutterBeats || 0) !== this.service.performance.stutterBeats || (value?.fill === true) !== this.service.performance.fill)) quantum = 1 / 64;
        const beat = quantum ? (Math.floor((this.beat + 1e-10) / quantum) + 1) * quantum : this.beat;
        if (type === 'scene') value = this._serviceScene(value);
        else if (type !== 'performance') throw Error('Choose a SERVICE scene or performance control.');
        // A fresh scene supersedes an unplayed launch, so rapid pad taps do not
        // unexpectedly play several scenes at the same musical boundary.
        this.service.pending = this.service.pending.filter(event => event.type !== type);
        this.service.pending.push({ type, value, beat, seq });
        this.service.pending.sort((a, b) => a.beat - b.beat || a.seq - b.seq);
        return beat;
      }
      _serviceState() {
        const { baseState, performance } = this.service;
        const tracks = Array.from({ length: TRACK_COUNT }, (_, index) => {
          const base = baseState.tracks?.[index] || { id: 'track-' + (index + 1), effects: [], automation: [] }, overrides = performance.overrides.filter(item => indexFor(item.trackId, baseState.tracks || []) === index);
          const track = { ...base, eq: Object.fromEntries(trackEqKeys.map(key => [key, trackEqValue(key, base.eq?.[key])])), sends: [clamp(base.sends?.[0], 0, 1, 0), clamp(base.sends?.[1], 0, 1, 0)], clips: [], instrumentLive: false, notePlayback: false, effects: Array.from({ length: 5 }, (_, slot) => { const effect = base.effects?.[slot]; return effect ? { ...effect, params: { ...effect.params } } : null; }), automation: [] };
          for (const item of overrides) {
            if (item.target === 'level') track.level = clamp(item.value, 0, 1.5, base.level);
            else if (item.target === 'pan') track.pan = clamp(item.value, -1, 1, base.pan);
            else if (/^send:[01]$/.test(item.target || '')) track.sends[Number(item.target.slice(5))] = clamp(item.value, 0, 1, 0);
            else if (/^eq:(low|lowMid|highMid|high|lowMidFreq|highMidFreq)$/.test(item.target || '')) track.eq[item.target.slice(3)] = trackEqValue(item.target.slice(3), item.value);
            else { const match = /^fx:([0-4]):([a-zA-Z][a-zA-Z0-9]*)$/.exec(item.target || ''), effect = match && track.effects[Number(match[1])]; if (effect && typeof effect.params?.[match[2]] === 'number') effect.params[match[2]] = item.value; }
          }
          if (performance.drops[index]) { track.level = 0; track.automation = track.automation.filter(lane => lane.target !== 'level'); for (let bus = 0; bus < 2; bus++) if (base.sendPre?.[bus] === true) track.sends[bus] = 0; }
          return track;
        });
        return { ...baseState, loopEnabled: false, tracks };
      }
      _servicePhase(track, beat) {
        const service = this.service, clip = service.scene.clips[track]; if (!clip) return 0;
        const period = clamp(clip.length, .0001, 256, 1), p = service.performance;
        const elapsed = Math.max(0, beat - service.padBeats[track]), mod = (a, b) => ((a % b) + b) % b;
        if (p.stutterBeats) return mod(service.phaseOrigins[track] + mod(elapsed, p.stutterBeats), period);
        if (p.fill) { const rate = clamp(clip.rate, .125, 8, 1); return mod(service.phaseOrigins[track] + elapsed * Math.min(8, rate * 2) / rate, period); }
        return mod(beat - service.sceneStarts[track], period);
      }
      _applyService(event) {
        const service = this.service;
        if (event.type === 'scene') {
          const previous = service.scene;
          service.scene = { ...event.value, clips: event.value.clips.map((clip, track) => event.value.holds?.[track] ? previous.clips[track] : clip) };
          for (let track = 0; track < TRACK_COUNT; track++) if (!event.value.holds?.[track]) { service.sceneStarts[track] = this.beat; service.padBeats[track] = this.beat; service.phaseOrigins[track] = 0; }
          service.sceneBeat = this.beat; service.padBeat = this.beat;
        }
        else {
          const value = this._servicePerformance(event.value), old = service.performance, { stutterBeats, fill } = value;
          if (stutterBeats !== old.stutterBeats || fill !== old.fill) { service.phaseOrigins = Array.from({ length: TRACK_COUNT }, (_, track) => this._servicePhase(track, this.beat)); service.padBeat = this.beat; service.padBeats = Array(TRACK_COUNT).fill(this.beat); }
          service.performance = value;
          this._setState(this._serviceState());
        }
        this._emitService(event.type, event.seq);
      }
      _servicePerformance(value = {}) {
        return { drops: Array.from({ length: TRACK_COUNT }, (_, i) => value.drops?.[i] === true), stutterBeats: [.125, .25, .5].includes(value.stutterBeats) ? value.stutterBeats : 0, fill: value.fill === true, overrides: (value.overrides || []).filter(item => item && Number.isFinite(item.value)).map(item => ({ trackId: item.trackId, target: item.target, value: item.value })) };
      }
      _emitService(type, seq) {
        const service = this.service;
        this.serviceEvents.push({ type, seq, beat: this.beat, frame: this.sampleClock, tempo: this.tempo, arrangementBeat: service?.arrangementBeat, scene: service?.scene || null, sceneBeat: service?.sceneBeat || 0, sceneStarts: service?.sceneStarts?.slice() || [], performance: service?.performance || null, padBeat: service?.padBeat || 0, padBeats: service?.padBeats?.slice() || [], phaseOrigins: service?.phaseOrigins?.slice() || [] });
      }
      drainServiceEvents(contextTime = 0, blockFrame = this.sampleClock) {
        const events = this.serviceEvents.splice(0);
        return events.map(event => ({ ...event, contextTime: contextTime + (event.frame - blockFrame) / this.sampleRate }));
      }
      stopService(seq = 0) {
        if (!this.service) return this.beat;
        const service = this.service; this._emitService('stop', seq);
        this.service = null; this.options = service.options; this._setState(service.baseState);
        this.playing = false; this.seek(service.arrangementBeat); this.countInRemaining = 0; this.clickRemaining = 0;
        return this.beat;
      }
      _serviceClips(endBeat) {
        const service = this.service, p = service.performance;
        return service.scene.clips.map((clip, track) => {
          if (!clip || this.tracks[track]?.disabled === true) return [];
          const asset = this.assets.get(clip.assetId), sr = clamp(asset?.sampleRate, 8000, 192000, 48000), duration = asset?.left?.length / sr || 0;
          const sourceStart = clamp(clip.sourceStart, 0, duration, 0), sourceEnd = clamp(clip.sourceEnd, sourceStart, duration, duration);
          if (!asset?.left?.length || sourceEnd <= sourceStart) return [];
          const geometryOptions = { clip: { ...clip, sourceStart, sourceEnd }, tempo: this.tempo, sceneBeat: service.sceneStarts[track], padBeat: service.padBeats[track], phaseOrigin: service.phaseOrigins[track], stutterBeats: p.stutterBeats, fill: p.fill }, first = serviceGeometry(geometryOptions, this.beat), result = [];
          for (let start = first.start; start <= endBeat + 1e-10; start += first.length) {
            if (start < service.sceneStarts[track] - 1e-10 && !p.fill) continue;
            result.push(compileClip({ ...clip, ...first, start, sourceStart, sourceEnd }, asset));
          }
          return result;
        });
      }
      renderRealtime(left, right, inputs = []) {
        this._reuseMeters = true;
        try { this.processBlock(left, right, inputs); }
        finally { this._reuseMeters = false; }
      }
      _publishMeters(value) {
        this._metersPooled = this._reuseMeters;
        if (this._reuseMeters) {
          const block = this._meterPool.block;
          if (!('cycle' in value)) delete block.cycle;
          if (!('microphonePeak' in value)) delete block.microphonePeak;
          if (!('countInBeatsRemaining' in value)) delete block.countInBeatsRemaining;
          this.meters = Object.assign(block, value);
        } else this.meters = value;
        return this.meters;
      }
      processBlock(left, right, inputs = []) {
        const profiler = this.cpuProfiler;
        if (!profiler?.enabled) return this._renderBlock(left, right, inputs);
        const own = !this._cpuExternal;
        if (own) this.beginDiagnostics(Math.min(left.length, right.length));
        const stamp = this._cpuSampled ? profiler.start('engine') : NaN;
        try { return this._renderBlock(left, right, inputs); }
        finally { if (this._cpuSampled) profiler.endStage('engine', stamp); if (own) this.endDiagnostics(); }
      }
      _renderBlock(left, right, inputs = []) {
        if (!this.service) return this._processBlock(left, right, inputs);
        const n = Math.min(left.length, right.length), advance = this.tempo / (60 * this.sampleRate);
        let at = 0, meters;
        while (at < n) {
          while (this.service.pending.length && this.service.pending[0].beat <= this.beat + 1e-10) this._applyService(this.service.pending.shift());
          const next = this.service.pending[0], until = next ? Math.max(1, Math.ceil((next.beat - this.beat - 1e-10) / advance)) : n - at, count = Math.min(n - at, until);
          this.clipLists = this._serviceClips(this.beat + advance * count);
          const segmentInputs = inputs.map(input => input?.map(channel => channel?.subarray(at, at + count)));
          meters = this._processBlock(left.subarray(at, at + count), right.subarray(at, at + count), segmentInputs); at += count;
        }
        return meters;
      }
      _readFreezeSource(item, frame, pair) {
        // The private native packet starts at frame zero and already includes
        // its envelopes. Read its sample clock directly, including at tempos
        // where the body duration falls between two output samples.
        const position = frame * item.sampleRate / this.sampleRate;
        pair[0] = sampleData(item.left, position) * item.gain;
        pair[1] = sampleData(item.right, position) * item.gain;
      }
      _readFrozen(frozen, position) {
        const values = frozen.last, chunks = frozen.chunks;
        if (position < 0 || position >= frozen.spec.totalFrames || !chunks.length) { values.fill(0); return; }
        const frame = Math.floor(position), fraction = position - frame;
        let chunk = chunks[frozen.chunk];
        if (!chunk || frame < chunk.startFrame || frame >= chunk.startFrame + chunk.frames) {
          let lo = 0, hi = chunks.length - 1;
          while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (chunks[mid].startFrame <= frame) lo = mid; else hi = mid - 1; }
          frozen.chunk = lo; chunk = chunks[lo];
        }
        const local = frame - chunk.startFrame, next = local + 1 < chunk.frames ? chunk : chunks[frozen.chunk + 1], nextLocal = next === chunk ? local + 1 : 0;
        for (let plane = 0; plane < 3; plane++) for (let channel = 0; channel < 2; channel++) {
          const asset = chunk.planes[plane], data = channel ? asset?.right || asset?.left : asset?.left, a = data?.[local] || 0;
          const nextAsset = next?.planes[plane], nextData = channel ? nextAsset?.right || nextAsset?.left : nextAsset?.left, b = fraction ? nextData?.[nextLocal] || 0 : a;
          values[plane * 2 + channel] = a + (b - a) * fraction;
        }
      }
      _processFrozen(index, left, right, audible, trackStem, slew, meter = null) {
        const frozen = this.frozen[index], rate = frozen.spec.sampleRate / this.sampleRate, n = left.length;
        let peak = 0, powerL = 0, powerR = 0;
        for (let frame = 0; frame < n; frame++) {
          const position = this.timelineFreezeFrames[frame]; let stopGain = 1;
          if (position >= 0) {
            const continuation = this.timelineFreezeOutgoing[frame];
            if (continuation >= 0) {
              this._readFrozen(frozen, continuation * rate); frozen.wrapOffsets.set(frozen.last);
              const count = Math.max(1, Math.min(4, this.sampleClock + frame));
              for (let past = 0; past < 4; past++) {
                if (past < count) { this._readFrozen(frozen, (continuation - past - 1) * rate); this.wrapProbe.set(frozen.last, past * 6); }
                else for (let channel = 0; channel < 6; channel++) this.wrapProbe[past * 6 + channel] = this.wrapProbe[(count - 1) * 6 + channel];
              }
            }
            this._readFrozen(frozen, position * rate); frozen.stopRemaining = 0;
            if (continuation >= 0) { for (let channel = 0; channel < 6; channel++) { const outgoing = boundedContinuation(frozen.wrapOffsets[channel], frozen.last[channel], this.wrapProbe, channel, 6), difference = outgoing - frozen.last[channel]; frozen.wrapOffsets[channel] = Math.abs(difference) > 1e-5 ? difference : 0; } frozen.wrapRemaining = this.clipWrapFrames; }
            if (frozen.wrapRemaining > 0) { const progress = 1 - frozen.wrapRemaining / this.clipWrapFrames, weight = 1 - progress * progress * (3 - 2 * progress); for (let channel = 0; channel < 6; channel++) frozen.last[channel] += frozen.wrapOffsets[channel] * weight; frozen.wrapRemaining--; }
          }
          // Pausing must never play the next cached musical event. Decay the
          // last sample while shared return effects finish their own tails.
          else if (frozen.stopRemaining > 0 && !this.timelineCountIn[frame]) { stopGain = .5 - .5 * Math.cos(Math.PI * frozen.stopRemaining / this.seekFadeFrames); frozen.stopRemaining--; }
          else { frozen.last.fill(0); stopGain = 0; }
          const goal = audible ? 1 : 0; frozen.gate += (goal - frozen.gate) * slew;
          if (Math.abs(goal - frozen.gate) < 1e-10) frozen.gate = goal;
          const gain = frozen.gate * stopGain, a = frozen.last[0] * gain, b = frozen.last[1] * gain, dry = this.dryMixGains[frame];
          if (!trackStem && (this.outputTargets[index] !== 0 || this.outputRoutes[index][1] !== 0 || this.outputRoutes[index][2] !== 0)) this._routeGroup(index, frame, a, b, left, right, dry);
          else if (dry === 1) { left[frame] += a; right[frame] += b; }
          else if (dry !== 0) { left[frame] += a * dry; right[frame] += b * dry; }
          if (!trackStem) for (let bus = 0; bus < 2; bus++) { this.returnBuffers[bus][0][frame] += frozen.last[2 + bus * 2] * gain; this.returnBuffers[bus][1][frame] += frozen.last[3 + bus * 2] * gain; }
          peak = Math.max(peak, Math.abs(a), Math.abs(b)); powerL += a * a; powerR += b * b;
        }
        return writeMeter(meter, peak, powerL, powerR, n);
      }
      _routeGroup(track, frame, a, b, left, right, dry) {
        const route = this.outputRoutes[track], target = this.outputTargets[track], slew = this.mixSlew;
        for (let destination = 0; destination < 3; destination++) {
          const goal = target === destination ? 1 : 0;
          route[destination] += (goal - route[destination]) * slew;
          if (Math.abs(goal - route[destination]) < 1e-10) route[destination] = goal;
          const weight = route[destination]; if (weight === 0) continue;
          const l = weight === 1 ? a : a * weight, r = weight === 1 ? b : b * weight;
          if (destination === 0) {
            if (dry === 1) { left[frame] += l; right[frame] += r; }
            else if (dry !== 0) { left[frame] += l * dry; right[frame] += r * dry; }
          } else {
            const pair = this.busBuffers[destination - 1];
            if (pair) { pair[0][frame] += l; pair[1][frame] += r; }
          }
        }
      }
      _processGroups(left, right, blockBeat, blockPlaying, anySolo, trackStem, returnStem, selectedBus, cpu) {
        if (trackStem || !this.groupRoutingPresent) return idleBusMeters;
        const meters = this._reuseMeters ? this._meterPool.busRows.fill(disabledMeter) : [disabledMeter, disabledMeter], n = left.length, slew = this.mixSlew;
        for (let bus = 0; bus < 2; bus++) {
          const moving = this.outputRoutes.some((route, track) => this.tracks[track].disabled !== true && route[bus + 1] !== 0);
          if (!(this.busRouteCounts[bus] || moving || this.busTailFrames[bus]) || !this.busBuffers[bus]) continue;
          const owner = this.buses[bus], [l, r] = this.busBuffers[bus], gain = this.busGains[bus], controls = this.busAutomation[bus], modulation = this.modulationOwners[BUS_OFFSET + bus], panCurve = this.panCurves[BUS_OFFSET + bus], keys = cpu ? this._cpuKeys[BUS_OFFSET + bus] : null, start = cpu ? cpu.start(keys.owner) : NaN;
          let lastInput = -1; for (let i = 0; i < n; i++) if (l[i] !== 0 || r[i] !== 0) lastInput = i;
          let tailBudget = this.busTailFrames[bus];
          if (lastInput >= 0) {
            let tail = .03;
            for (const slot of this.busSlots[bus]) if (slot && !slot.bypass) tail += Math.max(0, Number(slot.dsp.getTailTime?.({ tempo: this.tempo, beat: blockBeat, playing: blockPlaying })) || 0);
            tailBudget = lastInput + 1 + Math.ceil(this.sampleRate * Math.min(120, tail * 1.5 + .03));
          }
          const retiring = !this.busRouteCounts[bus] && !moving;
          this._processRack(owner, this.busSlots[bus], controls, l, r, blockBeat, blockPlaying, modulation);
          const mixStart = cpu ? cpu.start(keys.mix) : NaN;
          const hasSoloSource = this.tracks.some(track => track.disabled !== true && track.solo === true && track.output === owner.id);
          const audible = !returnStem && owner.mute !== true && (!anySolo || owner.solo === true || hasSoloSource) && (selectedBus < 0 || selectedBus === bus);
          const fixedPan = !controls.pan && !modulation.pan ? clamp(owner.pan, -1, 1, 0) : null, fixedLevel = !audible ? 0 : !controls.level && !modulation.level ? clamp(owner.level, 0, 1.5, 1) : null;
          let peak = 0, powerL = 0, powerR = 0;
          for (let i = 0; i < n; i++) {
            const beat = this.timelineBeats[i], pan = fixedPan ?? clamp(this._lfoValue(modulation.pan, i, automationValue(controls.pan, beat, owner.pan)), -1, 1, 0), level = fixedLevel ?? clamp(this._lfoValue(modulation.level, i, automationValue(controls.level, beat, owner.level)), 0, 1.5, 1);
            if (pan !== panCurve.value) { const angle = (pan + 1) * Math.PI / 4; panCurve.value = pan; panCurve.cosine = Math.cos(angle); panCurve.sine = Math.sin(angle); }
            const goalL = pan === 0 ? level : level * panCurve.cosine * Math.SQRT2, goalR = pan === 0 ? level : level * panCurve.sine * Math.SQRT2;
            gain[0] += (goalL - gain[0]) * slew; gain[1] += (goalR - gain[1]) * slew;
            let a = l[i] * gain[0], b = r[i] * gain[1]; if (!Number.isFinite(a)) a = 0; if (!Number.isFinite(b)) b = 0;
            if (retiring) { const release = clamp((tailBudget - i - 1) / Math.max(1, this.sampleRate * .012), 0, 1, 0); a *= release; b *= release; }
            const dry = selectedBus >= 0 ? 1 : this.dryMixGains[i];
            if (dry === 1) { if (a !== 0) left[i] += a; if (b !== 0) right[i] += b; }
            else if (dry !== 0) { if (a !== 0) left[i] += a * dry; if (b !== 0) right[i] += b * dry; }
            peak = Math.max(peak, Math.abs(a), Math.abs(b)); powerL += a * a; powerR += b * b;
          }
          this.busTailFrames[bus] = Math.max(0, tailBudget - n);
          if (!this.busRouteCounts[bus] && !moving && !this.busTailFrames[bus]) {
            this._updateRack({}, this.busSlots[bus]);
            if (this.cpuProfiler?.enabled) this._syncDiagnosticsTopology();
          }
          meters[bus] = writeMeter(this._reuseMeters ? this._meterPool.buses[bus] : null, peak, powerL, powerR, n);
          if (cpu) { cpu.endStage(keys.mix, mixStart); cpu.endStage(keys.owner, start); }
        }
        if (!this.busRouteCounts.some(Boolean) && !this.busTailFrames.some(Boolean) && !this.outputRoutes.some((route, t) => this.tracks[t].disabled !== true && (route[1] !== 0 || route[2] !== 0))) this.groupRoutingPresent = false;
        return meters;
      }
      _processBlock(left, right, inputs = []) {
        const n = Math.min(left.length, right.length), sr = this.sampleRate;
        const cpu = this._cpuSampled ? this.cpuProfiler : null, clipsStart = cpu ? cpu.start('clips') : NaN;
        left.fill(0); right.fill(0);
        const microphone = inputs[TRACK_COUNT]; this.microphonePeak = 0;
        if (microphone?.[0]) for (let f = 0; f < n; f++) this.microphonePeak = Math.max(this.microphonePeak, Math.abs(microphone[0][f] || 0), Math.abs((microphone[1] || microphone[0])[f] || 0));
        if (this.silent) { if (cpu) cpu.endStage('clips', clipsStart); return this._publishMeters({ beat: this.beat, playing: false, ended: this.ended, tracks: this._reuseMeters ? this._meterPool.trackRows.fill(disabledMeter) : Array.from({ length: TRACK_COUNT }, emptyMeter), returns: this._reuseMeters ? this._meterPool.returnRows.fill(disabledMeter) : Array.from({ length: 2 }, emptyMeter), buses: idleBusMeters, master: this._reuseMeters ? disabledMeter : emptyMeter() }); }
        for (const t of this.activeTrackIndices) if (this.buffers[t]?.[0].length !== n) this.buffers[t] = [new Float32Array(n), new Float32Array(n)];
        if (!this.returnBuffers.length || this.returnBuffers[0][0].length !== n) this.returnBuffers = Array.from({ length: 2 }, () => [new Float32Array(n), new Float32Array(n)]);
        else for (const pair of this.returnBuffers) { pair[0].fill(0); pair[1].fill(0); }
        if (this.groupRoutingPresent) for (let bus = 0; bus < 2; bus++) {
          const moving = this.outputRoutes.some((route, track) => this.tracks[track].disabled !== true && route[bus + 1] !== 0), active = this.freezeCaptureIndex < 0 && (this.busRouteCounts[bus] || moving || this.busTailFrames[bus]);
          if (!active) continue;
          if (this.busBuffers[bus]?.[0].length !== n) this.busBuffers[bus] = [new Float32Array(n), new Float32Array(n)];
          else { this.busBuffers[bus][0].fill(0); this.busBuffers[bus][1].fill(0); }
          if (!this.busSlots[bus].some(Boolean) && this.buses[bus].effects?.some(Boolean)) this._updateRack(this.buses[bus], this.busSlots[bus], this.busAutomation[bus]);
        }
        if (!this.timelineBeats || this.timelineBeats.length !== n) { this.timelineBeats = new Float64Array(n); this.timelinePlaying = new Uint8Array(n); this.timelineCountIn = new Uint8Array(n); this.timelineClickBeats = new Float64Array(n); }
        if (this.hasFrozen && this.timelineFreezeFrames?.length !== n) { this.timelineFreezeFrames = new Float64Array(n); this.timelineFreezeOutgoing = new Float64Array(n); }
        if (this.freezeCaptureIndex >= 0) {
          if (this.freezeCapture?.main[0].length !== n) this.freezeCapture = { main: [new Float32Array(n), new Float32Array(n)], sendA: [new Float32Array(n), new Float32Array(n)], sendB: [new Float32Array(n), new Float32Array(n)] };
          else for (const pair of Object.values(this.freezeCapture)) { pair[0].fill(0); pair[1].fill(0); }
        }
        this.countInEnded = false;
        const blockBeat = this.beat, advance = this.tempo / (60 * sr), secondsPerBeat = 60 / this.tempo;
        const anyBusSolo = this.buses.some(bus => bus.solo === true), anySolo = anyBusSolo || this.tracks.some(t => t.disabled !== true && t.solo === true), selected = this.options.trackId == null ? -1 : indexFor(this.options.trackId, this.tracks);
        const audible = this.tracks.map((t, i) => t.disabled !== true && (this.freezeCaptureIndex >= 0 ? i === this.freezeCaptureIndex : !t.mute && (!anySolo || t.solo || this.buses.some(bus => bus.id === t.output && bus.solo === true)) && (selected < 0 || i === selected) && (this.options.busId == null || t.output === this.options.busId)));
        const trackStem = this.options.trackId != null, returnStem = this.options.returnId != null, busStem = this.options.busId != null, selectedBus = busStem ? (this.options.busId === 'bus-1' ? 0 : 1) : -1, selectedReturn = returnStem ? (this.options.returnId === 'return-1' ? 0 : 1) : -1;
        const anyReturnSolo = this.returns.some(bus => bus.solo === true), dryAudible = !returnStem && !anyReturnSolo;
        const loopStart = clamp(this.state.loopStart, 0, 255, 0), loopEnd = clamp(this.state.loopEnd, loopStart + .25, 256, 16);
        const loop = !this.options.linear && !this.recordingPunch && this.state.loopEnabled === true;
        const stopAtEnd = !this.options.linear && !loop && !this.recordingHold;
        const sessionEnd = this.endBeat, blockPlaying = this.playing;
        let playingFrames = this.playing ? n : 0;
        const blockEnd = blockBeat + advance * n, wraps = loop && blockEnd >= loopEnd - 1e-10, wholeLoop = loop && advance * n >= loopEnd - loopStart;
        const wrappedEnd = wraps ? loopStart + Math.max(0, blockEnd - loopEnd) % (loopEnd - loopStart) : loopStart;
        const candidates = this._clipCandidates;
        for (const t of this.activeTrackIndices) {
          const list = candidates[t]; let count = 0;
          if (this.playing) for (const item of this.clipLists[t]) {
            const end = item.start + item.length;
            const overlaps = wholeLoop ? (item.start < loopEnd && end > loopStart) || (item.start <= blockBeat && end > blockBeat)
              : wraps ? (item.start < loopEnd && end > blockBeat) || (item.start <= wrappedEnd && end > loopStart) || (item.start <= blockBeat && end > blockBeat)
                : item.start <= blockEnd && end > blockBeat;
            if (overlaps) list[count++] = item;
          }
          list.length = count;
        }
        const minimumFade = .003 / secondsPerBeat;
        for (const t of this.activeTrackIndices) for (const item of candidates[t]) { item.blockFadeIn = Math.min(item.length * .5, Math.max(minimumFade, item.fadeIn)); item.blockFadeOut = Math.min(item.length * .5, Math.max(minimumFade, item.fadeOut)); }
        for (const t of this.activeTrackIndices) {
          const [l, r] = this.buffers[t], input = inputs[t], useInput = !this.frozen[t] && (this.freezeCaptureIndex < 0 || t === this.freezeCaptureIndex) && (this.tracks[t].instrumentLive !== false || this.tracks[t].notePlayback === true || this.auditionTracks.has(t)) && !this.recordOnly.has(t);
          if (useInput && input?.[0]) {
            l.set(input[0].subarray(0, n)); r.set((input[1] || input[0]).subarray(0, n));
            if (this.playing && stopAtEnd && blockEnd >= sessionEnd - advance * this.seekFadeFrames && !this.auditionTracks.has(t)) for (let frame = 0; frame < n; frame++) {
              const fade = Math.max(0, Math.min(1, (sessionEnd - blockBeat - frame * advance) / (advance * this.seekFadeFrames)));
              l[frame] *= fade; r[frame] *= fade;
            }
          }
          else { l.fill(0); r.fill(0); }
        }
        for (let frame = 0; frame < n; frame++) {
          const countingIn = this.countInRemaining > 0;
          if (this.hasFrozen) { this.timelineFreezeOutgoing[frame] = this.freezeContinuation ?? -1; this.freezeContinuation = null; }
          this.timelineBeats[frame] = this.beat;
          this.timelinePlaying[frame] = this.playing ? 1 : 0;
          this.timelineCountIn[frame] = countingIn ? 1 : 0;
          this.timelineClickBeats[frame] = countingIn ? (this.countInTotal - this.countInRemaining) * advance : this.beat;
          if (countingIn) {
            if (this.hasFrozen) this.timelineFreezeFrames[frame] = -1;
            for (const t of this.activeTrackIndices) { this.buffers[t][0][frame] = 0; this.buffers[t][1][frame] = 0; }
            if (--this.countInRemaining === 0) this.countInEnded = true;
            continue;
          }
          if (this.playing && stopAtEnd && this.beat >= sessionEnd - 1e-10) { this.beat = sessionEnd; this.playing = false; this.ended = true; this.freezeTail = this.hasFrozen; this.clickRemaining = 0; playingFrames = frame; }
          // Advance a sample cursor, rather than deriving cache reads from the
          // accumulated floating-point beat. Count-in and pause hold it still.
          const freezeAdvancing = this.hasFrozen && (this.playing || this.freezeTail);
          if (this.hasFrozen) this.timelineFreezeFrames[frame] = freezeAdvancing ? this.freezeFrame : -1;
          const beat = this.beat;
          if (this.ended) for (const t of this.activeTrackIndices) if (!this.auditionTracks.has(t)) { this.buffers[t][0][frame] = 0; this.buffers[t][1][frame] = 0; }
          if (this.playing) {
            const wrapContinuation = this.clipWrapContinuation;
            if (wrapContinuation !== null) this.clipWrapRemaining = this.clipWrapFrames;
            const wrapProgress = 1 - this.clipWrapRemaining / this.clipWrapFrames;
            const wrapWeight = this.clipWrapRemaining > 0 ? 1 - wrapProgress * wrapProgress * (3 - 2 * wrapProgress) : 0;
            for (const t of this.activeTrackIndices) {
              if (this.frozen[t] || this.freezeCaptureIndex >= 0 && t !== this.freezeCaptureIndex) continue;
              const [l, r] = this.buffers[t];
              let clipLeft = 0, clipRight = 0;
              for (const item of candidates[t]) {
                if (this.freezeCaptureIndex === t && item.freezeTailSource) this._readFreezeSource(item, this.sampleClock + frame, this.clipSample);
                else readClip(item, beat, secondsPerBeat, this.clipSample);
                clipLeft += this.clipSample[0]; clipRight += this.clipSample[1];
              }
              const correction = this.clipWrapOffsets[t];
              if (wrapContinuation !== null) {
                let outgoingLeft = 0, outgoingRight = 0;
                // Read a continuous continuation without admitting an attack
                // beyond the loop. All probes are seam-only and clip-only.
                for (const item of this.clipLists[t]) {
                  readClip(item, wrapContinuation, secondsPerBeat, this.clipSample);
                  outgoingLeft += this.clipSample[0]; outgoingRight += this.clipSample[1];
                }
                if (Math.abs(outgoingLeft - clipLeft) > 1e-5 || Math.abs(outgoingRight - clipRight) > 1e-5) {
                  const count = Math.max(1, Math.min(4, this.sampleClock + frame));
                  for (let past = 0; past < 4; past++) {
                    let a = 0, b = 0;
                    if (past < count) for (const item of this.clipLists[t]) { readClip(item, wrapContinuation - (past + 1) * advance, secondsPerBeat, this.clipSample); a += this.clipSample[0]; b += this.clipSample[1]; }
                    else { a = this.wrapProbe[(count - 1) * 2]; b = this.wrapProbe[(count - 1) * 2 + 1]; }
                    this.wrapProbe[past * 2] = a; this.wrapProbe[past * 2 + 1] = b;
                  }
                  outgoingLeft = boundedContinuation(outgoingLeft, clipLeft, this.wrapProbe, 0, 2); outgoingRight = boundedContinuation(outgoingRight, clipRight, this.wrapProbe, 1, 2);
                }
                correction[0] = Math.abs(outgoingLeft - clipLeft) > 1e-5 ? outgoingLeft - clipLeft : 0;
                correction[1] = Math.abs(outgoingRight - clipRight) > 1e-5 ? outgoingRight - clipRight : 0;
              }
              l[frame] += clipLeft + correction[0] * wrapWeight;
              r[frame] += clipRight + correction[1] * wrapWeight;
            }
            this.clipWrapContinuation = null;
            if (this.clipWrapRemaining > 0) this.clipWrapRemaining--;
            this.beat += advance;
            if (freezeAdvancing) this.freezeFrame++;
            if (loop && this.beat >= loopEnd - 1e-10) {
              if (this.hasFrozen) { this.freezeContinuation = this.freezeFrame; this.freezeFrame = loopStart * secondsPerBeat * sr + Math.max(0, this.freezeFrame - loopEnd * secondsPerBeat * sr) % ((loopEnd - loopStart) * secondsPerBeat * sr); }
              this.clipWrapContinuation = this.beat;
              this.beat = loopStart + Math.max(0, this.beat - loopEnd) % (loopEnd - loopStart); this.transportCycle++;
            }
            else if (stopAtEnd && this.beat >= sessionEnd - 1e-10) { this.beat = sessionEnd; this.playing = false; this.ended = true; this.freezeTail = this.hasFrozen; this.clickRemaining = 0; playingFrames = frame + 1; }
          }
          else if (freezeAdvancing) this.freezeFrame++;
          if (!this.playing && this.freezeCaptureIndex >= 0 && this.freezeSourceTailActive) {
            // Native notes already carry their release audio in one private
            // packet. Only that packet may continue after the musical body;
            // transport, automation and every ordinary source remain stopped.
            const tailFrame = this.freezeSourceTailBase + this.freezeSourceTailFrame++, [l, r] = this.buffers[this.freezeCaptureIndex];
            for (const item of this.clipLists[this.freezeCaptureIndex]) if (item.freezeTailSource) { this._readFreezeSource(item, tailFrame, this.clipSample); l[frame] += this.clipSample[0]; r[frame] += this.clipSample[1]; }
          }
        }
        // The dry microphone has its own input. Monitoring is mixed into one
        // lane before its rack, independent of native-instrument live controls,
        // and remains available during count-in or stopped practice.
        if (this.microphoneMonitor.enabled && microphone?.[0]) {
          const pair = this.buffers[this.microphoneMonitor.track];
          if (pair && !this.frozen[this.microphoneMonitor.track]) for (let f = 0; f < n; f++) { pair[0][f] += Number.isFinite(microphone[0][f]) ? microphone[0][f] : 0; const v = (microphone[1] || microphone[0])[f]; pair[1][f] += Number.isFinite(v) ? v : 0; }
        }
        if (cpu) cpu.endStage('clips', clipsStart);
        const modulationStart = cpu ? cpu.start('modulation') : NaN;
        if (this.modulation?.active) this.modulation.render(this.timelineBeats, this.timelinePlaying, this.timelineCountIn, this.sampleClock, this.tempo, this.service ? (ownerId, target) => {
          const index = indexFor(ownerId, this.tracks); if (index < 0 || !this.service.performance.drops[index]) return 1;
          return target === 'level' || /^send:[01]$/.test(target) && this.tracks[index].sendPre?.[Number(target.slice(5))] === true ? 0 : 1;
        } : null);
        if (cpu) cpu.endStage('modulation', modulationStart);
        const trackMeters = this._reuseMeters ? this._meterPool.trackRows.fill(disabledMeter) : Array(TRACK_COUNT).fill(disabledMeter), slew = this.mixSlew;
        if (!this.dryMixGains || this.dryMixGains.length !== n) this.dryMixGains = new Float64Array(n);
        const dryGoal = dryAudible ? 1 : 0;
        for (let frame = 0; frame < n; frame++) {
          this.dryGain += (dryGoal - this.dryGain) * slew;
          if (Math.abs(dryGoal - this.dryGain) < 1e-10) this.dryGain = dryGoal;
          this.dryMixGains[frame] = this.dryGain;
        }
        for (const t of this.activeTrackIndices) {
          const [l, r] = this.buffers[t], track = this.tracks[t], modulation = this.modulationOwners[t], panCurve = this.panCurves[t], keys = cpu ? this._cpuKeys[t] : null, ownerStart = cpu ? cpu.start(keys.owner) : NaN;
          if (this.frozen[t]) { const mixStart = cpu ? cpu.start(keys.mix) : NaN; trackMeters[t] = this._processFrozen(t, left, right, audible[t], trackStem, slew, this._reuseMeters ? this._meterPool.tracks[t] : null); if (cpu) { cpu.endStage(keys.mix, mixStart); cpu.endStage(keys.owner, ownerStart); } continue; }
          if (this.freezeCaptureIndex >= 0 && t !== this.freezeCaptureIndex) continue;
          this._processRack(track, this.slots[t], this.automation[t], l, r, blockBeat, blockPlaying, modulation);
          const eqStart = cpu ? cpu.start(keys.eq) : NaN;
          this._processTrackEq(t, l, r);
          if (cpu) cpu.endStage(keys.eq, eqStart);
          const mixStart = cpu ? cpu.start(keys.mix) : NaN;
          const gain = this.gains[t]; let peak = 0, powerL = 0, powerR = 0;
          // Static controls do not need a lane/route lookup on every sample.
          // Gain ramps and all signal arithmetic retain their released order.
          const controls = this.automation[t], fixedPan = !controls.pan && !modulation.pan ? clamp(track.pan, -1, 1, 0) : null;
          const fixedLevel = !audible[t] ? 0 : !controls.level && !modulation.level ? clamp(track.level, 0, 1.5, .8) : null;
          const fixedSendA = !controls.sends[0] && !modulation.sends[0] ? clamp(track.sends?.[0], 0, 1, 0) : null;
          const fixedSendB = !controls.sends[1] && !modulation.sends[1] ? clamp(track.sends?.[1], 0, 1, 0) : null;
          for (let f = 0; f < n; f++) {
            const beat = this.timelineBeats[f], pan = fixedPan ?? clamp(this._lfoValue(modulation.pan, f, automationValue(controls.pan, beat, track.pan)), -1, 1, 0), level = fixedLevel ?? clamp(this._lfoValue(modulation.level, f, automationValue(controls.level, beat, track.level)), 0, 1.5, .8);
            if (pan !== panCurve.value) { const angle = (pan + 1) * Math.PI / 4; panCurve.value = pan; panCurve.cosine = Math.cos(angle); panCurve.sine = Math.sin(angle); }
            // Keep the released multiply order; reassociating the level and
            // equal-power factor would change floating-point output samples.
            const goalL = level * panCurve.cosine * Math.SQRT2, goalR = level * panCurve.sine * Math.SQRT2;
            gain[0] += (goalL - gain[0]) * slew; gain[1] += (goalR - gain[1]) * slew;
            let a = l[f] * gain[0], b = r[f] * gain[1];
            if (!Number.isFinite(a)) a = 0; if (!Number.isFinite(b)) b = 0;
            if (this.freezeCaptureIndex === t) { this.freezeCapture.main[0][f] = a; this.freezeCapture.main[1][f] = b; }
            const dryGain = this.dryMixGains[f];
            if (!trackStem && this.freezeCaptureIndex < 0 && (this.outputTargets[t] !== 0 || this.outputRoutes[t][1] !== 0 || this.outputRoutes[t][2] !== 0)) this._routeGroup(t, f, a, b, left, right, dryGain);
            else if (dryGain === 1) { left[f] += a; right[f] += b; }
            else if (dryGain !== 0) { left[f] += a * dryGain; right[f] += b * dryGain; }
            if (!trackStem) {
              const panL = audible[t] ? panCurve.cosine * Math.SQRT2 : 0, panR = audible[t] ? panCurve.sine * Math.SQRT2 : 0;
              const pre = this.preGains[t]; pre[0] += (panL - pre[0]) * slew; pre[1] += (panR - pre[1]) * slew;
              const preL = Number.isFinite(l[f]) ? l[f] * pre[0] : 0, preR = Number.isFinite(r[f]) ? r[f] * pre[1] : 0;
              for (let bus = 0; bus < 2; bus++) {
                const fixedSend = bus ? fixedSendB : fixedSendA, goal = fixedSend ?? clamp(this._lfoValue(modulation.sends[bus], f, automationValue(controls.sends[bus], beat, track.sends?.[bus])), 0, 1, 0), send = this.sendGains[t];
                send[bus] += (goal - send[bus]) * slew;
                const tap = this.sendPreMix[t]; tap[bus] += ((track.sendPre?.[bus] === true ? 1 : 0) - tap[bus]) * slew;
                if (send[bus] !== 0) { this.returnBuffers[bus][0][f] += (a + (preL - a) * tap[bus]) * send[bus]; this.returnBuffers[bus][1][f] += (b + (preR - b) * tap[bus]) * send[bus]; }
              }
            }
            peak = Math.max(peak, Math.abs(a), Math.abs(b)); powerL += a * a; powerR += b * b;
          }
          trackMeters[t] = writeMeter(this._reuseMeters ? this._meterPool.tracks[t] : null, peak, powerL, powerR, n);
          if (cpu) { cpu.endStage(keys.mix, mixStart); cpu.endStage(keys.owner, ownerStart); }
        }
        if (this.freezeCaptureIndex >= 0) {
          // Tap before shared returns, master processing, limiter and global
          // return-solo dry suppression. Their processing remains live.
          this.freezeCapture.sendA[0].set(this.returnBuffers[0][0]); this.freezeCapture.sendA[1].set(this.returnBuffers[0][1]);
          this.freezeCapture.sendB[0].set(this.returnBuffers[1][0]); this.freezeCapture.sendB[1].set(this.returnBuffers[1][1]);
          left.set(this.freezeCapture.main[0]); right.set(this.freezeCapture.main[1]); this.sampleClock += n;
          return this._publishMeters({ beat: this.beat, playing: this.playing, ended: this.ended, tracks: trackMeters, returns: this._reuseMeters ? this._meterPool.returnRows.fill(disabledMeter) : [emptyMeter(), emptyMeter()], buses: idleBusMeters, master: trackMeters[this.freezeCaptureIndex] });
        }
        const busMeters = this._processGroups(left, right, blockBeat, blockPlaying, anySolo, trackStem, returnStem, selectedBus, cpu);
        const returnMeters = this._reuseMeters ? this._meterPool.returnRows : [];
        for (let bus = 0; bus < 2; bus++) {
          const owner = this.returns[bus], [l, r] = this.returnBuffers[bus], gain = this.returnGains[bus], modulation = this.modulationOwners[RETURN_OFFSET + bus], panCurve = this.panCurves[RETURN_OFFSET + bus], keys = cpu ? this._cpuKeys[RETURN_OFFSET + bus] : null, ownerStart = cpu ? cpu.start(keys.owner) : NaN;
          if (!trackStem && !busStem) this._processRack(owner, this.returnSlots[bus], this.returnAutomation[bus], l, r, blockBeat, blockPlaying, modulation);
          const mixStart = cpu ? cpu.start(keys.mix) : NaN;
          const audibleReturn = !trackStem && !busStem && owner.mute !== true && (!anyReturnSolo || owner.solo === true) && (!returnStem || selectedReturn === bus);
          let peak = 0, powerL = 0, powerR = 0;
          for (let frame = 0; frame < n; frame++) {
            const beat = this.timelineBeats[frame], level = audibleReturn ? clamp(this._lfoValue(modulation.level, frame, automationValue(this.returnAutomation[bus].level, beat, owner.level)), 0, 1.5, 1) : 0, pan = clamp(this._lfoValue(modulation.pan, frame, automationValue(this.returnAutomation[bus].pan, beat, owner.pan)), -1, 1, 0);
            if (pan !== panCurve.value) { const angle = (pan + 1) * Math.PI / 4; panCurve.value = pan; panCurve.cosine = Math.cos(angle); panCurve.sine = Math.sin(angle); }
            const goalL = level * panCurve.cosine * Math.SQRT2, goalR = level * panCurve.sine * Math.SQRT2;
            gain[0] += (goalL - gain[0]) * slew; gain[1] += (goalR - gain[1]) * slew;
            let a = l[frame] * gain[0], b = r[frame] * gain[1]; if (!Number.isFinite(a)) a = 0; if (!Number.isFinite(b)) b = 0;
            // Avoid even an added zero operation in the released zero-send mix.
            if (a !== 0) left[frame] += a; if (b !== 0) right[frame] += b;
            peak = Math.max(peak, Math.abs(a), Math.abs(b)); powerL += a*a; powerR += b*b;
          }
          returnMeters[bus] = writeMeter(this._reuseMeters ? this._meterPool.returns[bus] : null, peak, powerL, powerR, n);
          if (cpu) { cpu.endStage(keys.mix, mixStart); cpu.endStage(keys.owner, ownerStart); }
        }
        const masterKeys = cpu ? this._cpuKeys[MASTER_INDEX] : null, masterStart = cpu ? cpu.start(masterKeys.owner) : NaN;
        const masterModulation = this.modulationOwners[MASTER_INDEX];
        if (!trackStem && !returnStem && !busStem) this._processRack(this.master, this.masterSlots, this.masterAutomation, left, right, blockBeat, blockPlaying, masterModulation);
        const masterMixStart = cpu ? cpu.start(masterKeys.mix) : NaN;
        const masterLevel = busStem ? 1 : clamp(this.state.master?.level, 0, 1.5, .8), metronome = !busStem && this.options.includeMetronome && this.state.master?.metronome && blockPlaying;
        const masteringActive = !trackStem && !returnStem && !busStem && !!this.masteringDSP?.isActive();
        const masteringLimiter = masteringActive && this.masteringSettings?.enabled === true && this.masteringSettings.bypass !== true && this.masteringSettings.limiter === true;
        let peak = 0, powerL = 0, powerR = 0;
        for (let f = 0; f < n; f++) {
          const baseLevel = !busStem && this.masterAutomation.level ? clamp(automationValue(this.masterAutomation.level, this.timelineBeats[f], masterLevel), 0, 1.5, .8) : masterLevel, level = busStem ? 1 : clamp(this._lfoValue(masterModulation.level, f, baseLevel), 0, 1.5, .8);
          this.masterGain += (level - this.masterGain) * slew;
          let a = left[f] * this.masterGain, b = right[f] * this.masterGain;
          if (!busStem && (this.timelineCountIn[f] || (metronome && this.timelinePlaying[f]))) {
            const clickBeat = this.timelineClickBeats[f];
            const integerBeat = Math.floor(clickBeat + 1e-9);
            if (integerBeat !== this.previousClickBeat) { this.previousClickBeat = integerBeat; this.clickRemaining = Math.round(sr * .028); this.clickPhase = 0; this.clickFrequency = integerBeat % 4 === 0 ? 1500 : 1000; }
            if (this.clickRemaining > 0) { const env = this.clickRemaining / (sr * .028), sample = Math.sin(this.clickPhase) * env * env * .12; this.clickPhase += Math.PI * 2 * this.clickFrequency / sr; this.clickRemaining--; a += sample; b += sample; }
          }
          // Preserve the released safety envelope unless the explicit mastering
          // limiter takes responsibility for the user-selected final ceiling.
          if (!busStem && !masteringLimiter) {
            const maximum = Math.max(Math.abs(a), Math.abs(b)), target = maximum > .98 ? .98 / maximum : 1;
            this.limitGain = target < this.limitGain ? target : this.limitGain + (target - this.limitGain) * this.limitRelease;
            a *= this.limitGain; b *= this.limitGain;
          } else this.limitGain = 1;
          if (masteringActive) { left[f] = a; right[f] = b; continue; }
          if (this.seekFadeRemaining > 0) {
            const progress = 1 - this.seekFadeRemaining / this.seekFadeFrames, blend = .5 - .5 * Math.cos(Math.PI * progress);
            a = this.seekOrigin[0] * (1 - blend) + a * blend; b = this.seekOrigin[1] * (1 - blend) + b * blend; this.seekFadeRemaining--;
          }
          const muteGoal = !busStem && this.master.mute === true ? 0 : 1;
          this.masterMuteGain += (muteGoal - this.masterMuteGain) * slew;
          if (Math.abs(muteGoal - this.masterMuteGain) < 1e-10) this.masterMuteGain = muteGoal;
          if (this.masterMuteGain !== 1) { a *= this.masterMuteGain; b *= this.masterMuteGain; }
          this.lastOutput[0] = a; this.lastOutput[1] = b;
          left[f] = a; right[f] = b; peak = Math.max(peak, Math.abs(a), Math.abs(b)); powerL += a * a; powerR += b * b;
        }
        if (cpu) cpu.endStage(masterKeys.mix, masterMixStart);
        if (masteringActive) {
          const stamp = cpu ? cpu.start('master:mastering') : NaN;
          this._processMastering(left, right);
          if (cpu) cpu.endStage('master:mastering', stamp);
          // Mute and seek declick remain last, after every mastering stage.
          // The original single-pass path above remains untouched when off.
          const finalMixStart = cpu ? cpu.start(masterKeys.mix) : NaN;
          for (let frame = 0; frame < n; frame++) {
            let a = left[frame], b = right[frame];
            if (this.seekFadeRemaining > 0) {
              const progress = 1 - this.seekFadeRemaining / this.seekFadeFrames, blend = .5 - .5 * Math.cos(Math.PI * progress);
              a = this.seekOrigin[0] * (1 - blend) + a * blend; b = this.seekOrigin[1] * (1 - blend) + b * blend; this.seekFadeRemaining--;
            }
            const muteGoal = !busStem && this.master.mute === true ? 0 : 1;
            this.masterMuteGain += (muteGoal - this.masterMuteGain) * slew;
            if (Math.abs(muteGoal - this.masterMuteGain) < 1e-10) this.masterMuteGain = muteGoal;
            if (this.masterMuteGain !== 1) { a *= this.masterMuteGain; b *= this.masterMuteGain; }
            this.lastOutput[0] = a; this.lastOutput[1] = b;
            left[frame] = a; right[frame] = b; peak = Math.max(peak, Math.abs(a), Math.abs(b)); powerL += a * a; powerR += b * b;
          }
          if (cpu) cpu.endStage(masterKeys.mix, finalMixStart);
        }
        if (!trackStem && !returnStem && !busStem && this.masteringAnalysis && this.masteringDSP) {
          const stamp = cpu ? cpu.start('master:mastering') : NaN;
          this.masteringDSP.analyze(left, right);
          if (cpu) cpu.endStage('master:mastering', stamp);
        }
        if (cpu) cpu.endStage(masterKeys.owner, masterStart);
        this.sampleClock += n;
        return this._publishMeters({ beat: this.beat, cycle: this.transportCycle, playing: this.playing, ended: this.ended, microphonePeak: this.microphonePeak, countInBeatsRemaining: this.countInRemaining * advance, tracks: trackMeters, returns: returnMeters, buses: busMeters, master: writeMeter(this._reuseMeters ? this._meterPool.master : null, peak, powerL, powerR, n) });
      }
    }

    class Recorder {
      constructor(sampleRate, onChunk, onLimit) {
        this.sampleRate = sampleRate; this.onChunk = onChunk; this.onLimit = onLimit; this.active = false; this.frames = 0; this.tracks = [];
        // Half a second of dry history supports signed manual compensation and
        // retains attacks played immediately before a punch/count-in boundary.
        this.microphoneClock = 0; this.historyFrames = Math.max(1, Math.ceil(sampleRate * .5));
        this.microphoneHistory = [new Float32Array(this.historyFrames), new Float32Array(this.historyFrames)];
      }
      start(id, tracks, startBeat, maxFrames, schedule = {}) {
        this.id = id; this.tracks = tracks.slice(); this.startBeat = startBeat; this.maxFrames = Math.max(1, Math.round(maxFrames)); this.frames = 0; this.used = 0; this.active = true;
        this.schedule = schedule; this.microphone = schedule.microphone || null; this.started = false;
        this.microphoneStart = null; this.microphoneEnd = Infinity; this.microphoneEndReason = null; this.stopId = undefined;
        this.compensationFrames = this.microphone ? Math.round(clamp(this.microphone.compensationFrames, -this.historyFrames, this.sampleRate, 0)) : 0;
        this.stage = schedule.countInBeats > 0 ? 'count-in' : schedule.punchEnabled && startBeat < schedule.punchStart ? 'waiting' : 'recording';
        this.buffers = this.tracks.map(() => [new Float32Array(4096), new Float32Array(4096)]);
      }
      capture(inputs, n, timing) {
        const mic = inputs[TRACK_COUNT];
        if (this.active && this.microphone) this._captureMicrophone(inputs, n, timing);
        else {
          this._rememberMicrophone(mic, n);
          if (this.active) this._captureTracks(inputs, n, timing);
        }
      }
      clearMicrophoneHistory() { for (const channel of this.microphoneHistory) channel.fill(0); }
      _rememberMicrophone(input, n) {
        if (!input?.[0] && !input?.[1]) {
          // Preserve the rolling history and its signed compensation clock
          // without a sample loop when the browser has no microphone input.
          const at = this.microphoneClock % this.historyFrames;
          if (n >= this.historyFrames) this.clearMicrophoneHistory();
          else for (const channel of this.microphoneHistory) {
            channel.fill(0, at, Math.min(this.historyFrames, at + n));
            if (at + n > this.historyFrames) channel.fill(0, 0, at + n - this.historyFrames);
          }
          this.microphoneClock += n; return;
        }
        for (let f = 0; f < n; f++, this.microphoneClock++) {
          const at = this.microphoneClock % this.historyFrames, a = input?.[0]?.[f], b = (input?.[1] || input?.[0])?.[f];
          this.microphoneHistory[0][at] = Number.isFinite(a) ? a : 0; this.microphoneHistory[1][at] = Number.isFinite(b) ? b : 0;
        }
      }
      _appendMicrophone(a, b) {
        if (!this.active || this.frames >= this.maxFrames) return;
        const pair = this.buffers[0]; pair[0][this.used] = Number.isFinite(a) ? a : 0; pair[1][this.used] = Number.isFinite(b) ? b : 0;
        this.used++; this.frames++; if (this.used === 4096) this.flush();
        if (this.frames >= this.maxFrames) this._limit(this.microphoneEndReason || undefined);
      }
      _endMicrophone(clock, reason, stopId) {
        if (!Number.isFinite(this.microphoneEnd)) {
          this.microphoneEnd = clock + Math.max(0, this.compensationFrames); this.microphoneEndReason = reason;
          if (stopId !== undefined) this.stopId = stopId;
        }
        if (this.microphoneEnd <= this.microphoneClock) this._limit(this.microphoneEndReason);
        else this.stage = 'finishing';
      }
      _captureMicrophone(inputs, n, timing) {
        const input = inputs[this.microphone.inputIndex ?? TRACK_COUNT];
        for (let f = 0; f < n; f++, this.microphoneClock++) {
          const clock = this.microphoneClock, a = input?.[0]?.[f], b = (input?.[1] || input?.[0])?.[f], beat = timing?.timelineBeats?.[f] ?? this.startBeat;
          const counting = timing?.timelineCountIn?.[f], running = !this.schedule.requireTransport || !timing || timing.timelinePlaying?.[f];
          if (this.active && !this.started) {
            if (counting) this.stage = 'count-in';
            else if (this.schedule.punchEnabled && beat >= this.schedule.punchEnd - 1e-10) this._limit('punch');
            else if (!running || this.schedule.punchEnabled && beat < this.schedule.punchStart - 1e-10) this.stage = 'waiting';
            else {
              this.started = true; this.stage = 'recording'; this.startBeat = this.schedule.punchEnabled ? Math.max(this.schedule.punchStart, beat) : beat;
              this.microphoneStart = clock + this.compensationFrames;
              // Negative offsets read the rolling history at each logical
              // frame. Unavailable samples before the first capture are silent;
              // the actual attack remains in the resulting take.
            }
          }
          if (this.active && this.started) {
            if (!Number.isFinite(this.microphoneEnd) && this.schedule.punchEnabled && beat >= this.schedule.punchEnd - 1e-10) this._endMicrophone(clock, 'punch');
            else if (!Number.isFinite(this.microphoneEnd) && !running) this._endMicrophone(clock, 'stop');
            if (this.active && clock >= this.microphoneEnd) this._limit(this.microphoneEndReason);
            else if (this.active && clock >= this.microphoneStart) {
              if (this.compensationFrames < 0) {
                const previous = clock + this.compensationFrames, available = previous >= 0 && previous >= clock - this.historyFrames, at = (previous + this.historyFrames) % this.historyFrames;
                this._appendMicrophone(available ? this.microphoneHistory[0][at] : 0, available ? this.microphoneHistory[1][at] : 0);
              } else this._appendMicrophone(a, b);
            }
          }
          const at = clock % this.historyFrames;
          this.microphoneHistory[0][at] = Number.isFinite(a) ? a : 0; this.microphoneHistory[1][at] = Number.isFinite(b) ? b : 0;
        }
        if (this.active && this.started && this.microphoneClock >= this.microphoneEnd) this._limit(this.microphoneEndReason);
      }
      _captureTracks(inputs, n, timing) {
        if (!this.active) return;
        let at = 0;
        while (at < n && this.active) {
          const beat = timing?.timelineBeats?.[at] ?? this.startBeat;
          if (timing?.timelineCountIn?.[at]) { this.stage = 'count-in'; at++; continue; }
          if (this.schedule.punchEnabled && beat >= this.schedule.punchEnd - 1e-10) { this._limit('punch'); break; }
          if (timing && this.schedule.requireTransport && !timing.timelinePlaying?.[at]) { at++; continue; }
          if (this.schedule.punchEnabled && beat < this.schedule.punchStart - 1e-10) { this.stage = 'waiting'; at++; continue; }
          this.stage = 'recording';
          if (!this.started) { this.started = true; this.startBeat = this.schedule.punchEnabled ? Math.max(this.schedule.punchStart, beat) : beat; }
          let take = Math.min(n - at, 4096 - this.used, this.maxFrames - this.frames);
          if (timing && this.schedule.punchEnabled) {
            let last = at; while (last < at + take && timing.timelineBeats[last] < this.schedule.punchEnd - 1e-10 && (!this.schedule.requireTransport || timing.timelinePlaying[last])) last++;
            take = last - at;
          } else if (timing && this.schedule.requireTransport) {
            let last = at; while (last < at + take && timing.timelinePlaying[last] && !timing.timelineCountIn[last]) last++;
            take = last - at;
          }
          if (take < 1) { at++; continue; }
          for (let k = 0; k < this.tracks.length; k++) {
            const input = inputs[this.tracks[k]], pair = this.buffers[k];
            for (let f = 0; f < take; f++) {
              const a = input?.[0]?.[at + f] || 0, b = (input?.[1] || input?.[0])?.[at + f] || 0;
              pair[0][this.used + f] = Number.isFinite(a) ? a : 0; pair[1][this.used + f] = Number.isFinite(b) ? b : 0;
            }
          }
          this.used += take; this.frames += take; at += take;
          if (this.used === 4096) this.flush();
          if (this.frames >= this.maxFrames) this._limit();
        }
        if (this.active && this.schedule.punchEnabled && timing?.beat >= this.schedule.punchEnd - 1e-10 && !timing.countInRemaining) this._limit('punch');
      }
      _limit(reason) { this.flush(); this.active = false; this.stage = 'idle'; this.onLimit?.({ id: this.id, frames: this.frames, startBeat: this.startBeat, reason, ...(this.stopId === undefined ? {} : { stopId: this.stopId }) }); }
      flush() {
        if (!this.used) return;
        for (let k = 0; k < this.tracks.length; k++) this.onChunk({ id: this.id, trackIndex: this.tracks[k], startBeat: this.startBeat, left: this.buffers[k][0].slice(0, this.used), right: this.buffers[k][1].slice(0, this.used) });
        this.used = 0;
      }
      stop(stopId = 0) {
        if (this.active && this.microphone && this.started && this.compensationFrames > 0) {
          this.stopId = stopId; this._endMicrophone(this.microphoneClock, this.microphoneEndReason || 'stop', stopId);
          if (this.active) return { pending: true };
        }
        this.flush(); this.active = false; this.stage = 'idle'; return { id: this.id, frames: this.frames, startBeat: this.startBeat };
      }
      cancel() { this.active = false; this.stage = 'idle'; this.frames = 0; this.used = 0; this.buffers = []; }
    }
    return { Core, Recorder, TrackEQ, ServiceTiming: { geometry: serviceGeometry }, ClipPlayback: { compile: compileClip, read: readClip } };
  }

  const silenceMeters = beat => ({ beat: beat || 0, playing: false, ended: false, tracks: Array.from({ length: TRACK_COUNT }, () => ({ peak: 0, rms: 0, rmsLeft: 0, rmsRight: 0 })), returns: Array.from({ length: 2 }, () => ({ peak: 0, rms: 0, rmsLeft: 0, rmsRight: 0 })), returnEffects: Array.from({ length: 2 }, () => Array(4).fill(null)), masterEffects: Array(4).fill(null), master: { peak: 0, rms: 0, rmsLeft: 0, rmsRight: 0 } });
  const abortError = () => new DOMException('Export canceled.', 'AbortError');
  // Project files can contain many megabytes of PCM, bundled HTML, and native
  // instrument snapshots. None of those bytes belong in a realtime state update.
  function dspState(state) {
    const rack = owner => ({
      effects: Array.from({ length: /^track-(?:[1-9]|10)$/.test(owner?.id) ? 5 : 4 }, (_, slot) => { const effect = owner?.effects?.[slot]; return effect ? { type: effect.type, bypass: effect.bypass, params: { ...effect.params } } : null; }),
      automation: (owner?.automation || []).map(lane => ({ target: lane.target, effectType: lane.effectType, enabled: lane.enabled, interpolation: lane.interpolation, points: (lane.points || []).map(p => ({ beat: p.beat, value: p.value })) }))
    });
    return {
      lfos: (state.lfos || []).map(lfo => ({ ...lfo, routes: (lfo.routes || []).map(route => ({ ...route, ...(route.gate ? { gate: route.gate.map(point => ({ ...point })) } : {}) })) })),
      tempo: state.tempo, lengthBars: state.lengthBars, loopEnabled: state.loopEnabled, loopStart: state.loopStart, loopEnd: state.loopEnd,
      master: { id: 'master', name: state.master?.name, ...(state.master?.mastering ? { mastering: { ...state.master.mastering } } : {}), level: state.master?.level, metronome: state.master?.metronome, mute: state.master?.mute, ...rack(state.master) },
      returns: state.returns ? Array.from({ length: 2 }, (_, index) => { const bus = state.returns[index] || {}; return { id: 'return-' + (index + 1), name: bus.name, level: bus.level, pan: bus.pan, mute: bus.mute, solo: bus.solo, ...rack(bus) }; }) : undefined,
      buses: state.buses ? Array.from({ length: 2 }, (_, index) => { const bus = state.buses[index] || {}; return { id: 'bus-' + (index + 1), name: bus.name, level: bus.level, pan: bus.pan, mute: bus.mute, solo: bus.solo, ...rack(bus) }; }) : undefined,
      tracks: Array.from({ length: TRACK_COUNT }, (_, index) => {
        const track = state.tracks?.[index] || {};
        return { id: track.id || 'track-' + (index + 1), output: ['bus-1', 'bus-2'].includes(track.output) ? track.output : 'master', disabled: track.disabled === true, level: track.level ?? .8, pan: track.pan ?? 0, mute: track.mute === true, solo: track.solo === true, eq: { low: track.eq?.low ?? 0, lowMid: track.eq?.lowMid ?? 0, highMid: track.eq?.highMid ?? 0, high: track.eq?.high ?? 0, lowMidFreq: track.eq?.lowMidFreq ?? 400, highMidFreq: track.eq?.highMidFreq ?? 2500 }, sends: [track.sends?.[0] ?? 0, track.sends?.[1] ?? 0], sendPre: [track.sendPre?.[0] === true, track.sendPre?.[1] === true], instrumentLive: track.instrumentLive, notePlayback: (track.clips || []).some(clip => clip.type === 'notes'),
          ...(track.freeze ? { freeze: { version: track.freeze.version, sampleRate: track.freeze.sampleRate, tempo: track.freeze.tempo, lengthBeats: track.freeze.lengthBeats, bodyFrames: track.freeze.bodyFrames, totalFrames: track.freeze.totalFrames, tailFrames: track.freeze.tailFrames, fingerprint: track.freeze.fingerprint, chunks: (track.freeze.chunks || []).map(chunk => ({ startFrame: chunk.startFrame, frames: chunk.frames, main: chunk.main, sendA: chunk.sendA, sendB: chunk.sendB })) } } : {}),
          automation: (track.automation || []).map(lane => ({ target: lane.target, effectType: lane.effectType, enabled: lane.enabled, interpolation: lane.interpolation, points: (lane.points || []).map(p => ({ beat: p.beat, value: p.value })) })),
          effects: Array.from({ length: 5 }, (_, slot) => { const effect = track.effects?.[slot]; return effect ? { type: effect.type, bypass: effect.bypass, params: { ...effect.params } } : null; }),
          clips: (track.clips || []).map(clip => ({ assetId: clip.assetId, start: clip.start, length: clip.length, sourceStart: clip.sourceStart, sourceEnd: clip.sourceEnd,
            sourceOffset: clip.sourceOffset, rate: clip.rate, reverse: clip.reverse, loop: clip.loop, gain: clip.gain, fadeIn: clip.fadeIn, fadeOut: clip.fadeOut, ...(clip.freezeTailSource === true ? { freezeTailSource: true } : {}) })) };
      })
    };
  }
  function makeWavBuffer(frames, sampleRate) {
    const buffer = new ArrayBuffer(44 + frames * 4), view = new DataView(buffer);
    const write = (at, text) => { for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i)); };
    write(0, 'RIFF'); view.setUint32(4, 36 + frames * 4, true); write(8, 'WAVE'); write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, frames * 4, true);
    return { buffer, view };
  }
  function writePcm(view, frame, left, right) {
    let at = 44 + frame * 4;
    for (let i = 0; i < left.length; i++) {
      const l = left[i], r = right[i], a = Number.isFinite(l) ? Math.max(-1, Math.min(1, l)) : 0;
      view.setInt16(at, Math.round(a * (a < 0 ? 32768 : 32767)), true); at += 2;
      const b = Number.isFinite(r) ? Math.max(-1, Math.min(1, r)) : 0;
      view.setInt16(at, Math.round(b * (b < 0 ? 32768 : 32767)), true); at += 2;
    }
  }

  // Interface choices belong to this browser, never to a portable song.
  const AUDIO_SETTINGS_KEY = 'kitchen.galley.audio-interface.v1';
  const AUDIO_DEFAULTS = Object.freeze({ inputDeviceId: 'default', outputDeviceId: 'default', inputChannel: 'stereo', sampleRate: 'auto', latencyProfile: 'live' });
  const AUDIO_PROFILES = Object.freeze({ live: { latencyHint: .001, fallbackFrames: 256 }, balanced: { latencyHint: 'interactive', fallbackFrames: 512 }, stable: { latencyHint: 'balanced', fallbackFrames: 1024 } });
  function normalizeAudioSettings(value, previous = AUDIO_DEFAULTS, strict = false) {
    const settings = { ...previous }, fail = message => { if (strict) throw Error(message); };
    if (!value || typeof value !== 'object' || Array.isArray(value)) { fail('Choose valid audio interface settings.'); return settings; }
    for (const key of ['inputDeviceId', 'outputDeviceId']) if (value[key] !== undefined) {
      if (typeof value[key] === 'string' && value[key].length <= 512) settings[key] = value[key] || 'default';
      else fail('Choose a valid audio device.');
    }
    if (value.inputChannel !== undefined) {
      const channel = String(value.inputChannel); if (['1', '2', 'stereo'].includes(channel)) settings.inputChannel = channel;
      else fail('Choose Input 1, Input 2, or Stereo.');
    }
    if (value.sampleRate !== undefined) {
      const rate = value.sampleRate === 'auto' ? 'auto' : Number(value.sampleRate);
      if (rate === 'auto' || [44100, 48000, 96000].includes(rate)) settings.sampleRate = rate;
      else fail('Choose Auto, 44.1 kHz, 48 kHz, or 96 kHz.');
    }
    if (value.latencyProfile !== undefined) {
      if (Object.hasOwn(AUDIO_PROFILES, value.latencyProfile)) settings.latencyProfile = value.latencyProfile;
      else fail('Choose Live, Balanced, or Stable audio.');
    }
    return settings;
  }
  function readAudioSettings() {
    try { return normalizeAudioSettings(JSON.parse(window.localStorage?.getItem(AUDIO_SETTINGS_KEY) || 'null')); }
    catch { return { ...AUDIO_DEFAULTS }; }
  }
  function milliseconds(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10 ? value * 1000 : null; }

  class LoomAudio {
    constructor(state) {
      this._pedalMidiTake = null; this._pedalMidiEffect = null; this._pedalMidiListeners = new Set(); this._pedalMidiRequests = new Map(); this._pedalMidiRequestId = 0; this._pedalMidiOperation = 0; this._pedalMidiFrames = 0; this._pedalMidiNotifyFrame = 0;
      this._pedalMidiBufferLease = null; this._pedalMidiWarmup = null; this._fallbackAudioHandler = null;
      this.state = state; this.assets = new Map(); this._sentAssets = new Map(); this.context = null; this.node = null; this.core = null; this.mode = 'idle'; this.inputs = [];
      this._disabledTrackFlags = Array.from({ length: TRACK_COUNT }, (_, index) => state.tracks?.[index]?.disabled === true);
      this.generation = 0; this._transportEpoch = 0; this._transportEndedEpoch = -1; this._recordPreparing = false; this._panicLatched = false; this._playRequest = 0; this._recordRequest = 0; this._recordId = 0; this._recordStopId = 0; this._gateId = 0; this._gates = new Map();
      this.isRecording = false; this._chunks = new Map(); this._recordFrames = 0; this._meters = silenceMeters(0); this._recordStartBeat = 0; this._mic = null; this.microphoneInput = null; this._micRequest = 0; this._micEnabled = false; this._micTrack = -1; this._micPending = false; this._micPurpose = null; this._recordMicrophone = null;
      this._recordStage = 'idle'; this._recordTransportStarted = false;
      this._transportListeners = new Set(); this._clockAnchor = { beat: 0, time: 0, cycle: 0, countIn: 0 };
      this._serviceListeners = new Set(); this._serviceSeq = 0; this._serviceRuntime = { active: false, scene: null, performance: null }; this._serviceArrangementBeat = 0; this._serviceStops = new Map();
      this._clockConfiguration = Object.fromEntries(['tempo', 'lengthBars', 'loopEnabled', 'loopStart', 'loopEnd'].map(key => [key, state[key]]));
      this._audioSettings = readAudioSettings(); this._processingFrames = 0; this._exportCount = 0; this._audioApplying = false; this._deviceAccessPending = false; this._playPending = 0; this._initializing = false;
      this._sampleRateFallback = false; this._sinkFallback = false; this._devicePermission = 'unknown';
      this._diagnosticsConfig = { enabled: false, mode: 'light', revision: 0 }; this._diagnosticsGeneration = 0; this._diagnosticsSnapshot = null; this._diagnosticsReleased = true; this._masteringAnalysis = false;
      this._meterDetail = null;
      this._deviceChangeListener = () => this.onStatus?.({ type: 'audio-device-change', diagnostics: this.getAudioDiagnostics() });
      if (typeof navigator !== 'undefined') navigator.mediaDevices?.addEventListener?.('devicechange', this._deviceChangeListener);
    }
    setMasteringAnalysis(enabled) {
      const active = enabled === true;
      if (active === this._masteringAnalysis) return;
      this._masteringAnalysis = active; this._send({ type: 'masteringAnalysis', enabled: active });
    }
    resetMasteringMeters() { this._send({ type: 'resetMasteringMeters' }); }
    setMeterDetail(value) {
      const detail = value && typeof value.ownerId === 'string' && Number.isInteger(value.slot) && value.slot >= 0 && value.slot < 5 ? { ownerId: value.ownerId, slot: value.slot } : null;
      if (detail?.ownerId === this._meterDetail?.ownerId && detail?.slot === this._meterDetail?.slot) return;
      this._meterDetail = detail; this._send({ type: 'meterDetail', detail });
    }
    setDiagnostics(value = {}) {
      const previous = this._diagnosticsConfig, mode = ['light', 'balanced', 'deep'].includes(value.mode) ? value.mode : previous.mode;
      const enabled = typeof value.enabled === 'boolean' ? value.enabled : previous.enabled;
      const release = !enabled && value.release === true;
      if (enabled === previous.enabled && mode === previous.mode && (!release || this._diagnosticsReleased)) return this.getDiagnostics();
      this._diagnosticsConfig = { enabled, mode, revision: previous.revision + 1 };
      this._diagnosticsReleased = release;
      if (release) this._diagnosticsSnapshot = null;
      this._send({ type: 'diagnosticsConfig', config: { ...this._diagnosticsConfig, ...(release ? { release: true } : {}) } });
      return this.getDiagnostics();
    }
    resetDiagnostics() {
      this._diagnosticsConfig = { ...this._diagnosticsConfig, revision: this._diagnosticsConfig.revision + 1 }; this._diagnosticsSnapshot = null;
      this._send({ type: 'diagnosticsReset', revision: this._diagnosticsConfig.revision });
      return this.getDiagnostics();
    }
    getDiagnostics() {
      const config = this._diagnosticsConfig, snapshot = this._diagnosticsSnapshot;
      if (snapshot) return { ...snapshot, ...config, reportRevision: snapshot.revision, status: !config.enabled ? 'paused' : this.context?.state === 'suspended' ? 'suspended' : snapshot.status, contextState: this.context?.state || 'idle', engineMode: this.mode };
      return { ...config, reportRevision: null, status: !config.enabled ? 'idle' : !this.context ? 'waiting' : this.context.state === 'suspended' ? 'suspended' : 'collecting', contextState: this.context?.state || 'idle', engineMode: this.mode, available: false, clock: { name: 'unavailable', resolutionMs: null, coarse: false }, sampleRate: this.context?.sampleRate || 0, blockFrames: this._processingFrames || 0, budgetMs: this.context && this._processingFrames ? this._processingFrames * 1000 / this.context.sampleRate : 0, processedBlocks: 0, sampledBlocks: 0, sampledFrames: 0, coverage: 0, elapsedSeconds: 0, total: { samples: 0, meanMs: null, p95Ms: null, maxMs: null, meanPercent: null, p95Percent: null, maxPercent: null, overBudget: 0, zeroSamples: 0 }, rows: [], timerReads: 0, invalidTimings: 0 };
    }
    _trackIndex(id) { const i = typeof id === 'number' ? Math.floor(id) : this.state.tracks.findIndex(t => t.id === id); if (!Number.isInteger(i) || i < 0 || i >= TRACK_COUNT) throw Error('Choose one of the ten tracks.'); return i; }
    _assertTrackEnabled(index) { if (this.state.tracks[index]?.disabled === true) throw Error('Enable the track before using its instrument, recording or microphone.'); return index; }
    get audioSettings() { return this.getAudioSettings(); }
    get audioStatus() { return this.getAudioDiagnostics(); }
    getAudioSettings() { return { ...this._audioSettings }; }
    _outputSelectionSupported() { const AC = window.AudioContext || window.webkitAudioContext; return typeof this.context?.setSinkId === 'function' || typeof AC?.prototype?.setSinkId === 'function'; }
    validateAudioSettings(value) {
      const settings = normalizeAudioSettings(value, this._audioSettings, true);
      if (settings.outputDeviceId !== 'default' && !this._outputSelectionSupported()) throw Error('This browser uses the system output. Choose Default output, or select the interface in your system audio settings.');
      return settings;
    }
    _assertAudioSettingsIdle() {
      if (this._pedalMidiTake?.capturing || this._pedalMidiWarmup) throw Error('Stop MIDI capture before changing the audio interface.');
      if (this.recordingBusy) throw Error('Finish the current take before changing the audio interface.');
      if (this._meters.playing || this._playPending) throw Error('Stop playback before changing the audio interface.');
      if (this._exportCount) throw Error('Finish the audio export before changing the audio interface.');
      if (this._audioApplying || this._deviceAccessPending || this._initializing || this._closingAudioGraph) throw Error('Wait for the current audio operation before changing the interface.');
    }
    _createAudioContext(settings) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) throw Error('This browser does not support Web Audio.');
      const frozenRate = this._frozenSampleRate(), requestedRate = frozenRate || settings.sampleRate;
      const options = { latencyHint: AUDIO_PROFILES[settings.latencyProfile].latencyHint, ...(requestedRate !== 'auto' ? { sampleRate: requestedRate } : {}) };
      let context;
      try { context = new AC(options); }
      catch (firstError) {
        // Some browsers accept only named hints or cannot run the requested rate.
        try { context = new AC({ ...options, latencyHint: settings.latencyProfile === 'stable' ? 'balanced' : 'interactive' }); }
        catch { context = new AC({ latencyHint: settings.latencyProfile === 'stable' ? 'balanced' : 'interactive' }); }
      }
      if (frozenRate && context.sampleRate !== frozenRate) { context.close().catch(() => {}); throw Error('This audio interface cannot use the frozen tracks’ sample rate. Unfreeze those tracks before changing the sample rate.'); }
      return context;
    }
    _frozenSampleRate(state = this.state) {
      const rates = [...new Set((state.tracks || []).map(track => track.freeze?.sampleRate).filter(Number.isFinite))];
      if (rates.length > 1) throw Error('Frozen tracks use different sample rates. Unfreeze them before playing or exporting.');
      return rates[0] || null;
    }
    async _setAudioSink(context, deviceId, strict = false) {
      if (typeof context?.setSinkId !== 'function') { if (deviceId !== 'default' && strict) throw Error('This browser uses the system output. Choose Default output.'); return deviceId !== 'default'; }
      try { await context.setSinkId(deviceId === 'default' ? '' : deviceId); return false; }
      catch (error) {
        if (strict) throw Error('Could not open the selected output. Check that the interface is connected and allowed, then refresh devices. ' + (error.message || ''));
        // A saved USB output may be disconnected on the next visit. Stay usable.
        try { await context.setSinkId(''); } catch {}
        return deviceId !== 'default';
      }
    }
    async enumerateAudioDevices(options = {}) {
      const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : null;
      if (!media?.enumerateDevices) return { inputs: [], outputs: [], outputSelectionSupported: this._outputSelectionSupported(), permission: 'unavailable', supportedConstraints: {} };
      let permissionStream;
      if (options.requestPermission === true && !this._mic) {
        this._assertAudioSettingsIdle(); this._deviceAccessPending = true;
        try { permissionStream = await media.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false }); this._devicePermission = 'granted'; }
        finally { permissionStream?.getTracks().forEach(track => track.stop()); this._deviceAccessPending = false; }
      }
      const devices = await media.enumerateDevices(), inputs = [], outputs = [];
      for (const device of devices) if (device.kind === 'audioinput' || device.kind === 'audiooutput') (device.kind === 'audioinput' ? inputs : outputs).push({ deviceId: device.deviceId || 'default', label: device.label || '', groupId: device.groupId || '' });
      if (this._mic || inputs.some(device => device.label)) this._devicePermission = 'granted';
      return { inputs, outputs, outputSelectionSupported: this._outputSelectionSupported(), permission: this._devicePermission, supportedConstraints: media.getSupportedConstraints?.() || {} };
    }
    async applyAudioSettings(value, options = {}) {
      const settings = this.validateAudioSettings(value); this._assertAudioSettingsIdle();
      const old = this.getAudioSettings(), changed = Object.keys(old).some(key => old[key] !== settings[key]), restart = Boolean(this.context && (old.sampleRate !== settings.sampleRate || old.latencyProfile !== settings.latencyProfile));
      if (this._frozenSampleRate() && old.sampleRate !== settings.sampleRate) throw Error('Unfreeze tracks before changing the audio sample rate.');
      if (!changed) return { restarted: false, monitorTrackId: null, settings: old, diagnostics: this.getAudioDiagnostics() };
      this._audioApplying = true; let candidate, monitorTrackId = this._micEnabled ? this.state.tracks[this._micTrack]?.id || null : null;
      const beat = this.getTransport().beat;
      try {
        if (restart || !this.context) { candidate = this._createAudioContext(settings); await this._setAudioSink(candidate, settings.outputDeviceId, true); }
        else if (old.outputDeviceId !== settings.outputDeviceId) await this._setAudioSink(this.context, settings.outputDeviceId, true);
        // Sink selection can reject. Instruments remain attached until it succeeds.
        if (restart) await options.beforeRestart?.();
        this._disableMicrophoneMonitoring(true, true);
        if (restart) {
          await this._closeAudioGraph(); this.generation++; this._playRequest++; this._recordRequest++;
          this._meters = silenceMeters(beat); this._clockAnchor = { beat, time: 0, cycle: 0, countIn: 0 };
        }
        this._audioSettings = settings; this._sampleRateFallback = false; this._sinkFallback = false;
        if (candidate) { this._preparedContext = candidate; candidate = null; await this.init({ _audioSettings: true }); }
        try { window.localStorage?.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings)); } catch {}
        const result = { restarted: restart, monitorTrackId, settings: this.getAudioSettings(), diagnostics: this.getAudioDiagnostics() };
        this.onStatus?.({ type: 'audio-settings-changed', ...result }); return result;
      } catch (error) {
        if (candidate) await candidate.close().catch(() => {});
        this._audioSettings = old;
        if (!this.context && restart) { try { await this.init({ _audioSettings: true }); this.seek(beat); } catch {} }
        throw error;
      } finally { this._audioApplying = false; }
    }
    getAudioDiagnostics() {
      const context = this.context, capture = this._mic?.stream.getAudioTracks?.()[0], actual = capture?.getSettings?.() || {}, settings = this.getAudioSettings();
      const baseLatencyMs = milliseconds(context?.baseLatency), outputLatencyMs = milliseconds(context?.outputLatency), captureLatencyMs = milliseconds(actual.latency);
      const processingFrames = context ? this._processingFrames || (this.mode === 'fallback' ? this.node?.bufferSize || AUDIO_PROFILES[settings.latencyProfile].fallbackFrames : this.mode === 'worklet' ? 128 : 0) : 0;
      const processingMs = context ? processingFrames / context.sampleRate * 1000 : null;
      // Reported base latency can already include a render quantum. Keep block
      // duration separate rather than counting it twice in this rough estimate.
      const known = [captureLatencyMs, baseLatencyMs, outputLatencyMs].filter(value => value !== null);
      return { settings, active: Boolean(context), mode: this.mode, sampleRate: context?.sampleRate || null, requestedSampleRate: settings.sampleRate, requestedLatencyHint: AUDIO_PROFILES[settings.latencyProfile].latencyHint,
        processingFrames, processingMs, baseLatencyMs, outputLatencyMs, captureLatencyMs, estimatedRoundTripMs: context && known.length ? known.reduce((total, value) => total + value, 0) : null,
        roundTripComplete: Boolean(this._mic && captureLatencyMs !== null && baseLatencyMs !== null && outputLatencyMs !== null), inputChannels: Number.isInteger(actual.channelCount) ? actual.channelCount : null,
        actualInputChannel: this._mic ? this._mic.inputChannel : null, inputLabel: capture?.label || '', inputDeviceId: actual.deviceId || null, captureSampleRate: actual.sampleRate || null,
        echoCancellation: actual.echoCancellation ?? null, noiseSuppression: actual.noiseSuppression ?? null, autoGainControl: actual.autoGainControl ?? null,
        outputDeviceId: typeof context?.sinkId === 'string' ? context.sinkId || 'default' : null, outputSelectionSupported: this._outputSelectionSupported(), sampleRateFallback: this._sampleRateFallback, sinkFallback: this._sinkFallback,
        applying: this._audioApplying, deviceAccessPending: this._deviceAccessPending, exportBusy: this._exportCount > 0, monitoring: this._micEnabled, inputPeak: this._meters.microphonePeak || 0 };
    }
    async init(options = {}) {
      if (this._audioApplying && options._audioSettings !== true || this._closingAudioGraph) throw Error('Finish setting up the audio interface before opening audio.');
      if (this._init) return this._init;
      this._init = (async () => {
        if (!window.createLoomEffectsDSP) throw Error('GALLEY effects have not loaded.');
        this._initializing = true;
        const prepared = Boolean(this._preparedContext);
        this.context = this._preparedContext || this._createAudioContext(this._audioSettings); this._preparedContext = null;
        this._sampleRateFallback = this._audioSettings.sampleRate !== 'auto' && this.context.sampleRate !== this._audioSettings.sampleRate;
        this._sinkFallback = prepared ? false : await this._setAudioSink(this.context, this._audioSettings.outputDeviceId);
        this.node = null; this.core = null; this._sentAssets = new Map();
        this._diagnosticsGeneration++; this._diagnosticsSnapshot = null;
        this.inputs = Array.from({ length: TRACK_COUNT }, () => { const node = this.context.createGain(); node.channelCount = 2; node.channelCountMode = 'explicit'; node.channelInterpretation = 'speakers'; return node; });
        this.microphoneInput = this.context.createGain(); this.microphoneInput.channelCount = 2; this.microphoneInput.channelCountMode = 'explicit'; this.microphoneInput.channelInterpretation = 'speakers';
        const DSP = createLoomEngineDSP(window.createLoomEffectsDSP, window.createLoomLFODSP, window.createLoomCPUProfiler, window.createLoomTrackEQDSP, window.createLoomMasteringDSP);
        if (this.context.audioWorklet && window.AudioWorkletNode) {
          let url;
          try {
            const source = `
              const createVocal=${window.createLoomVocalDSP ? window.createLoomVocalDSP.toString() : 'null'};
              const createUtility=${window.createLoomUtilityDSP ? window.createLoomUtilityDSP.toString() : 'null'};
              const createFilter=${window.createLoomFilterDSP ? window.createLoomFilterDSP.toString() : 'null'};
              const createCreative=${window.createLoomCreativeDSP ? window.createLoomCreativeDSP.toString() : 'null'};
              const createBroilerPedals=${window.createLoomBroilerPedalsDSP ? window.createLoomBroilerPedalsDSP.toString() : 'null'};
              const createCompressor=${window.createLoomCompressorDSP ? window.createLoomCompressorDSP.toString() : 'null'};
              const createPreamp=${window.createLoomPreampDSP ? window.createLoomPreampDSP.toString() : 'null'};
              const createTape=${window.createLoomTapeDSP ? window.createLoomTapeDSP.toString() : 'null'};
              const createChar=${window.createLoomCharDSP ? window.createLoomCharDSP.toString() : 'null'};
              const createLoFi=${window.createLoomLoFiDSP ? window.createLoomLoFiDSP.toString() : 'null'};
              const createPedalTracker=${window.createLoomPedalTrackerDSP ? window.createLoomPedalTrackerDSP.toString() : 'null'};
              const createPedalSynth=${window.createLoomPedalSynthDSP ? window.createLoomPedalSynthDSP.toString() : 'null'};
              const createPedalMidi=${window.createLoomPedalMidiDSP ? window.createLoomPedalMidiDSP.toString() : 'null'};
              const createDeluxe=${window.createLoomDeluxeDSP ? window.createLoomDeluxeDSP.toString() : 'null'};
              const createSVT=${window.createLoomSVTDSP ? window.createLoomSVTDSP.toString() : 'null'};
              const createGuitarPedals=${window.createLoomGuitarPedalsDSP ? window.createLoomGuitarPedalsDSP.toString() : 'null'};
              const createHood=${window.createLoomHoodDSP ? window.createLoomHoodDSP.toString() : 'null'};
              const createCabinet=${window.createLoomCabinetDSP ? window.createLoomCabinetDSP.toString() : 'null'};
              const createEffects=${window.createLoomEffectsDSP.toString()};
              const createLFO=${window.createLoomLFODSP ? window.createLoomLFODSP.toString() : 'null'};
              const createCPU=${window.createLoomCPUProfiler ? window.createLoomCPUProfiler.toString() : 'null'};
              const createEQ=${window.createLoomTrackEQDSP ? window.createLoomTrackEQDSP.toString() : 'null'};
              const createMastering=${window.createLoomMasteringDSP ? window.createLoomMasteringDSP.toString() : 'null'};
              const createEngine=${createLoomEngineDSP.toString()};
              const DSP=createEngine(()=>createEffects(createVocal,createUtility,createFilter,createCreative,createBroilerPedals,createCompressor,createPreamp,createTape,createChar,createLoFi,createPedalSynth,createPedalTracker,createDeluxe,createPedalMidi,createSVT,createGuitarPedals,createHood,createCabinet),createLFO,createCPU,createEQ,createMastering);
              class LoomProcessor extends AudioWorkletProcessor {
                constructor(options) {
                  super();this.core=new DSP.Core(options.processorOptions.state,{},sampleRate,{includeMetronome:true});this.count=0;this.endedSent=false;this.epoch=options.processorOptions.epoch||0;
                  this.diagnosticsGeneration=options.processorOptions.diagnosticsGeneration||0;this.core.setDiagnostics(options.processorOptions.diagnostics||{enabled:false});this.core.setMasteringAnalysis(options.processorOptions.masteringAnalysis===true);this.core.setMeterDetail(options.processorOptions.meterDetail||null);
                  this.recorder=new DSP.Recorder(sampleRate,m=>this.port.postMessage({type:'chunk',...m},[m.left.buffer,m.right.buffer]),m=>this.port.postMessage({type:m.stopId===undefined?'limit':'recordStopped',...m}));
                  this.port.onmessage=e=>{
                    const m=e.data,serviceFrame=m.type==='serviceStart'?0:this.core.sampleClock;if(Number.isInteger(m.epoch))this.epoch=m.epoch;
                    if(m.type==='pedalMidiStart'||m.type==='pedalMidiStop'){
                      try{if(m.type==='pedalMidiStart')this.core.startPedalMidi(m.settings);else if(!this.core.pedalMidi||this.core.pedalMidi.token===m.token)this.core.stopPedalMidi(m.reason);for(const batch of this.core.drainPedalMidi())this.port.postMessage({type:'pedalMidi',batch});this.port.postMessage({type:'pedalMidiAck',requestId:m.requestId});}
                      catch(error){this.port.postMessage({type:'pedalMidiAck',requestId:m.requestId,error:error.message});}return;
                    }
                    if(m.type==='diagnosticsConfig')this.core.setDiagnostics(m.config);
                    else if(m.type==='meterDetail')this.core.setMeterDetail(m.detail);
                    else if(m.type==='masteringAnalysis')this.core.setMasteringAnalysis(m.enabled);
                    else if(m.type==='resetMasteringMeters'){this.core.resetMasteringMeters();this.port.postMessage({type:'meters',epoch:this.epoch,contextTime:currentTime,meters:this.core.getMeters()});}
                    else if(m.type==='diagnosticsReset')this.core.resetDiagnostics(m.revision);
                    else if(m.type==='state')this.core.setState(m.state);
                    else if(m.type==='assets')this.core.setAssets(m.assets);
                    else if(m.type==='assetDelta')this.core.updateAssets(m.additions,m.removals);
                    else if(m.type==='play')this.core.start(m.beat);
                    else if(m.type==='stop')this.core.stop();
                    else if(m.type==='seek')this.core.seek(m.beat);
                    else if(m.type==='serviceStart')this.core.startService(m.scene,m.beat,m.seq,m.performance);
                    else if(m.type==='serviceScene')this.core.queueService('scene',m.scene,m.quantize,m.seq);
                    else if(m.type==='servicePerformance')this.core.queueService('performance',m.performance,m.quantize,m.seq);
                    else if(m.type==='serviceStop')this.core.stopService(m.seq);
                    else if(m.type==='recordHold')this.core.setRecordingHold(m.value);
                    else if(m.type==='audition')this.core.resumeAudition(m.track);
                    else if(m.type==='clearAudition')this.core.clearAudition(m.track);
                    else if(m.type==='microphoneMonitor')this.core.setMicrophoneMonitor(m.track,m.enabled);
                    else if(m.type==='microphoneReset')this.recorder.clearMicrophoneHistory();
                    else if(m.type==='resetEffectMeters'){this.core.resetEffectMeters(m.ownerId??m.track,m.slot);this.port.postMessage({type:'meters',epoch:this.epoch,contextTime:currentTime,meters:this.core.getMeters()});}
                    else if(m.type==='microphoneEnded'){this.core.setMicrophoneMonitor(-1,false);if(this.recorder.active&&this.recorder.microphone)this.recorder._limit('device');}
                    else if(m.type==='panic'){this.core.panic();this.recorder.cancel();}
                    else if(m.type==='recordStart'){
                      this.core.beginRecording(m.schedule);
                      this.recorder.start(m.id,m.tracks,this.core.beat,m.maxFrames,m.schedule);
                      this.port.postMessage({type:'recordStarted',id:m.id,startBeat:this.core.beat});
                    }
                    else if(m.type==='recordStop'){const meta=this.recorder.stop(m.stopId);this.core.endRecording();if(!meta.pending)this.port.postMessage({type:'recordStopped',...meta,stopId:m.stopId});}
                    else if(m.type==='recordCancel'){this.recorder.cancel();this.core.endRecording();}
                    else if(m.type==='gate'){this.core.setRecordOnly(m.track,m.value);this.port.postMessage({type:'gateAck',id:m.id});}
                    if(this.core.serviceEvents.length)for(const event of this.core.drainServiceEvents(currentTime,serviceFrame))this.port.postMessage({type:'serviceEvent',event});
                    if(this.core.pedalMidi||this.core.pedalMidiBatches.length)for(const batch of this.core.drainPedalMidi())this.port.postMessage({type:'pedalMidi',batch});
                    if(Number.isInteger(m.epoch))this.port.postMessage({type:'clock',epoch:this.epoch,contextTime:currentTime,meters:this.core.getMeters()});
                  };
                }
                process(inputs,outputs) {
                  const out=outputs[0];if(!out||!out[0])return true;const n=out[0].length;
                  // The normal audio callback does not enter profiling helpers.
                  // Keep transport, capture and meter timing identical in both paths.
                  if(!this.core.cpuProfiler?.enabled){
                    const serviceFrame=this.core.sampleClock;this.core.renderRealtime(out[0],out[1]||out[0],inputs);
                    if(this.core.serviceEvents.length)for(const event of this.core.drainServiceEvents(currentTime,serviceFrame))this.port.postMessage({type:'serviceEvent',event});
                    if((this.core.pedalMidi&&this.count%8===0)||this.core.pedalMidiBatches.length)for(const batch of this.core.drainPedalMidi())this.port.postMessage({type:'pedalMidi',batch});
                    if(this.core.countInEnded&&this.recorder.active)this.port.postMessage({type:'countInEnd',id:this.recorder.id,startBeat:this.recorder.startBeat});
                    this.recorder.capture(inputs,n,this.core);
                    if(this.core.ended&&!this.endedSent){this.endedSent=true;this.port.postMessage({type:'transportEnded',epoch:this.epoch,contextTime:currentTime+n/sampleRate,meters:this.core.getMeters()});}
                    else if(!this.core.ended)this.endedSent=false;
                    if(++this.count%8===0)this.port.postMessage({type:'meters',epoch:this.epoch,contextTime:currentTime+n/sampleRate,meters:this.core.getMeters(),recordFrames:this.recorder.frames,recordId:this.recorder.id,recording:this.recorder.active,recordStage:this.recorder.stage});
                    return true;
                  }
                  const profiling=this.core.beginDiagnostics(n);
                  try {
                  const serviceFrame=this.core.sampleClock;this.core.renderRealtime(out[0],out[1]||out[0],inputs);
                  const eventsStamp=this.core.diagnosticsStart('events');
                  if(this.core.serviceEvents.length)for(const event of this.core.drainServiceEvents(currentTime,serviceFrame))this.port.postMessage({type:'serviceEvent',event});
                    if((this.core.pedalMidi&&this.count%8===0)||this.core.pedalMidiBatches.length)for(const batch of this.core.drainPedalMidi())this.port.postMessage({type:'pedalMidi',batch});
                  if(this.core.countInEnded&&this.recorder.active)this.port.postMessage({type:'countInEnd',id:this.recorder.id,startBeat:this.recorder.startBeat});
                  this.core.diagnosticsEnd('events',eventsStamp);
                  const recorderStamp=this.core.diagnosticsStart('recorder');this.recorder.capture(inputs,n,this.core);this.core.diagnosticsEnd('recorder',recorderStamp);
                  const endedStamp=this.core.diagnosticsStart('events');
                  if(this.core.ended&&!this.endedSent){this.endedSent=true;this.port.postMessage({type:'transportEnded',epoch:this.epoch,contextTime:currentTime+n/sampleRate,meters:this.core.getMeters()});}
                  else if(!this.core.ended)this.endedSent=false;
                  this.core.diagnosticsEnd('events',endedStamp);
                  const metersStamp=this.core.diagnosticsStart('meters');
                  if(++this.count%8===0)this.port.postMessage({type:'meters',epoch:this.epoch,contextTime:currentTime+n/sampleRate,meters:this.core.getMeters(),recordFrames:this.recorder.frames,recordId:this.recorder.id,recording:this.recorder.active,recordStage:this.recorder.stage});
                  this.core.diagnosticsEnd('meters',metersStamp);
                  if(profiling&&this.core.diagnosticsReportDue()){const stamp=this.core.diagnosticsStart('report');this.port.postMessage({type:'diagnostics',generation:this.diagnosticsGeneration,report:this.core.getDiagnostics()});this.core.diagnosticsEnd('report',stamp);}
                  } finally {if(profiling)this.core.endDiagnostics();}
                  return true;
                }
              }
              registerProcessor('loom-eight-track',LoomProcessor);`;
            url = URL.createObjectURL(new Blob([source], { type: 'application/javascript' })); await this.context.audioWorklet.addModule(url);
            this.node = new AudioWorkletNode(this.context, 'loom-eight-track', { numberOfInputs: INPUT_COUNT, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', processorOptions: { state: dspState(this.state), epoch: this._transportEpoch, diagnostics: this._diagnosticsConfig, diagnosticsGeneration: this._diagnosticsGeneration, masteringAnalysis: this._masteringAnalysis, meterDetail: this._meterDetail } });
            this.node.port.onmessage = e => this._message(e.data);
            for (let i = 0; i < TRACK_COUNT; i++) this.inputs[i].connect(this.node, 0, i);
            this.microphoneInput.connect(this.node, 0, TRACK_COUNT);
            this.mode = 'worklet';
            this._processingFrames = 128;
          } catch (error) { for (const input of [...this.inputs, this.microphoneInput]) input.disconnect(); this.node = null; this.workletError = error.message; }
          finally { if (url) URL.revokeObjectURL(url); }
        }
        if (!this.node) {
          this.core = new DSP.Core(dspState(this.state), this.assets, this.context.sampleRate, { includeMetronome: true });
          this.core.setDiagnostics(this._diagnosticsConfig);
          this.core.setMasteringAnalysis(this._masteringAnalysis);
          this.core.setMeterDetail(this._meterDetail);
          this.recorder = new DSP.Recorder(this.context.sampleRate, m => this._message({ type: 'chunk', ...m }), m => this._message({ type: m.stopId === undefined ? 'limit' : 'recordStopped', ...m }));
          this.node = this.context.createScriptProcessor(AUDIO_PROFILES[this._audioSettings.latencyProfile].fallbackFrames, INPUT_COUNT * 2, 2);
          this._processingFrames = this.node.bufferSize || AUDIO_PROFILES[this._audioSettings.latencyProfile].fallbackFrames;
          this.merger = this.context.createChannelMerger(INPUT_COUNT * 2); this.splitters = [];
          for (let i = 0; i < INPUT_COUNT; i++) { const splitter = this.context.createChannelSplitter(2); (i < TRACK_COUNT ? this.inputs[i] : this.microphoneInput).connect(splitter); splitter.connect(this.merger, 0, i * 2); splitter.connect(this.merger, 1, i * 2 + 1); this.splitters.push(splitter); }
          this.merger.connect(this.node);
          const fallbackHandler = e => {
            if (!this.core.cpuProfiler?.enabled) {
              const inputs = Array.from({ length: INPUT_COUNT }, (_, i) => [e.inputBuffer.getChannelData(i * 2), e.inputBuffer.getChannelData(i * 2 + 1)]);
              const serviceFrame = this.core.sampleClock;
              this.core.renderRealtime(e.outputBuffer.getChannelData(0), e.outputBuffer.getChannelData(1), inputs);
              if (this.core.serviceEvents.length) for (const event of this.core.drainServiceEvents(Number.isFinite(e.playbackTime) ? e.playbackTime : this.context.currentTime, serviceFrame)) this._message({ type: 'serviceEvent', event });
              if (this.core.countInEnded && this.recorder.active) this._message({ type: 'countInEnd', id: this.recorder.id, startBeat: this.recorder.startBeat });
              this.recorder.capture(inputs, e.outputBuffer.length, this.core); this._flushPedalMidi();
              this._recordStage = this.recorder.active ? this.recorder.stage : 'idle';
              this._acceptMeters(this.core.getMeters(), this._transportEpoch, Number.isFinite(e.playbackTime) ? e.playbackTime + e.outputBuffer.length / this.context.sampleRate : this.context.currentTime);
              return;
            }
            const profiling = this.core.beginDiagnostics(e.outputBuffer.length);
            try {
            const inputs = Array.from({ length: INPUT_COUNT }, (_, i) => [e.inputBuffer.getChannelData(i * 2), e.inputBuffer.getChannelData(i * 2 + 1)]);
            const serviceFrame = this.core.sampleClock;
            this.core.renderRealtime(e.outputBuffer.getChannelData(0), e.outputBuffer.getChannelData(1), inputs);
            const eventsStamp = this.core.diagnosticsStart('events');
            if (this.core.serviceEvents.length) for (const event of this.core.drainServiceEvents(Number.isFinite(e.playbackTime) ? e.playbackTime : this.context.currentTime, serviceFrame)) this._message({ type: 'serviceEvent', event });
            if (this.core.countInEnded && this.recorder.active) this._message({ type: 'countInEnd', id: this.recorder.id, startBeat: this.recorder.startBeat });
            this.core.diagnosticsEnd('events', eventsStamp);
            const recorderStamp = this.core.diagnosticsStart('recorder');
            this.recorder.capture(inputs, e.outputBuffer.length, this.core); this._flushPedalMidi();
            this.core.diagnosticsEnd('recorder', recorderStamp);
            this._recordStage = this.recorder.active ? this.recorder.stage : 'idle';
            const metersStamp = this.core.diagnosticsStart('meters');
            this._acceptMeters(this.core.getMeters(), this._transportEpoch, Number.isFinite(e.playbackTime) ? e.playbackTime + e.outputBuffer.length / this.context.sampleRate : this.context.currentTime);
            this.core.diagnosticsEnd('meters', metersStamp);
            if (profiling && this.core.diagnosticsReportDue()) { const stamp = this.core.diagnosticsStart('report'); this._message({ type: 'diagnostics', generation: this._diagnosticsGeneration, report: this.core.getDiagnostics() }); this.core.diagnosticsEnd('report', stamp); }
            } finally { if (profiling) this.core.endDiagnostics(); }
          };
          this._fallbackAudioHandler = fallbackHandler;
          this.node.onaudioprocess = this._pedalMidiFallbackHandler(this.node);
          this.mode = 'fallback';
        }
        this.node.connect(this.context.destination); this._send({ type: 'state', state: dspState(this.state) }); this._send({ type: 'seek', beat: this._meters.beat }); this._updateRecordHold(); this._syncAssets(); if (this._panicLatched) this._send({ type: 'panic' });
        this._initializing = false; this.onStatus?.({ type: 'ready', mode: this.mode, sampleRate: this.context.sampleRate, diagnostics: this.getAudioDiagnostics() });
        return this.context;
      })().catch(error => { this._initializing = false; this._init = null; if (this.context) this.context.close().catch(() => {}); this.context = null; this.node = null; this.core = null; this.mode = 'idle'; this.inputs = []; this.microphoneInput = null; throw error; });
      return this._init;
    }
    getTrackInput(id) { if (this._audioApplying) throw Error('Finish setting up the audio interface before opening an instrument.'); if (!this.inputs.length) throw Error('Initialize GALLEY audio before opening an instrument.'); return this.inputs[this._trackIndex(id)]; }
    _pedalMidiFallbackHandler(node) {
      const context = this.context, core = this.core, handler = this._fallbackAudioHandler;
      return event => { if (node === this.node && context === this.context && core === this.core) handler(event); };
    }
    _swapPedalMidiFallback(frames) {
      const previous = this.node, node = this.context.createScriptProcessor(frames, INPUT_COUNT * 2, 2), previousHandler = previous.onaudioprocess;
      node.onaudioprocess = this._pedalMidiFallbackHandler(node);
      try {
        this.merger.connect(node); node.connect(this.context.destination);
        previous.onaudioprocess = null; this.merger.disconnect(previous); previous.disconnect();
        this.node = node; this._processingFrames = node.bufferSize || frames;
      } catch (error) {
        node.onaudioprocess = null; try { this.merger.disconnect(node); node.disconnect(); } catch {}
        this.node = previous; previous.onaudioprocess = previousHandler; this._processingFrames = previous.bufferSize;
        try { this.merger.connect(previous); previous.connect(this.context.destination); } catch {}
        throw error;
      }
      return node;
    }
    _cancelPedalMidiWarmup() { this._pedalMidiWarmup?.cancel(); }
    async _preparePedalMidiFallback(operation) {
      if (this.mode !== 'fallback' || !this.merger || !this._fallbackAudioHandler || !this.context?.createScriptProcessor) return;
      const prior = this._pedalMidiBufferLease, previousFrames = prior?.node === this.node ? prior.previousFrames : this.node.bufferSize;
      if (!prior && previousFrames >= 1024) return;
      this._cancelPedalMidiWarmup();
      const lease = { operation, context: this.context, core: this.core, previousFrames, node: this.node };
      if (this.node.bufferSize < 1024) lease.node = this._swapPedalMidiFallback(1024);
      this._pedalMidiBufferLease = lease;
      await new Promise((resolve, reject) => {
        let remaining = 2, settled = false;
        const handler = this._pedalMidiFallbackHandler(lease.node);
        const finish = error => {
          if (settled) return; settled = true; clearTimeout(timer);
          if (this._pedalMidiWarmup?.lease === lease) this._pedalMidiWarmup = null;
          if (this.node === lease.node && this.context === lease.context && this.core === lease.core) lease.node.onaudioprocess = handler;
          if (error) reject(error); else resolve();
        };
        const timer = setTimeout(() => finish(Error('Audio capture did not become ready. Resume audio and try again.')), 2000);
        this._pedalMidiWarmup = { lease, cancel: () => finish(abortError()) };
        lease.node.onaudioprocess = event => {
          if (this.node !== lease.node || this.context !== lease.context || this.core !== lease.core || this._pedalMidiBufferLease !== lease) return;
          handler(event); if (--remaining === 0) finish();
        };
      });
    }
    _restorePedalMidiFallback(lease = this._pedalMidiBufferLease) {
      if (!lease || this._pedalMidiBufferLease !== lease) return;
      if (this._pedalMidiWarmup?.lease === lease) this._cancelPedalMidiWarmup();
      if (!this._closingAudioGraph && this.mode === 'fallback' && this.context === lease.context && this.core === lease.core && this.node === lease.node && this.context.state !== 'closed') this._swapPedalMidiFallback(lease.previousFrames);
      this._pedalMidiBufferLease = null;
    }
    _queuePedalMidiRestore() {
      const lease = this._pedalMidiBufferLease;
      if (lease) Promise.resolve().then(() => { try { this._restorePedalMidiFallback(lease); } catch (error) { this.onStatus?.({ type: 'error', message: error.message }); } });
    }
    _pedalMidiOwner(state, id) { return id === 'master' ? state.master : state.tracks.find(track => track.id === id) || state.returns?.find(bus => bus.id === id) || state.buses?.find(bus => bus.id === id); }
    getPedalMidiTake() { return this._pedalMidiTake ? { ...this._pedalMidiTake, notes: this._pedalMidiTake.notes.map(note => ({ ...note })) } : null; }
    subscribePedalMidi(listener) { if (typeof listener !== 'function') throw TypeError('Provide a MIDI capture listener.'); this._pedalMidiListeners.add(listener); return () => this._pedalMidiListeners.delete(listener); }
    _notifyPedalMidi() { if (!this._pedalMidiListeners.size) return; const take = this.getPedalMidiTake(); for (const listener of this._pedalMidiListeners) try { listener(take); } catch (error) { this.onStatus?.({ type: 'error', message: error.message }); } }
    _requestPedalMidi(type, values) {
      return new Promise((resolve, reject) => {
        const requestId = ++this._pedalMidiRequestId;
        const timer = setTimeout(() => { this._pedalMidiRequests.delete(requestId); reject(Error('MIDI capture did not respond. Reopen audio and try again.')); }, 8000);
        this._pedalMidiRequests.set(requestId, { resolve, reject, timer });
        try { this._send({ type, ...values, requestId }); } catch (error) { clearTimeout(timer); this._pedalMidiRequests.delete(requestId); reject(error); }
      });
    }
    async startPedalMidi(ownerId, slot, options = {}) {
      if (this._audioApplying || this._deviceAccessPending || this.recordingBusy || this.getServiceState().active) throw Error('Finish recording, SERVICE or audio setup before capturing MIDI.');
      if (this.state.master?.playback && window.LoomMasterTransform && !window.LoomMasterTransform.isNeutral(this.state.master.playback)) throw Error('Reset master Speed & Pitch before capturing live MIDI.');
      const owner = this._pedalMidiOwner(this.state, ownerId), effect = owner?.effects?.[slot];
      if (!owner || owner.disabled === true || owner.freeze || !Number.isInteger(slot) || slot < 0 || slot >= (/^track-/.test(ownerId) ? 5 : 4) || effect?.type !== 'ferment') throw Error('Choose an enabled, unfrozen FERMENT insert for MIDI capture.');
      if (effect.params.bypass || effect.params.mix === 0 || effect.params.mode === 'chord') throw Error('Enable FERMENT in Pitch Tracking mode and play one note at a time.');
      const operation = ++this._pedalMidiOperation, generation = this.generation;
      await this.stopPedalMidi('restarted'); await this.init(); await this.context.resume();
      if (operation !== this._pedalMidiOperation || generation !== this.generation || this._pedalMidiOwner(this.state, ownerId)?.disabled === true || this._pedalMidiOwner(this.state, ownerId)?.effects?.[slot] !== effect) throw abortError();
      try { await this._preparePedalMidiFallback(operation); }
      catch (error) { if (this._pedalMidiBufferLease?.operation === operation) this._restorePedalMidiFallback(); throw error; }
      if (operation !== this._pedalMidiOperation || generation !== this.generation || this._pedalMidiOwner(this.state, ownerId)?.disabled === true || this._pedalMidiOwner(this.state, ownerId)?.effects?.[slot] !== effect || owner.freeze || effect.params.bypass || effect.params.mix === 0 || effect.params.mode === 'chord' || this.recordingBusy || this.getServiceState().active || this._audioApplying || window.LoomMasterTransform && !window.LoomMasterTransform.isNeutral(this.state.master?.playback)) {
        if (this._pedalMidiBufferLease?.operation === operation) this._restorePedalMidiFallback(); throw abortError();
      }
      const token = 'ferment-' + Date.now().toString(36) + '-' + operation;
      this._pedalMidiEffect = effect; this._pedalMidiNotifyFrame = 0; this._panicLatched = false;
      this._pedalMidiTake = { token, ownerId, slot, tempo: Math.max(40, Math.min(240, Number(options.tempo) || this.state.tempo || 120)), sampleRate: this.context.sampleRate, frames: 0, startBeat: this.getTransport().beat, notes: [], capturing: true, reason: null };
      this._notifyPedalMidi();
      try { await this._requestPedalMidi('pedalMidiStart', { settings: { token, ownerId, slot, tempo: this._pedalMidiTake.tempo } }); }
      catch (error) { if (this._pedalMidiTake?.token === token) { this._pedalMidiTake.capturing = false; this._pedalMidiTake.reason = 'error'; this._notifyPedalMidi(); } if (this._pedalMidiBufferLease?.operation === operation) this._restorePedalMidiFallback(); throw error; }
      if (operation !== this._pedalMidiOperation || this._pedalMidiTake?.token !== token) { if (this._pedalMidiBufferLease?.operation === operation) this._restorePedalMidiFallback(); throw abortError(); }
      return this.getPedalMidiTake();
    }
    async stopPedalMidi(reason = 'stopped') {
      if (reason !== 'restarted') this._pedalMidiOperation++;
      this._cancelPedalMidiWarmup();
      const take = this._pedalMidiTake;
      if (!take?.capturing) { this._queuePedalMidiRestore(); return this.getPedalMidiTake(); }
      if (this.node) await this._requestPedalMidi('pedalMidiStop', { token: take.token, reason });
      if (this._pedalMidiTake?.token === take.token) { take.capturing = false; take.reason ||= reason; this._notifyPedalMidi(); }
      return this.getPedalMidiTake();
    }
    clearPedalMidiTake({ force = false } = {}) { if (this._pedalMidiTake?.capturing) { if (!force) throw Error('Stop MIDI capture before clearing the take.'); if (this.node) this._send({ type: 'pedalMidiStop', token: this._pedalMidiTake.token, reason: 'project-changed' }); } this._pedalMidiOperation++; this._cancelPedalMidiWarmup(); this._queuePedalMidiRestore(); this._pedalMidiTake = this._pedalMidiEffect = null; this._notifyPedalMidi(); }
    _flushPedalMidi(force = false) {
      if (!this.core || !this.core.pedalMidi && !this.core.pedalMidiBatches.length) return;
      if (!force && this.core.pedalMidi && !this.core.pedalMidiBatches.length && ++this._pedalMidiFrames % 4) return;
      for (const batch of this.core.drainPedalMidi()) this._message({ type: 'pedalMidi', batch });
    }
    _send(m) {
      if (!this._initializing && ['stop', 'seek', 'panic', 'serviceStart', 'recordStart'].includes(m.type)) { this._pedalMidiOperation++; this._cancelPedalMidiWarmup(); if (!this._pedalMidiTake?.capturing) this._queuePedalMidiRestore(); }
      if (['play', 'stop', 'seek', 'panic', 'recordStart', 'serviceStart', 'serviceStop'].includes(m.type)) m = { ...m, epoch: ++this._transportEpoch };
      if (m.type === 'recordStart') this._countInOrigin = m.schedule?.countInBeats > 0 ? { revision: this._transportEpoch, beat: this._recordTimelineStartBeat ?? this._meters.beat ?? 0 } : null;
      else if (['play', 'stop', 'seek', 'panic', 'recordStop', 'recordCancel', 'serviceStart', 'serviceStop'].includes(m.type)) this._countInOrigin = null;
      if (Number.isInteger(m.epoch)) {
        const now = this.context?.currentTime || 0;
        this._clockAnchor = { beat: this._meters.beat || 0, cycle: ['seek', 'play', 'serviceStart', 'serviceStop'].includes(m.type) ? 0 : this._clockAnchor.cycle || 0, time: now, countIn: this._meters.countInBeatsRemaining || 0 };
        this._notifyTransport(m.type);
      }
      if (this.mode === 'worklet') { this.node.port.postMessage(m); return; }
      if (!this.core) return;
      const serviceFrame = m.type === 'serviceStart' ? 0 : this.core.sampleClock;
      if (m.type === 'pedalMidiStart' || m.type === 'pedalMidiStop') {
        try { if (m.type === 'pedalMidiStart') this.core.startPedalMidi(m.settings); else if (!this.core.pedalMidi || this.core.pedalMidi.token === m.token) this.core.stopPedalMidi(m.reason); this._flushPedalMidi(true); this._message({ type: 'pedalMidiAck', requestId: m.requestId }); }
        catch (error) { this._message({ type: 'pedalMidiAck', requestId: m.requestId, error: error.message }); }
        return;
      }
      if (m.type === 'diagnosticsConfig') this.core.setDiagnostics(m.config);
      else if (m.type === 'meterDetail') this.core.setMeterDetail(m.detail);
      else if (m.type === 'masteringAnalysis') this.core.setMasteringAnalysis(m.enabled);
      else if (m.type === 'resetMasteringMeters') { this.core.resetMasteringMeters(); this._acceptMeters(this.core.getMeters(), this._transportEpoch, this.context?.currentTime || 0); }
      else if (m.type === 'diagnosticsReset') this.core.resetDiagnostics(m.revision);
      else if (m.type === 'state') this.core.setState(m.state);
      else if (m.type === 'assets') this.core.setAssets(m.assets);
      else if (m.type === 'assetDelta') this.core.updateAssets(m.additions, m.removals);
      else if (m.type === 'play') this.core.start(m.beat);
      else if (m.type === 'stop') this.core.stop();
      else if (m.type === 'seek') this.core.seek(m.beat);
      else if (m.type === 'serviceStart') this.core.startService(m.scene, m.beat, m.seq, m.performance);
      else if (m.type === 'serviceScene') this.core.queueService('scene', m.scene, m.quantize, m.seq);
      else if (m.type === 'servicePerformance') this.core.queueService('performance', m.performance, m.quantize, m.seq);
      else if (m.type === 'serviceStop') this.core.stopService(m.seq);
      else if (m.type === 'recordHold') this.core.setRecordingHold(m.value);
      else if (m.type === 'audition') this.core.resumeAudition(m.track);
      else if (m.type === 'clearAudition') this.core.clearAudition(m.track);
      else if (m.type === 'microphoneMonitor') this.core.setMicrophoneMonitor(m.track, m.enabled);
      else if (m.type === 'microphoneReset') this.recorder.clearMicrophoneHistory();
      else if (m.type === 'resetEffectMeters') { this.core.resetEffectMeters(m.ownerId ?? m.track, m.slot); this._acceptMeters(this.core.getMeters(), this._transportEpoch, this.context?.currentTime || 0); }
      else if (m.type === 'microphoneEnded') { this.core.setMicrophoneMonitor(-1, false); if (this.recorder.active && this.recorder.microphone) this.recorder._limit('device'); }
      else if (m.type === 'panic') { this.core.panic(); this.recorder.cancel(); }
      else if (m.type === 'recordStart') { this.core.beginRecording(m.schedule); this.recorder.start(m.id, m.tracks, this.core.beat, m.maxFrames, m.schedule); this._message({ type: 'recordStarted', id: m.id, startBeat: this.core.beat }); }
      else if (m.type === 'recordStop') { const meta = this.recorder.stop(m.stopId); this.core.endRecording(); if (!meta.pending) this._message({ type: 'recordStopped', ...meta, stopId: m.stopId }); }
      else if (m.type === 'recordCancel') { this.recorder.cancel(); this.core.endRecording(); }
      else if (m.type === 'gate') { this.core.setRecordOnly(m.track, m.value); this._message({ type: 'gateAck', id: m.id }); }
      if (this.core.serviceEvents.length) for (const event of this.core.drainServiceEvents(this.context?.currentTime || 0, serviceFrame)) this._message({ type: 'serviceEvent', event });
      this._flushPedalMidi(true);
      if (Number.isInteger(m.epoch)) this._acceptMeters(this.core.getMeters(), m.epoch, this.context?.currentTime || 0);
    }
    _message(m) {
      if (m.type === 'pedalMidiAck') { const request = this._pedalMidiRequests.get(m.requestId); if (request) { clearTimeout(request.timer); this._pedalMidiRequests.delete(m.requestId); if (m.error) request.reject(Error(m.error)); else request.resolve(); } return; }
      if (m.type === 'pedalMidi') {
        const batch = m.batch, take = this._pedalMidiTake;
        if (!batch || !take || batch.token !== take.token || batch.ownerId !== take.ownerId || batch.slot !== take.slot) return;
        const events = (batch.events || []).filter(note => Number.isInteger(note.pitch) && note.pitch >= 0 && note.pitch <= 127 && Number.isSafeInteger(note.startFrame) && Number.isSafeInteger(note.endFrame) && note.startFrame >= 0 && note.endFrame > note.startFrame && Number.isFinite(note.velocity));
        for (const note of events.slice(0, 4096 - take.notes.length)) take.notes.push({ ...note, velocity: Math.max(0, Math.min(1, note.velocity)) });
        take.frames = Math.max(take.frames, Number(batch.frames) || 0);
        if (batch.done) { take.capturing = false; take.reason = batch.reason || 'stopped'; this._queuePedalMidiRestore(); }
        if (events.length || batch.done || take.frames - this._pedalMidiNotifyFrame >= take.sampleRate / 8) { this._pedalMidiNotifyFrame = take.frames; this._notifyPedalMidi(); } return;
      }
      if (m.type === 'diagnostics') { if (this._diagnosticsConfig.enabled && m.generation === this._diagnosticsGeneration && m.report?.revision === this._diagnosticsConfig.revision) this._diagnosticsSnapshot = m.report; return; }
      if (m.type === 'serviceEvent') {
        const event = m.event;
        if (event.type === 'stop') { this._serviceRuntime = { ...event, active: false }; this._serviceArrangementBeat = event.arrangementBeat ?? this._serviceArrangementBeat; this._meters = { ...this._meters, beat: this._serviceArrangementBeat, cycle: 0, playing: false, ended: false }; this._serviceStops.get(event.seq)?.(event); this._serviceStops.delete(event.seq); }
        else this._serviceRuntime = { ...event, active: true };
        for (const listener of this._serviceListeners) { try { listener(event); } catch (error) { this.onStatus?.({ type: 'error', message: error.message }); } }
        return;
      }
      if ((m.type === 'meters' || m.type === 'transportEnded' || m.type === 'clock') && m.epoch === this._transportEpoch) { this._acceptMeters(m.meters, m.epoch, m.contextTime); if (this.isRecording && m.recordId === this._recordId) { this._recordFrames = Math.max(this._recordFrames, m.recordFrames || 0); this._recordStage = m.recordStage || this._recordStage; } }
      else if (m.type === 'chunk' && m.id === this._recordId) { if (!this._chunks.has(m.trackIndex)) this._chunks.set(m.trackIndex, []); this._chunks.get(m.trackIndex).push({ left: m.left, right: m.right }); this._recordStartBeat = m.startBeat; }
      else if (m.type === 'recordStarted' && m.id === this._recordId) this._recordStartBeat = m.startBeat;
      else if (m.type === 'countInEnd' && m.id === this._recordId && this.isRecording) this._recordTransportStart();
      else if (m.type === 'limit' && m.id === this._recordId) { this.isRecording = false; this._recordStage = 'idle'; this._recordFrames = m.frames; this._recordStartBeat = m.startBeat; this._releaseMic(); const info = { reason: m.reason || this._recordCapReason, seconds: m.frames / this.context.sampleRate, frames: m.frames, trackIds: [...this._chunks.keys()].map(i => this.state.tracks[i].id) }; this.onRecordingLimit?.(info); this.onStatus?.({ type: 'recording-limit', ...info }); }
      else if (m.type === 'recordStopped' && this._recordStop?.id === m.stopId) { this._recordFrames = m.frames || 0; this._recordStartBeat = Number.isFinite(m.startBeat) ? m.startBeat : this._recordStartBeat; this._recordStop.resolve(); this._recordStop = null; }
      else if (m.type === 'gateAck') { this._gates.get(m.id)?.(); this._gates.delete(m.id); }
    }
    _acceptMeters(meters, epoch, contextTime) {
      const previousCountIn = this._clockAnchor.countIn || 0;
      this._meters = meters;
      this._clockAnchor = { beat: Number(meters.beat) || 0, cycle: Number(meters.cycle) || 0, time: Number.isFinite(contextTime) ? contextTime : this.context?.currentTime || 0, countIn: Number(meters.countInBeatsRemaining) || 0 };
      if (previousCountIn > 0 && !this._clockAnchor.countIn) this._notifyTransport('count-in-end');
      if (meters.ended && !this.recordingBusy && this._transportEndedEpoch !== epoch) {
        this._transportEndedEpoch = epoch;
        const info = { beat: meters.beat, epoch };
        this._notifyTransport('end');
        this.onTransportEnd?.(info); this.onStatus?.({ type: 'transport-ended', ...info });
      }
    }
    subscribeTransport(listener) { if (typeof listener !== 'function') throw TypeError('Provide a transport listener.'); this._transportListeners.add(listener); return () => this._transportListeners.delete(listener); }
    _notifyTransport(reason) { const clock = this.getTransport(); for (const listener of this._transportListeners) { try { listener(clock, reason); } catch (error) { this.onStatus?.({ type: 'error', message: error.message }); } } }
    getTransport(atTime = this.context?.currentTime || 0) {
      const configuration = this._clockConfiguration, tempo = Math.max(40, Math.min(240, Number(configuration.tempo) || 120)), anchor = this._clockAnchor;
      const service = this._serviceRuntime.active === true, sessionEnd = Math.max(1, Math.min(64, Number(configuration.lengthBars) || 4)) * 4, endBeat = service ? Infinity : this.recordingBusy && !this._recordSchedule?.punchEnabled ? 256 : sessionEnd;
      const loopStart = Math.max(0, Number(configuration.loopStart) || 0), loopEnd = Math.min(sessionEnd, Number(configuration.loopEnd) || sessionEnd);
      const loopEnabled = !service && configuration.loopEnabled === true && !(this.isRecording && this._recordSchedule?.punchEnabled), span = Math.max(.25, loopEnd - loopStart);
      const playing = this._meters.playing === true && !this._panicLatched;
      const elapsed = playing ? (atTime - anchor.time) * tempo / 60 : 0;
      let countIn = anchor.countIn > 0 ? Math.max(0, anchor.countIn - elapsed) : 0;
      let beat = anchor.beat + (playing ? Math.max(0, elapsed - anchor.countIn) : 0), cycle = anchor.cycle;
      // Worklet anchors refer to the end of a processed block. Interpolation
      // back to currentTime avoids a quantum-sized jump in UI and note timing.
      if (playing && elapsed < 0 && !anchor.countIn) beat = anchor.beat + elapsed;
      // A fallback callback can describe an output block slightly ahead of
      // currentTime. Preserve the same boundary on both sides of count-in,
      // including a first post-boundary anchor whose countdown is already zero.
      // The recording epoch and origin distinguish this hold from an ordinary
      // seek or from returning through a later arrangement loop.
      const origin = this._countInOrigin;
      if (playing && origin?.revision === this._transportEpoch && !anchor.cycle) {
        const projected = anchor.beat + elapsed - anchor.countIn;
        countIn = Math.max(0, origin.beat - projected);
        beat = Math.max(origin.beat, projected);
      }
      if (loopEnabled && cycle > 0 && beat < loopStart) { beat += span; cycle--; }
      if (playing && loopEnabled && beat >= loopEnd) { const wraps = 1 + Math.floor((beat - loopEnd) / span); beat = loopStart + (beat - loopEnd) % span; cycle += wraps; }
      if (!loopEnabled && !this.recordingBusy && !service) beat = Math.min(endBeat, beat);
      beat = Math.max(0, beat);
      return { beat, absoluteBeat: service ? beat : beat + cycle * span, cycle, contextTime: atTime, anchorTime: anchor.time, anchorBeat: anchor.beat, tempo, playing, revision: this._transportEpoch, loopEnabled, loopStart, loopEnd, endBeat, countInBeatsRemaining: countIn, mode: this.mode };
    }
    get recordingBusy() { return Boolean(this.isRecording || this._recordPreparing || this._micPending || this._stopPromise || this._chunks.size); }
    _updateRecordHold() { this._send({ type: 'recordHold', value: this.recordingBusy }); }
    _clampBeat(beat) { return Math.max(0, Math.min(Math.max(1, Math.min(64, Number(this.state.lengthBars) || 4)) * 4, Number(beat) || 0)); }
    setState(state) {
      if (this.recordingBusy && state.tracks?.some((track, index) => track.disabled === true && !this._disabledTrackFlags[index])) throw Error('Finish the current take before disabling a track.');
      if (this._pedalMidiTake?.capturing) {
        const take = this._pedalMidiTake, owner = this._pedalMidiOwner(state, take.ownerId);
        if (owner?.disabled === true || owner?.freeze || owner?.effects?.[take.slot] !== this._pedalMidiEffect) this.stopPedalMidi('target-changed').catch(error => this.onStatus?.({ type: 'error', message: error.message }));
      }
      const frozenRate = this._frozenSampleRate(state);
      if (this.context && frozenRate && frozenRate !== this.context.sampleRate) throw Error('Reopen audio at the frozen tracks’ sample rate, or unfreeze them before changing the sample rate.');
      const old = this._clockConfiguration, changedClock = ['tempo', 'lengthBars', 'loopEnabled', 'loopStart', 'loopEnd'].some(key => old?.[key] !== state?.[key]);
      if (changedClock) this._meters = { ...this._meters, beat: this.getTransport().beat };
      this._clockConfiguration = Object.fromEntries(['tempo', 'lengthBars', 'loopEnabled', 'loopStart', 'loopEnd'].map(key => [key, state[key]]));
      this._disabledTrackFlags = Array.from({ length: TRACK_COUNT }, (_, index) => state.tracks?.[index]?.disabled === true);
      if (this._micTrack >= 0 && this._disabledTrackFlags[this._micTrack]) this._disableMicrophoneMonitoring(true, true);
      this.state = state; if (this._mic && !this._recordMicrophone) this._setMicrophoneGain(state.recording?.micInputGainDb); this._send({ type: 'state', state: dspState(state), ...(changedClock ? { epoch: ++this._transportEpoch } : {}) });
    }
    setAssets(assets) { this.assets = assets instanceof Map ? new Map(assets) : new Map(Object.entries(assets || {})); this._syncAssets(); }
    _syncAssets() {
      if (!this.node || this.mode === 'idle') return;
      const additions = new Map(), removals = [];
      for (const [id, asset] of this.assets) if (this._sentAssets.get(id) !== asset) additions.set(id, asset);
      for (const id of this._sentAssets.keys()) if (!this.assets.has(id)) removals.push(id);
      if (!additions.size && !removals.length) return;
      this._send({ type: 'assetDelta', additions, removals }); this._sentAssets = new Map(this.assets);
    }
    _validateServiceScene(scene) {
      if (!scene || !Array.isArray(scene.clips) || scene.clips.length !== TRACK_COUNT) throw Error('Choose a SERVICE scene with ten clip cells.');
      for (const clip of scene.clips) if (clip && (clip.type === 'notes' || !this.assets.has(clip.assetId) || !Number.isFinite(clip.length) || clip.length <= 0)) throw Error('Prepare each SERVICE cell as a valid audio clip before playing.');
      return { ...scene, clips: scene.clips.map(clip => clip ? { ...clip, start: 0 } : null), ...(scene.holds ? { holds: Array.from({ length: TRACK_COUNT }, (_, i) => scene.holds[i] === true) } : {}) };
    }
    async startService({ scene, performance = null, fromBeat = 0 } = {}) {
      if (this._pedalMidiTake?.capturing || this._pedalMidiWarmup) await this.stopPedalMidi('audio-operation');
      if (this.recordingBusy) throw Error('Finish the current recording before starting SERVICE.');
      if (this._audioApplying || this._deviceAccessPending) throw Error('Finish setting up the audio interface before starting SERVICE.');
      scene = this._validateServiceScene(scene);
      if (this._serviceRuntime.active) await this.stopService();
      const generation = this.generation, request = ++this._playRequest;
      this._playPending++;
      try {
        await this.init(); if (generation !== this.generation || request !== this._playRequest) return false;
        await this.context.resume(); if (generation !== this.generation || request !== this._playRequest) return false;
        this._serviceArrangementBeat = this.getTransport().beat;
        const beat = Math.max(0, Number(fromBeat) || 0), seq = ++this._serviceSeq;
        this._serviceRuntime = { active: true, scene, performance, beat, seq };
        this._panicLatched = false; this._meters = { ...this._meters, beat, cycle: 0, playing: true, ended: false };
        this._send({ type: 'serviceStart', scene, performance, beat, seq }); return true;
      } finally { this._playPending--; }
    }
    queueServiceScene(scene, { quantize = 'bar' } = {}) {
      if (!this._serviceRuntime.active) throw Error('Start SERVICE before launching a scene.');
      scene = this._validateServiceScene(scene); const seq = ++this._serviceSeq;
      this._send({ type: 'serviceScene', scene, quantize, seq }); return seq;
    }
    setServicePerformance(performance, { quantize = 'immediate' } = {}) {
      if (!this._serviceRuntime.active) throw Error('Start SERVICE before using performance controls.');
      if (!performance || !Array.isArray(performance.overrides || []) || (performance.overrides || []).some(item => !Number.isFinite(item?.value))) throw Error('Choose finite SERVICE performance values.');
      const seq = ++this._serviceSeq; this._send({ type: 'servicePerformance', performance, quantize, seq }); return seq;
    }
    stopService() {
      this._playRequest++;
      if (!this._serviceRuntime.active) return Promise.resolve({ active: false, beat: this.getTransport().beat });
      const seq = ++this._serviceSeq;
      const stopped = new Promise(resolve => this._serviceStops.set(seq, resolve));
      this._serviceRuntime = { ...this._serviceRuntime, active: false };
      this._meters = { ...this._meters, beat: this._serviceArrangementBeat, cycle: 0, playing: false, ended: false };
      this._send({ type: 'serviceStop', seq }); return stopped;
    }
    subscribeService(listener) { if (typeof listener !== 'function') throw TypeError('Provide a SERVICE event listener.'); this._serviceListeners.add(listener); return () => this._serviceListeners.delete(listener); }
    getServiceState() { return { ...this._serviceRuntime, beat: this._serviceRuntime.active ? this.getTransport().beat : this._serviceRuntime.beat || 0 }; }
    async play(fromBeat = this._meters.beat) {
      if (this._serviceRuntime.active) await this.stopService();
      if (this._audioApplying || this._deviceAccessPending) throw Error('Finish setting up the audio interface before starting playback.');
      this._playPending++;
      try {
        const generation = this.generation, request = ++this._playRequest; await this.init(); if (generation !== this.generation || request !== this._playRequest) return false;
        await this.context.resume(); if (generation !== this.generation || request !== this._playRequest) return false;
        this._panicLatched = false; const beat = this._clampBeat(fromBeat); this._meters = { ...this._meters, beat, playing: true, ended: false }; this._send({ type: 'play', beat }); return true;
      } finally { this._playPending--; }
    }
    stop(options = {}) { this._pedalMidiOperation++; this._cancelPedalMidiWarmup(); if (this._serviceRuntime.active) this.stopService(); if (options.preserveMicrophoneMonitoring !== true) this._disableMicrophoneMonitoring(false, true); this._playRequest++; if (!this.isRecording) this._recordRequest++; this._meters = { ...this._meters, beat: this.getTransport().beat, playing: false }; this._send({ type: 'stop' }); }
    seek(beat) {
      this._pedalMidiOperation++; this._cancelPedalMidiWarmup();
      if (this.recordingBusy) throw Error('Finish or cancel the current take before moving the playhead.');
      if (this._serviceRuntime.active) throw Error('Stop SERVICE before moving the arrangement playhead.');
      this._meters = { ...this._meters, beat: this._clampBeat(beat), ended: false }; this._send({ type: 'seek', beat: this._meters.beat }); return this._meters.beat;
    }
    resumeAudition(id) { const track = id == null ? undefined : this._assertTrackEnabled(this._trackIndex(id)); this._panicLatched = false; this._send({ type: 'audition', track }); }
    clearAudition(id) { this._send({ type: 'clearAudition', track: id == null ? undefined : this._trackIndex(id) }); }
    resetEffectMeters(ownerId, slot) {
      if (!Number.isInteger(slot) || slot < 0 || slot >= 5) return false;
      let owner;
      if (ownerId === 'master') owner = this.state.master;
      else if (ownerId === 'return-1' || ownerId === 'return-2') owner = this.state.returns?.[ownerId === 'return-1' ? 0 : 1];
      else if (ownerId === 'bus-1' || ownerId === 'bus-2') owner = this.state.buses?.[ownerId === 'bus-1' ? 0 : 1];
      else { const index = typeof ownerId === 'number' ? Math.floor(ownerId) : this.state.tracks.findIndex(item => item.id === ownerId); if (!Number.isInteger(index) || index < 0 || index >= TRACK_COUNT) return false; owner = this.state.tracks[index]; ownerId = owner.id; }
      if (slot >= (/^track-(?:[1-9]|10)$/.test(ownerId) ? 5 : 4) || owner?.effects?.[slot]?.type !== 'scales') return false;
      // Analysis holds are runtime state: never resend the project or reset DSP.
      this._send({ type: 'resetEffectMeters', ownerId, slot }); return true;
    }

    panic() {
      this.generation++; this._disableMicrophoneMonitoring(true); this._panicLatched = true; this._playRequest++; this.cancelRecording(); this._send({ type: 'panic' }); this._meters = silenceMeters(this._meters.beat);
      for (const resolve of this._gates.values()) resolve(); this._gates.clear();
    }
    getMeters() { const frames = this.mode === 'fallback' && (this.isRecording || this._chunks.size) ? this.recorder?.frames || 0 : this._recordFrames; return { ...this._meters, mode: this.mode, recording: this.isRecording, recordingPending: this.recordingBusy && !this.isRecording, recordStage: this.isRecording ? this._recordStage : 'idle', countInBeatsRemaining: this.isRecording ? this._meters.countInBeatsRemaining || 0 : 0, recordSeconds: this.context ? frames / this.context.sampleRate : 0, microphone: this.getMicrophoneStatus() }; }
    _recordTransportStart() {
      if (this._recordTransportStarted || !this.isRecording) return;
      this._recordTransportStarted = true;
      this._recordStage = this._recordSchedule.punchEnabled && this._recordTimelineStartBeat < this._recordSchedule.punchStart ? 'waiting' : 'recording';
      this.onRecordingTransportStart?.({ trackIds: this._recordTrackIds.slice(), startBeat: this._recordTimelineStartBeat, countInBars: this._recordSchedule.countInBeats / 4 });
    }
    async startRecording(trackIds, options = {}) {
      const tracks = [...new Set((Array.isArray(trackIds) ? trackIds : [trackIds]).map(id => this._assertTrackEnabled(this._trackIndex(id))))]; if (!tracks.length) throw Error('Arm a track before recording.');
      if (this._pedalMidiTake?.capturing || this._pedalMidiWarmup) await this.stopPedalMidi('audio-operation');
      if (this._serviceRuntime.active) throw Error('Stop SERVICE before recording a microphone or instrument take.');
      if (this._audioApplying || this._deviceAccessPending) throw Error('Finish setting up the audio interface before recording.');
      if (this.isRecording || this._recordPreparing || this._stopPromise || this._chunks.size || (this._micPending && !options._microphone)) return false;
      this._recordPreparing = true; this._updateRecordHold();
      try {
        const generation = this.generation, request = ++this._recordRequest; await this.init(); if (generation !== this.generation || request !== this._recordRequest) return false;
        tracks.forEach(track => this._assertTrackEnabled(track));
        await this.context.resume(); if (generation !== this.generation || request !== this._recordRequest) return false;
        const settings = { ...this.state.recording, ...options }, countInBars = !this._meters.playing && settings.startTransport !== false && [0, 1, 2].includes(settings.countInBars) ? settings.countInBars : 0;
        const punchEnabled = settings.punchEnabled === true, punchStart = this._clampBeat(settings.punchStart), punchEnd = this._clampBeat(settings.punchEnd);
        if (punchEnabled && (punchEnd - punchStart < .25 - 1e-8 || this._meters.beat >= punchEnd - 1e-10 || settings.startTransport === false)) throw Error('Set a punch range ahead of the playhead before recording.');
        const schedule = { countInBeats: countInBars * 4, punchEnabled, punchStart, punchEnd, startTransport: settings.startTransport !== false, requireTransport: settings.startTransport !== false, ...(options._microphone ? { microphone: { inputIndex: TRACK_COUNT, compensationFrames: this._recordMicrophone?.compensationFrames || 0 } } : {}) };
        const maxSeconds = Math.min(120, Math.max(.01, Number(options.maxSeconds) || 120));
        const budget = Math.min(64 * 1024 * 1024, options.budgetBytes == null ? 32 * 1024 * 1024 : Math.max(0, Number(options.budgetBytes) || 0));
        const durationFrames = Math.floor(this.context.sampleRate * maxSeconds), budgetFrames = Math.floor(budget / (tracks.length * 4)), maxFrames = Math.min(durationFrames, budgetFrames);
        if (maxFrames < 1) throw Error('The project audio budget is full. Remove unused audio before recording.');
        this._recordCapReason = budgetFrames < durationFrames ? 'budget' : 'duration';
        this._chunks = new Map(tracks.map(t => [t, []])); this._recordFrames = 0; this._recordStartBeat = this._meters.beat; this._recordId++; this.isRecording = true;
        this._recordTimelineStartBeat = this._meters.beat; this._recordSchedule = schedule; this._recordTrackIds = tracks.map(i => this.state.tracks[i].id); this._recordTransportStarted = false;
        this._recordStage = countInBars ? 'count-in' : punchEnabled && this._meters.beat < punchStart ? 'waiting' : 'recording';
        this._meters.countInBeatsRemaining = countInBars * 4;
        if (schedule.startTransport) { this._meters.playing = true; this._meters.ended = false; }
        this._panicLatched = false; this._send({ type: 'audition' }); this._send({ type: 'recordStart', id: this._recordId, tracks, maxFrames, schedule });
        if (!countInBars) this._recordTransportStart();
        this.onStatus?.({ type: 'recording-started', trackIds: this._recordTrackIds.slice(), countInBars, punchEnabled }); return true;
      } finally { this._recordPreparing = false; this._updateRecordHold(); }
    }
    stopRecording() {
      if (this._stopPromise) return this._stopPromise;
      this._stopPromise = this._finishRecording().finally(() => { this._stopPromise = null; this._updateRecordHold(); }); return this._stopPromise;
    }
    async _finishRecording() {
      const generation = this.generation; this._recordRequest++; this.isRecording = false; this._recordStage = 'idle'; this._meters.countInBeatsRemaining = 0;
      if (!this.node || !this._chunks.size) { this._recordMicrophone = null; this._releaseMic(); return []; }
      await new Promise(resolve => { const id = ++this._recordStopId; this._recordStop = { id, resolve }; this._send({ type: 'recordStop', stopId: id }); });
      this._releaseMic(); if (generation !== this.generation) return [];
      const result = [];
      for (const [track, chunks] of this._chunks) {
        const frames = chunks.reduce((n, c) => n + c.left.length, 0); if (!frames) continue;
        const left = new Float32Array(frames), right = new Float32Array(frames); let at = 0;
        for (const c of chunks) { left.set(c.left, at); right.set(c.right, at); at += c.left.length; }
        result.push({ trackId: this.state.tracks[track].id, left, right, frames, sampleRate: this.context.sampleRate, startBeat: this._recordStartBeat, ...(this._recordMicrophone ? { microphone: true, compensationMs: this._recordMicrophone.compensationMs, compensationMode: this._recordMicrophone.mode } : {}) });
      }
      this._chunks.clear(); this._recordFrames = 0; this._recordMicrophone = null; if (this._mic) this._setMicrophoneGain(this.state.recording?.micInputGainDb); this._emitMicrophoneStatus(); this.onStatus?.({ type: 'recording-stopped', takes: result.length }); return result;
    }
    cancelRecording() {
      this._recordRequest++; if (this._micPurpose === 'record') { this._micRequest++; this._micPending = false; this._micPurpose = null; } this._recordId++; this.isRecording = false; this._recordStage = 'idle'; this._meters.countInBeatsRemaining = 0; this._chunks.clear(); this._recordFrames = 0; this._send({ type: 'recordCancel' }); this._recordMicrophone = null; this._releaseMic(); if (this._mic) this._setMicrophoneGain(this.state.recording?.micInputGainDb);
      if (this._recordStop) { this._recordStop.resolve(); this._recordStop = null; }
      this._updateRecordHold();
    }
    async _recordGate(track, value) {
      if (this.mode === 'fallback') { this.core.setRecordOnly(track, value); return; }
      await new Promise(resolve => { const id = ++this._gateId; this._gates.set(id, resolve); this._send({ type: 'gate', id, track, value }); });
    }
    _setMicrophoneGain(gainDb = 0) {
      if (!this._mic) return;
      const gain = Math.max(-24, Math.min(24, Number(gainDb) || 0)); this._mic.gainDb = gain;
      // This frontend trim is printed once; the track rack is only monitored.
      this._mic.gain.gain.setValueAtTime(Math.pow(10, gain / 20), this.context.currentTime);
    }
    getMicrophoneLatency() {
      const c = this.context, settings = this.state.recording || {}, mode = ['auto', 'manual', 'off'].includes(settings.micCompensation) ? settings.micCompensation : 'auto';
      let input; try { input = this._mic?.stream.getAudioTracks?.()[0]?.getSettings?.().latency; } catch {}
      const reportedInput = Number.isFinite(input) && input >= 0 && input <= 1;
      const validSeconds = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
      const base = c?.baseLatency, output = c?.outputLatency, reportedBase = validSeconds(base), reportedDeviceOutput = validSeconds(output);
      let outputSeconds = (reportedBase ? base : 0) + (reportedDeviceOutput ? output : 0), reportedOutput = reportedBase || reportedDeviceOutput;
      let outputSource = reportedOutput ? 'reported' : 'unreported', outputComplete = reportedBase && reportedDeviceOutput;
      // The timestamp maps the render clock to the physical output clock. Its
      // gap already contains render buffering; base/device reports are a
      // fallback, never additional terms. Ignore unstarted, old or broken maps.
      if (this._outputClockContext !== c) { this._outputClockContext = c; this._outputClockStamp = null; }
      if (c?.state !== 'running') this._outputClockStamp = null;
      try {
        if (c?.state === 'running') {
          const stamp = c.getOutputTimestamp?.(), now = performance.now(), previous = this._outputClockStamp;
          const initialized = Number.isFinite(stamp?.contextTime) && stamp.contextTime > 0 && Number.isFinite(stamp?.performanceTime) && stamp.performanceTime > 0;
          const age = initialized ? (now - stamp.performanceTime) / 1000 : NaN;
          const monotonic = !previous || stamp.contextTime >= previous.contextTime && stamp.performanceTime >= previous.performanceTime;
          const gap = initialized ? (c.currentTime - stamp.contextTime) - age : NaN;
          if (initialized && monotonic && Number.isFinite(age) && age >= 0 && age <= .25 && Number.isFinite(gap) && gap >= -1e-6 && gap <= 1) {
            outputSeconds = Math.max(0, gap); reportedOutput = true; outputSource = 'timestamp'; outputComplete = true;
            this._outputClockStamp = { contextTime: stamp.contextTime, performanceTime: stamp.performanceTime };
          }
        }
      } catch {}
      const processingFrames = this._processingFrames || (this.mode === 'fallback' ? this.node?.bufferSize || AUDIO_PROFILES[this._audioSettings.latencyProfile].fallbackFrames : 128);
      const inputMs = reportedInput ? input * 1000 : 0, outputMs = Math.max(0, Math.min(1000, outputSeconds * 1000)), processingMs = c ? processingFrames / c.sampleRate * 1000 : 0;
      const offset = Math.max(-500, Math.min(500, Number(settings.micOffsetMs) || 0));
      // Block duration is granularity, not a separate measured latency. Adding
      // it here used to move takes too early, especially in fallback mode.
      const compensationMs = mode === 'off' ? 0 : mode === 'manual' ? offset : Math.max(-500, Math.min(1000, inputMs + outputMs + offset));
      return { mode, compensationMs, inputMs, outputMs, processingMs, reportedInput, reportedOutput, outputSource, outputComplete, estimateComplete: reportedInput && outputComplete, estimated: mode === 'auto', offsetMs: offset };
    }
    getMicrophoneStatus() {
      return { enabled: this._micEnabled, pending: this._micPending, trackId: this._micTrack >= 0 ? this.state.tracks[this._micTrack]?.id || null : null,
        active: Boolean(this._mic), recording: Boolean(this.isRecording && this._recordMicrophone), inputGainDb: this._mic?.gainDb ?? this.state.recording?.micInputGainDb ?? 0,
        inputPeak: this._meters.microphonePeak || 0, latency: this._recordMicrophone ? { ...this._recordMicrophone } : this.getMicrophoneLatency(), interface: this.getAudioDiagnostics() };
    }
    _emitMicrophoneStatus() { this.onStatus?.({ type: 'microphone-status', ...this.getMicrophoneStatus() }); }
    async _acquireMicrophone(track, gainDb, purpose, generation, request) {
      if (!navigator.mediaDevices?.getUserMedia) throw Error('Microphone input needs HTTPS or localhost in a browser with microphone access.');
      this._micPending = true; this._micPurpose = purpose; this._micTrack = track; this._updateRecordHold(); this._emitMicrophoneStatus(); let stream, session;
      try {
        await this.init(); if (generation !== this.generation || request !== this._micRequest) return false;
        if (!this._mic) {
          const device = this._audioSettings, captureLatency = device.latencyProfile === 'live' ? 0 : device.latencyProfile === 'balanced' ? .01 : .04;
          stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false,
            latency: { ideal: captureLatency }, sampleRate: { ideal: this.context.sampleRate }, channelCount: { ideal: 2 },
            ...(device.inputDeviceId !== 'default' ? { deviceId: { exact: device.inputDeviceId } } : {}) }, video: false });
          if (generation !== this.generation || request !== this._micRequest) { stream.getTracks().forEach(t => t.stop()); return false; }
          const capture = stream.getAudioTracks?.()[0], actualChannels = capture?.getSettings?.().channelCount;
          if (device.inputChannel === '2' && actualChannels === 1) throw Error('This input exposes one channel. Choose Input 1 or Stereo, or select an interface with a second input.');
          const source = this.context.createMediaStreamSource(stream), gain = this.context.createGain();
          const route = []; this._mic = { source, gain, stream, track, gainDb: 0, route, inputChannel: device.inputChannel }; this._devicePermission = 'granted';
          this._send({ type: 'microphoneReset' });
          if (device.inputChannel === 'stereo') source.connect(gain);
          else {
            // Channel selection is a zero-delay native route. A mono guitar or
            // vocal feeds both sides, rather than one quiet half of the amp.
            const splitter = this.context.createChannelSplitter(2), merger = this.context.createChannelMerger(2), channel = device.inputChannel === '2' ? 1 : 0;
            splitter.channelInterpretation = 'discrete'; source.connect(splitter); splitter.connect(merger, channel, 0); splitter.connect(merger, channel, 1); merger.connect(gain); route.push(splitter, merger);
          }
          gain.connect(this.microphoneInput);
          for (const audioTrack of stream.getAudioTracks?.() || []) audioTrack.addEventListener?.('ended', () => this._microphoneEnded(stream), { once: true });
        }
        session = this._mic; await this.context.resume();
        if (generation !== this.generation || request !== this._micRequest) { if (this._mic === session && !this._micEnabled) this._releaseMic(true); return false; }
        this._mic.track = track; this._setMicrophoneGain(gainDb); return true;
      } catch (error) { stream?.getTracks().forEach(t => t.stop()); if (generation === this.generation && request === this._micRequest) this._releaseMic(true); throw error; }
      finally { if (generation === this.generation && request === this._micRequest) { this._micPending = false; this._micPurpose = null; this._updateRecordHold(); this._emitMicrophoneStatus(); } }
    }
    async setMicrophoneMonitoring(trackId, options = {}) {
      if (options.enabled !== true) { this._disableMicrophoneMonitoring(); return true; }
      if (this._audioApplying || this._deviceAccessPending) throw Error('Finish setting up the audio interface before turning on monitoring.');
      const track = this._assertTrackEnabled(this._trackIndex(trackId));
      if (this.recordingBusy && (this._micTrack !== track || this._micPending)) throw Error('Finish the current take before changing the microphone track.');
      const generation = this.generation, request = ++this._micRequest;
      if (!await this._acquireMicrophone(track, this._recordMicrophone ? this._mic?.gainDb : options.gainDb ?? this.state.recording?.micInputGainDb ?? 0, 'monitor', generation, request)) return false;
      if (generation !== this.generation || request !== this._micRequest) return false;
      this._assertTrackEnabled(track);
      this._micEnabled = true; this._panicLatched = false; this._send({ type: 'microphoneMonitor', track, enabled: true }); this._emitMicrophoneStatus(); return true;
    }
    _disableMicrophoneMonitoring(force = false, cancelPending = false) {
      this._micEnabled = false;
      if (force || cancelPending || this._micPurpose !== 'record') { this._micRequest++; this._micPending = false; this._micPurpose = null; this._updateRecordHold(); }
      this._send({ type: 'microphoneMonitor', track: this._micTrack, enabled: false });
      if (force || !this.isRecording && !this._stopPromise && !this._chunks.size) this._releaseMic(true);
      this._emitMicrophoneStatus();
    }
    async startMicrophoneRecording(trackId, options = {}) {
      const track = this._assertTrackEnabled(this._trackIndex(trackId));
      if (this._pedalMidiTake?.capturing || this._pedalMidiWarmup) await this.stopPedalMidi('audio-operation');
      if (this._audioApplying || this._deviceAccessPending) throw Error('Finish setting up the audio interface before recording.');
      if (this.isRecording || this._recordPreparing || this._stopPromise || this._chunks.size || this._micPending) return false;
      if (this._micEnabled && this._micTrack !== track) throw Error('Move live microphone monitoring to this track before recording it.');
      const generation = this.generation, request = ++this._micRequest;
      try {
        if (!await this._acquireMicrophone(track, options.micInputGainDb ?? this.state.recording?.micInputGainDb ?? 0, 'record', generation, request)) return false;
        if (generation !== this.generation || request !== this._micRequest) return false;
        if (this._micEnabled) this._send({ type: 'microphoneMonitor', track, enabled: true });
        const latency = this.getMicrophoneLatency(); this._recordMicrophone = { ...latency, compensationFrames: Math.round(latency.compensationMs * this.context.sampleRate / 1000) };
        const started = await this.startRecording([track], { ...options, _microphone: true });
        if (!started) { this._recordMicrophone = null; this._releaseMic(); } this._emitMicrophoneStatus(); return started;
      } catch (error) { if (generation === this.generation && request === this._micRequest) { this._recordMicrophone = null; this._releaseMic(); } throw error; }
    }
    _microphoneEnded(stream) {
      if (this._mic?.stream !== stream) return;
      this._micEnabled = false; this._micRequest++; this._send({ type: 'microphoneMonitor', track: this._micTrack, enabled: false }); this._releaseMic(true);
      this._send({ type: 'microphoneEnded' }); this.onStatus?.({ type: 'microphone-disconnected', message: 'The microphone disconnected. Any captured audio has been retained.' });
    }
    _releaseMic(force = false) {
      if (!this._mic || !force && this._micEnabled) return;
      const { source, gain, stream, route = [] } = this._mic; this._mic = null;
      for (const node of [source, gain, ...route]) try { node.disconnect(); } catch {}
      stream.getTracks().forEach(t => t.stop()); this._send({ type: 'microphoneReset' }); this._meters.microphonePeak = 0; this._emitMicrophoneStatus();
    }
    async decodeFile(file) {
      if (!file || file.size > 32 * 1024 * 1024) throw Error('Choose an audio file smaller than 32 MiB.');
      const context = await this.init(), buffer = await context.decodeAudioData(await file.arrayBuffer());
      const frames = Math.min(buffer.length, Math.round(buffer.sampleRate * 120));
      return { left: buffer.getChannelData(0).slice(0, frames), right: buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1)).slice(0, frames), sampleRate: buffer.sampleRate, frames };
    }
    async renderWav(state = this.state, assets = this.assets, options = {}) {
      if (this._audioApplying) throw Error('Finish setting up the audio interface before exporting audio.');
      this._exportCount++;
      try {
      if ([options.trackId, options.returnId, options.busId].filter(value => value != null).length > 1) throw Error('Choose one track, return or group bus stem.');
      if (options.trackId != null) { const index = typeof options.trackId === 'number' ? Math.floor(options.trackId) : state.tracks.findIndex(t => t.id === options.trackId); if (!Number.isInteger(index) || index < 0 || index >= TRACK_COUNT) throw Error('Choose one of the ten tracks for the stem.'); }
      if (options.returnId != null && !['return-1', 'return-2'].includes(options.returnId)) throw Error('Choose Return A or Return B for the return stem.');
      if (options.busId != null && !['bus-1', 'bus-2'].includes(options.busId)) throw Error('Choose Bus 1 or Bus 2 for the group stem.');
      const sr = this._frozenSampleRate(state) || 48000, start = Math.max(0, Math.min(255.999, Number(options.startBeat) || 0)), end = Math.max(start + .0001, Math.min(256, Number(options.endBeat) || (state.lengthBars || 4) * 4));
      const tempo = Math.max(40, Math.min(240, state.tempo || 120)), main = Math.round((end - start) * 60 / tempo * sr), tail = Math.round(Math.max(0, Math.min(20, Number(options.tailSeconds) || 0)) * sr), total = main + tail;
      if (options.signal?.aborted) throw abortError();
      const DSP = createLoomEngineDSP(window.createLoomEffectsDSP, window.createLoomLFODSP, window.createLoomCPUProfiler, window.createLoomTrackEQDSP, window.createLoomMasteringDSP), core = new DSP.Core(dspState(state), assets, sr, { linear: true, includeMetronome: options.includeMetronome === true, trackId: options.trackId, returnId: options.returnId, busId: options.busId });
      core.start(start); const { buffer, view } = makeWavBuffer(total, sr), scratchLeft = new Float32Array(2048), scratchRight = new Float32Array(2048);
      // Keep audio block boundaries exact; reuse private scratch/meter storage
      // and share the main thread after about 10 ms of cooperative work.
      const now = () => globalThis.performance?.now?.() ?? Date.now();
      let at = 0, yieldAt = now() + 10;
      options.onProgress?.(0);
      while (at < total) {
        if (options.signal?.aborted) throw abortError(); if (at === main) core.stop();
        const count = Math.min(2048, total - at, at < main ? main - at : total - at), left = count === 2048 ? scratchLeft : scratchLeft.subarray(0, count), right = count === 2048 ? scratchRight : scratchRight.subarray(0, count);
        core.renderRealtime(left, right); writePcm(view, at, left, right); at += count;
        if (now() >= yieldAt) {
          options.onProgress?.(at / total);
          if (typeof globalThis.scheduler?.yield === 'function') await globalThis.scheduler.yield();
          else await new Promise(resolve => setTimeout(resolve, 0));
          yieldAt = now() + 10;
        }
      }
      if (options.signal?.aborted) throw abortError(); options.onProgress?.(1); return new Blob([buffer], { type: 'audio/wav' });
      } finally { this._exportCount--; }
    }
    async renderMasterPCM(state = this.state, assets = this.assets, options = {}) {
      if (this._audioApplying) throw Error('Finish setting up the audio interface before rendering master playback.');
      this._exportCount++;
      try {
        if (options.trackId != null || options.returnId != null || options.busId != null) throw Error('Master playback renders the complete mix. Use WAV export for individual stems.');
        const frozenRate = this._frozenSampleRate(state), sampleRate = options.sampleRate == null ? frozenRate || 48000 : Number(options.sampleRate);
        if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw Error('Choose a supported sample rate for master playback.');
        if (frozenRate && sampleRate !== frozenRate) throw Error('Master playback must use the frozen tracks’ sample rate. Unfreeze them before changing it.');
        const startBeat = Math.max(0, Math.min(255.999, Number(options.startBeat) || 0)), endBeat = Math.max(startBeat + .0001, Math.min(256, Number(options.endBeat) || (state.lengthBars || 4) * 4));
        const previewLoop = options.previewLoop === true, tempo = Math.max(40, Math.min(240, Number(state.tempo) || 120));
        if (previewLoop && (startBeat > 255 || endBeat - startBeat < .25)) throw Error('Choose a master preview loop at least a quarter beat long, starting no later than beat 256.');
        const nominalFrames = (endBeat - startBeat) * 60 / tempo * sampleRate, bodyFrames = Math.max(1, Math.round(nominalFrames));
        const tailFrames = previewLoop ? 0 : Math.round(Math.max(0, Math.min(20, Number(options.tailSeconds ?? 8) || 0)) * sampleRate), frames = bodyFrames + tailFrames;
        const maxPCMBytes = options.maxPCMBytes == null ? 128 * 1024 * 1024 : Number(options.maxPCMBytes);
        if (!Number.isFinite(maxPCMBytes) || maxPCMBytes < 0) throw Error('Choose a finite memory budget for master playback.');
        if (!Number.isSafeInteger(frames * 8) || frames * 8 > maxPCMBytes) throw Error('This master preview exceeds the available audio memory. Use a shorter loop or a shorter playback range.');
        if (options.signal?.aborted) throw abortError();
        const renderState = dspState(state);
        if (previewLoop) { renderState.loopEnabled = true; renderState.loopStart = startBeat; renderState.loopEnd = endBeat; }
        const DSP = createLoomEngineDSP(window.createLoomEffectsDSP, window.createLoomLFODSP, window.createLoomCPUProfiler, window.createLoomTrackEQDSP, window.createLoomMasteringDSP);
        const core = new DSP.Core(renderState, assets, sampleRate, { linear: !previewLoop, includeMetronome: options.includeMetronome === true });
        const left = new Float32Array(frames), right = new Float32Array(frames), scratchLeft = new Float32Array(2048), scratchRight = new Float32Array(2048);
        const warmupFrames = previewLoop ? Math.ceil(nominalFrames) : 0, totalWork = warmupFrames + frames;
        core.start(startBeat);
        const now = () => globalThis.performance?.now?.() ?? Date.now();
        let at = 0, yieldAt = now() + 10;
        options.onProgress?.(0);
        while (at < totalWork) {
          if (options.signal?.aborted) throw abortError();
          if (!previewLoop && at === bodyFrames) core.stop();
          const boundary = at < warmupFrames ? warmupFrames : at < warmupFrames + bodyFrames ? warmupFrames + bodyFrames : totalWork;
          const count = Math.min(2048, totalWork - at, boundary - at), blockLeft = count === 2048 ? scratchLeft : scratchLeft.subarray(0, count), blockRight = count === 2048 ? scratchRight : scratchRight.subarray(0, count);
          core.renderRealtime(blockLeft, blockRight);
          if (at >= warmupFrames) { left.set(blockLeft, at - warmupFrames); right.set(blockRight, at - warmupFrames); }
          at += count;
          if (now() >= yieldAt) {
            options.onProgress?.(at / totalWork);
            if (typeof globalThis.scheduler?.yield === 'function') await globalThis.scheduler.yield();
            else await new Promise(resolve => setTimeout(resolve, 0));
            yieldAt = now() + 10;
          }
        }
        if (options.signal?.aborted) throw abortError(); options.onProgress?.(1);
        return { left, right, sampleRate, frames, bodyFrames, startBeat, endBeat, tailFrames };
      } finally { this._exportCount--; }
    }
    async renderFreezeTrack(state = this.state, assets = this.assets, options = {}) {
      if (this._audioApplying) throw Error('Finish setting up the audio interface before freezing a track.');
      if (options.trackId == null) throw Error('Choose one of the ten tracks to freeze.');
      const selectedTrack = typeof options.trackId === 'number' ? state.tracks?.[Math.floor(options.trackId)] : state.tracks?.find(track => track.id === options.trackId);
      if (selectedTrack?.disabled === true) throw Error('Enable the track before freezing it.');
      const sampleRate = Math.round(Number(options.sampleRate) || this.context?.sampleRate || 48000), tempo = Math.max(40, Math.min(240, Number(state.tempo) || 120));
      if (sampleRate < 8000 || sampleRate > 192000) throw Error('Choose a supported sample rate for freezing.');
      const lengthBeats = Math.max(1, Math.min(64, Number(state.lengthBars) || 4)) * 4, bodyFrames = Math.round(lengthBeats * 60 / tempo * sampleRate), tailFrames = Math.round(Math.max(0, Math.min(20, Number(options.tailSeconds ?? 8) || 0)) * sampleRate), totalFrames = bodyFrames + tailFrames;
      const chunkFrames = Math.max(128, Math.round(Math.max(.01, Math.min(120, Number(options.chunkSeconds) || 10)) * sampleRate)), quantum = this.mode === 'fallback' ? this._processingFrames || 256 : 128;
      const tailFadeFrames = Math.min(tailFrames, Math.max(1, Math.round(sampleRate * .006)));
      const maxBytes = Number.isFinite(options.maxBytes) ? Math.max(0, options.maxBytes) : 192 * 1024 * 1024, collected = options.onChunk ? null : [];
      if (options.signal?.aborted) throw abortError();
      this._exportCount++;
      try {
        const DSP = createLoomEngineDSP(window.createLoomEffectsDSP, window.createLoomLFODSP, window.createLoomCPUProfiler, window.createLoomTrackEQDSP, window.createLoomMasteringDSP), core = new DSP.Core(dspState(state), assets, sampleRate, { linear: true, freezeCaptureTrackId: options.trackId });
        core.start(0);
        const scratchLeft = new Float32Array(quantum), scratchRight = new Float32Array(quantum), now = () => globalThis.performance?.now?.() ?? Date.now();
        let at = 0, yieldAt = now() + 10, bytes = 0, chunkStart = 0, chunkAt = 0;
        const names = ['main', 'sendA', 'sendB'];
        let planes = Object.fromEntries(names.map(name => [name, { left: new Float32Array(Math.min(chunkFrames, totalFrames)), right: new Float32Array(Math.min(chunkFrames, totalFrames)) }]));
        options.onProgress?.(0);
        while (at < totalFrames) {
          if (options.signal?.aborted) throw abortError();
          if (at === bodyFrames) core.stop();
          const count = Math.min(quantum, totalFrames - at, at < bodyFrames ? bodyFrames - at : totalFrames - at), left = count === quantum ? scratchLeft : scratchLeft.subarray(0, count), right = count === quantum ? scratchRight : scratchRight.subarray(0, count);
          core.renderRealtime(left, right);
          // Feedback and modeled analog noise can outlive the retained tail.
          // Fade its final six milliseconds without changing the musical body.
          if (tailFadeFrames && at + count > totalFrames - tailFadeFrames) for (let frame = Math.max(0, totalFrames - tailFadeFrames - at); frame < count; frame++) {
            const gain = .5 - .5 * Math.cos(Math.PI * (totalFrames - 1 - at - frame) / tailFadeFrames);
            for (const name of names) { core.freezeCapture[name][0][frame] *= gain; core.freezeCapture[name][1][frame] *= gain; }
          }
          for (let offset = 0; offset < count;) {
            const length = Math.min(count - offset, planes.main.left.length - chunkAt);
            for (const name of names) { planes[name].left.set(core.freezeCapture[name][0].subarray(offset, offset + length), chunkAt); planes[name].right.set(core.freezeCapture[name][1].subarray(offset, offset + length), chunkAt); }
            chunkAt += length; offset += length;
            if (chunkAt === planes.main.left.length) {
              const present = {};
              for (const name of names) if (planes[name].left.some(value => value !== 0) || planes[name].right.some(value => value !== 0)) { present[name] = planes[name]; bytes += chunkAt * 8; }
              if (bytes > maxBytes) throw Error('This freeze exceeds the available cache memory. Shorten the arrangement or reduce the track’s sends.');
              const chunk = { startFrame: chunkStart, frames: chunkAt, planes: present };
              if (options.onChunk) await options.onChunk(chunk); else collected.push(chunk);
              if (options.signal?.aborted) throw abortError();
              chunkStart += chunkAt; chunkAt = 0;
              const remaining = Math.min(chunkFrames, totalFrames - chunkStart);
              if (remaining > 0) planes = Object.fromEntries(names.map(name => [name, { left: new Float32Array(remaining), right: new Float32Array(remaining) }]));
            }
          }
          at += count;
          if (now() >= yieldAt) {
            options.onProgress?.(at / totalFrames);
            if (typeof globalThis.scheduler?.yield === 'function') await globalThis.scheduler.yield();
            else await new Promise(resolve => setTimeout(resolve, 0));
            yieldAt = now() + 10;
          }
        }
        if (options.signal?.aborted) throw abortError(); options.onProgress?.(1);
        return { sampleRate, bodyFrames, totalFrames, tailFrames, ...(collected ? { chunks: collected } : {}) };
      } finally { this._exportCount--; }
    }
    async _closeAudioGraph() {
      if (this._closingAudioGraph) return this._closingAudioGraph;
      this._closingAudioGraph = (async () => {
        try { await this.stopPedalMidi('audio-closed'); } catch (error) { if (this._pedalMidiTake) { this._pedalMidiTake.capturing = false; this._pedalMidiTake.reason = 'audio-closed'; } }
        for (const request of this._pedalMidiRequests.values()) { clearTimeout(request.timer); request.reject(abortError()); } this._pedalMidiRequests.clear();
        this._diagnosticsGeneration++; this._diagnosticsSnapshot = null;
        if (this.node?.port) { this.node.port.onmessage = null; this.node.port.close?.(); }
        if (this.node) this.node.onaudioprocess = null;
        for (const node of [this.node, this.merger, ...(this.splitters || []), ...this.inputs, this.microphoneInput].filter(Boolean)) try { node.disconnect(); } catch {}
        try { if (this.context && this.context.state !== 'closed') await this.context.close(); }
        finally { this.context = null; this.node = null; this.core = null; this.recorder = null; this.inputs = []; this.microphoneInput = null; this.merger = null; this.splitters = []; this._init = null; this.mode = 'idle'; this._processingFrames = 0; this._fallbackAudioHandler = this._pedalMidiBufferLease = null; }
      })().finally(() => { this._closingAudioGraph = null; });
      return this._closingAudioGraph;
    }
    async dispose() { this.setDiagnostics({ enabled: false, release: true }); this.panic(); this._transportListeners.clear(); this._serviceListeners.clear(); for (const resolve of this._serviceStops.values()) resolve({ type: 'stop', active: false, beat: this._serviceRuntime.beat || 0 }); this._serviceStops.clear(); if (typeof navigator !== 'undefined') navigator.mediaDevices?.removeEventListener?.('devicechange', this._deviceChangeListener); await this._closeAudioGraph(); }
  }
  window.createLoomEngineDSP = createLoomEngineDSP;
  const sharedPlayback = createLoomEngineDSP(window.createLoomEffectsDSP, window.createLoomLFODSP, window.createLoomCPUProfiler, window.createLoomTrackEQDSP, window.createLoomMasteringDSP);
  window.LoomServiceTiming = sharedPlayback.ServiceTiming;
  window.LoomClipPlayback = sharedPlayback.ClipPlayback;
  window.LoomAudio = LoomAudio;
})();
