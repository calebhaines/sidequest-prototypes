import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.GAME_URL || 'http://127.0.0.1:5180/sidequest-prototypes/lady-supine/';
const SAVE_KEY = 'lady-supine-open-world-v2';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const errors = [], failedAssets = [], requestedAssets = new Set();
const origin = new URL(base).origin;
function observe(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.url().startsWith(origin) && response.status() >= 400) failedAssets.push(`${response.status()} ${response.url()}`);
    if (response.url().startsWith(origin)) requestedAssets.add(response.url());
  });
  page.on('requestfailed', request => {
    if (request.url().startsWith(origin)) failedAssets.push(`${request.failure()?.errorText} ${request.url()}`);
  });
}
async function begin(page) {
  await page.goto(base);
  await page.getByRole('button', { name: /^(Begin journey|Continue journey)$/ }).click();
  await page.locator('.ow-borrowed-time').waitFor();
  assert.equal(await page.evaluate(() => typeof window.__ladySupine), 'undefined', 'The production build must omit the development control hook');
}
async function contained(page) {
  const result = await page.evaluate(() => {
    const bounds = document.querySelector('.ow-game').getBoundingClientRect();
    return {
      documentFits: document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1,
      frameFits: bounds.left >= -1 && bounds.top >= -1 && bounds.right <= innerWidth + 1 && bounds.bottom <= innerHeight + 1,
      children: [...document.querySelectorAll('.ow-canvas, .ow-vitals, .ow-borrowed-time, .ow-top-right, .ow-hotbar, .ow-dialogue, .ow-panel, .puzzle-modal, .inv-modal')].filter(element => {
        const box = element.getBoundingClientRect();
        return box.width && box.height && getComputedStyle(element).visibility !== 'hidden';
      }).map(element => {
        const box = element.getBoundingClientRect();
        return { name: element.className, inside: box.left >= bounds.left - 1 && box.top >= bounds.top - 1 && box.right <= bounds.right + 1 && box.bottom <= bounds.bottom + 1 };
      }),
      outside: [...document.querySelector('#root').children].some(element => !element.classList.contains('ow-game')),
    };
  });
  assert.ok(result.documentFits, 'The document must not scroll outside the game');
  assert.ok(result.frameFits, 'The gameplay frame must fit the browser');
  assert.ok(!result.outside, 'The root must contain only the gameplay window');
  for (const child of result.children) assert.ok(child.inside, `${child.name} must remain inside the game`);
}
async function readSave(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE_KEY); }
async function saveNow(page) {
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save journey', exact: true }).click();
  const save = await readSave(page);
  await page.keyboard.press('Escape');
  return save;
}
async function choices(page) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const next = page.locator('.ow-dialogue').getByRole('button', { name: /^Continue/ });
    if (!await next.isVisible()) return;
    await next.click();
  }
  throw new Error('Dialogue pagination failed to expose choices');
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  observe(page); await begin(page); await contained(page);
  assert.equal(await page.locator('.ow-borrowed-time strong').textContent(), '47:12');
  await page.keyboard.press('e'); await page.locator('.ow-dialogue').waitFor();
  await contained(page);
  const timeBeforeReading = await page.locator('.ow-borrowed-time strong').textContent();
  await page.keyboard.down('d'); await page.waitForTimeout(750); await page.keyboard.up('d');
  assert.equal(await page.locator('.ow-borrowed-time strong').textContent(), timeBeforeReading, 'Borrowed time must rest during dialogue');
  await choices(page);
  await page.locator('.ow-dialogue').getByRole('button', { name: /We wish to enter/ }).click();
  await choices(page);
  await page.locator('.ow-dialogue').getByRole('button', { name: /Complete the entrance application/ }).click();
  await page.locator('.puzzle-modal').waitFor(); await contained(page);
  for (const [index, value] of ['4', '7', '9'].entries()) await page.getByLabel(`Clock wheel ${index + 1}`).selectOption(value);
  await page.getByRole('button', { name: 'Ask the door', exact: true }).click();
  await page.getByRole('button', { name: 'Return to the story', exact: true }).click();
  await choices(page);
  await page.locator('.ow-dialogue').getByRole('button', { name: /Go through the little exit to the Shanty Hours/ }).click();
  const initial = await saveNow(page);
  assert.ok(initial.story.flags.includes('entrance_denied'));
  assert.ok(initial.world.waypoint, 'The story must guide real world travel');
  const pixelsBefore = await page.locator('.ow-canvas').screenshot();
  await page.keyboard.down('d'); await page.waitForTimeout(500); await page.keyboard.up('d');
  const pixelsAfter = await page.locator('.ow-canvas').screenshot();
  const moved = await saveNow(page);
  assert.ok(Math.hypot(moved.world.player.x - initial.world.player.x, moved.world.player.y - initial.world.player.y) > .4, 'Production keyboard input must physically move the player');
  assert.ok(!pixelsAfter.equals(pixelsBefore), 'Movement must visibly change the rendered gameplay');
  await page.getByRole('button', { name: 'Open map', exact: true }).first().click();
  await contained(page); await page.screenshot({ path: 'artifacts/open-world-production-map.png' });
  await page.locator('.ow-world-map-canvas').click({ position: { x: 100, y: 100 } });
  const mapSave = await saveNow(page);
  assert.deepEqual({ x: mapSave.world.player.x, y: mapSave.world.player.y }, { x: moved.world.player.x, y: moved.world.player.y }, 'The map must not teleport the player');
  for (const panel of ['Inventory', 'Crafting', 'Journal', 'Settings']) {
    await page.getByRole('button', { name: 'Open inventory', exact: true }).click();
    await page.locator('.ow-panel-nav').getByRole('button', { name: panel, exact: true }).click();
    await contained(page); await page.keyboard.press('Escape');
  }
  await page.reload(); await page.getByRole('button', { name: 'Continue journey', exact: true }).click();
  const reloaded = await readSave(page);
  assert.equal(reloaded.story.scene, mapSave.story.scene);
  assert.deepEqual(reloaded.world.player, mapSave.world.player);
  await page.screenshot({ path: 'artifacts/open-world-production-desktop.png' });

  // Open the real lazy-loaded casebook using a valid saved progress fixture.
  const fixture = { ...mapSave, story: { ...mapSave.story, investigations: { ...mapSave.story.investigations, missing_tomorrow: { stage: 0, started: true, finished: false, challenges: {} } } } };
  await page.addInitScript(({ key, fixture }) => {
    if (!sessionStorage.getItem('production-case-fixture')) {
      localStorage.setItem(key, JSON.stringify(fixture));
      sessionStorage.setItem('production-case-fixture', 'yes');
    }
  }, { key: SAVE_KEY, fixture });
  await page.reload(); await page.getByRole('button', { name: 'Continue journey', exact: true }).click();
  await page.getByRole('button', { name: 'Open journal', exact: true }).click();
  await page.getByRole('button', { name: 'Casebooks', exact: true }).click();
  await page.getByRole('button', { name: 'Continue the investigation', exact: true }).click();
  await page.locator('.inv-modal').waitFor(); await contained(page);
  await page.screenshot({ path: 'artifacts/open-world-production-casebook.png' });
  await page.keyboard.press('Escape');
  assert.ok([...requestedAssets].some(url => /InvestigationModal-.*\.js/.test(url)), 'The investigation chunk must load from the production subpage');

  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 568 }]) {
    const mobile = await browser.newPage({ viewport, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    observe(mobile); await begin(mobile); await contained(mobile);
    await mobile.getByRole('button', { name: 'Open map', exact: true }).first().click();
    await contained(mobile); await mobile.getByRole('button', { name: 'Close menu', exact: true }).click();
    await mobile.keyboard.press('e'); await mobile.locator('.ow-dialogue').waitFor(); await contained(mobile);
    await mobile.getByRole('button', { name: 'Close conversation', exact: true }).click();
    await mobile.getByRole('button', { name: 'Open pause menu', exact: true }).click();
    await contained(mobile); await mobile.getByRole('button', { name: 'Settings', exact: true }).click();
    await contained(mobile); await mobile.screenshot({ path: `artifacts/open-world-production-${viewport.width}x${viewport.height}.png` });
    await mobile.close();
  }
  assert.deepEqual(errors, [], 'The production game must not throw runtime errors');
  assert.deepEqual(failedAssets, [], 'The production subpage must load every local asset');
  console.log(`PASS: production subpage loads ${requestedAssets.size} local assets without errors; physical keyboard movement and visible rendering, gate dialogue/puzzle, paused borrowed time, map waypoints without teleport, autosave reload, lazy casebooks, all menus and HUD inside the gameplay window at desktop and three mobile sizes, development hook absent.`);
} finally { await browser.close(); }
