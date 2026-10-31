'use strict';
// Actual SERVICE Drop, retained route gates and captured-arrangement audio.
// Run: node loom/lfo-service-checks.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
globalThis.window = globalThis;
globalThis.crypto ||= webcrypto;
globalThis.btoa ||= value => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ||= value => Buffer.from(value, 'base64').toString('binary');
for (const file of ['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'preamp-catalog.js', 'tape-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'tape-dsp.js', 'effects.js', 'lfo.js', 'service-schema.js', 'schema.js', 'audio-engine.js', 'service-capture.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), { filename: file });
}
const S = LoomSchema, C = LoomServiceCapture, { Core } = createLoomEngineDSP(createLoomEffectsDSP, createLoomLFODSP);
const rate = 8000, copy = value => JSON.parse(JSON.stringify(value));
const blank = (overrides = [], dropped = false) => ({ drops: [dropped, ...Array(7).fill(false)], stutterBeats: 0, fill: false, overrides });
const route = (id, ownerId, target, amount, extra = {}) => ({ id, ownerId, target, amount, enabled: true, ...extra });
let passed = 0;
function check(name, run) { run(); passed++; console.log('PASS ' + name); }
function fixture() {
  const state = S.defaultState();
  Object.assign(state, { tempo: 120, lengthBars: 4, loopEnabled: false, loopStart: 0, loopEnd: 16 });
  state.master.level = .7;
  state.tracks.forEach(track => { track.effects = [null, null, null, null]; track.clips = []; track.instrumentLive = false; });
  state.returns.forEach(bus => { bus.effects = [null, null, null, null]; bus.level = .4; });
  const left = Float32Array.from({ length: 16000 }, (_, i) => .1 * Math.sin(2 * Math.PI * 91 * i / rate) + .025 * Math.sin(2 * Math.PI * 1711 * i / rate));
  const right = Float32Array.from(left, (value, i) => value * .7 + .01 * Math.sin(2 * Math.PI * 431 * i / rate));
  const asset = S.encodeAsset({ id: 'lfo-service-audio', name: 'LFO performance ingredient', sampleRate: rate, left, right });
  state.assets = [asset];
  const track = state.tracks[0]; track.level = .6; track.sends = [.2, .3]; track.sendPre = [true, false];
  track.clips = [{ id: 'lfo-source', name: 'Source', type: 'audio', assetId: asset.id, start: 0, length: 4, sourceStart: 0, sourceEnd: 2, sourceOffset: 0, rate: 1, reverse: false, loop: true, gain: 1, fadeIn: .01, fadeOut: .01 }];
  Object.assign(state.lfos[0], { enabled: true, wave: 'square', smoothing: 0, division: 8, routes: [route('level', track.id, 'level', .3), route('pre', track.id, 'send:0', .4), route('post', track.id, 'send:1', .2), route('return', 'return-1', 'level', -.03)] });
  Object.assign(state.lfos[1], { enabled: true, sync: false, wave: 'random', rate: 2.3, phase: .2, routes: [route('depth', 'lfo-1', 'depth', -.1), route('eq', track.id, 'eq:high', .15)] });
  return S.normalize(state);
}
function recorded(events) {
  return events.filter(event => event.type === 'scene' || event.type === 'performance').map(event => ({ kind: event.type, beat: event.beat, ...(event.type === 'scene' ? { sceneId: null, clips: event.scene.clips.map(clip => clip?.id || null) } : copy(event.performance)), ...Object.fromEntries(['sceneBeat', 'padBeat', 'phaseOrigins', 'sceneStarts', 'padBeats', 'tempo'].map(key => [key, copy(event[key])])) }));
}
function gateAt(points, beat) { let value = 1; for (const point of points || []) { if (point.beat > beat) break; value = point.value; } return value; }
check('Captured Drop gates close LFO level and pre sends, retain post sends and compose existing gates without changing the source', () => {
  const state = fixture(); state.lfos[0].routes[0].gate = [{ beat: .25, value: 0 }, { beat: .75, value: 1 }, { beat: 3, value: 0 }];
  const before = JSON.stringify(state), take = { lengthBeats: 2, events: [{ kind: 'scene', beat: 0, clips: ['lfo-source', ...Array(7).fill(null)] }, { kind: 'performance', beat: .5, ...blank([], true) }, { kind: 'performance', beat: 1, ...blank() }] };
  const compiled = C.compile({ state, take }), routes = compiled.lfos[0].routes;
  assert.deepEqual(routes.find(route => route.id === 'level').gate, [{ beat: 0, value: 1 }, { beat: .25, value: 0 }, { beat: 1, value: 1 }]);
  assert.deepEqual(routes.find(route => route.id === 'pre').gate, [{ beat: 0, value: 1 }, { beat: .5, value: 0 }, { beat: 1, value: 1 }]);
  assert.equal(routes.find(route => route.id === 'post').gate, undefined);
  assert.equal(routes.find(route => route.id === 'return').gate, undefined);
  for (const beat of [0, .25, .4999, .5, .7499, .75, .9999, 1, 1.5]) {
    const expected = gateAt(state.lfos[0].routes[0].gate, beat) * (beat >= .5 && beat < 1 ? 0 : 1);
    assert.equal(gateAt(routes[0].gate, beat), expected);
  }
  assert.equal(S.serializeProject(S.parseProject(S.serializeProject(compiled))), S.serializeProject(compiled));
  assert.equal(JSON.stringify(state), before);
});
check('Actual off-grid SERVICE with multi-target and cross-LFO modulation matches its captured arrangement and Drop stays silent', () => {
  const state = fixture(), before = JSON.stringify(state), frames = 8000;
  const actual = [new Float32Array(frames), new Float32Array(frames)], expected = [new Float32Array(frames), new Float32Array(frames)];
  const live = new Core(state, S.decodeAssets(state.assets), rate, { linear: true });
  live.startService({ id: 'lfo-performance', clips: state.tracks.map(track => track.clips[0] || null) }, 0, 0, blank());
  const events = [{ frame: 2500, performance: blank([], true) }, { frame: 5001, performance: blank([{ trackId: 'track-1', target: 'level', value: .4 }]) }, { frame: 7003, performance: blank() }];
  let next = 0;
  for (let at = 0; at < frames;) {
    if (events[next]?.frame === at) { live.queueService('performance', events[next].performance, 'immediate', next + 1); next++; }
    const end = Math.min(frames, at + 137, events[next]?.frame ?? frames);
    live.processBlock(actual[0].subarray(at, end), actual[1].subarray(at, end)); at = end;
  }
  const compiled = C.compile({ state, take: { lengthBeats: 2, events: recorded(live.drainServiceEvents()) } });
  const offline = new Core(compiled, S.decodeAssets(compiled.assets), rate, { linear: true }); offline.start();
  for (let at = 0; at < frames; at += 251) offline.processBlock(expected[0].subarray(at, Math.min(frames, at + 251)), expected[1].subarray(at, Math.min(frames, at + 251)));
  let maximum = 0, maximumAt = 0, energy = 0, dropPeak = 0;
  // Existing capture end treatment fades its final 3ms; compare every sample
  // before that intentional final cut, including all three control events.
  for (let frame = 0; frame < frames - 25; frame++) {
    const difference = Math.max(Math.abs(actual[0][frame] - expected[0][frame]), Math.abs(actual[1][frame] - expected[1][frame]));
    if (difference > maximum) { maximum = difference; maximumAt = frame; }
    energy += actual[0][frame] ** 2 + actual[1][frame] ** 2;
    if (frame >= 4500 && frame < 5000) dropPeak = Math.max(dropPeak, Math.abs(actual[0][frame]), Math.abs(actual[1][frame]));
  }
  assert(energy > .1, 'SERVICE fixture must contain actual modulated audio.');
  assert(maximum < 2e-7, 'Live/captured LFO difference ' + maximum + ' at frame ' + maximumAt);
  assert(dropPeak < 1e-8, 'LFO reopened dropped direct/pre-send audio: ' + dropPeak);
  assert.equal(JSON.stringify(state), before);
  console.log('  maximum live/capture difference:', maximum, '; settled Drop peak:', dropPeak);
});
console.log(passed + ' LFO/SERVICE checks passed.');
