'use strict';
/* Reversible track freeze: production schema, DSP, routing and transaction checks.
 *
 * Run with `node loom/freeze-checks.cjs`. This is a correctness suite, not a CPU
 * benchmark: frozen tracks must remove processors by construction, and call
 * counters verify that the removed work does not silently continue in the DSP.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto, createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const directory = __dirname;
const root = path.resolve(directory, '..');
const BASELINE = 'acb06d42367bc422c2363099a338aed333b28382';
const modules = [
  'shared/pattern-schema.js',
  ...['vocal-catalog','utility-catalog','filter-catalog','creative-catalog','preamp-catalog','tape-catalog','char-catalog','effects-catalog'].map(name => 'loom/' + name + '.js'),
  ...['vocal-dsp','utility-dsp','filter-dsp','creative-dsp','broiler-pedals','compressor-dsp','preamp-dsp','tape-dsp','char-dsp','effects','lfo','track-eq-dsp','cpu-profiler','service-schema','schema','audio-engine','service-capture','note-playback','note-renderer'].map(name => 'loom/' + name + '.js')
];
const count = (counts, key) => counts[key] = (counts[key] || 0) + 1;

function load(ref = 'working', instrument = false) {
  const metrics = {}, scope = { console, performance, Date, crypto: webcrypto, Blob, AbortController, setTimeout, clearTimeout, TextEncoder, TextDecoder, structuredClone };
  scope.window = scope; scope.globalThis = scope;
  scope.atob = text => Buffer.from(text, 'base64').toString('binary');
  scope.btoa = text => Buffer.from(text, 'binary').toString('base64');
  const source = file => {
    if (ref !== 'working') return execFileSync('git', ['show', ref + ':' + file], { cwd: root, maxBuffer: 12 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    const local = path.join(directory, file.startsWith('loom/') ? file.slice(5) : file);
    return fs.readFileSync(fs.existsSync(local) ? local : path.join(root, file), 'utf8');
  };
  for (const file of modules) {
    Function('window', 'globalThis', 'crypto', 'atob', 'btoa', source(file) + '\n//# sourceURL=freeze-checks-' + path.basename(file))(scope, scope, scope.crypto, scope.atob, scope.btoa);
    if (instrument && file === 'loom/effects.js') {
      const factory = scope.createLoomEffectsDSP;
      scope.createLoomEffectsDSP = function (...args) {
        const result = factory(...args), create = result.create;
        result.create = function (type, ...rest) {
          count(metrics, type + '.create'); const processor = create.call(this, type, ...rest);
          if (processor) for (const method of ['process', 'setParams', 'getMeters', 'reset']) if (typeof processor[method] === 'function') {
            const original = processor[method]; processor[method] = function (...values) { count(metrics, type + '.' + method); return original.apply(this, values); };
          }
          return processor;
        };
        return result;
      };
    }
  }
  if (ref === 'working' && fs.existsSync(path.join(directory, 'freeze.js'))) Function('window', 'globalThis', 'crypto', 'atob', 'btoa', fs.readFileSync(path.join(directory, 'freeze.js'), 'utf8'))(scope, scope, scope.crypto, scope.atob, scope.btoa);
  const DSP = scope.createLoomEngineDSP(scope.createLoomEffectsDSP, scope.createLoomLFODSP, scope.createLoomCPUProfiler, scope.createLoomTrackEQDSP);
  return { scope, S: scope.LoomSchema, DSP, metrics, source, resetMetrics() { for (const key of Object.keys(metrics)) delete metrics[key]; } };
}
const digest = channels => { const hash = createHash('sha256'); for (const channel of channels) hash.update(Buffer.from(channel.buffer, channel.byteOffset, channel.byteLength)); return hash.digest('hex'); };
const owners = state => [...state.tracks, ...state.returns, state.master];
const signal = (frames, sampleRate, gain = .045) => [0, 1].map(channel => Float32Array.from({ length: frames }, (_, frame) => gain * (Math.sin(2 * Math.PI * (channel ? 193 : 113) * frame / sampleRate) + .29 * Math.sin(2 * Math.PI * (channel ? 1379 : 827) * frame / sampleRate))));
const lane = (target, from, to, effectType) => ({ target, enabled: true, interpolation: 'linear', points: [{ beat: 0, value: from }, { beat: 4, value: to }], ...(effectType ? { effectType } : {}) });
const route = (ownerId, target, amount, effectType) => ({ id: (ownerId + '-' + target).replace(/[^a-z0-9_-]/gi, '-'), ownerId, target, enabled: true, amount, ...(effectType ? { effectType } : {}) });
function blank(release) {
  const state = release.S.defaultState(); state.tempo = 120; state.lengthBars = 1; state.loopEnabled = false; state.loopStart = 0; state.loopEnd = 4; state.recording.punchEnd = 4;
  for (const owner of owners(state)) { owner.effects.fill(null); owner.automation = []; owner.level = .7; owner.mute = false; if ('pan' in owner) owner.pan = 0; }
  state.tracks.forEach(track => { track.instrumentLive = false; track.clips = []; track.sends = [0, 0]; track.sendPre = [false, false]; });
  state.lfos.forEach(lfo => { lfo.enabled = false; lfo.routes = []; });
  return state;
}
function fixture(release, sampleRate = 8000, options = {}) {
  const { S } = release, state = blank(release), frames = Math.round(sampleRate * 2), channels = signal(frames, sampleRate), asset = S.encodeAsset({ id: 'freeze-source', name: 'Exact source', sampleRate, left: channels[0], right: channels[1] });
  state.assets = [asset];
  state.tracks[0].clips = [{ id: 'freeze-source-clip', name: 'Exact source', type: 'audio', assetId: asset.id, start: 0, length: 4, sourceStart: 0, sourceEnd: 2, sourceOffset: 0, rate: 1, loop: false, reverse: false, gain: .75, fadeIn: 0, fadeOut: 0 }];
  const track = state.tracks[0], fx = (type, params) => S.effect({ type, params });
  track.effects = [fx('strainer', { cutoff: 1800, resonance: .55, mix: .7 }), fx('velvet', { model: 'opto-2a', threshold: -25, colour: .5, mix: .6 }), fx('cinder', { shape: 'fold', drive: 7, output: -9, mix: .25 }), fx('undertow', { mode: 'flanger', rate: .4, delay: 3, depth: 1.5, feedback: .15, mix: .15 }), fx('preserve', { drive: 4, warmth: .4, hiss: 0, wow: 0, flutter: 0, dropouts: 0, mix: .6 })];
  Object.assign(track.eq, { low: 1.8, lowMid: -3.1, lowMidFreq: 650, highMid: 2.1, highMidFreq: 2900, high: -.7 });
  track.level = .62; track.pan = -.21; track.sends = [.24, .19]; track.sendPre = [true, false];
  track.automation = [lane('level', .42, .83), lane('pan', -.6, .45), lane('send:0', .08, .38), lane('send:1', .31, .06), lane('eq:lowMidFreq', 180, 1400), lane('eq:highMidFreq', 1200, 4100), lane('fx:0:cutoff', 350, 2400, 'strainer'), lane('fx:1:threshold', -35, -17, 'velvet'), lane('fx:4:drive', 1, 9, 'preserve')];
  if (options.otherTrack !== false) {
    const other = state.tracks[1]; other.level = .31; other.pan = .25; other.sends = [.17, .13]; other.clips = [{ ...track.clips[0], id: 'unfrozen-source-clip', start: .25, length: 3.75, sourceOffset: .03, gain: .3 }];
    other.effects[0] = fx('prism', { cutoff: 2300, filter: 'lowpass', mix: .8 });
    other.automation = [lane('level', .2, .44), lane('pan', .3, -.2)];
  }
  if (options.buses !== false) {
    state.returns[0].effects[0] = fx('parallax', { time: 83, feedback: .27, mix: 1 }); state.returns[0].automation = [lane('level', .3, .8)];
    state.returns[1].effects[0] = fx('vestige', { size: .3, decay: .5, mix: 1 }); state.returns[1].pan = -.2;
    state.master.effects[0] = fx('saute', { model: 'tube-610', drive: 5, output: -8, mix: .4 }); state.master.automation = [lane('level', .4, .7)];
  }
  if (options.lfos !== false) {
    Object.assign(state.lfos[0], { enabled: true, sync: false, rate: 1.3, depth: .7, routes: [route(track.id, 'pan', .1), route(track.id, 'fx:0:cutoff', .1, 'strainer'), route('lfo-2', 'rate', .05)] });
    Object.assign(state.lfos[1], { enabled: true, sync: true, wave: 'triangle', division: .5, depth: .5, routes: [route(track.id, 'send:0', .05), route(track.id, 'eq:highMidFreq', .04), route('lfo-1', 'depth', .1)] });
    Object.assign(state.lfos[2], { enabled: true, sync: false, wave: 'random', rate: .9, depth: .3, routes: [route('track-2', 'level', .04), route('return-1', 'pan', .08), route('master', 'level', .02)] });
    Object.assign(state.lfos[3], { enabled: true, sync: false, wave: 'hold', rate: 2.1, depth: .2, routes: [route(track.id, 'level', .04), route('lfo-4', 'phase', .03), route('lfo-3', 'smoothing', .01)] });
  }
  const normalized = S.normalize(state);
  return { state: normalized, assets: S.decodeAssets(normalized.assets), frames, sampleRate };
}
function feed(core, frames, block = 137, inputs) {
  const output = [new Float32Array(frames), new Float32Array(frames)];
  for (let at = 0; at < frames; at += block) { const end = Math.min(frames, at + block); core.processBlock(output[0].subarray(at, end), output[1].subarray(at, end), inputs ? inputs.map(channels => channels.map(channel => channel.subarray(at, end))) : []); }
  return output;
}
function render(release, state, assets, sampleRate, frames, options = {}, block = 137, start = 0) {
  const core = new release.DSP.Core(state, assets, sampleRate, { linear: true, ...options }); core.start(start); return { core, output: feed(core, frames, block) };
}
function capture(release, state, assets, sampleRate, frames, block = 137, trackId = 'track-1', tailFrames = 0) {
  const core = new release.DSP.Core(state, assets, sampleRate, { linear: true, freezeCaptureTrackId: trackId });
  const planes = Object.fromEntries(['main', 'sendA', 'sendB'].map(key => [key, [new Float32Array(frames + tailFrames), new Float32Array(frames + tailFrames)]]));
  core.start(0);
  for (const [start, end, playing] of [[0, frames, true], [frames, frames + tailFrames, false]]) {
    if (!playing) core.stop();
    for (let at = start; at < end; at += block) {
      const length = Math.min(block, end - at); core.processBlock(new Float32Array(length), new Float32Array(length));
      assert(core.freezeCapture, 'Production Core must expose freezeCapture planes');
      for (const key of Object.keys(planes)) for (let channel = 0; channel < 2; channel++) {
        assert(core.freezeCapture[key]?.[channel] instanceof Float32Array, 'Missing Float32 capture ' + key + ':' + channel);
        planes[key][channel].set(core.freezeCapture[key][channel].subarray(0, length), at);
      }
    }
  }
  return { core, planes };
}
function packCapture(release, source, planes, sampleRate, bodyFrames, options = {}) {
  const { S } = release, state = S.copy(source), trackId = options.trackId || 'track-1', track = state.tracks.find(item => item.id === trackId), totalFrames = planes.main[0].length, chunks = [], chunkFrames = options.chunkFrames || Math.round(sampleRate * 10);
  state.freezeAssets = [...(state.freezeAssets || [])];
  for (let startFrame = 0; startFrame < totalFrames; startFrame += chunkFrames) {
    const frames = Math.min(chunkFrames, totalFrames - startFrame), chunk = { startFrame, frames, main: null, sendA: null, sendB: null };
    for (const key of ['main', 'sendA', 'sendB']) {
      const left = planes[key][0].slice(startFrame, startFrame + frames), right = planes[key][1].slice(startFrame, startFrame + frames);
      if (!left.some(value => value !== 0) && !right.some(value => value !== 0)) continue;
      const id = trackId + '-' + key + '-' + startFrame, asset = S.encodeFreezeAsset({ id, name: 'Frozen ' + key, sampleRate, left, right });
      state.freezeAssets.push(asset); chunk[key] = id;
    }
    chunks.push(chunk);
  }
  track.freeze = { version: 1, sampleRate, tempo: state.tempo, lengthBeats: state.lengthBars * 4, bodyFrames, totalFrames, tailFrames: totalFrames - bodyFrames, fingerprint: S.freezeFingerprint(state, trackId), chunks };
  return { state, assets: S.decodeAssets(state.assets, state.freezeAssets) };
}
function makeFrozen(release, fixture, options = {}) {
  const { planes, core } = capture(release, fixture.state, fixture.assets, fixture.sampleRate, fixture.frames, options.block || 128, options.trackId || 'track-1', options.tailFrames || 0);
  return { ...packCapture(release, fixture.state, planes, fixture.sampleRate, fixture.frames, options), planes, captureCore: core };
}
function distance(a, b) {
  assert.equal(a.length, b.length); let max = 0, squared = 0;
  for (let frame = 0; frame < a.length; frame++) { assert(Number.isFinite(a[frame]) && Number.isFinite(b[frame]), 'Non-finite PCM at frame ' + frame); const error = a[frame] - b[frame]; max = Math.max(max, Math.abs(error)); squared += error * error; }
  return { max, rms: Math.sqrt(squared / Math.max(1, a.length)) };
}
function near(actual, expected, tolerance = 3e-7, label = 'PCM') {
  return actual.map((channel, index) => { const error = distance(channel, expected[index]); assert(error.max <= tolerance, label + ' channel ' + index + ': ' + JSON.stringify(error)); return error; });
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function controllerFixture(release, options = {}) {
  const { S } = release, initial = fixture(release, 8000, { otherTrack: false, buses: false, lfos: false }).state;
  let state = S.copy(options.state || initial), generation = 0;
  const entered = deferred(), resume = deferred(), calls = { commit: 0, release: 0, prepare: 0, render: 0, snapshot: 0 }, seen = {};
  const checkpoint = async where => { if (options.hold === where) { entered.resolve(); await resume.promise; } };
  const engine = { context: { sampleRate: 8000 }, isRecording: false, init: async () => checkpoint('init'), async renderFreezeTrack(input, assets, settings) {
    calls.render++; seen.renderState = S.copy(input); await checkpoint('render'); if (options.failure) throw Error('Deliberate render failure'); if (settings.signal.aborted) throw new DOMException('Canceled', 'AbortError');
    const frames = Math.round(input.lengthBars * 4 * 60 / input.tempo * settings.sampleRate), channels = signal(frames, settings.sampleRate, .01);
    await settings.onChunk({ startFrame: 0, frames, planes: { main: { left: channels[0], right: channels[1] } } });
    return { sampleRate: settings.sampleRate, bodyFrames: frames, totalFrames: frames, tailFrames: 0 };
  } };
  const hostSnapshot = options.snapshot || { format: 'loom-instrument-state', version: 1, app: 'brine', state: { patch: 7 }, storage: {} }, record = { ready: Promise.resolve() };
  const host = { records: new Map(options.instrument ? [['track-1', record]] : []), async snapshot() { calls.snapshot++; await checkpoint('snapshot'); return S.copy(hostSnapshot); } };
  const renderer = { async prepareNotes(input, assets, settings) { calls.prepare++; seen.prepareState = S.copy(input); seen.prepareSettings = settings; await checkpoint('prepare'); return { state: input, assets }; } };
  const controller = new release.scope.LoomTrackFreeze({ getState: () => state, getAssets: () => S.decodeAssets(state.assets, state.freezeAssets), getGeneration: () => generation, engine, host, noteRenderer: renderer, pause: async () => checkpoint('pause'), commit(next, settings) { calls.commit++; seen.commitSettings = settings; state = next; }, releaseInstrument() { calls.release++; }, onChange(status) { seen.status = status; } });
  return { controller, calls, seen, entered, resume, hostSnapshot, host, record, get state() { return state; }, set state(next) { state = next; }, replace(next) { state = next; generation++; }, edit(change) { const next = S.copy(state); change(next); state = next; } };
}
function nativeFixture(release) {
  const { S, scope } = release, state = blank(release), track = state.tracks[0]; state.tempo = 96;
  track.instrument = { id: 'brine', name: 'BRINE', snapshot: { format: 'loom-instrument-state', version: 1, app: 'brine', state: { patch: 3 } } };
  const packet = scope.MusicLabPatternSchema.normalize({ format: 'musiclab-pattern', version: 1, sourceApp: 'brine', name: 'Unequal gates', kind: 'notes', tempo: 96, swing: .4, lengthBeats: 2, meter: [4, 4], seed: 1347571509, voices: [{ id: 'first', name: 'First', pitch: 60 }, { id: 'second', name: 'Second', pitch: 48 }], notes: [{ id: 'held', voice: 'first', pitch: 60, beat: .25, duration: .9, velocity: .8, probability: 1, lyric: 'sizzle' }, { id: 'never', voice: 'second', pitch: 48, beat: 1, duration: .75, velocity: .5, probability: 0 }, { id: 'chance', voice: 'second', pitch: 55, beat: 1.75, duration: .25, velocity: .9, probability: .5 }] });
  const clip = (id, geometry) => S.noteClip({ id, name: id, type: 'notes', pattern: packet, voiceMap: { first: 'lead', second: 'bass' }, start: 0, length: 4, sourceOffset: 0, rate: 1, loop: false, gain: 1, fadeIn: 0, fadeOut: 0, transpose: 0, ...geometry }, 4);
  track.clips = [clip('fast-loop', { start: .25, length: 2.5, sourceOffset: .5, rate: 2, loop: true, gain: .6, transpose: 12 }), clip('slow-once', { start: 1.75, length: 1.5, rate: .5, gain: 1.4, transpose: -12, voiceMap: { first: 'bass', second: 'lead' } }), clip('catch-held', { start: 0, length: 1, sourceOffset: .75 })];
  const adapter = { notes: { pitched: false, voices: [{ id: 'lead', name: 'Lead' }, { id: 'bass', name: 'Bass' }] }, renderPattern() {} };
  return { state, track, adapter, packet };
}
function scheduledNative(release, state, track, adapter) {
  const scheduled = [], clock = { revision: 1, cycle: 0, tempo: state.tempo, contextTime: -1 }, audio = { getTransport: () => clock, subscribeTransport: () => () => {} }, host = { scheduleNote(id, note) { scheduled.push(note); return note.id; } }, playback = new release.scope.LoomNotePlayback({ audio, host, getState: () => state });
  playback.catchHeld = true; const segment = { start: 0, end: state.lengthBars * 4, boundary: state.lengthBars * 4, cycle: 0, when: 0, catchHeld: true };
  for (const clip of track.clips) if (clip.type === 'notes') playback._clip(track, { adapter }, clip, segment, clock, 'loom');
  return scheduled;
}
function nativeEvent(note, tempo, scheduled = false) {
  return { beat: note.beat, duration: scheduled ? note.durationSeconds * tempo / 60 : note.duration, pitch: note.pitch, voice: note.voice, velocity: note.velocity, lyric: note.lyric ?? null, locks: note.locks ?? null };
}
function eventOrder(a, b) { return a.beat - b.beat || a.pitch - b.pitch || a.voice.localeCompare(b.voice) || a.duration - b.duration; }

module.exports = { BASELINE, load, blank, fixture, signal, lane, route, render, feed, capture, packCapture, makeFrozen, digest, distance, near };

async function run() {
  const release = load(), { S } = release, evidence = {}; let passed = 0;
  const check = async (name, test) => { if (process.env.FREEZE_QA_FILTER && !new RegExp(process.env.FREEZE_QA_FILTER).test(name)) return; await test(); passed++; console.log('PASS ' + name); };
  await check('Unfrozen production routing preserves the published GALLEY PCM exactly', () => {
    let historical;
    try { historical = load(BASELINE); } catch (error) { if (!fs.existsSync(path.join(root, '.git'))) { console.log('SKIP published comparison: source archive has no Git history'); return; } throw error; }
    const current = fixture(release), old = fixture(historical), actual = render(release, current.state, current.assets, current.sampleRate, current.frames), expected = render(historical, old.state, old.assets, old.sampleRate, old.frames);
    assert.deepEqual(actual.output, expected.output); evidence.unfrozenPcm = digest(actual.output);
  });
  assert.equal(typeof S.encodeFreezeAsset, 'function', 'Freeze schema has not been loaded');
  await check('Lossless Float32 little-endian assets preserve stereo, headroom and sample bits', () => {
    const left = new Float32Array([-0, Math.PI, -1.75, 1 / 3, 2 ** -120, 0]), right = new Float32Array([.123456789, -Math.E, 3.125, -.000001, -(2 ** -120), 0]), asset = S.encodeFreezeAsset({ id: 'bit-exact', name: 'Float32 exact', sampleRate: 96000, left, right }), decoded = S.decodeFreezeAsset(asset);
    assert.equal(asset.encoding, 'float32le'); assert.equal(asset.channels, 2); assert.equal(S.validateFreezeAsset(asset), left.byteLength + right.byteLength); assert.deepEqual(decoded.left, left); assert.deepEqual(decoded.right, right); assert(Object.is(decoded.left[0], -0));
    evidence.losslessPcm = digest([decoded.left, decoded.right]);
  });
  const moving = fixture(release), frozen = makeFrozen(release, moving);
  await check('Freeze cache preserves original source and every editable track/bus/LFO setting', () => {
    const sourceTrack = S.copy(frozen.state.tracks[0]); delete sourceTrack.freeze;
    assert.deepEqual(sourceTrack, moving.state.tracks[0]); assert.deepEqual(frozen.state.tracks.slice(1), moving.state.tracks.slice(1)); assert.deepEqual(frozen.state.returns, moving.state.returns); assert.deepEqual(frozen.state.master, moving.state.master); assert.deepEqual(frozen.state.lfos, moving.state.lfos); assert.deepEqual(frozen.state.assets, moving.state.assets); assert(S.freezeValid(frozen.state, 'track-1'));
  });
  await check('All inserts, swept EQ, fader, pan, pre/post sends and cross/self LFOs bake with live buses', () => {
    const expected = render(release, moving.state, moving.assets, moving.sampleRate, moving.frames, {}, 128), actual = render(release, frozen.state, frozen.assets, moving.sampleRate, moving.frames, {}, 128);
    evidence.movingMix = near(actual.output, expected.output); assert(actual.output.some(channel => channel.some(value => Math.abs(value) > .001)));
    assert.deepEqual(actual.core.modulation.phase, expected.core.modulation.phase, 'Freezing a destination retains the clock of all four source LFOs');
  });
  await check('Frozen tracks allocate no source processors and perform no insert/EQ/automation work', () => {
    const tracked = load('working', true), captured = fixture(tracked), cached = makeFrozen(tracked, captured); tracked.resetMetrics();
    const calls = { rack: 0, eq: 0 }, prototype = tracked.DSP.Core.prototype, rack = prototype._processRack, eq = prototype._processTrackEq;
    prototype._processRack = function (owner, ...args) { if (owner?.id === 'track-1') calls.rack++; return rack.call(this, owner, ...args); };
    prototype._processTrackEq = function (index, ...args) { if (index === 0) calls.eq++; return eq.call(this, index, ...args); };
    const core = new tracked.DSP.Core(cached.state, cached.assets, captured.sampleRate, { linear: true }); core.start(0); feed(core, captured.frames, 128); core.setState(tracked.S.copy(cached.state)); feed(core, 512, 128); core.getMeters();
    assert(core.slots[0].every(slot => !slot), 'Frozen rack contains no effect instances'); assert(!core.trackEq[0], 'Frozen track has no EQ instance'); assert.equal(core.clipLists[0].length, 0, 'Original audio sources are not compiled'); assert.deepEqual(calls, { rack: 0, eq: 0 });
    for (const type of ['strainer', 'velvet', 'cinder', 'undertow', 'preserve']) for (const method of ['create', 'process', 'setParams', 'getMeters']) assert.equal(tracked.metrics[type + '.' + method] || 0, 0, type + '.' + method);
    assert([...core.modulation.entries.keys()].every(key => !key.startsWith('track-1|')), 'Frozen modulation destinations are removed'); evidence.frozenCalls = { ...calls, ...tracked.metrics };
  });
  await check('Freeze capture ignores mute/solo, main suppression and unrelated track processing', () => {
    const baseline = capture(release, moving.state, moving.assets, moving.sampleRate, moving.frames, 128), changed = S.copy(moving.state);
    changed.tracks[0].mute = true; changed.tracks[1].solo = true; changed.returns[0].solo = true; changed.master.mute = true; changed.master.level = 0;
    const actual = capture(release, changed, moving.assets, moving.sampleRate, moving.frames, 128);
    for (const key of ['main', 'sendA', 'sendB']) assert.deepEqual(actual.planes[key], baseline.planes[key], key + ' is captured before shared audibility and buses');
  });
  await check('Silent send planes are omitted without adding dither or quantizing the main plane', () => {
    const silent = fixture(release, 8000, { lfos: false, buses: false, otherTrack: false }); silent.state.tracks[0].sends = [0, 0]; silent.state.tracks[0].automation = silent.state.tracks[0].automation.filter(item => !item.target.startsWith('send:'));
    const result = makeFrozen(release, silent); assert(result.state.tracks[0].freeze.chunks.every(chunk => !chunk.sendA && !chunk.sendB && chunk.main)); assert.equal(result.state.freezeAssets.length, 1);
  });
  await check('Chunk boundaries are continuous and cached playback is independent of render block size', () => {
    const chunked = makeFrozen(release, moving, { chunkFrames: 997 }), actual = render(release, chunked.state, chunked.assets, moving.sampleRate, moving.frames, {}, 137), expected = render(release, frozen.state, frozen.assets, moving.sampleRate, moving.frames, {}, 137);
    assert.deepEqual(actual.output, expected.output); assert(chunked.state.tracks[0].freeze.chunks.length > 10); evidence.chunkedPcm = digest(actual.output);
  });
  await check('Save/open, normalization and Undo copies retain exact frozen samples and source assets', () => {
    const text = S.serializeProject(frozen.state), opened = S.parseProject(text), copied = S.copy(opened); assert.deepEqual(opened, frozen.state); assert.deepEqual(copied, opened); assert(S.freezeValid(opened, 'track-1')); assert.strictEqual(copied.freezeAssets[0], opened.freezeAssets[0], 'Undo shares validated immutable cache objects');
    const decoded = S.decodeAssets(opened.assets, opened.freezeAssets); for (const asset of opened.freezeAssets) { const a = decoded instanceof Map ? decoded.get(asset.id) : decoded[asset.id], b = S.decodeFreezeAsset(asset); assert.deepEqual(a.left, b.left); assert.deepEqual(a.right, b.right); }
    const unfreeze = S.copy(opened); delete unfreeze.tracks[0].freeze; const pruned = S.pruneAssets(unfreeze); assert.equal(pruned.assets.length, 1, 'Original source remains available'); assert(!pruned.freezeAssets?.length, 'Unreferenced frozen payloads are removed'); assert.deepEqual(copied, opened, 'Pruning a new history state leaves Undo intact'); evidence.savedBytes = Buffer.byteLength(text);
  });
  await check('Malformed float payloads, chunk gaps and stale dependencies reject atomically', () => {
    const badCases = [state => state.freezeAssets[0].pcm = state.freezeAssets[0].pcm.slice(4), state => state.freezeAssets[0].frames++, state => state.freezeAssets[0].encoding = 'pcm16', state => state.tracks[0].freeze.chunks[0].startFrame = 1, state => state.tracks[0].freeze.chunks[0].frames--, state => state.tracks[0].freeze.chunks[0].main = 'missing-freeze', state => state.tracks[0].freeze.totalFrames++, state => state.tracks[0].freeze.bodyFrames--, state => state.tracks[0].freeze.sampleRate = 7999, state => state.tempo++, state => state.lengthBars++, state => state.tracks[0].effects[0].params.cutoff += 1, state => state.lfos[0].rate += .01];
    const raw = Buffer.alloc(8); raw.writeFloatLE(NaN, 0); raw.writeFloatLE(Infinity, 4); badCases.push(state => { const asset = state.freezeAssets[0]; asset.frames = 1; asset.duration = 1 / asset.sampleRate; asset.pcm = raw.toString('base64'); });
    for (let index = 0; index < badCases.length; index++) { const invalid = JSON.parse(JSON.stringify(frozen.state)); badCases[index](invalid); const before = JSON.stringify(invalid); assert.throws(() => S.parseProject(JSON.stringify({ format: 'loom-project', formatVersion: 1, appVersion: S.VERSION, state: invalid })), /frozen|freeze|cache|asset|float|invalid|chunk/i, 'Malformed case ' + index); assert.equal(JSON.stringify(invalid), before, 'Validation is atomic case ' + index); }
  });
  await check('Live mute/solo/label/loop edits preserve validity while baked controls invalidate', () => {
    for (const edit of [state => state.tracks[0].mute = true, state => state.tracks[0].solo = true, state => state.tracks[0].name = 'Frozen dinner', state => state.tracks[0].color = '#abcdef', state => state.loopEnabled = true, state => state.loopStart = 1, state => state.tracks[1].level = .12, state => state.master.level = .1, state => state.returns[0].effects[0].params.feedback = .1]) { const edited = S.copy(frozen.state); edit(edited); assert(S.freezeValid(edited, 'track-1')); }
    for (const edit of [state => state.tracks[0].level += .01, state => state.tracks[0].pan += .01, state => state.tracks[0].sends[0] += .01, state => state.tracks[0].sendPre[0] = !state.tracks[0].sendPre[0], state => state.tracks[0].eq.lowMidFreq++, state => state.tracks[0].clips[0].start += .01, state => state.lfos[3].routes[0].amount += .01]) { const edited = S.copy(frozen.state); edit(edited); assert.equal(S.freezeValid(edited, 'track-1'), false); }
  });
  await check('Editing another track effect and its LFO leaf routes keeps frozen projects saveable', () => {
    const withLeaf = S.copy(frozen.state); withLeaf.lfos[0].routes.push(route('track-2', 'fx:0:cutoff', .1, 'prism')); assert(S.freezeValid(withLeaf, 'track-1'), 'An unrelated new destination cannot alter the frozen input');
    for (const edit of [state => { state.tracks[1].effects[0] = null; state.lfos[0].routes = state.lfos[0].routes.filter(item => item.ownerId !== 'track-2'); }, state => { state.tracks[1].effects[1] = state.tracks[1].effects[0]; state.tracks[1].effects[0] = null; const leaf = state.lfos[0].routes.find(item => item.ownerId === 'track-2'); leaf.target = 'fx:1:cutoff'; }]) {
      const changed = S.copy(withLeaf); edit(changed); const normalized = S.normalize(changed), saved = S.serializeProject(normalized), opened = S.parseProject(saved); assert(S.freezeValid(opened, 'track-1')); assert.deepEqual(opened.tracks[0].freeze, frozen.state.tracks[0].freeze); assert.deepEqual(opened.freezeAssets, frozen.state.freezeAssets, 'The cached sample payloads remain identical');
      const originalCore = new release.DSP.Core(frozen.state, frozen.assets, 8000), editedCore = new release.DSP.Core(opened, S.decodeAssets(opened.assets, opened.freezeAssets), 8000); for (const frame of [0, 997, 7001, 15999]) { originalCore._readFrozen(originalCore.frozen[0], frame); editedCore._readFrozen(editedCore.frozen[0], frame); assert.deepEqual(editedCore.frozen[0].last, originalCore.frozen[0].last); }
    }
    for (const edit of [state => state.lfos[0].routes[0].amount += .01, state => state.lfos[0].routes.find(item => item.ownerId === 'lfo-2').amount += .01, state => state.lfos[1].depth += .01]) { const changed = S.copy(frozen.state); edit(changed); assert.equal(S.freezeValid(changed, 'track-1'), false, 'Own leaf and shared oscillator graph edits invalidate the printed input'); }
  });
  await check('Memoized source fingerprints detect nested edits after structural Undo copies', () => {
    const source = S.copy(moving.state); source.tracks[0].instrument = { id: 'brine', name: 'BRINE', snapshot: { format: 'loom-instrument-state', version: 1, app: 'brine', state: { voices: [{ cutoff: .4, envelope: [1, 2, 3] }], optional: { value: 1 } } } };
    const fingerprint = S.freezeFingerprint(source, 'track-1');
    for (const edit of [state => state.tracks[0].instrument.snapshot.state.voices[0].cutoff++, state => state.tracks[0].instrument.snapshot.state.voices[0].envelope[1]++, state => state.tracks[0].instrument.snapshot.state.optional = null, state => state.tracks[0].effects[0].params.cutoff++, state => state.tracks[0].automation[0].points[0].value += .01, state => { const bytes = Buffer.from(state.assets[0].pcm, 'base64'); bytes[300] ^= 1; state.assets[0].pcm = bytes.toString('base64'); }]) {
      const edited = S.copy(source); assert.equal(S.freezeFingerprint(edited, 'track-1'), fingerprint); edit(edited); assert.notEqual(S.freezeFingerprint(edited, 'track-1'), fingerprint); assert.equal(S.freezeFingerprint(source, 'track-1'), fingerprint);
    }
  });
  await check('The production freeze controller commits once, merges unrelated edits and restores without rendering', async () => {
    const q = controllerFixture(release, { hold: 'render' }), original = S.copy(q.state), pending = q.controller.freeze('track-1'); await q.entered.promise;
    q.edit(state => { state.tracks[0].mute = true; state.tracks[0].name = 'Still editable'; state.tracks[1].level = .21; state.master.level = .44; state.selectedTrack = 3; }); q.resume.resolve(); await pending;
    assert.equal(q.calls.commit, 1); assert.equal(q.calls.release, 1); assert(S.freezeValid(q.state, 'track-1')); assert.equal(q.state.tracks[0].mute, true); assert.equal(q.state.tracks[0].name, 'Still editable'); assert.equal(q.state.tracks[1].level, .21); assert.equal(q.state.master.level, .44); assert.equal(q.state.selectedTrack, 3); assert.deepEqual(q.state.tracks[0].clips, original.tracks[0].clips);
    assert.equal(q.controller.getStatus().busy, false); const renders = q.calls.render; assert.equal(q.controller.unfreeze('track-1'), true); assert.equal(q.calls.render, renders); assert(!q.state.tracks[0].freeze); assert(!q.state.freezeAssets?.length); assert.deepEqual(q.state.tracks[0].effects, original.tracks[0].effects); assert.deepEqual(q.state.tracks[0].automation, original.tracks[0].automation);
  });
  await check('Input is captured before asynchronous setup and stale source or global graph edits reject', async () => {
    for (const [hold, edit] of [['pause', state => state.tracks[0].level += .01], ['init', state => state.tracks[0].eq.low++], ['prepare', state => state.tempo++], ['render', state => state.lengthBars++], ['render', state => state.lfos[0].enabled = true], ['render', state => state.tracks[0].clips[0].start += .25]]) {
      const q = controllerFixture(release, { hold }), pending = q.controller.freeze('track-1'); await q.entered.promise; q.edit(edit); const edited = S.copy(q.state); q.resume.resolve(); await assert.rejects(pending, /changed|canceled|cancelled/i); assert.deepEqual(q.state, edited); assert.equal(q.calls.commit, 0); assert.equal(q.calls.release, 0); assert.equal(q.controller.getStatus().busy, false);
    }
  });
  await check('Cancel, external abort, project replacement and renderer failure are atomic', async () => {
    for (const operation of ['cancel', 'abort', 'replace', 'failure']) {
      const q = controllerFixture(release, { hold: 'render', failure: operation === 'failure' }), original = S.copy(q.state), external = new AbortController(), pending = q.controller.freeze('track-1', { signal: external.signal }); await q.entered.promise;
      if (operation === 'cancel') { assert(q.controller.cancel()); assert(q.controller.getStatus().busy, 'Busy is retained until asynchronous work settles'); }
      if (operation === 'abort') external.abort(); if (operation === 'replace') { const replacement = blank(release); replacement.name = 'Replacement'; q.replace(replacement); }
      q.resume.resolve(); await assert.rejects(pending, operation === 'failure' ? /Deliberate render/ : /cancel/i); assert.equal(q.calls.commit, 0); assert.equal(q.calls.release, 0); assert.equal(q.controller.getStatus().busy, false); assert.deepEqual(q.state, operation === 'replace' ? { ...blank(release), name: 'Replacement' } : original);
    }
  });
  await check('Captured native patch is committed only on success and changed native hosts cannot be frozen', async () => {
    const state = fixture(release, 8000, { lfos: false, otherTrack: false, buses: false }).state; state.tracks[0].instrument = { id: 'brine', name: 'BRINE', snapshot: { format: 'loom-instrument-state', version: 1, app: 'brine', state: { patch: 1 } } };
    const success = controllerFixture(release, { state, instrument: true, hold: 'render' }), pending = success.controller.freeze('track-1'); await success.entered.promise; assert.deepEqual(success.state.tracks[0].instrument.snapshot.state, { patch: 1 }); assert.deepEqual(success.seen.prepareState.tracks[0].instrument.snapshot.state, { patch: 7 }); success.resume.resolve(); await pending; assert.deepEqual(success.state.tracks[0].instrument.snapshot.state, { patch: 7 }); assert.equal(success.calls.snapshot, 2); assert.equal(success.calls.release, 1); assert.deepEqual(success.seen.commitSettings.capturedInstrument.descriptor.snapshot.state, { patch: 7 });
    for (const kind of ['patch', 'record']) { const q = controllerFixture(release, { state, instrument: true, hold: 'render' }), work = q.controller.freeze('track-1'); await q.entered.promise; if (kind === 'patch') q.hostSnapshot.state.patch++; else q.host.records.set('track-1', { ready: Promise.resolve() }); q.resume.resolve(); await assert.rejects(work, /instrument.*changed|patch.*changed/i); assert.equal(q.calls.commit, 0); assert.equal(q.calls.release, 0); assert.deepEqual(q.state, state); }
  });
  await check('Native freeze compilation matches the actual live note scheduler across all clip timing controls', () => {
    const source = nativeFixture(release), before = JSON.stringify(source.state), compile = release.scope.LoomNoteRenderer.compileFreezeNotes; assert.equal(typeof compile, 'function');
    const packet = compile(source.state, source.track, source.adapter), expected = scheduledNative(release, source.state, source.track, source.adapter).map(note => nativeEvent(note, source.state.tempo, true)).sort(eventOrder), actual = packet.notes.map(note => nativeEvent(note, source.state.tempo)).sort(eventOrder);
    assert(actual.length > 3, 'The fixture contains caught-held, stretched and repeated notes'); assert.equal(actual.length, expected.length); assert.equal(packet.tempo, source.state.tempo); assert.equal(packet.lengthBeats, 4); assert.equal(packet.swing, 0, 'Swing is baked into event positions'); assert(packet.notes.every(note => note.probability === 1), 'Each probability decision is already captured');
    for (let index = 0; index < actual.length; index++) { for (const key of ['beat', 'duration', 'velocity']) assert(Math.abs(actual[index][key] - expected[index][key]) < 1e-9, key + ' event ' + index + ': ' + JSON.stringify({ actual: actual[index], expected: expected[index] })); for (const key of ['pitch', 'voice', 'lyric', 'locks']) assert.deepEqual(actual[index][key], expected[index][key], key + ' event ' + index); }
    assert.equal(JSON.stringify(source.state), before); evidence.compiledNativeEvents = actual;
  });
  await check('One private native pass preserves releases and avoids loop-folded first-pass ghosts', async () => {
    const source = nativeFixture(release), before = JSON.stringify(source.state), calls = { load: 0, render: 0, close: 0 }, frames = Math.round((4 * 60 / source.state.tempo + 8) * 8000), pcm = new Float32Array(frames * 2);
    for (let frame = 0; frame < frames; frame++) { pcm[frame * 2] = .02 * Math.sin(frame * .1); pcm[frame * 2 + 1] = .015 * Math.cos(frame * .13); }
    const renderer = new release.scope.LoomNoteRenderer(), session = { frame: {}, host: { async load() { calls.load++; }, getPatternAdapter: () => source.adapter, capabilities: () => ({ notes: true }), async renderPattern(id, request) { calls.render++; calls.request = request; return { sampleRate: 8000, pcm }; } }, async close() { calls.close++; } }; renderer._session = () => session;
    const prepared = await renderer.prepareNotes(source.state, {}, { trackId: 'track-1', preserveTails: true, adapter: source.adapter, tailSeconds: 8 }), clips = prepared.state.tracks[0].clips, clip = clips.find(item => item.freezeTailSource), asset = prepared.assets[clip?.assetId];
    assert.equal(calls.load, 1); assert.equal(calls.render, 1); assert.equal(calls.close, 1); assert.equal(calls.request.tempo, source.state.tempo); assert.equal(calls.request.tailSeconds, 8); assert.equal(calls.request.pattern.lengthBeats, 4); assert.equal(clips.length, 1); assert(clip); assert.equal(clip.start, 0); assert.equal(clip.loop, false); assert.equal(clip.rate, 1); assert.equal(clip.gain, 1); assert.equal(clip.fadeIn, 0); assert.equal(clip.fadeOut, 0); assert.equal(clip.length, (frames / 8000) * source.state.tempo / 60); assert.equal(asset.left.length, frames);
    for (const frame of [0, 1, 19999, 20000, frames - 1]) { assert.equal(asset.left[frame], pcm[frame * 2]); assert.equal(asset.right[frame], pcm[frame * 2 + 1]); } assert.equal(JSON.stringify(source.state), before); await renderer.dispose();
  });
  await check('Dense or excessively long native freezes reject before committing generated sources', async () => {
    const source = nativeFixture(release), dense = S.copy(source.state); dense.lengthBars = 64; dense.tempo = 240; dense.loopEnd = 256; dense.recording.punchEnd = 256; const clip = dense.tracks[0].clips[0]; clip.start = 0; clip.length = 256; clip.rate = 8; clip.sourceOffset = 0; clip.loop = true; clip.pattern.lengthBeats = .25; clip.pattern.swing = 0; clip.pattern.notes = [{ ...clip.pattern.notes[0], beat: 0, duration: .1 }, { ...clip.pattern.notes[0], id: 'second-dense', beat: .125, duration: .1 }]; dense.tracks[0].clips = [clip];
    assert.throws(() => release.scope.LoomNoteRenderer.compileFreezeNotes(dense, dense.tracks[0], source.adapter), /4096|4,096|dense|too many/i);
    const long = S.copy(source.state); long.lengthBars = 64; long.tempo = 40; const before = JSON.stringify(long), renderer = new release.scope.LoomNoteRenderer(); let sessions = 0; renderer._session = () => { sessions++; throw Error('Unexpected private session'); };
    await assert.rejects(renderer.prepareNotes(long, {}, { trackId: 'track-1', preserveTails: true, adapter: source.adapter, tailSeconds: 8 }), /120|long|shorten|print/i); assert.equal(sessions, 0, 'The native duration preflight runs before opening any private instrument'); assert.equal(JSON.stringify(long), before); await renderer.dispose();
  });
  await check('Native PCM continues sample-exactly through capture tails while ordinary clip sources stop', async () => {
    const state = blank(release); state.tempo = 97; const sampleRate = 8000, bodyFrames = Math.round(4 * 60 / 97 * sampleRate), tailFrames = 1000, totalFrames = bodyFrames + tailFrames, channels = signal(totalFrames, sampleRate, .02), ordinary = { sampleRate, left: new Float32Array(totalFrames).fill(.01), right: new Float32Array(totalFrames).fill(-.012) }, assets = { native: { sampleRate, left: channels[0], right: channels[1] }, ordinary };
    state.tracks[0].clips = [{ id: 'native-release', type: 'audio', name: 'Native performance', assetId: 'native', start: 0, length: totalFrames / sampleRate * state.tempo / 60, sourceStart: 0, sourceEnd: totalFrames / sampleRate, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: 1, fadeIn: 0, fadeOut: 0, freezeTailSource: true }, { id: 'ordinary-body', type: 'audio', name: 'Ordinary audio', assetId: 'ordinary', start: 0, length: 4, sourceStart: 0, sourceEnd: totalFrames / sampleRate, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: 1, fadeIn: 0, fadeOut: 0 }];
    const actual = capture(release, state, assets, sampleRate, bodyFrames, 128, 'track-1', tailFrames).planes, continuous = new release.DSP.Core(state, assets, sampleRate, { linear: true, freezeCaptureTrackId: 'track-1' }), expected = { main: [new Float32Array(totalFrames), new Float32Array(totalFrames)], sendA: [new Float32Array(totalFrames), new Float32Array(totalFrames)], sendB: [new Float32Array(totalFrames), new Float32Array(totalFrames)] }; continuous.start(0);
    for (let at = 0; at < totalFrames; at += 128) { const count = Math.min(128, totalFrames - at); continuous.processBlock(new Float32Array(count), new Float32Array(count)); for (const key of Object.keys(expected)) for (let channel = 0; channel < 2; channel++) expected[key][channel].set(continuous.freezeCapture[key][channel], at); }
    for (const key of Object.keys(expected)) assert.deepEqual(actual[key], expected[key], key + ' complete native pass at97BPM'); assert(actual.main[0].subarray(bodyFrames).some(value => Math.abs(value) > .005), 'The release survives the transport body boundary');
    const engine = new release.scope.LoomAudio(state), rendered = [new Float32Array(totalFrames), new Float32Array(totalFrames)]; await engine.renderFreezeTrack(state, assets, { trackId: 'track-1', sampleRate, tailSeconds: tailFrames / sampleRate, onChunk(chunk) { if (chunk.planes.main) { rendered[0].set(chunk.planes.main.left, chunk.startFrame); rendered[1].set(chunk.planes.main.right, chunk.startFrame); } } }); const fade = Math.round(sampleRate * .006); for (let channel = 0; channel < 2; channel++) assert.deepEqual(rendered[channel].subarray(0, totalFrames - fade), expected.main[channel].subarray(0, totalFrames - fade)); await engine.dispose();
    const long = { ...state.tracks[0].clips[0], length: 288 }; assert.equal(release.DSP.ClipPlayback.compile(long, assets.native).length, 288); assert.equal(release.DSP.ClipPlayback.compile({ ...long, freezeTailSource: false }, assets.native).length, 256);
  });
  await check('Production streamed renders preserve live quantum, chunk order and all three Float32 planes', async () => {
    const engine = new release.scope.LoomAudio(moving.state), tailFrames = 1000, expected = capture(release, moving.state, moving.assets, moving.sampleRate, moving.frames, 128, 'track-1', tailFrames), planes = Object.fromEntries(['main', 'sendA', 'sendB'].map(key => [key, [new Float32Array(moving.frames + tailFrames), new Float32Array(moving.frames + tailFrames)]])), chunks = [], progress = [];
    const result = await engine.renderFreezeTrack(moving.state, moving.assets, { trackId: 'track-1', sampleRate: moving.sampleRate, tailSeconds: tailFrames / moving.sampleRate, chunkSeconds: .071, onProgress: value => progress.push(value), onChunk(chunk) { chunks.push(chunk); for (const [key, audio] of Object.entries(chunk.planes)) { planes[key][0].set(audio.left, chunk.startFrame); planes[key][1].set(audio.right, chunk.startFrame); } } });
    assert.deepEqual(result, { sampleRate: 8000, bodyFrames: 16000, totalFrames: 17000, tailFrames: 1000 }); let next = 0; for (const chunk of chunks) { assert.equal(chunk.startFrame, next); next += chunk.frames; } assert.equal(next, result.totalFrames);
    const fadedFrames = Math.round(moving.sampleRate * .006); for (const key of Object.keys(planes)) for (let channel = 0; channel < 2; channel++) { assert.deepEqual(planes[key][channel].subarray(0, result.totalFrames - fadedFrames), expected.planes[key][channel].subarray(0, result.totalFrames - fadedFrames)); assert(planes[key][channel].at(-1) === 0, 'The finite cache has a click-free ending'); }
    assert.equal(progress[0], 0); assert.equal(progress.at(-1), 1); assert(progress.every((value, index) => !index || value >= progress[index - 1])); assert.equal(engine._exportCount, 0); evidence.streamingChunks = chunks.length; await engine.dispose();
  });
  await check('Renderer aborts, rejected chunks and budget exhaustion release operation counters without edits', async () => {
    const engine = new release.scope.LoomAudio(moving.state), before = JSON.stringify(moving.state), controller = new AbortController(); controller.abort();
    await assert.rejects(engine.renderFreezeTrack(moving.state, moving.assets, { trackId: 'track-1', sampleRate: 8000, signal: controller.signal }), /cancel/i);
    await assert.rejects(engine.renderFreezeTrack(moving.state, moving.assets, { trackId: 'track-1', sampleRate: 8000, tailSeconds: 0, chunkSeconds: .02, maxBytes: 1 }), /cache|memory|shorten/i);
    await assert.rejects(engine.renderFreezeTrack(moving.state, moving.assets, { trackId: 'track-1', sampleRate: 8000, tailSeconds: 0, chunkSeconds: .02, onChunk() { throw Error('Sink rejected chunk'); } }), /Sink rejected/);
    const during = new AbortController(); await assert.rejects(engine.renderFreezeTrack(moving.state, moving.assets, { trackId: 'track-1', sampleRate: 8000, tailSeconds: 0, chunkSeconds: .02, signal: during.signal, onChunk() { during.abort(); } }), /cancel/i);
    assert.equal(engine._exportCount, 0); assert.equal(JSON.stringify(moving.state), before); await engine.dispose();
  });
  await check('Complete arrangements longer than 120 seconds stream as bounded chunks', async () => {
    const state = blank(release); state.lengthBars = 64; state.loopEnd = 256; state.recording.punchEnd = 256; const engine = new release.scope.LoomAudio(state), chunks = [];
    const result = await engine.renderFreezeTrack(state, {}, { trackId: 'track-1', sampleRate: 8000, tailSeconds: 0, maxBytes: 0, onChunk(chunk) { assert(chunk.frames <= 80000); assert.deepEqual(chunk.planes, {}, 'Silence consumes no sample storage'); chunks.push([chunk.startFrame, chunk.frames]); } });
    assert.equal(result.bodyFrames, 1024000); assert.equal(chunks.length, 13); assert.equal(chunks.at(-1)[0] + chunks.at(-1)[1], result.totalFrames); await engine.dispose(); evidence.longArrangementSeconds = result.bodyFrames / result.sampleRate;
  });
  await check('Native-rate frozen audio remains exact at 44.1, 48 and 96 kHz and rejects mismatched contexts', () => {
    for (const sampleRate of [44100, 48000, 96000]) {
      const source = fixture(release, sampleRate, { buses: false, otherTrack: false, lfos: false }); source.state.tracks[0].effects.fill(null); source.state.tracks[0].automation = [lane('level', .3, .8), lane('pan', -.4, .3)]; source.state.tracks[0].eq = S.defaultTrackEq(); const cache = makeFrozen(release, source), expected = render(release, source.state, source.assets, sampleRate, source.frames, {}, 128), actual = render(release, cache.state, cache.assets, sampleRate, source.frames, {}, 137); near(actual.output, expected.output);
      assert.throws(() => new release.DSP.Core(cache.state, cache.assets, sampleRate === 48000 ? 44100 : 48000), /sample rate|unfreeze/i);
    }
  });
  await check('Seek reads the exact absolute cached frame and interpolates across chunk boundaries', () => {
    const chunked = makeFrozen(release, moving, { chunkFrames: 997 }), core = new release.DSP.Core(chunked.state, chunked.assets, 8000, { linear: true }), cache = core.frozen[0];
    for (const position of [0, 996, 996.5, 997, 1993.75, 14001, 15999]) { core._readFrozen(cache, position); const frame = Math.floor(position), fraction = position - frame; for (let plane = 0; plane < 3; plane++) for (let channel = 0; channel < 2; channel++) { const data = chunked.planes[['main', 'sendA', 'sendB'][plane]][channel], a = data[frame] || 0, b = data[frame + 1] || 0, expected = a + (b - a) * fraction; assert.equal(cache.last[plane * 2 + channel], expected, 'Frame ' + position + ', plane ' + plane + ':' + channel); } }
    core.start(1.25); feed(core, 1, 1); assert.equal(core.timelineFreezeFrames[0], 5000, 'Seek starts at the correct absolute sample');
  });
  await check('Live Undo of Unfreeze resumes the proxy at the current transport head', () => {
    const core = new release.DSP.Core(frozen.state, frozen.assets, 8000, { linear: true }); core.start(0); feed(core, 4000, 128);
    const source = S.copy(frozen.state); delete source.tracks[0].freeze; core.setState(source); feed(core, 2000, 128); const currentBeat = core.beat; core.setState(frozen.state); feed(core, 1, 1);
    assert(Math.abs(core.timelineFreezeFrames[0] - 6000) < 1e-7, 'The restored proxy starts at sample6000, not its old sample4000 cursor'); assert(Math.abs(core.timelineFreezeFrames[0] - currentBeat * 4000) < .02);
  });
  await check('Live Unfreeze and Undo de-click the transition without resetting shared bus processors', () => {
    const core = new release.DSP.Core(frozen.state, frozen.assets, 8000, { linear: true }); core.start(0); feed(core, 4000, 128); const sources = S.copy(frozen.state); delete sources.tracks[0].freeze;
    for (const state of [sources, frozen.state]) {
      const origin = core.lastOutput.slice(), returns = core.returnSlots.map(row => row.map(slot => slot?.dsp)), master = core.masterSlots.map(slot => slot?.dsp); core.setState(state); assert.equal(core.seekFadeRemaining, core.seekFadeFrames);
      const output = feed(core, core.seekFadeFrames + 1, 1); assert.equal(output[0][0], Math.fround(origin[0])); assert.equal(output[1][0], Math.fround(origin[1])); assert.equal(core.seekFadeRemaining, 0); for (let bus = 0; bus < 2; bus++) for (let slot = 0; slot < 4; slot++) assert.strictEqual(core.returnSlots[bus][slot]?.dsp, returns[bus][slot]); for (let slot = 0; slot < 4; slot++) assert.strictEqual(core.masterSlots[slot]?.dsp, master[slot]); feed(core, 512, 128);
    }
  });
  await check('Natural-end tails are replayed once, arbitrary stop declicks and looping stays finite', () => {
    const source = fixture(release, 8000, { otherTrack: false, buses: false, lfos: false }), tailFrames = 2000; source.state.tracks[0].effects.fill(null); source.state.tracks[0].effects[0] = S.effect({ type: 'parallax', params: { time: 71, feedback: .4, mix: .7 } }); source.state.tracks[0].automation = []; const cache = makeFrozen(release, source, { tailFrames }), reference = new release.DSP.Core(source.state, source.assets, 8000, { linear: true }), frozenCore = new release.DSP.Core(cache.state, cache.assets, 8000, { linear: true }); reference.start(0); frozenCore.start(0); feed(reference, source.frames, 128); feed(frozenCore, source.frames, 128); reference.stop(); frozenCore.stop(); near(feed(frozenCore, tailFrames, 128), feed(reference, tailFrames, 128)); const exhausted = feed(frozenCore, 512, 128); assert(exhausted.every(channel => channel.every(value => Math.abs(value) < 1e-10)));
    frozenCore.start(1); feed(frozenCore, 1024, 128); frozenCore.stop(); const stopped = feed(frozenCore, 1024, 128); assert(stopped.every(channel => channel.subarray(256).every(value => Math.abs(value) < 1e-10)), 'Manual stop settles after its short de-click fade');
    const looping = S.copy(cache.state); looping.loopEnabled = true; looping.loopStart = .5; looping.loopEnd = 1; const loopCore = new release.DSP.Core(looping, cache.assets, 8000); loopCore.start(.5); const loopAudio = feed(loopCore, 12000, 137); for (const channel of loopAudio) for (const value of channel) assert(Number.isFinite(value) && Math.abs(value) < 1); assert(loopCore.transportCycle > 3);
  });
  await check('Master and both stem WAV paths consume frozen Float32 assets at their stored rate', async () => {
    const engine = new release.scope.LoomAudio(frozen.state), errors = [];
    for (const selection of [{}, { trackId: 'track-1' }, { returnId: 'return-1' }]) {
      const wav = await engine.renderWav(frozen.state, frozen.assets, { endBeat: .5, tailSeconds: 0, ...selection }), bytes = await wav.arrayBuffer(), view = new DataView(bytes), sampleRate = view.getUint32(24, true), frames = (bytes.byteLength - 44) / 4; assert.equal(sampleRate, moving.sampleRate);
      const expected = render(release, frozen.state, frozen.assets, sampleRate, frames, selection, 2048).output; let maximum = 0;
      for (let frame = 0; frame < frames; frame++) for (let channel = 0; channel < 2; channel++) { const value = expected[channel][frame], integer = value < 0 ? Math.round(Math.max(-1, value) * 32768) : Math.round(Math.min(1, value) * 32767); maximum = Math.max(maximum, Math.abs(view.getInt16(44 + frame * 4 + channel * 2, true) - integer)); }
      assert(maximum <= 1, 'WAV differs from its production Core by ' + maximum + ' LSB'); errors.push(maximum);
    }
    evidence.wavLsbErrors = errors; await engine.dispose();
  });
  if (process.argv.includes('--matrix')) await check('Every effect family and every analog amp/compressor/preamp/tape/distortion model survives freezing', () => {
    const cases = release.scope.LoomEffectsCatalog.map(definition => ({ type: definition.id, params: {} }));
    for (const type of ['velvet', 'broiler', 'saute', 'preserve', 'cinder']) {
      const definition = release.scope.LoomEffectsCatalog.find(item => item.id === type), parameter = definition.params.find(item => item.key === (type === 'cinder' ? 'shape' : 'model'));
      if (parameter?.options) for (const option of parameter.options) cases.push({ type, params: { [parameter.key]: option.value } });
    }
    const differences = [];
    for (const example of cases) {
      const source = fixture(release, 8000, { lfos: false, buses: false, otherTrack: false }); source.state.tempo = 240; source.frames = 8000; const track = source.state.tracks[0]; track.effects.fill(null); track.effects[0] = S.effect(example); track.automation = []; track.eq = S.defaultTrackEq(); track.sends = [0, 0]; track.level = .4;
      const cache = makeFrozen(release, source), reference = render(release, source.state, source.assets, 8000, 8000, {}, 128), actual = render(release, cache.state, cache.assets, 8000, 8000, {}, 137), errors = near(actual.output, reference.output, 3e-7, example.type + ' ' + JSON.stringify(example.params)); differences.push({ ...example, max: Math.max(...errors.map(error => error.max)) });
    }
    evidence.modelMatrix = { cases: differences.length, maximum: Math.max(...differences.map(item => item.max)), examples: differences };
  });
  if (process.argv.includes('--bench')) await check('Exclusive informational timing confirms the frozen rack removes processing cost', () => {
    const { performance } = require('node:perf_hooks'), source = fixture(release, 8000, { lfos: false, buses: false, otherTrack: false }), frozenTrack = source.state.tracks[0];
    for (let index = 1; index < 8; index++) { source.state.tracks[index] = { ...S.copy(frozenTrack), id: 'track-' + (index + 1), name: 'Dense track ' + (index + 1), clips: frozenTrack.clips.map(clip => ({ ...clip, id: clip.id + '-' + index })) }; }
    let cached = { state: source.state, assets: source.assets }; for (let index = 0; index < 8; index++) cached = makeFrozen(release, { ...source, ...cached }, { trackId: 'track-' + (index + 1) });
    const elapsed = (state, assets) => { const core = new release.DSP.Core(state, assets, 8000, { linear: true }); core.start(0); const started = performance.now(); feed(core, 16000, 128); return performance.now() - started; };
    elapsed(source.state, source.assets); elapsed(cached.state, cached.assets); const live = [], frozenTimes = [];
    for (let trial = 0; trial < 3; trial++) { live.push(elapsed(source.state, source.assets)); frozenTimes.push(elapsed(cached.state, cached.assets)); }
    const median = values => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)], liveMs = median(live), frozenMs = median(frozenTimes); evidence.informationalTiming = { sampleRate: 8000, frames: 16000, tracks: 8, liveMs, frozenMs, speedup: liveMs / frozenMs, live, frozen: frozenTimes }; console.log('TIMING ' + JSON.stringify(evidence.informationalTiming));
  });
  console.log(passed + ' freeze correctness groups passed.'); console.log(JSON.stringify(evidence));
}
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
