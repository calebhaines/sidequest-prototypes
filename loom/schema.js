/* GALLEY projects. Eight stations, with fixed capacity. */
(() => {
  'use strict';
  const VERSION = '1.25.1';
  const BUTTER_ANALOG_KEYS = new Set(['model', 'input', 'colour', 'timing', 'link', 'fetMode', 'thrust']);
  const BUTTER_MULTIBAND_KEYS = new Set(['bandMode', 'crossoverLow', 'crossoverHigh', ...['low', 'mid', 'high'].flatMap(band => ['Threshold', 'Ratio', 'Attack', 'Release', 'Gain', 'Enabled', 'Solo'].map(key => band + key))]);
  const BROILER_WORKSHOP_KEYS = new Set(['ampEnable', 'preampTube', 'powerTube', 'toneStack', 'bias', 'voltage', 'feedback', 'tightness', 'bright', 'coupling', 'cathode', 'transformer', 'powerScale', 'micType', 'cabLowCut', 'cabHighCut', 'cabResonance', ...Array.from({ length: 4 }, (_, i) => ['Type', 'Enabled', 'Route', 'Drive', 'Tone', 'Level', 'Mix'].map(key => 'pedal' + (i + 1) + key)).flat()]);
  const TRACK_EQ_BANDS = Object.freeze([
    { key: 'low', label: 'Low', frequency: 100, type: 'lowshelf', q: .707 },
    { key: 'lowMid', label: 'Lo mid', frequency: 400, frequencyKey: 'lowMidFreq', type: 'peaking', q: .707 },
    { key: 'highMid', label: 'Hi mid', frequency: 2500, frequencyKey: 'highMidFreq', type: 'peaking', q: .707 },
    { key: 'high', label: 'High', frequency: 10000, type: 'highshelf', q: .707 }
  ].map(Object.freeze));
  const TRACK_EQ_SWEEPS = Object.freeze([
    { key: 'lowMidFreq', band: 'lowMid', label: 'Lo mid sweep', min: 80, max: 2000, default: 400, step: 1, unit: 'Hz', scale: 'log' },
    { key: 'highMidFreq', band: 'highMid', label: 'Hi mid sweep', min: 400, max: 10000, default: 2500, step: 1, unit: 'Hz', scale: 'log' }
  ].map(Object.freeze));
  const defaultTrackEq = () => ({ low: 0, lowMid: 0, highMid: 0, high: 0, lowMidFreq: 400, highMidFreq: 2500 });
  const trackEq = raw => ({ ...Object.fromEntries(TRACK_EQ_BANDS.map(band => [band.key, number(raw?.[band.key], -12, 12, 0)])), ...Object.fromEntries(TRACK_EQ_SWEEPS.map(sweep => [sweep.key, number(raw?.[sweep.key], sweep.min, sweep.max, sweep.default)])) });
  function validateTrackEq(eq) {
    if (!plain(eq) || Object.keys(eq).length !== 6 || TRACK_EQ_BANDS.some(band => !Object.prototype.hasOwnProperty.call(eq, band.key) || typeof eq[band.key] !== 'number' || !Number.isFinite(eq[band.key]) || eq[band.key] < -12 || eq[band.key] > 12) || TRACK_EQ_SWEEPS.some(sweep => !Object.prototype.hasOwnProperty.call(eq, sweep.key) || typeof eq[sweep.key] !== 'number' || !Number.isFinite(eq[sweep.key]) || eq[sweep.key] < sweep.min || eq[sweep.key] > sweep.max)) throw Error('A track contains invalid four-band EQ settings or sweep frequencies.');
  }
  const effectSlotCount = owner => /^track-[1-8]$/.test(typeof owner === 'string' ? owner : owner?.id) ? 5 : 4;
  const lfoModule = typeof window.createLoomLFODSP === 'function' ? window.createLoomLFODSP() : null;
  const defaultLFOs = () => lfoModule ? lfoModule.defaultLFOs() : Array.from({ length: 4 }, (_, index) => ({ id: 'lfo-' + (index + 1), enabled: false, wave: 'sine', sync: true, rate: 1, division: 4, depth: 1, offset: 0, phase: 0, symmetry: .5, smoothing: 10, retrigger: 'transport', routes: [] }));
  const lfoTargets = state => lfoModule ? lfoModule.targets(state, automationTargets) : [];
  const COLORS = ['#ee7948', '#d7c98f', '#aab4af', '#90b6bd', '#ce9a75', '#e0b15e', '#abb394', '#bcc6cb'];
  const LIMITS = Object.freeze({ tracks: 8, returns: 2, slots: 5, trackSlots: 5, busSlots: 4, bars: 64, clipsPerTrack: 128, automationLanes: 64, automationPoints: 4096, lfos: 4, lfoRoutes: 16, markers: 128, assetSeconds: 120, pcmBytes: 64 * 1024 * 1024, projectBytes: 256 * 1024 * 1024, appHtmlBytes: 36 * 1024 * 1024, snapshotBytes: 96 * 1024 * 1024 });
  const BUILT_INS = ['grain', 'form', 'tine', 'mire', 'spool', 'haze', 'bower', 'ravel', 'fable', 'roux', 'batter', 'proof', 'marinade', 'picnic', 'morsel'];
  // Display branding is independent of legacy IDs, project formats and storage.
  const INSTRUMENT_NAMES = Object.freeze({ grain: 'SIZZLE', form: 'HOTPLATE', tine: 'CLATTER', mire: 'REDUCE', spool: 'ROTISSERIE', haze: 'STEAM', bower: 'SKEWER', ravel: 'DICER', fable: 'STOCK', roux: 'ROUX', batter: 'BATTER', proof: 'LEAVEN', marinade: 'MARINADE', picnic: 'PICNIC', morsel: 'MORSEL' });
  const instrumentName = value => value ? INSTRUMENT_NAMES[value.id] || value.name || value.id?.toUpperCase() || 'Custom instrument' : 'Choose a track instrument';
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
    return { id: 'track-' + (index + 1), name: 'Track ' + (index + 1), color: COLORS[index], level: 0.8, pan: 0, mute: false, solo: false, armed: false, instrumentLive: false, instrument: null, effects: [null, null, null, null, null], eq: defaultTrackEq(), sends: [0, 0], sendPre: [false, false], automation: [], clips: [] };
  }
  function defaultMaster() {
    return { id: 'master', name: 'Master', level: 0.8, metronome: false, mute: false, effects: [null, null, null, null], automation: [] };
  }
  function defaultReturn(index) {
    if (index !== 0 && index !== 1) throw Error('Choose Return A or Return B.');
    const type = index === 0 ? 'vestige' : 'parallax', definition = (window.LoomEffectsCatalog || []).find(e => e.id === type);
    return { id: 'return-' + (index + 1), name: 'Return ' + (index === 0 ? 'A' : 'B'), level: 1, pan: 0, mute: false, solo: false, effects: [definition ? effect({ type, params: { ...definition.defaults, mix: 1 } }) : null, null, null, null], automation: [] };
  }
  function defaultState() {
    return { version: 1, name: 'Service is going strangely well', tempo: 96, lengthBars: 16, loopEnabled: true, loopStart: 0, loopEnd: 16, master: defaultMaster(), returns: [defaultReturn(0), defaultReturn(1)], recording: { countInBars: 0, punchEnabled: false, punchStart: 0, punchEnd: 16, micCompensation: 'auto', micOffsetMs: 0, micInputGainDb: 0 }, markers: [], selectedTrack: 0, lfos: defaultLFOs(), view: { zoom: 48, snap: 0.25, tab: 'arrange', follow: true }, tracks: Array.from({ length: 8 }, (_, i) => track(i)), assets: [] };
  }
  function automationOwner(state, id) {
    if (typeof id !== 'string') return null;
    if (id === 'master') return state?.master || null;
    if (/^return-[12]$/.test(id)) return state?.returns?.find(owner => owner.id === id) || null;
    if (/^track-[1-8]$/.test(id)) return state?.tracks?.find(owner => owner.id === id) || null;
    return null;
  }
  function automationTargets(t) {
    const master = t?.id === 'master', isReturn = /^return-[12]$/.test(t?.id), ownerName = master ? 'Master' : isReturn ? text(t.name, t.id === 'return-1' ? 'Return A' : 'Return B') : 'Track', defaultLevel = isReturn ? 1 : .8;
    const result = [{ target: 'level', label: ownerName + ' volume', min: 0, max: 1.5, step: .01, default: defaultLevel, value: number(t?.level, 0, 1.5, defaultLevel), unit: '' }];
    if (!master) result.push({ target: 'pan', label: ownerName + ' pan', min: -1, max: 1, step: .01, default: 0, value: number(t?.pan, -1, 1, 0), unit: '' });
    if (!master && !isReturn) for (let send = 0; send < 2; send++) result.push({ target: 'send:' + send, label: 'Send ' + (send === 0 ? 'A' : 'B') + ' level', min: 0, max: 1, step: .01, default: 0, value: number(t?.sends?.[send], 0, 1, 0), unit: '' });
    for (let slot = 0; slot < effectSlotCount(t); slot++) {
      const effect = t?.effects?.[slot], definition = (window.LoomEffectsCatalog || []).find(e => e.id === effect?.type);
      if (!definition) continue;
      for (const p of definition.params) if (p.type === 'range') result.push({ target: 'fx:' + slot + ':' + p.key, label: (slot + 1) + ' · ' + definition.name + ' · ' + p.label, min: p.min, max: p.max, step: p.step, default: p.default, value: number(effect.params?.[p.key], p.min, p.max, p.default), unit: p.unit || '', effectType: definition.id });
    }
    if (/^track-[1-8]$/.test(t?.id)) {
      for (const band of TRACK_EQ_BANDS) result.push({ target: 'eq:' + band.key, label: 'Track EQ · ' + band.label + (band.frequencyKey ? ' gain' : ' · ' + (band.frequency < 1000 ? band.frequency + ' Hz' : band.frequency / 1000 + ' kHz')), min: -12, max: 12, step: .1, default: 0, value: number(t.eq?.[band.key], -12, 12, 0), unit: 'dB' });
      for (const sweep of TRACK_EQ_SWEEPS) result.push({ ...sweep, target: 'eq:' + sweep.key, label: 'Track EQ · ' + sweep.label, value: number(t.eq?.[sweep.key], sweep.min, sweep.max, sweep.default) });
    }
    return result;
  }
  function automationValue(lane, beat, fallback = 0) {
    if (!lane || lane.enabled === false || !lane.points?.length || !Number.isFinite(beat)) return fallback;
    const p = lane.points;
    if (beat <= p[0].beat) return p[0].value;
    let lo = 0, hi = p.length - 1;
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (p[mid].beat <= beat) lo = mid; else hi = mid - 1; }
    if (lo === p.length - 1 || lane.interpolation === 'hold') return p[lo].value;
    const a = p[lo], b = p[lo + 1], f = (beat - a.beat) / Math.max(1e-12, b.beat - a.beat);
    return a.value + (b.value - a.value) * f;
  }
  function automation(raw, t, totalBeats) {
    const descriptors = new Map(automationTargets(t).map(p => [p.target, p])), seen = new Set(), lanes = [];
    for (const lane of (Array.isArray(raw) ? raw : []).slice(0, LIMITS.automationLanes)) {
      const d = descriptors.get(lane?.target);
      if (!d || seen.has(d.target) || (d.effectType && lane.effectType && lane.effectType !== d.effectType)) continue;
      seen.add(d.target);
      const unique = new Map();
      for (const p of (Array.isArray(lane.points) ? lane.points : []).slice(0, LIMITS.automationPoints)) if (plain(p) && Number.isFinite(p.beat) && Number.isFinite(p.value)) { const beat = number(p.beat, 0, totalBeats, 0); unique.set(beat, { beat, value: number(p.value, d.min, d.max, d.default) }); }
      const normalized = { target: d.target, enabled: bool(lane.enabled, true), interpolation: lane.interpolation === 'hold' ? 'hold' : 'linear', points: [...unique.values()].sort((a, b) => a.beat - b.beat) };
      if (d.effectType) normalized.effectType = d.effectType;
      lanes.push(normalized);
    }
    return lanes;
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
      // Existing track imports clamp finite values. New band controls are
      // bounded here; buses additionally validate every range below.
      if (strict && (param.type === 'range' ? typeof v !== 'number' || !Number.isFinite(v) || definition.id === 'velvet' && BUTTER_MULTIBAND_KEYS.has(param.key) && (v < param.min || v > param.max) : !param.options.some(o => o.value === v))) throw Error('The ' + definition.name + ' settings are invalid or outside their valid range.');
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
    const result = { id: value.id, name: text(value.name, INSTRUMENT_NAMES[value.id] || 'New instrument') };
    if (value.url != null) {
      if (typeof value.url !== 'string' || value.url.length > 2048 || /^(?:javascript|data|file):/i.test(value.url.trim())) throw Error('Choose a same-site instrument URL or a self-contained HTML file.');
      result.url = value.url;
    }
    if (value.html != null) {
      if (typeof value.html !== 'string' || value.html.length > LIMITS.appHtmlBytes || !/<(?:html|body|script|doctype)\b/i.test(value.html)) throw Error('Instrument HTML must be a complete app smaller than 36 MiB.');
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
  function pattern(value) {
    if (!window.MusicLabPatternSchema) throw Error('The Kitchen pattern schema is unavailable.');
    return window.MusicLabPatternSchema.normalize(value);
  }
  function voiceMap(value = {}, packet) {
    if (!plain(value)) throw Error('A note clip contains an invalid voice map.');
    const result = {}, sources = new Set(packet.voices.map(v => v.id)), entries = Object.entries(value);
    if (entries.length > 64) throw Error('A note clip contains too many voice mappings.');
    for (const [source, target] of entries) {
      if (!sources.has(source) || ['__proto__', 'constructor', 'prototype'].includes(source) || typeof target !== 'string' || !target || target.length > 100 || /[\u0000-\u001f\u007f]/.test(target) || ['__proto__', 'constructor', 'prototype'].includes(target)) throw Error('A note clip contains an invalid source or destination voice.');
      result[source] = target;
    }
    return result;
  }
  function noteClip(value, totalBeats = LIMITS.bars * 4, strict = false) {
    if (!plain(value) || value.type !== 'notes' || value.origin != null || value.assetId != null) throw Error('A note clip must contain a pattern without audio or a nested source.');
    const packet = pattern(value.pattern), map = voiceMap(value.voiceMap, packet);
    if (strict) {
      if (typeof value.id !== 'string' || !value.id || typeof value.name !== 'string') throw Error('A note clip contains invalid names or identifiers.');
      strictNumbers(value, ['start', 'length', 'sourceOffset', 'rate', 'gain', 'fadeIn', 'fadeOut', 'transpose'], 'A note clip contains invalid controls.');
      if (value.start < 0 || value.length < 1 / 64 || value.start + value.length > totalBeats + 1e-6 || value.sourceOffset < 0 || value.sourceOffset > packet.lengthBeats || value.rate < .125 || value.rate > 8 || value.gain < 0 || value.gain > 2 || value.fadeIn < 0 || value.fadeOut < 0 || value.fadeIn > value.length / 2 || value.fadeOut > value.length / 2 || !Number.isInteger(value.transpose) || value.transpose < -48 || value.transpose > 48 || typeof value.loop !== 'boolean') throw Error('A note clip contains invalid timing or options.');
    }
    const start = number(value.start, 0, totalBeats - 1 / 64, 0), length = number(value.length, 1 / 64, totalBeats - start, Math.min(packet.lengthBeats, totalBeats - start));
    return { id: text(value.id, uid()), name: text(value.name, packet.name), type: 'notes', pattern: packet, voiceMap: map, start, length, sourceOffset: number(value.sourceOffset, 0, packet.lengthBeats, 0), rate: number(value.rate, .125, 8, 1), loop: bool(value.loop), gain: number(value.gain, 0, 2, 1), fadeIn: number(value.fadeIn, 0, length / 2, 0), fadeOut: number(value.fadeOut, 0, length / 2, 0), transpose: integer(value.transpose, -48, 48, 0) };
  }
  function renderSource(value) {
    if (!plain(value) || value.format !== 'loom-render-source' || value.version !== 1) throw Error('A printed clip contains an invalid musical source.');
    const descriptor = instrument(value.instrument);
    if (!descriptor || !descriptor.snapshot) throw Error('A printed clip needs its saved instrument state.');
    const packet = pattern(value.pattern), map = voiceMap(value.voiceMap, packet), sourceClip = noteClip(value.sourceClip, LIMITS.bars * 4, true);
    strictNumbers(value, ['tempo', 'tailSeconds', 'renderedAt'], 'A printed clip contains invalid rendering metadata.');
    if (value.tempo < 20 || value.tempo > 400 || value.tailSeconds < 0 || value.tailSeconds > 30 || value.renderedAt < 0) throw Error('A printed clip contains invalid rendering metadata.');
    return { format: 'loom-render-source', version: 1, instrument: descriptor, pattern: packet, voiceMap: map, tempo: value.tempo, tailSeconds: value.tailSeconds, sourceClip, renderedAt: value.renderedAt };
  }
  function normalize(raw = {}) {
    const d = defaultState(), totalBeats = integer(raw.lengthBars, 1, LIMITS.bars, d.lengthBars) * 4;
    const assets = [], ids = new Set(); let pcmBytes = 0;
    for (const a of Array.isArray(raw.assets) ? raw.assets : []) {
      pcmBytes += validateAsset(a);
      if (ids.has(a.id)) throw Error('Audio asset IDs must be unique.');
      ids.add(a.id); assets.push({ id: a.id, name: text(a.name, 'Audio'), sampleRate: a.sampleRate, channels: a.channels, frames: a.frames, duration: a.frames / a.sampleRate, pcm: a.pcm });
    }
    if (pcmBytes > LIMITS.pcmBytes) throw Error('This session exceeds GALLEY’s 64 MB audio budget. Remove unused audio or shorten a take.');
    const assetMap = new Map(assets.map(a => [a.id, a]));
    const s = { version: 1, name: text(raw.name, d.name), tempo: number(raw.tempo, 40, 240, d.tempo), lengthBars: totalBeats / 4, loopEnabled: bool(raw.loopEnabled, true), loopStart: number(raw.loopStart, 0, totalBeats - 0.25, 0), loopEnd: number(raw.loopEnd, 0.25, totalBeats, Math.min(totalBeats, 16)), master: { id: 'master', name: text(raw.master?.name, 'Master'), level: number(raw.master?.level, 0, 1.5, 0.8), metronome: bool(raw.master?.metronome), mute: bool(raw.master?.mute), effects: Array.from({ length: 4 }, (_, slot) => effect(raw.master?.effects?.[slot])), automation: [] }, returns: [], selectedTrack: integer(raw.selectedTrack, 0, 7, 0), view: { zoom: number(raw.view?.zoom, 4, 120, 48), snap: [0, 0.0625, 0.125, 0.25, 0.5, 1, 4].includes(raw.view?.snap) ? raw.view.snap : 0.25, tab: ['arrange', 'mixer'].includes(raw.view?.tab) ? raw.view.tab : 'arrange', follow: bool(raw.view?.follow, true) }, tracks: [], assets };
    s.master.automation = automation(raw.master?.automation, s.master, totalBeats);
    s.returns = Array.from({ length: 2 }, (_, index) => {
      const base = d.returns[index], r = raw.returns?.[index] || {};
      const bus = { ...base, name: text(r.name, base.name), level: number(r.level, 0, 1.5, 1), pan: number(r.pan, -1, 1, 0), mute: bool(r.mute), solo: bool(r.solo), effects: r.effects === undefined ? base.effects : Array.from({ length: 4 }, (_, slot) => effect(r.effects?.[slot])), automation: [] };
      bus.automation = automation(r.automation, bus, totalBeats); return bus;
    });
    if (s.loopEnd <= s.loopStart) s.loopEnd = Math.min(totalBeats, s.loopStart + 0.25);
    s.recording = { countInBars: [0, 1, 2].includes(raw.recording?.countInBars) ? raw.recording.countInBars : 0, punchEnabled: bool(raw.recording?.punchEnabled), punchStart: number(raw.recording?.punchStart, 0, totalBeats - .25, 0), punchEnd: number(raw.recording?.punchEnd, .25, totalBeats, Math.min(totalBeats, 16)), micCompensation: ['auto', 'manual', 'off'].includes(raw.recording?.micCompensation) ? raw.recording.micCompensation : 'auto', micOffsetMs: number(raw.recording?.micOffsetMs, -500, 500, 0), micInputGainDb: number(raw.recording?.micInputGainDb, -24, 24, 0) };
    if (s.recording.punchEnd <= s.recording.punchStart) s.recording.punchEnd = Math.min(totalBeats, s.recording.punchStart + .25);
    const markerIds = new Set();
    s.markers = (Array.isArray(raw.markers) ? raw.markers : []).slice(0, LIMITS.markers).filter(plain).map(m => { let id = text(m.id, uid('marker')); if (markerIds.has(id)) id = uid('marker'); markerIds.add(id); return { id, name: text(m.name, 'Section', 60), beat: number(m.beat, 0, totalBeats, 0), color: /^#[0-9a-f]{6}$/i.test(m.color || '') ? m.color : COLORS[0] }; }).sort((a, b) => a.beat - b.beat);
    const clipIds = new Set(); let snapshotBytes = 0;
    for (let i = 0; i < 8; i++) {
      const r = raw.tracks?.[i] || {}, base = track(i);
      const t = { ...base, name: text(r.name, base.name), color: /^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color : base.color, level: number(r.level, 0, 1.5, 0.8), pan: number(r.pan, -1, 1, 0), mute: bool(r.mute), solo: bool(r.solo), armed: bool(r.armed), instrumentLive: bool(r.instrumentLive), instrument: instrument(r.instrument), effects: Array.from({ length: LIMITS.trackSlots }, (_, j) => effect(r.effects?.[j])), eq: trackEq(r.eq), sends: Array.from({ length: 2 }, (_, send) => number(r.sends?.[send], 0, 1, 0)), sendPre: Array.from({ length: 2 }, (_, send) => bool(r.sendPre?.[send])), clips: [] };
      t.automation = automation(r.automation, t, totalBeats);
      if (t.instrument?.snapshot) snapshotBytes += JSON.stringify(t.instrument.snapshot).length;
      for (const c of (Array.isArray(r.clips) ? r.clips : []).slice(0, LIMITS.clipsPerTrack)) {
        if (c?.type === 'notes') {
          const normalized = noteClip(c, totalBeats);
          if (clipIds.has(normalized.id)) normalized.id = uid();
          clipIds.add(normalized.id); snapshotBytes += JSON.stringify(normalized.pattern).length;
          t.clips.push(normalized); continue;
        }
        if (c?.type !== undefined && c.type !== 'audio') throw Error('A clip contains an unsupported type.');
        const asset = assetMap.get(c?.assetId);
        if (!asset) continue;
        const start = number(c.start, 0, totalBeats - 1 / 64, 0), sourceDuration = asset.frames / asset.sampleRate;
        const sourceStart = number(c.sourceStart, 0, Math.max(0, sourceDuration - 1 / asset.sampleRate), 0);
        const sourceEnd = number(c.sourceEnd, sourceStart + 1 / asset.sampleRate, sourceDuration, sourceDuration);
        const length = number(c.length, 1 / 64, totalBeats - start, Math.min(totalBeats - start, (sourceEnd - sourceStart) * s.tempo / 60));
        let id = text(c.id, uid()); if (clipIds.has(id)) id = uid(); clipIds.add(id);
        const normalized = { id, name: text(c.name, asset.name), type: 'audio', assetId: asset.id, start, length, sourceStart, sourceEnd, sourceOffset: number(c.sourceOffset, 0, sourceDuration, 0), rate: number(c.rate, 0.125, 8, 1), reverse: bool(c.reverse), loop: bool(c.loop), gain: number(c.gain, 0, 2, 1), fadeIn: number(c.fadeIn, 0, length / 2, Math.min(0.02, length / 2)), fadeOut: number(c.fadeOut, 0, length / 2, Math.min(0.04, length / 2)) };
        if (c.origin != null) { normalized.origin = renderSource(c.origin); snapshotBytes += JSON.stringify(normalized.origin).length; }
        t.clips.push(normalized);
      }
      s.tracks.push(t);
    }
    s.lfos = lfoModule ? lfoModule.normalize(raw.lfos, s, lfoTargets(s)) : defaultLFOs();
    if (snapshotBytes > LIMITS.snapshotBytes) throw Error('Instrument states, note patterns, and printed sources exceed the 96 MB budget. Remove unused parts or saved sources.');
    if (raw.service !== undefined) { if (!window.LoomServiceSchema) throw Error('The SERVICE project schema is unavailable.'); s.service = window.LoomServiceSchema.normalize(raw.service, s); }
    return s;
  }
  function strictNumbers(o, keys, message) { for (const key of keys) if (typeof o?.[key] !== 'number' || !Number.isFinite(o[key])) throw Error(message); }
  function migrateEffectFields(effects, legacyBroiler, legacyButter, legacyMultiband = false) {
    for (const slot of Array.isArray(effects) ? effects : []) {
      const keys = slot?.type === 'broiler' && legacyBroiler ? BROILER_WORKSHOP_KEYS : slot?.type === 'velvet' && (legacyButter || legacyMultiband) ? new Set([...(legacyButter ? BUTTER_ANALOG_KEYS : []), ...(legacyMultiband ? BUTTER_MULTIBAND_KEYS : [])]) : null;
      if (!keys || !plain(slot.params)) continue;
      const definition = (window.LoomEffectsCatalog || []).find(effect => effect.id === slot.type);
      for (const param of definition?.params || []) if (keys.has(param.key) && !Object.prototype.hasOwnProperty.call(slot.params, param.key)) slot.params[param.key] = param.default;
    }
  }
  function validateAutomation(raw, owner, totalBeats, label, required = false) {
    if (raw === undefined && !required) return;
    if (!Array.isArray(raw) || raw.length > LIMITS.automationLanes) throw Error(label + ' contains too many or invalid automation lanes.');
    const descriptors = new Map(automationTargets(owner).map(p => [p.target, p])), targets = new Set();
    for (const lane of raw) {
      const descriptor = descriptors.get(lane?.target);
      if (!plain(lane) || !descriptor || targets.has(lane.target) || typeof lane.enabled !== 'boolean' || !['linear', 'hold'].includes(lane.interpolation) || !Array.isArray(lane.points) || lane.points.length > LIMITS.automationPoints || (descriptor.effectType && lane.effectType !== descriptor.effectType) || lane.target.startsWith('eq:') && lane.effectType !== undefined) throw Error(label + ' contains an invalid automation lane.');
      targets.add(lane.target);
      for (const p of lane.points) if (!plain(p) || !Number.isFinite(p.beat) || p.beat < 0 || p.beat > totalBeats || !Number.isFinite(p.value) || p.value < descriptor.min || p.value > descriptor.max) throw Error('An automation point is outside its valid range.');
    }
  }
  function validateBus(bus, index, totalBeats, legacyBroiler, legacyButter, legacyMultiband) {
    const master = index === -1, id = master ? 'master' : 'return-' + (index + 1), label = master ? 'The master bus' : 'Return ' + (index === 0 ? 'A' : 'B');
    const fields = master ? ['id', 'name', 'level', 'metronome', 'mute', 'effects', 'automation'] : ['id', 'name', 'level', 'pan', 'mute', 'solo', 'effects', 'automation'];
    if (!plain(bus) || bus.id !== id || fields.some(key => !Object.prototype.hasOwnProperty.call(bus, key)) || Object.keys(bus).some(key => !fields.includes(key)) || typeof bus.name !== 'string' || !bus.name.trim() || bus.name.length > 100 || typeof bus.mute !== 'boolean' || !Array.isArray(bus.effects) || bus.effects.length !== 4) throw Error(label + ' contains invalid settings, effects slots, or unsupported routing.');
    strictNumbers(bus, master ? ['level'] : ['level', 'pan'], label + ' contains invalid mix settings.');
    if (!master && (bus.level < 0 || bus.level > 1.5 || bus.pan < -1 || bus.pan > 1 || typeof bus.solo !== 'boolean') || master && typeof bus.metronome !== 'boolean') throw Error(label + ' contains invalid mix settings.');
    migrateEffectFields(bus.effects, legacyBroiler, legacyButter, legacyMultiband);
    for (const slot of bus.effects) {
      effect(slot, true);
      if (slot === null) continue;
      const definition = (window.LoomEffectsCatalog || []).find(effect => effect.id === slot.type);
      for (const param of definition.params) if (param.type === 'range' && (slot.params[param.key] < param.min || slot.params[param.key] > param.max)) throw Error(label + ' contains effect settings outside their valid range.');
    }
    validateAutomation(bus.automation, bus, totalBeats, label, true);
  }
  function parseProject(json) {
    if (typeof json !== 'string' || json.length > LIMITS.projectBytes) throw Error('Choose a GALLEY project smaller than 256 MB.');
    let p; try { p = JSON.parse(json); } catch { throw Error('This file is not valid JSON.'); }
    if (!plain(p) || p.format !== 'loom-project' || p.formatVersion !== 1 || !plain(p.state)) throw Error('Choose a GALLEY project (.loom.json).');
    const s = p.state;
    const savedVersion = typeof p.appVersion === 'string' && /^(\d+)\.(\d+)\.(\d+)$/.exec(p.appVersion);
    const legacyBroiler = p.appVersion === undefined || savedVersion && (Number(savedVersion[1]) < 1 || Number(savedVersion[1]) === 1 && Number(savedVersion[2]) < 14);
    const legacyButter = p.appVersion === undefined || savedVersion && (Number(savedVersion[1]) < 1 || Number(savedVersion[1]) === 1 && Number(savedVersion[2]) < 15);
    const legacyBuses = p.appVersion === undefined || savedVersion && (Number(savedVersion[1]) < 1 || Number(savedVersion[1]) === 1 && Number(savedVersion[2]) < 16);
    const legacyTrackEq = p.appVersion === undefined || savedVersion && (Number(savedVersion[1]) < 1 || Number(savedVersion[1]) === 1 && Number(savedVersion[2]) < 18);
    const legacyMixUpgrade = p.appVersion === undefined || savedVersion && (Number(savedVersion[1]) < 1 || Number(savedVersion[1]) === 1 && Number(savedVersion[2]) < 25);
    if (s.version !== 1 || typeof s.name !== 'string' || !Array.isArray(s.tracks) || s.tracks.length !== 8 || !Array.isArray(s.assets) || !plain(s.master) || !plain(s.view)) throw Error('A GALLEY project must contain eight complete tracks.');
    strictNumbers(s, ['tempo', 'lengthBars', 'loopStart', 'loopEnd', 'selectedTrack'], 'The project contains invalid transport settings.');
    if (!Number.isInteger(s.lengthBars) || s.lengthBars < 1 || s.lengthBars > 64 || s.tempo < 40 || s.tempo > 240 || s.loopStart < 0 || s.loopEnd > s.lengthBars * 4 || s.loopEnd <= s.loopStart || !Number.isInteger(s.selectedTrack) || s.selectedTrack < 0 || s.selectedTrack > 7 || typeof s.loopEnabled !== 'boolean') throw Error('The project’s transport range is invalid.');
    strictNumbers(s.master, ['level'], 'The project contains invalid master settings.');
    strictNumbers(s.view, ['zoom', 'snap'], 'The project contains invalid view settings.');
    if (typeof s.master.metronome !== 'boolean' || !['arrange', 'mixer'].includes(s.view.tab) || ![0, 0.0625, 0.125, 0.25, 0.5, 1, 4].includes(s.view.snap)) throw Error('The project contains invalid options.');
    // Legacy files inherit only absent bus fields. Supplied arrays, IDs,
    // booleans, and routes must pass the same strict checks as a new project.
    if (legacyBuses) {
      for (const [key, value] of Object.entries(defaultMaster())) if (!['level', 'metronome'].includes(key) && !Object.prototype.hasOwnProperty.call(s.master, key)) s.master[key] = copy(value);
      if (!Object.prototype.hasOwnProperty.call(s, 'returns')) s.returns = [defaultReturn(0), defaultReturn(1)];
    }
    validateBus(s.master, -1, s.lengthBars * 4, legacyBroiler, legacyButter, legacyMixUpgrade);
    if (!Array.isArray(s.returns) || s.returns.length !== 2) throw Error('A GALLEY project must contain two complete return buses.');
    s.returns.forEach((bus, index) => validateBus(bus, index, s.lengthBars * 4, legacyBroiler, legacyButter, legacyMixUpgrade));
    if(s.view.follow !== undefined && typeof s.view.follow !== 'boolean') throw Error('The project contains an invalid playhead follow setting.');
    if (s.recording !== undefined) {
      if (!plain(s.recording) || ![0, 1, 2].includes(s.recording.countInBars) || typeof s.recording.punchEnabled !== 'boolean') throw Error('The project contains invalid recording settings.');
      strictNumbers(s.recording, ['punchStart', 'punchEnd'], 'The project contains invalid punch timing.');
      if (s.recording.punchStart < 0 || s.recording.punchEnd > s.lengthBars * 4 || s.recording.punchEnd - s.recording.punchStart < .25 - 1e-8) throw Error('The project contains an invalid punch range.');
      if (s.recording.micCompensation !== undefined && !['auto', 'manual', 'off'].includes(s.recording.micCompensation)) throw Error('The project contains an invalid microphone compensation mode.');
      for (const [key, min, max] of [['micOffsetMs', -500, 500], ['micInputGainDb', -24, 24]]) if (s.recording[key] !== undefined && (typeof s.recording[key] !== 'number' || !Number.isFinite(s.recording[key]) || s.recording[key] < min || s.recording[key] > max)) throw Error('The project contains an invalid microphone timing or gain setting.');
    }
    if (s.markers !== undefined) {
      if (!Array.isArray(s.markers) || s.markers.length > LIMITS.markers) throw Error('The project contains too many section markers.');
      const markerIds = new Set();
      for (const m of s.markers) { if (!plain(m) || typeof m.id !== 'string' || !m.id || markerIds.has(m.id) || typeof m.name !== 'string' || !Number.isFinite(m.beat) || m.beat < 0 || m.beat > s.lengthBars * 4 || !/^#[0-9a-f]{6}$/i.test(m.color || '')) throw Error('The project contains an invalid section marker.'); markerIds.add(m.id); }
    }
    const ids = new Set(), clipIds = new Set();
    for (const a of s.assets) { validateAsset(a); if (ids.has(a.id)) throw Error('Audio asset IDs must be unique.'); ids.add(a.id); }
    for (let i = 0; i < 8; i++) {
      const t = s.tracks[i];
      if (legacyMixUpgrade && Array.isArray(t?.effects) && t.effects.length === 4) t.effects.push(null);
      if (!plain(t) || t.id !== 'track-' + (i + 1) || typeof t.name !== 'string' || !Array.isArray(t.effects) || t.effects.length !== LIMITS.trackSlots || !Array.isArray(t.clips) || t.clips.length > 128) throw Error('Each of the eight tracks must contain five effects slots and valid clips.');
      if (legacyTrackEq && !Object.prototype.hasOwnProperty.call(t, 'eq')) t.eq = defaultTrackEq();
      if (legacyMixUpgrade && plain(t.eq)) for (const sweep of TRACK_EQ_SWEEPS) if (!Object.prototype.hasOwnProperty.call(t.eq, sweep.key)) t.eq[sweep.key] = sweep.default;
      validateTrackEq(t.eq);
      strictNumbers(t, ['level', 'pan'], 'A track contains invalid mix settings.');
      for (const key of ['mute', 'solo', 'armed', 'instrumentLive']) if (typeof t[key] !== 'boolean') throw Error('A track contains invalid options.');
      instrument(t.instrument);
      if (legacyBuses) {
        if (!Object.prototype.hasOwnProperty.call(t, 'sends')) t.sends = [0, 0];
        if (!Object.prototype.hasOwnProperty.call(t, 'sendPre')) t.sendPre = [false, false];
      }
      if (!Array.isArray(t.sends) || t.sends.length !== 2 || t.sends.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) || !Array.isArray(t.sendPre) || t.sendPre.length !== 2 || t.sendPre.some(value => typeof value !== 'boolean')) throw Error('A track contains invalid send levels or pre-fader options.');
      // Workshop controls were introduced in 1.14. Older projects inherit only
      // the new fields; existing controls and any supplied new values still
      // undergo the same strict validation as a current project.
      migrateEffectFields(t.effects, legacyBroiler, legacyButter, legacyMixUpgrade);
      t.effects.forEach(e => effect(e, true));
      validateAutomation(t.automation, t, s.lengthBars * 4, 'A track');
      for (const c of t.clips) {
        if (!plain(c) || typeof c.id !== 'string' || !c.id || clipIds.has(c.id) || typeof c.name !== 'string') throw Error('A clip contains invalid or duplicate identifiers.');
        clipIds.add(c.id);
        if (c.type === 'notes') { noteClip(c, s.lengthBars * 4, true); continue; }
        if ((c.type !== undefined && c.type !== 'audio') || !ids.has(c.assetId)) throw Error('A clip contains an invalid or missing audio reference.');
        if (c.origin != null) renderSource(c.origin);
        strictNumbers(c, ['start', 'length', 'sourceStart', 'sourceEnd', 'sourceOffset', 'rate', 'gain', 'fadeIn', 'fadeOut'], 'A clip contains invalid controls.');
        if (c.start < 0 || c.length <= 0 || c.start + c.length > s.lengthBars * 4 + 1e-6 || c.sourceStart < 0 || c.sourceEnd <= c.sourceStart || c.sourceOffset < 0 || c.sourceOffset > 120 || c.rate <= 0 || c.gain < 0 || typeof c.reverse !== 'boolean' || typeof c.loop !== 'boolean') throw Error('A clip contains invalid timing or options.');
        const a = s.assets.find(a => a.id === c.assetId); if (c.sourceEnd > a.frames / a.sampleRate + 1 / a.sampleRate) throw Error('A clip extends beyond its source audio.');
      }
    }
    if (s.lfos !== undefined) {
      if (lfoModule) lfoModule.validate(s.lfos, s, lfoTargets(s));
      else if (!Array.isArray(s.lfos) || s.lfos.length !== 4 || s.lfos.some(lfo => lfo?.enabled || lfo?.routes?.length)) throw Error('The LFO module is unavailable.');
    }
    if (s.service !== undefined) { if (!window.LoomServiceSchema) throw Error('The SERVICE project schema is unavailable.'); window.LoomServiceSchema.validate(s.service, s); }
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
  window.LoomSchema = Object.freeze({ VERSION, COLORS, LIMITS, effectSlotCount, defaultLFOs, lfoTargets, TRACK_EQ_BANDS, TRACK_EQ_SWEEPS, defaultTrackEq, BUILT_INS, INSTRUMENT_NAMES, instrumentName, copy, uid, defaultState, defaultMaster, defaultReturn, demoState, normalize, effect, automationOwner, automationTargets, automationValue, parseProject, serializeProject, encodeAsset, decodeAsset, decodeAssets, pruneAssets, beatsToSeconds, formatTime, validateAsset, pattern, voiceMap, noteClip, renderSource });
})();
