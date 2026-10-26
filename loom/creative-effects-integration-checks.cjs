'use strict';

// The real rack, schema, offline renderer and generated AudioWorklet must all
// receive the same effect factories. This catches a working editor paired with
// a silent or missing insert in the separately serialized audio thread.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const passed = [];
const plain = value => JSON.parse(JSON.stringify(value));
const RATE = 48000;
const patches = {
  strainer: { cutoff: 750, resonance: .4, envAmount: 12, lfoAmount: 7, mix: 1 },
  swirl: { clock: 'free', rate: .1, depth: 0, center: 800, spread: 1, feedback: .3, stages: '8', mix: 1 },
  crumble: { bits: 4, sampleRate: 4000, jitter: .2, mix: 1, tone: 18000, output: 0 }
};
const meterKeys = { strainer: 'cutoffLHz', swirl: 'centerLeftHz', crumble: 'effectiveRateHz' };
function load() {
  const scope = { Blob, DOMException, TextEncoder, Math, Number, Map, Set, Promise, setTimeout, navigator: {}, crypto: webcrypto,
    btoa: value => Buffer.from(value, 'binary').toString('base64'), atob: value => Buffer.from(value, 'base64').toString('binary') };
  scope.window = scope; vm.createContext(scope);
  const shared = fs.existsSync(path.join(__dirname, 'shared', 'pattern-schema.js')) ? path.join(__dirname, 'shared', 'pattern-schema.js') : path.join(__dirname, '..', 'shared', 'pattern-schema.js');
  vm.runInContext(fs.readFileSync(shared, 'utf8'), scope, { filename: 'pattern-schema.js' });
  for (const file of ['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'effects.js', 'schema.js', 'audio-engine.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), scope, { filename: file });
  }
  return scope;
}
function source(at, frames) {
  const left = Float32Array.from({ length: frames }, (_, i) => .19 * Math.sin(2 * Math.PI * 131 * (at + i) / RATE) + .09 * Math.sin(2 * Math.PI * 1793 * (at + i) / RATE));
  const right = Float32Array.from({ length: frames }, (_, i) => .15 * Math.sin(2 * Math.PI * 227 * (at + i) / RATE) + .07 * Math.cos(2 * Math.PI * 3803 * (at + i) / RATE));
  return [left, right];
}
function stateFor(scope, id, patch = patches[id]) {
  const state = scope.LoomSchema.defaultState(); state.tempo = 120; state.lengthBars = 1; state.loopEnabled = false; state.master.level = 1;
  state.tracks.forEach(track => { track.level = 1; track.instrumentLive = false; });
  if (id) {
    const definition = scope.LoomEffectsCatalog.find(effect => effect.id === id);
    state.tracks[0].effects[0] = scope.LoomSchema.effect({ type: id, params: { ...definition.defaults, ...patch } });
  }
  return state;
}
function inputs(pair) { const result = Array.from({ length: 9 }, () => []); result[8] = pair; return result; }
function block(core, pair) {
  const output = [new Float32Array(pair[0].length), new Float32Array(pair[0].length)]; core.processBlock(...output, inputs(pair)); return output;
}
function core(scope, state) {
  const instance = new (scope.createLoomEngineDSP(scope.createLoomEffectsDSP).Core)(state, {}, RATE, { linear: true });
  instance.setMicrophoneMonitor(0, true); return instance;
}
function render(core, size = 128, frames = 12288) {
  const output = [new Float32Array(frames), new Float32Array(frames)];
  for (let at = 0; at < frames; at += size) {
    const pair = block(core, source(at, Math.min(size, frames - at)));
    output[0].set(pair[0], at); output[1].set(pair[1], at);
  }
  return output;
}
function difference(a, b) { let energy = 0; for (let i = 0; i < a.length; i++) energy += (a[i] - b[i]) ** 2; return Math.sqrt(energy / a.length); }
async function check(name, run) { await run(); passed.push(name); }

function workletHarness(scope) {
  const blobs = new Map(), harness = {};
  scope.URL = { createObjectURL(blob) { const id = 'blob:creative-qa-' + blobs.size; blobs.set(id, blob); return id; }, revokeObjectURL(id) { blobs.delete(id); } };
  class Node { connect() { return this; } disconnect() {} }
  class Context {
    constructor() {
      this.sampleRate = RATE; this.state = 'running'; this.currentTime = 0; this.baseLatency = .002; this.destination = new Node();
      this.audioWorklet = { addModule: async url => {
        harness.source = await blobs.get(url).text();
        class Processor { constructor() { this.port = { postMessage: message => harness.node?.port.onmessage?.({ data: message }) }; } }
        const isolated = { sampleRate: RATE, currentTime: 0, AudioWorkletProcessor: Processor,
          registerProcessor: (name, implementation) => { assert.equal(name, 'loom-eight-track'); harness.Implementation = implementation; } };
        vm.createContext(isolated); vm.runInContext(harness.source, isolated, { filename: 'generated-galley-creative-worklet.js' }); harness.scope = isolated;
      } };
    }
    createGain() { return new Node(); }
    async resume() { this.state = 'running'; }
    async close() { this.state = 'closed'; }
  }
  class WorkletNode extends Node {
    constructor(context, name, options) {
      super(); harness.node = this; this.context = context; harness.processor = new harness.Implementation(options);
      this.port = { postMessage: message => harness.processor.port.onmessage({ data: message }), close() {} };
    }
  }
  scope.AudioContext = Context; scope.AudioWorkletNode = WorkletNode;
  harness.process = pair => {
    const output = [new Float32Array(pair[0].length), new Float32Array(pair[0].length)];
    harness.scope.currentTime = harness.node.context.currentTime; harness.processor.process(inputs(pair), [output]); harness.node.context.currentTime += pair[0].length / RATE; return output;
  };
  return harness;
}

(async () => {
  const scope = load(), rack = scope.createLoomEffectsDSP(), S = scope.LoomSchema;
  await check('All creative inserts and recipes retain typed settings, groups, automation and portable projects', () => {
    for (const id of Object.keys(patches)) {
      const definition = scope.LoomEffectsCatalog.find(effect => effect.id === id);
      assert(definition && definition.groups?.length && definition.presets?.length, id + ' has a complete grouped editor and recipes');
      const grouped = new Set(definition.groups.flatMap(group => group.keys));
      assert(definition.params.every(param => grouped.has(param.key)), id + ' exposes every control in a group');
      assert.deepEqual(plain(rack.normalize(id, definition.defaults)), plain(definition.defaults), id + ' catalog and audio defaults agree');
      const target = definition.params.find(param => param.type === 'range' && param.key !== 'mix');
      for (const preset of definition.presets) {
        const state = stateFor(scope, id, preset.params); state.tracks[0].automation = [{ target: 'fx:0:' + target.key, effectType: id, enabled: true, interpolation: 'linear', points: [{ beat: 0, value: target.min }, { beat: 4, value: target.max }] }];
        const saved = S.serializeProject(state), restored = S.parseProject(saved);
        assert.equal(S.serializeProject(restored), saved); assert.deepEqual(plain(restored.tracks[0].effects[0].params), plain(preset.params));
        assert(S.automationTargets(restored.tracks[0]).some(item => item.effectType === id && item.target === 'fx:0:' + target.key));
        assert.equal(restored.tracks[0].automation[0].effectType, id); assert.equal(restored.tracks.length, 8); assert(restored.tracks.every(track => track.effects.length === 4));
      }
    }
  });
  await check('Real rack processing is audible, stereo, partition invariant and sample-exact when bypassed', () => {
    const dry = render(core(scope, stateFor(scope)));
    for (const id of Object.keys(patches)) {
      const state = stateFor(scope, id), a = render(core(scope, state)), b = render(core(scope, state), 193);
      assert.deepEqual(a, b, id + ' follows sample time rather than callback boundaries');
      assert(a.every(channel => channel.every(Number.isFinite)), id + ' produces finite rack audio');
      assert(difference(a[0], dry[0]) > .005, id + ' modifies actual output');
      assert(difference(a[0], a[1]) > .005, id + ' keeps useful stereo output');
      const key = id === 'strainer' ? 'cutoff' : id === 'swirl' ? 'center' : 'bits';
      const automated = S.copy(state); automated.tracks[0].automation = [{ target: 'fx:0:' + key, effectType: id, enabled: true, interpolation: 'hold', points: [{ beat: 0, value: patches[id][key] }, { beat: .125, value: id === 'crumble' ? 14 : 5000 }] }];
      const first = core(scope, automated), second = core(scope, automated); first.start(0); second.start(0);
      const moved = render(first), alternate = render(second, 193);
      assert.deepEqual(moved, alternate, id + ' typed automation follows the musical clock across different block sizes');
      assert(difference(moved[0].subarray(7000), a[0].subarray(7000)) > .001, id + ' automation changes rendered audio');
      state.tracks[0].effects[0].params.bypass = true;
      assert.deepEqual(render(core(scope, state)), dry, id + ' bypass is exact');
    }
  });
  await check('The actual generated Worklet receives all factories without ambient globals and matches main-thread DSP', async () => {
    for (const id of Object.keys(patches)) {
      const harness = workletHarness(scope), state = stateFor(scope, id), engine = new scope.LoomAudio(state);
      await engine.init(); assert.equal(engine.mode, 'worklet', engine.workletError?.message || id + ' unexpectedly fell back');
      assert.equal(harness.scope.createLoomFilterDSP, undefined); assert.equal(harness.scope.createLoomCreativeDSP, undefined);
      engine._send({ type: 'microphoneMonitor', track: 0, enabled: true });
      const reference = core(scope, state);
      for (let at = 0; at < 12288; at += 128) assert.deepEqual(harness.process(source(at, 128)), block(reference, source(at, 128)), id + ' Worklet audio matches the main rack');
      const meter = engine.getMeters().effects[0][0];
      assert.equal(meter.type, id); assert(Number.isFinite(meter[meterKeys[id]]) && meter[meterKeys[id]] > 0, id + ' actual Worklet telemetry is present');
      engine.panic(); assert(harness.process(source(0, 128)).every(channel => channel.every(value => value === 0)));
      await engine.dispose();
    }
  });
  await check('Offline WAV matches a separate 128-frame rack render and retains silence before the clip', async () => {
    const pair = source(0, 12000), encoded = S.encodeAsset({ id: 'creative-fixture', name: 'Creative fixture', left: pair[0], right: pair[1], sampleRate: RATE });
    for (const id of Object.keys(patches)) {
      const state = stateFor(scope, id); state.assets = [encoded];
      state.tracks[0].clips = [{ id: 'fixture', name: 'Fixture', assetId: encoded.id, start: .25, length: .5, sourceStart: 0, sourceEnd: .25, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: 1, fadeIn: 0, fadeOut: 0 }];
      const engine = new scope.LoomAudio(state), assets = S.decodeAssets(state.assets);
      const wav = Buffer.from(await (await engine.renderWav(state, assets, { snapshotReady: true, startBeat: 0, endBeat: 1, tailSeconds: 0 })).arrayBuffer());
      assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.readUInt32LE(24), RATE);
      const reference = new (scope.createLoomEngineDSP(scope.createLoomEffectsDSP).Core)(state, assets, RATE, { linear: true }); reference.start(0);
      let maximumDifference = 0;
      for (let at = 0; at < RATE / 2; at += 128) {
        const size = Math.min(128, RATE / 2 - at), left = new Float32Array(size), right = new Float32Array(size);
        reference.processBlock(left, right);
        for (let i = 0; i < size; i++) for (const [channel, samples] of [[0, left], [1, right]]) {
          const value = Math.max(-1, Math.min(1, samples[i])), pcm = Math.round(value * (value < 0 ? 32768 : 32767));
          maximumDifference = Math.max(maximumDifference, Math.abs(pcm - wav.readInt16LE(44 + (at + i) * 4 + channel * 2)));
        }
      }
      assert(maximumDifference <= 1, id + ' exported PCM matches the actual rack at a different block size: ' + maximumDifference);
      for (let at = 44; at < 44 + 6000 * 4; at += 2) assert.equal(wav.readInt16LE(at), 0, id + ' does not shift the recorded source before its start');
      let energy = 0; for (let at = 44 + 6000 * 4; at < wav.length; at += 2) energy += wav.readInt16LE(at) ** 2;
      assert(energy > 1e8, id + ' produces audible exported output');
    }
  });
  passed.forEach(name => console.log('PASS ' + name)); console.log(passed.length + ' creative effects integration checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
