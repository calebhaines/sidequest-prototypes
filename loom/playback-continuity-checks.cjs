'use strict';
/* Independent sample-region checks. The oracle changes only audio OUTSIDE the
 * selected region: audible output must remain identical. No interpolation or
 * seam-repair implementation is copied into this test. */
const assert = require('node:assert/strict');
const modern = require('./performance-2026-checks.cjs');

// This dependency-free installer also runs inside the actual built browser app.
function install(scope) {
  const S = scope.LoomSchema;
  const cases = [
    { name: '44.1k-forward', sourceRate: 44100, rate: 1 },
    { name: '44.1k-slow-offset', sourceRate: 44100, rate: .65, sourceOffset: 317.5 / 44100 },
    { name: '44.1k-fast', sourceRate: 44100, rate: 1.7 },
    { name: '44.1k-reverse', sourceRate: 44100, rate: .65, reverse: true },
    { name: '48k-fractional-speed', sourceRate: 48000, rate: 1.333 },
    { name: '32k-fast-offset', sourceRate: 32000, rate: 2.1, sourceOffset: 197.25 / 32000 },
    { name: 'arrangement-and-source-wrap', sourceRate: 44100, rate: 1, arrangement: true },
    { name: 'arrangement-unheard-continuation', sourceRate: 48000, rate: 1, arrangement: true, arrangementFuture: true },
    { name: 'nonperiodic-stereo-region', sourceRate: 44100, rate: 1.7, shape: 'wave' }
  ];
  function fixture(options = {}, sentinel = 0) {
    const s = S.defaultState(), sourceRate = options.sourceRate || 44100;
    const first = Math.round(sourceRate / 10), length = Math.round(sourceRate * (options.arrangementFuture ? .2 : .05));
    const frames = first + length + Math.round(sourceRate / 10);
    const left = new Float32Array(frames), right = new Float32Array(frames);
    left.fill(sentinel ? -.83 : .71); right.fill(sentinel ? .79 : -.67);
    for (let i = 0; i < length; i++) {
      left[first + i] = options.shape === 'wave' ? .18 * Math.sin(i * .031) + .04 : .25;
      right[first + i] = options.shape === 'wave' ? .12 * Math.cos(i * .043 + .3) - .02 : -.125;
    }
    if (options.arrangementFuture) {
      // At240 BPM, .25beats is exactly3000 frames at48k. Only samples
      // at/after that unheard timeline edge differ. This avoids ambiguous
      // fractional pre-edge interpolation while exposing look-ahead leakage.
      left.fill(0); right.fill(0);
      for (let i = 0; i < length; i++) {
        left[first + i] = sentinel && i >= 3000 ? -.83 : .25;
        right[first + i] = sentinel && i >= 3000 ? .79 : -.125;
      }
    }
    const asset = S.encodeAsset({ id: 'selected-region', name: 'Selected stereo region', left, right, sampleRate: sourceRate });
    s.name = 'Playback continuity probe'; s.tempo = 240; s.lengthBars = 1;
    s.loopEnabled = options.arrangement === true; s.loopStart = 0; s.loopEnd = options.arrangementFuture ? .25 : 1;
    s.recording.punchEnd = 4; s.master.level = 1; s.master.metronome = false;
    for (const owner of [...s.tracks, ...s.returns, s.master]) {
      owner.effects.fill(null); owner.automation = []; owner.level = 1; owner.mute = false; owner.solo = false;
    }
    for (const t of s.tracks) { t.instrument = null; t.instrumentLive = false; t.clips = []; t.pan = 0; t.sends = [0, 0]; }
    for (const lfo of s.lfos) { lfo.enabled = false; lfo.routes = []; }
    s.assets = [asset];
    s.tracks[0].clips = [{ id: 'region-loop', name: asset.name, type: 'audio', assetId: asset.id,
      start: 0, length: 4, sourceStart: first / sourceRate, sourceEnd: (first + length) / sourceRate,
      sourceOffset: options.sourceOffset || 0, rate: options.rate || 1, reverse: options.reverse === true,
      loop: !options.arrangementFuture, gain: 1, fadeIn: 0, fadeOut: 0 }];
    return S.normalize(s);
  }
  function render(state, { frames = 24576, sizes = [128], trackId, linear = !state.loopEnabled } = {}) {
    const DSP = scope.createLoomEngineDSP(scope.createLoomEffectsDSP, scope.createLoomLFODSP,
      scope.createLoomCPUProfiler, scope.createLoomTrackEQDSP, scope.createLoomMasteringDSP);
    const core = new DSP.Core(state, S.decodeAssets(state.assets, state.freezeAssets), 48000,
      { linear, includeMetronome: false, trackId });
    core.start(0);
    const left = new Float32Array(frames), right = new Float32Array(frames), clocks = [];
    for (let at = 0, n = 0; at < frames; n++) {
      const end = Math.min(frames, at + sizes[n % sizes.length]), before = core.sampleClock;
      core.processBlock(left.subarray(at, end), right.subarray(at, end));
      clocks.push([before, core.sampleClock, end - at]); at = end;
    }
    return { left, right, clocks, core };
  }
  function difference(a, b) {
    if (a.length !== b.length) throw Error('PCM dimensions differ');
    let maximum = 0, frame = -1;
    for (let i = 0; i < a.length; i++) {
      if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) throw Error('Nonfinite audio at ' + i);
      const error = Math.abs(a[i] - b[i]); if (error > maximum) { maximum = error; frame = i; }
    }
    return { maximum, frame };
  }
  function pairDifference(a, b) { return { left: difference(a.left, b.left), right: difference(a.right, b.right) }; }
  // The released mixer slews its initial gains. Examine the settled plateau,
  // after several source wraps, rather than treating that smooth ramp as a pop.
  function plateau(audio, from = 16000, end = audio.left.length - 256) {
    const channels = [];
    for (const data of [audio.left, audio.right]) {
      let min = Infinity, max = -Infinity, zeros = 0, maximumStep = 0;
      for (let i = from; i < end; i++) {
        if (!Number.isFinite(data[i])) throw Error('Nonfinite plateau');
        min = Math.min(min, data[i]); max = Math.max(max, data[i]);
        if (Math.abs(data[i]) < 1e-8) zeros++;
        maximumStep = Math.max(maximumStep, Math.abs(data[i] - data[i - 1]));
      }
      channels.push({ min, max, range: max - min, zeros, maximumStep });
    }
    return channels;
  }
  const q = { cases, fixture, render, difference, pairDifference, plateau };
  scope.PlaybackContinuityQA = q; return q;
}

function run() {
  const r = modern.load(), q = install(r.scope), rows = [];
  for (const item of q.cases) {
    const first = q.render(q.fixture(item, 0)), second = q.render(q.fixture(item, 1));
    const error = q.pairDifference(first, second);
    assert.equal(error.left.maximum, 0, item.name + ' left reads outside the selected region');
    assert.equal(error.right.maximum, 0, item.name + ' right reads outside the selected region');
    for (const audio of [first, second]) for (const [before, after, count] of audio.clocks) {
      assert.equal(after - before, count, 'Core sample clock advances exactly once per rendered frame');
    }
    const split = q.render(q.fixture(item, 1), { sizes: [1, 73, 257, 31, 512] });
    const partitionError = q.pairDifference(second, split);
    assert(partitionError.left.maximum < 2e-6 && partitionError.right.maximum < 2e-6,
      item.name + ' depends on Worklet/fallback/export block partition: ' + JSON.stringify(partitionError));
    const plateau = item.shape !== 'wave' && !item.arrangement ? q.plateau(first) : null;
    if (plateau) for (const channel of plateau) {
      assert(channel.range < 2e-6, item.name + ' injects a periodic discontinuity: ' + JSON.stringify(channel));
      assert.equal(channel.zeros, 0, item.name + ' contains missing/zero output samples');
    }
    rows.push({ name: item.name, sourceRate: item.sourceRate, rate: item.rate, error, partitionError, plateau });
  }
  console.log('PASS Independent selected-region invariance, stereo continuity, partition and sample-clock checks (' + rows.length + ' cases).');
  return { rows, sourceHashes: r.sourceHashes };
}
if (require.main === module) { try { run(); } catch (error) { console.error(error); process.exitCode = 1; } }
module.exports = { install, run };
