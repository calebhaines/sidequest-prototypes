import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Clock3, Puzzle, X } from 'lucide-react';
import type { Choice, Scene } from '../data/campaign';
import type { GameState } from '../data/game';
import { matchesRequirement } from '../data/game';
import { actorPortraitDataUrl, itemIconDataUrl, type ActorDrawingState } from '../openworld/sprites';
import type { ActorKind } from '../openworld/types';

export type DialogueBoxProps = {
  scene: Scene; story: GameState; choices: Choice[];
  onChoice: (choice: Choice) => void; onClose: () => void;
};

function portraitFor(speaker: string): ActorKind | null {
  const lower = speaker.toLowerCase();
  if (lower.includes('supine')) return 'lady';
  if (lower.includes('pip')) return 'moth';
  if (lower.includes('ada')) return 'hare';
  if (lower.includes('brindle')) return 'ox';
  if (lower.includes('anima') || lower.includes('doctor')) return 'tortoise';
  if (lower.includes('gatekeeper')) return 'gatekeeper';
  if (lower.includes('vellum')) return 'fox';
  if (lower.includes('mallow')) return 'otter';
  if (lower.includes('cinder')) return 'deer';
  if (lower.includes('burrow')) return 'mole';
  if (lower.includes('curator')) return 'peacock';
  if (lower.includes('nurse') || lower.includes('reed')) return 'heron';
  if (lower.includes('aristobat') || lower.includes('minder')) return 'bat';
  if (lower === 'before' || lower.includes('yesterday')) return 'salamander';
  if (lower.includes('huckster') || lower.includes('shyster') || lower.includes('swindler') || lower.includes('hustler')) return 'merchant';
  if (lower === 'you') return 'human';
  return null;
}

function pagesOf(paragraphs: string[]) {
  const pages: string[][] = [];
  let page: string[] = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    if (page.length && (length + paragraph.length > 650 || page.length >= 3)) { pages.push(page); page = []; length = 0; }
    page.push(paragraph); length += paragraph.length;
  }
  if (page.length) pages.push(page);
  return pages.length ? pages : [['']];
}

export default function DialogueBox({ scene, story, choices, onChoice, onClose }: DialogueBoxProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const dialogueRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pages = useMemo(() => pagesOf(scene.text), [scene.text]);
  const finalPage = pageIndex >= pages.length - 1;
  const portrait = scene.id === 'world_supine_in_ada' ? 'hare' : ['castle_changed', 'ada_supine', 'world_supine_empty_body'].includes(scene.id) ? 'lady' : portraitFor(scene.speaker);
  const portraitState: ActorDrawingState = {
    mindChanged: ['castle_changed', 'ada_supine', 'world_supine_in_ada'].includes(scene.id),
    brainAbsent: scene.id === 'world_supine_empty_body',
  };
  const jarPortrait = scene.id === 'supine_jar' || (portrait === 'lady' && story.items.includes('supine_brain') && (scene.location === 'infinite' || scene.id.includes('return')));
  const canChoose = (choice: Choice) => matchesRequirement(choice.requires, story.flags) && (!choice.item || story.items.includes(choice.item));
  useEffect(() => { setPageIndex(0); closeRef.current?.focus(); }, [scene.id]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName || '')) return;
      if ((event.key === ' ' || event.key === 'Enter') && !finalPage) {
        event.preventDefault(); setPageIndex(index => Math.min(pages.length - 1, index + 1));
      } else if (finalPage && /^[1-9]$/.test(event.key)) {
        const choice = choices[Number(event.key) - 1];
        if (choice && canChoose(choice)) { event.preventDefault(); onChoice(choice); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finalPage, pages.length, choices, story.flags, story.items, onChoice]);

  return <section className="ow-dialogue" ref={dialogueRef} role="dialog" aria-modal="true" aria-label={`Conversation with ${scene.speaker}`} key={scene.id} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const buttons = dialogueRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    if (!buttons?.length) return;
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}>
    <div className="ow-dialogue-portrait">{jarPortrait ? <img src={itemIconDataUrl('supine_brain', 96)} alt="" /> : portrait ? <img src={actorPortraitDataUrl(portrait, 96, portraitState)} alt="" /> : <span>{scene.speaker === 'You' ? '✦' : '✧'}</span>}<i /></div>
    <div className="ow-dialogue-main">
      <header className="ow-dialogue-header"><div><h2>{scene.speaker}</h2>{scene.role && <span>{scene.role}</span>}</div><button ref={closeRef} onClick={onClose} aria-label="Close conversation" title="Return to the world · Escape"><X size={18} /></button></header>
      <div className="ow-dialogue-reading" key={`${scene.id}-${pageIndex}`}>{pages[pageIndex]?.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
      {finalPage ? <div className="ow-dialogue-choices">{choices.map((choice, index) => {
        const cost = (choice.effects || []).reduce((sum, effect) => sum + (effect.time || 0), 0);
        const enabled = canChoose(choice);
        return <button key={`${scene.id}-${index}`} onClick={() => onChoice(choice)} disabled={!enabled} title={!enabled ? choice.item ? 'The required object is missing.' : 'An earlier obligation remains unresolved.' : undefined}><kbd>{index + 1}</kbd><span>{choice.label}</span>{choice.puzzle && <Puzzle size={13} />}{cost !== 0 && <small className={cost < 0 ? 'ow-choice-cost' : 'ow-choice-gain'}><Clock3 size={11} />{cost > 0 ? '+' : '−'}{Math.abs(cost)}m</small>}<ArrowRight size={14} /></button>;
      })}{choices.length === 0 && <button onClick={onClose}><span>Return to the world</span><ArrowRight size={14} /></button>}</div> : <div className="ow-dialogue-page-controls"><span>{pageIndex + 1} / {pages.length}</span><button onClick={() => setPageIndex(index => Math.min(pages.length - 1, index + 1))}>Continue <kbd>Space</kbd><ArrowRight size={15} /></button></div>}
      <footer className="ow-dialogue-footer"><span>The clock is suspended while you listen.</span><span>{finalPage ? 'Choose a reply' : 'The statement continues'}</span></footer>
    </div>
  </section>;
}
