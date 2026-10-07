'use strict';

// Real Chromium checks for the separate SERVICE view. Set
// LOOM_SERVICE_BASELINE_DIR to an untouched prior standalone and screenshots
// to additionally verify GALLEY's arrangement pixel for pixel.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const baseline = process.env.LOOM_SERVICE_BASELINE_DIR ? path.resolve(process.env.LOOM_SERVICE_BASELINE_DIR) : null;
const passed = [];
const resultsDir = process.env.LOOM_SERVICE_QA_DIR || '/tmp/galley-service-qa';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function moduleFromPlaywright(name) {
  try { return require(name); } catch (_) { return require(path.join(path.dirname(require.resolve(process.env.PLAYWRIGHT_MODULE || 'playwright')), '..', name)); }
}
async function serve() {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const base = pathname.startsWith('/baseline/') && baseline ? baseline : root;
    const relative = pathname.startsWith('/baseline/') ? pathname.slice(9) : pathname;
    const file = path.resolve(base, '.' + relative + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(base + path.sep)) { response.writeHead(403); response.end(); return; }
    fs.readFile(file, (error, contents) => {
      if (error) { response.writeHead(404); response.end(); return; }
      const type = { '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.wav': 'audio/wav' }[path.extname(file)] || 'application/javascript';
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); response.end(contents);
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: 'http://127.0.0.1:' + server.address().port, close: () => new Promise(resolve => server.close(resolve)) };
}
async function ready(page, url) {
  await page.goto(url); await page.waitForFunction(() => !!window.LoomApp); await page.evaluate(() => document.fonts.ready); await wait(450);
}
async function arrangement(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.arrangement-panel'), round = n => Math.round(n * 1000) / 1000;
    const geom = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return { id: el.id, tag: el.tagName, class: el.className, rect: [r.x, r.y, r.width, r.height].map(round), display: s.display, font: s.font, color: s.color, background: s.backgroundColor, padding: s.padding, gap: s.gap }; };
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, html: panel.outerHTML.replace(/ style=""/g, ''), geometry: [panel, ...panel.querySelectorAll('*')].map(geom) };
  });
}
function comparePixels(actual, reference, label) {
  const PNG = moduleFromPlaywright('pngjs').PNG;
  const a = PNG.sync.read(actual), b = PNG.sync.read(reference);
  assert.equal(a.width, b.width, label + ' width'); assert.equal(a.height, b.height, label + ' height');
  assert.equal(sha(a.data), sha(b.data), label + ' must be pixel-identical');
}
async function baselineChecks(browser, url) {
  if (!baseline) return;
  const sourceHashes = JSON.parse(fs.readFileSync(path.join(baseline, 'source-hashes.json'), 'utf8'));
  for (const name of ['styles.css', 'automation.css', 'piano-roll.css', 'kitchen.css', 'effects.js', 'vocal-dsp.js', 'utility-dsp.js', 'note-playback.js', 'note-renderer.js']) assert.equal(sha(fs.readFileSync(path.join(__dirname, name))), sourceHashes[name], name + ' must remain byte-identical');
  passed.push('Existing arrangement styles, effects, and native note rendering remain byte-identical');
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 }); const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    try {
      await ready(page, url + '/loom/index.html');
      const expected = JSON.parse(fs.readFileSync(path.join(baseline, 'baseline-' + width + '.json'), 'utf8')), actual = await arrangement(page);
      assert.equal(actual.html, expected.html.replace(/ style=""/g, ''), width + 'px arrangement DOM'); assert.deepEqual(actual.geometry, expected.geometry, width + 'px arrangement geometry'); assert.equal(actual.scrollWidth, expected.scrollWidth);
      const image = await page.screenshot({ path: path.join(resultsDir, 'arrangement-default-' + width + '.png'), fullPage: true });
      comparePixels(image, fs.readFileSync(path.join(baseline, 'baseline-' + width + '.png')), width + 'px entire default GALLEY');
      assert.deepEqual(errors, []); passed.push(width + 'px entire default GALLEY pixel-identical, arrangement DOM and geometry identical');
    } finally { await context.close(); }
  }
  // Compare actual legacy project exports, rather than only source text: SERVICE
  // metadata must never enter the inactive arrangement's signal path.
  const outputs = [];
  for (const route of ['/baseline/index.html', '/loom/index.html']) {
    const context = await browser.newContext(); const page = await context.newPage();
    try {
      await ready(page, url + route);
      const pcm = await page.evaluate(async () => { const state = window.LoomApp.getState(); state.loopEnabled = false; const blob = await window.LoomApp.engine.renderWav(state, window.LoomApp.assets, { startBeat: 0, endBeat: 4, tailSeconds: .2 }); return Array.from(new Uint8Array(await blob.arrayBuffer())); });
      outputs.push(Buffer.from(pcm));
    } finally { await context.close(); }
  }
  assert.equal(sha(outputs[0]), sha(outputs[1]), 'Legacy arrangement WAV must be bit-identical with SERVICE inactive'); passed.push('Actual legacy arrangement stereo WAV is bit-identical with SERVICE inactive');
}

// Interaction checks use the actual native app, Worklet and download controls.
async function nativeProject(page, name = 'Four portions') {
  return page.evaluate(async name => {
    const S = window.LoomSchema, state = S.defaultState();
    state.name = name; state.tempo = 240; state.lengthBars = 4; state.loopEnabled = true; state.loopStart = 0; state.loopEnd = 4; state.master.level = .7;
    state.tracks.forEach(track => { track.instrumentLive = false; track.level = .5; });
    const sampleRate = 8000, frames = sampleRate;
    for (const [id, frequency] of [['service-source-a', 220], ['service-source-b', 440]]) {
      const left = new Float32Array(frames), right = new Float32Array(frames);
      for (let i = 0; i < frames; i++) left[i] = right[i] = .2 * Math.sin(2 * Math.PI * frequency * i / sampleRate);
      state.assets.push(S.encodeAsset({ id, name: id, left, right, sampleRate }));
    }
    const clip = (id, assetId, start) => ({ id, name: id, type: 'audio', assetId, start, length: 4, sourceStart: 0, sourceEnd: 1, sourceOffset: 0, rate: 1, reverse: false, loop: true, gain: .8, fadeIn: .003, fadeOut: .003 });
    state.tracks[0].clips = [clip('portion-a', 'service-source-a', 0), clip('portion-b', 'service-source-b', 4)];
    state.tracks[1].clips = [clip('relay-a', 'service-source-a', 0)];
    const effect = window.LoomEffectsCatalog.find(effect => effect.id === 'cinder');
    state.tracks[0].effects[0] = S.effect({ type: 'cinder', params: { ...effect.defaults, drive: 3, mix: .3 } });
    state.tracks[0].automation = [{ target: 'level', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: .5 }, { beat: 12, value: .7 }] }];
    await window.LoomApp.loadState(state); return S.serializeProject(window.LoomApp.getState());
  }, name);
}
async function projectText(page) { return page.evaluate(() => window.LoomSchema.serializeProject(window.LoomApp.getState())); }
async function perform(page, action, payload = {}) { return page.evaluate(async ({ action, payload }) => window.LoomApp.service.perform(action, payload), { action, payload }); }
async function serviceChecks(browser, url) {
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 }); const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
      await ready(page, url + '/loom/index.html'); await page.waitForFunction(() => !!window.LoomApp.service);
      const original = await projectText(page), before = await arrangement(page), undo = await page.locator('#undoButton').isDisabled();
      assert.equal(await page.locator('#loomServiceDialog').isVisible(), false, 'SERVICE starts hidden');
      await page.locator('body').click({ position: { x: 1, y: 1 } }); await page.keyboard.press('Alt+p'); await page.waitForFunction(() => document.getElementById('loomServiceDialog').open);
      const layout = await page.evaluate(() => { const d = document.getElementById('loomServiceDialog'); return { window: innerWidth, document: document.documentElement.scrollWidth, width: d.clientWidth, scroll: d.scrollWidth, open: d.open, tracks: window.LoomApp.getState().tracks.length, slots: window.LoomApp.getState().tracks.map(track => track.effects.length), controls: [...d.querySelectorAll('button,input,select')].filter(el => getComputedStyle(el).display !== 'none').length }; });
      if (layout.document > width + 1 || layout.scroll > layout.width + 1) { await page.screenshot({ path: path.join(resultsDir, 'service-overflow-' + width + '.png') }); console.log('SERVICE layout', JSON.stringify(layout)); console.log('Overflow elements', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#loomServiceDialog *')].filter(el => !el.closest('.loom-service-grid-scroll')).map(el => { const r = el.getBoundingClientRect(); return { tag: el.tagName, class: el.className, x: r.x, right: r.right, width: r.width, client: el.clientWidth, scroll: el.scrollWidth }; }).filter(el => el.right > innerWidth + 1 && el.class !== 'loom-service-grid').slice(0, 15)))); }
      assert(layout.open && layout.document <= width + 1 && layout.scroll <= layout.width + 1, width + 'px SERVICE fits the screen: ' + JSON.stringify(layout)); assert.equal(layout.tracks, 8); assert(layout.slots.every(count => count === 4)); assert(layout.controls > 20, 'SERVICE presents actual playable controls');
      if (width === 390 || width === 1440) await page.screenshot({ path: path.join(resultsDir, 'service-' + width + '.png') });
      assert.equal(await projectText(page), original, 'Opening SERVICE does not persist defaults or change the project');
      await page.locator('[data-service-action="close"]').click(); assert.equal(await page.locator('#loomServiceDialog').isVisible(), false);
      assert.equal(await projectText(page), original, 'Closing clean SERVICE preserves the complete project'); assert.equal(await page.locator('#undoButton').isDisabled(), undo, 'Open/close creates no Undo entry'); assert.deepEqual(await arrangement(page), before, 'Existing arrangement DOM and geometry survive SERVICE open/close');
      // Native Help provides an entry point without adding a default-visible control.
      await page.locator('#helpButton').click(); const helpEntry = page.locator('#helpDialog [data-service-open]');
      await helpEntry.click(); await page.waitForFunction(() => document.getElementById('loomServiceDialog').open); await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.getElementById('loomServiceDialog').open);
      assert.equal(await projectText(page), original); assert.deepEqual(errors, []); passed.push(width + 'px responsive SERVICE / Alt+P + Help access / clean close and Escape / original arrangement and Undo preserved / eight × four');
    } finally { await context.close(); }
  }
  const hashContext = await browser.newContext(), hashPage = await hashContext.newPage();
  try { await ready(hashPage, url + '/loom/index.html#service'); await hashPage.waitForFunction(() => document.getElementById('loomServiceDialog')?.open); assert.equal(await hashPage.evaluate(() => window.LoomApp.engine.getTransport().playing), false, 'Kitchen SERVICE link never auto-starts audio'); passed.push('Kitchen #service entry opens the separate view without autoplay'); } finally { await hashContext.close(); }
  await performanceChecks(browser, url);
  await noteAndMarkerChecks(browser, url);
}
async function snapshot(page) { return page.evaluate(() => window.LoomApp.service.getSnapshot()); }
async function preservedArrangement(page) { return page.evaluate(() => { const state = window.LoomApp.getState(); delete state.service; return JSON.stringify(state); }); }
async function installMidiFixture(page) {
  await page.addInitScript(() => {
    const port = new EventTarget(); Object.assign(port, { id: 'service-controller', name: 'Kitchen test controller', manufacturer: 'QA', type: 'input', state: 'connected', connection: 'open' });
    const access = new EventTarget(); access.inputs = new Map([[port.id, port]]);
    window.qaMidi = { requests: 0, port, access, send(data) { const event = new Event('midimessage'); Object.defineProperty(event, 'data', { value: Uint8Array.from(data) }); port.dispatchEvent(event); } };
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => { window.qaMidi.requests++; return access; } });
  });
}
async function nativeSave(page, filename) {
  const downloadEvent = page.waitForEvent('download'); await page.locator('#saveButton').click(); const download = await downloadEvent;
  const file = path.join(resultsDir, filename); await download.saveAs(file); return fs.readFileSync(file);
}
async function nativeOpen(page, bytes, name) {
  await page.locator('#projectFile').setInputFiles({ name: 'service-check.loom.json', mimeType: 'application/json', buffer: bytes });
  await page.waitForFunction(name => window.LoomApp.getState().name === name, name);
}
async function performanceChecks(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 }), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await installMidiFixture(page); await ready(page, url + '/loom/index.html'); await nativeProject(page);
    const before = await preservedArrangement(page); assert.equal(await page.evaluate(() => window.qaMidi.requests), 0, 'MIDI is never implicitly requested');
    await page.keyboard.press('Alt+p'); await page.waitForFunction(() => document.getElementById('loomServiceDialog').open);
    const first = (await snapshot(page)).service.scenes[0]; assert(first.slots[0].clipId === 'portion-a' && first.slots[1].clipId === 'relay-a', 'First service imports the current loop');
    await perform(page, 'scene-create', { source: 'empty' }); const second = (await snapshot(page)).service.scenes.at(-1);
    await perform(page, 'scene-update', { sceneId: second.id, patch: { name: 'Second order', lengthBeats: 4, slots: [{ mode: 'clip', clipId: 'portion-b' }, { mode: 'hold' }, ...Array.from({ length: 6 }, () => ({ mode: 'silence' }))] } });
    await perform(page, 'scene-launch', { sceneId: first.id });
    await page.locator('[data-service-field="quantize"]').selectOption('4');
    // Connect one simulated MIDI boundary, while the synthesis and audio clock
    // remain the actual browser Worklet. No hardware is required to verify learn.
    await page.locator('.loom-service-midi > summary').click(); await page.locator('[data-service-action="midi-enable"]').click(); await page.waitForFunction(() => window.LoomApp.service.getSnapshot().midi.enabled);
    assert.equal(await page.evaluate(() => window.qaMidi.requests), 1);
    await perform(page, 'midi-learn', { target: 'macro:macro-1' }); await page.evaluate(() => window.qaMidi.send([0xb0, 74, 64]));
    await page.waitForFunction(() => window.LoomApp.service.getSnapshot().service.midiBindings.some(binding => binding.target === 'macro:macro-1' && binding.number === 74));
    await page.evaluate(() => window.qaMidi.send([0xb0, 74, 80])); assert(Math.abs((await snapshot(page)).service.macros[0].value - 80 / 127) < 1e-10);
    await perform(page, 'macro-value', { macroId: 'macro-1', value: .5 });
    await perform(page, 'midi-learn', { target: 'pad:fill' }); await page.evaluate(() => { window.qaMidi.send([0x90, 36, 100]); window.qaMidi.send([0x80, 36, 0]); });
    await page.evaluate(() => { window.qaServiceEvents = []; window.LoomApp.engine.subscribeService(event => window.qaServiceEvents.push(event)); });
    await page.locator('[data-service-action="capture-toggle"]').click(); assert.equal((await snapshot(page)).capture.enabled, true);
    await page.locator('[data-service-action="play"]').click(); await page.waitForFunction(first => { const s = window.LoomApp.service.getSnapshot(); return s.running && s.activeSceneId === first && window.LoomApp.engine.getMeters().master.peak > .01; }, first.id);
    assert.equal(await page.evaluate(() => window.LoomApp.engine.mode), 'worklet', 'SERVICE uses the actual AudioWorklet');
    await page.waitForFunction(() => window.LoomApp.service.getSnapshot().beat > .4);
    await page.locator('[data-service-action="scene-launch"][data-scene-id="' + second.id + '"]').click(); assert.equal((await snapshot(page)).queuedSceneId, second.id);
    await page.waitForFunction(second => window.LoomApp.service.getSnapshot().activeSceneId === second, second.id);
    const launched = await page.evaluate(second => window.qaServiceEvents.find(event => event.type === 'scene' && event.scene?.id === second), second.id);
    assert(launched, 'The Worklet acknowledges the actual scene launch'); assert(Math.abs(launched.beat / 4 - Math.round(launched.beat / 4)) < .0001, 'The scene launch lands on a bar'); assert.equal(launched.scene.clips[1].id, 'relay-a', 'Hold retains the previous track source');
    await page.locator('[data-service-macro="macro-1"]').focus(); await page.keyboard.press('End'); await page.waitForFunction(() => window.LoomApp.service.getSnapshot().service.macros[0].value === 1);
    const stutter = page.locator('[data-service-pad="stutter"]'); await stutter.scrollIntoViewIfNeeded(); const box = await stutter.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForFunction(() => window.LoomApp.service.getSnapshot().padState.stutterBeats > 0); await wait(90); await page.mouse.move(3, 3); await page.mouse.up(); await page.waitForFunction(() => window.LoomApp.service.getSnapshot().padState.stutterBeats === 0);
    const drop = page.locator('[data-service-pad="drop"]'); await drop.scrollIntoViewIfNeeded(); const dropBox = await drop.boundingBox(); await page.mouse.move(dropBox.x + dropBox.width / 2, dropBox.y + dropBox.height / 2); await page.mouse.down(); await page.waitForFunction(() => window.LoomApp.service.getSnapshot().padState.drops.some(Boolean)); await wait(90); await page.mouse.up(); await page.waitForFunction(() => window.LoomApp.service.getSnapshot().padState.drops.every(value => !value));
    await page.evaluate(() => window.qaMidi.send([0x90, 36, 100])); await page.waitForFunction(() => window.LoomApp.service.getSnapshot().padState.fill); await wait(90);
    await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.waitForFunction(() => !window.LoomApp.service.getSnapshot().padState.fill); await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await wait(100); await page.locator('[data-service-action="stop"]').click(); await page.waitForFunction(() => { const s = window.LoomApp.service.getSnapshot(); return !s.running && s.capture.canApply; });
    assert.equal(await preservedArrangement(page), before, 'Performing and recording controls never modify the original arrangement');
    const take = await page.evaluate(() => window.LoomApp.getState().service.take); assert(take.lengthBeats > 4 && take.events.length >= 6); assert(take.events.some(event => event.kind === 'scene' && event.sceneId === second.id)); assert(take.events.some(event => event.kind === 'performance' && event.stutterBeats > 0)); assert(take.events.some(event => event.kind === 'performance' && event.drops.some(Boolean))); assert(take.events.some(event => event.kind === 'performance' && event.fill === 1));
    passed.push('Actual Worklet playback and meters / next-bar scene switch and Hold / keyboard macro / outside-pointer pad release / MIDI learn and blur release / captured audio-clock events / original arrangement untouched');
    await page.locator('[data-service-action="close"]').click(); const saved = await nativeSave(page, 'service-project.loom.json'), savedData = JSON.parse(saved.toString('utf8'));
    assert.equal(savedData.state.service.scenes.length, 2); assert.equal(savedData.state.service.macros[0].value, 1); assert.equal(savedData.state.service.midiBindings.length, 2); assert(savedData.state.service.take.events.length >= 6);
    const whileClosed = await projectText(page); await page.evaluate(() => window.qaMidi.send([0xb0, 74, 0])); assert.equal(await projectText(page), whileClosed, 'MIDI cannot change GALLEY while SERVICE is closed');
    await page.evaluate(() => window.LoomApp.loadState(window.LoomSchema.defaultState())); await nativeOpen(page, saved, 'Four portions'); assert.equal(await projectText(page), saved.toString('utf8'), 'Native Save/Open restores the complete SERVICE project'); assert.equal(await page.evaluate(() => window.LoomApp.engine.getTransport().playing), false);
    await page.keyboard.press('Alt+p'); await page.waitForFunction(() => document.getElementById('loomServiceDialog').open); assert.equal((await snapshot(page)).capture.canApply, true, 'A reopened take can be applied');
    const beforeApply = await projectText(page); await page.locator('[data-service-action="capture-apply"]').click(); await page.waitForFunction(() => !document.getElementById('loomServiceDialog').open && window.LoomApp.getState().markers.length >= 2);
    const applied = await projectText(page), appliedState = JSON.parse(applied).state; assert.equal(appliedState.tracks.length, 8); assert(appliedState.tracks.every(track => track.effects.length === 4)); assert(appliedState.tracks[0].clips.length > 1 && appliedState.tracks[0].automation.length > 0); assert.equal(appliedState.service, undefined);
    await page.locator('#undoButton').click(); assert.equal(await projectText(page), beforeApply, 'One Undo restores the original arrangement, audio, automation, and take'); await page.locator('#redoButton').click(); assert.equal(await projectText(page), applied, 'Redo restores the complete captured arrangement');
    await page.locator('#exportButton').click(); await page.selectOption('#exportTail', '0'); const downloaded = page.waitForEvent('download'); await page.locator('#renderButton').click(); const wav = await downloaded; const wavPath = path.join(resultsDir, 'captured-performance.wav'); await wav.saveAs(wavPath); const bytes = fs.readFileSync(wavPath);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.readUInt16LE(22), 2); assert.equal(bytes.readUInt32LE(24), 48000); assert.equal(bytes.readUInt16LE(34), 16); assert.equal(bytes.length, 44 + Math.round(appliedState.lengthBars * 4 * 60 / appliedState.tempo * 48000) * 4);
    let peak = 0; for (let i = 44; i < bytes.length; i += 2) peak = Math.max(peak, Math.abs(bytes.readInt16LE(i) / 32768)); assert(peak > .01 && peak < 1, 'The actual captured arrangement WAV contains unclipped audio');
    await page.locator('#closeExport').click(); assert.deepEqual(errors, []); passed.push('Native Save/Open keeps scenes, macros, MIDI and captured take / closed MIDI inert / reopened take applied to editable clips and automation / single Undo + Redo / actual native stereo WAV download');
    await page.evaluate(() => window.LoomApp.engine.dispose());
  } finally { await context.close(); }
}




async function noteAndMarkerChecks(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await ready(page, url + '/loom/index.html'); await nativeProject(page, 'Saved note service');
    await page.evaluate(async () => {
      const app = window.LoomApp, state = app.getState();
      state.markers = [{ id: 'prep-marker', name: 'Prep', beat: 0, color: '#ff8d45' }, { id: 'service-marker', name: 'Ready', beat: 4, color: '#d9e694' }];
      await app.engine.init(); const gain = app.engine.context.createGain(); gain.gain.value = 0; gain.connect(app.engine.context.destination);
      const frame = document.createElement('iframe'); Object.assign(frame.style, { position: 'fixed', left: '-10000px', width: '1000px', height: '800px' }); frame.setAttribute('aria-hidden', 'true'); document.body.append(frame);
      const host = new window.LoomInstrumentHost({ context: () => app.engine.context, getTrackInput: () => gain });
      let saved;
      try { host.setTempo(state.tempo); await host.load('native-fixture', { id: 'roux', name: 'ROUX' }, frame); saved = await host.snapshot('native-fixture'); }
      finally { host.dispose(); frame.remove(); gain.disconnect(); }
      state.tracks[2].instrument = { id: 'roux', name: 'ROUX', snapshot: saved };
      const pattern = { format: 'musiclab-pattern', version: 1, name: 'Saved low simmer', sourceApp: 'roux', tempo: state.tempo, swing: 0, meter: [4, 4], lengthBeats: 4, seed: 42, tags: [], voices: [{ id: 'bass', name: 'Bass' }], notes: [{ id: 'saved-note', beat: 0, duration: .5, pitch: 36, velocity: .7, voice: 'bass', probability: 1 }] };
      state.tracks[2].clips = [{ id: 'saved-note-clip', name: 'Saved low simmer', type: 'notes', pattern, voiceMap: { bass: 'bass' }, start: 0, length: 4, sourceOffset: 0, rate: 1, loop: true, gain: .4, fadeIn: .01, fadeOut: .01, transpose: 0 }];
      await app.loadState(state);
    });
    const before = await preservedArrangement(page); await page.keyboard.press('Alt+p'); await page.waitForFunction(() => document.getElementById('loomServiceDialog').open);
    const initial = await snapshot(page); assert.equal(initial.service.scenes.length, 2); assert.deepEqual(initial.service.scenes.map(scene => scene.name), ['Prep', 'Ready']); assert.equal(initial.service.scenes[0].slots[2].clipId, 'saved-note-clip'); assert.equal(initial.service.scenes[1].slots[0].clipId, 'portion-b');
    await perform(page, 'scene-create', { source: 'markers' }); assert.equal((await snapshot(page)).service.scenes.length, 4); await perform(page, 'scene-launch', { sceneId: initial.service.scenes[0].id });
    await page.locator('[data-service-action="capture-toggle"]').click(); await page.locator('[data-service-action="play"]').click(); await page.waitForFunction(() => window.LoomApp.service.getSnapshot().running && !window.LoomApp.service.getSnapshot().busy).catch(async error => { console.log('Native note preparation', JSON.stringify(await page.evaluate(() => { const app = window.LoomApp, s = app.service.getSnapshot(); return { message: s.message, busy: s.busy, running: s.running, capture: s.capture, mode: app.engine.mode, context: app.engine.context?.state, contextRate: app.engine.context?.sampleRate, prepared: !!app.service.prepared, frames: document.querySelectorAll('iframe').length }; }))); console.log('Page errors', JSON.stringify(errors)); await page.screenshot({ path: path.join(resultsDir, 'native-note-failure.png') }); throw error; });
    const source = await page.evaluate(() => { const p = window.LoomApp.service.prepared, clip = p.state.tracks[2].clips[0], audio = p.assets[clip.assetId]; return { clip, frames: audio.left.length, rate: audio.sampleRate, peak: audio.left.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0), finite: audio.left.every(Number.isFinite) && audio.right.every(Number.isFinite), liveNotes: window.LoomApp.notePlayback.active, projectType: window.LoomApp.getState().tracks[2].clips[0].type }; });
    assert.equal(source.clip.type, 'audio'); assert.equal(source.projectType, 'notes'); assert.equal(source.frames, source.rate, 'The one-second native loop keeps a complete cycle at its decoded rate'); assert(source.peak > .001 && source.finite); assert.equal(source.liveNotes, false, 'SERVICE prints do not double with arrangement note playback');
    await wait(550); await page.locator('[data-service-action="stop"]').click(); await page.waitForFunction(() => window.LoomApp.service.getSnapshot().capture.canApply); await wait(1000);
    assert.equal(await preservedArrangement(page), before, 'Private native note printing leaves the original notes, patch, assets, and arrangement intact');
    await page.locator('[data-service-action="capture-apply"]').click(); await page.waitForFunction(() => !document.getElementById('loomServiceDialog').open);
    const applied = await page.evaluate(() => window.LoomApp.getState()), clip = applied.tracks[2].clips[0]; assert(clip && clip.type === 'audio'); assert.equal(clip.origin?.format, 'loom-render-source'); assert.equal(clip.origin.sourceClip.type, 'notes'); assert.equal(clip.origin.instrument.id, 'roux'); assert.equal(clip.origin.pattern.notes[0].pitch, 36); assert(applied.assets.some(asset => asset.id === clip.assetId));
    await page.locator('#undoButton').click(); assert.equal(await preservedArrangement(page), before, 'Undo restores the original editable native notes and exact patch'); assert.deepEqual(errors, []);
    passed.push('Marker scenes and explicit marker import / real bundled ROUX native note rendering / no live-note doubling or project mutation / captured audio retains editable patch and pattern / Undo restores notes');
    await page.evaluate(() => window.LoomApp.engine.dispose());
  } finally { await context.close(); }
}

(async () => {
  fs.mkdirSync(resultsDir, { recursive: true }); const server = await serve(); let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--autoplay-policy=user-gesture-required'] });
    if (process.env.LOOM_SERVICE_QA_NOTE_ONLY) await noteAndMarkerChecks(browser, server.url);
    else { await baselineChecks(browser, server.url); await serviceChecks(browser, server.url); }
    const results = { passed: passed.length, checks: passed }; fs.writeFileSync(path.join(resultsDir, 'results.json'), JSON.stringify(results, null, 2) + '\n'); console.log(JSON.stringify(results, null, 2));
  } finally { await browser?.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
