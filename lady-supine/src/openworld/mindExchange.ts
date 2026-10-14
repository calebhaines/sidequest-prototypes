import { actorHeadAnchor } from './sprites';
import { PALETTE as P } from './palette';
import { paperPath, paperShape } from './paper';
import { drawPaperAsset, drawPaperAssetRegion } from './paperAssets';
import { TILE_SIZE, type RenderFrame, type Vec } from './types';

const ink = P.ink;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const phase = (time: number, start: number, end: number) => ease((time - start) / (end - start));

function organ(ctx: CanvasRenderingContext2D, size: number, _colour: string, pulse: number) {
  ctx.save(); ctx.scale(size * (1 + pulse * .028), size * (1 - pulse * .018));
  // The same non-graphic photographed anatomical specimen is a physical inventory item and traveling organ.
  drawPaperAsset(ctx, 'item-brain', -15, -13, 30, 26); ctx.restore();
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
  // Smooth photographic-material hose has a narrow reflected edge. Directional pressure packets
  // retain the physical transfer timing and remain stationary when the simulation is paused.
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
  // Crop actual rusty pipework from the hospital apparatus to form its moving control housing.
  ctx.save(); ctx.beginPath(); ctx.moveTo(-20, -10); ctx.lineTo(18, -10); ctx.lineTo(20, 12); ctx.lineTo(-19, 13); ctx.closePath(); ctx.clip();
  drawPaperAssetRegion(ctx, 'brain-machine', .02, .70, .95, .29, -21, -11, 42, 26); ctx.restore();
  paperShape(ctx, [1, -8, 14, -8, 14, 8, 1, 8], P.slate, 752, .18);
  ctx.fillStyle = P.paper; ctx.beginPath(); ctx.ellipse(7, 0, 6.5, 6.5, 0, 0, Math.PI * 2); ctx.fill();
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
  // The specimen compresses at the clamp and opening as it is physically extracted and inserted.
  const squeeze = Math.sin(Math.PI * extraction) * .16 + Math.sin(Math.PI * insertion) * .2;
  ctx.scale(1 - squeeze, 1 + squeeze * .4);
  const settled = jar ? Math.sin((time - .9) * 42) * Math.exp(-Math.max(0, time - .9) * 25) * phase(time, .9, .91) * motion : 0;
  ctx.translate(0, settled * 1.4 * zoom);
  organ(ctx, size * zoom, colour, Math.sin(elapsed * 3.5) * motion);
  if (insertion < .9) {
    // A thin mechanical tether makes the transport legible without adding blood or falling tissue.
    ctx.strokeStyle = P.umbra; ctx.lineWidth = .65 * zoom;
    const tail = (9 + Math.sin(Math.PI * extraction) * 7 + airborne * 8) * zoom;
    ctx.beginPath(); ctx.moveTo(1 * zoom, 8 * zoom); ctx.bezierCurveTo(-6 * zoom, 10 * zoom + tail * .3, (4 + Math.sin(elapsed * 3) * motion * 2) * zoom, 10 * zoom + tail * .75, 2 * zoom, 8 * zoom + tail); ctx.stroke();
  }
  ctx.restore();
}

function receivingJar(ctx: CanvasRenderingContext2D, at: Vec, zoom: number, time: number, motion: number, front: boolean) {
  ctx.save(); ctx.translate(at.x, at.y); ctx.scale(zoom, zoom);
  const settled = phase(time, .78, .96);
  if (!front) {
    // Real brass feet and an empty section of actual amber jar glass form the receiving vessel.
    // The glass crop is below the source specimen, so the traveling organ is the only brain inside.
    drawPaperAssetRegion(ctx, 'brain-machine', .12, .84, .76, .15, -28, 34, 56, 10);
    ctx.save(); ctx.beginPath(); ctx.moveTo(-18, -3); ctx.quadraticCurveTo(-22, 1, -22, 7);
    ctx.lineTo(-19, 30); ctx.quadraticCurveTo(0, 40, 19, 30); ctx.lineTo(22, 7); ctx.quadraticCurveTo(22, 1, 18, -3); ctx.closePath(); ctx.clip();
    ctx.globalAlpha *= .32;
    drawPaperAssetRegion(ctx, 'brain-machine', .315, .452, .17, .022, -22, -3, 44, 39); ctx.restore();
  } else {
    // Only the photographed jar's edge reflections pass in front of the newly received model.
    ctx.save(); ctx.beginPath(); ctx.rect(-22, -5, 3.5, 39); ctx.rect(18.5, -5, 3.5, 39); ctx.rect(-22, 30, 44, 5); ctx.clip();
    drawPaperAssetRegion(ctx, 'brain-machine', .304, .235, .19, .25, -22, -5, 44, 41); ctx.restore();
    ctx.strokeStyle = P.sand; ctx.lineWidth = .6; ctx.beginPath(); ctx.ellipse(0, -3, 20, 3.3, -.025, 0, Math.PI * 2); ctx.stroke();
    ctx.save(); ctx.globalAlpha *= settled * (1 - phase(time, .93, 1)) * .55;
    ctx.strokeStyle = P.paper; ctx.lineWidth = .55;
    for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(0, 21, 8 + settled * (7 + i * 2) * motion, 2 + i, -.035, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    const lid = phase(time, .86, .99);
    ctx.save(); ctx.translate((1 - lid) * 33, 23 - lid * 30 - Math.sin(Math.PI * lid) * 14 * motion); ctx.rotate((1 - lid) * -.25);
    ctx.beginPath(); ctx.ellipse(0, -.5, 22, 5.3, -.025, 0, Math.PI * 2); ctx.clip();
    drawPaperAssetRegion(ctx, 'brain-machine', .295, .204, .205, .067, -22, -6, 44, 11); ctx.restore();
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
