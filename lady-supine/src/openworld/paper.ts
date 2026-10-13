import { PALETTE as P, pigment } from './palette';

/** Pasted, torn stock rather than a pen outline. All marks use the game's 24 pigments.
 * The tiny repeat sheets are original Canvas drawings, not edited image assets. */
type Bounds = [number, number, number, number];
type PaperTile = { canvas: HTMLCanvasElement; pattern: CanvasPattern | null };
type TornShape = { path: Path2D; bounds: Bounds; fibers: Path2D };

const TILE_SIZE = 128;
const TILE_SCALE = 2;
const TILE_LIMIT = 72; // 4.5 MiB of pixel surfaces at most; no full-world material canvases.
const SHAPE_LIMIT = 512;
const tiles = new Map<string, PaperTile>();
const shapes = new Map<string, TornShape>();

/** Stable grain and tears: a sheet never crawls or flickers when the camera moves. */
export function paperRandom(seed: number): () => number {
  let state = (Number.isFinite(seed) ? seed : 0) >>> 0;
  state ^= 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, state | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function sourceSeed(source: string): number {
  let value = 2166136261;
  for (let i = 0; i < source.length; i++) value = Math.imul(value ^ source.charCodeAt(i), 16777619);
  return value >>> 0;
}

function paperTile(ctx: CanvasRenderingContext2D, fill: string, seed: number): CanvasPattern | string {
  const colour = pigment(fill);
  const variant = (seed >>> 0) % 3;
  const key = `${colour}:${variant}`;
  let tile = tiles.get(key);
  if (tile) {
    tiles.delete(key); tiles.set(key, tile);
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TILE_SIZE;
    const brush = canvas.getContext('2d')!;
    brush.scale(TILE_SCALE, TILE_SCALE);
    const size = TILE_SIZE / TILE_SCALE;
    brush.fillStyle = colour; brush.fillRect(0, 0, size, size);
    const rng = paperRandom(sourceSeed(colour) + variant * 1973);

    // Low broad mottling keeps the stock imperfect, without a marker wash or a glossy gradient.
    for (let i = 0; i < 14; i++) {
      const x = rng() * size, y = rng() * size;
      brush.globalAlpha = .014 + rng() * .022;
      brush.fillStyle = i % 2 ? P.paper : P.ink;
      brush.beginPath(); brush.moveTo(x, y);
      for (let corner = 0; corner < 5; corner++) {
        const angle = corner * Math.PI * .4;
        const radius = 2 + rng() * 6;
        brush.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
      }
      brush.closePath(); brush.fill();
    }
    // Dense, small irregular flecks are paper pulp, not hatch marks or a digital pixel grid.
    for (let i = 0; i < 1200; i++) {
      const x = rng() * size, y = rng() * size;
      brush.globalAlpha = .035 + rng() * .105;
      brush.fillStyle = i % 3 ? P.chalk : P.ink;
      brush.beginPath();
      brush.ellipse(x, y, .15 + rng() * .42, .09 + rng() * .21, rng() * Math.PI, 0, Math.PI * 2);
      brush.fill();
    }
    brush.lineCap = 'butt';
    for (let i = 0; i < 180; i++) {
      const x = rng() * size, y = rng() * size, length = .35 + rng() * 1.8;
      brush.globalAlpha = .04 + rng() * .11;
      brush.strokeStyle = i % 4 ? P.paper : P.umbra;
      brush.lineWidth = .10 + rng() * .16;
      brush.beginPath(); brush.moveTo(x, y);
      brush.lineTo(x + length, y + (rng() - .5) * .8); brush.stroke();
    }
    tile = { canvas, pattern: null };
    while (tiles.size >= TILE_LIMIT) tiles.delete(tiles.keys().next().value!);
    tiles.set(key, tile);
  }
  if (!tile.pattern) {
    tile.pattern = ctx.createPattern(tile.canvas, 'repeat');
    tile.pattern?.setTransform(new DOMMatrix().scale(1 / TILE_SCALE));
  }
  return tile.pattern || colour;
}

/** Fills the given bounds with paper, respecting the caller's current clipping region.
 * Bounds and grain are in drawing coordinates, so rotated scraps retain their own fibers. */
export function paperTexture(
  ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number,
  fill: string, seed = 0,
): void {
  if (!(width > 0 && height > 0)) return;
  ctx.save();
  ctx.fillStyle = paperTile(ctx, fill, seed);
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

function tornShape(points: number[], seed: number, edge: number): TornShape | null {
  if (points.length < 6 || points.length % 2 || !points.every(Number.isFinite)) return null;
  const tear = Math.max(0, Math.min(5, edge));
  const key = `${seed >>> 0}:${tear}:${points.join(',')}`;
  const cached = shapes.get(key);
  if (cached) {
    shapes.delete(key); shapes.set(key, cached);
    return cached;
  }
  const rng = paperRandom(seed ^ sourceSeed(points.join(',')));
  const count = points.length / 2;
  let area = 0;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    area += points[i * 2] * points[j * 2 + 1] - points[j * 2] * points[i * 2 + 1];
  }
  const winding = area >= 0 ? 1 : -1;
  const outline: number[] = [], fibers = new Path2D();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x: number, y: number) => {
    outline.push(x, y);
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const x = points[i * 2], y = points[i * 2 + 1];
    const dx = points[j * 2] - x, dy = points[j * 2 + 1] - y;
    const length = Math.hypot(dx, dy);
    add(x, y);
    if (length < .15 || !tear) continue;
    const nx = dy / length * winding, ny = -dx / length * winding;
    const divisions = Math.max(2, Math.min(100, Math.ceil(length / (1.5 + tear * .6))));
    for (let step = 1; step < divisions; step++) {
      const along = (step + (rng() - .5) * .5) / divisions;
      const offset = (rng() - .54) * tear * .93;
      const px = x + dx * along + nx * offset;
      const py = y + dy * along + ny * offset;
      add(px, py);
      if (rng() < .36) {
        // Actual little irregular pale protrusions, rather than a continuous outlined border.
        const exposure = (.24 + rng() * .62) * tear;
        fibers.moveTo(px - nx * tear * .12, py - ny * tear * .12);
        fibers.lineTo(px + nx * exposure + dx / length * .25, py + ny * exposure + dy / length * .25);
      }
    }
  }
  const path = new Path2D(); path.moveTo(outline[0], outline[1]);
  for (let i = 2; i < outline.length; i += 2) path.lineTo(outline[i], outline[i + 1]);
  path.closePath();
  const margin = tear + .1;
  const shape: TornShape = { path, fibers, bounds: [minX - margin, minY - margin, maxX - minX + margin * 2, maxY - minY + margin * 2] };
  while (shapes.size >= SHAPE_LIMIT) shapes.delete(shapes.keys().next().value!);
  shapes.set(key, shape);
  return shape;
}

function overlapShadow(ctx: CanvasRenderingContext2D, path: Path2D, edge: number): void {
  if (edge <= 0) return;
  ctx.save(); ctx.translate(edge * .55, edge * .8);
  ctx.globalAlpha *= .10; ctx.fillStyle = P.ink; ctx.fill(path); ctx.restore();
}

function exposedEdge(ctx: CanvasRenderingContext2D, path: Path2D, seed: number, edge: number): void {
  if (edge <= 0) return;
  const rng = paperRandom(seed + 173);
  ctx.save();
  ctx.strokeStyle = P.paper; ctx.lineCap = 'butt'; ctx.lineJoin = 'bevel';
  ctx.globalAlpha *= .72; ctx.lineWidth = edge * .53;
  ctx.setLineDash([.13 + rng() * .8, .1 + rng() * .38, .45 + rng() * .8, .08 + rng() * .34]);
  ctx.lineDashOffset = rng() * 7; ctx.stroke(path);
  ctx.globalAlpha *= .55; ctx.strokeStyle = P.chalk; ctx.lineWidth = edge * .25;
  ctx.setLineDash([.15, .6, .23, .9]); ctx.lineDashOffset = rng() * 9; ctx.stroke(path);
  ctx.restore();
}

/** Pasted polygon with a genuinely irregular silhouette, exposed pulp, and a quiet overlap shadow.
 * Set edge to zero for a sharp scissors-cut facet. */
export function paperShape(
  ctx: CanvasRenderingContext2D, points: number[], fill: string, seed = 0, edge = .7,
): void {
  const tear = Number.isFinite(edge) ? Math.max(0, Math.min(5, edge)) : .7;
  const shape = tornShape(points, seed, tear);
  if (!shape) return;
  overlapShadow(ctx, shape.path, tear);
  ctx.save(); ctx.clip(shape.path);
  paperTexture(ctx, ...shape.bounds, fill, seed);
  ctx.restore();
  exposedEdge(ctx, shape.path, seed, tear);
  if (tear > 0) {
    ctx.save(); ctx.strokeStyle = P.paper; ctx.globalAlpha *= .65;
    ctx.lineWidth = Math.max(.12, tear * .28); ctx.lineCap = 'butt'; ctx.setLineDash([]);
    ctx.stroke(shape.fibers); ctx.restore();
  }
}

/** Curved cut-paper art keeps its exact anatomy but receives grain and broken exposed paper edges.
 * Prefer paperShape for long polygon edges that should visibly tear into an uneven silhouette. */
export function paperPath(
  ctx: CanvasRenderingContext2D, path: Path2D, fill: string, bounds: Bounds, seed = 0, edge = .7,
): void {
  const tear = Number.isFinite(edge) ? Math.max(0, Math.min(5, edge)) : .7;
  overlapShadow(ctx, path, tear);
  ctx.save(); ctx.clip(path);
  paperTexture(ctx, ...bounds, fill, seed);
  ctx.restore();
  exposedEdge(ctx, path, seed, tear);
}

/** A thin broken overlap seam, useful for pasted folds, machinery, shelves, and facial detail. */
export function paperSeam(
  ctx: CanvasRenderingContext2D, points: number[], color: string = P.umbra, width = .45,
): void {
  if (points.length < 4 || points.length % 2 || !points.every(Number.isFinite) || width <= 0) return;
  ctx.save(); ctx.strokeStyle = pigment(color); ctx.lineWidth = width;
  ctx.lineCap = 'butt'; ctx.lineJoin = 'bevel'; ctx.setLineDash([3.8, .45, 1.7, .75]);
  ctx.beginPath(); ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.stroke(); ctx.restore();
}

/** Small, read-only counters for the existing performance diagnostics. */
export function paperDiagnostics(): { materialTiles: number; materialBytes: number; tornPaths: number } {
  return { materialTiles: tiles.size, materialBytes: tiles.size * TILE_SIZE * TILE_SIZE * 4, tornPaths: shapes.size };
}
