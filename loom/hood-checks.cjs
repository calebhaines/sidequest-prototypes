'use strict';
/* HOOD: preserved Original audio, fifteen genuinely different spaces, portable
 * projects and deterministic serialized DSP. No browser or timing benchmark. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const MODELS = ['original', 'room', 'chamber', 'hall', 'cathedral', 'plate', 'spring', 'tile', 'ambience', 'digital', 'modulated', 'shimmer', 'gated', 'reverse', 'bloom', 'nonlinear'];
const BASELINE_PARAMS = [{}, { size: 0, decay: .2, damping: 800, predelay: 0, diffusion: 0, width: 0, mix: 1 }, { size: 1, decay: 12, damping: 18000, predelay: 180, diffusion: 1, width: 1, mix: .53 }, { mix: 0 }, { bypass: true }];
// Frozen from commit a535110fadb623ec837decf6fe199af159dfa7fb before HOOD's
// type selector existed. Each hash includes initial audio, partial updates and
// reset; the downloadable source needs neither Git nor a network connection.
const ORIGINAL_GOLDENS = {
  "8000:0": {
    "sha256": "4dd8ed217d8fbf7ff3c925bd3a5443f88039bd4f9a6e10c08af15c06bb56c7e1",
    "tail": 0.75
  },
  "8000:1": {
    "sha256": "09cd620a8cf21147eb588fbea7039bdd33836cda559bb5b7227a60a256f0d67c",
    "tail": 0.75
  },
  "8000:2": {
    "sha256": "14dba36669dfdf6be8bd8d3b60e2932844f9b8ec77939778d33867aa0b5e94b1",
    "tail": 0.75
  },
  "8000:3": {
    "sha256": "3015d8fafdf7e792166c9cc8eab2354f88e0030ab41b4c71358606ee6ed1f4a3",
    "tail": 0.75
  },
  "8000:4": {
    "sha256": "e2a6c6ec35c9087691a34f58c2ecd538eef2499701a59969af28c534924dda7e",
    "tail": 0.75
  },
  "44100:0": {
    "sha256": "8c9f055f219f3b7472efff9cacaf7f435e67f43fc26f26c3338c942d207eac9a",
    "tail": 0.75
  },
  "44100:1": {
    "sha256": "ff46a705bba6aac2c56e518a71721d7bff0980eeecc9be8afdf4da5fca026226",
    "tail": 0.75
  },
  "44100:2": {
    "sha256": "b6a46198743a8ad5c49657e7e4e67f4a44d0ae4d8dc675af4842fb9f1a3a3feb",
    "tail": 0.75
  },
  "44100:3": {
    "sha256": "da10585caaace569effc783862713f883aaa599d8970a88dccc173b9f2b20c28",
    "tail": 0.75
  },
  "44100:4": {
    "sha256": "7be2366732b999323b2cec8e833f362793fc5ae30dabf4091dbf69c2b9c800ee",
    "tail": 0.75
  },
  "48000:0": {
    "sha256": "93921aed867d8d26867cac7659ad0d5d4a82000016900f8d455b66e5c0442f5d",
    "tail": 0.75
  },
  "48000:1": {
    "sha256": "b7e8d916c39f45efd89266750ec23eee56c1298a2b0567c4ed78e07b3d904223",
    "tail": 0.75
  },
  "48000:2": {
    "sha256": "2acc767c69b9b9a51b9bc5da0689b011fd00f64e9a8d86f0f38188b220fa637b",
    "tail": 0.75
  },
  "48000:3": {
    "sha256": "4e946bcaa6bfe7688b0792e8665ef63021633c50d77651b90a9e33841777eda9",
    "tail": 0.75
  },
  "48000:4": {
    "sha256": "6565115d1089581402ec25fedc01780d2081cb512daae36c341a9a71252c33f0",
    "tail": 0.75
  },
  "96000:0": {
    "sha256": "3137ea9aa2bd6a9f7b5cda7f5b7ed39a2986101195f3c41ae4e75086a30f15fd",
    "tail": 0.75
  },
  "96000:1": {
    "sha256": "48e7b3c515bfe49dbf3e13b5fae0750cf9289af33508b3237ffb14074ae6e951",
    "tail": 0.75
  },
  "96000:2": {
    "sha256": "3dc24ad9db39b8792e3db06f58edf5f632f30dd886ec3188d76ed452f61bc344",
    "tail": 0.75
  },
  "96000:3": {
    "sha256": "2e778e183d342c72672be017fae84ac32e03e21d5ed516793457bc5921856bb2",
    "tail": 0.75
  },
  "96000:4": {
    "sha256": "b57ecb8275e8c4169799d19ec1fba5a49b1b4c7231b100a7a1ec467987441f28",
    "tail": 0.75
  },
  "192000:0": {
    "sha256": "22c187826b487224178416b16961a8bad42517b5456a98ca39104f1bfb7f09e5",
    "tail": 0.75
  },
  "192000:1": {
    "sha256": "5b939bd109f10ff2d172799c227e2b0f63b35f9c9638178aeac7df084adf7d0c",
    "tail": 0.75
  },
  "192000:2": {
    "sha256": "ca451c0b3e9c389ef14f2be9911e0800566171e269736322dc434176b7861f97",
    "tail": 0.75
  },
  "192000:3": {
    "sha256": "4792f05e9cc2a5820cab1effb63fde1ab77378e9bb877dcafc337485bd2a7ca6",
    "tail": 0.75
  },
  "192000:4": {
    "sha256": "71f5bdeaf599a81b611d7ae943a100e8644acaa8aaaed9da1250f8465439e062",
    "tail": 0.75
  }
};
const plain = value => JSON.parse(JSON.stringify(value));
function load() {
  const scope = {}; scope.window = scope;
  for (const file of ['hood-dsp.js', 'effects-catalog.js', 'effects.js', 'schema.js']) Function('window', 'globalThis', fs.readFileSync(path.join(__dirname, file), 'utf8'))(scope, scope);
  const shared = fs.existsSync(path.join(__dirname, 'shared', 'voice-effects.js')) ? path.join(__dirname, 'shared', 'voice-effects.js') : path.join(__dirname, '..', 'shared', 'voice-effects.js');
  Function('window', 'globalThis', fs.readFileSync(shared, 'utf8'))(scope, scope);
  return { scope, E: scope.createLoomEffectsDSP(), H: scope.createLoomHoodDSP(), S: scope.LoomSchema, definition: scope.LoomEffectsCatalog.find(effect => effect.id === 'vestige') };
}
function signal(frames, rate = 48000, amplitude = .15) {
  return [0, 1].map(ch => Float32Array.from({ length: frames }, (_, i) => amplitude * (Math.sin(2 * Math.PI * (ch ? 347 : 211) * i / rate) + .21 * Math.sin(2 * Math.PI * (ch ? 1901 : 1237) * i / rate))));
}
function impulse(frames, amplitude = .5) { const pair = [new Float32Array(frames), new Float32Array(frames)]; pair[0][0] = amplitude; return pair; }
function feed(effect, audio, sizes = [128], events = [], rate = 48000) {
  const result = audio.map(channel => channel.slice()); let at = 0, block = 0, event = 0;
  while (at < result[0].length) {
    while (events[event]?.at === at) { const e = events[event++]; if (e.patch) effect.setParams(e.patch); if (e.reset) effect.reset(); }
    const end = Math.min(result[0].length, at + sizes[block++ % sizes.length], events[event]?.at ?? Infinity);
    effect.process(result[0].subarray(at, end), result[1].subarray(at, end), { tempo: 120, beat: at / rate * 2, playing: true }); at = end;
  }
  return result;
}
function peak(data) { let value = 0; for (const x of data) { assert(Number.isFinite(x), 'Non-finite audio sample'); value = Math.max(value, Math.abs(x)); } return value; }
function rms(data, from = 0, to = data.length) { let energy = 0; for (let i = from; i < to; i++) energy += data[i] * data[i]; return Math.sqrt(energy / Math.max(1, to - from)); }
function difference(a, b) { let energy = 0, maximum = 0; for (let i = 0; i < a.length; i++) { const delta = a[i] - b[i]; energy += delta * delta; maximum = Math.max(maximum, Math.abs(delta)); } return { rms: Math.sqrt(energy / a.length), max: maximum }; }
function digest(audio) { const h = crypto.createHash('sha256'); for (const data of audio) h.update(Buffer.from(data.buffer, data.byteOffset, data.byteLength)); return h.digest('hex'); }
function projection(data, hz, rate, from = 0, to = data.length) { let real = 0, imaginary = 0; for (let i = from; i < to; i++) { const phase = 2 * Math.PI * hz * i / rate; real += data[i] * Math.cos(phase); imaginary += data[i] * Math.sin(phase); } return 2 * Math.hypot(real, imaginary) / Math.max(1, to - from); }
function legacyResults(E) {
  const result = {};
  for (const rate of [8000, 44100, 48000, 96000, 192000]) for (let index = 0; index < BASELINE_PARAMS.length; index++) {
    const fx = E.create('vestige', rate, BASELINE_PARAMS[index]), audio = signal(Math.ceil(rate * .34) + 19, rate), events = [{ at: Math.round(rate * .07), patch: { size: .12, damping: 1700, diffusion: .15 } }, { at: Math.round(rate * .16), patch: { predelay: 50, mix: .62, decay: .45, bypass: false } }, { at: Math.round(rate * .24), reset: true }];
    const output = feed(fx, audio, [137, 19, 251], events, rate);
    result[rate + ':' + index] = { sha256: digest(output), tail: fx.getTailTime() };
  }
  return result;
}
function run() {
  const { scope, E, H, S, definition } = load(), passed = [], evidence = {};
  function check(name, test) { if (process.env.HOOD_QA_FILTER && !new RegExp(process.env.HOOD_QA_FILTER).test(name)) return; test(); passed.push(name); console.log('PASS ' + name); }

  check('One type selector adds fifteen choices while preserving every original control and default', () => {
    assert.deepEqual(plain(H.specifications.model), MODELS);
    assert.deepEqual(plain(E.specifications.vestige.model), MODELS);
    assert.deepEqual(definition.params.find(param => param.key === 'model').options.map(option => option.value), MODELS);
    assert.deepEqual(plain(E.normalize('vestige', {})), definition.defaults);
    assert.equal(E.normalize('vestige', {}).model, 'original');
    assert.deepEqual(plain(H.normalize({})), definition.defaults);
    for (const [key, value] of Object.entries({ size: .55, decay: 2.8, damping: 6500, predelay: 22, diffusion: .75, width: .9, mix: .25, bypass: false })) assert.equal(definition.defaults[key], value, key + ' legacy default changed');
    for (const model of MODELS) assert.equal(E.normalize('vestige', { model }).model, model);
    assert.equal(H.normalize({ model: 'unknown', size: NaN, decay: Infinity, bypass: 'true' }).model, 'original');
    for (const preset of definition.presets || []) assert.deepEqual(E.normalize('vestige', preset.params), preset.params);
  });

  check('Original HOOD is byte-identical to the pre-selector release at five sample rates, boundaries, updates and reset', () => {
    const actual = legacyResults(E); assert.equal(Object.keys(ORIGINAL_GOLDENS).length, 25, 'Missing immutable Original fixtures');
    assert.deepEqual(actual, ORIGINAL_GOLDENS); evidence.originalFixtures = Object.keys(actual).length;
    const audio = signal(24037), a = feed(E.create('vestige', 48000, {}), audio), b = feed(E.create('vestige', 48000, { model: 'original' }), audio); assert.deepEqual(a, b);
  });

  check('All types survive strict project Save/Open on tracks, returns and master; legacy projects inherit Original', () => {
    for (const model of MODELS) {
      const state = S.defaultState(), effect = { type: 'vestige', params: { ...definition.defaults, model } };
      state.tracks[0].effects[0] = plain(effect); state.returns[0].effects[0] = plain(effect); state.master.effects[0] = plain(effect);
      const restored = S.parseProject(S.serializeProject(state));
      for (const owner of [restored.tracks[0], restored.returns[0], restored.master]) assert.deepEqual(owner.effects[0], effect);
      const voice = scope.KitchenVoiceEffects.normalizeSlots([effect, null], { strict: true }); assert.deepEqual(voice[0], effect);
    }
    const state = S.defaultState(), old = { type: 'vestige', params: { ...definition.defaults } }; delete old.params.model;
    state.tracks[0].effects[0] = plain(old); state.returns[0].effects[0] = plain(old); state.master.effects[0] = plain(old);
    const restored = S.parseProject(JSON.stringify({ format: 'loom-project', formatVersion: 1, appVersion: '1.39.0', state }));
    for (const owner of [restored.tracks[0], restored.returns[0], restored.master]) assert.equal(owner.effects[0].params.model, 'original');
    assert.equal(scope.KitchenVoiceEffects.normalizeSlots([old, null], { strict: true })[0].params.model, 'original');
    for (const ownerName of ['track', 'return', 'master']) {
      const bad = JSON.parse(S.serializeProject(restored)), owner = ownerName === 'track' ? bad.state.tracks[0] : ownerName === 'return' ? bad.state.returns[0] : bad.state.master;
      owner.effects[0].params.model = 'unknown'; assert.throws(() => S.parseProject(JSON.stringify(bad)), /HOOD|effect|invalid/i);
      bad.appVersion = '1.39.0'; assert.throws(() => S.parseProject(JSON.stringify(bad)), /HOOD|effect|invalid/i, 'Legacy version must not excuse a supplied invalid type');
      bad.appVersion = S.VERSION; delete owner.effects[0].params.model; assert.throws(() => S.parseProject(JSON.stringify(bad)), /HOOD|effect|invalid/i, 'Current projects need a valid explicit type');
    }
    assert.throws(() => scope.KitchenVoiceEffects.normalizeSlots([{ type: 'vestige', params: { ...definition.defaults, model: 'unknown' } }, null], { strict: true }), /HOOD|invalid/i);
    assert.throws(() => scope.KitchenVoiceEffects.normalizeSlots([{ type: 'vestige', params: { ...definition.defaults, model: undefined } }, null], { strict: true }), /HOOD|invalid/i);
  });

  check('Fifteen additions produce audible, stereo, independently different impulse responses beyond gain', () => {
    const rate = 16000, input = impulse(rate * 2), responses = MODELS.slice(1).map(model => {
      const fx = E.create('vestige', rate, { model, decay: 1.1, predelay: 9, size: .55, diffusion: .75, damping: 7000, width: 1, mix: 1 }), output = feed(fx, input, [137], [], rate), level = rms(output[0]);
      assert(level > 1e-6, model + ' is silent'); assert(peak(output[0]) < 4 && peak(output[1]) < 4, model + ' impulse is excessive');
      assert(difference(output[0], output[1]).rms > 1e-7, model + ' has no stereo field');
      assert(Number.isFinite(fx.getTailTime()) && fx.getTailTime() > .009 && fx.getTailTime() <= 120, model + ' invalid tail');
      return { model, data: Float32Array.from(output[0], sample => sample / level) };
    });
    let minimum = Infinity, closest;
    for (let a = 0; a < responses.length; a++) for (let b = a + 1; b < responses.length; b++) {
      const distance = difference(responses[a].data, responses[b].data).rms;
      if (distance < minimum) { minimum = distance; closest = [responses[a].model, responses[b].model]; }
      assert(distance > .025, responses[a].model + '/' + responses[b].model + ' are only gain variants: ' + distance);
    }
    evidence.closestNormalizedImpulse = { models: closest, distance: minimum };
  });

  check('Pre-delay is causal; gated, reverse and nonlinear reverbs end within their declared tails', () => {
    const rate = 8000;
    for (const model of MODELS.slice(1)) {
      const output = feed(E.create('vestige', rate, { model, predelay: 120, mix: 1 }), impulse(rate / 3), [137], [], rate);
      for (const channel of output) assert.equal(peak(channel.subarray(0, Math.floor(rate * .12) - 2)), 0, model + ' leaks before pre-delay');
    }
    const envelopes = {};
    for (const model of ['gated', 'reverse', 'nonlinear']) {
      const fx = E.create('vestige', rate, { model, size: .5, decay: 1, predelay: 20, diffusion: 0, width: 1, mix: 1 }), tail = fx.getTailTime(), output = feed(fx, impulse(Math.ceil((tail + .2) * rate)), [137], [], rate);
      assert(peak(output[0]) > 1e-4, model + ' has no finite reflections');
      for (const channel of output) assert(peak(channel.subarray(Math.ceil((tail + .01) * rate))) < 1e-8, model + ' leaks beyond the reported tail');
      let energy = 0, moment = 0; for (let i = 0; i < output[0].length; i++) { energy += output[0][i] ** 2; moment += output[0][i] ** 2 * i / rate; }
      envelopes[model] = { seconds: moment / energy, tail };
      if (model === 'reverse') assert(rms(output[0], Math.round(rate * (.02 + 2 / 3)), Math.round(rate * 1.02)) > rms(output[0], Math.round(rate * .02), Math.round(rate * (.02 + 1 / 3))) * 4, 'Reverse must build through the requested one-second window');
    }
    assert(envelopes.reverse.seconds > envelopes.gated.seconds * 1.7, 'Reverse must place its energy later than the gated field');
    evidence.finiteEnvelopes = envelopes;
  });

  check('Shimmer creates an octave above a pure tone rather than only extending a conventional tail', () => {
    const rate = 16000, hz = 200, frames = rate * 4;
    // 200 Hz spans complete periods in both overlapping pitch windows; this
    // isolates the octave generator from the deliberate grain sidebands.
    const input = [0, 1].map(() => Float32Array.from({ length: frames }, (_, i) => .12 * Math.sin(2 * Math.PI * hz * i / rate))), params = { size: .5, decay: 1.5, predelay: 0, diffusion: .6, width: 0, mix: 1, damping: 10000 };
    const reference = feed(E.create('vestige', rate, { ...params, model: 'hall' }), input, [137], [], rate)[0], shimmer = feed(E.create('vestige', rate, { ...params, model: 'shimmer' }), input, [137], [], rate)[0];
    const octave = projection(shimmer, hz * 2, rate, rate * 2), oldOctave = projection(reference, hz * 2, rate, rate * 2);
    assert(octave > oldOctave * 100, 'Shimmer needs an independently generated octave');
    assert(octave > rms(shimmer, rate * 2) * .1, 'The octave must be musically significant');
    evidence.shimmerOctave = { hz: hz * 2, amplitude: octave, conventionalAmplitude: oldOctave };
  });

  check('An immutable pre-1.40 frozen HOOD recipe remains valid after migration, while sound edits invalidate it', () => {
    const state = S.defaultState(); state.lengthBars = 1; state.tempo = 120; state.loopEnd = 4; state.recording.punchEnd = 4;
    const params = { ...definition.defaults }; delete params.model;
    state.tracks[0].effects[0] = { type: 'vestige', params };
    const fingerprint = 'freeze-1-61bd2b794779dc0d'; // Actual a535110 schema/catalog fingerprint.
    assert.equal(S.freezeFingerprint(state, 'track-1'), fingerprint);
    const sampleRate = 8000, frames = 16000, asset = S.encodeFreezeAsset({ left: new Float32Array(frames), sampleRate, id: 'hood-legacy-freeze', name: 'Original HOOD freeze' });
    state.freezeAssets = [asset];
    state.tracks[0].freeze = { version: 1, sampleRate, tempo: 120, lengthBeats: 4, bodyFrames: frames, totalFrames: frames, tailFrames: 0, fingerprint, chunks: [{ startFrame: 0, frames, main: asset.id, sendA: null, sendB: null }] };
    assert(S.freezeValid(state, 'track-1'));
    const opened = S.parseProject(JSON.stringify({ format: 'loom-project', formatVersion: 1, appVersion: '1.39.0', state }));
    assert.equal(opened.tracks[0].effects[0].params.model, 'original');
    assert.equal(opened.tracks[0].freeze.fingerprint, fingerprint); assert(S.freezeValid(opened, 'track-1'));
    const saved = S.parseProject(S.serializeProject(opened)); assert.equal(saved.tracks[0].freeze.fingerprint, fingerprint); assert(S.freezeValid(saved, 'track-1'));
    saved.tracks[0].effects[0].params.model = 'hall'; assert(!S.freezeValid(saved, 'track-1')); assert.throws(() => S.parseProject(S.serializeProject(saved)), /freeze|stale/i);
    const edited = S.copy(opened); edited.tracks[0].effects[0].params.decay += .1; assert(!S.freezeValid(edited, 'track-1'));
  });

  check('Every type is deterministic across irregular blocks and the complete supported sample-rate range', () => {
    for (const rate of [8000, 44100, 48000, 96000, 192000]) for (const model of MODELS.slice(1)) {
      const audio = signal(Math.ceil(rate * .105) + 13, rate), params = { model, predelay: 0, mix: 1 }, event = [{ at: Math.round(rate * .037), patch: { decay: .9, damping: 1300, width: .28, diffusion: .31 } }];
      const a = feed(E.create('vestige', rate, params), audio, [128], event, rate), b = feed(E.create('vestige', rate, params), audio, [1, 17, 137, 251], event, rate);
      assert.deepEqual(b, a, model + '/' + rate + ' block-dependent audio');
      assert(peak(a[0]) <= 8 && peak(a[1]) <= 8);
    }
  });

  check('Serialized new DSP is self-contained and matches main-thread audio exactly', () => {
    const isolated = vm.runInNewContext('(' + scope.createLoomHoodDSP.toString() + ')')(), audio = signal(4099, 8000);
    for (const model of MODELS.slice(1)) {
      const params = { model, mix: 1, predelay: 0 }, a = feed(H.create(8000, params), audio, [128], [], 8000), b = feed(isolated.create(8000, params), audio, [17, 137], [], 8000);
      assert.deepEqual(b, a, model + ' serialized factory');
    }
  });

  check('Type changes use one sample clock and preserve finite output through rapid changes, bypass and reset', () => {
    const rate = 16000, audio = signal(rate, rate, .09), events = MODELS.map((model, index) => ({ at: index * 800, patch: { model, decay: .8, predelay: 5 } }));
    events.push({ at: 13000, patch: { bypass: true } }, { at: 13600, patch: { bypass: false } }, { at: 14300, reset: true });
    const params = { model: 'hall', mix: .4 }, a = feed(E.create('vestige', rate, params), audio, [128], events, rate), b = feed(E.create('vestige', rate, params), audio, [1, 17, 137, 251], events, rate);
    assert.deepEqual(a, b, 'Model crossfades must not depend on host callback size');
    assert(peak(a[0]) < 2 && peak(a[1]) < 2);
    for (let ch = 0; ch < 2; ch++) for (let i = 13000; i < 13600; i++) assert.equal(a[ch][i], audio[ch][i], 'Bypass must remain exact dry');
  });

  check('Sub-fade type changes keep the latest choice and include a queued long room in the reported tail', () => {
    const rate = 16000, fx = E.create('vestige', rate, { model: 'original', decay: .2 });
    fx.setParams({ model: 'room', decay: .2 });
    fx.setParams({ model: 'spring', decay: 12, predelay: 180 });
    assert(fx.getTailTime() >= 12.18, 'Queued long rooms must already be included before processing');
    fx.setParams({ model: 'cathedral', decay: 12, predelay: 180 });
    assert(fx.getTailTime() >= 12.18);
    const audio = signal(rate / 3, rate, .08), events = [{ at: 16, patch: { model: 'room', decay: .2 } }, { at: 32, patch: { model: 'plate', decay: .3 } }, { at: 48, patch: { model: 'spring', decay: 1.2 } }, { at: 64, patch: { model: 'cathedral', decay: 1.3 } }], params = { model: 'hall', predelay: 0, mix: .5 };
    const a = E.create('vestige', rate, params), b = E.create('vestige', rate, params), outA = feed(a, audio, [128], events, rate), outB = feed(b, audio, [1, 17, 137, 251], events, rate);
    assert.deepEqual(outA, outB, 'Queued crossfades must use samples rather than host blocks');
    assert.equal(a.getMeters().model, 'cathedral', 'The final queued choice must become active');
    assert.equal(b.getMeters().model, 'cathedral'); assert(peak(outA[0]) < 2 && peak(outA[1]) < 2);
  });

  check('Mix ramps into and out of zero smoothly before suspending both ordinary and shaped reverbs', () => {
    const rate = 8000, warm = rate * 2, resume = warm + Math.round(rate * .12), frames = resume + rate * 2;
    // Steady DC leaves a settled high-passed reverb at zero wet level, making
    // a hard .5↔0 mix change an unambiguous 0.04-amplitude discontinuity.
    const input = [new Float32Array(frames).fill(.08), new Float32Array(frames).fill(.08)], events = [{ at: warm, patch: { mix: 0 } }, { at: resume, patch: { mix: .5 } }];
    const transitions = {};
    for (const model of ['room', 'reverse']) {
      const params = { model, decay: .2, predelay: 0, diffusion: .65, width: 1, mix: .5 }, reference = feed(E.create('vestige', rate, params), input, [128], [], rate), a = feed(E.create('vestige', rate, params), input, [128], events, rate), b = feed(E.create('vestige', rate, params), input, [1, 17, 137, 251], events, rate);
      const unstarted = E.create('vestige', rate, { ...params, mix: 0 }); unstarted.setParams({ mix: .5 }); unstarted.setParams({ mix: 0 });
      assert.equal(unstarted.getTailTime(), 0, model + ' leaves an unstarted fade permanently pending at zero mix');
      assert.deepEqual(feed(unstarted, input.map(channel => channel.subarray(0, 257)), [137], [], rate), input.map(channel => channel.slice(0, 257)), model + ' unstarted zero-mix path');
      assert.deepEqual(a, b, model + ' zero-mix suspension must keep one sample clock across callback sizes');
      let downStep = 0, upStep = 0;
      for (let ch = 0; ch < 2; ch++) {
        const fullStep = Math.abs(input[ch][warm] - reference[ch][warm]); assert(fullStep > .02, 'The fixture must expose a potential hard mix discontinuity');
        downStep = Math.max(downStep, Math.abs(a[ch][warm] - reference[ch][warm])); upStep = Math.max(upStep, Math.abs(a[ch][resume] - input[ch][resume]));
        assert(Math.abs(a[ch][warm] - reference[ch][warm]) < fullStep * .05, model + ' jumps straight to dry before fading out');
        assert(Math.abs(a[ch][resume] - input[ch][resume]) < fullStep * .05, model + ' jumps straight to wet when resuming');
        for (let i = warm + Math.round(rate * .08); i < resume; i++) assert.equal(a[ch][i], input[ch][i], model + ' does not settle to exact dry');
        assert(Math.abs(a[ch][frames - 1] - reference[ch][frames - 1]) < 1e-5, model + ' does not regain its settled mix');
      }
      transitions[model] = { downStep, upStep };
    }
    evidence.mixZeroTransitions = transitions;
  });

  check('Width-only automation does not repeatedly redesign reverb damping or feedback coefficients', () => {
    let expensiveCalls = 0;
    const math = Object.create(Math);
    for (const name of ['exp', 'pow', 'sin', 'cos', 'sqrt']) Object.defineProperty(math, name, { value: (...args) => { expensiveCalls++; return Math[name](...args); } });
    const watched = Function('Math', 'return (' + scope.createLoomHoodDSP.toString() + ');')(math)();
    for (const model of MODELS.slice(1)) {
      const fx = watched.create(48000, { model, width: .9 }); expensiveCalls = 0;
      for (let i = 0; i < 64; i++) fx.setParams({ width: .1 + i * .01 });
      assert.equal(expensiveCalls, 0, model + ' recalculates unrelated coefficients for stereo-width automation');
      assert(Math.abs(fx.getParams().width - .73) < 1e-12);
    }
  });

  check('Vintage digital settles to silence after its declared tail without a quantization limit cycle', () => {
    const rate = 8000, params = { model: 'digital', size: 1, decay: 12, damping: 18000, diffusion: 1, mix: 1, predelay: 0, width: 1 }, a = E.create('vestige', rate, params), b = E.create('vestige', rate, params), tail = a.getTailTime(), input = impulse(Math.ceil((tail + .3) * rate), .5);
    const output = feed(a, input, [128], [], rate), odd = feed(b, input, [1, 17, 137, 251], [], rate);
    assert.deepEqual(odd, output, 'Settled-silence cleanup must use the same sample clock across host blocks');
    const after = output.map(channel => peak(channel.subarray(Math.ceil((tail + .05) * rate))));
    assert(after.every(value => value < 1e-8), 'Quantized feedback must not leave stationary noise: ' + after.join('/'));
    evidence.digitalTail = { seconds: tail, afterPeak: after };
  });

  check('Boundaries remain finite, stereo width zero sums wet audio, and bypass/mix zero retain dry samples', () => {
    for (const model of MODELS.slice(1)) {
      const audio = signal(4099, 8000, .4), params = { model, mix: 1, predelay: 0 };
      for (const patch of [{ size: 0, decay: .2, damping: 800, diffusion: 0, width: 0 }, { size: 1, decay: 12, damping: 18000, diffusion: 1, width: 1, predelay: 180 }]) {
        const fx = E.create('vestige', 8000, { ...params, ...patch }), output = feed(fx, audio, [137], [], 8000); assert(peak(output[0]) <= 8 && peak(output[1]) <= 8);
        assert(Number.isFinite(fx.getTailTime()) && fx.getTailTime() <= 120);
        if (patch.width === 0) assert.deepEqual(output[0], output[1], model + ' width zero');
      }
      for (const patch of [{ bypass: true }, { mix: 0 }]) assert.deepEqual(feed(E.create('vestige', 8000, { ...params, ...patch }), audio), audio, model + ' dry path');
      const fx = E.create('vestige', 8000, params); feed(fx, audio); fx.reset(); const reset = feed(fx, audio), fresh = feed(E.create('vestige', 8000, params), audio); assert.deepEqual(reset, fresh, model + ' deterministic reset');
      const invalid = [Float32Array.of(NaN, Infinity, -Infinity, 1e9, -1e9), Float32Array.of(Infinity, NaN, -Infinity, -1e9, 1e9)], output = feed(E.create('vestige', 8000, params), invalid); assert(peak(output[0]) <= 8 && peak(output[1]) <= 8);
    }
  });

  console.log(passed.length + ' HOOD groups passed.');
  if (process.env.HOOD_QA_REPORT) fs.writeFileSync(process.env.HOOD_QA_REPORT, JSON.stringify({ passed, evidence }, null, 2) + '\n');
  return { passed, evidence };
}
if (require.main === module) { try { run(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; } }
module.exports = { run, load, signal, impulse, feed, rms, peak, difference, digest, projection, legacyResults, MODELS, BASELINE_PARAMS };
