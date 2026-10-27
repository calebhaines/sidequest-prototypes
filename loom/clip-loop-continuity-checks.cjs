'use strict';
// Exercise the real sample-clock renderer and exported clip path at loop seams.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const scope = { Blob, DOMException, Math, Number, Map, Set, Promise, setTimeout, navigator: {}, Float32Array, Float64Array, Uint8Array };
scope.window = scope;
scope.createLoomEffectsDSP = () => ({ create() { throw Error('Unexpected insert in loop fixture.'); } });
vm.createContext(scope);
for (const file of ['audio-engine.js', 'clip-transfer.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), scope, { filename: file });
const DSP = scope.createLoomEngineDSP(scope.createLoomEffectsDSP);
const sr = 48000, passed = [];
const pass = name => { passed.push(name); console.log('PASS ' + name); };
function fixture({ frequency = 55.25, sourceRate = sr, duration = 2, span = .5, rate = 1, reverse = false, sourceStart = 0, sourceOffset = 0, arrangement = false, sourceLoop = true } = {}) {
  const left = Float32Array.from({ length: Math.round(duration * sourceRate) }, (_, i) => .4 * Math.sin(2 * Math.PI * frequency * i / sourceRate));
  const right = Float32Array.from({ length: left.length }, (_, i) => -.27 * Math.cos(2 * Math.PI * frequency * i / sourceRate + .4));
  const asset = { left, right, sampleRate: sourceRate }, clip = { id: 'clip', assetId: 'tone', start: 0, length: 8, sourceStart, sourceEnd: sourceStart + span, sourceOffset, rate, reverse, loop: sourceLoop, gain: 1, fadeIn: 0, fadeOut: 0 };
  const state = { tempo: 120, lengthBars: 4, loopEnabled: arrangement, loopStart: 0, loopEnd: 1, master: { level: 1, metronome: false }, tracks: Array.from({ length: 8 }, (_, index) => ({ id: 'track-' + (index + 1), level: 1, pan: 0, instrumentLive: false, clips: index ? [] : [clip], effects: [null, null, null, null], automation: [] })) };
  return { state, clip, asset, assets: new Map([['tone', asset]]) };
}
function coreFor(f, { linear = true, sampleRate = sr, beat = 0 } = {}) {
  const core = new DSP.Core(f.state, f.assets, sampleRate, { linear });
  core.start(beat); core.masterGain = 1; core.gains.forEach(pair => pair.fill(1)); return core;
}
function render(core, frames, sizes = [128], input) {
  const left = new Float32Array(frames), right = new Float32Array(frames); let block = 0;
  for (let at = 0; at < frames;) {
    const end = Math.min(frames, at + sizes[block++ % sizes.length]);
    core.processBlock(left.subarray(at, end), right.subarray(at, end), input?.(at, end) || []); at = end;
  }
  return { left, right };
}
function maxStep(array, from, to) { let value = 0; for (let i = Math.max(1, from); i < Math.min(array.length, to); i++) value = Math.max(value, Math.abs(array[i] - array[i - 1])); return value; }
function difference(a, b, start = 0, end = a.length) { let maximum = 0; for (let i = start; i < Math.min(end, a.length, b.length); i++) maximum = Math.max(maximum, Math.abs(a[i] - b[i])); return maximum; }

(async () => {
  {
    const f = fixture(), actual = render(coreFor(f), sr);
    const jump = Math.max(maxStep(actual.left, sr / 2 - 2, sr / 2 + 200), maxStep(actual.right, sr / 2 - 2, sr / 2 + 200));
    assert(jump < .015, 'A cut source-loop seam must not jump: ' + jump);
    pass('Cut source-loop seam is continuous without moving its sample boundary.');
  }

  // Source loops retain their first pass and all samples outside the correction.
  for (const options of [
    { rate: 1, sourceOffset: .13 },
    { rate: .65, reverse: true, sourceOffset: .06 },
    { rate: 1.7, sourceRate: 44100, sourceStart: .113, span: .2783, reverse: true },
    { rate: 2.1, sourceRate: 32000, sourceStart: .027, span: .2137, sourceOffset: .63 }
  ]) {
    const f = fixture(options), first = (f.clip.sourceEnd - f.clip.sourceStart - f.clip.sourceOffset % (f.clip.sourceEnd - f.clip.sourceStart)) / f.clip.rate;
    const frames = Math.ceil((first + .02) * sr), boundary = Math.round(first * sr);
    const actual = render(coreFor(f), frames, [73, 257, 31, 512]);
    const jump = Math.max(maxStep(actual.left, boundary - 3, boundary + 160), maxStep(actual.right, boundary - 3, boundary + 160));
    assert(jump < .025, 'Reverse/rate/offset/resampled seam must be continuous: ' + JSON.stringify(options) + ' / ' + jump);
    for (const frame of [Math.max(150, boundary - 90), boundary + 180]) {
      if (frame >= frames) continue;
      const phase = (frame / sr * f.clip.rate + f.clip.sourceOffset) % (f.clip.sourceEnd - f.clip.sourceStart);
      const position = (f.clip.reverse ? f.clip.sourceEnd - 1 / f.asset.sampleRate - phase : f.clip.sourceStart + phase) * f.asset.sampleRate;
      const index = Math.floor(position), fraction = position - index;
      for (const channel of ['left', 'right']) {
        const expected = f.asset[channel][index] * (1 - fraction) + f.asset[channel][Math.min(index + 1, f.asset[channel].length - 1)] * fraction;
        assert(Math.abs(actual[channel][frame] - expected) < 2e-6, 'The source position and unmodified interior are preserved.');
      }
    }
  }
  pass('Stereo source seams retain reverse, fractional regions, resampling, time rate and initial offsets; interiors are unchanged.');

  {
    // An initial offset inside a later source cycle must not manufacture an
    // earlier wrap at the clip onset. The original attack remains at frame1.
    const f = fixture({ sourceOffset: 1 }), compiled = scope.LoomClipPlayback.compile(f.clip, f.asset), pair = [0, 0];
    scope.LoomClipPlayback.read(compiled, .0002, .5, pair);
    const phase = .0001, position = phase * sr, index = Math.floor(position), fraction = position - index;
    const expected = (f.asset.right[index] * (1 - fraction) + f.asset.right[index + 1] * fraction) * (.0001 / .003);
    assert(Math.abs(pair[1] - expected) < 1e-7, 'The first source pass is not treated as a wrap because sourceOffset exceeds the region length.');
    const output = render(coreFor(f), 200);
    assert.equal(output.left[0], 0); assert(Math.abs(output.right[1]) > 0, 'The onset has no added silent samples or delay.');
  }
  pass('Source-offset cycles do not alter the initial attack or add audio latency.');

  for (const frequency of [56, 1000, 12000, 17500]) {
    const f = fixture({ frequency }), actual = render(coreFor(f), sr + 170, [128]);
    const reference = fixture({ frequency, sourceLoop: false, span: 2 }), untouched = render(coreFor(reference), actual.left.length, [251]);
    assert(difference(actual.left, untouched.left, 150) < 2e-6, 'An already periodic left loop remains unchanged at ' + frequency + ' Hz.');
    assert(difference(actual.right, untouched.right, 150) < 2e-6, 'An already periodic right loop remains unchanged at ' + frequency + ' Hz.');
  }
  pass('Seamless low- and high-frequency source loops remain transparent rather than receiving a repeated fade.');
  for (const frequency of [56, 1000, 12000, 17500]) {
    const f = fixture({ frequency, reverse: true, rate: .65 }), compiled = scope.LoomClipPlayback.compile(f.clip, f.asset), pair = [0, 0];
    const sourceFrames = Math.round((f.clip.sourceEnd - f.clip.sourceStart) * sr);
    for (const phaseFrames of [sourceFrames - .9, sourceFrames - .5, sourceFrames - .1, sourceFrames + .1]) {
      scope.LoomClipPlayback.read(compiled, phaseFrames / sr / f.clip.rate * 2, .5, pair);
      const position = ((sourceFrames - 1 - phaseFrames) % sourceFrames + sourceFrames) % sourceFrames, index = Math.floor(position), fraction = position - index;
      for (let channel = 0; channel < 2; channel++) {
        const data = channel ? f.asset.right : f.asset.left;
        const expected = data[index] * (1 - fraction) + data[(index + 1) % sourceFrames] * fraction;
        assert(Math.abs(pair[channel] - expected) < 2e-6, 'Seamless reverse interpolation wraps inside the region, including fractional playback at ' + frequency + ' Hz.');
      }
    }
  }
  pass('Seamless reverse loops retain exact circular interpolation at fractional playback rates.');


  {
    const f = fixture({ arrangement: true, sourceLoop: false, span: 2 }), actual = render(coreFor(f, { linear: false }), sr, [73, 257, 31]);
    const uninterrupted = fixture({ sourceLoop: false, span: 2 }), original = render(coreFor(uninterrupted), sr, [128]);
    const jump = Math.max(maxStep(actual.left, sr / 2 - 2, sr / 2 + 160), maxStep(actual.right, sr / 2 - 2, sr / 2 + 160));
    assert(jump < .015, 'An arrangement loop that cuts a sustained clip must be continuous: ' + jump);
    assert.equal(difference(actual.left, original.left, 0, sr / 2), 0, 'The entire first transport pass is untouched.');
    assert.equal(difference(actual.right, original.right, 0, sr / 2), 0);
    assert(difference(actual.left.subarray(sr / 2 + 160), original.left.subarray(160, sr / 2)) < 2e-6, 'The wrapped timeline resumes its original phase after the short correction.');
    const otherBlocks = render(coreFor(f, { linear: false }), sr, [2048]);
    assert.equal(difference(actual.left, otherBlocks.left), 0); assert.equal(difference(actual.right, otherBlocks.right), 0, 'Transport seams are independent of Worklet/fallback/offline block boundaries.');
    const overlap = fixture({ arrangement: true, span: .5 }), result = render(coreFor(overlap, { linear: false }), sr, [127, 511]);
    assert(maxStep(result.left, sr / 2 - 2, sr / 2 + 160) < .015, 'A source seam and transport wrap at the same frame do not double-fade or jump.');
  }
  pass('Arrangement wraps repair clip audio only, with fixed placement/length, block-independent results and simultaneous source-wrap continuity.');

  {
    const f = fixture({ frequency: 56, arrangement: true, sourceLoop: false, span: 2 });
    f.state.loopStart = 1; f.state.loopEnd = 2;
    const live = coreFor(f, { linear: false, beat: 1 });
    const uninterrupted = coreFor(f, { beat: 1 });
    const actual = render(live, sr), expected = render(uninterrupted, sr);
    assert(difference(actual.left, expected.left) < 2e-6); assert(difference(actual.right, expected.right) < 2e-6, 'A genuinely seamless arrangement region remains transparent.');
    assert(live.clipWrapOffsets.every(pair => pair.every(value => value === 0)), 'A continuous transport seam does not enable a correction.');
  }
  pass('Seamless arrangement loops remain transparent, including stereo phase.');

  for (const options of [{}, { reverse: true, rate: .7, sourceOffset: .12 }, { rate: 1.6, sourceRate: 44100, sourceStart: .07, span: .1639, sourceOffset: .48 }]) {
    const f = fixture(options); f.clip.start = 3; f.clip.length = 2.5;
    const core = coreFor(f, { beat: f.clip.start });
    const transfer = await scope.LoomClipTransfer.render(f.clip, f.asset, 120), actual = render(core, transfer.pcm.length / 2, [128]);
    let maximum = 0; for (let frame = 0; frame < actual.left.length; frame++) maximum = Math.max(maximum, Math.abs(actual.left[frame] - transfer.pcm[frame * 2]), Math.abs(actual.right[frame] - transfer.pcm[frame * 2 + 1]));
    assert(maximum < 1e-7, 'Edited stereo clip transfer and real Core playback use the same samples: ' + maximum);
    const region = await scope.LoomClipTransfer.render(f.clip, f.asset, 120, { startSeconds: .4, endSeconds: .9 });
    for (let frame = 150; frame < region.pcm.length / 2 - 150; frame++) for (let channel = 0; channel < 2; channel++) assert(Math.abs(region.pcm[frame * 2 + channel] - transfer.pcm[(frame + .4 * sr) * 2 + channel]) < 2e-6, 'A transferred subregion keeps the same loop correction history and phase.');
  }
  pass('Full and selected-region audio transfers match real stereo clip playback for forward/reverse/rate/resampled/offset loops.');

  {
    // Subtraction isolates the untouched live input and metronome while clips
    // wrap. All signals are quiet enough to stay below the master limiter.
    const f = fixture({ arrangement: true, sourceLoop: false, span: 2 }); f.state.master.metronome = true;
    f.state.tracks[1].instrumentLive = true;
    const both = coreFor(f, { linear: false }); both.options.includeMetronome = true;
    const clips = coreFor(f, { linear: false }); clips.state = { ...clips.state, master: { level: 1, metronome: false } };
    const noClips = fixture({ arrangement: true, sourceLoop: false, span: 2 }); noClips.state.tracks[0].clips = []; noClips.state.tracks[1].instrumentLive = true; noClips.state.master.metronome = true;
    const native = coreFor(noClips, { linear: false }); native.options.includeMetronome = true;
    const input = (from, end) => { const data = Float32Array.from({ length: end - from }, (_, i) => .035 * Math.sin((from + i) * .071)); return [[], [data, data]]; };
    const all = render(both, sr / 2 + 400, [128], input), clipOnly = render(clips, all.left.length, [128]), liveOnly = render(native, all.left.length, [128], input);
    for (let frame = 0; frame < all.left.length; frame++) for (const channel of ['left', 'right']) assert(Math.abs(all[channel][frame] - clipOnly[channel][frame] - liveOnly[channel][frame]) < 1e-7, 'Clip seam repair must not fade native input or the metronome.');
    assert(native.clipWrapOffsets.every(pair => pair.every(value => value === 0)));
  }
  pass('Native instrument input and the metronome stay outside clip-only wrap correction.');

  {
    const f = fixture(), original = render(coreFor(f), sr, [128]), odd = render(coreFor(f), sr, [17, 257, 1024]);
    assert.equal(difference(original.left, odd.left), 0); assert.equal(difference(original.right, odd.right), 0);
    // Worklet factories receive only their explicitly serialized dependency.
    const isolated = { Math, Number, Map, Set, Float32Array, Float64Array, Uint8Array };
    vm.createContext(isolated); vm.runInContext('globalThis.DSP=(' + scope.createLoomEngineDSP.toString() + ')(()=>({create(){throw Error("No inserts");}}));', isolated);
    const serialized = new isolated.DSP.Core(f.state, f.assets, sr, { linear: true }); serialized.start(); serialized.masterGain = 1; serialized.gains.forEach(pair => pair.fill(1));
    const worklet = render(serialized, sr, [128]); assert.equal(difference(original.left, worklet.left), 0); assert.equal(difference(original.right, worklet.right), 0);
  }
  pass('Loop playback is sample-identical across block partitions and the isolated serialized Worklet factory.');
  console.log(JSON.stringify({ passed }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
