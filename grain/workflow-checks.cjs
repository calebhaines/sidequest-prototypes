/* End-to-end checks for SIZZLE's kitchen workflow. Serve the built standalone
 * page so this covers the downloadable instrument and its shared integrations.
 * Run python3 grain/build.py before this file. PLAYWRIGHT_MODULE and
 * CHROMIUM_PATH can select another installed browser.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const checkpoint = process.env.KITCHEN_PATTERN_CHECKPOINT || 'kitchen-before-pattern-sequencing-20261014';

function wavPeak(bytes) {
  const wav = Buffer.from(bytes);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF', 'The export is a WAV file');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  let peak = 0;
  for (let offset = 44; offset < wav.length; offset += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(offset)));
  return peak / 32768;
}
function compareWavs(actual, expected) {
  const a = Buffer.from(actual), b = Buffer.from(expected);
  assert.equal(a.length, b.length, 'Legacy hit export duration remains unchanged');
  let difference = 0;
  for (let offset = 44; offset < a.length; offset += 2) difference = Math.max(difference, Math.abs(a.readInt16LE(offset) - b.readInt16LE(offset)));
  assert(difference <= 1, 'Legacy hit audio changed by ' + difference + ' PCM units');
}
const getProject = page => page.evaluate(() => GrainApp.getProject());
const getState = page => page.evaluate(() => GrainApp.getState());
const getHit = page => page.evaluate(async () => Array.from(new Uint8Array(await (await GrainApp.exportAudio({ scope: 'hit', tailSeconds: .1 })).blob.arrayBuffer())));
const voiceSound = track => Object.fromEntries(Object.entries(track).filter(([key]) => key !== 'steps'));

async function stepMode(page, mode) {
  const control = page.locator('#step-edit-mode');
  if (await control.evaluate(element => element.tagName === 'SELECT')) await control.selectOption(mode);
  else await control.locator('[data-step-mode="' + mode + '"], [value="' + mode + '"]').click();
}
async function usePreset(page, mode, preset) {
  await page.locator('#preset-load-mode').selectOption(mode);
  await page.locator('#preset-select').selectOption(String(preset));
}
async function expectNoOverflow(page, selectors, label) {
  const overflow = await page.evaluate(selectors => selectors.flatMap(selector => [...document.querySelectorAll(selector)]).filter(element => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1);
  }).map(element => element.id || element.className), selectors);
  assert.deepEqual(overflow, [], label + ': controls fit the viewport');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label + ': no page-wide horizontal scroll');
}

(async () => {
  const built = fs.readFileSync(path.join(root, 'grain/index.html'));
  const legacy = execFileSync('git', ['show', checkpoint + ':grain/index.html'], { cwd: root, maxBuffer: 20 * 1024 * 1024 });
  const server = http.createServer((request, response) => {
    const body = request.url === '/legacy.html' ? legacy : request.url === '/grain/' ? built : null;
    response.writeHead(body ? 200 : 404, { 'Content-Type': 'text/html' }); response.end(body || 'Missing test page');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const base = 'http://127.0.0.1:' + server.address().port;
  const errors = [];
  const watch = page => { page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message)); return page; };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const page = watch(await context.newPage()), old = watch(await context.newPage());
    await old.goto(base + '/legacy.html'); await old.waitForFunction(() => window.GrainApp);
    await page.goto(base + '/grain/'); await page.waitForFunction(() => window.GrainApp);

    // Open a real pre-refresh project through the same file picker a user uses.
    const oldProject = await getProject(old), oldHit = await getHit(old);
    await page.locator('#project-file').setInputFiles({ name: 'previous-sizzle.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(oldProject)) });
    await page.waitForFunction(() => document.querySelector('#project-file').value === '');
    await page.waitForFunction(name => GrainApp.getState().name === name, oldProject.state.name);
    const migrated = await getState(page);
    assert.equal(migrated.stepCount, 16); delete migrated.stepCount;
    assert.deepEqual(migrated, oldProject.state, 'Existing project voices, groove, mix and effects survive opening');
    compareWavs(await getHit(page), oldHit);
    assert.equal(await page.locator('#track-rows .step').count(), 128, 'Desktop keeps all sixteen steps visible');
    console.log('PASS legacy project opening and original hit audio.');

    // Auditioning and quick shaping must affect the selected voice, not the grid.
    const beforePad = await getProject(page);
    await page.evaluate(async () => {
      await GrainApp.engine.init(); window.__workflowVoices = [];
      const voices = GrainApp.engine.environment.voices, add = voices.add;
      voices.add = function (voice) { window.__workflowVoices.push({ source: voice.scopeSource, mode: voice.mode }); return add.call(this, voice); };
    });
    assert.equal(await page.locator('#voice-pads [data-pad]').count(), 8);
    await page.locator('#voice-pads [data-pad="5"]').click();
    let project = await getProject(page);
    assert.equal(project.selected, 5, 'A pad selects its sound for editing');
    assert.deepEqual(project.state.tracks, beforePad.state.tracks, 'Audition leaves all voices and hits unchanged');
    assert.deepEqual(project.banks, beforePad.banks);
    assert(await page.evaluate(() => window.__workflowVoices.length > 0), 'The pad actually schedules an audible voice');
    for (const [key, group, parameter, keypress, expected] of [
      ['frequency', 'body', 'frequency', 'End', 2000],
      ['cutoff', 'noise', 'cutoff', 'Home', 40],
      ['decay', 'noise', 'decay', 'End', 3],
      ['drive', 'noise', 'drive', 'End', 1]
    ]) {
      await page.locator('#quick-knobs [data-param="quick-' + key + '"]').focus(); await page.keyboard.press(keypress);
      assert.equal((await getState(page)).tracks[5].synth[group][parameter], expected, key + ' changes the real saved synthesis parameter');
    }
    assert(wavPeak(await getHit(page)) > .005, 'The shaped selected voice exports non-silent audio');
    console.log('PASS playable pads and quick controls reach saved synthesis and audio.');

    // Keep a personal rhythm while trying another kit, then keep that kit while
    // trying another rhythm. Compare the entire banks/sounds rather than labels.
    await usePreset(page, 'full', 0);
    await page.locator('#sequence-length').selectOption('32');
    await page.locator('#sequence-page').selectOption('1');
    await page.locator('[data-track="0"][data-step="31"]').click({ modifiers: ['Shift'] });
    await page.locator('#copy-pattern').click(); await page.locator('[data-bank="1"]').click();
    await page.locator('#tempo').fill('137'); await page.locator('#tempo').press('Tab');
    const personal = await getProject(page);
    await usePreset(page, 'sounds', 1);
    project = await getProject(page);
    assert.deepEqual(project.banks, personal.banks, 'Trying a kit preserves every rhythm bank');
    assert.equal(project.bank, personal.bank); assert.equal(project.state.stepCount, 32);
    assert.equal(project.state.bpm, personal.state.bpm); assert.equal(project.state.swing, personal.state.swing);
    assert.deepEqual(project.state.tracks.map(track => track.steps), personal.state.tracks.map(track => track.steps));
    const kit = await page.evaluate(() => { const preset = JSON.parse(JSON.stringify(NOISE_PRESETS[1])); preset.tracks.forEach(track => GrainSynth.ensureTrack(track)); return preset; });
    assert.deepEqual(project.state.tracks.map(track => track.synth), kit.tracks.map(track => track.synth), 'Sounds mode applies the chosen kit');
    const sounds = project.state.tracks.map(voiceSound), effects = { drive: project.state.drive, space: project.state.space, master: project.state.master };
    await usePreset(page, 'groove', 2);
    project = await getProject(page);
    const groove = await page.evaluate(() => NOISE_PRESETS[2]);
    assert.deepEqual(project.state.tracks.map(voiceSound), sounds, 'Trying a groove preserves sounds and per-voice mix');
    assert.deepEqual({ drive: project.state.drive, space: project.state.space, master: project.state.master }, effects);
    assert.equal(project.bank, 0); assert.equal(project.state.bpm, groove.bpm); assert.equal(project.state.swing, groove.swing);
    assert.deepEqual(project.state.tracks.map(track => track.steps.slice(0, 16)), groove.tracks.map(track => track.steps));
    assert.deepEqual(project.state.tracks.map(track => track.steps.slice(16)), personal.state.tracks.map(track => track.steps.slice(16)), 'Groove mode retains hidden second-half hits');
    assert.deepEqual(project.banks.slice(1), personal.banks.slice(1), 'Groove mode preserves the other variations');
    await usePreset(page, 'full', 0);
    assert.equal((await getState(page)).stepCount, 16); assert.equal((await getProject(page)).bank, 0);
    console.log('PASS sounds-only, groove-only and full preset workflows.');

    // Exact received notes override the native grid. A native rhythm edit must
    // return playback/export to that grid; Undo must recover the received part.
    await page.evaluate(async () => {
      await MusicLabPatternInstrument.importPattern({ pattern: {
        format: 'musiclab-pattern', version: 1, name: 'Off-grid kitchen part', sourceApp: 'test', kind: 'drums', tempo: 120,
        swing: 0, lengthBeats: 4, meter: [4, 4], voices: [{ id: 'spoon', name: 'Spoon', pitch: 36 }],
        notes: [{ id: 'off-grid', voice: 'spoon', pitch: 36, beat: .125, duration: .125, velocity: .8 }]
      }, options: { target: 'current', replace: true, voiceMap: { spoon: 'voice-0' } } });
    });
    const received = await getProject(page);
    assert.equal(received.state.musicLabPattern.pattern.notes[0].beat, .125);
    await page.locator('#play-button').click(); await page.waitForFunction(() => GrainApp.isPlaying());
    await page.evaluate(() => { window.__workflowVoices = []; });
    await page.locator('[data-track="2"][data-step="0"]').click();
    await page.waitForFunction(() => !GrainApp.getState().musicLabPattern);
    await page.waitForFunction(() => window.__workflowVoices.some(voice => voice.source === 'native'));
    assert.notEqual(await page.evaluate(() => MusicLabPatternInstrument.exportPattern().notes[0]?.id), 'off-grid', 'Shared export now describes the edited grid');
    await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => GrainApp.isPlaying()), false);
    await page.locator('#undo-button').click();
    assert.deepEqual(await getProject(page), received, 'Undo restores the exact received part and original project');
    console.log('PASS received notes yield to a native edit, native playback resumes, Undo restores received notes.');

    // The second half remains visible while it plays, and users can opt out.
    await usePreset(page, 'full', 1); await page.locator('#sequence-length').selectOption('32');
    await page.locator('#tempo').fill('240'); await page.locator('#tempo').press('Tab');
    await page.locator('#follow-playhead').check();
    await page.locator('#play-button').click();
    await page.waitForFunction(() => GrainApp.isPlaying() && document.querySelector('#track-rows [data-step="16"]'));
    assert.match(await page.locator('#play-button').innerText(), /Stop/i);
    await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => GrainApp.isPlaying()), false);
    await page.locator('#follow-playhead').uncheck(); await page.locator('#sequence-page').selectOption('0');
    await page.locator('#play-button').click();
    await page.waitForFunction(() => GrainApp.engine.currentStep >= 17);
    assert(await page.locator('#track-rows [data-step="0"]').count(), 'Follow off leaves the chosen edit page in place');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    assert.equal(await page.evaluate(() => GrainApp.isPlaying()), false); assert.match(await page.locator('#play-button').innerText(), /Play/i);
    console.log('PASS 32-step follow, manual paging, Stop/Escape and page lifecycle recovery.');

    // Name, download and reopen a personal project; verify browser persistence.
    await page.locator('#project-name').fill('Midnight mise en place'); await page.locator('#project-name').press('Tab');
    await page.waitForFunction(() => GrainApp.getState().name === 'Midnight mise en place');
    const saved = await getProject(page);
    const downloadEvent = page.waitForEvent('download'); await page.locator('#save-button').click(); const download = await downloadEvent;
    const downloaded = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.deepEqual(downloaded, saved, 'Save project downloads all sounds, banks and name');
    await usePreset(page, 'full', 0);
    await page.locator('#project-file').setInputFiles({ name: 'midnight.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(downloaded)) });
    await page.waitForFunction(() => GrainApp.getState().name === 'Midnight mise en place');
    assert.deepEqual(await getProject(page), saved, 'Opening the downloaded project restores the complete session');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('grain-drum-machine-v2')).state.name === 'Midnight mise en place');
    await page.reload(); await page.waitForFunction(() => window.GrainApp);
    assert.deepEqual(await getProject(page), saved, 'Reload keeps the project without a download');
    console.log('PASS naming, JSON download/open and browser persistence.');

    for (const width of [320, 390]) {
      const touchContext = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true, isMobile: true });
      const touch = watch(await touchContext.newPage()); await touch.goto(base + '/grain/'); await touch.waitForFunction(() => window.GrainApp);
      assert.equal(await touch.locator('#track-rows .step').count(), 32, width + ' px displays four reachable steps per voice');
      await touch.locator('#sequence-length').selectOption('32');
      await touch.locator('#step-next').tap();
      assert(await touch.locator('#track-rows [data-step="4"]').count());
      await stepMode(touch, 'accent'); await touch.locator('[data-track="0"][data-step="4"]').tap();
      assert.equal((await getState(touch)).tracks[0].steps[4], 2);
      await stepMode(touch, 'erase'); await touch.locator('[data-track="0"][data-step="4"]').tap();
      assert.equal((await getState(touch)).tracks[0].steps[4], 0);
      await stepMode(touch, 'hit'); await touch.locator('[data-track="0"][data-step="4"]').tap();
      assert.equal((await getState(touch)).tracks[0].steps[4], 1);
      for (let page = 0; page < 6; page++) await touch.locator('#step-next').tap();
      assert(await touch.locator('#track-rows [data-step="31"]').count());
      assert.match(await touch.locator('#step-window').innerText(), /29.*32/);
      await stepMode(touch, 'accent'); await touch.locator('[data-track="0"][data-step="31"]').tap();
      assert.equal((await getState(touch)).tracks[0].steps[31], 2, 'Touch can edit the final step');
      await touch.locator('#step-prev').tap(); assert(await touch.locator('#track-rows [data-step="24"]').count());
      await expectNoOverflow(touch, ['#track-rows', '.sequencer-inner', '#step-prev', '#step-next', '#step-edit-mode', '#voice-pads', '#quick-knobs', '#preset-load-mode', '#project-name'], width + ' px');
      const beforeTouchPad = (await getState(touch)).tracks.map(track => track.steps);
      await touch.locator('#voice-pads [data-pad="7"]').tap();
      assert.equal((await getProject(touch)).selected, 7);
      assert.deepEqual((await getState(touch)).tracks.map(track => track.steps), beforeTouchPad);
      if (process.env.SIZZLE_SCREENSHOT_DIR) {
        fs.mkdirSync(process.env.SIZZLE_SCREENSHOT_DIR, { recursive: true });
        await touch.screenshot({ path: path.join(process.env.SIZZLE_SCREENSHOT_DIR, 'sizzle-' + width + '.png'), fullPage: true });
      }
      await touchContext.close();
      console.log('PASS ' + width + ' px touch editing, accents, erase, paging to step32 and audition without horizontal scrolling.');
    }

    const deniedContext = await browser.newContext();
    await deniedContext.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) { if (key === 'grain-drum-machine-v2') throw new DOMException('Storage denied', 'QuotaExceededError'); return original.call(this, key, value); };
    });
    const denied = watch(await deniedContext.newPage()); await denied.goto(base + '/grain/'); await denied.waitForFunction(() => window.GrainApp);
    await denied.locator('#project-name').fill('Portable when storage fails'); await denied.locator('#project-name').press('Tab');
    const status = denied.locator('#save-status, #project-save-status');
    await status.waitFor();
    await denied.waitForFunction(() => /unavailable|could not|can.t|cannot|failed|download|not saved|save project/i.test(document.querySelector('#save-status, #project-save-status')?.textContent || ''));
    assert.equal((await getState(denied)).name, 'Portable when storage fails', 'Denied storage does not prevent composing');
    assert(wavPeak(await getHit(denied)) > .005, 'Audio export still works when browser saving fails');
    await deniedContext.close();
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    console.log('PASS storage failure is visible and does not block sound or export.');
    await context.close();
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
