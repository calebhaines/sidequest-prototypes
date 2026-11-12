'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..');
const bundle = (entry, globalName) => esbuild.buildSync({ entryPoints: [path.join(root, entry)], bundle: true, write: false, format: 'iife', globalName, platform: 'browser', target: 'es2020', logLevel: 'silent' }).outputFiles[0].text;
const vendor = bundle('plugins/js/vendor-entry.js');
const hotplate = bundle('plugins/js/hotplate-entry.js', 'KitchenHotplateAudio');
const effects = JSON.parse(fs.readFileSync(path.join(root, 'plugins/effects-manifest.json')));
const sources = {
  grain: ['grain/synth-params.js', 'grain/presets.js', 'grain/audio-engine.js'],
  tine: ['tine/synth-schema.js', 'tine/presets.js', 'tine/audio-engine.js'],
  form: [], fable: ['fable/schema.js', 'fable/audio-engine.js'],
  batter: ['batter/engine.js'], picnic: ['picnic/assets/manifest.js', 'picnic/assets/samples.js', 'picnic/schema.js', 'picnic/sequence.js', 'picnic/audio-engine.js']
};
function load(id) {
  let random = 12345;
  const sandbox = { console, Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int16Array, Int32Array, ArrayBuffer, DataView, TextEncoder, TextDecoder,
    atob: value => Buffer.from(value, 'base64').toString('binary'), btoa: value => Buffer.from(value, 'binary').toString('base64'),
    setTimeout: fn => { fn(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, performance: { now: () => 0 },
    Date: class extends Date { static now() { return 12345678; } }, Math: Object.create(Math), location: { href: 'file:///Kitchen/', protocol: 'file:' } };
  sandbox.Math.random = () => { random = Math.imul(random, 1664525) + 1013904223 | 0; return (random >>> 0) / 4294967296; };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox), run = (text, filename) => vm.runInContext(text, context, { filename });
  const file = name => run(fs.readFileSync(path.join(root, name), 'utf8'), name);
  run(vendor, 'vendor.js');
  for (const fileName of [...effects.catalogSources, ...effects.dspSources, 'shared/pattern-schema.js', 'shared/voice-effects.js']) file(fileName);
  if (id === 'form') run(hotplate, 'hotplate.js');
  if (id === 'batter') sandbox.BatterLibrary = JSON.parse(fs.readFileSync(path.join(root, 'batter/factory-samples.json')));
  for (const name of sources[id]) file(name);
  file('plugins/js/webaudio-instruments.js'); return sandbox;
}
async function render(id, partition, sequence = false, voiceFX = false) {
  const g = load(id), sr = 24000;
  const instrument = g.KitchenWebAudioInstruments.create(id, sr, undefined, { nativeSequence: sequence }); await instrument.prepare();
  if (voiceFX) { const project = instrument.getState(), state = project.state || project, voices = state.tracks || state.sounds || state.lanes;
    const defaults = g.KitchenVoiceEffects.defaults('prism'); defaults.mix = 1;
    if (voiceFX !== 'transparent') { defaults.low = -12; defaults.filter = 'lowpass'; defaults.cutoff = 220; }
    voices[0].galleyFx = voiceFX === 'bypass' ? [null, null] : [{ type: 'prism', params: defaults }, voiceFX === 'transparent' ? { type: 'prism', params: { ...defaults, mix: .5 } } : null]; await instrument.setState(project); }
  const count = sr, output = new Float32Array(count), outputRight = new Float32Array(count); let frame = 0, n = 0;
  // The native host supplies the transport anchor before dispatching MIDI at
  // that sample, including its first stopped clock (which resets old FX tails).
  instrument.transport({ tempo: 120, beat: 0, playing: sequence, frame: 0, revision: 0 });
  if (!sequence) instrument.noteOn({ pitch: ['grain', 'tine', 'form', 'batter'].includes(id) ? 36 : 60, velocity: .8, channel: 0, frame: 17 });
  while (frame < count) { const size = Math.min(partition[n++ % partition.length], count - frame), left = new Float32Array(size), right = new Float32Array(size);
    instrument.process(left, right, { tempo: 120, beat: frame / sr * 2, playing: sequence, frame, revision: 0 });
    for (let i = 0; i < size; i++) { assert(Number.isFinite(left[i]) && Number.isFinite(right[i]), id + ' finite audio'); output[frame + i] = left[i]; outputRight[frame + i] = right[i]; } frame += size;
  }
  const peak = output.reduce((p, v) => Math.max(p, Math.abs(v)), 0); assert(peak > .00001, id + ' original graph audible');
  assert(output.subarray(0, instrument.getLatencySamples() + (sequence ? 0 : 17)).every(x => Math.abs(x) < 1e-9), id + ' sample-offset/PDC onset');
  const state = instrument.getState(); assert(state && typeof state === 'object'); await instrument.setState(state); assert.deepEqual(JSON.parse(JSON.stringify(instrument.getState())), JSON.parse(JSON.stringify(state)), id + ' complete project round trip');
  await instrument.dispose(); return { output, outputRight, peak, latency: instrument.getLatencySamples() };
}
async function grainPreparationProof() {
  const g = load('grain'), Original = g.NoiseEngine, engines = [], sr = 48000;
  g.NoiseEngine = class extends Original {
    constructor() { super(); this.randomCalls = this.modRandomCalls = 0; engines.push(this); }
    async init() {
      await super.init();
      if (!this.environment.preparationSpy) {
        const random = this.environment.random, modRandom = this.environment.modRandom;
        this.environment.random = (...args) => { this.randomCalls++; return random(...args); };
        this.environment.modRandom = (...args) => { this.modRandomCalls++; return modRandom(...args); };
        this.environment.preparationSpy = true;
      }
      return this;
    }
  };
  const prepared = g.KitchenWebAudioInstruments.create('grain', sr, undefined, { nativeSequence: false }); await prepared.prepare();
  const actual = engines[0]; assert.equal(engines.length, 2, 'one isolated canonical noise helper');
  assert.equal(engines[1].context, null, 'noise helper context disposed');
  assert.equal(actual.environment.buffers.size, 12, 'all twelve canonical noise colors prepared off the callback');
  assert.equal(actual.context.currentTime, 0); assert.equal(actual.environment.voices.size, 0); assert.equal(actual.environment.hats.size, 0);
  assert.equal(actual.randomCalls, 0, 'preparation never advances the original performance RNG');
  assert.equal(actual.modRandomCalls, 0, 'preparation never advances the original modulation RNG');
  const wavePrototype = g.KitchenWebAudioEngine.impl.PeriodicWave.prototype, buildWave = wavePrototype.dspBuildWaveTable; let waveBuilds = 0;
  wavePrototype.dspBuildWaveTable = function (...args) { waveBuilds++; return buildWave.apply(this, args); };
  try { for (const wave of ['sine', 'triangle', 'sawtooth', 'square']) { const node = actual.context.createOscillator(); node.type = wave; node.disconnect(); } }
  finally { wavePrototype.dspBuildWaveTable = buildWave; }
  assert.equal(waveBuilds, 0, 'all four original immutable basic-wave tables are prepared before the first note');
  const cold = g.KitchenWebAudioInstruments.create('grain', sr, prepared.getState(), { nativeSequence: false }); await cold.prepare();
  const control = engines[2]; assert.equal(engines.length, 3, 'same-rate immutable bank is reused without another helper');
  assert.notEqual(actual.environment.buffers, control.environment.buffers, 'live environments own separate mutable maps');
  control.environment.buffers.clear(); // Reproduce the original first-hit lazy path.
  const countAllocations = engine => {
    const create = engine.context.createBuffer.bind(engine.context); let count = 0;
    engine.context.createBuffer = (channels, length, rate) => { if (channels === 1 && length === sr * 2 && rate === sr) count++; return create(channels, length, rate); };
    return () => count;
  };
  const actualAllocations = countAllocations(actual), controlAllocations = countAllocations(control);
  const clock = frame => ({ sampleRate: sr, frame, tempo: 120, beat: frame / sr * 2, playing: false, revision: 0 });
  prepared.transport(clock(0)); cold.transport(clock(0));
  const colors = ['white', 'pink', 'brown', 'blue', 'violet', 'grey', 'velvet', 'crackle', 'metallic', 'digital', 'dust', 'radio'];
  const state = prepared.getState().state;
  for (const [index, color] of colors.entries()) {
    const track = JSON.parse(JSON.stringify(state.tracks[index % 8])); track.noise = color; track.synth.noise.level = Math.max(.2, track.synth.noise.level);
    const options = { voiceIndex: index % 8, voiceKey: 'proof-' + index, velocity: .8, tempo: 120, source: 'noise-pcm-proof' }, at = (17 + index * 311) / sr;
    actual.scheduleNativeNote(JSON.parse(JSON.stringify(track)), at, options); control.scheduleNativeNote(JSON.parse(JSON.stringify(track)), at, options);
  }
  assert.equal(actualAllocations(), 0, 'actual first notes never allocate a two-second noise buffer');
  assert.equal(controlAllocations(), 12, 'control exercises twelve original lazy noise generations');
  const hash = array => crypto.createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
  for (const color of colors) {
    const a = actual.environment.buffers.get(color), b = control.environment.buffers.get(color);
    assert.equal(a.sampleRate, sr); assert.equal(a.length, sr * 2); assert.equal(a.numberOfChannels, 1);
    assert.equal(hash(a.getChannelData(0)), hash(b.getChannelData(0)), color + ' prepared PCM is byte-exact canonical makeNoise output');
  }
  const aL = new Float32Array(sr), aR = new Float32Array(sr), bL = new Float32Array(sr), bR = new Float32Array(sr);
  for (let frame = 0; frame < sr; frame += 128) { const end = Math.min(sr, frame + 128); prepared.process(aL.subarray(frame, end), aR.subarray(frame, end), clock(frame)); cold.process(bL.subarray(frame, end), bR.subarray(frame, end), clock(frame)); }
  assert.equal(hash(aL), hash(bL), 'entire left performance PCM remains byte-exact'); assert.equal(hash(aR), hash(bR), 'entire right performance PCM remains byte-exact');
  assert.equal(actual.randomCalls, control.randomCalls); assert.equal(actual.modRandomCalls, control.modRandomCalls);
  await prepared.dispose(); await cold.dispose();
  const hooks = load('grain'); let creates = 0, destroys = 0;
  hooks.KitchenNativeCreateConvolver = () => creates++;
  hooks.KitchenNativeDestroyConvolver = () => { destroys++; };
  const hookInstrument = hooks.KitchenWebAudioInstruments.create('grain', 24000, undefined, { nativeSequence: false }); await hookInstrument.prepare();
  assert.equal(creates, 2, 'real graph and isolated setup graph each prepare one native room'); assert.equal(destroys, 1, 'helper native room is explicitly destroyed before setup finishes'); await hookInstrument.dispose();
  console.log('grain: all12prepared-noise SHA256 match original lazy generation; full48000frame stereo PCM byte-exact; no original RNG/time/voice advancement or first-hit noise allocation');
}
async function main() {
  const { createContext, createPull, PartitionedConvolver } = require('../js/vendor-entry.js');
  const impulse = new Float32Array(5099); impulse[0] = .5; impulse[2048] = .25; impulse[4097] = -.2;
  const convolver = new PartitionedConvolver(impulse), rendered = new Float32Array(5376);
  for (let offset = 0; offset < rendered.length; offset += 128) { const block = new Float32Array(128); if (!offset) block[0] = 1; rendered.set(convolver.process(block), offset); }
  for (let i = 0; i < impulse.length; i++) assert(Math.abs(rendered[i] - impulse[i]) < 1e-6, 'partitioned FFT impulse exact');
  convolver.reset(); assert(convolver.process(new Float32Array(128)).every(x => x === 0), 'convolution reset clears history');
  const context = createContext(48000), pull = createPull(context), source = context.createBufferSource(), buffer = context.createBuffer(1, 1, 48000), processor = context.createScriptProcessor(1024, 2, 2);
  assert.equal(processor.bufferSize, 128, 'native script shim processes one synchronous graph quantum even when the browser fallback requests1024');
  buffer.getChannelData(0)[0] = 1; source.buffer = buffer; processor.onaudioprocess = e => { e.outputBuffer.getChannelData(0).set(e.inputBuffer.getChannelData(0)); e.outputBuffer.getChannelData(1).set(e.inputBuffer.getChannelData(1)); }; source.connect(processor); processor.connect(context.destination); source.start(17 / 48000);
  const left = new Float32Array(500), right = new Float32Array(500); pull.process(left, right); assert.equal(left.findIndex(x => x !== 0), 145); assert.equal(right[145], 1);
  const resetContext = createContext(48000), resetPull = createPull(resetContext), initial = new Float32Array(160);
  resetPull.process(initial, new Float32Array(160)); resetPull.reset();
  const resetSource = resetContext.createBufferSource(); resetSource.buffer = buffer; resetSource.connect(resetContext.destination); resetSource.start(160 / 48000);
  const resetOutput = new Float32Array(300); resetPull.process(resetOutput, new Float32Array(300)); assert.equal(resetOutput.findIndex(x => x !== 0), 128, 'partial quantum reset preserves128sample latency');
  const compressionContext = createContext(48000), compressionPull = createPull(compressionContext), compressionSource = compressionContext.createBufferSource(), compressor = compressionContext.createDynamicsCompressor(); compressionSource.buffer = buffer; compressionSource.connect(compressor); compressor.connect(compressionContext.destination); compressionSource.start(17 / 48000);
  const compressed = new Float32Array(700); compressionPull.process(compressed, new Float32Array(700)); assert.equal(compressed.findIndex(x => Math.abs(x) > 1e-8), 433, 'real compressor6mslookahead plus128pull latency'); assert(compressed.every(Number.isFinite));
  function envelope(hold, release, exponential = false) {
    const c = createContext(24000), p = createPull(c), s = c.createBufferSource(), b = c.createBuffer(1, 16, 24000), gain = c.createGain();
    b.getChannelData(0).fill(1); s.buffer = b; s.loop = true; s.connect(gain); gain.connect(c.destination);
    gain.gain.setValueAtTime(0, 0); gain.gain.linearRampToValueAtTime(.72, .008); gain.gain.setValueAtTime(.72, hold);
    if (exponential) gain.gain.exponentialRampToValueAtTime(.000072, release); else gain.gain.linearRampToValueAtTime(0, release);
    s.start(0); const output = new Float32Array(27000); p.process(output, new Float32Array(output.length)); return output;
  }
  const sustain = envelope(120, 120.09), released = envelope(.8, 1), exponential = envelope(.8, 1, true);
  assert(Math.abs(sustain[24000 + 128] - .72) < 1e-6, 'future zero-length setValue does not consume a long sustain');
  assert(Math.abs(released[12000 + 128] - .72) < 1e-6, 'attack-to-release gap holds current value');
  assert(Math.abs(released[21600 + 128] - .36) < 1e-6, 'release begins at its original absolute timestamp');
  assert(Math.abs(exponential[21600 + 128] - .0072) < 1e-6, 'exponential release follows its original endpoint');
  const delayContext = createContext(24000), delayPull = createPull(delayContext), delaySource = delayContext.createBufferSource(), delayBuffer = delayContext.createBuffer(1, 16, 24000), delay = delayContext.createDelay(16.8);
  delayBuffer.getChannelData(0).fill(.25); delaySource.buffer = delayBuffer; delaySource.loop = true; delaySource.connect(delay); delay.connect(delayContext.destination); delay.delayTime.setValueAtTime(.252, 0); delaySource.start(0);
  const delayed = new Float32Array(24000); delayPull.process(delayed, new Float32Array(delayed.length)); assert(delayed.every(Number.isFinite), 'fractional delay index crossing zero never rounds outside its ring'); assert(Math.abs(delayed[10000] - .25) < 1e-6);
  await grainPreparationProof();
  for (const id of Object.keys(sources)) {
    const a = await render(id, [128]), b = await render(id, [17, 31, 255, 3, 129]);
    let error = 0; for (let i = 0; i < a.output.length; i++) error = Math.max(error, Math.abs(a.output[i] - b.output[i])); assert(error < 2e-6, id + ' arbitrary DAW block partitions: ' + error);
    const sequence = await render(id, [97, 128, 41], true); console.log(id + ': MIDI + DAW sequence, complete state, quantum partition parity; peak=' + a.peak.toFixed(4) + ', latency=' + a.latency + ', seqPeak=' + sequence.peak.toFixed(4));
    if (['grain', 'tine', 'form', 'batter'].includes(id)) {
      const wet = await render(id, [33, 128, 79], false, true); let difference = 0; for (let i = 0; i < a.output.length; i++) difference += Math.abs(a.output[i] - wet.output[i]); assert(difference > .01, id + ' actual GALLEY insert rack changes the original voice');
      const bypass = await render(id, [128], false, 'bypass'), transparent = await render(id, [17, 31, 255, 3, 129], false, 'transparent');
      let error = 0, signalError = 0; for (let i = 0; i < bypass.output.length; i++) {
        const delta = Math.max(Math.abs(bypass.output[i] - transparent.output[i]), Math.abs(bypass.outputRight[i] - transparent.outputRight[i])); error = Math.max(error, delta);
        if (Math.max(Math.abs(bypass.output[i]), Math.abs(transparent.output[i]), Math.abs(bypass.outputRight[i]), Math.abs(transparent.outputRight[i])) > .0001) signalError = Math.max(signalError, delta);
      }
      // HOTPLATE's direct source disconnection can trim a <−90dB final sample;
      // the live script rack retains that sample through the compressor tail.
      assert(error < .00003 && signalError < 2e-6, id + ' two transparent voice inserts preserve stereo signal timing without an extra script buffer: ' + error);
      assert.equal(transparent.output.findIndex(x => Math.abs(x) > 1e-8), bypass.output.findIndex(x => Math.abs(x) > 1e-8), id + ' enabled voice rack preserves exact MIDI transient timestamp');
      assert.equal(transparent.latency, bypass.latency, id + ' transparent rack does not change reported latency');
      console.log(id + ': two enabled voice inserts preserve exact transient frame ' + transparent.output.findIndex(x => Math.abs(x) > 1e-8) + '; stereo max error=' + error);
    }
  }
  for (const id of ['fable', 'picnic']) {
    const g = load(id), instrument = g.KitchenWebAudioInstruments.create(id, 24000, undefined, { nativeSequence: id === 'fable' }); await instrument.prepare();
    const project = instrument.getState(); if (id === 'fable') { project.state.performance.mode = 'arp'; project.state.performance.arpMode = 'updown'; project.state.performance.octaves = 2; await instrument.setState(project); }
    let peak = 0;
    for (let block = 0; block < 180; block++) {
      const frame = block * 128, clock = { frame, tempo: 120, beat: frame / 12000, playing: id === 'fable', revision: 0 };
      instrument.transport(clock);
      if (!block) { instrument.noteOn({ pitch: 60, velocity: .8, frame }); instrument.noteOn({ pitch: 67, velocity: .7, frame }); }
      if (block === 50) { instrument.controlChange?.({ controller: 64, value: 1, frame }); instrument.noteOff({ pitch: 60, frame }); instrument.noteOff({ pitch: 67, frame }); }
      if (block === 85) instrument.controlChange?.({ controller: 64, value: 0, frame });
      if (block === 110) instrument.allNotesOff();
      const left = new Float32Array(128), right = new Float32Array(128); instrument.process(left, right, clock);
      for (const value of left) { assert(Number.isFinite(value), id + ' variable MIDI gate remains finite'); peak = Math.max(peak, Math.abs(value)); }
    }
    assert(peak > .001, id + ' live MIDI gates/host arp audible'); await instrument.dispose();
  }
  console.log('Six original Web Audio instruments passed.');
}
module.exports = { load, render, grainPreparationProof };
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
