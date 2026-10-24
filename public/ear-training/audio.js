/** Small, dependency-free synthesizer. All scheduling uses the audio clock. */
export class AudioEngine {
  constructor() {
    this._context = null;
    this._master = null;
    this._compressor = null;
    this._volume = 0.65;
    this._timbre = 'warm';
    this._generation = 0;
    this._nodes = new Set();
    this._timer = null;
    this._finish = null;
    this._playing = false;
    this.onStateChange = null;
  }

  get available() {
    return Boolean(globalThis.AudioContext || globalThis.webkitAudioContext);
  }
  get playing() { return this._playing; }
  get initialized() { return Boolean(this._context); }
  get volume() { return this._volume; }
  set volume(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    this._volume = Math.max(0, Math.min(1, number));
    if (this._master) {
      this._master.gain.setTargetAtTime(this._volume * 0.6, this._context.currentTime, 0.015);
    }
  }
  get timbre() { return this._timbre; }
  set timbre(value) {
    if (['warm', 'sine', 'piano'].includes(value)) this._timbre = value;
  }

  /** Call from a click/key gesture; no sound plays until explicitly requested. */
  async ensure() {
    try {
      if (!this._context || this._context.state === 'closed') {
        const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Context) throw new Error('This browser does not support Web Audio.');
        this._context = new Context({ latencyHint: 'interactive' });
        this._master = this._context.createGain();
        this._master.gain.value = this._volume * 0.6;
        this._compressor = this._context.createDynamicsCompressor();
        this._compressor.threshold.value = -12;
        this._compressor.knee.value = 12;
        this._compressor.ratio.value = 8;
        this._compressor.attack.value = 0.003;
        this._compressor.release.value = 0.12;
        this._master.connect(this._compressor);
        this._compressor.connect(this._context.destination);
      }
      if (this._context.state !== 'running') await this._context.resume();
      if (this._context.state !== 'running') {
        throw new Error('Audio is paused. Press Play to enable sound.');
      }
      return this._context;
    } catch (error) {
      throw new Error(`Could not start audio: ${error.message || error}`);
    }
  }

  _state(playing) {
    if (this._playing === playing) return;
    this._playing = playing;
    if (typeof this.onStateChange === 'function') this.onStateChange(playing);
  }

  /** Cancels both playing and future notes, and settles any interrupted play. */
  stop() {
    this._generation += 1;
    if (this._timer !== null) clearTimeout(this._timer);
    this._timer = null;
    const now = this._context?.currentTime || 0;
    for (const node of this._nodes) {
      try {
        const gain = node.gain.gain;
        if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
        else gain.cancelScheduledValues(now);
        gain.setTargetAtTime(0, now, 0.004);
        node.osc.stop(now + 0.025);
      } catch { /* An oscillator may have already ended. */ }
    }
    this._nodes.clear();
    const finish = this._finish;
    this._finish = null;
    this._state(false);
    if (finish) finish({ cancelled: true });
  }

  _partial(frequency, at, duration, amplitude, harmonic, kind) {
    const context = this._context;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency * harmonic;
    const attack = kind === 'click' ? 0.0015 : kind === 'piano' ? 0.005 : 0.012;
    const release = kind === 'click' ? 0.025 : 0.055;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(amplitude, at + Math.min(attack, duration / 3));
    if (kind === 'piano' || kind === 'click') {
      const sustain = kind === 'click' ? 0.06 : harmonic > 1 ? 0.18 : 0.46;
      gain.gain.exponentialRampToValueAtTime(Math.max(0.00001, amplitude * sustain), at + duration);
    } else {
      gain.gain.setValueAtTime(amplitude * 0.85, at + duration);
    }
    gain.gain.exponentialRampToValueAtTime(0.00001, at + duration + release);
    osc.connect(gain);
    gain.connect(this._master);
    const node = { osc, gain };
    this._nodes.add(node);
    osc.onended = () => {
      this._nodes.delete(node);
      try { osc.disconnect(); gain.disconnect(); } catch { /* Already disconnected. */ }
    };
    osc.start(at);
    osc.stop(at + duration + release + 0.01);
  }

  _note(midi, at, duration, velocity, polyphony, voice) {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const kind = ['click', 'warm', 'piano', 'sine'].includes(voice) ? voice : this._timbre;
    const amplitude = 0.25 * velocity / Math.sqrt(polyphony);
    if (kind === 'click') {
      this._partial(frequency, at, Math.min(duration, 0.055), amplitude * 0.7, 1, kind);
      this._partial(frequency, at, Math.min(duration, 0.035), amplitude * 0.18, 2.1, kind);
    } else {
      this._partial(frequency, at, duration, amplitude * 0.82, 1, kind);
      if (kind !== 'sine') {
        this._partial(frequency, at, duration, amplitude * (kind === 'piano' ? 0.24 : 0.12), 2, kind);
        this._partial(frequency, at, duration, amplitude * (kind === 'piano' ? 0.1 : 0.035), 3, kind);
      }
    }
  }

  /** Events: { at, duration, notes: MIDI[], voice?: 'click'|'warm'|'piano'|'sine', velocity?: 0..1 }.
   * Options.duration holds the clock at least this long after the scheduled start; notes are never truncated.
   */
  async play(events, { leadIn = 0.06, duration = 0 } = {}) {
    this.stop();
    const generation = this._generation;
    const context = await this.ensure();
    if (generation !== this._generation) return { cancelled: true };
    const cleanEvents = (Array.isArray(events) ? events : []).map(event => ({
      at: Number(event.at),
      duration: Number(event.duration),
      notes: Array.isArray(event.notes) ? event.notes.filter(note => Number.isFinite(note) && note >= 0 && note <= 127) : [],
      velocity: Number.isFinite(event.velocity) ? Math.max(0, Math.min(1, event.velocity)) : 0.8,
      voice: event.voice,
    })).filter(event => Number.isFinite(event.at) && event.at >= 0 && Number.isFinite(event.duration) && event.duration > 0 && event.notes.length);
    const minimum = Number.isFinite(duration) ? Math.max(0, duration) : 0;
    if (!cleanEvents.length && minimum === 0) return { cancelled: false };
    const delay = Number.isFinite(leadIn) ? Math.max(0.025, leadIn) : 0.06;
    const start = context.currentTime + delay;
    let length = minimum;
    for (const event of cleanEvents) {
      for (const midi of event.notes) {
        this._note(midi, start + event.at, event.duration, event.velocity, event.notes.length, event.voice);
      }
      length = Math.max(length, event.at + event.duration + 0.09);
    }
    return new Promise(resolve => {
      this._finish = resolve;
      // The audio clock can pause in a background tab. The app stops on visibilitychange.
      this._timer = setTimeout(() => {
        if (generation !== this._generation) return;
        this._timer = null;
        this._finish = null;
        this._state(false);
        resolve({ cancelled: false });
      }, Math.ceil((delay + length) * 1000));
      this._state(true);
    });
  }

  async preview(midi, duration = 0.35) {
    return this.play([{ at: 0, duration, notes: [midi] }], { leadIn: 0.025 });
  }
}
