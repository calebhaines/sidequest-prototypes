import { useEffect, useRef, useState } from 'react';
import { Backpack, BookOpen, ChevronRight, Clock3, Heart, Map, Menu, Moon, Sun, Zap } from 'lucide-react';
import type { GameState } from '../data/game';
import { formatTime } from '../data/game';
import { ITEM_DEFS } from '../openworld/items';
import { PALETTE24 as P, rgba as mapWash } from '../openworld/palette';
import { paperPath, paperRandom, paperSeam, paperShape, paperTexture } from '../openworld/paper';
import { actorPortraitDataUrl, itemIconDataUrl } from '../openworld/sprites';
import type { TileKind, Vec, WorldData, WorldScene, WorldSnapshot } from '../openworld/types';

export type GameNotice = { id: number | string; text: string; kind?: 'info' | 'success' | 'warning' };
export type GameHUDProps = {
  story: GameState; world: WorldSnapshot; data: WorldData; quest: string;
  onPanel: (panel: string) => void; onSelectSlot: (index: number) => void;
  onInteract: () => void; onAction: () => void; onTouchDirection: (direction: Vec) => void;
  notices?: GameNotice[];
};

const terrainMaps = new WeakMap<WorldData, HTMLCanvasElement>();
const roomMaps = new WeakMap<WorldScene, HTMLCanvasElement>();


function simplifyLine(points: Vec[], tolerance = 1.5): Vec[] {
  if (points.length <= 3) return points;
  const a = points[0], b = points[points.length - 1];
  const dx = b.x - a.x, dy = b.y - a.y, denom = dx * dx + dy * dy;
  let farthest = tolerance * tolerance, at = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i];
    const projection = denom ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / denom)) : 0;
    const distance = (point.x - a.x - projection * dx) ** 2 + (point.y - a.y - projection * dy) ** 2;
    if (distance > farthest) { farthest = distance; at = i; }
  }
  if (at < 0) return [a, b];
  return [...simplifyLine(points.slice(0, at + 1), tolerance).slice(0, -1), ...simplifyLine(points.slice(at), tolerance)];
}

// Trace the physical banks/roads, then tear their paper edges gently. Geography stays
// continuous, including holes in land/water; the chart never paints a pixel grid.
function paperContours(context: CanvasRenderingContext2D, scene: WorldScene, kinds: TileKind[], fill: string, outline?: string, unit = 3) {
  const selected = (x: number, y: number) => x >= 0 && y >= 0 && x < scene.width && y < scene.height && kinds.includes(scene.tiles[y * scene.width + x]);
  const links = new globalThis.Map<string, string[]>();
  const edge = (ax: number, ay: number, bx: number, by: number) => {
    const key = `${ax}:${ay}`;
    const next = links.get(key) || [];
    next.push(`${bx}:${by}`); links.set(key, next);
  };
  for (let y = 0; y < scene.height; y++) for (let x = 0; x < scene.width; x++) {
    if (!selected(x, y)) continue;
    if (!selected(x, y - 1)) edge(x, y, x + 1, y);
    if (!selected(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
    if (!selected(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
    if (!selected(x - 1, y)) edge(x, y + 1, x, y);
  }
  const points: Vec[][] = [];
  while (links.size) {
    const first = links.keys().next().value as string;
    const loop: Vec[] = []; let current = first; let guard = 0;
    do {
      const [x, y] = current.split(':').map(Number); loop.push({ x, y });
      const branches = links.get(current);
      if (!branches?.length) break;
      const next = branches.shift()!;
      if (!branches.length) links.delete(current);
      current = next;
    } while (current !== first && ++guard < scene.width * scene.height * 4);
    if (loop.length > 3) {
      const half = Math.floor(loop.length / 2);
      const reduced = [...simplifyLine(loop.slice(0, half + 1)).slice(0, -1), ...simplifyLine([...loop.slice(half), loop[0]]).slice(0, -1)];
      if (reduced.length > 2) points.push(reduced);
    }
  }
  context.save(); context.scale(unit, unit);
  const path = new Path2D();
  const rng = paperRandom(kinds.join('').length * 197 + scene.width);
  for (const loop of points) {
    path.moveTo(loop[0].x, loop[0].y);
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      const pieces = Math.max(1, Math.min(60, Math.ceil(length / 1.5)));
      for (let part = 1; part < pieces; part++) {
        const t = part / pieces, tear = (rng() - .5) * .24;
        path.lineTo(a.x + dx * t + dy / length * tear, a.y + dy * t - dx / length * tear);
      }
      path.lineTo(b.x, b.y);
    }
    path.closePath();
  }
  paperPath(context, path, fill, [0, 0, scene.width, scene.height], kinds.join('').length * 19, .19);
  if (outline) { context.strokeStyle = outline; context.lineWidth = .14; context.lineJoin = 'bevel'; context.stroke(path); }
  context.restore();
  return path;
}

function terrainMap(data: WorldData) {
  const existing = terrainMaps.get(data);
  if (existing) return existing;
  const map = document.createElement('canvas');
  map.width = data.overworld.width * 3;
  map.height = data.overworld.height * 3;
  const context = map.getContext('2d');
  if (context) {
    const scene = data.overworld;
    paperTexture(context, 0, 0, map.width, map.height, P.ash, 960);
    context.save(); context.scale(3, 3);
    const rng = paperRandom(data.seed + 961);
    // Patched stock makes this a physical field chart, not a smooth green game map.
    for (let index = 0; index < 32; index++) {
      const x = rng() * scene.width, y = rng() * scene.height;
      const w = 9 + rng() * 34, h = 8 + rng() * 24;
      const colour = [P.paper, P.ash, P.clay, P.sand, P.fog][index % 5];
      paperShape(context, [x, y, x + w * .8, y - h * .06, x + w, y + h * .72, x + w * .6, y + h, x - w * .06, y + h * .9], colour, 962 + index, .28);
    }
    for (const [index, region] of data.regions.entries()) {
      const pigment = region.id === 'forest' ? P.pine : region.id === 'shanty' ? P.clay : region.id === 'pit' ? P.charcoal : region.id === 'fields' ? P.sage : P.ash;
      const x = region.x, y = region.y, w = region.width, h = region.height;
      paperShape(context, [x + w * .08, y + h * .24, x + w * .64, y + h * .1, x + w * .9, y + h * .34, x + w * .82, y + h * .9, x + w * .2, y + h * .84], pigment, 1000 + index, .35);
      if (region.id === 'forest') {
        for (let tree = 0; tree < 10; tree++) {
          const sx = x + w * (.2 + tree * .062), sy = y + h * (.44 + Math.sin(tree * 1.1) * .15);
          paperShape(context, [sx - 1.8, sy + 1, sx + .2, sy - 4.5, sx + 2.2, sy + .3, sx + .3, sy + 2], tree % 2 ? P.moss : P.umbra, 1020 + tree, .14);
          paperSeam(context, [sx + .2, sy - 3, sx + .4, sy + 3], P.ink, .23);
        }
      }
    }
    context.restore();
    paperContours(context, scene, ['dirt', 'tilled'], P.clay);
    paperContours(context, scene, ['sand'], P.sand);
    const water = paperContours(context, scene, ['water', 'deepWater'], P.water, mapWash(P.deepWater, .5));
    // Long overlapping water scraps, clipped to the real shoreline.
    context.save(); context.scale(3, 3); context.clip(water);
    for (let index = 0; index < 30; index++) {
      const y = index * scene.height / 30;
      paperShape(context, [-2, y, scene.width, y - .9, scene.width + 2, y + 1.5, -1, y + 2.2], index % 3 ? P.water : P.fog, 1060 + index, .12);
    }
    context.restore();
    paperContours(context, scene, ['deepWater'], P.deepWater);
    paperContours(context, scene, ['stone', 'stoneFloor'], P.slate, mapWash(P.ink, .3));
    paperContours(context, scene, ['path', 'woodFloor'], P.paper, mapWash(P.umbra, .35));
    for (const [index, object] of scene.objects.entries()) {
      if (object.kind !== 'building') continue;
      const x = object.x * 3, y = object.y * 3, w = (object.width || 2) * 3, h = (object.height || 2) * 3;
      paperShape(context, [x - .3, y + .4, x + w, y, x + w - .5, y + h, x + .2, y + h - .7], P.umbra, 1100 + index, .55);
      paperShape(context, [x, y, x + w * .64, y + .2, x + w * .6, y + h * .32, x - .2, y + h * .33], P.ash, 1101 + index, .35);
      paperSeam(context, [x + w * .35, y + h * .4, x + w * .4, y + h], P.ink, .65);
    }
    // Mended folds in the base sheet stay faint enough for paths to remain clear.
    context.save(); context.globalAlpha *= .3;
    paperSeam(context, [map.width * .025, map.height * .965, map.width * .86, map.height * .974], P.umbra, .7);
    paperSeam(context, [map.width * .95, map.height * .055, map.width * .94, map.height * .73], P.umbra, .7);
    context.restore();
  }
  terrainMaps.set(data, map);
  return map;
}

function roomMap(room: WorldScene) {
  const existing = roomMaps.get(room);
  if (existing) return existing;
  const canvas = document.createElement('canvas');
  canvas.width = room.width * 4; canvas.height = room.height * 4;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    paperTexture(ctx, 0, 0, canvas.width, canvas.height, P.charcoal, 1200);
    paperContours(ctx, room, ['woodFloor', 'stoneFloor', 'path', 'dirt', 'grass'], P.paper, undefined, 4);
    ctx.save(); ctx.scale(4, 4);
    for (const [index, object] of room.objects.entries()) {
      const w = object.width || 1, h = object.height || 1;
      const x = object.x, y = object.y;
      const fill = object.kind === 'bed' ? P.ash : object.kind === 'window' ? P.water : object.kind === 'rug' ? P.rust : P.umbra;
      paperShape(ctx, [x, y + .1, x + w, y, x + w - .1, y + h, x + .1, y + h], fill, 1220 + index, .13);
    }
    ctx.restore();
  }
  roomMaps.set(room, canvas);
  return canvas;
}

function roomInsetBounds(width: number, height: number, large: boolean, room: WorldScene) {
  const w = Math.min(large ? 205 : 68, width * (large ? .37 : .4));
  const header = large ? 20 : 13, padding = large ? 7 : 4;
  const mapWidth = w - padding * 2;
  const mapHeight = Math.min(mapWidth * room.height / room.width, height * .4);
  const h = mapHeight + header + padding * 2;
  return { x: width - w - (large ? 12 : 5), y: height - h - (large ? 12 : 5), w, h, header, padding, mapWidth, mapHeight };
}

function drawRoomInset(ctx: CanvasRenderingContext2D, width: number, height: number, large: boolean, room: WorldScene, world: WorldSnapshot) {
  const bounds = roomInsetBounds(width, height, large, room);
  const { x, y, w, h, header, padding, mapWidth, mapHeight } = bounds;
  paperShape(ctx, [x, y + 1, x + w - 2, y, x + w, y + h - 2, x + 2, y + h], P.chalk, 1240, .65);
  ctx.font = `${large ? 11 : 7}px "DM Sans", sans-serif`;
  ctx.fillStyle = P.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('CURRENT ROOM', x + padding, y + padding);
  const mapX = x + padding, mapY = y + padding + header;
  ctx.drawImage(roomMap(room), mapX, mapY, mapWidth, mapHeight);
  const sx = mapWidth / room.width, sy = mapHeight / room.height;
  if (room.exit) {
    const ex = mapX + room.exit.positionInRoom.x * sx, ey = mapY + room.exit.positionInRoom.y * sy;
    paperShape(ctx, [ex - 2.5, ey - 1.5, ex + 2, ey - 1.5, ex + 2, ey + 1.5, ex - 2.5, ey + 1.5], P.straw, 1241, .15);
  }
  if (world.waypoint && world.waypointScene === room.id) {
    const wx = mapX + world.waypoint.x * sx, wy = mapY + world.waypoint.y * sy;
    ctx.strokeStyle = P.bruise; ctx.lineWidth = large ? 1.25 : .8;
    ctx.beginPath(); ctx.moveTo(wx - 3, wy - 3); ctx.lineTo(wx + 3, wy + 3); ctx.moveTo(wx + 3, wy - 3); ctx.lineTo(wx - 3, wy + 3); ctx.stroke();
  }
  const px = mapX + world.player.x * sx, py = mapY + world.player.y * sy;
  const r = large ? 3 : 1.8;
  paperShape(ctx, [px - r, py, px, py - r, px + r, py, px, py + r], P.chalk, 1242, .14);
  ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(px, py, r * .42, 0, Math.PI * 2); ctx.fill();
}

export type WorldMapCanvasProps = {
  data: WorldData; world: WorldSnapshot; large?: boolean; onWaypoint?: (point: Vec) => void;
};

export function WorldMapCanvas({ data, world, large = false, onWaypoint }: WorldMapCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const map = terrainMap(data);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    const rasterWidth = Math.max(1, Math.round(width * pixelRatio));
    const rasterHeight = Math.max(1, Math.round(height * pixelRatio));
    if (canvas.width !== rasterWidth || canvas.height !== rasterHeight) { canvas.width = rasterWidth; canvas.height = rasterHeight; }
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const scaleX = width / data.overworld.width;
    const scaleY = height / data.overworld.height;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(map, 0, 0, width, height);
    ctx.save(); ctx.globalAlpha *= .88;
    paperTexture(ctx, 0, 0, width, height, P.charcoal, 1260); ctx.restore();
    ctx.save(); ctx.beginPath();
    for (const key of world.explored) {
      const [x, y] = key.split(':').map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const rng = paperRandom(x * 149 + y * 257), cx = (x * 8 + 4) * scaleX, cy = (y * 8 + 4) * scaleY;
      for (let edge = 0; edge < 20; edge++) {
        const angle = edge / 20 * Math.PI * 2, radius = 6.2 * (.96 + rng() * .1);
        const px = cx + Math.cos(angle) * scaleX * radius, py = cy + Math.sin(angle) * scaleY * radius;
        if (!edge) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }
    ctx.clip(); ctx.drawImage(map, 0, 0, width, height); ctx.restore();
    for (const region of data.regions) {
      const discovered = world.discovered.includes(region.id) || region.id === world.region.id;
      const px = region.landmark.x * scaleX;
      const py = region.landmark.y * scaleY;
      const radius = large ? 4 : 1.8;
      paperShape(ctx, [px - radius, py + radius * .35, px - radius * .25, py - radius, px + radius, py - radius * .15, px + radius * .7, py + radius], discovered ? P.flesh : P.fog, 1280 + region.x, large ? .4 : .2);
      paperSeam(ctx, [px - radius * .55, py + radius * .35, px + radius * .6, py + radius * .35], discovered ? P.ink : P.smoke, large ? .65 : .4);
      if (large) {
        ctx.font = '12px "DM Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const label = discovered ? region.name.replace('The ', '').replace('Library of Time Well Spent', 'Library').replace('Entrance to Infinite Time', 'Infinite Time') : '?';
        const textWidth = ctx.measureText(label).width;
        const margin = Math.min(width / 2, textWidth / 2 + 5);
        const labelX = Math.max(margin, Math.min(width - margin, px));
        const labelY = py > height - 25 ? py - 20 : py + 7;
        const left = labelX - textWidth / 2 - 4, right = labelX + textWidth / 2 + 4;
        paperShape(ctx, [left, labelY, right - 1, labelY - 1, right, labelY + 16, left + 1, labelY + 17], P.paper, 1300 + region.x, .7);
        ctx.fillStyle = discovered ? P.ink : P.charcoal;
        ctx.fillText(label, labelX, labelY);
      }
    }
    if (world.waypoint) {
      const waypoint = world.waypointScene && world.waypointScene !== data.overworld.id ? data.interiors[world.waypointScene]?.exit?.position || world.waypoint : world.waypoint;
      const x = waypoint.x * scaleX;
      const y = waypoint.y * scaleY;
      ctx.strokeStyle = P.bruise;
      ctx.lineWidth = large ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x + .4, y - .2, 5, 4.5, -.25, 0, Math.PI * 2); ctx.stroke();
    }
    const player = world.sceneId === data.overworld.id ? world.player : data.interiors[world.sceneId]?.exit?.position || world.region.landmark;
    const px = player.x * scaleX, py = player.y * scaleY;
    const radius = large ? 6 : 4;
    paperShape(ctx, [px - radius, py + radius * .3, px - radius * .45, py - radius, px + radius * .6, py - radius * .8, px + radius, py + radius * .6, px - radius * .3, py + radius], P.chalk, 1340, large ? .45 : .2);
    paperShape(ctx, [px - radius * .48, py, px + radius * .07, py - radius * .6, px + radius * .55, py + radius * .4, px - radius * .42, py + radius * .42], P.ink, 1341, .14);
    ctx.save(); ctx.globalAlpha *= .6;
    paperSeam(ctx, [1.2, 2, width - 1, 1, width - 2, height - 1, 1, height - 2, 1.2, 2], P.umbra, .85); ctx.restore();
    const room = data.interiors[world.sceneId];
    if (room) drawRoomInset(ctx, width, height, large, room, world);
  }, [data, world.player.x, world.player.y, world.sceneId, world.discovered, world.explored, world.waypoint, world.waypointScene, world.region, large]);
  return <canvas ref={ref} width={large ? 900 : 192} height={large ? Math.round(900 * data.overworld.height / data.overworld.width) : Math.round(192 * data.overworld.height / data.overworld.width)} className={large ? 'ow-world-map-canvas' : 'ow-minimap-canvas'} aria-label={large ? 'Map of the Land of Limited Time' : 'Minimap'} onClick={event => {
    if (!onWaypoint) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const room = data.interiors[world.sceneId];
    if (room) {
      const inset = roomInsetBounds(bounds.width, bounds.height, large, room);
      const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
      if (x >= inset.x && x <= inset.x + inset.w && y >= inset.y && y <= inset.y + inset.h) return;
    }
    onWaypoint({ x: (event.clientX - bounds.left) / bounds.width * data.overworld.width, y: (event.clientY - bounds.top) / bounds.height * data.overworld.height });
  }} />;
}

function TouchJoystick({ onDirection }: { onDirection: (direction: Vec) => void }) {
  const [position, setPosition] = useState<Vec>({ x: 0, y: 0 });
  const pointer = useRef<number | null>(null);
  const update = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    let x = (event.clientX - rect.left - rect.width / 2) / (rect.width * .38);
    let y = (event.clientY - rect.top - rect.height / 2) / (rect.height * .38);
    const distance = Math.hypot(x, y);
    if (distance > 1) { x /= distance; y /= distance; }
    const direction = distance < .1 ? { x: 0, y: 0 } : { x, y };
    setPosition(direction);
    onDirection(direction);
  };
  const release = () => { pointer.current = null; setPosition({ x: 0, y: 0 }); onDirection({ x: 0, y: 0 }); };
  const directionRef = useRef(onDirection);
  directionRef.current = onDirection;
  useEffect(() => () => directionRef.current({ x: 0, y: 0 }), []);
  return <div className="ow-joystick" role="application" aria-label="Movement joystick" onPointerDown={event => {
    event.preventDefault(); pointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); update(event);
  }} onPointerMove={event => { if (pointer.current === event.pointerId) update(event); }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
    <span className="ow-joystick-cross">✥</span><span className="ow-joystick-knob" style={{ transform: `translate(${position.x * 29}px, ${position.y * 29}px)` }} />
  </div>;
}

export default function GameHUD({ story, world, data, quest, onPanel, onSelectSlot, onInteract, onAction, onTouchDirection, notices = [] }: GameHUDProps) {
  const health = Math.max(0, world.player.health / world.player.maxHealth * 100);
  const stamina = Math.max(0, world.player.stamina / world.player.maxStamina * 100);
  const night = world.dayTime % 1 > .7 || world.dayTime % 1 < .2;
  const selectedItem = ITEM_DEFS[world.hotbar[world.selected]];
  return <div className="ow-hud" aria-label="Game status and controls">
    <div className="ow-vitals ow-framed">
      <div className="ow-player-medallion"><img src={actorPortraitDataUrl('human')} alt="" /><small>{world.player.level}</small></div>
      <div className="ow-vitals-body">
        <div className="ow-vitals-title"><span>Wanderer</span><small>LV {world.player.level}</small></div>
        <div className="ow-stat-bar ow-health" aria-label={`Health ${Math.ceil(world.player.health)} of ${world.player.maxHealth}`}><Heart size={11} /><span><i style={{ width: `${health}%` }} /></span><small>{Math.ceil(world.player.health)}</small></div>
        <div className="ow-stat-bar ow-stamina" aria-label={`Stamina ${Math.ceil(world.player.stamina)} of ${world.player.maxStamina}`}><Zap size={11} /><span><i style={{ width: `${stamina}%` }} /></span></div>
      </div>
      <div className={`ow-borrowed-time ${story.time < 300 ? 'ow-time-low' : ''}`} title="Your allotted time. Reading and menus pause the world."><img className="ow-time-portrait" src={actorPortraitDataUrl('lady', 48)} alt="" /><div><small>BORROWED TIME</small><strong>{formatTime(story.time)}</strong></div><Clock3 size={13} aria-hidden="true" /></div>
    </div>

    <div className="ow-region-banner"><div><small>LAND OF LIMITED TIME</small><strong>{world.region.name}</strong></div></div>

    <div className="ow-top-right">
      <button className="ow-minimap ow-framed" aria-label="Open map" onClick={() => onPanel('map')}><WorldMapCanvas data={data} world={world} /><span className="ow-minimap-bottom">{night ? <Moon size={11} /> : <Sun size={11} />}<span>{night ? 'Evening' : 'Daylight'}</span><kbd>M</kbd></span></button>
      <div className="ow-hud-buttons"><button aria-label="Open inventory" title="Inventory · I" onClick={() => onPanel('inventory')}><Backpack size={17} /></button><button aria-label="Open journal" title="Journal · J" onClick={() => onPanel('journal')}><BookOpen size={17} /></button><button aria-label="Open map" title="Map · M" onClick={() => onPanel('map')}><Map size={17} /></button><button aria-label="Open pause menu" title="Pause menu · Escape" onClick={() => onPanel('menu')}><Menu size={17} /></button></div>
    </div>

    <button className="ow-quest-card" onClick={() => onPanel('journal')} aria-label={`Current objective: ${quest}`}><span className="ow-quest-star">✦</span><div><small>THE NEXT DEBT</small><span>{quest}</span></div><ChevronRight size={14} /></button>

    {world.nearby && !world.paused && <button className="ow-interact-prompt" onClick={onInteract}><kbd>E</kbd><span>{world.nearby.type === 'npc' ? 'Speak to ' : ''}{world.nearby.name}</span></button>}
    {world.fishing && <div className={`ow-fishing-notice ow-fishing-${world.fishing.phase}`}><span>⌁</span>{world.fishing.phase === 'bite' ? 'A bite! Use the rod again.' : world.fishing.phase === 'caught' ? 'One less thing left in the water.' : 'Waiting beneath the dead water…'}</div>}

    <div className="ow-hotbar-wrap"><div className="ow-selected-label">{selectedItem?.name || 'Empty hands'}</div><div className="ow-hotbar" aria-label="Hotbar">{Array.from({ length: 8 }, (_, index) => {
      const id = world.hotbar[index]; const item = ITEM_DEFS[id]; const count = world.inventory[id] || 0;
      return <button key={index} className={`ow-hotbar-slot ${world.selected === index ? 'ow-selected' : ''}`} aria-label={`Select slot ${index + 1}: ${item?.name || 'Empty'}`} aria-pressed={world.selected === index} title={item?.description || 'Empty slot'} onClick={() => onSelectSlot(index)}><kbd>{index + 1}</kbd>{id && <img src={itemIconDataUrl(id)} alt="" draggable={false} />}{count > 1 && <small>{count}</small>}{world.selected === index && <span className="ow-slot-marker">◆</span>}</button>;
    })}</div><span className="ow-control-hint"><kbd>WASD</kbd> move <span>·</span><kbd>Shift</kbd> run <span>·</span><kbd>E</kbd> interact <span>·</span> click to use</span></div>

    <div className="ow-notices" aria-live="polite">{notices.slice(-3).map(notice => <div key={notice.id} className={`ow-notice ow-notice-${notice.kind || 'info'}`}><span>{notice.kind === 'warning' ? '◇' : notice.kind === 'success' ? '✦' : '·'}</span>{notice.text}</div>)}</div>
    {world.areaNotice && !world.paused && !world.sequence && world.sceneId === data.overworld.id && <div className="ow-area-notice">{world.areaNotice}</div>}
    <div className="ow-touch-controls"><TouchJoystick onDirection={onTouchDirection} /><div className="ow-touch-buttons"><button className="ow-touch-interact" aria-label="Interact" onClick={onInteract}>E<span>{world.nearby?.type === 'npc' ? 'Speak' : 'Inspect'}</span></button><button className="ow-touch-action" aria-label={`Use selected item: ${selectedItem?.name || 'Empty hands'}`} onClick={onAction}><img src={itemIconDataUrl(world.hotbar[world.selected] || 'walking_cane')} alt="" />Use</button></div></div>
    <div className="ow-save-indicator"><i />{world.saving ? 'Saving' : 'Record retained'}</div>
  </div>;
}
