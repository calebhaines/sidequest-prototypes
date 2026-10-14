'use strict';
// Source previews only: no published HTML or archives are changed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const installed = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || (fs.existsSync(installed) ? installed : 'playwright'));
const root = path.resolve(__dirname, '..'), artifacts = process.env.RAVEL_QA_ARTIFACTS || '/tmp/ravel-32-browser-qa';
fs.mkdirSync(artifacts, { recursive: true });
const previews = {};
for (const id of ['ravel', 'marinade']) {
  const directory = id === 'ravel' ? __dirname : path.join(root, id);
  if (!fs.existsSync(path.join(directory, 'build.py'))) continue;
  const output = path.join(artifacts, id + '.html');
  execFileSync('python3', [path.join(directory, 'build.py'), '--output', output]);
  previews[id] = fs.readFileSync(output, 'utf8');
}
const hostFiles = ['shared/pattern-schema.js', 'loom/host-bridge.js', 'loom/instrument-host.js'];
const hostAvailable = hostFiles.every(name => fs.existsSync(path.join(root, name)));
const shell = '<!doctype html><title>Kitchen host source check</title><iframe id="instrument"></iframe>' + (hostAvailable ? hostFiles.map(name => '<script>' + fs.readFileSync(path.join(root, name), 'utf8').replace(/<\/script/gi, '<\\/script') + '</script>').join('') : '');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname, id = pathname.split('/')[1];
  if (pathname === '/host') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(shell); }
  else if (previews[id]) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(previews[id]); }
  else { res.writeHead(404); res.end(); }
});
let browser;
const errors = [];
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=user-gesture-required'] });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/ravel/'); await page.waitForFunction(() => !!window.RavelApp);
  await page.evaluate(() => RavelApp.loadState(RavelSchema.defaultState()));
  await page.locator('#patternLength').selectOption('32');
  const before = await page.evaluate(() => RavelApp.getState());
  await page.locator('[data-step-page="1"]').click();
  assert.deepEqual(await page.evaluate(() => RavelApp.getState()), before, 'Page selection changes no project data');
  assert.equal(await page.locator('#stepGrid .step').count(), 16);
  await page.locator('#stepGrid [data-step="31"] .step-main').click();
  assert.equal(await page.locator('#editorStep').textContent(), 'STEP 32');
  await page.locator('#step-pitch').fill('7'); await page.locator('#stepOn').click();
  let state = await page.evaluate(() => RavelApp.getState()); assert.equal(state.patterns[0].steps[31].pitch, 7); assert(state.patterns[0].steps[31].on);
  await page.locator('#undoButton').click(); assert(!(await page.evaluate(() => RavelApp.getState())).patterns[0].steps[31].on);
  await page.locator('#stepOn').click(); state = await page.evaluate(() => RavelApp.getState());
  await page.locator('#copyButton').click(); const copied = await page.evaluate(() => RavelApp.getState());
  assert.equal(copied.patterns[1].length, 32); assert.deepEqual(copied.patterns[1].steps, copied.patterns[0].steps);
  const hidden = state.patterns[0].steps.slice(16); await page.locator('#patternLength').selectOption('16');
  assert(!(await page.locator('#stepPages').isVisible()));
  for (const selector of ['#clearButton', '#fillButton', '#shuffleButton', '#mutateButton']) await page.locator(selector).click();
  assert.deepEqual((await page.evaluate(() => RavelApp.getState())).patterns[0].steps.slice(16), hidden);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('ravel-project-v1') || '{}').state?.patterns[0].steps[31]?.pitch === 7);
  await page.reload(); await page.waitForFunction(() => !!window.RavelApp);
  assert.deepEqual((await page.evaluate(() => RavelApp.getState())).patterns[0].steps.slice(16), hidden);
  await page.locator('#patternLength').selectOption('32');
  const packet = await page.evaluate(() => MusicLabPatternInstrument.exportPattern());
  assert.equal(packet.lengthBeats, 8); assert(packet.notes.some(note => note.beat >= 7.75));
  const pending = page.waitForEvent('download'); await page.locator('#saveButton').click(); const project = await pending;
  const saved = path.join(artifacts, 'thirty-two-step.ravel.json'); await project.saveAs(saved);
  await page.evaluate(() => RavelApp.loadState(RavelSchema.defaultState())); await page.locator('#projectFile').setInputFiles(saved);
  await page.waitForFunction(() => RavelApp.getState().patterns[0].length === 32);
  assert.deepEqual((await page.evaluate(() => RavelApp.getState())).patterns[0].steps.slice(16), hidden);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await page.locator('[data-step-page="1"]').click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '32-step DICER fits ' + width + 'px');
    await page.screenshot({ path: path.join(artifacts, 'dicer-32-' + width + '.png'), fullPage: true });
  }
  console.log('PASS DICER compact pages, later-step inspector, Undo, bank copy, hidden-note tools, recovery, project and native export');
  for (const fallback of [false, true]) {
    const live = await context.newPage(); live.on('pageerror', error => errors.push(error.message));
    if (fallback) await live.addInitScript(() => Object.defineProperty(AudioContext.prototype, 'audioWorklet', { get: () => undefined, configurable: true }));
    await live.goto(origin + '/ravel/'); await live.waitForFunction(() => !!window.RavelApp);
    await live.evaluate(() => { const s = RavelSchema.defaultState(); s.tempo = 180; s.swing = 0; s.patterns[0].length = 32;
      s.patterns.forEach(pattern => pattern.steps.forEach(step => step.on = false)); s.patterns[0].steps[31].on = true; RavelApp.loadState(s); RavelApp.selectStep(31); });
    await live.locator('#playButton').click();
    await live.waitForFunction(() => RavelApp.engine.getMeters().triggered > 0 && RavelApp.engine.getMeters().peak > .001, null, { timeout: 20000 });
    await live.waitForFunction(() => document.querySelector('#stepGrid [data-step="31"]').classList.contains('playing'), null, { timeout: 20000 });
    await live.locator('#panicButton').click(); await live.close();
  }
  console.log('PASS DICER step 32 plays live and lights the existing grid through AudioWorklet and fallback');
  if (hostAvailable) {
    const host = await context.newPage(); host.on('pageerror', error => errors.push(error.message)); await host.goto(origin + '/host');
    for (const id of Object.keys(previews)) {
      const result = await host.evaluate(async ({ id, html }) => {
        window.qaContext ||= new AudioContext(); const input = qaContext.createGain(); input.connect(qaContext.destination);
        window.qaHost ||= new LoomInstrumentHost({ context: qaContext, getTrackInput: () => input, baseURL: new URL('/', location.href).href });
        document.getElementById('instrument')?.remove(); let iframe = document.createElement('iframe'); iframe.id = 'instrument'; document.body.append(iframe); const facade = id === 'ravel' ? 'RavelApp' : 'MarinadeApp';
        await qaHost.load('track-1', { id, html }, iframe); let child = iframe.contentWindow, app = child[facade], state = app.getState();
        if (id === 'ravel') { state.patterns[0].length = 32; state.patterns[0].steps[31].on = true; state.patterns[0].steps[31].pitch = 7; }
        else { state.sequence.division = '1/16'; state.sequence.length = 32; Object.assign(state.sequence.steps[31], { on: true, note: 79 }); }
        await app.loadState(state); const snapshot = await qaHost.snapshot('track-1'); qaHost.unload('track-1'); iframe.remove(); iframe = document.createElement('iframe'); iframe.id = 'instrument'; document.body.append(iframe);
        await qaHost.load('track-1', { id, html, snapshot }, iframe); child = iframe.contentWindow; app = child[facade]; state = app.getState();
        const pattern = qaHost.getPatternAdapter('track-1').exportPattern();
        const out = id === 'ravel' ? { length: state.patterns[0].length, later: state.patterns[0].steps[31].pitch, patternLength: pattern.lengthBeats } : { length: state.sequence.length, later: state.sequence.steps[31].note, patternLength: pattern.lengthBeats };
        qaHost.unload('track-1'); iframe.remove(); return out;
      }, { id, html: previews[id] });
      assert.equal(result.length, 32); assert.equal(result.patternLength, 8); assert.equal(result.later, id === 'ravel' ? 7 : 79);
      console.log('PASS ' + id.toUpperCase() + ' real GALLEY host snapshot/unload/restore retains length and later-step data');
    }
    await host.close();
  }
  assert.deepEqual(errors, []); await context.close();
  console.log('Browser artifacts: ' + artifacts);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
