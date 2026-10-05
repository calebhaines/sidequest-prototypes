'use strict';

// Real GALLEY -> embedded BATTER integration, including its native Web Audio
// graph. This also runs from LOOM-source.zip: no original batter/ tree is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const passed = [], observations = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const htmlPath = path.resolve(process.env.LOOM_BATTER_QA_PREVIEW || path.join(__dirname, 'index.html'));
const voices = ['kick', 'snare', 'rim', 'closedHat', 'openHat', 'ride', 'crash', 'tomLow', 'tomMid', 'tomHigh', 'clap', 'percussion'];
const legacy = ['grain', 'form', 'tine', 'mire', 'spool', 'haze', 'bower', 'ravel', 'fable', 'roux'];

async function serve() {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/loom/index.html') {
      response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      response.end(fs.readFileSync(htmlPath)); return;
    }
    if (pathname === '/index.html') {
      // Optional discovery of future instruments can read the Kitchen hub;
      // an empty hub proves the eleven embedded apps do not rely on it.
      response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><title>Empty Kitchen discovery fixture</title>'); return;
    }
    // The complete host and starter kit are embedded; integration must not
    // accidentally depend on a working sibling app or sample server.
    response.writeHead(404); response.end('This integration fixture serves only the complete standalone GALLEY.');
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: 'http://127.0.0.1:' + server.address().port, close: () => new Promise(resolve => server.close(resolve)) };
}

async function openInstrument(page, track = 0, id = 'batter') {
  await page.evaluate(index => window.LoomApp.selectTrack(index), track);
  const instrument = await page.evaluate(index => window.LoomApp.getState().tracks[index].instrument, track);
  await page.locator('[data-instrument="' + track + '"]').click();
  if (!instrument) {
    const index = await page.evaluate(id => window.LoomInstrumentManifest.findIndex(item => item.id === id), id);
    await page.locator('[data-app="' + index + '"]').click();
  }
  const selector = 'iframe[data-host-track="track-' + (track + 1) + '"]';
  await page.waitForFunction(({ selector, id }) => {
    const child = document.querySelector(selector)?.contentWindow;
    return child?.__LoomBridge && child?.MusicLabPatternInstrument && (id !== 'batter' || child.BatterApp);
  }, { selector, id }, { timeout: 25000 });
  await page.evaluate(async track => { await window.LoomApp.host.records.get('track-' + (track + 1)).ready; }, track);
  return page.frameLocator(selector);
}

async function closeInstrument(page) {
  if (await page.locator('#instrumentDialog').isVisible()) await page.locator('#closeInstrument').click();
}

async function install(page, url) {
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (![url + '/loom/index.html', url + '/index.html'].includes(request.url()) && /^https?:/.test(request.url())) requests.push(request.url()); });
  await page.goto(url + '/loom/index.html'); await page.waitForFunction(() => !!window.LoomApp);
  await page.evaluate(async () => {
    const state = window.LoomSchema.defaultState(); state.name = 'Acoustic integration service'; state.tempo = 180; state.lengthBars = 4; state.loopStart = 0; state.loopEnd = 4; state.master.level = .8;
    await window.LoomApp.loadState(state);
    await window.LoomApp.engine.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'live' });
    await window.LoomApp.engine.init(); await window.LoomApp.engine.context.resume();
    const analyser = window.LoomApp.engine.context.createAnalyser(); analyser.fftSize = 2048; window.LoomApp.engine.node.connect(analyser); window.qaBatterAnalyser = analyser;
    window.qaBatterRMS = () => { const a = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(a); return Math.sqrt(a.reduce((sum, x) => sum + x * x, 0) / a.length); };
    window.qaChild = index => document.querySelector('iframe[data-host-track="track-' + (index + 1) + '"]')?.contentWindow;
    window.qaBatterState = index => { const state = window.qaChild(index).BatterUI.engine.getState(); return state.state || state; };
    window.qaWav = async blob => { const v = new DataView(await blob.arrayBuffer()); let peak = 0, power = 0, sum = 0, hash = 2166136261; for (let at = 44; at < v.byteLength; at += 2) { const n = v.getInt16(at, true), x = n / 32768; peak = Math.max(peak, Math.abs(x)); power += x * x; sum += x; hash = Math.imul(hash ^ n, 16777619) >>> 0; } const samples = (v.byteLength - 44) / 2; return { rate: v.getUint32(24, true), channels: v.getUint16(22, true), frames: samples / v.getUint16(22, true), rms: Math.sqrt(power / samples), peak, mean: sum / samples, hash }; };
    const sentinel = { format: 'batter-autosave', version: 1, savedAt: 123, state: { name: 'Standalone recovery must remain private', lanes: [] } };
    const database = await new Promise((resolve, reject) => { const request = indexedDB.open('kitchen.batter.autosave.v1', 1); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('recipes')) request.result.createObjectStore('recipes'); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise((resolve, reject) => { const transaction = database.transaction('recipes', 'readwrite'); transaction.objectStore('recipes').put(sentinel, 'current'); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
    window.qaBatterRecoverySentinel = JSON.stringify(sentinel); localStorage.setItem('kitchen.batter.project.v1', window.qaBatterRecoverySentinel);
    window.qaBatterRecovery = async () => ({ local: localStorage.getItem('kitchen.batter.project.v1'), durable: await new Promise((resolve, reject) => { const request = database.transaction('recipes', 'readonly').objectStore('recipes').get('current'); request.onsuccess = () => resolve(JSON.stringify(request.result)); request.onerror = () => reject(request.error); }) });
  });
  return { errors, requests };
}

async function nativeAndClock(page) {
  const frame = await openInstrument(page);
  const inventory = await page.evaluate(() => ({ name: window.qaBatterState(0).name, manifest: window.LoomInstrumentManifest.map(item => item.id), embedded: Object.keys(window.LoomEmbeddedInstruments), schema: window.LoomSchema.BUILT_INS, caps: window.LoomApp.host.capabilities('track-1'), lanes: window.qaBatterState(0).lanes.map(lane => lane.id), hosted: window.qaChild(0).document.querySelector('#audioStatus').textContent, tracks: window.LoomApp.getState().tracks.map(track => track.effects.length) }));
  assert.deepEqual(inventory.manifest, [...legacy, 'batter']); assert.deepEqual(inventory.embedded, [...legacy, 'batter']); assert.deepEqual(inventory.schema, [...legacy, 'batter']);
  assert.deepEqual(inventory.lanes, voices); assert.deepEqual(inventory.caps.notes.voices.map(voice => voice.id), voices); assert(inventory.caps.renderPattern && inventory.caps.patternImport && inventory.caps.patternExport && inventory.caps.importAudio && inventory.caps.exportAudio);
  assert.notEqual(inventory.name, 'Standalone recovery must remain private', 'A hosted instance must not read standalone IndexedDB or local recovery.');
  assert.equal(inventory.tracks.length, 8); assert(inventory.tracks.every(slots => slots === 4));
  await frame.locator('#auditionButton').click();
  let audible = 0; for (let i = 0; i < 12; i++) { audible = Math.max(audible, await page.evaluate(() => window.qaBatterRMS())); await wait(12); }
  assert(audible > .001, 'A real embedded drum audition reaches GALLEY’s actual output.');
  passed.push('Real UI opens BATTER / all eleven native apps retained / twelve canonical voices / audible native audition / eight tracks × four inserts');

  await page.evaluate(() => {
    const child = window.qaChild(0), engine = child.BatterUI.engine, state = engine.getState(), hit = state.patterns[0].lanes[3].steps[6];
    hit.on = true; hit.reverse = true; hit.pitch = .375; hit.locks = { lowpass: 910, drive: .23 }; engine.setState(state); child.BatterUI.refresh();
    window.qaNativeHitTrace = []; const original = engine.scheduleHit;
    engine.scheduleHit = function (event, ...args) { window.qaNativeHitTrace.push({ voice: event.laneId, source: event.source, reverse: event.reverse, pitch: event.pitch, locks: event.locks, duration: event.duration }); return original.call(this, event, ...args); };
  });

  const packet = await page.evaluate(async () => { window.qaNativeBatterPattern = await window.LoomApp.host.exportPattern('track-1'); return window.qaNativeBatterPattern; });
  assert.equal(packet.sourceApp, 'batter'); assert.equal(packet.kind, 'drums'); assert(packet.notes.length > 15); assert.equal(packet.voices.length, 12);
  await page.evaluate(() => {
    window.qaBatterTrace = []; const host = window.LoomApp.host, original = host.scheduleNote;
    host.scheduleNote = function (trackId, event) { if (trackId === 'track-1') window.qaBatterTrace.push({ ...event, observedAt: window.LoomApp.engine.context.currentTime, tempo: window.LoomApp.engine.getTransport().tempo }); return original.call(this, trackId, event); };
  });
  await closeInstrument(page); await page.locator('#instrumentLive').check();
  await page.evaluate(() => window.LoomApp.engine.seek(1.125)); await page.locator('#playButton').click();
  await page.waitForFunction(() => window.LoomApp.engine.getTransport().playing && window.qaBatterTrace.length > 3);
  await wait(350);
  const start = await page.evaluate(() => ({ trace: window.qaBatterTrace.slice(), hits: window.qaNativeHitTrace.slice(), clock: window.LoomApp.engine.getTransport(), native: window.qaChild(0).BatterUI.engine.playing, driven: window.LoomApp.host.records.get('track-1').externalClock }));
  assert.equal(start.native, false, 'Shared-clock playback disables the app’s independent scheduler.'); assert.equal(start.driven, true); assert(start.trace.every(event => event.when >= event.observedAt - .035 && event.when <= event.observedAt + .2)); assert(start.trace.some(event => String(event.source).startsWith('loom-live')));
  const locked = start.hits.find(event => event.locks?.lowpass === 910); assert(locked, 'Native parameter locks survive the GALLEY shared-clock note adapter.'); assert.equal(locked.reverse, true); assert.equal(locked.pitch, .375); assert.equal(locked.duration, undefined, 'An ungated native drum retains its acoustic ringout.');
  const initialCount = start.trace.length;
  await page.locator('#tempo').fill('144'); await page.locator('#tempo').dispatchEvent('change');
  await page.evaluate(() => window.LoomApp.engine.seek(3.75)); await wait(550);
  const changed = await page.evaluate(() => ({ trace: window.qaBatterTrace.slice(), clock: window.LoomApp.engine.getTransport(), appTempo: window.qaBatterState(0).tempo }));
  assert.equal(changed.clock.tempo, 144); assert.equal(changed.appTempo, 144); assert(changed.trace.length > initialCount); assert(changed.clock.cycle >= 1, 'Actual playback wraps the one-bar GALLEY loop.'); assert(changed.trace.slice(initialCount).some(event => event.tempo === 144));
  await page.locator('#pauseButton').click(); await page.waitForFunction(() => !window.LoomApp.engine.getTransport().playing); await wait(150);
  const paused = await page.evaluate(() => ({ count: window.qaBatterTrace.length, sources: window.qaChild(0).BatterUI.engine.sources.size })); await wait(170); assert.equal(await page.evaluate(() => window.qaBatterTrace.length), paused.count);
  observations.push({ audibleRms: audible, sharedClockNotes: changed.trace.length, loopCycle: changed.clock.cycle });
  passed.push('Native rhythm exported / shared-clock timestamped notes start from a seek / no autonomous double scheduler / tempo change / loop wrap / pause cancellation');
}

async function notesAndRender(page) {
  const prepared = await page.evaluate(async () => {
    const original = window.qaNativeBatterPattern, packet = window.MusicLabPatternSchema.normalize({ ...original, name: 'Off-grid acoustic test', tempo: 144, lengthBeats: 4, swing: 0, notes: [
      { id: 'odd-kick', voice: 'kick', pitch: 36, beat: .09375, duration: .07, velocity: .88 },
      { id: 'odd-snare', voice: 'snare', pitch: 38, beat: .413, duration: .1, velocity: .42 },
      { id: 'odd-rim', voice: 'rim', pitch: 37, beat: 1.0375, duration: .06, velocity: .73 },
      { id: 'odd-hat', voice: 'closedHat', pitch: 42, beat: 1.15625, duration: .05, velocity: .56 },
      { id: 'late-crash', voice: 'crash', pitch: 49, beat: 3.82, duration: .08, velocity: .6 }
    ] });
    await window.LoomApp.host.importPattern('track-1', packet, { replace: true, voiceMap: Object.fromEntries(packet.voices.map(voice => [voice.id, voice.id])) });
    const exported = await window.LoomApp.host.exportPattern('track-1'); window.qaOffGridBatterPattern = packet;
    await window.LoomApp.importPattern({ pattern: packet, options: { target: 'track-1', voiceMap: Object.fromEntries(packet.voices.map(voice => [voice.id, voice.id])) } });
    return { requested: packet.notes, exported: exported.notes, clip: window.LoomApp.getState().tracks[0].clips.at(-1) };
  });
  assert.deepEqual(prepared.exported.map(note => [note.voice, note.beat, note.duration, note.velocity, note.pitch]), prepared.requested.map(note => [note.voice, note.beat, note.duration, note.velocity, note.pitch]), 'Imported off-grid event timing survives native pattern exchange.');
  assert.equal(prepared.clip.type, 'notes'); assert.deepEqual(prepared.clip.voiceMap, Object.fromEntries(voices.map(voice => [voice, voice])));
  await page.evaluate(() => window.LoomApp.engine.seek(0)); await page.locator('#playButton').click(); await wait(700); assert((await page.evaluate(() => window.qaBatterTrace.length)) > 0); await page.locator('#pauseButton').click();
  await page.evaluate(() => window.LoomApp.selectClip(window.LoomApp.getState().tracks[0].clips.at(-1).id));
  await page.locator('#printNoteClipButton').click();
  await page.waitForFunction(() => window.LoomApp.getState().tracks[0].clips.at(-1)?.origin, null, { timeout: 40000 });
  const print = await page.evaluate(() => { const clip = window.LoomApp.getState().tracks[0].clips.at(-1), audio = window.LoomApp.assets[clip.assetId]; let peak = 0, power = 0; for (const x of audio.left) { peak = Math.max(peak, Math.abs(x)); power += x * x; } window.qaPrintedBatterId = clip.id; return { clip, frames: audio.left.length, rate: audio.sampleRate, peak, rms: Math.sqrt(power / audio.left.length) }; });
  assert.equal(print.clip.origin.instrument.id, 'batter'); assert.equal(print.clip.origin.instrument.snapshot.app, 'batter'); assert.equal(print.clip.origin.pattern.notes.length, 5); assert(print.peak > .01 && print.rms > .0003); assert(print.frames >= 4 * 60 / 144 * print.rate);
  passed.push('Exact off-grid packet imports into twelve drum voices / editable GALLEY notes / native offline print / saved revisable BATTER patch and timing');

  await page.locator('#editSourceButton').click(); await page.waitForFunction(() => !!window.qaChild(0)?.BatterApp);
  await page.evaluate(() => { const child = window.qaChild(0), state = child.BatterUI.engine.getState(); state.lanes[0].tune = 5; child.BatterUI.engine.setState(state); child.BatterUI.refresh(); });
  await closeInstrument(page); await page.locator('#updateAudioButton').click();
  await page.waitForFunction(assetId => window.LoomApp.getState().tracks[0].clips.at(-1)?.assetId !== assetId && !window.LoomApp.noteWorkflow.controller, print.clip.assetId, { timeout: 40000 });
  const updated = await page.evaluate(() => window.LoomApp.getState().tracks[0].clips.at(-1));
  for (const key of ['id', 'name', 'start', 'length', 'sourceOffset', 'rate', 'gain', 'fadeIn', 'fadeOut']) assert.equal(updated[key], print.clip[key]);
  assert.equal(updated.origin.instrument.snapshot.state.lanes[0].tune, 5); assert.equal(updated.origin.pattern.notes.length, 5); assert.notEqual(updated.assetId, print.clip.assetId);
  passed.push('Edit source changes the saved acoustic kit / Update audio reprints it while retaining arrangement and precise source notes');

  // Existing effects must remain one insert apiece even on a twelve-lane kit.
  const fx = await page.evaluate(async () => {
    const state = window.LoomApp.getState(), t = state.tracks[0]; t.instrumentLive = false;
    const glaze = window.LoomEffectsCatalog.find(f => f.id === 'glaze'), broiler = window.LoomEffectsCatalog.find(f => f.id === 'broiler');
    t.effects[0] = window.LoomSchema.effect({ type: 'glaze', params: { ...glaze.defaults, saturation: 'warm', mix: .25 } });
    t.effects[1] = window.LoomSchema.effect({ type: 'broiler', params: { ...broiler.defaults, model: 'svt-69', cabinet: 'sealed810', mix: .3 } });
    await window.LoomApp.loadState(state); const actual = window.LoomApp.getState(); const roundtrip = window.LoomSchema.parseProject(window.LoomSchema.serializeProject(actual));
    const blob = await window.LoomApp.engine.renderWav(actual, window.LoomApp.assets, { snapshotReady: true, startBeat: 0, endBeat: 4, tailSeconds: .2 });
    return { source: actual.tracks[0].effects, parsed: roundtrip.tracks[0].effects, wav: await window.qaWav(blob), catalog: window.LoomEffectsCatalog.map(f => f.id) };
  });
  assert.deepEqual(fx.source, fx.parsed); assert.equal(fx.source[0].type, 'glaze'); assert.equal(fx.source[1].type, 'broiler'); assert.equal(fx.source[1].params.model, 'svt-69'); assert.equal(fx.source[1].params.cabinet, 'sealed810'); assert.equal(fx.source.length, 4); assert.equal(fx.catalog.length, 10); assert.equal(fx.wav.channels, 2); assert.equal(fx.wav.rate, 48000); assert(fx.wav.rms > .0001 && fx.wav.peak > .005 && fx.wav.peak <= 1); observations.push({ drumTrackWav: fx.wav });
  passed.push('GLAZE and BROILER remain ordinary drum-track inserts / ten effects / portable parameters / finite audible stereo PCM WAV');

  await openInstrument(page); await closeInstrument(page); await page.evaluate(() => { const e = window.LoomApp.engine; e.seek(0); window.LoomApp.notePlayback.setRecordingTracks(['track-1']); const original = e.stopRecording.bind(e); e.stopRecording = function () { const promise = original(); window.qaBatterTakePromise = promise; return promise; }; });
  await page.evaluate(async () => { await window.LoomApp.notePlayback.prepare(); await window.LoomApp.engine.startRecording(['track-1'], { startTransport: true, maxSeconds: .8 }); window.LoomApp.notePlayback.start(); });
  await page.waitForFunction(() => !window.LoomApp.engine.isRecording, null, { timeout: 6000 });
  const take = await page.evaluate(async () => { const takes = await (window.qaBatterTakePromise || window.LoomApp.engine.stopRecording()), take = takes[0]; window.LoomApp.notePlayback.stop(); window.LoomApp.notePlayback.setRecordingTracks([]); window.LoomApp.engine.stop(); return { frames: take?.frames, rate: take?.sampleRate, rms: take ? Math.sqrt(take.left.reduce((a, x) => a + x * x, 0) / take.left.length) : 0, finite: take ? [...take.left, ...take.right].every(Number.isFinite) : false }; });
  assert(take.frames >= .75 * take.rate && take.frames <= .81 * take.rate, JSON.stringify(take)); assert(take.rms > .0003 && take.finite); observations.push({ nativeDryTake: take });
  passed.push('The actual played acoustic kit records through GALLEY’s real dry instrument-input recorder');
}

async function transferAndPortable(page) {
  const fixture = await page.evaluate(async () => {
    const state = window.LoomSchema.defaultState(); state.tempo = 120; state.lengthBars = 2; state.loopEnd = 4; state.master.level = .8;
    const left = new Float32Array(4410), right = new Float32Array(4410); for (let i = 0; i < left.length; i++) { left[i] = .22 * Math.sin(2 * Math.PI * 277 * i / 22050) * (1 - i / left.length); right[i] = .13 * Math.sin(2 * Math.PI * 431 * i / 22050) * (1 - i / right.length); }
    const asset = window.LoomSchema.encodeAsset({ left, right, sampleRate: 22050, name: 'Original stereo ingredient', id: 'transfer-source' }); state.assets = [asset];
    state.tracks[0].clips = [{ id: 'transfer-clip', name: 'Stereo source kept intact', assetId: asset.id, start: 0, length: .4, sourceStart: 0, sourceEnd: .2, sourceOffset: 0, rate: 1, gain: 1, reverse: false, loop: false, fadeIn: 0, fadeOut: 0 }];
    await window.LoomApp.loadState(state); window.LoomApp.selectClip('transfer-clip'); window.qaTransferOriginalPcm = asset.pcm;
    const rendered = await window.LoomClipTransfer.render(window.LoomApp.getState().tracks[0].clips[0], window.LoomApp.assets[asset.id], state.tempo, { startSeconds: 0, endSeconds: .2 });
    return { pcm: asset.pcm, frames: rendered.pcm.length / 2, rate: rendered.sampleRate, originalFrames: asset.frames };
  });
  await openInstrument(page, 1); await closeInstrument(page); await page.evaluate(() => window.LoomApp.selectClip('transfer-clip'));
  await page.locator('#transferClipButton').click(); await page.locator('#transferApp').selectOption('batter'); await page.locator('#transferTrack').selectOption('1');
  await page.waitForFunction(() => document.querySelector('#transferTrack').dataset.checking === 'false');
  await page.locator('#transferDeck').selectOption('snare'); assert(await page.locator('#transferReplaceLabel').isVisible());
  const before = await page.evaluate(() => window.qaBatterState(1).lanes[1].sampleId);
  await page.locator('#sendTransfer').click(); await page.waitForFunction(() => !document.querySelector('#sendTransfer').disabled); assert(await page.locator('#transferDialog').isVisible());
  assert.match(await page.locator('#transferStatus').textContent(), /replace|occupied|contains|already/i); assert.equal(await page.evaluate(() => window.qaBatterState(1).lanes[1].sampleId), before);
  await page.locator('#transferReplace').check(); await page.locator('#sendTransfer').click();
  await page.waitForFunction(() => !document.querySelector('#transferDialog').open || !document.querySelector('#sendTransfer').disabled && !document.querySelector('#closeTransfer').disabled, null, { timeout: 25000 });
  assert.equal(await page.locator('#transferDialog').isVisible(), false, 'Confirmed transfer must complete: ' + await page.locator('#transferStatus').textContent());
  await page.waitForFunction(() => window.qaBatterState(1).lanes[1].sampleId !== window.qaBatterState(1).lanes[0].sampleId);
  const transferred = await page.evaluate(async () => { const state = window.qaBatterState(1), lane = state.lanes[1], audio = await window.qaChild(1).BatterUI.engine.getSampleAudio(lane.sampleId), snapshot = await window.LoomApp.host.snapshot('track-2'); window.qaTransferSnapshot = snapshot; return { sampleId: lane.sampleId, rate: audio.sampleRate, frames: audio.left.length, stereo: audio.left.some((x, i) => Math.abs(x - audio.right[i]) > .02), original: window.LoomApp.getState().assets.find(a => a.id === 'transfer-source').pcm, snapshot }; });
  assert.notEqual(transferred.sampleId, before); assert.equal(transferred.rate, fixture.rate); assert.equal(transferred.frames, fixture.frames); assert(transferred.stereo); assert.equal(transferred.original, fixture.pcm); assert(transferred.snapshot.state);
  await closeInstrument(page); await page.locator('#undoButton').click(); await openInstrument(page, 1); await page.waitForFunction(id => window.qaBatterState(1).lanes[1].sampleId === id, before, { timeout: 10000 }); assert.equal(await page.evaluate(() => window.qaBatterState(1).lanes[1].sampleId), before);
  await closeInstrument(page); await page.locator('#redoButton').click(); await openInstrument(page, 1); await page.waitForFunction(id => window.qaBatterState(1).lanes[1].sampleId === id, transferred.sampleId, { timeout: 10000 }); assert.equal(await page.evaluate(() => window.qaBatterState(1).lanes[1].sampleId), transferred.sampleId);
  passed.push('GALLEY clip → occupied BATTER snare requires Replace / stereo PCM and source clip retained / complete instrument Undo and Redo');

  const shared = await page.evaluate(async () => {
    const exported = await window.LoomApp.host.exportAudio('track-2', { scope: 'pattern', bars: 1, tailSeconds: .1 });
    const child = window.qaChild(1), audio = await child.MusicLabExchange.normalizeExport(exported); audio.name = 'BATTER shared recorded drum phrase';
    const saved = await child.MusicLabExchange.save(audio), parent = await window.MusicLabExchange.get(saved.id), listed = await window.MusicLabExchange.list();
    window.qaSharedBatterId = saved.id; const pcm = new Float32Array(parent.frames * 2); for (let i = 0; i < parent.frames; i++) { pcm[i * 2] = parent.pcm[0][i]; pcm[i * 2 + 1] = (parent.pcm[1] || parent.pcm[0])[i]; } window.qaSharedBatterAudio = { pcm, sampleRate: parent.sampleRate, name: parent.name, sourceApp: parent.sourceApp, tempo: parent.tempo };
    return { saved: { id: saved.id, frames: parent.frames, rate: parent.sampleRate, source: parent.sourceApp }, listed: listed.some(item => item.id === saved.id), rms: Math.sqrt(parent.pcm[0].reduce((sum, x) => sum + x * x, 0) / parent.frames) };
  });
  assert(shared.listed && shared.saved.frames > 12000 && shared.rms > .001); assert.equal(shared.saved.source, 'batter');
  await closeInstrument(page); await openInstrument(page, 2, 'fable');
  const stock = await page.evaluate(async () => { await window.LoomApp.host.importAudio('track-3', window.qaSharedBatterAudio, { target: 'new', replace: false }); const snapshot = await window.LoomApp.host.snapshot('track-3'); return { snapshot: JSON.stringify(snapshot), imports: window.LoomApp.host.capabilities('track-3').audioImport }; });
  assert(stock.snapshot.includes('BATTER shared recorded drum phrase')); assert(stock.imports.targets.length > 1); await closeInstrument(page); await openInstrument(page, 1);
  passed.push('Native BATTER pattern renders into the real shared sample pantry / parent GALLEY sees it / STOCK receives a playable sample zone');

  await page.evaluate(async () => {
    const child = window.qaChild(1), engine = child.BatterUI.engine, state = engine.getState(); state.name = 'Portable vocal drum ingredient'; state.lanes[1].tune = -7; state.lanes[1].lowpass = 3900; engine.setState(state); child.BatterUI.refresh(); window.qaContextBefore = window.LoomApp.engine.context;
  });
  await closeInstrument(page); await page.locator('#audioSettingsButton').click(); await page.locator('#audioSampleRate').selectOption('44100'); await page.locator('#audioLatencyProfile').selectOption('balanced'); await page.locator('#applyAudioSettings').click();
  await page.waitForFunction(() => !window.LoomApp.engine.getAudioDiagnostics().applying && window.LoomApp.engine.context?.sampleRate === 44100, null, { timeout: 25000 });
  if (await page.locator('#audioSettingsDialog').isVisible()) await page.locator('#closeAudioSettings').click();
  const context = await page.evaluate(() => ({ old: window.qaContextBefore.state, mode: window.LoomApp.engine.getAudioSettings().latencyProfile, frames: document.querySelectorAll('iframe[data-host-track]').length, snapshot: window.LoomApp.getState().tracks[1].instrument.snapshot })); assert.equal(context.old, 'closed'); assert.equal(context.mode, 'balanced'); assert.equal(context.frames, 0); assert(context.snapshot);
  await openInstrument(page, 1);
  const restored = await page.evaluate(async () => { const s = window.qaBatterState(1), audio = await window.qaChild(1).BatterUI.engine.getSampleAudio(s.lanes[1].sampleId); return { name: s.name, pitch: s.lanes[1].tune, cutoff: s.lanes[1].lowpass, sampleId: s.lanes[1].sampleId, rate: audio.sampleRate, frames: audio.left.length }; });
  assert.equal(restored.name, 'Portable vocal drum ingredient'); assert.equal(restored.pitch, -7); assert.equal(restored.cutoff, 3900); assert.equal(restored.sampleId, transferred.sampleId); assert.equal(restored.frames, fixture.frames);
  const project = await page.evaluate(async () => { const state = window.LoomApp.getState(); state.tracks[1].instrument.snapshot = await window.LoomApp.host.snapshot('track-2'); const encoded = window.LoomSchema.serializeProject(state); window.qaPortableBatterProject = encoded; return { project: encoded, parsed: window.LoomSchema.parseProject(encoded).tracks[1].instrument.snapshot, bytes: encoded.length }; });
  assert(project.bytes < 96 * 1024 * 1024); assert.equal(project.parsed.app, 'batter');
  passed.push('Audio sample-rate/profile change snapshots imported PCM and edits / closes old context / lazy native restore / portable GALLEY project');
  return { project: project.project, sampleId: transferred.sampleId, frames: fixture.frames };
}

async function offlineProject(browser, portable, serverURL) {
  const context = await browser.newContext(), page = await context.newPage(); const errors = [], httpRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route(/^https?:/, route => { httpRequests.push(route.request().url()); return route.abort(); });
  try {
    let offlineMode = 'literal file URL';
    try { await page.goto('file://' + htmlPath); }
    catch (error) {
      if (!String(error).includes('ERR_BLOCKED_BY_ADMINISTRATOR')) throw error;
      // The managed test browser blocks file navigation. Exercise the exact
      // downloaded bytes with network routes fulfilled locally instead, while
      // rejecting every sample or sibling-app URL. Report that limitation.
      offlineMode = 'managed Chromium blocks file URLs; exact downloaded bytes with all external network disabled';
      await context.unroute(/^https?:/);
      await context.route(/^https?:/, route => {
        if (route.request().url() === serverURL + '/loom/index.html' && route.request().isNavigationRequest()) return route.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(htmlPath) });
        if (route.request().url() === serverURL + '/index.html') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Offline empty hub</title>' });
        httpRequests.push(route.request().url()); return route.abort('internetdisconnected');
      });
      await page.goto(serverURL + '/loom/index.html');
    }
    await page.waitForFunction(() => !!window.LoomApp);
    await page.evaluate(async project => { await window.LoomApp.loadState(window.LoomSchema.parseProject(project)); }, portable.project);
    await openInstrument(page, 1);
    const actual = await page.evaluate(async () => { const child = document.querySelector('iframe[data-host-track="track-2"]').contentWindow, engine = child.BatterUI.engine, state = engine.getState(); await engine.init(); const audio = await engine.getSampleAudio(state.lanes[1].sampleId); return { id: state.lanes[1].sampleId, pitch: state.lanes[1].tune, frames: audio.left.length, rate: audio.sampleRate, catalog: engine.getCatalog().samples.length, voices: window.LoomApp.host.capabilities('track-2').notes.voices.length }; });
    assert.equal(actual.id, portable.sampleId); assert.equal(actual.pitch, -7); assert.equal(actual.frames, portable.frames); assert.equal(actual.voices, 12); assert(actual.catalog >= 85); assert.deepEqual(httpRequests, [], 'A downloaded GALLEY plus portable BATTER project plays its samples without URL fetches.'); assert.deepEqual(errors, []);
    observations.push({ offlineMode });
    passed.push('Downloaded GALLEY restores imported acoustic sampler PCM / native twelve voices / no HTTP sample or app fetch');
  } finally { await context.close(); }
}

(async () => {
  const server = await serve(); let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    const events = await install(page, server.url);
    if (process.env.LOOM_BATTER_QA_FOCUS !== 'transfer') { await nativeAndClock(page); await notesAndRender(page); }
    const portable = await transferAndPortable(page);
    const recovery = await page.evaluate(async () => ({ actual: await window.qaBatterRecovery(), expected: window.qaBatterRecoverySentinel })); assert.equal(recovery.actual.local, recovery.expected); assert.equal(recovery.actual.durable, recovery.expected);
    passed.push('Hosted sampler edits, imports and context restarts preserve standalone localStorage and durable IndexedDB recovery');
    assert.deepEqual(events.errors, []); assert.deepEqual(events.requests, [], 'The host remains independent of sibling app/sample URLs.'); await page.close();
    await offlineProject(browser, portable, server.url);
    process.stdout.write(JSON.stringify({ passed: passed.length, groups: passed, observations }, null, 2) + '\n');
  } finally { await browser?.close(); await server.close(); }
})().catch(error => { process.stderr.write(JSON.stringify({ passed: passed.length, groups: passed, observations }, null, 2) + '\n' + error.stack + '\n'); process.exitCode = 1; });
