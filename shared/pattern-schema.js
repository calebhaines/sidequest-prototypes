/* Kitchen portable, beat-based note patterns. No synthesis or browser dependencies. */
(function (global) {
  'use strict';
  if (global.MusicLabPatternSchema) return;
  const VERSION = 1, MAX_NOTES = 4096, MAX_VOICES = 64, MAX_BEATS = 256, MAX_BYTES = 1024 * 1024;
  const object = value => value && Object.prototype.toString.call(value) === '[object Object]';
  function text(value, name, max, fallback) {
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(name + ' must be text of at most ' + max + ' characters.');
    return value;
  }
  function number(value, name, min, max, fallback) {
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(name + ' must be between ' + min + ' and ' + max + '.');
    return value;
  }
  function identity(value, name) {
    const id = text(value, name, 80);
    if (!id || ['__proto__', 'prototype', 'constructor'].includes(id)) throw new Error(name + ' is invalid.');
    return id;
  }
  function normalize(input) {
    if (!object(input)) throw new Error('Choose a Kitchen note-pattern object.');
    if (input.format !== 'musiclab-pattern' || input.version !== VERSION) throw new Error('This is not a supported Kitchen note pattern (version 1).');
    const lengthBeats = number(input.lengthBeats, 'Pattern length', .25, MAX_BEATS);
    const meter = input.meter === undefined ? [4, 4] : input.meter;
    if (!Array.isArray(meter) || meter.length !== 2 || !Number.isInteger(meter[0]) || meter[0] < 1 || meter[0] > 16 || ![1, 2, 4, 8, 16].includes(meter[1])) throw new Error('Pattern meter must be a supported time signature.');
    if (!Array.isArray(input.voices) || input.voices.length < 1 || input.voices.length > MAX_VOICES) throw new Error('A note pattern needs 1–64 named source voices.');
    const voiceIds = new Set();
    const voices = input.voices.map((voice, index) => {
      if (!object(voice)) throw new Error('Source voice ' + (index + 1) + ' is invalid.');
      const id = identity(voice.id, 'Source voice ID');
      if (voiceIds.has(id)) throw new Error('Source voice IDs must be unique.');
      voiceIds.add(id);
      const result = { id, name: text(voice.name, 'Source voice name', 100, id) };
      if (voice.pitch !== undefined) { result.pitch = number(voice.pitch, 'Source voice pitch', 0, 127); if (!Number.isInteger(result.pitch)) throw new Error('Source voice pitch must be a MIDI note number.'); }
      return result;
    });
    if (!Array.isArray(input.notes) || input.notes.length > MAX_NOTES) throw new Error('A note pattern can contain at most 4,096 notes.');
    const noteIds = new Set();
    const notes = input.notes.map((note, index) => {
      if (!object(note)) throw new Error('Note ' + (index + 1) + ' is invalid.');
      const id = note.id === undefined ? 'n' + (index + 1) : identity(note.id, 'Note ID');
      if (noteIds.has(id)) throw new Error('Note IDs must be unique.');
      noteIds.add(id);
      const pitch = number(note.pitch, 'Note pitch', 0, 127);
      if (!Number.isInteger(pitch)) throw new Error('Note pitch must be a MIDI note number.');
      const beat = number(note.beat, 'Note position', 0, lengthBeats);
      const duration = number(note.duration, 'Note duration', Number.MIN_VALUE, lengthBeats);
      if (beat >= lengthBeats || beat + duration > lengthBeats + 1e-8) throw new Error('Notes must fit within the pattern length.');
      const voice = note.voice === undefined && voices.length === 1 ? voices[0].id : identity(note.voice, 'Note voice');
      if (!voiceIds.has(voice)) throw new Error('A note refers to a missing source voice.');
      return { id, pitch, beat, duration, velocity: number(note.velocity, 'Note velocity', 0, 1, .8), voice, probability: number(note.probability, 'Note probability', 0, 1, 1) };
    });
    const tags = input.tags === undefined ? [] : input.tags;
    if (!Array.isArray(tags) || tags.length > 24) throw new Error('Use at most 24 pattern tags.');
    const result = {
      format: 'musiclab-pattern', version: VERSION,
      name: text(input.name, 'Pattern name', 160, 'Untitled pattern'),
      sourceApp: text(input.sourceApp, 'Source app', 80, ''),
      kind: input.kind === undefined ? 'notes' : input.kind,
      tempo: number(input.tempo, 'Pattern tempo', 20, 400, 120),
      swing: number(input.swing, 'Pattern swing', 0, .75, 0),
      lengthBeats, meter: meter.slice(), voices, notes,
      tags: tags.map(tag => text(tag, 'Pattern tag', 40)),
    };
    if (!['notes', 'drums'].includes(result.kind)) throw new Error('Pattern kind must be notes or drums.');
    if (input.seed !== undefined) { const seed = number(input.seed, 'Pattern seed', 0, 4294967295); if (!Number.isInteger(seed)) throw new Error('Pattern seed must be an integer.'); result.seed = seed; }
    // Bound the canonical object as well as imported files.
    if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_BYTES) throw new Error('A portable note pattern must fit within 1 MiB.');
    return result;
  }
  function parse(value) {
    if (typeof value !== 'string') return normalize(value);
    if (value.length > MAX_BYTES || new TextEncoder().encode(value).length > MAX_BYTES) throw new Error('Choose a note-pattern file smaller than 1 MiB.');
    let parsed;
    try { parsed = JSON.parse(value); } catch (_) { throw new Error('This note-pattern file is not valid JSON.'); }
    return normalize(parsed);
  }
  const serialize = value => JSON.stringify(normalize(value));
  const clone = value => normalize(value);
  function fingerprint(value) {
    // Stable non-cryptographic content identity for detecting changed musical parts.
    const normalized = normalize(value), source = JSON.stringify(normalized);
    let hash = 2166136261;
    for (let index = 0; index < source.length; index++) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 16777619); }
    return 'pattern-v1-' + (hash >>> 0).toString(16).padStart(8, '0');
  }
  function durationSeconds(value, tempo) { const pattern = normalize(value); return pattern.lengthBeats * 60 / number(tempo === undefined ? pattern.tempo : tempo, 'Playback tempo', 20, 400); }
  global.MusicLabPatternSchema = Object.freeze({ VERSION, MAX_NOTES, MAX_VOICES, MAX_BEATS, MAX_BYTES, normalize, parse, serialize, clone, fingerprint, durationSeconds });
})(typeof window === 'object' ? window : globalThis);
