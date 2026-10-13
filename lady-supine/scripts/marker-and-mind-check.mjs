import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.routeWebSocket('**', socket => socket.close());
const errors = []; page.on('pageerror', error => errors.push(error.message));
const world = () => page.evaluate(() => window.__ladySupine.getWorld());
const story = () => page.evaluate(() => window.__ladySupine.getStory());
async function reveal() {
  while (await page.locator('.ow-dialogue').getByRole('button', { name: /^Continue/ }).isVisible()) await page.locator('.ow-dialogue').getByRole('button', { name: /^Continue/ }).click();
}
async function loadState(scene, flags, position, sceneId) {
  const state = await page.evaluate(({ scene, flags, position, sceneId }) => {
    const hook = window.__ladySupine, save = hook.getEngine().getSave();
    return { version: 2, savedAt: Date.now(), story: { ...hook.getStory(), scene, location: sceneId === 'castle-room' ? 'castle' : 'hospital', act: 5, flags, items: ['god_switch', 'brain_protocol', 'blank_brain'], solved: ['brain', 'switch', 'lullaby', 'minder'], investigations: {} }, world: { ...save, sceneId, player: { ...save.player, ...position }, waypoint: null } };
  }, { scene, flags, position, sceneId });
  await page.getByRole('button', { name: 'Open pause menu', exact: true }).click();
  await page.locator('.ow-pause-links').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'qa-physical-minds.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
  await page.waitForFunction(() => !window.__ladySupine.getWorld().paused);
}
try {
  await page.goto(process.env.GAME_URL || 'http://localhost:5173');
  await page.waitForFunction(() => Boolean(window.__ladySupine?.getEngine()));
  await page.getByRole('button', { name: 'Begin journey', exact: true }).click();
  const rendering = await page.evaluate(() => {
    const elements = [...document.querySelectorAll('canvas, img')];
    return { sampling: elements.map(element => getComputedStyle(element).imageRendering), smooth: document.querySelector('.ow-canvas').getContext('2d').imageSmoothingEnabled };
  });
  assert.ok(rendering.sampling.every(value => value !== 'pixelated' && value !== 'crisp-edges'), 'No visual may use pixel-art sampling');
  assert.equal(rendering.smooth, true, 'The world must render antialiased marker artwork');
  const data = await page.evaluate(() => window.__ladySupine.getData());
  const lady = data.interiors['castle-room'].actors.find(actor => actor.kind === 'lady');
  const flags = ['brain_ready', 'brain_plan', 'god_switch_obtained', 'ada_volunteered', 'ada_friend', 'minders_distracted', 'supine_asleep'];
  await loadState('castle_consent', flags, { x: lady.x, y: lady.y + 1.4 }, 'castle-room');
  await page.keyboard.press('e'); await page.locator('.ow-dialogue').waitFor(); await reveal();
  await page.locator('.ow-dialogue').getByRole('button', { name: /Activate the exchange with both lights lit/ }).click();
  await page.locator('.ow-exchange-overlay').waitFor();
  const sequence = (await world()).sequence;
  assert.equal(sequence.kind, 'exchange');
  assert.ok(Math.hypot(sequence.from.x - sequence.to.x, sequence.from.y - sequence.to.y) > .2, 'Two brains must travel between two different bodies');
  const balance = (await story()).time, before = (await world()).player;
  await page.keyboard.down('w'); await page.waitForTimeout(1100); await page.keyboard.up('w');
  assert.equal((await story()).time, balance, 'The physical procedure must not consume reading time');
  assert.deepEqual({ x: (await world()).player.x, y: (await world()).player.y }, { x: before.x, y: before.y }, 'Movement stays paused during the exchange');
  assert.ok((await world()).sequence.elapsed > sequence.elapsed, 'Organs animate even while the simulation is paused');
  await page.screenshot({ path: 'artifacts/marker-brain-exchange.png' });
  await page.locator('.ow-exchange-caption').getByRole('button', { name: /^Continue/ }).click();
  await page.locator('.ow-dialogue').waitFor();
  assert.ok((await story()).flags.includes('mind_changed'));
  await page.keyboard.press('Escape');
  // The occupied hare body is an actual NPC following the player, rather than an abstract flag.
  const carried = await page.evaluate(() => {
    const engine = window.__ladySupine.getEngine();
    const save = engine.getSave();
    engine.teleport('overworld', { x: 84, y: 70 });
    engine.setTouchDirection({ x: 1, y: 0 });
    return save;
  });
  await page.waitForTimeout(450);
  await page.evaluate(() => window.__ladySupine.getEngine().setTouchDirection({ x: 0, y: 0 }));
  // A cold scene may draw before its first nearby-actor simulation rescan.
  await page.waitForFunction(() => window.__ladySupine.getWorld().nearby?.actor?.id === 'supine-in-ada', null, { timeout: 10000 });
  assert.equal((await world()).nearby?.actor?.id, 'supine-in-ada', 'The occupied body travels into another physical scene');
  assert.match((await world()).nearby.actor.name, /Supine/);
  await page.keyboard.press('e'); await page.locator('.ow-dialogue').waitFor();
  assert.match(await page.locator('.ow-dialogue').innerText(), /Supine|body|hands|ruler/);
  await page.keyboard.press('Escape');
  const doctor = data.interiors['hospital-room'].actors.find(actor => actor.id === 'doctor');
  await loadState('hospital_return', [...flags, 'mind_changed', 'reservoir_open'], { x: doctor.x, y: doctor.y + 1.2 }, 'hospital-room');
  await page.keyboard.press('e'); await page.locator('.ow-dialogue').waitFor(); await reveal();
  await page.locator('.ow-dialogue').getByRole('button', { name: /Return Ada to her own body/ }).click();
  await page.locator('.ow-exchange-overlay').waitFor();
  assert.equal((await world()).sequence.kind, 'restore');
  await page.keyboard.press('Escape');
  await page.locator('.ow-dialogue').waitFor();
  assert.ok((await story()).flags.includes('ada_restored'));
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__ladySupine.getEngine().teleport('overworld', { x: 84, y: 70 }));
  assert.notEqual((await world()).nearby?.actor?.id, 'supine-in-ada', 'Ada returns to her own body after the hospital procedure');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open inventory', exact: true }).click();
  const bounds = await page.locator('.ow-panel').boundingBox();
  assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 391 && bounds.y + bounds.height <= 845);
  assert.deepEqual(errors, []);
  console.log('PASS: marker sampling, moving physical brains, paused procedure, visible occupied friend body across scenes, hospital restoration, mobile containment.');
} finally { await browser.close(); }
