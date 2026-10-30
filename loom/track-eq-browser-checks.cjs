'use strict';

// Maintained-source track EQ integration, including the separately serialized
// AudioWorklet. LOOM_TRACK_EQ_QA_BUILT=1 selects the generated standalone instead.
// Select phases with LOOM_TRACK_EQ_QA_PHASES=dsp,worklet,fallback,ui.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const shared = fs.existsSync(path.join(__dirname, 'shared', 'pattern-schema.js')) ? path.join(__dirname, 'shared') : path.join(root, 'shared');
const artifacts = process.env.LOOM_TRACK_EQ_QA_DIR || '/tmp/track-eq-browser-qa';
const scripts = ['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'preamp-catalog.js', 'tape-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'tape-dsp.js', 'effects.js', 'schema.js', 'audio-engine.js'];
const bands = ['low', 'lowMid', 'highMid', 'high'];
const passed = [];
const screenshotStyle = '.transport{position:static!important}#status{visibility:hidden!important}';

function maintainedHTML() {
  if (process.env.LOOM_TRACK_EQ_QA_PREVIEW) return fs.readFileSync(process.env.LOOM_TRACK_EQ_QA_PREVIEW);
  if (process.env.LOOM_TRACK_EQ_QA_BUILT) return fs.readFileSync(path.join(__dirname, 'index.html'));
  const python = `from pathlib import Path
import ast,base64,json,re,runpy,sys
p=Path(sys.argv[1]); shared=Path(sys.argv[2]); source=(p/'build.py').read_text(); tree=ast.parse(source)
names=next(ast.literal_eval(node.value) for node in tree.body if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='SCRIPTS' for t in node.targets))
css='\\n'.join((p/name).read_text() for name in dict.fromkeys(re.findall(r"ROOT / '([^']+\\.css)'",source)))
fonts=[]
for family,weight,style,name in [('Loom Sans',400,'normal','noto-sans-regular.woff2'),('Loom Sans',700,'normal','noto-sans-bold.woff2'),('Loom Serif',400,'normal','noto-serif-regular.woff2'),('Loom Serif',400,'italic','noto-serif-italic.woff2')]:
 data=base64.b64encode((p/'fonts'/name).read_bytes()).decode(); fonts.append('@font-face{font-family:'+repr(family)+';font-style:'+style+';font-weight:'+str(weight)+';src:url(data:font/woff2;base64,'+data+") format('woff2')}")
css=css.replace('/* FONT_FACES */','\\n'.join(fonts))
code='window.LoomEmbeddedInstruments={};window.LoomDemoAssets={};window.LoomDemoTemplate=null;\\n'+'\\n'.join((p/name).read_text() for name in names)
html=(p/'app.html').read_text().replace('<!-- STYLES -->','<style>'+css+'</style>').replace('<!-- SCRIPTS -->','<script>'+code.replace('</script','<\\\\/script')+'</script>')
helpers=runpy.run_path(str(shared/'bundle_audio_exchange.py'));sys.stdout.write(helpers['embed_exchange'](html,'loom',p))`;
  return execFileSync('python3', ['-c', python, __dirname, shared], { maxBuffer: 32 * 1024 * 1024 });
}
async function serve() {
  let ui;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/engine.html' && process.env.LOOM_TRACK_EQ_QA_BUILT) { ui ||= maintainedHTML(); response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); response.end(ui); return; }
    if (pathname === '/engine.html') {
      response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      response.end('<!doctype html><html><body><script src="/shared/pattern-schema.js"></script>' + scripts.map(file => '<script src="/loom/' + file + '"></script>').join('') + '</body></html>'); return;
    }
    if (pathname === '/loom/index.html') { ui ||= maintainedHTML(); response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); response.end(ui); return; }
    const base = pathname.startsWith('/loom/') ? __dirname : pathname.startsWith('/shared/') ? shared : root;
    const relative = pathname.startsWith('/loom/') ? pathname.slice(5) : pathname.startsWith('/shared/') ? pathname.slice(7) : pathname;
    const file = path.resolve(base, '.' + relative);
    if (!file.startsWith(base + path.sep)) { response.writeHead(403); response.end(); return; }
    fs.readFile(file, (error, data) => { if (error) { response.writeHead(404); response.end(); return; } response.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(data); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: 'http://127.0.0.1:' + server.address().port, close: () => new Promise(resolve => server.close(resolve)) };
}
async function helpers(page) {
  await page.evaluate(() => {
    window.eqQA = {
      bands: ['low', 'lowMid', 'highMid', 'high'],
      flat: () => ({ low: 0, lowMid: 0, highMid: 0, high: 0 }),
      blank() {
        const s = LoomSchema.defaultState(); s.name = 'Track EQ browser session'; s.tempo = 120; s.lengthBars = 2; s.loopEnabled = false; s.loopStart = 0; s.loopEnd = 2; s.master.level = 1; s.master.effects.fill(null);
        s.returns.forEach(owner => { owner.effects.fill(null); owner.level = 1; }); s.tracks.forEach(t => { t.instrumentLive = false; t.level = 1; t.eq = this.flat(); }); s.recording.micCompensation = 'off'; s.recording.micInputGainDb = 0; return s;
      },
      stats(a, start = 0) { let sum = 0, peak = 0; for (let i = start; i < a.length; i++) { if (!Number.isFinite(a[i])) return { finite: false }; sum += a[i] * a[i]; peak = Math.max(peak, Math.abs(a[i])); } return { finite: true, rms: Math.sqrt(sum / Math.max(1, a.length - start)), peak }; },
      difference(a, b) { let max = 0; for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i])); return max; },
      projection(a, hz, rate = 48000) { let real = 0, imaginary = 0; for (let i = 0; i < a.length; i++) { real += a[i] * Math.cos(2 * Math.PI * hz * i / rate); imaginary += a[i] * Math.sin(2 * Math.PI * hz * i / rate); } return 2 * Math.hypot(real, imaginary) / a.length; },
      sine(hz, frames = 24000, amplitude = .03, rate = 48000) { return Float32Array.from({ length: frames }, (_, i) => amplitude * Math.sin(2 * Math.PI * hz * i / rate)); },
      render(s, source, block = 128, options = {}) {
        const core = new (createLoomEngineDSP(createLoomEffectsDSP).Core)(s, {}, 48000, { linear: true, ...options }); core.start(0);
        const left = new Float32Array(source.length), right = new Float32Array(source.length);
        for (let at = 0; at < left.length; at += block) { const n = Math.min(block, left.length - at), inputs = Array.from({ length: 9 }, (_, i) => i === 0 ? [source.subarray(at, at + n), source.subarray(at, at + n)] : []); core.processBlock(left.subarray(at, at + n), right.subarray(at, at + n), inputs); }
        return { left, right };
      },
      fixture() {
        const s = this.blank();
        for (let t = 0; t < 8; t++) {
          const left = Float32Array.from({ length: 12000 }, (_, i) => .008 * Math.sin(2 * Math.PI * (95 + t * 153) * i / 48000) + .003 * Math.sin(2 * Math.PI * (2400 + t * 107) * i / 48000)), right = Float32Array.from(left, (v, i) => v * .7 + .001 * Math.cos(i * .071));
          const asset = LoomSchema.encodeAsset({ id: 'eq-audio-' + t, name: 'EQ source ' + t, left, right, sampleRate: 48000 }); s.assets.push(asset);
          s.tracks[t].clips = [{ id: 'eq-clip-' + t, name: 'EQ clip ' + t, assetId: asset.id, start: .25, length: .5, sourceStart: 0, sourceEnd: .25, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: 1, fadeIn: 0, fadeOut: 0 }];
          s.tracks[t].eq = { low: t - 2, lowMid: 4 - t, highMid: t / 2 - 2, high: 2 - t / 2 }; s.tracks[t].sends = [.2, .1];
          s.tracks[t].automation = [{ target: 'eq:lowMid', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: -6 + t }, { beat: 1, value: 6 - t }] }];
        }
        return s;
      }
    };
  });
}
async function dspChecks(browser, url) {
  const page = await browser.newPage();
  try {
    await page.goto(url + '/engine.html'); await helpers(page);
    const result = await page.evaluate(() => {
      const q = eqQA, s = q.blank(); s.tracks[0].instrumentLive = true;
      const source = Float32Array.from({ length: 16003 }, (_, i) => .03 * Math.sin(i * .043) + .007 * Math.cos(i * .471)), flat = q.render(s, source), legacy = structuredClone(s); legacy.tracks.forEach(t => delete t.eq);
      const report = { legacyError: q.difference(flat.left, q.render(legacy, source).left), bands: [], oddError: 0 };
      for (const [key, hz] of [['low', 30], ['lowMid', 400], ['highMid', 2500], ['high', 16000]]) {
        const tone = q.sine(hz), baseline = q.render(s, tone); const plus = structuredClone(s), minus = structuredClone(s); plus.tracks[0].eq[key] = 12; minus.tracks[0].eq[key] = -12;
        const a = q.render(plus, tone), b = q.render(minus, tone); report.bands.push({ key, boost: q.stats(a.left, 12000).rms / q.stats(baseline.left, 12000).rms, cut: q.stats(b.left, 12000).rms / q.stats(baseline.left, 12000).rms });
      }
      s.tracks[0].eq = { low: 3, lowMid: -5, highMid: 7, high: -2 }; s.tracks[0].automation = [{ target: 'eq:highMid', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: -12 }, { beat: 1, value: 12 }] }];
      const a = q.render(s, source, 128), b = q.render(s, source, 37); report.oddError = Math.max(q.difference(a.left, b.left), q.difference(a.right, b.right)); report.stereoError = q.difference(a.left, a.right);
      const old = q.fixture(), current = JSON.parse(LoomSchema.serializeProject(old)); current.appVersion = '1.17.0'; current.state.tracks.forEach(t => delete t.eq); const migrated = LoomSchema.parseProject(JSON.stringify(current)); report.migratedFlat = migrated.tracks.every(t => Object.values(t.eq).every(v => v === 0));
      current.appVersion = LoomSchema.VERSION; report.currentRejectsMissing = false; try { LoomSchema.parseProject(JSON.stringify(current)); } catch { report.currentRejectsMissing = true; }
      return report;
    });
    assert.equal(result.legacyError, 0); assert.equal(result.oddError, 0); assert.equal(result.stereoError, 0); assert(result.migratedFlat && result.currentRejectsMissing);
    for (const band of result.bands) { assert(band.boost > 2.5, 'Actual boost response ' + JSON.stringify(band)); assert(band.cut < .4, 'Actual cut response ' + JSON.stringify(band)); }
    passed.push('Actual browser Core has four audible bands, exact flat/legacy audio, independent deterministic odd-block automation and strict migration');
  } finally { await page.close(); }
}
async function audioTime(page, seconds) { const until = await page.evaluate(seconds => eqQA.engine.context.currentTime + seconds, seconds); await page.waitForFunction(until => eqQA.engine.context.currentTime >= until, until, { timeout: 60000 }); }
async function installInput(page, fallback) {
  await helpers(page); await page.evaluate(async fallback => {
    if (fallback) window.AudioWorkletNode = undefined;
    const q = eqQA, s = q.blank(), engine = q.engine = new LoomAudio(s); await engine.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'live' }); await engine.init(); await engine.context.resume(); q.sources = []; q.input = engine.context.createGain();
    for (const hz of [100, 400, 2500, 10000]) { const source = engine.context.createOscillator(), gain = engine.context.createGain(); source.frequency.value = hz; gain.gain.value = .02; source.connect(gain); gain.connect(q.input); source.start(); q.sources.push(source); }
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { const destination = engine.context.createMediaStreamDestination(); q.input.connect(destination); const stream = destination.stream, track = stream.getAudioTracks()[0], get = track.getSettings.bind(track); track.getSettings = () => ({ ...get(), latency: 0, sampleRate: engine.context.sampleRate }); return stream; } });
    await engine.setMicrophoneMonitoring('track-1', { enabled: true }); const analyser = q.analyser = engine.context.createAnalyser(); analyser.fftSize = 8192; engine.node.connect(analyser);
    q.signal = () => { const a = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(a); return { ...q.stats(a), levels: [100, 400, 2500, 10000].map(hz => q.projection(a, hz)) }; };
    q.route = async (index, patch = {}, send = false, pre = false) => { const state = q.blank(); state.tracks[index].eq = { ...q.flat(), ...patch }; if (send) { state.tracks[index].sends[0] = 1; state.tracks[index].sendPre[0] = pre; state.tracks[index].level = pre ? 0 : 1; state.returns[0].solo = true; } engine.setState(state); await engine.setMicrophoneMonitoring('track-' + (index + 1), { enabled: true }); };
  }, fallback);
}
async function offlineChecks(page) {
  return page.evaluate(async () => {
    const q = eqQA, state = LoomSchema.parseProject(LoomSchema.serializeProject(q.fixture())), assets = LoomSchema.decodeAssets(state.assets), results = [];
    for (const options of [{}, ...Array.from({ length: 8 }, (_, i) => ({ trackId: 'track-' + (i + 1) })), { returnId: 'return-1' }, { returnId: 'return-2' }]) {
      const blob = await q.engine.renderWav(state, assets, { ...options, snapshotReady: true, startBeat: 0, endBeat: 1, tailSeconds: .15 }), view = new DataView(await blob.arrayBuffer()), core = new (createLoomEngineDSP(createLoomEffectsDSP).Core)(state, assets, 48000, { linear: true, ...options }); core.start(0); let error = 0, peak = 0, leading = 0;
      for (let at = 0; at < 31200;) { if (at === 24000) core.stop(); const n = Math.min(137, 31200 - at, at < 24000 ? 24000 - at : 31200 - at), left = new Float32Array(n), right = new Float32Array(n); core.processBlock(left, right); for (let i = 0; i < n; i++) for (let channel = 0; channel < 2; channel++) { const value = Math.max(-1, Math.min(1, (channel ? right : left)[i])), expected = Math.round(value * (value < 0 ? 32768 : 32767)), actual = view.getInt16(44 + (at + i) * 4 + channel * 2, true); error = Math.max(error, Math.abs(actual - expected)); peak = Math.max(peak, Math.abs(actual)); if (at + i < 6000) leading = Math.max(leading, Math.abs(actual)); } at += n; }
      results.push({ options, bytes: view.byteLength, error, peak, leading });
    }
    return results;
  });
}
async function engineChecks(browser, url, fallback) {
  const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(url + '/engine.html'); await installInput(page, fallback); await audioTime(page, .3);
    const raw = await page.evaluate(() => ({ ...eqQA.signal(), mode: eqQA.engine.mode, frames: eqQA.engine.getAudioDiagnostics().processingFrames, inputs: eqQA.engine.node.numberOfInputs })); assert.equal(raw.mode, fallback ? 'fallback' : 'worklet'); assert.equal(raw.frames, fallback ? 256 : 128); if (!fallback) assert.equal(raw.inputs, 9); assert(raw.finite && raw.rms > .01);
    for (let i = 0; i < 8; i++) { await page.evaluate(i => eqQA.route(i, { low: 12, lowMid: 12, highMid: 12, high: 12 }), i); await audioTime(page, .3); const live = await page.evaluate(() => eqQA.signal()); assert(live.finite && live.rms > raw.rms * 2, 'Actual EQ on track' + (i + 1) + ': ' + JSON.stringify(live)); }
    await page.evaluate(async () => { const q = eqQA; await q.route(0); q.engine.state.tracks[0].automation = [{ target: 'eq:low', enabled: true, interpolation: 'hold', points: [{ beat: 0, value: 12 }] }]; q.engine.setState(q.engine.state); }); await audioTime(page, .3); const parked = await page.evaluate(() => ({ ...eqQA.signal(), playing: eqQA.engine.getMeters().playing })); assert.equal(parked.playing, false); assert(parked.levels[0] > raw.levels[0] * 1.7, 'Enabled EQ Read affects stopped microphone monitoring at the parked cursor');
    await page.evaluate(() => { const q = eqQA; q.engine.state.tracks[0].automation[0].enabled = false; q.engine.setState(q.engine.state); }); await audioTime(page, .3); const unparked = await page.evaluate(() => eqQA.signal()); assert(Math.abs(unparked.levels[0] / raw.levels[0] - 1) < .08, 'Disabling stopped Read restores the manual gain in the actual audio path');
    for (const pre of [false, true]) { await page.evaluate(pre => eqQA.route(0, { low: 12, lowMid: 12, highMid: 12, high: 12 }, true, pre), pre); await audioTime(page, .3); const send = await page.evaluate(() => eqQA.signal()); assert(send.finite && send.rms > raw.rms * 2, (pre ? 'Pre' : 'Post') + ' sends receive source EQ'); }
    await page.evaluate(async () => { const q = eqQA; await q.route(0, { low: 12, lowMid: 12, highMid: 12, high: 12 }); q.engine.state.master.mute = true; q.engine.setState(q.engine.state); }); await audioTime(page, .4); const muted = await page.evaluate(() => eqQA.signal()); assert(muted.rms < 1e-5, 'Master mute settles beyond the analyser history and its smooth ramp: ' + JSON.stringify(muted));
    if (fallback) await page.evaluate(() => { const q = eqQA, callback = q.engine.node.onaudioprocess; q.rawReferences = []; q.engine.node.onaudioprocess = event => { if (q.engine.recorder.active && q.engine.recorder.microphone) q.rawReferences.push([event.inputBuffer.getChannelData(16).slice(), event.inputBuffer.getChannelData(17).slice()]); callback(event); }; });
    await page.evaluate(() => eqQA.engine.startMicrophoneRecording('track-1', { startTransport: false, maxSeconds: .25 })); await page.waitForFunction(() => !eqQA.engine.isRecording, null, { timeout: 60000 });
    const take = await page.evaluate(async () => { const q = eqQA, audio = (await q.engine.stopRecording())[0]; let rawError = null; if (q.rawReferences) { rawError = 0; let at = 0; for (const [l, r] of q.rawReferences) for (let i = 0; i < l.length && at < audio.frames; i++, at++) rawError = Math.max(rawError, Math.abs(audio.left[at] - l[i]), Math.abs(audio.right[at] - r[i])); } const a = audio.left.subarray(2000); return { ...q.stats(audio.left), frames: audio.frames, rate: audio.sampleRate, levels: [100, 400, 2500, 10000].map(hz => q.projection(a, hz)), rawError }; });
    assert(take.finite && take.rms > .015 && take.rms < .04, 'EQ remains outside dry microphone capture: ' + JSON.stringify(take)); assert.equal(take.frames, .25 * take.rate); if (fallback) assert.equal(take.rawError, 0, 'Fallback microphone capture retains every raw callback sample'); for (const level of take.levels) assert(level > .015 && level < .025, 'Dry recorded band level is unchanged: ' + JSON.stringify(take));
    const offline = await offlineChecks(page); for (const row of offline) { assert.equal(row.bytes, 44 + 31200 * 4); assert(row.peak > 1 && row.error <= 1, 'EQ automation survives compact realtime state and matches 137-frame WAV/stems: ' + JSON.stringify(row)); assert.equal(row.leading, 0); }
    assert.deepEqual(errors, []); passed.push((fallback ? 'Fallback' : 'Serialized Worklet') + ' all8track EQ, pre/post sends, unchanged9inputs/latency, dry mic and automated mix/eight direct/two return WAV parity');
  } finally { await page.evaluate(async () => { eqQA.sources?.forEach(s => s.stop()); await eqQA.engine?.dispose(); await window.LoomApp?.engine?.dispose(); }).catch(() => {}); await page.close(); }
}
const knob = (page, index, band) => page.locator('#eq-' + index + '-' + band);
const eqState = (page, index = 0) => page.evaluate(i => LoomApp.getState().tracks[i].eq, index);
async function dragKnob(page, index, band, pixels, fine = false, cancel = false) {
  const control = knob(page, index, band); await control.scrollIntoViewIfNeeded(); const box = await control.boundingBox(); const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); if (fine) await page.keyboard.down('Shift'); await page.mouse.down(); await page.mouse.move(x, y - pixels, { steps: 8 });
  if (cancel) await control.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', bubbles: true }); await page.mouse.up(); if (fine) await page.keyboard.up('Shift');
}
async function uiChecks(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true, reducedMotion: 'reduce', acceptDownloads: true }), page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message)); await context.route('**/*', route => { if (route.request().url() === url + '/loom/index.html') return route.continue(); requests.push(route.request().url()); return route.abort(); });
  try {
    await page.goto(url + '/loom/index.html'); await page.waitForFunction(() => window.LoomApp); await helpers(page);
    await page.evaluate(async () => { const s = eqQA.blank(); s.selectedTrack = 3; await LoomApp.loadState(s); });
    assert.equal(await page.locator('.track-eq-knob[role="slider"]').count(), 32, 'All eight tracks expose four actual rotary knobs'); assert.equal(await page.locator('.track-eq-knob svg').count(), 32, 'Every gain control has a visible rotary face');
    for (let i = 0; i < 8; i++) for (const band of bands) { const control = knob(page, i, band); assert.equal(await control.getAttribute('aria-valuemin'), '-12'); assert.equal(await control.getAttribute('aria-valuemax'), '12'); assert.equal(Number(await control.getAttribute('aria-valuenow')), 0); assert.match(await control.getAttribute('aria-label'), /track|eq/i); assert.match(await control.getAttribute('aria-valuetext'), /dB/i); }
    await dragKnob(page, 0, 'low', 40); let actual = await eqState(page); assert(Math.abs(actual.low - 6) <= .2, 'Dragging up raises gain: ' + JSON.stringify(actual)); assert.equal(await page.evaluate(() => document.activeElement.id), 'eq-0-low'); assert.equal(await page.evaluate(() => LoomApp.getState().selectedTrack), 3, 'Knob drag does not select/rebuild a different strip');
    await page.locator('#undoButton').click(); assert.equal((await eqState(page)).low, 0, 'One Undo reverses the complete drag'); await page.locator('#redoButton').click(); assert(Math.abs((await eqState(page)).low - 6) <= .2); await knob(page, 0, 'low').dblclick(); assert.equal((await eqState(page)).low, 0, 'Double-click centres one band');
    await dragKnob(page, 0, 'lowMid', 40, true); actual = await eqState(page); assert(Math.abs(actual.lowMid - 1) <= .1, 'Shift gives fine pointer adjustment'); await page.locator('#undoButton').click(); assert.equal((await eqState(page)).lowMid, 0);
    await dragKnob(page, 0, 'highMid', -20); assert((await eqState(page)).highMid < 0, 'Dragging down cuts gain'); await page.locator('#undoButton').click();
    await dragKnob(page, 0, 'high', 10, false, true); const cancelled = (await eqState(page)).high; await page.mouse.move(10, 10); assert.equal((await eqState(page)).high, cancelled, 'Canceled pointer does not keep changing'); await page.locator('#undoButton').click(); assert.equal((await eqState(page)).high, 0);
    const control = knob(page, 0, 'low'); await control.focus(); await control.press('ArrowUp'); assert.equal((await eqState(page)).low, .1); await control.press('Shift+ArrowUp'); assert.equal((await eqState(page)).low, 1.1); await control.press('PageUp'); assert.equal((await eqState(page)).low, 2.1); await control.press('Home'); assert.equal((await eqState(page)).low, -12); await control.press('End'); assert.equal((await eqState(page)).low, 12); await control.press('Enter'); assert.equal((await eqState(page)).low, 0); await control.press('ArrowDown'); await control.press('Space'); assert.equal((await eqState(page)).low, 0); assert.equal(await page.evaluate(() => LoomApp.engine.getMeters().playing), false, 'Knob keys do not start transport');
    for (let i = 0; i < 8; i++) { for (const band of bands) { await knob(page, i, band).focus(); await knob(page, i, band).press('Shift+ArrowUp'); assert.equal((await eqState(page, i))[band], 1); } const others = await page.evaluate(() => LoomApp.getState().tracks.map(t => t.eq)); await page.locator('[data-eq-flat="' + i + '"]').click(); assert.deepEqual(await eqState(page, i), { low: 0, lowMid: 0, highMid: 0, high: 0 }); const after = await page.evaluate(() => LoomApp.getState().tracks.map(t => t.eq)); for (let t = 0; t < 8; t++) if (t !== i) assert.deepEqual(after[t], others[t]); await page.locator('#undoButton').click(); assert.deepEqual(await eqState(page, i), others[i]); }
    await page.evaluate(async () => { const s = eqQA.blank(); s.selectedTrack = 0; await LoomApp.loadState(s); }); await page.locator('#loomAutoTarget').selectOption('eq:low'); await page.locator('[data-auto-action="write"]').click(); await page.locator('#playButton').click(); await page.waitForFunction(() => LoomApp.engine.getMeters().playing);
    await dragKnob(page, 0, 'low', 30); await page.locator('#pauseButton').click(); const written = await page.evaluate(() => LoomApp.getState().tracks[0].automation.find(l => l.target === 'eq:low')); assert(written?.points?.length >= 2 && written.points.some(p => p.value > 1), 'Actual knob movement writes a track EQ automation lane');
    await page.evaluate(() => LoomApp.selectBus('master')); await page.locator('[data-auto-action="write"]').click(); const masterBefore = await page.evaluate(() => LoomApp.getState().master.automation); await page.locator('#playButton').click(); await page.waitForFunction(() => LoomApp.engine.getMeters().playing); await dragKnob(page, 2, 'high', 20); await page.locator('#pauseButton').click(); assert.deepEqual(await page.evaluate(() => LoomApp.getState().master.automation), masterBefore, 'A track knob cannot write a bus lane'); assert((await page.locator('#loomAutoTarget option').allTextContents()).every(label => !/EQ/.test(label)), 'Bus automation has no channel EQ targets');
    await page.evaluate(async () => { const s = eqQA.blank(); s.lengthBars = 16; s.loopEnd = 16; s.tracks[0].automation = [{ target: 'eq:low', enabled: true, interpolation: 'hold', points: [{ beat: 0, value: 8 }] }]; await LoomApp.loadState(s); eqQA.engine = LoomApp.engine; }); await page.locator('#playButton').click(); await page.waitForFunction(() => LoomApp.engine.getMeters().playing); await audioTime(page, .3); await page.waitForFunction(() => Number(document.querySelector('#eq-0-low').getAttribute('aria-valuenow')) === 8); assert.equal((await eqState(page)).low, 0, 'Read display does not overwrite the stored manual gain');
    const automatedKnob = knob(page, 0, 'low'); await automatedKnob.scrollIntoViewIfNeeded(); const automatedBox = await automatedKnob.boundingBox(), automatedX = automatedBox.x + automatedBox.width / 2, automatedY = automatedBox.y + automatedBox.height / 2;
    await page.mouse.move(automatedX, automatedY); await page.mouse.down(); await page.mouse.move(automatedX, automatedY - 10, { steps: 4 }); assert.equal((await eqState(page)).low, 9.5, 'Touching a Read-automated knob starts from its displayed gain'); await audioTime(page, .1); assert.equal(Number(await automatedKnob.getAttribute('aria-valuenow')), 9.5, 'The active gesture display is not overwritten by Read animation'); await page.mouse.up(); await page.locator('#pauseButton').click(); await page.waitForFunction(() => Number(document.querySelector('#eq-0-low').getAttribute('aria-valuenow')) === 8); assert.equal((await eqState(page)).low, 9.5, 'Stopped Read shows its parked curve while preserving the manual adjustment'); await page.locator('#undoButton').click(); assert.equal((await eqState(page)).low, 0); assert.equal(Number(await knob(page, 0, 'low').getAttribute('aria-valuenow')), 8, 'Undo restores manual gain without hiding the audible stopped Read level'); await page.locator('#loomAutoTarget').selectOption('eq:low'); await page.locator('[data-auto-field="enabled"]').uncheck(); await page.waitForFunction(() => Number(document.querySelector('#eq-0-low').getAttribute('aria-valuenow')) === 0);
    await page.evaluate(async () => { const s = eqQA.fixture(); s.selectedTrack = 2; await LoomApp.loadState(s); }); const saved = await page.evaluate(() => LoomApp.getState()), pending = page.waitForEvent('download'); await page.locator('#saveButton').click(); const download = await pending, bytes = fs.readFileSync(await download.path()); assert.deepEqual(JSON.parse(bytes).state, saved, 'Downloaded projects retain all four gains and EQ lanes on every track');
    await knob(page, 0, 'low').press('End'); await page.locator('#projectFile').setInputFiles({ name: 'eq-roundtrip.loom.json', mimeType: 'application/json', buffer: bytes }); await page.waitForFunction(expected => JSON.stringify(LoomApp.getState().tracks.map(t => [t.eq, t.automation])) === JSON.stringify(expected), saved.tracks.map(t => [t.eq, t.automation]));
    await page.waitForFunction(expected => { const recovered = JSON.parse(localStorage.getItem('loom-session-v1') || '{}'); return JSON.stringify(recovered.state?.tracks?.map(t => [t.eq, t.automation])) === JSON.stringify(expected); }, saved.tracks.map(t => [t.eq, t.automation])); await page.reload(); await page.waitForFunction(() => window.LoomApp); await helpers(page); assert.deepEqual(await page.evaluate(() => LoomApp.getState().tracks.map(t => [t.eq, t.automation])), saved.tracks.map(t => [t.eq, t.automation]), 'Recovery restores every EQ and curve');
    const legacy = JSON.parse(bytes); legacy.appVersion = '1.17.0'; legacy.state.tracks.forEach(t => { delete t.eq; t.automation = t.automation.filter(l => !l.target.startsWith('eq:')); }); await page.locator('#projectFile').setInputFiles({ name: 'legacy-1.17.loom.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) }); await page.waitForFunction(() => LoomApp.getState().tracks.every(t => Object.values(t.eq).every(v => v === 0))); assert.equal(await page.locator('.track-eq-knob').count(), 32);
    await page.evaluate(async () => { const s = eqQA.blank(); s.tracks.forEach((t, i) => { t.eq = { low: i - 3, lowMid: 3 - i, highMid: i / 2, high: -i / 2 }; }); await LoomApp.loadState(s); });
    for (const width of [320, 390, 1440]) { await page.setViewportSize({ width, height: 1000 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No page overflow at ' + width); const geometry = await page.locator('.track-eq-knob').evaluateAll(buttons => buttons.map(b => { const r = b.getBoundingClientRect(); const parent = b.closest('.mixer-channel').getBoundingClientRect(); return { width: r.width, height: r.height, inside: r.left >= parent.left && r.right <= parent.right + 1 }; })); assert(geometry.every(g => g.inside && g.width >= 28 && Math.abs(g.width - g.height) < 5), 'Visible circular knobs remain inside each strip at ' + width); await page.locator('.mixer-panel').screenshot({ path: path.join(artifacts, 'track-eq-mixer-' + width + '.png'), style: screenshotStyle }); await page.locator('.mixer-channel').first().screenshot({ path: path.join(artifacts, 'track-eq-channel-' + width + '.png'), style: screenshotStyle }); }
    const touch = await context.newCDPSession(page); await page.setViewportSize({ width: 390, height: 1000 }); const touchKnob = knob(page, 0, 'low'); await touchKnob.scrollIntoViewIfNeeded(); const box = await touchKnob.boundingBox(), prior = (await eqState(page)).low, x = box.x + box.width / 2, y = box.y + box.height / 2; await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 25 }] }); await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); assert((await eqState(page)).low > prior, 'A real touch drag turns the knob');
    assert.deepEqual(errors, []); assert.deepEqual(requests, []); passed.push('Thirty-two genuine rotary controls, pointer/Shift/keyboard/touch/cancel/focus/one-gesture Undo, scoped Flat, real Write/Read, bus guards, Save/Open/recovery/legacy and320/390/1440 layouts');
  } finally { await page.evaluate(() => window.LoomApp?.engine.dispose()).catch(() => {}); await context.close(); }
}
(async () => {
  fs.mkdirSync(artifacts, { recursive: true }); const server = await serve(), browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try { for (const phase of (process.env.LOOM_TRACK_EQ_QA_PHASES || 'dsp,worklet,fallback,ui').split(',')) { if (phase === 'dsp') await dspChecks(browser, server.url); else if (phase === 'worklet' || phase === 'fallback') await engineChecks(browser, server.url, phase === 'fallback'); else if (phase === 'ui') await uiChecks(browser, server.url); else throw Error('Unknown track EQ phase: ' + phase); console.log('PASS track EQ ' + phase); } passed.forEach(label => console.log('PASS ' + label)); }
  finally { await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
