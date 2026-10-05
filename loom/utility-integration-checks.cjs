'use strict';

// Exercise the shipped rack and its generated Worklet module, not a separate
// utility approximation. Real Chromium audio is covered by utility-browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const passed = [];
const plain = value => JSON.parse(JSON.stringify(value));

function load() {
  const scope = { Blob, DOMException, TextEncoder, Math, Number, Map, Set, Promise, setTimeout, navigator: {}, crypto: webcrypto,
    btoa: value => Buffer.from(value, 'binary').toString('base64'), atob: value => Buffer.from(value, 'base64').toString('binary') };
  scope.window = scope;
  vm.createContext(scope);
  const shared = fs.existsSync(path.join(__dirname, 'shared', 'pattern-schema.js')) ? path.join(__dirname, 'shared', 'pattern-schema.js') : path.join(__dirname, '..', 'shared', 'pattern-schema.js');
  vm.runInContext(fs.readFileSync(shared, 'utf8'), scope, { filename: 'pattern-schema.js' });
  for (const name of ['vocal-catalog.js', 'utility-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'effects.js', 'schema.js', 'audio-engine.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, name), 'utf8'), scope, { filename: name });
  }
  return scope;
}
function session(scope, params) {
  const state = scope.LoomSchema.defaultState();
  state.tempo = 120; state.lengthBars = 1; state.loopEnabled = false; state.master.level = 1;
  state.tracks.forEach(track => { track.level = 1; track.instrumentLive = false; });
  if (params) state.tracks[0].effects[0] = { type: 'scales', bypass: false, params: scope.createLoomUtilityDSP().normalize(params) };
  return state;
}
function stereo(at, n, rate = 48000, amplitude = .17) {
  const left = Float32Array.from({ length: n }, (_, f) => amplitude * Math.sin(2 * Math.PI * 110 * (at + f) / rate) + .025 * Math.cos(2 * Math.PI * 781 * (at + f) / rate));
  const right = Float32Array.from(left, (value, f) => value * -.7 + .04 * Math.sin(2 * Math.PI * 157 * (at + f) / rate));
  return [left, right];
}
function inputs(pair, destination = 8) {
  const result = Array.from({ length: 9 }, () => []); result[destination] = pair; return result;
}
function block(core, pair) {
  const left = new Float32Array(pair[0].length), right = new Float32Array(pair[0].length);
  core.processBlock(left, right, inputs(pair)); return [left, right];
}
function core(scope, state, options) {
  const instance = new (scope.createLoomEngineDSP(scope.createLoomEffectsDSP).Core)(state, {}, 48000, options);
  instance.setMicrophoneMonitor(0, true); return instance;
}
async function check(name, run) { await run(); passed.push(name); }

function installWorkletHarness(scope) {
  const blobs = new Map(), harness = { scope: null, processor: null, moduleSource: '' };
  scope.URL = { createObjectURL(blob) { const id = 'blob:qa-' + blobs.size; blobs.set(id, blob); return id; }, revokeObjectURL(id) { blobs.delete(id); } };
  class GraphNode { connect() { return this; } disconnect() {} }
  class FakeContext {
    constructor() {
      this.sampleRate = 48000; this.state = 'running'; this.currentTime = 0; this.baseLatency = .002; this.destination = new GraphNode();
      this.audioWorklet = { addModule: async url => {
        harness.moduleSource = await blobs.get(url).text();
        class Processor { constructor() { this.port = { postMessage: message => harness.node?.port.onmessage?.({ data: message }) }; } }
        const worklet = { sampleRate: this.sampleRate, currentTime: 0, AudioWorkletProcessor: Processor,
          registerProcessor: (name, implementation) => { assert.equal(name, 'loom-eight-track'); harness.Implementation = implementation; } };
        vm.createContext(worklet); vm.runInContext(harness.moduleSource, worklet, { filename: 'generated-loom-worklet.js' }); harness.scope = worklet;
      } };
    }
    createGain() { return new GraphNode(); }
    async resume() { this.state = 'running'; }
    async close() { this.state = 'closed'; }
  }
  class WorkletNode extends GraphNode {
    constructor(context, name, options) {
      super(); assert.equal(name, 'loom-eight-track'); assert.equal(options.numberOfInputs, 9); assert.deepEqual(plain(options.outputChannelCount), [2]);
      harness.node = this; this.context = context; harness.processor = new harness.Implementation(options);
      this.port = { postMessage: message => harness.processor.port.onmessage({ data: message }), close() {} };
    }
  }
  scope.AudioContext = FakeContext; scope.AudioWorkletNode = WorkletNode;
  harness.process = pair => {
    const output = [new Float32Array(pair[0].length), new Float32Array(pair[0].length)];
    harness.scope.currentTime = harness.node.context.currentTime;
    harness.processor.process(inputs(pair), [output]); harness.node.context.currentTime += pair[0].length / 48000;
    return output;
  };
  return harness;
}

(async () => {
  const scope = load(), effects = scope.createLoomEffectsDSP(), utility = scope.createLoomUtilityDSP(), S = scope.LoomSchema;
  await check('SCALES delegates its exact catalog contract and serializes without ambient factories', () => {
    const definition = scope.LoomEffectsCatalog.find(item => item.id === 'scales');
    assert(definition, 'The utility is available in the actual insert catalog.');
    assert.deepEqual(plain(effects.specifications.scales), plain(utility.specifications));
    assert.deepEqual(plain(effects.normalize('scales', definition.defaults)), plain(utility.normalize(definition.defaults)));
    const isolated = {};
    vm.createContext(isolated);
    vm.runInContext(`const makeUtility=${scope.createLoomUtilityDSP.toString()}; const makeEffects=${scope.createLoomEffectsDSP.toString()}; globalThis.rack=makeEffects(null,makeUtility);`, isolated);
    const pair = stereo(0, 257), before = pair.map(channel => channel.slice());
    isolated.rack.create('scales', 48000, {}).process(...pair);
    assert.deepEqual(pair, before, 'Tuner analysis must be sample-transparent in the serialized rack.');
    assert.equal(isolated.rack.create('scales', 48000, {}).getTailTime(), 0);
    assert.equal(Object.keys(effects.specifications).length, 11);
  });

  await check('The stopped microphone rack is byte-identical with default SCALES or no insert', () => {
    const plainCore = core(scope, session(scope)), utilityCore = core(scope, session(scope, {}));
    for (let at = 0; at < 24000; at += 128) assert.deepEqual(block(utilityCore, stereo(at, 128)), block(plainCore, stereo(at, 128)));
    const meter = utilityCore.getMeters().effects[0][0];
    assert.equal(meter.type, 'scales'); assert(meter.inputDb > -40); assert(meter.detectedHz > 0); assert.equal(meter.bypass, false);
    assert.equal(utilityCore.tracks.length, 8); assert(utilityCore.slots.every(row => row.length === 4));
  });

  await check('Meter reset preserves active filters, pitch analysis, project state and audio history', () => {
    const state = session(scope, { dc: 'on', highpass: 'on', lowcut: 55, lowpass: 'on', highcut: 6200, monoBass: 'on', width: 1.4, input: 8 });
    const a = core(scope, state), b = core(scope, state), before = S.serializeProject(state);
    for (let at = 0; at < 24000; at += 128) { const pair = stereo(at, 128, 48000, .6); assert.deepEqual(block(a, pair), block(b, pair)); }
    const pre = plain(a.getMeters().effects[0][0]);
    assert.equal(a.resetEffectMeters('track-1', 0), true);
    const post = plain(a.getMeters().effects[0][0]);
    assert.equal(post.holdLeftDb, -120); assert.equal(post.holdRightDb, -120); assert.equal(post.clipLeft, false); assert.equal(post.clipRight, false);
    for (const key of ['detectedHz', 'confidence', 'correlation', 'dcLeft', 'dcRight']) assert.equal(post[key], pre[key], key + ' is not a held peak.');
    assert.equal(S.serializeProject(state), before);
    for (let at = 24000; at < 32000; at += 137) assert.deepEqual(block(a, stereo(at, 137)), block(b, stereo(at, 137)));
    for (const [track, slot] of [['missing', 0], [8, 0], [0, -1], [0, 4], [0, .5], [0, 1]]) assert.equal(a.resetEffectMeters(track, slot), false);
  });

  await check('Rack bypass is exact, and SCALES mute/guard retain track mixer authority', () => {
    const state = session(scope, { input: 24, mode: 'mono', guard: 'on', ceiling: -6, mute: 'on' });
    const muted = core(scope, state);
    for (let at = 0; at < 2048; at += 128) assert(block(muted, stereo(at, 128)).every(channel => channel.every(value => value === 0)));
    state.tracks[0].effects[0].bypass = true;
    const bypass = core(scope, state), dry = core(scope, session(scope));
    for (let at = 0; at < 4096; at += 128) assert.deepEqual(block(bypass, stereo(at, 128)), block(dry, stereo(at, 128)));
    assert.equal(bypass.getMeters().effects[0][0].bypass, true);
    state.tracks[0].effects[0].bypass = false; state.tracks[0].effects[0].params.mute = 'off';
    const guarded = core(scope, state);
    for (let at = 0; at < 4096; at += 128) assert(block(guarded, stereo(at, 128)).every(channel => channel.every(value => Math.abs(value) <= 10 ** (-6 / 20) + 1e-6)));
    state.tracks[0].mute = true;
    assert(block(core(scope, state), stereo(0, 128)).every(channel => channel.every(value => value === 0)));
  });

  await check('SCALES parameters and typed automation survive portable eight-track projects', () => {
    const state = session(scope, { tuning: 'bass5', target: 'manual', targetNote: 23, reference: 442.1, width: .73, polarity: 'right', guard: 'on' });
    state.tracks[0].automation = [{ target: 'fx:0:output', effectType: 'scales', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: -6 }, { beat: 4, value: 3 }] }];
    const serialized = S.serializeProject(state), restored = S.parseProject(serialized);
    assert.equal(S.serializeProject(restored), serialized); assert.equal(restored.tracks[0].effects[0].params.targetNote, 23);
    assert(S.automationTargets(restored.tracks[0]).some(item => item.target === 'fx:0:reference'));
    assert.equal(restored.tracks[0].automation[0].effectType, 'scales'); assert.equal(restored.tracks.length, 8); assert(restored.tracks.every(track => track.effects.length === 4));
    const a = core(scope, restored, { linear: true }), b = core(scope, restored, { linear: true });
    a.start(0); b.start(0);
    const leftA = [], rightA = [], leftB = [], rightB = [];
    for (const [instance, size, left, right] of [[a, 128, leftA, rightA], [b, 2048, leftB, rightB]]) {
      for (let at = 0; at < 8192; at += size) { const out = block(instance, stereo(at, size)); left.push(...out[0]); right.push(...out[1]); }
    }
    assert.deepEqual(leftA, leftB); assert.deepEqual(rightA, rightB);
  });

  await check('Public fallback meter reset is narrow and does not move transport or mutate parameters', () => {
    const state = session(scope, {}), engine = new scope.LoomAudio(state), instance = core(scope, state);
    engine.mode = 'fallback'; engine.core = instance; engine.context = { currentTime: .5, sampleRate: 48000 };
    block(instance, stereo(0, 128, 48000, 2)); engine._acceptMeters(instance.getMeters(), engine._transportEpoch, .5);
    const before = S.serializeProject(state), epoch = engine._transportEpoch;
    assert.equal(engine.resetEffectMeters('track-1', 0), true); assert.equal(engine.getMeters().effects[0][0].holdLeftDb, -120);
    assert.equal(engine._transportEpoch, epoch); assert.equal(S.serializeProject(state), before);
    assert.equal(engine.resetEffectMeters('track-2', 0), false); assert.equal(engine.resetEffectMeters('track-1', 4), false);
  });

  await check('The actual generated Worklet installs SCALES and returns live tuner meters without fallback', async () => {
    const harness = installWorkletHarness(scope), state = session(scope, {}), engine = new scope.LoomAudio(state);
    await engine.init(); assert.equal(engine.mode, 'worklet'); assert.equal(engine.workletError, undefined);
    assert.equal(harness.scope.createLoomUtilityDSP, undefined, 'The Worklet cannot obtain a main-thread ambient global.');
    engine._send({ type: 'microphoneMonitor', track: 0, enabled: true });
    const reference = core(scope, state);
    for (let at = 0; at < 48000; at += 128) assert.deepEqual(harness.process(stereo(at, 128)), block(reference, stereo(at, 128)));
    const meter = engine.getMeters().effects[0][0]; assert.equal(meter.type, 'scales'); assert(meter.detectedHz > 0); assert(meter.confidence > 0);
    const before = S.serializeProject(state), epoch = engine._transportEpoch;
    assert.equal(engine.resetEffectMeters('track-1', 0), true);
    assert.equal(engine.getMeters().effects[0][0].holdLeftDb, -120); assert.equal(engine.getMeters().effects[0][0].detectedHz, meter.detectedHz);
    assert.equal(S.serializeProject(state), before); assert.equal(engine._transportEpoch, epoch);
    engine.panic(); assert.equal(harness.processor.core.silent, true); assert(harness.process(stereo(48000, 128)).every(channel => channel.every(value => value === 0)));
    await engine.dispose();
  });

  await check('Offline WAV remains byte-identical with the tuner enabled, disabled, or absent', async () => {
    const source = stereo(0, 12000), asset = { sampleRate: 48000, left: source[0], right: source[1] }, assets = new Map([['tone', asset]]);
    const dry = session(scope); dry.tracks[0].clips = [{ assetId: 'tone', start: 0, length: .5, sourceStart: 0, sourceEnd: .25, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: 1, fadeIn: 0, fadeOut: 0 }];
    const enabled = S.copy(dry), disabled = S.copy(dry); enabled.tracks[0].effects[0] = { type: 'scales', params: utility.normalize({}) }; disabled.tracks[0].effects[0] = { type: 'scales', params: utility.normalize({ tuner: 'off' }) };
    const engine = new scope.LoomAudio(dry), options = { endBeat: .4 };
    const buffers = [];
    for (const state of [dry, enabled, disabled]) buffers.push(Buffer.from(await (await engine.renderWav(state, assets, options)).arrayBuffer()));
    assert.deepEqual(buffers[0], buffers[1]); assert.deepEqual(buffers[1], buffers[2]);
    assert.equal(buffers[0].toString('ascii', 0, 4), 'RIFF'); assert.equal(buffers[0].readUInt32LE(24), 48000); assert.equal(buffers[0].length, 44 + 9600 * 4);
  });

  for (const name of passed) console.log('PASS', name);
  console.log(`${passed.length} SCALES integration checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
