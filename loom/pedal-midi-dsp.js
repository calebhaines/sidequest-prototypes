/* FERMENT · bounded monophonic note capture on the input sample clock. */
(function (scope) {
  'use strict';
  function createLoomPedalMidiDSP() {
    'use strict';
    const MAX_NOTES = 4096, MAX_BEATS = 256;
    const finite = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    class Capture {
      constructor(sampleRate = 48000) {
        this.sampleRate = clamp(finite(sampleRate, 48000), 8000, 192000);
        this.active = false; this.token = null; this.frames = 0; this.tempo = 120; this.events = []; this.donePending = false; this.reason = '';
      }
      start(options = {}) {
        if (this.active) throw Error('Stop the current FERMENT note capture before starting another.');
        if (this.events.length || this.donePending) throw Error('Read the previous FERMENT capture before starting another.');
        this.token = typeof options.token === 'string' ? options.token.slice(0, 100) : String(options.token ?? 'ferment-capture');
        this.tempo = clamp(finite(options.tempo, 120), 20, 400);
        this.maxNotes = Math.floor(clamp(finite(options.maxNotes, MAX_NOTES), 1, MAX_NOTES));
        this.maxFrames = Math.max(1, Math.floor(clamp(finite(options.maxBeats, MAX_BEATS), .25, MAX_BEATS) * 60 / this.tempo * this.sampleRate));
        this.frames = this.completed = 0; this.active = true; this.reason = ''; this.donePending = false;
        this.note = null; this.candidate = null; this.lossFrame = null; this.onsetFrame = null; this.onsetPeak = 0; this.lastOnset = -Infinity; this.lastFresh = -Infinity; this.wasGate = false; this.pickArmed = true; this.pickPeak = 0;
        this.confirmFrames = Math.max(1, Math.round(this.sampleRate * .010));
        this.releaseFrames = Math.max(1, Math.round(this.sampleRate * .035));
        this.onsetWindow = Math.max(1, Math.round(this.sampleRate * .25));
        this.pickGuard = Math.max(1, Math.round(this.sampleRate * .045));
        this.velocityWindow = Math.max(1, Math.round(this.sampleRate * .025));
        return this.metadata();
      }
      metadata() { return { token: this.token, frames: this.frames, sampleRate: this.sampleRate, tempo: this.tempo, done: !this.active && this.token !== null, reason: this.reason }; }
      _close(frame) {
        const note = this.note; this.note = null;
        if (!note) return;
        const endFrame = Math.min(this.maxFrames, Math.max(note.startFrame + 1, Math.floor(frame)));
        if (note.startFrame >= endFrame || this.completed >= this.maxNotes) return;
        this.events.push({ pitch: note.pitch, startFrame: note.startFrame, endFrame, velocity: clamp(note.velocity, 1 / 127, 1) }); this.completed++;
        if (this.completed >= this.maxNotes) { this.active = false; this.reason = 'note limit'; this.donePending = true; this.candidate = null; }
      }
      _begin(pitch, frame, level) {
        if (!this.active) return;
        this.note = { pitch, startFrame: Math.max(0, Math.min(this.frames, frame)), velocity: clamp(level, 1 / 127, 1) };
        this.candidate = null; this.onsetFrame = null; this.onsetPeak = 0; this.lossFrame = null;
      }
      observe(frequency, confidence, level, gate, fresh, onset) {
        if (!this.active) return;
        const frame = this.frames, open = gate === true, strength = clamp(finite(level, 0), 0, 1);
        this.pickPeak = Math.max(this.pickPeak, strength);
        if (frame - this.lastOnset >= this.pickGuard && strength < this.pickPeak * .6) this.pickArmed = true;
        if (open && (!this.wasGate || onset === true && this.pickArmed) && frame - this.lastOnset >= this.pickGuard) {
          const boundary = this.lossFrame === null ? frame : this.lossFrame;
          this._close(boundary);
          if (!this.active) return;
          this.onsetFrame = frame; this.onsetPeak = strength; this.lastOnset = frame; this.candidate = null; this.pickArmed = false; this.pickPeak = strength;
        }
        this.wasGate = open;
        if (this.onsetFrame !== null) this.onsetPeak = Math.max(this.onsetPeak, strength);
        if (this.note && frame - this.note.startFrame <= this.velocityWindow) this.note.velocity = Math.max(this.note.velocity, strength);
        if (!open) {
          if (this.lossFrame === null) this.lossFrame = frame;
          if (frame - this.lossFrame >= this.releaseFrames) { this._close(this.lossFrame); this.candidate = null; this.onsetFrame = null; }
        } else {
          this.lossFrame = null;
          if (fresh === true && finite(confidence, 0) >= .76 && finite(frequency, 0) > 0) {
            const midi = 69 + 12 * Math.log2(frequency / 440), pitch = Math.round(midi);
            if (pitch >= 0 && pitch <= 127) {
              this.lastFresh = frame;
              if (this.note && Math.abs(midi - this.note.pitch) < .70) this.candidate = null;
              else {
                if (!this.candidate || this.candidate.pitch !== pitch) this.candidate = { pitch, frame, count: 1, peak: strength };
                else { this.candidate.count++; this.candidate.peak = Math.max(this.candidate.peak, strength); }
                if (this.candidate.count >= 2 && frame - this.candidate.frame >= this.confirmFrames) {
                  const candidate = this.candidate, hasOnset = this.onsetFrame !== null && frame - this.onsetFrame <= this.onsetWindow;
                  let startFrame = hasOnset ? this.onsetFrame : candidate.frame;
                  if (this.note) { startFrame = Math.max(this.note.startFrame + 1, startFrame); this._close(startFrame); }
                  this._begin(candidate.pitch, startFrame, Math.max(candidate.peak, hasOnset ? this.onsetPeak : 0));
                }
              }
            }
          }
          if (this.note && frame - this.lastFresh > this.sampleRate * .12) { this._close(Math.min(frame, this.lastFresh + Math.round(this.sampleRate * .04))); this.candidate = null; }
        }
        if (!this.active) return;
        this.frames++;
        if (this.frames >= this.maxFrames) this.stop('duration limit');
      }
      advance(count) {
        if (!this.active) return;
        const frames = Math.max(0, Math.floor(finite(count, 0))), end = Math.min(this.maxFrames, this.frames + frames);
        if (frames && this.lossFrame === null) this.lossFrame = this.frames;
        this.wasGate = false;
        if (this.note && end - this.lossFrame >= this.releaseFrames) this._close(this.lossFrame);
        this.frames = end; this.candidate = null; this.onsetFrame = null;
        if (this.active && this.frames >= this.maxFrames) this.stop('duration limit');
      }
      stop(reason = 'stopped') {
        if (!this.active) return this.metadata();
        this._close(this.lossFrame === null ? this.frames : this.lossFrame);
        this.active = false; this.donePending = true; this.reason = String(reason || 'stopped').slice(0, 100); this.candidate = null;
        return this.metadata();
      }
      drain() {
        const batch = { ...this.metadata(), events: this.events };
        this.events = []; this.donePending = false; return batch;
      }
    }
    return { Capture, MAX_NOTES, MAX_BEATS };
  }
  scope.createLoomPedalMidiDSP = createLoomPedalMidiDSP;
})(typeof window === 'undefined' ? globalThis : window);
