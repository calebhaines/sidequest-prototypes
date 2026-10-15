/* PICNIC's exact Kitchen notes and GALLEY shared-clock adapter. */
(function (global) {
  'use strict';
  const app = global.PicnicApp, S = global.PicnicSchema, Q = global.PicnicSequence, P = global.MusicLabPatternSchema;
  if (!app || !S || !Q || !P) throw new Error('PICNIC needs its app, score, and Kitchen pattern validator.');
  const audio = app.engine, ids = S.PARTS.map(part => part.id);
  let cachedNoteState = null;
  const noteState = () => cachedNoteState || (cachedNoteState = snapshot());
  document.addEventListener('musiclab:state-change', event => { if (event.detail?.app === 'picnic') cachedNoteState = null; });
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const abort = signal => { if (signal?.aborted) throw new DOMException('PICNIC operation cancelled.', 'AbortError'); };
  function finite(value, min, max, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Choose a valid ' + label + '.');
    return value;
  }
  function snapshot(value) {
    if (value === undefined) return S.parseProject(app.getState());
    if (value?.format === 'loom-instrument-state') {
      if (value.version !== 1 || value.app !== 'picnic') throw new Error('Choose a PICNIC instrument snapshot.');
      value = value.state;
    }
    return S.parseProject(value);
  }
  const presetFor = (value, voice) => {
    const part = value.parts.find(part => part.id === voice);
    const preset = global.PicnicLibrary.presets.find(preset => preset.id === part?.presetId);
    return { part, preset };
  };
  const voices = () => {
    const value = snapshot();
    return S.PARTS.map(part => {
      const sound = presetFor(value, part.id), transpose = sound.part.transpose;
      const low = Math.min(127, Math.max(0, Math.min(...sound.preset.regions.map(region => region.key[0])) - transpose));
      const high = Math.max(0, Math.min(127, Math.max(...sound.preset.regions.map(region => region.key[1])) - transpose));
      return { id: part.id, name: 'PICNIC · ' + part.name, pitchRange: [low, high] };
    });
  };
  function validateNote({ pitch, voice, velocity } = {}, value = noteState()) {
    if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) throw new Error('Choose a MIDI note from 0 to 127.');
    if (!ids.includes(voice)) throw new Error('Map this note to one of PICNIC’s six parts.');
    const { part, preset } = presetFor(value, voice), key = pitch + part.transpose;
    if (!preset.regions.some(region => key >= region.key[0] && key <= region.key[1])) throw new Error('“' + part.name + '” has no sample for note ' + pitch + ' at its current transpose. Choose another note, sound, or part.');
    if (velocity !== undefined && velocity > 0) {
      const level = Math.max(1, Math.min(127, Math.round(velocity * 127)));
      if (!preset.regions.some(region => key >= region.key[0] && key <= region.key[1] && level >= region.velocity[0] && level <= region.velocity[1])) throw new Error('This sample has no region for the chosen note and velocity. Choose another sound or velocity.');
    }
    return true;
  }
  function mapping(packet, map, value = snapshot()) {
    if (!map || Object.prototype.toString.call(map) !== '[object Object]') throw new Error('Map every source voice to a PICNIC part.');
    const result = {};
    for (const voice of packet.voices) {
      if (!own(map, voice.id) || !ids.includes(map[voice.id])) throw new Error('Choose a PICNIC part for “' + voice.name + '”.');
      Object.defineProperty(result, voice.id, { value: map[voice.id], enumerable: true });
    }
    if (Object.keys(map).some(key => !packet.voices.some(voice => voice.id === key))) throw new Error('The voice map contains an unknown source voice.');
    for (const note of packet.notes) {
      validateNote({ pitch: note.pitch, voice: result[note.voice], velocity: note.velocity }, value);
      const grid = Math.round(note.beat * 4);
      const beat = note.beat + (Math.abs(note.beat * 4 - grid) < 1e-7 && grid % 2 ? packet.swing / 4 : 0);
      if (beat >= packet.lengthBeats && note.velocity > 0 && note.probability > 0) throw new Error('Swing moves a note beyond the phrase end. Reduce swing or extend its length.');
    }
    return result;
  }
  function defaultMap(packet) {
    if (!packet.voices.every(voice => ids.includes(voice.id))) throw new Error('Map the source voices to PICNIC’s six parts before rendering.');
    return Object.fromEntries(packet.voices.map(voice => [voice.id, voice.id]));
  }
  function nativeState(value) { const result = S.clone(value); delete result.musicLabPattern; return result; }
  function exportPattern({ scope = 'pattern', name, signal } = {}) {
    abort(signal);
    if (!['pattern', 'native'].includes(scope)) throw new Error('Choose the current performance or native score.');
    const value = snapshot();
    if (scope === 'pattern' && value.musicLabPattern) {
      const packet = P.parse(value.musicLabPattern.pattern), map = mapping(packet, value.musicLabPattern.voiceMap, value);
      const mapped = new Set(packet.voices.map(voice => map[voice.id]));
      return P.normalize({ ...packet, name: name || packet.name, sourceApp: 'picnic', tempo: value.tempo,
        voices: voices().filter(voice => mapped.has(voice.id)).map(({ id, name }) => ({ id, name })), notes: packet.notes.map(note => ({ ...note, voice: map[note.voice] })) });
    }
    const score = nativeState(value), lengthBeats = Q.lengthBeats(score);
    const events = Q.events(score, { startBeat: 0, lengthBeats, realizeProbability: false });
    return P.normalize({ format: 'musiclab-pattern', version: 1, kind: 'notes', name: name || value.name + ' · PICNIC',
      sourceApp: 'picnic', tempo: value.tempo, swing: 0, lengthBeats, meter: [4, 4], seed: value.seed,
      tags: ['picnic', 'village', 'sampled-ensemble'], voices: voices().map(({ id, name }) => ({ id, name })),
      notes: events.filter(event => event.startBeat >= 0 && event.startBeat < lengthBeats).map((event, index) => ({
        id: 'picnic-' + (index + 1), voice: event.voice, pitch: event.pitch, beat: event.startBeat,
        duration: Math.min(event.durationBeats, lengthBeats - event.startBeat), velocity: event.velocity, probability: event.probability ?? 1
      })) });
  }
  function notify() {
    document.dispatchEvent(new CustomEvent('musiclab:patternchange', { detail: { app: 'picnic' } }));
    global.MusicLabHost?.notifyStateChange?.();
  }
  async function importPattern({ pattern, options = {}, signal } = {}) {
    abort(signal); abort(options.signal);
    const packet = P.parse(pattern), before = snapshot(), map = mapping(packet, options.voiceMap, before);
    if (options.target !== undefined && options.target !== 'pattern') throw new Error('Choose PICNIC’s received performance.');
    const occupied = before.musicLabPattern ? before.musicLabPattern.pattern.notes.length > 0 : Q.events(before).length > 0;
    if (occupied && options.replace !== true) throw new Error('Confirm replacing PICNIC’s current performance.');
    const candidate = S.parseProject({ ...before, musicLabPattern: { pattern: packet, voiceMap: map } });
    abort(signal); abort(options.signal);
    app.stop(); await app.loadState(candidate); notify();
    return { app: 'picnic', target: 'pattern', name: packet.name, notes: packet.notes.length, exact: true };
  }
  async function clearImportedPattern() {
    const value = snapshot(); if (!value.musicLabPattern) return false;
    delete value.musicLabPattern; app.stop(); await app.loadState(value); notify(); return true;
  }
  async function prepare() {
    await app.prepare();
    if (audio.context?.state === 'suspended') await audio.context.resume();
    if (!audio.context || audio.context.state === 'closed') throw new Error('Prepare PICNIC before scheduling notes.');
    cachedNoteState = snapshot();
    return true;
  }
  function scheduleNote({ id, pitch, velocity = .8, voice, when, durationSeconds = .25, source = 'loom' } = {}) {
    finite(velocity, 0, 1, 'velocity'); validateNote({ pitch, voice, velocity }); finite(when, 0, Number.MAX_SAFE_INTEGER, 'note time');
    finite(durationSeconds, Number.MIN_VALUE, 768, 'note duration');
    if (typeof source !== 'string' || !source.length || source.length > 200) throw new Error('Choose a valid note source.');
    if (!audio.context || audio.context.state === 'closed') throw new Error('Prepare PICNIC before scheduling notes.');
    if (!velocity) return;
    return audio.scheduleNote({ id, pitch, velocity, voice, when, durationSeconds, source });
  }
  function cancelNotes({ source = 'loom', when } = {}) {
    if (typeof source !== 'string' || !source.length || source.length > 200) throw new Error('Choose a valid note source.');
    if (when !== undefined) finite(when, 0, Number.MAX_SAFE_INTEGER, 'cancellation time');
    return audio.cancelNotes({ source, when });
  }
  async function renderPattern({ pattern, state: sourceState, tempo, tailSeconds = 0, voiceMap, signal } = {}) {
    abort(signal);
    const packet = P.parse(pattern), value = snapshot(sourceState), bpm = tempo ?? packet.tempo;
    finite(bpm, 20, 400, 'render tempo'); finite(tailSeconds, 0, 30, 'render tail');
    if (packet.lengthBeats * 60 / bpm + tailSeconds > 120) throw new Error('Split this phrase into sections no longer than 120 seconds including its tail.');
    const map = mapping(packet, voiceMap || (value.musicLabPattern && packet.voices.every(voice => own(value.musicLabPattern.voiceMap, voice.id))
      ? value.musicLabPattern.voiceMap : defaultMap(packet)), value);
    const performance = { ...value, musicLabPattern: { pattern: packet, voiceMap: map } };
    const events = Q.events(performance, { startBeat: 0, lengthBeats: packet.lengthBeats });
    const result = await audio.renderNotes({ state: value, events, tempo: bpm, lengthBeats: packet.lengthBeats, tailSeconds, signal });
    abort(signal); return { ...result, name: packet.name, tempo: bpm, sourceApp: 'picnic' };
  }
  async function setTempo(value) { finite(value, 40, 240, 'tempo between 40 and 240 BPM'); await app.setTempo(value); return true; }
  const adapter = {
    app: 'picnic', latency: 0,
    get notes() { return { voices: voices(), polyphonic: true, pitched: true, scheduledCancel: true, pitchRange: [0, 127], minPitch: 0, maxPitch: 127, latency: 0 }; },
    get patternExport() { return { scopes: [{ id: 'pattern', label: snapshot().musicLabPattern ? 'Received performance · exact notes' : 'Current score / bank chain' }, { id: 'native', label: 'Native score / bank chain' }], defaultScope: 'pattern' }; },
    get patternImport() {
      const value = snapshot(); return { targets: [{ id: 'pattern', name: 'Received performance · exact notes', occupied: !!(value.musicLabPattern ? value.musicLabPattern.pattern.notes.length : Q.events(value).length) }],
        voices: voices(), mode: 'notes', description: 'Map each source voice to a PICNIC part. Exact notes and timing stay editable and portable. Sound edits keep the received score.' };
    },
    get importedPattern() { const value = snapshot(); return value.musicLabPattern ? P.clone(value.musicLabPattern.pattern) : null; },
    getImportedPattern() { return this.importedPattern; },
    exportPattern, capturePattern: exportPattern, importPattern, clearImportedPattern, prepare, scheduleNote, cancelNotes, renderPattern, validateNote,
    validatePattern({ pattern, voiceMap } = {}) { const packet = P.parse(pattern); mapping(packet, voiceMap || defaultMap(packet)); return true; },
    panic() { app.panic(); }
  };
  Object.defineProperty(global, 'MusicLabPatternInstrument', { value: Object.freeze(adapter), writable: false });
  if (global.MusicLabHost) {
    const host = { ...adapter, getState: () => app.getProject(), getProject: () => app.getProject(), setState: value => app.loadState(snapshot(value)),
      tempo: setTempo, setTempo, async start({ tempo, when, fromBeat = 0, beat = fromBeat } = {}) {
        if (tempo !== undefined) await setTempo(tempo);
        finite(beat, 0, Number.MAX_SAFE_INTEGER, 'start beat'); if (when !== undefined) finite(when, 0, Number.MAX_SAFE_INTEGER, 'start time');
        await prepare(); return app.play({ when, beat });
      }, play: options => app.play(options), stop: () => app.stop(), panic: () => app.panic(), isPlaying: () => app.isPlaying(), exportAudio: options => app.exportAudio(options) };
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(adapter))) {
      if (descriptor.get) Object.defineProperty(host, key, { get: descriptor.get, enumerable: true });
    }
    Object.defineProperty(host, 'audioExport', { get: () => app.audioExport, enumerable: true });
    global.MusicLabHost.registerInstrument(host);
  }
  document.dispatchEvent(new CustomEvent('musiclab:app-ready', { bubbles: true, detail: { app: 'picnic' } }));
})(window);
