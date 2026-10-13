import { actorHeadAnchor } from './sprites';
import { PALETTE as P, rgba } from './palette';
import { TILE_SIZE, type RenderFrame, type Vec } from './types';

const ink = P.ink;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const phase = (time: number, start: number, end: number) => ease((time - start) / (end - start));

function organ(ctx: CanvasRenderingContext2D, size: number, colour: string, pulse: number) {
  ctx.save(); ctx.scale(size * (1 + pulse * .028), size * (1 - pulse * .018));
  ctx.lineCap = 'round'; ctx.lineJoin = 'bevel';
  ctx.fillStyle = colour; ctx.strokeStyle = ink; ctx.lineWidth = 1.4;
  // The two hemispheres remain corporeal; their cortex is drawn as folded ink planes.
  ctx.beginPath(); ctx.moveTo(-13, 1); ctx.lineTo(-15, -5); ctx.lineTo(-9, -10); ctx.lineTo(-3, -11); ctx.lineTo(0, -8); ctx.lineTo(4, -11); ctx.lineTo(11, -8); ctx.lineTo(15, -2); ctx.lineTo(12, 4); ctx.lineTo(6, 9); ctx.lineTo(1, 7); ctx.lineTo(-4, 10); ctx.lineTo(-11, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.globalAlpha *= .42; ctx.fillStyle = P.chalk;
  ctx.beginPath(); ctx.moveTo(-12, -4); ctx.lineTo(-7, -9); ctx.lineTo(-1, -7); ctx.lineTo(-5, -1); ctx.lineTo(-10, 1); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(3, -8); ctx.lineTo(10, -6); ctx.lineTo(11, -1); ctx.lineTo(7, -3); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.save(); ctx.globalAlpha *= .36; ctx.fillStyle = P.bruise;
  ctx.beginPath(); ctx.moveTo(-10, 2); ctx.lineTo(-5, -1); ctx.lineTo(-1, 2); ctx.lineTo(-4, 8); ctx.lineTo(-10, 6); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(8, -2); ctx.lineTo(12, 3); ctx.lineTo(6, 8); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.strokeStyle = P.charcoal; ctx.lineWidth = .8;
  ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(-5, -4); ctx.lineTo(-8, 0); ctx.lineTo(-3, 3); ctx.lineTo(-6, 6);
  ctx.moveTo(6, -7); ctx.lineTo(3, -3); ctx.lineTo(8, 0); ctx.lineTo(4, 3); ctx.lineTo(7, 5);
  ctx.moveTo(0, -9); ctx.lineTo(-1, -4); ctx.lineTo(1, 1); ctx.lineTo(0, 7); ctx.stroke();
  ctx.save(); ctx.globalAlpha *= .55; ctx.strokeStyle = P.rust; ctx.lineWidth = .65;
  ctx.beginPath(); ctx.moveTo(-11, 4); ctx.lineTo(-8, 2); ctx.lineTo(-7, -2); ctx.moveTo(-8, 2); ctx.lineTo(-12, 0); ctx.moveTo(9, 3); ctx.lineTo(10, 0); ctx.lineTo(7, -3); ctx.stroke(); ctx.restore();
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
  ctx.strokeStyle = P.ink; ctx.lineWidth = 4 * zoom; trace(0, 1);
  ctx.strokeStyle = P.clay; ctx.lineWidth = 1.7 * zoom; trace(0, 1);
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
  ctx.fillStyle = P.umbra; ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-20, -9); ctx.lineTo(-5, -14); ctx.lineTo(17, -10); ctx.lineTo(19, 8); ctx.lineTo(4, 14); ctx.lineTo(-18, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = P.clay;
  ctx.beginPath(); ctx.moveTo(-18, -7); ctx.lineTo(-6, -10); ctx.lineTo(-4, 10); ctx.lineTo(-17, 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = P.slate;
  ctx.beginPath(); ctx.moveTo(-3, -11); ctx.lineTo(16, -8); ctx.lineTo(17, 6); ctx.lineTo(3, 11); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = P.sand; ctx.lineWidth = .8;
  ctx.beginPath(); ctx.moveTo(-16, -5); ctx.lineTo(-8, -7); ctx.lineTo(-7, 7); ctx.lineTo(-15, 6); ctx.stroke();
  ctx.fillStyle = P.paper; ctx.beginPath(); ctx.moveTo(7, -7); ctx.lineTo(14, -1); ctx.lineTo(8, 7); ctx.lineTo(0, 1); ctx.closePath(); ctx.fill(); ctx.strokeStyle = ink; ctx.stroke();
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
  ctx.strokeStyle = P.charcoal; ctx.lineWidth = 1.35;
  if (!front) {
    ctx.fillStyle = P.bark;
    ctx.beginPath(); ctx.moveTo(-28, 35); ctx.lineTo(30, 35); ctx.lineTo(26, 43); ctx.lineTo(-27, 42); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = rgba('fog', .44);
    ctx.beginPath(); ctx.moveTo(-20, -5); ctx.lineTo(-23, 7); ctx.lineTo(-18, 33); ctx.lineTo(-3, 37); ctx.lineTo(18, 32); ctx.lineTo(21, -5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = rgba('sage', .34); ctx.beginPath(); ctx.moveTo(-20, 20); ctx.lineTo(-3, 27); ctx.lineTo(19, 20); ctx.lineTo(17, 32); ctx.lineTo(-1, 35); ctx.lineTo(-18, 31); ctx.closePath(); ctx.fill();
  } else {
    ctx.save(); ctx.globalAlpha *= .5; ctx.fillStyle = rgba('lichen', .2);
    ctx.beginPath(); ctx.moveTo(-19, 7); ctx.lineTo(-17, 31); ctx.lineTo(1, 36); ctx.lineTo(18, 30); ctx.lineTo(19, 7); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, -5, 21, 8, -.035, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = P.chalk; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-16, 3); ctx.lineTo(-17, 13); ctx.lineTo(-13, 29); ctx.stroke();
    ctx.save(); ctx.globalAlpha *= settled * (1 - phase(time, .93, 1)) * .65; ctx.strokeStyle = P.paper; ctx.lineWidth = .8;
    for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(0, 21, 8 + settled * (7 + i * 2) * motion, 2 + i, -.035, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    const lid = phase(time, .86, .99);
    ctx.strokeStyle = P.umbra; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse((1 - lid) * 33, 23 - lid * 30 - Math.sin(Math.PI * lid) * 14 * motion, 22, 6.2, (1 - lid) * -.25, 0, Math.PI * 2); ctx.stroke();
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
