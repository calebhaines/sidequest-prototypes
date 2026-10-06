'use strict';
// Run: node proof/browser-checks.cjs [standalone-URL]. Default builds only a /tmp source preview.
// PLAYWRIGHT_MODULE and CHROMIUM_PATH can select an installed browser; no app dependency is added.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const installedPlaywright = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const playwright = require(process.env.PLAYWRIGHT_MODULE || (fs.existsSync(installedPlaywright) ? installedPlaywright : 'playwright'));
const appRoot = __dirname, parentRoot = path.resolve(appRoot, '..');
const hasSiblingApps = ['fable', 'loom'].every(app => fs.existsSync(path.join(parentRoot, app, 'index.html')));
const repoRoot = hasSiblingApps ? parentRoot : appRoot, artifacts = process.env.PROOF_QA_ARTIFACTS || '/tmp/leaven-browser-qa';
fs.mkdirSync(artifacts, { recursive: true });
const results = [], failures = [], skipped = [], browserErrors = [], externalRequests = [];
let server, browser;
async function check(name, run) {
  if (process.env.PROOF_QA_FILTER && !new RegExp(process.env.PROOF_QA_FILTER).test(name)) return;
  const began = Date.now();
  try { const evidence = await run(); results.push({ name, milliseconds: Date.now() - began, evidence }); console.log('PASS ' + name + (evidence ? ' ' + JSON.stringify(evidence) : '')); }
  catch (error) { failures.push({ name, message: error.stack || String(error) }); console.error('FAIL ' + name + '\n' + (error.stack || error)); }
}
async function previewHTML() {
  // Explicit /tmp output uses the real standalone function and shared fonts without publishing.
  const file = path.join(artifacts, 'source-preview.html');
  await promisify(execFile)('python3', [path.join(appRoot, 'build.py'), '--output', file], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  return fs.readFileSync(file, 'utf8');
}
async function servePreview() {
  const html = await previewHTML();
  server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (/^\/proof(?:\/index\.html)?\/?$/.test(url)) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); return; }
    const base = url.startsWith('/proof/') ? appRoot : repoRoot;
    let file = path.resolve(base, '.' + (url.startsWith('/proof/') ? url.slice('/proof'.length) : url));
    if (!file.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return; }
    try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch (_) {}
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('Missing ' + url); return; }
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type }); fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + server.address().port + '/proof/';
}
async function newPage(context, url, width = 1440, { fallback = false, midi = false } = {}) {
  const page = await context.newPage(); await page.setViewportSize({ width, height: 1000 });
  if (fallback) await page.addInitScript(() => { Object.defineProperty(AudioContext.prototype, 'audioWorklet', { get: () => undefined, configurable: true }); });
  if (midi) await page.addInitScript(() => {
    window.__qaMidiInput = { id: 'qa-midi', state: 'connected', onmidimessage: null };
    window.__qaMidiAccess = { inputs: new Map([['qa-midi', __qaMidiInput]]), onstatechange: null };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => __qaMidiAccess, configurable: true });
  });
  page.on('pageerror', error => browserErrors.push({ url: page.url(), error: error.message }));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push({ url: page.url(), error: message.text() }); });
  await page.goto(url, { waitUntil: 'load' }); await page.waitForFunction(() => !!window.ProofApp, null, { timeout: 10000 });
  return page;
}
async function fresh(page) { await page.evaluate(() => ProofApp.loadState(ProofSchema.defaultState())); }
async function state(page) { return page.evaluate(() => ProofApp.getState()); }
async function download(page, selector, file) {
  const pending = page.waitForEvent('download', { timeout: 90000 }); await page.locator(selector).click();
  const item = await pending; const failure = await item.failure(); assert.equal(failure, null); await item.saveAs(path.join(artifacts, file));
  return { name: item.suggestedFilename(), bytes: fs.readFileSync(path.join(artifacts, file)) };
}
function pcm16Stats(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  assert.equal(bytes.readUInt16LE(22), 2); assert.equal(bytes.readUInt32LE(24), 48000); assert.equal(bytes.readUInt16LE(34), 16);
  let peak = 0, energy = 0; for (let at = 44; at + 1 < bytes.length; at += 2) { const n = bytes.readInt16LE(at) / 32768; peak = Math.max(peak, Math.abs(n)); energy += n * n; }
  return { bytes: bytes.length, peak, rms: Math.sqrt(energy / ((bytes.length - 44) / 2)) };
}
function midiNotes(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'MThd'); assert.equal(bytes.readUInt32BE(4), 6); assert.equal(bytes.readUInt16BE(8), 0);
  assert.equal(bytes.toString('ascii', 14, 18), 'MTrk'); const ppq = bytes.readUInt16BE(12), notes = [];
  let at = 22, tick = 0, previous;
  const variable = () => { let n = 0, b; do { b = bytes[at++]; n = n * 128 + (b & 127); } while (b & 128); return n; };
  while (at < bytes.length) {
    tick += variable(); let status = bytes[at++]; if (status < 128) { at--; status = previous; } else previous = status;
    if (status === 255) { at++; const length = variable(); at += length; continue; }
    if (status === 240 || status === 247) { const length = variable(); at += length; continue; }
    const type = status & 240, pitch = bytes[at++], velocity = type === 192 || type === 208 ? undefined : bytes[at++];
    if (type === 144 && velocity > 0) notes.push({ pitch, beat: tick / ppq, velocity });
  }
  return notes;
}
const soundPaths = ['synth.wave', 'synth.mix', 'synth.sub', 'synth.detune', 'synth.pulseWidth', 'synth.sync', 'synth.crossmod', 'synth.vector', 'synth.table', 'synth.fmRatio', 'synth.fmIndex', 'synth.fmFeedback', 'synth.fmAlgorithm', 'synth.glide', 'synth.octave', 'synth.velocity', 'synth.drive', 'synth.filter.type', 'synth.filter.cutoff', 'synth.filter.resonance', 'synth.filter.envAmount', 'synth.filter.keytrack', 'synth.amp.attack', 'synth.amp.decay', 'synth.amp.sustain', 'synth.amp.release', 'synth.filterEnv.attack', 'synth.filterEnv.decay', 'synth.filterEnv.sustain', 'synth.filterEnv.release', 'synth.lfo.shape', 'synth.lfo.rate', 'synth.lfo.sync', 'synth.lfo.depth', 'synth.lfo.target', 'synth.lfo.retrigger', 'fx.chorus', 'fx.chorusRate', 'fx.delay', 'fx.delayDivision', 'fx.feedback', 'fx.space', 'fx.width', 'fx.volume'];

(async () => {
  const url = process.argv[2] || process.env.PROOF_QA_URL || await servePreview(); const origin = new URL(url).origin;
  const allowedOrigins = new Set([origin, ...(process.env.PROOF_HOST_URL ? [new URL(process.env.PROOF_HOST_URL).origin] : [])]);
  browser = await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=user-gesture-required'] });
  const context = await browser.newContext({ acceptDownloads: true });
  await context.route('**/*', route => {
    const request = route.request().url();
    if (/^(data:|blob:|about:)/.test(request) || [...allowedOrigins].some(allowed => request.startsWith(allowed + '/'))) return route.continue();
    externalRequests.push(request); return route.abort();
  });
  for (const width of [320, 390, 768, 1440]) await check('Visible controls and document fit at ' + width + 'px', async () => {
    const page = await newPage(context, url, width); await fresh(page);
    const widths = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    assert(widths.document <= width + 1 && widths.body <= width + 1, JSON.stringify(widths));
    assert.match(await page.title(), /LEAVEN/); assert.equal(await page.locator('h1').textContent().then(s => s.replace('●', '').trim()), 'LEAVEN');
    for (const key of soundPaths) {
      const element = page.locator('[data-path="' + key + '"]'); assert.equal(await element.count(), 1, key + ' one editable control');
      assert(await element.isVisible(), key + ' visible'); assert.equal(await element.evaluate(el => !!el.closest('details:not([open])')), false, key + ' not collapsed');
      await element.scrollIntoViewIfNeeded(); const box = await element.boundingBox(); assert(box.width > 0 && box.x >= -1 && box.x + box.width <= width + 1, key + ' horizontally reachable');
    }
    const smallActions = await page.locator('button').evaluateAll(elements => elements.filter(el => {
      const r = el.getBoundingClientRect(), visible = !!(r.width && r.height) && !el.closest('[hidden]');
      return visible && !el.closest('#keyboard') && (r.height < 35.5 || r.width < 35.5);
    }).map(el => ({ text: el.textContent.trim(), width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })));
    assert.deepEqual(smallActions, [], 'tap targets');
    await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: path.join(artifacts, 'leaven-' + width + '.png'), fullPage: true });
    const evidence = { ...widths, visibleSoundControls: soundPaths.length, buttons: await page.locator('button:visible').count() }; await page.close(); return evidence;
  });
  const page = await newPage(context, url); await fresh(page);
  await check('Play starts audible real DSP only after a gesture and Panic silences it', async () => {
    assert.equal(await page.evaluate(() => ProofApp.engine.context?.state || 'uninitialized'), 'uninitialized');
    await page.locator('#playButton').click(); await page.waitForFunction(() => ProofApp.engine.getMeters().peak > .001, null, { timeout: 15000 });
    const evidence = await page.evaluate(() => ({ mode: ProofApp.engine.mode, state: ProofApp.engine.context.state, meters: ProofApp.engine.getMeters(), playing: ProofApp.isPlaying() }));
    assert.equal(evidence.state, 'running'); assert(evidence.playing); assert(evidence.meters.voices > 0); assert(evidence.meters.peak <= 1.001);
    await page.locator('#panicButton').click(); await page.waitForFunction(() => !ProofApp.isPlaying() && ProofApp.engine.getMeters().voices === 0);
    return { mode: evidence.mode, rms: evidence.meters.rms, peak: evidence.meters.peak, voices: evidence.meters.voices };
  });
  await check('Captured Web Audio output from all five live models is finite and audible', async () => {
    await fresh(page); await page.locator('#playButton').click();
    const evidence = await page.evaluate(async () => {
      const engine = ProofApp.engine, context = engine.context, tap = context.createScriptProcessor(1024, 2, 2), sink = context.createGain(); sink.gain.value = 0;
      engine.node.connect(tap); tap.connect(sink); sink.connect(context.destination);
      let measurement;
      tap.onaudioprocess = event => {
        if (!measurement) return;
        for (let ch = 0; ch < event.inputBuffer.numberOfChannels; ch++) {
          const input = event.inputBuffer.getChannelData(ch); for (const value of input) { measurement.samples++; measurement.energy += value * value; measurement.peak = Math.max(measurement.peak, Math.abs(value)); if (!Number.isFinite(value)) measurement.nonfinite++; }
        }
      };
      const output = {};
      for (const model of ProofSchema.MODELS) {
        const next = ProofApp.getState(); next.synth.model = model; ProofApp.loadState(next); await ProofApp.play();
        await new Promise(resolve => setTimeout(resolve, 120)); measurement = { samples: 0, energy: 0, peak: 0, nonfinite: 0 };
        await new Promise(resolve => setTimeout(resolve, 450)); output[model] = { samples: measurement.samples, rms: Math.sqrt(measurement.energy / Math.max(1, measurement.samples)), peak: measurement.peak, nonfinite: measurement.nonfinite };
      }
      measurement = null; engine.node.disconnect(tap); tap.disconnect(); sink.disconnect(); ProofApp.panic(); return output;
    });
    for (const [model, info] of Object.entries(evidence)) { assert(info.samples >= 4096, model + ' captured output'); assert.equal(info.nonfinite, 0); assert(info.rms > .0001 && info.peak <= 1.001, model + ' actual output'); }
    return evidence;
  });
  await check('Typed edits Undo and Redo; step and chord selection preserve music', async () => {
    await fresh(page); const before = await state(page); await page.locator('#tempo').fill('117'); await page.locator('#tempo').press('Tab');
    assert.equal((await state(page)).tempo, 117); await page.locator('#undoButton').click(); assert.equal((await state(page)).tempo, before.tempo);
    await page.locator('#redoButton').click(); assert.equal((await state(page)).tempo, 117);
    const music = await state(page); await page.locator('#steps [data-step="5"]').first().click();
    await page.locator('#chordRack [data-chord="2"]').first().click(); const selected = await state(page);
    assert.deepEqual(selected.patterns, music.patterns); assert.deepEqual(selected.chords, music.chords); assert.equal(selected.selectedChord, 2);
    await page.locator('#clearPatternButton').click(); assert((await state(page)).patterns[0].steps.every(s => !s.on));
    await page.locator('#undoButton').click(); assert.deepEqual((await state(page)).patterns, music.patterns);
  });
  await check('Protected step mutation and Euclidean changes are reversible', async () => {
    await fresh(page); await page.locator('#steps [data-step="0"]').first().click(); await page.locator('#stepProtect').check();
    const protectedStep = (await state(page)).patterns[0].steps[0]; await page.locator('#mutateButton').click(); assert.deepEqual((await state(page)).patterns[0].steps[0], protectedStep);
    const mutated = await state(page); await page.locator('#euclidPulses').fill('5'); await page.locator('#euclidButton').click();
    assert.equal((await state(page)).patterns[0].steps.filter(s => s.on).length, 5); await page.locator('#undoButton').click(); assert.deepEqual((await state(page)).patterns, mutated.patterns);
  });
  await check('Project download and actual file import preserve edits and reject invalid JSON atomically', async () => {
    await fresh(page); await page.locator('#tempo').fill('123'); await page.locator('#tempo').press('Tab'); const savedState = await state(page);
    const item = await download(page, '#saveButton', 'project.json'); const project = JSON.parse(item.bytes.toString('utf8')); assert.equal(project.format, 'proof-project'); assert.deepEqual(project.state, savedState);
    await page.locator('#tempo').fill('87'); await page.locator('#tempo').press('Tab');
    await page.locator('#projectFile').setInputFiles({ name: 'restored.json', mimeType: 'application/json', buffer: item.bytes });
    await page.waitForFunction(() => ProofApp.getState().tempo === 123); assert.deepEqual(await state(page), savedState);
    const beforeBad = await state(page); await page.locator('#projectFile').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
    await page.waitForFunction(() => /json|invalid|could|project|error/i.test(document.querySelector('#status').textContent)); assert.deepEqual(await state(page), beforeBad);
    return { filename: item.name, bytes: item.bytes.length };
  });
  await check('Computer keyboard and on-screen keyboard trigger pitched sound', async () => {
    await fresh(page); await page.locator('#source').selectOption('single');
    await page.locator('#keyboard').scrollIntoViewIfNeeded(); await page.locator('body').click({ position: { x: 20, y: 20 } });
    await page.keyboard.down('a'); await page.waitForFunction(() => ProofApp.engine.getMeters().voices > 0, null, { timeout: 5000 }); await page.keyboard.up('a');
    const key = page.locator('#keyboard [data-note]').first(); await key.scrollIntoViewIfNeeded(); const bounds = await key.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * .8); await page.mouse.down();
    await page.waitForFunction(() => ProofApp.engine.getMeters().peak > .001); await page.mouse.up(); await page.locator('#panicButton').click();
    await page.locator('#source').selectOption('held'); await page.locator('#latch').uncheck(); await page.locator('body').click({ position: { x: 20, y: 20 } });
    await page.keyboard.down('a'); assert((await state(page)).heldNotes.length > 0); await page.keyboard.up('a'); assert.equal((await state(page)).heldNotes.length, 0);
    await page.waitForFunction(() => ProofApp.engine.getMeters().voices === 0, null, { timeout: 5000 });
    await page.locator('#source').selectOption('single'); await page.locator('body').click({ position: { x: 20, y: 20 } });
    await page.keyboard.down('a'); await page.waitForFunction(() => ProofApp.engine.getMeters().voices > 0);
    await page.locator('#source').selectOption('held'); await page.keyboard.up('a');
    await page.waitForFunction(() => ProofApp.engine.getMeters().voices === 0, null, { timeout: 5000 });
  });
  await check('MIDI reconnect cleanup and source changes release previously triggered notes', async () => {
    const midi = await newPage(context, url, 390, { midi: true }); await fresh(midi); await midi.locator('#midiButton').click();
    await midi.evaluate(() => __qaMidiInput.onmidimessage({ data: new Uint8Array([144, 72, 110]) }));
    await midi.waitForFunction(() => ProofApp.engine.getMeters().voices > 0); await midi.locator('#source').selectOption('held');
    await midi.evaluate(() => __qaMidiInput.onmidimessage({ data: new Uint8Array([128, 72, 0]) }));
    await midi.waitForFunction(() => ProofApp.engine.getMeters().voices === 0, null, { timeout: 5000 });
    await midi.locator('#source').selectOption('single');
    await midi.evaluate(() => { window.__qaOldMidiHandler = __qaMidiInput.onmidimessage; __qaMidiInput.onmidimessage({ data: new Uint8Array([144, 67, 110]) }); });
    await midi.waitForFunction(() => ProofApp.engine.getMeters().voices > 0);
    await midi.evaluate(() => { __qaMidiInput.state = 'disconnected'; __qaMidiAccess.onstatechange(); });
    await midi.waitForFunction(() => ProofApp.engine.getMeters().voices === 0); assert.equal(await midi.evaluate(() => __qaMidiInput.onmidimessage), null);
    await midi.evaluate(() => { __qaMidiInput.state = 'connected'; __qaMidiAccess.onstatechange(); });
    assert(await midi.evaluate(() => typeof __qaMidiInput.onmidimessage === 'function' && __qaMidiInput.onmidimessage !== __qaOldMidiHandler));
    await midi.close(); return { simulatedMidiDevice: true, disconnectReleasesVoices: true };
  });
  await check('Downloads contain audible stereo WAV and a correctly timed standard MIDI phrase', async () => {
    await fresh(page); await page.locator('#exportBars').fill('1'); await page.locator('#exportScope').selectOption('note');
    const wave = await download(page, '#wavButton', 'single-note.wav'), info = pcm16Stats(wave.bytes); assert(info.rms > .0001 && info.peak > .001 && info.peak <= 1);
    await page.locator('#exportScope').selectOption('pattern'); const expected = await page.evaluate(() => ProofArp.events(ProofApp.getState(), { startBeat: 0, lengthBeats: 4 }).map(e => ({ pitch: e.note, beat: e.startBeat })));
    const midi = await download(page, '#midiExportButton', 'phrase.mid'), notes = midiNotes(midi.bytes); assert(notes.length > 0);
    assert.equal(notes.length, expected.length); for (let i = 0; i < notes.length; i++) { assert.equal(notes[i].pitch, expected[i].pitch); assert(Math.abs(notes[i].beat - expected[i].beat) < 1 / 90); }
    return { wav: info, midiBytes: midi.bytes.length, midiNotes: notes.length };
  });
  await check('Shared pattern export, library, exact import and native-arp Undo use actual adapters', async () => {
    await fresh(page); const packet = await page.evaluate(async () => {
      const p = MusicLabPatternSchema.normalize(await MusicLabPatternInstrument.exportPattern()); const item = await MusicLabPatterns.save(p); const fetched = await MusicLabPatterns.get(item.id);
      if (MusicLabPatternSchema.serialize(p) !== MusicLabPatternSchema.serialize(fetched)) throw new Error('Pattern library changed notes');
      window.__qaPattern = p; window.__qaPatternId = item.id; return p;
    });
    assert.equal(packet.sourceApp, 'proof'); assert.equal(packet.swing, 0); assert(packet.notes.length > 0 && packet.notes.every(n => n.probability === 1));
    await page.evaluate(async () => { const p = __qaPattern; await MusicLabPatternInstrument.importPattern({ pattern: p, options: { replace: true, voiceMap: Object.fromEntries(p.voices.map(v => [v.id, 'synth'])) } }); });
    assert(await page.locator('#importedNotice').isVisible()); const imported = await state(page); assert.deepEqual(imported.musicLabPattern.pattern, packet);
    await page.locator('#nativeArpButton').click(); assert.equal((await state(page)).musicLabPattern, undefined); await page.locator('#undoButton').click(); assert.deepEqual((await state(page)).musicLabPattern, imported.musicLabPattern);
    return { notes: packet.notes.length, beats: packet.lengthBeats };
  });
  let sharedSample;
  await check('Shared sample panel renders and stores actual LEAVEN audio', async () => {
    await fresh(page); await page.locator('[data-musiclab-exchange="proof"]').click();
    const dialog = page.locator('.ml-ex-dialog'); await dialog.locator('[data-tab="send"]').click(); await dialog.locator('[name="scope"]').selectOption('note');
    await dialog.locator('[name="tail"]').fill('.2'); await dialog.locator('[data-action="render"]').click();
    await dialog.locator('.ml-ex-rendered').waitFor({ state: 'visible', timeout: 90000 }); await dialog.locator('[data-action="save"]').click();
    await page.waitForFunction(async () => (await MusicLabExchange.list()).length > 0);
    sharedSample = await page.evaluate(async () => { const entries = await MusicLabExchange.list(); return entries[entries.length - 1].id; });
    await dialog.locator('[data-action="close"]').click(); return { libraryId: sharedSample };
  });
  if (!hasSiblingApps && !process.env.PROOF_SKIP_TRANSFERS) { skipped.push('Sibling STOCK/GALLEY sample transfers: sibling apps are absent from this extracted source archive.'); console.log('SKIP ' + skipped.at(-1)); }
  if (hasSiblingApps && !process.env.PROOF_SKIP_TRANSFERS) await check('Shared audio moves into STOCK and GALLEY without losing PCM', async () => {
    assert(sharedSample); const proofAudio = await page.evaluate(async id => { const a = await MusicLabExchange.get(id); return { frames: a.frames, sampleRate: a.sampleRate, name: a.name }; }, sharedSample);
    const destinationOrigin = origin + '/';
    for (const [app, facade] of [['fable', 'FableApp'], ['loom', 'LoomApp']]) {
      const destination = await context.newPage(); destination.on('pageerror', error => browserErrors.push({ url: destination.url(), error: error.message }));
      await destination.goto(destinationOrigin + app + '/index.html', { waitUntil: 'load' }); await destination.waitForFunction(name => !!window[name], facade, { timeout: 15000 });
      const before = await destination.evaluate(name => window[name].getState(), facade);
      await destination.locator('[data-musiclab-exchange="' + app + '"]').click();
      const incoming = destination.locator('.ml-ex-dialog'); await incoming.locator('[data-sample="' + sharedSample + '"]').click();
      await incoming.locator('[name="target"]').selectOption(app === 'fable' ? 'new' : before.tracks[0].id);
      await incoming.locator('[data-action="receive"]').click();
      await destination.waitForFunction(({ name, count }) => window[name].getState().assets.length === count + 1, { name: facade, count: before.assets.length });
      const after = await destination.evaluate(name => window[name].getState(), facade);
      const result = { assetsBefore: before.assets.length, assetsAfter: after.assets.length, zones: after.zones?.length, clips: after.tracks?.[0].clips.length };
      assert.equal(result.assetsAfter, result.assetsBefore + 1, app + ' import asset'); if (app === 'fable') assert(result.zones > 0); else assert(result.clips > 0);
      const fidelity = await destination.evaluate(async ({ id, facade, app }) => {
        const incoming = await MusicLabExchange.get(id), asset = window[facade].getState().assets.at(-1), decoded = (app === 'fable' ? FableSchema : LoomSchema).decodeAsset(asset);
        const left = decoded.left || decoded.channels?.[0], right = decoded.right || decoded.channels?.[1] || left;
        if (!left || !right) throw new Error('Imported asset did not expose decoded stereo');
        let maximum = 0; for (let i = 0; i < left.length; i++) { maximum = Math.max(maximum, Math.abs(left[i] - incoming.pcm[0][i]), Math.abs(right[i] - (incoming.pcm[1] || incoming.pcm[0])[i])); }
        return { frames: left.length, sampleRate: decoded.sampleRate, maximum };
      }, { id: sharedSample, facade, app });
      assert.equal(fidelity.frames, proofAudio.frames); assert.equal(fidelity.sampleRate, proofAudio.sampleRate); assert(fidelity.maximum <= 1 / 16384, app + ' PCM retained within int16 precision');
      await destination.close();
    }
    return proofAudio;
  });
  await check('ScriptProcessor fallback plays finite audible PCM with no worklet available', async () => {
    const fallback = await newPage(context, url, 390, { fallback: true }); await fresh(fallback); await fallback.locator('#playButton').click();
    await fallback.waitForFunction(() => ProofApp.engine.getMeters().peak > .001, null, { timeout: 15000 });
    const evidence = await fallback.evaluate(() => ({ mode: ProofApp.engine.mode, meters: ProofApp.engine.getMeters() })); assert.match(evidence.mode, /script|fallback/i);
    assert(Number.isFinite(evidence.meters.rms) && evidence.meters.peak <= 1.001); await fallback.locator('#panicButton').click(); await fallback.close();
    return { mode: evidence.mode, rms: evidence.meters.rms, peak: evidence.meters.peak };
  });
  if (process.env.PROOF_HOST_URL || process.env.PROOF_HOST_CHECK) await check('Actual GALLEY host loads LEAVEN, schedules direct notes and renders the same DSP', async () => {
    const host = await context.newPage(); await host.goto(process.env.PROOF_HOST_URL || origin + '/loom/index.html', { waitUntil: 'load' }); await host.waitForFunction(() => !!window.LoomApp);
    host.on('pageerror', error => browserErrors.push({ url: host.url(), error: error.message }));
    host.on('console', message => { if (message.type() === 'error') browserErrors.push({ url: host.url(), error: message.text() }); });
    await host.evaluate(() => LoomApp.loadState(LoomSchema.defaultState())); await host.locator('#playButton').click(); await host.locator('#panicButton').click();
    const summary = await host.evaluate(async () => {
      const app = LoomApp, state = app.getState(); if (state.tracks.length !== 8 || state.tracks.some(t => t.effects.length !== 4)) throw new Error('GALLEY track/insert contract');
      if (LoomInstrumentManifest.length !== 12 || !LoomInstrumentManifest.some(d => d.id === 'proof' && d.name === 'LEAVEN')) throw new Error('GALLEY catalog missing LEAVEN');
      const context = await app.engine.init(); await context.resume();
      const frame = document.createElement('iframe'); document.body.append(frame); const track = state.tracks[0].id;
      const native = await app.host.load(track, { id: 'proof', name: 'LEAVEN', url: '../proof/index.html' }, frame);
      await app.host.command(track, 'prepare'); app.engine.resumeAudition(track); const when = context.currentTime + .1;
      await app.host.scheduleNote(track, { pitch: 69, voice: 'synth', velocity: .8, when, durationSeconds: .2, source: 'qa-host' });
      await new Promise(resolve => setTimeout(resolve, 250)); const peak = frame.contentWindow.ProofApp.engine.getMeters().peak, mixer = app.engine.getMeters();
      if (frame.contentWindow.ProofApp.isPlaying()) throw new Error('Incoming direct note started autonomous arp');
      const pattern = await app.host.exportPattern(track); const before = JSON.stringify(frame.contentWindow.ProofApp.getState());
      const rendered = await app.host.renderPattern(track, { pattern: { ...pattern, lengthBeats: 1, notes: pattern.notes.filter(n => n.beat < .8).map(n => ({ ...n, duration: Math.min(n.duration, 1 - n.beat) })) }, tempo: 120, tailSeconds: .1 });
      if (before !== JSON.stringify(frame.contentWindow.ProofApp.getState())) throw new Error('Host render changed editor');
      await app.host.cancelNotes(track, { source: 'qa-host', when: context.currentTime }); app.host.unload(track);
      if (context.state === 'closed') throw new Error('Unloading closed parent context'); frame.remove();
      return { native, peak, mixer: { master: mixer.master, track: mixer.tracks[0] }, sampleRate: rendered.sampleRate, renderedBytes: rendered.blob?.size || rendered.pcm?.byteLength, parentContext: context.state };
    });
    assert(summary.peak > .0001); assert(summary.mixer.master.peak > .0001, 'actual GALLEY mixer output'); assert.equal(summary.sampleRate, 48000); assert(summary.renderedBytes > 44); await host.close(); return summary;
  });
  if (process.env.PROOF_HOST_URL || process.env.PROOF_HOST_CHECK) await check('Actual GALLEY UI prints exact 48k source frames at a 44.1k parent rate and restores notes', async () => {
    const host = await context.newPage();
    host.on('pageerror', error => browserErrors.push({ url: host.url(), error: error.message }));
    host.on('console', message => { if (message.type() === 'error') browserErrors.push({ url: host.url(), error: message.text() }); });
    await host.goto(process.env.PROOF_HOST_URL || origin + '/loom/index.html', { waitUntil: 'load' }); await host.waitForFunction(() => !!window.LoomApp);
    await host.evaluate(async () => { await LoomApp.loadState(LoomSchema.defaultState()); await LoomApp.engine.applyAudioSettings({ sampleRate: '44100' }); });
    await host.locator('#playButton').click(); await host.locator('#panicButton').click();
    assert.equal(await host.evaluate(() => LoomApp.engine.context.sampleRate), 44100);
    const patch = await page.evaluate(() => { const s = ProofSchema.defaultState(); s.name = 'QA saved FM recipe'; s.synth.model = 'fm'; s.synth.fmIndex = 7.3; s.synth.filter.cutoff = 1120; return JSON.parse(ProofSchema.serialize(s)); });
    const setup = await host.evaluate(async patch => {
      const state = LoomSchema.defaultState(); state.tempo = 120; state.loopEnabled = false;
      const pattern = MusicLabPatternSchema.normalize({ format: 'musiclab-pattern', version: 1, name: 'Exact two-second print', sourceApp: 'proof', tempo: 120, swing: 0, lengthBeats: 4, meter: [4, 4], seed: 44100,
        voices: [{ id: 'synth', name: 'LEAVEN' }], notes: [
          { id: 'first', voice: 'synth', pitch: 60, beat: 0, duration: .5, velocity: .8, probability: 1 },
          { id: 'middle', voice: 'synth', pitch: 67, beat: 1.25, duration: .75, velocity: .72, probability: 1 },
          { id: 'last', voice: 'synth', pitch: 69, beat: 2.8, duration: 1.2, velocity: .9, probability: 1 } ] });
      state.tracks[0].instrument = { id: 'proof', name: 'LEAVEN', snapshot: { format: 'loom-instrument-state', version: 1, app: 'proof', state: patch, storage: {} } };
      state.tracks[0].clips = [{ id: 'qa-two-second-print', name: pattern.name, type: 'notes', pattern, voiceMap: { synth: 'synth' }, start: 0, length: 4, sourceOffset: 0, rate: 1, loop: false, gain: 1, fadeIn: 0, fadeOut: 0, transpose: 0 }];
      await LoomApp.loadState(state); LoomApp.selectClip('qa-two-second-print'); return { pattern, original: LoomApp.getState().tracks[0].clips[0] };
    }, patch);
    await host.locator('#printNoteClipButton').click();
    await host.waitForFunction(() => LoomApp.getState().tracks[0].clips[0].type === 'audio' || /shorter|invalid|failed|error/i.test(document.querySelector('#status').textContent), null, { timeout: 90000 });
    const printed = await host.evaluate(() => {
      const state = LoomApp.getState(), clip = state.tracks[0].clips[0], asset = state.assets.find(a => a.id === clip.assetId);
      if (clip.type !== 'audio') throw new Error(document.querySelector('#status').textContent);
      const decoded = LoomSchema.decodeAsset(asset); let peak = 0, nonfinite = 0;
      for (const channel of [decoded.left, decoded.right]) for (const value of channel) { if (!Number.isFinite(value)) nonfinite++; peak = Math.max(peak, Math.abs(value)); }
      const restored = LoomSchema.parseProject(LoomSchema.serializeProject(state));
      return { clip, asset: { frames: asset.frames, sampleRate: asset.sampleRate, duration: asset.duration }, peak, nonfinite, portableOrigin: restored.tracks[0].clips[0].origin };
    });
    assert.equal(printed.asset.frames, 96000, 'native two-second source must retain all requested frames'); assert.equal(printed.asset.sampleRate, 48000); assert.equal(printed.asset.duration, 2); assert.equal(printed.nonfinite, 0); assert(printed.peak > .001);
    assert.deepEqual(printed.clip.origin.pattern, setup.pattern); assert.deepEqual(printed.portableOrigin, printed.clip.origin); assert.equal(printed.clip.origin.instrument.snapshot.state.state.synth.fmIndex, 7.3);
    await host.locator('#editSourceButton').click(); await host.waitForFunction(() => !!LoomApp.noteWorkflow.sourceEdit, null, { timeout: 20000 });
    const source = await host.evaluate(() => {
      const adapter = LoomApp.host.getPatternAdapter('track-1'), record = LoomApp.host.records.get('track-1');
      return { pattern: adapter.importedPattern, state: record.iframe.contentWindow.ProofApp.getState(), parentRate: LoomApp.engine.context.sampleRate };
    });
    assert.deepEqual(source.pattern, setup.pattern); assert.equal(source.state.synth.model, 'fm'); assert.equal(source.state.synth.fmIndex, 7.3); assert.equal(source.parentRate, 44100);
    await host.locator('#closeInstrument').click(); await host.locator('#restoreNotesButton').click();
    await host.waitForFunction(() => LoomApp.getState().tracks[0].clips[0].type === 'notes', null, { timeout: 20000 });
    const restored = await host.evaluate(() => ({ clip: LoomApp.getState().tracks[0].clips[0], context: LoomApp.engine.context.state }));
    assert.deepEqual(restored.clip, setup.original); assert.notEqual(restored.context, 'closed'); await host.close();
    return { parentSampleRate: 44100, sourceSampleRate: printed.asset.sampleRate, sourceFrames: printed.asset.frames, peak: printed.peak, exactSourceRestored: true };
  });
  await check('No uncaught browser errors or external network dependencies', () => { assert.deepEqual(browserErrors, []); assert.deepEqual(externalRequests, []); return { browserErrors: 0, externalRequests: 0 }; });
  await page.close(); await context.close();
  const report = { checkedAt: new Date().toISOString(), url, passed: results.length, failed: failures.length, skipped, results, failures, browserErrors, externalRequests };
  fs.writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('\nLEAVEN browser: ' + results.length + ' passed, ' + failures.length + ' failed. Artifacts: ' + artifacts);
  if (failures.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
