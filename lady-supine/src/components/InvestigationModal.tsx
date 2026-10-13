import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { challengeSolved, toggleCircuit } from '../data/investigationTypes';
import type { ChallengeProgress, Investigation, InvestigationBoard, InvestigationProgress } from '../data/investigationTypes';
import '../styles/investigations.css';

type Props = {
  investigation: Investigation;
  progress: InvestigationProgress;
  onProgress: (progress: InvestigationProgress) => void;
  onComplete: () => void;
  onClose: () => void;
};
type BoardProps = {
  board: InvestigationBoard;
  state: ChallengeProgress;
  change: (update: Partial<ChallengeProgress>) => void;
  feedback: (message: string) => void;
};

function initialChallenge(board: InvestigationBoard): ChallengeProgress {
  return {
    answers: {}, hints: 0, solved: false,
    ...(board.kind === 'sequence' ? { order: board.cards.map(card => card.id) } : {}),
    ...(board.kind === 'route' ? { route: [board.start] } : {}),
    ...(board.kind === 'circuit' ? { lamps: [...board.initial] } : {}),
  };
}

function ArrowMark() {
  return <svg className="inv-arrow-mark" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 12 12 4M4.5 4H12v7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function CheckMark() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function LeafMark() {
  return <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M10 26c0-7 2-12 10-20M11 21C4 18 5 12 7 9c5 1 10 7 4 12Zm2-5c-2-7 3-12 9-12 2 7-3 12-9 12Zm3-4c7-2 12 0 13 4-4 6-13 6-13-4Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function BookMark({ children = <LeafMark /> }: { children?: ReactNode }) {
  return <div className="inv-book-mark" aria-hidden="true">{children}</div>;
}

function Paragraphs({ paragraphs }: { paragraphs: string[] }) {
  return <div className="inv-prose">{paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>;
}

function LedgerBoard({ board, state, change }: BoardProps & { board: Extract<InvestigationBoard, { kind: 'ledger' }> }) {
  return <div className="inv-ledger-wrap"><table className="inv-ledger"><caption>Complete every entry using the evidence.</caption><thead><tr><th scope="col">Entry</th>{board.columns.map(column => <th key={column.id} scope="col">{column.title}</th>)}</tr></thead><tbody>{board.rows.map(row => <tr key={row.id}><th scope="row">{row.title}</th>{board.columns.map(column => {
    const key = `${row.id}.${column.id}`;
    return <td key={column.id}><select aria-label={`${row.title} — ${column.title}`} value={state.answers[key] || ''} onChange={event => change({ answers: { ...state.answers, [key]: event.target.value } })}><option value="">Choose…</option>{column.options.map(option => <option key={option} value={option}>{option}</option>)}</select></td>;
  })}</tr>)}</tbody></table></div>;
}

function CipherBoard({ board, state, change }: BoardProps & { board: Extract<InvestigationBoard, { kind: 'cipher' }> }) {
  return <><div className="inv-inscription"><span className="inv-tiny-label">The inscription, as found</span><pre>{board.inscription}</pre></div><div className="inv-answer-fields">{board.fields.map(field => <label key={field.id}><span>{field.label}</span><input type="text" autoComplete="off" spellCheck={false} value={state.answers[field.id] || ''} onChange={event => change({ answers: { ...state.answers, [field.id]: event.target.value } })} /></label>)}</div><p className="inv-board-note">Capital letters and punctuation are treated kindly.</p></>;
}

function BalanceBoard({ board, state, change }: BoardProps & { board: Extract<InvestigationBoard, { kind: 'balance' }> }) {
  return <><div className="inv-equations"><span className="inv-tiny-label">The conditions</span><ol>{board.equations.map((equation, index) => <li key={index}>{equation}</li>)}</ol></div><div className="inv-answer-fields inv-number-fields">{board.fields.map(field => <label key={field.id}><span>{field.label}</span><div><input aria-label={field.label} type="number" inputMode="numeric" min={field.min ?? 0} max={field.max} step="1" value={state.answers[field.id] ?? ''} onChange={event => change({ answers: { ...state.answers, [field.id]: event.target.value } })} />{field.suffix && <small>{field.suffix}</small>}</div></label>)}</div></>;
}

function SequenceBoard({ board, state, change }: BoardProps & { board: Extract<InvestigationBoard, { kind: 'sequence' }> }) {
  const order = state.order || board.cards.map(card => card.id);
  function move(index: number, direction: number) {
    const next = [...order];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    change({ order: next });
  }
  return <><p className="inv-board-note">Arrange the cards from first to last. Use the arrows to move a card.</p><ol className="inv-sequence">{order.map((id, index) => {
    const card = board.cards.find(item => item.id === id);
    if (!card) return null;
    return <li key={id}><span className="inv-card-position">{String(index + 1).padStart(2, '0')}</span><div><strong>{card.title}</strong><p>{card.description}</p></div><div className="inv-card-controls"><button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${card.title} earlier`}>↑</button><button type="button" disabled={index === order.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${card.title} later`}>↓</button></div></li>;
  })}</ol></>;
}

function RouteBoard({ board, state, change, feedback }: BoardProps & { board: Extract<InvestigationBoard, { kind: 'route' }> }) {
  const path = state.route || [board.start];
  const current = path.at(-1) ?? board.start;
  const visitedWaypoints = board.waypoints.filter(waypoint => path.includes(waypoint)).length;
  function step(cell: number) {
    if (board.blocked.includes(cell)) return;
    if (path.includes(cell)) { feedback('You have already walked through that square. Undo a step to retrace your thought.'); return; }
    const distance = Math.abs(Math.floor(cell / board.width) - Math.floor(current / board.width)) + Math.abs(cell % board.width - current % board.width);
    if (distance !== 1) { feedback('Choose a square beside your current position. The path moves horizontally or vertically.'); return; }
    if (path.length - 1 >= board.maxSteps) { feedback('That would exceed the permitted distance. Undo a step or begin the route again.'); return; }
    if (board.waypoints.includes(cell) && cell !== board.waypoints[visitedWaypoints]) { feedback(`Visit checkpoint ${visitedWaypoints + 1} before this one.`); return; }
    change({ route: [...path, cell] });
  }
  return <><div className="inv-route-summary"><span><strong>{path.length - 1}</strong> / {board.maxSteps} steps</span><span>{visitedWaypoints} / {board.waypoints.length} checkpoints</span></div><div className="inv-route-grid" style={{ gridTemplateColumns: `repeat(${board.width}, minmax(0, 1fr))` }} aria-label="Route map">{Array.from({ length: board.width * board.height }, (_, cell) => {
    const blocked = board.blocked.includes(cell);
    const pathIndex = path.indexOf(cell);
    const waypointIndex = board.waypoints.indexOf(cell);
    const isStart = cell === board.start;
    const isEnd = cell === board.end;
    const name = `Row ${Math.floor(cell / board.width) + 1}, column ${cell % board.width + 1}${blocked ? ', blocked' : ''}${isStart ? ', start' : ''}${isEnd ? ', destination' : ''}${waypointIndex >= 0 ? `, checkpoint ${waypointIndex + 1}` : ''}${cell === current ? ', current position' : pathIndex >= 0 ? ', visited' : ''}`;
    return <button key={cell} type="button" disabled={blocked} aria-label={name} aria-pressed={pathIndex >= 0} onClick={() => step(cell)} className={`inv-route-cell ${blocked ? 'inv-blocked' : ''} ${pathIndex >= 0 ? 'inv-visited' : ''} ${current === cell ? 'inv-current' : ''} ${waypointIndex >= 0 ? 'inv-waypoint' : ''}`}><span aria-hidden="true">{blocked ? '×' : isStart ? 'S' : isEnd ? 'E' : waypointIndex >= 0 ? `◆${waypointIndex + 1}` : pathIndex >= 0 ? '·' : ''}</span>{pathIndex > 0 && <small aria-hidden="true">{pathIndex}</small>}</button>;
  })}</div><div className="inv-route-legend"><span>S Start</span><span>E Destination</span><span>◆ Checkpoint</span><span>× Impassable</span></div><p className="inv-board-note">Walk through checkpoints in numbered order. No diagonal steps, and no square twice.</p><button className="inv-text-button" type="button" disabled={path.length <= 1} onClick={() => change({ route: path.slice(0, -1) })}>Undo the last step ↶</button></>;
}

function CircuitBoard({ board, state, change }: BoardProps & { board: Extract<InvestigationBoard, { kind: 'circuit' }> }) {
  const lamps = state.lamps || board.initial;
  return <><p className="inv-board-note">Touching a lamp reverses it and its neighbours above, below, left, and right. Make the board match the small pattern.</p><div className="inv-circuit-layout"><div className="inv-circuit-grid" style={{ gridTemplateColumns: `repeat(${board.size}, minmax(0, 1fr))` }} aria-label="Circuit lamps">{lamps.map((lit, cell) => <button type="button" key={cell} aria-label={`Lamp row ${Math.floor(cell / board.size) + 1}, column ${cell % board.size + 1}, ${lit ? 'lit' : 'dark'}`} aria-pressed={lit} onClick={() => change({ lamps: toggleCircuit(lamps, cell, board.size) })} className={lit ? 'inv-lamp-lit' : ''}><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">{lit ? <path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8Z" fill="currentColor" /> : <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.4" fill="none" />}</svg></button>)}</div><div className="inv-target"><span className="inv-tiny-label">Required pattern</span><div className="inv-target-grid" style={{ gridTemplateColumns: `repeat(${board.size}, 1fr)` }} role="img" aria-label={`Target pattern, row by row: ${board.target.map(lit => lit ? 'lit' : 'dark').join(', ')}`}>{board.target.map((lit, cell) => <span key={cell} className={lit ? 'inv-target-lit' : ''} />)}</div><p>{board.target.filter(Boolean).length} lamps lit</p></div></div></>;
}

function Board(props: BoardProps) {
  const { board } = props;
  switch (board.kind) {
    case 'ledger': return <LedgerBoard {...props} board={board} />;
    case 'cipher': return <CipherBoard {...props} board={board} />;
    case 'balance': return <BalanceBoard {...props} board={board} />;
    case 'sequence': return <SequenceBoard {...props} board={board} />;
    case 'route': return <RouteBoard {...props} board={board} />;
    case 'circuit': return <CircuitBoard {...props} board={board} />;
  }
}

function assistedState(board: InvestigationBoard, state: ChallengeProgress): ChallengeProgress {
  const next = { ...state, solved: false };
  if (board.kind === 'ledger' || board.kind === 'cipher' || board.kind === 'balance') next.answers = { ...board.solution };
  if (board.kind === 'sequence') next.order = [...board.solution];
  if (board.kind === 'route') next.route = [...board.solution];
  if (board.kind === 'circuit') next.lamps = board.solution.reduce((lamps, cell) => toggleCircuit(lamps, cell, board.size), [...board.initial]);
  return next;
}

export default function InvestigationModal({ investigation, progress, onProgress, onComplete, onClose }: Props) {
  const [tab, setTab] = useState<'account' | 'evidence' | 'board'>('account');
  const [review, setReview] = useState(() => progress.finished && progress.stage < investigation.challenges.length);
  const [message, setMessage] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const latestRef = useRef(progress);
  const closeHandlerRef = useRef(onClose);
  const completionRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  latestRef.current = progress;
  closeHandlerRef.current = onClose;
  const stage = Math.max(0, Math.min(progress.stage, investigation.challenges.length));
  const challenge = investigation.challenges[stage];
  const state = challenge ? progress.challenges[challenge.id] || initialChallenge(challenge.board) : null;
  const conclusion = stage >= investigation.challenges.length;
  const solvedCount = investigation.challenges.filter(item => progress.challenges[item.id]?.solved).length;

  useEffect(() => { completionRef.current = false; setTab('account'); setReview(progress.finished && progress.stage < investigation.challenges.length); setMessage(''); }, [investigation.id]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); closeHandlerRef.current(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]') || []).filter(element => element.getClientRects().length > 0);
      const first = controls[0]; const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, []);

  function commit(update: (current: InvestigationProgress) => InvestigationProgress) {
    const next = update(latestRef.current);
    latestRef.current = next;
    onProgress(next);
  }
  function change(update: Partial<ChallengeProgress>) {
    if (!challenge) return;
    commit(current => ({ ...current, challenges: { ...current.challenges, [challenge.id]: { ...(current.challenges[challenge.id] || initialChallenge(challenge.board)), ...update } } }));
    setMessage('');
  }
  function begin() {
    const first = investigation.challenges[0];
    commit(current => ({ ...current, started: true, stage: 0, challenges: { ...current.challenges, ...(first ? { [first.id]: current.challenges[first.id] || initialChallenge(first.board) } : {}) } }));
    setTab('account');
  }
  function verify() {
    if (!challenge) return;
    const latest = latestRef.current.challenges[challenge.id] || initialChallenge(challenge.board);
    if (challengeSolved(challenge.board, latest)) { change({ solved: true }); setReview(false); setTab('account'); }
    else setMessage('The evidence does not quite support this deduction. Check each condition; your notes are safe, and you can ask for a hint.');
  }
  function nextStage() {
    const next = stage + 1;
    const nextChallenge = investigation.challenges[next];
    commit(current => ({ ...current, stage: next, challenges: { ...current.challenges, ...(nextChallenge ? { [nextChallenge.id]: current.challenges[nextChallenge.id] || initialChallenge(nextChallenge.board) } : {}) } }));
    setTab('account'); setReview(Boolean(nextChallenge && latestRef.current.challenges[nextChallenge.id]?.solved)); setMessage('');
    dialogRef.current?.scrollTo({ top: 0 });
  }
  function complete() {
    if (completionRef.current) return;
    completionRef.current = true;
    commit(current => ({ ...current, finished: true, stage: investigation.challenges.length }));
    onComplete();
  }
  function goTo(index: number) {
    if (!progress.started || !progress.challenges[investigation.challenges[index]?.id]?.solved && index !== stage) return;
    commit(current => ({ ...current, stage: index }));
    setTab('account'); setReview(true); setMessage('');
  }
  function showBoard() {
    if (window.matchMedia('(max-width: 760px)').matches) setTab('board');
    else dialogRef.current?.querySelector<HTMLElement>('.inv-deduction input, .inv-deduction select, .inv-deduction button:not([disabled])')?.focus();
  }
  function tabKeydown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')).filter(item => item.getClientRects().length > 0);
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    event.preventDefault(); next?.click(); next?.focus();
  }
  const boardNames: Record<InvestigationBoard['kind'], string> = { ledger: 'An account to reconcile', cipher: 'Words beneath words', balance: 'A matter of fair shares', sequence: 'Put the events in order', route: 'Find a way through', circuit: 'Let the right lights shine' };

  return <div className="inv-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="inv-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} ref={dialogRef}>
    <header className="inv-header"><div><span className="inv-eyebrow">Casebook {String(investigation.act).padStart(2, '0')} · {investigation.location}</span><h2 id={titleId}>{investigation.title}</h2><p id={descriptionId}>{investigation.subtitle}</p></div><button type="button" className="inv-close" ref={closeRef} onClick={onClose} aria-label="Close casebook; keep all notes">×</button></header>
    <nav className="inv-stage-progress" aria-label="Investigation stages">{investigation.challenges.map((item, index) => {
      const done = Boolean(progress.challenges[item.id]?.solved);
      return <button key={item.id} type="button" onClick={() => goTo(index)} disabled={!progress.started || (!done && index !== stage)} aria-current={progress.started && index === stage && !conclusion ? 'step' : undefined} aria-label={`Stage ${index + 1}: ${item.title}${done ? ', solved' : index === stage ? ', current' : ', ahead'}`} className={`${done ? 'inv-stage-done' : ''} ${progress.started && index === stage && !conclusion ? 'inv-stage-current' : ''}`}><span>{done ? <CheckMark /> : String(index + 1).padStart(2, '0')}</span><small>{item.title}</small></button>;
    })}</nav>
    {!progress.started ? <section className="inv-opening"><BookMark /><span className="inv-eyebrow">There is more here than meets the eye</span><h3>A thread worth following.</h3><Paragraphs paragraphs={investigation.premise} /><div className="inv-opening-bottom"><span>{investigation.challenges.length} connected deductions<br />Every note is kept as you make it.</span><button className="inv-primary" type="button" onClick={begin}>Open the casebook <ArrowMark /></button></div></section> : conclusion ? <section className="inv-opening inv-conclusion"><BookMark><CheckMark /></BookMark><span className="inv-eyebrow">The pieces belong together</span><h3>What this changes.</h3><Paragraphs paragraphs={investigation.conclusion} /><button className="inv-primary" type="button" onClick={complete}>Return to the story <ArrowMark /></button></section> : challenge && state && <>
      <div className="inv-thread-heading"><div><span className="inv-eyebrow">Thread {String(stage + 1).padStart(2, '0')} of {String(investigation.challenges.length).padStart(2, '0')}</span><h3>{challenge.title}</h3></div><span className="inv-thread-type">{boardNames[challenge.board.kind]}</span></div>
      {state.solved && !review ? <section className="inv-resolution"><span className="inv-resolution-mark" aria-hidden="true"><CheckMark /></span><span className="inv-eyebrow">A deduction, carefully made</span><Paragraphs paragraphs={challenge.resolution} /><div className="inv-board-actions"><button className="inv-primary" type="button" onClick={nextStage}>{stage === investigation.challenges.length - 1 ? 'Read what this changes' : 'Follow the thread'} <ArrowMark /></button><button className="inv-text-button" type="button" onClick={() => { setReview(true); setTab('account'); }}>Revisit the account and evidence</button></div></section> : <>
        <div className="inv-reading-tabs" role="tablist" aria-label="Casebook pages" onKeyDown={tabKeydown}><button type="button" role="tab" aria-selected={tab === 'account'} onClick={() => setTab('account')}>The account</button><button type="button" role="tab" aria-selected={tab === 'evidence'} onClick={() => setTab('evidence')}>Evidence <small>{challenge.evidence.length}</small></button><button type="button" role="tab" aria-selected={tab === 'board'} className="inv-board-tab" onClick={() => setTab('board')}>Your deduction</button></div>
        <div className={`inv-workspace inv-tab-${tab}`}>
          <section className="inv-reading" aria-label={tab === 'evidence' ? 'Supporting evidence' : 'The account'} tabIndex={0}>
            {tab === 'evidence' ? <div className="inv-evidence">{challenge.evidence.map((evidence, index) => <article key={index}><span className="inv-document-number">DOCUMENT {String(index + 1).padStart(2, '0')}</span><h4>{evidence.title}</h4>{evidence.text.split('\n\n').map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}</article>)}<button type="button" className="inv-text-button" onClick={showBoard}>Make a deduction <ArrowMark /></button></div> : <><Paragraphs paragraphs={challenge.narrative} /><button type="button" className="inv-text-button" onClick={() => setTab('evidence')}>Lay out the evidence <ArrowMark /></button></>}
          </section>
          <section className="inv-deduction" aria-label="Your deduction"><div className="inv-task"><span className="inv-tiny-label">The question before you</span><p>{challenge.task}</p></div><fieldset className="inv-board-fieldset" disabled={state.solved}><Board board={challenge.board} state={state} change={change} feedback={setMessage} /></fieldset>{state.solved ? <div className="inv-review-footer"><p>✓ This thread is understood. Your completed deduction is kept here.</p><button className="inv-primary" type="button" onClick={() => setReview(false)}>Read the resolution <ArrowMark /></button></div> : <><div className="inv-board-actions"><button type="button" className="inv-primary" onClick={verify}>Check the deduction <ArrowMark /></button><button type="button" className="inv-text-button" onClick={() => change({ ...initialChallenge(challenge.board), hints: state.hints })}>Start the board again</button></div><div className="inv-feedback" role="status" aria-live="polite">{message}</div><div className="inv-hints"><button type="button" className="inv-hint-button" disabled={state.hints >= 3} onClick={() => change({ hints: Math.min(3, state.hints + 1) })}><span aria-hidden="true">✧</span>{state.hints === 0 ? 'A gentle hint' : state.hints < 3 ? 'A little more help' : 'All hints unfolded'}<small>{state.hints}/3</small></button><div aria-live="polite">{challenge.hints.slice(0, state.hints).map((hint, index) => <p key={index}><span>{index + 1}.</span> {hint}</p>)}</div>{state.hints >= 3 && <button type="button" className="inv-assist" onClick={() => { change(assistedState(challenge.board, state)); setMessage('A quiet helper has filled the board. Read it over, then check the deduction when you are ready.'); }}>Fill the board with a little help <ArrowMark /></button>}</div></>}</section>
        </div>
      </>}
    </>}
    <footer className="inv-footer"><span>LIBRARY OF TIME WELL SPENT</span><span>{solvedCount} / {investigation.challenges.length} threads understood · Notes saved immediately · Escape to close</span></footer>
  </div></div>;
}
