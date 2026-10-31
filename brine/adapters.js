/* BRINE's exact-note Kitchen exchange and GALLEY instrument contract. */
(function (global) {
  'use strict';
  let installed = false;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const finite = (value, low, high, label) => { if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) throw Error('Choose a valid ' + label + '.'); return value; };
  const aborted = signal => { if (signal?.aborted) throw new DOMException('BRINE pattern operation cancelled.', 'AbortError'); };
  const voices = () => [{ id: 'synth', name: 'BRINE · six-voice DCO synthesizer', pitchRange: [0, 127] }];
  function install() {
    if (installed || !global.BrineApp) return;
    const app = global.BrineApp, S = global.BrineSchema, P = global.MusicLabPatternSchema, audio = app.engine;
    if (!S || !P || !audio) throw Error('BRINE needs its project, pattern and audio modules.');
    installed = true;
    const state = () => S.normalize(app.getState());
    let lastPattern = null, lastTempo = null, lastPatternSignature = '';
    function observeChange(candidate, forcePattern = false) {
      global.MusicLabHost?.notifyStateChange?.();
      const value = candidate?.pattern ? candidate : app.getState();
      if (!forcePattern && value.pattern === lastPattern && value.tempo === lastTempo) return;
      const signature = JSON.stringify([value.tempo, value.pattern]); lastPattern = value.pattern; lastTempo = value.tempo;
      if (signature !== lastPatternSignature) { lastPatternSignature = signature; document.dispatchEvent(new CustomEvent('musiclab:patternchange', { detail: { app: 'brine' } })); }
    }
    const initial = app.getState(); lastPattern = initial.pattern; lastTempo = initial.tempo; lastPatternSignature = JSON.stringify([initial.tempo, initial.pattern]);
    const unsubscribe = app.onStateChange?.(value => observeChange(value));
    global.addEventListener?.('pagehide', () => { if (typeof unsubscribe === 'function') unsubscribe(); }, { once: true });
    const notify = () => observeChange(app.getState(), true);
    function snapshot(value) { return value === undefined ? state() : S.parseProject(value); }
    function validateNote({ pitch, voice = 'synth' } = {}) {
      if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) throw Error('Choose a MIDI pitch from 0 to 127.');
      if (voice !== 'synth') throw Error('Map this note to BRINE’s synth voice.'); return true;
    }
    function mapping(packet, supplied) {
      const map = supplied || Object.fromEntries(packet.voices.map(voice => [voice.id, 'synth']));
      if (!map || Object.prototype.toString.call(map) !== '[object Object]') throw Error('Map every source voice to BRINE’s synth.');
      for (const voice of packet.voices) if (!own(map, voice.id) || map[voice.id] !== 'synth') throw Error('Choose the synth destination for “' + voice.name + '”.');
      if (Object.keys(map).some(id => !packet.voices.some(voice => voice.id === id))) throw Error('The voice map contains an unknown source voice.');
      for (const note of packet.notes) {
        validateNote({ pitch: note.pitch, voice: map[note.voice] });
        const grid = Math.round(note.beat * 4), swung = note.beat + (Math.abs(note.beat * 4 - grid) < 1e-7 && grid % 2 ? packet.swing / 4 : 0);
        if (swung >= packet.lengthBeats && note.velocity > 0 && note.probability > 0) throw Error('Swing moves a note past the phrase end. Extend the phrase or reduce its swing.');
      }
      return map;
    }
    function exportPattern({ scope = 'pattern', name, signal } = {}) {
      aborted(signal); if (!['pattern', 'native'].includes(scope)) throw Error('Choose BRINE’s current phrase.');
      const value = state();
      return P.normalize({ ...value.pattern, name: name || value.pattern.name || value.name, sourceApp: 'brine', tempo: value.tempo, kind: 'notes', voices: voices(), notes: value.pattern.notes.map(note => ({ ...note, voice: 'synth' })) });
    }
    async function importPattern({ pattern, options = {}, signal } = {}) {
      aborted(signal); aborted(options.signal);
      const packet = P.parse(pattern), value = state();
      if (options.target !== undefined && options.target !== 'pattern') throw Error('Choose BRINE’s current phrase.');
      const map = mapping(packet, options.voiceMap);
      if (value.pattern.notes.length && options.replace !== true) throw Error('Confirm replacing the current phrase.');
      const candidate = S.normalize({ ...value, pattern: { ...packet, notes: packet.notes.map(note => ({ ...note, voice: map[note.voice] })) } });
      aborted(signal); aborted(options.signal); app.stop(); await app.loadState(candidate); notify();
      return { app: 'brine', target: 'pattern', name: packet.name, notes: packet.notes.length, exact: true };
    }
    async function prepare() {
      await audio.init(); if (audio.context?.state === 'suspended') await audio.context.resume();
      if (!audio.context || audio.context.state === 'closed') throw Error('Prepare BRINE before scheduling notes.'); return true;
    }
    function scheduleNote({ id, pitch, velocity = .8, voice = 'synth', when, durationSeconds = .25, source = 'loom' } = {}) {
      validateNote({ pitch, voice }); finite(velocity, 0, 1, 'velocity'); finite(when, 0, Number.MAX_SAFE_INTEGER, 'note time'); finite(durationSeconds, .000001, 768, 'note duration');
      if (typeof source !== 'string' || !source || source.length > 200) throw Error('Choose a valid note source.');
      return audio.scheduleNote({ id, pitch, velocity, when, durationSeconds, source });
    }
    function cancelNotes({ source = 'loom', when } = {}) {
      if (typeof source !== 'string' || !source || source.length > 200) throw Error('Choose a valid note source.');
      if (when !== undefined) finite(when, 0, Number.MAX_SAFE_INTEGER, 'cancellation time'); return audio.cancelNotes({ source, when });
    }
    async function renderPattern({ pattern, state: sourceState, tempo, tailSeconds = 0, voiceMap, signal } = {}) {
      aborted(signal); const packet = P.parse(pattern), value = snapshot(sourceState), bpm = tempo ?? packet.tempo, map = mapping(packet, voiceMap);
      // GALLEY time-rate can multiply its 40–240 BPM clock by ⅛–8. Keep that
      // render clock separate from the instrument project's 30–240 BPM dial.
      finite(bpm, 5, 1920, 'render tempo'); finite(tailSeconds, 0, 30, 'render tail');
      const mapped = { ...packet, voices: voices(), notes: packet.notes.map(note => ({ ...note, voice: map[note.voice] })) };
      const result = await audio.renderNotes({ state: value, pattern: mapped, tempo: bpm, lengthBeats: packet.lengthBeats, tailSeconds, signal, includePCM: true, name: packet.name });
      aborted(signal); return { ...result, name: packet.name, tempo: bpm, sourceApp: 'brine' };
    }
    function setTempo(tempo) {
      finite(tempo, 30, 240, 'project tempo'); const value = state(); if (value.tempo !== tempo) { if (typeof app.setTempo === 'function') app.setTempo(tempo, false); else app.loadState({ ...value, tempo }); } return true;
    }
    function audioScopes() {
      return { scopes: [{ id: 'pattern', label: 'Current phrase' }, { id: 'note', label: 'Single note' }, { id: 'chord', label: 'Held chord / first phrase chord' }], defaultScope: 'pattern', sampleRate: 48000, channels: 2, format: 'wav', maxBars: 64, defaultBars: Math.min(64, Math.max(1, Math.ceil(state().pattern.lengthBeats / 4))), maxTailSeconds: 30, defaultTailSeconds: global.BrineAudio.autoTail(state()) };
    }
    const adapter = {
      app: 'brine',
      get latency() { return audio.latencySeconds; },
      get notes() { return { voices: voices(), polyphonic: true, pitched: true, scheduledCancel: true, pitchRange: [0, 127], minPitch: 0, maxPitch: 127, latency: audio.latencySeconds }; },
      get patternExport() { return { scopes: [{ id: 'pattern', label: 'Current phrase · exact notes' }], defaultScope: 'pattern' }; },
      get patternImport() { return { targets: [{ id: 'pattern', name: 'Current phrase', occupied: state().pattern.notes.length > 0 }], voices: voices(), mode: 'notes', description: 'Map pitched parts to BRINE. Notes keep their timing, pitch, duration, velocity and chance; six synthesis voices handle overlaps.' }; },
      get nativeSequenceLoop() { return true; },
      exportPattern, capturePattern: exportPattern, importPattern, prepare, scheduleNote, cancelNotes, renderPattern, validateNote,
      validatePattern({ pattern, voiceMap } = {}) { mapping(P.parse(pattern), voiceMap); return true; },
      transport(clock = {}) { return audio.followTransport(clock); },
      panic() { return app.panic(); },
      get audioExport() { return audioScopes(); },
      async exportAudio(options = {}) { return audio.renderWav({ ...options, state: state() }); }
    };
    Object.defineProperty(global, 'MusicLabPatternInstrument', { value: Object.freeze(adapter), writable: false, configurable: false });
    if (global.MusicLabHost) {
      const hostAdapter = { ...adapter, getState: () => app.getProject(), getProject: () => app.getProject(), setState: value => app.loadState(snapshot(value)), tempo: setTempo, setTempo,
        async start({ tempo, when, fromBeat = 0, beat = fromBeat } = {}) { if (tempo !== undefined) setTempo(tempo); finite(beat, 0, 1000000, 'start beat'); if (when !== undefined) finite(when, 0, Number.MAX_SAFE_INTEGER, 'start time'); await prepare(); return app.play({ when, beat }); },
        play: options => app.play(options), stop: () => app.stop(), isPlaying: () => app.isPlaying() };
      for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(adapter))) if (descriptor.get) Object.defineProperty(hostAdapter, key, { get: descriptor.get, enumerable: true });
      global.MusicLabHost.registerInstrument(hostAdapter);
    }
    document.dispatchEvent(new CustomEvent('musiclab:app-ready', { bubbles: true, detail: { app: 'brine' } }));
  }
  document.addEventListener('musiclab:app-ready', event => { if (event.detail?.app === 'brine') install(); });
  document.addEventListener('DOMContentLoaded', install, { once: true }); install();
})(typeof window !== 'undefined' ? window : globalThis);
