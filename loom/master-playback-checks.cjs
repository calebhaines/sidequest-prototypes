'use strict';
/* Master speed/pitch: portable state, nominal render boundaries and transport races.
 * The transform's spectral tests live with its processor checks; these exercise
 * the production orchestration without a browser or a realtime CPU benchmark.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const q = require('./deluxe-checks.cjs');
const project = require('./deluxe-project-checks.cjs');
const NEUTRAL = Object.freeze({ speed: 1, pitch: 0, preservePitch: true });
const plain = q.plain;
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(release, sampleRate = 8000) {
  const input = project.fixture(release, {}, sampleRate);
  input.state.tracks[8].effects.fill(null);
  input.state.tracks[8].automation = [{ target: 'level', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: .4 }, { beat: 4, value: .8 }] }];
  input.state.returns[0].effects[0] = release.S.effect({ type: 'parallax', params: { clock: 'free', time: 70, feedback: .35, spread: .2, mix: 1 } });
  input.state.master.effects[0] = release.S.effect({ type: 'prism', params: { filter: 'lowpass', cutoff: 3400, resonance: .3, mix: 1 } });
  Object.assign(input.state.master.mastering, { enabled: true, eq: true, highGain: 1 });
  return input;
}
function runCore(release, input, { startBeat = 0, endBeat = 4, tailSeconds = 0, quantum = 128 } = {}) {
  const rate = input.rate, bodyFrames = Math.round((endBeat - startBeat) * 60 / input.state.tempo * rate), tailFrames = Math.round(tailSeconds * rate);
  const core = new release.DSP.Core(input.state, input.assets, rate, { linear: true }), left = new Float32Array(bodyFrames + tailFrames), right = left.slice();
  core.start(startBeat);
  for (let at = 0; at < left.length;) {
    if (at === bodyFrames) core.stop();
    const end = Math.min(left.length, at + quantum, at < bodyFrames ? bodyFrames : left.length);
    core.processBlock(left.subarray(at, end), right.subarray(at, end)); at = end;
  }
  return { left, right, frames: left.length, bodyFrames, tailFrames, sampleRate: rate };
}
function loadController(release, transform) {
  const scope = release.scope;
  scope.LoomMasterTransform = transform;
  const file = path.join(__dirname, 'master-playback.js');
  Function('window', 'globalThis', fs.readFileSync(file, 'utf8'))(scope, scope);
  assert.equal(typeof scope.LoomMasterPlayback?.create, 'function');
  return scope.LoomMasterPlayback;
}

function controllerFixture({ settings = { speed: .5, pitch: 0, preservePitch: true }, loop = true, block = null } = {}) {
  const release = q.load(), { S } = release;
  let state = project.blank(release), generation = 0, assets = new Map([['source', { left: new Float32Array(16), right: new Float32Array(16), sampleRate: 8000 }]]);
  Object.assign(state, { loopEnabled: loop, loopStart: loop ? 1 : 0, loopEnd: loop ? 3 : 4 }); state.master.playback = { ...settings };
  const calls = { init: 0, prepare: 0, render: 0, process: 0, processors: 0, processorDisposals: 0, buffers: 0, sources: [], original: {}, notifications: [], onPause: 0 }, entered = deferred(), gate = deferred();
  const sourceData = [0, 1].map(c => Float32Array.from({ length: 8000 }, (_, i) => .08 * Math.sin(2 * Math.PI * (c ? 660 : 440) * i / 8000)));
  const count = name => { calls.original[name] = (calls.original[name] || 0) + 1; };
  const context = {
    currentTime: 0, sampleRate: 8000, destination: {}, async resume() {},
    createBuffer(channels, frames, sampleRate) { calls.buffers++; const data = Array.from({ length: channels }, () => new Float32Array(frames)); return { length: frames, sampleRate, duration: frames / sampleRate, copyToChannel(source, channel) { data[channel].set(source); }, getChannelData(channel) { return data[channel]; } }; },
    createBufferSource() { const source = { playbackRate: { value: 1 }, stopped: 0, disconnected: 0, connect() {}, disconnect() { this.disconnected++; }, start(when, offset) { this.when = when; this.offset = offset; }, stop(when) { this.stopped++; this.stopAt = when; } }; calls.sources.push(source); return source; },
    createGain() { const ramps = []; return { ramps, gain: { setValueAtTime(value, time) { ramps.push({ type: 'set', value, time }); }, linearRampToValueAtTime(value, time) { ramps.push({ type: 'linear', value, time }); }, cancelAndHoldAtTime() {} }, connect() {}, disconnect() {} }; },
    advance(time) { this.currentTime = time; for (const source of calls.sources) if (Number.isFinite(source.stopAt) && source.stopAt <= time) { source.stopAt = null; source.onended?.(); } }
  };
  const meter = { beat: 0, playing: false, master: { peak: .123, rms: .045 }, original: true }, clock = { beat: 0, tempo: 120, playing: false, original: true };
  const engine = {
    context, state, _exportCount: 0, recordingBusy: false,
    async init() { calls.init++; return context; },
    async play(beat = 0) { count('play'); clock.beat = beat; clock.playing = true; return true; }, stop() { count('stop'); clock.playing = false; }, seek(beat) { count('seek'); clock.beat = beat; return beat; }, panic() { count('panic'); clock.playing = false; },
    getMeters() { count('getMeters'); return meter; }, getTransport() { count('getTransport'); return clock; },
    setState(next) { count('setState'); this.state = next; }, setAssets(next) { count('setAssets'); assets = next instanceof Map ? next : new Map(Object.entries(next)); }, async dispose() { count('dispose'); },
    getMicrophoneStatus() { return { enabled: false, recording: false }; }, getServiceState() { return { active: false }; }, _notifyTransport(reason) { calls.notifications.push(reason); },
    async renderMasterPCM(renderState, renderAssets, options) { calls.render++; if (block === 'render') { entered.resolve(); await gate.promise; } const frames = Math.round((options.endBeat - options.startBeat) * 60 / renderState.tempo * 8000), tailFrames = options.previewLoop ? 0 : Math.round((options.tailSeconds ?? 8) * 8000), left = new Float32Array(frames + tailFrames), right = left.slice(); for (let i = 0; i < frames; i++) { left[i] = sourceData[0][i % 8000]; right[i] = sourceData[1][i % 8000]; } return { left, right, frames: left.length, bodyFrames: frames, tailFrames, sampleRate: 8000, startBeat: options.startBeat, endBeat: options.endBeat }; },
    async renderWav() { count('renderWav'); return new Blob(['original WAV']); },
    startRecording() { count('startRecording'); return 'recording'; }, startMicrophoneRecording() { count('startMicrophoneRecording'); return 'microphone'; }, setMicrophoneMonitoring() { count('setMicrophoneMonitoring'); return 'monitor'; }, startService() { count('startService'); return 'service'; }, resumeAudition() { count('resumeAudition'); return 'audition'; }, async applyAudioSettings() { count('applyAudioSettings'); return true; }
  };
  const transform = {
    normalize: value => S.normalizeMasterPlayback(value), isNeutral: value => value.speed === 1 && value.pitch === 0,
    durationFrames: (frames, value) => Math.max(1, Math.round(frames / value.speed)),
    Processor: class {
      constructor() { calls.processors++; }
      async process(audio, settings, options) { calls.process++; if (block === 'transform') { entered.resolve(); await gate.promise; } if (options.signal?.aborted) throw new DOMException('Canceled', 'AbortError'); const frames = transform.durationFrames(audio.frames, settings), left = new Float32Array(frames), right = left.slice(); for (let i = 0; i < frames; i++) { left[i] = audio.left[Math.min(audio.frames - 1, Math.floor(i * settings.speed))]; right[i] = audio.right[Math.min(audio.frames - 1, Math.floor(i * settings.speed))]; } return { left, right, frames, sampleRate: audio.sampleRate }; }
      dispose() { calls.processorDisposals++; }
    }
  };
  const api = loadController(release, transform), controller = api.create({ engine, getState: () => state, getAssets: () => assets, getGeneration: () => generation,
    async prepareSources(source, sourceAssets, options) { calls.prepare++; if (block === 'prepare') { entered.resolve(); await gate.promise; } if (block === 'snapshot') { const snapshot = { format: 'loom-instrument-state', version: 1, app: 'brine', state: { patch: 1 }, storage: { project: 'first' } }; source.tracks[0].instrument.snapshot = snapshot; options.onSnapshot('track-1', snapshot); state.tracks[0].instrument.snapshot.storage.project = 'later autosave'; engine.setState(state); entered.resolve(); await gate.promise; } return { state: source, assets: sourceAssets }; },
    async onPause() { calls.onPause++; if (block === 'pause') { entered.resolve(); await gate.promise; } }, onStatus() {}, onChange() {}
  }).attach();
  return { release, controller, engine, context, calls, entered, gate, meter, clock, get state() { return state; }, get assets() { return assets; }, edit(change) { change(state); engine.setState(state); }, nextGeneration() { generation++; }, replaceAssets() { const next = new Map(assets); next.set('source', { ...next.get('source'), left: new Float32Array(16).fill(.1) }); engine.setAssets(next); } };
}

async function controllerChecks({ check, evidence }) {
  await check('Neutral attachment delegates playback meters exports and recording without buffers processors or preparation', async () => {
    const h = controllerFixture({ settings: NEUTRAL });
    assert.strictEqual(h.engine.getMeters(), h.meter); assert.strictEqual(h.engine.getTransport(), h.clock); assert(await h.engine.play(2));
    h.engine.seek(1); h.engine.stop(); assert.equal(h.engine.startRecording(), 'recording'); assert.equal(h.engine.startService(), 'service'); assert.equal(h.engine.resumeAudition(), 'audition');
    await h.engine.renderWav(); for (let i = 0; i < 100; i++) h.engine.getMeters();
    assert.equal(h.calls.prepare, 0); assert.equal(h.calls.render, 0); assert.equal(h.calls.processors, 0); assert.equal(h.calls.buffers, 0); assert.equal(h.calls.sources.length, 0);
    await h.engine.dispose(); assert.equal(h.calls.original.dispose, 1);
  });
  await check('Prepared stereo playback maps its audible sample clock and loop cycles while keeping BufferSource rate at one', async () => {
    const h = controllerFixture(); assert(await h.engine.play(1)); h.context.currentTime = .25;
    let clock = h.engine.getTransport(); assert(Math.abs(clock.beat - 1.25) < 1e-10); assert.equal(clock.tempo, 60); assert.equal(clock.cycle, 0);
    h.context.currentTime = 2.5; clock = h.engine.getTransport(); assert(Math.abs(clock.beat - 1.5) < 1e-10); assert.equal(clock.cycle, 1); assert(Math.abs(clock.absoluteBeat - 3.5) < 1e-10);
    const meters = h.engine.getMeters(); assert(meters.master.rms > .02); assert(meters.tracks.every(m => m.rms === 0)); assert(meters.effects.every(rack => rack.length === 0));
    assert.equal(h.calls.sources[0].playbackRate.value, 1); assert.equal(h.calls.sources[0].loop, true); assert.equal(h.calls.sources[0].loopEnd, 2);
    evidence.preparedClock = plain(clock); h.controller.dispose();
  });
  await check('Pause resume and seek reuse prepared audio and release each previous output source', async () => {
    const h = controllerFixture(); await h.engine.play(1); h.context.currentTime = .75; h.engine.stop(); assert(Math.abs(h.engine.getTransport().beat - 1.75) < 1e-10);
    assert.equal(h.calls.sources[0].stopped, 1); assert.equal(h.calls.sources[0].disconnected, 1); await h.engine.play(); assert.equal(h.calls.render, 1); assert.equal(h.calls.process, 1); assert.equal(h.calls.prepare, 1);
    h.engine.seek(2.25); assert(Math.abs(h.engine.getTransport().beat - 2.25) < 1e-10); assert(h.calls.sources.slice(0, -1).every(source => source.stopped === 1 && source.disconnected === 1));
    h.engine.seek(9); assert.equal(h.engine.getTransport().beat, 1); await h.engine.dispose(); assert(h.calls.sources.every(source => source.stopped === 1 && source.disconnected === 1));
  });
  await check('Fractional loop periods use the actual rounded output frame count without accumulating transport or seek drift', async () => {
    const h = controllerFixture({ settings: { speed: .673, pitch: -3.25, preservePitch: true } }); h.edit(state => { state.tempo = 137; state.loopStart = .375; state.loopEnd = 2.125; });
    await h.engine.play(.375); const cache = h.controller.cache, period = cache.bodyFrames / cache.sampleRate, span = 1.75;
    const clock = h.engine.getTransport(h.controller.started + period * (100000 + .25)); assert.equal(clock.cycle, 100000); assert(Math.abs(clock.beat - (.375 + span * .25)) < 1e-7);
    h.engine.seek(.375 + span * .25); assert(Math.abs(h.controller.source.offset - period * .25) < 1e-10); assert(Math.abs(h.engine.getTransport().beat - (.375 + span * .25)) < 1e-10);
    evidence.fractionalLoop = { frames: cache.bodyFrames, period, after100000Cycles: plain(clock) }; h.controller.dispose();
  });
  await check('Changing settings retains the original audible beat and reuses nominal PCM while reprocessing the transform', async () => {
    const h = controllerFixture(); await h.engine.play(1); h.context.currentTime = .75; const before = h.engine.getTransport().beat;
    h.edit(state => { state.master.playback.speed = .8; state.tempo = 150; });
    assert(Math.abs(h.engine.getTransport().beat - before) < 1e-10, 'Changing speed or tempo moved the paused source beat');
    assert.equal(h.engine.getMeters().playing, false); await h.engine.play(); assert.equal(h.calls.render, 2, 'Tempo changes require new nominal audio'); h.controller.dispose();
    const sameTempo = controllerFixture(); await sameTempo.engine.play(1); sameTempo.context.currentTime = .75; sameTempo.edit(state => { state.master.playback.speed = .8; state.master.playback.pitch = 5; });
    assert(Math.abs(sameTempo.engine.getTransport().beat - 1.75) < 1e-10); await sameTempo.engine.play(); assert.equal(sameTempo.calls.render, 1); assert.equal(sameTempo.calls.process, 2); sameTempo.controller.dispose();
  });
  await check('View edits preserve playback but audio edits pause it and invalidate the prepared master', async () => {
    const h = controllerFixture(); await h.engine.play(1); const source = h.controller.source, buffer = h.controller.cache.buffer;
    h.edit(state => { state.view.zoom += 1; state.selectedTrack = 2; state.name = 'Another label'; }); assert.equal(h.engine.getMeters().playing, true); assert.strictEqual(h.controller.source, source); assert.strictEqual(h.controller.cache.buffer, buffer);
    h.edit(state => { state.tracks[8].level = .3; }); assert.equal(h.engine.getMeters().playing, false); assert.equal(h.controller.cache, null); assert.equal(h.controller.sourceCache, null); await h.engine.play(); assert.equal(h.calls.render, 2); h.controller.dispose();
  });
  await check('Captured instrument state determines cache identity while duplicate autosave storage cannot invalidate the same sound', () => {
    const h = controllerFixture(), state = h.release.S.copy(h.state), key = h.release.scope.LoomMasterPlayback.soundKey;
    state.tracks[0].instrumentLive = true; state.tracks[0].instrument = { id: 'brine', snapshot: { format: 'loom-instrument-state', version: 1, app: 'brine', state: { patch: 1 }, storage: { 'brine-project-v1': 'first autosave' } } };
    const before = key(state); state.tracks[0].instrument.snapshot.storage['brine-project-v1'] = 'second autosave'; assert.equal(key(state), before, 'Duplicate storage changed an authoritative captured state');
    state.tracks[0].instrument.snapshot.state.patch = 2; assert.notEqual(key(state), before, 'A real patch edit was hidden');
    state.tracks[0].instrument.snapshot.state = null; const storageOnly = key(state); state.tracks[0].instrument.snapshot.storage['brine-project-v1'] = 'storage is now the source'; assert.notEqual(key(state), storageOnly); h.controller.dispose();
  });
  await check('An authoritative snapshot can be promoted during preparation without hiding a subsequent real patch edit', async () => {
    for (const patchChanged of [false, true]) {
      const h = controllerFixture({ block: 'snapshot' }); h.edit(state => { state.tracks[0].instrument = { id: 'brine' }; state.tracks[0].instrumentLive = true; });
      const pending = h.engine.play(1); await h.entered.promise; assert.equal(h.state.tracks[0].instrument.snapshot.state.patch, 1);
      if (patchChanged) h.edit(state => { state.tracks[0].instrument.snapshot.state.patch = 2; });
      h.gate.resolve(); assert.equal(await pending, !patchChanged); assert.equal(h.engine.getMeters().playing, !patchChanged); h.controller.dispose();
    }
  });
  await check('Cancel and project replacement cannot start stale audio after either source or transform preparation completes', async () => {
    for (const block of ['pause', 'prepare', 'render', 'transform']) for (const action of ['cancel', 'generation', 'seek']) {
      const h = controllerFixture({ block }), pending = h.engine.play(1); await h.entered.promise;
      if (action === 'cancel') h.controller.cancel(); else if (action === 'seek') h.engine.seek(2); else h.nextGeneration(); h.gate.resolve(); assert.equal(await pending, false, block + '/' + action); assert.equal(h.calls.sources.length, 0); assert.equal(h.engine.getMeters().playing, false); if (action === 'seek') assert.equal(h.engine.getTransport().beat, 2); h.controller.dispose();
    }
  });
  await check('Replacing decoded assets cancels an in-flight preparation and invalidates an existing cached mix', async () => {
    const pendingFixture = controllerFixture({ block: 'render' }), pending = pendingFixture.engine.play(1); await pendingFixture.entered.promise; pendingFixture.replaceAssets(); pendingFixture.gate.resolve(); assert.equal(await pending, false, 'Old decoded assets committed after replacement'); assert.equal(pendingFixture.calls.sources.length, 0); pendingFixture.controller.dispose();
    const cached = controllerFixture(); await cached.engine.play(1); cached.context.currentTime = .75; const beat = cached.engine.getTransport().beat; cached.replaceAssets(); assert.equal(cached.controller.cache, null); assert.equal(cached.controller.sourceCache, null); assert.equal(cached.engine.getMeters().playing, false); assert(Math.abs(cached.engine.getTransport().beat - beat) < 1e-10, 'Decoded-asset replacement moved the paused beat'); cached.controller.dispose();
  });
  await check('Altered playback guards all public live-input operations and neutral reset restores their original methods', async () => {
    const h = controllerFixture(); for (const method of ['startRecording', 'startMicrophoneRecording', 'startService', 'resumeAudition']) assert.throws(() => h.engine[method]('track-9'), /reset|speed|pitch/i, method);
    assert.throws(() => h.engine.setMicrophoneMonitoring('track-9', { enabled: true }), /reset|speed|pitch/i); assert.equal(h.engine.setMicrophoneMonitoring('track-9', { enabled: false }), 'monitor');
    await h.engine.play(1); h.edit(state => { state.master.playback = { ...NEUTRAL }; }); assert.equal(h.controller.cache, null); assert.equal(h.controller.sourceCache, null); assert.equal(h.controller.assetRefs, null); assert.equal(h.engine.startRecording(), 'recording'); assert.equal(h.engine.startMicrophoneRecording(), 'microphone'); assert.equal(h.engine.startService(), 'service'); assert.equal(h.engine.resumeAudition(), 'audition'); h.controller.dispose();
  });
  await check('Prepared source stops use a short audio ramp and disposal immediately releases every retiring node', async () => {
    const h = controllerFixture(); h.context.state = 'running'; await h.engine.play(1); h.context.currentTime = .75;
    const source = h.controller.source, gain = h.controller.gain; h.engine.stop(); assert.equal(source.disconnected, 0); assert(Math.abs(source.stopAt - .756) < 1e-10); assert(gain.ramps.some(ramp => ramp.value === 0 && Math.abs(ramp.time - .756) < 1e-10));
    h.context.advance(.757); assert.equal(source.disconnected, 1); await h.engine.play(); h.engine.stop(); await h.engine.dispose(); assert(h.calls.sources.every(node => node.disconnected === 1));
    const panic = controllerFixture(); await panic.engine.play(1); panic.context.currentTime = .75; const revision = panic.engine.getTransport().revision; panic.engine.panic(); assert.equal(panic.engine.getTransport().beat, 1.75); assert(panic.engine.getTransport().revision > revision); assert.equal(panic.controller.cache, null); assert.equal(panic.controller.sourceCache, null); assert(panic.calls.sources.every(node => node.disconnected === 1)); panic.controller.dispose();
  });
  await check('Nonloop transport holds the musical end through its rendered tail and emits one completion event', async () => {
    const h = controllerFixture({ loop: false }); let ended = 0; h.engine.onTransportEnd = () => ended++; await h.engine.play(0); const source = h.controller.source;
    h.context.currentTime = 5; assert.equal(h.engine.getTransport().beat, 4); assert.equal(h.engine.getTransport().playing, true); assert.equal(ended, 0);
    h.context.currentTime = 20; source.onended(); assert.equal(h.engine.getTransport().beat, 4); assert.equal(h.engine.getMeters().ended, true); assert.equal(h.engine.getMeters().playing, false); assert.equal(ended, 1); assert.equal(h.calls.notifications.filter(event => event === 'end').length, 1); h.controller.dispose();
  });
  await check('Only full-mix export runs the transform while track and return stems delegate unchanged', async () => {
    const h = controllerFixture(), options = { startBeat: 0, endBeat: 4, tailSeconds: 0 };
    const mix = Buffer.from(await (await h.engine.renderWav(h.state, h.assets, options)).arrayBuffer()); assert.equal(mix.toString('ascii', 0, 4), 'RIFF'); assert.equal(h.calls.render, 1); assert.equal(h.calls.process, 1); assert.equal(h.engine._exportCount, 0);
    for (const stem of [{ trackId: 'track-9' }, { returnId: 'return-1' }]) assert.equal(await (await h.engine.renderWav(h.state, h.assets, { ...options, ...stem })).text(), 'original WAV');
    assert.equal(h.calls.process, 1); assert.equal(h.calls.original.renderWav, 2); assert.equal(h.controller.cache, null); h.controller.dispose();
  });
}

async function run() {
  const release = q.load(), { S } = release, passed = [], evidence = {};
  async function check(name, test) {
    if (process.env.MASTER_PLAYBACK_QA_FILTER && !new RegExp(process.env.MASTER_PLAYBACK_QA_FILTER).test(name)) return;
    await test(); passed.push(name); console.log('PASS ' + name);
  }
  await check('Master playback settings have strict portable bounds and migrate older projects only when absent', () => {
    assert.deepEqual(plain(S.defaultState().master.playback), NEUTRAL);
    assert.deepEqual(plain(S.normalizeMasterPlayback({ speed: Infinity, pitch: '12', preservePitch: 'yes' })), NEUTRAL);
    for (const settings of [NEUTRAL, { speed: .25, pitch: -24, preservePitch: false }, { speed: 2, pitch: 24, preservePitch: true }, { speed: .673, pitch: 3.25, preservePitch: false }]) {
      const s = S.defaultState(); s.master.playback = { ...settings };
      assert.deepEqual(plain(S.parseProject(S.serializeProject(s)).master.playback), settings);
    }
    const saved = JSON.parse(S.serializeProject(S.defaultState())); saved.appVersion = '1.33.0'; delete saved.state.master.playback;
    assert.deepEqual(plain(S.parseProject(JSON.stringify(saved)).master.playback), NEUTRAL);
    saved.appVersion = S.VERSION; assert.throws(() => S.parseProject(JSON.stringify(saved)), /playback|invalid/i);
    for (const settings of [{ speed: 0, pitch: 0, preservePitch: true }, { speed: 2.01, pitch: 0, preservePitch: true }, { speed: 1, pitch: 24.01, preservePitch: true }, { speed: '1', pitch: 0, preservePitch: true }, { speed: 1, pitch: 0, preservePitch: 1 }, { speed: 1, pitch: 0 }, { ...NEUTRAL, buffer: [] }]) {
      const bad = JSON.parse(S.serializeProject(S.defaultState())); bad.state.master.playback = settings;
      const before = JSON.stringify(bad); assert.throws(() => S.parseProject(JSON.stringify(bad)), /playback|invalid/i); assert.equal(JSON.stringify(bad), before);
    }
  });
  await check('Changing master speed or pitch leaves nominal freeze fingerprints and retained source audio valid', () => {
    const input = fixture(release), original = S.freezeFingerprint(input.state, input.trackId), frozen = project.freeze(release, input);
    for (const settings of [{ speed: .5, pitch: 0, preservePitch: true }, { speed: 1, pitch: 7, preservePitch: true }, { speed: .75, pitch: -4, preservePitch: false }]) {
      const s = S.copy(frozen.state); s.master.playback = settings;
      assert.equal(S.freezeFingerprint(s, input.trackId), original); assert(S.freezeValid(s, input.trackId));
      const opened = S.parseProject(S.serializeProject(s)); assert(S.freezeValid(opened, input.trackId));
      assert.deepEqual(plain(opened.freezeAssets), plain(frozen.state.freezeAssets)); assert.equal(opened.assets[0].pcm, input.state.assets[0].pcm);
    }
  });
  await check('The normal engine remains sample-exact and master transform settings never enter nominal track processing', () => {
    const input = fixture(release), reference = runCore(release, input);
    for (const settings of [{ speed: .25, pitch: 19, preservePitch: true }, { speed: 2, pitch: -24, preservePitch: false }]) {
      const altered = { ...input, state: S.copy(input.state) }; altered.state.master.playback = settings;
      const actual = runCore(release, altered); assert.deepEqual(actual.left, reference.left); assert.deepEqual(actual.right, reference.right);
    }
    evidence.nominalPcm = q.hash([reference.left, reference.right]);
  });
  await check('Float master capture includes tracks returns mastering and automation without an intermediate PCM16 conversion', async () => {
    const input = fixture(release, 48000), audio = new release.scope.LoomAudio(input.state, input.assets);
    try {
      const options = { startBeat: .5, endBeat: 3.5, tailSeconds: .15 }, expected = runCore(release, input, options);
      const actual = await audio.renderMasterPCM(input.state, input.assets, options);
      assert.equal(actual.sampleRate, 48000); assert.equal(actual.frames, expected.frames); assert.equal(actual.bodyFrames, expected.bodyFrames); assert.equal(actual.tailFrames, expected.tailFrames);
      for (const key of ['left', 'right']) assert(q.difference(actual[key], expected[key]).max < 3e-7, key + ' nominal float capture differs');
      assert(actual.left.some(value => Math.abs(value * 32768 - Math.round(value * 32768)) > .01), 'Float render was quantized to PCM16');
      const altered = S.copy(input.state); altered.master.playback = { speed: .5, pitch: 12, preservePitch: false };
      const again = await audio.renderMasterPCM(altered, input.assets, options); assert.deepEqual(again.left, actual.left); assert.deepEqual(again.right, actual.right);
      evidence.floatCapture = { frames: actual.frames, pcm: q.hash([actual.left, actual.right]), maxError: q.difference(actual.left, expected.left).max };
    } finally { await audio.dispose(); }
  });
  await check('Preview loop capture warms one cycle and returns precisely one nominal body without a tail', async () => {
    const input = fixture(release, 48000), audio = new release.scope.LoomAudio(input.state, input.assets), startBeat = .5, endBeat = 2.5;
    try {
      const actual = await audio.renderMasterPCM(input.state, input.assets, { previewLoop: true, startBeat, endBeat, tailSeconds: 8 });
      const frames = Math.round((endBeat - startBeat) * 60 / input.state.tempo * 48000);
      assert.equal(actual.frames, frames); assert.equal(actual.bodyFrames, frames); assert.equal(actual.tailFrames, 0); assert.equal(actual.startBeat, startBeat); assert.equal(actual.endBeat, endBeat); q.finite([actual.left, actual.right]);
      const cold = await audio.renderMasterPCM(input.state, input.assets, { startBeat, endBeat, tailSeconds: 0 });
      assert(q.difference(actual.left, cold.left).rms > 1e-6, 'Warm shared return history should be audible');
      evidence.previewLoop = { frames, warmDifference: q.difference(actual.left, cold.left).rms };
    } finally { await audio.dispose(); }
  });
  await check('Nominal WAV exports retain their original length and quantize the captured master only once', async () => {
    const input = fixture(release, 48000), audio = new release.scope.LoomAudio(input.state, input.assets), options = { startBeat: 0, endBeat: 4, tailSeconds: .125 };
    try {
      const pcm = await audio.renderMasterPCM(input.state, input.assets, options), bytes = Buffer.from(await (await audio.renderWav(input.state, input.assets, options)).arrayBuffer());
      assert.equal(bytes.readUInt32LE(24), pcm.sampleRate); assert.equal(bytes.length, 44 + pcm.frames * 4);
      let maxError = 0; for (let i = 0; i < pcm.frames; i++) for (let channel = 0; channel < 2; channel++) maxError = Math.max(maxError, Math.abs(bytes.readInt16LE(44 + (i * 2 + channel) * 2) / 32768 - pcm[channel ? 'right' : 'left'][i]));
      assert(maxError <= 1 / 32768 + 1e-7); evidence.wav = { frames: pcm.frames, bytes: bytes.length, maxError };
    } finally { await audio.dispose(); }
  });
  await controllerChecks({ release, check, evidence });
  console.log(passed.length + ' master playback integration groups passed.'); console.log(JSON.stringify(evidence)); return { passed, evidence };
}
module.exports = { run, fixture, runCore, loadController, controllerFixture, deferred, tick, NEUTRAL };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
