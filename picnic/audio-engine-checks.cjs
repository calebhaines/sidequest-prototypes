'use strict';
// Inspect Web Audio scheduling, rather than replacing PICNIC's voice decisions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Parameter {
  constructor(value = 0) { this.value = value; this.events = []; }
  setValueAtTime(value, when) { this.events.push(['set', value, when]); this.value = value; }
  linearRampToValueAtTime(value, when) { this.events.push(['linear', value, when]); this.value = value; }
  exponentialRampToValueAtTime(value, when) { assert(value > 0); this.events.push(['exponential', value, when]); this.value = value; }
  cancelScheduledValues(when) { this.events.push(['cancel', when]); }
}
class Node {
  constructor() { for (const name of ['gain', 'pan', 'frequency', 'Q', 'threshold', 'knee', 'ratio', 'attack', 'release', 'delayTime', 'playbackRate']) this[name] = new Parameter(); this.connections = []; }
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.connections.length = 0; }
}
class Context {
  constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = new Node(); this.sources = []; this.buffers = []; }
  createGain() { return new Node(); }
  createBiquadFilter() { return new Node(); }
  createStereoPanner() { return new Node(); }
  createDynamicsCompressor() { return new Node(); }
  createWaveShaper() { return new Node(); }
  createConvolver() { return new Node(); }
  createDelay() { return new Node(); }
  createBuffer(channels, length, sampleRate) { const data = Array.from({ length: channels }, () => new Float32Array(length)), buffer = { length, sampleRate, duration: length / sampleRate, getChannelData: channel => data[channel] }; this.buffers.push(buffer); return buffer; }
  createBufferSource() { const node = new Node(); node.starts = []; node.stops = []; node.start = (...args) => node.starts.push(args); node.stop = at => node.stops.push(at); this.sources.push(node); return node; }
  async resume() {}
  async close() { this.state = 'closed'; }
}
const partIds = ['melody', 'chords', 'bass', 'drums', 'neighbors', 'texture'];
const pcm = Buffer.alloc(8000); for (let index = 0; index < 4000; index++) pcm.writeInt16LE(Math.round(Math.sin(index / 7) * 10000), index * 2);
const sample = { data: pcm.toString('base64'), frames: 4000, sampleRate: 8000 };
const region = { sample: 'sample-a', key: [0, 127], velocity: [0, 127], root: 60, tune: 0, gain: .7, pan: -.2, loop: true, loopMode: 1, loopStart: 400, loopEnd: 3000, attack: .01, decay: .2, sustain: .5, release: .1 };
const baseState = () => ({ tempo: 120, master: { level: .7, tone: 14000, reverb: .2, delay: .1 }, selectedBank: 0, chain: false, banks: [{ length: 32 }], parts: partIds.map(id => ({ id, presetId: 'piano', level: .7, pan: 0, transpose: 0, attack: 0, release: .02, cutoff: 14000, reverb: .2, delay: .1, mute: false, solo: false })) });
const intervals = new Map(); let serial = 0;
const scope = { AudioContext: Context, Float32Array, Map, Set, WeakMap, Math, Number, JSON, DOMException, Promise, atob: value => Buffer.from(value, 'base64').toString('binary'), setInterval: callback => { intervals.set(++serial, callback); return serial; }, clearInterval: id => intervals.delete(id), setTimeout,
  PicnicLibrary: { samples: { 'sample-a': sample, 'sample-b': sample }, presets: [{ id: 'piano', regions: [region] }, { id: 'split', regions: [{ ...region, key: [0, 59], sample: 'sample-a', velocity: [0, 63] }, { ...region, key: [60, 127], sample: 'sample-b', velocity: [64, 127], tune: 100, root: 60, loopMode: 3 }] }] },
  PicnicSequence: { lengthBeats: () => 8, events: () => [] } };
scope.window = scope; vm.createContext(scope); vm.runInContext(fs.readFileSync(__dirname + '/audio-engine.js', 'utf8'), scope);
const Engine = scope.PicnicAudioEngine;
const event = patch => ({ id: 'note', voice: 'melody', pitch: 60, velocity: .8, when: .1, durationSeconds: .4, source: 'A', ...patch });
const passed = [];
async function check(name, run) { await run(); passed.push(name); }
(async () => {
  await check('Factory PCM is decoded lazily for selected presets, and true key/velocity regions select the source', async () => {
    const state = baseState(), engine = new Engine({ getState: () => state }); await engine.init();
    assert.equal(engine.getDiagnostics().preparedSamples, 1);
    state.parts[0].presetId = 'split'; await engine.update(state); assert.equal(engine.getDiagnostics().preparedSamples, 2);
    assert.equal(engine.scheduleNote(event({ pitch: 61, velocity: .2 })), false, 'No substitute region may cross an SF2 velocity split.');
    assert(engine.scheduleNote(event({ pitch: 61, velocity: .8 })));
    const source = engine.context.sources[0]; assert.equal(source.buffer, engine.context.buffers.find(buffer => buffer === source.buffer));
    assert(Math.abs(source.playbackRate.value - Math.pow(2, 2 / 12)) < 1e-12, 'Region root and cents tune both affect pitch.'); await engine.dispose();
  });
  await check('Transpose belongs to synthesis exactly once, and mode3 releases the loop at its exact sample phase', async () => {
    const state = baseState(); state.parts[0].presetId = 'split'; state.parts[0].transpose = 12;
    const engine = new Engine({ getState: () => state }); await engine.init(); engine.scheduleNote(event({ pitch: 60 }));
    const [sustain, tail] = engine.context.sources; assert(sustain.loop); assert.equal(tail.loop, undefined); assert.deepEqual(sustain.stops, [.5]); assert.equal(tail.starts[0][0], .5);
    assert(Math.abs(sustain.playbackRate.value - Math.pow(2, 13 / 12)) < 1e-12); assert(tail.starts[0][1] >= .05 && tail.starts[0][1] < .375); await engine.dispose();
  });
  await check('Future cancellation affects only its requested source at the exact timestamp', async () => {
    const state = baseState(), engine = new Engine({ getState: () => state }); await engine.init();
    engine.scheduleNote(event({ source: 'A', when: .3 })); engine.scheduleNote(event({ source: 'B', when: .4 }));
    engine.cancelNotes({ source: 'A', when: .45 }); assert.equal(engine.context.sources[0].stops.at(-1), .45); assert.notEqual(engine.context.sources[1].stops.at(-1), .45);
    engine.context.currentTime = .5; assert.equal(engine.activeVoices, 1); assert.equal(engine.getDiagnostics().sources.B.active, 1); await engine.dispose();
  });
  await check('A cancelled source generation cannot restart after its future boundary, including notes scheduled later', async () => {
    const state = baseState(), engine = new Engine({ getState: () => state }); await engine.init();
    engine.cancelNotes({ source: 'retired', when: .5 });
    assert.equal(engine.scheduleNote(event({ source: 'retired', when: .6 })), false);
    assert(engine.scheduleNote(event({ source: 'retired', when: .3, durationSeconds: 2 }))); assert.equal(engine.context.sources[0].stops.at(-1), .5);
    assert(engine.scheduleNote(event({ source: 'new-generation', when: .6 })), 'A new source generation has independent lifetime.');
    engine.context.currentTime = .7; assert.equal(engine.scheduleNote(event({ source: 'retired', when: .8 })), false); assert.equal(engine.activeVoices, 1); await engine.dispose();
  });
  await check('Long authored SF2 decay/release envelopes remain intact within the bounded pool', async () => {
    scope.PicnicLibrary.presets.push({ id: 'long-envelope', regions: [{ ...region, attack: 10, decay: 92.518, release: 57.847 }] });
    const state = baseState(); state.parts[0].presetId = 'long-envelope'; state.parts[0].release = 2;
    const engine = new Engine({ getState: () => state }); await engine.init(); engine.scheduleNote(event({ durationSeconds: 105 }));
    const source = engine.context.sources[0], envelope = source.connections[0].gain.events;
    assert(envelope.some(([type, , at]) => type === 'linear' && Math.abs(at - 10.1) < 1e-9));
    assert(envelope.some(([type, , at]) => type === 'exponential' && Math.abs(at - 102.618) < 1e-9));
    assert(Math.abs(source.stops.at(-1) - 164.947) < 1e-9); assert.equal(engine.maxVoices, 32); await engine.dispose();
  });
  await check('The physical voice budget stays at32 and deterministic stealing stops the displaced voice', async () => {
    const state = baseState(), engine = new Engine({ getState: () => state }); await engine.init();
    for (let index = 0; index < 40; index++) engine.scheduleNote(event({ id: 'voice-' + index, when: .1, durationSeconds: 2, pitch: 40 + index }));
    engine.context.currentTime = .2; assert.equal(engine.activeVoices, 32); assert.equal(engine.maxVoices, 32); assert.equal(engine.schedulingStatistics.stolen, 8); assert.equal(engine.context.sources[0].stops.at(-1), .1); await engine.dispose();
  });
  await check('Out-of-order manual notes cannot hide an earlier reservation behind a future note and exceed32 voices', async () => {
    const state = baseState(), engine = new Engine({ getState: () => state }); await engine.init();
    engine.scheduleNote(event({ when: .1, durationSeconds: .8 })); engine.scheduleNote(event({ when: 2, durationSeconds: .2 }));
    for (let index = 0; index < 31; index++) engine.scheduleNote(event({ id: 'held-' + index, when: .5, durationSeconds: 10 }));
    engine.scheduleNote(event({ id: 'manual', when: .5, durationSeconds: 1 }));
    engine.context.currentTime = .6; assert.equal(engine.activeVoices, 32); assert.equal(engine.context.sources[0].stops.at(-1), .5);
    let seed = 14; const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
    for (let index = 0; index < 600; index++) engine.scheduleNote(event({ id: 'random-' + index, when: .6 + random() * 10, durationSeconds: .01 + random() * 8 }));
    for (const voice of engine._pool.voices) { assert(engine._pool.active(voice.when + 1e-6) <= 32); assert(engine._pool.active(voice.stopAt - 1e-6) <= 32); }
    await engine.dispose();
  });
  await check('Mute/solo rejects inaudible parts and preset changes cancel only changed-part voices', async () => {
    const state = baseState(), engine = new Engine({ getState: () => state }); await engine.init();
    state.parts[1].solo = true; await engine.update(state); assert.equal(engine.scheduleNote(event()), false); assert(engine.scheduleNote(event({ voice: 'chords' })));
    state.parts[1].solo = false; await engine.update(state); engine.scheduleNote(event()); engine.scheduleNote(event({ voice: 'bass' }));
    state.parts[0].presetId = 'split'; await engine.update(state); assert.equal(engine.context.sources[1].stops.at(-1), 0); assert(engine.context.sources[2].stops.at(-1) > 0); await engine.dispose();
  });
  await check('Native transport starts no second scheduler, preserves phase on tempo edits, and Stop leaves discrete voices alone', async () => {
    const state = baseState(), engine = new Engine({ getState: () => state }); await engine.init(); await engine.play({ when: 0, beat: 4 });
    assert.equal(intervals.size, 1); engine.context.currentTime = 1; assert.equal(engine.nativeBeat, 6); engine.setTempo(60); assert.equal(engine.nativeBeat, 6); engine.context.currentTime = 2; assert.equal(engine.nativeBeat, 7);
    engine.scheduleNote(event({ when: 2, durationSeconds: 1, source: 'host' })); engine.stop(); assert.equal(engine.activeVoices, 1); assert.equal(intervals.size, 0); engine.panic(); assert.equal(engine.activeVoices, 0); await engine.dispose();
  });
  await check('Preparing again and editing sound/mix keep already scheduled native notes playing', async () => {
    const state = baseState(), engine = new Engine({ getState: () => state }); await engine.init(); await engine.play({ when: 0 });
    engine.scheduleNote(event({ when: 0, durationSeconds: 2, source: 'picnic-native' })); engine.context.currentTime = .2;
    const cancelled = engine.schedulingStatistics.cancelled, stop = engine.context.sources[0].stops.at(-1);
    await engine.update(state); state.master.level = .3; state.parts[0].cutoff = 2000; await engine.update(state);
    assert.equal(engine.schedulingStatistics.cancelled, cancelled); assert.equal(engine.context.sources[0].stops.at(-1), stop); assert.equal(engine.activeVoices, 1); await engine.dispose();
  });
  await check('A future native start waits for its scheduling horizon without a zero-length sequence request or idle timer leak', async () => {
    const previous = scope.PicnicSequence.events, state = baseState(); scope.PicnicSequence.events = (_, range) => { assert(range.lengthBeats > 0); return []; };
    const engine = new Engine({ getState: () => state }); await engine.init(); assert.equal(await engine.play({ when: 1, beat: 0 }), true); assert(engine.isPlaying); assert.equal(intervals.size, 1);
    engine.context.currentTime = .9; for (const callback of intervals.values()) callback(); assert(engine.isPlaying); await engine.dispose(); assert.equal(intervals.size, 0); scope.PicnicSequence.events = previous;
  });
  await check('A sequence failure during Start returns false and leaves no idle scheduler', async () => {
    const previous = scope.PicnicSequence.events, state = baseState(), messages = []; scope.PicnicSequence.events = () => { throw Error('Invalid score'); };
    const engine = new Engine({ getState: () => state, onStatus: message => messages.push(message) }); await engine.init(); assert.equal(await engine.play(), false); assert.equal(engine.isPlaying, false); assert.equal(intervals.size, 0); assert.deepEqual(messages, ['Invalid score']); await engine.dispose(); scope.PicnicSequence.events = previous;
  });
  await check('Export bounds and pre-cancelled renders reject without creating a live context', async () => {
    const state = baseState(), controller = new AbortController(); controller.abort();
    await assert.rejects(Engine.renderNotes({ state, events: [], lengthBeats: 4, signal: controller.signal }), error => error.name === 'AbortError');
    await assert.rejects(Engine.renderNotes({ state, events: [], tempo: 40, lengthBeats: 1000 }), /120 seconds/);
    for (const options of [{ tempo: Infinity }, { tempo: 19 }, { tempo: 401 }, { tailSeconds: NaN }, { tailSeconds: 31 }, { lengthBeats: Infinity }]) await assert.rejects(Engine.renderNotes({ state, events: [], tempo: 96, lengthBeats: 4, ...options }), /finite|20–400/);
  });
  await check('Portable 20–400 BPM rendering and tails beyond ten seconds preserve their requested duration', async () => {
    class OfflineContext extends Context {
      constructor(channels, frames, rate) { super(); this.sampleRate = rate; this.frames = frames; this.channels = channels; }
      async startRendering() { const result = this.createBuffer(this.channels, this.frames, this.sampleRate); this.currentTime = this.frames / this.sampleRate; return result; }
    }
    scope.OfflineAudioContext = OfflineContext;
    for (const options of [{ tempo: 20, lengthBeats: .25, tailSeconds: .1 }, { tempo: 400, lengthBeats: 1, tailSeconds: 10.5 }]) {
      const state = baseState(), original = JSON.stringify(state), rendered = await Engine.renderNotes({ state, events: [], ...options });
      assert.equal(rendered.pcm.length / 2, Math.ceil((options.lengthBeats * 60 / options.tempo + options.tailSeconds) * rendered.sampleRate)); assert.equal(JSON.stringify(state), original);
    }
  });
  for (const name of passed) console.log('PASS ' + name); console.log(passed.length + ' PICNIC audio engine checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
