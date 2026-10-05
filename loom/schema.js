/* LOOM projects. Eight rooms, with rather firm walls. */
(() => {
  'use strict';
  const VERSION = '1.1.0';
  const COLORS = ['#edab7c', '#b6c995', '#b8a7e0', '#87bfcc', '#dfb0c4', '#ceb581', '#96bdac', '#a5b5de'];
  const LIMITS = Object.freeze({ tracks: 8, slots: 4, bars: 64, clipsPerTrack: 128, assetSeconds: 120, pcmBytes: 64 * 1024 * 1024, projectBytes: 256 * 1024 * 1024, appHtmlBytes: 4 * 1024 * 1024, snapshotBytes: 96 * 1024 * 1024 });
  const BUILT_INS = ['grain', 'form', 'tine', 'mire', 'spool', 'haze', 'bower', 'ravel'];
  const number = (v, lo, hi, d) => typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
  const integer = (v, lo, hi, d) => Math.round(number(v, lo, hi, d));
  const bool = (v, d = false) => typeof v === 'boolean' ? v : d;
  const text = (v, d = '', max = 100) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) || d : d;
  const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
  // PCM strings are immutable. Structural copies share their storage during Undo.
  function copy(v) {
    if (Array.isArray(v)) return v.map(copy);
    if (plain(v)) {
      const result = {};
      for (const key of Object.keys(v)) if (!['__proto__', 'constructor', 'prototype'].includes(key)) result[key] = copy(v[key]);
      return result;
    }
    return v;
  }
  const uid = (prefix = 'clip') => prefix + '-' + (globalThis.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 11));
  function track(index) {
    return { id: 'track-' + (index + 1), name: 'Track ' + (index + 1), color: COLORS[index], level: 0.8, pan: 0, mute: false, solo: false, armed: false, instrumentLive: false, instrument: null, effects: [null, null, null, null], clips: [] };
  }
  function defaultState() {
    return { version: 1, name: 'Eight rooms for a very odd orchestra', tempo: 96, lengthBars: 16, loopEnabled: true, loopStart: 0, loopEnd: 16, master: { level: 0.8, metronome: false }, selectedTrack: 0, view: { zoom: 48, snap: 0.25, tab: 'arrange', follow: true }, tracks: Array.from({ length: 8 }, (_, i) => track(i)), assets: [] };
  }
  function effect(value, strict = false) {
    if (value == null) return null;
    const definition = (window.LoomEffectsCatalog || []).find(e => e.id === value?.type);
    if (!definition || !plain(value.params)) {
      if (strict) throw Error('An effects slot contains an unknown effect or invalid settings.');
      return null;
    }
    const params = {};
    for (const param of definition.params) {
      const v = value.params[param.key];
      if (strict && (param.type === 'range' ? typeof v !== 'number' || !Number.isFinite(v) : !param.options.some(o => o.value === v))) throw Error('The ' + definition.name + ' settings are invalid.');
      params[param.key] = param.type === 'range' ? number(v, param.min, param.max, param.default) : param.options.some(o => o.value === v) ? v : param.default;
    }
    if (strict && (typeof value.params.mix !== 'number' || !Number.isFinite(value.params.mix) || typeof value.params.bypass !== 'boolean')) throw Error('Effect mix or bypass is invalid.');
    params.mix = number(value.params.mix, 0, 1, definition.defaults.mix ?? 1);
    params.bypass = bool(value.params.bypass);
    return { type: definition.id, params };
  }
  function validateAsset(a) {
    if (!plain(a) || typeof a.id !== 'string' || !a.id || a.id.length > 100 || typeof a.name !== 'string') throw Error('An audio asset has invalid metadata.');
    for (const key of ['sampleRate', 'frames', 'channels']) if (!Number.isInteger(a[key])) throw Error('An audio asset has invalid ' + key + '.');
    if (a.sampleRate < 8000 || a.sampleRate > 48000 || ![1, 2].includes(a.channels) || a.frames < 1 || a.frames > LIMITS.assetSeconds * a.sampleRate) throw Error('Audio assets must contain up to 120 seconds at 8–48 kHz.');
    if (typeof a.pcm !== 'string' || !a.pcm.length || a.pcm.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(a.pcm)) throw Error('An audio asset contains invalid PCM data.');
    const padding = a.pcm.endsWith('==') ? 2 : a.pcm.endsWith('=') ? 1 : 0;
    const bytes = a.pcm.length / 4 * 3 - padding;
    if (bytes !== a.frames * a.channels * 2) throw Error('An audio asset’s sample count does not match its PCM data.');
    if (a.duration !== undefined && (typeof a.duration !== 'number' || !Number.isFinite(a.duration) || Math.abs(a.duration - a.frames / a.sampleRate) > 1 / a.sampleRate)) throw Error('An audio asset has invalid duration metadata.');
    return bytes;
  }
  function instrument(value) {
    if (value == null) return null;
    if (!plain(value) || typeof value.id !== 'string' || !/^[a-z0-9_-]{1,100}$/i.test(value.id)) throw Error('An instrument has an invalid ID.');
    const result = { id: value.id, name: text(value.name, BUILT_INS.includes(value.id) ? value.id.toUpperCase() : 'New instrument') };
    if (value.url != null) {
      if (typeof value.url !== 'string' || value.url.length > 2048 || /^(?:javascript|data|file):/i.test(value.url.trim())) throw Error('Choose a same-site instrument URL or a self-contained HTML file.');
      result.url = value.url;
    }
    if (value.html != null) {
      if (typeof value.html !== 'string' || value.html.length > LIMITS.appHtmlBytes || !/<(?:html|body|script|doctype)\b/i.test(value.html)) throw Error('Instrument HTML must be a complete app smaller than 4 MB.');
      result.html = value.html;
    }
    if (!BUILT_INS.includes(value.id) && !result.html && !result.url) throw Error('A future instrument needs a URL or its HTML.');
    if (value.snapshot != null) {
      const s = value.snapshot;
      if (!plain(s) || s.format !== 'loom-instrument-state' || s.version !== 1 || s.app !== value.id || (!plain(s.state) && !Array.isArray(s.state) && s.state !== null) || (s.storage != null && !plain(s.storage))) throw Error('An instrument snapshot is invalid.');
      result.snapshot = copy(s);
    }
    return result;
  }
  function normalize(raw = {}) {
    const d = defaultState(), totalBeats = integer(raw.lengthBars, 1, LIMITS.bars, d.lengthBars) * 4;
    const assets = [], ids = new Set(); let pcmBytes = 0;
    for (const a of Array.isArray(raw.assets) ? raw.assets : []) {
      pcmBytes += validateAsset(a);
      if (ids.has(a.id)) throw Error('Audio asset IDs must be unique.');
      ids.add(a.id); assets.push({ id: a.id, name: text(a.name, 'Audio'), sampleRate: a.sampleRate, channels: a.channels, frames: a.frames, duration: a.frames / a.sampleRate, pcm: a.pcm });
    }
    if (pcmBytes > LIMITS.pcmBytes) throw Error('This session exceeds LOOM’s 64 MB audio budget. Remove unused audio or shorten a take.');
    const assetMap = new Map(assets.map(a => [a.id, a]));
    const s = { version: 1, name: text(raw.name, d.name), tempo: number(raw.tempo, 40, 240, d.tempo), lengthBars: totalBeats / 4, loopEnabled: bool(raw.loopEnabled, true), loopStart: number(raw.loopStart, 0, totalBeats - 0.25, 0), loopEnd: number(raw.loopEnd, 0.25, totalBeats, Math.min(totalBeats, 16)), master: { level: number(raw.master?.level, 0, 1.5, 0.8), metronome: bool(raw.master?.metronome) }, selectedTrack: integer(raw.selectedTrack, 0, 7, 0), view: { zoom: number(raw.view?.zoom, 4, 120, 48), snap: [0, 0.0625, 0.125, 0.25, 0.5, 1, 4].includes(raw.view?.snap) ? raw.view.snap : 0.25, tab: ['arrange', 'mixer'].includes(raw.view?.tab) ? raw.view.tab : 'arrange', follow: bool(raw.view?.follow, true) }, tracks: [], assets };
    if (s.loopEnd <= s.loopStart) s.loopEnd = Math.min(totalBeats, s.loopStart + 0.25);
    const clipIds = new Set(); let snapshotBytes = 0;
    for (let i = 0; i < 8; i++) {
      const r = raw.tracks?.[i] || {}, base = track(i);
      const t = { ...base, name: text(r.name, base.name), color: /^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color : base.color, level: number(r.level, 0, 1.5, 0.8), pan: number(r.pan, -1, 1, 0), mute: bool(r.mute), solo: bool(r.solo), armed: bool(r.armed), instrumentLive: bool(r.instrumentLive), instrument: instrument(r.instrument), effects: Array.from({ length: 4 }, (_, j) => effect(r.effects?.[j])), clips: [] };
      if (t.instrument?.snapshot) snapshotBytes += JSON.stringify(t.instrument.snapshot).length;
      for (const c of (Array.isArray(r.clips) ? r.clips : []).slice(0, LIMITS.clipsPerTrack)) {
        const asset = assetMap.get(c?.assetId);
        if (!asset) continue;
        const start = number(c.start, 0, totalBeats - 1 / 64, 0), sourceDuration = asset.frames / asset.sampleRate;
        const sourceStart = number(c.sourceStart, 0, Math.max(0, sourceDuration - 1 / asset.sampleRate), 0);
        const sourceEnd = number(c.sourceEnd, sourceStart + 1 / asset.sampleRate, sourceDuration, sourceDuration);
        const length = number(c.length, 1 / 64, totalBeats - start, Math.min(totalBeats - start, (sourceEnd - sourceStart) * s.tempo / 60));
        let id = text(c.id, uid()); if (clipIds.has(id)) id = uid(); clipIds.add(id);
        t.clips.push({ id, name: text(c.name, asset.name), assetId: asset.id, start, length, sourceStart, sourceEnd, sourceOffset: number(c.sourceOffset, 0, sourceDuration, 0), rate: number(c.rate, 0.125, 8, 1), reverse: bool(c.reverse), loop: bool(c.loop), gain: number(c.gain, 0, 2, 1), fadeIn: number(c.fadeIn, 0, length / 2, Math.min(0.02, length / 2)), fadeOut: number(c.fadeOut, 0, length / 2, Math.min(0.04, length / 2)) });
      }
      s.tracks.push(t);
    }
    if (snapshotBytes > LIMITS.snapshotBytes) throw Error('Instrument states exceed the 96 MB budget. Print parts into clips and clear unused instrument recordings.');
    return s;
  }
  function strictNumbers(o, keys, message) { for (const key of keys) if (typeof o?.[key] !== 'number' || !Number.isFinite(o[key])) throw Error(message); }
  function parseProject(json) {
    if (typeof json !== 'string' || json.length > LIMITS.projectBytes) throw Error('Choose a LOOM project smaller than 256 MB.');
    let p; try { p = JSON.parse(json); } catch { throw Error('This file is not valid JSON.'); }
    if (!plain(p) || p.format !== 'loom-project' || p.formatVersion !== 1 || !plain(p.state)) throw Error('Choose a LOOM project (.loom.json).');
    const s = p.state;
    if (s.version !== 1 || typeof s.name !== 'string' || !Array.isArray(s.tracks) || s.tracks.length !== 8 || !Array.isArray(s.assets) || !plain(s.master) || !plain(s.view)) throw Error('A LOOM project must contain eight complete tracks.');
    strictNumbers(s, ['tempo', 'lengthBars', 'loopStart', 'loopEnd', 'selectedTrack'], 'The project contains invalid transport settings.');
    if (!Number.isInteger(s.lengthBars) || s.lengthBars < 1 || s.lengthBars > 64 || s.tempo < 40 || s.tempo > 240 || s.loopStart < 0 || s.loopEnd > s.lengthBars * 4 || s.loopEnd <= s.loopStart || !Number.isInteger(s.selectedTrack) || s.selectedTrack < 0 || s.selectedTrack > 7 || typeof s.loopEnabled !== 'boolean') throw Error('The project’s transport range is invalid.');
    strictNumbers(s.master, ['level'], 'The project contains invalid master settings.');
    strictNumbers(s.view, ['zoom', 'snap'], 'The project contains invalid view settings.');
    if (typeof s.master.metronome !== 'boolean' || !['arrange', 'mixer'].includes(s.view.tab) || ![0, 0.0625, 0.125, 0.25, 0.5, 1, 4].includes(s.view.snap)) throw Error('The project contains invalid options.');
    if(s.view.follow !== undefined && typeof s.view.follow !== 'boolean') throw Error('The project contains an invalid playhead follow setting.');
    const ids = new Set(), clipIds = new Set();
    for (const a of s.assets) { validateAsset(a); if (ids.has(a.id)) throw Error('Audio asset IDs must be unique.'); ids.add(a.id); }
    for (let i = 0; i < 8; i++) {
      const t = s.tracks[i];
      if (!plain(t) || t.id !== 'track-' + (i + 1) || typeof t.name !== 'string' || !Array.isArray(t.effects) || t.effects.length !== 4 || !Array.isArray(t.clips) || t.clips.length > 128) throw Error('Each of the eight tracks must contain four effects slots and valid clips.');
      strictNumbers(t, ['level', 'pan'], 'A track contains invalid mix settings.');
      for (const key of ['mute', 'solo', 'armed', 'instrumentLive']) if (typeof t[key] !== 'boolean') throw Error('A track contains invalid options.');
      instrument(t.instrument);
      t.effects.forEach(e => effect(e, true));
      for (const c of t.clips) {
        if (!plain(c) || typeof c.id !== 'string' || !c.id || clipIds.has(c.id) || typeof c.name !== 'string' || !ids.has(c.assetId)) throw Error('A clip contains an invalid or missing audio reference.');
        clipIds.add(c.id);
        strictNumbers(c, ['start', 'length', 'sourceStart', 'sourceEnd', 'sourceOffset', 'rate', 'gain', 'fadeIn', 'fadeOut'], 'A clip contains invalid controls.');
        if (c.start < 0 || c.length <= 0 || c.start + c.length > s.lengthBars * 4 + 1e-6 || c.sourceStart < 0 || c.sourceEnd <= c.sourceStart || c.sourceOffset < 0 || c.sourceOffset > 120 || c.rate <= 0 || c.gain < 0 || typeof c.reverse !== 'boolean' || typeof c.loop !== 'boolean') throw Error('A clip contains invalid timing or options.');
        const a = s.assets.find(a => a.id === c.assetId); if (c.sourceEnd > a.frames / a.sampleRate + 1 / a.sampleRate) throw Error('A clip extends beyond its source audio.');
      }
    }
    return normalize(s);
  }
  function pruneAssets(state) {
    const s = copy(state), ids = new Set(s.tracks.flatMap(t => t.clips.map(c => c.assetId)));
    s.assets = s.assets.filter(a => ids.has(a.id)); return s;
  }
  function serializeProject(state) {
    const json = JSON.stringify({ format: 'loom-project', formatVersion: 1, appVersion: VERSION, state: normalize(pruneAssets(state)) });
    if (json.length > LIMITS.projectBytes) throw Error('The project exceeds the 256 MB file limit.');
    return json;
  }
  function encodeAsset({ left, right, sampleRate, name = 'Recorded part', id = uid('audio') }) {
    if (!left || !Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 384000) throw Error('This audio has an unsupported sample rate.');
    right ||= left;
    const sr = Math.min(48000, Math.round(sampleRate)), inputFrames = Math.min(left.length, right.length, Math.floor(sampleRate * LIMITS.assetSeconds)), frames = Math.floor(inputFrames * sr / sampleRate);
    if (!frames) throw Error('This take contains no audio yet.');
    const bytes = new Uint8Array(frames * 4), view = new DataView(bytes.buffer), ratio = sampleRate / sr;
    for (let i = 0; i < frames; i++) {
      const at = i * ratio, j = Math.floor(at), f = at - j;
      for (let channel = 0; channel < 2; channel++) {
        const source = channel ? right : left, a = source[j] || 0, b = source[Math.min(j + 1, inputFrames - 1)] || 0, sample = a + (b - a) * f;
        view.setInt16(i * 4 + channel * 2, Math.round(Math.max(-1, Math.min(1, Number.isFinite(sample) ? sample : 0)) * 32767), true);
      }
    }
    let binary = ''; for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return { id, name: text(name, 'Recorded part'), sampleRate: sr, channels: 2, frames, duration: frames / sr, pcm: btoa(binary) };
  }
  function decodeAsset(a) {
    validateAsset(a);
    const binary = atob(a.pcm), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const view = new DataView(bytes.buffer), left = new Float32Array(a.frames), right = new Float32Array(a.frames);
    for (let i = 0; i < a.frames; i++) { left[i] = view.getInt16(i * a.channels * 2, true) / 32768; right[i] = view.getInt16((i * a.channels + a.channels - 1) * 2, true) / 32768; }
    return { left, right, sampleRate: a.sampleRate };
  }
  function decodeAssets(assets) { return Object.fromEntries(assets.map(a => [a.id, decodeAsset(a)])); }
  function demoState() {
    const d = defaultState(), template = window.LoomDemoTemplate;
    if (!template || !window.LoomDemoAssets) return d;
    return normalize({ ...copy(template), assets: window.LoomDemoAssets });
  }
  const beatsToSeconds = (beats, tempo) => beats * 60 / tempo;
  const formatTime = seconds => { const s = Math.max(0, Number(seconds) || 0); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0'); };
  window.LoomSchema = Object.freeze({ VERSION, COLORS, LIMITS, BUILT_INS, copy, uid, defaultState, demoState, normalize, effect, parseProject, serializeProject, encodeAsset, decodeAsset, decodeAssets, pruneAssets, beatsToSeconds, formatTime, validateAsset });
})();
