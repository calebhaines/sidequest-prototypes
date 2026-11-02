'use strict';
/* Real FERMENT input capture, standalone Worklet/fallback and user exports.
 * One Chromium only. Run after the standalone has been built:
 * node loom/pedal-midi-browser-checks.cjs [optional HTTP URL]
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { decodeMidi } = require('./pedal-midi-engine-checks.cjs');
const installed = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || (fs.existsSync(installed) ? installed : 'playwright'));
const root = path.dirname(__dirname), artifacts = process.env.PEDAL_MIDI_QA_ARTIFACTS || '/tmp/galley-pedal-midi-browser';
let browser, server, activeCheck = 'startup'; const passed = [], errors = [], external = [];
fs.mkdirSync(artifacts, { recursive: true });
fs.rmSync(path.join(artifacts, 'failure.json'), { force: true });
async function serve() {
  server = http.createServer((request, response) => {
    const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (name === '/favicon.ico') { response.writeHead(204); return response.end(); }
    const file = name === '/loom/' || name === '/loom/index.html' ? process.env.PEDAL_MIDI_QA_FILE || path.join(__dirname, 'index.html') : path.resolve(root, '.' + name);
    if (!file.startsWith(root + path.sep) && file !== process.env.PEDAL_MIDI_QA_FILE) { response.writeHead(403); return response.end(); }
    fs.stat(file, (error, stat) => { if (error || !stat.isFile()) { response.writeHead(404); return response.end('Missing fixture'); } response.setHeader('Cache-Control', 'no-store'); response.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' })[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(response); });
  }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return 'http://127.0.0.1:' + server.address().port + '/loom/index.html';
}
function save() { fs.writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify({ passed, errors, external }, null, 2) + '\n'); }
async function check(name, callback) { if (process.env.PEDAL_MIDI_BROWSER_FILTER && !new RegExp(process.env.PEDAL_MIDI_BROWSER_FILTER).test(name)) return; activeCheck = name; const started = Date.now(), evidence = await callback(); passed.push({ name, milliseconds: Date.now() - started, evidence }); save(); console.log('PASS ' + name + ' ' + JSON.stringify(evidence)); }
async function pageFor(url, fallback = false) {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' }), origin = new URL(url).origin;
  await context.route('**/*', route => { const address = route.request().url(); if (/^(data:|blob:|about:)/.test(address) || new URL(address).origin === origin) return route.continue(); external.push(address); return route.abort(); });
  if (fallback) await context.addInitScript(() => Object.defineProperty(window, 'AudioWorkletNode', { value: undefined, configurable: true }));
  const page = await context.newPage(); page.on('pageerror', error => errors.push({ check: activeCheck, message: error.message, stack: error.stack?.split('\n').slice(0, 7).join('\n') }));
  await page.goto(url, { waitUntil: 'load' }); await page.waitForFunction(() => window.LoomApp && window.LoomPedalMidi && typeof LoomApp.engine.startPedalMidi === 'function');
  await page.evaluate(() => {
    window.midiQA = {
      blank() { const s = LoomSchema.defaultState(); Object.assign(s, { tempo: 123, lengthBars: 4, loopEnabled: false, loopStart: 0, loopEnd: 16 }); s.recording.punchEnd = 16; for (const owner of [...s.tracks, ...s.returns, s.master]) { owner.effects.fill(null); owner.automation = []; owner.level = 1; owner.mute = false; if ('pan' in owner) owner.pan = 0; } for (const track of s.tracks) { track.clips = []; track.instrumentLive = false; track.sends = [0, 0]; } s.lfos.forEach(l => { l.enabled = false; l.routes = []; }); for (const index of [0, 1]) s.tracks[index].effects[0] = LoomSchema.effect({ type: 'ferment', params: { mode: 'track', inputRange: 'auto', gate: -60, register: 'bass', mix: 1 } }); return s; },
      async setup(profile) { await LoomApp.loadState(this.blank()); LoomApp.selectEffect(0, 'track-1'); if (profile) await LoomApp.engine.applyAudioSettings({ ...LoomApp.engine.getAudioSettings(), latencyProfile: profile }); await LoomApp.engine.init(); await LoomApp.engine.context.resume(); LoomApp.engine.seek(1); },
      async strings(trackId = 'track-1') {
        const engine = LoomApp.engine, context = engine.context, rate = context.sampleRate, seconds = 3.9, specs = [[40, .08, .45, .08], [45, .85, .5, .12], [52, 1.6, .45, .055], [52, 2.35, .4, .1], [64, 3.1, .45, .05]], buffer = context.createBuffer(2, Math.round(seconds * rate), rate);
        for (const [pitch, onset, duration, gain] of specs) { const start = Math.round(onset * rate), frames = Math.round(duration * rate), hz = 440 * 2 ** ((pitch - 69) / 12); for (let i = 0; i < frames; i++) { const t = i / rate, fade = Math.min(1, i / (rate * .001), (frames - i) / (rate * .003)), phase = 2 * Math.PI * hz * t, value = gain * fade * Math.exp(-t / 1.5) * (Math.sin(phase) + .32 * Math.sin(2 * phase + .2) + .14 * Math.sin(3 * phase + .4)); for (let c = 0; c < 2; c++) buffer.getChannelData(c)[start + i] += value; } }
        const source = context.createBufferSource(); source.buffer = buffer; source.connect(engine.getTrackInput(trackId)); const scheduled = context.currentTime + .04; source.start(scheduled);
        await new Promise(resolve => { source.onended = () => { source.disconnect(); resolve(); }; }); await new Promise(resolve => setTimeout(resolve, 100)); return { specs, scheduled, sampleRate: rate };
      },
      take() { return LoomApp.engine.getPedalMidiTake(); }
    };
  }); return { context, page };
}
async function dispose(h) { await h.page.evaluate(async () => { await LoomApp.engine.stopPedalMidi(); await LoomApp.engine.dispose(); }).catch(() => {}); await h.context.close(); }
async function folded(page) { const panel = page.locator('#fermentMidiPanel'); await panel.scrollIntoViewIfNeeded(); if (!await panel.evaluate(e => e.open)) await panel.locator('summary').click(); return panel; }
async function capture(page) {
  await folded(page);
  const before = await page.evaluate(() => { const engine = LoomApp.engine, diagnostics = engine.getAudioDiagnostics(); if (engine.mode === 'fallback') window.midiNodeBefore = { context: engine.context, input: engine.getTrackInput('track-1'), core: engine.core, dsp: engine.core.slots[0][0].dsp }; return { mode: engine.mode, frames: diagnostics.processingFrames, settings: engine.getAudioSettings(), needsBuffer: engine.mode === 'fallback' && diagnostics.processingFrames < 1024 }; });
  await page.locator('#fermentMidiStart').click(); await page.waitForFunction(() => midiQA.take()?.capturing);
  if (before.needsBuffer) { const active = await page.evaluate(() => ({ frames: LoomApp.engine.getAudioDiagnostics().processingFrames, settings: LoomApp.engine.getAudioSettings(), identity: LoomApp.engine.context === midiNodeBefore.context && LoomApp.engine.getTrackInput('track-1') === midiNodeBefore.input && LoomApp.engine.core === midiNodeBefore.core && LoomApp.engine.core.slots[0][0].dsp === midiNodeBefore.dsp })); assert(active.frames >= 1024, 'Fallback capture must reserve a reliable processing buffer'); assert(active.identity, 'Buffer preparation replaced context, input routing, Core or synth state'); assert.deepEqual(active.settings, before.settings, 'Capture changed interface preferences'); }
  const fixture = await page.evaluate(() => midiQA.strings()); await page.locator('#fermentMidiStop').click(); await page.waitForFunction(() => midiQA.take() && !midiQA.take().capturing);
  const take = await page.evaluate(() => midiQA.take()), diagnostics = await page.evaluate(() => LoomApp.engine.getAudioDiagnostics()); fs.writeFileSync(path.join(artifacts, diagnostics.mode + '-capture.json'), JSON.stringify({ take, fixture, diagnostics }, null, 2) + '\n');
  if (before.needsBuffer) { assert.equal(diagnostics.processingFrames, before.frames, 'Stop did not restore the previous fallback buffer'); assert.deepEqual(await page.evaluate(() => LoomApp.engine.getAudioSettings()), before.settings); }
  const probe = await page.evaluate(() => window.midiRawProbe ? { samples: Array.from(midiRawProbe.pcm.subarray(0, midiRawProbe.frames)), callbacks: midiRawProbe.callbacks, rate: midiRawProbe.rate } : null);
  if (probe) { fs.writeFileSync(path.join(artifacts, 'fallback-input.f32'), Buffer.from(Float32Array.from(probe.samples).buffer)); fs.writeFileSync(path.join(artifacts, 'fallback-input.json'), JSON.stringify({ ...probe, samples: undefined, take, fixture }, null, 2) + '\n'); }
  assert.deepEqual(take.notes.map(note => note.pitch), fixture.specs.map(note => note[0])); assert.equal(take.ownerId, 'track-1'); assert.equal(take.slot, 0); assert.equal(take.tempo, 123); assert(take.frames > 3.8 * take.sampleRate); for (const note of take.notes) { assert(note.endFrame > note.startFrame); assert(note.endFrame <= take.frames); assert(note.velocity > 0 && note.velocity <= 1); } return { take, fixture };
}
async function downloads(page, take) {
  const midiEvent = page.waitForEvent('download'); await page.locator('#fermentMidiSave').click(); const midi = await midiEvent; assert.match(midi.suggestedFilename(), /\.mid$/); const bytes = fs.readFileSync(await midi.path()), parsed = decodeMidi(bytes); assert(Math.abs(parsed.bpm - take.tempo) < .001); assert.deepEqual(parsed.notes.map(note => note.pitch), take.notes.map(note => note.pitch));
  for (let i = 0; i < take.notes.length; i++) { const expected = take.notes[i], actual = parsed.notes[i]; assert(Math.abs(actual.start / parsed.ppq - expected.startFrame / take.sampleRate * take.tempo / 60) <= 1 / parsed.ppq); assert(Math.abs(actual.end / parsed.ppq - expected.endFrame / take.sampleRate * take.tempo / 60) <= 1 / parsed.ppq); }
  fs.writeFileSync(path.join(artifacts, 'captured-input.mid'), bytes);
  const patternEvent = page.waitForEvent('download'); await page.locator('#fermentMidiPattern').click(); const patternDownload = await patternEvent, packet = JSON.parse(fs.readFileSync(await patternDownload.path(), 'utf8')); assert.equal(packet.format, 'musiclab-pattern'); assert.equal(packet.tempo, take.tempo); assert.equal(packet.notes.length, take.notes.length); assert.deepEqual(packet.notes.map(note => note.pitch), take.notes.map(note => note.pitch)); assert(packet.notes[0].beat > 0, 'Leading silence must be retained by default');
  await page.locator('#fermentMidiTrim').check(); await page.locator('#fermentMidiSnap').selectOption('0.25'); const snapEvent = page.waitForEvent('download'); await page.locator('#fermentMidiSave').click(); const snap = decodeMidi(fs.readFileSync(await (await snapEvent).path())); assert.equal(snap.notes[0].start, 0); assert(snap.notes.every(note => note.start % (snap.ppq / 4) === 0));
  return { midiBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), parsed: { bpm: parsed.bpm, ppq: parsed.ppq, notes: parsed.notes }, patternNotes: packet.notes.length, explicitTrimQuantize: true };
}
async function coldStart(url, fallback) {
  const name = 'Cold Start initializes ' + (fallback ? 'fallback' : 'Worklet') + ' capture without a preopened audio engine';
  if (process.env.PEDAL_MIDI_BROWSER_FILTER && !new RegExp(process.env.PEDAL_MIDI_BROWSER_FILTER).test(name)) return;
  const h = await pageFor(url, fallback);
  try { await check(name, async () => {
    await h.page.evaluate(async () => { await LoomApp.loadState(midiQA.blank()); LoomApp.selectEffect(0, 'track-1'); });
    assert.equal(await h.page.evaluate(() => LoomApp.engine.context), null, 'Cold Start fixture initialized audio too early');
    await folded(h.page); await h.page.locator('#fermentMidiStart').click(); await h.page.waitForFunction(() => midiQA.take()?.capturing, null, { timeout: 10000 });
    const armed = await h.page.evaluate(() => { window.midiColdContext = LoomApp.engine.context; return { mode: LoomApp.engine.mode, frames: LoomApp.engine.getAudioDiagnostics().processingFrames, notes: midiQA.take().notes.length }; });
    assert.equal(armed.mode, fallback ? 'fallback' : 'worklet'); assert.equal(armed.notes, 0); if (fallback) assert(armed.frames >= 1024);
    await h.page.locator('#fermentMidiStop').click(); await h.page.waitForFunction(() => midiQA.take() && !midiQA.take().capturing); const stopped = await h.page.evaluate(() => ({ take: midiQA.take(), sameContext: LoomApp.engine.context === midiColdContext, frames: LoomApp.engine.getAudioDiagnostics().processingFrames }));
    assert.equal(stopped.take.notes.length, 0); assert(stopped.sameContext); if (fallback) assert.equal(stopped.frames, 256); return { ...armed, stopped: true, notes: 0, sameContext: stopped.sameContext, restoredFrames: stopped.frames };
  }); } finally { await dispose(h); }
}
async function run() {
  const url = process.argv[2] || process.env.PEDAL_MIDI_QA_URL || await serve(); browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await coldStart(url, false); await coldStart(url, true);
    const h = await pageFor(url), { page } = h;
    try {
      await check('Folded FERMENT MIDI panel captures real raw guitar and bass input through AudioWorklet', async () => { await page.evaluate(() => midiQA.setup()); assert.equal(await page.locator('#fermentMidiPanel').evaluate(e => e.open), false); const result = await capture(page); assert.equal(await page.evaluate(() => LoomApp.engine.mode), 'worklet'); assert.equal(await page.locator('#fermentMidiCount').textContent(), '5'); assert.equal(await page.locator('#fermentMidiStart').isEnabled(), true); assert.equal(await page.locator('#fermentMidiStop').isEnabled(), false); return { notes: result.take.notes, frames: result.take.frames, rate: result.take.sampleRate }; });
      await check('Real UI MIDI and Kitchen pattern downloads preserve tempo pitches timing and explicit edits', async () => downloads(page, await page.evaluate(() => midiQA.take())));
      await check('Completed takes survive editor disposal and place notes on an explicitly chosen instrument track', async () => {
        const before = await page.evaluate(() => midiQA.take()); await page.evaluate(() => LoomApp.selectEffect(0, 'track-2')); await folded(page); assert.equal(await page.locator('#fermentMidiCount').textContent(), '5'); assert.deepEqual(await page.evaluate(() => midiQA.take()), before);
        for (let i = 0; i < 4; i++) await page.evaluate(i => LoomApp.selectEffect(0, i % 2 ? 'track-2' : 'track-1'), i); await folded(page);
        await page.evaluate(() => { const tempo = document.querySelector('#tempo'); tempo.value = '150'; tempo.dispatchEvent(new Event('change', { bubbles: true })); });
        const listeners = await page.evaluate(() => LoomApp.engine._pedalMidiListeners.size); assert(listeners <= 1, 'Old editor panels retained engine subscriptions'); await page.locator('#fermentMidiTarget').selectOption('track-10'); await page.locator('#fermentMidiPlace').click(); await page.waitForFunction(() => LoomApp.getState().tracks[9].clips.some(clip => clip.type === 'notes'));
        const result = await page.evaluate(() => ({ tracks: LoomApp.getState().tracks.map(track => ({ id: track.id, instrument: track.instrument?.id, effects: track.effects, notes: track.clips.filter(clip => clip.type === 'notes').map(clip => ({ start: clip.start, pattern: clip.pattern, pitches: clip.pattern.notes.map(note => note.pitch) })) })), take: midiQA.take() })), placed = result.tracks[9].notes.at(-1);
        assert.deepEqual(placed.pitches, before.notes.map(note => note.pitch)); assert.equal(result.tracks[0].notes.length, 0); assert.equal(result.tracks[1].notes.length, 0); assert.equal(result.tracks[9].instrument, 'citrus'); assert(result.tracks[9].effects.every(effect => effect === null)); assert.equal(placed.start, before.startBeat); assert.equal(result.take.token, before.token); assert.equal(placed.pattern.tempo, 150);
        for (let i = 0; i < before.notes.length; i++) { assert(Math.abs(placed.pattern.notes[i].beat / 2.5 - before.notes[i].startFrame / before.sampleRate) < 1e-6); assert(Math.abs(placed.pattern.notes[i].duration / 2.5 - (before.notes[i].endFrame - before.notes[i].startFrame) / before.sampleRate) < 1e-6); }
        return { captureOwner: before.ownerId, destination: 'track-10', listeners, placedPitches: placed.pitches, startBeat: before.startBeat, captureTempo: before.tempo, currentTempo: placed.pattern.tempo, secondsPreserved: true };
      });
      await check('Capture is runtime-only and a new project clears it without serializing session flags', async () => {
        const state = await page.evaluate(() => LoomApp.getState()); const captureKeys = value => value && typeof value === 'object' ? Object.entries(value).flatMap(([key, item]) => /pedalMidi|captureToken|capturing|startFrame|endFrame/.test(key) ? [key] : captureKeys(item)) : []; assert.deepEqual(captureKeys(state), []);
        await page.evaluate(() => LoomApp.loadState(midiQA.blank())); assert.equal(await page.evaluate(() => midiQA.take()), null); return { captureFieldsInProject: 0, replacementClearsTake: true };
      });
      await check('MIDI panel fits phone tablet and desktop and rejects Chord Texture capture', async () => {
        await page.evaluate(() => LoomApp.selectEffect(0, 'track-1')); await folded(page);
        for (const width of [390, 768, 1440]) { await page.setViewportSize({ width, height: 1100 }); await folded(page); const overflow = await page.locator('#fermentMidiPanel').evaluate(element => [...element.querySelectorAll('button,input,select,output')].filter(node => { const r = node.getBoundingClientRect(); return r.width && (r.left < -1 || r.right > innerWidth + 1); }).map(node => node.id)); assert.deepEqual(overflow, []); await page.locator('#fermentMidiPanel').screenshot({ path: path.join(artifacts, 'ferment-midi-' + width + '.png') }); }
        await page.locator('#fx-mode').selectOption('chord'); await folded(page); await page.locator('#fermentMidiStart').click(); await page.waitForFunction(() => /Pitch Tracking/.test(document.querySelector('#fermentMidiStatus').textContent)); assert(!await page.evaluate(() => midiQA.take()?.capturing)); return { widths: [390, 768, 1440], chordRejected: true };
      });
    } finally { await dispose(h); }
    for (let attempt = 1; attempt <= Number(process.env.PEDAL_MIDI_FALLBACK_REPETITIONS || 1); attempt++) {
    const fallback = await pageFor(url, true);
    try { await check('ScriptProcessor fallback captures the same single played line and flushes on Panic' + (process.env.PEDAL_MIDI_FALLBACK_REPETITIONS ? ' · cold context ' + attempt : ''), async () => {
      await fallback.page.evaluate(profile => midiQA.setup(profile), process.env.PEDAL_MIDI_QA_FALLBACK_PROFILE || null);
      if (process.env.PEDAL_MIDI_DIAGNOSTIC) await fallback.page.evaluate(() => {
        const engine = LoomApp.engine, dsp = engine.core.slots[0][0].dsp, process = dsp.process.bind(dsp), start = dsp.startMidiCapture.bind(dsp), callback = engine.node.onaudioprocess;
        window.midiRawProbe = { pcm: new Float32Array(Math.ceil(engine.context.sampleRate * 1.2)), frames: 0, rate: engine.context.sampleRate, active: false, callbacks: [] };
        dsp.startMidiCapture = options => { midiRawProbe.frames = 0; midiRawProbe.active = true; return start(options); };
        dsp.process = (left, right, context) => { if (midiRawProbe.active && midiRawProbe.frames < midiRawProbe.pcm.length) { const count = Math.min(left.length, midiRawProbe.pcm.length - midiRawProbe.frames); midiRawProbe.pcm.set(left.subarray(0, count), midiRawProbe.frames); midiRawProbe.frames += count; } return process(left, right, context); };
        engine.node.onaudioprocess = event => { if (midiRawProbe.active && midiRawProbe.frames < midiRawProbe.pcm.length) midiRawProbe.callbacks.push({ frame: midiRawProbe.frames, playbackTime: event.playbackTime, currentTime: engine.context.currentTime }); return callback(event); };
      });
      const result = await capture(fallback.page); fs.copyFileSync(path.join(artifacts, 'fallback-capture.json'), path.join(artifacts, 'fallback-capture-' + attempt + '.json')); assert.equal(await fallback.page.evaluate(() => LoomApp.engine.mode), 'fallback'); await fallback.page.evaluate(async () => { await LoomApp.engine.startPedalMidi('track-1', 0); const context = LoomApp.engine.context, source = context.createOscillator(); source.frequency.value = 110; source.connect(LoomApp.engine.getTrackInput('track-1')); source.start(); await new Promise(resolve => setTimeout(resolve, 350)); LoomApp.engine.panic(); source.stop(); source.disconnect(); }); await fallback.page.waitForFunction(() => midiQA.take() && !midiQA.take().capturing); const panic = await fallback.page.evaluate(() => midiQA.take()); assert(panic.notes.some(note => note.pitch === 45)); assert.equal(panic.reason, 'panic'); return { originalPitches: result.take.notes.map(note => note.pitch), panicNotes: panic.notes, reason: panic.reason, profile: process.env.PEDAL_MIDI_QA_FALLBACK_PROFILE || 'default', coldContext: attempt };
    }); } finally { await dispose(fallback); }
    }
    assert.deepEqual(errors, [], 'No hidden browser errors'); assert.deepEqual(external, [], 'No external runtime downloads'); save(); console.log('PASS no hidden browser errors or external dependencies');
  } finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
}
if (require.main === module) run().catch(error => { fs.writeFileSync(path.join(artifacts, 'failure.json'), JSON.stringify({ error: error.stack || String(error), passed, errors, external }, null, 2) + '\n'); console.error(error); process.exitCode = 1; });
