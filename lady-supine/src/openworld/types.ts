import type { GameState } from '../data/game';

export const TILE_SIZE = 32;
export type Vec = { x: number; y: number };
export type TileKind = 'grass' | 'darkGrass' | 'dirt' | 'path' | 'water' | 'deepWater' | 'sand' | 'stone' | 'woodFloor' | 'stoneFloor' | 'void' | 'tilled';
export type ActorKind = 'human' | 'gatekeeper' | 'moth' | 'hare' | 'ox' | 'tortoise' | 'otter' | 'deer' | 'mole' | 'peacock' | 'bat' | 'boar' | 'mouse' | 'fox' | 'heron' | 'merchant' | 'lady' | 'salamander';
export type ObjectKind = 'tree' | 'willow' | 'rock' | 'flower' | 'bush' | 'crate' | 'campfire' | 'bench' | 'lantern' | 'sign' | 'gate' | 'building' | 'well' | 'grave' | 'altar' | 'workbench' | 'reed' | 'fence' | 'bed' | 'bookshelf' | 'table' | 'rug' | 'window' | 'portrait' | 'machine' | 'chest' | 'portal' | 'ore' | 'crop';
export type Door = { scene: string; position: Vec };
export type WorldObject = Vec & {
  id: string; kind: ObjectKind; width?: number; height?: number; solid: boolean;
  label?: string; text?: string; color?: string; variant?: number;
  door?: Door; requiresFlag?: string; resource?: { item: string; amount: number; health: number };
};
export type ActorDef = Vec & {
  id: string; name: string; kind: ActorKind; location: string; scene: string; role: string;
  roam?: number; hostile?: boolean; color?: string; dialogue?: string;
};
export type Region = { id: string; name: string; subtitle: string; x: number; y: number; width: number; height: number; color: string; landmark: Vec };
export type WorldScene = {
  id: string; name: string; location: string; width: number; height: number;
  tiles: TileKind[]; objects: WorldObject[]; actors: ActorDef[]; spawn: Vec; outdoors: boolean;
  exit?: Door & { positionInRoom: Vec };
};
export type WorldData = {
  seed: number; overworld: WorldScene; interiors: Record<string, WorldScene>; regions: Region[];
};
export type ActorFrame = ActorDef & {
  facing: number; moving: boolean; animation: number; health: number; attacking: boolean; hurt: number;
};
export type PlayerFrame = Vec & {
  facing: number; moving: boolean; animation: number; health: number; maxHealth: number;
  stamina: number; maxStamina: number; level: number; xp: number; attacking: number; hurt: number;
};
export type Particle = Vec & { vx: number; vy: number; life: number; maxLife: number; color: string; size: number; kind: 'dust' | 'spark' | 'leaf' | 'heart' | 'smoke' | 'time' | 'splash' };
export type FloatingText = Vec & { id: number; text: string; color: string; life: number };
export type FishingState = { position: Vec; phase: 'waiting' | 'bite' | 'caught'; elapsed: number; biteAt: number };
export type InteractTarget = { id: string; type: 'npc' | 'object' | 'door'; name: string; location: string; scene: string; position: Vec; actor?: ActorDef; object?: WorldObject };
export type ResourceItem = { id: string; name: string; description: string; kind: 'tool' | 'resource' | 'food' | 'placeable' | 'time'; color: string; icon: string };
export type Recipe = { id: string; name: string; description: string; ingredients: Record<string, number>; result: string; amount: number; station?: string };
export type WorldOptions = { zoom: number; reducedMotion: boolean; particles: boolean };
export type WorldSave = {
  version: 2; sceneId: string; player: PlayerFrame; inventory: Record<string, number>; hotbar: string[];
  selected: number; harvested: Record<string, number>; placed: WorldObject[]; discovered: string[];
  explored: string[]; elapsed: number; dayTime: number; waypoint: Vec | null; waypointScene?: string; options: WorldOptions;
};
export type WorldSnapshot = WorldSave & {
  region: Region; nearby: InteractTarget | null; fishing: FishingState | null; enemies: number;
  paused: boolean; saving: boolean; areaNotice: string;
  sequence?: WorldSequence | null;
};
export type WorldSequence = { kind: 'exchange' | 'restore'; elapsed: number; duration: number; from: Vec; to: Vec };
export type RenderFrame = {
  scene: WorldScene; data: WorldData; player: PlayerFrame; actors: ActorFrame[];
  objects: WorldObject[]; harvested: Record<string, number>; particles: Particle[]; floating: FloatingText[];
  camera: Vec; zoom: number; time: number; dayTime: number; flags: string[];
  selected: string; nearby: InteractTarget | null; fishing: FishingState | null; waypoint: Vec | null;
  reducedMotion: boolean; buildPreview?: { kind: ObjectKind; position: Vec; valid: boolean } | null;
  sequence?: WorldSequence | null;
};
export type EngineCallbacks = {
  onInteract: (target: InteractTarget) => void;
  onNotify: (text: string, kind?: 'info' | 'success' | 'warning') => void;
  onTimeChange: (seconds: number) => void;
  onArea: (location: string) => void;
  onRecovery: () => void;
  onSound: (sound: string) => void;
  onSequenceComplete?: () => void;
};
export interface GameEngine {
  start(): void; destroy(): void; setPaused(paused: boolean): void;
  setFlags(flags: string[]): void; getSnapshot(): WorldSnapshot; getSave(): WorldSave;
  subscribe(listener: (snapshot: WorldSnapshot) => void): () => void;
  selectSlot(index: number): void; consume(id: string): boolean; craft(id: string): boolean;
  beginBuild(id: string): void; cancelBuild(): void; setWaypoint(position: Vec | null, sceneId?: string): void;
  setOptions(options: Partial<WorldOptions>): void; setTouchDirection(direction: Vec): void;
  interact(): void; primaryAction(): void; teleport(scene: string, position?: Vec): void;
  addResource(id: string, amount: number): void; load(save: WorldSave): void;
  startMindExchange(kind: 'exchange' | 'restore'): void;
  finishMindExchange(): void;
}
export type AdventureSave = { version: 2; story: GameState; world: WorldSave; savedAt: number };
