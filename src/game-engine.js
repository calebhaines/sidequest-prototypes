import { WORLD_SIZE, drawWorld, drawCharacter, getSpawn, getWorldFeatures, getObstacles, getWorldSize, getWorldRegions } from './world-renderer.js';
import { NEW_STORIES } from './new-stories.js';

// Each prototype shares controls, while its story, objectives and weapon differ.
const ORIGINAL_STORIES = {
  moss: {
    title: 'The sleeping roots', weapon: 'blade', currency: 'crowns', enemy: 'Brambleling',
    objective: 'Wake the two old shrines and clear two bramblelings. Return to the keeper.',
    intro: 'The forest used to hum. Last night it fell silent, and the roots started walking. Wake the old shrines beyond the village. Then clear two bramblelings so the song can travel home.',
    lore: 'We build our houses around living trees. The forest remembers every promise, even the ones people forget. The western shrine remembers rain; the eastern one remembers sunlight.',
    advice: 'Follow the golden diamond. Touch a shrine with E to wake it. Your blade reaches in front of you; keep moving between swings. I can mend your wounds before you go.',
    examine: 'The stone is warm. A green note rises through the roots, and somewhere beneath your feet something answers.',
    rumor: 'I saw a root drinking moonlight out of the well. I am choosing to believe that is normal.',
    resolution: 'The leaves are singing again. Those bramblelings were protecting a frightened forest. Next time, perhaps we will listen sooner.',
    reward: 'Keep the song alive', bounty: 65,
  },
  neon: {
    title: 'A city without a signal', weapon: 'bolt', currency: 'credits', enemy: 'Patrol drone',
    objective: 'Patch two street relays and disable two patrol drones. Return to your contact.',
    intro: 'The corporate network has swallowed our district. Two old street relays can give us a private channel. Patch them, scrap two patrol drones, and meet me here. We decide who gets to speak.',
    lore: 'Upstairs, everyone has a subscription to clean air. Down here, we share a roof and a hacked weather feed. This network could connect every block without a corporate gatekeeper.',
    advice: 'E patches a relay when you are close. Your pulse pistol fires along your facing direction, with a little target assistance. Drones cannot hit you if you keep your distance.',
    examine: 'You bridge the burned contacts. A pirate frequency crackles alive: “If you can hear this, you are not alone.”',
    rumor: 'There is a diner under the elevated road that sells actual coffee. No one knows where the beans come from.',
    resolution: 'Every block is back on the air. Now we can keep the channel public, or sell an encrypted copy to fund tomorrow. That part is yours.',
    reward: 'Make the signal public', bounty: 80,
  },
  dust: {
    title: 'Water for the last stop', weapon: 'shot', currency: 'scrip', enemy: 'Scrap jackal',
    objective: 'Salvage two supply caches and drive off a scrap jackal. Return to the mechanic.',
    intro: 'The town pump has one good day left. Two supply caches out on the frontier hold the parts we need. Salvage them and drive off a scrap jackal. There will be cold water when you get back.',
    lore: 'This used to be a seabed. You can still find shells under the rust. Everyone out here is travelling somewhere; most of us just have not decided where yet.',
    advice: 'Look for supply crates and press E to salvage them. Your revolver hits hard but fires slowly. Keep a few steps between you and the jackals. Sprint through trouble with Shift.',
    examine: 'Under the hot metal you find a faded map, an old water gauge, and one very stubborn seed.',
    rumor: 'The radio tower catches broadcasts from towns that disappeared years ago. The music is still pretty good.',
    resolution: 'You hear the pump catch. Water spills into the basin, and people come out of every doorway. A small miracle, built from somebody else’s scrap.',
    reward: 'Leave the water free', bounty: 70,
  },
  odd: {
    title: 'The missing Thursday', weapon: 'pulse', currency: 'buttons', enemy: 'Bad thought',
    objective: 'Hear two neighbours’ stories, investigate the strange landmark, then return home.',
    intro: 'Thursday is missing. The calendar goes from Wednesday to Friday, and nobody remembers the gap. Ask two neighbours what they saw. Then visit the place with the golden diamond. Please do not feed the bad thoughts.',
    lore: 'The clouds arrived with return addresses. The school clock keeps coughing. Dad says everything is fine, which is how I know something interesting is happening.',
    advice: 'Talk to people with E; everyone remembers a different piece. Your yo-yo sends a small pulse around you with Space. Running away is also an entirely respectable plan.',
    examine: 'A tiny Thursday sits inside the object, eating a sandwich. It says it needed a break. You promise not to tell the calendar.',
    rumor: 'My neighbour remembers a parade made entirely of umbrellas. I remember a dog apologising to the moon. Both seem plausible.',
    resolution: 'Thursday slides back between Wednesday and Friday. Nobody notices, except the clouds. One of them sends a thank-you note.',
    reward: 'Keep Thursday’s secret', bounty: 55,
  },
};
const STORIES = { ...ORIGINAL_STORIES, ...NEW_STORIES };

const DIR = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const GOLD = '#f3ce72';

export function createGame(canvas, theme, callbacks = {}) {
  theme = STORIES[theme] ? theme : 'moss';
  const story = STORIES[theme];
  const isNew = theme === 'lynch' || theme === 'shinobi';
  const worldSize = isNew ? getWorldSize(theme) : WORLD_SIZE;
  const regions = isNew ? getWorldRegions(theme) || [] : [];
  const regionsVisited = new Set();
  const context = canvas.getContext('2d');
  const spawn = getSpawn(theme);
  const features = getWorldFeatures(theme).map((feature, index) => {
    const data = (feature.type === 'npc' ? story.npcs : story.landmarks)?.find(item => item.name === feature.name);
    return { ...feature, id: `${theme}-${index}`, discovered: false, opened: false, ...(isNew ? { requiredPhase: data?.phase || feature.phase || 'both' } : {}), ...(data ? { storyData: data, role: data.role || feature.role } : {}) };
  });
  const obstacles = getObstacles(theme) || [];
  const npcs = features.filter(f => f.type === 'npc');
  const giver = (isNew && npcs.find(npc => npc.role === 'guide')) || [...npcs].sort((a, b) => distance(a, spawn) - distance(b, spawn))[0];
  const landmarks = features.filter(f => f.type === 'landmark').sort((a, b) => distance(b, spawn) - distance(a, spawn));
  const chests = features.filter(f => f.type === 'chest');
  const targets = isNew ? landmarks.filter(feature => feature.main === true || feature.storyData?.main === true) : theme === 'dust' ? chests.slice(0, 2)
    : theme === 'odd' ? [...npcs.filter(f => f !== giver).slice(0, 2), ...landmarks.slice(0, 1)]
      : landmarks.slice(0, 2);
  const killsNeeded = theme === 'lynch' || theme === 'odd' ? 0 : theme === 'dust' ? 1 : 2;
  const completed = new Set();
  const talked = new Set();
  const visited = new Set();
  const held = { up: false, down: false, left: false, right: false, sprint: false, attack: false };
  const player = {
    x: spawn.x, y: spawn.y, facing: 'down', moving: false, attacking: 0,
    health: 100, maxHealth: 100, level: 1, xp: 0, xpNext: 60,
  };
  const camera = { x: 0, y: 0 };
  const effects = [];
  const projectiles = [];
  const inventory = [];
  const journal = [];
  const recordedClues = new Set();
  const clones = [];
  const dialogueFlags = new Set();
  const rememberedReplies = new Map();
  const sideQuestRecords = (isNew ? story.sideQuests || [] : []).map(data => ({ data, status: 'available', completed: new Set() }));
  const travelPoints = features.filter(feature => feature.type === 'waypoint' || feature.type === 'travel');
  const initialStop = [...travelPoints].sort((a, b) => distance(a, spawn) - distance(b, spawn))[0];
  if (initialStop) { initialStop.discovered = true; visited.add(initialStop.id); }
  let trackedQuest = 'main';
  const abilityCooldowns = { dreamshift: 0, ember: 0, clone: 0, substitution: 0 };
  const abilityDefinitions = theme === 'shinobi' ? [
    { id: 'ember', key: '1', name: 'Ember Release', description: 'A fireball bursts into an area of flame.', cost: 20, duration: 2.4 },
    { id: 'clone', key: '2', name: 'Shadow Clone', description: 'A chakra double draws enemy attacks for 8 seconds.', cost: 28, duration: 9 },
    { id: 'substitution', key: '3', name: 'Substitution', description: 'Dash out of danger and leave a wooden decoy.', cost: 16, duration: 4.5 },
  ] : theme === 'lynch' ? [
    { id: 'dreamshift', key: 'Q', name: 'Cross the dream', description: 'Mercy Falls has two versions. Cross between them to uncover the truth.', cost: 0, duration: 1.2 },
  ] : [];
  let worldPhase = 'waking';
  let resource = 100;
  let maxResource = 100;
  let narrativeRoute = false;
  let chosenEnding = null;
  const enemyPositions = theme === 'lynch' ? [
    { x: 1020, y: 468 }, { x: 1350, y: 350 }, { x: 1150, y: 880 }, { x: 355, y: 415 },
    { x: 2450, y: 970 }, { x: 3190, y: 1430 }, { x: 4480, y: 1040 },
    { x: 1440, y: 2870 }, { x: 2590, y: 2480 }, { x: 3870, y: 3050 },
  ] : theme === 'shinobi' ? [
    { x: 1140, y: 385 }, { x: 1195, y: 495 }, { x: 440, y: 845 }, { x: 440, y: 910 },
    { x: 1880, y: 1230 }, { x: 2930, y: 1410 }, { x: 4370, y: 930 },
    { x: 3960, y: 2030 }, { x: 2470, y: 3010 }, { x: 3790, y: 3190 },
  ] : [
    { x: 1160, y: 360 }, { x: 1260, y: 445 }, { x: 470, y: 865 },
    { x: 380, y: 955 }, { x: 1210, y: 870 }, { x: 1115, y: 935 },
    { x: 340, y: 350 }, { x: 1090, y: 220 },
  ];
  const enemies = enemyPositions.map((position, index) => ({
    ...position, homeX: position.x, homeY: position.y, type: 'enemy', name: story.enemy,
    id: `enemy-${index}`, kind: theme, health: theme === 'dust' ? 65 : 48, maxHealth: theme === 'dust' ? 65 : 48,
    phase: index * 1.57, attackCooldown: 0, hitFlash: 0, defeated: false, stunned: 0,
  }));

  let coins = 20;
  let kills = 0;
  let questComplete = false;
  let dialogueOpen = false;
  let externallyPaused = false;
  let destroyed = false;
  let width = 960;
  let height = 600;
  let scale = 2;
  let ratio = 1;
  let elapsed = 0;
  let cooldown = 0;
  let invulnerable = 0;
  let sinceHit = 10;
  let frameId = 0;
  let lastTime = 0;
  let stateTime = 0;
  let location = 'Village crossroads';
  let introTimer = 1.5;
  let interactionPulse = 0;
  let afterimageTime = 0;

  function toast(message) { callbacks.onToast?.(message); }
  function clearMovement() { Object.keys(held).forEach(key => { held[key] = false; }); }
  function paused() { return dialogueOpen || externallyPaused; }
  function combatCredit() { return theme === 'shinobi' && narrativeRoute ? killsNeeded : Math.min(kills, killsNeeded); }
  function questReady() { return completed.size >= targets.length && combatCredit() >= killsNeeded; }
  function questProgress() { return completed.size + combatCredit(); }
  function visibleFeature(feature) { return theme !== 'lynch' || feature.type === 'landmark' || feature.type === 'waypoint' || !feature.phase || feature.phase === 'both' || feature.phase === worldPhase; }
  function addJournal(title, text, key = title) {
    if (recordedClues.has(key)) return;
    recordedClues.add(key);
    journal.push({ title, text, phase: worldPhase });
    addXP(10);
    toast(`Notebook updated: ${title} · +10 XP`);
  }
  function grantClue(clue, text) {
    if (!clue) return;
    addJournal(story.clueNames?.[clue] || clue, text || story.clueNames?.[clue] || clue, clue);
    if (theme === 'shinobi' && clue === (story.peacefulRouteClue || 'watchtower-password') && !narrativeRoute) {
      narrativeRoute = true;
      if (!inventory.includes('Watchtower passphrase scroll')) inventory.push('Watchtower passphrase scroll');
      for (const enemy of enemies) enemy.pacified = true;
      toast('The oath opens a peaceful route. Rogue defeats are optional.');
    }
  }
  function meetsRequirement(value, records) {
    if (!value) return true;
    return (Array.isArray(value) ? value : [value]).every(key => String(key).startsWith('!') ? !records.has(String(key).slice(1)) : records.has(key));
  }
  function topicAvailable(topic) {
    return meetsRequirement(topic.requiresFlag, dialogueFlags) && meetsRequirement(topic.requiresClue, recordedClues);
  }
  function sideDestination(record) {
    if (!record || record.status === 'complete') return null;
    if (record.status === 'available' || record.status === 'ready') return npcs.find(npc => npc.name === record.data.giver) || null;
    const step = record.data.steps.find((item, index) => !record.completed.has(index));
    return features.find(feature => feature.name === step?.feature) || null;
  }
  function trackQuest(id = 'main') {
    if (!isNew || (id !== 'main' && !sideQuestRecords.some(record => record.data.id === id && ['active', 'ready'].includes(record.status)))) return false;
    trackedQuest = id;
    emitState();
    return true;
  }
  function acceptSideQuest(record) {
    if (record.status !== 'available') return;
    record.status = 'active';
    trackedQuest = record.data.id;
    addJournal(record.data.title, record.data.intro, `side-accepted-${record.data.id}`);
    toast(`Quest accepted: ${record.data.title}`);
    openDialogue(record.data.giver, record.data.intro, [{ label: 'I’ll follow that lead', action: () => {} }]);
  }
  function markSideStep(type, feature) {
    const responses = [];
    for (const record of sideQuestRecords) {
      if (record.status !== 'active') continue;
      record.data.steps.forEach((step, index) => {
        const phase = step.phase || feature.requiredPhase || feature.phase || 'both';
        if (step.type !== type || step.feature !== feature.name || record.completed.has(index) || (theme === 'lynch' && phase !== 'both' && phase !== worldPhase)) return;
        record.completed.add(index);
        if (step.text) responses.push(step.text);
        addJournal(`${record.data.title}: ${feature.name}`, step.text, `side-step-${record.data.id}-${index}`);
      });
      if (record.completed.size >= record.data.steps.length) {
        record.status = 'ready';
        toast(`${record.data.title}: return to ${record.data.giver}.`);
      }
    }
    return responses;
  }
  function finishSideQuest(record) {
    if (record.status !== 'ready') return;
    record.status = 'complete';
    coins += record.data.reward || 0;
    if (record.data.item && !inventory.includes(record.data.item)) inventory.push(record.data.item);
    addXP(45);
    addJournal(`${record.data.title} · complete`, record.data.completeText, `side-complete-${record.data.id}`);
    if (trackedQuest === record.data.id) trackedQuest = 'main';
    toast(`Quest complete · +${record.data.reward || 0} ${story.currency} · +45 XP`);
    openDialogue(record.data.giver, record.data.completeText, [{ label: 'I’m glad I could help', action: () => {} }]);
  }
  function travelTo(id) {
    if (!isNew || destroyed) return false;
    const stop = travelPoints.find(point => point.id === id && point.discovered);
    if (!stop || !canStand(stop.x, stop.y)) return false;
    clearMovement(); dialogueOpen = false;
    player.x = stop.x; player.y = stop.y;
    invulnerable = Math.max(invulnerable, 3);
    location = stop.name;
    toast(`Arrived at ${stop.name}.`);
    emitState();
    return true;
  }
  function openTravel() {
    if (!isNew || destroyed || externallyPaused || dialogueOpen) return false;
    openDialogue(theme === 'lynch' ? 'County night service' : 'Shinobi travel routes', 'Return to a stop you have visited. Explore the roads to discover more routes.', [
      ...travelPoints.filter(point => point.discovered).map(point => ({ label: `${point.name}${distance(point, player) < 100 ? ' · here' : ''}`, action: () => travelTo(point.id) })),
      { label: 'Stay here', action: () => {} },
    ]);
    return true;
  }

  function canStand(x, y, radius = 8) {
    if (x < 22 || y < 25 || x > worldSize.width - 22 || y > worldSize.height - 22) return false;
    return !obstacles.some(o => x + radius > o.x && x - radius < o.x + o.width && y + radius > o.y && y - radius < o.y + o.height);
  }

  function move(entity, dx, dy) {
    const nx = entity.x + dx;
    const ny = entity.y + dy;
    if (canStand(nx, entity.y)) entity.x = nx;
    if (canStand(entity.x, ny)) entity.y = ny;
  }

  // Start beside the guide and recover gracefully if a scenery layout changes.
  if (giver && distance(player, giver) > 72) {
    const nx = giver.x + 54;
    const ny = giver.y + 28;
    if (canStand(nx, ny)) { player.x = nx; player.y = ny; }
  }
  const safeSpawn = { x: player.x, y: player.y };
  for (const enemy of enemies) {
    if (!canStand(enemy.x, enemy.y) || (isNew && [...npcs, ...travelPoints].some(feature => distance(feature, enemy) < 130))) {
      let relocated = false;
      for (let radius = 24; radius <= 192 && !relocated; radius += 24) {
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
          const x = enemy.x + Math.cos(angle) * radius;
          const y = enemy.y + Math.sin(angle) * radius;
          if (canStand(x, y) && (!isNew || [...npcs, ...travelPoints].every(feature => distance(feature, { x, y }) >= 135))) { enemy.x = x; enemy.y = y; relocated = true; break; }
        }
      }
      enemy.homeX = enemy.x;
      enemy.homeY = enemy.y;
    }
  }

  function directionTo(entity) {
    const dx = entity.x - player.x;
    const dy = entity.y - player.y;
    if (Math.abs(dx) < 65 && Math.abs(dy) < 65) return 'nearby';
    const vertical = Math.abs(dy) > 45 ? (dy < 0 ? 'north' : 'south') : '';
    const horizontal = Math.abs(dx) > 45 ? (dx < 0 ? 'west' : 'east') : '';
    return [vertical, horizontal].filter(Boolean).join('-');
  }

  function mainDestination() {
    if (questComplete) return null;
    if (questReady()) return giver;
    const pending = targets.filter(target => !completed.has(target.id));
    if (pending.length) return pending.sort((a, b) => {
      if (theme === 'lynch') {
        const availableA = a.requiredPhase === 'both' || a.requiredPhase === worldPhase;
        const availableB = b.requiredPhase === 'both' || b.requiredPhase === worldPhase;
        if (availableA !== availableB) return availableA ? -1 : 1;
      }
      return distance(a, player) - distance(b, player);
    })[0];
    if (theme === 'shinobi' && !narrativeRoute && kills < killsNeeded) return npcs.find(npc => npc.name === 'Sora') || giver;
    return enemies.filter(enemy => !enemy.defeated).sort((a, b) => distance(a, player) - distance(b, player))[0] || giver;
  }
  function nextDestination() {
    if (isNew && trackedQuest !== 'main') {
      const destination = sideDestination(sideQuestRecords.find(record => record.data.id === trackedQuest));
      if (destination) return destination;
    }
    return mainDestination();
  }

  function nearestFeature() {
    return features.filter(feature => visibleFeature(feature) && distance(feature, player) < (feature.type === 'npc' ? 88 : 66))
      .sort((a, b) => distance(a, player) + (isNew && travelPoints.includes(a) ? 60 : 0) - distance(b, player) - (isNew && travelPoints.includes(b) ? 60 : 0))[0];
  }

  function getState() {
    const nearest = nearestFeature();
    const destination = nextDestination();
    const ready = questReady();
    let description = story.objective;
    if (questComplete) description = chosenEnding?.worldConsequence || 'Your first story is complete. Explore the world, meet its people, and improve your gear.';
    else if (ready) description = `Return to ${giver?.name || 'your guide'} to finish the story and claim your reward.`;
    else if (theme === 'shinobi' && completed.size >= targets.length) description = 'Resolve two rogue shinobi, or ask Elder Sora for the watchtower passphrase to negotiate safe passage.';
    const phaseHint = theme === 'lynch' && destination?.requiredPhase && destination.requiredPhase !== 'both' ? ` · ${destination.requiredPhase === 'dream' ? 'Dream' : 'Waking'} ${destination.requiredPhase !== worldPhase ? '(Q to cross)' : ''}` : '';
    const destinationHint = destination ? `${destination.name}${phaseHint} · ${directionTo(destination)} · ${Math.round(distance(player, destination) / 8)}m` : 'Free exploration';
    return {
      health: Math.ceil(player.health), maxHealth: player.maxHealth, level: player.level,
      xp: player.xp, xpNext: player.xpNext, coins, currency: story.currency,
      questTitle: questComplete ? `${story.title} · complete` : story.title,
      questDescription: description, questProgress: questProgress(), questTarget: targets.length + killsNeeded,
      questComplete, questReady: ready, location, x: player.x, y: player.y,
      facing: player.facing, theme, inventory: [...inventory], inventoryCount: inventory.length,
      kills, explored: visited.size, totalPlaces: features.length,
      interactHint: nearest ? `${nearest.type === 'npc' ? 'Talk to' : travelPoints.includes(nearest) ? 'Travel from' : nearest.type === 'chest' ? (nearest.opened ? 'Inspect' : 'Open') : 'Investigate'} ${nearest.name}` : '',
      destinationHint, destination: destination ? { x: destination.x, y: destination.y, name: destination.name } : null,
      objectives: targets.map(target => ({ name: target.name, completed: completed.has(target.id), x: target.x, y: target.y, phase: target.requiredPhase })),
      entities: [...features.filter(visibleFeature), ...enemies.filter(enemy => !enemy.defeated && (theme !== 'lynch' || worldPhase === 'dream'))].map(entity => ({ ...entity })),
      player: { ...player }, paused: paused(),
      ...(isNew ? {
        resource: { label: theme === 'shinobi' ? 'Chakra' : 'Composure', value: Math.ceil(resource), max: maxResource },
        abilities: abilityDefinitions.map(ability => ({ ...ability, cooldown: Math.ceil(abilityCooldowns[ability.id] * 10) / 10, ready: !paused() && abilityCooldowns[ability.id] <= 0 && resource >= ability.cost })),
        phase: theme === 'lynch' ? worldPhase : null, journal: journal.map(entry => ({ ...entry })),
        rank: theme === 'shinobi' ? (chosenEnding?.rank || (player.level >= 3 ? 'Genin · field ready' : story.rank || 'Genin · apprentice')) : story.rank || 'Visitor',
        narrativeRoute, ending: chosenEnding?.id || null,
        worldSize: { ...worldSize }, regionsVisited: [...regionsVisited],
        currentRegionName: regions.find(region => player.x >= region.x && player.y >= region.y && player.x < region.x + region.width && player.y < region.y + region.height)?.name || 'The connecting roads',
        dialogueFlags: [...dialogueFlags], rememberedReplies: Object.fromEntries(rememberedReplies),
        trackedQuest,
        trackedQuestTitle: trackedQuest === 'main' ? story.title : sideQuestRecords.find(record => record.data.id === trackedQuest)?.data.title || story.title,
        sideQuests: sideQuestRecords.filter(record => record.status !== 'available').map(record => ({
          id: record.data.id, title: record.data.title, giver: record.data.giver, status: record.status,
          progress: record.completed.size, target: record.data.steps.length,
          description: record.status === 'complete' ? record.data.completeText : record.status === 'ready' ? record.data.returnText : record.data.intro,
          destination: sideDestination(record) ? { x: sideDestination(record).x, y: sideDestination(record).y, name: sideDestination(record).name, phase: sideDestination(record).requiredPhase || 'both' } : null,
        })),
        travelPoints: travelPoints.map(point => ({ id: point.id, name: point.name, x: point.x, y: point.y, discovered: point.discovered })),
      } : {}),
    };
  }

  function emitState() { if (!destroyed) callbacks.onState?.(getState()); }

  function addXP(amount) {
    player.xp += amount;
    while (player.xp >= player.xpNext) {
      player.xp -= player.xpNext;
      player.level += 1;
      player.xpNext += 35;
      player.maxHealth += 15;
      player.health = player.maxHealth;
      if (isNew) { maxResource += 10; resource = maxResource; }
      effects.push({ kind: 'level', x: player.x, y: player.y, t: 1.2, maxT: 1.2 });
      toast(`Level ${player.level}! +15 health · stronger attacks`);
    }
  }

  function markObjective(feature) {
    if (targets.some(target => target.id === feature.id) && !completed.has(feature.id)) {
      completed.add(feature.id);
      addXP(18);
      if (questReady()) toast(`All objectives complete — return to ${giver?.name || 'your guide'}.`);
      else toast(`Quest updated: ${questProgress()}/${targets.length + killsNeeded}`);
    }
  }

  function openDialogue(speaker, text, choices) {
    clearMovement();
    dialogueOpen = true;
    const portrait = isNew ? npcs.find(npc => npc.name === speaker) : null;
    callbacks.onDialogue?.({
      speaker, text,
      ...(portrait ? { portrait: { kind: portrait.kind, name: portrait.name, phase: worldPhase } } : {}),
      choices: choices.map(choice => ({ label: choice.label, action: () => {
        if (destroyed) return;
        dialogueOpen = false;
        choice.action?.();
        emitState();
      } })),
    });
    // A standalone embed without a modal must still stay playable.
    if (!callbacks.onDialogue) dialogueOpen = false;
    emitState();
  }

  function healAtGuide() {
    player.health = player.maxHealth;
    if (isNew) resource = maxResource;
    toast(theme === 'shinobi' ? 'Rested at the village. Health and chakra restored.' : theme === 'lynch' ? 'A warm cup of coffee. Health and composure restored.' : theme === 'neon' ? 'Medical patch applied. Health restored.' : theme === 'odd' ? 'A very reassuring sandwich. Health restored.' : 'Rested and ready. Health restored.');
  }

  function finishNewStory(ending) {
    if (questComplete) return;
    chosenEnding = ending;
    questComplete = true;
    const reward = ending.reward ?? story.bounty;
    coins += reward;
    inventory.push(ending.item || story.rewardItem || 'A promise kept');
    if (theme === 'shinobi') {
      if (ending.id === 'truth') player.maxHealth += 20;
      else maxResource += 20;
    }
    if (ending.enemyDisposition) {
      for (const enemy of enemies) enemy.pacified = ending.enemyDisposition === 'peaceful';
    }
    if (theme === 'lynch' && ending.phase) worldPhase = ending.phase;
    addXP(75);
    player.health = player.maxHealth;
    resource = maxResource;
    journal.push({ title: `Your choice: ${ending.label}`, text: `${ending.text}\n\n${ending.worldConsequence || ''}`, phase: worldPhase });
    toast(`Story complete · +${reward} ${story.currency} · +75 XP`);
    openDialogue(giver?.name || 'The road ahead', `${ending.text}\n\n${ending.worldConsequence || ''}`, [{ label: 'Continue exploring', action: () => {} }]);
  }

  function showTopic(feature, topic) {
    if (!topicAvailable(topic)) return;
    if (topic.flag) dialogueFlags.add(topic.flag);
    grantClue(topic.clue, topic.text);
    const text = (questComplete && topic.completed) || (theme === 'lynch' && topic[worldPhase]) || topic.text;
    const backChoices = () => [{ label: 'Ask something else', action: () => talkNew(feature, true) }, { label: 'Back to the road', action: () => {} }];
    const choices = (topic.replies || []).filter(topicAvailable).map(reply => ({
      label: reply.label,
      action: () => {
        for (const alternative of topic.replies || []) if (alternative.flag && alternative.flag !== reply.flag) dialogueFlags.delete(alternative.flag);
        if (reply.flag) dialogueFlags.add(reply.flag);
        for (const item of Array.isArray(reply.item) ? reply.item : reply.item ? [reply.item] : []) if (!inventory.includes(item)) inventory.push(item);
        grantClue(reply.clue, reply.text);
        const key = `${feature.name}:${topic.label}`;
        rememberedReplies.set(key, reply.label);
        const journalKey = `reply:${key}:${reply.label}`;
        if (!recordedClues.has(journalKey)) {
          recordedClues.add(journalKey);
          journal.push({ title: `${feature.name} · ${reply.label}`, text: reply.text, phase: worldPhase });
        }
        const next = typeof reply.next === 'object' ? reply.next : typeof reply.next === 'number' ? feature.storyData?.topics?.[reply.next] : feature.storyData?.topics?.find(item => item.label === reply.next || item.id === reply.next);
        openDialogue(feature.name, reply.text || text, next && topicAvailable(next) ? [{ label: 'Go on', action: () => showTopic(feature, next) }, ...backChoices()] : backChoices());
      },
    }));
    openDialogue(feature.name, text, [...choices, ...backChoices()]);
  }

  function talkNew(feature, postponeEnding = false) {
    const sideResponses = markSideStep('talk', feature);
    const data = feature.storyData || {};
    const phaseText = theme === 'lynch' ? data[worldPhase] : null;
    const firstTalk = !talked.has(feature.id);
    const giverQuests = sideQuestRecords.filter(record => record.data.giver === feature.name);
    const readySide = giverQuests.find(record => record.status === 'ready');
    const finishedSide = giverQuests.find(record => record.status === 'complete');
    const followUp = (Array.isArray(data.followUp) ? data.followUp : data.followUp ? [data.followUp] : []).find(item => meetsRequirement(item.flag, dialogueFlags));
    const text = readySide?.data.returnText || finishedSide?.data.completeText || sideResponses[0] || (questComplete ? (data.endingText?.[chosenEnding?.id] || data.completed || followUp?.text || phaseText || data.intro || story.lore) : followUp?.text || (firstTalk ? data.intro || phaseText || story.lore : phaseText || data.intro || story.lore));
    talked.add(feature.id);
    if (!talked.has(`${feature.id}-${worldPhase}`)) {
      talked.add(`${feature.id}-${worldPhase}`);
      addJournal(`${feature.name} · ${theme === 'lynch' ? worldPhase : 'account'}`, text, `npc-${feature.id}-${theme === 'lynch' ? worldPhase : 'account'}`);
      grantClue(data.clue, text);
    }
    const sideChoices = giverQuests.flatMap(record => record.status === 'available' ? [{ label: record.data.offer || `Help with ${record.data.title}`, action: () => acceptSideQuest(record) }] : record.status === 'ready' ? [{ label: `Finish ${record.data.title} · +${record.data.reward || 0} ${story.currency}`, action: () => finishSideQuest(record) }] : record.status === 'active' ? [{ label: `Follow ${record.data.title}`, action: () => trackQuest(record.data.id) }] : []);
    const choices = [...sideChoices, ...(data.topics || []).filter(topicAvailable).map(topic => ({ label: topic.label, action: () => showTopic(feature, topic) }))];
    if (feature === giver && !questComplete && questReady() && !postponeEnding) {
      openDialogue(feature.name, story.resolution, [...(story.endings || []).map(ending => ({ label: `${ending.label} · +${ending.reward ?? story.bounty} ${story.currency}`, action: () => finishNewStory(ending) })), ...sideChoices, { label: 'Ask something else first', action: () => talkNew(feature, true) }]);
      return;
    }
    if (feature === giver) {
      if (!questComplete && questReady() && postponeEnding) choices.push({ label: 'Make the final choice', action: () => talkNew(feature) });
      choices.push({ label: 'Track the main investigation', action: () => trackQuest('main') });
      choices.push({ label: 'Where should I go next?', action: () => {
        const destination = nextDestination();
        const required = destination?.requiredPhase;
        openDialogue(feature.name, `${destination?.name || 'The open road'} is ${destination ? directionTo(destination) : 'nearby'}.${theme === 'lynch' && required && required !== 'both' ? ` You will find its clue in the ${required} world. Press Q to cross.` : ''}\n\n${story.advice}`, [{ label: 'Ready', action: healAtGuide }]);
      } });
      choices.push({ label: theme === 'lynch' ? 'Coffee and a quiet moment · restore health' : 'Rest and replenish chakra', action: healAtGuide });
      choices.push({ label: 'Travel to a familiar stop', action: openTravel });
    } else if (feature.role === 'merchant' || feature.name === 'Mako' || feature.name === 'Alma Vale') {
      choices.push({ label: `Buy ${theme === 'shinobi' ? 'a soldier ration' : 'a cup of coffee'} · 12 ${story.currency}`, action: () => {
        if (coins < 12) toast(`You need 12 ${story.currency}. Search a supply cache.`);
        else { coins -= 12; player.health = Math.min(player.maxHealth, player.health + 45); resource = Math.min(maxResource, resource + 45); toast('Restored 45 health and energy.'); }
      } });
    }
    choices.push({ label: 'Keep exploring', action: () => {} });
    openDialogue(feature.name, text, choices);
  }

  function handIn(pragmatic = false) {
    if (questComplete) return;
    questComplete = true;
    coins += story.bounty + (pragmatic ? 20 : 0);
    inventory.push(theme === 'moss' ? 'Root-song charm' : theme === 'neon' ? 'Freewave key' : theme === 'dust' ? 'Frontier compass' : 'Thursday’s thank-you note');
    addXP(75);
    player.health = player.maxHealth;
    toast(`Story complete! +${story.bounty + (pragmatic ? 20 : 0)} ${story.currency} · +75 XP`);
  }

  function talkTo(feature) {
    if (isNew) { talkNew(feature); return; }
    talked.add(feature.id);
    markObjective(feature);
    if (feature === giver) {
      if (!questComplete && questReady()) {
        openDialogue(feature.name, story.resolution, [
          { label: `${story.reward} · +${story.bounty} ${story.currency}`, action: () => handIn(false) },
          { label: theme === 'neon' ? 'Sell a copy to fund the neighbourhood · +100 credits' : theme === 'dust' ? 'Save a little for the next traveller · +90 scrip' : theme === 'odd' ? 'Tell the calendar a very small lie · +75 buttons' : 'Ask for supplies for the next journey · +85 crowns', action: () => handIn(true) },
        ]);
      } else if (questComplete) {
        openDialogue(feature.name, `${story.resolution}\n\nThere are still people to meet and places to discover. The road is yours.`, [
          { label: 'Rest here and restore health', action: healAtGuide },
          { label: 'Tell me more about this place', action: () => openDialogue(feature.name, story.lore, [{ label: 'Back to the road', action: () => {} }]) },
          { label: 'Keep exploring', action: () => {} },
        ]);
      } else {
        openDialogue(feature.name, story.intro, [
          { label: 'Point me toward the first stop', action: () => {
            const destination = nextDestination();
            openDialogue(feature.name, `${destination?.name || 'The old road'} is ${destination ? directionTo(destination) : 'nearby'}. Follow the gold diamond, or press M to open your world map.\n\n${story.advice}`, [{ label: 'I’m on my way', action: healAtGuide }]);
          } },
          { label: 'What is this place like?', action: () => openDialogue(feature.name, story.lore, [{ label: 'I’ll take a look around', action: () => {} }]) },
          { label: 'I need a moment to rest', action: healAtGuide },
          { label: 'Let me explore', action: () => {} },
        ]);
      }
      return;
    }
    const text = theme === 'odd'
      ? `${feature.name} pauses, then whispers: “On Thursday, the ${npcs.indexOf(feature) % 2 ? 'streetlights grew flowers and a cloud asked me for directions' : 'school bus drove into a painting. Everyone got home, but our shoes were blue'}.”\n\n${story.rumor}`
      : `${story.rumor}\n\n“People say ${landmarks[0]?.name || 'the far edge of town'} is worth the walk. I tend to agree.”`;
    openDialogue(feature.name, text, [
      { label: 'What keeps you here?', action: () => openDialogue(feature.name, theme === 'neon' ? '“My people. A city is more than its towers. You could erase every sign and we would still find each other.”' : theme === 'dust' ? '“Somebody has to keep a light on for the travellers. I remember when I needed one.”' : theme === 'odd' ? '“The rent is reasonable, and the moon waves to me. You do not get that everywhere.”' : '“The first tree I planted is taller than my house now. I want to see how much taller it gets.”', [{ label: 'Thanks for the story', action: () => {} }]) },
      { label: `Buy ${theme === 'neon' ? 'a med patch' : theme === 'odd' ? 'a reassuring sandwich' : 'a healing tonic'} · 12 ${story.currency}`, action: () => {
        if (coins < 12) toast(`You need 12 ${story.currency}. Try a supply cache.`);
        else if (player.health >= player.maxHealth) toast('Your health is already full.');
        else { coins -= 12; player.health = Math.min(player.maxHealth, player.health + 45); toast('+45 health'); }
      } },
      { label: 'See you around', action: () => {} },
    ]);
  }

  function interact() {
    if (destroyed || externallyPaused || dialogueOpen) return;
    const feature = nearestFeature();
    if (!feature) { toast('Walk closer to a person, landmark, or supply crate.'); return; }
    if (feature.type === 'npc') talkTo(feature);
    else if (isNew && travelPoints.includes(feature)) openTravel();
    else if (feature.type === 'chest') {
      if (!feature.opened) {
        feature.opened = true;
        const reward = 18 + features.indexOf(feature) % 11;
        coins += reward;
        const item = theme === 'shinobi' ? 'Chakra ration' : theme === 'lynch' ? 'An envelope addressed to tomorrow' : theme === 'dust' ? 'Pump salvage' : theme === 'neon' ? 'Circuit fragment' : theme === 'odd' ? 'Suspiciously ordinary pebble' : 'Wild herb';
        inventory.push(item);
        if (isNew) { resource = Math.min(maxResource, resource + 40); player.health = Math.min(player.maxHealth, player.health + 30); }
        addXP(12);
        markObjective(feature);
        effects.push({ kind: 'loot', x: feature.x, y: feature.y, t: 0.9, maxT: 0.9 });
        toast(`${item} found · +${reward} ${story.currency} · +12 XP${isNew ? ' · +30 health / +40 energy' : ''}`);
      } else toast('This cache has already been collected. There are more out on the road.');
    } else {
      if (isNew) {
        const data = feature.storyData || {};
        if (theme === 'lynch' && feature.requiredPhase !== 'both' && feature.requiredPhase !== worldPhase) {
          openDialogue(feature.name, data.wrongPhaseText || data[worldPhase] || `The clue is absent. This place has another life in the ${feature.requiredPhase} world. Press Q after closing this conversation to cross into it.`, [{ label: `Look in the ${feature.requiredPhase} world · Q`, action: () => {} }]);
          return;
        }
        const firstVisit = !feature.activated;
        markObjective(feature);
        const sideResponses = markSideStep('investigate', feature);
        feature.activated = true;
        const text = sideResponses[0] || (questComplete && data.completed) || data.text || data[worldPhase] || story.examine;
        if (firstVisit) {
          if (data.clue) grantClue(data.clue, text);
          else addJournal(feature.name, text, `landmark-${feature.id}`);
          inventory.push(data.item || (theme === 'lynch' ? `${feature.name} evidence` : `${feature.name} training seal`));
          if (theme === 'shinobi') { resource = maxResource; player.health = Math.min(player.maxHealth, player.health + 25); }
          effects.push({ kind: theme === 'shinobi' ? 'trial' : 'clue', x: feature.x, y: feature.y, t: 1.1, maxT: 1.1 });
        }
        openDialogue(feature.name, text, [{ label: questReady() ? 'Return to your guide for the final choice' : 'Record the discovery and continue', action: () => {} }, { label: 'Take a quiet moment · restore 20 health', action: () => { player.health = Math.min(player.maxHealth, player.health + 20); toast('+20 health'); } }]);
        emitState();
        return;
      }
      markObjective(feature);
      feature.activated = true;
      openDialogue(feature.name, story.examine, [
        { label: theme === 'neon' ? 'Disconnect and keep moving' : theme === 'odd' ? 'Wish Thursday a nice afternoon' : 'Follow the road onward', action: () => {} },
        { label: 'Take a quiet moment · restore 20 health', action: () => { player.health = Math.min(player.maxHealth, player.health + 20); toast('+20 health'); } },
      ]);
    }
    emitState();
  }

  function damageEnemy(enemy, amount, dx = 0, dy = 0) {
    if (enemy.defeated) return;
    enemy.health -= amount;
    enemy.hitFlash = 0.18;
    move(enemy, dx * 15, dy * 15);
    effects.push({ kind: 'damage', x: enemy.x, y: enemy.y - 20, value: amount, t: 0.6, maxT: 0.6 });
    if (enemy.health <= 0) {
      enemy.health = 0;
      enemy.defeated = true;
      kills += 1;
      coins += 8;
      addXP(22);
      if (!questComplete && kills <= killsNeeded) toast(`Threat cleared · +22 XP · ${questProgress()}/${targets.length + killsNeeded}`);
      else toast(isNew ? `Threat cleared · +22 XP · +8 ${story.currency}` : 'Threat cleared · +22 XP · +8 coins');
      if (!questComplete && questReady()) toast(`All objectives complete — return to ${giver?.name || 'your guide'}.`);
      emitState();
    }
  }

  function attack() {
    if (destroyed || paused() || cooldown > 0) return;
    if (theme === 'lynch') {
      if (resource < 10) { toast('Take a breath. Composure returns on its own.'); return; }
      resource -= 10;
      cooldown = 0.8;
      player.attacking = 0.22;
      effects.push({ kind: 'flash', x: player.x, y: player.y - 7, t: 0.38, maxT: 0.38 });
      for (const enemy of enemies) {
        const d = distance(enemy, player);
        if (worldPhase === 'dream' && d < 130 && !enemy.defeated) {
          enemy.stunned = 3.5;
          const nx = (enemy.x - player.x) / (d || 1);
          const ny = (enemy.y - player.y) / (d || 1);
          for (let step = 0; step < 16; step++) move(enemy, nx * 5, ny * 5);
          effects.push({ kind: 'static', x: enemy.x, y: enemy.y, t: 0.7, maxT: 0.7 });
        }
      }
      emitState();
      return;
    }
    if (theme === 'shinobi') {
      const facing = DIR[player.facing];
      cooldown = 0.32;
      player.attacking = 0.18;
      let dx = facing.x, dy = facing.y;
      const target = enemies.filter(enemy => !enemy.defeated && !enemy.pacified && distance(enemy, player) < 220).filter(enemy => {
        const d = distance(enemy, player) || 1;
        return ((enemy.x - player.x) * dx + (enemy.y - player.y) * dy) / d > 0.48;
      }).sort((a, b) => distance(a, player) - distance(b, player))[0];
      if (target) { const d = distance(target, player) || 1; dx = (target.x - player.x) / d; dy = (target.y - player.y) / d; }
      projectiles.push({ x: player.x + dx * 14, y: player.y - 7 + dy * 14, dx, dy, speed: 430, damage: 23 + (player.level - 1) * 6, t: 0.72, kind: 'kunai' });
      return;
    }
    const facing = DIR[player.facing];
    const damage = (story.weapon === 'shot' ? 38 : story.weapon === 'bolt' ? 26 : 29) + (player.level - 1) * 6;
    cooldown = story.weapon === 'shot' ? 0.52 : story.weapon === 'pulse' ? 0.5 : 0.33;
    player.attacking = 0.22;
    if (story.weapon === 'bolt' || story.weapon === 'shot') {
      let dx = facing.x;
      let dy = facing.y;
      const target = enemies.filter(enemy => !enemy.defeated && distance(enemy, player) < 225)
        .filter(enemy => {
          const d = distance(enemy, player);
          return d < 25 || ((enemy.x - player.x) * dx + (enemy.y - player.y) * dy) / d > 0.55;
        }).sort((a, b) => distance(a, player) - distance(b, player))[0];
      if (target) {
        const d = distance(target, player) || 1;
        dx = (target.x - player.x) / d;
        dy = (target.y - player.y) / d;
      }
      projectiles.push({ x: player.x + dx * 15, y: player.y - 7 + dy * 15, dx, dy, speed: story.weapon === 'shot' ? 470 : 350, damage, t: 0.7, kind: story.weapon });
    } else {
      effects.push({ kind: story.weapon, x: player.x, y: player.y - 6, facing: player.facing, t: 0.22, maxT: 0.22 });
      for (const enemy of enemies) {
        const d = distance(enemy, player);
        const dot = (enemy.x - player.x) * facing.x + (enemy.y - player.y) * facing.y;
        if (!enemy.defeated && d < (story.weapon === 'pulse' ? 72 : 65) && (story.weapon === 'pulse' || dot > -12)) {
          damageEnemy(enemy, damage, (enemy.x - player.x) / (d || 1), (enemy.y - player.y) / (d || 1));
        }
      }
    }
  }

  function useAbility(id) {
    if (destroyed || paused() || !isNew) return false;
    const ability = typeof id === 'number' ? abilityDefinitions[id] : abilityDefinitions.find(item => item.id === id || item.key === String(id));
    if (!ability) return false;
    if (abilityCooldowns[ability.id] > 0) { toast(`${ability.name} is recharging.`); return false; }
    if (resource < ability.cost) { toast(`Need ${ability.cost} ${theme === 'shinobi' ? 'chakra' : 'composure'}. It regenerates over time.`); return false; }
    resource -= ability.cost;
    abilityCooldowns[ability.id] = ability.duration;
    const facing = DIR[player.facing];
    if (ability.id === 'dreamshift') {
      worldPhase = worldPhase === 'waking' ? 'dream' : 'waking';
      clearMovement();
      invulnerable = 1.2;
      effects.push({ kind: 'dreamshift', x: player.x, y: player.y, t: 0.7, maxT: 0.7 });
      if (!recordedClues.has('first-crossing')) addJournal('The town has another face', 'The roads remain, but their accounts change. The telephone, mill and railway answer while awake; the stage, black pines and observatory answer in dreams.', 'first-crossing');
      toast(worldPhase === 'dream' ? 'Dream world · listen for the stage, black pines and observatory.' : 'Waking world · the telephone, mill and railway remember.');
    } else if (ability.id === 'ember') {
      player.attacking = 0.3;
      projectiles.push({ x: player.x + facing.x * 15, y: player.y - 7 + facing.y * 15, dx: facing.x, dy: facing.y, speed: 270, damage: 52 + (player.level - 1) * 8, t: 0.9, kind: 'ember' });
      effects.push({ kind: 'embercast', x: player.x, y: player.y - 7, facing: player.facing, t: 0.35, maxT: 0.35 });
      toast('Ember Release · fireball launched');
    } else if (ability.id === 'clone') {
      const position = { x: player.x + facing.x * 26, y: player.y + facing.y * 26 };
      if (!canStand(position.x, position.y)) { position.x = player.x; position.y = player.y; }
      clones.push({ ...position, id: `clone-${elapsed}`, health: 40, t: 8, facing: player.facing });
      effects.push({ kind: 'smoke', x: position.x, y: position.y, t: 0.65, maxT: 0.65 });
      effects.push({ kind: 'chakra', x: player.x, y: player.y, t: 0.7, maxT: 0.7 });
      effects.push({ kind: 'chakra', x: position.x, y: position.y, t: 0.65, maxT: 0.65 });
      toast('Shadow Clone · enemies follow your double');
    } else if (ability.id === 'substitution') {
      const oldPosition = { x: player.x, y: player.y };
      for (let step = 0; step < 27; step++) {
        move(player, facing.x * 5, facing.y * 5);
        if (step % 6 === 0 && distance(player, oldPosition) > 12) effects.push({ kind: 'afterimage', x: player.x, y: player.y, facing: player.facing, t: 0.3 + step * 0.014, maxT: 0.3 + step * 0.014 });
      }
      invulnerable = Math.max(invulnerable, 1.6);
      effects.push({ kind: 'substitution', ...oldPosition, t: 1.1, maxT: 1.1 });
      effects.push({ kind: 'smoke', ...oldPosition, t: 0.6, maxT: 0.6 });
      effects.push({ kind: 'smoke', x: player.x, y: player.y, t: 0.5, maxT: 0.5 });
      effects.push({ kind: 'chakra', x: player.x, y: player.y, t: 0.6, maxT: 0.6 });
      effects.push({ kind: 'dash', ...oldPosition, endX: player.x, endY: player.y, facing: player.facing, t: 0.45, maxT: 0.45 });
      toast('Substitution · escape with 1.6 seconds of protection');
    }
    emitState();
    return true;
  }

  function playerHurt(enemy) {
    if (invulnerable > 0) return;
    const amount = theme === 'dust' ? 14 : 10;
    player.health -= amount;
    invulnerable = 0.8;
    sinceHit = 0;
    const d = distance(player, enemy) || 1;
    move(player, (player.x - enemy.x) / d * 15, (player.y - enemy.y) / d * 15);
    effects.push({ kind: 'hurt', x: player.x, y: player.y - 24, value: amount, t: 0.6, maxT: 0.6 });
    if (player.health <= 0) {
      player.health = player.maxHealth;
      player.x = safeSpawn.x;
      player.y = safeSpawn.y;
      coins = Math.max(0, coins - 5);
      invulnerable = 3;
      clearMovement();
      toast('Back at the crossroads. Health restored · 5 coins lost.');
    }
    emitState();
  }

  function update(dt) {
    if (paused()) return;
    elapsed += dt;
    stateTime += dt;
    cooldown = Math.max(0, cooldown - dt);
    if (isNew) {
      resource = Math.min(maxResource, resource + dt * (theme === 'shinobi' ? 12 : 10));
      for (const id of Object.keys(abilityCooldowns)) abilityCooldowns[id] = Math.max(0, abilityCooldowns[id] - dt);
      for (let index = clones.length - 1; index >= 0; index--) {
        clones[index].t -= dt;
        if (clones[index].t <= 0 || clones[index].health <= 0) {
          effects.push({ kind: 'smoke', x: clones[index].x, y: clones[index].y, t: 0.5, maxT: 0.5 });
          clones.splice(index, 1);
        }
      }
    }
    invulnerable = Math.max(0, invulnerable - dt);
    player.attacking = Math.max(0, player.attacking - dt);
    sinceHit += dt;
    interactionPulse += dt;
    if (sinceHit > 5 && player.health < player.maxHealth) player.health = Math.min(player.maxHealth, player.health + dt * 2);
    if (introTimer > 0) {
      introTimer -= dt;
      if (introTimer <= 0) toast(theme === 'lynch' ? 'E conversations · Q dream shift · Space camera flash · M map / T travel' : theme === 'shinobi' ? 'E conversations · Space kunai · 1 fire / 2 clone / 3 substitution · M map / T travel' : `E to talk · Space to ${story.weapon === 'blade' ? 'swing your blade' : story.weapon === 'pulse' ? 'use your yo-yo' : 'fire'} · M for world map`);
    }
    let dx = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    let dy = (held.down ? 1 : 0) - (held.up ? 1 : 0);
    player.moving = dx !== 0 || dy !== 0;
    if (player.moving) {
      if (Math.abs(dx) > Math.abs(dy)) player.facing = dx > 0 ? 'right' : 'left';
      else player.facing = dy > 0 ? 'down' : 'up';
      const d = Math.hypot(dx, dy);
      dx /= d; dy /= d;
      const speed = held.sprint ? 175 : 112;
      move(player, dx * speed * dt, dy * speed * dt);
      if (theme === 'shinobi' && invulnerable > 0) {
        afterimageTime += dt;
        if (afterimageTime >= 0.07) {
          afterimageTime = 0;
          effects.push({ kind: 'afterimage', x: player.x - dx * 8, y: player.y - dy * 8, facing: player.facing, t: 0.24, maxT: 0.24 });
        }
      }
    }
    if (held.attack) attack();

    for (const feature of features) {
      if (!feature.discovered && visibleFeature(feature) && distance(feature, player) < 90) {
        feature.discovered = true;
        visited.add(feature.id);
        location = feature.name;
        if (elapsed > 3 && feature.type === 'landmark') {
          addXP(8);
          toast(`Discovered ${feature.name} · +8 XP`);
        }
        if (isNew && travelPoints.includes(feature)) {
          addXP(12);
          toast(`Travel route unlocked: ${feature.name} · +12 XP`);
        }
      }
    }
    if (isNew) {
      const region = regions.find(item => player.x >= item.x && player.y >= item.y && player.x < item.x + item.width && player.y < item.y + item.height);
      if (region && !regionsVisited.has(region.id)) {
        regionsVisited.add(region.id);
        if (regionsVisited.size > 1) { addXP(15); toast(`Discovered ${region.name} · +15 XP`); }
      }
    }
    const near = features.filter(f => visibleFeature(f) && distance(f, player) < 150).sort((a, b) => distance(a, player) - distance(b, player))[0];
    location = near?.name || (isNew ? regions.find(item => player.x >= item.x && player.y >= item.y && player.x < item.x + item.width && player.y < item.y + item.height)?.name || 'The connecting roads' : theme === 'moss' ? 'The wandering woods' : theme === 'neon' ? 'The lower streets' : theme === 'dust' ? 'The open frontier' : 'Somewhere after school');

    for (const enemy of enemies) {
      if (enemy.defeated || enemy.pacified || (theme === 'lynch' && worldPhase !== 'dream')) continue;
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      enemy.stunned = Math.max(0, enemy.stunned - dt);
      if (enemy.stunned > 0) continue;
      const decoy = clones.filter(clone => distance(enemy, clone) < 230).sort((a, b) => distance(a, enemy) - distance(b, enemy))[0];
      const targetEntity = decoy || player;
      const d = distance(enemy, targetEntity);
      if (d < 170 && invulnerable < 2) {
        if (d > 20) move(enemy, (targetEntity.x - enemy.x) / d * (theme === 'shinobi' ? 60 : 47) * dt, (targetEntity.y - enemy.y) / d * (theme === 'shinobi' ? 60 : 47) * dt);
        if (d < 26 && enemy.attackCooldown <= 0) {
          enemy.attackCooldown = 1;
          if (decoy) { decoy.health -= 14; effects.push({ kind: 'smoke', x: decoy.x, y: decoy.y, t: 0.25, maxT: 0.25 }); }
          else playerHurt(enemy);
        }
      } else {
        const tx = enemy.homeX + Math.sin(elapsed * 0.4 + enemy.phase) * 24;
        const ty = enemy.homeY + Math.cos(elapsed * 0.35 + enemy.phase) * 18;
        const wanderDistance = Math.hypot(tx - enemy.x, ty - enemy.y);
        if (wanderDistance > 3) move(enemy, (tx - enemy.x) / wanderDistance * 23 * dt, (ty - enemy.y) / wanderDistance * 23 * dt);
      }
    }

    for (let index = projectiles.length - 1; index >= 0; index--) {
      const projectile = projectiles[index];
      projectile.t -= dt;
      projectile.x += projectile.dx * projectile.speed * dt;
      projectile.y += projectile.dy * projectile.speed * dt;
      const target = enemies.find(enemy => !enemy.defeated && !enemy.pacified && Math.hypot(enemy.x - projectile.x, enemy.y - 7 - projectile.y) < (projectile.kind === 'ember' ? 25 : 17));
      const stopped = !canStand(projectile.x, projectile.y, 2);
      if (projectile.kind === 'ember') {
        if (target || projectile.t <= 0 || stopped) {
          for (const enemy of enemies) {
            const d = distance(enemy, projectile);
            if (!enemy.defeated && !enemy.pacified && d < 78) {
              damageEnemy(enemy, projectile.damage, (enemy.x - projectile.x) / (d || 1), (enemy.y - projectile.y) / (d || 1));
              enemy.stunned = 0.55;
            }
          }
          effects.push({ kind: 'emberblast', x: projectile.x, y: projectile.y, t: 0.55, maxT: 0.55 });
          projectiles.splice(index, 1);
        }
      } else {
        if (target) { damageEnemy(target, projectile.damage, projectile.dx, projectile.dy); projectile.t = 0; }
        if (projectile.t <= 0 || stopped) projectiles.splice(index, 1);
      }
    }
    for (let index = effects.length - 1; index >= 0; index--) {
      effects[index].t -= dt;
      if (effects[index].t <= 0) effects.splice(index, 1);
    }
    if (stateTime > 0.14) { stateTime = 0; emitState(); }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(240, Math.round(rect.width || 960));
    height = Math.max(240, Math.round(rect.height || 600));
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    scale = clamp(width / 560, 1.5, 2.4);
    context.imageSmoothingEnabled = false;
  }

  function draw() {
    const viewWidth = width / scale;
    const viewHeight = height / scale;
    camera.x = clamp(player.x - viewWidth / 2, 0, Math.max(0, worldSize.width - viewWidth));
    camera.y = clamp(player.y - viewHeight / 2, 0, Math.max(0, worldSize.height - viewHeight));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    drawWorld(context, theme, { x: camera.x, y: camera.y, width, height, scale, time: elapsed,
      phase: worldPhase,
      entities: [...features.filter(visibleFeature), ...enemies.filter(enemy => !enemy.defeated && (theme !== 'lynch' || worldPhase === 'dream'))],
      player: { ...player, invulnerable: invulnerable > 0, attacking: player.attacking > 0, sprinting: held.sprint },
    });
    const sx = value => (value - camera.x) * scale;
    const sy = value => (value - camera.y) * scale;
    // Jutsu art uses whole world pixels, the same grid as the character sprites.
    const pixelWorld = (wx, wy, pw, ph, color) => {
      context.fillStyle = color;
      context.fillRect(Math.round((Math.round(wx) - Math.round(camera.x)) * scale), Math.round((Math.round(wy) - Math.round(camera.y)) * scale), Math.max(1, Math.round(pw * scale)), Math.max(1, Math.round(ph * scale)));
    };
    function drawChakraAura(wx, wy, strength = 1) {
      context.save(); context.globalAlpha *= strength;
      const beat = Math.floor(elapsed * 12) % 3;
      for (const side of [-1, 1]) {
        pixelWorld(wx + side * 12 - 1, wy - 24 - beat, 2, 4, '#2997ed');
        pixelWorld(wx + side * 15 - 1, wy - 12 - beat, 2, 3, '#68d7ff');
        pixelWorld(wx + side * 12, wy - 31 - beat, 2, 4, '#b6f1ff');
        pixelWorld(wx + side * 9, wy - 37 - beat, 2, 2, '#68d7ff');
        pixelWorld(wx + side * 5, wy - 44 - beat, 1, 3, '#d8faff');
        pixelWorld(wx + side * 18, wy - 13 - beat * 3, 2, 3, '#b6f1ff');
      }
      pixelWorld(wx - 9, wy, 4, 1, '#68d7ff');
      pixelWorld(wx + 4, wy + 2, 3, 1, '#b6f1ff');
      context.restore();
    }
    function drawShinobiEcho(actor, alpha) {
      context.save(); context.globalAlpha *= alpha;
      context.translate(-Math.round(camera.x) * scale, -Math.round(camera.y) * scale);
      context.scale(scale, scale);
      drawCharacter(context, Math.round(actor.x), Math.round(actor.y), 'shinobi', { ...actor, type: 'player', time: elapsed, moving: actor.moving || false, sprinting: actor.sprinting || false });
      context.restore();
    }
    function smokePuff(wx, wy, size) {
      const radius = Math.max(5, Math.round(size));
      pixelWorld(wx - radius + 3, wy - radius, radius * 2 - 6, radius * 2, '#fffef5');
      pixelWorld(wx - radius, wy - radius + 3, radius * 2, radius * 2 - 6, '#fffef5');
      pixelWorld(wx + 1, wy + radius - 5, Math.max(2, radius - 2), 3, '#e4eef0');
      pixelWorld(wx - radius + 3, wy - radius + 4, radius + 1, 3, '#ffffff');
      pixelWorld(wx + 2, wy + radius - 3, Math.max(2, radius - 4), 2, '#dce9eb');
    }
    const destination = nextDestination();
    if (destination) {
      const x = sx(destination.x);
      const y = sy(destination.y - 35) + Math.sin(elapsed * 4) * 3;
      const margin = 35;
      context.save();
      context.fillStyle = GOLD;
      context.strokeStyle = '#332c36';
      context.lineWidth = 2;
      if (x > margin && x < width - margin && y > margin && y < height - margin) {
        if (isNew) {
          for (const [dx, dy, pw, ph] of [[-1, -6, 2, 12], [-3, -4, 6, 8], [-5, -2, 10, 4]]) context.fillRect(Math.round(x + dx), Math.round(y + dy), pw, ph);
        } else {
          context.beginPath(); context.moveTo(x, y - 7); context.lineTo(x + 6, y); context.lineTo(x, y + 7); context.lineTo(x - 6, y); context.closePath(); context.fill(); context.stroke();
        }
      } else {
        const px = sx(player.x);
        const py = sy(player.y);
        const angle = Math.atan2(y - py, x - px);
        const reachX = Math.abs((width / 2 - margin) / (Math.cos(angle) || 0.001));
        const reachY = Math.abs((height / 2 - margin) / (Math.sin(angle) || 0.001));
        const reach = Math.min(reachX, reachY);
        const arrowX = clamp(px + Math.cos(angle) * reach, margin, width - margin);
        const arrowY = clamp(py + Math.sin(angle) * reach, margin, height - margin);
        if (isNew) {
          const ax = Math.cos(angle), ay = Math.sin(angle);
          for (let along = -5; along <= 7; along += 2) context.fillRect(Math.round(arrowX + ax * along), Math.round(arrowY + ay * along), 2, 2);
          for (let spread = 1; spread <= 5; spread++) for (const side of [-1, 1]) context.fillRect(Math.round(arrowX + ax * (7 - spread) - ay * spread * side), Math.round(arrowY + ay * (7 - spread) + ax * spread * side), 2, 2);
        } else {
          context.translate(arrowX, arrowY);
          context.rotate(angle);
          context.beginPath(); context.moveTo(9, 0); context.lineTo(-5, -6); context.lineTo(-5, 6); context.closePath(); context.fill(); context.stroke();
        }
      }
      context.restore();
    }
    for (const enemy of enemies) {
      if (enemy.defeated || enemy.health >= enemy.maxHealth || (theme === 'lynch' && worldPhase !== 'dream')) continue;
      const x = sx(enemy.x);
      const y = sy(enemy.y - 24);
      if (isNew) {
        context.fillStyle = '#b7897a'; context.fillRect(Math.round(x - 16), Math.round(y), 32, 3);
        context.fillStyle = '#ef9f81'; context.fillRect(Math.round(x - 16), Math.round(y), Math.round(32 * enemy.health / enemy.maxHealth), 3);
        continue;
      }
      context.fillStyle = '#1c1928'; context.fillRect(x - 17, y, 34, 5);
      context.fillStyle = '#e97975'; context.fillRect(x - 16, y + 1, 32 * enemy.health / enemy.maxHealth, 3);
    }
    for (const projectile of projectiles) {
      const x = sx(projectile.x);
      const y = sy(projectile.y);
      if (projectile.kind === 'ember') {
        const beat = Math.floor(elapsed * 18) % 3;
        for (let index = 5; index >= 1; index--) {
          const tx = projectile.x - projectile.dx * index * 7;
          const ty = projectile.y - projectile.dy * index * 7;
          const spread = 2 + (index + beat) % 3;
          pixelWorld(tx - spread, ty - spread, spread * 2, spread * 2, index % 2 ? '#ef5427' : '#f99732');
          pixelWorld(tx - 1, ty - 1, 3, 3, '#ffd86a');
          if (index % 2) pixelWorld(tx + projectile.dy * 7, ty - projectile.dx * 7 - beat, 2, 3, '#ffbe4a');
        }
        pixelWorld(projectile.x - 8, projectile.y - 11, 16, 22, '#d94b20');
        pixelWorld(projectile.x - 11, projectile.y - 7, 22, 14, '#f77524');
        pixelWorld(projectile.x - 7, projectile.y - 8, 14, 16, '#ffad38');
        pixelWorld(projectile.x - 9, projectile.y - 4, 18, 8, '#ffbd42');
        pixelWorld(projectile.x - 4, projectile.y - 6, 8, 12, '#ffe979');
        pixelWorld(projectile.x - 6, projectile.y - 3, 12, 6, '#ffe979');
        pixelWorld(projectile.x - 2, projectile.y - 3, 4, 6, '#fff9c9');
        pixelWorld(projectile.x - 6 + beat * 4, projectile.y - 13, 3, 5, '#ffad38');
        pixelWorld(projectile.x + 6 - beat * 3, projectile.y + 9, 3, 5, '#fa7a27');
        continue;
      }
      if (projectile.kind === 'kunai') {
        for (let along = -8; along <= 8; along += 2) {
          const px = projectile.x + projectile.dx * along;
          const py = projectile.y + projectile.dy * along;
          pixelWorld(px - 1, py - 1, 2, 2, along < 0 ? '#596d7b' : '#e3eff5');
          if (along >= 0 && along <= 4) for (const side of [-1, 1]) pixelWorld(px - projectile.dy * side * 2 - 1, py + projectile.dx * side * 2 - 1, 2, 2, side < 0 ? '#e3eff5' : '#b6ccd4');
        }
        pixelWorld(projectile.x - projectile.dx * 8, projectile.y - projectile.dy * 8, 1, 1, '#b6ccd4');
        continue;
      }
      context.strokeStyle = projectile.kind === 'bolt' ? '#81ffea' : '#ffe4a0';
      context.lineWidth = projectile.kind === 'bolt' ? 4 : 3;
      context.beginPath(); context.moveTo(x, y); context.lineTo(x - projectile.dx * 12, y - projectile.dy * 12); context.stroke();
    }
    for (const clone of clones) {
      context.save(); context.globalAlpha = Math.min(0.95, clone.t * 0.8);
      drawChakraAura(clone.x, clone.y, 0.75);
      drawShinobiEcho(clone, 1);
      context.restore();
    }
    for (const effect of effects) {
      const x = sx(effect.x);
      const y = sy(effect.y);
      const progress = 1 - effect.t / effect.maxT;
      context.save();
      context.globalAlpha = clamp(effect.t / effect.maxT * 2, 0, 1);
      if (effect.kind === 'flash' || effect.kind === 'dreamshift') {
        context.fillStyle = effect.kind === 'flash' ? '#fff9d8' : '#7f4e99';
        context.globalAlpha = (1 - progress) * (effect.kind === 'flash' ? 0.22 : 0.36);
        context.fillRect(0, 0, width, height);
        context.globalAlpha = Math.max(0, 1 - progress);
        for (let index = 0; index < 16; index++) {
          const angle = index * Math.PI / 8;
          const reach = 14 + progress * (effect.kind === 'flash' ? 115 : 65);
          pixelWorld(effect.x + Math.cos(angle) * reach, effect.y + Math.sin(angle) * reach * 0.7, index % 2 ? 2 : 4, index % 2 ? 4 : 2, effect.kind === 'flash' ? '#fffce4' : '#e7c6db');
        }
      } else if (effect.kind === 'smoke') {
        for (let index = 0; index < 6; index++) {
          const angle = index * Math.PI / 3;
          const spread = 5 + progress * 16;
          smokePuff(effect.x + Math.cos(angle) * spread, effect.y - 17 + Math.sin(angle) * spread * 0.7 - progress * 9, 6 + (index % 2) * 2 + progress * 3);
        }
        if (progress < 0.55) smokePuff(effect.x, effect.y - 18 - progress * 9, 10 - progress * 5);
      } else if (effect.kind === 'chakra') {
        drawChakraAura(effect.x, effect.y, 1 - progress * 0.5);
        for (let index = 0; index < 10; index++) {
          const side = index % 2 ? -1 : 1;
          const px = effect.x + side * (8 + progress * (9 + index % 3 * 4));
          const py = effect.y - 5 - index * 3 - progress * 22;
          pixelWorld(px, py, index % 3 ? 2 : 3, index % 3 ? 4 : 2, index % 2 ? '#68d7ff' : '#e4fcff');
        }
      } else if (effect.kind === 'afterimage') {
        drawShinobiEcho({ ...effect, moving: true, sprinting: true }, (1 - progress) * 0.42);
        drawChakraAura(effect.x, effect.y, (1 - progress) * 0.24);
      } else if (effect.kind === 'dash') {
        const facing = DIR[effect.facing];
        const travel = Math.hypot(effect.endX - effect.x, effect.endY - effect.y);
        const length = Math.max(5, Math.min(24, Math.round(travel / 5)));
        for (let index = 0; index < 6; index++) {
          const along = travel * (0.15 + index * 0.12);
          const across = (index % 3 - 1) * 9;
          const px = effect.x + facing.x * along - facing.y * across;
          const py = effect.y - 18 + facing.y * along + facing.x * across;
          pixelWorld(px, py, facing.x ? length : 1, facing.y ? length : 1, index % 2 ? '#b6f1ff' : '#fffef5');
        }
      } else if (effect.kind === 'substitution') {
        pixelWorld(effect.x - 8, effect.y - 20, 16, 20, '#b68a59');
        pixelWorld(effect.x + 4, effect.y - 20, 4, 20, '#8f6d49');
        pixelWorld(effect.x - 8, effect.y - 21, 16, 5, '#e6c896');
        pixelWorld(effect.x - 3, effect.y - 18, 2, 16, '#8b6a45');
      } else if (effect.kind === 'emberblast' || effect.kind === 'embercast') {
        const impact = effect.kind === 'emberblast';
        const reach = impact ? 65 : 22;
        const core = Math.round(5 + Math.sin(progress * Math.PI) * (impact ? 10 : 4));
        pixelWorld(effect.x - core, effect.y - core + 3, core * 2, core * 2 - 6, '#ef6528');
        pixelWorld(effect.x - core + 3, effect.y - core, core * 2 - 6, core * 2, '#ffa738');
        pixelWorld(effect.x - core / 2, effect.y - core / 2, core, core, '#ffe677');
        if (progress < 0.4) pixelWorld(effect.x - 3, effect.y - 3, 6, 6, '#fff9d3');
        for (let index = 0; index < 12; index++) {
          const angle = index * Math.PI / 6;
          const spread = (8 + progress * reach) * (index % 2 ? 0.65 : 1);
          const px = effect.x + Math.cos(angle) * spread;
          const py = effect.y + Math.sin(angle) * spread * 0.7 - progress * 8;
          const flame = Math.max(2, Math.round((1 - progress) * 6));
          pixelWorld(px - 2, py - flame, 4, flame * 2, index % 2 ? '#ffab38' : '#e95e25');
          pixelWorld(px - 1, py - flame - 2, 2, Math.max(3, flame), '#ffe677');
          if (impact) {
            pixelWorld(px + Math.cos(angle) * 6, py + 8 + progress * 9, 3, 2, '#786347');
            pixelWorld(px + Math.cos(angle) * 6 - 1, py + 7 + progress * 9, 2, 1, '#d8ab6b');
          }
        }
      } else if (effect.kind === 'static') {
        for (let index = 0; index < 8; index++) pixelWorld(effect.x - 16 + Math.sin(elapsed * 35 + index) * 4, effect.y - index * 4, 8 + index % 3 * 6, 1, '#e8d6dc');
      } else if (effect.kind === 'trial' || effect.kind === 'clue') {
        for (let index = 0; index < 8; index++) {
          const angle = index * Math.PI / 4;
          pixelWorld(effect.x + Math.cos(angle) * (8 + progress * 30), effect.y - 12 + Math.sin(angle) * (5 + progress * 19) - progress * 18, 2, 3, effect.kind === 'trial' ? '#a9e4c7' : '#eac4d6');
        }
      } else if (effect.kind === 'blade') {
        const facing = DIR[effect.facing];
        const angle = Math.atan2(facing.y, facing.x);
        context.strokeStyle = '#faffc7'; context.lineWidth = 4 * scale;
        context.beginPath(); context.arc(x, y, (22 + progress * 13) * scale, angle - 1.1 + progress * 0.5, angle + 0.7 + progress * 0.5); context.stroke();
      } else if (effect.kind === 'pulse' || effect.kind === 'level') {
        if (isNew) {
          for (let index = 0; index < 8; index++) {
            const angle = index * Math.PI / 4;
            pixelWorld(effect.x + Math.cos(angle) * (10 + progress * 34), effect.y - 10 + Math.sin(angle) * (8 + progress * 26), 3, 3, GOLD);
          }
        } else {
          context.strokeStyle = effect.kind === 'level' ? GOLD : '#ffbbe3';
          context.lineWidth = 3;
          context.beginPath(); context.arc(x, y, (12 + progress * (effect.kind === 'level' ? 45 : 58)) * scale, 0, Math.PI * 2); context.stroke();
        }
      } else if (effect.kind === 'damage' || effect.kind === 'hurt') {
        context.fillStyle = effect.kind === 'hurt' ? '#ffaba6' : '#fff3c5';
        context.strokeStyle = '#262432'; context.lineWidth = 3;
        context.font = 'bold 14px monospace'; context.textAlign = 'center';
        if (!isNew) context.strokeText(`${effect.kind === 'hurt' ? '−' : ''}${effect.value}`, x, y - progress * 25);
        context.fillText(`${effect.kind === 'hurt' ? '−' : ''}${effect.value}`, x, y - progress * 25);
      } else {
        context.fillStyle = GOLD;
        for (let i = 0; i < 5; i++) context.fillRect(x + Math.cos(i * 1.26) * progress * 25, y + Math.sin(i * 1.26) * progress * 25 - progress * 10, 3, 3);
      }
      context.restore();
    }
    const nearby = nearestFeature();
    if (nearby && !paused()) {
      const x = sx(nearby.x);
      const y = sy(nearby.y - 35);
      context.fillStyle = '#20202bea'; context.fillRect(x - 9, y - 8, 18, 18);
      if (!isNew) { context.strokeStyle = '#ffffff80'; context.strokeRect(x - 9, y - 8, 18, 18); }
      context.fillStyle = '#fff6df'; context.font = 'bold 11px monospace'; context.textAlign = 'center'; context.fillText('E', x, y + 5);
    }
  }

  function tick(time) {
    if (destroyed) return;
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.045) : 0;
    lastTime = time;
    update(dt);
    draw();
    frameId = requestAnimationFrame(tick);
  }

  const keyDirection = key => ({ w: 'up', W: 'up', ArrowUp: 'up', s: 'down', S: 'down', ArrowDown: 'down', a: 'left', A: 'left', ArrowLeft: 'left', d: 'right', D: 'right', ArrowRight: 'right' }[key]);
  function isTyping(event) { return ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName) || event.target?.isContentEditable; }
  function onKeyDown(event) {
    if (destroyed || isTyping(event)) return;
    if (isNew && dialogueOpen && event.target?.closest?.('button') && ['Enter', ' ', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    if (paused() && event.target?.tagName === 'BUTTON' && ['Enter', ' '].includes(event.key)) return;
    const direction = keyDirection(event.key);
    const relevant = direction || [' ', 'Shift', 'e', 'E', 'Enter', 'm', 'M', 'Escape'].includes(event.key) || (isNew && ['t', 'T'].includes(event.key)) || (theme === 'lynch' && ['q', 'Q'].includes(event.key)) || (theme === 'shinobi' && ['1', '2', '3'].includes(event.key));
    if (!relevant) return;
    event.preventDefault();
    if (event.key === 'Escape' && dialogueOpen) { dismissDialogue(); callbacks.onDismissDialogue?.(); return; }
    if (paused()) return;
    if (direction) held[direction] = true;
    else if (event.key === 'Shift') held.sprint = true;
    else if (event.key === ' ') { held.attack = true; if (!event.repeat) attack(); }
    else if (!event.repeat && ['e', 'E', 'Enter'].includes(event.key)) interact();
    else if (!event.repeat && ['m', 'M'].includes(event.key)) { clearMovement(); callbacks.onMap?.(); }
    else if (!event.repeat && isNew && ['t', 'T'].includes(event.key)) openTravel();
    else if (!event.repeat && theme === 'lynch' && ['q', 'Q'].includes(event.key)) useAbility('dreamshift');
    else if (!event.repeat && theme === 'shinobi' && ['1', '2', '3'].includes(event.key)) useAbility(event.key);
  }
  function onKeyUp(event) {
    const direction = keyDirection(event.key);
    if (direction) held[direction] = false;
    if (event.key === 'Shift') held.sprint = false;
    if (event.key === ' ') held.attack = false;
  }
  function onVisibility() { if (document.hidden) clearMovement(); }
  function dismissDialogue() { dialogueOpen = false; clearMovement(); emitState(); }
  function togglePause(value) { externallyPaused = value === undefined ? !externallyPaused : Boolean(value); clearMovement(); emitState(); }
  function setMove(direction, pressed) {
    const aliases = { north: 'up', south: 'down', west: 'left', east: 'right', shift: 'sprint', space: 'attack' };
    direction = aliases[direction] || direction;
    if (direction in held && (!paused() || !pressed)) held[direction] = Boolean(pressed);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearMovement);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', resize);
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  observer?.observe(canvas);
  resize();
  emitState();
  frameId = requestAnimationFrame(tick);

  return {
    interact, attack, useAbility, trackQuest, openTravel, travelTo, setMove, getState, dismissDialogue, togglePause,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frameId);
      observer?.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearMovement);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', resize);
      clearMovement();
    },
  };
}
