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

const tileColors: Record<TileKind, string> = {
  grass: '#688759', darkGrass: '#476442', dirt: '#8d7655', path: '#ad9670',
  water: '#538b8b', deepWater: '#386b79', sand: '#b9a878', stone: '#7e8274',
  woodFloor: '#917454', stoneFloor: '#90917e', void: '#233b31', tilled: '#795239',
};
const terrainMaps = new WeakMap<WorldData, HTMLCanvasElement>();

function terrainMap(data: WorldData) {
  const existing = terrainMaps.get(data);
  if (existing) return existing;
  const map = document.createElement('canvas');
  map.width = data.overworld.width * 2;
  map.height = data.overworld.height * 2;
  const context = map.getContext('2d');
  if (context) {
    const scene = data.overworld;
    scene.tiles.forEach((tile, index) => {
      context.fillStyle = tileColors[tile] || tileColors.grass;
      context.fillRect((index % scene.width) * 2, Math.floor(index / scene.width) * 2, 2, 2);
    });
    for (const object of scene.objects) {
      if (object.kind === 'building') {
        context.fillStyle = '#d1b889';
        context.fillRect(object.x * 2, object.y * 2, (object.width || 2) * 2, (object.height || 2) * 2);
      }
    }
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
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(map, 0, 0, width, height);
    ctx.fillStyle = '#172b26ba';
    ctx.fillRect(0, 0, width, height);
    for (const key of world.explored) {
      const [x, y] = key.split(':').map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const sx = x * 8 * 2, sy = y * 8 * 2;
      const sw = Math.min(16, map.width - sx), sh = Math.min(16, map.height - sy);
      if (sw <= 0 || sh <= 0) continue;
      ctx.drawImage(map, sx, sy, sw, sh, x * 8 * scaleX, y * 8 * scaleY, sw / 2 * scaleX, sh / 2 * scaleY);
    }
    for (const region of data.regions) {
      const discovered = world.discovered.includes(region.id) || region.id === world.region.id;
      const px = region.landmark.x * scaleX;
      const py = region.landmark.y * scaleY;
      ctx.fillStyle = discovered ? '#e5d3a0' : '#a69b77';
      ctx.fillRect(Math.round(px) - (large ? 3 : 1), Math.round(py) - (large ? 3 : 1), large ? 6 : 3, large ? 6 : 3);
      if (large) {
        ctx.font = '11px "DM Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const label = discovered ? region.name.replace('The ', '').replace('Library of Time Well Spent', 'Library').replace('Entrance to Infinite Time', 'Infinite Time') : '?';
        const labelX = Math.max(65, Math.min(width - 65, px));
        const labelY = py > height - 25 ? py - 20 : py + 7;
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = '#172921dd';
        ctx.fillRect(labelX - textWidth / 2 - 4, labelY - 1, textWidth + 8, 15);
        ctx.fillStyle = discovered ? '#f1e5bd' : '#b0b19a';
        ctx.fillText(label, labelX, labelY);
      }
    }
    if (world.waypoint) {
      const waypoint = world.waypointScene && world.waypointScene !== data.overworld.id ? data.interiors[world.waypointScene]?.exit?.position || world.waypoint : world.waypoint;
      const x = waypoint.x * scaleX;
      const y = waypoint.y * scaleY;
      ctx.strokeStyle = '#efd881';
      ctx.lineWidth = large ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.stroke();
      ctx.strokeRect(x - 3, y - 3, 6, 6);
    }
    const player = world.sceneId === data.overworld.id ? world.player : world.region.landmark;
    const px = player.x * scaleX, py = player.y * scaleY;
    ctx.fillStyle = '#193e30';
    ctx.beginPath(); ctx.arc(px, py, large ? 6 : 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff9d7';
    ctx.beginPath(); ctx.arc(px, py, large ? 3.5 : 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff0b599';
    ctx.strokeRect(.5, .5, width - 1, height - 1);
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

    <button className="ow-quest-card" onClick={() => onPanel('journal')} aria-label={`Current objective: ${quest}`}><span className="ow-quest-star">✦</span><div><small>YOUR NEXT SMALL BEGINNING</small><span>{quest}</span></div><ChevronRight size={14} /></button>

    {world.nearby && !world.paused && <button className="ow-interact-prompt" onClick={onInteract}><kbd>E</kbd><span>{world.nearby.type === 'npc' ? 'Speak to ' : ''}{world.nearby.name}</span></button>}
    {world.fishing && <div className={`ow-fishing-notice ow-fishing-${world.fishing.phase}`}><span>⌁</span>{world.fishing.phase === 'bite' ? 'A bite! Use the rod again.' : world.fishing.phase === 'caught' ? 'A small, appropriate catch.' : 'Waiting for a willing fish…'}</div>}

    <div className="ow-hotbar-wrap"><div className="ow-selected-label">{selectedItem?.name || 'Empty hands'}</div><div className="ow-hotbar" aria-label="Hotbar">{Array.from({ length: 8 }, (_, index) => {
      const id = world.hotbar[index]; const item = ITEM_DEFS[id]; const count = world.inventory[id] || 0;
      return <button key={index} className={`ow-hotbar-slot ${world.selected === index ? 'ow-selected' : ''}`} aria-label={`Select slot ${index + 1}: ${item?.name || 'Empty'}`} aria-pressed={world.selected === index} title={item?.description || 'Empty slot'} onClick={() => onSelectSlot(index)}><kbd>{index + 1}</kbd>{id && <img src={itemIconDataUrl(id)} alt="" draggable={false} />}{count > 1 && <small>{count}</small>}{world.selected === index && <span className="ow-slot-marker">◆</span>}</button>;
    })}</div><span className="ow-control-hint"><kbd>WASD</kbd> move <span>·</span><kbd>Shift</kbd> run <span>·</span><kbd>E</kbd> interact <span>·</span> click to use</span></div>

    <div className="ow-notices" aria-live="polite">{notices.slice(-3).map(notice => <div key={notice.id} className={`ow-notice ow-notice-${notice.kind || 'info'}`}><span>{notice.kind === 'warning' ? '◇' : notice.kind === 'success' ? '✦' : '·'}</span>{notice.text}</div>)}</div>
    {world.areaNotice && <div className="ow-area-notice">{world.areaNotice}</div>}
    <div className="ow-touch-controls"><TouchJoystick onDirection={onTouchDirection} /><div className="ow-touch-buttons"><button className="ow-touch-interact" aria-label="Interact" onClick={onInteract}>E<span>Speak</span></button><button className="ow-touch-action" aria-label="Use selected item" onClick={onAction}><span>✦</span>Use</button></div></div>
    <div className="ow-save-indicator"><i />{world.saving ? 'Saving' : 'Journey kept'}</div>
  </div>;
}
