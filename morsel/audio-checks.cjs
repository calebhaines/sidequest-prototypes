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

for (const file of ['vendor/signalsmith/assets.js', 'audio-engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), scope, { filename: file });
const D = scope.MorselAudioDSP;
function decodeFixture(name = 'bella-hello.wav') {
  const buffer = fs.readFileSync(path.join(__dirname, 'vendor/signalsmith/fixtures', name)), data = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let at = 12, rate = 0, channels = 0, bits = 0, start = -1, bytes = 0;
  while (at + 8 <= buffer.length) { const id = buffer.toString('ascii', at, at + 4), size = data.getUint32(at + 4, true); if (id === 'fmt ') { rate = data.getUint32(at + 12, true); channels = data.getUint16(at + 10, true); bits = data.getUint16(at + 22, true); } if (id === 'data') { start = at + 8; bytes = size; } at += 8 + size + size % 2; }
  assert(start >= 0 && rate === 24000 && [1, 2].includes(channels) && [16, 32].includes(bits));
  const stride = bits / 8, left = new Float32Array(bytes / stride / channels); for (let frame = 0; frame < left.length; frame++) left[frame] = bits === 16 ? data.getInt16(start + frame * stride * channels, true) / 32768 : data.getFloat32(start + frame * stride * channels, true);
  return { left, sampleRate: rate, pitchHz: 0 };
}
const fixture = decodeFixture(); let speechCalls = 0;
scope.MorselSpeech = { prepare: async () => {}, render: async () => { speechCalls++; return { ...fixture, left: fixture.left.slice() }; } };
function metrics(data) { let power = 0, peak = 0, longest = 0, run = 0; for (const value of data) { assert(Number.isFinite(value)); power += value * value; peak = Math.max(peak, Math.abs(value)); if (Math.abs(value) < 1e-8) { run++; longest = Math.max(longest, run); } else run = 0; } return { rms: Math.sqrt(power / data.length), peak, longest }; }
function audibleOnset(data, rate) {
  let peak = 0; for (const value of data) peak = Math.max(peak, Math.abs(value));
  const width = Math.round(rate * .02), threshold = Math.max(.001, peak * .01);
  for (let at = 0; at < data.length; at += width) { const end = Math.min(data.length, at + width); let power = 0; for (let frame = at; frame < end; frame++) power += data[frame] * data[frame]; if (Math.sqrt(power / (end - at)) >= threshold) return at / rate; }
  return Infinity;
}
let groups = 0; const pass = text => { groups++; console.log('PASS ' + text); };
(async () => {
  const engine = new scope.MorselAudio({ voice: 'alto', lyric: 'hello', air: 0, space: 0, vibrato: 0, volume: .7 });
  try {
    const speech = D.analyzeSpeech(D.trimSpeech(fixture));
    assert(speech.pitchHz > 100 && speech.pitchHz < 400 && speech.pitchConfidence > .7 && speech.voicedFrames.length > 20);
    const contour = speech.voicedFrames.map(frame => frame.hz); assert(Math.max(...contour) / Math.min(...contour) > 1.2, 'The real neural fixture contains natural intonation');
    const seconds = speech.left.length / speech.sampleRate, copy = { ...speech, pitchHz: 220, pitchConfidence: 1, voicedFrames: [] };
    const direct = await D.fitSpeech({ ...copy, pitchHz: 440 }, 69, seconds); assert.deepEqual(direct, speech.left, 'An unchanged voice passes through byte-exactly instead of unnecessary vocoding');
    pass('A real neural phrase retains its natural pitch contour; unchanged speech passes through exactly');
    const trimmedWord = D.trimSpeech({ ...fixture, text: 'Hello from the kitchen' });
    assert(audibleOnset(fixture.left, 24000) > .5 && audibleOnset(trimmedWord.left, 24000) <= .12, 'Actual word padding is removed while a phonetic prepad remains');
    let tailEnergy = 0, wordEnergy = 0; for (let i = 0; i < fixture.left.length; i++) { wordEnergy += fixture.left[i] * fixture.left[i]; if (i >= trimmedWord.trimEnd) tailEnergy += fixture.left[i] * fixture.left[i]; }
    assert(trimmedWord.trimStart > 24000 * .5 && tailEnergy < wordEnergy * .0001, 'Leading decoder padding changes while the final word and consonant energy remain');
    const aliasOnsets = [];
    for (const token of ['ah', 'ee', 'oo', 'mm']) {
      const raw = decodeFixture('soprano-' + token + '.wav'), analyzed = D.analyzeSpeech(D.trimSpeech({ ...raw, text: token })), fitted = await D.fitSpeech(analyzed, 60, .78);
      const before = audibleOnset(raw.left, 24000), after = audibleOnset(fitted, 24000); aliasOnsets.push({ token, before, after });
      assert(before > .3 && analyzed.vowelCoreTrimmed && after <= .08, token + ' plays its real voiced core on the note instead of stretching decoder residue');
      assert(metrics(fitted.subarray(2400, 14400)).rms > .01, token + ' remains audibly sustained through the note');
    }
    const wordOnsets = [];
    for (const voice of ['alto', 'tenor', 'bass', 'robot']) {
      const raw = decodeFixture('word-' + voice + '-hello-kitchen.wav'), trimmed = D.trimSpeech({ ...raw, text: 'hello kitchen' }), analyzed = D.analyzeSpeech(trimmed), fitted = await D.fitSpeech(analyzed, 60, 1.53);
      const before = audibleOnset(raw.left, 24000), after = audibleOnset(fitted, 24000); wordOnsets.push({ voice, before, after, trimStart: trimmed.trimStart / 24000 });
      assert(before > .3 && after <= .18, voice + ' real words start on their note instead of playing a quiet decoder island');
      assert(!analyzed.vowelCoreTrimmed, 'Ordinary word consonants never use vowel-only core cropping');
      let full = 0, tail = 0; for (let i = 0; i < raw.left.length; i++) { full += raw.left[i] * raw.left[i]; if (i >= trimmed.trimEnd) tail += raw.left[i] * raw.left[i]; }
      assert(tail < full * .0001, voice + ' final consonant energy remains');
    }
    console.log(JSON.stringify({ meaningfulAliasOnsets: aliasOnsets, meaningfulWordOnsets: wordOnsets }));
    pass('Actual neural word padding and all four Soprano vowel/hum prefixes are removed without truncating word tails');

    const rows = [];
    for (const pitch of [36, 48, 60, 69, 84]) {
      const left = await D.fitSpeech(speech, pitch, seconds), m = metrics(left), analyzed = D.analyzeSpeech({ left, sampleRate: speech.sampleRate, pitchHz: D.frequency(pitch) });
      assert.equal(left.length, speech.left.length); assert(m.rms > .015 && m.peak < .95);
      assert(analyzed.pitchHz > 0); rows.push({ pitch, expectedHz: D.frequency(pitch), medianHz: analyzed.pitchHz, cents: 1200 * Math.log2(analyzed.pitchHz / D.frequency(pitch)), rms: m.rms });
    }
    console.log(JSON.stringify({ naturalRegister: rows }));
    for (let index = 1; index < rows.length; index++) assert(rows[index].medianHz > rows[index - 1].medianHz * 1.25, 'Melody notes follow clearly increasing register');
    for (const row of rows) assert(Math.abs(row.cents) < 60, 'Natural intonation remains centered on the musical note: ' + JSON.stringify(row));
    // The former renderer inserted 139-sample zero gaps in C2. A sustained
    // voiced signal must stay continuous when moved down from A3 to C2.
    const pure = new Float32Array(24000); for (let i = 0; i < pure.length; i++) pure[i] = .25 * Math.sin(2 * Math.PI * 220 * i / 24000) + .1 * Math.sin(2 * Math.PI * 440 * i / 24000);
    const held = D.analyzeSpeech({ left: pure, sampleRate: 24000, pitchHz: 220 }), low = await D.fitSpeech(held, 36, 1.2), middle = low.subarray(6000, 22000);
    assert(metrics(middle).longest < 24, 'Low notes have no periodic silent grain gaps');
    const brief = D.analyzeSpeech({ left: pure.slice(0, Math.round(.042 * 24000)), sampleRate: 24000, pitchHz: 0 }); assert(brief.pitchConfidence > .7 && Math.abs(brief.pitchHz - 220) < 10, 'A short neural humming/vowel token remains voiced');
    const briefHeld = await D.fitSpeech(brief, 60, .8); assert(metrics(briefHeld.subarray(5000, 17000)).longest < 24);
    for (const token of ['mm', 'ee']) {
      const raw = decodeFixture('natural-' + token + '.wav'), seeded = D.analyzeSpeech(D.trimSpeech({ ...raw, text: token }));
      assert(seeded.sustainSeeded && seeded.left.length > raw.left.length * 3 && seeded.pitchConfidence > .7, token + ' has a stable native-pitch seed');
      const result = await D.fitSpeech(seeded, 60, 1), voiced = D.analyzeSpeech({ left: result, sampleRate: 24000, pitchHz: 0 });
      assert(Math.abs(1200 * Math.log2(voiced.pitchHz / D.frequency(60))) < 90, token + ' stays musical after a genuine short neural token is sustained');
      assert(metrics(result.subarray(6000, 18000)).longest < 24, token + ' stays continuous');
    }
    pass('Waveform-preserving pitch shifts cover C2–C6 without gaps; actual 42 ms hum and 67 ms vowel tokens sustain musically');

    const short = await D.fitSpeech(speech, 60, .65), long = await D.fitSpeech(speech, 60, 5.25);
    assert.equal(short.length, Math.round(.65 * 24000)); assert.equal(long.length, Math.round(5.25 * 24000)); assert(metrics(short).rms > .01 && metrics(long).rms > .01);
    await assert.rejects(D.fitSpeech(speech, 60, 122.01)); await assert.rejects(D.fitSpeech(speech, 20, 1));
    const cancelled = new AbortController(); cancelled.abort(); await assert.rejects(D.fitSpeech(speech, 60, 1, { signal: cancelled.signal }), error => error.name === 'AbortError');
    pass('Independent short and long note durations produce finite complete buffers, with bounded and cancellable preparation');

    const event = { pitch: 60, voice: 'alto', lyric: 'hello', durationSeconds: .8, velocity: .8 };
    const before = JSON.stringify(engine.state); await engine.prepareNotes({ events: [event] }); assert.equal(JSON.stringify(engine.state), before); assert.equal(speechCalls, 1);
    await engine.prepareNotes({ events: [{ ...event, pitch: 67, durationSeconds: 1.3 }] }); assert.equal(speechCalls, 1, 'Changing pitch/length reuses the natural speech');
    const note = engine._preparedNote(event, .8 + engine.state.release); assert(note.left.length === Math.round((.8 + engine.state.release) * 24000));
    const count = engine.noteCache.size, heldSeek = engine._preparedNote(event, .137); assert(heldSeek.left === note.left || engine.noteCache.has(heldSeek.key)); assert.equal(engine.noteCache.size, count, 'A shortened seek uses a prepared waveform without running DSP on the scheduler');
    assert.throws(() => engine._preparedNote({ ...event, pitch: 73 }, 1), /Prepare this note/);
    pass('Cached words prepare authored pitches and lengths ahead of time; seeks never start speech or stretching in the scheduler');

    await engine.init(); const first = engine.scheduleNote({ ...event, when: 1.5, source: 'first' }), independent = engine.scheduleNote({ ...event, pitch: 67, when: 1.6, durationSeconds: 1.3, source: 'independent' });
    assert.equal(first.source.starts[0], 1.5); assert.equal(first.air.starts[0], 1.5); assert.equal(first.vibrato.starts[0], 1.5);
    engine.stopNotes({ source: 'first', when: 1.55 }); assert.equal(first.cancelledAt, 1.55); assert.equal(independent.cancelledAt, undefined);
    const end = first.cancelEnd; engine.stopNotes({ source: 'first', when: 1.57 }); assert.equal(first.cancelEnd, end);
    assert.equal(engine.scheduleNote({ ...event, when: 1.6, source: 'first' }), false);
    engine.followTransport({ revision: 1, playing: true, when: 1 }); engine.followTransport({ revision: 2, playing: true, when: 1.55 }); assert.equal(first.cancelEnd, 1.55); assert.equal(independent.cancelledAt, undefined);
    const destination = engine.graph.output, old = engine.graph; engine.stop(); assert.notEqual(engine.graph, old); assert.equal(engine.graph.output, destination); assert(engine.retiredGraphs.has(old));
    const fresh = engine.scheduleNote({ ...event, when: 1.01, source: 'fresh' }); assert(fresh.bus.connections.includes(engine.graph.input)); assert(!fresh.bus.connections.includes(old.input));
    engine.panic(); assert.equal(engine.records.size, 0); assert.equal(engine.retiredGraphs.size, 0);
    pass('Exact source starts, isolated cancellation, room reset and immediate audition preserve their lifecycle behavior');

    // A cancelled preview must not poison another caller sharing the same fit.
    const signal = new AbortController(); const pending = engine._prepareNote({ ...event, pitch: 62 }, 1.2345, signal.signal); const rejected = assert.rejects(pending, error => error.name === 'AbortError');
    const joined = engine._prepareNote({ ...event, pitch: 62 }, 1.2345); signal.abort(); await rejected; const prepared = await joined; assert(prepared.left.length > 0);
    const savedBytes = engine.noteBytes, cacheBeforeBudget = [...engine.noteCache.keys()]; engine.noteBytes = 64 * 1024 * 1024 - 4;
    await assert.rejects(engine.prepareNotes({ events: [{ ...event, pitch: 72, durationSeconds: .2 }] }), /64 MiB/);
    assert.deepEqual([...engine.noteCache.keys()], cacheBeforeBudget, 'Budget failure never silently evicts an earlier prepared note'); engine.noteBytes = savedBytes;
    const nodes = engine.context.nodes.length; engine.context.invalidated = true; await engine.dispose(); await engine.dispose(); engine.stop(); engine.panic(); assert.equal(engine.disposed, true); assert.equal(engine.context, null); assert.equal(engine.stretch.worker, null); assert.equal(nodes > 0, true);
    pass('Shared preparation survives one caller cancelling, and unloaded disposal is idempotent and creates no audio nodes');
  } finally { await engine.dispose(); D.disposeDiagnostics(); }
  console.log(groups + ' MORSEL natural-voice audio groups passed.');
})().catch(error => { console.error(error); D.disposeDiagnostics(); process.exitCode = 1; });
