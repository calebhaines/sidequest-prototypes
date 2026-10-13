import { freshGame, isGameSave, SAVE_KEY, type GameState } from '../data/game';
import { SCENES } from '../data/campaign';
import { INVESTIGATIONS } from '../data/investigations';
import { sceneForId } from './story';
import type { AdventureSave, WorldData, WorldSave } from './types';

export const WORLD_SAVE_KEY = 'lady-supine-open-world-v2';
export function refreshJournal(story: GameState, data?: WorldData): GameState {
  const currentText = new Map(Object.values(SCENES).map(scene => [scene.id, scene.text.join('\n\n')]));
  for (const investigation of INVESTIGATIONS) {
    currentText.set(`case_${investigation.id}_premise`, investigation.premise.join('\n\n'));
    currentText.set(`case_${investigation.id}_conclusion`, investigation.conclusion.join('\n\n'));
    for (const challenge of investigation.challenges) currentText.set(`case_${investigation.id}_${challenge.id}`, [...challenge.narrative, ...challenge.evidence.map(evidence => `${evidence.title}\n${evidence.text}`), ...challenge.resolution].join('\n\n'));
  }
  if (data) for (const world of [data.overworld, ...Object.values(data.interiors)]) {
    for (const actor of world.actors) if (actor.dialogue) currentText.set(`world_actor_${actor.id}`, actor.dialogue);
    for (const object of world.objects) if (object.text && !object.text.startsWith('scene:')) currentText.set(`world_object_${object.id}`, object.text.split('\n').filter(Boolean).join('\n\n'));
  }
  return { ...story, journal: story.journal.map(entry => {
    const scene = sceneForId(entry.scene);
    const text = currentText.get(entry.scene) || (scene.id === entry.scene ? scene.text.join('\n\n') : entry.text);
    return { ...entry, text };
  }) };
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
export function isWorldSave(value: unknown): value is WorldSave {
  if (!value || typeof value !== 'object') return false;
  const v = value as WorldSave;
  const p = v.player;
  return v.version === 2 && typeof v.sceneId === 'string' && !!p && ['x', 'y', 'facing', 'animation', 'health', 'maxHealth', 'stamina', 'maxStamina', 'level', 'xp', 'attacking', 'hurt'].every(key => finite(p[key as keyof typeof p]))
    && typeof p.moving === 'boolean' && p.maxHealth > 0 && p.maxStamina > 0 && p.level >= 1
    && !!v.inventory && !Array.isArray(v.inventory) && Object.values(v.inventory).every(n => finite(n) && n >= 0)
    && strings(v.hotbar) && v.hotbar.length <= 12 && Number.isInteger(v.selected) && v.selected >= 0 && v.selected < 12
    && !!v.harvested && !Array.isArray(v.harvested) && Object.values(v.harvested).every(finite)
    && Array.isArray(v.placed) && v.placed.every(o => o && typeof o.id === 'string' && typeof o.kind === 'string' && finite(o.x) && finite(o.y) && typeof o.solid === 'boolean')
    && strings(v.discovered) && strings(v.explored) && finite(v.elapsed) && finite(v.dayTime)
    && (v.waypoint === null || !!v.waypoint && finite(v.waypoint.x) && finite(v.waypoint.y))
    && (v.waypointScene === undefined || typeof v.waypointScene === 'string')
    && !!v.options && finite(v.options.zoom) && v.options.zoom >= 0.5 && v.options.zoom <= 4 && typeof v.options.reducedMotion === 'boolean' && typeof v.options.particles === 'boolean';
}
export function isAdventureSave(value: unknown): value is AdventureSave {
  if (!value || typeof value !== 'object') return false;
  const v = value as AdventureSave;
  return v.version === 2 && isGameSave(v.story) && isWorldSave(v.world) && finite(v.savedAt);
}
export function loadAdventure(data?: WorldData): { story: GameState; world?: WorldSave; migrated: boolean } {
  try {
    const current = JSON.parse(localStorage.getItem(WORLD_SAVE_KEY) || 'null');
    if (isAdventureSave(current)) return { story: refreshJournal({ ...freshGame(), ...current.story }, data), world: current.world, migrated: false };
    const legacy = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (isGameSave(legacy)) return { story: refreshJournal({ ...freshGame(), ...legacy, investigations: legacy.investigations || {} }, data), migrated: true };
  } catch { /* Play remains available if browser storage is unavailable. */ }
  return { story: freshGame(), migrated: false };
}
export function saveAdventure(story: GameState, world: WorldSave): boolean {
  try {
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify({ version: 2, story, world, savedAt: Date.now() } satisfies AdventureSave));
    return true;
  } catch { return false; }
}
export function safeWorldSave(save: WorldSave, data: WorldData): WorldSave {
  const scene = save.sceneId === data.overworld.id ? data.overworld : data.interiors[save.sceneId];
  if (!scene) return { ...save, sceneId: data.overworld.id, player: { ...save.player, ...data.overworld.spawn } };
  const inBounds = save.player.x > 0 && save.player.y > 0 && save.player.x < scene.width - 1 && save.player.y < scene.height - 1;
  return { ...save, player: { ...save.player, ...(inBounds ? {} : scene.spawn), health: Math.max(1, Math.min(save.player.health, save.player.maxHealth)), stamina: Math.max(0, Math.min(save.player.stamina, save.player.maxStamina)) } };
}
