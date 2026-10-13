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
  '“If you have come to visit, visit,” the doctor says. “Do not ask a patient to be grateful that it could be worse.” His spectacles hang from a string repaired with surgical thread. Behind him, a bucket catches water from the room where the time has stopped.',
  'Models of opened heads stand beside a blank continuity form. The lamp has been wired through a socket taken from somebody’s trailer. “A brain can be removed,” he says. “A living person still needs somewhere to return. Bring me that plan before you bring me their body. Nurse Reed will show you the ward.”',
], [
  { label: 'Visit Nurse Reed in the still ward', next: 'hospital_ward' },
  { label: 'Return to the Shanty Hours', next: 'shanty_arrival' },
]);

worldScene('world_museum_permit', 'museum', 'The Curator', 'A peacock beside a fraying barrier', [
  '“The entrance is absolutely open,” the Curator says, keeping the rope across it. He has polished the bare place where its velvet wore away. “Admission is another matter. Officer Burrow issues the permit in the Fields of Egregious Abundance.”',
  'The building’s old caravan windows are painted to look taller. Rain has lifted one painted corner. A little screen behind the rope repeats EXPERIENCE THE DIVINE ON CHANNEL 9. Its image continues after the sound has failed.',
], [
  { label: 'Find Officer Burrow in the Fields', next: 'fields_arrival' },
  { label: 'Return to Cigarillo Forest', next: 'forest_arrival' },
]);

worldScene('world_screen_willow', 'museum', 'Channel 9', 'A voice waiting for its cue', [
  'A mouth painted to resemble bronze is engraved with an unfinished rhyme: LADY SUPINE / WILL GRANT US TIME / WHEN WE FEED HER / CURLY WILLOW. Someone has mended the grille with a piece of chicken wire.',
  'The screen shows the real woman waiting in her room: a human body beneath an enormous head, its crown left open around a dark aperture. She lifts one hand and demands the next line. Pip knows the verse. Cinder knows where the willow grows. The words printed below her face make no promise to those who cannot supply it.',
], [
  { label: 'Ask Pip about the unfinished rhyme', next: 'pip_rhyme' },
  { label: 'Look for curly willow in Cigarillo Forest', next: 'forest_arrival' },
]);

worldScene('world_gardener_wait', 'fields', 'The Gardener', 'Growing things she cannot keep', [
  'A pear falls beyond the fence. The gardener watches it split. “That will be entered as waste,” she says. “If you picked it up, they would enter it as theft.” The fence is made from three fences with different owners’ names still painted on them.',
  'She props a branch with the leg of a broken bed. Fruit weighs it down toward people who cannot afford to eat. “Officer Burrow can open the little gate. Ask him. I still have to be here when you leave.”',
], [{ label: 'Find Officer Burrow at the permit window', next: 'fields_arrival' }]);

worldScene('world_screen_gallery', 'museum', 'Lady Supine', 'A woman who expects an audience', [
  '“You have my tickets, darling. Go and see what I have given you. Those people outside have had every opportunity to recognise beauty. They prefer filling their bellies.” Her immense human head turns slightly toward a camera that is still recording.',
  'The Curator waits beside the blocks. Three galleries have received the lamps the Hospital requested. Supine blows a kiss through the glass. It touches the patched grille and evaporates. The coat over the Curator’s feathers is too thin for the room.',
], [
  { label: 'Find the Curator beside the blocks', next: 'museum_blocks', requires: '!blocks_pleased' },
  { label: 'Return to the three galleries', next: 'museum_gallery', requires: 'blocks_pleased' },
]);

worldScene('world_curator_dark', 'museum', 'The Curator', 'Still employed, for the moment', [
  'Channel 9 narrows to a white line. “She never changes her mind,” the Curator says. He has rehearsed the next sentence enough to speak it without looking up. “Unless she changes her mind.”',
  'He lowers the rope. “The Hospital is beyond the Library, on the northern road. Dr. Anima knows what can be taken out of a head. Ask him what must be put back.” He lifts the rope again once you have passed. It is still his shift.',
], [
  { label: 'Speak with Dr. Anima at the Hospital', next: 'hospital_arrival' },
  { label: 'Find Ada in the Shanty Hours', next: 'ada_after_banishment' },
  { label: 'Look again at the paintings', next: 'museum_gallery' },
]);

worldScene('world_ada_ready', 'shanty', 'Ada', 'Packing what she may need afterward', [
  'Ada wraps her tools in the scarf she uses to stop the draught under her trailer door. “A replacement brain. A signed way back into my own skull. A machine nobody has used honestly in years.” She ties the knot twice. “I am still going.”',
  '“Meet us in the casino’s quiet room. Pip has the poem. Brindle has found something to eat.” She checks the watch she might no longer be able to reach with these hands. “Do not leave any of us in the wrong body.”',
], [
  { label: 'Meet everyone at the God Switch', next: 'switch_awake' },
  { label: 'Review Dr. Anima’s signed plan', next: 'hospital_plan' },
]);

worldScene('world_switch_locked', 'casino', 'The unlisted curtain', 'A door the floor plan declines to acknowledge', [
  'Through the curtain’s split seam you see a wooden chair with straps screwed into its arms. The gold outside is paint on the same cheap boards. Nothing in the room has been replaced all at once.',
  'A notice reads PRIVATE COLLECTION: ADMISSION FOR WINNERS OF FAIR EXCHANGE. Hustler accepts applications at the table where people spend the time they hoped to win back. Ada’s notes place the oldest machine behind this curtain. It needs living brains, not a clever phrase about changing minds.',
], [
  { label: 'Ask Hustler about Fair Exchange', next: 'casino_host', requires: 'brain_ready' },
  { label: 'Look at the house accounts', next: 'casino_ledger' },
  { label: 'Consult Dr. Anima before proceeding', next: 'hospital_arrival', requires: '!brain_ready' },
]);

worldScene('world_castle_wait', 'castle', 'The servants’ entrance', 'A shift that has not ended', [
  'Two Aristobats hang above the entrance. Silver paint flakes from the patched lining of their uniforms. They listen to the time in your pocket. “Unregistered interval,” one says. The other writes down the pause before you answer.',
  'Behind them, old trailer roofs support an imitation tower. Supine is physically inside, in the room you have seen on Channel 9. Reaching her open-topped head will require the God Switch, Dr. Anima’s return plan, and Ada’s consent. Meet your friends in the casino’s quiet room before making any promise here.',
], [
  { label: 'Find the God Switch in the casino', next: 'casino_arrival' },
  { label: 'Review the continuity plan at the Hospital', next: 'hospital_arrival' },
  { label: 'Return to the Shanty Hours', next: 'shanty_arrival' },
]);

worldScene('world_bedroom_guarded', 'castle', 'The bedchamber door', 'A curtain with a listening wire', [
  'The keyhole has been plated over. A little ear-shaped grille carries sound toward the minders. Above it, a screen shows the woman beyond the door. The camera looks down into the opening at the crown of her immense human head. The brain you intend to remove is inside that hole.',
  'A bell chimes. Supine straightens in the chair, lifting her enormous head with both hands. You will need to stop the observation system before you can enter. Ada will need to agree before the machine touches either of your living minds.',
], [{ label: 'Return to the Aristobat minders', next: 'castle_arrival' }]);

worldScene('world_infinite_early', 'infinite', 'The Entrance to Infinite Time', 'The other threshold', [
  'YOU DO NOT HAVE ENOUGH TIME TO ENTER INFINITE TIME. The wording has been renewed. The service door behind it has not. Somebody has attached imitation marble over the parts people wore down while waiting.',
  'Four circles surround a clock with no hands. The gate counts only one. Somewhere behind you are three people who have kept enough of themselves to speak to you. They have work they still hoped to finish. Return to them before this entrance learns to take what is left.',
], [
  { label: 'Return to your friends in the Shanty Hours', next: 'shanty_arrival' },
  { label: 'Visit the Hospital for Those Out of Time', next: 'hospital_arrival' },
]);

worldScene('world_supine_empty_body', 'castle', 'Supine’s body', 'The beautiful exception', [
  'The human body sits where the operation left it. Its immense head inclines under its own weight. Through the opening at the crown you can see the empty place where Ada’s living brain rested, and where the Lady’s brain had been before the exchange.',
  'The chest continues to rise. Dr. Anima warned that only the most beautiful bodies could endure this absence. Her beauty has spared this body what it could never spare anybody else. The mind that ruled you is in the Hospital’s living jar. Nothing in this room answers when you speak.',
], [{ label: 'Return to Dr. Anima and the living brain', next: 'hospital_return' }]);

/** Physical conversation stations. Scenes within one station can unfold naturally. */
export function sceneOwner(id: string): string {
  if (id === 'world_supine_in_ada') return 'supine_in_ada';
  if (id === 'world_supine_empty_body') return 'castle_lady';
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
  // The mind is Supine's, even though the visible, living body is Ada's.
  if (actor.id === 'supine-in-ada') return 'supine_in_ada';
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
    role: 'Two living minds accounted for',
    text: [
      'The signed continuity form lies beside the examination couch. Ada’s brain is back in Ada’s body. Her ears turn toward a sound she can once again hear for herself. The stitches ache. She has asked that no one tell her the things Supine said through her mouth unless she asks first.',
      'The Lady’s brain remains alive in its jar. Her enormous, emptied human body is still in the castle. “Both minds survived,” Dr. Anima says. “That was the promise. Surviving does not make this something I will ask anyone to forget.” You may sit beside Ada without finding a useful thing to say.',
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
    case 'supine_in_ada': return worldScene('world_supine_in_ada', actor.location, 'Lady Supine, in Ada', 'A ruler wearing your friend’s body', [
      'Ada’s mouth tightens into an expression it has never made for you. Her hands brush at the patched coat as if its cloth could contaminate them. “Get these people away from me,” Supine says. “If this creature has been touching their food, I want its hands washed.” The voice comes from a living hare’s throat. The brain inside it is the Lady’s.',
      'She pulls at one long ear, then orders Brindle to carry her. He looks toward the hands he used to know. “Ada cannot hear you from in here,” she tells him. “She is in my body. She may discover what it costs to be exceptional.” Your friend is waiting in the castle’s enormous human head. You must take this occupied body to Dr. Anima and keep the return plan intact.',
    ], [{ label: has(story, 'reservoir_open') ? 'Take Ada’s occupied body to Dr. Anima' : 'Return to Ada in the Lady’s body', next: has(story, 'reservoir_open') ? 'hospital_return' : 'castle_changed' }]);
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
      if (has(story, 'ada_restored')) return pick('world_supine_empty_body');
      if (!sceneReady(SCENES.castle_arrival, story)) return pick('world_castle_wait');
      if (!has(story, 'minders_distracted')) return pick('world_bedroom_guarded');
      return pick(has(story, 'reservoir_open') ? 'ada_supine' : has(story, 'mind_changed') ? 'castle_changed' : has(story, 'supine_asleep') ? 'castle_asleep' : 'castle_bedroom');
    case 'infinite_gate': return pick(!has(story, 'ada_restored') ? 'world_infinite_early' : has(story, 'final_gate_open') ? 'infinite_open' : 'infinite_arrival');
    default: return actor.dialogue ? worldScene(`world_actor_${actor.id}`, actor.location, actor.name, actor.role, [actor.dialogue]) : SCENES[actor.scene] || worldScene(`world_actor_${actor.id}`, actor.location, actor.name, actor.role, ['The stranger looks past you toward the road. Whatever they were waiting for has not come.']);
  }
}

/** Reopening an NPC preserves an unfinished local scene and never steals another NPC's queued scene. */
export function actorConversation(actor: ActorDef, story: GameState, pendingScene?: string | null): Scene {
  // A restored friend no longer occupies the Lady's visible body in the castle.
  if (actorOwner(actor) === 'castle_lady' && has(story, 'ada_restored')) return sceneForId('world_supine_empty_body');
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
  return worldScene(`world_object_${object.id}`, story.location, object.label || 'A worn notice', 'Still here after its purpose has gone', (object.text || 'Someone kept this because replacing it would cost more time than they had.').split('\n').filter(Boolean));
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
  pip_friend: 'Find Pip beside the shanties’ shared kettle.',
  brindle_friend: 'Find Brindle beside the patched bench in the Shanty Hours.',
  ada_friend: 'Find Ada at the clockmender’s table in the Shanty Hours.',
  papers_obtained: 'Take your certified refusal to Vellum in the Library.',
  willow_rhyme: 'Finish the curly willow rhyme with Pip.',
  willow_cutting_found: 'Take a line to Mallow at the Lake of Tasteful Scarcity.',
  coupon_validated: 'Visit Huckster’s coupon counter in the Shanty Hours.',
  willow_gathered: 'Bring the cutting and finished rhyme to Cinder in Cigarillo Forest.',
  fields_permit: 'Find Officer Burrow’s permit window in the Fields of Egregious Abundance.',
  art_tickets_received: 'Speak to Lady Supine on the Museum’s telescreen.',
  blocks_pleased: 'Find the Curator’s blocks in the Museum.',
  art_understood: 'Look beneath the captions in the Museum’s three galleries.',
  banished: 'Give Lady Supine the compliment she expects through the Museum’s telescreen.',
  brain_plan: 'Ask Dr. Anima how to move two living brains and return both safely.',
  blank_brain_found: 'Ask Before in the Pit of Reversion for a replacement brain.',
  casino_won: 'Play Hustler’s Fair Exchange at the Last Minute casino.',
  god_switch_obtained: 'Wake the God Switch behind the casino’s unlisted curtain.',
  minders_distracted: 'Complete the Aristobats’ handover at the Great Castle Divine.',
  supine_asleep: 'Bring Brindle’s old lullaby to Lady Supine’s bedchamber.',
  mind_changed: 'Ask Ada’s consent before exchanging the living brains.',
  ada_restored: 'Open the reservoir, then take Ada’s occupied body to Dr. Anima.',
  friends_offer_heard: 'Hear Pip, Brindle and Ada beside their patched bench.',
  final_gate_open: 'Walk with your friends to the Entrance to Infinite Time.',
  ending_chosen: 'Decide what to do with the time that remains.',
};

export function questObjective(story: GameState): string {
  if (story.ending) return 'Your friends are still here. The roofs still need mending. There is time left to spend.';
  if (has(story, 'blank_brain_found') && !has(story, 'brain_ready')) return 'Bring the unwritten brain back to Dr. Anima at the Hospital.';
  if (has(story, 'god_switch_obtained') && story.act < 5) return 'Meet your friends beside the God Switch before entering the castle.';
  if (has(story, 'mind_changed') && !has(story, 'reservoir_open')) return 'Help Ada open the castle reservoir and return the missing minutes.';
  if (has(story, 'friends_offer_heard') && !has(story, 'friends_decided')) return 'Hear your friends at Brindle’s bench. They are offering the last of their time.';
  for (const quest of QUESTS.filter(quest => quest.act <= story.act)) {
    const unfinished = quest.steps.find(step => !has(story, step.flag));
    if (unfinished) return objectivePlaces[unfinished.flag] || unfinished.text;
  }
  const location = LOCATIONS.find(place => place.id === sceneForId(story.scene).location);
  return location ? `The next unfinished matter is at ${location.name}.` : 'Walk the Land of Limited Time. Someone may still be waiting.';
}
