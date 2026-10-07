'use strict';
// Pure compiler checks plus timing comparisons through the real GALLEY renderer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const scope = { Blob, DOMException, TextEncoder, Math, Number, Map, Set, Promise, Float32Array, setTimeout, navigator: {}, crypto: webcrypto,
  btoa: value => Buffer.from(value, 'binary').toString('base64'), atob: value => Buffer.from(value, 'base64').toString('binary') };
scope.window = scope; vm.createContext(scope);
const shared = fs.existsSync(path.join(__dirname, 'shared', 'pattern-schema.js')) ? path.join(__dirname, 'shared', 'pattern-schema.js') : path.join(__dirname, '..', 'shared', 'pattern-schema.js');
vm.runInContext(fs.readFileSync(shared, 'utf8'), scope, { filename: 'pattern-schema.js' });
for (const name of ['vocal-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'effects.js', 'schema.js', 'audio-engine.js', 'service-capture.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, name), 'utf8'), scope, { filename: name });
const S = scope.LoomSchema, C = scope.LoomServiceCapture, { Core } = scope.createLoomEngineDSP(scope.createLoomEffectsDSP);
const passed = [], clone = value => JSON.parse(JSON.stringify(value));
function check(name, run) { run(); passed.push(name); }
function fixture() {
  const state = S.defaultState(); state.tempo = 120; state.lengthBars = 64; state.loopEnabled = false; state.master.level = .8;
  const sampleRate = 8000, left = new Float32Array(sampleRate * 2), right = new Float32Array(left.length);
  for (let frame = 0; frame < left.length; frame++) { left[frame] = .17 * Math.sin(2 * Math.PI * 93 * frame / sampleRate) + .031 * Math.cos(2 * Math.PI * 231 * frame / sampleRate); right[frame] = .13 * Math.sin(2 * Math.PI * 137 * frame / sampleRate); }
  const asset = S.encodeAsset({ left, right, sampleRate, id: 'source-audio', name: 'Test pan' }); state.assets.push(asset);
  state.tracks.forEach(track => { track.level = .8; track.instrumentLive = false; });
  state.tracks[0].clips.push({ id: 'source-one', name: 'Original source', type: 'audio', assetId: asset.id, start: 8, length: 4, sourceStart: .125, sourceEnd: 1.875, sourceOffset: .2, rate: 1, reverse: false, loop: true, gain: .7, fadeIn: .04, fadeOut: .08 });
  return state;
}
function selection(...ids) { return Array.from({ length: 8 }, (_, index) => ids[index] ?? null); }
function scene(beat = 0, clips = selection('source-one'), extra = {}) { return { kind: 'scene', beat, sceneId: 'scene-one', clips, sceneBeat: beat, padBeat: beat, phaseOrigins: Array(8).fill(0), ...extra }; }
function performance(beat, extra = {}) { return { kind: 'performance', beat, drops: Array(8).fill(false), stutterBeats: 0, fill: false, overrides: [], ...extra }; }
function take(lengthBeats, events = [scene()]) { return { lengthBeats, events }; }
function render(state, beats, service) {
  const core = new Core(state, S.decodeAssets(state.assets), 8000, { linear: true });
  if (service) core.startService({ id: 'fixture', clips: selection(...state.tracks.map(track => track.clips[0] || null)) }, 0);
  else core.start(0);
  const count = Math.round(beats * 60 / state.tempo * 8000), left = new Float32Array(count), right = new Float32Array(count);
  for (let at = 0; at < count; at += 128) core.processBlock(left.subarray(at, Math.min(count, at + 128)), right.subarray(at, Math.min(count, at + 128)));
  return { left, right };
}
check('Compilation is explicit and pure, preserving all eight tracks, four slots, assets and source controls', () => {
  const state = fixture(), before = JSON.stringify(state), compiled = C.compile({ state, take: take(12) });
  assert.equal(JSON.stringify(state), before); assert.notEqual(compiled, state);
  assert.equal(compiled.tracks.length, 8); assert(compiled.tracks.every(track => track.effects.length === 4));
  assert.equal(compiled.tracks[0].clips.length, 3); assert.equal(compiled.tracks[0].clips[0].start, 0);
  assert.deepEqual(clone(compiled.assets), clone(state.assets));
  for (const clip of compiled.tracks[0].clips) for (const key of ['assetId', 'sourceStart', 'sourceEnd', 'sourceOffset', 'rate', 'reverse', 'loop', 'gain', 'fadeIn', 'fadeOut']) assert.equal(clip[key], state.tracks[0].clips[0][key]);
  assert.equal(new Set(compiled.tracks.flatMap(track => track.clips.map(clip => clip.id))).size, 3);
  assert.equal(S.serializeProject(S.parseProject(S.serializeProject(compiled))), S.serializeProject(compiled));
});
check('Normal SERVICE cycles and compiled editable source clips are sample-identical away from the final capture seam', () => {
  const state = fixture(), live = render(state, 9, true), compiled = render(C.compile({ state, take: take(9) }), 9, false);
  const limit = live.left.length - 25;
  for (let frame = 0; frame < limit; frame++) { assert(Math.abs(live.left[frame] - compiled.left[frame]) < 1e-7, 'left timing mismatch at ' + frame); assert(Math.abs(live.right[frame] - compiled.right[frame]) < 1e-7, 'right timing mismatch at ' + frame); }
});
check('Reverse, speed, source trims and offsets remain native controls', () => {
  const state = fixture(), source = state.tracks[0].clips[0]; source.reverse = true; source.rate = 1.75; source.sourceOffset = 1.2;
  const out = C.compile({ state, take: take(5) }), clips = out.tracks[0].clips;
  assert.equal(clips.length, 2); assert.equal(clips[0].reverse, true); assert.equal(clips[0].rate, 1.75); assert.equal(clips[1].start, 4); assert.equal(clips[1].sourceOffset, 1.2); assert.equal(clips[1].length, 1);
});
check('Macro and drop snapshots produce hold automation, restore static baselines, and never split a source cycle', () => {
  const state = fixture(); state.tracks[0].automation = [{ target: 'pan', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: -1 }, { beat: 8, value: 1 }] }];
  const fx = scope.LoomEffectsCatalog.find(effect => effect.id === 'cinder'); state.tracks[0].effects[0] = S.effect({ type: fx.id, params: fx.defaults });
  const drop = Array(8).fill(false); drop[0] = true;
  const events = [scene(), performance(1, { overrides: [{ trackId: 'track-1', target: 'level', value: 1.1 }, { trackId: 'track-1', target: 'fx:0:drive', value: 22, effectType: 'cinder' }, { trackId: 'track-1', target: 'fx:0:mix', value: .2, effectType: 'cinder' }] }), performance(2, { drops: drop, overrides: [{ trackId: 'track-1', target: 'level', value: 1.2 }] }), performance(3)];
  const out = C.compile({ state, take: take(8, events) }), lanes = new Map(out.tracks[0].automation.map(lane => [lane.target, lane]));
  assert.equal(out.tracks[0].clips.length, 2); assert.equal(lanes.has('pan'), false); assert.equal(lanes.get('level').interpolation, 'hold');
  assert.deepEqual(clone(lanes.get('level').points), [{ beat: 0, value: .8 }, { beat: 1, value: 1.1 }, { beat: 2, value: 0 }, { beat: 3, value: .8 }]);
  assert.equal(lanes.get('fx:0:drive').effectType, 'cinder'); assert.equal(lanes.get('fx:0:drive').points[1].value, 22); assert.equal(lanes.get('fx:0:drive').points[2].value, state.tracks[0].effects[0].params.drive);
  assert.equal(lanes.get('fx:0:mix').points[1].value, .2); assert.equal(lanes.get('fx:0:mix').points[2].value, state.tracks[0].effects[0].params.mix);
  assert.deepEqual(clone(out.tracks[0].effects), clone(state.tracks[0].effects));
});
check('Fill begins at the acknowledged phase and release returns to the running original scene phase', () => {
  const state = fixture(), events = [scene(), performance(2, { fill: true, padBeat: 2, phaseOrigins: [2, 0, 0, 0, 0, 0, 0, 0] }), performance(4, { padBeat: 4, phaseOrigins: [2, 0, 0, 0, 0, 0, 0, 0] })];
  const out = C.compile({ state, take: take(8, events) }), clips = out.tracks[0].clips;
  assert.equal(clips[0].start, 0); assert.equal(clips[0].length, 2);
  assert.equal(clips[1].start, 2); assert.equal(clips[1].length, 1); assert.equal(clips[1].rate, 2); assert(Math.abs(clips[1].sourceOffset - 1.2) < 1e-8);
  assert.equal(clips[2].start, 3); assert.equal(clips[2].sourceOffset, .2); assert.equal(clips[2].fadeIn, .02);
  assert.equal(clips[3].start, 4); assert.equal(clips[3].rate, 1); assert.equal(clips[3].sourceOffset, .2);
});
check('Fill respects the native eight-times speed limit while preserving its effective cycle length', () => {
  const state = fixture(); state.tracks[0].clips[0].rate = 6;
  const out = C.compile({ state, take: take(6, [scene(), performance(0, { fill: true, padBeat: 0, phaseOrigins: Array(8).fill(0) })]) });
  assert.equal(out.tracks[0].clips.length, 2); assert.equal(out.tracks[0].clips[0].rate, 8); assert.equal(out.tracks[0].clips[0].length, 3);
});
check('A held track preserves its own scene clock and an uninterrupted clip while other tracks relaunch', () => {
  const state = fixture(); state.tracks[1].clips.push({ ...clone(state.tracks[0].clips[0]), id: 'second-source' });
  const events = [scene(0, selection('source-one', 'second-source')), scene(3, selection('source-one', 'second-source'), { sceneStarts: [0, 3, 3, 3, 3, 3, 3, 3], padBeats: [0, 3, 3, 3, 3, 3, 3, 3] })];
  const out = C.compile({ state, take: take(8, events) });
  assert.deepEqual(Array.from(out.tracks[0].clips, clip => [clip.start, clip.length]), [[0, 4], [4, 4]]);
  assert.deepEqual(Array.from(out.tracks[1].clips, clip => [clip.start, clip.length]), [[0, 3], [3, 4], [7, 1]]);
  assert.equal(out.markers.length, 2);
});
check('Short stutters retain the original source, anchored offset and native seam controls', () => {
  const state = fixture(), events = [scene(), performance(1.5, { stutterBeats: .25, padBeat: 1.5, phaseOrigins: [1.5, 0, 0, 0, 0, 0, 0, 0] }), performance(3.5, { padBeat: 3.5, phaseOrigins: [1.75, 0, 0, 0, 0, 0, 0, 0] })];
  const out = C.compile({ state, take: take(8, events) }), repeated = out.tracks[0].clips.filter(clip => clip.start >= 1.5 && clip.start < 3.5);
  assert.equal(repeated.length, 8); assert(out.assets.length === state.assets.length);
  for (const clip of repeated) { assert.equal(clip.length, .25); assert(Math.abs(clip.sourceOffset - .95) < 1e-8); assert.equal(clip.loop, true); assert.equal(clip.assetId, 'source-audio'); }
  assert(Math.abs(out.tracks[0].clips.find(clip => clip.start === 3.5).sourceOffset - .2) < 1e-8);
});
check('Long stutters use one bounded dry cycle asset with native effects, rather than truncating hundreds of clips', () => {
  const state = fixture(), fx = scope.LoomEffectsCatalog.find(effect => effect.id === 'cinder'); state.tracks[0].effects[0] = S.effect({ type: fx.id, params: fx.defaults });
  const before = JSON.stringify(state), events = [scene(), performance(0, { stutterBeats: .125, padBeat: 0, phaseOrigins: [1.5, 0, 0, 0, 0, 0, 0, 0] })], request = { state, take: take(64, events) };
  const summary = C.preflight(request), out = C.compile(request), clip = out.tracks[0].clips[0], generated = out.assets.find(asset => asset.id === clip.assetId), audio = S.decodeAsset(generated);
  assert.equal(JSON.stringify(state), before); assert.equal(summary.generatedAssets, 1); assert.equal(out.tracks[0].clips.length, 1); assert.equal(clip.loop, true); assert.equal(clip.rate, 1); assert.equal(clip.length, 64); assert.equal(clip.sourceEnd, .0625); assert.equal(clip.gain, .7);
  assert(audio.left.some(value => Math.abs(value) > .01)); assert(audio.left.every(Number.isFinite)); assert.equal(audio.left[0], 0); assert.equal(audio.left[audio.left.length - 1], 0);
  assert.deepEqual(clone(out.tracks[0].effects), clone(state.tracks[0].effects)); assert.equal(out.assets.length, 2);
  assert.equal(S.parseProject(S.serializeProject(out)).tracks[0].clips.length, 1);
});
check('Short one-shot drum loops compile for all 256 beats with their original silence and source envelope intact', () => {
  const state = fixture(); state.tracks[0].clips[0].length = 1; state.tracks[0].clips[0].loop = false; state.tracks[0].clips[0].sourceEnd = .7;
  const out = C.compile({ state, take: take(256) }), summary = C.preflight({ state, take: take(256) });
  assert.equal(out.tracks[0].clips.length, 1); assert.equal(summary.generatedAssets, 1); assert.equal(out.tracks[0].clips[0].length, 256);
  const original = render(state, 8, true), captured = render(out, 8, false);
  for (let frame = 25; frame < original.left.length; frame++) { assert(Math.abs(original.left[frame] - captured.left[frame]) < .000035, 'dry cycle waveform changed at ' + frame); assert(Math.abs(original.right[frame] - captured.right[frame]) < .000035); }
  const generated = S.decodeAsset(out.assets.find(asset => asset.id === out.tracks[0].clips[0].assetId));
  assert(generated.left.subarray(Math.ceil(.4 * generated.sampleRate)).every(value => value === 0), 'The original one-shot silence must remain in each cycle.');
});
check('A normal three-second take and the full 256-beat session compile without touching the source arrangement', () => {
  const state = fixture(), before = JSON.stringify(state), short = C.compile({ state, take: take(6) }), full = C.compile({ state, take: take(256) });
  assert.equal(short.tracks[0].clips.length, 2); assert.equal(short.tracks[0].clips[1].length, 2); assert.equal(full.tracks[0].clips.length, 64); assert.equal(full.lengthBars, 64); assert.equal(JSON.stringify(state), before);
});
check('Normal Stop retains a tiny final cycle from a non-grid source period without rejecting or extending the take', () => {
  const state = fixture(); state.tracks[0].clips[0].length = 2.99913;
  const before = JSON.stringify(state), request = { state, take: take(6) }, out = C.compile(request), summary = C.preflight(request), clip = out.tracks[0].clips[0];
  assert.equal(JSON.stringify(state), before); assert.equal(out.tracks[0].clips.length, 1); assert.equal(clip.start, 0); assert.equal(clip.length, 6); assert.equal(clip.sourceEnd, 2.99913 * .5); assert.equal(summary.generatedAssets, 1);
  assert.equal(S.parseProject(S.serializeProject(out)).tracks[0].clips[0].length, 6);
  const original = render(state, 6, true), captured = render(out, 6, false);
  for (let frame = 25; frame < original.left.length - 25; frame++) assert(Math.abs(original.left[frame] - captured.left[frame]) < .0003, 'A non-grid cycle lost its phase at ' + frame);
});
check('A quantized scene launch beside a non-grid cycle boundary keeps both scenes and all tiny source fragments', () => {
  const state = fixture(); state.tracks[0].clips[0].length = 3.999;
  state.tracks[1].clips.push({ ...clone(state.tracks[0].clips[0]), id: 'held-source', length: 4 });
  const events = [scene(0, selection('source-one', 'held-source')), scene(4, selection('source-one', 'held-source'), { sceneStarts: [4, 0, 4, 4, 4, 4, 4, 4], padBeats: [4, 0, 4, 4, 4, 4, 4, 4] })];
  const out = C.compile({ state, take: take(8, events) });
  assert.deepEqual(Array.from(out.tracks[0].clips, clip => [clip.start, clip.length, clip.sourceOffset]), [[0, 4, 0], [4, 4, 0]]);
  assert.equal(out.tracks[0].clips[0].assetId, out.tracks[0].clips[1].assetId, 'The same dry cycle should be reused.');
  assert.deepEqual(Array.from(out.tracks[1].clips, clip => [clip.start, clip.length, clip.assetId]), [[0, 4, 'source-audio'], [4, 4, 'source-audio']]);
  assert.deepEqual(Array.from(out.markers, marker => marker.beat), [0, 4]);
  assert.equal(out.assets.length, 2); assert.equal(S.parseProject(S.serializeProject(out)).tracks[0].clips.length, 2);
});
check('Complex or invalid takes fail before any project mutation, rather than silently discarding sounds or moves', () => {
  const state = fixture(), before = JSON.stringify(state);
  assert.throws(() => C.compile({ state, take: take(8, [scene(0, selection('missing'))]) }), /scene source is missing/);
  assert.throws(() => C.compile({ state, take: take(8, [scene(), performance(2), performance(1)]) }), /run forward/);
  assert.throws(() => C.compile({ state, take: take(8, [scene(), performance(1, { overrides: [{ trackId: 'track-1', target: 'fx:3:drive', value: 2 }] })]) }), /unavailable control/);
  assert.throws(() => C.compile({ state, take: take(8, [scene(), performance(1, { tempo: 121 })]) }), /tempo changes/);
  assert.throws(() => C.compile({ state, take: take(8, [scene(), performance(.001, { fill: true })]) }), /1\/64-beat/);
  const switches = [scene()]; for (let index = 1; index <= 130; index++) switches.push(performance(index, { fill: index % 2 === 1 }));
  assert.throws(() => C.compile({ state, take: take(132, switches) }), /128 clips/);
  const events = [scene()]; for (let index = 0; index < 4097; index++) events.push(performance(index / 20, { overrides: [{ trackId: 'track-1', target: 'pan', value: index % 2 ? .2 : .3 }] }));
  assert.throws(() => C.compile({ state, take: take(256, events) }), /4,096 moves/);
  assert.equal(JSON.stringify(state), before);
});
check('Unprepared native note sources fail clearly instead of changing probability or instrument sound', () => {
  const state = fixture(); state.tracks[0].clips[0].type = 'notes';
  assert.throws(() => C.compile({ state, take: take(8) }), /prepared as dry audio/);
});
console.log(JSON.stringify({ passed: passed.length, checks: passed }, null, 2));
