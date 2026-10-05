(() => {
  'use strict';
  const VERSION = '1.0.0';
  const MAX_ASSETS = 32, MAX_ZONES = 64, MAX_SECONDS = 120;
  const MAX_PCM_BYTES = 64 * 1024 * 1024, MAX_PROJECT_BYTES = 64 * 1024 * 1024;
  const RECIPES = ['bell', 'felt', 'reed', 'tape', 'choir', 'dust', 'sub', 'kit'];
  const ZONE_ENUMS = { loopMode: ['off', 'forward', 'pingpong'], playMode: ['gate', 'oneshot'], engine: ['classic', 'texture'] };
  const SOURCES = ['off', 'lfo1', 'lfo2', 'velocity', 'key', 'wheel', 'pressure', 'random', 'envelope'];
  const TARGETS = ['pitch', 'cutoff', 'pan', 'level', 'start', 'position'];
  const FILTERS = ['lowpass', 'highpass', 'bandpass', 'notch'];
  const SHAPES = ['sine', 'triangle', 'square', 'random'];
  const validatedAssets = new WeakSet();
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const clamp = (value, min, max, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  const integer = (value, min, max, fallback) => Math.round(clamp(value, min, max, fallback));
  const text = (value, fallback, max = 96) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : fallback;
  const enumValue = (value, list, fallback) => list.includes(value) ? value : fallback;
  const bool = (value, fallback = false) => typeof value === 'boolean' ? value : fallback;
  let counter = 0;
  function uid(prefix = 'sample') {
    const token = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID().slice(0, 16) : Date.now().toString(36) + '-' + (++counter).toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    return text(prefix, 'item', 16) + '-' + token;
  }
  function copy(value) {
    if (isObject(value) && validatedAssets.has(value)) return value;
    if (Array.isArray(value)) return value.map(copy);
    if (ArrayBuffer.isView(value)) return new value.constructor(value);
    if (isObject(value)) {
      const result = {};
      for (const key of Object.keys(value)) if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') result[key] = copy(value[key]);
      return result;
    }
    return value;
  }
  function checkedNumber(value, min, max, label, integral = false) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integral && !Number.isInteger(value)) throw new Error('Invalid ' + label + '.');
    return value;
  }
  function checkedId(value, label) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(value)) throw new Error('Invalid ' + label + ' identifier.');
    return value;
  }
  function utf8Bytes(value) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).byteLength;
    let bytes = 0;
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code < 128) bytes++; else if (code < 2048) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
      else bytes += 3;
    }
    return bytes;
  }
  function assetBytes(asset) { return Math.round(asset.kind === 'pcm' ? asset.frames : asset.duration * asset.sampleRate) * asset.channels * 4; }
  function normalizeAsset(raw) {
    if (!isObject(raw)) throw new Error('A sample asset is incomplete.');
    if (validatedAssets.has(raw)) return raw;
    const id = checkedId(raw.id, 'sample');
    if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 160 || /[\u0000-\u001f\u007f]/.test(raw.name)) throw new Error('A sample name is invalid.');
    const sampleRate = checkedNumber(raw.sampleRate, 8000, 192000, 'sample rate', true);
    const channels = checkedNumber(raw.channels, 1, 2, 'sample channel count', true);
    const root = raw.root === undefined ? 60 : checkedNumber(raw.root, 0, 127, 'sample root note', true);
    const duration = checkedNumber(raw.duration, 1 / sampleRate, MAX_SECONDS, 'sample duration');
    if (raw.kind === 'seed') {
      if (!RECIPES.includes(raw.recipe)) throw new Error('Unknown sampled instrument recipe.');
      if (channels !== 2) throw new Error('Generated sample specimens must use two channels.');
      const seed = checkedNumber(raw.seed, 1, 4294967295, 'sample seed', true);
      const result = { id, kind: 'seed', name: raw.name, recipe: raw.recipe, seed, duration, sampleRate, channels, root };
      if (assetBytes(result) > MAX_PCM_BYTES) throw new Error('This sample exceeds the 64 MiB decoded audio budget.');
      Object.freeze(result); validatedAssets.add(result); return result;
    }
    if (raw.kind !== 'pcm') throw new Error('This sample format is not supported.');
    const frames = checkedNumber(raw.frames, 1, Math.floor(sampleRate * MAX_SECONDS), 'sample frame count', true);
    if (Math.abs(duration - frames / sampleRate) > .00000001) throw new Error('The sample duration does not match its audio.');
    const expectedBytes = frames * channels * 2;
    if (frames * channels * 4 > MAX_PCM_BYTES) throw new Error('This sample exceeds the 64 MiB decoded audio budget.');
    const expectedChars = Math.ceil(expectedBytes / 3) * 4;
    if (typeof raw.pcm !== 'string' || raw.pcm.length !== expectedChars || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw.pcm)) throw new Error('The sample data is incomplete or has an invalid length.');
    const padding = expectedBytes % 3 === 1 ? '==' : expectedBytes % 3 === 2 ? '=' : '';
    if (padding ? !raw.pcm.endsWith(padding) || padding.length === 1 && raw.pcm.endsWith('==') : raw.pcm.endsWith('=')) throw new Error('The sample data does not match its dimensions.');
    // Reject noncanonical unused bits without allocating/decoding an untrusted blob.
    if (padding) {
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      const last = alphabet.indexOf(raw.pcm[raw.pcm.length - padding.length - 1]);
      if (last < 0 || (padding.length === 2 ? last % 16 !== 0 : last % 4 !== 0)) throw new Error('The sample data has invalid base64 padding.');
    }
    const result = { id, kind: 'pcm', name: raw.name, sampleRate, channels, frames, duration: frames / sampleRate, pcm: raw.pcm, root };
    Object.freeze(result); validatedAssets.add(result); return result;
  }
  function encodeAsset({ pcm, sampleRate, name = 'Imported specimen', root = 60, channels = 2 } = {}) {
    checkedNumber(sampleRate, 8000, 192000, 'sample rate', true);
    checkedNumber(channels, 1, 2, 'sample channel count', true);
    checkedNumber(root, 0, 127, 'sample root note', true);
    if (Object.prototype.toString.call(pcm) !== '[object Float32Array]' || !pcm.length || pcm.length % channels) throw new Error('Provide complete interleaved mono or stereo Float32 audio.');
    const frames = pcm.length / channels;
    if (frames / sampleRate > MAX_SECONDS) throw new Error('Samples can be at most 120 seconds long.');
    if (pcm.byteLength > MAX_PCM_BYTES) throw new Error('This sample exceeds the 64 MiB decoded audio budget.');
    // Check all samples before allocating an output buffer; NaN must never become silence.
    for (let i = 0; i < pcm.length; i++) if (!Number.isFinite(pcm[i])) throw new Error('The audio contains a non-finite sample.');
    const bytes = new Uint8Array(pcm.length * 2), view = new DataView(bytes.buffer);
    for (let i = 0; i < pcm.length; i++) {
      const value = Math.max(-1, Math.min(1, pcm[i]));
      view.setInt16(i * 2, Math.round(value < 0 ? value * 32768 : value * 32767), true);
    }
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += 8192) chunks.push(String.fromCharCode.apply(null, bytes.subarray(offset, offset + 8192)));
    return normalizeAsset({ id: uid('sample'), kind: 'pcm', name: text(name, 'Imported specimen', 160).trim() || 'Imported specimen', sampleRate, channels, frames, duration: frames / sampleRate, pcm: btoa(chunks.join('')), root });
  }
  function decodeAsset(raw) {
    const asset = normalizeAsset(raw);
    if (asset.kind !== 'pcm') throw new Error('Seed specimens are generated by the sampler audio engine.');
    const binary = atob(asset.pcm);
    const left = new Float32Array(asset.frames), right = asset.channels === 1 ? left : new Float32Array(asset.frames);
    for (let frame = 0; frame < asset.frames; frame++) {
      const offset = frame * asset.channels * 2;
      let value = binary.charCodeAt(offset) | binary.charCodeAt(offset + 1) << 8;
      if (value >= 32768) value -= 65536;
      left[frame] = value < 0 ? value / 32768 : value / 32767;
      if (asset.channels === 2) {
        value = binary.charCodeAt(offset + 2) | binary.charCodeAt(offset + 3) << 8;
        if (value >= 32768) value -= 65536;
        right[frame] = value < 0 ? value / 32768 : value / 32767;
      }
    }
    return { left, right, sampleRate: asset.sampleRate, duration: asset.duration };
  }
  const defaultEnvelope = () => ({ attack: .003, decay: .25, sustain: .8, release: .35 });
  const normalizeEnvelope = (raw, defaults = defaultEnvelope()) => ({ attack: clamp(raw?.attack, .0001, 20, defaults.attack), decay: clamp(raw?.decay, .001, 20, defaults.decay), sustain: clamp(raw?.sustain, 0, 1, defaults.sustain), release: clamp(raw?.release, .001, 30, defaults.release) });
  function normalizeZone(raw, asset) {
    raw = isObject(raw) ? raw : {};
    const root = integer(raw.root, 0, 127, asset.root ?? 60);
    const low = integer(raw.low, 0, 127, 0), high = Math.max(low, integer(raw.high, 0, 127, 127));
    const velLow = integer(raw.velLow, 1, 127, 1), velHigh = Math.max(velLow, integer(raw.velHigh, 1, 127, 127));
    const start = clamp(raw.start, 0, .999999, 0), end = Math.max(start + .000001, clamp(raw.end, .000001, 1, 1));
    const loopStart = clamp(raw.loopStart, start, Math.max(start, end - .000001), Math.min(end - .000001, Math.max(start, .1)));
    const loopEnd = Math.max(loopStart + .000001, clamp(raw.loopEnd, loopStart + .000001, end, Math.min(end, Math.max(loopStart + .000001, .9))));
    const f = raw.filter || {};
    return { id: raw.id === undefined ? uid('zone') : checkedId(raw.id, 'zone'), name: text(raw.name, asset.name), assetId: asset.id, enabled: bool(raw.enabled, true), color: /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : '#86c9be', root, low, high, velLow, velHigh,
      transpose: integer(raw.transpose, -48, 48, 0), tune: clamp(raw.tune, -100, 100, 0), tracking: bool(raw.tracking, true), level: clamp(raw.level, 0, 2, .85), pan: clamp(raw.pan, -1, 1, 0), width: clamp(raw.width, 0, 2, 1), start, end, loopStart, loopEnd,
      loopMode: enumValue(raw.loopMode, ZONE_ENUMS.loopMode, 'off'), crossfade: clamp(raw.crossfade, 0, 1, .012), reverse: bool(raw.reverse), playMode: enumValue(raw.playMode, ZONE_ENUMS.playMode, 'gate'), engine: enumValue(raw.engine, ZONE_ENUMS.engine, 'classic'), stretch: clamp(raw.stretch, .125, 8, 1), grainSize: clamp(raw.grainSize, .01, .5, .08), grainDensity: clamp(raw.grainDensity, 2, 48, 12), jitter: clamp(raw.jitter, 0, 1, .03), position: clamp(raw.position, 0, 1, 0), choke: integer(raw.choke, 0, 8, 0), roundRobin: integer(raw.roundRobin, 0, 8, 0), envelope: normalizeEnvelope(raw.envelope),
      filter: { type: enumValue(f.type, FILTERS, 'lowpass'), cutoff: clamp(f.cutoff, 20, 22000, 18000), q: clamp(f.q, .1, 20, .7), drive: clamp(f.drive, 0, 1, 0), keytrack: clamp(f.keytrack, -1, 1, 0), velocity: clamp(f.velocity, -1, 1, .2), amount: clamp(f.amount, -8, 8, 0), envelope: normalizeEnvelope(f.envelope, { attack: .006, decay: .3, sustain: 0, release: .15 }) } };
  }
  function createZone(asset, overrides = {}) { return normalizeZone({ ...overrides, id: overrides.id || uid('zone') }, normalizeAsset(asset)); }
  const defaultStep = index => ({ on: index % 4 === 0 || index % 8 === 6, note: [60, 64, 67, 72][Math.floor(index / 4) % 4], velocity: index % 4 === 0 ? .88 : .65, gate: .7, probability: 1, ratchet: 1 });
  function defaultState() {
    const asset = { id: 'seed-bell', kind: 'seed', name: 'A bell with a secret staircase', recipe: 'bell', seed: 27183, duration: 2.8, sampleRate: 24000, channels: 2, root: 60 };
    const zone = createZone(asset, { id: 'zone-bell', name: 'The specimen sings back', envelope: { attack: .002, decay: .9, sustain: .3, release: .8 }, filter: { cutoff: 14000 } });
    return { version: VERSION, name: 'The cabinet has learned to sing.', tempo: 104, swing: .08, seed: 43817, selectedZone: zone.id, selectedPattern: 0, keyOctave: 4, assets: [asset], zones: [zone],
      master: { level: .7, transpose: 0, tune: 0, polyphony: 32, bendRange: 2, velocityCurve: 1, drive: .1, chorus: .1, delay: .15, feedback: .3, delaySync: .5, space: .2, tone: 18000, width: 1 },
      lfos: [{ shape: 'sine', rate: .8, sync: false, division: 1, depth: 1, retrigger: true }, { shape: 'triangle', rate: .17, sync: false, division: 4, depth: 1, retrigger: false }],
      modulation: Array.from({ length: 8 }, () => ({ source: 'off', target: 'pitch', amount: 0 })), performance: { mode: 'sequence', arpMode: 'up', hold: false, octaves: 1, division: .25, gate: .7, velocity: .8 },
      patterns: Array.from({ length: 4 }, (_, i) => ({ name: String.fromCharCode(65 + i), length: 16, steps: Array.from({ length: 64 }, (_, index) => defaultStep(index)) })) };
  }
  function normalize(raw) {
    const d = defaultState(); raw = isObject(raw) ? raw : {};
    const inputAssets = raw.assets === undefined ? d.assets : raw.assets;
    if (!Array.isArray(inputAssets) || inputAssets.length > MAX_ASSETS) throw new Error('The cabinet holds at most 32 sample assets.');
    const assets = inputAssets.map(normalizeAsset), assetMap = new Map();
    let bytes = 0;
    for (const asset of assets) {
      if (assetMap.has(asset.id)) throw new Error('Duplicate sample identifiers are not allowed.');
      assetMap.set(asset.id, asset); bytes += assetBytes(asset);
      if (bytes > MAX_PCM_BYTES) throw new Error('The instrument exceeds the 64 MiB decoded audio budget.');
    }
    const inputZones = raw.zones === undefined ? d.zones : raw.zones;
    if (!Array.isArray(inputZones) || inputZones.length > MAX_ZONES) throw new Error('The cabinet holds at most 64 zones.');
    const zoneIds = new Set();
    const zones = inputZones.map(rawZone => {
      if (!isObject(rawZone) || !assetMap.has(rawZone.assetId)) throw new Error('A zone refers to a missing sample asset.');
      const zone = normalizeZone(rawZone, assetMap.get(rawZone.assetId));
      if (zoneIds.has(zone.id)) throw new Error('Duplicate zone identifiers are not allowed.');
      zoneIds.add(zone.id); return zone;
    });
    const m = raw.master || {}, p = raw.performance || {};
    return { version: VERSION, name: text(raw.name, d.name, 120), tempo: clamp(raw.tempo, 30, 240, d.tempo), swing: clamp(raw.swing, 0, .65, d.swing), seed: integer(raw.seed, 1, 4294967295, d.seed), selectedZone: zoneIds.has(raw.selectedZone) ? raw.selectedZone : zones[0]?.id || '', selectedPattern: integer(raw.selectedPattern, 0, 3, 0), keyOctave: integer(raw.keyOctave, -1, 8, 4), assets, zones,
      master: { level: clamp(m.level, 0, 1, .7), transpose: integer(m.transpose, -48, 48, 0), tune: clamp(m.tune, -100, 100, 0), polyphony: integer(m.polyphony, 8, 64, 32), bendRange: integer(m.bendRange, 1, 24, 2), velocityCurve: clamp(m.velocityCurve, .25, 4, 1), drive: clamp(m.drive, 0, 1, .1), chorus: clamp(m.chorus, 0, 1, .1), delay: clamp(m.delay, 0, 1, .15), feedback: clamp(m.feedback, 0, .85, .3), delaySync: clamp(m.delaySync, .0625, 8, .5), space: clamp(m.space, 0, 1, .2), tone: clamp(m.tone, 100, 22000, 18000), width: clamp(m.width, 0, 2, 1) },
      lfos: Array.from({ length: 2 }, (_, i) => { const l = raw.lfos?.[i] || d.lfos[i]; return { shape: enumValue(l.shape, SHAPES, d.lfos[i].shape), rate: clamp(l.rate, .01, 40, d.lfos[i].rate), sync: bool(l.sync), division: clamp(l.division, .0625, 16, d.lfos[i].division), depth: clamp(l.depth, 0, 1, 1), retrigger: bool(l.retrigger, d.lfos[i].retrigger) }; }),
      modulation: Array.from({ length: 8 }, (_, i) => { const route = raw.modulation?.[i] || {}; return { source: enumValue(route.source, SOURCES, 'off'), target: enumValue(route.target, TARGETS, 'pitch'), amount: clamp(route.amount, -1, 1, 0) }; }),
      performance: { mode: enumValue(p.mode, ['sequence', 'arp'], 'sequence'), arpMode: enumValue(p.arpMode, ['up', 'down', 'updown', 'random', 'asplayed', 'chord'], 'up'), hold: bool(p.hold), octaves: integer(p.octaves, 1, 4, 1), division: clamp(p.division, .0625, 2, .25), gate: clamp(p.gate, .05, 2, .7), velocity: clamp(p.velocity, .01, 1, .8) },
      patterns: Array.from({ length: 4 }, (_, patternIndex) => { const pattern = raw.patterns?.[patternIndex] || d.patterns[patternIndex]; return { name: text(pattern.name, String.fromCharCode(65 + patternIndex), 40), length: [16, 32, 64].includes(pattern.length) ? pattern.length : 16, steps: Array.from({ length: 64 }, (_, i) => { const step = pattern.steps?.[i] || defaultStep(i); return { on: bool(step.on), note: integer(step.note, 0, 127, 60), velocity: clamp(step.velocity, .01, 1, .8), gate: clamp(step.gate, .05, 4, .7), probability: clamp(step.probability, 0, 1, 1), ratchet: integer(step.ratchet, 1, 8, 1) }; }) }; }) };
  }
  function strictControls(raw, normalized, path = '') {
    if (!isObject(raw) || !isObject(normalized)) throw new Error('The project is incomplete at ' + (path || 'instrument') + '.');
    for (const key of Object.keys(normalized)) {
      if (key === 'version') continue;
      const expected = normalized[key], actual = raw[key], label = path ? path + '.' + key : key;
      if (!own(raw, key)) throw new Error('The project is missing ' + label + '.');
      if (Array.isArray(expected)) {
        if (!Array.isArray(actual) || actual.length !== expected.length) throw new Error('The project has an invalid ' + label + ' collection.');
        for (let i = 0; i < expected.length; i++) strictControls(actual[i], expected[i], label + '[' + i + ']');
      } else if (isObject(expected)) strictControls(actual, expected, label);
      else if (typeof expected === 'number') {
        if (typeof actual !== 'number' || !Number.isFinite(actual) || actual !== expected) throw new Error('The project has an invalid ' + label + '.');
      } else if (typeof actual !== typeof expected || actual !== expected) throw new Error('The project has an invalid ' + label + '.');
    }
  }
  function parseProject(input) {
    if (typeof input !== 'string' || input.length > MAX_PROJECT_BYTES || utf8Bytes(input) > MAX_PROJECT_BYTES) throw new Error('Projects must be at most 64 MiB.');
    let project;
    try { project = JSON.parse(input); } catch (_) { throw new Error('Choose a complete FABLE project JSON file.'); }
    if (!isObject(project) || project.format !== 'fable-project' || project.formatVersion !== 1 || !isObject(project.state)) throw new Error('Choose a FABLE instrument project.');
    if (typeof project.state.version !== 'string' || !/^1\.\d+\.\d+$/.test(project.state.version)) throw new Error('This FABLE project version is not supported.');
    const state = normalize(project.state);
    strictControls(project.state, state);
    return state;
  }
  function serializeProject(state) {
    const json = JSON.stringify({ format: 'fable-project', formatVersion: 1, state: normalize(state) });
    if (json.length > MAX_PROJECT_BYTES || utf8Bytes(json) > MAX_PROJECT_BYTES) throw new Error('This instrument exceeds the 64 MiB portable project budget.');
    return json;
  }
  function audioChannels(audio) {
    if (!audio || typeof audio !== 'object') throw new Error('Provide an audio buffer for analysis.');
    const sampleRate = checkedNumber(audio.sampleRate, 8000, 192000, 'analysis sample rate');
    let left, right;
    if (typeof audio.getChannelData === 'function') { left = audio.getChannelData(0); right = audio.numberOfChannels > 1 ? audio.getChannelData(1) : left; }
    else if (audio.left && typeof audio.left.length === 'number') { left = audio.left; right = audio.right || left; }
    else if (audio.pcm && typeof audio.pcm.length === 'number') {
      const channels = audio.channels === 1 ? 1 : 2;
      if (audio.pcm.length % channels) throw new Error('Analysis audio has incomplete frames.');
      if (!audio.pcm.length || audio.pcm.length / channels / sampleRate > MAX_SECONDS || audio.pcm.length * 4 > MAX_PCM_BYTES) throw new Error('Analysis audio is empty or exceeds the sample budget.');
      left = new Float32Array(audio.pcm.length / channels); right = channels === 1 ? left : new Float32Array(left.length);
      for (let i = 0; i < left.length; i++) { left[i] = audio.pcm[i * channels]; if (channels === 2) right[i] = audio.pcm[i * channels + 1]; }
    } else throw new Error('Provide mono or stereo audio for analysis.');
    if (!left.length || right.length !== left.length || left.length / sampleRate > MAX_SECONDS || left.length * (left === right ? 1 : 2) * 4 > MAX_PCM_BYTES) throw new Error('Analysis audio is empty or exceeds the sample budget.');
    for (let i = 0; i < left.length; i++) if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) throw new Error('Analysis audio contains non-finite samples.');
    return { left, right, sampleRate };
  }
  function detectPitch(audio) {
    const { left, right, sampleRate } = audioChannels(audio);
    let powerL = 0, powerR = 0;
    const scanStride = Math.max(1, Math.floor(left.length / 16000));
    for (let i = 0; i < left.length; i += scanStride) { powerL += left[i] * left[i]; powerR += right[i] * right[i]; }
    const source = powerL >= powerR ? left : right;
    const stride = Math.max(1, Math.ceil(sampleRate / 12000)), rate = sampleRate / stride;
    const size = Math.min(4096, Math.floor(source.length / stride));
    if (size < 256) return null;
    // Find a sustained, strong section rather than assuming the file begins with a note.
    const span = size * stride;
    let offset = 0, highest = 0;
    const hop = Math.max(stride, Math.floor(span / 2));
    for (let start = 0; start < source.length; start += hop) {
      let energy = 0, count = 0;
      for (let i = start; i < Math.min(source.length, start + span); i += stride) { energy += source[i] * source[i]; count++; }
      energy /= count || 1;
      if (energy > highest) { highest = energy; offset = Math.min(start, Math.max(0, source.length - span)); }
    }
    if (highest < 1e-7) return null;
    const data = new Float32Array(size); let mean = 0;
    for (let i = 0; i < size; i++) { data[i] = source[offset + i * stride]; mean += data[i]; }
    mean /= size;
    for (let i = 0; i < size; i++) data[i] -= mean;
    const minLag = Math.max(2, Math.floor(rate / 4200)), maxLag = Math.min(Math.floor(rate / 20), Math.floor(size / 2));
    const windowSize = Math.min(2048, size - maxLag);
    const difference = new Float64Array(maxLag + 1), normalized = new Float64Array(maxLag + 1);
    let total = 0, candidate = 0, best = 1;
    for (let lag = 1; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < windowSize; i++) { const diff = data[i] - data[i + lag]; sum += diff * diff; }
      difference[lag] = sum; total += sum;
      normalized[lag] = total > 1e-12 ? sum * lag / total : 1;
    }
    for (let lag = minLag; lag < maxLag; lag++) {
      if (normalized[lag] < .16) { while (lag + 1 <= maxLag && normalized[lag + 1] < normalized[lag]) lag++; candidate = lag; best = normalized[lag]; break; }
      if (normalized[lag] < best) { best = normalized[lag]; candidate = lag; }
    }
    if (!candidate || best > .28 || candidate === minLag || candidate >= maxLag) return null;
    const before = normalized[candidate - 1], center = normalized[candidate], after = normalized[candidate + 1];
    const denom = before - 2 * center + after;
    const refined = candidate + (Math.abs(denom) > 1e-12 ? Math.max(-.5, Math.min(.5, .5 * (before - after) / denom)) : 0);
    const frequency = rate / refined, midi = 69 + 12 * Math.log2(frequency / 440), note = Math.round(midi);
    if (!Number.isFinite(frequency) || note < 0 || note > 127) return null;
    return { note, cents: (midi - note) * 100, confidence: Math.max(0, Math.min(1, 1 - best)), frequency };
  }
  function trimSilence(audio, thresholdDb = -42) {
    const { left, right, sampleRate } = audioChannels(audio);
    const threshold = Math.pow(10, checkedNumber(thresholdDb, -100, 0, 'silence threshold') / 20);
    let first = -1, last = -1;
    for (let i = 0; i < left.length; i++) if (Math.max(Math.abs(left[i]), Math.abs(right[i])) >= threshold) { if (first < 0) first = i; last = i; }
    if (first < 0) return { start: 0, end: 1 };
    const pad = Math.ceil(sampleRate * .002);
    return { start: Math.max(0, first - pad) / left.length, end: Math.min(left.length, last + 1 + pad) / left.length };
  }
  function onsets(audio, count = 16) {
    const { left, right, sampleRate } = audioChannels(audio);
    count = integer(count, 1, 64, 16);
    if (count === 1) return [0, 1];
    const hop = Math.max(16, Math.floor(sampleRate * .005)), blocks = Math.ceil(left.length / hop);
    const energy = new Float32Array(blocks), flux = new Float32Array(blocks);
    let highest = 0;
    for (let b = 0; b < blocks; b++) {
      let sum = 0, length = 0;
      for (let i = b * hop; i < Math.min(left.length, (b + 1) * hop); i++) { sum += Math.max(left[i] * left[i], right[i] * right[i]); length++; }
      energy[b] = Math.sqrt(sum / (length || 1));
      const previous = b ? energy[b - 1] : 0;
      flux[b] = Math.max(0, energy[b] - previous); highest = Math.max(highest, flux[b]);
    }
    if (highest < .00001) return [0, 1];
    const candidates = [];
    for (let b = 1; b < blocks - 1; b++) if (flux[b] >= highest * .14 && flux[b] >= flux[b - 1] && flux[b] > flux[b + 1]) candidates.push({ b, strength: flux[b] });
    candidates.sort((a, b) => b.strength - a.strength);
    const gap = Math.max(2, Math.floor(blocks / count * .22)), selected = [];
    for (const item of candidates) {
      if (item.b * hop / left.length < .001 || item.b * hop / left.length > .999 || selected.some(other => Math.abs(other - item.b) < gap)) continue;
      selected.push(item.b); if (selected.length >= count - 1) break;
    }
    return [0, ...selected.sort((a, b) => a - b).map(block => Math.max(0, block * hop - Math.floor(sampleRate * .002)) / left.length), 1];
  }
  function autoMap(zones, mode = 'keys') {
    if (!Array.isArray(zones) || zones.length > MAX_ZONES || !['keys', 'velocity', 'drums'].includes(mode)) throw new Error('Choose a key, velocity, or drum mapping.');
    const result = zones.map(copy);
    if (mode === 'keys') {
      const roots = [...new Set(result.map(zone => integer(zone.root, 0, 127, 60)))].sort((a, b) => a - b);
      for (const zone of result) {
        const root = integer(zone.root, 0, 127, 60), i = roots.indexOf(root);
        zone.low = i === 0 ? 0 : Math.floor((roots[i - 1] + root) / 2) + 1;
        zone.high = i === roots.length - 1 ? 127 : Math.floor((root + roots[i + 1]) / 2);
      }
    } else if (mode === 'velocity') {
      result.forEach((zone, i) => { zone.low = 0; zone.high = 127; zone.velLow = Math.floor(i * 127 / result.length) + 1; zone.velHigh = Math.floor((i + 1) * 127 / result.length); });
    } else result.forEach((zone, i) => { zone.low = zone.high = 36 + i; zone.tracking = false; });
    return result;
  }
  window.FableSchema = Object.freeze({ VERSION, MAX_ASSETS, MAX_ZONES, MAX_SECONDS, MAX_PCM_BYTES, MAX_PROJECT_BYTES, RECIPES, SOURCES, TARGETS, FILTERS, SHAPES, defaultState, normalize, normalizeAsset, parseProject, serializeProject, copy, uid, createZone, encodeAsset, decodeAsset, detectPitch, trimSilence, onsets, autoMap, assetBytes });
})();
