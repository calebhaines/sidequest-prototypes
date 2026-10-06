/* MARINADE portable state. Audio travels with the recipe; imports validate before mutation. */
(function (global) {
  'use strict';
  const VERSION = '1.0.0';
  const LIMITS = Object.freeze({ projectBytes: 16 * 1024 * 1024, sampleSeconds: 20, sampleRate: 22050, sampleFrames: 441000, samples: 2, steps: 16 });
  const FACTORY_IDS = Object.freeze(['vowel-choir', 'whisper-vowel', 'brass-vowel', 'glass-bell', 'ceramic-chime', 'piano-wire', 'felt-keys', 'bowed-glass', 'cello-scrape', 'reed-organ', 'breath-flute', 'copper-brass', 'steam-hiss', 'rain-pan', 'iron-chain', 'motor-hum', 'gear-rattle', 'tin-scrape', 'water-bubbles', 'ice-crackle', 'wooden-knock', 'brushed-snare', 'sub-bloom', 'plucked-string']);
  const SCALES = Object.freeze({ major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], pentatonic: [0, 3, 5, 7, 10], chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] });
  const DIVISIONS = Object.freeze({ '1/32': .125, '1/16': .25, '1/16T': 1 / 6, '1/8': .5, '1/8T': 1 / 3, '1/4': 1 });
  const ENUMS = Object.freeze({ scale: Object.keys(SCALES), division: Object.keys(DIVISIONS), chord: ['single', 'major', 'minor', 'fifth', 'sus2'], scanMode: ['loop', 'pingpong', 'oneShot'], filterType: ['lp', 'hp', 'bp'], lfoShape: ['sine', 'triangle', 'saw', 'square', 'sampleHold'], lfoSync: ['free', '1/1', '1/2', '1/4', '1/8', '1/16', '1/8T', '1/16T'], lfoTarget: ['morph', 'pitchBlend', 'position', 'formant', 'cutoff', 'pan'], delayDivision: ['1/32', '1/16', '1/16T', '1/8', '1/8T', '3/16', '1/4', '1/4T', '3/8', '1/2', '3/4', '1/1'] });
  const RANGES = Object.freeze({ tempo: [20, 400], swing: [0, .75], root: [0, 127], seed: [0, 4294967295], sample: { rootNote: [0, 127], trimStart: [0, 1], trimEnd: [0, 1], position: [0, 1], gain: [0, 2] }, synth: { morph: [0, 1], pitchBlend: [0, 1], texture: [0, 1], textureBlend: [0, 1], transient: [0, 1], transientBlend: [0, 1], scanRate: [-2, 2], formantShift: [-24, 24], inharmonic: [0, 1], smear: [0, 1], spread: [0, 1] }, envelope: { attack: [.001, 8], decay: [.001, 8], sustain: [0, 1], release: [.005, 12] }, filter: { cutoff: [20, 20000], resonance: [0, .85], envAmount: [-5, 5], keytrack: [0, 1] }, lfo: { rate: [.02, 20], depth: [0, 1] }, morphPath: { beats: [1, 32], depth: [0, 1] }, sequence: { length: [1, 16], transpose: [-36, 36], gate: [.05, 2] }, step: { note: [0, 127], velocity: [0, 1], gate: [.05, 2], probability: [0, 1], ratchet: [1, 4], offset: [-.45, .45] }, fx: { drive: [0, 1], chorus: [0, 1], delay: [0, 1], feedback: [0, .85], space: [0, 1], width: [0, 1.5], volume: [0, 1] } });
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.prototype.toString.call(value) === '[object Object]';
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  function copy(value) {
    // PCM base64 is an immutable string. Copy containers and retain their string leaves,
    // avoiding a multi-megabyte JSON encode/decode for every knob and Undo gesture.
    const active = new WeakSet(); let containers = 0;
    function visit(input, depth) {
      if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
      if (typeof input === 'number') return Number.isFinite(input) ? input : null;
      if (input === undefined || typeof input === 'function' || typeof input === 'symbol') return undefined;
      if (typeof input !== 'object' || !Array.isArray(input) && !object(input)) throw new Error('MARINADE state copies need plain JSON objects.');
      if (depth > 48 || ++containers > 100000 || active.has(input)) throw new Error('MARINADE state copies cannot be cyclic or excessively nested.');
      active.add(input); let result;
      if (Array.isArray(input)) {
        if (input.length > 100000) throw new Error('MARINADE state copies cannot contain unbounded arrays.');
        result = Array.from({ length: input.length }, (_, index) => { const item = visit(input[index], depth + 1); return item === undefined ? null : item; });
      } else {
        result = {};
        for (const key of Object.keys(input)) { const item = visit(input[key], depth + 1); if (item !== undefined) Object.defineProperty(result, key, { value: item, enumerable: true, writable: true, configurable: true }); }
      }
      active.delete(input); return result;
    }
    return visit(value, 0);
  }
  const clamp = (value, range, fallback, integer = false) => { const result = typeof value === 'number' && Number.isFinite(value) ? Math.max(range[0], Math.min(range[1], value)) : fallback; return integer ? Math.round(result) : result; };
  const choice = (value, values, fallback) => values.includes(value) ? value : fallback;
  const bool = (value, fallback) => typeof value === 'boolean' ? value : fallback;
  const text = (value, fallback, max = 100) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : fallback;
  const step = () => ({ on: true, note: 60, velocity: .8, gate: 1, probability: 1, ratchet: 1, offset: 0, chord: 'single', protect: false });
  function defaultState() {
    return { name: 'Glass in the walk-in', tempo: 96, swing: .1, root: 60, scale: 'minor', seed: 195936478,
      samples: [{ ref: { kind: 'factory', id: 'glass-bell' }, rootNote: 69, trimStart: 0, trimEnd: 1, position: .15, freeze: false, reverse: false, gain: 1 }, { ref: { kind: 'factory', id: 'vowel-choir' }, rootNote: 57, trimStart: 0, trimEnd: 1, position: .25, freeze: false, reverse: false, gain: 1 }],
      synth: { morph: .5, pitchBlend: .5, texture: .15, textureBlend: .5, transient: .2, transientBlend: .5, scanRate: .5, scanMode: 'pingpong', formantShift: 0, formantLock: true, inharmonic: .08, smear: .2, spread: .55, amp: { attack: .02, decay: .5, sustain: .65, release: 1.2 }, filter: { type: 'lp', cutoff: 9500, resonance: .1, envAmount: 1, keytrack: .25 }, filterEnv: { attack: .01, decay: .6, sustain: .2, release: .6 }, lfo: { shape: 'sine', rate: .3, sync: 'free', depth: .12, target: 'morph', retrigger: false } },
      morphPath: { enabled: true, beats: 4, depth: .65, points: [.15, .2, .3, .45, .6, .75, .85, .8, .7, .55, .45, .35, .25, .2, .15, .15] },
      sequence: { division: '1/8', length: 16, transpose: 0, gate: .65, steps: [60, 67, 63, 70, 72, 67, 75, 70, 65, 72, 68, 75, 67, 74, 70, 77].map((note, index) => ({ ...step(), note, velocity: index % 4 === 0 ? .9 : index % 2 ? .64 : .78 })) },
      fx: { drive: .1, chorus: .22, delay: .16, delayDivision: '3/16', feedback: .3, space: .28, width: 1, volume: .7 } };
  }
  function fail(label) { throw new Error('Invalid ' + label + ' in this MARINADE project.'); }
  function keys(value, allowed, label, optional = []) {
    if (!object(value)) fail(label);
    for (const key of Reflect.ownKeys(value)) if (typeof key !== 'string' || !allowed.includes(key)) throw new Error('Unknown field ' + String(key) + ' in MARINADE ' + label + '.');
    for (const key in value) if (!own(value, key)) throw new Error('Inherited field ' + key + ' is not allowed in MARINADE ' + label + '.');
    for (const key of allowed) if (!optional.includes(key) && !own(value, key)) throw new Error('Missing field ' + key + ' in MARINADE ' + label + '.');
  }
  function validNumber(value, range, label, integer = false) { if (typeof value !== 'number' || !Number.isFinite(value) || value < range[0] || value > range[1] || integer && !Number.isInteger(value)) fail(label); }
  function validText(value, label, max = 100) { if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) fail(label); }
  function validBool(value, label) { if (typeof value !== 'boolean') fail(label); }
  function validChoice(value, values, label) { if (!values.includes(value)) fail(label); }
  function validNumbers(raw, ranges, label, integerKeys = []) { if (!object(raw)) fail(label); for (const key of Object.keys(ranges)) validNumber(raw[key], ranges[key], label + ' ' + key, integerKeys.includes(key)); }
  function numbers(raw, defaults, ranges, integerKeys = []) { const out = {}; for (const key of Object.keys(ranges)) out[key] = clamp(raw[key], ranges[key], defaults[key], integerKeys.includes(key)); return out; }
  function byteLength(value) { return typeof TextEncoder === 'function' ? new TextEncoder().encode(value).length : encodeURIComponent(value).replace(/%[0-9A-F]{2}|./g, 'x').length; }
  function checkSize(value, budget = LIMITS.projectBytes, name = 'MARINADE projects') { let json; try { json = typeof value === 'string' ? value : JSON.stringify(value); } catch (_) { throw new Error('The project must be a plain JSON object.'); } if (typeof json !== 'string' || json.length > budget || byteLength(json) > budget) throw new Error(name + ' must fit within ' + (budget / 1048576) + ' MiB.'); return json; }
  const validatedPCM = new Map();
  function validateRef(ref) {
    if (!object(ref)) fail('sample reference');
    if (ref.kind === 'factory') { keys(ref, ['kind', 'id'], 'factory sample'); validChoice(ref.id, FACTORY_IDS, 'factory sample ID'); return { kind: 'factory', id: ref.id }; }
    if (ref.kind !== 'pcm') fail('sample reference kind');
    keys(ref, ['kind', 'name', 'sampleRate', 'channels', 'frames', 'data'], 'custom sample'); validText(ref.name, 'sample name', 160);
    if (ref.sampleRate !== LIMITS.sampleRate || ref.channels !== 1) throw new Error('Portable MARINADE samples must be 22,050 Hz mono PCM16.');
    validNumber(ref.frames, [1, LIMITS.sampleFrames], 'sample frame count', true);
    const bytes = ref.frames * 2, expected = Math.ceil(bytes / 3) * 4;
    if (typeof ref.data !== 'string' || ref.data.length !== expected) throw new Error('The custom sample has invalid or incomplete PCM16 audio data.');
    // Stable audio strings recur through knob changes and Undo. Keep four validated strings,
    // rather than scanning up to 1.2 MiB of base64 on every small parameter update.
    if (!validatedPCM.has(ref.data)) {
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(ref.data)) throw new Error('The custom sample has invalid or incomplete PCM16 audio data.');
      const remainder = bytes % 3, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      if (remainder === 0 ? ref.data.includes('=') : remainder === 1 ? !ref.data.endsWith('==') || (alphabet.indexOf(ref.data[expected - 3]) & 15) !== 0 : !ref.data.endsWith('=') || ref.data.endsWith('==') || (alphabet.indexOf(ref.data[expected - 2]) & 3) !== 0) throw new Error('The custom sample needs canonical, padded PCM16 audio data.');
      if (validatedPCM.size >= 4) validatedPCM.delete(validatedPCM.keys().next().value); validatedPCM.set(ref.data, bytes);
    } else if (validatedPCM.get(ref.data) !== bytes) throw new Error('The custom sample dimensions do not match its PCM16 data.');
    return { kind: 'pcm', name: ref.name, sampleRate: LIMITS.sampleRate, channels: 1, frames: ref.frames, data: ref.data };
  }
  function sampleFrames(ref) {
    if (ref.kind === 'pcm') return ref.frames;
    // Source metadata gives exact lengths without generating or decoding factory audio.
    const entry = global.MarinadeSources?.catalog?.find(source => source.id === ref.id); if (entry && Number.isInteger(entry.frames) && entry.frames > 0) return entry.frames;
    if (typeof global.MarinadeSources?.getFrameCount === 'function') { const frames = global.MarinadeSources.getFrameCount(ref); if (Number.isInteger(frames) && frames > 0) return frames; }
    return LIMITS.sampleFrames;
  }
  function validTrim(sample) { if (sample.trimEnd <= sample.trimStart || (sample.trimEnd - sample.trimStart) * sampleFrames(sample.ref) < 1 - 1e-8) throw new Error('Each source trim must contain at least one audio frame.'); }
  // Shared pattern validation also works when the editable sources are opened without a build.
  function portablePattern(input) {
    keys(input, ['format', 'version', 'name', 'sourceApp', 'kind', 'tempo', 'swing', 'lengthBeats', 'meter', 'voices', 'notes', 'tags', 'seed'], 'shared pattern', ['name', 'sourceApp', 'kind', 'tempo', 'swing', 'meter', 'tags', 'seed']);
    if (Array.isArray(input.voices)) for (const voice of input.voices) keys(voice, ['id', 'name', 'pitch'], 'shared source voice', ['name', 'pitch']);
    if (Array.isArray(input.notes)) for (const note of input.notes) keys(note, ['id', 'pitch', 'beat', 'duration', 'velocity', 'voice', 'probability'], 'shared note', ['id', 'velocity', 'voice', 'probability']);
    if (Array.isArray(input.tags)) for (const tag of input.tags) validText(tag, 'shared tag', 40);
    if (global.MusicLabPatternSchema) return global.MusicLabPatternSchema.normalize(input);
    if (!object(input) || input.format !== 'musiclab-pattern' || input.version !== 1) fail('shared pattern');
    const id = (value, label) => { validText(value, label, 80); if (!value || ['__proto__', 'prototype', 'constructor'].includes(value)) fail(label); return value; };
    validNumber(input.lengthBeats, [.25, 256], 'shared pattern length');
    if (!Array.isArray(input.voices) || input.voices.length < 1 || input.voices.length > 64 || !Array.isArray(input.notes) || input.notes.length > 4096) fail('shared pattern notes');
    const length = input.lengthBeats, voiceIds = new Set(), noteIds = new Set();
    const voices = input.voices.map(voice => { if (!object(voice)) fail('shared voice'); const voiceId = id(voice.id, 'shared voice ID'); if (voiceIds.has(voiceId)) fail('duplicate shared voice'); voiceIds.add(voiceId); const out = { id: voiceId, name: voice.name === undefined ? voiceId : voice.name }; validText(out.name, 'shared voice name', 100); if (voice.pitch !== undefined) { validNumber(voice.pitch, [0, 127], 'shared voice pitch', true); out.pitch = voice.pitch; } return out; });
    const notes = input.notes.map((note, index) => { if (!object(note)) fail('shared note'); const noteId = note.id === undefined ? 'n' + (index + 1) : id(note.id, 'shared note ID'); if (noteIds.has(noteId)) fail('duplicate shared note'); noteIds.add(noteId); validNumber(note.pitch, [0, 127], 'shared note pitch', true); validNumber(note.beat, [0, length], 'shared note beat'); validNumber(note.duration, [Number.MIN_VALUE, length], 'shared note duration'); if (note.beat >= length || note.beat + note.duration > length + 1e-8) fail('shared note bounds'); const voice = note.voice === undefined && voices.length === 1 ? voices[0].id : id(note.voice, 'shared note voice'); if (!voiceIds.has(voice)) fail('shared note voice'); const velocity = note.velocity === undefined ? .8 : note.velocity, probability = note.probability === undefined ? 1 : note.probability; validNumber(velocity, [0, 1], 'shared note velocity'); validNumber(probability, [0, 1], 'shared note probability'); return { id: noteId, pitch: note.pitch, beat: note.beat, duration: note.duration, velocity, voice, probability }; });
    const meter = input.meter === undefined ? [4, 4] : input.meter; if (!Array.isArray(meter) || meter.length !== 2 || !Number.isInteger(meter[0]) || meter[0] < 1 || meter[0] > 16 || ![1, 2, 4, 8, 16].includes(meter[1])) fail('shared meter');
    const tags = input.tags === undefined ? [] : input.tags; if (!Array.isArray(tags) || tags.length > 24) fail('shared tags'); tags.forEach(tag => validText(tag, 'shared tag', 40));
    const out = { format: 'musiclab-pattern', version: 1, name: input.name === undefined ? 'Untitled pattern' : input.name, sourceApp: input.sourceApp === undefined ? '' : input.sourceApp, kind: input.kind === undefined ? 'notes' : input.kind, tempo: input.tempo === undefined ? 120 : input.tempo, swing: input.swing === undefined ? 0 : input.swing, lengthBeats: length, meter: meter.slice(), voices, notes, tags: tags.slice() };
    validText(out.name, 'shared pattern name', 160); validText(out.sourceApp, 'shared source app', 80); validChoice(out.kind, ['notes', 'drums'], 'shared pattern kind'); validNumber(out.tempo, [20, 400], 'shared tempo'); validNumber(out.swing, [0, .75], 'shared swing'); if (input.seed !== undefined) { validNumber(input.seed, [0, 4294967295], 'shared seed', true); out.seed = input.seed; } checkSize(out, 1048576, 'Shared note patterns'); return out;
  }
  function normalizeOverlay(value) {
    keys(value, ['pattern', 'voiceMap'], 'shared pattern overlay'); if (!object(value.voiceMap)) fail('shared voice mapping');
    const pattern = portablePattern(value.pattern), voiceMap = {}, ids = pattern.voices.map(voice => voice.id);
    for (const key of Reflect.ownKeys(value.voiceMap)) if (typeof key !== 'string' || !ids.includes(key) || value.voiceMap[key] !== 'synth') fail('shared voice mapping');
    for (const voice of pattern.voices) { if (!own(value.voiceMap, voice.id) || value.voiceMap[voice.id] !== 'synth') fail('shared voice mapping'); voiceMap[voice.id] = 'synth'; }
    return { pattern, voiceMap };
  }
  function normalize(raw) {
    const d = defaultState(); raw = object(raw) ? raw : {};
    const synth = object(raw.synth) ? raw.synth : {}, filter = object(synth.filter) ? synth.filter : {}, lfo = object(synth.lfo) ? synth.lfo : {}, path = object(raw.morphPath) ? raw.morphPath : {}, sequence = object(raw.sequence) ? raw.sequence : {}, fx = object(raw.fx) ? raw.fx : {};
    const state = { name: text(raw.name, d.name), tempo: clamp(raw.tempo, RANGES.tempo, d.tempo), swing: clamp(raw.swing, RANGES.swing, d.swing), root: clamp(raw.root, RANGES.root, d.root, true), scale: choice(raw.scale, ENUMS.scale, d.scale), seed: clamp(raw.seed, RANGES.seed, d.seed, true),
      samples: Array.from({ length: 2 }, (_, index) => { const source = object(raw.samples?.[index]) ? raw.samples[index] : {}, fallback = d.samples[index], ref = source.ref === undefined ? copy(fallback.ref) : validateRef(source.ref); const result = { ref, ...numbers(source, fallback, RANGES.sample, ['rootNote']), freeze: bool(source.freeze, false), reverse: bool(source.reverse, false) }; if (result.trimEnd <= result.trimStart || (result.trimEnd - result.trimStart) * sampleFrames(ref) < 1 - 1e-8) { result.trimStart = 0; result.trimEnd = 1; } return result; }),
      synth: { ...numbers(synth, d.synth, RANGES.synth), scanMode: choice(synth.scanMode, ENUMS.scanMode, d.synth.scanMode), formantLock: bool(synth.formantLock, true), amp: numbers(object(synth.amp) ? synth.amp : {}, d.synth.amp, RANGES.envelope), filter: { ...numbers(filter, d.synth.filter, RANGES.filter), type: choice(filter.type, ENUMS.filterType, d.synth.filter.type) }, filterEnv: numbers(object(synth.filterEnv) ? synth.filterEnv : {}, d.synth.filterEnv, RANGES.envelope), lfo: { ...numbers(lfo, d.synth.lfo, RANGES.lfo), shape: choice(lfo.shape, ENUMS.lfoShape, d.synth.lfo.shape), sync: choice(lfo.sync, ENUMS.lfoSync, d.synth.lfo.sync), target: choice(lfo.target, ENUMS.lfoTarget, d.synth.lfo.target), retrigger: bool(lfo.retrigger, false) } },
      morphPath: { enabled: bool(path.enabled, d.morphPath.enabled), ...numbers(path, d.morphPath, RANGES.morphPath), points: Array.from({ length: 16 }, (_, index) => clamp(path.points?.[index], [0, 1], d.morphPath.points[index])) },
      sequence: { ...numbers(sequence, d.sequence, RANGES.sequence, ['length', 'transpose']), division: choice(sequence.division, ENUMS.division, d.sequence.division), steps: Array.from({ length: 16 }, (_, index) => { const source = object(sequence.steps?.[index]) ? sequence.steps[index] : {}; return { on: bool(source.on, true), ...numbers(source, d.sequence.steps[index], RANGES.step, ['note', 'ratchet']), chord: choice(source.chord, ENUMS.chord, 'single'), protect: bool(source.protect, false) }; }) },
      fx: { ...numbers(fx, d.fx, RANGES.fx), delayDivision: choice(fx.delayDivision, ENUMS.delayDivision, d.fx.delayDivision) } };
    if (raw.musicLabPattern !== undefined) state.musicLabPattern = normalizeOverlay(raw.musicLabPattern);
    return state;
  }
  function validateState(state) {
    keys(state, ['name', 'tempo', 'swing', 'root', 'scale', 'seed', 'samples', 'synth', 'morphPath', 'sequence', 'fx', 'musicLabPattern'], 'state', ['musicLabPattern']); validText(state.name, 'project name');
    for (const key of ['tempo', 'swing', 'root', 'seed']) validNumber(state[key], RANGES[key], key, ['root', 'seed'].includes(key)); validChoice(state.scale, ENUMS.scale, 'scale');
    if (!Array.isArray(state.samples) || state.samples.length !== 2) fail('two source bays');
    for (const [index, source] of state.samples.entries()) { keys(source, ['ref', 'rootNote', 'trimStart', 'trimEnd', 'position', 'freeze', 'reverse', 'gain'], 'source ' + (index + 1)); validateRef(source.ref); validNumbers(source, RANGES.sample, 'source ' + (index + 1), ['rootNote']); validBool(source.freeze, 'source freeze'); validBool(source.reverse, 'source reverse'); validTrim(source); }
    keys(state.synth, [...Object.keys(RANGES.synth), 'scanMode', 'formantLock', 'amp', 'filter', 'filterEnv', 'lfo'], 'synth'); validNumbers(state.synth, RANGES.synth, 'synth'); validChoice(state.synth.scanMode, ENUMS.scanMode, 'scan mode'); validBool(state.synth.formantLock, 'formant lock');
    for (const key of ['amp', 'filterEnv']) { keys(state.synth[key], Object.keys(RANGES.envelope), key + ' envelope'); validNumbers(state.synth[key], RANGES.envelope, key + ' envelope'); }
    keys(state.synth.filter, [...Object.keys(RANGES.filter), 'type'], 'filter'); validNumbers(state.synth.filter, RANGES.filter, 'filter'); validChoice(state.synth.filter.type, ENUMS.filterType, 'filter type');
    keys(state.synth.lfo, [...Object.keys(RANGES.lfo), 'shape', 'sync', 'target', 'retrigger'], 'LFO'); validNumbers(state.synth.lfo, RANGES.lfo, 'LFO'); validChoice(state.synth.lfo.shape, ENUMS.lfoShape, 'LFO shape'); validChoice(state.synth.lfo.sync, ENUMS.lfoSync, 'LFO clock'); validChoice(state.synth.lfo.target, ENUMS.lfoTarget, 'LFO target'); validBool(state.synth.lfo.retrigger, 'LFO retrigger');
    keys(state.morphPath, ['enabled', 'beats', 'depth', 'points'], 'morph path'); validBool(state.morphPath.enabled, 'morph path enabled'); validNumbers(state.morphPath, RANGES.morphPath, 'morph path'); if (!Array.isArray(state.morphPath.points) || state.morphPath.points.length !== 16) fail('sixteen morph path points'); for (const point of state.morphPath.points) validNumber(point, [0, 1], 'morph path point');
    keys(state.sequence, ['division', 'length', 'transpose', 'gate', 'steps'], 'sequence'); validNumbers(state.sequence, RANGES.sequence, 'sequence', ['length', 'transpose']); validChoice(state.sequence.division, ENUMS.division, 'sequence division'); if (!Array.isArray(state.sequence.steps) || state.sequence.steps.length !== 16) fail('sixteen sequence steps');
    for (const source of state.sequence.steps) { keys(source, ['on', ...Object.keys(RANGES.step), 'chord', 'protect'], 'sequence step'); validNumbers(source, RANGES.step, 'sequence step', ['note', 'ratchet']); validBool(source.on, 'step enabled'); validBool(source.protect, 'step protection'); validChoice(source.chord, ENUMS.chord, 'step chord'); }
    keys(state.fx, [...Object.keys(RANGES.fx), 'delayDivision'], 'effects'); validNumbers(state.fx, RANGES.fx, 'effects'); validChoice(state.fx.delayDivision, ENUMS.delayDivision, 'delay division');
    if (state.musicLabPattern !== undefined) normalizeOverlay(state.musicLabPattern);
    return true;
  }
  function parseProject(input) {
    const json = checkSize(input); let value; try { value = typeof input === 'string' ? JSON.parse(json) : input; } catch (_) { throw new Error('This MARINADE project is not valid JSON.'); }
    let state = value;
    if (object(value) && (own(value, 'format') || own(value, 'state'))) { keys(value, ['format', 'formatVersion', 'appVersion', 'state'], 'project wrapper', ['appVersion']); if (value.format !== 'marinade-project' || value.formatVersion !== 1) throw new Error('Choose a MARINADE version 1 project.'); if (value.appVersion !== undefined) validText(value.appVersion, 'application version', 40); state = value.state; }
    validateState(state); return normalize(state);
  }
  function serialize(state) { const normalized = normalize(state); validateState(normalized); const value = { format: 'marinade-project', formatVersion: 1, appVersion: VERSION, state: normalized }, json = JSON.stringify(value, null, 2); checkSize(json); return json; }
  function noteName(midi) { const note = Math.round(Number(midi)); return Number.isFinite(note) ? ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][((note % 12) + 12) % 12] + (Math.floor(note / 12) - 1) : '—'; }
  global.MarinadeSchema = Object.freeze({ VERSION, LIMITS, FACTORY_IDS, RANGES, ENUMS, SCALES, DIVISIONS, defaultState, normalize, validateState, parseProject, serialize, serializeProject: serialize, copy, step, noteName, validateRef, normalizeOverlay });
})(typeof window === 'object' ? window : globalThis);
