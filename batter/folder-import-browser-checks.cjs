'use strict';
/* Real built BATTER folder inputs and imports. Directory-drop objects are
 * explicit browser API mocks; the folder picker uses actual filesystem paths.
 * BATTER_FOLDER_PHASES selects focused groups after an initial run. Coordinate
 * exclusive Chromium/CPU access with the main agent before running. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { createHash } = require('node:crypto');
const installed = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || (fs.existsSync(installed) ? installed : 'playwright'));
const source = __dirname, directory = process.env.BATTER_FOLDER_QA_DIR || '/tmp/batter-folder-browser';
const report = { passed: [], errors: [], external: [], scope: 'Real directory-file inputs and digital BATTER state; explicit DirectoryEntry mocks for drag/drop.' };
let browser, context, page, server, fixtures, active = 'startup';
fs.mkdirSync(directory, { recursive: true });
function save() { fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
async function check(name, run) {
  active = name; const started = Date.now(), evidence = await run();
  report.passed.push({ name, milliseconds: Date.now() - started, evidence }); save();
  console.log('PASS', name, JSON.stringify(evidence));
}
function wav(frames = 64, frequency = 330) {
  const rate = 8000, bytes = Buffer.alloc(44 + frames * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) bytes.writeInt16LE(Math.round(.3 * Math.sin(2 * Math.PI * frequency * i / rate) * 32767), 44 + i * 2);
  return bytes;
}
function fixtureFiles() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'batter-folder-input-'));
  const good = path.join(base, 'Kitchen-kit'), corrupt = path.join(base, 'Broken-kit'), tooMany = path.join(base, 'Too-many');
  const expected = { '00-first.wav': 32, 'Nested/01-second.WAV': 48, 'a/hit.wav': 64, 'b/hit.wav': 80, 'Nested/deep/02-third.wav': 96 };
  const put = (root, name, bytes) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); return file; };
  for (const [name, frames] of Object.entries(expected)) put(good, name, wav(frames, 110 + frames));
  put(good, 'README.txt', 'This file must not become a drum.'); put(good, '.DS_Store', 'metadata');
  put(good, '.hidden/ghost.wav', wav(24)); put(good, '__MACOSX/._hit.wav', wav(24));
  put(corrupt, '01-good.wav', wav()); put(corrupt, '02-corrupt.wav', Buffer.from('This is not WAV audio.'));
  for (let i = 0; i < 129; i++) put(tooMany, String(i).padStart(3, '0') + '.wav', wav(16));
  return { base, good, corrupt, tooMany, expected, single: put(base, 'single.wav', wav(112, 440)) };
}
async function serve() {
  const html = fs.readFileSync(process.env.BATTER_FOLDER_HTML || path.join(source, 'index.html'), 'utf8');
  report.htmlSHA256 = createHash('sha256').update(html).digest('hex'); report.sourceHashes = {};
  for (const name of ['engine.js', 'folder-import.js', 'app.js']) {
    const file = path.join(source, name); if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf8'); report.sourceHashes[name] = createHash('sha256').update(raw).digest('hex');
    const embedded = raw.replace(/<\/script/gi, '<\\/script').split('\n').map(line => line.trimEnd()).join('\n').trim();
    assert(html.includes(embedded), 'Rebuild BATTER before browser QA: ' + name + ' differs from compiled HTML.');
  }
  server = http.createServer((request, response) => {
    if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + server.address().port + '/batter/';
}
async function settled() {
  await page.waitForFunction(() => !document.body.classList.contains('working') && !BatterUI.engine.importing &&
    [...document.querySelectorAll('[data-cancel-sample-import]')].every(button => button.hidden), null, { timeout: 30000 });
}
async function reset(lane = 'kick') {
  await settled();
  await page.evaluate(() => {
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    const state = BatterSchema.defaultState(); state.name = 'Folder import proof'; state.master.volume = .5;
    BatterUI.engine.setState(state); BatterUI.refresh();
  });
  await page.locator('.lane-pad[data-lane="' + lane + '"]').click(); await settled();
}
async function state() { return page.evaluate(() => BatterUI.engine.getState()); }
async function exactState() { return JSON.stringify(await state()); }
async function historyStatus() { return page.evaluate(() => ({ undo: document.getElementById('undoButton').disabled, redo: document.getElementById('redoButton').disabled })); }
async function pickFolder(folder, selector = '#importFolderButton', beforePick) {
  const pending = page.waitForEvent('filechooser'); await page.locator(selector).click(); const chooser = await pending;
  if (beforePick) await beforePick();
  await chooser.setFiles(folder); await settled();
}
async function importSingle(file) {
  const pending = page.waitForEvent('filechooser'); await page.locator('#importSampleButton').click();
  await (await pending).setFiles(file); await settled();
}
function assertPaths(assets) {
  assert.equal(assets.length, 5, 'Only supported, visible samples enter the project.');
  const seen = new Set();
  for (const asset of assets) {
    assert.equal(typeof asset.originalPath, 'string', 'Imported folder paths are retained.');
    const normalized = asset.originalPath.replace(/\\/g, '/');
    const suffix = Object.keys(fixtures.expected).find(name => normalized === name || normalized.endsWith('/' + name));
    assert(suffix, 'Unexpected imported path: ' + normalized); assert(!seen.has(suffix)); seen.add(suffix);
    assert.equal(asset.frames, fixtures.expected[suffix], 'Correct source data for ' + suffix);
    assert.equal(asset.sampleRate, 8000); assert.equal(asset.channels, 1);
  }
  assert.equal(seen.size, 5);
}
async function pickerChecks() {
  await check('Real folder picker imports nested audio in deterministic path order while skipping non-audio and hidden files', async () => {
    await reset(); await page.locator('#importMode').selectOption('layers');
    const before = await exactState(); await pickFolder(fixtures.good);
    const first = await state(); assertPaths(first.assets);
    assert.equal(first.lanes[0].sampleIds.length, 5); assert.equal(first.lanes[0].layerMode, 'roundrobin');
    assert.deepEqual(first.lanes[0].sampleIds, first.assets.map(asset => asset.id));
    const paths = first.assets.map(asset => asset.originalPath);
    await page.locator('#undoButton').click(); assert.equal(await exactState(), before, 'One Undo restores the entire prior kit.');
    await page.locator('#redoButton').click(); assert.deepEqual(await state(), first, 'One Redo restores every imported sample.');
    await reset(); await page.locator('#importMode').selectOption('layers'); await pickFolder(fixtures.good);
    assert.deepEqual((await state()).assets.map(asset => asset.originalPath), paths, 'The same folder has stable ordering across imports.');
    return { imported: 5, paths, duplicateBasenames: paths.filter(name => name.endsWith('/hit.wav')).length, oneUndoRedo: true };
  });
}
async function routingChecks() {
  await check('Folder mode uses separate A lanes, and browser B imports keep their captured lane/source/mode', async () => {
    await reset(); await page.locator('#importMode').selectOption('lanes'); await pickFolder(fixtures.good);
    const lanes = await state(); assertPaths(lanes.assets);
    for (let i = 0; i < 5; i++) { assert.deepEqual(lanes.lanes[i].sampleIds, [lanes.assets[i].id]); assert.equal(lanes.lanes[i].layerMode, 'single'); }
    assert(lanes.lanes.slice(5).every(lane => lane.sampleIds.length === 0));
    await reset('snare'); await page.locator('#importMode').selectOption('layers'); await page.locator('#pickSourceB').click();
    await pickFolder(fixtures.good, '#browserFolderButton', async () => {
      // Use the actual lane click handler while the native picker is pending.
      await page.evaluate(() => { document.querySelector('.lane-pad[data-lane="ride"]').click(); document.getElementById('importMode').value = 'lanes'; });
    });
    const captured = await state(); assertPaths(captured.assets);
    assert.equal(captured.lanes[1].blend.sampleIds.length, 5); assert(captured.lanes[1].blend.enabled);
    assert.equal(captured.lanes[1].sampleIds.length, 0); assert.equal(captured.lanes[5].sampleIds.length, 0); assert.equal(captured.lanes[5].blend.sampleIds.length, 0);
    return { separateLanes: 5, capturedTarget: 'snare/source B', visibleLaneChangedTo: 'ride', AUnchanged: true };
  });
  await check('Append includes a single selected file and preserves the existing layer group', async () => {
    await reset(); await page.locator('#importMode').selectOption('layers'); await pickFolder(fixtures.good);
    const old = await state(), ids = old.lanes[0].sampleIds;
    await page.locator('#importMode').selectOption('append'); await importSingle(fixtures.single);
    const appended = await state(); assert.equal(appended.assets.length, 6); assert.equal(appended.lanes[0].sampleIds.length, 6);
    assert.deepEqual(appended.lanes[0].sampleIds.slice(0, 5), ids); assert.equal(appended.lanes[0].layerMode, 'roundrobin');
    await page.locator('#undoButton').click(); assert.deepEqual(await state(), old);
    return { existingLayers: 5, appendedLayers: 6, singleFileAppend: true, oneUndo: true };
  });
}
async function failureChecks() {
  await check('Picker cancellation, changed recipes, corrupt audio and count/capacity failures preserve the kit and Undo history', async () => {
    await reset(); const before = await exactState(), history = await historyStatus();
    await page.locator('#sampleFolder').dispatchEvent('cancel'); await settled();
    assert.equal(await exactState(), before); assert.deepEqual(await historyStatus(), history);
    for (const folder of [fixtures.corrupt, fixtures.tooMany]) {
      await pickFolder(folder); assert.equal(await exactState(), before, 'Failed folder import changed the kit.'); assert.deepEqual(await historyStatus(), history, 'Failed folder import changed history.');
    }
    let changedRecipe;
    await pickFolder(fixtures.good, '#importFolderButton', async () => {
      await page.evaluate(() => { const value = BatterUI.engine.getState(); value.name = 'New recipe while picker is open'; BatterUI.engine.setState(value); BatterUI.refresh(); });
      changedRecipe = await exactState();
    });
    assert.equal(await exactState(), changedRecipe, 'A stale picker overwrote a newer recipe.'); assert.deepEqual(await historyStatus(), history);
    await reset('percussion'); await page.locator('#importMode').selectOption('lanes');
    const lastBefore = await exactState(), lastHistory = await historyStatus(); await pickFolder(fixtures.good);
    assert.equal(await exactState(), lastBefore); assert.deepEqual(await historyStatus(), lastHistory);
    return { cancelUnchanged: true, changedRecipePreserved: true, corruptAtomic: true, fileLimit: 128, availableLaneCapacityAtomic: true };
  });
  await check('Append layer overflow and total asset overflow reject rather than silently truncating imported samples', async () => {
    for (const [assetCount, layerCount] of [[128, 128], [256, 0]]) {
      await reset();
      await page.evaluate(({ assetCount, layerCount }) => {
        const state = BatterSchema.defaultState(), left = new Float32Array(16).fill(.1);
        state.assets = Array.from({ length: assetCount }, (_, i) => BatterSchema.encodeAsset({ left, sampleRate: 8000, channels: 1 }, { id: 'existing-' + i, name: 'Existing ' + i }));
        state.lanes[0].sampleIds = state.assets.slice(0, layerCount).map(asset => asset.id); state.lanes[0].sampleId = state.lanes[0].sampleIds[0] || '';
        BatterUI.engine.setState(state); BatterUI.refresh();
      }, { assetCount, layerCount });
      await page.locator('#importMode').selectOption('append'); const before = await exactState(), history = await historyStatus();
      await importSingle(fixtures.single); assert.equal(await exactState(), before); assert.deepEqual(await historyStatus(), history);
    }
    return { maxLayers: 128, maxStoredAssets: 256, noSilentDrop: true };
  });
}
async function directoryDropChecks() {
  await check('The real drop handler walks multiple DirectoryEntry batches, captures its target and supports cancellation', async () => {
    await reset('rim'); await page.locator('#importMode').selectOption('layers');
    const wave = wav(64, 330).toString('base64');
    async function drop(delay = 20, cancel = false) {
      await page.evaluate(({ wave, delay }) => {
        const bytes = Uint8Array.from(atob(wave), char => char.charCodeAt(0));
        const probe = { fileReads: 0, batches: 0, capturedEntries: 0 }; window.BatterDropQA = probe;
        const file = name => ({ isFile: true, isDirectory: false, name, file: done => { probe.fileReads++; setTimeout(() => done(new File([bytes], name, { type: 'audio/wav' })), delay); } });
        const dir = (name, batches) => ({ isFile: false, isDirectory: true, name, createReader() { let n = 0; return { readEntries(done) { probe.batches++; setTimeout(() => done(batches[n++] || []), delay); } }; } });
        const root = dir('Dropped kit', [[file('first.wav')], [dir('nested', [[file('second.wav')]])]]);
        const dataTransfer = new DataTransfer(); dataTransfer.items.add(new File(['folder placeholder'], 'Dropped kit'));
        const item = dataTransfer.items[0], entry = () => root;
        Object.defineProperty(item, 'getAsFileSystemHandle', { value: undefined }); Object.defineProperty(item, 'webkitGetAsEntry', { value: entry });
        const event = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer });
        probe.nativeWrapperPreserved = event.dataTransfer.items[0] === item;
        probe.nativeOverridePreserved = event.dataTransfer.items[0].webkitGetAsEntry === entry;
        // DataTransferItem wrappers may lose test-only own methods. An explicit
        // stable API mock is honest about the scope and still enters the real
        // production drop handler and collector without patching their code.
        Object.defineProperty(event, 'dataTransfer', { value: { items: [{ kind: 'file', webkitGetAsEntry() { probe.capturedEntries++; return root; } }], files: [], types: ['Files'], dropEffect: 'copy' } });
        document.querySelector('.sample-panel').dispatchEvent(event);
      }, { wave, delay });
      if (cancel) { await page.locator('#cancelSampleImportButton').waitFor({ state: 'visible' }); await page.locator('#cancelSampleImportButton').click(); }
      else await page.evaluate(() => document.querySelector('.lane-pad[data-lane="ride"]').click());
      await settled(); await page.waitForTimeout(delay * 3);
    }
    await drop();
    const probe = await page.evaluate(() => ({ ...BatterDropQA, status: document.getElementById('sampleImportStatus').textContent }));
    report.dropProbe = probe;
    const imported = await state(); assert.equal(imported.assets.length, 2, JSON.stringify(probe)); assert.equal(imported.lanes[2].sampleIds.length, 2); assert.equal(imported.lanes[5].sampleIds.length, 0);
    assert.equal(probe.capturedEntries, 1); assert.equal(probe.fileReads, 2); assert(probe.batches >= 5);
    assert(imported.assets.some(asset => asset.originalPath.endsWith('/nested/second.wav')));
    const before = await exactState(), history = await historyStatus(); await drop(80, true);
    assert.equal(await exactState(), before); assert.deepEqual(await historyStatus(), history);
    return { recursiveDropSamples: 2, multiBatchRead: true, capturedLane: 'rim', actualCancelButton: true, canceledStateUnchanged: true, probe };
  });
}
async function projectChecks() {
  await check('Actual project Save/Open retains folder paths, duplicate filenames and exact imported PCM', async () => {
    await reset(); await page.locator('#importMode').selectOption('layers'); await pickFolder(fixtures.good); const original = await state();
    const download = page.waitForEvent('download'); await page.locator('#saveButton').click(); const file = path.join(directory, 'folder-kit.json'); await (await download).saveAs(file); await settled();
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')); assert.deepEqual(saved.state.assets, original.assets);
    await reset(); await page.locator('#projectFile').setInputFiles(file); await settled();
    const restored = await state(); assert.deepEqual(restored, original); assertPaths(restored.assets);
    return { savedBytes: fs.statSync(file).size, importedPCMExact: true, pathsRetained: true, duplicateBasenamesRetained: true };
  });
}
async function layoutChecks() {
  await check('Folder controls fit 320/390/1440 layouts and retain explicit source and batch controls', async () => {
    const rows = []; await reset();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); await page.locator('#importFolderButton').scrollIntoViewIfNeeded();
      const result = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
        folder: !!document.getElementById('sampleFolder').webkitdirectory, batch: document.getElementById('importMode').options.length,
        label: document.getElementById('importFolderButton').textContent.trim(), visible: document.getElementById('importFolderButton').getBoundingClientRect().width > 0 }));
      assert(result.scroll <= width + 1); assert(result.folder && result.visible && result.batch >= 3);
      await page.locator('.sample-import-row').screenshot({ path: path.join(directory, 'folder-import-' + width + '.png') });
      await page.locator('#pickSourceB').click(); await page.locator('#browserFolderButton').scrollIntoViewIfNeeded();
      const browserFits = await page.evaluate(() => {
        const dialog = document.getElementById('sampleDialog'), button = document.getElementById('browserFolderButton').getBoundingClientRect();
        return { dialogWidth: dialog.clientWidth, dialogScroll: dialog.scrollWidth, left: button.left, right: button.right, width: innerWidth };
      });
      assert(browserFits.dialogScroll <= browserFits.dialogWidth + 1); assert(browserFits.left >= 0 && browserFits.right <= browserFits.width + 1);
      await page.locator('#closeSampleDialog').click(); rows.push({ ...result, browserFolderFits: true });
    }
    return { layouts: rows };
  });
}
(async () => {
  try {
    fixtures = fixtureFiles(); const url = await serve();
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('**/*', route => {
      const request = route.request().url();
      if (/^(blob:|data:|about:)/.test(request) || request.startsWith(new URL(url).origin + '/')) return route.continue();
      report.external.push(request); return route.abort();
    });
    page = await context.newPage(); page.on('pageerror', error => report.errors.push({ check: active, message: error.message, stack: error.stack }));
    await page.goto(url, { waitUntil: 'load', timeout: 120000 }); await page.waitForFunction(() => window.BatterUI?.engine && window.BatterSchema, null, { timeout: 30000 });
    const phases = (process.env.BATTER_FOLDER_PHASES || 'picker,routing,failures,drop,project,layout').split(',');
    for (const phase of phases) {
      if (phase === 'picker') await pickerChecks(); else if (phase === 'routing') await routingChecks(); else if (phase === 'failures') await failureChecks();
      else if (phase === 'drop') await directoryDropChecks(); else if (phase === 'project') await projectChecks(); else if (phase === 'layout') await layoutChecks(); else throw Error('Unknown phase: ' + phase);
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []);
    console.log('BATTER folder browser:', report.passed.length, 'groups passed.', directory);
  } catch (error) { report.failure = { check: active, message: error.message, stack: error.stack }; console.error(error); process.exitCode = 1; }
  finally {
    await page?.evaluate(() => BatterUI.engine.dispose()).catch(() => {}); await context?.close().catch(() => {}); await browser?.close(); report.chromiumClosed = true;
    if (server) await new Promise(resolve => server.close(resolve)); if (fixtures) fs.rmSync(fixtures.base, { recursive: true, force: true }); save();
  }
})();
