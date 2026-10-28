'use strict';

// Cross-instrument workflows against maintained sources (or final builds with
// PERCUSSION_BUILT=1). HOTPLATE can use PERCUSSION_FORM_URL or an isolated
// preview at PERCUSSION_PREVIEW_DIR/form.html. No build modifies the repository.
// Final artifact run: PERCUSSION_BUILT=1 node shared/percussion-browser-checks.cjs
// Select instruments with PERCUSSION_APPS=grain,tine,form,batter; use
// PERCUSSION_QA_PHASES=chain,once,boundary,refinements,lock,audio,hidden,save,responsive
// for focused reruns (the once phase expects the chain phase's once fixture).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..'), artifacts = process.env.PERCUSSION_QA_DIR || '/tmp/percussion-workflow-qa';
const apps = (process.env.PERCUSSION_APPS || 'grain,tine,form,batter').split(',');
const configs = {
  grain: { facade: 'GrainApp', launch: '#chain-button', panel: '#chain-dialog', addBank: '#chain-add-bank', add: '#chain-add', rows: '#chain-entries [data-chain-index]', enabled: '#chain-enabled', loop: '#chain-loop', clear: '#chain-clear', undo: '#undo-button', save: '#save-button', file: '#project-file', step: '[data-track="0"][data-step="0"]', cutoff: '#step-lock-cutoff', lock: '#step-inherit-cutoff', inheritChecked: true, stepPanel: '#step-dialog' },
  tine: { facade: 'TineApp', launch: '#chain-button', panel: '#chain-dialog', addBank: '#chain-add-bank', add: '#chain-add', rows: '#chain-entries [data-chain-index]', enabled: '#chain-enabled', loop: '#chain-loop', clear: '#chain-clear', undo: '#undo-button', save: '#save-button', file: '#project-file', step: '[data-track="0"][data-step="0"]', cutoff: '#step-lock-cutoff', lock: '#step-inherit-cutoff', inheritChecked: true, stepPanel: '#step-dialog' },
  form: { facade: 'FormApp', launch: '.hp-chain-editor summary', panel: '.hp-chain-editor', add: '[data-chain-add]', rows: '[data-chain-entry]', enabled: '[data-chain-enabled]', loop: '[data-chain-loop]', clear: '[data-chain-clear]', undo: '.hotplate-pattern-tools button:has-text("Undo")', save: 'button:has-text("Download project")', file: 'input[type="file"][accept*="json"]', step: '[data-voice="0"][data-step="0"]', cutoff: 'input[aria-label="Step cutoff value"]', cutoffButton: 'button[aria-label^="Edit Step cutoff value:"]', lock: '[data-lock-enable="cutoff"]', inheritChecked: false, stepPanel: '.hp-step-inspector' },
  batter: { facade: 'BatterApp', launch: '#chainEditorButton', panel: '#chainEditor', addBank: '#chainAddBank', add: '#chainAppendButton', rows: '#chainEntries [data-chain-entry]', enabled: '#chainEnabled', loop: '#chainLoop', clear: '#chainClearButton', undo: '#undoButton', save: '#saveButton', file: '#projectFile', step: '#sequenceGrid [data-lane="kick"][data-step="0"]', cutoff: '#hit-lock-lowpass', inherit: 'button[aria-label="Inherit cutoff"]', stepPanel: '#batter-hit' }
};

function maintainedHTML(id) {
  const override = process.env.PERCUSSION_PREVIEW_DIR && path.join(process.env.PERCUSSION_PREVIEW_DIR, id + '.html');
  if (override && fs.existsSync(override)) return fs.readFileSync(override);
  if (process.env.PERCUSSION_BUILT || id === 'form') {
    const canonical = path.join(root, id === 'form' ? 'music/form/index.html' : id + '/index.html');
    return fs.readFileSync(fs.existsSync(canonical) ? canonical : path.join(root, 'instruments', id + '.html'));
  }
  const python = `from pathlib import Path
import runpy,re,json,sys
root=Path(sys.argv[1]);app=root/sys.argv[2]
helpers=runpy.run_path(str(root/'shared/bundle_audio_exchange.py'))
names=list(dict.fromkeys(re.findall(r"'([^']+\\.js)'",(app/'build.py').read_text())))
css=(app/'styles.css').read_text();scripts='\\n'.join((app/name).read_text() for name in names)
if sys.argv[2]=='batter': scripts='window.BatterLibrary='+json.dumps(json.loads((app/'factory-samples.json').read_text()),separators=(',',':'))+';\\n'+scripts
html=(app/'app.html').read_text().replace('<!-- STYLES -->','<style>'+css+'</style>').replace('<!-- SCRIPTS -->','<script>'+scripts.replace('</script','<\\\\/script')+'</script>')
sys.stdout.write(helpers['embed_exchange'](html,sys.argv[2],app))`;
  return execFileSync('python3', ['-c', python, root, id], { maxBuffer: 64 * 1024 * 1024 });
}
async function serve() {
  const pages = new Map(apps.map(id => ['/' + id + '/index.html', maintainedHTML(id)]));
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pages.has(pathname)) { response.setHeader('Content-Type', 'text/html'); response.end(pages.get(pathname)); return; }
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
    fs.readFile(file, (error, bytes) => { if (error) { response.writeHead(404); response.end(); return; } response.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : file.endsWith('.js') ? 'application/javascript' : 'application/octet-stream'); response.end(bytes); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: 'http://127.0.0.1:' + server.address().port, close: () => new Promise(resolve => server.close(resolve)) };
}
async function prepare(page, id, url) {
  const c = configs[id];
  await page.goto(id === 'form' && process.env.PERCUSSION_FORM_URL || url + '/' + id + '/index.html');
  await page.waitForFunction(name => window[name]?.getSequencerPattern && window.MusicLabPatternInstrument?.renderPattern, c.facade, { timeout: 45000 });
  await page.evaluate(({ id, facade }) => {
    const app = window[facade];
    window.percussionQA = {
      app, id, project: async () => JSON.parse(JSON.stringify(await app.getProject())),
      chain: async () => { const p = await app.getProject(), s = p.state || p; return id === 'batter' ? { enabled: s.chainEnabled, loop: s.chainLoop, entries: s.chain.map(entry => ({ bank: entry.pattern.charCodeAt(0) - 65, repeats: entry.repeats })) } : id === 'grain' ? p.chain : s.chain; },
      async fixture() {
        const p = JSON.parse(JSON.stringify(await app.getProject())), s = p.state || p;
        delete s.musicLabPattern;
        if (id === 'grain' || id === 'tine') {
          s.bpm = 240; s.swing = s.space = s.drive = 0; s.master = .8; s.stepCount = 16; p.bank = p.selected = 0;
          s.tracks.forEach((track, index) => { track.name = 'QA voice ' + index; track.mute = track.solo = false; track.steps = Array(32).fill(0); });
          p.banks = Array.from({ length: 4 }, () => Array.from({ length: 8 }, () => Array(32).fill(0)));
          p.bankLocks = p.banks.map(bank => bank.map(row => row.map(() => ({}))));
          for (let bank = 0; bank < 3; bank++) p.banks[bank][bank][0] = 1;
          p.banks[0][0][31] = 1; p.bankLocks[0][0][31] = { cutoff: 700 };
          s.tracks.forEach((track, index) => track.steps = [...p.banks[0][index]]);
          const chain = { enabled: false, loop: true, entries: [] }; if (id === 'grain') p.chain = chain; else s.chain = chain;
        } else if (id === 'form') {
          s.bpm = 240; s.swing = 0; s.selectedBank = 0; s.muted = Array(8).fill(false);
          const detail = () => ({ velocity: .8, probability: 1, ratchet: 1, timing: 0, pitch: 0 });
          s.patternBanks = Array.from({ length: 4 }, () => ({ length: 16, steps: Array.from({ length: 8 }, () => Array(32).fill(false)), stepDetails: Array.from({ length: 8 }, () => Array.from({ length: 32 }, detail)) }));
          for (let bank = 0; bank < 3; bank++) s.patternBanks[bank].steps[bank][0] = true;
          s.patternBanks[0].steps[0][31] = true; s.patternBanks[0].stepDetails[0][31].locks = { cutoff: 700 };
          s.steps = s.patternBanks[0].steps.map(row => row.slice(0, 16)); s.stepDetails = s.patternBanks[0].stepDetails.map(row => row.slice(0, 16));
          s.chain = { enabled: false, loop: true, entries: [] }; s.sounds.forEach((sound, index) => sound.name = 'QA voice ' + index);
        } else {
          s.tempo = 240; s.swing = s.humanize = s.velocityHumanize = 0; s.chain = []; s.chainEnabled = false; s.chainLoop = true; s.selectedPattern = 'A';
          s.lanes.forEach(lane => { lane.mute = lane.solo = false; lane.room = lane.delay = 0; lane.layerMode = 'single'; lane.lfo.enabled = false; });
          s.patterns.forEach(pattern => { pattern.length = 16; pattern.lanes.forEach(lane => { lane.length = 16; lane.rotation = 0; lane.steps.forEach(hit => Object.assign(hit, { on: false, velocity: .8, probability: 1, micro: 0, pitch: 0, ratchet: 1, flam: 0, condition: 'always', locks: {} })); }); });
          for (let bank = 0; bank < 3; bank++) s.patterns[bank].lanes[bank].steps[0].on = true;
          s.patterns[0].lanes[0].steps[31].on = true; s.patterns[0].lanes[0].steps[31].locks = { lowpass: 700 };
        }
        await app.loadState(p); return this.project();
      }
    };
  }, { id, facade: c.facade });
  await page.evaluate(() => percussionQA.fixture());
}
async function typeNumber(page, selector, value) {
  if (selector === configs.form.cutoff && !(await page.locator(selector).isVisible())) await page.locator(configs.form.cutoffButton).click();
  const input = page.locator(selector); await input.focus(); await input.press('ControlOrMeta+A'); await input.pressSequentially(String(value));
  assert.equal(Number(await input.inputValue()), value, selector + ' accepts ordinary numeric typing without clamping partial digits');
}
async function changeNumber(page, selector, value) { await typeNumber(page, selector, value); await page.locator(selector).press('Tab'); }
async function openChain(page, c) { await page.locator(c.launch).click(); await page.locator(c.panel).waitFor({ state: 'visible' }); }
async function closeChain(page, c) {
  if (await page.locator(c.panel).evaluate(element => element.tagName === 'DIALOG')) await page.keyboard.press('Escape');
  else await page.locator(c.launch).click();
}
async function append(page, c, bank) {
  if (c.addBank) await page.locator(c.addBank).selectOption(c.facade === 'BatterApp' ? String.fromCharCode(65 + bank) : String(bank));
  await page.locator(c.add).click();
  if (!c.addBank) await page.locator(c.rows).last().locator('[data-chain-bank],select').first().selectOption(String(bank));
}
async function chainUI(page, id) {
  const c = configs[id];
  const initiallyHidden = await page.locator(c.panel).evaluate(element => element.tagName === 'DIALOG' || element.tagName === 'DETAILS' ? !element.open : element.hidden);
  assert(initiallyHidden, id + ' chain editor does not add a permanent workspace');
  await openChain(page, c); await append(page, c, 0); await append(page, c, 1); await append(page, c, 2);
  await changeNumber(page, c.rows + ' input[type="number"] >> nth=0', 2);
  await page.locator(c.enabled).check();
  if (await page.locator(c.loop).evaluate(element => element.tagName === 'SELECT')) await page.locator(c.loop).selectOption('once'); else await page.locator(c.loop).uncheck();
  let chain = await page.evaluate(() => percussionQA.chain());
  assert.deepEqual(chain.entries.map(({ bank, repeats }) => ({ bank, repeats })), [{ bank: 0, repeats: 2 }, { bank: 1, repeats: 1 }, { bank: 2, repeats: 1 }]); assert.equal(chain.loop, false);
  const packet = await page.evaluate(() => percussionQA.app.getSequencerPattern());
  assert.equal(packet.lengthBeats, 16); assert.deepEqual(packet.notes.map(note => note.beat), [0, 4, 8, 12]); assert.deepEqual(packet.notes.map(note => note.voice), [packet.voices[0].id, packet.voices[0].id, packet.voices[1].id, packet.voices[2].id]);
  const current = await page.evaluate(() => percussionQA.app.getSequencerPattern({ scope: 'pattern' })); assert.equal(current.lengthBeats, 4); assert.equal(current.notes.length, 1);
  await page.locator(c.rows).nth(2).locator('[data-chain-action="up"]').click();
  assert.deepEqual((await page.evaluate(() => percussionQA.chain())).entries.map(entry => entry.bank), [0, 2, 1]);
  await page.locator(c.rows).nth(1).locator('[data-chain-action="duplicate"]').click(); assert.equal((await page.evaluate(() => percussionQA.chain())).entries.length, 4);
  await page.locator(c.rows).nth(2).locator('[data-chain-action="remove"]').click(); assert.equal((await page.evaluate(() => percussionQA.chain())).entries.length, 3);
  const beforeClear = await page.evaluate(() => percussionQA.chain()); await page.locator(c.clear).click(); assert.equal((await page.evaluate(() => percussionQA.chain())).entries.length, 0);
  await closeChain(page, c); await page.locator(c.undo).first().click(); assert.deepEqual(await page.evaluate(() => percussionQA.chain()), beforeClear, id + ' Undo restores chain clearing');
  await openChain(page, c);
  const entry = page.locator(c.rows).first().locator('input[type="number"]'); await entry.focus(); const before = Number(await entry.inputValue()); await page.keyboard.press('ArrowUp'); await entry.press('Tab');
  assert.equal((await page.evaluate(() => percussionQA.chain())).entries[0].repeats, before + 1, id + ' repeat editing works by keyboard');
  await closeChain(page, c);
  console.log('PASS ' + id + ' compact chain UI, repeated bank order, current-bank scope, reorder/copy/remove/clear, Undo and keyboard repeats.');
}
async function lockUI(page, id) {
  const c = configs[id];
  async function inspect() {
    if (id === 'batter') await page.locator('#editSelectedHit').click(); else await page.locator(c.step).first().click({ button: 'right' });
    await page.locator(c.stepPanel).waitFor({ state: 'visible' });
  }
  async function closeModal() { if (await page.locator(c.stepPanel).evaluate(element => element.tagName === 'DIALOG')) await page.keyboard.press('Escape'); }
  await inspect();
  if (c.lock) await page.locator(c.lock).setChecked(!c.inheritChecked);
  await changeNumber(page, c.cutoff, 800);
  const packet = await page.evaluate(() => percussionQA.app.getSequencerPattern({ scope: 'pattern' })); assert.equal(packet.notes[0].locks.cutoff, 800, id + ' exact Hz lock reaches the native pattern');
  if (c.inherit) await page.locator(c.inherit).click(); else await page.locator(c.lock).setChecked(c.inheritChecked);
  const inherited = await page.evaluate(() => percussionQA.app.getSequencerPattern({ scope: 'pattern' })); assert(!inherited.notes[0].locks?.cutoff, id + ' per-field inheritance removes the override: ' + JSON.stringify(inherited.notes));
  await closeModal();
  await page.locator(c.undo).first().click(); assert.equal((await page.evaluate(() => percussionQA.app.getSequencerPattern({ scope: 'pattern' }))).notes[0].locks.cutoff, 800, id + ' lock inheritance is undoable');
  await inspect();
  // The numeric blur must not replace the inheritance target between pointerdown and click.
  await typeNumber(page, c.cutoff, 1200);
  if (c.inherit) await page.locator(c.inherit).click(); else await page.locator(c.lock).setChecked(c.inheritChecked);
  assert(!(await page.evaluate(() => percussionQA.app.getSequencerPattern({ scope: 'pattern' }))).notes[0].locks?.cutoff, id + ' Inherit works immediately after typing 1200, without an extra click');
  await closeModal(); await page.locator(c.undo).first().click();
  console.log('PASS ' + id + ' discoverable step editor, real numeric typing, exact cutoff, immediate inheritance and Undo.');
}
async function liveOnce(page, id) {
  const report = await page.evaluate(async () => {
    const q = percussionQA, app = q.app, adapter = MusicLabPatternInstrument;
    await adapter.prepare(); const engine = app.engine, expected = app.getSequencerPattern(), trace = [];
    const index = sound => Number(/^QA voice (\d+)/.exec(sound?.name || '')?.[1]);
    let restore;
    if (engine.environment?.voices) {
      const set = engine.environment.voices, add = set.add;
      set.add = function (voice) { trace.push({ voice: index(voice.track), time: voice.startTime }); return add.call(this, voice); }; restore = () => { set.add = add; };
    } else if (q.id === 'form') {
      const play = engine.play;
      engine.play = function (sound, velocity, when, ...args) { trace.push({ voice: index(sound), time: when }); return play.call(this, sound, velocity, when, ...args); }; restore = () => { engine.play = play; };
    } else {
      const schedule = engine.scheduleHit;
      engine.scheduleHit = function (event, when) { trace.push({ voice: event.laneIndex, time: when }); return schedule.call(this, event, when); }; restore = () => { engine.scheduleHit = schedule; };
    }
    try {
      await app.play(); const deadline = performance.now() + 25000;
      while ((!trace.length || app.isPlaying()) && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
      return { trace, stopped: !app.isPlaying(), expected: expected.notes.map(note => ({ voice: expected.voices.findIndex(voice => voice.id === note.voice), seconds: note.beat * 60 / expected.tempo })) };
    } finally { app.stop(); restore(); }
  });
  assert(report.stopped, id + ' a once chain finishes naturally');
  assert.deepEqual(report.trace.map(note => note.voice), report.expected.map(note => note.voice), id + ' actual native strikes follow repeated chain order: ' + JSON.stringify(report));
  const origin = report.trace[0].time;
  report.trace.forEach((note, i) => assert(Math.abs(note.time - origin - report.expected[i].seconds) < .015, id + ' chain keeps its audio clock: ' + JSON.stringify(report)));
  console.log('PASS ' + id + ' actual native once playback agrees with the exported chain order and timing.');
}
async function liveBoundary(page, id, action = 'replace') {
  const c = configs[id]; await page.evaluate(async () => {
    await percussionQA.fixture(); const p = await percussionQA.project(), s = p.state || p;
    if (percussionQA.id === 'grain' || percussionQA.id === 'tine') { p.banks[0][0][8] = 1; s.tracks[0].steps[8] = 1; }
    else if (percussionQA.id === 'form') { s.patternBanks[0].steps[0][8] = true; s.steps[0][8] = true; }
    else s.patterns[0].lanes[0].steps[8].on = true;
    await percussionQA.app.loadState(p);
  });
  await openChain(page, c); await append(page, c, 0); await append(page, c, 2); await changeNumber(page, c.rows + ' input[type="number"] >> nth=0', 2); await page.locator(c.enabled).check();
  if (await page.locator(c.loop).evaluate(element => element.tagName === 'SELECT')) await page.locator(c.loop).selectOption('loop'); else await page.locator(c.loop).check();
  await page.evaluate(async () => {
    const q = percussionQA; await MusicLabPatternInstrument.prepare(); const engine = q.app.engine;
    q.trace = []; const index = sound => Number(/^QA voice (\d+)/.exec(sound?.name || '')?.[1]);
    if (engine.environment?.voices) { const set = engine.environment.voices, add = set.add; set.add = function (voice) { q.trace.push({ voice: index(voice.track), time: voice.startTime }); return add.call(this, voice); }; q.restore = () => { set.add = add; }; }
    else if (q.id === 'form') { const play = engine.play; engine.play = function (sound, velocity, when, ...args) { q.trace.push({ voice: index(sound), time: when }); return play.call(this, sound, velocity, when, ...args); }; q.restore = () => { engine.play = play; }; }
    else { const schedule = engine.scheduleHit; engine.scheduleHit = function (event, when) { q.trace.push({ voice: event.laneIndex, time: when }); return schedule.call(this, event, when); }; q.restore = () => { engine.scheduleHit = schedule; }; }
    await q.app.play();
  });
  try {
    await page.waitForFunction(() => percussionQA.trace.length && percussionQA.app.engine.context.currentTime >= percussionQA.trace[0].time + .05, null, { timeout: 30000 });
    if (action === 'remove') await page.locator(c.rows).first().locator('[data-chain-action="remove"]').click();
    else await page.locator(c.rows).first().locator('select').first().selectOption(id === 'batter' ? 'B' : '1');
    const editedAt = await page.evaluate(() => percussionQA.app.engine.context.currentTime - percussionQA.trace[0].time);
    assert(editedAt < .5, id + ' boundary test edits before the second hit; actual=' + editedAt);
    await page.waitForFunction(() => percussionQA.trace.length >= 3, null, { timeout: 30000 });
    const trace = await page.evaluate(() => percussionQA.trace.slice(0, 3));
    assert.deepEqual(trace.map(hit => hit.voice), [0, 0, action === 'remove' ? 2 : 1], id + ' live chain edits preserve this entire pattern and enter at its next boundary: ' + JSON.stringify(trace));
    assert(Math.abs(trace[1].time - trace[0].time - .5) < .015 && Math.abs(trace[2].time - trace[0].time - 1) < .015, id + ' editing a live chain does not restart the audio clock');
    assert(await page.evaluate(() => percussionQA.app.isPlaying()), id + ' loop mode keeps native playback running');
  } finally { await page.evaluate(() => { percussionQA.app.stop(); percussionQA.restore?.(); }); await closeChain(page, c); }
  console.log('PASS ' + id + ' live loop ' + action + ' preserves current hits, changes banks at the pattern boundary and keeps the audio clock.');
}
async function formRefinements(page, id) {
  if (id !== 'form') return;
  const c = configs[id]; await page.evaluate(() => percussionQA.fixture()); await openChain(page, c); await append(page, c, 0);
  const selector = c.rows + ' input[type="number"] >> nth=0'; await typeNumber(page, selector, 12);
  assert(await page.locator(selector).evaluate(input => document.activeElement === input), 'HOTPLATE typing a two-digit repeat count preserves focus');
  await page.locator(selector).press('Tab'); assert.equal((await page.evaluate(() => percussionQA.chain())).entries[0].repeats, 12); await closeChain(page, c);
  await liveBoundary(page, id, 'replace'); await liveBoundary(page, id, 'remove');
  const tailError = await page.evaluate(async () => {
    await percussionQA.fixture(); const p = await percussionQA.project(), bank = p.patternBanks[0];
    bank.steps.forEach(row => row.fill(false)); bank.steps[0][15] = true;
    bank.stepDetails[0][15] = { velocity: .8, probability: 1, ratchet: 1, timing: 0, pitch: -24, locks: { decay: 3 } };
    p.steps = bank.steps.map(row => row.slice(0, 16)); p.stepDetails = bank.stepDetails.map(row => row.slice(0, 16));
    p.chain = { enabled: true, loop: false, entries: [{ bank: 0, repeats: 1 }] };
    const sound = p.sounds[0]; delete sound.architecture; sound.tone.decay = 3000; sound.tone.release = 1500; sound.effects.reverb = 1;
    await percussionQA.app.loadState(p); const before = JSON.stringify(await percussionQA.app.getProject());
    try { await percussionQA.app.exportAudio({ scope: 'chain', tail: true, sampleRate: 8000 }); return { error: '', unchanged: false }; }
    catch (error) { return { error: error.message, unchanged: before === JSON.stringify(await percussionQA.app.getProject()) }; }
  });
  assert.match(tailError.error, /Full-tail export supports up to 15 seconds/, 'HOTPLATE reports excessive down-pitched decay instead of truncating it'); assert(tailError.unchanged, 'rejected full-tail export preserves the session');
  await page.evaluate(() => percussionQA.fixture());
  console.log('PASS form two-digit repeat typing/focus, current-entry replacement/removal and explicit excessive-tail error.');
}
async function hiddenSteps(page, id) {
  const c = configs[id]; await page.evaluate(() => percussionQA.fixture());
  async function length(value) {
    if (id === 'grain' || id === 'tine') await page.locator('#sequence-length').selectOption(String(value));
    else if (id === 'batter') await page.locator('#lengthSelect').selectOption(String(value));
    else await page.getByRole('button', { name: value + ' steps', exact: true }).click();
  }
  await length(32);
  let packet = await page.evaluate(() => percussionQA.app.getSequencerPattern({ scope: 'pattern' }));
  assert.equal(packet.notes.at(-1).beat, 7.75); assert.equal(packet.notes.at(-1).locks.cutoff, 700, id + ' extending the grid reveals stored step32 and its sound');
  if (id === 'grain' || id === 'tine') await page.locator('#sequence-page').selectOption('1');
  else if (id === 'batter') await page.locator('#nextPage').click();
  else await page.getByRole('button', { name: 'Steps 17–32', exact: true }).click();
  const cell = id === 'grain' || id === 'tine' ? '[data-track="0"][data-step="31"]' : id === 'batter' ? '#sequenceGrid [data-lane="kick"][data-step="31"]' : '[data-voice="0"][data-step="31"]';
  await page.locator(cell).click({ button: 'right' }); await page.locator(c.stepPanel).waitFor({ state: 'visible' });
  if (c.cutoffButton) await page.locator(c.cutoffButton).click();
  assert.equal(Number(await page.locator(c.cutoff).inputValue()), 700); await changeNumber(page, c.cutoff, 1800);
  if (await page.locator(c.stepPanel).evaluate(element => element.tagName === 'DIALOG')) await page.keyboard.press('Escape');
  await length(16); await length(32);
  packet = await page.evaluate(() => percussionQA.app.getSequencerPattern({ scope: 'pattern' })); assert.equal(packet.notes.at(-1).locks.cutoff, 1800, id + ' shortening and re-extending preserves hidden sound data');
  if (id === 'grain' || id === 'tine') {
    await page.locator('#copy-pattern').click(); await page.locator('[data-bank="1"]').click();
  } else if (id === 'batter') await page.locator('#duplicateBankButton').click();
  else { await page.locator('[data-bank-copy]').click(); await page.locator('[data-bank="1"]').click(); }
  packet = await page.evaluate(() => percussionQA.app.getSequencerPattern({ scope: 'pattern' })); assert.equal(packet.notes.at(-1).locks.cutoff, 1800, id + ' copying a bank includes step32 sound data');
  if (id === 'grain' || id === 'tine') await page.locator('#clear-button').click();
  else if (id === 'batter') await page.locator('#clearPatternButton').click();
  else await page.getByRole('button', { name: 'Clear pattern', exact: true }).click();
  assert.equal((await page.evaluate(() => percussionQA.app.getSequencerPattern({ scope: 'pattern' }))).notes.length, 0);
  await page.locator(c.undo).first().click(); assert.equal((await page.evaluate(() => percussionQA.app.getSequencerPattern({ scope: 'pattern' }))).notes.at(-1).locks.cutoff, 1800, id + ' Undo restores cleared hits and overrides');
  console.log('PASS ' + id + ' hidden step32 editing, length changes, bank copy and Clear/Undo retain the correct per-hit sound.');
}
async function audioLocks(page, id) {
  const result = await page.evaluate(async () => {
    const app = percussionQA.app, before = JSON.stringify(await app.getProject()), source = app.getSequencerPattern({ scope: 'pattern' }), voice = source.voices[0];
    const base = MusicLabPatternSchema.normalize({ ...source, lengthBeats: 4, swing: 0, voices: [voice], notes: [{ id: 'test-hit', voice: voice.id, pitch: voice.pitch ?? 36, velocity: .8, beat: .25, duration: .25, probability: 1 }], seed: 123 });
    async function render(pattern) {
      const result = await MusicLabPatternInstrument.renderPattern({ pattern, tempo: 240, tailSeconds: 0 });
      if (result.pcm) return result.pcm;
      const context = new OfflineAudioContext(2, 1, 48000), audio = await context.decodeAudioData(await result.blob.arrayBuffer());
      const pcm = new Float32Array(audio.length * 2); for (let i = 0; i < audio.length; i++) { pcm[i * 2] = audio.getChannelData(0)[i]; pcm[i * 2 + 1] = audio.getChannelData(Math.min(1, audio.numberOfChannels - 1))[i]; } return pcm;
    }
    const unlocked = await render(base), locked = await render({ ...base, notes: base.notes.map(note => ({ ...note, locks: { cutoff: 40 } })) }), inherited = await render(base);
    let delta = 0, energy = 0, inheritedMax = 0;
    for (let i = 0; i < unlocked.length; i++) { delta += (unlocked[i] - locked[i]) ** 2; energy += unlocked[i] ** 2; inheritedMax = Math.max(inheritedMax, Math.abs(unlocked[i] - inherited[i])); }
    return { audibleDifference: Math.sqrt(delta / Math.max(1e-12, energy)), inheritedMax, unchanged: JSON.stringify(await app.getProject()) === before };
  });
  assert(result.audibleDifference > .02, id + ' portable cutoff changes genuine instrument audio: ' + JSON.stringify(result));
  assert(result.inheritedMax <= 2 / 32768, id + ' unlocked rendering inherits the base voice after a locked strike'); assert(result.unchanged, id + ' rendering locks does not mutate the project');
  console.log('PASS ' + id + ' audible portable cutoff, no base-sound mutation or lock leakage.');
}
async function saveOpen(page, id) {
  const c = configs[id];
  await openChain(page, c);
  if (!(await page.locator(c.rows).count())) { await append(page, c, 0); await append(page, c, 2); await changeNumber(page, c.rows + ' input[type="number"] >> nth=0', 2); }
  await page.locator(c.enabled).check(); await closeChain(page, c);
  const expected = await page.evaluate(() => percussionQA.project());
  if (id === 'form') {
    await page.getByRole('button', { name: 'Save project', exact: true }).first().click();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('form-projects'))[0].project), expected, 'HOTPLATE local Save includes chain and hidden locks');
    await page.getByRole('button', { name: 'Project options', exact: true }).click();
  }
  const event = page.waitForEvent('download'); await page.locator(c.save).first().click(); const file = await event;
  const bytes = fs.readFileSync(await file.path());
  await page.evaluate(() => percussionQA.fixture());
  await page.locator(c.file).first().setInputFiles({ name: 'percussion-roundtrip.json', mimeType: 'application/json', buffer: bytes });
  await page.waitForFunction(async expected => JSON.stringify(await percussionQA.app.getProject()) === JSON.stringify(expected), expected, { timeout: 30000 });
  console.log('PASS ' + id + ' real Save/Open preserves chain, per-step overrides and hidden steps.');
}
async function responsive(page, id) {
  const c = configs[id];
  if (id === 'form' && await page.getByRole('button', { name: 'Dismiss notification', exact: true }).isVisible()) await page.getByRole('button', { name: 'Dismiss notification', exact: true }).click();
  // Capture a useful edited chain after hidden-step/project workflows reset it.
  await openChain(page, c);
  if (!(await page.locator(c.rows).count())) { await append(page, c, 0); await append(page, c, 1); await append(page, c, 2); }
  await closeChain(page, c);
  if (id === 'grain' || id === 'tine') { if (await page.locator('#sequence-page').isVisible()) await page.locator('#sequence-page').selectOption('0'); }
  else if (id === 'batter') { if (await page.locator('#previousPage').isEnabled()) await page.locator('#previousPage').click(); await page.locator('#stepLocksPanel').evaluate(element => element.open = false); }
  else { await page.getByRole('button', { name: 'Steps 1–16', exact: true }).click(); if (await page.locator(c.stepPanel).isVisible()) await page.getByRole('button', { name: 'Close details', exact: true }).click(); }
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('.sequencer').first().screenshot({ path: path.join(artifacts, id + '-sequence-' + width + '.png') });
    await openChain(page, c);
    const overflow = await page.locator(c.panel).evaluate(panel => [...panel.querySelectorAll('input,select,button')].filter(element => { const b = element.getBoundingClientRect(); return b.width > 0 && (b.left < -1 || b.right > innerWidth + 1); }).map(element => element.id || element.className));
    assert.deepEqual(overflow, [], id + ' chain controls fit ' + width + ' px');
    await page.screenshot({ path: path.join(artifacts, id + '-chain-' + width + '.png'), fullPage: false });
    const count = await page.locator(c.rows).count();
    if (width < 1440 && count) {
      await page.locator(c.rows).first().locator('[data-chain-action="duplicate"]').tap(); assert.equal(await page.locator(c.rows).count(), count + 1);
      await page.locator(c.rows).nth(1).locator('[data-chain-action="remove"]').tap(); assert.equal(await page.locator(c.rows).count(), count);
    }
    await closeChain(page, c);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), id + ' page has no new horizontal overflow at ' + width + ' px');
    {
      const before = await page.evaluate(() => JSON.stringify(percussionQA.app.getSequencerPattern({ scope: 'pattern' })));
      if (id === 'grain' || id === 'tine') {
        if (width < 1440) { await page.locator('#step-edit-button').tap(); await page.locator(c.step).tap(); }
        else await page.locator(c.step).press('e');
      } else if (id === 'batter') { if (width < 1440) await page.locator('#editSelectedHit').tap(); else await page.locator('#editSelectedHit').press('Enter'); }
      else {
        if (width < 1440) { await page.locator('.hp-details-toggle').tap(); await page.locator(c.step).tap(); }
        else { await page.locator('.hp-details-toggle').press('Enter'); await page.locator(c.step).press('Enter'); }
      }
      await page.locator(c.cutoffButton || c.cutoff).waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => JSON.stringify(percussionQA.app.getSequencerPattern({ scope: 'pattern' }))), before, id + ' inspecting a hit does not toggle it');
      const fields = await page.locator(c.stepPanel).evaluate(panel => [...panel.querySelectorAll('input,select,button')].filter(element => { const b = element.getBoundingClientRect(); return b.width > 0 && (b.left < -1 || b.right > innerWidth + 1); }).map(element => element.id || element.className));
      assert.deepEqual(fields, [], id + ' step controls fit ' + width + ' px');
      await page.locator(c.stepPanel).screenshot({ path: path.join(artifacts, id + '-step-' + width + '.png') });
      if (await page.locator(c.stepPanel).evaluate(element => element.tagName === 'DIALOG')) await page.keyboard.press('Escape');
      if (id === 'grain' || id === 'tine') { if (width < 1440) await page.locator('#step-edit-button').tap(); }
      else if (id === 'batter') await page.locator('#stepLocksPanel').evaluate(element => element.open = false);
      else { await page.getByRole('button', { name: 'Close details', exact: true }).click(); await page.locator('.hp-details-toggle').click(); }
    }
  }
  console.log('PASS ' + id + ' 320/390/1440 px compact closed layout and expanded chain controls.');
}
(async () => {
  fs.mkdirSync(artifacts, { recursive: true }); const server = await serve(), browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try {
    for (const id of apps) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true, hasTouch: true, reducedMotion: 'reduce' }), page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(20000);
      try {
        await prepare(page, id, server.url);
        const phases = { chain: chainUI, once: liveOnce, boundary: liveBoundary, refinements: formRefinements, lock: lockUI, audio: audioLocks, hidden: hiddenSteps, save: saveOpen, responsive };
        const selected = (process.env.PERCUSSION_QA_PHASES || (process.env.PERCUSSION_QA_MODE === 'ui' ? 'chain,lock,hidden,save,responsive' : 'chain,once,boundary,refinements,lock,audio,hidden,save,responsive')).split(',');
        for (const phase of selected) await phases[phase](page, id);
        assert.deepEqual(errors, [], id + ' has no uncaught browser errors');
      }
      finally { await context.close(); }
    }
  } finally { await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
