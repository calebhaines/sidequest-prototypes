/* Real CLATTER download regression. Rebuild tine/index.html before running.
 * PLAYWRIGHT_MODULE and CHROMIUM_PATH override the local browser installation.
 * TINE_QA_URL optionally checks the published application.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

function inspectWav(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8);
  assert.equal(bytes.toString('ascii', 12, 16), 'fmt ');
  assert.equal(bytes.readUInt16LE(20), 1);
  assert.equal(bytes.readUInt16LE(22), 2);
  assert.equal(bytes.readUInt32LE(24), 44100);
  assert.equal(bytes.readUInt16LE(34), 16);
  assert.equal(bytes.toString('ascii', 36, 40), 'data');
  assert.equal(bytes.readUInt32LE(40), bytes.length - 44);
  assert.equal((bytes.length - 44) % 4, 0);
  let peak = 0, sum = 0, lastPeak = 0;
  for (let at = 44; at < bytes.length; at += 2) {
    const value = bytes.readInt16LE(at) / 32768;
    peak = Math.max(peak, Math.abs(value)); sum += value * value;
    if (at >= bytes.length - 441 * 4) lastPeak = Math.max(lastPeak, Math.abs(value));
  }
  return { frames: (bytes.length - 44) / 4, seconds: (bytes.length - 44) / 176400, peak, rms: Math.sqrt(sum / ((bytes.length - 44) / 2)), lastPeak };
}

(async () => {
  const html = await fs.readFile(path.join(__dirname, 'index.html'));
  const server = http.createServer((_, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(html);
  });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(45000);
  try {
    await page.goto(process.env.TINE_QA_URL || `http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.TineApp?.engine && window.MusicLabPatternInstrument);
    const before = await page.evaluate(() => JSON.stringify(TineApp.getState()));
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#export-button').click(),
    ]);
    assert.equal(await download.failure(), null);
    assert.match(download.suggestedFilename(), /^clatter-.+\.wav$/);
    const full = inspectWav(await fs.readFile(await download.path()));
    const expectedBars = await page.evaluate(() => 4 * 240 / TineApp.getState().bpm);
    assert(full.seconds > expectedBars, 'Four-bar download must include the resonator tail.');
    assert(full.peak > .01 && full.rms > .0001, 'The downloaded WAV must contain audible percussion.');
    assert(full.lastPeak < .005, 'The natural tail must end smoothly.');
    await page.waitForFunction(() => !document.querySelector('#export-button').disabled);
    assert.equal(await page.locator('#export-button').getAttribute('aria-busy'), null);
    assert.equal(await page.evaluate(() => JSON.stringify(TineApp.getState())), before);

    // Samples uses this same native exporter for mix, voice, and individual strikes.
    const shared = await page.evaluate(async () => {
      const results = [];
      for (const scope of ['pattern', 'voice', 'hit']) {
        const result = await TineApp.exportAudio({ scope, bars: 1, tailSeconds: .3 });
        results.push({ scope, sourceApp: result.sourceApp, bytes: Array.from(new Uint8Array(await result.blob.arrayBuffer())) });
      }
      return results;
    });
    const scopes = shared.map(result => {
      assert.equal(result.sourceApp, 'tine');
      const stats = inspectWav(Buffer.from(result.bytes));
      assert(stats.peak > .001 && stats.rms > .00001, result.scope + ' must contain audio.');
      return { scope: result.scope, ...stats };
    });
    assert.equal(await page.evaluate(() => JSON.stringify(TineApp.getState())), before);
    const cancellation = await page.evaluate(async () => {
      const controller = new AbortController(); controller.abort();
      try { await TineApp.exportAudio({ scope: 'pattern', signal: controller.signal }); }
      catch (error) { return error.name; }
      return 'not cancelled';
    });
    assert.equal(cancellation, 'AbortError');
    assert.equal(await page.evaluate(() => JSON.stringify(TineApp.getState())), before);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ download: full, shared: scopes, statePreserved: true, cancellation, pageErrors: errors }, null, 2));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
