'use strict';

// Exercise the real standalone UI and production Worklet. The microphone is a
// deterministic Web Audio MediaStream; no physical input or external server is
// needed. Run this without another Chromium audio job.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const directory = process.env.RECORDING_CAPACITY_BROWSER_DIR || '/tmp/galley-recording-capacity-browser';
const legacy = process.env.RECORDING_CAPACITY_EXPECT_LEGACY === '1';
const MiB = 1024 * 1024, sourceBytes = 4 * 120 * 48000 * 4;
const report = { passed: [], errors: [], external: [], legacy, sourceBytes };
fs.mkdirSync(directory, { recursive: true });
let server, browser, activeCheck = 'startup';
function save() { fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
async function check(name, run) {
  activeCheck = name;
  const at = Date.now(), evidence = await run();
  report.passed.push({ name, milliseconds: Date.now() - at, evidence });
  save(); console.log('PASS', name, JSON.stringify(evidence));
}
async function serve() {
  const html = fs.readFileSync(process.env.RECORDING_CAPACITY_HTML || path.join(__dirname, 'index.html'));
  report.htmlSHA256 = createHash('sha256').update(html).digest('hex');
  let fullHTML;
  if (!legacy) {
    const source = html.toString('utf8'), field = /totalPcmBytes:\s*256\s*\*\s*1024\s*\*\s*1024/g;
    assert.equal([...source.matchAll(field)].length, 1, 'Scale only the production shared PCM limit for the exact-full boundary');
    fullHTML = Buffer.from(source.replace(field, 'totalPcmBytes: ' + sourceBytes));
    report.fullBoundaryHTMLSHA256 = createHash('sha256').update(fullHTML).digest('hex');
  }
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    const content = pathname === '/loom/' ? html : pathname === '/full/' ? fullHTML : null;
    if (!content) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(content);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + server.address().port;
}
async function open(base, full = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => localStorage.setItem('loom-recovery-enabled', '0'));
  await context.route('**/*', route => {
    const url = route.request().url();
    if (/^(data:|blob:|about:)/.test(url) || new URL(url).origin === base) return route.continue();
    report.external.push(url); return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.errors.push({ check: activeCheck, message: error.message, stack: error.stack }));
  await page.goto(base + (full ? '/full/' : '/loom/'), { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => !!window.LoomApp);
  await page.evaluate(() => {
    window.capacityQA = { requests: 0, sources: [], streams: [] };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      const qa = window.capacityQA, context = LoomApp.engine.context;
      qa.requests++;
      const source = context.createOscillator(), gain = context.createGain(), destination = context.createMediaStreamDestination();
      source.frequency.value = 173; gain.gain.value = .1; source.connect(gain); gain.connect(destination); source.start();
      qa.sources.push(source); qa.streams.push(destination.stream); return destination.stream;
    } });
    window.capacityQA.load = async bytes => {
      const state = LoomSchema.defaultState(), frames = bytes / 16, pcm = 'A'.repeat(Math.floor(frames * 4 / 3) * 4) + ['', 'AA==', 'AAA='][frames * 4 % 3];
      if (!Number.isInteger(frames)) throw Error('Fixture byte count must divide into four stereo assets');
      state.name = 'Retained recordings and a fresh microphone take'; state.tempo = 120; state.lengthBars = 64; state.loopEnabled = false; state.loopEnd = 256;
      state.master.effects.fill(null); state.master.metronome = false;
      for (const bus of [...state.returns, ...state.buses]) bus.effects.fill(null);
      state.recording.micCompensation = 'off'; state.recording.countInBars = 0; state.recording.punchEnabled = false;
      for (let index = 0; index < 4; index++) {
        const asset = { id: 'retained-source-' + index, name: 'Retained recording ' + (index + 1), sampleRate: 48000, channels: 2, frames, duration: frames / 48000, pcm };
        state.assets.push(asset);
        state.tracks[index].clips = [{ id: 'retained-clip-' + index, name: asset.name, type: 'audio', assetId: asset.id, start: 0, length: asset.duration * 2, sourceStart: 0, sourceEnd: asset.duration, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: 1, fadeIn: 0, fadeOut: 0 }];
      }
      window.capacityQA.originalAssets = state.assets.map(asset => ({ ...asset }));
      window.capacityQA.originalClips = JSON.stringify(state.tracks.slice(0, 4).map(track => track.clips));
      await LoomApp.loadState(state); LoomApp.selectTrack(4);
      return { sourceBytes: state.assets.reduce((sum, asset) => sum + asset.frames * asset.channels * 2, 0), assets: state.assets.length, version: LoomSchema.VERSION, capacity: LoomSchema.audioCapacity?.(state) || null };
    };
    window.capacityQA.preserved = state => {
      const qa = window.capacityQA;
      return qa.originalAssets.every(expected => { const actual = state.assets.find(asset => asset.id === expected.id); return actual && actual.pcm === expected.pcm && actual.frames === expected.frames && actual.sampleRate === expected.sampleRate && actual.channels === expected.channels; }) && JSON.stringify(state.tracks.slice(0, 4).map(track => track.clips)) === qa.originalClips;
    };
  });
  return { context, page };
}
async function close(context, page) {
  try { await page.evaluate(async () => { for (const source of capacityQA.sources) { try { source.stop(); } catch (_) {} } if (LoomApp.engine.context) await LoomApp.engine.dispose(); }); }
  finally { await context.close(); }
}
async function legacyFailure(base) {
  const { context, page } = await open(base);
  try {
    await check('Released build reproduces the recording error just below its 64 MiB source limit', async () => {
      const fixture = await page.evaluate(bytes => capacityQA.load(bytes), 64 * MiB - 4096);
      await page.locator('#recordSource').selectOption('microphone'); await page.locator('#recordButton').click();
      await page.waitForFunction(() => /reached its audio memory limit/.test(document.getElementById('status').textContent));
      const evidence = await page.evaluate(() => ({ requests: capacityQA.requests, recording: LoomApp.engine.isRecording, preserved: capacityQA.preserved(LoomApp.getState()), status: document.getElementById('status').textContent }));
      assert.equal(evidence.requests, 0); assert.equal(evidence.recording, false); assert.equal(evidence.preserved, true); return { fixture, ...evidence };
    });
  } finally { await close(context, page); }
}
async function largeRecording(base) {
  const { context, page } = await open(base);
  try {
    await check('A project above 64 MiB records real microphone audio through the normal UI without losing existing sources', async () => {
      const fixture = await page.evaluate(bytes => capacityQA.load(bytes), sourceBytes);
      assert(fixture.sourceBytes > 64 * MiB); assert.equal(fixture.capacity.sourceBytes, sourceBytes); assert.equal(fixture.capacity.sourceAvailableBytes, 256 * MiB - sourceBytes);
      await page.locator('#recordSource').selectOption('microphone'); await page.evaluate(() => LoomApp.engine.seek(2));
      await page.locator('#recordButton').click();
      try { await page.waitForFunction(() => LoomApp.engine.isRecording); }
      catch (error) { throw Error('Record did not start: ' + await page.locator('#status').textContent(), { cause: error }); }
      await page.waitForFunction(() => LoomApp.engine.getMeters().recordSeconds > .35);
      await page.locator('#stopButton').click();
      await page.waitForFunction(() => !LoomApp.engine.recordingBusy && Object.keys(LoomApp.assets).length === 5 && !document.getElementById('recordButton').disabled);
      const evidence = await page.evaluate(() => {
        const state = LoomApp.getState(), clip = state.tracks[4].clips[0], asset = state.assets.find(asset => asset.id === clip?.assetId), audio = asset && LoomSchema.decodeAsset(asset);
        let energy = 0, peak = 0;
        for (const sample of audio?.left || []) { energy += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
        return { requests: capacityQA.requests, mode: LoomApp.engine.mode, sourceCount: state.assets.length, preserved: capacityQA.preserved(state), clip, recordedFrames: asset?.frames, sampleRate: asset?.sampleRate, rms: Math.sqrt(energy / Math.max(1, audio?.left.length || 0)), peak, status: document.getElementById('status').textContent };
      });
      assert.equal(evidence.requests, 1); assert.equal(evidence.mode, 'worklet'); assert.equal(evidence.sourceCount, 5); assert.equal(evidence.preserved, true);
      assert(evidence.recordedFrames > 0); assert(evidence.rms > .01 && evidence.peak < .2); assert(Math.abs(evidence.clip.start - 2) < 1e-8);
      assert(Math.abs(evidence.clip.length - evidence.recordedFrames / evidence.sampleRate * 2) < 2 / evidence.sampleRate);
      assert(!/limit|budget|exceed/i.test(evidence.status)); return { fixture, ...evidence };
    });
    await check('The enlarged recorded project saves, reopens and reloads with byte-identical source PCM and clip timing', async () => {
      const evidence = await page.evaluate(async () => {
        const before = LoomApp.getState(), json = LoomSchema.serializeProject(before), reopened = LoomSchema.parseProject(json);
        const exact = reopened.assets.every(asset => asset.pcm === before.assets.find(value => value.id === asset.id)?.pcm), clipsExact = JSON.stringify(reopened.tracks.map(track => track.clips)) === JSON.stringify(before.tracks.map(track => track.clips));
        await LoomApp.loadState(reopened);
        return { bytes: LoomSchema.projectByteLength(json), assets: reopened.assets.length, exact, clipsExact, preserved: capacityQA.preserved(LoomApp.getState()), version: LoomSchema.VERSION };
      });
      assert(evidence.bytes > 64 * MiB && evidence.bytes < 448 * MiB); assert.equal(evidence.assets, 5); assert(evidence.exact && evidence.clipsExact && evidence.preserved); return evidence;
    });
  } finally { await close(context, page); }
}
async function fullBoundary(base) {
  const { context, page } = await open(base, true);
  try {
    await check('An exact-full shared budget rejects before microphone permission and preserves every retained recording', async () => {
      const fixture = await page.evaluate(bytes => capacityQA.load(bytes), sourceBytes);
      assert.equal(fixture.capacity.sourceAvailableBytes, 0); assert.equal(fixture.capacity.freezeAvailableBytes, 0);
      await page.locator('#recordSource').selectOption('microphone'); await page.locator('#recordButton').click();
      await page.waitForFunction(() => !document.getElementById('recordButton').disabled && /audio|memory|recording|budget|full/i.test(document.getElementById('status').textContent));
      const evidence = await page.evaluate(() => ({ requests: capacityQA.requests, recording: LoomApp.engine.isRecording, sourceCount: LoomApp.getState().assets.length, preserved: capacityQA.preserved(LoomApp.getState()), status: document.getElementById('status').textContent }));
      assert.equal(evidence.requests, 0); assert.equal(evidence.recording, false); assert.equal(evidence.sourceCount, 4); assert.equal(evidence.preserved, true);
      assert.match(evidence.status, /full|limit|budget|room|available/i);
      await page.locator('#recordingsButton').click();
      assert(await page.locator('#recordingsDialog').evaluate(dialog => dialog.open), 'The cleanup drawer remains available after a full-budget rejection');
      assert.match(await page.locator('#recordingsStorage').textContent(), /0 B available/);
      assert.equal(await page.locator('#recordingsList [data-recording-id]').count(), 4);
      await page.locator('#closeRecordings').click();
      return { fixture, ...evidence, cleanupDrawerAvailable: true, scaledSharedLimit: sourceBytes };
    });
  } finally { await close(context, page); }
}
(async () => {
  try {
    const base = await serve();
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    if (legacy) await legacyFailure(base); else { await largeRecording(base); await fullBoundary(base); }
    assert.deepEqual(report.errors, [], 'No hidden page errors'); assert.deepEqual(report.external, [], 'No external runtime dependencies');
    console.log('Recording capacity browser:', report.passed.length, 'groups passed.', directory);
  } catch (error) { report.failure = { check: activeCheck, message: error.stack || String(error) }; console.error(error); process.exitCode = 1; }
  finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); save(); }
})();
