/* GALLEY: one sample clock, eight stereo lanes, and the same signal path for playback and printing. */
(() => {
  'use strict';

  function createLoomEngineDSP(effectsFactory) {
    const clamp = (v, lo, hi, fallback = lo) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
    const effects = effectsFactory();
    const automationValue = (lane, beat, fallback) => {
      const points = lane?.points;
      if (!lane || lane.enabled === false || !points?.length) return fallback;
      if (beat <= points[0].beat) return points[0].value;
      let lo = 0, hi = points.length - 1;
      while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (points[mid].beat <= beat) lo = mid; else hi = mid - 1; }
      const a = points[lo], b = points[lo + 1];
      return !b || lane.interpolation === 'hold' ? a.value : a.value + (b.value - a.value) * ((beat - a.beat) / Math.max(1e-12, b.beat - a.beat));
    };
    const emptyMeter = () => ({ peak: 0, rms: 0, rmsLeft: 0, rmsRight: 0 });
    const indexFor = (id, tracks) => typeof id === 'number' ? Math.floor(id) : tracks.findIndex(t => t.id === id);
    class Core {
      constructor(state, assets, sampleRate = 48000, options = {}) {
        this.sampleRate = clamp(sampleRate, 8000, 192000, 48000);
        this.options = options;
        this.beat = 0;
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
        this.recordOnly = new Set();
        this.auditionTracks = new Set();
        this.microphoneMonitor = { track: -1, enabled: false };
        this.microphonePeak = 0;
        this.slots = Array.from({ length: 8 }, () => Array(4).fill(null));
        this.buffers = [];
        this.gains = Array.from({ length: 8 }, () => [0, 0]);
        this.masterGain = 0;
        this.limitGain = 1;
        this.clickPhase = 0;
        this.clickRemaining = 0;
        this.previousClickBeat = -1;
        this.setAssets(assets);
        this.setState(state);
        this.meters = { beat: 0, playing: false, ended: false, tracks: Array.from({ length: 8 }, emptyMeter), master: emptyMeter() };
      }
      setAssets(assets) {
        this.assets = assets instanceof Map ? assets : new Map(Object.entries(assets || {}));
        if (this.tracks) this._compileClips();
      }
      updateAssets(additions, removals = []) {
        for (const id of removals) this.assets.delete(id);
        for (const [id, asset] of additions instanceof Map ? additions : Object.entries(additions || {})) this.assets.set(id, asset);
        if (this.tracks) this._compileClips();
      }
      _compileClips() {
        this.clipLists = this.tracks.map(track => (track.clips || []).map(clip => {
          const asset = this.assets.get(clip.assetId), sr = clamp(asset?.sampleRate, 8000, 192000, 48000), duration = asset?.left?.length / sr || 0;
          const sourceStart = clamp(clip.sourceStart, 0, duration, 0), sourceEnd = clamp(clip.sourceEnd, sourceStart, duration, duration);
          return { start: Number(clip.start) || 0, length: clamp(clip.length, .0001, 256, 1), left: asset?.left, right: asset?.right || asset?.left, sampleRate: sr,
            sourceStart, sourceEnd, span: sourceEnd - sourceStart, sourceOffset: clamp(clip.sourceOffset, 0, 120, 0), rate: clamp(clip.rate, .125, 8, 1), reverse: clip.reverse === true,
            loop: clip.loop === true, gain: clamp(clip.gain, 0, 4, 1), fadeIn: clamp(clip.fadeIn, 0, 32, 0), fadeOut: clamp(clip.fadeOut, 0, 32, 0) };
        }).filter(item => item.left?.length && item.span > 0));
      }
      setState(state) {
        this.state = state || {};
        this.tempo = clamp(this.state.tempo, 40, 240, 120);
        this.tracks = Array.from({ length: 8 }, (_, i) => this.state.tracks?.[i] || { id: `track-${i + 1}`, clips: [], effects: [] });
        this._compileClips();
        this.automation = this.tracks.map(track => {
          const result = { level: null, pan: null, effects: Array.from({ length: 4 }, () => []) };
          for (const lane of track.automation || []) {
            if (lane.enabled === false || !lane.points?.length) continue;
            const compiled = { ...lane, points: lane.points.filter(p => Number.isFinite(p.beat) && Number.isFinite(p.value)).slice().sort((a, b) => a.beat - b.beat) };
            if (!compiled.points.length) continue;
            if (lane.target === 'level' || lane.target === 'pan') result[lane.target] = compiled;
            else {
              const match = /^fx:([0-3]):([a-zA-Z][a-zA-Z0-9]*)$/.exec(lane.target || ''), spec = match && track.effects?.[Number(match[1])];
              if (spec && (!lane.effectType || lane.effectType === spec.type) && typeof spec.params?.[match[2]] === 'number') result.effects[Number(match[1])].push({ key: match[2], lane: compiled });
            }
          }
          return result;
        });
        for (let t = 0; t < 8; t++) for (let s = 0; s < 4; s++) {
          const spec = this.tracks[t].effects?.[s];
          const old = this.slots[t][s];
          if (!spec || typeof spec.type !== 'string') { if (old) old.dsp.reset(); this.slots[t][s] = null; continue; }
          if (old && old.type === spec.type) { old.dsp.setParams(spec.params || {}); old.bypass = spec.bypass === true; old.automationValues = null; }
          else {
            if (old) old.dsp.reset();
            const dsp = effects.create(spec.type, this.sampleRate, spec.params || {});
            this.slots[t][s] = dsp ? { type: spec.type, dsp, bypass: spec.bypass === true } : null;
          }
        }
      }
      get endBeat() { return clamp(this.state.lengthBars, 1, 64, 4) * 4; }
      start(beat = this.beat) { this.seek(beat); this.playing = true; this.silent = false; this.meters = { ...this.meters, beat: this.beat, playing: true, ended: false }; }
      stop() { this.playing = false; this.countInRemaining = 0; this.clickRemaining = 0; this.meters = { ...this.meters, beat: this.beat, playing: false, ended: this.ended, countInBeatsRemaining: 0 }; }
      seek(beat) {
        this.beat = clamp(beat, 0, this.options.linear ? 256 : this.endBeat, 0); this.ended = false; this.previousClickBeat = -1; this.clickRemaining = 0;
        this.transportCycle = 0;
        this.sampleClock = 0;
        if (!this.options.linear) {
          // Discard audio from the previous timeline position, then crossfade the
          // last audible sample into the new position over six milliseconds.
          this.seekOrigin[0] = this.lastOutput[0]; this.seekOrigin[1] = this.lastOutput[1];
          this.seekFadeRemaining = this.playing || Math.abs(this.lastOutput[0]) + Math.abs(this.lastOutput[1]) > 1e-8 ? this.seekFadeFrames : 0;
          for (const row of this.slots) for (const slot of row) if (slot) slot.dsp.reset();
        }
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
      setRecordOnly(index, value) { if (value) this.recordOnly.add(index); else this.recordOnly.delete(index); }
      setMicrophoneMonitor(track, enabled) { this.microphoneMonitor = { track: Number.isInteger(track) && track >= 0 && track < 8 ? track : -1, enabled: enabled === true }; if (enabled) this.silent = false; }
      resumeAudition(index) { this.silent = false; if (Number.isInteger(index)) this.auditionTracks.add(index); }
      clearAudition(index) { if (Number.isInteger(index)) this.auditionTracks.delete(index); else this.auditionTracks.clear(); }
      panic() {
        this.playing = false; this.ended = false; this.silent = true; this.clickRemaining = 0; this.limitGain = 1; this.auditionTracks.clear();
        this.countInRemaining = 0; this.recordingPunch = false;
        this.lastOutput.fill(0); this.seekOrigin.fill(0); this.seekFadeRemaining = 0;
        this.masterGain = 0;
        for (const pair of this.gains) pair.fill(0);
        for (const row of this.slots) for (const slot of row) if (slot) slot.dsp.reset();
        for (const pair of this.buffers) for (const buffer of pair) buffer.fill(0);
        this.meters = { beat: this.beat, playing: false, ended: false, tracks: Array.from({ length: 8 }, emptyMeter), master: emptyMeter() };
      }
      getMeters() {
        return { ...this.meters, effects: this.slots.map((row, track) => row.map((slot, insert) => slot ? { type: slot.type, ...slot.dsp.getMeters(), bypass: slot.bypass || this.tracks[track].effects[insert].params?.bypass === true } : null)) };
      }
      resetEffectMeters(track, insert) {
        const index = indexFor(track, this.tracks);
        if (!Number.isInteger(index) || index < 0 || index >= 8 || !Number.isInteger(insert) || insert < 0 || insert >= 4) return false;
        const slot = this.slots[index][insert];
        if (!slot || slot.type !== 'scales' || typeof slot.dsp.resetMeters !== 'function') return false;
        slot.dsp.resetMeters();
        return true;
      }
      _sample(asset, position, channel) {
        const data = channel ? (asset.right || asset.left) : asset.left;
        if (!data || position < 0 || position >= data.length) return 0;
        const a = Math.floor(position), f = position - a;
        return (data[a] || 0) * (1 - f) + (data[Math.min(a + 1, data.length - 1)] || 0) * f;
      }
      processBlock(left, right, inputs = []) {
        const n = Math.min(left.length, right.length), sr = this.sampleRate;
        left.fill(0); right.fill(0);
        const microphone = inputs[8]; this.microphonePeak = 0;
        if (microphone?.[0]) for (let f = 0; f < n; f++) this.microphonePeak = Math.max(this.microphonePeak, Math.abs(microphone[0][f] || 0), Math.abs((microphone[1] || microphone[0])[f] || 0));
        if (this.silent) { this.meters = { beat: this.beat, playing: false, ended: this.ended, tracks: Array.from({ length: 8 }, emptyMeter), master: emptyMeter() }; return this.meters; }
        if (!this.buffers.length || this.buffers[0][0].length !== n) this.buffers = Array.from({ length: 8 }, () => [new Float32Array(n), new Float32Array(n)]);
        if (!this.timelineBeats || this.timelineBeats.length !== n) { this.timelineBeats = new Float64Array(n); this.timelinePlaying = new Uint8Array(n); this.timelineCountIn = new Uint8Array(n); this.timelineClickBeats = new Float64Array(n); }
        this.countInEnded = false;
        const blockBeat = this.beat, advance = this.tempo / (60 * sr), secondsPerBeat = 60 / this.tempo;
        const anySolo = this.tracks.some(t => t.solo === true), selected = this.options.trackId == null ? -1 : indexFor(this.options.trackId, this.tracks);
        const audible = this.tracks.map((t, i) => !t.mute && (!anySolo || t.solo) && (selected < 0 || i === selected));
        const loopStart = clamp(this.state.loopStart, 0, 255, 0), loopEnd = clamp(this.state.loopEnd, loopStart + .25, 256, 16);
        const loop = !this.options.linear && !this.recordingPunch && this.state.loopEnabled === true;
        const stopAtEnd = !this.options.linear && !loop && !this.recordingHold;
        const sessionEnd = this.endBeat, blockPlaying = this.playing;
        let playingFrames = this.playing ? n : 0;
        const blockEnd = blockBeat + advance * n, wraps = loop && blockEnd >= loopEnd - 1e-10, wholeLoop = loop && advance * n >= loopEnd - loopStart;
        const wrappedEnd = wraps ? loopStart + Math.max(0, blockEnd - loopEnd) % (loopEnd - loopStart) : loopStart;
        const candidates = this.clipLists.map(list => !this.playing ? [] : list.filter(item => {
          const end = item.start + item.length;
          if (wholeLoop) return (item.start < loopEnd && end > loopStart) || (item.start <= blockBeat && end > blockBeat);
          if (wraps) return (item.start < loopEnd && end > blockBeat) || (item.start <= wrappedEnd && end > loopStart) || (item.start <= blockBeat && end > blockBeat);
          return item.start <= blockEnd && end > blockBeat;
        }));
        const minimumFade = .003 / secondsPerBeat;
        for (const list of candidates) for (const item of list) { item.blockFadeIn = Math.min(item.length * .5, Math.max(minimumFade, item.fadeIn)); item.blockFadeOut = Math.min(item.length * .5, Math.max(minimumFade, item.fadeOut)); }
        for (let t = 0; t < 8; t++) {
          const [l, r] = this.buffers[t], input = inputs[t], useInput = (this.tracks[t].instrumentLive !== false || this.tracks[t].notePlayback === true || this.auditionTracks.has(t)) && !this.recordOnly.has(t);
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
          this.timelineBeats[frame] = this.beat;
          this.timelinePlaying[frame] = this.playing ? 1 : 0;
          this.timelineCountIn[frame] = countingIn ? 1 : 0;
          this.timelineClickBeats[frame] = countingIn ? (this.countInTotal - this.countInRemaining) * advance : this.beat;
          if (countingIn) {
            for (let t = 0; t < 8; t++) { this.buffers[t][0][frame] = 0; this.buffers[t][1][frame] = 0; }
            if (--this.countInRemaining === 0) this.countInEnded = true;
            continue;
          }
          if (this.playing && stopAtEnd && this.beat >= sessionEnd - 1e-10) { this.beat = sessionEnd; this.playing = false; this.ended = true; this.clickRemaining = 0; playingFrames = frame; }
          const beat = this.beat;
          if (this.ended) for (let t = 0; t < 8; t++) if (!this.auditionTracks.has(t)) { this.buffers[t][0][frame] = 0; this.buffers[t][1][frame] = 0; }
          if (this.playing) {
            for (let t = 0; t < 8; t++) {
              const [l, r] = this.buffers[t];
              for (const item of candidates[t]) {
                const length = item.length, localBeat = beat - item.start;
                if (localBeat < 0 || localBeat >= length) continue;
                let offset = localBeat * secondsPerBeat * item.rate + item.sourceOffset;
                if (item.loop) offset %= item.span;
                else if (offset >= item.span) continue;
                const position = (item.reverse ? item.sourceEnd - 1 / item.sampleRate - offset : item.sourceStart + offset) * item.sampleRate;
                let gain = item.gain * Math.min(1, localBeat / item.blockFadeIn, (length - localBeat) / item.blockFadeOut);
                if (!item.loop) gain *= Math.min(1, offset / .003, (item.span - offset) / .003);
                l[frame] += this._sample(item, position, 0) * gain;
                r[frame] += this._sample(item, position, 1) * gain;
              }
            }
            this.beat += advance;
            if (loop && this.beat >= loopEnd - 1e-10) { this.beat = loopStart + Math.max(0, this.beat - loopEnd) % (loopEnd - loopStart); this.transportCycle++; }
            else if (stopAtEnd && this.beat >= sessionEnd - 1e-10) { this.beat = sessionEnd; this.playing = false; this.ended = true; this.clickRemaining = 0; playingFrames = frame + 1; }
          }
        }
        // The dry microphone has its own input. Monitoring is mixed into one
        // lane before its rack, independent of native-instrument live controls,
        // and remains available during count-in or stopped practice.
        if (this.microphoneMonitor.enabled && microphone?.[0]) {
          const pair = this.buffers[this.microphoneMonitor.track];
          if (pair) for (let f = 0; f < n; f++) { pair[0][f] += Number.isFinite(microphone[0][f]) ? microphone[0][f] : 0; const v = (microphone[1] || microphone[0])[f]; pair[1][f] += Number.isFinite(v) ? v : 0; }
        }
        const trackMeters = [], slew = 1 - Math.exp(-1 / (.012 * sr));
        for (let t = 0; t < 8; t++) {
          const [l, r] = this.buffers[t], track = this.tracks[t];
          for (let slotIndex = 0; slotIndex < 4; slotIndex++) {
            const slot = this.slots[t][slotIndex];
            if (!slot || slot.bypass) continue;
            const lanes = this.automation[t].effects[slotIndex];
            if (!lanes.length) slot.dsp.process(l, r, { tempo: this.tempo, beat: blockBeat, playing: blockPlaying });
            else for (let start = 0; start < n;) {
              // One fixed 32-sample control clock is shared by live and offline
              // blocks, so exports retain the same automation and DSP history.
              const length = Math.min(n - start, 32 - ((this.sampleClock + start) % 32)), beat = this.timelineBeats[start];
              if ((this.sampleClock + start) % 32 === 0) {
                let changed = !slot.automationValues;
                const values = {};
                for (const { key, lane } of lanes) { values[key] = automationValue(lane, beat, track.effects[slotIndex].params[key]); if (!slot.automationValues || values[key] !== slot.automationValues[key]) changed = true; }
                if (changed) { slot.dsp.setParams({ ...track.effects[slotIndex].params, ...values }); slot.automationValues = values; }
              }
              slot.dsp.process(l.subarray(start, start + length), r.subarray(start, start + length), { tempo: this.tempo, beat, playing: this.timelinePlaying[start] === 1 && this.timelineCountIn[start] === 0 });
              start += length;
            }
          }
          const gain = this.gains[t]; let peak = 0, powerL = 0, powerR = 0;
          for (let f = 0; f < n; f++) {
            const beat = this.timelineBeats[f], pan = clamp(automationValue(this.automation[t].pan, beat, track.pan), -1, 1, 0), level = audible[t] ? clamp(automationValue(this.automation[t].level, beat, track.level), 0, 1.5, .8) : 0;
            const goalL = level * Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2, goalR = level * Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
            gain[0] += (goalL - gain[0]) * slew; gain[1] += (goalR - gain[1]) * slew;
            let a = l[f] * gain[0], b = r[f] * gain[1];
            if (!Number.isFinite(a)) a = 0; if (!Number.isFinite(b)) b = 0;
            left[f] += a; right[f] += b;
            peak = Math.max(peak, Math.abs(a), Math.abs(b)); powerL += a * a; powerR += b * b;
          }
          trackMeters.push({ peak, rms: Math.sqrt((powerL + powerR) / (2 * n)), rmsLeft: Math.sqrt(powerL / n), rmsRight: Math.sqrt(powerR / n) });
        }
        const masterLevel = clamp(this.state.master?.level, 0, 1.5, .8), metronome = this.options.includeMetronome && this.state.master?.metronome && blockPlaying;
        let peak = 0, powerL = 0, powerR = 0;
        for (let f = 0; f < n; f++) {
          this.masterGain += (masterLevel - this.masterGain) * slew;
          let a = left[f] * this.masterGain, b = right[f] * this.masterGain;
          if (this.timelineCountIn[f] || (metronome && this.timelinePlaying[f])) {
            const clickBeat = this.timelineClickBeats[f];
            const integerBeat = Math.floor(clickBeat + 1e-9);
            if (integerBeat !== this.previousClickBeat) { this.previousClickBeat = integerBeat; this.clickRemaining = Math.round(sr * .028); this.clickPhase = 0; this.clickFrequency = integerBeat % 4 === 0 ? 1500 : 1000; }
            if (this.clickRemaining > 0) { const env = this.clickRemaining / (sr * .028), sample = Math.sin(this.clickPhase) * env * env * .12; this.clickPhase += Math.PI * 2 * this.clickFrequency / sr; this.clickRemaining--; a += sample; b += sample; }
          }
          const maximum = Math.max(Math.abs(a), Math.abs(b)), target = maximum > .98 ? .98 / maximum : 1;
          this.limitGain = target < this.limitGain ? target : this.limitGain + (target - this.limitGain) * (1 - Math.exp(-1 / (.08 * sr)));
          a *= this.limitGain; b *= this.limitGain;
          if (this.seekFadeRemaining > 0) {
            const progress = 1 - this.seekFadeRemaining / this.seekFadeFrames, blend = .5 - .5 * Math.cos(Math.PI * progress);
            a = this.seekOrigin[0] * (1 - blend) + a * blend; b = this.seekOrigin[1] * (1 - blend) + b * blend; this.seekFadeRemaining--;
          }
          this.lastOutput[0] = a; this.lastOutput[1] = b;
          left[f] = a; right[f] = b; peak = Math.max(peak, Math.abs(a), Math.abs(b)); powerL += a * a; powerR += b * b;
        }
        this.sampleClock += n;
        this.meters = { beat: this.beat, cycle: this.transportCycle, playing: this.playing, ended: this.ended, microphonePeak: this.microphonePeak, countInBeatsRemaining: this.countInRemaining * advance, tracks: trackMeters, master: { peak, rms: Math.sqrt((powerL + powerR) / (2 * n)), rmsLeft: Math.sqrt(powerL / n), rmsRight: Math.sqrt(powerR / n) } };
        return this.meters;
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
        const mic = inputs[8];
        if (this.active && this.microphone) this._captureMicrophone(inputs, n, timing);
        else {
          this._rememberMicrophone(mic, n);
          if (this.active) this._captureTracks(inputs, n, timing);
        }
      }
      clearMicrophoneHistory() { for (const channel of this.microphoneHistory) channel.fill(0); }
      _rememberMicrophone(input, n) {
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
        const input = inputs[this.microphone.inputIndex ?? 8];
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
    return { Core, Recorder };
  }

  const silenceMeters = beat => ({ beat: beat || 0, playing: false, ended: false, tracks: Array.from({ length: 8 }, () => ({ peak: 0, rms: 0, rmsLeft: 0, rmsRight: 0 })), master: { peak: 0, rms: 0, rmsLeft: 0, rmsRight: 0 } });
  const abortError = () => new DOMException('Export canceled.', 'AbortError');
  // Project files can contain many megabytes of PCM, bundled HTML, and native
  // instrument snapshots. None of those bytes belong in a realtime state update.
  function dspState(state) {
    return {
      tempo: state.tempo, lengthBars: state.lengthBars, loopEnabled: state.loopEnabled, loopStart: state.loopStart, loopEnd: state.loopEnd,
      master: { level: state.master?.level, metronome: state.master?.metronome },
      tracks: Array.from({ length: 8 }, (_, index) => {
        const track = state.tracks?.[index] || {};
        return { id: track.id, level: track.level, pan: track.pan, mute: track.mute, solo: track.solo, instrumentLive: track.instrumentLive, notePlayback: (track.clips || []).some(clip => clip.type === 'notes'),
          automation: (track.automation || []).map(lane => ({ target: lane.target, effectType: lane.effectType, enabled: lane.enabled, interpolation: lane.interpolation, points: (lane.points || []).map(p => ({ beat: p.beat, value: p.value })) })),
          effects: Array.from({ length: 4 }, (_, slot) => { const effect = track.effects?.[slot]; return effect ? { type: effect.type, bypass: effect.bypass, params: { ...effect.params } } : null; }),
          clips: (track.clips || []).map(clip => ({ assetId: clip.assetId, start: clip.start, length: clip.length, sourceStart: clip.sourceStart, sourceEnd: clip.sourceEnd,
            sourceOffset: clip.sourceOffset, rate: clip.rate, reverse: clip.reverse, loop: clip.loop, gain: clip.gain, fadeIn: clip.fadeIn, fadeOut: clip.fadeOut })) };
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
    for (let i = 0; i < left.length; i++) for (const value of [left[i], right[i]]) {
      const sample = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
      view.setInt16(at, Math.round(sample * (sample < 0 ? 32768 : 32767)), true); at += 2;
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
      this.state = state; this.assets = new Map(); this._sentAssets = new Map(); this.context = null; this.node = null; this.core = null; this.mode = 'idle'; this.inputs = [];
      this.generation = 0; this._transportEpoch = 0; this._transportEndedEpoch = -1; this._recordPreparing = false; this._panicLatched = false; this._playRequest = 0; this._recordRequest = 0; this._recordId = 0; this._recordStopId = 0; this._gateId = 0; this._gates = new Map();
      this.isRecording = false; this._chunks = new Map(); this._recordFrames = 0; this._meters = silenceMeters(0); this._recordStartBeat = 0; this._mic = null; this.microphoneInput = null; this._micRequest = 0; this._micEnabled = false; this._micTrack = -1; this._micPending = false; this._micPurpose = null; this._recordMicrophone = null;
      this._recordStage = 'idle'; this._recordTransportStarted = false;
      this._transportListeners = new Set(); this._clockAnchor = { beat: 0, time: 0, cycle: 0, countIn: 0 };
      this._clockConfiguration = Object.fromEntries(['tempo', 'lengthBars', 'loopEnabled', 'loopStart', 'loopEnd'].map(key => [key, state[key]]));
      this._audioSettings = readAudioSettings(); this._processingFrames = 0; this._exportCount = 0; this._audioApplying = false; this._deviceAccessPending = false; this._playPending = 0; this._initializing = false;
      this._sampleRateFallback = false; this._sinkFallback = false; this._devicePermission = 'unknown';
      this._deviceChangeListener = () => this.onStatus?.({ type: 'audio-device-change', diagnostics: this.getAudioDiagnostics() });
      if (typeof navigator !== 'undefined') navigator.mediaDevices?.addEventListener?.('devicechange', this._deviceChangeListener);
    }
    _trackIndex(id) { const i = typeof id === 'number' ? Math.floor(id) : this.state.tracks.findIndex(t => t.id === id); if (!Number.isInteger(i) || i < 0 || i > 7) throw Error('Choose one of the eight tracks.'); return i; }
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
      if (this.recordingBusy) throw Error('Finish the current take before changing the audio interface.');
      if (this._meters.playing || this._playPending) throw Error('Stop playback before changing the audio interface.');
      if (this._exportCount) throw Error('Finish the audio export before changing the audio interface.');
      if (this._audioApplying || this._deviceAccessPending || this._initializing || this._closingAudioGraph) throw Error('Wait for the current audio operation before changing the interface.');
    }
    _createAudioContext(settings) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) throw Error('This browser does not support Web Audio.');
      const options = { latencyHint: AUDIO_PROFILES[settings.latencyProfile].latencyHint, ...(settings.sampleRate !== 'auto' ? { sampleRate: settings.sampleRate } : {}) };
      let context;
      try { context = new AC(options); }
      catch (firstError) {
        // Some browsers accept only named hints or cannot run the requested rate.
        try { context = new AC({ ...options, latencyHint: settings.latencyProfile === 'stable' ? 'balanced' : 'interactive' }); }
        catch { context = new AC({ latencyHint: settings.latencyProfile === 'stable' ? 'balanced' : 'interactive' }); }
      }
      return context;
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
        this.inputs = Array.from({ length: 8 }, () => { const node = this.context.createGain(); node.channelCount = 2; node.channelCountMode = 'explicit'; node.channelInterpretation = 'speakers'; return node; });
        this.microphoneInput = this.context.createGain(); this.microphoneInput.channelCount = 2; this.microphoneInput.channelCountMode = 'explicit'; this.microphoneInput.channelInterpretation = 'speakers';
        const DSP = createLoomEngineDSP(window.createLoomEffectsDSP);
        if (this.context.audioWorklet && window.AudioWorkletNode) {
          let url;
          try {
            const source = `
              const createVocal=${window.createLoomVocalDSP ? window.createLoomVocalDSP.toString() : 'null'};
              const createUtility=${window.createLoomUtilityDSP ? window.createLoomUtilityDSP.toString() : 'null'};
              const createEffects=${window.createLoomEffectsDSP.toString()};
              const createEngine=${createLoomEngineDSP.toString()};
              const DSP=createEngine(()=>createEffects(createVocal,createUtility));
              class LoomProcessor extends AudioWorkletProcessor {
                constructor(options) {
                  super();this.core=new DSP.Core(options.processorOptions.state,{},sampleRate,{includeMetronome:true});this.count=0;this.endedSent=false;this.epoch=options.processorOptions.epoch||0;
                  this.recorder=new DSP.Recorder(sampleRate,m=>this.port.postMessage({type:'chunk',...m},[m.left.buffer,m.right.buffer]),m=>this.port.postMessage({type:m.stopId===undefined?'limit':'recordStopped',...m}));
                  this.port.onmessage=e=>{
                    const m=e.data;if(Number.isInteger(m.epoch))this.epoch=m.epoch;
                    if(m.type==='state')this.core.setState(m.state);
                    else if(m.type==='assets')this.core.setAssets(m.assets);
                    else if(m.type==='assetDelta')this.core.updateAssets(m.additions,m.removals);
                    else if(m.type==='play')this.core.start(m.beat);
                    else if(m.type==='stop')this.core.stop();
                    else if(m.type==='seek')this.core.seek(m.beat);
                    else if(m.type==='recordHold')this.core.setRecordingHold(m.value);
                    else if(m.type==='audition')this.core.resumeAudition(m.track);
                    else if(m.type==='clearAudition')this.core.clearAudition(m.track);
                    else if(m.type==='microphoneMonitor')this.core.setMicrophoneMonitor(m.track,m.enabled);
                    else if(m.type==='microphoneReset')this.recorder.clearMicrophoneHistory();
                    else if(m.type==='resetEffectMeters'){this.core.resetEffectMeters(m.track,m.slot);this.port.postMessage({type:'meters',epoch:this.epoch,contextTime:currentTime,meters:this.core.getMeters()});}
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
                    if(Number.isInteger(m.epoch))this.port.postMessage({type:'clock',epoch:this.epoch,contextTime:currentTime,meters:this.core.getMeters()});
                  };
                }
                process(inputs,outputs) {
                  const out=outputs[0];if(!out||!out[0])return true;const n=out[0].length;
                  this.core.processBlock(out[0],out[1]||out[0],inputs);
                  if(this.core.countInEnded&&this.recorder.active)this.port.postMessage({type:'countInEnd',id:this.recorder.id,startBeat:this.recorder.startBeat});
                  this.recorder.capture(inputs,n,this.core);
                  if(this.core.ended&&!this.endedSent){this.endedSent=true;this.port.postMessage({type:'transportEnded',epoch:this.epoch,contextTime:currentTime+n/sampleRate,meters:this.core.getMeters()});}
                  else if(!this.core.ended)this.endedSent=false;
                  if(++this.count%8===0)this.port.postMessage({type:'meters',epoch:this.epoch,contextTime:currentTime+n/sampleRate,meters:this.core.getMeters(),recordFrames:this.recorder.frames,recordId:this.recorder.id,recording:this.recorder.active,recordStage:this.recorder.stage});
                  return true;
                }
              }
              registerProcessor('loom-eight-track',LoomProcessor);`;
            url = URL.createObjectURL(new Blob([source], { type: 'application/javascript' })); await this.context.audioWorklet.addModule(url);
            this.node = new AudioWorkletNode(this.context, 'loom-eight-track', { numberOfInputs: 9, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', processorOptions: { state: dspState(this.state), epoch: this._transportEpoch } });
            this.node.port.onmessage = e => this._message(e.data);
            for (let i = 0; i < 8; i++) this.inputs[i].connect(this.node, 0, i);
            this.microphoneInput.connect(this.node, 0, 8);
            this.mode = 'worklet';
            this._processingFrames = 128;
          } catch (error) { for (const input of [...this.inputs, this.microphoneInput]) input.disconnect(); this.node = null; this.workletError = error.message; }
          finally { if (url) URL.revokeObjectURL(url); }
        }
        if (!this.node) {
          this.core = new DSP.Core(dspState(this.state), this.assets, this.context.sampleRate, { includeMetronome: true });
          this.recorder = new DSP.Recorder(this.context.sampleRate, m => this._message({ type: 'chunk', ...m }), m => this._message({ type: m.stopId === undefined ? 'limit' : 'recordStopped', ...m }));
          this.node = this.context.createScriptProcessor(AUDIO_PROFILES[this._audioSettings.latencyProfile].fallbackFrames, 18, 2);
          this._processingFrames = this.node.bufferSize || AUDIO_PROFILES[this._audioSettings.latencyProfile].fallbackFrames;
          this.merger = this.context.createChannelMerger(18); this.splitters = [];
          for (let i = 0; i < 9; i++) { const splitter = this.context.createChannelSplitter(2); (i < 8 ? this.inputs[i] : this.microphoneInput).connect(splitter); splitter.connect(this.merger, 0, i * 2); splitter.connect(this.merger, 1, i * 2 + 1); this.splitters.push(splitter); }
          this.merger.connect(this.node);
          this.node.onaudioprocess = e => {
            const inputs = Array.from({ length: 9 }, (_, i) => [e.inputBuffer.getChannelData(i * 2), e.inputBuffer.getChannelData(i * 2 + 1)]);
            this.core.processBlock(e.outputBuffer.getChannelData(0), e.outputBuffer.getChannelData(1), inputs);
            if (this.core.countInEnded && this.recorder.active) this._message({ type: 'countInEnd', id: this.recorder.id, startBeat: this.recorder.startBeat });
            this.recorder.capture(inputs, e.outputBuffer.length, this.core);
            this._recordStage = this.recorder.active ? this.recorder.stage : 'idle';
            this._acceptMeters(this.core.getMeters(), this._transportEpoch, Number.isFinite(e.playbackTime) ? e.playbackTime + e.outputBuffer.length / this.context.sampleRate : this.context.currentTime);
          };
          this.mode = 'fallback';
        }
        this.node.connect(this.context.destination); this._send({ type: 'state', state: dspState(this.state) }); this._send({ type: 'seek', beat: this._meters.beat }); this._updateRecordHold(); this._syncAssets(); if (this._panicLatched) this._send({ type: 'panic' });
        this._initializing = false; this.onStatus?.({ type: 'ready', mode: this.mode, sampleRate: this.context.sampleRate, diagnostics: this.getAudioDiagnostics() });
        return this.context;
      })().catch(error => { this._initializing = false; this._init = null; if (this.context) this.context.close().catch(() => {}); this.context = null; this.node = null; this.core = null; this.mode = 'idle'; this.inputs = []; this.microphoneInput = null; throw error; });
      return this._init;
    }
    getTrackInput(id) { if (this._audioApplying) throw Error('Finish setting up the audio interface before opening an instrument.'); if (!this.inputs.length) throw Error('Initialize GALLEY audio before opening an instrument.'); return this.inputs[this._trackIndex(id)]; }
    _send(m) {
      if (['play', 'stop', 'seek', 'panic', 'recordStart'].includes(m.type)) m = { ...m, epoch: ++this._transportEpoch };
      if (Number.isInteger(m.epoch)) {
        const now = this.context?.currentTime || 0;
        this._clockAnchor = { beat: this._meters.beat || 0, cycle: m.type === 'seek' || m.type === 'play' ? 0 : this._clockAnchor.cycle || 0, time: now, countIn: this._meters.countInBeatsRemaining || 0 };
        this._notifyTransport(m.type);
      }
      if (this.mode === 'worklet') { this.node.port.postMessage(m); return; }
      if (!this.core) return;
      if (m.type === 'state') this.core.setState(m.state);
      else if (m.type === 'assets') this.core.setAssets(m.assets);
      else if (m.type === 'assetDelta') this.core.updateAssets(m.additions, m.removals);
      else if (m.type === 'play') this.core.start(m.beat);
      else if (m.type === 'stop') this.core.stop();
      else if (m.type === 'seek') this.core.seek(m.beat);
      else if (m.type === 'recordHold') this.core.setRecordingHold(m.value);
      else if (m.type === 'audition') this.core.resumeAudition(m.track);
      else if (m.type === 'clearAudition') this.core.clearAudition(m.track);
      else if (m.type === 'microphoneMonitor') this.core.setMicrophoneMonitor(m.track, m.enabled);
      else if (m.type === 'microphoneReset') this.recorder.clearMicrophoneHistory();
      else if (m.type === 'resetEffectMeters') { this.core.resetEffectMeters(m.track, m.slot); this._acceptMeters(this.core.getMeters(), this._transportEpoch, this.context?.currentTime || 0); }
      else if (m.type === 'microphoneEnded') { this.core.setMicrophoneMonitor(-1, false); if (this.recorder.active && this.recorder.microphone) this.recorder._limit('device'); }
      else if (m.type === 'panic') { this.core.panic(); this.recorder.cancel(); }
      else if (m.type === 'recordStart') { this.core.beginRecording(m.schedule); this.recorder.start(m.id, m.tracks, this.core.beat, m.maxFrames, m.schedule); this._message({ type: 'recordStarted', id: m.id, startBeat: this.core.beat }); }
      else if (m.type === 'recordStop') { const meta = this.recorder.stop(m.stopId); this.core.endRecording(); if (!meta.pending) this._message({ type: 'recordStopped', ...meta, stopId: m.stopId }); }
      else if (m.type === 'recordCancel') { this.recorder.cancel(); this.core.endRecording(); }
      else if (m.type === 'gate') { this.core.setRecordOnly(m.track, m.value); this._message({ type: 'gateAck', id: m.id }); }
      if (Number.isInteger(m.epoch)) this._acceptMeters(this.core.getMeters(), m.epoch, this.context?.currentTime || 0);
    }
    _message(m) {
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
      const sessionEnd = Math.max(1, Math.min(64, Number(configuration.lengthBars) || 4)) * 4, endBeat = this.recordingBusy && !this._recordSchedule?.punchEnabled ? 256 : sessionEnd;
      const loopStart = Math.max(0, Number(configuration.loopStart) || 0), loopEnd = Math.min(sessionEnd, Number(configuration.loopEnd) || sessionEnd);
      const loopEnabled = configuration.loopEnabled === true && !(this.isRecording && this._recordSchedule?.punchEnabled), span = Math.max(.25, loopEnd - loopStart);
      const playing = this._meters.playing === true && !this._panicLatched;
      const elapsed = playing ? (atTime - anchor.time) * tempo / 60 : 0, countIn = Math.max(0, anchor.countIn - Math.max(0, elapsed));
      let beat = anchor.beat + (playing ? Math.max(0, elapsed - anchor.countIn) : 0), cycle = anchor.cycle;
      // Worklet anchors refer to the end of a processed block. Interpolation
      // back to currentTime avoids a quantum-sized jump in UI and note timing.
      if (playing && elapsed < 0 && !anchor.countIn) beat = anchor.beat + elapsed;
      if (loopEnabled && cycle > 0 && beat < loopStart) { beat += span; cycle--; }
      if (playing && loopEnabled && beat >= loopEnd) { const wraps = 1 + Math.floor((beat - loopEnd) / span); beat = loopStart + (beat - loopEnd) % span; cycle += wraps; }
      if (!loopEnabled && !this.recordingBusy) beat = Math.min(endBeat, beat);
      beat = Math.max(0, beat);
      return { beat, absoluteBeat: beat + cycle * span, cycle, contextTime: atTime, anchorTime: anchor.time, anchorBeat: anchor.beat, tempo, playing, revision: this._transportEpoch, loopEnabled, loopStart, loopEnd, endBeat, countInBeatsRemaining: countIn, mode: this.mode };
    }
    get recordingBusy() { return Boolean(this.isRecording || this._recordPreparing || this._micPending || this._stopPromise || this._chunks.size); }
    _updateRecordHold() { this._send({ type: 'recordHold', value: this.recordingBusy }); }
    _clampBeat(beat) { return Math.max(0, Math.min(Math.max(1, Math.min(64, Number(this.state.lengthBars) || 4)) * 4, Number(beat) || 0)); }
    setState(state) {
      const old = this._clockConfiguration, changedClock = ['tempo', 'lengthBars', 'loopEnabled', 'loopStart', 'loopEnd'].some(key => old?.[key] !== state?.[key]);
      if (changedClock) this._meters = { ...this._meters, beat: this.getTransport().beat };
      this._clockConfiguration = Object.fromEntries(['tempo', 'lengthBars', 'loopEnabled', 'loopStart', 'loopEnd'].map(key => [key, state[key]]));
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
    async play(fromBeat = this._meters.beat) {
      if (this._audioApplying || this._deviceAccessPending) throw Error('Finish setting up the audio interface before starting playback.');
      this._playPending++;
      try {
        const generation = this.generation, request = ++this._playRequest; await this.init(); if (generation !== this.generation || request !== this._playRequest) return false;
        await this.context.resume(); if (generation !== this.generation || request !== this._playRequest) return false;
        this._panicLatched = false; const beat = this._clampBeat(fromBeat); this._meters = { ...this._meters, beat, playing: true, ended: false }; this._send({ type: 'play', beat }); return true;
      } finally { this._playPending--; }
    }
    stop(options = {}) { if (options.preserveMicrophoneMonitoring !== true) this._disableMicrophoneMonitoring(false, true); this._playRequest++; if (!this.isRecording) this._recordRequest++; this._meters = { ...this._meters, beat: this.getTransport().beat, playing: false }; this._send({ type: 'stop' }); }
    seek(beat) {
      if (this.recordingBusy) throw Error('Finish or cancel the current take before moving the playhead.');
      this._meters = { ...this._meters, beat: this._clampBeat(beat), ended: false }; this._send({ type: 'seek', beat: this._meters.beat }); return this._meters.beat;
    }
    resumeAudition(id) { this._panicLatched = false; this._send({ type: 'audition', track: id == null ? undefined : this._trackIndex(id) }); }
    clearAudition(id) { this._send({ type: 'clearAudition', track: id == null ? undefined : this._trackIndex(id) }); }
    resetEffectMeters(trackId, slot) {
      const track = typeof trackId === 'number' ? Math.floor(trackId) : this.state.tracks.findIndex(item => item.id === trackId);
      if (!Number.isInteger(track) || track < 0 || track >= 8 || !Number.isInteger(slot) || slot < 0 || slot >= 4 || this.state.tracks[track].effects?.[slot]?.type !== 'scales') return false;
      // Analysis holds are runtime state: never resend the project or reset DSP.
      this._send({ type: 'resetEffectMeters', track, slot });
      return true;
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
      if (this._audioApplying || this._deviceAccessPending) throw Error('Finish setting up the audio interface before recording.');
      if (this.isRecording || this._recordPreparing || this._stopPromise || this._chunks.size || (this._micPending && !options._microphone)) return false;
      this._recordPreparing = true; this._updateRecordHold();
      try {
        const generation = this.generation, request = ++this._recordRequest; await this.init(); if (generation !== this.generation || request !== this._recordRequest) return false;
        const tracks = [...new Set((Array.isArray(trackIds) ? trackIds : [trackIds]).map(id => this._trackIndex(id)))]; if (!tracks.length) throw Error('Arm a track before recording.');
        await this.context.resume(); if (generation !== this.generation || request !== this._recordRequest) return false;
        const settings = { ...this.state.recording, ...options }, countInBars = !this._meters.playing && settings.startTransport !== false && [0, 1, 2].includes(settings.countInBars) ? settings.countInBars : 0;
        const punchEnabled = settings.punchEnabled === true, punchStart = this._clampBeat(settings.punchStart), punchEnd = this._clampBeat(settings.punchEnd);
        if (punchEnabled && (punchEnd - punchStart < .25 - 1e-8 || this._meters.beat >= punchEnd - 1e-10 || settings.startTransport === false)) throw Error('Set a punch range ahead of the playhead before recording.');
        const schedule = { countInBeats: countInBars * 4, punchEnabled, punchStart, punchEnd, startTransport: settings.startTransport !== false, requireTransport: settings.startTransport !== false, ...(options._microphone ? { microphone: { inputIndex: 8, compensationFrames: this._recordMicrophone?.compensationFrames || 0 } } : {}) };
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
      const input = this._mic?.stream.getAudioTracks?.()[0]?.getSettings?.().latency;
      const reportedInput = Number.isFinite(input) && input >= 0 && input <= 1;
      const base = Number(c?.baseLatency), output = Number(c?.outputLatency); let outputSeconds = (Number.isFinite(base) && base >= 0 ? base : 0) + (Number.isFinite(output) && output >= 0 ? output : 0);
      let reportedOutput = Number.isFinite(base) && base >= 0 || Number.isFinite(output) && output >= 0;
      try { const stamp = c?.getOutputTimestamp?.(), age = Number.isFinite(stamp?.performanceTime) ? Math.max(0, (performance.now() - stamp.performanceTime) / 1000) : 0, gap = c.currentTime - (stamp.contextTime + age); if (Number.isFinite(gap) && gap >= .001 && gap <= 1) { outputSeconds = gap; reportedOutput = true; } } catch {}
      const processingFrames = this._processingFrames || (this.mode === 'fallback' ? this.node?.bufferSize || AUDIO_PROFILES[this._audioSettings.latencyProfile].fallbackFrames : 128);
      const inputMs = reportedInput ? input * 1000 : 0, outputMs = Math.max(0, Math.min(1000, outputSeconds * 1000)), processingMs = c ? processingFrames / c.sampleRate * 1000 : 0;
      const offset = Math.max(-500, Math.min(500, Number(settings.micOffsetMs) || 0));
      const compensationMs = mode === 'off' ? 0 : mode === 'manual' ? offset : Math.max(-500, Math.min(1000, inputMs + outputMs + processingMs + offset));
      return { mode, compensationMs, inputMs, outputMs, processingMs, reportedInput, reportedOutput, estimated: mode === 'auto', offsetMs: offset };
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
      const track = this._trackIndex(trackId);
      if (this.recordingBusy && (this._micTrack !== track || this._micPending)) throw Error('Finish the current take before changing the microphone track.');
      const generation = this.generation, request = ++this._micRequest;
      if (!await this._acquireMicrophone(track, this._recordMicrophone ? this._mic?.gainDb : options.gainDb ?? this.state.recording?.micInputGainDb ?? 0, 'monitor', generation, request)) return false;
      if (generation !== this.generation || request !== this._micRequest) return false;
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
      if (this._audioApplying || this._deviceAccessPending) throw Error('Finish setting up the audio interface before recording.');
      if (this.isRecording || this._recordPreparing || this._stopPromise || this._chunks.size || this._micPending) return false;
      const track = this._trackIndex(trackId); if (this._micEnabled && this._micTrack !== track) throw Error('Move live microphone monitoring to this track before recording it.');
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
      if (options.trackId != null) { const index = typeof options.trackId === 'number' ? Math.floor(options.trackId) : state.tracks.findIndex(t => t.id === options.trackId); if (!Number.isInteger(index) || index < 0 || index > 7) throw Error('Choose one of the eight tracks for the stem.'); }
      const sr = 48000, start = Math.max(0, Math.min(255.999, Number(options.startBeat) || 0)), end = Math.max(start + .0001, Math.min(256, Number(options.endBeat) || (state.lengthBars || 4) * 4));
      const tempo = Math.max(40, Math.min(240, state.tempo || 120)), main = Math.round((end - start) * 60 / tempo * sr), tail = Math.round(Math.max(0, Math.min(20, Number(options.tailSeconds) || 0)) * sr), total = main + tail;
      if (options.signal?.aborted) throw abortError();
      const DSP = createLoomEngineDSP(window.createLoomEffectsDSP), core = new DSP.Core(dspState(state), assets, sr, { linear: true, includeMetronome: options.includeMetronome === true, trackId: options.trackId });
      core.start(start); const { buffer, view } = makeWavBuffer(total, sr); let at = 0, blocks = 0;
      options.onProgress?.(0);
      while (at < total) {
        if (options.signal?.aborted) throw abortError(); if (at === main) core.stop();
        const count = Math.min(2048, total - at, at < main ? main - at : total - at), left = new Float32Array(count), right = new Float32Array(count);
        core.processBlock(left, right); writePcm(view, at, left, right); at += count;
        if (++blocks % 12 === 0) { options.onProgress?.(at / total); await new Promise(resolve => setTimeout(resolve, 0)); }
      }
      if (options.signal?.aborted) throw abortError(); options.onProgress?.(1); return new Blob([buffer], { type: 'audio/wav' });
      } finally { this._exportCount--; }
    }
    async _closeAudioGraph() {
      if (this._closingAudioGraph) return this._closingAudioGraph;
      this._closingAudioGraph = (async () => {
        if (this.node?.port) { this.node.port.onmessage = null; this.node.port.close?.(); }
        if (this.node) this.node.onaudioprocess = null;
        for (const node of [this.node, this.merger, ...(this.splitters || []), ...this.inputs, this.microphoneInput].filter(Boolean)) try { node.disconnect(); } catch {}
        try { if (this.context && this.context.state !== 'closed') await this.context.close(); }
        finally { this.context = null; this.node = null; this.core = null; this.recorder = null; this.inputs = []; this.microphoneInput = null; this.merger = null; this.splitters = []; this._init = null; this.mode = 'idle'; this._processingFrames = 0; }
      })().finally(() => { this._closingAudioGraph = null; });
      return this._closingAudioGraph;
    }
    async dispose() { this.panic(); this._transportListeners.clear(); if (typeof navigator !== 'undefined') navigator.mediaDevices?.removeEventListener?.('devicechange', this._deviceChangeListener); await this._closeAudioGraph(); }
  }
  window.createLoomEngineDSP = createLoomEngineDSP;
  window.LoomAudio = LoomAudio;
})();
