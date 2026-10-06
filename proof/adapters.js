/* LEAVEN's exact-note Kitchen exchange and GALLEY host adapters. */
(() => {
  'use strict';
  let installed = false;
  const abort = signal => {
    if (signal?.aborted) throw new DOMException('LEAVEN pattern operation cancelled.', 'AbortError');
  };
  const finite = (value, min, max, label) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new Error('Choose a valid ' + label + '.');
    }
    return value;
  };
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const voices = () => [{ id: 'synth', name: 'LEAVEN · polyphonic synthesizer', pitchRange: [0, 127] }];

  function install() {
    if (installed || !window.ProofApp) return;
    const app = window.ProofApp, S = window.ProofSchema, P = window.MusicLabPatternSchema;
    const arp = window.ProofArp || window.createProofArp?.();
    if (!S || !P || !arp || !app.engine) throw new Error('LEAVEN needs its native engine and Kitchen pattern validator.');
    installed = true;
    const audio = app.engine;
    const state = () => app.getState();
    const notify = () => {
      document.dispatchEvent(new CustomEvent('musiclab:patternchange', { detail: { app: 'proof' } }));
      window.MusicLabHost?.notifyStateChange?.();
    };
    function snapshot(value) {
      if (value === undefined) return S.normalize(state());
      if (value?.format === 'loom-instrument-state') {
        if (value.version !== 1 || value.app !== 'proof') throw new Error('Choose a saved LEAVEN instrument state.');
        value = value.state;
      }
      return S.parseProject(value);
    }
    function validateNote({ pitch, voice } = {}) {
      if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) throw new Error('Choose a MIDI note from 0 to 127.');
      if (voice !== 'synth') throw new Error('Map this note to LEAVEN’s synth voice.');
      return true;
    }
    function mapping(packet, map) {
      if (!map || Object.prototype.toString.call(map) !== '[object Object]') {
        throw new Error('Map every source voice to LEAVEN’s synth voice.');
      }
      const result = {};
      for (const voice of packet.voices) {
        if (!own(map, voice.id) || map[voice.id] !== 'synth') throw new Error('Choose the synth destination for “' + voice.name + '”.');
        Object.defineProperty(result, voice.id, { value: 'synth', enumerable: true });
      }
      if (Object.keys(map).some(id => !packet.voices.some(voice => voice.id === id))) throw new Error('The voice map contains an unknown source voice.');
      for (const note of packet.notes) {
        validateNote({ pitch: note.pitch, voice: result[note.voice] });
        const grid = Math.round(note.beat * 4);
        const swungBeat = note.beat + (Math.abs(note.beat * 4 - grid) < 1e-7 && grid % 2 ? packet.swing / 4 : 0);
        if (swungBeat >= packet.lengthBeats && note.velocity > 0 && note.probability > 0) {
          throw new Error('Swing moves a note beyond the phrase end. Reduce its swing or extend the source phrase before sending it.');
        }
      }
      return result;
    }
    const nativeEvents = value => arp.events(value, { startBeat: 0, lengthBeats: arp.progressionLength(value) });
    function exportPattern({ scope = 'pattern', name, signal } = {}) {
      abort(signal);
      if (!['pattern', 'native'].includes(scope)) throw new Error('Choose the current phrase or native arpeggio.');
      const value = state();
      if (scope === 'pattern' && value.musicLabPattern) {
        const packet = P.parse(value.musicLabPattern.pattern), map = mapping(packet, value.musicLabPattern.voiceMap);
        return P.normalize({ ...packet, name: name || packet.name, sourceApp: 'proof', tempo: value.tempo,
          voices: [{ id: 'synth', name: 'LEAVEN · polyphonic synthesizer', pitch: value.root }],
          notes: packet.notes.map(note => ({ ...note, voice: map[note.voice] })) });
      }
      delete value.musicLabPattern;
      const lengthBeats = arp.progressionLength(value);
      if (lengthBeats < .25) throw new Error('This phrase is shorter than the portable pattern minimum of ¼ beat. Increase its step count or choose a slower division.');
      const events = arp.events(value, { startBeat: 0, lengthBeats });
      return P.normalize({ format: 'musiclab-pattern', version: 1, kind: 'notes', name: name || value.name + ' · LEAVEN',
        sourceApp: 'proof', tempo: value.tempo, swing: 0, lengthBeats, meter: [4, 4], seed: value.seed,
        tags: ['proof', 'arpeggio', value.synth.model], voices: [{ id: 'synth', name: 'LEAVEN · polyphonic synthesizer', pitch: value.root }],
        notes: events.map((event, index) => ({ id: 'proof-' + (index + 1), voice: 'synth', pitch: event.note,
          beat: event.startBeat, duration: Math.min(event.durationBeats, lengthBeats - event.startBeat), velocity: event.velocity, probability: 1 })) });
    }
    async function importPattern({ pattern, options = {}, signal } = {}) {
      abort(signal); abort(options.signal);
      const packet = P.parse(pattern), before = state();
      if (options.target !== undefined && options.target !== 'pattern') throw new Error('Choose LEAVEN’s received performance phrase.');
      const map = mapping(packet, options.voiceMap);
      const occupied = before.musicLabPattern ? before.musicLabPattern.pattern.notes.length > 0 : nativeEvents(before).length > 0;
      if (occupied && options.replace !== true) throw new Error('Confirm replacing the current performance phrase.');
      const candidate = S.normalize({ ...before, musicLabPattern: { pattern: packet, voiceMap: map } });
      abort(signal); abort(options.signal);
      app.stop();
      await app.loadState(candidate);
      notify();
      return { app: 'proof', target: 'pattern', name: packet.name, notes: packet.notes.length, exact: true };
    }
    function clearImportedPattern() {
      const value = state();
      if (!value.musicLabPattern) return false;
      delete value.musicLabPattern;
      app.stop(); app.loadState(value); notify();
      return true;
    }
    async function prepare() {
      await audio.init();
      if (audio.context?.state === 'suspended') await audio.context.resume();
      if (!audio.context || audio.context.state === 'closed') throw new Error('Start LEAVEN’s audio engine before scheduling notes.');
      return true;
    }
    function scheduleNote({ id, pitch, velocity = .8, voice, when, durationSeconds = .25, source = 'loom' } = {}) {
      validateNote({ pitch, voice });
      finite(velocity, 0, 1, 'velocity'); finite(when, 0, Number.MAX_SAFE_INTEGER, 'note time');
      finite(durationSeconds, Number.MIN_VALUE, 768, 'note duration');
      if (typeof source !== 'string' || !source.length || source.length > 200) throw new Error('Choose a valid note source.');
      if (!audio.context || audio.context.state === 'closed') throw new Error('Prepare LEAVEN before scheduling notes.');
      if (!velocity) return;
      return audio.scheduleNote({ id, voiceId: 'synth', note: pitch, velocity, when, durationSeconds, source });
    }
    function cancelNotes({ source = 'loom', when } = {}) {
      if (typeof source !== 'string' || !source.length) throw new Error('Choose a valid note source.');
      if (when !== undefined) finite(when, 0, Number.MAX_SAFE_INTEGER, 'cancellation time');
      return audio.stopNotes({ source, when });
    }
    async function renderPattern({ pattern, state: sourceState, tempo, tailSeconds = 0, voiceMap, signal } = {}) {
      abort(signal);
      const packet = P.parse(pattern), value = snapshot(sourceState), bpm = tempo ?? packet.tempo;
      finite(bpm, 20, 400, 'render tempo'); finite(tailSeconds, 0, 30, 'render tail');
      if (packet.lengthBeats * 60 / bpm + tailSeconds > 120) throw new Error('Split this phrase into parts no longer than 120 seconds including the tail.');
      const map = mapping(packet, voiceMap || (value.musicLabPattern && packet.voices.every(voice => own(value.musicLabPattern.voiceMap, voice.id))
        ? value.musicLabPattern.voiceMap : Object.fromEntries(packet.voices.map(voice => [voice.id, 'synth']))));
      // The same seeded note realization drives native playback and isolated offline rendering.
      const performance = { ...value, tempo: bpm, musicLabPattern: { pattern: packet, voiceMap: map } };
      const events = arp.events(performance, { startBeat: 0, lengthBeats: packet.lengthBeats });
      // GALLEY consumes native PCM so WAV decoding at another context rate cannot shorten the phrase.
      const result = await audio.renderNotes({ state: value, events, tempo: bpm, lengthBeats: packet.lengthBeats, tailSeconds, signal, includePCM: true });
      abort(signal);
      return { ...result, name: packet.name, tempo: bpm, sourceApp: 'proof' };
    }
    function setTempo(tempo) {
      finite(tempo, 40, 240, 'tempo');
      const value = state();
      if (value.tempo !== tempo) app.loadState({ ...value, tempo });
      return true;
    }
    const adapter = {
      app: 'proof', latency: 0,
      get notes() { return { voices: voices(), polyphonic: true, pitched: true, scheduledCancel: true, pitchRange: [0, 127], minPitch: 0, maxPitch: 127, latency: 0 }; },
      get patternExport() { return { scopes: [{ id: 'pattern', label: state().musicLabPattern ? 'Received performance · exact notes' : 'Current arpeggio phrase' }, { id: 'native', label: 'Native arpeggio phrase' }], defaultScope: 'pattern' }; },
      get patternImport() { const value = state(); return { targets: [{ id: 'pattern', name: 'Received performance · exact notes', occupied: !!(value.musicLabPattern ? value.musicLabPattern.pattern.notes.length : nativeEvents(value).length) }], voices: voices(), mode: 'notes', description: 'Map source voices to the polyphonic synth. Timing, pitch, velocity and duration stay intact. Use native arp restores the chord recipe.' }; },
      get importedPattern() { const value = state(); return value.musicLabPattern ? P.clone(value.musicLabPattern.pattern) : null; },
      getImportedPattern() { return this.importedPattern; },
      exportPattern, capturePattern: exportPattern, importPattern, clearImportedPattern, prepare, scheduleNote, cancelNotes, renderPattern, validateNote,
      validatePattern({ pattern, voiceMap } = {}) { const packet = P.parse(pattern); mapping(packet, voiceMap || Object.fromEntries(packet.voices.map(voice => [voice.id, 'synth']))); return true; },
      transport(clock = {}) { return audio.followTransport(clock); },
      panic() { app.panic(); }
    };
    Object.defineProperty(window, 'MusicLabPatternInstrument', { value: Object.freeze(adapter), writable: false, configurable: false });
    if (window.MusicLabHost) {
      const hostAdapter = { ...adapter, prepare, getState: () => app.getProject(), setState: value => app.loadState(snapshot(value)),
        getProject: () => app.getProject(), tempo: setTempo, setTempo,
        async start({ tempo, when, fromBeat = 0, beat = fromBeat } = {}) {
          if (tempo !== undefined) setTempo(tempo);
          finite(beat, 0, Number.MAX_SAFE_INTEGER, 'start beat');
          if (when !== undefined) finite(when, 0, Number.MAX_SAFE_INTEGER, 'start time');
          await prepare(); return app.play({ when, beat });
        },
        play: options => app.play(options), stop: () => app.stop(), panic: () => app.panic(),
        isPlaying: () => app.isPlaying(), exportAudio: options => app.exportAudio(options)
      };
      for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(adapter))) {
        if (descriptor.get) Object.defineProperty(hostAdapter, key, { get: descriptor.get, enumerable: true });
      }
      Object.defineProperty(hostAdapter, 'audioExport', { get: () => app.audioExport, enumerable: true });
      window.MusicLabHost.registerInstrument(hostAdapter);
    }
    document.dispatchEvent(new CustomEvent('musiclab:app-ready', { bubbles: true, detail: { app: 'proof' } }));
  }
  document.addEventListener('musiclab:app-ready', event => { if (event.detail?.app === 'proof') install(); });
  document.addEventListener('DOMContentLoaded', install, { once: true });
  install();
})();
