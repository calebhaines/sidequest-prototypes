/* REDUCE's portable project format and bounded control values. */
(() => {
  'use strict';
  const VERSION = '1.0.0';
  const NODE_MODELS = [
    { id: 'tape', name: 'Tape echo', description: 'Warm repeats, soft saturation and a little mechanical uncertainty.' },
    { id: 'string', name: 'String', description: 'A tuned, damped feedback string. Pitch sets the note; time sets the returning echo.' },
    { id: 'diffuser', name: 'Diffuser', description: 'Scattered all-pass reflections that turn short sounds into soft rooms.' },
    { id: 'bowl', name: 'Singing bowl', description: 'A small bank of ringing modes, fed by the passing signal.' },
    { id: 'spring', name: 'Spring', description: 'Dispersed, metallic reflections with a lively twang.' },
    { id: 'cloud', name: 'Cloud', description: 'A cluster of overlapping taps, drifting around the main delay.' },
  ];
  const SOURCE_KINDS = [
    { id: 'drop', name: 'Droplet', description: 'A rounded sine strike with a falling pitch.' },
    { id: 'pluck', name: 'Pluck', description: 'A short, bright burst of harmonics.' },
    { id: 'dust', name: 'Dust', description: 'Filtered noise and scattered little impulses.' },
    { id: 'chime', name: 'Chime', description: 'Several inharmonic partials with a ringing envelope.' },
    { id: 'reed', name: 'Reed', description: 'A breathing, filtered harmonic tone.' },
    { id: 'pulse', name: 'Pulse', description: 'A sharp pulse with adjustable harmonic weight.' },
    { id: 'bow', name: 'Bow', description: 'A swelling mixture of noise and pitched friction.' },
    { id: 'sample', name: 'Sample', description: 'Your imported sound, pitched from its original note at C4. Imports use the first ten seconds.' },
  ];
  const DIVISIONS = ['1/16', '1/8', '3/16', '1/4', '3/8', '1/2', '3/4', '1/1'];
  const names = ['A · Stockpot', 'B · Bain-marie', 'C · Saucepan', 'D · Kettle'];
  const LFO_TARGETS = [{ id: 'none', name: 'Unassigned' }];
  for (let i = 0; i < 4; i++) {
    for (const [key, label] of [['time', 'Time'], ['tone', 'Tone'], ['pitch', 'Pitch'], ['pan', 'Pan'], ['decay', 'Decay']]) {
      LFO_TARGETS.push({ id: `n${i}.${key}`, name: `${String.fromCharCode(65 + i)} · ${label}` });
    }
  }
  LFO_TARGETS.push({ id: 'circulation', name: 'Feedback · Circulation' }, { id: 'drive', name: 'Master · Drive' });
  const copy = value => JSON.parse(JSON.stringify(value));
  const number = (value, min, max, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  const integer = (value, min, max, fallback) => Math.round(number(value, min, max, fallback));
  const text = (value, fallback, length = 64) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, length) || fallback : fallback;
  const choice = (value, options, fallback) => options.includes(value) ? value : fallback;
  const step = (on = false, velocity = .8) => ({ on, velocity, probability: 1, ratchet: 1 });

  function defaultState() {
    return {
      version: VERSION, name: 'The patient stockpot', tempo: 104, swing: .08,
      master: { volume: .65, mix: .84, drive: .12, width: .85 },
      garden: { circulation: .70, damping: .25, freeze: false },
      nodes: [
        { name: names[0], model: 'tape', time: 288, sync: true, division: '1/8', pitch: 48, tone: 4600, decay: .82, resonance: .28, drift: .12, pan: -.68, level: .78, mute: false },
        { name: names[1], model: 'diffuser', time: 433, sync: true, division: '3/16', pitch: 55, tone: 5600, decay: .76, resonance: .35, drift: .20, pan: .58, level: .72, mute: false },
        { name: names[2], model: 'string', time: 577, sync: true, division: '1/4', pitch: 60, tone: 7400, decay: .88, resonance: .64, drift: .08, pan: -.26, level: .62, mute: false },
        { name: names[3], model: 'cloud', time: 866, sync: true, division: '3/8', pitch: 67, tone: 3600, decay: .86, resonance: .45, drift: .22, pan: .32, level: .66, mute: false },
      ],
      routing: [[.50, .36, .06, 0], [0, .46, .36, .08], [.14, 0, .48, .32], [.32, .12, 0, .48]],
      sources: [
        { name: 'Droplet', kind: 'drop', pitch: 48, decay: 180, tone: 5200, texture: .25, level: .63, destination: 0, mute: false, steps: Array.from({ length: 16 }, (_, i) => step([0, 6, 10].includes(i), i === 0 ? .95 : .65)) },
        { name: 'Copper', kind: 'chime', pitch: 67, decay: 450, tone: 8400, texture: .40, level: .36, destination: 2, mute: false, steps: Array.from({ length: 16 }, (_, i) => step([3, 11, 14].includes(i), .65)) },
        { name: 'Dust', kind: 'dust', pitch: 60, decay: 65, tone: 6300, texture: .55, level: .27, destination: 1, mute: false, steps: Array.from({ length: 16 }, (_, i) => step([2, 7, 12, 15].includes(i), .55)) },
        { name: 'Reed', kind: 'reed', pitch: 55, decay: 620, tone: 2400, texture: .30, level: .30, destination: 3, mute: false, steps: Array.from({ length: 16 }, (_, i) => step([0, 9].includes(i), .7)) },
      ],
      modulators: [
        { shape: 'sine', rate: .09, depth: .16, target: 'n3.time' },
        { shape: 'triangle', rate: .045, depth: .22, target: 'n1.pan' },
      ],
      performance: { xTarget: 'circulation', yTarget: 'n0.tone', x: .70, y: .60 },
      samples: [null, null, null, null],
    };
  }

  function normalizeSample(asset) {
    if (!asset || typeof asset !== 'object' || typeof asset.pcm !== 'string') return null;
    const sampleRate = integer(asset.sampleRate, 8000, 96000, 48000);
    if (asset.pcm.length > Math.ceil(sampleRate * 10 * 4 / 3) * 4 + 32 || asset.pcm.length < 8 || !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.pcm)) return null;
    const bytes = Math.floor(asset.pcm.length * .75) - (asset.pcm.endsWith('==') ? 2 : asset.pcm.endsWith('=') ? 1 : 0);
    if (bytes % 4 || bytes / 4 > sampleRate * 10 + 2 || bytes < 4) return null;
    return { name: text(asset.name, 'Imported sound', 100), sampleRate, pcm: asset.pcm, duration: bytes / 4 / sampleRate };
  }

  function normalizePlain(input) {
    const defaults = defaultState();
    const raw = input && typeof input === 'object' ? input : {};
    const master = raw.master || {}, garden = raw.garden || {};
    const state = {
      version: VERSION, name: text(raw.name, defaults.name, 100),
      tempo: number(raw.tempo, 40, 200, defaults.tempo), swing: number(raw.swing, 0, .45, defaults.swing),
      master: Object.fromEntries(['volume', 'mix', 'drive', 'width'].map(k => [k, number(master[k], 0, 1, defaults.master[k])])),
      garden: { circulation: number(garden.circulation, 0, 1, defaults.garden.circulation), damping: number(garden.damping, 0, 1, defaults.garden.damping), freeze: garden.freeze === true },
      nodes: [], sources: [], routing: [], modulators: [], samples: [],
      performance: {
        xTarget: choice(raw.performance?.xTarget, LFO_TARGETS.map(t => t.id), defaults.performance.xTarget),
        yTarget: choice(raw.performance?.yTarget, LFO_TARGETS.map(t => t.id), defaults.performance.yTarget),
        x: number(raw.performance?.x, 0, 1, defaults.performance.x),
        y: number(raw.performance?.y, 0, 1, defaults.performance.y),
      },
    };
    for (let i = 0; i < 4; i++) {
      const n = raw.nodes?.[i] || {}, d = defaults.nodes[i];
      state.nodes.push({
        name: text(n.name, d.name, 40), model: choice(n.model, NODE_MODELS.map(m => m.id), d.model),
        time: number(n.time, 20, 1500, d.time), sync: typeof n.sync === 'boolean' ? n.sync : d.sync,
        division: choice(n.division, DIVISIONS, d.division), pitch: integer(n.pitch, 24, 96, d.pitch),
        tone: number(n.tone, 120, 18000, d.tone), decay: number(n.decay, .05, .98, d.decay), resonance: number(n.resonance, 0, 1, d.resonance),
        drift: number(n.drift, 0, 1, d.drift), pan: number(n.pan, -1, 1, d.pan), level: number(n.level, 0, 1.25, d.level), mute: n.mute === true,
      });
      const s = raw.sources?.[i] || {}, ds = defaults.sources[i];
      state.sources.push({
        name: text(s.name, ds.name, 40), kind: choice(s.kind, SOURCE_KINDS.map(k => k.id), ds.kind),
        pitch: integer(s.pitch, 24, 96, ds.pitch), decay: number(s.decay, 15, 10000, ds.decay), tone: number(s.tone, 120, 18000, ds.tone),
        texture: number(s.texture, 0, 1, ds.texture), level: number(s.level, 0, 1, ds.level), destination: integer(s.destination, 0, 3, ds.destination), mute: s.mute === true,
        steps: Array.from({ length: 16 }, (_, j) => {
          const st = s.steps?.[j], def = ds.steps[j];
          return { on: typeof st?.on === 'boolean' ? st.on : def.on, velocity: number(st?.velocity, .1, 1, def.velocity), probability: number(st?.probability, 0, 1, 1), ratchet: integer(st?.ratchet, 1, 4, 1) };
        }),
      });
      state.routing.push(Array.from({ length: 4 }, (_, j) => number(raw.routing?.[i]?.[j], 0, 1, defaults.routing[i][j])));
      state.samples.push(normalizeSample(raw.samples?.[i]));
    }
    for (let i = 0; i < 2; i++) {
      const m = raw.modulators?.[i] || {}, d = defaults.modulators[i];
      state.modulators.push({ shape: choice(m.shape, ['sine', 'triangle', 'random'], d.shape), rate: number(m.rate, .02, 8, d.rate), depth: number(m.depth, 0, 1, d.depth), target: choice(m.target, LFO_TARGETS.map(t => t.id), d.target) });
    }
    return state;
  }

  function parseProject(json) {
    if (typeof json !== 'string' || json.length > 32 * 1024 * 1024) throw new Error('Choose a REDUCE project smaller than 32 MB.');
    let project;
    try { project = JSON.parse(json); } catch { throw new Error('This file is not valid JSON.'); }
    if (!project || project.format !== 'mire-project' || project.formatVersion !== 1 || !project.state) throw new Error('Choose a REDUCE project file (.mire.json).');
    const s = project.state;
    if (!Array.isArray(s.nodes) || s.nodes.length !== 4 || !Array.isArray(s.sources) || s.sources.length !== 4 || !Array.isArray(s.routing) || s.routing.length !== 4 || !Array.isArray(s.modulators) || s.modulators.length !== 2) throw new Error('This REDUCE project is incomplete.');
    if (s.sources.some(source => !Array.isArray(source?.steps) || source.steps.length !== 16) || s.routing.some(row => !Array.isArray(row) || row.length !== 4)) throw new Error('The project needs four complete 16-step lanes and a 4 × 4 routing matrix.');
    const state = normalize(s);
    if (Array.isArray(s.samples)) {
      for (let i = 0; i < 4; i++) {
        if (s.samples[i] != null && !state.samples[i]) throw new Error(`Sample ${i + 1} is invalid or longer than ten seconds.`);
        const asset = state.samples[i];
        if (!asset) continue;
        let binary;
        try { binary = atob(asset.pcm); } catch { throw new Error(`Sample ${i + 1} is not valid audio data.`); }
        const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
        const floats = new Float32Array(bytes.buffer);
        for (const value of floats) if (!Number.isFinite(value) || Math.abs(value) > 8) throw new Error(`Sample ${i + 1} contains invalid audio values.`);
      }
    }
    return state;
  }

  function serializeProject(state) {
    return JSON.stringify({ format: 'mire-project', formatVersion: 1, appVersion: VERSION, state: normalize(state) });
  }
  function noteName(midi) {
    const n = Math.round(midi);
    return ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][(n % 12 + 12) % 12] + (Math.floor(n / 12) - 1);
  }

  // Exact imported notes travel with the native patch, without flattening chords or timing.
  function normalize(raw) {
    const state = normalizePlain(raw);
    if (raw && raw.musicLabPattern !== undefined) {
      const overlay = raw.musicLabPattern, schema = window.MusicLabPatternSchema;
      if (!schema) throw new Error('The portable note-pattern validator is unavailable.');
      if (!overlay || Object.prototype.toString.call(overlay) !== '[object Object]' || !overlay.voiceMap || Object.prototype.toString.call(overlay.voiceMap) !== '[object Object]') throw new Error('The imported note pattern is incomplete.');
      const pattern = schema.parse(overlay.pattern), targets = new Set(Array.from({length:4},(_,i)=>String(i))), voiceMap = {};
      for (const voice of pattern.voices) {
        const target = overlay.voiceMap[voice.id];
        if (!Object.prototype.hasOwnProperty.call(overlay.voiceMap, voice.id) || typeof target !== 'string' || !targets.has(target)) throw new Error('The imported pattern refers to an unavailable instrument voice.');
        voiceMap[voice.id] = target;
      }
      if (Object.keys(overlay.voiceMap).some(id => !pattern.voices.some(voice => voice.id === id))) throw new Error('The imported voice map contains an unknown source voice.');
      state.musicLabPattern = { pattern, voiceMap };
    }
    return state;
  }
  window.MireSchema = { VERSION, NODE_MODELS, SOURCE_KINDS, DIVISIONS, LFO_TARGETS, defaultState, normalize, parseProject, serializeProject, noteName, copy };
})();
