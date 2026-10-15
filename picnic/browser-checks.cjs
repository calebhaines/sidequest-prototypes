'use strict';

// Real standalone UI and audio checks. Build PICNIC first. Browser dependencies
// stay outside the instrument; all screenshots and measurement reports use /tmp.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const installed = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || (fs.existsSync(installed) ? installed : 'playwright'));
const appRoot = __dirname, repoRoot = path.dirname(appRoot);
const artifacts = process.env.PICNIC_QA_ARTIFACTS || '/tmp/picnic-browser-qa';
fs.mkdirSync(artifacts, { recursive: true });
const results = [], errors = [], external = [];
let browser, server;
const copy = value => JSON.parse(JSON.stringify(value));

function serve() {
  const html = fs.readFileSync(process.env.PICNIC_QA_FILE || path.join(appRoot, 'index.html'));
  server = http.createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); } catch (_) { response.writeHead(400); return response.end(); }
    response.setHeader('Cache-Control', 'no-store');
    if (/^\/picnic(?:\/index\.html)?\/?$/.test(pathname)) { response.setHeader('Content-Type', 'text/html'); return response.end(html); }
    if (pathname === '/offline-shell') { response.setHeader('Content-Type', 'text/html'); return response.end('<!doctype html><title>Offline PICNIC shell</title>'); }
    let file = path.resolve(repoRoot, '.' + pathname);
    if (!file.startsWith(repoRoot + path.sep)) { response.writeHead(403); return response.end(); }
    try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch (_) {}
    if (!fs.existsSync(file)) { response.writeHead(404); return response.end(); }
    response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(response);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve('http://127.0.0.1:' + server.address().port + '/picnic/')));
}
async function check(name, run) {
  if (process.env.PICNIC_QA_FILTER && !new RegExp(process.env.PICNIC_QA_FILTER).test(name)) return;
  const start = Date.now(), evidence = await run();
  results.push({ name, milliseconds: Date.now() - start, evidence });
  console.log('PASS ' + name + (evidence === undefined ? '' : ' ' + JSON.stringify(evidence)));
}
async function getState(page) { return page.evaluate(() => PicnicApp.getState()); }
async function fresh(page) { await page.evaluate(() => PicnicApp.loadState(PicnicSchema.createDefault())); }
async function field(page, selector, value) {
  await page.locator(selector).evaluate((element, value) => {
    element.value = String(value); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
async function ready(page, url) {
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.goto(url); await page.waitForFunction(() => window.PicnicApp && window.MusicLabPatternInstrument);
}
function audible(stats, name) {
  assert(stats.frames > 1000, name + ' has stereo PCM frames'); assert.equal(stats.nonfinite, 0, name + ' finite');
  assert(stats.peak > .001 && stats.rms > .00001, name + ' audible'); assert(stats.peak <= 1.001, name + ' bounded');
}

(async () => {
  const url = process.argv[2] || process.env.PICNIC_QA_URL || await serve(), origin = new URL(url).origin;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--autoplay-policy=user-gesture-required'] });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => {
    const address = route.request().url();
    if (/^(data:|blob:|about:)/.test(address) || new URL(address).origin === origin) return route.continue();
    external.push(address); return route.abort();
  });
  const page = await context.newPage(); await ready(page, url);
  await check('Default six-part phrase renders audible finite stereo factory audio', async () => {
    const result = await page.evaluate(async () => {
      const before = JSON.stringify(PicnicApp.getState());
      const rendered = await PicnicApp.exportAudio({ scope: 'pattern', bars: 2, tailSeconds: .2, includePCM: true });
      const pcm = rendered.pcm;
      if (!(pcm instanceof Float32Array) || pcm.length % 2) throw Error('Expected interleaved Float32 stereo PCM.');
      let peak = 0, square = 0, nonfinite = 0, difference = 0;
      for (let i = 0; i < pcm.length; i++) { const v = pcm[i]; if (!Number.isFinite(v)) nonfinite++; peak = Math.max(peak, Math.abs(v)); square += v * v; if (i % 2 === 0) difference += Math.abs(v - pcm[i + 1]); }
      return { frames: pcm.length / 2, sampleRate: rendered.sampleRate, peak, rms: Math.sqrt(square / pcm.length), nonfinite, stereoDifference: difference, unchanged: before === JSON.stringify(PicnicApp.getState()) };
    });
    audible(result, 'Default phrase'); assert(result.stereoDifference > .001, 'Per-part pan and samples produce stereo'); assert(result.unchanged); return result;
  });
  await check('Play produces real stereo audio, Panic clears voices, and mute/solo affect rendering', async () => {
    await fresh(page); await page.locator('#playButton').click();
    await page.waitForFunction(() => PicnicApp.isPlaying() && PicnicApp.engine.activeVoices > 0);
    const live = await page.evaluate(async () => {
      const engine = PicnicApp.engine, context = engine.context, tap = context.createScriptProcessor(1024, 2, 2), sink = context.createGain(); sink.gain.value = 0;
      engine.output.connect(tap); tap.connect(sink); sink.connect(context.destination);
      const evidence = { frames: 0, peak: 0, energy: 0, nonfinite: 0, stereoDifference: 0, channels: 2 };
      tap.onaudioprocess = event => {
        const left = event.inputBuffer.getChannelData(0), right = event.inputBuffer.getChannelData(1); evidence.frames += left.length;
        for (let i = 0; i < left.length; i++) { for (const value of [left[i], right[i]]) { if (!Number.isFinite(value)) evidence.nonfinite++; evidence.peak = Math.max(evidence.peak, Math.abs(value)); evidence.energy += value * value; } evidence.stereoDifference += Math.abs(left[i] - right[i]); }
      };
      await new Promise(resolve => setTimeout(resolve, 600)); engine.output.disconnect(tap); tap.disconnect(); sink.disconnect();
      evidence.rms = Math.sqrt(evidence.energy / Math.max(1, evidence.frames * 2)); delete evidence.energy; return evidence;
    });
    audible(live, 'Captured live output'); assert(live.stereoDifference > .001);
    await page.locator('#panicButton').click(); assert.equal(await page.evaluate(() => PicnicApp.isPlaying()), false); assert.equal(await page.evaluate(() => PicnicApp.engine.activeVoices), 0);
    const mix = await page.evaluate(async () => {
      const base = PicnicSchema.createDefault(); const levels = [];
      for (const mode of ['muted', 'bass-solo']) {
        const state = PicnicSchema.clone(base); for (const part of state.parts) { part.mute = mode === 'muted'; part.solo = mode === 'bass-solo' && part.id === 'bass'; }
        const events = PicnicSequence.events(state, { startBeat: 0, lengthBeats: 8 });
        const rendered = await PicnicApp.engine.renderNotes({ state, events, tempo: state.tempo, lengthBeats: 8 });
        let peak = 0; for (const value of rendered.pcm) peak = Math.max(peak, Math.abs(value)); levels.push({ mode, peak, events: events.length });
      }
      return levels;
    });
    assert.equal(mix[0].peak, 0); assert(mix[1].peak > .001); return { live, mix };
  });
  await check('Thirty-two steps, page-two edits and four independent banks round-trip through sixteen steps', async () => {
    await fresh(page);
    await page.evaluate(async () => { const state = PicnicApp.getState(); state.selectedBank = 0; state.banks[0].length = 32; state.banks[0].tracks.melody[31].on = false; await PicnicApp.loadState(state); });
    await page.locator('#patternPages [data-page="1"]').click();
    assert.equal(await page.locator('#scoreGrid .score-step[data-part="melody"]').count(), 16);
    await page.locator('#scoreGrid .score-step[data-part="melody"][data-step="31"]').click();
    await page.locator('#stepOn').check(); await field(page, '#stepNotes', '79,83'); await field(page, '#stepGate', '1.25');
    let state = await getState(page); assert.equal(state.banks[0].length, 32); assert.deepEqual(state.banks[0].tracks.melody[31].notes, [79, 83]); assert(state.banks[0].tracks.melody[31].on);
    const last = copy(state.banks[0].tracks.melody[31]), untouched = copy(state.banks.slice(1)), other = untouched[0];
    await page.locator('#bankButtons [data-bank="1"]').click(); assert.deepEqual((await getState(page)).banks[1], other);
    await page.locator('#bankButtons [data-bank="0"]').click(); await page.locator('#patternLength').selectOption('16');
    assert.equal(await page.locator('#patternPages').isVisible(), false); assert.deepEqual((await getState(page)).banks[0].tracks.melody[31], last);
    await page.locator('#patternLength').selectOption('32'); await page.locator('#patternPages [data-page="1"]').click();
    assert.deepEqual((await getState(page)).banks[0].tracks.melody[31], last); assert.deepEqual((await getState(page)).banks.slice(1), untouched);
    const exported = await page.evaluate(() => MusicLabPatternInstrument.exportPattern({ scope: 'native' }));
    assert.equal(exported.lengthBeats, 8); assert(exported.notes.some(note => note.voice === 'melody' && note.pitch === 79 && note.beat >= 7.75), 'Final-step note reaches the shared sequencer');
    return { length: 32, visibleStepsPerPart: 16, lastStep: last, independentBanks: 4 };
  });
  await check('Composition follows selected key and chords and repeats exactly from its seed', async () => {
    await page.locator('#keySelect').selectOption('5'); await page.locator('#scaleSelect').selectOption('major');
    await field(page, '#chordProgression', 'Imaj7,vi7,ii7,V7'); await field(page, '#seedInput', '8197');
    await page.locator('#composeButton').click(); const first = await getState(page);
    await field(page, '#seedInput', '8197'); await page.locator('#composeButton').click(); const second = await getState(page);
    assert.equal(first.key, 5); assert.equal(first.seed, 8197); assert.deepEqual(second.banks, first.banks); assert.deepEqual(first.banks[first.selectedBank].chords, ['Imaj7', 'vi7', 'ii7', 'V7']);
    const pitchClasses = new Set([0, 2, 4, 5, 7, 9, 11].map(n => (n + 5) % 12));
    for (const step of first.banks[first.selectedBank].tracks.melody) if (step.on) for (const note of step.notes) assert(pitchClasses.has(note % 12), 'Melody follows selected major key');
    for (const [index, step] of first.banks[first.selectedBank].tracks.bass.entries()) if (index % 8 === 0 && step.on) for (const note of step.notes) assert(pitchClasses.has(note % 12), 'Bass chord roots follow selected major key');
    const beforeIdea = await getState(page); await page.locator('#newSeedButton').click(); const newIdea = await getState(page); assert.notEqual(newIdea.seed, beforeIdea.seed);
    await page.locator('#undoButton').click(); assert.deepEqual(await getState(page), beforeIdea, 'Another idea is one undoable composition gesture');
    await page.locator('#redoButton').click(); assert.deepEqual(await getState(page), newIdea);
    return { key: 'F major', seed: 8197, chords: first.banks[first.selectedBank].chords, ideaUndoRedo: true };
  });
  await check('Preset search and audition change the selected part; mute, solo, Undo and Redo remain editable', async () => {
    await page.locator('#scoreGrid .part-select[data-part="melody"]').click();
    const preset = await page.evaluate(() => { const current = PicnicApp.getState().parts.find(part => part.id === 'melody').presetId; const pitch = 60 + PicnicApp.getState().key; return PicnicLibrary.presets.find(preset => preset.id !== current && preset.regions.some(region => pitch >= region.key[0] && pitch <= region.key[1] && 95 >= region.velocity[0] && 95 <= region.velocity[1])); });
    assert(preset); await page.locator('#presetSearch').fill(preset.name);
    const card = page.locator('#presetList .preset-card[data-preset="' + preset.id + '"]'); assert(await card.isVisible()); await card.click();
    await page.waitForFunction(id => PicnicApp.getState().parts.find(part => part.id === 'melody').presetId === id, preset.id);
    await page.locator('[data-audition="' + preset.id + '"]').click();
    await page.waitForFunction(() => PicnicApp.engine.activeVoices > 0); await page.locator('#panicButton').click();
    await page.locator('[data-mute="melody"]').click(); assert((await getState(page)).parts.find(part => part.id === 'melody').mute);
    await page.locator('[data-solo="bass"]').click(); assert((await getState(page)).parts.find(part => part.id === 'bass').solo);
    const previous = (await getState(page)).parts.find(part => part.id === 'bass').solo;
    await page.locator('#undoButton').click(); assert.equal((await getState(page)).parts.find(part => part.id === 'bass').solo, !previous);
    await page.locator('#redoButton').click(); assert.equal((await getState(page)).parts.find(part => part.id === 'bass').solo, previous);
    return { search: preset.name, presetId: preset.id, audition: true, mute: true, solo: true, undoRedo: true };
  });
  await check('A percussion preset on Melody auditions an actual mapped sample outside the usual melody register', async () => {
    await fresh(page); await page.locator('#soundPartTabs [data-sound-part="melody"]').click();
    const kit = await page.evaluate(() => PicnicLibrary.presets.find(preset => preset.id === 'picnic-percussion-kit'));
    assert(kit.regions.every(region => region.key[1] < 60), 'Fixture requires a sound whose mapped keys exclude default C4');
    await page.locator('#presetSearch').fill(kit.name); await page.locator('#presetList .preset-card[data-preset="' + kit.id + '"]').click();
    await page.evaluate(async () => {
      await PicnicApp.prepare(); const engine = PicnicApp.engine, context = engine.context, tap = context.createScriptProcessor(1024, 2, 2), sink = context.createGain(); sink.gain.value = 0;
      engine.output.connect(tap); tap.connect(sink); sink.connect(context.destination);
      const samples = { frames: 0, peak: 0, energy: 0, nonfinite: 0 };
      tap.onaudioprocess = event => { samples.frames += event.inputBuffer.length; for (let channel = 0; channel < 2; channel++) for (const value of event.inputBuffer.getChannelData(channel)) { samples.peak = Math.max(samples.peak, Math.abs(value)); samples.energy += value * value; if (!Number.isFinite(value)) samples.nonfinite++; } };
      window.qaPicnicPreview = { samples, tap, sink, output: engine.output };
    });
    await page.locator('#auditionPartButton').click(); await page.waitForTimeout(650);
    const evidence = await page.evaluate(() => { const { samples, tap, sink, output } = window.qaPicnicPreview; output.disconnect(tap); tap.disconnect(); sink.disconnect(); return { ...samples, rms: Math.sqrt(samples.energy / Math.max(1, samples.frames * 2)) }; });
    audible(evidence, 'Percussion on Melody preview'); await page.locator('#panicButton').click(); return { preset: kit.id, ...evidence };
  });
  await check('Alias names and source banks find deduplicated presets including alias-only collections', async () => {
    const fixture = await page.evaluate(() => {
      const primary = new Set(PicnicLibrary.presets.map(preset => preset.originalBank));
      for (const preset of PicnicLibrary.presets) for (const alias of preset.aliases || []) if (!primary.has(alias.originalBank)) return { id: preset.id, alias, banks: PicnicLibrary.banks.map(bank => bank.originalBank) };
      throw Error('Expected an alias-only source bank in the factory fixtures.');
    });
    await page.locator('#presetBank').selectOption('all'); await page.locator('#presetCategory').selectOption('all');
    for (const search of [fixture.alias.name, fixture.alias.originalBank]) {
      await page.locator('#presetSearch').fill(search); assert(await page.locator('#presetList .preset-card[data-preset="' + fixture.id + '"]').isVisible(), 'Search matches ' + search);
    }
    await page.locator('#presetSearch').fill(''); const options = await page.locator('#presetBank option').evaluateAll(elements => elements.map(option => option.value));
    assert(fixture.banks.every(bank => options.includes(bank)), 'Every original source bank remains discoverable after sample/preset deduplication');
    await page.locator('#presetBank').selectOption(fixture.alias.originalBank); const card = page.locator('#presetList .preset-card[data-preset="' + fixture.id + '"]');
    assert(await card.isVisible()); assert((await card.innerText()).includes(fixture.alias.name), 'The chosen collection identifies its original alias name');
    await card.click(); assert.equal((await getState(page)).parts.find(part => part.id === 'melody').presetId, fixture.id);
    await page.locator('#presetBank').selectOption('all'); await page.locator('#presetSearch').fill('');
    return { canonicalPreset: fixture.id, alias: fixture.alias.name, originalBank: fixture.alias.originalBank, originalCollections: fixture.banks.length };
  });
  await check('Playable piano stays within MIDI range and keyboard release cancels its own voice', async () => {
    await fresh(page); await page.locator('#soundPartTabs [data-sound-part="melody"]').click();
    for (let i = 0; i < 12; i++) await page.locator('#octaveUp').click();
    const pitches = await page.locator('#pianoKeys [data-note]').evaluateAll(keys => keys.map(key => Number(key.dataset.note)));
    assert(pitches.every(pitch => pitch >= 0 && pitch <= 127), 'Every visible piano key is a valid MIDI note at the upper octave limit');
    const key = page.locator('#pianoKeys [data-note]').first(); await key.focus(); await page.keyboard.down('Enter');
    await page.waitForFunction(() => PicnicApp.engine.activeVoices > 0); await page.keyboard.up('Enter');
    await page.waitForFunction(() => PicnicApp.engine.activeVoices === 0); return { minimum: Math.min(...pitches), maximum: Math.max(...pitches), heldKeyRelease: true };
  });
  await check('Save and Open restore a portable project including hidden step thirty-two', async () => {
    await page.evaluate(async () => { const state = PicnicApp.getState(); state.selectedBank = 2; state.banks[2].length = 32; Object.assign(state.banks[2].tracks.bass[31], { on: true, notes: [43], gate: 2.25 }); await PicnicApp.loadState(state); });
    const expected = await getState(page), pending = page.waitForEvent('download'); await page.locator('#saveButton').click(); const download = await pending;
    const saved = path.join(artifacts, 'picnic-portable.json'); await download.saveAs(saved); assert.equal(await download.failure(), null);
    const packet = JSON.parse(fs.readFileSync(saved, 'utf8')); assert.equal(packet.format, 'picnic-project'); assert.deepEqual(packet.state, expected);
    assert(fs.statSync(saved).size < 1024 * 1024, 'Factory sounds remain portable preset IDs, not sample payloads');
    await fresh(page); await page.locator('#projectFile').setInputFiles(saved); await page.waitForFunction(() => PicnicApp.getState().selectedBank === 2);
    assert.deepEqual(await getState(page), expected); return { bytes: fs.statSync(saved).size, finalBassPitch: 43, patternLength: 32 };
  });
  await check('Exact shared patterns survive sound edits while native sequence edits release the overlay', async () => {
    await fresh(page); const packet = { format: 'musiclab-pattern', version: 1, name: 'Off-grid neighbors', sourceApp: 'QA', kind: 'notes', tempo: 113, swing: .12, lengthBeats: 4, meter: [4, 4], seed: 39,
      voices: [{ id: 'keys', name: 'Keys' }, { id: 'low', name: 'Low' }], notes: [
        { id: 'a', voice: 'keys', pitch: 65, beat: .033, duration: .337, velocity: .61, probability: 1 },
        { id: 'b', voice: 'low', pitch: 43, beat: .771, duration: 1.333, velocity: .9, probability: .7 },
        { id: 'c', voice: 'keys', pitch: 72, beat: 2.615, duration: .519, velocity: .72, probability: 1 }], tags: ['qa'] };
    await page.evaluate(pattern => MusicLabPatternInstrument.importPattern({ pattern, options: { replace: true, voiceMap: { keys: 'melody', low: 'bass' } } }), packet);
    const before = (await getState(page)).musicLabPattern; assert(before);
    await page.locator('#scoreGrid .part-select[data-part="melody"]').click(); await field(page, '#soundCutoff', '3500');
    assert.deepEqual((await getState(page)).musicLabPattern, before);
    const exported = await page.evaluate(() => MusicLabPatternInstrument.exportPattern());
    assert.deepEqual(exported.notes.map(n => [n.beat, n.duration, n.pitch, n.velocity, n.probability]), packet.notes.map(n => [n.beat, n.duration, n.pitch, n.velocity, n.probability]));
    await page.locator('#scoreGrid .score-step[data-part="melody"][data-step="0"]').click(); await field(page, '#stepNotes', '60');
    assert(!(await getState(page)).musicLabPattern); return { exactNotes: 3, soundEditsPreserve: true, nativeEditsClear: true };
  });
  await check('Live voice pool is bounded and source-specific future cancellation preserves another source', async () => {
    await fresh(page); await page.locator('#playButton').click(); await page.locator('#stopButton').click();
    const evidence = await page.evaluate(async () => {
      const engine = PicnicApp.engine; await engine.init(); await engine.context.resume(); engine.panic();
      const when = engine.context.currentTime + .05;
      for (let i = 0; i < 80; i++) engine.scheduleNote({ id: 'ceiling-' + i, voice: 'melody', pitch: 60 + i % 12, velocity: .65, when, durationSeconds: .4, source: 'qa-ceiling' });
      await new Promise(resolve => setTimeout(resolve, 90));
      const ceiling = { active: engine.activeVoices, maximum: engine.maxVoices, stats: { ...engine.schedulingStatistics } };
      engine.panic(); const overlapStart = engine.context.currentTime;
      const note = (id, at, duration) => engine.scheduleNote({ id, voice: 'melody', pitch: 60, velocity: .55, when: overlapStart + at, durationSeconds: duration, source: 'qa-interval-cap' });
      note('early', .1, .8); note('future', 2, .2); for (let i = 0; i < 31; i++) note('long-' + i, .5, 10); note('manual-insert', .5, 1);
      await new Promise(resolve => setTimeout(resolve, 650)); const outOfOrder = engine.getDiagnostics();
      engine.panic(); const start = engine.context.currentTime;
      engine.scheduleNote({ id: 'source-a', voice: 'melody', pitch: 60, velocity: .7, when: start + .05, durationSeconds: 1.5, source: 'qa-a' });
      engine.scheduleNote({ id: 'source-b', voice: 'bass', pitch: 43, velocity: .7, when: start + .05, durationSeconds: 1.5, source: 'qa-b' });
      const before = engine.getDiagnostics(), cancelAt = start + .2; engine.cancelNotes({ source: 'qa-a', when: cancelAt }); const requested = engine.getDiagnostics();
      const staleSourceRejected = engine.scheduleNote({ id: 'late-source-a', voice: 'melody', pitch: 67, velocity: .7, when: start + .3, durationSeconds: .7, source: 'qa-a' }) === false;
      await new Promise(resolve => setTimeout(resolve, 400)); const after = engine.getDiagnostics(); const activeAfter = engine.activeVoices;
      await PicnicApp.loadState(PicnicSchema.createDefault()); const afterProjectLoad = engine.getDiagnostics();
      return { ceiling, outOfOrder, before, requested, cancelAt, staleSourceRejected, after, activeAfter, afterProjectLoad };
    });
    assert(evidence.ceiling.active > 0 && evidence.ceiling.active <= evidence.ceiling.maximum); assert.equal(evidence.ceiling.maximum, 32);
    assert(evidence.ceiling.stats.stolen > 0, 'Dense overlapping notes exercise actual voice stealing');
    assert(evidence.outOfOrder.activeVoices > 0 && evidence.outOfOrder.activeVoices <= 32, 'Manual notes inserted behind the lookahead remain within the voice cap');
    assert(evidence.staleSourceRejected, 'A cancelled source cannot queue new notes beyond its future cancellation barrier');
    assert(evidence.activeAfter > 0, 'Cancelling source A preserves the separately scheduled B note');
    assert(Math.abs(evidence.requested.sources['qa-a'].stopAt - evidence.cancelAt) < .000001, 'Source cancellation retains the exact shared timestamp');
    assert.equal(evidence.requested.sources['qa-b'].stopAt, evidence.before.sources['qa-b'].stopAt);
    assert.equal(evidence.afterProjectLoad.activeVoices, 0, 'Loading another project clears stale external notes as well as the native sequencer');
    assert.deepEqual(evidence.afterProjectLoad.sources, {});
    assert.equal(evidence.after.sources['qa-a']?.active || 0, 0); assert((evidence.after.sources['qa-b']?.active || 0) > 0); return evidence;
  });
  await check('Thirty-two simultaneous full-level sample voices render bounded repeatable audio', async () => {
    const evidence = await page.evaluate(async () => {
      const state = PicnicSchema.createDefault(); Object.assign(state.master, { level: 1, reverb: 0, delay: 0, tone: 18000 });
      state.parts.forEach(part => Object.assign(part, { level: 1, cutoff: 18000, reverb: 0, delay: 0 }));
      const events = Array.from({ length: 32 }, (_, id) => ({ id: 'limit-' + id, voice: 'melody', pitch: 60, startBeat: 0, durationBeats: 2, velocity: 1, probability: 1 }));
      const options = { state, events, tempo: 120, lengthBeats: 3, tailSeconds: .2 };
      const first = await PicnicApp.engine.renderNotes(options), second = await PicnicApp.engine.renderNotes(options);
      let peak = 0, square = 0, nonfinite = 0, maximumDifference = 0;
      for (let i = 0; i < first.pcm.length; i++) { const value = first.pcm[i]; peak = Math.max(peak, Math.abs(value)); square += value * value; if (!Number.isFinite(value)) nonfinite++; maximumDifference = Math.max(maximumDifference, Math.abs(value - second.pcm[i])); }
      return { voices: 32, frames: first.pcm.length / 2, peak, rms: Math.sqrt(square / first.pcm.length), nonfinite, maximumDifference };
    });
    audible(evidence, 'Full-level sampler stress'); assert(evidence.peak > .8, 'The actual output guard is exercised'); assert(evidence.maximumDifference <= .000001, 'Repeated native renders agree within Float32 rounding'); return evidence;
  });
  for (const width of [1440, 390]) await check('All controls and sixteen visible steps fit at ' + width + 'px', async () => {
    await page.setViewportSize({ width, height: 1000 }); await fresh(page); await page.locator('#patternLength').selectOption('32'); await page.locator('#patternPages [data-page="1"]').click();
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    assert(dimensions.document <= width + 1 && dimensions.body <= width + 1, JSON.stringify(dimensions));
    assert.equal(await page.locator('#scoreGrid .score-step').count(), 6 * 16);
    for (const selector of ['#playButton', '#patternLength', '#stepNotes', '#presetSearch', '#chordProgression', '#soundCutoff']) {
      const control = page.locator(selector); await control.scrollIntoViewIfNeeded(); const bounds = await control.boundingBox();
      assert(bounds && bounds.x >= -1 && bounds.x + bounds.width <= width + 1, selector + ' reachable');
    }
    await page.screenshot({ path: path.join(artifacts, 'picnic-' + width + '.png'), fullPage: true }); return dimensions;
  });
  await check('Six-part native playback CPU uses measured Chromium task and audio render metrics', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 }); await fresh(page); await page.locator('#panicButton').click();
    const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
    let audioContextId; cdp.on('WebAudio.contextCreated', event => { if (event.context.contextType === 'realtime') audioContextId = event.context.contextId; });
    let audioMetricsAvailable = true; try { await cdp.send('WebAudio.enable'); } catch (_) { audioMetricsAvailable = false; }
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
    const baseStart = await metrics(); await page.waitForTimeout(1500); const baseEnd = await metrics();
    await page.locator('#playButton').click(); await page.waitForFunction(() => PicnicApp.isPlaying() && PicnicApp.engine.activeVoices > 0); await page.waitForTimeout(500);
    const activeStart = await metrics(), render = [], voices = [];
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(800); voices.push(await page.evaluate(() => PicnicApp.engine.activeVoices));
      if (audioMetricsAvailable && audioContextId) { try { render.push((await cdp.send('WebAudio.getRealtimeData', { contextId: audioContextId })).realtimeData); } catch (_) { audioMetricsAvailable = false; } }
    }
    const activeEnd = await metrics(); await page.locator('#panicButton').click();
    const duration = activeEnd.Timestamp - activeStart.Timestamp, baselineDuration = baseEnd.Timestamp - baseStart.Timestamp;
    const evidence = { seconds: duration, parts: 6, voiceCeiling: 32, sampledVoices: voices,
      taskCpuPercent: 100 * (activeEnd.TaskDuration - activeStart.TaskDuration) / duration,
      baselineTaskCpuPercent: 100 * (baseEnd.TaskDuration - baseStart.TaskDuration) / baselineDuration,
      scriptCpuPercent: 100 * (activeEnd.ScriptDuration - activeStart.ScriptDuration) / duration,
      audioRender: render, audioMetricAvailable: audioMetricsAvailable && render.length > 0,
      meanAudioRenderCapacity: render.length ? render.reduce((sum, value) => sum + value.renderCapacity, 0) / render.length : null,
      peakAudioRenderCapacity: render.length ? Math.max(...render.map(value => value.renderCapacity)) : null,
      caveat: 'Single headless Chromium instrument; task CPU excludes the audio rendering thread. Audio renderCapacity is sampled when Chromium exposes it. SERVICE keeps its existing rendered playback.' };
    fs.writeFileSync(path.join(artifacts, 'cpu-report.json'), JSON.stringify(evidence, null, 2)); await cdp.detach();
    assert(voices.some(count => count > 0)); assert(voices.every(count => count <= 32)); return evidence;
  });
  await check('Standalone factory samples and interface work without network assets', async () => {
    const offline = await context.newPage(); offline.on('pageerror', error => errors.push(error.stack || error.message));
    await offline.goto(origin + '/offline-shell');
    const html = process.env.PICNIC_QA_URL || process.argv[2] ? await (await context.request.get(url)).text() : fs.readFileSync(process.env.PICNIC_QA_FILE || path.join(appRoot, 'index.html'), 'utf8');
    const requests = []; await offline.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
    await offline.setContent(html, { waitUntil: 'load' }); await offline.waitForFunction(() => !!window.PicnicApp);
    const evidence = await offline.evaluate(async () => {
      const rendered = await PicnicApp.exportAudio({ scope: 'pattern', bars: 1, tailSeconds: 0, includePCM: true });
      return { samples: Object.keys(PicnicLibrary.samples).length, presets: PicnicLibrary.presets.length, audible: rendered.pcm.some(value => Math.abs(value) > .001) };
    });
    assert(evidence.samples > 0 && evidence.presets > 0 && evidence.audible); assert.deepEqual(requests, []); await offline.close(); return evidence;
  });
  assert.deepEqual(errors, [], 'No browser exceptions'); assert.deepEqual(external, [], 'No third-party assets');
  fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify({ results, errors, external }, null, 2));
  console.log(JSON.stringify({ passed: results.length, errors, external, artifacts }, null, 2));
  await context.close();
})().catch(error => { console.error(error.stack || error); if (errors.length) console.error(JSON.stringify({ browserErrors: errors }, null, 2)); process.exitCode = 1; }).finally(async () => {
  await browser?.close(); if (server) await new Promise(resolve => server.close(resolve));
});
