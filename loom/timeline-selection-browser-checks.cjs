'use strict';
/* Real built-GALLEY timeline interactions. No runtime source is patched.
 * TIMELINE_QA_PHASES selects comma-separated groups for a focused rerun.
 * Coordinate exclusive Chromium with the main agent before running. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { createHash } = require('node:crypto');
const installed = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || (fs.existsSync(installed) ? installed : 'playwright'));
const directory = process.env.TIMELINE_QA_DIR || '/tmp/galley-timeline-selection-browser';
const report = { passed: [], errors: [], external: [] };
let browser, server, context, page, active = 'startup';
fs.mkdirSync(directory, { recursive: true });
function save() { fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
async function check(name, run) {
  active = name; const started = Date.now(), evidence = await run();
  report.passed.push({ name, milliseconds: Date.now() - started, evidence }); save();
  console.log('PASS', name, JSON.stringify(evidence));
}
function install(scope) {
  const S = scope.LoomSchema, copy = value => JSON.parse(JSON.stringify(value));
  function fixture(options = {}) {
    const state = S.defaultState(), rate = 48000;
    state.name = 'Timeline group fixture'; state.tempo = 120; state.lengthBars = 8;
    state.loopEnabled = false; state.loopStart = 0; state.loopEnd = 32;
    state.view = { ...state.view, zoom: 40, snap: .25, follow: false }; state.recording.punchEnd = 32;
    for (const owner of [...state.tracks, ...state.returns, state.master]) { owner.effects.fill(null); owner.automation = []; }
    state.lfos.forEach(lfo => { lfo.enabled = false; lfo.routes = []; });
    state.tracks.forEach(track => { track.clips = []; track.instrument = null; track.instrumentLive = false; track.sends = [0, 0]; });
    const left = Float32Array.from({ length: rate / 2 }, (_, i) => .12 * Math.sin(2 * Math.PI * 137 * i / rate));
    const right = Float32Array.from({ length: rate / 2 }, (_, i) => .09 * Math.cos(2 * Math.PI * 227 * i / rate));
    const asset = S.encodeAsset({ id: 'timeline-audio', name: 'Stereo timing source', left, right, sampleRate: rate });
    state.assets = [asset];
    const audio = (id, start, length) => ({ id, name: id, type: 'audio', assetId: asset.id, start, length,
      sourceStart: .05, sourceEnd: .45, sourceOffset: .025, rate: .75, reverse: true, loop: true, gain: .63, fadeIn: .03, fadeOut: .09 });
    const pattern = { format: 'musiclab-pattern', version: 1, name: 'Variable length notes', sourceApp: 'loom', kind: 'notes',
      tempo: 120, swing: 0, lengthBeats: 4, meter: [4, 4], seed: 717,
      voices: [{ id: 'lead', name: 'Lead', pitch: 60 }], notes: [
        { id: 'short', voice: 'lead', pitch: 60, beat: 0, duration: .375, velocity: .7, probability: 1, accent: false, slide: false },
        { id: 'long', voice: 'lead', pitch: 67, beat: 1.25, duration: 1.375, velocity: .9, probability: .75, accent: true, slide: true }
      ] };
    state.tracks[0].clips = [audio('clip-a', 2.1, 2)];
    state.tracks[2].clips = [{ id: 'clip-b', name: 'Notes B', type: 'notes', pattern, voiceMap: { lead: 'notes' },
      start: 6.35, length: 1.5, sourceOffset: .375, rate: 1.25, loop: true, gain: .74, fadeIn: .05, fadeOut: .1, transpose: -12 }];
    state.tracks[1].clips = [audio('clip-c', 10, 1)];
    if (options.zero) state.tracks[0].clips[0].start = 0;
    if (options.coarse) {
      state.view.snap = 4; state.tracks[0].clips[0].start = .25; state.tracks[0].clips[0].length = .5;
      state.tracks[2].clips[0].start = 1; state.tracks[2].clips[0].length = .25;
    }
    if (options.boundary) { state.tracks[0].clips[0].start = .25; state.tracks[2].clips[0].start = 28.5; state.tracks[2].clips[0].length = 3.25; }
    if (options.capacity) state.tracks[1].clips = Array.from({ length: 128 }, (_, i) => audio('full-' + i, 10 + i / 1024, .25));
    if (options.off) { state.tracks[0].disabled = true; state.tracks[2].disabled = true; }
    if (options.frozen) {
      state.lengthBars = 2; state.loopEnd = 8; state.recording.punchEnd = 8;
      state.view.zoom = 80; state.tracks[0].clips[0].start = 1; state.tracks[0].clips[0].length = 1.25;
      state.tracks[2].clips[0].start = 3; state.tracks[2].clips[0].length = 1.5;
      state.tracks[1].clips[0].start = 5;
    }
    return S.normalize(state);
  }
  function clips(state = scope.LoomApp.getState()) {
    return Object.fromEntries(state.tracks.flatMap((track, index) => track.clips.map(clip => [clip.id, { track: index, ...copy(clip) }])));
  }
  const originalSetState = scope.LoomApp.engine.setState;
  let stateCalls = 0;
  scope.LoomApp.engine.setState = function (...args) { stateCalls++; return originalSetState.apply(this, args); };
  scope.TimelineQA = { fixture, clips, copy, get calls() { return stateCalls; }, resetCalls() { stateCalls = 0; } };
}
async function serve() {
  const html = fs.readFileSync(process.env.TIMELINE_QA_HTML || path.join(__dirname, 'index.html'), 'utf8');
  report.htmlSHA256 = createHash('sha256').update(html).digest('hex');
  const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  report.appSHA256 = createHash('sha256').update(source).digest('hex');
  const embedded = source.replace(/<\/script/gi, '<\\/script').split('\n').map(line => line.trimEnd()).join('\n').trim();
  assert(html.includes(embedded), 'Rebuild GALLEY before testing: the compiled app must match current source.');
  server = http.createServer((request, response) => {
    if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + server.address().port + '/loom/';
}
const clip = id => page.locator('[data-clip="' + id + '"]');
async function selected() { return (await page.evaluate(() => Array.from(LoomApp.selectedClips))).sort(); }
async function clips() { return page.evaluate(() => TimelineQA.clips()); }
async function calls() { return page.evaluate(() => TimelineQA.calls); }
async function select(ids, primary = ids[0]) { await page.evaluate(({ ids, primary }) => LoomApp.selectClips(ids, { primary }), { ids, primary }); }
async function load(options = {}) {
  await page.evaluate(options => LoomApp.loadState(TimelineQA.fixture(options)), options);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.locator('#zoom').evaluate((element, value) => { element.value = value; element.dispatchEvent(new Event('input', { bubbles: true })); }, options.frozen ? 80 : 40);
  await page.locator('[data-lane="0"]').scrollIntoViewIfNeeded();
  await page.evaluate(() => { document.getElementById('timelineScroll').scrollLeft = 0; TimelineQA.resetCalls(); });
}
function payload(item) { const value = { ...item }; delete value.start; delete value.track; return value; }
function near(actual, expected, description) { assert(Math.abs(actual - expected) < 1e-8, description + ': ' + actual + ' !== ' + expected); }
async function point(id, part = .5) {
  await clip(id).scrollIntoViewIfNeeded(); const box = await clip(id).boundingBox();
  assert(box && box.width > 8, 'Visible clip ' + id); return { x: box.x + box.width * part, y: box.y + box.height * .5, box };
}
async function beginDrag(id, dx, targetTrack) {
  const start = await point(id), lane = await page.locator('[data-lane="' + targetTrack + '"]').boundingBox();
  assert(lane, 'Target lane exists');
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + dx, lane.y + lane.height * .5, { steps: 8 });
  return { start, end: { x: start.x + dx, y: lane.y + lane.height * .5 } };
}
async function drag(id, dx, targetTrack) { const result = await beginDrag(id, dx, targetTrack); await page.mouse.up(); return result; }
async function modifierClick(id, modifier) { await clip(id).click({ modifiers: [modifier] }); }
async function selectionChecks() {
  await check('Modifier and marquee selections highlight clips across tracks without audio updates', async () => {
    await load(); const before = await clips();
    await clip('clip-a').click(); await modifierClick('clip-b', 'Shift');
    assert.deepEqual(await selected(), ['clip-a', 'clip-b']);
    await clip('clip-a').click(); assert.deepEqual(await selected(), ['clip-a', 'clip-b'], 'Clicking a selected member retains its group');
    await modifierClick('clip-b', 'Control'); assert.deepEqual(await selected(), ['clip-a']);
    await modifierClick('clip-b', 'Meta'); assert.deepEqual(await selected(), ['clip-a', 'clip-b']);
    assert.equal(await page.locator('.clip.selected').count(), 2);
    assert.deepEqual(await clips(), before); assert.equal(await calls(), 0);
    const a = await clip('clip-a').boundingBox(), b = await clip('clip-b').boundingBox(), lane = await page.locator('[data-lane="0"]').boundingBox();
    await page.mouse.move(a.x - 12, lane.y + 3); await page.mouse.down();
    await page.mouse.move(b.x + b.width + 4, b.y + b.height + 2, { steps: 10 }); await page.mouse.up();
    assert.deepEqual(await selected(), ['clip-a', 'clip-b']); assert.equal(await calls(), 0);
    const c = await clip('clip-c').boundingBox(), cLane = await page.locator('[data-lane="1"]').boundingBox();
    await page.keyboard.down('Shift'); await page.mouse.move(c.x - 4, cLane.y + 2); await page.mouse.down();
    await page.mouse.move(c.x + c.width + 3, c.y + c.height + 2, { steps: 6 }); await page.mouse.up(); await page.keyboard.up('Shift');
    assert.deepEqual(await selected(), ['clip-a', 'clip-b', 'clip-c']); assert.equal(await calls(), 0);
    await clip('clip-a').focus(); await page.keyboard.press('Escape'); assert.deepEqual(await selected(), []);
    await clip('clip-a').focus(); await page.keyboard.press('Control+a'); assert.deepEqual(await selected(), ['clip-a', 'clip-b', 'clip-c']);
    const empty = await page.evaluate(() => { const lane = document.querySelector('[data-lane="0"]'), box = lane.getBoundingClientRect(); return { x: box.x + 20, y: box.y + box.height / 2 }; });
    await page.mouse.click(empty.x, empty.y); assert.deepEqual(await selected(), []); assert.equal(await calls(), 0);
    return { modifierSelection: true, marquee: true, additiveMarquee: true, keyboardSelectAll: true, audioUpdates: 0 };
  });
}
async function moveChecks() {
  await check('Diagonal group drag commits one snapped delta while preserving note/audio payloads and one Undo', async () => {
    await load(); await select(['clip-a', 'clip-b']); const before = await clips(), untouched = before['clip-c'];
    await beginDrag('clip-a', 60, 1);
    assert.deepEqual(await clips(), before, 'Pointer preview must not alter the project'); assert.equal(await calls(), 0);
    await page.mouse.up(); const moved = await clips();
    near(moved['clip-a'].start, 3.5, 'Primary snaps once'); near(moved['clip-b'].start, 7.75, 'Relative off-grid spacing is retained');
    assert.equal(moved['clip-a'].track, 1); assert.equal(moved['clip-b'].track, 3);
    assert.deepEqual(payload(moved['clip-a']), payload(before['clip-a'])); assert.deepEqual(payload(moved['clip-b']), payload(before['clip-b'])); assert.deepEqual(moved['clip-c'], untouched);
    assert.equal(await calls(), 1, 'One committed gesture updates the audio state once');
    await clip('clip-b').click(); assert.equal(await page.evaluate(() => LoomApp.selectedClip), 'clip-b');
    await page.locator('#undoButton').click(); assert.deepEqual(await clips(), before);
    assert.equal(await page.evaluate(() => LoomApp.getState().selectedTrack), before['clip-b'].track, 'Undo keeps the inspector on the retained primary clip');
    await page.locator('#redoButton').click(); assert.deepEqual(await clips(), moved);
    assert.equal(await page.evaluate(() => LoomApp.getState().selectedTrack), moved['clip-b'].track, 'Redo keeps the inspector on the retained primary clip');
    return { commonBeatDelta: 1.4, commonTrackDelta: 1, spacing: 4.25, deferredCommit: true, singleUndoRedo: true, retainedPrimaryFocus: true };
  });
}
async function clampChecks() {
  await check('Timeline edges clamp the selection as one unit without changing spacing or lengths', async () => {
    await load({ boundary: true }); await select(['clip-a', 'clip-b']); const before = await clips();
    await drag('clip-a', 240, 0); const right = await clips();
    near(right['clip-a'].start, .5, 'Group right clamp'); near(right['clip-b'].start + right['clip-b'].length, 32, 'Latest end is at the session end');
    near(right['clip-b'].start - right['clip-a'].start, before['clip-b'].start - before['clip-a'].start, 'Right clamp retains offsets');
    await page.locator('#undoButton').click(); await select(['clip-a', 'clip-b']);
    await drag('clip-a', -40, 0); const left = await clips();
    near(left['clip-a'].start, 0, 'Group left clamp'); near(left['clip-b'].start, 28.25, 'Other clip follows common left delta');
    assert.equal(left['clip-a'].length, before['clip-a'].length); assert.equal(left['clip-b'].length, before['clip-b'].length);
    return { leftmostStart: 0, rightmostEnd: 32, lengthsRetained: true, sharedClamping: true };
  });
}
async function cancelChecks() {
  await check('Escape, pointer cancellation and no-op drops preserve project state, audio state and Redo', async () => {
    await load({ zero: true }); await select(['clip-a', 'clip-b']); await clip('clip-a').focus(); await page.keyboard.press('ArrowRight');
    await page.locator('#undoButton').click(); const before = await clips(); assert.equal(await page.locator('#redoButton').isDisabled(), false);
    await select(['clip-a', 'clip-b']); await page.evaluate(() => TimelineQA.resetCalls());
    await beginDrag('clip-a', 80, 0); assert.deepEqual(await clips(), before); await page.keyboard.press('Escape'); await page.mouse.up();
    assert.deepEqual(await clips(), before); assert.equal(await calls(), 0); assert.equal(await page.locator('#redoButton').isDisabled(), false);
    await select(['clip-a', 'clip-b']); await page.evaluate(() => document.addEventListener('pointerdown', event => window.timelinePointer = event.pointerId, { capture: true, once: true }));
    await beginDrag('clip-a', 40, 0);
    await page.evaluate(() => document.querySelector('[data-clip="clip-a"]').dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: window.timelinePointer, pointerType: 'mouse' })));
    await page.mouse.up(); assert.deepEqual(await clips(), before); assert.equal(await calls(), 0); assert.equal(await page.locator('#redoButton').isDisabled(), false);
    await select(['clip-a', 'clip-b']); const p = await point('clip-a'); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 1, p.y, { steps: 2 }); await page.mouse.up();
    assert.deepEqual(await clips(), before); assert.equal(await calls(), 0); assert.equal(await page.locator('#redoButton').isDisabled(), false);
    await drag('clip-a', -30, 0); assert.deepEqual(await clips(), before); assert.equal(await calls(), 0); assert.equal(await page.locator('#redoButton').isDisabled(), false);
    return { escape: true, pointerCancel: true, noOp: true, clampedNoOp: true, audioUpdates: 0, redoRetained: true };
  });
}
async function keyboardChecks() {
  await check('Arrow keys move a group, Shift trims require one clip and Off-track editing remains available', async () => {
    await load({ off: true }); await select(['clip-a', 'clip-b']); const before = await clips();
    await clip('clip-a').focus(); await page.keyboard.press('ArrowRight'); let after = await clips();
    near(after['clip-a'].start - before['clip-a'].start, .25, 'Primary keyboard delta'); near(after['clip-b'].start - before['clip-b'].start, .25, 'Group keyboard delta');
    assert(await page.evaluate(() => LoomApp.getState().tracks[0].disabled && LoomApp.getState().tracks[2].disabled));
    await page.keyboard.press('ArrowDown'); after = await clips(); assert.equal(after['clip-a'].track, 1); assert.equal(after['clip-b'].track, 3);
    const beforeTrim = await clips(); await page.keyboard.press('Shift+ArrowRight'); assert.deepEqual(await clips(), beforeTrim, 'A group cannot be accidentally resized');
    assert.match(await page.locator('#status').textContent(), /one clip|single|trim/i);
    assert.equal(await page.locator('#clipSplitQuick').isDisabled(), true); assert.equal(await page.locator('#transferClipButton').isDisabled(), true);
    return { horizontalNudge: .25, verticalNudge: 1, offTracksEditable: true, multiTrimBlocked: true, singleOnlyActionsBlocked: true };
  });
}
async function bulkChecks() {
  await check('Duplicate and Delete operate atomically on the selected group with one Undo', async () => {
    await load(); await select(['clip-a', 'clip-b']); const before = await clips();
    await page.locator('#clipDuplicateQuick').click(); const duplicated = await clips(), ids = (await selected()).filter(id => !before[id]);
    assert.equal(ids.length, 2); assert.equal(Object.keys(duplicated).length, 5);
    const duplicates = ids.map(id => duplicated[id]).sort((a, b) => a.track - b.track);
    near(duplicates[0].start, 8, 'Duplicate group anchors at one snapped offset'); near(duplicates[1].start, 12.25, 'Duplicate group retains relative timing');
    for (const [copy, original] of [[duplicates[0], before['clip-a']], [duplicates[1], before['clip-b']]]) {
      const a = payload(copy), b = payload(original); delete a.id; delete b.id; delete a.name; delete b.name; assert.deepEqual(a, b);
    }
    assert.deepEqual(duplicated['clip-a'], before['clip-a']); assert.deepEqual(duplicated['clip-b'], before['clip-b']); assert.deepEqual(duplicated['clip-c'], before['clip-c']);
    await page.locator('#undoButton').click(); assert.deepEqual(await clips(), before);
    await select(['clip-a', 'clip-b']); await clip('clip-a').focus(); await page.keyboard.press('Delete');
    assert.deepEqual(Object.keys(await clips()), ['clip-c']); await page.locator('#undoButton').click(); assert.deepEqual(await clips(), before);
    await load({ boundary: true }); await select(['clip-a', 'clip-b']); const edge = await clips(); await page.evaluate(() => TimelineQA.resetCalls());
    await page.locator('#clipDuplicateQuick').click(); assert.deepEqual(await clips(), edge); assert.equal(await calls(), 0);
    await load({ coarse: true }); await select(['clip-a', 'clip-b']); const coarseBefore = await clips();
    await page.locator('#clipDuplicateQuick').click(); const coarse = await clips(), coarseIds = (await selected()).filter(id => !coarseBefore[id]);
    assert.equal(coarseIds.length, 2); const coarseCopies = coarseIds.map(id => coarse[id]).sort((a, b) => a.track - b.track);
    near(coarseCopies[0].start, 4, 'Coarse-grid duplicate starts at the next bar after the selection'); near(coarseCopies[1].start, 4.75, 'Coarse-grid duplicate keeps internal spacing');
    assert(coarseCopies.every(c => c.start >= 1.25), 'Duplicate group must not overlap the original selection');
    return { groupOffset: 5.9, duplicateCount: 2, originalPayloadsRetained: true, bulkDelete: true, invalidDuplicateAtomic: true, coarseBarSnap: true };
  });
}
async function guardChecks() {
  await check('Full and frozen destination tracks reject the entire group move before audio or history changes', async () => {
    await load({ capacity: true }); await select(['clip-a', 'clip-b']); const full = await clips(); await page.evaluate(() => TimelineQA.resetCalls());
    await drag('clip-a', 40, 1); assert.deepEqual(await clips(), full); assert.equal(await calls(), 0);
    assert.match(await page.locator('#status').textContent(), /128|limit|full|clips/i);
    await load({ frozen: true });
    await page.evaluate(async () => { await LoomApp.engine.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'balanced' }); await LoomApp.engine.init(); await LoomApp.freezeTrack('track-2'); });
    assert(await page.evaluate(() => !!LoomApp.getState().tracks[1].freeze));
    await select(['clip-a', 'clip-b']); const frozen = await page.evaluate(() => LoomApp.getState()); await page.evaluate(() => TimelineQA.resetCalls());
    await drag('clip-a', 40, 1); assert.deepEqual((await page.evaluate(() => LoomApp.getState())).tracks, frozen.tracks); assert.equal(await calls(), 0);
    await select(['clip-c', 'clip-b'], 'clip-b'); await clip('clip-b').focus(); await page.keyboard.press('ArrowRight');
    assert.deepEqual((await page.evaluate(() => LoomApp.getState())).tracks, frozen.tracks); assert.equal(await calls(), 0);
    assert(await page.evaluate(() => LoomSchema.freezeValid(LoomApp.getState(), 'track-2')));
    await page.evaluate(() => LoomApp.unfreezeTrack('track-2'));
    return { fullTrackLimit: 128, frozenDestinationAtomic: true, frozenSourceAtomic: true, validCacheRetained: true, rejectedAudioUpdates: 0 };
  });
}
async function trimChecks() {
  await check('Dragging one clip edge retains the existing single-clip trim behavior', async () => {
    await load(); await select(['clip-a', 'clip-b']); const before = await clips();
    const edge = page.locator('[data-clip="clip-a"] [data-edge="right"]'); await edge.scrollIntoViewIfNeeded(); const box = await edge.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, { steps: 6 }); await page.mouse.up();
    const after = await clips(); near(after['clip-a'].length, 2.5, 'Right edge extends only the target clip'); assert.deepEqual(after['clip-b'], before['clip-b']); assert.deepEqual(await selected(), ['clip-a']);
    await page.locator('#undoButton').click(); assert.deepEqual(await clips(), before);
    return { singleEdgeTrim: true, groupCollapsedForTrim: true, otherClipsUntouched: true, oneUndo: true };
  });
}
async function saveChecks() {
  await check('Save/Open retains all moved clips and replacement projects clear transient selection', async () => {
    await load(); await select(['clip-a', 'clip-b']); await drag('clip-a', 60, 1); const moved = await clips();
    const promise = page.waitForEvent('download'); await page.locator('#saveButton').click(); const download = await promise;
    const file = path.join(directory, 'group-move.loom.json'); await download.saveAs(file); const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(saved.state.selectedClips, undefined, 'Selection is transient UI state');
    await load(); assert.deepEqual(await selected(), []); await select(['clip-a', 'clip-b']);
    await page.locator('#projectFile').setInputFiles(file); await page.waitForFunction(() => {
      const clip = LoomApp.getState().tracks[1].clips.find(c => c.id === 'clip-a'); return clip && Math.abs(clip.start - 3.5) < 1e-8;
    });
    assert.deepEqual(await clips(), moved); assert.deepEqual(await selected(), []);
    return { savedBytes: fs.statSync(file).size, movedGeometryRetained: true, selectionNotSerialized: true, staleSelectionCleared: true };
  });
}
async function layoutChecks() {
  await check('Selection feedback stays inside 320/390/1440 layouts', async () => {
    const rows = [];
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); await load(); await select(['clip-a', 'clip-b']);
      const value = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
        highlighted: document.querySelectorAll('.clip.selected').length,
        text: document.getElementById('selectionSummary').textContent + ' ' + document.getElementById('clipActionSummary').textContent }));
      assert(value.scroll <= width + 1, JSON.stringify(value)); assert.equal(value.highlighted, 2); assert.match(value.text, /2|two/i);
      await page.locator('#arrangeTitle').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(directory, 'timeline-selection-' + width + '.png') });
      if (width === 390 || width === 1440) await page.locator('.arrangement-panel').screenshot({ path: path.join(directory, 'arrangement-selection-' + width + '.png') });
      rows.push(value);
    }
    return { layouts: rows };
  });
}
(async () => {
  try {
    const url = await serve();
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
      args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    context = await browser.newContext({ viewport: { width: 1440, height: 1100 } }); const origin = new URL(url).origin;
    await context.route('**/*', route => { const request = route.request().url(); if (/^(blob:|data:|about:)/.test(request) || new URL(request).origin === origin) return route.continue(); report.external.push(request); return route.abort(); });
    page = await context.newPage(); page.on('pageerror', error => report.errors.push({ check: active, message: error.message, stack: error.stack }));
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.LoomApp && typeof LoomApp.selectClips === 'function');
    await page.evaluate('(' + install.toString() + ')(window)');
    const phases = { selection: selectionChecks, move: moveChecks, clamp: clampChecks, cancel: cancelChecks, keyboard: keyboardChecks,
      bulk: bulkChecks, guards: guardChecks, trim: trimChecks, save: saveChecks, layout: layoutChecks };
    for (const phase of (process.env.TIMELINE_QA_PHASES || Object.keys(phases).join(',')).split(',')) {
      assert(phases[phase], 'Unknown timeline phase: ' + phase); await phases[phase]();
    }
    assert.deepEqual(report.errors, [], 'No hidden page errors'); assert.deepEqual(report.external, [], 'No external requests');
    console.log('Timeline selection browser:', report.passed.length, 'groups passed.', directory);
  } catch (error) { report.failure = error.stack || String(error); console.error(error); process.exitCode = 1; }
  finally {
    await page?.evaluate(() => LoomApp.engine.dispose()).catch(() => {}); await context?.close(); await browser?.close(); report.chromiumClosed = true;
    if (server) await new Promise(resolve => server.close(resolve)); save();
  }
})();
