import type { ActorDef, ObjectKind, Region, TileKind, Vec, WorldData, WorldObject, WorldScene } from './types';

/** Original, replaceable world illustration and layouts. One unit is one simulation tile. */
const SEED = 914729;
export function worldHash(x: number, y: number, seed = SEED): number {
  let n = Math.imul(x + 13, 374761393) ^ Math.imul(y + 29, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

const regions: Region[] = [
  { id: 'entrance', name: 'The Unenterable Entrance', subtitle: 'Another queue at the end of the road', x: 2, y: 112, width: 29, height: 30, color: '#8e9b71', landmark: { x: 18, y: 124 } },
  { id: 'shanty', name: 'The Shanty Hours', subtitle: 'Damp caravans. The rent outlives you.', x: 28, y: 91, width: 34, height: 38, color: '#a28766', landmark: { x: 45, y: 106 } },
  { id: 'library', name: 'Library of Time Well Spent', subtitle: 'Every minute has a due date', x: 9, y: 56, width: 39, height: 35, color: '#8e9b71', landmark: { x: 30, y: 76 } },
  { id: 'lake', name: 'Lake of Tasteful Scarcity', subtitle: 'An appropriate resource density', x: 59, y: 85, width: 44, height: 49, color: '#8e9b71', landmark: { x: 64, y: 113 } },
  { id: 'forest', name: 'Cigarillo Forest', subtitle: 'Smoke caught in the living branches', x: 53, y: 31, width: 50, height: 52, color: '#8e9b71', landmark: { x: 82, y: 56 } },
  { id: 'fields', name: 'Fields of Egregious Abundance', subtitle: 'Admission strictly by permit', x: 104, y: 76, width: 48, height: 29, color: '#c1ad87', landmark: { x: 122, y: 87 } },
  { id: 'museum', name: 'Museum of the Supine', subtitle: 'Your hunger pays for these pictures', x: 104, y: 107, width: 49, height: 33, color: '#9da59e', landmark: { x: 128, y: 121 } },
  { id: 'hospital', name: 'Hospital for Those Out of Time', subtitle: 'Please continue breathing in order', x: 3, y: 23, width: 44, height: 31, color: '#9da59e', landmark: { x: 27, y: 42 } },
  { id: 'pit', name: 'The Pit of Reversion', subtitle: 'An island that is a hole', x: 44, y: 3, width: 41, height: 26, color: '#8e9b71', landmark: { x: 58, y: 24 } },
  { id: 'casino', name: 'The Last Minute', subtitle: 'An evening you will never get back', x: 135, y: 44, width: 42, height: 31, color: '#a28766', landmark: { x: 158, y: 65 } },
  { id: 'castle', name: 'Great Castle Divine', subtitle: 'Near the far reaches of Limited Time', x: 98, y: 3, width: 78, height: 39, color: '#9da59e', landmark: { x: 136, y: 30 } },
  { id: 'infinite', name: 'The Entrance to Infinite Time', subtitle: 'The other side is not taking applications', x: 4, y: 3, width: 36, height: 17, color: '#beb7a4', landmark: { x: 23, y: 14 } },
];

function makeScene(id: string, name: string, location: string, width: number, height: number, outdoors: boolean, spawn: Vec): WorldScene {
  return { id, name, location, width, height, tiles: Array<TileKind>(width * height).fill(outdoors ? 'grass' : 'void'), objects: [], actors: [], spawn, outdoors };
}
function tile(scene: WorldScene, x: number, y: number, kind: TileKind) {
  x = Math.floor(x); y = Math.floor(y);
  if (x >= 0 && y >= 0 && x < scene.width && y < scene.height) scene.tiles[y * scene.width + x] = kind;
}
function rect(scene: WorldScene, x: number, y: number, width: number, height: number, kind: TileKind) {
  for (let j = Math.floor(y); j < y + height; j++) for (let i = Math.floor(x); i < x + width; i++) tile(scene, i, j, kind);
}
function ellipse(scene: WorldScene, cx: number, cy: number, rx: number, ry: number, kind: TileKind) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    if (((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 <= 1) tile(scene, x, y, kind);
  }
}
function road(scene: WorldScene, points: Vec[], width = 3, kind: TileKind = 'path') {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const distance = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.ceil(distance * 2);
    for (let j = 0; j <= steps; j++) {
      const t = j / Math.max(1, steps);
      ellipse(scene, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, width / 2 + .3, width / 2 + .3, kind);
    }
  }
}
function object(scene: WorldScene, kind: ObjectKind, x: number, y: number, rest: Partial<WorldObject> = {}): WorldObject {
  const obj: WorldObject = { id: `${scene.id}-${kind}-${scene.objects.length}`, kind, x, y, solid: ['tree', 'willow', 'rock', 'ore', 'building', 'well', 'bookshelf', 'machine', 'table', 'bed', 'chest'].includes(kind), ...rest };
  scene.objects.push(obj); return obj;
}
function actor(scene: WorldScene, id: string, name: string, kind: ActorDef['kind'], x: number, y: number, dialogueScene: string, role: string, rest: Partial<ActorDef> = {}) {
  scene.actors.push({ id, name, kind, x, y, location: scene.location, scene: dialogueScene, role, roam: 0, ...rest });
}
function sign(scene: WorldScene, x: number, y: number, label: string, text: string, billboard = false) {
  object(scene, 'sign', x, y, { label, text, color: billboard ? '#a28766' : '#c1ad87', variant: billboard ? 1 : 0 });
}
function building(scene: WorldScene, x: number, y: number, w: number, h: number, label: string, doorScene: WorldScene, color: string, variant = 0) {
  rect(scene, x - 2, y - 2, w + 4, h + 5, 'stone');
  object(scene, 'building', x, y, { width: w, height: h, label, color, variant, door: { scene: doorScene.id, position: doorScene.spawn } });
  doorScene.exit = { scene: 'overworld', position: { x: x + w / 2, y: y + h + 1.5 }, positionInRoom: { x: doorScene.width / 2, y: doorScene.height - 2.5 } };
  object(scene, 'lantern', x + 1, y + h + 1, { color: '#d5bd78' });
  object(scene, 'lantern', x + w - 1, y + h + 1, { color: '#d5bd78' });
}
function room(id: string, name: string, location: string, w: number, h: number, stone = false): WorldScene {
  const scene = makeScene(id, name, location, w, h, false, { x: w / 2, y: h - 4.5 });
  rect(scene, 1, 2, w - 2, h - 3, stone ? 'stoneFloor' : 'woodFloor');
  rect(scene, w / 2 - 1, h - 3, 2, 2, 'woodFloor');
  for (let x = 3; x < w - 3; x += 6) object(scene, 'window', x, 2.1, { solid: false });
  for (let x = 3; x < w - 2; x += 8) object(scene, 'lantern', x, 3, { solid: false });
  return scene;
}

export function createWorld(): WorldData {
  const world = makeScene('overworld', 'The Land of Limited Time', 'entrance', 180, 144, true, { x: 18, y: 124 });
  const interiors: Record<string, WorldScene> = {};
  // Saltwater rim, wooded slopes, and marsh shore. The connecting roads are laid last.
  for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
    const edge = Math.min(x, y, world.width - 1 - x, world.height - 1 - y);
    if (edge < 2) tile(world, x, y, 'deepWater');
    else if (edge < 4) tile(world, x, y, 'water');
    else if (edge < 5) tile(world, x, y, 'sand');
    else if (worldHash(Math.floor(x / 6), Math.floor(y / 6)) > .75) tile(world, x, y, 'darkGrass');
  }
  ellipse(world, 80, 104, 20, 18, 'sand');
  ellipse(world, 80, 104, 18, 16, 'water');
  ellipse(world, 82, 104, 13, 11, 'deepWater');
  ellipse(world, 60, 14, 13, 8, 'stone');
  ellipse(world, 60, 14, 10, 6, 'void');
  ellipse(world, 85, 54, 27, 23, 'darkGrass');
  ellipse(world, 160, 125, 8, 7, 'water');
  ellipse(world, 18, 97, 5, 4, 'water');
  ellipse(world, 110, 58, 6, 4, 'water');
  ellipse(world, 34, 12, 4, 3, 'water');
  rect(world, 105, 5, 62, 26, 'stone');
  rect(world, 107, 77, 43, 24, 'dirt');
  for (let y = 80; y < 99; y += 4) rect(world, 111, y, 33, 2, 'tilled');

  // Every region is reachable along these continuous, generously wide public paths.
  const roads: Vec[][] = [
    [{ x: 18, y: 132 }, { x: 18, y: 120 }, { x: 32, y: 115 }, { x: 45, y: 106 }],
    [{ x: 45, y: 106 }, { x: 41, y: 93 }, { x: 30, y: 76 }],
    [{ x: 30, y: 76 }, { x: 27, y: 61 }, { x: 27, y: 42 }],
    [{ x: 27, y: 42 }, { x: 27, y: 28 }, { x: 23, y: 14 }],
    [{ x: 27, y: 42 }, { x: 43, y: 34 }, { x: 58, y: 24 }],
    [{ x: 45, y: 106 }, { x: 57, y: 109 }, { x: 64, y: 113 }],
    [{ x: 45, y: 106 }, { x: 53, y: 92 }, { x: 63, y: 74 }, { x: 82, y: 56 }],
    [{ x: 82, y: 56 }, { x: 103, y: 70 }, { x: 122, y: 87 }],
    [{ x: 122, y: 87 }, { x: 129, y: 105 }, { x: 128, y: 121 }],
    [{ x: 64, y: 113 }, { x: 65, y: 125 }, { x: 108, y: 127 }, { x: 128, y: 121 }],
    [{ x: 122, y: 87 }, { x: 148, y: 82 }, { x: 158, y: 65 }],
    [{ x: 82, y: 56 }, { x: 96, y: 43 }, { x: 117, y: 38 }, { x: 136, y: 30 }],
    [{ x: 158, y: 65 }, { x: 158, y: 44 }, { x: 136, y: 30 }],
    [{ x: 58, y: 24 }, { x: 79, y: 24 }, { x: 97, y: 34 }, { x: 117, y: 38 }],
  ];
  for (const points of roads) road(world, points, 3);
  // A wooden public jetty provides a safe place to fish without crossing deep water.
  rect(world, 64, 111, 10, 3, 'woodFloor');
  rect(world, 71, 108, 3, 9, 'woodFloor');
  rect(world, 57, 21, 3, 4, 'stone');
  rect(world, 19, 10, 8, 6, 'stone');

  const library = room('library-room', 'Library of Time Well Spent', 'library', 30, 26);
  const hospital = room('hospital-room', 'Hospital for Those Out of Time', 'hospital', 34, 27, true);
  const museum = room('museum-room', 'Museum of the Supine', 'museum', 40, 30, true);
  const casino = room('casino-room', 'The Last Minute', 'casino', 34, 26);
  const castle = room('castle-room', 'The Constantly Observed Room', 'castle', 44, 36, true);
  const pipRoom = room('pip-room', 'Pip’s Little Hour', 'shanty', 16, 16);
  const adaRoom = room('ada-room', 'Tomorrow’s Workshop', 'shanty', 21, 18);
  const mill = room('mill-room', 'The Ministry of Plenty', 'fields', 23, 20);
  const gateOffice = room('gate-room', 'Department of Proper Refusals', 'entrance', 19, 17);
  for (const scene of [library, hospital, museum, casino, castle, pipRoom, adaRoom, mill, gateOffice]) interiors[scene.id] = scene;

  // The entrance: an extravagant threshold beside an entirely ordinary side path.
  object(world, 'gate', 12, 115, { width: 12, height: 4, solid: false, label: 'The Unenterable Entrance', variant: 0 });
  building(world, 7, 126, 5, 4, 'Proper Refusals', gateOffice, '#708a8c', 0);
  sign(world, 23, 124, 'Welcome to the Land of Limited Time', 'WE WISH TO ENTER.\nThe forms were pulped last winter for insulation. Refusal is still in force. Follow the drainage ditch.');
  sign(world, 14, 131, 'Be Yourself. Be Divine.', 'Lady Supine wishes you a tasteful amount of everything. Your empty cupboard is the correct amount. Experience the Divine on Channel 9.', true);
  actor(world, 'gatekeeper', 'The Gatekeeper', 'gatekeeper', 18, 122.7, 'gate_arrival', 'Keeper of the threshold');
  object(world, 'bench', 22, 130, { color: '#78634a' });
  object(world, 'lantern', 12, 121); object(world, 'lantern', 24, 121);
  object(gateOffice, 'table', 7, 8, { width: 5, height: 2, label: 'The refusal ledger' });
  object(gateOffice, 'bookshelf', 2, 3, { width: 5, height: 1 });
  sign(gateOffice, 14, 7, 'Customer service', 'The office was closed after the roof came in. Applications are still charged. Please slide your remaining minutes beneath the door.');

  // Caravans slowly repaired with the parts of other caravans. A fire fed with broken furniture costs less than heating a room.
  rect(world, 37, 99, 21, 15, 'dirt');
  road(world, [{ x: 45, y: 96 }, { x: 45, y: 117 }], 3);
  building(world, 35, 99, 6, 5, 'Pip’s Little Hour', pipRoom, '#a45d47', 0);
  building(world, 49, 99, 8, 5, 'Tomorrow’s Workshop', adaRoom, '#637c61', 0);
  object(world, 'building', 34, 112, { width: 7, height: 5, label: 'Brindle’s House', color: '#a28766', variant: 0 });
  object(world, 'building', 50, 113, { width: 6, height: 4, label: 'The Common Pantry', color: '#757a78', variant: 0 });
  actor(world, 'pip', 'Pip', 'moth', 42.3, 105.4, 'pip_hello', 'A moth who finishes poems', { roam: 1.2 });
  actor(world, 'brindle', 'Brindle', 'ox', 43.2, 111.7, 'brindle_hello', 'A porter with gentle hands', { roam: 1 });
  actor(world, 'ada', 'Ada', 'hare', 51.5, 106.8, 'ada_hello', 'Repairs tomorrow', { roam: 1 });
  actor(world, 'huckster', 'The Huckster', 'merchant', 49, 115.5, 'coupon_counter', 'A vendor of borrowed minutes');
  actor(world, 'mouse-neighbour', 'A small neighbour', 'mouse', 50, 111, 'shanty_arrival', 'Waiting for the kettle to work again', { roam: 3, dialogue: 'The kettle broke last winter. We still gather around it. I do not know what else to call that.' });
  actor(world, 'mrs-thimble', 'Mrs. Thimble', 'boar', 39, 109.4, 'town_whispers', 'Keeper of the common pantry', { roam: 1.3 });
  object(world, 'campfire', 47.8, 109.1, { label: 'A fire fed with broken furniture', solid: false });
  object(world, 'workbench', 54.8, 108.5, { label: 'Ada’s public workbench', solid: true });
  object(world, 'well', 40, 107.5, { label: 'A shared tap that tastes of rust' });
  object(world, 'bench', 45, 111.2, { color: '#78634a' });
  object(world, 'bench', 49.8, 110.4, { color: '#78634a' });
  object(world, 'sign', 44, 115, { id: 'shanty-noticeboard', label: 'The Shanty Hours', text: 'scene:shanty_arrival', solid: false });
  object(world, 'chest', 38.8, 114.5, { label: 'The common supply chest', text: 'Salvaged from a caravan whose owner did not come home. Take what will keep you moving.', resource: { item: 'wood', amount: 8, health: 1 } });
  for (let y = 106; y < 111; y += 2) for (let x = 55; x < 60; x += 1.5) {
    tile(world, x, y, 'tilled'); object(world, 'crop', x + .5, y + .5, { variant: 2, resource: { item: 'herb', amount: 1, health: 1 }, solid: false });
  }
  object(pipRoom, 'bed', 3, 6, { width: 3, height: 3, label: 'A mattress turned away from the leak' });
  object(pipRoom, 'table', 10, 7, { width: 3, height: 2 });
  object(pipRoom, 'rug', 6, 10, { width: 5, height: 3, color: '#a28766', solid: false });
  object(pipRoom, 'bookshelf', 2, 3, { width: 5, height: 1 });
  sign(pipRoom, 11.5, 4.5, 'A poem pinned to the wall', 'Lady Supine\nWill grant us time\nWhen we feed her\nCurly willow.');
  object(adaRoom, 'workbench', 5, 7, { width: 4, height: 2, label: 'The clockmaker’s bench' });
  object(adaRoom, 'machine', 14, 6, { label: 'An unfinished tomorrow', variant: 1 });
  object(adaRoom, 'bed', 3, 11, { width: 3, height: 3 });
  object(adaRoom, 'bookshelf', 2, 3, { width: 5, height: 1 });
  sign(adaRoom, 15, 12, 'Repair notice', 'Clocks repaired. No guarantee. The wiring in this place is older than anyone who still lives here.');

  building(world, 20, 64, 20, 10, 'Library of Time Well Spent', library, '#757a78', 1);
  actor(world, 'library-usher', 'Page', 'mouse', 34, 77, 'library_arrival', 'A very small librarian', { dialogue: 'Vellum is inside. The shelves smell of wet cardboard. They will charge you for reading, then tell you the rain ruined the records.' });
  sign(world, 24, 77, 'Library of Time Well Spent', 'Speak to Lady Supine, for she is the Keeper of Limited Time.\nThe library roof was repaired with the missing names from the register.');
  object(world, 'bench', 37, 78); object(world, 'well', 20, 77);
  for (let y = 5; y <= 15; y += 5) for (const x of [3, 21]) object(library, 'bookshelf', x, y, { width: 6, height: 2, label: 'The due-date shelves' });
  object(library, 'table', 11, 7, { width: 7, height: 3, label: 'The catalogue desk' });
  object(library, 'table', 11, 16, { width: 6, height: 2, label: 'A shared reading table' });
  object(library, 'rug', 10, 19, { width: 10, height: 3, solid: false, color: '#637c61' });
  actor(library, 'vellum', 'Vellum', 'fox', 14.5, 11.6, 'library_arrival', 'Keeper of the due dates');
  actor(library, 'library-reader', 'A reader', 'deer', 7.5, 18.5, 'library_arrival', 'Reading slowly on purpose', { dialogue: 'I keep reading this paragraph. I used to understand it. Sometimes I think it is the only part of me they have not taken.' });
  sign(library, 19.5, 21, 'Reading-room notice', 'Thinking is not yet metered. Keep your face still. The Ministry notices when people start to look awake.');

  building(world, 17, 27, 20, 12, 'Hospital for Those Out of Time', hospital, '#9da59e', 2);
  sign(world, 22, 42, 'For those out of Time', 'Please continue breathing in order. Beds are assembled from the doors of condemned homes. Arriving empty-handed is usual.');
  actor(world, 'hospital-gardener', 'Yarrow', 'heron', 35, 43, 'hospital_arrival', 'Tending tomorrow’s herbs', { roam: 2, dialogue: 'I grow these in the gutter. They dull the pain. I used to grow things for other reasons.' });
  for (let x = 14; x <= 38; x += 6) object(world, 'flower', x, 44, { solid: false, variant: 2, resource: { item: 'herb', amount: 1, health: 1 } });
  object(world, 'bench', 29, 43); object(world, 'campfire', 36, 46);
  for (let y = 6; y < 21; y += 6) for (const x of [3, 26]) object(hospital, 'bed', x, y, { width: 4, height: 3, label: 'A bed and a borrowed name' });
  object(hospital, 'table', 13, 5, { width: 8, height: 3, label: 'The consent desk' });
  object(hospital, 'machine', 18, 14, { label: 'Mind continuity apparatus', variant: 1 });
  object(hospital, 'bookshelf', 2, 3, { width: 8, height: 1 });
  actor(hospital, 'doctor', 'Dr. Anima', 'tortoise', 16, 9.6, 'hospital_arrival', 'A doctor with dwindling supplies');
  actor(hospital, 'nurse', 'Nurse Reed', 'heron', 23, 18, 'hospital_arrival', 'Keeps the names, not the numbers', { dialogue: 'There is a bed when your time runs dry. The sheets are damp. I can stay until you stop shaking, but I cannot promise what comes after.' });
  sign(hospital, 10.5, 20, 'Continuity & consent', 'Consent must survive the cut. Do not let the Ministry number the bodies before we have finished asking their names.');

  actor(world, 'mallow', 'Mallow', 'otter', 68.2, 113.9, 'lake_arrival', 'An expert in few fish', { roam: .6 });
  object(world, 'bench', 65, 115.3, { color: '#757a78' });
  object(world, 'campfire', 60.8, 115.5, { label: 'The anglers’ fire' });
  sign(world, 61, 111, 'Lake of Tasteful Scarcity', 'Formerly Lake of Few Fish, Lake of Appropriate Resource Density, and Lake of Perpetual Disappointment.\nNothing improved after any of the changes.');
  sign(world, 72.3, 116, 'Fishing etiquette', 'Equip your fishing rod, face the water, and cast. Reel when the float gives a proper tug. Anything you catch is yours until somebody sees it.');
  for (let i = 0; i < 25; i++) {
    const a = i / 25 * Math.PI * 2, x = 80 + Math.cos(a) * 18.8, y = 104 + Math.sin(a) * 16.9;
    if (world.tiles[Math.floor(y) * world.width + Math.floor(x)] !== 'woodFloor') object(world, 'reed', x, y, { solid: false, resource: i % 4 === 0 ? { item: 'herb', amount: 1, health: 1 } : undefined });
  }

  rect(world, 76, 50, 13, 14, 'dirt');
  road(world, [{ x: 82, y: 49 }, { x: 82, y: 66 }], 3);
  actor(world, 'cinder', 'Cinder', 'deer', 80, 57.5, 'forest_arrival', 'The forester who listens', { roam: 1 });
  object(world, 'reed', 84, 57, { id: 'fallen-curly-willow', label: 'Fallen curly willow', variant: 8, solid: false, resource: { item: 'willow_fibre', amount: 3, health: 1 } });
  object(world, 'campfire', 84, 60, { label: 'A low fire in a salvaged drum' });
  object(world, 'willow', 87, 54, { width: 1, height: 1, label: 'Curly willow over a drainage ditch', color: '#9da59e', resource: { item: 'willow_fibre', amount: 4, health: 4 } });
  object(world, 'willow', 77, 52, { label: 'A willow surviving the runoff', resource: { item: 'willow_fibre', amount: 3, health: 4 } });
  sign(world, 79, 62, 'Cigarillo Forest', 'Smoke caught in the living branches. Please do not hurry them.\nAn Aristobat hears a running footfall from very far away.');
  object(world, 'workbench', 86, 63, { label: 'The forester’s bench' });

  actor(world, 'burrow', 'Burrow', 'mole', 117, 87, 'fields_arrival', 'Deputy assistant to the permit', { roam: .8 });
  actor(world, 'gardener', 'A gardener', 'deer', 126, 89, 'fields_abundance', 'A patient witness to plenty', { roam: 1 });
  building(world, 136, 78, 9, 8, 'Ministry of Plenty', mill, '#8e9b71', 0);
  sign(world, 111, 87, 'Egregious Abundance', 'The crop is left to rot in sight of the caravan park. It demonstrates what you could have, if your need were authorised.');
  sign(world, 147, 92, 'Be Yourself. Be Divine.', 'Your need has been reviewed. The quantity remains unchanged. A message from Lady Supine.', true);
  for (let y = 80; y < 100; y += 4) for (let x = 112; x < 134; x += 2) object(world, 'crop', x + .5, y + .5, { variant: (x + y) % 3, solid: false, resource: { item: 'herb', amount: 1, health: 1 } });
  for (let x = 109; x < 145; x += 2) if (x < 115 || x > 119) object(world, 'fence', x, 101, { solid: true, width: 1, height: .3 });
  object(mill, 'table', 6, 7, { width: 11, height: 3, label: 'The appropriate harvest ledger' });
  object(mill, 'machine', 17, 13, { label: 'A abundance limiter', variant: 1 });
  object(mill, 'chest', 4, 12, { label: 'A box of withheld carrots', resource: { item: 'herb', amount: 5, health: 1 } });

  building(world, 115, 108, 26, 10, 'Museum of the Supine', museum, '#c9968f', 1);
  sign(world, 117, 122, 'Museum of the Supine', 'MUSEUM OF THE SUBLIME.\nThe spelling was altered following an important artistic decision.');
  object(world, 'altar', 137, 122, { label: 'Be Yourself. Be Divine.', variant: 1, color: '#beb7a4' });
  actor(world, 'museum-attendant', 'The Attendant', 'peacock', 131, 121.5, 'museum_arrival', 'A curator of queues', { dialogue: 'The Curator is inside. The walls are plywood painted to look like marble. Nobody is permitted to call it plywood.' });
  object(museum, 'rug', 15, 5, { width: 10, height: 21, solid: false, color: '#725b70' });
  for (let i = 0; i < 4; i++) {
    object(museum, 'portrait', 5 + i * 9, 4, { variant: i, label: ['The Beauty of Having', 'The Unfinished Woman', 'The Supine Sublime', 'A Minute Kept'][i] });
    object(museum, 'altar', 5 + i * 9, 10, { variant: i % 2, color: '#beb7a4', label: 'Lady Supine, paid for by the missing hours' });
  }
  object(museum, 'table', 4, 19, { width: 7, height: 3, label: 'The blocks of exquisite proportion' });
  for (const x of [7, 33]) for (const y of [16, 25]) object(museum, 'altar', x, y, { variant: y === 16 ? 3 : 4, color: '#beb7a4', label: y === 16 ? 'Several acceptable proportions' : 'A minute kept behind glass' });
  for (const x of [11, 29]) { object(museum, 'portrait', x, 13, { variant: 2, label: 'An uncomfortably ordinary woman' }); object(museum, 'bench', x, 24, { color: '#8e9b71' }); }
  for (const x of [3, 37]) for (const y of [16, 25]) object(museum, 'bush', x, y, { solid: false, label: 'A decorative shrub turning brown' });
  actor(museum, 'curator', 'The Curator', 'peacock', 20, 15, 'museum_arrival', 'Registrar of Sublimity');
  actor(museum, 'critics', 'The Critics', 'fox', 12, 17, 'museum_critics', 'A connoisseur of officially correct feelings', { roam: .5 });
  object(museum, 'machine', 31, 20, { id: 'museum-telescreen', label: 'Lady Supine · Channel 9', text: 'scene:supine_telescreen', variant: 2 });
  sign(museum, 12.5, 22, 'A card tucked behind the frame', 'The varnish is blistering. Beneath it, the same enormous opening in the same human head. They paint over the wetness every morning.');

  sign(world, 54, 24, 'The Pit of Reversion', 'An island that is a hole.\nThe names on the markers were washed away before the bodies were cold.');
  object(world, 'altar', 60, 23, { label: 'The well of unwritten thoughts', color: '#757a78', text: 'The dark gives nothing back intact. Even the mud at the rim has forgotten what it used to cover.' });
  actor(world, 'pit-keeper', 'Before', 'salamander', 57, 25, 'pit_arrival', 'Keeper of beginnings and bad ideas', { roam: .5, color: '#708a8c' });
  actor(world, 'yesterday', 'Yesterday', 'salamander', 62.5, 25.8, 'pit_child', 'A salamander growing in both directions', { color: '#8e9b71' });
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    object(world, 'grave', 60 + Math.cos(a) * 13.4, 14 + Math.sin(a) * 8.8, { label: 'An unwritten name', text: 'There is nothing carved here. The stone was reused. You can still feel the old lettering beneath the whitewash.' });
  }
  object(world, 'ore', 49, 23, { color: '#beb7a4', resource: { item: 'ore', amount: 3, health: 5 } });
  object(world, 'ore', 67, 23, { color: '#beb7a4', resource: { item: 'ore', amount: 3, health: 5 } });

  building(world, 147, 50, 22, 12, 'The Last Minute', casino, '#a45d47', 3);
  sign(world, 152, 65, 'The Last Minute', 'Lady Supine only created the casino because they begged her.\nLady Supine only created the television because they begged her.\nLady Supine asks that you remember this.');
  sign(world, 170, 64, 'Experience the Divine on Channel 9', 'The carpet will never dry. Your last minutes are accepted at every table. There is no clock by the exit.', true);
  object(casino, 'rug', 10, 7, { width: 14, height: 14, solid: false, color: '#725b70' });
  for (const p of [{ x: 4, y: 7 }, { x: 23, y: 7 }, { x: 4, y: 15 }, { x: 23, y: 15 }]) object(casino, 'table', p.x, p.y, { width: 6, height: 3, variant: 1, color: '#445e68', label: 'A table with no sense of tomorrow' });
  actor(casino, 'hustler', 'Hustler', 'merchant', 17, 11, 'casino_arrival', 'The house’s smiling explanation');
  actor(casino, 'shyster', 'The Shyster', 'fox', 9, 12, 'casino_arrival', 'An unofficial certainty', { dialogue: 'I sell certainty. You can check the terms when you have enough time left to read them.' });
  actor(casino, 'swindler', 'The Swindler', 'boar', 27, 19, 'casino_arrival', 'Always happy to repeat himself', { dialogue: 'The trick is to remember what I said, rather than what you hoped I meant.' });
  actor(casino, 'casino-patron', 'An improbable winner', 'mouse', 7, 20, 'casino_arrival', 'Never quite standing still', { dialogue: 'I keep winning the same minute. I have forgotten who I was going home to.' });
  object(casino, 'machine', 28, 4, { label: 'Channel 9', variant: 2 });
  object(casino, 'machine', 17, 5, { id: 'god-switch', label: 'The God Switch', text: 'scene:casino_chapel', variant: 1 });

  building(world, 116, 8, 40, 19, 'Great Castle Divine', castle, '#9da59e', 4);
  const privateRoom = world.objects.find(o => o.kind === 'building' && o.door?.scene === castle.id)!;
  privateRoom.requiresFlag = 'minders_distracted';
  privateRoom.text = 'scene:castle_arrival';
  object(world, 'gate', 127, 32, { width: 18, height: 2, solid: false, label: 'The Aristobats’ listening gate', variant: 1 });
  road(world, [{ x: 136, y: 28 }, { x: 136, y: 39 }], 5, 'stone');
  object(world, 'altar', 112, 32, { variant: 1, color: '#ddd2ba', label: 'Lady Supine stands erect', text: 'The Lady pays no mind. The statue has been polished where every passing wing touches its knee.' });
  object(world, 'altar', 160, 32, { variant: 1, color: '#ddd2ba', label: 'Lady Supine stands erect' });
  sign(world, 132, 38, 'The Great Castle Divine', 'Near the far reaches of Limited Time.\nThe power stays on here when the caravan park freezes. Silence is appreciated. Privacy is not available.');
  actor(world, 'castle-minder', 'The First Minder', 'bat', 132, 29.5, 'castle_arrival', 'Excellent hearing. Limited understanding.', { dialogue: 'Her Ladyship is speaking through the screen. Her Ladyship is observed at all times. Your footsteps are being added to your account.' });
  object(castle, 'rug', 17, 5, { width: 10, height: 27, solid: false, color: '#725b70' });
  object(castle, 'bed', 19, 5, { width: 6, height: 5, color: '#c9968f', label: 'The bed before the pillow' });
  object(castle, 'table', 6, 7, { width: 7, height: 3 });
  object(castle, 'machine', 33, 7, { label: 'The God Switch sockets', variant: 1 });
  for (const p of [{ x: 5, y: 5 }, { x: 38, y: 5 }, { x: 5, y: 27 }, { x: 38, y: 27 }]) object(castle, 'machine', p.x, p.y, { variant: 2, label: 'The endlessly observing telescreen' });
  for (let x = 7; x <= 35; x += 7) object(castle, 'portrait', x, 3.5, { variant: x % 4, label: 'Be Yourself. Be Divine.' });
  for (const y of [15, 23, 30]) for (const x of [14, 30]) object(castle, 'altar', x, y, { variant: 2, solid: true, label: 'A pillar of excellent judgement' });
  for (const x of [11, 33]) { object(castle, 'sign', x, 18, { variant: 2, color: '#757a78', solid: false, label: 'Be Yourself. Be Divine.', text: 'The curtains are dyed blankets. Every whisper passes through them into the recording wire.' }); object(castle, 'bench', x, 25, { color: '#c1ad87' }); object(castle, 'portrait', x, 29, { variant: 1, label: 'The Lady is always looking' }); }
  for (const x of [6, 38]) for (const y of [14, 22, 30]) object(castle, 'lantern', x, y, { label: 'A lamp kept lit at someone else’s expense' });
  actor(castle, 'supine', 'Lady Supine', 'lady', 22, 13, 'castle_arrival', 'Keeper of Limited Time');
  actor(castle, 'second-minder', 'The Second Minder', 'bat', 31, 20, 'castle_arrival', 'An exceptionally careful listener', { dialogue: 'Speak to the screen. Her Ladyship does not need to smell the damp in your coat to decide what you deserve.' });

  object(world, 'portal', 19, 7, { id: 'infinite-gate', text: 'scene:infinite_arrival', width: 8, height: 3, label: 'The Entrance to Infinite Time', solid: false, color: '#ddd2ba' });
  sign(world, 17, 16, 'A different threshold', 'You do not have enough time to enter Infinite Time.\nThe meter was installed before the road. It has never let anyone through.');
  object(world, 'bench', 28, 16, { color: '#8e9b71' });

  // Roadside lights and hand-lettered directions, placed beside the walking lanes.
  for (let i = 0; i < roads.length; i++) {
    const points = roads[i];
    for (let j = 1; j < points.length; j++) {
      const a = points[j - 1], b = points[j], dist = Math.hypot(b.x - a.x, b.y - a.y);
      for (let d = 8; d < dist - 3; d += 12) {
        const t = d / dist, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        object(world, 'lantern', x + 2.1, y + .8, { solid: false });
      }
    }
  }
  sign(world, 51, 94, 'Public footpaths', 'North: Cigarillo Forest\nEast: Tasteful Scarcity\nSouthwest: the Shanty Hours\nThere is nowhere to wait indoors.');
  sign(world, 33, 57, 'Public footpaths', 'North: the Hospital, the Pit, and the other entrance\nSouth: the Library and the Shanty Hours');
  sign(world, 105, 73, 'Public footpaths', 'East: Egregious Abundance\nNorth: Great Castle Divine\nSouth: the Museum of the Supine');

  // Plant life is deterministic, but every trunk is an actual resource and obstacle.
  const occupied = (x: number, y: number) => world.objects.some(o => {
    if ((o.width || 1) >= 2 || (o.height || 1) >= 2) return x > o.x - 2 && x < o.x + (o.width || 1) + 2 && y > o.y - 2 && y < o.y + (o.height || 1) + 3;
    return Math.hypot(x - o.x, y - o.y) < 2;
  }) || world.actors.some(a => Math.hypot(x - a.x, y - a.y) < 3);
  for (let y = 6; y < 138; y += 2) for (let x = 6; x < 174; x += 2) {
    const kind = world.tiles[y * world.width + x], roll = worldHash(x, y);
    if (!['grass', 'darkGrass'].includes(kind)) continue;
    if (occupied(x + .5, y + .5)) continue;
    // Avoid blocking path edges and create visible clearings around settlements.
    let besideRoad = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (['path', 'stone', 'woodFloor'].includes(world.tiles[(y + dy) * world.width + x + dx])) besideRoad = true;
    const forest = x > 55 && x < 102 && y > 33 && y < 78;
    if (!besideRoad && roll < (forest ? .56 : .21)) {
      object(world, forest && roll < .08 ? 'willow' : 'tree', x + .4 + worldHash(x + 8, y) * .8, y + .4 + worldHash(x, y + 8) * .8, {
        variant: Math.floor(worldHash(x + 9, y + 3) * 4),
        color: forest ? '#445e68' : undefined,
        resource: { item: forest && roll < .08 ? 'willow_fibre' : 'wood', amount: 3, health: 3 },
      });
    } else if (!besideRoad && roll < .28) object(world, 'rock', x + .6, y + .7, { variant: Math.floor(roll * 17), resource: { item: 'stone', amount: 3, health: 4 } });
    else if (roll > .86) object(world, 'bush', x + .5, y + .5, { solid: false, variant: Math.floor(roll * 7) });
    else if (roll > .69) object(world, 'flower', x + .5, y + .5, { solid: false, variant: Math.floor(roll * 11), resource: roll > .81 ? { item: 'herb', amount: 1, health: 1 } : undefined });
  }
  // Aristobats patrol the woods and the official avenues; the town is already exhausted enough.
  for (const [i, p] of [{ x: 68, y: 62 }, { x: 93, y: 46 }, { x: 102, y: 88 }, { x: 152, y: 38 }, { x: 69, y: 30 }, { x: 113, y: 116 }].entries()) {
    actor(world, `aristobat-${i}`, 'An Aristobat', 'bat', p.x, p.y, '', 'Her Ladyship’s winged retinue', { hostile: true, roam: 5 });
  }
  // Extra wilderness rewards make wandering useful beyond the prescribed route.
  for (const [i, p] of [{ x: 38, y: 132 }, { x: 9, y: 63 }, { x: 101, y: 21 }, { x: 171, y: 112 }].entries()) {
    object(world, 'chest', p.x, p.y, { id: `wilderness-cache-${i}`, label: 'A traveller’s abandoned belongings', resource: { item: i % 2 ? 'ore' : 'wood', amount: 8, health: 1 } });
  }
  for (const a of world.actors) {
    const region = regions.find(r => a.x >= r.x && a.x < r.x + r.width && a.y >= r.y && a.y < r.y + r.height) || regions.reduce((best, r) => Math.hypot(r.landmark.x-a.x,r.landmark.y-a.y) < Math.hypot(best.landmark.x-a.x,best.landmark.y-a.y) ? r : best);
    a.location = region.id;
  }
  return { seed: SEED, overworld: world, interiors, regions: regions.map(r => ({ ...r, landmark: { ...r.landmark } })) };
}
