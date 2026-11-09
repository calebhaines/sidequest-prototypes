'use strict';

/* Actual CUPBOARD editor, production Worklet, ScriptProcessor, and offline
 * rendering. Run Chromium exclusively; every acoustic response is embedded. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const MODELS = ['open112', 'tweed110', 'british212', 'british412', 'modern412', 'bass410', 'bass810', 'bass115', 'rotary', 'radio', 'megaphone', 'horn', 'electrostatic', 'underwater', 'acousticguitar', 'violin', 'cello', 'grandpiano', 'metalbowl', 'woodenbox'];
const MICS = ['dynamic57', 'dynamic421', 'dynamic20', 'ribbon121', 'ribbon160', 'condenser87', 'condenser414', 'small184', 'omni', 'contact'];
const directory = process.env.CABINET_BROWSER_DIR || '/tmp/galley-cabinet-browser';
const report = { passed: [], errors: [], external: [] };
fs.mkdirSync(directory, { recursive: true });
let browser, server, activeCheck = 'startup';
function save() { fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
async function check(name, run) {
  activeCheck = name;
  const start = Date.now(), evidence = await run();
  report.passed.push({ name, milliseconds: Date.now() - start, evidence }); save();
  console.log('PASS', name, JSON.stringify(evidence));
}
async function serve() {
  const html = fs.readFileSync(process.env.CABINET_HTML || path.join(__dirname, 'index.html'));
  report.htmlSHA256 = createHash('sha256').update(html).digest('hex');
  assert(html.includes(Buffer.from('createLoomCabinetDSP')), 'Rebuild GALLEY before running CUPBOARD browser checks.');
  server = http.createServer((request, response) => {
    if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + server.address().port + '/loom/';
}
async function open(url, fallback = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true, reducedMotion: 'reduce' });
  const origin = new URL(url).origin;
  await context.route('**/*', route => {
    const address = route.request().url();
    if (/^(data:|blob:|about:)/.test(address) || new URL(address).origin === origin) return route.continue();
    report.external.push(address); return route.abort();
  });
  if (fallback) await context.addInitScript(() => Object.defineProperty(window, 'AudioWorkletNode', { value: undefined, configurable: true }));
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push({ check: activeCheck, message: error.message, stack: error.stack }));
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.LoomApp && window.createLoomCabinetDSP && LoomEffectsCatalog.some(effect => effect.id === 'cupboard'));
  await page.evaluate(() => {
    const definition = LoomEffectsCatalog.find(effect => effect.id === 'cupboard');
    window.cabinetQA = {
      effect(model, patch = {}) { return LoomSchema.effect({ type: 'cupboard', params: { ...definition.defaults, model, input: 0, output: 0, mix: 1, ...patch } }); },
      multi(four = false) {
        const p = { mic2Enabled: 'on', mic2Type: 'ribbon121', mic2X: .32, mic2Y: -.2, mic2Distance: .4, mic2Angle: 19, mic2Level: -6, mic2Pan: .42, alignment: 'natural' };
        if (four) Object.assign(p, { mic3Enabled: 'on', mic3Type: 'condenser87', mic3X: -.5, mic3Y: .25, mic3Distance: .8, mic3Level: -10, mic3Pan: -.65, mic4Enabled: 'on', mic4Type: 'omni', mic4Distance: 1.7, mic4Level: -14, mic4Pan: .13 });
        return p;
      },
      blank() {
        const state = LoomSchema.defaultState();
        state.name = 'CUPBOARD recording fixture'; state.tempo = 120; state.lengthBars = 1; state.loopEnabled = false; state.loopStart = 0; state.loopEnd = 4;
        state.recording.punchStart = 0; state.recording.punchEnd = 4;
        state.master.level = 1; state.master.effects.fill(null); state.master.automation = [];
        for (const owner of [...state.returns, ...state.buses]) { owner.effects.fill(null); owner.automation = []; owner.level = 1; owner.pan = 0; owner.mute = false; owner.solo = false; }
        for (const track of state.tracks) { track.instrument = null; track.instrumentLive = false; track.clips = []; track.effects.fill(null); track.automation = []; track.level = 1; track.pan = 0; track.sends = [0, 0]; track.output = 'master'; }
        state.lfos.forEach(lfo => { lfo.enabled = false; lfo.routes = []; }); return state;
      },
      fixture(model = 'open112', patch = {}) {
        const state = this.blank(), rate = 48000, frames = 4800;
        const left = Float32Array.from({ length: frames }, (_, i) => .09 * Math.sin(Math.PI * i / frames) * (Math.sin(2 * Math.PI * 137 * i / rate) + .31 * Math.sin(2 * Math.PI * 1793 * i / rate)));
        const right = Float32Array.from(left, (value, i) => value * .73 + .025 * Math.sin(Math.PI * i / frames) * Math.sin(2 * Math.PI * 227 * i / rate));
        const asset = LoomSchema.encodeAsset({ id: 'cabinet-source', name: 'A short stereo DI', left, right, sampleRate: rate });
        state.assets = [asset]; state.tracks[0].effects[0] = this.effect(model, patch);
        state.tracks[0].clips = [{ id: 'cabinet-clip', name: asset.name, type: 'audio', assetId: asset.id, start: .25, length: .2, sourceStart: 0, sourceEnd: .1, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: 1, fadeIn: 0, fadeOut: 0 }];
        return LoomSchema.normalize(state);
      },
      core(state, { frames = 65536, block = 128, ...options } = {}) {
        const Core = createLoomEngineDSP(createLoomEffectsDSP, createLoomLFODSP, createLoomCPUProfiler, createLoomTrackEQDSP, createLoomMasteringDSP).Core;
        const core = new Core(state, LoomSchema.decodeAssets(state.assets, state.freezeAssets), 48000, { linear: true, includeMetronome: true, ...options });
        const left = new Float32Array(frames), right = left.slice(); core.start(0);
        for (let at = 0; at < frames; at += block) core.processBlock(left.subarray(at, Math.min(frames, at + block)), right.subarray(at, Math.min(frames, at + block)));
        return { left, right };
      },
      stats(left, right) {
        let energy = 0, peak = 0, first = -1;
        for (let i = 0; i < left.length; i++) {
          if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) throw Error('Non-finite CUPBOARD audio');
          const value = Math.max(Math.abs(left[i]), Math.abs(right[i]));
          if (value > 1e-8 && first < 0) first = i;
          peak = Math.max(peak, value); energy += left[i] ** 2 + right[i] ** 2;
        }
        return { first, peak, rms: Math.sqrt(energy / (left.length * 2)) };
      },
      difference(a, b) { if (a.length !== b.length) throw Error('Audio lengths differ'); let maximum = 0; for (let i = 0; i < a.length; i++) maximum = Math.max(maximum, Math.abs(a[i] - b[i])); return maximum; },
      async load(state, owner = 'track-1') { await LoomApp.loadState(state); LoomApp.selectEffect(0, owner); },
      params(owner = 'track-1') { return LoomSchema.automationOwner(LoomApp.getState(), owner).effects[0].params; },
      async wav(state, options = {}, frames = 48000) {
        const reference = this.core(state, { frames, ...options });
        const wav = await LoomApp.engine.renderWav(state, LoomSchema.decodeAssets(state.assets, state.freezeAssets), { ...options, snapshotReady: true, startBeat: 0, endBeat: frames / 24000, tailSeconds: 0 });
        const bytes = await wav.arrayBuffer(), view = new DataView(bytes); let error = 0;
        if (view.byteLength !== 44 + frames * 4) throw Error('Cabinet WAV duration changed');
        for (let i = 0; i < frames; i++) for (let channel = 0; channel < 2; channel++) {
          const sample = Math.max(-1, Math.min(1, (channel ? reference.right : reference.left)[i]));
          error = Math.max(error, Math.abs(view.getInt16(44 + i * 4 + channel * 2, true) - Math.round(sample * (sample < 0 ? 32768 : 32767))));
        }
        return { bytes: view.byteLength, rate: view.getUint32(24, true), error, digest: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join(''), ...this.stats(reference.left, reference.right) };
      }
    };
  });
  return { context, page };
}
async function close(context, page) { try { await page.evaluate(async () => { if (LoomApp.engine.context) await LoomApp.engine.dispose(); }); } finally { await context.close(); } }
async function exact(page, key, value) {
  const input = page.locator('[data-cabinet-number="' + key + '"]');
  for (let depth = 0; depth < 5; depth++) {
    const closed = input.locator('xpath=ancestor::details[not(@open)]');
    if (!await closed.count()) break;
    await closed.first().locator(':scope > summary').click();
  }
  await input.fill(String(value)); await input.dispatchEvent('change');
}
async function ui(url) {
  const { context, page } = await open(url);
  try {
    await check('Twenty bodies and ten microphones retain independent settings across track, return, master and group Save/Open', async () => {
      await page.evaluate(() => {
        const state = cabinetQA.blank();
        for (const owner of ['track-1', 'return-1', 'master', 'bus-1']) LoomSchema.automationOwner(state, owner).effects[0] = cabinetQA.effect('open112', { mix: .53 });
        return cabinetQA.load(state);
      });
      assert.deepEqual(await page.locator('#cabinetModel option').evaluateAll(options => options.map(option => option.value)), MODELS);
      const held = await page.evaluate(() => cabinetQA.params()); delete held.model;
      for (const model of MODELS) {
        await page.locator('#cabinetModel').selectOption(model);
        const actual = await page.evaluate(() => cabinetQA.params()); assert.equal(actual.model, model); delete actual.model; assert.deepEqual(actual, held);
      }
      await page.locator('#undoButton').click(); assert.equal(await page.evaluate(() => cabinetQA.params().model), 'metalbowl');
      await page.locator('#redoButton').click(); assert.equal(await page.evaluate(() => cabinetQA.params().model), 'woodenbox');
      assert.deepEqual(await page.locator('[data-cabinet-select="mic1Type"] option').evaluateAll(options => options.map(option => option.value)), MICS);
      for (const type of MICS) { await page.locator('[data-cabinet-select="mic1Type"]').selectOption(type); assert.equal(await page.evaluate(() => cabinetQA.params().mic1Type), type); }
      for (let mic = 2; mic <= 4; mic++) { await page.locator('[data-cabinet-action="add"]').click(); assert.equal(await page.evaluate(mic => cabinetQA.params()['mic' + mic + 'Enabled'], mic), 'on'); }
      await page.locator('[data-cabinet-mic="2"]').click();
      await page.locator('[data-cabinet-select="mic2Type"]').selectOption('ribbon121'); await exact(page, 'mic2X', 37); await exact(page, 'mic2Y', -20); await exact(page, 'mic2Distance', 40); await exact(page, 'mic2Angle', 22); await exact(page, 'mic2Level', -6); await exact(page, 'mic2Pan', 40);
      const mic = await page.evaluate(() => cabinetQA.params());
      for (const [key, value] of Object.entries({ mic2Type: 'ribbon121', mic2X: .37, mic2Y: -.2, mic2Distance: .4, mic2Angle: 22, mic2Level: -6, mic2Pan: .4 })) assert.equal(mic[key], value, key);
      await page.locator('[data-cabinet-select="mic2Polarity"]').selectOption('invert'); assert.equal(await page.evaluate(() => cabinetQA.params().mic2Polarity), 'invert');
      await page.locator('[data-cabinet-action="solo"]').click(); assert.equal(await page.evaluate(() => cabinetQA.params().mic2Solo), 'on');
      await page.locator('[data-cabinet-action="solo"]').click(); assert.equal(await page.evaluate(() => cabinetQA.params().mic2Solo), 'off');
      await page.locator('[data-cabinet-mic="3"]').click(); await page.locator('[data-cabinet-action="power"]').click(); assert.equal(await page.evaluate(() => cabinetQA.params().mic3Enabled), 'off'); assert.equal(await page.evaluate(() => cabinetQA.params().mic2Enabled), 'on');
      for (const [owner, model] of [['return-1', 'acousticguitar'], ['master', 'bass410'], ['bus-1', 'metalbowl']]) {
        await page.evaluate(owner => LoomApp.selectEffect(0, owner), owner); await page.locator('#cabinetModel').selectOption(model);
        assert.equal(await page.evaluate(owner => cabinetQA.params(owner).model, owner), model);
      }
      const expected = await page.evaluate(() => LoomApp.getState()), waiting = page.waitForEvent('download'); await page.locator('#saveButton').click();
      const download = await waiting, file = path.join(directory, 'cupboard.loom.json'); await download.saveAs(file);
      await page.evaluate(() => LoomApp.loadState(cabinetQA.blank())); await page.locator('#projectFile').setInputFiles(file);
      await page.waitForFunction(() => LoomApp.getState().buses[0].effects[0]?.type === 'cupboard');
      const restored = await page.evaluate(() => LoomApp.getState());
      for (const owner of ['track-1', 'return-1', 'master', 'bus-1']) {
        const actual = owner === 'master' ? restored.master : owner === 'track-1' ? restored.tracks[0] : owner === 'return-1' ? restored.returns[0] : restored.buses[0];
        const wanted = owner === 'master' ? expected.master : owner === 'track-1' ? expected.tracks[0] : owner === 'return-1' ? expected.returns[0] : expected.buses[0];
        assert.deepEqual(actual.effects, wanted.effects, owner);
      }
      return { models: MODELS.length, microphones: MICS.length, independentFourMicState: true, owners: ['track-1', 'return-1', 'master', 'bus-1'], undoRedo: true, realSaveOpen: true };
    });
    await check('Virtual placement changes X and distance in one undoable drag and supports keyboard movement', async () => {
      await page.evaluate(() => cabinetQA.load(cabinetQA.fixture('open112', cabinetQA.multi())));
      await page.locator('[data-cabinet-mic="1"]').click(); await page.locator('[data-cabinet-view="top"]').click(); await page.locator('[data-cabinet-stage]').scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => cabinetQA.params()), marker = page.locator('[data-cabinet-marker="1"]'), stage = await page.locator('[data-cabinet-stage]').boundingBox(), box = await marker.boundingBox();
      assert(stage && box); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(stage.x + stage.width * .78, stage.y + stage.height * .38, { steps: 8 }); await page.mouse.up();
      const moved = await page.evaluate(() => cabinetQA.params()); assert(Math.abs(moved.mic1X - before.mic1X) > .05, 'Horizontal placement changes'); assert(Math.abs(moved.mic1Distance - before.mic1Distance) > .01, 'Distance placement changes');
      await page.locator('#undoButton').click(); assert.deepEqual(await page.evaluate(() => cabinetQA.params()), before, 'A two-axis drag is one Undo');
      await page.locator('#redoButton').click(); assert.deepEqual(await page.evaluate(() => cabinetQA.params()), moved, 'Redo restores the complete placement');
      await page.locator('[data-cabinet-marker="1"]').focus(); await page.keyboard.press('ArrowRight');
      const keyed = await page.evaluate(() => cabinetQA.params()); assert(keyed.mic1X > moved.mic1X && keyed.mic1X <= 1, 'Keyboard moves the selected microphone');
      await page.locator('#undoButton').click(); assert.deepEqual(await page.evaluate(() => cabinetQA.params()), moved, 'Keyboard move is undoable');
      await page.locator('[data-cabinet-view="face"]').click(); await page.locator('[data-cabinet-stage]').scrollIntoViewIfNeeded();
      const faceStage = await page.locator('[data-cabinet-stage]').boundingBox(), faceMic = await page.locator('[data-cabinet-marker="1"]').boundingBox();
      await page.mouse.move(faceMic.x + faceMic.width / 2, faceMic.y + faceMic.height / 2); await page.mouse.down(); await page.mouse.move(faceStage.x + faceStage.width * .35, faceStage.y + faceStage.height * .22, { steps: 8 }); await page.mouse.up();
      const face = await page.evaluate(() => cabinetQA.params()); assert(Math.abs(face.mic1Y - moved.mic1Y) > .05, 'Face view moves microphone height'); assert.equal(face.mic1Distance, moved.mic1Distance, 'Face placement retains distance');
      await page.locator('#undoButton').click(); assert.deepEqual(await page.evaluate(() => cabinetQA.params()), moved, 'Face drag is one Undo');
      return { before: { x: before.mic1X, distance: before.mic1Distance }, moved: { x: moved.mic1X, distance: moved.mic1Distance }, keyboardX: keyed.mic1X, faceHeight: face.mic1Y, groupedUndo: true };
    });
    await check('The stage and selected microphone controls fit mobile and desktop widths', async () => {
      const rows = [];
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1100 });
        const layout = await page.locator('#effectEditor').evaluate(editor => ({ width: innerWidth, micButtons: editor.querySelectorAll('[data-cabinet-mic]').length, stage: !!editor.querySelector('[data-cabinet-stage]'), overflowing: [...editor.querySelectorAll('select,input,button,svg[data-cabinet-stage]')].filter(element => { const bounds = element.getBoundingClientRect(); return bounds.width && (bounds.left < -1 || bounds.right > innerWidth + 1); }).map(element => element.id || element.getAttribute('data-cabinet-number') || element.tagName) }));
        assert.deepEqual(layout.overflowing, []); assert.equal(layout.micButtons, 4); assert(layout.stage); rows.push(layout);
        await page.locator('#effectEditor').screenshot({ path: path.join(directory, 'cupboard-' + width + '.png') });
      }
      return rows;
    });
  } finally { await close(context, page); }
}
function cases() { return MODELS.map(model => ({ model, patch: {} })).concat([{ model: 'metalbowl', patch: { mic2Enabled: 'on', mic2Type: 'ribbon121', mic2Distance: .4, mic2Level: -6, mic2Pan: .5, mic3Enabled: 'on', mic3Type: 'condenser87', mic3Distance: .8, mic3Level: -10, mic3Pan: -.6, mic4Enabled: 'on', mic4Type: 'omni', mic4Distance: 1.7, mic4Level: -14, alignment: 'natural', room: .2 } }, { model: 'british412', patch: { stereo: 'split', mic2Enabled: 'on', mic2Type: 'ribbon160', mic2X: .6, mic2Distance: .3, mic2Level: -8, alignment: 'aligned' } }]); }
async function audio(url) {
  const { context, page } = await open(url);
  try {
    await check('Production serialized Worklet matches all twenty bodies and four-microphone routing sample for sample', async () => {
      const value = await page.evaluate(async cases => {
        const q = cabinetQA, nativeURL = URL.createObjectURL, NativeNode = AudioWorkletNode; let sourceBlob, nodeOptions;
        URL.createObjectURL = value => { if (value.type?.includes('javascript')) sourceBlob = value; return nativeURL.call(URL, value); };
        window.AudioWorkletNode = class extends NativeNode { constructor(...args) { super(...args); nodeOptions = args[2]; } };
        try { await q.load(q.fixture()); await LoomApp.engine.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'live' }); await LoomApp.engine.init(); await LoomApp.engine.context.suspend(); }
        finally { URL.createObjectURL = nativeURL; window.AudioWorkletNode = NativeNode; }
        if (LoomApp.engine.mode !== 'worklet' || !sourceBlob) throw Error('Production Worklet did not initialize');
        const source = await sourceBlob.text(), frames = 65536;
        if (!source.includes('createLoomCabinetDSP')) throw Error('Cabinet factory missing from serialized Worklet');
        const extension = '\nregisterProcessor("cabinet-qa-offline",class extends LoomProcessor{constructor(o){super(o);this.core=new DSP.Core(o.processorOptions.state,o.processorOptions.qaAssets,sampleRate,{linear:true,includeMetronome:true});this.core.start(0);}});', rows = [];
        for (const item of cases) {
          const state = q.fixture(item.model, item.patch), reference = q.core(state, { frames }), offline = new OfflineAudioContext(2, frames, 48000), moduleURL = nativeURL.call(URL, new Blob([source, extension], { type: 'text/javascript' }));
          try { await offline.audioWorklet.addModule(moduleURL); } finally { URL.revokeObjectURL(moduleURL); }
          const node = new NativeNode(offline, 'cabinet-qa-offline', { ...nodeOptions, processorOptions: { ...nodeOptions.processorOptions, state, qaAssets: LoomSchema.decodeAssets(state.assets) } });
          node.connect(offline.destination); const rendered = await offline.startRendering(), left = rendered.getChannelData(0), right = rendered.getChannelData(1);
          rows.push({ model: item.model, multi: !!item.patch.mic2Enabled, leftError: q.difference(reference.left, left), rightError: q.difference(reference.right, right), ...q.stats(left, right) }); node.disconnect(); node.port.close();
        }
        return { mode: LoomApp.engine.mode, rows };
      }, cases());
      assert.equal(value.mode, 'worklet'); for (const row of value.rows) { assert.equal(row.leftError, 0, row.model); assert.equal(row.rightError, 0, row.model); assert(row.rms > 1e-8); assert(row.first >= 6000); } return value;
    });
  } finally { await close(context, page); }
  const fallback = await open(url, true);
  try {
    await check('Actual ScriptProcessor callbacks retain the twenty responses and multi-mic stereo paths', async () => {
      const rows = await fallback.page.evaluate(async cases => {
        const q = cabinetQA, Native = window.AudioContext, rows = [];
        for (const item of cases) {
          const state = q.fixture(item.model, item.patch), context = new Native({ sampleRate: 48000 }); await context.suspend(); const nativeResume = context.resume; context.resume = async () => {}; window.AudioContext = function () { return context; };
          const engine = new LoomAudio(state); engine.setAssets(LoomSchema.decodeAssets(state.assets));
          try {
            await engine.init(); if (engine.mode !== 'fallback') throw Error('Expected actual ScriptProcessor fallback'); engine.core.start(0);
            const frames = 65536, block = engine.node.bufferSize, reference = q.core(state, { frames, block }), left = new Float32Array(frames), right = left.slice(), zero = new Float32Array(block);
            for (let at = 0; at < frames; at += block) engine.node.onaudioprocess({ playbackTime: at / 48000, inputBuffer: { length: block, getChannelData: () => zero }, outputBuffer: { length: block, getChannelData: channel => (channel ? right : left).subarray(at, at + block) } });
            rows.push({ model: item.model, multi: !!item.patch.mic2Enabled, mode: engine.mode, block, leftError: q.difference(left, reference.left), rightError: q.difference(right, reference.right), ...q.stats(left, right) });
          } finally { window.AudioContext = Native; context.resume = nativeResume; await engine.dispose(); }
        }
        return rows;
      }, cases());
      for (const row of rows) { assert.equal(row.leftError, 0, row.model); assert.equal(row.rightError, 0, row.model); assert.equal(row.mode, 'fallback'); assert(row.rms > 1e-8); } return rows;
    });
  } finally { await close(fallback.context, fallback.page); }
}
async function exportsAndFreeze(url) {
  const { context, page } = await open(url);
  try {
    await check('WAVs preserve all twenty body responses and group stems keep multi-mic processing before the master', async () => {
      const value = await page.evaluate(async models => {
        const q = cabinetQA, rows = [];
        for (const model of models) rows.push({ model, ...await q.wav(q.fixture(model)) });
        const state = q.fixture('metalbowl', q.multi(true)); state.tracks[0].output = 'bus-1'; state.buses[0].effects[0] = state.tracks[0].effects[0]; state.tracks[0].effects[0] = null;
        state.tracks[1].clips = [{ ...state.tracks[0].clips[0], id: 'second-di', start: .6 }]; state.tracks[1].output = 'bus-1'; state.tracks[1].level = .7;
        const group = await q.wav(state, { busId: 'bus-1' });
        const changed = LoomSchema.copy(state); changed.master.level = 0; changed.master.mute = true; changed.master.playback = { speed: .7, pitch: 7, preservePitch: true }; changed.master.effects[0] = LoomSchema.effect({ type: 'prism', params: { ...LoomEffectsCatalog.find(effect => effect.id === 'prism').defaults, high: -18 } }); changed.returns.forEach(owner => { owner.level = 0; owner.effects.fill(null); });
        return { rows, group, alteredMasterGroup: await q.wav(changed, { busId: 'bus-1' }) };
      }, MODELS);
      for (const row of [...value.rows, value.group, value.alteredMasterGroup]) { assert.equal(row.bytes, 192044); assert.equal(row.rate, 48000); assert(row.error <= 1, JSON.stringify(row)); assert(row.rms > 1e-8); }
      assert.equal(value.group.digest, value.alteredMasterGroup.digest); return value;
    });
    await check('Two microphone paths with automation and an LFO freeze reversibly without changing audio', async () => {
      const value = await page.evaluate(async () => {
        const q = cabinetQA, state = q.fixture('acousticguitar', q.multi());
        state.tracks[0].automation = [{ target: 'fx:0:mic1Level', effectType: 'cupboard', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: -10 }, { beat: 4, value: 0 }] }, { target: 'fx:0:mic1X', effectType: 'cupboard', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: -.2 }, { beat: 4, value: .2 }] }];
        Object.assign(state.lfos[0], { enabled: true, sync: false, rate: .7, routes: [{ id: 'moving-second-mic', ownerId: 'track-1', target: 'fx:0:mic2Pan', effectType: 'cupboard', amount: .05, enabled: true }] });
        await q.load(state); await LoomApp.engine.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'live' }); await LoomApp.engine.init();
        const original = LoomApp.getState(), reference = q.core(original, { frames: 96000 }); await LoomApp.freezeTrack('track-1'); const frozen = LoomApp.getState(), actual = q.core(frozen, { frames: 96000 });
        const difference = { left: q.difference(reference.left, actual.left), right: q.difference(reference.right, actual.right) }, baked = !!frozen.tracks[0].freeze;
        await LoomApp.unfreezeTrack('track-1'); const restored = LoomApp.getState();
        return { baked, difference, effectPreserved: JSON.stringify(restored.tracks[0].effects) === JSON.stringify(original.tracks[0].effects), automationPreserved: JSON.stringify(restored.tracks[0].automation) === JSON.stringify(original.tracks[0].automation), lfosPreserved: JSON.stringify(restored.lfos) === JSON.stringify(original.lfos), microphones: [restored.tracks[0].effects[0].params.mic1Enabled, restored.tracks[0].effects[0].params.mic2Enabled] };
      });
      assert(value.baked && value.effectPreserved && value.automationPreserved && value.lfosPreserved); assert.deepEqual(value.microphones, ['on', 'on']); assert(value.difference.left < 2e-6 && value.difference.right < 2e-6, JSON.stringify(value)); return value;
    });
  } finally { await close(context, page); }
}
(async () => {
  try {
    const url = process.env.CABINET_URL || await serve();
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    for (const phase of (process.env.CABINET_BROWSER_PHASES || 'ui,audio,export').split(',')) {
      if (phase === 'ui') await ui(url); else if (phase === 'audio') await audio(url); else if (phase === 'export') await exportsAndFreeze(url); else throw Error('Unknown phase ' + phase);
    }
    assert.deepEqual(report.errors, [], 'No hidden browser errors'); assert.deepEqual(report.external, [], 'No external acoustic assets');
    console.log('CUPBOARD browser:', report.passed.length, 'groups passed.', directory);
  } catch (error) { report.failure = { check: activeCheck, message: error.stack || String(error) }; console.error(error); process.exitCode = 1; }
  finally { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); save(); }
})();
