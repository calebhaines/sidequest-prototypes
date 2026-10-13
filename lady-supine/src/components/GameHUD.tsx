import { useEffect, useRef, useState } from 'react';
import { Backpack, BookOpen, ChevronRight, Clock3, Heart, Map, Menu, Moon, Sun, Zap } from 'lucide-react';
import type { GameState } from '../data/game';
import { formatTime } from '../data/game';
import { ITEM_DEFS } from '../openworld/items';
import { actorPortraitDataUrl, itemIconDataUrl } from '../openworld/sprites';
import type { TileKind, Vec, WorldData, WorldSnapshot } from '../openworld/types';

export type GameNotice = { id: number | string; text: string; kind?: 'info' | 'success' | 'warning' };
export type GameHUDProps = {
  story: GameState; world: WorldSnapshot; data: WorldData; quest: string;
  onPanel: (panel: string) => void; onSelectSlot: (index: number) => void;
  onInteract: () => void; onAction: () => void; onTouchDirection: (direction: Vec) => void;
  notices?: GameNotice[];
};

const terrainMaps = new WeakMap<WorldData, HTMLCanvasElement>();

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

// Trace complete banks and roads as ink contours; the map never samples a tile grid.
function washContours(context: CanvasRenderingContext2D, data: WorldData, kinds: TileKind[], fill: string, outline?: string) {
  const scene = data.overworld;
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
  context.save(); context.scale(3, 3);
  context.beginPath();
  for (const loop of points) {
    const first = loop[0], previous = loop[loop.length - 1];
    context.moveTo((first.x + previous.x) / 2, (first.y + previous.y) / 2);
    for (let i = 0; i < loop.length; i++) {
      const point = loop[i], next = loop[(i + 1) % loop.length];
      context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
    }
    context.closePath();
  }
  context.fillStyle = fill; context.fill('evenodd');
  if (outline) { context.strokeStyle = outline; context.lineWidth = .24; context.lineJoin = 'round'; context.stroke(); }
  context.restore();
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
    context.fillStyle = '#b4b8a5'; context.fillRect(0, 0, map.width, map.height);
    // Woodland is a field of curved marker washes, not individual tile squares.
    context.save(); context.scale(3, 3);
    for (const region of data.regions) {
      if (!['forest', 'fields', 'shanty', 'pit'].includes(region.id)) continue;
      context.fillStyle = region.id === 'forest' ? '#8e97877d' : '#9c9f8b50';
      context.beginPath(); context.ellipse(region.x + region.width * .54, region.y + region.height * .52, region.width * .42, region.height * .38, -.17, 0, Math.PI * 2); context.fill();
      context.strokeStyle = '#59674c39'; context.lineWidth = .27;
      for (let i = 0; i < 9; i++) {
        const x = region.x + region.width * (.2 + i * .065), y = region.y + region.height * (.3 + Math.sin(i * 1.1) * .14);
        context.beginPath(); context.moveTo(x, y + 3); context.bezierCurveTo(x - 3, y - 3, x + 2, y - 6, x + 3, y + 2); context.stroke();
      }
    }
    context.restore();
    washContours(context, data, ['dirt', 'tilled'], '#a59681');
    washContours(context, data, ['sand'], '#c1b496');
    washContours(context, data, ['water', 'deepWater'], '#809795', '#536d68');
    washContours(context, data, ['deepWater'], '#6d8986');
    washContours(context, data, ['stone', 'stoneFloor'], '#9f9f94', '#62685b77');
    washContours(context, data, ['path', 'woodFloor'], '#c6b9a3', '#6c705b55');
    // Sparse hatching makes the plan feel drawn on a discarded work order.
    context.save(); context.strokeStyle = '#4d574918'; context.lineWidth = .6;
    for (let index = 0; index < 230; index++) {
      const x = ((index * 719) % map.width), y = ((index * 419) % map.height);
      context.beginPath(); context.moveTo(x, y); context.quadraticCurveTo(x + 5, y - 1, x + 11, y + 4); context.stroke();
    }
    context.restore();
    for (const object of scene.objects) {
      if (object.kind !== 'building') continue;
      const x = object.x * 3, y = object.y * 3, w = (object.width || 2) * 3, h = (object.height || 2) * 3;
      context.beginPath(); context.moveTo(x - .3, y + .4); context.lineTo(x + w, y); context.lineTo(x + w - .5, y + h); context.lineTo(x + .2, y + h - .7); context.closePath();
      context.fillStyle = '#8f7874'; context.fill(); context.strokeStyle = '#4e5145'; context.lineWidth = .8; context.stroke();
      context.beginPath(); context.moveTo(x + w * .35, y); context.lineTo(x + w * .4, y + h); context.stroke();
    }
    // A barely visible paper wash has no visible pixel texture.
    const stain = context.createRadialGradient(map.width * .7, map.height * .25, 0, map.width * .7, map.height * .25, map.width * .8);
    stain.addColorStop(0, '#80656e00'); stain.addColorStop(1, '#6c605429');
    context.fillStyle = stain; context.fillRect(0, 0, map.width, map.height);
  }
  terrainMaps.set(data, map);
  return map;
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
    ctx.fillStyle = '#474b45b0';
    ctx.fillRect(0, 0, width, height);
    ctx.save(); ctx.beginPath();
    for (const key of world.explored) {
      const [x, y] = key.split(':').map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      ctx.moveTo((x * 8 + 4) * scaleX + scaleX * 6.2, (y * 8 + 4) * scaleY);
      ctx.ellipse((x * 8 + 4) * scaleX, (y * 8 + 4) * scaleY, scaleX * 6.2, scaleY * 6.2, 0, 0, Math.PI * 2);
    }
    ctx.clip(); ctx.drawImage(map, 0, 0, width, height); ctx.restore();
    for (const region of data.regions) {
      const discovered = world.discovered.includes(region.id) || region.id === world.region.id;
      const px = region.landmark.x * scaleX;
      const py = region.landmark.y * scaleY;
      ctx.strokeStyle = discovered ? '#424939' : '#8f9281';
      ctx.fillStyle = discovered ? '#bfa59e' : '#989c87';
      ctx.lineWidth = large ? 1.3 : .7;
      ctx.beginPath(); ctx.ellipse(px, py, large ? 4 : 1.7, large ? 3.5 : 1.5, .2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (large) {
        ctx.font = '13px "Kalam", cursive';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const label = discovered ? region.name.replace('The ', '').replace('Library of Time Well Spent', 'Library').replace('Entrance to Infinite Time', 'Infinite Time') : '?';
        const labelX = Math.max(65, Math.min(width - 65, px));
        const labelY = py > height - 25 ? py - 20 : py + 7;
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = '#c4c2b1db';
        ctx.fillRect(labelX - textWidth / 2 - 4, labelY - 1, textWidth + 8, 17);
        ctx.fillStyle = discovered ? '#293122' : '#535c49';
        ctx.fillText(label, labelX, labelY);
      }
    }
    if (world.waypoint) {
      const waypoint = world.waypointScene && world.waypointScene !== data.overworld.id ? data.interiors[world.waypointScene]?.exit?.position || world.waypoint : world.waypoint;
      const x = waypoint.x * scaleX;
      const y = waypoint.y * scaleY;
      ctx.strokeStyle = '#7a4755';
      ctx.lineWidth = large ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x + .4, y - .2, 5, 4.5, -.25, 0, Math.PI * 2); ctx.stroke();
    }
    const player = world.sceneId === data.overworld.id ? world.player : world.region.landmark;
    const px = player.x * scaleX, py = player.y * scaleY;
    ctx.fillStyle = '#c1b6a7';
    ctx.beginPath(); ctx.arc(px, py, large ? 6 : 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#39343c';
    ctx.beginPath(); ctx.arc(px, py, large ? 3.5 : 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#535b498c'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(1.2, 2); ctx.lineTo(width - 1, 1); ctx.lineTo(width - 2, height - 1); ctx.lineTo(1, height - 2); ctx.closePath(); ctx.stroke();
  }, [data, world.player.x, world.player.y, world.sceneId, world.discovered, world.explored, world.waypoint, world.waypointScene, world.region, large]);
  return <canvas ref={ref} width={large ? 900 : 192} height={large ? Math.round(900 * data.overworld.height / data.overworld.width) : Math.round(192 * data.overworld.height / data.overworld.width)} className={large ? 'ow-world-map-canvas' : 'ow-minimap-canvas'} aria-label={large ? 'Map of the Land of Limited Time' : 'Minimap'} onClick={event => {
    if (!onWaypoint) return;
    const bounds = event.currentTarget.getBoundingClientRect();
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
      <div className={`ow-borrowed-time ${story.time < 300 ? 'ow-time-low' : ''}`} title="Your allotted time. Reading and menus pause the world."><Clock3 size={19} /><div><small>BORROWED TIME</small><strong>{formatTime(story.time)}</strong></div><span className="ow-time-ornament">✧</span></div>
    </div>

    <div className="ow-region-banner"><span className="ow-region-decoration">✧</span><div><small>LAND OF LIMITED TIME</small><strong>{world.region.name}</strong></div><span className="ow-region-decoration">✧</span></div>

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
    <div className="ow-touch-controls"><TouchJoystick onDirection={onTouchDirection} /><div className="ow-touch-buttons"><button className="ow-touch-interact" aria-label="Interact" onClick={onInteract}>E<span>Speak</span></button><button className="ow-touch-action" aria-label="Use selected item" onClick={onAction}><span>✦</span>Use</button></div></div>
    <div className="ow-save-indicator"><i />{world.saving ? 'Saving' : 'Record retained'}</div>
  </div>;
}
