import './style.css';
import { drawPreview, drawWorld, WORLD_SIZE } from './world-renderer.js';
import { createGame } from './game-engine.js';

const icons = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  arrowUp: '<path d="M7 17 17 7M7 7h10v10"/>',
  play: '<path d="m9 5 11 7-11 7V5Z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/>',
  sword: '<path d="m14 3 7 0 0 7-12 12-7-7L14 3ZM3 3l6 6M4 15l5 5M2 22l4-4"/>',
  chat: '<path d="M21 11a8 8 0 0 1-8 8H9l-6 3 1-6a8 8 0 0 1-1-5 8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"/><path d="M8 10h8M8 14h5"/>',
  shuffle: '<path d="m17 3 4 4-4 4M3 17l5 0L16 7h5M17 13l4 4-4 4M3 7h5l3 4M15 16l1 1h5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  spark: '<path d="m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3 3-6Z"/>',
  monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  volume: '<path d="m11 5-6 4H2v6h3l6 4V5ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15M15 6v15"/>',
  flag: '<path d="M5 21V3l7 2 7-2v11l-7 2-7-2"/>',
  bag: '<path d="M5 7h14l2 14H3L5 7ZM8 7V5a4 4 0 0 1 8 0v2"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.spark}</svg>`;
const brandMark = `<span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>`;

const worlds = [
  { id: 'moss', number: '01', name: 'Moss & Myth', category: 'Fantasy', genre: 'THE WILD FRONTIER', color: '#457148', chip: '#e9efdf', line: 'A little wonder. A lot of wilderness.', description: 'Leave the village behind. Follow old magic into a world of forgotten ruins, forest folk, and stories waiting to be found.', tags: ['Living forests', 'Old magic', 'Sword & spell'], location: 'Willowmere', role: 'The wanderer', hook: 'A river has stopped singing. The villagers think the forest is trying to tell them something.', gradient: '#739653' },
  { id: 'neon', number: '02', name: 'Neon Afterglow', category: 'Sci-fi', genre: 'THE CITY NEVER SLEEPS', color: '#8062a6', chip: '#eee6f4', line: 'Find your place in the electric city.', description: 'Run the backstreets of a rain-soaked megacity. Take shady jobs, meet unlikely allies, and decide who gets your loyalty.', tags: ['Street stories', 'Cyberware', 'Faction choices'], location: 'Lower Grid', role: 'The runner', hook: 'Someone is erasing people from the city records. Tonight, your name appeared on the list.', gradient: '#675688' },
  { id: 'dust', number: '03', name: 'The Dustlands', category: 'Wasteland', genre: 'BEYOND THE LAST OUTPOST', color: '#aa653a', chip: '#f3e7d6', line: 'Nothing out here is truly empty.', description: 'Make a life at the edge of a broken world. Scavenge the old roads, trade favors, and uncover what the desert buried.', tags: ['Lost technology', 'Salvage & trade', 'Frontier survival'], location: 'Lastwater', role: 'The drifter', hook: 'The settlement has three days of clean water left. An old machine in the dunes might change that.', gradient: '#c99455' },
  { id: 'odd', number: '04', name: 'Borrowed Sky', category: 'Surreal', genre: 'WELCOME TO THE NEIGHBORHOOD', color: '#657ca4', chip: '#e4eaf5', line: 'A familiar town. An unfamiliar feeling.', description: 'Ride into a sleepy suburb where the ordinary gets wonderfully strange. Make friends, chase rumors, and look a little closer.', tags: ['Small-town secrets', 'Strange encounters', 'Everyday magic'], location: 'Bellweather', role: 'The new kid', hook: 'It is always 6:17 in Bellweather. Everyone seems fine with that. Everyone except you.', gradient: '#8292bc' },
];

let selectedWorld = null;
let favorites = new Set();
try { selectedWorld = localStorage.getItem('sidequest-selected'); favorites = new Set(JSON.parse(localStorage.getItem('sidequest-favorites') || '[]')); } catch {}
let currentFilter = 'All worlds';
let activeGame = null;
let activeWorld = null;
let lastState = null;
let mapOpen = false;
let soundOn = false;
let soundContext = null;
let ambientOscillators = [];

function renderApp() {
  document.querySelector('#app').innerHTML = `
    <header class="site-header">
      <a class="brand" href="#" aria-label="Sidequest home">${brandMark}<span>sidequest<span class="brand-period">.</span></span></a>
      <nav class="main-nav" aria-label="Main navigation">
        <a class="nav-active" href="#worlds">The worlds <span>04</span></a>
        <a href="#idea">The idea</a>
        <button class="nav-how" data-action="help">How to play ${icon('arrowUp')}</button>
      </nav>
      ${location.protocol === 'file:' ? '<div class="header-status"><span class="status-dot"></span> Four worlds, wherever you go</div>' : `<a class="header-status download-link" href="/downloads/sidequest-prototypes.zip" download>${icon('download')} Download prototypes</a>`}
      <button class="mobile-help icon-button" data-action="help" aria-label="How to play">${icon('monitor')}</button>
    </header>
    <main>
      <section class="hero">
        <div class="hero-copy">
          <div class="eyebrow"><span class="tiny-spark">✦</span> YOUR NEXT ADVENTURE STARTS HERE</div>
          <h1>Small pixels.<br><span>Big possibilities.</span><span class="heading-star" aria-hidden="true"><svg viewBox="0 0 64 64" fill="currentColor"><path d="m29 0 6 0 1 21 15-14 5 5-14 16 22 1v6l-22 1 14 15-5 5-15-14-1 22h-6l-1-22-16 14-5-5 14-15-21-1v-6l21-1L7 12l5-5 16 14z"/></svg></span></h1>
        </div>
        <div class="hero-aside">
          <p>The charm of a classic pixel RPG.<br>The freedom to make your own story.</p>
          <p class="hero-small">Four different worlds. Four playable beginnings.<br>Take a look around. See where you belong.</p>
          <div class="hero-perks"><span>${icon('globe')} Open exploration</span><span>${icon('sword')} Real-time combat</span><span>${icon('chat')} Your choices</span></div>
        </div>
      </section>
      <section id="worlds" class="worlds-section" aria-labelledby="worlds-heading">
        <div class="section-topline"><div><h2 id="worlds-heading">Pick a world. Get a little lost.</h2><span class="section-subtitle">No downloads. No commitments. Just press play.</span></div><button class="surprise-button" data-action="surprise">${icon('shuffle')} Surprise me ${icon('arrow')}</button></div>
        <div class="filter-row"><div class="filters" role="group" aria-label="Filter worlds">${['All worlds','Fantasy','Sci-fi','Wasteland','Surreal'].map((filter,i) => `<button class="filter ${i === 0 ? 'active' : ''}" data-filter="${filter}">${filter}${i === 0 ? '<span class="filter-count">4</span>' : ''}</button>`).join('')}</div><span class="prototype-label"><span class="status-dot"></span> EARLY, PLAYABLE PROTOTYPES</span></div>
        <div class="selection-banner" ${selectedWorld ? '' : 'hidden'}></div>
        <div class="world-grid" id="world-grid"></div>
        <div class="gallery-note">${icon('spark')} A starting point, not a finished game. Your favorite world is the one we’ll build on.</div>
      </section>
      <section class="idea-section" id="idea">
        <div class="idea-intro"><div class="eyebrow">THE LITTLE BIG IDEA</div><h2>Old-school soul.<br>Open-world spirit.</h2><p>Familiar pixels. Unfamiliar paths.<br>A world that makes room for your story.</p></div>
        <div class="idea-feature">${icon('globe')}<h3>Follow your curiosity</h3><p>Wander off the path. Find hidden corners, new faces, and a reason to keep going.</p></div>
        <div class="idea-feature">${icon('chat')}<h3>Be someone, somewhere</h3><p>Meet the locals, choose your replies, and take on quests that give the world a little life.</p></div>
        <div class="idea-feature">${icon('sword')}<h3>Grow into your adventure</h3><p>Fight in real time, collect a little loot, and level up as you make your way.</p></div>
      </section>
    </main>
    <footer><a class="brand footer-brand" href="#">${brandMark}<span>sidequest.</span></a><span>Made for wandering.</span><div>Four worlds. Endless directions. <span class="footer-spark">✦</span></div></footer>
    <div class="toast" id="toast" role="status"></div>
    <div class="overlay" id="help-overlay" hidden>
      <section class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <button class="dialog-close icon-button" data-action="close-help" aria-label="Close instructions">${icon('close')}</button>
        <div class="eyebrow">A LITTLE FIELD GUIDE</div><h2 id="help-title">Just go exploring.</h2><p>Every world is a small, playable RPG. Talk to its people, follow a quest, and see what’s over the next hill.</p>
        <div class="control-list"><div><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> <span class="or">or</span> arrow keys</span><strong>Move</strong></div><div><span><kbd>Shift</kbd></span><strong>Sprint</strong></div><div><span><kbd>E</kbd> <span class="or">or</span> <kbd>Enter</kbd></span><strong>Talk / interact</strong></div><div><span><kbd>Space</kbd></span><strong>Attack</strong></div><div><span><kbd>M</kbd></span><strong>Open world map</strong></div><div><span><kbd>Esc</kbd></span><strong>Close / return</strong></div></div>
        <p class="help-tip">${icon('chat')} Start by talking to the person near you. They have a story—and a quest.</p><button class="primary-button" data-action="close-help">Let’s wander ${icon('arrow')}</button>
      </section>
    </div>
    <div class="game-overlay" id="game-overlay" hidden></div>
  `;
  renderCards();
  updateSelectionBanner();
  document.addEventListener('click', handleClick);
  document.addEventListener('keydown', handleGlobalKey);
}

function renderCards() {
  const filtered = worlds.filter(w => currentFilter === 'All worlds' || w.category === currentFilter);
  document.querySelector('#world-grid').innerHTML = filtered.map(w => `
    <article class="world-card ${selectedWorld === w.id ? 'is-selected' : ''}" style="--world-color:${w.color};--world-chip:${w.chip}" data-world="${w.id}">
      <div class="world-art" style="background:${w.gradient}">
        <canvas id="preview-${w.id}" width="720" height="360" aria-label="Pixel-art view of ${w.name}"></canvas>
        <div class="art-topline"><span class="world-genre"><span></span>${w.category}</span><button class="favorite-button ${favorites.has(w.id) ? 'is-favorite' : ''}" data-favorite="${w.id}" aria-label="${favorites.has(w.id) ? 'Remove' : 'Add'} ${w.name} ${favorites.has(w.id) ? 'from' : 'to'} shortlist" aria-pressed="${favorites.has(w.id)}">${icon('heart')}</button></div>
        <button class="scene-play" data-play="${w.id}" aria-label="Play ${w.name}"><span class="scene-play-icon">${icon('play')}</span><span>Step into this world</span></button>
        <div class="art-bottomline"><span class="pixel-coordinates">${w.location.toUpperCase()}<span> · </span> ${w.number === '02' ? '23:48' : w.number === '04' ? '18:17' : '09:41'}</span><span class="art-number">WORLD ${w.number}</span></div>
      </div>
      <div class="card-content"><div class="card-eyebrow"><span>${w.genre}</span><span class="card-number">/ ${w.number}</span></div><div class="card-heading"><h3>${w.name}</h3><span class="selected-chip" ${selectedWorld === w.id ? '' : 'hidden'}>${icon('check')} Your pick</span></div><p>${w.description}</p><div class="card-bottom"><div class="world-tags">${w.tags.map(t => `<span>${t}</span>`).join('')}</div><button class="play-button" data-play="${w.id}">Play prototype ${icon('arrowUp')}</button></div></div>
    </article>`).join('');
  filtered.forEach(w => drawPreview(document.getElementById(`preview-${w.id}`), w.id));
}

function updateSelectionBanner() {
  const banner = document.querySelector('.selection-banner');
  const chosen = worlds.find(w => w.id === selectedWorld);
  banner.hidden = !chosen;
  if (chosen) banner.innerHTML = `<span>${icon('check')} Your next adventure: <strong>${chosen.name}</strong><span class="selection-message"> — a good place to begin.</span></span><button data-action="clear-pick">Change my pick ${icon('close')}</button>`;
}

function handleClick(event) {
  const play = event.target.closest('[data-play]');
  if (play) return openGame(play.dataset.play);
  const favorite = event.target.closest('[data-favorite]');
  if (favorite) {
    const id = favorite.dataset.favorite;
    if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
    try { localStorage.setItem('sidequest-favorites', JSON.stringify([...favorites])); } catch {}
    renderCards();
    showToast(favorites.has(id) ? `${worlds.find(w=>w.id===id).name} added to your shortlist` : 'Removed from your shortlist');
    return;
  }
  const filter = event.target.closest('[data-filter]');
  if (filter) {
    currentFilter = filter.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(f => f.classList.toggle('active', f.dataset.filter === currentFilter));
    renderCards();
    return;
  }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'help') { activeGame?.togglePause?.(true); document.querySelector('#help-overlay').hidden = false; document.body.classList.add('modal-open'); document.querySelector('[data-action="close-help"]').focus(); }
  if (action === 'close-help') closeHelp();
  if (action === 'surprise') openGame(worlds[Math.floor(Math.random()*worlds.length)].id);
  if (action === 'close-game') closeGame();
  if (action === 'map') toggleMap();
  if (action === 'sound') toggleSound();
  if (action === 'interact') activeGame?.interact();
  if (action === 'attack') activeGame?.attack();
  if (action === 'select-world') chooseWorld();
  if (action === 'dismiss-dialogue') { activeGame?.dismissDialogue?.(); document.querySelector('#dialogue-box').hidden = true; }
  if (action === 'clear-pick') { selectedWorld = null; try { localStorage.removeItem('sidequest-selected'); } catch {} renderCards(); updateSelectionBanner(); }
  if (event.target.id === 'help-overlay') closeHelp();
}

function closeHelp() {
  document.querySelector('#help-overlay').hidden = true;
  activeGame?.togglePause?.(mapOpen);
  if (!activeGame) document.body.classList.remove('modal-open');
}

function handleGlobalKey(event) {
  if (activeGame && mapOpen && ['m', 'M'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); toggleMap(); return; }
  if (event.key === 'Escape') {
    if (!document.querySelector('#help-overlay').hidden) return closeHelp();
    if (mapOpen) return toggleMap();
    if (activeGame) {
      const dialogue = document.querySelector('#dialogue-box');
      if (dialogue && !dialogue.hidden) { activeGame.dismissDialogue?.(); dialogue.hidden = true; return; }
      closeGame();
    }
  }
}

function openGame(id) {
  if (activeGame) closeGame();
  activeWorld = worlds.find(w => w.id === id);
  const w = activeWorld;
  const overlay = document.querySelector('#game-overlay');
  overlay.innerHTML = `<section class="game-shell" role="dialog" aria-modal="true" aria-label="${w.name} playable prototype" style="--world-color:${w.color};--world-chip:${w.chip}">
    <header class="game-header"><button class="back-button" data-action="close-game">${icon('arrow')}<span>All worlds</span></button><div class="game-title"><span>WORLD ${w.number}</span><h2>${w.name}</h2><span class="prototype-badge">PROTOTYPE</span></div><div class="game-header-actions"><button class="icon-button" data-action="sound" aria-label="Turn ambient sound on" title="Ambient sound">${icon('volume')}<span class="sound-slash"></span></button><button class="icon-button" data-action="help" aria-label="How to play">${icon('monitor')}</button><button class="icon-button" data-action="close-game" aria-label="Close prototype">${icon('close')}</button></div></header>
    <div class="game-body"><div class="game-viewport"><canvas id="game-canvas" width="960" height="640" tabindex="0" aria-label="Explore ${w.name} using WASD, E to interact, and Space to attack"></canvas><div class="location-overlay"><span class="status-dot"></span><span id="game-location">${w.location}</span><span class="location-sub">FREE TO WANDER</span></div><button class="map-button" data-action="map">${icon('map')}<span>World map</span><kbd>M</kbd></button><div class="interact-hint" id="interact-hint" hidden></div><div class="game-toast" id="game-toast" role="status"></div>
    <div class="dialogue-box" id="dialogue-box" hidden><div class="dialogue-heading"><span class="dialogue-avatar">${icon('chat')}</span><strong id="dialogue-speaker"></strong><button class="icon-button" data-action="dismiss-dialogue" aria-label="Close dialogue">${icon('close')}</button></div><p id="dialogue-text"></p><div class="dialogue-choices" id="dialogue-choices"></div></div>
    <div class="map-overlay" id="map-overlay" hidden><div class="map-heading"><div><span class="eyebrow">YOUR LITTLE OPEN WORLD</span><h3>${w.name}</h3></div><button class="icon-button" data-action="map" aria-label="Close world map">${icon('close')}</button></div><canvas id="map-canvas" width="800" height="576" aria-label="World map showing your position"></canvas><div class="map-legend"><span><i></i> You are here</span><span>Explore the roads. Discover what’s between them.</span></div></div>
    <div class="touch-controls"><div class="touch-dpad"><button data-move="up" aria-label="Move up">↑</button><button data-move="left" aria-label="Move left">←</button><button data-move="down" aria-label="Move down">↓</button><button data-move="right" aria-label="Move right">→</button></div><div><button data-action="interact">E</button><button data-action="attack">${icon('sword')}</button></div></div></div>
    <aside class="game-sidebar"><div class="character-card"><div class="character-avatar"><canvas id="avatar-canvas" width="64" height="64"></canvas></div><div><span>${w.role}</span><strong>Level <span id="player-level">1</span><span class="character-level-note"> · Just getting started</span></strong></div></div><div class="stat-label"><span>HEALTH</span><span id="health-value">100 / 100</span></div><div class="stat-bar health-bar"><span id="health-fill" style="width:100%"></span></div><div class="stat-label"><span>EXPERIENCE</span><span id="xp-value">0 / 100</span></div><div class="stat-bar xp-bar"><span id="xp-fill" style="width:0%"></span></div>
    <div class="sidebar-divider"></div><div class="sidebar-overline">${icon('flag')} YOUR FIRST CHAPTER</div><h3 id="quest-title">A story to follow</h3><p id="quest-description">${w.hook}</p><div class="quest-progress" id="quest-progress"></div><div class="destination-hint" id="destination-hint"></div><div class="sidebar-divider"></div><div class="pocket-row">${icon('bag')}<span>In your pockets</span><strong id="coin-value">0 coins</strong></div><p class="inventory-text" id="inventory-text">Room for a few discoveries.</p><div class="field-note"><span>FIELD NOTE 01</span><p>${w.hook}</p></div><div class="sidebar-choice"><p>Feeling at home here?</p><button class="primary-button" data-action="select-world">Choose this world ${icon('check')}</button><span>You can change your mind anytime.</span></div></aside></div>
    <div class="game-footer"><div><span><kbd>W A S D</kbd> Move</span><span><kbd>Shift</kbd> Sprint</span><span><kbd>E</kbd> Talk / interact</span><span><kbd>Space</kbd> Attack</span></div><span><span class="status-dot"></span> A SMALL SLICE OF A BIGGER WORLD</span></div>
  </section>`;
  overlay.hidden = false;
  document.body.classList.add('modal-open');
  mapOpen = false;
  lastState = null;
  activeGame = createGame(document.querySelector('#game-canvas'), id, { onState: updateGameState, onDialogue: showDialogue, onToast: showGameToast, onMap: toggleMap, onDismissDialogue: () => { const box = document.querySelector('#dialogue-box'); if (box) box.hidden = true; } });
  drawAvatar(w.id);
  document.querySelector('#game-canvas').focus();
  overlay.querySelectorAll('[data-move]').forEach(button => {
    button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); activeGame?.setMove(button.dataset.move,true); });
    for (const ev of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(ev,()=>activeGame?.setMove(button.dataset.move,false));
  });
  if (soundOn) startAmbient(w.id);
}

function drawAvatar(theme) {
  const canvas = document.querySelector('#avatar-canvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled=false;
  const colors={moss:['#cfb980','#536d47','#ef6046'],neon:['#c9a5bd','#645286','#56dcda'],dust:['#d6b480','#986640','#d25d3c'],odd:['#d8bca9','#6874a9','#e57788']};
  const [skin,hair,shirt]=colors[theme];
  ctx.fillStyle=hair; ctx.fillRect(20,10,24,12);ctx.fillRect(16,18,32,12);
  ctx.fillStyle=skin;ctx.fillRect(20,22,24,18);ctx.fillStyle=hair;ctx.fillRect(20,22,8,5);
  ctx.fillStyle='#292738';ctx.fillRect(26,29,3,4);ctx.fillRect(37,29,3,4);
  ctx.fillStyle=shirt;ctx.fillRect(16,42,32,14);ctx.fillRect(12,46,8,10);ctx.fillRect(44,46,8,10);
  ctx.fillStyle=skin;ctx.fillRect(12,56,8,5);ctx.fillRect(44,56,8,5);
}

function updateGameState(state) {
  lastState=state;
  if (!document.querySelector('#health-value')) return;
  setText('health-value', `${Math.ceil(state.health)} / ${state.maxHealth}`);
  document.querySelector('#health-fill').style.width = `${Math.max(0,state.health/state.maxHealth*100)}%`;
  setText('xp-value',`${state.xp} / ${state.xpNext}`);
  document.querySelector('#xp-fill').style.width=`${Math.min(100,state.xp/state.xpNext*100)}%`;
  setText('player-level',state.level);
  setText('coin-value',`${state.coins} ${state.currency || 'coins'}`);
  setText('quest-title',state.questTitle);
  setText('quest-description',state.questDescription);
  setText('game-location',state.location || activeWorld?.location);
  const progress = document.querySelector('#quest-progress');
  const complete = state.questProgress >= state.questTarget;
  progress.innerHTML=`<div class="quest-progress-label"><span>${state.questComplete ? 'Chapter complete' : complete ? 'Ready to turn in' : 'Quest progress'}</span><span>${state.questProgress} / ${state.questTarget}</span></div><div class="quest-pips">${Array.from({length:state.questTarget || 3},(_,i)=>`<i class="${i<state.questProgress ? 'filled' : ''}"></i>`).join('')}</div>`;
  const hint=document.querySelector('#interact-hint');
  hint.hidden=!state.interactHint;
  hint.innerHTML=state.interactHint ? `<kbd>E</kbd> ${escapeHtml(state.interactHint)}` : '';
  setText('destination-hint',state.destinationHint || state.destination || 'Follow the paths. Talk to the locals.');
  if (state.inventory) setText('inventory-text',Array.isArray(state.inventory) ? state.inventory.join(' · ') || 'Room for a few discoveries.' : state.inventory);
  if (mapOpen) renderMap();
}
function setText(id,value){ const el=document.getElementById(id); if(el&&value!==undefined)el.textContent=value; }
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function showDialogue(dialogue) {
  if (!activeWorld) return;
  const box = document.querySelector('#dialogue-box');
  box.hidden=false;
  setText('dialogue-speaker',dialogue.speaker);
  setText('dialogue-text',dialogue.text);
  const choices=document.querySelector('#dialogue-choices');
  choices.innerHTML='';
  (dialogue.choices || []).forEach(choice=>{
    const button=document.createElement('button');
    button.innerHTML=`<span>${escapeHtml(choice.label)}</span>${icon('chevron')}`;
    button.addEventListener('click',()=>{box.hidden=true;choice.action?.();if (box.hidden) document.querySelector('#game-canvas')?.focus();});
    choices.appendChild(button);
  });
}

function closeGame() {
  activeGame?.destroy();
  activeGame=null;
  activeWorld=null;
  mapOpen=false;
  stopAmbient();
  document.querySelector('#game-overlay').hidden=true;
  document.querySelector('#game-overlay').innerHTML='';
  document.body.classList.remove('modal-open');
}
function chooseWorld(){
  const name=activeWorld.name;
  selectedWorld=activeWorld.id;
  try{localStorage.setItem('sidequest-selected',selectedWorld);}catch{}
  closeGame();renderCards();updateSelectionBanner();
  showToast(`${name} is your pick. Your adventure starts here.`);
  document.querySelector('#worlds').scrollIntoView({behavior:'smooth',block:'start'});
}
function toggleMap(){
  if(!activeGame)return;
  mapOpen=!mapOpen;
  document.querySelector('#map-overlay').hidden=!mapOpen;
  activeGame.togglePause?.(mapOpen);
  if(mapOpen)renderMap();else document.querySelector('#game-canvas').focus();
}
function renderMap(){
  const canvas=document.querySelector('#map-canvas');if(!canvas||!activeWorld)return;
  const ctx=canvas.getContext('2d');
  ctx.imageSmoothingEnabled=false;
  const scale=Math.min(canvas.width/WORLD_SIZE.width,canvas.height/WORLD_SIZE.height);
  drawWorld(ctx,activeWorld.id,{x:0,y:0,width:canvas.width,height:canvas.height,scale,time:0,entities:lastState?.entities || []});
  if(lastState){const x=lastState.x*scale,y=lastState.y*scale;ctx.fillStyle='#fff8dc';ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f0643b';ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();}
  if(lastState?.destination){const x=lastState.destination.x*scale,y=lastState.destination.y*scale;ctx.fillStyle='#f3ce72';ctx.strokeStyle='#3e4033';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y-6);ctx.lineTo(x+5,y);ctx.lineTo(x,y+6);ctx.lineTo(x-5,y);ctx.closePath();ctx.fill();ctx.stroke();}
}
let toastTimeout;
function showToast(message){const toast=document.querySelector('#toast');toast.innerHTML=`${icon('check')}<span>${escapeHtml(message)}</span>`;toast.classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>toast.classList.remove('visible'),4000);}
let gameToastTimeout;
function showGameToast(message){const toast=document.querySelector('#game-toast');if(!toast)return;toast.textContent=message;toast.classList.add('visible');clearTimeout(gameToastTimeout);gameToastTimeout=setTimeout(()=>toast.classList.remove('visible'),3200);}
function toggleSound(){soundOn=!soundOn;const button=document.querySelector('[data-action="sound"]');button?.classList.toggle('sound-on',soundOn);button?.setAttribute('aria-label',`Turn ambient sound ${soundOn?'off':'on'}`);if(soundOn&&activeWorld)startAmbient(activeWorld.id);else stopAmbient();}
function startAmbient(theme){
  stopAmbient();
  try{
    soundContext ||= new (window.AudioContext||window.webkitAudioContext)();
    soundContext.resume();
    const gain=soundContext.createGain();gain.gain.value=0.016;gain.connect(soundContext.destination);
    const notes={moss:[130.81,196,261.63],neon:[110,164.81,220],dust:[146.83,220,293.66],odd:[174.61,261.63,349.23]}[theme];
    notes.forEach((frequency,i)=>{const oscillator=soundContext.createOscillator();oscillator.type='sine';oscillator.frequency.value=frequency;oscillator.detune.value=i*3;oscillator.connect(gain);oscillator.start();ambientOscillators.push(oscillator);});
  }catch{showGameToast('Ambient sound is unavailable in this browser.');}
}
function stopAmbient(){ambientOscillators.forEach(o=>{try{o.stop();}catch{}});ambientOscillators=[];}
renderApp();
