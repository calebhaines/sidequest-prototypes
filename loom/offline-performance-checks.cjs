'use strict';
/* Offline allocation/cooperative-yield guards. Reference bytes are captured
 * only from immutable GALLEY 1.42.1, never from working DSP. Ordinary checks
 * need no Git history and keep public progress/cancellation semantics covered.
 * node loom/offline-performance-checks.cjs --record-baseline
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const P = require('./performance-142-checks.cjs');
const BASELINE = '5df579ee99caa7a73222f8d6a52268be4cab3c75';
function immutableBaseline() {
  // Reuse the portable module list, with its historical-source guard pinned to
  // this audit's later immutable commit. No working DSP is read by this mode.
  const Module = require('node:module'), filename = require.resolve('./performance-142-checks.cjs'), original = fs.readFileSync(filename, 'utf8');
  const source = original.replace("const BASELINE = '244ab5b41d14e42c8a588aea9a180725d0b71cba';", "const BASELINE = '" + BASELINE + "';");
  assert.notEqual(source, original, 'The historical loader guard must be explicitly pinned');
  const loader = new Module(filename, module); loader.filename = filename; loader.paths = module.paths; loader._compile(source, filename);
  return loader.exports.load(BASELINE);
}
const EXPECTED = /* OFFLINE-FROZEN-BEGIN */ {
  "wav-mix": "c383a61ea7dc41650651df9f562e0d75cfcc916a771847e520a0d0798cd4a2e9",
  "wav-track": "88d88a6f8ad4e3293973ad84143849f6eb9e559115c7d6905c16c26e355c3646",
  "wav-return": "0376da1e8022d20f428eff306d7f742de922fb27306051547bd284af3044ca80",
  "wav-bus": "eb021254f44cbd17dabe6ce231692682d450bbb98dc3f89d7619b95b66af9594",
  "master-linear": "c0216dd44d3f62419e391ad18a769b5226b0a51919de6712fb74b797433b960b",
  "master-loop-warmup": "46ff20bf1a01f63af38a6f8eac0bacb7c0638fe2f3a8ced5daf8fc86af18cd72",
  "freeze-worklet": "af36867b2476081525a93d34ecc3431aed73466674144b09c6ae3c3e3d0c2295",
  "freeze-fallback": "af36867b2476081525a93d34ecc3431aed73466674144b09c6ae3c3e3d0c2295",
  "freeze-streamed": "af36867b2476081525a93d34ecc3431aed73466674144b09c6ae3c3e3d0c2295"
} /* OFFLINE-FROZEN-END */;
const CASES = [
  { id: 'wav-mix', method: 'renderWav', options: { startBeat: .013, endBeat: .639, tailSeconds: .0137, includeMetronome: true } },
  { id: 'wav-track', method: 'renderWav', options: { trackId: 'track-2', startBeat: .017, endBeat: .617, tailSeconds: .0093 } },
  { id: 'wav-return', method: 'renderWav', options: { returnId: 'return-1', startBeat: .011, endBeat: .653, tailSeconds: .0187 } },
  { id: 'wav-bus', method: 'renderWav', options: { busId: 'bus-1', startBeat: .019, endBeat: .681, tailSeconds: .0113 } },
  { id: 'master-linear', method: 'renderMasterPCM', options: { sampleRate: 8000, startBeat: .037, endBeat: 1.031, tailSeconds: .0137 } },
  { id: 'master-loop-warmup', method: 'renderMasterPCM', options: { sampleRate: 11025, startBeat: .131, endBeat: .912, previewLoop: true } },
  { id: 'freeze-worklet', method: 'renderFreezeTrack', options: { trackId: 'track-2', sampleRate: 8000, tailSeconds: .0173, chunkSeconds: .037 } },
  { id: 'freeze-fallback', method: 'renderFreezeTrack', fallback: true, options: { trackId: 'track-2', sampleRate: 8000, tailSeconds: .0173, chunkSeconds: .037 } },
  { id: 'freeze-streamed', method: 'renderFreezeTrack', streamed: true, options: { trackId: 'track-2', sampleRate: 8000, tailSeconds: .0173, chunkSeconds: .037 } }
];
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function bytes(array) { return Buffer.from(array.buffer, array.byteOffset, array.byteLength); }
function fixture(r) {
  const state = r.S.defaultState(), assetRate = 11025, assetFrames = 2205;
  state.tempo = 137; state.lengthBars = 1; state.loopEnabled = false; state.loopStart = 0; state.loopEnd = 4; state.master.metronome = true;
  const owners = [...state.tracks, ...state.returns, ...state.buses, state.master];
  for (const owner of owners) { owner.effects.fill(null); owner.automation = []; owner.level = .73; owner.pan = 0; owner.mute = owner.solo = false; }
  const fx = (type, params) => r.S.effect({ type, params });
  state.tracks.forEach((track, index) => {
    track.disabled = index > 1; track.instrumentLive = false; track.clips = []; track.sends = [0, 0];
    if (index > 1) return;
    track.pan = index ? .27 : -.31; track.level = index ? .57 : .68;
    track.output = index ? 'bus-1' : 'master'; track.sends = index ? [.06, .03] : [.11, .04]; track.sendPre = [!index, false];
    track.eq.low = index ? .4 : -.7; track.eq.highMid = .8;
    track.clips = [{ assetId: 'source', start: 0, length: 4, sourceStart: .001013, sourceEnd: .183011, sourceOffset: .0271, rate: index ? .79 : 1.13, reverse: !!index, loop: true, gain: .71, fadeIn: .013, fadeOut: .017 }];
  });
  state.tracks[0].effects[0] = fx('prism', { low: .7, mid: -.8, cutoff: 2300, resonance: .61, filter: 'lowpass', mix: .6 });
  state.tracks[0].effects[1] = fx('cinder', { drive: 7, output: -9, mix: .21 });
  state.tracks[0].automation = [{ target: 'fx:0:cutoff', effectType: 'prism', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: 1000 }, { beat: 4, value: 4300 }] }];
  state.tracks[1].effects[0] = fx('velvet', { threshold: -24, ratio: 2.4, mix: .7 });
  state.buses[0].effects[0] = fx('prism', { filter: 'highpass', cutoff: 91, mix: .82 });
  state.returns[0].effects[0] = fx('parallax', { clock: 'free', time: 23, feedback: .16, mix: 1 });
  state.returns[1].effects[0] = fx('vestige', { model: 'original', decay: .2, predelay: .3, mix: 1 });
  state.master.effects[0] = fx('velvet', { model: 'bus-4k', threshold: -18, ratio: 2, mix: .5 });
  const channels = [0, 1].map(channel => Float32Array.from({ length: assetFrames }, (_, i) => .07 * Math.sin(i * (channel ? .0317 : .0233)) + .019 * Math.cos(i * .071 + channel)));
  return { state, assets: { source: { sampleRate: assetRate, left: channels[0], right: channels[1] } } };
}
function makeHost(r, f, item, onYield) {
  const host = new r.scope.LoomAudio(f.state);
  if (item.fallback) { host.mode = 'fallback'; host._processingFrames = 256; }
  let clock = 0, yields = 0;
  r.scope.performance = { now: () => (clock += 6) };
  r.scope.scheduler = { async yield() { yields++; onYield?.(yields); } };
  return { host, yields: () => yields };
}
function freezeDigest(result, chunks) {
  const hash = createHash('sha256');
  hash.update(JSON.stringify([result.sampleRate, result.bodyFrames, result.totalFrames, result.tailFrames]));
  for (const chunk of chunks) {
    hash.update(JSON.stringify([chunk.startFrame, chunk.frames]));
    for (const name of ['main', 'sendA', 'sendB']) {
      const plane = chunk.planes[name]; hash.update(name + (plane ? ':1' : ':0'));
      if (plane) { hash.update(bytes(plane.left)); hash.update(bytes(plane.right)); }
    }
  }
  return hash.digest('hex');
}
function progressIsValid(values) {
  assert.equal(values[0], 0); assert.equal(values.at(-1), 1);
  assert(values.every((value, index) => Number.isFinite(value) && value >= 0 && value <= 1 && (!index || value >= values[index - 1])), 'Progress is monotonic and bounded');
}
async function renderCase(r, item) {
  const f = fixture(r), { host, yields } = makeHost(r, f, item), progress = [], streamed = [];
  let firstChunkHash = null;
  const options = { ...item.options, onProgress: value => progress.push(value) };
  if (item.streamed) options.onChunk = async chunk => { streamed.push(chunk); if (streamed.length === 1) firstChunkHash = freezeDigest({ sampleRate: 0, bodyFrames: 0, totalFrames: 0, tailFrames: 0 }, [chunk]); };
  const result = await host[item.method](f.state, f.assets, options);
  assert.equal(host._exportCount, 0, item.id + ' releases its busy counter'); progressIsValid(progress);
  let hash;
  if (item.method === 'renderWav') {
    const audio = Buffer.from(await result.arrayBuffer()); assert(audio.subarray(44).some(value => value !== 0), item.id + ' audible'); hash = digest(audio);
  } else if (item.method === 'renderMasterPCM') {
    assert(result.left.some(value => value !== 0), item.id + ' audible');
    hash = createHash('sha256').update(JSON.stringify([result.sampleRate, result.frames, result.bodyFrames, result.startBeat, result.endBeat, result.tailFrames])).update(bytes(result.left)).update(bytes(result.right)).digest('hex');
  } else {
    const chunks = item.streamed ? streamed : result.chunks;
    assert(chunks.some(chunk => chunk.planes.main), item.id + ' audible main'); assert(chunks.some(chunk => chunk.planes.sendA), item.id + ' audible send');
    assert(chunks.at(-1).frames < chunks[0].frames, item.id + ' irregular final chunk');
    hash = freezeDigest(result, chunks);
    if (firstChunkHash) assert.equal(freezeDigest({ sampleRate: 0, bodyFrames: 0, totalFrames: 0, tailFrames: 0 }, [streamed[0]]), firstChunkHash, 'A retained streamed packet is not changed by later rendering');
  }
  return { hash, yields: yields(), progressUpdates: progress.length };
}
async function cancellationChecks(r) {
  let groups = 0;
  for (const method of ['renderWav', 'renderMasterPCM', 'renderFreezeTrack']) {
    const item = CASES.find(value => value.method === method), f = fixture(r), controller = new AbortController();
    const { host, yields } = makeHost(r, f, item, () => controller.abort());
    await assert.rejects(host[method](f.state, f.assets, { ...item.options, signal: controller.signal }), error => error.name === 'AbortError', method + ' cancels after a cooperative yield');
    assert(yields() > 0); assert.equal(host._exportCount, 0);
    const before = new AbortController(); before.abort();
    await assert.rejects(host[method](f.state, f.assets, { ...item.options, signal: before.signal }), error => error.name === 'AbortError');
    assert.equal(host._exportCount, 0); groups++;
  }
  const item = CASES.find(value => value.id === 'freeze-streamed'), f = fixture(r), controller = new AbortController(), { host } = makeHost(r, f, item); let chunks = 0;
  await assert.rejects(host.renderFreezeTrack(f.state, f.assets, { ...item.options, signal: controller.signal, async onChunk() { chunks++; controller.abort(); } }), error => error.name === 'AbortError');
  assert.equal(chunks, 1); assert.equal(host._exportCount, 0); groups++;
  const fallback = makeHost(r, fixture(r), CASES[0]), originalTimer = global.setTimeout; let timers = 0;
  delete r.scope.scheduler;
  try {
    global.setTimeout = (callback, delay, ...args) => { timers++; return originalTimer(callback, delay, ...args); };
    const f = fixture(r); await fallback.host.renderWav(f.state, f.assets, CASES[0].options);
  } finally { global.setTimeout = originalTimer; }
  assert(timers > 0, 'Browsers without scheduler.yield keep the timer fallback'); assert.equal(fallback.host._exportCount, 0); groups++;
  return groups;
}
async function main() {
  if (process.argv.includes('--record-baseline')) {
    const r = immutableBaseline(), recorded = {};
    for (const item of CASES) recorded[item.id] = (await renderCase(r, item)).hash;
    const source = fs.readFileSync(__filename, 'utf8');
    fs.writeFileSync(__filename, source.replace(/\/\* OFFLINE-FROZEN-BEGIN \*\/[\s\S]*?\/\* OFFLINE-FROZEN-END \*\//, '/* OFFLINE-FROZEN-BEGIN */ ' + JSON.stringify(recorded, null, 2) + ' /* OFFLINE-FROZEN-END */'));
    console.log('Recorded ' + CASES.length + ' immutable ' + BASELINE + ' offline fixtures.'); return;
  }
  assert.equal(Object.keys(EXPECTED).length, CASES.length, 'Immutable offline fixtures must be recorded before normal checks');
  const r = P.load('working'), results = {};
  for (const item of CASES) { const result = await renderCase(r, item); assert.equal(result.hash, EXPECTED[item.id], item.id + ' exact baseline bytes'); assert(result.yields > 0, item.id + ' exercises the cooperative scheduler'); results[item.id] = result; }
  const cancellationGroups = await cancellationChecks(r);
  console.log('PASS ' + CASES.length + ' immutable WAV/master/freeze fixtures and ' + cancellationGroups + ' progress/cancellation/scheduler groups.');
  if (process.env.GALLEY_OFFLINE_REPORT) fs.writeFileSync(process.env.GALLEY_OFFLINE_REPORT, JSON.stringify({ baseline: BASELINE, cases: results, cancellationGroups, sourceHashes: r.sourceHashes }, null, 2) + '\n');
}
if (require.main === module) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { BASELINE, CASES, fixture, renderCase, freezeDigest };
