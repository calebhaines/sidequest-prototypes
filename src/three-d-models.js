import * as THREE from 'three';

// Every static coordinate below uses the authored simulation pixels. The kit
// converts these into world units, so rendered furniture agrees with collisions.
const PALETTES = {
  lynch: { wall: '#ddceb7', wallLight: '#efe1c7', trim: '#95674f', wood: '#ad7854', woodLight: '#d3a16e', woodDark: '#765641', tile: '#9bb4a8', tileLight: '#d0d9bf', stone: '#9ea7a8', fabric: '#b8635c', fabricLight: '#dc9882', metal: '#899f9e', metalLight: '#c5d0c0', metalDark: '#546a73', paper: '#f6e8c5', ink: '#3f4659', glass: '#87b9b0', water: '#76aaa8', plant: '#628257', leaf: '#92ad6f', pot: '#bf7757', glow: '#ffdfa4', accent: '#d2a361' },
  shinobi: { wall: '#eee0b9', wallLight: '#fff0cb', trim: '#ac8051', wood: '#b88855', woodLight: '#dcac70', woodDark: '#84623e', tile: '#a6b99a', tileLight: '#d7ddad', stone: '#a3ada8', fabric: '#6e929c', fabricLight: '#9fbab4', metal: '#92a4a0', metalLight: '#d4d9c4', metalDark: '#526e76', paper: '#fff1ce', ink: '#3b4f63', glass: '#89c3bd', water: '#87c4c1', plant: '#658654', leaf: '#a1b86b', pot: '#c98555', glow: '#ffe19d', accent: '#ec9a4c' },
};

function roomFloor(kit, room, p) {
  const { x, y, width: w, height: d } = room;
  const kind = ({ planks: 'wood', linoleum: 'tile', checker: 'tile', cement: 'concrete', reed: 'tatami', sand: 'dirt' })[room.floor] || room.floor || 'wood';
  const base = kind === 'wood' ? p.wood : kind === 'carpet' ? p.fabric : kind === 'tatami' ? p.tileLight : kind === 'tile' ? p.tile : kind === 'dirt' ? '#988469' : p.stone;
  kit.box(x, y, w, d, 1, base, -1);
  if (kind === 'wood') {
    for (let z = y; z < y + d; z += 24) {
      const depth = Math.min(24, y + d - z);
      kit.box(x, z, w, 1.4, .18, p.woodLight, .01);
      const offset = ((z - y) / 24) % 2 ? 48 : 0;
      for (let xx = x + offset; xx < x + w; xx += 96) {
        kit.box(xx, z, Math.min(1.4, x + w - xx), depth, .2, p.woodDark, .02);
      }
    }
  } else if (kind === 'tile') {
    for (let z = y, row = 0; z < y + d; z += 40, row++) {
      for (let xx = x, col = 0; xx < x + w; xx += 40, col++) {
        const tw = Math.min(40, x + w - xx), td = Math.min(40, y + d - z);
        kit.box(xx + 1, z + 1, Math.max(1, tw - 2), Math.max(1, td - 2), .35, (row + col) % 2 ? p.tile : p.tileLight, .01);
      }
    }
  } else if (kind === 'tatami') {
    for (let z = y; z < y + d; z += 64) {
      for (let xx = x; xx < x + w; xx += 128) {
        const tw = Math.min(128, x + w - xx), td = Math.min(64, y + d - z);
        kit.box(xx, z + Math.max(0, td - 4), tw, Math.min(4, td), .35, p.plant, .02);
        kit.box(xx + Math.max(0, tw - 4), z, Math.min(4, tw), td, .35, p.plant, .02);
        for (let zz = z + 8; zz < z + td - 5; zz += 8) kit.box(xx + 6, zz, Math.max(1, tw - 12), 1.1, .18, p.tile, .03);
      }
    }
  } else if (kind === 'stone' || kind === 'concrete') {
    for (let z = y; z < y + d; z += 64) {
      for (let xx = x; xx < x + w; xx += 64) {
        kit.box(xx + 1, z + 1, Math.max(1, Math.min(62, x + w - xx - 2)), Math.max(1, Math.min(62, y + d - z - 2)), .2, ((xx + z) / 64) % 3 === 0 ? '#b5bcb3' : p.stone, .01);
      }
    }
  } else if (kind === 'carpet') {
    for (let z = y + 12; z < y + d; z += 32) for (let xx = x + 12; xx < x + w; xx += 32) kit.box(xx, z, 2, 2, .15, p.fabricLight, .02);
  }
}

function furnishing(kit, f, p, theme) {
  const { x, y, width: w, height: d } = f;
  let kind = f.kind;
  if (kind === 'machine' && ['washer', 'dryer'].includes(f.variant)) kind = 'washer';
  if (kind === 'console' && f.variant === 'helm') kind = 'helm';
  const color = f.color || p.fabric;
  const box = (u, v, a, b, h, c, e = 0) => kit.box(x + u * w, y + v * d, a * w, b * d, h, c, e);
  const cylinder = (u, v, r, h, c, e = 0, n = 8) => kit.cylinder(x + u * w, y + v * d, r, h, c, e, n);
  const beam = (u, v, e1, a, b, e2, thick, c) => kit.beam(x + u * w, y + v * d, e1, x + a * w, y + b * d, e2, thick, c);
  const legs = (height = 16, c = p.woodDark) => { for (const [u, v] of [[.09, .08], [.8, .08], [.09, .8], [.8, .8]]) box(u, v, .1, .1, height, c); };
  const tabletop = (height = 18, c = p.woodLight) => { legs(height - 3); box(.03, .03, .94, .94, 3, c, height - 3); };
  const plate = (u, v, radius, elevation) => { cylinder(u, v, radius, .7, p.paper, elevation, 12); cylinder(u, v, radius * .57, .5, p.tileLight, elevation + .7, 10); };
  const paper = (u, v, a, b, e = 20) => { box(u, v, a, b, .6, p.paper, e); for (let i = 0; i < 3; i++) box(u + .03, v + .05 + i * b / 5, Math.max(.02, a - .07), .012, .25, p.ink, e + .7); };
  const handle = (u, v, h) => box(u, v, .12, .035, 1.4, p.metalDark, h);
  const panelHeight = 32;
  switch (kind) {
    case 'table':
      tabletop(); plate(.25, .34, Math.min(w, d) * .12, 18); plate(.7, .66, Math.min(w, d) * .13, 18);
      cylinder(.54, .29, 2.4, 5, p.glass, 18); box(.14, .6, .16, .025, .5, p.metalLight, 18.1); break;
    case 'desk':
      tabletop(20); box(.06, .16, .25, .68, 17, p.wood); box(.08, .75, .21, .08, 5, p.woodLight, 9);
      paper(.36, .16, .36, .52, 20); cylinder(.82, .3, 3, 6, p.glass, 20); box(.73, .61, .18, .09, 2, p.accent, 20); break;
    case 'chair':
      legs(11); box(.12, .28, .76, .61, 4, p.woodLight, 8); box(.17, .3, .66, .54, 2, color, 12);
      box(.15, .02, .12, .12, 23, p.wood); box(.73, .02, .12, .12, 23, p.wood); box(.15, .02, .7, .17, 9, color, 16); break;
    case 'booth': case 'sofa':
      box(.03, .05, .94, .88, 5, p.woodDark); box(.03, .03, .94, .2, 25, color, 2); box(.08, .25, .84, .65, 10, p.fabricLight, 5);
      for (let i = 0; i < 3; i++) box(.09 + i * .28, .29, .26, .51, 2, color, 15);
      if (kind === 'sofa') { box(.01, .21, .11, .69, 17, color); box(.88, .21, .11, .69, 17, color); box(.15, .32, .18, .24, 4, p.paper, 17); }
      else for (let i = 1; i < 4; i++) box(i / 4, .04, .012, .19, 18, p.fabricLight, 5); break;
    case 'bed': case 'medical-bed': {
      const futon = f.variant === 'futon', height = futon ? 3 : 10;
      if (!futon) { legs(6, kind === 'medical-bed' ? p.metal : p.woodDark); box(.04, .03, .92, .1, 19, kind === 'medical-bed' ? p.metal : p.wood); }
      box(.05, .09, .9, .85, height, p.paper, futon ? 0 : 3); box(.1, .39, .8, .52, 1.5, kind === 'medical-bed' ? p.glass : color, height + (futon ? 0 : 3));
      box(.12, .12, .76, .21, 3, p.paper, height + (futon ? 0 : 3)); box(.1, .4, .8, .07, 1, p.fabricLight, height + (futon ? 1.5 : 4.5));
      if (kind === 'medical-bed') { beam(.91, .15, 0, .91, .15, 42, 1.5, p.metal); beam(.91, .15, 42, .8, .15, 42, 1.5, p.metal); box(.76, .12, .13, .07, 8, p.glass, 30); }
      break;
    }
    case 'counter':
      box(.02, .03, .96, .94, 22, p.wood); box(0, 0, 1, 1, 3, p.paper, 22); box(.03, .93, .94, .06, 18, p.woodLight, 2);
      plate(.16, .43, Math.min(w, d) * .16, 25); cylinder(.39, .3, 3, 4, p.glass, 25); box(.75, .21, .19, .55, 8, p.metal, 25); box(.77, .39, .15, .25, 2, p.glass, 33); break;
    case 'stove':
      box(.02, .03, .96, .94, 22, p.metal); box(0, 0, 1, 1, 2, p.metalLight, 22);
      for (const u of [.27, .72]) for (const v of [.25, .67]) { cylinder(u, v, Math.min(w, d) * .12, .9, p.metalDark, 24, 10); cylinder(u, v, Math.min(w, d) * .075, .5, p.metal, 25, 10); }
      box(.14, .94, .72, .035, 10, p.metalDark, 5); handle(.43, .98, 16); break;
    case 'sink': case 'basin':
      box(.03, .03, .94, .94, 18, p.wood); box(0, 0, 1, 1, 3, p.paper, 18); box(.14, .19, .72, .64, 1, p.metal, 21.1); box(.21, .27, .58, .48, .7, p.water, 22);
      beam(.52, .11, 21, .52, .11, 30, 2, p.metalLight); beam(.52, .11, 30, .52, .32, 30, 2, p.metalLight); break;
    case 'fridge':
      box(.03, .03, .94, .94, 38, p.paper); box(.08, .97, .84, .02, 9, p.metalLight, 27); box(.08, .97, .84, .02, 24, p.glass, 2);
      box(.78, .96, .045, .05, 8, p.metalDark, 15); box(.78, .96, .045, .05, 5, p.metalDark, 29); box(.15, .98, .16, .02, 5, p.fabric, 19); break;
    case 'shelf': case 'bookshelf': case 'scroll-rack': {
      box(.04, .03, .92, .1, 36, p.woodDark); box(.02, .03, .08, .91, 38, p.wood); box(.9, .03, .08, .91, 38, p.wood);
      const tallFootprint = d > w * 1.8;
      for (let row = 0; row < 3; row++) {
        const elevation = 2 + row * 12; box(.02, .03, .96, .94, 2, p.woodLight, elevation);
        if (f.variant === 'tools' || f.variant === 'fishing') {
          for (let i = 0; i < 4; i++) { beam(.22 + i * .17, .25, elevation + 2, .22 + i * .17, .25, elevation + 10, 1.5, p.woodLight); box(.17 + i * .17, .18, .13, .12, 2, p.metal, elevation + 9); }
        } else if (kind === 'scroll-rack' || ['reeds', 'ropes', 'fabric'].includes(f.variant)) {
          for (let i = 0; i < 5; i++) {
            if (tallFootprint) box(.18, .12 + i * .15, .6, .1, 7, f.variant === 'reeds' ? p.leaf : p.paper, elevation + 2);
            else { cylinder(.19 + i * .15, .52, Math.min(3, w * .06), 7, f.variant === 'fabric' ? color : p.paper, elevation + 2); box(.14 + i * .15, .47, .1, .1, 1, p.accent, elevation + 7); }
          }
        } else if (kind === 'bookshelf') {
          const colors = [p.fabric, p.paper, p.glass, p.accent, p.leaf, p.fabricLight];
          for (let i = 0; i < 7; i++) box(.13 + i * .108, .35, .078, .5, 7 + i % 3, colors[i % colors.length], elevation + 2);
        } else {
          box(.17, .22, .19, .56, 6, p.paper, elevation + 2); box(.45, .32, .22, .43, 5, color, elevation + 2); cylinder(.79, .54, Math.min(w, d) * .07, 8, p.glass, elevation + 2);
        }
      }
      break;
    }
    case 'cabinet': case 'locker': case 'file-cabinet': case 'wardrobe': {
      const metal = kind === 'locker' || kind === 'file-cabinet', height = kind === 'wardrobe' || kind === 'locker' ? 38 : 30;
      box(.03, .03, .94, .94, height, metal ? p.metal : p.wood); box(.01, .01, .98, .98, 2, metal ? p.metalLight : p.woodLight, height);
      if (kind === 'cabinet' || kind === 'file-cabinet') for (let row = 0; row < 3; row++) { box(.1, .98, .8, .025, 7, metal ? p.metalLight : p.woodLight, 2 + row * 9); box(.43, .99, .14, .04, 1.5, p.metalDark, 6 + row * 9); }
      else for (const u of [.1, .52]) { box(u, .98, .38, .025, height - 5, metal ? p.metalLight : p.woodLight, 2); box(u + .24, .995, .035, .04, 4, p.accent, height * .45); if (metal) for (let i = 0; i < 3; i++) box(u + .08, .997, .19, .018, .5, p.metalDark, height - 8 - i * 2); }
      break;
    }
    case 'crate':
      box(.05, .05, .9, .9, 19, p.woodLight); for (const u of [.12, .46, .8]) box(u, .02, .08, .96, 21, p.wood); box(.03, .12, .94, .09, 2, p.wood, 20); box(.03, .78, .94, .09, 2, p.wood, 20); paper(.28, .31, .43, .35, 21); break;
    case 'barrel': {
      const r = Math.min(w, d) * .44; cylinder(.5, .5, r, 24, p.wood, 0, 12); cylinder(.5, .5, r * 1.02, 2, p.metalDark, 5, 12); cylinder(.5, .5, r * 1.02, 2, p.metalDark, 18, 12); cylinder(.5, .5, r * .95, 1, p.woodLight, 24, 12); break;
    }
    case 'workbench':
      tabletop(20); box(.16, .2, .24, .36, 3, p.metal, 20); box(.22, .18, .13, .07, 6, p.metalLight, 20); beam(.5, .28, 21, .5, .67, 21, 2.5, p.metal); box(.44, .22, .22, .1, 2, p.metalLight, 20); box(.73, .2, .18, .4, 5, p.wood, 20); paper(.12, .66, .22, .18, 20); break;
    case 'machine': {
      if (f.variant === 'loom') {
        for (const u of [.05, .88]) box(u, .05, .07, .87, 38, p.wood); box(.05, .05, .9, .08, 4, p.woodLight, 34); box(.12, .72, .76, .08, 4, p.wood, 9);
        for (let i = 0; i < 12; i++) beam(.19 + i * .056, .15, 33, .19 + i * .056, .72, 13, .65, p.paper);
        for (let row = 0; row < 7; row++) beam(.18, .39 + row * .04, 25 - row * 1.2, .82, .39 + row * .04, 25 - row * 1.2, 2, row % 2 ? color : p.fabricLight);
      } else if (f.variant === 'press') {
        box(.08, .08, .84, .84, 5, p.metalDark); box(.1, .14, .11, .65, 38, p.metal); box(.79, .14, .11, .65, 38, p.metal); box(.08, .08, .84, .84, 5, p.metalLight, 35); box(.44, .32, .12, .32, 17, p.metal, 21); box(.23, .21, .54, .58, 4, p.metalLight, 18); paper(.3, .3, .4, .4, 5);
      } else if (f.variant === 'pulp-vat') {
        box(.03, .03, .94, .94, 22, p.metal); box(.08, .09, .84, .82, 2, p.metalLight, 22); box(.14, .15, .72, .7, 1, p.tileLight, 24); box(.24, .26, .52, .24, .5, p.paper, 25); beam(.7, .14, 25, .7, .62, 32, 2.5, p.wood);
      } else if (f.variant === 'paper-reel') {
        for (const u of [.1, .8]) box(u, .1, .08, .8, 34, p.metal); cylinder(.5, .35, Math.min(w, d) * .28, 24, p.paper, 6, 12); box(.3, .6, .4, .32, 1, p.paper, 3); box(.05, .1, .9, .08, 3, p.metalLight, 29);
      } else if (f.variant === 'pump') {
        box(.03, .03, .94, .94, 4, p.metalDark); box(.13, .19, .39, .59, 25, p.metalLight, 4); box(.54, .35, .29, .36, 16, p.metal, 4); beam(.39, .49, 25, .72, .49, 25, 4, p.metal); beam(.72, .49, 25, .72, .49, 34, 4, p.metal); cylinder(.72, .49, 4, 3, p.accent, 34);
      } else {
        box(.04, .04, .92, .92, 27, p.metal); box(.12, .11, .76, .72, 9, p.metalLight, 27); box(.18, .87, .29, .07, 9, p.metalDark, 18); box(.24, .94, .17, .035, 5, p.glass, 20); cylinder(.74, .66, 3.4, 2, p.accent, 36); box(.12, .02, .08, .94, 32, p.accent); box(.8, .02, .08, .94, 32, p.accent);
      }
      break;
    }
    case 'console':
      legs(15, p.metalDark); box(.02, .02, .96, .96, 12, p.metal, 13); box(.08, .08, .84, .77, 2, p.metalDark, 25);
      if (f.variant === 'signal-levers') for (let i = 0; i < 4; i++) { beam(.2 + i * .19, .6, 27, .2 + i * .19, .27 + i % 2 * .2, 36, 2, p.wood); cylinder(.2 + i * .19, .27 + i % 2 * .2, 3, 2, i % 2 ? p.fabricLight : p.accent, 35); }
      else { box(.15, .13, .7, .49, 1, p.glass, 27); for (let i = 0; i < 4; i++) box(.23, .22 + i * .08, .2 + i * .1, .02, .4, p.paper, 28); for (let i = 0; i < 5; i++) cylinder(.16 + i * .17, .76, 2, 1.4, i % 2 ? p.fabricLight : p.glow, 27); }
      break;
    case 'telescope':
      beam(.5, .5, 22, .15, .83, 0, 2, p.wood); beam(.5, .5, 22, .85, .83, 0, 2, p.wood); beam(.5, .5, 22, .5, .13, 0, 2, p.wood);
      beam(.15, .4, 26, .85, .4, 36, 8, p.metalLight); beam(.8, .4, 35, .94, .4, 37, 9, p.glass); break;
    case 'piano':
      box(.03, .03, .94, .38, 34, p.woodDark); box(.03, .41, .94, .3, 4, p.wood, 20); box(.08, .44, .84, .21, 1, p.paper, 24);
      for (let i = 0; i < 12; i++) box(.1 + i * .067, .44, .027, .12, 1.3, p.ink, 25); box(.06, .68, .12, .26, 20, p.wood); box(.82, .68, .12, .26, 20, p.wood); paper(.39, .14, .24, .17, 34); break;
    case 'curtain':
      box(0, .02, 1, .05, 3, p.woodLight, 45); for (let i = 0; i < 8; i++) box(i / 8, .08 + (i % 2) * .07, 1 / 8, Math.min(.4, 12 / Math.max(d, 1)), 44, i % 2 ? color : p.fabricLight);
      break;
    case 'altar':
      box(.1, .08, .8, .8, 4, p.stone); box(.19, .22, .62, .57, 17, p.wood); box(.08, .08, .84, .83, 3, p.woodLight, 21);
      for (const u of [.23, .78]) { cylinder(u, .26, 2.2, 9, p.paper, 24); kit.cone(x + u * w, y + .26 * d, 1.4, 3, p.glow, 33, 5); }
      box(.46, .3, .08, .08, 14, p.accent, 24); box(.34, .3, .32, .08, 3, p.accent, 32); cylinder(.5, .66, Math.min(w, d) * .1, 5, p.metal, 24); break;
    case 'pew': case 'bench':
      legs(10); box(.04, .3, .92, .59, 3, p.woodLight, 10); box(.04, .03, .92, .1, 21, p.wood); box(.04, .03, .92, .13, 8, p.woodLight, 15); break;
    case 'weapon-rack':
      box(.08, .08, .07, .78, 36, p.wood); box(.85, .08, .07, .78, 36, p.wood); box(.08, .42, .84, .1, 3, p.woodLight, 14); box(.08, .22, .84, .1, 3, p.woodLight, 29);
      for (let i = 0; i < 4; i++) { const u = .26 + i * .16; beam(u, .4, 5, u, .4, 33, 1.6, p.metalLight); box(u - .045, .36, .09, .08, 1.5, p.accent, 11); box(u - .018, .37, .036, .06, 7, p.woodDark, 4); }
      break;
    case 'plant':
      cylinder(.5, .58, Math.min(w, d) * .3, 10, p.pot); cylinder(.5, .58, Math.min(w, d) * .34, 2, p.accent, 9); beam(.5, .58, 10, .5, .58, 29, 1.8, p.plant);
      kit.sphere(x + .34 * w, y + .42 * d, Math.min(w, d) * .23, p.leaf, 21); kit.sphere(x + .68 * w, y + .55 * d, Math.min(w, d) * .21, p.plant, 25); kit.sphere(x + .5 * w, y + .5 * d, Math.min(w, d) * .23, p.leaf, 31); break;
    case 'rug': case 'mat':
      box(0, 0, 1, 1, .6, color, .1); box(.05, .05, .9, .9, .3, p.fabricLight, .7); box(.09, .09, .82, .82, .3, color, 1); box(.24, .25, .52, .5, .2, p.accent, 1.3); box(.33, .35, .34, .3, .2, p.paper, 1.5);
      for (let i = 0; i < 7; i++) { box(.045 + i * .14, 0, .03, .035, .25, p.paper, .75); box(.045 + i * .14, .965, .03, .035, .25, p.paper, .75); } break;
    case 'painting': case 'map-board': {
      const h = kind === 'map-board' ? 31 : 25;
      box(.03, .1, .94, Math.min(.14, 6 / d), h, p.woodLight, 12); box(.09, .1 + Math.min(.14, 6 / d), .82, .016, h - 5, p.paper, 14.5);
      if (['map', 'chart', 'village', 'bridge'].includes(f.variant) || kind === 'map-board') { box(.19, .14 + Math.min(.14, 6 / d), .22, .016, h * .24, p.leaf, 17); box(.55, .14 + Math.min(.14, 6 / d), .24, .016, h * .25, p.tile, 26); box(.19, .16 + Math.min(.14, 6 / d), .62, .02, 2, p.glass, 23); box(.45, .18 + Math.min(.14, 6 / d), .06, .018, 4, p.fabric, 22); }
      else if (['calligraphy', 'oath', 'clan'].includes(f.variant)) { for (let i = 0; i < 4; i++) { box(.3 + i % 2 * .3, .15 + Math.min(.14, 6 / d), .18, .018, 1, p.ink, 18 + Math.floor(i / 2) * 8); box(.36 + i % 2 * .3, .15 + Math.min(.14, 6 / d), .035, .018, 6, p.ink, 16 + Math.floor(i / 2) * 8); } }
      else { box(.16, .15 + Math.min(.14, 6 / d), .69, .02, h * .36, p.glass, 25); box(.16, .17 + Math.min(.14, 6 / d), .69, .02, h * .36, p.plant, 16); box(.68, .19 + Math.min(.14, 6 / d), .08, .016, 3, p.glow, 30); }
      break;
    }
    case 'shoji': case 'screen':
      box(.02, .02, .96, Math.min(.34, 5 / d), panelHeight, p.paper); for (let i = 0; i < 5; i++) box(.02 + i * .235, .01, .024, Math.min(.38, 6 / d), panelHeight + 1, p.woodLight);
      for (let i = 0; i < 5; i++) box(.02, .01, .96, Math.min(.38, 6 / d), 1.2, p.woodLight, i * 8); break;
    case 'bath':
      box(.04, .04, .92, .92, 15, p.wood); box(.12, .12, .76, .76, 1, p.water, 15.2); box(.04, .04, .92, .1, 3, p.woodLight, 15); box(.04, .86, .92, .1, 3, p.woodLight, 15); box(.04, .13, .08, .73, 3, p.woodLight, 15); box(.88, .13, .08, .73, 3, p.woodLight, 15);
      box(.26, .32, .43, .015, .3, p.paper, 16.4); beam(.5, .07, 18, .5, .07, 26, 2, p.metal); beam(.5, .07, 26, .5, .24, 26, 2, p.metal); break;
    case 'lantern':
      box(.44, .37, .12, .16, 36, p.woodDark); box(.17, .2, .66, .6, 2, p.woodLight, 30); box(.22, .25, .56, .5, 13, p.glow, 16); box(.17, .2, .66, .6, 2, p.woodLight, 14);
      for (const u of [.2, .76]) box(u, .23, .035, .54, 15, p.wood, 15); break;
    case 'training-dummy':
      cylinder(.5, .5, Math.min(w, d) * .35, 3, p.stone); beam(.5, .5, 3, .5, .5, 29, 3, p.woodDark); box(.32, .29, .36, .38, 15, p.wood, 16); box(.38, .33, .24, .26, 8, p.woodLight, 32); beam(.09, .45, 25, .91, .45, 25, 3, p.woodLight); box(.41, .67, .18, .02, 6, color, 21); break;
    case 'coat-rack':
      box(.12, .23, .76, .54, 2, p.woodDark); beam(.5, .5, 2, .5, .5, 38, 2.2, p.wood); beam(.12, .5, 33, .88, .5, 33, 2.4, p.woodLight); box(.2, .38, .27, .15, 21, color, 11); box(.6, .39, .2, .12, 16, p.paper, 17); break;
    case 'radio':
      box(.03, .03, .94, .94, 14, p.wood); box(.08, .96, .84, .025, 10, p.woodLight, 2);
      if (f.variant === 'reel-recorder') { cylinder(.28, .35, Math.min(w, d) * .18, 3, p.paper, 14, 12); cylinder(.71, .35, Math.min(w, d) * .18, 3, p.paper, 14, 12); cylinder(.28, .35, 2.3, 1, p.metalDark, 17); cylinder(.71, .35, 2.3, 1, p.metalDark, 17); box(.17, .71, .66, .15, 2, p.metalLight, 14); }
      else { box(.15, .99, .38, .02, 8, p.fabric, 3); for (let i = 0; i < 4; i++) box(.18, 1, .31, .01, .55, p.woodLight, 4 + i * 2); box(.64, .99, .2, .02, 3, p.glass, 9); beam(.82, .3, 14, .85, .3, 28, 1, p.metalLight); }
      break;
    case 'jukebox':
      box(.03, .03, .94, .94, 32, p.wood); box(.13, .02, .74, .94, 8, p.accent, 32); box(.19, .08, .62, .83, 7, p.glow, 40); box(.16, .97, .68, .04, 13, p.glow, 22); box(.28, .997, .44, .02, 8, p.glass, 24); box(.17, .97, .66, .04, 12, p.fabric, 5);
      for (let i = 0; i < 5; i++) box(.22, 1.015, .56, .01, .7, p.fabricLight, 7 + i * 2); box(.07, .96, .08, .07, 29, p.glow, 4); box(.85, .96, .08, .07, 29, p.glow, 4); break;
    case 'phone':
      box(.12, .2, .76, .66, 8, p.wood); cylinder(.5, .57, Math.min(w, d) * .18, 2, p.metalLight, 8, 12); cylinder(.5, .57, Math.min(w, d) * .07, .8, p.ink, 10); box(.18, .15, .64, .13, 4, p.ink, 13); box(.1, .12, .21, .21, 6, p.ink, 10); box(.69, .12, .21, .21, 6, p.ink, 10); beam(.2, .32, 11, .16, .76, 8, 1.2, p.ink); break;
    case 'phone-switchboard':
      box(.03, .03, .94, .32, 36, p.wood); box(.08, .33, .84, .07, 26, p.metal, 7); legs(18); box(.04, .4, .92, .53, 3, p.woodLight, 19);
      for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) box(.16 + col * .12, .409, .045, .025, 2, (row + col) % 3 ? p.metalDark : p.glow, 10 + row * 8);
      for (let i = 0; i < 5; i++) { beam(.2 + i * .13, .4, 20, .2 + i * .13, .76, 21, 1, p.fabric); box(.18 + i * .13, .75, .05, .07, 2, p.metal, 22); } break;
    case 'washer':
      box(.05, .04, .9, .92, 29, p.paper); box(.07, .97, .86, .03, 6, p.metalLight, 22); box(.64, 1, .18, .02, 3, p.glass, 24);
      box(.21, .985, .58, .028, 15, p.metal, 5); box(.29, 1.015, .42, .022, 11, p.glass, 7); box(.39, 1.038, .21, .01, 5, p.glassLight || p.paper, 12); break;
    case 'helm':
      tabletop(17); beam(.5, .47, 18, .5, .47, 37, 3, p.wood); for (let i = 0; i < 8; i++) { const angle = i * Math.PI / 4; beam(.5, .47, 31, .5 + Math.sin(angle) * .32, .47, 31 + Math.cos(angle) * 10, 2, p.woodLight); }
      beam(.18, .47, 31, .26, .47, 38, 2, p.wood); beam(.26, .47, 38, .5, .47, 41, 2, p.wood); beam(.5, .47, 41, .74, .47, 38, 2, p.wood); beam(.74, .47, 38, .82, .47, 31, 2, p.wood); beam(.82, .47, 31, .74, .47, 24, 2, p.wood); beam(.74, .47, 24, .5, .47, 21, 2, p.wood); beam(.5, .47, 21, .26, .47, 24, 2, p.wood); beam(.26, .47, 24, .18, .47, 31, 2, p.wood); break;
    case 'clock':
      box(.16, .17, .68, Math.min(.18, 5 / d), 24, p.wood, 12); box(.23, .17 + Math.min(.18, 5 / d), .54, .018, 18, p.paper, 15); box(.48, .19 + Math.min(.18, 5 / d), .035, .018, 9, p.ink, 21); box(.49, .19 + Math.min(.18, 5 / d), .2, .018, 1, p.ink, 22); break;
    case 'scroll':
      box(.16, .1, .68, .8, .6, p.paper, 1.9); box(.08, .04, .84, .07, 2.4, p.woodLight, 1.7); box(.08, .89, .84, .07, 2.4, p.woodLight, 1.7);
      for (let i = 0; i < 5; i++) box(.27, .23 + i * .11, .2 + i % 3 * .07, .018, .2, p.ink, 2.6); break;
    case 'cushion':
      box(.06, .09, .88, .82, 3, color); box(.15, .2, .7, .6, 2, p.fabricLight, 3); box(.45, .43, .1, .1, .5, color, 5); break;
    case 'banner':
      box(.07, .1, .86, Math.min(.14, 4 / d), 1.8, p.woodLight, 39); box(.16, .15, .68, Math.min(.08, 2.5 / d), 31, color, 8); box(.31, .15 + Math.min(.08, 2.5 / d), .38, .015, 10, p.paper, 20); box(.4, .17 + Math.min(.08, 2.5 / d), .2, .015, 6, color, 22); break;
    default:
      box(.05, .05, .9, .9, 22, p.wood); box(.1, .95, .8, .05, 14, p.woodLight, 4); handle(.44, .99, 13); break;
  }
}

export function buildInterior3D(kit, theme, interior) {
  const p = PALETTES[theme] || PALETTES.lynch;
  const { width, height } = interior.size;
  kit.box(0, 0, width, height, 4, p.woodDark, -4);
  for (const room of interior.rooms) roomFloor(kit, room, p);
  // Low perimeter and partitions are intentional cutaways. The exact authored
  // floor footprint remains visible even when the player rotates the camera.
  const wall = (x, y, w, d, h) => {
    if (w <= 0 || d <= 0) return;
    kit.box(x, y, w, d, h, p.wall);
    kit.box(x, y, w, d, 2, p.wallLight, h);
    kit.box(x, y, w, d, 3, p.trim, 0);
  };
  wall(0, 0, width, 56, 48);
  wall(0, 56, 32, height - 56, 30);
  wall(width - 32, 56, 32, height - 56, 30);
  const left = Math.max(32, interior.exit.x - 40), right = Math.min(width - 32, interior.exit.x + 40);
  wall(32, height - 32, left - 32, 32, 20);
  wall(right, height - 32, width - 32 - right, 32, 20);
  for (const item of interior.walls) wall(item.x, item.y, item.width, item.height, 28);
  kit.box(left, height - 32, Math.max(1, right - left), 32, .6, p.woodLight, .05);
  for (const f of interior.furniture) furnishing(kit, f, p, theme);
  // Windows are actual recessed-looking panel geometry in the rear cutaway.
  const panelCount = Math.min(4, Math.max(1, Math.floor((width - 120) / 240)));
  for (let i = 0; i < panelCount; i++) {
    const xx = 68 + i * (width - 136) / panelCount;
    kit.box(xx, 54, 42, 2, 24, p.trim, 16);
    kit.box(xx + 3, 56, 36, 1.2, 18, p.glass, 19);
    kit.box(xx + 20, 56.5, 2, 1.2, 18, p.wallLight, 19);
    kit.box(xx + 3, 56.5, 36, 1.2, 2, p.wallLight, 27);
  }
}

const SCALE = 1 / 24;
const FACINGS = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };
function hash(value) { let h = 7; for (const c of String(value || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

function mergeArticulatedPart(part, material) {
  const pieces = part.children.filter(child => child.isMesh);
  if (!pieces.length) return;
  const temporary = [];
  let vertexCount = 0;
  for (const mesh of pieces) {
    mesh.updateMatrix();
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrix);
    temporary.push({ geometry, color: mesh.material.color });
    vertexCount += geometry.attributes.position.count;
  }
  const positions = new Float32Array(vertexCount * 3), normals = new Float32Array(vertexCount * 3), colors = new Float32Array(vertexCount * 3);
  let offset = 0;
  for (const { geometry, color } of temporary) {
    const position = geometry.attributes.position, normal = geometry.attributes.normal;
    positions.set(position.array, offset); normals.set(normal.array, offset);
    for (let index = 0; index < position.count; index++) {
      colors[offset + index * 3] = color.r; colors[offset + index * 3 + 1] = color.g; colors[offset + index * 3 + 2] = color.b;
    }
    offset += position.count * 3; geometry.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  const merged = new THREE.Mesh(geometry, material); merged.castShadow = true;
  for (const mesh of pieces) part.remove(mesh);
  part.add(merged);
}

// Resources are shared only inside one actor. A later game never inherits a
// material or buffer that the previous game's renderer already disposed.
export function createActor3D(theme, entity = {}) {
  const actor = new THREE.Group();
  const body = new THREE.Group(); actor.add(body);
  const geometries = new Map(), materials = new Map();
  const material = color => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .96, metalness: 0, flatShading: true }));
    return materials.get(color);
  };
  const meshBox = (parent, x, elevation, z, w, h, d, color) => {
    const key = `b:${w}:${h}:${d}`;
    if (!geometries.has(key)) geometries.set(key, new THREE.BoxGeometry(w * SCALE, h * SCALE, d * SCALE));
    const mesh = new THREE.Mesh(geometries.get(key), material(color));
    mesh.position.set(x * SCALE, (elevation + h / 2) * SCALE, z * SCALE);
    mesh.castShadow = true; parent.add(mesh); return mesh;
  };
  const cone = (parent, x, elevation, z, radius, height, color, tilt = 0) => {
    const key = `c:${radius}:${height}`;
    if (!geometries.has(key)) geometries.set(key, new THREE.ConeGeometry(radius * SCALE, height * SCALE, 4));
    const mesh = new THREE.Mesh(geometries.get(key), material(color)); mesh.position.set(x * SCALE, (elevation + height / 2) * SCALE, z * SCALE); mesh.rotation.z = tilt; mesh.castShadow = true; parent.add(mesh); return mesh;
  };
  const npc = entity.type === 'npc', clone = entity.type === 'clone', enemy = entity.type === 'enemy';
  const key = entity.kind || entity.role || entity.storyData?.role || '', seed = hash(entity.name || key || entity.id);
  const player = !npc && !enemy;
  const shinobi = theme === 'shinobi';
  const skin = ['#e7bd92', '#cf9d77', '#eed1a3', '#b98465'][npc ? seed % 4 : 0];
  let hair = shinobi && player ? '#f6ca4f' : npc ? ['#5a4942', '#414552', '#746154', '#c1ad8a'][seed % 4] : '#463f46';
  let coat = shinobi ? player ? '#ee9144' : enemy ? '#66546d' : ['#5f7e66', '#79955e', '#699392', '#b17655'][seed % 4] : player ? '#a2816a' : enemy ? '#253341' : ['#a56b67', '#718e82', '#748999', '#bc955e', '#7b6884'][seed % 5];
  const trouser = shinobi ? '#344c62' : '#505461', shoe = '#374251';
  if (key === 'double') { coat = '#403b56'; hair = '#ded0c4'; }
  if (key === 'elder' || key === 'leader') { coat = '#d0bd8b'; hair = '#ccc5a9'; }
  if (key === 'ranger' && shinobi) coat = '#70915d';
  if (key === 'rival' && shinobi) { coat = '#53678c'; hair = '#353a4b'; }
  if (key === 'merchant' && shinobi) coat = '#e3b887';
  const legs = [], arms = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * 3.6 * SCALE, 13 * SCALE, 0); body.add(leg);
    meshBox(leg, 0, -11, 0, 5.3, 11, 6, trouser); meshBox(leg, 0, -13, 1.4, 5.5, 3, 8, shoe);
    if (shinobi) { meshBox(leg, 0, -8, .1, 5.5, 2, 6.2, '#d4d5bb'); meshBox(leg, 0, -11, 5, 5.6, 1.4, 1.4, skin); }
    legs.push(leg);
    const arm = new THREE.Group(); arm.position.set(side * 8.4 * SCALE, 26 * SCALE, 0); body.add(arm);
    meshBox(arm, 0, -8, 0, 4.5, 8, 5.2, coat); meshBox(arm, 0, -12, .4, 3.4, 4, 4, skin);
    if (shinobi) meshBox(arm, 0, -9, 0, 4.7, 2, 5.5, '#d5d4bc');
    arms.push(arm);
  }
  meshBox(body, 0, 13, 0, 13.6, 15, 8.2, coat);
  meshBox(body, 0, 13, .2, 14, 2.2, 8.7, shinobi ? '#536473' : '#6e5d55');
  meshBox(body, 0, 28, 0, 4, 3, 4.8, skin);
  const head = new THREE.Group(); head.position.y = 30 * SCALE; body.add(head);
  meshBox(head, 0, 0, 0, 11.6, 10, 10.6, enemy && !shinobi ? '#34414d' : skin);
  meshBox(head, 0, 8.4, -.9, 12.2, 3.3, 11.2, hair); meshBox(head, -5.4, 2.8, -1, 2.4, 7.7, 9, hair); meshBox(head, 5.4, 3.8, -2, 2.3, 6.7, 7.6, hair);
  meshBox(head, 0, 1.3, 5.5, 1.4, 1.5, 1.5, skin);
  meshBox(head, -2.7, 4, 5.5, 1.5, 1.5, .55, shinobi && player ? '#457ba0' : '#34434e'); meshBox(head, 2.7, 4, 5.5, 1.5, 1.5, .55, shinobi && player ? '#457ba0' : '#34434e');
  meshBox(head, 0, 1.1, 5.7, 2.4, .6, .45, '#a46f60');
  if (shinobi) {
    meshBox(head, 0, 6.8, 0, 12.8, 2.2, 11.8, '#405d76'); meshBox(head, 0, 6.9, 6.15, 8, 1.9, .7, '#cad0bd');
    meshBox(head, 0, 7.1, 6.6, 1.7, 1.3, .4, '#6b7c80'); meshBox(head, 1.5, 7.5, 6.65, 1.8, .5, .45, '#6b7c80');
    // Knotted protector ties and an asymmetrical back pouch read from all sides.
    meshBox(head, 4.2, 6.9, -6.3, 3.1, 2, 2.8, '#405d76'); meshBox(head, 5.6, 5.9, -9, 2, 1.1, 6, '#567687');
    meshBox(body, 5.1, 14, -5.4, 5, 5, 3.7, '#b7a78c');
    if (player) {
      for (const [xx, zz, hh, tilt] of [[-5,-1,5,-.45],[-2,-3,5,-.2],[1,-2,6,.12],[4,-1,5,.38],[0,2,4,0]]) cone(head, xx, 10.1, zz, 2.4, hh, hair, tilt);
      meshBox(body, 0, 24.6, 4.5, 13, 3.6, 1, '#eed8ac'); meshBox(body, 0, 16, 4.4, .8, 9, .7, '#dfc6a3');
      for (const side of [-1,1]) for (let i=0;i<2;i++) meshBox(head, side*4.1, 2.5+i*1.4, 5.6, 1.9, .38, .45, '#ac875f');
    } else if (!enemy && !['merchant', 'elder', 'quartermaster'].includes(key)) {
      meshBox(body, 0, 16, 4.5, 11.2, 10.7, 1.8, '#789363'); meshBox(body, -3.2, 17, 5.6, 3.5, 4.5, 1, '#9fb47b'); meshBox(body, 3.2, 17, 5.6, 3.5, 4.5, 1, '#9fb47b');
    }
    if (enemy) { meshBox(head, 0, .5, 5.8, 11.6, 3.3, .7, '#506372'); meshBox(body, 7.3, 12, 1.8, 1.4, 14, 1.4, '#c7d1bf'); }
    if (key === 'elder') { meshBox(head, 0, .2, 5.9, 6, 3.7, .8, '#e4ddc2'); meshBox(body, 0, 17, 4.8, 2.2, 9, 1, '#b85d4e'); }
  } else {
    meshBox(body, -3.1, 19, 4.5, 4, 8, .9, '#d1bea3'); meshBox(body, 3.1, 19, 4.5, 4, 8, .9, '#c1a98a'); meshBox(body, 0, 18, 5.1, 1.7, 8.4, .8, '#75617c');
    if (player) { meshBox(body, 0, 19, 6, 7.5, 5.5, 3.8, '#4a5965'); meshBox(body, 0, 20, 8.1, 3.4, 3.4, 1.2, '#a2babe'); meshBox(body, 3.4, 24.5, 6.2, 2.4, 1.8, 2.4, '#edc78b'); meshBox(arms[1], 0, -11, 2.9, 3.4, 4.8, 3.4, '#cfb581'); }
    if (key === 'guide') { meshBox(head, 0, 10.2, 0, 16, 1.5, 13, '#88745e'); meshBox(head, 0, 11.7, -1, 10.8, 3.8, 8.5, '#aa9070'); }
    if (key === 'operator') meshBox(body, 0, 25, 4.6, 10, 3, 1, '#ddc39c');
    if (enemy) {
      for (let i = 0; i < 6; i++) meshBox(body, -3 + (i % 3) * 3, 15 + i * 3.4, 4.9, 4 + i % 2, .7, .7, i % 2 ? '#7b9295' : '#afbbb0');
      meshBox(head, -2.7, 4, 5.9, 1.5, 1.5, .6, '#efdfb2'); meshBox(head, 2.7, 4, 5.9, 1.5, 1.5, .6, '#efdfb2');
    }
  }
  actor.userData.animation = { body, head, arms, legs, seed, shinobi, enemy, clone, restY: body.position.y };
  actor.userData.kind = entity.type || 'player';
  // Keep one draw call for each animated body part rather than one for every
  // eye, pocket, hair spike and sandal wrap. The individual volumes remain real
  // geometry; vertex colors retain all their authored palette details.
  if (clone) for (const mat of materials.values()) mat.color.lerp(new THREE.Color('#a1d8df'), .25);
  const articulatedMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96, metalness: 0, flatShading: true, transparent: clone, opacity: clone ? .62 : 1, depthWrite: !clone });
  for (const part of [body, head, ...arms, ...legs]) mergeArticulatedPart(part, articulatedMaterial);
  for (const geometry of geometries.values()) geometry.dispose();
  for (const mat of materials.values()) mat.dispose();
  updateActor3D(actor, entity, 0);
  return actor;
}

export function updateActor3D(group, entity = {}, time = 0) {
  const animation = group.userData.animation;
  if (!animation) return;
  const { body, head, arms, legs, seed, enemy, clone, shinobi } = animation;
  group.rotation.y = FACINGS[entity.facing] ?? (enemy ? Math.sin(time * .24 + seed) * .22 : 0);
  const walking = !!entity.moving || !!entity.walking || (enemy && !!entity.alerted);
  const cadence = entity.sprinting ? 13 : 9;
  const swing = walking ? Math.sin(time * cadence) * (entity.sprinting ? .67 : .47) : Math.sin(time * 1.6 + seed) * .025;
  legs[0].rotation.x = swing; legs[1].rotation.x = -swing;
  arms[0].rotation.x = -swing * .75; arms[1].rotation.x = swing * .75;
  const attacking = entity.attacking > 0;
  if (attacking) { arms[1].rotation.x = -1.12; arms[0].rotation.x = shinobi ? -.55 : -.6; }
  body.position.y = (walking ? Math.abs(Math.sin(time * cadence)) * .8 : Math.sin(time * 1.7 + seed) * .2) * SCALE;
  body.rotation.z = enemy && !shinobi ? Math.sin(time * 3 + seed) * .025 : 0;
  head.rotation.y = walking || attacking ? 0 : Math.sin(time * .48 + seed) * .065;
  group.visible = !entity.defeated;
  if (clone) group.scale.setScalar(.98 + Math.sin(time * 7 + seed) * .014);
}
