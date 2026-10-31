'use strict';

// Maintained-source BUTTER integration, including the separately serialized
// AudioWorklet. LOOM_COMPRESSOR_QA_BUILT=1 selects the generated standalone instead.
// Select phases with LOOM_COMPRESSOR_QA_PHASES=dsp,worklet,fallback,ui.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const shared = fs.existsSync(path.join(__dirname, 'shared', 'pattern-schema.js')) ? path.join(__dirname, 'shared') : path.join(root, 'shared');
const artifacts = process.env.LOOM_COMPRESSOR_QA_DIR || '/tmp/compressor-browser-qa';
const scripts = ['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'preamp-catalog.js', 'tape-catalog.js', 'char-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'tape-dsp.js', 'char-dsp.js', 'effects.js', 'schema.js', 'track-eq-dsp.js', 'audio-engine.js'];
const models = ['clean', 'fet-76', 'opto-2a', 'opto-3a', 'vari-670', 'bus-4k', 'vca-160', 'bus-2500', 'diode-609'];
const legacy = [
  { rate: 48000, patch: {}, hash: '64cf3a813aedcf97ef69dd4b174b372708593783778bf42dbec3183dfde8f1e5' },
  { rate: 44100, patch: {}, hash: '75fe04673f75eb0bea9efa0cccb6e5e3cc85e5504437c00c8385e4af0af8aec0' },
  { rate: 48000, patch: { threshold: -32, ratio: 12, attack: .8, release: 50, knee: 3, makeup: -4, sidechain: 160, mix: .5 }, hash: 'e7b20232811130a0653fa85247a51f8909f0325f90fa3dddacba09706b15aca9' }
];
const passed = [];

function maintainedHTML() {
  if (process.env.LOOM_COMPRESSOR_QA_PREVIEW) return fs.readFileSync(process.env.LOOM_COMPRESSOR_QA_PREVIEW);
  if (process.env.LOOM_COMPRESSOR_QA_BUILT) return fs.readFileSync(path.join(__dirname, 'index.html'));
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
    window.compressorQA = {
      definition: LoomEffectsCatalog.find(effect => effect.id === 'velvet'),
      factory: createLoomEffectsDSP(createLoomVocalDSP, createLoomUtilityDSP, createLoomFilterDSP, createLoomCreativeDSP, createLoomBroilerPedalsDSP, createLoomCompressorDSP),
      source(frames = 12288, rate = 48000) { return [0, 1].map(channel => Float32Array.from({ length: frames }, (_, i) => { const amplitude = i < 2048 ? .03 : i < 6144 ? .45 : .08; return amplitude * (channel ? .73 * Math.sin(2 * Math.PI * 227 * i / rate) + .13 * Math.cos(2 * Math.PI * 1327 * i / rate) : Math.sin(2 * Math.PI * 137 * i / rate) + .25 * Math.sin(2 * Math.PI * 1703 * i / rate)); })); },
      sine(frames, amplitude = .2, rate = 48000) { return Float32Array.from({ length: frames }, (_, i) => amplitude * Math.sin(2 * Math.PI * 137 * i / rate)); },
      stats(audio, start = 0, end = audio.length) { let energy = 0, peak = 0, sum = 0; for (let i = start; i < end; i++) { const value = audio[i]; if (!Number.isFinite(value)) return { finite: false }; energy += value * value; sum += value; peak = Math.max(peak, Math.abs(value)); } return { finite: true, rms: Math.sqrt(energy / (end - start)), mean: sum / (end - start), peak }; },
      difference(a, b) { let square = 0, max = 0; for (let i = 0; i < a.length; i++) { square += (a[i] - b[i]) ** 2; max = Math.max(max, Math.abs(a[i] - b[i])); } return { rms: Math.sqrt(square / a.length), max }; },
      projection(audio, frequency, rate = 48000) { let real = 0, imaginary = 0; for (let i = 0; i < audio.length; i++) { real += audio[i] * Math.cos(2 * Math.PI * frequency * i / rate); imaginary += audio[i] * Math.sin(2 * Math.PI * frequency * i / rate); } return 2 * Math.hypot(real, imaginary) / audio.length; },
      render(patch = {}, source = this.source(), size = 128, rate = 48000) { const effect = this.factory.create('velvet', rate, { ...this.definition.defaults, ...patch }), left = source[0].slice(), right = source[1].slice(); for (let at = 0; at < left.length; at += size) effect.process(left.subarray(at, at + size), right.subarray(at, at + size), { tempo: 120, playing: true }); return { left, right, effect }; },
      async hash(left, right) { const bytes = new Float32Array(left.length + right.length); bytes.set(left); bytes.set(right, left.length); return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.buffer)), value => value.toString(16).padStart(2, '0')).join(''); },
      patch: { model: 'fet-76', timing: 'manual', threshold: -30, ratio: 8, attack: 2.7, release: 375, knee: 3.2, makeup: 0, input: 3, colour: .6, sidechain: 90, link: .8, fetMode: 'normal', thrust: 'off', mix: .87, bypass: false }
    };
  });
}
async function dspChecks(browser, url) {
  const page = await browser.newPage();
  try {
    await page.goto(url + '/engine.html'); await helpers(page);
    const report = await page.evaluate(async ({ models, legacy }) => {
      const q = compressorQA, result = { legacy: [], models: [], defaults: { actual: q.factory.normalize('velvet', {}), expected: q.definition.defaults } };
      for (const fixture of legacy) { const audio = q.render(fixture.patch, q.source(12288, fixture.rate), 128, fixture.rate); result.legacy.push(await q.hash(audio.left, audio.right)); }
      const fixed = { threshold: -24, ratio: 4, attack: 10, release: 200, knee: 6, makeup: 0, colour: .35, timing: 'manual', input: 0, sidechain: 30, link: 1 }, source = q.source(19200), signals = [];
      for (const model of models) {
        const audio = q.render({ ...fixed, model }, source); signals.push(audio.left); result.models.push({ model, hash: await q.hash(audio.left, audio.right), ...q.stats(audio.left), meter: audio.effect.getMeters(), silence: q.stats(q.render({ ...fixed, model }, [new Float32Array(2048), new Float32Array(2048)]).left).peak });
      }
      result.shapeDifferences = [];
      for (let a = 0; a < models.length; a++) for (let b = a + 1; b < models.length; b++) { const l = signals[a], r = signals[b], lRms = q.stats(l).rms, rRms = q.stats(r).rms; result.shapeDifferences.push({ a: models[a], b: models[b], difference: q.difference(Float32Array.from(l, value => value / lRms), Float32Array.from(r, value => value / rRms)).rms }); }
      const memory = q.factory.create('velvet', 48000, { ...q.definition.defaults, ...fixed, model: 'opto-2a', threshold: -30, timing: 'classic', colour: 0 }), hot = q.sine(96000, .85), hotR = hot.slice();
      memory.process(hot, hotR, { tempo: 120 }); const weak = q.sine(14400, .025), remembered = weak.slice(), rememberedR = weak.slice(); memory.process(remembered, rememberedR, { tempo: 120 });
      const fresh = q.render({ ...fixed, model: 'opto-2a', threshold: -30, timing: 'classic', colour: 0 }, [weak, weak]); result.memory = { hot: q.stats(remembered, 4800).rms, fresh: q.stats(fresh.left, 4800).rms };
      const linkedSource = q.sine(24000, .5), quiet = Float32Array.from(linkedSource, value => -value * .05), stereoPatch = { ...fixed, model: 'vca-160', threshold: -24, colour: 0, attack: 2, release: 200 };
      const linked = q.render({ ...stereoPatch, link: 1 }, [linkedSource, quiet]), dual = q.render({ ...stereoPatch, link: 0 }, [linkedSource, quiet]);
      result.stereo = { linkedRight: q.stats(linked.right, 6000).rms, dualRight: q.stats(dual.right, 6000).rms, phaseError: q.difference(linked.right, Float32Array.from(linked.left, value => -value * .05)).max };
      const tone = q.sine(24000, .4), colourPatch = { ...fixed, model: 'opto-2a', threshold: 0, ratio: 1, input: 6 }, dryColour = q.render({ ...colourPatch, colour: 0 }, [tone, tone]), wetColour = q.render({ ...colourPatch, colour: 1 }, [tone, tone]);
      result.colour = { difference: q.difference(dryColour.left, wetColour.left).rms, dryHarmonic: q.projection(dryColour.left.subarray(6000), 411), wetHarmonic: q.projection(wetColour.left.subarray(6000), 411), ...q.stats(wetColour.left, 6000) };
      result.fetMode = q.difference(q.render({ ...q.patch, mix: 1 }).left, q.render({ ...q.patch, fetMode: 'all-buttons', mix: 1 }).left).rms;
      result.thrust = q.difference(q.render({ ...q.patch, model: 'bus-2500', thrust: 'off', mix: 1 }).left, q.render({ ...q.patch, model: 'bus-2500', thrust: 'loud', mix: 1 }).left).rms;
      result.blocks = q.difference(q.render(q.patch, source, 128).left, q.render(q.patch, source, 37).left).max;
      result.bypass = q.difference(q.render({ ...q.patch, bypass: true }, source).left, source[0]).max; result.dry = q.difference(q.render({ ...q.patch, mix: 0 }, source).left, source[0]).max;
      const impulse = new Float32Array(128); impulse[0] = .1; result.firstFrames = models.map(model => q.render({ ...fixed, model }, [impulse, impulse]).left[0]);
      return result;
    }, { models, legacy });
    assert.deepEqual(report.defaults.actual, report.defaults.expected); assert.deepEqual(report.legacy, legacy.map(fixture => fixture.hash), 'Released Clean/default/custom PCM is exact at44.1/48k');
    assert.equal(new Set(report.models.map(model => model.hash)).size, 9, 'All nine models differ at identical knob values');
    for (const model of report.models) { assert(model.finite && model.rms > .0001 && model.peak < 8, JSON.stringify(model)); assert.equal(model.silence, 0); assert(Number.isFinite(model.meter.reductionDb)); }
    for (const pair of report.shapeDifferences) assert(pair.difference > 1e-4, pair.a + ' and ' + pair.b + ' differ beyond a gain offset');
    assert(report.memory.hot < report.memory.fresh * .9, 'The optical detector retains level-dependent programme history: ' + JSON.stringify(report.memory));
    assert(report.stereo.dualRight > report.stereo.linkedRight * 1.2, 'Dual-mono releases the quieter channel from the opposite signal'); assert(report.stereo.phaseError < 2e-6, 'Stereo linking preserves an antiphase signal');
    assert(report.colour.finite && report.colour.difference > 1e-5 && report.colour.wetHarmonic > report.colour.dryHarmonic + 1e-5 && Math.abs(report.colour.mean) < .02, 'Analogue colour produces controlled harmonic content: ' + JSON.stringify(report.colour));
    assert(report.fetMode > 1e-5); assert(report.thrust > 1e-5); assert(report.blocks <= 1e-6); assert.equal(report.bypass, 0); assert.equal(report.dry, 0); assert(report.firstFrames.every(value => Math.abs(value) > 1e-9), 'No model inserts a fixed lookahead buffer');
    passed.push('Released Clean PCM, nine genuine model responses, optical programme memory, analogue colour, stereo linking, special modes, odd blocks, silence and first-frame response');
  } finally { await page.close(); }
}
async function installInput(page, fallback) {
  await helpers(page);
  await page.evaluate(async fallback => {
    if (fallback) window.AudioWorkletNode = undefined;
    const q = compressorQA, state = LoomSchema.defaultState(); state.tempo = 120; state.loopEnabled = false; state.master.level = 1; state.recording.micCompensation = 'off'; state.recording.micInputGainDb = 0; state.tracks.forEach(track => { track.level = 1; track.instrumentLive = false; });
    state.tracks[0].effects[0] = LoomSchema.effect({ type: 'velvet', params: { ...q.definition.defaults, makeup: 0, bypass: true } });
    const engine = q.engine = new LoomAudio(state); await engine.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'live' }); await engine.init(); await engine.context.resume(); q.sources = []; q.input = engine.context.createGain();
    for (const [frequency, level] of [[137, .24], [1703, .07]]) { const source = engine.context.createOscillator(), gain = engine.context.createGain(); source.frequency.value = frequency; gain.gain.value = level; source.connect(gain); gain.connect(q.input); source.start(); q.sources.push(source); }
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { const destination = engine.context.createMediaStreamDestination(); q.input.connect(destination); const stream = destination.stream, track = stream.getAudioTracks()[0], settings = track.getSettings.bind(track); track.getSettings = () => ({ ...settings(), latency: 0, sampleRate: engine.context.sampleRate }); return stream; } });
    await engine.setMicrophoneMonitoring('track-1', { enabled: true }); const analyser = q.analyser = engine.context.createAnalyser(); analyser.fftSize = 8192; engine.node.connect(analyser);
    q.signal = () => { const audio = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(audio); return q.stats(audio); };
    q.set = patch => { engine.state.tracks[0].effects[0].params = { ...q.definition.defaults, ...patch }; engine.setState(engine.state); };
  }, fallback);
}
async function audioTime(page, seconds) { const until = await page.evaluate(seconds => compressorQA.engine.context.currentTime + seconds, seconds); await page.waitForFunction(until => compressorQA.engine.context.currentTime >= until, until, { timeout: 60000 }); }
async function engineChecks(browser, url, fallback) {
  const page = await browser.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url + '/engine.html'); await installInput(page, fallback); await audioTime(page, .3);
    const raw = await page.evaluate(() => ({ ...compressorQA.signal(), mode: compressorQA.engine.mode, frames: compressorQA.engine.getAudioDiagnostics().processingFrames }));
    assert.equal(raw.mode, fallback ? 'fallback' : 'worklet'); assert.equal(raw.frames, fallback ? 256 : 128); assert(raw.finite && raw.rms > .1);
    for (const model of models) {
      await page.evaluate(model => compressorQA.set({ ...compressorQA.patch, model, threshold: -32, ratio: 8, attack: 8, mix: 1 }), model); await audioTime(page, .4);
      const live = await page.evaluate(() => ({ ...compressorQA.signal(), meter: compressorQA.engine.getMeters().effects?.[0]?.[0] }));
      assert(live.finite && live.rms > .0001 && live.rms < raw.rms * .8, model + ' actually compresses in ' + raw.mode + ': ' + JSON.stringify(live));
      assert(live.meter?.type === 'velvet' && live.meter.reductionDb > 1 && live.meter.inputDb > -60 && Number.isFinite(live.meter.outputDb), model + ' reports real gain reduction and signal levels');
    }
    await page.evaluate(() => compressorQA.set({ ...compressorQA.patch, threshold: -36, ratio: 20, attack: .05, colour: .8, input: 12, mix: 1 })); await page.evaluate(() => compressorQA.engine.startMicrophoneRecording('track-1', { startTransport: false, maxSeconds: .3 })); await page.waitForFunction(() => !compressorQA.engine.isRecording, null, { timeout: 60000 });
    const take = await page.evaluate(async () => { const q = compressorQA, audio = (await q.engine.stopRecording())[0]; if (!audio) return { missing: true }; const stable = audio.left.subarray(Math.floor(audio.sampleRate * .04)); return { ...q.stats(audio.left), frames: audio.frames, rate: audio.sampleRate, fundamental: q.projection(stable, 137, audio.sampleRate), third: q.projection(stable, 411, audio.sampleRate) }; });
    assert(take.finite && take.fundamental > .18 && take.third < .006, 'Live compression/colour/input trim leave the recording dry'); assert.equal(take.frames, Math.floor(take.rate * .3));
    await page.evaluate(() => compressorQA.set({ ...compressorQA.patch, bypass: true })); await audioTime(page, .3); assert(Math.abs((await page.evaluate(() => compressorQA.signal().rms)) - raw.rms) < raw.rms * .04);
    const wav = await page.evaluate(async () => {
      const q = compressorQA, state = LoomSchema.defaultState(), source = q.source(12000); state.tempo = 120; state.lengthBars = 1; state.loopEnabled = false; state.master.level = 1; state.tracks[0].level = 1; state.tracks[0].effects[0] = LoomSchema.effect({ type: 'velvet', params: { ...q.definition.defaults, ...q.patch, model: 'opto-2a' } });
      state.tracks[0].automation = [{ target: 'fx:0:threshold', effectType: 'velvet', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: -36 }, { beat: 1, value: -12 }] }, { target: 'fx:0:colour', effectType: 'velvet', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: 0 }, { beat: 1, value: 1 }] }];
      const asset = LoomSchema.encodeAsset({ id: 'compressor-audio', name: 'Compressor audio', left: source[0], right: source[1], sampleRate: 48000 }); state.assets = [asset]; state.tracks[0].clips = [{ id: 'fixture', name: 'Fixture', assetId: asset.id, start: .25, length: .5, sourceStart: 0, sourceEnd: .25, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: 1, fadeIn: 0, fadeOut: 0 }];
      const restored = LoomSchema.parseProject(LoomSchema.serializeProject(state)), assets = LoomSchema.decodeAssets(restored.assets), blob = await q.engine.renderWav(restored, assets, { snapshotReady: true, startBeat: 0, endBeat: 1, tailSeconds: .2 }), bytes = new DataView(await blob.arrayBuffer());
      const core = new (createLoomEngineDSP(createLoomEffectsDSP).Core)(restored, assets, 48000, { linear: true }); core.start(0); let error = 0, peak = 0, leading = 0;
      for (let at = 0; at < 33600;) { if (at === 24000) core.stop(); const n = Math.min(128, 33600 - at, at < 24000 ? 24000 - at : 33600 - at), left = new Float32Array(n), right = new Float32Array(n); core.processBlock(left, right); for (let i = 0; i < n; i++) for (let channel = 0; channel < 2; channel++) { const value = Math.max(-1, Math.min(1, (channel ? right : left)[i])), reference = Math.round(value * (value < 0 ? 32768 : 32767)), actual = bytes.getInt16(44 + (at + i) * 4 + channel * 2, true); error = Math.max(error, Math.abs(actual - reference)); peak = Math.max(peak, Math.abs(actual)); if (at + i < 6000) leading = Math.max(leading, Math.abs(actual)); } at += n; }
      return { bytes: bytes.byteLength, rate: bytes.getUint32(24, true), error, peak, leading, automation: restored.tracks[0].automation };
    });
    assert.equal(wav.bytes, 44 + 33600 * 4); assert.equal(wav.rate, 48000); assert(wav.error <= 1 && wav.peak > 100, JSON.stringify(wav)); assert.equal(wav.leading, 0); assert.equal(wav.automation.length, 2); assert.deepEqual(errors, []);
    passed.push((fallback ? 'Fallback' : 'Serialized Worklet') + ' nine real live compressor models/meters, dry microphone take, bypass, unchanged buffer size and automated stereo WAV/Core parity');
  } finally { await page.evaluate(async () => { const q = window.compressorQA; q?.sources?.forEach(source => { try { source.stop(); } catch {} }); await q?.engine?.dispose(); }).catch(() => {}); await page.close(); }
}
async function params(page) { return page.evaluate(() => LoomApp.getState().tracks[0].effects[0].params); }
async function typeNumber(page, key, value, commit = true) { const input = page.locator('#fx-number-' + key); await input.focus(); await input.press('ControlOrMeta+A'); await input.pressSequentially(String(value)); assert.equal(Number(await input.inputValue()), value, key + ' accepts normal numeric typing'); assert(await input.evaluate(element => document.activeElement === element), key + ' preserves focus while typing'); if (commit) await input.press('Tab'); }
async function classicDefaults(page) { return page.evaluate(() => { const p = LoomApp.getState().tracks[0].effects[0].params; return compressorQA.definition.models.find(model => model.id === p.model).defaults; }); }
async function uiChecks(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true, reducedMotion: 'reduce', acceptDownloads: true }), page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => { if (route.request().url() === url + '/loom/index.html') return route.continue(); requests.push(route.request().url()); return route.abort(); });
  try {
    await page.goto(url + '/loom/index.html'); await page.waitForFunction(() => window.LoomApp); await helpers(page);
    await page.evaluate(async () => { const q = compressorQA, state = LoomSchema.defaultState(); state.name = 'Butter browser session'; state.tracks[0].effects[0] = LoomSchema.effect({ type: 'velvet', params: { ...q.definition.defaults, threshold: -29, ratio: 7.3, attack: 9.8, release: 347, knee: 5.2, makeup: 1.4, sidechain: 77, mix: .83, input: 4, colour: .61, link: .4 } }); await LoomApp.loadState(state); });
    await page.locator('[data-slot="0"]').click(); assert.equal(await page.locator('#compressorAdvanced').evaluate(element => element.open), false);
    const before = await params(page); await page.locator('#fx-model').selectOption('opto-2a'); const after = await params(page); for (const [key, value] of Object.entries(before)) if (key !== 'model') assert.equal(after[key], value, 'Choosing a family preserves ' + key);
    assert.match(await page.locator('#compressorModelInspiration').textContent(), /LA.2A|Teletronix/i);
    const classic = await classicDefaults(page); await page.locator('#compressorClassicSettings').click(); const classicState = await params(page); for (const [key, value] of Object.entries(classic)) assert.equal(classicState[key], value, 'Explicit classic settings applies ' + key);
    assert.equal(classicState.threshold, before.threshold); assert.equal(classicState.input, before.input); assert.equal(classicState.makeup, before.makeup); assert.equal(classicState.mix, before.mix);
    assert(await page.locator('#fx-attack').isDisabled() && await page.locator('#fx-release').isDisabled()); assert((await page.locator('#compressorTimingHint').textContent()).length > 40);
    await page.locator('#fx-model').selectOption('clean'); assert(await page.locator('#fx-colour').isDisabled() && await page.locator('#fx-timing').isDisabled()); assert(await page.locator('#fx-attack').isEnabled() && await page.locator('#fx-release').isEnabled()); assert.match(await page.locator('#compressorTimingHint').textContent(), /original|clean|manual/i);
    await page.locator('#fx-model').selectOption('fet-76'); assert(await page.locator('#fx-fetMode').isEnabled()); assert(await page.locator('#fx-thrust').isDisabled());
    await page.locator('#compressorAdvanced > summary').press('Enter'); await page.locator('#fx-fetMode').selectOption('all-buttons'); await page.locator('#fx-model').selectOption('bus-2500'); assert(await page.locator('#fx-fetMode').isDisabled()); assert(await page.locator('#fx-thrust').isEnabled()); await page.locator('#fx-thrust').selectOption('loud');
    await page.locator('#fx-timing').selectOption('manual');
    for (const [key, value] of [['ratio', 12.7], ['attack', .85], ['release', 1200], ['threshold', -28.3], ['input', 6], ['colour', .78], ['link', .35], ['sidechain', 90]]) { await typeNumber(page, key, value); assert.equal((await params(page))[key], value); }
    await typeNumber(page, 'threshold', -27.2, false); const desired = await classicDefaults(page); await page.locator('#compressorClassicSettings').click(); for (const [key, value] of Object.entries(desired)) assert.equal((await params(page))[key], value, 'Immediate classic-settings click after numeric blur applies ' + key);
    await page.locator('#undoButton').click(); assert.equal((await params(page)).threshold, -27.2, 'Classic-settings Undo retains the preceding numeric commit'); await page.locator('#fx-timing').selectOption('manual');
    const prior = (await params(page)).ratio; await page.locator('#fx-ratio').focus(); await page.keyboard.press('ArrowLeft'); assert((await params(page)).ratio < prior); assert.equal(await page.evaluate(() => document.activeElement.id), 'fx-ratio'); await page.locator('#undoButton').click(); assert.equal((await params(page)).ratio, prior);
    const allControls = await page.locator('#effectEditor [data-effect-param]').evaluateAll(inputs => inputs.map(input => input.dataset.effectParam).sort()), expected = await page.evaluate(() => compressorQA.definition.params.map(parameter => parameter.key).sort()); assert.deepEqual(allControls, expected, 'Every catalog control is accessible exactly once');
    await page.locator('#loomAutoTarget').selectOption('fx:0:colour'); await page.locator('[data-auto-action="add"]').click(); await page.locator('#loomAutoTarget').selectOption('fx:0:threshold'); await page.locator('[data-auto-action="add"]').click();
    const saved = await page.evaluate(() => LoomApp.getState()), downloadEvent = page.waitForEvent('download'); await page.locator('#saveButton').click(); const file = await downloadEvent, bytes = fs.readFileSync(await file.path()); assert.deepEqual(JSON.parse(bytes).state.tracks[0].effects[0].params, saved.tracks[0].effects[0].params);
    const recipes = await page.evaluate(() => compressorQA.definition.presets.map(recipe => ({ id: recipe.id, params: recipe.params })));
    assert(recipes.length >= 9, 'Clean and all analogue families have complete recipes');
    for (const recipe of recipes) { await page.locator('#compressorPreset').focus(); await page.locator('#compressorPreset').selectOption(recipe.id); assert.deepEqual(await params(page), recipe.params, recipe.id + ' replaces the complete compressor'); assert.equal(await page.evaluate(() => document.activeElement.id), 'compressorPreset'); }
    await page.locator('#projectFile').setInputFiles({ name: 'butter-roundtrip.loom.json', mimeType: 'application/json', buffer: bytes }); await page.waitForFunction(expected => JSON.stringify(LoomApp.getState().tracks[0].effects[0].params) === JSON.stringify(expected), saved.tracks[0].effects[0].params); assert.deepEqual(await page.evaluate(() => LoomApp.getState().tracks[0].automation), saved.tracks[0].automation);
    await page.waitForFunction(expected => { const recovered = JSON.parse(localStorage.getItem('loom-session-v1') || '{}'); return JSON.stringify(recovered.state?.tracks?.[0]?.effects?.[0]?.params) === JSON.stringify(expected); }, saved.tracks[0].effects[0].params);
    await page.reload(); await page.waitForFunction(() => window.LoomApp); await helpers(page); assert.deepEqual(await params(page), saved.tracks[0].effects[0].params, 'Actual browser recovery restores the compressor'); assert.deepEqual(await page.evaluate(() => LoomApp.getState().tracks[0].automation), saved.tracks[0].automation); await page.locator('[data-slot="0"]').click();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); if (await page.locator('#compressorAdvanced').evaluate(element => element.open)) await page.locator('#compressorAdvanced > summary').press('Enter');
      await page.locator('#effectEditor').screenshot({ path: path.join(artifacts, 'butter-essentials-' + width + '.png') }); await page.locator('#compressorAdvanced > summary').tap();
      const overflow = await page.locator('#effectEditor').evaluate(editor => [...editor.querySelectorAll('input,select,button,fieldset')].filter(element => { const b = element.getBoundingClientRect(); return b.width && (b.left < -1 || b.right > innerWidth + 1); }).map(element => element.id || element.className)); assert.deepEqual(overflow, [], 'Expanded compressor controls fit' + width + 'px'); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.locator('#effectEditor').screenshot({ path: path.join(artifacts, 'butter-advanced-' + width + '.png') });
      for (const [name, selector] of [['face', '.compressor-face'], ['deep', '#compressorAdvanced']]) { if (await page.locator(selector).count()) { await page.locator(selector).evaluate(element => { const transport = document.querySelector('.transport'), top = element.getBoundingClientRect().top + scrollY; window.scrollTo(0, Math.max(0, top - ((transport?.getBoundingClientRect().height || 0) + 18))); }); await page.screenshot({ path: path.join(artifacts, 'butter-viewport-' + name + '-' + width + '.png') }); } }
    }
    await page.evaluate(async () => { const q = compressorQA; q.engine = LoomApp.engine; await q.engine.init(); await q.engine.context.resume(); const source = q.uiSource = q.engine.context.createOscillator(), gain = q.engine.context.createGain(); source.frequency.value = 137; gain.gain.value = .3; source.connect(gain); gain.connect(q.engine.microphoneInput); source.start(); q.engine._send({ type: 'microphoneMonitor', track: 0, enabled: true }); }); assert.equal(await page.evaluate(() => LoomApp.engine.mode), 'worklet');
    await page.waitForFunction(() => { const meter = LoomApp.engine.getMeters().effects?.[0]?.[0]; return meter?.inputDb > -60 && meter.reductionDb > 1; }, null, { timeout: 60000 }); await page.waitForFunction(() => [...document.querySelectorAll('[data-compressor-meter]')].length === 3 && [...document.querySelectorAll('[data-compressor-meter]')].every(output => output.textContent.trim() && !/^[—–]$/.test(output.textContent.trim())));
    await page.evaluate(() => compressorQA.uiSource.stop()); assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    passed.push('Model preserves knobs, explicit classic settings/recipes, truthful timing and special-mode controls, numeric/keyboard focus, Undo, Save/Open/recovery/automation, actual UI Worklet meters and320/390/1440px layouts');
  } finally { await page.evaluate(() => window.LoomApp?.engine.dispose()).catch(() => {}); await context.close(); }
}
(async () => {
  fs.mkdirSync(artifacts, { recursive: true }); const server = await serve(), browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try { for (const phase of (process.env.LOOM_COMPRESSOR_QA_PHASES || 'dsp,worklet,fallback,ui').split(',')) { if (phase === 'dsp') await dspChecks(browser, server.url); else if (phase === 'worklet' || phase === 'fallback') await engineChecks(browser, server.url, phase === 'fallback'); else if (phase === 'ui') await uiChecks(browser, server.url); else throw Error('Unknown compressor phase: ' + phase); console.log('PASS BUTTER ' + phase); } passed.forEach(label => console.log('PASS ' + label)); }
  finally { await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
