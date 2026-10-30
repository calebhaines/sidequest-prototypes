/* MORSEL · saved words, voices and musical notes. No audio or DOM dependencies. */
(function (global) {
  'use strict';
  const VERSION = '1.0.0', MAX_PROJECT_BYTES = 2 * 1024 * 1024, MAX_LYRIC = 160;
  const VOICES = Object.freeze([
    Object.freeze({ id: 'alto', name: 'Alto', description: 'Warm, rounded and clear.' }),
    Object.freeze({ id: 'tenor', name: 'Tenor', description: 'Bright, forward and lyrical.' }),
    Object.freeze({ id: 'bass', name: 'Bass', description: 'Deep, woody and close.' }),
    Object.freeze({ id: 'robot', name: 'Robot', description: 'A cheerful singing machine.' })
  ]);
  const VOICE_IDS = Object.freeze(VOICES.map(voice => voice.id));
  const RANGES = Object.freeze({ tempo: [30, 240], swing: [0, .75], tone: [0, 1], air: [0, 1], vibrato: [0, 1], space: [0, 1], volume: [0, 1], attack: [.001, .5], release: [.005, 2] });
  const STEP_RANGES = Object.freeze({ pitch: [36, 84], velocity: [0, 1], gate: [.1, 1], probability: [0, 1] });
  const STATE_KEYS = ['name', 'tempo', 'swing', 'voice', 'lyric', 'phrase', 'length', 'division', 'tone', 'air', 'vibrato', 'space', 'volume', 'attack', 'release', 'steps', 'musicLabPattern'];
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const copy = value => JSON.parse(JSON.stringify(value));
  const choice = (value, values, fallback) => values.includes(value) ? value : fallback;
  const number = (value, range, fallback, integer = false) => {
    const n = typeof value === 'number' && Number.isFinite(value) ? Math.max(range[0], Math.min(range[1], value)) : fallback;
    return integer ? Math.round(n) : n;
  };
  const text = (value, fallback, limit) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, limit) : fallback;
  function step() { return { on: false, pitch: 60, lyric: 'ah', voice: 'inherit', velocity: .8, gate: .9, probability: 1 }; }
  function defaultState() {
    const steps = Array.from({ length: 32 }, step);
    ['hello', 'from', 'the', 'kitchen'].forEach((lyric, index) => Object.assign(steps[index * 4], { on: true, lyric, pitch: [60, 63, 67, 63][index] }));
    return { name: 'First words', tempo: 96, swing: 0, voice: 'alto', lyric: 'ah', phrase: 'hello from the kitchen', length: 16, division: .5,
      tone: .55, air: .12, vibrato: .1, space: .18, volume: .65, attack: .008, release: .09, steps };
  }
  function fail(label) { throw new Error('Invalid ' + label + ' in this MORSEL project.'); }
  function validNumber(value, range, label, integer = false) { if (typeof value !== 'number' || !Number.isFinite(value) || value < range[0] || value > range[1] || integer && !Number.isInteger(value)) fail(label); }
  function validText(value, limit, label) { if (typeof value !== 'string' || value.length > limit || /[\u0000-\u001f\u007f]/.test(value)) fail(label); }
  function validChoice(value, values, label) { if (!values.includes(value)) fail(label); }
  function validBool(value, label) { if (typeof value !== 'boolean') fail(label); }
  function checkSize(value) {
    let json;
    try { json = typeof value === 'string' ? value : JSON.stringify(value); } catch (_) { throw new Error('Choose a plain MORSEL project object.'); }
    if (typeof json !== 'string' || json.length > MAX_PROJECT_BYTES || new TextEncoder().encode(json).length > MAX_PROJECT_BYTES) throw new Error('MORSEL projects must fit within 2 MiB.');
    return json;
  }
  function overlay(value, defaultLyric = 'ah') {
    if (!object(value) || Object.keys(value).some(key => !['pattern', 'voiceMap'].includes(key)) || !object(value.voiceMap) || !global.MusicLabPatternSchema) fail('received phrase');
    const pattern = global.MusicLabPatternSchema.normalize(value.pattern), voiceMap = {};
    for (const voice of pattern.voices) {
      if (!own(value.voiceMap, voice.id) || !VOICE_IDS.includes(value.voiceMap[voice.id])) fail('received voice mapping');
      Object.defineProperty(voiceMap, voice.id, { value: value.voiceMap[voice.id], enumerable: true, writable: true, configurable: true });
    }
    if (Object.keys(value.voiceMap).some(key => !pattern.voices.some(voice => voice.id === key))) fail('received voice mapping');
    const utterances = new Set();
    for (const note of pattern.notes) {
      validNumber(note.pitch, STEP_RANGES.pitch, 'received note pitch', true);
      const grid = Math.round(note.beat * 4), beat = note.beat + (Math.abs(note.beat * 4 - grid) < 1e-7 && grid % 2 ? pattern.swing / 4 : 0);
      if (beat >= pattern.lengthBeats && note.velocity > 0 && note.probability > 0) fail('received swung note position');
      utterances.add(voiceMap[note.voice] + '\u0000' + (note.lyric?.trim() ? note.lyric : defaultLyric));
    }
    if (utterances.size > 64) throw new Error('Use at most 64 different voice-and-word combinations in one MORSEL phrase.');
    return { pattern, voiceMap };
  }
  function normalize(raw) {
    const d = defaultState(); raw = object(raw) ? raw : {};
    const result = { name: text(raw.name, d.name, 100), voice: choice(raw.voice, VOICE_IDS, d.voice), lyric: text(raw.lyric, d.lyric, MAX_LYRIC), phrase: text(raw.phrase, d.phrase, 512),
      length: choice(raw.length, [16, 32], d.length), division: choice(raw.division, [.25, .5, 1], d.division) };
    for (const [key, range] of Object.entries(RANGES)) result[key] = number(raw[key], range, d[key]);
    result.steps = Array.from({ length: 32 }, (_, index) => {
      const input = object(raw.steps?.[index]) ? raw.steps[index] : {}, fallback = d.steps[index];
      const output = { on: typeof input.on === 'boolean' ? input.on : fallback.on, lyric: text(input.lyric, fallback.lyric, MAX_LYRIC), voice: choice(input.voice, ['inherit', ...VOICE_IDS], fallback.voice) };
      for (const [key, range] of Object.entries(STEP_RANGES)) output[key] = number(input[key], range, fallback[key], key === 'pitch');
      return output;
    });
    if (raw.musicLabPattern !== undefined) result.musicLabPattern = overlay(raw.musicLabPattern, result.lyric);
    return result;
  }
  function validate(raw) {
    if (!object(raw) || Object.keys(raw).some(key => !STATE_KEYS.includes(key))) fail('recipe');
    validText(raw.name, 100, 'recipe name'); validText(raw.lyric, MAX_LYRIC, 'keyboard word'); validText(raw.phrase, 512, 'phrase');
    validChoice(raw.voice, VOICE_IDS, 'voice'); validChoice(raw.length, [16, 32], 'phrase length'); validChoice(raw.division, [.25, .5, 1], 'step division');
    for (const [key, range] of Object.entries(RANGES)) validNumber(raw[key], range, key);
    if (!Array.isArray(raw.steps) || raw.steps.length !== 32 || Object.keys(raw.steps).some(key => !/^\d+$/.test(key) || Number(key) > 31)) fail('step list');
    raw.steps.forEach((item, index) => {
      if (!object(item) || Object.keys(item).some(key => !['on', 'pitch', 'lyric', 'voice', 'velocity', 'gate', 'probability'].includes(key))) fail('step ' + (index + 1));
      validBool(item.on, 'step on/off'); validText(item.lyric, MAX_LYRIC, 'step word'); validChoice(item.voice, ['inherit', ...VOICE_IDS], 'step voice');
      for (const [key, range] of Object.entries(STEP_RANGES)) validNumber(item[key], range, 'step ' + key, key === 'pitch');
    });
    if (raw.musicLabPattern !== undefined) overlay(raw.musicLabPattern, raw.lyric);
    return normalize(raw);
  }
  function parseProject(value) {
    const json = checkSize(value);
    let parsed;
    try { parsed = JSON.parse(json); } catch (_) { throw new Error('This MORSEL project is not valid JSON.'); }
    if (object(parsed) && own(parsed, 'format')) {
      if (parsed.format !== 'morsel-project' || parsed.formatVersion !== 1 || parsed.appVersion !== VERSION || Object.keys(parsed).some(key => !['format', 'formatVersion', 'appVersion', 'state'].includes(key))) throw new Error('Choose a MORSEL 1.0 project.');
      return validate(parsed.state);
    }
    return validate(parsed);
  }
  const serializeProject = value => JSON.stringify({ format: 'morsel-project', formatVersion: 1, appVersion: VERSION, state: parseProject(value) });
  function noteName(pitch) { const note = Math.round(Math.max(0, Math.min(127, Number(pitch) || 0))); return ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'][note % 12] + (Math.floor(note / 12) - 1); }
  global.MorselSchema = Object.freeze({ VERSION, MAX_PROJECT_BYTES, MAX_LYRIC, VOICES, VOICE_IDS, RANGES, STEP_RANGES, copy, clone: copy, step, defaultState, normalize, parseProject, serializeProject, serialize: serializeProject, noteName });
})(typeof window === 'object' ? window : globalThis);
