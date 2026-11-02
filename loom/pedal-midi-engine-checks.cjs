'use strict';
/* FERMENT capture QA: real input samples, actual Core and serialized Worklet,
 * independent SMF decoding, lifecycle flushing and unchanged inactive audio. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const q = require('./mastering-checks.cjs');
const BASELINE = 'bfe1478ff9a7892c2f2901f5e5bde26362cae517';
function load() {
  const release = q.load();
  for (const name of ['pedal-midi-dsp.js', 'pedal-midi.js']) Function('window', 'globalThis', fs.readFileSync(path.join(__dirname, name), 'utf8'))(release.scope, release.scope);
  const s = release.scope;
  release.DSP = s.createLoomEngineDSP(s.createLoomEffectsDSP, s.createLoomLFODSP, s.createLoomCPUProfiler, s.createLoomTrackEQDSP, s.createLoomMasteringDSP);
  return release;
}
function baselineAvailable() {
  try { execFileSync('git', ['cat-file', '-e', BASELINE + ':loom/audio-engine.js'], { cwd: path.dirname(__dirname), stdio: 'ignore' }); return true; }
  catch (error) { if (error.code === 'ENOENT' || Number.isInteger(error.status)) return false; throw error; }
}
function fixture(release, patch = {}, ownerId = 'track-1') {
  const state = q.blank(release); state.lengthBars = 2; state.loopEnd = state.recording.punchEnd = 8;
  for (const owner of q.owners(state)) owner.level = 1;
  state.tracks[0].instrumentLive = true;
  const owner = q.owners(state).find(owner => owner.id === ownerId);
  owner.effects[0] = release.S.effect({ type: 'ferment', params: { mode: 'track', inputRange: 'auto', gate: -60, register: 'bass', retrigger: 'legato', mix: 1, ...patch } });
  if (ownerId === 'return-1') state.tracks[0].sends[0] = 1;
  return state;
}
function plucks(rate = 48000, specs = [[40, .08, .45, .08], [45, .85, .5, .12], [52, 1.6, .45, .055], [52, 2.35, .4, .1], [64, 3.1, .45, .05]], seconds = 3.9) {
  const audio = new Float32Array(Math.round(seconds * rate));
  for (const [pitch, onset, duration, gain = .09] of specs) {
    const hz = 440 * 2 ** ((pitch - 69) / 12), start = Math.round(onset * rate), frames = Math.min(audio.length - start, Math.round(duration * rate));
    for (let frame = 0; frame < frames; frame++) {
      const t = frame / rate, fade = Math.min(1, frame / (rate * .001), (frames - frame) / (rate * .003)), phase = 2 * Math.PI * hz * t;
      audio[start + frame] += gain * fade * Math.exp(-t / 1.5) * (Math.sin(phase) + .32 * Math.sin(2 * phase + .2) + .14 * Math.sin(3 * phase + .4));
    }
  }
  return { audio, specs, rate };
}
function feed(core, input, { blocks = [128], drain = true, start = 0, end = input.length } = {}) {
  let at = start, block = 0; const batches = [], left = new Float32Array(end - start), right = left.slice();
  while (at < end) {
    const to = Math.min(end, at + blocks[block++ % blocks.length]), source = input.subarray(at, to), offset = at - start;
    core.processBlock(left.subarray(offset, offset + source.length), right.subarray(offset, offset + source.length), [[source, source]]);
    if (drain) batches.push(...core.drainPedalMidi()); at = to;
  }
  return { left, right, batches };
}
function merged(batches) {
  const notes = batches.flatMap(batch => batch.events || []), last = batches.at(-1) || {};
  return { ...last, notes, capturing: !last.done };
}
function expectedNotes(take, source, tolerance = .11) {
  assert.deepEqual(take.notes.map(note => note.pitch), source.specs.map(note => note[0]), 'Input notes, repeats and rests must survive without register transposition');
  for (let index = 0; index < source.specs.length; index++) {
    const actual = take.notes[index], [pitch, onset, duration] = source.specs[index], startError = actual.startFrame / source.rate - onset, endError = actual.endFrame / source.rate - onset - duration;
    assert(startError >= -.003 && startError < .035, pitch + ' onset error ' + startError);
    assert(endError >= -.025 && endError < tolerance, pitch + ' end error ' + endError);
    assert(actual.velocity > 0 && actual.velocity <= 1); assert(actual.endFrame > actual.startFrame);
    if (index) assert(actual.startFrame > take.notes[index - 1].endFrame, 'A rest became an overlapping or stuck note');
  }
}
function decodeMidi(bytes) {
  const b = Buffer.from(bytes); assert.equal(b.toString('ascii', 0, 4), 'MThd'); assert.equal(b.readUInt32BE(4), 6); assert.equal(b.readUInt16BE(8), 0); assert.equal(b.readUInt16BE(10), 1);
  const ppq = b.readUInt16BE(12); assert(ppq > 0 && ppq < 32768); assert.equal(b.toString('ascii', 14, 18), 'MTrk');
  const end = 22 + b.readUInt32BE(18); assert.equal(end, b.length); let at = 22, tick = 0, running = 0, tempo, trackEnd = 0; const open = new Map(), notes = [];
  function vlq() { let value = 0, count = 0, byte; do { assert(at < end && ++count <= 4, 'Invalid MIDI VLQ'); byte = b[at++]; value = value * 128 + (byte & 127); } while (byte & 128); return value; }
  while (at < end) {
    tick += vlq(); let status = b[at++];
    if (status < 128) { assert(running, 'Invalid running status'); at--; status = running; } else if (status < 240) running = status;
    if (status === 255) { const type = b[at++], length = vlq(); if (type === 81) { assert.equal(length, 3); tempo = b.readUIntBE(at, 3); } if (type === 47) { assert.equal(length, 0); trackEnd = tick; } at += length; continue; }
    assert(status < 240, 'Unexpected system event'); const type = status & 240, channel = status & 15, pitch = b[at++], velocity = type === 192 || type === 208 ? null : b[at++];
    if (type === 144 && velocity) { const key = channel + ':' + pitch; assert(!open.has(key), 'Duplicate note-on without note-off'); open.set(key, { pitch, velocity, start: tick }); }
    else if (type === 128 || type === 144) { const key = channel + ':' + pitch, note = open.get(key); assert(note, 'Unmatched note-off'); notes.push({ ...note, end: tick }); open.delete(key); }
  }
  assert.equal(open.size, 0, 'MIDI ends with stuck notes'); assert.equal(at, end); assert(tempo > 0); assert(trackEnd >= Math.max(0, ...notes.map(note => note.end)));
  return { ppq, tempo, bpm: 60000000 / tempo, notes: notes.sort((a, b) => a.start - b.start), end: trackEnd };
}
function worklet(release, state, diagnostics = false) {
  const template = q.source('loom/audio-engine.js').match(/const source = (`[\s\S]*?`);/); assert(template, 'Actual serialized Worklet source is missing');
  const code = Function('window', 'createLoomEngineDSP', 'return ' + template[1])(release.scope, release.scope.createLoomEngineDSP), messages = [];
  let Processor;
  const context = { console, performance, sampleRate: 48000, currentTime: 0, AudioWorkletProcessor: class { constructor() { this.port = { postMessage: value => messages.push(value) }; } }, registerProcessor(name, type) { assert.equal(name, 'loom-eight-track'); Processor = type; } };
  vm.runInNewContext(code, context); const processor = new Processor({ processorOptions: { state, diagnostics: { enabled: diagnostics }, diagnosticsGeneration: 1 } });
  return { processor, context, messages, send(data) { processor.port.onmessage({ data }); }, feed(input) { for (let at = 0; at < input.length; at += 128) { const count = Math.min(128, input.length - at), source = input.subarray(at, at + count); context.currentTime = at / 48000; processor.process([[source, source]], [[new Float32Array(count), new Float32Array(count)]]); } } };
}
function fallback(release, state) {
  const engine = new release.scope.LoomAudio(state), context = { currentTime: 0, sampleRate: 48000, state: 'running', async resume() {}, async close() { this.state = 'closed'; } };
  engine.context = context; engine.mode = 'fallback'; engine.node = { disconnect() {} }; engine.core = new release.DSP.Core(state, {}, 48000); engine.recorder = new release.DSP.Recorder(48000, () => {}); engine.init = async () => context;
  return { engine, feed(input, blocks = [137]) { let at = 0, index = 0; while (at < input.length) { const end = Math.min(input.length, at + blocks[index++ % blocks.length]), source = input.subarray(at, end); engine.core.processBlock(new Float32Array(source.length), new Float32Array(source.length), [[source, source]]); context.currentTime = end / 48000; engine._flushPedalMidi(); at = end; } } };
}
async function run() {
  const release = load(), passed = [], skipped = [], evidence = {}, check = async (name, test) => { if (process.env.PEDAL_MIDI_ENGINE_FILTER && !new RegExp(process.env.PEDAL_MIDI_ENGINE_FILTER).test(name)) return; const value = await test(); if (value?.skip) { skipped.push({ name, reason: value.skip }); console.log('SKIP ' + name + ': ' + value.skip); return; } passed.push(name); if (value !== undefined) evidence[name] = value; console.log('PASS ' + name); };
  await check('Production Core captures real bass guitar repeats and rests on the input frame clock', () => {
    const source = plucks(), core = new release.DSP.Core(fixture(release), {}, source.rate); core.startPedalMidi({ token: 'raw-input', ownerId: 'track-1', slot: 0, tempo: 117 });
    const result = feed(core, source.audio); core.stopPedalMidi(); const take = merged([...result.batches, ...core.drainPedalMidi()]); expectedNotes(take, source); assert.equal(take.frames, source.audio.length); assert.equal(take.tempo, 117); assert(take.done); assert.equal(core.pedalMidi, null); assert.deepEqual(core.drainPedalMidi(), []); return take;
  });
  await check('Capture notes are independent of irregular blocks 32-frame automation chunks and profiling', () => {
    const source = plucks(), takes = [];
    for (const [blocks, profiling] of [[[128], false], [[1, 17, 137, 251], false], [[256], true]]) {
      const state = fixture(release); state.tracks[0].automation = [{ target: 'fx:0:cutoff', effectType: 'ferment', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: 900 }, { beat: 8, value: 2100 }] }];
      const core = new release.DSP.Core(state, {}, 48000); core.setDiagnostics({ enabled: profiling }); core.startPedalMidi({ token: 'partition', ownerId: 'track-1', slot: 0, tempo: 120 });
      const result = feed(core, source.audio, { blocks }); core.stopPedalMidi(); takes.push(merged([...result.batches, ...core.drainPedalMidi()]));
    }
    for (const take of takes) { expectedNotes(take, source); assert.deepEqual(take.notes, takes[0].notes); assert.equal(take.frames, source.audio.length); }
    return { notes: takes[0].notes, partitions: ['128', '1/17/137/251', '256 profiled'], automation: 32 };
  });
  await check('Serialized production AudioWorklet emits capture independently of meter reads and profiling', () => {
    const source = plucks(), results = [];
    for (const diagnostics of [false, true]) { const h = worklet(release, fixture(release), diagnostics); h.send({ type: 'pedalMidiStart', requestId: 1, settings: { token: 'worklet', ownerId: 'track-1', slot: 0, tempo: 120 } }); h.feed(source.audio); h.send({ type: 'pedalMidiStop', requestId: 2, token: 'worklet', reason: 'stopped' }); const take = merged(h.messages.filter(message => message.type === 'pedalMidi').map(message => message.batch)); expectedNotes(take, source); assert(take.done); results.push(take); }
    assert.deepEqual(q.plain(results[0].notes), q.plain(results[1].notes)); return { events: results[0].notes.length, sampleRate: results[0].sampleRate, profilingIndependent: true };
  });
  await check('Stop panic seek and target removal replacement reordering or freeze flush an open note once', () => {
    const source = plucks(48000, [[45, 0, .5]], .5), report = {};
    for (const action of ['stop', 'panic', 'seek', 'remove', 'replace', 'reorder', 'freeze']) {
      const state = fixture(release), core = new release.DSP.Core(state, {}, 48000); core.startPedalMidi({ token: action, ownerId: 'track-1', slot: 0, tempo: 120 }); feed(core, source.audio, { drain: false });
      if (action === 'stop') core.stop(); else if (action === 'panic') core.panic(); else if (action === 'seek') core.seek(2);
      else { const next = release.S.copy(state); if (action === 'remove') next.tracks[0].effects[0] = null; if (action === 'replace') next.tracks[0].effects[0] = release.S.effect({ type: 'prism', params: {} }); if (action === 'reorder') { next.tracks[0].effects[1] = next.tracks[0].effects[0]; next.tracks[0].effects[0] = null; } if (action === 'freeze') next.tracks[0].freeze = { sampleRate: 48000, bodyFrames: 192000, totalFrames: 192000, fingerprint: 'qa', chunks: [] }; core.setState(next); }
      const take = merged(core.drainPedalMidi()); assert(take.done, action); assert.equal(take.notes.length, 1, action); assert.equal(take.notes[0].pitch, 45); assert(take.notes[0].endFrame <= source.audio.length); assert.equal(core.pedalMidi, null); assert.deepEqual(core.drainPedalMidi(), []); report[action] = take.reason;
    }
    return report;
  });
  await check('Public fallback API preserves bounded detached takes session tokens and source-only offline exports', async () => {
    const state = fixture(release), h = fallback(release, state), events = []; const unsubscribe = h.engine.subscribePedalMidi(value => events.push(value));
    const first = await h.engine.startPedalMidi('track-1', 0, { tempo: 137 }), source = plucks(48000, [[45, .04, .35]], .6); assert.throws(() => h.engine.clearPedalMidiTake(), /stop/i); h.feed(source.audio);
    const take = await h.engine.stopPedalMidi(); expectedNotes(take, source); assert.equal(take.tempo, 137); assert.equal(take.frames, source.audio.length); assert(!take.capturing); assert(events.some(event => event?.notes.length));
    take.notes[0].pitch = 0; assert.equal(h.engine.getPedalMidiTake().notes[0].pitch, 45, 'Public takes must be detached');
    const second = await h.engine.startPedalMidi('track-1', 0); assert.notEqual(second.token, first.token); h.engine._message({ type: 'pedalMidi', batch: { token: first.token, frames: 1, done: true, events: [{ pitch: 12, startFrame: 0, endFrame: 1, velocity: 1 }] } }); assert.equal(h.engine.getPedalMidiTake().token, second.token); assert.equal(h.engine.getPedalMidiTake().notes.length, 0);
    h.feed(source.audio); const before = h.engine.getPedalMidiTake(); await h.engine.renderMasterPCM(state, {}, { startBeat: 0, endBeat: .25, tailSeconds: 0, sampleRate: 8000 }); await h.engine.renderWav(state, {}, { startBeat: 0, endBeat: .25, tailSeconds: 0 }); assert.deepEqual(h.engine.getPedalMidiTake(), before, 'Offline master and WAV renders must not feed the live capture');
    await h.engine._closeAudioGraph(); const closed = h.engine.getPedalMidiTake(); assert(!closed.capturing); assert.equal(closed.reason, 'audio-closed'); assert(closed.notes.length); unsubscribe(); h.engine.clearPedalMidiTake(); assert.equal(h.engine.getPedalMidiTake(), null); assert.equal(h.engine._pedalMidiRequests.size, 0); return { events: events.length, frames: closed.frames, reason: closed.reason };
  });
  await check('Capture guards reject unsupported targets and Stop cancels pending audio initialization', async () => {
    for (const patch of [{ mode: 'chord' }, { bypass: true }, { mix: 0 }]) { const h = fallback(release, fixture(release, patch)); await assert.rejects(h.engine.startPedalMidi('track-1', 0), /enable|tracking/i); assert.equal(h.engine.getPedalMidiTake(), null); }
    const h = fallback(release, fixture(release)); for (const args of [['missing', 0], ['track-1', 4], ['master', 0], ['track-1', -1], ['track-1', .5]]) await assert.rejects(h.engine.startPedalMidi(...args), /choose|insert/i);
    let resolveInit, entered; const ready = new Promise(resolve => entered = resolve); h.engine.init = () => { entered(); return new Promise(resolve => resolveInit = resolve); };
    const pending = h.engine.startPedalMidi('track-1', 0); await ready; await h.engine.stopPedalMidi(); resolveInit(h.engine.context); await assert.rejects(pending, /cancel/i); assert.equal(h.engine.getPedalMidiTake(), null); assert.equal(h.engine.core.pedalMidi, null);
    const graph = fallback(release, fixture(release)), engine = graph.engine, context = engine.context, core = engine.core, synth = core.slots[0][0].dsp, connected = new Set(); let calls = 0;
    context.destination = {}; context.createScriptProcessor = frames => ({ bufferSize: frames, connect() {}, disconnect() {} }); engine.node = context.createScriptProcessor(256); connected.add(engine.node); engine._processingFrames = 256; engine.merger = { connect: node => connected.add(node), disconnect: node => connected.delete(node) }; engine._fallbackAudioHandler = () => calls++;
    const preferences = engine.getAudioSettings(), previous = engine.node;
    async function warming() { for (let i = 0; i < 20 && !engine._pedalMidiWarmup; i++) await Promise.resolve(); assert(engine._pedalMidiWarmup, 'Capture did not await its fallback graph warm-up'); }
    const start = engine.startPedalMidi('track-1', 0); await warming(); assert.equal(engine.node.bufferSize, 1024); const buffered = engine.node; buffered.onaudioprocess({}); buffered.onaudioprocess({}); await start;
    assert.equal(calls, 2); assert.strictEqual(engine.context, context); assert.strictEqual(engine.core, core); assert.strictEqual(engine.core.slots[0][0].dsp, synth); assert(!connected.has(previous)); assert(connected.has(buffered)); assert.deepEqual(engine.getAudioSettings(), preferences);
    const staleCallback = buffered.onaudioprocess; await engine.stopPedalMidi(); assert.equal(engine.node.bufferSize, 256); assert(!connected.has(buffered)); assert.equal(connected.size, 1); staleCallback({}); assert.equal(calls, 2, 'A retired fallback callback reached the live Core');
    const canceled = engine.startPedalMidi('track-1', 0); await warming(); await engine.stopPedalMidi(); await assert.rejects(canceled, /cancel/i); assert.equal(engine.node.bufferSize, 256); assert.equal(engine.core.pedalMidi, null); assert.equal(engine._pedalMidiBufferLease, null);
    return { chordBypassBlendRejected: true, pendingStartCanceled: true, temporaryBuffer: 1024, restoredBuffer: 256, synthAndContextRetained: true, staleCallbackIgnored: true, warmupCanceled: true };
  });
  await check('Public state replacement flushes capture even when the replacement is another FERMENT', async () => {
    const input = plucks(48000, [[45, 0, .35]], .35).audio, report = {};
    for (const action of ['same-type replacement', 'remove', 'reorder', 'freeze']) {
      const state = fixture(release), h = fallback(release, state); await h.engine.startPedalMidi('track-1', 0); h.feed(input);
      const next = release.S.copy(state); if (action === 'same-type replacement') next.tracks[0].effects[0] = release.S.effect({ type: 'ferment', params: { register: 'guitar' } }); if (action === 'remove') next.tracks[0].effects[0] = null; if (action === 'reorder') { next.tracks[0].effects[1] = next.tracks[0].effects[0]; next.tracks[0].effects[0] = null; } if (action === 'freeze') next.tracks[0].freeze = { sampleRate: 48000, bodyFrames: 192000, totalFrames: 192000, fingerprint: 'qa', chunks: [] };
      h.engine.setState(next); await Promise.resolve(); const take = h.engine.getPedalMidiTake(); assert(!take.capturing, action); assert.equal(take.notes.length, 1, action); assert.equal(take.notes[0].pitch, 45); report[action] = take.reason;
    }
    return report;
  });
  await check('Late capture-start acknowledgments cannot revive a stopped or newer MIDI session', async () => {
    for (const action of ['stop', 'restart']) {
      const h = fallback(release, fixture(release)), request = h.engine._requestPedalMidi.bind(h.engine); let enter, releaseAck, first = true;
      const entered = new Promise(resolve => enter = resolve), delayed = new Promise(resolve => releaseAck = resolve);
      h.engine._requestPedalMidi = async (type, values) => { await request(type, values); if (type === 'pedalMidiStart' && first) { first = false; enter(); await delayed; } };
      const pending = h.engine.startPedalMidi('track-1', 0); await entered; const oldToken = h.engine.getPedalMidiTake().token;
      if (action === 'stop') await h.engine.stopPedalMidi(); else await h.engine.startPedalMidi('track-1', 0);
      releaseAck(); await assert.rejects(pending, /cancel/i); const value = h.engine.getPedalMidiTake();
      if (action === 'stop') { assert(!value.capturing); assert.equal(h.engine.core.pedalMidi, null); } else { assert(value.capturing); assert.notEqual(value.token, oldToken); assert.equal(h.engine.core.pedalMidi.token, value.token); await h.engine.stopPedalMidi(); }
    }
    return { stoppedSessionStayedStopped: true, newSessionRetained: true };
  });
  await check('The production Core duration limit bounds frames and closes its note event stream', () => {
    const rate = 8000, state = fixture(release); state.tempo = 240; const source = plucks(rate, [[45, .04, .3]], 64.1), core = new release.DSP.Core(state, {}, rate); core.startPedalMidi({ token: 'bounded-duration', ownerId: 'track-1', slot: 0, tempo: 240 }); const result = feed(core, source.audio, { blocks: [4096] }), take = merged([...result.batches, ...core.drainPedalMidi()]);
    assert(take.done); assert.equal(take.reason, 'duration limit'); assert.equal(take.frames, 64 * rate); assert.equal(take.notes.length, 1); assert.equal(take.notes[0].pitch, 45); assert(take.notes[0].endFrame < take.frames); assert.equal(core.pedalMidi, null); return { maxBeats: 256, frames: take.frames, rate, reason: take.reason };
  });
  await check('Actual captured MIDI decodes to matching tempo pitches note-offs and explicit timing edits', () => {
    const source = plucks(), core = new release.DSP.Core(fixture(release), {}, 48000); core.startPedalMidi({ token: 'smf', ownerId: 'track-1', slot: 0, tempo: 123 }); const result = feed(core, source.audio); core.stopPedalMidi(); const take = merged([...result.batches, ...core.drainPedalMidi()]);
    const parsed = decodeMidi(release.scope.LoomPedalMidi.toMidi(take)), pattern = release.scope.LoomPedalMidi.toPattern(take); assert(Math.abs(parsed.bpm - 123) < .001); assert.deepEqual(parsed.notes.map(note => note.pitch), take.notes.map(note => note.pitch));
    for (let i = 0; i < take.notes.length; i++) { assert(Math.abs(parsed.notes[i].start / parsed.ppq - pattern.notes[i].beat) < 1 / parsed.ppq); assert(Math.abs(parsed.notes[i].end / parsed.ppq - pattern.notes[i].beat - pattern.notes[i].duration) < 1 / parsed.ppq); }
    const snapped = decodeMidi(release.scope.LoomPedalMidi.toMidi(take, { trimLeading: true, snap: .25 })); assert.equal(snapped.notes[0].start, 0); assert(snapped.notes.every(note => note.start % (snapped.ppq / 4) === 0)); return { bpm: parsed.bpm, notes: parsed.notes, trimmedFirstTick: snapped.notes[0].start };
  });
  await check('Inactive capture leaves production FERMENT PCM exactly equal to the released engine', () => {
    if (!baselineAvailable()) return { skip: 'Published source archive has no Git baseline ' + BASELINE + '; run in the repository for the exact released-audio comparison.' };
    const old = q.load(BASELINE), input = plucks(48000, [[45, 0, .4]], .6).audio, hashes = {};
    for (const mode of ['track', 'chord']) for (const register of ['played', 'bass', 'guitar']) { const state = fixture(release, { mode, register }), a = new old.DSP.Core(state, {}, 48000), b = new release.DSP.Core(state, {}, 48000); a.resumeAudition(0); b.resumeAudition(0); const reference = feed(a, input, { drain: false }), actual = feed(b, input); assert.deepEqual(actual.left, reference.left, mode + '/' + register); assert.deepEqual(actual.right, reference.right); assert.deepEqual(b.drainPedalMidi(), []); hashes[mode + '/' + register] = q.hash([actual.left, actual.right]); }
    return { baseline: BASELINE, hashes };
  });
  console.log(passed.length + ' FERMENT MIDI engine groups passed' + (skipped.length ? '; ' + skipped.length + ' explicitly skipped' : '') + '.'); console.log(JSON.stringify({ ...evidence, ...(skipped.length ? { skipped } : {}) })); return { passed, skipped, evidence };
}
module.exports = { load, fixture, plucks, feed, merged, expectedNotes, decodeMidi, worklet, fallback, run };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
