import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowRight, Bookmark, BookOpen, Check, CheckCheck, ChevronRight, CircleHelp, Clock3, Compass, Download, Eye, Feather, Flag, Heart, Hourglass, Map, Maximize2, Moon, RotateCcw, Settings2, Sparkles, Sprout, Upload, Volume2, VolumeX, X } from 'lucide-react';
import { ACTS, ITEMS, LOCATIONS, QUESTS, SCENES } from './data/campaign';
import type { Choice } from './data/campaign';
import { formatTime, freshGame, isGameSave, matchesRequirement, readSave, SAVE_KEY } from './data/game';
import type { GameState } from './data/game';
import PuzzleModal from './components/PuzzleModal';
import { caseFlag, caseIsComplete, INVESTIGATIONS, requiredInvestigation } from './data/investigations';
import { emptyInvestigation } from './data/investigationTypes';
import type { InvestigationProgress } from './data/investigationTypes';

const InvestigationModal = lazy(() => import('./components/InvestigationModal'));
const artUrl = (name: string) => `${import.meta.env.BASE_URL}art/${name}.svg`;

type Panel = 'map' | 'journal' | 'pockets' | 'settings' | 'observe' | 'help' | null;
const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const OBSERVATIONS: Record<string, string> = {
  gate: 'The entrance stands on its own, with no wall to either side. Walking around it brings you back in front of it. Its hinges have been polished by generations of people who were certain they were the exception.',
  town: 'Little houses lean on one another for support. A kettle whistles somewhere. Even here, where there is so little, someone has made room for a flowerpot.',
  library: 'The shelves reach farther than the building ought to allow. Each book contains a little of somebody’s life. The unworn spines are the saddest ones.',
  lake: 'A silver ripple crosses the perfectly still water. The sign calls this a place of Tasteful Scarcity. The fish, apparently, were not consulted.',
  forest: 'Smoke curls between the willows. Their branches twist into question marks. They smell faintly of yesterday’s rain and somebody else’s cigarillo.',
  museum: 'Every picture has been hung at precisely the height of Lady Supine’s eyes. The little brass labels describe the correct feelings to have.',
  castle: 'The Great Castle Divine has more windows than rooms. Behind each window is a telescreen. Behind one of the telescreens, there is a person.',
  hospital: 'The clock above the door has no hands. Someone has put a blanket around it. A small, practical kindness.',
  pit: 'The island is a hole in the world. Its reflections look younger than the things they reflect. You keep a hand around your own memories.',
  casino: 'Every light promises a brighter future. Every machine takes a little of the present. The carpet has never seen daylight.',
  fields: 'Enough grows here for everybody. That, according to the notice, is precisely why a permit is necessary.',
  infinite: 'The horizon refuses to come any closer. For the first time, there is no clock to tell you whether that is good or bad.',
};

function journeyQuest(actNumber: number) {
  const base = QUESTS.find(quest => quest.act === actNumber);
  if (!base) return undefined;
  const quest = { ...base, steps: [...base.steps] };
  const investigation = INVESTIGATIONS.find(entry => entry.act === actNumber);
  if (investigation) quest.steps.splice([4, 4, 3, 2, 0, 1][actNumber - 1], 0, { text: `Resolve ${investigation.title}`, flag: caseFlag(investigation.id) });
  return quest;
}

function SceneArt({ kind, name }: { kind: string; name: string }) {
  const [entranceArt, setEntranceArt] = useState('');
  useEffect(() => {
    if (kind !== 'gate') return;
    const abort = new AbortController();
    void fetch(artUrl('gate'), { signal: abort.signal }).then(response => response.ok ? response.text() : '').then(svg => {
      if (svg) setEntranceArt(svg.replace('<svg ', '<svg preserveAspectRatio="xMidYMid slice" '));
    }).catch(() => { /* The external image remains a usable fallback. */ });
    return () => abort.abort();
  }, [kind]);
  if (kind === 'gate' && entranceArt) return <div className="scene-art inline-scene" role="img" aria-label={`An illustrated view of ${name}`} dangerouslySetInnerHTML={{ __html: entranceArt }} />;
  return <img className="scene-art" src={artUrl(kind)} alt={`An illustrated view of ${name}`} />;
}

function Timepiece({ time }: { time: number }) {
  const angle = (time / 60 % 60) * 6;
  return <svg className="timepiece" viewBox="0 0 160 160" aria-hidden="true">
    <circle cx="80" cy="80" r="65" fill="none" stroke="currentColor" strokeWidth="1" />
    <circle cx="80" cy="80" r="60" fill="none" stroke="currentColor" strokeWidth=".5" opacity=".35" />
    {Array.from({ length: 60 }, (_, i) => <line key={i} x1="80" y1={i % 5 === 0 ? 23 : 26} x2="80" y2="29" stroke="currentColor" strokeWidth={i % 5 === 0 ? 1.5 : .55} opacity={i % 5 === 0 ? .8 : .45} transform={`rotate(${i * 6} 80 80)`} />)}
    <text x="80" y="45" textAnchor="middle">XII</text><text x="117" y="84" textAnchor="middle">III</text><text x="80" y="124" textAnchor="middle">VI</text><text x="42" y="84" textAnchor="middle">IX</text>
    <path d="M80 80 L64 55" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M80 85 L80 34" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" transform={`rotate(${angle} 80 80)`} />
    <circle cx="80" cy="80" r="3.5" fill="currentColor" /><circle cx="80" cy="80" r="1" fill="#f2efdf" />
    <path d="M73 14 Q80 7 87 14 M80 9 V3 M76 3 H84" fill="none" stroke="currentColor" />
  </svg>;
}

function App() {
  const [game, setGame] = useState<GameState>(readSave);
  const [panel, setPanel] = useState<Panel>(null);
  const [puzzle, setPuzzle] = useState<Choice | null>(null);
  const [activeCase, setActiveCase] = useState<{ id: string; choice?: Choice; travel?: string } | null>(null);
  const [toast, setToast] = useState('');
  const [muted, setMuted] = useState(true);
  const [largeText, setLargeText] = useState(() => { try { return localStorage.getItem('supine-large-text') === 'true'; } catch { return false; } });
  const [resetConfirm, setResetConfirm] = useState(false);
  const [journalTab, setJournalTab] = useState<'story' | 'notes' | 'casebooks'>('notes');
  const [saveError, setSaveError] = useState(false);
  const [endDismissed, setEndDismissed] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const caseProgressRef = useRef(game.investigations || {});
  caseProgressRef.current = game.investigations || {};
  const scene = SCENES[game.scene] || SCENES.gate_arrival;
  const location = LOCATIONS.find(l => l.id === scene.location) || LOCATIONS[0];
  const act = ACTS[Math.max(0, Math.min(game.act - 1, ACTS.length - 1))];
  const quest = journeyQuest(game.act);
  const choices = scene.choices.filter(c => matchesRequirement(c.requires, game.flags) && (!c.item || game.items.includes(c.item)));
  const encounteredInCase = game.investigations?.portrait_testimony?.started || game.investigations?.continuity_patient?.started;
  const companions = [
    { id: 'pip', name: 'Pip', met: game.flags.includes('pip_friend') || game.investigations?.missing_tomorrow?.started },
    { id: 'brindle', name: 'Brindle', met: game.flags.includes('brindle_friend') || encounteredInCase },
    { id: 'ada', name: 'Ada', met: game.flags.includes('ada_friend') || encounteredInCase },
  ].filter(companion => companion.met);
  const companionCount = companions.length;

  useEffect(() => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); setSaveError(false); } catch { setSaveError(true); }
  }, [game]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setGame(g => ({ ...g, playSeconds: g.playSeconds + 15 }));
    }, 15000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    try { localStorage.setItem('supine-large-text', String(largeText)); } catch { /* Reading preferences are optional. */ }
  }, [largeText]);
  useEffect(() => {
    if (!panel) return;
    const previous = document.activeElement as HTMLElement;
    const timer = window.setTimeout(() => document.querySelector<HTMLElement>('.overlay-card button')?.focus(), 30);
    const keyHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanel(null);
      if (event.key === 'Tab') {
        const controls = Array.from(document.querySelectorAll<HTMLElement>('.overlay-card button:not([disabled]), .overlay-card input, .overlay-card a, .overlay-card [tabindex="0"]'));
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keyHandler);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(timer); document.removeEventListener('keydown', keyHandler); document.body.style.overflow = originalOverflow; previous?.focus(); };
  }, [panel]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (panel || puzzle || activeCase || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName)) return;
      if (e.key.toLowerCase() === 'm') setPanel('map');
      if (e.key.toLowerCase() === 'j') setPanel('journal');
      if (e.key.toLowerCase() === 'i') setPanel('pockets');
      if (e.key.toLowerCase() === 'h') setPanel('help');
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [panel, puzzle, activeCase]);

  function transition(current: GameState, choice: Choice, solved?: string): GameState {
    const updated = { ...current, flags: [...current.flags], items: [...current.items], unlocked: [...current.unlocked], visited: [...current.visited], journal: [...current.journal], solved: [...current.solved] };
    for (const effect of choice.effects || []) {
      if (effect.time) updated.time = Math.max(0, updated.time + effect.time * 60);
      if (effect.addItem && !updated.items.includes(effect.addItem)) updated.items.push(effect.addItem);
      if (effect.removeItem) updated.items = updated.items.filter(i => i !== effect.removeItem);
      if (effect.flag && !updated.flags.includes(effect.flag)) updated.flags.push(effect.flag);
      if (effect.unlock && !updated.unlocked.includes(effect.unlock)) updated.unlocked.push(effect.unlock);
      if (effect.act) updated.act = Math.max(updated.act, effect.act);
    }
    if (solved && !updated.solved.includes(solved)) updated.solved.push(solved);
    if (!updated.journal.some(j => j.scene === current.scene)) {
      const previous = SCENES[current.scene];
      if (previous) updated.journal.push({ scene: current.scene, speaker: previous.speaker, text: previous.text.join('\n\n'), timestamp: Date.now() });
    }
    if (choice.next && SCENES[choice.next]) {
      updated.scene = choice.next;
      updated.location = SCENES[choice.next].location;
      if (!updated.visited.includes(choice.next)) updated.visited.push(choice.next);
      if (!updated.unlocked.includes(updated.location)) updated.unlocked.push(updated.location);
    }
    if (choice.ending) {
      updated.ending = choice.ending;
      const finalScene = SCENES[updated.scene];
      if (finalScene && !updated.journal.some(j => j.scene === updated.scene)) updated.journal.push({ scene: updated.scene, speaker: finalScene.speaker, text: finalScene.text.join('\n\n'), timestamp: Date.now() });
    }
    return updated;
  }

  function finishedCases(state: GameState): string[] {
    return INVESTIGATIONS.filter(investigation => state.flags.includes(caseFlag(investigation.id))).map(investigation => investigation.id);
  }

  function choose(choice: Choice, fromState = game) {
    const required = requiredInvestigation(choice.next, finishedCases(fromState));
    if (required) { setActiveCase({ id: required, choice }); return; }
    if (choice.puzzle && !game.solved.includes(choice.puzzle)) { setPuzzle(choice); return; }
    setGame(g => transition(g, choice));
    const time = choice.effects?.reduce((total, e) => total + (e.time || 0), 0) || 0;
    if (time) setToast(time > 0 ? `${time} minutes, given to you.` : `${Math.abs(time)} minutes, well spent.`);
  }

  function travel(id: string, fromState = game) {
    const destination = LOCATIONS.find(l => l.id === id);
    if (!destination || !fromState.unlocked.includes(id)) return;
    const required = requiredInvestigation(destination.scene, finishedCases(fromState));
    if (required) { setPanel(null); setActiveCase({ id: required, travel: id }); return; }
    if (id === scene.location && game.scene === destination.scene) { setPanel(null); return; }
    const next = SCENES[destination.scene];
    if (!next) { setToast('This road is not yet ready.'); return; }
    setGame(g => ({ ...g, scene: destination.scene, location: id, visited: g.visited.includes(destination.scene) ? g.visited : [...g.visited, destination.scene] }));
    setPanel(null);
    setToast(`You arrive at ${destination.name}.`);
  }

  function saveCaseProgress(id: string, progress: InvestigationProgress) {
    caseProgressRef.current = { ...caseProgressRef.current, [id]: progress };
    setGame(g => ({ ...g, investigations: { ...g.investigations, [id]: progress } }));
  }

  function finishCase() {
    if (!activeCase) return;
    const investigation = INVESTIGATIONS.find(entry => entry.id === activeCase.id);
    const saved = caseProgressRef.current[activeCase.id];
    if (!investigation || !saved) return;
    const progress = { ...saved, finished: true };
    if (!caseIsComplete(investigation, progress)) { setToast('There is still a thread to follow in this case.'); return; }
    const pending = activeCase;
    const flag = caseFlag(investigation.id);
    const nextState = { ...game, flags: [...new Set([...game.flags, flag])], investigations: { ...caseProgressRef.current, [investigation.id]: progress } };
    caseProgressRef.current = nextState.investigations;
    setGame(g => {
      const journal = [...g.journal];
      const visited = [...g.visited];
      const entries = [
        { id: `case_${investigation.id}_premise`, text: investigation.premise },
        ...investigation.challenges.map(challenge => ({ id: `case_${investigation.id}_${challenge.id}`, text: [...challenge.narrative, ...challenge.evidence.map(evidence => `${evidence.title}\n${evidence.text}`), ...challenge.resolution] })),
        { id: `case_${investigation.id}_conclusion`, text: investigation.conclusion },
      ];
      for (const entry of entries) {
        if (!journal.some(moment => moment.scene === entry.id)) journal.push({ scene: entry.id, speaker: investigation.title, text: entry.text.join('\n\n'), timestamp: Date.now() });
        if (!visited.includes(entry.id)) visited.push(entry.id);
      }
      return { ...g, flags: [...new Set([...g.flags, flag])], investigations: { ...g.investigations, [investigation.id]: progress }, journal, visited };
    });
    setActiveCase(null);
    setToast('A case closed. A person remembered.');
    if (pending.choice) choose(pending.choice, nextState);
    else if (pending.travel) travel(pending.travel, nextState);
  }

  function toggleSound() {
    if (muted) {
      try {
        if (!audioRef.current) {
          const context = new AudioContext();
          audioRef.current = context;
          const master = context.createGain(); master.gain.value = .028; master.connect(context.destination);
          [130.81, 196, 261.63].forEach((f, i) => {
            const oscillator = context.createOscillator(); oscillator.type = 'sine'; oscillator.frequency.value = f;
            const gain = context.createGain(); gain.gain.value = i === 0 ? .5 : .15;
            oscillator.connect(gain); gain.connect(master); oscillator.start();
            const lfo = context.createOscillator(); lfo.frequency.value = .08 + i * .03;
            const lfoGain = context.createGain(); lfoGain.gain.value = .08;
            lfo.connect(lfoGain); lfoGain.connect(gain.gain); lfo.start();
          });
        }
        void audioRef.current.resume(); setMuted(false);
      } catch { setToast('Ambient sound is unavailable in this browser.'); }
    } else { void audioRef.current?.suspend(); setMuted(true); }
  }

  function exportSave() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(game, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'lady-supine-save.json'; a.click(); URL.revokeObjectURL(url);
    setToast('Your time, safely tucked into a file.');
  }

  async function importSave(file?: File) {
    if (!file) return;
    try {
      const save = JSON.parse(await file.text());
      if (!isGameSave(save) || !SCENES[save.scene]) throw new Error('Invalid save');
      setGame({ ...freshGame(), ...save, investigations: save.investigations || {} }); setEndDismissed(false); setPanel(null); setToast('Welcome back. Your time was waiting.');
    } catch { setToast('That file is not a valid Lady Supine save.'); }
  }

  const portraits: Record<string, string> = { 'the gatekeeper': 'gatekeeper', 'gatekeeper': 'gatekeeper', 'lady supine': 'supine', 'supine': 'supine', 'pip': 'pip', 'ada': 'ada', 'brindle': 'brindle', 'dr. second': 'doctor', 'doctor': 'doctor', 'doctor meridian': 'doctor' };
  const portrait = portraits[scene.speaker.toLowerCase()] || (scene.speaker.toLowerCase().includes('doctor') ? 'doctor' : null);
  const objectivesDone = quest?.steps.filter(s => game.flags.includes(s.flag)).length || 0;
  const firstOpenObjective = quest?.steps.findIndex(s => !game.flags.includes(s.flag)) ?? 0;
  const visibleQuestSteps = quest?.steps.slice(firstOpenObjective < 0 ? Math.max(0, quest.steps.length - 3) : firstOpenObjective, firstOpenObjective < 0 ? undefined : firstOpenObjective + 3);
  const openCase = INVESTIGATIONS.find(investigation => game.investigations?.[investigation.id]?.started && !game.flags.includes(caseFlag(investigation.id)));
  const caseData = INVESTIGATIONS.find(investigation => investigation.id === activeCase?.id);
  const solvedCaseChallenges = Object.values(game.investigations || {}).reduce((total, progress) => total + Object.values(progress.challenges).filter(challenge => challenge.solved).length, 0);

  return <div className={`app ${largeText ? 'large-text' : ''}`}>
    <header className="site-header">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setPanel(null); }} aria-label="Lady Supine, return to the story">
        <img src={artUrl('gate-mark')} alt="" className="brand-mark" />
        <div><span className="brand-name">LADY SUPINE<span className="brand-star">✧</span></span><span className="brand-subtitle">ENTERING THE UNENTERABLE ENTRANCE</span></div>
      </a>
      <nav className="main-nav" aria-label="Adventure tools">
        <button onClick={() => setPanel('journal')} aria-label="Journal"><BookOpen size={17} /><span>Journal</span></button>
        <button onClick={() => setPanel('map')} aria-label="The land"><Map size={17} /><span>The land</span></button>
        <button onClick={() => setPanel('pockets')} aria-label="Pockets" className="pockets-button"><Bookmark size={16} /><span>Pockets</span>{game.items.length > 0 && <i>{game.items.length}</i>}</button>
        <span className="nav-divider" />
        <button className="icon-button" onClick={toggleSound} aria-label={muted ? 'Turn ambient sound on' : 'Mute ambient sound'} title={muted ? 'Turn ambient sound on' : 'Mute ambient sound'}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
        <button className="icon-button" onClick={() => setPanel('settings')} aria-label="Settings" title="Settings"><Settings2 size={18} /></button>
      </nav>
    </header>

    <main className="game-shell">
      <div className="chapter-heading">
        <div><div className="eyebrow"><span className="chapter-number">ACT {ROMANS[game.act - 1]}</span><span className="small-diamond">◆</span><span>{act?.title || 'The threshold'}</span></div><h1>{location.name}</h1></div>
        <div className="world-note"><Sprout size={17} /><span>Welcome to the Land<br />of Limited Time.</span></div>
      </div>

      <div className="game-layout">
        <section className="story-column" aria-label="The adventure">
          <div className={`scene-stage scene-${location.kind}`} ref={stageRef}>
            <SceneArt kind={location.kind} name={location.name} key={location.kind} />
            <div className="scene-topbar"><span className="scene-location"><Compass size={14} />{location.subtitle}</span><button className="scene-control" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void stageRef.current?.requestFullscreen?.().catch(() => setToast('Full screen is unavailable in this browser.')); }} aria-label="Expand illustration" title="Expand illustration"><Maximize2 size={15} /></button></div>
            <button className="scene-hotspot hotspot-one" onClick={() => setPanel('observe')} aria-label={`Examine ${location.name}`}><span className="hotspot-ring"><Eye size={13} /></span><span className="hotspot-label">Look a little closer</span></button>
            <button className="scene-hotspot hotspot-two" onClick={() => { dialogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); dialogRef.current?.querySelector<HTMLButtonElement>('.choice-button')?.focus(); }} aria-label={`Speak to ${scene.speaker}`}><span className="hotspot-ring"><span>···</span></span><span className="hotspot-label">{scene.speaker}</span></button>
            <div className="scene-caption"><span className="caption-dash" />{location.kind === 'gate' ? 'Some doors open. Some have other ideas.' : location.subtitle}<button onClick={() => setPanel('observe')} aria-label="Observe the scene"><Eye size={15} /></button></div>
            <span className="scene-corner corner-tl" /><span className="scene-corner corner-tr" /><span className="scene-corner corner-bl" /><span className="scene-corner corner-br" />
          </div>

          <div className="dialogue-card" ref={dialogRef} key={scene.id}>
            <div className="portrait-frame">{portrait ? <img src={artUrl(portrait)} alt={scene.speaker} /> : <Feather size={30} strokeWidth={1} />}</div>
            <div className="dialogue-content">
              <div className="speaker-line"><h2>{scene.speaker}</h2><span>{scene.role || 'A voice in the Land of Limited Time'}</span><button onClick={() => { setJournalTab('story'); setPanel('journal'); }} aria-label="Read conversation history" title="Read conversation history"><BookOpen size={14} /></button></div>
              <div className="dialogue-text">{scene.text.map((t, i) => <p key={i}>{t}</p>)}</div>
              <div className="dialogue-choices">{choices.map((choice, i) => {
                const cost = choice.effects?.reduce((sum, e) => sum + (e.time || 0), 0) || 0;
                return <button className={`choice-button ${i === 0 ? 'choice-primary' : ''}`} key={`${scene.id}-${i}`} onClick={() => choose(choice)}><span>{choice.label}</span>{cost < 0 && <small><Clock3 size={11} />{Math.abs(cost)}m</small>}<ArrowRight size={15} /></button>;
              })}{choices.length === 0 && !game.ending && <button className="choice-button choice-primary" onClick={() => setPanel('map')}>See where the road leads<ArrowRight size={15} /></button>}</div>
            </div>
          </div>

          <div className="story-footer"><span><span className="save-dot" />{saveError ? 'Save unavailable — export in settings' : 'Your story is saved as you go'}</span><button onClick={() => setPanel('help')}><CircleHelp size={14} /><span>A little guidance</span></button></div>
        </section>

        <aside className="sidebar" aria-label="Your time and journey">
          <section className={`time-card ${game.time < 600 ? 'time-low' : ''}`}><div className="eyebrow">YOUR BORROWED TIME</div><Timepiece time={game.time} /><div className="time-value">{formatTime(game.time)}<span>MINUTES : SECONDS</span></div><div className="time-card-line" /><p>Spend it beautifully.</p><div className="time-explanation"><Clock3 size={11} />Time passes with your choices.</div></section>
          <section className="quest-card"><div className="eyebrow"><Flag size={12} /> A THREAD TO FOLLOW<span className="quest-count">{objectivesDone}/{quest?.steps.length || 0}</span></div><h2>{quest?.title || 'Find your way onward'}</h2><ol>{visibleQuestSteps?.map(step => <li className={game.flags.includes(step.flag) ? 'completed' : step.flag === quest?.steps[firstOpenObjective]?.flag ? 'current' : ''} key={step.flag}><span className="quest-check">{game.flags.includes(step.flag) ? <Check size={11} /> : <span />}</span><span>{step.text}</span></li>)}</ol><button className="text-link" onClick={() => setPanel('journal')}>Open your journal<ArrowRight size={14} /></button></section>
          {openCase && <button className="open-case-card" onClick={() => setActiveCase({ id: openCase.id })}><div className="eyebrow"><BookOpen size={12} /> A CASE STILL OPEN</div><strong>{openCase.title}</strong><span>{Object.values(game.investigations[openCase.id].challenges).filter(challenge => challenge.solved).length} of 6 threads resolved<ArrowRight size={13} /></span></button>}
          <section className="companions-card"><div className="eyebrow">A LITTLE COMPANY</div><div className="companion-row"><div className="companion-group">{companionCount ? companions.map(companion => <div className="companion-avatar met" key={companion.id} title={companion.name}><img src={artUrl(companion.id)} alt={companion.name} /></div>) : <div className="companion-avatar"><img src={artUrl('pip')} alt="" /></div>}</div><div className="companion-text"><p>{companionCount > 1 ? 'Friends, for the road.' : companionCount ? 'A friend, for the road.' : 'Friends you haven’t met. Yet.'}</p><span>{companionCount ? 'No one is only the time they have.' : 'There is kindness in this strange land.'}</span></div></div></section>
          <button className="land-button" onClick={() => setPanel('map')}><Map size={18} /><span>Unfold the land</span><ChevronRight size={15} /></button>
        </aside>
      </div>

      <footer className="journey-footer"><div className="journey-progress" aria-label={`Act ${game.act} of six`}>{ACTS.map((a, i) => <button key={a.title} className={i + 1 <= game.act ? 'reached' : ''} onClick={() => { setJournalTab('notes'); setPanel('journal'); }} title={`Act ${ROMANS[i]}: ${a.title}`} aria-label={`Act ${ROMANS[i]}: ${a.title}`}><span>{i + 1 < game.act ? <Check size={10} /> : i + 1}</span>{i + 1 === game.act && <span className="progress-act">{a.title}</span>}</button>)}</div><span className="footer-inscription">A peculiar tale of time &amp; tenderness <span>✧</span></span></footer>
    </main>

    {panel && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setPanel(null); }}><section className={`overlay-card panel-${panel}`} role="dialog" aria-modal="true" aria-labelledby="panel-title"><button className="overlay-close icon-button" onClick={() => setPanel(null)} aria-label="Close"><X size={21} /></button>
      {panel === 'map' && <><div className="eyebrow">EVERY ROAD COSTS SOMETHING. WALKING HERE IS FREE.</div><h2 id="panel-title">The Land of Limited Time</h2><p className="panel-intro">A small kingdom with a very large opinion of itself. Choose a place to visit.</p><div className="world-map"><svg viewBox="0 0 900 430" aria-hidden="true"><defs><pattern id="mapGrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#7a8162" strokeWidth=".4" opacity=".18" /></pattern></defs><rect width="900" height="430" fill="url(#mapGrid)" /><path d="M-30 270Q180 180 265 290T580 265T940 190" fill="none" stroke="#9cafa0" strokeWidth="34" opacity=".45" /><path d="M40 400Q160 240 300 160T640 95T850 250" fill="none" stroke="#8a8969" strokeWidth="2" strokeDasharray="5 7" opacity=".5" /><path d="M240 420Q400 310 470 250T650 95" fill="none" stroke="#8a8969" strokeWidth="2" strokeDasharray="5 7" opacity=".5" /><text x="560" y="362" fill="#788577" fontSize="15" fontFamily="serif" fontStyle="italic" transform="rotate(-7 560 362)">The waters of tasteful scarcity</text></svg>{LOCATIONS.map((l, i) => { const unlocked = game.unlocked.includes(l.id); return <button key={l.id} style={{ left: `${Math.min(90, Math.max(9, l.x))}%`, top: `${Math.min(86, Math.max(12, l.y))}%` }} className={`map-location ${unlocked ? 'unlocked' : 'locked'} ${l.id === scene.location ? 'map-current' : ''}`} disabled={!unlocked} onClick={() => travel(l.id)} title={unlocked ? `Travel to ${l.name}` : 'Discover a road here through the story'}><span className="map-location-icon">{l.id === scene.location ? <Flag size={17} /> : l.kind === 'lake' ? <Sprout size={17} /> : l.kind === 'castle' ? <Sparkles size={17} /> : l.kind === 'hospital' ? <Heart size={17} /> : <Compass size={17} />}</span><span>{l.name}</span>{!unlocked && <small>Undiscovered</small>}</button>; })}<span className="map-compass">N<br />✦</span></div><div className="map-legend"><span><i /> A road you know</span><span><i className="legend-locked" /> A road still to find</span><span><Flag size={12} /> You are here</span></div></>}

      {panel === 'journal' && <><div className="eyebrow">THE LIBRARY OF YOUR TIME WELL SPENT</div><h2 id="panel-title">A traveller’s journal</h2><div className="panel-tabs"><button className={journalTab === 'notes' ? 'active' : ''} onClick={() => setJournalTab('notes')}>Threads &amp; chapters</button><button className={journalTab === 'story' ? 'active' : ''} onClick={() => setJournalTab('story')}>Words worth keeping <span>{game.journal.length}</span></button><button className={journalTab === 'casebooks' ? 'active' : ''} onClick={() => setJournalTab('casebooks')}>Casebooks <span>{INVESTIGATIONS.filter(entry => game.flags.includes(caseFlag(entry.id))).length}/6</span></button></div>{journalTab === 'notes' ? <div className="journal-chapters">{ACTS.map((a, i) => <article className={i + 1 <= game.act ? 'journal-chapter reached' : 'journal-chapter'} key={a.title}><span className="journal-roman">{ROMANS[i]}</span><div><div className="eyebrow">{i + 1 === game.act ? 'YOUR CURRENT CHAPTER' : i + 1 < game.act ? 'A CHAPTER WELL SPENT' : 'A CHAPTER YET TO COME'}<span>{a.duration}</span></div><h3>{a.title}</h3><p>{a.subtitle}</p>{i + 1 <= game.act && <ul>{journeyQuest(i + 1)?.steps.map(s => <li key={s.flag} className={game.flags.includes(s.flag) ? 'done' : ''}>{game.flags.includes(s.flag) ? <CheckCheck size={14} /> : <span className="journal-check" />}{s.text}</li>)}</ul>}</div></article>)}</div> : journalTab === 'casebooks' ? <div className="casebook-list">{INVESTIGATIONS.map(investigation => {
  const saved = game.investigations?.[investigation.id];
  const finished = game.flags.includes(caseFlag(investigation.id));
  const count = saved ? Object.values(saved.challenges).filter(challenge => challenge.solved).length : 0;
  return <article key={investigation.id} className={`casebook-entry ${saved?.started ? 'discovered' : ''}`}><span className="journal-roman">{ROMANS[investigation.act - 1]}</span><div><div className="eyebrow">{finished ? 'A PERSON REMEMBERED' : saved?.started ? 'A THREAD STILL OPEN' : 'A CASE YET TO FIND'}<span>{count}/6</span></div><h3>{investigation.title}</h3><p>{investigation.subtitle}</p>{saved?.started && <button className="text-link" onClick={() => { setPanel(null); setActiveCase({ id: investigation.id }); }}>{finished ? 'Read this case again' : 'Pick up the thread'}<ArrowRight size={13} /></button>}</div></article>;
})}</div> : <div className="conversation-history">{game.journal.length ? [...game.journal].reverse().map(j => <article key={j.scene}><div className="eyebrow">{j.speaker}</div>{j.text.split('\n\n').map((t, i) => <p key={i}>{t}</p>)}</article>) : <div className="empty-state"><Feather size={40} strokeWidth={1} /><h3>The first page is always empty.</h3><p>Your conversations will be kept here as your journey unfolds.</p></div>}</div>}<div className="journal-stats"><span><BookOpen size={14} />{game.visited.length} moments discovered</span><span><Sparkles size={14} />{game.solved.length + solvedCaseChallenges} puzzles solved</span><span><Clock3 size={14} />{Math.floor(game.playSeconds / 60)} minutes together</span></div></>}

      {panel === 'pockets' && <><div className="eyebrow">SMALL THINGS WITH LARGE POSSIBILITIES</div><h2 id="panel-title">In your pockets</h2><p className="panel-intro">The things you carry remember where you’ve been. Useful objects appear in the story when they’re needed.</p>{game.items.length ? <div className="inventory-grid">{game.items.map(id => { const item = ITEMS[id]; return <article className="inventory-item" key={id}><span className="item-icon">{item?.icon || '✦'}</span><h3>{item?.name || id}</h3><p>{item?.description || 'Something worth holding on to.'}</p></article>; })}</div> : <div className="empty-state"><Bookmark size={45} strokeWidth={1} /><h3>Empty pockets. An open road.</h3><p>It’s all right. The best things you’ll find won’t fit in them.</p></div>}<button className="button-solid" onClick={() => setPanel(null)}>Back to the road<ArrowRight size={15} /></button></>}

      {panel === 'observe' && <><div className="eyebrow"><Eye size={13} /> A MOMENT TO LOOK</div><h2 id="panel-title">{location.name}</h2><img className="observation-art" src={artUrl(location.kind)} alt="" /><p className="observation-text">{OBSERVATIONS[location.kind]}</p><p className="observation-footnote">Taking a moment to notice costs you nothing.</p><button className="button-solid" onClick={() => setPanel(null)}>Return to the story<ArrowRight size={15} /></button></>}

      {panel === 'help' && <><div className="eyebrow">FOR WHEN THE ROAD CURLS BACK ON ITSELF</div><h2 id="panel-title">A little guidance</h2><p className="panel-intro">This is an adventure to be read, wandered through, and puzzled over. There’s no need to hurry.</p><div className="guidance-grid"><article><Clock3 size={22} /><h3>Your borrowed time</h3><p>Time changes through story choices, never while you read. Choices that cost time show their price. If it runs out, the hospital will offer a way onward.</p></article><article><Map size={22} /><h3>Follow a thread</h3><p>Your current objectives live beside the story. Unfold the land to visit places you’ve discovered. Revisit people: their stories change as yours does.</p></article><article><Sparkles size={22} /><h3>A curious puzzle</h3><p>Clues are always inside the puzzle. Ask for hints whenever you like. After three hints, an assisted solution is available.</p></article><article><Bookmark size={22} /><h3>Make a little room</h3><p>Objects and memories unlock new choices. Six casebooks let you investigate what the kingdom has concealed. Their clues and unfinished boards save as you go.</p></article></div><div className="help-duration"><Hourglass size={23} /><div><strong>A tale in six acts</strong><p>A full journey includes six investigations and 52 puzzles, paced for roughly five hours with unhurried reading and unaided deductions. Hints make the journey shorter. Every clue, board, and conversation saves automatically.</p></div></div><div className="keyboard-hints"><span><kbd>M</kbd> The land</span><span><kbd>J</kbd> Journal</span><span><kbd>I</kbd> Pockets</span><span><kbd>Esc</kbd> Close</span></div></>}

      {panel === 'settings' && <><div className="eyebrow">MAKE YOURSELF AT HOME</div><h2 id="panel-title">A few small comforts</h2><div className="settings-row"><div><h3>Ambient sound</h3><p>A quiet chord for a peculiar land.</p></div><button className={`toggle ${!muted ? 'on' : ''}`} aria-label="Ambient sound" aria-pressed={!muted} onClick={toggleSound}><span /></button></div><div className="settings-row"><div><h3>A little larger type</h3><p>More room for every word.</p></div><button className={`toggle ${largeText ? 'on' : ''}`} aria-label="Larger text" aria-pressed={largeText} onClick={() => setLargeText(v => !v)}><span /></button></div><div className="settings-save"><h3>Keep your place</h3><p>Your progress is saved in this browser. Export a copy to take your story elsewhere.</p><div><button className="button-outline" onClick={exportSave}><Download size={15} />Export save</button><label className="button-outline upload-label"><Upload size={15} />Import save<input type="file" accept="application/json,.json" onChange={e => { void importSave(e.target.files?.[0]); e.target.value = ''; }} /></label></div></div><div className="settings-reset"><h3>Begin again</h3><p>Every entrance deserves a second first impression.</p>{resetConfirm ? <div className="reset-confirm"><p>This replaces your saved journey. Export it first if you’d like to keep it.</p><button className="button-outline" onClick={() => setResetConfirm(false)}>Keep my place</button><button className="button-solid" onClick={() => { setGame(freshGame()); setResetConfirm(false); setEndDismissed(false); setPanel(null); setToast('Once more, the unenterable entrance.'); }}>Start a new journey</button></div> : <button className="text-link" onClick={() => setResetConfirm(true)}><RotateCcw size={13} />Start a new journey</button>}</div><p className="art-note">Make yourself at home. Every small comfort counts.</p></>}
    </section></div>}

    {puzzle?.puzzle && <PuzzleModal puzzleId={puzzle.puzzle} onClose={() => setPuzzle(null)} onSolve={() => { setGame(g => transition(g, puzzle, puzzle.puzzle)); setPuzzle(null); setToast('A small impossibility, made possible.'); }} />}

    {activeCase && caseData && <Suspense fallback={<div className="case-loading" role="status"><div className="case-loading-card"><div className="eyebrow">A MOMENT, BORROWED</div><div className="cigarillo-loader" aria-hidden="true"><span className="cigarillo-filter" /><span className="cigarillo-paper" /><span className="cigarillo-ember" /><span className="cigarillo-smoke">⌁</span></div><p>The casebook is finding its page.</p><button className="text-link" onClick={() => setActiveCase(null)}>Return to the road</button></div></div>}><InvestigationModal key={caseData.id} investigation={{ ...caseData, location: LOCATIONS.find(place => place.id === caseData.location)?.name || caseData.location }} progress={game.investigations?.[caseData.id] || emptyInvestigation()} onProgress={progress => saveCaseProgress(caseData.id, progress)} onClose={() => setActiveCase(null)} onComplete={finishCase} /></Suspense>}

    {game.time <= 0 && !puzzle && !activeCase && !panel && !game.ending && <div className="overlay"><section className="overlay-card recovery-card" role="dialog" aria-modal="true" aria-labelledby="recovery-title"><Moon size={35} strokeWidth={1} /><div className="eyebrow">THE HOSPITAL FOR THOSE OUT OF TIME</div><h2 id="recovery-title">Even a clock needs a rest.</h2><p>A nurse drapes a blanket over your shoulders. “Out of time isn’t out of hope,” she says. “Take twenty minutes. Pay it forward when you can.”</p><button className="button-solid" onClick={() => { setGame(g => ({ ...g, time: 20 * 60, flags: [...new Set([...g.flags, 'hospital_debt'])] })); setToast('Twenty minutes, and a kindness to remember.'); }}>Accept a little more time<Heart size={15} /></button></section></div>}

    {game.ending && !endDismissed && <div className="overlay"><section className="overlay-card ending-card" role="dialog" aria-modal="true" aria-labelledby="ending-title"><img src={artUrl('gate-mark')} alt="" /><div className="eyebrow">A STORY WELL SPENT</div><h2 id="ending-title">{game.ending === 'commons' ? 'An ending with room in it.' : game.ending === 'stay' ? 'A future you can touch.' : 'The unmeasured country.'}</h2>{scene.text.map((text, i) => <p key={i}>{text}</p>)}<blockquote>“For we all wish to see<br />The best we can be<br />Before our heads<br />Hit the pillow.”</blockquote><p className="ending-stats">{game.solved.length + solvedCaseChallenges} impossibilities made possible · {game.visited.length} moments kept</p><button className="button-solid" onClick={() => { setEndDismissed(true); setPanel('journal'); }}>Keep the story<Feather size={15} /></button></section></div>}

    {toast && <div className="toast" role="status"><Sparkles size={16} /><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={14} /></button></div>}
  </div>;
}

export default App;
