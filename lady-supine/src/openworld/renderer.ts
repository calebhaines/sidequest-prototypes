import { TILE_SIZE, type ActorFrame, type RenderFrame, type TileKind, type WorldObject, type WorldScene } from './types';
import { drawActorSprite, drawItemIcon } from './sprites';
import { worldHash } from './world';

const CHUNK = 8;
const tileCache = new Map<string, HTMLCanvasElement>();
const colors: Record<TileKind, [string, string, string]> = {
  grass: ['#668264', '#6f8a68', '#567257'], darkGrass: ['#4c6d54', '#59765b', '#3f604a'],
  dirt: ['#99815f', '#a28a67', '#887251'], path: ['#baaa82', '#c3b48c', '#a99976'],
  water: ['#4b7c81', '#55878b', '#3c6b77'], deepWater: ['#355c6c', '#3d6573', '#305264'],
  sand: ['#b9ad89', '#c5b793', '#a99d7b'], stone: ['#90958a', '#9da296', '#7c847c'],
  woodFloor: ['#967a5d', '#a28566', '#806a52'], stoneFloor: ['#98998c', '#a5a799', '#888a7f'],
  void: ['#20202b', '#282734', '#191924'], tilled: ['#705d46', '#80694d', '#5c4e3c'],
};
const waterTile = (kind: TileKind | undefined) => kind === 'water' || kind === 'deepWater';
const p = (ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

function tileAt(scene: WorldScene, x: number, y: number): TileKind | undefined {
  return x >= 0 && y >= 0 && x < scene.width && y < scene.height ? scene.tiles[y * scene.width + x] : undefined;
}
function paintTile(ctx: CanvasRenderingContext2D, scene: WorldScene, x: number, y: number, px: number, py: number) {
  const kind = tileAt(scene, x, y) || 'void', palette = colors[kind], random = worldHash(x, y);
  p(ctx, random > .8 ? palette[1] : palette[0], px, py, 32, 32);
  if (kind === 'grass' || kind === 'darkGrass') {
    for (let n = 0; n < 5; n++) {
      const a = worldHash(x + n * 9, y + n * 13), b = worldHash(x + n * 2, y + n * 19);
      const xx = px + Math.floor(a * 28), yy = py + Math.floor(b * 28);
      p(ctx, n % 2 ? palette[1] : palette[2], xx, yy, 2, 3);
      if (n === 0) p(ctx, palette[2], xx - 2, yy + 2, 6, 1);
    }
    if (random > .92) { p(ctx, '#a6a57b', px + 12, py + 16, 2, 2); p(ctx, '#8d9770', px + 20, py + 9, 2, 2); }
  } else if (kind === 'path' || kind === 'dirt' || kind === 'sand') {
    for (let n = 0; n < 4; n++) p(ctx, n % 2 ? palette[1] : palette[2], px + Math.floor(worldHash(x + n * 16, y + 8) * 29), py + Math.floor(worldHash(x + 7, y + n * 17) * 28), n === 1 ? 3 : 2, 1);
    if (kind === 'path') {
      // Soft, irregular edges keep paths from looking like a chessboard.
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const neighbour = tileAt(scene, x + dx, y + dy);
        if (neighbour === 'grass' || neighbour === 'darkGrass') {
          const c = colors[neighbour][0];
          for (let n = 0; n < 4; n++) {
            const depth = 1 + Math.floor(worldHash(x + n, y + 3) * 4);
            if (dx) p(ctx, c, px + (dx < 0 ? 0 : 32 - depth), py + n * 8, depth, 5);
            else p(ctx, c, px + n * 8, py + (dy < 0 ? 0 : 32 - depth), 5, depth);
          }
        }
      }
    }
  } else if (kind === 'stone' || kind === 'stoneFloor') {
    p(ctx, palette[2], px, py + 15, 32, 1);
    p(ctx, palette[2], px + (y % 2 ? 16 : 7), py, 1, 15);
    p(ctx, palette[2], px + (y % 2 ? 6 : 21), py + 16, 1, 16);
    p(ctx, palette[1], px + 1, py + 1, 30, 1);
    p(ctx, palette[1], px + 1, py + 17, 30, 1);
    if (random > .86) p(ctx, '#7a8973', px + 25, py + 29, 4, 2);
  } else if (kind === 'woodFloor') {
    for (let n = 0; n < 4; n++) { p(ctx, palette[2], px, py + n * 8, 32, 1); p(ctx, palette[1], px + 1, py + n * 8 + 1, 30, 1); }
    p(ctx, palette[2], px + (y % 2 ? 22 : 11), py, 1, 8);
    p(ctx, palette[2], px + (y % 2 ? 7 : 25), py + 16, 1, 8);
    if (random > .8) p(ctx, palette[2], px + 16, py + 21, 5, 1);
  } else if (kind === 'tilled') {
    for (let n = 0; n < 4; n++) { p(ctx, palette[2], px, py + n * 8 + 3, 32, 3); p(ctx, palette[1], px, py + n * 8 + 6, 32, 1); }
  } else if (waterTile(kind)) {
    if (random > .65) p(ctx, palette[1], px + 7, py + 16, 13, 1);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const neighbour = tileAt(scene, x + dx, y + dy);
      if (neighbour && !waterTile(neighbour)) {
        if (dx) { p(ctx, '#719498', px + (dx < 0 ? 0 : 29), py, 3, 32); p(ctx, '#9aaba0', px + (dx < 0 ? 0 : 31), py, 1, 32); }
        else { p(ctx, '#719498', px, py + (dy < 0 ? 0 : 29), 32, 3); p(ctx, '#9aaba0', px, py + (dy < 0 ? 0 : 31), 32, 1); }
      }
    }
  } else if (kind === 'void' && scene.outdoors && random > .88) p(ctx, '#494052', px + 14, py + 8, 2, 1);
}
function terrainChunk(scene: WorldScene, cx: number, cy: number) {
  const key = `${scene.id}:${cx}:${cy}`;
  const cached = tileCache.get(key);
  if (cached) { tileCache.delete(key); tileCache.set(key, cached); return cached; }
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = CHUNK * TILE_SIZE;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) paintTile(ctx, scene, cx * CHUNK + x, cy * CHUNK + y, x * TILE_SIZE, y * TILE_SIZE);
  tileCache.set(key, canvas);
  if (tileCache.size > 100) tileCache.delete(tileCache.keys().next().value!);
  return canvas;
}
function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, alpha = .2) {
  ctx.fillStyle = `rgba(20,34,29,${alpha})`; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, -.15, 0, Math.PI * 2); ctx.fill();
}
function outlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#efe4c7', font = '12px "DM Sans", sans-serif') {
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(24,30,26,.8)'; ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
}
function fire(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, size = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
  const flick = Math.sin(time * 9) * 2;
  p(ctx, '#503d30', -12, -3, 23, 5); p(ctx, '#7b5438', -8, -6, 16, 4);
  p(ctx, '#d98d45', -6, -12, 12, 9); p(ctx, '#d98d45', -4, -18 + flick, 8, 10);
  p(ctx, '#f4bc61', -4, -14, 8, 11); p(ctx, '#ffe19a', -2, -11, 4, 6);
  p(ctx, '#eeaa4f', 3, -17 - flick, 3, 6); p(ctx, '#eaaa54', -6, -21 + flick, 3, 6);
  ctx.restore();
}
function leafCluster(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, bright: string) {
  p(ctx, '#2c4b40', x + 4, y + 3, w - 5, h);
  p(ctx, color, x, y + 5, w, h - 7); p(ctx, color, x + 4, y, w - 8, h);
  p(ctx, bright, x + 5, y + 3, Math.max(3, w - 14), 3);
  p(ctx, bright, x + 2, y + 7, 3, Math.max(2, h / 3));
}
function drawTree(ctx: CanvasRenderingContext2D, o: WorldObject, time: number, fade: number) {
  const willow = o.kind === 'willow', variant = o.variant || 0;
  shadow(ctx, 10, 3, willow ? 30 : 24, 10, .25);
  p(ctx, '#544d36', -5, -36, 10, 39); p(ctx, '#8b7650', -4, -34, 4, 34); p(ctx, '#b39a65', -3, -34, 2, 25);
  p(ctx, '#544d36', -12, 0, 10, 4); p(ctx, '#544d36', 3, 0, 11, 4);
  ctx.globalAlpha *= fade;
  const sway = Math.round(Math.sin(time * 1.1 + o.x) * 1.2);
  ctx.translate(sway, 0);
  if (willow) {
    leafCluster(ctx, -27, -76, 48, 25, '#759471', '#9bb38a');
    leafCluster(ctx, -34, -57, 27, 25, '#68896b', '#8aa77c');
    leafCluster(ctx, 3, -62, 31, 30, '#678c70', '#8ca783');
    for (let i = 0; i < 11; i++) {
      const xx = -29 + i * 6, length = 11 + worldHash(i, Math.floor(o.y)) * 27;
      p(ctx, i % 2 ? '#88a17b' : '#527b64', xx, -43, 2, length);
      p(ctx, '#759471', xx + Math.sin(time + i) * 2, -39 + length, 2, 6);
    }
  } else if (variant === 1) {
    for (let i = 0; i < 5; i++) {
      const w = 18 + i * 9, y = -90 + i * 14;
      leafCluster(ctx, -w / 2, y, w, 21, i % 2 ? '#3e6350' : '#4b7158', '#6f8b65');
    }
  } else if (variant === 2) {
    p(ctx, '#62583d', -5, -71, 10, 52);
    leafCluster(ctx, -18, -91, 36, 28, '#667959', '#8fa078');
    leafCluster(ctx, -23, -71, 45, 25, '#536c51', '#81956d');
    p(ctx, '#c3b18d', -9, -96, 18, 5); p(ctx, '#8b8e7a', -5, -103, 9, 7);
  } else {
    leafCluster(ctx, -25, -70, 44, 28, o.color || '#5b7e57', '#88a274');
    leafCluster(ctx, -34, -52, 37, 28, '#4f7653', '#79986a');
    leafCluster(ctx, -7, -49, 41, 26, '#527855', '#83a16f');
    leafCluster(ctx, -11, -76, 34, 27, '#64865b', '#92aa78');
  }
}
function drawBuilding(ctx: CanvasRenderingContext2D, o: WorldObject, time: number) {
  const w = (o.width || 5) * 32, h = (o.height || 4) * 32, variant = o.variant || 0;
  const color = o.color || '#9a8068', roofHeight = Math.max(45, h * .62);
  shadow(ctx, w / 2 + 14, h + 5, w / 2 + 13, 20, .23);
  // Heavy roofs, visible front rooms, and stone stairs establish depth without external art.
  p(ctx, '#4c5047', 0, 15, w, h - 13);
  p(ctx, color, 4, roofHeight - 1, w - 8, h - roofHeight + 1);
  p(ctx, '#d0bea0', 7, roofHeight + 5, w - 14, 5);
  p(ctx, '#716c59', 0, h - 8, w, 10);
  p(ctx, '#aaa28b', w / 2 - 22, h, 44, 7); p(ctx, '#8c8a78', w / 2 - 27, h + 7, 54, 5);
  const roofColors = variant === 0 ? ['#76564a', '#936d55', '#62483e'] : variant === 3 ? ['#6c3c54', '#8f5667', '#543547'] : variant === 4 ? ['#5e5b77', '#7c7391', '#46455d'] : ['#52656e', '#77818a', '#405761'];
  // Tiered roof silhouette: stair-step edges match the sprite art.
  p(ctx, roofColors[2], -7, roofHeight - 6, w + 14, 11);
  p(ctx, roofColors[0], -3, 20, w + 6, roofHeight - 25);
  p(ctx, roofColors[1], 7, 13, w - 14, 9);
  p(ctx, roofColors[2], 12, 8, w - 24, 7);
  p(ctx, roofColors[1], 15, 9, w - 30, 2);
  for (let y = 25; y < roofHeight - 8; y += 12) {
    p(ctx, roofColors[2], -2, y + 9, w + 4, 2);
    for (let x = (Math.floor(y / 12) % 2) * 12; x < w; x += 24) { p(ctx, roofColors[1], x + 1, y + 1, 20, 1); p(ctx, roofColors[2], x + 23, y + 1, 1, 8); }
  }
  if (variant === 4) {
    // The castle's towers are monumental but remain original temporary pixels.
    for (const x of [-4, w - 61]) {
      p(ctx, '#646177', x, -25, 65, h + 25); p(ctx, '#aaa0b1', x + 7, -20, 51, h + 12);
      for (let y = -12; y < h - 20; y += 18) { p(ctx, '#8d879d', x + 7, y, 51, 1); p(ctx, '#c1b3c0', x + 10, y + 1, 45, 1); }
      for (let y = 45; y < h - 25; y += 81) { p(ctx, '#47485d', x + 26, y, 16, 34); p(ctx, '#bcaa7c', x + 27, y + 2, 13, 2); }
      p(ctx, '#655f7c', x - 7, -44, 79, 23); p(ctx, '#8c81a0', x - 4, -48, 73, 6);
      for (let j = 0; j < 4; j++) p(ctx, '#8c81a0', x + j * 20, -60, 13, 17);
      p(ctx, '#cbb98a', x + 31, -94, 3, 38); p(ctx, '#a67488', x + 34, -89, 26, 14); p(ctx, '#c6a0a3', x + 36, -87, 21, 2);
    }
    for (const x of [w * .28, w * .72]) { p(ctx, '#8f677d', x, roofHeight + 10, 20, h - roofHeight - 32); p(ctx, '#cbb89a', x + 8, roofHeight + 18, 4, 30); }
  } else if (variant === 0) {
    p(ctx, '#726a5a', w * .18, -5, 18, 36); p(ctx, '#aba08a', w * .18 - 3, -9, 24, 8);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = `rgba(202,194,172,${.18 - i * .04})`; const t = (time * 7 + i * 18) % 60; ctx.fillRect(w * .18 + 5 + Math.sin(time + i) * 5, -15 - t, 8 + i * 3, 6 + i * 3); }
  }
  // Warm windows, pillars, a deeply inset open doorway.
  const windowY = roofHeight + Math.max(14, (h - roofHeight) * .3);
  for (let x = 22; x < w - 15; x += Math.max(50, w / 6)) {
    if (Math.abs(x - w / 2) < 35) continue;
    p(ctx, '#4e564f', x - 4, windowY - 5, 26, 32);
    p(ctx, '#d3bd83', x, windowY, 18, 23); p(ctx, '#aa985f', x + 8, windowY, 2, 23); p(ctx, '#8d805a', x, windowY + 10, 18, 2);
    p(ctx, '#d6cbb4', x - 5, windowY + 26, 28, 4);
  }
  const doorW = variant === 0 ? 25 : 38, doorH = Math.min(64, h - roofHeight - 13);
  p(ctx, '#c6b998', w / 2 - doorW / 2 - 4, h - doorH - 5, doorW + 8, doorH + 2);
  p(ctx, '#343f3c', w / 2 - doorW / 2, h - doorH - 2, doorW, doorH + 2);
  p(ctx, '#655946', w / 2 - doorW / 2 + 2, h - doorH, 4, doorH);
  p(ctx, '#bea269', w / 2 + doorW / 2 - 4, h - 19, 2, 5);
  if (variant > 0) {
    for (const x of [10, w / 2 - 52, w / 2 + 45, w - 18]) { p(ctx, '#c6bda5', x, roofHeight + 4, 8, h - roofHeight - 9); p(ctx, '#e0d2b5', x - 3, roofHeight + 6, 14, 4); p(ctx, '#8e8b78', x - 3, h - 10, 14, 4); }
    ctx.fillStyle = '#bdae88'; ctx.beginPath(); ctx.arc(w / 2, roofHeight * .44, 19, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#58656a'; ctx.beginPath(); ctx.arc(w / 2, roofHeight * .44, 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#eadbbc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w / 2, roofHeight * .44); ctx.lineTo(w / 2 + 7, roofHeight * .44 - 6); ctx.moveTo(w / 2, roofHeight * .44); ctx.lineTo(w / 2 - 6, roofHeight * .44 - 10); ctx.stroke();
  }
  if (variant === 2) { p(ctx, '#d5dbbc', w / 2 - 13, 34, 26, 7); p(ctx, '#d5dbbc', w / 2 - 3, 25, 7, 26); }
  if (variant === 3) { p(ctx, '#bd8892', w / 2 - 52, roofHeight - 24, 104, 16); outlined(ctx, 'THE LAST MINUTE', w / 2, roofHeight - 16, '#f1d8b8', 'bold 8px monospace'); }
  if (o.label) {
    const label = o.label.length > 30 ? o.label.replace('Library of ', '').replace('Hospital for Those ', '') : o.label;
    const labelW = Math.min(w - 24, Math.max(90, label.length * 5.7));
    p(ctx, '#494d46', w / 2 - labelW / 2, h - doorH - 23, labelW, 15);
    outlined(ctx, label, w / 2, h - doorH - 15, '#ecdfbf', '9px "DM Sans", sans-serif');
  }
}
function drawObject(ctx: CanvasRenderingContext2D, o: WorldObject, time: number, fade = 1) {
  const variant = o.variant || 0, w = (o.width || 1) * 32, h = (o.height || 1) * 32;
  switch (o.kind) {
    case 'tree': case 'willow': drawTree(ctx, o, time, fade); break;
    case 'building': drawBuilding(ctx, o, time); break;
    case 'rock': case 'ore':
      shadow(ctx, 5, 3, 16, 6); p(ctx, '#626d69', -14, -12, 26, 16); p(ctx, '#98a29a', -11, -17, 19, 15); p(ctx, '#b2b9a9', -8, -17, 11, 3); p(ctx, '#75817b', 5, -11, 7, 12); p(ctx, '#7c8980', -16, -5, 10, 9);
      if (o.kind === 'ore') { p(ctx, '#b9b5db', -7, -12, 5, 4); p(ctx, '#cabddd', 1, -7, 5, 4); p(ctx, '#7d89a8', -5, -8, 3, 5); } break;
    case 'flower': {
      const sway = Math.round(Math.sin(time * 1.5 + o.x) * 1.3), c = ['#d8bc87', '#d6a3a3', '#a9bad0', '#ddd5b8'][variant % 4];
      p(ctx, '#46664b', 0, -10, 2, 11); p(ctx, '#8e9f66', -4, -5, 5, 2); p(ctx, '#7a9561', 2, -7, 4, 2); p(ctx, c, -3 + sway, -14, 8, 5); p(ctx, '#ecd58d', sway, -13, 3, 3); break;
    }
    case 'bush': shadow(ctx, 3, 2, 14, 5); leafCluster(ctx, -13, -15, 27, 17, '#5b7952', '#88a074'); if (variant % 2) { p(ctx, '#b9908e', -5, -9, 3, 3); p(ctx, '#b9908e', 6, -5, 3, 3); } break;
    case 'crop':
      p(ctx, '#52684a', -1, -13, 2, 15); p(ctx, '#799665', -7, -10, 7, 4); p(ctx, '#98aa6d', 1, -13, 8, 4); p(ctx, variant % 2 ? '#aa9856' : '#d09a65', -4, -3, 9, 5); break;
    case 'reed':
      if (variant === 8) {
        shadow(ctx, 1, 4, 13, 4, .12); p(ctx, '#637d54', -15, 1, 29, 3); p(ctx, '#9eac70', -12, -1, 26, 2);
        p(ctx, '#90a366', -8, -8, 3, 10); p(ctx, '#90a366', -8, -9, 10, 3); p(ctx, '#90a366', 0, -9, 3, 6); p(ctx, '#bfd18b', -6, -8, 6, 1);
        p(ctx, '#758d58', 6, -3, 3, 11); p(ctx, '#758d58', 0, 7, 9, 3); p(ctx, '#b6c77b', 11, -4, 5, 3); break;
      }
      for (let n = 0; n < 4; n++) { const xx = -6 + n * 4 + Math.sin(time + n + o.x) * 1.5; p(ctx, '#7d9166', xx, -21 + n * 2, 2, 26 - n * 2); p(ctx, '#b0a175', xx - 1, -25 + n * 2, 4, 7); } break;
    case 'campfire':
      shadow(ctx, 0, 2, 17, 7); for (let n = 0; n < 6; n++) { const a = n / 6 * Math.PI * 2; p(ctx, '#979689', Math.cos(a) * 13 - 3, Math.sin(a) * 5 - 2, 7, 5); }
      fire(ctx, 0, 0, time); break;
    case 'lantern':
      shadow(ctx, 3, 3, 8, 3); p(ctx, '#4b544a', -1, -35, 3, 39); p(ctx, '#5e6452', -6, -38, 13, 4); p(ctx, '#5e6452', -5, -35, 11, 16); p(ctx, '#f0d490', -3, -33, 7, 11); p(ctx, '#f9e9b4', -1, -31, 3, 7); break;
    case 'bench':
      shadow(ctx, 2, 3, 20, 6); p(ctx, '#544e3d', -14, -3, 4, 8); p(ctx, '#544e3d', 12, -3, 4, 8); p(ctx, o.color || '#a08965', -19, -11, 39, 8); p(ctx, '#c1a77c', -19, -11, 39, 2); p(ctx, '#796449', -18, -25, 37, 7); p(ctx, '#aa8d65', -18, -25, 37, 2); p(ctx, '#6c5842', -15, -21, 3, 13); p(ctx, '#6c5842', 13, -21, 3, 13); break;
    case 'workbench':
      shadow(ctx, 4, 4, 20, 7); p(ctx, '#625743', -16, -8, 5, 14); p(ctx, '#625743', 12, -8, 5, 14); p(ctx, '#9a7e53', -20, -22, 40, 13); p(ctx, '#baa474', -20, -25, 40, 6); p(ctx, '#767968', -10, -30, 16, 5); p(ctx, '#bbb5a1', 7, -31, 3, 10); p(ctx, '#4e604f', -15, -24, 5, 3); break;
    case 'well':
      shadow(ctx, 4, 4, 22, 8); p(ctx, '#737e71', -18, -17, 36, 24); p(ctx, '#a7ac91', -19, -22, 38, 10); p(ctx, '#314c4b', -12, -19, 24, 7); p(ctx, '#665a40', -23, -39, 5, 37); p(ctx, '#665a40', 18, -39, 5, 37); p(ctx, '#9b8359', -29, -44, 57, 9); p(ctx, '#6b674d', -20, -50, 42, 7); p(ctx, '#b7ad87', 0, -39, 2, 28); break;
    case 'sign': {
      p(ctx, '#62573f', -2, -20, 4, 23);
      if (variant === 2) {
        p(ctx, '#b9a878', -25, -84, 51, 4); p(ctx, '#e0c997', -26, -86, 4, 8); p(ctx, '#e0c997', 23, -86, 4, 8);
        const sway = Math.round(Math.sin(time * .8 + o.x) * 2);
        p(ctx, o.color || '#91657e', -19 + sway, -80, 39, 58); p(ctx, '#b692a0', -19 + sway, -80, 3, 57); p(ctx, '#694e65', 17 + sway, -80, 3, 57);
        p(ctx, '#c6ac85', -18 + sway, -75, 36, 2); p(ctx, '#c6ac85', -18 + sway, -29, 36, 2);
        p(ctx, '#c6ac85', -3 + sway, -64, 7, 23); p(ctx, '#c6ac85', -10 + sway, -54, 21, 4); p(ctx, '#c6ac85', -13 + sway, -44, 27, 3);
      } else if (variant === 1) {
        p(ctx, '#534d40', -30, -66, 60, 49); p(ctx, '#c7b18c', -28, -64, 56, 45); p(ctx, '#9a727e', -25, -61, 50, 34);
        drawActorSprite(ctx, 'lady', 0, -29, Math.PI / 2, false, 0, time, .72);
        p(ctx, '#dac4a4', -25, -28, 50, 7); outlined(ctx, 'BE DIVINE', 0, -24, '#635248', 'bold 6px monospace');
      } else {
        p(ctx, '#655b43', -22, -41, 44, 22); p(ctx, o.color || '#b5a377', -21, -40, 42, 18);
        p(ctx, '#776c50', -15, -33, 30, 2); p(ctx, '#887b5b', -15, -28, 20, 1);
      }
      break;
    }
    case 'crate': case 'chest':
      shadow(ctx, 3, 3, 15, 6); p(ctx, '#5b5240', -15, -16, 30, 21); p(ctx, '#94754d', -13, -15, 26, 17); p(ctx, '#b2915c', -14, -20, 28, 8); p(ctx, '#b99d71', -13, -18, 26, 2); p(ctx, '#655c44', -9, -14, 3, 15); p(ctx, '#655c44', 7, -14, 3, 15); p(ctx, '#d9ba76', -2, -11, 5, 7); break;
    case 'fence':
      p(ctx, '#6b644b', -16, -17, 32, 4); p(ctx, '#b6a478', -16, -18, 32, 2); p(ctx, '#837356', -16, -5, 32, 3); p(ctx, '#8b7b5c', -13, -23, 4, 27); p(ctx, '#8b7b5c', 10, -23, 4, 27); break;
    case 'grave':
      shadow(ctx, 3, 3, 14, 5); p(ctx, '#7b7d7b', -10, -24, 20, 27); p(ctx, '#a6a59d', -8, -29, 16, 31); p(ctx, '#8f8e87', -5, -16, 10, 1); p(ctx, '#6e7773', -15, 0, 29, 5); break;
    case 'altar':
      shadow(ctx, 5, 5, 20, 7); p(ctx, '#777971', -19, -6, 38, 12); p(ctx, o.color || '#beb79f', -15, -12, 30, 8);
      if (variant === 2) {
        p(ctx, '#737a71', -15, -84, 30, 7); p(ctx, '#c4bda5', -17, -92, 34, 9); p(ctx, '#dacfaf', -14, -91, 28, 2);
        p(ctx, '#a8a997', -10, -78, 20, 64); p(ctx, '#cdc6ad', -9, -78, 4, 64); p(ctx, '#8d9387', 5, -78, 4, 64);
        for (const x of [-2, 3]) p(ctx, '#9e9f8f', x, -75, 1, 56);
        p(ctx, '#bfc1a8', -14, -15, 28, 5);
      } else if (variant === 3) {
        p(ctx, '#a19b8c', -15, -36, 29, 21); p(ctx, '#d0c3a2', -15, -38, 29, 4); p(ctx, '#b9aaa0', -8, -59, 22, 21); p(ctx, '#e0cbb6', -8, -60, 22, 3); p(ctx, '#887b84', -16, -69, 13, 17); p(ctx, '#c2afae', -16, -70, 13, 3);
      } else if (variant === 4) {
        p(ctx, '#4e6b69', -15, -43, 30, 31); ctx.fillStyle = 'rgba(162,196,181,.46)'; ctx.fillRect(-13,-41,26,27); p(ctx, '#b5c8b2', -12, -40, 2, 26); p(ctx, '#bad0c2', 9, -40, 2, 26);
        p(ctx, '#d9cb95', -2, -30 + Math.sin(time*1.5)*2, 5, 7); p(ctx, '#d0c19a', -15, -43, 30, 3);
      } else if (variant === 1) { p(ctx, '#9b988c', -9, -44, 19, 34); p(ctx, '#c7c3ad', -9, -44, 9, 32); p(ctx, '#d0c4a8', -12, -55, 23, 12); p(ctx, '#a7a695', -16, -59, 28, 6); p(ctx, '#a3a493', 10, -41, 5, 28); }
      else { p(ctx, '#767283', -11, -32, 23, 21); p(ctx, '#ada5b7', -14, -36, 28, 8); p(ctx, '#454653', -8, -36, 16, 4); p(ctx, '#d0c1a0', -2, -34, 5, 3); }
      break;
    case 'bed':
      p(ctx, '#625744', 0, 0, w, h); p(ctx, '#89775a', 3, 0, w - 6, 12); p(ctx, '#d9d3b7', 5, 8, w - 10, h - 13); p(ctx, o.color || '#a0ada0', 5, 29, w - 10, h - 34); p(ctx, '#e6ddc4', 9, 10, w - 18, 18); p(ctx, '#c6c7b2', 9, 27, w - 18, 2); p(ctx, '#655642', 0, h - 9, w, 9); break;
    case 'bookshelf':
      p(ctx, '#514a39', 0, -29, w, 49); p(ctx, '#9a8060', 1, -31, w - 2, 5); p(ctx, '#c0a783', 1, -30, w - 2, 2);
      for (let row = 0; row < 2; row++) { for (let x = 5; x < w - 6; x += 7) { const c = ['#8e6e71', '#748c82', '#b69b68', '#8891a1'][Math.floor(worldHash(x + variant, row + Math.floor(o.y)) * 4)]; p(ctx, c, x, -21 + row * 22, 5, 14 + x % 3); p(ctx, '#c1ac84', x, -18 + row * 22, 5, 1); } p(ctx, '#8d7556', 0, -3 + row * 22, w, 4); }
      break;
    case 'table':
      p(ctx, '#665843', 3, h - 5, 7, 10); p(ctx, '#665843', w - 10, h - 5, 7, 10); p(ctx, '#766346', 0, -3, w, h); p(ctx, o.color || '#a18660', 0, -12, w, h); p(ctx, '#c0a980', 0, -12, w, 3);
      if (variant === 1) { p(ctx, '#3b6355', 5, -7, w - 10, h - 11); p(ctx, '#c2b888', w / 2 - 8, h / 2 - 7, 16, 12); p(ctx, '#e8ddbe', w / 2 - 5, h / 2 - 5, 10, 8); }
      else { p(ctx, '#e1d6b8', 10, 1, 18, 13); p(ctx, '#7b8573', 14, 5, 9, 1); p(ctx, '#78674b', w - 20, 1, 8, 10); }
      break;
    case 'rug':
      p(ctx, '#4f5146', -1, -1, w + 2, h + 2); p(ctx, o.color || '#826272', 0, 0, w, h); p(ctx, '#c7b292', 4, 4, w - 8, 2); p(ctx, '#c7b292', 4, h - 6, w - 8, 2); p(ctx, '#c7b292', 4, 4, 2, h - 8); p(ctx, '#c7b292', w - 6, 4, 2, h - 8);
      for (let y = 20; y < h - 12; y += 23) { p(ctx, '#ad9490', w / 2 - 6, y, 12, 2); p(ctx, '#ad9490', w / 2 - 1, y - 4, 2, 10); } break;
    case 'window':
      p(ctx, '#525d59', -11, -37, 23, 32); p(ctx, '#91aaa9', -8, -33, 17, 26); p(ctx, '#d6d7be', -7, -31, 6, 10); p(ctx, '#6d7770', -1, -33, 2, 26); p(ctx, '#6d7770', -8, -20, 17, 2); p(ctx, '#c2b79d', -15, -5, 31, 5); break;
    case 'portrait':
      p(ctx, '#524c43', -18, -49, 38, 45); p(ctx, '#c7ac79', -17, -50, 35, 44); p(ctx, '#9b7b51', -14, -47, 29, 38); p(ctx, '#776373', -12, -45, 25, 34);
      drawActorSprite(ctx, 'lady', 1, -12, Math.PI / 2, false, 0, time, .72); p(ctx, '#e4ce94', -17, -50, 35, 2); break;
    case 'machine':
      shadow(ctx, 3, 3, 20, 7); p(ctx, '#475750', -20, -28, 40, 33); p(ctx, '#8b9890', -17, -35, 34, 35); p(ctx, '#b3b9a1', -17, -35, 34, 4);
      if (variant === 2) {
        p(ctx, '#2b4748', -13, -29, 26, 21); p(ctx, '#719d94', -11, -27, 22, 17);
        drawActorSprite(ctx, 'lady', 0, -9, Math.PI / 2, false, 0, time, .48);
        ctx.fillStyle = 'rgba(167,194,171,.18)'; for (let y = -25; y < -8; y += 3) ctx.fillRect(-11, y, 22, 1);
        p(ctx, '#d5caa0', -8, -4, 4, 3); p(ctx, '#d5caa0', 7, -4, 3, 3);
      } else {
        p(ctx, '#4f685e', -12, -26, 24, 16); p(ctx, '#a9b99b', -9, -23, 18, 2); p(ctx, '#cea16e', -7, -16, 5, 5); p(ctx, '#adc894', 4, -16, 5, 5); p(ctx, '#5c6354', -7, -6, 3, 10); p(ctx, '#5c6354', 6, -6, 3, 10);
        p(ctx, '#c7b07e', -3, -33, 5, 5); p(ctx, '#b4baa0', 18, -20, 5, 10);
      } break;
    case 'gate': case 'portal': {
      const portal = o.kind === 'portal', gateH = Math.max(h, portal ? 100 : 110);
      for (const x of [0, w - 25]) { p(ctx, '#626b65', x, 4, 25, gateH); p(ctx, '#a5ab97', x + 3, 0, 19, gateH); p(ctx, '#c2c3a6', x + 4, 2, 3, gateH - 2); for (let y = 17; y < gateH; y += 16) p(ctx, '#889385', x + 3, y, 19, 1); p(ctx, '#b7bba0', x - 5, gateH - 4, 35, 9); }
      p(ctx, '#717c70', -5, -2, w + 10, 19); p(ctx, '#b4b99e', 0, -10, w, 16); p(ctx, '#d2c5a3', 6, -9, w - 12, 3);
      for (let x = 14; x < w - 14; x += 23) { p(ctx, '#b7b09a', x, -23, 12, 15); p(ctx, '#d1c39d', x, -24, 12, 3); }
      if (portal) {
        const glow = ctx.createLinearGradient(0, 0, 0, gateH); glow.addColorStop(0, 'rgba(230,218,173,.42)'); glow.addColorStop(1, 'rgba(216,226,185,.06)'); ctx.fillStyle = glow; ctx.fillRect(25, 7, w - 50, gateH - 7);
        for (let i = 0; i < 13; i++) { const yy = (time * 10 + i * 17) % gateH; p(ctx, '#ddce91', 40 + worldHash(i, 8) * (w - 80), gateH - yy, 2, 3); }
      } else {
        for (let x = 31; x < w - 25; x += 16) { p(ctx, '#626e64', x, 19, 3, gateH - 25); p(ctx, '#b0b39b', x, 18, 1, gateH - 25); }
        p(ctx, '#7f8878', 24, gateH * .48, w - 48, 3);
      }
      if (o.label) outlined(ctx, o.kind === 'portal' ? 'INFINITE TIME' : o.variant === 1 ? 'GREAT CASTLE DIVINE' : 'UNENTERABLE', w / 2, -1, '#e5d5af', 'bold 9px monospace'); break;
    }
    default: break;
  }
}
function onScreen(o: WorldObject, frame: RenderFrame, halfW: number, halfH: number) {
  const w = o.width || 1, h = o.height || 1;
  return o.x + w + 3 > frame.camera.x - halfW && o.x - 3 < frame.camera.x + halfW && o.y + h + 2 > frame.camera.y - halfH && o.y - 5 < frame.camera.y + halfH;
}
function worldPosition(frame: RenderFrame, x: number, y: number, width: number, height: number) {
  return { x: Math.round((x - frame.camera.x) * TILE_SIZE * frame.zoom + width / 2), y: Math.round((y - frame.camera.y) * TILE_SIZE * frame.zoom + height / 2) };
}

/** Rendering is intentionally decoupled from mechanics so sprites and tile art can be replaced. */
export function renderWorld(ctx: CanvasRenderingContext2D, frame: RenderFrame, width: number, height: number) {
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#20232b'; ctx.fillRect(0, 0, width, height);
  const { scene, zoom } = frame, scale = TILE_SIZE * zoom, time = frame.reducedMotion ? 0 : frame.time;
  const halfW = width / scale / 2 + 2, halfH = height / scale / 2 + 2;
  const firstCX = Math.max(0, Math.floor((frame.camera.x - halfW) / CHUNK)), lastCX = Math.min(Math.floor((scene.width - 1) / CHUNK), Math.floor((frame.camera.x + halfW) / CHUNK));
  const firstCY = Math.max(0, Math.floor((frame.camera.y - halfH) / CHUNK)), lastCY = Math.min(Math.floor((scene.height - 1) / CHUNK), Math.floor((frame.camera.y + halfH) / CHUNK));
  for (let cy = firstCY; cy <= lastCY; cy++) for (let cx = firstCX; cx <= lastCX; cx++) {
    const pos = worldPosition(frame, cx * CHUNK, cy * CHUNK, width, height);
    ctx.drawImage(terrainChunk(scene, cx, cy), pos.x, pos.y, CHUNK * scale, CHUNK * scale);
  }
  // Water actually moves; shore shimmer and occasional fish are independently animated.
  const minX = Math.max(0, Math.floor(frame.camera.x - halfW)), maxX = Math.min(scene.width - 1, Math.ceil(frame.camera.x + halfW));
  const minY = Math.max(0, Math.floor(frame.camera.y - halfH)), maxY = Math.min(scene.height - 1, Math.ceil(frame.camera.y + halfH));
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const kind = tileAt(scene, x, y);
    if (!waterTile(kind)) continue;
    const pos = worldPosition(frame, x, y, width, height), phase = worldHash(x, y) * 6;
    ctx.globalAlpha = .16 + (Math.sin(time * 1.1 + phase) + 1) * .08;
    p(ctx, '#a1c2ba', pos.x + (4 + Math.sin(time * .5 + phase) * 3) * zoom, pos.y + (10 + Math.sin(time * .65 + phase) * 5) * zoom, 13 * zoom, zoom);
    if (worldHash(x + 2, y + 6) > .96) { ctx.globalAlpha = .09; p(ctx, '#d5d7b8', pos.x + 17 * zoom, pos.y + 20 * zoom, 7 * zoom, zoom); }
    ctx.globalAlpha = 1;
  }
  if (!scene.outdoors) {
    // Thick stone or wooden wall tops frame rooms, with an open southern doorway.
    const top = worldPosition(frame, 1, 1, width, height), roomW = (scene.width - 2) * scale;
    p(ctx, '#3d4840', top.x, top.y, roomW, scale * 1.25);
    p(ctx, scene.location === 'castle' || scene.location === 'museum' ? '#b6b29a' : '#a29c81', top.x, top.y + scale * .45, roomW, scale * .45);
    p(ctx, '#c5bba0', top.x, top.y + scale * .4, roomW, scale * .1);
    p(ctx, '#6f7565', top.x, top.y + scale * .9, roomW, scale * .15);
    const bottom = worldPosition(frame, 1, scene.height - 1.3, width, height), exitW = 2.4 * scale;
    p(ctx, '#444f45', bottom.x, bottom.y, roomW / 2 - exitW / 2, scale * .45);
    p(ctx, '#444f45', bottom.x + roomW / 2 + exitW / 2, bottom.y, roomW / 2 - exitW / 2, scale * .45);
    p(ctx, '#938e74', bottom.x, bottom.y, roomW / 2 - exitW / 2, scale * .12);
    p(ctx, '#938e74', bottom.x + roomW / 2 + exitW / 2, bottom.y, roomW / 2 - exitW / 2, scale * .12);
    if (scene.exit) { const doorPos = worldPosition(frame, scene.exit.positionInRoom.x, scene.exit.positionInRoom.y, width, height); outlined(ctx, '↓ OUTSIDE', doorPos.x, doorPos.y + 10 * zoom, '#d5c79e', '10px "DM Sans", sans-serif'); }
  }
  if (!scene.outdoors) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const o of frame.objects) if (o.kind === 'window') {
      const pos = worldPosition(frame, o.x, o.y, width, height);
      ctx.fillStyle = 'rgba(229,212,154,.055)'; ctx.beginPath(); ctx.moveTo(pos.x-9*zoom,pos.y-18*zoom); ctx.lineTo(pos.x+9*zoom,pos.y-18*zoom); ctx.lineTo(pos.x+95*zoom,pos.y+125*zoom); ctx.lineTo(pos.x+28*zoom,pos.y+125*zoom); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  const visibleObjects = frame.objects.filter(o => !frame.harvested[o.id] && onScreen(o, frame, halfW, halfH));
  // Carpets remain under feet; all upright objects and actors share the same depth sort.
  for (const o of visibleObjects.filter(o => o.kind === 'rug')) {
    const pos = worldPosition(frame, o.x, o.y, width, height);
    ctx.save(); ctx.translate(pos.x, pos.y); ctx.scale(zoom, zoom); drawObject(ctx, o, time); ctx.restore();
  }
  type DepthEntry = { depth: number; object?: WorldObject; actor?: ActorFrame; player?: true };
  const entries: DepthEntry[] = visibleObjects.filter(o => o.kind !== 'rug').map(o => ({ depth: o.y + ((o.width || 1) >= 2 || (o.height || 1) >= 2 ? (o.height || 1) : 0), object: o }));
  for (const actor of frame.actors) if (Math.abs(actor.x - frame.camera.x) < halfW + 2 && Math.abs(actor.y - frame.camera.y) < halfH + 2 && actor.health > 0) entries.push({ depth: actor.y, actor });
  entries.push({ depth: frame.player.y, player: true }); entries.sort((a, b) => a.depth - b.depth);
  for (const entry of entries) {
    if (entry.object) {
      const o = entry.object, pos = worldPosition(frame, o.x, o.y, width, height);
      ctx.save(); ctx.translate(pos.x, pos.y); ctx.scale(zoom, zoom);
      const nearTree = (o.kind === 'tree' || o.kind === 'willow') && Math.hypot(o.x - frame.player.x, o.y - frame.player.y) < 1.7 && frame.player.y < o.y + .4;
      drawObject(ctx, o, time, nearTree ? .4 : 1); ctx.restore();
    } else if (entry.actor) {
      const actor = entry.actor, pos = worldPosition(frame, actor.x, actor.y, width, height);
      shadow(ctx, pos.x + 3 * zoom, pos.y + 2 * zoom, (actor.kind === 'bat' ? 12 : 10) * zoom, 4 * zoom, actor.kind === 'bat' ? .1 : .22);
      ctx.save(); if (actor.hurt > 0 && Math.floor(time * 20) % 2 === 0) ctx.globalAlpha = .45;
      drawActorSprite(ctx, actor.kind, pos.x, pos.y + (actor.kind === 'bat' ? Math.sin(time * 3 + actor.x) * 3 * zoom : 0), actor.facing, actor.moving, actor.animation, time, zoom, actor.color); ctx.restore();
      const dist = Math.hypot(actor.x - frame.player.x, actor.y - frame.player.y);
      if (!actor.hostile && dist < 5.4) {
        outlined(ctx, actor.name, pos.x, pos.y - (actor.kind === 'ox' ? 50 : 44) * zoom, actor.id === frame.nearby?.id ? '#ffe3a3' : '#f0e6ce', `${Math.max(10, 10 * zoom)}px "DM Sans", sans-serif`);
        if (frame.flags.includes(`${actor.id}_friend`)) { ctx.fillStyle = '#b6ce8a'; ctx.beginPath(); ctx.arc(pos.x + 13 * zoom, pos.y - 37 * zoom, 2.2 * zoom, 0, Math.PI * 2); ctx.fill(); }
      } else if (actor.hostile && dist < 5) {
        p(ctx, '#3a3639', pos.x - 12 * zoom, pos.y - 39 * zoom, 24 * zoom, 3 * zoom);
        p(ctx, '#bc8480', pos.x - 12 * zoom, pos.y - 39 * zoom, Math.min(1, actor.health / 42) * 24 * zoom, 3 * zoom);
      }
    } else {
      const player = frame.player, pos = worldPosition(frame, player.x, player.y, width, height);
      shadow(ctx, pos.x + 4 * zoom, pos.y + 2 * zoom, 10 * zoom, 4 * zoom, .25);
      ctx.save(); if (player.hurt > 0 && Math.floor(time * 17) % 2 === 0) ctx.globalAlpha = .4;
      drawActorSprite(ctx, 'human', pos.x, pos.y, player.facing, player.moving, player.animation, time, zoom); ctx.restore();
      if (player.attacking > 0) {
        const swing = player.facing + (1 - Math.min(1, player.attacking / .3)) * 1.7 - .8;
        ctx.save(); ctx.translate(pos.x, pos.y - 14 * zoom); ctx.rotate(swing + Math.PI / 2);
        drawItemIcon(ctx, frame.selected, 9 * zoom, -17 * zoom, 23 * zoom); ctx.restore();
        ctx.strokeStyle = 'rgba(242,226,176,.6)'; ctx.lineWidth = 2 * zoom; ctx.beginPath(); ctx.arc(pos.x, pos.y - 14 * zoom, 24 * zoom, swing - .6, swing + .6); ctx.stroke();
      }
    }
  }
  // A quiet ring anchors the player when thick foliage or busy rooms fill the view.
  const playerPos = worldPosition(frame, frame.player.x, frame.player.y, width, height);
  ctx.strokeStyle = 'rgba(225,212,171,.34)'; ctx.lineWidth = zoom; ctx.beginPath(); ctx.ellipse(playerPos.x, playerPos.y + 4 * zoom, 11 * zoom, 4 * zoom, 0, 0, Math.PI * 2); ctx.stroke();
  if (frame.fishing) {
    const bob = worldPosition(frame, frame.fishing.position.x, frame.fishing.position.y, width, height);
    ctx.strokeStyle = '#d0c6a4'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(playerPos.x + 9 * zoom, playerPos.y - 19 * zoom); ctx.quadraticCurveTo((playerPos.x + bob.x) / 2, Math.min(playerPos.y, bob.y) - 22 * zoom, bob.x, bob.y); ctx.stroke();
    p(ctx, frame.fishing.phase === 'bite' ? '#f0d59d' : '#d39989', bob.x - 2 * zoom, bob.y - 6 * zoom + Math.sin(time * 3) * zoom, 4 * zoom, 7 * zoom);
    if (frame.fishing.phase === 'bite') outlined(ctx, 'REEL!', bob.x, bob.y - 25 * zoom, '#ffe6a6', 'bold 13px "DM Sans", sans-serif');
  }
  if (frame.buildPreview) {
    const preview = frame.buildPreview, pos = worldPosition(frame, preview.position.x, preview.position.y, width, height);
    ctx.save(); ctx.translate(pos.x, pos.y); ctx.scale(zoom, zoom); ctx.globalAlpha = .6;
    drawObject(ctx, { id: 'preview', kind: preview.kind, ...preview.position, solid: false }, time); ctx.restore();
    ctx.strokeStyle = preview.valid ? '#b7d397' : '#c77f7f'; ctx.lineWidth = 2; ctx.strokeRect(pos.x - 16 * zoom, pos.y - 16 * zoom, 32 * zoom, 32 * zoom);
  }
  for (const particle of frame.particles) {
    if (Math.abs(particle.x - frame.camera.x) > halfW || Math.abs(particle.y - frame.camera.y) > halfH) continue;
    const pos = worldPosition(frame, particle.x, particle.y, width, height);
    ctx.globalAlpha = Math.min(1, particle.life / Math.max(.01, particle.maxLife));
    p(ctx, particle.color, pos.x, pos.y, Math.max(1, particle.size * zoom), Math.max(1, particle.size * zoom));
  }
  ctx.globalAlpha = 1;
  // Lights subtly warm the terrain after dusk and also lend depth to indoor rooms.
  const night = scene.outdoors ? Math.max(0, Math.cos((frame.dayTime + .08) * Math.PI * 2)) * .34 : .11;
  if (night > .015) {
    ctx.fillStyle = `rgba(24,34,49,${night})`; ctx.fillRect(0, 0, width, height);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const o of visibleObjects) if (['campfire', 'lantern', 'machine'].includes(o.kind)) {
      const pos = worldPosition(frame, o.x, o.y - .3, width, height), radius = (o.kind === 'campfire' ? 85 : 52) * zoom;
      const gradient = ctx.createRadialGradient(pos.x, pos.y, 1, pos.x, pos.y, radius);
      gradient.addColorStop(0, `rgba(224,174,82,${.1 + night * .3})`); gradient.addColorStop(1, 'rgba(224,174,82,0)');
      ctx.fillStyle = gradient; ctx.fillRect(pos.x - radius, pos.y - radius, radius * 2, radius * 2);
    }
    const lamp = ctx.createRadialGradient(playerPos.x, playerPos.y - 10 * zoom, 4, playerPos.x, playerPos.y - 10 * zoom, 65 * zoom);
    lamp.addColorStop(0, 'rgba(229,202,138,.08)'); lamp.addColorStop(1, 'rgba(229,202,138,0)'); ctx.fillStyle = lamp; ctx.fillRect(playerPos.x - 65 * zoom, playerPos.y - 75 * zoom, 130 * zoom, 130 * zoom);
    ctx.restore();
  }
  if (frame.waypoint) {
    const pos = worldPosition(frame, frame.waypoint.x, frame.waypoint.y, width, height), near = Math.hypot(frame.waypoint.x - frame.player.x, frame.waypoint.y - frame.player.y) < 3;
    ctx.strokeStyle = near ? '#bccd99' : '#d6c18e'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(pos.x, pos.y, 12 * zoom, 5 * zoom, 0, 0, Math.PI * 2); ctx.stroke();
    const lift = frame.reducedMotion ? 0 : Math.sin(time * 2.2) * 3;
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y - (21 + lift) * zoom); ctx.lineTo(pos.x - 5 * zoom, pos.y - (28 + lift) * zoom); ctx.lineTo(pos.x + 5 * zoom, pos.y - (28 + lift) * zoom); ctx.closePath(); ctx.fillStyle = '#e1cc94'; ctx.fill();
    if (pos.x < 35 || pos.x > width - 35 || pos.y < 110 || pos.y > height - 100) {
      const angle = Math.atan2(pos.y - height / 2, pos.x - width / 2);
      const factor = Math.min((width / 2 - 44) / Math.max(.01, Math.abs(pos.x - width / 2)), (height / 2 - 115) / Math.max(.01, Math.abs(pos.y - height / 2)));
      const x = width / 2 + (pos.x - width / 2) * Math.max(.05, factor), y = height / 2 + (pos.y - height / 2) * Math.max(.05, factor);
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = '#dfc78e'; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -5); ctx.lineTo(-2, 0); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }
  if (frame.nearby) {
    const target = frame.nearby, pos = worldPosition(frame, target.position.x, target.position.y, width, height);
    ctx.strokeStyle = 'rgba(242,216,157,.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(pos.x, pos.y + 4 * zoom, 12 * zoom, 5 * zoom, 0, 0, Math.PI * 2); ctx.stroke();
  }
  for (const floating of frame.floating) {
    const pos = worldPosition(frame, floating.x, floating.y, width, height); ctx.globalAlpha = Math.min(1, floating.life * 2);
    outlined(ctx, floating.text, pos.x, pos.y - 36 * zoom, floating.color, `bold ${Math.max(12, 12 * zoom)}px "DM Sans", sans-serif`);
  }
  ctx.globalAlpha = 1;
  // Gentle vignette belongs to the game camera, rather than the surrounding webpage.
  const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .2, width / 2, height / 2, Math.max(width, height) * .66);
  vignette.addColorStop(0, 'rgba(19,30,23,0)'); vignette.addColorStop(1, scene.outdoors ? 'rgba(19,30,23,.22)' : 'rgba(13,20,17,.32)'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
