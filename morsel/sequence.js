/* MORSEL · deterministic words and notes, shared by live and offline playback. */
(function (global) {
  'use strict';
  const S = global.MorselSchema;
  const hash = text => { let value = 2166136261; for (let i = 0; i < text.length; i++) { value ^= text.charCodeAt(i); value = Math.imul(value, 16777619); } value ^= value >>> 16; value = Math.imul(value, 0x7feb352d); value ^= value >>> 15; return (value >>> 0) / 4294967296; };
  const lengthBeats = state => state.musicLabPattern ? state.musicLabPattern.pattern.lengthBeats : state.length * state.division;
  // Native duration is a musical value independent of the spacing grid. Auto
  // retains the original gap/articulation calculation for version 1.0 recipes.
  function noteTiming(state, index) {
    const step = state.steps?.[index], total = state.length * state.division;
    if (!step || !Number.isInteger(index) || index < 0 || index >= state.length) return { beat: 0, duration: 0, requestedDuration: 0, clipped: false };
    const beat = index * state.division + (index % 2 ? state.swing * state.division : 0);
    let requestedDuration = step.duration;
    if (requestedDuration === null || requestedDuration === undefined) {
      let until = Math.min(state.length, index + 4);
      for (let next = index + 1; next < until; next++) if (state.steps[next].on) { until = next; break; }
      const untilBeat = Math.min(total, until * state.division + (until < state.length && until % 2 ? state.swing * state.division : 0));
      requestedDuration = (untilBeat - beat) * step.gate;
    }
    const duration = Math.max(0, Math.min(requestedDuration, total - beat));
    return { beat, duration, requestedDuration, clipped: duration < requestedDuration - 1e-9 };
  }
  const noteDuration = (state, index) => noteTiming(state, index).duration;
  function events(input, options = {}) {
    const state = S.normalize(input), total = lengthBeats(state), start = Math.max(0, Number(options.startBeat) || 0), end = Math.min(total, start + (Number.isFinite(options.lengthBeats) ? Math.max(0, options.lengthBeats) : total));
    const cycle = Number.isFinite(options.cycle) ? Math.floor(options.cycle) : 0, realize = options.realizeProbability !== false;
    let notes;
    if (state.musicLabPattern) {
      const { pattern, voiceMap } = state.musicLabPattern;
      notes = pattern.notes.map((note, index) => {
        const grid = Math.round(note.beat * 4), delay = Math.abs(note.beat * 4 - grid) < 1e-7 && grid % 2 ? pattern.swing / 4 : 0;
        const beat = note.beat + delay;
        return { ...note, id: note.id || 'morsel-import-' + index, beat, duration: Math.min(note.duration, total - beat), voice: voiceMap[note.voice], lyric: note.lyric === undefined ? state.lyric : note.lyric };
      });
    } else {
      notes = [];
      for (let index = 0; index < state.length; index++) {
        const step = state.steps[index]; if (!step.on) continue;
        const { beat, duration } = noteTiming(state, index);
        notes.push({ id: 'morsel-step-' + (index + 1), pitch: step.pitch, beat, duration, velocity: step.velocity, probability: step.probability,
          voice: step.voice === 'inherit' ? state.voice : step.voice, lyric: step.lyric, step: index });
      }
    }
    return notes.filter(note => note.beat >= start - 1e-9 && note.beat < end && note.duration > 0 && note.velocity > 0 && (!realize || hash(note.id + ':' + cycle) < note.probability))
      .map(note => ({ ...note, duration: Math.min(note.duration, total - note.beat), probability: realize ? 1 : note.probability })).sort((a, b) => a.beat - b.beat || a.id.localeCompare(b.id));
  }
  function pattern(input, options = {}) {
    const state = S.normalize(input);
    if (options.native) delete state.musicLabPattern;
    const notes = events(state, { realizeProbability: false });
    const packet = { format: 'musiclab-pattern', version: 1, kind: 'notes', name: options.name || state.name + ' · MORSEL', sourceApp: 'morsel', tempo: state.tempo, swing: 0,
      lengthBeats: lengthBeats(state), meter: [4, 4], tags: ['morsel', 'voice', 'words'], voices: S.VOICES.map(({ id, name }) => ({ id, name: 'MORSEL · ' + name })),
      notes: notes.map(({ id, pitch, beat, duration, voice, velocity, probability, lyric }) => ({ id, pitch, beat, duration, voice, velocity, probability, lyric })) };
    return global.MusicLabPatternSchema ? global.MusicLabPatternSchema.normalize(packet) : packet;
  }
  global.MorselSequence = Object.freeze({ lengthBeats, noteTiming, noteDuration, events, compile: events, pattern });
})(typeof window === 'object' ? window : globalThis);
