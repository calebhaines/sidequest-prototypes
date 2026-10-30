'use strict';
/* Real word synthesis in worker_threads plus deterministic pitch and lifecycle probes. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { Worker } = require('node:worker_threads');
const blobs = new Map(); let ordinal = 0;
class BrowserWorker {
  constructor(url) {
    const blob = blobs.get(url); this.closed = false;
    this.initialized = blob.text().then(source => {
      if (this.closed) return;
      const bridge = "const{parentPort}=require('node:worker_threads');globalThis.self=globalThis;globalThis.location={href:'blob:http://local/offline'};globalThis.postMessage=(value,transfer)=>parentPort.postMessage(value,transfer);parentPort.on('message',data=>globalThis.onmessage({data}));\n";
      this.thread = new Worker(bridge + source, { eval: true });
      this.thread.on('message', data => this.onmessage?.({ data })); this.thread.on('error', error => this.onerror?.({ message: error.message }));
    });
  }
  postMessage(message) { this.initialized.then(() => { if (!this.closed) this.thread.postMessage(message); }); }
  terminate() { this.closed = true; this.thread?.terminate(); }
}
class Param {
  constructor(value = 0) { this.value = value; this.events = []; }
  setValueAtTime(value, when) { this.events.push(['set', value, when]); this.value = value; }
  linearRampToValueAtTime(value, when) { this.events.push(['linear', value, when]); this.value = value; }
  setTargetAtTime(value, when) { this.events.push(['target', value, when]); this.value = value; }
  cancelScheduledValues(when) { this.events.push(['cancel', when]); }
  cancelAndHoldAtTime(when) { this.events.push(['hold', when]); }
}
class Node {
  constructor(context) { this.context = context; this.gain = new Param(1); this.frequency = new Param(); this.Q = new Param(); this.detune = new Param(); this.connections = []; this.starts = []; this.stops = []; }
  connect(node) { this.connections.push(node); return node; }
  disconnect(node) { this.connections = node ? this.connections.filter(item => item !== node) : []; }
  start(when) { this.starts.push(when); }
  stop(when) { this.stops.push(when); }
  getFloatTimeDomainData(target) { target.fill(0); }
}
class Context {
  constructor() { this.currentTime = 1; this.sampleRate = 48000; this.state = 'running'; this.nodes = []; this.destination = new Node(this); }
  node() { if (this.invalidated) throw new DOMException('The instrument has been unloaded.', 'AbortError'); const node = new Node(this); this.nodes.push(node); return node; }
  createGain() { return this.node(); } createBiquadFilter() { return this.node(); } createConvolver() { return this.node(); } createAnalyser() { return this.node(); }
  createBufferSource() { return this.node(); } createOscillator() { return this.node(); }
  createBuffer(channels, length, sampleRate) { const data = Array.from({ length: channels }, () => new Float32Array(length)); return { length, sampleRate, duration: length / sampleRate, numberOfChannels: channels, getChannelData: index => data[index] }; }
  async close() { this.state = 'closed'; } async resume() { this.state = 'running'; }
}
const scope = { window: null, console, Blob, Float32Array, DOMException, setTimeout, clearTimeout, AudioContext: Context, Worker: BrowserWorker,
  URL: { createObjectURL(blob) { const id = 'blob:morsel-audio-' + ++ordinal; blobs.set(id, blob); return id; }, revokeObjectURL(id) { blobs.delete(id); } } };
scope.window = scope; vm.createContext(scope);
for (const file of ['vendor/speech-assets.js', 'speech-source.js', 'audio-engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), scope, { filename: file });
const D = scope.MorselAudioDSP;
function measuredPitch(data, sampleRate, expected) {
  const start = Math.round(data.length * .4), count = Math.min(Math.round(sampleRate * .15), Math.round(data.length * .2));
  const minimum = Math.floor(sampleRate / (expected * 1.08)), maximum = Math.ceil(sampleRate / (expected * .92)), values = [];
  for (let lag = minimum; lag <= maximum; lag++) { let sum = 0, a = 0, b = 0; for (let i = start; i < start + count; i++) { const x = data[i], y = data[i + lag]; sum += x * y; a += x * x; b += y * y; } values.push(sum / Math.sqrt(a * b + 1e-20)); }
  let best = 0; for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  const a = values[best - 1] ?? values[best], b = values[best], c = values[best + 1] ?? values[best], denominator = a - 2 * b + c;
  const fraction = denominator ? Math.max(-.5, Math.min(.5, .5 * (a - c) / denominator)) : 0;
  return { hz: sampleRate / (minimum + best + fraction), correlation: b };
}
function finiteAudio(data) { let power = 0; for (const value of data) { assert(Number.isFinite(value)); assert(Math.abs(value) <= 1); power += value * value; } assert(power > .01); }
let groups = 0;
function pass(text) { groups++; console.log('PASS ' + text); }
(async () => {
  const engine = new scope.MorselAudio({ voice: 'alto', lyric: 'ah', air: 0, space: 0, vibrato: 0, volume: .7 });
  try {
    const rate = 22050, source = new Float32Array(rate);
    for (let frame = 0; frame < source.length; frame++) source[frame] = .3 * Math.sin(2 * Math.PI * 220 * frame / rate) + .15 * Math.sin(2 * Math.PI * 440 * frame / rate);
    const speech = D.analyzeSpeech({ left: source, sampleRate: rate, pitchHz: 220 });
    for (const note of [48, 60, 69]) for (const seconds of [.3, 1.6]) {
      const fitted = D.fitSpeech(speech, note, seconds), expected = D.frequency(note), pitch = measuredPitch(fitted, rate, expected);
      assert.equal(fitted.length, Math.round(seconds * rate)); finiteAudio(fitted); assert(pitch.correlation > .85);
      assert(Math.abs(1200 * Math.log2(pitch.hz / expected)) < 12, 'Pitch and duration are independent: ' + JSON.stringify({ note, seconds, pitch }));
    }
    assert.equal(D.fitSpeech(speech, 60, 122).length, rate * 122, 'A valid 120-second gate plus two-second release fits');
    assert.throws(() => D.fitSpeech(speech, 60, 122.01));
    pass('Pitch-synchronous fitting changes duration and musical pitch independently on an actual periodic source');

    const events = ['alto', 'tenor', 'bass', 'robot'].map(voice => ({ pitch: 60, voice, lyric: 'ah', beat: 0, duration: 1, velocity: .8 }));
    const stateBefore = JSON.stringify(engine.state);
    await engine.prepareNotes({ events, tempo: 120 }); assert.equal(JSON.stringify(engine.state), stateBefore);
    const printed = [], tuning = [];
    for (const event of events) {
      const audio = engine._preparedNote(event, 1.2); finiteAudio(audio.left); printed.push(audio.left);
      for (const note of [48, 60, 69]) {
        const fitted = engine._preparedNote({ ...event, pitch: note }, 1.2), expected = D.frequency(note), pitch = measuredPitch(fitted.left, fitted.sampleRate, expected);
        assert(pitch.correlation > .7, event.voice + ' voiced continuity');
        const cents = 1200 * Math.log2(pitch.hz / expected); tuning.push({ voice: event.voice, note, cents: Math.round(cents * 100) / 100 });
        assert(Math.abs(cents) < 5, event.voice + ' note tuning: ' + JSON.stringify({ note, pitch, cents }));
      }
    }
    for (let a = 0; a < printed.length; a++) for (let b = a + 1; b < printed.length; b++) assert.notDeepEqual(printed[a], printed[b]);
    pass('All four production speech profiles remain distinct and accurately tuned after musical resynthesis');
    console.log(JSON.stringify({ tuning }));

    const words = ['hello', 'kitchen', 'love'];
    for (const lyric of words) await engine.prepareNotes({ events: [{ pitch: 60, voice: 'alto', lyric, durationSeconds: .6 }] });
    const fingerprints = words.map(lyric => { const data = engine._preparedNote({ pitch: 60, voice: 'alto', lyric }, .7).left; finiteAudio(data); return Buffer.from(data.buffer).toString('base64'); });
    assert.equal(new Set(fingerprints).size, words.length);
    const before = engine.words.size;
    engine._preparedNote({ pitch: 63, voice: 'alto', lyric: 'hello' }, .137);
    engine._preparedNote({ pitch: 71, voice: 'alto', lyric: 'hello' }, 2.3);
    assert.equal(engine.words.size, before);
    assert.equal(D.identity({ pitch: 60, voice: 'alto', lyric: '' }, { lyric: 'hello' }).lyric, 'hello');
    assert.equal(D.identity({ pitch: 60, voice: 'alto', lyric: ' ' }, { lyric: '' }).lyric, 'ah');
    assert.equal(D.settings({ attack: .5, release: 2 }).attack, .5); assert.equal(D.settings({ attack: .5, release: 2 }).release, 2);
    await engine.prepareNotes({ events: [{ pitch: 60, voice: 'alto', lyric: 'hello', durationSeconds: 9.25 }] });
    const long = engine._preparedNote({ pitch: 60, voice: 'alto', lyric: 'hello' }, 9.25 + engine.state.release);
    assert(engine.noteCache.has(long.key), 'Long notes are fitted during preparation too');
    pass('Actual words produce distinct PCM; prepared base words cover new pitches and shortened seek notes without new speech jobs');

    await engine.init();
    const first = engine.scheduleNote({ pitch: 60, voice: 'alto', lyric: 'hello', when: 1.5, durationSeconds: .6, velocity: .8, source: 'first' });
    const independent = engine.scheduleNote({ pitch: 63, voice: 'alto', lyric: 'hello', when: 1.6, durationSeconds: .6, velocity: .8, source: 'independent' });
    assert.equal(first.source.starts[0], 1.5); assert.equal(first.air.starts[0], 1.5); assert.equal(first.vibrato.starts[0], 1.5);
    engine.stopNotes({ source: 'first', when: 1.55 }); assert.equal(first.cancelledAt, 1.55); assert.equal(independent.cancelledAt, undefined);
    const release = first.cancelEnd, stops = first.source.stops.length; engine.stopNotes({ source: 'first', when: 1.57 }); assert.equal(first.cancelEnd, release); assert.equal(first.source.stops.length, stops);
    assert.equal(engine.scheduleNote({ pitch: 60, voice: 'alto', lyric: 'hello', when: 1.6, durationSeconds: .1, source: 'first' }), false);
    engine.followTransport({ revision: 1, playing: true, when: 1 }); engine.followTransport({ revision: 2, playing: true, when: 1.55 }); assert.equal(first.cancelEnd, 1.55); assert.equal(independent.cancelledAt, undefined);
    const destination = engine.graph.output, beforeStop = engine.graph;
    engine.stop(); assert.notEqual(engine.graph, beforeStop); assert.equal(engine.graph.output, destination); assert(engine.retiredGraphs.has(beforeStop));
    const preview = engine.scheduleNote({ pitch: 60, voice: 'alto', lyric: 'hello', when: 1.01, durationSeconds: .5, source: 'new-preview' });
    assert(preview.bus.connections.includes(engine.graph.input)); assert(!preview.bus.connections.includes(beforeStop.input));
    engine.panic(); assert.equal(engine.records.size, 0); assert.equal(engine.sourceCuts.size, 0); assert.equal(engine.retiredGraphs.size, 0);
    pass('Prepared live sources start at their exact native timestamp; scoped cancellation, fences, repeated releases, global resets and Panic stay isolated');

    const controller = new AbortController(); controller.abort(); await assert.rejects(engine.prepareNotes({ events, signal: controller.signal }), error => error.name === 'AbortError');
    await assert.rejects(engine.preview({ pitch: 60, voice: 'alto', lyric: 'hello', signal: controller.signal }), error => error.name === 'AbortError');
    const originalPreparation = engine.prepareNotes; let releasePreparation, receivedSignal;
    engine.prepareNotes = options => { receivedSignal = options.signal; return new Promise(resolve => { releasePreparation = resolve; }); };
    const stale = new AbortController(), stalePreview = engine.preview({ pitch: 60, voice: 'alto', lyric: 'hello', signal: stale.signal });
    const noStaleNote = assert.rejects(stalePreview, error => error.name === 'AbortError');
    for (let i = 0; i < 20 && !releasePreparation; i++) await Promise.resolve();
    assert.equal(receivedSignal, stale.signal); assert(releasePreparation); stale.abort(); releasePreparation(); await noStaleNote;
    assert.equal(engine.records.size, 0, 'A preview cancelled during its own word preparation never schedules audio');
    engine.prepareNotes = originalPreparation;
    await assert.rejects(engine.renderNotes({ events, tempo: 0, lengthBeats: 4 })); await assert.rejects(engine.renderNotes({ events, tempo: 30, lengthBeats: 256 }));
    const wav = D.encodeWav(new Float32Array([.5, -.5, .25, -.25]), 48000), bytes = new Uint8Array(await wav.arrayBuffer()), view = new DataView(bytes.buffer);
    assert.equal(view.getUint16(22, true), 2); assert.equal(view.getUint32(24, true), 48000); assert.equal(view.getUint32(40, true), 8);
    const closing = new scope.MorselAudio(), preparation = closing.prepareNotes({ events: [{ pitch: 60, voice: 'alto', lyric: 'word preparation while closing', durationSeconds: 1 }] });
    const rejected = assert.rejects(preparation, error => error.name === 'AbortError');
    for (let i = 0; i < 20 && !closing.pendingWords.size; i++) await Promise.resolve();
    assert(closing.pendingWords.size); await closing.dispose(); await rejected; assert.equal(closing.words.size, 0);
    const unloading = new scope.MorselAudio(); await unloading.init();
    const unloadedContext = unloading.context, count = unloadedContext.nodes.length; unloadedContext.invalidated = true; unloadedContext.state = 'closed';
    await unloading.dispose(); await unloading.dispose(); unloading.stop(); unloading.panic();
    assert.equal(unloadedContext.nodes.length, count, 'Disposal after host invalidation must not create any audio nodes');
    assert.equal(unloading.graph, null); assert.equal(unloading.context, null);
    const currentContext = engine.context, priorNodeCount = currentContext.nodes.length; currentContext.invalidated = true; currentContext.state = 'closed';
    engine.stop(); engine.panic(); assert.equal(currentContext.nodes.length, priorNodeCount, 'Ordinary Stop/Panic also stay creation-free on an unloaded context');
    await engine.dispose(); assert.equal(engine.context, null); assert.equal(engine.words.size, 0); await assert.rejects(engine.init());
    pass('Cancelled or invalid renders do not start playback, WAV stays stereo at native rate and disposal releases audio graphs and caches');
    console.log(groups + ' MORSEL audio groups passed.');
  } finally { await engine.dispose(); scope.MorselSpeech.dispose(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
