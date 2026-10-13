import { TILE_SIZE, type ActorFrame, type RenderFrame, type TileKind, type VisualImpact, type WorldObject, type WorldScene } from './types';
import { drawActorSprite, drawItemIcon, playerToolPose } from './sprites';
import { worldHash } from './world';
import { drawMindExchange } from './mindExchange';

// The map remains a simulation grid. Its illustration deliberately never shows that grid.
const CHUNK = 8, INK = '#383a34', PAPER = '#b3ad95';
const groundCache = new Map<string, HTMLCanvasElement>();
const contourCache = new Map<string, Map<TileKind, Path2D>>();
const objectCache = new Map<string, { canvas: HTMLCanvasElement; left: number; top: number; width: number; height: number }>();
const colors: Record<TileKind, string> = {
  grass: '#93947e', darkGrass: '#7d856f', dirt: '#a08d74', path: '#b0a08a',
  water: '#809394', deepWater: '#647c81', sand: '#b4ad93', stone: '#99988b',
  woodFloor: '#a18c73', stoneFloor: '#a8a595', void: '#454744', tilled: '#857360',
};
const wet = (kind?: TileKind) => kind === 'water' || kind === 'deepWater';
const noise = (n: number, seed = 1) => worldHash(n * 31 + seed * 7, seed * 19 + n * 3);
const actorPhases = new Map<string, number>();
let sceneryDebris = true;
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
function line(ctx: CanvasRenderingContext2D, points: number[], color = INK, width = 1.3, faint = false) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(points[0], points[1]);
  for (let n = 2; n < points.length; n += 2) ctx.lineTo(points[n], points[n + 1]);
  ctx.stroke();
  if (!faint && width > 1) {
    ctx.save(); ctx.globalAlpha *= .21; ctx.lineWidth = width * 2.1; ctx.stroke(); ctx.restore();
  }
}
function curve(ctx: CanvasRenderingContext2D, color: string, width: number, x: number, y: number, cx: number, cy: number, ex: number, ey: number) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke();
}
function shape(ctx: CanvasRenderingContext2D, points: number[], fill: string, stroke = INK, width = 1.4) {
  ctx.beginPath(); ctx.moveTo(points[0], points[1]);
  for (let n = 2; n < points.length; n += 2) ctx.lineTo(points[n], points[n + 1]);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = width; ctx.strokeStyle = stroke; ctx.stroke(); ctx.save(); ctx.globalAlpha *= .13; ctx.lineWidth = width * 3; ctx.stroke(); ctx.restore(); }
}
function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, seed = 1, outline = true) {
  const k = (n: number) => (noise(n, seed) - .5) * 3;
  const r = Math.min(9, h / 5, w / 6);
  const silhouette = new Path2D(); silhouette.moveTo(x + r, y + k(1));
  silhouette.bezierCurveTo(x + w * .3, y - 1 + k(2), x + w * .8, y + k(3), x + w - r, y + k(4));
  silhouette.quadraticCurveTo(x + w + k(5), y + 1, x + w, y + r);
  silhouette.bezierCurveTo(x + w + k(6), y + h * .4, x + w + k(7), y + h * .8, x + w - 1, y + h - r);
  silhouette.quadraticCurveTo(x + w - 1, y + h + 1, x + w - r, y + h);
  silhouette.bezierCurveTo(x + w * .6, y + h + k(8), x + w * .2, y + h + k(9), x + r, y + h);
  silhouette.quadraticCurveTo(x - 1, y + h + k(10), x, y + h - r);
  silhouette.bezierCurveTo(x - 1 + k(11), y + h * .7, x + k(12), y + h * .2, x, y + r);
  silhouette.quadraticCurveTo(x, y + k(13), x + r, y + k(1)); silhouette.closePath();
  ctx.fillStyle = fill; ctx.fill(silhouette);
  ctx.save(); ctx.clip(silhouette);
  const strokes = Math.min(36, Math.max(4, (w + h) / 11));
  for (let i = 0; i < strokes; i++) {
    const xx = x + noise(i + 18, seed) * w, yy = y + noise(i + 48, seed) * h;
    curve(ctx, i % 3 ? 'rgba(45,41,32,.07)' : 'rgba(231,212,174,.16)', 2 + noise(i + 70, seed) * 7, xx, yy, xx + 2, yy + 7, xx + noise(i + 9, seed) * 5, yy + 10 + noise(i + 60, seed) * 19);
  }
  ctx.restore();
  if (outline) { ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.stroke(silhouette); ctx.save(); ctx.globalAlpha *= .18; ctx.lineWidth = 4; ctx.stroke(silhouette); ctx.restore(); }
}
function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, seed: number, outline = false) {
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const a = i / 12 * Math.PI * 2, radius = .91 + noise(i % 12, seed) * .2;
    const xx = x + Math.cos(a) * rx * radius, yy = y + Math.sin(a) * ry * radius;
    if (!i) ctx.moveTo(xx, yy); else {
      const prev = (i - .5) / 12 * Math.PI * 2;
      ctx.quadraticCurveTo(x + Math.cos(prev) * rx * 1.05, y + Math.sin(prev) * ry * 1.05, xx, yy);
    }
  }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  if (outline) { ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); ctx.save(); ctx.globalAlpha *= .16; ctx.lineWidth = 4; ctx.stroke(); ctx.restore(); }
}
function hatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, color = 'rgba(56,56,46,.16)', count = 9) {
  for (let i = 0; i < count; i++) {
    const xx = x + noise(i + 40, seed) * w, yy = y + noise(i + 90, seed) * h;
    curve(ctx, color, .55 + noise(i, seed) * 1.7, xx, yy, xx + 2, yy + 4, xx + 5 + noise(i + 20, seed) * 12, yy - 2 + noise(i + 30, seed) * 6);
  }
}
function scribble(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, color = 'rgba(46,47,40,.32)') {
  ctx.strokeStyle = color; ctx.lineWidth = .7; ctx.beginPath();
  ctx.moveTo(x, y + h * .5);
  for (let i = 1; i < 12; i++) ctx.bezierCurveTo(x + w * (i - .8) / 11, y + h * noise(i, seed), x + w * (i - .3) / 11, y + h * noise(i + 23, seed), x + w * i / 11, y + h * noise(i + 12, seed));
  ctx.stroke();
}
function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, alpha = .2) {
  ctx.save(); ctx.globalAlpha *= alpha; blob(ctx, x, y, rx, ry, '#45483e', 49); ctx.restore();
}
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#ece3cf', font = '12px "DM Sans", sans-serif') {
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3.2;
  ctx.strokeStyle = 'rgba(44,45,38,.79)'; ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
}
function paintGround(ctx: CanvasRenderingContext2D, scene: WorldScene, tx: number, ty: number, px: number, py: number) {
  const kind = tileAt(scene, tx, ty) || 'void', seed = tx * 31 + ty * 79;
  ctx.save();
  if (kind === 'woodFloor') {
    for (let n = 0; n < 3; n++) { const yy = py + n * 11; curve(ctx, 'rgba(76,63,49,.28)', .8, px - 2, yy, px + 19, yy + 2, px + 34, yy + 1); }
    hatch(ctx, px, py, 32, 32, seed, 'rgba(89,69,51,.13)', 4);
    if (noise(4, seed) > .94) blob(ctx, px + 16, py + 20, 9, 6, 'rgba(78,67,58,.15)', seed);
  } else if (kind === 'stoneFloor' || kind === 'stone') {
    hatch(ctx, px, py, 32, 32, seed, 'rgba(65,63,53,.11)', 3);
    if (noise(1, seed) > .72) line(ctx, [px + 6, py + 28, px + 11, py + 17, px + 18, py + 19, px + 24, py + 11], 'rgba(54,53,46,.16)', .7, true);
  } else if (kind === 'tilled') {
    for (let n = 0; n < 3; n++) curve(ctx, 'rgba(60,51,42,.26)', 3, px - 2, py + n * 11 + 4, px + 20, py + n * 11 + 2, px + 34, py + n * 11 + 4);
  } else if (!wet(kind) && kind !== 'void') {
    hatch(ctx, px, py, 32, 32, seed, 'rgba(58,62,46,.10)', 3);
    if (noise(2, seed) > .72) blob(ctx, px + 16, py + 16, 10, 7, kind === 'path' ? 'rgba(102,87,66,.09)' : 'rgba(211,203,169,.09)', seed);
    if ((kind === 'grass' || kind === 'darkGrass') && noise(3, seed) > .45) {
      const xx = px + 7 + noise(7, seed) * 17, yy = py + 10 + noise(8, seed) * 16;
      curve(ctx, 'rgba(77,88,63,.31)', .9, xx, yy, xx - 3, yy - 3, xx - 2, yy - 6);
      curve(ctx, 'rgba(77,88,63,.23)', .7, xx, yy, xx + 2, yy - 4, xx + 5, yy - 4);
    }
  }
  // Raw-paper scratches sit inside the pigment, rather than a decorative pixel/noise filter.
  for (let i = 0; i < 3; i++) {
    const xx = px + noise(i + 30, seed) * 32, yy = py + noise(i + 34, seed) * 32;
    curve(ctx, 'rgba(236,223,191,.11)', .5, xx, yy, xx + 2, yy + 1, xx + 4, yy - 1);
  }
  ctx.restore();
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
    const path = new Path2D();
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
      if (wet(kind) || kind === 'sand') {
        // Long flowing marker curves replace the rounded rectangles formerly visible along shores.
        path.moveTo(reduced[0].x, reduced[0].y);
        for (let n = 0; n < reduced.length; n++) {
          const a = reduced[(n + reduced.length - 1) % reduced.length], b = reduced[n];
          const c = reduced[(n + 1) % reduced.length], d = reduced[(n + 2) % reduced.length];
          const tension = .13;
          path.bezierCurveTo(b.x + (c.x - a.x) * tension, b.y + (c.y - a.y) * tension, c.x - (d.x - b.x) * tension, c.y - (d.y - b.y) * tension, c.x, c.y);
        }
        path.closePath(); continue;
      }
      const soft = kind === 'darkGrass' ? 91 : kind === 'path' ? 23 : kind === 'woodFloor' || kind === 'stoneFloor' ? 3 : 39;
      for (let n = 0; n < reduced.length; n++) {
        const p = reduced[n], a = reduced[(n + reduced.length - 1) % reduced.length], b = reduced[(n + 1) % reduced.length];
        const da = Math.hypot(p.x - a.x, p.y - a.y), db = Math.hypot(b.x - p.x, b.y - p.y);
        const ra = Math.min(soft, da * .48), rb = Math.min(soft, db * .48);
        const ax = p.x + (a.x - p.x) * ra / da, ay = p.y + (a.y - p.y) * ra / da;
        const bx = p.x + (b.x - p.x) * rb / db, by = p.y + (b.y - p.y) * rb / db;
        if (!n) path.moveTo(ax, ay); else path.lineTo(ax, ay);
        path.quadraticCurveTo(p.x, p.y, bx, by);
      }
      path.closePath();
    }
    layers.set(kind, path);
  }
  contourCache.set(scene.id, layers); return layers;
}
function groundChunk(scene: WorldScene, cx: number, cy: number) {
  const key = `${scene.id}:${cx}:${cy}`;
  const cached = groundCache.get(key);
  if (cached) { groundCache.delete(key); groundCache.set(key, cached); return cached; }
  const c = document.createElement('canvas'), resolution = 2, bleed = 10, size = CHUNK * TILE_SIZE;
  c.width = c.height = (size + bleed * 2) * resolution;
  const ctx = c.getContext('2d')!; ctx.scale(resolution, resolution); ctx.translate(bleed, bleed);
  ctx.fillStyle = scene.outdoors ? colors.grass : colors.void; ctx.fillRect(-bleed, -bleed, size + bleed * 2, size + bleed * 2);
  ctx.save(); ctx.translate(-cx * size, -cy * size);
  for (const [kind, path] of groundContours(scene)) {
    ctx.fillStyle = colors[kind]; ctx.fill(path);
    if (scene.outdoors && kind !== 'woodFloor' && kind !== 'tilled') { ctx.strokeStyle = colors[kind]; ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.globalAlpha = .30; ctx.stroke(path); ctx.globalAlpha = 1; }
  }
  ctx.restore();
  for (let y = -1; y <= CHUNK; y++) for (let x = -1; x <= CHUNK; x++) paintGround(ctx, scene, cx * CHUNK + x, cy * CHUNK + y, x * TILE_SIZE, y * TILE_SIZE);
  groundCache.set(key, c);
  if (groundCache.size > 72) groundCache.delete(groundCache.keys().next().value!);
  return c;
}
function fire(ctx: CanvasRenderingContext2D, time: number) {
  line(ctx, [-12, 1, 11, -4], '#635041', 5); line(ctx, [-10, -5, 12, 3], '#4b453a', 4);
  for (let n = 0; n < 3; n++) {
    const phase = time * (6.2 + n * .83) + n * 2.3;
    const width = 7 - n * 1.4, height = 19 + Math.sin(phase) * 3 + Math.cos(phase * .61) * 2;
    const tip = Math.sin(phase * .48) * 4 + n - 1;
    ctx.beginPath(); ctx.moveTo(-width, 0); ctx.bezierCurveTo(-width - 4, -height * .42, tip - 5, -height * .5, tip, -height);
    ctx.bezierCurveTo(tip + 1, -height * .42, width + 4, -height * .35, width, 0); ctx.closePath(); ctx.fillStyle = ['#a5744e', '#bd935c', '#d2b071'][n]; ctx.fill();
  }
  if (sceneryDebris) for (let n = 0; n < 5; n++) {
    const age = (time * (10 + n * .7) + n * 13) % 59, sway = Math.sin(time * .7 + n) * age * .16;
    ctx.save(); ctx.globalAlpha *= .6 * (1 - age / 59);
    curve(ctx, n % 2 ? '#be9564' : '#d0b87b', 1.05, -6 + n * 3 + sway, -12 - age, -7 + n * 3 + sway, -15 - age, -5 + n * 3 + sway, -17 - age); ctx.restore();
  }
  for (let n = 0; n < 4; n++) { const age = (time * 8 + n * 15) % 62; blob(ctx, Math.sin(time * .64 + n) * age * .18 + age * .12, -22 - age, 5 + age * .15, 3 + age * .10, `rgba(69,66,57,${.15 * (1 - age / 62)})`, n + 12); }
}
function drawTree(ctx: CanvasRenderingContext2D, o: WorldObject, time: number, fade: number) {
  const willow = o.kind === 'willow', variant = o.variant || 0, seed = o.x * 23 + o.y * 17;
  const sway = Math.sin(time * .6 + o.x) * 2;
  shadow(ctx, 12, 5, willow ? 31 : 23, 8, .18);
  shape(ctx, [-6, 3, -4, -39, -8, -52, -1, -44, 4, -66, 7, -63, 5, -38, 8, 3], '#8b806b', '#55594b', 1.8);
  line(ctx, [-2, 1, -1, -26, 3, -43], 'rgba(210,189,157,.55)', 2, true);
  curve(ctx, '#6b6657', 2.6, 1, -33, -13, -37, -20, -52); curve(ctx, '#6b6657', 2.1, 4, -39, 22, -45, 25, -65);
  curve(ctx, '#5b6250', 2, -4, 1, -10, 3, -13, 5); curve(ctx, '#5b6250', 2, 5, 1, 13, 5, 18, 4);
  ctx.save(); ctx.globalAlpha *= fade; ctx.translate(sway, 0);
  const leaf = (x: number, y: number, rx: number, ry: number, fill: string, n: number) => {
    blob(ctx, x, y, rx, ry, fill, seed + n, true); hatch(ctx, x - rx * .7, y - ry * .6, rx * 1.4, ry * 1.2, seed + n, 'rgba(47,58,38,.20)', 8);
    for (let i = 0; i < 4; i++) { const xx = x - rx * .55 + i * rx * .36, yy = y - ry * .16 + noise(i + n, seed) * ry * .5; curve(ctx, 'rgba(190,192,152,.25)', 3.4, xx, yy, xx + 7, yy - 9, xx + 14, yy - 2); }
  };
  if (willow) {
    leaf(0, -69, 27, 18, '#8c9376', 1); leaf(-21, -51, 18, 19, '#7c886e', 3); leaf(21, -54, 20, 22, '#76836b', 5);
  } else if (variant === 1) {
    shape(ctx, [-28, -27, -19, -46, -22, -47, -10, -68, -14, -67, 1, -94, 10, -68, 7, -65, 22, -47, 18, -45, 29, -26], '#737e68', '#4e5948', 1.7);
    for (let n = 0; n < 6; n++) curve(ctx, n % 2 ? 'rgba(167,174,136,.30)' : 'rgba(44,57,38,.23)', 3, -18 + n * 5, -39 - n * 6, 0, -49 - n * 6, 14 - n, -33 - n * 7);
  } else if (variant === 2) {
    leaf(-8, -79, 18, 20, '#91937c', 7); leaf(14, -62, 20, 17, '#808970', 9); leaf(-16, -51, 18, 17, '#78826a', 11);
    line(ctx, [-2, -24, 0, -74], '#ddd1b5', 4.2, true); hatch(ctx, -5, -68, 8, 37, seed, 'rgba(53,58,47,.32)', 6);
  } else {
    leaf(-15, -59, 21, 22, '#7d856c', 13); leaf(11, -72, 24, 20, '#92977c', 17); leaf(20, -46, 22, 18, '#737f66', 19); leaf(-12, -39, 21, 19, '#828b70', 21);
    scribble(ctx, -24, -65, 48, 14, seed, 'rgba(42,55,36,.23)');
  }
  ctx.restore();
}
function trailerWindow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number) {
  panel(ctx, x - 3, y - 3, w + 6, h + 6, '#8b8774', seed);
  panel(ctx, x, y, w, h, '#747e77', seed + 1);
  shape(ctx, [x + 2, y + 2, x + w - 1, y + 4, x + w - 4, y + h - 2, x + 3, y + h - 4], 'rgba(200,198,169,.29)', '', 0);
  curve(ctx, 'rgba(216,211,182,.49)', 2.5, x + 3, y + 3, x + w * .35, y + h * .4, x + w - 4, y + h - 3);
  line(ctx, [x + w * .48, y + 1, x + w * .5, y + h], '#65685b', 1, true);
  line(ctx, [x - 3, y + 2, x + 7, y + 4], '#c2b492', 4, true); line(ctx, [x + w - 5, y + h - 1, x + w + 5, y + h + 1], '#c2b492', 4, true);
  curve(ctx, 'rgba(54,56,47,.5)', .75, x + w * .6, y + 2, x + w * .4, y + h * .45, x + w * .72, y + h - 2);
}
function drawBuilding(ctx: CanvasRenderingContext2D, o: WorldObject, time: number) {
  const w = (o.width || 5) * 32, h = (o.height || 4) * 32, variant = o.variant || 0, seed = o.x * 13 + o.y * 37;
  const civic = variant > 0, front = h * .57, segments = civic ? Math.max(2, Math.min(5, Math.ceil(w / 220))) : 1;
  const cladding = variant === 4 ? '#a99b96' : variant === 3 ? '#a88d82' : variant === 2 ? '#a0a397' : ['#ad9b86', '#a4a08b', '#a98d81', '#999f90'][Math.floor(noise(8, seed) * 4)];
  shadow(ctx, w / 2 + 18, h + 10, w / 2 + 12, 21, .24);
  // Worn tyres and salvaged concrete blocks visibly carry the whole improbable structure.
  for (const xx of [w * .17, w * .78]) { blob(ctx, xx, h - 6, 14, 19, '#4f5046', seed + xx, true); blob(ctx, xx, h - 6, 6, 8, '#888675', seed + xx + 2, true); }
  for (const xx of [8, w * .37, w * .63, w - 28]) { panel(ctx, xx, h - 8, 23, 17, '#909184', seed + xx); line(ctx, [xx + 3, h + 3, xx + 20, h + 4], '#5f6558', 1, true); }
  panel(ctx, 0, 21, w, h - 24, cladding, seed);
  for (let xx = 10; xx < w - 5; xx += 14) curve(ctx, 'rgba(81,79,65,.21)', .9, xx, front - 3, xx + 2, h - 27, xx - 1, h - 4);
  for (let y = front + 14; y < h - 6; y += 18) curve(ctx, 'rgba(212,200,171,.20)', 2.3, 4, y, w / 2, y + 3, w - 3, y - 1);
  for (let n = 0; n < 6; n++) {
    const xx = noise(n + 6, seed) * (w - 25), yy = front + 12 + noise(n + 20, seed) * Math.max(10, h - front - 24);
    blob(ctx, xx, yy, 6 + noise(n + 1, seed) * 18, 5 + noise(n + 2, seed) * 17, 'rgba(130,84,62,.15)', n + seed); hatch(ctx, xx - 6, yy - 3, 17, 8, seed + n, 'rgba(100,60,44,.22)', 4);
  }
  for (let n = 0; n < segments; n++) {
    const sw = w / segments, xx = n * sw;
    shape(ctx, [xx - 2, 24, xx + 12, 10 + noise(n, seed) * 5, xx + sw - 10, 13, xx + sw + 2, 27, xx + sw - 1, front + 5, xx - 2, front - 1], '#8b8c80', INK, 1.9);
    for (let y = 28; y < front - 4; y += 11) curve(ctx, 'rgba(54,61,51,.26)', 1.6, xx + 3, y, xx + sw / 2, y + 3.5, xx + sw - 4, y - 1);
    for (let k = 0; k < 6; k++) {
      const px = xx + 9 + noise(k + n * 9, seed) * Math.max(12, sw - 40), py = 18 + noise(k + 9, seed) * Math.max(12, front - 38);
      curve(ctx, 'rgba(185,171,142,.21)', 7, px, py, px + 14, py + 6, px + 29, py - 2);
    }
    shape(ctx, [xx + sw * .2, front * .28, xx + sw * .54, front * .26, xx + sw * .53, front * .63, xx + sw * .24, front * .6], '#8c8275', 'rgba(55,56,45,.46)', .9);
    hatch(ctx, xx + sw * .22, front * .3, sw * .25, front * .3, seed + n, 'rgba(71,67,56,.24)', 9);
  }
  // A roof repair which was never intended to become permanent.
  const tarpX = w * .64;
  shape(ctx, [tarpX, 19, w - 12, 18, w + 9, front + 15, tarpX - 10, front + 9], '#777c6d', '#555e4f', 1);
  for (let n = 0; n < 4; n++) curve(ctx, 'rgba(186,188,157,.23)', 3.8, tarpX + n * 13, 25, tarpX + n * 16 - 10, front * .6, tarpX + n * 18 - 8, front + 6);
  const doorW = civic ? 37 : 27, doorH = Math.max(33, Math.min(67, h - front - 10));
  panel(ctx, w / 2 - doorW / 2 - 5, h - doorH - 6, doorW + 10, doorH + 6, '#9b927c', seed + 61);
  panel(ctx, w / 2 - doorW / 2, h - doorH - 2, doorW, doorH, '#545a50', seed + 62);
  line(ctx, [w / 2 + doorW / 2 - 6, h - 20, w / 2 + doorW / 2 - 6, h - 15], '#b8a37d', 2.7, true);
  for (let xx = 19; xx < w - 34; xx += civic ? 77 : 63) if (Math.abs(xx + 13 - w / 2) > doorW * .8) trailerWindow(ctx, xx, front + 14, civic ? 35 : 27, Math.min(31, h - front - 27), seed + xx);
  shape(ctx, [w / 2 - 23, h - 1, w / 2 + 23, h + 1, w / 2 + 27, h + 8, w / 2 - 27, h + 7], '#8f8876', INK, 1);
  shape(ctx, [w / 2 - 29, h + 7, w / 2 + 27, h + 8, w / 2 + 30, h + 14, w / 2 - 32, h + 13], '#aaa08a', INK, .9);
  const pipeX = w * .16;
  panel(ctx, pipeX, -7, 15, 32, '#8c8978', seed + 8); line(ctx, [pipeX - 3, -8, pipeX + 18, -7], '#5e6055', 3);
  if (time > 0) for (let n = 0; n < 3; n++) { const age = (time * 6 + n * 19) % 68; blob(ctx, pipeX + 7 + age * .22 + Math.sin(time + n) * 4, -13 - age, 5 + age * .11, 3 + age * .11, `rgba(76,74,64,${.18 * (1 - age / 68)})`, n + seed); }
  // The extensions are hung from poles with string, not newly constructed fantasy architecture.
  if (!civic) {
    shape(ctx, [-12, front + 3, w * .27, front + 1, w * .28, front + 27, -20, front + 30], '#a1987f', INK, 1.2);
    line(ctx, [-15, front + 28, -13, h + 8], '#69664f', 2.4); line(ctx, [w * .26, front + 25, w * .27, h + 3], '#6e6854', 2.1);
    line(ctx, [-8, front + 8, w * .22, front + 15], 'rgba(220,207,167,.30)', 5, true);
    panel(ctx, w - 21, h - 28, 18, 20, '#84725a', seed + 91); curve(ctx, '#686351', 1, -9, h - 10, -28, h + 3, -30, h + 19);
  }
  if (!civic) {
    // A bicycle without a chain, a door kept for firewood, and washing that never quite dries.
    const bx = w - 18, by = h + 5;
    ctx.strokeStyle = '#66664f'; ctx.lineWidth = 1.1;
    for (const xx of [bx - 14, bx + 10]) { ctx.beginPath(); ctx.ellipse(xx, by, 7, 8, -.12, 0, Math.PI * 2); ctx.stroke(); }
    line(ctx, [bx - 14, by, bx - 6, by - 12, bx + 1, by, bx - 14, by, bx - 1, by - 8, bx + 10, by], '#806f5a', 1.2);
    line(ctx, [bx - 7, by - 12, bx - 12, by - 13], '#514f42', 1.4); line(ctx, [bx + 9, by, bx + 5, by - 16, bx + 10, by - 18], '#6d6c53', 1.1);
    shape(ctx, [8, h - 21, 27, h - 25, 30, h + 3, 12, h + 6], '#a2987e', '#666250', 1.1);
    line(ctx, [14, h - 19, 27, h - 20, 26, h - 10, 14, h - 8, 14, h - 19], '#7c775f', .8, true);
    curve(ctx, '#646650', .75, -8, front + 25, -3, front + 47, w * .28, front + 35);

  }
  // Public offices are caravan colonies. Her Ladyship adds a painted, scaffold-supported facade.
  if (variant === 4) {
    for (const xx of [9, w - 94]) {
      shape(ctx, [xx, h - 6, xx + 4, -32, xx + 74, -35, xx + 81, h - 6], '#a89990', '#595a50', 2.6);
      for (let y = -18; y < h - 15; y += 27) curve(ctx, 'rgba(96,80,69,.25)', 1.4, xx + 8, y, xx + 45, y + 3, xx + 72, y - 1);
      shape(ctx, [xx - 8, -31, xx - 8, -57, xx + 6, -60, xx + 8, -43, xx + 20, -42, xx + 21, -60, xx + 37, -61, xx + 40, -43, xx + 55, -44, xx + 56, -60, xx + 73, -58, xx + 76, -41, xx + 88, -40, xx + 89, -30], '#988c83', '#57594f', 2.3);
      trailerWindow(ctx, xx + 28, 29, 23, 40, seed + xx);
      line(ctx, [xx - 11, -50, xx - 14, h + 10], '#747b6b', 2.4); line(ctx, [xx + 91, -45, xx + 89, h + 8], '#747b6b', 2.4);
      for (let y = -30; y < h; y += 38) line(ctx, [xx - 13, y, xx + 90, y + 3], '#707866', 1.4, true);
      line(ctx, [xx - 13, 4, xx + 89, 124, xx - 13, 250, xx + 89, h - 9], '#77806b', 1.3, true);
      hatch(ctx, xx + 10, 80, 52, Math.min(200, h - 90), seed + xx, 'rgba(74,63,52,.25)', 29);
    }
    for (const xx of [w * .28, w * .7]) {
      shape(ctx, [xx, front + 14, xx + 26, front + 12, xx + 21 + Math.sin(time) * 2, h - 37, xx + 4, h - 29], '#987b75', '#6c5e57', 1);
      scribble(ctx, xx + 6, front + 20, 14, 60, seed + xx, '#b3a28a');
    }
  }
  if (variant === 2) { line(ctx, [w / 2 - 13, 36, w / 2 + 12, 37], '#c8c9b1', 6); line(ctx, [w / 2, 24, w / 2 + 1, 49], '#c8c9b1', 6); }
  if (o.label) {
    const text = o.label.replace('Library of ', '').replace('Hospital for Those ', 'Hospital: '), lw = Math.min(w - 18, Math.max(98, text.length * 6));
    panel(ctx, w / 2 - lw / 2, front - 15, lw, 21, '#c0b294', seed + 48);
    ctx.save(); ctx.translate(w / 2, front - 4); ctx.rotate(-.008); ctx.font = '11px "Patrick Hand", "DM Sans", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#46463a'; ctx.fillText(text, 0, 0); ctx.restore();
    scribble(ctx, w * .11, h - 38, Math.min(54, w * .14), 17, seed, 'rgba(78,64,58,.32)');
  }
  curve(ctx, '#51574b', .95, -23, front + 19, w / 2, front + 59, w + 35, front + 21);
}
function drawObject(ctx: CanvasRenderingContext2D, o: WorldObject, time: number, fade = 1) {
  const v = o.variant || 0, seed = o.x * 29 + o.y * 73, w = (o.width || 1) * 32, h = (o.height || 1) * 32;
  switch (o.kind) {
    case 'tree': case 'willow': drawTree(ctx, o, time, fade); break;
    case 'building': drawBuilding(ctx, o, time); break;
    case 'rock': case 'ore':
      shadow(ctx, 5, 4, 17, 5, .19); blob(ctx, -1, -7, 16, 11, '#8b9084', seed, true); shape(ctx, [-13, -9, -5, -20, 6, -17, 13, -7, 2, -5], '#a8a895', 'rgba(66,72,58,.36)', 1); hatch(ctx, -10, -15, 23, 17, seed, 'rgba(71,76,64,.30)', 8);
      if (o.kind === 'ore') { blob(ctx, -5, -13, 4, 3, '#a7a29b', seed); blob(ctx, 6, -8, 4, 2, '#b7aea0', seed + 1); line(ctx, [-6, -13, -3, -9, 3, -10, 7, -6], '#767686', 1.8); } break;
    case 'flower': {
      const sway = wind(o.x, o.y, time) * 3;
      curve(ctx, '#747d5e', 1.4, 0, 2, -2, -7, sway, -14);
      curve(ctx, '#868c69', 1.9, 0, -5, -7, -8, -7, -5); curve(ctx, '#777f5d', 1.7, 0, -8, 5, -11, 7, -8);
      const c = ['#bca489', '#b2988b', '#a2aaa0', '#c4ba9d'][v % 4];
      for (let i = 0; i < 5; i++) blob(ctx, sway + Math.cos(i * 1.256) * 3, -15 + Math.sin(i * 1.256) * 2.5, 2.6, 2.1, c, seed + i);
      blob(ctx, sway, -15, 1.4, 1.3, '#967f5c', seed); break;
    }
    case 'bush': shadow(ctx, 3, 3, 16, 5, .15); blob(ctx, 0, -9, 17, 12, '#7f896c', seed, true); hatch(ctx, -13, -16, 25, 17, seed, 'rgba(53,65,39,.23)', 9); scribble(ctx, -11, -14, 23, 12, seed); if (v % 2) { blob(ctx, -6, -11, 2, 2, '#a1887b', seed); blob(ctx, 7, -8, 2, 2, '#a1887b', seed + 1); } break;
    case 'crop': {
      const bend = wind(o.x, o.y, time) * 3.5;
      curve(ctx, '#727e5c', 2, 0, 3, -3 + bend * .4, -7, 2 + bend, -16);
      ctx.save(); ctx.translate(bend * .7, 0); ctx.rotate(bend * .016);
      blob(ctx, -6, -7, 6, 2.5, '#8b9671', seed, true); blob(ctx, 6, -13, 7, 3, '#929b74', seed + 1, true); ctx.restore();
      blob(ctx, -1, 0, 6, 4, v % 2 ? '#b49f6c' : '#b7946e', seed + 2, true); break;
    }
    case 'reed':
      if (v === 8) { curve(ctx, '#8a9070', 3.5, -14, 3, 8, -2, 13, 4); curve(ctx, '#a1aa7f', 2.6, -10, -2, -16, -17, 1, -8); curve(ctx, '#899771', 2.1, 1, -8, 10, -13, 7, 0); break; }
      for (let i = 0; i < 5; i++) { const xx = -7 + i * 3.3, sway = wind(o.x + i * .8, o.y, time) * (3 + i * .15), hh = 16 + noise(i, seed) * 17; curve(ctx, '#7a8567', 1.2, xx, 5, xx + sway * 2, -hh / 2, xx + sway, -hh); blob(ctx, xx + sway, -hh, 1.7, 5, '#a19878', seed + i, true); } break;
    case 'campfire':
      shadow(ctx, 0, 4, 17, 6, .19); for (let n = 0; n < 6; n++) { const a = n / 6 * Math.PI * 2; blob(ctx, Math.cos(a) * 14, Math.sin(a) * 6 + 2, 4, 3, '#9c9a87', seed + n, true); } fire(ctx, time + noise(5, seed) * 13); break;
    case 'lantern':
      shadow(ctx, 3, 3, 7, 3, .15); curve(ctx, '#636b58', 2.5, 0, 5, 2, -18, -1, -36); curve(ctx, '#666c59', 1.6, -1, -35, -3, -43, 6, -38);
      panel(ctx, 0, -35, 9, 14, '#a39d79', seed); blob(ctx, 4, -28, 3, 5, '#c6b58b', seed + 1); line(ctx, [0, -21, 9, -21], '#535b4e', 1.7); break;
    case 'bench':
      shadow(ctx, 3, 4, 21, 6, .19); line(ctx, [-15, -8, -14, 6], '#6b624d', 3.8); line(ctx, [15, -7, 15, 6], '#6b624d', 3.8);
      panel(ctx, -21, -13, 42, 8, '#a29272', seed); panel(ctx, -20, -28, 40, 8, '#97876b', seed + 1); line(ctx, [-15, -23, -15, -9], '#696149', 2.4); line(ctx, [14, -23, 14, -10], '#696149', 2.6); hatch(ctx, -17, -26, 33, 21, seed, 'rgba(62,57,44,.30)', 7); break;
    case 'workbench':
      shadow(ctx, 2, 3, 24, 6, .2); line(ctx, [-17, -10, -18, 7], '#645c48', 5); line(ctx, [17, -12, 16, 7], '#645c48', 4.6);
      panel(ctx, -24, -26, 48, 17, '#a49475', seed); hatch(ctx, -23, -25, 47, 14, seed, 'rgba(66,56,43,.25)', 13); line(ctx, [-12, -30, 0, -29], '#676e60', 3); line(ctx, [8, -31, 9, -20], '#726b55', 2); blob(ctx, 10, -31, 5, 2, '#9d9e87', seed + 2, true); scribble(ctx, -19, -23, 24, 9, seed); break;
    case 'well':
      shadow(ctx, 3, 3, 22, 8, .2); panel(ctx, -20, -20, 40, 28, '#8e9281', seed); blob(ctx, 0, -21, 21, 7, '#aaa68e', seed + 1, true); blob(ctx, 0, -21, 13, 3, '#535f56', seed + 2); line(ctx, [-22, -42, -22, 3], '#756e57', 4); line(ctx, [23, -42, 24, 3], '#756e57', 3.6);
      shape(ctx, [-29, -41, -17, -49, 18, -48, 31, -39], '#9a9077', INK, 1.2); curve(ctx, '#c0b08a', 1.4, 2, -38, -1, -29, 2, -19); hatch(ctx, -18, -14, 34, 21, seed, 'rgba(48,59,43,.20)', 9); break;
    case 'sign':
      line(ctx, [-1, 4, -2, -24], '#776c55', 4);
      if (v === 1) {
        panel(ctx, -31, -69, 63, 49, '#b6aa8e', seed); panel(ctx, -27, -65, 55, 35, '#a39489', seed + 1);
        drawActorSprite(ctx, 'lady', 0, -28, Math.PI / 2, false, 0, 0, .61, undefined, { reducedMotion: true, billboard: true });
        panel(ctx, -27, -30, 55, 8, '#c8b79a', seed + 3, false); ctx.font = '8px "Patrick Hand", sans-serif'; ctx.fillStyle = '#5f5347'; ctx.textAlign = 'center'; ctx.fillText('BE DIVINE', 0, -24); hatch(ctx, -27, -65, 55, 35, seed, 'rgba(232,218,183,.21)', 14);
      } else if (v === 2) {
        line(ctx, [-23, -83, 23, -81], '#918674', 3);
      } else { panel(ctx, -24, -43, 48, 24, '#b7a88a', seed); scribble(ctx, -18, -38, 32, 11, seed); line(ctx, [-18, -24, 15, -26], '#918265', .8, true); }
      break;
    case 'crate': case 'chest':
      shadow(ctx, 3, 4, 16, 6, .18); panel(ctx, -16, -17, 33, 24, '#958163', seed); shape(ctx, [-16, -17, -10, -23, 14, -22, 18, -16], '#b0a080', INK, 1.3); line(ctx, [-9, -16, -8, 5], '#6c6550', 2.6); line(ctx, [10, -16, 10, 5], '#6c6550', 2.6); panel(ctx, -2, -10, 5, 7, '#bbaa83', seed + 1); hatch(ctx, -13, -17, 29, 22, seed, 'rgba(65,58,45,.24)', 9); break;
    case 'fence':
      line(ctx, [-16, -16, 16, -18], '#a09172', 4); line(ctx, [-16, -6, 15, -4], '#8c7b60', 3); line(ctx, [-12, 4, -14, -23], '#8b7c62', 4); line(ctx, [12, 4, 10, -24], '#968468', 3.6); line(ctx, [-14, -19, -12, -3, 11, -13, 12, -23], 'rgba(71,65,46,.30)', .6, true); break;
    case 'grave':
      shadow(ctx, 3, 4, 14, 5, .18); panel(ctx, -11, -30, 22, 34, '#9c9c8c', seed); line(ctx, [-8, -11, 7, -13], '#757b6d', .9, true); scribble(ctx, -7, -24, 15, 10, seed, 'rgba(62,67,54,.30)'); blob(ctx, 1, 3, 16, 4, '#82896d', seed + 1); break;
    case 'altar':
      panel(ctx, -20, -6, 40, 13, '#8f9181', seed); panel(ctx, -15, -14, 30, 10, '#b0a68c', seed + 1);
      if (v === 2) { panel(ctx, -10, -80, 20, 64, '#a7a795', seed + 2); panel(ctx, -16, -87, 32, 8, '#b8b09a', seed + 3); line(ctx, [-5, -79, -4, -18], '#c5bfa9', 3, true); hatch(ctx, -8, -72, 17, 55, seed, 'rgba(72,75,60,.15)', 9); }
      else if (v === 1) { drawActorSprite(ctx, 'lady', 0, -16, Math.PI / 2, false, 0, 0, 1, '#aaa494'); }
      else if (v === 3) { panel(ctx, -15, -37, 29, 22, '#a89c89', seed + 3); panel(ctx, -7, -59, 23, 22, '#b7a193', seed + 4); panel(ctx, -16, -70, 14, 18, '#9c8f85', seed + 5); }
      else if (v === 4) { panel(ctx, -14, -44, 28, 30, '#828e82', seed + 3); shape(ctx, [-12, -41, 10, -40, 11, -18, -11, -18], 'rgba(190,195,170,.32)', '', 0); blob(ctx, 0, -30 + Math.sin(time) * 1.5, 4, 3, '#bca87c', seed + 4, true); }
      else { panel(ctx, -12, -34, 24, 20, '#8c8b82', seed + 3); blob(ctx, 0, -34, 8, 3, '#50584f', seed + 4); } break;
    case 'bed':
      panel(ctx, 0, 0, w, h, '#8f8069', seed); panel(ctx, 4, 5, w - 8, h - 12, '#b9b3a0', seed + 1); panel(ctx, 6, h * .3, w - 12, h * .61, '#8d9786', seed + 2); panel(ctx, 8, 8, w - 16, 18, '#c7bfaa', seed + 3);
      for (let xx = 11; xx < w - 6; xx += 9) curve(ctx, 'rgba(189,187,158,.32)', 2, xx, h * .35, xx + 4, h * .65, xx - 1, h - 13);
      hatch(ctx, 8, h * .4, w - 16, h * .45, seed, 'rgba(48,69,48,.15)', 13); line(ctx, [0, h - 7, w, h - 8], '#6b6150', 4); break;
    case 'bookshelf':
      panel(ctx, 0, -31, w, 52, '#756852', seed);
      for (let row = 0; row < 2; row++) { for (let xx = 6; xx < w - 6; xx += 8) { const hh = 13 + noise(xx + row, seed) * 5, c = ['#9b8176', '#89917d', '#b1a07e', '#8c938e'][Math.floor(noise(xx + row * 11, seed) * 4)]; panel(ctx, xx, -23 + row * 23, 5 + noise(xx, seed) * 2, hh, c, seed + xx + row, false); line(ctx, [xx, -19 + row * 23, xx + 5, -20 + row * 23], '#c3b498', .65, true); } line(ctx, [1, -4 + row * 24, w - 1, -3 + row * 24], '#ae9874', 3); }
      hatch(ctx, 0, -31, w, 51, seed, 'rgba(57,48,37,.16)', 8); break;
    case 'table':
      line(ctx, [7, h - 7, 7, h + 6], '#6c614d', 6); line(ctx, [w - 7, h - 7, w - 7, h + 6], '#6c614d', 5); panel(ctx, 0, -9, w, h, '#a18b6b', seed);
      if (v === 1) { panel(ctx, 5, -4, w - 10, h - 12, '#7c8a72', seed + 1); panel(ctx, w / 2 - 6, h / 2 - 7, 13, 11, '#c7b99b', seed + 2); }
      else { shape(ctx, [10, 0, 31, -1, 30, 15, 12, 14], '#c6bba1', 'rgba(93,83,61,.3)', .6); scribble(ctx, 14, 4, 12, 6, seed); blob(ctx, w - 16, 9, 5, 5, '#7f7460', seed, true); }
      hatch(ctx, 3, -7, w - 6, h - 3, seed, 'rgba(77,59,39,.16)', 12); break;
    case 'rug':
      shape(ctx, [0, 1, w, -1, w - 3, h, 1, h + 2], '#9e8c7b', 'rgba(77,61,50,.44)', 1.5); line(ctx, [5, 5, w - 6, 4, w - 7, h - 6, 7, h - 5, 5, 5], '#b7a68a', 2.2, true);
      for (let y = 16; y < h - 8; y += 21) scribble(ctx, 11, y, w - 20, 11, seed + y, 'rgba(103,75,61,.23)'); hatch(ctx, 3, 3, w - 6, h - 6, seed, 'rgba(72,54,40,.14)', 18); break;
    case 'window': trailerWindow(ctx, -11, -35, 23, 29, seed); line(ctx, [-16, -4, 16, -5], '#aba18b', 3); break;
    case 'portrait':
      panel(ctx, -21, -53, 42, 48, '#958166', seed); panel(ctx, -17, -49, 34, 40, '#aa928a', seed + 1);
      drawActorSprite(ctx, 'lady', 1, -10, Math.PI / 2, false, 0, time, .74);
      scribble(ctx, -17, -44, 33, 21, seed, 'rgba(209,190,151,.18)'); hatch(ctx, -18, -48, 36, 39, seed, 'rgba(74,58,45,.18)', 13); break;
    case 'machine':
      shadow(ctx, 3, 4, 22, 7, .22); panel(ctx, -21, -32, 42, 37, '#939a8a', seed); panel(ctx, -16, -30, 32, 24, '#5e726b', seed + 1);
      if (v === 2) { panel(ctx, -13, -27, 26, 19, '#83968c', seed + 2, false); drawActorSprite(ctx, 'lady', 0, -9, Math.PI / 2, false, 0, time, .46); curve(ctx, 'rgba(178,193,166,.18)', .8, -12, -18 + Math.sin(time * 3) * 6, 0, -18 + Math.sin(time * 3) * 6, 12, -17 + Math.sin(time * 3) * 6); }
      else { scribble(ctx, -13, -26, 26, 15, seed, '#a9b196'); blob(ctx, -7, -12, 2, 2, '#b39e73', seed); blob(ctx, 7, -12, 2, 2, '#a3ab84', seed + 1); }
      curve(ctx, '#4c5a4e', 1.6, -18, 0, -38, 14, -25, 19); curve(ctx, '#6b6955', 1.3, 19, -4, 35, 0, 33, 13); line(ctx, [-10, 1, -9, 7], '#595e50', 2); line(ctx, [10, 1, 10, 7], '#595e50', 2); hatch(ctx, -19, -32, 37, 36, seed, 'rgba(37,48,35,.16)', 9); break;
    case 'gate': case 'portal': {
      const portal = o.kind === 'portal', gh = Math.max(h, 110);
      for (const xx of [0, w - 24]) { panel(ctx, xx, 0, 24, gh, '#979b87', seed + xx); line(ctx, [xx + 5, 5, xx + 5, gh - 4], '#bebca2', 3, true); hatch(ctx, xx + 4, 8, 16, gh - 14, seed + xx, 'rgba(65,75,51,.28)', 14); }
      panel(ctx, -6, -16, w + 12, 21, '#a4a089', seed + 11); scribble(ctx, 9, -12, w - 19, 10, seed, 'rgba(61,63,49,.35)');
      if (portal) { const glow = ctx.createLinearGradient(0, 0, 0, gh); glow.addColorStop(0, 'rgba(196,196,168,.28)'); glow.addColorStop(1, 'rgba(175,186,159,0)'); ctx.fillStyle = glow; ctx.fillRect(25, 3, w - 50, gh); for (let n = 0; n < 5; n++) curve(ctx, 'rgba(208,200,165,.25)', .65, 34 + n * 19, gh, 34 + n * 19 + Math.sin(time + n) * 8, gh / 2, 34 + n * 19, 4); }
      else { for (let xx = 33; xx < w - 25; xx += 17) curve(ctx, '#626d5e', 2, xx, 12, xx + 2, gh / 2, xx - 1, gh - 3); line(ctx, [25, gh * .48, w - 25, gh * .48 + 2], '#737c69', 2.8); for (let xx = 37; xx < w - 31; xx += 37) curve(ctx, 'rgba(49,57,43,.45)', .75, xx, 8, xx + 12, gh / 2, xx + 34, gh - 6); }
      if (o.label) { ctx.font = '12px "Patrick Hand", sans-serif'; ctx.fillStyle = '#4d5042'; ctx.textAlign = 'center'; ctx.fillText(portal ? 'INFINITE TIME' : o.variant === 1 ? 'GREAT CASTLE DIVINE' : 'UNENTERABLE', w / 2, -2); } break;
    }
  }
}
function secondaryScenery(ctx: CanvasRenderingContext2D, o: WorldObject, time: number, reducedMotion: boolean) {
  const seed = o.x * 29 + o.y * 73, phase = noise(3, seed) * 15, gust = reducedMotion ? 0 : wind(o.x, o.y, time);
  if (o.kind === 'willow') {
    for (let n = 0; n < 15; n++) {
      const xx = -34 + n * 4.7, yy = -56 + noise(n, seed) * 13, length = 19 + noise(n + 14, seed) * 35;
      const pull = gust * (5 + n % 4) + (reducedMotion ? 0 : Math.sin(time * 1.5 + n * .4 + phase) * 1.7);
      curve(ctx, n % 2 ? '#64745e' : '#889277', 1.35 + noise(n + 8, seed), xx, yy, xx + pull * .55, yy + length * .66, xx + pull, yy + length);
      for (let k = 1; k < 4; k++) {
        const y = yy + k * length / 4, x = xx + pull * k / 4;
        curve(ctx, '#8b9577', 1.7, x, y, x + 4 + gust, y + 3, x + 3 + gust, y + 7);
      }
    }
  } else if (o.kind === 'tree' && o.variant !== 1) {
    // Fine branches flex independently of the broad painted silhouette.
    for (let n = 0; n < 3; n++) {
      const side = n % 2 ? -1 : 1, baseX = side * (4 + n * 2), endX = side * (23 - n * 3) + gust * (3 + n);
      curve(ctx, 'rgba(78,87,64,.59)', 1.1, baseX, -39 - n * 8, side * 20 + gust * 2, -50 - n * 8, endX, -65 - n * 5);
      curve(ctx, '#92997a', 2.7, endX - 3, -65 - n * 5, endX + gust, -72 - n * 5, endX + 4, -67 - n * 5);
    }
    if (sceneryDebris && !reducedMotion && noise(9, seed) > .58) {
      const age = (time * 4 + phase * 6) % 93, xx = -22 + noise(4, seed) * 42 + Math.sin(age * .13 + phase) * 8 + gust * age * .2;
      const yy = -80 + age, turn = Math.sin(age * .19 + phase);
      curve(ctx, 'rgba(151,145,104,.64)', 2.2, xx - 2.5 * turn, yy - 1, xx, yy + 2, xx + 3 * turn, yy - 1);
    }
  } else if (o.kind === 'building') {
    const w = (o.width || 5) * TILE_SIZE, h = (o.height || 4) * TILE_SIZE, front = h * .57, px = w * .16;
    // Smoke is pulled into wandering ribbons before breaking into translucent charcoal clouds.
    for (let n = 0; n < 5; n++) {
      const age = ((reducedMotion ? 0 : time) * (6.4 + n * .3) + n * 17 + phase) % 91;
      const xx = px + 7 + age * .17 + gust * age * .34 + Math.sin(age * .068 + phase) * 5;
      blob(ctx, xx, -14 - age, 4 + age * .15, 3 + age * .10, `rgba(76,74,64,${.16 * (1 - age / 91)})`, n + seed);
    }
    const tx = w * .64;
    ctx.beginPath(); ctx.moveTo(tx - 10, front + 7); ctx.bezierCurveTo(tx + w * .05, front + 5, w - 15, front + 14 + gust * 3, w + 9, front + 15);
    ctx.lineTo(w + 8 + gust * 2, front + 22 + gust * 3); ctx.bezierCurveTo(w - 13, front + 22 - gust * 3, tx + w * .04, front + 15 + gust * 4, tx - 12 + gust, front + 15); ctx.closePath();
    ctx.fillStyle = '#7a7e6e'; ctx.fill(); ctx.lineWidth = .9; ctx.strokeStyle = '#57604f'; ctx.stroke();
    if (!(o.variant || 0)) {
      const xx = 3 + gust * 3;
      ctx.beginPath(); ctx.moveTo(3, front + 29); ctx.lineTo(13, front + 31); ctx.bezierCurveTo(13 + gust * 2, front + 36, xx + 12, front + 41, xx + 10, front + 49); ctx.quadraticCurveTo(xx + 5, front + 45 + gust, xx, front + 45); ctx.quadraticCurveTo(4 + gust * 2, front + 36, 3, front + 29); ctx.closePath();
      ctx.fillStyle = '#a09b86'; ctx.fill(); ctx.lineWidth = .8; ctx.strokeStyle = '#6c7058'; ctx.stroke(); curve(ctx, 'rgba(199,189,150,.38)', 1, 8, front + 33, 8 + gust * 2, front + 38, xx + 6, front + 44);
    }
  } else if (o.kind === 'lantern') {
    const flicker = reducedMotion ? .5 : .5 + Math.sin(time * 7.3 + phase) * .22 + Math.sin(time * 11.7 + phase * 2) * .12;
    ctx.save(); ctx.globalAlpha *= .6 + flicker * .35; blob(ctx, 4, -28, 2.5, 4.5, '#cbb88b', seed);
    curve(ctx, '#ded0a7', 1.05, 4, -26, 3.5 + gust, -29, 4 + gust * .5, -31 - flicker * 1.2); ctx.restore();
  } else if (o.kind === 'sign' && o.variant === 2) {
    ctx.beginPath(); ctx.moveTo(-18, -80); ctx.lineTo(18, -80); ctx.bezierCurveTo(18 + gust * 2, -60, 14 + gust * 4, -44, 17 + gust * 5, -22);
    ctx.quadraticCurveTo(8 + gust * 3, -25 + gust, 1 + gust * 4, -28); ctx.lineTo(-18 + gust * 4, -23); ctx.bezierCurveTo(-17 + gust * 3, -44, -19 + gust, -64, -18, -80); ctx.closePath();
    ctx.fillStyle = '#9c8176'; ctx.fill(); ctx.strokeStyle = '#6c6658'; ctx.lineWidth = 1; ctx.stroke();
    curve(ctx, 'rgba(184,166,139,.38)', 2, -10, -76, -7 + gust * 2, -54, -11 + gust * 4, -27); scribble(ctx, -11 + gust, -68, 23, 26, seed, '#b8ac8e');
  } else if (o.kind === 'sign' && o.variant === 1) {
    ctx.save(); ctx.beginPath(); ctx.rect(-27, -65, 55, 35); ctx.clip(); ctx.fillStyle = '#a39489'; ctx.fillRect(-27, -65, 55, 35);
    drawActorSprite(ctx, 'lady', 0, -28, Math.PI / 2, false, 0, time, .61, undefined, { reducedMotion, phaseOffset: phase, billboard: true }); ctx.restore();
  } else if (o.kind === 'machine' && o.variant === 2) {
    ctx.save(); ctx.beginPath(); ctx.rect(-13, -28, 26, 22); ctx.clip(); ctx.fillStyle = '#83968c'; ctx.fillRect(-13, -28, 26, 22);
    drawActorSprite(ctx, 'lady', 0, -7, Math.PI / 2, false, 0, time, .35, undefined, { reducedMotion, phaseOffset: phase, billboard: true });
    curve(ctx, 'rgba(176,190,166,.20)', .8, -12, -18 + Math.sin(time * 2 + phase) * 7, 0, -18 + Math.sin(time * 2 + phase) * 7, 12, -17 + Math.sin(time * 2 + phase) * 7); ctx.restore();
  }
}
function drawIllustration(ctx: CanvasRenderingContext2D, o: WorldObject, time: number, fade = 1, reducedMotion = false) {
  if (o.kind === 'campfire' || o.kind === 'reed' || o.kind === 'flower' || o.kind === 'crop') { drawObject(ctx, o, time, fade); return; }
  const key = `${o.id}:${o.kind}:${o.variant}:${o.color}:${o.width}:${o.height}`;
  let art = objectCache.get(key);
  if (!art) {
    const architectural = o.kind === 'building' || o.kind === 'gate' || o.kind === 'portal';
    const furniture = o.kind === 'bed' || o.kind === 'table' || o.kind === 'rug' || o.kind === 'bookshelf';
    const left = architectural ? -62 : furniture ? -8 : -48;
    const top = architectural ? -126 : furniture ? -42 : -111;
    const right = architectural ? (o.width || 1) * TILE_SIZE + 58 : furniture ? (o.width || 1) * TILE_SIZE + 8 : 48;
    const bottom = architectural ? (o.height || 1) * TILE_SIZE + 28 : furniture ? Math.max(28, (o.height || 1) * TILE_SIZE + 15) : 27;
    const width = right - left, height = bottom - top, canvas = document.createElement('canvas'), resolution = 2;
    canvas.width = width * resolution; canvas.height = height * resolution;
    const brush = canvas.getContext('2d')!; brush.scale(resolution, resolution); brush.translate(-left, -top); drawObject(brush, o, 0);
    art = { canvas, left, top, width, height }; objectCache.set(key, art);
    if (objectCache.size > 256) objectCache.delete(objectCache.keys().next().value!);
  } else { objectCache.delete(key); objectCache.set(key, art); }
  ctx.save();
  const gust = reducedMotion ? 0 : wind(o.x, o.y, time);
  if (o.kind === 'tree' || o.kind === 'willow') { ctx.globalAlpha *= fade; ctx.transform(1, 0, gust * .030, 1 - Math.abs(gust) * .003, 0, 0); }
  if (o.kind === 'bush') ctx.transform(1, 0, gust * .016, 1 + Math.sin(time * .6 + o.x) * .009, 0, 0);
  if (o.kind === 'sign' && !o.variant) ctx.rotate(gust * .009);
  ctx.drawImage(art.canvas, art.left, art.top, art.width, art.height);
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
      for (let n = 0; n < 6; n++) { const angle = noise(n, impact.seed) * Math.PI * 2, r = 3 + t * 30; ctx.save(); ctx.globalAlpha *= (1 - t) * .7; line(ctx, [Math.cos(angle) * r, -25 + Math.sin(angle) * r - t * 9, Math.cos(angle) * r + 2, -23 + Math.sin(angle) * r - t * 9], '#baa785', 1.5, true); ctx.restore(); }
    }
  } else if (impact.kind === 'door') {
    ctx.globalAlpha *= (1 - t) * .30; const radius = frame.reducedMotion ? 12 : 10 + t * 20;
    curve(ctx, '#b0a389', 1.4, -radius, 2, 0, -radius * .55, radius, 2);
  } else if (impact.kind === 'build') {
    ctx.globalAlpha *= (1 - t) * .40;
    line(ctx, [-14, 4, -14, -11, -1, -20, 14, -10, 14, 4], '#b1a589', 1.4, true);
    if (sceneryDebris && !frame.reducedMotion) for (let n = 0; n < 5; n++) line(ctx, [-19 + n * 9, 6 - t * 9, -17 + n * 9, 9 - t * 9], '#9f947a', 1.2, true);
  } else if (sceneryDebris) {
    const contactHeight = impact.kind === 'hit' ? -21 : impact.object && ['tree', 'willow'].includes(impact.object.kind) ? -23 : -9;
    const progress = frame.reducedMotion ? .16 : t;
    const shade = impact.kind === 'stone' ? '#9b9d8d' : impact.kind === 'hit' ? '#9e8175' : '#a18e6c';
    ctx.globalAlpha *= (1 - t) * .72;
    for (let n = 0; n < 7; n++) {
      const angle = noise(n + 12, impact.seed) * Math.PI * 2, velocity = 9 + noise(n + 9, impact.seed) * 19;
      const xx = Math.cos(angle) * (3 + velocity * progress), yy = contactHeight + Math.sin(angle) * velocity * progress + 26 * progress * progress;
      if (impact.kind === 'stone') shape(ctx, [xx - 2, yy, xx + 1, yy - 3, xx + 3, yy + 1, xx, yy + 2], shade, 'rgba(64,70,55,.45)', .6);
      else curve(ctx, shade, impact.kind === 'wood' ? 1.8 : 1.3, xx - 2, yy - 1, xx, yy + 1, xx + 3, yy - 2);
    }
    if (impact.kind === 'hit') curve(ctx, 'rgba(87,66,57,.50)', 2.5, -6, contactHeight - 4, 0, contactHeight + 2, 7, contactHeight - 6);
  }
  ctx.restore();
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
      curve(ctx, '#cad0b7', z * .8, p.x + travel * z, p.y, p.x + (14 + travel) * z, p.y - swell * 2.1 * z, p.x + (28 + travel) * z, p.y + .3 * z);
      curve(ctx, '#6c8582', z * .65, p.x + (4 + travel) * z, p.y + 3 * z, p.x + (17 + travel) * z, p.y + (3 - swell) * z, p.x + (24 + travel) * z, p.y + 3.5 * z);
    }
    if (!frame.reducedMotion && worldHash(x + 13, y + 29) > .80) {
      const age = (time * .3 + phase) % 1, radius = (3 + age * 15) * z;
      ctx.globalAlpha = (1 - age) * .17; ctx.strokeStyle = '#c0c7b2'; ctx.lineWidth = .7 * z;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 8 * z, radius, radius * .35, -.12, 0, Math.PI * 2); ctx.stroke();
      if (age > .26) { ctx.beginPath(); ctx.ellipse(p.x, p.y + 8 * z, radius * .62, radius * .21, -.12, 0, Math.PI * 2); ctx.stroke(); }
    }
  }
  ctx.restore();
}
function roomWalls(ctx: CanvasRenderingContext2D, frame: RenderFrame, width: number, height: number) {
  const z = frame.zoom, scale = TILE_SIZE * z, top = position(frame, 1, 1, width, height), rw = (frame.scene.width - 2) * scale;
  panel(ctx, top.x, top.y, rw, scale * 1.3, '#9f9b86', 22);
  for (let xx = top.x + 9; xx < top.x + rw - 4; xx += 27 * z) curve(ctx, 'rgba(74,78,60,.22)', z, xx, top.y + 5, xx + 3, top.y + scale * .6, xx + 1, top.y + scale * 1.25);
  curve(ctx, '#6b7260', 1.3 * z, top.x + 3, top.y + scale * .32, top.x + rw / 2, top.y + scale * .5, top.x + rw - 3, top.y + scale * .28);
  scribble(ctx, top.x + 29 * z, top.y + 12 * z, 86 * z, 10 * z, 61, 'rgba(54,64,43,.30)');
  const bottom = position(frame, 1, frame.scene.height - 1.3, width, height), gap = 2.4 * scale;
  panel(ctx, bottom.x, bottom.y, rw / 2 - gap / 2, scale * .36, '#858b78', 35); panel(ctx, bottom.x + rw / 2 + gap / 2, bottom.y, rw / 2 - gap / 2, scale * .36, '#858b78', 37);
  if (frame.scene.exit) { const p = position(frame, frame.scene.exit.positionInRoom.x, frame.scene.exit.positionInRoom.y, width, height); label(ctx, '↓ Outside', p.x, p.y + 10 * z, '#d1c5a8', '12px "Patrick Hand", sans-serif'); }
}

export function renderWorld(ctx: CanvasRenderingContext2D, frame: RenderFrame, width: number, height: number) {
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#53584d'; ctx.fillRect(0, 0, width, height);
  const { scene, zoom } = frame, scale = TILE_SIZE * zoom, time = frame.reducedMotion ? 0 : frame.time;
  sceneryDebris = frame.particlesEnabled !== false;
  const hw = width / scale / 2 + 2, hh = height / scale / 2 + 2;
  const heldPose = playerToolPose(frame.player.facing, frame.player.moving, frame.player.animation, time, { reducedMotion: frame.reducedMotion, phaseOffset: 0, pace: frame.playerPace || 1, action: frame.player.attacking, hurt: frame.player.hurt });
  const cx1 = Math.max(0, Math.floor((frame.camera.x - hw) / CHUNK)), cx2 = Math.min(Math.floor((scene.width - 1) / CHUNK), Math.floor((frame.camera.x + hw) / CHUNK));
  const cy1 = Math.max(0, Math.floor((frame.camera.y - hh) / CHUNK)), cy2 = Math.min(Math.floor((scene.height - 1) / CHUNK), Math.floor((frame.camera.y + hh) / CHUNK));
  for (let cy = cy1; cy <= cy2; cy++) for (let cx = cx1; cx <= cx2; cx++) {
    const p = position(frame, cx * CHUNK, cy * CHUNK, width, height), c = groundChunk(scene, cx, cy);
    ctx.drawImage(c, 20, 20, CHUNK * 32 * 2, CHUNK * 32 * 2, p.x, p.y, CHUNK * scale, CHUNK * scale);
  }
  drawWater(ctx, frame, width, height, hw, hh, time);
  if (!scene.outdoors) roomWalls(ctx, frame, width, height);
  const visible = frame.objects.filter(o => !frame.harvested[o.id] && onScreen(o, frame, hw, hh));
  for (const o of visible.filter(o => o.kind === 'rug')) { const p = position(frame, o.x, o.y, width, height); ctx.save(); ctx.translate(p.x, p.y); ctx.scale(zoom, zoom); drawIllustration(ctx, o, time, 1, frame.reducedMotion); ctx.restore(); }
  type Entry = { depth: number; object?: WorldObject; actor?: ActorFrame; player?: true; impact?: VisualImpact };
  const entries: Entry[] = visible.filter(o => o.kind !== 'rug').map(o => ({ depth: o.y + ((o.width || 1) >= 2 || (o.height || 1) >= 2 ? (o.height || 1) : 0), object: o }));
  for (const impact of frame.impacts || []) if (impact.destroyed && impact.object && impact.age < .58 && onScreen(impact.object, frame, hw, hh) && !visible.some(o => o.id === impact.object!.id)) {
    const o = impact.object; entries.push({ depth: o.y + ((o.width || 1) >= 2 || (o.height || 1) >= 2 ? (o.height || 1) : 0), object: o, impact });
  }
  for (const a of frame.actors) if (Math.abs(a.x - frame.camera.x) < hw + 2 && Math.abs(a.y - frame.camera.y) < hh + 2 && a.health > 0) entries.push({ depth: a.y, actor: a });
  entries.push({ depth: frame.player.y, player: true }); entries.sort((a, b) => a.depth - b.depth);
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
          curve(ctx, '#6c625e', zoom, -22 * zoom, -9 * zoom, -12 * zoom, -7 * zoom, -3 * zoom, -12 * zoom);
          curve(ctx, '#6c625e', zoom * .7, -26 * zoom, 8 * zoom, -13 * zoom, 7 * zoom, -6 * zoom, 12 * zoom); ctx.restore();
        } else if (!a.moving && !a.hostile) {
          ctx.save(); ctx.globalAlpha = .06 + Math.max(0, Math.sin(time * 1.9 + actorPhase(a.id))) * .10; ctx.strokeStyle = '#8c8170'; ctx.lineWidth = .7 * zoom;
          for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(p.x + side * 8 * zoom, p.y - 37 * zoom, 7 * zoom, side < 0 ? 2.1 : -1.05, side < 0 ? 4.1 : 1.05); ctx.stroke(); } ctx.restore();
        }
      }
      if (!a.hostile && dist < 5.4) { label(ctx, a.name, p.x, p.y - (a.kind === 'lady' ? 70 : a.kind === 'ox' ? 53 : 46) * zoom, a.id === frame.nearby?.id ? '#dbc8a8' : '#dfd7c4', `${Math.max(10, 10 * zoom)}px "Patrick Hand", "DM Sans", sans-serif`); if (frame.flags.includes(`${a.id}_friend`)) { ctx.save(); ctx.fillStyle = '#a7ad86'; ctx.beginPath(); ctx.arc(p.x + 15 * zoom, p.y - 36 * zoom, 2 * zoom, 0, Math.PI * 2); ctx.fill(); ctx.restore(); } }
      else if (a.hostile && dist < 5) { line(ctx, [p.x - 13 * zoom, p.y - 40 * zoom, p.x + 13 * zoom, p.y - 40 * zoom], '#514943', 4 * zoom, true); line(ctx, [p.x - 13 * zoom, p.y - 40 * zoom, p.x - 13 * zoom + Math.min(1, a.health / 42) * 26 * zoom, p.y - 40 * zoom], '#ac8171', 2.5 * zoom, true); }
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
          ctx.save(); ctx.translate(hx, hy); ctx.rotate(sweep); curve(ctx, 'rgba(188,174,141,.38)', 1.5 * zoom, -14 * zoom, -13 * zoom, -6 * zoom, -23 * zoom, 8 * zoom, -15 * zoom); ctx.restore();
        }
      }
    }
  }
  for (const impact of frame.impacts || []) drawImpact(ctx, impact, frame, width, height);
  drawMindExchange(ctx, frame, width, height);
  const pp = position(frame, frame.player.x, frame.player.y, width, height);
  ctx.strokeStyle = 'rgba(203,191,153,.33)'; ctx.lineWidth = zoom; ctx.beginPath(); ctx.ellipse(pp.x, pp.y + 4 * zoom, 12 * zoom, 4.5 * zoom, -.1, 0, Math.PI * 2); ctx.stroke();
  if (frame.fishing) {
    const fishing = frame.fishing, bob = position(frame, fishing.position.x, fishing.position.y, width, height), bite = fishing.phase === 'bite';
    const toss = frame.reducedMotion ? 0 : Math.sin(time * (bite ? 9 : 2.4)) * (bite ? 2.5 : .9), dip = frame.reducedMotion ? 0 : bite ? Math.abs(Math.sin(time * 8)) * 4 : Math.sin(time * 2) * .7;
    let floatX = bob.x + toss * zoom, floatY = bob.y + dip * zoom;
    if (fishing.phase === 'caught') {
      const travel = Math.min(1, fishing.elapsed / .64);
      floatX = frame.reducedMotion ? pp.x + 8 * zoom : bob.x + (pp.x + 8 * zoom - bob.x) * travel;
      floatY = frame.reducedMotion ? pp.y - 23 * zoom : bob.y + (pp.y - 22 * zoom - bob.y) * travel - Math.sin(travel * Math.PI) * 37 * zoom;
      ctx.save(); ctx.translate(floatX, floatY); ctx.rotate(frame.reducedMotion ? 0 : Math.atan2(pp.y - 22 * zoom - bob.y, pp.x - bob.x) + Math.sin(travel * 18) * .19); ctx.scale(zoom, zoom);
      blob(ctx, 0, 0, 8, 3.3, '#a4ad99', 71, true); shape(ctx, [7, 0, 12, -4, 11, 4], '#899888', '#536250', .7); curve(ctx, '#ccd0b9', 1, -5, -1, 0, -2, 5, -1); ctx.fillStyle = '#465245'; ctx.beginPath(); ctx.arc(-5, -.5, .8, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    } else {
      ctx.save(); ctx.globalAlpha = bite ? .22 : .12; ctx.strokeStyle = '#ccd1b7'; ctx.lineWidth = .8 * zoom;
      for (let n = 0; n < 2; n++) { const age = frame.reducedMotion ? .45 + n * .2 : ((fishing.elapsed * (bite ? 1.25 : .44)) + n * .5) % 1, r = (3 + age * (bite ? 17 : 10)) * zoom; ctx.beginPath(); ctx.ellipse(bob.x, bob.y + 3 * zoom, r, r * .33, -.1, 0, Math.PI * 2); ctx.stroke(); } ctx.restore();
      ctx.save(); ctx.translate(floatX, floatY - 3 * zoom); ctx.rotate(frame.reducedMotion ? 0 : toss * .15); blob(ctx, 0, 0, 2 * zoom, 4 * zoom, bite ? '#cdb88a' : '#aa8170', 21, true); ctx.restore();
    }
    const sag = bite || fishing.phase === 'caught' ? 10 : 19 + (frame.reducedMotion ? 0 : Math.sin(time * 1.3) * 3);
    curve(ctx, '#c3b99b', .9, pp.x + heldPose.x * zoom, pp.y + (heldPose.y - 16) * zoom, (pp.x + floatX) / 2, Math.min(pp.y, floatY) - sag * zoom, floatX, floatY);
    if (bite) label(ctx, 'Reel', bob.x, bob.y - 25 * zoom, '#d7c69f', 'bold 15px "Patrick Hand", sans-serif');
  }
  if (frame.buildPreview) { const b = frame.buildPreview, p = position(frame, b.position.x, b.position.y, width, height); ctx.save(); ctx.translate(p.x, p.y); ctx.scale(zoom, zoom); ctx.globalAlpha = .59; drawObject(ctx, { id: 'preview', kind: b.kind, ...b.position, solid: false }, time); ctx.restore(); ctx.strokeStyle = b.valid ? '#a4af8b' : '#a56f65'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(p.x, p.y, 17 * zoom, 9 * zoom, -.1, 0, Math.PI * 2); ctx.stroke(); }
  for (const particle of frame.particles) { const p = position(frame, particle.x, particle.y, width, height); if (Math.abs(particle.x - frame.camera.x) > hw || Math.abs(particle.y - frame.camera.y) > hh) continue; ctx.save(); ctx.globalAlpha = Math.min(.75, particle.life / Math.max(.01, particle.maxLife)); if (particle.kind === 'smoke' || particle.kind === 'dust') blob(ctx, p.x, p.y, particle.size * zoom, particle.size * zoom * .7, particle.color, particle.maxLife * 18); else curve(ctx, particle.color, Math.max(.8, particle.size * zoom * .5), p.x, p.y, p.x + particle.size * zoom, p.y - particle.size * zoom * .4, p.x + particle.size * zoom * 1.3, p.y + zoom); ctx.restore(); }
  // Damp air moves over the drawing. Nature survives beneath the municipal neglect.
  if (scene.outdoors) {
    ctx.save(); for (let n = 0; n < 4; n++) { const drift = (time * 4 + n * width / 3) % (width + 420) - 210, yy = height * (.23 + n * .21); const mist = ctx.createRadialGradient(drift, yy, 15, drift, yy, width * .48); mist.addColorStop(0, 'rgba(223,219,193,.045)'); mist.addColorStop(1, 'rgba(223,219,193,0)'); ctx.fillStyle = mist; ctx.fillRect(drift - width * .48, yy - width * .48, width * .96, width * .96); }
    if (!frame.reducedMotion) for (let n = 0; n < 23; n++) { const xx = (noise(n, 87) * width + time * 7) % width, yy = (noise(n, 13) * height + time * (47 + n % 4 * 7)) % height; line(ctx, [xx, yy, xx - 2.4, yy + 7], 'rgba(216,217,193,.14)', .55, true); } ctx.restore();
  }
  const night = scene.outdoors ? .035 + Math.max(0, Math.cos((frame.dayTime + .08) * Math.PI * 2)) * .25 : .09;
  ctx.fillStyle = `rgba(38,46,44,${night})`; ctx.fillRect(0, 0, width, height);
  ctx.save(); ctx.globalCompositeOperation = 'screen'; for (const o of visible) if (['campfire', 'lantern', 'machine'].includes(o.kind)) { const p = position(frame, o.x, o.y - .3, width, height), r = (o.kind === 'campfire' ? 73 : 42) * zoom; const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, r); g.addColorStop(0, `rgba(176,146,91,${frame.reducedMotion ? .055 : .045 + (Math.sin(time * (o.kind === 'campfire' ? 5.7 : 6.3) + o.x) + 1) * .008})`); g.addColorStop(1, 'rgba(176,146,91,0)'); ctx.fillStyle = g; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2); } ctx.restore();
  if (frame.waypoint) { const p = position(frame, frame.waypoint.x, frame.waypoint.y, width, height); ctx.strokeStyle = '#bbab86'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(p.x, p.y, 12 * zoom, 5 * zoom, 0, 0, Math.PI * 2); ctx.stroke(); const lift = Math.sin(time * 1.3) * 2; line(ctx, [p.x, p.y - (17 + lift) * zoom, p.x - 4 * zoom, p.y - (24 + lift) * zoom, p.x + 4 * zoom, p.y - (24 + lift) * zoom, p.x, p.y - (17 + lift) * zoom], '#cfbc93', 1.4);
    if (p.x < 35 || p.x > width - 35 || p.y < 110 || p.y > height - 100) { const angle = Math.atan2(p.y - height / 2, p.x - width / 2), factor = Math.min((width / 2 - 44) / Math.max(.01, Math.abs(p.x - width / 2)), (height / 2 - 115) / Math.max(.01, Math.abs(p.y - height / 2))); const x = width / 2 + (p.x - width / 2) * Math.max(.05, factor), y = height / 2 + (p.y - height / 2) * Math.max(.05, factor); ctx.save(); ctx.translate(x, y); ctx.rotate(angle); line(ctx, [-4, -5, 6, 0, -4, 5], '#c3b08b', 2); ctx.restore(); }
  }
  if (frame.nearby) { const p = position(frame, frame.nearby.position.x, frame.nearby.position.y, width, height); ctx.strokeStyle = 'rgba(212,192,151,.7)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.ellipse(p.x, p.y + 4 * zoom, 12 * zoom, 5 * zoom, -.12, 0, Math.PI * 2); ctx.stroke(); }
  for (const f of frame.floating) { const p = position(frame, f.x, f.y, width, height); ctx.save(); ctx.globalAlpha = Math.min(1, f.life * 2); label(ctx, f.text, p.x, p.y - 36 * zoom, f.color, `${Math.max(13, 13 * zoom)}px "Patrick Hand", "DM Sans", sans-serif`); ctx.restore(); }
  const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .25, width / 2, height / 2, Math.max(width, height) * .66); vignette.addColorStop(0, 'rgba(44,43,34,0)'); vignette.addColorStop(1, scene.outdoors ? 'rgba(44,43,34,.18)' : 'rgba(33,33,26,.25)'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
  // A sparse rubbing of paper fibres unifies the moving objects and the cached ground illustration.
  ctx.save(); ctx.globalAlpha = .09; hatch(ctx, 0, 0, width, height, 519, PAPER, 72); ctx.restore(); ctx.restore();
}
