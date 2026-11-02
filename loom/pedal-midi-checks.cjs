'use strict';
// Native FERMENT transcription, sample-clock lifecycle and independent SMF checks.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');
globalThis.window = globalThis;
const shared = fs.existsSync(path.join(__dirname, 'shared/pattern-schema.js')) ? path.join(__dirname, 'shared/pattern-schema.js') : path.resolve(__dirname, '../shared/pattern-schema.js');
vm.runInThisContext(fs.readFileSync(shared, 'utf8'));
for (const file of ['pedal-synth-tracker.js', 'pedal-midi-dsp.js', 'pedal-synth-dsp.js', 'pedal-midi.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), { filename: file });
const M = createLoomPedalMidiDSP(), factory = createLoomPedalSynthDSP(), H = LoomPedalMidi;
let passed = 0; const check = (name, run) => { run(); passed++; console.log('PASS ' + name); };
const copy = value => JSON.parse(JSON.stringify(value));
function observe(capture, count, frequency = 440, gate = true, options = {}) {
  for (let frame = 0; frame < count; frame++) capture.observe(frequency * Math.pow(2, (options.vibrato ? options.vibrato * Math.sin(2 * Math.PI * 5 * frame / capture.sampleRate) : 0) / 12), .99, options.level ?? .7, gate, frame % 20 === 0, frame === 0 && gate);
}
function makeSource(spans, rate = 48000) {
  const data = new Float32Array(spans.reduce((sum, span) => sum + Math.round(span.seconds * rate), 0)); let at = 0, phase = 0;
  for (const span of spans) {
    const frames = Math.round(span.seconds * rate);
    for (let frame = 0; frame < frames; frame++) {
      const hz = (span.hz || 0) * Math.pow(2, (span.vibrato || 0) * Math.sin(2 * Math.PI * 5 * frame / rate) / 12);
      phase += 2 * Math.PI * hz / rate;
      const edge = Math.min(1, frame / (rate * .003), (frames - frame) / (rate * .003)), decay = span.decay ? Math.exp(-frame / rate / span.decay) : 1;
      data[at + frame] = hz ? (span.gain ?? .1) * edge * decay * (Math.sin(phase) + .2 * Math.sin(phase * 2)) : 0;
    }
    at += frames;
  }
  return [data, data.slice()];
}
function render(source, patch = {}, { block = 128, capture = true, rate = 48000, maker = factory, drain = false } = {}) {
  const dsp = maker.create(rate, patch), output = source.map(channel => channel.slice()), events = [];
  if (capture) dsp.startMidiCapture({ token: 'native-take', tempo: 120 });
  for (let at = 0; at < output[0].length; at += block) {
    dsp.process(output[0].subarray(at, at + block), output[1].subarray(at, at + block), { tempo: 120, beat: at / rate * 2, playing: true });
    if (capture && drain) events.push(...dsp.drainMidiEvents().events);
  }
  if (!capture) return { dsp, output };
  dsp.stopMidiCapture('stopped'); const batch = dsp.drainMidiEvents(); events.push(...batch.events);
  return { dsp, output, batch: { ...batch, events }, take: { ...batch, notes: events } };
}
function equalAudio(a, b, name) { for (let channel = 0; channel < 2; channel++) assert(Buffer.from(a[channel].buffer, a[channel].byteOffset, a[channel].byteLength).equals(Buffer.from(b[channel].buffer, b[channel].byteOffset, b[channel].byteLength)), name); }
function parseMidi(bytes) {
  const u16 = at => bytes[at] * 256 + bytes[at + 1], u32 = at => bytes[at] * 16777216 + bytes[at + 1] * 65536 + bytes[at + 2] * 256 + bytes[at + 3];
  assert.equal(Buffer.from(bytes.subarray(0, 4)).toString(), 'MThd'); assert.equal(u32(4), 6); assert.equal(u16(8), 0); assert.equal(u16(10), 1); assert.equal(u16(12), 960);
  assert.equal(Buffer.from(bytes.subarray(14, 18)).toString(), 'MTrk'); assert.equal(u32(18), bytes.length - 22);
  let at = 22, tick = 0; const events = [];
  const variable = () => { let value = 0, length = 0, byte; do { assert(at < bytes.length); byte = bytes[at++]; value = value * 128 + (byte & 127); assert(++length <= 4); } while (byte & 128); return value; };
  while (at < bytes.length) {
    tick += variable(); const status = bytes[at++];
    if (status === 255) { const type = bytes[at++], length = variable(), data = bytes.slice(at, at + length); at += length; events.push({ tick, type, data: Array.from(data) }); }
    else { assert([128, 144].includes(status & 240)); events.push({ tick, status, pitch: bytes[at++], velocity: bytes[at++] }); }
  }
  assert.equal(events.at(-1).type, 47); return events;
}

check('Capture uses monotonic sample time, preserves leading silence and closes musical gates without synth-release tails', () => {
  const capture = new M.Capture(8000); capture.start({ token: 'clock', tempo: 120 }); capture.advance(800);
  observe(capture, 2000); observe(capture, 800, 0, false); observe(capture, 2000); capture.stop(); const batch = capture.drain();
  assert.equal(batch.frames, 5600); assert.equal(batch.done, true); assert.deepEqual(batch.events.map(note => note.pitch), [69, 69]);
  assert.equal(batch.events[0].startFrame, 800); assert.equal(batch.events[0].endFrame, 2800); assert.equal(batch.events[1].startFrame, 3600); assert.equal(batch.events[1].endFrame, 5600);
  assert(batch.events.every(note => note.velocity > 0 && note.velocity <= 1));
});
check('Pitch hysteresis retains vibrato as one held note while confirmed legato semitones become separate notes', () => {
  const capture = new M.Capture(8000); capture.start({ token: 'vibrato', tempo: 96 }); observe(capture, 4000, 440, true, { vibrato: .55 }); capture.stop();
  assert.deepEqual(capture.drain().events.map(note => note.pitch), [69]);
  capture.start({ token: 'legato', tempo: 96 }); observe(capture, 1600, 440); for (let frame = 0; frame < 1600; frame++) capture.observe(440 * Math.pow(2, 1 / 12), .99, .7, true, frame % 20 === 0, false); capture.stop();
  const notes = capture.drain().events; assert.deepEqual(notes.map(note => note.pitch), [69, 70]); assert.equal(notes[0].endFrame, notes[1].startFrame); assert.equal(notes[1].startFrame, 1600);
  capture.start({ token: 'quick-legato', tempo: 120 });
  for (const pitch of [69, 70, 69, 68]) for (let frame = 0; frame < 320; frame++) capture.observe(440 * 2 ** ((pitch - 69) / 12), .99, .7, true, frame % 20 === 0, false);
  capture.stop(); const quick = capture.drain().events;
  assert.deepEqual(quick.map(note => note.pitch), [69, 70, 69, 68], 'Forty-millisecond legato semitones remain distinct.');
  assert.deepEqual(quick.map(note => note.startFrame), [0, 320, 640, 960]);
});
check('Duration and note caps finalize safely and undrained sessions cannot be overwritten', () => {
  const capture = new M.Capture(8000); capture.start({ token: 'length', tempo: 400, maxBeats: .25 }); observe(capture, 8000); let batch = capture.drain(); assert.equal(batch.reason, 'duration limit'); assert.equal(batch.frames, 300); assert.equal(batch.events.at(-1).endFrame, 300);
  capture.start({ token: 'count', tempo: 120, maxNotes: 2 }); observe(capture, 1000); observe(capture, 1000, 0, false); observe(capture, 1000); observe(capture, 1000, 0, false); assert.equal(capture.active, false);
  assert.throws(() => capture.start({ token: 'overwrite' }), /previous/); batch = capture.drain(); assert.equal(batch.reason, 'note limit'); assert.equal(batch.events.length, 2); capture.start({ token: 'new' }); capture.stop(); capture.drain();
});

const phrase = makeSource([{ seconds: .1 }, { hz: 110, seconds: .25 }, { seconds: .12 }, { hz: 110, seconds: .25 }, { seconds: .12 }, { hz: 146.8323839587038, seconds: .25 }, { hz: 196, seconds: .25 }, { seconds: .35 }]);
check('The real tracker captures guitar rests, repeated notes and legato pitches independently of block and drain boundaries', () => {
  const a = render(phrase, { inputRange: 'guitar', retrigger: 'legato' }, { block: 128 }), b = render(phrase, { inputRange: 'guitar', retrigger: 'legato' }, { block: 137, drain: true });
  assert.deepEqual(a.batch, b.batch); assert.equal(a.batch.frames, phrase[0].length); assert.deepEqual(a.batch.events.map(note => note.pitch), [45, 45, 50, 55]);
  assert(Math.abs(a.batch.events[0].startFrame - 4800) < 240, 'Known pick onset is recovered rather than delayed by pitch acquisition.');
  for (const note of a.batch.events) { assert(note.startFrame >= 0 && note.endFrame > note.startFrame && note.endFrame <= a.batch.frames); }
  equalAudio(a.output, b.output, 'Block partitions do not change audio');
});
check('Low bass fundamentals, same-note picks without silence and guitar vibrato produce musically bounded notes', () => {
  const bass = render(makeSource([{ seconds: .08 }, { hz: 27.5, seconds: .65 }, { seconds: .35 }, { hz: 30.86770632850775, seconds: .65 }, { seconds: .35 }]), { inputRange: 'bass' });
  assert.deepEqual(bass.batch.events.map(note => note.pitch), [21, 23]); assert(Math.abs(bass.batch.events[0].startFrame - .08 * 48000) < 480);
  const picks = render(makeSource([{ hz: 440, seconds: .25, decay: .1 }, { hz: 440, seconds: .25, decay: .1 }, { seconds: .15 }]), { inputRange: 'guitar', retrigger: 'legato' });
  assert.deepEqual(picks.batch.events.map(note => note.pitch), [69, 69]); assert(Math.abs(picks.batch.events[1].startFrame - .25 * 48000) < 1200);
  const vibrato = render(makeSource([{ hz: 220, seconds: .6, vibrato: .4 }, { seconds: .15 }]), { inputRange: 'guitar' }); assert.deepEqual(vibrato.batch.events.map(note => note.pitch), [57]);
});
check('Clean decaying bass and guitar plucks stay accurate at 44.1 and 48 kHz without block-dependent notes or audio changes', () => {
  const specs = [[40, .08, .45, .08], [45, .85, .5, .12], [52, 1.6, .45, .055], [52, 2.35, .4, .1], [64, 3.1, .45, .05]], patch = { mode: 'track', inputRange: 'auto', gate: -60, register: 'bass', mix: 1 };
  for (const rate of [44100, 48000]) {
    const audio = new Float32Array(Math.round(3.9 * rate));
    for (const [pitch, onset, duration, gain] of specs) {
      const hz = 440 * 2 ** ((pitch - 69) / 12), start = Math.round(onset * rate), frames = Math.round(duration * rate);
      for (let frame = 0; frame < frames; frame++) {
        const t = frame / rate, fade = Math.min(1, frame / (rate * .001), (frames - frame) / (rate * .003)), phase = 2 * Math.PI * hz * t;
        audio[start + frame] = gain * fade * Math.exp(-t / 1.5) * (Math.sin(phase) + .32 * Math.sin(2 * phase + .2) + .14 * Math.sin(3 * phase + .4));
      }
    }
    const source = [audio, audio.slice()], regular = render(source, patch, { rate }), irregular = render(source, patch, { rate, block: 137, drain: true }), inactive = render(source, patch, { rate, capture: false });
    assert.deepEqual(regular.batch.events.map(note => note.pitch), specs.map(spec => spec[0]), rate + ' Hz input pitches retain their register and repeated pick.');
    assert.deepEqual(irregular.batch, regular.batch); assert.equal(regular.batch.frames, audio.length);
    for (let index = 0; index < specs.length; index++) {
      const note = regular.batch.events[index], [, onset, duration] = specs[index];
      assert(Math.abs(note.startFrame / rate - onset) < .005, rate + ' Hz pick onset was delayed.');
      assert(Math.abs(note.endFrame / rate - onset - duration) < .1, rate + ' Hz gate ending drifted.');
    }
    equalAudio(regular.output, irregular.output, rate + ' Hz block partitions change no audio');
    equalAudio(regular.output, inactive.output, rate + ' Hz capture changes no audio');
  }
});
check('Capture adds no signal processing: armed/disarmed and legacy no-module audio remain sample-identical in both sound modes', () => {
  const legacyScope = { window: {} }, baseline = 'bfe1478ff9a7892c2f2901f5e5bde26362cae517'; let legacySource;
  try { legacySource = execFileSync('git', ['show', baseline + ':loom/pedal-synth-dsp.js'], { cwd: path.resolve(__dirname, '..'), maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).toString(); } catch { legacySource = fs.readFileSync(path.join(__dirname, 'pedal-synth-dsp.js'), 'utf8'); }
  vm.runInNewContext(legacySource, legacyScope); const legacy = legacyScope.window.createLoomPedalSynthDSP(createLoomPedalTrackerDSP);
  const input = makeSource([{ hz: 110, seconds: .4 }, { seconds: .35 }], 8000);
  for (const mode of ['track', 'chord']) {
    const patch = { mode, register: 'bass', osc1Octave: -1, interval: 7, detune: 13, vibrato: 40, glide: 80 }, armed = render(input, patch, { rate: 8000 }), off = render(input, patch, { rate: 8000, capture: false }), old = render(input, patch, { rate: 8000, capture: false, maker: legacy });
    equalAudio(armed.output, off.output, mode + ' capture changes no PCM'); equalAudio(off.output, old.output, mode + ' default path retains legacy PCM'); assert.deepEqual(armed.batch.events.map(note => note.pitch), [45], 'Input MIDI ignores oscillator transformations.');
  }
});
check('Automatic silent resets preserve an armed clock; explicit resets and meaningful tracking changes preserve a final take', () => {
  const quiet = render(makeSource([{ seconds: .4 }, { hz: 220, seconds: .3 }, { seconds: .4 }, { hz: 220, seconds: .3 }]), { inputRange: 'guitar' }); assert.equal(quiet.batch.frames, 67200); assert.deepEqual(quiet.batch.events.map(note => note.pitch), [57, 57]); assert(quiet.batch.events[1].startFrame > 48000);
  for (const change of [dsp => dsp.reset(), dsp => dsp.setParams({ mode: 'chord' }), dsp => dsp.setParams({ inputRange: 'bass' }), dsp => dsp.setParams({ gate: -55 }), dsp => dsp.setParams({ mix: 0 }), dsp => dsp.setParams({ bypass: true })]) {
    const dsp = factory.create(8000, {}); dsp.startMidiCapture({ token: 'lifecycle', tempo: 120 }); const audio = makeSource([{ hz: 220, seconds: .2 }], 8000); dsp.process(audio[0], audio[1], { tempo: 120, playing: true }); change(dsp); const batch = dsp.drainMidiEvents(); assert(batch.done && batch.events.length === 1); assert.equal(batch.events[0].endFrame, 1600); assert.equal(batch.frames, 1600);
  }
  assert.throws(() => factory.create(8000, { bypass: true }).startMidiCapture({ token: 'no' }), /Enable/);
});
check('The capture factory is self-contained in a serialized audio realm and rejects unconfident/noisy pitch observations', () => {
  const isolated = vm.runInNewContext('(' + createLoomPedalMidiDSP.toString() + ')')(), capture = new isolated.Capture(8000); capture.start({ token: 'isolated', tempo: 120 });
  for (let frame = 0; frame < 800; frame++) capture.observe(frame % 2 ? NaN : 440, .2, .8, true, true, frame === 0); capture.stop(); assert.equal(capture.drain().events.length, 0);
});
check('Restarting a chord-texture take discards frozen detector history without reusing the previous input pitch', () => {
  const dsp = factory.create(8000, { mode: 'chord', inputRange: 'bass' });
  const play = hz => { const a = Float32Array.from({ length: 3200 }, (_, frame) => .1 * Math.sin(2 * Math.PI * hz * frame / 8000)); dsp.process(a, a.slice(), { playing: false }); };
  dsp.startMidiCapture({ token: 'first', tempo: 120 }); play(55); dsp.stopMidiCapture(); assert.deepEqual(dsp.drainMidiEvents().events.map(note => note.pitch), [33]);
  play(110); dsp.startMidiCapture({ token: 'second', tempo: 120 }); play(110); dsp.stopMidiCapture(); assert.deepEqual(dsp.drainMidiEvents().events.map(note => note.pitch), [45]);
});

const take = { sampleRate: 48000, tempo: 120, frames: 48000, notes: [{ pitch: 60, startFrame: 6000, endFrame: 18000, velocity: .5 }, { pitch: 60, startFrame: 18000, endFrame: 30000, velocity: 1 }, { pitch: 127, startFrame: 36000, endFrame: 42000, velocity: 0 }] };
check('Kitchen patterns preserve leading rests and durations; explicit trim/quantize options and strict bounds stay portable', () => {
  const before = JSON.stringify(take), packet = H.toPattern(take); assert.equal(packet.notes[0].beat, .25); assert.equal(packet.notes[0].duration, .5); assert.equal(packet.lengthBeats, 2); assert.equal(JSON.stringify(take), before); assert.deepEqual(MusicLabPatternSchema.normalize(packet), packet);
  const trimmed = H.toPattern(take, { trimLeading: true, quantize: .5 }); assert.equal(trimmed.notes[0].beat, 0); assert(trimmed.notes.every(note => note.duration > 0)); assert.deepEqual(H.toPattern(take, { snap: .5 }), H.toPattern(take, { quantize: .5 }));
  for (const mutation of [value => value.sampleRate = 0, value => value.tempo = NaN, value => value.frames = 1, value => value.notes[0].pitch = 128, value => value.notes[0].endFrame = value.notes[0].startFrame, value => value.notes[0].velocity = 2]) { const broken = copy(take); mutation(broken); assert.throws(() => H.normalizeTake(broken)); }
});
check('Independent SMF decoding verifies tempo, PPQ, velocity, VLQ timing, repeated-note ordering and a complete ending', () => {
  const events = parseMidi(H.toMidi(take, { name: 'Played line', channel: 2 })), tempo = events.find(event => event.type === 81); assert.deepEqual(tempo.data, [7, 161, 32]);
  const notes = events.filter(event => event.status); assert.equal(notes[0].tick, 240); assert.equal(notes[0].status, 146); assert.equal(notes[0].velocity, 64);
  const adjacent = notes.filter(event => event.tick === 720); assert.deepEqual(adjacent.map(event => event.status & 240), [128, 144]); assert(notes.filter(event => (event.status & 240) === 144).every(event => event.velocity >= 1 && event.velocity <= 127));
  const active = new Set(); for (const event of notes) { if ((event.status & 240) === 144) active.add(event.pitch); else active.delete(event.pitch); } assert.equal(active.size, 0); assert.equal(events.at(-1).tick, 1920);
  assert.throws(() => H.toMidi(take, { channel: 16 }), /channel/);
  const long = { sampleRate: 8000, tempo: 40, frames: 3072000, notes: [{ pitch: 0, startFrame: 3000000, endFrame: 3072000, velocity: .1 }] }; assert.equal(parseMidi(H.toMidi(long)).at(-1).tick, 245760);
});
console.log(passed + ' FERMENT MIDI capture and portable export groups passed.');
