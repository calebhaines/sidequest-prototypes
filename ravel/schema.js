(() => {
  'use strict';
  const VERSION = '1.0.0';
  const RECIPES = ['kit', 'foley', 'keys', 'bells', 'reed', 'bass', 'noise', 'percussion'];
  const names = ['The pocket orchestra', 'A cupboard of accidents', 'Keys without doors', 'The bell committee', 'A reed in a hurry', 'Low and behold', 'Weather in envelopes', 'Sixteen small objections'];
  const clamp = (v, lo, hi, d) => Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d;
  const text = (v, d, max = 80) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : d;
  const step = i => ({ on: i % 4 === 0, slice: i, velocity: .85, probability: 1, ratchet: 1, reverse: false, pitch: 0, micro: 0, gate: 1 });
  const pattern = (i = 0) => ({ name: String.fromCharCode(65 + i), steps: Array.from({ length: 16 }, (_, n) => step(n)) });
  const defaultState = () => ({ version: VERSION, name: 'The beat has come apart politely.', tempo: 104, swing: .12, selectedPattern: 0, chain: false, seed: 87123, asset: { kind: 'seed', name: names[0], recipe: 'kit', seed: 81719, tempo: 104 }, boundaries: Array.from({ length: 17 }, (_, i) => i / 16), sample: { pitch: 0, reverse: false, fade: 4, trimStart: 0, trimEnd: 1, level: .9 }, master: { volume: .72, tone: 14500, highpass: 25, crush: 0, drive: .12, echo: .16, feedback: .35, space: .15, pan: 0 }, patterns: Array.from({ length: 4 }, (_, i) => pattern(i)) });
  function normalizeAsset(a) {
    if (!a || typeof a !== 'object') return defaultState().asset;
    if (a.kind === 'seed') return { kind: 'seed', name: text(a.name, names[0]), recipe: RECIPES.includes(a.recipe) ? a.recipe : 'kit', seed: Math.round(clamp(a.seed, 1, 4294967295, 81719)), tempo: clamp(a.tempo, 48, 180, 104) };
    if (a.kind !== 'pcm') throw new Error('This sample format is not supported.');
    const sampleRate = Math.round(clamp(a.sampleRate, 8000, 48000, 48000));
    const channels = a.channels === 1 ? 1 : 2;
    if (typeof a.pcm !== 'string' || a.pcm.length > 5120000 || a.pcm.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(a.pcm)) throw new Error('The sample data is incomplete.');
    const bytes = a.pcm.length * 3 / 4 - (a.pcm.endsWith('==') ? 2 : a.pcm.endsWith('=') ? 1 : 0);
    if (bytes < channels * 2 || bytes % (channels * 2)) throw new Error('The sample data has an invalid length.');
    const frames = bytes / (channels * 2);
    if (frames > sampleRate * 20 || a.frames !== frames || typeof a.duration !== 'number' || !Number.isFinite(a.duration) || Math.abs(a.duration - frames / sampleRate) > 1 / sampleRate || a.sampleRate !== sampleRate || a.channels !== channels) throw new Error('The sample metadata does not match its audio.');
    return { kind: 'pcm', name: text(a.name, 'Imported ribbon'), sampleRate, channels, frames, duration: frames / sampleRate, pcm: a.pcm };
  }
  function normalize(raw) {
    const d = defaultState(); raw = raw && typeof raw === 'object' ? raw : {};
    const s = { ...d, name: text(raw.name, d.name), tempo: clamp(raw.tempo, 40, 180, d.tempo), swing: clamp(raw.swing, 0, .65, d.swing), selectedPattern: Math.round(clamp(raw.selectedPattern, 0, 3, 0)), chain: !!raw.chain, seed: Math.round(clamp(raw.seed, 1, 4294967295, d.seed)), asset: normalizeAsset(raw.asset || d.asset) };
    const a = raw.sample || {}, m = raw.master || {};
    s.sample = { pitch: clamp(a.pitch, -24, 24, 0), reverse: !!a.reverse, fade: clamp(a.fade, 0, 80, 4), trimStart: clamp(a.trimStart, 0, .995, 0), trimEnd: clamp(a.trimEnd, .005, 1, 1), level: clamp(a.level, 0, 1.5, .9) };
    s.sample.trimEnd = Math.max(s.sample.trimStart + .005, s.sample.trimEnd);
    s.master = { volume: clamp(m.volume, 0, 1, .72), tone: clamp(m.tone, 200, 18000, 14500), highpass: clamp(m.highpass, 20, 3000, 25), crush: clamp(m.crush, 0, 1, 0), drive: clamp(m.drive, 0, 1, .12), echo: clamp(m.echo, 0, 1, .16), feedback: clamp(m.feedback, 0, .8, .35), space: clamp(m.space, 0, 1, .15), pan: clamp(m.pan, -1, 1, 0) };
    s.boundaries = Array.from({ length: 17 }, (_, i) => i === 0 ? 0 : i === 16 ? 1 : clamp(raw.boundaries?.[i], 0, 1, i / 16));
    for (let i = 1; i < 16; i++) s.boundaries[i] = Math.max(s.boundaries[i - 1] + .0002, Math.min(1 - (16 - i) * .0002, s.boundaries[i]));
    s.patterns = Array.from({ length: 4 }, (_, p) => ({ name: text(raw.patterns?.[p]?.name, String.fromCharCode(65 + p), 24), steps: Array.from({ length: 16 }, (_, i) => {
      const x = raw.patterns?.[p]?.steps?.[i] || step(i);
      return { on: !!x.on, slice: Math.round(clamp(x.slice, 0, 15, i)), velocity: clamp(x.velocity, 0, 1, .85), probability: clamp(x.probability, 0, 1, 1), ratchet: Math.round(clamp(x.ratchet, 1, 4, 1)), reverse: !!x.reverse, pitch: clamp(x.pitch, -12, 12, 0), micro: clamp(x.micro, -.45, .45, 0), gate: clamp(x.gate, .05, 2, 1) };
    }) }));
    if (raw.musicLabPattern !== undefined) {
      const overlay = raw.musicLabPattern;
      if (!overlay || typeof overlay !== 'object' || !overlay.voiceMap || typeof overlay.voiceMap !== 'object' || Array.isArray(overlay.voiceMap) || !window.MusicLabPatternSchema) throw new Error('Invalid shared pattern.');
      const pattern = window.MusicLabPatternSchema.normalize(overlay.pattern), voiceMap = {};
      for (const voice of pattern.voices) {
        const destination = overlay.voiceMap[voice.id];
        if (typeof destination !== 'string' || !/^slice-(?:[0-9]|1[0-5])$/.test(destination)) throw new Error('Invalid shared voice mapping.');
        voiceMap[voice.id] = destination;
      }
      s.musicLabPattern = { pattern, voiceMap };
    }
    return s;
  }
  function parseProject(data) {
    if (typeof data !== 'string' || data.length > 16 * 1024 * 1024) throw new Error('Projects must be smaller than 16 MB.');
    const p = JSON.parse(data);
    if (p.format !== 'ravel-project' || p.formatVersion !== 1 || !p.state || !Array.isArray(p.state.patterns) || p.state.patterns.length !== 4 || p.state.patterns.some(x => !Array.isArray(x.steps) || x.steps.length !== 16) || !Array.isArray(p.state.boundaries) || p.state.boundaries.length !== 17 || !p.state.asset) throw new Error('Choose a complete RAVEL project.');
    const s = p.state, num = (x, label) => { if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error('Invalid ' + label + ' in this project.'); }, bool = (x, label) => { if (typeof x !== 'boolean') throw new Error('Invalid ' + label + ' in this project.'); };
    if (typeof s.name !== 'string' || !s.sample || !s.master) throw new Error('The project is incomplete.');
    ['tempo','swing','selectedPattern','seed'].forEach(k => num(s[k], k)); bool(s.chain,'chain');
    ['pitch','fade','trimStart','trimEnd','level'].forEach(k => num(s.sample[k], k)); bool(s.sample.reverse,'sample direction');
    ['volume','tone','highpass','crush','drive','echo','feedback','space','pan'].forEach(k => num(s.master[k], k));
    s.boundaries.forEach(x => num(x,'slice boundary'));
    for (let i = 0; i < 17; i++) if (s.boundaries[i] < 0 || s.boundaries[i] > 1 || i > 0 && s.boundaries[i] <= s.boundaries[i-1]) throw new Error('Slice boundaries must be ordered.');
    if (s.boundaries[0] !== 0 || s.boundaries[16] !== 1) throw new Error('The sample boundaries are incomplete.');
    s.patterns.forEach(pat => { if (typeof pat.name !== 'string') throw new Error('The pattern name is missing.'); pat.steps.forEach(x => { if (!x || typeof x !== 'object') throw new Error('A sequencer step is incomplete.'); ['slice','velocity','probability','ratchet','pitch','micro','gate'].forEach(k => num(x[k],k)); bool(x.on,'step state'); bool(x.reverse,'step direction'); }); });
    if (s.asset.kind === 'seed') { if (!RECIPES.includes(s.asset.recipe) || typeof s.asset.name !== 'string') throw new Error('The sample recipe is invalid.'); num(s.asset.seed,'sample seed'); num(s.asset.tempo,'sample tempo'); }
    else if (s.asset.kind !== 'pcm') throw new Error('The sample format is invalid.');
    return normalize(s);
  }
  window.RavelSchema = { VERSION, RECIPES: RECIPES.map((id, i) => ({ id, name: names[i] })), defaultState, normalize, normalizeAsset, parseProject, serializeProject: s => JSON.stringify({ format: 'ravel-project', formatVersion: 1, state: normalize(s) }), duration: a => a.kind === 'pcm' ? a.duration : 16 * 60 / a.tempo, copy: x => JSON.parse(JSON.stringify(x)) };
})();
