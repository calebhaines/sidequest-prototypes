import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.GAME_URL || 'http://localhost:5173';
const SAVE_KEY = 'lady-supine-open-world-v2';
const LEGACY_KEY = 'lady-supine-adventure-v1';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
let page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await page.routeWebSocket('**', socket => socket.close());
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const world = () => page.evaluate(() => window.__ladySupine.getWorld());
const story = () => page.evaluate(() => window.__ladySupine.getStory());
const engine = (method, ...args) => page.evaluate(({ method, args }) => window.__ladySupine.getEngine()[method](...args), { method, args });
async function waitForSimulation(seconds = .5) {
  const started = (await world()).elapsed;
  await page.waitForFunction(({ started, seconds }) => window.__ladySupine.getWorld().elapsed - started >= seconds, { started, seconds }, { timeout: 8000 });
}

async function enterGame() {
  await page.locator('.ow-game').waitFor();
  await page.waitForFunction(() => Boolean(window.__ladySupine?.getEngine()));
  const start = page.getByRole('button', { name: /^(Begin journey|Continue journey)$/ });
  if (await start.isVisible()) await start.click();
  await page.locator('.ow-canvas').waitFor();
  await page.waitForFunction(() => !window.__ladySupine.getWorld().paused);
}

async function contained(selectors = '.ow-dialogue, .ow-panel-overlay, .puzzle-modal, .inv-modal') {
  const result = await page.evaluate(selectors => {
    const frame = document.querySelector('.ow-game').getBoundingClientRect();
    const visible = [...document.querySelectorAll(selectors)].filter(element => {
      const box = element.getBoundingClientRect();
      return box.width && box.height && getComputedStyle(element).visibility !== 'hidden';
    });
    return {
      noOverflow: document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1,
      frameFits: frame.left >= -1 && frame.top >= -1 && frame.right <= innerWidth + 1 && frame.bottom <= innerHeight + 1,
      panels: visible.map(element => {
        const rect = element.getBoundingClientRect();
        return { selector: element.className, inside: rect.left >= frame.left - 1 && rect.top >= frame.top - 1 && rect.right <= frame.right + 1 && rect.bottom <= frame.bottom + 1 };
      }),
    };
  }, selectors);
  assert.ok(result.noOverflow, 'The document must never scroll outside the game window');
  assert.ok(result.frameFits, 'The game window must fit the viewport');
  for (const panel of result.panels) assert.ok(panel.inside, `${panel.selector} must stay inside the game window`);
}

async function closeModal() {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
}

async function revealChoices() {
  for (let attempt = 0; attempt < 30; attempt++) {
    const next = page.locator('.ow-dialogue').getByRole('button', { name: /^Continue/ });
    if (!(await next.isVisible())) break;
    await next.click();
  }
}

async function approachActor(actorId) {
  const target = await page.evaluate(actorId => {
    const data = window.__ladySupine.getData();
    const scenes = [data.overworld, ...Object.values(data.interiors)];
    for (const scene of scenes) {
      const actor = scene.actors.find(entry => entry.id === actorId);
      if (actor) return { scene: scene.id, position: { x: actor.x, y: actor.y + 1.1 } };
    }
    return null;
  }, actorId);
  assert.ok(target, `World must contain ${actorId}`);
  await engine('teleport', target.scene, target.position);
  await page.waitForTimeout(160);
  await page.keyboard.press('e');
  await page.locator('.ow-dialogue').waitFor();
  return target;
}

try {
  await page.goto(base);
  await enterGame();
  assert.equal((await story()).scene, 'gate_arrival');
  assert.equal((await story()).time, 47 * 60 + 12);
  await contained();

  // Movement is driven through physical keyboard input; a canvas alone is not sufficient.
  const origin = await world();
  await page.keyboard.down('d'); await page.waitForTimeout(450); await page.keyboard.up('d');
  const moved = await world();
  assert.ok(Math.hypot(moved.player.x - origin.player.x, moved.player.y - origin.player.y) > 0.4, 'WASD must physically move the player');
  assert.equal(moved.sceneId, origin.sceneId);
  assert.ok(moved.explored.length, 'Walking reveals world map chunks');

  // Map clicks set waypoints; they cannot move the player or bypass travel.
  await page.getByRole('button', { name: 'Open map', exact: true }).first().click();
  await page.locator('.ow-world-map-canvas').waitFor();
  await contained(); await page.screenshot({ path: 'artifacts/open-world-map.png' });
  const beforeMap = await world();
  await page.locator('.ow-world-map-canvas').click({ position: { x: 100, y: 100 } });
  const afterMap = await world();
  assert.ok(afterMap.waypoint, 'Map click must place a world waypoint');
  assert.deepEqual({ x: afterMap.player.x, y: afterMap.player.y }, { x: beforeMap.player.x, y: beforeMap.player.y }, 'Map click must not teleport');
  await contained();
  assert.equal(await page.locator('.ow-panel-overlay').count(), 0, 'Choosing a waypoint returns to the world');

  // All tools and menus belong to the game frame.
  await page.getByRole('button', { name: 'Open inventory', exact: true }).click();
  await page.locator('.ow-panel-nav').getByRole('button', { name: /^Inventory/ }).waitFor();
  await contained();
  await page.locator('.ow-panel-nav').getByRole('button', { name: /^Crafting/ }).click();
  const recipes = await page.evaluate(async () => (await import('/src/openworld/items.ts')).RECIPES);
  assert.ok(recipes.length >= 4, 'The world needs actual craftable recipes');
  const recipe = recipes.find(entry => !entry.station) || recipes[0];
  for (const [item, quantity] of Object.entries(recipe.ingredients)) await engine('addResource', item, quantity);
  const resultBefore = (await world()).inventory[recipe.result] || 0;
  assert.equal(await engine('craft', recipe.id), true, 'Recipe ingredients should craft a real item');
  assert.equal((await world()).inventory[recipe.result], resultBefore + recipe.amount);
  await closeModal();

  // Conversation stops movement and borrowed-time spending while prose is read.
  const data = await page.evaluate(() => window.__ladySupine.getData());

  // Fixed architecture blocks movement, and doors enter actual rooms with their own floorplan.
  const libraryDoor = data.overworld.objects.find(object => object.door?.scene === 'library-room');
  await engine('teleport', data.overworld.id, { x: libraryDoor.x + libraryDoor.width / 2, y: libraryDoor.y + libraryDoor.height + .8 });
  await page.keyboard.down('w'); await page.waitForTimeout(600); await page.keyboard.up('w');
  assert.ok((await world()).player.y >= libraryDoor.y + libraryDoor.height, 'A building footprint must block movement');
  await page.keyboard.press('e');
  assert.equal((await world()).sceneId, 'library-room', 'The library door must enter a physical interior');
  const library = data.interiors['library-room'];
  await engine('teleport', library.id, library.exit.positionInRoom);
  await page.keyboard.press('e');
  assert.equal((await world()).sceneId, data.overworld.id, 'Interior exits must return to the outside door');

  // Only setup uses engine methods: harvesting, building, fishing, and fighting use actual action input.
  async function prepare(position, selected = 0, facing = -Math.PI / 2) {
    const current = await engine('getSave');
    await engine('load', { ...current, sceneId: data.overworld.id, selected, player: { ...current.player, ...position, facing, stamina: current.player.maxStamina } });
    // Tool cooldowns run on simulation time. Waiting only on wall time flakes
    // when another headless painting suite competes for the same CPU.
    await waitForSimulation();
  }
  const tree = data.overworld.objects.find(object => object.kind === 'tree' && object.resource && object.x > 10 && object.x < 40 && object.y > 110);
  assert.ok(tree, 'The world needs reachable trees for harvesting');
  await prepare({ x: tree.x, y: tree.y + 1.1 }, 1);
  const timber = (await world()).inventory.wood || 0;
  for (let hit = 0; hit < tree.resource.health; hit++) { await page.keyboard.press('Space'); await waitForSimulation(); }
  assert.equal((await world()).inventory.wood, timber + tree.resource.amount, 'Axe swings must add timber from a real tree');
  assert.ok((await world()).harvested[tree.id], 'A harvested tree must leave the world and regrow later');

  await prepare(data.overworld.spawn, 0, Math.PI);
  const placedBefore = (await world()).placed.length;
  await engine('beginBuild', recipe.result);
  await page.keyboard.press('Space');
  assert.equal((await world()).placed.length, placedBefore + 1, 'A crafted campfire must be placeable in the physical world');

  await prepare({ x: 72.5, y: 110.5 }, 3, 0);
  const fishBefore = (await world()).inventory.fish || 0;
  await page.keyboard.press('Space');
  assert.equal((await world()).fishing?.phase, 'waiting', 'The fishing rod must cast into nearby water');
  await page.waitForFunction(() => window.__ladySupine.getWorld().fishing?.phase === 'bite', null, { timeout: 6500 });
  await page.keyboard.press('Space');
  assert.ok((await world()).inventory.fish > fishBefore, 'Reeling a bite must catch an inventory fish');

  const bat = data.overworld.actors.find(actor => actor.hostile);
  await prepare({ x: bat.x, y: bat.y + 1.3 }, 0);
  const timeglassBefore = (await world()).inventory.timeglass || 0;
  for (let hit = 0; hit < 3 && !((await world()).harvested[`enemy:${data.overworld.id}:${bat.id}`]); hit++) { await page.keyboard.press('Space'); await waitForSimulation(); }
  assert.ok((await world()).harvested[`enemy:${data.overworld.id}:${bat.id}`], 'Cane swings must repel an actual Aristobat');
  assert.ok((await world()).inventory.timeglass > timeglassBefore, 'Defeated Aristobats must return timeglass');

  const gatekeeper = [data.overworld, ...Object.values(data.interiors)].flatMap(scene => scene.actors).find(actor => actor.kind === 'gatekeeper');
  assert.ok(gatekeeper);
  await approachActor(gatekeeper.id);
  const readingWorld = await world(); const readingTime = (await story()).time;
  await page.keyboard.down('w'); await page.waitForTimeout(650); await page.keyboard.up('w');
  assert.deepEqual({ x: (await world()).player.x, y: (await world()).player.y }, { x: readingWorld.player.x, y: readingWorld.player.y }, 'Dialogue must pause world movement');
  assert.equal((await story()).time, readingTime, 'Reading must not consume borrowed time');
  await contained();
  await revealChoices();
  await page.locator('.ow-dialogue').getByRole('button', { name: /We wish to enter/ }).click();
  await revealChoices();
  await page.locator('.ow-dialogue').getByRole('button', { name: /Complete the entrance application/ }).click();
  await page.locator('.puzzle-modal').waitFor();
  await contained();
  for (const [index, value] of ['4', '7', '9'].entries()) await page.getByLabel(`Clock wheel ${index + 1}`).selectOption(value);
  await page.getByRole('button', { name: 'Ask the door', exact: true }).click();
  await page.getByRole('button', { name: 'Return to the story', exact: true }).click();
  assert.ok((await story()).flags.includes('entrance_denied'));
  assert.ok((await story()).items.includes('refusal'));
  await revealChoices();
  const beforeTravel = await world();
  await page.locator('.ow-dialogue').getByRole('button', { name: /Go through the little exit to the Shanty Hours/ }).click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.ow-dialogue').count(), 0, 'Cross-location story choices must return control for walking');
  assert.deepEqual({ x: (await world()).player.x, y: (await world()).player.y }, { x: beforeTravel.player.x, y: beforeTravel.player.y }, 'Dialogue travel must not teleport');
  assert.ok((await world()).waypoint, 'Story travel should guide physical exploration');

  // Autosave preserves both physical state and the full narrative state.
  await page.waitForFunction(key => { const save = JSON.parse(localStorage.getItem(key) || 'null'); return save?.story?.scene === 'shanty_arrival' && save.story.flags.includes('entrance_denied'); }, SAVE_KEY, { timeout: 6500 });
  const save = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
  assert.ok(save?.world && save?.story, 'Autosave must preserve the world and campaign together');
  await page.reload(); await enterGame();
  assert.ok((await story()).flags.includes('entrance_denied'));
  assert.ok((await story()).solved.includes('entrance'));
  assert.equal((await world()).sceneId, save.world.sceneId);
  assert.ok(Math.hypot((await world()).player.x - save.world.player.x, (await world()).player.y - save.world.player.y) < 0.1);

  // Existing published-game saves migrate into the new physical world without losing progress.
  const legacy = { ...(await story()), scene: 'shanty_arrival', location: 'shanty', act: 2, time: 777, flags: ['entrance_denied', 'pip_friend', 'papers_obtained'], items: ['refusal', 'identity_papers'], unlocked: ['entrance', 'shanty', 'library', 'lake', 'forest'], ending: null };
  await page.addInitScript(({ key, legacyKey, legacy }) => { if (!sessionStorage.getItem('qa-legacy-migration')) { localStorage.removeItem(key); localStorage.setItem(legacyKey, JSON.stringify(legacy)); sessionStorage.setItem('qa-legacy-migration', 'yes'); } }, { key: SAVE_KEY, legacyKey: LEGACY_KEY, legacy });
  await page.reload(); await enterGame();
  assert.equal((await story()).act, 2);
  assert.equal((await story()).time, 777);
  assert.ok((await story()).items.includes('identity_papers'));
  assert.ok((await story()).flags.includes('pip_friend'));

  // Touch controls are real movement controls, and mobile menus remain inside the viewport.
  await page.screenshot({ path: 'artifacts/open-world-desktop.png' });
  const desktop = page;
  page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  await page.routeWebSocket('**', socket => socket.close());
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base); await enterGame();
  await desktop.close();
  await engine('teleport', data.overworld.id, data.overworld.spawn);
  await page.waitForTimeout(150);
  await contained();
  await page.locator('.ow-joystick').waitFor({ state: 'visible' });
  const joystick = await page.locator('.ow-joystick').boundingBox();
  const beforeTouch = await world();
  const touch = await page.context().newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: joystick.x + joystick.width / 2, y: joystick.y + joystick.height / 2 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: joystick.x + joystick.width - 5, y: joystick.y + joystick.height / 2 }] });
  await page.waitForTimeout(400);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const afterTouch = await world();
  assert.ok(Math.hypot(afterTouch.player.x - beforeTouch.player.x, afterTouch.player.y - beforeTouch.player.y) > 0.15, 'Mobile joystick must move the player');
  await page.getByRole('button', { name: 'Open map', exact: true }).first().click();
  await contained(); await page.screenshot({ path: 'artifacts/open-world-mobile-map.png' });
  await closeModal();
  await page.screenshot({ path: 'artifacts/open-world-mobile.png' });
  assert.deepEqual(errors, [], 'The game must not throw browser errors');
  console.log('PASS: physical movement, exploration, map waypoint without teleport, collision/interior doors, real harvesting/crafting/building/fishing/combat, paused dialogue/time, gate puzzle and story travel, world+story autosave, legacy migration, mobile joystick and contained menus.');
} finally { await browser.close(); }
