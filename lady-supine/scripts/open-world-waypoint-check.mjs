import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.routeWebSocket('**', socket => socket.close());
const errors = []; page.on('pageerror', error => errors.push(error.message));
const world = () => page.evaluate(() => window.__ladySupine.getWorld());
const story = () => page.evaluate(() => window.__ladySupine.getStory());
const key = 'lady-supine-open-world-v2';
async function begin() { await page.waitForFunction(() => Boolean(window.__ladySupine?.getEngine())); await page.getByRole('button', { name: /^(Begin journey|Continue journey)$/ }).click(); await page.waitForFunction(() => !window.__ladySupine.getWorld().paused); }
async function reveal() { while (await page.locator('.ow-dialogue').getByRole('button', { name: /^Continue/ }).isVisible()) await page.locator('.ow-dialogue').getByRole('button', { name: /^Continue/ }).click(); }
async function checkMapProjection(data, room) {
  await page.evaluate(() => {
    window.__qaMapMarkers = [];
    if (window.__qaOriginalEllipse) return;
    window.__qaOriginalEllipse = CanvasRenderingContext2D.prototype.ellipse;
    CanvasRenderingContext2D.prototype.ellipse = function (x, y, ...args) {
      // Observe the ink marker's projected location instead of depending on the
      // old six-pixel square used before the hand-drawn map was introduced.
      if (this.canvas.classList.contains('ow-world-map-canvas') && this.strokeStyle === '#7a4755') window.__qaMapMarkers.push({ x, y });
      return window.__qaOriginalEllipse.call(this, x, y, ...args);
    };
  });
  await page.getByRole('button', { name: 'Open map', exact: true }).first().click();
  await page.waitForFunction(() => window.__qaMapMarkers.length > 0);
  const result = await page.evaluate(({ data, room }) => {
    const canvas = document.querySelector('.ow-world-map-canvas');
    return { marker: window.__qaMapMarkers.at(-1), expected: { x: room.exit.position.x * canvas.clientWidth / data.overworld.width, y: room.exit.position.y * canvas.clientHeight / data.overworld.height } };
  }, { data, room });
  assert.ok(Math.hypot(result.marker.x - result.expected.x, result.marker.y - result.expected.y) < 1, 'The hand-drawn global map must project a room waypoint to its outside building entrance');
  await page.keyboard.press('Escape'); await page.waitForTimeout(80);
}
try {
  await page.goto(process.env.GAME_URL || 'http://localhost:5173'); await begin();
  const data = await page.evaluate(() => window.__ladySupine.getData());
  const room = data.interiors['museum-room'];
  const curator = room.actors.find(actor => actor.id === 'curator');
  const screen = room.objects.find(object => object.id === 'museum-telescreen');
  const prepared = await page.evaluate(async ({ curator, room }) => {
    const [{ INVESTIGATIONS, caseFlag }, { toggleCircuit }] = await Promise.all([import('/src/data/investigations.ts'), import('/src/data/investigationTypes.ts')]);
    const investigation = INVESTIGATIONS.find(entry => entry.id === 'abundance_audit');
    const challenges = Object.fromEntries(investigation.challenges.map(challenge => {
      const board = challenge.board, progress = { answers: {}, hints: 0, solved: true };
      if (['ledger', 'cipher', 'balance'].includes(board.kind)) progress.answers = { ...board.solution };
      if (board.kind === 'sequence') progress.order = [...board.solution];
      if (board.kind === 'route') progress.route = [...board.solution];
      if (board.kind === 'circuit') progress.lamps = board.solution.reduce((lamps, cell) => toggleCircuit(lamps, cell, board.size), [...board.initial]);
      return [challenge.id, progress];
    }));
    const hook = window.__ladySupine, current = hook.getEngine().getSave();
    return JSON.stringify({ version: 2, savedAt: Date.now(), story: { ...hook.getStory(), scene: 'museum_arrival', location: 'museum', act: 2, flags: ['entrance_denied', 'papers_obtained', 'willow_gathered', 'fields_permit', caseFlag(investigation.id)], items: ['identity_papers', 'curly_willow'], investigations: { [investigation.id]: { stage: 6, started: true, finished: true, challenges } } }, world: { ...current, sceneId: room.id, player: { ...current.player, x: curator.x, y: curator.y + 1.1 } } });
  }, { curator, room });
  await page.addInitScript(({ key, prepared }) => { if (!sessionStorage.getItem('qa-waypoint-setup')) { localStorage.setItem(key, prepared); sessionStorage.setItem('qa-waypoint-setup', 'yes'); } }, { key, prepared });
  await page.reload(); await begin();
  await page.keyboard.press('e'); await page.locator('.ow-dialogue').waitFor(); await reveal();
  const before = (await world()).player;
  await page.locator('.ow-dialogue').getByRole('button', { name: /Answer the voice on Channel 9/ }).click();
  assert.equal(await page.locator('.ow-dialogue').count(), 0);
  assert.equal((await world()).sceneId, room.id);
  assert.deepEqual({ x: (await world()).player.x, y: (await world()).player.y }, { x: before.x, y: before.y }, 'A local story handoff must not teleport the player');
  assert.equal((await world()).waypointScene, room.id);
  assert.deepEqual((await world()).waypoint, { x: screen.x, y: screen.y }, 'The room gets an actual local screen destination');
  await checkMapProjection(data, room);

  await page.evaluate(({ room, screen }) => window.__ladySupine.getEngine().teleport(room.id, { x: screen.x, y: screen.y + 1.1 }), { room, screen });
  await page.keyboard.press('e'); await page.locator('.ow-dialogue').waitFor(); await reveal();
  const screenPosition = (await world()).player;
  await page.locator('.ow-dialogue').getByRole('button', { name: /I would like to see your art/ }).click();
  assert.ok((await story()).flags.includes('art_tickets_received'));
  assert.deepEqual({ x: (await world()).player.x, y: (await world()).player.y }, { x: screenPosition.x, y: screenPosition.y }, 'The tickets handoff must ask the player to walk to the Curator');
  assert.equal((await world()).waypointScene, room.id);
  assert.deepEqual((await world()).waypoint, { x: curator.x, y: curator.y }, 'A same-room NPC destination stays in local coordinates');
  await checkMapProjection(data, room);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save journey', exact: true }).click();
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  assert.equal(saved.world.waypointScene, room.id, 'The local waypoint scene must survive save serialization');
  await page.reload(); await begin();
  assert.equal((await world()).waypointScene, room.id);
  assert.deepEqual((await world()).waypoint, { x: curator.x, y: curator.y });
  assert.deepEqual(errors, []);
  console.log('PASS: Museum screen and NPC handoffs keep physical position, room waypoint coordinates render at the building entrance on global maps, and waypoint scene tags survive save/reload.');
} finally { await browser.close(); }
