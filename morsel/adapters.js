/* MORSEL · exact words, Kitchen exchange and GALLEY's shared musical clock. */
(function (global) {
  'use strict';
  let installed = false;
  function install() {
    if (installed || !global.MorselApp) return;
    const app = global.MorselApp, S = global.MorselSchema, Q = global.MorselSequence, P = global.MusicLabPatternSchema, audio = app.engine;
    if (!S || !Q || !P || !audio) throw new Error('MORSEL needs its saved recipe, native engine and Kitchen pattern validator.');
    installed = true;
    const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
    const abort = signal => { if (signal?.aborted) throw new DOMException('MORSEL operation cancelled.', 'AbortError'); };
    function finite(value, min, max, label) { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Choose a valid ' + label + '.'); return value; }
    function snapshot(value) {
      if (value === undefined) return S.parseProject(app.getState());
      if (value?.format === 'loom-instrument-state') {
        if (value.version !== 1 || value.app !== 'morsel') throw new Error('Choose a saved MORSEL instrument state.');
        value = value.state;
      }
      return S.parseProject(value);
    }
    const fallbackLyric = () => typeof audio.state?.lyric === 'string' ? audio.state.lyric : snapshot().lyric;
    const voices = () => S.VOICES.map(({ id, name }) => ({ id, name: 'MORSEL · ' + name, pitchRange: [36, 84] }));
    function validateNote({ pitch, voice, lyric } = {}) {
      if (!Number.isInteger(pitch) || pitch < 36 || pitch > 84) throw new Error('MORSEL sings notes from C2 to C6 (MIDI 36–84).');
      if (!S.VOICE_IDS.includes(voice)) throw new Error('Choose MORSEL’s Alto, Tenor, Bass or Robot voice.');
      if (lyric !== undefined && (typeof lyric !== 'string' || lyric.length > S.MAX_LYRIC || /[\u0000-\u001f\u007f]/.test(lyric))) throw new Error('Use words or sounds of at most 160 characters per note.');
      return true;
    }
    function defaultMap(packet, value = snapshot()) {
      return Object.fromEntries(packet.voices.map(voice => [voice.id, S.VOICE_IDS.includes(voice.id) ? voice.id : value.voice]));
    }
    function mapping(packet, map, value = snapshot()) {
      if (!map || Object.prototype.toString.call(map) !== '[object Object]') throw new Error('Map every source voice to one of MORSEL’s four voices.');
      const result = {}, utterances = new Set();
      for (const voice of packet.voices) {
        if (!own(map, voice.id) || !S.VOICE_IDS.includes(map[voice.id])) throw new Error('Choose a MORSEL voice for “' + voice.name + '”.');
        Object.defineProperty(result, voice.id, { value: map[voice.id], enumerable: true, writable: true, configurable: true });
      }
      if (Object.keys(map).some(key => !packet.voices.some(voice => voice.id === key))) throw new Error('The voice map contains an unknown source voice.');
      for (const note of packet.notes) {
        validateNote({ ...note, voice: result[note.voice] });
        const grid = Math.round(note.beat * 4), swung = note.beat + (Math.abs(note.beat * 4 - grid) < 1e-7 && grid % 2 ? packet.swing / 4 : 0);
        if (swung >= packet.lengthBeats && note.velocity > 0 && note.probability > 0) throw new Error('Swing moves a word beyond the phrase end. Reduce swing or extend the phrase.');
        utterances.add(result[note.voice] + '\u0000' + (note.lyric?.trim() ? note.lyric : value.lyric));
      }
      if (utterances.size > 64) throw new Error('Use at most 64 different voice-and-word combinations in one MORSEL phrase. Repeated words and melodies can contain more notes.');
      return result;
    }
    const announce = detail => document.dispatchEvent(new CustomEvent('morsel:transport', { detail }));
    const notify = () => { document.dispatchEvent(new CustomEvent('musiclab:patternchange', { detail: { app: 'morsel' } })); global.MusicLabHost?.notifyStateChange?.(); };
    const resolvedEvents = (packet, map, value, cycle = 0, realize = false) => Q.events({ ...value, musicLabPattern: { pattern: packet, voiceMap: map } }, { cycle, realizeProbability: realize });
    function exportPattern({ scope = 'pattern', name, signal } = {}) {
      abort(signal);
      if (!['pattern', 'native'].includes(scope)) throw new Error('Choose the current word phrase or native word steps.');
      return Q.pattern(snapshot(), { native: scope === 'native', name });
    }
    async function importPattern({ pattern, options = {}, signal } = {}) {
      abort(signal); abort(options.signal);
      const packet = P.parse(pattern), before = snapshot(), map = mapping(packet, options.voiceMap, before);
      if (options.target !== undefined && options.target !== 'pattern') throw new Error('Choose MORSEL’s received word phrase.');
      if (Q.events(before).length && options.replace !== true) throw new Error('Confirm replacing MORSEL’s current phrase.');
      const candidate = S.parseProject({ ...before, musicLabPattern: { pattern: packet, voiceMap: map } });
      abort(signal); abort(options.signal); stop(); await app.loadState(candidate); notify();
      return { app: 'morsel', target: 'pattern', name: packet.name, notes: packet.notes.length, exact: true };
    }
    async function clearImportedPattern() {
      const value = snapshot(); if (!value.musicLabPattern) return false;
      delete value.musicLabPattern; stop(); await app.loadState(value); notify(); return true;
    }
    async function prepare() {
      if (disposed) throw new DOMException('MORSEL has been closed.', 'AbortError');
      const value = snapshot(); audio.setState(value); await audio.init();
      if (disposed) throw new DOMException('MORSEL has been closed.', 'AbortError');
      if (audio.context?.state === 'suspended') await audio.context.resume();
      if (disposed) throw new DOMException('MORSEL has been closed.', 'AbortError');
      if (!audio.context || audio.context.state === 'closed') throw new Error('Prepare MORSEL before playing notes.');
      return true;
    }
    async function preparePattern({ pattern, voiceMap, tempo, signal } = {}) {
      abort(signal);
      const packet = P.parse(pattern), value = snapshot(), map = mapping(packet, voiceMap || defaultMap(packet, value), value), bpm = tempo ?? value.tempo;
      finite(bpm, 2.5, 3200, 'phrase tempo');
      await prepare(); abort(signal);
      await audio.prepareNotes({ state: value, events: resolvedEvents(packet, map, value), tempo: bpm, signal });
      abort(signal); return true;
    }
    function scheduleNote({ id, pitch, voice, lyric, velocity = .8, when, durationSeconds = .25, source = 'loom' } = {}) {
      if (disposed) return false;
      validateNote({ pitch, voice, lyric }); finite(velocity, 0, 1, 'note velocity'); finite(when, 0, Number.MAX_SAFE_INTEGER, 'note time'); finite(durationSeconds, Number.MIN_VALUE, 120, 'note duration up to 120 seconds');
      if (typeof source !== 'string' || !source.length || source.length > 200) throw new Error('Choose a valid note source.');
      if (!audio.context || audio.context.state === 'closed') throw new Error('Prepare MORSEL before scheduling notes.');
      if (!velocity) return false;
      return audio.scheduleNote({ id, pitch, voice, lyric: lyric?.trim() ? lyric : fallbackLyric(), velocity, when, durationSeconds, source });
    }
    function cancelNotes(options = {}) {
      if (disposed) return false;
      if (options.source !== undefined && (typeof options.source !== 'string' || !options.source.length || options.source.length > 200)) throw new Error('Choose a valid note source.');
      if (options.when !== undefined) finite(options.when, 0, Number.MAX_SAFE_INTEGER, 'cancellation time');
      return audio.stopNotes(options);
    }
    async function renderPattern({ pattern, state: sourceState, tempo, tailSeconds = 0, voiceMap, signal } = {}) {
      abort(signal);
      const packet = P.parse(pattern), value = snapshot(sourceState), bpm = tempo ?? packet.tempo;
      finite(bpm, 2.5, 3200, 'render tempo'); finite(tailSeconds, 0, 30, 'render tail');
      if (packet.lengthBeats * 60 / bpm + tailSeconds > 120) throw new Error('Split this word phrase into parts no longer than 120 seconds including its tail.');
      const map = mapping(packet, voiceMap || (value.musicLabPattern && packet.voices.every(voice => own(value.musicLabPattern.voiceMap, voice.id)) ? value.musicLabPattern.voiceMap : defaultMap(packet, value)), value);
      const result = await audio.renderNotes({ state: value, events: resolvedEvents(packet, map, value, 0, true), tempo: bpm, lengthBeats: packet.lengthBeats, tailSeconds, signal, includePCM: true });
      abort(signal); return { ...result, name: packet.name, tempo: bpm, sourceApp: 'morsel' };
    }

    let playing = false, preparing = false, disposed = false, disposal = null, generation = 0, timer = null, preparation = null, live = null, origin = 0, cycle = 0, index = 0, stepTimers = new Set();
    const pendingPreviews = new Set();
    const signature = value => JSON.stringify([value.tempo, value.swing, value.voice, value.lyric, value.length, value.division, value.steps, value.musicLabPattern]);
    const previewSignature = value => JSON.stringify([value.voice, value.lyric, value.steps[Number.isInteger(app.selectedStep) ? app.selectedStep : 0]]);
    const clearTimers = () => { if (timer !== null) clearInterval(timer); timer = null; for (const item of stepTimers) clearTimeout(item); stepTimers.clear(); };
    function halt(all = false) {
      generation++; preparation?.abort(); preparation = null; for (const pending of pendingPreviews) pending.controller.abort(); clearTimers(); playing = preparing = false;
      audio.stopNotes(all ? {} : { source: 'morsel-native' }); announce({ playing: false, preparing: false, step: -1 });
    }
    function stop() { if (disposed) return; halt(true); audio.stop?.(); }
    function panic() { if (disposed) return; halt(true); audio.panic(); announce({ playing: false, preparing: false, step: -1, message: 'All voices quiet.' }); }
    function dispose() {
      if (disposal) return disposal;
      disposed = true; generation++; preparation?.abort(); preparation = null;
      for (const pending of pendingPreviews) pending.controller.abort();
      clearTimers(); playing = preparing = false; live = null;
      global.removeEventListener?.('morsel:change', change);
      // Disposal runs after GALLEY can invalidate its context facade. Unlike
      // ordinary Stop, it must never replace a room graph or create AudioNodes.
      disposal = (async () => { await audio.dispose?.(); })(); return disposal;
    }
    function tick() {
      if (disposed || !playing || !live || !audio.context) return;
      const seconds = 60 / live.value.tempo, length = Q.lengthBeats(live.value), now = audio.context.currentTime;
      let guard = 0;
      while (guard++ < 8192) {
        if (index >= live.events.length) {
          if (origin + (cycle + 1) * length * seconds > now + .15) break;
          index = 0; cycle++; live.events = Q.events(live.value, { cycle }); if (!live.events.length) continue;
        }
        const note = live.events[index], beat = cycle * length + note.beat, when = origin + beat * seconds;
        if (when > now + .15) break;
        index++;
        if (when < now - .025) continue;
        scheduleNote({ ...note, when: Math.max(now, when), durationSeconds: note.duration * seconds, source: 'morsel-native' });
        const expected = generation, step = note.step ?? Math.min(live.value.length - 1, Math.floor(note.beat / live.value.division));
        const display = setTimeout(() => { stepTimers.delete(display); if (playing && generation === expected) announce({ playing: true, preparing: false, step }); }, Math.max(0, (when - audio.context.currentTime) * 1000));
        stepTimers.add(display);
      }
    }
    async function start({ when, beat = 0 } = {}) {
      if (disposed) return false;
      if (when !== undefined) finite(when, 0, Number.MAX_SAFE_INTEGER, 'start time'); finite(beat, 0, Number.MAX_SAFE_INTEGER, 'start beat');
      halt(false); const expected = generation, value = snapshot(), signal = (preparation = new AbortController()).signal;
      preparing = true; live = { value, signature: signature(value), events: [] }; announce({ playing: false, preparing: true, message: 'Preparing your words…' });
      try {
        await prepare();
        await audio.prepareNotes({ state: value, events: Q.events(value, { realizeProbability: false }), tempo: value.tempo, signal,
          onProgress: (completed, total) => { if (generation === expected) announce({ playing: false, preparing: true, message: 'Preparing your words…', progress: total ? completed / total : 1 }); } });
        abort(signal); if (generation !== expected) return false;
        preparation = null; preparing = false; playing = true; const length = Q.lengthBeats(value), startTime = Math.max(audio.context.currentTime + .03, when ?? 0);
        cycle = Math.floor(beat / length); origin = startTime - beat * 60 / value.tempo; live = { value, signature: signature(value), events: Q.events(value, { cycle }) };
        index = live.events.findIndex(note => note.beat >= beat % length - 1e-9); if (index < 0) index = live.events.length;
        announce({ playing: true, preparing: false, message: 'Words on the beat.' }); tick(); timer = setInterval(tick, 20); return true;
      } catch (error) {
        if (generation === expected) { halt(false); if (error.name !== 'AbortError') announce({ playing: false, preparing: false, message: error.message }); }
        if (error.name === 'AbortError') return false; throw error;
      }
    }
    async function preview(note = {}) {
      if (disposed) return false;
      const expected = generation, value = snapshot();
      const event = { pitch: note.pitch ?? 60, voice: note.voice === 'inherit' || note.voice === undefined ? value.voice : note.voice,
        lyric: note.lyric?.trim() ? note.lyric : value.lyric, velocity: note.velocity ?? .8, durationSeconds: note.durationSeconds ?? 1, source: note.source || 'morsel-preview' };
      validateNote(event);
      const pending = { controller: new AbortController(), signature: previewSignature(value) }; pendingPreviews.add(pending);
      try {
        await prepare(); abort(pending.controller.signal); if (generation !== expected) return false;
        return await audio.preview({ ...event, signal: pending.controller.signal });
      } catch (error) { if (error.name === 'AbortError') return false; throw error; }
      finally { pendingPreviews.delete(pending); }
    }
    async function exportAudio({ scope = 'phrase', bars = 2, tailSeconds = .3, signal } = {}) {
      abort(signal); const value = snapshot(); finite(tailSeconds, 0, 20, 'export tail');
      if (scope === 'note' || scope === 'sample') {
        const selected = value.steps[Number.isInteger(app.selectedStep) ? app.selectedStep : 0], voice = selected.voice === 'inherit' ? value.voice : selected.voice;
        const lyric = selected.lyric?.trim() ? selected.lyric : value.lyric;
        const events = [{ id: 'morsel-word', pitch: selected.pitch, beat: 0, duration: 2, voice, lyric, velocity: selected.velocity ?? .8, probability: 1 }];
        const result = await audio.renderNotes({ state: value, events, tempo: value.tempo, lengthBeats: 2, tailSeconds, signal, includePCM: true });
        abort(signal); return { ...result, name: lyric + ' · ' + S.VOICES.find(item => item.id === voice).name, tempo: value.tempo, sourceApp: 'morsel' };
      }
      if (!['phrase', 'pattern'].includes(scope)) throw new Error('Choose the word phrase or selected word.');
      const packet = Q.pattern(value), seconds = packet.lengthBeats * 60 / value.tempo + tailSeconds;
      if (seconds > 120) throw new Error('Shorten this word phrase to export no more than 120 seconds including its tail.');
      return renderPattern({ pattern: packet, state: value, tempo: value.tempo, tailSeconds, voiceMap: defaultMap(packet, value), signal });
    }
    function change(event) {
      if (disposed || !event?.detail?.state) return;
      const value = S.normalize(event.detail.state);
      for (const pending of pendingPreviews) if (pending.signature !== previewSignature(value)) pending.controller.abort();
      if (!playing && !preparing) return;
      if (live?.signature === signature(value)) return;
      start().catch(error => app.setStatus?.(error.message));
    }
    global.addEventListener('morsel:change', change);
    const audioExport = { defaultBars: 2, maxBars: 16, scopes: [{ id: 'phrase', label: 'Current word phrase', usesBars: false }, { id: 'note', label: 'Selected word / sound', usesBars: false }] };
    const controller = { start, play: start, stop, panic, dispose, preview, prepare, exportAudio, getPattern: () => exportPattern(), isPlaying: () => playing, isPreparing: () => preparing };
    Object.defineProperty(global, 'MorselController', { value: Object.freeze(controller), writable: false });
    for (const [key, value] of Object.entries({ start, play: start, stop, panic, preview, prepare, exportAudio, isPlaying: controller.isPlaying, isPreparing: controller.isPreparing })) if (!own(app, key)) app[key] = value;
    if (!own(app, 'audioExport')) Object.defineProperty(app, 'audioExport', { get: () => audioExport, enumerable: true });
    const adapter = {
      app: 'morsel', latency: 0, nativeSequenceLoop: true, voiceEffectsClock: true,
      get preparationSignature() {
        const current = fallbackLyric();
        return JSON.stringify([current.trim().replace(/\s+/g, ' ') || 'ah']);
      },
      get notes() { return { voices: voices(), lyrics: true, polyphonic: true, pitched: true, scheduledCancel: true, pitchRange: [36, 84], minPitch: 36, maxPitch: 84, latency: 0 }; },
      get patternExport() { return { scopes: [{ id: 'pattern', label: snapshot().musicLabPattern ? 'Received word phrase · exact notes' : 'Current words and melody' }, { id: 'native', label: 'Native word steps' }], defaultScope: 'pattern' }; },
      get patternImport() { const value = snapshot(); return { targets: [{ id: 'pattern', name: 'Word phrase', occupied: Q.events(value).length > 0 }], voices: voices(), mode: 'notes', description: 'Map notes to Alto, Tenor, Bass or Robot. Words travel with each note; notes without words use your keyboard word.' }; },
      get importedPattern() { return snapshot().musicLabPattern?.pattern || null; }, getImportedPattern() { return this.importedPattern; },
      exportPattern, capturePattern: exportPattern, importPattern, clearImportedPattern, prepare, preparePattern, scheduleNote, cancelNotes, renderPattern, validateNote,
      validatePattern({ pattern, voiceMap } = {}) { const packet = P.parse(pattern), value = snapshot(); mapping(packet, voiceMap || defaultMap(packet, value), value); return true; },
      transport(clock = {}) { return audio.followTransport?.(clock); }, panic
    };
    Object.defineProperty(global, 'MusicLabPatternInstrument', { value: Object.freeze(adapter), writable: false });
    if (global.MusicLabHost) {
      const setTempo = async tempo => { finite(tempo, 30, 240, 'tempo between 30 and 240 BPM'); const value = snapshot(); if (value.tempo !== tempo) await app.loadState({ ...value, tempo }); return true; };
      const host = { ...adapter, getState: () => app.getProject(), getProject: () => app.getProject(), setState: value => app.loadState(snapshot(value)), tempo: setTempo, setTempo,
        async start({ tempo, when, fromBeat = 0, beat = fromBeat } = {}) { if (tempo !== undefined) await setTempo(tempo); return start({ when, beat }); },
        play: start, stop, panic, isPlaying: () => playing, exportAudio };
      for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(adapter))) if (descriptor.get) Object.defineProperty(host, key, { get: descriptor.get, enumerable: true });
      Object.defineProperty(host, 'audioExport', { get: () => audioExport, enumerable: true }); global.MusicLabHost.registerInstrument(host);
    }
    document.dispatchEvent(new CustomEvent('musiclab:app-ready', { bubbles: true, detail: { app: 'morsel' } }));
  }
  document.addEventListener('musiclab:app-ready', event => { if (event.detail?.app === 'morsel') install(); });
  document.addEventListener('DOMContentLoaded', install, { once: true }); install();
})(typeof window === 'object' ? window : globalThis);
