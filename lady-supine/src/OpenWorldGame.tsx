import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { Choice, Scene } from './data/campaign';
import { LOCATIONS, SCENES } from './data/campaign';
import { freshGame, type GameState } from './data/game';
import { caseFlag, caseIsComplete, INVESTIGATIONS, requiredInvestigation } from './data/investigations';
import type { InvestigationProgress } from './data/investigationTypes';
import PuzzleModal from './components/PuzzleModal';
import GameHUD from './components/GameHUD';
import GamePanels from './components/GamePanels';
import DialogueBox from './components/DialogueBox';
import { createWorld } from './openworld/world';
import { createEngine } from './openworld/engine';
import { actorConversation, actorOwnsScene, applyStoryChoice, choicesForScene, objectConversation, objectOwnsScene, questObjective, sceneForId } from './openworld/story';
import { GameAudio } from './openworld/audio';
import { isAdventureSave, loadAdventure, safeWorldSave, saveAdventure } from './openworld/save';
import type { GameEngine, InteractTarget, WorldSnapshot } from './openworld/types';

const InvestigationModal = lazy(() => import('./components/InvestigationModal'));
const data = createWorld();
type Notice = { id: number; text: string; kind: 'info' | 'success' | 'warning' };
type CaseRequest = { id: string; choice?: Choice; scene?: Scene };
const emptyCase = (): InvestigationProgress => ({ stage: 0, started: false, finished: false, challenges: {} });

export default function OpenWorldGame() {
  const [initialBoot] = useState(loadAdventure);
  const boot = useRef(initialBoot);
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const engine = useRef<GameEngine | null>(null);
  const audio = useRef(new GameAudio());
  const [story, setStoryState] = useState<GameState>(boot.current.story);
  const storyRef = useRef(story);
  const [world, setWorld] = useState<WorldSnapshot | null>(null);
  const [session, setSession] = useState(0);
  const [title, setTitle] = useState(true);
  const [panel, setPanel] = useState<string | null>(null);
  const [dialogue, setDialogue] = useState<Scene | null>(null);
  const [puzzle, setPuzzle] = useState<Choice | null>(null);
  const [activeCase, setActiveCase] = useState<CaseRequest | null>(null);
  const caseRef = useRef<Record<string, InvestigationProgress>>(story.investigations);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [sound, setSound] = useState(false);
  const [endingOpen, setEndingOpen] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const [resetConfirm, setResetConfirm] = useState(false);
  const noticeSequence = useRef(0);
  const noticesTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const dirty = useRef(false);
  const blocked = title || !!panel || !!dialogue || !!puzzle || !!activeCase || endingOpen || recovery || hidden || resetConfirm;
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const updateStory = useCallback((next: GameState | ((previous: GameState) => GameState)) => {
    const value = typeof next === 'function' ? next(storyRef.current) : next;
    storyRef.current = value; caseRef.current = value.investigations; dirty.current = true; setStoryState(value); engine.current?.setFlags(value.flags);
  }, []);
  const notify = useCallback((text: string, kind: Notice['kind'] = 'info') => {
    const id = ++noticeSequence.current;
    setNotices(previous => [...previous.slice(-3), { id, text, kind }]);
    noticesTimers.current.push(setTimeout(() => setNotices(previous => previous.filter(notice => notice.id !== id)), 5200));
  }, []);
  const save = useCallback((announce = false) => {
    if (!engine.current) return;
    const okay = saveAdventure(storyRef.current, engine.current.getSave()); dirty.current = false;
    if (announce) notify(okay ? 'Your journey has been saved in this browser.' : 'Browser storage is full. Export your journey to keep it.', okay ? 'success' : 'warning');
  }, [notify]);
  const finishedCases = (current: GameState) => INVESTIGATIONS.filter(investigation => caseIsComplete(investigation, current.investigations[investigation.id])).map(investigation => investigation.id);
  function openScene(scene: Scene) {
    const required = requiredInvestigation(scene.id, finishedCases(storyRef.current));
    if (required) { setActiveCase({ id: required, scene }); return; }
    const current = storyRef.current;
    updateStory({ ...current, scene: scene.id, visited: [...new Set([...current.visited, scene.id])], journal: current.journal.some(entry => entry.scene === scene.id) ? current.journal : [...current.journal, { scene: scene.id, speaker: scene.speaker, text: scene.text.join('\n\n'), timestamp: Date.now() }] });
    setDialogue(scene); setPanel(null); audio.current.play('interact');
  }
  const interactRef = useRef<(target: InteractTarget) => void>(() => {});
  interactRef.current = target => {
    if (blockedRef.current) return;
    if (target.actor) { openScene(actorConversation(target.actor, storyRef.current, storyRef.current.scene)); return; }
    const object = target.object;
    if (!object) return;
    if (object.kind === 'workbench' || object.kind === 'campfire') { setPanel('crafting'); return; }
    if (object.kind === 'bed') {
      const current = engine.current?.getSave();
      if (current) engine.current?.load({ ...current, player: { ...current.player, health: current.player.maxHealth, stamina: current.player.maxStamina } });
      notify('You rest. Tomorrow finds you breathing.', 'success');
    }
    openScene(objectConversation(object, storyRef.current));
  };
  useEffect(() => {
    if (!canvas.current) return;
    const saved = boot.current.world ? safeWorldSave(boot.current.world, data) : undefined;
    const instance = createEngine(canvas.current, data, {
      onInteract: target => interactRef.current(target), onNotify: notify,
      onTimeChange: seconds => {
        if (blockedRef.current && seconds < 0) return;
        updateStory(current => ({ ...current, time: Math.max(0, current.time + seconds) }));
        if (storyRef.current.time <= 0) setRecovery(true);
      },
      onArea: location => updateStory(current => ({ ...current, location, unlocked: [...new Set([...current.unlocked, location])] })),
      onRecovery: () => setRecovery(true), onSound: name => audio.current.play(name),
    }, saved);
    engine.current = instance; instance.setFlags(storyRef.current.flags); instance.setPaused(blockedRef.current);
    if (boot.current.migrated) {
      const region = data.regions.find(region => region.id === storyRef.current.location);
      if (region) instance.teleport(data.overworld.id, region.landmark);
      notify('Your earlier story progress has been brought into the new world.', 'success'); boot.current.migrated = false;
    }
    setWorld(instance.getSnapshot());
    const unsubscribe = instance.subscribe(snapshot => { setWorld(snapshot); dirty.current = true; });
    instance.start();
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__ladySupine = { getStory: () => structuredClone(storyRef.current), getWorld: () => instance.getSnapshot(), getEngine: () => instance, getData: () => data };
    return () => { unsubscribe(); instance.destroy(); if (engine.current === instance) engine.current = null; };
  }, [session, notify, updateStory]);
  useEffect(() => { engine.current?.setPaused(blocked); }, [blocked]);
  useEffect(() => {
    const interval = setInterval(() => { if (!blockedRef.current) updateStory(current => ({ ...current, playSeconds: current.playSeconds + 1 })); }, 1000);
    const autosave = setInterval(() => { if (dirty.current) save(); }, 5000);
    const visibility = () => { setHidden(document.hidden); if (document.hidden) save(); };
    const leaving = () => save();
    document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', leaving);
    return () => { clearInterval(interval); clearInterval(autosave); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', leaving); };
  }, [save, updateStory]);
  useEffect(() => () => { noticesTimers.current.forEach(clearTimeout); audio.current.destroy(); }, []);
  function targetDestination(location: string, next: Scene | null) {
    const region = data.regions.find(region => region.id === location);
    const actors = [...data.overworld.actors, ...Object.values(data.interiors).flatMap(room => room.actors)];
    const speaker = next?.speaker.toLowerCase() || '';
    const station = next ? data.overworld.objects.find(object => objectOwnsScene(object, next.id)) : undefined;
    const interiorStation = next ? Object.values(data.interiors).find(room => room.objects.some(object => objectOwnsScene(object, next.id))) : undefined;
    const interiorObject = interiorStation?.objects.find(object => next && objectOwnsScene(object, next.id));
    const target = actors.find(actor => actor.location === location && (next && actorOwnsScene(actor, next.id) || actor.name.toLowerCase() === speaker || speaker.includes(actor.name.toLowerCase()) || actor.scene === next?.id));
    let point = region?.landmark;
    let waypointScene = data.overworld.id;
    if (station) point = { x: station.x + (station.width || 0) / 2, y: station.y + (station.height || 0) + 1 };
    else if (interiorStation && engine.current?.getSave().sceneId === interiorStation.id && interiorObject) { point = interiorObject; waypointScene = interiorStation.id; }
    else if (interiorStation) {
      const building = data.overworld.objects.find(object => object.door?.scene === interiorStation.id);
      if (building) point = { x: building.x + (building.width || 1) / 2, y: building.y + (building.height || 1) + 1 };
    }
    else if (target && data.overworld.actors.includes(target)) point = target;
    else if (target) {
      const room = Object.values(data.interiors).find(room => room.actors.includes(target));
      const building = data.overworld.objects.find(object => object.door?.scene === room?.id);
      if (room && room.id === engine.current?.getSave().sceneId) { point = target; waypointScene = room.id; }
      else if (building) point = { x: building.x + (building.width || 1) / 2, y: building.y + (building.height || 1) + 1 };
    }
    if (point) engine.current?.setWaypoint({ x: point.x, y: point.y }, waypointScene);
  }
  function commitChoice(choice: Choice, from = storyRef.current) {
    const required = requiredInvestigation(choice.next, finishedCases(from));
    if (required) { setActiveCase({ id: required, choice }); return; }
    if (choice.puzzle === 'fishing' && !from.solved.includes('fishing')) {
      if ((engine.current?.getSave().inventory.fish || 0) < 3) {
        setDialogue(null);
        notify('Bring Mallow three fish. Select your rod (4), cast toward the water, and reel when the float dips.');
        return;
      }
      engine.current?.addResource('fish', -3);
      from = { ...from, solved: [...new Set([...from.solved, 'fishing'])] };
      updateStory(from);
      notify('Three fish for the common pot. A living willow cutting for you.', 'success');
    }
    if (!from.flags.includes('willow_gathered') && choice.effects?.some(effect => effect.flag === 'willow_gathered')) {
      if ((engine.current?.getSave().inventory.willow_fibre || 0) < 3) {
        setDialogue(null);
        engine.current?.setWaypoint({ x: 84, y: 57 });
        notify('Gather three fallen willow fibres beside Cinder with E, then return to her. The little cutting still needs a home.');
        return;
      }
      if (!from.solved.includes('forest')) { setPuzzle(choice); return; }
      engine.current?.addResource('willow_fibre', -3);
    }
    if (choice.puzzle && !from.solved.includes(choice.puzzle)) { setPuzzle(choice); return; }
    const transition = applyStoryChoice({ ...from, scene: dialogue?.id || from.scene }, choice); updateStory(transition.story);
    if (transition.destination) { targetDestination(transition.destination, transition.destinationScene ? sceneForId(transition.destinationScene) : transition.nextScene); notify(`Follow your compass to ${LOCATIONS.find(location => location.id === transition.destination)?.name || transition.destination}.`); }
    if (choice.ending && transition.ending) { setDialogue(null); setEndingOpen(true); save(); }
    else setDialogue(transition.closeDialogue ? null : transition.nextScene);
    const minutes = choice.effects?.reduce((sum, effect) => sum + (effect.time || 0), 0) || 0;
    if (minutes && transition.story.time !== from.time) notify(minutes > 0 ? `${minutes} minutes, given to you.` : `${Math.abs(minutes)} minutes, well spent.`, minutes > 0 ? 'success' : 'info');
    if (transition.story.time <= 0) setRecovery(true);
  }
  function solvePuzzle() {
    if (!puzzle) return;
    const choice = puzzle, current = storyRef.current;
    const solved = { ...current, solved: [...new Set([...current.solved, choice.puzzle!])] };
    updateStory(solved); setPuzzle(null); audio.current.play('craft'); commitChoice(choice, solved);
  }
  function caseProgress(id: string, progress: InvestigationProgress) {
    caseRef.current = { ...caseRef.current, [id]: progress };
    updateStory(current => ({ ...current, investigations: caseRef.current })); save();
  }
  function finishCase() {
    if (!activeCase) return;
    const investigation = INVESTIGATIONS.find(investigation => investigation.id === activeCase.id), latest = caseRef.current[activeCase.id];
    if (!investigation || !latest) return;
    const progress = { ...latest, finished: true };
    if (!caseIsComplete(investigation, progress)) { notify('There is still a thread to follow in this case.', 'warning'); return; }
    const request = activeCase, current = storyRef.current, journal = [...current.journal];
    const entries = [{ id: `case_${investigation.id}_premise`, text: investigation.premise }, ...investigation.challenges.map(challenge => ({ id: `case_${investigation.id}_${challenge.id}`, text: [...challenge.narrative, ...challenge.evidence.map(evidence => `${evidence.title}\n${evidence.text}`), ...challenge.resolution] })), { id: `case_${investigation.id}_conclusion`, text: investigation.conclusion }];
    for (const entry of entries) if (!journal.some(moment => moment.scene === entry.id)) journal.push({ scene: entry.id, speaker: investigation.title, text: entry.text.join('\n\n'), timestamp: Date.now() });
    const next = { ...current, flags: [...new Set([...current.flags, caseFlag(investigation.id)])], investigations: { ...current.investigations, [investigation.id]: progress }, journal, visited: [...new Set([...current.visited, ...entries.map(entry => entry.id)])] };
    updateStory(next); setActiveCase(null); save(); notify('A case closed. A person remembered.', 'success');
    if (request.choice) commitChoice(request.choice, next); else if (request.scene) openScene(request.scene);
  }
  function restart() {
    boot.current = { story: freshGame(), migrated: false }; updateStory(freshGame());
    setDialogue(null); setPuzzle(null); setActiveCase(null); setPanel(null); setTitle(false); setEndingOpen(false); setRecovery(false); setResetConfirm(false); setNotices([]); setSession(previous => previous + 1);
  }
  function exportSave() {
    if (!engine.current) return;
    save(); const blob = new Blob([JSON.stringify({ version: 2, story: storyRef.current, world: engine.current.getSave(), savedAt: Date.now() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = 'lady-supine-journey.json'; anchor.click(); URL.revokeObjectURL(url); notify('Your journey has been exported.', 'success');
  }
  async function importSave(file: File) {
    try {
      if (file.size > 5_000_000) throw new Error('too large');
      const value: unknown = JSON.parse(await file.text()); if (!isAdventureSave(value)) throw new Error('invalid journey');
      updateStory(value.story); engine.current?.load(safeWorldSave(value.world, data)); setDialogue(null); setPuzzle(null); setActiveCase(null); setEndingOpen(false); setTitle(false); setPanel(null); save(); notify('Your journey has been restored.', 'success');
    } catch { notify('This file does not contain a valid Lady Supine journey.', 'warning'); }
  }
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await frame.current?.requestFullscreen(); }
    catch { notify('Fullscreen is unavailable in this browser. The game still fills this window.'); }
  }
  function recover() {
    const current = engine.current?.getSave();
    if (current) engine.current?.load({ ...current, player: { ...current.player, health: current.player.maxHealth, stamina: current.player.maxStamina } });
    const region = data.regions.find(region => region.id === 'hospital'); if (region) engine.current?.teleport(data.overworld.id, region.landmark);
    updateStory(previous => ({ ...previous, time: Math.max(previous.time, 20 * 60), flags: [...new Set([...previous.flags, 'hospital_debt'])] }));
    setRecovery(false); setDialogue(null); setPuzzle(null); setActiveCase(null); setPanel(null); notify('Nurse Reed has lent you twenty minutes. No one is beyond a tomorrow.', 'success'); save();
  }
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === 'escape') {
        event.preventDefault(); if (title) return;
        if (resetConfirm) setResetConfirm(false); else if (puzzle) setPuzzle(null); else if (activeCase) setActiveCase(null); else if (endingOpen) setEndingOpen(false); else if (recovery) return; else if (panel) setPanel(null); else if (dialogue) setDialogue(null); else setPanel('menu'); return;
      }
      if (title || dialogue || puzzle || activeCase || recovery || endingOpen || resetConfirm) return;
      const shortcuts: Record<string, string> = { m: 'map', i: 'inventory', tab: 'inventory', j: 'journal', b: 'crafting', p: 'menu' };
      if (shortcuts[key]) { event.preventDefault(); setPanel(previous => previous === shortcuts[key] ? null : shortcuts[key]); }
    };
    window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener);
  }, [title, dialogue, puzzle, activeCase, recovery, endingOpen, resetConfirm, panel]);
  const caseData = activeCase ? INVESTIGATIONS.find(investigation => investigation.id === activeCase.id) : null;
  const hasProgress = story.flags.length > 0 || story.playSeconds > 10 || !!boot.current.world;
  const ending = SCENES[story.scene];
  return <div className="ow-game" ref={frame} aria-label="Lady Supine game window">
    <canvas ref={canvas} className="ow-canvas" aria-label="Walkable world. Move with WASD or arrow keys, interact with E." tabIndex={0} />
    {world && !title && <GameHUD story={story} world={world} data={data} notices={notices} quest={questObjective(story)} onPanel={setPanel} onSelectSlot={index => engine.current?.selectSlot(index)} onInteract={() => engine.current?.interact()} onAction={() => engine.current?.primaryAction()} onTouchDirection={direction => engine.current?.setTouchDirection(direction)} />}
    {title && <div className="ow-title-overlay"><div className="ow-title-card"><span className="ow-eyebrow">WELCOME TO THE LAND OF LIMITED TIME</span><h1>Lady Supine</h1><h2>Entering the Unenterable Entrance</h2><p>A small human. A very large promise. An entire kingdom running out of tomorrow.</p><p>Walk the roads, make sweet friends, and find what lies beyond the Keeper of Limited Time.</p><button className="ow-primary" onClick={() => { setTitle(false); canvas.current?.focus(); if (!hasProgress) notify('Walk to the Gatekeeper. Press E to speak.'); }}>{hasProgress ? 'Continue journey' : 'Begin journey'}</button><button className="ow-secondary" onClick={() => { setTitle(false); setPanel('settings'); }}>Settings & controls</button><div className="ow-title-controls">WASD / arrows · E interact · click use tool · Shift run<br />I inventory · B craft · M map · J journal · Esc pause</div><small>Temporary original art · Your journey saves in this browser</small></div></div>}
    {world && panel && <GamePanels panel={panel} story={story} world={world} data={data} onClose={() => { setPanel(null); canvas.current?.focus(); }} onPanel={setPanel} onWaypoint={position => { engine.current?.setWaypoint(position); setPanel(null); }} onCraft={id => engine.current?.craft(id)} onConsume={id => engine.current?.consume(id)} onBuild={id => { engine.current?.beginBuild(id); setPanel(null); }} onOptions={options => engine.current?.setOptions(options)} onSave={() => save(true)} onExport={exportSave} onImport={importSave} onNewGame={() => setResetConfirm(true)} onFullscreen={fullscreen} audioEnabled={sound} onAudioChange={enabled => { setSound(enabled); audio.current.setEnabled(enabled); }} onOpenCase={id => { setPanel(null); setActiveCase({ id }); }} />}
    {dialogue && !puzzle && !activeCase && <DialogueBox key={dialogue.id} scene={dialogue} story={story} choices={choicesForScene(dialogue, story)} onChoice={choice => commitChoice(choice)} onClose={() => { setDialogue(null); canvas.current?.focus(); }} />}
    {puzzle?.puzzle && <PuzzleModal key={puzzle.puzzle} puzzleId={puzzle.puzzle} onSolve={solvePuzzle} onClose={() => setPuzzle(null)} />}
    {caseData && activeCase && <Suspense fallback={<div className="ow-title-overlay"><div className="ow-title-card" role="status"><span className="ow-eyebrow">A MOMENT, BORROWED</span><div className="cigarillo-loader" aria-hidden="true"><span className="cigarillo-filter" /><span className="cigarillo-paper" /><span className="cigarillo-ember" /></div><p>The casebook is finding its page.</p></div></div>}><InvestigationModal key={caseData.id} investigation={{ ...caseData, location: LOCATIONS.find(location => location.id === caseData.location)?.name || caseData.location }} progress={story.investigations[caseData.id] || emptyCase()} onProgress={progress => caseProgress(caseData.id, progress)} onComplete={finishCase} onClose={() => setActiveCase(null)} /></Suspense>}
    {endingOpen && <div className="ow-ending-overlay"><article className="ow-ending-card"><span className="ow-eyebrow">BEFORE OUR HEADS HIT THE PILLOW</span><h1>{story.ending === 'commons' ? 'A tomorrow for everyone' : story.ending === 'infinite' ? 'Beyond the promise' : 'A life worth staying for'}</h1>{ending?.text.map((paragraph, index) => <p key={index}>{paragraph}</p>)}<button className="ow-primary" onClick={() => { setEndingOpen(false); save(); }}>Return to your world</button><button className="ow-secondary" onClick={exportSave}>Keep this journey</button></article></div>}
    {recovery && <div className="ow-title-overlay"><div className="ow-title-card"><span className="ow-eyebrow">THE HOSPITAL FOR THOSE OUT OF TIME</span><h2>Someone has kept a little tomorrow for you.</h2><p>Nurse Reed finds you before the Aristobats do. The hospital calls it a debt. She calls it a beginning.</p><button className="ow-primary" onClick={recover}>Accept her twenty minutes</button></div></div>}
    {resetConfirm && <div className="ow-title-overlay"><div className="ow-title-card"><h2>Begin a new journey?</h2><p>This replaces the journey saved in this browser. You can export your current journey first.</p><button className="ow-secondary" onClick={exportSave}>Export current journey</button><button className="ow-primary" onClick={restart}>Begin a new journey</button><button className="ow-secondary" onClick={() => setResetConfirm(false)}>Keep exploring</button></div></div>}
  </div>;
}
