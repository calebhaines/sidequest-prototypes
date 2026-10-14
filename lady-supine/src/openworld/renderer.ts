import { TILE_SIZE, type ActorFrame, type RenderFrame, type TileKind, type VisualImpact, type WorldObject, type WorldScene } from './types';
import { drawActorSprite, drawItemIcon, playerToolPose } from './sprites';
import { worldHash } from './world';
import { drawMindExchange } from './mindExchange';
import { PALETTE24 as P, rgba } from './palette';
import { paperShape, paperTexture, paperPath } from './paper';
import { drawPaperAsset, drawPaperAssetRegion, paperAssetAspect, paperAssetsRevision } from './paperAssets';

// The simulation grid is hidden beneath smooth scissor-cut photographs on olive stock.
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
  grass: P.sage, darkGrass: P.moss, dirt: P.bark, path: P.ash,
  water: P.water, deepWater: P.deepWater, sand: P.ash, stone: P.slate,
  woodFloor: P.umbra, stoneFloor: P.fog, void: P.charcoal, tilled: P.bark,
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
// Native photographs provide texture; smooth cream cuts and shallow contact shadows
// keep the source-30 specimen collage legible without painted outlines or paper tears.
function line(ctx: CanvasRenderingContext2D, points: number[], color = INK, width = 1.3, _faint = false) {
  if (points.length < 4) return;
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(points[0], points[1]);
  for (let n = 2; n < points.length; n += 2) ctx.lineTo(points[n], points[n + 1]);
  ctx.stroke(); ctx.restore();
}
function curve(ctx: CanvasRenderingContext2D, color: string, width: number, x: number, y: number, cx: number, cy: number, ex: number, ey: number) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke(); ctx.restore();
}
function shape(ctx: CanvasRenderingContext2D, points: number[], fill: string, edge = INK, _width = 1.4) {
  const seed = surfaceSeed + (fill.charCodeAt(2) || 0) * 7;
  const xs = points.filter((_, n) => n % 2 === 0), ys = points.filter((_, n) => n % 2 === 1);
  const bounds: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  if (bounds[2] * bounds[3] > 100 && edge && !fill.startsWith('rgba')) {
    if (movingSheet) {
      const path = new Path2D(); path.moveTo(points[0], points[1]); for (let n = 2; n < points.length; n += 2) path.lineTo(points[n], points[n + 1]); path.closePath();
      paperPath(ctx, path, fill, bounds, seed, .6);
    } else paperShape(ctx, points, fill, seed, .6);
    return;
  }
  ctx.beginPath(); ctx.moveTo(points[0], points[1]); for (let n = 2; n < points.length; n += 2) ctx.lineTo(points[n], points[n + 1]);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, seed = 1, edge = true) {
  if (!(w > 0 && h > 0)) return;
  const path = new Path2D(); path.roundRect(x, y, w, h, Math.min(9, w * .15, h * .18));
  paperPath(ctx, path, fill, [x, y, w, h], seed, edge ? .75 : 0);
}
function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, seed: number, edge = false) {
  if (!(rx > 0 && ry > 0)) return;
  const path = new Path2D(); path.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (edge && !color.startsWith('rgba')) paperPath(ctx, path, color, [x - rx, y - ry, rx * 2, ry * 2], seed, .7);
  else { ctx.fillStyle = color; ctx.fill(path); }
}
function paperScraps(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, color = rgba(P.ink, .32)) {
  // Physical typed label strips on salvaged furniture, kept sparse and rounded.
  for (let n = 0; n < 3; n++) {
    const xx = x + noise(n + 7, seed) * w * .58, yy = y + noise(n + 2, seed) * h * .68;
    panel(ctx, xx, yy, w * .27, Math.max(1.2, h * .1), color, seed + n, false);
  }
}
function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, alpha = .2) {
  ctx.save(); ctx.globalAlpha *= alpha; blob(ctx, x, y, rx, ry, P.ink, 1); ctx.restore();
}
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string = P.chalk, font = '12px "DM Sans", sans-serif') {
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3.2;
  ctx.strokeStyle = rgba(P.ink, .79); ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
}
function mountStock(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, kind: TileKind = 'grass') {
  // Idea 30 mounts individual camera-real specimens on quiet olive stock. Salvage
  // textures belong to those specimens, never to the whole floor or building plot.
  ctx.save(); ctx.fillStyle = P.sage; ctx.fillRect(x, y, width, height);
  ctx.globalAlpha *= .22; ctx.fillStyle = P.umbra; ctx.fillRect(x, y, width, height); ctx.restore();
  const tint: Partial<Record<TileKind, [string, number]>> = {
    darkGrass: [P.pine, .12], dirt: [P.sand, .18], path: [P.paper, .27],
    sand: [P.sand, .36], stone: [P.paper, .11], woodFloor: [P.paper, .1],
    stoneFloor: [P.paper, .13], void: [P.ink, .14], tilled: [P.umbra, .24],
  };
  const overlay = tint[kind];
  if (overlay) { ctx.save(); ctx.globalAlpha *= overlay[1]; ctx.fillStyle = overlay[0]; ctx.fillRect(x, y, width, height); ctx.restore(); }
}
function groundStock(ctx: CanvasRenderingContext2D, kind: TileKind, bounds: [number, number, number, number], seed: number, outdoors = false) {
  if (outdoors && kind === 'void') { ctx.save(); ctx.fillStyle = P.ink; ctx.fillRect(...bounds); ctx.restore(); }
  else if (wet(kind)) paperTexture(ctx, ...bounds, colors[kind], seed);
  else mountStock(ctx, ...bounds, kind);
}
function mountedGround(ctx: CanvasRenderingContext2D, path: Path2D, kind: TileKind, bounds: [number, number, number, number], seed: number, outdoors: boolean) {
  ctx.save(); ctx.clip(path); groundStock(ctx, kind, bounds, seed, outdoors); ctx.restore();
  // The coast has a visible photograph rim; a path has a fine clean cut. There
  // are no printed cell borders inside either continuous contour.
  const rim = wet(kind) ? .92 : kind === 'path' || kind === 'sand' ? .42 : outdoors ? .16 : .34;
  ctx.save(); ctx.strokeStyle = P.chalk; ctx.globalAlpha *= rim;
  ctx.lineJoin = 'round'; ctx.lineWidth = wet(kind) ? 1.45 : .65; ctx.stroke(path); ctx.restore();
}
function paintGround(ctx: CanvasRenderingContext2D, scene: WorldScene, tx: number, ty: number, px: number, py: number) {
  const kind = tileAt(scene, tx, ty);
  if (kind !== 'tilled' || (tx + ty) % 3 !== 0) return;
  // Sparse real soil strips identify worked earth; open mounting stock stays calm.
  ctx.save(); ctx.globalAlpha *= .26;
  panel(ctx, px + 3, py + 9, 24, 3, P.umbra, tx * 31 + ty * 79, false); ctx.restore();
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
      const tolerance = wet(kind) || kind === 'sand' ? 24 : kind === 'darkGrass' ? 20 : kind === 'dirt' ? 17 : kind === 'path' || kind === 'stone' ? 12 : 4;
      const reduced = simplifyContour(corners, tolerance);
      if (reduced.length < 3) continue;
      const loop = new Path2D(), outline: number[] = [];
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      const point = (x: number, y: number, first = false) => {
        outline.push(x, y);
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
        if (first) loop.moveTo(x, y); else loop.lineTo(x, y);
      };
      // Coastlines are smooth scissor cuts. Rounded corners replace the old
      // jagged fibres, while all contour loops keep their original winding/holes.
      for (let n = 0; n < reduced.length; n++) {
        const previous = reduced[(n + reduced.length - 1) % reduced.length], p = reduced[n], next = reduced[(n + 1) % reduced.length];
        const before = Math.hypot(previous.x - p.x, previous.y - p.y), after = Math.hypot(next.x - p.x, next.y - p.y);
        const radius = Math.min(wet(kind) || kind === 'sand' ? 17 : kind === 'path' ? 12 : 15, before * .3, after * .3);
        const ax = p.x + (previous.x - p.x) * radius / Math.max(1, before), ay = p.y + (previous.y - p.y) * radius / Math.max(1, before);
        const bx = p.x + (next.x - p.x) * radius / Math.max(1, after), by = p.y + (next.y - p.y) * radius / Math.max(1, after);
        point(ax, ay, n === 0);
        for (let step = 1; step <= 6; step++) {
          const t = step / 6, inverse = 1 - t;
          point(inverse * inverse * ax + 2 * inverse * t * p.x + t * t * bx, inverse * inverse * ay + 2 * inverse * t * p.y + t * t * by);
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
  // This exceeds the bleed, maximum curved-cut displacement, cream rim and offset
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
  // Oversample the photographic cut edge just enough for the actual display, then keep a
  // little memory for neighbouring tiles as the camera crosses a chunk seam.
  const desired = Math.min(2, Math.max(.5, Math.ceil(deviceDensity * 2) / 2));
  const maximum = Math.sqrt(budget * .88 / Math.max(1, visibleBytesAtOne));
  return ART_DENSITIES.filter(density => density <= desired && density <= maximum).at(-1) || .5;
}
function paintInteriorRoof(ctx: CanvasRenderingContext2D, scene: WorldScene, _cx: number, cy: number, size: number) {
  if (scene.outdoors) return;
  const left = TILE_SIZE, right = (scene.width - 1) * TILE_SIZE, roomW = right - left;
  const top = cy * size - GROUND_BLEED, bottom = (cy + 1) * size + GROUND_BLEED;
  // Thin boundaries and one sagging wire keep the room readable without replacing
  // the olive backing with repeated boards, tin sheets or theatrical floor fabric.
  for (const xx of [left, right]) line(ctx, [xx, top, xx, bottom], rgba(P.paper, .38), .8);
  for (let n = 0, ty = 7.8; ty < scene.height - 2; ty += 12.5, n++) {
    const yy = ty * TILE_SIZE;
    if (yy + 30 < top || yy - 3 > bottom) continue;
    curve(ctx, rgba(P.ink, .32), .55, left + 6, yy, left + roomW * .5, yy + 22, right - 6, yy + 1);
    for (const ratio of [.27, .73]) {
      const x = left + roomW * ratio;
      line(ctx, [x, yy + 7, x, yy + 17], rgba(P.ink, .38), .6);
      ctx.save(); ctx.globalAlpha *= .6; drawPaperAsset(ctx, 'item-lantern', x - 4, yy + 13, 8, 14); ctx.restore();
    }
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
  mountStock(ctx, -bleed, -bleed, size + bleed * 2, size + bleed * 2, scene.outdoors ? 'grass' : 'void');
  ctx.save(); ctx.translate(-cx * size, -cy * size);
  for (const [kind, path] of localGroundContours(scene, cx, cy, size)) {
    // Nonfunctional soil/grass zoning is simulation data, not a visible grid of
    // giant specimen cards. Paths, water, the jetty and the pit retain their cuts.
    if (scene.outdoors && ['darkGrass', 'dirt', 'stone'].includes(kind)) continue;
    const originX = cx * size - bleed, originY = cy * size - bleed;
    const coverage = groundCoverage(ctx, scene, kind, path, cx, cy, size);
    if (coverage === 'outside') continue;
    if (coverage === 'inside') {
      // Authored ground stocks are opaque: their full-sheet texture completely
      // covers the old pre-fill overlap shadow, and no distant edge is visible.
      groundStock(ctx, kind, [originX, originY, size + bleed * 2, size + bleed * 2], cx * 17 + cy * 29, scene.outdoors);
    } else mountedGround(ctx, path, kind, [originX, originY, size + bleed * 2, size + bleed * 2], cx * 17 + cy * 29, scene.outdoors);
  }
  ctx.restore();
  for (let y = -2; y <= CHUNK; y++) for (let x = -4; x <= CHUNK; x++) paintGround(ctx, scene, cx * CHUNK + x, cy * CHUNK + y, x * TILE_SIZE, y * TILE_SIZE);
  if (!scene.outdoors) { ctx.save(); ctx.translate(-cx * size, -cy * size); paintInteriorRoof(ctx, scene, cx, cy, size); ctx.restore(); }
  groundCache.set(key, c);
  groundCacheBytes += c.width * c.height * 4;
  return c;
}
function fire(ctx: CanvasRenderingContext2D, time: number) {
  drawPaperAsset(ctx, 'item-campfire', -24, -43, 48, 51);
  // Only the photographed flame cutout flickers; its salvaged brazier stays planted.
  const pulse = .97 + Math.sin(time * 5.3) * .05 + Math.sin(time * 8.7) * .018;
  ctx.save(); ctx.translate(0, -13); ctx.rotate(Math.sin(time * 3.1) * .025);
  drawPaperAssetRegion(ctx, 'item-campfire', .16, .04, .68, .49, -16, -24 * pulse, 32, 24 * pulse); ctx.restore();
  if (sceneryDebris) for (let n = 0; n < 4; n++) {
    const age = (time * (10 + n * .7) + n * 13) % 59, xx = -6 + n * 4 + Math.sin(time * .7 + n) * age * .16, yy = -17 - age;
    ctx.save(); ctx.globalAlpha *= .4 * (1 - age / 59); blob(ctx, xx, yy, .6, 1.3, P.ochre, n); ctx.restore();
  }
  for (let n = 0; n < 3; n++) { const age = (time * 8 + n * 19) % 62; blob(ctx, Math.sin(time * .64 + n) * age * .18 + age * .12, -28 - age, 5 + age * .15, 3 + age * .1, rgba(P.charcoal, .09 * (1 - age / 62)), n + 12); }
}
type CanopyShard = { canvas: HTMLCanvasElement; x: number; y: number; width: number; height: number };
const canopyCache = new Map<string, CanopyShard>();
let canopyCacheBytes = 0;
function nativeTreeStrip(ctx: CanvasRenderingContext2D, id: string, sx: number, sy: number, sw: number, sh: number, x: number, y: number, width: number, height: number, disc = false) {
  const key = `photo:${id}:${sx}:${sy}:${sw}:${sh}:${width}:${height}:${disc}:${paperAssetsRevision()}`;
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
    if (disc) {
      brush.beginPath(); brush.ellipse(bleed + width / 2, bleed + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2); brush.clip();
    }
    drawPaperAssetRegion(brush, id, sx, sy, sw, sh, bleed, bleed, width, height);
    if (disc) { brush.strokeStyle = P.chalk; brush.lineWidth = .7; brush.stroke(); }
    shard = { canvas, x: -bleed, y: -bleed, width: pixelsWide / resolution, height: pixelsHigh / resolution };
    canopyCache.set(key, shard); canopyCacheBytes += canvas.width * canvas.height * 4;
  } else { canopyCache.delete(key); canopyCache.set(key, shard); }
  ctx.drawImage(shard.canvas, x + shard.x, y + shard.y, shard.width, shard.height);
}
function drawTree(ctx: CanvasRenderingContext2D, o: WorldObject, time: number, fade: number, reducedMotion = false) {
  const seed = Math.floor(o.x * 23 + o.y * 17), phase = noise(7, seed) * Math.PI * 2;
  const willow = o.kind === 'willow', variant = o.variant || 0, bare = !willow && variant === 2;
  const id = bare ? 'bare-tree' : 'willow', gust = reducedMotion ? 0 : wind(o.x, o.y, time);
  const height = willow ? 107 + variant * 2 : 91 + variant % 4 * 8;
  const width = height * paperAssetAspect(id) * (willow ? 1 : .86 + variant % 3 * .07);
  const left = -width * .31, top = 3 - height;
  shadow(ctx, 12, 5, 33, 7, .16);
  // Root pixels and the lower bark photograph never move. Hinged upper bark and
  // independent photographed foliage sections answer the wind with different lags.
  nativeTreeStrip(ctx, id, 0, .75, 1, .25, left, top + height * .75, width, height * .25);
  ctx.save(); ctx.globalAlpha *= fade;
  const lowerJoint = top + height * .76;
  ctx.save(); ctx.translate(0, lowerJoint); ctx.rotate(gust * .014);
  nativeTreeStrip(ctx, id, 0, .4, 1, .36, left, top + height * .4 - lowerJoint, width, height * .36); ctx.restore();
  const upperJoint = top + height * .43;
  ctx.save(); ctx.translate(gust * .9, upperJoint); ctx.rotate(gust * .026);
  if (bare) nativeTreeStrip(ctx, id, 0, 0, 1, .43, left, top - upperJoint, width, height * .43);
  else nativeTreeStrip(ctx, id, 0, .3, 1, .13, left, top + height * .3 - upperJoint, width, height * .13);
  ctx.restore();
  if (!bare) {
    // Source 30's three separate round leaf specimens each have their own joint.
    const discs = [[.017, .15, .304, .28], [.35, .01, .315, .3], [.67, .135, .3, .27]];
    discs.forEach(([sx, sy, sw, sh], n) => {
      const jointX = left + width * (sx + sw * .5), jointY = top + height * (sy + sh);
      const lag = reducedMotion ? 0 : Math.sin(time * (.77 + n * .17) + phase + n) * .006;
      ctx.save(); ctx.translate(jointX + gust * (1 + n * .35), jointY); ctx.rotate(gust * (.025 + n * .006) + lag);
      nativeTreeStrip(ctx, id, sx, sy, sw, sh, -width * sw * .5, -height * sh, width * sw, height * sh, true); ctx.restore();
    });
  }
  if (!bare) for (let n = 0; n < 5; n++) {
    const sourceX = .36 + n * .125, sourceW = n === 4 ? .14 : .13, leafY = .41;
    const jointX = left + width * sourceX, jointY = top + height * leafY;
    const lag = reducedMotion ? 0 : Math.sin(time * (1.05 + n * .08) + phase + n * .61) * .012;
    ctx.save(); ctx.translate(jointX + gust * 1.35, jointY); ctx.rotate(gust * (.034 + n * .003) + lag);
    nativeTreeStrip(ctx, id, sourceX, leafY, sourceW, .34, 0, 0, width * sourceW, height * .34); ctx.restore();
  }
  if (sceneryDebris && !reducedMotion && noise(9, seed) > .5) {
    const age = (time * 6 + phase * 8) % 90, xx = 7 + Math.sin(age * .13 + phase) * 9 + gust * age * .16, yy = -76 + age;
    ctx.save(); ctx.globalAlpha *= Math.min(1, (90 - age) / 20); ctx.translate(xx, yy); ctx.rotate(age * .035);
    nativeTreeStrip(ctx, 'willow', .64, .31, .11, .14, -3, -3, 6, 7, true); ctx.restore();
  }
  ctx.restore();
}
function trailerWindow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number) {
  // A clipped photograph of the caravan's real glazing replaces painted panes.
  panel(ctx, x - 2, y - 2, w + 4, h + 4, P.chalk, seed);
  drawPaperAssetRegion(ctx, 'blue-trailer', .275, .22, .245, .29, x, y, w, h);
  line(ctx, [x + 2, y + h * .8, x + w - 2, y + h * .15], rgba(P.chalk, .5), 1.8, true);
}
function drawSealedBuildingPhoto(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, width: number, height: number) {
  drawPaperAsset(ctx, id, x, y, width, height);
  // Keep the actual camera-real facade intact. A thin locked brace makes its
  // secondary doors read as closed instead of smearing a tiny metal crop over it.
  const aspect = paperAssetAspect(id), dw = Math.min(width, height * aspect), dh = dw / aspect;
  const left = x + (width - dw) / 2, top = y + height - dh;
  const doorX = id === 'blue-trailer' ? .64 : id === 'civic-building' ? .55 : .44;
  const doorY = id === 'civic-building' ? .59 : .44;
  line(ctx, [left + dw * (doorX - .055), top + dh * (doorY - .07), left + dw * (doorX + .055), top + dh * (doorY + .07)], rgba(P.ink, .78), .8);
  line(ctx, [left + dw * (doorX - .055), top + dh * (doorY + .07), left + dw * (doorX + .055), top + dh * (doorY - .07)], rgba(P.ink, .78), .8);
}
function specimenFootprint(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // A fine cataloguing outline makes the unchanged physical footprint legible
  // when a properly proportioned object occupies only part of its reserved space.
  if (w < 60 && h < 60) return;
  ctx.save(); ctx.globalAlpha *= .19; ctx.strokeStyle = P.paper; ctx.lineWidth = .55;
  ctx.beginPath(); ctx.roundRect(1, 1, Math.max(1, w - 2), Math.max(1, h - 2), Math.min(12, h * .2)); ctx.stroke(); ctx.restore();
}
function drawBuilding(ctx: CanvasRenderingContext2D, o: WorldObject, _time: number) {
  const w = (o.width || 5) * TILE_SIZE, h = (o.height || 4) * TILE_SIZE, variant = o.variant || 0, seed = o.x * 13 + o.y * 37;
  const civic = variant > 0, castle = variant === 4;
  specimenFootprint(ctx, w, h);
  shadow(ctx, w / 2 + 5, h + 5, w / 2 - 4, 7, .12);
  if (!civic) {
    const id = noise(8, seed) > .53 ? 'blue-trailer' : 'trailer';
    const artH = Math.min(151, Math.max(126, h * .78 + 22)), artW = Math.min(w, artH * paperAssetAspect(id));
    // Align the native photograph's own door with the real central entrance,
    // preserving the intact rounded caravan, its windows, wheels and staircase.
    const doorX = id === 'blue-trailer' ? .64 : .44;
    drawPaperAsset(ctx, id, w / 2 - artW * doorX, h + 8 - artH, artW, artH);
  } else {
    // Greatness is a cluster of humble camera-real specimens, not a stretched
    // metal backboard. Each greenhouse retains an adult-scale door and glazing.
    const columns = castle ? 6 : Math.max(2, Math.ceil(w / 210));
    const rows = castle ? 3 : h > 300 ? 2 : 1;
    const spacing = w / columns, frontH = castle ? 184 : 173;
    for (let row = rows - 1; row >= 0; row--) {
      const inset = row * spacing * .34, rowW = w - inset * 2;
      const count = Math.max(1, columns - (castle ? row : 0)), step = rowW / count;
      const baseline = h + 8 - row * Math.max(95, (h - frontH) / Math.max(1, rows - 1));
      const artH = frontH - row * 15;
      for (let n = 0; n < count; n++) {
        const id = variant === 3 && (n + row) % 2 ? 'trailer' : 'civic-building';
        const center = inset + (n + .5) * step;
        const artW = Math.min(step + 17, artH * paperAssetAspect(id));
        drawSealedBuildingPhoto(ctx, id, center - artW / 2, baseline - artH, artW, artH);
        if (castle && row === 0 && (n === 0 || n === count - 1))
          drawPaperAssetRegion(ctx, 'trailer', .73, .05, .23, .8, center + artW * .3, baseline - 87, 25, 87);
      }
    }
    if (variant === 2) drawPaperAsset(ctx, 'bed', w * .09, h - 56, 43, 61);
  }
  // There is exactly one usable threshold, centred at the original collider.
  const dw = 37, dh = civic ? 75 : 64;
  if (civic) {
    panel(ctx, w / 2 - dw / 2 - 2, h - dh - 5, dw + 4, dh + 4, P.chalk, seed + 61);
    drawPaperAssetRegion(ctx, 'trailer', .37, .18, .145, .61, w / 2 - dw / 2, h - dh - 3, dw, dh);
  }
  for (let n = 0; n < 2; n++) panel(ctx, w / 2 - 19 - n * 3, h + n * 3, 38 + n * 6, 3, P.ash, seed + n + 66);
  if (o.label) {
    const text = o.label.replace('Library of ', '').replace('Hospital for Those ', 'Hospital: ');
    const labelW = Math.min(w - 10, Math.max(99, text.length * 5.5));
    panel(ctx, w / 2 - labelW / 2, h - dh - 31, labelW, 20, P.chalk, seed + 68);
    ctx.font = '10px "DM Sans", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = P.ink;
    ctx.fillText(text, w / 2, h - dh - 21);
  }
}
function drawVegetation(ctx: CanvasRenderingContext2D, o: WorldObject, time: number, seed: number) {
  const reed = o.kind === 'reed', crop = o.kind === 'crop', bush = o.kind === 'bush';
  const width = bush ? 36 : reed ? 26 : 22 + (o.variant || 0) % 3 * 3;
  const height = bush ? 34 : reed ? 44 : crop ? 28 : 27;
  const gust = wind(o.x, o.y, time + noise(1, seed) * 2), base = 4;
  shadow(ctx, 2, 3, width * .38, 3, .11);
  // The lower photo stems remain fixed; only their leaf-bearing upper crop moves.
  nativeTreeStrip(ctx, 'plant', 0, .77, 1, .23, -width / 2, base - height * .23, width, height * .23);
  ctx.save(); ctx.translate(0, base - height * .22); ctx.rotate(gust * .055);
  nativeTreeStrip(ctx, 'plant', 0, 0, 1, .79, -width / 2, -height * .79, width, height * .79); ctx.restore();
}
function shelfLayout(o: WorldObject) {
  const w = (o.width || 1) * TILE_SIZE, h = (o.height || 1) * TILE_SIZE;
  const boxH = Math.min(98, Math.max(82, h + 38)), aspect = paperAssetAspect('shelves');
  const columns = Math.max(1, Math.ceil(w / (boxH * aspect))), cellW = w / columns;
  const artW = Math.min(cellW + 2, boxH * aspect), artH = artW / aspect;
  return { boxH, columns, cellW, artW, artH, top: h + 5 - artH };
}
function drawObject(ctx: CanvasRenderingContext2D, o: WorldObject, time: number, fade = 1) {
  const v = o.variant || 0, seed = o.x * 29 + o.y * 73, w = (o.width || 1) * 32, h = (o.height || 1) * 32;
  surfaceSeed = seed;
  switch (o.kind) {
    case 'tree': case 'willow': drawTree(ctx, o, time, fade); break;
    case 'building': drawBuilding(ctx, o, time); break;
    case 'rock': case 'ore':
      shadow(ctx, 4, 4, 17, 5, .17);
      drawPaperAsset(ctx, o.kind === 'ore' ? 'ore-rock' : 'rock', -21, -31, 42, 38); break;
    case 'flower': case 'bush': case 'crop': drawVegetation(ctx, o, time, seed); break;
    case 'reed':
      if (v === 8) { drawPaperAsset(ctx, 'item-willow', -24, -17, 48, 24); break; }
      drawVegetation(ctx, o, time, seed); break;
    case 'campfire': shadow(ctx, 0, 4, 20, 6, .17); fire(ctx, time + noise(5, seed) * 13); break;
    case 'lantern': shadow(ctx, 3, 3, 9, 3, .14); drawPaperAsset(ctx, 'item-lantern', -13, -41, 26, 47); break;
    case 'bench': {
      const crop = [[.015, .24, .32, .76], [.22, .01, .35, .91], [.43, .58, .3, .42], [.635, .2, .34, .79]][v % 4];
      const stoolH = v % 4 === 2 ? 19 : 29, stoolW = v % 4 === 2 ? 23 : 23;
      shadow(ctx, 2, 3, 12, 3, .13);
      drawPaperAssetRegion(ctx, 'stools', crop[0], crop[1], crop[2], crop[3], -stoolW / 2, 5 - stoolH, stoolW, stoolH); break;
    }
    case 'workbench': {
      const x = o.width ? w / 2 : 0, y = o.height ? h : 5;
      specimenFootprint(ctx, w, h); shadow(ctx, x + 2, y + 2, 35, 5, .14);
      drawPaperAsset(ctx, 'workbench', x - 41, y - 61, 82, 67); break;
    }
    case 'well':
      shadow(ctx, 3, 3, 25, 7, .16);
      // The communal well is a recovered porcelain wash basin under rusty pipe.
      drawPaperAssetRegion(ctx, 'brain-machine', .12, .11, .74, .88, -28, -52, 56, 61);
      break;
    case 'sign':
      panel(ctx, -2, -26, 4, 34, P.rust, seed, false);
      if (v === 1) {
        drawPaperAsset(ctx, 'billboard', -45, -109, 90, 114);
        panel(ctx, -39, -13, 78, 14, P.chalk, seed + 3);
        ctx.font = '8px "DM Sans", sans-serif'; ctx.fillStyle = P.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('BE YOURSELF. BE DIVINE.', 0, -6);
      } else if (v === 2) {
        panel(ctx, -25, -84, 50, 4, P.rust, seed + 1, false);
      } else {
        panel(ctx, -28, -44, 56, 24, P.chalk, seed + 1);
        paperScraps(ctx, -18, -38, 32, 12, seed); panel(ctx, -17, -27, 34, 2, P.umbra, seed + 2, false);
      }
      break;
    case 'crate': case 'chest':
      shadow(ctx, 3, 4, 18, 5, .16); drawPaperAsset(ctx, 'crate', -23, -30, 46, 38);
      if (o.kind === 'chest') panel(ctx, -2, -10, 5, 7, P.ochre, seed, true);
      break;
    case 'fence':
      // Each rail is a smooth scissors-cut strip of photographed salvaged wood.
      panel(ctx, -18, -19, 36, 5, P.umbra, seed); panel(ctx, -18, -7, 36, 4, P.umbra, seed + 1);
      panel(ctx, -15, -27, 5, 33, P.umbra, seed + 2); panel(ctx, 10, -26, 5, 32, P.umbra, seed + 3);
      break;
    case 'grave':
      shadow(ctx, 3, 4, 15, 4, .15);
      drawPaperAssetRegion(ctx, 'rock', .14, 0, .66, 1, -13, -35, 26, 41);
      panel(ctx, -9, -23, 18, 7, P.chalk, seed);
      ctx.font = '5px "DM Sans", sans-serif'; ctx.fillStyle = P.ink; ctx.textAlign = 'center'; ctx.fillText('TIME SERVED', 0, -19);
      break;
    case 'altar': {
      drawPaperAssetRegion(ctx, 'stools', .43, .58, .3, .42, -12, -16, 24, 22);
      if (v === 1) {
        drawActorSprite(ctx, 'lady', 0, -21, Math.PI / 2, false, 0, 0, 1, undefined, { reducedMotion: true });
      } else if (v === 2) {
        // Real fluted rusty cylinders repeat as oppressive administrative pillars.
        drawPaperAssetRegion(ctx, 'trailer', .75, .06, .21, .76, -12, -96, 24, 90);
      } else if (v === 3) {
        drawPaperAsset(ctx, 'crate', -17, -53, 34, 34);
        drawPaperAsset(ctx, 'rock', -13, -74, 26, 26);
      } else if (v === 4) {
        drawPaperAssetRegion(ctx, 'brain-machine', .19, .17, .26, .38, -17, -58, 34, 43);
      } else {
        drawPaperAsset(ctx, 'cabinet', -15, -56, 30, 40);
      }
      break;
    }
    case 'bed': {
      const artH = o.width && o.width >= 5 ? 88 : 75, artW = Math.min(102, w);
      specimenFootprint(ctx, w, h); shadow(ctx, w * .5 + 3, h + 3, artW * .42, 5, .14);
      drawPaperAsset(ctx, 'bed', w * .5 - artW / 2, h + 6 - artH, artW, artH); break;
    }
    case 'bookshelf': {
      const { columns, cellW, artW, artH, top } = shelfLayout(o);
      // The real iron rail and stools are fixed; separate suspended bundles
      // are painted at their joints by secondaryScenery rather than bobbing the rack.
      for (let n = 0; n < columns; n++) {
        const x = n * cellW - 1 + (cellW + 2 - artW) / 2;
        drawPaperAssetRegion(ctx, 'shelves', 0, 0, 1, .17, x, top, artW, artH * .17);
        drawPaperAssetRegion(ctx, 'shelves', 0, .6, 1, .4, x, top + artH * .6, artW, artH * .4);
      }
      break;
    }
    case 'table': {
      const artW = Math.min(w + 4, 149), artH = 76, left = w / 2 - artW / 2, top = h + 5 - artH;
      specimenFootprint(ctx, w, h); shadow(ctx, w * .5 + 3, h + 3, artW * .47, 5, .13);
      drawPaperAsset(ctx, 'desk', left, top, artW, artH);
      if (v === 1) {
        ctx.save(); ctx.globalAlpha *= .9;
        panel(ctx, left + artW * .12, top + 19, artW * .76, 18, P.pine, seed, true); ctx.restore();
        for (let n = 0; n < 3; n++) drawItemIcon(ctx, 'time_coupon', left + artW * (.24 + n * .23) - 5, top + 22, 11);
      }
      break;
    }
    case 'rug': {
      // A narrow quiet mount marks a dais or walkway. Velvet remains on the
      // actual hanging curtains; no fabric photograph is stretched across a room.
      const mountW = Math.min(w, h > w ? 78 : 116), left = (w - mountW) / 2;
      const path = new Path2D(); path.roundRect(left, 2, mountW, Math.max(1, h - 4), Math.min(23, mountW * .25));
      ctx.save(); ctx.globalAlpha *= .08; ctx.fillStyle = P.chalk; ctx.fill(path); ctx.restore();
      ctx.save(); ctx.globalAlpha *= .25; ctx.strokeStyle = P.paper; ctx.lineWidth = .65; ctx.stroke(path); ctx.restore(); break;
    }
    case 'window': trailerWindow(ctx, -13, -37, 26, 31, seed); break;
    case 'portrait':
      drawPaperAsset(ctx, 'billboard', -28, -65, 56, 63);
      break;
    case 'machine': {
      const continuity = Boolean(o.label?.toLowerCase().includes('mind'));
      shadow(ctx, 3, 4, 26, 7, .17);
      if (continuity) drawPaperAsset(ctx, 'brain-machine', -45, -102, 90, 114);
      else if (v === 2) drawPaperAsset(ctx, 'telescreen', -28, -52, 56, 60);
      else {
        drawPaperAsset(ctx, 'cabinet', -27, -57, 54, 65);
        drawPaperAssetRegion(ctx, 'brain-machine', .31, .06, .38, .28, -17, -53, 34, 29);
        curve(ctx, P.rust, 1.8, -20, -3, -35, 10, -29, 18);
        curve(ctx, P.ink, 1.2, 19, -5, 35, 2, 30, 15);
      }
      break;
    }
    case 'gate': case 'portal': {
      const portal = o.kind === 'portal', gh = Math.max(h, 110);
      for (const xx of [0, w - 24]) {
        panel(ctx, xx, 0, 24, gh, P.rust, seed + xx);
        drawPaperAssetRegion(ctx, 'trailer', .76, .05, .17, .79, xx + 3, -3, 18, gh + 6);
      }
      panel(ctx, -6, -18, w + 12, 24, P.ash, seed + 11);
      if (portal) {
        ctx.save(); ctx.globalAlpha *= .23;
        panel(ctx, 26, 7, w - 52, gh - 6, P.water, seed + 16, false); ctx.restore();
        for (let n = 0; n < 5; n++) curve(ctx, rgba(P.chalk, .22), .65, 34 + n * 19, gh, 39 + n * 19 + Math.sin(time + n) * 8, gh * .48, 34 + n * 19, 6);
      } else {
        for (let xx = 33; xx < w - 25; xx += 17) panel(ctx, xx, 9, 3, gh - 9, P.rust, seed + xx, false);
        panel(ctx, 25, gh * .48, w - 50, 4, P.slate, seed + 17, false);
        for (let xx = 37; xx < w - 31; xx += 37) curve(ctx, rgba(P.ink, .5), .65, xx, 8, xx + 12, gh / 2, xx + 34, gh - 6);
      }
      if (o.label) {
        ctx.font = '11px "DM Sans", sans-serif'; ctx.fillStyle = P.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(portal ? 'INFINITE TIME' : v === 1 ? 'GREAT CASTLE DIVINE' : 'UNENTERABLE', w / 2, -6);
      }
      break;
    }
  }
}
function secondaryScenery(ctx: CanvasRenderingContext2D, o: WorldObject, time: number, reducedMotion: boolean) {
  const seed = o.x * 29 + o.y * 73, phase = noise(3, seed) * 15, gust = reducedMotion ? 0 : wind(o.x, o.y, time);
  if (o.kind === 'building') {
    const w = (o.width || 5) * TILE_SIZE, h = (o.height || 4) * TILE_SIZE, civic = (o.variant || 0) > 0;
    const id = civic ? 'civic-building' : noise(8, o.x * 13 + o.y * 37) > .53 ? 'blue-trailer' : 'trailer';
    const artH = civic ? o.variant === 4 ? 184 : 173 : Math.min(151, Math.max(126, h * .78 + 22));
    const artW = Math.min(civic ? w / Math.max(2, Math.ceil(w / 210)) : w, artH * paperAssetAspect(id));
    const dh = artW / paperAssetAspect(id), left = civic ? w * .75 - artW / 2 : w / 2 - artW * (id === 'blue-trailer' ? .64 : .44);
    const nativeTop = h + 8 - dh, chimneyX = left + artW * .9, chimneyY = nativeTop + dh * (id === 'blue-trailer' ? .32 : .09);
    for (let n = 0; n < 4; n++) {
      const age = ((reducedMotion ? 0 : time) * (6.4 + n * .3) + n * 17 + phase) % 85;
      blob(ctx, chimneyX + age * .13 + gust * age * .23, chimneyY - age,
        3 + age * .09, 2 + age * .07, rgba(P.charcoal, .07 * (1 - age / 85)), n + seed);
    }
    // A small crop from this very roof lifts at its physical seam. It cannot
    // float beside a resized facade or become an unrelated blue material bar.
    ctx.save(); ctx.translate(left + artW * .44, nativeTop + dh * .06); ctx.rotate(gust * .035);
    drawPaperAssetRegion(ctx, id, .4, .035, .12, .075, 0, 0, 13, 5); ctx.restore();
  } else if (o.kind === 'bookshelf') {
    const { columns, cellW, artW, artH, top } = shelfLayout(o);
    const bundles = [[0, .285], [.295, .23], [.535, .225], [.775, .225]];
    for (let column = 0; column < columns; column++) {
      const left = column * cellW - 1 + (cellW + 2 - artW) / 2;
      bundles.forEach(([sx, sw], n) => {
        const x = left + artW * (sx + sw / 2), y = top + artH * .17;
        const swing = reducedMotion ? 0 : Math.sin(time * (.62 + n * .12) + phase + n * .83) * .014;
        ctx.save(); ctx.translate(x, y); ctx.rotate(swing);
        nativeTreeStrip(ctx, 'shelves', sx, .17, sw, .43, -artW * sw / 2, 0, artW * sw, artH * .43); ctx.restore();
      });
    }
  } else if (o.kind === 'lantern') {
    const flicker = reducedMotion ? .5 : .5 + Math.sin(time * 7.3 + phase) * .22 + Math.sin(time * 11.7 + phase * 2) * .12;
    ctx.save(); ctx.globalAlpha *= .035 + flicker * .05; blob(ctx, 0, -16, 11, 14, P.straw, seed); ctx.restore();
  } else if (o.kind === 'sign' && o.variant === 2) {
    const path = new Path2D(); path.moveTo(-18, -80); path.lineTo(18, -80);
    path.bezierCurveTo(18 + gust * 2, -60, 14 + gust * 4, -44, 17 + gust * 5, -22);
    path.quadraticCurveTo(8 + gust * 3, -24 + gust, 1 + gust * 4, -27); path.lineTo(-18 + gust * 4, -23);
    path.bezierCurveTo(-17 + gust * 3, -44, -19 + gust, -64, -18, -80); path.closePath();
    ctx.save(); ctx.clip(path);
    drawPaperAssetRegion(ctx, 'prop-curtain', .05, .02, .9, .93, -21, -81, 45, 61); ctx.restore();
    ctx.save(); ctx.strokeStyle = P.paper; ctx.lineWidth = .6; ctx.stroke(path); ctx.restore();
    panel(ctx, -12 + gust, -65, 25, 14, P.chalk, seed + 1);
    ctx.font = '6px "DM Sans", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = P.ink; ctx.fillText('BE DIVINE', gust, -57);
  } else if (o.kind === 'sign' && o.variant === 1) {
    const boardW = 90, boardH = Math.min(114, boardW / paperAssetAspect('billboard')), boardTop = 5 - boardH;
    const cycle = (time + phase) % 8.8, gesture = reducedMotion ? 0 : Math.sin(Math.min(1, cycle / 2.9) * Math.PI);
    // Separate printed lip and gloved-hand photographs move within the fixed
    // round light fixture. Coupon kisses carry the same real photographic portrait.
    const wristX = -45 + boardW * .69, wristY = boardTop + boardH * .77;
    ctx.save(); ctx.translate(wristX, wristY); ctx.rotate(-gesture * .06);
    drawPaperAssetRegion(ctx, 'billboard', .56, .5, .28, .28, -boardW * .13, -boardH * .27, boardW * .28, boardH * .28); ctx.restore();
    if (!reducedMotion && sceneryDebris && cycle > 2.2 && cycle < 3.9) {
      const age = (cycle - 2.2) / 1.7;
      ctx.save(); ctx.globalAlpha *= Math.sin(age * Math.PI) * .6; ctx.translate(-1 - age * 25, boardTop + boardH * .56 - age * 12); ctx.rotate(-age * .45);
      drawItemIcon(ctx, 'time_coupon', -5, -6, 12); ctx.restore();
    }
    // The rim's tired bulbs flicker quietly, rather than animating the entire sign.
    if (!reducedMotion) {
      ctx.save(); ctx.globalAlpha *= .05 + Math.max(0, Math.sin(time * 2.3 + phase)) * .11;
      blob(ctx, -29, boardTop + boardH * .31, 2, 2, P.straw, seed); blob(ctx, 28, boardTop + boardH * .32, 2, 2, P.straw, seed + 1); ctx.restore();
    }
  } else if (o.kind === 'machine' && o.variant === 2) {
    // Fit the animated portrait to the actual native CRT's glass, respecting
    // its measured cutout aspect so no face is pasted over the casing/antennae.
    const aspect = paperAssetAspect('telescreen'), nativeW = Math.min(56, 60 * aspect), nativeH = nativeW / aspect;
    const left = -28 + (56 - nativeW) / 2, top = 8 - nativeH;
    const sx = left + nativeW * .07, sy = top + nativeH * .37, sw = nativeW * .64, sh = nativeH * .51;
    ctx.save(); const path = new Path2D(); path.roundRect(sx, sy, sw, sh, 3); ctx.clip(path);
    drawPaperAsset(ctx, 'lady-head', sx + 1, sy + Math.sin(time * .5 + phase) * .15, sw - 2, sh);
    const scan = reducedMotion ? sy + sh * .5 : sy + ((time * 6 + phase) % sh);
    line(ctx, [sx, scan, sx + sw, scan], rgba(P.paper, .1), .7, true); ctx.restore();
  }
}
function cachedObjectArt(o: WorldObject) {
  return !['tree', 'willow', 'campfire', 'reed', 'flower', 'crop', 'bush'].includes(o.kind);
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
  if (o.kind === 'sign' && o.variant !== 1) ctx.rotate(gust * .006);
  // Crop enormous facades before scaling their cached photograph assemblies. The castle extends far
  // beyond the window; resampling those hidden metres costs more than all the moving trees.
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
function actorLabelHeight(kind: string) {
  return kind === 'lady' ? 83 : kind === 'bat' ? 89 : ['hare', 'deer', 'peacock'].includes(kind) ? 80 : kind === 'heron' ? 78 : 74;
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
      if (impact.kind === 'hit') blob(ctx, xx, yy, 1.6, .8, shade, n);
      else drawPaperAsset(ctx, impact.kind === 'stone' ? 'item-stone' : impact.kind === 'gather' ? 'item-herb' : 'item-wood', xx - 3.5, yy - 2.5, 7, 5);
    }
    if (impact.kind === 'hit') curve(ctx, rgba(P.umbra, .50), 2.5, -6, contactHeight - 4, 0, contactHeight + 2, 7, contactHeight - 6);
  }
  ctx.restore();
}
function paperRing(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, width = .7, rotation = 0) {
  ctx.save(); ctx.strokeStyle = fill; ctx.lineWidth = width; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
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
      ctx.save(); ctx.translate(xx, yy); ctx.scale(z, z);
      nativeTreeStrip(ctx, 'material-water', .19, .34, .67, .12, 0, 0, 32, 4, true);
      curve(ctx, P.paper, .72, 0, 0, 14, -swell, 31, .6); ctx.restore();
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
  const margin = 8 + z * 4;
  const visible = (x: number, y: number, w: number, h: number) => x + w + margin > 0 && x - margin < width && y + h + margin > 0 && y - margin < height;
  if (visible(top.x, top.y, rw, scale * 1.1)) {
    // This is a mounted room plan with actual clipped windows and furniture.
    // A restrained header rim, two salvage patches and a wire define its wall.
    ctx.save(); ctx.globalAlpha *= .48; ctx.strokeStyle = P.paper; ctx.lineWidth = 1.1 * z;
    ctx.beginPath(); ctx.roundRect(top.x, top.y, rw, scale * 1.05, 12 * z); ctx.stroke(); ctx.restore();
    curve(ctx, rgba(P.ink, .36), .65 * z, top.x + 8 * z, top.y + 7 * z, top.x + rw / 2, top.y + 20 * z, top.x + rw - 8 * z, top.y + 5 * z);
    for (const ratio of [.19, .74]) {
      const xx = top.x + rw * ratio;
      if (!visible(xx, top.y + 5 * z, 24 * z, 12 * z)) continue;
      ctx.save(); ctx.globalAlpha *= .44;
      drawPaperAssetRegion(ctx, 'blue-trailer', .25, .22, .12, .18, xx, top.y + 5 * z, 24 * z, 12 * z); ctx.restore();
    }
  }
  const bottom = position(frame, 1, frame.scene.height - 1.3, width, height), gap = 2.4 * scale;
  ctx.save(); ctx.globalAlpha *= .58; ctx.strokeStyle = P.paper; ctx.lineWidth = .85 * z;
  if (visible(bottom.x, bottom.y, rw / 2 - gap / 2, 2)) line(ctx, [bottom.x, bottom.y, bottom.x + rw / 2 - gap / 2, bottom.y], P.paper, .85 * z);
  if (visible(bottom.x + rw / 2 + gap / 2, bottom.y, rw / 2 - gap / 2, 2)) line(ctx, [bottom.x + rw / 2 + gap / 2, bottom.y, bottom.x + rw, bottom.y], P.paper, .85 * z);
  ctx.restore();
  if (frame.scene.exit) {
    const p = position(frame, frame.scene.exit.positionInRoom.x, frame.scene.exit.positionInRoom.y, width, height);
    if (visible(p.x - 50, p.y + 10 * z - 10, 100, 20)) label(ctx, '↓ Outside', p.x, p.y + 10 * z, P.paper, '12px "Libre Baskerville", serif');
  }
}

export function renderWorld(ctx: CanvasRenderingContext2D, frame: RenderFrame, width: number, height: number) {
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'; mountStock(ctx, 0, 0, width, height);
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
      if (!a.hostile && dist < 5.4) { label(ctx, a.name, p.x, p.y - actorLabelHeight(a.kind) * zoom, a.id === frame.nearby?.id ? P.paper : P.paper, `${Math.max(10, 10 * zoom)}px "DM Sans", sans-serif`); if (frame.flags.includes(`${a.id}_friend`)) { ctx.save(); ctx.fillStyle = P.lichen; ctx.beginPath(); ctx.arc(p.x + 15 * zoom, p.y - 36 * zoom, 2 * zoom, 0, Math.PI * 2); ctx.fill(); ctx.restore(); } }
      else if (a.hostile && dist < 5) { line(ctx, [p.x - 13 * zoom, p.y - (actorLabelHeight(a.kind) - 3) * zoom, p.x + 13 * zoom, p.y - (actorLabelHeight(a.kind) - 3) * zoom], P.umbra, 4 * zoom, true); line(ctx, [p.x - 13 * zoom, p.y - (actorLabelHeight(a.kind) - 3) * zoom, p.x - 13 * zoom + Math.min(1, a.health / 42) * 26 * zoom, p.y - (actorLabelHeight(a.kind) - 3) * zoom], P.clay, 2.5 * zoom, true); }
    } else {
      const a = frame.player, p = position(frame, a.x, a.y, width, height); shadow(ctx, p.x + 4 * zoom, p.y + 2 * zoom, 11 * zoom, 4 * zoom, .21); ctx.save(); if (a.hurt > 0) ctx.globalAlpha = frame.reducedMotion ? .83 : .68 + Math.max(0, .35 - a.hurt) * .5; drawActorSprite(ctx, 'human', p.x, p.y, a.facing, a.moving, a.animation, time, zoom, undefined, { reducedMotion: frame.reducedMotion, phaseOffset: 0, pace: frame.playerPace || 1, action: a.attacking, hurt: a.hurt }); ctx.restore();
      if (a.attacking > 0 || ['walking_cane', 'willow_axe', 'stone_pick', 'fishing_rod'].includes(frame.selected)) {
        const phase = a.attacking > 0 ? 1 - Math.min(1, a.attacking / .26) : 1, anticipation = .07 / .26, contact = .16 / .26;
        const wrist = a.attacking > 0 ? phase < anticipation ? -.15 * phase / anticipation : phase < contact ? -.15 + .5 * ((phase - anticipation) / (contact - anticipation)) : .35 * (1 - (phase - contact) / (1 - contact)) : 0;
        // These grips are measured on the native photographs, not the former drawings.
        const grip = frame.selected.includes('cane') ? { x: 12, y: 4 } : frame.selected.includes('rod') ? { x: 8, y: 26 } : { x: 24, y: 26 };
        const facingLeft = Math.cos(a.facing) < -.35;
        const mirrorTool = frame.selected.includes('axe') || frame.selected.includes('pick') ? !facingLeft : facingLeft;
        const itemSize = 28 * zoom, hx = p.x + heldPose.x * zoom, hy = p.y + heldPose.y * zoom;
        ctx.save(); ctx.translate(hx, hy); ctx.rotate(heldPose.angle - Math.PI / 2 + wrist); if (mirrorTool) ctx.scale(-1, 1);
        drawItemIcon(ctx, frame.selected, -grip.x / 32 * itemSize, -grip.y / 32 * itemSize, itemSize); ctx.restore();
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
      drawPaperAsset(ctx, 'item-fish', -12, -6, 24, 12); ctx.restore();
    } else {
      ctx.save(); ctx.globalAlpha = bite ? .22 : .12; ctx.strokeStyle = P.paper; ctx.lineWidth = .8 * zoom;
      for (let n = 0; n < 2; n++) { const age = frame.reducedMotion ? .45 + n * .2 : ((fishing.elapsed * (bite ? 1.25 : .44)) + n * .5) % 1, r = (3 + age * (bite ? 17 : 10)) * zoom; ctx.beginPath(); ctx.ellipse(bob.x, bob.y + 3 * zoom, r, r * .33, -.1, 0, Math.PI * 2); ctx.stroke(); } ctx.restore();
      ctx.save(); ctx.translate(floatX, floatY - 3 * zoom); ctx.rotate(frame.reducedMotion ? 0 : toss * .15); blob(ctx, 0, 0, 2 * zoom, 4 * zoom, bite ? P.straw : P.clay, 21, true); ctx.restore();
    }
    const sag = bite || fishing.phase === 'caught' ? 10 : 19 + (frame.reducedMotion ? 0 : Math.sin(time * 1.3) * 3);
    const rodAngle = heldPose.angle - Math.PI / 2, rodSide = Math.cos(frame.player.facing) < -.35 ? -1 : 1;
    const rodTipX = (29 - 8) / 32 * 28 * rodSide, rodTipY = (2.3 - 26) / 32 * 28;
    const lineX = pp.x + (heldPose.x + rodTipX * Math.cos(rodAngle) - rodTipY * Math.sin(rodAngle)) * zoom;
    const lineY = pp.y + (heldPose.y + rodTipX * Math.sin(rodAngle) + rodTipY * Math.cos(rodAngle)) * zoom;
    curve(ctx, P.ash, .9, lineX, lineY, (lineX + floatX) / 2, Math.min(lineY, floatY) - sag * zoom, floatX, floatY);
    if (bite) label(ctx, 'Reel', bob.x, bob.y - 25 * zoom, P.paper, 'bold 15px sans-serif');
  }
  if (frame.buildPreview) { const b = frame.buildPreview, p = position(frame, b.position.x, b.position.y, width, height); ctx.save(); ctx.translate(p.x, p.y); ctx.scale(zoom, zoom); ctx.globalAlpha = .59; drawObject(ctx, { id: 'preview', kind: b.kind, ...b.position, solid: false }, time); ctx.restore(); ctx.strokeStyle = b.valid ? P.lichen : P.rust; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(p.x, p.y, 17 * zoom, 9 * zoom, -.1, 0, Math.PI * 2); ctx.stroke(); }
  for (const particle of frame.particles) {
    const p = position(frame, particle.x, particle.y, width, height);
    if (Math.abs(particle.x - frame.camera.x) > hw || Math.abs(particle.y - frame.camera.y) > hh) continue;
    ctx.save(); ctx.globalAlpha = Math.min(.75, particle.life / Math.max(.01, particle.maxLife));
    if (particle.kind === 'smoke' || particle.kind === 'dust') blob(ctx, p.x, p.y, particle.size * zoom, particle.size * zoom * .7, particle.color, particle.maxLife * 18);
    else { const r = Math.max(1, particle.size * zoom); drawPaperAssetRegion(ctx, 'willow', .66, .22, .12, .2, p.x - r, p.y - r, r * 2, r * 2); }
    ctx.restore();
  }
  // Smooth drifting haze and sparse rain belong to the photographed specimen landscape.
  if (scene.outdoors) {
    ctx.save();
    for (let n = 0; n < 3; n++) {
      const drift = (time * 6 + n * width / 2) % (width + 620) - 310, yy = height * (.21 + n * .27);
      blob(ctx, drift, yy + 12, 260, 24, rgba(P.paper, .026), n);
      blob(ctx, drift + 50, yy + 2, 170, 18, rgba(P.paper, .018), n + 5);
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
    blob(ctx, p.x, p.y, r, r * .65, rgba(P.ochre, flicker), 1);
  }
  if (frame.waypoint) { const p = position(frame, frame.waypoint.x, frame.waypoint.y, width, height); ctx.strokeStyle = P.sand; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(p.x, p.y, 12 * zoom, 5 * zoom, 0, 0, Math.PI * 2); ctx.stroke(); const lift = Math.sin(time * 1.3) * 2; line(ctx, [p.x, p.y - (17 + lift) * zoom, p.x - 4 * zoom, p.y - (24 + lift) * zoom, p.x + 4 * zoom, p.y - (24 + lift) * zoom, p.x, p.y - (17 + lift) * zoom], P.straw, 1.4);
    if (p.x < 35 || p.x > width - 35 || p.y < 110 || p.y > height - 100) { const angle = Math.atan2(p.y - height / 2, p.x - width / 2), factor = Math.min((width / 2 - 44) / Math.max(.01, Math.abs(p.x - width / 2)), (height / 2 - 115) / Math.max(.01, Math.abs(p.y - height / 2))); const x = width / 2 + (p.x - width / 2) * Math.max(.05, factor), y = height / 2 + (p.y - height / 2) * Math.max(.05, factor); ctx.save(); ctx.translate(x, y); ctx.rotate(angle); line(ctx, [-4, -5, 6, 0, -4, 5], P.sand, 2); ctx.restore(); }
  }
  if (frame.nearby) { const p = position(frame, frame.nearby.position.x, frame.nearby.position.y, width, height); ctx.strokeStyle = rgba(P.straw, .7); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.ellipse(p.x, p.y + 4 * zoom, 12 * zoom, 5 * zoom, -.12, 0, Math.PI * 2); ctx.stroke(); }
  for (const f of frame.floating) { const p = position(frame, f.x, f.y, width, height); ctx.save(); ctx.globalAlpha = Math.min(1, f.life * 2); label(ctx, f.text, p.x, p.y - 36 * zoom, f.color, `${Math.max(13, 13 * zoom)}px "DM Sans", sans-serif`); ctx.restore(); }
  // The olive mounting stock has clean edges: no drawn vignettes or torn corner scraps.
  // Native photography and olive stock texture are already cached into the scene.
  // A quiet cream mount tint avoids resampling an extra full-screen texture every frame.
  ctx.save(); ctx.globalAlpha = .026; ctx.fillStyle = PAPER; ctx.fillRect(0, 0, width, height); ctx.restore(); ctx.restore();
}
