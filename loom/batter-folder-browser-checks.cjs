'use strict';
/* Actual GALLEY -> embedded BATTER folder picker and portable host snapshot.
 * The filesystem chooser is real; no runtime source or directory API is mocked.
 * Run against the canonical GALLEY build with exclusive Chromium access. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { createHash } = require('node:crypto');
const installed = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || (fs.existsSync(installed) ? installed : 'playwright'));
const directory = process.env.GALLEY_BATTER_FOLDER_QA_DIR || '/tmp/galley-batter-folder-browser';
const report = { passed: [], errors: [], external: [], scope: 'Real embedded BATTER folder-file input, host snapshot and GALLEY project Save/Open.' };
let browser, context, page, server, temporary;
fs.mkdirSync(directory, { recursive: true });
function save() { fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
function wav(frames, frequency) {
  const rate = 8000, bytes = Buffer.alloc(44 + frames * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) bytes.writeInt16LE(Math.round(.3 * Math.sin(2 * Math.PI * frequency * i / rate) * 32767), 44 + i * 2);
  return bytes;
}
async function serve() {
  const html = fs.readFileSync(process.env.GALLEY_BATTER_FOLDER_HTML || path.join(__dirname, 'index.html'));
  const pin = JSON.parse(fs.readFileSync(path.join(__dirname, 'instrument-release-updates.json'), 'utf8'));
  assert.equal(pin.status, 'verified-release-build', 'Pin BATTER release bytes before checking the hosted build.');
  assert.equal(pin.instrumentVersion, '1.4.0');
  report.htmlSHA256 = createHash('sha256').update(html).digest('hex'); report.batterSHA256 = pin.hashes['batter/index.html'];
  server = http.createServer((request, response) => {
    if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    if (request.url === '/loom/') { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(html); return; }
    if (request.url === '/index.html') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><title>Empty Kitchen discovery fixture</title>'); return; }
    response.writeHead(404); response.end('Only the canonical offline GALLEY page is served.');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + server.address().port + '/loom/';
}
async function openBatter() {
  await page.evaluate(() => LoomApp.selectTrack(0));
  await page.locator('[data-instrument="0"]').click();
  await page.waitForFunction(() => {
    const child = document.querySelector('iframe[data-host-track="track-1"]')?.contentWindow;
    return child?.__LoomBridge && child?.BatterUI?.engine && child?.BatterApp && child?.BatterFolderImport;
  }, null, { timeout: 30000 });
  await page.evaluate(async () => { await LoomApp.host.records.get('track-1').ready; });
  return page.frameLocator('iframe[data-host-track="track-1"]');
}
function imported(assets) { return assets.filter(asset => asset.originalPath?.includes('Hosted-kit/')).map(asset => ({ id: asset.id, name: asset.name, frames: asset.frames, sampleRate: asset.sampleRate, channels: asset.channels, originalPath: asset.originalPath, pcm: asset.pcm })).sort((a, b) => a.originalPath.localeCompare(b.originalPath)); }

(async () => {
  try {
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'galley-batter-folder-'));
    const folder = path.join(temporary, 'Hosted-kit'); fs.mkdirSync(path.join(folder, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(folder, '01-kick.wav'), wav(256, 170));
    fs.writeFileSync(path.join(folder, 'nested/02-snare.WAV'), wav(320, 290));
    fs.writeFileSync(path.join(folder, 'README.txt'), 'This non-audio file must be ignored.');
    const url = await serve(), origin = new URL(url).origin;
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    context.on('page', value => value.on('pageerror', error => report.errors.push({ message: error.message, stack: error.stack })));
    await context.route('**/*', route => {
      const request = route.request().url();
      if (/^(blob:|data:|about:)/.test(request) || request.startsWith(origin + '/')) return route.continue();
      report.external.push(request); return route.abort();
    });
    page = await context.newPage(); await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.LoomApp && window.LoomSchema);
    const decoded = await page.evaluate(async () => {
      const source = await LoomResolveEmbeddedInstrument(LoomEmbeddedInstruments.batter), bytes = new TextEncoder().encode(source);
      return { bytes: bytes.length, version: source.includes('<meta name="batter-version" content="1.4.0">'), hash: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('') };
    });
    assert(decoded.version); assert.equal(decoded.hash, report.batterSHA256);
    await page.evaluate(async () => {
      const state = LoomSchema.defaultState(); state.name = 'Hosted folder persistence'; state.tempo = 120; state.lengthBars = 2; state.loopEnd = 8; state.recording.punchEnd = 8;
      for (const owner of [...state.tracks, ...state.returns, state.master]) { owner.effects.fill(null); owner.automation = []; }
      state.tracks.forEach(track => { track.clips = []; track.instrument = null; track.instrumentLive = false; }); state.lfos.forEach(lfo => { lfo.enabled = false; lfo.routes = []; });
      state.tracks[0].instrument = { id: 'batter', name: 'BATTER' }; await LoomApp.loadState(state);
    });
    const frame = await openBatter();
    const ready = await frame.locator('#sampleFolder').evaluate(input => ({ directory: input.hasAttribute('webkitdirectory'), version: BatterSchema.VERSION, hosted: !!window.MusicLabHost, lane: BatterUI.selectedLaneId }));
    assert(ready.directory && ready.hosted); assert.equal(ready.version, '1.4.0'); assert.equal(ready.lane, 'kick');
    await frame.locator('#importMode').selectOption('lanes');
    const chooserPromise = page.waitForEvent('filechooser'); await frame.locator('#importFolderButton').click();
    const chooser = await chooserPromise; await chooser.setFiles(folder);
    await page.waitForFunction(() => {
      const child = document.querySelector('iframe[data-host-track="track-1"]')?.contentWindow;
      return child && !child.BatterUI.sampleImportBusy && !child.BatterUI.engine.importing && child.BatterUI.engine.getState().assets.filter(asset => asset.originalPath?.includes('Hosted-kit/')).length === 2;
    }, null, { timeout: 30000 });
    const first = await page.evaluate(async () => {
      const child = document.querySelector('iframe[data-host-track="track-1"]').contentWindow, state = child.BatterUI.engine.getState(), snapshot = await LoomApp.host.snapshot('track-1');
      return { state, snapshot, status: child.document.getElementById('sampleImportStatus').textContent, capabilities: LoomApp.host.capabilities('track-1').notes.voices.length };
    });
    const assets = imported(first.state.assets); assert.equal(assets.length, 2); assert.equal(first.capabilities, 12);
    assert.equal(assets[0].frames, 256); assert.equal(assets[1].frames, 320); assert(assets.every(asset => asset.sampleRate === 8000 && asset.channels === 1 && asset.pcm.length > 100));
    assert.equal(first.state.lanes[0].sampleId, assets[0].id); assert.equal(first.state.lanes[1].sampleId, assets[1].id);
    assert.deepEqual(imported(first.snapshot.state.assets), assets); assert.match(first.status, /2 sample/i);

    await page.locator('#closeInstrument').click();
    const downloadPromise = page.waitForEvent('download'); await page.locator('#saveButton').click();
    const download = await downloadPromise, saved = path.join(directory, 'hosted-folder.loom.json'); await download.saveAs(saved);
    const project = JSON.parse(fs.readFileSync(saved, 'utf8'));
    assert.equal(project.format, 'loom-project'); assert.deepEqual(imported(project.state.tracks[0].instrument.snapshot.state.assets), assets);
    await page.evaluate(async () => { const state = LoomSchema.defaultState(); state.name = 'Temporary replacement'; state.tracks.forEach(track => { track.clips = []; track.instrument = null; }); await LoomApp.loadState(state); });
    await page.locator('#projectFile').setInputFiles(saved); await page.waitForFunction(() => LoomApp.getState().name === 'Hosted folder persistence');
    await openBatter();
    const restored = await page.evaluate(async () => {
      const child = document.querySelector('iframe[data-host-track="track-1"]').contentWindow, engine = child.BatterUI.engine, state = engine.getState();
      await engine.ensureSamples(state.lanes.slice(0, 2).map(lane => lane.sampleId));
      return { state, snapshot: await LoomApp.host.snapshot('track-1'), decoded: state.lanes.slice(0, 2).map(lane => { const audio = engine.getSampleAudio(lane.sampleId); return { frames: audio.left.length, rate: audio.sampleRate, finite: audio.left.every(Number.isFinite), peak: Math.max(...audio.left.map(Math.abs)) }; }) };
    });
    assert.deepEqual(imported(restored.state.assets), assets); assert.deepEqual(imported(restored.snapshot.state.assets), assets);
    assert.deepEqual(restored.state.lanes.slice(0, 2).map(lane => lane.sampleId), first.state.lanes.slice(0, 2).map(lane => lane.sampleId));
    assert.deepEqual(restored.decoded.map(value => value.frames), [256, 320]); assert(restored.decoded.every(value => value.rate === 8000 && value.finite && value.peak > .1));
    assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []);
    const evidence = { decoded, ready, sampleCount: assets.length, paths: assets.map(asset => asset.originalPath), frames: assets.map(asset => asset.frames), sourceARoutedAcrossLanes: true, hostSnapshotPCMExact: true, actualProjectSaveOpenPCMExact: true, restoredAudio: restored.decoded };
    report.passed.push({ name: 'Actual embedded BATTER folder import, host snapshot and GALLEY Save/Open preserve nested sample PCM and paths', evidence });
    save(); console.log('PASS hosted BATTER folder import', JSON.stringify(evidence));
  } catch (error) { report.failure = { message: error.message, stack: error.stack }; console.error(error); process.exitCode = 1; }
  finally {
    await page?.evaluate(async () => { await LoomApp.host.dispose(); await LoomApp.engine.dispose(); }).catch(() => {});
    await context?.close().catch(() => {}); await browser?.close(); report.chromiumClosed = true;
    if (server) await new Promise(resolve => server.close(resolve)); if (temporary) fs.rmSync(temporary, { recursive: true, force: true }); save();
  }
})();
