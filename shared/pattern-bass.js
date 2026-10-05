/* Kitchen's ROUX adapter: exact portable notes for one deliberately monophonic bass voice. */
(() => {
  'use strict';
  if (!window.RouxApp || window.MusicLabPatternInstrument) return;
  const app = window.RouxApp, engine = app.engine, S = window.RouxSchema, P = window.MusicLabPatternSchema;
  if (!engine || !S || !P) throw new Error('ROUX pattern sharing needs the native bass engine and Kitchen pattern validator.');
  const copy = value => JSON.parse(JSON.stringify(value));
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const abort = signal => { if (signal?.aborted) throw new DOMException('Pattern operation cancelled.', 'AbortError'); };
  const state = () => app.getState();
  const range = () => Array.isArray(S.PITCH_RANGE) ? S.PITCH_RANGE : [12, 108];
  const voices = () => [{ id: 'bass', name: 'ROUX · monophonic bass', pitchRange: range().slice() }];
  const notify = () => {
    document.dispatchEvent(new CustomEvent('musiclab:patternchange', { detail: { app: 'roux' } }));
    window.MusicLabHost?.notifyStateChange?.();
  };
  const randomFor = seed => { let x = (seed >>> 0) || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; };
  function swung(note, packet) {
    const step = Math.round(note.beat * 4), onGrid = Math.abs(note.beat * 4 - step) < 1e-7;
    const beat = Math.min(packet.lengthBeats - 1 / 1024, note.beat + (onGrid && step % 2 ? packet.swing / 4 : 0));
    return { ...note, beat, duration: Math.min(note.duration, packet.lengthBeats - beat) };
  }
  const orderedNotes = packet => packet.notes.map(note => swung(note, packet)).sort((a, b) => a.beat - b.beat || a.id.localeCompare(b.id));
  function validateNote({ pitch, voice } = {}) {
    const [min, max] = range();
    if (!Number.isInteger(pitch) || pitch < min || pitch > max) throw new Error('ROUX supports MIDI notes ' + min + '–' + max + '. Transpose this part into that range.');
    if (voice !== 'bass') throw new Error('Map this part to ROUX’s bass voice.');
    return true;
  }
  function validateMapping(packet, voiceMap) {
    if (!voiceMap || Object.prototype.toString.call(voiceMap) !== '[object Object]') throw new Error('Map each source voice to ROUX’s bass voice.');
    const mapped = {};
    for (const source of packet.voices) {
      if (!own(voiceMap, source.id) || voiceMap[source.id] !== 'bass') throw new Error('Choose the bass destination for source voice “' + source.name + '”.');
      mapped[source.id] = 'bass';
    }
    if (Object.keys(voiceMap).some(id => !packet.voices.some(voice => voice.id === id))) throw new Error('The voice map refers to an unknown source voice.');
    for (const note of packet.notes) validateNote({ pitch: note.pitch, voice: mapped[note.voice] });
    // Overlaps provide legato; simultaneous onsets are chords and cannot be represented by one bass voice.
    const sounding = orderedNotes(packet).filter(note => note.velocity > 0 && note.probability > 0);
    for (let i = 1; i < sounding.length; i++) if (Math.abs(sounding[i].beat - sounding[i - 1].beat) < 1e-8) throw new Error('ROUX is monophonic. Choose a bass line with one note onset at a time; overlapping consecutive notes provide legato.');
    return mapped;
  }
  function validatePattern({ pattern, voiceMap } = {}) {
    const packet = P.parse(pattern);
    validateMapping(packet, voiceMap || Object.fromEntries(packet.voices.map(voice => [voice.id, 'bass'])));
    return true;
  }
  function nativePattern(snapshot, cycles = 4) {
    const recipe = S.compileRecipe(snapshot, { cycles });
    if (recipe.lengthBeats < .25) throw new Error('This turn is shorter than the portable-pattern minimum of ¼ beat. Choose the four-turn bass recipe.');
    return P.normalize({
      format: 'musiclab-pattern', version: 1, kind: 'notes', name: snapshot.name + (cycles === 1 ? ' · one-turn bass recipe' : ' · four-turn bass recipe'),
      sourceApp: 'ROUX', tempo: snapshot.tempo, swing: 0, lengthBeats: recipe.lengthBeats,
      meter: [4, 4], seed: snapshot.seed, tags: ['bass', 'roux', 'recipe'],
      voices: [{ id: 'bass', name: 'ROUX · monophonic bass', pitch: snapshot.root }],
      notes: recipe.notes.map(note => ({ id: note.id, pitch: note.pitch, beat: note.beat, duration: note.duration, velocity: note.velocity, voice: 'bass', probability: note.probability ?? 1 })),
    });
  }
  function exportPattern({ scope = 'pattern' } = {}) {
    if (!['pattern', 'recipe', 'turn'].includes(scope)) throw new Error('Choose the current bass part or native recipe.');
    const snapshot = state();
    if (scope === 'pattern' && snapshot.musicLabPattern) {
      const packet = P.clone(snapshot.musicLabPattern.pattern); packet.tempo = snapshot.tempo; return packet;
    }
    return nativePattern(snapshot, scope === 'turn' ? 1 : 4);
  }
  async function importPattern({ pattern, options = {}, signal } = {}) {
    abort(signal); const packet = P.parse(pattern), snapshot = state();
    if (options.target !== undefined && options.target !== 'pattern') throw new Error('Choose the bass performance pattern.');
    const occupied = snapshot.musicLabPattern ? snapshot.musicLabPattern.pattern.notes.length > 0 : nativePattern(snapshot).notes.length > 0;
    if (occupied && options.replace !== true) throw new Error('Confirm replacement of the current bass performance.');
    const voiceMap = validateMapping(packet, options.voiceMap);
    const candidate = S.normalize({ ...snapshot, musicLabPattern: { pattern: packet, voiceMap } });
    abort(signal); engine.stop(); app.loadState(candidate); notify();
    return { target: 'pattern', name: packet.name, notes: packet.notes.length, mode: 'notes', exact: true };
  }
  function clearImportedPattern() {
    const snapshot = state(); if (!snapshot.musicLabPattern) return false;
    delete snapshot.musicLabPattern; engine.stop(); app.loadState(snapshot); notify(); return true;
  }
  async function prepare() {
    await engine.init();
    if (engine.context?.state === 'suspended') await engine.context.resume();
    if (!engine.context || engine.context.state !== 'running') throw new Error('Tap Play to start ROUX’s audio engine.');
    return true;
  }
  function scheduleNote({ id, pitch, velocity = .8, voice, when, durationSeconds = .25, source = 'loom' } = {}) {
    validateNote({ pitch, voice });
    if (typeof velocity !== 'number' || !Number.isFinite(velocity) || velocity < 0 || velocity > 1 || !Number.isFinite(when) || when < 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 15360 || typeof source !== 'string' || !source.length) throw new Error('Choose a valid timed bass note.');
    if (!velocity) return;
    return engine.scheduleNote({ id, note: pitch, velocity, voiceId: 'bass', when, durationSeconds, source });
  }
  function cancelNotes({ source = 'loom', when } = {}) {
    if (typeof source !== 'string' || !source.length || when !== undefined && (!Number.isFinite(when) || when < 0)) throw new Error('Choose a valid note source and cancellation time.');
    return engine.stopNotes({ source, when });
  }
  async function renderPattern({ pattern, state: sourceState, tempo, tailSeconds = 0, voiceMap: explicitMap, signal } = {}) {
    abort(signal);
    const packet = P.parse(pattern);
    const snapshot = sourceState === undefined ? S.normalize(state()) : sourceState?.format === 'roux-project' ? S.parseProject(JSON.stringify(sourceState)) : S.normalize(copy(sourceState));
    const renderTempo = tempo === undefined ? packet.tempo : tempo;
    if (!Number.isFinite(renderTempo) || renderTempo < 5 || renderTempo > 1920 || !Number.isFinite(tailSeconds) || tailSeconds < 0 || tailSeconds > 30 || packet.lengthBeats * 60 / renderTempo + tailSeconds > 120) throw new Error('A source bass part must render within 120 seconds. Split the phrase or reduce its tail.');
    let map = explicitMap;
    if (!map && snapshot.musicLabPattern && P.fingerprint(snapshot.musicLabPattern.pattern) === P.fingerprint(packet)) map = snapshot.musicLabPattern.voiceMap;
    if (!map) map = Object.fromEntries(packet.voices.map(voice => [voice.id, 'bass']));
    const voiceMap = validateMapping(packet, map), random = randomFor(packet.seed ?? 1), events = [];
    for (const note of orderedNotes(packet)) if (note.velocity > 0 && random() < note.probability) events.push({ note: note.pitch, velocity: note.velocity, voiceId: voiceMap[note.voice], startBeat: note.beat, durationBeats: note.duration, source: 'render-pattern', id: note.id });
    const result = await engine.renderNotes({ events, state: snapshot, tempo: renderTempo, lengthBeats: packet.lengthBeats, tailSeconds, signal });
    abort(signal); return { ...result, name: packet.name, tempo: renderTempo, sourceApp: 'ROUX' };
  }
  const adapter = {
    get patternExport() { return { scopes: [{ id: 'pattern', label: state().musicLabPattern ? 'Imported bass performance' : 'Current bass recipe · four turns' }, { id: 'recipe', label: 'Native circular recipe · four turns' }, { id: 'turn', label: 'Native circular recipe · one turn' }], defaultScope: 'pattern' }; },
    get patternImport() { const snapshot = state(); return { targets: [{ id: 'pattern', name: 'Bass performance · exact portable notes', occupied: !!(snapshot.musicLabPattern ? snapshot.musicLabPattern.pattern.notes.length : nativePattern(snapshot).notes.length) }], voices: voices(), mode: 'notes', description: 'One bass voice, one note onset at a time. Overlapping consecutive notes play legato when enabled in the sound patch. Timing, duration, velocity, probability, and swing stay intact. Native recipe edits return to the circular sequence.' }; },
    get notes() { const [min, max] = range(); return { voices: voices(), polyphonic: false, pitched: true, scheduledCancel: true, pitchRange: [min, max], minPitch: min, maxPitch: max }; },
    get importedPattern() { return state().musicLabPattern ? P.clone(state().musicLabPattern.pattern) : null; },
    getImportedPattern() { return this.importedPattern; },
    exportPattern, importPattern, clearImportedPattern, validateNote, validatePattern, prepare, scheduleNote, cancelNotes, renderPattern,
    panic: () => engine.panic(),
  };
  Object.defineProperty(window, 'MusicLabPatternInstrument', { value: Object.freeze(adapter), writable: false, configurable: false });
})();
