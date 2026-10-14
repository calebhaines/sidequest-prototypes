import { PALETTE as P, pigment } from './palette';

/** Photographic stocks and smooth scissor cuts. Source PNGs remain unmodified;
 * small runtime surfaces keep photo material and silhouettes cheap to draw. */
type Bounds = [number, number, number, number];
type PhotoTile = { canvas: HTMLCanvasElement; pattern: CanvasPattern | null };
type CutShape = { path: Path2D; bounds: Bounds };
const TILE_SIZE = 128, TILE_LIMIT = 72, SHAPE_LIMIT = 512;
const tiles = new Map<string, PhotoTile>();
const shapes = new Map<string, CutShape>();
let materialImage: HTMLImageElement | null = null;
let materialRevision = 0;

export function installPhotoMaterials(image: HTMLImageElement): void {
  materialImage = image; materialRevision += 1; tiles.clear();
}

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

function materialCell(colour: string): number {
  const base = colour.slice(0, 7);
  if (base === P.water || base === P.deepWater) return 4;
  if (base === P.rust || base === P.ember || base === P.slate || base === P.charcoal) return 2;
  if (base === P.umbra) return 3;
  if (base === P.clay || base === P.bark || base === P.ochre || base === P.sand || base === P.fog || base === P.ash) return 1;
  if (base === P.pine || base === P.lichen) return 5;
  return 0;
}

function photoTile(ctx: CanvasRenderingContext2D, fill: string, seed: number): CanvasPattern | string {
  const colour = pigment(fill);
  // Printed transparent inks, shadows and glazing must keep their actual opacity.
  if (!materialImage || colour.length === 9) return colour;
  const variant = (seed >>> 0) % 3, cell = materialCell(colour);
  const key = `${materialRevision}:${colour}:${variant}`;
  let tile = tiles.get(key);
  if (tile) { tiles.delete(key); tiles.set(key, tile); }
  else {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = TILE_SIZE;
    const brush = canvas.getContext('2d')!;
    const width = materialImage.naturalWidth / 3, height = materialImage.naturalHeight / 2;
    brush.fillStyle = colour; brush.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    // A slight crop variation avoids repeating one recognizable grain feature.
    const inset = variant * 8;
    brush.drawImage(materialImage, cell % 3 * width + inset, Math.floor(cell / 3) * height + inset,
      width - inset * 2, height - inset * 2, 0, 0, TILE_SIZE, TILE_SIZE);
    brush.globalAlpha = cell === 0 ? .43 : .22;
    brush.fillStyle = colour; brush.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    tile = { canvas, pattern: null };
    while (tiles.size >= TILE_LIMIT) tiles.delete(tiles.keys().next().value!);
    tiles.set(key, tile);
  }
  if (!tile.pattern) {
    tile.pattern = ctx.createPattern(tile.canvas, 'repeat');
    tile.pattern?.setTransform(new DOMMatrix().scale(.8));
  }
  return tile.pattern || colour;
}

export function paperTexture(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, fill: string, seed = 0): void {
  if (!(width > 0 && height > 0)) return;
  ctx.save(); ctx.fillStyle = photoTile(ctx, fill, seed); ctx.fillRect(x, y, width, height); ctx.restore();
}

function scissorShape(points: number[], edge: number): CutShape | null {
  if (points.length < 6 || points.length % 2 || !points.every(Number.isFinite)) return null;
  const radius = Math.min(2, Math.max(0, edge)) * .6;
  const key = `${radius}:${points.join(',')}`;
  const existing = shapes.get(key);
  if (existing) { shapes.delete(key); shapes.set(key, existing); return existing; }
  const count = points.length / 2, path = new Path2D();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const corners: { x: number; y: number; ax: number; ay: number; bx: number; by: number }[] = [];
  for (let i = 0; i < count; i++) {
    const x = points[i * 2], y = points[i * 2 + 1];
    const previous = (i + count - 1) % count, next = (i + 1) % count;
    const px = points[previous * 2] - x, py = points[previous * 2 + 1] - y;
    const nx = points[next * 2] - x, ny = points[next * 2 + 1] - y;
    const pl = Math.hypot(px, py), nl = Math.hypot(nx, ny);
    const r = Math.min(radius, pl * .2, nl * .2);
    corners.push({ x, y, ax: x + px / (pl || 1) * r, ay: y + py / (pl || 1) * r,
      bx: x + nx / (nl || 1) * r, by: y + ny / (nl || 1) * r });
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  path.moveTo(corners[0].ax, corners[0].ay);
  for (const corner of corners) { path.lineTo(corner.ax, corner.ay); path.quadraticCurveTo(corner.x, corner.y, corner.bx, corner.by); }
  path.closePath();
  const shape = { path, bounds: [minX - 1, minY - 1, maxX - minX + 2, maxY - minY + 2] as Bounds };
  while (shapes.size >= SHAPE_LIMIT) shapes.delete(shapes.keys().next().value!);
  shapes.set(key, shape); return shape;
}

function clippedPhoto(ctx: CanvasRenderingContext2D, path: Path2D, fill: string, bounds: Bounds, seed: number, edge: number): void {
  if (edge > 0) {
    ctx.save(); ctx.translate(edge * .65, edge * .8); ctx.globalAlpha *= .14; ctx.fillStyle = P.ink; ctx.fill(path); ctx.restore();
  }
  ctx.save(); ctx.clip(path); paperTexture(ctx, ...bounds, fill, seed); ctx.restore();
  if (edge > 0) {
    ctx.save(); ctx.strokeStyle = P.paper; ctx.lineWidth = Math.min(1.4, edge * .65);
    ctx.globalAlpha *= .8; ctx.lineJoin = 'round'; ctx.setLineDash([]); ctx.stroke(path); ctx.restore();
  }
}

export function paperShape(ctx: CanvasRenderingContext2D, points: number[], fill: string, seed = 0, edge = .7): void {
  const cut = scissorShape(points, edge);
  if (cut) clippedPhoto(ctx, cut.path, fill, cut.bounds, seed, edge);
}
export function paperPath(ctx: CanvasRenderingContext2D, path: Path2D, fill: string, bounds: Bounds, seed = 0, edge = .7): void {
  clippedPhoto(ctx, path, fill, bounds, seed, edge);
}

/** Clean printed seams remain useful for cords, machinery, map legends and scales. */
export function paperSeam(ctx: CanvasRenderingContext2D, points: number[], color: string = P.umbra, width = .45): void {
  if (points.length < 4 || points.length % 2 || !points.every(Number.isFinite) || width <= 0) return;
  ctx.save(); ctx.strokeStyle = pigment(color); ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.stroke(); ctx.restore();
}

export function paperDiagnostics() {
  return { materialTiles: tiles.size, materialBytes: tiles.size * TILE_SIZE * TILE_SIZE * 4,
    tornPaths: shapes.size, scissorPaths: shapes.size, photographic: Boolean(materialImage) };
}
