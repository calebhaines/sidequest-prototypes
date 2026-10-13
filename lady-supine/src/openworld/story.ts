import { LOCATIONS, QUESTS, SCENES } from '../data/campaign';
import type { Choice, Scene } from '../data/campaign';
import { matchesRequirement } from '../data/game';
import type { GameState } from '../data/game';
import type { ActorDef, WorldObject } from './types';

/** A destination is a walking objective, never a command to move the player. */
export type StoryTransition = {
  story: GameState;
  nextScene: Scene | null;
  destination: string | null;
  destinationScene: string | null;
  closeDialogue: boolean;
  ending: string | null;
};

const worldScenes: Record<string, Scene> = {};
const has = (story: GameState, flag: string) => story.flags.includes(flag);
const owns = (story: GameState, item: string) => story.items.includes(item);

function worldScene(id: string, location: string, speaker: string, role: string, text: string[], choices: Choice[] = []): Scene {
  const scene = { id, location, speaker, role, text, choices };
  worldScenes[id] = scene;
  return scene;
}

worldScene('world_hospital_wait', 'hospital', 'Dr. Anima', 'A tortoise with very steady hands', [
  '“If you have come to visit, visit,” the doctor says. “The patients are people, not a lesson in how fortunate you are.” His spectacles rest on a string patched with soft green thread.',
  'He has models of heads on his desk and a blank continuity form. “Should you ever need to change a mind, come back with a reason and a promise to keep. For now, Nurse Reed will show you the ward.”',
], [
  { label: 'Visit Nurse Reed in the still ward', next: 'hospital_ward' },
  { label: 'Return to the Shanty Hours', next: 'shanty_arrival' },
]);

worldScene('world_museum_permit', 'museum', 'The Curator', 'A peacock at an unopened velvet rope', [
  '“The entrance is absolutely open,” the Curator says, holding the rope closed. “Admission is another matter. Officer Burrow issues the permit in the Fields of Egregious Abundance.”',
  'The building reclines above you. Its sleeping windows have been painted open. A little screen behind the rope repeats EXPERIENCE THE DIVINE ON CHANNEL 9.',
], [
  { label: 'Find Officer Burrow in the Fields', next: 'fields_arrival' },
  { label: 'Return to Cigarillo Forest', next: 'forest_arrival' },
]);

worldScene('world_screen_willow', 'museum', 'Channel 9', 'A voice waiting for its cue', [
  'A bronze mouth beneath the telescreen is engraved with an unfinished rhyme: LADY SUPINE / WILL GRANT US TIME / WHEN WE FEED HER / CURLY WILLOW.',
  'The screen shows a human silhouette, perfectly still. The small sound beneath the static might be impatience, or a woman rehearsing her entrance. Pip knows the missing verse. Cinder knows where the willow grows.',
], [
  { label: 'Ask Pip about the unfinished rhyme', next: 'pip_rhyme' },
  { label: 'Look for curly willow in Cigarillo Forest', next: 'forest_arrival' },
]);

worldScene('world_gardener_wait', 'fields', 'The Gardener', 'Growing things, waiting for permission', [
  'A pear has fallen on the far side of the fence. The gardener looks at it, then at the permit window. “The pear knows you are here,” she says. “The paperwork takes longer.”',
  'She steadies a branch too heavy with fruit. “Officer Burrow can open the little gate. Ask him to make room in the categories. I will keep something growing while you do.”',
], [{ label: 'Find Officer Burrow at the permit window', next: 'fields_arrival' }]);

worldScene('world_screen_gallery', 'museum', 'Lady Supine', 'An audience requesting an audience', [
  '“You have my tickets, darling. Now you must see my art. One cannot appreciate a person properly without first appreciating her enormous self-portraits.”',
  'The Curator waits beside the blocks. Beyond him are three galleries, each lit more tenderly than the last. Supine blows a kiss through the glass. It strikes a little brass grille and evaporates.',
], [
  { label: 'Find the Curator beside the blocks', next: 'museum_blocks', requires: '!blocks_pleased' },
  { label: 'Return to the three galleries', next: 'museum_gallery', requires: 'blocks_pleased' },
]);

worldScene('world_curator_dark', 'museum', 'The Curator', 'Keeping the lights on', [
  'Channel 9 is a thin white line. “She never changes her mind,” the Curator says. He looks at the scratched words beneath the screen. “Unless she changes her mind.”',
  'He unhooks the velvet rope. “The Hospital is beyond the Library, on the northern road. Dr. Anima takes unusual questions seriously. Your clockmender friend may have a question worth asking.”',
], [
  { label: 'Speak with Dr. Anima at the Hospital', next: 'hospital_arrival' },
  { label: 'Find Ada in the Shanty Hours', next: 'ada_after_banishment' },
  { label: 'Look again at the paintings', next: 'museum_gallery' },
]);

worldScene('world_ada_ready', 'shanty', 'Ada', 'Packing her tools', [
  'Ada folds a scarf around her tools. “A spare brain, a signed way home, and a Switch that finally knows what a two-way conversation is. That is nearly a plan.”',
  '“Meet us in the casino’s quiet room. Pip will bring the poem. Brindle will bring rather more lunches than danger ordinarily requires.” Her ears turn toward the far road. “Then we go together.”',
], [
  { label: 'Meet everyone at the God Switch', next: 'switch_awake' },
  { label: 'Review Dr. Anima’s signed plan', next: 'hospital_plan' },
]);

worldScene('world_switch_locked', 'casino', 'The unlisted curtain', 'A door the floor plan declines to acknowledge', [
  'Through a seam in the curtain you can see a plain wooden chair. It looks surprisingly out of place among all this gold.',
  'A discreet notice reads PRIVATE COLLECTION: ADMISSION FOR WINNERS OF FAIR EXCHANGE. Hustler is taking applications at the gaming table. Ada’s notes suggest this is where the oldest machine has been hidden.',
], [
  { label: 'Ask Hustler about Fair Exchange', next: 'casino_host', requires: 'brain_ready' },
  { label: 'Look at the house accounts', next: 'casino_ledger' },
  { label: 'Consult Dr. Anima before proceeding', next: 'hospital_arrival', requires: '!brain_ready' },
]);

worldScene('world_castle_wait', 'castle', 'The servants’ entrance', 'Excellent hearing, poor hospitality', [
  'Two silver-lined Aristobats hang over the entrance, listening to the road. “Independent rhythm,” one murmurs. “Unscheduled hope,” says the other.',
  'You could reach the castle alone. Entering the room behind the screens will take the God Switch, Dr. Anima’s safe return plan, and your friends. Ada asked everyone to meet in the casino’s quiet room first.',
], [
  { label: 'Find the God Switch in the casino', next: 'casino_arrival' },
  { label: 'Review the continuity plan at the Hospital', next: 'hospital_arrival' },
  { label: 'Return to the Shanty Hours', next: 'shanty_arrival' },
]);

worldScene('world_bedroom_guarded', 'castle', 'The bedchamber door', 'A curtain listening for permission', [
  'The door has no keyhole. Its little brass ear is turned toward the minders at the servants’ entrance.',
  'Beyond it, a camera bell chimes and a woman sits a little straighter. Before the room can rest, the watching must be allowed to stop.',
], [{ label: 'Return to the Aristobat minders', next: 'castle_arrival' }]);

worldScene('world_infinite_early', 'infinite', 'The Entrance to Infinite Time', 'The other threshold', [
  'YOU DO NOT HAVE ENOUGH TIME TO ENTER INFINITE TIME. The sentence stands perfectly straight, though the hinges behind it have been crying rust.',
  'Four small circles surround its blank clock. The gate counts only one of them. Somewhere in Limited Time, three people are making room for you. You have unfinished work with them before this entrance can learn a different kind of arithmetic.',
], [
  { label: 'Return to your friends in the Shanty Hours', next: 'shanty_arrival' },
  { label: 'Visit the Hospital for Those Out of Time', next: 'hospital_arrival' },
]);

/** Physical conversation stations. Scenes within one station can unfold naturally. */
export function sceneOwner(id: string): string {
  if (id.startsWith('gate_') || id.startsWith('gatekeeper_') || id === 'entrance_return') return 'gatekeeper';
  if (id === 'shanty_arrival') return 'town';
  if (id.startsWith('friends_')) return 'friends';
  if (id.startsWith('pip_')) return 'pip';
  if (id.startsWith('brindle_')) return 'brindle';
  if (id === 'ada_supine') return 'castle_lady';
  if (id.startsWith('ada_') || id === 'world_ada_ready') return 'ada';
  if (id.startsWith('coupon_')) return 'huckster';
  if (id === 'town_whispers') return 'thimble';
  if (id.startsWith('library_')) return 'vellum';
  if (id.startsWith('lake_')) return 'mallow';
  if (id.startsWith('forest_')) return 'cinder';
  if (id === 'fields_abundance' || id === 'world_gardener_wait') return 'gardener';
  if (id.startsWith('fields_')) return 'burrow';
  if (id === 'museum_critics') return 'critics';
  if (id.startsWith('museum_') || id === 'world_museum_permit' || id === 'world_curator_dark') return 'curator';
  if (id === 'supine_jar') return 'doctor';
  if (id.startsWith('supine_') || id.startsWith('world_screen_')) return 'museum_lady';
  if (id === 'hospital_ward') return 'nurse';
  if (id.startsWith('hospital_') || id === 'world_hospital_wait') return 'doctor';
  if (id === 'pit_child') return 'yesterday';
  if (id.startsWith('pit_')) return 'before';
  if (id === 'casino_chapel' || id.startsWith('switch_') || id === 'world_switch_locked') return 'god_switch';
  if (id.startsWith('casino_')) return 'hustler';
  if (id === 'world_castle_wait' || ['castle_arrival', 'castle_minders', 'castle_corridor'].includes(id)) return 'castle_minders';
  if (id.startsWith('castle_') || id === 'world_bedroom_guarded') return 'castle_lady';
  if (id.startsWith('infinite_') || id.startsWith('ending_') || id === 'world_infinite_early') return 'infinite_gate';
  return `object:${id}`;
}

export function actorOwner(actor: ActorDef): string {
  // Roles describe the world; they are not identity. An usher is not the archivist.
  const key = `${actor.id} ${actor.name}`.toLowerCase();
  if (actor.location === 'infinite') return 'infinite_gate';
  if (/gatekeeper/.test(key)) return 'gatekeeper';
  if (/\bpip\b/.test(key)) return 'pip';
  if (/\bbrindle\b/.test(key)) return 'brindle';
  if (/\bada\b/.test(key)) return actor.location === 'castle' ? 'castle_lady' : actor.location === 'casino' ? 'god_switch' : 'ada';
  if (/huckster|coupon/.test(key)) return 'huckster';
  if (/thimble|laundry/.test(key)) return 'thimble';
  if (/vellum|archivist/.test(key)) return 'vellum';
  if (/mallow|fisher/.test(key)) return 'mallow';
  if (/cinder/.test(key)) return 'cinder';
  if (/burrow|permit/.test(key)) return 'burrow';
  if (actor.location === 'fields' && /gardener/.test(key)) return 'gardener';
  if (/curator/.test(key)) return 'curator';
  if (actor.location === 'museum' && /shyster|swindler|critics/.test(key)) return 'critics';
  if (/anima|doctor/.test(key)) return 'doctor';
  if (/nurse|reed/.test(key)) return 'nurse';
  if (/yesterday|pit.child/.test(key)) return 'yesterday';
  if (/\bbefore\b|pit.keeper|reversion/.test(key)) return 'before';
  if (/god.switch|switch.keeper/.test(key)) return 'god_switch';
  if (/hustler|casino.host|dealer/.test(key)) return 'hustler';
  if (actor.location === 'castle' && /minder|aristobat|guard/.test(key)) return 'castle_minders';
  if (/supine|lady|telescreen|channel.?9/.test(key)) return actor.location === 'castle' ? 'castle_lady' : 'museum_lady';
  if (actor.dialogue) return `ambient:${actor.id}`;
  return sceneOwner(actor.scene);
}

export function actorOwnsScene(actor: ActorDef, id: string): boolean {
  const owner = actorOwner(actor);
  const target = sceneOwner(id);
  if (target === 'friends') return ['pip', 'brindle', 'ada'].includes(owner) && actor.location === 'shanty';
  return owner === target;
}

export function sceneForId(id: string): Scene {
  return SCENES[id] || worldScenes[id] || SCENES.gate_arrival;
}

function sceneInContext(scene: Scene, story: GameState): Scene {
  if (scene.id === 'hospital_return' && has(story, 'ada_restored')) return {
    ...scene,
    role: 'A promise kept',
    text: [
      'Dr. Anima keeps the signed continuity form beside the examination couch. Ada is safely herself again. Her ears turn toward the window, listening to an afternoon that belongs to its people.',
      'The Lady’s living jar rests where the two indicator lights once shone. “Both minds came home,” the doctor says. “That was the part of the plan that mattered. You are welcome to sit with them, or review how we kept our promise.”',
    ],
  };
  return scene;
}

function sceneReady(scene: Scene, story: GameState): boolean {
  const id = scene.id;
  if (id === 'library_identity') return has(story, 'papers_obtained');
  if (id.startsWith('friends_')) return has(story, 'ada_restored') && (id === 'friends_arrival' || has(story, 'friends_offer_heard'));
  if (id.startsWith('museum_') || (id.startsWith('supine_') && scene.location === 'museum')) {
    if (!has(story, 'fields_permit')) return false;
    if (id.startsWith('supine_') && !has(story, 'willow_gathered')) return false;
    if (['museum_blocks', 'museum_stacked'].includes(id) && !has(story, 'art_tickets_received')) return false;
    if (['museum_gallery', 'museum_interpretation', 'museum_artist'].includes(id) && !has(story, 'blocks_pleased')) return false;
    if (['supine_wish', 'supine_cameras', 'supine_ordinary'].includes(id) && !has(story, 'art_understood')) return false;
    if (id === 'supine_banishment' && !has(story, 'banished')) return false;
  }
  if (['hospital_doctor', 'hospital_model', 'hospital_plan', 'hospital_provision'].includes(id) && !has(story, 'banished')) return false;
  if (id === 'hospital_plan' && !has(story, 'brain_plan')) return false;
  if (id === 'hospital_provision' && !(owns(story, 'blank_brain') || has(story, 'brain_ready'))) return false;
  if (['hospital_return', 'hospital_extraction', 'supine_jar'].includes(id) && !has(story, 'reservoir_open')) return false;
  if (id === 'casino_host' && !has(story, 'brain_ready')) return false;
  if (id === 'casino_chapel' && !has(story, 'casino_won')) return false;
  if (id.startsWith('switch_') && !has(story, 'god_switch_obtained')) return false;
  if (id.startsWith('castle_') || id === 'ada_supine') {
    if (!has(story, 'brain_ready') || !has(story, 'god_switch_obtained') || !has(story, 'ada_volunteered') || story.act < 5) return false;
    if (!['castle_arrival', 'castle_minders'].includes(id) && !has(story, 'minders_distracted')) return false;
    if (['castle_asleep', 'castle_consent'].includes(id) && !has(story, 'supine_asleep')) return false;
    if (['castle_changed', 'ada_supine'].includes(id) && !has(story, 'mind_changed')) return false;
  }
  if (id.startsWith('infinite_')) {
    if (!has(story, 'ada_restored')) return false;
    if (id !== 'infinite_arrival' && !has(story, 'final_gate_open')) return false;
  }
  return true;
}

function defaultConversation(actor: ActorDef, story: GameState): Scene {
  const owner = actorOwner(actor);
  const pick = (id: string) => sceneForId(id);
  switch (owner) {
    case 'gatekeeper': return pick(has(story, 'entrance_denied') ? 'entrance_return' : 'gate_arrival');
    case 'pip':
      if (has(story, 'ada_restored')) return pick(has(story, 'friends_offer_heard') ? 'friends_offer' : 'friends_arrival');
      return pick(!has(story, 'pip_friend') ? 'pip_hello' : !has(story, 'willow_rhyme') ? 'pip_rhyme' : 'pip_remembers');
    case 'brindle':
      if (has(story, 'ada_restored')) return pick(has(story, 'friends_offer_heard') ? 'friends_offer' : 'friends_arrival');
      return pick(has(story, 'brindle_friend') && !has(story, 'brindle_helped') ? 'brindle_kindness' : 'brindle_hello');
    case 'ada':
      if (has(story, 'ada_restored')) return pick(has(story, 'friends_offer_heard') ? 'friends_offer' : 'friends_arrival');
      if (has(story, 'god_switch_obtained')) return pick('world_ada_ready');
      if (has(story, 'banished')) return pick('ada_after_banishment');
      return pick(has(story, 'ada_friend') ? 'ada_clock' : 'ada_hello');
    case 'huckster': return pick(owns(story, 'valid_coupon') ? 'coupon_sorted' : 'coupon_counter');
    case 'thimble': return pick('town_whispers');
    case 'vellum': return pick(has(story, 'papers_obtained') ? 'library_arrival' : has(story, 'catalog_solved') ? 'library_cataloged' : owns(story, 'refusal') ? 'library_clerk' : 'library_arrival');
    case 'mallow': return pick('lake_arrival');
    case 'cinder': return pick('forest_arrival');
    case 'burrow': return pick('fields_arrival');
    case 'gardener': return pick(has(story, 'fields_permit') ? 'fields_abundance' : 'world_gardener_wait');
    case 'curator':
      if (!has(story, 'fields_permit')) return pick('world_museum_permit');
      if (has(story, 'banished')) return pick('world_curator_dark');
      return pick(!has(story, 'art_tickets_received') ? 'museum_arrival' : !has(story, 'blocks_pleased') ? 'museum_blocks' : 'museum_gallery');
    case 'critics': return pick(has(story, 'fields_permit') ? 'museum_critics' : 'world_museum_permit');
    case 'museum_lady':
      if (!has(story, 'fields_permit')) return pick('world_museum_permit');
      if (!has(story, 'willow_gathered')) return pick('world_screen_willow');
      if (has(story, 'banished')) return pick('supine_banishment');
      return pick(!has(story, 'art_tickets_received') ? 'supine_telescreen' : !has(story, 'art_understood') ? 'world_screen_gallery' : 'supine_wish');
    case 'doctor':
      if (!has(story, 'banished')) return pick('world_hospital_wait');
      if (has(story, 'reservoir_open') && !has(story, 'ada_restored')) return pick('hospital_return');
      if (has(story, 'ada_restored')) return pick('hospital_arrival');
      if (owns(story, 'blank_brain') && !has(story, 'brain_ready')) return pick('hospital_provision');
      return pick(has(story, 'brain_plan') ? 'hospital_plan' : 'hospital_doctor');
    case 'nurse': return pick('hospital_ward');
    case 'before': return pick('pit_arrival');
    case 'yesterday': return pick('pit_child');
    case 'hustler':
      if (has(story, 'casino_won') && !has(story, 'casino_paid')) return pick('casino_won');
      return pick(has(story, 'brain_ready') && !has(story, 'casino_won') ? 'casino_host' : 'casino_arrival');
    case 'god_switch': return pick(!has(story, 'casino_won') ? 'world_switch_locked' : !has(story, 'god_switch_obtained') ? 'casino_chapel' : story.act < 5 ? 'switch_awake' : 'switch_agreement');
    case 'castle_minders': return pick(sceneReady(SCENES.castle_arrival, story) ? 'castle_arrival' : 'world_castle_wait');
    case 'castle_lady':
      if (!sceneReady(SCENES.castle_arrival, story)) return pick('world_castle_wait');
      if (!has(story, 'minders_distracted')) return pick('world_bedroom_guarded');
      return pick(has(story, 'reservoir_open') ? 'ada_supine' : has(story, 'mind_changed') ? 'castle_changed' : has(story, 'supine_asleep') ? 'castle_asleep' : 'castle_bedroom');
    case 'infinite_gate': return pick(!has(story, 'ada_restored') ? 'world_infinite_early' : has(story, 'final_gate_open') ? 'infinite_open' : 'infinite_arrival');
    default: return actor.dialogue ? worldScene(`world_actor_${actor.id}`, actor.location, actor.name, actor.role, [actor.dialogue]) : SCENES[actor.scene] || worldScene(`world_actor_${actor.id}`, actor.location, actor.name, actor.role, ['The stranger gives you the small courtesy of an unhurried nod.']);
  }
}

/** Reopening an NPC preserves an unfinished local scene and never steals another NPC's queued scene. */
export function actorConversation(actor: ActorDef, story: GameState, pendingScene?: string | null): Scene {
  // The museum has two physical stations. Entering via the telescreen must not
  // bypass the abundance case that the old single entrance used to require.
  if (actor.location === 'museum' && ['curator', 'museum_lady', 'critics'].includes(actorOwner(actor)) && has(story, 'fields_permit') && !has(story, 'case_abundance_audit_done')) return SCENES.museum_arrival;
  for (const id of [pendingScene, story.scene]) {
    if (!id || (!SCENES[id] && !worldScenes[id]) || !actorOwnsScene(actor, id)) continue;
    const scene = sceneForId(id);
    if (sceneReady(scene, story)) return sceneInContext(scene, story);
  }
  return sceneInContext(defaultConversation(actor, story), story);
}

function objectSceneId(object: WorldObject): string | null {
  const explicit = object.text?.match(/^scene:([a-z_]+)/)?.[1];
  if (explicit && SCENES[explicit]) return explicit;
  if (SCENES[object.id]) return object.id;
  const key = `${object.id} ${object.label || ''}`.toLowerCase();
  if (/infinite|far.threshold/.test(key)) return 'infinite_arrival';
  if (/museum/.test(object.id) && /telescreen|channel.?9/.test(key)) return 'supine_telescreen';
  if (/god.switch/.test(key)) return 'casino_chapel';
  if (/castle|supine/.test(object.id) && /bedchamber|supine.bed/.test(key)) return 'castle_bedroom';
  return null;
}

export function objectOwnsScene(object: WorldObject, id: string): boolean {
  const base = objectSceneId(object);
  return Boolean(base && sceneOwner(base) === sceneOwner(id));
}

/** Story machines and notices are opened in the world just like an NPC conversation. */
export function objectConversation(object: WorldObject, story: GameState): Scene {
  const base = objectSceneId(object);
  if (base) {
    const station = sceneForId(base);
    const actor: ActorDef = { id: object.id, name: object.label || station.speaker, kind: 'human', location: station.location, scene: base, role: station.role || '', x: object.x, y: object.y };
    return actorConversation(actor, story);
  }
  if (object.kind === 'willow' && /curly|story|ancient/.test(`${object.id} ${object.label || ''}`.toLowerCase())) return sceneForId(has(story, 'willow_gathered') ? 'forest_willow' : 'forest_path');
  return worldScene(`world_object_${object.id}`, story.location, object.label || 'A small notice', 'Something the world has left for you', (object.text || 'You make room for a moment that nobody has put a price on.').split('\n').filter(Boolean));
}

/** Hide unavailable actions, including early visits to places outside the current story act. */
export function choicesForScene(scene: Scene, story: GameState): Choice[] {
  return scene.choices.filter(choice => {
    if (!matchesRequirement(choice.requires, story.flags) || (choice.item && !owns(story, choice.item))) return false;
    if (choice.next === 'hospital_doctor' && !has(story, 'banished')) return false;
    if (choice.next?.startsWith('friends_') && !has(story, 'ada_restored')) return false;
    if (choice.next?.startsWith('ending_') && !has(story, 'final_gate_open')) return false;
    if (choice.next === 'infinite_question' && !has(story, 'final_gate_open')) return false;
    return true;
  });
}

function actionKey(scene: string, choice: Choice): string {
  let hash = 2166136261;
  for (const char of `${choice.label}|${choice.next || ''}|${choice.puzzle || ''}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `story_action:${scene}:${(hash >>> 0).toString(36)}`;
}

function recordScene(story: GameState, scene: Scene): void {
  if (!story.journal.some(moment => moment.scene === scene.id)) story.journal.push({ scene: scene.id, speaker: scene.speaker, text: scene.text.join('\n\n'), timestamp: Date.now() });
  if (!story.visited.includes(scene.id)) story.visited.push(scene.id);
}

/** Apply narrative consequences only. Movement, puzzle boards and casebook gates belong to the controller. */
export function applyStoryChoice(current: GameState, choice: Choice): StoryTransition {
  const source = sceneForId(current.scene);
  if (!matchesRequirement(choice.requires, current.flags) || (choice.item && !owns(current, choice.item))) return { story: current, nextScene: source, destination: null, destinationScene: null, closeDialogue: false, ending: current.ending };
  const story: GameState = { ...current, flags: [...current.flags], items: [...current.items], unlocked: [...current.unlocked], visited: [...current.visited], journal: [...current.journal], solved: [...current.solved], investigations: { ...current.investigations } };
  const key = actionKey(source.id, choice);
  const alreadyApplied = story.flags.includes(key);
  if (!alreadyApplied) {
    for (const effect of choice.effects || []) {
      // Legacy saves have no action markers; an existing task flag still identifies its paid reward.
      const completedEffect = Boolean(effect.flag && current.flags.includes(effect.flag));
      if (effect.time && !completedEffect) story.time = Math.max(0, story.time + effect.time * 60);
      if (effect.addItem && !completedEffect && !story.items.includes(effect.addItem)) story.items.push(effect.addItem);
      if (effect.removeItem && !completedEffect) story.items = story.items.filter(item => item !== effect.removeItem);
      if (effect.flag && !story.flags.includes(effect.flag)) story.flags.push(effect.flag);
      if (effect.unlock && !story.unlocked.includes(effect.unlock)) story.unlocked.push(effect.unlock);
      if (effect.act) story.act = Math.max(story.act, effect.act);
    }
    if (choice.effects?.length) story.flags.push(key);
  }
  if (choice.puzzle && !story.solved.includes(choice.puzzle)) story.solved.push(choice.puzzle);
  recordScene(story, source);
  let next = choice.next ? sceneInContext(sceneForId(choice.next), story) : null;
  // This old branch used to jump directly into an offer. In the world the friends must first assemble.
  if (next?.id === 'friends_offer' && !has(story, 'friends_offer_heard')) next = SCENES.friends_arrival;
  if (next) story.scene = next.id;
  if (choice.ending) {
    story.ending = choice.ending;
    if (next) recordScene(story, next);
    return { story, nextScene: next, destination: null, destinationScene: null, closeDialogue: false, ending: choice.ending };
  }
  const otherStation = Boolean(next && sceneOwner(next.id) !== sceneOwner(source.id));
  const travel = Boolean(next && next.location !== source.location);
  const returnToWorld = next?.id === 'shanty_arrival' || Boolean(next && otherStation);
  const closeDialogue = !next || travel || returnToWorld;
  if (next && !closeDialogue) recordScene(story, next);
  // The story location describes the physically occupied area. A choice cannot overwrite it.
  story.location = current.location;
  return {
    story,
    nextScene: closeDialogue ? null : next,
    destination: closeDialogue && next ? next.location : null,
    destinationScene: closeDialogue && next ? next.id : null,
    closeDialogue,
    ending: story.ending,
  };
}

const objectivePlaces: Record<string, string> = {
  entrance_denied: 'Speak to the Gatekeeper at the Unenterable Entrance.',
  pip_friend: 'Meet Pip beside the kettle in the Shanty Hours.',
  brindle_friend: 'Meet Brindle beside his little bench in the Shanty Hours.',
  ada_friend: 'Meet Ada at the clockmender’s bench in the Shanty Hours.',
  papers_obtained: 'Take your certified refusal to Vellum in the Library.',
  willow_rhyme: 'Finish the curly willow rhyme with Pip.',
  willow_cutting_found: 'Take a line to Mallow at the Lake of Tasteful Scarcity.',
  coupon_validated: 'Visit Huckster’s coupon counter in the Shanty Hours.',
  willow_gathered: 'Bring the cutting and finished rhyme to Cinder in Cigarillo Forest.',
  fields_permit: 'Find Officer Burrow’s permit window in the Fields of Egregious Abundance.',
  art_tickets_received: 'Speak to Lady Supine on the Museum’s telescreen.',
  blocks_pleased: 'Find the Curator’s blocks in the Museum.',
  art_understood: 'Look beneath the captions in the Museum’s three galleries.',
  banished: 'Bring Lady Supine an honest compliment through the Museum’s telescreen.',
  brain_plan: 'Ask Dr. Anima at the Hospital how to keep both minds safe.',
  blank_brain_found: 'Seek a beginning with Before in the Pit of Reversion.',
  casino_won: 'Play Hustler’s Fair Exchange at the Last Minute casino.',
  god_switch_obtained: 'Wake the God Switch behind the casino’s unlisted curtain.',
  minders_distracted: 'Complete the Aristobats’ handover at the Great Castle Divine.',
  supine_asleep: 'Bring Brindle’s lullaby to Lady Supine’s bedchamber.',
  mind_changed: 'Ask Ada for her consent beside the Lady’s bed.',
  ada_restored: 'Keep the reservoir open, then bring Ada safely to Dr. Anima.',
  friends_offer_heard: 'Gather with Pip, Brindle and Ada at their bench in the Shanty Hours.',
  final_gate_open: 'Walk with your friends to the Entrance to Infinite Time.',
  ending_chosen: 'Decide together what a future is for.',
};

export function questObjective(story: GameState): string {
  if (story.ending) return 'An ordinary afternoon is yours. Explore, build, fish, and keep your friends company.';
  if (has(story, 'blank_brain_found') && !has(story, 'brain_ready')) return 'Bring the unwritten brain back to Dr. Anima at the Hospital.';
  if (has(story, 'god_switch_obtained') && story.act < 5) return 'Gather your friends beside the God Switch in the casino’s quiet room.';
  if (has(story, 'mind_changed') && !has(story, 'reservoir_open')) return 'Help Ada open the castle reservoir and return the missing minutes.';
  if (has(story, 'friends_offer_heard') && !has(story, 'friends_decided')) return 'Hear your friends out on Brindle’s bench. Their offer is a choice.';
  for (const quest of QUESTS.filter(quest => quest.act <= story.act)) {
    const unfinished = quest.steps.find(step => !has(story, step.flag));
    if (unfinished) return objectivePlaces[unfinished.flag] || unfinished.text;
  }
  const location = LOCATIONS.find(place => place.id === sceneForId(story.scene).location);
  return location ? `Follow your next question to ${location.name}.` : 'Walk the Land of Limited Time. Make room for someone.';
}
