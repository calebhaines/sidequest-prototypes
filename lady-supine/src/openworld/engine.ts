import { ITEMS, RECIPES } from './items';
import { renderWorld } from './renderer';
import { TILE_SIZE, type ActorFrame, type EngineCallbacks, type FishingState, type FloatingText, type GameEngine, type InteractTarget, type ObjectKind, type Particle, type PlayerFrame, type Region, type Vec, type WorldData, type WorldObject, type WorldSave, type WorldScene, type WorldSnapshot } from './types';

const TWO_PI = Math.PI * 2;
const CHUNK = 8;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const random = (low: number, high: number) => low + Math.random() * (high - low);
const PLACE_KIND: Record<string, ObjectKind> = { lantern: 'lantern', sapling: 'willow', campfire: 'campfire', bench: 'bench', workbench: 'workbench' };
const FRIEND_FLAGS: Record<string, string> = { pip: 'pip_friend', brindle: 'brindle_friend', ada: 'ada_friend' };
const STARTER_ITEMS = ['walking_cane', 'willow_axe', 'stone_pick', 'fishing_rod', 'lantern', 'soup', 'time_coupon', 'sapling'];

/** Tile-space simulation. The canvas only renders; React receives ten snapshots a second. */
export function createEngine(canvas: HTMLCanvasElement, data: WorldData, callbacks: EngineCallbacks, initialSave?: WorldSave): GameEngine {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Your browser could not create the game canvas.');
  const ctx: CanvasRenderingContext2D = context;
  let scene = data.overworld;
  let player: PlayerFrame = {
    ...scene.spawn, facing: Math.PI / 2, moving: false, animation: 0, health: 100,
    maxHealth: 100, stamina: 100, maxStamina: 100, level: 1, xp: 0, attacking: 0, hurt: 0,
  };
  let inventory: Record<string, number> = { walking_cane: 1, willow_axe: 1, stone_pick: 1, fishing_rod: 1, lantern: 2, soup: 2, time_coupon: 1, sapling: 2 };
  let hotbar = [...STARTER_ITEMS];
  let selected = 0;
  let harvested: Record<string, number> = {};
  let placed: WorldObject[] = [];
  let discovered = ['entrance'];
  let explored = new Set<string>();
  let elapsed = 0;
  let dayTime = 0.3;
  let options = { zoom: 1.5, reducedMotion: false, particles: true };
  let waypoint: Vec | null = null;
  let waypointScene = data.overworld.id;
  let actors: ActorFrame[] = [];
  let flags: string[] = [];
  let nearby: InteractTarget | null = null;
  let region = regionFor(scene, player);
  let areaNotice = region.name;
  let areaNoticeTime = 4;
  let particles: Particle[] = [];
  let floating: FloatingText[] = [];
  let floatingId = 0;
  let fishing: FishingState | null = null;
  let building: string | null = null;
  let buildPreview: { kind: ObjectKind; position: Vec; valid: boolean } | null = null;
  let camera: Vec = { x: player.x, y: player.y };
  let width = 1280;
  let height = 720;
  let dpr = 1;
  let mouse: Vec | null = null;
  let pointerWorld: Vec | null = null;
  let touchDirection: Vec = { x: 0, y: 0 };
  let keys = new Set<string>();
  let paused = false;
  let running = false;
  let disposed = false;
  let raf = 0;
  let lastFrame = 0;
  let publishTimer = 0;
  let scanTimer = 0;
  let regrowTimer = 0;
  let actionCooldown = 0;
  let heldAction = false;
  let borrowedFraction = 0;
  let announcedTools = new Set<string>();
  const damageToObject = new Map<string, number>();
  const enemyCooldowns = new Map<string, number>();
  const followers = new Set<string>();
  const listeners = new Set<(snapshot: WorldSnapshot) => void>();
  let objectCells = new Map<string, WorldObject[]>();
  let sceneObjects: WorldObject[] = [];
  const frameCost: number[] = [];

  function regionFor(currentScene: WorldScene, position: Vec): Region {
    if (!currentScene.outdoors) return data.regions.find((r) => r.id === currentScene.location) ?? data.regions[0];
    return data.regions.find((r) => position.x >= r.x && position.x < r.x + r.width && position.y >= r.y && position.y < r.y + r.height)
      ?? data.regions.reduce((best, r) => distance(position, r.landmark) < distance(position, best.landmark) ? r : best, data.regions[0]);
  }

  function objectBounds(object: WorldObject) {
    const objectWidth = object.width ?? 1;
    const objectHeight = object.height ?? 1;
    if (objectWidth >= 2 || objectHeight >= 2) return { left: object.x, right: object.x + objectWidth, top: object.y, bottom: object.y + objectHeight };
    const half = object.kind === 'tree' || object.kind === 'willow' ? 0.28 : object.kind === 'rock' || object.kind === 'ore' ? 0.44 : 0.34;
    return { left: object.x - half, right: object.x + half, top: object.y - half * 0.65, bottom: object.y + half * 0.65 };
  }

  function interactionPosition(object: WorldObject): Vec {
    if ((object.width ?? 1) >= 2 || (object.height ?? 1) >= 2) return { x: object.x + (object.width ?? 1) / 2, y: object.y + (object.height ?? 1) + 0.15 };
    return object;
  }

  function objectActive(object: WorldObject) {
    return !harvested[object.id] || harvested[object.id] <= elapsed;
  }

  function refreshObjects() {
    sceneObjects = [...scene.objects, ...placed.filter((object) => object.id.startsWith(`${scene.id}::`))];
    objectCells = new Map();
    for (const object of sceneObjects) {
      if (!objectActive(object)) continue;
      const bounds = objectBounds(object);
      for (let y = Math.floor(bounds.top / CHUNK); y <= Math.floor(bounds.bottom / CHUNK); y++) {
        for (let x = Math.floor(bounds.left / CHUNK); x <= Math.floor(bounds.right / CHUNK); x++) {
          const key = `${x}:${y}`;
          const bucket = objectCells.get(key) ?? [];
          bucket.push(object);
          objectCells.set(key, bucket);
        }
      }
    }
  }

  function localObjects(position: Vec, radius = 2): WorldObject[] {
    const found = new Set<WorldObject>();
    for (let y = Math.floor((position.y - radius) / CHUNK); y <= Math.floor((position.y + radius) / CHUNK); y++) {
      for (let x = Math.floor((position.x - radius) / CHUNK); x <= Math.floor((position.x + radius) / CHUNK); x++) {
        for (const object of objectCells.get(`${x}:${y}`) ?? []) found.add(object);
      }
    }
    return [...found];
  }

  function passable(x: number, y: number, radius = 0.23): boolean {
    if (x < 0.8 || y < 0.8 || x >= scene.width - 0.8 || y >= scene.height - 0.8) return false;
    for (const offset of [{ x: -radius, y: -radius }, { x: radius, y: -radius }, { x: -radius, y: radius }, { x: radius, y: radius }]) {
      const tile = scene.tiles[Math.floor(y + offset.y) * scene.width + Math.floor(x + offset.x)];
      if (!tile || tile === 'water' || tile === 'deepWater' || tile === 'void') return false;
    }
    for (const object of localObjects({ x, y }, radius + 1)) {
      if (!object.solid || !objectActive(object) || (object.kind === 'gate' && object.requiresFlag && flags.includes(object.requiresFlag))) continue;
      const bounds = objectBounds(object);
      if (x + radius > bounds.left && x - radius < bounds.right && y + radius * 0.65 > bounds.top && y - radius * 0.65 < bounds.bottom) return false;
    }
    return true;
  }

  function move(entity: Vec, dx: number, dy: number, colliding: boolean) {
    const maxStep = 0.15;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / maxStep));
    for (let step = 0; step < steps; step++) {
      const x = entity.x + dx / steps;
      const y = entity.y + dy / steps;
      if (!colliding || passable(x, entity.y)) entity.x = clamp(x, 0.7, scene.width - 0.7);
      if (!colliding || passable(entity.x, y)) entity.y = clamp(y, 0.7, scene.height - 0.7);
    }
  }

  function initActors() {
    actors = scene.actors.map((actor) => ({ ...actor, facing: Math.PI / 2, moving: false, animation: 0, health: actor.hostile ? 42 : 100, attacking: false, hurt: 0 }));
    for (const actor of actors) if (harvested[`enemy:${scene.id}:${actor.id}`] > elapsed) actor.health = 0;
    applyPatrolPeace();
    followers.clear();
    refreshObjects();
  }

  function applyPatrolPeace() {
    const released = flags.includes('reservoir_open');
    for (const actor of actors) {
      if (!scene.actors.find(original => original.id === actor.id)?.hostile) continue;
      actor.hostile = !released;
      if (released) {
        actor.health = Math.max(42, actor.health);
        actor.dialogue = '“The account is open,” the Aristobat says. “I have been told to stop collecting. I think I shall try a little listening instead.” Its wings settle around a minute nobody has asked it to take.';
      }
    }
  }

  function canHarvest(object: WorldObject) {
    if (object.kind !== 'crop' || regionFor(scene, object).id !== 'fields' || flags.includes('fields_permit') || flags.includes('reservoir_open')) return true;
    const message = 'A harvest needs an abundance permit. Speak to Burrow at the nearby permit window.';
    if (!announcedTools.has(message)) { notify(message, 'warning'); announcedTools.add(message); }
    return false;
  }

  function canPickUp(object: WorldObject) { return !!object.resource && !['tree', 'willow', 'rock', 'ore', 'crate'].includes(object.kind); }

  function pickUp(object: WorldObject) {
    if (!object.resource || !canHarvest(object)) return;
    harvested[object.id] = elapsed + 150;
    addResource(object.resource.item, object.resource.amount);
    gainXP(3); burst(object, '#becb96', 'leaf', 6); callbacks.onSound('gather'); refreshObjects(); publish();
  }

  function ensureFollowers() {
    for (const [id, friendFlag] of Object.entries(FRIEND_FLAGS)) {
      if (!flags.includes(friendFlag)) continue;
      if (id === 'ada' && flags.includes('mind_changed') && !flags.includes('ada_restored')) {
        followers.delete(id);
        continue;
      }
      const existing = actors.find((actor) => actor.id === id);
      if (existing && !followers.has(id)) {
        if (distance(existing, player) > 10) {
          existing.x = player.x - 1 - followers.size * 0.4;
          existing.y = player.y + 1;
        }
        followers.add(id);
      }
      if (!existing) {
        const original = [data.overworld, ...Object.values(data.interiors)].flatMap((room) => room.actors).find((actor) => actor.id === id);
        if (original) {
          actors.push({ ...original, x: player.x - 1 - followers.size * 0.4, y: player.y + 1, facing: player.facing, moving: false, animation: 0, health: 100, attacking: false, hurt: 0 });
          followers.add(id);
        }
      }
    }
  }

  function snapshot(): WorldSnapshot {
    return {
      ...save(), region: { ...region, landmark: { ...region.landmark } }, nearby: nearby ? clone(nearby) : null,
      fishing: fishing ? clone(fishing) : null, enemies: actors.filter((actor) => actor.hostile && actor.health > 0 && distance(actor, player) < 18).length,
      paused, saving: false, areaNotice: areaNoticeTime > 0 ? areaNotice : '',
    };
  }

  function save(): WorldSave {
    return {
      version: 2, sceneId: scene.id, player: { ...player }, inventory: { ...inventory }, hotbar: [...hotbar], selected,
      harvested: { ...harvested }, placed: clone(placed), discovered: [...discovered], explored: [...explored],
      elapsed, dayTime, waypoint: waypoint ? { ...waypoint } : null, waypointScene, options: { ...options },
    };
  }

  function publish() {
    if (!listeners.size) return;
    const value = snapshot();
    for (const listener of listeners) listener(value);
  }

  function notify(text: string, kind: 'info' | 'success' | 'warning' = 'info') {
    callbacks.onNotify(text, kind);
  }

  function addFloating(text: string, color: string, position: Vec = player) {
    floating.push({ ...position, id: floatingId++, text, color, life: 1.7 });
  }

  function burst(position: Vec, color: string, kind: Particle['kind'], count = 8) {
    if (!options.particles) return;
    for (let i = 0; i < count; i++) particles.push({ ...position, vx: random(-1.1, 1.1), vy: random(-1.8, -0.2), life: random(0.3, 0.75), maxLife: 0.75, color, size: random(1.5, 3), kind });
  }

  function gainXP(amount: number) {
    player.xp += amount;
    if (player.xp >= player.level * 80) {
      player.xp -= player.level * 80;
      player.level += 1;
      player.maxHealth += 8;
      player.health = Math.min(player.maxHealth, player.health + 30);
      player.maxStamina += 5;
      player.stamina = player.maxStamina;
      addFloating(`Level ${player.level}`, '#f4db95');
      notify(`A little more yourself. Level ${player.level}: health and stamina increased.`, 'success');
      callbacks.onSound('level');
    }
  }

  function addResource(id: string, amount: number) {
    if (!ITEMS[id] || !Number.isFinite(amount)) return;
    inventory[id] = Math.max(0, (inventory[id] ?? 0) + Math.floor(amount));
    if (amount > 0) {
      addFloating(`+${Math.floor(amount)} ${ITEMS[id].name}`, ITEMS[id].color);
      if (inventory[id] === amount && hotbar.includes('')) hotbar[hotbar.indexOf('')] = id;
    }
    publish();
  }

  function consume(id: string): boolean {
    if (!inventory[id] || !ITEMS[id]) {
      notify(`You have no ${ITEMS[id]?.name.toLowerCase() ?? 'such item'} left.`, 'warning');
      return false;
    }
    if (ITEMS[id].kind === 'food') {
      const health = id === 'soup' ? 38 : id === 'tea' ? 20 : 12;
      if (player.health >= player.maxHealth && player.stamina >= player.maxStamina) {
        notify('You are already well rested. Save it for a hungry hour.');
        return false;
      }
      inventory[id]--;
      player.health = Math.min(player.maxHealth, player.health + health);
      player.stamina = player.maxStamina;
      addFloating(`+${health} health`, '#a8dca0');
      burst(player, '#bedfa5', 'heart');
      callbacks.onSound('eat');
    } else if (ITEMS[id].kind === 'time') {
      inventory[id]--;
      callbacks.onTimeChange(180);
      addFloating('+3:00 borrowed time', '#ebcf80');
      burst(player, '#ead185', 'time', 18);
      callbacks.onSound('coupon');
      notify('The coupon blows a kiss. Three minutes settle into your hands.', 'success');
    } else if (ITEMS[id].kind === 'placeable') {
      beginBuild(id);
    } else {
      const index = hotbar.indexOf(id);
      if (index >= 0) selected = index;
      else {
        hotbar[selected] = id;
        notify(`${ITEMS[id].name} equipped.`);
      }
    }
    publish();
    return true;
  }

  function craft(id: string): boolean {
    const recipe = RECIPES.find((candidate) => candidate.id === id);
    if (!recipe) return false;
    for (const [item, amount] of Object.entries(recipe.ingredients)) {
      if ((inventory[item] ?? 0) < amount) {
        notify(`Need ${amount} ${ITEMS[item]?.name.toLowerCase() ?? item} to make ${recipe.name.toLowerCase()}.`, 'warning');
        return false;
      }
    }
    if (recipe.station && !localObjects(player, 6).some((object) => object.kind === recipe.station && objectActive(object) && distance(player, interactionPosition(object)) < 5)) {
      notify(`Make this beside a ${recipe.station === 'workbench' ? 'work table' : recipe.station}.`, 'warning');
      return false;
    }
    for (const [item, amount] of Object.entries(recipe.ingredients)) inventory[item] -= amount;
    addResource(recipe.result, recipe.amount);
    gainXP(8);
    callbacks.onSound('craft');
    notify(`Made ${recipe.amount} ${ITEMS[recipe.result].name.toLowerCase()}.`, 'success');
    publish();
    return true;
  }

  function beginBuild(id: string) {
    if (!PLACE_KIND[id] || (inventory[id] ?? 0) <= 0) {
      notify('You need a placeable item in your bag.', 'warning');
      return;
    }
    building = id;
    updateBuildPreview();
    notify(`Placing ${ITEMS[id].name.toLowerCase()}: aim nearby and click or press action. Escape cancels.`);
  }

  function cancelBuild() {
    building = null;
    buildPreview = null;
  }

  function updateBuildPreview() {
    if (!building) return;
    const target = pointerWorld && distance(pointerWorld, player) < 5.5
      ? pointerWorld : { x: player.x + Math.cos(player.facing) * 1.8, y: player.y + Math.sin(player.facing) * 1.8 };
    const position = { x: Math.floor(target.x) + 0.5, y: Math.floor(target.y) + 0.5 };
    const tile = scene.tiles[Math.floor(position.y) * scene.width + Math.floor(position.x)];
    const nearbySolid = localObjects(position).some((object) => objectActive(object) && (object.solid || object.kind === 'lantern' || object.kind === 'campfire') && distance(interactionPosition(object), position) < 0.8);
    const valid = !!tile && !['water', 'deepWater', 'void'].includes(tile) && passable(position.x, position.y, 0.3) && !nearbySolid && distance(player, position) > 0.7 && distance(player, position) < 5.5;
    buildPreview = { kind: PLACE_KIND[building], position, valid };
  }

  function placeBuild() {
    updateBuildPreview();
    if (!building || !buildPreview || !buildPreview.valid || !inventory[building]) {
      notify('Choose a clear patch of ground within reach.', 'warning');
      return;
    }
    const kind = PLACE_KIND[building];
    const object: WorldObject = { id: `${scene.id}::placed-${Date.now()}-${placed.length}`, ...buildPreview.position, kind, solid: kind === 'willow' || kind === 'workbench', label: ITEMS[building].name };
    if (kind === 'willow') object.resource = { item: 'willow_fibre', amount: 3, health: 3 };
    if (kind === 'campfire') object.text = 'A common fire. Rest here, or cook fish and pillowwort into shanty soup.';
    if (kind === 'bench') object.text = 'Somebody made room for somebody else.';
    inventory[building]--;
    placed.push(object);
    burst(object, '#c3b887', 'dust');
    gainXP(5);
    callbacks.onSound('build');
    notify(`Placed ${ITEMS[building].name.toLowerCase()}.`, 'success');
    refreshObjects();
    cancelBuild();
    publish();
  }

  function selectSlot(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= hotbar.length) return;
    selected = index;
    cancelBuild();
    fishing = null;
    callbacks.onSound('select');
    publish();
  }

  function nearbyWater(): Vec | null {
    const direction = pointerWorld && distance(pointerWorld, player) > 0.2 ? Math.atan2(pointerWorld.y - player.y, pointerWorld.x - player.x) : player.facing;
    for (let radius = 1; radius <= 5; radius += 0.5) {
      for (const offset of [0, -0.2, 0.2, -0.5, 0.5]) {
        const target = { x: player.x + Math.cos(direction + offset) * radius, y: player.y + Math.sin(direction + offset) * radius };
        const tile = scene.tiles[Math.floor(target.y) * scene.width + Math.floor(target.x)];
        if (tile === 'water' || tile === 'deepWater') return target;
      }
    }
    return null;
  }

  function castOrReel() {
    if (fishing) {
      if (fishing.phase === 'bite') {
        const count = Math.random() < 0.2 ? 2 : 1;
        addResource('fish', count);
        gainXP(12);
        burst(fishing.position, '#98d8d5', 'splash', 10);
        callbacks.onSound('fish');
        notify(`Caught ${count === 1 ? 'a tasteful fish' : 'two very tasteful fish'}.`, 'success');
        if (Math.random() < 0.18) {
          addResource('timeglass', 1);
          notify('A bright grain of time came up with the line.', 'success');
        }
        fishing.phase = 'caught';
        fishing.elapsed = 0;
      } else if (fishing.phase === 'waiting') {
        fishing = null;
        notify('The hook comes back empty. Wait for the float to dip.');
      } else fishing = null;
      return;
    }
    const water = nearbyWater();
    if (!water) {
      notify('Face the water and cast within five paces of the shore.');
      return;
    }
    player.facing = Math.atan2(water.y - player.y, water.x - player.x);
    fishing = { position: water, phase: 'waiting', elapsed: 0, biteAt: random(2.8, 5.3) };
    burst(water, '#a6d5ce', 'splash', 5);
    callbacks.onSound('cast');
    notify('Line cast. Watch the float; reel when it dips.');
    publish();
  }

  function aimAngle() {
    return pointerWorld && distance(pointerWorld, player) > 0.2 ? Math.atan2(pointerWorld.y - player.y, pointerWorld.x - player.x) : player.facing;
  }

  function inArc(position: Vec, reach: number, angle = 1.1) {
    if (distance(position, player) > reach) return false;
    let delta = Math.atan2(position.y - player.y, position.x - player.x) - player.facing;
    while (delta < -Math.PI) delta += TWO_PI;
    while (delta > Math.PI) delta -= TWO_PI;
    return Math.abs(delta) <= angle;
  }

  function primaryAction() {
    if (paused || disposed || actionCooldown > 0) return;
    if (building) {
      placeBuild();
      actionCooldown = 0.3;
      return;
    }
    const item = hotbar[selected];
    if (!item || !inventory[item]) {
      notify('That pocket is empty. Open your bag to equip something else.');
      return;
    }
    if (ITEMS[item]?.kind === 'food' || ITEMS[item]?.kind === 'time' || ITEMS[item]?.kind === 'placeable') {
      consume(item);
      actionCooldown = 0.3;
      return;
    }
    if (item === 'fishing_rod') {
      castOrReel();
      actionCooldown = 0.35;
      return;
    }
    if (player.stamina < 7) {
      notify('Catch your breath before swinging again.');
      return;
    }
    player.facing = aimAngle();
    player.attacking = 0.26;
    actionCooldown = 0.42;
    player.stamina = Math.max(0, player.stamina - 7);
    callbacks.onSound('swing');
    const enemy = actors.filter((actor) => actor.hostile && actor.health > 0 && inArc(actor, 2.2, 1.4)).sort((a, b) => distance(a, player) - distance(b, player))[0];
    if (enemy) {
      const amount = item === 'walking_cane' ? 24 + player.level * 2 : 16 + player.level;
      enemy.health -= amount;
      enemy.hurt = 0.22;
      move(enemy, Math.cos(player.facing) * 0.6, Math.sin(player.facing) * 0.6, false);
      addFloating(`−${amount}`, '#f2a494', enemy);
      burst(enemy, '#d0b2e9', 'spark');
      callbacks.onSound('hit');
      if (enemy.health <= 0) {
        harvested[`enemy:${scene.id}:${enemy.id}`] = elapsed + 140;
        addResource('timeglass', 1);
        gainXP(18);
        notify('The Aristobat retreats. A grain of unclaimed time remains.', 'success');
        if (Math.random() < 0.18) addResource('time_coupon', 1);
      }
      publish();
      return;
    }
    const candidates = localObjects(player, 3).filter((object) => object.resource && objectActive(object) && inArc(object, 2, 1.25));
    const target = candidates.sort((a, b) => distance(a, player) - distance(b, player))[0];
    if (target?.resource) {
      if (!canHarvest(target)) return;
      const wantsPick = target.kind === 'rock' || target.kind === 'ore';
      const wantsAxe = target.kind === 'tree' || target.kind === 'willow' || target.kind === 'crate';
      if ((wantsPick && item !== 'stone_pick') || (wantsAxe && item !== 'willow_axe')) {
        const hint = wantsPick ? 'Use your stone pick on this.' : 'Use your willow axe on this.';
        if (!announcedTools.has(hint)) {
          notify(hint);
          announcedTools.add(hint);
        }
        burst(target, '#cbc5a9', 'dust', 3);
        return;
      }
      const damage = (damageToObject.get(target.id) ?? 0) + 1;
      damageToObject.set(target.id, damage);
      burst(target, wantsPick ? '#c3c5b7' : '#afc395', wantsPick ? 'spark' : 'leaf', 6);
      addFloating(`${Math.max(0, target.resource.health - damage)} / ${target.resource.health}`, '#d3d7b0', target);
      callbacks.onSound(wantsPick ? 'stone' : 'wood');
      if (damage >= target.resource.health) {
        const duration = target.kind === 'tree' || target.kind === 'willow' ? 240 : target.kind === 'rock' || target.kind === 'ore' ? 300 : 150;
        harvested[target.id] = elapsed + duration;
        damageToObject.delete(target.id);
        addResource(target.resource.item, target.resource.amount);
        gainXP(wantsPick || wantsAxe ? 6 : 3);
        if (wantsPick && Math.random() < 0.12) addResource('timeglass', 1);
        refreshObjects();
      }
      publish();
    }
  }

  function findNearby(): InteractTarget | null {
    let best: InteractTarget | null = null;
    let bestDistance = 2.3;
    for (const actor of actors) {
      if (actor.hostile || actor.health <= 0) continue;
      const length = distance(actor, player);
      if (length < bestDistance) {
        bestDistance = length;
        best = { id: actor.id, type: 'npc', name: actor.name, location: actor.location, scene: actor.scene, position: { x: actor.x, y: actor.y }, actor: { ...actor } };
      }
    }
    for (const object of localObjects(player, 3)) {
      if (!objectActive(object) || object.resource && !canPickUp(object)) continue;
      if (canPickUp(object) && distance(object, player) < Math.min(bestDistance, 1.7)) {
        bestDistance = distance(object, player);
        best = { id: object.id, type: 'object', name: `Gather ${object.label || ITEMS[object.resource!.item]?.name || 'supplies'}`, location: scene.outdoors ? region.id : scene.location, scene: scene.id, position: { x: object.x, y: object.y }, object: { ...object } };
        continue;
      }
      if (object.resource) continue;
      if (!(object.door || object.label || object.text || ['bench', 'campfire', 'workbench', 'portal', 'chest', 'gate', 'bed', 'well', 'sign'].includes(object.kind))) continue;
      const position = interactionPosition(object);
      const length = distance(position, player);
      if (length < bestDistance) {
        bestDistance = length;
        best = { id: object.id, type: object.door ? 'door' : 'object', name: object.label ?? object.kind, location: scene.outdoors ? region.id : scene.location, scene: scene.id, position: { ...position }, object: { ...object } };
      }
    }
    if (scene.exit && distance(scene.exit.positionInRoom, player) < bestDistance) {
      best = { id: `${scene.id}:exit`, type: 'door', name: 'Return outside', location: scene.location, scene: scene.id, position: { ...scene.exit.positionInRoom }, object: { id: `${scene.id}:exit`, ...scene.exit.positionInRoom, kind: 'portal', solid: false, door: { scene: scene.exit.scene, position: scene.exit.position } } };
    }
    return best;
  }

  function interact() {
    if (paused || disposed) return;
    nearby = findNearby();
    if (!nearby) {
      const resource = localObjects(player, 2).find((object) => object.resource && objectActive(object) && distance(player, object) < 1.7);
      if (resource && canPickUp(resource)) { pickUp(resource); return; }
      notify('Walk closer to a person, door, or sign to interact.');
      return;
    }
    const object = nearby.object;
    if (object && canPickUp(object)) { pickUp(object); return; }
    if (object?.requiresFlag && !flags.includes(object.requiresFlag)) {
      callbacks.onInteract(nearby);
      return;
    }
    if (object?.door) {
      teleport(object.door.scene, object.door.position);
      callbacks.onSound('door');
      return;
    }
    if (object && ['bench', 'bed', 'campfire'].includes(object.kind)) {
      const healing = object.kind === 'bed' ? player.maxHealth : 20;
      player.health = Math.min(player.maxHealth, player.health + healing);
      player.stamina = player.maxStamina;
      addFloating('A little rest', '#c4d6ac');
      burst(player, '#bdce9b', 'heart', 7);
      if (object.kind !== 'campfire') {
        notify(object.text ?? 'You rest a moment. Health and stamina return.', 'success');
        publish();
        return;
      }
    }
    if (object?.kind === 'chest') {
      const key = `opened:${object.id}`;
      if (!harvested[key]) {
        harvested[key] = Number.MAX_SAFE_INTEGER;
        addResource('time_coupon', 1);
        addResource('wood', 3);
        callbacks.onSound('chest');
        notify('A forgotten coupon and three pieces of useful timber.', 'success');
      } else notify('The chest has given you everything it had.');
      publish();
      return;
    }
    callbacks.onInteract(nearby);
  }

  function teleport(sceneId: string, position?: Vec) {
    const next = sceneId === data.overworld.id || sceneId === 'overworld' ? data.overworld : data.interiors[sceneId];
    if (!next) {
      notify('That door is currently closed.', 'warning');
      return;
    }
    scene = next;
    player.x = position?.x ?? scene.spawn.x;
    player.y = position?.y ?? scene.spawn.y;
    player.moving = false;
    player.attacking = 0;
    camera = { x: player.x, y: player.y };
    mouse = null;
    pointerWorld = null;
    fishing = null;
    cancelBuild();
    keys.clear();
    touchDirection = { x: 0, y: 0 };
    initActors();
    ensureFollowers();
    region = regionFor(scene, player);
    nearby = findNearby();
    areaNotice = scene.outdoors ? region.name : scene.name;
    areaNoticeTime = 4;
    if (!discovered.includes(region.id)) discovered.push(region.id);
    callbacks.onArea(region.id);
    scanExploration();
    publish();
  }

  function recover() {
    player.health = Math.ceil(player.maxHealth * 0.65);
    player.stamina = player.maxStamina;
    player.hurt = 0;
    const hospital = data.interiors['hospital-room'];
    if (hospital) teleport(hospital.id, hospital.spawn);
    else teleport(data.overworld.id, data.overworld.spawn);
    callbacks.onTimeChange(-60);
    callbacks.onRecovery();
    notify('The Hospital of Borrowed Time has put you back on your feet.', 'warning');
  }

  function scanExploration() {
    if (waypoint && waypointScene === scene.id && distance(waypoint, player) < 2) {
      waypoint = null;
      notify('You have reached your map marker.');
    }
    if (!scene.outdoors) return;
    for (let y = Math.max(0, Math.floor((player.y - 14) / CHUNK)); y <= Math.floor((player.y + 14) / CHUNK); y++) {
      for (let x = Math.max(0, Math.floor((player.x - 14) / CHUNK)); x <= Math.floor((player.x + 14) / CHUNK); x++) {
        if (distance({ x: x * CHUNK + CHUNK / 2, y: y * CHUNK + CHUNK / 2 }, player) < 18) explored.add(`${x}:${y}`);
      }
    }
    const nextRegion = regionFor(scene, player);
    if (nextRegion.id !== region.id) {
      region = nextRegion;
      areaNotice = region.name;
      areaNoticeTime = 4;
      callbacks.onArea(region.id);
      if (!discovered.includes(region.id)) {
        discovered.push(region.id);
        notify(`Discovered ${region.name}.`, 'success');
        gainXP(12);
      }
    }
  }

  function updateActors(dt: number, sprinting: boolean, sneaking: boolean) {
    const now = elapsed;
    for (const actor of actors) {
      actor.hurt = Math.max(0, actor.hurt - dt);
      actor.attacking = false;
      const length = distance(actor, player);
      if (actor.hostile) {
        if (actor.health <= 0) {
          if ((harvested[`enemy:${scene.id}:${actor.id}`] ?? Infinity) <= elapsed) {
            actor.health = 42;
            const original = scene.actors.find((definition) => definition.id === actor.id);
            if (original) { actor.x = original.x; actor.y = original.y; }
          }
          continue;
        }
        if (length > 25) { actor.moving = false; continue; }
        const hearDistance = sprinting ? 13 : sneaking ? 2.5 : 6;
        const cooldown = Math.max(0, (enemyCooldowns.get(actor.id) ?? 0) - dt);
        enemyCooldowns.set(actor.id, cooldown);
        const original = scene.actors.find((definition) => definition.id === actor.id) ?? actor;
        const hunting = length < hearDistance || (length < 10 && actor.hurt > 0) || (length < 7 && cooldown > 0);
        let target: Vec;
        if (hunting) target = player;
        else target = { x: original.x + Math.sin(now * 0.38 + actor.id.length) * 2.3, y: original.y + Math.cos(now * 0.29 + actor.id.length) * 1.8 };
        const targetDistance = distance(actor, target);
        actor.moving = targetDistance > 0.3;
        if (actor.moving) {
          actor.facing = Math.atan2(target.y - actor.y, target.x - actor.x);
          const speed = hunting ? 2.45 : 0.72;
          if (actor.hurt <= 0) move(actor, Math.cos(actor.facing) * speed * dt, Math.sin(actor.facing) * speed * dt, false);
          actor.animation += dt;
        }
        if (length < 1.05 && cooldown === 0 && player.hurt <= 0) {
          const damage = 8;
          player.health = Math.max(0, player.health - damage);
          player.stamina = Math.max(0, player.stamina - 8);
          player.hurt = 0.6;
          actor.attacking = true;
          enemyCooldowns.set(actor.id, 1.4);
          callbacks.onTimeChange(-15);
          callbacks.onSound('hurt');
          addFloating('−15 seconds', '#e4b1c8');
          burst(player, '#d8b2d8', 'time', 8);
          if (player.health <= 0) { recover(); return; }
        }
      } else if (followers.has(actor.id)) {
        const index = [...followers].indexOf(actor.id);
        const separation = 1.6 + index * 0.7;
        actor.moving = length > separation;
        if (actor.moving && length < 45) {
          actor.facing = Math.atan2(player.y - actor.y, player.x - actor.x);
          const speed = length > 7 ? 5 : 3.5;
          move(actor, Math.cos(actor.facing) * speed * dt, Math.sin(actor.facing) * speed * dt, true);
          actor.animation += dt;
        } else if (length >= 45) {
          actor.x = player.x + 1.2;
          actor.y = player.y + 1.2;
        }
      } else {
        const original = scene.actors.find((definition) => definition.id === actor.id);
        if (!original || length > 24) continue;
        const roaming = original.roam ?? 0;
        if (length < 2.6) {
          actor.moving = false;
          actor.facing = Math.atan2(player.y - actor.y, player.x - actor.x);
        } else if (roaming > 0) {
          const phase = now * 0.2 + actor.id.length * 1.37;
          const target = { x: original.x + Math.sin(phase) * roaming, y: original.y + Math.sin(phase * 0.73) * roaming * 0.6 };
          actor.moving = distance(actor, target) > 0.3;
          if (actor.moving) {
            actor.facing = Math.atan2(target.y - actor.y, target.x - actor.x);
            move(actor, Math.cos(actor.facing) * dt * 0.6, Math.sin(actor.facing) * dt * 0.6, true);
            actor.animation += dt;
          }
        }
      }
    }
  }

  function update(dt: number) {
    elapsed += dt;
    dayTime = (dayTime + dt / 720) % 1;
    areaNoticeTime = Math.max(0, areaNoticeTime - dt);
    actionCooldown = Math.max(0, actionCooldown - dt);
    player.attacking = Math.max(0, player.attacking - dt);
    player.hurt = Math.max(0, player.hurt - dt);
    let dx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + touchDirection.x;
    let dy = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0) + touchDirection.y;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > 1) { dx /= magnitude; dy /= magnitude; }
    const sneaking = keys.has('c');
    const sprinting = keys.has('shift') && player.stamina > 1 && magnitude > 0.05 && !sneaking;
    const speed = sneaking ? 1.9 : sprinting ? 5.7 : 3.3;
    const before = { x: player.x, y: player.y };
    if (magnitude > 0.05 && !fishing) {
      player.facing = Math.atan2(dy, dx);
      move(player, dx * speed * dt, dy * speed * dt, true);
      player.moving = distance(before, player) > 0.002;
    } else player.moving = false;
    if (player.moving) {
      player.animation += dt * (sprinting ? 1.45 : sneaking ? 0.7 : 1);
      if (sprinting) player.stamina = Math.max(0, player.stamina - dt * 14);
      borrowedFraction += dt * (sprinting ? 0.6 : 0.35);
      if (borrowedFraction >= 1) {
        const debt = Math.floor(borrowedFraction);
        borrowedFraction -= debt;
        callbacks.onTimeChange(-debt);
      }
      if (Math.random() < dt * 6 && !options.reducedMotion) burst(player, '#baa885', 'dust', 1);
    }
    if (!sprinting && player.attacking === 0) player.stamina = Math.min(player.maxStamina, player.stamina + dt * (player.moving ? 9 : 16));
    if (heldAction && !fishing && !building && ['walking_cane', 'willow_axe', 'stone_pick'].includes(hotbar[selected])) primaryAction();
    updateActors(dt, sprinting, sneaking);
    if (fishing) {
      fishing.elapsed += dt;
      if (fishing.phase === 'waiting' && fishing.elapsed >= fishing.biteAt) {
        fishing.phase = 'bite';
        fishing.elapsed = 0;
        burst(fishing.position, '#e7deb3', 'splash', 8);
        callbacks.onSound('bite');
        notify('A bite! Reel in now.', 'success');
        publish();
      } else if (fishing.phase === 'bite' && fishing.elapsed > 1.8) {
        fishing = null;
        notify('The fish leaves with its remaining dignity. Cast again.');
      } else if (fishing.phase === 'caught' && fishing.elapsed > 0.75) fishing = null;
    }
    for (const particle of particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += dt * 1.2;
    }
    particles = particles.filter((particle) => particle.life > 0).slice(-160);
    for (const text of floating) { text.life -= dt; text.y -= dt * 0.35; }
    floating = floating.filter((text) => text.life > 0);
    scanTimer += dt;
    if (scanTimer > 0.22) {
      scanTimer = 0;
      nearby = findNearby();
      scanExploration();
      ensureFollowers();
    }
    regrowTimer += dt;
    if (regrowTimer > 3) {
      regrowTimer = 0;
      let regrown = false;
      for (const [id, until] of Object.entries(harvested)) if (until <= elapsed) { delete harvested[id]; regrown = true; }
      if (regrown) refreshObjects();
    }
    updateBuildPreview();
    if (mouse) pointerWorld = { x: camera.x + (mouse.x - width / 2) / (TILE_SIZE * options.zoom), y: camera.y + (mouse.y - height / 2) / (TILE_SIZE * options.zoom) };
  }

  function resize() {
    const box = canvas.getBoundingClientRect();
    width = Math.max(1, box.width);
    height = Math.max(1, box.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
  }

  function frame(timestamp: number) {
    if (!running || disposed) return;
    const dt = Math.min(0.05, lastFrame ? (timestamp - lastFrame) / 1000 : 0);
    lastFrame = timestamp;
    const costStart = performance.now();
    if (!paused && !document.hidden) update(dt);
    const cameraRate = options.reducedMotion ? 1 : 1 - Math.exp(-dt * 9);
    camera.x += (player.x - camera.x) * cameraRate;
    camera.y += (player.y - camera.y) * cameraRate;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    renderWorld(ctx, {
      scene, data, player, actors: actors.filter((actor) => actor.health > 0), objects: sceneObjects,
      harvested, particles, floating, camera, zoom: options.zoom, time: elapsed, dayTime, flags,
      selected: hotbar[selected], nearby, fishing,
      waypoint: !waypoint ? null : waypointScene === scene.id ? waypoint : scene.outdoors ? data.interiors[waypointScene]?.exit?.position || waypoint : scene.exit?.positionInRoom || null,
      reducedMotion: options.reducedMotion, buildPreview,
    }, width, height);
    publishTimer += dt;
    if (publishTimer > 0.1) { publishTimer = 0; publish(); }
    frameCost.push(performance.now() - costStart);
    if (frameCost.length > 60) frameCost.shift();
    raf = requestAnimationFrame(frame);
  }

  function keyboardAllowed(event: KeyboardEvent) {
    const target = event.target;
    return !(target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)));
  }

  function keyDown(event: KeyboardEvent) {
    if (!keyboardAllowed(event) || paused || disposed) return;
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'c', 'e', ' '].includes(key)) {
      event.preventDefault();
      keys.add(key);
    }
    if (event.repeat) return;
    if (key === 'e') interact();
    if (key === ' ') primaryAction();
    if (/^[1-8]$/.test(key)) selectSlot(Number(key) - 1);
    if (key === 'escape' && building) { cancelBuild(); event.preventDefault(); event.stopImmediatePropagation(); }
  }

  function keyUp(event: KeyboardEvent) {
    keys.delete(event.key.toLowerCase());
  }

  function clearInput() {
    keys.clear();
    heldAction = false;
    touchDirection = { x: 0, y: 0 };
  }

  function pointerMove(event: PointerEvent) {
    if (event.pointerType === 'touch') return;
    const rect = canvas.getBoundingClientRect();
    mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    pointerWorld = { x: camera.x + (mouse.x - width / 2) / (TILE_SIZE * options.zoom), y: camera.y + (mouse.y - height / 2) / (TILE_SIZE * options.zoom) };
  }

  function pointerDown(event: PointerEvent) {
    if (paused) return;
    if (event.button !== 0 && event.button !== 2) return;
    pointerMove(event);
    canvas.focus({ preventScroll: true });
    if (event.button === 2) { interact(); return; }
    heldAction = event.pointerType !== 'touch';
    primaryAction();
  }

  function pointerUp() { heldAction = false; }
  function contextMenu(event: MouseEvent) { event.preventDefault(); }
  function wheel(event: WheelEvent) {
    if (paused) return;
    event.preventDefault();
    options.zoom = clamp(options.zoom + (event.deltaY > 0 ? -0.1 : 0.1), 0.85, 2.5);
    publish();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('contextmenu', contextMenu);
  canvas.addEventListener('wheel', wheel, { passive: false });
  window.addEventListener('pointerup', pointerUp);
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', clearInput);
  window.addEventListener('resize', resize);

  function load(value: WorldSave) {
    scene = value.sceneId === data.overworld.id || value.sceneId === 'overworld' ? data.overworld : data.interiors[value.sceneId] ?? data.overworld;
    player = { ...player, ...value.player, moving: false, attacking: 0, hurt: 0 };
    inventory = { ...value.inventory };
    hotbar = [...value.hotbar].slice(0, 8);
    while (hotbar.length < 8) hotbar.push('');
    selected = clamp(value.selected, 0, 7);
    harvested = { ...value.harvested };
    placed = clone(value.placed);
    discovered = [...value.discovered];
    explored = new Set(value.explored);
    elapsed = Math.max(0, value.elapsed);
    dayTime = clamp(value.dayTime, 0, 1);
    options = { ...options, ...value.options, zoom: clamp(value.options.zoom, 0.85, 2.5) };
    waypoint = value.waypoint ? { ...value.waypoint } : null;
    waypointScene = value.waypointScene || data.overworld.id;
    camera = { x: player.x, y: player.y };
    if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) { player.x = scene.spawn.x; player.y = scene.spawn.y; }
    initActors();
    ensureFollowers();
    region = regionFor(scene, player);
    nearby = findNearby();
    fishing = null;
    clearInput();
    cancelBuild();
    scanExploration();
    publish();
  }

  initActors();
  if (initialSave) load(initialSave);
  else {
    nearby = findNearby();
    scanExploration();
  }
  resize();

  return {
    start() { if (running || disposed) return; running = true; lastFrame = 0; raf = requestAnimationFrame(frame); publish(); },
    destroy() {
      running = false; disposed = true; cancelAnimationFrame(raf); resizeObserver.disconnect();
      canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('contextmenu', contextMenu); canvas.removeEventListener('wheel', wheel);
      window.removeEventListener('pointerup', pointerUp); window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', clearInput); window.removeEventListener('resize', resize);
      listeners.clear();
    },
    setPaused(value) { paused = value; if (value) clearInput(); publish(); },
    setFlags(value) { if (value.join('|') === flags.join('|')) return; flags = [...value]; applyPatrolPeace(); ensureFollowers(); refreshObjects(); },
    getSnapshot: snapshot,
    getSave: save,
    subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => { listeners.delete(listener); }; },
    selectSlot, consume, craft, beginBuild, cancelBuild,
    setWaypoint(position, sceneId = data.overworld.id) { waypoint = position ? { ...position } : null; waypointScene = sceneId; publish(); },
    setOptions(value) { options = { ...options, ...value }; options.zoom = clamp(options.zoom, 0.85, 2.5); publish(); },
    setTouchDirection(direction) { touchDirection = { x: clamp(direction.x, -1, 1), y: clamp(direction.y, -1, 1) }; },
    interact, primaryAction, teleport, addResource, load,
  };
}
