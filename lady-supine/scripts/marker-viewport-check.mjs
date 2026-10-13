import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.routeWebSocket('**', socket => socket.close());
const errors = []; page.on('pageerror', error => errors.push(error.message));
const engine = (method, ...args) => page.evaluate(({ method, args }) => window.__ladySupine.getEngine()[method](...args), { method, args });
const report = { viewports: [], framesPerSecond: 0, screenshots: [] };

async function screenshot(name) {
  const path = `artifacts/marker-${name}.png`;
  await page.screenshot({ path }); report.screenshots.push(path);
}
async function contained(selector = '.ow-panel') {
  const result = await page.evaluate(selector => {
    const frame = document.querySelector('.ow-game').getBoundingClientRect();
    const element = document.querySelector(selector), box = element.getBoundingClientRect();
    return { frame: { width: frame.width, height: frame.height }, box: { x: box.x, y: box.y, width: box.width, height: box.height },
      inside: box.left >= frame.left - 1 && box.top >= frame.top - 1 && box.right <= frame.right + 1 && box.bottom <= frame.bottom + 1,
      fits: element.scrollWidth <= element.clientWidth + 1,
      documentFits: document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1 };
  }, selector);
  assert.ok(result.inside, `${selector} must stay inside the gameplay window`);
  assert.ok(result.fits, `${selector} must not overflow its own width`);
  assert.ok(result.documentFits, 'The document must not scroll beyond the game');
  return result;
}
async function close() { await page.keyboard.press('Escape'); await page.waitForTimeout(100); }

try {
  await page.goto(process.env.GAME_URL || 'http://localhost:5173');
  await page.waitForFunction(() => Boolean(window.__ladySupine?.getEngine()));
  await screenshot('title-desktop');
  await page.getByRole('button', { name: 'Begin journey', exact: true }).click();
  await page.waitForFunction(() => !window.__ladySupine.getWorld().paused);
  const data = await page.evaluate(() => window.__ladySupine.getData());
  for (const id of ['shanty', 'lake', 'forest', 'fields', 'castle']) {
    const region = data.regions.find(region => region.id === id);
    await engine('teleport', data.overworld.id, region.landmark);
    await page.waitForTimeout(250);
    await screenshot(`${id}-desktop`);
  }
  const room = data.interiors['castle-room'], lady = room.actors.find(actor => actor.kind === 'lady');
  assert.ok(lady, 'Supine must be a physical woman inside a walkable room');
  await engine('teleport', room.id, { x: lady.x, y: lady.y + 1.7 });
  await page.waitForTimeout(250); await screenshot('supine-physical-head');
  // Count actual world-canvas draws, rather than browser animation callbacks.
  await page.evaluate(() => {
    window.__qaWorldDraws = 0;
    window.__qaSetTransform = CanvasRenderingContext2D.prototype.setTransform;
    CanvasRenderingContext2D.prototype.setTransform = function (...args) {
      if (this.canvas.classList.contains('ow-canvas')) window.__qaWorldDraws++;
      return window.__qaSetTransform.call(this, ...args);
    };
    window.__qaDrawStart = performance.now();
  });
  await page.waitForTimeout(2500);
  report.framesPerSecond = await page.evaluate(() => {
    const fps = window.__qaWorldDraws / ((performance.now() - window.__qaDrawStart) / 1000);
    CanvasRenderingContext2D.prototype.setTransform = window.__qaSetTransform;
    return Number(fps.toFixed(1));
  });
  assert.ok(report.framesPerSecond > 15, 'The actual painted world must continue animating at a playable rate');
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport); await page.waitForTimeout(160);
    const controls = await page.evaluate(() => [...document.querySelectorAll('.ow-hud-buttons button, .ow-hotbar-slot')].map(element => {
      const box = element.getBoundingClientRect();
      return { label: element.getAttribute('aria-label'), inside: box.left >= -1 && box.top >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1 };
    }));
    assert.ok(controls.every(control => control.inside), `HUD controls must fit ${viewport.width}×${viewport.height}`);
    await page.getByRole('button', { name: 'Open inventory', exact: true }).click();
    const panels = [];
    for (const panel of ['Inventory', 'Crafting', 'Journal', 'Settings', 'Map']) {
      await page.locator('.ow-panel-nav').getByRole('button', { name: panel, exact: true }).click();
      await page.waitForTimeout(100);
      panels.push({ panel, ...(await contained()) });
      if (panel === 'Inventory' || panel === 'Map') await screenshot(`${panel.toLowerCase()}-${viewport.width}x${viewport.height}`);
    }
    const sampling = await page.evaluate(() => [...document.querySelectorAll('canvas, img')].map(element => ({ sampling: getComputedStyle(element).imageRendering,
      smooth: element.tagName === 'CANVAS' ? element.getContext('2d')?.imageSmoothingEnabled : true })));
    assert.ok(sampling.every(element => element.sampling !== 'pixelated' && element.sampling !== 'crisp-edges' && element.smooth), 'All active artwork must use smooth marker sampling');
    await close(); report.viewports.push({ ...viewport, panels });
    await screenshot(`world-${viewport.width}x${viewport.height}`);
  }
  assert.deepEqual(errors, []);
  await writeFile('artifacts/marker-viewport-report.json', JSON.stringify(report, null, 2));
  console.log(`PASS: all HUD controls and five menus contained at four viewport sizes; smooth artwork, physical Supine and ${report.framesPerSecond} actual world draws/s. ${report.screenshots.length} visual review screenshots saved.`);
} finally { await browser.close(); }
