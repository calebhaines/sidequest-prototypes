import headsSource from '../assets/torn-paper/heads.png';
import scenerySource from '../assets/torn-paper/scenery.png';
import residentsSource from '../assets/torn-paper/heads-residents.png';
import residentsTwoSource from '../assets/torn-paper/heads-residents-two.png';
import partsSource from '../assets/torn-paper/parts.png';
import studySource from '../assets/torn-paper/study.png';
import { PALETTE as P } from './palette';
import { paperShape } from './paper';

/** Native, replaceable paper cutouts. Vite embeds these same images in the offline HTML. */
export const paperStudyUrl = studySource;
type Cutout = { image: HTMLImageElement; x: number; y: number; width: number; height: number };
const cutouts = new Map<string, Cutout>();
const sheets = new Map<string, HTMLImageElement>();
const portraits = new Map<string, string>();
let pending: Promise<void> | null = null;
let revision = 0;
let ready = false;
const definitions = [
  { name: 'heads', source: headsSource, ids: ['lady-head', 'hare-head', 'bat-head', 'human-head', 'moth-head', 'ox-head'] },
  { name: 'scenery', source: scenerySource, ids: ['trailer', 'willow', 'bed', 'shelves', 'brain-machine', 'billboard'] },
  { name: 'residents', source: residentsSource, ids: ['gatekeeper-head', 'tortoise-head', 'otter-head', 'deer-head', 'mole-head', 'peacock-head'] },
  { name: 'residents-two', source: residentsTwoSource, ids: ['boar-head', 'mouse-head', 'fox-head', 'heron-head', 'merchant-head', 'salamander-head'] },
  { name: 'parts', source: partsSource, ids: ['gown', 'ada-coat', 'worker-coat', 'arm', 'bat-wing', 'moth-wing'] },
];

async function imageFrom(name: string, source: string): Promise<HTMLImageElement> {
  const existing = sheets.get(name);
  if (existing) return existing;
  const image = new Image();
  image.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('The paper artwork could not be loaded.'));
    image.src = source;
  });
  await image.decode();
  sheets.set(name, image);
  return image;
}

function registerCutouts(image: HTMLImageElement, ids: string[]): void {
  const width = image.naturalWidth / 3, height = image.naturalHeight / 2;
  if (!Number.isInteger(width) || !Number.isInteger(height)) throw new Error('The paper sheet has an invalid layout.');
  const measuring = document.createElement('canvas');
  measuring.width = width; measuring.height = height;
  const context = measuring.getContext('2d', { willReadFrequently: true })!;
  ids.forEach((id, index) => {
    const sx = index % 3 * width, sy = Math.floor(index / 3) * height;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, sx, sy, width, height, 0, 0, width, height);
    // Measure transparent margins once. The source artwork is never rewritten or filtered.
    const pixels = context.getImageData(0, 0, width, height).data;
    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] < 32) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (right < left || bottom < top) throw new Error('A paper cutout is missing.');
    const margin = 6;
    left = Math.max(0, left - margin); top = Math.max(0, top - margin);
    right = Math.min(width - 1, right + margin); bottom = Math.min(height - 1, bottom + margin);
    cutouts.set(id, { image, x: sx + left, y: sy + top, width: right - left + 1, height: bottom - top + 1 });
  });
}

/** Finish before mounting the world, so cached illustrations never retain a loading placeholder. */
export function loadPaperAssets(): Promise<void> {
  if (ready) return Promise.resolve();
  if (pending) return pending;
  pending = (async () => {
    const images = await Promise.all([
      ...definitions.map(sheet => imageFrom(sheet.name, sheet.source)),
      imageFrom('study', studySource),
    ]);
    definitions.forEach((sheet, index) => registerCutouts(images[index], sheet.ids));
    revision += 1; ready = true; portraits.clear();
  })().catch(error => { pending = null; throw error; });
  return pending;
}

export function paperAssetsRevision(): number { return revision; }
export function paperAssetAspect(id: string): number {
  const cutout = cutouts.get(id);
  return cutout ? cutout.width / cutout.height : 1;
}

/** Fit a cutout into the requested rectangle, retaining its aspect and anchoring it at the bottom. */
export function drawPaperAsset(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, width: number, height: number): boolean {
  const cutout = cutouts.get(id);
  if (!cutout || width <= 0 || height <= 0) return false;
  const scale = Math.min(width / cutout.width, height / cutout.height);
  const drawnWidth = cutout.width * scale, drawnHeight = cutout.height * scale;
  ctx.drawImage(cutout.image, cutout.x, cutout.y, cutout.width, cutout.height,
    x + (width - drawnWidth) / 2, y + height - drawnHeight, drawnWidth, drawnHeight);
  return true;
}

/** Jointed scenery can move strips of the native cutout while its rooted base stays fixed.
 * Source coordinates are proportions of the measured cutout; the destination is exact. */
export function drawPaperAssetRegion(ctx: CanvasRenderingContext2D, id: string,
  sx: number, sy: number, sw: number, sh: number,
  x: number, y: number, width: number, height: number): boolean {
  const cutout = cutouts.get(id);
  if (!cutout || sw <= 0 || sh <= 0 || width <= 0 || height <= 0) return false;
  const left = Math.max(0, Math.min(1, sx)), top = Math.max(0, Math.min(1, sy));
  const sourceWidth = Math.min(sw, 1 - left), sourceHeight = Math.min(sh, 1 - top);
  if (sourceWidth <= 0 || sourceHeight <= 0) return false;
  ctx.drawImage(cutout.image, cutout.x + cutout.width * left, cutout.y + cutout.height * top,
    cutout.width * sourceWidth, cutout.height * sourceHeight, x, y, width, height);
  return true;
}

export function paperAssetPortrait(id: string, size: number): string | null {
  if (!cutouts.has(id)) return null;
  const dimension = Math.max(24, Math.min(512, Math.round(size)));
  const key = `${revision}:${id}:${dimension}`;
  const existing = portraits.get(key);
  if (existing) return existing;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = dimension * 2;
  const ctx = canvas.getContext('2d')!; ctx.scale(2, 2);
  paperShape(ctx, [1, 2, dimension - 2, 0, dimension, dimension - 2, 2, dimension], P.paper, 731, .8);
  drawPaperAsset(ctx, id, dimension * .04, dimension * .02, dimension * .92, dimension * .98);
  const url = canvas.toDataURL('image/png');
  if (portraits.size >= 48) portraits.delete(portraits.keys().next().value!);
  portraits.set(key, url);
  return url;
}

export function paperAssetDiagnostics() {
  return { ready, revision, cutouts: [...cutouts.entries()].map(([id, cutout]) => ({ id, x: cutout.x, y: cutout.y, width: cutout.width, height: cutout.height })),
    decodedBytes: [...sheets.values()].reduce((bytes, image) => bytes + image.naturalWidth * image.naturalHeight * 4, 0) };
}
