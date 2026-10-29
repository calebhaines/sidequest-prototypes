'use strict';
// Portable channel-EQ signal/routing checks. No Git history or browser required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
globalThis.window = globalThis;
for (const file of ['vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'effects.js', 'audio-engine.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), { filename: file });
const DSP = createLoomEngineDSP(createLoomEffectsDSP), rate = 48000, keys = ['low', 'lowMid', 'highMid', 'high'], flat = Object.fromEntries(keys.map(key => [key, 0])), passed = [];
const clone = value => JSON.parse(JSON.stringify(value));
function check(name, run) { run(); passed.push(name); console.log('PASS ' + name); }
function state() { return { tempo: 120, lengthBars: 4, loopEnabled: false, loopStart: 0, loopEnd: 16, master: { id: 'master', level: 1, mute: false, effects: [null, null, null, null], automation: [] }, returns: [0, 1].map(i => ({ id: 'return-' + (i + 1), level: 1, pan: 0, mute: false, solo: false, effects: [null, null, null, null], automation: [] })), tracks: Array.from({ length: 8 }, (_, i) => ({ id: 'track-' + (i + 1), level: 1, pan: 0, mute: false, solo: false, instrumentLive: true, eq: { ...flat }, effects: [null, null, null, null], automation: [], sends: [0, 0], sendPre: [false, false], clips: [] })) }; }
function tone(hz = 173, frames = 12000, sr = rate, amp = .04) { return Float32Array.from({ length: frames }, (_, i) => amp * Math.sin(2 * Math.PI * hz * i / sr)); }
function rms(audio, start = 0) { let energy = 0; for (let i = start; i < audio.length; i++) energy += audio[i] ** 2; return Math.sqrt(energy / Math.max(1, audio.length - start)); }
function peak(audio) { let value = 0; for (const sample of audio) value = Math.max(value, Math.abs(sample)); return value; }
function feed(eq, source, right = source, block = 128) { const left = source.slice(), other = right.slice(); for (let at = 0; at < left.length; at += block) eq.process(left.subarray(at, at + block), other.subarray(at, at + block)); return { left, right: other }; }
function render(params, source, right = source, sr = rate, block = 128, factory = DSP) { return feed(new factory.TrackEQ(sr, params), source, right, block); }
function coreFeed(core, source, right = source, block = 128, microphone = false) { const left = new Float32Array(source.length), other = left.slice(); for (let at = 0; at < source.length; at += block) { const input = Array.from({ length: 9 }, () => []); input[microphone ? 8 : 0] = [source.subarray(at, at + block), right.subarray(at, at + block)]; core.processBlock(left.subarray(at, at + block), other.subarray(at, at + block), input); } return { left, right: other }; }
function coreEqFeed(core, source, right = source, block = 128) { const left = new Float32Array(source.length), other = left.slice(); for (let at = 0; at < source.length; at += block) { const count = Math.min(block, source.length - at); coreFeed(core, source.subarray(at, at + count), right.subarray(at, at + count), count); left.set(core.buffers[0][0], at); other.set(core.buffers[0][1], at); } return { left, right: other }; }
function coreRender(s, source, right = source, block = 128, options = {}) { const core = new DSP.Core(s, {}, rate, { linear: true, ...options }); core.start(); return { ...coreFeed(core, source, right, block), core }; }
function prime(core) { core.masterGain = 1; core.gains.forEach(pair => pair.fill(1)); core.preGains.forEach(pair => pair.fill(1)); core.returnGains.forEach(pair => pair.fill(1)); core.sendGains.forEach((pair, i) => (pair[0] = core.tracks[i].sends[0], pair[1] = core.tracks[i].sends[1])); }

check('Missing and explicit flat EQ preserve exact stereo samples and leave existing insert capacity unchanged', () => {
  const a = tone(), b = tone(719, a.length);
  assert.deepEqual(render({}, a, b), { left: a, right: b }); assert.deepEqual(render(flat, a, b), { left: a, right: b });
  const s = state(), noEq = clone(s); noEq.tracks.forEach(track => delete track.eq);
  const old = coreRender(noEq, a, b), current = coreRender(s, a, b); assert.deepEqual(current.left, old.left); assert.deepEqual(current.right, old.right);
  assert.equal(current.core.slots.length, 8); assert(current.core.slots.every(row => row.length === 4)); assert(current.core.trackEq.every(eq => eq.mask === 0));
});
check('The four fixed bands have the specified bell-center and shelf gains, with meaningful cuts and boosts', () => {
  for (const gain of [-12, 12]) for (const [key, hz, expected] of [['lowMid', 400, gain], ['highMid', 2500, gain], ['low', 100, gain / 2], ['high', 10000, gain / 2]]) {
    const a = tone(hz, rate / 2), output = render({ [key]: gain }, a).left, actual = 20 * Math.log10(rms(output, rate / 4) / rms(a, rate / 4)); assert(Math.abs(actual - expected) < .015, key + ' gain: ' + actual);
  }
  for (const [key, hz] of [['low', 10], ['high', 22000]]) {
    const a = tone(hz, rate), got = render({ [key]: 12 }, a).left; assert(20 * Math.log10(rms(got, rate / 2) / rms(a, rate / 2)) > 11.9, key + ' shelf asymptote');
  }
});
check('Stereo histories, serialization, arbitrary block partitions and the first sample are independent and deterministic', () => {
  const params = { low: 5, lowMid: -7, highMid: 8, high: -4 }, a = tone(131, 4097), b = tone(1703, a.length), reference = render(params, a, b);
  assert.deepEqual(render(params, a, b, rate, 37), reference); const isolatedFactory = vm.runInNewContext('(' + createLoomEngineDSP.toString() + ')', { Math, Number, Object, Array, Float32Array, Float64Array, Uint8Array, Map, Set }); const isolated = isolatedFactory(createLoomEffectsDSP);
  assert.deepEqual(render(params, a, b, rate, 137, isolated), reference);
  const silence = new Float32Array(a.length); assert.equal(peak(render(params, a, silence).right), 0); assert.deepEqual(render(params, a, silence).left, reference.left);
  const impulse = new Float32Array(1024); impulse[0] = .1; assert(Math.abs(render(params, impulse).left[0]) > .001, 'EQ added a lookahead/sample delay');
});
check('Knob gain changes ramp smoothly, unchanged updates retain histories and returning flat cannot resurrect old audio', () => {
  const eq = new DSP.TrackEQ(rate, flat), dc = new Float32Array(4096).fill(.02); feed(eq, dc); eq.setParams({ low: 12 }); const transition = feed(eq, dc).left;
  assert(Math.abs(transition[0] - .02) < .00001); assert(Math.abs(transition.at(-1) - .02 * 10 ** (12 / 20)) < .00002);
  const source = tone(137, 12001); function updates(repeat) { const e = new DSP.TrackEQ(rate, { lowMid: 4, high: -5 }), l = source.slice(), r = source.slice(); for (let at = 0; at < l.length; at += 32) { if (repeat) e.setParams({ lowMid: 4, high: -5 }); e.process(l.subarray(at, at + 32), r.subarray(at, at + 32)); } return l; } assert.deepEqual(updates(false), updates(true));
  eq.setParams(flat); feed(eq, new Float32Array(rate / 2)); assert.equal(eq.mask, 0, 'flat tail never restored fast path'); assert.deepEqual(feed(eq, source), { left: source, right: source });
  eq.setParams({ low: 12 }); assert.equal(peak(feed(eq, new Float32Array(4096)).left), 0, 'reactivation revived old samples');
  const fresh = new DSP.TrackEQ(rate, eq.params); eq.reset(); assert.deepEqual(feed(eq, source), feed(fresh, source));
});
check('EQ control automation shares the absolute sample clock and survives unrelated state updates, seek and Panic', () => {
  const s = state(); s.tracks[0].eq = { low: 4, lowMid: 0, highMid: -2, high: 3 }; s.tracks[0].automation = [{ target: 'eq:lowMid', interpolation: 'linear', enabled: true, points: [{ beat: 0, value: -10 }, { beat: .5, value: 12 }] }, { target: 'eq:high', interpolation: 'hold', enabled: true, points: [{ beat: 0, value: 7 }, { beat: .25, value: -8 }] }];
  const a = tone(401, 14401), b = tone(2701, a.length), standard = coreRender(s, a, b), odd = coreRender(s, a, b, 137); assert.deepEqual(odd.left, standard.left); assert.deepEqual(odd.right, standard.right);
  const core = new DSP.Core(s, {}, rate, { linear: true }); core.start(); coreFeed(core, a.subarray(0, 37), b.subarray(0, 37), 37); const before = { ...core.trackEq[0].params }; core.setState(clone(s)); assert.deepEqual(core.trackEq[0].params, before, 'unrelated state update stomped active control value');
  core.seek(0); const replay = coreEqFeed(core, a, b); const fresh = new DSP.Core(s, {}, rate, { linear: true }); fresh.start(); // Compare every post-EQ sample before fader smoothing, which intentionally retains seek gains.
  assert.deepEqual(replay, coreEqFeed(fresh, a, b)); core.panic(); assert.equal(peak(coreFeed(core, a, b).left), 0); assert(core.trackEq.every(eq => eq.bands.every(band => band.state.every(value => value === 0))));
});
check('EQ follows nonlinear inserts exactly once and feeds both pre/post sends, direct stems and the full mix', () => {
  const s = state(), a = tone(401, 12000), params = { low: 6, lowMid: -4, highMid: 5, high: 3 }, effects = createLoomEffectsDSP(); s.tracks[0].eq = params; s.tracks[0].effects[0] = { type: 'cinder', params: effects.normalize('cinder', { drive: 12, mix: 1 }) };
  const direct = new DSP.Core(s, {}, rate, { linear: true, trackId: 'track-1' }); direct.start(); prime(direct); const got = coreFeed(direct, a);
  const expectedL = a.slice(), expectedR = a.slice(); effects.create('cinder', rate, s.tracks[0].effects[0].params).process(expectedL, expectedR); const expected = render(params, expectedL, expectedR); assert.deepEqual(got.left, expected.left); assert.deepEqual(got.right, expected.right);
  for (const pre of [false, true]) {
    const wetState = clone(s); wetState.tracks[0].sends = [1, 0]; wetState.tracks[0].sendPre = [pre, false]; wetState.returns[0].solo = true; const core = new DSP.Core(wetState, {}, rate, { linear: true, returnId: 'return-1' }); core.start(); prime(core); assert.deepEqual(coreFeed(core, a).left, got.left, (pre ? 'pre' : 'post') + ' send omitted/doubled EQ');
  }
});
check('Monitoring traverses the EQ while the recorder captures dry microphone input, and SERVICE EQ overrides preserve state', () => {
  const s = state(); s.tracks[0].eq.lowMid = 12; s.tracks[0].instrumentLive = false; const core = new DSP.Core(s, {}, rate, { linear: true }); core.setMicrophoneMonitor(0, true); const a = tone(400, 4096), monitored = coreFeed(core, a, a, 128, true); assert(rms(monitored.left, 2048) > rms(a, 2048) * 3);
  const chunks = [], recorder = new DSP.Recorder(rate, chunk => chunks.push(chunk), () => {}); recorder.start(1, [0], 0, 4096, { microphone: { inputIndex: 8, compensationFrames: 0 } }); const inputs = Array.from({ length: 9 }, () => []); inputs[0] = [new Float32Array(a.length), new Float32Array(a.length)]; inputs[8] = [a, a]; core.processBlock(new Float32Array(a.length), new Float32Array(a.length), inputs); recorder.capture(inputs, a.length, core); recorder.stop(); assert(chunks.length); assert.deepEqual(chunks[0].left, a);
  const serviceCore = new DSP.Core(s, {}, rate, { linear: true }), before = JSON.stringify(s); serviceCore.service = { baseState: s, performance: { overrides: [{ trackId: 'track-1', target: 'eq:high', value: 9 }], drops: [] } }; const live = serviceCore._serviceState(); assert.equal(live.tracks[0].eq.high, 9); assert.equal(live.tracks[0].eq.lowMid, 12); assert.equal(JSON.stringify(s), before); assert.notEqual(live.tracks[0].eq, s.tracks[0].eq);
});
check('Extreme rates, valid gain combinations and malformed input remain finite, causal and quiet at rest', () => {
  for (const sr of [8000, 44100, 48000, 96000, 192000]) for (const sign of [-1, 1]) {
    const eq = new DSP.TrackEQ(sr, Object.fromEntries(keys.map(key => [key, sign * 12]))), zero = feed(eq, new Float32Array(257)); assert.equal(peak(zero.left), 0);
    const a = tone(sr * .42, 4096, sr, .1); a[0] = NaN; a[1] = Infinity; a[2] = 1e30; const out = feed(eq, a, a, 31); assert(out.left.every(value => Number.isFinite(value) && Math.abs(value) <= 65536));
    for (let j = 0; j < 30; j++) { eq.setParams(Object.fromEntries(keys.map((key, index) => [key, (j + index) % 2 ? 12 : -12]))); assert(feed(eq, tone(137, 128, sr), undefined, 32).left.every(Number.isFinite)); }
    eq.setParams(flat); feed(eq, new Float32Array(sr / 2)); assert.equal(eq.mask, 0); assert.equal(peak(feed(eq, new Float32Array(1024)).left), 0);
  }
});
const eqs = Array.from({ length: 8 }, () => new DSP.TrackEQ(rate, { low: 3, lowMid: -4, highMid: 5, high: 2 })), l = new Float32Array(128), r = l.slice();
for (let j = 0; j < 100; j++) for (const eq of eqs) { l.fill(.01); r.fill(-.01); eq.process(l, r); }
const began = performance.now(), cpu = process.cpuUsage(); for (let j = 0; j < 200; j++) for (const eq of eqs) { l.fill(.01); r.fill(-.01); eq.process(l, r); } const usage = process.cpuUsage(cpu);
console.log(JSON.stringify({ groups: passed.length, eightActiveStereo128FrameWallMs: (performance.now() - began) / 200, eightActiveStereo128FrameCpuMs: (usage.user + usage.system) / 1000 / 200 }));
