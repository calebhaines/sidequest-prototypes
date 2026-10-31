'use strict';
// Actual Chromium UI, serialized AudioWorklet, fallback callback and WAV export.
// LOOM_LFO_QA_BUILT=1 selects the published standalone. Otherwise use maintained
// sources without loading the large bundled instruments. Phases: engine,ui.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..'), shared = fs.existsSync(path.join(__dirname, 'shared/pattern-schema.js')) ? path.join(__dirname, 'shared') : path.join(root, 'shared');
const artifacts = process.env.LOOM_LFO_QA_DIR || '/tmp/galley-lfo-browser-qa', evidence = {}, passed = [];
const scripts = ['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'preamp-catalog.js', 'tape-catalog.js', 'char-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'tape-dsp.js', 'char-dsp.js', 'effects.js', 'lfo.js', 'service-schema.js', 'schema.js', 'track-eq-dsp.js', 'audio-engine.js'];
function maintainedHTML() {
  if (process.env.LOOM_LFO_QA_BUILT) return fs.readFileSync(path.join(__dirname, 'index.html'));
  const python = `from pathlib import Path
import ast,base64,re,runpy,sys
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
  return execFileSync('python3', ['-c', python, __dirname, shared], { maxBuffer: 36 * 1024 * 1024 });
}
async function serve() {
  let ui;
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://local').pathname;
    if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    if (pathname === '/loom/index.html' || pathname === '/engine.html' && process.env.LOOM_LFO_QA_BUILT) { ui ||= maintainedHTML(); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(ui); return; }
    if (pathname === '/engine.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<!doctype html><body><script src="/shared/pattern-schema.js"></script>' + scripts.map(file => '<script src="/loom/' + file + '"></script>').join('')); return; }
    const base = pathname.startsWith('/loom/') ? __dirname : pathname.startsWith('/shared/') ? shared : root, relative = pathname.startsWith('/loom/') ? pathname.slice(5) : pathname.startsWith('/shared/') ? pathname.slice(7) : pathname;
    const file = path.resolve(base, '.' + relative); if (!file.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (error, bytes) => { res.writeHead(error ? 404 : 200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(error ? 'Missing fixture' : bytes); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return { url: 'http://127.0.0.1:' + server.address().port, close: () => new Promise(resolve => server.close(resolve)) };
}
async function helpers(page) {
  await page.evaluate(() => {
    window.lfoQA = {
      blank() { const state = LoomSchema.defaultState(); state.name = 'LFO browser fixture'; state.tempo = 120; state.lengthBars = 1; state.loopEnabled = false; state.loopEnd = 4; state.recording.punchEnd = 4; for (const owner of [...state.tracks, ...state.returns, state.master]) { owner.level = .7; owner.effects.fill(null); owner.automation = []; } for (const track of state.tracks) track.instrumentLive = true; return state; },
      route(ownerId, target, amount = .2, effectType) { return { id: (ownerId + '-' + target).replace(/[^a-zA-Z0-9_-]/g, '-'), ownerId, target, amount, enabled: true, ...(effectType ? { effectType } : {}) }; },
      source(frames = 16384, rate = 48000) { return [0, 1].map(channel => Float32Array.from({ length: frames }, (_, i) => .09 * Math.sin(2 * Math.PI * (channel ? 227 : 137) * i / rate) + .025 * Math.sin(2 * Math.PI * (channel ? 1327 : 1703) * i / rate))); },
      fixture() { const state = this.blank(); state.tracks[0].effects[0] = LoomSchema.effect({ type: 'prism', params: { filter: 'lowpass', cutoff: 1300, mix: .8 } }); state.tracks[0].sends = [.25, .1]; state.returns[0].effects[0] = LoomSchema.effect({ type: 'prism', params: { filter: 'lowpass', cutoff: 2800, mix: 1 } });
        Object.assign(state.lfos[0], { enabled: true, sync: false, rate: 1.2, smoothing: 10, depth: .75, routes: [this.route('track-1', 'pan', .3), this.route('track-1', 'fx:0:cutoff', .2, 'prism'), this.route('master', 'level', .08), this.route('lfo-2', 'rate', .2)] });
        Object.assign(state.lfos[1], { enabled: true, sync: false, rate: 2.7, wave: 'triangle', depth: .5, routes: [this.route('track-1', 'send:0', .2), this.route('track-1', 'eq:high', .1), this.route('return-1', 'pan', .3), this.route('lfo-1', 'depth', .2)] });
        state.tracks[0].automation = [{ target: 'fx:0:cutoff', effectType: 'prism', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: 900 }, { beat: 4, value: 2300 }] }]; return state; },
      diff(a, b) { let max = 0, energy = 0; for (let i = 0; i < a.length; i++) { if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) return { finite: false }; const d = a[i] - b[i]; max = Math.max(max, Math.abs(d)); energy += d * d; } return { finite: true, max, rms: Math.sqrt(energy / a.length) }; },
      stats(a) { let energy = 0, peak = 0; for (const x of a) { if (!Number.isFinite(x)) return { finite: false }; energy += x * x; peak = Math.max(peak, Math.abs(x)); } return { finite: true, peak, rms: Math.sqrt(energy / a.length) }; },
      core(state, frames = 16384, block = 137) { const core = new (createLoomEngineDSP(createLoomEffectsDSP, createLoomLFODSP).Core)(state, {}, 48000, { linear: true }), input = this.source(frames), output = [new Float32Array(frames), new Float32Array(frames)]; core.start(0); for (let at = 0; at < frames; at += block) core.processBlock(output[0].subarray(at, at + block), output[1].subarray(at, at + block), [[input[0].subarray(at, at + block), input[1].subarray(at, at + block)]]); return { core, input, output }; }
    };
  });
}
async function engineChecks(browser, url) {
  const page = await browser.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url + '/engine.html'); await helpers(page);
    const worklet = await page.evaluate(async () => {
      const q = lfoQA, state = q.fixture(), nativeURL = URL.createObjectURL, NativeNode = AudioWorkletNode; let blob, processorOptions;
      URL.createObjectURL = value => { if (value.type.includes('javascript')) blob = value; return nativeURL.call(URL, value); };
      window.AudioWorkletNode = class extends NativeNode { constructor(...args) { super(...args); processorOptions = args[2].processorOptions; } };
      const engine = q.engine = new LoomAudio(state); await engine.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'live' }); await engine.init(); URL.createObjectURL = nativeURL; window.AudioWorkletNode = NativeNode;
      if (engine.mode !== 'worklet') throw Error('Actual AudioWorklet failed: ' + engine.workletError);
      const code = await blob.text(), frames = 16384, offline = new OfflineAudioContext(2, frames, 48000), module = nativeURL.call(URL, new Blob([code + '\nregisterProcessor("lfo-qa-offline",class extends LoomProcessor { constructor(options){super(options);this.core.start(0);} });'], { type: 'text/javascript' }));
      try { await offline.audioWorklet.addModule(module); } finally { URL.revokeObjectURL(module); }
      const node = new NativeNode(offline, 'lfo-qa-offline', { numberOfInputs: 9, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', processorOptions }), input = q.source(frames), buffer = offline.createBuffer(2, frames, 48000); buffer.copyToChannel(input[0], 0); buffer.copyToChannel(input[1], 1); const source = offline.createBufferSource(); source.buffer = buffer; source.connect(node, 0, 0); node.connect(offline.destination); source.start(0);
      const rendered = await offline.startRendering(), reference = q.core(state, frames), left = rendered.getChannelData(0), right = rendered.getChannelData(1), dry = structuredClone(state); dry.lfos.forEach(item => item.enabled = false); const dryOutput = q.core(dry, frames).output;
      const liveSource = engine.context.createOscillator(), liveGain = engine.context.createGain(), analyser = engine.context.createAnalyser(); liveSource.frequency.value = 137; liveGain.gain.value = .12; liveSource.connect(liveGain); liveGain.connect(engine.inputs[0]); analyser.fftSize = 2048; engine.node.connect(analyser); liveSource.start(); await engine.play(0); await new Promise(resolve => setTimeout(resolve, 300));
      const live = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(live); const result = { mode: engine.mode, left: q.diff(left, reference.output[0]), right: q.diff(right, reference.output[1]), audible: q.diff(left, dryOutput[0]), stats: q.stats(left), serializedFactory: code.includes('createLoomLFODSP') || code.includes('createLFO'), live: q.stats(live), liveMeters: engine.getMeters().lfos }; liveSource.stop(); await engine.dispose(); return result;
    });
    assert.equal(worklet.mode, 'worklet'); assert(worklet.left.finite && worklet.right.finite && worklet.stats.rms > .001); assert(worklet.left.max < 2e-7 && worklet.right.max < 2e-7, 'Actual serialized AudioWorklet equals odd-block Core: ' + JSON.stringify(worklet)); assert(worklet.audible.rms > .001); assert(worklet.serializedFactory); assert(worklet.live.finite && worklet.live.rms > .001, 'Actual realtime Worklet plays the modulated native instrument.'); assert(worklet.liveMeters.outputs.some(value => Math.abs(value) > .01)); assert(Object.values(worklet.liveMeters.values).every(Number.isFinite));
    const fallback = await page.evaluate(async () => {
      const q = lfoQA, state = q.fixture(), Native = window.AudioWorkletNode; window.AudioWorkletNode = undefined; const engine = q.engine = new LoomAudio(state); await engine.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'live' }); await engine.init(); await engine.context.suspend(); window.AudioWorkletNode = Native;
      if (engine.mode !== 'fallback') throw Error('Expected actual fallback graph'); engine.core.start(0); const frames = engine.node.bufferSize * 64, input = q.source(frames), output = [new Float32Array(frames), new Float32Array(frames)], zeros = new Float32Array(engine.node.bufferSize), n = engine.node.bufferSize;
      for (let at = 0; at < frames; at += n) { const inChannels = [input[0].subarray(at, at + n), input[1].subarray(at, at + n)], outChannels = [output[0].subarray(at, at + n), output[1].subarray(at, at + n)]; engine.node.onaudioprocess({ inputBuffer: { getChannelData: channel => inChannels[channel] || zeros }, outputBuffer: { length: n, getChannelData: channel => outChannels[channel] }, playbackTime: at / 48000 }); }
      const reference = q.core(state, frames, 137); const result = { mode: engine.mode, block: n, left: q.diff(output[0], reference.output[0]), right: q.diff(output[1], reference.output[1]), meters: engine.core.getMeters().lfos };
      engine.panic(); const a = new Float32Array(n), b = new Float32Array(n); engine.core.processBlock(a, b); result.panic = q.stats(a); await engine.dispose(); return result;
    });
    assert.equal(fallback.mode, 'fallback'); assert(fallback.left.finite && fallback.right.finite); assert.equal(fallback.left.max, 0, JSON.stringify(fallback)); assert.equal(fallback.right.max, 0); assert.equal(fallback.panic.peak, 0);
    assert.deepEqual(errors, []); evidence.engine = { worklet, fallback };
  } finally { await page.evaluate(async () => { await lfoQA.engine?.dispose(); await window.LoomApp?.engine.dispose(); }).catch(() => {}); await page.close(); }
}
async function typeNumber(page, locator, value) { await locator.fill(String(value)); await locator.press('Tab'); }
async function uiChecks(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true }), page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message)); await context.route('**/*', route => { if (route.request().url() === url + '/loom/index.html') return route.continue(); requests.push(route.request().url()); return route.abort(); });
  try {
    await page.goto(url + '/loom/index.html'); await page.waitForFunction(() => window.LoomApp); await helpers(page); await page.evaluate(async () => { const state = lfoQA.fixture(); state.selectedTrack = 0; await LoomApp.loadState(state); });
    assert.equal(await page.locator('[data-lfo-select]').count(), 4, 'Four discoverable global generators');
    await page.locator('[data-lfo-select="0"]').click(); const initial = await page.evaluate(() => LoomApp.getState().lfos);
    await page.locator('[data-lfo-field="enabled"]').click(); assert.equal((await page.evaluate(() => LoomApp.getState().lfos[0])).enabled, false); await page.locator('#undoButton').click(); assert.deepEqual(await page.evaluate(() => LoomApp.getState().lfos), initial);
    const depth = page.locator('[data-lfo-knob="depth"]'); assert.equal(await depth.getAttribute('role'), 'slider'); await depth.focus(); await depth.press('ArrowUp'); assert((await page.evaluate(() => LoomApp.getState().lfos[0].depth)) > initial[0].depth); await page.locator('#undoButton').click(); assert.deepEqual(await page.evaluate(() => LoomApp.getState().lfos), initial);
    await depth.focus(); await depth.press('End'); assert.equal(await page.evaluate(() => LoomApp.getState().lfos[0].depth), 1); assert.equal(await page.evaluate(() => LoomApp.engine.getMeters().playing), false, 'Knob shortcuts do not start or seek transport'); await page.locator('#undoButton').click();
    await typeNumber(page, page.locator('[data-lfo-number="depth"]'), 47); assert.equal(await page.evaluate(() => LoomApp.getState().lfos[0].depth), .47); await page.locator('#undoButton').click();
    await depth.scrollIntoViewIfNeeded(); const beforeDrag = await page.evaluate(() => LoomApp.getState().lfos), bounds = await depth.boundingBox(); await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2, bounds.y - 30, { steps: 5 }); await page.mouse.up(); assert.notDeepEqual(await page.evaluate(() => LoomApp.getState().lfos), beforeDrag); await page.locator('#undoButton').click(); assert.deepEqual(await page.evaluate(() => LoomApp.getState().lfos), beforeDrag, 'A complete knob drag is one Undo');
    const waves = await page.locator('[data-lfo-field="wave"] option').evaluateAll(options => options.map(option => option.value)); assert.equal(waves.length, 7); for (const wave of waves) { await page.locator('[data-lfo-field="wave"]').selectOption(wave); assert.equal(await page.evaluate(() => LoomApp.getState().lfos[0].wave), wave); }
    await page.locator('[data-lfo-select="2"]').click(); await page.locator('[data-lfo-action="add-route"]').click(); let row = page.locator('[data-lfo-route]').last();
    await row.locator('[data-lfo-route-owner]').selectOption('track-1'); await row.locator('[data-lfo-route-target]').selectOption('track-1|fx:0:cutoff'); await typeNumber(page, row.locator('[data-lfo-route-number]'), -25);
    let route = await page.evaluate(() => LoomApp.getState().lfos[2].routes.at(-1)); assert.equal(route.ownerId, 'track-1'); assert.equal(route.target, 'fx:0:cutoff'); assert.equal(route.effectType, 'prism'); assert.equal(route.amount, -.25);
    await page.locator('[data-lfo-action="add-route"]').click(); row = page.locator('[data-lfo-route]').last(); await row.locator('[data-lfo-route-owner]').selectOption('lfo-1'); await row.locator('[data-lfo-route-target]').selectOption('lfo-1|rate'); assert.equal(await page.evaluate(() => LoomApp.getState().lfos[2].routes.length), 2, 'Each generator has independent multiple destinations');
    await page.evaluate(() => LoomApp.selectTrack(6)); assert.equal(await page.locator('[data-lfo-select="2"]').getAttribute('aria-selected'), 'true', 'Global selected LFO survives automation owner changes');
    await page.evaluate(() => LoomApp.selectEffect(0, 'track-1')); const originalRoutes = await page.evaluate(() => LoomApp.getState().lfos[2].routes); await page.locator('#effectDown').click(); const moved = await page.evaluate(() => LoomApp.getState().lfos[2].routes); assert(moved.some(route => route.ownerId === 'track-1' && route.target === 'fx:1:cutoff')); await page.locator('#undoButton').click(); assert.deepEqual(await page.evaluate(() => LoomApp.getState().lfos[2].routes), originalRoutes, 'Undo restores effect and typed modulation route together');
    await page.evaluate(() => LoomApp.selectEffect(0, 'track-1')); const beforeReplace = await page.evaluate(() => LoomApp.getState().lfos); await page.locator('#effectReplace').click(); await page.locator('[data-add-effect="cinder"]').click(); assert.equal(await page.evaluate(() => LoomApp.getState().tracks[0].effects[0].type), 'cinder'); assert((await page.evaluate(() => LoomApp.getState().lfos)).every(lfo => lfo.routes.every(route => route.ownerId !== 'track-1' || !route.target.startsWith('fx:0:'))), 'Replacing an insert removes all source routes to its former controls'); await page.locator('#undoButton').click(); assert.deepEqual(await page.evaluate(() => LoomApp.getState().lfos), beforeReplace);
    await page.locator('#effectRemove').click(); assert.equal(await page.evaluate(() => LoomApp.getState().tracks[0].effects[0]), null); assert((await page.evaluate(() => LoomApp.getState().lfos)).every(lfo => lfo.routes.every(route => route.ownerId !== 'track-1' || !route.target.startsWith('fx:0:')))); await page.locator('#undoButton').click(); assert.deepEqual(await page.evaluate(() => LoomApp.getState().lfos), beforeReplace, 'Remove and Undo restore routes with the original effect');
    await page.evaluate(async () => { const state = LoomApp.getState(); state.lfos[2].routes[0].gate = [{ beat: 0, value: 1 }, { beat: 1, value: 0 }]; await LoomApp.loadState(state); }); await page.locator('[data-lfo-select="2"]').click(); row = page.locator('[data-lfo-route]').first(); await row.locator('[data-lfo-route-owner]').selectOption('master'); assert.equal(await page.evaluate(() => Object.prototype.hasOwnProperty.call(LoomApp.getState().lfos[2].routes[0], 'gate')), false, 'Retargeting removes a former performance-capture gate'); await page.locator('#undoButton').click();
    const saved = await page.evaluate(() => LoomApp.getState()), download = page.waitForEvent('download'); await page.locator('#saveButton').click(); const file = await download, bytes = fs.readFileSync(await file.path()); assert.deepEqual(JSON.parse(bytes).state.lfos, saved.lfos);
    await page.locator('[data-lfo-select="3"]').click(); await page.locator('[data-lfo-field="enabled"]').click(); await page.locator('#projectFile').setInputFiles({ name: 'lfo.loom.json', mimeType: 'application/json', buffer: bytes }); await page.waitForFunction(expected => JSON.stringify(LoomApp.getState().lfos) === JSON.stringify(expected), saved.lfos);
    await page.waitForFunction(expected => JSON.stringify(JSON.parse(localStorage.getItem('loom-session-v1') || '{}').state?.lfos) === JSON.stringify(expected), saved.lfos); await page.reload(); await page.waitForFunction(() => window.LoomApp); assert.deepEqual(await page.evaluate(() => LoomApp.getState().lfos), saved.lfos);
    await page.locator('[data-lfo-select="2"]').click();
    for (const width of [320, 390, 1440]) { await page.setViewportSize({ width, height: 1000 }); for (const details of await page.locator('[data-lfo-advanced]').all()) await details.evaluate(element => element.open = true); const overflow = await page.locator('#automationEditor').evaluate(element => [...element.querySelectorAll('[data-lfo-field],[data-lfo-number],[data-lfo-route-owner],[data-lfo-route-target],[data-lfo-route-number], [data-lfo-action]')].filter(control => { const box = control.getBoundingClientRect(); return box.width && (box.left < -1 || box.right > innerWidth + 1); }).map(control => control.outerHTML.slice(0, 160))); assert.deepEqual(overflow, [], 'LFO controls fit ' + width + 'px'); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await page.locator('#automationEditor').screenshot({ path: path.join(artifacts, 'lfo-automation-' + width + '.png'), style: '.transport{position:static!important}' }); }
    assert.deepEqual(errors, []); assert.deepEqual(requests, []); evidence.ui = { generators: 4, waveforms: waves, routeRoundtrip: saved.lfos[2].routes.length, widths: [320, 390, 1440], built: Boolean(process.env.LOOM_LFO_QA_BUILT) };
  } finally { await page.evaluate(() => LoomApp?.engine.dispose()).catch(() => {}); await context.close(); }
}
(async () => {
  fs.mkdirSync(artifacts, { recursive: true }); const server = await serve(), browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try { for (const phase of (process.env.LOOM_LFO_QA_PHASES || 'engine,ui').split(',')) { const start = Date.now(); if (phase === 'engine') await engineChecks(browser, server.url); else if (phase === 'ui') await uiChecks(browser, server.url); else throw Error('Unknown LFO phase ' + phase); passed.push({ phase, milliseconds: Date.now() - start }); fs.writeFileSync(path.join(artifacts, 'lfo-evidence.json'), JSON.stringify({ passed, evidence }, null, 2)); fs.writeFileSync(path.join(artifacts, 'lfo-' + phase + '-evidence.json'), JSON.stringify({ phase, evidence: evidence[phase] }, null, 2)); console.log('PASS LFO ' + phase); } console.log(JSON.stringify({ passed, artifacts })); }
  finally { await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
