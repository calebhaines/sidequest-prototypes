'use strict';

// Real browser audio with two different interface-jack signals. Device labels
// and permissions are simulated; mixing, worklet processing and captures are
// real Web Audio. This does not measure a physical interface's driver delay.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const shared = fs.existsSync(path.join(__dirname, 'shared')) ? path.join(__dirname, 'shared') : path.join(root, 'shared');
const passed = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function serve() {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/engine.html') {
      response.writeHead(200, { 'Content-Type': 'text/html' });
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

async function install(page, { ui = false, fallback = false, channel = '2', profile = 'live' } = {}) {
  await page.evaluate(async ({ ui, fallback, channel, profile }) => {
    if (fallback) window.AudioWorkletNode = undefined;
    const state = window.LoomSchema.defaultState(); state.tempo = 240; state.loopEnabled = false; state.master.level = 1; state.recording.micCompensation = 'off'; state.tracks.forEach(t => { t.level = 1; t.instrumentLive = false; });
    if (ui) await window.LoomApp.loadState(state);
    const engine = ui ? window.LoomApp.engine : new window.LoomAudio(state); window.qaEngine = engine;
    await engine.applyAudioSettings({ inputDeviceId: 'interface-input', inputChannel: channel, sampleRate: 'auto', latencyProfile: profile }); await engine.init(); await engine.context.resume();
    window.qaInterface = { requests: [], streams: [], sources: [], mono: false, pending: false };
    window.qaInterface.makeStream = () => {
      const context = engine.context, destination = context.createMediaStreamDestination(), merger = context.createChannelMerger(2);
      destination.channelCount = 2; destination.channelCountMode = 'explicit'; merger.connect(destination);
      for (const [channel, frequency, level] of [[0, 137, .12], [1, 337, .19]]) { const oscillator = context.createOscillator(), gain = context.createGain(); oscillator.frequency.value = frequency; gain.gain.value = level; oscillator.connect(gain); gain.connect(merger, 0, channel); oscillator.start(); window.qaInterface.sources.push(oscillator); }
      const stream = destination.stream, track = stream.getAudioTracks()[0], original = track.getSettings.bind(track); track.getSettings = () => ({ ...original(), channelCount: window.qaInterface.mono ? 1 : 2, latency: .011, deviceId: 'interface-input', sampleRate: context.sampleRate });
      window.qaInterface.streams.push(stream); return stream;
    };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async constraints => { window.qaInterface.requests.push(constraints); if (window.qaInterface.pending) await new Promise(resolve => { window.qaInterface.resolve = resolve; }); return window.qaInterface.makeStream(); } });
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', { configurable: true, value: async () => [{ kind: 'audioinput', deviceId: 'default', label: 'Default input', groupId: 'default' }, { kind: 'audioinput', deviceId: 'interface-input', label: 'QA two-channel interface', groupId: 'interface' }, { kind: 'audiooutput', deviceId: 'default', label: 'Default output', groupId: 'default' }] });
    window.qaConnectAnalyser = () => { const analyser = engine.context.createAnalyser(); analyser.fftSize = 16384; analyser.smoothingTimeConstant = 0; engine.node.connect(analyser); window.qaAnalyser = analyser; }; window.qaConnectAnalyser();
    window.qaSpectrum = () => { const analyser = window.qaAnalyser, audio = new Float32Array(analyser.fftSize), bins = new Float32Array(analyser.frequencyBinCount); analyser.getFloatTimeDomainData(audio); analyser.getFloatFrequencyData(bins); const amplitude = frequency => { const bin = Math.round(frequency * analyser.fftSize / engine.context.sampleRate); return 10 ** (Math.max(...bins.slice(Math.max(0, bin - 2), bin + 3)) / 20); }; return { rms: Math.sqrt(audio.reduce((sum, x) => sum + x * x, 0) / audio.length), leftJack: amplitude(137), rightJack: amplitude(337), rightThird: amplitude(1011) }; };
    window.qaProjection = (audio, frequency, rate) => { let a = 0, b = 0; for (let i = 0; i < audio.length; i++) { a += audio[i] * Math.cos(2 * Math.PI * frequency * i / rate); b += audio[i] * Math.sin(2 * Math.PI * frequency * i / rate); } return 2 * Math.hypot(a, b) / audio.length; };
  }, { ui, fallback, channel, profile });
}

async function routingChecks(browser, url, fallback, channel) {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url + '/engine.html'); await install(page, { fallback, channel }); await page.evaluate(() => window.qaEngine.setMicrophoneMonitoring('track-1', { enabled: true })); await wait(600);
    const live = await page.evaluate(() => ({ spectrum: window.qaSpectrum(), diagnostics: window.qaEngine.getAudioDiagnostics(), request: window.qaInterface.requests.at(-1).audio, mode: window.qaEngine.mode }));
    assert.equal(live.mode, fallback ? 'fallback' : 'worklet'); assert.equal(live.diagnostics.processingFrames, fallback ? 256 : 128); assert.equal(live.request.deviceId.exact, 'interface-input'); assert.equal(live.request.echoCancellation, false); assert.equal(live.request.noiseSuppression, false); assert.equal(live.request.autoGainControl, false);
    const wanted = channel === '1' ? 'leftJack' : 'rightJack', absent = channel === '1' ? 'rightJack' : 'leftJack';
    assert(live.spectrum.rms > .025, 'Actual stopped-monitor audio is audible.');
    if (channel !== 'stereo') assert(live.spectrum[wanted] > live.spectrum[absent] * 40, 'Only the selected physical interface jack reaches the live track: ' + JSON.stringify(live.spectrum));
    await page.evaluate(async () => { await window.qaEngine.startMicrophoneRecording('track-1', { startTransport: false, maxSeconds: .45 }); }); await page.waitForFunction(() => !window.qaEngine.isRecording, null, { timeout: 6000 });
    const take = await page.evaluate(async () => { const takes = await window.qaEngine.stopRecording(), take = takes[0]; if (!take) return null; const samples = take.left.subarray(1500), other = take.right.subarray(1500); return { frames: take.frames, rate: take.sampleRate, left137: window.qaProjection(samples, 137, take.sampleRate), left337: window.qaProjection(samples, 337, take.sampleRate), right137: window.qaProjection(other, 137, take.sampleRate), right337: window.qaProjection(other, 337, take.sampleRate), stereoDifference: samples.reduce((max, value, i) => Math.max(max, Math.abs(value - other[i])), 0), finite: [...samples, ...other].every(Number.isFinite), monitor: window.qaEngine.getMicrophoneStatus().enabled }; });
    assert(take, 'Recording returns a real dry take.'); assert.equal(take.frames, Math.floor(.45 * take.rate)); assert.equal(take.finite, true); assert.equal(take.monitor, true);
    if (channel === 'stereo') { assert(take.left137 > .09 && take.right337 > .14); assert(take.left337 < .007 && take.right137 < .007); assert(take.stereoDifference > .1); }
    else { const desired = channel === '1' ? take.left137 : take.left337, unwanted = channel === '1' ? take.left337 : take.left137; assert(desired > (channel === '1' ? .09 : .14)); assert(unwanted < .008); assert.equal(take.stereoDifference, 0, 'Selected mono input reaches both dry recording channels.'); }
    passed.push((fallback ? 'Fallback' : 'Worklet') + ' real interface ' + channel + ' routing / dry capture / selected input isolation / true processing quantum');
    if (channel === '2') {
      await page.evaluate(() => { const e = window.qaEngine, fx = window.LoomEffectsCatalog.find(f => f.id === 'broiler'); e.state.tracks[0].effects[0] = window.LoomSchema.effect({ type: 'broiler', params: { ...fx.defaults, model: 'valve-stack', drive: 24, cleanLow: 0, cabinet: 'di', output: -12, master: .65, stereo: 'mono' } }); e.setState(e.state); }); await wait(600);
      const wet = await page.evaluate(() => window.qaSpectrum()); assert(wet.rms > .004 && wet.rms < 1); assert(wet.rightThird > live.spectrum.rightThird * 5, 'BROILER processes the selected jack live.');
      const old = await page.evaluate(async () => { const e = window.qaEngine, context = e.context, before = window.LoomSchema.serializeProject(e.state); e.seek(3.25); const result = await e.applyAudioSettings({ latencyProfile: 'balanced', sampleRate: 44100 }); window.qaConnectAnalyser(); return { statePreserved: before === window.LoomSchema.serializeProject(e.state), result, beat: e.getTransport().beat, oldClosed: context.state === 'closed', tracks: window.qaInterface.streams.map(s => s.getTracks().map(t => t.readyState)), diagnostics: e.getAudioDiagnostics() }; });
      assert(old.statePreserved && old.oldClosed); assert.equal(old.result.restarted, true); assert(Math.abs(old.beat - 3.25) < 1e-5); assert(old.tracks.flat().every(s => s === 'ended')); assert.equal(old.diagnostics.sampleRate, 44100); assert.equal(old.diagnostics.processingFrames, fallback ? 512 : 128);
      await page.evaluate(() => window.qaEngine.setMicrophoneMonitoring('track-1', { enabled: true })); await wait(500); assert((await page.evaluate(() => window.qaSpectrum())).rms > .004);
      passed.push((fallback ? 'Fallback' : 'Worklet') + ' real channel-2 BROILER / 44.1 kHz context restart / stopped position / stream cleanup / monitor re-arm');
    }
    await page.evaluate(() => window.qaEngine.dispose()); assert.deepEqual(errors, []);
  } finally { await page.close(); }
}

async function raceChecks(browser, url) {
  const page = await browser.newPage();
  try {
    await page.goto(url + '/engine.html'); await install(page); await page.evaluate(() => { window.qaInterface.mono = true; });
    const mono = await page.evaluate(async () => { try { await window.qaEngine.setMicrophoneMonitoring('track-1', { enabled: true }); return { error: null }; } catch (error) { return { error: error.message, active: window.qaEngine.getMicrophoneStatus().active, tracks: window.qaInterface.streams.flatMap(s => s.getTracks().map(t => t.readyState)) }; } }); assert.match(mono.error, /channel 2|second.*channel|only.*channel|one channel/i); assert.equal(mono.active, false); assert(mono.tracks.every(s => s === 'ended'));
    await page.evaluate(() => { window.qaInterface.mono = false; window.qaInterface.pending = true; window.qaPermission = window.qaEngine.setMicrophoneMonitoring('track-1', { enabled: true }); }); await page.waitForFunction(() => !!window.qaInterface.resolve);
    const guarded = await page.evaluate(async () => { const e = window.qaEngine, context = e.context; try { await e.applyAudioSettings({ sampleRate: 44100 }); return { error: null }; } catch (error) { return { error: error.message, same: e.context === context, closed: context.state === 'closed' }; } }); assert.match(guarded.error, /finish|pending|busy|record|take/i); assert(guarded.same && !guarded.closed);
    await page.evaluate(async () => { window.qaEngine.panic(); window.qaInterface.resolve(); await window.qaPermission; }); const cleaned = await page.evaluate(() => ({ active: window.qaEngine.getMicrophoneStatus().active, streams: window.qaInterface.streams.flatMap(s => s.getTracks().map(t => t.readyState)), busy: window.qaEngine.recordingBusy })); assert.equal(cleaned.active, false); assert.equal(cleaned.busy, false); assert(cleaned.streams.every(s => s === 'ended')); await page.evaluate(() => window.qaEngine.dispose());
    passed.push('Real mono-device channel-2 rejection / pending permission restart guard / late permission cleanup after Panic');
  } finally { await page.close(); }
}

async function uiChecks(browser, url) {
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } }); const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(url + '/loom/index.html'); await page.waitForFunction(() => !!window.LoomApp); await install(page, { ui: true });
      await page.locator('#audioSettingsButton').click(); await page.waitForFunction(() => document.getElementById('audioSettingsDialog')?.open);
      await page.locator('#refreshAudioDevices').click(); await page.waitForFunction(() => document.querySelector('#audioInputDevice option[value="interface-input"]'));
      const released = await page.evaluate(() => window.qaInterface.streams.flatMap(s => s.getTracks().map(t => t.readyState))); assert(released.every(state => state === 'ended'), 'Device refresh must not hold input hardware.');
      await page.selectOption('#audioInputChannel', '2'); await page.selectOption('#audioSampleRate', '48000'); await page.selectOption('#audioLatencyProfile', 'live'); await page.locator('#applyAudioSettings').click(); await page.waitForFunction(() => window.LoomApp.engine.getAudioSettings().sampleRate === 48000 && !window.LoomApp.engine.getAudioDiagnostics().applying && document.getElementById('audioSettingsDialog').getAttribute('aria-busy') === 'false'); await page.evaluate(() => window.qaConnectAnalyser());
      const layout = await page.evaluate(() => { const el = document.getElementById('audioSettingsDialog'); return { open: el.open, document: document.documentElement.scrollWidth, width: innerWidth, client: el.clientWidth, scroll: el.scrollWidth, tracks: window.LoomApp.getState().tracks.length, slots: window.LoomApp.getState().tracks.map(t => t.effects.length) }; });
      assert(layout.open && layout.document <= width + 1 && layout.scroll <= layout.client + 1, 'Audio settings must fit ' + width + 'px.'); assert.equal(layout.tracks, 8); assert(layout.slots.every(n => n === 4));
      if (width === 390 || width === 1440) await page.screenshot({ path: '/tmp/galley-interface-' + width + '.png' });
      await page.locator('#guitarPracticeButton').click(); await page.waitForFunction(() => window.LoomApp.engine.getMicrophoneStatus().enabled);
      const practice = await page.evaluate(() => ({ track: window.LoomApp.getState().tracks[0], state: window.LoomApp.engine.getMicrophoneStatus(), playing: window.LoomApp.engine.getTransport().playing, source: document.getElementById('recordSource').value })); const amp = practice.track.effects.find(f => f?.type === 'broiler');
      assert(amp && amp.params.stereo === 'mono'); assert.equal(practice.source, 'microphone'); assert.equal(practice.playing, false); assert.equal(practice.state.trackId, 'track-1'); await wait(500); assert((await page.evaluate(() => window.qaSpectrum())).rms > .003);
      const existing = JSON.stringify(amp); await page.locator('#audioSettingsButton').click(); await page.locator('#bassPracticeButton').click(); await page.waitForFunction(() => window.LoomApp.engine.getMicrophoneStatus().enabled); assert.equal(await page.evaluate(() => JSON.stringify(window.LoomApp.getState().tracks[0].effects.find(f => f?.type === 'broiler'))), existing, 'A second practice action preserves the existing amp preset.');
      await page.evaluate(() => { document.getElementById('audioSettingsDialog').close(); window.LoomApp.engine.panic(); }); await page.locator('#undoButton').click(); assert.equal(await page.evaluate(() => window.LoomApp.getState().tracks[0].effects.filter(Boolean).length), 0, 'Adding a practice amp is undoable.');
      const full = await page.evaluate(async () => { const state = window.LoomSchema.defaultState(), def = window.LoomEffectsCatalog.find(f => f.id === 'prism'); state.tracks[0].effects = Array.from({ length: 4 }, () => window.LoomSchema.effect({ type: 'prism', params: def.defaults })); await window.LoomApp.loadState(state); return window.LoomSchema.serializeProject(window.LoomApp.getState()); });
      await page.locator('#audioSettingsButton').click(); await page.locator('#guitarPracticeButton').click(); assert.match(await page.locator('#audioInterfaceStatus').textContent(), /four effects|free an insert/i); assert.equal(await page.evaluate(() => window.LoomSchema.serializeProject(window.LoomApp.getState())), full, 'A full rack is preserved rather than overwritten.'); assert.equal(await page.evaluate(() => window.LoomApp.engine.getMicrophoneStatus().active), false);
      if (width === 1440) {
        await page.evaluate(async () => { document.getElementById('audioSettingsDialog').close(); await window.LoomApp.loadState(window.LoomSchema.defaultState()); window.qaInterface.pending = true; window.qaInterface.resolve = null; });
        await page.locator('#audioSettingsButton').click(); await page.locator('#guitarPracticeButton').click(); await page.waitForFunction(() => !!window.qaInterface.resolve); await page.keyboard.press('Escape');
        await page.evaluate(() => window.qaInterface.resolve()); await page.waitForFunction(() => !window.LoomApp.engine.getMicrophoneStatus().pending); await wait(100);
        const cancelled = await page.evaluate(() => ({ open: document.getElementById('audioSettingsDialog').open, status: window.LoomApp.engine.getMicrophoneStatus(), streams: window.qaInterface.streams.flatMap(s => s.getTracks().map(t => t.readyState)), amp: window.LoomApp.getState().tracks[0].effects.some(f => f?.type === 'broiler') })); assert.equal(cancelled.open, false); assert.equal(cancelled.status.enabled, false); assert.equal(cancelled.status.active, false); assert(cancelled.streams.every(s => s === 'ended')); assert.equal(cancelled.amp, true);
        passed.push('Closing a pending Play through BROILER request prevents unexpected late monitoring and retains the undoable amp');
      }
      assert.deepEqual(errors, []); passed.push(width + 'px device menu / explicit apply / refreshed devices / channel 2 / guitar playthrough / preserved preset / undo / full-rack protection / 8 × 4'); await page.evaluate(() => window.LoomApp.engine.dispose());
    } finally { await page.close(); }
  }
}

async function hostRestartChecks(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url + '/loom/index.html'); await page.waitForFunction(() => !!window.LoomApp); await install(page, { ui: true });
    await page.locator('[data-instrument="0"]').click(); await page.locator('[data-app="9"]').click(); await page.waitForFunction(() => document.querySelector('iframe[data-host-track="track-1"]')?.contentWindow?.RouxAppReady);
    await page.evaluate(() => { const child = document.querySelector('iframe[data-host-track="track-1"]').contentWindow, patch = child.RouxApp.getState(); patch.name = 'Keep the low pan'; patch.synth.cutoff = 3210; patch.synth.drive = .73; child.RouxApp.setState(patch); window.qaNativeSnapshot = window.LoomApp.host.snapshot.bind(window.LoomApp.host); window.qaOldContext = window.LoomApp.engine.context; window.LoomApp.host.snapshot = async () => { throw Error('QA instrument settings unavailable'); }; document.getElementById('instrumentDialog').close(); });
    await page.locator('#audioSettingsButton').click(); await page.selectOption('#audioSampleRate', '44100'); await page.locator('#applyAudioSettings').click(); await page.waitForFunction(() => document.getElementById('audioSettingsDialog').getAttribute('aria-busy') === 'false');
    assert.match(await page.locator('#audioInterfaceStatus').textContent(), /settings unavailable/i);
    const rejected = await page.evaluate(() => ({ sameContext: window.LoomApp.engine.context === window.qaOldContext, oldState: window.qaOldContext.state, settings: window.LoomApp.engine.getAudioSettings(), patch: document.querySelector('iframe[data-host-track="track-1"]').contentWindow.RouxApp.getState() })); assert(rejected.sameContext && rejected.oldState !== 'closed'); assert.equal(rejected.settings.sampleRate, 'auto'); assert.equal(rejected.patch.synth.cutoff, 3210); assert.equal(rejected.patch.synth.drive, .73);
    passed.push('Failed live-instrument snapshot aborts interface restart without losing the unsaved patch or original graph');
    await page.evaluate(() => { window.LoomApp.host.snapshot = window.qaNativeSnapshot; }); await page.locator('#applyAudioSettings').click(); await page.waitForFunction(() => !window.LoomApp.engine.getAudioDiagnostics().applying && window.LoomApp.engine.getAudioSettings().sampleRate === 44100 && document.getElementById('audioSettingsDialog').getAttribute('aria-busy') === 'false');
    const snapshot = await page.evaluate(() => window.LoomApp.getState().tracks[0].instrument.snapshot); assert.equal(snapshot.state.synth.cutoff, 3210); assert.equal(snapshot.state.synth.drive, .73); assert.equal(await page.locator('iframe[data-host-track="track-1"]').count(), 0);
    await page.locator('#closeAudioSettings').click(); await page.locator('[data-instrument="0"]').click(); await page.waitForFunction(() => document.querySelector('iframe[data-host-track="track-1"]')?.contentWindow?.RouxAppReady);
    const restored = await page.evaluate(() => document.querySelector('iframe[data-host-track="track-1"]').contentWindow.RouxApp.getState()); assert.equal(restored.synth.cutoff, 3210); assert.equal(restored.synth.drive, .73); assert.equal(restored.name, 'Keep the low pan');
    passed.push('Successful sample-rate restart captures and restores the actual ROUX instrument patch when reopened');
    await page.evaluate(() => { document.getElementById('instrumentDialog').close(); window.qaOldContext = window.LoomApp.engine.context; window.LoomApp.host.snapshot = () => new Promise(resolve => { window.qaReleaseSnapshot = async () => resolve(await window.qaNativeSnapshot('track-1')); }); });
    await page.locator('#audioSettingsButton').click(); await page.selectOption('#audioSampleRate', '96000'); await page.locator('#applyAudioSettings').click(); await page.waitForFunction(() => !!window.qaReleaseSnapshot);
    await page.evaluate(async () => { document.getElementById('panicButton').click(); await window.qaReleaseSnapshot(); }); await page.waitForFunction(() => !window.LoomApp.engine.getAudioDiagnostics().applying && document.getElementById('audioSettingsDialog').getAttribute('aria-busy') === 'false');
    const panic = await page.evaluate(() => ({ same: window.LoomApp.engine.context === window.qaOldContext, state: window.qaOldContext.state, rate: window.LoomApp.engine.getAudioSettings().sampleRate, patch: document.querySelector('iframe[data-host-track="track-1"]').contentWindow.RouxApp.getState() })); assert(panic.same && panic.state !== 'closed'); assert.equal(panic.rate, 44100); assert.equal(panic.patch.synth.cutoff, 3210);
    passed.push('Panic during an in-flight instrument snapshot cancels the candidate restart and preserves the current instrument');
    await page.evaluate(() => { window.qaReleaseSnapshot = null; }); await page.locator('#applyAudioSettings').click(); await page.waitForFunction(() => !!window.qaReleaseSnapshot);
    const newProject = await page.evaluate(async () => { const state = window.LoomSchema.defaultState(); state.name = 'New prep station'; await window.LoomApp.loadState(state); await window.qaReleaseSnapshot(); return window.LoomApp.getState().name; }); assert.equal(newProject, 'New prep station'); await page.waitForFunction(() => !window.LoomApp.engine.getAudioDiagnostics().applying && document.getElementById('audioSettingsDialog').getAttribute('aria-busy') === 'false');
    const fresh = await page.evaluate(() => ({ name: window.LoomApp.getState().name, instrument: window.LoomApp.getState().tracks[0].instrument, rate: window.LoomApp.engine.getAudioSettings().sampleRate, same: window.LoomApp.engine.context === window.qaOldContext })); assert.equal(fresh.name, 'New prep station'); assert.equal(fresh.instrument, null); assert.equal(fresh.rate, 44100); assert.equal(fresh.same, true);
    passed.push('Opening a project during a pending snapshot cancels stale interface changes and leaves the new project intact');
    assert.deepEqual(errors, []); await page.evaluate(() => window.LoomApp.engine.dispose());
  } finally { await page.close(); }
}

(async () => {
  const server = await serve(); let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    if (process.env.LOOM_INTERFACE_QA_HOST_ONLY) await hostRestartChecks(browser, server.url);
    else if (process.env.LOOM_INTERFACE_QA_UI_ONLY) await uiChecks(browser, server.url);
    else {
      for (const fallback of [false, true]) for (const channel of ['1', '2', 'stereo']) await routingChecks(browser, server.url, fallback, channel);
      await raceChecks(browser, server.url); if (!process.env.LOOM_INTERFACE_QA_ENGINE_ONLY) { await uiChecks(browser, server.url); await hostRestartChecks(browser, server.url); }
    }
    console.log(JSON.stringify({ passed: passed.length, checks: passed }, null, 2));
  } finally { await browser?.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
