import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import '../styles/puzzles.css';
import { actorPortraitDataUrl, itemIconDataUrl } from '../openworld/sprites';
import PaperMotif from './PaperMotif';

type PuzzleProps = { puzzleId: string; onSolve: () => void; onClose: () => void };
type SceneProps = { onPass: () => void; feedback: (message: string) => void };
type Definition = { title: string; place: string; introduction: string; hints: string[]; mark: string };

export const puzzleDefinitions: Record<string, Definition> = {
  entrance: { title: 'The Unenterable Entrance', place: 'The threshold', mark: '◷', introduction: 'The entrance insists it cannot be entered. Its clock is another abandoned repair. Someone has worn the numbers away with their thumb.', hints: ['The inscription contains three numbers, in the order you need them.', 'Look at fourth, seventh, and ninth. The gate is asking for digits, not hours.', 'Set the three clock wheels to 4, 7, and 9.'] },
  rhyme: { title: 'A rhyme left unfinished', place: 'The shanty quarter', mark: '❧', introduction: 'The words pass between thin trailer walls. Nobody finishes them at a volume the wings could hear.', hints: ['Finish each line using a word from the little word bank.', 'The Lady grants time, and accepts a particular tree.', 'The missing words are time, willow, and pillow, in that order.'] },
  fishing: { title: 'A tastefully scarce supper', place: 'Lake of Tasteful Scarcity', mark: '≋', introduction: 'The water has enough fish for everyone, according to the sign. The sign has never been hungry.', hints: ['Cast the line, then stop the float while it is inside the green window.', 'You need three catches. Misses cost nothing, and you can try as often as you like.', 'Watch the float approach the window. You can also finish using the assistance below.'] },
  blocks: { title: 'A manner that pleases', place: 'Museum of the Supine', mark: '▦', introduction: '“Stack these blocks in a manner that pleases me.” The blocks belonged to children whose names have been scraped off the exhibit.', hints: ['The stack is shown from the bottom upward. Read the plaque as a growing tree.', 'Earth belongs at the bottom. Sun belongs at the top.', 'From bottom to top: earth, bark, leaf, sun.'] },
  catalog: { title: 'Time, properly shelved', place: 'Library of Time Well Spent', mark: '▤', introduction: 'The librarian will lose hours for every misfiled life. The shelves have been rebuilt from doors nobody lives behind anymore.', hints: ['Put the books in the order their events occurred, earliest first.', 'The first year comes before the eighth; the eighth before the nineteenth.', 'The order is Arrival, First Harvest, Royal Decree, Hospital Register.'] },
  coupons: { title: 'The kiss that dissolves', place: 'The coupon exchange', mark: '◇', introduction: 'Her face survives on every coupon. The body paid for it does not appear anywhere on the paper.', hints: ['Use exactly five coupons, worth exactly 39 minutes altogether.', 'You need none of the 20-minute coupons.', 'Use three 5-minute coupons and two 12-minute coupons.'] },
  forest: { title: 'The path that remembers', place: 'Cigarillo Forest', mark: '♧', introduction: 'The trees swallow the path behind you. A moth has drawn the safe way on a borrowed leaf.', hints: ['Study the route before folding the leaf, then choose its symbols in order.', 'The route begins with willow, then a raven.', 'Choose willow, raven, lantern, moon.'] },
  artwork: { title: 'The things she forgot to paint', place: 'Museum of the Sublime', mark: '◈', introduction: 'Under the Lady’s overpainted face, someone has left marks the curator was ordered to bury.', hints: ['Choose three symbols: something growing, something shared, and something open.', 'The crown, watching eye, and scales describe power, not the life beneath it.', 'Choose the seed, the bowl, and the door.'] },
  casino: { title: 'A game of fair chances', place: 'The Casino of Good Fortune', mark: '♠', introduction: '“All losses are voluntary.” A desperate hand cut another set of rules into the table. Its owner never collected.', hints: ['Choose one square in each row and each column. Avoid birds, wealth, and measured time.', 'The safe symbols are something growing, something that guides, and something that shelters.', 'Choose leaf (top middle), lantern (middle right), and house (bottom left).'] },
  permit: { title: 'Permission to gather what falls', place: 'Fields of Egregious Abundance', mark: '§', introduction: 'The fence is rotten enough to step through. They will still call it a crime when they find your tracks.', hints: ['The stamp names a visitor without beastly features, fallen willow, and three branches.', 'Your species is human. You are collecting fallen branches, not cutting a tree.', 'Select human, collect fallen willow, and enter 3 branches.'] },
  reversion: { title: 'The island that is a hole', place: 'The Pit of Reversion', mark: '↶', introduction: 'The pit begins with yesterday. It will keep working backward until there is no one left to remember being here.', hints: ['Arrange these memories from most recent to oldest.', 'Yesterday belongs first. Your first breath belongs last.', 'Yesterday, meeting a friend, first day of work, lost tooth, first breath.'] },
  brain: { title: 'A little change of mind', place: 'The Hospital for Those Out of Time', mark: '⌘', introduction: 'The operating table is a repaired kitchen door. These terminals must preserve a person inside a machine built from other people’s refuse.', hints: ['Choose a terminal on the left, then its matching function on the right.', 'Memory belongs with recall. Resolve belongs with courage.', 'Connect tenderness to care, memory to recall, and resolve to courage.'] },
  switch: { title: 'The God Switch', place: 'The chamber behind the chamber', mark: '⏣', introduction: 'Every refusal passed through this switch. Its wires were paid for by people she chose to stop seeing.', hints: ['Each switch affects the two lamps drawn beside it. Only the outer lamps should be lit.', 'Turning a lamp on twice turns it off again.', 'Starting with all lamps dark, turn on C and D. If necessary, use Reset first.'] },
  minder: { title: 'Excellent hearing', place: 'The Lady’s antechamber', mark: '☾', introduction: 'They learned to hear dissent through plywood walls. The routine you exploit has already cost someone their last night.', hints: ['The whispered instruction gives three actions, in order: ear, face, darkness.', 'First play the wind chime; then let the guard admire himself.', 'Wind chime, polished mirror, velvet curtain.'] },
  lullaby: { title: 'Before our heads hit the pillow', place: 'The sleeping chamber', mark: '♫', introduction: 'Someone hummed this beside a hospital bed until the bed was needed for someone else. The Lady has never heard where it came from.', hints: ['Play five notes in the order written on the scrap. Sound is optional.', 'Low, high, middle, high, low.', 'Press Do, Sol, Mi, Sol, Do.'] },
  final_gate: { title: 'Enough, for all of us', place: 'The entrance to Infinite Time', mark: '∞', introduction: 'Your friends offer their last minutes. The gate will open only if you leave enough life on this side, too.', hints: ['The gate needs 30 minutes. The three promises give the remaining amounts.', 'Pip’s reserve is two-thirds of 30; Brindle’s is five more; Ada’s is half of 30.', 'Give Pip 20, Brindle 25, Ada 15, and the gate 30 minutes.'] },
};

function Clue({ children }: { children: ReactNode }) {
  return <div className="pzl-clue"><span className="pzl-clue-label">A retained scrap</span>{children}</div>;
}

function CheckButton({ children = 'Try this', onClick }: { children?: ReactNode; onClick: () => void }) {
  return <button className="pzl-primary" type="button" onClick={onClick}>{children}<span aria-hidden="true"> ↗</span></button>;
}

function Entrance({ onPass, feedback }: SceneProps) {
  const [digits, setDigits] = useState([0, 0, 0]);
  return <><Clue><p>“At the <em>fourth</em> chime we wished to enter. At the <em>seventh</em>, we were refused. At the <em>ninth</em>, the clock forgot to lock the door.”</p></Clue><div className="pzl-clock-face"><span className="pzl-clock-caption">THE OFFICE OF ARRIVALS</span><div className="pzl-clock-wheels">{digits.map((digit, index) => <label key={index}><span className="pzl-sr-only">Clock wheel {index + 1}</span><select aria-label={`Clock wheel ${index + 1}`} value={digit} onChange={event => setDigits(current => current.map((value, i) => i === index ? Number(event.target.value) : value))}>{Array.from({ length: 10 }, (_, value) => <option key={value}>{value}</option>)}</select></label>)}</div><span className="pzl-clock-caption">TIME IS A PRIVILEGE. ENTRY IS A QUESTION.</span></div><CheckButton onClick={() => digits.join('') === '479' ? onPass() : feedback('The lock refuses you again. Read the three chimes again.')}>Ask the door</CheckButton></>;
}

function Rhyme({ onPass, feedback }: SceneProps) {
  const [words, setWords] = useState(['', '', '']);
  const options = ['time', 'willow', 'pillow', 'silver', 'tomorrow', 'crown'];
  const word = (index: number) => <select aria-label={`Missing rhyme ${index + 1}`} value={words[index]} onChange={event => setWords(current => current.map((value, i) => i === index ? event.target.value : value))}><option value="">a missing word</option>{options.map(option => <option key={option}>{option}</option>)}</select>;
  return <><div className="pzl-poem"><p>Lady Supine<br />Will grant us {word(0)}<br />When we feed her<br />Curly {word(1)}.</p><p>For we all wish to see<br />The best we can be<br />Before our heads<br />Hit the {word(2)}.</p></div><CheckButton onClick={() => words.join(',') === 'time,willow,pillow' ? onPass() : feedback('The song catches on a word. Time rhymes with Supine; willow with pillow.')}>Finish the song</CheckButton></>;
}

function Fishing({ onPass, feedback }: SceneProps) {
  const [moving, setMoving] = useState(false);
  const [position, setPosition] = useState(0);
  const [caught, setCaught] = useState(0);
  const positionRef = useRef(0);
  useEffect(() => {
    if (!moving) return;
    let frame = 0;
    let began: number | null = null;
    const tick = (time: number) => {
      if (began === null) began = time;
      const next = (1 - Math.cos((time - began) / 740)) / 2;
      positionRef.current = next;
      setPosition(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [moving]);
  function stop() {
    setMoving(false);
    if (positionRef.current >= 0.42 && positionRef.current <= 0.67) {
      const total = caught + 1;
      setCaught(total);
      if (total >= 3) onPass();
      else feedback(`Another thin fish. ${total} of 3 caught.`);
    } else feedback('Only a damp permit. Cast again; you have lost nothing.');
  }
  return <><Clue><p>Catch three fish for the kitchen. Stop the float inside the green band. You may take your time.</p></Clue><div className="pzl-pond"><span className="pzl-pond-moon"><PaperMotif id="moon" size={38} /></span><div className="pzl-reeds" aria-hidden="true"><PaperMotif id="willow" size={64} /><PaperMotif id="willow" size={48} /></div><span className="pzl-fish-count">{Array.from({ length: 3 }, (_, i) => <img src={itemIconDataUrl('fish')} key={i} className={i < caught ? 'pzl-fish-caught' : ''} alt={i < caught ? 'Fish caught' : 'Fish to catch'} />)}</span></div><div className="pzl-meter" role="meter" aria-label="Fishing float position. Stop in the green band between 42 and 67 percent." aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(position * 100)}><div className="pzl-meter-target" /><span className="pzl-meter-float" style={{ left: `${position * 100}%` }}>◆</span></div><p className="pzl-small">{caught} / 3 fish · Green band: 42–67%</p><CheckButton onClick={moving ? stop : () => { positionRef.current = 0; setPosition(0); setMoving(true); }}>{moving ? 'Pull the line' : 'Cast the line'}</CheckButton></>;
}

type OrderItem = { id: string; title: string; detail: string; mark: string; color?: string };
function Ordering({ initial, solution, clue, checkLabel, onPass, feedback, bottomFirst = false }: SceneProps & { initial: OrderItem[]; solution: string[]; clue: ReactNode; checkLabel: string; bottomFirst?: boolean }) {
  const [items, setItems] = useState(initial);
  function move(index: number, direction: number) {
    setItems(current => {
      const next = [...current];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });
  }
  return <><Clue>{clue}</Clue><div className="pzl-order" aria-label={bottomFirst ? 'Stack from bottom to top' : 'Ordered list'}>{items.map((item, index) => <div className="pzl-order-card" key={item.id} style={item.color ? { borderLeftColor: item.color } : undefined}><span className="pzl-order-number">{bottomFirst && index === 0 ? 'BASE' : index + 1}</span><span className="pzl-order-mark" aria-hidden="true"><PaperMotif id={item.id} size={38} /></span><div><strong>{item.title}</strong><span>{item.detail}</span></div><div className="pzl-order-controls"><button type="button" disabled={index === 0} aria-label={`Move ${item.title} earlier`} onClick={() => move(index, -1)}>↑</button><button type="button" disabled={index === items.length - 1} aria-label={`Move ${item.title} later`} onClick={() => move(index, 1)}>↓</button></div></div>)}</div><CheckButton onClick={() => items.map(item => item.id).join(',') === solution.join(',') ? onPass() : feedback('Something is still out of place. The scrap gives the order.')}>{checkLabel}</CheckButton></>;
}

const blocks: OrderItem[] = [
  { id: 'sun', title: 'Sun', detail: 'The stained yellow block', mark: '☀', color: '#c29559' },
  { id: 'earth', title: 'Earth', detail: 'The patient ochre block', mark: '▰', color: '#a28766' },
  { id: 'leaf', title: 'Leaf', detail: 'The worn green block', mark: '❧', color: '#708a8c' },
  { id: 'bark', title: 'Bark', detail: 'The dark brown block', mark: '≋', color: '#78634a' },
];
const catalog: OrderItem[] = [
  { id: 'decree', title: 'The Royal Decree', detail: 'In the nineteenth year, timelessness became a crime.', mark: '§' },
  { id: 'harvest', title: 'The First Harvest', detail: 'Eight years after Arrival, the fields overflowed.', mark: '❧' },
  { id: 'hospital', title: 'The Hospital Register', detail: 'In the thirty-first year, the first ward opened.', mark: '+' },
  { id: 'arrival', title: 'The Book of Arrival', detail: 'The first year. The first clock. The first promise.', mark: '◷' },
];
const memories: OrderItem[] = [
  { id: 'work', title: 'Your first day of work', detail: 'Age fourteen. A borrowed coat, much too large.', mark: '▤' },
  { id: 'breath', title: 'Your first breath', detail: 'Age zero. Nobody was counting yet.', mark: '○' },
  { id: 'friend', title: 'Meeting a friend', detail: 'Age twenty-three. Someone moved their coat so you would not have to stand.', mark: '♡' },
  { id: 'yesterday', title: 'Yesterday', detail: 'Age thirty. A meal split so neither of you had enough.', mark: '☾' },
  { id: 'tooth', title: 'Your first lost tooth', detail: 'Age six. Something left, and something grew.', mark: '◇' },
];

function Coupons({ onPass, feedback }: SceneProps) {
  const [counts, setCounts] = useState([0, 0, 0]);
  const values = [5, 12, 20];
  const count = counts.reduce((total, value) => total + value, 0);
  const minutes = counts.reduce((total, value, index) => total + value * values[index], 0);
  return <><Clue><p>“Present <strong>exactly five</strong> coupons. Their kisses must contain <strong>exactly 39 minutes</strong>. Overpayment will not be returned.”</p></Clue><div className="pzl-coupons">{values.map((value, index) => <label className="pzl-coupon" key={value}><img className="pzl-coupon-face" src={actorPortraitDataUrl('lady', 96)} alt="" /><span>Lady Supine grants</span><strong>{value}<small> minutes</small></strong><select aria-label={`Number of ${value}-minute coupons`} value={counts[index]} onChange={event => setCounts(current => current.map((count, i) => i === index ? Number(event.target.value) : count))}>{Array.from({ length: 6 }, (_, number) => <option value={number} key={number}>{number} coupons</option>)}</select></label>)}</div><div className="pzl-account"><span>{count} / 5 coupons</span><span>{minutes} / 39 minutes</span></div><CheckButton onClick={() => count === 5 && minutes === 39 ? onPass() : feedback('The clerk taps the two totals. Both must match exactly.')}>Exchange the kisses</CheckButton></>;
}

const pathSymbols = [{ id: 'willow', mark: '♧', name: 'Willow' }, { id: 'raven', mark: '♜', name: 'Raven' }, { id: 'lantern', mark: '◈', name: 'Lantern' }, { id: 'moon', mark: '☾', name: 'Moon' }];
function Forest({ onPass, feedback }: SceneProps) {
  const [studying, setStudying] = useState(true);
  const [step, setStep] = useState(0);
  function choose(id: string) {
    if (step >= pathSymbols.length) return;
    if (id === pathSymbols[step].id) {
      const next = step + 1;
      setStep(next);
      if (next === 4) onPass();
      else feedback('The path opens a little farther.');
    } else { setStep(0); feedback('You have circled back. The borrowed leaf is still readable.'); }
  }
  return <>{studying ? <><Clue><p>The moth’s route: remember these four signs in order. Fold the leaf when you are ready.</p></Clue><div className="pzl-path-map">{pathSymbols.map((symbol, i) => <div key={symbol.id}><PaperMotif id={symbol.id} size={50} /><small>{i + 1}. {symbol.name}</small></div>)}</div><CheckButton onClick={() => { setStep(0); setStudying(false); }}>Fold the leaf</CheckButton></> : <><div className="pzl-forest-scene" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <img key={index} src={itemIconDataUrl('sapling', 128)} alt="" />)}<PaperMotif id="lantern" size={48} /></div><p className="pzl-center">Fork {Math.min(step + 1, 4)} of 4. Which sign do you follow?</p><div className="pzl-choice-grid pzl-four-choices">{[pathSymbols[2], pathSymbols[0], pathSymbols[3], pathSymbols[1]].map(symbol => <button className="pzl-symbol-choice" key={symbol.id} type="button" onClick={() => choose(symbol.id)}><PaperMotif id={symbol.id} />{symbol.name}</button>)}</div><button className="pzl-text-button" type="button" onClick={() => { setStudying(true); setStep(0); }}>Unfold the leaf again</button></>}</>;
}

type Choice = { id: string; mark: string; title: string; detail?: string };
function Selection({ choices, solution, clue, onPass, feedback, casino = false }: SceneProps & { choices: Choice[]; solution: string[]; clue: ReactNode; casino?: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  function toggle(id: string) { setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]); }
  return <><Clue>{clue}</Clue><div className={`pzl-choice-grid ${casino ? 'pzl-casino-board' : 'pzl-art-board'}`}>{choices.map(choice => <button key={choice.id} type="button" className={`pzl-symbol-choice ${selected.includes(choice.id) ? 'pzl-selected' : ''}`} aria-pressed={selected.includes(choice.id)} onClick={() => toggle(choice.id)}><span className="pzl-symbol" aria-hidden="true"><PaperMotif id={choice.id} /></span><strong>{choice.title}</strong>{choice.detail && <small>{choice.detail}</small>}{selected.includes(choice.id) && <span className="pzl-choice-tick" aria-hidden="true">✓</span>}</button>)}</div><p className="pzl-small">{selected.length} of 3 symbols chosen</p><CheckButton onClick={() => selected.length === solution.length && solution.every(id => selected.includes(id)) ? onPass() : feedback('The three symbols must answer every part of the clue. You can select a symbol again to remove it.')}>{casino ? 'Turn the winning tiles' : 'Read the hidden picture'}</CheckButton></>;
}
const artChoices: Choice[] = [
  { id: 'crown', mark: '♛', title: 'Crown', detail: 'A thing inherited' }, { id: 'seed', mark: '❧', title: 'Seed', detail: 'A thing growing' }, { id: 'eye', mark: '◉', title: 'Eye', detail: 'A thing watching' },
  { id: 'bowl', mark: '◡', title: 'Bowl', detail: 'A supper shared' }, { id: 'scales', mark: '⚖', title: 'Scales', detail: 'A thing measured' }, { id: 'door', mark: '▯', title: 'Door', detail: 'A way standing open' },
];
const casinoChoices: Choice[] = [{ id: 'crown', mark: '♛', title: 'Crown' }, { id: 'leaf', mark: '❧', title: 'Leaf' }, { id: 'coin', mark: '⊙', title: 'Coin' }, { id: 'bat', mark: '⋈', title: 'Bat' }, { id: 'clock', mark: '◷', title: 'Clock' }, { id: 'lantern', mark: '◈', title: 'Lantern' }, { id: 'house', mark: '⌂', title: 'House' }, { id: 'sun', mark: '☀', title: 'Sun' }, { id: 'raven', mark: '♜', title: 'Raven' }];

function Permit({ onPass, feedback }: SceneProps) {
  const [species, setSpecies] = useState('');
  const [purpose, setPurpose] = useState('');
  const [amount, setAmount] = useState('');
  return <><Clue><p>“One visitor with neither feather, fur, nor fin. Gather only curly willow that has already fallen. One branch for a beginning, one for an ending, one for the hour in between.”</p></Clue><form className="pzl-permit" onSubmit={event => { event.preventDefault(); if (species === 'human' && purpose === 'fallen' && Number(amount) === 3) onPass(); else feedback('The form is rejected. The stamp states the required entries.'); }}><div className="pzl-permit-heading"><span>DEPARTMENT OF PLENTY</span><strong>Form 08 / Appropriate Abundance</strong></div><label>Species of applicant<select value={species} onChange={event => setSpecies(event.target.value)} required><option value="">Select a classification</option><option value="bird">Avian</option><option value="beast">Furred</option><option value="fish">Aquatic</option><option value="human">Human</option></select></label><label>Purpose of visit<select value={purpose} onChange={event => setPurpose(event.target.value)} required><option value="">Select a purpose</option><option value="cut">Cut living willow</option><option value="fallen">Collect fallen willow</option><option value="count">Count the abundant</option><option value="admire">Admire the gate</option></select></label><label>Requested branches<input value={amount} onChange={event => setAmount(event.target.value)} inputMode="numeric" type="number" min="0" max="99" placeholder="Enter a whole number" required /></label><div className="pzl-permit-stamp" aria-hidden="true">BE REASONABLE</div><button type="submit" className="pzl-primary">Submit the request ↗</button></form></>;
}

const brainLeft = [{ id: 'tenderness', title: 'Tenderness', mark: '♡' }, { id: 'memory', title: 'Memory', mark: '▤' }, { id: 'resolve', title: 'Resolve', mark: '◇' }];
const brainRight = [{ id: 'courage', title: 'Courage', mark: '◇' }, { id: 'care', title: 'Care', mark: '♡' }, { id: 'recall', title: 'Recall', mark: '▤' }];
const brainPairs: Record<string, string> = { tenderness: 'care', memory: 'recall', resolve: 'courage' };
function Brain({ onPass, feedback }: SceneProps) {
  const [active, setActive] = useState<string | null>(null);
  const [connected, setConnected] = useState<string[]>([]);
  function attach(id: string) {
    if (!active) { feedback('Choose a donor terminal on the left first.'); return; }
    if (connected.includes(active)) return;
    if (brainPairs[active] === id) {
      const next = [...connected, active];
      setConnected(next); setActive(null);
      if (next.length === 3) onPass();
      else feedback('A quiet spark. The connection holds.');
    } else { setActive(null); feedback('That wire would confuse the patient. Match the meaning of the two terminals.'); }
  }
  return <><Clue><p>“Tenderness lets us care. Memory lets us recall. Resolve lets us act with courage. Connect the same thought to itself.”</p></Clue><div className="pzl-brain"><div className="pzl-wire-column"><h3>Donor mind</h3>{brainLeft.map(item => <button className={`pzl-wire-terminal ${active === item.id ? 'pzl-selected' : ''} ${connected.includes(item.id) ? 'pzl-connected' : ''}`} type="button" key={item.id} disabled={connected.includes(item.id)} aria-pressed={active === item.id} onClick={() => setActive(item.id)}>{item.mark} {item.title}<span>{connected.includes(item.id) ? '✓' : '●'}</span></button>)}</div><div className="pzl-brain-center" aria-hidden="true"><img src={itemIconDataUrl('supine_brain', 96)} alt="" /><small>{connected.length}/3</small></div><div className="pzl-wire-column"><h3>Receiving body</h3>{brainRight.map(item => <button className={`pzl-wire-terminal ${connected.some(left => brainPairs[left] === item.id) ? 'pzl-connected' : ''}`} type="button" key={item.id} disabled={connected.some(left => brainPairs[left] === item.id)} onClick={() => attach(item.id)}><span>{connected.some(left => brainPairs[left] === item.id) ? '✓' : '●'}</span>{item.title} {item.mark}</button>)}</div></div><p className="pzl-small">Choose a terminal on the left, then its partner on the right.</p></>;
}

const switchLinks = [[0, 1], [1, 2], [2, 3], [0, 2]];
function GodSwitch({ onPass, feedback }: SceneProps) {
  const [lamps, setLamps] = useState([false, false, false, false]);
  const [levers, setLevers] = useState([false, false, false, false]);
  function toggle(index: number) {
    setLevers(current => current.map((value, i) => i === index ? !value : value));
    setLamps(current => current.map((value, i) => switchLinks[index].includes(i) ? !value : value));
  }
  return <><Clue><p>“Give light to the beginning and the end. Let the two hours between them sleep.” Each lever reverses the two lamps listed below it.</p></Clue><div className="pzl-switch-machine"><div className="pzl-lamps">{lamps.map((lit, index) => <div key={index}><span className={`pzl-lamp ${lit ? 'pzl-lit' : ''}`} aria-label={`Lamp ${index + 1}: ${lit ? 'lit' : 'dark'}`}><PaperMotif id="lantern" size={27} /></span><small>{index + 1}</small></div>)}</div><div className="pzl-switches">{levers.map((active, index) => <button type="button" key={index} aria-pressed={active} onClick={() => toggle(index)} className={active ? 'pzl-lever-active' : ''}><span className="pzl-lever"><i /></span><strong>{'ABCD'[index]}</strong><small>Lamps {switchLinks[index].map(i => i + 1).join(' & ')}</small></button>)}</div></div><div className="pzl-button-row"><CheckButton onClick={() => lamps.join(',') === 'true,false,false,true' ? onPass() : feedback('Only the outer lamps should shine: lit, dark, dark, lit.')}>Engage the switch</CheckButton><button className="pzl-text-button" type="button" onClick={() => { setLamps([false, false, false, false]); setLevers([false, false, false, false]); }}>Reset the machine</button></div></>;
}

const distractionChoices = [{ id: 'chime', title: 'Wind chime', mark: '♫' }, { id: 'mirror', title: 'Polished mirror', mark: '◉' }, { id: 'curtain', title: 'Velvet curtain', mark: '▥' }, { id: 'shout', title: 'A loud declaration', mark: '!' }];
function Minder({ onPass, feedback }: SceneProps) {
  const [step, setStep] = useState(0);
  const sequence = ['chime', 'mirror', 'curtain'];
  function choose(id: string) {
    if (step >= sequence.length) return;
    if (id === sequence[step]) {
      const next = step + 1;
      setStep(next);
      if (next === 3) onPass();
      else feedback(next === 1 ? 'The first minder tilts an enormous ear toward the music.' : 'The second minder is absorbed in his handsome reflection.');
    } else { setStep(0); feedback('A suspicious wing rustles. Wait a moment, then begin again.'); }
  }
  return <><Clue><p>“First give the ear a pleasant thing. Next give the face itself. Last give the room a velvet night.”</p></Clue><div className="pzl-minders" aria-hidden="true"><img src={actorPortraitDataUrl('bat', 128)} className={step > 0 ? 'pzl-distracted' : ''} alt="" /><div><small>{step === 0 ? 'LISTENING' : step === 1 ? 'LISTENING TO MUSIC' : 'ADMIRING THEMSELVES'}</small><strong>{step} / 3 distractions</strong></div><img src={actorPortraitDataUrl('bat', 128)} className={step > 1 ? 'pzl-distracted' : ''} alt="" /></div><div className="pzl-choice-grid pzl-four-choices">{distractionChoices.map(choice => <button className="pzl-symbol-choice" key={choice.id} type="button" onClick={() => choose(choice.id)}><PaperMotif id={choice.id} />{choice.title}</button>)}</div></>;
}

function Lullaby({ onPass, feedback }: SceneProps) {
  const [played, setPlayed] = useState<number[]>([]);
  const [sound, setSound] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const sequence = [0, 2, 1, 2, 0];
  const notes = [{ title: 'Do', pitch: 'Low', hz: 261.63 }, { title: 'Mi', pitch: 'Middle', hz: 329.63 }, { title: 'Sol', pitch: 'High', hz: 392 }];
  useEffect(() => () => { if (audioRef.current) void audioRef.current.close(); }, []);
  function play(index: number) {
    if (played.length >= sequence.length) return;
    if (sound) {
      try {
        const context = audioRef.current ?? new AudioContext();
        audioRef.current = context;
        if (context.state === 'suspended') void context.resume();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = notes[index].hz;
        gain.gain.setValueAtTime(0.12, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.5);
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.start(); oscillator.stop(context.currentTime + 0.5);
      } catch { /* The written melody works without audio support. */ }
    }
    if (sequence[played.length] === index) {
      const next = [...played, index]; setPlayed(next);
      if (next.length === 5) onPass();
      else feedback('The room grows a little quieter.');
    } else { setPlayed([]); feedback('The Lady stirs. Begin the tune again: low, high, middle, high, low.'); }
  }
  return <><Clue><p>“Down by the <strong>willow</strong>, up to the <strong>pillow</strong>, rest in the <strong>middle</strong>, up to the <strong>pillow</strong>, down by the <strong>willow</strong>.”</p><p className="pzl-small">Written score: low · high · middle · high · low</p></Clue><div className="pzl-music-staff" aria-label={`${played.length} of 5 notes played correctly`}>{sequence.map((note, index) => <span className={index < played.length ? 'pzl-note-played' : ''} style={{ top: `${42 - note * 13}px` }} key={index}>{index < played.length ? '♪' : '○'}</span>)}</div><div className="pzl-piano">{notes.map((note, index) => <button type="button" key={note.title} onClick={() => play(index)}><strong>{note.title}</strong><small>{note.pitch}</small></button>)}</div><label className="pzl-sound-toggle"><input type="checkbox" checked={sound} onChange={event => setSound(event.target.checked)} /> Play sound <span>(optional)</span></label></>;
}

function FinalGate({ onPass, feedback }: SceneProps) {
  const [amounts, setAmounts] = useState(['0', '0', '0', '0']);
  const names = ['Pip', 'Brindle', 'Ada', 'The entrance'];
  const portraits = ['moth', 'ox', 'hare'] as const;
  const total = amounts.reduce((sum, value) => sum + (Number(value) || 0), 0);
  return <><Clue><p>There are <strong>90 minutes</strong> between you. The entrance needs <strong>30</strong>. Promise Pip <strong>two-thirds</strong> of that, Brindle <strong>five minutes more</strong> than Pip, and Ada <strong>half</strong> the entrance’s share.</p><p>No one gets left behind.</p></Clue><div className="pzl-allocation">{names.map((name, index) => <label key={name}>{index < 3 ? <img src={actorPortraitDataUrl(portraits[index], 96)} alt="" /> : <PaperMotif id="door" size={64} />}<strong>{name}</strong><div><input type="number" inputMode="numeric" min="0" max="90" step="1" aria-label={`Minutes for ${name.toLowerCase()}`} value={amounts[index]} onChange={event => setAmounts(current => current.map((value, i) => i === index ? event.target.value : value))} /><small>minutes</small></div></label>)}</div><div className={`pzl-account ${total > 90 ? 'pzl-over-budget' : ''}`}><span>Time promised</span><strong>{total} / 90 minutes</strong></div><CheckButton onClick={() => amounts.map(Number).join(',') === '20,25,15,30' ? onPass() : feedback('Keep all three promises, and reserve thirty minutes for the entrance. The total must be ninety.')}>Make time for everyone</CheckButton></>;
}

function PuzzleScene({ puzzleId, ...props }: SceneProps & { puzzleId: string }) {
  switch (puzzleId) {
    case 'entrance': return <Entrance {...props} />;
    case 'rhyme': return <Rhyme {...props} />;
    case 'fishing': return <Fishing {...props} />;
    case 'blocks': return <Ordering {...props} initial={blocks} solution={['earth', 'bark', 'leaf', 'sun']} bottomFirst checkLabel="Present the stack" clue={<p>“First the ancient earth. Then the bark that rises from it. Then the leaf that drinks the light. Then the sun that gives it.” Arrange the stack <strong>from bottom to top</strong>.</p>} />;
    case 'catalog': return <Ordering {...props} initial={catalog} solution={['arrival', 'harvest', 'decree', 'hospital']} checkLabel="Shelve the books" clue={<p>History must face forward: put the earliest event first and the latest last. The years are written inside each cover.</p>} />;
    case 'coupons': return <Coupons {...props} />;
    case 'forest': return <Forest {...props} />;
    case 'artwork': return <Selection {...props} choices={artChoices} solution={['seed', 'bowl', 'door']} clue={<p>“Beneath her portrait: one thing <strong>growing</strong>, one thing <strong>shared</strong>, one way <strong>open</strong>. These are the things a face on a billboard cannot give us.”</p>} />;
    case 'casino': return <Selection {...props} choices={casinoChoices} solution={['leaf', 'lantern', 'house']} casino clue={<p>Choose <strong>one tile in each row and each column</strong>. Neither bird, wealth, nor measured time is safe. Keep what <strong>grows</strong>, what <strong>guides</strong>, and what <strong>shelters</strong>.</p>} />;
    case 'permit': return <Permit {...props} />;
    case 'reversion': return <Ordering {...props} initial={memories} solution={['yesterday', 'friend', 'work', 'tooth', 'breath']} checkLabel="Let the memories fall" clue={<p>The pit unwinds a life. Begin with the <strong>most recent</strong> memory and finish with the oldest. Keep hold of whatever can still be named.</p>} />;
    case 'brain': return <Brain {...props} />;
    case 'switch': return <GodSwitch {...props} />;
    case 'minder': return <Minder {...props} />;
    case 'lullaby': return <Lullaby {...props} />;
    case 'final_gate': return <FinalGate {...props} />;
    default: return <Entrance {...props} />;
  }
}

export default function PuzzleModal({ puzzleId, onSolve, onClose }: PuzzleProps) {
  const definition = puzzleDefinitions[puzzleId] ?? puzzleDefinitions.entrance;
  const [hints, setHints] = useState(0);
  const [message, setMessage] = useState('');
  const [solved, setSolved] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const confirmedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();
  onCloseRef.current = onClose;
  useEffect(() => {
    setHints(0); setMessage(''); setSolved(false);
    confirmedRef.current = false;
  }, [puzzleId]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); }
      if (event.key === 'Tab') {
        const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0);
        const first = elements[0]; const last = elements[elements.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, []);
  function pass() { setSolved(true); setMessage(''); }
  function confirm() { if (confirmedRef.current) return; confirmedRef.current = true; onSolve(); }
  return <div className="puzzle-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div ref={dialogRef} className="puzzle-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}><header className="puzzle-header"><div><span className="puzzle-eyebrow">A condition of your continued existence</span><h2 id={titleId}>{definition.title}</h2></div><button type="button" className="puzzle-close" ref={closeRef} onClick={onClose} aria-label="Close puzzle and return to the story">×</button></header><div className="puzzle-body"><aside className="puzzle-aside"><div className="puzzle-emblem" aria-hidden="true"><PaperMotif id={{ entrance: 'clock', rhyme: 'willow', fishing: 'bowl', blocks: 'earth', coupons: 'eye', forest: 'willow', artwork: 'eye', casino: 'coin', permit: 'leaf', reversion: 'moon', brain: 'eye', switch: 'clock', minder: 'bat', lullaby: 'moon', final_gate: 'door' }[puzzleId] || 'record'} size={52} /></div><span className="puzzle-place">{definition.place}</span><p id={descriptionId}>{definition.introduction}</p><div className="puzzle-aside-rule" /><span className="puzzle-aside-note">The clock is suspended.<br />The margin notes remain available.</span>{!solved && <div className="puzzle-hints"><button type="button" className="puzzle-hint-button" disabled={hints >= 3} onClick={() => setHints(current => Math.min(current + 1, 3))}><span aria-hidden="true">✧</span> {hints === 0 ? 'Request a hint' : hints < 3 ? 'Another hint' : 'All hints revealed'} <small>{hints}/3</small></button><div aria-live="polite">{definition.hints.slice(0, hints).map((hint, index) => <p className="puzzle-hint" key={hint}><span>{index + 1}.</span> {hint}</p>)}</div>{hints === 3 && <button type="button" className="puzzle-assist" onClick={pass}>Use the margin notes ↗</button>}</div>}</aside><main className="puzzle-stage">{solved ? <div className="puzzle-success"><div className="puzzle-success-mark" aria-hidden="true">✓</div><span className="puzzle-eyebrow">A condition satisfied</span><h3>Something gives way.</h3><p>The obstruction has been removed.<br />What comes after it is still there.</p><button className="pzl-primary" type="button" autoFocus onClick={confirm}>Return to the story <span aria-hidden="true">↗</span></button></div> : <PuzzleScene key={puzzleId} puzzleId={puzzleId} onPass={pass} feedback={setMessage} />}<div className={`puzzle-feedback ${message ? 'puzzle-feedback-visible' : ''}`} aria-live="polite" role="status">{message}</div></main></div><footer className="puzzle-footer"><span>LAND OF LIMITED TIME</span><span>Escape to return · Progress is saved when you finish</span></footer></div></div>;
}
