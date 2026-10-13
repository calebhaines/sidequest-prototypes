import { actorHeadAnchor } from './sprites';
import { TILE_SIZE, type RenderFrame, type Vec } from './types';

const ink = '#292822';
function organ(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, colour: string) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.fillStyle = colour; ctx.strokeStyle = ink; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(-11, 2); ctx.bezierCurveTo(-17, -4, -10, -11, -6, -9); ctx.bezierCurveTo(-4, -14, 2, -12, 4, -9); ctx.bezierCurveTo(9, -12, 16, -6, 12, -2); ctx.bezierCurveTo(17, 5, 10, 11, 5, 8); ctx.bezierCurveTo(0, 12, -5, 8, -8, 8); ctx.bezierCurveTo(-15, 9, -17, 3, -11, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.globalAlpha = .3; ctx.strokeStyle = '#e3d2b9'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-9, -6); ctx.bezierCurveTo(-4, -11, 5, -5, 8, -8); ctx.stroke();
  ctx.globalAlpha = .85; ctx.strokeStyle = '#5b4542'; ctx.lineWidth = .8;
  for (let i = 0; i < 5; i++) {
    const ox = i * 4.1 - 9;
    ctx.beginPath(); ctx.moveTo(ox, -7 + Math.sin(i) * 2); ctx.bezierCurveTo(ox + 4, -2, ox - 2, 1, ox + 2, 6); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.bezierCurveTo(-2, -3, 3, 1, 0, 8); ctx.stroke();
  ctx.restore();
}
function pathPoint(from: Vec, to: Vec, t: number, bend: number): Vec {
  const lift = Math.sin(Math.PI * t) * bend;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - lift };
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
  const duration = sequence.duration;
  const time = Math.min(1, sequence.elapsed / duration);
  const travel = Math.max(0, Math.min(1, (time - .18) / .64));
  const fade = Math.min(1, time * 9) * Math.min(1, (1 - time) * 10);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = .68;
  const sag = 34 * frame.zoom;
  ctx.strokeStyle = '#292b27'; ctx.lineWidth = 3.2 * frame.zoom;
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.bezierCurveTo(from.x + 15, from.y + sag, to.x - 20, to.y + sag, to.x, to.y); ctx.stroke();
  ctx.strokeStyle = '#a5997d'; ctx.lineWidth = .9 * frame.zoom; ctx.stroke();
  ctx.globalAlpha = .45;
  ctx.strokeStyle = '#685749'; ctx.lineWidth = 7 * frame.zoom;
  ctx.beginPath(); ctx.moveTo(from.x, from.y + 7); ctx.bezierCurveTo(from.x - 16, from.y - 30, to.x + 16, to.y - 34, to.x, to.y + 7); ctx.stroke();
  if (sequence.kind === 'restore') {
    ctx.globalAlpha = .9;
    ctx.fillStyle = '#b6b6a184'; ctx.strokeStyle = ink; ctx.lineWidth = 1.4 * frame.zoom;
    ctx.beginPath(); ctx.ellipse(from.x, from.y - 6, 21 * frame.zoom, 10 * frame.zoom, 0, 0, Math.PI * 2); ctx.lineTo(from.x + 21 * frame.zoom, from.y + 23 * frame.zoom); ctx.bezierCurveTo(from.x + 18 * frame.zoom, from.y + 33 * frame.zoom, from.x - 17 * frame.zoom, from.y + 30 * frame.zoom, from.x - 21 * frame.zoom, from.y + 23 * frame.zoom); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.globalAlpha = fade;
  const first = pathPoint(from, to, travel, (frame.reducedMotion ? 14 : 48) * frame.zoom);
  const second = pathPoint(to, from, travel, (frame.reducedMotion ? 8 : -23) * frame.zoom);
  organ(ctx, first.x, first.y, .86 * frame.zoom, '#a59681');
  organ(ctx, second.x, second.y, 1.07 * frame.zoom, '#8a6461');
  ctx.globalAlpha = .6 * fade; ctx.strokeStyle = '#554947'; ctx.lineWidth = .7 * frame.zoom;
  ctx.beginPath(); ctx.moveTo(first.x, first.y + 8 * frame.zoom); ctx.bezierCurveTo(first.x - 6, first.y + 21, first.x + 5, first.y + 25, first.x + 2, first.y + 28); ctx.stroke();
  ctx.restore();
}
