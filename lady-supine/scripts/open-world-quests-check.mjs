import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.routeWebSocket('**', socket => socket.close());
const errors = []; page.on('pageerror', error => errors.push(error.message));
const story = () => page.evaluate(() => window.__ladySupine.getStory());
const world = () => page.evaluate(() => window.__ladySupine.getWorld());
const engine = (method, ...args) => page.evaluate(({ method, args }) => window.__ladySupine.getEngine()[method](...args), { method, args });
async function importState(storyOverrides, position, inventoryOverrides = {}) {
  const saved = await page.evaluate(({ storyOverrides, position, inventoryOverrides }) => {
    const hook = window.__ladySupine, current = hook.getEngine().getSave();
    return { version: 2, savedAt: Date.now(), story: { ...hook.getStory(), ...storyOverrides }, world: { ...current, sceneId: 'overworld', player: { ...current.player, ...position }, inventory: { ...current.inventory, ...inventoryOverrides } } };
  }, { storyOverrides, position, inventoryOverrides });
  await page.getByRole('button', { name: 'Open pause menu', exact: true }).click();
  await page.locator('.ow-pause-links').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'qa-journey.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await page.waitForFunction(() => !document.querySelector('.ow-panel-overlay') && !window.__ladySupine.getWorld().paused);
  assert.equal((await story()).scene, storyOverrides.scene);
}
async function reveal() { while (await page.locator('.ow-dialogue').getByRole('button', { name: /^Continue/ }).isVisible()) await page.locator('.ow-dialogue').getByRole('button', { name: /^Continue/ }).click(); }
async function speak() { await page.keyboard.press('e'); await page.locator('.ow-dialogue').waitFor(); await reveal(); }
async function close() { await page.keyboard.press('Escape'); await page.waitForTimeout(100); }
try {
  await page.goto(process.env.GAME_URL || 'http://localhost:5173');
  await page.waitForFunction(() => Boolean(window.__ladySupine?.getEngine()));
  await page.getByRole('button', { name: 'Begin journey', exact: true }).click();
  await page.waitForFunction(() => !window.__ladySupine.getWorld().paused);
  const data = await page.evaluate(() => window.__ladySupine.getData());
  const mallow = data.overworld.actors.find(actor => actor.id === 'mallow');
  const cinder = data.overworld.actors.find(actor => actor.id === 'cinder');
  const flags = ['entrance_denied', 'papers_obtained', 'willow_rhyme', 'coupon_validated'];
  const items = ['refusal', 'identity_papers', 'willow_verse'];

  // Story setup uses the production save-import menu. The quest handoffs themselves
  // use their real actor, real resource inventory, and production controller.
  await importState({ scene: 'lake_arrival', location: 'lake', act: 2, flags, items, solved: [] }, { x: mallow.x, y: mallow.y + 1.1 }, { fish: 0 });
  await speak();
  await page.locator('.ow-dialogue').getByRole('button', { name: /Catch three fish for the kitchen/ }).click();
  assert.equal(await page.locator('.ow-dialogue').count(), 0);
  assert.equal(await page.locator('.puzzle-modal').count(), 0, 'Fishing must happen in the world instead of opening a fishing widget');
  assert.ok(!(await story()).flags.includes('willow_cutting_found'));
  assert.ok(!(await story()).items.includes('willow_cutting'));
  await engine('addResource', 'fish', 3);
  await speak();
  await page.locator('.ow-dialogue').getByRole('button', { name: /Catch three fish for the kitchen/ }).click();
  assert.ok((await story()).flags.includes('willow_cutting_found'));
  assert.ok((await story()).items.includes('willow_cutting'));
  assert.ok((await story()).solved.includes('fishing'));
  assert.equal((await world()).inventory.fish, 0, 'Mallow consumes the actual three fish');
  assert.equal(await page.locator('.puzzle-modal').count(), 0);
  await close();

  await importState({ scene: 'forest_path', location: 'forest', flags: [...flags, 'willow_cutting_found'], items: [...items, 'willow_cutting'], solved: ['fishing'] }, { x: cinder.x, y: cinder.y + 1.1 }, { willow_fibre: 0 });
  await speak();
  await page.locator('.ow-dialogue').getByRole('button', { name: /Follow the willow through the shifting paths/ }).click();
  assert.equal(await page.locator('.puzzle-modal').count(), 0, 'The forest puzzle waits for real willow resources');
  assert.equal(await page.locator('.ow-dialogue').count(), 0);
  assert.ok(!(await story()).flags.includes('willow_gathered'));
  assert.ok((await story()).items.includes('willow_cutting'), 'A failed handoff keeps the living cutting');
  const fallen = data.overworld.objects.find(object => object.id === 'fallen-curly-willow');
  assert.ok(fallen?.resource?.amount >= 3, 'Fallen willow offers a way to gather without felling the story tree');
  await engine('teleport', data.overworld.id, { x: fallen.x, y: fallen.y + .3 });
  await page.keyboard.press('e');
  assert.ok((await world()).inventory.willow_fibre >= 3, 'E gathers the physical fallen willow');
  await engine('teleport', data.overworld.id, { x: cinder.x, y: cinder.y + 1.1 });
  await speak();
  await page.locator('.ow-dialogue').getByRole('button', { name: /Follow the willow through the shifting paths/ }).click();
  await page.locator('.puzzle-modal').waitFor();
  await page.getByRole('button', { name: 'Fold the leaf', exact: true }).click();
  for (const name of ['Willow', 'Raven', 'Lantern', 'Moon']) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Return to the story', exact: true }).click();
  assert.ok((await story()).flags.includes('willow_gathered'));
  assert.ok((await story()).items.includes('curly_willow'));
  assert.ok(!(await story()).items.includes('willow_cutting'));
  assert.equal((await world()).inventory.willow_fibre, 0, 'The accepted forest handoff consumes exactly three fibres');
  await close();

  const crop = data.overworld.objects.find(object => object.kind === 'crop' && object.x > 115 && object.x < 130 && object.y > 90);
  const herbs = (await world()).inventory.herb || 0;
  await engine('teleport', data.overworld.id, { x: crop.x, y: crop.y + .3 });
  await page.keyboard.press('e');
  assert.equal((await world()).inventory.herb || 0, herbs, 'Fields harvesting needs the abundance permit');
  assert.ok(!(await world()).harvested[crop.id]);
  await importState({ scene: 'fields_arrival', location: 'fields', flags: [...(await story()).flags, 'fields_permit'] }, { x: crop.x, y: crop.y + .3 });
  await page.keyboard.press('e');
  assert.ok((await world()).inventory.herb > herbs, 'The issued permit allows physical fields harvesting');

  const castleDoor = data.overworld.objects.find(object => object.door?.scene === 'castle-room');
  const threshold = { x: castleDoor.x + castleDoor.width / 2, y: castleDoor.y + castleDoor.height + 1.1 };
  await engine('teleport', data.overworld.id, threshold);
  await page.keyboard.press('e');
  assert.equal((await world()).sceneId, data.overworld.id, 'The bedchamber stays physically closed before the minders hand over');
  await page.locator('.ow-dialogue').waitFor(); await close();
  await importState({ scene: 'castle_arrival', location: 'castle', act: 5, flags: [...(await story()).flags, 'brain_ready', 'god_switch_obtained', 'ada_volunteered', 'minders_distracted'] }, threshold);
  await page.keyboard.press('e');
  assert.equal((await world()).sceneId, 'castle-room', 'The quiet handover unlocks the actual castle interior');
  const injured = await engine('getSave');
  await engine('load', { ...injured, player: { ...injured.player, health: 1, stamina: 5 } });
  await page.getByRole('button', { name: 'Open inventory', exact: true }).click();
  await page.getByRole('button', { name: /^Shanty soup: / }).click();
  await page.getByRole('button', { name: 'Use this', exact: true }).click();
  assert.equal((await world()).player.health, Math.min(39, injured.player.maxHealth), 'Food heals physical health while the inventory is open');
  assert.equal((await world()).player.stamina, injured.player.maxStamina);
  await close();
  const patrol = data.overworld.actors.find(actor => actor.hostile);
  await importState({ scene: 'castle_changed', location: 'forest', flags: [...(await story()).flags, 'reservoir_open'] }, { x: patrol.x, y: patrol.y + 1.3 });
  assert.equal((await world()).enemies, 0, 'Opening the reservoir ends nearby time-stealing patrols');
  const peaceful = { health: (await world()).player.health, time: (await story()).time };
  await page.waitForTimeout(1600);
  assert.equal((await world()).player.health, peaceful.health, 'A relieved Aristobat must stop attacking');
  assert.equal((await story()).time, peaceful.time, 'A relieved Aristobat must stop stealing time');
  assert.deepEqual(errors, []);
  console.log('PASS: production save import; real fish/fallen-willow quest handoffs block without resources and consume actual inventory; forest puzzle commits story items; Fields permit blocks/allows harvest; castle door opens only after the minders handover; inventory food restores health/stamina; opened reservoir ends Aristobat attacks/time theft.');
} finally { await browser.close(); }
