'use strict';

// Hardware-independent checks for device negotiation, atomic audio restarts,
// recording guards and the distinction between reported and unknown latency.
// Physical driver latency is deliberately left to the browser diagnostics.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const passed = [];

function fixture(options = {}) {
  const contexts = [], streams = [], requests = [], storage = new Map();
  const control = { sinkError: null, permissionError: null, permissionDeferred: null, resumeDeferred: null, rejectRate: null };
  class Node {
    constructor(context, type, channels) { this.context = context; this.type = type; this.channels = channels; this.connections = []; this.gain = { value: 1, setValueAtTime: value => { this.gain.value = value; } }; }
    connect(target, output = 0, input = 0) { this.connections.push({ target, output, input }); return target; }
    disconnect() { this.connections = []; this.disconnected = true; }
  }
  class Context {
    constructor(settings = {}) {
      if (settings.sampleRate === control.rejectRate) throw Error('Unsupported sample rate');
      this.settings = settings; this.sampleRate = settings.sampleRate || 48000; this.currentTime = 0; this.state = 'suspended'; this.baseLatency = options.unknownLatency ? undefined : .003; this.outputLatency = options.unknownLatency ? undefined : .005;
      this.destination = new Node(this, 'destination'); this.nodes = []; contexts.push(this);
    }
    make(type, channels) { const node = new Node(this, type, channels); this.nodes.push(node); return node; }
    createGain() { return this.make('gain'); }
    createChannelSplitter(channels) { return this.make('splitter', channels); }
    createChannelMerger(channels) { return this.make('merger', channels); }
    createMediaStreamSource(stream) { const node = this.make('source'); node.stream = stream; return node; }
    createScriptProcessor(frames, inputs, outputs) { const node = this.make('processor', inputs); node.bufferSize = frames; node.outputs = outputs; return node; }
    async setSinkId(deviceId) { if (control.sinkError && deviceId !== 'default' && deviceId !== '') throw control.sinkError; this.sinkId = deviceId; }
    async resume() { if (control.resumeDeferred) await new Promise(resolve => { control.resumeDeferred.resolve = resolve; }); this.state = 'running'; }
    async close() { this.state = 'closed'; }
  }
  if (options.sinkUnsupported) Context.prototype.setSinkId = undefined;
  function makeStream() {
    const track = { readyState: 'live', label: 'Test interface', stop() { this.readyState = 'ended'; }, addEventListener() {}, getSettings: () => ({ channelCount: options.mono ? 1 : 2, sampleRate: 48000, ...(options.unknownLatency ? {} : { latency: .008 }), deviceId: 'interface-input' }) };
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] }; streams.push(stream); return stream;
  }
  const devices = [{ kind: 'audioinput', deviceId: 'default', label: 'Default input', groupId: 'default' }, { kind: 'audioinput', deviceId: 'interface-input', label: 'Test interface input', groupId: 'interface' }, { kind: 'audiooutput', deviceId: 'default', label: 'Default output', groupId: 'default' }, { kind: 'audiooutput', deviceId: 'interface-output', label: 'Test interface output', groupId: 'interface' }];
  const scope = { Blob, DOMException, TextEncoder, Math, Number, Map, Set, Promise, setTimeout, clearTimeout, performance: { now: () => 10000 }, URL, AudioContext: Context, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) }, navigator: { mediaDevices: { getSupportedConstraints: () => ({ deviceId: true, channelCount: true, sampleRate: true, latency: true }), enumerateDevices: async () => devices, getUserMedia: async constraints => { requests.push(constraints); if (control.permissionError) throw control.permissionError; if (control.permissionDeferred) await new Promise(resolve => { control.permissionDeferred.resolve = resolve; }); return makeStream(); } } } };
  scope.window = scope; vm.createContext(scope);
  for (const filename of ['vocal-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'effects.js', 'schema.js', 'audio-engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, filename), 'utf8'), scope, { filename });
  const state = scope.LoomSchema.defaultState(); state.loopEnabled = false; const engine = new scope.LoomAudio(state);
  return { scope, state, engine, contexts, streams, requests, storage, control, makeStream };
}
async function check(name, run) { await run(); passed.push(name); }
function plain(value) { return JSON.parse(JSON.stringify(value)); }

(async () => {
  await check('Automatic rate avoids forced resampling; Live requests low latency and uses a 256-frame fallback', async () => {
    const f = fixture(); await f.engine.init(); const settings = f.engine.getAudioSettings();
    assert.equal(settings.sampleRate, 'auto'); assert.equal(settings.latencyProfile, 'live'); assert.equal(settings.inputChannel, 'stereo');
    assert.equal(Object.hasOwn(f.contexts[0].settings, 'sampleRate'), false); assert.equal(f.contexts[0].settings.latencyHint, .001); assert.equal(f.engine.node.bufferSize, 256);
    const diagnostics = f.engine.getAudioDiagnostics(); assert.equal(diagnostics.sampleRate, 48000); assert.equal(diagnostics.processingFrames, 256); assert(Math.abs(diagnostics.processingMs - 256 / 48) < 1e-7); await f.engine.dispose();
  });
  await check('Latency profiles negotiate independently from sample rate and expose their actual fallback quantum', async () => {
    for (const [profile, hint, frames] of [['live', .001, 256], ['balanced', 'interactive', 512], ['stable', 'balanced', 1024]]) {
      const f = fixture(); await f.engine.applyAudioSettings({ latencyProfile: profile, sampleRate: 44100 }); await f.engine.init();
      assert.equal(f.engine.context.settings.latencyHint, hint); assert.equal(f.engine.context.sampleRate, 44100); assert.equal(f.engine.node.bufferSize, frames); assert.equal(f.engine.getAudioDiagnostics().processingFrames, frames); await f.engine.dispose();
    }
  });
  await check('Invalid device, channel, rate and latency values reject without changing preferences', async () => {
    const f = fixture(), original = plain(f.engine.getAudioSettings());
    for (const value of [{ inputChannel: '3' }, { sampleRate: 192000 }, { sampleRate: NaN }, { latencyProfile: 'ultra' }, { inputDeviceId: {} }, { outputDeviceId: null }]) {
      assert.throws(() => f.engine.validateAudioSettings(value), /device|channel|rate|latency|settings|Choose/i); assert.deepEqual(plain(f.engine.getAudioSettings()), original);
    }
  });
  await check('Explicit input selection disables speech processing and requests two channels for interface jacks', async () => {
    const f = fixture(); await f.engine.applyAudioSettings({ inputDeviceId: 'interface-input', inputChannel: '2', sampleRate: 48000 });
    await f.engine.setMicrophoneMonitoring('track-1', { enabled: true }); const request = f.requests.at(-1).audio;
    assert.deepEqual(plain(request.deviceId), { exact: 'interface-input' }); assert.equal(request.echoCancellation, false); assert.equal(request.noiseSuppression, false); assert.equal(request.autoGainControl, false); assert.equal(request.channelCount.ideal, 2); assert.equal(request.latency.ideal, 0);
    const source = f.engine._mic.source, splitter = source.connections[0].target, merger = splitter.connections[0].target;
    assert.equal(splitter.type, 'splitter'); assert.equal(merger.type, 'merger'); assert.equal(merger.channels, 2);
    assert.deepEqual(splitter.connections.map(c => [c.output, c.input]), [[1, 0], [1, 1]], 'Interface channel 2 is duplicated to both monitor and dry-capture sides.');
    assert.equal(f.engine.getAudioDiagnostics().actualInputChannel, '2'); await f.engine.dispose(); assert(f.streams.every(s => s.getTracks().every(t => t.readyState === 'ended')));
  });
  await check('A mono device cannot silently substitute channel 1 for an unavailable channel 2', async () => {
    const f = fixture({ mono: true }); await f.engine.applyAudioSettings({ inputChannel: '2' });
    await assert.rejects(f.engine.setMicrophoneMonitoring('track-1', { enabled: true }), /channel 2|second.*channel|only.*channel|one channel/i);
    assert.equal(f.engine.getMicrophoneStatus().active, false); assert.equal(f.engine.recordingBusy, false); assert(f.streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))); await f.engine.dispose();
  });
  await check('Device-list permission probes release hardware immediately and never start monitoring', async () => {
    const f = fixture(), result = await f.engine.enumerateAudioDevices({ requestPermission: true });
    assert(result.inputs.some(d => d.deviceId === 'interface-input')); assert(result.outputs.some(d => d.deviceId === 'interface-output')); assert.equal(result.outputSelectionSupported, true);
    assert(f.streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))); assert.equal(f.engine.getMicrophoneStatus().active, false); assert.equal(f.engine.getMicrophoneStatus().enabled, false);
    assert.equal(f.engine.recordingBusy, false);
  });
  await check('Audio settings reject playing, recording, preparation, permission and uncommitted capture without closing audio', async () => {
    const f = fixture(); await f.engine.init(); const context = f.engine.context;
    const guards = [() => { f.engine._meters.playing = true; return () => { f.engine._meters.playing = false; }; }, () => { f.engine.isRecording = true; return () => { f.engine.isRecording = false; }; }, () => { f.engine._recordPreparing = true; return () => { f.engine._recordPreparing = false; }; }, () => { f.engine._micPending = true; return () => { f.engine._micPending = false; }; }, () => { f.engine._stopPromise = Promise.resolve(); return () => { f.engine._stopPromise = null; }; }, () => { f.engine._chunks.set(0, []); return () => f.engine._chunks.clear(); }];
    for (const guard of guards) { const reset = guard(); await assert.rejects(f.engine.applyAudioSettings({ sampleRate: 44100 }), /stop|finish|record|take|busy|playing|pending/i); reset(); assert.equal(f.engine.context, context); assert.notEqual(context.state, 'closed'); }
    await f.engine.dispose();
  });
  await check('Sink permission failure preserves the previous usable graph and preferences', async () => {
    const f = fixture(); await f.engine.init(); const old = f.engine.context, settings = plain(f.engine.getAudioSettings()); f.control.sinkError = new DOMException('Output denied', 'NotAllowedError'); let callback = 0;
    await assert.rejects(f.engine.applyAudioSettings({ outputDeviceId: 'interface-output', sampleRate: 44100 }, { beforeRestart: () => { callback++; } }), /denied/i);
    assert.equal(callback, 0); assert.equal(f.engine.context, old); assert.notEqual(old.state, 'closed'); assert.deepEqual(plain(f.engine.getAudioSettings()), settings); assert(f.contexts.slice(1).every(c => c.state === 'closed')); await f.engine.dispose();
  });
  await check('A host-detach failure leaves the original audio graph and monitor usable', async () => {
    const f = fixture(); await f.engine.init(); await f.engine.setMicrophoneMonitoring('track-1', { enabled: true }); const old = f.engine.context, node = f.engine.node, settings = plain(f.engine.getAudioSettings());
    await assert.rejects(f.engine.applyAudioSettings({ sampleRate: 44100 }, { beforeRestart: async () => { throw Error('Host refused to detach'); } }), /refused/i);
    assert.equal(f.engine.context, old); assert.equal(f.engine.node, node); assert.notEqual(old.state, 'closed'); assert.deepEqual(plain(f.engine.getAudioSettings()), settings); assert.equal(f.engine.getMicrophoneStatus().enabled, true); assert(f.contexts.slice(1).every(c => c.state === 'closed')); await f.engine.dispose();
  });
  await check('A requested unsupported sample rate falls back explicitly to the available hardware rate', async () => {
    const f = fixture(); f.control.rejectRate = 96000; await f.engine.applyAudioSettings({ sampleRate: 96000 }); const d = f.engine.getAudioDiagnostics();
    assert.equal(f.engine.getAudioSettings().sampleRate, 96000); assert.equal(d.sampleRate, 48000); assert.equal(d.sampleRateFallback, true); await f.engine.dispose();
  });
  await check('Pending playback prevents restart before the context has resumed', async () => {
    const f = fixture(); await f.engine.init(); f.control.resumeDeferred = {}; const playing = f.engine.play(0); while (!f.control.resumeDeferred.resolve) await new Promise(resolve => setImmediate(resolve));
    const old = f.engine.context; await assert.rejects(f.engine.applyAudioSettings({ sampleRate: 44100 }), /stop.*playback/i); assert.equal(f.engine.context, old);
    f.engine.stop(); f.control.resumeDeferred.resolve(); assert.equal(await playing, false); assert.equal(f.engine.getTransport().playing, false); f.control.resumeDeferred = null; await f.engine.dispose();
  });
  await check('Permission discovery excludes a concurrent restart and monitor, and releases late hardware', async () => {
    const f = fixture(); await f.engine.init(); f.control.permissionDeferred = {}; const access = f.engine.enumerateAudioDevices({ requestPermission: true }); while (!f.control.permissionDeferred.resolve) await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(f.engine.applyAudioSettings({ sampleRate: 44100 }), /wait|operation|interface/i); await assert.rejects(f.engine.setMicrophoneMonitoring('track-1', { enabled: true }), /setting|interface/i);
    f.engine.panic(); f.control.permissionDeferred.resolve(); await access; assert(f.streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))); assert.equal(f.engine.getMicrophoneStatus().active, false); assert.equal(f.engine.getAudioDiagnostics().deviceAccessPending, false); await f.engine.dispose();
  });
  await check('Settings application excludes a second apply and new playback until its callback completes', async () => {
    const f = fixture(); await f.engine.init(); let release, entered = false; const apply = f.engine.applyAudioSettings({ sampleRate: 44100 }, { beforeRestart: () => new Promise(resolve => { entered = true; release = resolve; }) }); while (!entered) await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(f.engine.applyAudioSettings({ sampleRate: 96000 }), /wait|operation|interface/i); await assert.rejects(f.engine.play(0), /setting|interface/i); release(); await apply; assert.equal(f.engine.context.sampleRate, 44100); assert.equal(f.engine.getTransport().playing, false); await f.engine.dispose();
  });
  await check('Asynchronous export protects the live graph and releases its lock after cancellation', async () => {
    const f = fixture(); await f.engine.init(); const abort = new AbortController(), exportPromise = f.engine.renderWav(f.state, f.engine.assets, { endBeat: 8, signal: abort.signal });
    assert.equal(f.engine.getAudioDiagnostics().exportBusy, true); await assert.rejects(f.engine.applyAudioSettings({ sampleRate: 44100 }), /finish.*export/i); abort.abort(); await assert.rejects(exportPromise, /abort/i); assert.equal(f.engine.getAudioDiagnostics().exportBusy, false); await f.engine.applyAudioSettings({ sampleRate: 44100 }); assert.equal(f.engine.context.sampleRate, 44100); await f.engine.dispose();
  });
  await check('Unsupported output routing is explicit while default playback remains usable', async () => {
    const f = fixture({ sinkUnsupported: true }); await f.engine.init(); const old = f.engine.context;
    assert.equal(f.engine.getAudioDiagnostics().outputSelectionSupported, false); await assert.rejects(f.engine.applyAudioSettings({ outputDeviceId: 'interface-output' }), /output|support/i);
    assert.equal(f.engine.context, old); assert.equal(await f.engine.play(0), true); f.engine.stop(); await f.engine.dispose();
  });
  await check('Restart retains song, assets, transport listeners and the stopped playback position', async () => {
    const f = fixture(); await f.engine.init(); f.engine.seek(7.25); f.state.tracks[2].name = 'Do not lose this'; const asset = { left: new Float32Array([.2, -.2]), right: new Float32Array([.1, -.1]), sampleRate: 48000 }; f.engine.setAssets(new Map([['saved-pcm', asset]]));
    let notifications = 0; f.engine.subscribeTransport(() => notifications++); const before = plain(f.state), old = f.engine.context; let callback = 0;
    const result = await f.engine.applyAudioSettings({ sampleRate: 96000, inputDeviceId: 'interface-input' }, { beforeRestart: async () => { callback++; assert.equal(f.engine.context, old); assert.notEqual(old.state, 'closed'); } });
    assert.equal(result.restarted, true); assert.equal(callback, 1); assert.equal(old.state, 'closed'); assert.equal(f.engine.context.sampleRate, 96000); assert.deepEqual(plain(f.engine.state), before); assert.equal(f.engine.assets.get('saved-pcm'), asset); assert(Math.abs(f.engine.getTransport().beat - 7.25) < 1e-8); assert.equal(f.engine._transportListeners.size, 1); assert(notifications > 0); await f.engine.dispose();
  });
  await check('Unknown driver timing stays unknown rather than becoming a fictional zero-millisecond round trip', async () => {
    const f = fixture({ unknownLatency: true }); await f.engine.init(); await f.engine.setMicrophoneMonitoring('track-1', { enabled: true }); const result = f.engine.getAudioDiagnostics();
    assert.equal(result.captureLatencyMs, null); assert.equal(result.baseLatencyMs, null); assert.equal(result.outputLatencyMs, null); assert.equal(result.roundTripComplete, false); assert.equal(result.estimatedRoundTripMs, null); assert(result.processingMs > 0); await f.engine.dispose();
  });
  await check('Incomplete latency estimates contain only reported terms, with render granularity reported separately', async () => {
    const f = fixture(); await f.engine.init(); const noInput = f.engine.getAudioDiagnostics(); assert.equal(noInput.captureLatencyMs, null); assert.equal(noInput.roundTripComplete, false); assert.equal(noInput.estimatedRoundTripMs, 8);
    await f.engine.setMicrophoneMonitoring('track-1', { enabled: true }); const complete = f.engine.getAudioDiagnostics(); assert.equal(complete.roundTripComplete, true); assert.equal(complete.estimatedRoundTripMs, 16); assert.equal(complete.processingFrames, 256); assert(complete.processingMs > 5); await f.engine.dispose();
  });
  await check('Live BROILER emits an impulse in the same render block even with recording compensation active', async () => {
    const f = fixture(), DSP = f.scope.createLoomEngineDSP(f.scope.createLoomEffectsDSP), definition = f.scope.LoomEffectsCatalog.find(fx => fx.id === 'broiler');
    f.state.tracks[0].effects[0] = { type: 'broiler', params: { ...definition.defaults, cabinet: 'di', drive: 8, output: -12, stereo: 'mono' } };
    const core = new DSP.Core(f.state, {}, 48000); core.setMicrophoneMonitor(0, true); core.beginRecording({ microphone: { inputIndex: 8, compensationFrames: 4800 }, startTransport: false });
    const input = Array.from({ length: 9 }, () => [new Float32Array(128), new Float32Array(128)]); input[8][0][16] = .4; input[8][1][16] = .4;
    const left = new Float32Array(128), right = new Float32Array(128); core.processBlock(left, right, input);
    assert(left.subarray(0, 16).every(sample => sample === 0)); const first = left.findIndex(sample => Math.abs(sample) > 1e-6); assert(first >= 16 && first < 48, 'Live monitoring must not wait for an application block or the 100 ms recording-alignment window.'); assert(left.every(Number.isFinite)); assert(right.every(Number.isFinite));
  });
  await check('Device preferences persist locally while portable project data contains no hardware identities', async () => {
    const f = fixture(); await f.engine.applyAudioSettings({ inputDeviceId: 'interface-input', outputDeviceId: 'interface-output', inputChannel: '1', sampleRate: 48000, latencyProfile: 'balanced' });
    assert(f.storage.size > 0); const restored = new f.scope.LoomAudio(f.scope.LoomSchema.defaultState()); assert.equal(restored.getAudioSettings().inputDeviceId, 'interface-input'); assert.equal(restored.getAudioSettings().outputDeviceId, 'interface-output');
    const serialized = f.scope.LoomSchema.serializeProject(f.state); assert(!serialized.includes('interface-input')); assert(!serialized.includes('interface-output')); assert.equal(f.state.tracks.length, 8); assert(f.state.tracks.every(t => t.effects.length === 4)); await f.engine.dispose();
  });
  for (const name of passed) console.log('PASS', name);
  console.log(`${passed.length} audio interface checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
