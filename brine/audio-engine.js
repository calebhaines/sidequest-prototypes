/* BRINE: one sample clock for native phrases, held keys, host notes and prints. */
(function (global) {
  'use strict';

  // This complete scheduler is serialized beside the synthesizer into the
  // Worklet. The same factory renders offline and drives the real fallback.
  function createBrinePlaybackDSP(synthFactory) {
    'use strict';
    const Synth = synthFactory(), MAX_JOBS = 32768, CONTROL_RESERVE = 256, NATIVE = 'brine-native', EPSILON = 1e-8;
    const clone = value => JSON.parse(JSON.stringify(value));
    const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
    const matches = (value, scope) => (scope.source === undefined || value.source === scope.source) && (scope.channel === undefined || value.channel === scope.channel);
    const priority = { panic: 0, cancel: 0, stop: 0, start: 0, transport: 0, state: 1, sustain: 1, bend: 1, wheel: 1, off: 2, on: 2, manualOff: 2, manualOn: 2 };
    const noteJob = type => type === 'on' || type === 'off' || type === 'manualOn' || type === 'manualOff';
    const arpSettings = value => ({ enabled: value?.enabled === true, mode: ['up','down','updown'].includes(value?.mode) ? value.mode : 'up', range: Math.round(Math.max(1, Math.min(3, finite(value?.range, 1)))), rate: Math.max(1.5, Math.min(50, finite(value?.rate, 6))), hold: value?.hold === true });
    function chance(seed, id, cycle) {
      let word = Number.isFinite(seed) ? seed >>> 0 : 0x50524f35; const text = String(id) + ':' + cycle;
      for (let i = 0; i < text.length; i++) { word ^= text.charCodeAt(i); word = Math.imul(word, 16777619); }
      word ^= word >>> 16; word = Math.imul(word, 0x7feb352d); word ^= word >>> 15;
      return (word >>> 0) / 4294967296;
    }
    function phrase(value) {
      const length = Math.max(.25, Math.min(256, finite(value?.lengthBeats, 16))), swing = Math.max(0, Math.min(1, finite(value?.swing, 0)));
      const notes = (Array.isArray(value?.notes) ? value.notes : []).slice(0, 4096).map((note, index) => {
        const grid = note.beat * 4, beat = note.beat + (Math.abs(grid - Math.round(grid)) < EPSILON && Math.round(grid) % 2 ? swing / 4 : 0);
        return { id: String(note.id ?? index), pitch: note.pitch, beat, duration: Math.min(note.duration, length - beat), velocity: finite(note.velocity, .8), probability: finite(note.probability, 1) };
      }).filter(note => Number.isInteger(note.pitch) && note.pitch >= 0 && note.pitch <= 127 && Number.isFinite(note.beat) && note.beat >= 0 && note.beat < length && Number.isFinite(note.duration) && note.duration > 0).sort((a, b) => a.beat - b.beat || a.pitch - b.pitch);
      return { length, seed: finite(value?.seed, 0x50524f35) >>> 0, notes };
    }
    class Core {
      constructor(sampleRate, state = {}, frame = 0) {
        this.sampleRate = Math.max(8000, Math.min(192000, finite(sampleRate, 48000))); this.frame = Math.max(0, Math.round(frame));
        this.state = clone(state); this.synth = new Synth.Core(this.sampleRate, this.state); this.jobs = []; this.serial = 0; this.fences = new Map(); this.noteGenerations = new Map(); this.noteGenerationSerial = 0;
        this.nativePlaying = false; this.nativeOriginFrame = this.frame; this.nativeOriginBeat = 0; this.nativeTempo = finite(state.tempo, 104); this.nativeCycle = 0; this.nativeCursor = 0;
        this.clockPlaying = false; this.clockOriginFrame = this.frame; this.clockOriginBeat = 0; this.clockTempo = this.nativeTempo; this.clockRevision = undefined;
        this.arp = arpSettings(state.arp); this.manualHeld = new Map(); this.manualSerial = 0; this.arpPedals = []; this.arpGlobalPedal = false; this.arpOriginFrame = this.frame; this.arpNextFrame = this.arpGateFrame = Infinity; this.arpStep = this.arpSerial = 0; this.arpCurrent = null; this.arpSequence = []; this.arpSequenceDirty = true;
        this.disposed = false; this.dropped = 0; this.pattern = phrase(state.pattern); this.patternSignature = JSON.stringify(state.pattern || null);
      }
      beatAt(frame = this.frame) { return this.nativeOriginBeat + Math.max(0, frame - this.nativeOriginFrame) * this.nativeTempo / (60 * this.sampleRate); }
      clockBeatAt(frame = this.frame) { return this.clockOriginBeat + (this.clockPlaying ? Math.max(0, frame - this.clockOriginFrame) * this.clockTempo / (60 * this.sampleRate) : 0); }
      _insert(event) {
        if (this.jobs.length >= MAX_JOBS || (event.type === 'on' || event.type === 'manualOn') && this.jobs.length >= MAX_JOBS - CONTROL_RESERVE) { this.dropped++; return false; }
        event.serial = ++this.serial; let low = 0, high = this.jobs.length;
        while (low < high) { const middle = (low + high) >>> 1, other = this.jobs[middle]; if (other.frame < event.frame || other.frame === event.frame && (priority[other.type] < priority[event.type] || priority[other.type] === priority[event.type] && other.serial <= event.serial)) low = middle + 1; else high = middle; }
        this.jobs.splice(low, 0, event); return true;
      }
      enqueue(type, options = {}) {
        if (this.disposed) return false;
        const event = { ...options, type, frame: Math.max(this.frame, Math.round(finite(options.frame, this.frame))) };
        if (type === 'on' || type === 'manualOn') {
          for (const fence of this.fences.values()) if (this.frame < fence.frame && event.frame >= fence.frame && matches(event, fence)) return false;
        }
        if (type === 'cancel') {
          this.jobs = this.jobs.filter(job => !(noteJob(job.type) && job.frame >= event.frame && matches(job, event)));
          if (event.frame <= this.frame) {
            // An immediate newer generation supersedes its own queued cuts;
            // other sources and their scheduled boundaries remain intact.
            this.jobs = this.jobs.filter(job => job.type !== 'cancel' || !matches(job, event));
            for (const [key, fence] of this.fences) if (matches(fence, event)) this.fences.delete(key);
            this._dispatch(event); return true;
          }
          if (event.frame > this.frame) {
            const key = JSON.stringify([event.source ?? null, event.channel ?? null]);
            if (this.fences.size >= 256 && !this.fences.has(key)) return false;
            event.fenceKey = key; const prior = this.fences.get(key); if (!prior || event.frame < prior.frame) this.fences.set(key, event);
          }
        }
        // Panic remains effective even when the bounded note queue is full.
        if (type === 'panic' && event.frame <= this.frame) { this._dispatch(event); return true; }
        const accepted = this._insert(event);
        if (!accepted && event.fenceKey && this.fences.get(event.fenceKey) === event) {
          const next = this.jobs.find(job => job.type === 'cancel' && job.fenceKey === event.fenceKey);
          if (next) this.fences.set(event.fenceKey, next); else this.fences.delete(event.fenceKey);
        }
        return accepted;
      }
      _cursor(beat, skipCurrent = false) {
        this.nativeCycle = Math.max(0, Math.floor(beat / this.pattern.length)); this.nativeCursor = 0;
        const position = beat - this.nativeCycle * this.pattern.length;
        while (this.nativeCursor < this.pattern.notes.length && this.pattern.notes[this.nativeCursor].beat < position + (skipCurrent ? EPSILON : -EPSILON)) this.nativeCursor++;
        if (this.nativeCursor >= this.pattern.notes.length) { this.nativeCursor = 0; this.nativeCycle++; }
      }
      _manualKey(event) { return JSON.stringify([event.source ?? 'keyboard', event.channel ?? 0, String(event.id ?? event.pitch)]); }
      _manualMatches(entry, scope) { return matches(entry, scope) && (scope.id === undefined || entry.id === String(scope.id)) && (scope.pitch === undefined || entry.pitch === scope.pitch); }
      _arpPedal(entry) {
        if (this.arpGlobalPedal) return true;
        let value = false, priority = -1;
        for (const pedal of this.arpPedals) if (matches(entry, pedal)) { const rank = (pedal.source === undefined ? 0 : 2) + (pedal.channel === undefined ? 0 : 1); if (rank >= priority) { value = pedal.down; priority = rank; } }
        return value;
      }
      _arpRelease() {
        if (this.arpCurrent) this.synth.cancelNotes({ source: this.arpCurrent.source, channel: this.arpCurrent.channel, id: this.arpCurrent.id });
        this.arpCurrent = null; this.arpGateFrame = Infinity;
      }
      _arpStop() { this._arpRelease(); this.arpNextFrame = Infinity; }
      _arpStart() { this._arpRelease(); this.arpOriginFrame = this.frame; this.arpStep = 0; this.arpNextFrame = this.frame; }
      _pruneManual() {
        for (const [key, entry] of this.manualHeld) if (!entry.keyDown && !(this.arp.enabled && this.arp.hold) && !this._arpPedal(entry)) { this.manualHeld.delete(key); this.arpSequenceDirty = true; }
        if (this.arp.enabled && !this.manualHeld.size) this._arpStop();
      }
      _manualOn(event) {
        if (event.velocity <= 0) { this._manualOff(event); return; }
        const wasEmpty = !this.manualHeld.size, physicalDown = [...this.manualHeld.values()].some(entry => entry.keyDown);
        if (this.arp.enabled && this.arp.hold && !physicalDown) { this.manualHeld.clear(); this._arpStop(); }
        for (const [key, entry] of this.manualHeld) if (entry.pitch === event.pitch && matches(entry, event)) this.manualHeld.delete(key);
        const key = this._manualKey(event), entry = { id: String(event.id ?? event.pitch), pitch: event.pitch, velocity: event.velocity, source: event.source ?? 'keyboard', channel: event.channel ?? 0, keyDown: true, order: ++this.manualSerial };
        this.manualHeld.set(key, entry); this.arpSequenceDirty = true;
        const maximum = this.arp.enabled ? 6 : 256;
        while (this.manualHeld.size > maximum) { const first = this.manualHeld.keys().next().value, old = this.manualHeld.get(first); this.manualHeld.delete(first); if (!this.arp.enabled) this.synth.cancelNotes({ source: old.source, channel: old.channel, id: old.id }); }
        if (this.arp.enabled) { if (wasEmpty || !Number.isFinite(this.arpNextFrame)) this._arpStart(); }
        else this.synth.noteOn(entry);
      }
      _manualOff(event) {
        for (const entry of this.manualHeld.values()) if (this._manualMatches(entry, event)) entry.keyDown = false;
        if (!this.arp.enabled) this.synth.noteOff(event);
        this._pruneManual();
      }
      _arpSustain(event) {
        if (event.source === undefined && event.channel === undefined) this.arpGlobalPedal = event.down === true;
        else { let pedal = this.arpPedals.find(item => item.source === event.source && item.channel === event.channel); if (!pedal) { if (this.arpPedals.length >= 256) this.arpPedals.shift(); pedal = { source: event.source, channel: event.channel, down: event.down === true }; this.arpPedals.push(pedal); } else pedal.down = event.down === true; }
        this._pruneManual();
      }
      _arpState(raw) {
        const old = this.arp, next = arpSettings(raw); this.arp = next; if (old.range !== next.range || old.enabled !== next.enabled) this.arpSequenceDirty = true;
        if (next.enabled !== old.enabled) {
          this._arpStop(); this._pruneManual();
          if (next.enabled) {
            for (const entry of this.manualHeld.values()) this.synth.cancelNotes({ source: entry.source, channel: entry.channel, id: entry.id });
            while (this.manualHeld.size > 6) this.manualHeld.delete(this.manualHeld.keys().next().value);
            if (this.manualHeld.size) this._arpStart();
          } else {
            for (const entry of this.manualHeld.values()) { this.synth.noteOn(entry); if (!entry.keyDown) this.synth.noteOff(entry); }
          }
        } else {
          this._pruneManual();
          if (next.enabled && old.rate !== next.rate && Number.isFinite(this.arpNextFrame)) {
            const oldPeriod = this.sampleRate / old.rate, newPeriod = this.sampleRate / next.rate;
            this.arpNextFrame = Math.max(this.frame, Math.round(this.frame + (this.arpNextFrame - this.frame) / oldPeriod * newPeriod));
            this.arpOriginFrame = this.arpNextFrame - this.arpStep * newPeriod;
            if (Number.isFinite(this.arpGateFrame)) this.arpGateFrame = Math.max(this.frame, Math.round(this.frame + (this.arpGateFrame - this.frame) / oldPeriod * newPeriod));
          }
        }
      }
      _arpeggio() {
        if (!this.arp.enabled || !this.manualHeld.size) return;
        if (this.arpGateFrame <= this.frame) this._arpRelease();
        if (this.arpNextFrame > this.frame) return;
        this._arpRelease();
        const expanded = this.arpSequence;
        if (this.arpSequenceDirty) {
          const notes = [...this.manualHeld.values()].sort((a, b) => a.pitch - b.pitch || a.order - b.order); expanded.length = 0;
          for (let octave = 0; octave < this.arp.range; octave++) for (const entry of notes) if (entry.pitch + octave * 12 <= 127) expanded.push({ entry, pitch: entry.pitch + octave * 12 });
          expanded.sort((a, b) => a.pitch - b.pitch || a.entry.order - b.entry.order); this.arpSequenceDirty = false;
        }
        if (!expanded.length) { this._arpStop(); return; }
        const length = expanded.length, turn = length < 2 ? 0 : this.arpStep % (length * 2 - 2), index = this.arp.mode === 'down' ? length - 1 - this.arpStep % length : this.arp.mode === 'updown' ? (turn < length ? turn : length * 2 - 2 - turn) : this.arpStep % length, chosen = expanded[index];
        const event = { id: '@brine-arp-' + ++this.arpSerial, pitch: chosen.pitch, velocity: chosen.entry.velocity, source: chosen.entry.source, channel: chosen.entry.channel };
        this.synth.noteOn(event); this.arpCurrent = event;
        const period = this.sampleRate / this.arp.rate;
        this.arpGateFrame = Math.max(this.frame + 1, Math.round(this.arpOriginFrame + (this.arpStep + .5) * period));
        this.arpNextFrame = Math.max(this.frame + 1, Math.round(this.arpOriginFrame + ++this.arpStep * period));
      }
      _cancel(scope) {
        this.jobs = this.jobs.filter(job => !(noteJob(job.type) && matches(job, scope)));
        for (const [key, entry] of this.manualHeld) if (this._manualMatches(entry, scope)) { this.manualHeld.delete(key); this.arpSequenceDirty = true; }
        if (this.arpCurrent && matches(this.arpCurrent, scope)) { this.arpCurrent = null; this.arpGateFrame = Infinity; }
        if (!this.manualHeld.size) this._arpStop();
        for (const [key, entry] of this.noteGenerations) if (matches(entry, scope)) this.noteGenerations.delete(key);
        this.synth.cancelNotes(scope);
      }
      _start(event) {
        this._cancel({ source: NATIVE }); this.nativePlaying = true; this.nativeOriginBeat = event.beat || 0; this.nativeOriginFrame = event.frame;
        this.nativeTempo = finite(this.state.tempo, this.nativeTempo); this._cursor(this.nativeOriginBeat);
      }
      _stop() {
        const beat = this.beatAt(); this._cancel({ source: NATIVE }); this.nativePlaying = false; this.nativeOriginBeat = beat; this.nativeOriginFrame = this.frame;
      }
      _state(patch) {
        const beat = this.beatAt(), oldTempo = this.nativeTempo, next = { ...this.state, ...clone(patch) }, signature = patch.pattern === undefined ? this.patternSignature : JSON.stringify(next.pattern || null), changedPattern = signature !== this.patternSignature;
        this.state = next; if (patch.arp !== undefined) this._arpState(next.arp); this.nativeTempo = finite(next.tempo, this.nativeTempo);
        if (patch.synth !== undefined || patch.tempo !== undefined) this.synth.setState(this.state);
        if (changedPattern) { this.pattern = phrase(next.pattern); this.patternSignature = signature; }
        if (this.nativePlaying && (changedPattern || oldTempo !== this.nativeTempo)) {
          this._cancel({ source: NATIVE }); this.nativeOriginBeat = beat; this.nativeOriginFrame = this.frame; this._cursor(beat);
        }
      }
      _transport(event) {
        const oldPredicted = this.clockBeatAt(event.frame), seek = this.clockRevision !== event.revision || Math.abs(oldPredicted - event.beat) > .03;
        this.clockOriginBeat = event.beat; this.clockOriginFrame = event.frame; this.clockTempo = event.tempo; this.clockPlaying = event.playing; this.clockRevision = event.revision;
        const tempoChanged = this.state.tempo !== event.tempo;
        if (tempoChanged) { this.state = { ...this.state, tempo: event.tempo }; this.nativeTempo = event.tempo; this.synth.setState(this.state); }
        if (!event.playing) this._stop();
        else if (this.nativePlaying && (seek || tempoChanged)) this._start({ beat: event.beat, frame: event.frame });
      }
      _dispatch(event) {
        if (event.type === 'on' || event.type === 'manualOn') {
          if (event.velocity <= 0) return;
          const manual = event.type === 'manualOn', key = JSON.stringify([manual, event.source ?? 'keyboard', event.channel ?? 0, String(event.id ?? event.pitch)]);
          if (!this.noteGenerations.has(key) && this.noteGenerations.size >= MAX_JOBS) { this.dropped++; return; }
          const generation = ++this.noteGenerationSerial; this.noteGenerations.set(key, { generation, source: event.source, channel: event.channel });
          if (manual) this._manualOn(event); else this.synth.noteOn(event);
          if (Number.isFinite(event.durationFrames)) this._insert({ type: manual ? 'manualOff' : 'off', frame: event.frame + Math.max(1, Math.round(event.durationFrames)), id: event.id, pitch: event.pitch, source: event.source, channel: event.channel, generation, generationKey: key });
        } else if (event.type === 'off' || event.type === 'manualOff') {
          const manual = event.type === 'manualOff', key = event.generationKey ?? JSON.stringify([manual, event.source ?? 'keyboard', event.channel ?? 0, String(event.id ?? event.pitch)]);
          if (event.generation !== undefined && this.noteGenerations.get(key)?.generation !== event.generation) return;
          this.noteGenerations.delete(key); if (manual) this._manualOff(event); else this.synth.noteOff(event);
        }
        else if (event.type === 'sustain') { this.synth.sustain(event); this._arpSustain(event); }
        else if (event.type === 'bend') this.synth.pitchBend(event);
        else if (event.type === 'wheel') this.synth.modWheel(event);
        else if (event.type === 'cancel') {
          this._cancel(event);
          if (event.fenceKey && this.fences.get(event.fenceKey) === event) {
            const next = this.jobs.find(job => job.type === 'cancel' && job.fenceKey === event.fenceKey);
            if (next) this.fences.set(event.fenceKey, next); else this.fences.delete(event.fenceKey);
          }
        }
        else if (event.type === 'state') this._state(event.state);
        else if (event.type === 'start') this._start(event);
        else if (event.type === 'stop') this._stop();
        else if (event.type === 'transport') this._transport(event);
        else if (event.type === 'panic') { this.jobs.length = 0; this.fences.clear(); this.noteGenerations.clear(); this.nativePlaying = this.clockPlaying = false; this.manualHeld.clear(); this.arpSequence.length = 0; this.arpSequenceDirty = true; this.arpPedals.length = 0; this.arpGlobalPedal = false; this.arpCurrent = null; this.arpNextFrame = this.arpGateFrame = Infinity; this.synth.panic(); }
      }
      _native(endFrame) {
        if (!this.nativePlaying || !this.pattern.notes.length) return;
        let count = 0;
        while (count++ < 8192) {
          const note = this.pattern.notes[this.nativeCursor], beat = this.nativeCycle * this.pattern.length + note.beat;
          const frame = Math.round(this.nativeOriginFrame + (beat - this.nativeOriginBeat) * 60 / this.nativeTempo * this.sampleRate);
          if (frame >= endFrame) break;
          if (frame >= this.frame && note.velocity > 0 && chance(this.pattern.seed, note.id, this.nativeCycle) < note.probability) this._insert({ type: 'on', frame, id: NATIVE + ':' + this.nativeCycle + ':' + note.id, pitch: note.pitch, velocity: note.velocity, source: NATIVE, channel: 0, durationFrames: Math.round(note.duration * 60 / this.nativeTempo * this.sampleRate) });
          if (++this.nativeCursor >= this.pattern.notes.length) { this.nativeCursor = 0; this.nativeCycle++; }
        }
      }
      process(left, right) {
        if (this.disposed) { left.fill(0); right.fill(0); return false; }
        const endFrame = this.frame + left.length; let at = 0;
        while (this.frame < endFrame) {
          while (this.jobs.length && this.jobs[0].frame <= this.frame) this._dispatch(this.jobs.shift());
          this._native(endFrame); this._arpeggio();
          if (this.jobs[0]?.frame <= this.frame) continue;
          const end = Math.min(endFrame, this.jobs[0]?.frame ?? endFrame, this.arpNextFrame, this.arpGateFrame), count = end - this.frame;
          this.synth.process(left.subarray(at, at + count), right.subarray(at, at + count)); at += count; this.frame = end;
        }
        return true;
      }
      getMeters() {
        const value = this.synth.getMeters(), states = value.voiceStates || (Array.isArray(value.voices) ? value.voices : []);
        return { ...value, voices: Number.isFinite(value.voices) ? value.voices : states.filter(voice => voice.active).length, voiceStates: states, voiceLimit: 6, frame: this.frame, beat: this.nativePlaying ? this.beatAt() : this.clockPlaying ? this.clockBeatAt() : this.nativeOriginBeat, playing: this.nativePlaying, arpPlaying: this.arp.enabled && this.manualHeld.size > 0, arpNotes: [...this.manualHeld.values()].map(note => note.pitch), arpStep: this.arpStep, clockPlaying: this.clockPlaying, queued: this.jobs.length, dropped: this.dropped };
      }
      dispose() { this.disposed = true; }
    }
    return { Core, chance, phrase, arpSettings, MAX_JOBS };
  }

  const copy = value => JSON.parse(JSON.stringify(value));
  const MAX_HELD = 2048, MAX_CONTROL_STATES = 768;
  const validate = (value, name, low, high) => { if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) throw Error('Choose a valid ' + name + '.'); return value; };
  const validChannel = value => { validate(value, 'MIDI channel', 0, 15); if (!Number.isInteger(value)) throw Error('Choose a whole MIDI channel.'); return value; };
  const sourceName = value => { if (typeof value !== 'string' || !value || value.length > 200) throw Error('Choose a valid note source.'); return value; };
  const canceled = signal => { if (signal?.aborted) throw new DOMException('BRINE rendering cancelled.', 'AbortError'); };
  const normalize = state => { if (!global.BrineSchema) throw Error('BRINE project controls have not loaded.'); return global.BrineSchema.normalize(state); };
  const emptyMeters = () => ({ voices: 0, voiceLimit: 6, voiceStates: Array.from({ length: 6 }, () => ({ active: false, pitch: null, level: 0, gate: false })), peak: 0, rms: 0, beat: 0, playing: false, stolen: 0 });
  const tailModel = typeof global.createBrineDSP === 'function' ? global.createBrineDSP() : null;
  const autoTail = state => Math.min(30, Math.max(.1, tailModel?.estimateTail ? tailModel.estimateTail(state) : (state.synth.ampMode === 'gate' ? .02 : state.synth.envRelease * 2.5) + (state.synth.chorus === 'off' ? .1 : .35)));
  function playback() { if (typeof global.createBrineDSP !== 'function') throw Error('BRINE synthesis has not loaded.'); return createBrinePlaybackDSP(global.createBrineDSP); }
  function processorSource() {
    return 'const createSynth=' + global.createBrineDSP.toString() + ';\nconst createPlayback=' + createBrinePlaybackDSP.toString() + ';\nconst Playback=createPlayback(createSynth);\n' + `
      class BrineProcessor extends AudioWorkletProcessor {
        constructor(options){super();this.core=new Playback.Core(sampleRate,options.processorOptions.state,currentFrame);this.port.onmessage=event=>{const m=event.data;if(m.type==='dispose'){this.core.dispose();return;}if(this.core.disposed)return;try{if(m.type==='meters')this.port.postMessage({type:'meters',meters:this.core.getMeters()});else if(!this.core.enqueue(m.type,m.options))this.port.postMessage({type:'error',message:'BRINE’s scheduled event limit has been reached.'});}catch(error){this.port.postMessage({type:'error',message:error.message});}};}
        process(inputs,outputs){const output=outputs[0];if(!output?.[0])return !this.core.disposed;return this.core.process(output[0],output[1]||output[0]);}
      }
      registerProcessor('brine-six-voice-v1',BrineProcessor);`;
  }
  function wavBlob(pcm, frames, sampleRate) {
    const buffer = new ArrayBuffer(44 + frames * 4), view = new DataView(buffer);
    const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
    text(0, 'RIFF'); view.setUint32(4, 36 + frames * 4, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, frames * 4, true);
    for (let i = 0; i < pcm.length; i++) { const sample = Math.max(-1, Math.min(1, Number.isFinite(pcm[i]) ? pcm[i] : 0)); view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true); }
    return new Blob([buffer], { type: 'audio/wav' });
  }
  class BrineAudio {
    constructor(state) {
      this.state = normalize(state); this.context = null; this.node = null; this.core = null; this.mode = 'idle'; this.isPlaying = false; this._disposed = false; this._ownsContext = true;
      this._initPromise = null; this._generation = 0; this._serial = 0; this._meterPending = false; this._meterAt = -Infinity; this._meters = emptyMeters(); this._held = new Map(); this._keyboardChord = []; this._controllers = new Map(); this.workletError = null;
      this._stateSignatures = { synth: JSON.stringify(this.state.synth), pattern: JSON.stringify(this.state.pattern), arp: JSON.stringify(this.state.arp), tempo: this.state.tempo };
    }
    get latencySeconds() { return this.mode === 'fallback' && this.context ? this.node.bufferSize / this.context.sampleRate : 0; }
    async init() {
      if (this._disposed) throw Error('This BRINE engine has been closed.');
      if (this.node && this.context?.state !== 'closed') { if (this.context.state === 'suspended') await this.context.resume(); return this; }
      if (this.context?.state === 'closed') {
        if (this.node?.port) { this.node.port.onmessage = null; this.node.port.close(); }
        try { this.node?.disconnect(); } catch (_) {}
        this.node = this.core = this.context = null; this._initPromise = null; this.mode = 'idle'; this.isPlaying = false; this._ownsContext = true; this._held.clear(); this._keyboardChord.length = 0; this._meterPending = false; this._meterAt = -Infinity; this._meters = emptyMeters();
      }
      if (this._initPromise) return this._initPromise;
      this._initPromise = (async () => {
        const Context = global.AudioContext || global.webkitAudioContext; if (!Context) throw Error('This browser does not support Web Audio.');
        if (global.MusicLabHost?.createAudioContext) this.context = global.MusicLabHost.createAudioContext();
        else if (global.MusicLabHost?.context) { this.context = global.MusicLabHost.context; this._ownsContext = false; }
        else { try { this.context = new Context({ latencyHint: 'interactive', sampleRate: 48000 }); } catch (error) { if (error?.name !== 'NotSupportedError') throw error; this.context = new Context({ latencyHint: 'interactive' }); } }
        const context = this.context; let url;
        if (context.audioWorklet && global.AudioWorkletNode) {
          try {
            url = URL.createObjectURL(new Blob([processorSource()], { type: 'application/javascript' })); await context.audioWorklet.addModule(url);
            if (this._disposed) throw Error('This BRINE engine has been closed.');
            this.node = new global.AudioWorkletNode(context, 'brine-six-voice-v1', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { state: this.state } }); this.mode = 'worklet';
            this.node.port.onmessage = event => { if (event.data.type === 'meters') { this._meters = event.data.meters; this._meterPending = false; } else if (event.data.type === 'error') this.onStatus?.(event.data.message); };
          } catch (error) { if (this._disposed) throw error; this.workletError = error?.message || String(error); this.node?.disconnect(); this.node = null; }
          finally { if (url) URL.revokeObjectURL(url); }
        }
        if (!this.node) {
          if (!context.createScriptProcessor) throw Error('This browser cannot run BRINE audio.');
          this.core = new (playback().Core)(context.sampleRate, this.state, Math.round(context.currentTime * context.sampleRate));
          this.node = context.createScriptProcessor(256, 0, 2); this.mode = 'fallback';
          this.node.onaudioprocess = event => {
            const left = event.outputBuffer.getChannelData(0), right = event.outputBuffer.getChannelData(1);
            if (this._disposed) { left.fill(0); right.fill(0); return; }
            this.core.frame = Math.round((Number.isFinite(event.playbackTime) ? event.playbackTime : context.currentTime) * context.sampleRate);
            this.core.process(left, right);
          };
        }
        if (this._disposed) throw Error('This BRINE engine has been closed.');
        this.node.connect(context.destination);
        for (const value of this._controllers.values()) this._send(value.type, { ...value.options, frame: this._frame() });
        if (context.state === 'suspended') await context.resume(); return this;
      })().catch(async error => {
        this.node?.disconnect(); this.node = null; this.core = null; if (this._ownsContext && this.context?.state !== 'closed') await this.context?.close().catch(() => {}); this.context = null; this._initPromise = null; this.mode = 'idle'; throw error;
      });
      return this._initPromise;
    }
    prepare() { return this.init(); }
    _ready() { return !this._disposed && !!this.node && !!this.context && this.context.state !== 'closed'; }
    _frame(when) {
      if (!this._ready()) throw Error('Prepare BRINE before playing notes.');
      if (when !== undefined) validate(when, 'note time', 0, Number.MAX_SAFE_INTEGER);
      return Math.round(Math.max(this.context.currentTime, when ?? this.context.currentTime) * this.context.sampleRate);
    }
    _send(type, options = {}) {
      if (!this._ready()) return false;
      if (this.mode === 'worklet') { this.node.port.postMessage({ type, options }); return true; }
      return this.core.enqueue(type, options);
    }
    setState(state) {
      this.state = normalize(state); const patch = {}, signatures = { synth: JSON.stringify(this.state.synth), pattern: JSON.stringify(this.state.pattern), arp: JSON.stringify(this.state.arp), tempo: this.state.tempo };
      for (const key of ['synth', 'pattern', 'arp', 'tempo']) if (this._stateSignatures[key] !== signatures[key]) patch[key] = this.state[key];
      this._stateSignatures = signatures;
      if (Object.keys(patch).length && this._ready()) this._send('state', { state: patch, frame: this._frame() }); this._syncGlobalWheel(this.state.synth.modWheel); this._pruneKeyboardChord(); return this.state;
    }
    _syncGlobalWheel(value) {
      const key = JSON.stringify(['wheel', null, null]), previous = this._controllers.get(key);
      if (previous && previous.options.value !== value) {
        this._controllers.set(key, { type: 'wheel', options: { value } });
        if (this._ready()) this._send('wheel', { value, frame: this._frame() });
      }
    }
    setSynth(patch) {
      const synth = global.BrineSchema.normalizeSynth({ ...this.state.synth, ...patch }), signature = JSON.stringify(synth);
      this.state = { ...this.state, synth };
      if (signature !== this._stateSignatures.synth) {
        this._stateSignatures.synth = signature;
        if (this._ready()) this._send('state', { state: { synth }, frame: this._frame() });
      }
      this._syncGlobalWheel(synth.modWheel); return synth;
    }
    _keyboardPedal(entry) {
      let down = false, priority = -1;
      for (const { type, options } of this._controllers.values()) if (type === 'sustain') {
        if (options.source === undefined && options.channel === undefined && options.down) return true;
        if ((options.source === undefined || options.source === entry.source) && (options.channel === undefined || options.channel === entry.channel)) { const rank = (options.source === undefined ? 0 : 2) + (options.channel === undefined ? 0 : 1); if (rank >= priority) { down = options.down; priority = rank; } }
      }
      return down;
    }
    _pruneKeyboardChord() { this._keyboardChord = this._keyboardChord.filter(entry => entry.keyDown || this.state.arp.enabled && (this.state.arp.hold || this._keyboardPedal(entry))).slice(-6); }
    getKeyboardChord() { const selected = this.state.arp.enabled && this._keyboardChord.length ? this._keyboardChord : [...this._held.values()].slice(-6); return [...new Set(selected.map(note => note.pitch))].slice(0, 6); }
    noteOn({ id, pitch = 60, note = pitch, velocity = .85, when, source = 'keyboard', channel = 0 } = {}) {
      validate(note, 'MIDI pitch', 0, 127); if (!Number.isInteger(note)) throw Error('Choose a whole MIDI pitch.'); validate(velocity, 'velocity', 0, 1); validChannel(channel); sourceName(source);
      const suppliedId = id;
      id = id === undefined ? 'brine-key-' + ++this._serial : sourceName(id);
      if (velocity === 0) { this.noteOff({ ...(suppliedId === undefined ? {} : { id }), pitch: note, source, channel, when }); return id; }
      const heldKey = JSON.stringify([source, channel, id]);
      if (!this._held.has(heldKey) && this._held.size >= MAX_HELD) throw Error('BRINE’s held-note input limit has been reached. Release notes or press Panic.');
      const whenFrame = this._frame(when);
      if (this.state.arp.enabled && this.state.arp.hold && !this._held.size) this._keyboardChord.length = 0;
      this._keyboardChord = this._keyboardChord.filter(entry => !(entry.id === id && entry.source === source && entry.channel === channel) && !(entry.pitch === note && entry.source === source && entry.channel === channel));
      this._keyboardChord.push({ id, pitch: note, source, channel, keyDown: true }); this._keyboardChord = this._keyboardChord.slice(-6);
      const options = { id, pitch: note, velocity, source, channel, frame: whenFrame }; this._send('manualOn', options);
      this._held.set(heldKey, { id, pitch: note, source, channel }); return id;
    }
    noteOff(value = {}, options = {}) {
      const event = typeof value === 'string' ? { ...options, id: value } : value;
      if (event.id !== undefined) sourceName(event.id); if (event.source !== undefined) sourceName(event.source);
      if (event.pitch !== undefined) validate(event.pitch, 'MIDI pitch', 0, 127); if (event.channel !== undefined) validChannel(event.channel);
      if (event.id === undefined && event.pitch === undefined) throw Error('Choose the note to release.');
      for (const note of this._keyboardChord) if ((event.id === undefined || note.id === event.id) && (event.pitch === undefined || note.pitch === event.pitch) && (event.source === undefined || note.source === event.source) && (event.channel === undefined || note.channel === event.channel)) note.keyDown = false;
      this._pruneKeyboardChord();
      for (const [key, note] of this._held) if ((event.id === undefined || note.id === event.id) && (event.pitch === undefined || note.pitch === event.pitch) && (event.source === undefined || note.source === event.source) && (event.channel === undefined || note.channel === event.channel)) this._held.delete(key);
      if (!this._ready()) return false;
      return this._send('manualOff', { ...event, frame: this._frame(event.when) });
    }
    scheduleNote({ id, pitch = 60, note = pitch, velocity = .85, when, durationSeconds = .4, source = 'brine-live', channel = 0 } = {}) {
      validate(note, 'MIDI pitch', 0, 127); if (!Number.isInteger(note)) throw Error('Choose a whole MIDI pitch.'); validate(velocity, 'velocity', 0, 1); validate(durationSeconds, 'note duration', .000001, 768); sourceName(source); validChannel(channel);
      id = id === undefined ? 'brine-note-' + ++this._serial : sourceName(id);
      return this._send('on', { id, pitch: note, velocity, source, channel, frame: this._frame(when), durationFrames: Math.max(1, Math.round(durationSeconds * this.context.sampleRate)) });
    }
    _control(type, value, options = {}) {
      if (options.source !== undefined) sourceName(options.source); if (options.channel !== undefined) validChannel(options.channel);
      if (options.when !== undefined) validate(options.when, 'controller time', 0, Number.MAX_SAFE_INTEGER);
      if (this._disposed) return false;
      const key = JSON.stringify([type, options.source ?? null, options.channel ?? null]);
      if (!this._controllers.has(key) && this._controllers.size >= MAX_CONTROL_STATES) throw Error('BRINE’s controller input limit has been reached. Press Panic to clear old input states.');
      const values = { ...(options.source === undefined ? {} : { source: options.source }), ...(options.channel === undefined ? {} : { channel: options.channel }), ...(type === 'sustain' ? { down: !!value } : { value }) };
      this._controllers.set(key, { type, options: values }); if (type === 'sustain') this._pruneKeyboardChord();
      if (!this._ready()) return true;
      return this._send(type, { ...values, frame: this._frame(options.when) });
    }
    setSustain(down, options = {}) { return this._control('sustain', down, options); }
    setPitchBend(value, options = {}) { validate(value, 'pitch wheel', -1, 1); return this._control('bend', value, options); }
    setModWheel(value, options = {}) { validate(value, 'modulation wheel', 0, 1); if (options.source === undefined && options.channel === undefined && this.state.synth.modWheel !== value) this.setSynth({ modWheel: value }); return this._control('wheel', value, options); }
    cancelNotes({ source, channel, when, immediate = false } = {}) {
      if (source !== undefined) sourceName(source); if (channel !== undefined) validChannel(channel);
      for (const [id, note] of this._held) if ((source === undefined || note.source === source) && (channel === undefined || note.channel === channel)) this._held.delete(id);
      this._keyboardChord = this._keyboardChord.filter(note => !((source === undefined || note.source === source) && (channel === undefined || note.channel === channel)));
      if (!this._ready()) return false;
      return this._send('cancel', { source, channel, immediate, frame: this._frame(when) });
    }
    stopNotes(options) { return this.cancelNotes(options); }
    async start({ when, beat = 0 } = {}) {
      validate(beat, 'start beat', 0, 1000000); if (when !== undefined) validate(when, 'start time', 0, Number.MAX_SAFE_INTEGER);
      const generation = ++this._generation; await this.init(); if (this._disposed || generation !== this._generation) return false;
      this.isPlaying = true; return this._send('start', { beat, frame: this._frame(when) });
    }
    play(options) { return this.start(options); }
    stop() { this._generation++; this.isPlaying = false; if (this._ready()) this._send('stop', { frame: this._frame() }); else if (this.context?.state === 'closed') this._held.clear(); }
    panic() { this._generation++; this.isPlaying = false; this._held.clear(); this._keyboardChord.length = 0; this._controllers.clear(); if (this._ready()) this._send('panic', { frame: this._frame() }); this._meters = emptyMeters(); }
    followTransport(clock = {}) {
      const beat = clock.beat ?? clock.absoluteBeat ?? 0, tempo = clock.tempo ?? clock.bpm ?? this.state.tempo;
      validate(beat, 'transport beat', 0, 1000000); validate(tempo, 'transport tempo', 5, 1920);
      if (clock.playing === false) this.isPlaying = false; if (!this._ready()) return false;
      return this._send('transport', { beat, tempo, playing: clock.playing !== false, revision: clock.revision, frame: this._frame(clock.when ?? clock.contextTime ?? clock.time) });
    }
    getMeters() {
      if (this._ready()) {
        if (this.mode === 'fallback') this._meters = this.core.getMeters();
        else if (!this._meterPending && this.context.currentTime >= this._meterAt) { this._meterPending = true; this._meterAt = this.context.currentTime + .08; this.node.port.postMessage({ type: 'meters' }); }
      }
      return { ...this._meters, mode: this.mode, latencySeconds: this.latencySeconds, playing: this.isPlaying };
    }
    async renderNotes({ state = this.state, events, pattern, tempo, lengthBeats, tailSeconds, sampleRate = 48000, signal, includePCM = false, name, keyboardArp = false } = {}) {
      canceled(signal); if (typeof keyboardArp !== 'boolean') throw Error('Choose a valid keyboard arpeggiator render mode.'); const snapshot = normalize(state); tempo = tempo ?? snapshot.tempo; tailSeconds = tailSeconds ?? autoTail(snapshot); validate(tempo, 'render tempo', 5, 1920); validate(lengthBeats, 'phrase length', .000001, 4096); validate(tailSeconds, 'tail length', 0, 30); validate(sampleRate, 'sample rate', 8000, 192000);
      if (!Number.isInteger(sampleRate)) throw Error('Choose a whole sample rate.'); const seconds = lengthBeats * 60 / tempo;
      if (seconds + tailSeconds > 120) throw Error('Split this phrase into parts no longer than 120 seconds including the tail.');
      if (events !== undefined && (!Array.isArray(events) || events.length > 16384)) throw Error('Provide a bounded note list.');
      snapshot.tempo = tempo; if (pattern) snapshot.pattern = global.MusicLabPatternSchema.parse(pattern);
      const core = new (playback().Core)(sampleRate, snapshot), frames = Math.max(1, Math.ceil((seconds + tailSeconds) * sampleRate)), pcm = new Float32Array(frames * 2), bodyFrame = Math.round(seconds * sampleRate);
      if (events === undefined) core.enqueue('start', { beat: 0, frame: 0 });
      else for (let index = 0; index < events.length; index++) {
        const event = events[index], pitch = event.pitch ?? event.note, beat = event.beat ?? event.startBeat, duration = event.durationBeats ?? event.duration;
        validate(pitch, 'rendered MIDI pitch', 0, 127); if (!Number.isInteger(pitch)) throw Error('Choose a whole rendered MIDI pitch.'); validate(beat, 'rendered note start', 0, lengthBeats); validate(duration, 'rendered note duration', .000001, 4096); validate(event.velocity ?? .8, 'rendered velocity', 0, 1);
        if (beat >= lengthBeats) continue;
        core.enqueue(keyboardArp ? 'manualOn' : 'on', { id: String(event.id ?? 'render-' + index), pitch, velocity: event.velocity ?? .8, source: 'brine-render', channel: 0, frame: Math.round(beat * 60 / tempo * sampleRate), durationFrames: Math.max(1, Math.round(Math.min(duration, lengthBeats - beat) * 60 / tempo * sampleRate)) });
      }
      if (events === undefined) core.enqueue('stop', { frame: bodyFrame }); else core.enqueue('cancel', { source: 'brine-render', frame: bodyFrame });
      const left = new Float32Array(2048), right = new Float32Array(2048);
      for (let at = 0, blocks = 0; at < frames; at += 2048) {
        canceled(signal); const count = Math.min(2048, frames - at), l = left.subarray(0, count), r = right.subarray(0, count); core.process(l, r);
        for (let i = 0; i < count; i++) { pcm[(at + i) * 2] = l[i]; pcm[(at + i) * 2 + 1] = r[i]; }
        if (++blocks % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
      canceled(signal); const blob = wavBlob(pcm, frames, sampleRate); core.dispose();
      return { blob, ...(includePCM ? { pcm } : {}), sampleRate, tempo, name: name || snapshot.name || 'BRINE', sourceApp: 'brine' };
    }
    async renderWav({ state = this.state, scope = 'pattern', bars, tailSeconds, sampleRate = 48000, pitch = 60, pitches, velocity = .85, durationSeconds = 1, signal, includePCM = false } = {}) {
      const snapshot = normalize(state); if (!['pattern', 'note', 'chord'].includes(scope)) throw Error('Choose a pattern, note or chord export.');
      if (pitches !== undefined && (!Array.isArray(pitches) || pitches.length > 128)) throw Error('Choose a bounded chord note list.');
      if (scope === 'pattern') { if (bars !== undefined && !Number.isInteger(bars)) throw Error('Choose a whole number of bars.'); const lengthBeats = bars === undefined ? snapshot.pattern.lengthBeats : validate(bars, 'bar count', 1, 64) * 4; return this.renderNotes({ state: snapshot, lengthBeats, tailSeconds, sampleRate, signal, includePCM }); }
      validate(durationSeconds, 'note length', .001, 30); validate(velocity, 'velocity', 0, 1);
      const selected = scope === 'note' ? [pitch] : pitches || (this.getKeyboardChord().length ? this.getKeyboardChord() : snapshot.pattern.notes.filter(note => note.beat === snapshot.pattern.notes[0]?.beat).slice(0, 6).map(note => note.pitch));
      const notes = selected?.length ? selected.slice(0, 6) : [60, 64, 67], lengthBeats = durationSeconds * snapshot.tempo / 60;
      return this.renderNotes({ state: snapshot, events: notes.map((pitch, index) => ({ id: 'held-' + index, pitch, velocity, beat: 0, duration: lengthBeats })), lengthBeats, tailSeconds, sampleRate, signal, includePCM, keyboardArp: snapshot.arp.enabled });
    }
    async exportWav(options) { return (await this.renderWav(options)).blob; }
    async dispose() {
      if (this._disposed) return; this._disposed = true; this._generation++; this.isPlaying = false; this._held.clear(); this._keyboardChord.length = 0; this._controllers.clear();
      this._meters = emptyMeters();
      const node = this.node, context = this.context; this.node = this.core = null;
      if (node?.port) { try { node.port.postMessage({ type: 'dispose' }); } catch (_) {} node.port.onmessage = null; node.port.close(); }
      if (node) { node.onaudioprocess = null; try { node.disconnect(); } catch (_) {} }
      if (this._ownsContext && context?.state !== 'closed') await context?.close().catch(() => {}); this.context = null;
    }
  }
  BrineAudio.processorSource = processorSource; BrineAudio.wavBlob = wavBlob; BrineAudio.createPlaybackDSP = createBrinePlaybackDSP;
  BrineAudio.autoTail = state => autoTail(normalize(state));
  BrineAudio.MAX_HELD = MAX_HELD;
  BrineAudio.MAX_CONTROL_STATES = MAX_CONTROL_STATES;
  global.createBrinePlaybackDSP = createBrinePlaybackDSP; global.BrineAudio = BrineAudio;
})(typeof window !== 'undefined' ? window : globalThis);
