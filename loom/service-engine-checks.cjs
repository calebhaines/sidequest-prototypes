'use strict';

// Real Core tests: native preservation, independent cycles, exact launch frames,
// transient pads, rack overlays, and restoration of the original session.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const scope = { Blob, DOMException, TextEncoder, Math, Number, Map, Set, Promise, setTimeout, navigator: {} };
scope.window = scope; vm.createContext(scope);
for (const name of ['vocal-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'effects.js', 'audio-engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, name), 'utf8'), scope, { filename: name });
const DSP = scope.createLoomEngineDSP(scope.createLoomEffectsDSP), sr = 8000, passed = [];
const copy = value => JSON.parse(JSON.stringify(value));
function check(name, run) { run(); passed.push(name); }
function fixture() {
  const left = Float32Array.from({ length: sr * 2 }, (_, i) => .2 * Math.sin(i * Math.PI * 2 * 113 / sr) + .07 * Math.cos(i * Math.PI * 2 * 29 / sr));
  const right = Float32Array.from(left, (value, i) => value * .8 + .02 * Math.sin(i * .13));
  const assets = new Map([['source', { sampleRate: sr, left, right }]]);
  const state = { tempo: 120, lengthBars: 4, loopEnabled: false, loopStart: 0, loopEnd: 16, master: { level: .8, metronome: false }, tracks: Array.from({ length: 8 }, (_, i) => ({ id: 'track-' + (i + 1), level: i === 0 ? .8 : .3, pan: i === 0 ? -.2 : .3, instrumentLive: false, effects: [null, null, null, null], automation: [], clips: [] })) };
  const clip = { id: 'clip-1', type: 'audio', assetId: 'source', start: 0, length: .5, sourceStart: 0, sourceEnd: .25, sourceOffset: 0, rate: 1, reverse: false, loop: true, gain: .9, fadeIn: .02, fadeOut: .03 };
  state.tracks[0].clips = [clip];
  const scene = { id: 'scene-1', clips: [clip, { ...clip, id: 'clip-2', length: 1, sourceStart: .2, sourceEnd: .7, reverse: true }, ...Array(6).fill(null)], lengthBeats: 4 };
  return { state, assets, clip, scene };
}
function render(core, count, block = 128) {
  const l = new Float32Array(count), r = new Float32Array(count);
  for (let at = 0; at < count; at += block) core.processBlock(l.subarray(at, Math.min(count, at + block)), r.subarray(at, Math.min(count, at + block)));
  return { l, r };
}
function difference(a, b) { let maximum = 0; for (let i = 0; i < a.length; i++) maximum = Math.max(maximum, Math.abs(a[i] - b[i])); return maximum; }
const blank = () => ({ drops: Array(8).fill(false), stutterBeats: 0, fill: false, overrides: [] });

check('Inactive arrangement DSP body is byte-for-byte identical to the pre-SERVICE engine', () => {
  const source = DSP.Core.prototype._processBlock.toString(), body = source.slice(source.indexOf('{'));
  assert.equal(createHash('sha256').update(body).digest('hex'), 'a521463c4ad2d46122440289ad82938be44f9018e125b2f191b6d52605cd8cdf');
  const { state, assets } = fixture(), wrapped = new DSP.Core(state, assets, sr), native = new DSP.Core(copy(state), assets, sr);
  wrapped.start(); native.start(); const l = new Float32Array(128), r = new Float32Array(128), a = new Float32Array(128), b = new Float32Array(128);
  for (let block = 0; block < 70; block++) { wrapped.processBlock(l, r); native._processBlock(a, b); assert.deepEqual(l, a); assert.deepEqual(r, b); }
});

check('SERVICE loops each selected clip independently through the native signal path', () => {
  const { state, assets, scene } = fixture(), live = new DSP.Core(state, assets, sr), printed = copy(state);
  for (let track = 0; track < 8; track++) printed.tracks[track].clips = scene.clips[track] ? Array.from({ length: Math.ceil(4 / scene.clips[track].length) }, (_, repetition) => ({ ...scene.clips[track], start: repetition * scene.clips[track].length })) : [];
  const native = new DSP.Core(printed, assets, sr); live.startService(scene); native.start();
  const actual = render(live, 16000), expected = render(native, 16000);
  assert(difference(actual.l, expected.l) < 1e-8); assert(difference(actual.r, expected.r) < 1e-8);
  assert.equal(JSON.stringify(state), JSON.stringify(fixture().state));
});

check('Quantized scene launches acknowledge their exact sample and audio context time', () => {
  const { state, assets, scene } = fixture(), core = new DSP.Core(state, assets, sr);
  core.startService(scene, 0, 1); core.drainServiceEvents(); render(core, 1000, 137);
  const target = core.queueService('scene', { ...scene, id: 'scene-2', clips: Array(8).fill(null) }, 'bar', 2);
  assert.equal(target, 4); render(core, 15256, 137);
  const events = core.drainServiceEvents(10, 0), event = events.find(item => item.type === 'scene' && item.seq === 2);
  assert(event); assert(Math.abs(event.beat - 4) < 1e-9); assert.equal(event.frame, 16000); assert.equal(event.contextTime, 12);
  assert.equal(core.service.scene.id, 'scene-2'); assert(core.clipLists.every(list => !list.length));
});

check('SERVICE ignores arrangement loops and ends while preserving them for restoration', () => {
  const { state, assets, scene } = fixture(); state.lengthBars = 1; state.loopEnabled = true; state.loopEnd = 2;
  const core = new DSP.Core(state, assets, sr); core.seek(1.25); core.startService(scene); render(core, 20000);
  assert(core.playing); assert(Math.abs(core.beat - 5) < 1e-9); assert.equal(core.transportCycle, 0);
  core.stopService(10); assert.equal(core.beat, 1.25); assert.equal(core.state, state); assert.equal(core.state.loopEnabled, true); assert.equal(core.options.linear, undefined); assert.equal(core.playing, false);
});

check('Held cells keep their source and cycle origin while other scene cells restart', () => {
  const { state, assets, scene } = fixture(), core = new DSP.Core(state, assets, sr); core.startService(scene); render(core, 1500);
  const beat = core.beat; core.queueService('scene', { ...scene, id: 'held', holds: [true, false, ...Array(6).fill(false)], clips: [null, scene.clips[1], ...Array(6).fill(null)] }, 'immediate', 3); render(core, 128);
  assert.equal(core.service.scene.clips[0].id, scene.clips[0].id); assert.equal(core.service.sceneStarts[0], 0); assert.equal(core.service.sceneStarts[1], beat);
  const event = core.drainServiceEvents().find(item => item.seq === 3); assert.equal(event.sceneStarts[0], 0); assert.equal(event.sceneStarts[1], beat);
});

check('Temporary fill and stutter preserve source phase and restore normal running phase', () => {
  const { state, assets, scene } = fixture(), core = new DSP.Core(state, assets, sr); core.startService(scene); render(core, 1000);
  core.queueService('performance', { ...blank(), fill: true }, 'immediate', 4); render(core, 200);
  assert(core.service.performance.fill); assert(Math.abs(core.service.phaseOrigins[0] - .26575) < 1e-9);
  const fill = scope.LoomServiceTiming.geometry({ clip: scene.clips[0], tempo: 120, sceneBeat: 0, padBeat: core.service.padBeats[0], phaseOrigin: core.service.phaseOrigins[0], fill: true }, core.beat);
  assert.equal(fill.rate, 2); assert.equal(fill.length, .25); assert.equal(fill.fadeIn, .01);
  core.queueService('performance', { ...blank(), stutterBeats: .125 }, 'immediate', 5); render(core, 200);
  const stutter = scope.LoomServiceTiming.geometry({ clip: scene.clips[0], tempo: 120, sceneBeat: 0, padBeat: core.service.padBeats[0], phaseOrigin: core.service.phaseOrigins[0], stutterBeats: .125 }, core.beat);
  assert.equal(stutter.length, .125); assert.equal(stutter.loop, true); assert(stutter.sourceOffset >= 0 && stutter.sourceOffset < .25);
  core.queueService('performance', blank(), 'immediate', 6); render(core, 200);
  assert.equal(core.service.performance.stutterBeats, 0); assert.equal(core.service.performance.fill, false); assert(Math.abs(core._servicePhase(0, core.beat) - core.beat % .5) < 1e-9);
});

check('Fast fill respects native rate limits and shared capture geometry', () => {
  const { clip } = fixture(); clip.rate = 6;
  const geometry = scope.LoomServiceTiming.geometry({ clip, tempo: 120, sceneBeat: 0, padBeat: 1, phaseOrigin: .2, fill: true }, 1.1);
  assert.equal(geometry.rate, 8); assert.equal(geometry.length, .375); assert(Math.abs(geometry.fadeIn - .015) < 1e-14);
});

check('Rapid momentary release cancels an unapplied hold, preventing stuck pads', () => {
  const { state, assets, scene } = fixture(), core = new DSP.Core(state, assets, sr); core.startService(scene);
  core.queueService('performance', { ...blank(), stutterBeats: .25 }, 'immediate', 10); core.queueService('performance', blank(), 'immediate', 11); render(core, 200);
  assert.equal(core.service.performance.stutterBeats, 0); assert(!core.drainServiceEvents().some(event => event.seq === 10));
});

check('Runtime macro and drop overlays leave saved mixer, automation, and effects untouched', () => {
  const { state, assets, scene } = fixture(), effect = scope.LoomEffectsCatalog.find(item => item.id === 'cinder');
  state.tracks[0].effects[0] = { type: 'cinder', params: { ...effect.defaults } }; state.tracks[0].automation = [{ target: 'level', enabled: true, points: [{ beat: 0, value: .1 }, { beat: 4, value: .7 }] }];
  const before = JSON.stringify(state), performance = { ...blank(), drops: [false, true, ...Array(6).fill(false)], overrides: [{ trackId: 'track-1', target: 'level', value: .45 }, { trackId: 'track-1', target: 'fx:0:drive', value: 19 }] };
  const core = new DSP.Core(state, assets, sr); core.startService(scene, 0, 1, performance); render(core, 128);
  assert.equal(core.tracks[0].level, .45); assert.equal(core.tracks[0].effects[0].params.drive, 19); assert.equal(core.tracks[1].level, 0); assert.equal(core.tracks[0].automation.length, 0);
  assert.equal(JSON.stringify(state), before); core.stopService(); assert.equal(JSON.stringify(core.state), before); assert.equal(core.tracks[0].automation.length, 1);
});

check('Panic clears SERVICE playback and every pending performance command', () => {
  const { state, assets, scene } = fixture(), core = new DSP.Core(state, assets, sr); core.startService(scene); core.queueService('scene', { ...scene, id: 'future' }, '4bar', 20); core.panic();
  assert.equal(core.service, null); assert.equal(core.playing, false); const out = render(core, 128); assert(out.l.every(value => value === 0));
});

async function publicChecks() {
  {
    const { state, assets, scene } = fixture(), audio = new scope.LoomAudio(state); audio.setAssets(assets);
    let initialize, resumed = false;
    audio.init = () => new Promise(resolve => { initialize = resolve; });
    audio.context = { currentTime: 0, resume: async () => { resumed = true; } };
    const starting = audio.startService({ scene }); await audio.stopService(); initialize(audio.context);
    assert.equal(await starting, false); assert.equal(resumed, false); assert.equal(audio.getServiceState().active, false);
    passed.push('Stop during asynchronous SERVICE initialization cancels the pending start');
  }
  {
    const { state, assets, scene } = fixture(), audio = new scope.LoomAudio(state), core = new DSP.Core(state, assets, sr), received = [];
    audio.setAssets(assets); audio.mode = 'fallback'; audio.core = core; core.seek(2);
    audio._meters = { ...audio._meters, beat: 2 }; audio._clockAnchor = { beat: 2, time: 0, cycle: 0, countIn: 0 };
    audio.context = { currentTime: 0, sampleRate: sr, resume: async () => {} }; audio.init = async () => audio.context;
    const unsubscribe = audio.subscribeService(event => received.push(event));
    const performance = { ...blank(), overrides: [{ trackId: 'track-1', target: 'pan', value: -.7 }] };
    assert.equal(await audio.startService({ scene, performance }), true); assert.equal(core.tracks[0].pan, -.7);
    render(core, 4321); audio._acceptMeters(core.getMeters(), audio._transportEpoch, 4321 / sr); audio.context.currentTime = 4321 / sr;
    const event = await audio.stopService(); assert.equal(event.type, 'stop'); assert.equal(event.frame, 4321); assert(Math.abs(event.beat - 4321 / 4000) < 1e-9);
    assert.equal(audio.getTransport().beat, 2); assert.equal(audio.getServiceState().active, false); assert.equal(core.tracks[0].pan, state.tracks[0].pan);
    unsubscribe(); const count = received.length; audio._message({ type: 'serviceEvent', event }); assert.equal(received.length, count);
    passed.push('Public SERVICE APIs apply initial macros atomically and await the true final sample before restoring');
  }
}
publicChecks().then(() => {
  for (const name of passed) console.log('PASS ' + name);
  console.log(passed.length + ' SERVICE engine checks passed.');
}).catch(error => { console.error(error); process.exitCode = 1; });
