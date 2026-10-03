import { WORLD_SIZE, drawWorld, getSpawn, getWorldFeatures, getObstacles } from './world-renderer.js';

// Each prototype shares controls, while its story, objectives and weapon differ.
const STORIES = {
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

const DIR = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const GOLD = '#f3ce72';

export function createGame(canvas, theme, callbacks = {}) {
  theme = STORIES[theme] ? theme : 'moss';
  const story = STORIES[theme];
  const context = canvas.getContext('2d');
  const spawn = getSpawn(theme);
  const features = getWorldFeatures(theme).map((feature, index) => ({ ...feature, id: `${theme}-${index}`, discovered: false, opened: false }));
  const obstacles = getObstacles(theme) || [];
  const npcs = features.filter(f => f.type === 'npc');
  const giver = [...npcs].sort((a, b) => distance(a, spawn) - distance(b, spawn))[0];
  const landmarks = features.filter(f => f.type === 'landmark').sort((a, b) => distance(b, spawn) - distance(a, spawn));
  const chests = features.filter(f => f.type === 'chest');
  const targets = theme === 'dust' ? chests.slice(0, 2)
    : theme === 'odd' ? [...npcs.filter(f => f !== giver).slice(0, 2), ...landmarks.slice(0, 1)]
      : landmarks.slice(0, 2);
  const killsNeeded = theme === 'odd' ? 0 : theme === 'dust' ? 1 : 2;
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
  const enemyPositions = [
    { x: 1160, y: 360 }, { x: 1260, y: 445 }, { x: 470, y: 865 },
    { x: 380, y: 955 }, { x: 1210, y: 870 }, { x: 1115, y: 935 },
    { x: 340, y: 350 }, { x: 1090, y: 220 },
  ];
  const enemies = enemyPositions.map((position, index) => ({
    ...position, homeX: position.x, homeY: position.y, type: 'enemy', name: story.enemy,
    id: `enemy-${index}`, kind: theme, health: theme === 'dust' ? 65 : 48, maxHealth: theme === 'dust' ? 65 : 48,
    phase: index * 1.57, attackCooldown: 0, hitFlash: 0, defeated: false,
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

  function toast(message) { callbacks.onToast?.(message); }
  function clearMovement() { Object.keys(held).forEach(key => { held[key] = false; }); }
  function paused() { return dialogueOpen || externallyPaused; }
  function questReady() { return completed.size >= targets.length && kills >= killsNeeded; }
  function questProgress() { return completed.size + Math.min(kills, killsNeeded); }

  function canStand(x, y, radius = 8) {
    if (x < 22 || y < 25 || x > WORLD_SIZE.width - 22 || y > WORLD_SIZE.height - 22) return false;
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
    if (!canStand(enemy.x, enemy.y)) {
      let relocated = false;
      for (let radius = 24; radius <= 192 && !relocated; radius += 24) {
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
          const x = enemy.x + Math.cos(angle) * radius;
          const y = enemy.y + Math.sin(angle) * radius;
          if (canStand(x, y)) { enemy.x = x; enemy.y = y; relocated = true; break; }
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

  function nextDestination() {
    if (questComplete) return null;
    if (questReady()) return giver;
    const pending = targets.filter(target => !completed.has(target.id));
    if (pending.length) return pending.sort((a, b) => distance(a, player) - distance(b, player))[0];
    return enemies.filter(enemy => !enemy.defeated).sort((a, b) => distance(a, player) - distance(b, player))[0] || giver;
  }

  function nearestFeature() {
    return features.filter(feature => distance(feature, player) < (feature.type === 'npc' ? 88 : 66))
      .sort((a, b) => distance(a, player) - distance(b, player))[0];
  }

  function getState() {
    const nearest = nearestFeature();
    const destination = nextDestination();
    const ready = questReady();
    let description = story.objective;
    if (questComplete) description = 'Your first story is complete. Explore the world, meet its people, and improve your gear.';
    else if (ready) description = `Return to ${giver?.name || 'your guide'} to finish the story and claim your reward.`;
    const destinationHint = destination ? `${destination.name} · ${directionTo(destination)} · ${Math.round(distance(player, destination) / 8)}m` : 'Free exploration';
    return {
      health: Math.ceil(player.health), maxHealth: player.maxHealth, level: player.level,
      xp: player.xp, xpNext: player.xpNext, coins, currency: story.currency,
      questTitle: questComplete ? `${story.title} · complete` : story.title,
      questDescription: description, questProgress: questProgress(), questTarget: targets.length + killsNeeded,
      questComplete, questReady: ready, location, x: player.x, y: player.y,
      facing: player.facing, theme, inventory: [...inventory], inventoryCount: inventory.length,
      kills, explored: visited.size, totalPlaces: features.length,
      interactHint: nearest ? `${nearest.type === 'npc' ? 'Talk to' : nearest.type === 'chest' ? (nearest.opened ? 'Inspect' : 'Open') : 'Investigate'} ${nearest.name}` : '',
      destinationHint, destination: destination ? { x: destination.x, y: destination.y, name: destination.name } : null,
      objectives: targets.map(target => ({ name: target.name, completed: completed.has(target.id), x: target.x, y: target.y })),
      entities: [...features, ...enemies.filter(enemy => !enemy.defeated)].map(entity => ({ ...entity })),
      player: { ...player }, paused: paused(),
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
    callbacks.onDialogue?.({
      speaker, text,
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
    toast(theme === 'neon' ? 'Medical patch applied. Health restored.' : theme === 'odd' ? 'A very reassuring sandwich. Health restored.' : 'Rested and ready. Health restored.');
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
    else if (feature.type === 'chest') {
      if (!feature.opened) {
        feature.opened = true;
        const reward = 18 + features.indexOf(feature) % 11;
        coins += reward;
        const item = theme === 'dust' ? 'Pump salvage' : theme === 'neon' ? 'Circuit fragment' : theme === 'odd' ? 'Suspiciously ordinary pebble' : 'Wild herb';
        inventory.push(item);
        addXP(12);
        markObjective(feature);
        effects.push({ kind: 'loot', x: feature.x, y: feature.y, t: 0.9, maxT: 0.9 });
        toast(`${item} found · +${reward} ${story.currency} · +12 XP`);
      } else toast('This cache has already been collected. There are more out on the road.');
    } else {
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
      else toast('Threat cleared · +22 XP · +8 coins');
      if (!questComplete && questReady()) toast(`All objectives complete — return to ${giver?.name || 'your guide'}.`);
      emitState();
    }
  }

  function attack() {
    if (destroyed || paused() || cooldown > 0) return;
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
    invulnerable = Math.max(0, invulnerable - dt);
    player.attacking = Math.max(0, player.attacking - dt);
    sinceHit += dt;
    interactionPulse += dt;
    if (sinceHit > 5 && player.health < player.maxHealth) player.health = Math.min(player.maxHealth, player.health + dt * 2);
    if (introTimer > 0) {
      introTimer -= dt;
      if (introTimer <= 0) toast(`E to talk · Space to ${story.weapon === 'blade' ? 'swing your blade' : story.weapon === 'pulse' ? 'use your yo-yo' : 'fire'} · M for world map`);
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
    }
    if (held.attack) attack();

    for (const feature of features) {
      if (!feature.discovered && distance(feature, player) < 90) {
        feature.discovered = true;
        visited.add(feature.id);
        location = feature.name;
        if (elapsed > 3 && feature.type === 'landmark') {
          addXP(8);
          toast(`Discovered ${feature.name} · +8 XP`);
        }
      }
    }
    const near = features.filter(f => distance(f, player) < 150).sort((a, b) => distance(a, player) - distance(b, player))[0];
    location = near?.name || (theme === 'moss' ? 'The wandering woods' : theme === 'neon' ? 'The lower streets' : theme === 'dust' ? 'The open frontier' : 'Somewhere after school');

    for (const enemy of enemies) {
      if (enemy.defeated) continue;
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      const d = distance(enemy, player);
      if (d < 170 && invulnerable < 2) {
        if (d > 20) move(enemy, (player.x - enemy.x) / d * 47 * dt, (player.y - enemy.y) / d * 47 * dt);
        if (d < 26 && enemy.attackCooldown <= 0) { enemy.attackCooldown = 1; playerHurt(enemy); }
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
      const target = enemies.find(enemy => !enemy.defeated && Math.hypot(enemy.x - projectile.x, enemy.y - 7 - projectile.y) < 17);
      if (target) { damageEnemy(target, projectile.damage, projectile.dx, projectile.dy); projectile.t = 0; }
      if (projectile.t <= 0 || !canStand(projectile.x, projectile.y, 2)) projectiles.splice(index, 1);
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
    camera.x = clamp(player.x - viewWidth / 2, 0, Math.max(0, WORLD_SIZE.width - viewWidth));
    camera.y = clamp(player.y - viewHeight / 2, 0, Math.max(0, WORLD_SIZE.height - viewHeight));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    drawWorld(context, theme, { x: camera.x, y: camera.y, width, height, scale, time: elapsed,
      entities: [...features, ...enemies.filter(enemy => !enemy.defeated)],
      player: { ...player, invulnerable: invulnerable > 0, attacking: player.attacking > 0, sprinting: held.sprint },
    });
    const sx = value => (value - camera.x) * scale;
    const sy = value => (value - camera.y) * scale;
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
        context.beginPath(); context.moveTo(x, y - 7); context.lineTo(x + 6, y); context.lineTo(x, y + 7); context.lineTo(x - 6, y); context.closePath(); context.fill(); context.stroke();
      } else {
        const px = sx(player.x);
        const py = sy(player.y);
        const angle = Math.atan2(y - py, x - px);
        const reachX = Math.abs((width / 2 - margin) / (Math.cos(angle) || 0.001));
        const reachY = Math.abs((height / 2 - margin) / (Math.sin(angle) || 0.001));
        const reach = Math.min(reachX, reachY);
        context.translate(clamp(px + Math.cos(angle) * reach, margin, width - margin), clamp(py + Math.sin(angle) * reach, margin, height - margin));
        context.rotate(angle);
        context.beginPath(); context.moveTo(9, 0); context.lineTo(-5, -6); context.lineTo(-5, 6); context.closePath(); context.fill(); context.stroke();
      }
      context.restore();
    }
    for (const enemy of enemies) {
      if (enemy.defeated || enemy.health >= enemy.maxHealth) continue;
      const x = sx(enemy.x);
      const y = sy(enemy.y - 24);
      context.fillStyle = '#1c1928'; context.fillRect(x - 17, y, 34, 5);
      context.fillStyle = '#e97975'; context.fillRect(x - 16, y + 1, 32 * enemy.health / enemy.maxHealth, 3);
    }
    for (const projectile of projectiles) {
      const x = sx(projectile.x);
      const y = sy(projectile.y);
      context.strokeStyle = projectile.kind === 'bolt' ? '#81ffea' : '#ffe4a0';
      context.lineWidth = projectile.kind === 'bolt' ? 4 : 3;
      context.beginPath(); context.moveTo(x, y); context.lineTo(x - projectile.dx * 12, y - projectile.dy * 12); context.stroke();
    }
    for (const effect of effects) {
      const x = sx(effect.x);
      const y = sy(effect.y);
      const progress = 1 - effect.t / effect.maxT;
      context.save();
      context.globalAlpha = clamp(effect.t / effect.maxT * 2, 0, 1);
      if (effect.kind === 'blade') {
        const facing = DIR[effect.facing];
        const angle = Math.atan2(facing.y, facing.x);
        context.strokeStyle = '#faffc7'; context.lineWidth = 4 * scale;
        context.beginPath(); context.arc(x, y, (22 + progress * 13) * scale, angle - 1.1 + progress * 0.5, angle + 0.7 + progress * 0.5); context.stroke();
      } else if (effect.kind === 'pulse' || effect.kind === 'level') {
        context.strokeStyle = effect.kind === 'level' ? GOLD : '#ffbbe3';
        context.lineWidth = 3;
        context.beginPath(); context.arc(x, y, (12 + progress * (effect.kind === 'level' ? 45 : 58)) * scale, 0, Math.PI * 2); context.stroke();
      } else if (effect.kind === 'damage' || effect.kind === 'hurt') {
        context.fillStyle = effect.kind === 'hurt' ? '#ffaba6' : '#fff3c5';
        context.strokeStyle = '#262432'; context.lineWidth = 3;
        context.font = 'bold 14px monospace'; context.textAlign = 'center';
        context.strokeText(`${effect.kind === 'hurt' ? '−' : ''}${effect.value}`, x, y - progress * 25);
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
      context.strokeStyle = '#ffffff80'; context.strokeRect(x - 9, y - 8, 18, 18);
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
    if (paused() && event.target?.tagName === 'BUTTON' && ['Enter', ' '].includes(event.key)) return;
    const direction = keyDirection(event.key);
    const relevant = direction || [' ', 'Shift', 'e', 'E', 'Enter', 'm', 'M', 'Escape'].includes(event.key);
    if (!relevant) return;
    event.preventDefault();
    if (event.key === 'Escape' && dialogueOpen) { dismissDialogue(); callbacks.onDismissDialogue?.(); return; }
    if (paused()) return;
    if (direction) held[direction] = true;
    else if (event.key === 'Shift') held.sprint = true;
    else if (event.key === ' ') { held.attack = true; if (!event.repeat) attack(); }
    else if (!event.repeat && ['e', 'E', 'Enter'].includes(event.key)) interact();
    else if (!event.repeat && ['m', 'M'].includes(event.key)) { clearMovement(); callbacks.onMap?.(); }
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
    interact, attack, setMove, getState, dismissDialogue, togglePause,
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
