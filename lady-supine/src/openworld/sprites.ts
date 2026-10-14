import type { ActorKind, Vec } from './types';
import { PALETTE as P, pigment } from './palette';
import { paperTexture } from './paper';
import { drawPaperAsset, drawPaperAssetRegion, paperAssetAspect, paperAssetsRevision } from './paperAssets';

/** Photographic inhabitants are assembled from separately articulated scissor-cut pieces.
 * Continuous feet, wrists and head sockets retain the physical action anchors. */
export type SpriteSheetOptions = { frameWidth: number; frameHeight: number; columns?: number; rows?: number; feetX?: number; feetY?: number };
export type ActorDrawingState = {
  asleep?: boolean; mindChanged?: boolean; brainAbsent?: boolean;
  reducedMotion?: boolean; pace?: number; action?: number; hurt?: number;
  phaseOffset?: number; billboard?: boolean;
};
const replacementSheets = new Map<ActorKind, { image: HTMLImageElement; options: SpriteSheetOptions }>();
let assetRevision = -1;
const iconCache = new Map<string, string>();
const itemCanvasCache = new Map<string, HTMLCanvasElement>();
const portraitCache = new Map<string, string>();
type PaintedPart = { canvas: HTMLCanvasElement; x: number; y: number; width: number; height: number };
const partCache = new Map<string, PaintedPart>();
const PART_CACHE_BYTES = 20 * 1024 * 1024;
let paintedBytes = 0;
let nativeBatWing = false;
const INK: string = P.ink;

type Palette = { coat: string; shade: string; trim: string; face: string; faceShade: string; hair: string };
const palettes: Record<ActorKind, Palette> = {
  human: { coat: P.deepWater, shade: P.charcoal, trim: P.sand, face: P.paper, faceShade: P.clay, hair: P.umbra },
  lady: { coat: P.ink, shade: P.charcoal, trim: P.paper, face: P.chalk, faceShade: P.flesh, hair: P.ink },
  gatekeeper: { coat: P.bark, shade: P.umbra, trim: P.paper, face: P.sand, faceShade: P.clay, hair: P.charcoal },
  moth: { coat: P.smoke, shade: P.charcoal, trim: P.paper, face: P.paper, faceShade: P.ash, hair: P.ink },
  hare: { coat: P.fog, shade: P.deepWater, trim: P.paper, face: P.paper, faceShade: P.sand, hair: P.umbra },
  ox: { coat: P.clay, shade: P.umbra, trim: P.sand, face: P.bark, faceShade: P.umbra, hair: P.ink },
  tortoise: { coat: P.paper, shade: P.smoke, trim: P.ash, face: P.sage, faceShade: P.pine, hair: P.moss },
  otter: { coat: P.deepWater, shade: P.ink, trim: P.sand, face: P.clay, faceShade: P.bark, hair: P.umbra },
  deer: { coat: P.rust, shade: P.umbra, trim: P.ash, face: P.sand, faceShade: P.clay, hair: P.bark },
  mole: { coat: P.ochre, shade: P.umbra, trim: P.paper, face: P.smoke, faceShade: P.slate, hair: P.ink },
  peacock: { coat: P.water, shade: P.deepWater, trim: P.straw, face: P.fog, faceShade: P.smoke, hair: P.ink },
  bat: { coat: P.bruise, shade: P.ink, trim: P.ochre, face: P.ash, faceShade: P.slate, hair: P.charcoal },
  boar: { coat: P.bark, shade: P.umbra, trim: P.sand, face: P.clay, faceShade: P.umbra, hair: P.charcoal },
  mouse: { coat: P.bruise, shade: P.charcoal, trim: P.ash, face: P.ash, faceShade: P.smoke, hair: P.ink },
  fox: { coat: P.deepWater, shade: P.charcoal, trim: P.sand, face: P.ember, faceShade: P.rust, hair: P.umbra },
  heron: { coat: P.fog, shade: P.slate, trim: P.paper, face: P.paper, faceShade: P.ash, hair: P.ink },
  merchant: { coat: P.ochre, shade: P.umbra, trim: P.straw, face: P.sand, faceShade: P.clay, hair: P.ink },
  salamander: { coat: P.bark, shade: P.umbra, trim: P.sand, face: P.lichen, faceShade: P.moss, hair: P.pine },
};

/** Where a real organ enters the head, in unscaled drawing coordinates relative to the feet. */
export function actorHeadAnchor(kind: ActorKind): Vec {
  if (kind === 'lady') {
    const h = Math.min(42, 54 / Math.max(.5, paperAssetAspect('lady-head')));
    return { x: 0, y: -27 - h * .87 };
  }
  if (kind === 'hare') {
    const h = Math.min(38, 26 / Math.max(.5, paperAssetAspect('hare-head')));
    return { x: 0, y: -28 - h * .61 };
  }
  return { x: 0, y: -42 };
}

export function registerSpriteSheet(kind: ActorKind, source: string, options: SpriteSheetOptions): void {
  const image = new Image(); image.src = source; replacementSheets.set(kind, { image, options });
}
export function clearSpriteSheet(kind: ActorKind): void { replacementSheets.delete(kind); }

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}
const paperPaths = new Map<string, Path2D>();
function shapePath(path: string): Path2D {
  let found = paperPaths.get(path);
  if (!found) { found = new Path2D(path); if (paperPaths.size > 1400) paperPaths.delete(paperPaths.keys().next().value!); paperPaths.set(path, found); }
  return found;
}
/** Small photographic eyelid creases and expression cues remain unobtrusive. */
function pen(ctx: CanvasRenderingContext2D, path: string, color = INK, width = .8): void {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(shapePath(path)); ctx.restore();
}

function refreshPaperCaches(): void {
  const next = paperAssetsRevision();
  if (next === assetRevision) return;
  assetRevision = next; partCache.clear(); paintedBytes = 0; nativeBatWing = false;
  iconCache.clear(); itemCanvasCache.clear(); portraitCache.clear();
}

function paintedPart(ctx: CanvasRenderingContext2D, key: string, bounds: [number, number, number, number], paint: (ctx: CanvasRenderingContext2D) => void): void {
  let part = partCache.get(key);
  if (part) {
    // Frequently drawn inhabitants retain their layers as new districts introduce more clothing and faces.
    partCache.delete(key); partCache.set(key, part);
  }
  if (!part) {
    const [x, y, width, height] = bounds;
    const canvas = document.createElement('canvas'); canvas.width = width * 3; canvas.height = height * 3;
    const brush = canvas.getContext('2d')!; brush.scale(3, 3); brush.translate(-x, -y); paint(brush);
    part = { canvas, x, y, width, height };
    const bytes = canvas.width * canvas.height * 4;
    // A pixel budget keeps many small wrists and ears without treating them like large head paintings.
    while (partCache.size && paintedBytes + bytes > PART_CACHE_BYTES) {
      const oldest = partCache.keys().next().value!;
      const removed = partCache.get(oldest)!;
      paintedBytes -= removed.canvas.width * removed.canvas.height * 4; partCache.delete(oldest);
    }
    paintedBytes += bytes;
    partCache.set(key, part);
  }
  ctx.drawImage(part.canvas, part.x, part.y, part.width, part.height);
}
function articulatedPart(ctx: CanvasRenderingContext2D, key: string, bounds: [number, number, number, number], paint: (ctx: CanvasRenderingContext2D) => void, x: number, y: number, angle: number, lift = 0): void {
  ctx.save(); ctx.translate(x, y + lift); ctx.rotate(angle); ctx.translate(-x, -y); paintedPart(ctx, key, bounds, paint); ctx.restore();
}

function wingsAndTails(ctx: CanvasRenderingContext2D, kind: ActorKind, _p: Palette, _sway: number, _time: number, wingSide = 0): void {
  if (kind === 'moth') {
    for (const side of [-1, 1]) {
      if (wingSide && side !== wingSide) continue;
      ctx.save(); ctx.scale(side, 1); ctx.translate(2.5, -29);
      drawPaperAsset(ctx, 'moth-wing', -1, -13, 27, 35); ctx.restore();
    }
  } else if (kind === 'tortoise') {
    drawPaperAsset(ctx, 'tortoise-shell', -18, -34, 36, 29);
  } else if (kind === 'fox') {
    ctx.save(); ctx.translate(5, -9); ctx.rotate(-.18);
    drawPaperAsset(ctx, 'fox-tail', 0, -19, 27, 30); ctx.restore();
  } else if (kind === 'otter' || kind === 'salamander' || kind === 'mouse') {
    // Narrow photographic fur/skin strips make the tail flexible without a drawn mask.
    ctx.save(); ctx.translate(6, -10); ctx.rotate(kind === 'mouse' ? -.85 : -.48);
    const id = kind === 'otter' ? 'fox-tail' : 'arm';
    drawPaperAssetRegion(ctx, id, .25, .12, .3, .45, -2, -2, kind === 'mouse' ? 2.7 : 5, 23); ctx.restore();
  } else if (kind === 'peacock') {
    // The crest's genuine peacock feather photographs become a clipped, articulated fan.
    for (const side of [-1, 0, 1]) {
      ctx.save(); ctx.translate(side * 2, -12); ctx.rotate(side * .5);
      drawPaperAssetRegion(ctx, 'peacock-head', .24, 0, .49, .31, -12, -32, 24, 34); ctx.restore();
    }
  }
}

function leg(ctx: CanvasRenderingContext2D, side: number, gait: number, kind: ActorKind): void {
  const thin = kind === 'heron', wide = kind === 'ox' || kind === 'boar';
  const w = thin ? 3 : kind === 'lady' ? 4.2 : wide ? 6 : 5;
  ctx.save(); ctx.translate(side * (wide ? 5.6 : 3.8), -13); ctx.rotate(gait * side * .2);
  if (side < 0) ctx.scale(-1, 1);
  drawPaperAssetRegion(ctx, 'trouser-leg', 0, 0, 1, 1, -w / 2, -1, w, 11.5);
  drawPaperAsset(ctx, 'boot', -w / 2 - 1, 8.3, w + 3.1, 6.2); ctx.restore();
}

function torso(ctx: CanvasRenderingContext2D, kind: ActorKind, _p: Palette, back: boolean): void {
  const wide = kind === 'ox' || kind === 'boar';
  const garment = kind === 'lady' ? 'gown' : kind === 'hare' || kind === 'human' || kind === 'moth' ? 'ada-coat' : 'worker-coat';
  const width = kind === 'lady' ? 20 : wide ? 28 : kind === 'heron' ? 17 : 22;
  const height = kind === 'lady' ? 23 : kind === 'hare' || kind === 'merchant' || kind === 'moth' ? 29 : 25;
  if (!back) drawPaperAssetRegion(ctx, garment, 0, 0, 1, 1, -width / 2, -32, width, height);
  else {
    // The rear is a smooth cut from the same photographed fabric. Front buttons never float on a back.
    ctx.save(); ctx.beginPath();
    ctx.moveTo(-width * .37, -32); ctx.lineTo(width * .37, -32);
    ctx.lineTo(width * .48, -32 + height); ctx.lineTo(-width * .48, -32 + height); ctx.closePath(); ctx.clip();
    drawPaperAssetRegion(ctx, garment, .30, .48, .32, .39, -width / 2, -32, width, height); ctx.restore();
  }
}

const headAssetIds: Record<ActorKind, string> = {
  lady: 'lady-head', human: 'human-head', hare: 'hare-head', moth: 'moth-head', ox: 'ox-head', bat: 'bat-head',
  gatekeeper: 'gatekeeper-head', tortoise: 'tortoise-head', otter: 'otter-head', deer: 'deer-head', mole: 'mole-head', peacock: 'peacock-head',
  boar: 'boar-head', mouse: 'mouse-head', fox: 'fox-head', heron: 'heron-head', merchant: 'merchant-head', salamander: 'salamander-head',
};
type FaceLayout = { bounds: [number, number, number, number]; eyes: [number, number][]; mouth: [number, number]; crown: number };
const faceLayouts: Partial<Record<ActorKind, FaceLayout>> = {
  lady: { bounds: [-27, -24, 54, 42], eyes: [[.405, .398], [.705, .43]], mouth: [.51, .70], crown: .13 },
  hare: { bounds: [-13, -29, 26, 38], eyes: [[.385, .59], [.58, .625]], mouth: [.48, .79], crown: .39 },
  human: { bounds: [-11, -17, 23, 30], eyes: [[.38, .435], [.67, .47]], mouth: [.52, .72], crown: .05 },
  moth: { bounds: [-12, -20, 24, 32], eyes: [[.39, .51], [.64, .55]], mouth: [.52, .77], crown: .13 },
  ox: { bounds: [-15, -20, 30, 33], eyes: [[.40, .51], [.66, .54]], mouth: [.51, .80], crown: .16 },
  bat: { bounds: [-15, -20, 30, 27], eyes: [[.455, .44], [.60, .44]], mouth: [.52, .72], crown: .15 },
  gatekeeper: { bounds: [-12, -18, 24, 31], eyes: [[.487, .482], [.742, .51]], mouth: [.52, .79], crown: .1 },
  tortoise: { bounds: [-12, -18, 24, 31], eyes: [[.423, .479], [.69, .54]], mouth: [.55, .76], crown: .08 },
  otter: { bounds: [-12, -18, 24, 31], eyes: [[.448, .435], [.687, .472]], mouth: [.52, .74], crown: .12 },
  deer: { bounds: [-13, -23, 26, 35], eyes: [[.381, .521], [.577, .555]], mouth: [.49, .78], crown: .31 },
  mole: { bounds: [-12, -18, 24, 31], eyes: [[.43, .46], [.681, .506]], mouth: [.53, .75], crown: .13 },
  peacock: { bounds: [-12, -23, 24, 35], eyes: [[.49, .54], [.725, .583]], mouth: [.57, .78], crown: .30 },
  boar: { bounds: [-14, -18, 28, 32], eyes: [[.429, .471], [.674, .526]], mouth: [.53, .78], crown: .11 },
  mouse: { bounds: [-12, -18, 24, 31], eyes: [[.46, .46], [.718, .506]], mouth: [.55, .75], crown: .14 },
  fox: { bounds: [-12, -20, 24, 32], eyes: [[.518, .506], [.736, .553]], mouth: [.61, .76], crown: .26 },
  heron: { bounds: [-12, -20, 24, 32], eyes: [[.553, .495], [.796, .520]], mouth: [.55, .78], crown: .17 },
  merchant: { bounds: [-12, -18, 24, 31], eyes: [[.438, .474], [.672, .539]], mouth: [.52, .76], crown: .12 },
  salamander: { bounds: [-12, -18, 24, 31], eyes: [[.45, .43], [.727, .49]], mouth: [.55, .76], crown: .13 },


};
function faceLayout(kind: ActorKind): FaceLayout {
  return faceLayouts[kind] || { bounds: [-12, -18, 24, 31], eyes: [[.365, .46], [.65, .47]], mouth: [.51, .77], crown: .1 };
}
function headCentre(kind: ActorKind): number { return kind === 'lady' ? -45 : kind === 'heron' ? -42 : kind === 'human' ? -38.4 : -37; }
function rearHeadId(kind: ActorKind): string {
  if (kind === 'lady') return 'lady-back';
  if (kind === 'hare' || kind === 'deer' || kind === 'mole' || kind === 'moth') return 'hare-back';
  if (kind === 'fox') return 'red-back';
  if (kind === 'salamander') return 'mottled-back';
  if (kind === 'ox' || kind === 'heron' || kind === 'tortoise' || kind === 'gatekeeper') return 'gray-back';
  return 'human-back';
}


/** Lids, lips and rear views are clipped from the actual photograph; facial planes are never painted over. */
function generatedHead(ctx: CanvasRenderingContext2D, kind: ActorKind, side: boolean, back: boolean, blink: boolean, state: ActorDrawingState, kiss: boolean, articulatedEars = false): boolean {
  const id = headAssetIds[kind], layout = faceLayout(kind), bounds = layout.bounds;
  ctx.save(); if (side && kind !== 'lady') ctx.scale(.84, 1);
  const aspect = paperAssetAspect(id), w = Math.min(bounds[2], bounds[3] * aspect), h = Math.min(bounds[3], bounds[2] / aspect);
  const left = bounds[0] + (bounds[2] - w) / 2, top = bounds[1] + bounds[3] - h;
  ctx.save();
  if (back) {
    // Only actual animal fragments surround the rear photograph; the front face is never visible behind it.
    ctx.beginPath();
    if (kind !== 'lady' && kind !== 'human' && kind !== 'tortoise' && kind !== 'salamander') {
      const crown = Math.max(.15, layout.crown + .045);
      if (!(articulatedEars && kind === 'hare')) ctx.rect(left, top, w, h * crown);
      if (kind !== 'hare' && kind !== 'heron') {
        ctx.rect(left, top, w * (kind === 'bat' ? .32 : .20), h * .64);
        ctx.rect(left + w * (kind === 'bat' ? .72 : .82), top, w * .28, h * .64);
      }
    }
    ctx.clip();
  } else if (articulatedEars && kind === 'hare') { ctx.beginPath(); ctx.rect(left - 1, top + h * .4, w + 2, h * .61); ctx.clip(); }
  const drawn = drawPaperAsset(ctx, id, ...bounds); ctx.restore();
  if (!drawn) { ctx.restore(); return false; }
  const skinSample = (u: number, v: number, x: number, y: number, width: number, height: number) => {
    drawPaperAssetRegion(ctx, id, Math.max(0, u - .07), Math.min(.88, v + .058), .14, .075, x, y, width, height);
  };
  if (back) {
    if (kind === 'lady' || kind === 'human') drawPaperAsset(ctx, rearHeadId(kind), ...bounds);
    else {
      const crown = kind === 'bat' ? .15 : kind === 'hare' ? .26 : Math.max(.1, layout.crown);
      const rearWidth = w * (kind === 'bat' ? .52 : kind === 'hare' ? .77 : .75);
      const rearHeight = h * (1 - crown);
      drawPaperAssetRegion(ctx, rearHeadId(kind), 0, 0, 1, 1, left + w * .51 - rearWidth / 2, top + h * crown, rearWidth, rearHeight);
    }
  } else {
    if (blink || state.asleep) for (const [u, v] of layout.eyes) {
      const x = left + u * w, y = top + v * h, half = w * (kind === 'lady' ? .10 : .085);
      ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, half, h * .035 + .3, 0, 0, Math.PI * 2); ctx.clip();
      skinSample(u, v, x - half, y - h * .045, half * 2, h * .09); ctx.restore();
      pen(ctx, `M${x - half * .8} ${y} Q${x} ${y + .55} ${x + half * .8} ${y -.1}`, P.umbra, .3);
    }
    if (state.mindChanged) for (const [i, [u, v]] of layout.eyes.entries()) {
      const x = left + u * w, y = top + v * h, half = w * .08;
      pen(ctx, kind === 'hare' ? `M${x - half} ${y - (i ? .6 : 1.7)} L${x + half} ${y - (i ? 1.7 : .6)}` : `M${x - half} ${y - 1.6} Q${x} ${y - 2.4} ${x + half} ${y - 1.5}`, P.umbra, .34);
    }
    if (kiss && kind === 'lady') {
      const [u, v] = layout.mouth, x = left + u * w, y = top + v * h;
      ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, w * .125, h * .06, 0, 0, Math.PI * 2); ctx.clip();
      skinSample(u, v, x - w * .13, y - h * .065, w * .26, h * .13);
      drawPaperAssetRegion(ctx, id, u - .14, v - .055, .28, .11, x - w * .055, y - h * .06, w * .11, h * .13); ctx.restore();
    }
  }
  if (kind === 'lady' && !state.brainAbsent) {
    const x = left + w * .5, y = top + h * layout.crown;
    ctx.save(); ctx.globalAlpha *= .20;
    // Only a shallow glimpse lies below the black rim; no miniature organ projects above her skull.
    drawPaperAssetRegion(ctx, 'item-brain', 0, 0, 1, 1, x - w * .14, y + h * .035, w * .28, h * .035); ctx.restore();
  } else if (kind === 'hare' && state.brainAbsent) {
    // A clean dark surgical access opening, not another figurative thought symbol.
    const x = left + w * .5, y = top + h * layout.crown;
    ctx.fillStyle = P.ink; ctx.beginPath(); ctx.ellipse(x, y, w * .145, h * .032, -.03, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore(); return true;
}
function head(ctx: CanvasRenderingContext2D, kind: ActorKind, _p: Palette, side: boolean, back: boolean, blink: boolean, _time: number, state: ActorDrawingState, _gaze = 0, kiss = false, _detached = false): void {
  ctx.save(); ctx.translate(side && kind !== 'lady' ? 1.2 : 0, headCentre(kind));
  generatedHead(ctx, kind, side, back, blink, state, kiss, kind === 'hare'); ctx.restore();
}

function prop(ctx: CanvasRenderingContext2D, kind: ActorKind, gait: number, _p: Palette): void {
  ctx.save(); ctx.translate(kind === 'human' ? 11.2 : 9.5, -13 + gait * .65); ctx.rotate(gait * .08);
  const id = kind === 'human' ? 'item-lantern' : kind === 'gatekeeper' ? 'item-cane' : kind === 'tortoise' ? 'item-glass' : kind === 'hare' ? 'item-coupon' : kind === 'lady' ? 'item-key' : 'item-coupon';
  drawPaperAsset(ctx, id, -4, kind === 'gatekeeper' ? -21 : -7, 9, kind === 'gatekeeper' ? 31 : 13); ctx.restore();
}

function smooth(low: number, high: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

/** Cloth, a real forearm and a glove bend at separate elbow joints. */
function sleeve(ctx: CanvasRenderingContext2D, kind: ActorKind, lower: boolean): void {
  const lady = kind === 'lady', garment = lady ? 'gown' : kind === 'hare' || kind === 'human' || kind === 'moth' ? 'ada-coat' : 'worker-coat';
  if (!lower) {
    const w = lady ? 4.5 : 6.8;
    ctx.save(); ctx.beginPath(); ctx.moveTo(-w / 2, -.8); ctx.lineTo(w / 2, -.8); ctx.lineTo(w * .43, 7.7); ctx.lineTo(-w * .49, 7.9); ctx.closePath(); ctx.clip();
    drawPaperAssetRegion(ctx, garment, .07, .19, .27, .42, -w / 2, -1, w, 9); ctx.restore();
  } else if (lady) {
    drawPaperAssetRegion(ctx, 'yellow-glove', 0, 0, 1, 1, -2.7, -.2, 5.6, 11.5);
  } else {
    ctx.save(); ctx.beginPath(); ctx.moveTo(-2.8, -.5); ctx.lineTo(2.6, -.2); ctx.lineTo(2.7, 4); ctx.lineTo(-2.6, 4.5); ctx.closePath(); ctx.clip();
    drawPaperAssetRegion(ctx, garment, .11, .4, .22, .3, -3, -1, 6, 6); ctx.restore();
    drawPaperAssetRegion(ctx, 'arm', 0, .49, 1, .51, -3.9, 3.3, 8, 7.4);
  }
}
function bentArm(ctx: CanvasRenderingContext2D, key: string, _p: Palette, x: number, y: number, upper: number, lower: number): void {
  const kind = key.split(':')[0] as ActorKind;
  ctx.save(); ctx.translate(x, y); ctx.rotate(upper);
  paintedPart(ctx, `${key}:upper-sleeve`, [-7, -3, 14, 14], brush => sleeve(brush, kind, false));
  ctx.translate(-.4, 7.3); ctx.rotate(lower);
  paintedPart(ctx, `${key}:wrist`, [-8, -6, 16, 21], brush => sleeve(brush, kind, true)); ctx.restore();
}

function armToPoint(x: number, y: number, goalX: number, goalY: number): { upper: number; lower: number } {
  const dx = goalX - x, dy = goalY - y;
  const distance = Math.min(16.5, Math.max(1.7, Math.hypot(dx, dy)));
  const upperLength = 7.3, lowerLength = 9.4;
  const lower = Math.acos(Math.min(1, Math.max(-1, (distance * distance - upperLength * upperLength - lowerLength * lowerLength) / (2 * upperLength * lowerLength))));
  return { upper: Math.atan2(-dx, dy) - Math.atan2(lowerLength * Math.sin(lower), upperLength + lowerLength * Math.cos(lower)), lower };
}

/** The actual right palm and forearm direction, in continuous, unscaled feet-relative coordinates.
 * Tool art can attach here throughout anticipation, contact and recovery instead of orbiting the torso. */
export function playerToolPose(facing: number, moving: boolean, animation: number, time: number, state: ActorDrawingState = {}): { x: number; y: number; angle: number } {
  const facingAngle = ((facing % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const mirror = Math.cos(facingAngle) < -.35 ? -1 : 1;
  const side = Math.abs(Math.cos(facingAngle)) > .72;
  const clock = time + (state.phaseOffset ?? hash('human') % 17 * .43);
  const pace = Math.min(1.65, Math.max(.55, state.pace ?? 1));
  const running = smooth(1.03, 1.42, pace), sneaking = 1 - smooth(.66, .96, pace);
  const decoration = state.asleep ? 0 : state.reducedMotion ? .14 : 1;
  const phase = animation * 10, gait = moving ? Math.sin(phase) : 0;
  const breath = Math.sin(clock * 1.5) * decoration;
  const remaining = state.asleep ? 0 : Math.min(.26, Math.max(0, state.action || 0));
  const progress = 1 - remaining / .26;
  const action = remaining > 0 ? Math.sin(progress * Math.PI) : 0;
  const strike = remaining <= 0 ? 0 : progress < .07 / .26 ? smooth(0, .07 / .26, progress) * .55
    : progress < .16 / .26 ? .55 - smooth(.07 / .26, .16 / .26, progress) * 1.65
      : -1.1 * (1 - smooth(.16 / .26, 1, progress));
  const recoil = state.asleep ? 0 : Math.min(1, Math.max(0, state.hurt || 0) / .3);
  const upper = .07 - (moving ? Math.sin(phase - .22) : Math.sin(clock * 1.25) * .06 * decoration) * (.28 + running * .17) + strike;
  const lower = .07 - (moving ? Math.sin(phase - .7) : Math.sin(clock * 1.25 - .3) * .06 * decoration) * .12 - running * .2 + action * .4;
  const handX = 8 - Math.sin(upper) * 7.3 - Math.cos(upper) * .4 - Math.sin(upper + lower) * 6.8 - Math.cos(upper + lower) * .6;
  const handY = -28 + Math.cos(upper) * 7.3 - Math.sin(upper) * .4 + Math.cos(upper + lower) * 6.8 - Math.sin(upper + lower) * .6;
  const bodyAngle = state.asleep ? 0 : .037 + gait * .025 + (side ? running * .09 - sneaking * .045 : 0) + action * .13 - recoil * .1;
  const shift = state.asleep ? 0 : moving ? gait * (.9 + running * .55) : Math.sin(clock * .72) * .35 * decoration;
  const bob = state.asleep ? 0 : moving ? -Math.abs(Math.cos(phase)) * (.7 + running * 1.05) + sneaking * 2.2 : breath * .6;
  const x = handX * Math.cos(bodyAngle) - (handY + 15) * Math.sin(bodyAngle) + shift + action * .7 - recoil * 1.7;
  const y = handX * Math.sin(bodyAngle) + (handY + 15) * Math.cos(bodyAngle) - 15 + bob - action * .8;
  const armAngle = Math.PI / 2 + upper + lower + bodyAngle;
  return { x: x * mirror, y, angle: mirror > 0 ? armAngle : Math.PI - armAngle };
}

function expressiveFeatures(ctx: CanvasRenderingContext2D, _key: string, kind: ActorKind, _p: Palette, sideFacing: boolean, clock: number, gait: number, decoration: number): void {
  if (kind !== 'hare') return;
  // Crop the actual ears above the photographic skull and flex those pieces in place.
  const layout = faceLayout(kind), aspect = paperAssetAspect('hare-head'), w = Math.min(layout.bounds[2], layout.bounds[3] * aspect), h = Math.min(layout.bounds[3], layout.bounds[2] / aspect);
  const left = layout.bounds[0] + (layout.bounds[2] - w) / 2, top = headCentre(kind) + layout.bounds[1] + layout.bounds[3] - h;
  ctx.save(); if (sideFacing) ctx.scale(.84, 1);
  for (const s of [-1, 1]) {
    const sx = s < 0 ? .02 : .55, sw = s < 0 ? .39 : .44;
    const x = left + sx * w, y = top, hingeX = x + sw * w * .5, hingeY = top + .4 * h;
    ctx.save(); ctx.translate(hingeX, hingeY); ctx.rotate((Math.sin(clock * 1.5 + s) * .045 + gait * .06) * decoration); ctx.translate(-hingeX, -hingeY);
    drawPaperAssetRegion(ctx, 'hare-head', sx, 0, sw, .4, x, y, sw * w, h * .4); ctx.restore();
  }
  ctx.restore();
}

function batWing(ctx: CanvasRenderingContext2D, outer: boolean): void {
  ctx.save(); if (!outer) ctx.translate(3, -7); ctx.rotate(-1.1);
  const native = outer
    ? drawPaperAssetRegion(ctx, 'bat-wing', 0, .44, 1, .56, -17.3, 0, 32, 18.48)
    : drawPaperAssetRegion(ctx, 'bat-wing', 0, 0, 1, .44, -17.3, -1, 32, 14.52);
  ctx.restore(); if (native && !outer) nativeBatWing = true;
}
function bat(ctx: CanvasRenderingContext2D, time: number, back: boolean, state: ActorDrawingState): void {
  const decoration = state.reducedMotion ? .16 : 1, flight = state.reducedMotion ? .55 : 1;
  const attack = Math.sin(Math.min(1, (state.action || 0) / .26) * Math.PI), asleep = !!state.asleep;
  const flap = asleep ? 0 : Math.sin(time * 15.6), follow = asleep ? 0 : Math.sin(time * 15.6 - .62);
  ctx.save(); ctx.translate(Math.sin(time * 2.7) * .8 * decoration, -21 + Math.sin(time * 4.2) * 2.6 * decoration - attack * 2.3);
  ctx.rotate(Math.sin(time * 2.7) * .055 * decoration + attack * .16);
  for (const side of [-1, 1]) {
    ctx.save(); ctx.scale(side, 1); ctx.translate(3, -7);
    ctx.rotate((flap * .23 + side * .025) * flight); ctx.scale(1, 1 - (flap + 1) * .09 * flight); ctx.translate(-3, 7);
    paintedPart(ctx, 'bat:inner-wing', [-8, -29, 36, 43], brush => batWing(brush, false));
    ctx.translate(nativeBatWing ? 15.05 : 16, nativeBatWing ? -.86 : -26); ctx.rotate((follow * .22 - .06) * flight);
    paintedPart(ctx, 'bat:outer-wing', [-13, -18, 40, 47], brush => batWing(brush, true)); ctx.restore();
  }
  paintedPart(ctx, `bat:body:${back}`, [-13, -22, 26, 39], brush => {
    drawPaperAssetRegion(brush, 'worker-coat', back ? .30 : 0, back ? .48 : 0, back ? .32 : 1, back ? .39 : 1, -8, -19, 16, 30);
    drawPaperAsset(brush, 'boot', -7, 9, 7, 6); drawPaperAsset(brush, 'boot', 1, 9, 7, 6);
  });
  const blink = state.asleep || (time % 5.9 > 4.82 && time % 5.9 < 4.96);
  ctx.save(); ctx.translate(0, -13); ctx.rotate(Math.sin(time * 2.1) * .028 * decoration);
  paintedPart(ctx, `bat:face:${back}:${blink}:${!!state.mindChanged}`, [-18, -23, 36, 33], brush => generatedHead(brush, 'bat', false, back, blink, state, false)); ctx.restore(); ctx.restore();
}

export function drawActorSprite(ctx: CanvasRenderingContext2D, kind: ActorKind, xScreen: number, yScreen: number, facing: number, moving: boolean, animation: number, time: number, scale = 1, color?: string, state: ActorDrawingState = {}): void {
  refreshPaperCaches();
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
  const angle = ((facing % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const back = angle > Math.PI * 1.18 && angle < Math.PI * 1.82;
  const side = Math.abs(Math.cos(angle)) > .72;
  const mirror = Math.cos(angle) < -.35 ? -1 : 1;
  const sheet = replacementSheets.get(kind);
  if (sheet?.image.complete && sheet.image.naturalWidth) {
    const o = sheet.options, direction = back ? 2 : side ? mirror > 0 ? 1 : 3 : 0;
    const frame = moving ? Math.floor(animation * 8) % (o.columns ?? 4) : 0;
    ctx.drawImage(sheet.image, frame * o.frameWidth, (direction % (o.rows ?? 4)) * o.frameHeight, o.frameWidth, o.frameHeight,
      xScreen - (o.feetX ?? o.frameWidth / 2) * scale, yScreen - (o.feetY ?? o.frameHeight - 2) * scale, o.frameWidth * scale, o.frameHeight * scale);
    ctx.restore(); return;
  }
  ctx.translate(xScreen, yScreen); ctx.scale(scale * mirror, scale);
  const clock = time + (state.phaseOffset ?? hash(kind) % 17 * .43);
  if (kind === 'bat') { bat(ctx, clock, back, state); ctx.restore(); return; }
  const p: Palette = { ...palettes[kind], ...(color ? { coat: pigment(color) } : {}) };
  const key = `${kind}:${color || ''}`;
  const pace = Math.min(1.65, Math.max(.55, state.pace ?? 1));
  const running = smooth(1.03, 1.42, pace), sneaking = 1 - smooth(.66, .96, pace);
  const decoration = state.asleep ? 0 : state.reducedMotion ? .14 : 1;
  const phase = animation * 10;
  const gait = moving ? Math.sin(phase) : 0;
  const stride = .22 + running * .15 - sneaking * .075;
  const weight = kind === 'ox' || kind === 'boar' ? 1.38 : kind === 'tortoise' ? .7 : 1;
  const breath = Math.sin(clock * (kind === 'lady' ? .9 : kind === 'ox' ? 1.1 : 1.5)) * decoration;
  const blinkCycle = (clock + hash(kind) % 13 * .27) % 5.7;
  const blink = blinkCycle > 4.66 && blinkCycle < 4.84 || blinkCycle > 5.16 && blinkCycle < 5.24;
  const remaining = state.asleep ? 0 : Math.min(.26, Math.max(0, state.action || 0));
  const progress = 1 - remaining / .26;
  const action = remaining > 0 ? Math.sin(progress * Math.PI) : 0;
  // The tool renderer shares this 70 ms anticipation, 90 ms contact and 100 ms recovery timeline.
  const armStrike = remaining <= 0 ? 0 : progress < .07 / .26
    ? smooth(0, .07 / .26, progress) * .55
    : progress < .16 / .26 ? .55 - smooth(.07 / .26, .16 / .26, progress) * 1.65
      : -1.1 * (1 - smooth(.16 / .26, 1, progress));
  const recoil = state.asleep ? 0 : Math.min(1, Math.max(0, state.hurt || 0) / .3);
  const glanceCycle = clock % 12.4;
  const gaze = !moving && !state.asleep ? glanceCycle > 2.9 && glanceCycle < 4.5 ? -1 : glanceCycle > 8.1 && glanceCycle < 9.5 ? 1 : 0 : 0;
  const glance = (smooth(2.75, 3.1, glanceCycle) - smooth(4.25, 4.6, glanceCycle)) * -1
    + smooth(7.95, 8.35, glanceCycle) - smooth(9.25, 9.65, glanceCycle);
  const kissCycle = clock % 10.4;
  const kissRaise = state.billboard && !state.asleep ? smooth(2.2, 3.8, kissCycle) * (1 - smooth(6.65, 8.2, kissCycle)) : 0;
  const kissRelease = smooth(4.6, 5.65, kissCycle);
  const isKissing = kind === 'lady' && kissRaise > .8 && kissCycle < 5.05;

  // Photographic wings fold around their real shoulder joints at different phases.
  if (['moth', 'fox', 'otter', 'mouse', 'salamander', 'tortoise', 'peacock'].includes(kind)) {
    if (kind === 'moth') {
      for (const s of [-1, 1]) {
        ctx.save(); ctx.translate(s * 2.5, -29);
        ctx.rotate(s * (Math.sin(clock * 2.8 + s * .22) * .15 + gait * .075) * decoration);
        ctx.scale(1 - (1 + Math.sin(clock * 2.8 - .3 + s * .22)) * .08 * decoration, 1);
        ctx.translate(-s * 2.5, 29);
        paintedPart(ctx, `${key}:wing:${s}`, [-33, -51, 66, 53], brush => wingsAndTails(brush, kind, p, 0, 0, s)); ctx.restore();
      }
    } else {
      const tail = kind === 'fox' || kind === 'mouse' || kind === 'otter' || kind === 'salamander';
      const pivotX = tail ? 5 : 0, pivotY = tail ? -9 : kind === 'peacock' ? -12 : -23;
      const tailRate = kind === 'salamander' ? 3.8 : kind === 'mouse' ? 3.15 : 1.7;
      ctx.save(); ctx.translate(pivotX, pivotY);
      ctx.rotate(tail ? (Math.sin(clock * tailRate) * (kind === 'fox' ? .15 : .2) + gait * .11) * decoration : Math.sin(clock * 1.3) * .035 * decoration);
      if (kind === 'peacock') ctx.scale(1 + Math.sin(clock * .95) * .055 * decoration, 1);
      if (kind === 'tortoise') ctx.translate(gait * .45, breath * .3);
      ctx.translate(-pivotX, -pivotY);
      paintedPart(ctx, `${key}:silhouette`, [-33, -51, 66, 53], brush => wingsAndTails(brush, kind, p, 0, 0)); ctx.restore();
    }
  }
  {
    for (const s of [-1, 1]) {
      const step = moving ? Math.sin(phase + (s > 0 ? Math.PI : 0)) : 0;
      const angle = step * stride * (side ? 1.25 : .75);
      const lift = Math.max(0, step) * (2.3 + running * 1.8 - sneaking * .8);
      // Compensating the thigh's arc keeps the planted boot on the ground while the other foot clears it.
      const plant = 14 * (1 - Math.cos(angle)) - lift;
      articulatedPart(ctx, `${key}:leg:${s}`, [-18, -17, 36, 22], brush => leg(brush, s, 0, kind), s * (kind === 'ox' || kind === 'boar' ? 5.6 : 3.8), -13, angle, plant);
    }
  }
  const fixed = !!state.asleep;
  const shift = fixed ? 0 : moving ? gait * (.9 + running * .55) * weight : Math.sin(clock * .72) * .35 * decoration;
  const bob = fixed ? 0 : moving ? -Math.abs(Math.cos(phase)) * (.7 + running * 1.05) + sneaking * 2.2 : breath * (kind === 'lady' ? .3 : .6);
  ctx.save(); ctx.translate(shift + action * .7 - recoil * 1.7, bob - action * .8);
  const posture = kind === 'moth' ? -.055 : kind === 'human' ? .037 : kind === 'ox' ? -.028 : kind === 'tortoise' ? .048 : 0;
  ctx.translate(0, -15);
  ctx.rotate(fixed ? 0 : posture + gait * .025 * weight + (side ? running * .09 - sneaking * .045 : 0) + action * .13 - recoil * .1);
  ctx.translate(0, 15);
  const wide = kind === 'ox' || kind === 'boar';
  const shoulderWidth = kind === 'lady' ? 5.5 : wide ? 11 : 8;
  const armGait = moving ? Math.sin(phase - .22) : Math.sin(clock * 1.25) * .06 * decoration;
  const elbowGait = moving ? Math.sin(phase - .7) : Math.sin(clock * 1.25 - .3) * .06 * decoration;
  const leftUpper = -.07 + armGait * (.28 + running * .17) + action * .28;
  const leftLower = -.06 + elbowGait * .12 - running * .2;
  let rightUpper = .07 - armGait * (.28 + running * .17) + armStrike;
  let rightLower = .07 - elbowGait * .12 - running * .2 + action * .4;
  if (kind === 'lady' && kissRaise > 0) {
    const lift = kissRaise * decoration;
    const target = armToPoint(shoulderWidth, -28, .2 + kissRelease * 17, -39.4 + kissRelease * 6);
    rightUpper += (target.upper - rightUpper) * lift;
    rightLower += (target.lower - rightLower) * lift;
  }
  bentArm(ctx, key, p, -shoulderWidth, -28, leftUpper, leftLower);
  ctx.save(); ctx.translate(0, -24);
  const chestBreath = state.asleep ? Math.sin(clock * 1.1) * .4 : breath;
  ctx.scale(1 + chestBreath * (kind === 'ox' || kind === 'lady' ? .022 : .012), 1 + chestBreath * .009);
  ctx.translate(0, 24); paintedPart(ctx, `${key}:coat:${back}`, [-19, -38, 38, 41], brush => torso(brush, kind, p, back)); ctx.restore();
  const foregroundArm = kind === 'lady' && kissRaise > .1;
  if (!foregroundArm) bentArm(ctx, key, p, shoulderWidth, -28, rightUpper, rightLower);
  if (kind === 'heron') drawPaperAssetRegion(ctx, 'arm', .25, .12, .4, .38, -2.5, -42, 5, 15);
  const detached = kind === 'hare';
  const headY = headCentre(kind);
  ctx.save(); ctx.translate(fixed ? 0 : glance * .8 * decoration, fixed ? 0 : moving ? Math.sin(phase - .35) * .28 : Math.sin(clock * .85) * (kind === 'lady' ? .1 : .25) * decoration);
  ctx.translate(0, headY);
  ctx.rotate(fixed ? 0 : (kind === 'lady' ? Math.sin(clock * .38) * .012 : Math.sin(clock * 1.05) * .016) * decoration + glance * .035 * decoration - action * .075);
  ctx.translate(0, -headY);
  const expression = `${side}:${back}:${blink}:${!!state.asleep}:${!!state.mindChanged}:${!!state.brainAbsent}:${isKissing}`;
  if (detached) expressiveFeatures(ctx, key, kind, p, side, clock, gait, decoration);
  paintedPart(ctx, `${key}:head:${expression}`, [-33, -78, 66, 64], brush => head(brush, kind, p, side, back, blink, 0, state, gaze, isKissing, detached)); ctx.restore();
  if (foregroundArm) bentArm(ctx, key, p, shoulderWidth, -28, rightUpper, rightLower);
  if (kind === 'lady' && state.billboard && decoration > .8) {
    const release = kissCycle - 4.8;
    if (release > 0 && release < 1.6) {
      ctx.save(); ctx.translate(5 + release * 10, -30 - release * 3.7); ctx.rotate(release * -.25);
      ctx.globalAlpha *= Math.sin(Math.min(1, release / .22) * Math.PI / 2) * (1 - smooth(.7, 1.6, release));
      paintedPart(ctx, 'propaganda-lip-print', [-5, -4, 10, 8], brush => {
        drawPaperAsset(brush, 'item-coupon', -4, -4, 8, 8);
      }); ctx.restore();
    }
  }
  if (!back && ['hare', 'fox', 'moth', 'mole', 'merchant', 'gatekeeper', 'tortoise', 'lady'].includes(kind)) {
    if (!(kind === 'lady' && state.billboard)) {
      const heldLeft = kind === 'human';
      const upper = heldLeft ? leftUpper : rightUpper, lower = heldLeft ? leftLower : rightLower;
      const shoulder = (heldLeft ? -1 : 1) * shoulderWidth;
      const handX = shoulder - Math.sin(upper) * 7.3 - Math.sin(upper + lower) * 9.4 - Math.cos(upper) * .4;
      const handY = -28 + Math.cos(upper) * 7.3 + Math.cos(upper + lower) * 9.4 - Math.sin(upper) * .4;
      ctx.save(); ctx.translate(handX - (heldLeft ? -8.4 : 7.6), handY + 11.3);
      if (heldLeft) ctx.scale(-1, 1);
      articulatedPart(ctx, `${key}:prop`, [-3, -38, 27, 36], brush => prop(brush, kind, 0, p), kind === 'human' ? 11.2 : 9.5, -13, moving ? Math.sin(phase - .9) * .18 : breath * .025, 0); ctx.restore();
    }
  }
  ctx.restore(); ctx.restore();
}

function itemAssetId(id: string): string {
  if (id.includes('brain') && !id.includes('protocol')) return 'item-brain';
  if (id.includes('axe')) return 'item-axe';
  if (id.includes('pick')) return 'item-pick';
  if (id.includes('rod')) return 'item-rod';
  if (id.includes('cane') || id.includes('sword')) return 'item-cane';
  if (id.includes('lantern')) return 'item-lantern';
  if (id.includes('soup') || id.includes('stew') || id === 'tea') return 'item-soup';
  if (id.includes('key') || id.includes('switch')) return 'item-key';
  if (id.includes('fish')) return 'item-fish';
  if (id.includes('sapling')) return 'item-sapling';
  if (id.includes('willow') && !id.includes('verse')) return 'item-willow';
  if (id.includes('herb') || id.includes('flower') || id.includes('carrot') || id.includes('mushroom')) return 'item-herb';
  if (id.includes('workbench')) return 'workbench';
  if (id.includes('bench')) return 'stools';
  if (id.includes('ledger') || id.includes('protocol') || id.includes('book')) return 'shelves';
  if (id.includes('wood') || id.includes('log')) return 'item-wood';
  if (id.includes('ore') || id.includes('iron')) return 'item-ore';
  if (id.includes('stone') || id.includes('coal')) return 'item-stone';
  if (id.includes('time_glass') || id.includes('timeglass') || id === 'time' || id.includes('glass')) return 'item-glass';
  if (id.includes('campfire') || id.includes('fire')) return 'item-campfire';
  if (id.includes('worm')) return 'item-willow';
  // Tickets, books, permits, music, identity and friendship are all tangible printed photo-collage stock.
  return 'item-coupon';
}
function itemDrawing(ctx: CanvasRenderingContext2D, id: string): void {
  drawPaperAsset(ctx, itemAssetId(id), 2, 1, 28, 30);
}

function makeItemCanvas(id: string): HTMLCanvasElement {
  const cached = itemCanvasCache.get(id); if (cached) return cached;
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d')!; ctx.scale(4, 4); itemDrawing(ctx, id);
  itemCanvasCache.set(id, canvas); return canvas;
}
export function drawItemIcon(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, size: number): void {
  if (!id) return;
  refreshPaperCaches();
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'; ctx.drawImage(makeItemCanvas(id), x, y, size, size); ctx.restore();
}
export function itemIconDataUrl(id: string, size = 32): string {
  if (typeof document === 'undefined') return '';
  refreshPaperCaches();
  const key = `${paperAssetsRevision()}:${id}:${size}`; const cached = iconCache.get(key); if (cached) return cached;
  const canvas = document.createElement('canvas'); canvas.width = size * 3; canvas.height = size * 3;
  drawItemIcon(canvas.getContext('2d')!, id, 0, 0, canvas.width);
  const url = canvas.toDataURL('image/png'); iconCache.set(key, url); return url;
}

/** The same native photographs appear in the world and in every conversation. */
export function actorPortraitDataUrl(kind: ActorKind, size = 64, state: ActorDrawingState = {}): string {
  if (typeof document === 'undefined') return '';
  refreshPaperCaches();
  const key = `${paperAssetsRevision()}:${kind}:${size}:${!!state.asleep}:${!!state.mindChanged}:${!!state.brainAbsent}:${!!state.reducedMotion}`;
  const cached = portraitCache.get(key); if (cached) return cached;
  const canvas = document.createElement('canvas'); canvas.width = size * 3; canvas.height = size * 3;
  const ctx = canvas.getContext('2d')!; ctx.scale(3, 3);
  paperTexture(ctx, 0, 0, size, size, P.moss, hash(kind));
  ctx.save(); ctx.beginPath(); ctx.rect(size * .035, size * .035, size * .93, size * .93); ctx.clip();
  const layout = faceLayout(kind), aspect = paperAssetAspect(headAssetIds[kind]);
  const w = Math.min(layout.bounds[2], layout.bounds[3] * aspect), h = Math.min(layout.bounds[3], layout.bounds[2] / aspect);
  const zoom = Math.min(size * .88 / w, size * .88 / h);
  const centreX = layout.bounds[0] + layout.bounds[2] / 2;
  const centreY = layout.bounds[1] + layout.bounds[3] - h / 2;
  ctx.translate(size / 2 - centreX * zoom, size / 2 - centreY * zoom); ctx.scale(zoom, zoom);
  generatedHead(ctx, kind, false, false, !!state.asleep, state, false); ctx.restore();
  const url = canvas.toDataURL('image/png'); portraitCache.set(key, url); return url;
}
