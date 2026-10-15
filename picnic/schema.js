/* PICNIC's portable score. Factory sample IDs are resolved at runtime; no audio or DOM. */
(function (global) {
  'use strict';
  const VERSION = 1, MAX_PROJECT_BYTES = 2 * 1024 * 1024;
  const PARTS = Object.freeze([
    { id: 'melody', name: 'Village melody' }, { id: 'chords', name: 'Porch chords' },
    { id: 'bass', name: 'Walking home' }, { id: 'drums', name: 'Little footsteps' },
    { id: 'neighbors', name: 'Neighbors' }, { id: 'texture', name: 'Evening air' }
  ].map(Object.freeze));
  const SCALES = Object.freeze({ major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10], pentatonic: [0, 2, 4, 7, 9] });
  Object.values(SCALES).forEach(Object.freeze);
  const KEYS = Object.freeze(['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']);
  const SEASONS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);
  const WEATHER = Object.freeze(['clear', 'cloudy', 'rain', 'snow']);
  const CHORDS = Object.freeze({
    Imaj7: { degree: 0, intervals: [0, 4, 7, 11] }, I6: { degree: 0, intervals: [0, 4, 7, 9] },
    'I6/9': { degree: 0, intervals: [0, 4, 9, 14] }, ii7: { degree: 1, intervals: [0, 3, 7, 10] },
    iii7: { degree: 2, intervals: [0, 3, 7, 10] }, IVmaj7: { degree: 3, intervals: [0, 4, 7, 11] },
    IV6: { degree: 3, intervals: [0, 4, 7, 9] }, V7: { degree: 4, intervals: [0, 4, 7, 10] },
    V9: { degree: 4, intervals: [0, 4, 10, 14] }, vi7: { degree: 5, intervals: [0, 3, 7, 10] },
    'viiø7': { degree: 6, intervals: [0, 3, 6, 10] }, i7: { degree: 0, intervals: [0, 3, 7, 10] },
    i9: { degree: 0, intervals: [0, 3, 10, 14] }, iv7: { degree: 3, intervals: [0, 3, 7, 10] },
    bVImaj7: { degree: 5, semitone: 8, intervals: [0, 4, 7, 11] }, bVII7: { degree: 6, semitone: 10, intervals: [0, 4, 7, 10] }
  });
  Object.values(CHORDS).forEach(chord => { Object.freeze(chord.intervals); Object.freeze(chord); });
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const object = value => value && Object.prototype.toString.call(value) === '[object Object]';
  const clone = value => JSON.parse(JSON.stringify(value));
  function fail(label) { throw new Error('Invalid PICNIC ' + label + '.'); }
  function number(value, min, max, fallback, label, integer = false) {
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) fail(label);
    return value;
  }
  function text(value, fallback, max, label) {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) fail(label);
    return value;
  }
  function bool(value, fallback, label) { if (value === undefined) return fallback; if (typeof value !== 'boolean') fail(label); return value; }
  function choice(value, choices, fallback, label) { if (value === undefined) return fallback; if (!choices.includes(value)) fail(label); return value; }
  function libraryPresets() {
    const presets = global.PicnicLibrary?.presets;
    if (Array.isArray(presets)) return presets;
    if (object(presets)) return Object.entries(presets).map(([id, value]) => ({ ...value, id: value.id ?? id }));
    throw new Error('PICNIC’s factory sound library is unavailable.');
  }
  function presetId(value, fallback, label) {
    const id = value === undefined ? fallback : value;
    if (typeof id !== 'string' || !libraryPresets().some(preset => preset.id === id)) fail(label + ' factory sound');
    return id;
  }
  function createStep(overrides = {}) {
    if (!object(overrides)) fail('step');
    const notes = overrides.notes === undefined ? [60] : overrides.notes;
    if (!Array.isArray(notes) || notes.length > 6 || notes.some(note => !Number.isInteger(note) || note < 0 || note > 127)) fail('step notes (up to six MIDI notes)');
    if (new Set(notes).size !== notes.length) fail('duplicate step notes');
    return { on: bool(overrides.on, false, 'step enabled state'), notes: notes.slice(),
      velocity: number(overrides.velocity, 0, 1, .72, 'step velocity'), gate: number(overrides.gate, .05, 8, .85, 'step gate'),
      probability: number(overrides.probability, 0, 1, 1, 'step probability'), ratchet: number(overrides.ratchet, 1, 4, 1, 'step ratchet', true),
      offset: number(overrides.offset, -.49, .49, 0, 'step timing') };
  }
  function defaultParts() {
    const presets = libraryPresets();
    if (!presets.length || presets.some(preset => !preset || typeof preset.id !== 'string' || !preset.id)) throw new Error('PICNIC’s factory sound library is incomplete.');
    const defaults = global.PicnicLibrary.defaults || {};
    const levels = [.74, .53, .72, .55, .40, .30], pans = [.08, -.26, -.05, .18, .46, -.42];
    return PARTS.map((part, index) => ({ ...part, presetId: presetId(defaults[part.id], presets[Math.min(index, presets.length - 1)].id, part.name),
      level: levels[index], pan: pans[index], transpose: 0, attack: part.id === 'texture' ? .25 : 0,
      release: part.id === 'texture' ? 1.2 : .22, cutoff: part.id === 'texture' ? 6500 : 14000,
      reverb: part.id === 'drums' ? .08 : .22, delay: part.id === 'melody' ? .14 : .04, mute: false, solo: false }));
  }
  function baseBank(index) {
    const tracks = Object.fromEntries(PARTS.map(part => [part.id, Array.from({ length: 32 }, () => createStep())]));
    return { name: String.fromCharCode(65 + index), length: 32,
      chords: [['Imaj7', 'vi7', 'ii7', 'V9'], ['I6/9', 'iii7', 'IVmaj7', 'V7'], ['vi7', 'ii7', 'V9', 'I6'], ['IVmaj7', 'I6', 'ii7', 'V7']][index].slice(), tracks };
  }
  function createDefault() {
    const state = { version: VERSION, name: 'A little afternoon outside', tempo: 96, swing: .08, key: 0, scale: 'major', hour: 14,
      season: 'spring', weather: 'clear', seed: 12345,
      master: { level: .72, reverb: .18, delay: .10, tone: 14000 }, parts: defaultParts(),
      banks: Array.from({ length: 4 }, (_, index) => baseBank(index)), selectedBank: 0, chain: false, chainOrder: [0, 1, 2, 3] };
    // A complete small original sketch is useful even before sequence.js is loaded.
    for (let bank = 0; bank < 4; bank++) {
      const tracks = state.banks[bank].tracks;
      [0, 8, 16, 24].forEach((at, index) => {
        const chord = CHORDS[state.banks[bank].chords[index]], root = 48 + (chord.semitone ?? SCALES.major[chord.degree]);
        tracks.chords[at] = createStep({ on: true, notes: [root + 12, root + 12 + chord.intervals[1], root + 12 + chord.intervals[chord.intervals.length - 1]], velocity: .54, gate: 6 });
        tracks.bass[at] = createStep({ on: true, notes: [root - 12], velocity: .7, gate: 2.4 });
      });
      [0, 3, 6, 10, 16, 20, 23, 28].forEach((at, index) => { tracks.melody[(at + bank * 2) % 32] = createStep({ on: true, notes: [[72, 76, 79, 74, 71, 74, 77, 74][index]], velocity: .64 + (index % 3) * .06, gate: index % 3 ? .8 : 1.7 }); });
      [0, 8, 16, 24].forEach(at => { tracks.drums[at] = createStep({ on: true, notes: [36], velocity: .55, gate: .4 }); tracks.drums[at + 4] = createStep({ on: true, notes: [38], velocity: .4, gate: .3 }); });
      [2, 6, 10, 14, 18, 22, 26, 30].forEach(at => { tracks.drums[at] = createStep({ on: true, notes: [42], velocity: at % 8 === 2 ? .30 : .40, gate: .25 }); });
      tracks.neighbors[14 + bank] = createStep({ on: true, notes: [79 + bank], velocity: .38, gate: .6, probability: .65 });
      tracks.texture[0] = createStep({ on: true, notes: [60, 67], velocity: .3, gate: 8 });
    }
    return state;
  }
  function normalizeOverlay(overlay) {
    if (!object(overlay) || !object(overlay.voiceMap)) fail('received pattern and voice map');
    const schema = global.MusicLabPatternSchema;
    if (!schema) throw new Error('PICNIC’s exact note-pattern validator is unavailable.');
    const pattern = schema.parse(overlay.pattern), allowed = new Set(PARTS.map(part => part.id)), voiceMap = {};
    for (const voice of pattern.voices) {
      if (!own(overlay.voiceMap, voice.id) || !allowed.has(overlay.voiceMap[voice.id])) fail('received voice mapping');
      Object.defineProperty(voiceMap, voice.id, { value: overlay.voiceMap[voice.id], enumerable: true, writable: true, configurable: true });
    }
    if (Object.keys(overlay.voiceMap).some(id => !pattern.voices.some(voice => voice.id === id))) fail('unknown received voice mapping');
    return { pattern, voiceMap };
  }
  function normalize(raw = {}) {
    if (!object(raw)) fail('score');
    if (raw.version !== undefined && raw.version !== VERSION) fail('project version');
    const defaults = createDefault(), master = raw.master === undefined ? {} : raw.master;
    if (!object(master)) fail('master controls');
    const result = { version: VERSION, name: text(raw.name, defaults.name, 100, 'score name'),
      tempo: number(raw.tempo, 40, 240, defaults.tempo, 'tempo'), swing: number(raw.swing, 0, .75, defaults.swing, 'swing'),
      key: number(raw.key, 0, 11, defaults.key, 'key', true), scale: choice(raw.scale, Object.keys(SCALES), defaults.scale, 'scale'),
      hour: number(raw.hour, 0, 23, defaults.hour, 'hour', true), season: choice(raw.season, SEASONS, defaults.season, 'season'),
      weather: choice(raw.weather, WEATHER, defaults.weather, 'weather'), seed: number(raw.seed, 0, 0xffffffff, defaults.seed, 'random seed', true),
      master: { level: number(master.level, 0, 1, defaults.master.level, 'master level'), reverb: number(master.reverb, 0, 1, defaults.master.reverb, 'room amount'),
        delay: number(master.delay, 0, 1, defaults.master.delay, 'echo amount'), tone: number(master.tone, 100, 18000, defaults.master.tone, 'master tone') },
      selectedBank: number(raw.selectedBank, 0, 3, defaults.selectedBank, 'selected bank', true), chain: bool(raw.chain, false, 'chain state') };
    if (raw.parts !== undefined && (!Array.isArray(raw.parts) || raw.parts.length > 6)) fail('six parts');
    const incomingParts = raw.parts || [], seen = new Set();
    incomingParts.forEach(part => { if (!object(part) || !PARTS.some(candidate => candidate.id === part.id) || seen.has(part.id)) fail('part identity'); seen.add(part.id); });
    result.parts = defaults.parts.map(base => {
      const p = incomingParts.find(candidate => candidate.id === base.id) || {};
      return { id: base.id, name: text(p.name, base.name, 60, 'part name'), presetId: presetId(p.presetId, base.presetId, base.name),
        level: number(p.level, 0, 1, base.level, 'part level'), pan: number(p.pan, -1, 1, base.pan, 'part pan'),
        transpose: number(p.transpose, -24, 24, 0, 'part transpose', true), attack: number(p.attack, 0, 2, base.attack, 'part attack'),
        release: number(p.release, .005, 5, base.release, 'part release'), cutoff: number(p.cutoff, 100, 18000, base.cutoff, 'part tone'),
        reverb: number(p.reverb, 0, 1, base.reverb, 'part room send'), delay: number(p.delay, 0, 1, base.delay, 'part echo send'),
        mute: bool(p.mute, false, 'part mute'), solo: bool(p.solo, false, 'part solo') };
    });
    if (raw.banks !== undefined && (!Array.isArray(raw.banks) || raw.banks.length > 4)) fail('four pattern banks');
    result.banks = defaults.banks.map((base, index) => {
      const b = raw.banks?.[index] === undefined ? {} : raw.banks[index];
      if (!object(b) || b.tracks !== undefined && !object(b.tracks)) fail('pattern bank');
      const length = number(b.length, 16, 32, 32, 'bank length', true);
      if (![16, 32].includes(length)) fail('bank length (16 or 32 steps)');
      const chords = b.chords === undefined ? base.chords : b.chords;
      if (!Array.isArray(chords) || chords.length < 1 || chords.length > 8 || chords.some(chord => !own(CHORDS, chord))) fail('chord progression');
      const tracks = {};
      if (b.tracks && Object.keys(b.tracks).some(id => !PARTS.some(part => part.id === id))) fail('unknown pattern part');
      for (const part of PARTS) {
        const steps = b.tracks?.[part.id] === undefined ? base.tracks[part.id] : b.tracks[part.id];
        if (!Array.isArray(steps) || steps.length !== 32) fail('32 stored steps per part');
        tracks[part.id] = steps.map(step => createStep(step));
      }
      return { name: text(b.name, base.name, 32, 'bank name'), length, chords: chords.slice(), tracks };
    });
    const order = raw.chainOrder === undefined ? defaults.chainOrder : raw.chainOrder;
    if (!Array.isArray(order) || order.length < 1 || order.length > 16 || order.some(index => !Number.isInteger(index) || index < 0 || index > 3)) fail('chain order');
    result.chainOrder = order.slice();
    if (raw.musicLabPattern !== undefined) result.musicLabPattern = normalizeOverlay(raw.musicLabPattern);
    return result;
  }
  function requireKeys(value, keys, label) { if (!object(value) || keys.some(key => !own(value, key) || value[key] === undefined)) fail('incomplete ' + label); }
  function validateState(raw) {
    requireKeys(raw, ['version', 'name', 'tempo', 'swing', 'key', 'scale', 'hour', 'season', 'weather', 'seed', 'master', 'parts', 'banks', 'selectedBank', 'chain', 'chainOrder'], 'score');
    if (raw.version !== VERSION) fail('project version');
    requireKeys(raw.master, ['level', 'reverb', 'delay', 'tone'], 'master controls');
    if (!Array.isArray(raw.parts) || raw.parts.length !== 6 || !Array.isArray(raw.banks) || raw.banks.length !== 4) fail('six parts and four banks');
    raw.parts.forEach(part => requireKeys(part, ['id', 'name', 'presetId', 'level', 'pan', 'transpose', 'attack', 'release', 'cutoff', 'reverb', 'delay', 'mute', 'solo'], 'part'));
    raw.banks.forEach(bank => {
      requireKeys(bank, ['name', 'length', 'chords', 'tracks'], 'bank');
      requireKeys(bank.tracks, PARTS.map(part => part.id), 'bank tracks');
      PARTS.forEach(part => { const steps = bank.tracks[part.id]; if (!Array.isArray(steps) || steps.length !== 32) fail('32 stored steps'); steps.forEach(step => requireKeys(step, ['on', 'notes', 'velocity', 'gate', 'probability', 'ratchet', 'offset'], 'step')); });
    });
    return normalize(raw);
  }
  function sizeGuard(value) { let source; try { source = JSON.stringify(value); } catch (_) { fail('project JSON'); } if (new TextEncoder().encode(source).length > MAX_PROJECT_BYTES) throw new Error('Choose a PICNIC score smaller than 2 MiB.'); }
  function parseProject(value) {
    if (typeof value === 'string') {
      if (value.length > MAX_PROJECT_BYTES || new TextEncoder().encode(value).length > MAX_PROJECT_BYTES) throw new Error('Choose a PICNIC score smaller than 2 MiB.');
      try { value = JSON.parse(value); } catch (_) { throw new Error('Choose valid PICNIC project JSON.'); }
    }
    if (!object(value)) fail('project');
    sizeGuard(value);
    if (own(value, 'format')) {
      if (value.format !== 'picnic-project' || value.version !== VERSION || !own(value, 'state')) fail('project format or version');
      value = value.state;
    }
    return validateState(value);
  }
  function serializeProject(value) {
    const source = JSON.stringify({ format: 'picnic-project', version: VERSION, state: validateState(value) }, null, 2);
    if (new TextEncoder().encode(source).length > MAX_PROJECT_BYTES) throw new Error('This PICNIC score exceeds the 2 MiB project limit. Shorten the received phrase.');
    return source;
  }
  global.PicnicSchema = Object.freeze({ VERSION, MAX_PROJECT_BYTES, PARTS, SCALES, KEYS, SEASONS, WEATHER, CHORDS,
    createDefault, createStep, normalize, validateState, parseProject, serializeProject, clone });
})(typeof window === 'object' ? window : globalThis);
