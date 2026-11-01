'use strict';
/* Nominal-rate master capture: Float32 parity, loop history, cancellation and memory. */
const assert = require('node:assert/strict');
const q = require('./mastering-checks.cjs');
function reference(release, state, assets, options) {
  const rate = options.sampleRate || 48000, start = options.startBeat || 0, end = options.endBeat || state.lengthBars * 4, loop = options.previewLoop === true;
  const raw = (end - start) * 60 / state.tempo * rate, body = Math.max(1, Math.round(raw)), warm = loop ? Math.ceil(raw) : 0;
  const tail = loop ? 0 : Math.round((options.tailSeconds ?? 8) * rate), captured = body + tail, total = warm + captured;
  const copy = release.S.copy(state); if (loop) Object.assign(copy, { loopEnabled: true, loopStart: start, loopEnd: end });
  const core = new release.DSP.Core(copy, assets, rate, { linear: !loop, includeMetronome: options.includeMetronome === true });
  const left = new Float32Array(total), right = left.slice(); core.start(start);
  for (let at = 0; at < total;) {
    if (!loop && at === body) core.stop();
    const boundary = at < warm ? warm : at < warm + body ? warm + body : total, count = Math.min(2048, boundary - at);
    core.processBlock(left.subarray(at, at + count), right.subarray(at, at + count)); at += count;
  }
  return { left: left.slice(warm), right: right.slice(warm), sampleRate: rate, frames: captured, bodyFrames: body, startBeat: start, endBeat: end, tailFrames: tail };
}
async function run() {
  const release = q.load(), { S, scope } = release, passed = [], evidence = {};
  const check = async (name, test) => { await test(); passed.push(name); console.log('PASS ' + name); };
  await check('Master Float32 capture follows the complete production master path without WAV quantization or state edits', async () => {
    const input = q.assetFixture(release, 8), state = input.state;
    state.tracks[8].sends = [.2, .3]; state.returns[0].effects[0] = S.effect({ type: 'vestige', params: { mix: .5, decay: 1 } });
    state.master.effects[0] = S.effect({ type: 'prism', params: { low: 2, high: -1 } });
    state.master.mastering = S.normalizeMastering({ enabled: true, eq: true, highGain: 1, glue: true, threshold: -24, limiter: true, ceiling: -3 });
    const before = S.serializeProject(state), engine = new scope.LoomAudio(state), options = { startBeat: .5, endBeat: 3.5, tailSeconds: .2 };
    const actual = await engine.renderMasterPCM(state, input.assets, options), expected = reference(release, state, input.assets, options);
    assert.deepEqual(actual, expected); assert(actual.left instanceof Float32Array && actual.right instanceof Float32Array);
    assert(q.rms(actual.left) > .001); assert(actual.left.some(value => value !== Math.round(value * 32767) / 32767));
    assert.equal(S.serializeProject(state), before); assert.equal(engine._exportCount, 0);
    const wav = new DataView(await (await engine.renderWav(state, input.assets, options)).arrayBuffer());
    assert.equal(wav.byteLength, 44 + actual.frames * 4);
    for (let at = 0; at < actual.frames; at++) for (let channel = 0; channel < 2; channel++) {
      const sample = Math.max(-1, Math.min(1, (channel ? actual.right : actual.left)[at])), expectedPcm = Math.round(sample * (sample < 0 ? 32768 : 32767)) || 0;
      assert.equal(wav.getInt16(44 + at * 4 + channel * 2, true), expectedPcm);
    }
    evidence.floatCapture = { frames: actual.frames, bodyFrames: actual.bodyFrames, tailFrames: actual.tailFrames, hash: q.hash([actual.left, actual.right]), wavQuantizationOnly: true };
  });
  await check('Loop preview discards a complete warm-up cycle and carries master delay history into the captured loop', async () => {
    const state = q.blank(release), rate = 8000, frames = rate * 2, audio = q.signal(frames, rate, .08);
    for (const channel of audio) for (let at = 0; at < frames; at++) if (at < rate * 1.82 || at > rate * 1.9) channel[at] = 0;
    const asset = S.encodeAsset({ id: 'late-loop-pulse', name: 'Late pulse', sampleRate: rate, left: audio[0], right: audio[1] });
    state.assets = [asset]; state.tracks[8].clips = [{ id: 'late-pulse-clip', name: 'Late pulse', type: 'audio', assetId: asset.id, start: 0, length: 4, sourceStart: 0, sourceEnd: 2, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: 1, fadeIn: 0, fadeOut: 0 }];
    state.master.effects[0] = S.effect({ type: 'parallax', params: { clock: 'free', time: 200, feedback: .6, mix: .7 } });
    const assets = S.decodeAssets(state.assets), engine = new scope.LoomAudio(state), before = S.serializeProject(state), options = { sampleRate: rate, startBeat: 0, endBeat: 4, previewLoop: true, tailSeconds: 20 };
    const actual = await engine.renderMasterPCM(state, assets, options), expected = reference(release, state, assets, options);
    assert.deepEqual(actual, expected); assert.equal(actual.tailFrames, 0); assert.equal(actual.frames, frames);
    assert(q.rms(actual.left, 0, rate / 5) > .001, 'A master echo from the previous loop must reach the captured beginning');
    const fresh = await engine.renderMasterPCM(state, assets, { ...options, previewLoop: false, tailSeconds: 0 });
    assert.equal(q.rms(fresh.left, 0, rate / 5), 0); assert.equal(S.serializeProject(state), before);
    state.tempo = 131; const fractional = { sampleRate: rate, startBeat: .25, endBeat: .5, previewLoop: true };
    assert.deepEqual(await engine.renderMasterPCM(state, assets, fractional), reference(release, state, assets, fractional));
    evidence.loopWarmup = { carryRms: q.rms(actual.left, 0, rate / 5), initialColdRms: q.rms(fresh.left, 0, rate / 5), fractionalFrameLoopCovered: true };
  });
  await check('Memory and range guards reject before allocation or asset reads and always release the export counter', async () => {
    const input = q.assetFixture(release), engine = new scope.LoomAudio(input.state), unreadable = new Proxy({}, { get() { throw Error('Unexpected asset read'); }, ownKeys() { throw Error('Unexpected asset read'); } });
    await assert.rejects(engine.renderMasterPCM(input.state, unreadable, { maxPCMBytes: 0 }), /memory|shorter/i);
    await assert.rejects(engine.renderMasterPCM(input.state, unreadable, { maxPCMBytes: Infinity }), /finite memory/i);
    for (const sampleRate of [7999, 192001, 44100.5, NaN]) await assert.rejects(engine.renderMasterPCM(input.state, unreadable, { sampleRate }), /sample rate/i);
    for (const options of [{ trackId: 'track-9' }, { returnId: 'return-1' }, { previewLoop: true, startBeat: 1, endBeat: 1.1 }, { previewLoop: true, startBeat: 255.5, endBeat: 256 }]) await assert.rejects(engine.renderMasterPCM(input.state, unreadable, options), /complete mix|preview loop/i);
    engine._audioApplying = true; await assert.rejects(engine.renderMasterPCM(input.state, unreadable), /audio interface/i); engine._audioApplying = false;
    assert.equal(engine._exportCount, 0);
  });
  await check('Progress yields to the event loop and both early and mid-render cancellation leave no busy count', async () => {
    const input = q.assetFixture(release), engine = new scope.LoomAudio(input.state), early = new AbortController(); early.abort();
    await assert.rejects(engine.renderMasterPCM(input.state, input.assets, { signal: early.signal }), { name: 'AbortError' }); assert.equal(engine._exportCount, 0);
    const state = S.copy(input.state); state.lengthBars = 4; state.loopEnd = 16; const active = new AbortController(), progress = [];
    setTimeout(() => active.abort(), 0);
    await assert.rejects(engine.renderMasterPCM(state, input.assets, { sampleRate: 8000, tailSeconds: 0, signal: active.signal, onProgress: value => progress.push(value) }), { name: 'AbortError' });
    assert.equal(progress[0], 0); assert(progress.some(value => value > 0 && value < 1)); assert.equal(engine._exportCount, 0);
    let yielded = false; setTimeout(() => { yielded = true; }, 0); const completed = [];
    await engine.renderMasterPCM(state, input.assets, { sampleRate: 8000, tailSeconds: 0, onProgress: value => completed.push(value) });
    assert(yielded); assert.equal(completed[0], 0); assert.equal(completed.at(-1), 1); assert(completed.every((value, i) => !i || value >= completed[i - 1])); assert.equal(engine._exportCount, 0);
    await assert.rejects(engine.renderMasterPCM(state, input.assets, { sampleRate: 8000, tailSeconds: 0, onProgress: () => { throw Error('Progress callback failure'); } }), /Progress callback failure/); assert.equal(engine._exportCount, 0);
  });
  await check('Frozen master capture stays at its stored nominal rate and explicit supported rates apply only to unfrozen sessions', async () => {
    const input = q.assetFixture(release), frozen = q.freeze(release, input), engine = new scope.LoomAudio(frozen.state), options = { startBeat: 0, endBeat: 4, tailSeconds: 0 };
    const actual = await engine.renderMasterPCM(frozen.state, frozen.assets, options);
    assert.equal(actual.sampleRate, input.rate); assert.deepEqual(actual, reference(release, frozen.state, frozen.assets, { ...options, sampleRate: input.rate }));
    await assert.rejects(engine.renderMasterPCM(frozen.state, frozen.assets, { ...options, sampleRate: 48000 }), /frozen tracks.*sample rate/i); assert.equal(engine._exportCount, 0);
    const changed = await engine.renderMasterPCM(input.state, input.assets, { ...options, sampleRate: 16000 }); assert.equal(changed.sampleRate, 16000); assert.equal(changed.bodyFrames, 32000);
    evidence.frozenRate = { nominal: actual.sampleRate, mismatchedRateRejected: true, explicitUnfrozenRate: changed.sampleRate };
  });
  console.log(passed.length + ' master Float32 render groups passed.'); console.log(JSON.stringify(evidence)); return { passed, evidence };
}
module.exports = { run };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
