'use strict';
/* Batch import safety uses real PCM WAV fixtures and injected browser-decoder
 * expansions. No audio context or wall-clock performance threshold is needed. */
const assert = require('node:assert/strict');
require('./engine.js');
const S = global.BatterSchema, Engine = global.BatterEngine;
const checks = [];
const test = (name, run) => checks.push({ name, run });
function wav({ frames = 16, channels = 1, rate = 8000, value = 2048 } = {}) {
  const buffer = new ArrayBuffer(44 + frames * channels * 2), view = new DataView(buffer);
  const text = (at, value) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, frames * channels * 2, true);
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) view.setInt16(44 + (i * channels + c) * 2, c ? -value : value, true);
  return buffer;
}
function file(name, bytes = wav(), read = () => {}) { return { name, size: bytes.byteLength, async arrayBuffer() { read(); return bytes.slice(0); } }; }
function asset(id, frames = 16) {
  const left = new Float32Array(frames).fill(.125);
  return S.encodeAsset({ left, right: left, channels: 1, sampleRate: 192000 }, { id, name: id });
}
function state() {
  const s = S.defaultState();
  s.assets = [asset('retained')]; s.lanes[0].sampleId = 'retained'; s.lanes[0].sampleIds = ['retained'];
  s.lanes[0].start = .125; s.lanes[0].end = .75;
  return s;
}
function retained(engine) {
  return { state: JSON.stringify(engine.getState()), generation: engine.generation,
    audio: [...engine.audio.entries()], metadata: [...engine.metadata.entries()], processed: [...engine.processed.entries()] };
}
function unchanged(engine, before) {
  assert.equal(JSON.stringify(engine.getState()), before.state, 'Failed import changed the recipe');
  assert.equal(engine.generation, before.generation, 'Failed import consumed a generation');
  assert.deepEqual([...engine.audio.entries()], before.audio, 'Failed import changed active audio');
  assert.deepEqual([...engine.metadata.entries()], before.metadata, 'Failed import changed metadata');
  assert.deepEqual([...engine.processed.entries()], before.processed, 'Failed import changed processed sample histories');
  assert.equal(engine.importing, false);
}

test('Real stereo files retain independent paths, duplicate basename labels and PCM through a layer import', async () => {
  const e = new Engine(state()), bytes = wav({ channels: 2 });
  await e.importFiles([file('strike.WAV', bytes), file('strike.WAV', bytes)], { laneId: 'kick', mode: 'layers', appendLayers: false,
    paths: ['Kit/Kicks/strike.WAV', 'Kit/Snares/strike.WAV'] });
  const added = e.state.assets.slice(1);
  assert.deepEqual(added.map(a => a.originalPath), ['Kit/Kicks/strike.WAV', 'Kit/Snares/strike.WAV']);
  assert.deepEqual(added.map(a => a.name), ['Kit/Kicks/strike', 'Kit/Snares/strike']);
  assert.notEqual(added[0].id, added[1].id); assert.deepEqual(e.state.lanes[0].sampleIds, added.map(a => a.id));
  for (const a of added) { const audio = e.getSampleAudio(a.id); assert.equal(audio.channels, 2); assert.equal(audio.left[8], .0625); assert.equal(audio.right[8], -.0625); }
  await e.dispose();
});
test('Ordinary imports retain their existing names, trim reset and distinct assets without folder metadata', async () => {
  const e = new Engine(state());
  await e.importFiles([file('Hit.wav'), file('Hit.wav')], { laneId: 'kick', mode: 'layers', appendLayers: false });
  assert.deepEqual(e.state.assets.slice(1).map(a => a.name), ['Hit', 'Hit']);
  assert(e.state.assets.slice(1).every(a => !Object.hasOwn(a, 'originalPath')));
  assert.equal(e.state.lanes[0].start, 0); assert.equal(e.state.lanes[0].end, 1);
  await e.dispose();
});
test('Separate lanes start at the chosen lane and source B appends preserve source A edits', async () => {
  const e = new Engine(state()), original = e.getState().lanes[0];
  await e.importFiles([file('Rim.wav'), file('Hat.wav')], { laneId: 'snare', mode: 'lanes' });
  assert.equal(e.state.lanes[1].name, 'Rim'); assert.equal(e.state.lanes[2].name, 'Hat');
  await e.importFiles([file('Layer1.wav')], { laneId: 'kick', source: 'b', mode: 'layers', appendLayers: false });
  const oldB = e.state.lanes[0].blend.sampleIds[0];
  await e.importFiles([file('Layer2.wav')], { laneId: 'kick', source: 'b', mode: 'layers', appendLayers: true });
  assert.equal(e.state.lanes[0].sampleId, original.sampleId); assert.equal(e.state.lanes[0].start, original.start); assert.equal(e.state.lanes[0].end, original.end);
  assert.equal(e.state.lanes[0].blend.enabled, true); assert.equal(e.state.lanes[0].blend.sampleIds.length, 2); assert.equal(e.state.lanes[0].blend.sampleIds[0], oldB);
  await e.dispose();
});
test('Destination, mode, remaining lanes and batch count reject before reading or decoding any file', async () => {
  for (const [count, options, message] of [
    [1, { laneId: 'unknown' }, /destination/], [1, { laneId: 'kick', source: 'c' }, /source A or B/],
    [1, { laneId: 'kick', mode: 'mystery' }, /Replace, Layers/], [1, { laneId: 'kick', appendLayers: 'yes' }, /append/],
    [2, { laneId: 'percussion', mode: 'lanes' }, /remaining lanes/],
    [2, { laneId: 'kick', mode: 'replace' }, /batch/], [1, { laneId: 'kick', mode: 'lanes', source: 'b' }, /single sample or a layer group/],
    [129, { laneId: 'kick', mode: 'layers' }, /128/]
  ]) {
    const e = new Engine(state()), before = retained(e); let reads = 0, decodes = 0;
    e.decode = async () => { decodes++; throw Error('Unexpected decode'); };
    await assert.rejects(e.importFiles(Array.from({ length: count }, (_, i) => file(i + '.wav', wav(), () => reads++)), options), message);
    assert.equal(reads, 0); assert.equal(decodes, 0); unchanged(e, before); await e.dispose();
  }
});
test('Append overflow rejects atomically on both sources while replacing a full layer group remains available', async () => {
  for (const source of ['a', 'b']) {
    const s = state(); s.assets = Array.from({ length: 128 }, (_, i) => asset('old-' + i));
    const lane = source === 'a' ? s.lanes[0] : s.lanes[0].blend;
    lane.sampleIds = s.assets.map(a => a.id); lane.sampleId = lane.sampleIds[0];
    if (source === 'b') { s.lanes[0].sampleIds = [s.assets[0].id]; s.lanes[0].sampleId = s.assets[0].id; }
    const e = new Engine(s), before = retained(e); let reads = 0;
    await assert.rejects(e.importFiles([file('new.wav', wav(), () => reads++)], { laneId: 'kick', source, mode: 'layers', appendLayers: true }), /128 sample layers/);
    assert.equal(reads, 0); unchanged(e, before);
    await e.importFiles([file('new.wav')], { laneId: 'kick', source, mode: 'layers', appendLayers: false });
    assert.equal((source === 'a' ? e.state.lanes[0] : e.state.lanes[0].blend).sampleIds.length, 1);
    await e.dispose();
  }
});
test('The 256-asset cupboard limit is checked before file reads and retained samples remain intact', async () => {
  const s = state(); s.assets = Array.from({ length: 256 }, (_, i) => asset('asset-' + i)); s.lanes[0].sampleId = 'asset-0'; s.lanes[0].sampleIds = ['asset-0'];
  const e = new Engine(s), before = retained(e); let reads = 0;
  await assert.rejects(e.importFiles([file('extra.wav', wav(), () => reads++)], { laneId: 'kick' }), /256/);
  assert.equal(reads, 0); unchanged(e, before); await e.dispose();
});
test('Malformed folder metadata rejects before reads, and relative Windows separators normalize for storage', async () => {
  for (const paths of [[], ['a.wav', 'b.wav'], [null], [''], ['../a.wav'], ['/a.wav'], ['C:\\a.wav'], ['a\u0000.wav'], ['a'.repeat(501)]]) {
    const e = new Engine(state()), before = retained(e); let reads = 0;
    await assert.rejects(e.importFiles([file('a.wav', wav(), () => reads++)], { laneId: 'kick', paths }), /relative sample path/);
    assert.equal(reads, 0); unchanged(e, before); await e.dispose();
  }
  const e = new Engine(state()); await e.importFiles([file('hat.WAV')], { laneId: 'kick', paths: ['Kit\\Hats\\hat.WAV'] });
  assert.equal(e.state.assets.at(-1).originalPath, 'Kit/Hats/hat.WAV'); assert.equal(e.state.assets.at(-1).name, 'hat'); await e.dispose();
});
test('Abort before import or during pending file I/O retains recipe, caches and the import lock', async () => {
  const e = new Engine(state()), before = retained(e), controller = new AbortController(); let release;
  const pending = { name: 'Waiting.wav', size: 76, arrayBuffer: () => new Promise(resolve => release = resolve) };
  const importing = e.importFiles([pending], { laneId: 'kick', signal: controller.signal }); controller.abort(); release(wav());
  await assert.rejects(importing, error => error.name === 'AbortError'); unchanged(e, before);
  await assert.rejects(e.importFiles([file('ignored.wav')], { laneId: 'kick', signal: controller.signal }), error => error.name === 'AbortError'); unchanged(e, before);
  await e.importFiles([file('after-cancel.wav')], { laneId: 'kick' }); assert.equal(e.state.assets.at(-1).name, 'after-cancel'); await e.dispose();
});
test('Changing the instrument during asynchronous reads retains the newer edits and never imports into them', async () => {
  const e = new Engine(state()); let release;
  const pending = { name: 'Waiting.wav', size: 76, arrayBuffer: () => new Promise(resolve => release = resolve) };
  const importing = e.importFiles([pending], { laneId: 'kick' }); e.setState({ ...e.getState(), name: 'Newer project edits' });
  const afterEdit = retained(e); release(wav()); await assert.rejects(importing, /instrument changed/); unchanged(e, afterEdit); await e.dispose();
});
test('Concurrent imports are rejected without unlocking or altering the first pending batch', async () => {
  const e = new Engine(state()), before = retained(e), controller = new AbortController(); let release;
  const first = e.importFiles([{ name: 'First.wav', size: 76, arrayBuffer: () => new Promise(resolve => release = resolve) }], { laneId: 'kick', signal: controller.signal });
  await assert.rejects(e.importFiles([file('Second.wav')], { laneId: 'snare' }), /already in progress/); assert.equal(e.importing, true);
  controller.abort(); release(wav()); await assert.rejects(first, error => error.name === 'AbortError'); unchanged(e, before); await e.dispose();
});
test('Decoded byte accounting includes existing assets and stops a compressed expansion at the first excess', async () => {
  const s = state(); s.assets.push(asset('stored-large', 2 * 1024 * 1024)); // 8 MiB decoded, not assigned.
  const e = new Engine(s), before = retained(e), large = new Float32Array(30 * 1024 * 1024 / 4); let decodes = 0, reads = 0;
  e.decode = async (_, name) => { decodes++; return { left: large, right: large, channels: 1, sampleRate: 192000, name }; };
  await assert.rejects(e.importFiles(Array.from({ length: 3 }, (_, i) => file(i + '.mp3', wav(), () => reads++)), { laneId: 'kick', mode: 'layers', appendLayers: false }), /64 MB decoded/);
  assert.equal(decodes, 2, 'Existing 8 MiB plus two decoded 30 MiB files must exceed the budget'); assert.equal(reads, 2, 'A third compressed file must not be read');
  unchanged(e, before); await e.dispose();
});
test('A corrupt later file or malformed direct commit cannot install a partial batch', async () => {
  const e = new Engine(state()), before = retained(e);
  await assert.rejects(e.importFiles([file('valid.wav'), file('corrupt.wav', new Uint8Array([1, 2, 3]).buffer)], { laneId: 'kick', mode: 'layers', appendLayers: false }));
  unchanged(e, before);
  assert.throws(() => e.commitImported([{ ...asset('bad'), frames: 1, pcm: 'AAAA' }], { laneId: 'kick' }), /invalid PCM/);
  unchanged(e, before); await e.dispose();
});
test('Folder provenance and imported audio survive portable project Save/Open exactly', async () => {
  const e = new Engine(state());
  await e.importFiles([file('snap.wav'), file('snap.wav')], { laneId: 'kick', source: 'b', mode: 'layers', appendLayers: false,
    paths: ['Samples/Snare/snap.wav', 'Samples/Percussion/snap.wav'] });
  const project = await e.getProject(), restored = new Engine(S.defaultState()); await restored.loadProject(project);
  assert.equal(project.appVersion, S.VERSION); assert.equal(S.VERSION, '1.4.0');
  assert.deepEqual(restored.state.assets, e.state.assets); assert.deepEqual(restored.state.lanes, e.state.lanes);
  for (const id of e.referencedIds()) { assert.deepEqual(restored.getSampleAudio(id).left, e.getSampleAudio(id).left); assert.deepEqual(restored.getSampleAudio(id).right, e.getSampleAudio(id).right); }
  await e.dispose(); await restored.dispose();
});
(async () => { for (const check of checks) { await check.run(); console.log('PASS ' + check.name); } console.log(checks.length + ' BATTER batch import groups passed.'); })()
  .catch(error => { console.error(error); process.exitCode = 1; });
