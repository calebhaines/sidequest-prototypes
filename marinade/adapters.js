/* MARINADE's exact-note Kitchen exchange and GALLEY host adapters. */
(() => {
  'use strict';
  let installed = false;
  const abort = signal => {
    if (signal?.aborted) throw new DOMException('MARINADE pattern operation cancelled.', 'AbortError');
  };
  const finite = (value, min, max, label) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new Error('Choose a valid ' + label + '.');
    }
    return value;
  };
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const voices = () => [{ id: 'synth', name: 'MARINADE · polyphonic synthesizer', pitchRange: [0, 127] }];

  function install() {
    if (installed || !window.MarinadeApp) return;
    const app = window.MarinadeApp, S = window.MarinadeSchema, P = window.MusicLabPatternSchema;
    const sequence = window.MarinadeSequence || window.createMarinadeSequence?.();
    if (!S || !P || !sequence || !app.engine) throw new Error('MARINADE needs its native engine and Kitchen pattern validator.');
    installed = true;
    const audio = app.engine;
    const state = () => S.normalize(app.getState());
    const notify = () => {
      document.dispatchEvent(new CustomEvent('musiclab:patternchange', { detail: { app: 'marinade' } }));
      window.MusicLabHost?.notifyStateChange?.();
    };
    function snapshot(value) {
      if (value === undefined) return S.normalize(state());
      if (value?.format === 'loom-instrument-state') {
        if (value.version !== 1 || value.app !== 'marinade') throw new Error('Choose a saved MARINADE instrument state.');
        value = value.state;
      }
      return S.parseProject(value);
    }
    function validateNote({ pitch, voice } = {}) {
      if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) throw new Error('Choose a MIDI note from 0 to 127.');
      if (voice !== 'synth') throw new Error('Map this note to MARINADE’s synth voice.');
      return true;
    }
    function mapping(packet, map) {
      if (!map || Object.prototype.toString.call(map) !== '[object Object]') {
        throw new Error('Map every source voice to MARINADE’s synth voice.');
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
    const nativeEvents = value => sequence.events(value, { startBeat: 0, lengthBeats: sequence.patternLength(value) });
    function exportPattern({ scope = 'pattern', name, signal } = {}) {
      abort(signal);
      if (!['pattern', 'native'].includes(scope)) throw new Error('Choose the current phrase or native sequence.');
      const value = state();
      if (scope === 'pattern' && value.musicLabPattern) {
        const packet = P.parse(value.musicLabPattern.pattern), map = mapping(packet, value.musicLabPattern.voiceMap);
        return P.normalize({ ...packet, name: name || packet.name, sourceApp: 'marinade', tempo: value.tempo,
          voices: [{ id: 'synth', name: 'MARINADE · polyphonic synthesizer', pitch: value.root }],
          notes: packet.notes.map(note => ({ ...note, voice: map[note.voice] })) });
      }
      delete value.musicLabPattern;
      const lengthBeats = sequence.patternLength(value);
      if (lengthBeats < .25) throw new Error('This phrase is shorter than the portable pattern minimum of ¼ beat. Increase its step count or choose a slower division.');
      const events = sequence.events(value, { startBeat: 0, lengthBeats });
      return P.normalize({ format: 'musiclab-pattern', version: 1, kind: 'notes', name: name || value.name + ' · MARINADE',
        sourceApp: 'marinade', tempo: value.tempo, swing: 0, lengthBeats, meter: [4, 4], seed: value.seed,
        tags: ['marinade', 'sequence', 'spectral-morph'], voices: [{ id: 'synth', name: 'MARINADE · polyphonic synthesizer', pitch: value.root }],
        notes: events.map((event, index) => ({ id: 'marinade-' + (index + 1), voice: 'synth', pitch: event.note,
          beat: event.startBeat, duration: Math.min(event.durationBeats, lengthBeats - event.startBeat), velocity: event.velocity, probability: 1 })) });
    }
    async function importPattern({ pattern, options = {}, signal } = {}) {
      abort(signal); abort(options.signal);
      const packet = P.parse(pattern), before = state();
      if (options.target !== undefined && options.target !== 'pattern') throw new Error('Choose MARINADE’s received performance phrase.');
      const map = mapping(packet, options.voiceMap);
      const occupied = before.musicLabPattern ? before.musicLabPattern.pattern.notes.length > 0 : nativeEvents(before).length > 0;
      if (occupied && options.replace !== true) throw new Error('Confirm replacing the current performance phrase.');
      const candidate = S.normalize({ ...before, musicLabPattern: { pattern: packet, voiceMap: map } });
      abort(signal); abort(options.signal);
      app.stop();
      await app.loadState(candidate);
      notify();
      return { app: 'marinade', target: 'pattern', name: packet.name, notes: packet.notes.length, exact: true };
    }
    async function clearImportedPattern() {
      const value = state();
      if (!value.musicLabPattern) return false;
      delete value.musicLabPattern;
      app.stop(); await app.loadState(value); notify();
      return true;
    }
    async function prepare() {
      await audio.init();
      if (audio.context?.state === 'suspended') await audio.context.resume();
      if (!audio.context || audio.context.state === 'closed') throw new Error('Start MARINADE’s audio engine before scheduling notes.');
      return true;
    }
    function scheduleNote({ id, pitch, velocity = .8, voice, when, durationSeconds = .25, source = 'loom' } = {}) {
      validateNote({ pitch, voice });
      finite(velocity, 0, 1, 'velocity'); finite(when, 0, Number.MAX_SAFE_INTEGER, 'note time');
      finite(durationSeconds, Number.MIN_VALUE, 768, 'note duration');
      if (typeof source !== 'string' || !source.length || source.length > 200) throw new Error('Choose a valid note source.');
      if (!audio.context || audio.context.state === 'closed') throw new Error('Prepare MARINADE before scheduling notes.');
      if (!velocity) return;
      return audio.scheduleNote({ id, voiceId: 'synth', note: pitch, velocity, when, durationSeconds, source });
    }
    function cancelNotes({ source = 'loom', when } = {}) {
      if (typeof source !== 'string' || !source.length || source.length > 200) throw new Error('Choose a valid note source.');
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
      const events = sequence.events(performance, { startBeat: 0, lengthBeats: packet.lengthBeats });
      // GALLEY consumes native PCM so WAV decoding at another context rate cannot shorten the phrase.
      const result = await audio.renderNotes({ state: value, events, tempo: bpm, lengthBeats: packet.lengthBeats, tailSeconds, signal, includePCM: true });
      abort(signal);
      return { ...result, name: packet.name, tempo: bpm, sourceApp: 'marinade' };
    }
    async function setTempo(tempo) {
      finite(tempo, 20, 400, 'tempo');
      const value = state();
      if (value.tempo !== tempo) {
        if (app.setTempo) await app.setTempo(tempo);
        else await app.loadState({ ...value, tempo });
      }
      return true;
    }
    const adapter = {
      app: 'marinade', latency: 0,
      get notes() { return { voices: voices(), polyphonic: true, pitched: true, scheduledCancel: true, pitchRange: [0, 127], minPitch: 0, maxPitch: 127, latency: 0 }; },
      get patternExport() { return { scopes: [{ id: 'pattern', label: state().musicLabPattern ? 'Received performance · exact notes' : 'Current sequence phrase' }, { id: 'native', label: 'Native sequence phrase' }], defaultScope: 'pattern' }; },
      get patternImport() { const value = state(); return { targets: [{ id: 'pattern', name: 'Received performance · exact notes', occupied: !!(value.musicLabPattern ? value.musicLabPattern.pattern.notes.length : nativeEvents(value).length) }], voices: voices(), mode: 'notes', description: 'Map source voices to the polyphonic synth. Timing, pitch, velocity and duration stay intact. Use native sequence restores the note recipe.' }; },
      get importedPattern() { const value = state(); return value.musicLabPattern ? P.clone(value.musicLabPattern.pattern) : null; },
      getImportedPattern() { return this.importedPattern; },
      exportPattern, capturePattern: exportPattern, importPattern, clearImportedPattern, prepare, scheduleNote, cancelNotes, renderPattern, validateNote,
      validatePattern({ pattern, voiceMap } = {}) { const packet = P.parse(pattern); mapping(packet, voiceMap || Object.fromEntries(packet.voices.map(voice => [voice.id, 'synth']))); return true; },
      transport(clock = {}) { return audio.followTransport(clock); },
      panic() { app.panic(); }
    };
    Object.defineProperty(window, 'MusicLabPatternInstrument', { value: Object.freeze(adapter), writable: false, configurable: false });
    if (window.MusicLabHost) {
      const hostAdapter = { ...adapter, prepare, importAudio: payload => app.importAudio(payload), getState: () => app.getProject(), setState: value => app.loadState(snapshot(value)),
        getProject: () => app.getProject(), tempo: setTempo, setTempo,
        async start({ tempo, when, fromBeat = 0, beat = fromBeat } = {}) {
          if (tempo !== undefined) await setTempo(tempo);
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
      Object.defineProperty(hostAdapter, 'audioImport', { get: () => app.audioImport, enumerable: true });
      window.MusicLabHost.registerInstrument(hostAdapter);
    }
    document.dispatchEvent(new CustomEvent('musiclab:app-ready', { bubbles: true, detail: { app: 'marinade' } }));
  }
  document.addEventListener('musiclab:app-ready', event => { if (event.detail?.app === 'marinade') install(); });
  document.addEventListener('DOMContentLoaded', install, { once: true });
  install();
})();
