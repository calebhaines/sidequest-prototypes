import { VELVET_INTERIORS } from './velvet-interiors.js';
import { EMBER_INTERIORS } from './ember-interiors.js';
import { drawInteriorTerrain, drawInteriorFurniture } from './interior-art.js';
import { drawVelvetActor } from './velvet-world.js';
import { drawEmberActor } from './ember-world.js';
import { rect, text, intersects } from './pixel-art.js';

const WORLDS = { lynch: VELVET_INTERIORS, shinobi: EMBER_INTERIORS };
const ACTORS = { lynch: drawVelvetActor, shinobi: drawEmberActor };

export function getInteriors(theme) {
  return WORLDS[theme] || [];
}

export function getInterior(theme, id) {
  return getInteriors(theme).find(interior => interior.id === id) || null;
}

export function getBuildingPortals(theme) {
  return getInteriors(theme).map(interior => ({
    id: `door-${theme}-${interior.id}`, type: 'door', name: interior.name,
    x: interior.door.x, y: interior.door.y, interiorId: interior.id, phase: 'both',
    facing: interior.door.facing || 'down',
  }));
}

export function getInteriorPlacements(theme) {
  return getInteriors(theme).flatMap(interior => (interior.placements || []).map(placement => ({
    ...placement, interiorId: interior.id,
    exterior: { x: interior.door.x, y: interior.door.y },
  })));
}

// Draw only the active room. Furniture and people share the same depth order;
// walking behind a counter therefore keeps the counter in front of the sprite.
export function drawInteriorWorld(ctx, theme, interior, opts = {}) {
  if (!interior || !ACTORS[theme]) return;
  const width = opts.width || ctx.canvas.width, height = opts.height || ctx.canvas.height;
  const scale = opts.scale || 1, x = Math.round(opts.x || 0), y = Math.round(opts.y || 0);
  const phase = opts.phase || 'waking', time = opts.time || 0;
  const bounds = { x, y, width: width / scale, height: height / scale };
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = theme === 'lynch' ? (phase === 'dream' ? '#302539' : '#333d3c') : '#4f6554';
  ctx.fillRect(0, 0, width, height);
  ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
  ctx.scale(scale, scale); ctx.translate(-x, -y);
  drawInteriorTerrain(ctx, interior, phase, time, { furniture: false });
  const furniture = (interior.furniture || []).filter(item => intersects(bounds, item, 32));
  for (const item of furniture.filter(item => item.kind === 'rug' || item.kind === 'mat')) {
    drawInteriorFurniture(ctx, item, interior, phase, time);
  }
  const entities = [...(opts.entities || [])];
  if (opts.player) entities.push({ ...opts.player, type: 'player' });
  const scene = [
    ...furniture.filter(item => item.kind !== 'rug' && item.kind !== 'mat').map(item => ({ item, y: item.y + item.height, furniture: true })),
    ...entities.filter(entity => entity.x >= x - 64 && entity.x <= x + bounds.width + 64 && entity.y >= y - 64 && entity.y <= y + bounds.height + 64).map(item => ({ item, y: item.y })),
  ].sort((a, b) => a.y - b.y || Number(b.furniture) - Number(a.furniture));
  for (const object of scene) {
    const item = object.item;
    if (object.furniture) drawInteriorFurniture(ctx, item, interior, phase, time);
    else if (item.type === 'prop') {
      const found = item.inspected;
      rect(ctx, item.x - 1, item.y - 9, 3, 3, found ? '#b9ba9b' : theme === 'lynch' ? '#e8c49f' : '#f2d197');
      if (!found) rect(ctx, item.x, item.y - 13, 1, 2, '#fff0c5');
    } else if (item.type !== 'exit' && item.type !== 'door') {
      ACTORS[theme](ctx, item, { ...opts, time, phase, npc: item.type === 'npc' });
    }
  }
  const exit = interior.exit;
  if (exit) {
    const color = theme === 'lynch' ? (phase === 'dream' ? '#e7bdce' : '#dbd5aa') : '#f5de9e';
    rect(ctx, exit.x - 22, exit.y + 7, 44, 3, color);
    rect(ctx, exit.x - 1, exit.y - 4, 3, 8, color);
    rect(ctx, exit.x - 4, exit.y + 1, 9, 2, color);
    text(ctx, 'EXIT', exit.x - 8, exit.y + 13, color);
  }
  ctx.restore();
}

// Discrete doorstep pixels make every usable entrance legible, including doors
// newly added to the pump tower and the three enclosed railway coaches.
export function drawExteriorDoors(ctx, theme, opts = {}) {
  const rooms = getInteriors(theme);
  if (!rooms.length) return;
  const scale = opts.scale || 1, x = Math.round(opts.x || 0), y = Math.round(opts.y || 0);
  const width = opts.width || ctx.canvas.width, height = opts.height || ctx.canvas.height;
  const bounds = { x, y, width: width / scale, height: height / scale };
  const dream = theme === 'lynch' && opts.phase === 'dream';
  const visited = new Set(opts.buildingsVisited || []);
  const warm = theme === 'shinobi' ? '#f7daa1' : dream ? '#edbdce' : '#edcea3';
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.scale(scale, scale); ctx.translate(-x, -y);
  for (const interior of rooms) {
    const door = interior.door, visual = interior.doorArt || door;
    if (!intersects(bounds, { x: door.x - 100, y: door.y - 80, width: 200, height: 140 })) continue;
    if (theme === 'lynch' && interior.id === 'ferry-wheelhouse') {
      rect(ctx, 2720, 2097, 64, 10, dream ? '#ad8597' : '#a89073');
      for (let plank = 2723; plank < 2784; plank += 9) rect(ctx, plank, 2098, 2, 8, dream ? '#c3a0aa' : '#c2aa89');
      rect(ctx, 2778, 2097, 6, 28, dream ? '#ad8597' : '#a89073');
    }
    if (interior.id === 'mill-tower' || interior.id.startsWith('railcar-')) {
      rect(ctx, visual.x - 7, visual.y - 21, 14, 21, dream ? '#976e83' : '#a58a71');
      rect(ctx, visual.x - 5, visual.y - 19, 8, 18, dream ? '#c095a8' : '#c8ab8a');
      rect(ctx, visual.x + 4, visual.y - 10, 2, 2, warm);
    }
    rect(ctx, visual.x - 7, visual.y + 1, 14, 2, warm);
    rect(ctx, visual.x - 3, visual.y + 3, 6, 2, warm);
    rect(ctx, door.x - 6, door.y - 3, 12, 2, visited.has(interior.id) ? '#a6ceba' : warm);
    rect(ctx, door.x - 2, door.y - 5, 4, 2, visited.has(interior.id) ? '#c7dfca' : '#fff0c4');
  }
  ctx.restore();
}
