import type { ActorKind } from './types';

/** Original placeholder art. All dimensions are pixels; actor anchors are at their feet.
 * A future artist can replace a character with registerSpriteSheet without changing world data. */
export type SpriteSheetOptions = { frameWidth: number; frameHeight: number; columns?: number; rows?: number; feetX?: number; feetY?: number };
const replacementSheets = new Map<ActorKind, { image: HTMLImageElement; options: SpriteSheetOptions }>();
const actorCache = new Map<string, HTMLCanvasElement>();
const iconCache = new Map<string, string>();
const itemCanvasCache = new Map<string, HTMLCanvasElement>();
const portraitCache = new Map<string, string>();

export function registerSpriteSheet(kind: ActorKind, source: string, options: SpriteSheetOptions): void {
  const image = new Image();
  image.src = source;
  replacementSheets.set(kind, { image, options });
}
export function clearSpriteSheet(kind: ActorKind): void { replacementSheets.delete(kind); }

const INK = '#252c33';
const DEEP = '#283a43';
const CREAM = '#e9d8ae';
const GOLD = '#cba764';
const WHITE = '#f4edd5';
type Brush = (x: number, y: number, w: number, h: number, color: string) => void;
type Palette = { coat: string; shade: string; trim: string; face: string; faceShade: string; hair: string };
const palettes: Record<ActorKind, Palette> = {
  human: { coat: '#587b79', shade: '#35545c', trim: '#c2b692', face: '#ddae86', faceShade: '#b97d65', hair: '#53372e' },
  lady: { coat: '#763e62', shade: '#4a2b4a', trim: '#e9cf86', face: '#f1d9b1', faceShade: '#cba392', hair: '#292435' },
  gatekeeper: { coat: '#784f55', shade: '#483840', trim: '#cfa369', face: '#b8ad8c', faceShade: '#827963', hair: '#6f725a' },
  moth: { coat: '#8e7497', shade: '#65546f', trim: '#dfc89f', face: '#cab3ce', faceShade: '#a384b0', hair: '#685770' },
  hare: { coat: '#678578', shade: '#3e605c', trim: '#d5ad62', face: '#e3dac3', faceShade: '#a4a38e', hair: '#887f74' },
  ox: { coat: '#937250', shade: '#624936', trim: '#e0bb7d', face: '#936b52', faceShade: '#684f42', hair: '#423c34' },
  tortoise: { coat: '#a4c2be', shade: '#779896', trim: '#ded8b4', face: '#adb688', faceShade: '#717b65', hair: '#535e47' },
  otter: { coat: '#598b85', shade: '#3a6566', trim: '#ceb88c', face: '#aa7957', faceShade: '#715143', hair: '#715143' },
  deer: { coat: '#aa7352', shade: '#764b42', trim: '#d4c09b', face: '#b99a6d', faceShade: '#896b4e', hair: '#614f3d' },
  mole: { coat: '#9a835a', shade: '#675a4d', trim: '#dacaad', face: '#85857c', faceShade: '#62615d', hair: '#41464b' },
  peacock: { coat: '#337e82', shade: '#23585f', trim: '#dbc380', face: '#5983aa', faceShade: '#3b587d', hair: '#254151' },
  bat: { coat: '#8a4b62', shade: '#542c46', trim: '#d6b37b', face: '#aaa5b6', faceShade: '#736985', hair: '#49394f' },
  boar: { coat: '#827053', shade: '#554b42', trim: '#baa16b', face: '#ab8f77', faceShade: '#7c685d', hair: '#51453e' },
  mouse: { coat: '#ad827c', shade: '#725961', trim: '#d4b992', face: '#bcb4b2', faceShade: '#8c858d', hair: '#706b78' },
  fox: { coat: '#587487', shade: '#374957', trim: '#c9b58a', face: '#c88954', faceShade: '#935d42', hair: '#563d32' },
  heron: { coat: '#81979c', shade: '#546f80', trim: '#e6d5ab', face: '#e0e0cb', faceShade: '#9eafb3', hair: '#4d606e' },
  merchant: { coat: '#978347', shade: '#63572e', trim: '#d3bb75', face: '#bb996a', faceShade: '#857458', hair: '#6b6249' },
  salamander: { coat: '#9b7952', shade: '#655346', trim: '#d3bd82', face: '#a9bc82', faceShade: '#718b69', hair: '#58745b' },
};

function facingIndex(facing: number): number {
  const angle = ((facing % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (angle < Math.PI * .25 || angle >= Math.PI * 1.75) return 1;
  if (angle < Math.PI * .75) return 0;
  if (angle < Math.PI * 1.25) return 3;
  return 2;
}

function paintCharacter(kind: ActorKind, direction: number, step: number, blink: boolean, color?: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 48; canvas.height = 56;
  const ctx = canvas.getContext('2d')!;
  const r: Brush = (x, y, w, h, fill) => { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); };
  const p = { ...palettes[kind], ...(color ? { coat: color } : {}) };
  const back = direction === 2;
  const side = direction === 1 || direction === 3;
  const faceSide = direction === 3 ? -1 : 1;
  const bob = step === 1 || step === 3 ? -1 : 0;
  const foot = step === 1 ? 2 : step === 3 ? -2 : 0;
  const ox = kind === 'ox' || kind === 'boar';
  const bodyX = ox ? 14 : 17;
  const bodyW = ox ? 20 : 14;
  const bodyY = kind === 'heron' || kind === 'lady' ? 26 : 29;

  // Silhouettes behind the body: tails, folded wings, shells and ceremonial plumage.
  if (kind === 'fox') {
    r(side ? 10 : 29, 34, 8, 5, p.faceShade); r(side ? 8 : 31, 35, 6, 10, p.face);
    r(side ? 7 : 32, 43, 6, 3, CREAM);
  }
  if (kind === 'otter' || kind === 'mouse') {
    r(back ? 30 : 31, 40, 7, 3, p.faceShade); r(36, 39, 4, 2, kind === 'mouse' ? '#bd9294' : p.face);
  }
  if (kind === 'salamander') {
    const tailSway = step === 1 ? 1 : step === 3 ? -1 : 0;
    r(30, 38 + tailSway, 10, 4, p.hair); r(34, 36 + tailSway, 7, 5, p.faceShade);
    r(38, 31 + tailSway, 4, 7, p.faceShade); r(36, 30 + tailSway, 5, 3, p.face);
    r(34, 31 + tailSway, 3, 2, p.face); r(32, 38 + tailSway, 6, 1, '#c6d0a0');
    r(36, 36 + tailSway, 2, 2, '#b7785e'); r(39, 32 + tailSway, 2, 2, '#d7b777');
  }
  if (kind === 'moth') {
    const flap = step === 1 || step === 3 ? 2 : 0;
    for (let wy = 0; wy < 20; wy += 2) {
      const outer = wy < 6 ? 7 - Math.floor(wy / 2) : 4 + Math.floor((wy - 6) / 2);
      r(outer + flap, 26 + wy + bob, 16 - outer, 2, '#514456');
      r(outer + 1 + flap, 26 + wy + bob, 15 - outer, 2, '#a28ba8');
      r(32 - flap, 26 + wy + bob, 16 - outer, 2, '#514456');
      r(32 - flap, 26 + wy + bob, 15 - outer, 2, '#a28ba8');
    }
    r(10 + flap, 28 + bob, 5, 12, '#c3a9bd'); r(9 + flap, 35 + bob, 4, 4, '#725e81'); r(10 + flap, 36 + bob, 2, 2, '#e1c8b7');
    r(33 - flap, 28 + bob, 5, 12, '#c3a9bd'); r(35 - flap, 35 + bob, 4, 4, '#725e81'); r(36 - flap, 36 + bob, 2, 2, '#e1c8b7');
  }
  if (kind === 'tortoise') {
    r(12, 27 + bob, 24, 17, '#344c44'); r(13, 28 + bob, 22, 15, '#647854');
    r(16, 27 + bob, 16, 17, '#768863'); r(17, 30 + bob, 6, 6, '#87946c');
    r(24, 30 + bob, 7, 6, '#4e6447'); r(19, 37 + bob, 10, 5, '#4e6447');
  }
  if (kind === 'peacock') {
    r(8, 25 + bob, 32, 14, '#285b58'); r(11, 21 + bob, 26, 19, '#317466');
    r(15, 18 + bob, 18, 20, '#50917a');
    for (const [px, py] of [[12, 27], [18, 23], [27, 23], [33, 27], [22, 32]]) {
      r(px, py + bob, 5, 7, '#b7ad65'); r(px + 1, py + bob + 1, 3, 4, '#4d858a'); r(px + 2, py + bob + 2, 1, 2, '#243d5b');
    }
  }
  if (kind === 'heron') {
    r(14, 29 + bob, 5, 18, '#607b8a'); r(30, 29 + bob, 4, 18, '#607b8a');
    r(13, 30 + bob, 3, 13, '#b8c5c1'); r(33, 31 + bob, 2, 12, '#b8c5c1');
  }

  // Trouser legs and shoes, alternating stride rather than translating a static cutout.
  r(18, 41, 5, 9 + foot, DEEP); r(25, 41, 5, 9 - foot, DEEP);
  r(17, 49 + foot, 7, 3, '#302d30'); r(25, 49 - foot, 7, 3, '#302d30');
  r(18, 49 + foot, 5, 1, '#696453'); r(26, 49 - foot, 5, 1, '#696453');
  if (kind === 'heron') { r(19, 43, 2, 9 + foot, '#ba9467'); r(27, 43, 2, 9 - foot, '#ba9467'); }
  if (kind === 'lady') {
    r(13, 37 + bob, 23, 14 - bob, INK); r(15, 37 + bob, 19, 15 - bob, p.shade);
    r(18, 38 + bob, 13, 15 - bob, p.coat); r(21, 38 + bob, 2, 14 - bob, '#a16a89');
    r(14, 49, 21, 2, p.trim); r(16, 47, 2, 2, GOLD); r(32, 47, 2, 2, GOLD);
  }

  // Outlined garments, seams, lapels, belts and hands.
  r(bodyX - 1, bodyY + bob, bodyW + 2, 15, INK);
  r(bodyX, bodyY + bob, bodyW, 14, p.shade);
  r(bodyX + 2, bodyY + bob, bodyW - 4, 12, p.coat);
  r(bodyX + 2, bodyY + bob, bodyW - 4, 2, p.trim);
  r(bodyX + 1, bodyY + 12 + bob, bodyW - 2, 2, '#534942');
  r(23, bodyY + 12 + bob, 3, 2, GOLD);
  if (!back) {
    r(23, bodyY + 3 + bob, 1, 8, p.shade);
    r(25, bodyY + 4 + bob, 1, 1, p.trim); r(25, bodyY + 7 + bob, 1, 1, p.trim);
    r(18, bodyY + 8 + bob, 3, 3, p.shade); r(28, bodyY + 8 + bob, 2, 3, p.shade);
  } else {
    r(23, bodyY + 3 + bob, 1, 8, p.shade); r(21, bodyY + 4 + bob, 5, 4, p.trim); r(22, bodyY + 5 + bob, 3, 2, p.coat);
  }
  const armA = step === 1 ? -2 : step === 3 ? 2 : 0;
  r(bodyX - 3, bodyY + 2 + bob + armA, 4, 9, p.shade);
  r(bodyX + bodyW - 1, bodyY + 2 + bob - armA, 4, 9, p.shade);
  r(bodyX - 3, bodyY + 10 + bob + armA, 4, 3, p.face);
  r(bodyX + bodyW - 1, bodyY + 10 + bob - armA, 4, 3, p.face);

  // Every species has its own head silhouette and facial markings.
  let headY = 16 + bob;
  if (kind === 'heron') headY = 10 + bob;
  if (kind === 'lady') headY = 13 + bob;
  const headX = ox ? 13 : 16;
  const headW = ox ? 22 : 16;
  r(headX + 2, headY - 1, headW - 4, 1, INK);
  r(headX, headY + 2, headW, 11, INK);
  r(headX + 1, headY, headW - 2, 14, INK);
  r(headX + 2, headY + 1, headW - 4, 12, p.faceShade);
  r(headX + 3, headY + 2, headW - 6, 9, p.face);
  r(headX + 4, headY + 3, headW - 8, 2, '#ffffff18');
  if (kind === 'human' || kind === 'lady') {
    r(16, headY, 16, 4, p.hair); r(17, headY - 2, 13, 3, p.hair);
    r(16, headY + 3, 3, 6, p.hair); r(30, headY + 3, 2, kind === 'lady' ? 16 : 5, p.hair);
    if (kind === 'lady') { r(14, headY + 3, 3, 17, p.hair); r(18, headY - 3, 13, 2, GOLD); r(19, headY - 6, 2, 4, p.trim); r(24, headY - 7, 2, 5, p.trim); r(29, headY - 6, 2, 4, p.trim); r(24, headY - 4, 2, 2, '#d87383'); }
  }
  if (kind === 'hare') {
    r(16, headY - 13, 5, 15, INK); r(17, headY - 12, 3, 14, p.face);
    r(18, headY - 9, 1, 10, '#bc9795');
    r(27, headY - 12, 5, 14, INK); r(28, headY - 11, 3, 13, p.face);
    r(29, headY - 8, 1, 9, '#bc9795');
  }
  if (kind === 'fox' || kind === 'gatekeeper' || kind === 'boar') {
    r(headX + 1, headY - 4, 5, 6, INK); r(headX + 2, headY - 3, 3, 4, p.face);
    r(headX + headW - 6, headY - 4, 5, 6, INK); r(headX + headW - 5, headY - 3, 3, 4, p.face);
    if (kind === 'fox') { r(headX + 3, headY - 2, 2, 3, '#dfad90'); r(headX + headW - 5, headY - 2, 2, 3, '#dfad90'); }
  }
  if (kind === 'mouse' || kind === 'merchant' || kind === 'otter') {
    r(12, headY - 2, 7, 7, p.faceShade); r(13, headY - 1, 5, 5, kind === 'otter' ? p.face : '#c59fa5');
    r(29, headY - 2, 7, 7, p.faceShade); r(30, headY - 1, 5, 5, kind === 'otter' ? p.face : '#c59fa5');
  }
  if (kind === 'deer' || kind === 'ox') {
    const hy = kind === 'deer' ? headY - 9 : headY - 4;
    r(headX - 3, hy, 3, kind === 'deer' ? 11 : 7, p.trim); r(headX + headW, hy, 3, kind === 'deer' ? 11 : 7, p.trim);
    r(headX - 5, hy - 2, 3, 5, p.trim); r(headX + headW + 2, hy - 2, 3, 5, p.trim);
    if (kind === 'deer') { r(headX - 6, hy + 1, 5, 2, p.trim); r(headX + headW + 1, hy + 1, 5, 2, p.trim); r(headX - 2, hy - 3, 2, 5, p.trim); r(headX + headW, hy - 3, 2, 5, p.trim); }
    r(headX - 1, headY + 2, 4, 4, p.face); r(headX + headW - 3, headY + 2, 4, 4, p.face);
  }
  if (kind === 'moth') {
    r(19, headY - 6, 1, 6, p.faceShade); r(17, headY - 7, 3, 2, p.trim);
    r(28, headY - 6, 1, 6, p.faceShade); r(28, headY - 7, 3, 2, p.trim);
    r(19, headY + 1, 9, 2, '#ead4c0');
  }
  if (kind === 'salamander') {
    // A gentle amphibian face framed by fine, warm gills, rather than mammal ears.
    r(14, headY - 2, 2, 11, p.faceShade); r(32, headY - 2, 2, 11, p.faceShade);
    for (const [gx, gy, gw] of [[11, -2, 5], [9, 2, 7], [10, 7, 6]]) {
      r(gx, headY + gy, gw, 2, '#a75e54'); r(gx + 1, headY + gy, gw - 1, 1, '#dfb879');
      r(48 - gx - gw, headY + gy, gw, 2, '#a75e54'); r(48 - gx - gw, headY + gy, gw - 1, 1, '#dfb879');
    }
    r(15, headY + 1, 2, 10, p.faceShade); r(31, headY + 1, 2, 10, p.faceShade);
    r(19, headY + 2, 10, 2, '#c7d19c');
  }
  if (kind === 'heron') {
    r(19, headY + 10, 10, 8, INK); r(20, headY + 11, 8, 9, p.face);
    r(21, headY + 19, 6, 2, p.faceShade); r(21, headY - 5, 2, 6, p.hair);
    r(23, headY - 7, 2, 7, p.hair); r(25, headY - 5, 2, 6, p.hair);
  }
  if (kind === 'peacock') { r(23, headY - 8, 2, 7, p.trim); r(19, headY - 8, 3, 3, '#588f9a'); r(23, headY - 10, 3, 3, '#72aaac'); r(27, headY - 8, 3, 3, '#588f9a'); }

  if (back) {
    r(headX + 2, headY + 2, headW - 4, 9, p.hair);
    r(headX + 4, headY + 3, headW - 8, 2, p.faceShade);
  } else {
    const eyeY = headY + 6;
    if (kind === 'gatekeeper') {
      r(17, headY + 3, 6, 7, CREAM); r(25, headY + 3, 6, 7, CREAM);
      r(18, headY + 4, 4, 4, '#5d7567'); r(26, headY + 4, 4, 4, '#5d7567');
    }
    if (kind === 'fox' || kind === 'otter' || kind === 'ox' || kind === 'boar' || kind === 'hare' || kind === 'mouse') {
      r(side ? 23 + faceSide * 4 : 20, headY + 8, side ? 9 : 8, 5, kind === 'fox' || kind === 'hare' ? CREAM : p.faceShade);
      r(side ? 29 + faceSide * 2 : 23, headY + 9, 3, 2, kind === 'mouse' || kind === 'hare' ? '#b98591' : '#3b3734');
      if (kind === 'ox' || kind === 'boar') { r(18, headY + 8, 13, 5, '#bd9579'); r(20, headY + 10, 2, 1, p.faceShade); r(27, headY + 10, 2, 1, p.faceShade); }
      if (kind === 'otter') { r(14, headY + 9, 5, 1, CREAM); r(29, headY + 9, 5, 1, CREAM); }
    }
    if (kind === 'heron' || kind === 'peacock' || kind === 'gatekeeper') {
      r(side ? (faceSide > 0 ? 29 : 11) : 23, headY + 8, side ? 9 : 3, 3, '#d6ac67');
      r(side ? (faceSide > 0 ? 37 : 10) : 24, headY + 9, 1, 2, '#986844');
    }
    if (blink) { r(side ? (faceSide > 0 ? 28 : 19) : 19, eyeY + 1, 3, 1, INK); if (!side) r(27, eyeY + 1, 3, 1, INK); }
    else {
      r(side ? (faceSide > 0 ? 28 : 19) : 19, eyeY, 2, 3, INK);
      r(side ? (faceSide > 0 ? 28 : 19) : 19, eyeY, 1, 1, WHITE);
      if (!side) { r(27, eyeY, 2, 3, INK); r(27, eyeY, 1, 1, WHITE); }
    }
    if (kind === 'mole' || kind === 'fox') {
      r(17, eyeY - 1, 6, 1, GOLD); r(17, eyeY + 3, 6, 1, GOLD); r(16, eyeY, 1, 3, GOLD); r(23, eyeY, 1, 3, GOLD);
      if (kind === 'mole') { r(25, eyeY - 1, 6, 1, GOLD); r(25, eyeY + 3, 6, 1, GOLD); r(24, eyeY, 1, 3, GOLD); r(31, eyeY, 1, 3, GOLD); }
    }
    if (kind === 'human' || kind === 'lady' || kind === 'moth') { r(23, headY + 10, 2, 1, '#a96e72'); r(21, headY + 9, 1, 1, '#db9b8c'); }
    if (kind === 'salamander') { r(20, headY + 9, 8, 3, '#c0ce96'); r(21, headY + 9, 1, 1, p.hair); r(27, headY + 9, 1, 1, p.hair); r(23, headY + 12, 3, 1, '#64755c'); }
  }

  // Personality props: stamps, books, instruments, a borrowed-light lantern.
  if (kind === 'human') {
    r(34, 35 - armA, 1, 4, GOLD); r(32, 37 - armA, 6, 8, INK); r(33, 38 - armA, 4, 6, '#bd934b');
    r(34, 39 - armA, 2, 4, '#ffe5a1'); r(34, 40 - armA, 1, 2, '#fff6cf'); r(32, 36 - armA, 6, 1, GOLD);
  }
  if (kind === 'hare') { r(31, 38 - armA, 5, 5, GOLD); r(32, 39 - armA, 3, 3, CREAM); r(33, 39 - armA, 1, 2, INK); }
  if (kind === 'mole' || kind === 'merchant') { r(12, 37 + armA, 7, 8, '#c4b98b'); r(13, 38 + armA, 5, 6, '#eee0b3'); r(14, 40 + armA, 3, 1, '#8e8070'); }
  if (kind === 'fox') { r(29, 37 - armA, 7, 8, '#365c67'); r(30, 38 - armA, 2, 6, GOLD); r(33, 39 - armA, 2, 4, '#d9c695'); }
  if (kind === 'tortoise') { r(20, bodyY + 4 + bob, 7, 1, WHITE); r(23, bodyY + 1 + bob, 1, 7, WHITE); r(30, 39 - armA, 4, 5, '#506c6d'); }
  if (kind === 'ox') { r(18, bodyY + 1 + bob, 3, 7, '#a46a6e'); r(27, bodyY + 1 + bob, 3, 9, '#a46a6e'); }
  if (kind === 'gatekeeper') {
    r(13, headY - 1, 23, 3, p.shade); r(17, headY - 5, 15, 5, p.coat); r(18, headY - 2, 13, 1, GOLD); r(23, headY - 4, 4, 2, GOLD);
    r(35, 28, 2, 21, '#8e7854'); r(33, 25, 6, 5, GOLD); r(34, 26, 4, 2, CREAM);
  }
  if (kind === 'lady') { r(36, 26, 2, 25, GOLD); r(34, 22, 6, 5, GOLD); r(35, 23, 4, 3, '#d27896'); r(24, bodyY + 5 + bob, 3, 3, '#d27896'); }
  if (kind === 'moth') { r(11, 37 + armA, 6, 8, '#dcc49d'); r(12, 38 + armA, 4, 6, '#f3dfba'); r(13, 40 + armA, 2, 1, '#b59b89'); }
  return canvas;
}

function paintBat(step: number, back: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = 48; canvas.height = 56;
  const ctx = canvas.getContext('2d')!;
  const r: Brush = (x, y, w, h, fill) => { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); };
  const lift = [0, -3, -1, 2][step];
  // Scalloped membrane wings remain visible at every animation phase.
  r(2, 27 + lift, 17, 3, '#382c43'); r(4, 30 + lift, 15, 6, '#58435c');
  r(7, 36 + lift, 12, 5, '#74536e'); r(12, 41 + lift, 7, 3, '#4c354e');
  r(2, 26 + lift, 3, 7, '#9c8196'); r(5, 28 + lift, 9, 1, '#9c8196');
  r(10, 30 + lift, 1, 8, '#ad8b9f'); r(15, 29 + lift, 1, 12, '#ad8b9f');
  r(29, 27 + lift, 17, 3, '#382c43'); r(29, 30 + lift, 15, 6, '#58435c');
  r(29, 36 + lift, 12, 5, '#74536e'); r(29, 41 + lift, 7, 3, '#4c354e');
  r(43, 26 + lift, 3, 7, '#9c8196'); r(34, 28 + lift, 9, 1, '#9c8196');
  r(37, 30 + lift, 1, 8, '#ad8b9f'); r(32, 29 + lift, 1, 12, '#ad8b9f');
  r(18, 26, 12, 18, INK); r(19, 27, 10, 15, '#704456'); r(22, 28, 4, 13, '#a56372');
  r(19, 28, 3, 2, GOLD); r(26, 28, 3, 2, GOLD); r(20, 42, 3, 4, '#82758d'); r(26, 42, 3, 4, '#82758d');
  r(17, 15, 5, 11, '#5d4a6f'); r(26, 15, 5, 11, '#5d4a6f');
  r(18, 16, 3, 7, '#bd969e'); r(27, 16, 3, 7, '#bd969e');
  r(17, 21, 14, 12, INK); r(18, 22, 12, 10, '#9e93af'); r(20, 23, 8, 8, '#bdb0c0');
  if (!back) {
    r(19, 25, 3, 2, '#272836'); r(26, 25, 3, 2, '#272836'); r(20, 25, 1, 1, '#f0da9f'); r(27, 25, 1, 1, '#f0da9f');
    r(21, 29, 6, 1, '#593344'); r(21, 30, 1, 2, WHITE); r(26, 30, 1, 2, WHITE);
    r(21, 35, 6, 6, GOLD); r(22, 36, 4, 4, '#ede0b8'); r(24, 36, 1, 3, '#59435d');
  }
  r(20, 17, 8, 2, GOLD); r(21, 14, 2, 4, GOLD); r(25, 14, 2, 4, GOLD);
  return canvas;
}

export function drawActorSprite(ctx: CanvasRenderingContext2D, kind: ActorKind, xScreen: number, yScreen: number, facing: number, moving: boolean, animation: number, time: number, scale = 1, color?: string): void {
  const direction = facingIndex(facing);
  const sheet = replacementSheets.get(kind);
  if (sheet?.image.complete && sheet.image.naturalWidth) {
    const o = sheet.options;
    const frame = moving ? Math.floor(animation * 8) % (o.columns ?? 4) : 0;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet.image, frame * o.frameWidth, (direction % (o.rows ?? 4)) * o.frameHeight, o.frameWidth, o.frameHeight,
      Math.round(xScreen - (o.feetX ?? o.frameWidth / 2) * scale), Math.round(yScreen - (o.feetY ?? o.frameHeight - 2) * scale), o.frameWidth * scale, o.frameHeight * scale);
    return;
  }
  const walk = moving || kind === 'bat' ? Math.floor((moving ? animation : time) * (kind === 'bat' ? 9 : 7)) % 4 : 0;
  const blink = !moving && (Math.floor(time * 8) % 57 === 0);
  const key = `${kind}:${direction}:${walk}:${blink ? 1 : 0}:${color || ''}`;
  let sprite = actorCache.get(key);
  if (!sprite) { sprite = kind === 'bat' ? paintBat(walk, direction === 2) : paintCharacter(kind, direction, walk, blink, color); actorCache.set(key, sprite); }
  const idleBob = moving || kind === 'lady' ? 0 : Math.floor(Math.sin(time * 2.3) * .6);
  const flight = kind === 'bat' ? Math.round(Math.sin(time * 5) * 2) - 4 : 0;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, Math.round(xScreen - 24 * scale), Math.round(yScreen - 52 * scale + (idleBob + flight) * scale), 48 * scale, 56 * scale);
}

function makeItemCanvas(id: string): HTMLCanvasElement {
  const cached = itemCanvasCache.get(id); if (cached) return cached;
  const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const r: Brush = (x, y, w, h, fill) => { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); };
  const line = (x1: number, y1: number, x2: number, y2: number, fill: string, thickness = 1) => {
    ctx.strokeStyle = fill; ctx.lineWidth = thickness; ctx.lineCap = 'square'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  };
  const paper = (seal = '#aa626f') => { r(8, 5, 17, 23, '#6a6252'); r(7, 4, 17, 23, '#d9c79c'); r(9, 6, 13, 19, '#f1e1b7'); r(11, 9, 9, 1, '#b09f80'); r(11, 12, 8, 1, '#b09f80'); r(11, 15, 7, 1, '#b09f80'); r(17, 19, 5, 5, seal); r(18, 20, 3, 3, '#ddad94'); };
  const book = (cover = '#497379') => { r(7, 5, 19, 23, '#2e4048'); r(8, 6, 16, 20, cover); r(10, 6, 2, 20, GOLD); r(13, 9, 8, 1, CREAM); r(13, 19, 8, 1, CREAM); r(16, 11, 3, 6, GOLD); r(12, 26, 12, 1, '#ead7b3'); };
  const plant = (willow = false) => {
    r(15, 11, 2, 17, '#85754a'); r(14, 25, 5, 3, '#655943');
    for (const [x, y] of [[9, 8], [17, 5], [5, 13], [17, 12], [9, 19], [19, 18]]) {
      r(x, y, 7, 3, '#4c7861'); r(x + 1, y, 5, 1, '#8cab7b');
      if (willow) { r(x + 1, y + 3, 2, 6, '#719174'); r(x + 4, y + 2, 1, 5, '#577e69'); }
    }
  };
  if (id.includes('axe')) {
    line(9, 27, 21, 7, '#554738', 4); line(9, 26, 21, 7, '#b39867', 2);
    r(13, 5, 8, 9, '#3b525b'); r(14, 5, 10, 8, '#8ba6a4'); r(15, 6, 10, 5, '#d0d3bf'); r(24, 6, 2, 7, '#aec7c0'); r(19, 10, 4, 5, '#5f797f');
  } else if (id.includes('pick')) {
    line(8, 28, 20, 6, '#5c4c3e', 4); line(8, 27, 20, 6, '#b6a06e', 2);
    r(10, 5, 13, 4, '#637d89'); r(7, 8, 6, 3, '#a8bab8'); r(5, 11, 4, 3, '#d4d4bf'); r(21, 8, 5, 3, '#a8bab8'); r(25, 11, 3, 4, '#d4d4bf');
  } else if (id.includes('rod')) {
    line(7, 27, 21, 5, '#705437', 3); line(7, 26, 21, 5, '#bd9d64', 1);
    line(22, 5, 26, 21, '#d7dfc9'); r(24, 21, 4, 3, '#b96866'); r(25, 24, 2, 3, '#e7d5b3'); r(8, 22, 4, 3, '#648485');
  } else if (id.includes('cane') || id.includes('sword')) {
    r(13, 7, 3, 21, '#b49763'); r(14, 8, 1, 20, '#e0c487'); r(13, 4, 9, 4, '#97754e'); r(18, 6, 5, 5, '#97754e'); r(19, 6, 2, 3, '#e0c487'); r(12, 27, 5, 2, '#516268');
  } else if (id.includes('lantern')) {
    r(12, 3, 8, 1, GOLD); r(10, 4, 2, 7, GOLD); r(20, 4, 2, 7, GOLD);
    r(8, 10, 16, 17, '#3d4d51'); r(10, 12, 12, 13, '#b39353'); r(12, 13, 8, 11, '#ffe1a0'); r(14, 15, 4, 7, '#fff5c2'); r(15, 18, 2, 5, '#efaf61'); r(8, 10, 16, 2, GOLD); r(8, 26, 16, 2, GOLD); r(15, 11, 2, 16, '#9b784a');
  } else if (id.includes('soup') || id.includes('stew')) {
    r(6, 16, 21, 3, '#445d66'); r(8, 18, 17, 7, '#719596'); r(10, 25, 13, 2, '#b3c4ba'); r(7, 14, 19, 5, '#b68e5b'); r(9, 15, 15, 3, '#d6af72'); r(11, 15, 3, 2, '#66875e'); r(18, 15, 3, 2, '#bb785b'); r(12, 6, 1, 5, '#d7d4b4'); r(17, 8, 1, 5, '#d7d4b4'); r(22, 5, 1, 6, '#d7d4b4');
  } else if (id === 'tea') {
    r(8, 13, 15, 12, '#5c7778'); r(9, 14, 13, 9, '#bdc7ae'); r(10, 12, 11, 3, '#8b9965'); r(11, 12, 9, 1, '#d2d3a6');
    r(23, 15, 5, 2, '#bdc7ae'); r(26, 16, 2, 5, '#bdc7ae'); r(23, 20, 5, 2, '#bdc7ae'); r(7, 25, 18, 2, '#d8d7b6');
    r(12, 4, 1, 5, '#d7d4b4'); r(17, 6, 1, 4, '#d7d4b4');
  } else if (id === 'carrot') {
    r(12, 10, 10, 6, '#d28d56'); r(13, 15, 8, 6, '#e7aa68'); r(14, 20, 6, 4, '#d28d56'); r(15, 24, 3, 4, '#d28d56');
    r(14, 12, 5, 1, '#f4c88e'); r(16, 18, 5, 1, '#b57149'); r(14, 22, 3, 1, '#b57149');
    r(16, 4, 2, 7, '#69947b'); r(12, 3, 3, 6, '#8aae79'); r(20, 3, 3, 6, '#8aae79'); r(18, 7, 5, 2, '#69947b');
  } else if (id.includes('fish')) {
    r(7, 12, 16, 10, '#4b717c'); r(5, 15, 20, 4, '#7097a0'); r(9, 13, 12, 3, '#b2cebd'); r(25, 11, 4, 5, '#8aacaf'); r(25, 20, 4, 4, '#8aacaf'); r(22, 14, 4, 7, '#577a82'); r(8, 16, 2, 2, INK); r(8, 16, 1, 1, WHITE); r(13, 9, 6, 3, '#91abad'); r(13, 22, 6, 3, '#91abad'); r(17, 16, 1, 5, '#4b717c');
  } else if (id.includes('willow') || id.includes('sapling') || id.includes('herb') || id.includes('flower')) {
    if (id.includes('verse')) paper('#73967e'); else plant(id.includes('willow'));
    if (id.includes('flower')) { r(11, 3, 8, 8, '#d99caf'); r(9, 5, 12, 4, '#d99caf'); r(13, 5, 4, 4, '#f1d18c'); }
  } else if (id.includes('wood') || id.includes('log')) {
    r(5, 16, 20, 9, '#7c5d42'); r(6, 15, 19, 7, '#ab8456'); r(7, 16, 3, 5, '#d6b482'); r(11, 18, 11, 1, '#7c5d42'); r(7, 6, 20, 9, '#6f533f'); r(8, 5, 19, 7, '#bd9867'); r(9, 6, 3, 5, '#e0bf8a'); r(15, 8, 10, 1, '#8c6946');
  } else if (id.includes('stone') || id.includes('ore') || id.includes('iron') || id.includes('coal')) {
    r(7, 12, 21, 13, '#475962'); r(9, 8, 17, 17, '#788b8e'); r(13, 6, 10, 4, '#aeb5a6'); r(10, 12, 8, 5, '#aeb5a6'); r(20, 16, 7, 7, '#596e78');
    if (id.includes('ore') || id.includes('iron')) { r(13, 11, 4, 4, '#c9915b'); r(20, 16, 4, 4, '#c9915b'); r(14, 12, 2, 2, '#e4b67c'); }
  } else if (id.includes('brain')) {
    const brain = id.includes('blank') ? '#c6c6b3' : '#bd8296';
    r(7, 10, 18, 14, '#5b4d64'); r(5, 13, 22, 8, brain); r(9, 7, 14, 19, brain); r(16, 8, 1, 17, '#785f79'); r(8, 13, 5, 1, '#e3b5bd'); r(9, 19, 5, 1, '#8f687e'); r(20, 11, 3, 1, '#e3b5bd'); r(19, 16, 6, 1, '#8f687e'); r(20, 21, 3, 1, '#e3b5bd');
  } else if (id.includes('switch')) {
    r(6, 12, 20, 15, '#3d3f52'); r(8, 14, 16, 11, '#8b728e'); r(9, 23, 14, 2, GOLD); r(15, 7, 3, 12, '#cbbb99'); r(12, 5, 8, 5, '#cb9cbb'); r(13, 6, 6, 2, '#f2cee0'); r(9, 16, 2, 2, '#c6d4a8'); r(21, 16, 2, 2, '#cf826f');
  } else if (id.includes('coupon') || id.includes('time_glass') || id.includes('timeglass') || id === 'time') {
    if (id.includes('coupon')) { paper('#a7799e'); r(12, 8, 7, 7, '#b99879'); r(13, 9, 5, 4, '#e6c598'); r(14, 13, 3, 1, '#bd667d'); }
    else { r(8, 4, 16, 3, GOLD); r(8, 25, 16, 3, GOLD); r(10, 7, 12, 5, '#8aa6a8'); r(12, 12, 8, 3, '#b1c9c4'); r(15, 15, 2, 3, '#e9cd8d'); r(12, 18, 8, 4, '#b1c9c4'); r(10, 22, 12, 3, '#8aa6a8'); r(12, 7, 8, 3, '#f0d297'); r(12, 23, 8, 2, '#f0d297'); }
  } else if (id.includes('campfire') || id.includes('fire')) {
    r(6, 24, 19, 3, '#88633f'); r(8, 26, 17, 2, '#be9360'); r(9, 18, 15, 7, '#bf704b'); r(12, 12, 10, 12, '#e6aa54'); r(15, 6, 4, 14, '#f0c76d'); r(13, 17, 7, 7, '#ffedaf'); r(10, 21, 4, 5, '#f4cb73');
  } else if (id.includes('bench') || id.includes('workbench')) {
    r(5, 12, 23, 5, '#b69762'); r(7, 7, 19, 3, '#c6ad78'); r(8, 9, 2, 13, '#715539'); r(22, 9, 2, 13, '#715539'); r(6, 18, 20, 4, '#9a7c52'); r(9, 22, 3, 6, '#6c5841'); r(21, 22, 3, 6, '#6c5841');
  } else if (id.includes('lullaby') || id.includes('music')) {
    paper('#739a9c'); r(17, 8, 2, 10, '#52737c'); r(13, 16, 5, 3, '#52737c'); r(17, 8, 5, 2, '#52737c');
  } else if (id.includes('ticket')) {
    r(5, 11, 23, 13, '#665067'); r(6, 10, 21, 13, '#b789ac'); r(7, 11, 19, 11, '#dbc492'); r(9, 13, 3, 7, '#b18a8f'); r(18, 13, 6, 1, '#936b87'); r(18, 16, 6, 1, '#936b87'); r(18, 19, 6, 1, '#936b87'); r(14, 11, 1, 11, '#b18a8f');
  } else if (id.includes('ledger') || id.includes('protocol') || id.includes('book')) book(id.includes('protocol') ? '#976e88' : '#497379');
  else if (id.includes('token') || id.includes('heart')) {
    r(7, 9, 8, 10, '#b26e84'); r(17, 9, 8, 10, '#b26e84'); r(9, 17, 14, 5, '#b26e84'); r(12, 22, 8, 3, '#b26e84'); r(15, 25, 2, 2, '#b26e84'); r(9, 10, 4, 2, '#e4adbc'); r(18, 10, 4, 2, '#e4adbc');
  } else if (id.includes('bandage')) {
    r(6, 11, 21, 11, '#c0ad8e'); r(7, 10, 19, 11, '#eee1c1'); r(13, 11, 7, 9, '#bc9a7d'); r(15, 13, 3, 5, '#f0ddbb'); r(14, 14, 5, 3, '#f0ddbb');
  } else if (id.includes('mushroom')) {
    r(13, 18, 6, 9, '#e3d3ad'); r(10, 8, 12, 13, '#a77174'); r(6, 13, 20, 8, '#bc8786'); r(10, 11, 4, 3, '#eee1bb'); r(18, 14, 4, 3, '#eee1bb');
  } else if (id.includes('worm')) { r(7, 11, 4, 10, '#d3a392'); r(10, 19, 12, 4, '#d3a392'); r(20, 12, 4, 10, '#d3a392'); r(20, 9, 4, 4, '#e4b6a1'); r(21, 10, 1, 1, '#463f46'); }
  else if (id.includes('refusal') || id.includes('paper') || id.includes('permit') || id.includes('identity')) paper(id.includes('permit') ? '#689380' : '#ad6378');
  else {
    r(8, 12, 17, 16, '#5f6453'); r(9, 13, 15, 13, '#ab925d'); r(11, 14, 11, 11, '#c9af73'); r(12, 8, 10, 4, '#e6c68b'); r(13, 5, 8, 4, '#ab925d'); r(14, 12, 6, 2, '#665747'); r(15, 18, 4, 5, '#efdc9f');
  }
  itemCanvasCache.set(id, canvas); return canvas;
}

export function drawItemIcon(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, size: number): void {
  if (!id) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(makeItemCanvas(id), Math.round(x), Math.round(y), size, size);
}

export function itemIconDataUrl(id: string, size = 32): string {
  if (typeof document === 'undefined') return '';
  const key = `${id}:${size}`;
  const cached = iconCache.get(key); if (cached) return cached;
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  drawItemIcon(canvas.getContext('2d')!, id, 0, 0, size);
  const url = canvas.toDataURL('image/png'); iconCache.set(key, url); return url;
}

/** A self-contained pixel portrait for dialogue and the player-status panel. */
export function actorPortraitDataUrl(kind: ActorKind, size = 64): string {
  if (typeof document === 'undefined') return '';
  const key = `${kind}:${size}`;
  const cached = portraitCache.get(key); if (cached) return cached;
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#324945'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#597267'; ctx.fillRect(Math.round(size * .12), Math.round(size * .12), Math.round(size * .76), Math.round(size * .76));
  const scale = size / 34;
  drawActorSprite(ctx, kind, size / 2, size * 1.42, Math.PI / 2, false, 0, 2, scale);
  const url = canvas.toDataURL('image/png'); portraitCache.set(key, url); return url;
}
