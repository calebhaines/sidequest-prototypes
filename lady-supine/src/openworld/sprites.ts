import type { ActorKind, Vec } from './types';
import { PALETTE as P, pigment } from './palette';

/** Temporary, original marker drawings. Coordinates are continuous; actors are anchored at their feet.
 * Replacement sheets remain optional so finished artwork can be supplied without changing the world. */
export type SpriteSheetOptions = { frameWidth: number; frameHeight: number; columns?: number; rows?: number; feetX?: number; feetY?: number };
export type ActorDrawingState = {
  asleep?: boolean; mindChanged?: boolean; brainAbsent?: boolean;
  reducedMotion?: boolean; pace?: number; action?: number; hurt?: number;
  phaseOffset?: number; billboard?: boolean;
};
const replacementSheets = new Map<ActorKind, { image: HTMLImageElement; options: SpriteSheetOptions }>();
const iconCache = new Map<string, string>();
const itemCanvasCache = new Map<string, HTMLCanvasElement>();
const portraitCache = new Map<string, string>();
type PaintedPart = { canvas: HTMLCanvasElement; x: number; y: number; width: number; height: number };
const partCache = new Map<string, PaintedPart>();
const PART_CACHE_BYTES = 20 * 1024 * 1024;
let paintedBytes = 0;
const INK: string = P.ink;
const PAPER = P.paper;

type Palette = { coat: string; shade: string; trim: string; face: string; faceShade: string; hair: string };
const palettes: Record<ActorKind, Palette> = {
  human: { coat: P.slate, shade: P.ink, trim: P.paper, face: P.ash, faceShade: P.clay, hair: P.charcoal },
  lady: { coat: P.bruise, shade: P.ink, trim: P.straw, face: P.chalk, faceShade: P.flesh, hair: P.ink },
  gatekeeper: { coat: P.bark, shade: P.umbra, trim: P.paper, face: P.sand, faceShade: P.clay, hair: P.charcoal },
  moth: { coat: P.smoke, shade: P.charcoal, trim: P.paper, face: P.paper, faceShade: P.ash, hair: P.ink },
  hare: { coat: P.pine, shade: P.charcoal, trim: P.paper, face: P.ash, faceShade: P.sand, hair: P.umbra },
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
  return kind === 'lady' ? { x: -.7, y: -53 } : kind === 'hare' ? { x: 0, y: -43 } : { x: 0, y: -42 };
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
function random(seed: number): () => number {
  let value = seed;
  return () => { value = Math.imul(value ^ value >>> 16, 0x45d9f3b); value = Math.imul(value ^ value >>> 16, 0x45d9f3b); return ((value ^= value >>> 16) >>> 0) / 4294967296; };
}
const loosePaths = new Map<string, Path2D>();
function loosePath(path: string, amount = .32): Path2D {
  const key = `${amount}:${path}`;
  const found = loosePaths.get(key); if (found) return found;
  const rng = random(hash(path) + amount * 10000);
  const drawn = new Path2D(path.replace(/-?\d*\.?\d+/g, value => String(Number(value) + (rng() - .5) * amount)));
  if (loosePaths.size > 1400) loosePaths.delete(loosePaths.keys().next().value!);
  loosePaths.set(key, drawn); return drawn;
}
function pen(ctx: CanvasRenderingContext2D, path: string, color = INK, width = .8): void {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(loosePath(path, .32));
  ctx.save(); ctx.translate(.21, -.2); ctx.globalAlpha *= .27; ctx.lineWidth = width * .58; ctx.stroke(loosePath(path, .6)); ctx.restore();
}
function wash(ctx: CanvasRenderingContext2D, path: string, color: string, texture = false, weight = 1): void {
  const p = loosePath(path, .44);
  ctx.fillStyle = color; ctx.fill(p);
  ctx.save(); ctx.globalAlpha *= .16; ctx.strokeStyle = INK; ctx.lineWidth = weight * 3.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(p); ctx.restore();
  ctx.save(); ctx.globalAlpha *= .83; ctx.strokeStyle = INK; ctx.lineWidth = weight * 1.08; ctx.stroke(p); ctx.restore();
  ctx.save(); ctx.translate(-.3, .3); ctx.globalAlpha *= .36; ctx.lineWidth = weight * .65; ctx.setLineDash([3.8, .7, 7.2, 1.3]); ctx.stroke(loosePath(path, .82)); ctx.restore();
  // Broad overlapping nib marks, pressure scratches and rubbed-out patches stay inside the silhouette.
  if (texture) {
    const rng = random(hash(path));
    const values = path.match(/-?\d*\.?\d+/g)?.map(Number) || [-26, -60, 26, 4];
    const xs = values.filter((_, i) => i % 2 === 0), ys = values.filter((_, i) => i % 2 === 1);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    ctx.save(); ctx.clip(p);
    ctx.strokeStyle = P.ink; ctx.lineCap = 'round';
    for (let i = 0; i < 17; i++) {
      const x = minX + rng() * (maxX - minX), y = minY + rng() * (maxY - minY);
      ctx.globalAlpha = .04 + rng() * .095; ctx.lineWidth = .6 + rng() * 3.6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + 1.4, y + 3, x - .8, y + 5, x + rng() * 3, y + 5 + rng() * 6); ctx.stroke();
    }
    ctx.globalAlpha = .16; ctx.strokeStyle = P.chalk; ctx.lineWidth = .45;
    for (let i = 0; i < 22; i++) {
      const x = minX + rng() * (maxX - minX), y = minY + rng() * (maxY - minY);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rng() * 4, y + rng() * 2 - 1); ctx.stroke();
    }
    ctx.restore();
  }
}
function oval(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, stroke = true): void {
  const outline = `M${x - rx} ${y} C${x - rx * 1.14} ${y - ry * .7} ${x - rx * .3} ${y - ry * 1.12} ${x + rx * .24} ${y - ry} C${x + rx * .98} ${y - ry * .9} ${x + rx * 1.13} ${y - ry * .2} ${x + rx} ${y + ry * .18} C${x + rx * .84} ${y + ry * .84} ${x + rx * .32} ${y + ry * 1.03} ${x - rx * .12} ${y + ry} C${x - rx * .78} ${y + ry * 1.03} ${x - rx * 1.05} ${y + ry * .45} ${x - rx} ${y}Z`;
  const p = loosePath(outline, rx > 1.8 ? .42 : .1); ctx.fillStyle = fill; ctx.fill(p);
  if (stroke) { ctx.strokeStyle = INK; ctx.lineWidth = .83; ctx.stroke(p); }
}
function stitch(ctx: CanvasRenderingContext2D, d: string, color: string = P.ash): void {
  ctx.save(); ctx.setLineDash([1.1, 1.8]); pen(ctx, d, color, .55); ctx.restore();
}
function patch(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size = 4): void {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-.13);
  wash(ctx, `M${-size / 2} -2.4 L${size / 2 + .2} -2 L${size / 2} 2.6 L${-size / 2 - .3} 2.2 Z`, color);
  stitch(ctx, `M${-size / 2 - .5} -2.2 L${size / 2 + .4} -2 L${size / 2 + .4} 2.9 L${-size / 2 - .7} 2.6 Z`);
  ctx.restore();
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

function wingsAndTails(ctx: CanvasRenderingContext2D, kind: ActorKind, p: Palette, sway: number, time: number, wingSide = 0): void {
  if (kind === 'moth') {
    for (const side of [-1, 1]) {
      if (wingSide && side !== wingSide) continue;
      ctx.save(); ctx.scale(side, 1); ctx.translate(2.5, -29); ctx.rotate(.035 + Math.sin(time * 2.3) * .035);
      // Fractured paper wings: incomplete trapezoids, ragged missing wedges, nervous ink diagrams.
      wash(ctx, side < 0 ? 'M0 0 L20 -12 L25 -5 L20 -2 L24 1 L17 4 L20 7 L15 8 L16 14 L11 11 L10 20 L4 10Z' : 'M0 0 L21 -10 L25 -4 L20 4 L23 11 L16 9 L12 19 L4 11Z', P.paper, true);
      wash(ctx, 'M2 2 L18 -9 L20 -4 L7 8Z', P.sand);
      wash(ctx, 'M8 7 L17 4 L15 12 L11 17Z', P.ash);
      pen(ctx, 'M1 4 L19 -7 M2 5 L17 8 M4 7 L10 18', P.umbra, .85);
      pen(ctx, 'M12 -1 L16 3 L11 8 L8 3Z M12 2 L12 5', P.charcoal, 1.1);
      pen(ctx, 'M16 -10 l-2 5 M18 7 l-4 -1 M8 14 l-2 -3', P.ink, .65);
      if (side < 0) { patch(ctx, 11, -5, P.chalk, 4.5); pen(ctx, 'M15 13 l2 7 M10 19 l-1 3 M20 -3 l-3 2', P.umbra, .45); }
      ctx.restore();
    }
  }
  if (kind === 'fox' || kind === 'otter' || kind === 'mouse' || kind === 'salamander') {
    ctx.save(); ctx.translate(5, -9); ctx.rotate(sway * .05);
    if (kind === 'mouse') {
      pen(ctx, 'M0 0 L10 4 Q24 8 20 -5 L17 -9', P.clay, 1.8);
      pen(ctx, 'M4 2 L13 5 M18 4 L21 0', P.ink, .5);
    } else {
      wash(ctx, kind === 'fox' ? 'M0 0 L13 5 L22 -12 L18 -18 L15 -7 L3 -8Z' : 'M0 0 L15 3 L21 -11 L17 -15 L10 -5 L2 -7Z', p.faceShade, true);
      if (kind === 'fox') wash(ctx, 'M15 -7 L18 -18 L22 -12 L18 -5 L14 -2 L11 -5Z', P.paper);
      else wash(ctx, 'M10 -5 L17 -15 L14 -4 L8 -1Z', p.face);
      pen(ctx, 'M3 -4 L11 -2 L17 -10', P.ink, .8);
    }
    ctx.restore();
  }
  if (kind === 'tortoise') {
    wash(ctx, 'M-12 -29 L-17 -18 L-10 -8 L2 -6 L15 -13 L16 -24 L5 -35 L-6 -33Z', P.pine, true);
    wash(ctx, 'M-12 -27 L1 -30 L6 -17 L-5 -12 L-14 -20Z', P.moss);
    pen(ctx, 'M-12 -25 L2 -30 L12 -22 L8 -14 L-3 -12 L-12 -20Z M2 -30 L-3 -12 M-12 -20 L12 -22', P.charcoal, 1.1);
  }
  if (kind === 'peacock') {
    wash(ctx, 'M-8 -10 L-23 -30 L-18 -39 L-9 -36 L-2 -44 L7 -35 L14 -39 L24 -29 L8 -10Z', P.pine, true);
    for (const [x, y] of [[-17, -30], [-9, -35], [1, -37], [10, -32], [18, -27]]) {
      pen(ctx, `M0 -12 L${x} ${y}`, P.ochre, 1.2);
      wash(ctx, `M${x - 3} ${y - 3} L${x + 2} ${y - 4} L${x + 4} ${y + 3} L${x - 1} ${y + 5}Z`, P.water);
      pen(ctx, `M${x - 1} ${y - 1} L${x + 1} ${y + 2}`, P.ink, 1.2);
    }
  }
}

function leg(ctx: CanvasRenderingContext2D, side: number, gait: number, kind: ActorKind): void {
  const thin = kind === 'heron';
  ctx.save(); ctx.translate(side * (kind === 'ox' || kind === 'boar' ? 5.6 : 3.8), -13); ctx.rotate(gait * side * .2);
  wash(ctx, thin ? 'M-1 0 L1.2 -.4 L.6 8 L2.2 12 L-.7 12 L-1.3 7Z' : 'M-3 -.8 L2.4 .1 L3.1 5 L1.9 11 L-2.8 11.8Z', thin ? P.clay : P.charcoal);
  wash(ctx, side > 0 ? 'M-2.9 10 L2.5 9.5 L5.4 12.7 L2.5 14 L-3.4 13.5Z' : 'M-2.5 10 L2.7 10.4 L3.1 13.4 L-4.6 14 L-5.4 12.2Z', P.ink);
  pen(ctx, 'M-2 12.4 L2.1 12.8', P.ash, .6); ctx.restore();
}

function torso(ctx: CanvasRenderingContext2D, kind: ActorKind, p: Palette, back: boolean): void {
  if (kind === 'lady') {
    // The ruler alone wears an intentional, composed silhouette among everyone else's patched fragments.
    wash(ctx, 'M-5 -32 L5 -32 L8 -27 L5 -20 L10 -1 L-10 -.5 L-5 -20 L-8 -27Z', P.ink, true, .82);
    wash(ctx, 'M-4 -31 L3 -31 L3 -21 L7.8 -1 L-1 -1 L-3 -20Z', P.bruise);
    wash(ctx, 'M3 -31 L6 -27 L3 -20 L7 -2 L2 -3 L0 -22Z', P.charcoal);
    pen(ctx, 'M-5 -31 L-2 -25 L1 -25 L5 -31 M-6 -4 L7 -4', P.straw, .65);
    pen(ctx, 'M-1 -24 L-.5 -10', P.paper, .45);
    wash(ctx, 'M-.8 -27 L1.5 -26 L.4 -23 L-1.3 -25Z', P.straw, false, .5);
    return;
  }
  const wide = kind === 'ox' || kind === 'boar';
  const w = wide ? 12.7 : kind === 'heron' ? 7.3 : 9;
  const hem = kind === 'moth' ? -9.5 : -11;
  wash(ctx, `M${-w + 1} -32 L${w - 2.4} -30 L${w + 1.2} -21 L${w - .7} -16 L${w + 2} ${hem} L${-w - 1} ${hem + 1} L${-w + .5} -20 L${-w - 1.6} -26Z`, p.coat, true, 1.05);
  wash(ctx, `M-1.8 -31 L${w - 2.4} -30 L${w + .5} -23 L${w - 2} ${hem + .8} L.6 ${hem + 1.7} L2 -22Z`, p.shade);
  if (back) {
    patch(ctx, -1, -23, p.trim, 8); pen(ctx, 'M-6 -19 L7 -17 M-2 -26 L3 -21', P.ink, .8);
  } else {
    wash(ctx, 'M-6 -31 L1 -27 L-4 -23 L-8 -28Z', p.trim);
    wash(ctx, 'M3 -30 L6 -27 L1 -22Z', P.charcoal);
    pen(ctx, `M-.8 -24 L.5 ${hem + .5} M4 -20 L7 -18 L3 -16`, P.ink, .9);
    patch(ctx, -5, -15.5, P.paper, 6.5);
    pen(ctx, 'M-7 -16 L-3 -14 M-6 -17 l.2 4 M-4 -17 l.2 4', P.umbra, .45);
  }
  stitch(ctx, `M${-w + 1} ${hem - .1} L-2 ${hem + 1} L${w} ${hem - .5}`, P.ash);
  pen(ctx, `M${-w + 1.4} ${hem + .3} l-.8 2 M${w - 1.6} ${hem + .3} l.8 1.7`, P.ink, .6);
  if (kind === 'ox') { pen(ctx, 'M-7 -31 L-4 -12 M6 -30 L4 -12', P.rust, 2.6); wash(ctx, 'M-5 -21 L3 -22 L7 -14 L-6 -12Z', P.bark); }
  if (kind === 'moth') { wash(ctx, 'M-8 -30 L4 -31 L7 -27 L-2 -26 L-6 -17 L-9 -19Z', P.sand, true); pen(ctx, 'M-7 -19 L-3 -18', P.umbra, .8); }
  if (kind === 'hare') { wash(ctx, 'M-5 -24 L5 -25 L7 -12 L-7 -11Z', P.clay, true); pen(ctx, 'M-5 -22 L-5 -16 L3 -14 M-2 -30 L-4 -24 M4 -30 L4 -25', P.ink, .8); pen(ctx, 'M-4 -15 L1 -14 M2 -19 L4 -17', P.rust, 1.6); }
  if (kind === 'deer') { wash(ctx, 'M-7 -32 L6 -30 L3 -26 L-5 -27Z', P.charcoal); pen(ctx, 'M3 -28 L7 -17', P.charcoal, 2.7); }
  if (kind === 'peacock') { pen(ctx, 'M-6 -30 L-8 -24 L-5 -19 M5 -30 L8 -21 L5 -18', P.straw, 1.1); }
  if (kind === 'tortoise') { pen(ctx, 'M-5 -22 L2 -22 M-1.5 -26 L-1.5 -18', P.chalk, 2); pen(ctx, 'M5 -25 L7 -20 L5 -15', P.smoke, .65); }
}

function head(ctx: CanvasRenderingContext2D, kind: ActorKind, p: Palette, side: boolean, back: boolean, blink: boolean, _time: number, state: ActorDrawingState, gaze = 0, kiss = false, _detached = false): void {
  const lady = kind === 'lady', wide = kind === 'ox' || kind === 'boar';
  const cy = kind === 'heron' ? -42 : lady ? -40 : kind === 'human' ? -38.4 : -37;
  ctx.save(); ctx.translate(side && !lady ? 1.2 : 0, cy); ctx.rotate(lady ? 0 : .06);
  if (lady) {
    // Her beauty is deliberate and adult. The unadorned aperture belongs to a living human skull.
    wash(ctx, 'M-15 -16 L-20 -8 L-19 9 L-14 17 L-13 9 L13 8 L15 16 L20 4 L19 -10 L11 -17Z', P.ink, true, .82);
    wash(ctx, 'M-13 -15 C-17 -12 -18 -5 -16 2 L-12 8 L-5 13 C-2 15 1 15 5 13 L13 7 L17 -2 C18 -10 10 -17 1 -17Z', P.chalk, false, .68);
    wash(ctx, 'M-16 -1 L-9 5 L-5 13 L-12 8Z', P.paper, false, .25);
    wash(ctx, 'M13 -9 L17 -2 L13 7 L5 13 L8 4Z', P.flesh, false, .25);
    pen(ctx, 'M-16 -7 L-16 5 M16 -8 L17 2', P.charcoal, .7);
    if (state.asleep || blink) {
      pen(ctx, 'M-12 -.4 Q-8 1.5 -4 -.3 M4 -.5 Q8 1.4 12 -.6', P.ink, .95);
    } else {
      wash(ctx, 'M-12.3 -.5 Q-8 -3.2 -4.1 -.1 Q-7.8 1.8 -12.3 -.5Z', P.paper, false, .28);
      wash(ctx, 'M3.8 -.3 Q8 -3.3 12.5 -.6 Q8 1.6 3.8 -.3Z', P.paper, false, .28);
      pen(ctx, 'M-12.3 -.5 Q-8 -3.2 -4.1 -.1 M3.8 -.3 Q8 -3.3 12.5 -.6', P.ink, .95);
      pen(ctx, `M${-8 + gaze * .45} -1.8 L${-8 + gaze * .45} .4 M${7.8 + gaze * .45} -1.7 L${7.8 + gaze * .45} .3`, state.mindChanged ? P.slate : P.ink, 1.15);
      pen(ctx, 'M-12 -.5 l-1 -.8 M12 -.6 l1 -.9', P.ink, .55);
    }
    pen(ctx, state.mindChanged ? 'M-12 -3.8 Q-8 -5 -4 -3.4 M4 -3.5 Q8 -5 12 -3.8' : 'M-12 -4.2 Q-8 -5.3 -4 -3.7 M4 -3.8 Q8 -5.2 12 -4.2', P.charcoal, .65);
    wash(ctx, 'M.2 -1 L-.8 5 L1.3 6 L3 4.5 L1.1 -.7Z', P.flesh, false, .22);
    pen(ctx, 'M.1 0 L-.6 4.8 L1 5.8 M2.2 5.1 L3 4.6', P.umbra, .5);
    if (kiss) { wash(ctx, 'M-.6 8.8 Q1 7.5 2.5 9 Q3 10.8 .6 11 Q-.8 10.4 -.6 8.8Z', P.bruise, false, .3); pen(ctx, 'M.5 9.2 L1.8 9.5', P.ink, .45); }
    else {
      wash(ctx, 'M-4 9.1 Q-.6 7.6 1 8.7 Q3 7.3 5 8.5 L1 10.7Z', P.bruise, false, .3);
      pen(ctx, 'M-3 9.1 Q.7 9.6 4 8.7', P.ink, .4);
      pen(ctx, 'M-.5 10.5 L2 10.4', P.flesh, .65);
    }
    pen(ctx, 'M-7 11 L-4 12.2 M5.2 11.8 L8 10', P.sand, .45);
    // The black opening remains centred exactly at actorHeadAnchor(lady), with an exposed flesh rim.
    oval(ctx, -.7, -13, 11.4, 4.6, P.flesh); oval(ctx, -.7, -13, 9.5, 3.6, P.ink);
    pen(ctx, 'M-10.4 -14.5 Q-.7 -18.2 8.7 -14.7 M-9 -10.9 Q-.3 -8.8 8 -11', P.paper, .65);
    if (!state.brainAbsent) pen(ctx, 'M-7 -12.3 Q-4 -14 -1.7 -12.5 Q.6 -14.5 3 -12.3 Q5 -13.7 7 -12', P.bruise, .7);
    pen(ctx, 'M-16 4 L-16 9 L-14.5 11 M17 4 L17 9 L15.5 11', P.straw, .8);
    ctx.restore(); return;
  }
  // Every ordinary inhabitant is assembled from misregistered mask planes, never a tidy rounded mascot.
  if (kind === 'deer' || kind === 'ox') {
    pen(ctx, kind === 'deer' ? 'M-8 -5 L-13 -13 L-12 -22 M-13 -14 L-18 -20 M-12 -17 L-7 -23 M8 -5 L13 -14 L12 -21 M13 -15 L18 -18' : 'M-9 -4 L-17 -5 L-18 -12 M9 -4 L18 -7 L16 -14', P.paper, kind === 'deer' ? 1.8 : 3.1);
    pen(ctx, 'M-13 -13 l-1 3 M13 -14 l1 3', P.ink, .5);
  }
  if (kind === 'boar') { wash(ctx, 'M-8 -4 L-13 -15 L-3 -8Z', p.face); wash(ctx, 'M4 -7 L12 -13 L9 -1Z', p.face); }
  if (kind === 'merchant' || kind === 'otter') {
    wash(ctx, 'M-13 -9 L-9 -13 L-5 -7 L-8 -3Z', p.faceShade);
    wash(ctx, 'M5 -9 L10 -12 L13 -6 L8 -2Z', p.faceShade);
  }
  if (kind === 'heron' || kind === 'peacock') pen(ctx, 'M-1 -8 L-6 -19 M2 -9 L5 -21 M5 -8 L10 -16', p.hair, 1.1);
  const face = kind === 'human' ? 'M-9 -12 L4 -14 L10 -8 L8 9 L-1 12 L-11 7Z'
    : wide ? 'M-12 -8 L-7 -12 L12 -9 L13 7 L5 11 L-11 8Z'
      : kind === 'moth' ? 'M-9 -11 L5 -13 L10 -5 L7 10 L-7 8Z'
        : kind === 'tortoise' ? 'M-8 -10 L7 -9 L11 2 L3 10 L-9 7Z' : 'M-8 -11 L7 -10 L10 1 L5 11 L-9 7 L-11 -2Z';
  wash(ctx, face, p.face, true, 1.02);
  wash(ctx, wide ? 'M3 -10 L12 -9 L13 7 L5 11 L1 3Z' : 'M2 -11 L7 -10 L10 1 L5 11 L1 7 L4 2Z', p.faceShade);
  pen(ctx, 'M-9 -5 L-5 -7 L-6 -1 M7 5 l-2 3', P.ink, .65);
  if (kind === 'human') {
    wash(ctx, 'M-11 -3 L-11 -12 L-2 -16 L7 -12 L10 -8 L6 -4 L3 -10 L-4 -8 L-5 -1Z', p.hair, true);
    wash(ctx, 'M0 -2 L-2 6 L3 4Z', P.paper);
    pen(ctx, 'M-8 -9 L-4 -13 M1 -12 L5 -10', P.smoke, .65);
  }
  if (back) { wash(ctx, 'M-8 -7 L2 -12 L8 -7 L7 6 L-3 9 L-9 2Z', p.hair, true); pen(ctx, 'M-5 -4 L-2 5 M3 -6 L4 7', p.faceShade, .6); ctx.restore(); return; }
  if (['fox', 'otter', 'hare', 'mouse', 'merchant'].includes(kind)) {
    wash(ctx, side ? 'M0 1 L14 6 L2 9Z' : 'M-7 3 L1 1 L7 8 L-6 10Z', kind === 'fox' || kind === 'hare' ? P.paper : P.sand);
    wash(ctx, side ? 'M10 4 L14 6 L10 8Z' : 'M-.5 3 L2 5 L-1.5 6Z', P.ink, false, .4);
  }
  if (wide) {
    wash(ctx, 'M-11 1 L8 0 L11 7 L-9 8Z', P.clay);
    pen(ctx, 'M-6 4 L-3 5 M3 4 L6 3', P.ink, 1.1);
    if (kind === 'boar') { wash(ctx, 'M-8 5 L-12 2 L-12 9 L-8 8Z', P.paper); wash(ctx, 'M7 4 L11 1 L12 8 L7 8Z', P.paper); }
  }
  if (['heron', 'peacock', 'gatekeeper'].includes(kind)) { wash(ctx, side ? 'M3 0 L19 5 L4 8Z' : 'M-2 1 L4 2 L1 9 L-4 5Z', P.ochre); pen(ctx, side ? 'M5 4 L17 5' : 'M-1 4 L1 6', P.umbra, .7); }
  if (kind === 'mole') wash(ctx, 'M-2 1 L6 5 L1 10 L-5 6Z', P.clay);
  if (kind === 'salamander') wash(ctx, 'M-6 2 L7 3 L2 9 L-7 7Z', P.sage);
  const cruel = kind === 'hare' && state.mindChanged;
  for (const [i, eye] of (side ? [4.9] : [-4.7, 3.7]).entries()) {
    const y = i ? .1 : -1.1;
    pen(ctx, `M${eye - 2.1} ${y + 1.7} L${eye + 1.5} ${y + 2.5}`, P.umbra, .7);
    if (blink || state.asleep) pen(ctx, `M${eye - 2} ${y} L${eye + 1.8} ${y + .2}`, P.ink, .9);
    else {
      pen(ctx, `M${eye + gaze * .55} ${y - .6} L${eye + gaze * .55 + .2} ${y + 1.1}`, P.ink, 1.25);
      pen(ctx, cruel ? `M${eye - 2.2} ${y - 1.8} L${eye + 2} ${y - .3}` : `M${eye - 2.5} ${y - 1.4} L${eye + 1.9} ${y - .8}`, P.ink, 1.1);
    }
  }
  if (kind === 'mole' || kind === 'fox') pen(ctx, 'M-8 -3 L-1 -4 L-1 3 L-8 2Z M1 -3 L7 -2 L6 4 L1 3Z M-1 -.7 L1 -.6', P.paper, .8);
  pen(ctx, cruel ? 'M-3 8 L1 5 L5 7' : 'M-4 8.7 L1 7.7 L4 9.1', P.ink, .75);
  if (kind === 'gatekeeper') { wash(ctx, 'M-12 -9 L12 -10 L12 -6 L-12 -5Z', p.shade); wash(ctx, 'M-8 -10 L-9 -16 L2 -19 L8 -13 L7 -10Z', p.coat, true); patch(ctx, 2, -14, P.paper, 4); }
  ctx.restore();
}

function prop(ctx: CanvasRenderingContext2D, kind: ActorKind, gait: number, _p: Palette): void {
  ctx.save(); ctx.translate(kind === 'human' ? 11.2 : 9.5, -13 + gait * .65); ctx.rotate(gait * .08);
  if (kind === 'human') {
    pen(ctx, 'M-2 -5 L-2 -9 L2 -10 L3 -5', P.clay, .9);
    wash(ctx, 'M-4 -5 L4 -6 L5 3 L-4 4Z', P.umbra);
    wash(ctx, 'M-2.6 -3.8 L2.6 -4 L2.7 2 L-2.8 2.4Z', P.straw, false, .45);
    pen(ctx, 'M0 -4 L.3 3 M-3.3 3 L4 2.7', P.ink, .7); wash(ctx, 'M-.8 .5 L0 -1.5 L1.2 .7Z', P.chalk, false, .3);
  } else if (kind === 'hare') {
    wash(ctx, 'M-4 -3 L0 -5 L4 -1 L2 4 L-3 3Z', P.sand); pen(ctx, 'M-.4 -3 L-.4 .4 L2.1 1.6', P.ink, .65);
  } else if (['fox', 'moth', 'mole', 'merchant'].includes(kind)) {
    ctx.rotate(-.12); wash(ctx, 'M-4 -6 L3 -7 L4 3 L-4 4Z', kind === 'fox' ? P.deepWater : P.paper);
    pen(ctx, 'M-2 -3 L2 -3.1 M-2 -1 L1.5 -1.1 M-2 1 L1.7 .8', kind === 'fox' ? P.sand : P.umbra, .55);
  } else if (kind === 'gatekeeper') { pen(ctx, 'M3 -17 L2.5 11', P.bark, 1.7); wash(ctx, 'M0 -19 L6 -18 L5 -13 L1 -13Z', P.paper); }
  else if (kind === 'tortoise') { wash(ctx, 'M-1 -4 L3 -4 L3 3 L-1 3Z', P.smoke); pen(ctx, 'M-.8 -2 L2 -2', P.paper, .7); }
  else if (kind === 'lady') { pen(ctx, 'M1 -8 L4 6', P.charcoal, 1); pen(ctx, 'M1 -8 L.5 -10', P.paper, 1.3); pen(ctx, 'M.5 -10 L.2 -11', P.rust, .7); }
  ctx.restore();
}

function smooth(low: number, high: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

/** Separate sleeve and wrist layers make gestures bend at an elbow instead of rotating a cutout. */
function sleeve(ctx: CanvasRenderingContext2D, p: Palette, lower: boolean): void {
  const elegant = p.face === P.chalk;
  if (!lower) {
    wash(ctx, elegant ? 'M-1.4 -.8 L1.3 -.8 L1.9 6.6 L-1.8 7.7Z' : 'M-3 -.7 L2.1 -1 L3.2 4.7 L1 8.8 L-4.2 7.2Z', p.shade, !elegant, elegant ? .5 : .85);
    pen(ctx, elegant ? 'M-1.1 1 L-.7 6' : 'M-3 3.5 L1.6 4.1', elegant ? P.bruise : p.coat, elegant ? .4 : 1.1);
  } else if (elegant) {
    wash(ctx, 'M-1.8 -.2 L1.8 .4 L1.5 4 L2.8 8 L1.4 10 L-.6 10.5 L-2.5 6Z', P.chalk, false, .5);
    pen(ctx, 'M.5 5 L1.3 9 M-.8 5 L-.4 9', P.flesh, .35);
  } else {
    wash(ctx, 'M-3 -.7 L2 -.2 L2.8 3.7 L-3.9 4.6Z', p.shade, true);
    pen(ctx, 'M-3.1 3.2 L1.8 3.9', p.trim, .8);
    wash(ctx, 'M-3.1 4 L2.3 4.2 L3.8 7.3 L.6 10.5 L-3.4 9.2 L-5 6.1Z', p.face, true);
    pen(ctx, 'M-3 5.6 L.9 8.2 M-.5 5.1 L-.8 8.6', p.faceShade, .55);
  }
}

function bentArm(ctx: CanvasRenderingContext2D, key: string, p: Palette, x: number, y: number, upper: number, lower: number): void {
  ctx.save(); ctx.translate(x, y); ctx.rotate(upper);
  paintedPart(ctx, `${key}:upper-sleeve`, [-7, -3, 14, 14], brush => sleeve(brush, p, false));
  ctx.translate(-.4, 7.3); ctx.rotate(lower);
  paintedPart(ctx, `${key}:wrist`, [-7, -2, 14, 15], brush => sleeve(brush, p, true)); ctx.restore();
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

function feature(ctx: CanvasRenderingContext2D, kind: ActorKind, p: Palette, side: number): void {
  if (kind === 'hare') {
    wash(ctx, side < 0 ? 'M-2 1 L-7 -21 L-3 -23 L2 -2Z' : 'M-2 0 L1 -18 L6 -15 L4 -9 L3 1Z', p.face, true);
    pen(ctx, side < 0 ? 'M-3 -2 L-4 -17' : 'M1 -2 L3 -12', P.clay, 1.2);
    if (side < 0) stitch(ctx, 'M-5 -11 L-1 -10', P.umbra); else pen(ctx, 'M4 -12 L6 -11 L4 -10', P.ink, .65);
  } else if (kind === 'moth') {
    pen(ctx, `M0 0 L${side * 6} -14 L${side * 11} -10`, P.umbra, 1);
    pen(ctx, `M${side * 11} -10 l${side * -2} 2`, P.paper, 1.4);
  } else if (kind === 'fox') {
    ctx.save(); ctx.scale(side, 1); wash(ctx, 'M-3 0 L3 -11 L6 -8 L3 2Z', p.face, true); pen(ctx, 'M2 -7 L0 -2', P.rust, 1.2); ctx.restore();
  } else if (kind === 'mouse') {
    wash(ctx, 'M-5 -2 L-2 -6 L3 -5 L5 0 L2 5 L-3 4Z', p.faceShade, true);
    wash(ctx, 'M-2 -2 L2 -3 L3 1 L-1 3Z', P.ash, false, .4);
  } else if (kind === 'salamander') {
    for (let i = 0; i < 3; i++) pen(ctx, `M0 ${-3 + i * 3} L${side * 4} ${-7 + i * 4} L${side * (8 - i)} ${-8 + i * 6}`, P.rust, 1.4);
  }
}

function expressiveFeatures(ctx: CanvasRenderingContext2D, key: string, kind: ActorKind, p: Palette, sideFacing: boolean, clock: number, gait: number, decoration: number): void {
  const cy = kind === 'human' ? -38.4 : -37;
  ctx.save(); ctx.translate(sideFacing ? 1.2 : 0, cy); ctx.rotate(.06);
  const cycle = (clock + hash(kind) % 7) % 8.6;
  const twitch = (smooth(4.3, 4.42, cycle) - smooth(4.7, 4.88, cycle)) * Math.sin(clock * 23);
  for (const s of [-1, 1]) {
    const x = kind === 'hare' ? s * 5 : kind === 'moth' ? s * 4 : kind === 'fox' ? s * 6 : kind === 'mouse' ? s * 8 : s * 7;
    const y = kind === 'mouse' ? -7.8 : kind === 'fox' ? -5 : kind === 'salamander' ? -3 : -7;
    const movement = kind === 'hare' ? Math.sin(clock * 1.45 + s * .6) * .08 + twitch * (s < 0 ? .28 : .12) + gait * .065
      : kind === 'moth' ? Math.sin(clock * 2.8 + s) * .085 + twitch * .12
      : kind === 'salamander' ? Math.sin(clock * 3.6 + s) * .07
      : Math.sin(clock * 1.8 + s) * .025 + twitch * .11 + gait * .035;
    articulatedPart(ctx, `${key}:feature:${s}`, [-20, -34, 40, 47], brush => {
      brush.translate(x, y); feature(brush, kind, p, s);
    }, x, y, movement * decoration);
  }
  ctx.restore();
}

function bat(ctx: CanvasRenderingContext2D, time: number, back: boolean, state: ActorDrawingState): void {
  const decoration = state.reducedMotion ? .16 : 1, flight = state.reducedMotion ? .55 : 1;
  const attack = Math.sin(Math.min(1, (state.action || 0) / .26) * Math.PI);
  ctx.save(); ctx.translate(Math.sin(time * 2.7) * .8 * decoration, -21 + Math.sin(time * 4.2) * 2.6 * decoration - attack * 2.3);
  ctx.rotate(Math.sin(time * 2.7) * .055 * decoration + attack * .16);
  for (const side of [-1, 1]) {
    const lift = Math.sin(time * 15.6 + side * .1) * 8.5 * flight;
    ctx.save(); ctx.scale(side, 1); ctx.translate(3, -7); ctx.rotate(Math.sin(time * 15.6 - .3 + side * .1) * .045 * flight); ctx.translate(-3, 7);
    wash(ctx, `M3 -8 L16 ${-26 + lift} L30 ${-15 + lift} L21 ${-9 + lift} L26 ${1 + lift} L17 ${-1 + lift} L17 ${9 + lift * .4} L9 3 L5 12 L1 0Z`, P.charcoal, true, .95);
    wash(ctx, `M3 -5 L16 ${-22 + lift} L23 ${-15 + lift} L13 ${-4 + lift} L7 6Z`, P.bruise);
    pen(ctx, `M3 -5 L16 ${-22 + lift} L30 ${-15 + lift} M3 -3 L13 ${-12 + lift} L26 ${1 + lift} M3 -2 L9 ${-2 + lift} L17 ${9 + lift * .4}`, P.smoke, .7); ctx.restore();
  }
  wash(ctx, 'M-5 -9 L6 -8 L8 1 L4 12 L-3 11 L-7 4Z', P.bruise, true);
  wash(ctx, 'M-7 -9 L-10 -25 L-2 -14 L3 -13 L10 -23 L7 -8Z', P.ash, true);
  wash(ctx, 'M-8 -14 L-1 -18 L7 -14 L8 -5 L-1 2 L-8 -5Z', P.fog, true);
  if (!back) {
    pen(ctx, 'M-6 -9 L-2 -8 M2 -8 L6 -10 M-4 -3 L0 -4 L4 -3', P.ink, 1.3);
    wash(ctx, 'M-3 -3 L-2 1 L-1 -3Z', P.paper); wash(ctx, 'M2 -3 L3 .7 L4 -3Z', P.paper);
    wash(ctx, 'M-3 2 L3 2 L4 8 L-3 8Z', P.ochre); pen(ctx, 'M0 3 L0 6 L2 7', P.ink, .65);
  }
  pen(ctx, 'M-4 10 L-6 14 L-3 13 M4 10 L6 14 L3 13', P.smoke, 1.3); ctx.restore();
}

export function drawActorSprite(ctx: CanvasRenderingContext2D, kind: ActorKind, xScreen: number, yScreen: number, facing: number, moving: boolean, animation: number, time: number, scale = 1, color?: string, state: ActorDrawingState = {}): void {
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

  // Wings fold around their real shoulder joints. Their ragged left and right edges never move in lockstep.
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
  if (kind !== 'lady') {
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
  const armGait = moving ? Math.sin(phase - .22) : Math.sin(clock * 1.25) * .06 * decoration;
  const elbowGait = moving ? Math.sin(phase - .7) : Math.sin(clock * 1.25 - .3) * .06 * decoration;
  const leftUpper = -.07 + armGait * (.28 + running * .17) + action * .28;
  const leftLower = -.06 + elbowGait * .12 - running * .2;
  let rightUpper = .07 - armGait * (.28 + running * .17) + armStrike;
  let rightLower = .07 - elbowGait * .12 - running * .2 + action * .4;
  if (kind === 'lady' && kissRaise > 0) {
    const lift = kissRaise * decoration;
    const target = armToPoint(8, -28, 3.5 + kissRelease * 15, -30 - kissRelease * 1.5);
    rightUpper += (target.upper - rightUpper) * lift;
    rightLower += (target.lower - rightLower) * lift;
  }
  bentArm(ctx, key, p, -(wide ? 11 : 8), -28, leftUpper, leftLower);
  ctx.save(); ctx.translate(0, -24);
  const chestBreath = state.asleep ? Math.sin(clock * 1.1) * .4 : breath;
  ctx.scale(1 + chestBreath * (kind === 'ox' || kind === 'lady' ? .022 : .012), 1 + chestBreath * .009);
  ctx.translate(0, 24); paintedPart(ctx, `${key}:coat:${back}`, [-19, -38, 38, 41], brush => torso(brush, kind, p, back)); ctx.restore();
  const foregroundArm = kind === 'lady' && kissRaise > .1;
  if (!foregroundArm) bentArm(ctx, key, p, wide ? 11 : 8, -28, rightUpper, rightLower);
  if (kind === 'heron') { wash(ctx, 'M-3 -28 Q-5 -36 -2 -41 L3 -40 Q1 -33 3 -28Z', p.face); }
  const detached = ['hare', 'moth', 'fox', 'mouse', 'salamander'].includes(kind);
  const headY = kind === 'lady' ? -40 : kind === 'heron' ? -42 : kind === 'human' ? -38.4 : -37;
  ctx.save(); ctx.translate(fixed ? 0 : glance * .8 * decoration, fixed ? 0 : moving ? Math.sin(phase - .35) * .28 : Math.sin(clock * .85) * (kind === 'lady' ? .1 : .25) * decoration);
  ctx.translate(0, headY);
  ctx.rotate(fixed ? 0 : (kind === 'lady' ? Math.sin(clock * .38) * .012 : Math.sin(clock * 1.05) * .016) * decoration + glance * .035 * decoration - action * .075);
  ctx.translate(0, -headY);
  if (detached) expressiveFeatures(ctx, key, kind, p, side, clock, gait, decoration);
  const expression = `${side}:${back}:${blink}:${!!state.asleep}:${!!state.mindChanged}:${!!state.brainAbsent}:${gaze}:${isKissing}`;
  paintedPart(ctx, `${key}:head:${expression}`, [-28, -71, 56, 56], brush => head(brush, kind, p, side, back, blink, 0, state, gaze, isKissing, detached)); ctx.restore();
  if (foregroundArm) bentArm(ctx, key, p, 8, -28, rightUpper, rightLower);
  if (kind === 'lady' && state.billboard && decoration > .8) {
    const release = kissCycle - 4.8;
    if (release > 0 && release < 1.6) {
      ctx.save(); ctx.translate(5 + release * 10, -30 - release * 3.7); ctx.rotate(release * -.25);
      ctx.globalAlpha *= Math.sin(Math.min(1, release / .22) * Math.PI / 2) * (1 - smooth(.7, 1.6, release));
      paintedPart(ctx, 'propaganda-lip-print', [-5, -4, 10, 8], brush => {
        wash(brush, 'M-3.5 0 Q-1.5 -3 0 -1.4 Q1.9 -3 3.9 -.2 Q1 2.6 -3.5 0Z', P.bruise);
        pen(brush, 'M-2.5 -.1 Q0 .8 2.8 -.2', P.charcoal, .5);
      }); ctx.restore();
    }
  }
  if (!back && ['human', 'hare', 'fox', 'moth', 'mole', 'merchant', 'gatekeeper', 'tortoise', 'lady'].includes(kind)) {
    if (!(kind === 'lady' && state.billboard)) {
      const heldLeft = kind === 'human';
      const upper = heldLeft ? leftUpper : rightUpper, lower = heldLeft ? leftLower : rightLower;
      const shoulder = (heldLeft ? -1 : 1) * (wide ? 11 : 8);
      const handX = shoulder - Math.sin(upper) * 7.3 - Math.sin(upper + lower) * 9.4 - Math.cos(upper) * .4;
      const handY = -28 + Math.cos(upper) * 7.3 + Math.cos(upper + lower) * 9.4 - Math.sin(upper) * .4;
      ctx.save(); ctx.translate(handX - (heldLeft ? -8.4 : 7.6), handY + 11.3);
      if (heldLeft) ctx.scale(-1, 1);
      articulatedPart(ctx, `${key}:prop`, [-3, -38, 27, 36], brush => prop(brush, kind, 0, p), kind === 'human' ? 11.2 : 9.5, -13, moving ? Math.sin(phase - .9) * .18 : breath * .025, 0); ctx.restore();
    }
  }
  ctx.restore(); ctx.restore();
}

function itemDrawing(ctx: CanvasRenderingContext2D, id: string): void {
  ctx.save(); ctx.translate(16, 17);
  const paper = (seal: string = P.rust) => {
    wash(ctx, 'M-9 -11 L5 -13 L10 -8 L7 12 L-9 10 L-7 3Z', P.paper, true);
    wash(ctx, 'M5 -13 L5 -8 L10 -8Z', P.ash);
    pen(ctx, 'M-5 -7 L4 -6 M-4 -3 L5 -4 M-5 1 L1 2 L4 .5', P.umbra, .8);
    wash(ctx, 'M1 5 L6 4 L7 9 L2 10Z', seal, false, .55);
    pen(ctx, 'M2 6 L5 8 M5 6 L3 9', P.paper, .6);
  };
  const plant = (willow = false) => {
    pen(ctx, 'M-1 12 L1 3 L-1 -11 M1 3 L-8 -3 M0 -2 L9 -7 M.3 7 L8 4', P.bark, 1.4);
    for (const [x, y, r] of [[-6, -4, -.5], [6, -8, .5], [-4, 3, -.6], [7, 3, .5]]) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(r);
      wash(ctx, 'M-4 0 L0 -4 L5 -2 L2 2Z', P.moss);
      if (willow) pen(ctx, 'M-2 0 Q-4 8 -1 11 M2 0 Q4 7 2 9', P.pine, .7); ctx.restore();
    }
    pen(ctx, 'M-3 12 L3 12', P.ink, 1.4);
  };
  if (id.includes('axe')) {
    pen(ctx, 'M-8 12 L6 -11', P.umbra, 3.2); pen(ctx, 'M-7.6 11 L6.3 -10', P.clay, 1.6);
    wash(ctx, 'M-3 -10 L3 -14 L10 -12 L11 -3 L2 -6 L-1 -5Z', P.ash, true);
    wash(ctx, 'M7 -13 L11 -3 L8 -4Z', P.chalk); pen(ctx, 'M1 -8 L4 -7', P.rust, 1.3);
  } else if (id.includes('pick')) {
    pen(ctx, 'M-8 12 L5 -10', P.umbra, 3.1); pen(ctx, 'M-7 11 L5 -10', P.clay, 1.4);
    wash(ctx, 'M-11 -3 L-4 -11 L5 -13 L11 -7 L12 -3 L5 -8 L-4 -6Z', P.smoke, true); pen(ctx, 'M-8 -7 L1 -11 L6 -10', P.ash, .8);
  } else if (id.includes('rod')) {
    pen(ctx, 'M-10 12 L-1 2 L5 -12', P.bark, 2.1); pen(ctx, 'M-9 11 L-4 5', P.ink, 3.2);
    pen(ctx, 'M5 -12 L12 1 L10 8 L8 9 L7 6', P.paper, .65); wash(ctx, 'M8 2 L12 3 L10 7 L8 6Z', P.rust, false, .4);
  } else if (id.includes('cane') || id.includes('sword')) {
    pen(ctx, 'M-2 12 L-2 -9 L1 -13 L6 -11 L7 -7', P.bark, 3.1); pen(ctx, 'M-1.4 11 L-1.4 -8 L1 -11', P.sand, .8); pen(ctx, 'M-3.2 10 L-.8 10', P.ink, 1.7);
  } else if (id.includes('lantern')) {
    pen(ctx, 'M-5 -8 L-5 -14 L0 -16 L5 -13 L5 -8', P.clay, 1.1);
    wash(ctx, 'M-8 -8 L7 -9 L9 11 L-8 12Z', P.umbra, true); wash(ctx, 'M-5 -5 L5 -6 L5.8 8 L-5 9Z', P.straw);
    pen(ctx, 'M0 -6 L.5 10 M-7 9 L8 9', P.ink, 1); wash(ctx, 'M-.8 6 L-.5 1 L2 4 L1 6Z', P.chalk, false, .35);
  } else if (id.includes('soup') || id.includes('stew') || id === 'tea') {
    const cup = id === 'tea';
    wash(ctx, cup ? 'M-8 -4 L6 -5 L5 10 L-3 12 L-7 9Z' : 'M-12 0 L12 -1 L7 10 L-5 12Z', P.fog, true);
    wash(ctx, cup ? 'M-8 -4 L6 -5 L5 -1 L-7 0Z' : 'M-12 0 L4 -3 L12 -1 L9 2 L-10 3Z', cup ? P.sage : P.ochre);
    if (cup) pen(ctx, 'M6 -1 L13 -1 L13 6 L5 8', P.ash, 2);
    else { pen(ctx, 'M-6 -.2 L-3 1', P.moss, 1.4); pen(ctx, 'M3 -.2 L6 1', P.rust, 1.4); }
    pen(ctx, 'M-5 -7 L-7 -11 L-4 -14 M3 -7 L5 -10 L3 -14', P.ash, .7);
  } else if (id === 'carrot') {
    wash(ctx, 'M-6 -8 L2 -11 L7 -6 L-1 14 L-5 3Z', P.ember, true); pen(ctx, 'M-3 -1 L2 0 M-2 5 L1 6', P.rust, .8);
    pen(ctx, 'M0 -9 L-6 -17 M1 -9 L2 -18 M2 -9 L8 -17', P.moss, 1.8);
  } else if (id.includes('fish')) {
    wash(ctx, 'M-13 0 L-5 -7 L7 -3 L14 -8 L11 0 L14 7 L7 3 L-5 7Z', P.water, true);
    wash(ctx, 'M-13 0 L-5 -7 L4 -3 L1 1 L-6 3Z', P.fog);
    pen(ctx, 'M-1 -5 L3 -10 L4 -4 M-1 6 L3 10 L5 4 M-4 -3 L-2 1 L-4 4', P.deepWater, 1); pen(ctx, 'M-8 -1 L-8 1', P.ink, 1.3);
  } else if (id.includes('willow') || id.includes('sapling') || id.includes('herb') || id.includes('flower')) {
    if (id.includes('verse')) paper(P.moss); else plant(id.includes('willow'));
    if (id.includes('flower')) { wash(ctx, 'M-6 -11 L-2 -14 L0 -11 L4 -14 L6 -10 L3 -7 L-2 -7Z', P.flesh); pen(ctx, 'M0 -12 L0 -9', P.straw, 2); }
  } else if (id.includes('wood') || id.includes('log')) {
    wash(ctx, 'M-12 3 L4 -5 L11 -1 L11 4 L-5 12 L-12 8Z', P.bark, true);
    wash(ctx, 'M-10 -7 L8 -13 L13 -9 L12 -3 L-5 4 L-11 0Z', P.clay, true);
    pen(ctx, 'M-9 -6 L-6 -2 L-8 1 L-10 -2Z M-10 4 L-6 6 L-8 9 L-11 7Z M-4 -2 L10 -7 M-1 6 L9 1', P.umbra, .8);
  } else if (id.includes('stone') || id.includes('ore') || id.includes('iron') || id.includes('coal')) {
    wash(ctx, 'M-12 5 L-8 -7 L0 -12 L10 -8 L13 5 L6 11 L-6 12Z', id.includes('coal') ? P.charcoal : P.smoke, true);
    wash(ctx, 'M-8 -7 L0 -12 L7 -8 L0 -1 L-11 3Z', P.fog); pen(ctx, 'M0 -1 L5 5 L3 9 M0 -1 L10 -8', P.slate, .8);
    if (id.includes('ore') || id.includes('iron')) pen(ctx, 'M-6 -4 L-3 1 L1 2 M7 -2 L8 5 L6 7', P.rust, 2.1);
  } else if (id.includes('brain') && !id.includes('protocol')) {
    const brain = id.includes('blank') ? P.ash : id.includes('ada') ? P.paper : P.flesh;
    const inJar = id.includes('supine'); ctx.save(); if (inJar) { ctx.translate(0, -.5); ctx.scale(.67, .67); }
    // Cortical planes remain two actual hemispheres even in the fractured drawing language.
    wash(ctx, 'M-13 -2 L-14 -7 L-9 -11 L-3 -12 L0 -9 L4 -12 L11 -9 L15 -3 L12 5 L6 9 L1 7 L-4 10 L-11 7Z', brain, true, .85);
    wash(ctx, 'M-12 -4 L-7 -9 L-1 -7 L-5 -1 L-10 1Z', P.paper, false, .25);
    pen(ctx, 'M0 -10 L-1 -4 L1 1 L0 7 M-10 -6 L-5 -4 L-8 0 L-3 3 L-6 6 M6 -7 L3 -3 L8 0 L4 3 L7 5', P.bruise, .9);
    pen(ctx, 'M-2 9 L-1 13 L2 13 L1 9', P.umbra, 1.3); ctx.restore();
    if (inJar) { pen(ctx, 'M-9 -10 L-11 -4 L-10 9 L0 13 L10 9 L11 -4 L9 -10Z', P.water, 1.2); wash(ctx, 'M-10 -13 L10 -13 L10 -9 L-10 -9Z', P.slate); pen(ctx, 'M-6 -6 L-7 0 L-6 6 M4 7 L7 5', P.chalk, 1); pen(ctx, 'M10 3 L15 2 L15 7 L13 11', P.clay, 1.1); }
  } else if (id.includes('switch')) {
    wash(ctx, 'M-12 -2 L7 -5 L12 9 L-9 12Z', P.slate, true); pen(ctx, 'M-1 2 L2 -11', P.sand, 2.2); wash(ctx, 'M-2 -14 L7 -13 L6 -8 L-3 -9Z', P.bruise);
    pen(ctx, 'M-8 5 L-4 4 M4 3 L8 4 M-8 9 L6 7', P.paper, 1.1); pen(ctx, 'M-10 -1 L-13 -8 L-8 -12 M8 0 L14 -8 L9 -11', P.umbra, 1.1);
  } else if (id.includes('coupon')) { paper(P.bruise); wash(ctx, 'M-4 -9 L2 -10 L5 -6 L3 -2 L-3 -3Z', P.chalk); pen(ctx, 'M-2 -6 L-.7 -5 M1 -6 L2 -5 M-1 -3 L1 -3', P.bruise, .65); }
  else if (id.includes('time_glass') || id.includes('timeglass') || id === 'time') {
    pen(ctx, 'M-8 -12 L8 -12 M-8 12 L8 12', P.ochre, 2.2);
    wash(ctx, 'M-6 -11 L6 -11 L3 -3 L0 0 L5 6 L6 11 L-6 11 L-5 6 L0 0 L-3 -3Z', P.water, true);
    wash(ctx, 'M-4 -10 L4 -10 L0 -3Z', P.straw); wash(ctx, 'M-5 10 L0 4 L5 10Z', P.straw);
  } else if (id.includes('campfire') || id.includes('fire')) {
    pen(ctx, 'M-10 11 L10 5 M-10 5 L9 12', P.bark, 3.4);
    wash(ctx, 'M-7 8 L-9 3 L-4 -3 L-3 2 L3 -13 L8 -3 L6 3 L9 8 L2 11Z', P.ember, true); wash(ctx, 'M-2 9 L-4 4 L0 -1 L2 6 L5 5 L3 10Z', P.straw);
  } else if (id.includes('bench') || id.includes('workbench')) {
    pen(ctx, 'M-8 -5 L-9 12 M8 -5 L8 12', P.umbra, 2.2); wash(ctx, 'M-12 -6 L11 -7 L12 -2 L-12 -1Z', P.clay, true); wash(ctx, 'M-11 4 L12 3 L11 7 L-11 8Z', P.bark, true); pen(ctx, 'M-8 6 L7 5 M-6 -4 L4 -4.3', P.umbra, .7);
  } else if (id.includes('lullaby') || id.includes('music')) { paper(P.water); pen(ctx, 'M2 -9 L2 1 L-2 3 M2 -9 L7 -7 L7 0 L4 2', P.deepWater, 1.2); }
  else if (id.includes('ticket')) { wash(ctx, 'M-13 -7 L12 -8 L11 -3 L9 -2 L11 1 L11 8 L-12 9 L-12 3 L-10 1 L-13 -2Z', P.sand, true); stitch(ctx, 'M-3 -7 L-3 8', P.umbra); pen(ctx, 'M0 -3 L7 -3.5 M0 0 L6.5 -.5 M0 4 L5 3.7', P.bruise, .7); }
  else if (id.includes('ledger') || id.includes('protocol') || id.includes('book')) { wash(ctx, 'M-9 -12 L8 -13 L10 10 L-7 12 L-10 10Z', id.includes('protocol') ? P.bruise : P.deepWater, true); pen(ctx, 'M-6 -11 L-5 10 M-2 -8 L6 -9 M-1 5 L6 4', P.sand, .8); pen(ctx, 'M-6 11 L9 9.7', P.paper, 1.3); patch(ctx, 3, -1, P.ash, 4); }
  else if (id === 'friendship_token') {
    pen(ctx, 'M-10 1 Q-12 10 -3 11 C7 15 11 6 8 1 L4 -3 L0 -3 L-3 2 L3 2', P.sand, 1.1);
    wash(ctx, 'M-13 -6 L-9 -10 L-3 -7 L-2 -2 L-7 1 L-12 -1Z', P.ash); pen(ctx, 'M-9 -6 L-6 -3 M-6 -6 L-9 -3', P.umbra, .8);
    pen(ctx, 'M-10 -3 L-5 4 L1 6', P.clay, 1);
    pen(ctx, 'M12 -10 L7 -14 L2 -10 L3 -6 L8 -3 L12 -7 L9 -11 L6 -8 L9 -6 L9 -9 L7 -8', P.slate, 1.1);
  } else if (id.includes('token') || id.includes('heart')) { wash(ctx, 'M0 -6 L-7 -12 L-12 -5 L-8 3 L0 12 L10 1 L12 -5 L7 -12Z', P.flesh, true); pen(ctx, 'M0 -5 L-1 1 L2 3 L1 7', P.bruise, .8); }
  else if (id.includes('bandage')) { wash(ctx, 'M-13 -3 L8 -8 L13 2 L-9 9Z', P.paper, true); wash(ctx, 'M-3 -6 L4 -6 L6 5 L-2 7Z', P.clay); pen(ctx, 'M-1 -1 L3 1 M0 -3 L3 4', P.chalk, 1); stitch(ctx, 'M-10 -1 L-8 5 M7 -4 L9 2', P.umbra); }
  else if (id.includes('mushroom')) { wash(ctx, 'M-3 1 L4 1 L1 9 L5 13 L0 15 L-5 12Z', P.paper); wash(ctx, 'M-13 1 L-6 -11 L1 -13 L9 -7 L13 0 L2 4Z', P.bruise, true); pen(ctx, 'M-6 -5 L-2 -3 M4 -7 L8 -4', P.ash, 1.6); }
  else if (id.includes('worm')) { pen(ctx, 'M-9 -7 L-12 3 L-7 9 L2 8 L8 4 L9 -6', P.clay, 3.5); pen(ctx, 'M-9 -7 L-12 3 L-7 9 L2 8 L8 4 L9 -6', P.sand, 1.4); pen(ctx, 'M8 -8 L9 -8', P.ink, 1.1); }
  else if (id.includes('refusal') || id.includes('paper') || id.includes('permit') || id.includes('identity')) paper(id.includes('permit') ? P.moss : P.rust);
  else { wash(ctx, 'M-9 -7 L7 -8 L9 10 L1 14 L-8 11Z', P.ochre, true); wash(ctx, 'M-5 -13 L4 -13 L5 -8 L-5 -7Z', P.sand); pen(ctx, 'M-7 -5 L6 -6 M-3 -2 L3 -2 L4 7 L-2 8Z', P.umbra, .8); }
  ctx.restore();
}

function makeItemCanvas(id: string): HTMLCanvasElement {
  const cached = itemCanvasCache.get(id); if (cached) return cached;
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d')!; ctx.scale(4, 4); itemDrawing(ctx, id);
  itemCanvasCache.set(id, canvas); return canvas;
}
export function drawItemIcon(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, size: number): void {
  if (!id) return;
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'; ctx.drawImage(makeItemCanvas(id), x, y, size, size); ctx.restore();
}
export function itemIconDataUrl(id: string, size = 32): string {
  if (typeof document === 'undefined') return '';
  const key = `${id}:${size}`; const cached = iconCache.get(key); if (cached) return cached;
  const canvas = document.createElement('canvas'); canvas.width = size * 3; canvas.height = size * 3;
  drawItemIcon(canvas.getContext('2d')!, id, 0, 0, canvas.width);
  const url = canvas.toDataURL('image/png'); iconCache.set(key, url); return url;
}

/** High-resolution mixed-media portraits; the same drawn inhabitants appear in the world and the conversation. */
export function actorPortraitDataUrl(kind: ActorKind, size = 64, state: ActorDrawingState = {}): string {
  if (typeof document === 'undefined') return '';
  const key = `${kind}:${size}:${!!state.asleep}:${!!state.mindChanged}:${!!state.brainAbsent}`; const cached = portraitCache.get(key); if (cached) return cached;
  const canvas = document.createElement('canvas'); canvas.width = size * 3; canvas.height = size * 3;
  const ctx = canvas.getContext('2d')!; ctx.scale(3, 3);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, size, size);
  const rng = random(hash(kind));
  ctx.save(); ctx.translate(size / 2, size / 2); ctx.scale(size / 60, size / 60);
  wash(ctx, 'M-28 -24 L-7 -29 L18 -26 L29 -19 L26 16 L20 29 L-21 27 L-30 14Z', P.ash, true, .65);
  ctx.globalAlpha = .17;
  for (let i = 0; i < 27; i++) {
    const x = rng() * 60 - 30, y = rng() * 60 - 30;
    pen(ctx, `M${x} ${y} q${rng() * 12 - 4} ${rng() * 6} ${rng() * 13} ${rng() * 11 - 5}`, P.umbra, .3 + rng() * .5);
  }
  ctx.restore();
  const zoom = size / (kind === 'lady' ? 43 : 31);
  const faceOffset = kind === 'lady' ? 39 : kind === 'bat' ? 34 : 37;
  drawActorSprite(ctx, kind, size * .5, size * .55 + faceOffset * zoom, Math.PI / 2, false, 0, 2, zoom, undefined,
    { asleep: state.asleep, mindChanged: state.mindChanged, brainAbsent: state.brainAbsent, reducedMotion: true, phaseOffset: 0 });
  ctx.strokeStyle = P.bark; ctx.lineWidth = size / 80;
  ctx.beginPath(); ctx.moveTo(size * .035, size * .06); ctx.lineTo(size * .97, size * .025); ctx.lineTo(size * .94, size * .95); ctx.lineTo(size * .03, size * .975); ctx.closePath(); ctx.stroke();
  const url = canvas.toDataURL('image/png'); portraitCache.set(key, url); return url;
}
