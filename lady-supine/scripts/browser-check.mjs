import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.GAME_URL || 'http://localhost:5173';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
await page.routeWebSocket('**', socket => socket.close());
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('lady-supine-adventure-v1')));

try {
  await page.goto(base);
  await page.locator('h1').waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('h1').textContent(), 'The Unenterable Entrance');
  assert.equal((await state()).scene, 'gate_arrival');
  assert.equal(await page.locator('.time-value').innerText().then(s => s.split('\n')[0]), '47:12');
  await page.locator('.inline-scene').waitFor();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'artifacts/desktop.png', fullPage: true });

  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  assert.equal(await page.locator('.journal-chapter').count(), 6);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Pockets', exact: true }).click();
  await page.getByText('Empty pockets. An open road.').waitFor();
  await page.keyboard.press('Escape');

  await page.locator('.choice-button').first().click();
  assert.equal((await state()).scene, 'gate_wish');
  const puzzleIndex = await page.evaluate(async () => {
    const { SCENES } = await import('/src/data/campaign.ts');
    const current = JSON.parse(localStorage.getItem('lady-supine-adventure-v1'));
    return SCENES[current.scene].choices.findIndex(c => c.puzzle === 'entrance');
  });
  assert.ok(puzzleIndex >= 0, 'Gate wish should offer the entrance puzzle');
  await page.locator('.choice-button').nth(puzzleIndex).click();
  await page.getByLabel('Clock wheel 1').selectOption('4');
  await page.getByLabel('Clock wheel 2').selectOption('7');
  await page.getByLabel('Clock wheel 3').selectOption('9');
  await page.getByRole('button', { name: 'Ask the door' }).click();
  await page.getByRole('button', { name: 'Return to the story', exact: true }).click();
  assert.ok((await state()).solved.includes('entrance'));
  const resumedScene = (await state()).scene;
  await page.reload();
  await page.locator('h1').waitFor();
  assert.equal((await state()).scene, resumedScene, 'Reload should preserve story progress');

  const beforeTravel = (await state()).time;
  await page.getByRole('button', { name: 'The land', exact: true }).click();
  await page.locator('.map-location.unlocked').filter({ hasText: 'Lake' }).first().click();
  assert.equal((await state()).location, 'lake');
  assert.equal((await state()).time, beforeTravel, 'Map travel should not spend reading time');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Larger text', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Larger text', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('.app.large-text').count());

  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('lady-supine-adventure-v1')); save.time = 0;
    localStorage.setItem('lady-supine-adventure-v1', JSON.stringify(save));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Accept a little more time' }).click();
  assert.equal((await state()).time, 1200);
  assert.ok((await state()).flags.includes('hospital_debt'));

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Larger text', exact: true }).click();
  await page.getByRole('button', { name: 'Start a new journey', exact: true }).click();
  await page.getByRole('button', { name: 'Start a new journey', exact: true }).click();
  assert.equal((await state()).scene, 'gate_arrival');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.inline-scene').waitFor();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Mobile should not overflow horizontally');
  await page.getByRole('button', { name: 'The land', exact: true }).click();
  await page.screenshot({ path: 'artifacts/mobile-map.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Map modal should fit mobile');
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log('PASS: opening puzzle, autosave/resume, journal, inventory, map, settings, recovery, restart and responsive layout.');
} finally {
  await browser.close();
}
