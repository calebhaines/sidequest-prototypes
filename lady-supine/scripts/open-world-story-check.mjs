import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(resolve(tmpdir(), 'lady-supine-world-story-'));
const built = new Map();
async function compile(path) {
  path = resolve(path);
  if (built.has(path)) return built.get(path);
  const target = resolve(temporary, relative(root, path).replace(/\.tsx?$/, '.mjs'));
  built.set(path, target);
  const source = await readFile(path, 'utf8');
  let output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const matches = [...output.matchAll(/from\s+(['"])(\.[^'"]+)\1/g)];
  for (const match of matches) {
    const dependency = resolve(dirname(path), match[2].replace(/\.ts$/, '') + '.ts');
    const compiled = await compile(dependency);
    output = output.replace(match[0], `from ${JSON.stringify(pathToFileURL(compiled).href)}`);
  }
  await mkdir(dirname(target), { recursive: true }); await writeFile(target, output);
  return target;
}

try {
  const [campaignPath, gamePath, bridgePath, worldPath, casesPath, caseTypesPath] = await Promise.all([
    compile(resolve(root, 'src/data/campaign.ts')), compile(resolve(root, 'src/data/game.ts')), compile(resolve(root, 'src/openworld/story.ts')),
    compile(resolve(root, 'src/openworld/world.ts')), compile(resolve(root, 'src/data/investigations.ts')), compile(resolve(root, 'src/data/investigationTypes.ts')),
  ]);
  const [{ SCENES }, { freshGame }, bridge, { createWorld }, { INVESTIGATIONS, caseFlag, caseIsComplete }, { toggleCircuit }] = await Promise.all([campaignPath, gamePath, bridgePath, worldPath, casesPath, caseTypesPath].map(path => import(pathToFileURL(path).href)));
  const report = JSON.parse(await readFile(resolve(root, 'scripts/campaign-validation.json'), 'utf8'));
  const data = createWorld();
  const actors = [data.overworld, ...Object.values(data.interiors)].flatMap(scene => scene.actors);
  const objects = [data.overworld, ...Object.values(data.interiors)].flatMap(scene => scene.objects);

  function completeCase(story, id) {
    const investigation = INVESTIGATIONS.find(entry => entry.id === id);
    const challenges = Object.fromEntries(investigation.challenges.map(challenge => {
      const board = challenge.board;
      const progress = { answers: {}, hints: 0, solved: true };
      if (board.kind === 'ledger' || board.kind === 'cipher' || board.kind === 'balance') progress.answers = { ...board.solution };
      if (board.kind === 'sequence') progress.order = [...board.solution];
      if (board.kind === 'route') progress.route = [...board.solution];
      if (board.kind === 'circuit') progress.lamps = board.solution.reduce((lamps, cell) => toggleCircuit(lamps, cell, board.size), [...board.initial]);
      return [challenge.id, progress];
    }));
    const progress = { stage: 6, started: true, finished: true, challenges };
    assert.ok(caseIsComplete(investigation, progress));
    return { ...story, flags: [...new Set([...story.flags, caseFlag(id)])], investigations: { ...story.investigations, [id]: progress } };
  }

  for (const scene of Object.values(SCENES)) {
    assert.ok(actors.some(actor => bridge.actorOwnsScene(actor, scene.id)) || objects.some(object => bridge.objectOwnsScene(object, scene.id)), `${scene.id}: every authored scene needs a physical conversation station`);
  }
  const requiredPhysical = new Set();
  for (const [ending, result] of Object.entries(report.endings)) {
    let story = freshGame();
    for (const [index, step] of result.route.entries()) {
      if (step.investigation) { story = completeCase(story, step.investigation); continue; }
      // The player physically approaches the recorded actor or region; the adapter itself
      // never performs this movement, so area is set by the world before opening dialogue.
      story = { ...story, scene: step.from, location: SCENES[step.from].location };
      if (step.travel) { story = { ...story, scene: step.next, location: step.travel }; continue; }
      const scene = SCENES[step.from];
      const choice = scene.choices[step.choice];
      const available = bridge.choicesForScene(scene, story).some(option => option.label === choice.label);
      // The original shortest-path witness re-visited the hospital after Ada was
      // restored. The physical game deliberately hides that redundant operation.
      if (!available && choice.next === 'hospital_return' && story.flags.includes('ada_restored')) continue;
      assert.ok(available, `${ending}/${index}: needed action remains available`);
      const owner = bridge.sceneOwner(step.from);
      if (!['town', 'friends'].includes(owner)) {
        const matchingActors = actors.filter(actor => bridge.actorOwnsScene(actor, step.from));
        const matchingObjects = objects.filter(object => bridge.objectOwnsScene(object, step.from));
        assert.ok(matchingActors.length || matchingObjects.length, `${step.from}: ${owner} needs an actual physical conversation station`);
        const resumed = matchingActors.some(actor => bridge.actorConversation(actor, story, step.from).id === step.from)
          || matchingObjects.some(object => bridge.objectConversation(object, story).id === step.from);
        assert.ok(resumed, `${ending}/${index}: ${step.from} must reopen at the correct physical station`);
        requiredPhysical.add(owner);
      }
      const beforeTime = story.time;
      const transition = bridge.applyStoryChoice(story, choice);
      assert.equal(transition.story.location, story.location, `${step.from}: dialogue cannot overwrite the physically occupied area`);
      const target = choice.next && SCENES[choice.next];
      if (target && target.location !== scene.location && !choice.ending) assert.ok(transition.closeDialogue && transition.destination, `${step.from}: cross-location changes must ask the player to walk`);
      const duplicate = bridge.applyStoryChoice({ ...transition.story, scene: step.from }, choice);
      assert.equal(duplicate.story.time, transition.story.time, `${step.from}: repeated actions cannot repeatedly award or spend time`);
      assert.ok(Number.isFinite(beforeTime));
      story = transition.story;
    }
    assert.equal(story.ending, ending);
    assert.equal(story.solved.length, 16);
    assert.equal(INVESTIGATIONS.filter(investigation => caseIsComplete(investigation, story.investigations[investigation.id])).length, 6);
    console.log(`PASS ${ending}: ${result.route.length} narrative steps, all real puzzle/case gates and physical station resumes`);
  }
  const infinitePortal = objects.find(object => object.id === 'infinite-gate');
  assert.ok(infinitePortal && bridge.objectOwnsScene(infinitePortal, 'infinite_question'), 'The final gate itself must own the last threshold conversation');
  const ambient = actors.find(actor => actor.id === 'library-usher');
  assert.equal(bridge.actorConversation(ambient, freshGame()).speaker, ambient.name, 'Ambient people retain their own conversation instead of cloning quest owners');
  console.log(`PASS: ${requiredPhysical.size} required physical story stations; all 90 scenes have physical stations; preserved story progress, spatial handoffs, one-time consequences and ambient conversations.`);
} finally { await rm(temporary, { recursive: true, force: true }); }
