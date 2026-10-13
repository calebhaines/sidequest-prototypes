import { actorHeadAnchor } from './sprites';
import { PALETTE as P, rgba } from './palette';
import { paperPath, paperSeam, paperShape } from './paper';
import { TILE_SIZE, type RenderFrame, type Vec } from './types';

const ink = P.ink;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const phase = (time: number, start: number, end: number) => ease((time - start) / (end - start));

function organ(ctx: CanvasRenderingContext2D, size: number, colour: string, pulse: number) {
  ctx.save(); ctx.scale(size * (1 + pulse * .028), size * (1 - pulse * .018));
  // Cortex is a physical, folded organ made from overlapping torn tissue-coloured stock.
  // The dark spaces between pieces remain actual folds, rather than thought symbols.
  paperShape(ctx, [-14, 0, -15, -5, -9, -10, -3, -12, 0, -8, 4, -12, 11, -8, 15, -2, 12, 5, 6, 10, 1, 8, -4, 11, -11, 7], P.bruise, 710, .62);
  paperShape(ctx, [-13, -4, -8, -10, -2, -10, -1, -5, -3, 0, -1, 6, -5, 9, -11, 5], colour, 711, .5);
  paperShape(ctx, [2, -8, 5, -10, 11, -6, 14, -1, 10, 5, 5, 8, 1, 5, 2, 0], colour, 712, .45);
  const folds = [
    [-12, -3, -8, -7, -3, -6, -5, -4, -9, -4, -10, -1],
    [-10, 0, -6, -3, -3, -1, -4, 1, -7, 1, -6, 5, -9, 4],
    [-5, 4, -2, 2, -1, 5, -4, 8, -7, 7, -6, 5],
    [3, -6, 6, -8, 10, -5, 8, -3, 5, -5],
    [5, -2, 9, -3, 12, 0, 10, 2, 8, 0, 4, 1],
    [4, 3, 7, 2, 10, 4, 7, 7, 3, 6],
  ];
  ctx.save(); ctx.globalAlpha *= .55;
  folds.forEach((fold, index) => paperShape(ctx, fold, index % 3 === 2 ? P.clay : P.flesh, 720 + index, .23));
  ctx.restore();
  ctx.save(); ctx.globalAlpha *= .46;
  paperShape(ctx, [-11, -5, -8, -8, -4, -8, -6, -6], P.paper, 731, .18);
  paperShape(ctx, [4, -7, 7, -8, 10, -5, 7, -5], P.paper, 732, .18);
  ctx.restore();
  paperSeam(ctx, [-.2, -8, -1.2, -4, .6, .5, -.2, 7], P.umbra, .55);
  paperSeam(ctx, [-11, -1, -8, -2, -6, 1, -8, 3], P.umbra, .45);
  paperSeam(ctx, [8, -4, 6, -2, 9, 0, 7, 3], P.umbra, .45);
  ctx.restore();
}

function tubePoint(from: Vec, to: Vec, t: number, sag: number): Vec {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t + Math.sin(Math.PI * t) * sag };
}

function tube(ctx: CanvasRenderingContext2D, from: Vec, to: Vec, sag: number, zoom: number, pressure: number, time: number, reverse: boolean) {
  const trace = (start: number, end: number) => {
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const p = tubePoint(from, to, start + (end - start) * i / 24, sag);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  };
  // A rough strip of charcoal paper encloses the repaired tubing. Moving pressure
  // packets are still directional, and the original sag/transfer timing is preserved.
  const strip = new Path2D();
  for (let i = 0; i <= 24; i++) {
    const p = tubePoint(from, to, i / 24, sag);
    if (i === 0) strip.moveTo(p.x, p.y - 1.9 * zoom);
    else strip.lineTo(p.x, p.y - 1.9 * zoom);
  }
  for (let i = 24; i >= 0; i--) {
    const p = tubePoint(from, to, i / 24, sag); strip.lineTo(p.x, p.y + 1.9 * zoom);
  }
  strip.closePath();
  const left = Math.min(from.x, to.x), top = Math.min(from.y, to.y) - Math.abs(sag) - 3 * zoom;
  paperPath(ctx, strip, P.charcoal, [left - 3 * zoom, top, Math.abs(to.x - from.x) + 6 * zoom, Math.abs(to.y - from.y) + Math.abs(sag) * 2 + 6 * zoom], reverse ? 743 : 742, .48 * zoom);
  ctx.strokeStyle = P.clay; ctx.lineWidth = 1.2 * zoom; trace(0, 1);
  if (pressure > 0) {
    ctx.save(); ctx.globalAlpha *= pressure * .7; ctx.strokeStyle = reverse ? P.flesh : P.straw; ctx.lineWidth = 2 * zoom;
    // Separated pressure packets run through the tubing in opposite directions.
    for (let i = 0; i < 3; i++) {
      const moving = (time * .28 + i / 3) % 1;
      const position = reverse ? 1 - moving : moving;
      trace(Math.max(0, position - .055), Math.min(1, position + .055));
    }
    ctx.restore();
  }
}

function apparatus(ctx: CanvasRenderingContext2D, from: Vec, to: Vec, zoom: number, progress: number, elapsed: number, motion: number) {
  const pressure = phase(progress, .03, .18) * (1 - phase(progress, .81, .95));
  const sag = 36 * zoom;
  tube(ctx, from, to, sag, zoom, pressure, elapsed, false);
  tube(ctx, { x: from.x, y: from.y + 7 * zoom }, { x: to.x, y: to.y + 7 * zoom }, -25 * zoom, zoom, pressure, elapsed + .55, true);
  const centre = tubePoint(from, to, .5, sag);
  ctx.save(); ctx.translate(centre.x, centre.y); ctx.scale(zoom, zoom);
  ctx.rotate(Math.sin(elapsed * 17) * .012 * pressure * motion);
  paperShape(ctx, [-20, -9, -5, -14, 17, -10, 19, 8, 4, 14, -18, 11], P.umbra, 750, .7);
  paperShape(ctx, [-18, -7, -6, -10, -4, 10, -17, 8], P.clay, 751, .6);
  paperShape(ctx, [-3, -11, 16, -8, 17, 6, 3, 11], P.slate, 752, .48);
  paperShape(ctx, [-15, -5, -8, -7, -7, 7, -15, 6], P.bark, 753, .25);
  paperSeam(ctx, [-4, -11, -3, 3, 3, 11], P.ink, .75);
  paperShape(ctx, [7, -7, 14, -1, 8, 7, 0, 1], P.paper, 754, .35);
  ctx.strokeStyle = ink; ctx.lineWidth = .8;
  const needle = -2.35 + pressure * 2.6 + Math.sin(elapsed * 8) * .045 * pressure * motion;
  ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(7 + Math.cos(needle) * 5.4, Math.sin(needle) * 5.4); ctx.stroke();
  ctx.strokeStyle = ink; ctx.lineWidth = 2.2;
  const lever = -.9 + phase(progress, .055, .16) * 1.4 - phase(progress, .91, .99) * .9;
  ctx.beginPath(); ctx.moveTo(-9, 4); ctx.lineTo(-9 + Math.sin(lever) * 12, 4 - Math.cos(lever) * 12); ctx.stroke();
  ctx.fillStyle = P.charcoal; ctx.beginPath(); ctx.ellipse(-9 + Math.sin(lever) * 12, 4 - Math.cos(lever) * 12, 2.8, 4, -lever, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = P.ink;
  for (const [x, y] of [[-15, -8], [14, -8], [-14, 10], [14, 8]]) { ctx.beginPath(); ctx.arc(x, y, .9, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  // The small clamps close before extraction, then withdraw after insertion.
  const closed = phase(progress, .06, .19) * (1 - phase(progress, .85, .98));
  for (const point of [from, to]) {
    ctx.save(); ctx.translate(point.x, point.y); ctx.scale(zoom, zoom);
    ctx.strokeStyle = P.sand; ctx.lineWidth = 2.2;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * (18 - closed * 3), 8); ctx.lineTo(side * (15 - closed * 3), -4); ctx.lineTo(side * (12 - closed * 5), -7); ctx.stroke();
      ctx.strokeStyle = ink; ctx.lineWidth = .6; ctx.stroke(); ctx.strokeStyle = P.sand; ctx.lineWidth = 2.2;
    }
    ctx.restore();
  }
}

function transfer(ctx: CanvasRenderingContext2D, from: Vec, to: Vec, time: number, elapsed: number, zoom: number, bend: number, size: number, colour: string, motion: number, jar: boolean) {
  const extraction = phase(time, .14, .3), travelling = phase(time, .3, .73), insertion = phase(time, .73, .9);
  const airborne = Math.sin(Math.PI * travelling);
  const x = from.x + (to.x - from.x) * travelling;
  const y = from.y + (to.y - from.y) * travelling + (8 - extraction * 25 + insertion * (jar ? 36 : 26)) * zoom - airborne * bend;
  const visible = phase(time, .13, .25) * (jar ? 1 : 1 - phase(time, .81, .94));
  if (visible <= 0) return;
  const swing = Math.sin(elapsed * 4.7) * .036 * motion * airborne;
  ctx.save(); ctx.globalAlpha *= visible; ctx.translate(x, y);
  ctx.rotate(Math.sin(Math.PI * travelling) * .18 * Math.sign(to.x - from.x) * motion + swing);
  // Tissue compresses at the clamp and opening, rather than sliding at a constant speed.
  const squeeze = Math.sin(Math.PI * extraction) * .16 + Math.sin(Math.PI * insertion) * .2;
  ctx.scale(1 - squeeze, 1 + squeeze * .4);
  const settled = jar ? Math.sin((time - .9) * 42) * Math.exp(-Math.max(0, time - .9) * 25) * phase(time, .9, .91) * motion : 0;
  ctx.translate(0, settled * 1.4 * zoom);
  organ(ctx, size * zoom, colour, Math.sin(elapsed * 3.5) * motion);
  if (insertion < .9) {
    ctx.strokeStyle = P.bruise; ctx.lineWidth = .75 * zoom;
    const tail = (9 + Math.sin(Math.PI * extraction) * 7 + airborne * 8) * zoom;
    ctx.beginPath(); ctx.moveTo(1 * zoom, 8 * zoom); ctx.bezierCurveTo(-6 * zoom, 10 * zoom + tail * .3, (4 + Math.sin(elapsed * 3) * motion * 2) * zoom, 10 * zoom + tail * .75, 2 * zoom, 8 * zoom + tail); ctx.stroke();
    // Two subdued drops detach during extraction; deterministic motion survives pause.
    ctx.save(); ctx.globalAlpha *= .5 * airborne * motion; ctx.fillStyle = P.rust;
    for (let i = 0; i < 2; i++) {
      const fall = (elapsed * .43 + i * .48) % 1;
      ctx.beginPath(); ctx.ellipse((i * 4 - 3) * zoom, (13 + fall * 22) * zoom, (1 - fall * .65) * zoom, (1.7 - fall) * zoom, -.1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

function receivingJar(ctx: CanvasRenderingContext2D, at: Vec, zoom: number, time: number, motion: number, front: boolean) {
  ctx.save(); ctx.translate(at.x, at.y); ctx.scale(zoom, zoom);
  const settled = phase(time, .78, .96);
  if (!front) {
    paperShape(ctx, [-28, 35, 30, 35, 26, 43, -27, 42], P.bark, 770, .65);
    // Transparent scraps stand in for patched glass; the returned brain remains
    // visible behind the front layer once the hospital restoration is complete.
    paperShape(ctx, [-20, -5, -23, 7, -18, 33, -3, 37, 18, 32, 21, -5], rgba('fog', .38), 771, .4);
    paperShape(ctx, [-20, 20, -3, 27, 19, 20, 17, 32, -1, 35, -18, 31], rgba('water', .27), 772, .3);
    paperSeam(ctx, [-20, 1, -21, 10, -17, 31, -2, 35, 18, 30, 20, 1], P.charcoal, .8);
  } else {
    paperShape(ctx, [-19, 7, -17, 31, 1, 36, 18, 30, 19, 7], rgba('paper', .12), 773, .3);
    paperShape(ctx, [-19, -7, -8, -11, 11, -10, 21, -5, 12, -1, -8, 1], rgba('fog', .28), 774, .35);
    paperSeam(ctx, [-19, -7, -8, -11, 11, -10, 21, -5, 12, -1, -8, 1, -19, -7], P.charcoal, .9);
    ctx.save(); ctx.globalAlpha *= .55;
    paperShape(ctx, [-16, 3, -14, 4, -15, 13, -11, 28, -13, 29, -17, 13], P.chalk, 775, .23);
    paperShape(ctx, [10, 8, 17, 5, 14, 14, 10, 13], P.paper, 776, .16);
    ctx.restore();
    ctx.save(); ctx.globalAlpha *= settled * (1 - phase(time, .93, 1)) * .65; ctx.strokeStyle = P.paper; ctx.lineWidth = .8;
    for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(0, 21, 8 + settled * (7 + i * 2) * motion, 2 + i, -.035, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    const lid = phase(time, .86, .99);
    ctx.save(); ctx.translate((1 - lid) * 33, 23 - lid * 30 - Math.sin(Math.PI * lid) * 14 * motion); ctx.rotate((1 - lid) * -.25);
    paperShape(ctx, [-22, -2, -11, -6, 13, -5, 22, 0, 11, 5, -13, 5], P.umbra, 778, .5);
    paperShape(ctx, [-20, -2, -10, -5, 11, -4, 19, -1, 9, 1, -10, 1], P.slate, 779, .25);
    ctx.restore();
  }
  ctx.restore();
}

export function drawMindExchange(ctx: CanvasRenderingContext2D, frame: RenderFrame, width: number, height: number) {
  const sequence = frame.sequence;
  if (!sequence) return;
  const project = (v: Vec) => ({ x: (v.x - frame.camera.x) * TILE_SIZE * frame.zoom + width / 2, y: (v.y - frame.camera.y) * TILE_SIZE * frame.zoom + height / 2 });
  const from = project(sequence.from), to = project(sequence.to);
  const fromAnchor = sequence.kind === 'exchange' ? actorHeadAnchor('hare') : { x: 0, y: -28 };
  const toAnchor = actorHeadAnchor(sequence.kind === 'exchange' ? 'lady' : 'hare');
  from.x += fromAnchor.x * frame.zoom; from.y += fromAnchor.y * frame.zoom;
  to.x += toAnchor.x * frame.zoom; to.y += toAnchor.y * frame.zoom;
  const time = clamp(sequence.elapsed / sequence.duration), zoom = frame.zoom;
  const motion = frame.reducedMotion ? .12 : 1;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = phase(time, 0, .07) * (1 - phase(time, .96, 1));
  apparatus(ctx, from, to, zoom, time, sequence.elapsed, motion);
  if (sequence.kind === 'restore') receivingJar(ctx, from, zoom, time, motion, false);
  transfer(ctx, from, to, time, sequence.elapsed, zoom, (frame.reducedMotion ? 15 : 43) * zoom, .86, P.sand, motion, false);
  // The return line lags the first extraction, making two separate physical transfers legible.
  transfer(ctx, to, from, clamp((time - .035) / .965), sequence.elapsed + .5, zoom, (frame.reducedMotion ? -8 : -27) * zoom, 1.07, P.flesh, motion, sequence.kind === 'restore');
  if (sequence.kind === 'restore') receivingJar(ctx, from, zoom, time, motion, true);
  ctx.restore();
}
