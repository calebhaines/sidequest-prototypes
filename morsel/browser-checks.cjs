'use strict';
// Actual Chromium audio, standalone UI and native GALLEY Print checks.
// MORSEL_QA_BUILT=1 uses the release HTML; otherwise a /tmp preview is built.
// MORSEL_QA_PHASES=projects,audio,durations,live,exports,ui,host selects groups.
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
const artifacts = process.env.MORSEL_QA_ARTIFACTS || '/tmp/morsel-v11-browser-qa';
const hasHost = fs.existsSync(path.join(root, 'loom', 'instrument-host.js'));
const passed = [], skipped = [], errors = [], external = [];
const offlinePath = path.join(artifacts, 'MORSEL-offline.html'), offlineURL = pathToFileURL(offlinePath).href;
fs.mkdirSync(artifacts, { recursive: true });
let server, browser, html, activePhase;

async function check(name, run) {
  activePhase = name;
  const began = Date.now(), evidence = await run();
  activePhase = null;
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
    if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    if (/^\/morsel\/(?:index\.html)?$/.test(pathname)) { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(html); return; }
    if (['projects', 'wordSources', 'pitchCapture', 'audio', 'durations', 'live', 'exports', 'ui', 'offline'].includes(activePhase)) { external.push('Standalone runtime requested ' + pathname); response.writeHead(404); response.end('The standalone must embed its runtime assets.'); return; }
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
  const page = await context.newPage(); page.setDefaultTimeout(300000);
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
      let peak = 0, energy = 0, first = -1, last = -1, invalid = 0;
      for (let frame = Math.max(0, start); frame < Math.min(data.length, end); frame++) { const value = data[frame]; if (!Number.isFinite(value)) invalid++; peak = Math.max(peak, Math.abs(value)); energy += value * value; if (Math.abs(value) > 1e-6) { if (first < 0) first = frame; last = frame; } }
      return { peak, rms: Math.sqrt(energy / Math.max(1, Math.min(data.length, end) - Math.max(0, start))), first, last, invalid };
    }
    function difference(a, b) { let maximum = 0, power = 0; const count = Math.max(a.length, b.length); for (let i = 0; i < count; i++) { const delta = (a[i] || 0) - (b[i] || 0); maximum = Math.max(maximum, Math.abs(delta)); power += delta * delta; } return { maximum, rms: Math.sqrt(power / Math.max(1, count)) }; }
    function fundamental(data, rate, expected, seconds = .45, size = 4096) {
      const start = Math.max(0, Math.min(data.length - size, Math.round(seconds * rate))), x = data.subarray(start, start + size);
      const lower = Math.floor(rate / (expected * 1.16)), upper = Math.ceil(rate / (expected * .84)), scores = [];
      let best = -Infinity, lag = lower;
      for (let period = lower; period <= upper; period++) { let product = 0, a = 0, b = 0; for (let i = 0; i < x.length - period; i++) { const p = x[i], q = x[i + period]; product += p * q; a += p * p; b += q * q; } const score = product / Math.sqrt(Math.max(1e-24, a * b)); scores[period] = score; if (score > best) { best = score; lag = period; } }
      const left = scores[lag - 1], center = scores[lag], right = scores[lag + 1], offset = Number.isFinite(left) && Number.isFinite(right) ? .5 * (left - right) / (left - 2 * center + right || 1) : 0;
      const hz = rate / (lag + Math.max(-.5, Math.min(.5, offset)));
      return { hz, cents: 1200 * Math.log2(hz / expected), correlation: best, rms: stats(x).rms };
    }
    function pitchBand(data, rate, expected) {
      // Vocal formants can dominate raw low-note autocorrelation. Keep the
      // fundamental and first harmonics before measuring their period; this
      // changes only the detector, never the rendered or exported waveform.
      const result = Float64Array.from(data), omega = 2 * Math.PI * Math.min(rate * .45, expected * 4) / rate, cosine = Math.cos(omega), sine = Math.sin(omega);
      for (const quality of [.541196100146197, 1.306562964876377]) {
        const alpha = sine / (2 * quality), a0 = 1 + alpha, b0 = (1 - cosine) / 2 / a0, b1 = (1 - cosine) / a0, a1 = -2 * cosine / a0, a2 = (1 - alpha) / a0;
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (let index = 0; index < result.length; index++) { const value = result[index], output = b0 * value + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = value; y2 = y1; y1 = output; result[index] = output; }
      }
      return result;
    }
    function pitchSummary(data, rate, expected, from = .4, to = .8) {
      const voiced = [], allWindows = [], filtered = pitchBand(data, rate, expected); let rawVoicedWindows = 0;
      for (let seconds = from; seconds <= to; seconds += .04) { const raw = fundamental(data, rate, expected, seconds), row = { seconds, ...fundamental(filtered, rate, expected, seconds) }; if (raw.correlation > .5) rawVoicedWindows++; allWindows.push(row); if (row.correlation > .5) voiced.push(row); }
      const sorted = voiced.map(row => row.hz).sort((a, b) => a - b), hz = sorted[Math.floor(sorted.length / 2)] || 0;
      return { estimator: 'fourth-order-lowpass-autocorrelation', cutoffHz: expected * 4, hz, cents: hz ? 1200 * Math.log2(hz / expected) : null, voicedWindows: voiced.length, rawVoicedWindows, windows: voiced, allWindows };
    }
    function longestZeroRun(data, rate, from, to) {
      let run = 0, longest = 0;
      for (let i = Math.round(from * rate); i < Math.min(data.length, Math.round(to * rate)); i++) { run = Math.abs(data[i]) <= 1e-10 ? run + 1 : 0; longest = Math.max(longest, run); }
      return longest / rate * 1000;
    }
    function envelope(data, rate) {
      const windows = [], size = Math.round(.02 * rate), threshold = Math.max(.001, stats(data).peak * .01);
      for (let start = 0; start < data.length; start += size) { const row = stats(data, start, start + size); windows.push({ seconds: start / rate, rms: row.rms }); }
      return { threshold, audibleOnset: windows.find(row => row.rms >= threshold)?.seconds ?? null, windows };
    }
    async function decode(result, context) {
      if (result?.pcm && result.sampleRate) { const pcm = result.pcm, left = new Float32Array(pcm.length / 2), right = new Float32Array(left.length); for (let i = 0; i < left.length; i++) { left[i] = pcm[i * 2]; right[i] = pcm[i * 2 + 1]; } return { left, right, sampleRate: result.sampleRate }; }
      if (result?.left && result.sampleRate) return { left: result.left, right: result.right || result.left, sampleRate: result.sampleRate };
      const blob = result?.blob || result; if (!blob?.arrayBuffer) throw Error('Native audio result has no PCM or WAV');
      const buffer = await context.decodeAudioData(await blob.arrayBuffer()); return { left: buffer.getChannelData(0), right: buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1)), sampleRate: buffer.sampleRate };
    }
    window.morselQA = { copy, stats, difference, fundamental, pitchSummary, longestZeroRun, envelope, decode, quiet: () => Object.assign(MorselSchema.defaultState(), { tone: 1, air: 0, vibrato: 0, space: 0, volume: .6, attack: .008, release: .03, tempo: 120 }), event: (voice = 'alto', lyric = 'ah', pitch = 60, beat = .5, duration = 1.5) => ({ id: 'qa-' + voice + '-' + pitch + '-' + lyric, voice, lyric, pitch, beat, duration, velocity: .8, probability: 1 }) };
  });
}
async function waitForAudio(page, label) {
  try {
    await page.waitForFunction(() => {
      if (MorselApp.engine.getMeters().peak > .001) return true;
      const status = document.querySelector('#status')?.textContent || '';
      if (/^Use a (?:shorter phrase|word)|could not|took too long|failed to prepare|voice pack is missing|update your browser/i.test(status)) throw Error(status);
      return false;
    }, null, { timeout: 180000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({ status: document.querySelector('#status')?.textContent, context: MorselApp.engine.context?.state, meters: MorselApp.engine.getMeters(), voiceReady: MorselSpeech.ready, voice: MorselApp.getState().voice }));
    throw new Error(label + ': ' + JSON.stringify(diagnostic) + '\n' + error.message);
  }
}

async function projects(context, base) {
  const page = await pageFor(context, base);
  try {
    const result = await page.evaluate(async () => {
      const app = MorselApp, s = MorselSchema.defaultState(); s.name = 'A word for every note';
      s.voice = 'robot'; s.phrase = 'hello kitchen';
      for (let index = 0; index < 32; index++) Object.assign(s.steps[index], { pitch: 48 + index % 25, lyric: index % 2 ? 'kitchen' : 'hello', voice: ['alto', 'tenor', 'bass', 'robot'][index % 4], duration: [.25, .5, .75, 1.25, 3][index % 5], on: index % 3 === 0 });
      await app.loadState(s); const before = JSON.stringify(app.getState()), project = app.getProject(), parsed = MorselSchema.parseProject(JSON.stringify(project));
      await app.loadState(project); const roundTrip = before === JSON.stringify(app.getState());
      const failures = [];
      for (const mutate of [p => { p.state.steps[0].pitch = -1; }, p => { p.state.steps[1].lyric = 'x'.repeat(161); }, p => { p.state.steps[2].voice = 'missing-voice'; }, p => { p.state.voice = 'missing-voice'; }, p => { p.state.steps[0].duration = 0; }, p => { p.state.steps[0].duration = 32.01; }, p => { p.state.steps[0].duration = NaN; }, p => { delete p.state.steps[0].duration; }]) {
        const invalid = JSON.parse(JSON.stringify(project)); mutate(invalid); let rejected = false; try { await app.loadState(invalid); } catch (_) { rejected = true; } failures.push({ rejected, unchanged: before === JSON.stringify(app.getState()) });
      }
      const packet = await MusicLabPatternInstrument.exportPattern(), expected = MorselSequence.events(s, { realizeProbability: false }).map(note => ({ beat: note.beat, duration: note.duration, lyric: note.lyric, voice: note.voice }));
      const legacy = MorselSchema.defaultState(); legacy.steps.forEach(step => { delete step.duration; });
      await app.loadState({ format: 'morsel-project', formatVersion: 1, appVersion: '1.0.0', state: legacy });
      const old = app.getState(), migrated = await MusicLabPatternInstrument.exportPattern();
      const migration = { allAuto: old.steps.every(step => step.duration === null), durations: migrated.notes.map(note => note.duration), beats: migrated.notes.map(note => note.beat), newVersion: app.getProject().appVersion };
      await app.loadState(project);
      return { version: MorselSchema.VERSION, roundTrip, parsed: !!parsed, failures, voices: packet.voices.map(voice => voice.id), lyrics: packet.notes.map(note => note.lyric), nativeLyrics: app.getState().steps.filter((step, index) => index < s.length && step.on).map(step => step.lyric), notes: packet.notes.map(note => ({ beat: note.beat, duration: note.duration, lyric: note.lyric, voice: note.voice })), expected, migration, detached: app.getState() !== app.getState(), speechCalls: __qaSpeechCalls };
    });
    assert(result.roundTrip && result.parsed && result.detached); assert(result.failures.every(row => row.rejected && row.unchanged), JSON.stringify(result.failures));
    assert.deepEqual(new Set(result.voices), new Set(['alto', 'tenor', 'bass', 'robot'])); assert.deepEqual(result.lyrics, result.nativeLyrics); assert.equal(result.speechCalls, 0);
    assert.equal(result.version, '1.1.0'); assert.deepEqual(result.notes, result.expected); assert(new Set(result.notes.map(note => note.duration)).size > 2, 'Mixed/custom durations survive portable export'); assert(result.migration.allAuto); assert.deepEqual(result.migration.durations, [1.8, 1.8, 1.8, 1.8]); assert.deepEqual(result.migration.beats, [0, 2, 4, 6]); assert.equal(result.migration.newVersion, '1.1.0');
    return result;
  } finally { await page.close(); }
}

// Optional diagnostic capture for comparing the neural decoder output with the
// processed listening artifact. It is excluded from the normal release phases.
async function wordSources(context, base) {
  const page = await pageFor(context, base); await helpers(page);
  try {
    const rows = await page.evaluate(async () => {
      const output = [];
      for (const voice of ['alto', 'tenor', 'bass', 'robot']) { const raw = await MorselSpeech.render('hello kitchen', { voice }), pcm = new Float32Array(raw.left.length * 2); for (let index = 0; index < raw.left.length; index++) pcm[index * 2] = pcm[index * 2 + 1] = raw.left[index]; const bytes = new Uint8Array(await MorselAudioDSP.encodeWav(pcm, raw.sampleRate).arrayBuffer()); let binary = ''; for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768)); output.push({ voice, sampleRate: raw.sampleRate, frames: raw.left.length, sourceFrames: raw.sourceFrames, trimmedFrames: raw.trimmedFrames, trimmedEnergyFraction: raw.trimmedEnergyFraction, envelope: morselQA.envelope(raw.left, raw.sampleRate), base64: btoa(binary) }); }
      return output;
    });
    for (const row of rows) { row.wav = path.join(artifacts, 'MORSEL-raw-' + row.voice + '-hello-kitchen.wav'); fs.writeFileSync(row.wav, Buffer.from(row.base64, 'base64')); delete row.base64; }
    fs.writeFileSync(path.join(artifacts, 'word-source-evidence.json'), JSON.stringify(rows, null, 2) + '\n'); return rows;
  } finally { await page.close(); }
}

async function pitchCapture(context, base) {
  const page = await pageFor(context, base); await helpers(page);
  try {
    const result = await page.evaluate(async () => {
      const q = morselQA, engine = MorselApp.engine, state = q.quiet(), decoder = new AudioContext(), notes = [];
      const encode = async (left, sampleRate) => { const pcm = new Float32Array(left.length * 2); for (let index = 0; index < left.length; index++) pcm[index * 2] = pcm[index * 2 + 1] = left[index]; const bytes = new Uint8Array(await MorselAudioDSP.encodeWav(pcm, sampleRate).arrayBuffer()); let binary = ''; for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768)); return btoa(binary); };
      for (const pitch of [36, 48, 60]) { const pcm = await q.decode(await engine.renderNotes({ state, events: [q.event('alto', 'ah', pitch)], tempo: 120, lengthBeats: 2.5, tailSeconds: 0 }), decoder), expected = 440 * 2 ** ((pitch - 69) / 12), windows = []; for (let seconds = .30; seconds < .9; seconds += .04) for (const size of [2048, 4096, 8192]) windows.push({ seconds, size, ...q.fundamental(pcm.left, pcm.sampleRate, expected, seconds, size) }); notes.push({ pitch, rate: pcm.sampleRate, stats: q.stats(pcm.left), envelope: q.envelope(pcm.left, pcm.sampleRate), zeroRunMs: q.longestZeroRun(pcm.left, pcm.sampleRate, .4, .8), windows, base64: await encode(pcm.left, pcm.sampleRate) }); }
      await decoder.close(); return notes;
    });
    for (const row of result) { row.wav = path.join(artifacts, 'MORSEL-processed-alto-ah-' + row.pitch + '.wav'); fs.writeFileSync(row.wav, Buffer.from(row.base64, 'base64')); delete row.base64; }
    fs.writeFileSync(path.join(artifacts, 'pitch-capture-evidence.json'), JSON.stringify(result, null, 2) + '\n'); return result;
  } finally { await page.close(); }
}

async function audio(context, base) {
  const page = await pageFor(context, base); await helpers(page);
  try {
    const result = await page.evaluate(async () => {
      await MorselApp.loadState(MorselSchema.defaultState());
      const q = morselQA, engine = MorselApp.engine, state = q.quiet(), before = JSON.stringify(state), sourceBefore = JSON.stringify(MorselApp.getState()), rows = [], clips = {}, decodeContext = new AudioContext();
      const backend = { id: MorselSpeech.backend, modelHash: MorselSpeech.modelHash, sampleRate: MorselSpeech.sampleRate, profiles: MorselSpeech.profiles }, sources = [], sourceClips = {}, sourceWavs = {};
      async function wavBase64(data, rate, stereo = false) { const pcm = stereo ? data : new Float32Array(data.length * 2); if (!stereo) for (let index = 0; index < data.length; index++) pcm[index * 2] = pcm[index * 2 + 1] = data[index]; const bytes = new Uint8Array(await MorselAudioDSP.encodeWav(pcm, rate).arrayBuffer()); let binary = ''; for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768)); return btoa(binary); }
      for (const voice of ['alto', 'tenor', 'bass', 'robot']) { const raw = await MorselSpeech.render('ah', { voice }); sourceClips[voice] = raw.left; sourceWavs[voice] = await wavBase64(raw.left, raw.sampleRate); sources.push({ voice, speaker: raw.speaker, backend: raw.backend, modelHash: raw.modelHash, rate: raw.sampleRate, frames: raw.left.length, sourceFrames: raw.sourceFrames, trimmedFrames: raw.trimmedFrames, trimmedEnergyFraction: raw.trimmedEnergyFraction, stats: q.stats(raw.left), envelope: q.envelope(raw.left, raw.sampleRate) }); }
      const shortWords = []; for (const [voice, lyric] of [['bass', 'love'], ['alto', 'the'], ['tenor', 'a'], ['robot', 'I'], ['robot', 'sing']]) { const raw = await MorselSpeech.render(lyric, { voice }); shortWords.push({ voice, lyric, frames: raw.left.length, rate: raw.sampleRate, sourceFrames: raw.sourceFrames, trimmedFrames: raw.trimmedFrames, trimmedEnergyFraction: raw.trimmedEnergyFraction, stats: q.stats(raw.left) }); }
      const sourcePairs = []; for (const [index, a] of Object.keys(sourceClips).entries()) for (const b of Object.keys(sourceClips).slice(index + 1)) sourcePairs.push({ a, b, ...q.difference(sourceClips[a], sourceClips[b]) });
      for (const voice of ['alto', 'tenor', 'bass', 'robot']) {
        const event = q.event(voice), rendered = await engine.renderNotes({ state, events: [event], tempo: 120, lengthBeats: 2.5, tailSeconds: 0 });
        const pcm = await q.decode(rendered, decodeContext), expected = 440 * 2 ** ((event.pitch - 69) / 12);
        clips[voice] = pcm.left; rows.push({ voice, rate: pcm.sampleRate, frames: pcm.left.length, all: q.stats(pcm.left), early: q.stats(pcm.left, 0, Math.round(.25 * pcm.sampleRate) - 1), pitch: q.pitchSummary(pcm.left, pcm.sampleRate, expected), zeroRunMs: q.longestZeroRun(pcm.left, pcm.sampleRate, .4, .8), envelope: q.envelope(pcm.left, pcm.sampleRate) });
      }
      const pairs = []; for (const [index, a] of Object.keys(clips).entries()) for (const b of Object.keys(clips).slice(index + 1)) pairs.push({ a, b, ...q.difference(clips[a], clips[b]) });
      const notes = []; for (const pitch of [36, 48, 60, 69, 84]) { const pcm = await q.decode(await engine.renderNotes({ state, events: [q.event('alto', 'ah', pitch)], tempo: 120, lengthBeats: 2.5, tailSeconds: 0 }), decodeContext); notes.push({ pitch, ...q.pitchSummary(pcm.left, pcm.sampleRate, 440 * 2 ** ((pitch - 69) / 12)), zeroRunMs: q.longestZeroRun(pcm.left, pcm.sampleRate, .4, .8), stats: q.stats(pcm.left) }); }
      const words = {}, arrays = {}; for (const lyric of ['hello', 'kitchen', 'love', 'ee', 'oo', 'mm', 'sh']) { const pcm = await q.decode(await engine.renderNotes({ state, events: [q.event('alto', lyric)], tempo: 120, lengthBeats: 2.5, tailSeconds: 0 }), decodeContext); arrays[lyric] = pcm.left; words[lyric] = q.stats(pcm.left); }
      const controls = {}; for (const [key, value] of Object.entries({ tone: 0, air: 1, vibrato: 1, space: 1, volume: .3 })) { const pcm = await q.decode(await engine.renderNotes({ state: { ...state, [key]: value }, events: [q.event()], tempo: 120, lengthBeats: 2.5, tailSeconds: 0 }), decodeContext); controls[key] = { ...q.difference(pcm.left, clips.alto), stats: q.stats(pcm.left) }; }
      // Keep a listening artifact of the actual instrument output. Numerical
      // pitch checks alone cannot establish whether the new voices sound good.
      const gap = Math.round(.2 * 48000), voiceOrder = ['alto', 'tenor', 'bass', 'robot'], demoClips = {};
      for (const voice of voiceOrder) demoClips[voice] = (await q.decode(await engine.renderNotes({ state: { ...state, tone: .75 }, events: [q.event(voice)], tempo: 120, lengthBeats: 2.5, tailSeconds: 0 }), decodeContext)).left;
      const demo = new Float32Array(voiceOrder.reduce((sum, voice) => sum + demoClips[voice].length + gap, 0) * 2); let at = 0;
      for (const voice of voiceOrder) { for (const value of demoClips[voice]) { demo[at++] = value; demo[at++] = value; } at += gap * 2; }
      const demoBase64 = await wavBase64(demo, 48000, true);
      const wordClips = {}, wordDemoRows = [];
      for (const voice of voiceOrder) { wordClips[voice] = (await q.decode(await engine.renderNotes({ state: { ...state, tone: .75 }, events: [q.event(voice, 'hello kitchen', 60, .5, 4)], tempo: 120, lengthBeats: 5, tailSeconds: 0 }), decodeContext)).left; wordDemoRows.push({ voice, stats: q.stats(wordClips[voice]), envelope: q.envelope(wordClips[voice], 48000) }); }
      const wordDemo = new Float32Array(voiceOrder.reduce((sum, voice) => sum + wordClips[voice].length + gap, 0) * 2); at = 0;
      for (const voice of voiceOrder) { for (const value of wordClips[voice]) { wordDemo[at++] = value; wordDemo[at++] = value; } at += gap * 2; }
      const wordDemoBase64 = await wavBase64(wordDemo, 48000, true);
      await decodeContext.close();
      return { backend, sources, shortWords, sourcePairs, rows, pairs, notes, words, controls, sourceWavs, demoBase64, wordDemoBase64, wordDemoRows, wordDifference: q.difference(arrays.hello, arrays.kitchen), vowelDifference: q.difference(arrays.ee, arrays.oo), stateUnchanged: JSON.stringify(state) === before, sourceUnchanged: JSON.stringify(MorselApp.getState()) === sourceBefore, speechCalls: __qaSpeechCalls };
    });
    const demoPath = path.join(artifacts, 'MORSEL-new-voices.wav'); fs.writeFileSync(demoPath, Buffer.from(result.demoBase64, 'base64')); delete result.demoBase64; result.demo = { path: demoPath, order: ['Alto', 'Tenor', 'Bass', 'Soprano'], tone: .75, air: 0, vibrato: 0 };
    const wordDemoPath = path.join(artifacts, 'MORSEL-new-word-voices.wav'); fs.writeFileSync(wordDemoPath, Buffer.from(result.wordDemoBase64, 'base64')); delete result.wordDemoBase64; result.wordDemo = { ...result.demo, path: wordDemoPath, phrase: 'hello kitchen' };
    for (const [voice, wav] of Object.entries(result.sourceWavs)) { const filename = path.join(artifacts, 'MORSEL-raw-' + voice + '-ah.wav'); fs.writeFileSync(filename, Buffer.from(wav, 'base64')); result.sources.find(row => row.voice === voice).wav = filename; } delete result.sourceWavs;
    fs.writeFileSync(path.join(artifacts, 'audio-evidence.json'), JSON.stringify(result, null, 2) + '\n');
    assert.equal(result.backend.id, 'kitten-tts-nano-0.8-int8'); assert.equal(result.backend.modelHash, 'f7b0afcbee92870b32b8e0276d855b954dc25470c9f051b376ac7eee537c76fc'); assert.equal(result.backend.sampleRate, 24000); assert.equal(new Set(result.backend.profiles.map(row => row.speaker)).size, 4);
    for (const row of result.sources) { assert.equal(row.backend, result.backend.id); assert.equal(row.modelHash, result.backend.modelHash); assert.equal(row.rate, 24000); assert(row.frames > 1000 && row.stats.peak > .001 && row.stats.invalid === 0, 'Actual neural source PCM: ' + JSON.stringify(row)); }
    for (const row of result.shortWords) assert(row.stats.invalid === 0 && row.stats.peak > .001 && row.frames > row.rate * (['love', 'sing'].includes(row.lyric) ? .08 : .015), 'Common short words retain real audio instead of losing it to a fixed tail trim: ' + JSON.stringify(row));
    for (const row of [...result.sources, ...result.shortWords]) { assert.equal(row.sourceFrames - row.trimmedFrames, row.frames); assert(Number.isFinite(row.trimmedEnergyFraction) && row.trimmedEnergyFraction <= .00101, 'Endpoint cleanup preserves at least99.9% of generated speech energy: ' + JSON.stringify(row)); }
    for (const pair of result.sourcePairs) assert(pair.rms > .001, 'Four voices differ before any musical effects: ' + JSON.stringify(pair));
    for (const row of result.rows) { assert.equal(row.rate, 48000); assert.equal(row.all.invalid, 0); assert(row.all.peak > .001 && row.all.peak <= 1.01, JSON.stringify(row)); assert.equal(row.early.peak, 0, row.voice + ' renders no audio before due note'); assert(row.all.first / row.rate >= .25 && row.all.first / row.rate < .40, row.voice + ' exact onset'); assert(row.envelope.audibleOnset !== null && row.envelope.audibleOnset >= .24 && row.envelope.audibleOnset < .4, row.voice + ' vowel reaches audible energy promptly after its scheduled onset: ' + JSON.stringify(row.envelope)); assert(row.pitch.voicedWindows >= 3 && Math.abs(row.pitch.cents) <= 240, row.voice + ' median musical register retains natural prosody: ' + JSON.stringify(row.pitch)); assert(row.zeroRunMs < 1, row.voice + ' has no literal grain gaps in its sustained vowel'); }
    for (const row of result.wordDemoRows) { assert.equal(row.stats.invalid, 0); assert(row.stats.peak > .001); assert(row.envelope.audibleOnset !== null && row.envelope.audibleOnset >= .24 && row.envelope.audibleOnset < .55, row.voice + ' actual words start audibly without neural padding, allowing their initial consonants: ' + JSON.stringify(row.envelope)); }
    for (const pair of result.pairs) assert(pair.rms > .001, 'Distinct actual voice PCM ' + JSON.stringify(pair));
    for (const note of result.notes) { assert(note.stats.invalid === 0 && note.stats.peak > .001); assert(note.voicedWindows >= 3 && Math.abs(note.cents) <= 240, 'Pitch range with natural intonation: ' + JSON.stringify(note)); assert(note.zeroRunMs < 1, 'No dropped/zeroed periods at MIDI ' + note.pitch + ': ' + JSON.stringify(note)); }
    for (let index = 1; index < result.notes.length; index++) { const a = result.notes[index - 1], b = result.notes[index]; assert(b.hz > a.hz * 2 ** ((b.pitch - a.pitch - 3) / 12), 'Notes follow their musical register rather than playing every word at one speech pitch'); }
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
      const events = [q.event('alto', 'ah', 60, 0, 4), q.event('tenor', 'oo', 67, 0, 4)]; await engine.prepareNotes({ state, events: [...events, { ...events[0], durationSeconds: 1 }, { ...events[0], durationSeconds: .3 }], tempo: 120 });
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

async function durations(context, base) {
  const page = await pageFor(context, base); await helpers(page);
  try {
    const result = await page.evaluate(async () => {
      const q = morselQA, state = q.quiet(), engine = MorselApp.engine, decoder = new AudioContext();
      state.steps.forEach(step => { step.on = false; });
      for (const [index, pitch, duration] of [[0, 60, 1.5], [1, 67, .25], [4, 64, 2.5]]) Object.assign(state.steps[index], { on: true, lyric: 'oo', pitch, duration, gate: .1 });
      const before = JSON.stringify(state), packet = MorselSequence.pattern(state), independent = packet.notes.map(note => ({ beat: note.beat, duration: note.duration }));
      const wider = MorselSequence.pattern({ ...state, division: 1 }), changedSpacing = wider.notes.map(note => ({ beat: note.beat, duration: note.duration }));
      const render = async events => q.decode(await engine.renderNotes({ state, events, tempo: 120, lengthBeats: 4.5, tailSeconds: 0 }), decoder);
      const first = q.event('alto', 'oo', 60, .5, 3), second = q.event('tenor', 'oo', 67, 1, 1);
      const short = await render([{ ...first, duration: .5 }]), long = await render([first]), next = await render([second]), mixed = await render([first, second]);
      const summed = new Float32Array(long.left.length); for (let i = 0; i < summed.length; i++) summed[i] = long.left[i] + next.left[i];
      const range = (data, from, to) => q.stats(data, Math.round(from * 48000), Math.round(to * 48000));
      const evidence = { independent, changedSpacing, short: { all: q.stats(short.left), after: range(short.left, .7, 1.5) }, long: { all: q.stats(long.left), sustain: range(long.left, 1.25, 1.6), after: range(long.left, 1.95, 2.2) }, overlap: { difference: q.difference(mixed.left, summed), heldAfterNext: q.difference(mixed.left.subarray(60000, 76800), long.left.subarray(60000, 76800)), late: range(mixed.left, 1.25, 1.6) }, rate: mixed.sampleRate, unchanged: JSON.stringify(state) === before };
      await decoder.close(); return evidence;
    });
    fs.writeFileSync(path.join(artifacts, 'duration-evidence.json'), JSON.stringify(result, null, 2) + '\n');
    assert.deepEqual(result.independent, [{ beat: 0, duration: 1.5 }, { beat: .5, duration: .25 }, { beat: 2, duration: 2.5 }]);
    assert.deepEqual(result.changedSpacing, [{ beat: 0, duration: 1.5 }, { beat: 1, duration: .25 }, { beat: 4, duration: 2.5 }], 'Spacing moves note starts without changing their independent durations');
    assert.equal(result.rate, 48000); assert.equal(result.short.all.invalid, 0); assert.equal(result.long.all.invalid, 0);
    assert(result.short.all.peak > .001 && result.short.after.peak < 1e-5, 'A short note ends rather than merely keeping a long voice gated on');
    assert(result.long.sustain.rms > .0001 && result.long.after.peak < 1e-5, 'A longer note has audible sustain and ends at its own length');
    assert(result.long.all.last > result.short.all.last + 48000 * .8, 'Changing note length changes actual audible duration');
    // Separate WebAudio filter accumulations differ by a fraction of a 16-bit
    // sample; compare at the same PCM tolerance used for the real WAV exports.
    assert(result.overlap.difference.maximum < 2 / 32768 && result.overlap.heldAfterNext.maximum < 2 / 32768 && result.overlap.late.rms > .0001, 'The next word does not truncate an independently sustained earlier note: ' + JSON.stringify(result.overlap));
    assert(result.unchanged); return result;
  } finally { await page.close(); }
}

async function exportsCheck(context, base) {
  const page = await pageFor(context, base); await helpers(page);
  try {
    const result = await page.evaluate(async () => {
      const q = morselQA, app = MorselApp, state = q.quiet(); state.lyric = 'hello'; state.phrase = 'hello kitchen'; state.steps.forEach(step => { step.on = false; }); Object.assign(state.steps[0], { on: true, lyric: 'hello', pitch: 60, duration: 1.25 }); Object.assign(state.steps[4], { on: true, lyric: 'kitchen', pitch: 67, voice: 'robot', duration: .25 }); await app.loadState(state);
      const before = JSON.stringify(app.getState()), adapter = MusicLabPatternInstrument; await adapter.prepare(); const packet = await adapter.exportPattern(); const rendered = await adapter.renderPattern({ pattern: packet, voiceMap: Object.fromEntries(packet.voices.map(v => [v.id, v.id])), tempo: 120 }); const context = app.engine.context;
      const native = await q.decode(rendered, context), scopes = app.audioExport?.scopes || window.MorselController?.audioExport?.scopes || [], wavContext = new OfflineAudioContext(2, 1, 48000);
      const output = []; for (const scope of ['phrase', 'note']) { const exported = await (app.exportAudio ? app.exportAudio({ scope, bars: 2, tailSeconds: .1 }) : MorselController.exportAudio({ scope, bars: 2, tailSeconds: .1 })); const audio = await q.decode(exported, context), wav = await wavContext.decodeAudioData(await exported.blob.arrayBuffer()); output.push({ scope, rate: audio.sampleRate, frames: audio.left.length, stats: q.stats(audio.left), wavRate: wav.sampleRate, wavFrames: wav.length, wavDifference: q.difference(audio.left, wav.getChannelData(0)), name: exported.name || '' }); }
      return { lyrics: packet.notes.map(note => note.lyric), voices: packet.notes.map(note => note.voice), durations: packet.notes.map(note => note.duration), selectedSeconds: MorselSequence.noteDuration(state, 0) * 60 / state.tempo, scopes: scopes.map(scope => scope.id), native: q.stats(native.left), output, unchanged: before === JSON.stringify(app.getState()), sharedSamples: typeof app.exportAudio === 'function', speechCalls: __qaSpeechCalls };
    });
    assert.deepEqual(result.lyrics, ['hello', 'kitchen']); assert.deepEqual(result.voices, ['alto', 'robot']); assert(result.native.peak > .001 && result.native.invalid === 0); for (const row of result.output) { assert(row.stats.peak > .001 && row.stats.invalid === 0 && row.rate === 48000 && row.frames > 1000, JSON.stringify(row)); assert.equal(row.wavRate, 48000); assert.equal(row.wavFrames, row.frames); assert(row.wavDifference.maximum <= 2 / 32768, 'Exported WAV matches native Float32 synthesis'); } assert(result.unchanged && result.sharedSamples); assert.equal(result.speechCalls, 0);
    assert.deepEqual(result.durations, [1.25, .25]); assert.equal(result.output.find(row => row.scope === 'note').frames, Math.round((result.selectedSeconds + .1) * 48000), 'Selected-word WAV uses this note’s custom length');
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
    await page.locator('#stepDuration').selectOption('0.5'); assert.equal(await page.evaluate(() => MorselApp.getState().steps[0].duration), .5);
    await page.locator('#steps [data-step="4"]').click(); await page.locator('#stepDuration').selectOption('2'); assert.deepEqual(await page.evaluate(() => [MorselApp.getState().steps[0].duration, MorselApp.getState().steps[4].duration]), [.5, 2]);
    await page.locator('#stepDuration').selectOption('custom'); await page.locator('#stepDurationBeats').fill('1.25'); await page.locator('#stepDurationBeats').press('Tab'); assert.equal(await page.evaluate(() => MorselApp.getState().steps[4].duration), 1.25);
    await page.locator('#division').selectOption('1'); assert.equal(await page.evaluate(() => MorselApp.getState().steps[4].duration), 1.25, 'Spacing leaves explicit note length unchanged'); await page.locator('#division').selectOption('0.5');
    await page.locator('#stepDuration').selectOption('auto'); assert.equal(await page.evaluate(() => MorselApp.getState().steps[4].duration), null); assert(await page.locator('#stepGateField').isVisible()); assert(await page.locator('#stepDurationBeats').isDisabled());
    await page.locator('#stepDuration').selectOption('1.5'); assert(await page.locator('#stepGateField').isHidden());
    await page.locator('#steps [data-step="0"]').click(); await page.locator('#stepDuration').selectOption('1'); await page.locator('#durationHandle').scrollIntoViewIfNeeded();
    const ruler = await page.locator('#durationRuler').boundingBox(), handle = await page.locator('#durationHandle').boundingBox();
    await page.evaluate(() => { window.__qaDurationChanges = 0; addEventListener('morsel:change', () => window.__qaDurationChanges++); });
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down(); await page.mouse.move(ruler.x + ruler.width * .25, handle.y + handle.height / 2, { steps: 14 });
    assert.deepEqual(await page.evaluate(() => ({ state: MorselApp.getState().steps[0].duration, changes: __qaDurationChanges, shown: Number(document.querySelector('#stepDurationBeats').value) })), { state: 1, changes: 0, shown: 2 }, 'Dragging previews locally without repeatedly invalidating prepared voices');
    await page.mouse.up(); assert.equal(await page.evaluate(() => __qaDurationChanges), 1, 'Releasing a duration drag commits exactly once');
    assert.equal(await page.evaluate(() => MorselApp.getState().steps[0].duration), 2); await page.locator('#undoButton').click(); assert.equal(await page.evaluate(() => MorselApp.getState().steps[0].duration), 1, 'One drag is one Undo'); await page.locator('#redoButton').click(); assert.equal(await page.evaluate(() => MorselApp.getState().steps[0].duration), 2);
    const nextHandle = await page.locator('#durationHandle').boundingBox(); await page.evaluate(() => { __qaDurationChanges = 0; }); await page.mouse.move(nextHandle.x + nextHandle.width / 2, nextHandle.y + nextHandle.height / 2); await page.mouse.down(); await page.mouse.move(ruler.x + ruler.width * .375, nextHandle.y + nextHandle.height / 2, { steps: 8 }); await page.locator('#durationHandle').dispatchEvent('pointercancel', { pointerId: 1, bubbles: true }); await page.mouse.up();
    assert.deepEqual(await page.evaluate(() => ({ duration: MorselApp.getState().steps[0].duration, changes: __qaDurationChanges })), { duration: 2, changes: 0 }, 'Cancelling a drag restores its original duration without a commit'); await page.locator('#undoButton').click(); assert.equal(await page.evaluate(() => MorselApp.getState().steps[0].duration), 1, 'A cancelled drag creates no extra Undo'); await page.locator('#redoButton').click();
    await page.locator('#durationHandle').press('ArrowRight'); assert.equal(await page.evaluate(() => MorselApp.getState().steps[0].duration), 2.0625); await page.locator('#undoButton').click(); assert.equal(await page.evaluate(() => MorselApp.getState().steps[0].duration), 2);
    await page.locator('#stepDuration').selectOption('custom'); await page.locator('#stepDurationBeats').fill('.3'); await page.locator('#stepDurationBeats').press('Tab'); assert.equal(await page.evaluate(() => MorselApp.getState().steps[0].duration), .3); assert(await page.locator('#stepDurationBeats').evaluate(element => element.validity.valid));
    await page.locator('#playLyric').fill('ah'); await page.locator('#playLyric').press('Tab'); await page.locator('#keyboard [data-note="60"]').click(); await waitForAudio(page, 'Real keyboard audition'); await page.locator('#panicButton').click();
    await page.locator('#playButton').click(); await waitForAudio(page, 'Real mixed-length word phrase'); await page.locator('#stopButton').click();
    const expected = await page.evaluate(() => JSON.stringify(MorselApp.getState())); await page.waitForTimeout(700); await page.reload(); await page.waitForFunction(() => !!window.MorselApp && !!window.MorselController); const recovered = await page.evaluate(() => JSON.stringify(MorselApp.getState())); assert.equal(recovered, expected, 'complete native recovery, including independent custom note lengths'); assert.deepEqual(await page.evaluate(() => [MorselApp.getState().steps[0].duration, MorselApp.getState().steps[4].duration]), [.3, 1.5]);
    const layouts = [];
    for (const width of [320, 390, 1440]) { await page.setViewportSize({ width, height: 1000 }); await page.waitForTimeout(100); const layout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth })); assert(layout.document <= width + 1 && layout.body <= width + 1, JSON.stringify(layout)); for (const selector of ['#phraseInput', '#distributeWords', '#voices [data-voice="alto"]', '#stepLyric', '#stepPitch', '#stepVoice', '#stepDuration', '#stepDurationBeats', '#durationHandle', '#playButton', '#saveButton']) { const locator = page.locator(selector); await locator.scrollIntoViewIfNeeded(); const box = await locator.boundingBox(); assert(box && box.width > 0 && box.x >= -1 && box.x + box.width <= width + 1, selector + ' reachable at ' + width); } await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: path.join(artifacts, 'morsel-' + width + '.png'), fullPage: true }); layouts.push(layout); }
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
        const snapshot = await host.snapshot('morsel-source'), original = JSON.stringify(snapshot.state), packet = MusicLabPatternSchema.normalize({ format: 'musiclab-pattern', version: 1, name: 'A lyric on every note', sourceApp: 'morsel', kind: 'notes', tempo: 120, swing: 0, lengthBeats: 4, meter: [4, 4], voices: ['alto', 'tenor', 'bass', 'robot'].map(id => ({ id, name: id })), notes: [{ id: 'word-one', pitch: 60, voice: 'alto', beat: .5, duration: .75, velocity: .8, lyric: 'hello' }, { id: 'word-two', pitch: 67, voice: 'robot', beat: 2, duration: 1.5, velocity: .8, lyric: 'kitchen' }] });
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
        host.scheduleNote = (id, event) => { calls.push({ lyric: event.lyric, voice: event.voice, when: event.when - liveClock.contextTime, durationSeconds: event.durationSeconds }); return originalSchedule(id, event); };
        playback._clip(liveState.tracks[0], playback.tracks.get('morsel-source'), liveState.tracks[0].clips[0], { start: 0, end: 4, boundary: 4, when: liveClock.contextTime, cycle: 0 }, liveClock, 'qa-host-live');
        await new Promise(resolve => setTimeout(resolve, 100)); const earlyLive = read(); await new Promise(resolve => setTimeout(resolve, 470)); const liveAudio = read();
        host.cancelNotes('morsel-source', { source: 'qa-host-live' }); await new Promise(resolve => setTimeout(resolve, 160)); const stoppedLive = read();
        app.engine.graph.output.disconnect(analyser); analyser.disconnect(); playback.dispose(); host.scheduleNote = originalSchedule;
        const current = await host.snapshot('morsel-source'), recovered = LoomSchema.parseProject(LoomSchema.serializeProject(project));
        const uiState = copy(project), undo = [], auditions = [], editor = new LoomPianoRollEditor({ element: document.querySelector('#qaPiano'), getState: () => uiState, getClip: () => ({ trackIndex: 0, clip: uiState.tracks[0].clips[0] }), getVoices: () => packet.voices, remember: () => undo.push(copy(uiState)), onAudition: note => auditions.push(note) });
        editor.open(); editor.selected = new Set(['word-one']); editor.renderSelection(); window.__qaPiano = { state: uiState, editor, undo, auditions };
        return { audio: stats(printed.audio.left), rate: printed.audio.sampleRate, frames: printed.audio.left.length, words: printed.origin.pattern.notes.map(note => note.lyric), voices: printed.origin.pattern.notes.map(note => note.voice), durations: printed.origin.pattern.notes.map(note => note.duration), recoveredDurations: recovered.tracks[0].clips[0].pattern.notes.map(note => note.duration), recovered: recovered.tracks[0].clips[0].pattern.notes.map(note => note.lyric), lyricDifference: Math.sqrt(delta / printed.audio.left.length), live: { calls, early: earlyLive, sounding: liveAudio, stopped: stoppedLive, statuses }, originSnapshot: JSON.stringify(printed.origin.instrument.snapshot.state) === original, sourceUnchanged: JSON.stringify(current.state) === original && JSON.stringify(project) === before, framesLeft: document.querySelectorAll('iframe').length, registry: Object.values(window.__LoomHostRegistry).filter(record => record.active).length };
      } finally { await renderer.dispose(); host.dispose(); sink.disconnect(); await context.close(); }
    });
    assert(result.audio.peak > .001); assert(result.audio.first / result.rate >= .25 && result.audio.first / result.rate < .4, 'hosted print retains leading rest'); assert.deepEqual(result.words, ['hello', 'kitchen']); assert.deepEqual(result.voices, ['alto', 'robot']); assert.deepEqual(result.recovered, result.words); assert(result.lyricDifference > .001, 'Changing per-note text changes actual private Print audio'); assert.deepEqual(result.live.calls.map(note => note.lyric), ['butterflies', 'kitchen']); assert(Math.abs(result.live.calls[0].when - .25) < 1e-7 && Math.abs(result.live.calls[1].when - 1) < 1e-7, 'Host schedules exact note times after preparation'); assert(result.live.early.peak < 1e-6 && result.live.sounding.peak > .001 && result.live.stopped.peak < 1e-5, JSON.stringify(result.live)); assert.deepEqual(result.live.statuses, []); assert(result.originSnapshot && result.sourceUnchanged); assert.equal(result.framesLeft, 1); assert.equal(result.registry, 1);
    assert.deepEqual(result.durations, [.75, 1.5]); assert.deepEqual(result.recoveredDurations, result.durations); assert.deepEqual(result.live.calls.map(note => Math.round(note.durationSeconds * 1e6) / 1e6), [.375, .75], 'Actual host scheduling keeps each note’s independent duration');
    const lyric = page.locator('[data-piano-field="note-lyric"]'); await lyric.fill('sing softly'); await lyric.press('Tab');
    const edit = await page.evaluate(() => { const q = __qaPiano, note = q.state.tracks[0].clips[0].pattern.notes[0]; q.editor.audition(note); return { lyric: note.lyric, before: q.undo.at(-1)?.tracks[0].clips[0].pattern.notes[0].lyric, audition: q.auditions.at(-1)?.lyric, label: document.querySelector('[data-piano-note="word-one"]').getAttribute('aria-label') }; });
    assert.equal(edit.lyric, 'sing softly'); assert.equal(edit.before, 'hello'); assert.equal(edit.audition, 'sing softly'); assert(edit.label.includes('sing softly'));
    await page.locator('[data-piano-field="note-duration"]').fill('1.25'); await page.locator('[data-piano-field="note-duration"]').press('Tab'); assert.equal(await page.evaluate(() => __qaPiano.state.tracks[0].clips[0].pattern.notes[0].duration), 1.25, 'GALLEY’s piano roll retains independently edited word lengths');
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
    await page.waitForFunction(() => !!window.MorselApp && !!window.MorselController); await page.locator('#previewButton').click(); await waitForAudio(page, 'File-origin word audition');
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
    await frame.locator('#previewButton').click(); await waitForAudio(frame, 'Compiled GALLEY word audition');
    const result = await page.evaluate(async () => { const bytes = new TextEncoder().encode(LoomEmbeddedInstruments.morsel), hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(value => value.toString(16).padStart(2, '0')).join(''); return { version: LoomSchema.VERSION, bundled: Object.keys(LoomEmbeddedInstruments).length, instrument: LoomApp.getState().tracks[0].instrument.id, nativeBytes: bytes.length, nativeHash: hash }; });
    assert.equal(result.version, '1.21.0'); assert.equal(result.bundled, 15); assert.equal(result.instrument, 'morsel'); assert.equal(result.nativeHash, createHash('sha256').update(html).digest('hex'), 'GALLEY embeds the exact tested MORSEL HTML');
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
    for (const phase of (process.env.MORSEL_QA_PHASES || 'projects,audio,durations,live,exports,ui,host,offline,galley').split(',')) { const fn = { projects, wordSources, pitchCapture, audio, durations, live, exports: exportsCheck, ui, host, offline, galley }[phase]; if (!fn) throw Error('Unknown MORSEL QA phase: ' + phase); await check(phase, () => fn(context, base)); }
    assert.deepEqual(external, [], 'All synthesis and application assets work offline'); assert.deepEqual(errors, [], 'No uncaught app/audio errors');
    console.log(JSON.stringify({ passed, skipped, artifacts, errors, external }, null, 2));
  } finally { await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
