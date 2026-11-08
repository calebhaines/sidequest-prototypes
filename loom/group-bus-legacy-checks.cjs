'use strict';

// Immutable pre-group-bus PCM and freeze guards. Normal execution is portable:
// no Git, browser, downloaded fixture or device is required. The recording flag
// reads ONLY commit 4cc8e68, never working audio, and is not used by normal tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, webcrypto } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const BASELINE = '4cc8e686a026a1818d7c9562b93bade3064058e5';
const CATALOGS = ['vocal', 'utility', 'filter', 'creative', 'preamp', 'tape', 'char', 'lofi', 'pedal-synth', 'deluxe', 'svt', 'guitar-pedals'];
const PROCESSORS = ['vocal-dsp', 'utility-dsp', 'filter-dsp', 'creative-dsp', 'broiler-pedals', 'compressor-dsp', 'preamp-dsp', 'tape-dsp', 'char-dsp', 'lofi-dsp', 'pedal-synth-tracker', 'pedal-midi-dsp', 'pedal-synth-dsp', 'deluxe-dsp', 'svt-dsp', 'guitar-pedals-dsp', 'hood-dsp', 'effects', 'service-schema', 'lfo', 'schema', 'cpu-profiler', 'track-eq-dsp', 'mastering-dsp', 'audio-engine'];
const FILES = ['shared/pattern-schema.js', ...CATALOGS.map(name => 'loom/' + name + '-catalog.js'), 'loom/effects-catalog.js', ...PROCESSORS.map(name => 'loom/' + name + '.js')];
const GOLDENS = /* FROZEN-BEGIN */ {
  "plain/8000/128": {
    "pcm": "95dbe86ce36329e19c3ed8afe46d171788a0f62b0843a18acadadc8c1ecbfb56",
    "meters": "84ae1263f06f374cf944b53fd8d30bdb2e7a0e8ca3cabfc2088276c91d381597"
  },
  "plain/8000/137": {
    "pcm": "95dbe86ce36329e19c3ed8afe46d171788a0f62b0843a18acadadc8c1ecbfb56",
    "meters": "6664854977df1b70a851a1d1b9b8e10efe63601ee01fa007315d1aff8dda6445"
  },
  "plain/48000/128": {
    "pcm": "e419cbb9a14a27e579a06aef8a561b063262950d6d35a9532f362410e1e35373",
    "meters": "75c6aecb03dff804473d37630d3913c95f5932f614ea3b6e255c7632dc3d9b84"
  },
  "plain/48000/137": {
    "pcm": "e419cbb9a14a27e579a06aef8a561b063262950d6d35a9532f362410e1e35373",
    "meters": "8b7f1c9a4e4c1f6e68d3a8c001f96560ecc2824b000dc0b7a6e1c97aba7f90af"
  },
  "rich/8000/128": {
    "pcm": "eff9565fc1767b97924a76d0a57298c9efd42caa59e6d159a17ec10297db139c",
    "meters": "2f51cb2efc74070e7e2f3d2fcab79ebbd61d4c2f2002b4158713fe696649e0be"
  },
  "rich/8000/137": {
    "pcm": "eff9565fc1767b97924a76d0a57298c9efd42caa59e6d159a17ec10297db139c",
    "meters": "69db2503cae3aef8e23d1cab1b5b803db1852ce7629ee646800f681a9419d4ba"
  },
  "rich/48000/128": {
    "pcm": "4f5fd388ac84bf13703fdefd0071415fd230f916285e624ba6a6140b13d733c2",
    "meters": "24601fd174be0b55e1e24fd6c955f732ffb765728e93a5efa778beceff359bef"
  },
  "rich/48000/137": {
    "pcm": "4f5fd388ac84bf13703fdefd0071415fd230f916285e624ba6a6140b13d733c2",
    "meters": "94edfdc8ebee16c22ab4b09f2f90c9886278eebec9c6f271ad2716e886233c1e"
  },
  "changes/8000/128": {
    "pcm": "f3a8e5cc942fd366cba475a55b6fe8093919878197740b780bcdb62d400ba8b0",
    "meters": "6de24c337fba89b5bf21e10b55888a759bc67b3252de4684806c88f969d719f3"
  },
  "changes/8000/137": {
    "pcm": "f3a8e5cc942fd366cba475a55b6fe8093919878197740b780bcdb62d400ba8b0",
    "meters": "2d57b118ffa0f9e71391d6cbe5bc86f37e4ba0312b6cac6957b1cefd4f6bcd43"
  },
  "changes/48000/128": {
    "pcm": "80dfb1d6443a78c5df2f9cfe2adaa2ab64c404cbbe6ab896fb291cb2a9885924",
    "meters": "f605c1449288a93fb2b2b3a428dd12833fe83d29a20c46f5f032f673cb6ebe23"
  },
  "changes/48000/137": {
    "pcm": "80dfb1d6443a78c5df2f9cfe2adaa2ab64c404cbbe6ab896fb291cb2a9885924",
    "meters": "024138bf79c09f04ec8aab0d4db0cb08b0eaa7e4846b0457b79b65f9d7470610"
  },
  "return-solo/8000/128": {
    "pcm": "6c821b143db85401575a92eeed84dea9eab7d2381f0967ff1865cbe3fc78cc3a",
    "meters": "eb5a2df297b0c2f77b7cd9e511b71a42925b468f36c62400763df48def9a2120"
  },
  "return-solo/8000/137": {
    "pcm": "6c821b143db85401575a92eeed84dea9eab7d2381f0967ff1865cbe3fc78cc3a",
    "meters": "c739f8707cc30be7b3fa70d68a6db27bd8dbb2d5cc5e3673ef2505fdd8fb2810"
  },
  "return-solo/48000/128": {
    "pcm": "edfbde952a326082e7b74a57311e7a1af31144532423a77e06be19c1ca018e1c",
    "meters": "f491777a57bdfa6e34f854fb5b5fa05cd62d2b0ae6dbae06c3391a5a915bc35f"
  },
  "return-solo/48000/137": {
    "pcm": "edfbde952a326082e7b74a57311e7a1af31144532423a77e06be19c1ca018e1c",
    "meters": "8925c9580776b10959d83c471bd179c375b231526e094016ee59cb428e5f6369"
  },
  "disabled/8000/128": {
    "pcm": "a980053c0c40be3c57af17a442d1995531cd47b50d843d6d0d5133a0a1241d50",
    "meters": "1eeed4b582a32c0e3a2e3cbc2b64f57b637a6025e3585ceb8c3f8ce6dbfefb34"
  },
  "disabled/8000/137": {
    "pcm": "a980053c0c40be3c57af17a442d1995531cd47b50d843d6d0d5133a0a1241d50",
    "meters": "0abeea357c2f29885d9f248c5c438889b4f70175bcfa1dcdf9882c167e69e6e9"
  },
  "disabled/48000/128": {
    "pcm": "a57cc01698ec9589cccfad279b619a87f593aa92e044bc7773c37ea70159b85a",
    "meters": "2fed396819b1c761cb40ca55576b7284601934949e94ca1a68fa937212c92f00"
  },
  "disabled/48000/137": {
    "pcm": "a57cc01698ec9589cccfad279b619a87f593aa92e044bc7773c37ea70159b85a",
    "meters": "c00d8ce4f72919736c9aedd7f9fe2bf406992e9c1a8367777a94bedb51e7a52a"
  },
  "clips/8000/128": {
    "pcm": "a49b6a5489e146c5f2dc22df330950448cbc596c8bdd5e8a372ee9c40010fa4c",
    "meters": "5583ac07cab403b0b7f0101c6f0fde7a3ab9ddc507a8219054fd4884fe363f14"
  },
  "clips/8000/137": {
    "pcm": "a49b6a5489e146c5f2dc22df330950448cbc596c8bdd5e8a372ee9c40010fa4c",
    "meters": "4bbdbdee958ea57ee623ac22f47d1ed75a6e313b5dabf43220bd11a41ded5d6e"
  },
  "clips/48000/128": {
    "pcm": "ce02a5d08c4fc831719bfaddccbd5fed39558a663df17728bc20a34b5fbbb4b6",
    "meters": "ba60731c31669dfa243d4cb995a333ed0a3b3a34dd060f653918fd60e29de1c5"
  },
  "clips/48000/137": {
    "pcm": "ce02a5d08c4fc831719bfaddccbd5fed39558a663df17728bc20a34b5fbbb4b6",
    "meters": "6d8471f1c9c4fa03c33bb9bca1c390ee155e129a9d6b52d4892c73b1395a5a63"
  },
  "frozen/8000/128": {
    "pcm": "620b155f14cd30a97957e39f98d9bd7b9e37201f90c21fda67d596684d1b6a35",
    "meters": "e481b38df85c6a3eaa0f625a71a9e711509792944c690a7af1c1413af269f50b",
    "frozen": {
      "fingerprint": "freeze-1-9753e5e74dd847fb",
      "planes": {
        "main": "0b1663399da81e9aef892c68a37d82a9d9ada8573c3f213d9908131cab8b17ff",
        "sendA": "0b3a277516f751bb115f2ff0d112f9ebe1d97d8ef1d5d47fdeef1dbee28956b1",
        "sendB": "486080f3e4161ee388b460f2ca0c85c1ba6b8c79133e55442b4a5623c48147fc"
      }
    }
  },
  "frozen/8000/137": {
    "pcm": "620b155f14cd30a97957e39f98d9bd7b9e37201f90c21fda67d596684d1b6a35",
    "meters": "0082a589e270693d2c21c2765bbce220ac49460c1baadb9d310c6557d6e52a49",
    "frozen": {
      "fingerprint": "freeze-1-9753e5e74dd847fb",
      "planes": {
        "main": "0b1663399da81e9aef892c68a37d82a9d9ada8573c3f213d9908131cab8b17ff",
        "sendA": "0b3a277516f751bb115f2ff0d112f9ebe1d97d8ef1d5d47fdeef1dbee28956b1",
        "sendB": "486080f3e4161ee388b460f2ca0c85c1ba6b8c79133e55442b4a5623c48147fc"
      }
    }
  }
} /* FROZEN-END */;
const clone = value => JSON.parse(JSON.stringify(value));
const digest = channels => { const h = createHash('sha256'); for (const data of channels) h.update(Buffer.from(data.buffer, data.byteOffset, data.byteLength)); return h.digest('hex'); };
function load(released = false) {
  const scope = { console, performance, Date, crypto: webcrypto, Blob, AbortController, setTimeout, clearTimeout, TextEncoder, TextDecoder, structuredClone };
  scope.window = scope; scope.globalThis = scope;
  scope.atob = text => Buffer.from(text, 'base64').toString('binary');
  scope.btoa = text => Buffer.from(text, 'binary').toString('base64');
  for (const file of FILES) {
    const local = file.startsWith('loom/') ? path.join(__dirname, file.slice(5)) : fs.existsSync(path.join(__dirname, file)) ? path.join(__dirname, file) : path.join(__dirname, '..', file);
    const source = released ? execFileSync('git', ['show', BASELINE + ':' + file], { cwd: path.join(__dirname, '..'), maxBuffer: 8 * 1024 ** 2 }).toString() : fs.readFileSync(local, 'utf8');
    Function('window', 'globalThis', 'crypto', 'atob', 'btoa', source)(scope, scope, scope.crypto, scope.atob, scope.btoa);
  }
  return { scope, S: scope.LoomSchema, DSP: scope.createLoomEngineDSP(scope.createLoomEffectsDSP, scope.createLoomLFODSP, scope.createLoomCPUProfiler, scope.createLoomTrackEQDSP, scope.createLoomMasteringDSP) };
}
const lane = (target, from, to, effectType) => ({ target, enabled: true, interpolation: 'linear', points: [{ beat: 0, value: from }, { beat: 4, value: to }], ...(effectType ? { effectType } : {}) });
function signal(frames, rate, track = 0) {
  return [0, 1].map(channel => Float32Array.from({ length: frames }, (_, i) => .025 * (Math.sin(2 * Math.PI * (channel ? 191 + track * 17 : 113 + track * 13) * i / rate) + .19 * Math.cos(2 * Math.PI * (channel ? 1733 : 839) * i / rate))));
}
function fixture(r, name, rate) {
  const { S } = r, s = S.defaultState(), frames = name === 'frozen' ? rate * 2 : 4099;
  s.tempo = 120; s.lengthBars = 1; s.loopStart = 0; s.loopEnd = 4; s.loopEnabled = false; s.recording.punchEnd = 4;
  for (const owner of [...s.tracks, ...s.returns, s.master]) { owner.effects.fill(null); owner.automation = []; owner.level = owner.id === 'master' ? .73 : .4; owner.mute = false; if ('pan' in owner) owner.pan = 0; }
  s.lfos.forEach(lfo => { lfo.enabled = false; lfo.routes = []; });
  for (const [index, track] of s.tracks.entries()) { track.instrumentLive = true; track.clips = []; track.level = .25 + index * .03; track.pan = -.6 + index * .12; track.sends = [0, 0]; track.sendPre = [false, false]; }
  const fx = (type, patch = {}) => S.effect({ type, params: { ...r.scope.LoomEffectsCatalog.find(d => d.id === type).defaults, ...patch } });
  if (name !== 'plain') {
    s.tracks[0].effects[0] = fx('prism', { low: 2, mid: -1, cutoff: 3300, filter: 'lowpass' });
    s.tracks[9].effects[0] = fx('vestige', { model: 'shimmer', decay: .4, predelay: 0, mix: .17 });
    s.tracks[4].effects[1] = fx('velvet', { threshold: -31, ratio: 5, makeup: -2 });
    s.tracks.forEach((track, i) => { track.sends = [.13 + i * .013, .2 - i * .011]; track.sendPre = [i % 2 === 0, i % 3 === 0]; });
    s.returns[0].effects[0] = fx('vestige', { decay: .4, predelay: 3, mix: 1 });
    s.returns[1].effects[0] = fx('parallax', { clock: 'free', time: 67, feedback: .21, mix: 1 });
    s.master.effects[0] = fx('velvet', { threshold: -27, ratio: 3, makeup: -3 });
    s.tracks[0].automation = [lane('pan', -.4, .5), lane('level', .21, .67), lane('send:0', .03, .35), lane('fx:0:cutoff', 1200, 5100, 'prism')];
    s.returns[0].automation = [lane('pan', -.2, .3)]; s.master.automation = [lane('level', .61, .79), lane('mastering:midGain', -.7, 1.3)];
    Object.assign(s.master.mastering, { enabled: true, eq: true, lowGain: 1.1, midGain: -.7, highGain: -.8 });
    Object.assign(s.lfos[0], { enabled: true, sync: false, rate: .71, routes: [{ id: 'legacy-pan-lfo', ownerId: 'track-10', target: 'pan', amount: .12, enabled: true }, { id: 'legacy-send-lfo', ownerId: 'track-1', target: 'send:1', amount: .05, enabled: true }, { id: 'legacy-master-lfo', ownerId: 'master', target: 'level', amount: .05, enabled: true }, { id: 'legacy-return-lfo', ownerId: 'return-2', target: 'pan', amount: .03, enabled: true }] });
  }
  if (name === 'return-solo') s.returns[0].solo = true;
  if (name === 'disabled') { s.tracks[2].disabled = true; s.tracks[5].mute = true; s.tracks[7].solo = true; }
  const assets = {};
  if (name === 'clips' || name === 'frozen') {
    s.tracks.forEach(track => { track.instrumentLive = false; });
    const source = signal(rate * 2, rate), asset = S.encodeAsset({ id: 'legacy-group-source', name: 'Existing take', sampleRate: rate, left: source[0], right: source[1] });
    s.assets = [asset]; Object.assign(assets, S.decodeAssets(s.assets));
    s.tracks[0].clips = [{ id: 'legacy-group-clip', name: 'Existing clip', type: 'audio', assetId: asset.id, start: 0, length: 4, sourceStart: 0, sourceEnd: 2, sourceOffset: 0, rate: 1, loop: false, reverse: false, gain: .8, fadeIn: 0, fadeOut: 0 }];
    if (name === 'clips') { s.loopEnabled = true; s.loopEnd = .25; s.tracks[9].clips = [{ ...s.tracks[0].clips[0], id: 'legacy-group-reverse', reverse: true, gain: .3, start: .04 }]; }
  }
  return { s, assets, frames, rate, live: !['clips', 'frozen'].includes(name) };
}
function freeze(r, f) {
  const core = new r.DSP.Core(f.s, f.assets, f.rate, { linear: true, freezeCaptureTrackId: 'track-1' }); core.start(0);
  const planes = Object.fromEntries(['main', 'sendA', 'sendB'].map(key => [key, [new Float32Array(f.frames), new Float32Array(f.frames)]]));
  for (let at = 0; at < f.frames; at += 137) {
    const n = Math.min(137, f.frames - at); core.processBlock(new Float32Array(n), new Float32Array(n));
    for (const key of Object.keys(planes)) for (let channel = 0; channel < 2; channel++) planes[key][channel].set(core.freezeCapture[key][channel], at);
  }
  const s = clone(f.s), chunk = { startFrame: 0, frames: f.frames, main: null, sendA: null, sendB: null }; s.freezeAssets = [];
  for (const key of Object.keys(planes)) { const asset = r.S.encodeFreezeAsset({ id: 'legacy-frozen-' + key.toLowerCase(), name: 'Existing frozen ' + key, sampleRate: f.rate, left: planes[key][0], right: planes[key][1] }); s.freezeAssets.push(asset); chunk[key] = asset.id; }
  const fingerprint = r.S.freezeFingerprint(s, 'track-1');
  s.tracks[0].freeze = { version: 1, sampleRate: f.rate, tempo: s.tempo, lengthBeats: 4, bodyFrames: f.frames, totalFrames: f.frames, tailFrames: 0, fingerprint, chunks: [chunk] };
  return { ...f, s, assets: r.S.decodeAssets(s.assets, s.freezeAssets), frozen: { fingerprint, planes: Object.fromEntries(Object.entries(planes).map(([key, pair]) => [key, digest(pair)])) } };
}
function render(r, name, rate, block, mode = 'off') {
  let f = fixture(r, name, rate); if (name === 'frozen') f = freeze(r, f);
  const core = new r.DSP.Core(f.s, f.assets, rate, { linear: true }); core.start(0);
  if (mode !== 'off') { core.setDiagnostics({ enabled: true, mode: 'light' }); if (mode === 'released') core.setDiagnostics({ enabled: false, release: true }); }
  const output = [new Float32Array(f.frames), new Float32Array(f.frames)], sources = f.live ? f.s.tracks.map((_, i) => signal(f.frames, rate, i)) : [];
  const events = name === 'changes' ? [[511, s => s.tracks[3].mute = true], [1001, s => s.tracks[4].solo = true], [1501, s => s.tracks[4].solo = false], [1801, s => s.returns[0].solo = true], [2201, s => s.returns[0].solo = false], [2701, s => s.tracks[9].disabled = true], [3103, s => s.tracks[9].disabled = false]] : [];
  let event = 0;
  for (let at = 0; at < f.frames;) {
    while (events[event]?.[0] === at) { f.s = clone(f.s); events[event++][1](f.s); core.setState(f.s); }
    const end = Math.min(f.frames, at + block, events[event]?.[0] ?? Infinity), inputs = sources.map(pair => pair.map(channel => channel.subarray(at, end)));
    core.processBlock(output[0].subarray(at, end), output[1].subarray(at, end), inputs); at = end;
  }
  for (const channel of output) for (const value of channel) assert(Number.isFinite(value), name + ' finite legacy output');
  const meters = core.getMeters(), retained = Object.fromEntries(['beat', 'playing', 'ended', 'tracks', 'returns', 'master', 'effects', 'returnEffects', 'masterEffects'].filter(key => meters[key] !== undefined).map(key => [key, meters[key]]));
  return { pcm: digest(output), meters: createHash('sha256').update(JSON.stringify(retained)).digest('hex'), ...(f.frozen ? { frozen: f.frozen } : {}) };
}
function cases() { return ['plain', 'rich', 'changes', 'return-solo', 'disabled', 'clips'].flatMap(name => [8000, 48000].flatMap(rate => [128, 137].map(block => ({ name, rate, block })))).concat([128, 137].map(block => ({ name: 'frozen', rate: 8000, block }))); }
function run() {
  const record = process.argv.includes('--record-baseline'), r = load(record), result = {};
  for (const item of cases()) {
    const key = item.name + '/' + item.rate + '/' + item.block, expected = record ? null : GOLDENS[key];
    if (!record) assert(expected, 'Missing immutable case ' + key);
    const modes = record ? ['off'] : ['off', 'light', 'released'];
    for (const mode of modes) { const actual = render(r, item.name, item.rate, item.block, mode); if (record) result[key] = actual; else assert.deepEqual(actual, expected, key + '/' + mode + ' differs from pre-group-bus PCM/meters/freeze'); }
  }
  if (record) {
    const source = fs.readFileSync(__filename, 'utf8').replace(/\/\* FROZEN-BEGIN \*\/[\s\S]*?\/\* FROZEN-END \*\//, '/* FROZEN-BEGIN */ ' + JSON.stringify(result, null, 2) + ' /* FROZEN-END */'); fs.writeFileSync(__filename, source);
    console.log('Recorded ' + Object.keys(result).length + ' immutable cases from ' + BASELINE); return;
  }
  const cached = freeze(r, fixture(r, 'frozen', 8000)), old = clone(cached.s);
  delete old.buses; old.tracks.forEach(track => { delete track.output; });
  const restored = r.S.parseProject(JSON.stringify({ format: 'loom-project', formatVersion: 1, appVersion: '1.40.0', state: old }));
  assert(r.S.freezeValid(restored, 'track-1'), 'A complete pre-bus frozen project remains valid after migration');
  assert.equal(restored.tracks[0].freeze.fingerprint, GOLDENS['frozen/8000/128'].frozen.fingerprint);
  assert(restored.tracks.every(track => track.output === 'master'), 'Old tracks keep their direct Master route');
  assert.equal(restored.buses.length, 2);
  restored.tracks[0].output = 'bus-1'; restored.buses[0].level = .31;
  assert(r.S.freezeValid(restored, 'track-1'), 'Downstream group routing and level do not invalidate a per-track cache');
  console.log('PASS ' + cases().length * 3 + ' exact pre-group-bus stereo PCM/meter/freeze cases; default direct routing, old sends, solo, disabled tracks, live changes and clip loops');
  console.log('PASS Immutable pre-bus freeze project migration and downstream-only routing changes');
}
if (require.main === module) { try { run(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; } }
module.exports = { BASELINE, load, fixture, render, cases };
