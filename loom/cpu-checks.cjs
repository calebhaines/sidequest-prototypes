'use strict';
// GALLEY's opt-in audio profiler: actual signal path, controlled clocks and cost.
// CPU_QA_BENCH=1 adds an informational warm CPU/wall benchmark (no flaky limits).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
globalThis.window = globalThis; globalThis.crypto ||= webcrypto;
globalThis.btoa ||= value => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ||= value => Buffer.from(value, 'base64').toString('binary');
const shared = fs.existsSync(path.join(__dirname, 'shared/pattern-schema.js')) ? path.join(__dirname, 'shared') : path.resolve(__dirname, '../shared');
vm.runInThisContext(fs.readFileSync(path.join(shared, 'pattern-schema.js'), 'utf8'), { filename: 'pattern-schema.js' });
const sources = ['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'preamp-catalog.js', 'tape-catalog.js', 'char-catalog.js', 'lofi-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'tape-dsp.js', 'char-dsp.js', 'lofi-dsp.js', 'effects.js', 'lfo.js', 'cpu-profiler.js', 'track-eq-dsp.js', 'service-schema.js', 'schema.js', 'audio-engine.js'];
for (const file of sources) vm.runInThisContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), { filename: file });
const S = LoomSchema, CPU = createLoomCPUProfiler(), { Core } = createLoomEngineDSP(createLoomEffectsDSP, createLoomLFODSP, createLoomCPUProfiler, globalThis.createLoomTrackEQDSP);
const copy = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function check(name, run) { run(); passed++; console.log('PASS ' + name); }
function clock(coarse = false) { let value = 0, reads = 0; return { clock: { name: coarse ? 'controlled-coarse' : 'controlled-high-resolution', resolutionMs: coarse ? 1 : .001, coarse, now: () => { reads++; return value; } }, advance: amount => value += amount, set: next => value = next, get reads() { return reads; } }; }
const descriptor = (id, ownerId = 'track-1', slot = 0, effectType = 'cinder') => ({ id, ownerId, slot, effectType, kind: 'effect', label: id, active: true, bypassed: false });
const near = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-9, message + ': ' + actual + ' vs ' + expected);
function blank() { const state = S.defaultState(); state.tempo = 120; state.lengthBars = 2; state.loopEnabled = false; state.loopEnd = 8; state.recording.punchEnd = 8; for (const owner of [...state.tracks, ...state.returns, state.master]) { owner.level = .7; owner.effects.fill(null); owner.automation = []; } state.tracks.forEach(track => { track.instrumentLive = true; track.clips = []; }); return state; }
function fixture() {
  const state = blank(); state.name = 'CPU_QA_PRIVATE_PROJECT';
  const insert = (type, params) => S.effect({ type, params });
  state.tracks[0].effects[0] = insert('prism', { filter: 'lowpass', cutoff: 1700, resonance: 1.2, mix: .8 });
  state.tracks[0].effects[4] = insert('cinder', { drive: 5, output: -5, mix: .2 });
  state.tracks[1].effects[2] = insert('cinder', { drive: 12, output: -6, mix: .4 });
  state.tracks[0].eq = { ...S.defaultTrackEq(), low: 2, lowMid: -1, highMid: 1, high: -.5, lowMidFreq: 650, highMidFreq: 4100 };
  state.tracks[0].sends = [.3, .2];
  state.returns[0].effects[1] = insert('cinder', { drive: 9, mix: .6 });
  state.returns[1].effects[0] = insert('prism', { filter: 'highpass', cutoff: 700, mix: 1 });
  state.master.effects[3] = insert('cinder', { drive: 3, output: -4, mix: .2 });
  state.tracks[0].automation = [{ target: 'fx:0:cutoff', effectType: 'prism', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: 900 }, { beat: 8, value: 2500 }] }];
  Object.assign(state.lfos[0], { enabled: true, wave: 'triangle', sync: false, rate: 1.3, routes: [{ id: 'cpu-moving-pan', ownerId: 'track-1', target: 'pan', amount: .1, enabled: true }, { id: 'cpu-moving-cutoff', ownerId: 'track-1', target: 'fx:0:cutoff', effectType: 'prism', amount: .1, enabled: true }] });
  return state;
}
function source(frames, rate = 48000) { return [0, 1].map(channel => Float32Array.from({ length: frames }, (_, i) => .08 * Math.sin(2 * Math.PI * (channel ? 227 : 137) * i / rate) + .023 * Math.cos(2 * Math.PI * (channel ? 1301 : 701) * i / rate))); }
function feed(core, input, frames = input[0].length, block = 128, offset = 0) { const output = [new Float32Array(frames), new Float32Array(frames)]; for (let at = 0; at < frames; at += block) { const end = Math.min(frames, at + block), l = input[0].subarray(offset + at, offset + end), r = input[1].subarray(offset + at, offset + end); core.processBlock(output[0].subarray(at, end), output[1].subarray(at, end), [[l, r], [l, r]]); } return output; }

check('Disabled profiling does not read a clock, retain callback samples or become project state', () => {
  const time = clock(), profiler = new CPU.Runtime(48000, { clock: time.clock }); profiler.setTopology([descriptor('one')]);
  for (let block = 0; block < 64; block++) { assert.equal(profiler.begin(128), false); time.advance(.2); profiler.finish(); }
  assert.equal(time.reads, 0); const snapshot = profiler.getSnapshot(); assert.equal(snapshot.enabled, false); assert.equal(snapshot.sampledBlocks, 0); assert.equal(snapshot.timerReads, 0);
  const state = fixture(), before = S.serializeProject(state), core = new Core(state, {}, 48000, { linear: true, diagnosticsClock: time.clock }); core.start(0); feed(core, source(1024)); assert.equal(time.reads, 0); core.setDiagnostics({ enabled: true, mode: 'deep' }); core.getDiagnostics(); assert.equal(S.serializeProject(state), before); assert(!before.includes('sampledBlocks') && !before.includes('diagnosticsClock'));
});
check('Controlled elapsed time attributes stereo insert costs independently and normalizes to the audio deadline', () => {
  const time = clock(), profiler = new CPU.Runtime(48000, { clock: time.clock }); profiler.setTopology([descriptor('track-fx'), descriptor('master-fx', 'master', 3)]); profiler.configure({ enabled: true, mode: 'deep' });
  assert(profiler.begin(128)); time.advance(.2); let stamp = profiler.start('track-fx'); time.advance(.8); profiler.endStage('track-fx', stamp); time.advance(.1); stamp = profiler.start('master-fx'); time.advance(.2); profiler.endStage('master-fx', stamp); time.advance(.3); profiler.finish();
  const report = profiler.getSnapshot(); assert.equal(report.sampledBlocks, 1); near(report.total.meanMs, 1.6, 'Whole callback cost includes time outside inserts'); near(report.total.meanPercent, 60, 'Budget share'); near(report.budgetMs, 128 / 48, '128-frame deadline');
  near(report.rows.find(row => row.id === 'track-fx').meanMs, .8, 'Track insert'); near(report.rows.find(row => row.id === 'master-fx').meanMs, .2, 'Master insert'); assert.equal(report.rows.find(row => row.id === 'master-fx').ownerId, 'master');
});
check('Light, balanced and deep modes sample the advertised share without a timer on skipped callbacks', () => {
  for (const [mode, expected] of [['light', 4], ['balanced', 16], ['deep', 64]]) {
    const time = clock(), profiler = new CPU.Runtime(48000, { clock: time.clock }); profiler.configure({ enabled: true, mode }); let sampled = 0, skippedReads = 0;
    for (let index = 0; index < 64; index++) { const before = time.reads, active = profiler.begin(128); time.advance(.125); profiler.finish(); if (active) sampled++; else skippedReads += time.reads - before; }
    const report = profiler.getSnapshot(); assert.equal(sampled, expected, mode); assert.equal(report.sampledBlocks, expected); assert.equal(skippedReads, 0, mode + ' skips clock reads'); assert.equal(report.processedBlocks, 64); near(report.coverage, expected / 64, mode + ' coverage');
  }
});
check('Sample positions cover periodic callback phases rather than aliasing meter or musical work', () => {
  for (const mode of ['light', 'balanced']) {
    const time = clock(), profiler = new CPU.Runtime(48000, { clock: time.clock }), phases = new Set(); profiler.configure({ enabled: true, mode });
    for (let index = 0; index < 4096; index++) { const sampled = profiler.begin(128); if (sampled) phases.add(index % 8); time.advance(index % 8 === 7 ? 4 : .25); profiler.finish(); }
    assert.equal(phases.size, 8, mode + ' visits every eight-block meter phase'); assert(profiler.getSnapshot().total.maxMs >= 4, mode + ' observes periodic expensive work');
  }
});
check('Bounded recent statistics age out old peaks and keep a separate lifetime sample count', () => {
  const time = clock(), profiler = new CPU.Runtime(48000, { clock: time.clock }); profiler.configure({ enabled: true, mode: 'deep' });
  for (let index = 0; index < 356; index++) { profiler.begin(128); time.advance(index < 100 ? 9 : 1); profiler.finish(); }
  const report = profiler.getSnapshot(); assert.equal(report.windowSize, 256); assert.equal(report.total.samples, 256); assert.equal(report.total.totalSamples, 356); near(report.total.meanMs, 1, 'Recent mean'); near(report.total.maxMs, 1, 'Expired peaks leave the window'); assert.equal(report.total.overBudget, 0);
});
check('Average, p95, worst and budget exceedances reflect observations; reset clears their sample history', () => {
  const time = clock(), profiler = new CPU.Runtime(48000, { clock: time.clock }); profiler.configure({ enabled: true, mode: 'deep' });
  for (const elapsed of [1, 1, 1, 9]) { profiler.begin(128); time.advance(elapsed); profiler.finish(); time.advance(3); }
  let report = profiler.getSnapshot(); near(report.total.meanMs, 3, 'Mean duration'); assert(report.total.p95MsLower <= 9 && report.total.p95MsUpper >= 9, 'Known p95 lies inside the reported histogram bounds.'); assert.equal(report.total.p95Ms, report.total.p95MsUpper); near(report.total.maxMs, 9, 'Observed maximum'); assert.equal(report.total.overBudget, 1); assert.equal(report.total.samples, 4);
  profiler.reset(); report = profiler.getSnapshot(); assert.equal(report.sampledBlocks, 0); assert.equal(report.total.samples, 0); assert.equal(report.total.overBudget, 0); assert.equal(report.enabled, true);
});
check('Coarse zero observations are identified, missing clocks stay unavailable and backwards clocks are rejected', () => {
  const coarse = clock(true), profiler = new CPU.Runtime(48000, { clock: coarse.clock }); profiler.setTopology([descriptor('tiny')]); profiler.configure({ enabled: true, mode: 'deep' }); profiler.begin(128); const stamp = profiler.start('tiny'); profiler.endStage('tiny', stamp); profiler.finish(); const report = profiler.getSnapshot(); assert.equal(report.clock.coarse, true); assert.equal(report.clock.resolutionMs, 1); assert(report.total.zeroSamples >= 1, 'Timer-floor observations are exposed rather than interpreted as free processing.');
  const sandbox = { Date: undefined, performance: undefined }, factory = vm.runInNewContext('(' + createLoomCPUProfiler.toString() + ')', sandbox), unavailable = new (factory().Runtime)(48000); unavailable.configure({ enabled: true, mode: 'deep' }); unavailable.begin(128); unavailable.finish(); const missing = unavailable.getSnapshot(); assert.equal(missing.available, false); assert(missing.total.meanMs == null && missing.total.meanPercent == null, 'No clock cannot invent a zero load.');
  const time = clock(), bad = new CPU.Runtime(48000, { clock: time.clock }); bad.configure({ enabled: true, mode: 'deep' }); bad.begin(128); time.set(-5); bad.finish(); const invalid = bad.getSnapshot(); assert(invalid.invalidTimings >= 1); assert.equal(invalid.total.samples, 0);
  const longTime = clock(), stalled = new CPU.Runtime(48000, { clock: longTime.clock }); stalled.configure({ enabled: true, mode: 'deep' }); stalled.begin(128); longTime.advance(2000); stalled.finish(); const long = stalled.getSnapshot(); near(long.total.maxMs, 2000, 'A monotonic two-second stall remains observable.'); assert.equal(long.total.overBudget, 1); assert(long.total.p95MsLower <= 2000 && long.total.p95MsUpper >= 2000);
  const coarseJump = clock(true), jumped = new CPU.Runtime(48000, { clock: coarseJump.clock }); jumped.configure({ enabled: true, mode: 'deep' }); jumped.begin(128); coarseJump.advance(2000); jumped.finish(); assert.equal(jumped.getSnapshot().total.samples, 0); assert(jumped.getSnapshot().invalidTimings >= 1, 'A large non-monotonic wall-clock jump is disclosed as invalid.');
});
check('Stage spans aggregate once per callback even when SERVICE divides its processing into several segments', () => {
  const time = clock(), profiler = new CPU.Runtime(48000, { clock: time.clock }); profiler.setTopology([descriptor('repeated')]); profiler.configure({ enabled: true, mode: 'deep' }); profiler.begin(128);
  for (const elapsed of [.1, .2, .3]) { const stamp = profiler.start('repeated'); time.advance(elapsed); profiler.endStage('repeated', stamp); }
  profiler.finish(); const row = profiler.getSnapshot().rows.find(row => row.id === 'repeated'); assert.equal(row.samples, 1); near(row.meanMs, .6, 'Whole callback repeated stage total');
});
check('Profiled and unprofiled track, return, master, automation and LFO audio stay sample-identical', () => {
  const state = fixture(), before = JSON.stringify(state), input = source(8192);
  for (const block of [128, 137, 251]) for (const mode of ['light', 'balanced', 'deep']) {
    const plain = new Core(state, {}, 48000, { linear: true }), profiled = new Core(copy(state), {}, 48000, { linear: true }); plain.start(0); profiled.start(0); profiled.setDiagnostics({ enabled: true, mode }); assert.deepEqual(feed(profiled, input, input[0].length, block), feed(plain, input, input[0].length, block), mode + ' / ' + block);
    const report = profiled.getDiagnostics(); assert(report.sampledBlocks > 0); for (const [ownerId, slot, effectType] of [['track-1', 0, 'prism'], ['track-1', 4, 'cinder'], ['track-2', 2, 'cinder'], ['return-1', 1, 'cinder'], ['return-2', 0, 'prism'], ['master', 3, 'cinder']]) { const row = report.rows.find(row => row.ownerId === ownerId && row.slot === slot && row.effectType === effectType); assert(row, ownerId + ' insert ' + slot); assert(row.samples > 0, ownerId + ' records actual callbacks'); }
  }
  assert.equal(JSON.stringify(state), before);
});
check('All five track inserts are profiled while master and returns keep four slots', () => {
  const state = fixture(), core = new Core(state, {}, 48000, { linear: true }); core.start(0); core.setDiagnostics({ enabled: true, mode: 'deep' }); feed(core, source(512));
  const rows = core.getDiagnostics().rows;
  assert.equal(rows.length, 89, 'Eight added track slots extend the original 81-row topology.');
  assert.equal(rows.filter(row => row.kind === 'effect').length, 52);
  for (const owner of [...state.tracks, ...state.returns, state.master]) {
    const effects = rows.filter(row => row.kind === 'effect' && row.ownerId === owner.id);
    assert.equal(effects.length, owner.id.startsWith('track-') ? 5 : 4);
    assert.deepEqual(effects.map(row => row.slot), owner.id.startsWith('track-') ? [0, 1, 2, 3, 4] : [0, 1, 2, 3]);
  }
  const fifth = rows.find(row => row.ownerId === 'track-1' && row.slot === 4 && row.kind === 'effect');
  assert.equal(fifth.effectType, 'cinder'); assert(fifth.samples > 0 && fifth.calls > 0, 'The fifth slot contributes measured executions.');
  assert(!rows.some(row => row.kind === 'effect' && row.ownerId !== 'track-1' && !row.ownerId.startsWith('track-') && row.slot === 4));
});
check('Changing a slot resets its identity without attributing the former effect to its replacement', () => {
  const state = fixture(), core = new Core(state, {}, 48000, { linear: true }); core.start(0); core.setDiagnostics({ enabled: true, mode: 'deep' }); feed(core, source(1024)); const next = copy(state); next.tracks[0].effects[0] = S.effect({ type: 'cinder', params: { drive: 6 } }); core.setState(next); feed(core, source(1024)); const rows = core.getDiagnostics().rows.filter(row => row.ownerId === 'track-1' && row.slot === 0); assert.equal(rows.length, 1); assert.equal(rows[0].effectType, 'cinder'); assert(rows[0].samples > 0); next.tracks[0].effects[0] = null; core.setState(next); const removed = core.getDiagnostics().rows.filter(row => row.ownerId === 'track-1' && row.slot === 0); assert(!removed.some(row => row.effectType === 'cinder' && row.active), 'An empty slot is not a running former effect.');
});
check('Main API rejects stale diagnostic reports and never serializes profiling configuration into a project', () => {
  const state = fixture(), engine = new LoomAudio(state); engine.setDiagnostics({ enabled: true, mode: 'deep' }); const revision = engine.getDiagnostics().revision, generation = engine._diagnosticsGeneration; assert(Number.isInteger(revision));
  engine._message({ type: 'diagnostics', generation, report: { enabled: true, revision, total: { meanMs: 123 } } }); assert.equal(engine.getDiagnostics().total.meanMs, 123, 'The matching report is accepted.');
  engine.resetDiagnostics(); const nextRevision = engine.getDiagnostics().revision; engine._message({ type: 'diagnostics', generation, report: { enabled: true, revision, total: { meanMs: 999 } } }); assert.notEqual(engine.getDiagnostics().total?.meanMs, 999, 'Reset rejects the previous report revision.');
  engine._message({ type: 'diagnostics', generation: generation - 1, report: { enabled: true, revision: nextRevision, total: { meanMs: 999 } } }); assert.notEqual(engine.getDiagnostics().total?.meanMs, 999, 'A closed context cannot replace current diagnostics.');
  engine.setDiagnostics({ enabled: false }); engine._message({ type: 'diagnostics', generation, report: { enabled: true, revision: engine.getDiagnostics().revision, total: { meanMs: 999 } } }); assert.equal(engine.getDiagnostics().enabled, false); assert.notEqual(engine.getDiagnostics().total?.meanMs, 999); assert(!S.serializeProject(state).includes('meanMs')); engine.dispose();
});
if (process.env.CPU_QA_BENCH) {
  const state = fixture(), input = source(128), iterations = 1200, trials = 5, baselineRef = process.env.CPU_QA_BASELINE || '5cfe63459825a04ddffb6f0c0b6868abf8ab53aa';
  // Keep added controls neutral for the optional historical gain-only,
  // four-insert benchmark. Functional checks above exercise the fifth insert.
  state.tracks[0].effects[4] = null; state.tracks[0].eq.lowMidFreq = 400; state.tracks[0].eq.highMidFreq = 2500;
  let OldCore = null;
  try {
    const { execFileSync } = require('node:child_process'), oldScope = { createLoomEffectsDSP, createLoomLFODSP }; oldScope.window = oldScope;
    const oldSource = execFileSync('git', ['show', baselineRef + ':loom/audio-engine.js'], { cwd: __dirname, maxBuffer: 8 * 1024 * 1024 }).toString();
    // Both engines use the same realm and native Math/global lookups. A
    // contextified historical sandbox would make its timing incomparable.
    const makeOld = vm.runInThisContext('(function(window){' + oldSource + '\nreturn window.createLoomEngineDSP;})', { filename: 'historical-audio-engine.js' })(oldScope);
    OldCore = makeOld(createLoomEffectsDSP, createLoomLFODSP).Core;
    const before = new OldCore(copy(state), {}, 48000, { linear: true }), after = new Core(copy(state), {}, 48000, { linear: true }); before.start(0); after.start(0); const signal = source(8192); assert.deepEqual(feed(before, signal), feed(after, signal), 'Disabled profiling preserves historical release audio.');
  } catch (error) { if (error.code === 'ERR_ASSERTION') throw error; console.log('INFORMATIONAL historical benchmark baseline unavailable in this source checkout: ' + error.message.split('\n')[0]); }
  const modes = [...(OldCore ? ['released'] : []), 'off', 'light', 'balanced', 'deep'];
  const measure = mode => { const Constructor = mode === 'released' ? OldCore : Core, core = new Constructor(copy(state), {}, 48000, { linear: true }); core.start(0); if (!['released', 'off'].includes(mode)) core.setDiagnostics({ enabled: true, mode }); const out = [new Float32Array(128), new Float32Array(128)], block = () => { core.processBlock(out[0], out[1], [[input[0], input[1]], [input[0], input[1]]]); if (!['released', 'off'].includes(mode) && core.diagnosticsReportDue()) structuredClone(core.getDiagnostics()); }; for (let index = 0; index < 512; index++) block(); const wall = performance.now(), cpu = process.cpuUsage(); for (let index = 0; index < iterations; index++) block(); const elapsed = performance.now() - wall, used = process.cpuUsage(cpu); return { wallMs: elapsed, cpuMs: (used.user + used.system) / 1000 }; };
  const observations = Object.fromEntries(modes.map(mode => [mode, []]));
  for (let trial = 0; trial < trials; trial++) for (let at = 0; at < modes.length; at++) { const mode = modes[(at + trial) % modes.length]; observations[mode].push(measure(mode)); }
  const median = values => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)], baseline = median(observations[OldCore ? 'released' : 'off'].map(value => value.cpuMs));
  const summary = Object.fromEntries(modes.map(mode => { const cpuMs = median(observations[mode].map(value => value.cpuMs)), wallMs = median(observations[mode].map(value => value.wallMs)); return [mode, { cpuMs, wallMs, cpuMicrosecondsPerBlock: cpuMs * 1000 / iterations, cpuDeltaPercent: (cpuMs / baseline - 1) * 100, audioBudgetPercent: cpuMs / (iterations * 128 / 48) * 100 }]; }));
  const benchmark = { baselineRef: OldCore ? baselineRef : null, trials, iterations, audioMsPerTrial: iterations * 128 / 48, fixture: 'Two instrument inputs, five inserts across track/return/master, EQ, LFO and automation; identical signal and warmed engines. Active modes include 4Hz snapshot generation plus Node structuredClone as an approximation of report preparation and transport, not a browser/OS CPU measurement.', summary, observations };
  if (process.env.CPU_QA_BENCH_REPORT) fs.writeFileSync(process.env.CPU_QA_BENCH_REPORT, JSON.stringify(benchmark, null, 2));
  console.log('INFORMATIONAL profiler overhead (no hard timing thresholds): ' + JSON.stringify(benchmark));
}
console.log(passed + ' CPU profiler signal, clock, routing and lifecycle groups passed.');
