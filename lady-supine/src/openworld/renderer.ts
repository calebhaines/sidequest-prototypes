import { TILE_SIZE, type ActorFrame, type RenderFrame, type TileKind, type VisualImpact, type WorldObject, type WorldScene } from './types';
import { drawActorSprite, drawItemIcon, playerToolPose } from './sprites';
import { worldHash } from './world';
import { drawMindExchange } from './mindExchange';
import { PALETTE24 as P, rgba } from './palette';
import { paperShape, paperTexture, paperPath } from './paper';
import { drawPaperAsset, drawPaperAssetRegion, paperAssetAspect, paperAssetsRevision } from './paperAssets';

// The map remains a simulation grid. Its illustration deliberately never shows that grid.
const CHUNK = 8;
const GROUND_BLEED = 10;
const GROUND_CACHE_BYTES = 96 * 1024 * 1024;
const OBJECT_CACHE_BYTES = 96 * 1024 * 1024;
const CANOPY_CACHE_BYTES = 16 * 1024 * 1024;
const ART_DENSITIES = [.5, 1, 1.5, 2];
const INK: string = P.ink, PAPER: string = P.paper;
const groundCache = new Map<string, HTMLCanvasElement>();
let groundCacheBytes = 0;
const contourCache = new Map<string, Map<TileKind, Path2D>>();
type GroundContourLoop = { path: Path2D; points: number[]; left: number; top: number; right: number; bottom: number };
const contourLoopCache = new Map<string, Map<TileKind, GroundContourLoop[]>>();
const objectCache = new Map<string, { canvas: HTMLCanvasElement; left: number; top: number; width: number; height: number }>();
let objectCacheBytes = 0;
let objectResolution = 2;
let protectedObjectKeys = new Set<string>();
const colors: Record<TileKind, string> = {
  grass: P.smoke, darkGrass: P.pine, dirt: P.bark, path: P.clay,
  water: P.water, deepWater: P.deepWater, sand: P.ash, stone: P.slate,
  woodFloor: P.bark, stoneFloor: P.fog, void: P.charcoal, tilled: P.bark,
};
const wet = (kind?: TileKind) => kind === 'water' || kind === 'deepWater';
const noise = (n: number, seed = 1) => worldHash(n * 31 + seed * 7, seed * 19 + n * 3);
const actorPhases = new Map<string, number>();
let sceneryDebris = true;
let surfaceSeed = 1;
let movingSheet = false;
function actorPhase(id: string) {
  const cached = actorPhases.get(id); if (cached !== undefined) return cached;
  const phase = id.split('').reduce((sum, character) => sum * 1.07 + character.charCodeAt(0), 0) % 37;
  actorPhases.set(id, phase); return phase;
}
function wind(x: number, y: number, time: number) {
  const slow = Math.sin(time * .57 + x * .13 + y * .05), gust = Math.max(0, Math.sin(time * .19 + y * .037));
  return slow * .55 + Math.sin(time * 1.21 + x * .29 - y * .17) * .18 + gust * Math.sin(time * .83 + x * .07) * .45;
}
function tileAt(scene: WorldScene, x: number, y: number): TileKind | undefined {
  return x >= 0 && y >= 0 && x < scene.width && y < scene.height ? scene.tiles[y * scene.width + x] : undefined;
}
// Every large surface is a real sheet: fibrous pigment, a pale broken cut,
// and a quiet offset seam. Thin geometry is cut into strips rather than stroked.
function line(ctx: CanvasRenderingContext2D, points: number[], color = INK, width = 1.3, _faint = false) {
  ctx.fillStyle = color; ctx.beginPath();
  for (let n = 2; n < points.length; n += 2) {
    const x = points[n - 2], y = points[n - 1], ex = points[n], ey = points[n + 1];
    const length = Math.hypot(ex - x, ey - y); if (length < .01) continue;
    const nx = -(ey - y) / length * width / 2, ny = (ex - x) / length * width / 2;
    ctx.moveTo(x + nx, y + ny);
    ctx.lineTo(ex + nx, ey + ny); ctx.lineTo(ex - nx, ey - ny); ctx.lineTo(x - nx, y - ny); ctx.closePath();
  }
  ctx.fill();
}
function curve(ctx: CanvasRenderingContext2D, color: string, width: number, x: number, y: number, cx: number, cy: number, ex: number, ey: number) {
  const points: number[] = [];
  for (let n = 0; n <= 6; n++) { const t = n / 6, a = 1 - t; points.push(a * a * x + 2 * a * t * cx + t * t * ex, a * a * y + 2 * a * t * cy + t * t * ey); }
  line(ctx, points, color, width, true);
}
function shape(ctx: CanvasRenderingContext2D, points: number[], fill: string, edge = INK, _width = 1.4) {
  const seed = surfaceSeed + (fill.charCodeAt(2) || 0) * 7;
  const xs = points.filter((_, n) => n % 2 === 0), ys = points.filter((_, n) => n % 2 === 1);
  const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  if (area > 100 && edge && !fill.startsWith('rgba')) {
    if (movingSheet) {
      const path = new Path2D(); path.moveTo(points[0], points[1]); for (let n = 2; n < points.length; n += 2) path.lineTo(points[n], points[n + 1]); path.closePath();
      paperPath(ctx, path, fill, [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)], seed, edge ? .35 : .1);
    } else paperShape(ctx, points, fill, seed, edge ? .55 : .15);
    return;
  }
  ctx.beginPath(); ctx.moveTo(points[0], points[1]); for (let n = 2; n < points.length; n += 2) ctx.lineTo(points[n], points[n + 1]);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, seed = 1, edge = true) {
  const k = (n: number) => (noise(n, seed) - .5) * Math.min(3, Math.min(w, h) * .07);
  paperShape(ctx, [x + k(1), y + k(2), x + w * .67, y + k(3), x + w + k(4), y + 1,
    x + w - 1, y + h * .47, x + w + k(5), y + h + k(6), x + w * .24, y + h + k(7), x + k(8), y + h - 1], fill, seed, edge ? .65 : .1);
}
function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, seed: number, edge = false) {
  const points: number[] = [];
  for (let n = 0; n < 8; n++) { const a = n / 8 * Math.PI * 2 + noise(13, seed) * .45, r = .82 + noise(n, seed) * .23; points.push(x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r); }
  shape(ctx, points, color, edge ? P.paper : '', .5);
}
function fibres(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, color = rgba(P.charcoal, .16), count = 9) {
  // Tiny exposed fibres and irregular glue fragments, never hatch marks.
  for (let n = 0; n < Math.min(count, 12); n++) {
    const xx = x + noise(n + 40, seed) * w, yy = y + noise(n + 90, seed) * h;
    const a = 1 + noise(n + 10, seed) * 3, b = .4 + noise(n + 20, seed) * .6;
    shape(ctx, [xx, yy, xx + a, yy - b, xx + a * .7, yy + b, xx - .4, yy + b * .6], color, '', 0);
  }
}
function paperScraps(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, color = rgba(P.ink, .32)) {
  // Illegible paperwork is represented by small pasted scraps, not drawn squiggles.
  for (let n = 0; n < 3; n++) {
    const xx = x + noise(n + 7, seed) * w * .58, yy = y + noise(n + 2, seed) * h * .68;
    shape(ctx, [xx, yy, xx + w * .27, yy - h * .035, xx + w * .23, yy + h * .16, xx - w * .025, yy + h * .13], color, '', 0);
  }
}
function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, alpha = .2) {
  ctx.save(); ctx.globalAlpha *= alpha; shape(ctx, [x - rx, y + ry * .1, x + rx * .13, y - ry, x + rx, y + ry * .4, x + rx * .31, y + ry, x - rx * .85, y + ry * .8], P.ink, '', 0); ctx.restore();
}
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string = P.chalk, font = '12px "DM Sans", sans-serif') {
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3.2;
  ctx.strokeStyle = rgba(P.ink, .79); ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
}
function paintGround(ctx: CanvasRenderingContext2D, scene: WorldScene, tx: number, ty: number, px: number, py: number) {
  const kind = tileAt(scene, tx, ty) || 'void', seed = tx * 31 + ty * 79;
  if (wet(kind) || kind === 'void') return;
  surfaceSeed = seed;
  if (kind === 'woodFloor') {
    // Long mismatched salvage boards cross simulation cells. No square tile drawing.
    if ((tx + ty % 2) % 3 === 0) {
      ctx.save(); ctx.globalAlpha *= .28;
      const offset = noise(1, seed) * 3;
      panel(ctx, px - 2, py + offset, TILE_SIZE * 3 + 6, 12 + noise(2, seed) * 7, noise(4, seed) > .64 ? P.clay : P.umbra, seed);
      panel(ctx, px + 17, py + 18, TILE_SIZE * 3 - 9, 11, noise(5, seed) > .62 ? P.ash : P.bark, seed + 3);
      ctx.restore();
    }
  } else if (kind === 'stoneFloor' || kind === 'stone') {
    if ((tx + ty) % 3 === 0 && noise(2, seed) > .47) {
      ctx.save(); ctx.globalAlpha *= .075;
      shape(ctx, [px - 8, py + 4, px + 32, py - 3, px + 73, py + 1, px + 84, py + 41, px + 30, py + 51, px - 3, py + 45], noise(3, seed) > .5 ? P.ash : P.paper);
      ctx.restore();
    }
  } else if (kind === 'tilled') {
    shape(ctx, [px - 2, py + 4, px + 32, py + 2, px + 35, py + 9, px + 1, py + 12], P.umbra);
    shape(ctx, [px - 2, py + 22, px + 33, py + 19, px + 32, py + 25, px + 1, py + 30], P.clay);
  } else if ((tx + ty * 3) % 5 === 0 && noise(5, seed) > .35) {
    const fill = kind === 'path' || kind === 'dirt' ? [P.umbra, P.clay, P.ochre, P.paper][Math.floor(noise(9, seed) * 4)] : [P.moss, P.ash, P.lichen, P.bark][Math.floor(noise(9, seed) * 4)];
    ctx.save(); ctx.globalAlpha *= .055 + noise(6, seed) * .055;
    shape(ctx, [px - 9, py + 22, px + 13, py + 1, px + 45, py - 7, px + 74, py + 2, px + 99, py - 1,
      px + 130, py + 14, px + 117, py + 39, px + 73, py + 47, px + 37, py + 40, px + 4, py + 44], fill);
    ctx.restore();
  }
}
type ContourPoint = { x: number; y: number };
function simplifyContour(points: ContourPoint[], tolerance: number): ContourPoint[] {
  if (points.length < 5) return points;
  const squaredDistance = (p: ContourPoint, a: ContourPoint, b: ContourPoint) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / Math.max(.01, dx * dx + dy * dy)));
    return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
  };
  const simplifyOpen = (ring: ContourPoint[]): ContourPoint[] => {
    if (ring.length < 3) return ring;
    let furthest = tolerance * tolerance, split = 0;
    for (let n = 1; n < ring.length - 1; n++) {
      const distance = squaredDistance(ring[n], ring[0], ring[ring.length - 1]);
      if (distance > furthest) { furthest = distance; split = n; }
    }
    if (!split) return [ring[0], ring[ring.length - 1]];
    return [...simplifyOpen(ring.slice(0, split + 1)).slice(0, -1), ...simplifyOpen(ring.slice(split))];
  };
  // Splitting a closed contour at distant anchors avoids collapsing the entire loop to one line.
  let opposite = 1, distance = 0;
  for (let n = 1; n < points.length; n++) {
    const d = (points[n].x - points[0].x) ** 2 + (points[n].y - points[0].y) ** 2;
    if (d > distance) { distance = d; opposite = n; }
  }
  const first = simplifyOpen(points.slice(0, opposite + 1));
  const second = simplifyOpen([...points.slice(opposite), points[0]]);
  const ring = [...first.slice(0, -1), ...second.slice(0, -1)];
  return ring.length >= 3 ? ring : points;
}
function groundContours(scene: WorldScene) {
  const cached = contourCache.get(scene.id); if (cached) return cached;
  const layers = new Map<TileKind, Path2D>(), stride = scene.width + 1;
  const loopsByKind = new Map<TileKind, GroundContourLoop[]>();
  for (const kind of Object.keys(colors) as TileKind[]) {
    if (kind === 'grass') continue;
    const outgoing = new Map<number, number[]>();
    const edge = (x1: number, y1: number, x2: number, y2: number) => {
      const start = y1 * stride + x1, end = y2 * stride + x2;
      const edges = outgoing.get(start); if (edges) edges.push(end); else outgoing.set(start, [end]);
    };
    for (let y = 0; y < scene.height; y++) for (let x = 0; x < scene.width; x++) {
      if (tileAt(scene, x, y) !== kind) continue;
      if (tileAt(scene, x, y - 1) !== kind) edge(x, y, x + 1, y);
      if (tileAt(scene, x + 1, y) !== kind) edge(x + 1, y, x + 1, y + 1);
      if (tileAt(scene, x, y + 1) !== kind) edge(x + 1, y + 1, x, y + 1);
      if (tileAt(scene, x - 1, y) !== kind) edge(x, y + 1, x, y);
    }
    if (!outgoing.size) continue;
    const path = new Path2D(), loops: GroundContourLoop[] = [];
    while (outgoing.size) {
      const first = outgoing.keys().next().value!, points: { x: number; y: number }[] = [];
      let key = first, guard = 0;
      do {
        points.push({ x: key % stride * TILE_SIZE, y: Math.floor(key / stride) * TILE_SIZE });
        const next = outgoing.get(key); if (!next?.length) break;
        const ending = next.pop()!; if (!next.length) outgoing.delete(key); key = ending;
      } while (key !== first && guard++ < scene.width * scene.height * 4);
      // Reduce a long run of simulation edges to one illustrated contour.
      const corners = points.filter((p, n) => { const a = points[(n + points.length - 1) % points.length], b = points[(n + 1) % points.length]; return (p.x - a.x) * (b.y - p.y) !== (p.y - a.y) * (b.x - p.x); });
      // Remove the simulation grid's short horizontal/vertical terrace pairs before drawing pigment.
      const tolerance = wet(kind) || kind === 'sand' ? 24 : kind === 'darkGrass' ? 20 : kind === 'dirt' ? 13 : kind === 'path' ? 8 : 2;
      const reduced = simplifyContour(corners, tolerance);
      if (reduced.length < 3) continue;
      const loop = new Path2D(), outline: number[] = [];
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      const point = (x: number, y: number, first = false) => {
        outline.push(x, y);
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
        if (first) loop.moveTo(x, y); else loop.lineTo(x, y);
      };
      // A coastline is a torn sheet, not a smooth ink contour and not the tile grid.
      for (let n = 0; n < reduced.length; n++) {
        const p = reduced[n], next = reduced[(n + 1) % reduced.length];
        point(p.x, p.y, n === 0);
        const length = Math.hypot(next.x - p.x, next.y - p.y), pieces = Math.min(14, Math.floor(length / 15));
        for (let k = 1; k <= pieces; k++) {
          const t = k / (pieces + 1), rough = (worldHash(n * 23 + k, Math.floor(p.x + p.y)) - .5) * (wet(kind) ? 5 : 2.5);
          point(p.x + (next.x - p.x) * t - (next.y - p.y) / Math.max(1, length) * rough,
            p.y + (next.y - p.y) * t + (next.x - p.x) / Math.max(1, length) * rough);
        }
      }
      loop.closePath(); path.addPath(loop);
      loops.push({ path: loop, points: outline, left, top, right, bottom });
    }
    layers.set(kind, path);
    loopsByKind.set(kind, loops);
  }
  contourLoopCache.set(scene.id, loopsByKind);
  contourCache.set(scene.id, layers); return layers;
}

function localGroundContours(scene: WorldScene, cx: number, cy: number, size: number) {
  groundContours(scene);
  // This exceeds the bleed, maximum torn-edge displacement, paper rim and offset
  // shadow combined. Selection never clips a loop or changes its original winding.
  const margin = GROUND_BLEED + 14;
  const left = cx * size - margin, top = cy * size - margin;
  const right = (cx + 1) * size + margin, bottom = (cy + 1) * size + margin;
  const selected = new Map<TileKind, Path2D>();
  for (const [kind, loops] of contourLoopCache.get(scene.id)!) {
    const local = loops.filter(loop => loop.right >= left && loop.left <= right && loop.bottom >= top && loop.top <= bottom);
    if (!local.length) continue;
    if (local.length === 1) { selected.set(kind, local[0].path); continue; }
    const path = new Path2D();
    for (const loop of local) path.addPath(loop.path);
    selected.set(kind, path);
  }
  return selected;
}

function groundCoverage(ctx: CanvasRenderingContext2D, scene: WorldScene, kind: TileKind, path: Path2D, cx: number, cy: number, size: number): 'edge' | 'inside' | 'outside' {
  const margin = GROUND_BLEED + 14;
  const left = cx * size - margin, top = cy * size - margin;
  const right = (cx + 1) * size + margin, bottom = (cy + 1) * size + margin;
  for (const loop of contourLoopCache.get(scene.id)!.get(kind)!) {
    if (loop.right < left || loop.left > right || loop.bottom < top || loop.top > bottom) continue;
    const points = loop.points;
    for (let n = 0; n < points.length; n += 2) {
      const next = (n + 2) % points.length;
      if (Math.max(points[n], points[next]) >= left && Math.min(points[n], points[next]) <= right
        && Math.max(points[n + 1], points[next + 1]) >= top && Math.min(points[n + 1], points[next + 1]) <= bottom) return 'edge';
    }
  }
  // No boundary can reach the canvas, including its bleed/rim/shadow. The compound
  // winding is therefore constant throughout it; checking the original Path2D
  // preserves outer loops, nested holes and islands without recreating topology.
  ctx.save(); ctx.resetTransform();
  const inside = ctx.isPointInPath(path, cx * size + size / 2, cy * size + size / 2);
  ctx.restore();
  return inside ? 'inside' : 'outside';
}
function groundKey(scene: WorldScene, cx: number, cy: number, resolution: number) {
  return `${scene.id}:${cx}:${cy}:${resolution}`;
}
function trimGroundCache(protectedKeys: Set<string>, incomingBytes = 0) {
  if (groundCacheBytes + incomingBytes <= GROUND_CACHE_BYTES) return;
  // Keep the entire visible sheet resident. A fixed entry count used to evict the
  // next row's tiles whenever a large display showed more than 72 chunks.
  for (const [key, canvas] of groundCache) {
    if (protectedKeys.has(key)) continue;
    groundCacheBytes -= canvas.width * canvas.height * 4;
    groundCache.delete(key);
    if (groundCacheBytes + incomingBytes <= GROUND_CACHE_BYTES) break;
  }
}
function artDensity(deviceDensity: number, visibleBytesAtOne: number, budget: number) {
  // Oversample the paper edge just enough for the actual display, then keep a
  // little memory for neighbouring tiles as the camera crosses a chunk seam.
  const desired = Math.min(2, Math.max(.5, Math.ceil(deviceDensity * 2) / 2));
  const maximum = Math.sqrt(budget * .88 / Math.max(1, visibleBytesAtOne));
  return ART_DENSITIES.filter(density => density <= desired && density <= maximum).at(-1) || .5;
}
function paintInteriorRoof(ctx: CanvasRenderingContext2D, scene: WorldScene, cx: number, cy: number, size: number) {
  if (scene.outdoors) return;
  const left = TILE_SIZE, right = (scene.width - 1) * TILE_SIZE, roomW = right - left;
  const top = cy * size - GROUND_BLEED, bottom = (cy + 1) * size + GROUND_BLEED;
  const hospital = scene.id.includes('hospital'), seed = scene.width * 17 + scene.height * 29;
  surfaceSeed = seed;
  // Narrow side cladding and low roof spars remain part of the cached background;
  // the actor walks underneath them without hidden scenery changing collision.
  for (const xx of [left - 5, right - 6]) {
    panel(ctx, xx, top, 11, bottom - top, P.umbra, seed + xx);
    for (let yy = Math.floor(top / 81) * 81; yy < bottom; yy += 81) panel(ctx, xx - 1, yy, 13, 26, hospital ? P.ash : P.clay, seed + yy);
  }
  for (let n = 0, ty = 5.2; ty < scene.height - 2; ty += 6.2, n++) {
    const yy = ty * TILE_SIZE;
    if (yy + 53 < top || yy - 47 > bottom) continue;
    ctx.save(); ctx.globalAlpha *= .1;
    shape(ctx, [left, yy + 7, right, yy + 9, right, yy + 23, left, yy + 18], P.ink, '', 0);
    const patchX = left + (n % 2 ? roomW * .58 : roomW * .09);
    panel(ctx, patchX, yy - 42, roomW * .22, 43, hospital ? P.paper : P.ash, seed + n + 1);
    ctx.restore();
    panel(ctx, left, yy - 3, roomW, 6, P.umbra, seed + n + 7);
    panel(ctx, left + roomW * .12, yy - 1, roomW * .27, 2, P.clay, seed + n + 9, false);
    // Joined scraps of old conduit carry two weak, improvised hanging bulbs.
    curve(ctx, P.ink, .65, left + 7, yy + 4, left + roomW * .46, yy + 30, right - 7, yy + 8);
    for (const ratio of [.27, .73]) {
      const x = left + roomW * ratio;
      line(ctx, [x, yy + 10, x + 1, yy + 27], P.ink, .8, true);
      shape(ctx, [x - 4, yy + 25, x + 5, yy + 25, x + 7, yy + 31, x - 6, yy + 31], P.bark);
      blob(ctx, x + .5, yy + 32, 2, 3, P.ochre, seed + n);
    }
    // Actual tape and replacement tin identify repairs, rather than decorative patterns.
    for (let k = 0; k < 4; k++) {
      const xx = left + roomW * (.12 + k * .24);
      panel(ctx, xx, yy - 6, 18, 10, k % 2 ? P.smoke : P.clay, seed + n * 17 + k);
      panel(ctx, xx + 3, yy - 7, 9, 3, P.paper, seed + n * 29 + k, false);
    }
  }
  // One wet, irregular repair reaches the lower wall beside the true exit opening.
  const lowerY = (scene.height - 3.8) * TILE_SIZE;
  if (lowerY > top - 80 && lowerY < bottom + 80) {
    ctx.save(); ctx.globalAlpha *= .12;
    shape(ctx, [left + 8, lowerY, left + roomW * .16, lowerY - 13, left + roomW * .19, lowerY + 31, left + roomW * .12, lowerY + 68, left + 5, lowerY + 45], P.umbra);
    shape(ctx, [right - 6, lowerY - 9, right - roomW * .16, lowerY + 2, right - roomW * .21, lowerY + 38, right - roomW * .09, lowerY + 67, right - 3, lowerY + 43], P.bark);
    ctx.restore();
  }
}
function groundChunk(scene: WorldScene, cx: number, cy: number, resolution: number, protectedKeys: Set<string>) {
  const key = groundKey(scene, cx, cy, resolution);
  const cached = groundCache.get(key);
  if (cached) { groundCache.delete(key); groundCache.set(key, cached); return cached; }
  const bleed = GROUND_BLEED, size = CHUNK * TILE_SIZE;
  const pixels = Math.round((size + bleed * 2) * resolution);
  // Evict before allocating the backing surface, including during a density or
  // room change, so the cache does not briefly duplicate its entire pixel budget.
  trimGroundCache(protectedKeys, pixels * pixels * 4);
  const c = document.createElement('canvas');
  c.width = c.height = pixels;
  const ctx = c.getContext('2d')!; ctx.scale(resolution, resolution); ctx.translate(bleed, bleed);
  paperTexture(ctx, -bleed, -bleed, size + bleed * 2, size + bleed * 2, scene.outdoors ? colors.grass : colors.void, cx * 17 + cy * 29);
  ctx.save(); ctx.translate(-cx * size, -cy * size);
  for (const [kind, path] of localGroundContours(scene, cx, cy, size)) {
    const originX = cx * size - bleed, originY = cy * size - bleed;
    const coverage = groundCoverage(ctx, scene, kind, path, cx, cy, size);
    if (coverage === 'outside') continue;
    if (coverage === 'inside') {
      // Authored ground stocks are opaque: their full-sheet texture completely
      // covers the old pre-fill overlap shadow, and no distant edge is visible.
      paperTexture(ctx, originX, originY, size + bleed * 2, size + bleed * 2, colors[kind], cx * 17 + cy * 29);
    } else paperPath(ctx, path, colors[kind], [originX, originY, size + bleed * 2, size + bleed * 2], cx * 17 + cy * 29, scene.outdoors ? .9 : .3);
  }
  ctx.restore();
  for (let y = -2; y <= CHUNK; y++) for (let x = -4; x <= CHUNK; x++) paintGround(ctx, scene, cx * CHUNK + x, cy * CHUNK + y, x * TILE_SIZE, y * TILE_SIZE);
  if (!scene.outdoors) { ctx.save(); ctx.translate(-cx * size, -cy * size); paintInteriorRoof(ctx, scene, cx, cy, size); ctx.restore(); }
  groundCache.set(key, c);
  groundCacheBytes += c.width * c.height * 4;
  return c;
}
function fire(ctx: CanvasRenderingContext2D, time: number) {
  panel(ctx, -13, -2, 26, 5, P.umbra, 16, false); line(ctx, [-11, -6, 12, 2], P.bark, 4.5, true);
  for (let n = 0; n < 3; n++) {
    const phase = time * (5.3 + n * .83) + n * 2.3, w = 7 - n * 1.5;
    const h = 17 + Math.sin(phase) * 3 + Math.cos(phase * .61) * 2, tip = Math.sin(phase * .48) * 3 + n - 1;
    shape(ctx, [-w, 0, -w - 1, -h * .33, -w * .5, -h * .52, tip - 2, -h * .41,
      tip, -h, tip + 3, -h * .48, w + 1, -h * .25, w, 0], [P.rust, P.ochre, P.straw][n], '', 0);
  }
  if (sceneryDebris) for (let n = 0; n < 4; n++) {
    const age = (time * (10 + n * .7) + n * 13) % 59, xx = -6 + n * 4 + Math.sin(time * .7 + n) * age * .16, yy = -12 - age;
    ctx.save(); ctx.globalAlpha *= .55 * (1 - age / 59); shape(ctx, [xx - 1, yy, xx + .5, yy - 3, xx + 2, yy - 1, xx + 1, yy + 1], P.ochre, '', 0); ctx.restore();
  }
  for (let n = 0; n < 3; n++) { const age = (time * 8 + n * 19) % 62; blob(ctx, Math.sin(time * .64 + n) * age * .18 + age * .12, -22 - age, 5 + age * .15, 3 + age * .1, rgba(P.charcoal, .12 * (1 - age / 62)), n + 12); }
}
type CanopyShard = { canvas: HTMLCanvasElement; x: number; y: number; width: number; height: number };
const canopyCache = new Map<string, CanopyShard>();
let canopyCacheBytes = 0;
function canopyShard(ctx: CanvasRenderingContext2D, index: number, variant: number, seed: number, width: number, height: number, fill: string) {
  const key = `${index}:${variant}:${seed % 7}:${width}:${height}:${fill}:${paperAssetsRevision()}`;
  let shard = canopyCache.get(key);
  if (!shard) {
    const bleed = 5, resolution = 2, pixelsWide = (width + bleed * 2) * resolution, pixelsHigh = (height + bleed * 2) * resolution;
    const bytes = pixelsWide * pixelsHigh * 4;
    // All normal tree and willow variants fit together. A small entry-count
    // limit used to forget moving canopy fragments as a wide view revealed more.
    while (canopyCache.size && canopyCacheBytes + bytes > CANOPY_CACHE_BYTES) {
      const oldest = canopyCache.keys().next().value!, removed = canopyCache.get(oldest)!;
      canopyCacheBytes -= removed.canvas.width * removed.canvas.height * 4; canopyCache.delete(oldest);
    }
    const canvas = document.createElement('canvas');
    canvas.width = pixelsWide; canvas.height = pixelsHigh;
    const brush = canvas.getContext('2d')!; brush.scale(resolution, resolution); brush.translate(width / 2 + bleed, height / 2 + bleed);
    const ww = width / 2, hh = height / 2;
    const previousMoving = movingSheet; movingSheet = false;
    if (paperAssetsRevision() > 0) {
      // Native fibrous foliage fragments are pasted onto moving branch joints.
      // We draw subregions of the original atlas without rewriting the source image.
      const sourceX = .08 + (index % 3) * .17, sourceY = .02 + (variant % 3) * .04;
      drawPaperAssetRegion(brush, 'willow', sourceX, sourceY, .43, .47, -ww, -hh, width, height);
      if (index % 2 === 0) {
        brush.save(); brush.globalAlpha *= .8;
        drawPaperAssetRegion(brush, 'willow', .38, .11, .37, .36, -ww * .76, -hh * .25, width * .85, height * .68); brush.restore();
      }
    } else {
      const tilt = (noise(index + 19, seed) - .5) * hh * .39;
      shape(brush, [-ww, hh * .17, -ww * .67, -hh * .84 + tilt, ww * .43, -hh * .61,
        ww * .87, -hh * .03, ww * .31, hh * .73, -ww * .77, hh * .54], fill);
      shape(brush, [-ww * .82, -hh * .31, ww * .11, -hh * .96, ww * .57, -hh * .64,
        ww * .08, hh * .13, -ww * .68, hh * .16], index % 2 ? P.lichen : P.sage);
      shape(brush, [ww * .39, hh * .12, ww, -hh * .31, ww * .74, hh * .68, ww * .12, hh * .85], index % 3 ? P.pine : P.ochre);
    }
    movingSheet = previousMoving;
    shard = { canvas, x: -ww - bleed, y: -hh - bleed, width: width + bleed * 2, height: height + bleed * 2 };
    canopyCache.set(key, shard); canopyCacheBytes += canvas.width * canvas.height * 4;
  } else { canopyCache.delete(key); canopyCache.set(key, shard); }
  ctx.drawImage(shard.canvas, shard.x, shard.y, shard.width, shard.height);
}
function nativeTreeStrip(ctx: CanvasRenderingContext2D, sx: number, sy: number, sw: number, sh: number, x: number, y: number, width: number, height: number) {
  const key = `native:${sx}:${sy}:${sw}:${sh}:${width}:${height}:${paperAssetsRevision()}`;
  let shard = canopyCache.get(key);
  if (!shard) {
    const bleed = 1, resolution = 2, pixelsWide = Math.ceil((width + bleed * 2) * resolution), pixelsHigh = Math.ceil((height + bleed * 2) * resolution);
    const bytes = pixelsWide * pixelsHigh * 4;
    while (canopyCache.size && canopyCacheBytes + bytes > CANOPY_CACHE_BYTES) {
      const oldest = canopyCache.keys().next().value!, removed = canopyCache.get(oldest)!;
      canopyCacheBytes -= removed.canvas.width * removed.canvas.height * 4; canopyCache.delete(oldest);
    }
    const canvas = document.createElement('canvas'); canvas.width = pixelsWide; canvas.height = pixelsHigh;
    const brush = canvas.getContext('2d')!; brush.scale(resolution, resolution);
    drawPaperAssetRegion(brush, 'willow', sx, sy, sw, sh, bleed, bleed, width, height);
    shard = { canvas, x: -bleed, y: -bleed, width: pixelsWide / resolution, height: pixelsHigh / resolution };
    canopyCache.set(key, shard); canopyCacheBytes += canvas.width * canvas.height * 4;
  } else { canopyCache.delete(key); canopyCache.set(key, shard); }
  ctx.drawImage(shard.canvas, x + shard.x, y + shard.y, shard.width, shard.height);
}
function drawNativePaperTree(ctx: CanvasRenderingContext2D, o: WorldObject, time: number, fade: number, reducedMotion: boolean) {
  const seed = Math.floor(o.x * 23 + o.y * 17), phase = noise(7, seed) * Math.PI * 2;
  const willow = o.kind === 'willow', variant = o.variant || 0;
  const gust = reducedMotion ? 0 : wind(o.x, o.y, time), height = willow ? 99 + variant * 2 : 87 + variant % 4 * 9;
  const width = height * paperAssetAspect('willow') * (willow ? 1 : .82 + variant % 3 * .07), left = -width * .31, top = 3 - height;
  shadow(ctx, 12, 5, 33, 7, .19);
  // The entire bottom quarter, including roots, is never translated or rotated.
  nativeTreeStrip(ctx, 0, .74, 1, .26, left, top + height * .74, width, height * .26);
  ctx.save(); ctx.globalAlpha *= fade;
  const lowerJoint = top + height * .75;
  ctx.save(); ctx.translate(0, lowerJoint); ctx.rotate(gust * .018);
  nativeTreeStrip(ctx, 0, .4, 1, .36, left, top + height * .4 - lowerJoint, width, height * .36);
  ctx.restore();
  const upperJoint = top + height * .43;
  ctx.save(); ctx.translate(gust * 1.1, upperJoint); ctx.rotate(gust * .035);
  nativeTreeStrip(ctx, 0, 0, 1, .43, left, top - upperJoint, width, height * .43);
  ctx.restore();
  // The hanging strips move individually; lower ends can lag the branches in a gust.
  for (let n = 0; n < 6; n++) {
    const sourceX = .36 + n * .098, sourceW = n === 5 ? .12 : .1, leafY = .41;
    const jointX = left + width * sourceX, jointY = top + height * leafY;
    const lag = reducedMotion ? 0 : Math.sin(time * (1.05 + n * .08) + phase + n * .61) * .012;
    ctx.save(); ctx.translate(jointX + gust * 1.7, jointY); ctx.rotate(gust * (.042 + n * .003) + lag);
    nativeTreeStrip(ctx, sourceX, leafY, sourceW, .36, 0, 0, width * sourceW, height * .36); ctx.restore();
  }
  if (sceneryDebris && !reducedMotion && noise(9, seed) > .5) {
    const age = (time * 6 + phase * 8) % 90, xx = 7 + Math.sin(age * .13 + phase) * 9 + gust * age * .16, yy = -76 + age;
    ctx.save(); ctx.globalAlpha *= Math.min(1, (90 - age) / 20); shape(ctx, [xx - 2, yy, xx + 1, yy - 2, xx + 3, yy + 2, xx, yy + 4], P.bark, '', 0); ctx.restore();
  }
  ctx.restore();
}
function drawTree(ctx: CanvasRenderingContext2D, o: WorldObject, time: number, fade: number, reducedMotion = false) {
  if (paperAssetsRevision() > 0) { drawNativePaperTree(ctx, o, time, fade, reducedMotion); return; }
  const willow = o.kind === 'willow', variant = o.variant || 0, seed = Math.floor(o.x * 23 + o.y * 17);
  const previousSeed = surfaceSeed, previousMoving = movingSheet; surfaceSeed = seed; movingSheet = true;
  const phase = noise(7, seed) * Math.PI * 2;
  const gust = reducedMotion ? 0 : wind(o.x, o.y, time);
  const bend = gust * (willow ? 9.5 : 7.2), crown = gust * (willow ? 14 : 10.5);
  shadow(ctx, 12, 5, willow ? 31 : 23, 8, .18);
  if (paperAssetsRevision() > 0) {
    // Native torn bark has the same dense fibres as the foliage. The lower
    // root segment stays fixed while only the upper stem pivots into the wind.
    drawPaperAssetRegion(ctx, 'willow', .08, .74, .48, .26, -18, -29.4, 32, 32.4);
    ctx.save(); ctx.translate(0, -29.4); ctx.rotate(gust * .027);
    drawPaperAssetRegion(ctx, 'willow', .08, .43, .48, .33, -18, -38.6, 32, 41.1); ctx.restore();
  } else {
  // The foot stays rooted. The middle joint and crown answer the wind at different distances.
  shape(ctx, [-6, 3, -4 + bend * .28, -29, -7 + bend * .63, -46,
    -1 + crown, -70, 4 + crown, -73, 7 + bend * .67, -42, 5 + bend * .22, -25, 8, 3], variant === 2 ? P.paper : P.bark, P.ink, 1.7);
  shape(ctx, [-3, 2, -2 + bend * .24, -28, 1 + bend * .64, -47, 3 + crown, -65, 4 + crown, -63, 3 + bend * .62, -39, 1 + bend * .23, -21, 2, 2], variant === 2 ? P.ash : P.clay, '', 0);
  line(ctx, [-6, 2, -15, 6, -9, 2, 4, 2, 16, 4], P.ink, 1.1, true);
  }
  const shards = willow ? [
    { x: -22, y: -64, w: 22, h: 14, fill: P.bark }, { x: 20, y: -63, w: 24, h: 17, fill: P.pine },
    { x: -2, y: -79, w: 28, h: 17, fill: P.umbra }, { x: 11, y: -42, w: 15, h: 11, fill: P.moss },
  ] : variant === 1 ? [
    { x: 0, y: -83, w: 28, h: 34, fill: P.moss }, { x: -10, y: -61, w: 37, h: 30, fill: P.pine },
    { x: 12, y: -44, w: 41, h: 28, fill: P.moss }, { x: -8, y: -31, w: 37, h: 18, fill: P.pine },
  ] : variant === 2 ? [
    { x: -12, y: -78, w: 36, h: 37, fill: P.sage }, { x: 14, y: -65, w: 40, h: 32, fill: P.moss },
    { x: -18, y: -49, w: 34, h: 26, fill: P.lichen },
  ] : [
    { x: -18, y: -62, w: 40, h: 37, fill: P.moss }, { x: 8, y: -82, w: 45, h: 30, fill: P.sage },
    { x: 24, y: -54, w: 36, h: 35, fill: P.pine }, { x: -7, y: -40, w: 41, h: 27, fill: P.moss },
  ];
  ctx.save(); ctx.globalAlpha *= fade;
  for (let n = 0; n < shards.length; n++) {
    const shard = shards[n], lag = reducedMotion ? 0 : Math.sin(time * (1.12 + n * .07) + phase - n * .71) * (2.1 + Math.abs(gust) * 2.5);
    const bx = bend * (.47 + n * .11), by = -38 - n * 3;
    const tipX = shard.x + crown * (.69 + n * .15) + lag;
    const tipY = shard.y + (reducedMotion ? 0 : Math.sin(time * .82 + phase + n) * 2.7);
    line(ctx, [bend * .45, -35, bx + shard.x * .39, by - 10, tipX, tipY + 6], P.umbra, 2.7 - n * .22, true);
    ctx.save(); ctx.translate(tipX, tipY); ctx.rotate(reducedMotion ? 0 : gust * (.075 + n * .014) + lag * .009);
    canopyShard(ctx, n, variant + (willow ? 4 : 0), seed, shard.w, shard.h, shard.fill); ctx.restore();
  }
  if (willow) for (let n = 0; n < 14; n++) {
    const xx = -34 + n * 5, yy = -61 + noise(n, seed) * 13, length = 28 + noise(n + 14, seed) * 37;
    const joint = crown * .84 + (reducedMotion ? 0 : Math.sin(time * 1.19 + phase + n * .31) * 3);
    const pull = gust * (12 + n % 4 * 2) + (reducedMotion ? 0 : Math.sin(time * 1.65 + n * .45 + phase) * 4);
    curve(ctx, n % 2 ? P.pine : P.moss, 1.25 + noise(n + 8, seed) * .8, xx + joint, yy, xx + joint + pull * .42, yy + length * .57, xx + joint + pull, yy + length);
    for (let k = 1; k < 4; k++) {
      const y = yy + k * length / 4, x = xx + joint + pull * (k / 4) ** 2;
      shape(ctx, [x, y - 2, x + 3 + gust * 2, y + 1, x + 1 + gust * 2, y + 9, x - 1, y + 6], n % 3 ? P.bark : P.moss, '', 0);
    }
  }
  if (sceneryDebris && !reducedMotion && noise(9, seed) > .51) {
    const age = (time * 6 + phase * 8) % 92, xx = -19 + noise(4, seed) * 41 + Math.sin(age * .14 + phase) * 8 + gust * age * .18, yy = -86 + age;
    ctx.save(); ctx.globalAlpha *= Math.min(1, (92 - age) / 18);
    shape(ctx, [xx - 3, yy, xx + 2, yy - 2, xx + 4, yy + 2, xx, yy + 3], P.ochre, '', 0); ctx.restore();
  }
  ctx.restore(); surfaceSeed = previousSeed; movingSheet = previousMoving;
}
function trailerWindow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number) {
  panel(ctx, x - 4, y - 4, w + 8, h + 7, P.bark, seed);
  panel(ctx, x - 1, y - 1, w + 2, h + 2, P.ash, seed + 1);
  panel(ctx, x + 2, y + 2, w - 4, h - 4, P.deepWater, seed + 2, false);
  shape(ctx, [x + 3, y + 3, x + w * .65, y + 3, x + w * .4, y + h * .48, x + 3, y + h * .73], P.fog, '', 0);
  shape(ctx, [x + w * .48, y + h * .35, x + w - 3, y + 5, x + w - 3, y + h - 3, x + w * .37, y + h - 3], P.smoke, '', 0);
  panel(ctx, x + w * .47, y - 1, 2, h + 2, P.bark, seed + 3, false);
  // Tape crosses broken glazing in broad straight paper bands.
  line(ctx, [x + 1, y + h * .77, x + w - 1, y + h * .14], rgba(P.chalk, .52), 2.2, true);
  line(ctx, [x + 2, y + h * .26, x + w - 2, y + h * .68], rgba(P.paper, .53), 2.7, true);
  panel(ctx, x - 3, y + 1, 9, 4, P.paper, seed + 4, false); panel(ctx, x + w - 6, y + h - 3, 9, 4, P.paper, seed + 5, false);
}
function drawBuilding(ctx: CanvasRenderingContext2D, o: WorldObject, _time: number) {
  const w = (o.width || 5) * TILE_SIZE, h = (o.height || 4) * TILE_SIZE, variant = o.variant || 0, seed = o.x * 13 + o.y * 37;
  const civic = variant > 0, front = h * .38;
  const cladding = variant === 4 ? P.ash : variant === 3 ? P.rust : variant === 2 ? P.fog : [P.water, P.ash, P.clay, P.smoke][Math.floor(noise(8, seed) * 4)];
  shadow(ctx, w / 2 + 13, h + 9, w / 2 + 10, 12, .24);
  if (!civic && drawPaperAsset(ctx, 'trailer', -21, -35, w + 42, h + 49)) {
    // The generated shanty is kept intact. A modest salvaged central entrance
    // makes the actual walkable doorway unmistakable without moving any colliders.
    const doorW = Math.min(32, w * .18), doorH = Math.min(55, h * .4);
    panel(ctx, w / 2 - doorW / 2 - 3, h - doorH - 10, doorW + 6, doorH + 6, P.ash, seed + 63);
    drawPaperAssetRegion(ctx, 'trailer', .595, .355, .155, .385, w / 2 - doorW / 2, h - doorH - 7, doorW, doorH);
    panel(ctx, w / 2 + doorW / 2 - 5, h - 24, 2, 6, P.ochre, seed + 65, false);
    for (let n = 0; n < 2; n++) panel(ctx, w / 2 - 22 - n * 4, h - 9 + n * 7, 44 + n * 8, 6, n % 2 ? P.ash : P.bark, seed + n + 66);
    if (o.label) {
      const labelW = Math.min(w - 12, Math.max(98, o.label.length * 6));
      panel(ctx, w / 2 - labelW / 2, front - 8, labelW, 21, P.paper, seed + 68);
      ctx.font = '11px "Libre Baskerville", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = P.ink; ctx.fillText(o.label, w / 2, front + 3);
    }
    return;
  }
  for (const xx of [w * .17, w * .78]) { blob(ctx, xx, h - 4, 13, 16, P.ink, seed + xx); blob(ctx, xx, h - 4, 6, 8, P.slate, seed + xx + 2); }
  for (const xx of [7, w * .34, w * .64, w - 25]) {
    panel(ctx, xx, h - 5, 22, 16, P.fog, seed + xx);
    shape(ctx, [xx + 4, h - 2, xx + 9, h - 2, xx + 9, h + 6, xx + 4, h + 6], P.charcoal, '', 0);
    shape(ctx, [xx + 13, h - 2, xx + 18, h - 1, xx + 17, h + 6, xx + 13, h + 6], P.charcoal, '', 0);
  }
  // The cladding has accumulated layers of incompatible salvage, exactly as in the study.
  shape(ctx, [0, front - 2, w * .48, front - 6, w + 1, front + 2, w - 2, h - 4, w * .57, h - 1, 0, h - 7], cladding);
  shape(ctx, [0, front + 3, w * .075, front - 7, w * .075, h - 2, 0, h - 8], P.umbra);
  for (let n = 0; n < Math.max(7, Math.ceil(w / 34)); n++) {
    const xx = 5 + n * (w - 10) / Math.max(7, Math.ceil(w / 34)), yy = front + 5 + noise(n + 20, seed) * (h - front - 28);
    const patchW = 9 + noise(n + 2, seed) * 28, patchH = 13 + noise(n + 4, seed) * 30;
    const pigment = [P.paper, P.rust, P.ash, P.clay, P.water, P.umbra][Math.floor(noise(n + 31, seed) * 6)];
    panel(ctx, xx, yy, Math.min(patchW, w - xx - 3), Math.min(patchH, h - yy - 4), pigment, seed + n * 7);
  }
  for (let xx = 10; xx < w - 2; xx += 24) {
    line(ctx, [xx, front + 2, xx + 1, h - 5], rgba(P.ink, .19), .7, true);
    if (noise(xx, seed) > .56) line(ctx, [xx + 4, front + 11, xx + 2, front + 32], P.rust, 1.7, true);
  }
  // Uneven tin roofing and a darker patched tarp. All lighting is overlapping paper.
  shape(ctx, [-6, front + 2, 7, front - 27, w * .39, front - 37, w - 8, front - 28, w + 7, front + 7, w * .52, front + 2], P.umbra);
  shape(ctx, [4, front - 1, 12, front - 25, w * .43, front - 31, w * .49, front + 1], P.slate);
  shape(ctx, [w * .19, front - 28, w * .35, front - 31, w * .41, front - 4, w * .21, front], P.rust);
  shape(ctx, [w * .49, front - 31, w * .83, front - 28, w + 5, front + 8, w * .55, front + 3], P.deepWater);
  shape(ctx, [w * .57, front - 24, w * .64, front - 25, w * .77, front + 4, w * .7, front + 4], P.smoke);
  line(ctx, [-6, front + 1, w * .47, front, w + 7, front + 7], P.ink, 2.1, true);
  const doorW = civic ? 43 : 29, doorH = Math.max(34, Math.min(82, h - front - 14));
  panel(ctx, w / 2 - doorW / 2 - 5, h - doorH - 8, doorW + 10, doorH + 7, P.ash, seed + 61);
  panel(ctx, w / 2 - doorW / 2, h - doorH - 3, doorW, doorH + 2, P.charcoal, seed + 62);
  panel(ctx, w / 2 - doorW / 2 + 3, h - doorH, doorW * .47, doorH - 2, P.umbra, seed + 63, false);
  panel(ctx, w / 2 + doorW / 2 - 8, h - 23, 3, 8, P.ochre, seed + 64, false);
  for (let xx = 18; xx < w - 38; xx += civic ? 104 : 64) if (Math.abs(xx + 15 - w / 2) > doorW * .92) trailerWindow(ctx, xx, front + 16, civic ? 43 : 30, Math.min(49, h - front - 31), seed + xx);
  // A central readable door is kept aligned with the existing interaction footprint.
  for (let n = 0; n < 3; n++) panel(ctx, w / 2 - 22 - n * 3, h + n * 5 - 1, 44 + n * 6, 6, n % 2 ? P.ash : P.bark, seed + n + 81);
  panel(ctx, w * .15, front - 50, 10, 29, P.rust, seed + 8); panel(ctx, w * .15 - 3, front - 53, 16, 4, P.ink, seed + 9, false);
  if (!civic) {
    shape(ctx, [-13, front + 10, w * .27, front + 8, w * .28, front + 33, -23, front + 36], P.deepWater);
    shape(ctx, [0, front + 15, w * .24, front + 12, w * .16, front + 27, -15, front + 31], P.smoke);
    line(ctx, [-19, front + 34, -18, h + 6], P.bark, 3.1, true); line(ctx, [w * .26, front + 31, w * .27, h + 2], P.ink, 2.5, true);
    panel(ctx, w - 20, h - 22, 18, 20, P.umbra, seed + 91);
    panel(ctx, 4, h - 23, 17, 23, P.clay, seed + 94); panel(ctx, 7, h - 19, 11, 15, P.ash, seed + 95, false);
    line(ctx, [7, h - 14, 18, h - 14], P.umbra, 1.1, true);
  }
  if (variant === 4) {
    // The Great Castle is an enormous patched administrative frontage on scaffolding.
    // Its grandeur is a ration office's claim, not clean fantasy masonry.
    for (const xx of [6, w - 92]) {
      panel(ctx, xx, front - 127, 80, h - front + 123, P.ash, seed + xx);
      panel(ctx, xx + 52, front - 127, 26, h - front + 122, P.clay, seed + xx + 1);
      for (let yy = front - 113; yy < h - 25; yy += 67) trailerWindow(ctx, xx + 16, yy, 25, 29, seed + yy);
      shape(ctx, [xx - 8, front - 119, xx + 9, front - 141, xx + 69, front - 142, xx + 89, front - 118], P.slate);
      for (let yy = front - 115; yy < h; yy += 63) line(ctx, [xx - 9, yy, xx + 88, yy + 2], P.bark, 2.4, true);
      line(ctx, [xx - 9, front - 125, xx - 9, h + 9], P.ink, 2.5, true); line(ctx, [xx + 88, front - 123, xx + 88, h + 7], P.ink, 2.5, true);
      line(ctx, [xx - 9, front - 70, xx + 88, front + 24, xx - 9, front + 117, xx + 88, h - 8], P.bark, 1.8, true);
    }
  }
  if (variant === 2) { panel(ctx, w * .77 - 12, front + 16, 26, 7, P.chalk, seed + 14); panel(ctx, w * .77 - 3, front + 6, 7, 27, P.chalk, seed + 15); }
  if (o.label) {
    const text = o.label.replace('Library of ', '').replace('Hospital for Those ', 'Hospital: '), lw = Math.min(w - 18, Math.max(100, text.length * 6));
    panel(ctx, w / 2 - lw / 2, front + 3, lw, 23, P.paper, seed + 48);
    ctx.save(); ctx.translate(w / 2, front + 15); ctx.rotate(-.012); ctx.font = '12px "Libre Baskerville", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = P.ink; ctx.fillText(text, 0, 0); ctx.restore();
  }
  // The cable sags from separate poles; the tiny lamp stays visibly improvised.
  line(ctx, [-29, front - 60, -30, h + 7], P.umbra, 2.2, true);
  curve(ctx, P.ink, .9, -29, front - 50, w / 2, front + 14, w + 25, front - 28);
}
function drawObject(ctx: CanvasRenderingContext2D, o: WorldObject, time: number, fade = 1) {
  const v = o.variant || 0, seed = o.x * 29 + o.y * 73, w = (o.width || 1) * 32, h = (o.height || 1) * 32;
  surfaceSeed = seed;
  switch (o.kind) {
    case 'tree': case 'willow': drawTree(ctx, o, time, fade); break;
    case 'building': drawBuilding(ctx, o, time); break;
    case 'rock': case 'ore':
      shadow(ctx, 5, 4, 17, 5, .19); blob(ctx, -1, -7, 16, 11, P.sage, seed, true); shape(ctx, [-13, -9, -5, -20, 6, -17, 13, -7, 2, -5], P.fog, rgba(P.umbra, .36), 1); fibres(ctx, -10, -15, 23, 17, seed, rgba(P.umbra, .30), 8);
      if (o.kind === 'ore') { blob(ctx, -5, -13, 4, 3, P.fog, seed); blob(ctx, 6, -8, 4, 2, P.ash, seed + 1); line(ctx, [-6, -13, -3, -9, 3, -10, 7, -6], P.smoke, 1.8); } break;
    case 'flower': {
      const sway = wind(o.x, o.y, time) * 3;
      curve(ctx, P.smoke, 1.4, 0, 2, -2, -7, sway, -14);
      curve(ctx, P.sage, 1.9, 0, -5, -7, -8, -7, -5); curve(ctx, P.smoke, 1.7, 0, -8, 5, -11, 7, -8);
      const c = [P.sand, P.flesh, P.fog, P.ash][v % 4];
      for (let i = 0; i < 5; i++) blob(ctx, sway + Math.cos(i * 1.256) * 3, -15 + Math.sin(i * 1.256) * 2.5, 2.6, 2.1, c, seed + i);
      blob(ctx, sway, -15, 1.4, 1.3, P.clay, seed); break;
    }
    case 'bush': shadow(ctx, 3, 3, 16, 5, .15); blob(ctx, 0, -9, 17, 12, P.smoke, seed, true); fibres(ctx, -13, -16, 25, 17, seed, rgba(P.charcoal, .23), 9); paperScraps(ctx, -11, -14, 23, 12, seed); if (v % 2) { blob(ctx, -6, -11, 2, 2, P.clay, seed); blob(ctx, 7, -8, 2, 2, P.clay, seed + 1); } break;
    case 'crop': {
      const bend = wind(o.x, o.y, time) * 3.5;
      curve(ctx, P.moss, 2, 0, 3, -3 + bend * .4, -7, 2 + bend, -16);
      ctx.save(); ctx.translate(bend * .7, 0); ctx.rotate(bend * .016);
      blob(ctx, -6, -7, 6, 2.5, P.sage, seed, true); blob(ctx, 6, -13, 7, 3, P.sage, seed + 1, true); ctx.restore();
      blob(ctx, -1, 0, 6, 4, v % 2 ? P.ochre : P.ochre, seed + 2, true); break;
    }
    case 'reed':
      if (v === 8) { curve(ctx, P.sage, 3.5, -14, 3, 8, -2, 13, 4); curve(ctx, P.fog, 2.6, -10, -2, -16, -17, 1, -8); curve(ctx, P.sage, 2.1, 1, -8, 10, -13, 7, 0); break; }
      for (let i = 0; i < 5; i++) { const xx = -7 + i * 3.3, sway = wind(o.x + i * .8, o.y, time) * (3 + i * .15), hh = 16 + noise(i, seed) * 17; curve(ctx, P.smoke, 1.2, xx, 5, xx + sway * 2, -hh / 2, xx + sway, -hh); blob(ctx, xx + sway, -hh, 1.7, 5, P.sage, seed + i, true); } break;
    case 'campfire':
      shadow(ctx, 0, 4, 17, 6, .19); for (let n = 0; n < 6; n++) { const a = n / 6 * Math.PI * 2; blob(ctx, Math.cos(a) * 14, Math.sin(a) * 6 + 2, 4, 3, P.sage, seed + n, true); } fire(ctx, time + noise(5, seed) * 13); break;
    case 'lantern':
      shadow(ctx, 3, 3, 7, 3, .15); curve(ctx, P.moss, 2.5, 0, 5, 2, -18, -1, -36); curve(ctx, P.moss, 1.6, -1, -35, -3, -43, 6, -38);
      panel(ctx, 0, -35, 9, 14, P.sage, seed); blob(ctx, 4, -28, 3, 5, P.sand, seed + 1); line(ctx, [0, -21, 9, -21], P.slate, 1.7); break;
    case 'bench':
      shadow(ctx, 3, 4, 21, 6, .19); line(ctx, [-15, -8, -14, 6], P.bark, 3.8); line(ctx, [15, -7, 15, 6], P.bark, 3.8);
      panel(ctx, -21, -13, 42, 8, P.clay, seed); panel(ctx, -20, -28, 40, 8, P.clay, seed + 1); line(ctx, [-15, -23, -15, -9], P.bark, 2.4); line(ctx, [14, -23, 14, -10], P.bark, 2.6); fibres(ctx, -17, -26, 33, 21, seed, rgba(P.charcoal, .30), 7); break;
    case 'workbench':
      shadow(ctx, 2, 3, 24, 6, .2); line(ctx, [-17, -10, -18, 7], P.slate, 5); line(ctx, [17, -12, 16, 7], P.slate, 4.6);
      panel(ctx, -24, -26, 48, 17, P.clay, seed); fibres(ctx, -23, -25, 47, 14, seed, rgba(P.charcoal, .25), 13); line(ctx, [-12, -30, 0, -29], P.moss, 3); line(ctx, [8, -31, 9, -20], P.bark, 2); blob(ctx, 10, -31, 5, 2, P.fog, seed + 2, true); paperScraps(ctx, -19, -23, 24, 9, seed); break;
    case 'well':
      shadow(ctx, 3, 3, 22, 8, .2); panel(ctx, -20, -20, 40, 28, P.sage, seed); blob(ctx, 0, -21, 21, 7, P.fog, seed + 1, true); blob(ctx, 0, -21, 13, 3, P.pine, seed + 2); line(ctx, [-22, -42, -22, 3], P.bark, 4); line(ctx, [23, -42, 24, 3], P.bark, 3.6);
      shape(ctx, [-29, -41, -17, -49, 18, -48, 31, -39], P.clay, INK, 1.2); curve(ctx, P.sand, 1.4, 2, -38, -1, -29, 2, -19); fibres(ctx, -18, -14, 34, 21, seed, rgba(P.charcoal, .20), 9); break;
    case 'sign':
      line(ctx, [-1, 4, -2, -24], P.bark, 4);
      if (v === 1) {
        if (drawPaperAsset(ctx, 'billboard', -43, -108, 86, 115)) break;
        panel(ctx, -31, -69, 63, 49, P.sand, seed); panel(ctx, -27, -65, 55, 35, P.sage, seed + 1);
        drawActorSprite(ctx, 'lady', 0, -28, Math.PI / 2, false, 0, 0, .61, undefined, { reducedMotion: true, billboard: true });
        panel(ctx, -27, -30, 55, 8, P.ash, seed + 3, false); ctx.font = '8px "Patrick Hand", sans-serif'; ctx.fillStyle = P.slate; ctx.textAlign = 'center'; ctx.fillText('BE DIVINE', 0, -24); fibres(ctx, -27, -65, 55, 35, seed, rgba(P.paper, .21), 14);
      } else if (v === 2) {
        line(ctx, [-23, -83, 23, -81], P.clay, 3);
      } else { panel(ctx, -24, -43, 48, 24, P.sand, seed); paperScraps(ctx, -18, -38, 32, 11, seed); line(ctx, [-18, -24, 15, -26], P.clay, .8, true); }
      break;
    case 'crate': case 'chest':
      shadow(ctx, 3, 4, 16, 6, .18); panel(ctx, -16, -17, 33, 24, P.clay, seed); shape(ctx, [-16, -17, -10, -23, 14, -22, 18, -16], P.sand, INK, 1.3); line(ctx, [-9, -16, -8, 5], P.bark, 2.6); line(ctx, [10, -16, 10, 5], P.bark, 2.6); panel(ctx, -2, -10, 5, 7, P.sand, seed + 1); fibres(ctx, -13, -17, 29, 22, seed, rgba(P.charcoal, .24), 9); break;
    case 'fence':
      line(ctx, [-16, -16, 16, -18], P.clay, 4); line(ctx, [-16, -6, 15, -4], P.smoke, 3); line(ctx, [-12, 4, -14, -23], P.smoke, 4); line(ctx, [12, 4, 10, -24], P.clay, 3.6); line(ctx, [-14, -19, -12, -3, 11, -13, 12, -23], rgba(P.charcoal, .30), .6, true); break;
    case 'grave':
      shadow(ctx, 3, 4, 14, 5, .18); panel(ctx, -11, -30, 22, 34, P.fog, seed); line(ctx, [-8, -11, 7, -13], P.smoke, .9, true); paperScraps(ctx, -7, -24, 15, 10, seed, rgba(P.charcoal, .30)); blob(ctx, 1, 3, 16, 4, P.smoke, seed + 1); break;
    case 'altar':
      panel(ctx, -20, -6, 40, 13, P.sage, seed); panel(ctx, -15, -14, 30, 10, P.sand, seed + 1);
      if (v === 2) { panel(ctx, -10, -80, 20, 64, P.fog, seed + 2); panel(ctx, -16, -87, 32, 8, P.ash, seed + 3); line(ctx, [-5, -79, -4, -18], P.ash, 3, true); fibres(ctx, -8, -72, 17, 55, seed, rgba(P.umbra, .15), 9); }
      else if (v === 1) { drawActorSprite(ctx, 'lady', 0, -16, Math.PI / 2, false, 0, 0, 1, P.fog); }
      else if (v === 3) { panel(ctx, -15, -37, 29, 22, P.fog, seed + 3); panel(ctx, -7, -59, 23, 22, P.sand, seed + 4); panel(ctx, -16, -70, 14, 18, P.clay, seed + 5); }
      else if (v === 4) { panel(ctx, -14, -44, 28, 30, P.water, seed + 3); shape(ctx, [-12, -41, 10, -40, 11, -18, -11, -18], rgba(P.ash, .32), '', 0); blob(ctx, 0, -30 + Math.sin(time) * 1.5, 4, 3, P.sand, seed + 4, true); }
      else { panel(ctx, -12, -34, 24, 20, P.sage, seed + 3); blob(ctx, 0, -34, 8, 3, P.slate, seed + 4); } break;
    case 'bed': {
      shadow(ctx, w * .52, h + 5, w * .55, 8, .18);
      if (drawPaperAsset(ctx, 'bed', -4, -12, w + 8, h + 22)) break;
      panel(ctx, 1, 5, w - 2, h - 9, P.umbra, seed);
      for (const xx of [5, w - 12]) panel(ctx, xx, h - 3, 6, 13, P.slate, seed + xx);
      panel(ctx, 5, 4, w - 10, h - 8, P.ash, seed + 1);
      panel(ctx, 7, 10, w - 14, Math.min(24, h * .27), P.paper, seed + 2);
      shape(ctx, [7, h * .28, w * .7, h * .3, w - 7, h * .23, w - 6, h - 8, w * .48, h - 2, 7, h - 9], P.paper);
      shape(ctx, [w * .32, h * .33, w * .49, h * .29, w * .62, h - 8, w * .44, h - 7], P.ash);
      shape(ctx, [w * .57, h * .3, w * .79, h * .29, w - 8, h - 6, w * .73, h - 8], P.clay);
      shape(ctx, [8, h * .63, w * .24, h * .6, w * .33, h - 9, 8, h - 8], P.smoke);
      panel(ctx, 0, -2, w, 6, P.slate, seed + 3); panel(ctx, 0, h - 7, w, 6, P.slate, seed + 4);
      break;
    }
    case 'bookshelf': {
      if (paperAssetsRevision() > 0) {
        const boxH = Math.max(79, h + 35), columns = Math.max(1, Math.ceil(w / (boxH * paperAssetAspect('shelves')))), cellW = w / columns;
        for (let n = 0; n < columns; n++) drawPaperAsset(ctx, 'shelves', n * cellW - 1, -38, cellW + 2, boxH);
        break;
      }
      const shelfH = Math.max(72, h + 29), shelfY = -34;
      panel(ctx, 0, shelfY, w, shelfH, P.umbra, seed);
      panel(ctx, 5, shelfY + 5, w - 10, shelfH - 8, P.charcoal, seed + 1, false);
      for (let row = 0; row < 3; row++) {
        const yy = shelfY + 9 + row * (shelfH - 15) / 3, baseline = yy + (shelfH - 15) / 3 - 4;
        for (let xx = 8; xx < w - 12; xx += 9 + noise(row, seed) * 3) {
          const height = 12 + noise(xx + row, seed) * 13, c = [P.ash, P.clay, P.paper, P.bark, P.fog][Math.floor(noise(xx + row * 11, seed) * 5)];
          ctx.save(); ctx.translate(xx, baseline); ctx.rotate((noise(xx + row + 8, seed) - .5) * .22);
          panel(ctx, 0, -height, 5 + noise(xx, seed) * 4, height, c, seed + xx + row, false);
          if (noise(xx + row + 4, seed) > .66) panel(ctx, .4, -height * .75, 5, 2, P.umbra, seed + xx, false); ctx.restore();
        }
        panel(ctx, 2, baseline + 1, w - 4, 4, row % 2 ? P.bark : P.clay, seed + row + 19);
      }
      panel(ctx, 0, shelfY, 5, shelfH, P.slate, seed + 5); panel(ctx, w - 6, shelfY, 6, shelfH, P.slate, seed + 6);
      break;
    }
    case 'table': {
      shadow(ctx, w * .5 + 4, h + 8, w * .5 + 4, 8, .16);
      panel(ctx, 5, h - 10, 7, 22, P.umbra, seed + 8); panel(ctx, w - 13, h - 11, 7, 23, P.umbra, seed + 9);
      shape(ctx, [0, -9, w - 2, -13, w + 2, h - 7, w * .53, h - 3, 0, h - 6], P.bark);
      shape(ctx, [3, -5, w * .5, -8, w * .45, h - 9, 3, h - 9], P.clay);
      panel(ctx, 0, h - 8, w, 5, P.umbra, seed + 1);
      if (v === 1) {
        panel(ctx, 5, -3, w - 10, h - 14, P.pine, seed + 2);
        for (let n = 0; n < 3; n++) panel(ctx, w * (.25 + n * .22), h * .33, 10, 15, n % 2 ? P.paper : P.flesh, seed + n + 8);
      } else {
        const stackW = Math.min(42, w * .32);
        panel(ctx, 10, 1, stackW, Math.min(23, h * .36), P.paper, seed + 3);
        panel(ctx, 13, -1, stackW, Math.min(23, h * .36), P.ash, seed + 4);
        panel(ctx, 15, -3, stackW, Math.min(23, h * .36), P.paper, seed + 5);
        for (let n = 0; n < 3; n++) line(ctx, [19, 2 + n * 4, 19 + stackW * .63, 1 + n * 4], rgba(P.umbra, .35), .65, true);
        panel(ctx, w * .65, h * .45, Math.min(30, w * .22), 15, P.ash, seed + 6);
        blob(ctx, w - 16, 9, 5, 6, P.deepWater, seed + 7); blob(ctx, w - 16, 5, 4, 2, P.umbra, seed + 8);
      }
      break;
    }
    case 'rug':
      shape(ctx, [0, 1, w, -1, w - 3, h, 1, h + 2], P.umbra);
      panel(ctx, 4, 4, w - 8, h - 8, P.clay, seed);
      for (let n = 0; n < 5; n++) { const xx = noise(n + 2, seed) * (w - 29), yy = noise(n + 11, seed) * (h - 15); panel(ctx, xx, yy, 16 + noise(n, seed) * 18, 10 + noise(n + 7, seed) * 7, [P.ash, P.smoke, P.bark][n % 3], seed + n); }
      break;
    case 'window': trailerWindow(ctx, -11, -35, 23, 29, seed); line(ctx, [-16, -4, 16, -5], P.fog, 3); break;
    case 'portrait':
      panel(ctx, -21, -53, 42, 48, P.clay, seed); panel(ctx, -17, -49, 34, 40, P.clay, seed + 1);
      drawActorSprite(ctx, 'lady', 1, -10, Math.PI / 2, false, 0, time, .74);
      paperScraps(ctx, -17, -44, 33, 21, seed, rgba(P.straw, .18)); fibres(ctx, -18, -48, 36, 39, seed, rgba(P.charcoal, .18), 13); break;
    case 'machine': {
      const continuity = Boolean(o.label?.toLowerCase().includes('mind'));
      shadow(ctx, 3, 4, 25, 7, .22);
      if (continuity && drawPaperAsset(ctx, 'brain-machine', -45, -101, 90, 113)) break;
      if (continuity) {
        panel(ctx, -31, -85, 62, 5, P.slate, seed);
        for (const side of [-1, 1]) {
          const xx = side * 19;
          panel(ctx, xx - 3, -81, 6, 13, P.charcoal, seed + side);
          panel(ctx, xx - 11, -66, 22, 34, P.water, seed + side + 4);
          shape(ctx, [xx - 9, -62, xx - 2, -64, xx - 3, -35, xx - 9, -34], rgba(P.paper, .36), '', 0);
          // Actual paired brain organs, built from interlocking paper lobes.
          for (let n = 0; n < 5; n++) blob(ctx, xx - 5 + n % 3 * 4, -51 + Math.floor(n / 3) * 7, 4, 5, n % 2 ? P.flesh : P.clay, seed + n + side);
          panel(ctx, xx - 12, -68, 24, 4, P.slate, seed + side + 6); panel(ctx, xx - 10, -33, 20, 4, P.slate, seed + side + 7);
          curve(ctx, P.ink, 1.8, xx, -30, xx * 1.7, -10, side * 8, -4);
          curve(ctx, P.rust, 1.1, xx - 3, -29, xx * 1.3, -8, side * 6, -3);
        }
        panel(ctx, -22, -18, 44, 21, P.smoke, seed + 13); panel(ctx, -12, -13, 24, 10, P.umbra, seed + 14);
        panel(ctx, -17, 2, 6, 10, P.slate, seed + 15); panel(ctx, 12, 2, 6, 10, P.slate, seed + 16);
      } else {
        panel(ctx, -23, -38, 46, 43, P.smoke, seed); panel(ctx, -17, -33, 34, 25, P.charcoal, seed + 1);
        if (v === 2) {
          panel(ctx, -14, -30, 28, 20, P.pine, seed + 2, false);
          drawActorSprite(ctx, 'lady', 0, -9, Math.PI / 2, false, 0, time, .46);
          line(ctx, [-12, -18, 12, -18], rgba(P.ash, .14), .8, true);
        } else {
          panel(ctx, -13, -29, 26, 14, P.deepWater, seed + 2, false);
          for (let n = 0; n < 3; n++) panel(ctx, -10 + n * 7, -25, 3, 7, [P.paper, P.clay, P.water][n], seed + n + 3, false);
          for (const xx of [-8, 6]) blob(ctx, xx, -4, 3, 3, P.umbra, seed + xx);
        }
        curve(ctx, P.ink, 1.6, -20, 0, -38, 14, -25, 19); curve(ctx, P.rust, 1.3, 21, -3, 36, 1, 33, 13);
        panel(ctx, -15, 3, 5, 7, P.slate, seed + 10); panel(ctx, 10, 3, 5, 7, P.slate, seed + 11);
      }
      break;
    }
    case 'gate': case 'portal': {
      const portal = o.kind === 'portal', gh = Math.max(h, 110);
      for (const xx of [0, w - 24]) { panel(ctx, xx, 0, 24, gh, P.sage, seed + xx); line(ctx, [xx + 5, 5, xx + 5, gh - 4], P.ash, 3, true); fibres(ctx, xx + 4, 8, 16, gh - 14, seed + xx, rgba(P.umbra, .28), 14); }
      panel(ctx, -6, -16, w + 12, 21, P.fog, seed + 11); paperScraps(ctx, 9, -12, w - 19, 10, seed, rgba(P.charcoal, .35));
      if (portal) {
        shape(ctx, [25, 3, w - 25, 5, w - 32, gh * .76, w * .58, gh * .43, 32, gh], rgba(P.lichen, .22), '', 0);
        for (let n = 0; n < 5; n++) line(ctx, [34 + n * 19, gh, 34 + n * 19 + Math.sin(time + n) * 8, gh * .48, 34 + n * 19, 4], rgba(P.paper, .25), .65, true);
      }
      else { for (let xx = 33; xx < w - 25; xx += 17) curve(ctx, P.moss, 2, xx, 12, xx + 2, gh / 2, xx - 1, gh - 3); line(ctx, [25, gh * .48, w - 25, gh * .48 + 2], P.smoke, 2.8); for (let xx = 37; xx < w - 31; xx += 37) curve(ctx, rgba(P.charcoal, .45), .75, xx, 8, xx + 12, gh / 2, xx + 34, gh - 6); }
      if (o.label) { ctx.font = '12px "Patrick Hand", sans-serif'; ctx.fillStyle = P.slate; ctx.textAlign = 'center'; ctx.fillText(portal ? 'INFINITE TIME' : o.variant === 1 ? 'GREAT CASTLE DIVINE' : 'UNENTERABLE', w / 2, -2); } break;
    }
  }
}
function secondaryScenery(ctx: CanvasRenderingContext2D, o: WorldObject, time: number, reducedMotion: boolean) {
  const seed = o.x * 29 + o.y * 73, phase = noise(3, seed) * 15, gust = reducedMotion ? 0 : wind(o.x, o.y, time);
  if (o.kind === 'building') {
    const w = (o.width || 5) * TILE_SIZE, h = (o.height || 4) * TILE_SIZE, front = h * .38, px = w * .15;
    // Light charcoal scraps lift and drift from the repaired chimney.
    for (let n = 0; n < 5; n++) {
      const age = ((reducedMotion ? 0 : time) * (6.4 + n * .3) + n * 17 + phase) % 91;
      const xx = px + 7 + age * .17 + gust * age * .34 + Math.sin(age * .068 + phase) * 5;
      blob(ctx, xx, front - 55 - age, 4 + age * .15, 3 + age * .10, rgba(P.umbra, .16 * (1 - age / 91)), n + seed);
    }
    const tx = w * .56;
    shape(ctx, [tx, front + 3, w + 6, front + 7, w + 6 + gust * 2, front + 14 + gust * 5,
      w * .73, front + 9 + gust * 4, tx - 3, front + 9], P.deepWater);
    if (!(o.variant || 0)) {
      const xx = -2 + gust * 5;
      shape(ctx, [1, front + 35, 11, front + 36, xx + 11, front + 51, xx + 2, front + 48], P.ash);
      shape(ctx, [2, front + 37, 5, front + 37, xx + 5, front + 47, xx + 3, front + 47], P.paper, '', 0);
    }
  } else if (o.kind === 'lantern') {
    const flicker = reducedMotion ? .5 : .5 + Math.sin(time * 7.3 + phase) * .22 + Math.sin(time * 11.7 + phase * 2) * .12;
    ctx.save(); ctx.globalAlpha *= .6 + flicker * .35; blob(ctx, 4, -28, 2.5, 4.5, P.straw, seed);
    curve(ctx, P.paper, 1.05, 4, -26, 3.5 + gust, -29, 4 + gust * .5, -31 - flicker * 1.2); ctx.restore();
  } else if (o.kind === 'sign' && o.variant === 2) {
    ctx.beginPath(); ctx.moveTo(-18, -80); ctx.lineTo(18, -80); ctx.bezierCurveTo(18 + gust * 2, -60, 14 + gust * 4, -44, 17 + gust * 5, -22);
    ctx.quadraticCurveTo(8 + gust * 3, -25 + gust, 1 + gust * 4, -28); ctx.lineTo(-18 + gust * 4, -23); ctx.bezierCurveTo(-17 + gust * 3, -44, -19 + gust, -64, -18, -80); ctx.closePath();
    ctx.fillStyle = P.clay; ctx.fill(); ctx.strokeStyle = P.bark; ctx.lineWidth = 1; ctx.stroke();
    curve(ctx, rgba(P.sand, .38), 2, -10, -76, -7 + gust * 2, -54, -11 + gust * 4, -27); paperScraps(ctx, -11 + gust, -68, 23, 26, seed, P.sand);
  } else if (o.kind === 'sign' && o.variant === 1 && paperAssetsRevision() > 0) {
    const boardW = 86, boardH = Math.min(115, boardW / paperAssetAspect('billboard')), boardTop = 7 - boardH;
    const cycle = (time + phase) % 8.8, gesture = reducedMotion ? 0 : Math.sin(Math.min(1, cycle / 2.9) * Math.PI);
    // The printed hand is its own hinged scrap; Supine's repeated kiss remains
    // an actual animation inside the unchanged native billboard, rather than a bobbing sign.
    const handX = -43 + boardW * .09, handY = boardTop + boardH * .48;
    const wristX = -43 + boardW * .46, wristY = boardTop + boardH * .57;
    ctx.save(); ctx.translate(wristX, wristY); ctx.rotate(-gesture * .1);
    drawPaperAssetRegion(ctx, 'billboard', .09, .48, .4, .15, handX - wristX, handY - wristY, boardW * .4, boardH * .15); ctx.restore();
    const mouthX = -43 + boardW * .5, mouthY = boardTop + boardH * .51;
    if (gesture > .45) {
      shape(ctx, [mouthX - 1.8, mouthY - .5, mouthX, mouthY - 1.4, mouthX + 1.7, mouthY - .4, mouthX + .4, mouthY + 1.1, mouthX - 1.4, mouthY + .6], P.bruise, '', 0);
      line(ctx, [mouthX - .6, mouthY, mouthX + .8, mouthY + .1], P.ink, .4, true);
    }
    if (!reducedMotion && sceneryDebris && cycle > 2.2 && cycle < 3.9) {
      const age = (cycle - 2.2) / 1.7;
      ctx.save(); ctx.globalAlpha *= Math.sin(age * Math.PI) * .52;
      for (let n = 0; n < 3; n++) { const xx = mouthX - 6 - age * (13 + n * 5), yy = mouthY - age * (6 + n * 3); shape(ctx, [xx - 1, yy, xx + .6, yy - 1.5, xx + 2, yy, xx + .2, yy + 1.4], n % 2 ? P.paper : P.flesh, '', 0); }
      ctx.restore();
    }
  } else if (o.kind === 'sign' && o.variant === 1 && paperAssetsRevision() === 0) {
    ctx.save(); ctx.beginPath(); ctx.rect(-27, -65, 55, 35); ctx.clip(); ctx.fillStyle = P.sage; ctx.fillRect(-27, -65, 55, 35);
    drawActorSprite(ctx, 'lady', 0, -28, Math.PI / 2, false, 0, time, .61, undefined, { reducedMotion, phaseOffset: phase, billboard: true }); ctx.restore();
  } else if (o.kind === 'machine' && o.variant === 2) {
    ctx.save(); ctx.beginPath(); ctx.rect(-13, -28, 26, 22); ctx.clip(); ctx.fillStyle = P.sage; ctx.fillRect(-13, -28, 26, 22);
    drawActorSprite(ctx, 'lady', 0, -7, Math.PI / 2, false, 0, time, .35, undefined, { reducedMotion, phaseOffset: phase, billboard: true });
    curve(ctx, rgba(P.lichen, .20), .8, -12, -18 + Math.sin(time * 2 + phase) * 7, 0, -18 + Math.sin(time * 2 + phase) * 7, 12, -17 + Math.sin(time * 2 + phase) * 7); ctx.restore();
  }
}
function cachedObjectArt(o: WorldObject) {
  return !['tree', 'willow', 'campfire', 'reed', 'flower', 'crop'].includes(o.kind);
}
function objectArtKey(o: WorldObject, resolution: number) {
  return `${o.id}:${o.kind}:${o.variant}:${o.color}:${o.width}:${o.height}:${resolution}:${paperAssetsRevision()}`;
}
function objectArtBounds(o: WorldObject) {
  const architectural = o.kind === 'building' || o.kind === 'gate' || o.kind === 'portal';
  const furniture = o.kind === 'bed' || o.kind === 'table' || o.kind === 'rug' || o.kind === 'bookshelf';
  const left = architectural ? -62 : furniture ? -8 : -48;
  const top = architectural ? -126 : furniture ? -42 : -111;
  const right = architectural ? (o.width || 1) * TILE_SIZE + 58 : furniture ? (o.width || 1) * TILE_SIZE + 8 : 48;
  const bottom = architectural ? (o.height || 1) * TILE_SIZE + 28 : furniture ? Math.max(28, (o.height || 1) * TILE_SIZE + 15) : 27;
  return { left, top, width: right - left, height: bottom - top };
}
function trimObjectCache(incomingBytes = 0) {
  if (objectCacheBytes + incomingBytes <= OBJECT_CACHE_BYTES) return;
  for (const [key, art] of objectCache) {
    if (protectedObjectKeys.has(key)) continue;
    objectCacheBytes -= art.canvas.width * art.canvas.height * 4; objectCache.delete(key);
    if (objectCacheBytes + incomingBytes <= OBJECT_CACHE_BYTES) break;
  }
}
function prepareObjectCache(objects: WorldObject[], deviceDensity: number) {
  const illustrations = new Map<string, WorldObject>();
  for (const object of objects) if (cachedObjectArt(object)) illustrations.set(object.id, object);
  let visibleBytesAtOne = 0;
  for (const object of illustrations.values()) {
    const bounds = objectArtBounds(object); visibleBytesAtOne += bounds.width * bounds.height * 4;
  }
  objectResolution = artDensity(deviceDensity, visibleBytesAtOne, OBJECT_CACHE_BYTES);
  protectedObjectKeys = new Set([...illustrations.values()].map(object => objectArtKey(object, objectResolution)));
  trimObjectCache();
}
function drawIllustration(ctx: CanvasRenderingContext2D, o: WorldObject, time: number, fade = 1, reducedMotion = false) {
  if (o.kind === 'tree' || o.kind === 'willow') { drawTree(ctx, o, time, fade, reducedMotion); return; }
  if (!cachedObjectArt(o)) { drawObject(ctx, o, time, fade); return; }
  const key = objectArtKey(o, objectResolution);
  let art = objectCache.get(key);
  if (!art) {
    const { left, top, width, height } = objectArtBounds(o), resolution = objectResolution;
    const pixelsWide = Math.ceil(width * resolution), pixelsHigh = Math.ceil(height * resolution);
    trimObjectCache(pixelsWide * pixelsHigh * 4);
    const canvas = document.createElement('canvas');
    canvas.width = pixelsWide; canvas.height = pixelsHigh;
    const brush = canvas.getContext('2d')!; brush.scale(resolution, resolution); brush.translate(-left, -top); drawObject(brush, o, 0);
    art = { canvas, left, top, width, height }; objectCache.set(key, art);
    objectCacheBytes += canvas.width * canvas.height * 4;
  } else { objectCache.delete(key); objectCache.set(key, art); }
  ctx.save();
  const gust = reducedMotion ? 0 : wind(o.x, o.y, time);
  if (o.kind === 'bush') ctx.transform(1, 0, gust * .016, 1 + Math.sin(time * .6 + o.x) * .009, 0, 0);
  if (o.kind === 'sign') ctx.rotate(gust * (o.variant === 1 ? .002 : .009));
  // Crop enormous facades before scaling their cached paper sheet. The castle extends far
  // beyond the window; filtering those hidden metres costs more than all the moving trees.
  const matrix = ctx.getTransform();
  if ((art.width > 450 || art.height > 450) && matrix.b === 0 && matrix.c === 0) {
    const left = Math.max(art.left, -matrix.e / matrix.a - 2), top = Math.max(art.top, -matrix.f / matrix.d - 2);
    const right = Math.min(art.left + art.width, (ctx.canvas.width - matrix.e) / matrix.a + 2);
    const bottom = Math.min(art.top + art.height, (ctx.canvas.height - matrix.f) / matrix.d + 2);
    if (right > left && bottom > top) {
      const ratio = art.canvas.width / art.width;
      ctx.drawImage(art.canvas, (left - art.left) * ratio, (top - art.top) * ratio, (right - left) * ratio, (bottom - top) * ratio, left, top, right - left, bottom - top);
    }
  } else ctx.drawImage(art.canvas, art.left, art.top, art.width, art.height);
  secondaryScenery(ctx, o, time, reducedMotion); ctx.restore();
}
function onScreen(o: WorldObject, f: RenderFrame, hw: number, hh: number) { return o.x + (o.width || 1) + 3 > f.camera.x - hw && o.x - 3 < f.camera.x + hw && o.y + (o.height || 1) + 2 > f.camera.y - hh && o.y - 5 < f.camera.y + hh; }
function position(f: RenderFrame, x: number, y: number, width: number, height: number) { return { x: (x - f.camera.x) * TILE_SIZE * f.zoom + width / 2, y: (y - f.camera.y) * TILE_SIZE * f.zoom + height / 2 }; }
function drawImpact(ctx: CanvasRenderingContext2D, impact: VisualImpact, frame: RenderFrame, width: number, height: number) {
  if (impact.age < 0 || impact.age > impact.duration) return;
  const p = position(frame, impact.position.x, impact.position.y, width, height), z = frame.zoom;
  const t = Math.min(1, impact.age / impact.duration), lift = frame.reducedMotion ? 0 : Math.sin(t * Math.PI) * 11;
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(z, z);
  if (impact.kind === 'eat' || impact.kind === 'coupon' || impact.kind === 'craft') {
    const item = impact.itemId || (impact.kind === 'eat' ? 'soup' : impact.kind === 'coupon' ? 'time_coupon' : 'wood');
    ctx.save(); ctx.globalAlpha *= impact.kind === 'coupon' ? Math.max(0, 1 - t * 1.4) : Math.max(0, 1 - t);
    ctx.translate(impact.kind === 'eat' ? 10 - t * 7 : 0, -25 - lift); ctx.rotate(frame.reducedMotion ? 0 : Math.sin(t * Math.PI) * (impact.kind === 'eat' ? -.3 : .12));
    drawItemIcon(ctx, item, 0, 0, 23); ctx.restore();
    if (impact.kind === 'coupon' && !frame.reducedMotion && sceneryDebris) {
      for (let n = 0; n < 6; n++) { const angle = noise(n, impact.seed) * Math.PI * 2, r = 3 + t * 30; ctx.save(); ctx.globalAlpha *= (1 - t) * .7; line(ctx, [Math.cos(angle) * r, -25 + Math.sin(angle) * r - t * 9, Math.cos(angle) * r + 2, -23 + Math.sin(angle) * r - t * 9], P.sand, 1.5, true); ctx.restore(); }
    }
  } else if (impact.kind === 'door') {
    ctx.globalAlpha *= (1 - t) * .30; const radius = frame.reducedMotion ? 12 : 10 + t * 20;
    curve(ctx, P.sand, 1.4, -radius, 2, 0, -radius * .55, radius, 2);
  } else if (impact.kind === 'build') {
    ctx.globalAlpha *= (1 - t) * .40;
    line(ctx, [-14, 4, -14, -11, -1, -20, 14, -10, 14, 4], P.sand, 1.4, true);
    if (sceneryDebris && !frame.reducedMotion) for (let n = 0; n < 5; n++) line(ctx, [-19 + n * 9, 6 - t * 9, -17 + n * 9, 9 - t * 9], P.sage, 1.2, true);
  } else if (sceneryDebris) {
    const contactHeight = impact.kind === 'hit' ? -21 : impact.object && ['tree', 'willow'].includes(impact.object.kind) ? -23 : -9;
    const progress = frame.reducedMotion ? .16 : t;
    const shade = impact.kind === 'stone' ? P.fog : impact.kind === 'hit' ? P.clay : P.clay;
    ctx.globalAlpha *= (1 - t) * .72;
    for (let n = 0; n < 7; n++) {
      const angle = noise(n + 12, impact.seed) * Math.PI * 2, velocity = 9 + noise(n + 9, impact.seed) * 19;
      const xx = Math.cos(angle) * (3 + velocity * progress), yy = contactHeight + Math.sin(angle) * velocity * progress + 26 * progress * progress;
      if (impact.kind === 'stone') shape(ctx, [xx - 2, yy, xx + 1, yy - 3, xx + 3, yy + 1, xx, yy + 2], shade, rgba(P.charcoal, .45), .6);
      else shape(ctx, [xx - 3, yy - 1, xx + 3, yy - 2, xx + 2, yy + 1, xx - 2, yy + 1.5], shade, '', 0);
    }
    if (impact.kind === 'hit') curve(ctx, rgba(P.umbra, .50), 2.5, -6, contactHeight - 4, 0, contactHeight + 2, 7, contactHeight - 6);
  }
  ctx.restore();
}
function paperRing(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, width = .7, rotation = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
  ctx.beginPath();
  for (let ring = 0; ring < 2; ring++) {
    const rrX = Math.max(.2, rx - ring * width), rrY = Math.max(.2, ry - ring * width);
    for (let n = 0; n < 18; n++) {
      const a = n / 18 * Math.PI * 2, rough = 1 + Math.sin(n * 2.9) * .025;
      const xx = Math.cos(a) * rrX * rough, yy = Math.sin(a) * rrY * rough;
      if (!n) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    }
    ctx.closePath();
  }
  ctx.fillStyle = fill; ctx.fill('evenodd'); ctx.restore();
}
function drawWater(ctx: CanvasRenderingContext2D, frame: RenderFrame, width: number, height: number, hw: number, hh: number, time: number) {
  const minX = Math.max(0, Math.floor((frame.camera.x - hw) / 2) * 2), maxX = Math.min(frame.scene.width - 1, Math.ceil(frame.camera.x + hw));
  const minY = Math.max(0, Math.floor((frame.camera.y - hh) / 2) * 2), maxY = Math.min(frame.scene.height - 1, Math.ceil(frame.camera.y + hh));
  const z = frame.zoom;
  ctx.save();
  for (let y = minY; y <= maxY; y += 2) for (let x = minX; x <= maxX; x += 2) {
    const phase = worldHash(x + 31, y + 7) * Math.PI * 2;
    const wx = x + .4 + worldHash(x + 6, y) * 1.3, wy = y + .4 + worldHash(x, y + 9) * 1.2;
    if (!wet(tileAt(frame.scene, Math.floor(wx), Math.floor(wy)))) continue;
    const p = position(frame, wx, wy, width, height);
    const travel = frame.reducedMotion ? 0 : Math.sin(time * .44 + phase) * 7;
    const swell = frame.reducedMotion ? 1 : 1 + Math.sin(time * .81 + phase) * .55;
    ctx.globalAlpha = .12 + swell * .03;
    if (wet(tileAt(frame.scene, Math.floor(wx + .8), Math.floor(wy)))) {
      const xx = p.x + travel * z, yy = p.y;
      shape(ctx, [xx, yy, xx + 15 * z, yy - swell * z, xx + 31 * z, yy + .6 * z,
        xx + 22 * z, yy + 2 * z, xx + 4 * z, yy + 2.7 * z], P.paper, '', 0);
      shape(ctx, [xx + 4 * z, yy + 3 * z, xx + 18 * z, yy + 2.6 * z,
        xx + 25 * z, yy + 4.8 * z, xx + 6 * z, yy + 5.1 * z], P.deepWater, '', 0);
    }
    if (!frame.reducedMotion && worldHash(x + 13, y + 29) > .80) {
      const age = (time * .3 + phase) % 1, radius = (3 + age * 15) * z;
      ctx.globalAlpha = (1 - age) * .13;
      paperRing(ctx, p.x, p.y + 8 * z, radius, radius * .35, P.ash, .6 * z, -.12);
      if (age > .26) paperRing(ctx, p.x, p.y + 8 * z, radius * .62, radius * .21, P.ash, .5 * z, -.12);
    }
  }
  ctx.restore();
}
function roomWalls(ctx: CanvasRenderingContext2D, frame: RenderFrame, width: number, height: number) {
  const z = frame.zoom, scale = TILE_SIZE * z, top = position(frame, 1, 1, width, height), rw = (frame.scene.width - 2) * scale;
  // The rim and exposed fibres extend only a few pixels beyond these sheets.
  // Culling leaves all visible geometry untouched and avoids generating paper
  // for the north wall while the player is elsewhere inside a long trailer.
  const margin = 8 + z * 4;
  const visible = (x: number, y: number, w: number, h: number) => x + w + margin > 0 && x - margin < width && y + h + margin > 0 && y - margin < height;
  if (visible(top.x, top.y - 3 * z, rw, scale * 1.3 + 3 * z)) {
    panel(ctx, top.x, top.y, rw, scale * 1.3, P.umbra, 22);
    // Exposed rafters, taped seams and salvaged wall panels share the outdoor stock.
    for (let n = 0, xx = top.x; xx < top.x + rw - 3; xx += 49 * z, n++) {
      const sheetW = Math.min(51 * z, top.x + rw - xx), offset = noise(n, 22) * 3 * z;
      if (!visible(xx, top.y, sheetW, scale * 1.3)) continue;
      panel(ctx, xx, top.y + offset, sheetW, scale * 1.2 - offset, [P.ash, P.clay, P.paper, P.fog][n % 4], n + 40);
      if (n % 3 === 0) panel(ctx, xx + 6 * z, top.y + 17 * z, Math.min(26 * z, sheetW - 9 * z), 13 * z, P.smoke, n + 43);
      if (n % 4 === 0) panel(ctx, xx + 3 * z, top.y + 2 * z, Math.min(25 * z, sheetW - 5 * z), 4 * z, P.paper, n + 45, false);
    }
    panel(ctx, top.x - 2 * z, top.y - 3 * z, rw + 4 * z, 7 * z, P.bark, 52);
    curve(ctx, P.ink, 1.2 * z, top.x + 3, top.y + scale * .32, top.x + rw / 2, top.y + scale * .57, top.x + rw - 3, top.y + scale * .28);
    for (const ratio of [.18, .7]) {
      const xx = top.x + rw * ratio;
      if (!visible(xx - 5 * z, top.y + 4 * z, 14 * z, 19 * z)) continue;
      panel(ctx, xx, top.y + 4 * z, 4 * z, 12 * z, P.ink, Math.floor(ratio * 71), false);
      shape(ctx, [xx - 2 * z, top.y + 15 * z, xx + 6 * z, top.y + 15 * z, xx + 9 * z, top.y + 22 * z, xx - 5 * z, top.y + 22 * z], P.ochre);
    }
  }
  const bottom = position(frame, 1, frame.scene.height - 1.3, width, height), gap = 2.4 * scale;
  if (visible(bottom.x, bottom.y, rw / 2 - gap / 2, scale * .36)) panel(ctx, bottom.x, bottom.y, rw / 2 - gap / 2, scale * .36, P.slate, 35);
  if (visible(bottom.x + rw / 2 + gap / 2, bottom.y, rw / 2 - gap / 2, scale * .36)) panel(ctx, bottom.x + rw / 2 + gap / 2, bottom.y, rw / 2 - gap / 2, scale * .36, P.slate, 37);
  if (frame.scene.exit) {
    const p = position(frame, frame.scene.exit.positionInRoom.x, frame.scene.exit.positionInRoom.y, width, height);
    if (visible(p.x - 50, p.y + 10 * z - 10, 100, 20)) label(ctx, '↓ Outside', p.x, p.y + 10 * z, P.paper, '12px "Libre Baskerville", serif');
  }
}

export function renderWorld(ctx: CanvasRenderingContext2D, frame: RenderFrame, width: number, height: number) {
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'; ctx.fillStyle = P.slate; ctx.fillRect(0, 0, width, height);
  const { scene, zoom } = frame, scale = TILE_SIZE * zoom, time = frame.reducedMotion ? 0 : frame.time;
  sceneryDebris = frame.particlesEnabled !== false;
  const hw = width / scale / 2 + 2, hh = height / scale / 2 + 2;
  const heldPose = playerToolPose(frame.player.facing, frame.player.moving, frame.player.animation, time, { reducedMotion: frame.reducedMotion, phaseOffset: 0, pace: frame.playerPace || 1, action: frame.player.attacking, hurt: frame.player.hurt });
  const cx1 = Math.max(0, Math.floor((frame.camera.x - hw) / CHUNK)), cx2 = Math.min(Math.floor((scene.width - 1) / CHUNK), Math.floor((frame.camera.x + hw) / CHUNK));
  const cy1 = Math.max(0, Math.floor((frame.camera.y - hh) / CHUNK)), cy2 = Math.min(Math.floor((scene.height - 1) / CHUNK), Math.floor((frame.camera.y + hh) / CHUNK));
  const visibleChunks = Math.max(0, cx2 - cx1 + 1) * Math.max(0, cy2 - cy1 + 1);
  const deviceDensity = zoom * ctx.getTransform().a, groundSize = CHUNK * TILE_SIZE + GROUND_BLEED * 2;
  const resolution = artDensity(deviceDensity, visibleChunks * groundSize * groundSize * 4, GROUND_CACHE_BYTES);
  const protectedGround = new Set<string>();
  for (let cy = cy1; cy <= cy2; cy++) for (let cx = cx1; cx <= cx2; cx++) protectedGround.add(groundKey(scene, cx, cy, resolution));
  trimGroundCache(protectedGround);
  for (let cy = cy1; cy <= cy2; cy++) for (let cx = cx1; cx <= cx2; cx++) {
    const p = position(frame, cx * CHUNK, cy * CHUNK, width, height), c = groundChunk(scene, cx, cy, resolution, protectedGround);
    const ratio = c.width / (CHUNK * TILE_SIZE + GROUND_BLEED * 2), bleed = GROUND_BLEED * ratio;
    ctx.drawImage(c, bleed, bleed, CHUNK * TILE_SIZE * ratio, CHUNK * TILE_SIZE * ratio, p.x, p.y, CHUNK * scale, CHUNK * scale);
  }
  drawWater(ctx, frame, width, height, hw, hh, time);
  if (!scene.outdoors) roomWalls(ctx, frame, width, height);
  const visible = frame.objects.filter(o => !frame.harvested[o.id] && onScreen(o, frame, hw, hh));
  type Entry = { depth: number; object?: WorldObject; actor?: ActorFrame; player?: true; impact?: VisualImpact };
  const entries: Entry[] = visible.filter(o => o.kind !== 'rug').map(o => ({ depth: o.y + ((o.width || 1) >= 2 || (o.height || 1) >= 2 ? (o.height || 1) : 0), object: o }));
  for (const impact of frame.impacts || []) if (impact.destroyed && impact.object && impact.age < .58 && onScreen(impact.object, frame, hw, hh) && !visible.some(o => o.id === impact.object!.id)) {
    const o = impact.object; entries.push({ depth: o.y + ((o.width || 1) >= 2 || (o.height || 1) >= 2 ? (o.height || 1) : 0), object: o, impact });
  }
  for (const a of frame.actors) if (Math.abs(a.x - frame.camera.x) < hw + 2 && Math.abs(a.y - frame.camera.y) < hh + 2 && a.health > 0) entries.push({ depth: a.y, actor: a });
  entries.push({ depth: frame.player.y, player: true }); entries.sort((a, b) => a.depth - b.depth);
  prepareObjectCache([...visible, ...entries.filter(entry => entry.impact && entry.object).map(entry => entry.object!)], deviceDensity);
  for (const o of visible.filter(o => o.kind === 'rug')) { const p = position(frame, o.x, o.y, width, height); ctx.save(); ctx.translate(p.x, p.y); ctx.scale(zoom, zoom); drawIllustration(ctx, o, time, 1, frame.reducedMotion); ctx.restore(); }
  for (const e of entries) {
    if (e.object) {
      const o = e.object, p = position(frame, o.x, o.y, width, height); ctx.save(); ctx.translate(p.x, p.y); ctx.scale(zoom, zoom);
      const hit = e.impact || (frame.impacts || []).find(event => event.targetId === o.id && event.age >= 0 && event.age < .35 && ['wood', 'stone', 'gather'].includes(event.kind));
      if (e.impact) {
        const fall = Math.min(1, Math.max(0, e.impact.age) / .58);
        ctx.globalAlpha *= frame.reducedMotion ? 1 - fall : 1 - Math.max(0, (fall - .28) / .72);
        if (!frame.reducedMotion) {
          if (o.kind === 'tree' || o.kind === 'willow') ctx.rotate(Math.sin((e.impact.direction || 1) + .4) * fall * fall * .82);
          else { ctx.translate(0, fall * 6); ctx.scale(1 - fall * .26, 1 - fall * .46); }
        }
      } else if (hit && !frame.reducedMotion) {
        const recoil = Math.sin(hit.age * 37) * Math.exp(-hit.age * 12); ctx.rotate(recoil * .035); ctx.translate(recoil * 2, 0);
      }
      const near = (o.kind === 'tree' || o.kind === 'willow') && Math.hypot(o.x - frame.player.x, o.y - frame.player.y) < 1.7 && frame.player.y < o.y + .4;
      drawIllustration(ctx, o, time, near ? .42 : 1, frame.reducedMotion); ctx.restore();
    }
    else if (e.actor) {
      const a = e.actor, p = position(frame, a.x, a.y, width, height), dist = Math.hypot(a.x - frame.player.x, a.y - frame.player.y);
      shadow(ctx, p.x + 3 * zoom, p.y + 2 * zoom, (a.kind === 'bat' ? 13 : 11) * zoom, 4 * zoom, a.kind === 'bat' ? .12 : .2);
      ctx.save(); if (a.hurt > 0) ctx.globalAlpha = frame.reducedMotion ? .83 : .68 + Math.max(0, .35 - a.hurt) * .5;
      drawActorSprite(ctx, a.kind, p.x, p.y + (a.kind === 'bat' ? Math.sin(time * 3 + a.x) * 3 * zoom : 0), a.facing, a.moving, a.animation, time, zoom, a.color, { reducedMotion: frame.reducedMotion, phaseOffset: actorPhase(a.id), pace: a.hostile ? 1.3 : .88, action: a.attackTime || 0, hurt: a.hurt, asleep: (a.kind === 'lady' && frame.flags.includes('supine_asleep') && !frame.flags.includes('mind_changed')) || Boolean(frame.sequence && (Math.hypot(a.x - frame.sequence.from.x, a.y - frame.sequence.from.y) < .2 || Math.hypot(a.x - frame.sequence.to.x, a.y - frame.sequence.to.y) < .2)), mindChanged: (a.kind === 'lady' || a.id === 'supine-in-ada') && frame.flags.includes('mind_changed') && (!frame.sequence || frame.sequence.elapsed / frame.sequence.duration > .86), brainAbsent: a.kind === 'lady' && frame.flags.includes('ada_restored') }); ctx.restore();
      if (a.kind === 'bat' && !frame.reducedMotion && dist < 6) {
        if ((a.attackTime || 0) > 0) {
          ctx.save(); ctx.globalAlpha = Math.min(.27, (a.attackTime || 0)); ctx.translate(p.x, p.y - 24 * zoom); ctx.rotate(a.facing);
          curve(ctx, P.bruise, zoom, -22 * zoom, -9 * zoom, -12 * zoom, -7 * zoom, -3 * zoom, -12 * zoom);
          curve(ctx, P.bruise, zoom * .7, -26 * zoom, 8 * zoom, -13 * zoom, 7 * zoom, -6 * zoom, 12 * zoom); ctx.restore();
        } else if (!a.moving && !a.hostile) {
          ctx.save(); ctx.globalAlpha = .06 + Math.max(0, Math.sin(time * 1.9 + actorPhase(a.id))) * .10; ctx.strokeStyle = P.clay; ctx.lineWidth = .7 * zoom;
          for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(p.x + side * 8 * zoom, p.y - 37 * zoom, 7 * zoom, side < 0 ? 2.1 : -1.05, side < 0 ? 4.1 : 1.05); ctx.stroke(); } ctx.restore();
        }
      }
      if (!a.hostile && dist < 5.4) { label(ctx, a.name, p.x, p.y - (a.kind === 'lady' ? 70 : a.kind === 'ox' ? 53 : 46) * zoom, a.id === frame.nearby?.id ? P.paper : P.paper, `${Math.max(10, 10 * zoom)}px "Patrick Hand", "DM Sans", sans-serif`); if (frame.flags.includes(`${a.id}_friend`)) { ctx.save(); ctx.fillStyle = P.lichen; ctx.beginPath(); ctx.arc(p.x + 15 * zoom, p.y - 36 * zoom, 2 * zoom, 0, Math.PI * 2); ctx.fill(); ctx.restore(); } }
      else if (a.hostile && dist < 5) { line(ctx, [p.x - 13 * zoom, p.y - 40 * zoom, p.x + 13 * zoom, p.y - 40 * zoom], P.umbra, 4 * zoom, true); line(ctx, [p.x - 13 * zoom, p.y - 40 * zoom, p.x - 13 * zoom + Math.min(1, a.health / 42) * 26 * zoom, p.y - 40 * zoom], P.clay, 2.5 * zoom, true); }
    } else {
      const a = frame.player, p = position(frame, a.x, a.y, width, height); shadow(ctx, p.x + 4 * zoom, p.y + 2 * zoom, 11 * zoom, 4 * zoom, .21); ctx.save(); if (a.hurt > 0) ctx.globalAlpha = frame.reducedMotion ? .83 : .68 + Math.max(0, .35 - a.hurt) * .5; drawActorSprite(ctx, 'human', p.x, p.y, a.facing, a.moving, a.animation, time, zoom, undefined, { reducedMotion: frame.reducedMotion, phaseOffset: 0, pace: frame.playerPace || 1, action: a.attacking, hurt: a.hurt }); ctx.restore();
      if (a.attacking > 0 || ['walking_cane', 'willow_axe', 'stone_pick', 'fishing_rod'].includes(frame.selected)) {
        const phase = a.attacking > 0 ? 1 - Math.min(1, a.attacking / .26) : 1, anticipation = .07 / .26, contact = .16 / .26;
        const wrist = a.attacking > 0 ? phase < anticipation ? -.15 * phase / anticipation : phase < contact ? -.15 + .5 * ((phase - anticipation) / (contact - anticipation)) : .35 * (1 - (phase - contact) / (1 - contact)) : 0;
        const grip = frame.selected.includes('cane') ? { x: 14, y: 25 } : frame.selected.includes('rod') ? { x: 11, y: 23 } : { x: 13, y: 21 };
        const itemSize = 28 * zoom, hx = p.x + heldPose.x * zoom, hy = p.y + heldPose.y * zoom;
        ctx.save(); ctx.translate(hx, hy); ctx.rotate(heldPose.angle - Math.PI / 2 + wrist); drawItemIcon(ctx, frame.selected, -grip.x / 32 * itemSize, -grip.y / 32 * itemSize, itemSize); ctx.restore();
        if (!frame.reducedMotion && a.attacking > 0 && phase >= anticipation && phase < contact) {
          const sweep = heldPose.angle - Math.PI / 2 + wrist;
          ctx.save(); ctx.translate(hx, hy); ctx.rotate(sweep); curve(ctx, rgba(P.sand, .38), 1.5 * zoom, -14 * zoom, -13 * zoom, -6 * zoom, -23 * zoom, 8 * zoom, -15 * zoom); ctx.restore();
        }
      }
    }
  }
  for (const impact of frame.impacts || []) drawImpact(ctx, impact, frame, width, height);
  drawMindExchange(ctx, frame, width, height);
  const pp = position(frame, frame.player.x, frame.player.y, width, height);
  ctx.strokeStyle = rgba(P.ash, .33); ctx.lineWidth = zoom; ctx.beginPath(); ctx.ellipse(pp.x, pp.y + 4 * zoom, 12 * zoom, 4.5 * zoom, -.1, 0, Math.PI * 2); ctx.stroke();
  if (frame.fishing) {
    const fishing = frame.fishing, bob = position(frame, fishing.position.x, fishing.position.y, width, height), bite = fishing.phase === 'bite';
    const toss = frame.reducedMotion ? 0 : Math.sin(time * (bite ? 9 : 2.4)) * (bite ? 2.5 : .9), dip = frame.reducedMotion ? 0 : bite ? Math.abs(Math.sin(time * 8)) * 4 : Math.sin(time * 2) * .7;
    let floatX = bob.x + toss * zoom, floatY = bob.y + dip * zoom;
    if (fishing.phase === 'caught') {
      const travel = Math.min(1, fishing.elapsed / .64);
      floatX = frame.reducedMotion ? pp.x + 8 * zoom : bob.x + (pp.x + 8 * zoom - bob.x) * travel;
      floatY = frame.reducedMotion ? pp.y - 23 * zoom : bob.y + (pp.y - 22 * zoom - bob.y) * travel - Math.sin(travel * Math.PI) * 37 * zoom;
      ctx.save(); ctx.translate(floatX, floatY); ctx.rotate(frame.reducedMotion ? 0 : Math.atan2(pp.y - 22 * zoom - bob.y, pp.x - bob.x) + Math.sin(travel * 18) * .19); ctx.scale(zoom, zoom);
      blob(ctx, 0, 0, 8, 3.3, P.fog, 71, true); shape(ctx, [7, 0, 12, -4, 11, 4], P.sage, P.pine, .7); curve(ctx, P.paper, 1, -5, -1, 0, -2, 5, -1); ctx.fillStyle = P.pine; ctx.beginPath(); ctx.arc(-5, -.5, .8, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    } else {
      ctx.save(); ctx.globalAlpha = bite ? .22 : .12; ctx.strokeStyle = P.paper; ctx.lineWidth = .8 * zoom;
      for (let n = 0; n < 2; n++) { const age = frame.reducedMotion ? .45 + n * .2 : ((fishing.elapsed * (bite ? 1.25 : .44)) + n * .5) % 1, r = (3 + age * (bite ? 17 : 10)) * zoom; ctx.beginPath(); ctx.ellipse(bob.x, bob.y + 3 * zoom, r, r * .33, -.1, 0, Math.PI * 2); ctx.stroke(); } ctx.restore();
      ctx.save(); ctx.translate(floatX, floatY - 3 * zoom); ctx.rotate(frame.reducedMotion ? 0 : toss * .15); blob(ctx, 0, 0, 2 * zoom, 4 * zoom, bite ? P.straw : P.clay, 21, true); ctx.restore();
    }
    const sag = bite || fishing.phase === 'caught' ? 10 : 19 + (frame.reducedMotion ? 0 : Math.sin(time * 1.3) * 3);
    curve(ctx, P.ash, .9, pp.x + heldPose.x * zoom, pp.y + (heldPose.y - 16) * zoom, (pp.x + floatX) / 2, Math.min(pp.y, floatY) - sag * zoom, floatX, floatY);
    if (bite) label(ctx, 'Reel', bob.x, bob.y - 25 * zoom, P.paper, 'bold 15px "Patrick Hand", sans-serif');
  }
  if (frame.buildPreview) { const b = frame.buildPreview, p = position(frame, b.position.x, b.position.y, width, height); ctx.save(); ctx.translate(p.x, p.y); ctx.scale(zoom, zoom); ctx.globalAlpha = .59; drawObject(ctx, { id: 'preview', kind: b.kind, ...b.position, solid: false }, time); ctx.restore(); ctx.strokeStyle = b.valid ? P.lichen : P.rust; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(p.x, p.y, 17 * zoom, 9 * zoom, -.1, 0, Math.PI * 2); ctx.stroke(); }
  for (const particle of frame.particles) { const p = position(frame, particle.x, particle.y, width, height); if (Math.abs(particle.x - frame.camera.x) > hw || Math.abs(particle.y - frame.camera.y) > hh) continue; ctx.save(); ctx.globalAlpha = Math.min(.75, particle.life / Math.max(.01, particle.maxLife)); if (particle.kind === 'smoke' || particle.kind === 'dust') blob(ctx, p.x, p.y, particle.size * zoom, particle.size * zoom * .7, particle.color, particle.maxLife * 18); else { const r = Math.max(1, particle.size * zoom); shape(ctx, [p.x - r, p.y, p.x + r * .4, p.y - r * .5, p.x + r, p.y + r * .4, p.x - r * .5, p.y + r * .6], particle.color, '', 0); } ctx.restore(); }
  // Pale scraps of low cloud and thin falling rain belong to the same layered paper world.
  if (scene.outdoors) {
    ctx.save();
    for (let n = 0; n < 3; n++) {
      const drift = (time * 6 + n * width / 2) % (width + 620) - 310, yy = height * (.21 + n * .27);
      shape(ctx, [drift - 180, yy + 14, drift + 75, yy - 12, drift + 310, yy + 3, drift + 138, yy + 23, drift - 94, yy + 32], rgba(P.paper, .035), '', 0);
      curve(ctx, rgba(P.paper, .045), 1.1, drift - 205, yy + 38, drift + 37, yy + 3, drift + 304, yy + 25);
    }
    if (!frame.reducedMotion) for (let n = 0; n < 23; n++) {
      const xx = (noise(n, 87) * width + time * 7) % width, yy = (noise(n, 13) * height + time * (47 + n % 4 * 7)) % height;
      line(ctx, [xx, yy, xx - 2.4, yy + 7], rgba(P.paper, .14), .55, true);
    }
    ctx.restore();
  }
  const night = scene.outdoors ? .035 + Math.max(0, Math.cos((frame.dayTime + .08) * Math.PI * 2)) * .25 : .09;
  ctx.fillStyle = rgba(P.ink, night); ctx.fillRect(0, 0, width, height);
  for (const o of visible) if (['campfire', 'lantern', 'machine'].includes(o.kind)) {
    const p = position(frame, o.x, o.y - .3, width, height), r = (o.kind === 'campfire' ? 54 : 29) * zoom;
    const flicker = frame.reducedMotion ? .075 : .064 + (Math.sin(time * (o.kind === 'campfire' ? 5.7 : 6.3) + o.x) + 1) * .011;
    shape(ctx, [p.x - r, p.y + r * .29, p.x - r * .31, p.y - r * .44, p.x + r * .7, p.y - r * .33, p.x + r, p.y + r * .52, p.x - r * .31, p.y + r * .68], rgba(P.ochre, flicker), '', 0);
  }
  if (frame.waypoint) { const p = position(frame, frame.waypoint.x, frame.waypoint.y, width, height); ctx.strokeStyle = P.sand; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(p.x, p.y, 12 * zoom, 5 * zoom, 0, 0, Math.PI * 2); ctx.stroke(); const lift = Math.sin(time * 1.3) * 2; line(ctx, [p.x, p.y - (17 + lift) * zoom, p.x - 4 * zoom, p.y - (24 + lift) * zoom, p.x + 4 * zoom, p.y - (24 + lift) * zoom, p.x, p.y - (17 + lift) * zoom], P.straw, 1.4);
    if (p.x < 35 || p.x > width - 35 || p.y < 110 || p.y > height - 100) { const angle = Math.atan2(p.y - height / 2, p.x - width / 2), factor = Math.min((width / 2 - 44) / Math.max(.01, Math.abs(p.x - width / 2)), (height / 2 - 115) / Math.max(.01, Math.abs(p.y - height / 2))); const x = width / 2 + (p.x - width / 2) * Math.max(.05, factor), y = height / 2 + (p.y - height / 2) * Math.max(.05, factor); ctx.save(); ctx.translate(x, y); ctx.rotate(angle); line(ctx, [-4, -5, 6, 0, -4, 5], P.sand, 2); ctx.restore(); }
  }
  if (frame.nearby) { const p = position(frame, frame.nearby.position.x, frame.nearby.position.y, width, height); ctx.strokeStyle = rgba(P.straw, .7); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.ellipse(p.x, p.y + 4 * zoom, 12 * zoom, 5 * zoom, -.12, 0, Math.PI * 2); ctx.stroke(); }
  for (const f of frame.floating) { const p = position(frame, f.x, f.y, width, height); ctx.save(); ctx.globalAlpha = Math.min(1, f.life * 2); label(ctx, f.text, p.x, p.y - 36 * zoom, f.color, `${Math.max(13, 13 * zoom)}px "Patrick Hand", "DM Sans", sans-serif`); ctx.restore(); }
  // Dark torn corner scraps frame the sheet without gradients or a simulated lens.
  shape(ctx, [0, 0, width * .22, 0, width * .09, height * .11, 0, height * .24], rgba(P.ink, .10), '', 0);
  shape(ctx, [width, height * .69, width, height, width * .66, height, width * .89, height * .93], rgba(P.ink, .09), '', 0);
  // Grain is already baked into terrain, cutouts, and cached paper surfaces.
  // A plain paper tint keeps the same atmosphere without resampling grain across the viewport.
  ctx.save(); ctx.globalAlpha = .026; ctx.fillStyle = PAPER; ctx.fillRect(0, 0, width, height); ctx.restore(); ctx.restore();
}
