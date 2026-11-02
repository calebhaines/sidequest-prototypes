'use strict';
/* Ten real recording lanes, two shared returns and the mastering pass. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const q = require('./mastering-checks.cjs');
const lane = (target, from, to, effectType) => ({ target, enabled: true, interpolation: 'linear', points: [{ beat: 0, value: from }, { beat: 4, value: to }], ...(effectType ? { effectType } : {}) });
const envelope = (S, state, appVersion = S.VERSION) => JSON.stringify({ format: 'loom-project', formatVersion: 1, appVersion, state });
function legacyFixture(old) {
  const input = q.assetFixture(old, 0), { state } = input, { S } = old;
  state.name = 'An existing eight-track session'; state.tracks[0].sends = [.2, .12];
  state.tracks[0].effects[0] = S.effect({ type: 'cinder', params: { drive: 5, mix: .35, output: -5 } });
  state.tracks[0].eq.low = 2.2; state.tracks[0].eq.highMid = -1.4;
  state.returns[0].effects[0] = S.effect({ type: 'prism', params: { mid: 3, midFreq: 630 } });
  state.master.effects[0] = S.effect({ type: 'velvet', params: { model: 'bus-4k', threshold: -24, ratio: 2, mix: .4 } });
  return input;
}
async function run() {
  const release = q.load(), { S, DSP, M } = release, passed = [], evidence = {};
  const inGitCheckout = fs.existsSync(path.join(path.resolve(__dirname, '..'), '.git'));
  const check = async (name, test) => {
    if (process.env.TEN_TRACK_QA_FILTER && !new RegExp(process.env.TEN_TRACK_QA_FILTER).test(name)) return;
    const needsPublishedBaseline = /^(Strict legacy eight-track|Migrated eight-track sessions|Legacy SERVICE vectors)/.test(name);
    if (needsPublishedBaseline && !inGitCheckout) { console.log('SKIP ' + name + ' (published-source comparison requires its Git checkout)'); return; }
    await test(); passed.push(name); console.log('PASS ' + name);
  };
  await check('Ten complete recording tracks have unique identities and keep five inserts EQ sends and full automation', () => {
    const state = S.defaultState(); assert.equal(S.VERSION, '1.37.0'); assert.equal(S.LIMITS.tracks, 10); assert.equal(state.tracks.length, 10); assert.equal(state.returns.length, 2); assert.equal(state.master.effects.length, 4);
    assert.deepEqual(state.tracks.map(track => track.id), Array.from({ length: 10 }, (_, i) => 'track-' + (i + 1)));
    for (const track of state.tracks) { assert.equal(track.effects.length, 5); assert.equal(S.effectSlotCount(track), 5); assert.equal(track.sends.length, 2); assert.equal(track.sendPre.length, 2); assert.match(track.color, /^#[0-9a-f]{6}$/i); assert.equal(S.automationOwner(state, track.id), track); assert(S.automationTargets(track).some(item => item.target === 'eq:highMidFreq')); }
    assert.equal(S.automationOwner(state, 'track-11'), null); assert.equal(S.automationOwner(state, 'track-0'), null); assert.equal(S.automationOwner(state, 'track-01'), null);
    const malformed = S.copy(state); malformed.tracks[9].effects.pop(); assert.throws(() => S.parseProject(envelope(S, malformed)));
    assert.deepEqual(q.plain(S.parseProject(S.serializeProject(state))), q.plain(S.normalize(state))); evidence.capacity = { tracks: state.tracks.length, owners: q.owners(state).length, insertCounts: state.tracks.map(track => track.effects.length) };
  });
  await check('Strict legacy eight-track files append two empty tracks while current and malformed track counts reject', () => {
    const old = q.load(q.BASELINE), input = legacyFixture(old), encoded = old.S.serializeProject(input.state), migrated = S.parseProject(encoded);
    assert.equal(migrated.tracks.length, 10); for (let i = 0; i < 8; i++) assert.deepEqual(q.plain(migrated.tracks[i]), { ...q.plain(input.state.tracks[i]), disabled: false });
    for (let i = 8; i < 10; i++) { const track = migrated.tracks[i]; assert.equal(track.clips.length, 0); assert(track.effects.every(slot => slot === null)); assert.deepEqual(track.sends, [0, 0]); assert.equal(track.instrument, null); }
    assert.deepEqual(q.plain(migrated.master.effects), q.plain(input.state.master.effects));
    const currentEight = S.copy(migrated); currentEight.tracks.length = 8; assert.throws(() => S.parseProject(envelope(S, currentEight)));
    for (const count of [7, 9, 11]) { const state = S.copy(migrated); state.tracks = state.tracks.slice(0, count); if (count === 11) state.tracks.push({ ...S.copy(state.tracks[9]), id: 'track-11' }); assert.throws(() => S.parseProject(envelope(S, state, '1.31.0')), 'Malformed legacy count ' + count); }
    assert.deepEqual(q.plain(M.normalize(migrated.master.mastering)), q.plain(M.normalize({}))); evidence.legacyAppVersion = JSON.parse(encoded).appVersion;
  });
  await check('Migrated eight-track sessions retain exact stereo PCM with the two new lanes and mastering idle', () => {
    const old = q.load(q.BASELINE), report = {};
    for (const variation of ['flat', 'rack', 'automation']) {
      const input = legacyFixture(old); if (variation === 'flat') for (const owner of q.owners(input.state)) { owner.effects.fill(null); if (owner.eq) Object.keys(owner.eq).filter(key => !key.endsWith('Freq')).forEach(key => owner.eq[key] = 0); }
      if (variation === 'automation') { input.state.tracks[0].automation = [lane('level', .2, .8), lane('pan', -.5, .6)]; input.state.returns[0].automation = [lane('level', .3, .8)]; input.state.master.automation = [lane('level', .6, .9)]; Object.assign(input.state.lfos[0], { enabled: true, sync: false, rate: .7, depth: .3, routes: [{ id: 'old-pan', ownerId: 'track-1', target: 'pan', enabled: true, amount: .2 }] }); }
      const migrated = S.parseProject(old.S.serializeProject(input.state)), assets = S.decodeAssets(migrated.assets), before = q.render(old, input.state, input.assets, input.rate, input.frames).audio, after = q.render(release, migrated, assets, input.rate, input.frames).audio;
      assert.deepEqual(after, before, variation + ' changed old stereo PCM'); report[variation] = q.hash(after);
    }
    evidence.oldStereoPcm = report;
  });
  await check('New input lanes nine and ten mix independently and the microphone occupies its separate eleventh input', () => {
    const state = q.blank(release), rate = 8000, frames = 4096, sources = Array.from({ length: 10 }, (_, i) => q.tone(71 + i * 43, frames, rate, .007)); state.tracks.forEach(track => { track.instrumentLive = true; track.level = 1; }); state.master.level = 1;
    const mixed = q.render(release, state, {}, rate, frames, {}, 128, sources), parts = sources.map((source, index) => q.render(release, state, {}, rate, frames, {}, 128, Array.from({ length: 10 }, (_, i) => i === index ? source : null)).audio);
    for (let channel = 0; channel < 2; channel++) for (let frame = 0; frame < frames; frame++) { const expected = parts.reduce((sum, pair) => sum + pair[channel][frame], 0); assert(Math.abs(mixed.audio[channel][frame] - expected) < 4e-8, 'Track summation dropped or duplicated a lane'); }
    for (const index of [8, 9]) assert(q.rms(parts[index][0], 1000) > .003);
    const microphone = q.tone(997, frames, rate, .03), micOnly = Array(10).fill(null).concat([microphone]); const silent = q.render(release, state, {}, rate, frames, {}, 128, micOnly); assert.equal(q.peak(silent.audio[0]), 0, 'Unmonitored microphone leaked into a recording lane');
    const core = new DSP.Core(state, {}, rate, { linear: true }); core.start(0); core.setMicrophoneMonitor(9, true); const output = [new Float32Array(frames), new Float32Array(frames)]; for (let at = 0; at < frames; at += 128) core.processBlock(output[0].subarray(at, at + 128), output[1].subarray(at, at + 128), Array(10).fill(null).concat([microphone.map(channel => channel.subarray(at, at + 128))])); assert(q.rms(output[0], 1000) > .01);
    const meters = mixed.core.getMeters(); assert.equal(meters.tracks.length, 10); assert.equal(meters.effects.length, 10); assert.equal(meters.returns.length, 2); assert.equal(meters.returnEffects.length, 2); assert.equal(meters.masterEffects.length, 4); evidence.inputLaneRms = parts.map(pair => q.rms(pair[0], 1000));
  });
  await check('The real dry recorder captures both new lanes and microphone-to-track-ten without swapping channels', () => {
    const rate = 8000, frames = 1024, a = q.signal(frames, rate, .11), b = q.signal(frames, rate, .19), mic = q.tone(239, frames, rate, .27), chunks = [], recorder = new DSP.Recorder(rate, chunk => chunks.push(chunk), () => {}); recorder.start(1, [8, 9], 2, frames, {});
    for (let at = 0; at < frames; at += 137) { const end = Math.min(frames, at + 137), inputs = Array.from({ length: 11 }, () => []); inputs[8] = a.map(channel => channel.subarray(at, end)); inputs[9] = b.map(channel => channel.subarray(at, end)); inputs[10] = mic.map(channel => channel.subarray(at, end)); recorder.capture(inputs, end - at); }
    recorder.stop(); assert.equal(chunks.length, 2); for (const [index, reference] of [[8, a], [9, b]]) { const chunk = chunks.find(chunk => chunk.trackIndex === index); assert(chunk); assert.deepEqual(chunk.left, reference[0]); assert.deepEqual(chunk.right, reference[1]); assert.equal(chunk.startBeat, 2); }
    const microphoneChunks = [], microphoneRecorder = new DSP.Recorder(rate, chunk => microphoneChunks.push(chunk), () => {}); microphoneRecorder.start(2, [9], 0, frames, { microphone: { inputIndex: 10, compensationFrames: 0 } }); const inputs = Array.from({ length: 11 }, () => []); inputs[8] = a; inputs[9] = b; inputs[10] = mic; microphoneRecorder.capture(inputs, frames); microphoneRecorder.stop(); assert.equal(microphoneChunks.length, 1); assert.equal(microphoneChunks[0].trackIndex, 9); assert.deepEqual(microphoneChunks[0].left, mic[0]); assert.deepEqual(microphoneChunks[0].right, mic[1]); evidence.recordedIndices = chunks.map(chunk => chunk.trackIndex);
  });
  await check('Drawn automation and cross-modulated global LFOs address both new track IDs without block drift', () => {
    const input = q.assetFixture(release, 8), state = input.state; state.tracks[9].clips = state.tracks[8].clips.map(clip => ({ ...clip, id: clip.id + '-10', gain: .4 }));
    for (const index of [8, 9]) { state.tracks[index].effects[4] = S.effect({ type: 'prism', params: { mid: index === 8 ? 3 : -4 } }); state.tracks[index].automation = [lane('level', .2, .8), lane('eq:lowMidFreq', 180, 950), lane('fx:4:mid', -3, 4, 'prism')]; }
    Object.assign(state.lfos[0], { enabled: true, sync: false, rate: 1.1, depth: .4, routes: [{ id: 'new-track9-pan', ownerId: 'track-9', target: 'pan', enabled: true, amount: .4 }, { id: 'new-track10-fx', ownerId: 'track-10', target: 'fx:4:mid', effectType: 'prism', enabled: true, amount: .2 }] });
    const restored = S.parseProject(S.serializeProject(state)), a = q.render(release, restored, input.assets, input.rate, input.frames, {}, 128), b = q.render(release, restored, input.assets, input.rate, input.frames, {}, [1, 17, 137, 251]); assert.deepEqual(a.audio, b.audio); assert(q.rms(a.audio[0]) > .001);
    const targets = release.scope.createLoomLFODSP().targets(restored, S.automationTargets); for (const id of ['track-9', 'track-10']) assert(targets.some(target => target.ownerId === id && target.target === 'fx:4:mid')); evidence.newTrackAutomationPcm = q.hash(a.audio);
  });
  await check('Frozen tracks nine and ten remove their processors while all shared buses and remaining audio stay exact', () => {
    const report = {};
    for (const index of [8, 9]) { const input = q.assetFixture(release, index); input.state.tracks[index].effects[0] = S.effect({ type: 'prism', params: { mid: -4, midFreq: 800 } }); input.state.tracks[index].sends = [.2, .13]; input.state.tracks[index].automation = [lane('level', .4, .9)]; input.state.returns[0].effects[0] = S.effect({ type: 'cinder', params: { drive: 4, mix: .3, output: -3 } }); const before = q.render(release, input.state, input.assets, input.rate, input.frames), frozen = q.freeze(release, input, 'track-' + (index + 1)), after = q.render(release, frozen.state, frozen.assets, input.rate, input.frames); for (let channel = 0; channel < 2; channel++) assert(q.difference(before.audio[channel], after.audio[channel]).max < 3e-7); assert(after.core.slots[index].every(slot => slot === null)); assert.equal(after.core.trackEq[index], null); assert.equal(after.core.clipLists[index].length, 0); assert(S.freezeValid(S.parseProject(S.serializeProject(frozen.state)), 'track-' + (index + 1))); report[index + 1] = q.hash(after.audio); }
    evidence.newTrackFreezes = report;
  });
  await check('Legacy SERVICE vectors and already-valid frozen fingerprints migrate together without invalidating the old sound', () => {
    const old = q.load(q.BASELINE), input = q.assetFixture(old, 0), service = old.scope.LoomServiceSchema.defaults(); service.scenes = [{ id: 'legacy-scene', name: 'Existing scene', lengthBeats: 4, slots: [{ mode: 'clip', clipId: input.state.tracks[0].clips[0].id }, ...Array.from({ length: 7 }, () => ({ mode: 'silence' }))] }]; service.selectedSceneId = 'legacy-scene'; service.take = { lengthBeats: 4, events: [{ kind: 'scene', beat: 0, sceneId: 'legacy-scene', clips: [input.state.tracks[0].clips[0].id, ...Array(7).fill(null)], phaseOrigins: Array(8).fill(0), sceneStarts: Array(8).fill(0), padBeats: Array(8).fill(0) }, { kind: 'performance', beat: 1, drops: Array(8).fill(false), fill: 0, stutterBeats: 0, overrides: [], phaseOrigins: Array(8).fill(0), sceneStarts: Array(8).fill(0), padBeats: Array(8).fill(0) }] }; input.state.service = old.scope.LoomServiceSchema.normalize(service, input.state); const frozen = q.freeze(old, input, 'track-1'); assert(old.S.freezeValid(frozen.state, 'track-1')); const migrated = S.parseProject(old.S.serializeProject(frozen.state)); assert(S.freezeValid(migrated, 'track-1')); assert.equal(migrated.service.scenes[0].slots.length, 10); for (const event of migrated.service.take.events) for (const key of ['clips', 'drops', 'phaseOrigins', 'sceneStarts', 'padBeats']) if (event[key]) assert.equal(event[key].length, 10, key); const stale = JSON.parse(old.S.serializeProject(frozen.state)); stale.state.tracks[0].level += .1; assert.throws(() => S.parseProject(JSON.stringify(stale)), 'Legacy migration must not bless stale frozen audio'); evidence.legacyFrozenService = { tracks: migrated.tracks.length, sceneCells: migrated.service.scenes[0].slots.length, freezeValid: true };
  });
  await check('CPU diagnostics enumerate all thirteen owners and fifth-slot effects on both new lanes', () => {
    const input = q.assetFixture(release, 9); for (const index of [8, 9]) input.state.tracks[index].effects[4] = S.effect({ type: 'prism', params: { mid: 2 } }); const core = new DSP.Core(input.state, input.assets, input.rate, { linear: true, diagnosticsClock: (() => { let time = 0; return () => time += .01; })() }); core.setDiagnostics({ enabled: true, mode: 'deep', sampleEvery: 1 }); core.start(0); core.processBlock(new Float32Array(128), new Float32Array(128)); const rows = core.getDiagnostics().rows, actual = new Set(rows.filter(row => row.kind === 'owner').map(row => row.ownerId)); assert.equal(actual.size, 13); for (const id of ['track-9', 'track-10', 'return-1', 'return-2', 'master']) assert(actual.has(id), id); for (const id of ['track-9:fx:4', 'track-10:fx:4']) assert(rows.some(row => row.id === id)); evidence.diagnosticsOwners = [...actual];
  });
  console.log(passed.length + ' ten-track project/engine groups passed.'); console.log(JSON.stringify(evidence)); return { passed, evidence };
}
module.exports = { run, legacyFixture };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
