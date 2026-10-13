import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { loadInvestigationData, verifyBoard } from './validate-investigations.mjs';

const root = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(root, 'src/data/campaign.ts'), 'utf8');
const campaignTree = ts.createSourceFile('campaign.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const declaredSceneIds = new Set();
function findSceneDeclarations(node) {
  if (ts.isCallExpression(node) && node.expression.getText(campaignTree) === 'scene' && ts.isStringLiteral(node.arguments[0])) {
    const id = node.arguments[0].text;
    assert(!declaredSceneIds.has(id), `Duplicate scene declaration ${id}`);
    declaredSceneIds.add(id);
  }
  ts.forEachChild(node, findSceneDeclarations);
}
findSceneDeclarations(campaignTree);
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { ACTS, ITEMS, LOCATIONS, QUESTS, SCENES } = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`
);
const gameSource = await readFile(resolve(root, 'src/data/game.ts'), 'utf8');
const gameModule = ts.transpileModule(gameSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { freshGame, matchesRequirement } = await import(
  `data:text/javascript;base64,${Buffer.from(gameModule).toString('base64')}`
);
const investigationData = await loadInvestigationData();
const { INVESTIGATIONS, requiredInvestigation, caseFlag, caseIsComplete } = investigationData;
assert.equal(INVESTIGATIONS.length, 6, 'Campaign requires six mandatory investigations');
for (const investigation of INVESTIGATIONS) {
  assert.equal(investigation.challenges.length, 6, `${investigation.id}: six investigation stages are required`);
  for (const challenge of investigation.challenges) verifyBoard(challenge, investigationData);
}
const puzzleSource = await readFile(resolve(root, 'src/components/PuzzleModal.tsx'), 'utf8');
const puzzleTree = ts.createSourceFile('PuzzleModal.tsx', puzzleSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let puzzleIds;
function findPuzzles(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(puzzleTree) === 'puzzleDefinitions') {
    assert(ts.isObjectLiteralExpression(node.initializer));
    puzzleIds = node.initializer.properties.map(property => property.name.getText(puzzleTree).replace(/^['"]|['"]$/g, ''));
  }
  ts.forEachChild(node, findPuzzles);
}
findPuzzles(puzzleTree);
assert.equal(puzzleIds.length, 16, 'Expected the sixteen implemented puzzles');
assert.equal(ACTS.length, 6, 'Expected six acts');
const scenes = Object.entries(SCENES);
assert.equal(scenes.length, declaredSceneIds.size, 'Scene export silently lost a scene');
const locations = new Map(LOCATIONS.map(location => [location.id, location]));
assert.equal(locations.size, LOCATIONS.length, 'Duplicate location IDs');
assert(SCENES.gate_arrival, 'The starting scene is missing');
const flags = new Set(['hospital_debt']);
const usedPuzzles = new Set();
const endings = new Set();
const acts = new Set([1]);
let choiceCount = 0;
for (const [id, scene] of scenes) {
  assert.equal(scene.id, id, `Scene key ${id} disagrees with its id`);
  assert(locations.has(scene.location), `${id}: unknown location ${scene.location}`);
  assert(scene.speaker && scene.text.length, `${id}: missing dialogue`);
  assert(Array.isArray(scene.choices), `${id}: missing choices`);
  for (const choice of scene.choices) {
    choiceCount++;
    assert(choice.label, `${id}: empty choice`);
    if (choice.next) assert(SCENES[choice.next], `${id}: missing scene ${choice.next}`);
    if (choice.item) assert(ITEMS[choice.item], `${id}: unknown required item ${choice.item}`);
    if (choice.puzzle) {
      assert(puzzleIds.includes(choice.puzzle), `${id}: unknown puzzle ${choice.puzzle}`);
      usedPuzzles.add(choice.puzzle);
    }
    if (choice.ending) endings.add(choice.ending);
    for (const effect of choice.effects || []) {
      if (effect.addItem) assert(ITEMS[effect.addItem], `${id}: unknown awarded item ${effect.addItem}`);
      if (effect.removeItem) assert(ITEMS[effect.removeItem], `${id}: unknown consumed item ${effect.removeItem}`);
      if (effect.unlock) assert(locations.has(effect.unlock), `${id}: unknown unlocked location ${effect.unlock}`);
      if (effect.flag) flags.add(effect.flag);
      if (effect.act) {
        assert(Number.isInteger(effect.act) && effect.act >= 1 && effect.act <= 6, `${id}: invalid act ${effect.act}`);
        acts.add(effect.act);
      }
      if (effect.time !== undefined) assert(Number.isFinite(effect.time), `${id}: invalid time reward`);
    }
  }
}
for (const location of LOCATIONS) {
  assert(SCENES[location.scene], `${location.id}: missing travel hub ${location.scene}`);
  assert.equal(SCENES[location.scene].location, location.id, `${location.id}: travel hub is in a different location`);
}
for (const [id, scene] of scenes) {
  for (const choice of scene.choices) {
    if (choice.requires) assert(flags.has(choice.requires.replace(/^!/, '')), `${id}: requirement ${choice.requires} can never be set`);
  }
}
assert.deepEqual([...usedPuzzles].sort(), [...puzzleIds].sort(), 'Campaign must use all sixteen puzzle IDs');
assert.deepEqual([...acts].sort(), [1, 2, 3, 4, 5, 6], 'Campaign must unlock every act');
assert.equal(endings.size, 3, 'Expected three distinct endings');
const questFlags = new Set();
for (const quest of QUESTS) {
  assert(quest.act >= 1 && quest.act <= 6, `Invalid quest act ${quest.act}`);
  for (const step of quest.steps) {
    assert(flags.has(step.flag), `Quest step ${step.flag} can never be set`);
    questFlags.add(step.flag);
  }
}

// These transitions mirror App.tsx. Time cannot block a campaign path: the
// recovery dialog restores twenty minutes whenever a player's clock empties.
function available(state, choice) {
  return matchesRequirement(choice.requires, state.flags) && (!choice.item || state.items.includes(choice.item));
}
function transition(state, choice) {
  const next = { ...state, flags: [...state.flags], items: [...state.items], unlocked: [...state.unlocked], solved: [...state.solved] };
  for (const effect of choice.effects || []) {
    if (effect.time) next.time = Math.max(0, next.time + effect.time * 60);
    if (effect.addItem && !next.items.includes(effect.addItem)) next.items.push(effect.addItem);
    if (effect.removeItem) next.items = next.items.filter(item => item !== effect.removeItem);
    if (effect.flag && !next.flags.includes(effect.flag)) next.flags.push(effect.flag);
    if (effect.unlock && !next.unlocked.includes(effect.unlock)) next.unlocked.push(effect.unlock);
    if (effect.act) next.act = Math.max(next.act, effect.act);
  }
  if (choice.puzzle && !next.solved.includes(choice.puzzle)) next.solved.push(choice.puzzle);
  if (choice.next) {
    next.scene = choice.next;
    next.location = SCENES[choice.next].location;
    if (!next.unlocked.includes(next.location)) next.unlocked.push(next.location);
  }
  if (choice.ending) next.ending = choice.ending;
  if (next.time <= 0 && !next.ending) {
    next.time = 20 * 60;
    if (!next.flags.includes('hospital_debt')) next.flags.push('hospital_debt');
  }
  return next;
}
function finishedCases(state) {
  return INVESTIGATIONS.filter(investigation => caseIsComplete(investigation, state.investigations?.[investigation.id])).map(investigation => investigation.id);
}
function completeInvestigation(state, id) {
  const investigation = INVESTIGATIONS.find(investigation => investigation.id === id);
  assert(investigation, `Unknown investigation ${id}`);
  const challenges = Object.fromEntries(investigation.challenges.map(challenge => [challenge.id, { ...verifyBoard(challenge, investigationData), solved: true }]));
  const progress = { stage: 6, started: true, finished: true, challenges };
  assert(caseIsComplete(investigation, progress), `${id}: solved boards do not complete the investigation`);
  return {
    ...state,
    flags: [...new Set([...state.flags, caseFlag(id)])],
    investigations: { ...state.investigations, [id]: progress },
  };
}
function prepareInvestigations(state, nextScene) {
  let updated = state;
  const markers = [];
  for (let remaining = 0; remaining <= INVESTIGATIONS.length; remaining++) {
    const needed = requiredInvestigation(nextScene, finishedCases(updated));
    if (!needed) return { state: updated, markers };
    markers.push({ from: updated.scene, investigation: needed, next: updated.scene });
    updated = completeInvestigation(updated, needed);
  }
  assert.fail(`Investigation gate for ${nextScene} failed to resolve`);
}
function guardedTransition(state, choice) {
  const prepared = prepareInvestigations(state, choice.next);
  return { state: transition(prepared.state, choice), markers: prepared.markers };
}
function logicalKey(state, includeScene = true) {
  return [includeScene ? state.scene : '', state.act, state.ending || '', [...state.flags].sort().join(','), [...state.items].sort().join(','), [...state.unlocked].sort().join(','), [...state.solved].sort().join(',')].join('|');
}
function stepRecord(state, choice, index) {
  return { from: state.scene, choice: index, label: choice.label, puzzle: choice.puzzle || null, next: choice.next || state.scene };
}

// Condense travel and dialogue that cannot change inventory, flags or puzzle
// status into a BFS closure. Search then branches only on meaningful actions.
// The closure retains exact playable paths, including location travel rules.
function closure(base) {
  const reached = new Map([[base.scene, { state: base, path: [] }]]);
  const queue = [reached.get(base.scene)];
  const branches = [];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const node = queue[cursor];
    const { state, path } = node;
    reachedScenes.add(state.scene);
    for (const [index, choice] of SCENES[state.scene].choices.entries()) {
      if (!available(state, choice)) continue;
      const guarded = guardedTransition(state, choice);
      const next = guarded.state;
      const nextPath = [...path, ...guarded.markers, stepRecord(state, choice, index)];
      if (logicalKey(next, false) !== logicalKey(base, false)) {
        branches.push({ state: next, path: nextPath });
      } else if (!reached.has(next.scene)) {
        const child = { state: next, path: nextPath };
        reached.set(next.scene, child);
        queue.push(child);
      }
    }
    for (const id of state.unlocked) {
      if (id === SCENES[state.scene].location) continue;
      const destination = locations.get(id);
      if (!destination || reached.has(destination.scene)) continue;
      const prepared = prepareInvestigations(state, destination.scene);
      const child = {
        state: { ...prepared.state, scene: destination.scene, location: id },
        path: [...path, ...prepared.markers, { from: state.scene, travel: id, next: destination.scene }],
      };
      if (logicalKey(child.state, false) !== logicalKey(base, false)) { branches.push(child); continue; }
      reached.set(child.state.scene, child);
      queue.push(child);
    }
  }
  return { reached, branches };
}

const reachedScenes = new Set();
const reachedFlags = new Set();
const reachedPuzzles = new Set();
const endingRoutes = new Map();
const flagRoutes = new Map();
const visitedStates = new Set();
const positiveRewardCycles = new Map();
let checkedStates = 0;
const stateLimit = Number(process.env.CAMPAIGN_STATE_LIMIT || 200000);
let capped = false;

function rewardCycles(reached) {
  // A positive, unchanged-state edge that can return to its source is a
  // repeatable reward. Replaying an already solved puzzle is modeled too.
  const neutralEdges = new Map();
  for (const [id, node] of reached) {
    const edges = [];
    for (const [index, choice] of SCENES[id].choices.entries()) {
      if (!available(node.state, choice)) continue;
      const next = guardedTransition(node.state, choice).state;
      if (logicalKey(next, false) === logicalKey(node.state, false)) {
        edges.push({ next: next.scene, time: (choice.effects || []).reduce((sum, effect) => sum + (effect.time || 0), 0), index });
      }
    }
    for (const location of node.state.unlocked) {
      const destination = locations.get(location);
      if (destination && location !== SCENES[id].location && !requiredInvestigation(destination.scene, finishedCases(node.state))) edges.push({ next: destination.scene, time: 0 });
    }
    neutralEdges.set(id, edges);
  }
  for (const [id, edges] of neutralEdges) {
    for (const edge of edges) {
      if (edge.time <= 0) continue;
      // Bellman-Ford finds whether the return path can preserve a net reward.
      const distances = new Map([[edge.next, 0]]);
      for (let iteration = 0; iteration < reached.size; iteration++) {
        let changed = false;
        for (const [from, onward] of neutralEdges) {
          if (!distances.has(from)) continue;
          for (const move of onward) {
            const reward = distances.get(from) + move.time;
            if (!distances.has(move.next) || reward > distances.get(move.next)) {
              distances.set(move.next, reward); changed = true;
            }
          }
        }
        if (!changed) break;
      }
      if (distances.has(id) && distances.get(id) + edge.time > 0) positiveRewardCycles.set(`${id}:${edge.index}`, `${id}, choice ${edge.index + 1}: ${SCENES[id].choices[edge.index].label}`);
    }
  }
}
function score(node, base) {
  const next = node.state;
  const newFlags = next.flags.filter(flag => !base.flags.includes(flag));
  return (next.ending ? -10000 : 0)
    + newFlags.reduce((sum, flag) => sum + (questFlags.has(flag) ? 12 : 7), 0)
    + next.solved.filter(id => !base.solved.includes(id)).length * 15
    + next.unlocked.filter(id => !base.unlocked.includes(id)).length * 10
    + next.items.filter(id => !base.items.includes(id)).length * 8
    + (next.act - base.act) * 2
    - base.items.filter(id => !next.items.includes(id)).length * 2
    - node.path.length * 0.01;
}
function allWitnessed() {
  return endings.size === endingRoutes.size
    && [...questFlags].every(flag => reachedFlags.has(flag))
    && puzzleIds.every(id => reachedPuzzles.has(id))
    && scenes.every(([id]) => reachedScenes.has(id));
}
function search(state, route) {
  if (allWitnessed()) return;
  const key = logicalKey(state);
  if (visitedStates.has(key)) return;
  visitedStates.add(key);
  if (++checkedStates > stateLimit) { capped = true; return; }
  reachedScenes.add(state.scene);
  for (const flag of state.flags) {
    reachedFlags.add(flag);
    if (questFlags.has(flag) && !flagRoutes.has(flag)) flagRoutes.set(flag, route);
  }
  for (const puzzle of state.solved) reachedPuzzles.add(puzzle);
  if (state.ending) {
    if (!endingRoutes.has(state.ending)) endingRoutes.set(state.ending, { state, route });
    return;
  }
  const { reached, branches } = closure(state);
  // Available productive actions themselves are concrete witnesses, even
  // when the greedy path selects a competing action before backtracking.
  for (const branch of branches) reachedScenes.add(branch.state.scene);
  rewardCycles(reached);
  branches.sort((left, right) => score(right, state) - score(left, state));
  const duplicateBranches = new Set();
  for (const branch of branches) {
    const key = logicalKey(branch.state);
    if (duplicateBranches.has(key)) continue;
    duplicateBranches.add(key);
    search(branch.state, [...route, ...branch.path]);
    if (allWitnessed() || capped) return;
  }
}

search(freshGame(), []);
// Replay each ending witness from an untouched new game. This catches any
// accidental closure shortcut, wrong choice index or unavailable map travel.
function replayRoute(route, ending, initial = freshGame()) {
  let replay = initial;
  const reachedActs = new Set([replay.act]);
  for (const step of route) {
    assert.equal(replay.scene, step.from, `${ending}: route starts a step in the wrong scene`);
    if (step.investigation) {
      assert(!finishedCases(replay).includes(step.investigation), `${ending}: investigation is completed twice`);
      replay = completeInvestigation(replay, step.investigation);
    } else if (step.travel) {
      assert(replay.unlocked.includes(step.travel), `${ending}: travel to locked location ${step.travel}`);
      assert.notEqual(step.travel, SCENES[replay.scene].location, `${ending}: map cannot reset its current location`);
      assert(!requiredInvestigation(locations.get(step.travel).scene, finishedCases(replay)), `${ending}: travel skipped a required investigation`);
      replay = { ...replay, scene: locations.get(step.travel).scene, location: step.travel };
    } else {
      const choice = SCENES[replay.scene].choices[step.choice];
      assert(choice && available(replay, choice), `${ending}: unavailable choice in ${replay.scene}`);
      assert.equal(choice.label, step.label, `${ending}: choice index/label disagree`);
      assert(!requiredInvestigation(choice.next, finishedCases(replay)), `${ending}: choice skipped a required investigation`);
      replay = transition(replay, choice);
    }
    assert.equal(replay.scene, step.next, `${ending}: incorrect step destination`);
    reachedActs.add(replay.act);
  }
  if (ending) {
    assert.equal(replay.ending, ending, `Witness did not reach ending ${ending}`);
    assert.deepEqual([...reachedActs].sort(), [1, 2, 3, 4, 5, 6], `${ending}: route skips an act`);
    assert.deepEqual(finishedCases(replay).sort(), INVESTIGATIONS.map(investigation => investigation.id).sort(), `${ending}: finale must complete all six investigations / thirty-six boards`);
  }
  return replay;
}
for (const [ending, result] of endingRoutes) {
  const replay = replayRoute(result.route, ending);
  assert.equal(logicalKey(replay), logicalKey(result.state), `${ending}: replayed state differs`);
  assert.equal(replay.time, result.state.time, `${ending}: replayed time differs`);
}
for (const [ending, result] of endingRoutes) {
  const recovered = replayRoute(result.route, ending, { ...freshGame(), time: 1 });
  assert(recovered.flags.includes('hospital_debt'), `${ending}: exhaustion did not trigger hospital recovery`);
  assert(recovered.flags.includes('ending_chosen'), `${ending}: hospital recovery prevented completion`);
}
// The friends' last-minutes decision is mutually exclusive. Verify both
// choices can continue to every ending, rather than merely witnessing each
// decision scene before the search selects its preferred branch.
const alternateEndingRoutes = new Map();
for (const [ending, result] of endingRoutes) {
  const decisionIndex = result.route.findIndex(step => step.from === 'friends_offer' && step.choice !== undefined);
  assert(decisionIndex >= 0, `${ending}: missing friends' decision`);
  const prefix = result.route.slice(0, decisionIndex);
  const before = replayRoute(prefix);
  const original = result.route[decisionIndex].choice;
  const alternateIndex = SCENES.friends_offer.choices.findIndex((choice, index) => index !== original && available(before, choice) && choice.effects?.some(effect => effect.flag === 'friends_decided'));
  assert(alternateIndex >= 0, 'Both friends\' pledge choices must be available');
  const alternate = SCENES.friends_offer.choices[alternateIndex];
  const alternateState = transition(before, alternate);
  const joinScene = result.route[decisionIndex + 2].from;
  const connector = closure(alternateState).reached.get(joinScene);
  assert(connector, `Friends' alternate decision cannot rejoin ${joinScene}`);
  const alternateRoute = [...prefix, stepRecord(before, alternate, alternateIndex), ...connector.path, ...result.route.slice(decisionIndex + 2)];
  const finalState = replayRoute(alternateRoute, ending);
  alternateEndingRoutes.set(ending, { state: finalState, route: alternateRoute });
}
// A player may leave the castle immediately after the exchange. The hospital
// must preserve the unresolved reservoir beat, and the castle hub must offer
// a way back so this freely allowed map detour cannot trap the story.
const mapDetourRoutes = new Map();
for (const [ending, result] of endingRoutes) {
  const exchangeIndex = result.route.findIndex(step => step.from === 'castle_changed' && step.choice !== undefined);
  assert(exchangeIndex >= 0, `${ending}: missing mind exchange result`);
  const prefix = result.route.slice(0, exchangeIndex);
  const exchanged = replayRoute(prefix);
  const atHospital = { ...exchanged, scene: locations.get('hospital').scene, location: 'hospital' };
  assert(!SCENES[atHospital.scene].choices.some(choice => choice.next === 'hospital_return' && available(atHospital, choice)), 'Restoration must wait until the reservoir has been returned');
  const atCastle = { ...atHospital, scene: locations.get('castle').scene, location: 'castle' };
  const returnIndex = SCENES[atCastle.scene].choices.findIndex(choice => choice.next === 'castle_changed' && available(atCastle, choice));
  assert(returnIndex >= 0, 'Castle travel hub must recover the unfinished exchange scene');
  const route = [...prefix,
    { from: exchanged.scene, travel: 'hospital', next: atHospital.scene },
    { from: atHospital.scene, travel: 'castle', next: atCastle.scene },
    stepRecord(atCastle, SCENES[atCastle.scene].choices[returnIndex], returnIndex),
    ...result.route.slice(exchangeIndex),
  ];
  const finalState = replayRoute(route, ending);
  assert(finalState.flags.includes('reservoir_open'), `${ending}: reservoir never opened`);
  mapDetourRoutes.set(ending, { state: finalState, route });
}
const missingScenes = scenes.map(([id]) => id).filter(id => !reachedScenes.has(id));
const missingFlags = [...questFlags].filter(flag => !reachedFlags.has(flag));
const missingPuzzles = puzzleIds.filter(id => !reachedPuzzles.has(id));
const missingEndings = [...endings].filter(ending => !endingRoutes.has(ending));
const report = {
  scenes: scenes.length, choices: choiceCount, items: Object.keys(ITEMS).length,
  locations: LOCATIONS.length, acts: ACTS.length, puzzles: puzzleIds.length,
  mandatoryInvestigations: INVESTIGATIONS.length, mandatoryInvestigationBoards: INVESTIGATIONS.reduce((sum, investigation) => sum + investigation.challenges.length, 0),
  checkedStates, capped, missingScenes, missingFlags, missingPuzzles, missingEndings,
  positiveRewardCycles: [...positiveRewardCycles.values()],
  endings: Object.fromEntries([...endingRoutes].map(([ending, result]) => [ending, {
    steps: result.route.length,
    act: result.state.act,
    finalTime: result.state.time,
    flags: result.state.flags,
    solved: result.state.solved,
    finishedInvestigations: finishedCases(result.state),
    route: result.route,
  }])),
  alternateFriendDecision: Object.fromEntries([...alternateEndingRoutes].map(([ending, result]) => [ending, {
    steps: result.route.length, finalTime: result.state.time, flags: result.state.flags, route: result.route,
  }])),
  exchangeMapDetour: Object.fromEntries([...mapDetourRoutes].map(([ending, result]) => [ending, {
    steps: result.route.length, finalTime: result.state.time, flags: result.state.flags, route: result.route,
  }])),
};
await writeFile(resolve(root, 'scripts/campaign-validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`${scenes.length} scenes, ${choiceCount} choices, ${LOCATIONS.length} locations, ${puzzleIds.length} puzzles, ${endings.size} endings; ${checkedStates} branch states checked.`);
for (const [ending, result] of endingRoutes) console.log(`Reachable ending ${ending}: ${result.route.length} playable steps, act ${result.state.act}, ${result.state.solved.length} puzzles solved.`);
console.log('Both friends\' pledge decisions replay successfully to all three endings.');
console.log('Leaving the castle after the exchange and returning via the map reaches all three endings.');
console.log('Starting with one second of time triggers hospital recovery and still reaches all three endings.');
for (const [name, missing] of Object.entries({ scenes: missingScenes, questFlags: missingFlags, puzzles: missingPuzzles, endings: missingEndings, rewardCycles: [...positiveRewardCycles.values()] })) {
  if (missing.length) console.error(`${name}: ${missing.join(', ')}`);
}
if (capped) console.error(`Search reached its ${stateLimit}-state limit; incomplete reachability is not proof of a defect.`);
assert.equal(missingFlags.length, 0, 'Every quest step must have a concrete playable witness');
assert.equal(missingPuzzles.length, 0, 'Every puzzle must have a concrete playable witness');
assert.equal(missingEndings.length, 0, 'Every ending must have a concrete playable route');
assert.equal(missingScenes.length, 0, 'Every scene must have a concrete playable witness');
assert.equal(positiveRewardCycles.size, 0, 'Time rewards must not be infinitely repeatable');
console.log('Campaign validation passed. Exact ending routes are in scripts/campaign-validation.json.');
