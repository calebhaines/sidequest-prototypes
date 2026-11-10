'use strict';
/* Real master playback controls and the standalone Worker/AudioBuffer/export path.
 * Coordinate this single Chromium process with native performance benchmarks.
 * MASTER_PLAYBACK_QA_BUILT=1 tests the shipped standalone HTML.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const installed = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || (fs.existsSync(installed) ? installed : 'playwright'));
const appRoot = __dirname, root = path.dirname(appRoot), shared = fs.existsSync(path.join(appRoot, 'shared/pattern-schema.js')) ? path.join(appRoot, 'shared') : path.join(root, 'shared');
const artifacts = process.env.MASTER_PLAYBACK_QA_ARTIFACTS || '/tmp/galley-master-playback-browser';
const passed = [], errors = [], external = []; let browser, server, servedHTML, activeCheck = 'startup';
fs.mkdirSync(artifacts, { recursive: true });
function preview() {
  if (process.env.MASTER_PLAYBACK_QA_FILE) return fs.readFileSync(process.env.MASTER_PLAYBACK_QA_FILE);
  if (process.env.MASTER_PLAYBACK_QA_BUILT) return fs.readFileSync(path.join(appRoot, 'index.html'));
  const code = String.raw`from pathlib import Path
import ast,base64,re,runpy,sys
p=Path(sys.argv[1]);shared=Path(sys.argv[2]);source=(p/'build.py').read_text();tree=ast.parse(source)
names=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='SCRIPTS' for t in n.targets))
css='\n'.join((p/n).read_text() for n in dict.fromkeys(re.findall(r"ROOT / '([^']+\.css)'",source)))
fonts=[]
for family,weight,style,name in [('Loom Sans',400,'normal','noto-sans-regular.woff2'),('Loom Sans',700,'normal','noto-sans-bold.woff2'),('Loom Serif',400,'normal','noto-serif-regular.woff2'),('Loom Serif',400,'italic','noto-serif-italic.woff2')]:
 data=base64.b64encode((p/'fonts'/name).read_bytes()).decode();fonts.append('@font-face{font-family:'+repr(family)+';font-style:'+style+';font-weight:'+str(weight)+';src:url(data:font/woff2;base64,'+data+") format('woff2')}")
css=css.replace('/* FONT_FACES */','\n'.join(fonts))
js='window.LoomEmbeddedInstruments={};window.LoomDemoAssets={};window.LoomDemoTemplate=null;\n'+'\n'.join((p/n).read_text() for n in names)
html=(p/'app.html').read_text().replace('<!-- STYLES -->','<style>'+css+'</style>').replace('<!-- SCRIPTS -->','<script>'+js.replace('</script','<\\/script')+'</script>')
helpers=runpy.run_path(str(shared/'bundle_audio_exchange.py'));sys.stdout.write(helpers['embed_exchange'](html,'loom',p))`;
  return execFileSync('python3', ['-c', code, appRoot, shared], { maxBuffer: 32 * 1024 * 1024 });
}
async function serve() {
  servedHTML = preview(); server = http.createServer((request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname; response.setHeader('Cache-Control', 'no-store');
    if (name === '/loom/' || name === '/loom/index.html') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); return response.end(servedHTML); }
    if (name === '/favicon.ico') { response.writeHead(204); return response.end(); }
    const base = name.startsWith('/shared/') ? shared : root, relative = name.startsWith('/shared/') ? name.slice(7) : name, file = path.resolve(base, '.' + relative);
    if (!file.startsWith(base + path.sep)) { response.writeHead(403); return response.end(); }
    fs.stat(file, (error, stat) => { if (error || !stat.isFile()) { response.writeHead(404); return response.end(); } response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm' })[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(response); });
  }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return 'http://127.0.0.1:' + server.address().port + '/loom/index.html';
}
function save() { fs.writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify({ passed, errors, external, release: { built: !!process.env.MASTER_PLAYBACK_QA_BUILT, htmlSha256: servedHTML ? createHash('sha256').update(servedHTML).digest('hex') : null } }, null, 2) + '\n'); }
async function check(name, test) { if (process.env.MASTER_PLAYBACK_BROWSER_FILTER && !new RegExp(process.env.MASTER_PLAYBACK_BROWSER_FILTER).test(name)) return; activeCheck = name; const at = Date.now(), evidence = await test(); passed.push({ name, milliseconds: Date.now() - at, evidence }); save(); console.log('PASS ' + name + ' ' + JSON.stringify(evidence)); }
async function pageFor(url) {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' }), origin = new URL(url).origin;
  await context.route('**/*', route => { const address = route.request().url(); if (/^(data:|blob:|about:)/.test(address) || new URL(address).origin === origin) return route.continue(); external.push(address); return route.abort(); });
  const page = await context.newPage(); page.on('pageerror', error => errors.push({ check: activeCheck, message: error.message, stack: error.stack?.split('\n').slice(0, 6).join('\n') }));
  await page.goto(url, { waitUntil: 'load' }); await page.waitForFunction(() => window.LoomApp?.masterPlayback && window.LoomMasterTransform);
  await page.evaluate(() => { const S = LoomSchema; window.mpQA = {
    blank() { const s = S.defaultState(); s.tempo = 120; s.lengthBars = 1; s.loopEnabled = false; s.loopStart = 0; s.loopEnd = 4; s.recording.punchEnd = 4; for (const o of [...s.tracks, ...s.returns, s.master]) { o.effects.fill(null); o.automation = []; o.level = 1; o.mute = false; if ('pan' in o) o.pan = 0; } for (const t of s.tracks) { t.clips = []; t.instrumentLive = false; t.sends = [0, 0]; } s.lfos.forEach(l => { l.enabled = false; l.routes = []; }); return s; },
    fixture(settings = { speed: .5, pitch: 0, preservePitch: true }, loop = true) { const s = this.blank(), rate = 48000, frames = rate * 2, channels = [440, 660].map(hz => Float32Array.from({ length: frames }, (_, i) => .05 * Math.sin(2 * Math.PI * hz * i / rate))), a = S.encodeAsset({ id: 'master-speed-tone', name: 'Stereo master pitch reference', sampleRate: rate, left: channels[0], right: channels[1] }); s.assets = [a]; s.master.playback = { algorithm: 'signalsmith', ...settings }; s.loopEnabled = loop; s.tracks[8].clips = [{ id: 'master-speed-clip', name: a.name, type: 'audio', assetId: a.id, start: 0, length: 4, sourceStart: 0, sourceEnd: 2, sourceOffset: 0, rate: 1, reverse: false, loop: true, gain: 1, fadeIn: 0, fadeOut: 0 }]; return s; },
    settings() { return LoomApp.getState().master.playback; },
    difference(a, b) { if (a.length !== b.length) throw Error('Audio lengths differ'); let max = 0, power = 0; for (let i = 0; i < a.length; i++) { if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) throw Error('Non-finite audio'); const d = a[i] - b[i]; max = Math.max(max, Math.abs(d)); power += d * d; } return { max, rms: Math.sqrt(power / Math.max(1, a.length)) }; },
    projection(data, hz, rate) { const start = Math.floor(data.length * .25), end = Math.floor(data.length * .75); let real = 0, imag = 0; for (let i = start; i < end; i++) { const angle = 2 * Math.PI * hz * i / rate; real += data[i] * Math.cos(angle); imag += data[i] * Math.sin(angle); } return 2 * Math.hypot(real, imag) / Math.max(1, end - start); },
    bandPeak(data, target, rate, spread = 8) { const start = Math.floor(data.length * .25), end = Math.floor(data.length * .75); let best = { frequency: target, amplitude: 0 }; for (let hz = target - spread; hz <= target + spread; hz += .5) { let real = 0, imag = 0, count = 0; for (let i = start; i < end; i += 8) { const angle = 2 * Math.PI * hz * i / rate; real += data[i] * Math.cos(angle); imag += data[i] * Math.sin(angle); count++; } const amplitude = 2 * Math.hypot(real, imag) / Math.max(1, count); if (amplitude > best.amplitude) best = { frequency: hz, amplitude }; } return { ...best, centsError: 1200 * Math.log2(best.frequency / target) }; }
  }; }); return { context, page };
}
const panel = page => page.locator('.master-playback');
async function reveal(page) { await panel(page).scrollIntoViewIfNeeded(); }
async function setNumber(page, key, value) { const node = page.locator('[data-mp-number="' + key + '"]'); await node.fill(String(value)); await node.press('Tab'); }
async function uiChecks(page) {
  await check('Master speed and independent pitch use two actual rotary controls with accurate effective tempo and tape pitch', async () => {
    await page.evaluate(() => LoomApp.loadState(mpQA.blank())); await reveal(page);
    assert.deepEqual(await page.locator('[data-mp-knob]').evaluateAll(nodes => nodes.map(e => e.dataset.mpKnob)), ['speed', 'pitch']);
    for (const key of ['speed', 'pitch']) assert.equal(await page.locator('[data-mp-knob="' + key + '"]').getAttribute('role'), 'slider');
    await setNumber(page, 'speed', 50); await setNumber(page, 'pitch', 3.5); assert.deepEqual(await page.evaluate(() => mpQA.settings()), { speed: .5, pitch: 3.5, preservePitch: true, algorithm: 'signalsmith' });
    assert.equal(await page.locator('#masterPlaybackBpm').textContent(), '60 BPM'); assert.equal(await page.locator('#masterPlaybackNetPitch').textContent(), '+3.5 st');
    await page.locator('#masterPlaybackPreserve').uncheck(); assert.equal(await page.locator('#masterPlaybackNetPitch').textContent(), '-8.5 st');
    await page.locator('#masterPlaybackReset').click(); assert.deepEqual(await page.evaluate(() => mpQA.settings()), { speed: 1, pitch: 0, preservePitch: true, algorithm: 'signalsmith' }); return { knobs: 2, speedPercent: true, independentAndTapePitch: true };
  });
  await check('The native stretch selector retains focus and supports one-step Undo Redo and Reset', async () => {
    await page.evaluate(() => LoomApp.loadState(mpQA.blank())); await reveal(page);
    const selector = page.locator('#masterPlaybackAlgorithm'), element = await selector.elementHandle(), option = await element.$('option');
    assert.deepEqual(await selector.locator('option').evaluateAll(nodes => nodes.map(node => node.value)), ['signalsmith', 'wsola', 'phase-vocoder', 'granular']);
    await element.click();
    assert(await element.evaluate(node => node.isConnected && document.activeElement === node), 'Opening the native menu retains its element and focus');
    assert(await option.evaluate(node => node.isConnected), 'Opening the menu does not rebuild its options');
    await page.keyboard.press('Escape');
    await selector.selectOption('wsola');
    assert.equal(await page.evaluate(() => mpQA.settings().algorithm), 'wsola');
    assert(await element.evaluate(node => node.isConnected), 'Changing algorithm retains the select');
    assert((await page.locator('#masterPlaybackAlgorithmHelp').textContent()).trim().length > 20);
    await page.locator('#undoButton').click(); assert.equal(await page.evaluate(() => mpQA.settings().algorithm), 'signalsmith');
    await page.locator('#redoButton').click(); assert.equal(await page.evaluate(() => mpQA.settings().algorithm), 'wsola');
    assert.equal(await page.locator('#masterPlaybackReset').isDisabled(), false, 'An algorithm-only edit can be reset');
    await reveal(page); await page.locator('#masterPlaybackReset').click();
    assert.deepEqual(await page.evaluate(() => mpQA.settings()), { speed: 1, pitch: 0, preservePitch: true, algorithm: 'signalsmith' });
    return { algorithms: 4, nativeFocus: true, retainedControl: true, undoRedo: true, reset: true };
  });
  await check('Pointer keyboard and numeric master edits each undo as one gesture and reset restores neutral playback', async () => {
    const before = await page.evaluate(() => mpQA.settings()), knob = page.locator('[data-mp-knob="speed"]'); await knob.focus(); await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowUp'); await page.keyboard.up('ArrowUp'); await knob.press('Tab');
    assert(Math.abs((await page.evaluate(() => mpQA.settings().speed)) - 1.002) < 1e-8); await page.locator('#undoButton').click(); assert.deepEqual(await page.evaluate(() => mpQA.settings()), before);
    await reveal(page); await setNumber(page, 'pitch', 7.25); assert.equal(await page.evaluate(() => mpQA.settings().pitch), 7.25); await page.locator('#undoButton').click(); assert.deepEqual(await page.evaluate(() => mpQA.settings()), before);
    await reveal(page); const box = await knob.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2; assert(await knob.evaluate((e, p) => document.elementFromPoint(p.x, p.y)?.closest('[data-mp-knob]') === e, { x, y })); await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y - 24, { steps: 4 }); await page.mouse.up(); assert.notEqual(await page.evaluate(() => mpQA.settings().speed), 1); await page.locator('#undoButton').click(); assert.deepEqual(await page.evaluate(() => mpQA.settings()), before); return { pointerHit: true, singleGestureUndo: true };
  });
  await check('Save and Open retain master playback settings without serializing prepared sample buffers', async () => {
    await page.evaluate(() => LoomApp.loadState(mpQA.fixture({ speed: .673, pitch: -3.25, preservePitch: false, algorithm: 'granular' })));
    const saved = await page.evaluate(() => LoomApp.getState()), pending = page.waitForEvent('download'); await page.locator('#saveButton').click(); const download = await pending, bytes = fs.readFileSync(await download.path()), json = JSON.parse(bytes);
    assert.deepEqual(json.state, saved); assert.deepEqual(json.state.master.playback, { speed: .673, pitch: -3.25, preservePitch: false, algorithm: 'granular' }); assert(!Object.keys(json.state.master.playback).some(key => /cache|left|right|pcm/i.test(key)));
    fs.writeFileSync(path.join(artifacts, 'master-speed-pitch.loom.json'), bytes); await page.evaluate(() => LoomApp.loadState(mpQA.blank())); await page.locator('#projectFile').setInputFiles({ name: 'master-speed-pitch.loom.json', mimeType: 'application/json', buffer: bytes }); await page.waitForFunction(() => mpQA.settings().speed === .673); assert.deepEqual(await page.evaluate(() => LoomApp.getState()), saved); return { savedBytes: bytes.length, portableSettingsExact: true };
  });
  await check('The master speed and pitch panel fits phone tablet and desktop widths', async () => {
    for (const width of [390, 768, 1440]) { await page.setViewportSize({ width, height: 1100 }); await reveal(page); const overflow = await panel(page).evaluate(element => [...element.querySelectorAll('button,input,select,output')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.left < -1 || r.right > innerWidth + 1); }).map(e => e.id || e.dataset.mpKnob)); assert.deepEqual(overflow, []); await panel(page).screenshot({ path: path.join(artifacts, 'master-playback-' + width + '.png') }); } await page.setViewportSize({ width: 1440, height: 1100 }); return { widths: [390, 768, 1440] };
  });
}
async function audioChecks(page) {
  await check('The actual Worker prepares stereo pitch-preserved playback with a source clock and current master meters', async () => {
    const result = await page.evaluate(async () => {
      await LoomApp.loadState(mpQA.fixture());
      const engine = LoomApp.engine, prototype = LoomMasterTransform.Processor.prototype, render = engine.renderMasterPCM, process = prototype.process;
      window.mpCounts = { renders: 0, transforms: 0 };
      engine.renderMasterPCM = function (...args) { mpCounts.renders++; return render.apply(this, args); };
      prototype.process = function (...args) { mpCounts.transforms++; return process.apply(this, args); };
      window.mpRestore = () => { engine.renderMasterPCM = render; prototype.process = process; };
      const started = await engine.play(0), controller = LoomApp.masterPlayback, cache = controller.cache;
      if (!started || !cache) throw Error('Prepared playback did not start');
      const first = engine.getTransport(controller.started + 1.25), wrapped = engine.getTransport(controller.started + 4.25), left = cache.buffer.getChannelData(0), right = cache.buffer.getChannelData(1);
      return { frames: cache.frames, bodyFrames: cache.bodyFrames, rate: cache.sampleRate, sourceRate: controller.source.playbackRate.value, first, wrapped, left440: mpQA.projection(left, 440, cache.sampleRate), right660: mpQA.projection(right, 660, cache.sampleRate), wrongLeft220: mpQA.projection(left, 220, cache.sampleRate), wrongRight330: mpQA.projection(right, 330, cache.sampleRate), notePlaybackActive: LoomApp.notePlayback.active, counts: { ...mpCounts } };
    });
    assert.equal(result.frames, 192000); assert.equal(result.bodyFrames, 192000); assert.equal(result.rate, 48000); assert.equal(result.sourceRate, 1); assert.equal(result.notePlaybackActive, false);
    assert(Math.abs(result.first.beat - 1.25) < 1e-7); assert.equal(result.first.tempo, 60); assert.equal(result.wrapped.cycle, 1); assert(Math.abs(result.wrapped.beat - .25) < 1e-7);
    assert(result.left440 > .02 && result.right660 > .02); assert(result.left440 > result.wrongLeft220 * 10); assert(result.right660 > result.wrongRight330 * 10);
    assert.deepEqual(result.counts, { renders: 1, transforms: 1 }); await page.waitForFunction(() => LoomApp.engine.getMeters().master.rms > .01);
    const meters = await page.evaluate(() => LoomApp.engine.getMeters()); assert(meters.tracks.every(m => m.rms === 0)); assert(meters.effects.every(rack => rack.length === 0)); assert(meters.master.rms > .01);
    const analysis = await page.evaluate(() => ({ disabled: document.querySelector('#masteringAnalysisStart').disabled, label: document.querySelector('#masteringSignalStatus').textContent, readings: [...document.querySelectorAll('[data-mastering-meter]')].map(node => node.textContent) }));
    assert(analysis.disabled); assert.equal(analysis.label, 'Prepared master'); assert(analysis.readings.every(value => value === '—')); return { ...result, audibleMaster: meters.master, analysis };
  });
  await check('Pause resume seek and view changes reuse the prepared master while an actual mix edit pauses and invalidates it', async () => {
    const paused = await page.evaluate(async () => { const engine = LoomApp.engine; engine.stop(); const beat = engine.getTransport().beat; await engine.play(); const resumed = engine.getTransport().beat; engine.seek(2.5); const seek = engine.getTransport().beat; LoomApp.selectTrack(2); return { beat, resumed, seek, counts: { ...mpCounts }, playing: engine.getMeters().playing }; });
    assert(Math.abs(paused.resumed - paused.beat) < .1); assert(Math.abs(paused.seek - 2.5) < .1); assert.deepEqual(paused.counts, { renders: 1, transforms: 1 }); assert(paused.playing);
    const level = page.locator('[data-bus-number="level"][data-owner="master"]'); await level.fill('.8'); await level.press('Tab');
    const invalidated = await page.evaluate(() => ({ playing: LoomApp.engine.getMeters().playing, cache: !!LoomApp.masterPlayback.cache, sourceCache: !!LoomApp.masterPlayback.sourceCache, phase: LoomApp.masterPlayback.getStatus().phase }));
    assert.equal(invalidated.playing, false); assert.equal(invalidated.cache, false); assert.equal(invalidated.sourceCache, false); assert.equal(invalidated.phase, 'stale'); await page.evaluate(() => mpRestore()); return { paused, invalidated };
  });
  await check('All additional algorithms prepare finite stereo pitch-preserved audio with the same exact duration and source clock', async () => {
    const rows = [];
    for (const algorithm of ['wsola', 'phase-vocoder', 'granular']) {
      const result = await page.evaluate(async algorithm => {
        await LoomApp.loadState(mpQA.fixture({ speed: .5, pitch: 0, preservePitch: true, algorithm }));
        if (!await LoomApp.engine.play(0)) throw Error('Algorithm preparation did not start: ' + algorithm);
        const controller = LoomApp.masterPlayback, cache = controller.cache, left = cache.buffer.getChannelData(0), right = cache.buffer.getChannelData(1);
        const stats = data => { let energy = 0, peak = 0; for (const sample of data) { if (!Number.isFinite(sample)) throw Error('Non-finite stretched audio'); peak = Math.max(peak, Math.abs(sample)); energy += sample * sample; } return { rms: Math.sqrt(energy / data.length), peak }; };
        return { algorithm: LoomApp.getState().master.playback.algorithm, frames: cache.frames, bodyFrames: cache.bodyFrames, sampleRate: cache.sampleRate, sourceRate: controller.source.playbackRate.value, first: LoomApp.engine.getTransport(controller.started + 1.25), wrapped: LoomApp.engine.getTransport(controller.started + 4.25), left: stats(left), right: stats(right), leftPitch: mpQA.bandPeak(left, 440, cache.sampleRate, algorithm === 'granular' ? 12 : 4), rightPitch: mpQA.bandPeak(right, 660, cache.sampleRate, algorithm === 'granular' ? 12 : 4), wrongLeft220: mpQA.projection(left, 220, cache.sampleRate), wrongRight330: mpQA.projection(right, 330, cache.sampleRate), leftCrossfeed: mpQA.projection(left, 660, cache.sampleRate), rightCrossfeed: mpQA.projection(right, 440, cache.sampleRate) };
      }, algorithm);
      assert.equal(result.algorithm, algorithm); assert.equal(result.frames, 192000); assert.equal(result.bodyFrames, 192000); assert.equal(result.sampleRate, 48000); assert.equal(result.sourceRate, 1);
      assert(Math.abs(result.first.beat - 1.25) < 1e-7); assert.equal(result.first.tempo, 60); assert.equal(result.wrapped.cycle, 1); assert(Math.abs(result.wrapped.beat - .25) < 1e-7);
      assert(result.left.rms > .01 && result.right.rms > .01); assert(result.left.peak < .15 && result.right.peak < .15);
      // Granular mode deliberately distributes partial energy across grain-rate
      // sidebands. Measure its dominant band rather than exact-bin cancellation.
      const cents = algorithm === 'granular' ? 45 : 12;
      for (const pitch of [result.leftPitch, result.rightPitch]) { assert(Math.abs(pitch.centsError) < cents, JSON.stringify(result)); assert(pitch.amplitude > .005, JSON.stringify(result)); }
      assert(result.leftPitch.amplitude > result.wrongLeft220 * 4 && result.rightPitch.amplitude > result.wrongRight330 * 4, JSON.stringify(result));
      assert(result.leftCrossfeed < .005 && result.rightCrossfeed < .005, JSON.stringify(result));
      rows.push(result);
    }
    return rows;
  });
  await check('Choosing another algorithm pauses the old master and refreshes its transformed cache while retaining the source mix', async () => {
    await page.evaluate(async () => { if (!LoomApp.masterPlayback.cache || mpQA.settings().algorithm !== 'granular') { await LoomApp.loadState(mpQA.fixture({ speed: .5, pitch: 0, preservePitch: true, algorithm: 'granular' })); await LoomApp.engine.play(0); } window.mpPreviousSource = LoomApp.masterPlayback.sourceCache; window.mpPreviousBuffer = LoomApp.masterPlayback.cache.buffer; });
    await reveal(page); await page.locator('#masterPlaybackAlgorithm').selectOption('wsola');
    const invalidated = await page.evaluate(() => ({ playing: LoomApp.engine.getMeters().playing, cache: !!LoomApp.masterPlayback.cache, sameSource: LoomApp.masterPlayback.sourceCache === mpPreviousSource, algorithm: mpQA.settings().algorithm }));
    assert.deepEqual(invalidated, { playing: false, cache: false, sameSource: true, algorithm: 'wsola' });
    const prepared = await page.evaluate(async () => ({ started: await LoomApp.engine.play(0), sameSource: LoomApp.masterPlayback.sourceCache === mpPreviousSource, newBuffer: LoomApp.masterPlayback.cache.buffer !== mpPreviousBuffer, algorithm: mpQA.settings().algorithm }));
    assert.deepEqual(prepared, { started: true, sameSource: true, newBuffer: true, algorithm: 'wsola' });
    return { invalidated, prepared };
  });
  await check('Stereo mix WAV exports honor both original and selected additional algorithms while individual stems retain nominal speed and pitch', async () => {
    const rows = [];
    for (const algorithm of ['signalsmith', 'wsola']) {
    const result = await page.evaluate(async algorithm => {
      const state = mpQA.fixture({ speed: .5, pitch: 12, preservePitch: true, algorithm }, false); await LoomApp.loadState(state); const engine = LoomApp.engine, assets = LoomApp.assets, options = { startBeat: 0, endBeat: 4, tailSeconds: 0 }, pcm = await engine.renderMasterPCM(state, assets, options), processor = new LoomMasterTransform.Processor();
      let expected; try { expected = await processor.process(pcm, state.master.playback); } finally { processor.dispose(); }
      const blob = await engine.renderWav(state, assets, options), bytes = await blob.arrayBuffer(), view = new DataView(bytes), frames = (bytes.byteLength - 44) / 4, channels = [new Float32Array(frames), new Float32Array(frames)];
      for (let i = 0; i < frames; i++) for (let c = 0; c < 2; c++) channels[c][i] = view.getInt16(44 + (i * 2 + c) * 2, true) / 32768;
      const alteredStem = new Uint8Array(await (await engine.renderWav(state, assets, { ...options, trackId: 'track-9' })).arrayBuffer()), neutral = structuredClone(state); neutral.master.playback = { speed: 1, pitch: 0, preservePitch: true };
      const nominalStem = new Uint8Array(await (await engine.renderWav(neutral, assets, { ...options, trackId: 'track-9' })).arrayBuffer());
      const near = (data, target) => { let best = { frequency: 0, amplitude: 0 }; for (let hz = target - 5; hz <= target + 5; hz += .25) { const amplitude = mpQA.projection(data, hz, 48000); if (amplitude > best.amplitude) best = { frequency: hz, amplitude }; } let crossings = 0; const start = Math.floor(data.length * .25), end = Math.floor(data.length * .75); for (let i = start + 1; i < end; i++) if (data[i - 1] <= 0 && data[i] > 0) crossings++; return { ...best, centsError: 1200 * Math.log2(best.frequency / target), zeroCrossingHz: crossings * 48000 / (end - start) }; };
      return { frames, expectedFrames: expected.left.length, rate: view.getUint32(24, true), bits: view.getUint16(34, true), left: mpQA.difference(channels[0], expected.left), right: mpQA.difference(channels[1], expected.right), left880: mpQA.projection(channels[0], 880, 48000), right1320: mpQA.projection(channels[1], 1320, 48000), leftSpectrum: near(channels[0], 880), rightSpectrum: near(channels[1], 1320), nominalStemExact: alteredStem.length === nominalStem.length && alteredStem.every((v, i) => v === nominalStem[i]), stemFrames: (alteredStem.length - 44) / 4, exportBusy: engine.getAudioDiagnostics().exportBusy };
    }, algorithm);
    assert.equal(result.frames, 192000); assert.equal(result.frames, result.expectedFrames); assert.equal(result.rate, 48000); assert.equal(result.bits, 16); assert(result.left.max <= 1 / 32768 + 1e-7 && result.right.max <= 1 / 32768 + 1e-7);
    // Pitch processing can shift the strongest partial by a few cents. Verify
    // its measured frequency explicitly instead of requiring exact-bin phase.
    for (const spectrum of [result.leftSpectrum, result.rightSpectrum]) { assert(Math.abs(spectrum.centsError) <= 5, JSON.stringify(result)); assert(spectrum.amplitude > .02, JSON.stringify(result)); }
    assert(result.nominalStemExact); assert.equal(result.stemFrames, 96000); assert.equal(result.exportBusy, false); rows.push({ algorithm, ...result });
    }
    return rows;
  });
  await check('Prepared mode rejects public recording microphone monitoring SERVICE and audition without opening live input', async () => {
    await page.evaluate(() => LoomApp.loadState(mpQA.fixture()));
    const result = await page.evaluate(() => {
      const engine = LoomApp.engine, rejected = [];
      for (const [method, args] of [['startRecording', [['track-9']]], ['startMicrophoneRecording', ['track-9']], ['startService', [{}]], ['resumeAudition', ['track-9']], ['setMicrophoneMonitoring', ['track-9', { enabled: true }]]]) { try { engine[method](...args); rejected.push({ method, rejected: false }); } catch (error) { rejected.push({ method, rejected: /reset|speed|pitch/i.test(error.message) }); } }
      return { rejected, recording: engine.recordingBusy, microphone: engine.getMicrophoneStatus().enabled, service: engine.getServiceState().active };
    }); assert(result.rejected.every(item => item.rejected)); assert.equal(result.recording, false); assert.equal(result.microphone, false); assert.equal(result.service, false); return result;
  });
  await check('Real BRINE written notes and its captured live phrase both pass through the prepared master without editing their sources', async () => {
    const result = await page.evaluate(async () => {
      const state = mpQA.blank(); state.loopEnabled = true; state.master.playback = { speed: .75, pitch: 5, preservePitch: true }; state.tracks[0].instrument = { id: 'brine', name: 'BRINE' }; state.tracks[0].level = .25;
      const packet = MusicLabPatternSchema.normalize({ format: 'musiclab-pattern', version: 1, name: 'Master held notes', sourceApp: 'brine', kind: 'notes', tempo: 120, swing: 0, lengthBeats: 4, meter: [4, 4], seed: 1347571509, voices: [{ id: 'synth', name: 'BRINE', pitch: 60 }], notes: [{ id: 'master-low', voice: 'synth', pitch: 48, beat: .25, duration: .75, velocity: .6, probability: 1 }, { id: 'master-high', voice: 'synth', pitch: 67, beat: 2, duration: .5, velocity: .5, probability: 1 }] });
      state.tracks[0].clips = [LoomSchema.noteClip({ id: 'master-native-notes', name: 'Master held notes', type: 'notes', pattern: packet, voiceMap: { synth: 'synth' }, start: 0, length: 4, sourceOffset: 0, rate: 1, loop: false, gain: .8, fadeIn: 0, fadeOut: 0, transpose: 0 }, 4)];
      state.tracks[0].effects[0] = LoomSchema.effect({ type: 'prism', params: { filter: 'lowpass', cutoff: 2200, mix: 1 } }); state.tracks[0].automation = [{ target: 'fx:0:cutoff', effectType: 'prism', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: 900 }, { beat: 4, value: 4000 }] }];
      await LoomApp.loadState(state);
      const trace = [], engine = LoomApp.engine, controller = LoomApp.masterPlayback, setState = engine.setState, status = controller._status, host = LoomApp.host, snapshot = host.snapshot; let firstSnapshot;
      const changedPaths = (a, b, prefix = '') => { if (JSON.stringify(a) === JSON.stringify(b)) return []; if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return [prefix]; return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(key => changedPaths(a[key], b[key], prefix ? prefix + '.' + key : key)).slice(0, 12); };
      host.snapshot = async function (...args) { const value = await snapshot.apply(this, args); if (args[0] === 'track-1') { trace.push({ event: 'snapshot', at: performance.now(), phase: controller.getStatus().phase, stateSameAsFirst: firstSnapshot ? JSON.stringify(firstSnapshot.state) === JSON.stringify(value.state) : null, storageSameAsFirst: firstSnapshot ? JSON.stringify(firstSnapshot.storage) === JSON.stringify(value.storage) : null, changedStatePaths: firstSnapshot ? changedPaths(firstSnapshot.state, value.state) : [], changedStorageKeys: firstSnapshot ? changedPaths(firstSnapshot.storage, value.storage) : [] }); firstSnapshot ||= structuredClone(value); } return value; };
      engine.setState = function (next) { trace.push({ event: 'setState', at: performance.now(), phase: controller.getStatus().phase, sourceKeyChanged: LoomMasterPlayback.soundKey(next) !== controller.sourceKey, hasSnapshot: !!next.tracks[0].instrument?.snapshot }); return setState.call(this, next); };
      controller._status = function (phase, progress, message) { if (trace.at(-1)?.phase !== phase) trace.push({ event: 'status', at: performance.now(), phase, message }); return status.call(this, phase, progress, message); };
      let started; try { started = await engine.play(0); } finally { engine.setState = setState; controller._status = status; host.snapshot = snapshot; }
      if (!started) throw Error('Written BRINE master preparation was canceled: ' + JSON.stringify(trace));
      const rms = data => Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / Math.max(1, data.length)), capture = () => ({ sourceRms: rms(LoomApp.masterPlayback.sourceCache.audio.left), outputRms: rms(LoomApp.masterPlayback.cache.buffer.getChannelData(0)), frames: LoomApp.masterPlayback.cache.frames, notePlaybackActive: LoomApp.notePlayback.active });
      const written = capture(), unchangedPattern = JSON.stringify(LoomApp.getState().tracks[0].clips[0].pattern) === JSON.stringify(state.tracks[0].clips[0].pattern); LoomApp.engine.stop();
      await LoomApp.host.importPattern('track-1', packet, { replace: true }); const live = LoomApp.getState(); live.tracks[0].instrument.snapshot = await LoomApp.host.snapshot('track-1'); live.tracks[0].clips = []; live.tracks[0].instrumentLive = true;
      await LoomApp.loadState(live); if (!await LoomApp.engine.play(0)) throw Error('Live BRINE master preparation was canceled');
      const capturedLive = capture(), retained = LoomApp.getState().tracks[0]; LoomApp.engine.stop(); return { written, capturedLive, unchangedPattern, liveFlagRetained: retained.instrumentLive, originalClipsRetained: retained.clips.length === 0, privateRenders: LoomApp.noteRenderer.operations.size };
    });
    for (const row of [result.written, result.capturedLive]) { assert(row.sourceRms > 1e-4 && row.outputRms > 1e-4); assert.equal(row.frames, 128000); assert.equal(row.notePlaybackActive, false); }
    assert(result.unchangedPattern && result.liveFlagRetained && result.originalClipsRetained); assert.equal(result.privateRenders, 0); return result;
  });
  await check('Cancel preparation and replacing the project cannot play an obsolete master after the asynchronous render returns', async () => {
    const rows = [];
    for (const action of ['cancel', 'replace']) {
      await page.evaluate(async () => {
        await LoomApp.loadState(mpQA.fixture({ speed: .75, pitch: -2, preservePitch: true })); const engine = LoomApp.engine, render = engine.renderMasterPCM;
        window.mpRenderEntered = false; window.mpRenderRestore = () => { engine.renderMasterPCM = render; };
        engine.renderMasterPCM = async function (...args) { mpRenderEntered = true; await new Promise(resolve => { window.mpRenderRelease = resolve; }); return render.apply(this, args); };
        window.mpPending = engine.play(0); mpPending.catch(() => {});
      }); await page.waitForFunction(() => mpRenderEntered); await reveal(page);
      if (action === 'cancel') await page.locator('#masterPlaybackCancel').click(); else await page.evaluate(() => LoomApp.loadState(mpQA.blank()));
      const row = await page.evaluate(async () => { mpRenderRelease(); try { const started = await mpPending; return { started, playing: LoomApp.engine.getMeters().playing, source: !!LoomApp.masterPlayback.source, phase: LoomApp.masterPlayback.getStatus().phase }; } finally { mpRenderRestore(); } });
      assert.equal(row.started, false); assert.equal(row.playing, false); assert.equal(row.source, false); rows.push({ action, ...row });
    }
    return rows;
  });
}
async function run() {
  const url = process.argv[2] || process.env.MASTER_PLAYBACK_QA_URL || await serve(); browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] }); let context, page;
  try { ({ context, page } = await pageFor(url)); await uiChecks(page); await audioChecks(page); assert.deepEqual(errors, []); assert.deepEqual(external, []); save(); console.log('PASS no browser errors or external runtime dependencies'); }
  finally { if (page && !page.isClosed()) await page.evaluate(async () => { LoomApp.masterPlayback.cancel(); LoomApp.host.dispose(); await LoomApp.noteRenderer.dispose(); await LoomApp.engine.dispose(); }).catch(() => {}); if (context) await context.close(); await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
}
module.exports = { run };
if (require.main === module) run().catch(error => { fs.writeFileSync(path.join(artifacts, 'failure.json'), JSON.stringify({ message: error.stack || String(error), passed, errors, external }, null, 2) + '\n'); console.error(error); process.exitCode = 1; });
