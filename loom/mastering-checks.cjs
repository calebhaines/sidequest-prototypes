'use strict';
/* GALLEY mastering: actual DSP, calibrated signals and deterministic state.
 * Heavy timing is opt-in; correctness runs do not depend on wall-clock speed.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto, createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const BASELINE = '341fa6b31330162adead3b4c6e45353a577447ad';
const catalogs = ['vocal', 'utility', 'filter', 'creative', 'preamp', 'tape', 'char', 'lofi', 'pedal-synth'];
const modules = [
  'shared/pattern-schema.js',
  ...catalogs.map(name => 'loom/' + name + '-catalog.js'), 'loom/effects-catalog.js',
  ...['vocal-dsp', 'utility-dsp', 'filter-dsp', 'creative-dsp', 'broiler-pedals', 'compressor-dsp', 'preamp-dsp', 'tape-dsp', 'char-dsp', 'lofi-dsp', 'pedal-synth-tracker', 'pedal-synth-dsp', 'effects', 'mastering-dsp', 'service-schema', 'lfo', 'schema', 'cpu-profiler', 'track-eq-dsp', 'audio-engine', 'service-capture', 'freeze'].map(name => 'loom/' + name + '.js')
];
function source(file, ref) {
  if (ref) return execFileSync('git', ['show', ref + ':' + file], { cwd: root, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  const local = path.join(__dirname, file.startsWith('loom/') ? file.slice(5) : file);
  return fs.readFileSync(fs.existsSync(local) ? local : path.join(root, file), 'utf8');
}
function load(ref) {
  const scope = { console, performance, Date, crypto: webcrypto, Blob, AbortController, DOMException, setTimeout, clearTimeout, TextEncoder, TextDecoder, structuredClone };
  scope.window = scope; scope.globalThis = scope;
  scope.atob = value => Buffer.from(value, 'base64').toString('binary');
  scope.btoa = value => Buffer.from(value, 'binary').toString('base64');
  for (const file of modules) {
    if (ref && file === 'loom/mastering-dsp.js') continue;
    Function('window', 'globalThis', 'crypto', 'atob', 'btoa', source(file, ref) + '\n//# sourceURL=mastering-checks-' + file)(scope, scope, scope.crypto, scope.atob, scope.btoa);
  }
  const E = scope.createLoomEffectsDSP(scope.createLoomVocalDSP, scope.createLoomUtilityDSP, scope.createLoomFilterDSP, scope.createLoomCreativeDSP, scope.createLoomBroilerPedalsDSP, scope.createLoomCompressorDSP, scope.createLoomPreampDSP, scope.createLoomTapeDSP, scope.createLoomCharDSP, scope.createLoomLoFiDSP, scope.createLoomPedalSynthDSP, scope.createLoomPedalTrackerDSP);
  const M = scope.createLoomMasteringDSP?.();
  const DSP = scope.createLoomEngineDSP(scope.createLoomEffectsDSP, scope.createLoomLFODSP, scope.createLoomCPUProfiler, scope.createLoomTrackEQDSP, scope.createLoomMasteringDSP);
  return { scope, S: scope.LoomSchema, E, M, DSP, source: file => source(file, ref) };
}
const plain = value => JSON.parse(JSON.stringify(value));
const hash = channels => { const h = createHash('sha256'); for (const channel of channels) h.update(Buffer.from(channel.buffer, channel.byteOffset, channel.byteLength)); return h.digest('hex'); };
const owners = state => [...state.tracks, ...state.returns, state.master];
function blank(release) {
  const state = release.S.defaultState(); state.tempo = 120; state.lengthBars = 1; state.loopEnabled = false; state.loopStart = 0; state.loopEnd = 4; state.recording.punchEnd = 4;
  for (const owner of owners(state)) { owner.effects.fill(null); owner.automation = []; owner.level = .7; owner.mute = false; if ('pan' in owner) owner.pan = 0; }
  for (const track of state.tracks) { track.clips = []; track.instrumentLive = false; track.sends = [0, 0]; track.sendPre = [false, false]; }
  state.lfos.forEach(lfo => { lfo.enabled = false; lfo.routes = []; }); return state;
}
function signal(frames, rate = 48000, gain = .08) { return [0, 1].map(channel => Float32Array.from({ length: frames }, (_, i) => gain * (Math.sin(2 * Math.PI * (channel ? 229 : 137) * i / rate) + .27 * Math.sin(2 * Math.PI * (channel ? 2371 : 1723) * i / rate)))); }
function tone(hz, frames = 48000, rate = 48000, gain = .1) { const data = Float32Array.from({ length: frames }, (_, i) => gain * Math.sin(2 * Math.PI * hz * i / rate)); return [data, data.slice()]; }
function rms(data, start = 0, end = data.length) { let power = 0; for (let i = start; i < end; i++) power += data[i] * data[i]; return Math.sqrt(power / Math.max(1, end - start)); }
function peak(data) { let value = 0; for (const x of data) value = Math.max(value, Math.abs(x)); return value; }
function difference(a, b) { assert.equal(a.length, b.length); let max = 0, energy = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; max = Math.max(max, Math.abs(d)); energy += d * d; } return { max, rms: Math.sqrt(energy / Math.max(1, a.length)) }; }
function projection(data, hz, rate = 48000, start = Math.floor(data.length / 2)) { let real = 0, imaginary = 0; for (let i = start; i < data.length; i++) { const phase = 2 * Math.PI * hz * i / rate; real += data[i] * Math.cos(phase); imaginary += data[i] * Math.sin(phase); } return 2 * Math.hypot(real, imaginary) / Math.max(1, data.length - start); }
function finite(audio) { for (const channel of audio) for (const value of channel) assert(Number.isFinite(value), 'Non-finite mastering output'); }
function feed(processor, input, blocks = 128, events = [], rate = 48000) {
  const audio = input.map(channel => channel.slice()), sizes = Array.isArray(blocks) ? blocks : [blocks]; let at = 0, next = 0, block = 0;
  while (at < audio[0].length) {
    while (events[next]?.at === at) { const event = events[next++]; if (event.patch) processor.setParams(event.patch); if (event.reset) processor.reset(); if (event.analysis !== undefined) processor.setAnalysis?.(event.analysis); }
    const end = Math.min(audio[0].length, at + sizes[block++ % sizes.length], events[next]?.at ?? Infinity);
    processor.process(audio[0].subarray(at, end), audio[1].subarray(at, end), { tempo: 120, beat: at / rate * 2, playing: true }); at = end;
  }
  return audio;
}
function render(release, state, assets = {}, rate = 48000, frames = rate, options = {}, blocks = 128, sources = []) {
  const core = new release.DSP.Core(state, assets, rate, { linear: true, ...options }), audio = [new Float32Array(frames), new Float32Array(frames)], sizes = Array.isArray(blocks) ? blocks : [blocks]; core.start(0); let block = 0;
  for (let at = 0; at < frames;) { const end = Math.min(frames, at + sizes[block++ % sizes.length]); const inputs = Array.from({ length: state.tracks.length + 1 }, (_, index) => sources[index] ? sources[index].map(channel => channel.subarray(at, end)) : []); core.processBlock(audio[0].subarray(at, end), audio[1].subarray(at, end), inputs); at = end; }
  return { core, audio };
}
function assetFixture(release, index = 8, rate = 8000, seconds = 2) {
  const state = blank(release), frames = Math.round(rate * seconds), channels = signal(frames, rate, .08), asset = release.S.encodeAsset({ id: 'mastering-source', name: 'Mastering input', sampleRate: rate, left: channels[0], right: channels[1] });
  state.assets = [asset]; state.tracks[index].clips = [{ id: 'mastering-clip', name: 'Mastering source', type: 'audio', assetId: asset.id, start: 0, length: seconds * 2, sourceStart: 0, sourceEnd: seconds, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: .8, fadeIn: 0, fadeOut: 0 }];
  return { state, rate, frames, assets: release.S.decodeAssets(state.assets) };
}
function freeze(release, input, trackId = 'track-9') {
  const state = release.S.copy(input.state), core = new release.DSP.Core(state, input.assets, input.rate, { linear: true, freezeCaptureTrackId: trackId }), planes = Object.fromEntries(['main', 'sendA', 'sendB'].map(key => [key, [new Float32Array(input.frames), new Float32Array(input.frames)]])); core.start(0);
  for (let at = 0; at < input.frames; at += 128) { const n = Math.min(128, input.frames - at); core.processBlock(new Float32Array(n), new Float32Array(n)); for (const key of Object.keys(planes)) for (let channel = 0; channel < 2; channel++) planes[key][channel].set(core.freezeCapture[key][channel].subarray(0, n), at); }
  const chunk = { startFrame: 0, frames: input.frames, main: null, sendA: null, sendB: null }, items = [];
  for (const key of Object.keys(planes)) { if (!planes[key].some(channel => channel.some(x => x !== 0))) continue; const asset = release.S.encodeFreezeAsset({ id: 'mastering-freeze-' + trackId + '-' + key, name: 'Frozen ' + trackId + ' ' + key, sampleRate: input.rate, left: planes[key][0], right: planes[key][1] }); items.push(asset); chunk[key] = asset.id; }
  state.freezeAssets = [...(state.freezeAssets || []), ...items]; const track = state.tracks.find(track => track.id === trackId); track.freeze = { version: 1, sampleRate: input.rate, tempo: state.tempo, lengthBeats: state.lengthBars * 4, bodyFrames: input.frames, totalFrames: input.frames, tailFrames: 0, fingerprint: release.S.freezeFingerprint(state, trackId), chunks: [chunk] };
  return { state, rate: input.rate, frames: input.frames, assets: release.S.decodeAssets(state.assets, state.freezeAssets) };
}
module.exports = { BASELINE, load, source, plain, hash, owners, blank, signal, tone, rms, peak, difference, projection, finite, feed, render, assetFixture, freeze };
async function run() {
  const release = load(), { M, S, DSP } = release, passed = [], evidence = {};
  const check = async (name, test) => { if (process.env.MASTERING_QA_FILTER && !new RegExp(process.env.MASTERING_QA_FILTER).test(name)) return; await test(); passed.push(name); console.log('PASS ' + name); };
  await check('The mastering schema has complete bounded controls with neutral defaults and strict portable validation', () => {
    const defaults = M.normalize({}), state = S.defaultState(), numeric = Object.keys(M.specifications).filter(key => typeof M.specifications[key][0] === 'number'), booleans = Object.keys(M.specifications).filter(key => typeof M.specifications[key][0] === 'boolean');
    assert.equal(numeric.length, 25); assert.equal(booleans.length, 8); assert.deepEqual(plain(state.master.mastering), plain(defaults)); for (const key of booleans) assert.equal(defaults[key], false, key);
    const dirty = { input: Infinity, threshold: 'loud', width: NaN, enabled: 'yes', limiter: 1 }, before = JSON.stringify(dirty); assert.deepEqual(plain(M.normalize(dirty)), plain(defaults)); assert.equal(JSON.stringify(dirty), before);
    for (const key of numeric) { const [minimum, maximum] = M.specifications[key], candidate = S.copy(state); candidate.master.mastering[key] = minimum + (maximum - minimum) * .37; candidate.master.automation = [{ target: 'mastering:' + key, enabled: true, interpolation: 'linear', points: [{ beat: 0, value: minimum }, { beat: 4, value: maximum }] }]; const restored = S.parseProject(S.serializeProject(candidate)); assert.equal(restored.master.mastering[key], candidate.master.mastering[key]); assert.equal(restored.master.automation[0].target, 'mastering:' + key); assert(S.automationTargets(candidate.master).some(item => item.target === 'mastering:' + key)); assert(!S.automationTargets(candidate.tracks[0]).some(item => item.target === 'mastering:' + key)); const invalid = JSON.parse(S.serializeProject(candidate)); invalid.state.master.mastering[key] = maximum + 1; assert.throws(() => S.parseProject(JSON.stringify(invalid)), key); }
    const badBoolean = JSON.parse(S.serializeProject(state)); badBoolean.state.master.mastering.glue = 'true'; assert.throws(() => S.parseProject(JSON.stringify(badBoolean))); evidence.numericTargets = numeric;
  });
  await check('Off neutral and cold-bypassed mastering are exact stereo dry without analyzer allocation or latency', () => {
    const input = signal(24000), cases = [{}, { enabled: true }, { enabled: false, eq: true, lowGain: 9, input: 18 }, { enabled: true, bypass: true, glue: true, threshold: -40, limiter: true }];
    for (const params of cases) { const processor = M.create(48000, params), actual = feed(processor, input, [1, 17, 137, 251]); assert.deepEqual(actual, input); assert.equal(processor.isActive(), false); assert.equal(processor.getMeters().analyzedFrames, 0); assert.equal(processor.getMeters().latencySamples, 0); assert.equal(processor.getTailTime(), 0); }
    assert.throws(() => M.create(48000).process(new Float32Array(2), new Float32Array(3)), /stereo/i);
  });
  await check('Cleanup and broad EQ provide the advertised independent frequency responses', () => {
    const rate = 48000, frames = rate, report = {};
    for (const [name, patch, frequencies] of [['cleanup', { cleanup: true, lowCut: 120 }, [30, 1000]], ['lowShelf', { eq: true, lowGain: 6, lowFreq: 160 }, [40, 5000]], ['midBell', { eq: true, midGain: -6, midFreq: 1200, midQ: 1 }, [1200, 7000]], ['highShelf', { eq: true, highGain: 6, highFreq: 4500 }, [60, 12000]]]) {
      const values = {};
      for (const hz of frequencies) { const input = tone(hz, frames, rate, .03), actual = feed(M.create(rate, { enabled: true, ...patch }), input, 137), gain = projection(actual[0], hz, rate) / projection(input[0], hz, rate); assert(Number.isFinite(gain)); values[hz] = gain; }
      if (name === 'cleanup') { assert(values[30] < .09); assert(values[1000] > .95); } else if (name === 'midBell') { assert(values[1200] < .53 && values[1200] > .47); assert(values[7000] > .94); } else if (name === 'lowShelf') { assert(values[40] > 1.85); assert(values[5000] < 1.02); } else { assert(values[12000] > 1.85); assert(values[60] < 1.02); } report[name] = values;
    }
    const dc = [new Float32Array(rate).fill(.2), new Float32Array(rate).fill(-.1)], actual = feed(M.create(rate, { enabled: true, cleanup: true, lowCut: 80 }), dc); assert(rms(actual[0], rate / 2) < 1e-6); evidence.frequencyResponses = report;
  });
  await check('Glue compression follows threshold ratio stereo link parallel mix and the filtered detector', () => {
    const rate = 48000, frames = rate, source = tone(1000, frames, rate, .4), patch = { enabled: true, glue: true, threshold: -28, ratio: 4, attack: 2, release: 80, knee: 0, makeup: 0, sidechain: 20, link: 1 }, processor = M.create(rate, patch), compressed = feed(processor, source), reduction = 20 * Math.log10(rms(source[0], frames / 2) / rms(compressed[0], frames / 2)); assert(reduction > 10 && reduction < 22); assert(processor.getMeters().compressorReductionDb > 10);
    const parallel = feed(M.create(rate, { ...patch, compMix: 0 }), source); assert.deepEqual(parallel, source);
    const asymmetric = [source[0], Float32Array.from(source[0], value => value * .1)], linked = feed(M.create(rate, patch), asymmetric), unlinked = feed(M.create(rate, { ...patch, link: 0 }), asymmetric); let maxRatio = 0; for (let i = frames / 2; i < frames; i++) maxRatio = Math.max(maxRatio, Math.abs(linked[1][i] - linked[0][i] * .1)); assert(maxRatio < 2e-8); assert(rms(unlinked[1], frames / 2) > rms(linked[1], frames / 2) * 2);
    const detector = {}; for (const hz of [40, 1000]) { const input = tone(hz, frames, rate, .4), actual = feed(M.create(rate, { ...patch, sidechain: 250 }), input); detector[hz] = 20 * Math.log10(rms(input[0], frames / 2) / rms(actual[0], frames / 2)); } assert(detector[1000] > detector[40] + 7); feed(processor, [new Float32Array(rate), new Float32Array(rate)]); assert(processor.getMeters().compressorReductionDb < .01); evidence.compression = { reductionDb: reduction, stereoRatioError: maxRatio, sidechainReductionDb: detector };
  });
  await check('Stereo width centers the image and mono bass selectively removes low-frequency side energy', () => {
    const rate = 48000, frames = rate, input = signal(frames, rate), mono = feed(M.create(rate, { enabled: true, stereo: true, width: 0 }), input); assert.deepEqual(mono[0], mono[1]);
    const ratios = {}; for (const hz of [35, 3000]) { const pair = tone(hz, frames, rate, .07); pair[1] = Float32Array.from(pair[0], value => -value); const narrowed = feed(M.create(rate, { enabled: true, stereo: true, width: 1, monoBass: 200 }), pair); ratios[hz] = rms(narrowed[0], frames / 2) / rms(pair[0], frames / 2); } assert(ratios[35] < .36); assert(ratios[3000] > .95); const wide = feed(M.create(rate, { enabled: true, stereo: true, width: 1.7 }), input); const side = pair => Float32Array.from(pair[0], (value, i) => (value - pair[1][i]) * .5); const widthRatio = rms(side(wide), frames / 2) / rms(side(input), frames / 2); assert(Math.abs(widthRatio - 1.7) < 1e-5); evidence.stereo = { lowSideRatios: ratios, widthRatio };
  });
  await check('Soft colour adds bounded harmonic character and its zero parallel blend preserves the input', () => {
    const rate = 48000, source = tone(233, rate, rate, .2), colored = feed(M.create(rate, { enabled: true, color: true, drive: 12, colorMix: 1 }), source), clean = feed(M.create(rate, { enabled: true, color: true, drive: 12, colorMix: 0 }), source); assert.deepEqual(clean, source); assert(projection(colored[0], 699, rate) > projection(source[0], 699, rate) + .003); assert(peak(colored[0]) < 1); finite(colored); evidence.colorThirdHarmonic = projection(colored[0], 699, rate);
  });
  await check('The zero-lookahead final limiter catches every sample including enable transients and preserves stereo balance', () => {
    const rate = 48000, frames = 12000, left = Float32Array.from({ length: frames }, (_, i) => i % 97 === 0 ? 3 : .9 * Math.sin(2 * Math.PI * 719 * i / rate)), right = Float32Array.from(left, value => -.37 * value), ceilingDb = -3, ceiling = Math.pow(10, ceilingDb / 20), processor = M.create(rate, { enabled: true, limiter: true, ceiling: ceilingDb }), actual = feed(processor, [left, right], [1, 17, 137, 251]); assert(peak(actual[0]) <= ceiling + 8e-8); assert(peak(actual[1]) <= ceiling + 8e-8); let ratioError = 0; for (let i = 0; i < frames; i++) ratioError = Math.max(ratioError, Math.abs(actual[1][i] + actual[0][i] * .37)); assert(ratioError < 5e-8); assert(processor.getMeters().limiterReductionDb > 1);
    const transition = M.create(rate, {}); feed(transition, [left.subarray(0, 1000), right.subarray(0, 1000)]); transition.setParams({ enabled: true, limiter: true, ceiling: ceilingDb }); const enabled = feed(transition, [left.subarray(1000), right.subarray(1000)]); assert(peak(enabled[0]) <= ceiling + 8e-8); evidence.limiter = { ceilingDb, actualPeak: peak(actual[0]), stereoRatioError: ratioError, enablePeak: peak(enabled[0]), latencySamples: processor.getMeters().latencySamples };
  });
  await check('Live stage changes bypass and reset remain deterministic across irregular caller blocks and settle to exact dry', () => {
    const rate = 48000, source = signal(rate * 2, rate, .05), patch = { enabled: true, cleanup: true, lowCut: 27, eq: true, lowGain: 2, midGain: -1.5, highGain: 1, glue: true, threshold: -28, ratio: 2, stereo: true, width: 1.2, monoBass: 100, color: true, drive: 4, colorMix: .12, limiter: true, ceiling: -2 }, events = [{ at: 12000, patch: { threshold: -22, lowGain: -2, width: .8 } }, { at: 24000, patch: { bypass: true } }, { at: 36000, patch: { bypass: false, eq: false, color: false } }, { at: 48000, reset: true }, { at: 60000, patch: { enabled: false } }], regularProcessor = M.create(rate, patch), regular = feed(regularProcessor, source, 128, events), irregular = feed(M.create(rate, patch), source, [1, 17, 137, 251], events); assert.deepEqual(regular, irregular); for (let channel = 0; channel < 2; channel++) assert.deepEqual(regular[channel].subarray(61000), source[channel].subarray(61000)); assert.equal(regularProcessor.isActive(), false); assert.equal(regularProcessor.getMeters().analyzedFrames, 0); evidence.automatedMasterPcm = hash(regular);
  });
  await check('Opt-in K-weighted loudness matches calibrated mono and stereo references without changing samples', () => {
    const rate = 48000, frames = rate * 4, input = tone(1000, frames, rate, .1), stereo = M.create(rate, {}); assert.equal(stereo.getMeters().analyzedFrames, 0); stereo.setAnalysis(true); const actual = feed(stereo, input, 137); assert.deepEqual(actual, input); const meters = stereo.getMeters(); assert.equal(meters.analyzedFrames, frames); for (const key of ['lufsMomentary', 'lufsShortTerm', 'lufsIntegrated']) assert(Math.abs(meters[key] + 20) < .12, key + ' ' + meters[key]); assert(Math.abs(meters.samplePeakHoldDb + 20) < .001); assert(Math.abs(meters.correlation - 1) < 1e-6);
    const mono = M.create(rate, {}); mono.setAnalysis(true); feed(mono, [input[0], new Float32Array(frames)], 251); const monoMeters = mono.getMeters(); assert(Math.abs(monoMeters.lufsIntegrated - (meters.lufsIntegrated - 10 * Math.log10(2))) < .03); const before = meters.analyzedFrames; stereo.setAnalysis(false); feed(stereo, signal(rate), 128); assert.equal(stereo.getMeters().analyzedFrames, before); assert.equal(stereo.getMeters().analysisActive, false); stereo.resetMeters(); assert.equal(stereo.getMeters().analyzedFrames, 0); assert.equal(stereo.getMeters().lufsIntegrated, null); evidence.loudnessReference = { stereo: meters, monoIntegrated: monoMeters.lufsIntegrated };
  });
  await check('Integrated loudness excludes quiet material through the relative gate and retains honest intersample estimates', () => {
    const rate = 48000, loud = tone(1000, rate * 4, rate, .1), quiet = tone(1000, rate * 4, rate, .001), processor = M.create(rate, {}); processor.setAnalysis(true); feed(processor, loud, 137); const before = processor.getMeters().lufsIntegrated; feed(processor, quiet, 251); const after = processor.getMeters(); assert(Math.abs(after.lufsIntegrated - before) < .45, 'Quiet blocks biased gated integrated loudness: ' + after.lufsIntegrated); assert(after.lufsShortTerm < -55); assert(after.lufsMomentary < -55);
    const frequency = rate / 4, pair = [0, 1].map(() => Float32Array.from({ length: rate }, (_, i) => .9 * Math.sin(2 * Math.PI * frequency * i / rate + Math.PI / 4))), peakMeter = M.create(rate, {}); peakMeter.setAnalysis(true); feed(peakMeter, pair); const peakReadings = peakMeter.getMeters(); assert(peakReadings.truePeakHoldDb > peakReadings.samplePeakHoldDb + 1.5); assert(peakReadings.truePeakHoldDb < .3); const anti = M.create(rate, {}); anti.setAnalysis(true); feed(anti, [loud[0], Float32Array.from(loud[0], value => -value)]); assert(anti.getMeters().correlation < -.999); evidence.gatingAndIntersample = { loudIntegrated: before, gatedIntegrated: after.lufsIntegrated, samplePeakHoldDb: peakReadings.samplePeakHoldDb, estimatedPeakHoldDb: peakReadings.truePeakHoldDb };
  });
  await check('All mastering stages remain finite for hot DC extremes and parameter endpoints at supported sample rates', () => {
    const report = {};
    for (const rate of [8000, 44100, 48000, 96000, 192000]) { let maximum = 0; for (const high of [false, true]) { const params = Object.fromEntries(Object.entries(M.specifications).map(([key, rule]) => [key, typeof rule[0] === 'boolean' ? key !== 'bypass' : rule[high ? 1 : 0]])); params.enabled = true; params.limiter = true; const processor = M.create(rate, params), audio = signal(4096, rate, 2); audio[0][17] = Infinity; audio[1][23] = NaN; audio[0][41] = 1e30; const actual = feed(processor, audio, [1, 17, 251]); finite(actual); maximum = Math.max(maximum, peak(actual[0]), peak(actual[1])); assert(maximum <= 1.0000002); processor.reset(); const dc = feed(processor, [new Float32Array(4096).fill(.4), new Float32Array(4096).fill(-.3)], 137); finite(dc); processor.setParams({ bypass: true }); const dry = signal(4096, rate); const bypassed = feed(processor, dry, 137); for (let channel = 0; channel < 2; channel++) assert.deepEqual(bypassed[channel].subarray(Math.ceil(rate * .007)), dry[channel].subarray(Math.ceil(rate * .007))); } report[rate] = maximum; }
    evidence.safetyPeaks = report;
  });
  await check('Mastering and its analysis run after the fader only for master mixes while all twelve stems and freeze captures exclude them', async () => {
    const input = assetFixture(release, 8), state = input.state; state.tracks[9].clips = state.tracks[8].clips.map(clip => ({ ...clip, id: clip.id + '-10', gain: .4 })); state.tracks[8].sends = [.25, .1]; state.tracks[9].sends = [.1, .2]; state.master.level = 1.4; state.master.mastering = M.normalize({ enabled: true, input: 6, output: 3, eq: true, lowGain: 3, limiter: true, ceiling: -9 }); const reference = S.copy(state); reference.master.mastering = M.normalize({}); const mastered = render(release, state, input.assets, input.rate, input.frames), dry = render(release, reference, input.assets, input.rate, input.frames); assert(difference(mastered.audio[0], dry.audio[0]).rms > .003); assert(peak(mastered.audio[0]) <= Math.pow(10, -9 / 20) + 8e-8);
    const stems = [...state.tracks.map(track => ({ trackId: track.id })), ...state.returns.map(bus => ({ returnId: bus.id }))]; for (const options of stems) { const a = render(release, state, input.assets, input.rate, input.frames, options), b = render(release, reference, input.assets, input.rate, input.frames, options); assert.deepEqual(a.audio, b.audio, JSON.stringify(options)); assert.equal(a.core.masteringDSP, null); }
    const frozenMastered = freeze(release, { ...input, state }, 'track-9'), frozenDry = freeze(release, { ...input, state: reference }, 'track-9'); assert.deepEqual(frozenMastered.state.freezeAssets, frozenDry.state.freezeAssets); assert.equal(S.freezeFingerprint(state, 'track-9'), S.freezeFingerprint(reference, 'track-9'));
    const measured = new DSP.Core(state, input.assets, input.rate, { linear: true }); measured.start(); assert.equal(measured.getMeters().mastering.analyzedFrames, 0); measured.setMasteringAnalysis(true); const left = new Float32Array(128), right = left.slice(); measured.processBlock(left, right); assert.equal(measured.getMeters().mastering.analyzedFrames, 128); measured.setMasteringAnalysis(false); measured.processBlock(left, right); assert.equal(measured.getMeters().mastering.analyzedFrames, 128);
    const engine = new release.scope.LoomAudio(state, input.assets); const [mix, cleanMix, stem, cleanStem] = await Promise.all([engine.renderWav(state, input.assets, { startBeat: 0, endBeat: 4, tailSeconds: 0 }), engine.renderWav(reference, input.assets, { startBeat: 0, endBeat: 4, tailSeconds: 0 }), engine.renderWav(state, input.assets, { trackId: 'track-9', startBeat: 0, endBeat: 4, tailSeconds: 0 }), engine.renderWav(reference, input.assets, { trackId: 'track-9', startBeat: 0, endBeat: 4, tailSeconds: 0 })]); const mixBytes = Buffer.from(await mix.arrayBuffer()), cleanBytes = Buffer.from(await cleanMix.arrayBuffer()); assert.notDeepEqual(mixBytes, cleanBytes); assert.deepEqual(Buffer.from(await stem.arrayBuffer()), Buffer.from(await cleanStem.arrayBuffer())); evidence.masterRouting = { stems: stems.length, mixWavBytes: mix.size, stemWavBytes: stem.size, analysisOnlyRequestedFrames: 128 };
  });
  await check('Drawn master parameters and LFO modulation use the absolute control clock across irregular blocks', () => {
    const input = assetFixture(release, 9), state = input.state; state.master.mastering = M.normalize({ enabled: true, eq: true, lowGain: 1, glue: true, threshold: -26, limiter: true, ceiling: -2 }); state.master.automation = [{ target: 'mastering:input', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: -3 }, { beat: 4, value: 4 }] }, { target: 'mastering:threshold', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: -30 }, { beat: 4, value: -18 }] }]; Object.assign(state.lfos[0], { enabled: true, sync: false, rate: 1.2, depth: .5, routes: [{ id: 'mastering-high', ownerId: 'master', target: 'mastering:highGain', enabled: true, amount: .2 }] }); const restored = S.parseProject(S.serializeProject(state)), a = render(release, restored, input.assets, input.rate, input.frames, {}, 128), b = render(release, restored, input.assets, input.rate, input.frames, {}, [1, 17, 137, 251]); assert.deepEqual(a.audio, b.audio); const flat = S.copy(restored); flat.master.automation = []; flat.lfos[0].enabled = false; assert(difference(a.audio[0], render(release, flat, input.assets, input.rate, input.frames).audio[0]).rms > 1e-4); evidence.masterAutomationPcm = hash(a.audio);
  });
  console.log(passed.length + ' mastering DSP/routing groups passed.'); console.log(JSON.stringify(evidence)); return { passed, evidence };
}
module.exports.run = run;
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
