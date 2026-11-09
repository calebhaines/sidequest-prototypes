'use strict';

// The actual standalone UI, production Worklet, fallback callback, WAV exports
// and reversible track cache. Run without another Chromium audio job.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const directory = process.env.GROUP_BUS_BROWSER_DIR || '/tmp/galley-group-bus-browser';
const report = { passed: [], errors: [], external: [] };
fs.mkdirSync(directory, { recursive: true });
let browser, server, activeCheck = 'startup';
function save() { fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
async function check(name, run) { activeCheck = name; const at = Date.now(), evidence = await run(); report.passed.push({ name, milliseconds: Date.now() - at, evidence }); save(); console.log('PASS', name, JSON.stringify(evidence)); }
async function serve() {
  const html = fs.readFileSync(process.env.GROUP_BUS_HTML || path.join(__dirname, 'index.html'));
  report.htmlSHA256 = createHash('sha256').update(html).digest('hex');
  assert(html.includes(Buffer.from('groupBusChannels')), 'Build GALLEY with group buses before browser checks.');
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
  await page.waitForFunction(() => window.LoomApp && LoomSchema.defaultState().buses?.length === 2);
  await page.evaluate(() => {
    window.groupQA = {
      effect(type, patch = {}) { return LoomSchema.effect({ type, params: { ...LoomEffectsCatalog.find(effect => effect.id === type).defaults, ...patch } }); },
      blank() {
        const state = LoomSchema.defaultState(); state.name = 'Two group buses'; state.tempo = 120; state.lengthBars = 1; state.loopEnabled = false; state.loopStart = 0; state.loopEnd = 4; state.recording.punchStart = 0; state.recording.punchEnd = 4;
        state.master.level = 1; state.master.effects.fill(null); state.master.automation = [];
        for (const owner of [...state.returns, ...state.buses]) { owner.effects.fill(null); owner.automation = []; owner.level = 1; owner.pan = 0; owner.mute = false; owner.solo = false; }
        for (const track of state.tracks) { track.instrument = null; track.instrumentLive = false; track.clips = []; track.effects.fill(null); track.automation = []; track.level = 1; track.pan = 0; track.sends = [0, 0]; track.output = 'master'; }
        state.lfos.forEach(lfo => { lfo.enabled = false; lfo.routes = []; }); return state;
      },
      fixture(variant = 'grouped') {
        const state = this.blank(), rate = 48000, frames = 12000;
        for (let index = 0; index < 10; index++) {
          const frequency = 137 + index * 73, envelope = i => Math.sin(Math.PI * i / frames), left = Float32Array.from({ length: frames }, (_, i) => .018 * envelope(i) * Math.sin(2 * Math.PI * frequency * i / rate));
          const right = Float32Array.from(left, (value, i) => value * .76 + .002 * envelope(i) * Math.sin(2 * Math.PI * (frequency + 29) * i / rate));
          const asset = LoomSchema.encodeAsset({ id: 'group-source-' + index, name: 'Ingredient ' + (index + 1), left, right, sampleRate: rate }); state.assets.push(asset);
          const track = state.tracks[index]; track.output = index < 4 ? 'bus-1' : index < 8 ? 'bus-2' : 'master'; track.level = .8;
          track.clips = [{ id: 'group-clip-' + index, name: asset.name, type: 'audio', assetId: asset.id, start: .25, length: .5, sourceStart: 0, sourceEnd: .25, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: 1, fadeIn: 0, fadeOut: 0 }];
          if (index < 2) track.sends = [.12, .07];
        }
        state.buses[0].effects[0] = this.effect('cinder', { drive: 8, output: -4, mix: .55 });
        state.buses[1].effects[0] = this.effect('parallax', { clock: 'free', time: 83, feedback: .31, mix: .3 });
        state.buses[0].automation = [{ target: 'level', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: .83 }, { beat: 4, value: .47 }] }];
        Object.assign(state.lfos[0], { enabled: true, sync: false, rate: .7, routes: [{ id: 'group-feedback', ownerId: 'bus-2', target: 'fx:0:feedback', effectType: 'parallax', amount: .07, enabled: true }] });
        state.returns[0].effects[0] = this.effect('prism', { high: -3, mix: 1 });
        state.master.effects[0] = this.effect('prism', { low: -2, high: -3, mix: 1 }); state.master.level = .8;
        if (variant === 'muted') state.buses[0].mute = true;
        if (variant === 'solo') state.buses[1].solo = true;
        return LoomSchema.normalize(state);
      },
      core(state, { frames = 65536, block = 128, ...options } = {}) {
        const Core = createLoomEngineDSP(createLoomEffectsDSP, createLoomLFODSP, createLoomCPUProfiler, createLoomTrackEQDSP, createLoomMasteringDSP).Core;
        const core = new Core(state, LoomSchema.decodeAssets(state.assets, state.freezeAssets), 48000, { linear: true, includeMetronome: true, ...options });
        const left = new Float32Array(frames), right = left.slice(); core.start(0);
        for (let at = 0; at < frames; at += block) core.processBlock(left.subarray(at, Math.min(frames, at + block)), right.subarray(at, Math.min(frames, at + block)));
        return { left, right, meters: core.getMeters() };
      },
      difference(a, b) { if (a.length !== b.length) throw Error('Audio lengths differ'); let maximum = 0; for (let i = 0; i < a.length; i++) maximum = Math.max(maximum, Math.abs(a[i] - b[i])); return maximum; },
      stats(left, right) { let energy = 0, peak = 0, first = -1; for (let i = 0; i < left.length; i++) { if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) throw Error('Non-finite grouped audio'); const value = Math.max(Math.abs(left[i]), Math.abs(right[i])); if (value > 1e-8 && first < 0) first = i; peak = Math.max(peak, value); energy += left[i] ** 2 + right[i] ** 2; } return { first, peak, rms: Math.sqrt(energy / (left.length * 2)) }; },
      async load(state, owner = 'track-1') { await LoomApp.loadState(state); if (LoomSchema.automationOwner(state, owner).effects[0]) LoomApp.selectEffect(0, owner); },
      async wav(state, options = {}, frames = 48000) {
        const reference = this.core(state, { frames, ...options }), wav = await LoomApp.engine.renderWav(state, LoomSchema.decodeAssets(state.assets, state.freezeAssets), { ...options, snapshotReady: true, startBeat: 0, endBeat: frames / 24000, tailSeconds: 0 });
        const bytes = await wav.arrayBuffer(), view = new DataView(bytes); let error = 0;
        if (view.byteLength !== 44 + frames * 4) throw Error('Stem duration changed: ' + view.byteLength);
        for (let i = 0; i < frames; i++) for (let ch = 0; ch < 2; ch++) { const sample = Math.max(-1, Math.min(1, (ch ? reference.right : reference.left)[i])); error = Math.max(error, Math.abs(view.getInt16(44 + i * 4 + ch * 2, true) - Math.round(sample * (sample < 0 ? 32768 : 32767)))); }
        return { bytes: view.byteLength, rate: view.getUint32(24, true), error, digest: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join(''), ...this.stats(reference.left, reference.right) };
      }
    };
  });
  return { context, page };
}
async function close(context, page) { try { await page.evaluate(async () => { if (LoomApp.engine.context) await LoomApp.engine.dispose(); }); } finally { await context.close(); } }
async function ui(url) {
  const { context, page } = await open(url);
  try {
    await check('Native bus menus and their labels keep their DOM and focus on selected and unselected tracks', async () => {
      const opened = [];
      for (const playing of [false, true]) {
        await page.evaluate(() => { const state = groupQA.blank(); state.loopEnabled = true; return groupQA.load(state); });
        if (playing) assert(await page.evaluate(() => LoomApp.engine.play(0)), 'Playback starts');
        for (const index of [0, 7]) {
          for (const viaLabel of [false, true]) {
            const select = await page.locator('[data-track-output="' + index + '"]').elementHandle();
            const firstOption = await select.$('option');
            if (viaLabel) await page.locator('label[for="output-' + index + '"] > span').click();
            else await select.click();
            assert(await select.evaluate(element => element.isConnected), 'Opening the menu must not replace its select');
            assert(await firstOption.evaluate(element => element.isConnected), 'Opening the menu must not replace its options');
            assert(await select.evaluate(element => document.activeElement === element), 'The native select keeps keyboard focus');
            assert.equal(await page.evaluate(() => LoomApp.getState().selectedTrack), 0, 'Using a mixer control must not select/rebuild its channel');
            await page.keyboard.press('Escape');
            assert.equal(await page.evaluate(() => LoomApp.engine.getMeters().playing), playing, 'Menu Escape does not change transport');
            opened.push({ track: index + 1, viaLabel, playing });
          }
        }
        await page.evaluate(() => LoomApp.engine.stop());
      }
      const select = page.locator('[data-track-output="7"]');
      await select.focus(); await page.keyboard.press('ArrowDown');
      assert.equal(await page.evaluate(() => LoomApp.getState().tracks[7].output), 'bus-1');
      await page.locator('#undoButton').click();
      assert.equal(await page.evaluate(() => LoomApp.getState().tracks[7].output), 'master');
      await page.locator('#redoButton').click();
      assert.equal(await page.evaluate(() => LoomApp.getState().tracks[7].output), 'bus-1');
      await page.locator('[data-channel="7"] .channel-name').click();
      assert.equal(await page.evaluate(() => LoomApp.getState().selectedTrack), 7, 'Channel background selection still works');
      return { opened, keyboardRouting: true, undoRedo: true, channelSelection: true };
    });
    await check('All ten tracks route to either group or master through mixer controls, with Undo and prepared-mix invalidation', async () => {
      await page.evaluate(() => groupQA.load(groupQA.blank()));
      assert.equal(await page.locator('#mixer [data-track-output]').count(), 10);
      for (let index = 0; index < 10; index++) {
        const select = page.locator('#mixer [data-track-output="' + index + '"]');
        assert.deepEqual(await select.locator('option').evaluateAll(options => options.map(option => option.value).sort()), ['bus-1', 'bus-2', 'master']);
        for (const output of ['bus-1', 'bus-2', 'master', index % 2 ? 'bus-2' : 'bus-1']) { await select.selectOption(output); assert.equal(await page.evaluate(index => LoomApp.getState().tracks[index].output, index), output); }
      }
      await page.evaluate(() => LoomApp.selectTrack(7)); assert.equal(await page.locator('#trackOutput').inputValue(), 'bus-2');
      await page.locator('#trackOutput').selectOption('master'); assert.equal(await page.locator('[data-track-output="7"]').inputValue(), 'master');
      await page.locator('#undoButton').click(); assert.equal(await page.evaluate(() => LoomApp.getState().tracks[7].output), 'bus-2');
      await page.locator('#redoButton').click(); assert.equal(await page.evaluate(() => LoomApp.getState().tracks[7].output), 'master');
      await page.evaluate(() => { const state = groupQA.blank(); state.master.playback.speed = .8; return groupQA.load(state); });
      const key = await page.evaluate(() => LoomApp.masterPlayback.sourceKey);
      await page.locator('[data-track-output="0"]').selectOption('bus-1');
      const routedKey = await page.evaluate(() => LoomApp.masterPlayback.sourceKey); assert.notEqual(routedKey, key, 'Changing a route invalidates prepared speed/pitch audio');
      await page.locator('[data-bus-number="level"][data-owner="bus-2"]').fill('.71'); await page.locator('[data-bus-number="level"][data-owner="bus-2"]').dispatchEvent('change');
      assert.notEqual(await page.evaluate(() => LoomApp.masterPlayback.sourceKey), routedKey, 'Changing a group invalidates prepared speed/pitch audio');
      return { tracks: 10, destinations: ['master', 'bus-1', 'bus-2'], selectedTrackSync: true, undoRedo: true, preparedMixInvalidates: true };
    });
    await check('Group names, four insert slots, mixer settings and output routes survive actual Save/Open', async () => {
      await page.evaluate(() => groupQA.load(groupQA.fixture(), 'bus-1'));
      assert.equal(await page.locator('#groupBusChannels [data-bus-effect-owner="bus-1"]').count(), 4); assert.equal(await page.locator('#groupBusChannels [data-bus-effect-owner="bus-2"]').count(), 4);
      await page.locator('[data-bus-name="bus-1"]').fill('Drum stove'); await page.locator('[data-bus-name="bus-1"]').dispatchEvent('change');
      await page.locator('[data-bus-number="level"][data-owner="bus-1"]').fill('.67'); await page.locator('[data-bus-number="level"][data-owner="bus-1"]').dispatchEvent('change');
      await page.evaluate(() => { LoomApp.selectEffect(0, 'bus-1'); const input = document.querySelector('#fx-drive'); input.value = '13'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); });
      assert.equal(await page.evaluate(() => LoomApp.selectedEffectOwner), 'bus-1'); assert.equal(await page.evaluate(() => LoomApp.getState().buses[0].effects[0].params.drive), 13);
      await page.evaluate(() => LoomApp.selectEffect(0, 'bus-2')); assert.equal(await page.evaluate(() => LoomApp.selectedEffectOwner), 'bus-2');
      await page.locator('[data-bus-toggle="mute"][data-owner="bus-2"]').click();
      const expected = await page.evaluate(() => LoomApp.getState()), waiting = page.waitForEvent('download'); await page.locator('#saveButton').click(); const file = path.join(directory, 'groups.loom.json'); await (await waiting).saveAs(file);
      const saved = JSON.parse(fs.readFileSync(file, 'utf8')); assert.deepEqual(saved.state.buses, expected.buses); assert.deepEqual(saved.state.tracks.map(track => track.output), expected.tracks.map(track => track.output));
      await page.evaluate(() => groupQA.load(groupQA.blank())); await page.locator('#projectFile').setInputFiles(file);
      await page.waitForFunction(() => LoomApp.getState().buses?.[0]?.name === 'Drum stove');
      const restored = await page.evaluate(() => LoomApp.getState()); assert.deepEqual(restored.buses, expected.buses); assert.deepEqual(restored.tracks.map(track => track.output), expected.tracks.map(track => track.output)); assert.deepEqual(restored.returns, expected.returns);
      const targets = await page.evaluate(() => [...new Set(LoomSchema.lfoTargets(LoomApp.getState()).map(target => target.ownerId))]); assert(targets.includes('bus-1') && targets.includes('bus-2'));
      return { buses: 2, insertSlots: 8, namesAndEffects: true, routes: restored.tracks.map(track => track.output), saveOpen: true, lfoOwners: ['bus-1', 'bus-2'] };
    });
    await check('Two group channels fit mobile and desktop without crowding the existing return/master section', async () => {
      await page.evaluate(() => groupQA.load(groupQA.fixture())); const layouts = [];
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        const layout = await page.locator('#groupBusChannels').evaluate(panel => ({ width: innerWidth, channels: panel.querySelectorAll('.bus-channel').length, overflowing: [...panel.querySelectorAll('input,select,button')].filter(element => { const bounds = element.getBoundingClientRect(); return bounds.width && (bounds.left < -1 || bounds.right > innerWidth + 1); }).map(element => element.id || element.dataset.busOwner || element.tagName) }));
        assert.equal(layout.channels, 2); assert.deepEqual(layout.overflowing, []); layouts.push(layout); await page.locator('#groupBusChannels').screenshot({ path: path.join(directory, 'groups-' + width + '.png') });
      }
      return layouts;
    });
  } finally { await close(context, page); }
}
async function audio(url) {
  const { context, page } = await open(url);
  try {
    await check('Production serialized Worklet matches grouped, muted and soloed mixes with auxiliary sends and bus modulation', async () => {
      const rows = await page.evaluate(async () => {
        const q = groupQA, nativeURL = URL.createObjectURL, NativeNode = AudioWorkletNode; let sourceBlob, nodeOptions;
        URL.createObjectURL = value => { if (value.type?.includes('javascript')) sourceBlob = value; return nativeURL.call(URL, value); };
        window.AudioWorkletNode = class extends NativeNode { constructor(...args) { super(...args); nodeOptions = args[2]; } };
        try { await q.load(q.fixture()); await LoomApp.engine.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'live' }); await LoomApp.engine.init(); await LoomApp.engine.context.suspend(); }
        finally { URL.createObjectURL = nativeURL; window.AudioWorkletNode = NativeNode; }
        if (LoomApp.engine.mode !== 'worklet' || !sourceBlob) throw Error('Production Worklet unavailable');
        const source = await sourceBlob.text(), extension = '\nregisterProcessor("group-bus-qa-offline",class extends LoomProcessor{constructor(o){super(o);this.core=new DSP.Core(o.processorOptions.state,o.processorOptions.qaAssets,sampleRate,{linear:true,includeMetronome:true});this.core.start(0);}});', frames = 65536, result = [];
        for (const variant of ['grouped', 'muted', 'solo']) {
          const state = q.fixture(variant), reference = q.core(state, { frames }), offline = new OfflineAudioContext(2, frames, 48000), moduleURL = nativeURL.call(URL, new Blob([source, extension], { type: 'text/javascript' }));
          try { await offline.audioWorklet.addModule(moduleURL); } finally { URL.revokeObjectURL(moduleURL); }
          const node = new NativeNode(offline, 'group-bus-qa-offline', { ...nodeOptions, processorOptions: { ...nodeOptions.processorOptions, state, qaAssets: LoomSchema.decodeAssets(state.assets) } }); node.connect(offline.destination);
          const rendered = await offline.startRendering(), left = rendered.getChannelData(0), right = rendered.getChannelData(1);
          result.push({ variant, leftError: q.difference(reference.left, left), rightError: q.difference(reference.right, right), buses: reference.meters.buses?.length, ...q.stats(left, right) }); node.disconnect(); node.port.close();
        }
        return result;
      });
      for (const row of rows) { assert.equal(row.leftError, 0); assert.equal(row.rightError, 0); assert.equal(row.buses, 2); assert(row.rms > 1e-6 && row.first >= 6000); }
      assert.notEqual(rows[0].rms, rows[1].rms); assert.notEqual(rows[0].rms, rows[2].rms); return rows;
    });
  } finally { await close(context, page); }
  const fallback = await open(url, true);
  try {
    await check('Actual ScriptProcessor callbacks match both group buses and their mute/solo routing', async () => {
      const rows = await fallback.page.evaluate(async () => {
        const q = groupQA, Native = window.AudioContext, result = [];
        for (const variant of ['grouped', 'muted', 'solo']) {
          const state = q.fixture(variant), context = new Native({ sampleRate: 48000 }); await context.suspend(); const nativeResume = context.resume; context.resume = async () => {}; window.AudioContext = function () { return context; };
          const engine = new LoomAudio(state); engine.setAssets(LoomSchema.decodeAssets(state.assets));
          try {
            await engine.init(); if (engine.mode !== 'fallback') throw Error('Expected actual ScriptProcessor fallback'); engine.core.start(0);
            const frames = 65536, block = engine.node.bufferSize, reference = q.core(state, { frames, block }), left = new Float32Array(frames), right = left.slice(), zero = new Float32Array(block);
            for (let at = 0; at < frames; at += block) engine.node.onaudioprocess({ playbackTime: at / 48000, inputBuffer: { length: block, getChannelData: () => zero }, outputBuffer: { length: block, getChannelData: channel => (channel ? right : left).subarray(at, at + block) } });
            result.push({ variant, block, leftError: q.difference(left, reference.left), rightError: q.difference(right, reference.right), ...q.stats(left, right) });
          } finally { window.AudioContext = Native; context.resume = nativeResume; await engine.dispose(); }
        }
        return result;
      });
      for (const row of rows) { assert.equal(row.leftError, 0); assert.equal(row.rightError, 0); assert(row.rms > 1e-6); } return rows;
    });
  } finally { await close(fallback.context, fallback.page); }
}
async function exportsAndFreeze(url) {
  const { context, page } = await open(url);
  try {
    await check('Group WAV stems include group processing and skip returns, master effects and master speed/pitch', async () => {
      const results = await page.evaluate(async () => {
        const q = groupQA, state = q.fixture(), rows = [];
        for (const options of [{}, { busId: 'bus-1' }, { busId: 'bus-2' }, { trackId: 'track-1' }, { returnId: 'return-1' }]) rows.push({ options, ...await q.wav(state, options) });
        const changed = LoomSchema.copy(state); changed.master.level = 0; changed.master.mute = true; changed.master.effects[0] = q.effect('prism', { filter: 'highpass', cutoff: 18000, mix: 1 }); changed.master.playback = { speed: .7, pitch: 7, preservePitch: true }; changed.returns.forEach(owner => { owner.level = 0; owner.effects.fill(null); });
        rows.push({ options: { busId: 'bus-1', alteredMaster: true }, ...await q.wav(changed, { busId: 'bus-1' }) }); return rows;
      });
      for (const row of results) { assert.equal(row.bytes, 192044); assert.equal(row.rate, 48000); assert(row.error <= 1, JSON.stringify(row)); assert(row.rms > 1e-7); }
      assert.equal(results[1].digest, results[5].digest, 'Group stems bypass all master transforms and return channels');
      await page.evaluate(() => groupQA.load(groupQA.fixture())); await page.locator('#exportButton').click(); assert.equal(await page.locator('#exportMode option[value="bus-1"]').count(), 1); await page.locator('#exportMode').selectOption('bus-1'); await page.locator('#exportRange').selectOption('loop'); await page.locator('#exportTail').selectOption('0');
      const waiting = page.waitForEvent('download', { timeout: 120000 }); await page.locator('#renderButton').click(); const download = await waiting, file = path.join(directory, 'bus-1.wav'); await download.saveAs(file); await page.locator('#closeExport').click();
      const bytes = fs.readFileSync(file); assert.equal(bytes.readUInt32LE(24), 48000); assert.equal(bytes.length, 384044); assert.match(download.suggestedFilename(), /bus/i);
      return { rows: results, realGroupDownload: { name: download.suggestedFilename(), bytes: bytes.length } };
    });
    await check('Frozen track routing stays editable and group automation/LFO remains live after the track cache', async () => {
      const first = await page.evaluate(async () => {
        const q = groupQA, state = q.fixture(); await q.load(state); await LoomApp.engine.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'live' }); await LoomApp.engine.init();
        const original = LoomApp.getState(), reference = q.core(original, { frames: 96000 }); await LoomApp.freezeTrack('track-1'); const frozen = LoomApp.getState(), actual = q.core(frozen, { frames: 96000 });
        q.originalBusState = original; q.frozenFingerprint = frozen.tracks[0].freeze.fingerprint;
        return { baked: !!frozen.tracks[0].freeze, valid: LoomSchema.freezeValid(frozen, 'track-1'), left: q.difference(reference.left, actual.left), right: q.difference(reference.right, actual.right) };
      });
      assert(first.baked && first.valid); assert(first.left < 2e-6 && first.right < 2e-6, JSON.stringify(first));
      await page.locator('[data-track-output="0"]').selectOption('bus-2');
      await page.locator('[data-bus-number="level"][data-owner="bus-2"]').fill('.51'); await page.locator('[data-bus-number="level"][data-owner="bus-2"]').dispatchEvent('change');
      const rerouted = await page.evaluate(async () => {
        const q = groupQA, frozen = LoomApp.getState(), live = LoomSchema.copy(frozen); delete live.tracks[0].freeze;
        const a = q.core(frozen, { frames: 96000 }), b = q.core(live, { frames: 96000 }), valid = LoomSchema.freezeValid(frozen, 'track-1'), fingerprint = frozen.tracks[0].freeze.fingerprint;
        await LoomApp.unfreezeTrack('track-1'); const thawed = LoomApp.getState();
        return { valid, fingerprintSame: fingerprint === q.frozenFingerprint, output: thawed.tracks[0].output, groupLevel: thawed.buses[1].level, left: q.difference(a.left, b.left), right: q.difference(a.right, b.right), automationPreserved: JSON.stringify(thawed.buses[0].automation) === JSON.stringify(q.originalBusState.buses[0].automation), lfosPreserved: JSON.stringify(thawed.lfos) === JSON.stringify(q.originalBusState.lfos), thawed: !thawed.tracks[0].freeze };
      });
      assert(rerouted.valid && rerouted.fingerprintSame && rerouted.thawed); assert.equal(rerouted.output, 'bus-2'); assert.equal(rerouted.groupLevel, .51); assert(rerouted.left < 2e-6 && rerouted.right < 2e-6, JSON.stringify(rerouted)); assert(rerouted.automationPreserved && rerouted.lfosPreserved); return { initial: first, rerouted };
    });
  } finally { await close(context, page); }
}
(async () => {
  try {
    const url = process.env.GROUP_BUS_URL || await serve(); browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    for (const phase of (process.env.GROUP_BUS_BROWSER_PHASES || 'ui,audio,export').split(',')) {
      if (phase === 'ui') await ui(url); else if (phase === 'audio') await audio(url); else if (phase === 'export') await exportsAndFreeze(url); else throw Error('Unknown phase ' + phase);
    }
    assert.deepEqual(report.errors, [], 'No hidden page errors'); assert.deepEqual(report.external, [], 'No external runtime dependencies'); console.log('Group buses browser:', report.passed.length, 'groups passed.', directory);
  } catch (error) { report.failure = { check: activeCheck, message: error.stack || String(error) }; console.error(error); process.exitCode = 1; }
  finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); save(); }
})();
