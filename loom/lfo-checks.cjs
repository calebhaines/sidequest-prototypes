'use strict';
// Four shared LFOs: real project parsing, signal routing and serialized factories.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
globalThis.window = globalThis; globalThis.crypto ||= webcrypto;
globalThis.btoa ||= value => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ||= value => Buffer.from(value, 'base64').toString('binary');
const shared = fs.existsSync(path.join(__dirname, 'shared/pattern-schema.js')) ? path.join(__dirname, 'shared') : path.resolve(__dirname, '../shared');
vm.runInThisContext(fs.readFileSync(path.join(shared, 'pattern-schema.js'), 'utf8'), { filename: 'pattern-schema.js' });
const sources = ['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'preamp-catalog.js', 'tape-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'tape-dsp.js', 'effects.js', 'lfo.js', 'service-schema.js', 'schema.js', 'audio-engine.js'];
for (const file of sources) vm.runInThisContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), { filename: file });
const S = LoomSchema, L = createLoomLFODSP(), E = createLoomEffectsDSP(), { Core } = createLoomEngineDSP(createLoomEffectsDSP, createLoomLFODSP);
const copy = value => JSON.parse(JSON.stringify(value)), owners = state => [...state.tracks, ...state.returns, state.master];
const route = (ownerId, target, amount = .2, extra = {}) => ({ id: (ownerId + '-' + target).replace(/[^a-zA-Z0-9_-]/g, '-'), ownerId, target, enabled: true, amount, ...extra });
let passed = 0;
const check = async (name, run) => { await run(); passed++; console.log('PASS ' + name); };
function blank() {
  const state = S.defaultState(); state.tempo = 120; state.lengthBars = 2; state.loopEnabled = false; state.loopStart = 0; state.loopEnd = 8; state.recording.punchEnd = 8;
  for (const owner of owners(state)) { owner.effects.fill(null); owner.automation = []; owner.level = .7; if ('pan' in owner) owner.pan = 0; }
  for (const track of state.tracks) { track.instrumentLive = true; track.clips = []; }
  return state;
}
function signal(frames, rate) {
  return [0, 1].map(channel => Float32Array.from({ length: frames }, (_, i) => .08 * Math.sin(2 * Math.PI * (channel ? 137 : 79) * i / rate) + .025 * Math.sin(2 * Math.PI * (channel ? 1831 : 701) * i / rate)));
}
function feed(core, source, frames, block = 128, offset = 0) {
  const left = new Float32Array(frames), right = new Float32Array(frames);
  for (let at = 0; at < frames; at += block) { const n = Math.min(block, frames - at); core.processBlock(left.subarray(at, at + n), right.subarray(at, at + n), source ? [[source[0].subarray(offset + at, offset + at + n), source[1].subarray(offset + at, offset + at + n)]] : []); }
  return { left, right };
}
function render(state, frames = 16000, block = 128, rate = 8000, options = {}) { const core = new Core(state, {}, rate, { linear: true, ...options }); core.start(0); return { ...feed(core, signal(frames, rate), frames, block), core }; }
function distance(a, b, from = 0) { let maximum = 0; for (let i = from; i < a.length; i++) { assert(Number.isFinite(a[i]) && Number.isFinite(b[i])); maximum = Math.max(maximum, Math.abs(a[i] - b[i])); } return maximum; }
function lane(target, a, b, extra = {}) { return { target, enabled: true, interpolation: 'linear', points: [{ beat: 0, value: a }, { beat: 8, value: b }], ...extra }; }
function moving() {
  const state = blank(); state.tracks[0].effects[0] = S.effect({ type: 'prism', params: { filter: 'lowpass', cutoff: 1300, resonance: .6, mix: .9 } });
  state.tracks[0].sends = [.3, .2]; state.returns[0].effects[0] = S.effect({ type: 'prism', params: { filter: 'lowpass', cutoff: 2200, mix: 1 } });
  state.master.effects[0] = S.effect({ type: 'cinder', params: { drive: 3, mix: .3 } });
  Object.assign(state.lfos[0], { enabled: true, rate: 1.3, sync: false, depth: .8, smoothing: 12, routes: [route('track-1', 'pan', .35), route('track-1', 'fx:0:cutoff', .2, { effectType: 'prism' }), route('return-1', 'level', .14), route('master', 'fx:0:drive', .1, { effectType: 'cinder' }), route('lfo-2', 'rate', .2)] });
  Object.assign(state.lfos[1], { enabled: true, wave: 'triangle', sync: false, rate: 2.2, depth: .4, routes: [route('track-1', 'send:0', .2), route('track-1', 'eq:highMid', .17), route('lfo-1', 'depth', .25)] });
  Object.assign(state.lfos[2], { enabled: true, wave: 'random', sync: true, division: .5, depth: .3, routes: [route('master', 'level', .1), route('return-2', 'pan', .2)] });
  Object.assign(state.lfos[3], { enabled: true, wave: 'hold', sync: false, rate: 3.1, depth: .2, routes: [route('lfo-4', 'phase', .1), route('track-1', 'level', .12)] });
  state.tracks[0].automation = [lane('level', .45, .85), lane('fx:0:cutoff', 700, 2100, { effectType: 'prism' })];
  state.returns[0].automation = [lane('level', .3, .8)]; state.master.automation = [lane('level', .4, .8)]; return state;
}
(async () => {
  await check('Four neutral global LFOs migrate old projects and round-trip complete modulation graphs', () => {
    const defaults = S.defaultState(); assert.equal(defaults.lfos.length, 4); assert.deepEqual(defaults.lfos.map(item => item.id), ['lfo-1', 'lfo-2', 'lfo-3', 'lfo-4']);
    assert(defaults.lfos.every(item => item.enabled === false && item.routes.length === 0));
    const old = blank(); delete old.lfos; const restored = S.parseProject(JSON.stringify({ format: 'loom-project', formatVersion: 1, appVersion: '1.22.0', state: old }));
    assert.deepEqual(restored.lfos, defaults.lfos); delete restored.lfos; assert.deepEqual(restored, old);
    const state = moving(), before = JSON.stringify(state), saved = S.serializeProject(state), loaded = S.parseProject(saved);
    assert.deepEqual(loaded.lfos, state.lfos); assert.equal(JSON.stringify(state), before); assert.deepEqual(S.parseProject(S.serializeProject(loaded)), loaded);
    assert(saved.length < 100000, 'Modulation remains small portable project data.');
  });
  await check('The destination catalog includes every existing numeric owner control and all four LFO parameter sets', () => {
    const state = moving(), definitions = S.lfoTargets(state), ids = new Set();
    for (const d of definitions) { assert(d.ownerId && d.target && Number.isFinite(d.min) && Number.isFinite(d.max) && d.max > d.min); assert(!ids.has(d.ownerId + ':' + d.target)); ids.add(d.ownerId + ':' + d.target); }
    for (const owner of owners(state)) for (const d of S.automationTargets(owner)) assert(ids.has(owner.id + ':' + d.target), owner.id + ':' + d.target);
    for (let i = 1; i <= 4; i++) for (const key of ['rate', 'division', 'depth', 'offset', 'phase', 'symmetry', 'smoothing']) assert(ids.has('lfo-' + i + ':' + key), 'Cross/self destination lfo-' + i + ':' + key);
    assert(!ids.has('master:pan') && !ids.has('return-1:eq:low'), 'Only controls owned by each destination appear.');
    for (const effect of LoomEffectsCatalog) {
      const value = blank(); value.tracks[0].effects[3] = S.effect({ type: effect.id, params: effect.defaults }); const native = new Map(L.targets(value, null, E.specifications).map(d => [d.key, d]));
      for (const d of S.automationTargets(value.tracks[0])) { const actual = native.get('track-1|' + d.target); assert(actual, effect.id + ' serialized DSP target ' + d.target); assert.equal(actual.min, d.min, effect.id + ' minimum ' + d.target); assert.equal(actual.max, d.max, effect.id + ' maximum ' + d.target); }
    }
  });
  await check('Strict loading rejects malformed LFOs and routes while recovery normalizes them safely', () => {
    const state = moving(), envelope = value => JSON.stringify({ format: 'loom-project', formatVersion: 1, appVersion: S.VERSION, state: value });
    const badCases = [value => value.lfos.pop(), value => value.lfos[0].enabled = 'true', value => value.lfos[0].wave = 'noise-from-nowhere', value => value.lfos[0].rate = null, value => value.lfos[0].depth = 2, value => value.lfos[0].phase = -1, value => value.lfos[0].retrigger = 'sometimes', value => value.lfos[0].routes[0].amount = 2, value => value.lfos[0].routes[0].ownerId = '__proto__', value => value.lfos[0].routes[0].target = 'mute', value => value.lfos[0].routes[1].effectType = 'cinder', value => value.lfos[0].routes.push(copy(value.lfos[0].routes[0]))];
    for (const bad of badCases) { const invalid = copy(state); bad(invalid); const before = JSON.stringify(invalid); assert.throws(() => S.parseProject(envelope(invalid)), /lfo|modulat|route|invalid/i); assert.equal(JSON.stringify(invalid), before); }
    const broken = copy(state); broken.lfos[0].routes[0].ownerId = 'track-99'; broken.lfos[1].rate = Infinity; const safe = S.normalize(broken);
    assert.equal(safe.lfos.length, 4); assert(safe.lfos[0].routes.every(item => item.ownerId !== 'track-99')); assert(Number.isFinite(safe.lfos[1].rate));
  });
  await check('All disabled, disconnected and zero-amount modulation preserves exact released audio', () => {
    const state = blank(), baseline = render(state), absent = copy(state); delete absent.lfos;
    assert.deepEqual(render(absent).left, baseline.left); assert.deepEqual(render(absent).right, baseline.right);
    for (const mode of ['disabled', 'disconnected', 'zero']) { const value = copy(state); Object.assign(value.lfos[0], { enabled: mode !== 'disabled', routes: mode === 'disconnected' ? [] : [route('track-1', 'pan', mode === 'zero' ? 0 : .7)] }); const output = render(value); assert.deepEqual(output.left, baseline.left, mode); assert.deepEqual(output.right, baseline.right, mode); }
  });
  await check('Signed multiple routes add to manual values and existing drawn automation without mutating the session', () => {
    const state = blank(); state.tracks[0].level = .3; state.master.level = .4;
    Object.assign(state.lfos[0], { enabled: true, depth: 0, offset: 1, smoothing: 0, routes: [route('track-1', 'level', .2), route('track-1', 'pan', -.1), route('master', 'level', .1)] });
    const manual = copy(state); manual.lfos = S.defaultLFOs(); manual.tracks[0].level += .2 * 1.5; manual.tracks[0].pan -= .1 * 2; manual.master.level += .1 * 1.5;
    const before = JSON.stringify(state), output = render(state), reference = render(manual); assert(distance(output.left, reference.left, 2000) < 1e-6, 'constant signed routes distance ' + distance(output.left, reference.left, 2000) + ' meters ' + JSON.stringify(output.core.getMeters().lfos)); assert(distance(output.right, reference.right, 2000) < 1e-6); assert.equal(JSON.stringify(state), before);
    const automated = copy(state); automated.tracks[0].automation = [lane('level', .25, .6)]; const equivalent = copy(manual); equivalent.tracks[0].automation = [lane('level', .25 + .3, .6 + .3)];
    const a = render(automated), b = render(equivalent); assert(distance(a.left, b.left, 2000) < 1e-6, 'The same LFO offset follows the drawn volume curve.');
  });
  await check('Tracks, sends, EQ, returns, master and cross/self cycles use one deterministic clock across arbitrary blocks', () => {
    const state = moving(), before = JSON.stringify(state);
    for (const rate of [8000, 44100, 48000]) { const frames = Math.round(rate * .45), a = render(state, frames, 128, rate), b = render(state, frames, 137, rate), c = render(state, frames, 251, rate); assert.deepEqual(a.left, b.left, rate + ' 137-frame partition'); assert.deepEqual(a.right, c.right, rate + ' 251-frame partition'); assert(a.left.some(value => Math.abs(value) > .001)); }
    const noLFO = copy(state); noLFO.lfos.forEach(item => item.enabled = false); const noAutomation = copy(state); for (const owner of owners(noAutomation)) owner.automation = [];
    const output = render(state), dry = render(noLFO), unautomated = render(noAutomation); assert(distance(output.left, dry.left) > .001); assert(distance(output.left, unautomated.left) > .001); assert.equal(JSON.stringify(state), before);
  });
  await check('Unrelated edits between control ticks preserve LFO phase, effect modulation and ongoing EQ histories', () => {
    const state = moving(), source = signal(9000, 8000), a = new Core(state, {}, 8000, { linear: true }), b = new Core(copy(state), {}, 8000, { linear: true }); a.start(0); b.start(0);
    const boundary = 4113; assert.deepEqual(feed(a, source, boundary), feed(b, source, boundary)); const edited = copy(state); edited.tracks[7].name = 'No phase reset'; b.setState(edited);
    const first = feed(a, source, source[0].length - boundary, 137, boundary), second = feed(b, source, source[0].length - boundary, 251, boundary); assert.deepEqual(first.left, second.left); assert.deepEqual(first.right, second.right);
  });
  await check('Removing or changing an insert cannot redirect its typed routes onto a different effect', () => {
    const state = moving(), replaced = copy(state); replaced.tracks[0].effects[0] = S.effect({ type: 'cinder', params: { drive: 5 } });
    const safe = S.normalize(replaced); assert(!safe.lfos[0].routes.some(item => item.ownerId === 'track-1' && item.target.startsWith('fx:0:')));
    const removed = copy(state); removed.tracks[0].effects[0] = null; assert(!S.normalize(removed).lfos[0].routes.some(item => item.ownerId === 'track-1' && item.target.startsWith('fx:0:')));
    assert(render(replaced, 4096).left.every(Number.isFinite));
  });
  await check('Removing a sounding route fades its contribution smoothly while retaining the other oscillator phases', () => {
    const state = blank(); Object.assign(state.lfos[0], { enabled: true, depth: 0, offset: 1, smoothing: 0, routes: [route('track-1', 'level', .2)] });
    Object.assign(state.lfos[1], { enabled: true, rate: 1.7, sync: false }); const source = signal(10000, 8000), boundary = 4113;
    const a = new Core(state, {}, 8000, { linear: true }), b = new Core(copy(state), {}, 8000, { linear: true }); a.start(0); b.start(0); feed(a, source, boundary); feed(b, source, boundary);
    const old = a.modulation.getMeters().values['track-1|level'], phase = a.modulation.phase[1], next = copy(state); next.lfos[0].routes = [];
    a.setState(next); b.setState(copy(next)); assert.equal(a.modulation.phase[1], phase, 'Removing one destination does not reset another generator.');
    assert(old > state.tracks[0].level + .2); assert.equal(a.modulation.getMeters().values['track-1|level'], old, 'The sounding target does not jump at the edit.'); const first = feed(a, source, 5887, 137, boundary), second = feed(b, source, 5887, 251, boundary); assert.deepEqual(first.left, second.left); assert.deepEqual(first.right, second.right);
    const settled = a.modulation.getMeters().values['track-1|level']; assert(Math.abs(settled - state.tracks[0].level) < 1e-8, 'Retired contribution settles to the manual value.');
    const manual = copy(next); manual.lfos[0].enabled = false; const reference = render(manual, 10000); assert(distance(first.left.subarray(3000), reference.left.subarray(boundary + 3000)) < 1e-7, 'Audio returns to the undriven manual gain after the transition.');
  });
  await check('All seven waveform families and long-run self feedback stay finite and bounded', () => {
    for (const wave of ['sine', 'triangle', 'saw', 'ramp', 'square', 'hold', 'random']) { const state = blank(); Object.assign(state.lfos[0], { enabled: true, wave, sync: false, rate: 19, depth: 1, offset: 1, smoothing: 0, routes: [route('track-1', 'pan', 1), route('lfo-1', 'rate', 1), route('lfo-1', 'phase', -1)] }); const out = render(state, 12000); for (const channel of [out.left, out.right]) for (const value of channel) assert(Number.isFinite(value) && Math.abs(value) <= 1, wave); }
  });
  await check('Tempo sync follows beat divisions while free-rate motion retains its frequency', () => {
    const make = (sync, tempo) => { const state = blank(); state.tempo = tempo; Object.assign(state.lfos[0], { enabled: true, sync, rate: 1, division: 2, phase: .25, smoothing: 0, routes: [route('track-1', 'pan', .4)] }); return state; };
    const fast = render(make(true, 120)), slow = render(make(true, 60)), freeFast = render(make(false, 120)), freeSlow = render(make(false, 60)); assert(distance(fast.left, slow.left, 1000) > .001); assert.deepEqual(freeFast.left, freeSlow.left); assert.deepEqual(freeFast.right, freeSlow.right);
  });
  await check('The full sync range honors slow 32-bar cycles and fast 1/64-note cycles without free-rate clipping', () => {
    for (const [tempo, division] of [[40, 128], [240, .0625], [120, 3], [137, 1 / 3]]) {
      const state = blank(); state.tempo = tempo; Object.assign(state.lfos[0], { enabled: true, sync: true, division, smoothing: 0, routes: [route('track-1', 'pan', .1)] });
      const runtime = new L.Runtime(8000, state, S.lfoTargets(state)); runtime.render(new Float64Array([0]), new Uint8Array([1]), new Uint8Array([0]), 0, tempo);
      assert(Math.abs(runtime.effective[0].frequency - tempo / (60 * division)) < 1e-12, tempo + ' BPM / ' + division + ' beats');
    }
  });
  await check('Pause and count-in freeze oscillator phase; seek and seeded random replay are reproducible', () => {
    const state = blank(); Object.assign(state.lfos[0], { enabled: true, wave: 'hold', sync: false, rate: 3, smoothing: 0, routes: [route('track-1', 'pan', .3)] });
    const runtime = new L.Runtime(8000, state, S.lfoTargets(state)), length = 513, beats = Float64Array.from({ length }, (_, i) => 1 + i / 4000), playing = new Uint8Array(length).fill(1), countIn = new Uint8Array(length);
    runtime.reset(1, 120); runtime.render(beats, playing, countIn, 0, 120); const moved = runtime.phase[0]; assert(Math.abs(moved - (1.5 + length * 3 / 8000)) < 1e-10);
    runtime.render(new Float64Array(length).fill(beats.at(-1)), new Uint8Array(length), countIn, length, 120); assert.equal(runtime.phase[0], moved, 'Paused transport holds phase.');
    runtime.render(new Float64Array(length).fill(beats.at(-1)), playing, new Uint8Array(length).fill(1), length * 2, 120); assert.equal(runtime.phase[0], moved, 'Count-in holds phase.');
    runtime.reset(1, 120); runtime.render(beats, playing, countIn, 0, 120); const repeated = new L.Runtime(8000, state, S.lfoTargets(state)); repeated.reset(1, 120); repeated.render(beats, playing, countIn, 0, 120); assert.deepEqual(runtime.getMeters(), repeated.getMeters());
    const source = signal(10000, 8000), first = new Core(state, {}, 8000), fresh = new Core(copy(state), {}, 8000); first.start(0); feed(first, source, 3001); first.seek(1); fresh.start(1);
    const a = feed(first, source, 6000), b = feed(fresh, source, 6000); assert(distance(a.left, b.left, 2000) < 1e-7, 'Seeking resets LFO phase together with the audio transport.');
  });
  await check('The complete LFO factory runs in an isolated serialized audio realm without browser globals', () => {
    const sandbox = { Math, Number, Object, Array, String, Boolean, Map, Set, Float32Array, Float64Array, Int32Array, Uint8Array, Uint32Array, JSON };
    const makeEngine = vm.runInNewContext('(' + createLoomEngineDSP.toString() + ')', sandbox), makeLFO = vm.runInNewContext('(' + createLoomLFODSP.toString() + ')', sandbox);
    const state = moving(), isolated = new (makeEngine(createLoomEffectsDSP, makeLFO).Core)(copy(state), {}, 8000, { linear: true }); isolated.start(0); const expected = render(state, 8192), actual = feed(isolated, signal(8192, 8000), 8192, 137);
    assert.deepEqual(actual.left, expected.left); assert.deepEqual(actual.right, expected.right);
  });
  await check('Real WAV master and stem exports include the saved modulation and match odd-block Core PCM', async () => {
    const state = moving(), source = signal(8000, 8000), asset = S.encodeAsset({ id: 'lfo-audio', name: 'LFO fixture', sampleRate: 8000, left: source[0], right: source[1] }); state.assets = [asset]; state.tracks[0].instrumentLive = false;
    state.tracks[0].clips = [{ id: 'lfo-clip', name: 'LFO fixture', type: 'audio', assetId: asset.id, start: 0, length: 2, sourceStart: 0, sourceEnd: 1, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: 1, fadeIn: 0, fadeOut: 0 }];
    const audio = new LoomAudio(state), assets = S.decodeAssets(state.assets);
    for (const options of [{}, { trackId: 'track-1' }, { returnId: 'return-1' }]) { const blob = await audio.renderWav(state, assets, { ...options, snapshotReady: true, startBeat: 0, endBeat: 2, tailSeconds: .05 }), view = new DataView(await blob.arrayBuffer()), core = new Core(state, assets, 48000, { linear: true, ...options }); core.start(0); let max = 0;
      const total = 50400, main = 48000; assert.equal(view.byteLength, 44 + total * 4);
      for (let at = 0; at < total;) { if (at === main) core.stop(); const n = Math.min(137, total - at, at < main ? main - at : total - at), output = feed(core, null, n, n); for (let i = 0; i < n; i++) for (let channel = 0; channel < 2; channel++) { const x = Math.max(-1, Math.min(1, (channel ? output.right : output.left)[i])), expected = Math.round(x * (x < 0 ? 32768 : 32767)); max = Math.max(max, Math.abs(expected - view.getInt16(44 + (at + i) * 4 + channel * 2, true))); } at += n; }
      assert(max <= 1, JSON.stringify(options) + ' WAV differs by ' + max + ' LSB');
    }
  });
  console.log(passed + ' LFO project, graph, clock, routing and export groups passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
