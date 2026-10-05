/** Native Music Lab exchange regression. Build/package first.
 * PLAYWRIGHT_MODULE and CHROMIUM_PATH use the same overrides as test-playback.mjs.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(moduleName) ? pathToFileURL(moduleName).href : moduleName);
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
(async () => {
  const server = http.createServer((_, response) => { response.setHeader('Content-Type', 'text/html'); response.end(fs.readFileSync(path.resolve(root, 'releases/FORM.html'))); });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.FormApp && window.MusicLabExchange);
    await page.waitForSelector('.topbar-actions .ml-ex-launcher', { timeout: 10000 });
    await page.getByRole('button', { name: 'Open shared sample library' }).click();
    assert.equal(await page.locator('.ml-ex-dialog select[name="target"] option').count(), 24);
    await page.getByRole('button', { name: 'Close sample exchange' }).click();
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      const layout = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        launcherRight: document.querySelector('.topbar-actions .ml-ex-launcher').getBoundingClientRect().right,
      }));
      assert.equal(layout.document, width, `FORM page overflow at ${width}px`);
      assert(layout.launcherRight <= width, `FORM sample launcher overflow at ${width}px`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const result = await page.evaluate(async () => {
      const app = window.FormApp;
      const check = (condition, message) => { if (!condition) throw Error(message); };
      const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const wait = () => new Promise(resolve => setTimeout(resolve, 70));
      const before = app.getState();
      const targets = app.audioImport.targets;
      check(targets.length === 24 && new Set(targets.map(t => t.id)).size === 24, '24 unique layer targets');
      const pcm = new Float32Array(48000 * 2);
      for (let frame = 0; frame < 48000; frame++) { pcm[frame * 2] = Math.sin(frame / 48000 * Math.PI * 2 * 440) * 0.3; pcm[frame * 2 + 1] = pcm[frame * 2] * 0.5; }
      let rejected = 0;
      const occupied = targets.find(t => t.occupied);
      for (const input of [
        { pcm, sampleRate: 48000, options: { target: occupied.id } },
        { pcm, sampleRate: 48000, options: { target: 'bad', replace: true } },
        { pcm, sampleRate: 0, options: { target: '6:b', replace: true } },
        { pcm: new Float32Array(48000 * 4 + 2), sampleRate: 48000, options: { target: '6:b', replace: true } },
        { pcm: new Float32Array([NaN, 0, 0, 0]), sampleRate: 48000, options: { target: '6:b', replace: true } },
      ]) { try { await app.importAudio(input); } catch (_) { rejected++; } }
      check(rejected === 5 && equal(before, app.getState()), 'Invalid or unconfirmed imports preserve project');
      const imported = await app.importAudio({ pcm, sampleRate: 48000, name: 'Shared <texture>', options: { target: '6:b', replace: true } });
      await wait();
      const after = app.getState();
      const layer = after.sounds[6].architecture.layers[1];
      check(layer.engine === 'granular' && layer.enabled && layer.granular.source === 'sample', 'Granular import enables chosen layer');
      check(layer.granular.sample.sampleRate === 22050 && layer.granular.sample.data.length === 22050, 'Bandlimited 22.05 kHz mono conversion');
      check(layer.granular.sample.data.every(Number.isFinite), 'Imported PCM finite');
      const preserved = JSON.parse(JSON.stringify(after));
      preserved.sounds[6].architecture.layers[1] = before.sounds[6].architecture.layers[1];
      check(equal(preserved, before), 'Other layers, voices, routes, envelopes and sequencer remain exact');
      const voice = app.exportAudio({ scope: 'voice', voice: 6, sampleRate: 44100 });
      check(voice.pcm instanceof Float32Array && voice.pcm.length > 0 && voice.pcm.every(Number.isFinite), 'Selected voice renders finite stereo PCM');
      check(voice.pcm.some(v => Math.abs(v) > 0.0001) && voice.sourceApp === 'form' && voice.tempo === after.bpm, 'Voice export has audible signal and provenance');
      const pattern = app.exportAudio({ scope: 'pattern', bars: 1, sampleRate: 44100 });
      check(pattern.pcm.length === Math.ceil(after.steps[0].length * 60 / after.bpm / 4 * 44100) * 2, 'Pattern exports exact loop duration without tail');
      check(pattern.bars === after.steps[0].length / 16, 'Pattern bar metadata tracks actual pattern length');
      const tail = app.exportAudio({ scope: 'pattern', bars: 1, sampleRate: 44100, tailSeconds: 0.25 });
      check(tail.pcm.length === pattern.pcm.length + 11025 * 2, 'Requested effect tail has exact duration');
      const controller = new AbortController(); controller.abort();
      let cancelled = 0;
      try { app.exportAudio({ signal: controller.signal }); } catch (e) { if (e.name === 'AbortError') cancelled++; }
      try { await app.importAudio({ pcm, sampleRate: 48000, options: { target: '6:b', replace: true }, signal: controller.signal }); } catch (e) { if (e.name === 'AbortError') cancelled++; }
      check(cancelled === 2 && equal(app.getState(), after), 'Cancelled audio transfers preserve state');
      window.__formBefore = before; window.__formAfter = after;
      return { targets: targets.length, rejected, import: imported, voiceFrames: voice.pcm.length / 2, patternFrames: pattern.pcm.length / 2, cancellationChecks: cancelled };
    });
    await page.locator('body').click({ position: { x: 1400, y: 900 } });
    await page.keyboard.press('Control+z');
    await page.waitForFunction(() => JSON.stringify(FormApp.getState()) === JSON.stringify(window.__formBefore));
    await page.keyboard.press('Control+Shift+z');
    await page.waitForFunction(() => JSON.stringify(FormApp.getState()) === JSON.stringify(window.__formAfter));
    const transport = await page.evaluate(async () => {
      const pending = FormApp.play(); FormApp.stop(); await pending;
      if (FormApp.isPlaying()) throw Error('Stop must cancel pending warmup');
      await FormApp.prepare(); await FormApp.play();
      if (!FormApp.isPlaying()) throw Error('Native transport play failed');
      FormApp.panic();
      if (FormApp.isPlaying()) throw Error('Native panic failed');
      const wrapper = { project: window.__formBefore }; FormApp.loadState(wrapper);
      if (JSON.stringify(FormApp.getState()) !== JSON.stringify(window.__formBefore)) throw Error('Project load did not restore exact state');
      return { audioContext: FormApp.engine.audioContext.state, stopped: !FormApp.isPlaying() };
    });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result, transport, headerSamplePanel: true, undoRedo: true, pageErrors: errors }, null, 2));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
