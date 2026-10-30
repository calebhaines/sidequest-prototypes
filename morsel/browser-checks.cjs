'use strict';
// Actual Chromium audio, standalone UI and native GALLEY Print checks.
// MORSEL_QA_BUILT=1 uses the release HTML; otherwise a /tmp preview is built.
// MORSEL_QA_PHASES=projects,audio,live,exports,ui,host selects independent groups.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const appRoot = __dirname, root = path.resolve(appRoot, '..');
const artifacts = process.env.MORSEL_QA_ARTIFACTS || '/tmp/morsel-browser-qa';
const hasHost = fs.existsSync(path.join(root, 'loom', 'instrument-host.js'));
const passed = [], skipped = [], errors = [], external = [];
const offlinePath = path.join(artifacts, 'MORSEL-offline.html'), offlineURL = pathToFileURL(offlinePath).href;
fs.mkdirSync(artifacts, { recursive: true });
let server, browser, html;

async function check(name, run) {
  const began = Date.now(), evidence = await run();
  if (evidence?.skipped) { skipped.push({ name, reason: evidence.reason || 'Required integration sources are unavailable.' }); console.log('SKIP ' + name + ' ' + JSON.stringify(evidence)); return; }
  passed.push({ name, milliseconds: Date.now() - began, evidence });
  console.log('PASS ' + name + (evidence ? ' ' + JSON.stringify(evidence) : ''));
}
async function serve() {
  if (process.env.MORSEL_QA_BUILT === '1') html = fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8');
  else {
    const output = path.join(artifacts, 'source-preview.html');
    await promisify(execFile)('python3', [path.join(appRoot, 'build.py'), '--output', output], { maxBuffer: 1024 * 1024 });
    html = fs.readFileSync(output, 'utf8');
  }
  const hostScripts = ['shared/pattern-schema.js', ...['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'preamp-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'effects.js', 'service-schema.js', 'schema.js', 'audio-engine.js', 'host-bridge.js', 'instrument-host.js', 'note-renderer.js', 'note-playback.js', 'piano-roll.js'].map(name => 'loom/' + name)];
  const hostHTML = '<!doctype html><meta charset="utf-8"><body><iframe id="editor" style="width:100%;height:800px"></iframe><section id="qaPiano"></section><script>window.LoomEmbeddedInstruments={morsel:' + JSON.stringify(html).replace(/</g, '\\u003c') + '};</script>' + hostScripts.map(name => '<script src="/' + name + '"></script>').join('');
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
    if (/^\/morsel\/(?:index\.html)?$/.test(pathname)) { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(html); return; }
    if (pathname === '/host.html' && hasHost) { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(hostHTML); return; }
    const filename = path.resolve(root, '.' + pathname);
    if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) { response.writeHead(404); response.end('Missing fixture'); return; }
    response.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' })[path.extname(filename)] || 'application/octet-stream' });
    fs.createReadStream(filename).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + server.address().port;
}
async function pageFor(context, base, { width = 1440, host = false } = {}) {
  const page = await context.newPage(); page.setDefaultTimeout(120000);
  await page.setViewportSize({ width, height: 1000 });
  await page.addInitScript(() => { window.__qaSpeechCalls = 0; if (window.speechSynthesis) window.speechSynthesis.speak = () => { window.__qaSpeechCalls++; throw Error('OS speech synthesis must not be used'); }; });
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.goto(base + (host ? '/host.html' : '/morsel/'), { waitUntil: 'load' });
  await page.waitForFunction(host ? () => !!window.LoomInstrumentHost && !!window.LoomNoteRenderer : () => !!window.MorselApp && !!window.MorselController);
  return page;
}
async function helpers(page) {
  await page.evaluate(() => {
    const copy = value => JSON.parse(JSON.stringify(value));
    function stats(data, start = 0, end = data.length) {
      let peak = 0, energy = 0, first = -1, invalid = 0;
      for (let frame = Math.max(0, start); frame < Math.min(data.length, end); frame++) { const value = data[frame]; if (!Number.isFinite(value)) invalid++; peak = Math.max(peak, Math.abs(value)); energy += value * value; if (first < 0 && Math.abs(value) > 1e-6) first = frame; }
      return { peak, rms: Math.sqrt(energy / Math.max(1, Math.min(data.length, end) - Math.max(0, start))), first, invalid };
    }
    function difference(a, b) { let maximum = 0, power = 0; const count = Math.max(a.length, b.length); for (let i = 0; i < count; i++) { const delta = (a[i] || 0) - (b[i] || 0); maximum = Math.max(maximum, Math.abs(delta)); power += delta * delta; } return { maximum, rms: Math.sqrt(power / Math.max(1, count)) }; }
    function fundamental(data, rate, expected, seconds = .45) {
      const size = 4096, start = Math.max(0, Math.min(data.length - size, Math.round(seconds * rate))), x = data.subarray(start, start + size);
      const lower = Math.floor(rate / (expected * 1.16)), upper = Math.ceil(rate / (expected * .84)), scores = [];
      let best = -Infinity, lag = lower;
      for (let period = lower; period <= upper; period++) { let product = 0, a = 0, b = 0; for (let i = 0; i < x.length - period; i++) { const p = x[i], q = x[i + period]; product += p * q; a += p * p; b += q * q; } const score = product / Math.sqrt(Math.max(1e-24, a * b)); scores[period] = score; if (score > best) { best = score; lag = period; } }
      const left = scores[lag - 1], center = scores[lag], right = scores[lag + 1], offset = Number.isFinite(left) && Number.isFinite(right) ? .5 * (left - right) / (left - 2 * center + right || 1) : 0;
      const hz = rate / (lag + Math.max(-.5, Math.min(.5, offset)));
      return { hz, cents: 1200 * Math.log2(hz / expected), correlation: best };
    }
    async function decode(result, context) {
      if (result?.pcm && result.sampleRate) { const pcm = result.pcm, left = new Float32Array(pcm.length / 2), right = new Float32Array(left.length); for (let i = 0; i < left.length; i++) { left[i] = pcm[i * 2]; right[i] = pcm[i * 2 + 1]; } return { left, right, sampleRate: result.sampleRate }; }
      if (result?.left && result.sampleRate) return { left: result.left, right: result.right || result.left, sampleRate: result.sampleRate };
      const blob = result?.blob || result; if (!blob?.arrayBuffer) throw Error('Native audio result has no PCM or WAV');
      const buffer = await context.decodeAudioData(await blob.arrayBuffer()); return { left: buffer.getChannelData(0), right: buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1)), sampleRate: buffer.sampleRate };
    }
    window.morselQA = { copy, stats, difference, fundamental, decode, quiet: () => Object.assign(MorselSchema.defaultState(), { tone: 1, air: 0, vibrato: 0, space: 0, volume: .6, attack: .008, release: .03, tempo: 120 }), event: (voice = 'alto', lyric = 'ah', pitch = 60, beat = .5, duration = 1.5) => ({ id: 'qa-' + voice + '-' + pitch + '-' + lyric, voice, lyric, pitch, beat, duration, velocity: .8, probability: 1 }) };
  });
}

async function projects(context, base) {
  const page = await pageFor(context, base);
  try {
    const result = await page.evaluate(async () => {
      const app = MorselApp, s = MorselSchema.defaultState(); s.name = 'A word for every note';
      s.voice = 'robot'; s.phrase = 'hello kitchen';
      for (let index = 0; index < 32; index++) Object.assign(s.steps[index], { pitch: 48 + index % 25, lyric: index % 2 ? 'kitchen' : 'hello', voice: ['alto', 'tenor', 'bass', 'robot'][index % 4], on: index % 3 === 0 });
      await app.loadState(s); const before = JSON.stringify(app.getState()), project = app.getProject(), parsed = MorselSchema.parseProject(JSON.stringify(project));
      await app.loadState(project); const roundTrip = before === JSON.stringify(app.getState());
      const failures = [];
      for (const mutate of [p => { p.state.steps[0].pitch = -1; }, p => { p.state.steps[1].lyric = 'x'.repeat(161); }, p => { p.state.steps[2].voice = 'missing-voice'; }, p => { p.state.voice = 'missing-voice'; }]) {
        const invalid = JSON.parse(JSON.stringify(project)); mutate(invalid); let rejected = false; try { await app.loadState(invalid); } catch (_) { rejected = true; } failures.push({ rejected, unchanged: before === JSON.stringify(app.getState()) });
      }
      const packet = await MusicLabPatternInstrument.exportPattern();
      return { roundTrip, parsed: !!parsed, failures, voices: packet.voices.map(voice => voice.id), lyrics: packet.notes.map(note => note.lyric), nativeLyrics: app.getState().steps.filter((step, index) => index < s.length && step.on).map(step => step.lyric), detached: app.getState() !== app.getState(), speechCalls: __qaSpeechCalls };
    });
    assert(result.roundTrip && result.parsed && result.detached); assert(result.failures.every(row => row.rejected && row.unchanged), JSON.stringify(result.failures));
    assert.deepEqual(new Set(result.voices), new Set(['alto', 'tenor', 'bass', 'robot'])); assert.deepEqual(result.lyrics, result.nativeLyrics); assert.equal(result.speechCalls, 0);
    return result;
  } finally { await page.close(); }
}

async function audio(context, base) {
  const page = await pageFor(context, base); await helpers(page);
  try {
    const result = await page.evaluate(async () => {
      await MorselApp.loadState(MorselSchema.defaultState());
      const q = morselQA, engine = MorselApp.engine, state = q.quiet(), before = JSON.stringify(state), sourceBefore = JSON.stringify(MorselApp.getState()), rows = [], clips = {}, decodeContext = new AudioContext();
      for (const voice of ['alto', 'tenor', 'bass', 'robot']) {
        const event = q.event(voice), rendered = await engine.renderNotes({ state, events: [event], tempo: 120, lengthBeats: 2.5, tailSeconds: 0 });
        const pcm = await q.decode(rendered, decodeContext), expected = 440 * 2 ** ((event.pitch - 69) / 12);
        clips[voice] = pcm.left; rows.push({ voice, rate: pcm.sampleRate, frames: pcm.left.length, all: q.stats(pcm.left), early: q.stats(pcm.left, 0, Math.round(.25 * pcm.sampleRate) - 1), pitch: q.fundamental(pcm.left, pcm.sampleRate, expected, .45) });
      }
      const pairs = []; for (const [index, a] of Object.keys(clips).entries()) for (const b of Object.keys(clips).slice(index + 1)) pairs.push({ a, b, ...q.difference(clips[a], clips[b]) });
      const notes = []; for (const pitch of [48, 69]) { const pcm = await q.decode(await engine.renderNotes({ state, events: [q.event('alto', 'ah', pitch)], tempo: 120, lengthBeats: 2.5, tailSeconds: 0 }), decodeContext); notes.push({ pitch, ...q.fundamental(pcm.left, pcm.sampleRate, 440 * 2 ** ((pitch - 69) / 12), .45) }); }
      const words = {}, arrays = {}; for (const lyric of ['hello', 'kitchen', 'love', 'ee', 'oo', 'mm', 'sh']) { const pcm = await q.decode(await engine.renderNotes({ state, events: [q.event('alto', lyric)], tempo: 120, lengthBeats: 2.5, tailSeconds: 0 }), decodeContext); arrays[lyric] = pcm.left; words[lyric] = q.stats(pcm.left); }
      const controls = {}; for (const [key, value] of Object.entries({ tone: 0, air: 1, vibrato: 1, space: 1, volume: .3 })) { const pcm = await q.decode(await engine.renderNotes({ state: { ...state, [key]: value }, events: [q.event()], tempo: 120, lengthBeats: 2.5, tailSeconds: 0 }), decodeContext); controls[key] = { ...q.difference(pcm.left, clips.alto), stats: q.stats(pcm.left) }; }
      await decodeContext.close();
      return { rows, pairs, notes, words, controls, wordDifference: q.difference(arrays.hello, arrays.kitchen), vowelDifference: q.difference(arrays.ee, arrays.oo), stateUnchanged: JSON.stringify(state) === before, sourceUnchanged: JSON.stringify(MorselApp.getState()) === sourceBefore, speechCalls: __qaSpeechCalls };
    });
    for (const row of result.rows) { assert.equal(row.rate, 48000); assert.equal(row.all.invalid, 0); assert(row.all.peak > .001 && row.all.peak <= 1.01, JSON.stringify(row)); assert.equal(row.early.peak, 0, row.voice + ' renders no audio before due note'); assert(row.all.first / row.rate >= .25 && row.all.first / row.rate < .40, row.voice + ' exact onset'); assert(Math.abs(row.pitch.cents) <= 35 && row.pitch.correlation > .65, row.voice + ' musical note ' + JSON.stringify(row.pitch)); }
    for (const pair of result.pairs) assert(pair.rms > .001, 'Distinct actual voice PCM ' + JSON.stringify(pair));
    for (const note of result.notes) assert(Math.abs(note.cents) <= 35 && note.correlation > .65, 'Pitch range ' + JSON.stringify(note));
    for (const [word, stats] of Object.entries(result.words)) assert(stats.invalid === 0 && stats.peak > .001 && stats.rms > .0001, word + ' actual synthesized word/sound');
    for (const [key, row] of Object.entries(result.controls)) assert(row.rms > 1e-5 && row.stats.invalid === 0, key + ' changes actual rendered audio');
    assert(result.controls.volume.stats.rms < result.rows[0].all.rms * .55 && result.controls.volume.stats.rms > result.rows[0].all.rms * .45, 'Volume is applied once');
    assert(result.wordDifference.rms > .005 && result.vowelDifference.rms > .005, 'Different words/vowels produce different actual audio'); assert(result.stateUnchanged && result.sourceUnchanged); assert.equal(result.speechCalls, 0);
    return result;
  } finally { await page.close(); }
}

async function live(context, base) {
  const page = await pageFor(context, base); await helpers(page);
  try {
    await page.locator('#panicButton').click();
    const result = await page.evaluate(async () => {
      const q = morselQA, engine = MorselApp.engine, state = q.quiet(); await MorselApp.loadState(state); await engine.init();
      const ctx = engine.context; await ctx.resume(); const tap = ctx.createAnalyser(); tap.fftSize = 2048; engine.graph.output.connect(tap);
      const read = () => { const values = new Float32Array(tap.fftSize); tap.getFloatTimeDomainData(values); return q.stats(values); }, sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
      const stalePreviews = [];
      for (const [action, lyric] of [['stop', 'cinnamon'], ['panic', 'sunshine']]) { const pending = MorselController.preview({ pitch: 60, voice: 'alto', lyric, durationSeconds: 1 }); MorselController[action](); await pending; await sleep(120); stalePreviews.push({ action, audio: read() }); }
      const events = [q.event('alto', 'ah', 60, 0, 4), q.event('tenor', 'oo', 67, 0, 4)]; await engine.prepareNotes({ state, events, tempo: 120 });
      const start = ctx.currentTime + .20; engine.scheduleNote({ ...events[0], when: start, durationSeconds: 2, source: 'qa-a' }); await sleep(80); const before = read(); await sleep(250); const sounding = read();
      engine.scheduleNote({ ...events[1], when: ctx.currentTime + .02, durationSeconds: 2, source: 'qa-b' }); await sleep(100); engine.stopNotes({ source: 'qa-a' }); await sleep(100); const independent = read();
      engine.stopNotes({ source: 'qa-b' }); await sleep(150); const stopped = read();
      const future = ctx.currentTime + .25; engine.scheduleNote({ ...events[0], when: future, durationSeconds: 1, source: 'qa-future' }); engine.stopNotes({ source: 'qa-future', when: future - .05 }); await sleep(450); const cancelled = read();
      engine.scheduleNote({ ...events[0], when: ctx.currentTime + .02, durationSeconds: 2, source: 'qa-panic' }); await sleep(120); const beforePanic = read(); engine.panic(); await sleep(150); const panic = read();
      const wetState = { ...state, space: .9 }; await MorselApp.loadState(wetState); await engine.prepareNotes({ state: wetState, events: [{ ...events[0], duration: .6 }], tempo: 120 }); engine.scheduleNote({ ...events[0], when: ctx.currentTime + .02, durationSeconds: .3, source: 'qa-wet-stop' }); await sleep(430); const wetBeforeStop = read();
      MorselController.stop(); await sleep(80); let wetStopped = { peak: 0, first: -1 }; for (let sample = 0; sample < 15; sample++) { const window = read(); if (window.peak > wetStopped.peak) wetStopped = window; await sleep(20); }
      await engine.prepareNotes({ state: wetState, events: [{ ...events[0], durationSeconds: 1 }], tempo: 120 }); engine.scheduleNote({ ...events[0], when: ctx.currentTime + .02, durationSeconds: 1, source: 'qa-immediate-old' }); await sleep(100); MorselController.stop(); await MorselController.preview({ pitch: 60, voice: 'alto', lyric: 'ah', durationSeconds: 1 }); await sleep(140); const freshAfterStop = read(); MorselController.panic(); await sleep(100); const finalPanic = read();
      engine.graph.output.disconnect(tap); tap.disconnect(); return { context: ctx.state, stalePreviews, before, sounding, independent, stopped, cancelled, beforePanic, panic, wetBeforeStop, wetStopped, freshAfterStop, finalPanic, meters: engine.getMeters(), speechCalls: __qaSpeechCalls };
    });
    assert.equal(result.context, 'running'); for (const row of result.stalePreviews) assert(row.audio.peak < 1e-5, row.action + ' during async preview preparation cannot resurrect audio: ' + JSON.stringify(row)); assert(result.before.peak < 1e-6, 'future note cannot start early'); assert(result.sounding.rms > .001 && result.independent.rms > .001, 'actual scoped cancellation preserves independent source'); assert(result.stopped.peak < 1e-5 && result.cancelled.peak < 1e-5, 'Stop and future cancellation silence'); assert(result.beforePanic.rms > .001 && result.panic.peak < 1e-5, 'Panic clears actual output'); assert(result.wetBeforeStop.peak > 1e-5 && result.wetStopped.peak < 1e-5, 'Native Stop clears the actual room tail'); assert(result.freshAfterStop.rms > .001 && result.finalPanic.peak < 1e-5, 'Stop followed by immediate preview preserves fresh audio and Panic clears it'); assert.equal(result.speechCalls, 0);
    return result;
  } finally { await page.close(); }
}

async function exportsCheck(context, base) {
  const page = await pageFor(context, base); await helpers(page);
  try {
    const result = await page.evaluate(async () => {
      const q = morselQA, app = MorselApp, state = q.quiet(); state.lyric = 'hello'; state.phrase = 'hello kitchen'; state.steps.forEach(step => { step.on = false; }); Object.assign(state.steps[0], { on: true, lyric: 'hello', pitch: 60 }); Object.assign(state.steps[4], { on: true, lyric: 'kitchen', pitch: 67, voice: 'robot' }); await app.loadState(state);
      const before = JSON.stringify(app.getState()), adapter = MusicLabPatternInstrument; await adapter.prepare(); const packet = await adapter.exportPattern(); const rendered = await adapter.renderPattern({ pattern: packet, voiceMap: Object.fromEntries(packet.voices.map(v => [v.id, v.id])), tempo: 120 }); const context = app.engine.context;
      const native = await q.decode(rendered, context), scopes = app.audioExport?.scopes || window.MorselController?.audioExport?.scopes || [], wavContext = new OfflineAudioContext(2, 1, 48000);
      const output = []; for (const scope of ['phrase', 'note']) { const exported = await (app.exportAudio ? app.exportAudio({ scope, bars: 2, tailSeconds: .1 }) : MorselController.exportAudio({ scope, bars: 2, tailSeconds: .1 })); const audio = await q.decode(exported, context), wav = await wavContext.decodeAudioData(await exported.blob.arrayBuffer()); output.push({ scope, rate: audio.sampleRate, frames: audio.left.length, stats: q.stats(audio.left), wavRate: wav.sampleRate, wavFrames: wav.length, wavDifference: q.difference(audio.left, wav.getChannelData(0)), name: exported.name || '' }); }
      return { lyrics: packet.notes.map(note => note.lyric), voices: packet.notes.map(note => note.voice), scopes: scopes.map(scope => scope.id), native: q.stats(native.left), output, unchanged: before === JSON.stringify(app.getState()), sharedSamples: typeof app.exportAudio === 'function', speechCalls: __qaSpeechCalls };
    });
    assert.deepEqual(result.lyrics, ['hello', 'kitchen']); assert.deepEqual(result.voices, ['alto', 'robot']); assert(result.native.peak > .001 && result.native.invalid === 0); for (const row of result.output) { assert(row.stats.peak > .001 && row.stats.invalid === 0 && row.rate === 48000 && row.frames > 1000, JSON.stringify(row)); assert.equal(row.wavRate, 48000); assert.equal(row.wavFrames, row.frames); assert(row.wavDifference.maximum <= 2 / 32768, 'Exported WAV matches native Float32 synthesis'); } assert(result.unchanged && result.sharedSamples); assert.equal(result.speechCalls, 0);
    const downloads = [];
    for (const [selector, name] of [['#exportPhrase', 'MORSEL-phrase.wav'], ['#exportNote', 'MORSEL-word.wav']]) { const pending = page.waitForEvent('download'); await page.locator(selector).click(); const item = await pending; assert.equal(await item.failure(), null); const destination = path.join(artifacts, name); await item.saveAs(destination); const bytes = fs.readFileSync(destination); assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WAVE'); assert.equal(bytes.readUInt16LE(22), 2); assert.equal(bytes.readUInt32LE(24), 48000); assert.equal(bytes.readUInt16LE(34), 16); assert(bytes.length > 1000); downloads.push({ name, bytes: bytes.length, suggested: item.suggestedFilename() }); }
    return { ...result, downloads };
  } finally { await page.close(); }
}

async function ui(context, base) {
  const page = await pageFor(context, base);
  try {
    await page.evaluate(() => MorselApp.loadState(MorselSchema.defaultState()));
    assert.equal(await page.locator('#voices [data-voice]').count(), 4);
    for (const voice of ['alto', 'tenor', 'bass', 'robot']) { await page.locator('#voices [data-voice="' + voice + '"]').click(); assert.equal(await page.evaluate(() => MorselApp.getState().voice), voice); }
    await page.locator('#phraseInput').fill('hello kitchen sing softly'); await page.locator('#distributeWords').click();
    const distributed = await page.evaluate(() => MorselApp.getState().steps.slice(0, MorselApp.getState().length).filter(step => step.on).map(step => step.lyric)); assert.deepEqual(distributed, ['hello', 'kitchen', 'sing', 'softly']);
    await page.locator('#steps [data-step="0"]').click(); await page.locator('#stepLyric').fill('love'); await page.locator('#stepLyric').press('Tab'); assert.equal(await page.evaluate(() => MorselApp.getState().steps[0].lyric), 'love');
    await page.locator('#undoButton').click(); assert.equal(await page.evaluate(() => MorselApp.getState().steps[0].lyric), 'hello'); await page.locator('#redoButton').click(); assert.equal(await page.evaluate(() => MorselApp.getState().steps[0].lyric), 'love');
    await page.locator('#stepPitch').selectOption('67'); await page.locator('#stepVoice').selectOption('bass'); assert.equal(await page.evaluate(() => MorselApp.getState().steps[0].pitch), 67); assert.equal(await page.evaluate(() => MorselApp.getState().steps[0].voice), 'bass');
    await page.locator('#playLyric').fill('ah'); await page.locator('#playLyric').press('Tab'); await page.locator('#keyboard [data-note="60"]').click(); await page.waitForFunction(() => MorselApp.engine.getMeters().peak > .001); await page.locator('#panicButton').click();
    await page.locator('#playButton').click(); await page.waitForFunction(() => MorselApp.engine.getMeters().peak > .001); await page.locator('#stopButton').click();
    const expected = await page.evaluate(() => JSON.stringify(MorselApp.getState())); await page.waitForTimeout(700); await page.reload(); await page.waitForFunction(() => !!window.MorselApp && !!window.MorselController); const recovered = await page.evaluate(() => JSON.stringify(MorselApp.getState())); assert.equal(recovered, expected, 'complete native recovery');
    const layouts = [];
    for (const width of [320, 390, 1440]) { await page.setViewportSize({ width, height: 1000 }); await page.waitForTimeout(100); const layout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth })); assert(layout.document <= width + 1 && layout.body <= width + 1, JSON.stringify(layout)); for (const selector of ['#phraseInput', '#distributeWords', '#voices [data-voice="alto"]', '#stepLyric', '#stepPitch', '#stepVoice', '#playButton', '#saveButton']) { const locator = page.locator(selector); await locator.scrollIntoViewIfNeeded(); const box = await locator.boundingBox(); assert(box && box.width > 0 && box.x >= -1 && box.x + box.width <= width + 1, selector + ' reachable at ' + width); } await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: path.join(artifacts, 'morsel-' + width + '.png'), fullPage: true }); layouts.push(layout); }
    const speechCalls = await page.evaluate(() => __qaSpeechCalls); assert.equal(speechCalls, 0); return { distributed, recovery: true, layouts, speechCalls };
  } finally { await page.close(); }
}

async function host(context, base) {
  if (!hasHost) { console.log('SKIP host: GALLEY sources are not part of the standalone source download'); return { skipped: true }; }
  const page = await pageFor(context, base, { host: true });
  try {
    const result = await page.evaluate(async () => {
      const copy = value => JSON.parse(JSON.stringify(value)), context = new AudioContext({ sampleRate: 48000 }); await context.resume(); const sink = context.createGain(); sink.gain.value = 0; sink.connect(context.destination);
      const host = new LoomInstrumentHost({ context, getTrackInput: () => sink, baseURL: location.origin + '/' }), renderer = new LoomNoteRenderer({ context, baseURL: location.origin + '/' });
      const stats = data => { let peak = 0, first = -1; for (let i = 0; i < data.length; i++) { if (!Number.isFinite(data[i])) throw Error('Non-finite hosted PCM'); peak = Math.max(peak, Math.abs(data[i])); if (first < 0 && Math.abs(data[i]) > 1e-6) first = i; } return { peak, first }; };
      try {
        await host.load('morsel-source', { id: 'morsel' }, document.querySelector('iframe')); const child = document.querySelector('iframe').contentWindow, app = child.MorselApp, state = child.MorselSchema.defaultState(); state.space = state.vibrato = state.air = 0; state.tempo = 120; await app.loadState(state);
        const snapshot = await host.snapshot('morsel-source'), original = JSON.stringify(snapshot.state), packet = MusicLabPatternSchema.normalize({ format: 'musiclab-pattern', version: 1, name: 'A lyric on every note', sourceApp: 'morsel', kind: 'notes', tempo: 120, swing: 0, lengthBeats: 4, meter: [4, 4], voices: ['alto', 'tenor', 'bass', 'robot'].map(id => ({ id, name: id })), notes: [{ id: 'word-one', pitch: 60, voice: 'alto', beat: .5, duration: 1, velocity: .8, lyric: 'hello' }, { id: 'word-two', pitch: 67, voice: 'robot', beat: 2, duration: 1, velocity: .8, lyric: 'kitchen' }] });
        const project = LoomSchema.defaultState(); project.tempo = 120; project.loopEnabled = false; project.tracks[0].instrument = { id: 'morsel', snapshot }; project.tracks[0].instrumentLive = false; project.tracks[0].clips = [{ id: 'morsel-lyrics', type: 'notes', name: packet.name, pattern: packet, voiceMap: Object.fromEntries(packet.voices.map(v => [v.id, v.id])), start: 2, length: 4, sourceOffset: 0, rate: 1, loop: false, transpose: 0, gain: 1, fadeIn: 0, fadeOut: 0 }];
        const before = JSON.stringify(project), printed = await renderer.print(project, 'track-1', 'morsel-lyrics');
        const second = copy(project); second.tracks[0].clips[0].pattern.notes[0].lyric = 'love'; const changed = await renderer.print(second, 'track-1', 'morsel-lyrics'); let delta = 0; for (let i = 0; i < Math.min(printed.audio.left.length, changed.audio.left.length); i++) delta += (printed.audio.left[i] - changed.audio.left[i]) ** 2;
        // Exercise the real new async preparation hook before the real parent
        // scheduler asks a cold engine for a previously unseen word.
        const liveState = copy(project); liveState.tracks = [liveState.tracks[0]]; liveState.tracks[0].id = 'morsel-source'; liveState.tracks[0].clips[0].start = 0; liveState.tracks[0].clips[0].pattern.notes[0].lyric = 'butterflies';
        let liveClock = { playing: true, tempo: 120, beat: 0, absoluteBeat: 0, contextTime: context.currentTime, revision: 1, cycle: 0, countInBeatsRemaining: 0, loopEnabled: false, loopStart: 0, loopEnd: 4, endBeat: 4 };
        const statuses = [], playback = new LoomNotePlayback({ audio: { getTransport: () => liveClock, subscribeTransport: () => () => {} }, host, getState: () => liveState, onStatus: message => statuses.push(message) });
        await playback.prepare(); liveClock.contextTime = context.currentTime + .2;
        const analyser = context.createAnalyser(); analyser.fftSize = 2048; app.engine.graph.output.connect(analyser);
        const read = () => { const pcm = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(pcm); return stats(pcm); }, calls = [], originalSchedule = host.scheduleNote.bind(host);
        host.scheduleNote = (id, event) => { calls.push({ lyric: event.lyric, voice: event.voice, when: event.when - liveClock.contextTime }); return originalSchedule(id, event); };
        playback._clip(liveState.tracks[0], playback.tracks.get('morsel-source'), liveState.tracks[0].clips[0], { start: 0, end: 4, boundary: 4, when: liveClock.contextTime, cycle: 0 }, liveClock, 'qa-host-live');
        await new Promise(resolve => setTimeout(resolve, 100)); const earlyLive = read(); await new Promise(resolve => setTimeout(resolve, 470)); const liveAudio = read();
        host.cancelNotes('morsel-source', { source: 'qa-host-live' }); await new Promise(resolve => setTimeout(resolve, 160)); const stoppedLive = read();
        app.engine.graph.output.disconnect(analyser); analyser.disconnect(); playback.dispose(); host.scheduleNote = originalSchedule;
        const current = await host.snapshot('morsel-source'), recovered = LoomSchema.parseProject(LoomSchema.serializeProject(project));
        const uiState = copy(project), undo = [], auditions = [], editor = new LoomPianoRollEditor({ element: document.querySelector('#qaPiano'), getState: () => uiState, getClip: () => ({ trackIndex: 0, clip: uiState.tracks[0].clips[0] }), getVoices: () => packet.voices, remember: () => undo.push(copy(uiState)), onAudition: note => auditions.push(note) });
        editor.open(); editor.selected = new Set(['word-one']); editor.renderSelection(); window.__qaPiano = { state: uiState, editor, undo, auditions };
        return { audio: stats(printed.audio.left), rate: printed.audio.sampleRate, frames: printed.audio.left.length, words: printed.origin.pattern.notes.map(note => note.lyric), voices: printed.origin.pattern.notes.map(note => note.voice), recovered: recovered.tracks[0].clips[0].pattern.notes.map(note => note.lyric), lyricDifference: Math.sqrt(delta / printed.audio.left.length), live: { calls, early: earlyLive, sounding: liveAudio, stopped: stoppedLive, statuses }, originSnapshot: JSON.stringify(printed.origin.instrument.snapshot.state) === original, sourceUnchanged: JSON.stringify(current.state) === original && JSON.stringify(project) === before, framesLeft: document.querySelectorAll('iframe').length, registry: Object.values(window.__LoomHostRegistry).filter(record => record.active).length };
      } finally { await renderer.dispose(); host.dispose(); sink.disconnect(); await context.close(); }
    });
    assert(result.audio.peak > .001); assert(result.audio.first / result.rate >= .25 && result.audio.first / result.rate < .4, 'hosted print retains leading rest'); assert.deepEqual(result.words, ['hello', 'kitchen']); assert.deepEqual(result.voices, ['alto', 'robot']); assert.deepEqual(result.recovered, result.words); assert(result.lyricDifference > .001, 'Changing per-note text changes actual private Print audio'); assert.deepEqual(result.live.calls.map(note => note.lyric), ['butterflies', 'kitchen']); assert(Math.abs(result.live.calls[0].when - .25) < 1e-7 && Math.abs(result.live.calls[1].when - 1) < 1e-7, 'Host schedules exact note times after preparation'); assert(result.live.early.peak < 1e-6 && result.live.sounding.peak > .001 && result.live.stopped.peak < 1e-5, JSON.stringify(result.live)); assert.deepEqual(result.live.statuses, []); assert(result.originSnapshot && result.sourceUnchanged); assert.equal(result.framesLeft, 1); assert.equal(result.registry, 1);
    const lyric = page.locator('[data-piano-field="note-lyric"]'); await lyric.fill('sing softly'); await lyric.press('Tab');
    const edit = await page.evaluate(() => { const q = __qaPiano, note = q.state.tracks[0].clips[0].pattern.notes[0]; q.editor.audition(note); return { lyric: note.lyric, before: q.undo.at(-1)?.tracks[0].clips[0].pattern.notes[0].lyric, audition: q.auditions.at(-1)?.lyric, label: document.querySelector('[data-piano-note="word-one"]').getAttribute('aria-label') }; });
    assert.equal(edit.lyric, 'sing softly'); assert.equal(edit.before, 'hello'); assert.equal(edit.audition, 'sing softly'); assert(edit.label.includes('sing softly'));
    await lyric.fill(''); await lyric.press('Tab'); assert.equal(await page.evaluate(() => Object.prototype.hasOwnProperty.call(__qaPiano.state.tracks[0].clips[0].pattern.notes[0], 'lyric')), false, 'Empty inspector word returns to instrument default');
    return { ...result, pianoWordEditor: edit };
  } finally { await page.close(); }
}

async function offline(context) {
  fs.writeFileSync(offlinePath, html);
  const page = await context.newPage(); page.setDefaultTimeout(120000); page.on('pageerror', error => errors.push(error.stack || error.message));
  try {
    await page.addInitScript(() => { window.__qaSpeechCalls = 0; if (window.speechSynthesis) window.speechSynthesis.speak = () => { window.__qaSpeechCalls++; throw Error('OS speech synthesis must not be used'); }; });
    try { await page.goto(offlineURL); } catch (error) { if (error.message.includes('ERR_BLOCKED_BY_ADMINISTRATOR')) return { skipped: true, reason: 'Managed test-browser policy blocks file: navigation before the application runs.' }; throw error; }
    await page.waitForFunction(() => !!window.MorselApp && !!window.MorselController); await page.locator('#previewButton').click(); await page.waitForFunction(() => MorselApp.engine.getMeters().peak > .001);
    const result = await page.evaluate(async () => { const state = MorselSchema.defaultState(); state.space = state.air = state.vibrato = 0; const rendered = await MorselApp.engine.renderNotes({ state, events: [{ id: 'offline-word', pitch: 60, voice: 'alto', lyric: 'hello', beat: .5, duration: 1, velocity: .8, probability: 1 }], tempo: 120, lengthBeats: 2, tailSeconds: 0 }); let peak = 0, invalid = 0; for (const value of rendered.pcm) { peak = Math.max(peak, Math.abs(value)); if (!Number.isFinite(value)) invalid++; } MorselController.panic(); return { protocol: location.protocol, context: MorselApp.engine.context.state, rate: rendered.sampleRate, samples: rendered.pcm.length, peak, invalid, speechCalls: __qaSpeechCalls }; });
    assert.equal(result.protocol, 'file:'); assert.equal(result.context, 'running'); assert.equal(result.rate, 48000); assert(result.samples > 1000 && result.peak > .001); assert.equal(result.invalid, 0); assert.equal(result.speechCalls, 0); return result;
  } finally { await page.close(); }
}

async function galley(context, base) {
  if (!hasHost || !fs.existsSync(path.join(root, 'loom', 'index.html'))) return { skipped: true, reason: 'The compiled GALLEY release is not part of this standalone source download.' };
  const page = await context.newPage(); page.setDefaultTimeout(120000); page.on('pageerror', error => errors.push(error.stack || error.message));
  try {
    await page.goto(base + '/loom/index.html'); await page.waitForFunction(() => !!window.LoomApp && !!window.LoomSchema);
    await page.evaluate(() => LoomApp.loadState(LoomSchema.defaultState())); await page.locator('#browseInstrumentButton').click();
    const card = page.locator('#instrumentGrid .instrument-card').filter({ has: page.locator('h3', { hasText: /^MORSEL$/ }) }); assert.equal(await card.count(), 1); await card.click();
    const iframe = page.locator('#instrumentFrames iframe').first(); await iframe.waitFor(); const frame = await (await iframe.elementHandle()).contentFrame(); await frame.waitForFunction(() => !!window.MorselApp && !!window.MorselController);
    await frame.locator('#previewButton').click(); await frame.waitForFunction(() => MorselApp.engine.getMeters().peak > .001);
    const result = await page.evaluate(async () => { const bytes = new TextEncoder().encode(LoomEmbeddedInstruments.morsel), hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(value => value.toString(16).padStart(2, '0')).join(''); return { version: LoomSchema.VERSION, bundled: Object.keys(LoomEmbeddedInstruments).length, instrument: LoomApp.getState().tracks[0].instrument.id, nativeBytes: bytes.length, nativeHash: hash }; });
    assert.equal(result.version, '1.20.0'); assert.equal(result.bundled, 15); assert.equal(result.instrument, 'morsel'); assert.equal(result.nativeHash, createHash('sha256').update(html).digest('hex'), 'GALLEY embeds the exact tested MORSEL HTML');
    await page.screenshot({ path: path.join(artifacts, 'morsel-in-galley.png') }); await page.locator('#unloadInstrumentButton').click(); await page.waitForFunction(() => LoomApp.getState().tracks[0].instrument === null); await page.waitForTimeout(100);
    return { ...result, unloaded: true };
  } finally { await page.close(); }
}

(async () => {
  const base = await serve();
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ acceptDownloads: true });
  await context.route('**/*', route => { const url = route.request().url(); if (/^(data:|blob:|about:)/.test(url) || url.startsWith(base + '/') || url === offlineURL) return route.continue(); external.push(url); return route.abort(); });
  try {
    for (const phase of (process.env.MORSEL_QA_PHASES || 'projects,audio,live,exports,ui,host,offline,galley').split(',')) { const fn = { projects, audio, live, exports: exportsCheck, ui, host, offline, galley }[phase]; if (!fn) throw Error('Unknown MORSEL QA phase: ' + phase); await check(phase, () => fn(context, base)); }
    assert.deepEqual(external, [], 'All synthesis and application assets work offline'); assert.deepEqual(errors, [], 'No uncaught app/audio errors');
    console.log(JSON.stringify({ passed, skipped, artifacts, errors, external }, null, 2));
  } finally { await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
