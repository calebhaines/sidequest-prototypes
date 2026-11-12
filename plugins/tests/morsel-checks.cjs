'use strict';
// --prepare-default runs the real bundled neural/Signalsmith browser pipeline.
// --prepare-word zucchini additionally verifies a new word, cache pruning and
// restored native playback across all four voices without retaining a bank.
// The ordinary checks consume that real bank without a browser or neural worker.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const generated = path.join(root, 'plugins/generated');
const at = process.argv.indexOf('--bank');
const bankFile = at >= 0 ? path.resolve(process.argv[at + 1]) : [path.join(root, 'plugins/assets/morsel/morsel-bank.json.gz'), path.join(generated, 'morsel-bank.json.gz'), path.join(generated, 'morsel-bank.json')].find(name => fs.existsSync(name));
const digest = data => createHash('sha256').update(data).digest('hex');
function loadBank(file) { if (!file) throw Error('Prepare the actual MORSEL bank first: node plugins/tests/morsel-checks.cjs --prepare-default'); const bytes = fs.readFileSync(file); return JSON.parse((file.endsWith('.gz') ? zlib.gunzipSync(bytes) : bytes).toString('utf8')); }
async function prepareDefault(word) {
  const module = process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
  const { chromium } = require(module), html = fs.readFileSync(path.join(root, 'morsel/index.html'));
  const helper = fs.readFileSync(path.join(root, 'plugins/js/morsel-preparation.js'), 'utf8');
  const server = http.createServer((request, response) => {
    if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const errors = []; let arbitraryBank;
  try {
    const page = await browser.newPage(); page.setDefaultTimeout(120000);
    if (process.argv.includes('--legacy-stream')) await page.addInitScript(() => {
      const OriginalBlob = window.Blob; window.__legacyStreamWorkers = 0;
      function LegacyBlob(parts, options) {
        const chunks = Array.from(parts || []);
        if (chunks.some(part => typeof part === 'string' && part.includes('const trimNeuralPadding=') && part.includes('function runWorker'))) {
          chunks.unshift('delete ReadableStream.prototype[Symbol.asyncIterator];\n'); window.__legacyStreamWorkers++;
        }
        return new OriginalBlob(chunks, options);
      }
      LegacyBlob.prototype = OriginalBlob.prototype; Object.setPrototypeOf(LegacyBlob, OriginalBlob); window.Blob = LegacyBlob;
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.exposeFunction('nativeBankProgress', (done, total) => console.log('MORSEL PREPARING', Math.round(done), '/', total));
    await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.MorselApp?.engine && window.MorselSpeech);
    await page.addScriptTag({ content: helper });
    const result = await page.evaluate(async word => {
      const recipe = MorselSchema.defaultState();
      if (word) { recipe.lyric = word; recipe.steps.forEach(step => { step.on = false; }); }
      const bank = await KitchenMorselPreparation.prepareBank({ audio: MorselApp.engine, state: recipe, tempos: word ? [recipe.tempo] : [60, 90, 96, 100, 110, 120, 128, 140, 160, 180], onProgress: (done, total) => nativeBankProgress(done, total) });
      window.nativePreparedBank = bank;
      if (word) {
        // A second preparation with a changed duration must discard obsolete
        // fits, rather than retain successive 196-key banks forever.
        window.nativePreparedBank = await KitchenMorselPreparation.prepareBank({ audio: MorselApp.engine, state: recipe, keyboardDuration: .65 });
        if (MorselApp.engine.noteCache.size !== nativePreparedBank.notes.length || MorselApp.engine.noteBytes !== nativePreparedBank.noteBytes) throw Error('Obsolete MORSEL note fits remained after preparing an edited keyboard.');
      }
      const prepared = window.nativePreparedBank;
      return { words: prepared.words.length, notes: prepared.notes.length, noteBytes: prepared.noteBytes, wordBytes: prepared.wordBytes, key: prepared.key, backend: prepared.backend, modelHash: prepared.modelHash };
    }, word || null);
    const json = await page.evaluate(() => JSON.stringify(nativePreparedBank));
    if (process.argv.includes('--legacy-stream')) assert.equal(await page.evaluate(() => window.__legacyStreamWorkers), 1, 'The real neural worker must exercise the missing ReadableStream iterator compatibility path.');
    const compressed = zlib.gzipSync(Buffer.from(json), { level: 9, mtime: 0 });
    const report = { ...result, sourceHTMLSHA256: digest(html), jsonBytes: Buffer.byteLength(json), gzipBytes: compressed.length, jsonSHA256: digest(Buffer.from(json)), gzipSHA256: digest(compressed), errors };
    if (word) arbitraryBank = JSON.parse(json);
    else {
      fs.mkdirSync(generated, { recursive: true });
      const target = path.join(generated, 'morsel-bank.json');
      fs.writeFileSync(target, json); fs.writeFileSync(target + '.gz', compressed);
      fs.writeFileSync(path.join(generated, 'morsel-bank-report.json'), JSON.stringify(report, null, 2) + '\n');
    }
    assert.equal(errors.length, 0); console.log('MORSEL BANK', JSON.stringify(report));
    await page.evaluate(async () => { await MorselApp.engine.dispose(); MorselSpeech.dispose(); });
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
  if (word) {
    install(); const recipe = { ...MorselSchema.defaultState(), lyric: word, space: 0, air: 0, vibrato: 0 }; recipe.steps.forEach(step => { step.on = false; });
    const evidence = [];
    for (const voice of ['alto', 'tenor', 'bass', 'robot']) {
      const persisted = JSON.parse(JSON.stringify({ recipe: { ...recipe, voice }, bank: arbitraryBank, followHost: false }));
      const adapter = KitchenMorselPlugin.create('morsel', 48000, persisted);
      try {
        for (const pitch of [36, 60, 84]) assert(adapter.noteOn({ pitch, velocity: .8, channel: 0, id: pitch, frame: 0 }));
        const output = processFrames(adapter, 48000, { blocks: [17, 31, 64, 43, 127, 3] }), measured = stats(output.left);
        assert(measured.rms > .0001, voice + ': ' + JSON.stringify(measured)); evidence.push({ voice, ...measured, sha256: digest(Buffer.from(output.left.buffer)) });
      } finally { adapter.dispose(); }
    }
    assert.equal(new Set(evidence.map(row => row.sha256)).size, 4);
    const directory = '/tmp/kitchen-morsel-native'; fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'arbitrary-word-report.json'), JSON.stringify({ word, backend: arbitraryBank.backend, modelHash: arbitraryBank.modelHash, notes: arbitraryBank.notes.length, identityEncoding: arbitraryBank.identityEncoding, legacyStreamCompatibility: process.argv.includes('--legacy-stream'), cachePruned: true, editorClosed: true, evidence }, null, 2) + '\n');
    console.log('PASS Arbitrary original neural word prepares all four 49-key voices and restores for native editor-closed playback', JSON.stringify({ word, evidence }));
  }
}
function install() {
  globalThis.window = globalThis;
  globalThis.DOMException ||= class extends Error { constructor(message, name) { super(message); this.name = name; } };
  const vendor = require('../js/vendor-entry.js');
  for (const file of ['shared/pattern-schema.js', 'morsel/schema.js', 'morsel/sequence.js', 'morsel/audio-engine.js', 'plugins/js/morsel-preparation.js', 'plugins/js/morsel.js']) Function(fs.readFileSync(path.join(root, file), 'utf8'))();
  return vendor;
}
function stats(data) { let sum = 0, peak = 0, first = -1; for (let at = 0; at < data.length; at++) { const value = data[at]; assert(Number.isFinite(value)); sum += value * value; peak = Math.max(peak, Math.abs(value)); if (first < 0 && Math.abs(value) > 1e-8) first = at; } return { rms: Math.sqrt(sum / data.length), peak, first }; }
function processFrames(adapter, frames, options = {}) {
  const rate = options.rate || 48000, left = new Float32Array(frames), right = new Float32Array(frames), pattern = options.blocks || [128]; let frame = options.frame || 0, index = 0;
  const startBeat = options.beat ?? 0, tempo = options.tempo || 120;
  for (let at = 0; at < frames;) {
    const count = Math.min(pattern[index++ % pattern.length], frames - at), current = frame + at;
    const clock = { sampleRate: rate, tempo, beat: startBeat + at / rate * tempo / 60, frame: current, playing: options.playing === true, revision: options.revision || 1, samplePosition: current };
    adapter.process(left.subarray(at, at + count), right.subarray(at, at + count), clock); at += count;
  }
  return { left, right };
}
async function runChecks() {
  const bank = loadBank(bankFile), vendor = install(), passed = [];
  const check = async (name, run) => { const evidence = await run(); passed.push({ name, evidence }); console.log('PASS', name, evidence ? JSON.stringify(evidence) : ''); };
  const recipe = () => ({ ...MorselSchema.defaultState(), space: 0, air: 0, vibrato: 0 });
  const create = patch => KitchenMorselPlugin.create('morsel', 48000, { recipe: recipe(), bank, followHost: false, ...patch });
  await check('The factory bank contains real distinct neural voices and every live keyboard pitch', () => {
    assert.equal(bank.backend, 'kitten-tts-nano-0.8-int8'); assert.equal(bank.modelHash.length, 64);
    const hashes = [];
    for (const voice of ['alto', 'tenor', 'bass', 'robot']) {
      const identity = voice + '\0ah';
      const words = bank.words.filter(word => word.identity === identity); assert.equal(words.length, 1);
      hashes.push(digest(Buffer.from(words[0].pcm, 'base64')));
      for (let pitch = 36; pitch <= 84; pitch++) assert(bank.notes.some(note => note.identity === identity && note.pitch === pitch));
    }
    assert.equal(new Set(hashes).size, 4);
    assert(bank.noteBytes <= 64 * 1024 * 1024 && bank.wordBytes <= 64 * 1024 * 1024);
    return { words: bank.words.length, notes: bank.notes.length, hashes, modelHash: bank.modelHash };
  });
  await check('Bank decoding validates all PCM and rejects damage atomically', () => {
    const audio = {}, result = KitchenMorselPreparation.hydrateBank(audio, bank), original = audio.noteCache;
    const damaged = { ...bank, notes: bank.notes.map((note, i) => i ? note : { ...note, pcm: '!' + note.pcm.slice(1) }) };
    assert.throws(() => KitchenMorselPreparation.hydrateBank(audio, damaged), /PCM/); assert.strictEqual(audio.noteCache, original);
    for (const note of audio.noteCache.values()) assert.equal(digest(Buffer.from(note.left.buffer)), digest(Buffer.from(note.pcm, 'base64')));
    return result;
  });
  await check('Lossless bank transport contains no NUL strings that JUCE rejects', () => {
    const encoded = KitchenMorselPreparation.serializeBank(bank), stateJSON = JSON.stringify(encoded);
    assert.equal(encoded.identityEncoding, 'json-tuple-v1');
    JSON.parse(stateJSON, (key, value) => { if (typeof value === 'string') assert(!value.includes('\0'), 'JUCE cannot parse a U+0000 string: ' + key); return value; });
    const restored = KitchenMorselPreparation.restoreBank(JSON.parse(stateJSON));
    assert.deepEqual(restored.words.map(value => value.identity), bank.words.map(value => value.identity));
    assert.deepEqual(restored.notes.map(value => [value.key, value.identity, digest(Buffer.from(value.pcm, 'base64'))]), bank.notes.map(value => [value.key, value.identity, digest(Buffer.from(value.pcm, 'base64'))]));
    return { encoding: encoded.identityEncoding, words: restored.words.length, notes: restored.notes.length, pcmUnchanged: true };
  });
  await check('Sample-offset MIDI produces no early audio under irregular host blocks', () => {
    const adapter = create();
    try {
      assert(adapter.noteOn({ pitch: 60, velocity: .8, channel: 1, id: 10, frame: 237 }));
      const output = processFrames(adapter, 48000, { blocks: [17, 31, 64, 43, 127, 3] }), measured = stats(output.left);
      assert(output.left.subarray(0, 237 + 128).every(value => value === 0));
      assert(measured.first >= 237 + 128 && measured.first < 237 + 128 + 9600); assert(measured.rms > .005);
      assert.equal(adapter.getLatencySamples(), 128); return measured;
    } finally { adapter.dispose(); }
  });
  await check('All four voices work without a web editor, neural worker or speech call during rendering', () => {
    const rows = [];
    for (const voice of ['alto', 'tenor', 'bass', 'robot']) {
      const adapter = create({ recipe: { ...recipe(), voice } });
      try {
        MorselSpeech.prepare = MorselSpeech.render = () => { throw Error('Speech preparation reached the audio callback'); };
        assert(adapter.noteOn({ pitch: 60, velocity: .8, channel: 1, id: 20, frame: 0 }));
        const output = processFrames(adapter, 48000), measured = stats(output.left); assert(measured.rms > .0001 && measured.peak > .001, voice + ': ' + JSON.stringify(measured));
        rows.push({ voice, ...measured, pcm: digest(Buffer.from(output.left.buffer)) });
      } finally { adapter.dispose(); }
    }
    assert.equal(new Set(rows.map(row => row.pcm)).size, 4); return rows;
  });
  await check('Live MIDI holds voiced audio beyond the prepared duration and releases only the matching note', () => {
    const adapter = create();
    try {
      adapter.noteOn({ pitch: 60, velocity: .8, channel: 0, id: 30, frame: 0 });
      adapter.noteOn({ pitch: 67, velocity: .7, channel: 1, id: 30, frame: 0 });
      const first = processFrames(adapter, 48000 * 3); assert(stats(first.left.subarray(48000 * 2)).rms > .005);
      const records = [...adapter.engine.records]; assert.equal(records.length, 2);
      adapter.noteOff({ pitch: 60, channel: 0, id: 30, frame: 48000 * 3 });
      assert(records.find(record => record.pitch === 60).cancelledAt !== undefined); assert.equal(records.find(record => record.pitch === 67).cancelledAt, undefined);
      adapter.noteOff({ pitch: 67, channel: 1, id: 30, frame: 48000 * 3 });
      const tail = processFrames(adapter, 48000, { frame: 48000 * 3 }); assert(stats(tail.left.subarray(24000)).rms < .000001);
      return { heldRms: stats(first.left.subarray(48000 * 2)).rms, releasedTail: stats(tail.left.subarray(24000)).rms };
    } finally { adapter.dispose(); }
  });
  await check('Authored finite notes retain the original graph and exact prepared source PCM', async () => {
    const state = recipe(), adapter = create({ recipe: state });
    KitchenWebAudio.installContextFactory(48000); MorselSpeech.prepare = async () => {};
    const original = new MorselAudio(state); await original.init(); KitchenMorselPreparation.hydrateBank(original, bank);
    const pull = KitchenWebAudio.createPull(original.context), event = { pitch: 60, voice: 'alto', lyric: 'ah', velocity: .8, when: 0, durationSeconds: .8, source: 'reference' };
    try {
      adapter.scheduleAuthoredNote(event); original.scheduleNote(event);
      const expected = { left: new Float32Array(96000), right: new Float32Array(96000) };
      for (let at = 0; at < expected.left.length; at += 128) pull.process(expected.left.subarray(at, at + 128), expected.right.subarray(at, at + 128));
      const actual = processFrames(adapter, expected.left.length);
      assert.equal(digest(Buffer.from(actual.left.buffer)), digest(Buffer.from(expected.left.buffer)));
      assert.equal(digest(Buffer.from(actual.right.buffer)), digest(Buffer.from(expected.right.buffer)));
      return { frames: actual.left.length, sha256: digest(Buffer.from(actual.left.buffer)) };
    } finally { adapter.dispose(); await original.dispose(); }
  });
  await check('DAW PPQ, tempo, loop phase and seek revisions schedule the original phrase without a wall clock', () => {
    const state = recipe(); state.steps.forEach(step => { step.on = false; }); Object.assign(state.steps[0], { on: true, pitch: 60, lyric: 'ah', duration: 1 });
    const adapter = create({ recipe: state, followHost: true });
    try {
      const output = processFrames(adapter, 9600, { beat: 7.9, tempo: 120, playing: true, blocks: [31, 97, 111, 17] });
      const records = [...adapter.engine.records]; assert.equal(records.length, 1); assert(Math.abs(records[0].start - .05) < 1 / 48000);
      assert(output.left.subarray(0, 2400 + 128).every(value => value === 0));
      processFrames(adapter, 128, { frame: 9600, beat: 0, tempo: 90, playing: true, revision: 2 });
      const started = [...adapter.engine.records].filter(record => record.cancelledAt === undefined); assert.equal(started.length, 1); assert(Math.abs(started[0].start - .2) < 1 / 48000);
      processFrames(adapter, 256, { frame: 9728, beat: .004, tempo: 90, playing: false, revision: 3 });
      assert([...adapter.engine.records].every(record => record.cancelledAt !== undefined)); return { atLoop: records[0].start, afterSeek: started[0].start, first: stats(output.left).first };
    } finally { adapter.dispose(); }
  });
  await check('Saved plugin state restores prepared speech with the editor absent and keeps parameter edits usable', () => {
    const first = create();
    try {
      first.setParameter('recipe.voice', 'bass'); first.setParameter('recipe.tone', .4); first.setParameter('recipe.volume', .5);
      const state = JSON.parse(JSON.stringify(first.getState())), expected = create(state), restored = create(state);
      JSON.parse(JSON.stringify(state), (key, value) => { if (typeof value === 'string') assert(!value.includes('\0'), 'Native state contains U+0000: ' + key); return value; });
      try {
        for (const adapter of [expected, restored]) adapter.noteOn({ pitch: 48, velocity: .8, channel: 2, id: 40, frame: 0 });
        const a = processFrames(expected, 48000), b = processFrames(restored, 48000);
        assert.equal(digest(Buffer.from(a.left.buffer)), digest(Buffer.from(b.left.buffer))); assert.equal(restored.getState().recipe.voice, 'bass'); assert.equal(restored.getState().recipe.tone, .4);
        assert.throws(() => restored.setState({ recipe: { ...recipe(), lyric: 'not prepared yet' } }), /Prepare/);
        assert.equal(restored.getState().recipe.voice, 'bass'); return { bankKey: state.bank.key, stateBytes: Buffer.byteLength(JSON.stringify(state)), exact: true };
      } finally { expected.dispose(); restored.dispose(); }
    } finally { first.dispose(); }
  });
  const report = { bankFile, bankKey: bank.key, passed, status: 'passed' };
  const directory = process.env.MORSEL_NATIVE_QA_DIR || '/tmp/kitchen-morsel-native'; fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(passed.length + ' MORSEL native adapter groups passed.');
}
const wordAt = process.argv.indexOf('--prepare-word');
(process.argv.includes('--prepare-default') ? prepareDefault() : wordAt >= 0 ? prepareDefault(process.argv[wordAt + 1] || 'zucchini') : runChecks()).catch(error => { console.error(error.stack || error); process.exitCode = 1; });
