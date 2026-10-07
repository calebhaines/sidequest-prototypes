import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Blocks, Box, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Copy, Download, Eraser, Expand, Eye, EyeOff, FileJson, Folder, Grid2X2, GripVertical, Layers, Maximize, Minus, MousePointer2, PaintBucket, Pencil, Pipette, Play, Plus, Redo2, RotateCcw, Search, Settings2, Sparkles, Sprout, Trash2, Undo2, X } from 'lucide-react';
import { createSprite, drawLayer, drawStack, drawThumbnail, palette } from './lib/sprites.js';
import SceneView from './SceneView.jsx';

const PROJECT_KEY = 'voxelbloom-project';
const SCENE_KEY = 'voxelbloom-scene';

const initialKinds = ['mushroom', 'tree', 'cactus', 'chest', 'rock', 'crystal'];
const shortNames = ['Mushroom', 'Pine tree', 'Cactus', 'Treasure chest', 'Pebbles', 'Crystal'];
const tools = [{ id: 'pencil', name: 'Pencil', key: 'B', icon: Pencil }, { id: 'eraser', name: 'Eraser', key: 'E', icon: Eraser }, { id: 'fill', name: 'Fill', key: 'G', icon: PaintBucket }, { id: 'picker', name: 'Color picker', key: 'I', icon: Pipette }];
const clone = (v) => structuredClone(v);
const displayName = (s) => ({ 'Mushroom house': 'Mushroom', 'Desert cactus': 'Cactus', 'River rock': 'Pebbles', 'Amethyst crystal': 'Crystal' }[s.name] || s.name);
const validSprite = s => typeof s.id === 'string' && typeof s.name === 'string' && Number.isInteger(s.width) && s.width > 0 && s.width <= 128 && Number.isInteger(s.height) && s.height > 0 && s.height <= 128 && s.layers?.length && s.layers.every(l => Array.isArray(l.pixels) && l.pixels.length === s.width * s.height && l.pixels.every(p => p === null || /^#[0-9a-f]{6}$/i.test(p)));
function preferredLayer(s) {
  const preferred = Math.min(({ mushroom: 12, tree: 7, cactus: 9, chest: 6, rock: 4, crystal: 7 }[s.kind] ?? 12), s.layers.length - 1);
  if (s.layers[preferred].pixels.some(Boolean)) return preferred;
  return s.layers.reduce((best, l, i) => l.pixels.filter(Boolean).length > s.layers[best].pixels.filter(Boolean).length ? i : best, 0);
}
function storedScene() {
  for (const key of [SCENE_KEY, 'stackly-scene']) {
    try {
      const scene = JSON.parse(localStorage.getItem(key));
      if (Array.isArray(scene)) {
        if (key !== SCENE_KEY) { try { localStorage.setItem(SCENE_KEY, JSON.stringify(scene)); } catch {} }
        return scene;
      }
    } catch {}
  }
  return undefined;
}

function loadProject() {
  for (const key of [PROJECT_KEY, 'stackly-project']) {
    try {
      const stored = JSON.parse(localStorage.getItem(key));
      if (stored?.sprites?.length && stored.sprites.every(validSprite)) {
        if (key !== PROJECT_KEY) { try { localStorage.setItem(PROJECT_KEY, JSON.stringify(stored)); } catch {} }
        return stored;
      }
    } catch {}
  }
  return { name: 'Cozy forest', sprites: initialKinds.map(createSprite) };
}

function CanvasArt({ sprite, layer, type = 'thumbnail', className = '', rotation = 45, tilt = 60, spacing = 5, zoom = 1, grid = false, canvasRef, onPointerDown, onPointerMove, onPointerUp, onPointerLeave }) {
  const localRef = useRef(null);
  const ref = canvasRef || localRef;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !sprite) return;
    const render = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const ratio = type === 'layer' ? 1 : window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * ratio));
      const height = Math.max(1, Math.round(rect.height * ratio));
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      if (type === 'layer') drawLayer(ctx, sprite, layer, { width, height, grid });
      else if (type === 'stack') drawStack(ctx, sprite, { width, height, rotation, tilt, spacing, zoom: zoom * 1.12, grid, padding: 16 * ratio });
      else drawThumbnail(ctx, sprite, width, height);
    };
    render();
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [sprite, layer, type, rotation, tilt, spacing, zoom, grid, ref]);
  return <canvas ref={ref} className={className} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerLeave} aria-label={type === 'layer' ? `Pixel canvas for layer ${layer + 1}` : `${sprite?.name} stacked pixel art`} />;
}

function IconButton({ icon: Icon, label, className = '', ...props }) {
  return <button className={`icon-button ${className}`} title={label} aria-label={label} {...props}><Icon size={17} strokeWidth={1.7} /></button>;
}

function Switch({ checked, onChange, label }) {
  return <button type="button" className={`switch ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span /></button>;
}

function Slider({ label, value, min, max, unit, onChange, icon: Icon }) {
  return <div className="setting-slider"><div className="slider-heading"><label>{Icon && <Icon size={14} />}{label}</label><span>{value}{unit}</span></div><input aria-label={label} type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} style={{ '--progress': `${(value - min) / (max - min) * 100}%` }} /></div>;
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function App() {
  const [loaded] = useState(loadProject);
  const [sprites, setSprites] = useState(loaded.sprites);
  const [projectName, setProjectName] = useState(loaded.name);
  const [saveStatus, setSaveStatus] = useState(true);
  const [selectedId, setSelectedId] = useState(loaded.sprites[0].id);
  const [layerIndex, setLayerIndex] = useState(preferredLayer(loaded.sprites[0]));
  const [mode, setMode] = useState('editor');
  const [sceneVersion, setSceneVersion] = useState(0);
  const [query, setQuery] = useState('');
  const [tool, setTool] = useState('pencil');
  const [color, setColor] = useState('#a576c4');
  const [hexDraft, setHexDraft] = useState('#A576C4');
  const [rotation, setRotation] = useState(45);
  const [tilt, setTilt] = useState(60);
  const [spacing, setSpacing] = useState(5);
  const [floorGrid, setFloorGrid] = useState(true);
  const [pixelGrid, setPixelGrid] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [canvasZoom, setCanvasZoom] = useState(100);
  const [cursor, setCursor] = useState(null);
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState(null);
  const [inputName, setInputName] = useState('');
  const [newTemplate, setNewTemplate] = useState('blank');
  const [projectMenu, setProjectMenu] = useState(false);
  const [exportType, setExportType] = useState('sheet');
  const [exportScale, setExportScale] = useState(4);
  const [exportBackground, setExportBackground] = useState(false);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [dragLayer, setDragLayer] = useState(null);
  const drawing = useRef(false);
  const strokePoint = useRef(null);
  const editorCanvas = useRef(null);
  const fileInput = useRef(null);
  const layersScroller = useRef(null);
  const sprite = sprites.find(s => s.id === selectedId) || sprites[0];
  const activeLayer = sprite.layers[Math.min(layerIndex, sprite.layers.length - 1)];
  const currentTool = tools.find(t => t.id === tool);
  const filteredSprites = sprites.filter(s => `${s.name} ${displayName(s)}`.toLowerCase().includes(query.toLowerCase()));

  const notify = useCallback(message => setToast(message), []);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 3300); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => setHexDraft(color.toUpperCase()), [color]);
  useEffect(() => {
    try { localStorage.setItem(PROJECT_KEY, JSON.stringify({ name: projectName, sprites })); setSaveStatus(true); }
    catch { setSaveStatus(false); }
  }, [sprites, projectName]);
  useEffect(() => {
    if (!sprites.some(s => s.id === selectedId)) { setSelectedId(sprites[0].id); setLayerIndex(preferredLayer(sprites[0])); }
    else setLayerIndex(i => Math.min(i, sprite.layers.length - 1));
  }, [sprite.layers.length, selectedId, sprites]);
  useEffect(() => {
    if (!autoRotate) return;
    const timer = setInterval(() => setRotation(v => (v + 1) % 360), 45);
    return () => clearInterval(timer);
  }, [autoRotate]);
  useEffect(() => {
    const selected = layersScroller.current?.querySelector('.layer-tile.selected');
    selected?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [layerIndex, sprite.id, mode]);

  const saveHistory = useCallback(() => { setHistory(h => [...h.slice(-39), clone(sprites)]); setFuture([]); }, [sprites]);
  const undo = useCallback(() => {
    if (!history.length) return;
    setFuture(f => [...f, clone(sprites)]);
    setSprites(history[history.length - 1]);
    setHistory(h => h.slice(0, -1));
  }, [history, sprites]);
  const redo = useCallback(() => {
    if (!future.length) return;
    setHistory(h => [...h, clone(sprites)]);
    setSprites(future[future.length - 1]);
    setFuture(f => f.slice(0, -1));
  }, [future, sprites]);

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { setModal(null); setProjectMenu(false); return; }
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === '?') { setModal('help'); return; }
      if (modal) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      const match = tools.find(t => t.key.toLowerCase() === e.key.toLowerCase());
      if (match) setTool(match.id);
      if (e.key === '[') setLayerIndex(i => Math.max(0, i - 1));
      if (e.key === ']') setLayerIndex(i => Math.min(sprite.layers.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, modal, sprite.layers.length]);

  function selectSprite(s) { setSelectedId(s.id); setLayerIndex(preferredLayer(s)); setCanvasZoom(100); }
  function updateSprite(transform) { setSprites(old => old.map(s => s.id === sprite.id ? transform(s) : s)); }
  function updateLayers(transform) { updateSprite(s => ({ ...s, layers: transform(s.layers) })); }

  function pointFromEvent(e) {
    const r = editorCanvas.current.getBoundingClientRect();
    return { x: Math.max(0, Math.min(sprite.width - 1, Math.floor((e.clientX - r.left) / r.width * sprite.width))), y: Math.max(0, Math.min(sprite.height - 1, Math.floor((e.clientY - r.top) / r.height * sprite.height))) };
  }
  function paint(point, previous = null) {
    updateLayers(layers => layers.map((l, i) => {
      if (i !== layerIndex) return l;
      const pixels = [...l.pixels];
      const targetColor = tool === 'eraser' ? null : color.toUpperCase();
      if (tool === 'fill') {
        const start = point.y * sprite.width + point.x;
        const oldColor = pixels[start]?.toLowerCase() ?? null;
        if (oldColor === (targetColor?.toLowerCase() ?? null)) return l;
        const queue = [start];
        const seen = new Set();
        while (queue.length) {
          const index = queue.pop();
          if (seen.has(index) || (pixels[index]?.toLowerCase() ?? null) !== oldColor) continue;
          seen.add(index); pixels[index] = targetColor;
          const x = index % sprite.width, y = Math.floor(index / sprite.width);
          if (x > 0) queue.push(index - 1);
          if (x < sprite.width - 1) queue.push(index + 1);
          if (y > 0) queue.push(index - sprite.width);
          if (y < sprite.height - 1) queue.push(index + sprite.width);
        }
      } else {
        const a = previous || point;
        const steps = Math.max(Math.abs(point.x - a.x), Math.abs(point.y - a.y), 1);
        for (let step = 0; step <= steps; step++) {
          const x = Math.round(a.x + (point.x - a.x) * step / steps);
          const y = Math.round(a.y + (point.y - a.y) * step / steps);
          pixels[y * sprite.width + x] = targetColor;
        }
      }
      return { ...l, pixels };
    }));
  }
  function pointerDown(e) {
    if (e.button !== 0) return;
    const p = pointFromEvent(e);
    setCursor(p);
    if (tool === 'picker') {
      const picked = activeLayer.pixels[p.y * sprite.width + p.x];
      if (picked) { setColor(picked); setTool('pencil'); notify(`Picked ${picked.toUpperCase()}`); }
      return;
    }
    saveHistory();
    editorCanvas.current.setPointerCapture(e.pointerId);
    drawing.current = true;
    strokePoint.current = p;
    paint(p);
  }
  function pointerMove(e) {
    const p = pointFromEvent(e);
    setCursor(p);
    if (drawing.current && tool !== 'fill') { paint(p, strokePoint.current); strokePoint.current = p; }
  }
  function pointerUp() { drawing.current = false; strokePoint.current = null; }

  function addLayer() {
    saveHistory();
    const next = layerIndex + 1;
    updateLayers(l => { const result = [...l]; result.splice(next, 0, { id: `layer-${Date.now()}`, name: `Layer ${l.length + 1}`, visible: true, pixels: Array(sprite.width * sprite.height).fill(null) }); return result; });
    setLayerIndex(next); notify('A fresh layer, ready for your pixels.');
  }
  function duplicateLayer() {
    saveHistory(); const next = layerIndex + 1;
    updateLayers(l => { const result = [...l]; result.splice(next, 0, { ...clone(l[layerIndex]), id: `layer-${Date.now()}`, name: `${l[layerIndex].name} copy` }); return result; });
    setLayerIndex(next); notify('Layer duplicated');
  }
  function deleteLayer() {
    if (sprite.layers.length === 1) { notify('Your sprite needs at least one layer.'); return; }
    saveHistory(); updateLayers(l => l.filter((_, i) => i !== layerIndex)); setLayerIndex(i => Math.max(0, i - 1)); notify('Layer removed');
  }
  function reorderLayer(destination) {
    if (dragLayer === null || dragLayer === destination) return;
    saveHistory(); updateLayers(l => { const result = [...l]; const [moved] = result.splice(dragLayer, 1); result.splice(destination, 0, moved); return result; }); setLayerIndex(destination); setDragLayer(null); notify('Layer order updated');
  }
  function createNewSprite(e) {
    e.preventDefault();
    const newSprite = createSprite(newTemplate === 'blank' ? 'mushroom' : newTemplate);
    newSprite.id = `sprite-${Date.now()}`;
    newSprite.name = inputName.trim() || 'Untitled sprite';
    if (newTemplate === 'blank') newSprite.layers = newSprite.layers.slice(0, 8).map((l, i) => ({ ...l, id: `layer-${Date.now()}-${i}`, name: `Layer ${i + 1}`, pixels: Array(576).fill(null) }));
    saveHistory(); setSprites(old => [...old, newSprite]); selectSprite(newSprite); setModal(null); setMode('editor'); notify('Your new sprite is ready.');
  }
  function downloadProject() { download(new Blob([JSON.stringify({ name: projectName, sprites, scene: storedScene() }, null, 2)], { type: 'application/json' }), `${projectName.toLowerCase().replaceAll(' ', '-')}.voxelbloom.json`); notify('Project downloaded'); }
  async function importProject(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data.sprites?.length || !data.sprites.every(validSprite)) throw new Error('Invalid project');
      saveHistory(); setSprites(data.sprites); setProjectName(typeof data.name === 'string' && data.name.trim() ? data.name : 'Imported project'); selectSprite(data.sprites[0]);
      try { if (Array.isArray(data.scene)) localStorage.setItem(SCENE_KEY, JSON.stringify(data.scene)); else { localStorage.removeItem(SCENE_KEY); localStorage.removeItem('stackly-scene'); } } catch {}
      setSceneVersion(v => v + 1); notify('Project imported. Welcome back!');
    } catch { notify('Please choose a valid Voxelbloom project file.'); }
    e.target.value = '';
  }
  function performExport() {
    if (exportType === 'project') { downloadProject(); setModal(null); return; }
    const canvas = document.createElement('canvas');
    if (exportType === 'sheet') {
      canvas.width = sprite.width * sprite.layers.length * exportScale; canvas.height = sprite.height * exportScale;
      const ctx = canvas.getContext('2d');
      if (exportBackground) { ctx.fillStyle = '#f5f3f8'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      sprite.layers.forEach((l, li) => l.pixels.forEach((p, pi) => { if (!p) return; ctx.fillStyle = p; ctx.fillRect((li * sprite.width + pi % sprite.width) * exportScale, Math.floor(pi / sprite.width) * exportScale, exportScale, exportScale); }));
    } else {
      canvas.width = 256 * exportScale; canvas.height = 256 * exportScale;
      drawStack(canvas.getContext('2d'), sprite, { width: canvas.width, height: canvas.height, rotation, tilt, spacing, grid: false, background: exportBackground ? '#f5f3f8' : undefined });
    }
    canvas.toBlob(blob => { if (blob) { download(blob, `${sprite.name.toLowerCase().replaceAll(' ', '-')}-${exportType === 'sheet' ? 'spritesheet' : 'render'}.png`); notify('Your pixels are ready to go.'); } });
    setModal(null);
  }

  return <div className="app-shell">
    <header className="app-header">
      <a href="#" className="brand" onClick={e => { e.preventDefault(); setMode('editor'); }} aria-label="Voxelbloom home"><span className="brand-mark"><Layers size={25} strokeWidth={1.75} /></span><span>voxelbloom<span className="brand-dot">.</span></span></a>
      <div className="header-divider" />
      <nav className="main-nav" aria-label="Workspace view"><button className={mode === 'editor' ? 'active' : ''} onClick={() => setMode('editor')}><Pencil size={16} />Editor</button><button className={mode === 'scene' ? 'active' : ''} onClick={() => setMode('scene')}><Blocks size={17} />Scene</button></nav>
      <div className="project-switcher"><button onClick={() => setProjectMenu(!projectMenu)} className="project-button"><Folder size={16} /><span>{projectName}</span><ChevronDown size={13} /></button>{projectMenu && <div className="project-popover"><button onClick={() => { setInputName(projectName); setModal('project-name'); setProjectMenu(false); }}><Pencil size={15} />Rename project</button><button onClick={() => { downloadProject(); setProjectMenu(false); }}><Download size={15} />Download project</button><button onClick={() => { fileInput.current.click(); setProjectMenu(false); }}><ArrowUpFromLine size={15} />Open project</button></div>}</div>
      <div className="header-actions"><span className={`saved-status ${saveStatus ? '' : 'unsaved'}`}><span />{saveStatus ? 'Saved locally' : 'Unsaved changes'}</span><IconButton icon={CircleHelp} label="Help and keyboard shortcuts" onClick={() => setModal('help')} /><button className="primary-button export-button" onClick={() => setModal('export')}><Download size={16} />Export<ChevronDown size={14} /></button><button className="avatar" title="Your local workspace" onClick={() => notify('Your workspace is saved in this browser. No account needed.')}><Sprout size={20} /></button></div>
    </header>

    <div className="app-body">
      <aside className="library-sidebar">
        <div className="sidebar-top"><div className="workspace-icon"><Folder size={18} /></div><div><strong>My workspace</strong><span>Your little creative corner</span></div></div>
        <div className="sidebar-section-heading"><span>YOUR SPRITES <b>{String(sprites.length).padStart(2, '0')}</b></span><IconButton icon={Plus} label="Create a new sprite" onClick={() => { setInputName(''); setNewTemplate('blank'); setModal('new'); }} /></div>
        <div className="search-field"><Search size={15} /><input aria-label="Search sprites" placeholder="Find a sprite..." value={query} onChange={e => setQuery(e.target.value)} />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={13} /></button>}</div>
        <div className="sprite-library">{filteredSprites.map((s, i) => <button key={s.id} className={`sprite-card ${sprite.id === s.id ? 'selected' : ''}`} onClick={() => selectSprite(s)}><div className="sprite-thumbnail"><CanvasArt sprite={s} />{sprite.id === s.id && <span className="sprite-selected-check"><Check size={11} strokeWidth={3} /></span>}</div><span>{displayName(s)}</span></button>)}{filteredSprites.length === 0 && <p className="no-results">No sprites found.<br />Try another name.</p>}</div>
        <button className="import-button" onClick={() => fileInput.current.click()}><ArrowUpFromLine size={14} />Import project<span>.json</span></button>
        <div className="palette-section"><div className="sidebar-section-heading"><span>COLOR PALETTE</span><span className="palette-name">Woodland</span></div><div className="palette-grid">{palette.map(c => <button key={c} style={{ background: c }} className={color.toUpperCase() === c.toUpperCase() ? 'selected' : ''} title={c} aria-label={`Choose color ${c}`} onClick={() => setColor(c)}>{color.toUpperCase() === c.toUpperCase() && <Check size={13} style={{ color: ['#F6E7CB', '#EEE5F4', '#F8F6F1', '#E9D5B8', '#F6D484'].includes(c.toUpperCase()) ? '#554268' : '#fff' }} />}</button>)}</div><div className="custom-color"><label title="Choose a custom color" className="color-input-label"><input type="color" value={color} onChange={e => setColor(e.target.value)} /><span style={{ background: color }} /></label><input aria-label="Hex color" value={hexDraft} maxLength={7} onChange={e => { const v = e.target.value; setHexDraft(v); if (/^#[0-9a-f]{6}$/i.test(v)) setColor(v); }} onBlur={() => setHexDraft(color.toUpperCase())} /><Pipette size={14} /></div></div>
        <div className="sidebar-spacer" />
        <div className="sidebar-tip"><span className="tip-spark"><Sparkles size={17} /></span><strong>Small pixels. Big possibilities.</strong><p>Build a little world,<br />one layer at a time.</p><span className="tip-orbit" /></div>
        <button className="sidebar-help" onClick={() => setModal('help')}><CircleHelp size={15} />A little help?<span>↗</span></button>
      </aside>

      <main className="workspace">
        <div className="workspace-heading"><div><div className="breadcrumb">WORKSPACE <ChevronRight size={10} /> {projectName.toUpperCase()}</div><div className="title-row"><h1>{mode === 'editor' ? sprite.name : 'Your little world'}</h1>{mode === 'editor' && <IconButton icon={Pencil} label="Rename sprite" onClick={() => { setInputName(sprite.name); setModal('rename'); }} />}</div><p>{mode === 'editor' ? <><span>{sprite.width} × {sprite.height} pixels</span><span className="meta-dot">·</span><span>{sprite.layers.length} layers</span><span className="meta-dot">·</span><span>Endless possibilities</span></> : 'A place for all your pixels to come together.'}</p></div><button className="secondary-button new-sprite-button" onClick={() => { setInputName(''); setNewTemplate('blank'); setModal('new'); }}><Plus size={15} />New sprite</button></div>

        {mode === 'scene' ? <SceneView key={sceneVersion} sprites={sprites} selectedLibrarySprite={sprite} onNotify={notify} onEditSprite={s => { selectSprite(s); setMode('editor'); }} /> : <div className="content-grid">
          <div className="editor-column">
            <section className="panel editor-panel">
              <div className="panel-heading"><div><Grid2X2 size={17} /><h2>Pixel editor</h2></div><span className="small-badge">2D CANVAS</span></div>
              <div className="editor-toolbar"><div className="drawing-tools">{tools.map(t => <IconButton key={t.id} icon={t.icon} label={`${t.name} (${t.key})`} className={tool === t.id ? 'active' : ''} onClick={() => setTool(t.id)} />)}<span className="toolbar-separator" /><IconButton icon={Undo2} label="Undo (⌘Z)" disabled={!history.length} onClick={undo} /><IconButton icon={Redo2} label="Redo (⌘⇧Z)" disabled={!future.length} onClick={redo} /></div><div className="toolbar-end"><label className="mobile-color-tool" title="Choose drawing color"><input aria-label="Drawing color" type="color" value={color} onChange={e => setColor(e.target.value)} /><span style={{background:color}} /></label><button className="current-layer-button" onClick={() => layersScroller.current?.querySelector('.selected')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })}><Layers size={14} />Layer {layerIndex + 1}<ChevronDown size={12} /></button><IconButton icon={Grid2X2} label="Toggle pixel grid" className={pixelGrid ? 'grid-enabled' : ''} onClick={() => setPixelGrid(!pixelGrid)} /></div></div>
              <div className={`canvas-area tool-${tool}`}><div className="canvas-corner-label">TOP VIEW</div><div className="editor-grid-container" style={{ '--canvas-zoom': canvasZoom / 100 }}><div className="ruler ruler-top"><span>0</span><span>8</span><span>16</span><span>{sprite.width}</span></div><div className="ruler ruler-left"><span>0</span><span>8</span><span>16</span><span>{sprite.height}</span></div><CanvasArt sprite={sprite} layer={layerIndex} type="layer" className="pixel-canvas" grid={pixelGrid} canvasRef={editorCanvas} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerLeave={() => { if (!drawing.current) setCursor(null); }} />{cursor && <span className="pixel-cursor" style={{ left: `${cursor.x / sprite.width * 100}%`, top: `${cursor.y / sprite.height * 100}%`, width: `${100 / sprite.width}%`, height: `${100 / sprite.height}%`, background: tool === 'eraser' ? 'rgba(255,255,255,.5)' : `${color}55` }} />}</div><div className="canvas-zoom"><IconButton icon={Minus} label="Zoom out" disabled={canvasZoom <= 50} onClick={() => setCanvasZoom(v => Math.max(50, v - 25))} /><span>{canvasZoom}%</span><IconButton icon={Plus} label="Zoom in" disabled={canvasZoom >= 150} onClick={() => setCanvasZoom(v => Math.min(150, v + 25))} /><span className="zoom-divider" /><IconButton icon={Maximize} label="Fit canvas" onClick={() => setCanvasZoom(100)} /></div></div>
              <div className="canvas-footer"><span><i style={{ background: color }} />{currentTool.name}<kbd>{currentTool.key}</kbd></span><span className="canvas-hint">{cursor ? `X: ${String(cursor.x).padStart(2, '0')}   Y: ${String(cursor.y).padStart(2, '0')}` : 'A little color goes a long way.'}</span><span>{sprite.width} × {sprite.height}</span></div>
            </section>

            <section className="panel layers-panel"><div className="panel-heading"><div><Layers size={17} /><h2>Layers</h2><span className="count-badge">{sprite.layers.length}</span></div><div className="layer-actions"><IconButton icon={activeLayer.visible ? Eye : EyeOff} label={activeLayer.visible ? 'Hide selected layer' : 'Show selected layer'} onClick={() => { saveHistory(); updateLayers(l => l.map((v, i) => i === layerIndex ? { ...v, visible: !v.visible } : v)); }} /><IconButton icon={Copy} label="Duplicate layer" onClick={duplicateLayer} /><IconButton icon={Trash2} label="Delete layer" onClick={deleteLayer} /><span className="toolbar-separator" /><button className="add-layer-button" onClick={addLayer}><Plus size={14} />Add layer</button></div></div><div className="layer-strip" ref={layersScroller}>{sprite.layers.map((l, i) => <button key={l.id} draggable onDragStart={() => setDragLayer(i)} onDragOver={e => e.preventDefault()} onDrop={() => reorderLayer(i)} onDragEnd={() => setDragLayer(null)} onClick={() => setLayerIndex(i)} className={`layer-tile ${i === layerIndex ? 'selected' : ''} ${!l.visible ? 'hidden-layer' : ''}`} aria-label={`Select layer ${i + 1}`}><div className="layer-number">{String(i + 1).padStart(2, '0')}{!l.visible ? <EyeOff size={10} /> : <GripVertical size={10} />}</div><CanvasArt sprite={sprite} layer={i} type="layer" /><span>Layer {i + 1}</span></button>)}</div><div className="layer-strip-footer"><span><ArrowDownToLine size={11} />Bottom</span><span>Drag layers to rearrange</span><span>Top<ArrowUpFromLine size={11} /></span></div></section>
          </div>

          <div className="preview-column"><section className="panel preview-panel"><div className="panel-heading"><div><Box size={17} /><h2>Stack preview</h2></div><div className="preview-heading-actions"><span className="live-badge"><i />LIVE</span><IconButton icon={Expand} label="Expand stack preview" onClick={() => setModal('preview')} /></div></div><div className="stack-canvas-container"><CanvasArt sprite={sprite} type="stack" className="stack-canvas" rotation={rotation} tilt={tilt} spacing={spacing} grid={floorGrid} /><span className="axis-indicator"><i className="axis-y">Y</i><i className="axis-z">Z</i><i className="axis-x">X</i></span></div><div className="preview-footer"><button onClick={() => { setRotation(45); setTilt(60); setAutoRotate(false); }} title="Reset camera"><RotateCcw size={14} />Reset view</button><button className="view-type" onClick={() => { setTilt(tilt === 60 ? 20 : 60); notify(tilt === 60 ? 'Front perspective' : 'Isometric perspective'); }}><Box size={13} />{tilt === 20 ? 'Front' : 'Isometric'}<ChevronDown size={12} /></button></div></section>
            <section className="panel settings-panel"><div className="panel-heading"><div><Settings2 size={17} /><h2>Stack settings</h2></div><button className="settings-reset" onClick={() => { setRotation(45); setTilt(60); setSpacing(5); setFloorGrid(true); setAutoRotate(false); }} title="Reset stack settings">Reset</button></div><div className="settings-content"><Slider label="Rotation" value={rotation} min={0} max={360} unit="°" onChange={v => { setAutoRotate(false); setRotation(v); }} /><Slider label="Tilt" value={tilt} min={10} max={85} unit="°" onChange={setTilt} /><Slider label="Layer spacing" value={spacing} min={1} max={12} unit=" px" onChange={setSpacing} /><div className="settings-divider" /><div className="toggle-row"><span><Grid2X2 size={15} />Show ground grid</span><Switch label="Show ground grid" checked={floorGrid} onChange={setFloorGrid} /></div><div className="toggle-row"><span><Play size={15} />Auto-rotate</span><Switch label="Auto-rotate" checked={autoRotate} onChange={setAutoRotate} /></div></div><div className="settings-tip"><span><Sparkles size={15} /></span><p>Flat pixels. A whole new dimension.<br /><strong>That’s the magic of sprite stacking.</strong></p></div></section>
          </div>
        </div>}
      </main>
    </div>

    <footer className="app-footer"><span><span className="status-dot" />All systems cozy</span><span>Made for the love of little things <span className="footer-star">✦</span></span><button onClick={() => setModal('help')}>Keyboard shortcuts<kbd>?</kbd></button></footer>
    <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={importProject} />
    {toast && <div className="toast" role="status"><Check size={16} />{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14} /></button></div>}

    {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><section className={`modal ${modal === 'preview' ? 'preview-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e => e.stopPropagation()}><IconButton icon={X} label="Close dialog" className="modal-close" onClick={() => setModal(null)} />
      {modal === 'new' && <><span className="modal-symbol"><Plus size={23} /></span><h2 id="modal-title">A new little beginning.</h2><p>Create a sprite and make it your own.</p><form onSubmit={createNewSprite}><label className="form-label">Sprite name<input autoFocus value={inputName} onChange={e => setInputName(e.target.value)} placeholder="My wonderful sprite" maxLength={40} /></label><label className="form-label">Start with<select value={newTemplate} onChange={e => setNewTemplate(e.target.value)}><option value="blank">Blank canvas · 24 × 24 · 8 layers</option>{initialKinds.map((k, i) => <option value={k} key={k}>{shortNames[i]} template</option>)}</select></label><button className="primary-button modal-submit" type="submit"><Plus size={16} />Create sprite</button></form></>}
      {(modal === 'rename' || modal === 'project-name') && <><span className="modal-symbol"><Pencil size={22} /></span><h2 id="modal-title">Give it a name.</h2><p>Something that feels just right.</p><form onSubmit={e => { e.preventDefault(); if (!inputName.trim()) return; if (modal === 'rename') { saveHistory(); updateSprite(s => ({ ...s, name: inputName.trim() })); } else setProjectName(inputName.trim()); setModal(null); }}><label className="form-label">{modal === 'rename' ? 'Sprite' : 'Project'} name<input autoFocus required maxLength={40} value={inputName} onChange={e => setInputName(e.target.value)} /></label><button className="primary-button modal-submit" type="submit"><Check size={16} />Save name</button></form></>}
      {modal === 'export' && <><span className="modal-symbol"><Download size={23} /></span><h2 id="modal-title">Let your pixels explore.</h2><p>Take your creation into the world.</p><div className="export-options">{[{ id: 'sheet', icon: Layers, name: 'Sprite sheet', info: 'All layers in a single PNG' }, { id: 'render', icon: Box, name: 'Stack render', info: 'Your current 3D view as a PNG' }, { id: 'project', icon: FileJson, name: 'Project file', info: 'Keep every sprite and layer editable' }].map(o => <button key={o.id} className={exportType === o.id ? 'selected' : ''} onClick={() => setExportType(o.id)}><o.icon size={20} /><span><strong>{o.name}</strong><small>{o.info}</small></span><span className="radio-dot" /></button>)}</div>{exportType !== 'project' && <><label className="export-scale">Export scale<select value={exportScale} onChange={e => setExportScale(Number(e.target.value))}><option value={1}>1× · Original pixels</option><option value={2}>2× · Double size</option><option value={4}>4× · Crisp and shareable</option><option value={8}>8× · Extra big</option></select></label><div className="toggle-row export-background"><span>Include background</span><Switch label="Include background in export" checked={exportBackground} onChange={setExportBackground} /></div></>}<button className="primary-button modal-submit" onClick={performExport}><Download size={16} />Download {exportType === 'project' ? 'project' : 'PNG'}</button><span className="export-note">Your original pixels stay perfectly crisp.</span></>}
      {modal === 'preview' && <><h2 id="modal-title">{sprite.name}</h2><p>A little closer to your creation.</p><CanvasArt sprite={sprite} type="stack" className="expanded-stack" rotation={rotation} tilt={tilt} spacing={spacing} grid={floorGrid} /><Slider label="Rotation" value={rotation} min={0} max={360} unit="°" onChange={setRotation} /></>}
      {modal === 'help' && <><span className="modal-symbol"><Sprout size={24} /></span><h2 id="modal-title">Your pixels, with a little depth.</h2><p>Draw each slice in the pixel editor. Voxelbloom brings them together into a little 3D creation.</p><div className="help-shortcuts">{tools.map(t => <div key={t.id}><span><t.icon size={16} />{t.name}</span><kbd>{t.key}</kbd></div>)}<div><span><Undo2 size={16} />Undo / Redo</span><kbd>⌘ Z / ⌘ ⇧ Z</kbd></div><div><span><Layers size={16} />Previous / next layer</span><kbd>[ / ]</kbd></div></div><div className="help-note"><Blocks size={20} /><p>Switch to <strong>Scene</strong> to arrange your sprites. Drag them around, rotate them, and make a world of your own.</p></div><button className="primary-button modal-submit" onClick={() => setModal(null)}>Let’s make something<Sparkles size={16} /></button></>}
    </section></div>}
  </div>;
}
