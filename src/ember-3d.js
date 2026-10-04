// An actual low-poly world, built from the same authored village footprints as
// the pixel-art prototype. All dimensions are simulation pixels, including up.
import { EMBER_LAYOUT } from './ember-world.js';

const C = {
  grass: '#89b96c', forest: '#77a568', marsh: '#8cb394', mountainGrass: '#a5b47c',
  dirt: '#d7bf90', road: '#e8cfa0', stone: '#b5baa1', stoneLight: '#d3d1b4', stoneShade: '#899b88',
  wood: '#a7845c', woodLight: '#c5a275', cream: '#eee0b8', plaster: '#f5e5b9',
  roof: '#df854c', roofLight: '#efa261', roofShade: '#be6f42', tile: '#cf7b49',
  navy: '#3f6482', blue: '#739aa7', green: '#427f57', leaf: '#669c64', leafLight: '#8bb775',
  cedar: '#397553', cedarLight: '#528966', bamboo: '#94b871', water: '#65c3c4', foam: '#c8e7d8',
  paper: '#fff0c7', gold: '#f6c57b', red: '#c97151', glass: '#93b9b0', metal: '#819e9c',
};

function crest(k, x, y, elevation, color = C.paper, scale = 1) {
  // A geometric reed/leaf seal, built into the facade rather than an outline.
  k.box(x - 3 * scale, y, 6 * scale, 1.5, 17 * scale, color, elevation);
  k.box(x - 10 * scale, y, 9 * scale, 1.5, 4 * scale, color, elevation + 9 * scale);
  k.box(x + 2 * scale, y, 8 * scale, 1.5, 4 * scale, color, elevation + 4 * scale);
  k.box(x - 8 * scale, y, 16 * scale, 1.5, 4 * scale, color, elevation);
}

function facadeWindow(k, x, y, elevation, width = 27, height = 34) {
  k.box(x, y, width, 2, height, C.glass, elevation);
  k.box(x, y + 1, width, 1, 3, C.paper, elevation + height - 4);
  for (let xx = x + 6; xx < x + width - 3; xx += 8) k.box(xx, y + 2, 2, 1, height, C.cream, elevation);
  k.box(x, y + 2, width, 1, 2, C.cream, elevation + height / 2);
  k.box(x - 2, y, width + 4, 5, 3, C.woodLight, elevation - 3);
}

function roofTiles(k, x, y, width, depth, height, elevation, color = C.roof) {
  k.roof(x - 10, y - 9, width + 20, depth + 18, height, color, elevation);
  // Long ceramic ridges sit on the two slopes. Deliberately bounded detail:
  // only a few broad tile courses per building, all batched by the kit.
  for (let i = 1; i < 5; i++) {
    const q = i / 5;
    const xx = x - 10 + (width + 20) * q;
    const top = elevation + height * (1 - Math.abs(q * 2 - 1));
    k.box(xx, y - 9, 2.5, depth + 18, 2, C.roofLight, top);
  }
  k.box(x - 13, y - 12, 10, depth + 24, 6, C.roofShade, elevation - 3);
  k.box(x + width + 3, y - 12, 10, depth + 24, 6, C.roofShade, elevation - 3);
  k.box(x + width / 2 - 5, y - 13, 10, depth + 26, 6, C.roofLight, elevation + height - 1);
}

function door(k, x, y, width, elevation = 0, tall = 54) {
  // The near edge lies on the collision boundary; the approach remains clear.
  k.box(x - width / 2, y, width, 2, tall, C.wood, elevation);
  k.box(x - width / 2 + 3, y + 2, width - 6, 1, tall - 5, C.woodLight, elevation + 2);
  for (let xx = x - width / 2 + 8; xx < x + width / 2; xx += 8) k.box(xx, y + 3, 1.5, 1, tall - 7, C.cream, elevation + 3);
  k.box(x - 1, y + 3, 2, 1, tall, C.wood, elevation);
  k.box(x - 4, y + 4, 2, 2, 3, C.gold, elevation + 24);
  k.box(x + 2, y + 4, 2, 2, 3, C.gold, elevation + 24);
}

function house(k, o) {
  const x = o.x + 6, y = o.y + 36, w = o.width - 12, d = o.height - 39;
  const front = y + d, tall = o.kind === 'archive' ? 119 : o.kind === 'watchtower' ? 135 : o.kind === 'post' ? 93 : 88;
  const wall = o.kind === 'hermit' || o.kind === 'shrine' ? C.woodLight : C.plaster;
  k.box(x, y, w, d, tall, wall);
  k.box(x, y, w, d, 8, C.stoneShade);
  // Timber corner posts, lintel and balcony trim give each silhouette depth.
  for (const xx of [x, x + w - 5]) k.box(xx, y, 5, d, tall + 2, C.wood, 3);
  k.box(x, front - 1, w, 3, 4, C.woodLight, tall - 11);
  roofTiles(k, x, y, w, d, o.kind === 'archive' ? 44 : 34, tall, o.kind === 'archive' ? C.navy : C.roof);
  facadeWindow(k, x + 12, front + 1, 34, Math.min(28, w * .22));
  facadeWindow(k, x + w - 40, front + 1, 34, Math.min(28, w * .22));
  door(k, x + w / 2, front + 1, Math.min(35, w * .3));
  k.box(x + w / 2 - 24, front + 3, 48, 10, 3, C.stoneLight);
  if (o.name) {
    k.box(x + w / 2 - Math.min(51, w / 2 - 8), front + 2, Math.min(102, w - 16), 4, 17, o.kind === 'archive' ? C.navy : C.green, tall - 26);
    k.label(o.name, x + w / 2, front + 7, tall - 18, C.paper, null, Math.min(100, w - 20));
  }
  // A tiny exterior crest reads as a village crest from a distance.
  k.box(x + w - 28, front + 2, 18, 2, 21, C.roof, 9);
  crest(k, x + w - 19, front + 4, 13, C.paper, .5);

  if (o.kind === 'ramen') ramen(k, x, y, w, d, tall);
  if (o.kind === 'watchtower') {
    k.box(x + 22, y + 16, w - 44, d - 26, 62, C.cream, tall + 26);
    roofTiles(k, x + 22, y + 16, w - 44, d - 26, 30, tall + 88);
    facadeWindow(k, x + 34, front - 9, tall + 39, 26, 26);
    k.cylinder(x + w - 21, y + 22, 6, 57, C.metal, tall + 60, 8);
    k.box(x + w - 36, y + 18, 28, 4, 4, C.metal, tall + 106);
  }
  if (o.kind === 'archive') {
    k.box(x + 10, front - 2, w - 20, 5, 7, C.blue, 25);
    for (let xx = x + 56; xx < x + w - 52; xx += 18) {
      k.box(xx, front + 3, 10, 3, 22, C.paper, 44);
      k.box(xx - 1, front + 5, 12, 2, 3, C.red, 65);
    }
    for (const xx of [x + 10, x + w - 18]) {
      k.box(xx, front + 5, 8, 5, 72, C.wood);
      k.box(xx + 8, front + 6, 23, 2, 48, C.navy, 24);
      crest(k, xx + 19, front + 9, 37, C.paper, .65);
    }
  }
  if (o.kind === 'shrine' || o.kind === 'hermit') {
    for (let xx = x + 9; xx < x + w - 8; xx += 18) k.box(xx, front + 2, 2, 2, 26, C.wood, 58);
    k.box(x + w / 2 - 7, y + d / 2 - 7, 14, 14, 14, C.gold, tall + 37);
  } else if (o.name !== 'MEDIC' && o.kind !== 'watchtower') {
    // The modern hidden village mixes plaster houses with rooftop utility tanks.
    const tx = x + w - 26, ty = y + d * .44;
    k.cylinder(tx, ty, 12, 23, C.metal, tall + 29, 10);
    k.cylinder(tx, ty, 14, 3, C.stoneLight, tall + 52, 10);
    k.beam(tx, ty, tall + 30, tx, ty + 20, tall + 10, 3, C.metal);
  }
  if (o.name === 'MEDIC') {
    k.box(x + w / 2 - 11, front + 5, 22, 2, 6, C.red, 72);
    k.box(x + w / 2 - 3, front + 5, 6, 2, 22, C.red, 64);
  }
}

function ramen(k, x, y, w, d, tall) {
  const front = y + d;
  // Split hanging noren leave the actual entrance visually open underneath.
  k.box(x + 5, front + 6, w - 10, 7, 5, C.woodLight, 68);
  for (let i = 0; i < 6; i++) {
    const xx = x + 6 + i * (w - 12) / 6;
    k.box(xx, front + 8, (w - 16) / 6, 2, 18, i % 2 ? C.roof : C.gold, 50);
    if (i === 1 || i === 4) k.label('麺', xx + (w - 16) / 12, front + 11, 59, C.paper, null, 17);
  }
  for (const xx of [x + 12, x + w - 17]) {
    k.cylinder(xx, front + 10, 7, 19, C.roofLight, 33, 8);
    k.cylinder(xx, front + 10, 8, 3, C.roofShade, 50, 8);
  }
  k.cylinder(x + w - 27, y + d / 2, 8, 35, C.metal, tall + 26, 10);
  k.cylinder(x + w - 27, y + d / 2, 11, 4, C.stoneLight, tall + 61, 10);
}

function leadershipTower(k, o) {
  const x = o.x + 6, y = o.y + 36, w = o.width - 12, d = o.height - 39;
  const cx = x + w / 2, cy = y + d / 2, front = y + d;
  // The foundation uses the exact collision footprint. The round upper drums
  // float above it; no decorative wall encroaches on the narrow approach.
  k.box(x, y, w, d, 96, C.plaster);
  k.cylinder(cx, cy, w * .49, 26, C.plaster, 77, 20);
  k.cylinder(cx, cy, w * .56, 11, C.roofShade, 103, 20);
  k.cone(cx, cy, w * .56, 23, C.roof, 114, 20);
  k.cylinder(cx, cy, w * .34, 71, C.cream, 134, 18);
  k.cylinder(cx, cy, w * .41, 10, C.roofShade, 199, 18);
  k.cone(cx, cy, w * .41, 23, C.roofLight, 209, 18);
  k.cylinder(cx, cy, w * .21, 48, C.plaster, 231, 16);
  k.cylinder(cx, cy, w * .28, 8, C.roofShade, 276, 16);
  k.cone(cx, cy, w * .28, 24, C.roof, 284, 16);
  k.cylinder(cx - 13, cy + 2, 9, 23, C.metal, 303, 10);
  k.cylinder(cx - 13, cy + 2, 11, 3, C.stoneLight, 326, 10);
  k.beam(cx + 14, cy - 4, 300, cx + 14, cy - 4, 346, 2.5, C.metal);
  k.beam(cx + 3, cy - 4, 337, cx + 26, cy - 4, 337, 2.5, C.metal);
  for (const xx of [x + 17, x + 48, x + w - 72, x + w - 41]) facadeWindow(k, xx, front + 1, 48, 22, 28);
  facadeWindow(k, cx - 17, cy + w * .34, 157, 34, 27);
  facadeWindow(k, cx - 10, cy + w * .21, 248, 20, 21);
  door(k, cx, front + 1, 42, 0, 48);
  k.box(cx - 25, front + 3, 50, 12, 3, C.stoneLight);
  k.box(cx - 25, front + 3, 50, 3, 28, C.roof, 63);
  crest(k, cx, front + 7, 70, C.paper, .95);
  k.label('REED', cx, front + 8, 96, C.navy, null, 80);
  for (const xx of [x + 2, x + w - 15]) {
    k.box(xx, front + 2, 13, 3, 43, C.navy, 21);
    crest(k, xx + 6, front + 6, 31, C.paper, .45);
  }
}

function oathTower(k, o) {
  house(k, o);
  const cx = o.x + o.width / 2, cy = o.y + o.height / 2;
  k.cylinder(cx, cy, 28, 74, C.plaster, 116, 12);
  k.cylinder(cx, cy, 35, 7, C.roofShade, 185, 12);
  k.cone(cx, cy, 38, 30, C.roof, 191, 12);
  k.cylinder(cx, cy, 17, 24, C.metal, 221, 10);
  k.cylinder(cx, cy, 20, 4, C.stoneLight, 245, 10);
  k.beam(cx + 30, cy, 90, cx + 30, cy, 256, 3, C.metal);
}

function torii(k, x, y, width = 120) {
  for (const xx of [x - width * .36, x + width * .36]) {
    k.box(xx - 5, y - 5, 10, 10, 109, C.red);
    k.box(xx - 7, y - 7, 14, 14, 5, C.stoneShade);
  }
  k.box(x - width / 2 - 6, y - 7, width + 12, 14, 8, C.red, 105);
  k.box(x - width / 2 - 10, y - 9, width + 20, 18, 4, C.wood, 113);
  k.box(x - width * .39, y - 4, width * .78, 8, 6, C.red, 84);
  k.box(x - 14, y - 4, 28, 8, 27, C.navy, 85);
  crest(k, x, y + 5, 90, C.paper, .85);
}

function lantern(k, x, y, height = 86) {
  k.cylinder(x, y, 2.5, height, C.wood, 0, 6);
  k.beam(x - 10, y, height - 1, x + 11, y, height - 1, 3, C.woodLight);
  k.cylinder(x + 6, y, 7, 19, C.gold, height - 24, 8);
  k.cylinder(x + 6, y, 8, 3, C.roofShade, height - 24, 8);
  k.cylinder(x + 6, y, 8, 3, C.roofShade, height - 7, 8);
  k.cylinder(x + 6, y, 8, 2, C.paper, height - 13, 8);
}

function bridge(k, x, y, w, d, suspension = false) {
  k.box(x, y, w, d, 3, C.woodLight, .3);
  for (let xx = x + 4; xx < x + w - 3; xx += 13) k.box(xx, y + 2, 1.5, d - 4, 1, C.wood, 3.5);
  for (const yy of [y + 2, y + d - 3]) {
    k.box(x, yy, w, 3, 3, C.wood, 24);
    for (let xx = x + 7; xx < x + w - 6; xx += 30) k.box(xx, yy - 1, 4, 5, 28, C.woodLight);
    if (suspension) {
      for (const xx of [x + 4, x + w - 8]) k.box(xx, yy - 2, 7, 7, 93, C.wood);
      for (let i = 0; i < 12; i++) {
        const a = i / 12, b = (i + 1) / 12;
        const za = 87 - Math.sin(a * Math.PI) * 27, zb = 87 - Math.sin(b * Math.PI) * 27;
        k.beam(x + a * w, yy, za, x + b * w, yy, zb, 2, C.woodLight);
        k.beam(x + a * w, yy, za, x + a * w, yy, 25, 1.5, C.woodLight);
      }
    }
  }
}

function tree(k, o, index) {
  const s = o.s, h = (o.kind === 'cedar' ? 220 : o.kind === 'bamboo' ? 145 : 175) * s;
  if (o.kind === 'bamboo') {
    for (let i = -1; i <= 1; i++) {
      const x = o.x + i * 10, z = h - Math.abs(i) * 25;
      k.cylinder(x, o.y, 2.4, z, C.bamboo, 0, 5);
      for (let e = 22; e < z - 15; e += 27) {
        k.cylinder(x, o.y, 3, 2, C.leaf, e, 5);
        k.box(x - 14 + (i % 2 ? 4 : -3), o.y - 4, 27, 7, 2, C.leafLight, e + 10);
      }
    }
    return;
  }
  k.cylinder(o.x, o.y, 6 * s, h * .61, C.wood, 0, 7);
  if (o.kind === 'cedar') {
    for (let i = 0; i < 3; i++) {
      k.cone(o.x, o.y, (44 - i * 8) * s, h * .37, i % 2 ? C.cedarLight : C.cedar, h * (.24 + i * .21), 7);
    }
  } else {
    k.sphere(o.x, o.y, 42 * s, index % 3 ? C.leaf : C.leafLight, h * .7);
    k.sphere(o.x - 19 * s, o.y + 11 * s, 32 * s, C.leaf, h * .62);
    k.sphere(o.x + 13 * s, o.y - 9 * s, 28 * s, C.leafLight, h * .85);
  }
}

function cliff(k, o, index) {
  const x = o.x + 9, y = o.y + 18, w = o.width - 18, d = o.height - 24;
  const height = index === 1 ? 330 : 92 + (index % 4) * 48;
  k.box(x, y, w, d, height, C.stoneShade);
  k.box(x + 3, y + 2, w - 6, d - 4, 15, C.mountainGrass, height - 8);
  // Large strata and staggered projecting blocks give cliffs three-dimensional
  // depth without expensive individual polygons or artificial black borders.
  for (let e = 27; e < height - 12; e += 47) {
    k.box(x, y + d - 3, w, 5, 4, e % 2 ? C.stone : C.stoneLight, e);
  }
  for (let xx = x + 8; xx < x + w - 25; xx += 64) {
    const off = ((xx + index * 17) % 29) / 29;
    k.box(xx, y + d - 2, 22, 7, 30 + off * 36, C.stone, 12 + off * Math.max(30, height - 98));
  }
}

function leaderFaces(k) {
  // Five original leaders carved into the north village ridge. The faces are
  // solid relief sculptures with brows, noses, headbands, hair and shoulder cuts.
  for (let i = 0; i < 5; i++) {
    const cx = 575 + i * 145, y = 209, e = 116 + (i % 2) * 6;
    k.box(cx - 49, y, 98, 17, 111, C.stone, e);
    k.box(cx - 39, y + 8, 78, 20, 25, C.stoneLight, e + 91);
    k.box(cx - 34, y + 14, 68, 24, 80, C.stoneLight, e + 18);
    k.box(cx - 25, y + 18, 50, 24, 18, C.stone, e + 5);
    // Recesses are a shaded material within the rock rather than drawn outlines.
    for (const xx of [cx - 29, cx + 10]) {
      k.box(xx, y + 39, 20, 3, 6, C.stoneShade, e + 61);
      k.box(xx - 2, y + 35, 25, 9, 6, C.stone, e + 68);
    }
    k.box(cx - 6, y + 29, 12, 20, 39, C.stoneLight, e + 35);
    k.box(cx - 17, y + 36, 34, 7, 5, C.stoneShade, e + 21);
    k.box(cx - 15, y + 38, 30, 8, 7, C.stone, e + 12);
    if (i === 0 || i === 2) {
      k.box(cx - 41, y + 27, 82, 5, 12, C.stoneShade, e + 86);
      k.box(cx - 9, y + 32, 18, 3, 14, C.stoneLight, e + 85);
      crest(k, cx, y + 36, e + 88, C.stone, .5);
    }
    if (i === 1 || i === 4) {
      k.box(cx - 50, y + 12, 14, 29, 80, C.stone, e + 31);
      k.box(cx + 36, y + 12, 14, 29, 80, C.stone, e + 31);
    }
    if (i === 3) for (let j = 0; j < 5; j++) k.box(cx - 44 + j * 19, y + 13, 17, 27, 21 + (j % 2) * 7, C.stoneShade, e + 99);
  }
  k.label('THE FIVE FOUNDERS', 870, 236, 77, C.cream, null, 340);
}

function props(k, o) {
  const x = o.x, y = o.y;
  if (o.kind === 'torii') return torii(k, x, y, o.w);
  if (o.kind === 'lantern') return lantern(k, x, y);
  if (o.kind === 'pole') {
    k.cylinder(x, y, 3.5, 166, C.wood, 0, 6);
    k.box(x - 25, y - 3, 50, 6, 5, C.woodLight, 147);
    for (const xx of [x - 18, x, x + 18]) k.cylinder(xx, y, 4, 10, C.glass, 152, 6);
  } else if (o.kind === 'log') {
    k.cylinder(x, y, 10, 57, C.wood, 0, 9);
    k.cylinder(x, y, 11, 3, C.woodLight, 56, 9);
    k.box(x - 26, y - 2, 52, 5, 6, C.woodLight, 32);
    k.box(x - 5, y - 11, 10, 3, 8, C.paper, 35);
  } else if (o.kind === 'board') {
    for (const xx of [x - 24, x + 24]) k.box(xx - 2, y - 2, 4, 4, 65, C.wood);
    k.box(x - 34, y - 3, 68, 6, 44, C.woodLight, 28);
    k.box(x - 30, y + 4, 60, 1, 34, C.cream, 33);
    k.box(x - 38, y - 5, 76, 10, 5, C.wood, 69);
    k.label(o.label || 'MISSIONS', x, y + 6, 61, C.navy, null, 62);
    for (let i = 0; i < 3; i++) k.box(x - 24 + i * 17, y + 5, 13, 1, 18, C.paper, 36);
  } else if (o.kind === 'crate') {
    k.box(x - 13, y - 12, 26, 24, 25, C.woodLight);
    k.box(x - 13, y - 12, 26, 24, 3, C.wood, 16);
    k.box(x - 13, y - 12, 26, 24, 3, C.wood, 5);
  } else if (o.kind === 'stone') {
    k.box(x - 11, y - 8, 22, 16, 39, C.stone);
    k.box(x - 13, y - 10, 26, 20, 5, C.stoneLight, 36);
    crest(k, x, y + 9, 13, C.stoneShade, .7);
  } else if (o.kind === 'bench') {
    k.box(x - 27, y - 7, 54, 14, 4, C.woodLight, 15);
    for (const xx of [x - 21, x + 17]) k.box(xx, y - 5, 4, 10, 15, C.wood);
    k.box(x - 27, y - 9, 54, 3, 12, C.woodLight, 18);
  } else if (o.kind === 'banner') {
    k.cylinder(x, y, 2.5, 96, C.woodLight, 0, 6);
    k.box(x + 3, y - 2, 29, 3, 54, o.col || C.roof, 37);
    crest(k, x + 18, y + 2, 54, C.paper, .8);
    k.box(x + 3, y - 2, 29, 3, 3, C.paper, 87);
  } else if (o.kind === 'camp') {
    k.roof(x - 39, y - 35, 78, 66, 45, C.navy, 0);
    k.box(x - 12, y + 28, 24, 1, 25, C.wood, 0);
    k.box(x + 47, y - 9, 21, 20, 20, C.woodLight);
  } else if (o.kind === 'scroll') {
    k.box(x - 6, y - 3, 12, 6, 20, C.paper);
    k.box(x - 8, y - 4, 16, 8, 3, C.red, 18);
    k.box(x - 8, y - 4, 16, 8, 3, C.red);
  }
}

function wires(k, x1, y1, x2, y2, elevation = 150, withLanterns = false) {
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const a = i / steps, b = (i + 1) / steps;
    const ax = x1 + (x2 - x1) * a, ay = y1 + (y2 - y1) * a;
    const bx = x1 + (x2 - x1) * b, by = y1 + (y2 - y1) * b;
    const ae = elevation - Math.sin(a * Math.PI) * 24, be = elevation - Math.sin(b * Math.PI) * 24;
    k.beam(ax, ay, ae, bx, by, be, 1.2, C.stoneShade);
    if (withLanterns && i % 3 === 1) {
      k.beam(ax, ay, ae, ax, ay, ae - 9, 1, C.wood);
      k.cylinder(ax, ay, 7, 15, C.gold, ae - 24, 8);
      k.cylinder(ax, ay, 8, 2, C.roofShade, ae - 11, 8);
    }
  }
}

function market(k) {
  for (const [x, y, col] of [[990,2615,'#be8498'],[1210,2614,C.blue],[988,2802,C.roofLight],[1202,2820,C.navy]]) {
    k.box(x - 32, y - 10, 64, 22, 8, C.woodLight, 25);
    for (const xx of [x - 31, x + 27]) k.box(xx, y - 12, 4, 25, 74, C.wood);
    k.roof(x - 37, y - 20, 74, 41, 12, col, 72);
    for (let i = 0; i < 5; i++) {
      k.sphere(x - 22 + i * 11, y, 5, i % 2 ? C.gold : C.roof, 37);
    }
  }
  wires(k, 1003, 2664, 1310, 2664, 144, true);
  wires(k, 990, 2802, 1317, 2802, 103, true);
}

function paddies(k) {
  for (const [x, y, w, d] of [[74,335,201,134],[810,1115,347,177],[920,1745,436,241],[1940,2260,350,171],[2910,2920,284,153]]) {
    k.box(x, y, w, d, 1.5, C.marsh, .2);
    for (let yy = y + 7; yy < y + d; yy += 35) {
      k.box(x, yy, w, 5, 2, C.dirt);
      for (let xx = x + 12; xx < x + w - 8; xx += 35) k.box(xx, yy + 12, 3, 7, 9, C.leafLight, 1.5);
    }
  }
}

function waterfall(k) {
  // The upper river is already a real collision barrier. Its luminous cataract
  // is above that exact strip; both shore routes and the island entrance stay dry.
  k.box(2817, 780, 111, 276, 1.9, C.water, .3);
  k.box(2817, 779, 111, 17, 167, C.stoneShade);
  for (let i = 0; i < 9; i++) {
    k.box(2820 + i * 12, 794, 9, 7, 157 - (i % 3) * 7, i % 3 ? C.foam : C.water, 5);
  }
  k.box(2817, 798, 111, 19, 2, C.foam, 2.7);
  // Additional water patches match the basin barriers in EMBER_OBSTACLES.
  for (const [x, y, w, d] of [[2881,1096,31,64],[3136,1095,85,136],[2914,1198,302,33]]) k.box(x, y, w, d, 1.8, C.water, .4);
  k.box(2912, 1032, 225, 166, 1.5, C.stoneLight, .3);
  bridge(k, 2796, 1160, 118, 38);
  bridge(k, 2802, 1231, 464, 58);
  for (let i = 0; i < 13; i++) {
    const x = 2819 + (i * 31) % 111, y = 830 + (i * 61) % 208;
    k.box(x, y, 18, 2, .4, C.foam, 2.8);
  }
}

export function buildEmber3D(k) {
  const L = EMBER_LAYOUT;
  k.box(0, 0, L.size.width, L.size.height, 5, C.grass, -5);
  for (const [x, y, w, d, col] of [
    [1430,330,1220,1160,C.forest], [3640,1490,680,580,'#a1b77f'],
    [1870,2330,1040,1040,C.marsh], [3910,330,805,590,C.mountainGrass],
    [2980,2230,1260,1100,'#8fac71'],
  ]) k.box(x, y, w, d, .5, col);
  for (const r of L.clearings) k.box(r.x, r.y, r.width, r.height, .6, C.leafLight);
  paddies(k);

  for (const r of L.water) {
    k.box(r.x - 4, r.y, r.width + 8, r.height, .7, C.marsh, .2);
    k.box(r.x, r.y, r.width, r.height, 1.2, C.water, .5);
    if (r.height > 75) for (let i = 0; i < 3; i++) k.box(r.x + 12 + i * 8, r.y + r.height * (i + 1) / 4, Math.min(24, r.width - 15), 2, .3, C.foam, 1.8);
  }
  for (const r of L.roads) {
    k.box(r.x, r.y, r.width, r.height, .8, C.road, .2);
    const horizontal = r.width > r.height;
    // A sunlit edge and sparse worn stone areas keep long roads legible.
    if (horizontal) k.box(r.x, r.y + r.height - 4, r.width, 4, .3, C.dirt, 1.1);
    else k.box(r.x + r.width - 4, r.y, 4, r.height, .3, C.dirt, 1.1);
  }
  k.box(637, 566, 293, 166, 1.4, C.stoneLight, .6);
  for (let yy = 579; yy < 730; yy += 29) for (let xx = 648; xx < 918; xx += 39) k.box(xx + (yy % 2 ? 8 : 0), yy, 29, 1, .2, C.stone, 2.1);
  k.box(638, 223, 369, 181, 1, C.dirt, .4);
  k.cylinder(815, 314, 44, .4, C.road, 1.5, 18);

  L.rocks.forEach((o, i) => cliff(k, o, i));
  leaderFaces(k);
  for (const o of L.structures) {
    if (o.kind === 'tower' && o.name === 'REED') leadershipTower(k, o);
    else if (o.kind === 'tower') oathTower(k, o);
    else house(k, o);
  }
  for (const o of L.props) props(k, o);
  L.vegetation.forEach((o, i) => tree(k, o, i));

  bridge(k, 307, 510, 116, 79);
  bridge(k, 307, 820, 116, 76);
  bridge(k, 313, 1815, 137, 66);
  bridge(k, 1937, 923, 188, 68, true);
  bridge(k, 3155, 1628, 138, 66);
  waterfall(k);
  market(k);
  wires(k, 618, 700, 948, 704, 154);
  wires(k, 3788, 1805, 4038, 1794, 151);
  wires(k, 3460, 2834, 3700, 2834, 150);

  for (const [x, y, word] of [[1480,647,'CEDAR WOODS'],[2370,963,'STORMWATER'],[3330,1693,'ASH ARCHIVE'],[1752,2120,'LANTERN MARKET'],[2830,2380,'REED MARSH'],[3889,2410,'BORDER PATROL'],[4200,648,'HERMITAGE']]) {
    k.box(x - 2, y - 2, 4, 4, 56, C.wood);
    k.box(x - 40, y - 3, 80, 6, 20, C.woodLight, 38);
    k.label(word, x, y + 4, 48, C.navy, null, 77);
  }
  // A ceremonial gate at the long village road is visible from the first quest.
  torii(k, 1366, 619, 140);
  k.label('HIDDEN REED', 1366, 627, 135, C.navy, null, 150);
}
