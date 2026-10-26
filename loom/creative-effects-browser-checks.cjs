'use strict';

// Actual Chromium Worklet and ScriptProcessor audio, plus the downloadable UI.
// Oscillators feed GALLEY's real input graph; no device permissions are needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const shared = fs.existsSync(path.join(__dirname, 'shared')) ? path.join(__dirname, 'shared') : path.join(root, 'shared');
const scripts = ['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'effects.js', 'schema.js', 'audio-engine.js'];
const patches = {
  strainer: { cutoff: 750, resonance: .4, envAmount: 12, lfoAmount: 7, mix: 1 },
  swirl: { clock: 'free', rate: .1, depth: 0, center: 800, spread: 1, feedback: .3, stages: '8', mix: 1 },
  crumble: { bits: 4, sampleRate: 4000, jitter: .2, mix: 1, tone: 18000, output: 0 }
};
const meterKeys = { strainer: 'cutoffLHz', swirl: 'centerLeftHz', crumble: 'effectiveRateHz' };
const passed = [];
async function serve() {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/engine.html') {
      response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><html><body><script src="/shared/pattern-schema.js"></script>' + scripts.map(file => '<script src="/loom/' + file + '"></script>').join('') + '</body></html>'); return;
    }
    const base = pathname.startsWith('/loom/') ? __dirname : pathname.startsWith('/shared/') ? shared : root;
    const relative = pathname.startsWith('/loom/') ? pathname.slice(5) : pathname.startsWith('/shared/') ? pathname.slice(7) : pathname;
    const file = path.resolve(base, '.' + relative);
    if (!file.startsWith(base + path.sep)) { response.writeHead(403); response.end(); return; }
    fs.readFile(file, (error, bytes) => { if (error) { response.writeHead(404); response.end(); return; } response.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' }); response.end(bytes); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: 'http://127.0.0.1:' + server.address().port, close: () => new Promise(resolve => server.close(resolve)) };
}
async function engineChecks(browser, url, fallback) {
  const page = await browser.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url + '/engine.html'); await page.waitForFunction(() => window.LoomAudio);
    await page.evaluate(async fallback => {
      if (fallback) window.AudioWorkletNode = undefined;
      const state = LoomSchema.defaultState(); state.tempo = 120; state.loopEnabled = false; state.lengthBars = 1; state.master.level = 1; state.tracks.forEach(track => { track.level = 1; track.instrumentLive = false; });
      const engine = new LoomAudio(state); window.creativeQa = { engine, sources: [] };
      await engine.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'live' }); await engine.init(); await engine.context.resume();
      const context = engine.context, merger = context.createChannelMerger(2); merger.connect(engine.microphoneInput);
      for (const [frequency, l, r] of [[131, .18, .14], [1793, .08, .06]]) {
        const oscillator = context.createOscillator(), left = context.createGain(), right = context.createGain(); oscillator.frequency.value = frequency; left.gain.value = l; right.gain.value = r;
        oscillator.connect(left); oscillator.connect(right); left.connect(merger, 0, 0); right.connect(merger, 0, 1); oscillator.start(); creativeQa.sources.push(oscillator);
      }
      const analyser = context.createAnalyser(); analyser.fftSize = 4096; engine.node.connect(analyser); creativeQa.analyser = analyser;
      engine._send({ type: 'microphoneMonitor', track: 0, enabled: true });
    }, fallback);
    assert.equal(await page.evaluate(() => creativeQa.engine.mode), fallback ? 'fallback' : 'worklet');
    for (const [id, patch] of Object.entries(patches)) {
      await page.evaluate(({ id, patch }) => {
        const engine = creativeQa.engine, definition = LoomEffectsCatalog.find(effect => effect.id === id);
        engine.state.tracks[0].effects[0] = LoomSchema.effect({ type: id, params: { ...definition.defaults, ...patch } }); engine.setState(engine.state);
      }, { id, patch });
      await page.waitForFunction(({ id, key }) => {
        const meter = creativeQa.engine.getMeters().effects?.[0]?.[0];
        return meter?.type === id && Number.isFinite(meter[key]) && meter[key] > 0 && Number.isFinite(meter.outputDb) && meter.outputDb > -65;
      }, { id, key: meterKeys[id] });
      const output = await page.evaluate(() => {
        const audio = new Float32Array(creativeQa.analyser.fftSize); creativeQa.analyser.getFloatTimeDomainData(audio);
        return { rms: Math.sqrt(audio.reduce((sum, value) => sum + value * value, 0) / audio.length), finite: audio.every(Number.isFinite), mode: creativeQa.engine.mode };
      });
      assert(output.finite && output.rms > .004, id + ' makes audible output in the actual ' + output.mode + ' graph');
    }
    const exported = await page.evaluate(async patches => {
      const S = LoomSchema, pair = [new Float32Array(12000), new Float32Array(12000)];
      for (let i = 0; i < pair[0].length; i++) { pair[0][i] = .17 * Math.sin(2 * Math.PI * 131 * i / 48000) + .09 * Math.sin(2 * Math.PI * 1793 * i / 48000); pair[1][i] = -.13 * Math.sin(2 * Math.PI * 227 * i / 48000); }
      const asset = S.encodeAsset({ id: 'creative-audio', name: 'Creative audio', left: pair[0], right: pair[1], sampleRate: 48000 }), result = [];
      for (const [id, patch] of Object.entries(patches)) {
        const state = S.defaultState(), definition = LoomEffectsCatalog.find(effect => effect.id === id); state.tempo = 120; state.master.level = 1; state.tracks[0].level = 1; state.loopEnabled = false; state.assets = [asset];
        state.tracks[0].effects[0] = S.effect({ type: id, params: { ...definition.defaults, ...patch } });
        state.tracks[0].clips = [{ id: 'fixture', name: 'Fixture', assetId: asset.id, start: .25, length: .5, sourceStart: 0, sourceEnd: .25, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: 1, fadeIn: 0, fadeOut: 0 }];
        const restored = S.parseProject(S.serializeProject(state)), assets = S.decodeAssets(restored.assets), blob = await creativeQa.engine.renderWav(restored, assets, { snapshotReady: true, startBeat: 0, endBeat: 1, tailSeconds: 0 });
        const view = new DataView(await blob.arrayBuffer()), reference = new (createLoomEngineDSP(createLoomEffectsDSP).Core)(restored, assets, 48000, { linear: true }); reference.start(0);
        let maxDifference = 0, peak = 0, leadingPeak = 0;
        for (let at = 0; at < 24000; at += 128) {
          const count = Math.min(128, 24000 - at), left = new Float32Array(count), right = new Float32Array(count); reference.processBlock(left, right);
          for (let i = 0; i < count; i++) for (const [channel, data] of [[0, left], [1, right]]) {
            const value = Math.max(-1, Math.min(1, data[i])), expected = Math.round(value * (value < 0 ? 32768 : 32767)), actual = view.getInt16(44 + (at + i) * 4 + channel * 2, true);
            maxDifference = Math.max(maxDifference, Math.abs(expected - actual)); peak = Math.max(peak, Math.abs(actual)); if (at + i < 6000) leadingPeak = Math.max(leadingPeak, Math.abs(actual));
          }
        }
        result.push({ id, bytes: view.byteLength, rate: view.getUint32(24, true), maxDifference, peak, leadingPeak });
      }
      return result;
    }, patches);
    for (const result of exported) { assert.equal(result.bytes, 96044); assert.equal(result.rate, 48000); assert(result.maxDifference <= 1, JSON.stringify(result)); assert(result.peak > 300); assert.equal(result.leadingPeak, 0); }
    await page.evaluate(async () => { creativeQa.sources.forEach(source => source.stop()); await creativeQa.engine.dispose(); });
    assert.deepEqual(errors, []); passed.push('Actual Chromium ' + (fallback ? 'fallback' : 'serialized Worklet') + ' audio + three live meters + portable offline PCM parity and clip timing');
  } finally { await page.close(); }
}
async function uiChecks(browser) {
  const bytes = fs.readFileSync(process.env.LOOM_CREATIVE_QA_PREVIEW || path.join(__dirname, 'index.html')), requests = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await context.route('**/*', route => {
    const url = route.request().url(); if (url === 'https://creative.kitchen.test/GALLEY.html') return route.fulfill({ status: 200, contentType: 'text/html', body: bytes }); requests.push(url); return route.abort();
  });
  const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('https://creative.kitchen.test/GALLEY.html'); await page.waitForFunction(() => window.LoomApp);
    for (const id of Object.keys(patches)) {
      await page.evaluate(async id => {
        const state = LoomSchema.defaultState(), definition = LoomEffectsCatalog.find(effect => effect.id === id); state.tracks[0].effects[0] = LoomSchema.effect({ type: id, params: definition.defaults }); await LoomApp.loadState(state);
      }, id);
      await page.locator('[data-slot="0"]').click();
      const preset = await page.evaluate(id => LoomEffectsCatalog.find(effect => effect.id === id).presets[0], id);
      assert(await page.locator('#effectEditor .creative-control-group').count() >= 2, id + ' groups technical controls');
      await page.locator('#creativePreset').selectOption(preset.id);
      assert.deepEqual(await page.evaluate(() => LoomApp.getState().tracks[0].effects[0].params), preset.params);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'creativePreset', id + ' keeps keyboard focus after applying a recipe');
      const before = await page.evaluate(() => LoomApp.getState().tracks[0].effects[0].params.mix);
      await page.locator('#fx-mix').focus(); await page.keyboard.press(before > .5 ? 'Home' : 'End');
      assert.notEqual(await page.evaluate(() => LoomApp.getState().tracks[0].effects[0].params.mix), before);
      await page.locator('#undoButton').click(); assert.deepEqual(await page.evaluate(() => LoomApp.getState().tracks[0].effects[0].params), preset.params, id + ' control edits undo to the complete recipe');
      await page.locator('#effectBypass').click(); assert.equal(await page.evaluate(() => LoomApp.getState().tracks[0].effects[0].params.bypass), true);
      await page.locator('#undoButton').click(); assert.equal(await page.evaluate(() => LoomApp.getState().tracks[0].effects[0].params.bypass), false);
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const overflow = await page.locator('#effectEditor').evaluate(editor => [...editor.querySelectorAll('fieldset,select,input,button')].filter(element => {
          const bounds = element.getBoundingClientRect(); return bounds.width && (bounds.left < -1 || bounds.right > innerWidth + 1);
        }).map(element => element.id || element.className));
        assert.deepEqual(overflow, [], id + ' editor controls fit ' + width + ' px');
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    const downloadEvent = page.waitForEvent('download'); await page.locator('#saveButton').click(); const download = await downloadEvent;
    const saved = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(saved.state.tracks[0].effects[0].type, 'crumble', 'Saved project retains a new insert');
    const result = await page.evaluate(async () => {
      const state = LoomApp.getState(), engine = LoomApp.engine; await engine.init(); await engine.context.resume();
      const oscillator = engine.context.createOscillator(), level = engine.context.createGain(); oscillator.frequency.value = 131; level.gain.value = .2; oscillator.connect(level); level.connect(engine.microphoneInput); oscillator.start(); engine._send({ type: 'microphoneMonitor', track: 0, enabled: true });
      window.standaloneCreativeSource = oscillator;
      return { mode: engine.mode, type: state.tracks[0].effects[0].type };
    });
    assert.equal(result.mode, 'worklet');
    await page.waitForFunction(() => { const meter = LoomApp.engine.getMeters().effects?.[0]?.[0]; return meter?.type === 'crumble' && meter.inputDb > -60; });
    await page.waitForFunction(() => [...document.querySelectorAll('[data-effect-meter]')].some(element => !['—', '', '–'].includes(element.textContent.trim())));
    await page.evaluate(async () => { standaloneCreativeSource.stop(); await LoomApp.engine.dispose(); });
    assert.deepEqual(requests, [], 'The downloadable page has no external runtime or asset dependencies'); assert.deepEqual(errors, []);
    passed.push('Standalone offline recipes, grouped controls, keyboard focus, Undo/bypass, project save, 320/390 px layout and genuine Worklet meter UI');
  } finally { await context.close(); }
}
(async () => {
  const server = await serve(), browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try { await engineChecks(browser, server.url, false); await engineChecks(browser, server.url, true); if (!process.env.LOOM_CREATIVE_QA_ENGINE_ONLY) await uiChecks(browser); passed.forEach(label => console.log('PASS ' + label)); }
  finally { await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
