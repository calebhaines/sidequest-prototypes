'use strict';

/* The downloadable app, its production serialized Worklet, actual fallback
 * callback, and export/freeze paths. Run Chromium exclusively while checking. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const MODELS = ['original', 'room', 'chamber', 'hall', 'cathedral', 'plate', 'spring', 'tile', 'ambience', 'digital', 'modulated', 'shimmer', 'gated', 'reverse', 'bloom', 'nonlinear'];
const directory = process.env.HOOD_BROWSER_DIR || '/tmp/galley-hood-browser';
const report = { passed: [], errors: [], external: [] };
fs.mkdirSync(directory, { recursive: true });
let browser, server, activeCheck = 'startup';
function save() { fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
async function check(name, run) {
  activeCheck = name;
  const start = Date.now(), evidence = await run();
  report.passed.push({ name, milliseconds: Date.now() - start, evidence });
  save(); console.log('PASS', name, JSON.stringify(evidence));
}
async function serve() {
  const html = fs.readFileSync(process.env.HOOD_HTML || path.join(__dirname, 'index.html'));
  report.htmlSHA256 = createHash('sha256').update(html).digest('hex');
  assert(html.includes(Buffer.from('createLoomHoodDSP')), 'Rebuild GALLEY before running HOOD browser checks.');
  server = http.createServer((request, response) => {
    if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + server.address().port + '/loom/';
}
async function open(url, fallback = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, reducedMotion: 'reduce' });
  const origin = new URL(url).origin;
  await context.route('**/*', route => {
    const value = route.request().url();
    if (/^(data:|blob:|about:)/.test(value) || new URL(value).origin === origin) return route.continue();
    report.external.push(value); return route.abort();
  });
  if (fallback) await context.addInitScript(() => Object.defineProperty(window, 'AudioWorkletNode', { value: undefined, configurable: true }));
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push({ check: activeCheck, message: error.message, stack: error.stack }));
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.LoomApp && window.createLoomHoodDSP);
  await page.evaluate(() => {
    const definition = LoomEffectsCatalog.find(effect => effect.id === 'vestige');
    window.hoodQA = {
      effect(model, patch = {}) { return LoomSchema.effect({ type: 'vestige', params: { ...definition.defaults, model, size: .4, decay: .4, predelay: 0, mix: 1, ...patch } }); },
      blank() {
        const state = LoomSchema.defaultState();
        state.name = 'HOOD browser fixture'; state.tempo = 120; state.lengthBars = 1; state.loopEnabled = false; state.loopStart = 0; state.loopEnd = 4;
        state.master.level = 1; state.master.effects.fill(null); state.master.automation = [];
        state.returns.forEach(owner => { owner.effects.fill(null); owner.automation = []; owner.level = 1; });
        state.tracks.forEach(track => { track.instrument = null; track.instrumentLive = false; track.clips = []; track.effects.fill(null); track.automation = []; track.level = 1; track.pan = 0; track.sends = [0, 0]; });
        state.lfos.forEach(lfo => { lfo.enabled = false; lfo.routes = []; }); return state;
      },
      fixture(model, patch = {}) {
        const state = this.blank(), rate = 48000, frames = 4800;
        const left = Float32Array.from({ length: frames }, (_, index) => .09 * Math.sin(Math.PI * index / frames) * (Math.sin(2 * Math.PI * 131 * index / rate) + .31 * Math.sin(2 * Math.PI * 1793 * index / rate)));
        const right = Float32Array.from(left, (value, index) => value * .73 + .025 * Math.sin(Math.PI * index / frames) * Math.sin(2 * Math.PI * 227 * index / rate));
        const asset = LoomSchema.encodeAsset({ id: 'hood-source', name: 'Short stereo ingredient', left, right, sampleRate: rate });
        state.assets = [asset]; state.tracks[0].effects[0] = this.effect(model, patch);
        state.tracks[0].clips = [{ id: 'hood-clip', name: asset.name, type: 'audio', assetId: asset.id, start: .25, length: .2, sourceStart: 0, sourceEnd: .1, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: 1, fadeIn: 0, fadeOut: 0 }];
        return LoomSchema.normalize(state);
      },
      core(state, { frames = 65536, block = 128, trackId } = {}) {
        const Core = createLoomEngineDSP(createLoomEffectsDSP, createLoomLFODSP, createLoomCPUProfiler, createLoomTrackEQDSP, createLoomMasteringDSP).Core;
        const core = new Core(state, LoomSchema.decodeAssets(state.assets, state.freezeAssets), 48000, { linear: true, includeMetronome: true, trackId });
        const left = new Float32Array(frames), right = left.slice(); core.start(0);
        for (let at = 0; at < frames; at += block) core.processBlock(left.subarray(at, Math.min(frames, at + block)), right.subarray(at, Math.min(frames, at + block)));
        return { left, right };
      },
      stats(left, right) {
        let sum = 0, peak = 0, first = -1;
        for (let index = 0; index < left.length; index++) {
          if (!Number.isFinite(left[index]) || !Number.isFinite(right[index])) throw Error('Non-finite HOOD audio');
          const value = Math.max(Math.abs(left[index]), Math.abs(right[index]));
          if (value > 1e-8 && first < 0) first = index;
          peak = Math.max(peak, value); sum += left[index] ** 2 + right[index] ** 2;
        }
        return { first, peak, rms: Math.sqrt(sum / (left.length * 2)) };
      },
      difference(left, right) { if (left.length !== right.length) throw Error('Audio lengths differ'); let maximum = 0; for (let index = 0; index < left.length; index++) maximum = Math.max(maximum, Math.abs(left[index] - right[index])); return maximum; },
      async load(state, owner = 'track-1') { await LoomApp.loadState(state); LoomApp.selectEffect(0, owner); },
      params(owner = 'track-1') { return LoomSchema.automationOwner(LoomApp.getState(), owner).effects[0].params; }
    };
  });
  return { context, page };
}
async function close(context, page) { try { await page.evaluate(async () => { if (LoomApp.engine.context) await LoomApp.engine.dispose(); }); } finally { await context.close(); } }
async function ui(url) {
  const { context, page } = await open(url);
  try {
    await check('Sixteen HOOD choices retain knobs and Undo on track, send and master; real Save/Open', async () => {
      await page.evaluate(() => { const state = hoodQA.blank(); for (const id of ['track-1', 'return-1', 'master']) LoomSchema.automationOwner(state, id).effects[0] = hoodQA.effect('original', { decay: 1.7, predelay: 37, mix: .43 }); return hoodQA.load(state); });
      assert.deepEqual(await page.locator('#fx-model option').evaluateAll(options => options.map(option => option.value)), MODELS);
      const held = await page.evaluate(() => hoodQA.params()); delete held.model;
      for (const model of MODELS) {
        await page.locator('#fx-model').selectOption(model);
        const actual = await page.evaluate(() => hoodQA.params()); assert.equal(actual.model, model); delete actual.model; assert.deepEqual(actual, held);
      }
      await page.locator('#undoButton').click(); assert.equal(await page.evaluate(() => hoodQA.params().model), 'bloom');
      await page.locator('#redoButton').click(); assert.equal(await page.evaluate(() => hoodQA.params().model), 'nonlinear');
      for (const [owner, model] of [['return-1', 'spring'], ['master', 'shimmer']]) {
        await page.evaluate(owner => LoomApp.selectEffect(0, owner), owner); await page.locator('#fx-model').selectOption(model);
        assert.equal(await page.evaluate(owner => hoodQA.params(owner).model, owner), model);
      }
      const expected = await page.evaluate(() => LoomApp.getState()), waiting = page.waitForEvent('download');
      await page.locator('#saveButton').click(); const download = await waiting, file = path.join(directory, 'hood.loom.json'); await download.saveAs(file);
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [actual, wanted] of [[saved.state.tracks[0], expected.tracks[0]], [saved.state.returns[0], expected.returns[0]], [saved.state.master, expected.master]]) assert.deepEqual(actual.effects, wanted.effects);
      await page.evaluate(() => LoomApp.loadState(hoodQA.blank())); await page.locator('#projectFile').setInputFiles(file);
      await page.waitForFunction(() => LoomApp.getState().master.effects[0]?.params.model === 'shimmer');
      const restored = await page.evaluate(() => LoomApp.getState());
      for (const [actual, wanted] of [[restored.tracks[0], expected.tracks[0]], [restored.returns[0], expected.returns[0]], [restored.master, expected.master]]) assert.deepEqual(actual.effects, wanted.effects);
      return { choices: MODELS.length, unchangedKnobs: true, undoRedo: true, owners: ['track-1', 'return-1', 'master'], saveOpen: true };
    });
    await check('HOOD keeps its compact controls within mobile and desktop widths', async () => {
      await page.evaluate(() => { const state = hoodQA.blank(); state.tracks[0].effects[0] = hoodQA.effect('shimmer'); return hoodQA.load(state); });
      const layouts = [];
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        const layout = await page.locator('#effectEditor').evaluate(editor => ({ width: innerWidth, controls: editor.querySelectorAll('[data-effect-param]').length, overflowing: [...editor.querySelectorAll('select,input,button')].filter(element => { const bounds = element.getBoundingClientRect(); return bounds.width && (bounds.left < -1 || bounds.right > innerWidth + 1); }).map(element => element.id) }));
        assert.deepEqual(layout.overflowing, []); assert(layout.controls >= 8); layouts.push(layout);
        await page.locator('#effectEditor').screenshot({ path: path.join(directory, 'hood-' + width + '.png') });
      }
      return layouts;
    });
  } finally { await close(context, page); }
}
async function audio(url) {
  const { context, page } = await open(url);
  try {
    await check('Production serialized Worklet matches all sixteen HOOD algorithms sample for sample', async () => {
      const result = await page.evaluate(async models => {
        const q = hoodQA, nativeURL = URL.createObjectURL, NativeNode = AudioWorkletNode;
        let sourceBlob, nodeOptions;
        URL.createObjectURL = value => { if (value.type?.includes('javascript')) sourceBlob = value; return nativeURL.call(URL, value); };
        window.AudioWorkletNode = class extends NativeNode { constructor(...args) { super(...args); nodeOptions = args[2]; } };
        try { await q.load(q.fixture('room')); await LoomApp.engine.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'live' }); await LoomApp.engine.init(); await LoomApp.engine.context.suspend(); }
        finally { URL.createObjectURL = nativeURL; window.AudioWorkletNode = NativeNode; }
        if (LoomApp.engine.mode !== 'worklet' || !sourceBlob) throw Error('Production Worklet did not initialize');
        const source = await sourceBlob.text(), frames = 65536;
        if (!source.includes('createLoomHoodDSP')) throw Error('HOOD factory missing from serialized Worklet');
        const extension = '\nregisterProcessor("hood-qa-offline",class extends LoomProcessor{constructor(o){super(o);this.core=new DSP.Core(o.processorOptions.state,o.processorOptions.qaAssets,sampleRate,{linear:true,includeMetronome:true});this.core.start(0);}});';
        const rows = [];
        for (const model of models) {
          const state = q.fixture(model), reference = q.core(state, { frames }), offline = new OfflineAudioContext(2, frames, 48000);
          const moduleURL = nativeURL.call(URL, new Blob([source, extension], { type: 'text/javascript' }));
          try { await offline.audioWorklet.addModule(moduleURL); } finally { URL.revokeObjectURL(moduleURL); }
          const node = new NativeNode(offline, 'hood-qa-offline', { ...nodeOptions, processorOptions: { ...nodeOptions.processorOptions, state, qaAssets: LoomSchema.decodeAssets(state.assets) } });
          node.connect(offline.destination); const rendered = await offline.startRendering(), left = rendered.getChannelData(0), right = rendered.getChannelData(1);
          rows.push({ model, leftError: q.difference(reference.left, left), rightError: q.difference(reference.right, right), ...q.stats(left, right) }); node.disconnect(); node.port.close();
        }
        return { mode: LoomApp.engine.mode, rows };
      }, MODELS);
      assert.equal(result.mode, 'worklet');
      for (const row of result.rows) { assert.equal(row.leftError, 0, row.model); assert.equal(row.rightError, 0, row.model); assert(row.rms > 1e-7, JSON.stringify(row)); assert(row.first >= 6000, JSON.stringify(row)); }
      return result;
    });
  } finally { await close(context, page); }
  const fallback = await open(url, true);
  try {
    await check('Actual ScriptProcessor callbacks retain every HOOD type and stereo PCM', async () => {
      const rows = await fallback.page.evaluate(async models => {
        const q = hoodQA, Native = window.AudioContext, rows = [];
        for (const model of models) {
          const state = q.fixture(model), context = new Native({ sampleRate: 48000 }); await context.suspend();
          const nativeResume = context.resume; context.resume = async () => {}; window.AudioContext = function () { return context; };
          const engine = new LoomAudio(state); engine.setAssets(LoomSchema.decodeAssets(state.assets));
          try {
            await engine.init(); if (engine.mode !== 'fallback') throw Error('Expected actual fallback'); engine.core.start(0);
            const frames = 65536, block = engine.node.bufferSize, reference = q.core(state, { frames, block }), left = new Float32Array(frames), right = left.slice(), zero = new Float32Array(block);
            for (let at = 0; at < frames; at += block) engine.node.onaudioprocess({ playbackTime: at / 48000, inputBuffer: { length: block, getChannelData: () => zero }, outputBuffer: { length: block, getChannelData: channel => (channel ? right : left).subarray(at, at + block) } });
            rows.push({ model, mode: engine.mode, block, leftError: q.difference(left, reference.left), rightError: q.difference(right, reference.right), ...q.stats(left, right) });
          } finally { window.AudioContext = Native; context.resume = nativeResume; await engine.dispose(); }
        }
        return rows;
      }, MODELS);
      for (const row of rows) { assert.equal(row.leftError, 0, row.model); assert.equal(row.rightError, 0, row.model); assert.equal(row.mode, 'fallback'); assert(row.rms > 1e-7, JSON.stringify(row)); }
      return rows;
    });
  } finally { await close(fallback.context, fallback.page); }
}
async function exportsAndFreeze(url) {
  const { context, page } = await open(url);
  try {
    await check('WAV export preserves all HOOD types and sample placement', async () => {
      const rows = await page.evaluate(async models => {
        const q = hoodQA, rows = [];
        for (const model of models) {
          const state = q.fixture(model), assets = LoomSchema.decodeAssets(state.assets), frames = 48000, reference = q.core(state, { frames });
          const wav = await LoomApp.engine.renderWav(state, assets, { snapshotReady: true, startBeat: 0, endBeat: 2, tailSeconds: 0 }), view = new DataView(await wav.arrayBuffer());
          let maximumError = 0;
          for (let i = 0; i < frames; i++) for (let channel = 0; channel < 2; channel++) { const sample = Math.max(-1, Math.min(1, (channel ? reference.right : reference.left)[i])); maximumError = Math.max(maximumError, Math.abs(view.getInt16(44 + i * 4 + channel * 2, true) - Math.round(sample * (sample < 0 ? 32768 : 32767)))); }
          rows.push({ model, bytes: view.byteLength, rate: view.getUint32(24, true), maximumError, ...q.stats(reference.left, reference.right) });
        }
        return rows;
      }, MODELS);
      for (const row of rows) { assert.equal(row.bytes, 192044); assert.equal(row.rate, 48000); assert(row.maximumError <= 1, JSON.stringify(row)); assert(row.rms > 1e-7); assert(row.first >= 6000); }
      return rows;
    });
    await check('Shimmer with automation and LFO bakes reversibly without changing the rendered mix', async () => {
      const value = await page.evaluate(async () => {
        const q = hoodQA, state = q.fixture('shimmer', { mix: .6, decay: .8 });
        state.tracks[0].automation = [{ target: 'fx:0:decay', effectType: 'vestige', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: .4 }, { beat: 4, value: 1.2 }] }];
        Object.assign(state.lfos[0], { enabled: true, sync: false, rate: .7, routes: [{ id: 'hood-damping', ownerId: 'track-1', target: 'fx:0:damping', effectType: 'vestige', amount: .08, enabled: true }] });
        await q.load(state); await LoomApp.engine.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'live' }); await LoomApp.engine.init();
        const original = LoomApp.getState(), reference = q.core(original, { frames: 96000 });
        await LoomApp.freezeTrack('track-1'); const frozen = LoomApp.getState(), actual = q.core(frozen, { frames: 96000 });
        const difference = { left: q.difference(reference.left, actual.left), right: q.difference(reference.right, actual.right) }, baked = !!frozen.tracks[0].freeze;
        await LoomApp.unfreezeTrack('track-1'); const restored = LoomApp.getState();
        return { baked, difference, model: restored.tracks[0].effects[0].params.model, effectsPreserved: JSON.stringify(restored.tracks[0].effects) === JSON.stringify(original.tracks[0].effects), automationPreserved: JSON.stringify(restored.tracks[0].automation) === JSON.stringify(original.tracks[0].automation), lfosPreserved: JSON.stringify(restored.lfos) === JSON.stringify(original.lfos) };
      });
      assert(value.baked); assert.equal(value.model, 'shimmer'); assert(value.difference.left < 2e-6 && value.difference.right < 2e-6, JSON.stringify(value)); assert(value.effectsPreserved && value.automationPreserved && value.lfosPreserved);
      return value;
    });
  } finally { await close(context, page); }
}
(async () => {
  try {
    const url = process.env.HOOD_URL || await serve();
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    for (const phase of (process.env.HOOD_BROWSER_PHASES || 'ui,audio,export').split(',')) {
      if (phase === 'ui') await ui(url); else if (phase === 'audio') await audio(url); else if (phase === 'export') await exportsAndFreeze(url); else throw Error('Unknown phase ' + phase);
    }
    assert.deepEqual(report.errors, [], 'No hidden page errors'); assert.deepEqual(report.external, [], 'No external assets');
    console.log('HOOD browser:', report.passed.length, 'groups passed.', directory);
  } catch (error) { report.failure = { check: activeCheck, message: error.stack || String(error) }; console.error(error); process.exitCode = 1; }
  finally { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); save(); }
})();
