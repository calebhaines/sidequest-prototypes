'use strict';

// Chromium runs the actual Web Audio graph, serialized Worklet, fallback and
// standalone controls. Interface permission and signals are simulated; this
// measures application behavior, not a physical audio interface's latency.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const shared = fs.existsSync(path.join(__dirname, 'shared')) ? path.join(__dirname, 'shared') : path.join(root, 'shared');
const passed = [], measurements = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function serve() {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/loom/index.html' && process.env.LOOM_VOCAL_QA_PREVIEW) {
      response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); response.end(fs.readFileSync(process.env.LOOM_VOCAL_QA_PREVIEW)); return;
    }
    if (pathname === '/engine.html') {
      response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      response.end('<!doctype html><html><body><script src="/shared/pattern-schema.js"></script>' + ['vocal-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'effects.js', 'schema.js', 'audio-engine.js'].map(file => '<script src="/loom/' + file + '"></script>').join('') + '</body></html>'); return;
    }
    const base = pathname.startsWith('/loom/') ? __dirname : pathname.startsWith('/shared/') ? shared : root;
    const relative = pathname.startsWith('/loom/') ? pathname.slice(5) : pathname.startsWith('/shared/') ? pathname.slice(7) : pathname;
    const file = path.resolve(base, '.' + relative + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(base + path.sep)) { response.writeHead(403); response.end(); return; }
    fs.readFile(file, (error, contents) => { if (error) { response.writeHead(404); response.end(); return; } response.writeHead(200, { 'Content-Type': path.extname(file) === '.html' ? 'text/html' : path.extname(file) === '.css' ? 'text/css' : 'application/javascript', 'Cache-Control': 'no-store' }); response.end(contents); });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: 'http://127.0.0.1:' + server.address().port, close: () => new Promise(resolve => server.close(resolve)) };
}

async function install(page, { ui = false, fallback = false, channel = '1', rate = 48000 } = {}) {
  await page.evaluate(async ({ ui, fallback, channel, rate }) => {
    if (fallback) window.AudioWorkletNode = undefined;
    const state = window.LoomSchema.defaultState(); state.tempo = 240; state.loopEnabled = false; state.master.level = 1; state.recording.micCompensation = 'off'; state.tracks.forEach(t => { t.level = 1; t.instrumentLive = false; });
    if (ui) await window.LoomApp.loadState(state);
    const engine = ui ? window.LoomApp.engine : new window.LoomAudio(state); window.qaEngine = engine;
    await engine.applyAudioSettings({ inputDeviceId: 'vocal-interface', inputChannel: channel, sampleRate: rate, latencyProfile: 'live' }); await engine.init(); await engine.context.resume();
    window.qaVocal = { requests: [], streams: [], sources: [], pending: false };
    window.qaVocal.makeStream = () => {
      const context = engine.context, destination = context.createMediaStreamDestination(), merger = context.createChannelMerger(2);
      destination.channelCount = 2; destination.channelCountMode = 'explicit'; merger.connect(destination);
      for (const [jack, frequency, level] of [[0, 220, .14], [0, 440, .018], [0, 660, .01], [1, 337, .17]]) { const oscillator = context.createOscillator(), gain = context.createGain(); oscillator.frequency.value = frequency; gain.gain.value = level; oscillator.connect(gain); gain.connect(merger, 0, jack); oscillator.start(); window.qaVocal.sources.push({ oscillator, gain, frequency, jack }); }
      const stream = destination.stream, track = stream.getAudioTracks()[0], original = track.getSettings.bind(track); track.getSettings = () => ({ ...original(), channelCount: 2, latency: .011, deviceId: 'vocal-interface', sampleRate: context.sampleRate }); window.qaVocal.streams.push(stream); return stream;
    };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async constraints => { window.qaVocal.requests.push(constraints); if (window.qaVocal.pending) await new Promise(resolve => { window.qaVocal.resolve = resolve; }); return window.qaVocal.makeStream(); } });
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', { configurable: true, value: async () => [{ kind: 'audioinput', deviceId: 'default', label: 'Default input', groupId: 'default' }, { kind: 'audioinput', deviceId: 'vocal-interface', label: 'QA two-channel vocal interface', groupId: 'vocal' }, { kind: 'audiooutput', deviceId: 'default', label: 'Default output', groupId: 'default' }] });
    const analyser = engine.context.createAnalyser(); analyser.fftSize = 32768; analyser.smoothingTimeConstant = 0; engine.node.connect(analyser); window.qaAnalyser = analyser;
    window.qaSpectrum = () => { const audio = new Float32Array(analyser.fftSize), bins = new Float32Array(analyser.frequencyBinCount); analyser.getFloatTimeDomainData(audio); analyser.getFloatFrequencyData(bins); const amplitude = frequency => { const bin = Math.round(frequency * analyser.fftSize / engine.context.sampleRate); return 10 ** (Math.max(...bins.slice(Math.max(0, bin - 2), bin + 3)) / 20); }; return { rms: Math.sqrt(audio.reduce((sum, x) => sum + x * x, 0) / audio.length), f110: amplitude(110), f220: amplitude(220), f337: amplitude(337), f440: amplitude(440), f660: amplitude(660), f880: amplitude(880), f7500: amplitude(7500) }; };
    window.qaProjection = (audio, frequency, rate) => { let a = 0, b = 0; for (let i = 0; i < audio.length; i++) { a += audio[i] * Math.cos(2 * Math.PI * frequency * i / rate); b += audio[i] * Math.sin(2 * Math.PI * frequency * i / rate); } return 2 * Math.hypot(a, b) / audio.length; };
    window.qaSetGlaze = params => { const def = window.LoomEffectsCatalog.find(f => f.id === 'glaze'); engine.state.tracks[0].effects[0] = window.LoomSchema.effect({ type: 'glaze', params: { ...def.defaults, ...params } }); engine.setState(engine.state); };
    window.qaFlat = { clean: 'off', deess: 'off', compressor: 'off', eq: 'off', guard: 'off', input: 0, output: 0, mix: 1 };
  }, { ui, fallback, channel, rate });
}

async function engineChecks(browser, url, fallback, rate) {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url + '/engine.html'); await install(page, { fallback, rate });
    await page.evaluate(() => window.qaSetGlaze({})); await page.evaluate(() => window.qaEngine.setMicrophoneMonitoring('track-1', { enabled: true })); await wait(800);
    const clean = await page.evaluate(() => ({ spectrum: window.qaSpectrum(), diagnostics: window.qaEngine.getAudioDiagnostics(), meters: window.qaEngine.getMeters(), playing: window.qaEngine.getTransport().playing }));
    assert.equal(clean.meters.mode, fallback ? 'fallback' : 'worklet');
    assert.equal(clean.diagnostics.processingFrames, fallback ? 256 : 128); assert.equal(clean.diagnostics.sampleRate, rate); assert.equal(clean.playing, false); assert(clean.spectrum.rms > .02); assert(clean.spectrum.f220 > clean.spectrum.f337 * 30, 'Only selected input jack reaches GLAZE.');
    const liveMeter = clean.meters.effects?.[0]?.[0]; assert.equal(liveMeter?.type, 'glaze'); assert(Number.isFinite(liveMeter.inputDb) && liveMeter.inputDb > -60 && Number.isFinite(liveMeter.outputDb), 'Real DSP readings cross the audio-thread boundary.');
    passed.push((fallback ? 'Fallback' : 'Worklet') + ' ' + rate + ' Hz real stopped GLAZE monitoring / selected jack / actual meters / processing frames');
    await page.evaluate(() => window.qaSetGlaze({ ...window.qaFlat, pitch: 'shift', semitones: 12, pitchWindow: 40 })); await wait(1100);
    const shifted = await page.evaluate(() => window.qaSpectrum()); assert(shifted.rms > .012); assert(shifted.f440 > shifted.f220 * 3, 'Actual wet monitoring transposes the fundamental: ' + JSON.stringify(shifted));
    await page.evaluate(() => window.qaEngine.startMicrophoneRecording('track-1', { startTransport: false, maxSeconds: .6 })); await page.waitForFunction(() => !window.qaEngine.isRecording, null, { timeout: 6000 });
    const capture = await page.evaluate(async () => { const takes = await window.qaEngine.stopRecording(), take = takes[0]; window.qaTake = take; const left = take.left.subarray(Math.floor(take.sampleRate * .1)); return { frames: take.frames, rate: take.sampleRate, f220: window.qaProjection(left, 220, take.sampleRate), f440: window.qaProjection(left, 440, take.sampleRate), stereoDifference: take.left.reduce((max, x, i) => Math.max(max, Math.abs(x - take.right[i])), 0), finite: [...take.left, ...take.right].every(Number.isFinite), monitor: window.qaEngine.getMicrophoneStatus().enabled }; });
    assert.equal(capture.frames, Math.floor(.6 * rate)); assert(capture.f220 > .1 && capture.f440 < .025, 'Recording retains the original pitch under a transposed live strip.'); assert.equal(capture.stereoDifference, 0); assert.equal(capture.finite, true); assert.equal(capture.monitor, true);
    const render = await page.evaluate(async () => { const take = window.qaTake, e = window.qaEngine, state = window.LoomSchema.defaultState(); state.tempo = 240; state.loopEnabled = false; state.master.level = 1; state.tracks[0].level = 1; state.tracks[0].effects[0] = structuredClone(e.state.tracks[0].effects[0]); const asset = window.LoomSchema.encodeAsset({ left: take.left, right: take.right, sampleRate: take.sampleRate, name: 'Dry vocal', id: 'vocal-take' }); state.assets = [asset]; state.tracks[0].clips = [{ id: 'vocal-clip', name: 'Dry vocal', assetId: asset.id, start: 0, length: 2, sourceStart: 0, sourceEnd: asset.frames / asset.sampleRate, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: 1, fadeIn: 0, fadeOut: 0 }]; const normalized = window.LoomSchema.normalize(state), blob = await e.renderWav(normalized, window.LoomSchema.decodeAssets(normalized.assets), { startBeat: 0, endBeat: 2, tailSeconds: 0, blockSize: 128 }), bytes = new DataView(await blob.arrayBuffer()), samples = new Float32Array((bytes.byteLength - 44) / 4); for (let i = 0; i < samples.length; i++) samples[i] = bytes.getInt16(44 + i * 4, true) / 32768; const stable = samples.subarray(6000); return { rate: bytes.getUint32(24, true), frames: samples.length, f220: window.qaProjection(stable, 220, 48000), f440: window.qaProjection(stable, 440, 48000), finite: [...samples].every(Number.isFinite), bytes: bytes.byteLength }; });
    assert.equal(render.rate, 48000); assert.equal(render.frames, 24000); assert(render.f440 > render.f220 * 3 && render.f440 > .03, 'WAV export applies GLAZE to the reusable dry take.'); assert.equal(render.finite, true);
    passed.push((fallback ? 'Fallback' : 'Worklet') + ' ' + rate + ' Hz real octave-up monitoring / original-pitch dry capture / wet PCM WAV render');
    await page.evaluate(() => window.qaSetGlaze({ ...window.qaFlat, pitch: 'correct', key: 'A', scale: 'minor', speed: 1 })); await wait(1000);
    const tracking = await page.evaluate(() => window.qaEngine.getMeters().effects[0][0]); assert(Math.abs(tracking.detectedHz - 220) < 3 && tracking.confidence > .7, 'Audio-thread pitch detector follows the sung harmonic signal.');
    await page.evaluate(() => window.qaSetGlaze({ ...window.qaFlat, harmony: 'on', harmonyA: -12, harmonyB: 12, harmonyMix: .6, harmonyWidth: 0 })); await wait(1100); const harmony = await page.evaluate(() => window.qaSpectrum()); assert(harmony.f110 > .007 && harmony.f440 > .007 && harmony.f220 > .012, 'Actual added octave voices coexist with dry voice: ' + JSON.stringify(harmony));
    await page.evaluate(() => window.qaSetGlaze({ ...window.qaFlat, robot: 'vocoder', robotMix: 1, carrierNote: 45, carrierChord: 'minor' })); await wait(1000); const robot = await page.evaluate(() => window.qaSpectrum()); assert(robot.rms > .006 && robot.f110 > .001 && robot.f220 > .001, 'Vocoder produces a real carrier shaped by the input voice: ' + JSON.stringify(robot));
    await page.evaluate(() => window.qaSetGlaze({ ...window.qaFlat, pitch: 'shift', semitones: 12, bypass: true })); await wait(1000); const bypass = await page.evaluate(() => window.qaSpectrum()); assert(bypass.f220 > bypass.f440 * 4, 'Bypass removes actual pitch processing.');
    await page.evaluate(() => window.qaEngine.dispose()); assert.deepEqual(errors, []); passed.push((fallback ? 'Fallback' : 'Worklet') + ' ' + rate + ' Hz live detector / two real harmony voices / vocoder carrier / bypass');
  } finally { await page.close(); }
}

async function cpuChecks(browser, url) {
  const page = await browser.newPage();
  try {
    await page.goto(url + '/engine.html');
    const results = await page.evaluate(() => {
      const result = [], def = window.LoomEffectsCatalog.find(f => f.id === 'glaze');
      for (const rate of [44100, 48000, 96000]) for (const ambitious of [false, true]) {
        const params = { ...def.defaults, ...(ambitious ? { pitch: 'correct', harmony: 'on', robot: 'vocoder', delay: 'on', reverb: 'on', doubler: 'on', chop: 'on', vowel: 'ah', saturation: 'warm' } : {}) };
        const fx = window.createLoomEffectsDSP(window.createLoomVocalDSP).create('glaze', rate, params), a = new Float32Array(128), b = new Float32Array(128), times = [];
        let phase = 0;
        const fill = () => { for (let i = 0; i < 128; i++) { const v = .15 * Math.sin(phase) + .025 * Math.sin(phase * 2) + .01 * Math.sin(phase * 3); a[i] = b[i] = v; phase += 2 * Math.PI * 220 / rate; } };
        for (let block = 0; block < 500; block++) { fill(); fx.process(a, b, { tempo: 120, playing: false }); }
        for (let block = 0; block < 1500; block++) { fill(); const start = performance.now(); fx.process(a, b, { tempo: 120, playing: false }); times.push(performance.now() - start); }
        const sorted = times.slice().sort((a, b) => a - b), average = times.reduce((a, b) => a + b, 0) / times.length;
        result.push({ rate, stages: ambitious ? 'all stages incl. correction/harmony/vocoder' : 'clean lead', blockMs: 128 * 1000 / rate, averageMs: average, p95Ms: sorted[Math.floor(sorted.length * .95)], p99Ms: sorted[Math.floor(sorted.length * .99)], worstObservedMs: sorted.at(-1), detectedHz: fx.getMeters().detectedHz, confidence: fx.getMeters().confidence });
      }
      const fx = window.createLoomEffectsDSP(window.createLoomVocalDSP).create('glaze', 48000, def.defaults), a = new Float32Array(128), b = new Float32Array(128); a[0] = b[0] = .1; fx.process(a, b, { tempo: 120 }); const immediate = Math.abs(a[0]) > .001;
      return { result, immediate };
    });
    assert.equal(results.immediate, true, 'The practical default strip responds to an impulse on its first frame.');
    // Main-thread wall-clock maxima include OS scheduling and concurrent QA.
    // Report those values; use representative cost to detect DSP regressions.
    for (const result of results.result) { assert(result.averageMs < result.blockMs * .7, 'A single strip fits the render deadline with useful headroom.'); assert(result.p95Ms < result.blockMs, 'Representative blocks fit the 128-frame processing budget: ' + JSON.stringify(result)); measurements.push(result); }
    passed.push('Chromium warmed 128-frame CPU at 44.1 / 48 / 96 kHz including pitch-analysis blocks / immediate practical default');
  } finally { await page.close(); }
}

async function dynamicsChecks(browser, url, fallback) {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url + '/engine.html'); await install(page, { fallback }); await page.evaluate(async () => { window.qaSetGlaze(window.qaFlat); await window.qaEngine.setMicrophoneMonitoring('track-1', { enabled: true }); const hiss = window.qaVocal.sources.find(source => source.frequency === 660); hiss.oscillator.frequency.value = 7500; hiss.gain.gain.value = .12; }); await wait(900);
    const raw = await page.evaluate(() => window.qaSpectrum());
    await page.evaluate(() => window.qaSetGlaze({ ...window.qaFlat, deess: 'on', deessFreq: 6500, deessThreshold: -42, deessAmount: 1 })); await wait(900); const deessed = await page.evaluate(() => ({ spectrum: window.qaSpectrum(), meter: window.qaEngine.getMeters().effects[0][0] }));
    assert(deessed.spectrum.f7500 < raw.f7500 * .65, 'De-essing reduces actual high-frequency energy.'); assert(deessed.spectrum.f220 > raw.f220 * .9, 'De-essing preserves the lower voice rather than turning the whole phrase down.'); assert(deessed.meter.deessDb > 3, 'De-essing telemetry follows the measured reduction.');
    await page.evaluate(() => window.qaSetGlaze({ ...window.qaFlat, compressor: 'on', threshold: -35, ratio: 8, attack: .2, release: 80, makeup: 0 })); await wait(900); const contained = await page.evaluate(() => ({ spectrum: window.qaSpectrum(), meter: window.qaEngine.getMeters().effects[0][0] })); assert(contained.spectrum.rms < raw.rms * .45, 'The compressor contains the actual vocal signal.'); assert(contained.meter.reductionDb > 8, 'Compression readings reflect substantial audible level reduction.');
    await page.evaluate(() => window.qaEngine.dispose()); assert.deepEqual(errors, []); passed.push((fallback ? 'Fallback' : 'Worklet') + ' real high-band de-essing preserves low voice / real compression / measured gain-reduction telemetry');
  } finally { await page.close(); }
}

async function helpUiChecks(browser, url) {
  const stages = ['clean', 'deess', 'compressor', 'eq', 'saturation', 'pitch', 'harmony', 'doubler', 'vowel', 'robot', 'chop', 'delay', 'reverb', 'output'];
  // This is the released 1.9 control/recipe contract, independent of help copy.
  const contractHash = '06a5ddb84c4cd0366f962ad6ae3e2b964ff8add0ece5b79d1d8c2ab2a3342c9e';
  const concepts = {
    clean: [/input.*trim|trim.*input/i, /low.cut|high.pass/i, /gate/i], deess: [/sibilan/i, /threshold/i, /frequenc/i],
    compressor: [/threshold/i, /ratio/i, /attack/i, /release/i, /makeup/i], eq: [/body/i, /low.middle/i, /presence/i, /air/i],
    saturation: [/warm glaze/i, /hard caramel/i, /folded sugar/i, /drive/i, /blend/i],
    pitch: [/transpose/i, /scale correction/i, /single|monophonic/i, /key|root/i, /strength/i, /window/i, /delay/i],
    harmony: [/interval/i, /window/i, /width|spread/i], doubler: [/short|delay/i, /drift|detune/i, /width/i],
    vowel: [/resonan|filter/i, /vowel/i, /shift/i], robot: [/ring/i, /vocoder/i, /twelve|12/i, /carrier/i, /note/i, /chord/i],
    chop: [/tempo/i, /depth/i, /smooth/i], delay: [/clock|sync/i, /milliseconds/i, /feedback/i, /tone/i, /duck/i],
    reverb: [/size/i, /decay/i, /pre.delay/i, /tone/i, /width/i, /duck/i], output: [/ceiling/i, /output/i, /dry.*wet/i]
  };
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } }); const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(url + '/loom/index.html'); await page.waitForFunction(() => !!window.LoomApp); await install(page, { ui: true, channel: '2' });
      await page.locator('#audioSettingsButton').click(); await page.locator('#vocalPracticeButton').click(); await page.waitForFunction(() => window.LoomApp.engine.getMicrophoneStatus().enabled); await wait(600); await page.locator('[data-vocal-view="basic"]').click();
      const before = await page.evaluate(() => { const definition = window.LoomEffectsCatalog.find(f => f.id === 'glaze'); return { contract: { params: definition.params, defaults: definition.defaults, presets: definition.presets }, params: window.LoomApp.getState().tracks[0].effects[0].params, playing: window.LoomApp.engine.getTransport().playing, mode: window.LoomApp.engine.mode, meter: window.LoomApp.engine.getMeters().effects?.[0]?.[0] }; });
      assert.equal(createHash('sha256').update(JSON.stringify(before.contract)).digest('hex'), contractHash, 'Adding explanations must preserve every released parameter, range, default, and recipe.'); assert.equal(before.mode, 'worklet'); assert.equal(before.playing, false); assert.equal(before.meter?.type, 'glaze'); assert(Number.isFinite(before.meter.inputDb) && before.meter.inputDb > -60);
      assert.equal(await page.locator('#effectEditor [data-effect-param]').count(), 25); assert.equal(await page.locator('[data-vocal-group]').count(), 14);
      const helpNames = await page.locator('.vocal-stage-help > summary').evaluateAll(elements => elements.map(el => el.getAttribute('aria-label'))); assert(helpNames.every(name => /how.*works:/i.test(name || ''))); assert.equal(new Set(helpNames).size, 14, 'Each help disclosure has a distinct accessible name.');
      for (const id of stages) {
        const group = page.locator('[data-vocal-group="' + id + '"]'), overview = group.locator('.vocal-group-note'), disclosure = group.locator('details'), summary = disclosure.locator('summary');
        assert.equal(await overview.isVisible(), true, id + ' overview remains visible when its stage is off.'); assert((await overview.textContent()).trim().length > 45, id + ' has an explanatory overview, not just an instruction to enable it.'); assert.equal(await disclosure.count(), 1); assert.match(await summary.textContent(), /how.*work|how.*use/i);
        assert.equal(await summary.evaluate(el => el.tabIndex >= 0), true, 'Help is available in the keyboard tab order.'); assert.equal(await disclosure.evaluate(el => el.open), false); await summary.focus(); await page.keyboard.press('Enter'); assert.equal(await disclosure.evaluate(el => el.open), true, id + ' help opens with Enter.'); await page.keyboard.press('Space'); assert.equal(await disclosure.evaluate(el => el.open), false, id + ' help closes with Space.'); await page.keyboard.press('Enter'); assert.equal(await disclosure.evaluate(el => el.open), true);
        const text = await disclosure.textContent(); for (const concept of concepts[id]) assert.match(text, concept, id + ' explains ' + concept);
        assert.equal(await disclosure.locator('input,select').count(), 0, 'Reading help is independent of changing audio settings.');
      }
      const after = await page.evaluate(() => ({ params: window.LoomApp.getState().tracks[0].effects[0].params, playing: window.LoomApp.engine.getTransport().playing, mic: window.LoomApp.engine.getMicrophoneStatus(), layout: (() => { const editor = document.getElementById('effectEditor'); return { document: document.documentElement.scrollWidth, width: innerWidth, editorClient: editor.clientWidth, editorScroll: editor.scrollWidth, overflow: [...editor.querySelectorAll('details,.vocal-group-note')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.closest('[data-vocal-group]').dataset.vocalGroup) }; })() }));
      assert.deepEqual(after.params, before.params, 'Opening and closing every explanation leaves the vocal recipe untouched.'); assert.equal(after.playing, false, 'Help keyboard actions must not start or stop transport.'); assert.equal(after.mic.enabled, true); assert.equal(after.mic.interface.settings.inputChannel, '2'); assert(after.layout.document <= width + 1 && after.layout.editorScroll <= after.layout.editorClient + 1, 'Expanded help fits ' + width + ' px.'); assert.deepEqual(after.layout.overflow, []);
      if (process.env.LOOM_VOCAL_QA_SCREENSHOTS) { await page.locator('[data-vocal-group="pitch"]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(process.env.LOOM_VOCAL_QA_SCREENSHOTS, 'galley-glaze-help-pitch-' + width + '.png') }); await page.locator('[data-vocal-group="robot"]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(process.env.LOOM_VOCAL_QA_SCREENSHOTS, 'galley-glaze-help-robot-' + width + '.png') }); }
      for (const id of stages) { await page.selectOption('#fx-' + (id === 'output' ? 'guard' : id), 'off'); const group = page.locator('[data-vocal-group="' + id + '"]'); assert.equal(await group.locator('.vocal-group-note').isVisible(), true, id + ' explanation is readable with its processing disabled.'); assert.equal(await group.locator('details > summary').isVisible(), true, id + ' help remains reachable while off.'); }
      await page.locator('#effectReset').click();
      await page.locator('[data-vocal-view="advanced"]').click(); const parameters = await page.evaluate(() => [...document.querySelectorAll('#effectEditor [data-effect-param]')].map(el => el.dataset.effectParam).sort()); assert.deepEqual(parameters, before.contract.params.map(p => p.key).sort());
      const missingDescriptions = await page.evaluate(() => [...document.querySelectorAll('#effectEditor [data-effect-param]')].filter(el => { const id = el.getAttribute('aria-describedby'); return !id || !document.getElementById(id)?.matches('.vocal-group-note'); }).map(el => el.dataset.effectParam)); assert.deepEqual(missingDescriptions, [], 'All eighty controls expose the stage explanation to assistive technology.');
      if (width === 1440) for (const recipe of before.contract.presets) { await page.selectOption('#vocalPreset', recipe.id); assert.deepEqual(await page.evaluate(() => window.LoomApp.getState().tracks[0].effects[0].params), recipe.params); }
      assert.deepEqual(errors, []); await page.evaluate(() => window.LoomApp.engine.dispose()); passed.push(width + ' px fourteen always-visible explanations / off-stage help / Enter + Space without transport changes / complete mode guidance / expanded layout / unchanged 80 controls and 14 recipes / real Worklet practice meters');
    } finally { await page.close(); }
  }
}

async function uiChecks(browser, url) {
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } }); const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(url + '/loom/index.html'); await page.waitForFunction(() => !!window.LoomApp); await install(page, { ui: true, channel: '2' });
      await page.locator('#audioSettingsButton').click(); await page.locator('#vocalPracticeButton').click(); await page.waitForFunction(() => window.LoomApp.engine.getMicrophoneStatus().enabled); await wait(800);
      assert.equal(await page.evaluate(() => window.LoomApp.engine.mode), 'worklet', 'The standalone serializes the complete vocal DSP into a real AudioWorklet.');
      const practice = await page.evaluate(() => ({ state: window.LoomApp.getState(), mic: window.LoomApp.engine.getMicrophoneStatus(), audio: window.LoomApp.engine.getAudioSettings(), playing: window.LoomApp.engine.getTransport().playing, meter: window.LoomApp.engine.getMeters().effects?.[0]?.[0] }));
      assert.equal(practice.state.tracks.length, 8); assert(practice.state.tracks.every(t => t.effects.length === 4)); assert.equal(practice.state.tracks[0].effects[0].type, 'glaze'); assert.equal(practice.state.tracks[0].effects[0].params.pitch, 'off'); assert.equal(practice.audio.inputChannel, '2'); assert.equal(practice.mic.trackId, 'track-1'); assert.equal(practice.playing, false); assert.equal(practice.meter?.type, 'glaze');
      const selectedJack = await page.evaluate(() => window.qaSpectrum()); assert(selectedJack.f337 > selectedJack.f220 * 30, 'Vocal practice keeps the chosen interface jack audible.');
      // The practice shortcut selects the insert's inline editor.
      if (!(await page.locator('#effectEditor').isVisible())) { await page.evaluate(() => document.getElementById('audioSettingsDialog').close()); await page.locator('[data-slot="0"]').click(); }
      await page.waitForSelector('#effectEditor.vocal-editor'); await page.locator('[data-vocal-view="basic"]').click(); assert.equal(await page.locator('#effectEditor [data-effect-param]').count(), 25, 'The clean Essentials view starts with eleven main controls and fourteen stage switches.');
      if (process.env.LOOM_VOCAL_QA_SCREENSHOTS) { await page.locator('#effectEditor').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(process.env.LOOM_VOCAL_QA_SCREENSHOTS, 'galley-glaze-essentials-' + width + '.png') }); }
      await page.selectOption('#fx-harmony', 'on'); assert.equal(await page.locator('#fx-pitch').inputValue(), 'off'); assert.equal(await page.locator('#fx-pitchWindow').count(), 1); assert.equal(await page.locator('#fx-pitchWindow').isDisabled(), false, 'Harmony has access to its shared window when the main pitch stage is off.');
      await page.selectOption('#fx-delay', 'on'); await page.selectOption('#fx-delayClock', 'free'); assert.equal(await page.locator('#fx-delayTime').count(), 1); assert.equal(await page.locator('#fx-delayDivision').count(), 0, 'The simple delay view displays the active clock controls.');
      await page.locator('[data-vocal-view="advanced"]').click(); assert.equal(await page.locator('#fx-pitchWindow').isDisabled(), false);
      const controls = await page.evaluate(() => { const editor = document.getElementById('effectEditor'), def = window.LoomEffectsCatalog.find(f => f.id === 'glaze'); return { expected: def.params.map(p => p.key).sort(), actual: [...editor.querySelectorAll('[data-effect-param]')].map(p => p.dataset.effectParam).sort(), presetCount: def.presets.length, options: document.getElementById('vocalPreset').options.length, unlabeled: [...editor.querySelectorAll('input,select')].filter(input => !input.getAttribute('aria-label') && !input.labels?.length).map(input => input.id) }; });
      assert.deepEqual(controls.actual, controls.expected, 'Full pantry exposes every parameter exactly once.'); assert.equal(controls.presetCount, 14); assert.equal(controls.options, 15); assert.deepEqual(controls.unlabeled, []);
      if (width === 1440) { const ids = await page.evaluate(() => window.LoomEffectsCatalog.find(f => f.id === 'glaze').presets.map(p => p.id)); for (const id of ids) { await page.selectOption('#vocalPreset', id); const recipe = await page.evaluate(id => { const params = window.LoomApp.getState().tracks[0].effects[0].params, expected = window.LoomEffectsCatalog.find(f => f.id === 'glaze').presets.find(p => p.id === id).params, roundtrip = window.LoomSchema.parseProject(window.LoomSchema.serializeProject(window.LoomApp.getState())).tracks[0].effects[0].params; return { params, expected, roundtrip }; }, id); assert.deepEqual(recipe.params, recipe.expected); assert.deepEqual(recipe.roundtrip, recipe.params); } }
      await page.selectOption('#vocalPreset', 'locked-glaze'); await page.waitForFunction(() => window.LoomApp.getState().tracks[0].effects[0].params.pitch === 'correct'); assert.match(await page.locator('#vocalLatencyHint').textContent(), /delay|window/i); assert.match(await page.locator('#vocalPresetDescription').textContent(), /single|sung/i);
      await page.locator('#effectBypass').click(); assert.equal(await page.locator('#effectBypass').getAttribute('aria-pressed'), 'true'); await page.locator('#effectReset').click(); assert.equal(await page.evaluate(() => window.LoomApp.getState().tracks[0].effects[0].params.pitch), 'off');
      await page.selectOption('#fx-clean', 'off'); assert.equal(await page.locator('#fx-highpass').isDisabled(), true); assert.equal(await page.locator('#fx-input').isDisabled(), false); await page.selectOption('#fx-guard', 'off'); assert.equal(await page.locator('#fx-output').isDisabled(), false); assert.equal(await page.locator('#fx-mix').isDisabled(), false);
      await page.selectOption('#vocalPreset', 'intercom-choir'); await wait(800);
      const layout = await page.evaluate(() => { const dialog = document.getElementById('effectDialog'), editor = document.getElementById('effectEditor'); return { document: document.documentElement.scrollWidth, width: innerWidth, dialogClient: dialog.clientWidth, dialogScroll: dialog.scrollWidth, editorClient: editor.clientWidth, editorScroll: editor.scrollWidth, output: [...editor.querySelectorAll('[data-vocal-meter]')].map(o => o.textContent), focused: document.activeElement.id }; });
      assert(layout.document <= width + 1 && layout.dialogScroll <= layout.dialogClient + 1 && layout.editorScroll <= layout.editorClient + 1, 'GLAZE controls fit ' + width + ' px: ' + JSON.stringify(layout)); assert(layout.output.slice(0, 2).every(text => /dB/.test(text) && !/NaN/.test(text)), 'Actual live input/output readings appear.');
      if (process.env.LOOM_VOCAL_QA_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.LOOM_VOCAL_QA_SCREENSHOTS, 'galley-glaze-' + width + '.png') });
      await page.evaluate(() => window.LoomApp.engine.panic());
      const saved = await page.evaluate(() => JSON.stringify(window.LoomApp.getState().tracks[0].effects[0])); await page.locator('#audioSettingsButton').click(); await page.locator('#vocalPracticeButton').click(); await page.waitForFunction(() => window.LoomApp.engine.getMicrophoneStatus().enabled); assert.equal(await page.evaluate(() => JSON.stringify(window.LoomApp.getState().tracks[0].effects[0])), saved, 'Practice preserves an existing creative strip.');
      await page.evaluate(() => { document.getElementById('effectDialog').close(); document.getElementById('audioSettingsDialog').close(); window.LoomApp.engine.panic(); });
      await page.evaluate(() => window.LoomApp.loadState(window.LoomSchema.defaultState())); await page.locator('#audioSettingsButton').click(); await page.locator('#vocalPracticeButton').click(); await page.waitForFunction(() => window.LoomApp.engine.getMicrophoneStatus().enabled); await page.evaluate(() => { document.getElementById('effectDialog').close(); document.getElementById('audioSettingsDialog').close(); window.LoomApp.engine.panic(); }); await page.locator('#undoButton').click(); assert.equal(await page.evaluate(() => window.LoomApp.getState().tracks[0].effects.filter(Boolean).length), 0, 'Practice strip insertion is undoable.');
      const full = await page.evaluate(async () => { const state = window.LoomSchema.defaultState(), def = window.LoomEffectsCatalog.find(f => f.id === 'prism'); state.tracks[0].effects = Array.from({ length: 4 }, () => window.LoomSchema.effect({ type: 'prism', params: def.defaults })); await window.LoomApp.loadState(state); return window.LoomSchema.serializeProject(window.LoomApp.getState()); }); await page.locator('#audioSettingsButton').click(); await page.locator('#vocalPracticeButton').click(); assert.match(await page.locator('#audioInterfaceStatus').textContent(), /four effects|free an insert|four inserts|free.*slot|free.*insert/i); assert.equal(await page.evaluate(() => window.LoomSchema.serializeProject(window.LoomApp.getState())), full); assert.equal(await page.evaluate(() => window.LoomApp.engine.getMicrophoneStatus().active), false);
      assert.deepEqual(errors, []); await page.evaluate(() => window.LoomApp.engine.dispose()); passed.push(width + ' px GLAZE all controls / recipes / reset / bypass / live meters / labels / input-channel preservation / existing rack / undo / full rack / 8 × 4');
    } finally { await page.close(); }
  }
}

async function ampUiChecks(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const fingerprints = [];
  try {
    await page.goto(url + '/loom/index.html'); await page.waitForFunction(() => !!window.LoomApp);
    await page.evaluate(async () => { const state = window.LoomSchema.defaultState(); state.tracks[0].effects[0] = window.LoomSchema.effect({ type: 'broiler', params: { model: 'flip-top', cabinet: 'bass15', drive: 13.7, sag: .42, output: -7.1 } }); await window.LoomApp.loadState(state); window.qaAmpLegacy = JSON.stringify(window.LoomApp.getState().tracks[0].effects[0]); });
    await page.locator('[data-slot="0"]').click(); assert.equal(await page.locator('#fx-model').inputValue(), 'flip-top'); assert.equal(await page.locator('#fx-cabinet').inputValue(), 'bass15'); assert.equal(await page.locator('[data-amp-preset]').count(), 13);
    for (const [preset, model, cabinet] of [['blue-plate', 'portaflex-64', 'portaflex115'], ['walk-in-fridge', 'svt-69', 'sealed810'], ['four-burner', 'v4b-71', 'sealed810'], ['night-service', 'svt-pro', 'ported410']]) { await page.locator('[data-amp-preset="' + preset + '"]').click(); assert.equal(await page.locator('#fx-model').inputValue(), model); assert.equal(await page.locator('#fx-cabinet').inputValue(), cabinet); const roundtrip = await page.evaluate(() => { const s = window.LoomApp.getState(), loaded = window.LoomSchema.parseProject(window.LoomSchema.serializeProject(s)); return { source: s.tracks[0].effects[0], loaded: loaded.tracks[0].effects[0] }; }); assert.deepEqual(roundtrip.source, roundtrip.loaded);
      const rendered = await page.evaluate(async () => { const state = window.LoomApp.getState(), left = new Float32Array(48000); for (let i = 0; i < left.length; i++) { const phase = 2 * Math.PI * 55 * i / 48000; left[i] = .15 * Math.sin(phase) + .08 * Math.sin(phase * 2) + .035 * Math.sin(phase * 4); } const asset = window.LoomSchema.encodeAsset({ left, right: left, sampleRate: 48000, name: 'Bass test', id: 'amp-test' }); state.tempo = 240; state.loopEnabled = false; state.master.level = 1; state.tracks[0].level = 1; state.assets = [asset]; state.tracks[0].clips = [{ id: 'bass-clip', name: 'Bass', assetId: asset.id, start: 0, length: 4, sourceStart: 0, sourceEnd: 1, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: 1, fadeIn: 0, fadeOut: 0 }]; const normalized = window.LoomSchema.normalize(state), blob = await window.LoomApp.engine.renderWav(normalized, window.LoomSchema.decodeAssets(normalized.assets), { snapshotReady: true, startBeat: 0, endBeat: 4, tailSeconds: 0 }), bytes = new DataView(await blob.arrayBuffer()); let peak = 0, power = 0, hash = 2166136261; for (let i = 44; i < bytes.byteLength; i += 4) { const value = bytes.getInt16(i, true); peak = Math.max(peak, Math.abs(value) / 32768); power += (value / 32768) ** 2; hash = Math.imul(hash ^ value, 16777619) >>> 0; } return { rate: bytes.getUint32(24, true), frames: (bytes.byteLength - 44) / 4, rms: Math.sqrt(power / ((bytes.byteLength - 44) / 4)), peak, hash }; }); assert.equal(rendered.rate, 48000); assert.equal(rendered.frames, 48000); assert(rendered.rms > .005 && rendered.peak <= .981); fingerprints.push(rendered.hash);
    }
    assert.equal(new Set(fingerprints).size, 4, 'The four new amp recipes render different actual sounds.');
    await page.locator('#effectReset').click(); await page.evaluate(() => { document.getElementById('effectDialog').close(); window.LoomApp.engine.dispose(); });
    passed.push('BROILER GUI four Ampeg-inspired heads / cabinets / 13 recipes / old head preserved / project round trip / four distinct real PCM WAV exports');
  } finally { await page.close(); }
}

(async () => {
  const server = await serve(); let browser;
  try {
    if (process.env.LOOM_VOCAL_QA_SCREENSHOTS) fs.mkdirSync(process.env.LOOM_VOCAL_QA_SCREENSHOTS, { recursive: true });
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    if (process.env.LOOM_VOCAL_QA_HELP_ONLY) await helpUiChecks(browser, server.url);
    else if (process.env.LOOM_VOCAL_QA_DYNAMICS_ONLY) for (const fallback of [false, true]) await dynamicsChecks(browser, server.url, fallback);
    else {
      if (!process.env.LOOM_VOCAL_QA_UI_ONLY) { if (!process.env.LOOM_VOCAL_QA_FALLBACK_ONLY) await cpuChecks(browser, server.url); if (!process.env.LOOM_VOCAL_QA_CPU_ONLY) { for (const [fallback, rate] of (process.env.LOOM_VOCAL_QA_FALLBACK_ONLY ? [[true, 48000]] : [[false, 44100], [false, 48000], [false, 96000], [true, 48000]])) await engineChecks(browser, server.url, fallback, rate); if (!process.env.LOOM_VOCAL_QA_FALLBACK_ONLY) for (const fallback of [false, true]) await dynamicsChecks(browser, server.url, fallback); } }
      if (!process.env.LOOM_VOCAL_QA_ENGINE_ONLY && !process.env.LOOM_VOCAL_QA_CPU_ONLY) { await uiChecks(browser, server.url); await helpUiChecks(browser, server.url); await ampUiChecks(browser, server.url); }
    }
    console.log(JSON.stringify({ passed: passed.length, checks: passed, cpuMeasurements: measurements }, null, 2));
  } finally { await browser?.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
