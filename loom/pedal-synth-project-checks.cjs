'use strict';
/* FERMENT · real project, bus, automation, LFO, render and reversible-freeze paths. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const q = require('./pedal-synth-checks.cjs');
function project() {
  const release = q.load(), directory = __dirname, root = path.resolve(directory, '..');
  for (const name of ['shared/pattern-schema.js', 'service-schema.js', 'lfo.js', 'schema.js', 'cpu-profiler.js', 'track-eq-dsp.js', 'audio-engine.js', 'service-capture.js', 'freeze.js']) {
    const local = path.join(directory, name), file = fs.existsSync(local) ? local : path.join(root, name);
    Function('window', 'globalThis', 'crypto', 'atob', 'btoa', fs.readFileSync(file, 'utf8') + '\n//# sourceURL=ferment-project-' + name)(release.scope, release.scope, release.scope.crypto, release.scope.atob, release.scope.btoa);
  }
  release.S = release.scope.LoomSchema; release.DSP = release.scope.createLoomEngineDSP(release.scope.createLoomEffectsDSP, release.scope.createLoomLFODSP, release.scope.createLoomCPUProfiler, release.scope.createLoomTrackEQDSP); return release;
}
const owners = state => [...state.tracks, ...state.returns, state.master];
function blank(release) {
  const state = release.S.defaultState(); state.tempo = 120; state.lengthBars = 1; state.loopEnabled = false; state.loopStart = 0; state.loopEnd = 4; state.recording.punchEnd = 4;
  state.lfos.forEach(lfo => { lfo.enabled = false; lfo.routes = []; });
  for (const owner of owners(state)) { owner.effects.fill(null); owner.automation = []; owner.level = .7; owner.mute = false; if ('pan' in owner) owner.pan = 0; }
  for (const track of state.tracks) { track.clips = []; track.instrumentLive = false; track.sends = [0, 0]; }
  return state;
}
function fixture(release, patch = {}, rate = 8000) {
  const state = blank(release), frames = rate * 2, source = q.pluck(82.406889, 2, rate, { decay: 4 }), asset = release.S.encodeAsset({ id: 'ferment-source', name: 'Played string', sampleRate: rate, left: source, right: source.slice() });
  state.assets = [asset]; const track = state.tracks[0]; track.effects[0] = release.S.effect({ type: 'ferment', params: { ...release.definition.defaults, ...patch } }); track.sends = [.21, .13]; track.sendPre = [true, false];
  track.clips = [{ id: 'ferment-source-clip', name: 'Played string', type: 'audio', assetId: asset.id, start: 0, length: 4, sourceStart: 0, sourceEnd: 2, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: .8, fadeIn: 0, fadeOut: 0 }];
  return { state, rate, frames, assets: release.S.decodeAssets(state.assets) };
}
function render(release, state, assets, rate, frames, options = {}, blocks = 128) {
  const core = new release.DSP.Core(state, assets, rate, { linear: true, ...options }), audio = [new Float32Array(frames), new Float32Array(frames)], sizes = Array.isArray(blocks) ? blocks : [blocks]; core.start(0); let index = 0;
  for (let at = 0; at < frames;) { const end = Math.min(frames, at + sizes[index++ % sizes.length]); core.processBlock(audio[0].subarray(at, end), audio[1].subarray(at, end)); at = end; }
  return { core, audio };
}
function freeze(release, input) {
  const state = release.S.copy(input.state), core = new release.DSP.Core(state, input.assets, input.rate, { linear: true, freezeCaptureTrackId: 'track-1' }), planes = Object.fromEntries(['main', 'sendA', 'sendB'].map(key => [key, [new Float32Array(input.frames), new Float32Array(input.frames)]])); core.start(0);
  for (let at = 0; at < input.frames; at += 128) { const count = Math.min(128, input.frames - at); core.processBlock(new Float32Array(count), new Float32Array(count)); for (const key of Object.keys(planes)) for (let channel = 0; channel < 2; channel++) planes[key][channel].set(core.freezeCapture[key][channel], at); }
  const chunk = { startFrame: 0, frames: input.frames, main: null, sendA: null, sendB: null }; state.freezeAssets = [];
  for (const key of Object.keys(planes)) { if (!planes[key].some(channel => channel.some(value => value !== 0))) continue; const asset = release.S.encodeFreezeAsset({ id: 'ferment-freeze-' + key, name: 'Frozen synth ' + key, sampleRate: input.rate, left: planes[key][0], right: planes[key][1] }); state.freezeAssets.push(asset); chunk[key] = asset.id; }
  state.tracks[0].freeze = { version: 1, sampleRate: input.rate, tempo: state.tempo, lengthBeats: state.lengthBars * 4, bodyFrames: input.frames, totalFrames: input.frames, tailFrames: 0, fingerprint: release.S.freezeFingerprint(state, 'track-1'), chunks: [chunk] };
  return { state, assets: release.S.decodeAssets(state.assets, state.freezeAssets) };
}
module.exports = { project, blank, fixture, render, freeze, owners };
async function run() {
  const release = project(), { S, F, definition } = release, evidence = {}, passed = [], ranges = definition.params.filter(param => param.type === 'range');
  const check = async (name, test) => { if (process.env.FERMENT_PROJECT_FILTER && !new RegExp(process.env.FERMENT_PROJECT_FILTER).test(name)) return; await test(); passed.push(name); console.log('PASS ' + name); };
  await check('The FERMENT effect has complete guitar, bass and chord recipes with unique controls', () => {
    assert.equal(release.scope.LoomEffectsCatalog.length, 19); assert.equal(release.scope.LoomEffectsCatalog.filter(effect => effect.id === 'ferment').length, 1); assert.equal(new Set(definition.params.map(param => param.key)).size, definition.params.length); assert(definition.params.length >= 35); assert(definition.presets.length >= 20); assert.equal(new Set(definition.presets.map(preset => preset.id)).size, definition.presets.length);
    assert.deepEqual(q.plain(F.normalize({})), q.plain(definition.defaults)); const registers = new Set(), modes = new Set(), filters = new Set();
    for (const preset of definition.presets) { assert(preset.name && preset.description.length > 20); assert.deepEqual(q.plain(F.normalize(preset.params)), q.plain(preset.params), preset.id); assert.deepEqual(Object.keys(preset.params).sort(), Object.keys(definition.defaults).sort(), preset.id + ' incomplete recipe'); registers.add(preset.params.register); modes.add(preset.params.mode); filters.add(preset.params.filterModel); }
    assert.deepEqual([...registers].sort(), ['bass', 'guitar', 'played']); assert.deepEqual([...modes].sort(), ['chord', 'track']); assert.deepEqual([...filters].sort(), ['ladder', 'ota', 'svf']);
  });
  await check('Every numeric synth control round-trips in all ten tracks, both returns and master', () => {
    for (let ownerIndex = 0; ownerIndex < 13; ownerIndex++) for (const mode of ['track', 'chord']) {
      const state = blank(release), owner = owners(state)[ownerIndex], params = { ...definition.defaults, mode, ...Object.fromEntries(ranges.map(param => [param.key, param.min + (param.max - param.min) * .37])) }; owner.effects = owner.effects.map(() => S.effect({ type: 'ferment', params }));
      owner.automation = ranges.map(param => ({ target: 'fx:2:' + param.key, effectType: 'ferment', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: param.min }, { beat: 4, value: param.max }] }));
      const restored = S.parseProject(S.serializeProject(state)), actual = owners(restored)[ownerIndex]; assert.deepEqual(q.plain(actual.effects), q.plain(owner.effects)); assert.deepEqual(q.plain(actual.automation), q.plain(owner.automation));
      for (const param of ranges) { const descriptor = S.automationTargets(actual).find(item => item.target === 'fx:2:' + param.key); assert(descriptor && descriptor.effectType === 'ferment', param.key + ' is missing an automation descriptor'); }
    }
    evidence.numericTargets = ranges.map(param => param.key);
  });
  await check('Malformed synth modes, filters, ranges and numeric automation reject atomically', () => {
    const original = fixture(release).state, mutations = [state => state.tracks[0].effects[0].params.mode = 'poly-midi', state => state.tracks[0].effects[0].params.filterModel = 'missing', state => state.tracks[0].effects[0].params.inputRange = 'violin', state => state.tracks[0].effects[0].params.cutoff = Infinity, state => state.tracks[0].effects[0].params.resonance = '1', state => state.tracks[0].automation = [{ target: 'fx:0:cutoff', effectType: 'ferment', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: 16001 }] }]];
    for (const mutate of mutations) { const state = S.copy(original); mutate(state); const before = JSON.stringify(state), serialized = JSON.stringify({ format: 'loom-project', formatVersion: 1, appVersion: S.VERSION, state }); assert.throws(() => S.parseProject(serialized)); assert.equal(JSON.stringify(state), before); }
    assert.deepEqual(q.plain(original), q.plain(fixture(release).state));
  });
  await check('Track, return and master racks use the same saved pitch-synth processor', () => {
    const report = {};
    for (const ownerIndex of [0, 10, 12]) { const input = fixture(release, { inputRange: 'guitar', mix: 1 }), state = input.state; state.tracks[0].effects[0] = null; owners(state)[ownerIndex].effects[0] = S.effect({ type: 'ferment', params: { ...definition.defaults, inputRange: 'guitar', mix: 1 } }); if (ownerIndex === 8) state.tracks[0].sends = [.6, 0]; const output = render(release, state, input.assets, input.rate, input.frames); q.finite(output.audio); assert(q.rms(output.audio[0], input.rate / 2) > .0001, 'No synth audio in owner ' + ownerIndex); const slots = ownerIndex === 0 ? output.core.slots[0] : ownerIndex === 8 ? output.core.returnSlots[0] : output.core.masterSlots; assert(slots[0]?.dsp); report[ownerIndex] = q.hash(output.audio); }
    assert.equal(new Set(Object.values(report)).size, 3); evidence.ownerRenders = report;
  });
  await check('Drawn and cross-modulated LFO controls remain exact across irregular block boundaries', () => {
    const input = fixture(release, { mode: 'chord', direct: 0, mix: 1 }), state = input.state, track = state.tracks[0];
    track.automation = [{ target: 'fx:0:cutoff', effectType: 'ferment', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: 350 }, { beat: 4, value: 2800 }] }, { target: 'fx:0:envAmount', effectType: 'ferment', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: -24 }, { beat: 4, value: 36 }] }];
    Object.assign(state.lfos[0], { enabled: true, sync: false, rate: 1.7, depth: .5, routes: [{ id: 'ferment-resonance', ownerId: track.id, target: 'fx:0:resonance', effectType: 'ferment', enabled: true, amount: .15 }, { id: 'ferment-cross', ownerId: 'lfo-2', target: 'rate', enabled: true, amount: .04 }] });
    Object.assign(state.lfos[1], { enabled: true, sync: true, division: .5, depth: .4, routes: [{ id: 'ferment-osc-detune', ownerId: track.id, target: 'fx:0:detune', effectType: 'ferment', enabled: true, amount: .1 }] });
    const regular = render(release, state, input.assets, input.rate, input.frames, {}, 128).audio, irregular = render(release, state, input.assets, input.rate, input.frames, {}, [1, 17, 137, 251]).audio; assert.deepEqual(regular, irregular); const flat = S.copy(state); flat.tracks[0].automation = []; flat.lfos.forEach(lfo => { lfo.enabled = false; }); assert(q.difference(regular[0], render(release, flat, input.assets, input.rate, input.frames).audio[0]).rms > 1e-5); evidence.automatedPcm = q.hash(regular);
  });
  await check('Every filter and both sound engines freeze with baked automation while shared buses stay live', () => {
    const report = {};
    for (const mode of ['track', 'chord']) for (const filterModel of ['ladder', 'ota', 'svf']) {
      const input = fixture(release, { mode, filterModel, direct: .1, mix: 1 }); input.state.tracks[0].automation = [{ target: 'fx:0:cutoff', effectType: 'ferment', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: 500 }, { beat: 4, value: 3200 }] }]; input.state.returns[0].effects[0] = S.effect({ type: 'prism', params: { filter: 'lowpass', cutoff: 2300, mix: 1 } }); input.state.master.effects[0] = S.effect({ type: 'prism', params: { filter: 'highpass', cutoff: 40, mix: 1 } });
      const reference = render(release, input.state, input.assets, input.rate, input.frames).audio, frozen = freeze(release, input), cached = render(release, frozen.state, frozen.assets, input.rate, input.frames); for (let channel = 0; channel < 2; channel++) assert(q.difference(reference[channel], cached.audio[channel]).max < 3e-7, mode + ' ' + filterModel); assert(cached.core.slots[0].every(slot => slot === null)); assert.equal(cached.core.trackEq[0], null); assert.equal(cached.core.clipLists[0].length, 0); assert(cached.core.returnSlots[0][0] && cached.core.masterSlots[0]); const restored = S.parseProject(S.serializeProject(frozen.state)); assert(S.freezeValid(restored, 'track-1')); report[mode + '-' + filterModel] = q.hash(cached.audio);
    }
    evidence.frozenModes = report;
  });
  await check('Actual live and frozen WAV exports keep the synth sound and original editable source', async () => {
    const input = fixture(release, { inputRange: 'bass', register: 'guitar', mix: 1 }, 48000), before = S.serializeProject(input.state), engine = new release.scope.LoomAudio(input.state, input.assets), live = await engine.renderWav(input.state, input.assets, { startBeat: 0, endBeat: 4, tailSeconds: 0 }), frozen = freeze(release, input), cached = await engine.renderWav(frozen.state, frozen.assets, { startBeat: 0, endBeat: 4, tailSeconds: 0 });
    assert.deepEqual(Buffer.from(await live.arrayBuffer()), Buffer.from(await cached.arrayBuffer())); assert.equal(S.serializeProject(input.state), before); evidence.wavBytes = live.size;
  });
  console.log(passed.length + ' FERMENT project/routing groups passed.'); console.log(JSON.stringify(evidence)); return { passed, evidence };
}
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
