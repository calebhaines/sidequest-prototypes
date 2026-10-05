/* SPOOL's portable project format. Audio assets are stereo-safe 16-bit PCM. */
(() => {
  'use strict';
  const VERSION = '1.0.0';
  const SEED_TYPES = [
    { id: 'drums', name: 'Drum phrase', description: 'A locally synthesized rhythm of rounded kicks, rattling snares and little hats.' },
    { id: 'bass', name: 'Bass phrase', description: 'A warm, stepped bass line that keeps its own small appointment.' },
    { id: 'keys', name: 'Soft keys', description: 'A chord phrase made from soft, slowly fading harmonics.' },
    { id: 'bells', name: 'Bell phrase', description: 'Bright, inharmonic notes with room between their replies.' },
    { id: 'pluck', name: 'Plucked phrase', description: 'A little repeating melody, plucked and left to wander.' },
    { id: 'texture', name: 'Air & dust', description: 'A slowly breathing bed of filtered noise and softly beating tones.' },
    { id: 'reed', name: 'Reed phrase', description: 'A reedy harmonic phrase, for winding into the tape.' },
    { id: 'rhythm', name: 'Clockwork', description: 'A crisp, irregular pattern of pulses and metallic ticks.' },
  ];
  const VOICES = [
    { id: 'sine', name: 'Soft sine' }, { id: 'reed', name: 'Reed' },
    { id: 'pluck', name: 'Pluck' }, { id: 'bell', name: 'Bell' }, { id: 'noise', name: 'Dust' },
  ];
  const DIVISIONS = ['1/16', '1/8', '3/16', '1/4', '3/8', '1/2'];
  const RECORD_INPUTS = [
    { id: 'keys', name: 'Built-in keys' }, { id: 'mic', name: 'Microphone' },
    { id: 'both', name: 'Keys + microphone' }, { id: 'resample', name: 'Other decks' },
  ];
  const copy = value => JSON.parse(JSON.stringify(value));
  const num = (v, min, max, fallback) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  const int = (v, min, max, fallback) => Math.round(num(v, min, max, fallback));
  const str = (v, fallback, length = 64) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, length) || fallback : fallback;
  const pick = (v, values, fallback) => values.includes(v) ? v : fallback;
  const bool = (v, fallback = false) => typeof v === 'boolean' ? v : fallback;
  function seedAsset(id, name, options = {}) {
    return { kind: 'seed', name, id, seed: options.seed ?? 0x53504f4f, tempo: options.tempo ?? 96, bars: options.bars ?? 2, pitch: options.pitch ?? 48 };
  }
  function defaultDeck(index) {
    return {
      name: ['The pocket clock', 'A warm rumour', 'Borrowed keys', 'Air, wound twice'][index],
      rate: 1, reverse: false, level: [.80, .70, .62, .45][index], pan: [-.08, .12, -.28, .35][index], mute: false, solo: false,
      start: 0, end: 1, phase: 0, seam: 12, sync: true, beats: 8,
      tone: [11800, 7200, 9400, 6800][index], highpass: [32, 24, 95, 180][index],
      saturation: .20, wow: .10, flutter: .07, wear: .12, hiss: .025, dropouts: .02,
    };
  }
  function defaultState() {
    return {
      version: VERSION, name: 'Yesterday, wound incorrectly', tempo: 96,
      master: { volume: .70, width: .83, echo: .15, echoDivision: '3/16', feedback: .36, space: .16 },
      decks: Array.from({ length: 4 }, (_, i) => defaultDeck(i)),
      assets: [
        seedAsset('drums', 'The pocket clock', { seed: 4101, tempo: 96, pitch: 36 }),
        seedAsset('bass', 'A warm rumour', { seed: 7102, tempo: 96, pitch: 36 }),
        seedAsset('keys', 'Borrowed keys', { seed: 9103, tempo: 96, pitch: 48 }),
        seedAsset('texture', 'Air, wound twice', { seed: 11104, tempo: 96, pitch: 60 }),
      ],
      source: { voice: 'pluck', root: 48, decay: 900, tone: 8200, level: .60, monitor: true },
      record: { input: 'keys', bars: 2, quantize: true, feedback: .88 },
    };
  }
  function assetDuration(asset) {
    if (!asset) return 0;
    return asset.kind === 'seed' ? asset.bars * 240 / asset.tempo : asset.frames / asset.sampleRate;
  }
  function normalizeAsset(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.kind === 'seed' && SEED_TYPES.some(type => type.id === raw.id)) {
      return seedAsset(raw.id, str(raw.name, SEED_TYPES.find(t => t.id === raw.id).name, 100), {
        seed: int(raw.seed, 1, 0xffffffff, 0x53504f4f), tempo: num(raw.tempo, 40, 180, 96),
        bars: int(raw.bars, 1, 4, 2), pitch: int(raw.pitch, 24, 84, 48),
      });
    }
    if (raw.kind !== 'pcm' || typeof raw.pcm !== 'string') return null;
    const sampleRate = int(raw.sampleRate, 8000, 48000, 48000), channels = raw.channels === 1 ? 1 : 2;
    if (raw.pcm.length < 8 || raw.pcm.length > Math.ceil(sampleRate * 30 * channels * 2 / 3) * 4 + 16 || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw.pcm)) return null;
    const bytes = Math.floor(raw.pcm.length * .75) - (raw.pcm.endsWith('==') ? 2 : raw.pcm.endsWith('=') ? 1 : 0);
    const frames = bytes / (channels * 2);
    if (!Number.isInteger(frames) || frames < 2 || frames > sampleRate * 30) return null;
    return { kind: 'pcm', name: str(raw.name, 'Recorded tape', 100), sampleRate, channels, pcm: raw.pcm, frames, duration: frames / sampleRate };
  }
  function normalize(input) {
    const d = defaultState(), raw = input && typeof input === 'object' ? input : {};
    const m = raw.master || {}, source = raw.source || {}, record = raw.record || {};
    const state = {
      version: VERSION, name: str(raw.name, d.name, 100), tempo: num(raw.tempo, 40, 180, d.tempo),
      master: {
        volume: num(m.volume, 0, 1, d.master.volume), width: num(m.width, 0, 1, d.master.width),
        echo: num(m.echo, 0, 1, d.master.echo), echoDivision: pick(m.echoDivision, DIVISIONS, d.master.echoDivision),
        feedback: num(m.feedback, 0, .85, d.master.feedback), space: num(m.space, 0, 1, d.master.space),
      }, decks: [], assets: [],
      source: {
        voice: pick(source.voice, VOICES.map(v => v.id), d.source.voice), root: int(source.root, 36, 72, d.source.root),
        decay: num(source.decay, 80, 3000, d.source.decay), tone: num(source.tone, 200, 16000, d.source.tone),
        level: num(source.level, 0, 1, d.source.level), monitor: bool(source.monitor, d.source.monitor),
      },
      record: {
        input: pick(record.input, RECORD_INPUTS.map(v => v.id), d.record.input),
        bars: pick(record.bars, [0, 1, 2, 4], d.record.bars), quantize: bool(record.quantize, d.record.quantize),
        feedback: num(record.feedback, 0, 1, d.record.feedback),
      },
    };
    for (let i = 0; i < 4; i++) {
      const n = raw.decks?.[i] || {}, dn = d.decks[i];
      const start = num(n.start, 0, .998, dn.start), end = num(n.end, start + .002, 1, dn.end);
      state.decks.push({
        name: str(n.name, dn.name, 48), rate: num(n.rate, .25, 2, dn.rate), reverse: bool(n.reverse),
        level: num(n.level, 0, 1.5, dn.level), pan: num(n.pan, -1, 1, dn.pan), mute: bool(n.mute), solo: bool(n.solo),
        start, end, phase: num(n.phase, 0, 1, dn.phase), seam: num(n.seam, 0, 80, dn.seam), sync: bool(n.sync, dn.sync), beats: int(n.beats, 1, 64, dn.beats),
        tone: num(n.tone, 200, 18000, dn.tone), highpass: num(n.highpass, 20, 3000, dn.highpass),
        saturation: num(n.saturation, 0, 1, dn.saturation), wow: num(n.wow, 0, 1, dn.wow), flutter: num(n.flutter, 0, 1, dn.flutter),
        wear: num(n.wear, 0, 1, dn.wear), hiss: num(n.hiss, 0, 1, dn.hiss), dropouts: num(n.dropouts, 0, 1, dn.dropouts),
      });
      state.assets.push(normalizeAsset(Array.isArray(raw.assets) ? raw.assets[i] : d.assets[i]));
    }
    if (raw.musicLabPattern !== undefined) {
      const overlay = raw.musicLabPattern;
      if (!overlay || typeof overlay !== 'object' || !overlay.voiceMap || typeof overlay.voiceMap !== 'object' || Array.isArray(overlay.voiceMap) || !window.MusicLabPatternSchema) throw new Error('Invalid shared pattern.');
      const pattern = window.MusicLabPatternSchema.normalize(overlay.pattern), voiceMap = {};
      for (const voice of pattern.voices) {
        const destination = overlay.voiceMap[voice.id];
        if (typeof destination !== 'string' || !/^deck-[0-3]$/.test(destination)) throw new Error('Invalid shared voice mapping.');
        voiceMap[voice.id] = destination;
      }
      state.musicLabPattern = { pattern, voiceMap };
    }
    return state;
  }
  function parseProject(json) {
    if (typeof json !== 'string' || json.length > 32 * 1024 * 1024) throw new Error('Choose a SPOOL project smaller than 32 MB.');
    let project;
    try { project = JSON.parse(json); } catch { throw new Error('This file is not valid JSON.'); }
    if (!project || project.format !== 'spool-project' || project.formatVersion !== 1 || !project.state) throw new Error('Choose a SPOOL project file (.spool.json).');
    const s = project.state;
    if (!Array.isArray(s.decks) || s.decks.length !== 4 || !Array.isArray(s.assets) || s.assets.length !== 4 || !s.master || !s.source || !s.record) throw new Error('This SPOOL project needs four complete decks and their audio assets.');
    const state = normalize(s);
    for (let i = 0; i < 4; i++) {
      const raw = s.assets[i], asset = state.assets[i];
      if (raw == null) continue;
      if (!asset) throw new Error(`Deck ${i + 1} contains an invalid or overlong tape. Clips are limited to 30 seconds.`);
      if (asset.kind === 'pcm') {
        if (!Number.isInteger(raw.sampleRate) || raw.sampleRate < 8000 || raw.sampleRate > 48000 || ![1, 2].includes(raw.channels) || raw.frames !== asset.frames) throw new Error(`Deck ${i + 1} has inconsistent audio metadata.`);
        let binary;
        try { binary = atob(asset.pcm); } catch { throw new Error(`Deck ${i + 1} contains invalid audio data.`); }
        if (binary.length !== asset.frames * asset.channels * 2) throw new Error(`Deck ${i + 1} audio is incomplete.`);
      }
    }
    return state;
  }
  function serializeProject(state) {
    return JSON.stringify({ format: 'spool-project', formatVersion: 1, appVersion: VERSION, state: normalize(state) });
  }
  function noteName(midi) {
    const n = Math.round(midi);
    return ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][(n % 12 + 12) % 12] + (Math.floor(n / 12) - 1);
  }
  window.SpoolSchema = { VERSION, SEED_TYPES, VOICES, DIVISIONS, RECORD_INPUTS, defaultState, defaultDeck, seedAsset, normalizeAsset, normalize, assetDuration, parseProject, serializeProject, noteName, copy };
})();
