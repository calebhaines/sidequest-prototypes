import { chromium, firefox } from '@playwright/test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';

const source = resolve(process.env.HTML_FILE || 'dist/lady-supine.html');
const webUrl = process.env.GAME_URL || 'http://127.0.0.1:5180/sidequest-prototypes/lady-supine/';
const SAVE_KEY = 'lady-supine-open-world-v2';
// Managed CI browsers may prohibit the file scheme. This explicit fallback
// executes the exact same bytes from an in-memory document, with no server.
// Keep the default file mode for direct local-file verification elsewhere.
const transport = process.env.HTML_TRANSPORT || 'file';
assert.ok(['file', 'memory'].includes(transport), 'HTML_TRANSPORT must be file or memory');
const offlineUrl = transport === 'memory' ? 'http://offline-game.test/lady-supine.html' : null;
const work = await mkdtemp(join(tmpdir(), 'lady-supine-offline-'));
const gameDirectory = join(work, 'game');
await mkdir(gameDirectory);
const copiedFile = join(gameDirectory, 'lady-supine.html');
await copyFile(source, copiedFile);
assert.deepEqual(await readdir(gameDirectory), ['lady-supine.html'], 'The offline copy must have no companion files');
await mkdir('artifacts', { recursive: true });
const expectedBytes = await readFile(source);
const browserType = process.env.BROWSER_TYPE || 'chromium';
assert.ok(['chromium', 'firefox'].includes(browserType), 'BROWSER_TYPE must be chromium or firefox');
const browser = browserType === 'firefox'
  ? await firefox.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) })
  : await chromium.launch({ executablePath: process.env.BROWSER_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const errors = [], offlineRequests = [];
let renamedServer;

function observe(page, offline = false) {
  page.on('pageerror', error => errors.push(error.message));
  if (offline) page.on('request', request => {
    if (/^https?:/i.test(request.url()) && request.url() !== offlineUrl) offlineRequests.push(request.url());
  });
}
async function begin(page, url) {
  if (url) await page.goto(url);
  await contained(page);
  await page.getByRole('button', { name: /^(Begin journey|Continue journey)$/ }).click();
  await page.locator('.ow-borrowed-time').waitFor();
  assert.equal(await page.evaluate(() => typeof window.__ladySupine), 'undefined', 'The downloadable game must omit the development hook');
}
async function contained(page) {
  const result = await page.evaluate(() => {
    const frame = document.querySelector('.ow-game').getBoundingClientRect();
    return {
      documentFits: document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1,
      frameFits: frame.left >= -1 && frame.top >= -1 && frame.right <= innerWidth + 1 && frame.bottom <= innerHeight + 1,
      children: [...document.querySelectorAll('.ow-title-card, .ow-canvas, .ow-vitals, .ow-borrowed-time, .ow-top-right, .ow-hotbar, .ow-dialogue, .ow-panel, .puzzle-modal, .inv-modal')].filter(element => {
        const box = element.getBoundingClientRect();
        return box.width && box.height && getComputedStyle(element).visibility !== 'hidden';
      }).map(element => {
        const box = element.getBoundingClientRect();
        return { name: element.className, inside: box.left >= frame.left - 1 && box.top >= frame.top - 1 && box.right <= frame.right + 1 && box.bottom <= frame.bottom + 1 };
      }),
    };
  });
  assert.ok(result.documentFits, 'The document must stay inside the browser viewport');
  assert.ok(result.frameFits, 'The gameplay window must fit the viewport');
  for (const child of result.children) assert.ok(child.inside, `${child.name} must remain inside the gameplay window`);
}
async function readSave(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE_KEY); }
async function saveNow(page) {
  await page.getByRole('button', { name: 'Open pause menu', exact: true }).click();
  await page.getByRole('button', { name: 'Save journey', exact: true }).click();
  const save = await readSave(page);
  await page.getByRole('button', { name: 'Close menu', exact: true }).click();
  return save;
}
async function dialogueChoices(page) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const next = page.locator('.ow-dialogue').getByRole('button', { name: /^Continue/ });
    if (!await next.isVisible()) return;
    await next.click();
  }
  throw new Error('Dialogue pagination failed to expose its choices');
}
async function openSettings(page) {
  await page.getByRole('button', { name: 'Open inventory', exact: true }).click();
  await page.locator('.ow-panel-nav').getByRole('button', { name: 'Settings', exact: true }).click();
}
async function openCase(page) {
  await page.getByRole('button', { name: 'Open journal', exact: true }).click();
  await page.getByRole('button', { name: 'Casebooks', exact: true }).click();
  await page.getByRole('button', { name: 'Continue the investigation', exact: true }).click();
  await page.locator('.inv-modal').waitFor();
  await contained(page);
}
async function downloadHtml(page) {
  const link = page.getByRole('link', { name: /download.*html/i }).first();
  await link.waitFor();
  const href = await link.getAttribute('href');
  assert.ok(href, 'The HTML download must be an actual link');
  const downloadPromise = page.waitForEvent('download');
  await link.click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^lady-supine\.html$/i, 'The download must have a descriptive HTML filename');
  const path = join(work, `download-${Date.now()}.html`);
  await download.saveAs(path);
  assert.ok((await readFile(path)).equals(expectedBytes), 'The download must contain the entire generated game, byte for byte');
  if (/^https?:/i.test(new URL(href, page.url()).href)) {
    const response = await page.request.get(new URL(href, page.url()).href);
    assert.equal(response.status(), 200);
    assert.match(response.headers()['content-type'] || '', /text\/html/i, 'The downloadable resource must have an HTML MIME type');
  }
}

try {
  // Read the production HTML itself before running it: active resource elements must be embedded.
  const offlineContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', offline: true });
  await offlineContext.route(/^https?:\/\//, route => route.request().url() === offlineUrl
    ? route.fulfill({ status: 200, contentType: 'text/html', body: expectedBytes })
    : route.abort('internetdisconnected'));
  const local = await offlineContext.newPage();
  observe(local, true);
  await begin(local, offlineUrl || pathToFileURL(copiedFile).href);
  await contained(local);
  const resources = await local.evaluate(() => [...document.querySelectorAll('script[src], link[rel="stylesheet"][href], img[src], audio[src], video[src], source[src]')].map(element => element.getAttribute('src') || element.getAttribute('href')).filter(value => value && !/^(data:|blob:)/i.test(value)));
  assert.deepEqual(resources, [], 'Every active game resource must be embedded in the HTML');
  assert.equal(await local.locator('.ow-borrowed-time strong').textContent(), '47:12');

  // Use the real entrance conversation and clock puzzle without any development controls.
  await local.keyboard.press('e');
  await local.locator('.ow-dialogue').waitFor();
  const readingTime = await local.locator('.ow-borrowed-time strong').textContent();
  await local.keyboard.down('d'); await local.waitForTimeout(250); await local.keyboard.up('d');
  assert.equal(await local.locator('.ow-borrowed-time strong').textContent(), readingTime, 'Reading must suspend the borrowed clock offline');
  await dialogueChoices(local);
  await local.locator('.ow-dialogue').getByRole('button', { name: /We wish to enter/ }).click();
  await dialogueChoices(local);
  await local.locator('.ow-dialogue').getByRole('button', { name: /Complete the entrance application/ }).click();
  await local.locator('.puzzle-modal').waitFor(); await contained(local);
  for (const [index, value] of ['4', '7', '9'].entries()) await local.getByLabel(`Clock wheel ${index + 1}`).selectOption(value);
  await local.getByRole('button', { name: 'Ask the door', exact: true }).click();
  await local.getByRole('button', { name: 'Return to the story', exact: true }).click();
  await dialogueChoices(local);
  await local.locator('.ow-dialogue').getByRole('button', { name: /Go through the little exit to the Shanty Hours/ }).click();
  const initial = await saveNow(local);
  assert.ok(initial.story.flags.includes('entrance_denied'));
  assert.ok(initial.story.solved.includes('entrance'));
  const pixelsBefore = await local.locator('.ow-canvas').screenshot();
  await local.keyboard.down('d'); await local.waitForTimeout(650); await local.keyboard.up('d');
  const pixelsAfter = await local.locator('.ow-canvas').screenshot();
  const moved = await saveNow(local);
  assert.ok(Math.hypot(moved.world.player.x - initial.world.player.x, moved.world.player.y - initial.world.player.y) > .4, 'Offline keyboard input must physically move the player');
  assert.ok(!pixelsBefore.equals(pixelsAfter), 'The offline game must render movement');
  await local.reload(); await begin(local);
  const reloaded = await readSave(local);
  assert.equal(reloaded.story.scene, moved.story.scene);
  assert.deepEqual(reloaded.world.player, moved.world.player, 'The browser must restore the local-file save after reload');

  // Open the real bundled lazy casebook with isolated valid progress, then enter actual evidence answers.
  const fixture = { ...moved, story: { ...moved.story, investigations: { ...moved.story.investigations, missing_tomorrow: { stage: 0, started: true, finished: false, challenges: {} } } } };
  await local.addInitScript(({ key, fixture }) => {
    if (!sessionStorage.getItem('single-html-case-fixture')) {
      localStorage.setItem(key, JSON.stringify(fixture));
      sessionStorage.setItem('single-html-case-fixture', 'yes');
    }
  }, { key: SAVE_KEY, fixture });
  await local.reload(); await begin(local); await openCase(local);
  await local.getByLabel('Vellum · counter 1 — Seal', { exact: true }).selectOption('Green Door');
  const partial = (await readSave(local)).story.investigations.missing_tomorrow;
  assert.equal(partial.challenges.afternoon_ledger.answers['vellum.seal'], 'Green Door');
  await local.keyboard.press('Escape'); await local.reload(); await begin(local); await openCase(local);
  assert.equal(await local.getByLabel('Vellum · counter 1 — Seal', { exact: true }).inputValue(), 'Green Door', 'Partial case notes must survive local-file reload');
  for (const [clerk, seal, error] of [
    ['Vellum · counter 1', 'Green Door', 'Absent witness'],
    ['Fen · counter 2', 'Copper Leaf', 'Blank address'],
    ['Silt · counter 3', 'Black Bell', 'Reversed date'],
    ['Rook · counter 4', 'Blue Thread', 'Duplicate kiss'],
    ['Moss · counter 5', 'White Eye', 'Missing name'],
  ]) {
    await local.getByLabel(`${clerk} — Seal`, { exact: true }).selectOption(seal);
    await local.getByLabel(`${clerk} — Recorded defect`, { exact: true }).selectOption(error);
  }
  const caseTime = await local.locator('.ow-borrowed-time strong').textContent();
  await local.getByRole('button', { name: 'Check the deduction', exact: true }).click();
  assert.ok((await readSave(local)).story.investigations.missing_tomorrow.challenges.afternoon_ledger.solved, 'The embedded casebook must validate real answers');
  assert.equal(await local.locator('.ow-borrowed-time strong').textContent(), caseTime);
  await local.keyboard.press('Escape');
  await local.screenshot({ path: 'artifacts/single-html-offline-desktop.png' });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await local.setViewportSize(viewport); await local.reload(); await begin(local); await contained(local);
    for (const panel of ['Map', 'Inventory', 'Settings']) {
      await local.getByRole('button', { name: 'Open inventory', exact: true }).click();
      await local.locator('.ow-panel-nav').getByRole('button', { name: panel, exact: true }).click();
      await contained(local);
      if (panel === 'Settings') {
        await local.getByRole('switch', { name: 'Game audio', exact: true }).click();
        assert.equal(await local.getByRole('switch', { name: 'Game audio', exact: true }).getAttribute('aria-checked'), 'true');
        await local.getByRole('switch', { name: 'Game audio', exact: true }).click();
      }
      await local.getByRole('button', { name: 'Close menu', exact: true }).click();
    }
  }
  await local.screenshot({ path: 'artifacts/single-html-offline-mobile.png' });
  assert.deepEqual(offlineRequests, [], 'The local file must make no HTTP requests even when the casebook and audio are used');
  console.log(`PASS: ${browserType} ${transport} offline gameplay, saves, casebook, responsive menus, and audio; zero external HTTP requests.`);

  // Verify both normal website links and transfer an actual website export into the offline copy.
  const webContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true });
  const web = await webContext.newPage(); observe(web);
  await web.goto(webUrl); await contained(web);
  await web.screenshot({ path: 'artifacts/single-html-website-title-desktop.png' });
  await web.setViewportSize({ width: 390, height: 844 }); await contained(web);
  await web.screenshot({ path: 'artifacts/single-html-website-title-mobile.png' });
  await web.setViewportSize({ width: 1440, height: 900 }); await downloadHtml(web);
  await begin(web); await openSettings(web); await contained(web);
  await web.getByRole('link', { name: /download.*html/i }).scrollIntoViewIfNeeded();
  await web.screenshot({ path: 'artifacts/single-html-website-settings.png' });
  await downloadHtml(web);
  const exportPromise = web.waitForEvent('download');
  await web.getByRole('button', { name: 'Export save', exact: true }).click();
  const exported = await exportPromise;
  const savePath = join(work, 'website-journey.json'); await exported.saveAs(savePath);
  const websiteSave = JSON.parse(await readFile(savePath, 'utf8'));
  assert.equal(websiteSave.version, 2);
  await local.setViewportSize({ width: 1440, height: 900 }); await openSettings(local);
  await local.locator('input[type="file"]').setInputFiles(savePath);
  await local.waitForFunction(() => !document.querySelector('.ow-panel'));
  const imported = await readSave(local);
  assert.deepEqual(imported.story.flags, websiteSave.story.flags);
  assert.deepEqual(imported.world.player, websiteSave.world.player, 'An exported website save must restore in the local file');
  await local.reload(); await begin(local);
  assert.deepEqual((await readSave(local)).world.player, websiteSave.world.player);

  // A user may rename the portable HTML and host it anywhere. Its download
  // link must still download that document rather than an assumed filename.
  const renamedRequests = [];
  renamedServer = createServer((request, response) => {
    renamedRequests.push(request.url);
    if (request.url !== '/my-renamed-game.html') { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(expectedBytes);
  });
  await new Promise(resolve => renamedServer.listen(0, '127.0.0.1', resolve));
  const renamedUrl = `http://127.0.0.1:${renamedServer.address().port}/my-renamed-game.html`;
  const renamed = await webContext.newPage(); observe(renamed);
  await renamed.goto(renamedUrl);
  assert.equal(await renamed.getByRole('link', { name: /download.*html/i }).getAttribute('href'), renamedUrl, 'A renamed standalone page must download its current document');
  await downloadHtml(renamed);
  assert.ok(renamedRequests.every(path => path === '/my-renamed-game.html'), 'The renamed standalone page must need no companion files');
  assert.deepEqual(offlineRequests, []);
  assert.deepEqual(errors, [], 'Both website and local-file versions must run without runtime errors');
  console.log(`PASS: a single ${(expectedBytes.length / 1024 / 1024).toFixed(2)} MB HTML copied alone opens ${transport === 'file' ? 'over file://' : 'as an in-memory document (file:// blocked by the managed CI browser)'} with zero external HTTP requests while offline; real gate dialogue/puzzle, keyboard movement, paused clock, save reload, bundled casebook validation and partial-note persistence, desktop/small-mobile menus, generated audio, complete website title/settings downloads, website JSON-save transfer, and a renamed standalone HTTP download all work.`);
} finally {
  await browser.close();
  if (renamedServer) await new Promise(resolve => renamedServer.close(resolve));
  await rm(work, { recursive: true, force: true });
}
