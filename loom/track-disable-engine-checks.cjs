'use strict';
/* Disabled tracks must remove work, while enabled audio remains exact.
 * Current-release fixtures are recorded ONLY from immutable GALLEY 1.35
 * (59a31f7), including its own effects/EQ/LFO/mastering dependencies.
 * node loom/track-disable-engine-checks.cjs --record-baseline
 * Ordinary checks use frozen hashes and also work in an extracted source ZIP.
 * 1.37.1 intentionally repairs the loop-boundary case's discontinuous outgoing
 * anchor. Its corrected hash is pinned separately below; the original immutable
 * fixture file is retained and the other 16 cases still match it exactly.
 * No elapsed-time assertion or benchmark runs in this correctness suite.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { webcrypto, createHash } = require('node:crypto');
const BASELINE = '59a31f7563ab60dff7f54cd3eb5b3bc04ec34a15';
const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(__dirname, 'track-disable-engine-fixtures.json');
const CONTINUITY_EXPECTED = Object.freeze({
  'loop-boundary': Object.freeze({
    pcm: 'c9c4e082a2f17dc31ca1a5f9e0c4fd8dd8bf6d8b2b813b29ed0540f5663dbe9c',
    meters: '8c75f085687b817f3dcff18196959559c0c09d1f32a56952639f5b44fc1eb467'
  })
});
const MODULES = ['shared/pattern-schema.js', ...[
  'vocal-catalog', 'utility-catalog', 'filter-catalog', 'creative-catalog', 'preamp-catalog', 'tape-catalog', 'char-catalog', 'lofi-catalog', 'pedal-synth-catalog', 'deluxe-catalog', 'effects-catalog',
  'vocal-dsp', 'utility-dsp', 'filter-dsp', 'creative-dsp', 'broiler-pedals', 'compressor-dsp', 'preamp-dsp', 'tape-dsp', 'char-dsp', 'lofi-dsp', 'pedal-synth-tracker', 'pedal-midi-dsp', 'pedal-synth-dsp', 'deluxe-dsp', 'effects',
  'lfo', 'cpu-profiler', 'track-eq-dsp', 'mastering-dsp', 'service-schema', 'schema', 'audio-engine'
].map(name => 'loom/' + name + '.js')];
const digest = value => createHash('sha256').update(value).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
function load(ref = null) {
  const scope = { console, performance, Date, crypto: webcrypto, Blob, AbortController, setTimeout, clearTimeout, TextEncoder, TextDecoder, structuredClone };
  scope.window = scope; scope.globalThis = scope;
  scope.atob = text => Buffer.from(text, 'base64').toString('binary');
  scope.btoa = text => Buffer.from(text, 'binary').toString('base64');
  const hashes = {};
  for (const file of MODULES) {
    const local = path.join(__dirname, file.startsWith('loom/') ? file.slice(5) : file);
    const source = ref ? execFileSync('git', ['show', ref + ':' + file], { cwd: ROOT, maxBuffer: 12 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).toString() : fs.readFileSync(fs.existsSync(local) ? local : path.join(ROOT, file), 'utf8');
    hashes[file] = digest(source);
    Function('window', 'globalThis', 'crypto', 'atob', 'btoa', source + '\n//# sourceURL=disabled-engine-' + path.basename(file))(scope, scope, scope.crypto, scope.atob, scope.btoa);
  }
  const E = scope.createLoomEffectsDSP(), DSP = scope.createLoomEngineDSP(scope.createLoomEffectsDSP, scope.createLoomLFODSP, scope.createLoomCPUProfiler, scope.createLoomTrackEQDSP, scope.createLoomMasteringDSP);
  return { scope, S: scope.LoomSchema, E, DSP, hashes };
}
function blank(S) {
  const state = S.defaultState(); state.tempo = 127; state.lengthBars = 2; state.loopEnabled = false; state.loopEnd = 8;
  for (const owner of [...state.tracks, ...state.returns, state.master]) { owner.effects.fill(null); owner.automation = []; owner.level = .65; owner.pan = 0; owner.mute = false; owner.solo = false; }
  for (const track of state.tracks) { track.clips = []; track.instrumentLive = true; track.sends = [0, 0]; track.sendPre = [false, false]; }
  return state;
}
function signal(frames, sr, shift = 0) {
  return [0, 1].map(channel => Float32Array.from({ length: frames }, (_, i) => {
    const t = (i + shift) / sr;
    return .071 * Math.sin(2 * Math.PI * (channel ? 227 : 137) * t) + .021 * Math.cos(2 * Math.PI * (channel ? 1301 : 701) * t) + ((i + shift) % 701 === 3 ? .12 : 0);
  }));
}
const lane = (target, a, b, effectType) => ({ target, effectType, enabled: true, interpolation: 'linear', points: [{ beat: 0, value: a }, { beat: 8, value: b }] });
const route = (id, ownerId, target, amount, effectType) => ({ id, ownerId, target, amount, effectType, enabled: true });
function fixture(env, definition) {
  const { S, E } = env, state = blank(S), sr = definition.rate || 48000, frames = definition.frames || 4096, assets = new Map(), fx = (type, params = {}) => S.effect({ type, params });
  if (definition.kind !== 'plain') {
    const types = definition.types || ['strainer', 'velvet', 'cinder', 'undertow', 'preserve'];
    for (let t = 0; t < 10; t++) {
      const track = state.tracks[t]; track.level = .12 + .017 * t; track.pan = -.7 + .14 * t;
      track.effects[0] = fx(types[t % types.length], { output: -12, mix: .35 });
      if (t < 2) track.effects[4] = fx('cinder', { drive: 7, output: -13, mix: .2 });
      Object.assign(track.eq, { low: .7, lowMid: -.6, highMid: 1.1, high: -.3, lowMidFreq: 511, highMidFreq: 3401 });
      track.sends = [.03 + .007 * t, .06 - .004 * t]; track.sendPre = [t % 2 === 0, false];
      track.automation = [lane('level', track.level, track.level * .8), lane('pan', track.pan, -track.pan), lane('send:0', .02, .12), lane('eq:highMidFreq', 1900, 4700)];
    }
    state.tracks[0].effects[0] = fx('strainer', { cutoff: 1700, resonance: .6, mix: .6 });
    state.tracks[0].automation.push(lane('fx:0:cutoff', 700, 2900, 'strainer'));
    state.returns[0].effects[0] = fx('parallax', { time: 23, feedback: .2, mix: .8 });
    state.returns[1].effects[3] = fx('prism', { filter: 'highpass', cutoff: 500, mix: 1 });
    state.master.effects[2] = fx('saute', { model: 'tube-610', drive: 3, output: -6, mix: .2 });
    state.master.automation = [lane('level', .43, .58)];
    Object.assign(state.lfos[0], { enabled: true, sync: false, rate: 1.3, depth: .6, routes: [route('pan-one', 'track-1', 'pan', .1), route('cutoff-one', 'track-1', 'fx:0:cutoff', .06, 'strainer'), route('cross-two', 'lfo-2', 'rate', .03)] });
    Object.assign(state.lfos[1], { enabled: true, sync: true, division: .5, wave: 'triangle', routes: [route('send-ten', 'track-10', 'send:0', .03), route('self-one', 'lfo-1', 'depth', .02), route('return-pan', 'return-1', 'pan', .06)] });
  }
  if (definition.kind === 'mastering') state.master.mastering = { ...state.master.mastering, enabled: true, cleanup: true, eq: true, glue: true, stereo: true, color: true, limiter: true, lowGain: 1.1, midGain: -.7, highGain: .4, threshold: -24, width: 1.14, drive: 3 };
  if (['clips', 'loop', 'service', 'frozen'].includes(definition.kind)) {
    const channels = signal(sr, sr); assets.set('audio', { sampleRate: sr, left: channels[0], right: channels[1] });
    for (let t = 0; t < 10; t++) state.tracks[t].clips = [{ id: 'clip-' + t, assetId: 'audio', start: 0, length: 8, sourceStart: .001, sourceEnd: .9, sourceOffset: .03 * (t % 4), rate: .6 + .05 * t, reverse: t % 3 === 0, loop: true, gain: .11, fadeIn: .01, fadeOut: .01 }];
  }
  if (definition.kind === 'loop') { state.loopEnabled = true; state.loopStart = .25; state.loopEnd = .5; }
  if (definition.kind === 'frozen') {
    const channels = signal(frames * 2, sr); assets.set('frozen-main', { sampleRate: sr, left: channels[0], right: channels[1] });
    state.tracks[0].freeze = { version: 1, sampleRate: sr, tempo: state.tempo, lengthBeats: 8, bodyFrames: frames, totalFrames: frames * 2, tailFrames: frames, fingerprint: 'frozen-135', chunks: [{ startFrame: 0, frames: frames * 2, main: 'frozen-main', sendA: null, sendB: null }] };
  }
  if (definition.kind === 'solo') { state.tracks[0].solo = true; state.tracks[9].mute = true; state.returns[0].solo = true; }
  if (['static', 'controls'].includes(definition.kind)) { for (const track of state.tracks) track.automation = []; state.lfos.forEach(lfo => { lfo.enabled = false; lfo.routes = []; }); }
  const core = new env.DSP.Core(state, assets, sr, { linear: definition.kind !== 'loop' && definition.kind !== 'transport', includeMetronome: definition.kind === 'transport', ...(definition.trackId ? { trackId: definition.trackId } : {}) });
  return { state, core, assets, frames, sr, E };
}
const DEFINITIONS = [
  ...[8000, 44100, 48000, 96000, 192000].map(rate => ({ id: 'plain-' + rate, kind: 'plain', rate, frames: 3072 })),
  { id: 'ten-track-racks', kind: 'racks', types: ['strainer', 'velvet', 'cinder', 'undertow', 'preserve', 'broiler', 'crumble', 'swirl', 'saute', 'prism'] },
  { id: 'new-effects-racks', kind: 'racks', types: ['ferment', 'tinpan', 'sunday', 'halo', 'glaze'] },
  { id: 'mastering', kind: 'mastering' }, { id: 'audio-clips', kind: 'clips' },
  { id: 'static-controls-and-edits', kind: 'static' },
  { id: 'static-automation-lfo-transitions', kind: 'controls', frames: 8192 },
  { id: 'loop-boundary', kind: 'loop', frames: 8192 }, { id: 'service-events', kind: 'service' },
  { id: 'frozen-playback', kind: 'frozen' }, { id: 'solo-mute-return-solo', kind: 'solo' },
  { id: 'transport-seek-stop-countin', kind: 'transport' }, { id: 'track-ten-stem', kind: 'clips', trackId: 'track-10' }
];
function render(env, definition, capture = false) {
  const { core, state, frames, sr } = fixture(env, definition), outputs = [new Float32Array(frames), new Float32Array(frames)], input = signal(frames, sr), meters = createHash('sha256'), sizes = [128, 137, 251, 32, 113];
  const scene = { id: 'scene', clips: state.tracks.map(track => track.clips[0] || null) };
  if (definition.kind === 'service') { core.startService(scene, 0); core.queueService('performance', { fill: true, drops: [false, true], overrides: [{ trackId: 'track-1', target: 'pan', value: -.2 }] }, 'immediate', 1); }
  else core.start(definition.kind === 'loop' ? .47 : 0);
  if (definition.kind === 'transport') { core.setMicrophoneMonitor(9, true); core.beginRecording({ countInBeats: .01 }); }
  let block = 0;
  for (let at = 0; at < frames;) {
    if (definition.kind === 'transport' && block === 4) core.seek(.07);
    if (definition.kind === 'transport' && block === 10) core.stop();
    if (definition.kind === 'static' && block === 4) { state.tracks[0].pan = -.4; state.tracks[1].level = .35; state.tracks[9].sends = [.13, .17]; state.tracks[9].sendPre = [true, true]; core.setState(state); }
    if (definition.kind === 'static' && block === 10) { state.tracks[0].pan = .7; state.tracks[1].mute = true; state.tracks[9].sends = [0, .04]; core.setState(state); }
    if (definition.kind === 'controls' && block === 4) {
      state.tracks[0].automation = [lane('pan', -.4, .7), lane('level', .1, .4), lane('send:0', .2, .1)];
      Object.assign(state.lfos[0], { enabled: true, sync: false, rate: .7, routes: [route('move-pan', 'track-1', 'pan', .1), route('move-level', 'track-1', 'level', .02), route('move-send', 'track-1', 'send:1', .03)] }); core.setState(state);
    }
    if (definition.kind === 'controls' && block === 10) {
      state.tempo = 143; state.tracks[0].automation[0].points[1].value = -.1; state.tracks[0].automation[1].points[1].value = .3; state.tracks[0].sends = [.11, .09]; state.tracks[0].sendPre = [false, true]; state.lfos[0].routes[0].amount = .3; core.setState(state);
    }
    if (definition.kind === 'controls' && block === 16) { state.tracks[0].automation.forEach(item => item.enabled = false); state.lfos[0].enabled = false; state.tracks[0].pan = .3; state.tracks[0].level = .21; state.tracks[0].sends = [.03, 0]; core.setState(state); }
    if (definition.kind === 'controls' && block === 22) { state.tracks[0].automation.forEach(item => item.enabled = true); state.lfos[0].enabled = true; state.lfos[0].rate = 1.7; state.tracks[0].mute = true; core.setState(state); }
    if (definition.kind === 'controls' && block === 28) { state.tracks[0].automation = []; state.lfos[0].routes = []; state.tracks[0].mute = false; state.tracks[0].pan = -.3; state.tracks[0].level = .19; core.setState(state); }
    if (block === 8 && definition.kind === 'service') core.queueService('performance', { stutterBeats: .125, overrides: [{ trackId: 'track-10', target: 'eq:lowMidFreq', value: 777 }] }, 'immediate', 2);
    const end = Math.min(frames, at + sizes[block++ % sizes.length]), channels = input.map(channel => channel.subarray(at, end));
    core.processBlock(outputs[0].subarray(at, end), outputs[1].subarray(at, end), Array.from({ length: 11 }, () => channels));
    meters.update(JSON.stringify(core.getMeters())); at = end;
  }
  assert(outputs[0].some(value => value !== 0), definition.id + ' must exercise audible processing');
  const result = { pcm: createHash('sha256').update(Buffer.from(outputs[0].buffer)).update(Buffer.from(outputs[1].buffer)).digest('hex'), meters: meters.digest('hex') };
  return capture ? { ...result, output: outputs } : result;
}
function feed(core, frames = 1024, sr = 48000) {
  const out = [new Float32Array(frames), new Float32Array(frames)], input = signal(frames, sr);
  for (let at = 0; at < frames; at += 128) { const end = Math.min(frames, at + 128), channels = input.map(channel => channel.subarray(at, end)); core.processBlock(out[0].subarray(at, end), out[1].subarray(at, end), Array.from({ length: 11 }, () => channels)); }
  return out;
}
async function run() {
  if (process.argv.includes('--record-baseline')) {
    const env = load(BASELINE), expected = Object.fromEntries(DEFINITIONS.map(definition => [definition.id, render(env, definition)]));
    fs.writeFileSync(FIXTURES, JSON.stringify({ baseline: BASELINE, definitionsHash: digest(JSON.stringify(DEFINITIONS)), sourceHashes: env.hashes, expected }, null, 2) + '\n');
    console.log('Recorded ' + DEFINITIONS.length + ' immutable GALLEY 1.35 baseline fixtures.'); return;
  }
  const env = load(), { S, DSP, scope } = env;
  let passed = 0;
  const check = async (name, test) => { await test(); console.log('PASS ' + name); passed++; };
  await check('Enabled PCM and meters match 16 immutable 1.35 cases and the separately pinned 1.37.1 loop repair', () => {
    const expected = JSON.parse(fs.readFileSync(FIXTURES, 'utf8')); assert.equal(expected.baseline, BASELINE); assert.equal(expected.definitionsHash, digest(JSON.stringify(DEFINITIONS)));
    for (const definition of DEFINITIONS) {
      const corrected = CONTINUITY_EXPECTED[definition.id];
      if (corrected) assert.notDeepEqual(corrected, expected.expected[definition.id], 'The corrected seam must retain a distinct historical reference');
      assert.deepEqual(render(env, definition), corrected || expected.expected[definition.id], definition.id);
    }
  });
  await check('Disabled tracks release DSP and skip clips, input, EQ, inserts, mixing, automation, sends, metering and profiling', () => {
    const state = blank(S); state.tracks[0].effects[0] = S.effect({ type: 'prism', params: {} }); state.tracks[0].sends = [.8, .8];
    state.tracks[0].automation = [lane('eq:highMidFreq', 1400, 3900)];
    Object.assign(state.lfos[0], { enabled: true, routes: [route('disabled-leaf', 'track-1', 'pan', .4), route('shared-lfo', 'lfo-2', 'depth', .1), route('active-leaf', 'track-2', 'pan', .2)] });
    const core = new DSP.Core(state, {}, 48000); core.start(0); feed(core); const old = core.slots[0][0].dsp, original = JSON.stringify(state.tracks[0]);
    let reset = 0; const resetFX = old.reset; old.reset = function () { reset++; return resetFX.call(this); };
    state.tracks[0].disabled = true; state.tracks[0].solo = true; core.setState(state);
    assert(reset > 0); assert(core.slots[0].every(slot => slot === null)); assert.equal(core.trackEq[0], null); assert.equal(core.buffers[0], null); assert.equal(core.clipLists[0].length, 0); assert.equal(core.automation[0].eq.highMidFreq, null);
    assert(!core.modulation.has('track-1', 'pan')); assert(core.modulation.has('track-2', 'pan')); assert(core.modulation.routes.some(item => item.descriptor.ownerId === 'lfo-2'));
    old.process = old.getMeters = () => { throw Error('Disabled processor executed.'); };
    const rack = core._processRack, eq = core._processTrackEq; core._processRack = function (owner, ...args) { assert.notEqual(owner.disabled, true); return rack.call(this, owner, ...args); }; core._processTrackEq = function (index, ...args) { assert.notEqual(this.tracks[index].disabled, true); return eq.call(this, index, ...args); };
    core.setDiagnostics({ enabled: true, mode: 'deep' }); const start = core.cpuProfiler.start; core.cpuProfiler.start = function (id) { assert(!/^track-1(?::|$)/.test(id), id); return start.call(this, id); };
    const output = feed(core); assert(output[0].some(value => value !== 0), 'A disabled solo must not mute enabled tracks.'); assert.equal(core.getMeters().tracks[0].peak, 0); assert(core.getMeters().effects[0].every(value => value === null));
    for (const row of core.getDiagnostics().rows.filter(row => row.ownerId === 'track-1')) { assert.equal(row.disabled, true); assert.equal(row.active, false); assert.equal(row.calls || 0, 0); assert.equal(row.samples, 0); assert.equal(row.meanMs, null); }
    state.tracks[0].disabled = false; state.tracks[0].solo = false; assert.equal(JSON.stringify(state.tracks[0]), original); core.cpuProfiler.start = start; core.setState(state); assert(core.slots[0][0].dsp !== old); assert(core.trackEq[0]); feed(core); core.panic();
  });
  await check('All-disabled playback and frozen/SERVICE tracks cannot read source audio', () => {
    const state = blank(S); for (const track of state.tracks) { track.disabled = true; track.clips = [Object.defineProperty({}, 'assetId', { get() { throw Error('Disabled clip compiled.'); } })]; }
    const core = new DSP.Core(state, {}, 48000); core.start(); assert(feed(core).every(channel => channel.every(value => value === 0))); core.panic();
    assert.throws(() => new DSP.Core(state, {}, 48000, { freezeCaptureTrackId: 'track-1' }), /Enable/);
    const scene = { id: 'disabled-scene', clips: Array.from({ length: 10 }, () => ({ assetId: 'must-not-read', length: 4 })) }; core.assets = { get() { throw Error('Disabled SERVICE source read.'); } }; core.startService(scene); assert(feed(core).every(channel => channel.every(value => value === 0))); core.stopService();
    state.tracks[0].freeze = { sampleRate: 48000, bodyFrames: 128, totalFrames: 128, chunks: [{ main: 'must-not-read' }] }; core.setAssets({}); core.setState(state); assert.equal(core.hasFrozen, false); assert.equal(core.frozen[0], null); assert.throws(() => new DSP.Core(state, {}, 44100), /Unfreeze/);
  });
  await check('Disabling flushes FERMENT capture before its runtime is released', () => {
    const state = blank(S); state.tracks[0].effects[0] = S.effect({ type: 'ferment', params: { mode: 'track', mix: .5 } }); const core = new DSP.Core(state, {}, 48000);
    core.startPedalMidi({ ownerId: 'track-1', slot: 0, token: 'disable-capture' }); const original = core.slots[0][0].dsp.stopMidiCapture; let stopped = false; core.slots[0][0].dsp.stopMidiCapture = function (reason) { stopped = true; assert.equal(reason, 'track-disabled'); return original.call(this, reason); };
    state.tracks[0].disabled = true; core.setState(state); assert(stopped); assert.equal(core.pedalMidi, null); assert(core.drainPedalMidi().some(batch => batch.done)); assert.throws(() => core.startPedalMidi({ ownerId: 'track-1', slot: 0, token: 'no' }), /enabled/);
    core.setMicrophoneMonitor(0, true); core.resumeAudition(0); core.setRecordOnly(0, true); assert.equal(core.microphoneMonitor.enabled, false); assert(!core.auditionTracks.has(0)); assert(!core.recordOnly.has(0));
  });
  await check('Closed diagnostics release their runtime, buffers, snapshot and stale report identity', () => {
    let reads = 0; const core = new DSP.Core(blank(S), {}, 48000, { diagnosticsClock: { name: 'test', resolutionMs: .001, coarse: false, now() { return ++reads * .01; } } });
    core.setDiagnostics({ enabled: true, mode: 'deep' }); feed(core); const profiler = core.cpuProfiler, before = reads;
    profiler.getSnapshot = () => { throw Error('Disabled setter scanned statistics.'); }; core.setDiagnostics({ enabled: false }); assert.equal(core.cpuProfiler, profiler); core.setDiagnostics({ enabled: false, release: true }); assert.equal(core.cpuProfiler, null); assert.equal(core._cpuKeys, null); feed(core); assert.equal(reads, before);
    core.setDiagnostics({ enabled: true }); assert(core.cpuProfiler && core.cpuProfiler !== profiler);
    const audio = new scope.LoomAudio(blank(S)); audio.setDiagnostics({ enabled: true }); const generation = audio._diagnosticsGeneration, revision = audio._diagnosticsConfig.revision; audio._message({ type: 'diagnostics', generation, report: { revision, rows: [{ id: 'old' }] } }); assert(audio._diagnosticsSnapshot); audio.setDiagnostics({ enabled: false, release: true }); assert.equal(audio._diagnosticsSnapshot, null); audio._message({ type: 'diagnostics', generation, report: { revision, rows: [{ id: 'stale' }] } }); assert.equal(audio._diagnosticsSnapshot, null); audio.setDiagnostics({ enabled: true }); assert.equal(audio._diagnosticsSnapshot, null);
  });
  await check('LFO control ticks reuse immutable ordered descriptor entries without allocating Object.entries arrays', () => {
    const nativeEntries = Object.entries, countedObject = Object.create(Object); let calls = 0, cachedEntries = null;
    countedObject.entries = value => { const result = nativeEntries(value); if (Object.isFrozen(value) && value.rate && value.division && value.smoothing) { calls++; cachedEntries ||= result; } return result; };
    const factory = Function('Object', 'return (' + scope.createLoomLFODSP.toString() + ');')(countedObject), lfo = factory();
    assert(Object.isFrozen(lfo.parameters)); assert.equal(Reflect.set(lfo.parameters, 'rate', {}), false); assert.equal(Reflect.deleteProperty(lfo.parameters, 'rate'), false);
    assert.deepEqual(cachedEntries.map(entry => entry[0]), Object.keys(lfo.parameters)); for (const [key, descriptor] of cachedEntries) assert.equal(descriptor, lfo.parameters[key]);
    const state = blank(S); state.lfos.forEach(item => { item.enabled = true; }); state.lfos[0].routes = [route('allocation-pan', 'track-1', 'pan', .1)];
    const runtime = new lfo.Runtime(48000, state), beats = Float64Array.from({ length: 128 }, (_, index) => index / 24000), playing = new Uint8Array(128).fill(1), countIn = new Uint8Array(128); calls = 0;
    for (let block = 0; block < 16; block++) runtime.render(beats, playing, countIn, block * 128, 120);
    assert.equal(calls, 0, 'The old four-LFO path allocated 16 Object.entries results (128 arrays) per128-frame callback.');
  });
  await check('Main API rejects disabled recording, monitoring, freeze and audition before acquiring audio resources', async () => {
    const state = blank(S); state.tracks[0].disabled = true; const audio = new scope.LoomAudio(state); audio.init = () => { throw Error('Unexpected audio initialization.'); }; audio._acquireMicrophone = () => { throw Error('Unexpected microphone request.'); };
    await assert.rejects(audio.startRecording(['track-1']), /Enable/); await assert.rejects(audio.startMicrophoneRecording('track-1'), /Enable/); await assert.rejects(audio.setMicrophoneMonitoring('track-1', { enabled: true }), /Enable/); await assert.rejects(audio.renderFreezeTrack(state, {}, { trackId: 'track-1' }), /Enable/); assert.throws(() => audio.resumeAudition('track-1'), /Enable/);
    audio._pedalMidiTake = { capturing: true }; audio.stopPedalMidi = () => { throw Error('An invalid recording stopped another track’s capture.'); }; await assert.rejects(audio.startRecording(['track-1']), /Enable/); await assert.rejects(audio.startMicrophoneRecording('track-1'), /Enable/); audio._pedalMidiTake = null;
    state.tracks[1].disabled = true; audio.isRecording = true; assert.throws(() => audio.setState(state), /Finish the current take/); audio.isRecording = false;
    let released = false; audio._micTrack = 0; audio._disableMicrophoneMonitoring = () => released = true; const messages = []; audio._send = message => messages.push(message); audio.setState(state); assert(released); assert(messages.find(message => message.type === 'state').state.tracks[0].disabled);
  });
  console.log('Passed ' + passed + ' track-disable/current-release engine groups (' + DEFINITIONS.length + ' PCM fixtures).');
}
module.exports = { BASELINE, MODULES, load, blank, signal, fixture, render, feed, DEFINITIONS };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
