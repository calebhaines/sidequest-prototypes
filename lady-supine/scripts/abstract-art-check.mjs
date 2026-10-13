import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Audit authored inks, not final pixels: smooth edges and translucent washes
// necessarily produce intermediate display colours.
const paletteSource = await readFile('src/openworld/palette.ts', 'utf8');
const pigments = [...paletteSource.matchAll(/(\w+):\s*'(#[\da-f]{6})'/gi)].map(match => [match[1], match[2].toLowerCase()]);
assert.equal(pigments.length, 24, 'The shared palette must define exactly 24 pigments');
const allowed = new Set(pigments.map(([, colour]) => colour));
assert.equal(allowed.size, 24, 'The 24 pigments must be distinct');
const channels = hex => [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
const channelKey = rgb => rgb.join(',');
const allowedRGB = new Set([...allowed].map(colour => channelKey(channels(colour))));
const paletteCss = await readFile('src/styles/palette.css', 'utf8');
assert.equal([...paletteCss.matchAll(/--p-[\w]+-rgb:\s*[\d\s,]+;/g)].length, 24, 'CSS must expose exactly the same 24 RGB ink bases');
for (const [name, colour] of pigments) {
  assert.match(paletteCss, new RegExp(`--p-${name}:\\s*${colour}\\s*;`, 'i'), `CSS must share the ${name} pigment`);
  assert.match(paletteCss, new RegExp(`--p-${name}-rgb:\\s*${channels(colour).join('\\s*,\\s*')}\\s*;`), `CSS opacity must use the ${name} RGB base`);
}
async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }), files = [];
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(filename));
    else if (/\.(?:tsx?|css)$/.test(filename) && filename !== 'src/styles/main.css') files.push(filename);
  }
  return files;
}
const files = [...await sourceFiles('src'), 'index.html', 'public/art/supine-mark.svg', 'public/art/gate-mark.svg', 'public/art/palette-24.svg'];
const violations = [];
for (const filename of files) {
  const source = (await readFile(filename, 'utf8')).replace(/%23/gi, '#');
  for (const match of source.matchAll(/#([\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})(?![\da-f])/gi)) {
    const expanded = match[1].length <= 4 ? [...match[1]].map(channel => channel + channel).join('') : match[1];
    const base = `#${expanded.slice(0, 6).toLowerCase()}`;
    if (!allowed.has(base)) violations.push(`${filename}: ${match[0]}`);
  }
  for (const match of source.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi)) {
    const rgb = channelKey(match.slice(1, 4).map(Number));
    if (!allowedRGB.has(rgb)) violations.push(`${filename}: rgb(${rgb})`);
  }
  if (/hsla?\(/i.test(source)) violations.push(`${filename}: HSL colour outside the shared pigment source`);
  for (const match of source.matchAll(/(?:fill|stroke|color|background(?:-color)?)\s*[:=]\s*['"]?(white|black|red|blue|green|yellow|orange|purple|pink|gray|grey)\b/gi)) violations.push(`${filename}: named colour ${match[1]}`);
}
assert.deepEqual([...new Set(violations)], [], 'Every active authored colour base must belong to the 24-pigment palette');
console.log(`PASS: 24 distinct shared pigments; CSS hex/RGB agree; ${files.length} active sources and SVGs use only those ink bases.`);
if (process.argv.includes('--audit') || process.argv.includes('--audit-only')) process.exit(0);

await mkdir('artifacts/abstract', { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
await page.routeWebSocket('**', socket => socket.close());
const errors = []; page.on('pageerror', error => errors.push(error.message));
const engine = (method, ...args) => page.evaluate(({ method, args }) => window.__ladySupine.getEngine()[method](...args), { method, args });
const report = { palette: pigments, sourceFiles: files.length, trees: {}, screenshots: [] };
async function shot(name) { const filename = `artifacts/abstract/${name}.png`; await page.screenshot({ path: filename }); report.screenshots.push(filename); }
try {
  await page.goto(process.env.GAME_URL || 'http://localhost:5173');
  await page.waitForFunction(() => Boolean(window.__ladySupine?.getEngine()));
  await shot('title');
  await page.getByRole('button', { name: 'Begin journey', exact: true }).click();
  await page.waitForFunction(() => !window.__ladySupine.getWorld().paused);
  // This isolated drawing contains no weather, water, moving actors or camera
  // easing. Only actual tree illustration motion can change these regions.
  report.trees = await page.evaluate(async () => {
    const { renderWorld } = await import('/src/openworld/renderer.ts');
    const data = window.__ladySupine.getData(), save = window.__ladySupine.getEngine().getSave();
    const width = 480, height = 420, root = { x: 240, y: 338 };
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    const scene = { id: 'qa-abstract-tree-motion', name: 'Isolated tree', location: 'forest', width: 32, height: 32,
      tiles: Array(32 * 32).fill('grass'), objects: [], actors: [], spawn: { x: 12, y: 12 }, outdoors: false };
    const object = { id: 'qa-tree', kind: 'tree', x: 12, y: 12, variant: 0, solid: true };
    const frame = { scene, data, player: { ...save.player, x: -100, y: -100, attacking: 0, hurt: 0, moving: false }, actors: [], objects: [object],
      harvested: {}, particles: [], floating: [], camera: { x: 12, y: 10 }, zoom: 2, time: 0, dayTime: .5, flags: [], selected: '', nearby: null,
      fishing: null, waypoint: null, reducedMotion: false, particlesEnabled: false, sequence: null, impacts: [] };
    const draw = (kind, time, reducedMotion = false) => {
      frame.objects = [{ ...object, kind }]; frame.time = time; frame.reducedMotion = reducedMotion;
      renderWorld(ctx, frame, width, height); return { pixels: ctx.getImageData(0, 0, width, height).data.slice() };
    };
    const changed = (a, b, box) => {
      let pixels = 0;
      for (let y = box.y; y < box.y + box.height; y++) for (let x = box.x; x < box.x + box.width; x++) {
        const offset = (y * width + x) * 4;
        if (a.pixels[offset] !== b.pixels[offset] || a.pixels[offset + 1] !== b.pixels[offset + 1] || a.pixels[offset + 2] !== b.pixels[offset + 2] || a.pixels[offset + 3] !== b.pixels[offset + 3]) pixels++;
      }
      return pixels;
    };
    const boxes = { canopy: { x: root.x - 110, y: root.y - 210, width: 220, height: 150 },
      branches: { x: root.x - 45, y: root.y - 85, width: 90, height: 55 },
      roots: { x: root.x - 45, y: root.y - 18, width: 90, height: 18 } };
    const result = {};
    for (const kind of ['tree', 'willow']) {
      const a = draw(kind, 0), b = draw(kind, 2.7), quietA = draw(kind, 0, true), quietB = draw(kind, 2.7, true);
      renderWorld(ctx, { ...frame, objects: [], time: 0 }, width, height);
      const bare = { pixels: ctx.getImageData(0, 0, width, height).data.slice() };
      // Compare the visible rooted bark with an empty scene, then across time.
      // This checks the native cutout's position without depending on old pen path vertices.
      result[kind] = { canopyPixelsChanged: changed(a, b, boxes.canopy), branchPixelsChanged: changed(a, b, boxes.branches),
        rootsDetected: changed(a, bare, boxes.roots) > 10,
        visibleRootPixels: changed(a, bare, boxes.roots),
        rootPixelsChanged: changed(a, b, boxes.roots),
        rootAnchorsStayFixed: changed(a, b, boxes.roots) === 0,
        reducedMotionPixelsChanged: changed(quietA, quietB, { x: 0, y: 0, width, height }) };
    }
    return result;
  });
  for (const [kind, result] of Object.entries(report.trees)) {
    assert.ok(result.canopyPixelsChanged > 100, `${kind}: canopy facets must visibly move`);
    assert.ok(result.branchPixelsChanged > 30, `${kind}: branches must bend separately from the canopy`);
    assert.ok(result.rootsDetected, `${kind}: the rooted bark must visibly occupy the ground band`);
    assert.ok(result.rootAnchorsStayFixed, `${kind}: trunk foot and root geometry must stay planted while fronds can pass in front`);
    assert.equal(result.reducedMotionPixelsChanged, 0, `${kind}: reduced motion must freeze all decorative tree motion`);
  }
  const data = await page.evaluate(() => window.__ladySupine.getData());
  for (const id of ['forest', 'shanty', 'lake']) {
    await engine('teleport', data.overworld.id, data.regions.find(region => region.id === id).landmark);
    await page.waitForTimeout(550); await shot(id);
  }
  const room = data.interiors['castle-room'], lady = room.actors.find(actor => actor.kind === 'lady');
  assert.ok(lady, 'Lady Supine remains a physical woman in her room');
  const ladyPortrait = await page.evaluate(async () => (await import('/src/openworld/sprites.ts')).actorPortraitDataUrl('lady', 320));
  const portraitPath = 'artifacts/abstract/supine-portrait.png';
  await writeFile(portraitPath, Buffer.from(ladyPortrait.split(',')[1], 'base64')); report.screenshots.push(portraitPath);
  await engine('teleport', room.id, { x: lady.x, y: lady.y + 1.7 }); await page.waitForTimeout(550); await shot('supine');
  await page.keyboard.press('e'); await page.locator('.ow-dialogue').waitFor(); await shot('supine-dialogue'); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Open inventory', exact: true }).click(); await shot('inventory');
  const sampling = await page.evaluate(() => [...document.querySelectorAll('canvas, img')].map(element => ({ rendering: getComputedStyle(element).imageRendering,
    smooth: element.tagName === 'CANVAS' ? element.getContext('2d')?.imageSmoothingEnabled : true })));
  assert.ok(sampling.every(item => item.smooth && !['pixelated', 'crisp-edges'].includes(item.rendering)), 'All active art must stay antialiased');
  await page.locator('.ow-panel-nav').getByRole('button', { name: 'Map', exact: true }).click(); await shot('map');
  await page.setViewportSize({ width: 390, height: 844 }); await shot('map-mobile');
  const bounds = await page.locator('.ow-panel').boundingBox();
  assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 391 && bounds.y + bounds.height <= 845, 'The mobile map stays inside the game');
  assert.deepEqual(errors, []);
  await writeFile('artifacts/abstract/report.json', JSON.stringify(report, null, 2));
  console.log(`PASS: dynamic tree/willow canopies and branches; fixed roots; reduced-motion freeze; smooth artwork; physical Supine; desktop/mobile captures. ${JSON.stringify(report.trees)}`);
} finally { await browser.close(); }
