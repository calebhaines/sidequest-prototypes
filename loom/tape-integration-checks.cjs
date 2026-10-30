'use strict';
// Actual GALLEY Core and serialized percussion processors; no browser or Git.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
globalThis.window = globalThis;
for (const file of ['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'preamp-catalog.js', 'tape-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'tape-dsp.js', 'effects.js', 'audio-engine.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), { filename: file });
}
const shared = fs.existsSync(path.join(__dirname, 'shared/voice-effects.js')) ? path.join(__dirname, 'shared') : path.join(__dirname, '../shared');
vm.runInThisContext(fs.readFileSync(path.join(shared, 'voice-effects.js'), 'utf8'), { filename: 'voice-effects.js' });
const rate = 48000, effects = createLoomEffectsDSP(), engine = createLoomEngineDSP(createLoomEffectsDSP), bridge = KitchenVoiceEffects;
const copy = value => JSON.parse(JSON.stringify(value));
const tape = patch => ({ type: 'preserve', params: effects.normalize('preserve', patch) });
const lane = (key, start, end) => ({ target: 'fx:0:' + key, effectType: 'preserve', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: start }, { beat: 1, value: end }] });
const passed = [];
async function check(name, run) { await run(); passed.push(name); console.log('PASS ' + name); }

function state() {
  return {
    tempo: 120, lengthBars: 4, loopEnabled: false, loopStart: 0, loopEnd: 16,
    tracks: Array.from({ length: 8 }, (_, index) => ({ id: 'track-' + (index + 1), name: 'Track ' + (index + 1), level: 1, pan: 0, mute: false, solo: false, instrumentLive: true, sends: [0, 0], sendPre: [false, false], effects: [null, null, null, null], automation: [], clips: [] })),
    returns: [0, 1].map(index => ({ id: 'return-' + (index + 1), name: 'Return ' + (index + 1), level: 1, pan: 0, mute: false, solo: false, effects: [null, null, null, null], automation: [] })),
    master: { id: 'master', name: 'Master', level: 1, mute: false, metronome: false, effects: [null, null, null, null], automation: [] }
  };
}
function source(frames) {
  let seed = 0x205147;
  const left = new Float32Array(frames), right = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const noise = ((seed >>> 0) / 4294967296 - .5) * .02;
    left[frame] = .11 * Math.sin(2 * Math.PI * 173 * frame / rate) + .035 * Math.sin(2 * Math.PI * 3200 * frame / rate) + noise;
    right[frame] = .09 * Math.sin(2 * Math.PI * 719 * frame / rate) + .025 * Math.sin(2 * Math.PI * 5700 * frame / rate) - noise;
  }
  return [left, right];
}
function feed(core, sources, frames, block = 128, offset = 0) {
  const left = new Float32Array(frames), right = new Float32Array(frames);
  for (let at = 0; at < frames; at += block) {
    const count = Math.min(block, frames - at);
    const inputs = Array.from({ length: 9 }, (_, index) => sources[index] ? sources[index].map(channel => channel.subarray(offset + at, offset + at + count)) : []);
    core.processBlock(left.subarray(at, at + count), right.subarray(at, at + count), inputs);
  }
  return { left, right };
}
function render(value, sources, frames, block = 128, options = {}) {
  const core = new engine.Core(value, {}, rate, { linear: true, ...options });
  core.start(0);
  return { ...feed(core, sources, frames, block), core };
}
function maxDifference(a, b) { let maximum = 0; for (let frame = 0; frame < a.length; frame++) maximum = Math.max(maximum, Math.abs(a[frame] - b[frame])); return maximum; }
function peak(data) { let maximum = 0; for (const value of data) { assert(Number.isFinite(value)); maximum = Math.max(maximum, Math.abs(value)); } return maximum; }
function activeState() {
  const value = state(), patch = { drive: 8, warmth: .65, wear: .25, wow: .3, flutter: .08, noise: .3, dropouts: .3, azimuth: .1, crosstalk: .02, stereoLink: .6 };
  value.tracks[0].effects[0] = tape(patch);
  value.tracks[0].automation = [lane('drive', 3, 14), lane('wow', .05, .4)];
  value.tracks[0].sends[0] = .4;
  value.returns[0].effects[0] = tape({ ...patch, model: 'home', speed: '7.5', mix: .7 });
  value.returns[0].automation = [lane('bias', -.4, .4), lane('output', -4, -1)];
  value.master.effects[0] = tape({ ...patch, model: 'valve', mix: .6 });
  value.master.automation = [lane('warmth', .2, .7), lane('output', -1, -3)];
  return value;
}

(async () => {
  await check('PRESERVE processes real stereo audio in all eight track racks, both returns and master', () => {
    const signal = source(8192);
    for (let ownerIndex = 0; ownerIndex < 11; ownerIndex++) {
      const value = state(), slot = ownerIndex % 4;
      let owner, meterPath, track = ownerIndex < 8 ? ownerIndex : 0;
      if (ownerIndex < 8) { owner = value.tracks[track]; meterPath = output => output.core.getMeters().effects[track][slot]; }
      else if (ownerIndex < 10) { const bus = ownerIndex - 8; owner = value.returns[bus]; owner.solo = true; value.tracks[0].sends[bus] = 1; meterPath = output => output.core.getMeters().returnEffects[bus][slot]; }
      else { owner = value.master; meterPath = output => output.core.getMeters().masterEffects[slot]; }
      const dry = copy(value), sources = []; sources[track] = signal;
      owner.effects[slot] = tape({ drive: 11, warmth: .7 });
      const snapshot = JSON.stringify(value), output = render(value, sources, signal[0].length), baseline = render(dry, sources, signal[0].length);
      assert(maxDifference(output.left, baseline.left) > .0001, owner.id + ' must change the routed audio');
      assert(maxDifference(output.right, baseline.right) > .0001, owner.id + ' must process the right channel');
      const meter = meterPath(output);
      assert.equal(meter.type, 'preserve');
      for (const key of ['inputDb', 'tapeDb', 'outputDb', 'compressionDb', 'transportMs']) assert(Number.isFinite(meter[key]), owner.id + '.' + key);
      assert(meter.inputDb > -80 && meter.outputDb > -80, owner.id + ' meters must follow actual audio');
      assert.equal(meter.transportMs, 0, 'Stock transport adds no delay');
      assert.equal(JSON.stringify(value), snapshot, 'Rendering must not mutate the project');
    }
  });

  await check('Track, return and master tape automation share the absolute control clock across odd blocks', () => {
    const value = activeState(), signal = source(18000), snapshot = JSON.stringify(value);
    const first = render(value, [signal], signal[0].length, 128), second = render(value, [signal], signal[0].length, 37);
    assert.deepEqual(first.left, second.left); assert.deepEqual(first.right, second.right);
    const stationary = copy(value); stationary.tracks[0].automation = []; stationary.returns[0].automation = []; stationary.master.automation = [];
    assert(maxDifference(first.left, render(stationary, [signal], signal[0].length).left) > .001, 'Automation must affect real audio');
    assert.equal(JSON.stringify(value), snapshot);
  });

  await check('Unrelated mixer edits preserve active tape automation, transport and magnetic histories', () => {
    const value = activeState(), signal = source(16000), boundary = 7777;
    const a = new engine.Core(value, {}, rate, { linear: true }), b = new engine.Core(copy(value), {}, rate, { linear: true }); a.start(); b.start();
    assert.deepEqual(feed(a, [signal], boundary), feed(b, [signal], boundary));
    const references = [b.slots[0][0], b.returnSlots[0][0], b.masterSlots[0]], automation = references.map(slot => copy(slot.automationValues));
    const edited = copy(value); edited.tracks[7].name = 'A quiet unused track'; b.setState(edited);
    const current = [b.slots[0][0], b.returnSlots[0][0], b.masterSlots[0]];
    for (let index = 0; index < references.length; index++) { assert.equal(current[index].dsp, references[index].dsp); assert.deepEqual(current[index].automationValues, automation[index]); }
    assert.deepEqual(feed(a, [signal], signal[0].length - boundary, 128, boundary), feed(b, [signal], signal[0].length - boundary, 128, boundary));
  });

  await check('SERVICE tape macros reserve arrangement lanes, follow new overrides and restore the saved automation', () => {
    const value = state(), signal = source(rate);
    value.tracks[0].effects[0] = tape(); value.tracks[0].automation = [lane('drive', 2, 14)];
    const saved = JSON.stringify(value), assets = { voice: { left: signal[0], right: signal[1], sampleRate: rate } };
    const core = new engine.Core(value, assets, rate); core.start(); feed(core, [signal], 4096);
    assert(core.slots[0][0].automationValues.drive > 2);
    const clip = { assetId: 'voice', start: 0, length: 2, sourceStart: 0, sourceEnd: 1, sourceOffset: 0, rate: 1, reverse: false, loop: true, gain: 1, fadeIn: 0, fadeOut: 0 };
    const performance = drive => ({ drops: Array(8).fill(false), stutterBeats: 0, fill: false, overrides: drive == null ? [] : [{ trackId: 'track-1', target: 'fx:0:drive', value: drive }] });
    core.startService({ clips: [clip, ...Array(7).fill(null)] }, 0, 1, performance(21));
    function measureDrive(expected) {
      assert.equal(core.automation[0].effects[0].length, 0, 'Saved arrangement automation is reserved during SERVICE');
      assert.equal(core.slots[0][0].automationValues, null, 'SERVICE must clear former arrangement control values');
      const output = feed(core, [], 16000), meter = core.getMeters().effects[0][0];
      assert(peak(output.left) > .001);
      assert(Math.abs(meter.tapeDb - meter.inputDb - expected) < .02, 'Actual record gain must follow the SERVICE macro');
    }
    measureDrive(21);
    core.queueService('performance', performance(5), 'immediate', 2); feed(core, [], 1); measureDrive(5);
    core.setState(copy(value)); measureDrive(5);
    core.queueService('performance', performance(null), 'immediate', 3); feed(core, [], 1); measureDrive(4);
    core.stopService(); assert.equal(core.service, null); assert.equal(core.automation[0].effects[0].length, 1);
    assert.equal(JSON.stringify(value), saved);
  });

  await check('Bypass and zero mix stay exactly dry through the host; zero-motion tape starts on the original sample', () => {
    const signal = source(4096), dry = state(), baseline = render(dry, [signal], signal[0].length);
    for (const patch of [{ bypass: true }, { mix: 0 }]) {
      const value = state(); value.tracks[0].effects[0] = tape({ wow: .8, flutter: .2, noise: .8, dropouts: .8, ...patch });
      const output = render(value, [signal], signal[0].length);
      assert.deepEqual(output.left, baseline.left); assert.deepEqual(output.right, baseline.right);
    }
    const impulse = new Float32Array(128); impulse[0] = .2;
    const value = state(); value.tracks[0].effects[0] = tape();
    const coloured = render(value, [[impulse, impulse]], impulse.length), original = render(state(), [[impulse, impulse]], impulse.length);
    assert.equal(coloured.left.findIndex(sample => Math.abs(sample) > 1e-10), original.left.findIndex(sample => Math.abs(sample) > 1e-10));
  });

  await check('Stopped tape settles within its declared finite tail; seek and Panic clear transport and noise history', () => {
    const value = activeState(); value.tracks[0].automation = []; value.returns[0].automation = []; value.master.automation = [];
    const core = new engine.Core(value, {}, rate); core.start(); feed(core, [source(6000)], 6000);
    const tail = [core.slots[0][0], core.returnSlots[0][0], core.masterSlots[0]].reduce((seconds, slot) => seconds + slot.dsp.getTailTime(), 0);
    assert(Number.isFinite(tail) && tail > 0 && tail < 20);
    core.stop(); const stopped = feed(core, [], Math.ceil((tail + .1) * rate));
    assert(peak(stopped.left.subarray(stopped.left.length - 512)) < 1e-6, 'Stopped tape must not remain a noise generator');
    core.start(); feed(core, [source(6000)], 6000); core.seek(4);
    const sought = feed(core, [], 4096); assert(peak(sought.left.subarray(512)) < 1e-8, 'Seek must not reveal the former tape buffer');
    core.start(); feed(core, [source(6000)], 6000); core.panic();
    const panic = feed(core, [], 4096); assert.equal(peak(panic.left), 0); assert.equal(peak(panic.right), 0);
  });

  await check('Percussion tape keeps its continuous bypass and zero-mix fade, then reaches exact dry and re-enables from current history', () => {
    const signal = source(36000), boundary = 4096, dryFrames = 20000, active = tape({ drive: 12, warmth: .8, wear: .4, wow: .3, flutter: .1 });
    for (const patch of [{ bypass: true }, { mix: 0 }]) {
      const processor = bridge.createProcessor(rate, [active, null]), native = effects.create('preserve', rate, active.params);
      function processBoth(start, count) {
        const output = { left: signal[0].slice(start, start + count), right: signal[1].slice(start, start + count) };
        const reference = { left: output.left.slice(), right: output.right.slice() };
        for (let at = 0; at < count; at += 128) {
          processor.process(output.left.subarray(at, at + 128), output.right.subarray(at, at + 128));
          native.process(reference.left.subarray(at, at + 128), reference.right.subarray(at, at + 128));
        }
        return { output, reference };
      }
      const warm = processBoth(0, boundary); assert.deepEqual(warm.output, warm.reference);
      const dry = tape({ ...active.params, ...patch }); processor.setSlots([dry, null]); native.setParams(dry.params);
      assert(processor.getTailTime() > 0, 'A pending tape fade must remain in the render tail');
      const faded = processBoth(boundary, dryFrames);
      assert.deepEqual(faded.output.left.subarray(512), faded.reference.left.subarray(512));
      assert.deepEqual(faded.output.right.subarray(512), faded.reference.right.subarray(512));
      assert(maxDifference(faded.output.left.subarray(0, 128), signal[0].subarray(boundary, boundary + 128)) > 1e-5, 'A bypass edit must retain a short wet transition');
      assert.deepEqual(faded.output.left.subarray(dryFrames - 2048), signal[0].subarray(boundary + dryFrames - 2048, boundary + dryFrames));
      assert.deepEqual(faded.output.right.subarray(dryFrames - 2048), signal[1].subarray(boundary + dryFrames - 2048, boundary + dryFrames));
      assert.equal(processor.getTailTime(), 0, 'Settled bypass/zero mix needs no tail');
      processor.setSlots([active, null]); native.setParams(active.params);
      const restored = processBoth(boundary + dryFrames, signal[0].length - boundary - dryFrames);
      assert.deepEqual(restored.output.left.subarray(512), restored.reference.left.subarray(512));
      assert.deepEqual(restored.output.right.subarray(512), restored.reference.right.subarray(512));
      assert(maxDifference(restored.output.left.subarray(2048), signal[0].subarray(boundary + dryFrames + 2048)) > .001, 'Re-enabling restores the tape colour and current motion');
    }
  });

  await check('Serialized percussion Worklet uses the actual eighth tape factory and matches canonical stereo DSP', async () => {
    let realm, Registered;
    class Param { constructor() { this.value = 1; } cancelScheduledValues() {} cancelAndHoldAtTime() {} setValueAtTime(value) { this.value = value; } linearRampToValueAtTime(value) { this.value = value; } }
    class Node { constructor() { this.gain = new Param(); } connect(node) { return node; } disconnect() {} }
    class Worklet extends Node {
      constructor(context, name, options) {
        super(); this.processor = new Registered(options);
        this.port = { postMessage: value => this.processor.port.onmessage?.({ data: value }), close() {}, onmessage: null };
      }
    }
    const previousWorklet = globalThis.AudioWorkletNode; globalThis.AudioWorkletNode = Worklet;
    const context = { sampleRate: rate, currentTime: 0, createGain: () => new Node(), audioWorklet: { async addModule(url) {
      const code = await (await fetch(url)).text();
      realm = { sampleRate: rate, currentFrame: 0, Math, Number, Object, JSON, Float32Array, Float64Array, Int32Array, Uint8Array, Map, Set,
        AudioWorkletProcessor: class { constructor() { this.port = { onmessage: null, postMessage() {} }; } }, registerProcessor(name, processor) { Registered = processor; } };
      vm.createContext(realm); vm.runInContext(code, realm);
    } } };
    let bank;
    try {
      await bridge.prepare(context);
      const slots = [tape({ model: 'cassette', speed: '1.875', drive: 9, wow: .35, flutter: .08, noise: .4, wear: .2 }), tape({ drive: 2, mix: .5 })];
      bank = bridge.createBank(context, new Node(), { voiceCount: 2 }); bank.setVoice(0, slots); bank.setClock({ tempo: 120, beat: 0, time: 0, playing: true });
      const input = source(8192), output = { left: new Float32Array(input[0].length), right: new Float32Array(input[0].length) }, node = bank.input(0);
      for (let at = 0; at < input[0].length; at += 128) {
        realm.currentFrame = at;
        node.processor.process([[input[0].subarray(at, at + 128), input[1].subarray(at, at + 128)]], [[output.left.subarray(at, at + 128), output.right.subarray(at, at + 128)]]);
      }
      const reference = { left: input[0].slice(), right: input[1].slice() }, processor = bridge.createProcessor(rate, slots, { tempo: 120, beat: 0, playing: true });
      for (let at = 0; at < input[0].length; at += 128) processor.process(reference.left.subarray(at, at + 128), reference.right.subarray(at, at + 128));
      assert.deepEqual(output, reference);
      assert.notEqual(bank.input(1), bank.input(0), 'An empty voice must not share the tape rack');
      assert(peak(output.left) > .001 && maxDifference(output.left, input[0]) > .001);
      assert.equal(node.processor.core.getMeters()[0].type, 'preserve');
      bank.reset(0, 0); realm.currentFrame = 0;
      const silence = new Float32Array(128), right = silence.slice(); node.processor.process([[]], [[silence, right]]);
      assert.equal(peak(silence), 0); assert.equal(peak(right), 0);
    } finally { bank?.dispose(); globalThis.AudioWorkletNode = previousWorklet; }
  });
  console.log(passed.length + ' PRESERVE routing, automation and percussion integration groups passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
