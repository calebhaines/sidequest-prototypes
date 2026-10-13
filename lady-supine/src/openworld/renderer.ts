import { TILE_SIZE, type ActorFrame, type RenderFrame, type TileKind, type VisualImpact, type WorldObject, type WorldScene } from './types';
import { drawActorSprite, drawItemIcon, playerToolPose } from './sprites';
import { worldHash } from './world';
import { drawMindExchange } from './mindExchange';
import { PALETTE24 as P, rgba } from './palette';

// The map remains a simulation grid. Its illustration deliberately never shows that grid.
const CHUNK = 8;
const INK: string = P.ink, PAPER: string = P.paper;
const groundCache = new Map<string, HTMLCanvasElement>();
const contourCache = new Map<string, Map<TileKind, Path2D>>();
const objectCache = new Map<string, { canvas: HTMLCanvasElement; left: number; top: number; width: number; height: number }>();
const colors: Record<TileKind, string> = {
  grass: P.sage, darkGrass: P.moss, dirt: P.clay, path: P.sand,
  water: P.water, deepWater: P.deepWater, sand: P.paper, stone: P.ash,
  woodFloor: P.clay, stoneFloor: P.fog, void: P.charcoal, tilled: P.bark,
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
  const k = (n: number) => (noise(n, seed) - .5) * Math.min(7, Math.min(w, h) * .19);
  const silhouette = new Path2D(); silhouette.moveTo(x + k(1), y + k(2));
  silhouette.lineTo(x + w * .72, y + k(3)); silhouette.lineTo(x + w + k(4), y + 2);
  silhouette.lineTo(x + w - 1, y + h * .47); silhouette.lineTo(x + w + k(5), y + h + k(6));
  silhouette.lineTo(x + w * .24, y + h + k(7)); silhouette.lineTo(x + k(8), y + h - 2); silhouette.closePath();
  ctx.fillStyle = fill; ctx.fill(silhouette);
  ctx.save(); ctx.clip(silhouette);
  // Unequal strips of replacement material interrupt a flat plane rather than shading it.
  if (w > 26 && h > 13) {
    ctx.globalAlpha *= .18;
    shape(ctx, [x + w * .12, y + h * .12, x + w * .73, y + h * .05, x + w * .62, y + h * .27, x + w * .14, y + h * .35], P.chalk, '', 0);
    line(ctx, [x + w * .2, y + h * .82, x + w * .63, y + h * .73, x + w * .92, y + h * .82], INK, .8, true);
  }
  ctx.restore();
  if (outline) { ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.stroke(silhouette); ctx.save(); ctx.globalAlpha *= .18; ctx.lineWidth = 4; ctx.stroke(silhouette); ctx.restore(); }
}
function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, seed: number, outline = false) {
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + noise(13, seed) * .7, radius = .77 + noise(i, seed) * .34;
    const xx = x + Math.cos(a) * rx * radius, yy = y + Math.sin(a) * ry * radius;
    if (!i) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
  }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  if (outline) { ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); ctx.save(); ctx.globalAlpha *= .16; ctx.lineWidth = 4; ctx.stroke(); ctx.restore(); }
}
function hatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, color = rgba(P.charcoal, .16), count = 9) {
  for (let i = 0; i < count; i++) {
    const xx = x + noise(i + 40, seed) * w, yy = y + noise(i + 90, seed) * h;
    curve(ctx, color, .55 + noise(i, seed) * 1.7, xx, yy, xx + 2, yy + 4, xx + 5 + noise(i + 20, seed) * 12, yy - 2 + noise(i + 30, seed) * 6);
  }
}
function scribble(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, color = rgba(P.ink, .32)) {
  ctx.strokeStyle = color; ctx.lineWidth = .7; ctx.beginPath();
  ctx.moveTo(x, y + h * .5);
  for (let i = 1; i < 12; i++) ctx.bezierCurveTo(x + w * (i - .8) / 11, y + h * noise(i, seed), x + w * (i - .3) / 11, y + h * noise(i + 23, seed), x + w * i / 11, y + h * noise(i + 12, seed));
  ctx.stroke();
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
  ctx.save();
  if (kind === 'woodFloor') {
    // Floorboards disagree about direction: reused lengths, a torn seam, one crossed-out mark.
    if (noise(1, seed) > .39) line(ctx, [px - 2, py + 5, px + 33, py + 3, px + 35, py + 22], rgba(P.bark, .28), .9, true);
    if (noise(3, seed) > .91) scribble(ctx, px + 5, py + 8, 28, 16, seed, rgba(P.ink, .33));
  } else if (kind === 'stoneFloor' || kind === 'stone') {
    if (noise(2, seed) > .79) line(ctx, [px + 3, py + 31, px + 13, py + 12, px + 23, py + 18, px + 35, py + 5], rgba(P.ink, .24), .8, true);
  } else if (kind === 'tilled') {
    line(ctx, [px - 2, py + 8, px + 16, py + 10, px + 34, py + 6], rgba(P.ink, .35), 2.2, true);
    line(ctx, [px, py + 24, px + 34, py + 21], rgba(P.clay, .55), 2, true);
  } else if (!wet(kind) && kind !== 'void') {
    const mark = noise(5, seed);
    if (mark > .96) {
      ctx.globalAlpha *= .20;
      shape(ctx, [px - 6, py + 17, px + 9, py + 5, px + 34, py + 7, px + 19, py + 28], kind === 'path' ? P.ochre : P.lichen, '', 0);
      line(ctx, [px + 4, py + 16, px + 27, py + 13, px + 15, py + 26], P.ink, 1.6, true);
    } else if (mark > .86 && (kind === 'grass' || kind === 'darkGrass')) {
      // One economical pen gesture, with plenty of unmarked paper between it and the next.
      line(ctx, [px + 9, py + 21, px + 11, py + 13, px + 14, py + 25, px + 20, py + 11], rgba(P.pine, .41), .9, true);
    } else if (mark > .72 && mark < .74) scribble(ctx, px - 9, py + 4, 51, 18, seed, rgba(P.ink, .16));
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
  line(ctx, [-12, 1, 11, -4], P.umbra, 5); line(ctx, [-10, -5, 12, 3], P.umbra, 4);
  for (let n = 0; n < 3; n++) {
    const phase = time * (6.2 + n * .83) + n * 2.3;
    const width = 7 - n * 1.4, height = 19 + Math.sin(phase) * 3 + Math.cos(phase * .61) * 2;
    const tip = Math.sin(phase * .48) * 4 + n - 1;
    ctx.beginPath(); ctx.moveTo(-width, 0); ctx.bezierCurveTo(-width - 4, -height * .42, tip - 5, -height * .5, tip, -height);
    ctx.bezierCurveTo(tip + 1, -height * .42, width + 4, -height * .35, width, 0); ctx.closePath(); ctx.fillStyle = [P.clay, P.ochre, P.straw][n]; ctx.fill();
  }
  if (sceneryDebris) for (let n = 0; n < 5; n++) {
    const age = (time * (10 + n * .7) + n * 13) % 59, sway = Math.sin(time * .7 + n) * age * .16;
    ctx.save(); ctx.globalAlpha *= .6 * (1 - age / 59);
    curve(ctx, n % 2 ? P.ochre : P.straw, 1.05, -6 + n * 3 + sway, -12 - age, -7 + n * 3 + sway, -15 - age, -5 + n * 3 + sway, -17 - age); ctx.restore();
  }
  for (let n = 0; n < 4; n++) { const age = (time * 8 + n * 15) % 62; blob(ctx, Math.sin(time * .64 + n) * age * .18 + age * .12, -22 - age, 5 + age * .15, 3 + age * .10, rgba(P.charcoal, .15 * (1 - age / 62)), n + 12); }
}
type CanopyShard = { canvas: HTMLCanvasElement; x: number; y: number; width: number; height: number };
const canopyCache = new Map<string, CanopyShard>();
function canopyShard(ctx: CanvasRenderingContext2D, index: number, variant: number, seed: number, width: number, height: number, fill: string) {
  const key = `${index}:${variant}:${seed % 7}:${width}:${height}:${fill}`;
  let shard = canopyCache.get(key);
  if (!shard) {
    const canvas = document.createElement('canvas'), bleed = 5, resolution = 2;
    canvas.width = (width + bleed * 2) * resolution; canvas.height = (height + bleed * 2) * resolution;
    const brush = canvas.getContext('2d')!; brush.scale(resolution, resolution); brush.translate(width / 2 + bleed, height / 2 + bleed);
    const ww = width / 2, hh = height / 2;
    // A tree is an arrangement of torn painted planes, with actual open paper between them.
    // The marks are interrupted thoughts, rather than leaf-shaped icons or shiny highlights.
    const tilt = (noise(index + 19, seed) - .5) * hh * .39;
    shape(brush, [-ww, hh * .17, -ww * .67, -hh * .84 + tilt, ww * .43, -hh * .61,
      ww * .87, -hh * .03, ww * .31, hh * .73, -ww * .77, hh * .54], fill, '', 0);
    shape(brush, [-ww * .82, -hh * .31, ww * .11, -hh * .96, ww * .57, -hh * .64,
      ww * .08, hh * .13, -ww * .68, hh * .16], index % 2 ? P.lichen : P.sage, '', 0);
    shape(brush, [ww * .39, hh * .12, ww, -hh * .31, ww * .74, hh * .68, ww * .12, hh * .85], index % 3 ? P.pine : P.ochre, '', 0);
    brush.save(); brush.globalCompositeOperation = 'destination-out';
    shape(brush, [-ww * .16, hh * .21, ww * .18, -hh * .16, ww * .12, hh * .81, -ww * .35, hh * .92], P.ink, '', 0); brush.restore();
    line(brush, [-ww * .93, hh * .13, -ww * .63, -hh * .82, ww * .43, -hh * .66], P.ink, .95, true);
    line(brush, [ww * .85, hh * .02, ww * .26, hh * .7, -ww * .77, hh * .57], rgba(P.ink, .76), .8, true);
    line(brush, [-ww * .68, -hh * .26, ww * .15, -hh * .54, -ww * .05, -hh * .2, ww * .56, -hh * .41], rgba(P.chalk, .56), 1.4, true);
    if (index % 2) scribble(brush, -ww * .67, -hh * .56, width * .79, height * .64, seed, rgba(P.ink, .55));
    else line(brush, [-ww * .49, hh * .08, ww * .58, -hh * .19, ww * .24, hh * .4], rgba(P.ink, .67), .85, true);
    shard = { canvas, x: -ww - bleed, y: -hh - bleed, width: width + bleed * 2, height: height + bleed * 2 };
    canopyCache.set(key, shard); if (canopyCache.size > 160) canopyCache.delete(canopyCache.keys().next().value!);
  }
  ctx.drawImage(shard.canvas, shard.x, shard.y, shard.width, shard.height);
}
function drawTree(ctx: CanvasRenderingContext2D, o: WorldObject, time: number, fade: number, reducedMotion = false) {
  const willow = o.kind === 'willow', variant = o.variant || 0, seed = Math.floor(o.x * 23 + o.y * 17);
  const phase = noise(7, seed) * Math.PI * 2;
  const gust = reducedMotion ? 0 : wind(o.x, o.y, time);
  const bend = gust * (willow ? 9.5 : 7.2), crown = gust * (willow ? 14 : 10.5);
  shadow(ctx, 12, 5, willow ? 31 : 23, 8, .18);
  // The foot stays rooted. The middle joint and crown answer the wind at different distances.
  shape(ctx, [-6, 3, -4 + bend * .28, -29, -7 + bend * .63, -46,
    -1 + crown, -70, 4 + crown, -73, 7 + bend * .67, -42, 5 + bend * .22, -25, 8, 3], variant === 2 ? P.paper : P.bark, P.ink, 1.7);
  line(ctx, [-2, 2, 1 + bend * .2, -25, -1 + bend * .65, -43, 2 + crown, -69], variant === 2 ? P.ink : P.clay, 1.6, true);
  line(ctx, [-6, 2, -15, 6, -9, 2, 4, 2, 16, 4], P.ink, 1.1, true);
  const shards = willow ? [
    { x: -22, y: -57, w: 39, h: 33, fill: P.moss }, { x: 20, y: -58, w: 41, h: 38, fill: P.pine },
    { x: -2, y: -77, w: 44, h: 32, fill: P.sage }, { x: 9, y: -40, w: 24, h: 20, fill: P.moss },
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
    line(ctx, [bend * .45, -35, bx + shard.x * .39, by - 10, tipX, tipY + 6], P.ink, 1.7 - n * .15, true);
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
      line(ctx, [x - 1, y - 2, x + 4 + gust * 2, y + 4, x + 1 + gust * 2, y + 7], n % 3 ? P.sage : P.lichen, 1.5, true);
    }
  }
  if (sceneryDebris && !reducedMotion && noise(9, seed) > .51) {
    const age = (time * 6 + phase * 8) % 92, xx = -19 + noise(4, seed) * 41 + Math.sin(age * .14 + phase) * 8 + gust * age * .18, yy = -86 + age;
    ctx.save(); ctx.globalAlpha *= Math.min(1, (92 - age) / 18);
    shape(ctx, [xx - 3, yy, xx + 2, yy - 2, xx + 4, yy + 2, xx, yy + 3], P.ochre, '', 0); ctx.restore();
  }
  ctx.restore();
}
function trailerWindow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number) {
  shape(ctx, [x - 3, y - 3, x + w + 4, y - 1, x + w + 1, y + h + 3, x - 4, y + h + 1], P.ash, P.ink, 1.2);
  shape(ctx, [x, y, x + w, y + 1, x + w - 2, y + h, x + 1, y + h - 2], P.deepWater, '', 0);
  shape(ctx, [x + 1, y + 1, x + w * .61, y + 2, x + w * .45, y + h * .73, x + 2, y + h * .91], P.fog, '', 0);
  line(ctx, [x + w * .46, y - 1, x + w * .51, y + h + 2], P.ink, 1.1, true);
  line(ctx, [x - 4, y + 2, x + 8, y + 4], P.straw, 3.4, true);
  line(ctx, [x + w - 6, y + h - 1, x + w + 5, y + h + 1], P.paper, 3.4, true);
  line(ctx, [x + w * .8, y + 2, x + w * .61, y + h * .46, x + w * .86, y + h - 3], P.ink, .75, true);
}
function drawBuilding(ctx: CanvasRenderingContext2D, o: WorldObject, _time: number) {
  const w = (o.width || 5) * 32, h = (o.height || 4) * 32, variant = o.variant || 0, seed = o.x * 13 + o.y * 37;
  const civic = variant > 0, front = h * .57;
  const cladding = variant === 4 ? P.flesh : variant === 3 ? P.clay : variant === 2 ? P.fog : [P.paper, P.ash, P.clay, P.sage][Math.floor(noise(8, seed) * 4)];
  shadow(ctx, w / 2 + 18, h + 10, w / 2 + 12, 15, .21);
  // Displaced paper rectangles stay visibly supported by old tyres and borrowed masonry.
  for (const xx of [w * .17, w * .78]) {
    blob(ctx, xx, h - 6, 14, 19, P.charcoal, seed + xx, true);
    shape(ctx, [xx - 5, h - 12, xx + 7, h - 10, xx + 4, h + 1, xx - 7, h - 2], P.ash, P.ink, .8);
  }
  for (const xx of [8, w * .37, w * .63, w - 28]) panel(ctx, xx, h - 8, 23, 17, P.ash, seed + xx);
  shape(ctx, [1, 23, w * .42, 18, w + 3, 25, w - 2, h - 3, w * .6, h - 5, -1, h - 1], cladding, P.ink, 1.8);
  // Repairs are separate planes with incompatible edges; there is no simulated material lighting.
  shape(ctx, [3, front + 1, w * .26, front - 4, w * .28, h - 5, 0, h - 1], variant === 4 ? P.clay : P.sand, '', 0);
  shape(ctx, [w * .72, front - 9, w - 2, front + 4, w - 3, h - 4, w * .81, h - 1], variant === 3 ? P.rust : P.ash, '', 0);
  shape(ctx, [w * .24, h * .73, w * .41, h * .7, w * .39, h - 7, w * .23, h - 4], P.clay, P.ink, .8);
  shape(ctx, [w * .57, h * .78, w * .75, h * .77, w * .72, h - 4, w * .58, h - 3], P.paper, '', 0);
  line(ctx, [2, h * .82, w * .17, h * .84, w * .34, h * .78, w * .49, h * .83], P.ink, .85, true);
  const roofSeam = w * (.34 + noise(4, seed) * .19);
  shape(ctx, [-2, 26, 13, 10, roofSeam, 15, w - 12, 10, w + 2, 28, w - 2, front + 3, w * .52, front - 4, -3, front + 1], P.slate, P.ink, 1.7);
  shape(ctx, [4, 28, roofSeam - 10, 20, roofSeam + 7, front - 6, 0, front - 1], P.ash, '', 0);
  shape(ctx, [roofSeam + 12, 17, w * .81, 15, w * .76, front * .65, roofSeam + 16, front * .77], P.umbra, P.ink, .7);
  for (let n = 0; n < 5; n++) {
    const xx = 12 + n * w / 5;
    line(ctx, [xx, 24, xx + 5, front * .7, xx - 3, front], rgba(P.ink, .47), .9, true);
  }
  // An unfinished thought has been scratched across the roof and painted over only in pieces.
  scribble(ctx, w * .12, front * .52, Math.min(99, w * .29), 19, seed, rgba(P.ink, .44));
  line(ctx, [w * .16, front * .43, w * .29, front * .47, w * .21, front * .61, w * .38, front * .58], P.paper, 3, true);
  const tarpX = w * .64;
  shape(ctx, [tarpX, 19, w - 12, 18, w + 9, front + 15, tarpX - 10, front + 9], P.deepWater, P.ink, 1);
  line(ctx, [tarpX + 9, 24, tarpX + 2, front + 5, w - 8, front + 12], P.water, 3.1, true);
  line(ctx, [w - 23, 20, w - 5, front + 13], P.ink, .8, true);
  const doorW = civic ? 37 : 27, doorH = Math.max(33, Math.min(67, h - front - 10));
  panel(ctx, w / 2 - doorW / 2 - 5, h - doorH - 6, doorW + 10, doorH + 6, P.ochre, seed + 61);
  shape(ctx, [w / 2 - doorW / 2, h - doorH - 1, w / 2 + doorW / 2, h - doorH - 3, w / 2 + doorW / 2 - 2, h - 2, w / 2 - doorW / 2 + 1, h], P.ink, '', 0);
  line(ctx, [w / 2 + doorW / 2 - 7, h - 20, w / 2 + doorW / 2 - 7, h - 15], P.straw, 2.3, true);
  for (let xx = 19; xx < w - 34; xx += civic ? 77 : 63) if (Math.abs(xx + 13 - w / 2) > doorW * .8) trailerWindow(ctx, xx, front + 14, civic ? 35 : 27, Math.min(31, h - front - 27), seed + xx);
  shape(ctx, [w / 2 - 23, h - 1, w / 2 + 23, h + 1, w / 2 + 27, h + 8, w / 2 - 27, h + 7], P.bark, P.ink, 1);
  shape(ctx, [w / 2 - 29, h + 7, w / 2 + 27, h + 8, w / 2 + 30, h + 14, w / 2 - 32, h + 13], P.sand, P.ink, .9);
  const pipeX = w * .16;
  panel(ctx, pipeX, -7, 15, 32, P.rust, seed + 8); line(ctx, [pipeX - 3, -8, pipeX + 18, -7], P.ink, 3);
  if (!civic) {
    shape(ctx, [-12, front + 3, w * .27, front + 1, w * .28, front + 27, -20, front + 30], P.sand, P.ink, 1.2);
    line(ctx, [-15, front + 28, -13, h + 8], P.bark, 2.4);
    line(ctx, [w * .26, front + 25, w * .27, h + 3], P.ink, 2.1);
    line(ctx, [-8, front + 8, w * .22, front + 15], P.paper, 4, true);
    panel(ctx, w - 21, h - 28, 18, 20, P.umbra, seed + 91);
    const bx = w - 18, by = h + 5;
    ctx.strokeStyle = P.ink; ctx.lineWidth = 1.1;
    for (const xx of [bx - 14, bx + 10]) { ctx.beginPath(); ctx.ellipse(xx, by, 7, 8, -.12, 0, Math.PI * 2); ctx.stroke(); }
    line(ctx, [bx - 14, by, bx - 6, by - 12, bx + 1, by, bx - 14, by, bx - 1, by - 8, bx + 10, by], P.rust, 1.2);
    line(ctx, [bx - 7, by - 12, bx - 12, by - 13], P.ink, 1.4);
    line(ctx, [bx + 9, by, bx + 5, by - 16, bx + 10, by - 18], P.ink, 1.1);
    shape(ctx, [8, h - 21, 27, h - 25, 30, h + 3, 12, h + 6], P.clay, P.ink, 1.1);
    line(ctx, [14, h - 19, 27, h - 20, 26, h - 10, 14, h - 8, 14, h - 19], P.ink, .8, true);
    curve(ctx, P.ink, .75, -8, front + 25, -3, front + 47, w * .28, front + 35);
  }
  if (variant === 4) {
    // Supine's castle is an enormous paper claim nailed onto the caravan colony.
    for (const xx of [9, w - 94]) {
      shape(ctx, [xx, h - 6, xx + 4, -32, xx + 74, -35, xx + 81, h - 6], P.paper, P.ink, 2.4);
      shape(ctx, [xx + 47, -31, xx + 74, -34, xx + 81, h - 6, xx + 54, h - 3], P.flesh, '', 0);
      shape(ctx, [xx - 8, -31, xx - 8, -57, xx + 6, -60, xx + 8, -43, xx + 20, -42, xx + 21, -60, xx + 37, -61, xx + 40, -43, xx + 55, -44, xx + 56, -60, xx + 73, -58, xx + 76, -41, xx + 88, -40, xx + 89, -30], P.fog, P.ink, 1.9);
      trailerWindow(ctx, xx + 28, 29, 23, 40, seed + xx);
      line(ctx, [xx - 11, -50, xx - 14, h + 10], P.ink, 1.8);
      line(ctx, [xx + 91, -45, xx + 89, h + 8], P.ink, 1.8);
      for (let y = -30; y < h; y += 57) line(ctx, [xx - 13, y, xx + 90, y + 3], P.bark, 1.3, true);
      line(ctx, [xx - 13, 4, xx + 89, 124, xx - 13, Math.min(250, h - 12), xx + 89, h - 9], P.bark, 1.3, true);
      scribble(ctx, xx + 12, 81, 48, 64, seed + xx, rgba(P.ink, .39));
    }
  }
  if (variant === 2) {
    line(ctx, [w / 2 - 13, 36, w / 2 + 12, 37], P.chalk, 6);
    line(ctx, [w / 2, 24, w / 2 + 1, 49], P.chalk, 6);
  }
  if (o.label) {
    const text = o.label.replace('Library of ', '').replace('Hospital for Those ', 'Hospital: '), lw = Math.min(w - 18, Math.max(98, text.length * 6));
    panel(ctx, w / 2 - lw / 2, front - 15, lw, 21, P.paper, seed + 48);
    ctx.save(); ctx.translate(w / 2, front - 4); ctx.rotate(-.013); ctx.font = '11px "Patrick Hand", "DM Sans", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = P.ink; ctx.fillText(text, 0, 0); ctx.restore();
    scribble(ctx, w * .11, h - 38, Math.min(54, w * .14), 17, seed, rgba(P.ink, .45));
  }
  curve(ctx, P.ink, .95, -23, front + 19, w / 2, front + 59, w + 35, front + 21);
}
function drawObject(ctx: CanvasRenderingContext2D, o: WorldObject, time: number, fade = 1) {
  const v = o.variant || 0, seed = o.x * 29 + o.y * 73, w = (o.width || 1) * 32, h = (o.height || 1) * 32;
  switch (o.kind) {
    case 'tree': case 'willow': drawTree(ctx, o, time, fade); break;
    case 'building': drawBuilding(ctx, o, time); break;
    case 'rock': case 'ore':
      shadow(ctx, 5, 4, 17, 5, .19); blob(ctx, -1, -7, 16, 11, P.sage, seed, true); shape(ctx, [-13, -9, -5, -20, 6, -17, 13, -7, 2, -5], P.fog, rgba(P.umbra, .36), 1); hatch(ctx, -10, -15, 23, 17, seed, rgba(P.umbra, .30), 8);
      if (o.kind === 'ore') { blob(ctx, -5, -13, 4, 3, P.fog, seed); blob(ctx, 6, -8, 4, 2, P.ash, seed + 1); line(ctx, [-6, -13, -3, -9, 3, -10, 7, -6], P.smoke, 1.8); } break;
    case 'flower': {
      const sway = wind(o.x, o.y, time) * 3;
      curve(ctx, P.smoke, 1.4, 0, 2, -2, -7, sway, -14);
      curve(ctx, P.sage, 1.9, 0, -5, -7, -8, -7, -5); curve(ctx, P.smoke, 1.7, 0, -8, 5, -11, 7, -8);
      const c = [P.sand, P.flesh, P.fog, P.ash][v % 4];
      for (let i = 0; i < 5; i++) blob(ctx, sway + Math.cos(i * 1.256) * 3, -15 + Math.sin(i * 1.256) * 2.5, 2.6, 2.1, c, seed + i);
      blob(ctx, sway, -15, 1.4, 1.3, P.clay, seed); break;
    }
    case 'bush': shadow(ctx, 3, 3, 16, 5, .15); blob(ctx, 0, -9, 17, 12, P.smoke, seed, true); hatch(ctx, -13, -16, 25, 17, seed, rgba(P.charcoal, .23), 9); scribble(ctx, -11, -14, 23, 12, seed); if (v % 2) { blob(ctx, -6, -11, 2, 2, P.clay, seed); blob(ctx, 7, -8, 2, 2, P.clay, seed + 1); } break;
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
      panel(ctx, -21, -13, 42, 8, P.clay, seed); panel(ctx, -20, -28, 40, 8, P.clay, seed + 1); line(ctx, [-15, -23, -15, -9], P.bark, 2.4); line(ctx, [14, -23, 14, -10], P.bark, 2.6); hatch(ctx, -17, -26, 33, 21, seed, rgba(P.charcoal, .30), 7); break;
    case 'workbench':
      shadow(ctx, 2, 3, 24, 6, .2); line(ctx, [-17, -10, -18, 7], P.slate, 5); line(ctx, [17, -12, 16, 7], P.slate, 4.6);
      panel(ctx, -24, -26, 48, 17, P.clay, seed); hatch(ctx, -23, -25, 47, 14, seed, rgba(P.charcoal, .25), 13); line(ctx, [-12, -30, 0, -29], P.moss, 3); line(ctx, [8, -31, 9, -20], P.bark, 2); blob(ctx, 10, -31, 5, 2, P.fog, seed + 2, true); scribble(ctx, -19, -23, 24, 9, seed); break;
    case 'well':
      shadow(ctx, 3, 3, 22, 8, .2); panel(ctx, -20, -20, 40, 28, P.sage, seed); blob(ctx, 0, -21, 21, 7, P.fog, seed + 1, true); blob(ctx, 0, -21, 13, 3, P.pine, seed + 2); line(ctx, [-22, -42, -22, 3], P.bark, 4); line(ctx, [23, -42, 24, 3], P.bark, 3.6);
      shape(ctx, [-29, -41, -17, -49, 18, -48, 31, -39], P.clay, INK, 1.2); curve(ctx, P.sand, 1.4, 2, -38, -1, -29, 2, -19); hatch(ctx, -18, -14, 34, 21, seed, rgba(P.charcoal, .20), 9); break;
    case 'sign':
      line(ctx, [-1, 4, -2, -24], P.bark, 4);
      if (v === 1) {
        panel(ctx, -31, -69, 63, 49, P.sand, seed); panel(ctx, -27, -65, 55, 35, P.sage, seed + 1);
        drawActorSprite(ctx, 'lady', 0, -28, Math.PI / 2, false, 0, 0, .61, undefined, { reducedMotion: true, billboard: true });
        panel(ctx, -27, -30, 55, 8, P.ash, seed + 3, false); ctx.font = '8px "Patrick Hand", sans-serif'; ctx.fillStyle = P.slate; ctx.textAlign = 'center'; ctx.fillText('BE DIVINE', 0, -24); hatch(ctx, -27, -65, 55, 35, seed, rgba(P.paper, .21), 14);
      } else if (v === 2) {
        line(ctx, [-23, -83, 23, -81], P.clay, 3);
      } else { panel(ctx, -24, -43, 48, 24, P.sand, seed); scribble(ctx, -18, -38, 32, 11, seed); line(ctx, [-18, -24, 15, -26], P.clay, .8, true); }
      break;
    case 'crate': case 'chest':
      shadow(ctx, 3, 4, 16, 6, .18); panel(ctx, -16, -17, 33, 24, P.clay, seed); shape(ctx, [-16, -17, -10, -23, 14, -22, 18, -16], P.sand, INK, 1.3); line(ctx, [-9, -16, -8, 5], P.bark, 2.6); line(ctx, [10, -16, 10, 5], P.bark, 2.6); panel(ctx, -2, -10, 5, 7, P.sand, seed + 1); hatch(ctx, -13, -17, 29, 22, seed, rgba(P.charcoal, .24), 9); break;
    case 'fence':
      line(ctx, [-16, -16, 16, -18], P.clay, 4); line(ctx, [-16, -6, 15, -4], P.smoke, 3); line(ctx, [-12, 4, -14, -23], P.smoke, 4); line(ctx, [12, 4, 10, -24], P.clay, 3.6); line(ctx, [-14, -19, -12, -3, 11, -13, 12, -23], rgba(P.charcoal, .30), .6, true); break;
    case 'grave':
      shadow(ctx, 3, 4, 14, 5, .18); panel(ctx, -11, -30, 22, 34, P.fog, seed); line(ctx, [-8, -11, 7, -13], P.smoke, .9, true); scribble(ctx, -7, -24, 15, 10, seed, rgba(P.charcoal, .30)); blob(ctx, 1, 3, 16, 4, P.smoke, seed + 1); break;
    case 'altar':
      panel(ctx, -20, -6, 40, 13, P.sage, seed); panel(ctx, -15, -14, 30, 10, P.sand, seed + 1);
      if (v === 2) { panel(ctx, -10, -80, 20, 64, P.fog, seed + 2); panel(ctx, -16, -87, 32, 8, P.ash, seed + 3); line(ctx, [-5, -79, -4, -18], P.ash, 3, true); hatch(ctx, -8, -72, 17, 55, seed, rgba(P.umbra, .15), 9); }
      else if (v === 1) { drawActorSprite(ctx, 'lady', 0, -16, Math.PI / 2, false, 0, 0, 1, P.fog); }
      else if (v === 3) { panel(ctx, -15, -37, 29, 22, P.fog, seed + 3); panel(ctx, -7, -59, 23, 22, P.sand, seed + 4); panel(ctx, -16, -70, 14, 18, P.clay, seed + 5); }
      else if (v === 4) { panel(ctx, -14, -44, 28, 30, P.water, seed + 3); shape(ctx, [-12, -41, 10, -40, 11, -18, -11, -18], rgba(P.ash, .32), '', 0); blob(ctx, 0, -30 + Math.sin(time) * 1.5, 4, 3, P.sand, seed + 4, true); }
      else { panel(ctx, -12, -34, 24, 20, P.sage, seed + 3); blob(ctx, 0, -34, 8, 3, P.slate, seed + 4); } break;
    case 'bed':
      panel(ctx, 0, 0, w, h, P.clay, seed); panel(ctx, 4, 5, w - 8, h - 12, P.ash, seed + 1); panel(ctx, 6, h * .3, w - 12, h * .61, P.sage, seed + 2); panel(ctx, 8, 8, w - 16, 18, P.ash, seed + 3);
      for (let xx = 11; xx < w - 6; xx += 9) curve(ctx, rgba(P.ash, .32), 2, xx, h * .35, xx + 4, h * .65, xx - 1, h - 13);
      hatch(ctx, 8, h * .4, w - 16, h * .45, seed, rgba(P.charcoal, .15), 13); line(ctx, [0, h - 7, w, h - 8], P.bark, 4); break;
    case 'bookshelf':
      panel(ctx, 0, -31, w, 52, P.bark, seed);
      for (let row = 0; row < 2; row++) { for (let xx = 6; xx < w - 6; xx += 8) { const hh = 13 + noise(xx + row, seed) * 5, c = [P.clay, P.sage, P.sand, P.sage][Math.floor(noise(xx + row * 11, seed) * 4)]; panel(ctx, xx, -23 + row * 23, 5 + noise(xx, seed) * 2, hh, c, seed + xx + row, false); line(ctx, [xx, -19 + row * 23, xx + 5, -20 + row * 23], P.ash, .65, true); } line(ctx, [1, -4 + row * 24, w - 1, -3 + row * 24], P.ochre, 3); }
      hatch(ctx, 0, -31, w, 51, seed, rgba(P.charcoal, .16), 8); break;
    case 'table':
      line(ctx, [7, h - 7, 7, h + 6], P.bark, 6); line(ctx, [w - 7, h - 7, w - 7, h + 6], P.bark, 5); panel(ctx, 0, -9, w, h, P.clay, seed);
      if (v === 1) { panel(ctx, 5, -4, w - 10, h - 12, P.water, seed + 1); panel(ctx, w / 2 - 6, h / 2 - 7, 13, 11, P.ash, seed + 2); }
      else { shape(ctx, [10, 0, 31, -1, 30, 15, 12, 14], P.ash, rgba(P.umbra, .3), .6); scribble(ctx, 14, 4, 12, 6, seed); blob(ctx, w - 16, 9, 5, 5, P.smoke, seed, true); }
      hatch(ctx, 3, -7, w - 6, h - 3, seed, rgba(P.charcoal, .16), 12); break;
    case 'rug':
      shape(ctx, [0, 1, w, -1, w - 3, h, 1, h + 2], P.clay, rgba(P.charcoal, .44), 1.5); line(ctx, [5, 5, w - 6, 4, w - 7, h - 6, 7, h - 5, 5, 5], P.sand, 2.2, true);
      for (let y = 16; y < h - 8; y += 21) scribble(ctx, 11, y, w - 20, 11, seed + y, rgba(P.umbra, .23)); hatch(ctx, 3, 3, w - 6, h - 6, seed, rgba(P.charcoal, .14), 18); break;
    case 'window': trailerWindow(ctx, -11, -35, 23, 29, seed); line(ctx, [-16, -4, 16, -5], P.fog, 3); break;
    case 'portrait':
      panel(ctx, -21, -53, 42, 48, P.clay, seed); panel(ctx, -17, -49, 34, 40, P.clay, seed + 1);
      drawActorSprite(ctx, 'lady', 1, -10, Math.PI / 2, false, 0, time, .74);
      scribble(ctx, -17, -44, 33, 21, seed, rgba(P.straw, .18)); hatch(ctx, -18, -48, 36, 39, seed, rgba(P.charcoal, .18), 13); break;
    case 'machine':
      shadow(ctx, 3, 4, 22, 7, .22); panel(ctx, -21, -32, 42, 37, P.sage, seed); panel(ctx, -16, -30, 32, 24, P.moss, seed + 1);
      if (v === 2) { panel(ctx, -13, -27, 26, 19, P.sage, seed + 2, false); drawActorSprite(ctx, 'lady', 0, -9, Math.PI / 2, false, 0, time, .46); curve(ctx, rgba(P.lichen, .18), .8, -12, -18 + Math.sin(time * 3) * 6, 0, -18 + Math.sin(time * 3) * 6, 12, -17 + Math.sin(time * 3) * 6); }
      else { scribble(ctx, -13, -26, 26, 15, seed, P.lichen); blob(ctx, -7, -12, 2, 2, P.ochre, seed); blob(ctx, 7, -12, 2, 2, P.fog, seed + 1); }
      curve(ctx, P.pine, 1.6, -18, 0, -38, 14, -25, 19); curve(ctx, P.bark, 1.3, 19, -4, 35, 0, 33, 13); line(ctx, [-10, 1, -9, 7], P.slate, 2); line(ctx, [10, 1, 10, 7], P.slate, 2); hatch(ctx, -19, -32, 37, 36, seed, rgba(P.ink, .16), 9); break;
    case 'gate': case 'portal': {
      const portal = o.kind === 'portal', gh = Math.max(h, 110);
      for (const xx of [0, w - 24]) { panel(ctx, xx, 0, 24, gh, P.sage, seed + xx); line(ctx, [xx + 5, 5, xx + 5, gh - 4], P.ash, 3, true); hatch(ctx, xx + 4, 8, 16, gh - 14, seed + xx, rgba(P.umbra, .28), 14); }
      panel(ctx, -6, -16, w + 12, 21, P.fog, seed + 11); scribble(ctx, 9, -12, w - 19, 10, seed, rgba(P.charcoal, .35));
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
    const w = (o.width || 5) * TILE_SIZE, h = (o.height || 4) * TILE_SIZE, front = h * .57, px = w * .16;
    // Smoke is pulled into wandering ribbons before breaking into translucent charcoal clouds.
    for (let n = 0; n < 5; n++) {
      const age = ((reducedMotion ? 0 : time) * (6.4 + n * .3) + n * 17 + phase) % 91;
      const xx = px + 7 + age * .17 + gust * age * .34 + Math.sin(age * .068 + phase) * 5;
      blob(ctx, xx, -14 - age, 4 + age * .15, 3 + age * .10, rgba(P.umbra, .16 * (1 - age / 91)), n + seed);
    }
    const tx = w * .64;
    ctx.beginPath(); ctx.moveTo(tx - 10, front + 7); ctx.bezierCurveTo(tx + w * .05, front + 5, w - 15, front + 14 + gust * 7, w + 9, front + 15);
    ctx.lineTo(w + 8 + gust * 2, front + 22 + gust * 8); ctx.bezierCurveTo(w - 13, front + 22 - gust * 6, tx + w * .04, front + 15 + gust * 7, tx - 12 + gust, front + 15); ctx.closePath();
    ctx.fillStyle = P.smoke; ctx.fill(); ctx.lineWidth = .9; ctx.strokeStyle = P.slate; ctx.stroke();
    if (!(o.variant || 0)) {
      const xx = 3 + gust * 7;
      ctx.beginPath(); ctx.moveTo(3, front + 29); ctx.lineTo(13, front + 31); ctx.bezierCurveTo(13 + gust * 2, front + 36, xx + 12, front + 41, xx + 10, front + 49); ctx.quadraticCurveTo(xx + 5, front + 45 + gust, xx, front + 45); ctx.quadraticCurveTo(4 + gust * 2, front + 36, 3, front + 29); ctx.closePath();
      ctx.fillStyle = P.fog; ctx.fill(); ctx.lineWidth = .8; ctx.strokeStyle = P.moss; ctx.stroke(); curve(ctx, rgba(P.ash, .38), 1, 8, front + 33, 8 + gust * 2, front + 38, xx + 6, front + 44);
    }
  } else if (o.kind === 'lantern') {
    const flicker = reducedMotion ? .5 : .5 + Math.sin(time * 7.3 + phase) * .22 + Math.sin(time * 11.7 + phase * 2) * .12;
    ctx.save(); ctx.globalAlpha *= .6 + flicker * .35; blob(ctx, 4, -28, 2.5, 4.5, P.straw, seed);
    curve(ctx, P.paper, 1.05, 4, -26, 3.5 + gust, -29, 4 + gust * .5, -31 - flicker * 1.2); ctx.restore();
  } else if (o.kind === 'sign' && o.variant === 2) {
    ctx.beginPath(); ctx.moveTo(-18, -80); ctx.lineTo(18, -80); ctx.bezierCurveTo(18 + gust * 2, -60, 14 + gust * 4, -44, 17 + gust * 5, -22);
    ctx.quadraticCurveTo(8 + gust * 3, -25 + gust, 1 + gust * 4, -28); ctx.lineTo(-18 + gust * 4, -23); ctx.bezierCurveTo(-17 + gust * 3, -44, -19 + gust, -64, -18, -80); ctx.closePath();
    ctx.fillStyle = P.clay; ctx.fill(); ctx.strokeStyle = P.bark; ctx.lineWidth = 1; ctx.stroke();
    curve(ctx, rgba(P.sand, .38), 2, -10, -76, -7 + gust * 2, -54, -11 + gust * 4, -27); scribble(ctx, -11 + gust, -68, 23, 26, seed, P.sand);
  } else if (o.kind === 'sign' && o.variant === 1) {
    ctx.save(); ctx.beginPath(); ctx.rect(-27, -65, 55, 35); ctx.clip(); ctx.fillStyle = P.sage; ctx.fillRect(-27, -65, 55, 35);
    drawActorSprite(ctx, 'lady', 0, -28, Math.PI / 2, false, 0, time, .61, undefined, { reducedMotion, phaseOffset: phase, billboard: true }); ctx.restore();
  } else if (o.kind === 'machine' && o.variant === 2) {
    ctx.save(); ctx.beginPath(); ctx.rect(-13, -28, 26, 22); ctx.clip(); ctx.fillStyle = P.sage; ctx.fillRect(-13, -28, 26, 22);
    drawActorSprite(ctx, 'lady', 0, -7, Math.PI / 2, false, 0, time, .35, undefined, { reducedMotion, phaseOffset: phase, billboard: true });
    curve(ctx, rgba(P.lichen, .20), .8, -12, -18 + Math.sin(time * 2 + phase) * 7, 0, -18 + Math.sin(time * 2 + phase) * 7, 12, -17 + Math.sin(time * 2 + phase) * 7); ctx.restore();
  }
}
function drawIllustration(ctx: CanvasRenderingContext2D, o: WorldObject, time: number, fade = 1, reducedMotion = false) {
  if (o.kind === 'tree' || o.kind === 'willow') { drawTree(ctx, o, time, fade, reducedMotion); return; }
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
  if (o.kind === 'bush') ctx.transform(1, 0, gust * .016, 1 + Math.sin(time * .6 + o.x) * .009, 0, 0);
  if (o.kind === 'sign' && !o.variant) ctx.rotate(gust * .009);
  // Crop enormous facades before scaling their cached ink sheet. The castle extends far
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
      else curve(ctx, shade, impact.kind === 'wood' ? 1.8 : 1.3, xx - 2, yy - 1, xx, yy + 1, xx + 3, yy - 2);
    }
    if (impact.kind === 'hit') curve(ctx, rgba(P.umbra, .50), 2.5, -6, contactHeight - 4, 0, contactHeight + 2, 7, contactHeight - 6);
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
      curve(ctx, P.paper, z * .8, p.x + travel * z, p.y, p.x + (14 + travel) * z, p.y - swell * 2.1 * z, p.x + (28 + travel) * z, p.y + .3 * z);
      curve(ctx, P.water, z * .65, p.x + (4 + travel) * z, p.y + 3 * z, p.x + (17 + travel) * z, p.y + (3 - swell) * z, p.x + (24 + travel) * z, p.y + 3.5 * z);
    }
    if (!frame.reducedMotion && worldHash(x + 13, y + 29) > .80) {
      const age = (time * .3 + phase) % 1, radius = (3 + age * 15) * z;
      ctx.globalAlpha = (1 - age) * .17; ctx.strokeStyle = P.ash; ctx.lineWidth = .7 * z;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 8 * z, radius, radius * .35, -.12, 0, Math.PI * 2); ctx.stroke();
      if (age > .26) { ctx.beginPath(); ctx.ellipse(p.x, p.y + 8 * z, radius * .62, radius * .21, -.12, 0, Math.PI * 2); ctx.stroke(); }
    }
  }
  ctx.restore();
}
function roomWalls(ctx: CanvasRenderingContext2D, frame: RenderFrame, width: number, height: number) {
  const z = frame.zoom, scale = TILE_SIZE * z, top = position(frame, 1, 1, width, height), rw = (frame.scene.width - 2) * scale;
  panel(ctx, top.x, top.y, rw, scale * 1.3, P.fog, 22);
  for (let xx = top.x + 9; xx < top.x + rw - 4; xx += 27 * z) curve(ctx, rgba(P.umbra, .22), z, xx, top.y + 5, xx + 3, top.y + scale * .6, xx + 1, top.y + scale * 1.25);
  curve(ctx, P.moss, 1.3 * z, top.x + 3, top.y + scale * .32, top.x + rw / 2, top.y + scale * .5, top.x + rw - 3, top.y + scale * .28);
  scribble(ctx, top.x + 29 * z, top.y + 12 * z, 86 * z, 10 * z, 61, rgba(P.charcoal, .30));
  const bottom = position(frame, 1, frame.scene.height - 1.3, width, height), gap = 2.4 * scale;
  panel(ctx, bottom.x, bottom.y, rw / 2 - gap / 2, scale * .36, P.water, 35); panel(ctx, bottom.x + rw / 2 + gap / 2, bottom.y, rw / 2 - gap / 2, scale * .36, P.water, 37);
  if (frame.scene.exit) { const p = position(frame, frame.scene.exit.positionInRoom.x, frame.scene.exit.positionInRoom.y, width, height); label(ctx, '↓ Outside', p.x, p.y + 10 * z, P.paper, '12px "Patrick Hand", sans-serif'); }
}

export function renderWorld(ctx: CanvasRenderingContext2D, frame: RenderFrame, width: number, height: number) {
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.clearRect(0, 0, width, height); ctx.fillStyle = P.slate; ctx.fillRect(0, 0, width, height);
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
  for (const particle of frame.particles) { const p = position(frame, particle.x, particle.y, width, height); if (Math.abs(particle.x - frame.camera.x) > hw || Math.abs(particle.y - frame.camera.y) > hh) continue; ctx.save(); ctx.globalAlpha = Math.min(.75, particle.life / Math.max(.01, particle.maxLife)); if (particle.kind === 'smoke' || particle.kind === 'dust') blob(ctx, p.x, p.y, particle.size * zoom, particle.size * zoom * .7, particle.color, particle.maxLife * 18); else curve(ctx, particle.color, Math.max(.8, particle.size * zoom * .5), p.x, p.y, p.x + particle.size * zoom, p.y - particle.size * zoom * .4, p.x + particle.size * zoom * 1.3, p.y + zoom); ctx.restore(); }
  // Air arrives as drifting erased planes and a few ink slashes, never a soft-focus filter.
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
  // Uneven edge rubbings frame the sheet without gradients or a simulated lens.
  shape(ctx, [0, 0, width * .22, 0, width * .09, height * .11, 0, height * .24], rgba(P.ink, .10), '', 0);
  shape(ctx, [width, height * .69, width, height, width * .66, height, width * .89, height * .93], rgba(P.ink, .09), '', 0);
  // A sparse rubbing of paper fibres unifies the moving objects and the cached ground illustration.
  ctx.save(); ctx.globalAlpha = .09; hatch(ctx, 0, 0, width, height, 519, PAPER, 72); ctx.restore(); ctx.restore();
}
