import './style.css';
import { drawPreview, drawWorld, drawCharacter, getWorldSize, getWorldRegions } from './world-renderer.js';
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
  { id: 'lynch', number: '05', name: 'Velvet Static', category: 'Mystery', genre: 'SOME ROOMS REMEMBER YOU', color: '#995461', chip: '#f1e2e7', line: 'A quiet town. A county full of secrets.', description: 'Follow June’s trail through Mercy Falls, a shuttered mill, a lakeside observatory, and a station that never closed. Question witnesses, cross into their dreams, and decide what the county remembers.', tags: ['County roads', 'Branching dialogue', 'Two realities'], location: 'Mercy Falls', role: 'The late arrival', hook: 'The motel has kept a room for you for thirteen years. You have never been here before. The night clerk disagrees.', gradient: '#4c293e', isNew: true, isFinalist: true, time: '03:17' },
  { id: 'shinobi', number: '06', name: 'Hidden Ember', category: 'Shinobi', genre: 'YOUR NINJA WAY STARTS HERE', color: '#d77529', chip: '#fff0d9', line: 'Beyond the village. Into your own legend.', description: 'Leave the Village Hidden in the Reeds for cedar forests, waterfall training, lantern markets, and distant clan outposts. Master chakra, hear every side of an old betrayal, and choose your ninja way.', tags: ['Chakra & jutsus', 'Distant districts', 'Clan missions'], location: 'Hidden Reed Village', role: 'The genin', hook: 'A stolen mission scroll has put two clans at odds. Your first field assignment could start a war—or stop one.', gradient: '#69a65c', isNew: true, isFinalist: true, time: '07:12' },
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
let abilitiesSignature = '';
let journalSignature = '';
let explorationSignature = '';
const isFinalist = id => id === 'lynch' || id === 'shinobi';

function renderApp() {
  document.querySelector('#app').innerHTML = `
    <header class="site-header">
      <a class="brand" href="#" aria-label="Sidequest home">${brandMark}<span>sidequest<span class="brand-period">.</span></span></a>
      <nav class="main-nav" aria-label="Main navigation">
        <a class="nav-active" href="#worlds">The worlds <span>${String(worlds.length).padStart(2, '0')}</span></a>
        <a href="#idea">The idea</a>
        <button class="nav-how" data-action="help">How to play ${icon('arrowUp')}</button>
      </nav>
      ${location.protocol === 'file:' ? '<div class="header-status"><span class="status-dot"></span> Six worlds, wherever you go</div>' : `<a class="header-status download-link" href="/downloads/sidequest-prototypes.zip" download>${icon('download')} Download prototypes</a>`}
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
          <p class="hero-small">Two favorites. More roads and deeper stories.<br>Explore the expanded Velvet Static and Hidden Ember.</p>
          <div class="hero-perks"><span>${icon('globe')} Open exploration</span><span>${icon('sword')} Real-time combat</span><span>${icon('chat')} Your choices</span></div>
        </div>
      </section>
      <section id="worlds" class="worlds-section" aria-labelledby="worlds-heading">
        <div class="section-topline"><div><h2 id="worlds-heading">Pick a world. Get a little lost.</h2><span class="section-subtitle">No downloads. No commitments. Just press play.</span></div><button class="surprise-button" data-action="surprise">${icon('shuffle')} Surprise me ${icon('arrow')}</button></div>
        <div class="filter-row"><div class="filters" role="group" aria-label="Filter worlds">${['All worlds','Mystery','Shinobi','Fantasy','Sci-fi','Wasteland','Surreal'].map((filter,i) => `<button class="filter ${i === 0 ? 'active' : ''}" data-filter="${filter}">${filter}${i === 0 ? `<span class="filter-count">${worlds.length}</span>` : ''}</button>`).join('')}</div><span class="prototype-label"><span class="status-dot"></span> EARLY, PLAYABLE PROTOTYPES</span></div>
        <div class="selection-banner" ${selectedWorld ? '' : 'hidden'}></div>
        <div class="world-grid" id="world-grid"></div>
        <div class="gallery-note">${icon('spark')} Velvet Static and Hidden Ember are the finalists. Two worlds to keep exploring.</div>
      </section>
      <section class="idea-section" id="idea">
        <div class="idea-intro"><div class="eyebrow">THE LITTLE BIG IDEA</div><h2>Old-school soul.<br>Open-world spirit.</h2><p>Familiar pixels. Unfamiliar paths.<br>A world that makes room for your story.</p></div>
        <div class="idea-feature">${icon('globe')}<h3>Follow your curiosity</h3><p>Wander off the path. Find hidden corners, new faces, and a reason to keep going.</p></div>
        <div class="idea-feature">${icon('chat')}<h3>Be someone, somewhere</h3><p>Meet the locals, choose your replies, and take on quests that give the world a little life.</p></div>
        <div class="idea-feature">${icon('sword')}<h3>Grow into your adventure</h3><p>Fight in real time, collect a little loot, and level up as you make your way.</p></div>
      </section>
    </main>
    <footer><a class="brand footer-brand" href="#">${brandMark}<span>sidequest.</span></a><span>Made for wandering.</span><div>Six worlds. Endless directions. <span class="footer-spark">✦</span></div></footer>
    <div class="toast" id="toast" role="status"></div>
    <div class="overlay" id="help-overlay" hidden>
      <section class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <button class="dialog-close icon-button" data-action="close-help" aria-label="Close instructions">${icon('close')}</button>
        <div class="eyebrow">A LITTLE FIELD GUIDE</div><h2 id="help-title">Just go exploring.</h2><p>Every world is a small, playable RPG. Talk to its people, follow a quest, and see what’s over the next hill.</p>
        <div class="control-list"><div><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> <span class="or">or</span> arrow keys</span><strong>Move</strong></div><div><span><kbd>Shift</kbd></span><strong>Sprint</strong></div><div><span><kbd>E</kbd> <span class="or">or</span> <kbd>Enter</kbd></span><strong>Talk / interact</strong></div><div><span><kbd>Space</kbd></span><strong>Attack / camera flash</strong></div><div><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></span><strong>Shinobi jutsus</strong></div><div><span><kbd>Q</kbd></span><strong>Cross into a dream</strong></div><div><span><kbd>M</kbd></span><strong>Open world map</strong></div><div><span><kbd>T</kbd></span><strong>Travel in the two finalists</strong></div><div><span><kbd>Esc</kbd></span><strong>Close / return</strong></div></div>
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
  const filtered = worlds.filter(w => currentFilter === 'All worlds' || w.category === currentFilter).sort((a, b) => Number(Boolean(b.isNew)) - Number(Boolean(a.isNew)));
  document.querySelector('#world-grid').innerHTML = filtered.map(w => `
    <article class="world-card ${selectedWorld === w.id ? 'is-selected' : ''}" style="--world-color:${w.color};--world-chip:${w.chip}" data-world="${w.id}">
      <div class="world-art" style="background:${w.gradient}">
        <canvas id="preview-${w.id}" width="720" height="360" aria-label="Pixel-art view of ${w.name}"></canvas>
        <div class="art-topline"><div class="art-badges"><span class="world-genre"><span></span>${w.category}</span>${w.isFinalist ? '<span class="new-world-badge finalist-badge">FINALIST</span>' : w.isNew ? '<span class="new-world-badge">NEW WORLD</span>' : ''}</div><button class="favorite-button ${favorites.has(w.id) ? 'is-favorite' : ''}" data-favorite="${w.id}" aria-label="${favorites.has(w.id) ? 'Remove' : 'Add'} ${w.name} ${favorites.has(w.id) ? 'from' : 'to'} shortlist" aria-pressed="${favorites.has(w.id)}">${icon('heart')}</button></div>
        <button class="scene-play" data-play="${w.id}" aria-label="Play ${w.name}"><span class="scene-play-icon">${icon('play')}</span><span>Step into this world</span></button>
        <div class="art-bottomline"><span class="pixel-coordinates">${w.location.toUpperCase()}<span> · </span> ${w.time || (w.number === '02' ? '23:48' : w.number === '04' ? '18:17' : '09:41')}</span><span class="art-number">WORLD ${w.number}</span></div>
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
  const ability = event.target.closest('[data-ability]');
  if (ability) { activeGame?.useAbility?.(ability.dataset.ability); document.querySelector('#game-canvas')?.focus(); return; }
  const play = event.target.closest('[data-play]');
  if (play) return openGame(play.dataset.play);
  const tracked = event.target.closest('[data-track-quest]');
  if (tracked) { activeGame?.trackQuest?.(tracked.dataset.trackQuest); document.querySelector('#game-canvas')?.focus(); return; }
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
  if (action === 'travel') { if(mapOpen)toggleMap(); activeGame?.openTravel?.(); }
  if (action === 'sound') toggleSound();
  if (action === 'interact') activeGame?.interact();
  if (action === 'attack') activeGame?.attack();
  if (action === 'select-world') chooseWorld();
  if (action === 'dismiss-dialogue') { activeGame?.dismissDialogue?.(); document.querySelector('#dialogue-box').hidden = true; if(isFinalist(activeWorld?.id))document.querySelector('#game-canvas')?.focus(); }
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
  if(activeGame && mapOpen && isFinalist(activeWorld?.id) && ['t','T'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();toggleMap();activeGame.openTravel?.();return;}
  if (event.key === 'Escape') {
    if (!document.querySelector('#help-overlay').hidden) return closeHelp();
    if (mapOpen) return toggleMap();
    if (activeGame) {
      const dialogue = document.querySelector('#dialogue-box');
      if (dialogue && !dialogue.hidden) { activeGame.dismissDialogue?.(); dialogue.hidden = true; if(isFinalist(activeWorld?.id))document.querySelector('#game-canvas')?.focus(); return; }
      closeGame();
    }
  }
}

function openGame(id) {
  if (activeGame) closeGame();
  activeWorld = worlds.find(w => w.id === id);
  const w = activeWorld;
  const overlay = document.querySelector('#game-overlay');
  overlay.innerHTML = `<section class="game-shell" data-theme="${w.id}" role="dialog" aria-modal="true" aria-label="${w.name} playable prototype" style="--world-color:${w.color};--world-chip:${w.chip}">
    <header class="game-header"><button class="back-button" data-action="close-game">${icon('arrow')}<span>All worlds</span></button><div class="game-title"><span>WORLD ${w.number}</span><h2>${w.name}</h2><span class="prototype-badge">PROTOTYPE</span></div><div class="game-header-actions"><button class="icon-button" data-action="sound" aria-label="Turn ambient sound on" title="Ambient sound">${icon('volume')}<span class="sound-slash"></span></button><button class="icon-button" data-action="help" aria-label="How to play">${icon('monitor')}</button><button class="icon-button" data-action="close-game" aria-label="Close prototype">${icon('close')}</button></div></header>
    <div class="game-body"><div class="game-viewport"><canvas id="game-canvas" width="960" height="640" tabindex="0" aria-label="Explore ${w.name} using WASD, E to interact, and Space to attack"></canvas><div class="location-overlay"><span class="status-dot"></span><span id="game-location">${w.location}</span><span class="location-sub">FREE TO WANDER</span></div><button class="map-button" data-action="map">${icon('map')}<span>World map</span><kbd>M</kbd></button><div class="interact-hint" id="interact-hint" hidden></div><div class="game-toast" id="game-toast" role="status"></div>
    <div class="dialogue-box" id="dialogue-box" hidden><div class="dialogue-heading"><span class="dialogue-avatar">${isFinalist(w.id) ? '<canvas id="dialogue-portrait" width="56" height="56" aria-hidden="true"></canvas>' : icon('chat')}</span>${isFinalist(w.id) ? '<div class="dialogue-speaker-block"><strong id="dialogue-speaker"></strong><span id="dialogue-context"></span></div>' : '<strong id="dialogue-speaker"></strong>'}<button class="icon-button" data-action="dismiss-dialogue" aria-label="Close dialogue">${icon('close')}</button></div><p id="dialogue-text"></p><div class="dialogue-choices" id="dialogue-choices"></div></div>
    <div class="map-overlay" id="map-overlay" hidden><div class="map-heading"><div><span class="eyebrow">${isFinalist(w.id) ? 'ROADS YOU HAVE YET TO WALK' : 'YOUR LITTLE OPEN WORLD'}</span><h3>${w.name}</h3></div><button class="icon-button" data-action="map" aria-label="Close world map">${icon('close')}</button></div><canvas id="map-canvas" width="800" height="576" aria-label="World map showing your position"></canvas><div class="map-legend"><span><i></i> You are here</span><span>${isFinalist(w.id) ? 'Gold: your next stop · Blue: a travel stop' : 'Explore the roads. Discover what’s between them.'}</span></div>${isFinalist(w.id) ? '<div class="map-travel-row"><span id="map-exploration"></span><button data-action="travel">Travel to a discovered stop <kbd>T</kbd></button></div>' : ''}</div>
    <div class="ability-hud" id="ability-hud" hidden></div>
    <div class="touch-controls"><div class="touch-dpad"><button data-move="up" aria-label="Move up">↑</button><button data-move="left" aria-label="Move left">←</button><button data-move="down" aria-label="Move down">↓</button><button data-move="right" aria-label="Move right">→</button></div><div><button data-action="interact">E</button><button data-action="attack" aria-label="${w.id === 'lynch' ? 'Camera flash' : 'Attack'}">${icon(w.id === 'lynch' ? 'spark' : 'sword')}</button></div></div></div>
    <aside class="game-sidebar"><div class="character-card"><div class="character-avatar"><canvas id="avatar-canvas" width="64" height="64"></canvas></div><div><span>${w.role}</span><strong>Level <span id="player-level">1</span><span class="character-level-note"> · <span id="player-rank">Just getting started</span></span></strong></div></div><div class="stat-label"><span>HEALTH</span><span id="health-value">100 / 100</span></div><div class="stat-bar health-bar"><span id="health-fill" style="width:100%"></span></div><div class="stat-label"><span>EXPERIENCE</span><span id="xp-value">0 / 100</span></div><div class="stat-bar xp-bar"><span id="xp-fill" style="width:0%"></span></div><div class="resource-panel" id="resource-panel" hidden><div class="stat-label"><span id="resource-label"></span><span id="resource-value"></span></div><div class="stat-bar resource-bar"><span id="resource-fill"></span></div></div>
    <div class="sidebar-divider"></div><div class="sidebar-overline">${icon('flag')} YOUR FIRST CHAPTER</div><h3 id="quest-title">A story to follow</h3><p id="quest-description">${w.hook}</p><div class="quest-progress" id="quest-progress"></div><div class="destination-hint" id="destination-hint"></div>${isFinalist(w.id) ? '<div class="exploration-summary" id="exploration-summary"></div><details class="side-stories" id="side-stories"><summary>Other stories <span id="side-story-count">0</span></summary><div id="side-story-list"></div></details>' : ''}<details class="journal-section" id="journal-section" hidden><summary>Field notes <span id="journal-count">0</span></summary><ul id="journal-entries"></ul></details><div class="sidebar-divider"></div><div class="pocket-row">${icon('bag')}<span>In your pockets</span><strong id="coin-value">0 coins</strong></div><p class="inventory-text" id="inventory-text">Room for a few discoveries.</p><div class="field-note"><span>FIELD NOTE 01</span><p>${w.hook}</p></div><div class="sidebar-choice"><p>Feeling at home here?</p><button class="primary-button" data-action="select-world">Choose this world ${icon('check')}</button><span>You can change your mind anytime.</span></div></aside></div>
    <div class="game-footer"><div><span><kbd>W A S D</kbd> Move</span><span><kbd>Shift</kbd> Sprint</span><span><kbd>E</kbd> Talk / interact</span><span><kbd>Space</kbd> ${w.id === 'lynch' ? 'Camera flash' : w.id === 'shinobi' ? 'Kunai' : 'Attack'}</span>${w.id === 'lynch' ? '<span><kbd>Q</kbd> Dream crossing</span>' : w.id === 'shinobi' ? '<span><kbd>1 / 2 / 3</kbd> Jutsus</span>' : ''}${isFinalist(w.id) ? '<span><kbd>T</kbd> Travel</span>' : ''}</div><span><span class="status-dot"></span> A SMALL SLICE OF A BIGGER WORLD</span></div>
  </section>`;
  overlay.hidden = false;
  document.body.classList.add('modal-open');
  mapOpen = false;
  lastState = null;
  abilitiesSignature = '';
  journalSignature = '';
  explorationSignature = '';
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
  if(isFinalist(theme)){
    ctx.fillStyle=theme==='shinobi' ? '#ffead0' : '#eee0d8';ctx.fillRect(0,0,64,64);
    ctx.save();ctx.translate(32,61);ctx.scale(1.25,1.25);
    drawCharacter(ctx,0,0,theme,{facing:'down'});
    ctx.restore();return;
  }
  const colors={moss:['#cfb980','#536d47','#ef6046'],neon:['#c9a5bd','#645286','#56dcda'],dust:['#d6b480','#986640','#d25d3c'],odd:['#d8bca9','#6874a9','#e57788'],lynch:['#edccad','#312535','#73344c'],shinobi:['#e9bd85','#263b48','#ed8b42']};
  const [skin,hair,shirt]=colors[theme];
  ctx.fillStyle=hair; ctx.fillRect(20,10,24,12);ctx.fillRect(16,18,32,12);
  ctx.fillStyle=skin;ctx.fillRect(20,22,24,18);ctx.fillStyle=hair;ctx.fillRect(20,22,8,5);
  ctx.fillStyle='#292738';ctx.fillRect(26,29,3,4);ctx.fillRect(37,29,3,4);
  ctx.fillStyle=shirt;ctx.fillRect(16,42,32,14);ctx.fillRect(12,46,8,10);ctx.fillRect(44,46,8,10);
  ctx.fillStyle=skin;ctx.fillRect(12,56,8,5);ctx.fillRect(44,56,8,5);
  if(theme==='lynch'){ctx.fillStyle='#352737';ctx.fillRect(28,42,8,14);ctx.fillStyle='#c7a78c';ctx.fillRect(30,44,4,7);ctx.fillStyle='#ead7ac';ctx.fillRect(42,50,9,8);ctx.fillStyle='#493849';ctx.fillRect(44,52,5,4);}
}

function updateGameState(state) {
  lastState=state;
  if (!document.querySelector('#health-value')) return;
  setText('health-value', `${Math.ceil(state.health)} / ${state.maxHealth}`);
  document.querySelector('#health-fill').style.width = `${Math.max(0,state.health/state.maxHealth*100)}%`;
  setText('xp-value',`${state.xp} / ${state.xpNext}`);
  document.querySelector('#xp-fill').style.width=`${Math.min(100,state.xp/state.xpNext*100)}%`;
  setText('player-level',state.level);
  if(state.rank) setText('player-rank',state.rank);
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
  const phaseLabel=document.querySelector('.location-sub');
  if(phaseLabel) phaseLabel.textContent=state.phase ? (state.phase==='dream' ? 'DREAM SIDE' : 'WAKING SIDE') : 'FREE TO WANDER';
  document.querySelector('.game-shell')?.setAttribute('data-phase',state.phase || '');
  updateAbilities(state);
  updateJournal(state.journal || []);
  updateExploration(state);
  if (mapOpen) renderMap();
}

function updateAbilities(state){
  const resource=document.querySelector('#resource-panel');
  if(!resource)return;
  resource.hidden=!state.resource;
  if(state.resource){
    setText('resource-label',state.resource.label.toUpperCase());
    setText('resource-value',`${Math.floor(state.resource.value)} / ${state.resource.max}`);
    document.querySelector('#resource-fill').style.width=`${Math.max(0,Math.min(100,state.resource.value/state.resource.max*100))}%`;
  }
  const hud=document.querySelector('#ability-hud');
  const abilities=state.abilities || [];
  hud.hidden=abilities.length===0 || !document.querySelector('#dialogue-box').hidden || mapOpen;
  const signature=abilities.map(a=>`${a.id}:${a.key}:${a.name}`).join('|');
  if(signature!==abilitiesSignature){
    abilitiesSignature=signature;
    hud.innerHTML=abilities.map(a=>`<button class="ability-button" data-ability="${escapeHtml(a.id)}" title="${escapeHtml(a.description)}" aria-label="${escapeHtml(a.name)} (${escapeHtml(a.key)}): ${escapeHtml(a.description)}"><kbd>${escapeHtml(a.key)}</kbd><span><strong>${escapeHtml(a.name)}</strong><small class="ability-status"></small></span><i class="ability-ready-dot"></i></button>`).join('');
  }
  abilities.forEach(a=>{
    const button=[...hud.querySelectorAll('[data-ability]')].find(b=>b.dataset.ability===a.id);
    if(!button)return;
    button.disabled=!a.ready;
    button.classList.toggle('is-ready',a.ready);
    button.querySelector('.ability-status').textContent=a.cooldown>0 ? `${a.cooldown.toFixed(1)}s cooldown` : a.cost>0 ? `${a.cost} chakra` : state.phase==='dream' ? 'Return to waking' : 'Enter the dream';
  });
}

function updateJournal(entries){
  const section=document.querySelector('#journal-section');
  if(!section)return;
  section.hidden=entries.length===0;
  setText('journal-count',entries.length);
  const signature=JSON.stringify(entries);
  if(signature===journalSignature)return;
  journalSignature=signature;
  document.querySelector('#journal-entries').innerHTML=entries.map(entry=>typeof entry==='string' ? `<li>${escapeHtml(entry)}</li>` : `<li><strong>${escapeHtml(entry.title || 'A discovery')}</strong><p>${escapeHtml(entry.text || '')}</p>${entry.phase ? `<span>${escapeHtml(entry.phase)} side</span>` : ''}</li>`).join('');
}
function updateExploration(state){
  if(!activeWorld || !isFinalist(activeWorld.id))return;
  const regions=getWorldRegions(activeWorld.id);
  const visited=Array.isArray(state.regionsVisited) ? state.regionsVisited.length : Number(state.regionsVisited || 0);
  const stops=state.travelPoints || [];
  const unlocked=stops.filter(stop=>stop.discovered).length;
  setText('exploration-summary',`${visited} / ${regions.length} districts discovered · ${unlocked} travel stops`);
  setText('map-exploration',`${visited} / ${regions.length} districts · ${unlocked} / ${stops.length} travel stops found`);
  const quests=state.sideQuests || [];
  setText('side-story-count',quests.filter(q=>q.status!=='complete').length);
  const signature=JSON.stringify({tracked:state.trackedQuest,quests:quests.map(q=>[q.id,q.title,q.status,q.progress,q.target,q.description])});
  if(signature===explorationSignature)return;
  explorationSignature=signature;
  document.querySelector('#side-story-list').innerHTML=(quests.length ? quests.map(quest=>`<article class="side-story-card ${state.trackedQuest===quest.id ? 'is-tracked' : ''}"><strong>${escapeHtml(quest.title)}</strong><small>${quest.status==='complete' ? 'Complete' : quest.status==='ready' ? 'Return to your contact' : `${quest.progress || 0} / ${quest.target || 1}`}</small><p>${escapeHtml(quest.description || 'Follow this story to its next stop.')}</p>${quest.status!=='complete' ? `<button data-track-quest="${escapeHtml(quest.id)}" aria-pressed="${state.trackedQuest===quest.id}">${state.trackedQuest===quest.id ? 'Following this story' : 'Follow this story'} ${icon('arrow')}</button>` : ''}</article>`).join('')+`<button class="track-main" data-track-quest="main" aria-pressed="${state.trackedQuest==='main'}">Follow the main story ${icon('flag')}</button>` : '<p class="side-story-empty">People beyond the village have stories of their own. Ask what they need.</p>');
}
function setText(id,value){ const el=document.getElementById(id); if(el&&value!==undefined)el.textContent=value; }
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function showDialogue(dialogue) {
  if (!activeWorld) return;
  const box = document.querySelector('#dialogue-box');
  box.hidden=false;
  setText('dialogue-speaker',dialogue.speaker);
  setText('dialogue-text',dialogue.text);
  if(isFinalist(activeWorld.id)){
    const portrait=document.querySelector('#dialogue-portrait');
    const actor=dialogue.portrait || lastState?.entities?.find(entity=>entity.type==='npc' && entity.name===dialogue.speaker);
    const ctx=portrait.getContext('2d');ctx.clearRect(0,0,56,56);ctx.imageSmoothingEnabled=false;
    ctx.save();ctx.translate(28,54);ctx.scale(1.05,1.05);
    drawCharacter(ctx,0,0,activeWorld.id,{...actor,npc:Boolean(actor),type:actor ? 'npc' : 'player',facing:'down',phase:lastState?.phase || 'waking'});
    ctx.restore();
    setText('dialogue-context',lastState?.currentRegionName || lastState?.location || activeWorld.location);
  }
  const choices=document.querySelector('#dialogue-choices');
  choices.innerHTML='';
  (dialogue.choices || []).forEach(choice=>{
    const button=document.createElement('button');
    button.innerHTML=`<span>${escapeHtml(choice.label)}</span>${icon('chevron')}`;
    button.addEventListener('click',()=>{box.hidden=true;choice.action?.();if (box.hidden) document.querySelector('#game-canvas')?.focus();});
    choices.appendChild(button);
  });
  if(isFinalist(activeWorld.id))choices.querySelector('button')?.focus({preventScroll:true});
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
  const size=lastState?.worldSize || getWorldSize(activeWorld.id);
  const scale=Math.min(canvas.width/size.width,canvas.height/size.height);
  drawWorld(ctx,activeWorld.id,{x:0,y:0,width:canvas.width,height:canvas.height,scale,time:0,entities:lastState?.entities || [],phase:lastState?.phase});
  if(isFinalist(activeWorld.id)){
    for(const stop of lastState?.travelPoints || []){if(!stop.discovered)continue;const x=Math.round(stop.x*scale),y=Math.round(stop.y*scale);ctx.fillStyle='#bce2f0';ctx.fillRect(x-3,y-3,6,6);ctx.fillStyle='#438aac';ctx.fillRect(x-1,y-1,2,2);}
    if(lastState?.destination){const x=Math.round(lastState.destination.x*scale),y=Math.round(lastState.destination.y*scale);ctx.fillStyle='#f3ce72';ctx.fillRect(x-4,y-2,8,4);ctx.fillRect(x-2,y-4,4,8);}
    if(lastState){const x=Math.round(lastState.x*scale),y=Math.round(lastState.y*scale);ctx.fillStyle='#fff8dc';ctx.fillRect(x-4,y-3,8,6);ctx.fillStyle='#f0643b';ctx.fillRect(x-2,y-2,4,4);}
  }else{
    if(lastState){const x=lastState.x*scale,y=lastState.y*scale;ctx.fillStyle='#fff8dc';ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f0643b';ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();}
    if(lastState?.destination){const x=lastState.destination.x*scale,y=lastState.destination.y*scale;ctx.fillStyle='#f3ce72';ctx.strokeStyle='#3e4033';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y-6);ctx.lineTo(x+5,y);ctx.lineTo(x,y+6);ctx.lineTo(x-5,y);ctx.closePath();ctx.fill();ctx.stroke();}
  }
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
    const notes={moss:[130.81,196,261.63],neon:[110,164.81,220],dust:[146.83,220,293.66],odd:[174.61,261.63,349.23],lynch:[65.41,98,138.59],shinobi:[146.83,196,293.66]}[theme];
    notes.forEach((frequency,i)=>{const oscillator=soundContext.createOscillator();oscillator.type='sine';oscillator.frequency.value=frequency;oscillator.detune.value=i*3;oscillator.connect(gain);oscillator.start();ambientOscillators.push(oscillator);});
  }catch{showGameToast('Ambient sound is unavailable in this browser.');}
}
function stopAmbient(){ambientOscillators.forEach(o=>{try{o.stop();}catch{}});ambientOscillators=[];}
renderApp();
function openLinkedWorld(){
  const id=new URLSearchParams(location.search).get('world') || (location.hash.startsWith('#play-') ? location.hash.slice(6) : null);
  if(worlds.some(w=>w.id===id)) openGame(id);
}
openLinkedWorld();
window.addEventListener('hashchange',openLinkedWorld);
