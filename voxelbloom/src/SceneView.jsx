import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, RotateCcw, RotateCw, Copy, Trash2, Download, ZoomIn, ZoomOut, Move, Box, Pencil, Grid2X2, Maximize2 } from 'lucide-react';
import { drawStack } from './lib/sprites';
import './SceneView.css';

const makeId = () => `object-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const STORAGE_KEY = 'voxelbloom-scene';

function makeInitialScene(sprites) {
  if (!sprites.length) return [];
  const byKind = (kind, fallback) => sprites.find(s => `${s.id} ${s.name}`.toLowerCase().includes(kind)) || sprites[fallback] || sprites[0];
  const mushroom = byKind('mushroom', 0);
  const tree = byKind('tree', 1);
  const rock = byKind('rock', 4);
  const crystal = byKind('crystal', 5);
  return [
    { spriteId: tree.id, u: .25, v: .29, rotation: 45, scale: 1.12 },
    { spriteId: tree.id, u: .23, v: .63, rotation: 45, scale: .90 },
    { spriteId: tree.id, u: .74, v: .28, rotation: 45, scale: 1.02 },
    { spriteId: mushroom.id, u: .57, v: .51, rotation: 45, scale: 1.06 },
    { spriteId: mushroom.id, u: .36, v: .80, rotation: 45, scale: .70 },
    { spriteId: crystal.id, u: .78, v: .61, rotation: 45, scale: .72 },
    { spriteId: rock.id, u: .67, v: .82, rotation: 45, scale: .73 },
  ].map(o => ({ ...o, id: makeId() }));
}

function loadScene(sprites) {
  for (const key of [STORAGE_KEY, 'stackly-scene']) {
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (Array.isArray(saved) && saved.every(o => typeof o.id === 'string' && typeof o.spriteId === 'string' && Number.isFinite(o.u) && Number.isFinite(o.v) && Number.isFinite(o.rotation) && Number.isFinite(o.scale))) {
        const ids = new Set(sprites.map(sprite => sprite.id));
        return saved.filter(o => ids.has(o.spriteId)).map(o => ({ ...o, u: clamp(o.u, .03, .97), v: clamp(o.v, .03, .97), scale: clamp(o.scale, .4, 1.6) }));
      }
    } catch { /* A fresh scene is available if browser storage is unavailable. */ }
  }
  return makeInitialScene(sprites);
}

function pointOnFloor(u, v, width, height) {
  return { x: width * (.5 + (u - v) * .40), y: height * (.24 + (u + v) * .25) };
}

function floorFromPoint(x, y, width, height) {
  const difference = (x / width - .5) / .40;
  const sum = (y / height - .24) / .25;
  return { u: (sum + difference) / 2, v: (sum - difference) / 2 };
}

function drawFloor(ctx, width, height, grid) {
  const a = pointOnFloor(0, 0, width, height);
  const b = pointOnFloor(1, 0, width, height);
  const c = pointOnFloor(1, 1, width, height);
  const d = pointOnFloor(0, 1, width, height);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
  ctx.fillStyle = '#f5f3fa'; ctx.fill();
  ctx.strokeStyle = '#e5e1ee'; ctx.lineWidth = 1; ctx.stroke();
  if (!grid) return;
  ctx.strokeStyle = '#e7e3ee';
  for (let i = 1; i < 18; i++) {
    const q = i / 18;
    const firstA = pointOnFloor(q, 0, width, height);
    const firstB = pointOnFloor(q, 1, width, height);
    const secondA = pointOnFloor(0, q, width, height);
    const secondB = pointOnFloor(1, q, width, height);
    ctx.beginPath();
    ctx.moveTo(firstA.x, firstA.y); ctx.lineTo(firstB.x, firstB.y);
    ctx.moveTo(secondA.x, secondA.y); ctx.lineTo(secondB.x, secondB.y);
    ctx.stroke();
  }
}

// Crop transparent padding so every object has a reliable floor anchor.
function renderSprite(sprite, rotation) {
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 400;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const metrics = drawStack(ctx, sprite, { width: 320, height: 400, rotation, tilt: 60, spacing: 5, zoom: 1, grid: false, shadow: false });
  const pixels = ctx.getImageData(0, 0, 320, 400).data;
  let left = 320, right = 0, top = 400, bottom = 0;
  for (let y = 0; y < 400; y++) {
    for (let x = 0; x < 320; x++) {
      if (pixels[(y * 320 + x) * 4 + 3] > 5) {
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
  }
  if (left > right) return { canvas, x: 0, y: 0, width: 320, height: 400, anchorX: 160, anchorY: 320 };
  return { canvas, x: left, y: top, width: right - left + 1, height: bottom - top + 1, anchorX: (metrics?.floor.x ?? (left + right) / 2) - left, anchorY: (metrics?.floor.y ?? bottom) - top };
}

function ObjectPreview({ sprite, rotation }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!sprite || !ref.current) return;
    const ctx = ref.current.getContext('2d');
    ctx.clearRect(0, 0, 220, 170);
    drawStack(ctx, sprite, { width: 220, height: 170, rotation, tilt: 60, spacing: 4, zoom: .8, grid: false, background: null });
  }, [sprite, rotation]);
  return <canvas ref={ref} width="220" height="170" aria-label={`${sprite.name} preview`} />;
}

export function SceneView({ sprites = [], selectedLibrarySprite, onNotify, onEditSprite }) {
  const [objects, setObjects] = useState(() => loadScene(sprites));
  const [selectedId, setSelectedId] = useState(() => objects[3]?.id || objects[0]?.id || null);
  const [hoverId, setHoverId] = useState(null);
  const [viewZoom, setViewZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [size, setSize] = useState({ width: 900, height: 620 });
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const dragRef = useRef(null);
  const hitboxes = useRef([]);
  const imageCache = useRef(new Map());
  const spriteMap = useMemo(() => new Map(sprites.map(sprite => [sprite.id, sprite])), [sprites]);
  const selected = objects.find(o => o.id === selectedId);
  const selectedSprite = selected && spriteMap.get(selected.spriteId);
  const libraryChoice = selectedLibrarySprite || sprites[0];
  const notify = useCallback((message) => onNotify?.(message), [onNotify]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(objects)); } catch { /* Scene stays usable in private browsing. */ }
  }, [objects]);

  useEffect(() => {
    imageCache.current.clear();
    setObjects(current => current.some(object => !spriteMap.has(object.spriteId)) ? current.filter(object => spriteMap.has(object.spriteId)) : current);
  }, [sprites, spriteMap]);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: Math.max(320, entry.contentRect.width), height: Math.max(380, entry.contentRect.height) });
    });
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  const getImage = useCallback((sprite, rotation) => {
    const key = `${sprite.id}-${rotation}`;
    if (!imageCache.current.has(key)) imageCache.current.set(key, renderSprite(sprite, rotation));
    return imageCache.current.get(key);
  }, []);

  const paintScene = useCallback((ctx, width, height, withSelection = true) => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#faf9fc'; ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height * .45);
    ctx.scale(viewZoom, viewZoom);
    ctx.translate(-width / 2, -height * .45);
    drawFloor(ctx, width, height, showGrid);
    const boxes = [];
    const sortedObjects = [...objects].sort((a, b) => a.u + a.v - b.u - b.v);
    sortedObjects.forEach(object => {
      const sprite = spriteMap.get(object.spriteId);
      if (!sprite) return;
      const position = pointOnFloor(object.u, object.v, width, height);
      const stack = getImage(sprite, object.rotation);
      const drawWidth = clamp(width * .145, 90, 152) * object.scale;
      const drawHeight = drawWidth * stack.height / stack.width;
      const drawX = position.x - drawWidth * stack.anchorX / stack.width;
      const drawY = position.y - drawWidth * stack.anchorY / stack.width;
      ctx.save();
      ctx.fillStyle = 'rgba(48, 37, 66, .10)';
      ctx.beginPath(); ctx.ellipse(position.x, position.y - 3, drawWidth * .38, drawWidth * .13, 0, 0, Math.PI * 2); ctx.fill();
      if (withSelection && (object.id === selectedId || object.id === hoverId)) {
        ctx.strokeStyle = object.id === selectedId ? '#9064d3' : '#b5a0d3';
        ctx.fillStyle = 'rgba(145, 100, 211, .08)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(position.x, position.y, drawWidth * .51, drawWidth * .19, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(stack.canvas, stack.x, stack.y, stack.width, stack.height, drawX, drawY, drawWidth, drawHeight);
      ctx.restore();
      boxes.push({ id: object.id, x: drawX, y: drawY, width: drawWidth, height: drawHeight, position });
    });
    ctx.restore();
    if (withSelection) hitboxes.current = boxes;
  }, [objects, selectedId, hoverId, spriteMap, viewZoom, showGrid, getImage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * ratio);
    canvas.height = Math.round(size.height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    paintScene(ctx, size.width, size.height);
  }, [size, paintScene]);

  const updateSelected = useCallback((patch) => {
    setObjects(current => current.map(o => o.id === selectedId ? { ...o, ...patch } : o));
  }, [selectedId]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setObjects(current => current.filter(o => o.id !== selectedId));
    setSelectedId(null);
    notify('Object removed from scene');
  }, [selectedId, notify]);

  useEffect(() => {
    const handleKey = event => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable) return;
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected(); }
      if (event.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [deleteSelected]);

  const localPoint = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) * size.width / rect.width;
    const y = (event.clientY - rect.top) * size.height / rect.height;
    return { x: (x - size.width / 2) / viewZoom + size.width / 2, y: (y - size.height * .45) / viewZoom + size.height * .45 };
  };

  const objectAtPoint = point => [...hitboxes.current].reverse().find(box => point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height);

  const pointerDown = event => {
    const point = localPoint(event);
    const hit = objectAtPoint(point);
    if (!hit) { setSelectedId(null); return; }
    const object = objects.find(o => o.id === hit.id);
    const floor = floorFromPoint(point.x, point.y, size.width, size.height);
    setSelectedId(hit.id);
    dragRef.current = { id: hit.id, offsetU: floor.u - object.u, offsetV: floor.v - object.v };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const pointerMove = event => {
    const point = localPoint(event);
    if (dragRef.current) {
      const floor = floorFromPoint(point.x, point.y, size.width, size.height);
      const drag = dragRef.current;
      setObjects(current => current.map(object => object.id === drag.id ? { ...object, u: clamp(floor.u - drag.offsetU, .03, .97), v: clamp(floor.v - drag.offsetV, .03, .97) } : object));
    } else setHoverId(objectAtPoint(point)?.id || null);
  };

  const addObject = () => {
    if (!libraryChoice) return;
    const object = { id: makeId(), spriteId: libraryChoice.id, u: .5 + Math.random() * .18, v: .55 + Math.random() * .15, rotation: 45, scale: 1 };
    setObjects(current => [...current, object]);
    setSelectedId(object.id);
    notify(`${libraryChoice.name} added to scene`);
  };

  const duplicateObject = () => {
    if (!selected) return;
    const object = { ...selected, id: makeId(), u: clamp(selected.u + .1, .03, .97), v: clamp(selected.v + .07, .03, .97) };
    setObjects(current => [...current, object]); setSelectedId(object.id);
    notify('Object duplicated');
  };

  const exportScene = () => {
    const canvas = document.createElement('canvas');
    canvas.width = size.width * 2; canvas.height = size.height * 2;
    const ctx = canvas.getContext('2d'); ctx.scale(2, 2);
    paintScene(ctx, size.width, size.height, false);
    const link = document.createElement('a');
    link.download = 'voxelbloom-scene.png'; link.href = canvas.toDataURL('image/png'); link.click();
    notify('Scene exported as PNG');
  };

  return <div className="sc-workspace">
    <section className="sc-main" aria-label="Scene arrangement">
      <div className="sc-toolbar">
        <div className="sc-toolbar-heading"><Box size={17} /><span>Scene canvas</span><span className="sc-object-count">{objects.length} objects</span></div>
        <div className="sc-toolbar-actions">
          <button className={`sc-icon-button ${showGrid ? 'is-active' : ''}`} title="Toggle floor grid" aria-label="Toggle floor grid" aria-pressed={showGrid} onClick={() => setShowGrid(value => !value)}><Grid2X2 size={17} /></button>
          <span className="sc-toolbar-divider" />
          <button className="sc-button sc-add" disabled={!libraryChoice} onClick={addObject} title={libraryChoice ? `Add ${libraryChoice.name} to scene` : undefined}><Plus size={16} />Add to scene</button>
        </div>
      </div>
      <div className="sc-canvas-wrap" ref={wrapperRef}>
        <canvas ref={canvasRef} className={`sc-canvas ${hoverId ? 'sc-has-hover' : ''}`} aria-label="Isometric scene. Drag an object to move it. Double-click to edit its sprite." onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} onPointerLeave={() => { if (!dragRef.current) setHoverId(null); }} onDoubleClick={event => { const hit = objectAtPoint(localPoint(event)); const object = objects.find(o => o.id === hit?.id); if (object) onEditSprite?.(spriteMap.get(object.spriteId)); }} />
        <div className="sc-scene-label"><span className="sc-label-dot" /> Untitled scene <span className="sc-saved-label">Saved locally</span></div>
        {objects.length === 0 && <div className="sc-empty-state"><Box size={32} /><strong>A little world starts here</strong><p>Select a sprite from your library and add it to the scene.</p><button className="sc-button sc-add" onClick={addObject}><Plus size={16} />Add your first sprite</button></div>}
        <div className="sc-canvas-bottom"><span className="sc-drag-hint"><Move size={14} />Drag objects to arrange your scene</span><div className="sc-zoom-controls"><button aria-label="Zoom out" title="Zoom out" onClick={() => setViewZoom(z => clamp(z - .1, .5, 1.8))}><ZoomOut size={15} /></button><span>{Math.round(viewZoom * 100)}%</span><button aria-label="Zoom in" title="Zoom in" onClick={() => setViewZoom(z => clamp(z + .1, .5, 1.8))}><ZoomIn size={15} /></button><span className="sc-zoom-separator" /><button aria-label="Reset scene view" title="Reset scene view" onClick={() => setViewZoom(1)}><Maximize2 size={14} /></button></div></div>
      </div>
      <div className="sc-footer"><span><span className="sc-shortcut">Double-click</span> to edit a sprite</span><button onClick={exportScene}><Download size={14} />Export scene</button></div>
    </section>
    <aside className="sc-inspector" aria-label="Object properties">
      <div className="sc-inspector-heading"><span>Object properties</span><Box size={16} /></div>
      {selected && selectedSprite ? <>
        <div className="sc-object-preview"><ObjectPreview sprite={selectedSprite} rotation={selected.rotation} /><span className="sc-preview-badge">SPRITE STACK</span></div>
        <div className="sc-inspector-body">
          <div className="sc-selected-name"><h3>{selectedSprite.name}</h3><button className="sc-icon-button" aria-label={`Edit ${selectedSprite.name}`} title="Edit sprite" onClick={() => onEditSprite?.(selectedSprite)}><Pencil size={15} /></button></div>
          <p className="sc-selected-meta">{selectedSprite.width || 24} × {selectedSprite.height || 24} pixels<span>·</span>{selectedSprite.layers?.length || 0} layers</p>
          <div className="sc-property"><div className="sc-property-label"><label htmlFor="scene-rotation">Rotation</label><output>{Math.round(selected.rotation)}°</output></div><input id="scene-rotation" aria-label="Object rotation" type="range" min="0" max="360" step="5" value={selected.rotation} onChange={event => updateSelected({ rotation: Number(event.target.value) })} /><div className="sc-rotate-actions"><button onClick={() => updateSelected({ rotation: (selected.rotation + 315) % 360 })}><RotateCcw size={14} />45°</button><button onClick={() => updateSelected({ rotation: (selected.rotation + 45) % 360 })}><RotateCw size={14} />45°</button></div></div>
          <div className="sc-property"><div className="sc-property-label"><label htmlFor="scene-scale">Scale</label><output>{selected.scale.toFixed(2)}×</output></div><input id="scene-scale" aria-label="Object scale" type="range" min="0.4" max="1.6" step="0.05" value={selected.scale} onChange={event => updateSelected({ scale: Number(event.target.value) })} /><div className="sc-range-labels"><span>Small</span><span>Large</span></div></div>
          <div className="sc-property sc-position-property"><div className="sc-property-label"><span>Position</span><span className="sc-property-hint">On the floor</span></div><div className="sc-coordinate-row"><label>X<input aria-label="Object X position" type="number" min="3" max="97" value={Math.round(selected.u * 100)} onChange={event => updateSelected({ u: clamp(Number(event.target.value) / 100, .03, .97) })} /></label><label>Y<input aria-label="Object Y position" type="number" min="3" max="97" value={Math.round(selected.v * 100)} onChange={event => updateSelected({ v: clamp(Number(event.target.value) / 100, .03, .97) })} /></label></div></div>
          <div className="sc-object-actions"><button className="sc-button" onClick={duplicateObject}><Copy size={15} />Duplicate</button><button className="sc-delete-button" aria-label="Delete selected object" title="Delete object" onClick={deleteSelected}><Trash2 size={16} /></button></div>
          <div className="sc-inspector-note"><Move size={15} /><p>Make it your own.<br /><span>Drag, rotate, and build a little world.</span></p></div>
        </div>
      </> : <div className="sc-inspector-empty"><Box size={30} /><h3>Select an object</h3><p>Click a sprite in your scene to change its rotation, scale, and position.</p></div>}
    </aside>
  </div>;
}

export default SceneView;
