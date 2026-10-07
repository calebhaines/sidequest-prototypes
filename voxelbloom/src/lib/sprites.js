/** Small, editable voxel sprites. Each horizontal slice is a 24 × 24 image. */
export const palette = [
  '#2e233b', '#4d354f', '#634180', '#8253a7', '#a576c4', '#c49bdf', '#e5ceee',
  '#fff1d7', '#ead4ad', '#c9a67b', '#a77a59', '#e8b44e', '#ffd77a',
  '#395f45', '#5c8653', '#82a565', '#b7c995', '#668d86', '#88b8ae',
  '#7a879c', '#a6b0bf', '#d1d8e1', '#b06651', '#d28c69', '#f5bba0',
];

const SIZE = 24;
const COUNT = 16;
const C = 11.5;
let nextId = 1;
const index = (x, y) => y * SIZE + x;

function build(kind, colorAt) {
  const names = { mushroom: 'Mushroom house', tree: 'Pine tree', cactus: 'Desert cactus', chest: 'Treasure chest', rock: 'River rock', crystal: 'Amethyst crystal' };
  const id = `${kind}-${Date.now().toString(36)}-${nextId++}`;
  const layers = Array.from({ length: COUNT }, (_, z) => ({
    id: `${id}-layer-${z}`,
    name: kind === 'mushroom' ? (z < 9 ? `Stem ${String(z + 1).padStart(2, '0')}` : `Cap ${String(z - 8).padStart(2, '0')}`) : `Layer ${String(z + 1).padStart(2, '0')}`,
    visible: true,
    pixels: Array.from({ length: SIZE * SIZE }, (_, i) => colorAt(i % SIZE, Math.floor(i / SIZE), z) || null),
  }));
  return { id, kind, name: names[kind] || 'Untitled sprite', width: SIZE, height: SIZE, layers };
}

function mushroom(x, y, z) {
  const dx = x - C;
  const dy = y - C;
  if (z < 9) {
    const radius = z === 0 ? 4.65 : z === 8 ? 4 : 4.4;
    if (dx * dx + dy * dy > radius * radius) return null;
    let color = z === 0 ? '#c9a67b' : '#ead4ad';
    if (dy < -1.5) color = '#fff1d7';
    if (dx > 2.2) color = '#d6bc92';
    if (dy > 2.8) {
      const door = Math.abs(dx) < 1.7 && (z < 5 || (z === 5 && Math.abs(dx) < 1));
      if (door) color = z === 0 ? '#3f2c43' : '#4d354f';
      if (door && z === 2 && dx > 0.7) color = '#ffd77a';
      if (z === 6 && Math.abs(dx) < 2.2) color = '#c9a67b';
    }
    if (dx > 2.8 && Math.abs(dy) < 1.7 && z >= 3 && z <= 6) {
      color = z === 6 || z === 3 || Math.abs(dy) > 1.1 ? '#a77a59' : '#ffd77a';
      if (Math.abs(dy) < 0.6 && z === 4) color = '#e8b44e';
    }
    return color;
  }
  const radii = [8.8, 10.45, 10.8, 10.1, 8.85, 7.1, 4.8];
  const r = radii[z - 9];
  if (dx * dx + (dy * 1.03) ** 2 > r * r) return null;
  const capColors = ['#634180', '#8253a7', '#9360b5', '#a576c4', '#ac80ce', '#b68ad5', '#c49bdf'];
  let color = capColors[z - 9];
  // Irregular little clusters continue over the dome, like painted pixels.
  const spots = [
    [-4.5, -3.5, 1.65], [2.5, -4.5, 1.5], [5.5, 0.5, 1.8],
    [-5.5, 3.5, 1.45], [0.5, 3.5, 1.55], [-0.5, -0.5, 1.25],
  ];
  if (z > 10 && spots.some(([sx, sy, sr]) => (dx - sx) ** 2 + (dy - sy) ** 2 <= sr * sr)) {
    color = z > 13 ? '#fff1e7' : '#e5ceee';
  }
  if (z === 9 && (x + y) % 4 === 0) color = '#75508e';
  return color;
}

function tree(x, y, z) {
  const dx = x - C, dy = y - C;
  if (z < 6 && Math.abs(dx) < 1.6 && Math.abs(dy) < 1.6) return dx + dy > 0 ? '#a77a59' : '#c9a67b';
  const r = z < 3 ? 0 : z <= 7 ? 8.5 - (z - 3) * 1.05 : z <= 11 ? 6.1 - (z - 8) * 1.02 : 3.9 - (z - 12) * 0.95;
  if (r <= 0 || Math.abs(dx) + Math.abs(dy) > r * 1.3 || Math.max(Math.abs(dx), Math.abs(dy)) > r) return null;
  if (z === 15) return '#b7c995';
  return (x * 3 + y * 5 + z) % 11 === 0 ? '#82a565' : dx + dy > 3 ? '#395f45' : '#5c8653';
}

function cactus(x, y, z) {
  const dx = x - C, dy = y - C;
  const column = dx * dx + dy * dy <= (z > 13 ? 2.9 - (z - 13) * 0.7 : 3) ** 2;
  const leftArm = z >= 5 && z <= 11 && (x - 5.5) ** 2 + dy ** 2 <= (z === 11 ? 1.4 : 1.8) ** 2;
  const leftLink = z >= 5 && z <= 7 && x >= 5 && x <= 11 && Math.abs(dy) < 1.6;
  const rightArm = z >= 8 && z <= 13 && (x - 17.5) ** 2 + dy ** 2 <= (z === 13 ? 1.3 : 1.8) ** 2;
  const rightLink = z >= 8 && z <= 10 && x >= 12 && x <= 18 && Math.abs(dy) < 1.6;
  if (!(column || leftArm || leftLink || rightArm || rightLink)) return null;
  return x % 3 === 0 && z % 3 === 1 ? '#b7c995' : dy > 0 ? '#5c8653' : '#82a565';
}

function chest(x, y, z) {
  const dx = Math.abs(x - C), dy = Math.abs(y - C);
  if (z > 10 || dx > 8 || dy > 5 || (z > 6 && dy > Math.sqrt(Math.max(0, 25 - (z - 6) ** 2)))) return null;
  let color = z <= 1 ? '#634180' : '#b06651';
  if (dy > 3.5) color = '#a77a59';
  if (x === 6 || x === 17 || z === 1 || z === 6) color = '#e8b44e';
  if (y >= 16 && Math.abs(x - C) < 1.6 && z >= 4 && z <= 7) color = z === 5 && x === 12 ? '#4d354f' : '#ffd77a';
  if (z > 7 && (x + y) % 5 === 0) color = '#d28c69';
  return color;
}

function rock(x, y, z) {
  const dx = x - C + (z > 4 ? 1 : 0), dy = y - C;
  const radii = [6.8, 8.3, 8.5, 7.8, 7, 5.7, 4.2, 2.6];
  if (z > 7 || (dx / 1.2) ** 2 + dy ** 2 > radii[z] ** 2 || x + y < 10 + z) return null;
  return dx + dy > 4 ? '#7a879c' : z > 4 ? '#d1d8e1' : (x + y + z) % 7 === 0 ? '#88b8ae' : '#a6b0bf';
}

function crystal(x, y, z) {
  const pieces = [[10, 11, 3.7, 16], [15, 13, 2.6, 11], [7, 15, 2.3, 8]];
  for (const [cx, cy, radius, h] of pieces) {
    const r = z > h - 5 ? radius * (h - z) / 5 : radius;
    if (z < h && Math.abs(x - cx) + Math.abs(y - cy) < r * 1.4) {
      return x < cx ? '#e5ceee' : y < cy ? '#c49bdf' : x + y > cx + cy + 1 ? '#8253a7' : '#a576c4';
    }
  }
  return null;
}

export function createSprite(kind = 'mushroom') {
  const constructors = { mushroom, tree, cactus, chest, rock, crystal };
  const selected = constructors[kind] ? kind : 'mushroom';
  return build(selected, constructors[selected]);
}

function shade(hex, factor) {
  if (!hex || typeof hex !== 'string') return '#8253a7';
  let value = hex.replace('#', '');
  if (value.length === 3) value = value.split('').map(c => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(value)) return hex;
  return `rgb(${[0, 2, 4].map(i => Math.round(parseInt(value.slice(i, i + 2), 16) * factor)).join(',')})`;
}

function polygon(ctx, points, fill) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

export function drawStack(ctx, sprite, options = {}) {
  if (!ctx || !sprite) return;
  const {
    width = ctx.canvas.width, height = ctx.canvas.height,
    rotation = 45, tilt = 60, spacing = 5, zoom = 1, grid = true,
    background, padding = 32, centerX = width / 2, centerY = height / 2,
    clear = true, opacity = 1, shadow = true,
  } = options;
  ctx.save();
  if (clear) ctx.clearRect(0, 0, width, height);
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, width, height); }
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = opacity;
  const a = rotation * Math.PI / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const t = Math.max(15, Math.min(85, tilt)) * Math.PI / 180;
  const floorScale = Math.cos(t), riseScale = Math.sin(t);
  const step = Math.max(0.18, spacing / 5) * 0.85;
  const thickness = Math.min(step, 0.85);
  const sw = sprite.width || SIZE, sh = sprite.height || SIZE;
  const cx = sw / 2, cy = sh / 2;
  const project = (x, y, z) => [(x - cx) * cos - (y - cy) * sin, ((x - cx) * sin + (y - cy) * cos) * floorScale - z * riseScale];
  const visible = sprite.layers.map(l => l.visible !== false);
  const voxels = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  sprite.layers.forEach((layer, z) => {
    if (!visible[z]) return;
    layer.pixels.forEach((color, i) => {
      if (!color) return;
      const x = i % sw, y = Math.floor(i / sw);
      voxels.push({ x, y, z, color, depth: (x - cx) * sin + (y - cy) * cos });
      for (const vx of [x, x + 1]) for (const vy of [y, y + 1]) for (const vz of [z * step, z * step + thickness]) {
          const [px, py] = project(vx, vy, vz);
          minX = Math.min(minX, px); maxX = Math.max(maxX, px);
          minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        }
    });
  });
  if (!voxels.length) { ctx.restore(); return; }
  const fit = Math.min((width - padding * 2) / Math.max(1, maxX - minX), (height - padding * 2) / Math.max(1, maxY - minY));
  const scale = fit * 0.79 * zoom;
  const ox = centerX - (minX + maxX) / 2 * scale;
  const oy = centerY - (minY + maxY) / 2 * scale;
  const p = (x, y, z) => { const point = project(x, y, z); return [ox + point[0] * scale, oy + point[1] * scale]; };
  if (grid) {
    ctx.strokeStyle = '#dcd7e3';
    ctx.lineWidth = 0.75;
    ctx.globalAlpha = opacity * 0.55;
    for (let n = -12; n <= Math.max(sw, sh) + 12; n += 2) {
      for (const [[x1, y1], [x2, y2]] of [[[n, -12], [n, sh + 12]], [[-12, n], [sw + 12, n]]]) {
        const start = p(x1, y1, 0), end = p(x2, y2, 0);
        ctx.beginPath(); ctx.moveTo(...start); ctx.lineTo(...end); ctx.stroke();
      }
    }
    ctx.globalAlpha = opacity;
  }
  if (shadow) {
    ctx.save();
    const floor = p(cx, cy, -0.02);
    ctx.translate(...floor);
    ctx.scale(1, Math.max(0.16, floorScale));
    const gradient = ctx.createRadialGradient(0, 0, scale * 2, 0, 0, scale * 10);
    gradient.addColorStop(0, 'rgba(67,42,86,.16)'); gradient.addColorStop(1, 'rgba(67,42,86,0)');
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.ellipse(0, 0, scale * 10, scale * 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  const get = (x, y, z) => {
    if (x < 0 || y < 0 || x >= sw || y >= sh || z < 0 || z >= sprite.layers.length || !visible[z]) return null;
    return sprite.layers[z].pixels[y * sw + x];
  };
  const frontX = sin >= 0 ? 1 : -1;
  const frontY = cos >= 0 ? 1 : -1;
  // Slice order makes this renderer behave exactly like a physical sprite stack.
  voxels.sort((a, b) => a.z - b.z || a.depth - b.depth);
  for (const { x, y, z, color } of voxels) {
    const low = z * step, high = low + thickness;
    if (!get(x + frontX, y, z)) {
      const sx = frontX > 0 ? x + 1 : x;
      polygon(ctx, [p(sx, y, low), p(sx, y + 1, low), p(sx, y + 1, high), p(sx, y, high)], shade(color, 0.8));
    }
    if (!get(x, y + frontY, z)) {
      const sy = frontY > 0 ? y + 1 : y;
      polygon(ctx, [p(x, sy, low), p(x + 1, sy, low), p(x + 1, sy, high), p(x, sy, high)], shade(color, 0.91));
    }
    if (step > thickness + 0.001 || !get(x, y, z + 1)) {
      polygon(ctx, [p(x, y, high), p(x + 1, y, high), p(x + 1, y + 1, high), p(x, y + 1, high)], color);
    }
  }
  ctx.restore();
  // Consumers can use this to put guides or controls at the same origin.
  const [floorX, floorY] = p(cx, cy, 0);
  return { scale, origin: { x: ox, y: oy }, project: p,
    bounds: { x: ox + minX * scale, y: oy + minY * scale, width: (maxX - minX) * scale, height: (maxY - minY) * scale },
    floor: { x: floorX, y: floorY } };
}

export function drawLayer(ctx, sprite, layerIndex, options = {}) {
  if (!ctx || !sprite) return;
  const { width = ctx.canvas.width, height = ctx.canvas.height, grid = true, zoom = 1, background } = options;
  const sw = sprite.width || SIZE, sh = sprite.height || SIZE;
  const cellWidth = width / sw * zoom, cellHeight = height / sh * zoom;
  const scale = Math.min(cellWidth, cellHeight);
  const ox = (width - sw * cellWidth) / 2, oy = (height - sh * cellHeight) / 2;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, width, height); }
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#eae5ef' : '#f4f0f7';
    ctx.fillRect(ox + x * cellWidth, oy + y * cellHeight, cellWidth, cellHeight);
  }
  const layer = sprite.layers[Math.max(0, Math.min(sprite.layers.length - 1, layerIndex))];
  if (layer) layer.pixels.forEach((color, i) => {
    if (!color) return;
    ctx.fillStyle = color; ctx.fillRect(ox + (i % sw) * cellWidth, oy + Math.floor(i / sw) * cellHeight, cellWidth, cellHeight);
  });
  if (grid && scale >= 4) {
    ctx.strokeStyle = 'rgba(91,65,110,.12)'; ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = 0; x <= sw; x++) { ctx.moveTo(ox + x * cellWidth, oy); ctx.lineTo(ox + x * cellWidth, oy + sh * cellHeight); }
    for (let y = 0; y <= sh; y++) { ctx.moveTo(ox, oy + y * cellHeight); ctx.lineTo(ox + sw * cellWidth, oy + y * cellHeight); }
    ctx.stroke();
  }
  ctx.restore();
  return { scale, cellWidth, cellHeight, x: ox, y: oy, origin: { x: ox, y: oy } };
}

export function drawThumbnail(ctx, sprite, width = ctx.canvas.width, height = ctx.canvas.height) {
  return drawStack(ctx, sprite, { width, height, rotation: 45, tilt: 60, spacing: 5, grid: false, padding: 4, zoom: 1.07, shadow: false });
}
