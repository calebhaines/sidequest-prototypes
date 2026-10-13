import type { ActorKind, Vec } from './types';

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
const INK = '#302b2c';
const PAPER = '#c5baa5';
const RUST = '#996451';

type Palette = { coat: string; shade: string; trim: string; face: string; faceShade: string; hair: string };
const palettes: Record<ActorKind, Palette> = {
  human: { coat: '#64665b', shade: '#48493e', trim: '#a69c80', face: '#c2968b', faceShade: '#9d736d', hair: '#534340' },
  lady: { coat: '#8a676d', shade: '#57434c', trim: '#ae9770', face: '#c59b98', faceShade: '#ab7f7e', hair: '#493e43' },
  gatekeeper: { coat: '#766255', shade: '#4c4540', trim: '#a88f68', face: '#aaa18c', faceShade: '#777364', hair: '#675f50' },
  moth: { coat: '#77706f', shade: '#51494f', trim: '#aea08b', face: '#b6a69d', faceShade: '#8f827e', hair: '#665654' },
  hare: { coat: '#697165', shade: '#48544c', trim: '#a89b7d', face: '#bfb7a3', faceShade: '#928e81', hair: '#81766b' },
  ox: { coat: '#7c6755', shade: '#55493f', trim: '#ab9675', face: '#a38370', faceShade: '#786459', hair: '#51463f' },
  tortoise: { coat: '#a7aba0', shade: '#777e73', trim: '#c0b69f', face: '#9b9e7e', faceShade: '#777864', hair: '#555d4e' },
  otter: { coat: '#5f706b', shade: '#42534e', trim: '#a79d80', face: '#a4836b', faceShade: '#766350', hair: '#67584b' },
  deer: { coat: '#926f59', shade: '#604c43', trim: '#ae9f86', face: '#a99174', faceShade: '#7c6958', hair: '#655547' },
  mole: { coat: '#82765b', shade: '#585445', trim: '#b0a590', face: '#989087', faceShade: '#716c67', hair: '#4b4946' },
  peacock: { coat: '#536e70', shade: '#394e52', trim: '#a89b70', face: '#7a9291', faceShade: '#5b7074', hair: '#485858' },
  bat: { coat: '#71606a', shade: '#4e414e', trim: '#a89770', face: '#a39498', faceShade: '#776870', hair: '#524851' },
  boar: { coat: '#7d6a56', shade: '#55493e', trim: '#a99a77', face: '#a5897e', faceShade: '#7e6963', hair: '#594b46' },
  mouse: { coat: '#927572', shade: '#655154', trim: '#b09d81', face: '#b5a5a0', faceShade: '#8c7b7d', hair: '#756461' },
  fox: { coat: '#5c6b73', shade: '#3f4d54', trim: '#a79a7d', face: '#b48b69', faceShade: '#8a6651', hair: '#675044' },
  heron: { coat: '#79847e', shade: '#53635f', trim: '#b5ad98', face: '#b8b9a8', faceShade: '#909b94', hair: '#5c6b67' },
  merchant: { coat: '#8c7956', shade: '#605540', trim: '#b49e77', face: '#ac9278', faceShade: '#827462', hair: '#6b604e' },
  salamander: { coat: '#826955', shade: '#5b4d42', trim: '#af9b75', face: '#9eab84', faceShade: '#778568', hair: '#5b6953' },
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
    ctx.strokeStyle = '#302127'; ctx.lineCap = 'round';
    for (let i = 0; i < 17; i++) {
      const x = minX + rng() * (maxX - minX), y = minY + rng() * (maxY - minY);
      ctx.globalAlpha = .04 + rng() * .095; ctx.lineWidth = .6 + rng() * 3.6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + 1.4, y + 3, x - .8, y + 5, x + rng() * 3, y + 5 + rng() * 6); ctx.stroke();
    }
    ctx.globalAlpha = .16; ctx.strokeStyle = '#e2d0b5'; ctx.lineWidth = .45;
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
function stitch(ctx: CanvasRenderingContext2D, d: string, color = '#beb098'): void {
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
      wash(ctx, side < 0 ? 'M0 0 C9 -12 20 -14 23 -7 L20 -4 L24 -3 L20 1 L22 2 L17 4 L20 7 L16 8 L17 13 L13 11 L12 18 C8 20 4 12 0 9 Z' : 'M0 0 C9 -12 20 -14 23 -7 C27 1 18 7 22 11 L18 10 L16 14 L14 13 L12 18 C8 20 4 12 0 9 Z', '#a79e90', true);
      wash(ctx, 'M3 3 C12 0 22 -6 20 -8 C13 -10 9 -6 3 3Z', '#bcb29c');
      pen(ctx, 'M2 4 Q13 -2 21 -7 M3 5 Q12 8 18 11 M5 7 Q11 12 12 17', '#6f6961', .65);
      oval(ctx, 14, 2.5, 3.5, 4.4, '#79736e'); oval(ctx, 14, 2.5, 1.8, 2.4, '#b5ad9b');
      pen(ctx, 'M17 -10 L14 -6 M19 8 L15 7 M9 14 L7 11', '#534d4a', .55);
      if (side < 0) { patch(ctx, 12, -5, '#9a9182', 4.5); pen(ctx, 'M16 13 Q17 18 15 21 M12 18 L11 21 M20 -4 L18 -2', '#766a60', .4); }
      ctx.restore();
    }
  }
  if (kind === 'fox' || kind === 'otter' || kind === 'mouse' || kind === 'salamander') {
    const furry = kind === 'fox';
    ctx.save(); ctx.translate(5, -9); ctx.rotate(sway * .05);
    wash(ctx, furry ? 'M0 0 C17 5 20 -4 18 -17 C15 -12 8 -10 4 -9 C5 -5 2 -2 0 0Z' : kind === 'mouse' ? 'M0 0 Q17 6 20 -3 Q23 -9 19 -10 Q24 -12 23 -5 Q21 8 0 2 Z' : 'M0 0 C20 5 21 -12 17 -15 C15 -9 11 -6 2 -7Z', p.faceShade, true);
    if (furry) wash(ctx, 'M15 -11 C18 -14 18 -17 18 -17 C20 -8 18 -4 16 -3 L13 -5 L15 -7 L12 -8Z', '#c2b6a1');
    if (kind === 'salamander') { oval(ctx, 13, -6, 1.3, .8, '#aa7859', false); oval(ctx, 17, -10, .9, 1.3, '#b09a64', false); }
    ctx.restore();
  }
  if (kind === 'tortoise') {
    wash(ctx, 'M-13 -29 C-18 -21 -15 -11 -9 -9 C-1 -4 11 -7 15 -14 C19 -23 12 -33 2 -34 C-4 -35 -10 -33 -13 -29Z', '#666c53', true);
    pen(ctx, 'M-12 -24 L-4 -29 L5 -28 L12 -23 L8 -16 L-2 -15 L-10 -18Z M-4 -29 L-2 -15 M5 -28 L8 -16 M-2 -15 L-3 -8 M-10 -18 L-13 -11', '#474c3e', 1);
  }
  if (kind === 'peacock') {
    wash(ctx, 'M-8 -10 C-16 -10 -23 -25 -20 -36 Q-16 -43 -11 -37 Q-6 -46 -1 -41 Q7 -43 11 -35 Q21 -38 23 -29 Q20 -15 8 -10 Z', '#69786c', true);
    for (const [x, y] of [[-15, -30], [-8, -35], [1, -34], [9, -30], [17, -25]]) {
      pen(ctx, `M0 -12 Q${x / 2} -21 ${x} ${y}`, '#939174', .7);
      oval(ctx, x, y, 2.7, 4, '#9b9271'); oval(ctx, x, y, 1.2, 2, '#506b70');
    }
    pen(ctx, 'M-18 -21 L-13 -17 M15 -31 L12 -27 M7 -37 L5 -33', INK, .6);
  }
}

function leg(ctx: CanvasRenderingContext2D, side: number, gait: number, kind: ActorKind): void {
  const thin = kind === 'heron';
  ctx.save(); ctx.translate(side * (kind === 'ox' || kind === 'boar' ? 5.6 : 3.8), -13);
  ctx.rotate(gait * side * .2);
  wash(ctx, thin ? 'M-1.3 0 L1.3 -.2 L1 8 L2 12 L-.6 12 L-1 8Z' : 'M-3.1 0 C-3.2 4 -2.8 7 -2.2 11 L2.3 11 L3.3 4 L2.7 -.2Z', thin ? '#a19375' : '#4c4944', false);
  wash(ctx, side > 0 ? 'M-2.9 10 Q-.2 8.8 2.5 10 L5.2 12 Q5.8 14 2 14 L-3.1 13.5Z' : 'M-2.5 10 Q0 9.1 2.5 10 L2.8 13.4 L-4.6 14 Q-6 12 -2.5 10Z', '#49413b');
  pen(ctx, 'M-2 12.1 L2.2 12.4', '#8d8170', .65); ctx.restore();
}
function torso(ctx: CanvasRenderingContext2D, kind: ActorKind, p: Palette, back: boolean): void {
  const wide = kind === 'ox' || kind === 'boar';
  const w = wide ? 12.7 : kind === 'lady' ? 10 : 9;
  const hem = kind === 'lady' ? -1 : -11;
  wash(ctx, `M${-w + 3} -31 Q-1 -34 ${w - 3} -31 Q${w + 2} -27 ${w - .7} -18 L${w + 2.2} ${hem} Q2 ${hem + 2} ${-w - .5} ${hem} L${-w + 1.2} -20 Q${-w - 3} -26 ${-w + 3} -31Z`, p.coat, true, 1.13);
  pen(ctx, `M-1 -29 Q1 -21 -.1 ${hem + 1} M${w - 3} -24 Q${w - 5} -15 ${w - 1} ${hem - .8}`, p.shade, 1.3);
  if (back) { patch(ctx, -2, -24, '#847967', 7); pen(ctx, `M-6 -19 Q0 -20 7 -17`, p.shade, .75); }
  else {
    wash(ctx, 'M-6 -31 L-1 -26 L-3 -21 L-7 -27 Z', p.trim);
    wash(ctx, 'M4 -31 L.8 -25 L3 -22 L6 -28Z', p.shade);
    pen(ctx, 'M.3 -24 L.9 -13', INK, .6); oval(ctx, 2.1, -20, .65, .55, p.trim, false); oval(ctx, 1.4, -15.8, .6, .5, p.trim, false);
    patch(ctx, -5.2, -15.5, '#91836c'); stitch(ctx, `M${-w + 1} ${hem - 1} Q-.5 ${hem + .7} ${w} ${hem - .3}`, '#ada18a');
  }
  // Imperfect bent cuffs, hanging threads, and visibly repaired knees replace uniform costume trim.
  pen(ctx, `M${-w + 1.4} ${hem + .2} l-.7 2.1 M${w - 1.6} ${hem + .3} l.7 1.8`, p.shade, .6);
  if (kind === 'ox') { pen(ctx, 'M-6 -31 L-4 -12 M6 -31 L4.5 -12', '#96776e', 2.2); patch(ctx, 5, -19, '#655a4f', 5); }
  if (kind === 'moth') {
    wash(ctx, 'M-7 -31 Q-1 -28 5 -31 L7 -27 Q1 -24 -8 -28Z', '#a19884', true);
    wash(ctx, 'M-5 -28 L-.5 -26 L-3 -15 L-7 -18Z', '#a19884', true); stitch(ctx, 'M-7 -19 L-3 -17', '#605b50');
  }
  if (kind === 'hare') {
    wash(ctx, 'M-5 -24 Q.5 -21 5 -25 L7 -12 Q1 -9 -6 -12Z', '#9a9177', true);
    pen(ctx, 'M-5 -21 L-5 -15 L3 -14 M-2 -31 L-4 -24 M4 -30 L4 -25', '#686956', .8);
    pen(ctx, 'M-4 -15 L-.5 -13.6 M2 -19 L4 -17', '#986852', 1.5);
  }
  if (kind === 'deer') { wash(ctx, 'M-7 -31 L6 -31 L4 -26 L-5 -27Z', '#55534c', true); pen(ctx, 'M3 -28 L7 -17', '#55534c', 2.8); }
  if (kind === 'peacock') { pen(ctx, 'M-6 -30 Q-8 -22 -5 -19 M5 -30 Q8 -21 5 -18', '#9b9272', 1.3); patch(ctx, 5, -15, '#7b7d6c'); }
  if (kind === 'tortoise') { pen(ctx, 'M-4 -22 L2 -22 M-1 -25 L-1 -19', '#cec7b8', 1.5); pen(ctx, 'M5 -24 Q7 -19 5 -15', '#747c75', .65); }
  if (kind === 'lady') { pen(ctx, 'M-7 -22 Q-10 -10 -8.5 -1 M5 -23 Q9 -11 8 -2', '#b18b8d', 2.2); oval(ctx, -.3, -25.8, 1.4, 1.8, '#aaa082'); pen(ctx, 'M-7 -30 Q0 -24 6 -30', '#b8a389', 1); }
}

function head(ctx: CanvasRenderingContext2D, kind: ActorKind, p: Palette, side: boolean, back: boolean, blink: boolean, time: number, state: ActorDrawingState, gaze = 0, kiss = false, detached = false): void {
  const lady = kind === 'lady';
  const wide = kind === 'ox' || kind === 'boar';
  const cy = kind === 'heron' ? -42 : lady ? -40 : kind === 'human' ? -38.4 : -37;
  const hw = lady ? 17 : wide ? 12.6 : kind === 'human' ? 10.1 : 9;
  ctx.save(); ctx.translate(side ? 1.2 : 0, cy); ctx.rotate(lady ? -.025 : .06);
  if (kind === 'hare' && !detached) {
    wash(ctx, 'M-7 -6 Q-14 -26 -9 -29 Q-4 -27 -3 -7Z', p.face, true);
    wash(ctx, 'M3 -7 C3 -25 11 -27 12 -18 Q13 -12 7 -6Z', p.face, true);
    pen(ctx, 'M-8 -9 Q-11 -20 -9 -25 M6 -9 Q6 -18 10 -22', '#9d817b', 1.3); pen(ctx, 'M10 -18 Q8 -16 8 -12', INK, .6);
    stitch(ctx, 'M-10 -18 L-6 -17', '#786e60'); pen(ctx, 'M9 -19 L12 -18 L10 -17', '#6a6056', .75);
  }
  if ((kind === 'fox' || kind === 'boar') && !(detached && kind === 'fox')) {
    wash(ctx, 'M-8 -4 L-11 -17 Q-4 -16 -2 -6Z', p.face);
    wash(ctx, 'M3 -6 Q7 -16 12 -14 L9 -3Z', p.face); pen(ctx, 'M-8 -12 L-6 -7 M8 -11 L6 -6', '#9d7468', 1.3);
  }
  if ((kind === 'mouse' || kind === 'merchant' || kind === 'otter') && !(detached && kind === 'mouse')) {
    oval(ctx, -8, -8, kind === 'otter' ? 3.2 : 5, kind === 'otter' ? 3.2 : 5.6, p.faceShade);
    oval(ctx, 8, -7.8, kind === 'otter' ? 3.2 : 5, kind === 'otter' ? 3.2 : 5.6, p.faceShade);
    if (kind !== 'otter') { oval(ctx, -8, -8, 3, 3.5, '#a48b84', false); oval(ctx, 8, -8, 3, 3.5, '#a48b84', false); }
  }
  if (kind === 'deer' || kind === 'ox') {
    const antler = kind === 'deer';
    pen(ctx, antler ? 'M-8 -5 Q-13 -12 -12 -20 M-12 -14 L-17 -19 M-12 -17 L-7 -22 M8 -5 Q13 -13 12 -20 M12 -14 L17 -17' : 'M-9 -4 C-17 -4 -18 -8 -16 -13 M9 -4 C18 -4 19 -10 15 -13', '#afa389', antler ? 2.2 : 3.3);
    pen(ctx, antler ? 'M-12 -20 L-11 -18 M12 -20 L13 -18' : 'M-16 -13 L-16 -10', '#d1c3a7', .6);
    wash(ctx, 'M-8 -3 Q-16 -5 -14 1 L-8 4Z', p.faceShade); wash(ctx, 'M8 -3 Q15 -4 14 2 L8 4Z', p.faceShade);
  }
  if (kind === 'moth' && !detached) { pen(ctx, 'M-4 -7 Q-10 -22 -15 -17 M4 -7 Q8 -21 14 -18', '#75695e', 1); pen(ctx, 'M-15 -17 l2 2 M14 -18 l-1 2', p.trim, 1.6); }
  if (kind === 'heron' || kind === 'peacock') { pen(ctx, 'M-1 -8 Q-4 -17 -6 -19 M2 -9 Q1 -20 5 -21 M5 -8 Q8 -15 9 -16', p.hair, 1.25); }
  if (kind === 'salamander' && !detached) {
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) pen(ctx, `M${s * 7} ${-6 + i * 3} Q${s * 12} ${-9 + i * 4} ${s * (15 - i)} ${-11 + i * 6}`, '#9b726b', 1.4);
  }
  if (lady) {
    // This is a living woman with an enormous surgically open skull, never a crown or a symbolic hat.
    wash(ctx, 'M-17 -11 C-23 -3 -20 10 -19 16 L-16 12 L-15 19 L-13 15 L-12 6 L13 8 L14 17 L17 13 L18 19 C23 9 22 -5 14 -13Z', p.hair, true, 1.3);
    wash(ctx, 'M-14 -13 C-19 -8 -21 1 -16 8 C-16 13 -10 20 -3 17 Q3 20 11 14 C17 13 19 6 18 -1 C18 -11 10 -17 0 -17 Q-9 -18 -14 -13Z', p.face, true, 1.45);
    wash(ctx, 'M-16 1 Q-16 11 -8 16 Q3 20 12 10 L10 14 Q-3 19 -14 11Z', p.faceShade, true);
    pen(ctx, 'M-12 9 Q-12 14 -7 14 M9 9 Q13 11 10 14 M-6 15 Q0 18 5 16', '#89696b', .7);
    oval(ctx, -15, 4.2, 1.6, 3.2, '#b78f86'); oval(ctx, 17, 3.3, 1.6, 3.1, '#b78f86');
    pen(ctx, 'M-13 2 Q-9 0 -5 2 M4 2 Q9 0 13 1', '#7e5760', 2.7);
    pen(ctx, 'M-11 5 Q-8 7 -5 5 M4 5 Q8 7 12 4', '#ac727e', 2.4);
    if (state.asleep || blink) pen(ctx, 'M-11 2.6 Q-7 4 -4.8 2.4 M3.7 2.5 Q8.2 4.2 12 1.6', INK, .9);
    else {
      oval(ctx, -7.7 + gaze * .65, 2.3, 1.1, 1.2, state.mindChanged ? '#675e53' : '#272428', false);
      oval(ctx, 7.5 + gaze * .65, 2.3, 1.1, 1.2, state.mindChanged ? '#675e53' : '#272428', false);
      pen(ctx, state.mindChanged ? 'M-12 -1 Q-8 -2 -4 -1 M4 -1 Q8 -2 12 -1' : 'M-12 -1 L-5 .2 M4 -.1 L12 -1.8', INK, 1);
    }
    wash(ctx, 'M0 2 Q-3.8 5 -2.2 7.5 Q.8 9 3 6.8 L1.8 2Z', '#b78683');
    if (kiss) { wash(ctx, 'M-1.8 9 Q1 7 3 9.7 Q4 11.4 1.1 12 Q-2 12 -.9 10.5Z', '#936572'); pen(ctx, 'M.4 9.8 Q1.5 11 2.7 9.9', '#60444d', .75); }
    else pen(ctx, 'M-5 10 Q.9 8 6 10.4 M-5 10.5 Q.4 12 5 10.5', '#865763', 1.15);
    pen(ctx, 'M-10 8 l1 2 l-.5 1 M8 8 l.5 3 M-7 -4 q2 -2 3 -.5 M4 -4 q4 -2 6 -.7', '#8c6c6d', .6);
    pen(ctx, 'M-14 9 L-11 12 M12 9 L10 12', '#94706c', .6);
    // Thick bruised rim and the literal interior of her head are readable even at world scale.
    oval(ctx, -.6, -13, 12.2, 5.8, '#ad827d'); oval(ctx, -.7, -13.6, 9.5, 4.2, '#32282e');
    pen(ctx, 'M-10.2 -14.5 Q-.5 -19 9 -14.8 M-9 -11 Q-.3 -8 8.5 -11', '#ba9790', 1.2);
    pen(ctx, 'M-10 -15 l-1 -2 M-6 -17 l-.6 -2 M4 -17 l.6 -1.8 M9 -15 l1 -2', '#624944', .65);
    if (!state.brainAbsent) { pen(ctx, 'M-7.2 -12.5 Q-4 -14 -2 -12.4 Q.8 -15 3 -12.8 Q5 -14.5 7 -12.2', '#716064', .9); }
    pen(ctx, 'M-16 7 L-16 11 M17 7 L17 11', '#ad9476', .9); oval(ctx, -16, 12, 1.4, 2, '#97856e'); oval(ctx, 17, 12, 1.4, 2, '#97856e');
    ctx.restore(); return;
  }
  wash(ctx, `M${-hw + 2} -8 C${-hw - 2.2} -4 ${-hw - 1.7} 6 ${-hw + .2} 8 Q-5 13 1.2 11.5 Q${hw - 1} 12 ${hw - .8} 7 C${hw + 2.6} 3 ${hw + .3} -4 ${hw - 3} -8 Q-.5 -12 ${-hw + 2} -8Z`, p.face, true, 1.13);
  if (kind === 'human') {
    wash(ctx, 'M-9 -1 L-10 -7 Q-6 -14 1 -12 Q9 -13 10 -5 L8 4 L5 0 L5 -6 Q-2 -5 -6 -8 L-6 0Z', p.hair, true);
    pen(ctx, 'M-8 -5 L-4 -8 M-2 -9 L2 -8 M5 -9 L8 -6', '#7b6556', .7); pen(ctx, 'M-7 7 L-4 8.5 M4 7 L6 6', '#8c6c63', .65);
    wash(ctx, 'M-.5 1 L-2.2 5 Q-.6 7 2.6 5.3 L1.3 .6Z', '#b08279');
    pen(ctx, 'M-6 3 Q-4 5 -2 3.5 M3 4 Q5 4.8 7 2.6 M-3 9 Q-.3 8 3.1 9.5', '#826e65', .7);
    pen(ctx, 'M-6 8.1 l1 .7 M-5 9 l1 .8 M4 8 l.6 1.4 M2 10 l1 .5', '#796259', .4);
  }
  if (back) {
    wash(ctx, `M${-hw + 1} -6 Q-.5 -13 ${hw - 1} -6 L${hw - 2} 6 Q0 11 ${-hw + 2} 5Z`, p.hair, true);
    pen(ctx, 'M-4 -5 Q-6 1 -3 6 M3 -5 Q5 2 3 7', p.faceShade, .6); ctx.restore(); return;
  }
  const eyeShift = side ? 3 : 0;
  if (kind === 'gatekeeper') {
    oval(ctx, -4.3, 0, 4.6, 4.3, '#c1b29b'); oval(ctx, 4.1, 0, 4.6, 4.3, '#c1b29b');
    pen(ctx, 'M-8 -2 Q-4 -4 -.1 -.7 M.2 -1 Q4 -4 8 -2', INK, 1.2);
  }
  if (kind === 'fox' || kind === 'otter' || kind === 'hare' || kind === 'mouse' || kind === 'merchant') {
    wash(ctx, side ? 'M2 2 Q10 2 13 6 Q9 9 2 7 L-1 4Z' : 'M-6 3 Q0 0 6 3 L7 7 Q0 11 -7 7Z', kind === 'fox' || kind === 'hare' ? '#c2b7a0' : '#b3a18a');
    oval(ctx, side ? 10 : .1, side ? 5.6 : 4.5, 1.6, 1.1, kind === 'hare' || kind === 'mouse' ? '#987777' : '#46423c');
  }
  if (kind === 'ox' || kind === 'boar') {
    wash(ctx, 'M-8 2 Q-13 4 -10 9 L-6 11 L5 10.5 L10 7 Q11 3 3 1Z', '#ad8d7a', true);
    oval(ctx, -5.5, 6.2, 1.3, .8, '#66544c', false); oval(ctx, 4.7, 6, 1.3, .8, '#66544c', false);
    if (kind === 'boar') { wash(ctx, 'M-8 7 Q-12 8 -12 3 Q-14 10 -8 10Z', '#b9b29d'); wash(ctx, 'M7 6 Q11 8 11 4 Q13 10 7 10Z', '#b9b29d'); }
  }
  if (kind === 'heron' || kind === 'peacock' || kind === 'gatekeeper') {
    wash(ctx, side ? 'M4 1 Q12 1 17 4 L7 7 L3 5Z' : 'M-2 2 L3 1 L5 6 L0 8 L-3 5Z', '#a79978'); pen(ctx, side ? 'M5 4 L15 4' : 'M-1 4 L2 6', '#6c5e4c', .6);
  }
  if (kind === 'mole') { wash(ctx, 'M-4 2 C-7 6 -4 10 1 9 Q8 8 6 4 Q3 1 -4 2Z', '#a68882'); }
  if (kind === 'salamander') { wash(ctx, 'M-6 2 Q0 0 7 3 Q9 8 1 9 Q-8 9 -6 2Z', '#acb696'); pen(ctx, 'M-4 7 Q0 5.5 4 7.4', '#68745a', .9); }
  const cruel = kind === 'hare' && state.mindChanged;
  const ex = side ? [4.9] : [-4.3, 4.4];
  for (const eye of ex) {
    pen(ctx, `M${eye - 2} 2.2 Q${eye} 4.4 ${eye + 2} 2.9`, '#8e7771', 1.45);
    pen(ctx, `M${eye - 2.6} 3.9 L${eye - 1.6} 4.9 M${eye + .2} 4.7 L${eye + 1.9} 4.1`, '#78655e', .55);
    if (blink || state.asleep) pen(ctx, `M${eye - 1.8} .7 Q${eye} 2 ${eye + 1.8} .8`, INK, .8);
    else {
      oval(ctx, eye + eyeShift * .15 + gaze * .55, .9, .78, 1.05, cruel ? '#3c252b' : '#322d2c', false);
      pen(ctx, cruel ? `M${eye - 2} -.8 L${eye + 1.9} .2` : `M${eye - 2.1} -.7 Q${eye} -1.6 ${eye + 2.2} -.2`, INK, .8);
    }
  }
  if (kind === 'mole' || kind === 'fox') {
    ctx.save(); ctx.globalAlpha *= .7;
    oval(ctx, -4.3, .3, 3.4, 3, '#9c99874a'); oval(ctx, 4.4, .3, 3.4, 3, '#9c99874a'); pen(ctx, 'M-.8 .5 L1 .5 M-7.6 .1 L-9 -.7 M7.7 .1 L9.1 -.8', '#aaa083', .85); ctx.restore();
  }
  pen(ctx, cruel ? 'M-3 8 Q1 5 5 7' : 'M-3.4 9 Q-.2 7 3.5 9.4', '#6d5a56', .95);
  pen(ctx, 'M-4.2 9.5 l-.5 1.2 M3.9 9.3 l.4 1.6', '#8a726b', .6);
  if (kind === 'ox') { pen(ctx, 'M-8 -1 L-5 2 M-8 -.8 L-7 1.5', '#61554b', .65); }
  if (kind === 'otter') pen(ctx, 'M-5 6 L-10 5 M-5 7 L-11 8 M5 6 L11 4 M5 7 L11 8', '#cec2aa', .5);
  if (kind === 'gatekeeper') {
    wash(ctx, 'M-11 -9 Q1 -12 12 -9 L12 -7 Q1 -8 -12 -6Z', p.shade); wash(ctx, 'M-8 -10 L-8 -16 Q0 -20 7 -15 L8 -11Z', p.coat, true); patch(ctx, 2, -14, '#9e8970', 4);
  }
  ctx.restore();
}

function prop(ctx: CanvasRenderingContext2D, kind: ActorKind, gait: number, p: Palette): void {
  ctx.save(); ctx.translate(kind === 'human' ? 11.2 : 9.5, -13 + gait * .65); ctx.rotate(gait * .08);
  if (kind === 'human') {
    pen(ctx, 'M-2 -5 Q-3 -9 .5 -9 Q4 -9 3 -5', '#a79a76', .9);
    wash(ctx, 'M-3.8 -5 L4 -5 L4.7 3 L-4.1 4Z', '#8b7d5a');
    wash(ctx, 'M-2.5 -3.5 L2.6 -3.7 L2.6 2 L-2.6 2.3Z', '#c1ad77');
    pen(ctx, 'M0 -4 L.3 3 M-3.3 3 L4 2.7', '#51463a', .7);
    pen(ctx, 'M-.7 .4 Q.3 -1.6 .8 .4', '#e3cba0', 1.3);
  } else if (kind === 'hare') {
    oval(ctx, 0, -.4, 3.8, 4, '#aaa18c'); pen(ctx, 'M-.4 -3 L-.4 .4 L2.1 1.6', '#514b42', .65); pen(ctx, 'M-3 -1 L-2 -2 M1 -3 L2 -2', '#d0c7af', .5);
  } else if (kind === 'fox' || kind === 'moth' || kind === 'mole' || kind === 'merchant') {
    ctx.rotate(-.12); wash(ctx, 'M-4 -6 L3 -6.5 L4 3 L-4 4Z', kind === 'fox' ? '#536770' : '#b6aa8d');
    pen(ctx, 'M-2 -3 L2 -3.1 M-2 -1 L1.5 -1.1 M-2 1 L1.7 .8', '#7f7461', .55);
    if (kind === 'fox') pen(ctx, 'M-2.8 -5 L-2.8 3', '#a18d6e', .8);
  } else if (kind === 'gatekeeper') { pen(ctx, 'M3 -17 L2.5 11', '#817154', 1.8); wash(ctx, 'M0 -19 L6 -18 L5 -13 L1 -13Z', '#a29373'); }
  else if (kind === 'tortoise') { wash(ctx, 'M-1 -4 L3 -4 L3 3 L-1 3Z', '#787d72'); pen(ctx, 'M-.8 -2 L2 -2', '#b4b8a3', .7); }
  else if (kind === 'lady') { pen(ctx, 'M3 -12 L2 12', '#9f8d71', 1.1); oval(ctx, 3, -14, 2.5, 3.3, '#a68c80'); pen(ctx, 'M2 -15 L4 -13', '#c7b59c', .8); }
  ctx.restore();
}

function smooth(low: number, high: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

/** Separate sleeve and wrist layers make gestures bend at an elbow instead of rotating a cutout. */
function sleeve(ctx: CanvasRenderingContext2D, p: Palette, lower: boolean): void {
  if (!lower) {
    wash(ctx, 'M-2.2 -.9 Q-4.6 1.2 -4.2 5.7 L-3.2 8 Q-.4 9 2 6.8 L2.1 3.8 Q2.8 .5 .8 -.8Z', p.shade, true);
    pen(ctx, 'M-3 3.5 Q-1 4.3 1.6 3.2', p.coat, 1.1);
  } else {
    wash(ctx, 'M-3.2 -.8 L1.8 -.5 Q3 1.7 1.7 4.3 L-3.4 4.2 Q-4 1.5 -3.2 -.8Z', p.shade, true);
    pen(ctx, 'M-3.1 3.2 Q-.5 4.2 1.8 3.2', p.trim, .8);
    wash(ctx, 'M-2.9 3.8 Q-6.1 4.7 -4.8 7.4 Q-5 10.4 -1.7 9.7 Q.7 11.4 2.7 8.1 L2.1 4.5 Q-.4 3.5 -2.9 3.8Z', p.face, true);
    pen(ctx, 'M-3.4 5.4 L-2.5 7.9 M-1.2 5.4 L-.4 8.4 M.7 5.3 L1.5 7.8', p.faceShade, .55);
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
    wash(ctx, side < 0 ? 'M-2 1 Q-9 -19 -4 -22 Q1 -20 2 0Z' : 'M-2 0 C-2 -18 6 -20 7 -11 Q8 -5 2 1Z', p.face, true);
    pen(ctx, side < 0 ? 'M-3 -2 Q-6 -13 -4 -18' : 'M1 -2 Q1 -11 5 -15', '#9d817b', 1.3);
    if (side < 0) stitch(ctx, 'M-5 -11 L-1 -10', '#786e60');
    else pen(ctx, 'M4 -12 L7 -11 L5 -10', '#6a6056', .75);
  } else if (kind === 'moth') {
    pen(ctx, `M0 0 Q${side * 6} -15 ${side * 11} -10`, '#75695e', 1);
    pen(ctx, `M${side * 11} -10 l${side * -2} 2`, p.trim, 1.6);
  } else if (kind === 'fox') {
    ctx.save(); ctx.scale(side, 1); wash(ctx, 'M-3 -1 Q1 -11 6 -9 L3 2Z', p.face, true); pen(ctx, 'M2 -7 L0 -2', '#9d7468', 1.3); ctx.restore();
  } else if (kind === 'mouse') {
    oval(ctx, 0, 0, 5, 5.6, p.faceShade); oval(ctx, 0, -.2, 3, 3.5, '#a48b84', false);
  } else if (kind === 'salamander') {
    for (let i = 0; i < 3; i++) pen(ctx, `M0 ${-3 + i * 3} Q${side * 5} ${-6 + i * 4} ${side * (8 - i)} ${-8 + i * 6}`, '#9b726b', 1.4);
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
  const decoration = state.reducedMotion ? .16 : 1;
  const flight = state.reducedMotion ? .55 : 1;
  const attack = Math.sin(Math.min(1, (state.action || 0) / .26) * Math.PI);
  ctx.save(); ctx.translate(Math.sin(time * 2.7) * .8 * decoration, -21 + Math.sin(time * 4.2) * 2.6 * decoration - attack * 2.3);
  ctx.rotate(Math.sin(time * 2.7) * .055 * decoration + attack * .16);
  for (const s of [-1, 1]) {
    const lift = Math.sin(time * 15.6 + s * .1) * 8.5 * flight;
    ctx.save(); ctx.scale(s, 1); ctx.translate(3, -7); ctx.rotate(Math.sin(time * 15.6 - .3 + s * .1) * .045 * flight); ctx.translate(-3, 7);
    wash(ctx, `M3 -8 Q16 ${-27 + lift} 29 ${-16 + lift} Q21 ${-9 + lift} 26 ${1 + lift} Q16 ${-5 + lift} 17 ${9 + lift * .4} Q10 4 5 12 L1 0Z`, '#716369', true, 1.2);
    pen(ctx, `M3 -5 Q17 ${-24 + lift} 29 ${-16 + lift} M3 -3 Q13 ${-12 + lift} 26 ${1 + lift} M3 -2 Q8 ${-2 + lift} 17 ${9 + lift * .4}`, '#a09289', .85); ctx.restore();
  }
  wash(ctx, 'M-5 -9 Q-9 -6 -7 7 L-3 12 L4 11 Q8 2 6 -8Z', '#68515b', true);
  wash(ctx, 'M-6 -9 L-10 -25 Q-3 -23 -2 -14 L3 -13 Q5 -24 10 -23 L7 -8Z', '#a49094', true);
  wash(ctx, 'M-7 -14 Q0 -20 7 -14 L8 -5 Q0 3 -8 -5Z', '#a89595', true);
  pen(ctx, 'M-8 -20 L-5 -14 M8 -20 L5 -14', '#775a64', 1.3);
  if (!back) {
    pen(ctx, 'M-6 -9 L-2 -8 M2 -8 L6 -10', '#362a32', 1.4); oval(ctx, -3.7, -7.8, .7, .6, '#c1ab79', false); oval(ctx, 3.7, -8, .7, .6, '#c1ab79', false);
    pen(ctx, 'M-4 -3 Q0 -5 4 -3', '#442b35', 1.2); wash(ctx, 'M-3 -3 L-2 1 L-1 -3Z', '#c8bca6'); wash(ctx, 'M2 -3 L3 .7 L4 -3Z', '#c8bca6');
    wash(ctx, 'M-3 2 L3 2 L4 8 L-3 8Z', '#a19472'); pen(ctx, 'M0 3 L0 6 L2 7', '#574e44', .7);
  }
  pen(ctx, 'M-4 10 L-6 14 L-3 13 M4 10 L6 14 L3 13', '#6d6662', 1.3); ctx.restore();
}

export function drawActorSprite(ctx: CanvasRenderingContext2D, kind: ActorKind, xScreen: number, yScreen: number, facing: number, moving: boolean, animation: number, time: number, scale = 1, color?: string, state: ActorDrawingState = {}): void {
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
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
  const p: Palette = { ...palettes[kind], ...(color ? { coat: color } : {}) };
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
  ctx.save(); ctx.translate(fixed ? 0 : glance * .8 * decoration, fixed ? 0 : moving ? Math.sin(phase - .35) * .28 : Math.sin(clock * .85) * .25 * decoration);
  ctx.translate(0, headY);
  ctx.rotate(fixed ? 0 : (kind === 'lady' ? Math.sin(clock * .53) * .038 : Math.sin(clock * 1.05) * .016) * decoration + glance * .035 * decoration - action * .075);
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
        wash(brush, 'M-3.5 0 Q-1.5 -3 0 -1.4 Q1.9 -3 3.9 -.2 Q1 2.6 -3.5 0Z', '#946a75');
        pen(brush, 'M-2.5 -.1 Q0 .8 2.8 -.2', '#65494f', .5);
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
  const paper = (seal = '#906a68') => {
    wash(ctx, 'M-8 -12 L6 -13 L9 -10 L8 12 L-8.5 11 L-9 -5Z', '#c6b99c', true);
    pen(ctx, 'M-5 -7 Q0 -8 5 -7 M-5 -3 L4 -3.2 M-5 1 Q-1 0 3 1.1', '#8e816c', .75);
    oval(ctx, 4, 7, 2.5, 2.9, seal); pen(ctx, 'M3 6 L5 8 M5 6 L3 8', '#c2ad98', .65);
  };
  const plant = (willow = false) => {
    pen(ctx, 'M-1 12 Q2 2 -.8 -11 M1 3 Q-5 -3 -8 -3 M0 -2 Q7 -7 9 -7 M.3 7 L8 4', '#7f7452', 1.4);
    for (const [x, y, r] of [[-6, -4, -.5], [6, -8, .5], [-4, 3, -.6], [7, 3, .5]]) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(r);
      wash(ctx, 'M-4 0 Q-1 -5 4 -2 Q3 3 -4 0Z', '#798066');
      if (willow) pen(ctx, 'M-2 0 Q-4 8 -1 11 M2 0 Q4 7 2 9', '#777f61', .7); ctx.restore();
    }
    pen(ctx, 'M-3 12 L3 12', '#5b5845', 1.6);
  };
  if (id.includes('axe')) {
    pen(ctx, 'M-8 12 Q-3 2 6 -11', '#584b3c', 3.4); pen(ctx, 'M-7.6 11 Q-2 1 6.3 -10', '#a58d65', 1.8);
    wash(ctx, 'M-2 -10 Q4 -16 10 -12 L10 -3 Q5 -4 1 -6 L-1 -6Z', '#858b83', true); pen(ctx, 'M8 -11 Q9 -8 9 -4', '#b3b5a0', 1.1); pen(ctx, 'M1 -8 L4 -7', RUST, 1.3);
  } else if (id.includes('pick')) {
    pen(ctx, 'M-8 12 L5 -10', '#574b3e', 3.2); pen(ctx, 'M-7 11 L5 -10', '#ac956d', 1.5);
    wash(ctx, 'M-10 -4 Q-5 -13 5 -12 Q11 -9 12 -4 Q4 -10 -4 -6 L-10 -4Z', '#868b86', true); pen(ctx, 'M-7 -7 Q-2 -12 5 -11', '#b4b5a1', .8);
  } else if (id.includes('rod')) {
    pen(ctx, 'M-10 12 Q-1 4 5 -12', '#847051', 2.1); pen(ctx, 'M-9 11 L-4 5', '#48483b', 3.3);
    pen(ctx, 'M5 -12 Q12 -1 10 8 L8 9 Q6 8 8 6', '#bab4a2', .65); oval(ctx, 10, 5, 1.8, 2.4, RUST);
  } else if (id.includes('cane') || id.includes('sword')) {
    pen(ctx, 'M-2 12 L-2 -9 Q-1 -15 5 -12 Q8 -11 7 -7', '#8c7555', 3.3); pen(ctx, 'M-1.4 11 L-1.4 -8 Q-1 -12 3 -12', '#b6a080', .85); pen(ctx, 'M-3.2 10 L-.8 10', INK, 1.8);
  } else if (id.includes('lantern')) {
    pen(ctx, 'M-5 -8 Q-6 -16 0 -16 Q6 -15 5 -8', '#998969', 1.2);
    wash(ctx, 'M-8 -8 L7 -8 L9 11 L-8 12Z', '#7d7357', true); wash(ctx, 'M-5 -5 L5 -5 L5.8 8 L-5 9Z', '#c2ad74');
    pen(ctx, 'M0 -6 L.5 10 M-7 9 L8 9', '#585041', 1.2); pen(ctx, 'M-1 6 Q-2 1 1 1 Q4 4 1 6', '#e2c493', 1.6);
  } else if (id.includes('soup') || id.includes('stew') || id === 'tea') {
    const cup = id === 'tea';
    wash(ctx, cup ? 'M-8 -4 L6 -4 L5 10 Q-1 13 -7 9Z' : 'M-12 0 L12 0 Q11 10 3 11 L-4 11 Q-11 9 -12 0Z', '#9a9b89', true);
    oval(ctx, cup ? -1 : 0, cup ? -4 : 0, cup ? 7 : 12, 3.3, cup ? '#827e5b' : '#a68b59');
    if (cup) pen(ctx, 'M6 -1 Q15 -3 13 5 Q11 9 5 7', '#adae99', 2.1);
    else { oval(ctx, -5, 0, 1.6, .8, '#798369', false); oval(ctx, 4, .4, 1.7, .7, RUST, false); }
    pen(ctx, 'M-5 -7 Q-9 -10 -5 -14 M3 -7 Q7 -10 3 -14', '#b7b3a2', .7); pen(ctx, 'M-7 7 L-3 8', '#6d705e', .9);
  } else if (id === 'carrot') {
    wash(ctx, 'M-5 -8 Q1 -12 6 -7 Q6 2 -1 13 Q-6 4 -5 -8Z', '#b28559', true); pen(ctx, 'M-3 -1 L2 0 M-2 5 L1 6', '#785941', .8);
    pen(ctx, 'M0 -9 Q-6 -15 -6 -17 M1 -9 L2 -18 M2 -9 Q8 -13 8 -17', '#798265', 1.9);
  } else if (id.includes('fish')) {
    wash(ctx, 'M-12 0 C-6 -9 4 -8 8 -2 L14 -7 L12 0 L14 7 L8 3 Q-3 10 -12 0Z', '#8b9b92', true);
    pen(ctx, 'M-1 -5 L3 -10 L4 -5 M-1 6 L3 10 L5 5 M-4 -4 Q-1 0 -4 4', '#697970', 1.2); oval(ctx, -8, -.3, 1.1, 1.4, INK, false); pen(ctx, 'M0 -2 L3 0 M2 2 L5 3', '#bec3ae', .7);
  } else if (id.includes('willow') || id.includes('sapling') || id.includes('herb') || id.includes('flower')) {
    if (id.includes('verse')) paper('#777e62'); else plant(id.includes('willow'));
    if (id.includes('flower')) { for (let i = 0; i < 5; i++) oval(ctx, Math.cos(i * 1.26) * 3, -10 + Math.sin(i * 1.26) * 3, 2.4, 3, '#aa8987'); oval(ctx, 0, -10, 1.8, 2, '#b6a578'); }
  } else if (id.includes('wood') || id.includes('log')) {
    wash(ctx, 'M-12 3 L4 -5 L11 -1 L11 4 L-5 12 L-12 8Z', '#927758', true); oval(ctx, -9, 5, 3.3, 4.7, '#b49a74'); oval(ctx, -9, 5, 1.7, 2.8, '#9e825d');
    wash(ctx, 'M-10 -7 L8 -13 L13 -9 L12 -3 L-5 4 L-11 0Z', '#8b6e50', true); oval(ctx, -8, -3, 3, 4.3, '#ad916c'); pen(ctx, 'M-4 -2 L10 -7 M-1 6 L9 1', '#63503e', .85);
  } else if (id.includes('stone') || id.includes('ore') || id.includes('iron') || id.includes('coal')) {
    wash(ctx, 'M-12 5 L-8 -7 L0 -12 L10 -8 L13 5 L6 11 L-6 12Z', id.includes('coal') ? '#595650' : '#8a9088', true);
    wash(ctx, 'M-8 -7 L0 -12 L7 -8 L0 -1 L-11 3Z', '#a0a499'); pen(ctx, 'M0 -1 L5 5 L3 9 M0 -1 L10 -8', '#646b65', .8);
    if (id.includes('ore') || id.includes('iron')) { pen(ctx, 'M-6 -4 L-3 1 L1 2 M7 -2 L8 5 L6 7', '#aa8060', 2.2); }
  } else if (id.includes('brain') && !id.includes('protocol')) {
    const brain = id.includes('blank') ? '#aba89b' : '#b59494';
    const inJar = id.includes('supine');
    ctx.save(); if (inJar) { ctx.translate(0, -.5); ctx.scale(.67, .67); }
    wash(ctx, 'M-12 -2 Q-15 -7 -10 -9 Q-10 -13 -5 -12 Q0 -15 3 -12 Q10 -14 12 -8 Q17 -6 13 0 Q15 5 9 7 Q6 12 0 9 Q-6 12 -10 7 Q-16 6 -12 -2Z', brain, true, 1.1);
    pen(ctx, 'M0 -11 Q-3 -7 0 -3 Q3 2 0 8 M-10 -6 Q-5 -8 -6 -3 Q-11 -1 -6 2 Q-4 2 -7 6 M5 -9 Q9 -6 5 -3 Q2 0 8 1 Q12 3 6 6', '#80686e', 1); pen(ctx, 'M-2 9 L-1 13 L2 13 L1 9', '#8c7677', 1.5);
    ctx.restore();
    if (inJar) {
      pen(ctx, 'M-9 -10 Q-12 -4 -10 9 Q0 15 10 9 Q12 -4 9 -10Z', '#8c958d', 1.3);
      wash(ctx, 'M-10 -13 L10 -13 L10 -9 L-10 -9Z', '#858276');
      pen(ctx, 'M-6 -6 Q-8 -1 -6 6 M4 7 Q6 7 7 5', '#c9c3ad', 1.2);
      pen(ctx, 'M10 3 Q15 2 15 7 L13 11', '#887964', 1.15); oval(ctx, 13, 11, 1.7, 1.4, '#6b6b60');
    }
  } else if (id.includes('switch')) {
    wash(ctx, 'M-12 -2 L7 -5 L12 9 L-9 12Z', '#777375', true); pen(ctx, 'M-1 2 L2 -11', '#b2a590', 2.4); wash(ctx, 'M-2 -14 L7 -13 L6 -8 L-3 -9Z', '#a97f82'); oval(ctx, -7, 5, 1.1, 1.1, '#9aa286'); oval(ctx, 7, 4, 1.1, 1.1, '#a97062'); pen(ctx, 'M-8 9 L6 7', '#afa087', .8);
  } else if (id.includes('coupon')) { paper('#8e747b'); oval(ctx, -.5, -6.5, 3.5, 3.5, '#b39287'); pen(ctx, 'M-2 -6 L-.7 -5 M1 -6 L2 -5 M-1 -3 L1 -3', '#76515a', .8); }
  else if (id.includes('time_glass') || id.includes('timeglass') || id === 'time') {
    pen(ctx, 'M-8 -12 L8 -12 M-8 12 L8 12', '#9f8e6c', 2.5);
    wash(ctx, 'M-6 -11 L6 -11 Q8 -5 1 0 Q7 6 6 11 L-6 11 Q-7 6 -1 0 Q-8 -5 -6 -11Z', '#a8b0a0', true); wash(ctx, 'M-4 -10 L4 -10 Q4 -5 0 -3Z', '#b6a477'); wash(ctx, 'M-5 10 Q-2 5 0 4 Q2 7 5 10Z', '#b6a477');
  } else if (id.includes('campfire') || id.includes('fire')) {
    pen(ctx, 'M-10 11 L10 5 M-10 5 L9 12', '#826848', 4); pen(ctx, 'M-9 10 L8 6 M-9 6 L8 11', '#a0845d', .8);
    wash(ctx, 'M-7 8 Q-10 2 -4 -3 Q-5 2 -1 1 Q4 -7 3 -13 Q11 -4 7 4 Q10 8 4 10 Q-4 13 -7 8Z', '#ae8051', true); wash(ctx, 'M-2 9 Q-5 4 0 0 Q1 6 4 5 Q5 10 -2 9Z', '#c7ad73');
  } else if (id.includes('bench') || id.includes('workbench')) {
    pen(ctx, 'M-8 -5 L-9 12 M8 -5 L8 12', '#6c5c48', 2.4); wash(ctx, 'M-12 -6 L11 -7 L12 -2 L-12 -1Z', '#a18b68', true); wash(ctx, 'M-11 4 L12 3 L11 7 L-11 8Z', '#907955', true); pen(ctx, 'M-8 6 L7 5 M-6 -4 L4 -4.3', '#665744', .7);
  } else if (id.includes('lullaby') || id.includes('music')) { paper('#788381'); pen(ctx, 'M2 -9 L2 1 L-2 3 M2 -9 L7 -7 L7 0 L4 2', '#6b7270', 1.3); }
  else if (id.includes('ticket')) {
    wash(ctx, 'M-13 -7 L12 -8 L11 -3 L9 -2 L11 1 L11 8 L-12 9 L-12 3 L-10 1 L-13 -2Z', '#b5a281', true); stitch(ctx, 'M-3 -7 L-3 8', '#786b5b'); pen(ctx, 'M0 -3 L7 -3.5 M0 0 L6.5 -.5 M0 4 L5 3.7', '#92736b', .7);
  } else if (id.includes('ledger') || id.includes('protocol') || id.includes('book')) {
    wash(ctx, 'M-9 -12 L8 -13 L10 10 L-7 12 L-10 10Z', id.includes('protocol') ? '#8e7378' : '#667a79', true); pen(ctx, 'M-6 -11 L-5 10 M-2 -8 L6 -9 M-1 5 L6 4', '#aaa187', .8); pen(ctx, 'M-6 11 L9 9.7', '#c9bca2', 1.4); patch(ctx, 3, -1, '#939381', 4);
  } else if (id === 'friendship_token') {
    pen(ctx, 'M-10 1 Q-12 10 -3 11 C7 15 11 6 8 1 Q6 -5 0 -3 Q-4 -3 -3 2 Q-1 5 3 2', '#a3967e', 1.15);
    oval(ctx, -7.5, -4.5, 5, 5.6, '#989489'); oval(ctx, -7.4, -4.3, 3.4, 4, '#bab09b');
    for (const [x, y] of [[-8.8, -5.8], [-6.1, -5.8], [-8.8, -3.2], [-6.1, -3.2]]) oval(ctx, x, y, .65, .65, '#625e50', false);
    pen(ctx, 'M-10 -3 Q-5 4 1 6', '#aaa085', 1.1);
    pen(ctx, 'M12 -10 C6 -15 1 -11 3 -6 C5 -2 11 -2 12 -7 C12 -11 7 -12 6 -8 C5 -5 9 -4 9 -7 Q9 -9 7 -8', '#767870', 1.2);
    pen(ctx, 'M3 -6 L1 -3 L2 -1', '#8e8978', .8);
  } else if (id.includes('token') || id.includes('heart')) {
    wash(ctx, 'M0 -6 Q-9 -15 -12 -5 Q-13 1 0 12 Q12 1 12 -5 Q10 -15 0 -6Z', '#a17d7f', true); pen(ctx, 'M-8 -4 Q-6 -8 -3 -6 M-4 2 L2 7', '#c2a19a', 1.1); pen(ctx, 'M0 -5 L-1 1 L2 3 L1 7', '#725a60', .8);
  } else if (id.includes('bandage')) {
    wash(ctx, 'M-13 -3 L8 -8 L13 2 L-9 9Z', '#c1b69c', true); wash(ctx, 'M-3 -6 L4 -6 L6 5 L-2 7Z', '#a8957d'); pen(ctx, 'M-1 -1 L3 1 M0 -3 L3 4', '#cdc0a5', 1.2); stitch(ctx, 'M-10 -1 L-8 5 M7 -4 L9 2', '#8b8170');
  } else if (id.includes('mushroom')) {
    wash(ctx, 'M-3 1 L4 1 Q1 9 5 13 Q0 15 -5 12Z', '#bbb099'); wash(ctx, 'M-13 1 Q-11 -13 0 -13 Q12 -13 13 0 Q5 4 -13 1Z', '#9a7977', true); oval(ctx, -5, -5, 2, 2.8, '#bbb099', false); oval(ctx, 5, -7, 2.3, 1.9, '#bbb099', false);
  } else if (id.includes('worm')) {
    pen(ctx, 'M-9 -7 C-14 7 -5 11 2 8 Q9 5 9 -5', '#a89081', 4.1); pen(ctx, 'M-9 -7 C-14 7 -5 11 2 8 Q9 5 9 -5', '#c3a895', 2); oval(ctx, 9, -7, 2.3, 3, '#b69b8c'); oval(ctx, 8.3, -7.8, .5, .5, INK, false);
  } else if (id.includes('refusal') || id.includes('paper') || id.includes('permit') || id.includes('identity')) paper(id.includes('permit') ? '#7a876d' : '#956c73');
  else { wash(ctx, 'M-9 -7 L7 -8 L9 10 Q0 15 -8 11Z', '#a59370', true); wash(ctx, 'M-5 -13 L4 -13 L5 -8 L-5 -7Z', '#a3987c'); pen(ctx, 'M-7 -5 L6 -6 M-3 -2 L3 -2 L4 7 L-2 8Z', '#675e4a', .85); }
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
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(makeItemCanvas(id), x, y, size, size); ctx.restore();
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
  wash(ctx, 'M-28 -24 L-7 -29 L18 -26 L29 -19 L26 16 L20 29 L-21 27 L-30 14Z', '#a49e8e', true, .65);
  ctx.globalAlpha = .17;
  for (let i = 0; i < 27; i++) {
    const x = rng() * 60 - 30, y = rng() * 60 - 30;
    pen(ctx, `M${x} ${y} q${rng() * 12 - 4} ${rng() * 6} ${rng() * 13} ${rng() * 11 - 5}`, '#5b514b', .3 + rng() * .5);
  }
  ctx.restore();
  const zoom = size / (kind === 'lady' ? 43 : 31);
  const faceOffset = kind === 'lady' ? 39 : kind === 'bat' ? 34 : 37;
  drawActorSprite(ctx, kind, size * .5, size * .55 + faceOffset * zoom, Math.PI / 2, false, 0, 2, zoom, undefined,
    { asleep: state.asleep, mindChanged: state.mindChanged, brainAbsent: state.brainAbsent, reducedMotion: true, phaseOffset: 0 });
  ctx.strokeStyle = '#665c50'; ctx.lineWidth = size / 80;
  ctx.beginPath(); ctx.moveTo(size * .035, size * .06); ctx.lineTo(size * .97, size * .025); ctx.lineTo(size * .94, size * .95); ctx.lineTo(size * .03, size * .975); ctx.closePath(); ctx.stroke();
  const url = canvas.toDataURL('image/png'); portraitCache.set(key, url); return url;
}
