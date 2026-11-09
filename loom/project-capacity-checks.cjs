'use strict';
/* Portable project capacity, exact UTF-8 boundaries and an optional real large
 * frozen project. Run the normal checks with node loom/project-capacity-checks.cjs.
 * Run --large or --source-large alone in an exclusive window; large portable
 * round-trips can use about 1–2 GiB of heap.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto, createHash } = require('node:crypto');
const MiB = 1024 * 1024;
const source = fs.readFileSync(path.join(__dirname, 'schema.js'), 'utf8');
function loadSchema(limit, audioLimits = {}) {
  const scope = { Blob, console, crypto: webcrypto, btoa: value => Buffer.from(value, 'binary').toString('base64'), atob: value => Buffer.from(value, 'base64').toString('binary') };
  scope.window = scope; scope.globalThis = scope; vm.createContext(scope);
  // Scale only the capacity constant for exact boundary regressions. Executing
  // the production parser/serializer avoids allocating 448 MiB for each edge.
  const field = 'projectBytes: 448 * 1024 * 1024';
  assert.equal(source.split(field).length, 2, 'The test patches only the file-size constant');
  let script = limit === undefined ? source : source.replace(field, 'projectBytes: ' + limit);
  for (const [key, value] of Object.entries(audioLimits)) {
    const original = key + ': ' + ({ pcmBytes: 256, freezePcmBytes: 192, totalPcmBytes: 256 }[key]) + ' * 1024 * 1024';
    assert.equal(script.split(original).length, 2, 'The test patches only the requested PCM constant');
    assert(Number.isSafeInteger(value) && value > 0);
    script = script.replace(original, key + ': ' + value);
  }
  vm.runInContext(script, scope, { filename: 'schema.js' });
  return { S: scope.LoomSchema, scope };
}
const { S } = loadSchema();
const passed = [];
function check(name, run) { run(); passed.push(name); console.log('PASS ' + name); }
const utf8 = value => Buffer.byteLength(value, 'utf8');
function musicalState(schema = S) {
  const state = schema.defaultState();
  state.name = 'A café beside the 音楽 🍲';
  state.tracks[0].instrument = { id: 'roux', name: 'ROUX', snapshot: { format: 'loom-instrument-state', version: 1, app: 'roux', state: { name: '膨らむ音', payload: 'é漢\ud800🍳\udfff' }, storage: {} } };
  return state;
}
function lightChecks() {
  check('256 MiB source capacity shares the original total audio pool without raising the portable or snapshot caps', () => {
    assert.equal(S.LIMITS.projectBytes, 448 * MiB);
    assert.equal(S.LIMITS.pcmBytes, 256 * MiB);
    assert.equal(S.LIMITS.freezePcmBytes, 192 * MiB);
    assert.equal(S.LIMITS.totalPcmBytes, 256 * MiB);
    assert.equal(S.LIMITS.snapshotBytes, 96 * MiB);
    assert.equal(S.LIMITS.assetSeconds, 120);
  });
  check('Shared audio accounting counts unused sources and frozen caches without decoding or modifying PCM', () => {
    const state = S.defaultState();
    state.assets = [sourceAsset('first', 3), sourceAsset('unused', 5)];
    state.freezeAssets = [freezeAsset('cached', 7)];
    const before = JSON.stringify(state), original = state.assets[0].pcm;
    const { S: isolated, scope } = loadSchema(); scope.atob = () => { throw Error('Capacity accounting must not decode PCM'); };
    const value = isolated.audioCapacity(state), totalBytes = 32 + 56;
    assert.equal(value.sourceBytes, 32); assert.equal(value.freezeBytes, 56); assert.equal(value.totalBytes, totalBytes);
    assert.equal(value.sourceAvailableBytes, 256 * MiB - totalBytes);
    assert.equal(value.freezeAvailableBytes, 192 * MiB - 56);
    assert.equal(JSON.stringify(state), before); assert.equal(state.assets[0].pcm, original);
  });
  check('Scaled source and shared PCM boundaries are inclusive and both growth paths consume one pool', () => {
    const schema = loadSchema(undefined, { pcmBytes: 80, freezePcmBytes: 64, totalPcmBytes: 80 }).S;
    const sourceOnly = schema.defaultState(); sourceOnly.assets = [sourceAsset('full', 20)];
    assert.equal(schema.normalize(sourceOnly).assets[0].frames, 20);
    assert.equal(schema.audioCapacity(sourceOnly).sourceAvailableBytes, 0);
    assert.equal(schema.audioCapacity(sourceOnly).freezeAvailableBytes, 0);
    sourceOnly.assets = [sourceAsset('over', 21)];
    assert.throws(() => schema.normalize(sourceOnly), /source audio budget/);
    assert.equal(schema.audioCapacity(sourceOnly).sourceAvailableBytes, 0);
    const shared = schema.defaultState(); shared.assets = [sourceAsset('source', 8)]; shared.freezeAssets = [freezeAsset('cache', 6)];
    assert.equal(schema.normalize(shared).freezeAssets.length, 1);
    assert.equal(schema.audioCapacity(shared).totalBytes, 80);
    assert.equal(schema.audioCapacity(shared).sourceAvailableBytes, 0);
    assert.equal(schema.audioCapacity(shared).freezeAvailableBytes, 0);
    shared.assets.push(sourceAsset('one-source-frame', 1));
    assert.throws(() => schema.normalize(shared), /shared 256 MiB audio budget/);
    shared.assets.pop(); shared.freezeAssets.push(freezeAsset('one-frozen-frame', 1));
    assert.throws(() => schema.normalize(shared), /shared 256 MiB audio budget/);
    shared.freezeAssets = [freezeAsset('freeze-full', 8)]; shared.assets = [];
    assert.equal(schema.normalize(shared).freezeAssets.length, 1);
    assert.equal(schema.audioCapacity(shared).freezeAvailableBytes, 0);
    assert.equal(schema.audioCapacity(shared).sourceAvailableBytes, 16);
    shared.freezeAssets.push(freezeAsset('over-freeze-cap', 1));
    assert.throws(() => schema.normalize(shared), /freeze budget/);
  });
  check('Exact UTF-8 sizing matches actual downloaded Blob sizes for ASCII Unicode and surrogate edges', () => {
    const values = ['', 'plain ASCII\n\0', 'éø\u07ff', '漢\u0800\uffff', '🍳🎚️', '\ud800', '\udfff', '\ud800x\udfff', '\ud800\ud800\udfff\udfff', 'A'.repeat(2 * MiB)];
    let seed = 81236;
    for (let trial = 0; trial < 80; trial++) {
      let text = '';
      for (let char = 0; char < 400; char++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; text += String.fromCharCode(seed >>> 16); }
      values.push(text);
    }
    for (const value of values) {
      assert.equal(S.projectByteLength(value), utf8(value));
      assert.equal(S.projectByteLength(value), new Blob([value]).size);
    }
    assert.throws(() => S.projectByteLength(null), /string/i);
  });
  check('Unicode instrument states save and reopen with the same bytes and musical data', () => {
    const state = musicalState(), json = S.serializeProject(state), reopened = S.parseProject(json);
    assert.equal(S.projectByteLength(json), new Blob([json]).size);
    assert.equal(S.serializeProject(reopened), json);
    assert.equal(reopened.tracks[0].instrument.snapshot.state.payload, state.tracks[0].instrument.snapshot.state.payload);
    assert.equal(reopened.name, state.name);
  });
  check('Save and Open accept the exact UTF-8 boundary and reject one byte beyond it', () => {
    const state = musicalState(), json = S.serializeProject(state), bytes = utf8(json);
    assert(json.length < bytes, 'This fixture catches UTF-16 length being mistaken for file bytes');
    const exact = loadSchema(bytes).S, short = loadSchema(bytes - 1).S;
    assert.equal(exact.serializeProject(state), json);
    assert.equal(exact.serializeProject(exact.parseProject(json)), json);
    assert.throws(() => exact.parseProject(json + ' '), /448 MiB/);
    assert.throws(() => short.serializeProject(state), /448 MiB/);
    assert.throws(() => short.parseProject(json), /448 MiB/);
    assert.throws(() => exact.parseProject({}), /448 MiB/);
    assert.throws(() => exact.parseProject('{bad JSON}'), /valid JSON/i);
  });
  check('ASCII limits are inclusive and a browser string-cap failure gives the project-size error', () => {
    const state = S.defaultState(), json = S.serializeProject(state), exact = loadSchema(json.length + 4).S;
    assert.equal(exact.parseProject(json + '    ').tracks.length, 10);
    assert.throws(() => exact.parseProject(json + '     '), /448 MiB/);
    const { S: limited, scope } = loadSchema();
    vm.runInContext('JSON.stringify = () => { throw new RangeError("Invalid string length"); };', scope);
    assert.throws(() => limited.serializeProject(state), /448 MiB file limit/);
  });
}
function zeroBase64(bytes) { return 'A'.repeat(Math.floor(bytes / 3) * 4) + ['', 'AA==', 'AAA='][bytes % 3]; }
function sourceAsset(id, frames) { return { id, name: id, sampleRate: 48000, channels: 2, frames, duration: frames / 48000, pcm: zeroBase64(frames * 4) }; }
function freezeAsset(id, frames) { return { id, name: id, encoding: 'float32le', sampleRate: 48000, channels: 2, frames, duration: frames / 48000, pcm: zeroBase64(frames * 8) }; }
function sourceLargeCheck() {
  check('A real 80 MiB source recording project saves and reopens with every PCM byte unchanged', () => {
    const state = S.defaultState(), frames = 4 * MiB, bytes = Buffer.alloc(frames * 4);
    bytes.writeInt16LE(12345, 0); bytes.writeInt16LE(-23456, 2); bytes.writeInt16LE(3210, bytes.length - 4); bytes.writeInt16LE(-4321, bytes.length - 2);
    const pcm = bytes.toString('base64');
    for (let index = 0; index < 5; index++) {
      const asset = { id: 'source-' + index, name: 'Recorded source ' + (index + 1), sampleRate: 48000, channels: 2, frames, duration: frames / 48000, pcm }; state.assets.push(asset);
      state.tracks[index].clips = [{ id: 'source-clip-' + index, name: asset.name, type: 'audio', assetId: asset.id, start: 0, length: 4, sourceStart: 0, sourceEnd: asset.duration, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: 1, fadeIn: 0, fadeOut: 0 }];
    }
    assert.equal(S.audioCapacity(state).sourceBytes, 80 * MiB);
    const json = S.serializeProject(state), reopened = S.parseProject(json);
    assert.equal(reopened.assets.length, 5); assert(S.projectByteLength(json) < S.LIMITS.projectBytes);
    for (const asset of reopened.assets) assert.equal(asset.pcm, pcm);
    assert.deepEqual(reopened.tracks.slice(0, 5).map(track => track.clips[0].assetId), state.tracks.slice(0, 5).map(track => track.clips[0].assetId));
    const decoded = S.decodeAsset(reopened.assets[0]);
    assert.equal(decoded.left[0], 12345 / 32768); assert.equal(decoded.right[0], -23456 / 32768);
    assert.equal(decoded.left.at(-1), 3210 / 32768); assert.equal(decoded.right.at(-1), -4321 / 32768);
    console.log('SOURCE LARGE ' + JSON.stringify({ sourcePcmBytes: S.audioCapacity(reopened).sourceBytes, projectBytes: S.projectByteLength(json), sourceAssets: reopened.assets.length, pcmSHA256: createHash('sha256').update(pcm).digest('hex') }));
  });
}
function largeFixture(schema = S) {
  const state = schema.defaultState(), sampleRate = 48000, sourceFrames = 2 * MiB;
  state.name = 'Large frozen recording project'; state.tempo = 120; state.lengthBars = 64; state.loopEnd = 256;
  const asset = { id: 'recording-source', name: 'Recorded source', sampleRate, channels: 2, frames: sourceFrames, duration: sourceFrames / sampleRate, pcm: zeroBase64(sourceFrames * 4) };
  state.assets = [asset]; state.freezeAssets = [];
  const bodyFrames = 128 * sampleRate, chunkFrames = 10 * sampleRate, pcm = new Map();
  for (let trackIndex = 0; trackIndex < 4; trackIndex++) {
    const track = state.tracks[trackIndex];
    track.clips = [{ id: 'recording-clip-' + trackIndex, name: 'Recorded part', type: 'audio', assetId: asset.id, start: 0, length: 32, sourceStart: 0, sourceEnd: asset.duration, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: 1, fadeIn: .01, fadeOut: .01 }];
    const chunks = [];
    for (let startFrame = 0; startFrame < bodyFrames; startFrame += chunkFrames) {
      const frames = Math.min(chunkFrames, bodyFrames - startFrame), id = 'frozen-' + trackIndex + '-' + startFrame;
      if (!pcm.has(frames)) pcm.set(frames, zeroBase64(frames * 8));
      state.freezeAssets.push({ id, name: 'Frozen recording', encoding: 'float32le', sampleRate, channels: 2, frames, duration: frames / sampleRate, pcm: pcm.get(frames) });
      chunks.push({ startFrame, frames, main: id, sendA: null, sendB: null });
    }
    track.freeze = { version: 1, sampleRate, tempo: state.tempo, lengthBeats: 256, bodyFrames, totalFrames: bodyFrames, tailFrames: 0, fingerprint: schema.freezeFingerprint(state, track.id), chunks };
  }
  return state;
}
function largeCheck() {
  check('A real project above 256 MiB saves and reopens with all original PCM and valid reversible freezes', () => {
    const state = largeFixture(), json = S.serializeProject(state), bytes = S.projectByteLength(json);
    assert(bytes > 256 * MiB && bytes < S.LIMITS.projectBytes);
    const reopened = S.parseProject(json);
    assert.equal(reopened.assets.length, 1); assert.equal(reopened.freezeAssets.length, 52);
    assert.equal(reopened.assets[0].pcm, state.assets[0].pcm);
    for (const track of reopened.tracks.slice(0, 4)) assert.equal(S.freezeValid(reopened, track.id), true);
    const serialized = S.serializeProject(reopened);
    assert.equal(serialized, json);
    const sha256 = createHash('sha256').update(json).digest('hex');
    console.log('LARGE ' + JSON.stringify({ bytes, MiB: bytes / MiB, sourcePcmBytes: state.assets[0].frames * 4, freezePcmBytes: state.freezeAssets.reduce((sum, asset) => sum + asset.frames * 8, 0), chunks: reopened.freezeAssets.length, sha256 }));
    if (process.env.PROJECT_CAPACITY_LARGE_FILE) fs.writeFileSync(process.env.PROJECT_CAPACITY_LARGE_FILE, json);
  });
}
if (require.main === module) {
  try { if (process.argv.includes('--large')) largeCheck(); else if (process.argv.includes('--source-large')) sourceLargeCheck(); else lightChecks(); console.log(passed.length + ' project capacity groups passed.'); }
  catch (error) { console.error(error); process.exitCode = 1; }
}
module.exports = { loadSchema, largeFixture };
