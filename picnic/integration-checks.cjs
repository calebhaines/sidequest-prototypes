'use strict';

// Browser integration through GALLEY's real host, bridge, transport and shared
// libraries. Build PICNIC and GALLEY first; reports are written outside the repo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const installed = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || (fs.existsSync(installed) ? installed : 'playwright'));
const root = path.dirname(__dirname), artifacts = process.env.PICNIC_INTEGRATION_ARTIFACTS || '/tmp/picnic-integration-qa';
fs.mkdirSync(artifacts, { recursive: true });
const results = [], errors = [], navigations = [];
let server, browser;
async function check(name, run) {
  if (process.env.PICNIC_INTEGRATION_FILTER && !new RegExp(process.env.PICNIC_INTEGRATION_FILTER).test(name)) return;
  const started = Date.now(), evidence = await run(); results.push({ name, milliseconds: Date.now() - started, evidence });
  console.log('PASS ' + name + (evidence === undefined ? '' : ' ' + JSON.stringify(evidence)));
}
async function serve() {
  server = http.createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); } catch (_) { response.writeHead(400); return response.end(); }
    let file = path.resolve(root, '.' + pathname); if (!file.startsWith(root + path.sep)) { response.writeHead(403); return response.end(); }
    try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch (_) {}
    if (!fs.existsSync(file)) { response.writeHead(404); return response.end(); }
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return 'http://127.0.0.1:' + server.address().port + '/loom/';
}
async function open(page) {
  await page.locator('#openInstrumentButton').click();
  await page.waitForFunction(() => LoomApp.host.records.get('track-1')?.loaded && !!LoomApp.host.records.get('track-1').iframe.contentWindow.PicnicApp);
  await page.evaluate(() => LoomApp.host.records.get('track-1').ready);
  return page.frameLocator('iframe[data-host-track="track-1"]');
}
async function reset(page, snapshot, { live = false } = {}) {
  await page.evaluate(async ({ snapshot, live }) => {
    const state = LoomSchema.defaultState(); state.tracks[0].instrument = { id: 'picnic', name: 'PICNIC', ...(snapshot ? { snapshot } : {}) }; state.tracks[0].instrumentLive = live;
    await LoomApp.loadState(state); LoomApp.selectTrack(0);
  }, { snapshot, live });
  return open(page);
}

(async () => {
  if (!process.env.PICNIC_HOST_QA_URL && !fs.existsSync(path.join(root, 'loom', 'index.html'))) throw Error('Build GALLEY in the Kitchen checkout, or set PICNIC_HOST_QA_URL to a PICNIC-enabled GALLEY.');
  const url = process.env.PICNIC_HOST_QA_URL || await serve();
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('request', request => { if (request.isNavigationRequest() && request.frame() !== page.mainFrame() && /^https?:/.test(request.url())) navigations.push(request.url()); });
  await page.goto(url); await page.waitForFunction(() => !!window.LoomApp);
  let frame = await reset(page);
  await check('GALLEY discovers the complete native ensemble while preserving its eight-track architecture', async () => {
    const result = await page.evaluate(() => {
      const manifest = LoomApp.host.manifest.find(app => app.id === 'picnic'), state = LoomApp.getState(), child = LoomApp.host.records.get('track-1').iframe.contentWindow;
      return { manifest, tracks: state.tracks.length, inserts: state.tracks.map(track => track.effects.length), parts: child.PicnicApp.getState().parts.map(part => part.id), capabilities: LoomApp.host.capabilities('track-1') };
    });
    assert.equal(result.manifest.facade, 'PicnicApp'); assert.equal(result.manifest.storageKey, 'picnic-project-v1'); assert.equal(result.tracks, 8); assert(result.inserts.every(count => count === 4));
    assert.deepEqual(result.parts, ['melody', 'chords', 'bass', 'drums', 'neighbors', 'texture']); assert(result.capabilities.patternExport && result.capabilities.renderPattern && result.capabilities.notes);
    return { tracks: result.tracks, insertsPerTrack: 4, nativeParts: result.parts, capabilities: result.capabilities };
  });
  let snapshot;
  await check('Hosted section navigation and portable snapshots preserve all edits and the complete second page', async () => {
    const expected = await page.evaluate(async () => {
      const child = LoomApp.host.records.get('track-1').iframe.contentWindow, state = child.PicnicApp.getState();
      state.name = 'Portable village'; state.selectedBank = 2; state.banks[2].length = 32; state.parts[0].cutoff = 3210;
      Object.assign(state.banks[2].tracks.melody[31], { on: true, notes: [79, 83], gate: 1.75 });
      await child.PicnicApp.loadState(state); window.qaPicnicDocument = child.document; window.qaPicnicBridge = child.__LoomBridge;
      return child.PicnicApp.getState();
    });
    for (const id of ['picnic-score', 'picnic-sound', 'picnic-mixer']) {
      await frame.locator('.section-navigation a[href="#' + id + '"]').click();
      const result = await page.evaluate(() => { const child = LoomApp.host.records.get('track-1').iframe.contentWindow; return { url: child.location.href, document: child.document === window.qaPicnicDocument, bridge: child.__LoomBridge === window.qaPicnicBridge, focus: child.document.activeElement?.id, state: child.PicnicApp.getState() }; });
      assert.equal(result.url, 'about:srcdoc'); assert(result.document && result.bridge); assert.equal(result.focus, id, 'Section navigation focuses its destination'); assert.deepEqual(result.state, expected);
    }
    await frame.locator('.section-navigation a[href="#picnic-sound"]').focus(); await page.keyboard.press('Enter');
    assert.equal(await frame.locator('#picnic-sound').evaluate(element => element === document.activeElement), true, 'Keyboard activation focuses the sound section');
    await frame.locator('.skip-link').focus(); await page.keyboard.press('Enter');
    assert.equal(await frame.locator('#picnic-score').evaluate(element => element === document.activeElement), true, 'Hosted skip link moves keyboard focus into the score');
    snapshot = await page.evaluate(() => LoomApp.host.snapshot('track-1')); assert.equal(snapshot.app, 'picnic');
    const portable = JSON.parse(JSON.stringify(snapshot)); assert(JSON.stringify(portable).length < 1024 * 1024);
    frame = await reset(page, portable);
    const restored = await frame.locator('body').evaluate(() => PicnicApp.getState()); assert.deepEqual(restored, expected);
    return { finalStep: restored.banks[2].tracks.melody[31], bank: 'C', cutoff: 3210, selfContainedSnapshotBytes: JSON.stringify(portable).length };
  });
  await check('Exact shared pattern validation rejects atomically and retains off-grid timing through host snapshots', async () => {
    const result = await page.evaluate(async () => {
      const child = LoomApp.host.records.get('track-1').iframe.contentWindow, adapter = child.MusicLabPatternInstrument;
      const pattern = { format: 'musiclab-pattern', version: 1, sourceApp: 'QA', name: 'Exact village notes', kind: 'notes', tempo: 119, swing: .09, lengthBeats: 4, meter: [4, 4], seed: 8197,
        voices: [{ id: 'keys', name: 'Keys' }], tags: ['qa'], notes: [
          { id: 'one', beat: .033, duration: .337, pitch: 65, velocity: .61, probability: 1, voice: 'keys' },
          { id: 'two', beat: 1.391, duration: .609, pitch: 72, velocity: .8, probability: .7, voice: 'keys' } ] };
      const before = JSON.stringify(child.PicnicApp.getState()), rejected = [];
      for (const options of [{ replace: true, voiceMap: {} }, { replace: true, voiceMap: { keys: 'missing' } }, { voiceMap: { keys: 'melody' } }]) {
        try { await adapter.importPattern({ pattern, options }); rejected.push(false); } catch (_) { rejected.push(true); }
        if (JSON.stringify(child.PicnicApp.getState()) !== before) throw Error('Rejected pattern import mutated its native project.');
      }
      await LoomApp.host.importPattern('track-1', pattern, { replace: true, voiceMap: { keys: 'melody' } });
      const state = child.PicnicApp.getState(), exported = await LoomApp.host.exportPattern('track-1'), saved = await LoomApp.host.snapshot('track-1');
      await LoomApp.host.restore('track-1', saved);
      return { rejected, source: pattern, exact: state.musicLabPattern, exported, restored: child.PicnicApp.getState().musicLabPattern };
    });
    assert.deepEqual(result.rejected, [true, true, true]); assert.deepEqual(result.exact, result.restored);
    assert.deepEqual(result.exported.notes.map(note => [note.beat, note.duration, note.pitch, note.velocity, note.probability]), result.source.notes.map(note => [note.beat, note.duration, note.pitch, note.velocity, note.probability]));
    return { rejectedImports: 3, exactNotes: result.exported.notes.length, importedOverlayRestored: true };
  });
  await check('Shared sample and pattern libraries accept authentic PICNIC output through the injected bridge', async () => {
    const evidence = await page.evaluate(async () => {
      const child = LoomApp.host.records.get('track-1').iframe.contentWindow;
      const pattern = await child.MusicLabPatternInstrument.exportPattern(), savedPattern = await child.MusicLabHost.patternLibrary.save(pattern);
      const rendered = await child.PicnicApp.exportAudio({ scope: 'pattern', bars: 1, tailSeconds: 0, includePCM: true });
      const savedAudio = await child.MusicLabHost.audioLibrary.save({ ...rendered, name: 'PICNIC shared audio QA', sourceApp: 'picnic', channels: 2 });
      const retrievedPattern = await MusicLabPatterns.get(savedPattern.id), retrievedAudio = await MusicLabExchange.get(savedAudio.id);
      const answer = { patternListed: (await MusicLabPatterns.list()).some(item => item.id === savedPattern.id), audioListed: (await MusicLabExchange.list()).some(item => item.id === savedAudio.id), notes: retrievedPattern.notes.length, channels: retrievedAudio.channels, frames: retrievedAudio.frames, audible: retrievedAudio.pcm.some(channel => channel.some(value => Math.abs(value) > .001)) };
      await MusicLabPatterns.remove(savedPattern.id); await MusicLabExchange.remove(savedAudio.id); return answer;
    });
    assert(evidence.patternListed && evidence.audioListed && evidence.audible); assert.equal(evidence.channels, 2); assert(evidence.frames > 0 && evidence.notes > 0); return evidence;
  });
  await check('GALLEY printing uses a saved native snapshot and returns finite bounded stereo samples', async () => {
    const evidence = await page.evaluate(async () => {
      const saved = await LoomApp.host.snapshot('track-1'), pattern = await LoomApp.host.exportPattern('track-1');
      const rendered = await LoomApp.host.renderPattern('track-1', { pattern, state: saved, tempo: 119, lengthBeats: 4, tailSeconds: .1 });
      if (Object.prototype.toString.call(rendered.pcm) !== '[object Float32Array]' || rendered.pcm.length % 2) throw Error('Expected interleaved stereo Float32 PCM.');
      let peak = 0, energy = 0, nonfinite = 0; for (const value of rendered.pcm) { if (!Number.isFinite(value)) nonfinite++; peak = Math.max(peak, Math.abs(value)); energy += value * value; }
      return { frames: rendered.pcm.length / 2, sampleRate: rendered.sampleRate, peak, rms: Math.sqrt(energy / rendered.pcm.length), nonfinite, stateUnchanged: JSON.stringify(saved) === JSON.stringify(await LoomApp.host.snapshot('track-1')) };
    });
    assert(evidence.frames > 1000 && evidence.peak > .001 && evidence.rms > .00001); assert(evidence.peak <= 1.001); assert.equal(evidence.nonfinite, 0); assert(evidence.stateUnchanged); return evidence;
  });
  await check('Native playback hands over to GALLEY Live notes once without a second scheduler', async () => {
    frame = await reset(page, snapshot); await page.evaluate(async () => {
      await LoomApp.host.command('track-1', 'prepare'); await LoomApp.engine.context.resume();
      await LoomApp.host.command('track-1', 'start', { when: LoomApp.engine.context.currentTime + .03, beat: 0 });
    });
    await page.waitForFunction(() => LoomApp.host.records.get('track-1').iframe.contentWindow.PicnicApp.engine.schedulingStatistics.nativeScheduled > 0);
    const native = await page.evaluate(() => { const engine = LoomApp.host.records.get('track-1').iframe.contentWindow.PicnicApp.engine; return { playing: engine.isPlaying, stats: engine.schedulingStatistics }; });
    assert(native.playing); await page.locator('#closeInstrument').click();
    await page.locator('#instrumentLive').check();
    await page.evaluate(() => { const analyser = LoomApp.engine.context.createAnalyser(); analyser.fftSize = 2048; LoomApp.engine.node.connect(analyser); window.qaPicnicAnalyser = analyser; });
    // The actual GALLEY transport prepares discrete Live playback, calls stop on
    // the native scheduler, and marks the host record as externally clocked.
    await page.locator('#playButton').click(); await page.waitForFunction(() => LoomApp.engine.getMeters().playing);
    await page.waitForFunction(() => { const values = new Float32Array(window.qaPicnicAnalyser.fftSize); window.qaPicnicAnalyser.getFloatTimeDomainData(values); return values.some(value => Math.abs(value) > .001); });
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => { const record = LoomApp.host.records.get('track-1'), engine = record.iframe.contentWindow.PicnicApp.engine; return { nativePlaying: engine.isPlaying, externalClock: record.externalClock, stats: engine.schedulingStatistics }; });
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => { const engine = LoomApp.host.records.get('track-1').iframe.contentWindow.PicnicApp.engine; return { nativePlaying: engine.isPlaying, stats: engine.schedulingStatistics, diagnostics: engine.getDiagnostics() }; });
    assert.equal(before.nativePlaying, false); assert.equal(after.nativePlaying, false); assert.equal(before.externalClock, true);
    assert.equal(after.stats.nativeScheduled, before.stats.nativeScheduled, 'GALLEY schedules discrete notes without scheduling a native phrase as well');
    assert(after.stats.scheduled > before.stats.scheduled, 'Live arrangement clocks deliver actual notes');
    const routedAudio = await page.evaluate(() => { const values = new Float32Array(window.qaPicnicAnalyser.fftSize); window.qaPicnicAnalyser.getFloatTimeDomainData(values); LoomApp.engine.node.disconnect(window.qaPicnicAnalyser); return { finite: values.every(Number.isFinite), peak: values.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0) }; });
    assert(routedAudio.finite); await page.locator('#stopButton').click(); return { native, discreteStart: before, discreteEnd: after, routedAudio };
  });
  await check('Source-specific scheduled cancellation and clip notes preserve independent sources and project state', async () => {
    frame = await open(page);
    const evidence = await page.evaluate(async () => {
      const app = LoomApp, child = app.host.records.get('track-1').iframe.contentWindow, engine = child.PicnicApp.engine;
      await app.host.command('track-1', 'prepare'); await app.engine.context.resume(); engine.panic();
      const beforeState = JSON.stringify(child.PicnicApp.getState()), when = app.engine.context.currentTime + .05;
      app.host.scheduleNote('track-1', { id: 'qa-a', voice: 'melody', pitch: 65, velocity: .7, when, durationSeconds: 1.5, source: 'qa-one' });
      app.host.scheduleNote('track-1', { id: 'qa-b', voice: 'bass', pitch: 43, velocity: .7, when, durationSeconds: 1.5, source: 'qa-two' });
      app.host.cancelNotes('track-1', { source: 'qa-one', when: when + .15 });
      await new Promise(resolve => setTimeout(resolve, 400));
      const answer = { active: engine.activeVoices, diagnostics: engine.getDiagnostics(), stateUnchanged: beforeState === JSON.stringify(child.PicnicApp.getState()) };
      app.host.cancelNotes('track-1', { source: 'qa-two', when: app.engine.context.currentTime }); engine.panic(); return answer;
    });
    assert(evidence.active > 0, 'Cancelling the first source preserves the second');
    assert.equal(evidence.diagnostics.sources['qa-one']?.active || 0, 0); assert((evidence.diagnostics.sources['qa-two']?.active || 0) > 0);
    assert(evidence.stateUnchanged); return evidence;
  });
  assert.deepEqual(errors, [], 'No browser exceptions'); assert.deepEqual(navigations, [], 'Hosted section links preserve srcdoc');
  fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify({ results, errors, navigations }, null, 2));
  console.log(JSON.stringify({ passed: results.length, errors, navigations, artifacts }, null, 2)); await context.close();
})().catch(error => { console.error(error.stack || error); if (errors.length) console.error(JSON.stringify({ browserErrors: errors }, null, 2)); process.exitCode = 1; }).finally(async () => {
  await browser?.close(); if (server) await new Promise(resolve => server.close(resolve));
});
