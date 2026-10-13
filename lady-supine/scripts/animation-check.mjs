import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('artifacts/animation', { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
await page.routeWebSocket('**', socket => socket.close());
const errors = []; page.on('pageerror', error => errors.push(error.message));
const world = () => page.evaluate(() => window.__ladySupine.getWorld());
const story = () => page.evaluate(() => window.__ladySupine.getStory());
const engine = (method, ...args) => page.evaluate(({ method, args }) => window.__ladySupine.getEngine()[method](...args), { method, args });
const report = { motion: {}, pace: {}, actions: [], framesPerSecond: {}, screenshots: [] };

async function waitSimulation(seconds = .5) {
  const started = (await world()).elapsed;
  await page.waitForFunction(({ started, seconds }) => window.__ladySupine.getWorld().elapsed - started >= seconds, { started, seconds }, { timeout: 10000 });
}
async function canvasHash(clip = null) {
  return page.evaluate(clip => {
    const canvas = document.querySelector('.ow-canvas'), ctx = canvas.getContext('2d');
    const ratio = canvas.width / canvas.clientWidth;
    const box = clip || { x: 0, y: 0, width: canvas.clientWidth, height: canvas.clientHeight };
    const bytes = ctx.getImageData(Math.round(box.x * ratio), Math.round(box.y * ratio), Math.round(box.width * ratio), Math.round(box.height * ratio)).data;
    let hash = 2166136261;
    for (const value of bytes) hash = Math.imul(hash ^ value, 16777619);
    return hash >>> 0;
  }, clip);
}
async function shot(name, clip) {
  const path = `artifacts/animation/${name}.png`;
  await page.screenshot({ path, ...(clip ? { clip } : {}) }); report.screenshots.push(path);
}
async function prepare(sceneId, position, selected = 0, facing = -Math.PI / 2) {
  const current = await engine('getSave');
  await engine('load', { ...current, sceneId, selected, player: { ...current.player, ...position, facing, stamina: current.player.maxStamina, health: current.player.maxHealth }, options: { ...current.options, reducedMotion: false, particles: true } });
  await waitSimulation();
}
async function close() { await page.keyboard.press('Escape'); await page.waitForTimeout(150); }
async function performanceSample(id, position, sceneId = 'overworld') {
  await engine('teleport', sceneId, position); await waitSimulation(1);
  const before = await page.evaluate(() => ({ draws: window.__qaWorldDraws, time: performance.now() }));
  await page.waitForTimeout(3000);
  report.framesPerSecond[id] = await page.evaluate(before => Number(((window.__qaWorldDraws - before.draws) / ((performance.now() - before.time) / 1000)).toFixed(1)), before);
}

try {
  await page.goto(process.env.GAME_URL || 'http://localhost:5173');
  await page.waitForFunction(() => Boolean(window.__ladySupine?.getEngine()));
  await page.getByRole('button', { name: 'Begin journey', exact: true }).click();
  await page.waitForFunction(() => !window.__ladySupine.getWorld().paused);
  const data = await page.evaluate(() => window.__ladySupine.getData());
  const shanty = data.regions.find(region => region.id === 'shanty');
  await prepare('overworld', shanty.landmark);

  const playingBefore = await canvasHash(); await waitSimulation(.9);
  const playingAfter = await canvasHash();
  assert.notEqual(playingBefore, playingAfter, 'The painted environment and characters must visibly animate during play');
  report.motion.playingChanges = true;
  await page.getByRole('button', { name: 'Open pause menu', exact: true }).click();
  await page.waitForTimeout(1200); // Let camera easing settle after the last walk.
  const paused = await world(), pausedClock = (await story()).time, frozenBefore = await canvasHash();
  await page.waitForTimeout(700);
  assert.equal((await world()).elapsed, paused.elapsed, 'Opening a menu must pause the world simulation clock');
  assert.equal((await story()).time, pausedClock, 'Opening a menu must pause borrowed time');
  assert.equal(await canvasHash(), frozenBefore, 'The painted world must remain visually still while the menu is open');
  report.motion.menuFreezesWorld = true; await close();

  for (const [name, modifier, expected] of [['walk', null, 1], ['run', 'Shift', 1.45], ['sneak', 'c', .65]]) {
    await prepare('overworld', shanty.landmark);
    const before = await world();
    if (modifier) await page.keyboard.down(modifier);
    await page.keyboard.down('w'); await waitSimulation(.27);
    const during = await world();
    assert.equal(during.playerPace, expected, `${name}: the renderer must receive the actual movement pace`);
    assert.ok(during.player.moving);
    report.pace[name] = { phase: during.player.animation - before.player.animation,
      speed: Math.hypot(during.player.x - before.player.x, during.player.y - before.player.y) / (during.elapsed - before.elapsed), pace: during.playerPace };
    await shot(`${name}-pose`, { x: 620, y: 310, width: 200, height: 240 });
    await page.keyboard.up('w'); if (modifier) await page.keyboard.up(modifier);
  }
  assert.ok(report.pace.run.speed > report.pace.walk.speed && report.pace.walk.speed > report.pace.sneak.speed, 'Run, walk and sneak must keep different physical speeds');
  assert.ok(report.pace.run.phase > report.pace.walk.phase && report.pace.walk.phase > report.pace.sneak.phase, 'The movement animation phase must follow the real run/walk/sneak pace');

  const tree = data.overworld.objects.find(object => object.kind === 'tree' && object.resource && object.x > 10 && object.x < 40 && object.y > 110);
  await prepare('overworld', { x: tree.x, y: tree.y + 1.1 }, 1);
  const timber = (await world()).inventory.wood || 0;
  for (let hit = 0; hit < tree.resource.health; hit++) {
    await page.keyboard.press('Space');
    const impact = (await world()).impacts?.findLast(impact => impact.kind === 'wood' && impact.targetId === tree.id);
    assert.ok(impact, 'A successful axe strike must produce a wood impact at the struck tree');
    assert.deepEqual(impact.position, { x: tree.x, y: tree.y });
    if (hit === tree.resource.health - 1) assert.equal(impact.destroyed, true, 'The final strike must identify the falling tree');
    await waitSimulation(.16); await shot(`axe-impact-${hit + 1}`); await waitSimulation(.5);
  }
  assert.equal((await world()).inventory.wood, timber + tree.resource.amount);
  assert.ok((await world()).harvested[tree.id]); report.actions.push('Axe impact and falling tree preserve actual timber reward');

  const rock = data.overworld.objects.find(object => {
    if (object.kind !== 'rock' || !object.resource || object.x <= 10 || object.x >= 50 || object.y <= 100) return false;
    const player = { x: object.x, y: object.y + 1.1 };
    const inFront = data.overworld.objects.filter(candidate => {
      if (!candidate.resource) return false;
      const dx = candidate.x - player.x, dy = candidate.y - player.y;
      const delta = Math.atan2(dy, dx) + Math.PI / 2;
      return Math.hypot(dx, dy) <= 2 && Math.abs(delta) <= 1.25;
    }).sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y));
    return inFront[0]?.id === object.id;
  });
  assert.ok(rock); await prepare('overworld', { x: rock.x, y: rock.y + 1.1 }, 2);
  await page.keyboard.press('Space');
  const stoneImpact = (await world()).impacts?.findLast(impact => impact.kind === 'stone' && impact.targetId === rock.id);
  assert.ok(stoneImpact, 'A successful pick strike must produce a stone impact at the struck rock');
  await waitSimulation(.16); await shot('pick-impact'); await waitSimulation(.5);
  report.actions.push('Pick impact is attached to the physical rock');

  const fallen = data.overworld.objects.find(object => object.id === 'fallen-curly-willow');
  const fibres = (await world()).inventory.willow_fibre || 0;
  await prepare('overworld', { x: fallen.x, y: fallen.y + .3 });
  await page.keyboard.press('e');
  assert.equal((await world()).inventory.willow_fibre, fibres + fallen.resource.amount);
  assert.ok((await world()).impacts?.some(impact => impact.kind === 'gather' && impact.targetId === fallen.id));
  report.actions.push('Gather animation commits actual willow supplies');

  await prepare('overworld', { x: 72.5, y: 110.5 }, 3, 0);
  const fish = (await world()).inventory.fish || 0;
  await page.keyboard.press('Space'); assert.equal((await world()).fishing?.phase, 'waiting');
  await waitSimulation(.15); await shot('fishing-cast');
  await page.waitForFunction(() => window.__ladySupine.getWorld().fishing?.phase === 'bite', null, { timeout: 11000 });
  await shot('fishing-bite'); await page.keyboard.press('Space');
  assert.ok((await world()).inventory.fish > fish); await shot('fishing-caught');
  report.actions.push('Cast, bite and reel still produce a real fish');

  await prepare('overworld', data.overworld.spawn, 0, Math.PI);
  const recipe = await page.evaluate(async () => (await import('/src/openworld/items.ts')).RECIPES.find(recipe => recipe.result === 'campfire'));
  for (const [id, amount] of Object.entries(recipe.ingredients)) await engine('addResource', id, amount);
  assert.equal(await engine('craft', recipe.id), true);
  assert.ok((await world()).impacts?.some(impact => impact.kind === 'craft'));
  await waitSimulation(.5); const placed = (await world()).placed.length;
  await engine('beginBuild', recipe.result); await page.keyboard.press('Space');
  assert.equal((await world()).placed.length, placed + 1);
  assert.ok((await world()).impacts?.some(impact => impact.kind === 'build'));
  await waitSimulation(.18); await shot('building-settle'); report.actions.push('Craft/place animations preserve the real campfire');

  // Match the previously measured 1440×900 scenes without concurrent suites.
  await page.evaluate(() => {
    window.__qaWorldDraws = 0; window.__qaOriginalClear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.classList.contains('ow-canvas')) window.__qaWorldDraws++;
      return window.__qaOriginalClear.call(this, ...args);
    };
  });
  await performanceSample('shanty', shanty.landmark);
  await performanceSample('lake', data.regions.find(region => region.id === 'lake').landmark);
  const lady = data.interiors['castle-room'].actors.find(actor => actor.kind === 'lady');
  await performanceSample('castle-room', { x: lady.x, y: lady.y + 1.7 }, 'castle-room');
  await page.evaluate(() => { CanvasRenderingContext2D.prototype.clearRect = window.__qaOriginalClear; });

  // The manual setting must work even when the OS has no reduced-motion preference.
  await engine('teleport', 'overworld', { x: 72.5, y: 110.5 }); await waitSimulation(.7);
  await page.getByRole('button', { name: 'Open inventory', exact: true }).click();
  await page.locator('.ow-panel-nav').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('switch', { name: 'Reduced motion', exact: true }).click();
  assert.equal((await world()).options.reducedMotion, true);
  assert.equal(await page.locator('.ow-game').getAttribute('data-reduced-motion'), 'true');
  const activeCss = await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running' && animation.effect?.getComputedTiming().iterations === Infinity).length);
  assert.equal(activeCss, 0, 'The manual setting must stop decorative infinite CSS loops');
  await close(); await waitSimulation(.5);
  const waterClip = { x: 1030, y: 210, width: 160, height: 105 };
  const waterBefore = await canvasHash(waterClip); await waitSimulation(.7);
  assert.equal(await canvasHash(waterClip), waterBefore, 'Reduced motion must freeze decorative water and weather while gameplay remains active');
  report.motion.manualReducedMotionWorks = true;

  // A mind exchange intentionally continues while the rest of the simulation is paused.
  // This isolates the render clock; marker-and-mind-check tests the complete story procedure.
  await engine('teleport', 'castle-room', { x: lady.x, y: lady.y + 1.7 });
  await page.getByRole('button', { name: 'Open pause menu', exact: true }).click();
  const sequenceWorld = await world(), sequenceClock = (await story()).time;
  await engine('startMindExchange', 'exchange');
  await page.waitForTimeout(500); const firstSequence = await world(); const brainBefore = await canvasHash();
  await page.waitForTimeout(600);
  assert.ok((await world()).sequence.elapsed > firstSequence.sequence.elapsed);
  assert.equal((await world()).elapsed, sequenceWorld.elapsed);
  assert.equal((await story()).time, sequenceClock);
  assert.notEqual(await canvasHash(), brainBefore, 'The physical organ procedure must animate while ordinary world motion is paused');
  report.motion.sequenceIsPausedWorldException = true;
  assert.deepEqual(errors, []);
  await writeFile('artifacts/animation/report.json', JSON.stringify(report, null, 2));
  console.log(`PASS: visible world motion; menu freeze; distinct walk/run/sneak; causal tool/gather/fishing/build effects; manual reduced motion; paused mind procedure. Actual world draws/s: ${JSON.stringify(report.framesPerSecond)}.`);
} finally { await browser.close(); }
