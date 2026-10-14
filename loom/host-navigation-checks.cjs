'use strict';

// Exercise the real bundled editor. A fragment must never reload its srcdoc
// frame through the instrument's <base>, losing the injected audio bridge.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = fs.readFileSync(process.env.LOOM_NAV_QA_FILE || path.join(__dirname, 'index.html'));
const passed = [], errors = [], requests = [];
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  response.setHeader('Content-Type', 'text/html');
  if (pathname === '/loom/index.html') return response.end(html);
  if (pathname === '/index.html') return response.end('<!doctype html><title>Kitchen discovery fixture</title>');
  response.writeHead(404); response.end('Hosted instruments must remain in their embedded document.');
});
let browser;

async function open(page) {
  await page.locator('#openInstrumentButton').click();
  await page.waitForFunction(() => window.LoomApp.host.records.get('track-1')?.loaded);
  await page.evaluate(() => window.LoomApp.host.records.get('track-1').ready);
  return page.frameLocator('iframe[data-host-track="track-1"]');
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = process.env.LOOM_NAV_QA_URL || 'http://127.0.0.1:' + server.address().port + '/loom/index.html';
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.isNavigationRequest() && request.frame() !== page.mainFrame() && /^https?:/.test(request.url())) requests.push(request.url()); });
    await page.goto(url); await page.waitForFunction(() => !!window.LoomApp);
    await page.evaluate(async () => {
      const state = window.LoomSchema.defaultState(); state.tracks[0].instrument = { id: 'roux', name: 'ROUX' };
      await window.LoomApp.loadState(state); window.LoomApp.selectTrack(0);
    });
    let frame = await open(page);
    const expected = await page.evaluate(async () => {
      const record = window.LoomApp.host.records.get('track-1'), child = record.iframe.contentWindow;
      const state = child.RouxApp.getState(); state.name = 'Keep my edits'; state.recipe.length = 32; state.synth.cutoff = 3210;
      await child.RouxApp.loadState(state);
      window.qaDocument = child.document; window.qaBridge = child.__LoomBridge;
      return child.RouxApp.getState();
    });
    for (const id of ['roux-recipe', 'roux-clocks', 'roux-sound', 'roux-output', 'roux-stop']) {
      await frame.locator('a[href="#' + id + '"]').click();
      const result = await page.evaluate(id => {
        const record = window.LoomApp.host.records.get('track-1'), child = record.iframe.contentWindow;
        return { url: child.location.href, sameDocument: child.document === window.qaDocument, sameBridge: child.__LoomBridge === window.qaBridge,
          focus: child.document.activeElement?.id, scrolled: child.scrollY > 0, state: child.RouxApp?.getState() };
      }, id);
      assert.equal(result.url, 'about:srcdoc', id + ' stays in the hosted document');
      assert(result.sameDocument && result.sameBridge, id + ' preserves the injected host bridge');
      assert.equal(result.focus, id); assert(result.scrolled, id + ' scrolls to its section');
      assert.deepEqual(result.state, expected, id + ' retains all native edits');
    }
    await frame.locator('a[href="#roux-sound"]').focus(); await page.keyboard.press('Enter');
    assert.equal(await frame.locator('#roux-sound').evaluate(element => element === document.activeElement), true, 'Keyboard activation focuses the section');
    await frame.locator('[data-tab="motion"]').click();
    assert.equal(await frame.locator('[data-tab="motion"]').getAttribute('aria-selected'), 'true');
    const snapshot = await page.evaluate(() => window.LoomApp.host.snapshot('track-1'));
    assert.deepEqual(snapshot.state, expected, 'GALLEY can snapshot the intact editor after navigation');
    await page.evaluate(async () => {
      const app = window.LoomApp; await app.engine.init(); await app.engine.context.resume();
      const analyser = app.engine.context.createAnalyser(); analyser.fftSize = 2048; app.engine.node.connect(analyser); window.qaAnalyser = analyser;
      await app.host.command('track-1', 'prepare');
    });
    await frame.locator('#auditionButton').click();
    await page.waitForFunction(() => { const samples = new Float32Array(window.qaAnalyser.fftSize); window.qaAnalyser.getFloatTimeDomainData(samples); return samples.some(value => Math.abs(value) > .001); }, null, { timeout: 5000 });
    await page.locator('#closeInstrument').click(); frame = await open(page);
    assert.deepEqual(await frame.locator('body').evaluate(() => window.RouxApp.getState()), expected, 'Closing and reopening preserves the edited instrument');
    await page.evaluate(() => window.LoomApp.engine.dispose());
    await context.close();
    passed.push(width + 'px: five ROUX section links, keyboard focus, Sound tabs, unchanged edits, GALLEY snapshot, routed audio and reopen');
  }
  assert.deepEqual(requests, [], 'Section navigation makes no instrument document requests');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed, errors, requests }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
});
