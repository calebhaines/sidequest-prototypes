import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/openworld/world.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { createWorld } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const data = createWorld();
assert.deepEqual(data, createWorld(), 'The world layout must be deterministic for saved games');
assert.equal(data.regions.length, 12);
assert.ok(Object.keys(data.interiors).length >= 8, 'Major buildings need actual interiors');
const unavailable = new Set(['water', 'deepWater', 'void']);

function navigation(scene) {
  assert.equal(scene.tiles.length, scene.width * scene.height, `${scene.id}: terrain dimensions`);
  const blocked = new Set();
  for (const object of scene.objects) {
    // Architectural footprints use the top-left tile origin. Small props can be
    // skirted in fractional tile space; this grid audit covers the fixed buildings.
    if (!object.solid || (object.width || 1) < 2 && (object.height || 1) < 2) continue;
    for (let y = Math.floor(object.y); y < object.y + (object.height || 1); y++) for (let x = Math.floor(object.x); x < object.x + (object.width || 1); x++) blocked.add(`${x}:${y}`);
  }
  const walkable = (x, y) => x >= 0 && y >= 0 && x < scene.width && y < scene.height && !unavailable.has(scene.tiles[y * scene.width + x]) && !blocked.has(`${x}:${y}`);
  const start = { x: Math.floor(scene.spawn.x), y: Math.floor(scene.spawn.y) };
  assert.ok(walkable(start.x, start.y), `${scene.id}: player spawn must be on unblocked terrain`);
  const reached = new Set([`${start.x}:${start.y}`]);
  const queue = [start];
  for (let index = 0; index < queue.length; index++) {
    const point = queue[index];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = point.x + dx, y = point.y + dy, key = `${x}:${y}`;
      if (walkable(x, y) && !reached.has(key)) { reached.add(key); queue.push({ x, y }); }
    }
  }
  const accessible = (point, radius = 0) => {
    for (let y = Math.floor(point.y - radius); y <= point.y + radius; y++) for (let x = Math.floor(point.x - radius); x <= point.x + radius; x++) if (reached.has(`${x}:${y}`)) return true;
    return false;
  };
  return { reached, accessible };
}

for (const scene of [data.overworld, ...Object.values(data.interiors)]) {
  const { accessible } = navigation(scene);
  const identifiers = new Set();
  for (const object of scene.objects) {
    assert.ok(!identifiers.has(object.id), `${scene.id}: duplicate object ${object.id}`); identifiers.add(object.id);
    assert.ok(Number.isFinite(object.x) && Number.isFinite(object.y));
    if (object.door) {
      assert.ok(data.interiors[object.door.scene], `${object.id}: entrance points to a real interior`);
      assert.ok(accessible({ x: object.x + (object.width || 1) / 2, y: object.y + (object.height || 1) + 1.5 }, .5), `${object.id}: building door reachable on foot`);
    }
    if (object.resource) assert.ok(object.resource.amount > 0 && object.resource.health > 0, `${object.id}: usable resource`);
  }
  for (const actor of scene.actors.filter(actor => !actor.hostile)) assert.ok(accessible(actor, 1), `${scene.id}: ${actor.name} must be approachable`);
  if (scene.exit) {
    assert.equal(scene.exit.scene, data.overworld.id);
    assert.ok(accessible(scene.exit.positionInRoom), `${scene.id}: exit reachable`);
  }
}
const { accessible } = navigation(data.overworld);
for (const region of data.regions) assert.ok(accessible(region.landmark), `${region.name}: landmark connected to the entrance`);
assert.ok(data.overworld.actors.filter(actor => actor.hostile).length >= 4, 'Aristobats need real physical patrols');
assert.ok(data.overworld.objects.filter(object => object.resource).length >= 100, 'Exploration needs harvestable world resources');
assert.ok(data.overworld.objects.some(object => object.text === 'scene:infinite_arrival'), 'The final entrance must exist physically in the world');
console.log(`PASS: deterministic ${data.overworld.width}×${data.overworld.height} world; 12 connected landmarks; ${Object.keys(data.interiors).length} enterable interiors; approachable NPCs, reachable exits, physical resources and Aristobat patrols.`);
