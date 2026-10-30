'use strict';
// Independent channel-EQ review: released PCM, measured response, real routing
// and absolute control-clock behavior. Portable source tests need no browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const files = ['vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'tape-dsp.js', 'effects.js', 'audio-engine.js'];
function load(read = file => fs.readFileSync(path.join(__dirname, file), 'utf8')) {
  const scope = { Math, Number, Object, Map, Set, Promise, Float32Array, Float64Array, Int32Array, Uint8Array, Blob, DOMException, TextEncoder, setTimeout, navigator: {} };
  scope.window = scope; vm.createContext(scope);
  for (const file of files) vm.runInContext(read(file), scope, { filename: file });
  return scope;
}
const copy = x => JSON.parse(JSON.stringify(x));
const flat = () => ({ low: 0, lowMid: 0, highMid: 0, high: 0 });
function state() {
  return { tempo: 120, lengthBars: 64, loopEnabled: false, loopStart: 0, loopEnd: 256,
    master: { id: 'master', name: 'Master', level: 1, mute: false, metronome: false, effects: [null, null, null, null], automation: [] },
    returns: [0, 1].map(i => ({ id: 'return-' + (i + 1), name: 'Return ' + i, level: 1, pan: 0, mute: false, solo: false, effects: [null, null, null, null], automation: [] })),
    tracks: Array.from({ length: 8 }, (_, i) => ({ id: 'track-' + (i + 1), level: 1, pan: 0, mute: false, solo: false, instrumentLive: i === 0, effects: [null, null, null, null], automation: [], sends: [0, 0], sendPre: [false, false], clips: [] })) };
}
function integerSignal(frame, channel = 0, amplitude = .03) {
  let x = Math.imul(frame + 7, 1103515245) ^ Math.imul(channel + 13, -1640531535); x ^= x >>> 16; x = Math.imul(x, -2048144789); x ^= x >>> 13;
  return ((x >>> 0) / 4294967296 * 2 - 1) * amplitude + (((frame + channel * 7) % 251) / 251 - .5) * amplitude * .4;
}
function input(frame, frames, channels = 1) { return Array.from({ length: channels }, (_, t) => [0, 1].map(ch => Float32Array.from({ length: frames }, (_, i) => integerSignal(frame + i, t * 2 + ch)))); }
function fixtures(scope) {
  const fx = (type, p) => ({ type, params: scope.createLoomEffectsDSP().normalize(type, p) }), complex = state();
  complex.tracks.forEach((t, i) => { t.instrumentLive = true; t.level = .2 + .05 * i; t.pan = (i - 3.5) * .2; t.mute = i === 6; t.sends = [.1 + i * .02, .03 + i * .01]; t.sendPre = [i % 2 === 0, false]; });
  complex.tracks[0].effects[0] = fx('cinder', { drive: 10, output: -12, mix: .5 });
  complex.tracks[1].effects[0] = fx('saute', { model: 'iron-73', drive: 12, colour: .8 });
  complex.tracks[2].effects[0] = fx('velvet', { model: 'bus-4k', threshold: -30, makeup: 0 });
  complex.tracks[3].effects[0] = fx('prism', { mid: 5, midFreq: 700, high: -3 });
  complex.tracks[4].effects[0] = fx('parallax', { clock: 'free', time: 30, feedback: .2, mix: .2 });
  complex.tracks[0].automation = [{ target: 'pan', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: -.7 }, { beat: 1, value: .6 }] }];
  complex.master.effects[0] = fx('saute', { model: 'tg-2', colour: .5, drive: 6 });
  complex.returns[0].effects[0] = fx('vestige', { size: .2, decay: .5, predelay: 0, mix: 1 });
  complex.returns[1].effects[0] = fx('parallax', { clock: 'free', time: 40, feedback: .3, mix: 1 });
  const clips = state(); clips.tracks[0].instrumentLive = false; clips.tracks[1].instrumentLive = false;
  for (let i = 0; i < 2; i++) { clips.tracks[i].level = .4; clips.tracks[i].clips = [{ id: 'clip-' + i, type: 'audio', assetId: 'sample', start: 0, length: 4, sourceStart: 0, sourceEnd: .256, sourceOffset: 0, rate: i ? .75 : 1, reverse: i === 1, loop: true, gain: .7, fadeIn: 0, fadeOut: 0 }]; }
  clips.tracks[0].effects[0] = fx('saute', { model: 'valve-72', drive: 18, colour: .6 }); clips.tracks[0].sends = [.3, .2];
  clips.returns[0].effects[0] = fx('cinder', { drive: 17, mix: 1, output: -15 });
  const count = state(); count.master.level = 0; count.master.metronome = true;
  return [
    { id: 'eight-live-nonlinear-racks-shared-returns', state: complex, frames: 4096, rate: 8000, inputs: 8 },
    { id: 'looped-reversed-clips-direct-stem', state: clips, frames: 4096, rate: 8000, inputs: 0, options: { trackId: 'track-1' }, assets: { sample: { sampleRate: 8000, left: Float32Array.from({ length: 2048 }, (_, i) => integerSignal(i, 41, .2)), right: Float32Array.from({ length: 2048 }, (_, i) => integerSignal(i, 42, .15)) } } },
    { id: 'count-in-click-master-zero', state: count, frames: 2048, rate: 8000, inputs: 1, countIn: true }
  ];
}
function run(scope, fixture, blocks = [128], explicitFlat = false) {
  const s = copy(fixture.state); if (explicitFlat) s.tracks.forEach(t => { t.eq = flat(); });
  const dsp = scope.createLoomEngineDSP(scope.createLoomEffectsDSP), core = new dsp.Core(s, fixture.assets || {}, fixture.rate, { linear: true, ...(fixture.options || {}) });
  if (fixture.countIn) core.beginRecording({ countInBeats: 1, startTransport: true }); else core.start(0);
  const left = new Float32Array(fixture.frames), right = left.slice(); let at = 0, block = 0;
  while (at < left.length) { const n = Math.min(blocks[block++ % blocks.length], left.length - at); core.processBlock(left.subarray(at, at + n), right.subarray(at, at + n), input(at, n, fixture.inputs)); at += n; }
  return { left, right, core };
}
function fingerprint(a, b) { const h = crypto.createHash('sha256'); h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); h.update(Buffer.from(b.buffer, b.byteOffset, b.byteLength)); return h.digest('hex'); }
function peak(a) { let p = 0; for (const v of a) p = Math.max(p, Math.abs(v)); return p; }
function rms(a, from = 0) { let sum = 0; for (let i = from; i < a.length; i++) sum += a[i] * a[i]; return Math.sqrt(sum / Math.max(1, a.length - from)); }
function difference(a, b) { let sum = 0; for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2; return Math.sqrt(sum / a.length); }
function tone(hz, frames = 16384, amplitude = .025, rate = 48000) { return Float32Array.from({ length: frames }, (_, i) => amplitude * Math.sin(2 * Math.PI * hz * i / rate)); }
function projection(a, hz, rate, start = a.length / 2) { let real = 0, imaginary = 0; for (let i = Math.floor(start); i < a.length; i++) { const angle = 2 * Math.PI * hz * i / rate; real += a[i] * Math.cos(angle); imaginary += a[i] * Math.sin(angle); } return 2 * Math.hypot(real, imaginary) / (a.length - Math.floor(start)); }

// These Float32 stereo fingerprints were authored from release 82d3395
// (GALLEY 1.17). They need no checkout or Git access to verify offline.
const legacy = {
  'eight-live-nonlinear-racks-shared-returns': '8029b172149a7fad9b9387de36979010f1ac7802e47020fc849f6d41592e75d1',
  'looped-reversed-clips-direct-stem': '720be6bfe8b1691c349930990037cebc8ae875cfa404c3f286a8cb0f8748b732',
  'count-in-click-master-zero': 'c4aaf03ec2b7cfd8f457b2af1e885f49568777b537f3ead5a65a6560b819542f'
};
const scope = load(), DSP = scope.createLoomEngineDSP(scope.createLoomEffectsDSP), passed = [], measurements = {};
function check(name, fn) { fn(); passed.push(name); console.log('PASS ' + name); }
function postEq(eq, left, right = left, rate = 48000, blocks = [128], options = {}) {
  const s = options.state || state(); s.tracks[0].eq = eq;
  const core = new DSP.Core(s, {}, rate, { linear: true }); core.start(0);
  const l = left.slice(), r = right.slice(); let at = 0, block = 0;
  while (at < l.length) {
    const n = Math.min(blocks[block++ % blocks.length], l.length - at);
    core.processBlock(new Float32Array(n), new Float32Array(n), [[left.subarray(at, at + n), right.subarray(at, at + n)]]);
    l.set(core.buffers[0][0], at); r.set(core.buffers[0][1], at); at += n;
  }
  return { l, r, core };
}
function main() {
  check('Released GALLEY 1.17 stereo PCM stays exact with absent or explicitly flat channel EQ', () => {
    for (const f of fixtures(scope)) for (const explicit of [false, true]) {
      const a = run(scope, f, [128], explicit); assert.equal(fingerprint(a.left, a.right), legacy[f.id], f.id + '/' + explicit);
      const b = run(scope, f, [137, 31, 251], explicit); assert.deepEqual(b.left, a.left); assert.deepEqual(b.right, a.right);
      assert(peak(a.left) > 0, 'Legacy identity probe must not be silent');
    }
  });

  check('Each fixed band has its actual labelled gain and the shelves reach their intended endpoints', () => {
    const rows = [], rate = 48000, frames = 24000;
    for (const [key, hz, fraction] of [['low', 100, .5], ['lowMid', 400, 1], ['highMid', 2500, 1], ['high', 10000, .5]]) for (const gain of [-12, 6, 12]) {
      const x = tone(hz, frames, .005, rate), e = new DSP.TrackEQ(rate, { ...flat(), [key]: gain }), y = x.slice(), r = x.slice(); e.process(y, r);
      const actual = 20 * Math.log10(projection(y, hz, rate) / projection(x, hz, rate));
      assert(Math.abs(actual - gain * fraction) < .015, key + ' expected ' + gain * fraction + ' dB at ' + hz + ' Hz; got ' + actual);
      rows.push({ key, hz, gain, actual });
    }
    for (const [key, hz] of [['low', 20], ['high', 20000]]) {
      const x = tone(hz, 48000, .005, rate), y = x.slice(), r = x.slice(); new DSP.TrackEQ(rate, { ...flat(), [key]: 12 }).process(y, r);
      assert(Math.abs(20 * Math.log10(projection(y, hz, rate) / projection(x, hz, rate)) - 12) < .15, key + ' shelf endpoint');
    }
    const x = tone(3600, 8000, .005, 8000), y = x.slice(), r = x.slice(); new DSP.TrackEQ(8000, { ...flat(), high: 12 }).process(y, r);
    assert(Math.abs(20 * Math.log10(projection(y, 3600, 8000) / projection(x, 3600, 8000)) - 6) < .02, 'High shelf frequency clamps to 0.45 × sample rate');
    measurements.fixedBandResponseDb = rows;
  });
  check('Channel EQ runs after the nonlinear insert rack, without adding a pure audio delay or stereo crosstalk', () => {
    const eq = { low: -8, lowMid: 9, highMid: -6, high: 3 }, x = Float32Array.from({ length: 8192 }, (_, i) => integerSignal(i, 17, .13)), silent = new Float32Array(x.length), s = state();
    const params = scope.createLoomEffectsDSP().normalize('cinder', { drive: 22, output: -12, mix: 1, shape: 'diode' }); s.tracks[0].effects[0] = { type: 'cinder', params };
    const actual = postEq(eq, x, silent, 48000, [137, 31, 251], { state: s });
    const expected = x.slice(), expectedR = silent.slice(); scope.createLoomEffectsDSP().create('cinder', 48000, params).process(expected, expectedR); new DSP.TrackEQ(48000, eq).process(expected, expectedR);
    assert.deepEqual(actual.l, expected); assert.deepEqual(actual.r, expectedR); assert.equal(peak(actual.r), 0, 'Independent EQ channel histories');
    const wrong = x.slice(), wrongR = silent.slice(); new DSP.TrackEQ(48000, eq).process(wrong, wrongR); scope.createLoomEffectsDSP().create('cinder', 48000, params).process(wrong, wrongR);
    assert(difference(actual.l, wrong) > .002, 'Ordering proof must distinguish EQ before and after a nonlinear insert');
    const impulse = new Float32Array(1024); impulse[139] = .01; const wet = postEq(eq, impulse).l;
    assert.equal(peak(wet.subarray(0, 139)), 0); assert(Math.abs(wet[139]) > .001, 'No added pure sample or block delay');
  });
  check('Dry mix, direct track stems and both pre/post send stems include source EQ exactly once before pan and fader', () => {
    const rate = 8000, frames = 4096, eq = { low: -6, lowMid: 8, highMid: -4, high: 3 }, x = Float32Array.from({ length: frames }, (_, i) => integerSignal(i, 3, .07)), y = Float32Array.from({ length: frames }, (_, i) => integerSignal(i, 4, .05)), filtered = x.slice(), filteredR = y.slice();
    new DSP.TrackEQ(rate, eq).process(filtered, filteredR);
    function renderRouting(enabled, options) {
      const s = state(); s.tracks[0].eq = enabled ? eq : flat(); s.tracks[0].level = .35; s.tracks[0].pan = -.4; s.tracks[0].sends = [.6, .4]; s.tracks[0].sendPre = [true, false];
      s.tracks[0].automation = [{ target: 'pan', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: -.7 }, { beat: 1, value: .6 }] }];
      const core = new DSP.Core(s, {}, rate, { linear: true, ...options }); core.start(); const l = new Float32Array(frames), r = l.slice();
      for (let at = 0; at < frames; at += 137) { const n = Math.min(137, frames - at); core.processBlock(l.subarray(at, at + n), r.subarray(at, at + n), [[(enabled ? x : filtered).subarray(at, at + n), (enabled ? y : filteredR).subarray(at, at + n)]]); }
      return { l, r };
    }
    for (const options of [{}, { trackId: 'track-1' }, { returnId: 'return-1' }, { returnId: 'return-2' }]) {
      const actual = renderRouting(true, options), reference = renderRouting(false, options); assert.deepEqual(actual.l, reference.l); assert.deepEqual(actual.r, reference.r); assert(peak(actual.l) > .001, 'Audible route probe ' + JSON.stringify(options));
    }
  });
  check('EQ automation uses the absolute 32-sample clock and unrelated state updates preserve its in-flight response', () => {
    const rate = 8000, frames = 8193, tempo = 137, x = Float32Array.from({ length: frames }, (_, i) => integerSignal(i, 7, .07)), y = Float32Array.from({ length: frames }, (_, i) => integerSignal(i, 8, .04));
    const s = state(); s.tempo = tempo; s.tracks[0].eq = flat();
    const lanes = [['low', -6, 9], ['lowMid', 10, -8], ['highMid', -4, 11], ['high', 8, -5]].map(([key, first, last]) => ({ target: 'eq:' + key, enabled: true, interpolation: key === 'high' ? 'hold' : 'linear', points: [{ beat: 0, value: first }, { beat: 1, value: last }] })); s.tracks[0].automation = lanes;
    function actual(blocks, update = false) {
      const core = new DSP.Core(copy(s), {}, rate, { linear: true }); core.start(); const l = x.slice(), r = y.slice(); let at = 0, block = 0;
      while (at < frames) {
        if (update && at === 777) core.setState(copy(s));
        const n = Math.min(blocks[block++ % blocks.length], frames - at, update && at < 777 ? 777 - at : Infinity);
        core.processBlock(new Float32Array(n), new Float32Array(n), [[x.subarray(at, at + n), y.subarray(at, at + n)]]); l.set(core.buffers[0][0], at); r.set(core.buffers[0][1], at); at += n;
      }
      return { l, r };
    }
    const initial = Object.fromEntries(lanes.map(lane => [lane.target.slice(3), lane.points[0].value])), e = new DSP.TrackEQ(rate, initial), expected = x.slice(), expectedR = y.slice(); let beat = 0;
    for (let at = 0; at < frames;) {
      const values = {};
      for (const lane of lanes) { const [a, b] = lane.points; values[lane.target.slice(3)] = beat >= 1 ? b.value : lane.interpolation === 'hold' ? a.value : a.value + (b.value - a.value) * beat; }
      e.setParams(values); const n = Math.min(32, frames - at); e.process(expected.subarray(at, at + n), expectedR.subarray(at, at + n)); for (let i = 0; i < n; i++) beat += tempo / (60 * rate); at += n;
    }
    const reference = actual([128]); assert.deepEqual(reference.l, expected); assert.deepEqual(reference.r, expectedR);
    for (const candidate of [actual([137, 31, 251]), actual([37, 997], true)]) { assert.deepEqual(candidate.l, reference.l); assert.deepEqual(candidate.r, reference.r); }
  });
  check('Coefficient changes are smooth; flat settles to an exact dry path and cannot resurrect old filter tails', () => {
    const e = new DSP.TrackEQ(48000, { low: 12, lowMid: -9, highMid: 8, high: -6 }), x = new Float32Array(4800).fill(.01), left = x.slice(), right = x.slice(); e.process(left, right);
    const previous = left[left.length - 1]; e.setParams(flat()); const continued = x.slice(), continuedR = x.slice(); e.process(continued, continuedR);
    assert(Math.abs(continued[0] - previous) < .0003, 'Flat reset introduced a hard gain step');
    const silence = new Float32Array(24000), silenceR = silence.slice(); e.process(silence, silenceR); assert.equal(e.mask, 0, 'A flat EQ should drain its inaudible state and enter the arithmetic-free path');
    const dry = Float32Array.from({ length: 1024 }, (_, i) => integerSignal(i, 19)); const dryL = dry.slice(), dryR = dry.slice(); e.process(dryL, dryR); assert.deepEqual(dryL, dry); assert.deepEqual(dryR, dry);
    e.setParams({ low: 12, lowMid: 12, highMid: 12, high: 12 }); const zero = new Float32Array(4096), zeroR = zero.slice(); e.process(zero, zeroR); assert.equal(peak(zero), 0, 'Reactivating EQ revealed stale samples');
    e.process(x.slice(), x.slice()); e.reset(); const reset = new Float32Array(1024), resetR = reset.slice(); e.process(reset, resetR); assert.equal(peak(reset), 0, 'Reset retained filter history');
  });
  check('Actual off-grid SERVICE EQ moves and initial overrides reproduce the captured take audio', () => {
    Object.assign(scope, { crypto: crypto.webcrypto, btoa: value => Buffer.from(value, 'binary').toString('base64'), atob: value => Buffer.from(value, 'base64').toString('binary') });
    for (const file of ['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'preamp-catalog.js', 'tape-catalog.js', 'effects-catalog.js', 'service-schema.js', 'schema.js', 'service-capture.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), scope, { filename: file });
    const S = scope.LoomSchema, C = scope.LoomServiceCapture, original = S.defaultState(), rate = 8000, frames = 8000;
    original.tempo = 120; original.lengthBars = 4; original.loopEnabled = false; original.master.level = .7;
    original.tracks.forEach(track => { track.effects = [null, null, null, null]; track.clips = []; track.instrumentLive = false; }); original.returns.forEach(bus => { bus.effects = [null, null, null, null]; });
    original.tracks[0].eq = { low: 3, lowMid: -2, highMid: 1, high: -1 };
    const left = Float32Array.from({ length: 16000 }, (_, i) => .09 * Math.sin(2 * Math.PI * 91 * i / rate) + .03 * Math.sin(2 * Math.PI * 1711 * i / rate)), right = Float32Array.from(left, (v, i) => v * .7 + .01 * Math.sin(2 * Math.PI * 431 * i / rate)), asset = S.encodeAsset({ id: 'eq-service-source', name: 'EQ performance ingredient', sampleRate: rate, left, right });
    original.assets = [asset]; original.tracks[0].clips = [{ id: 'eq-source', name: 'Source', type: 'audio', assetId: asset.id, start: 0, length: 4, sourceStart: 0, sourceEnd: 2, sourceOffset: 0, rate: 1, reverse: false, loop: true, gain: 1, fadeIn: .01, fadeOut: .01 }];
    const s = S.normalize(original), before = JSON.stringify(s), live = new DSP.Core(s, S.decodeAssets(s.assets), rate, { linear: true }), blank = overrides => ({ drops: Array(8).fill(false), stutterBeats: 0, fill: false, overrides });
    live.startService({ id: 'eq-performance', clips: s.tracks.map(track => track.clips[0] || null) }, 0, 0, blank([{ trackId: 'track-1', target: 'eq:lowMid', value: 5 }]));
    const events = [{ at: 2500, overrides: [{ trackId: 'track-1', target: 'eq:low', value: 10 }] }, { at: 5000, overrides: [{ trackId: 'track-1', target: 'eq:highMid', value: -9 }] }, { at: 7000, overrides: [] }], actualL = new Float32Array(frames), actualR = actualL.slice(); let next = 0;
    for (let at = 0; at < frames;) {
      if (events[next]?.at === at) { live.queueService('performance', blank(events[next].overrides), 'immediate', next + 1); next++; }
      const end = Math.min(frames, at + 137, events[next]?.at ?? frames); live.processBlock(actualL.subarray(at, end), actualR.subarray(at, end)); at = end;
    }
    const recorded = live.drainServiceEvents().filter(event => event.type === 'scene' || event.type === 'performance').map(event => ({ kind: event.type, beat: event.beat, ...(event.type === 'scene' ? { sceneId: null, clips: event.scene.clips.map(clip => clip?.id || null) } : copy(event.performance)), ...Object.fromEntries(['sceneBeat', 'padBeat', 'phaseOrigins', 'sceneStarts', 'padBeats', 'tempo'].map(key => [key, copy(event[key])])) }));
    const compiled = C.compile({ state: s, take: { lengthBeats: 2, events: recorded } }), offline = new DSP.Core(compiled, S.decodeAssets(compiled.assets), rate, { linear: true }), expectedL = new Float32Array(frames), expectedR = expectedL.slice(); offline.start();
    for (let at = 0; at < frames; at += 251) offline.processBlock(expectedL.subarray(at, Math.min(frames, at + 251)), expectedR.subarray(at, Math.min(frames, at + 251)));
    let maximum = 0, maximumAt = 0, energy = 0;
    // Capture deliberately fades its final cut. Compare the complete audible
    // prefix before that existing three-millisecond end treatment.
    for (let i = 0; i < frames - 25; i++) { const d = Math.max(Math.abs(actualL[i] - expectedL[i]), Math.abs(actualR[i] - expectedR[i])); if (d > maximum) { maximum = d; maximumAt = i; } energy += actualL[i] ** 2 + actualR[i] ** 2; }
    assert(energy > .1, 'SERVICE comparison must contain actual audio'); assert(maximum < 2e-7, 'Off-grid SERVICE/captured EQ difference ' + maximum + ' at frame ' + maximumAt); assert.equal(JSON.stringify(s), before, 'Live performance and capture must preserve the source project');
    assert(compiled.tracks[0].automation.some(lane => lane.target === 'eq:lowMid' && lane.points[0].value === 5), 'Initial performance override captured at beat zero');
    measurements.maximumServiceCaptureAudioDifference = maximum;
  });
  check('Every gain corner is stable at 8–192 kHz and seek/Panic clear EQ histories', () => {
    for (const rate of [8000, 48000, 192000]) for (let mask = 0; mask < 16; mask++) {
      const params = Object.fromEntries(['low', 'lowMid', 'highMid', 'high'].map((key, i) => [key, mask & (1 << i) ? 12 : -12])), e = new DSP.TrackEQ(rate, params), x = Float32Array.from({ length: 2048 }, (_, i) => integerSignal(i, 23, 8)), right = x.slice(); e.process(x, right); assert(x.every(v => Number.isFinite(v) && Math.abs(v) <= 65536)); assert(right.every(v => Number.isFinite(v) && Math.abs(v) <= 65536));
    }
    const s = state(); s.tracks[0].eq = { low: 12, lowMid: 9, highMid: -8, high: 12 }; const core = new DSP.Core(s, {}, 8000, { linear: true }); core.start(); core.processBlock(new Float32Array(512), new Float32Array(512), [[tone(80, 512, .1, 8000)]]);
    core.seek(3); core.processBlock(new Float32Array(256), new Float32Array(256)); assert.equal(peak(core.buffers[0][0]), 0, 'Seek retained EQ history');
    core.processBlock(new Float32Array(512), new Float32Array(512), [[tone(80, 512, .1, 8000)]]); core.panic(); core.resumeAudition(0); core.processBlock(new Float32Array(256), new Float32Array(256)); assert.equal(peak(core.buffers[0][0]), 0, 'Panic retained EQ history');
  });
  // Node's isolated vm realm intercepts native Math calls and is unsuitable
  // for a real-time CPU estimate. Compile the identical serialized factory
  // into the host realm, as the browser compiles its Worklet source.
  const nativeDSP = (new Function('effectsFactory', 'return (' + scope.createLoomEngineDSP.toString() + ')(effectsFactory);'))(scope.createLoomEffectsDSP);
  const timings = [];
  for (const active of [false, true]) {
    const e = new nativeDSP.TrackEQ(48000, active ? { low: 3, lowMid: -4, highMid: 2, high: 1 } : flat()), l = new Float32Array(128), r = l.slice();
    for (let i = 0; i < 100; i++) { l.fill(.02); r.fill(-.01); e.process(l, r); }
    const start = performance.now(); for (let i = 0; i < 300; i++) { l.fill(.02); r.fill(-.01); e.process(l, r); }
    timings.push({ active, stereo128FrameMilliseconds: (performance.now() - start) / 300 });
  }
  measurements.eqCpu = timings;
  console.log(JSON.stringify({ independentGroups: passed.length, measurements }, null, 2));
}
module.exports = { files, load, state, flat, integerSignal, input, fixtures, run, fingerprint, peak, rms, difference, tone, projection, postEq, main };
if (require.main === module) main();
