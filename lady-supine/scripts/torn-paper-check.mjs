import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';

const atlasFiles = ['heads.png', 'scenery.png', 'heads-residents.png', 'heads-residents-two.png', 'parts.png'];
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { atlases: [], assets: {}, actors: {}, portraits: {}, navigation: [], screenshots: [] };
for (const filename of atlasFiles) {
  const bytes = await readFile(`src/assets/torn-paper/${filename}`);
  assert.ok(bytes.subarray(0, 8).equals(pngSignature), `${filename} must remain a native PNG`);
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR');
  assert.equal(bytes.readUInt32BE(16), 1536, `${filename}: original sheet width`);
  assert.equal(bytes.readUInt32BE(20), 1024, `${filename}: original sheet height`);
  assert.equal(bytes[24], 8, `${filename}: eight-bit artwork`);
  assert.equal(bytes[25], 6, `${filename}: native RGBA transparency`);
  report.atlases.push({ filename, sha256: digest(bytes), bytes: bytes.length });
}
const [study, selectedStudy] = await Promise.all([
  readFile('src/assets/torn-paper/study.png'), readFile('public/style-studies/03-torn-paper.png'),
]);
assert.ok(study.equals(selectedStudy), 'The selected torn-paper study must be preserved byte for byte');
report.studySha256 = digest(study);
await mkdir('artifacts/torn-paper', { recursive: true });
if (process.argv.includes('--assets-only')) {
  console.log('PASS: five original 1536×1024 RGBA atlases and unchanged selected study.');
  process.exit(0);
}

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.routeWebSocket('**', socket => socket.close());
await page.addInitScript(() => {
  // Observe the instance already loaded by the game, including Vite's development
  // timestamp. Importing the bare URL after HMR would create a second empty loader.
  window.__paperQAModulePath = path => performance.getEntriesByType('resource')
    .filter(entry => new URL(entry.name).pathname === path).at(-1)?.name || path;
});
const errors = [], requests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('requestfailed', request => { if (!request.url().includes('favicon')) requests.push({ url: request.url(), error: request.failure()?.errorText }); });
const world = () => page.evaluate(() => window.__ladySupine.getWorld());
const engine = (method, ...args) => page.evaluate(({ method, args }) => window.__ladySupine.getEngine()[method](...args), { method, args });
async function screenshot(name) {
  const filename = `artifacts/torn-paper/${name}.png`;
  await page.screenshot({ path: filename }); report.screenshots.push(filename);
}
async function openMap() {
  // Small screens retain the clickable minimap and hide the duplicate Map icon.
  await page.getByRole('button', { name: 'Open map', exact: true }).first().click();
  await page.locator('.ow-world-map-canvas').waitFor();
}

try {
  await page.goto(process.env.GAME_URL || 'http://localhost:5173');
  await page.waitForFunction(() => Boolean(window.__ladySupine?.getEngine()), null, { timeout: 30000 });
  report.assets = await page.evaluate(async () => {
    const { paperAssetDiagnostics } = await import(window.__paperQAModulePath('/src/openworld/paperAssets.ts'));
    return paperAssetDiagnostics();
  });
  assert.equal(report.assets.ready, true, 'The world must mount only after its real art has loaded');
  assert.equal(report.assets.cutouts.length, 30, 'All characters, scenery and articulated parts must load');
  assert.equal(new Set(report.assets.cutouts.map(asset => asset.id)).size, 30);
  assert.equal(report.assets.decodedBytes, 6 * 1536 * 1024 * 4, 'Decode exactly five atlases and the unchanged selected study');
  assert.ok(report.assets.decodedBytes <= 40 * 1024 * 1024, 'The native art stays within its planned decoded memory budget');
  const groups = [
    ['lady-head', 'hare-head', 'bat-head', 'human-head', 'moth-head', 'ox-head'],
    ['trailer', 'willow', 'bed', 'shelves', 'brain-machine', 'billboard'],
    ['gatekeeper-head', 'tortoise-head', 'otter-head', 'deer-head', 'mole-head', 'peacock-head'],
    ['boar-head', 'mouse-head', 'fox-head', 'heron-head', 'merchant-head', 'salamander-head'],
    ['gown', 'ada-coat', 'worker-coat', 'arm', 'bat-wing', 'moth-wing'],
  ];
  for (const ids of groups) for (const [index, id] of ids.entries()) {
    const cutout = report.assets.cutouts.find(asset => asset.id === id);
    assert.ok(cutout, `${id} must be available`);
    const left = index % 3 * 512, top = Math.floor(index / 3) * 512;
    assert.ok(cutout.width > 20 && cutout.height > 20, `${id} must contain meaningful artwork`);
    assert.ok(cutout.x >= left && cutout.y >= top && cutout.x + cutout.width <= left + 512 && cutout.y + cutout.height <= top + 512,
      `${id}: transparent-margin measurement must stay inside its own sheet cell`);
    assert.ok(cutout.width < 512 || cutout.height < 512, `${id}: transparent margins must be measured, not rendered as a whole square cell`);
  }
  await screenshot('title');
  await page.getByRole('button', { name: 'Begin journey', exact: true }).click();
  await page.waitForFunction(() => !window.__ladySupine.getWorld().paused);
  const sampling = await page.evaluate(() => ({
    rendered: [...document.querySelectorAll('canvas, img')].map(element => getComputedStyle(element).imageRendering),
    world: document.querySelector('.ow-canvas').getContext('2d').imageSmoothingEnabled,
  }));
  assert.ok(sampling.rendered.every(value => !['pixelated', 'crisp-edges'].includes(value)), 'No image or canvas may use pixel-art sampling');
  assert.equal(sampling.world, true);

  // Observe actual native image draws into articulated actor parts. The canvas
  // hashes below compare behavior, without baking reference pixels or colours into the test.
  const drawing = await page.evaluate(async () => {
    const sprites = await import(window.__paperQAModulePath('/src/openworld/sprites.ts'));
    const { paperAssetDiagnostics } = await import(window.__paperQAModulePath('/src/openworld/paperAssets.ts'));
    const { PALETTE } = await import(window.__paperQAModulePath('/src/openworld/palette.ts'));
    const cutouts = paperAssetDiagnostics().cutouts;
    const kinds = ['human', 'gatekeeper', 'moth', 'hare', 'ox', 'tortoise', 'otter', 'deer', 'mole', 'peacock', 'bat', 'boar', 'mouse', 'fox', 'heron', 'merchant', 'lady', 'salamander'];
    const canvas = document.createElement('canvas'); canvas.width = 420; canvas.height = 420;
    const ctx = canvas.getContext('2d');
    const original = CanvasRenderingContext2D.prototype.drawImage;
    const calls = [], headCanvases = new Set();
    let activeKind = null, headFrame = null;
    const pixelHash = target => {
      const pixels = target.getContext('2d').getImageData(0, 0, target.width, target.height).data;
      let hash = 2166136261; for (const byte of pixels) hash = Math.imul(hash ^ byte, 16777619);
      return hash >>> 0;
    };
    CanvasRenderingContext2D.prototype.drawImage = function (source, ...args) {
      if (activeKind && source instanceof HTMLImageElement && source.naturalWidth === 1536 && source.naturalHeight === 1024 && args.length === 8) {
        const record = { kind: activeKind, source: source.currentSrc || source.src, x: args[0], y: args[1], width: args[2], height: args[3] };
        calls.push(record);
        const expected = cutouts.find(asset => asset.id === `${activeKind}-head`);
        if (expected && ['x', 'y', 'width', 'height'].every(key => Math.abs(record[key] - expected[key]) < .001) && /heads[^/]*\.png(?:\?|$)/.test(record.source)) headCanvases.add(this.canvas);
      }
      const result = original.call(this, source, ...args);
      if (activeKind && source instanceof HTMLCanvasElement && headCanvases.has(source)) headFrame = source;
      return result;
    };
    const results = {}, poses = {}, anchors = {};
    function draw(kind, moving, animation, time, state, colour) {
      ctx.clearRect(0, 0, 420, 420); activeKind = kind; headFrame = null;
      sprites.drawActorSprite(ctx, kind, 210, 365, Math.PI / 2, moving, animation, time, 4, colour, state);
      const hash = pixelHash(canvas); activeKind = null; return hash;
    }
    try {
      for (const kind of kinds) {
        const start = calls.length;
        draw(kind, false, 0, 2, { asleep: true, mindChanged: true, brainAbsent: true, phaseOffset: 0 });
        const expected = cutouts.find(asset => asset.id === `${kind}-head`);
        const actual = calls.slice(start).filter(record => ['x', 'y', 'width', 'height'].every(key => Math.abs(record[key] - expected[key]) < .001) && /heads[^/]*\.png(?:\?|$)/.test(record.source));
        results[kind] = { nativeHeads: actual.length, source: actual[0]?.source };
        if (kind === 'lady' || kind === 'hare') {
          const anchor = sprites.actorHeadAnchor(kind), x = 210 + anchor.x * 4, y = 365 + anchor.y * 4;
          const sample = ctx.getImageData(Math.round(x) - 3, Math.round(y) - 3, 7, 7).data;
          anchors[kind] = { anchor, paintedOpening: [...sample].filter((_, index) => index % 4 === 3).some(alpha => alpha > 32) };
        }
      }
      for (const kind of ['human', 'hare', 'lady', 'bat', 'moth']) {
        poses[kind] = {
          idle: [0, 1.1].map(time => draw(kind, false, 0, time, { phaseOffset: 0 })),
          walking: kind === 'bat' ? null : [.05, .23].map(animation => draw(kind, true, animation, 1.1, { phaseOffset: 0, pace: 1 })),
        };
      }
      // Observe the isolated native human head across an entire blink cycle.
      // Head-part canvases carry eyelids, but none of the body's breathing or gait.
      const blinkFrames = [];
      for (let step = 0; step <= 150; step++) {
        draw('human', false, 0, step * .05, { reducedMotion: true, phaseOffset: 0 }, PALETTE.ember);
        if (headFrame) blinkFrames.push(pixelHash(headFrame));
      }
      const portraits = {};
      for (const kind of ['lady', 'hare']) {
        const normal = sprites.actorPortraitDataUrl(kind, 96);
        const asleep = sprites.actorPortraitDataUrl(kind, 96, { asleep: true });
        const changed = sprites.actorPortraitDataUrl(kind, 96, { mindChanged: true });
        const absent = sprites.actorPortraitDataUrl(kind, 96, { brainAbsent: true });
        portraits[kind] = { asleepChanges: normal !== asleep, changedMindChanges: normal !== changed, brainAbsenceChanges: normal !== absent,
          stableCache: normal === sprites.actorPortraitDataUrl(kind, 96) };
      }
      return { results, poses, anchors, blink: { observations: blinkFrames.length, unique: new Set(blinkFrames).size, returnsToOpen: blinkFrames.length > 1 && blinkFrames[0] === blinkFrames.at(-1) }, portraits };
    } finally { activeKind = null; CanvasRenderingContext2D.prototype.drawImage = original; }
  });
  report.actors = drawing;
  for (const [kind, result] of Object.entries(drawing.results)) assert.ok(result.nativeHeads > 0, `${kind}: render the actual generated face into its articulated actor`);
  for (const [kind, poses] of Object.entries(drawing.poses)) {
    assert.notEqual(...poses.idle, `${kind}: paper joints must move while idle`);
    if (poses.walking) assert.notEqual(...poses.walking, `${kind}: walking must articulate the paper parts`);
  }
  assert.ok(drawing.blink.observations > 20 && drawing.blink.unique >= 2 && drawing.blink.returnsToOpen, 'The isolated native face must blink and reopen');
  for (const [kind, { anchor, paintedOpening }] of Object.entries(drawing.anchors)) {
    assert.ok(Number.isFinite(anchor.x) && Number.isFinite(anchor.y) && anchor.y < -30 && anchor.y > -90 && Math.abs(anchor.x) < 15, `${kind}: organ anchor stays anatomically above the torso`);
    assert.equal(paintedOpening, true, `${kind}: physical organ anchor meets the painted skull opening`);
  }
  for (const [kind, states] of Object.entries(drawing.portraits)) assert.ok(Object.values(states).every(Boolean), `${kind}: sleeping, changed mind and absent brain portraits must differ, with stable cached normal art`);

  const data = await page.evaluate(() => window.__ladySupine.getData());
  const current = await engine('getSave');
  const explored = [];
  for (let y = 0; y < Math.ceil(data.overworld.height / 8); y++) for (let x = 0; x < Math.ceil(data.overworld.width / 8); x++) explored.push(`${x}:${y}`);
  await engine('load', { ...current, explored, discovered: data.regions.map(region => region.id) });
  await openMap();
  const map = page.locator('.ow-world-map-canvas');
  const bounds = await map.boundingBox(), before = await world();
  await map.click({ position: { x: bounds.width * .19, y: bounds.height * .27 } });
  const after = await world();
  assert.equal(after.sceneId, before.sceneId);
  assert.deepEqual({ x: after.player.x, y: after.player.y }, { x: before.player.x, y: before.player.y }, 'Clicking the map must not move the player');
  assert.ok(Math.abs(after.waypoint.x - data.overworld.width * .19) < .5 && Math.abs(after.waypoint.y - data.overworld.height * .27) < .5, 'The main chart still marks the clicked world position');
  report.navigation.push('World chart marks an actual destination without teleporting');
  // Choosing a destination intentionally returns to play; reopen to inspect the chart.
  await openMap();
  await screenshot('world-chart'); await page.keyboard.press('Escape');

  const room = data.interiors['hospital-room'];
  await engine('teleport', room.id, room.spawn);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await openMap();
    const box = await map.boundingBox(), state = await world();
    await map.click({ position: { x: box.width - 24, y: box.height - 24 } });
    const unchanged = await world();
    assert.deepEqual(unchanged.waypoint, state.waypoint, 'The informational room inset must not change a world destination');
    assert.equal(unchanged.waypointScene, state.waypointScene);
    assert.equal(await map.isVisible(), true, 'The informational room inset keeps the chart open');
    assert.deepEqual({ x: unchanged.player.x, y: unchanged.player.y }, { x: state.player.x, y: state.player.y });
    const contained = await page.locator('.ow-panel').evaluate(element => {
      const panel = element.getBoundingClientRect(), frame = document.querySelector('.ow-game').getBoundingClientRect();
      return panel.left >= frame.left - 1 && panel.top >= frame.top - 1 && panel.right <= frame.right + 1 && panel.bottom <= frame.bottom + 1;
    });
    assert.equal(contained, true, 'The room chart stays within the gameplay window');
    await screenshot(`hospital-chart-${viewport.width}`);
    report.navigation.push(`Informational current-room inset preserves destination and player at ${viewport.width}px`);
    await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors, [], 'The native art pipeline must not introduce browser errors');
  assert.deepEqual(requests, [], 'The real art and local fonts must load without failed requests');
  await writeFile('artifacts/torn-paper/report.json', JSON.stringify(report, null, 2));
  console.log('PASS: five native transparent atlases, unchanged study, 30 measured cutouts, 18 native actor faces, animated paper joints/blinking, physical head anchors/stateful portraits, and desktop/mobile map navigation.');
} catch (error) {
  await page.screenshot({ path: 'artifacts/torn-paper/failure.png' }).catch(() => {});
  await writeFile('artifacts/torn-paper/failure.json', JSON.stringify({
    message: error.message, errors, requests, url: page.url(),
    body: await page.locator('body').innerText().catch(() => 'Unavailable'),
  }, null, 2));
  throw error;
} finally { await browser.close(); }
