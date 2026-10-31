'use strict';

// Maintained-source SAUTÉ integration, including the separately serialized
// AudioWorklet. LOOM_PREAMP_QA_BUILT=1 selects the generated standalone instead.
// Select phases with LOOM_PREAMP_QA_PHASES=dsp,worklet,fallback,ui.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const shared = fs.existsSync(path.join(__dirname, 'shared', 'pattern-schema.js')) ? path.join(__dirname, 'shared') : path.join(root, 'shared');
const artifacts = process.env.LOOM_PREAMP_QA_DIR || '/tmp/preamp-browser-qa';
const scripts = ['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'preamp-catalog.js', 'tape-catalog.js', 'char-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'tape-dsp.js', 'char-dsp.js', 'effects.js', 'schema.js', 'track-eq-dsp.js', 'audio-engine.js'];
const models = ['clean', 'iron-73', 'punch-312', 'console-4k', 'super-9k', 'tube-610', 'redd-47', 'valve-72', 'helios-69', 'trident-a', 'isa-110', 'avalon-737', 'tg-2'];
const passed = [];
const screenshotStyle = '.transport{position:static!important}#status{visibility:hidden!important}';

function maintainedHTML() {
  if (process.env.LOOM_PREAMP_QA_PREVIEW) return fs.readFileSync(process.env.LOOM_PREAMP_QA_PREVIEW);
  if (process.env.LOOM_PREAMP_QA_BUILT) return fs.readFileSync(path.join(__dirname, 'index.html'));
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
    if (pathname === '/engine.html' && process.env.LOOM_PREAMP_QA_BUILT) { ui ||= maintainedHTML(); response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); response.end(ui); return; }
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
    window.preampQA = {
      definition: LoomEffectsCatalog.find(effect => effect.id === 'saute'),
      factory: createLoomEffectsDSP(createLoomVocalDSP, createLoomUtilityDSP, createLoomFilterDSP, createLoomCreativeDSP, createLoomBroilerPedalsDSP, createLoomCompressorDSP, createLoomPreampDSP),
      owner: (state, id) => LoomSchema.automationOwner(state, id),
      fx(patch = {}) { return LoomSchema.effect({ type: 'saute', params: { ...this.definition.defaults, ...patch } }); },
      blank() {
        const state = LoomSchema.defaultState(); state.name = 'Sauté browser session'; state.tempo = 120; state.lengthBars = 1; state.loopEnabled = false; state.loopStart = 0; state.loopEnd = 1; state.master.level = 1; state.master.effects.fill(null);
        state.returns.forEach(owner => { owner.effects.fill(null); owner.level = 1; }); state.tracks.forEach(track => { track.instrumentLive = false; track.level = 1; }); state.recording.micCompensation = 'off'; state.recording.micInputGainDb = 0; return state;
      },
      source(frames = 12288, rate = 48000) { return [0, 1].map(channel => Float32Array.from({ length: frames }, (_, i) => { const amplitude = i < 2048 ? .03 : i < 6144 ? .36 : .08; return amplitude * (channel ? .73 * Math.sin(2 * Math.PI * 227 * i / rate) + .13 * Math.cos(2 * Math.PI * 1327 * i / rate) : Math.sin(2 * Math.PI * 137 * i / rate) + .25 * Math.sin(2 * Math.PI * 1703 * i / rate)); })); },
      stats(audio, start = 0) { let power = 0, peak = 0, sum = 0; for (let i = start; i < audio.length; i++) { const value = audio[i]; if (!Number.isFinite(value)) return { finite: false }; power += value * value; sum += value; peak = Math.max(peak, Math.abs(value)); } return { finite: true, rms: Math.sqrt(power / (audio.length - start)), peak, mean: sum / (audio.length - start) }; },
      difference(a, b) { let power = 0, max = 0; for (let i = 0; i < a.length; i++) { power += (a[i] - b[i]) ** 2; max = Math.max(max, Math.abs(a[i] - b[i])); } return { rms: Math.sqrt(power / a.length), max }; },
      projection(audio, frequency, rate = 48000) { let real = 0, imaginary = 0; for (let i = 0; i < audio.length; i++) { real += audio[i] * Math.cos(2 * Math.PI * frequency * i / rate); imaginary += audio[i] * Math.sin(2 * Math.PI * frequency * i / rate); } return 2 * Math.hypot(real, imaginary) / audio.length; },
      render(patch = {}, source = this.source(), block = 128, rate = 48000) { const effect = this.factory.create('saute', rate, { ...this.definition.defaults, ...patch }), left = source[0].slice(), right = source[1].slice(); for (let at = 0; at < left.length; at += block) effect.process(left.subarray(at, at + block), right.subarray(at, at + block), { tempo: 120, playing: true }); return { left, right, effect }; },
      async hash(left, right) { const bytes = new Float32Array(left.length + right.length); bytes.set(left); bytes.set(right, left.length); return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.buffer)), value => value.toString(16).padStart(2, '0')).join(''); },
      fixture() {
        const state = this.blank(), source = this.source(12000);
        const asset = LoomSchema.encodeAsset({ id: 'preamp-audio', name: 'Sauté source', left: source[0], right: source[1], sampleRate: 48000 }); state.assets = [asset];
        state.tracks[0].clips = [{ id: 'preamp-clip', name: 'Preamp audio', assetId: asset.id, start: .25, length: .5, sourceStart: 0, sourceEnd: .25, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: .2, fadeIn: 0, fadeOut: 0 }];
        state.tracks[0].effects[0] = this.fx({ model: 'tube-610', input: 2, drive: 18, output: -3, colour: .8 }); state.tracks[0].sends = [.3, .2];
        state.returns[0].effects[0] = this.fx({ model: 'punch-312', drive: 12, output: -6, colour: .75 }); state.returns[1].effects[0] = this.fx({ model: 'tg-2', drive: 21, output: -9 });
        state.master.effects[0] = this.fx({ model: 'iron-73', drive: 8, output: -3, colour: .4 });
        state.tracks[0].automation = [{ target: 'fx:0:drive', effectType: 'saute', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: 6 }, { beat: 1, value: 24 }] }];
        state.returns[0].automation = [{ target: 'fx:0:headroom', effectType: 'saute', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: -3 }, { beat: 1, value: 6 }] }];
        state.master.automation = [{ target: 'fx:0:colour', effectType: 'saute', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: .2 }, { beat: 1, value: .9 }] }]; return state;
      }
    };
  });
}
async function dspChecks(browser, url) {
  const page = await browser.newPage();
  try {
    await page.goto(url + '/engine.html'); await helpers(page);
    const result = await page.evaluate(async models => {
      const q = preampQA, source = q.source(16000), signals = [], report = { defaults: q.factory.normalize('saute', {}), expected: q.definition.defaults, models: [] };
      const patch = { drive: 24, headroom: -3, colour: 1, transformer: .7, output: -6 };
      for (const model of models) {
        const rendered = q.render({ ...patch, model }, source); signals.push(rendered.left);
        report.models.push({ model, ...q.stats(rendered.left), hash: await q.hash(rendered.left, rendered.right), meters: rendered.effect.getMeters(), odd: q.difference(rendered.left, q.render({ ...patch, model }, source, 37).left).max, silence: q.stats(q.render({ ...patch, model }, [new Float32Array(512), new Float32Array(512)]).left).peak });
      }
      report.differences = [];
      for (let a = 0; a < models.length; a++) for (let b = a + 1; b < models.length; b++) { const left = signals[a], right = signals[b], lr = q.stats(left).rms, rr = q.stats(right).rms; report.differences.push({ a: models[a], b: models[b], rms: q.difference(Float32Array.from(left, value => value / lr), Float32Array.from(right, value => value / rr)).rms }); }
      report.dry = q.difference(q.render({ ...patch, mix: 0 }, source).left, source[0]).max; report.bypass = q.difference(q.render({ ...patch, bypass: true }, source).left, source[0]).max;
      const impulse = new Float32Array(128); impulse[0] = .1; report.firstFrames = models.map(model => q.render({ ...patch, model }, [impulse, impulse]).left[0]);
      return report;
    }, models);
    assert.deepEqual(result.defaults, result.expected); assert.equal(new Set(result.models.map(model => model.hash)).size, models.length, 'Every preamp has a distinct stereo response at identical controls');
    for (const row of result.models) { assert(row.finite && row.peak <= 8 && row.rms > 1e-5, JSON.stringify(row)); assert.equal(row.silence, 0, row.model + ' never synthesizes idle noise'); assert.equal(row.odd, 0, row.model + ' is sample-clock deterministic'); for (const key of ['inputDb', 'stageDb', 'outputDb']) assert(Number.isFinite(row.meters[key]), row.model + ' actual ' + key); }
    for (const row of result.differences) assert(row.rms > 1e-5, JSON.stringify(row) + ' differs beyond a gain offset');
    assert.equal(result.dry, 0); assert.equal(result.bypass, 0); assert(result.firstFrames.every(value => Math.abs(value) > 1e-9), 'The undelayed signal path responds on its first sample');
    passed.push('Thirteen browser DSP models differ beyond gain; real meters, silence, exact dry/bypass, odd blocks and undelayed impulse path');
  } finally { await page.close(); }
}
async function installInput(page, fallback) {
  await helpers(page);
  await page.evaluate(async fallback => {
    if (fallback) window.AudioWorkletNode = undefined;
    const q = preampQA, state = q.blank(); state.tracks[0].effects[0] = q.fx({ bypass: true }); const engine = q.engine = new LoomAudio(state);
    await engine.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'live' }); await engine.init(); await engine.context.resume(); q.sources = []; q.input = engine.context.createGain();
    for (const [frequency, level] of [[137, .24], [1703, .07]]) { const source = engine.context.createOscillator(), gain = engine.context.createGain(); source.frequency.value = frequency; gain.gain.value = level; source.connect(gain); gain.connect(q.input); source.start(); q.sources.push(source); }
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { const destination = engine.context.createMediaStreamDestination(); q.input.connect(destination); const stream = destination.stream, track = stream.getAudioTracks()[0], settings = track.getSettings.bind(track); track.getSettings = () => ({ ...settings(), latency: 0, sampleRate: engine.context.sampleRate }); return stream; } });
    await engine.setMicrophoneMonitoring('track-1', { enabled: true }); const analyser = q.analyser = engine.context.createAnalyser(); analyser.fftSize = 8192; engine.node.connect(analyser);
    q.signal = () => { const audio = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(audio); return q.stats(audio); };
    q.set = (id, patch) => { const state = q.blank(), owner = q.owner(state, id); owner.effects[0] = q.fx(patch); if (id.startsWith('return-')) { state.tracks[0].sends[Number(id.slice(-1)) - 1] = 1; owner.solo = true; } engine.setState(state); };
  }, fallback);
}
async function audioTime(page, seconds) { const until = await page.evaluate(seconds => preampQA.engine.context.currentTime + seconds, seconds); await page.waitForFunction(until => preampQA.engine.context.currentTime >= until, until, { timeout: 60000 }); }
async function offlineChecks(page) {
  return page.evaluate(async () => {
    const q = preampQA, state = LoomSchema.parseProject(LoomSchema.serializeProject(q.fixture())), assets = LoomSchema.decodeAssets(state.assets), results = [];
    for (const options of [{}, { trackId: 'track-1' }, { returnId: 'return-1' }, { returnId: 'return-2' }]) {
      const blob = await q.engine.renderWav(state, assets, { ...options, snapshotReady: true, startBeat: 0, endBeat: 1, tailSeconds: .15 }), view = new DataView(await blob.arrayBuffer());
      const core = new (createLoomEngineDSP(createLoomEffectsDSP).Core)(state, assets, 48000, { linear: true, ...options }); core.start(0); let error = 0, peak = 0, leading = 0;
      for (let at = 0; at < 31200;) { if (at === 24000) core.stop(); const n = Math.min(137, 31200 - at, at < 24000 ? 24000 - at : 31200 - at), left = new Float32Array(n), right = new Float32Array(n); core.processBlock(left, right); for (let i = 0; i < n; i++) for (let channel = 0; channel < 2; channel++) { const value = Math.max(-1, Math.min(1, (channel ? right : left)[i])), reference = Math.round(value * (value < 0 ? 32768 : 32767)), actual = view.getInt16(44 + (at + i) * 4 + channel * 2, true); error = Math.max(error, Math.abs(actual - reference)); peak = Math.max(peak, Math.abs(actual)); if (at + i < 6000) leading = Math.max(leading, Math.abs(actual)); } at += n; }
      results.push({ options, bytes: view.byteLength, rate: view.getUint32(24, true), error, peak, leading });
    }
    return { results, roundtrip: JSON.stringify(state) === JSON.stringify(LoomSchema.parseProject(LoomSchema.serializeProject(state))) };
  });
}
async function engineChecks(browser, url, fallback) {
  const page = await browser.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url + '/engine.html'); await installInput(page, fallback); await audioTime(page, .3);
    const raw = await page.evaluate(() => ({ ...preampQA.signal(), mode: preampQA.engine.mode, frames: preampQA.engine.getAudioDiagnostics().processingFrames, inputs: preampQA.engine.node.numberOfInputs }));
    assert.equal(raw.mode, fallback ? 'fallback' : 'worklet'); assert.equal(raw.frames, fallback ? 256 : 128); if (!fallback) assert.equal(raw.inputs, 9); assert(raw.finite && raw.rms > .1);
    for (const model of models) {
      await page.evaluate(model => preampQA.set('track-1', { model, drive: 24, colour: 1, output: -12, headroom: -3 }), model); await audioTime(page, .25);
      const live = await page.evaluate(() => ({ ...preampQA.signal(), meter: preampQA.engine.getMeters().effects?.[0]?.[0] })); assert(live.finite && live.rms > 1e-5 && live.rms < raw.rms * .6, model + ' gain stage actually processes the monitor: ' + JSON.stringify(live));
      assert.equal(live.meter?.type, 'saute'); for (const key of ['inputDb', 'stageDb', 'outputDb']) assert(Number.isFinite(live.meter[key]), model + ' live ' + key);
    }
    for (const id of ['master', 'return-1', 'return-2']) {
      await page.evaluate(id => preampQA.set(id, { model: 'punch-312', drive: 18, colour: .7, output: -18 }), id); await audioTime(page, .3);
      const live = await page.evaluate(id => ({ ...preampQA.signal(), meter: id === 'master' ? preampQA.engine.getMeters().masterEffects?.[0] : preampQA.engine.getMeters().returnEffects?.[Number(id.slice(-1)) - 1]?.[0] }), id);
      assert(live.finite && live.rms > 1e-5 && live.rms < raw.rms * .4, id + ' preamp processes audio'); assert.equal(live.meter?.type, 'saute'); assert(live.meter.inputDb > -60 && Number.isFinite(live.meter.outputDb));
    }
    await page.evaluate(() => { const q = preampQA, state = q.blank(); state.tracks[0].effects[0] = q.fx({ model: 'tube-610', input: 18, drive: 36, output: -20, headroom: -12, colour: 1, lowCut: 350 }); state.master.effects[0] = q.fx({ model: 'tg-2', drive: 36 }); state.master.mute = true; q.engine.setState(state); }); await audioTime(page, .25);
    assert((await page.evaluate(() => preampQA.signal().rms)) < .0001, 'Master mute still gates the live processed path');
    if (fallback) await page.evaluate(() => { const q = preampQA, callback = q.engine.node.onaudioprocess; q.rawReferences = []; q.engine.node.onaudioprocess = event => { if (q.engine.recorder.active && q.engine.recorder.microphone) q.rawReferences.push([event.inputBuffer.getChannelData(16).slice(), event.inputBuffer.getChannelData(17).slice()]); callback(event); }; });
    await page.evaluate(() => preampQA.engine.startMicrophoneRecording('track-1', { startTransport: false, maxSeconds: .25 })); await page.waitForFunction(() => !preampQA.engine.isRecording, null, { timeout: 60000 });
    const take = await page.evaluate(async () => { const q = preampQA, audio = (await q.engine.stopRecording())[0]; if (!audio) return {}; const stable = audio.left.subarray(Math.floor(audio.sampleRate * .04)); let rawError = null; if (q.rawReferences) { rawError = 0; let at = 0; for (const [left, right] of q.rawReferences) for (let i = 0; i < left.length && at < audio.frames; i++, at++) rawError = Math.max(rawError, Math.abs(audio.left[at] - left[i]), Math.abs(audio.right[at] - right[i])); } return { ...q.stats(audio.left), frames: audio.frames, rate: audio.sampleRate, fundamental: q.projection(stable, 137, audio.sampleRate), third: q.projection(stable, 411, audio.sampleRate), rawError }; });
    assert(take.finite && take.fundamental > .18 && take.third < .006, 'Input/drive/filter/mute remain out of the dry microphone capture: ' + JSON.stringify(take)); assert.equal(take.frames, Math.floor(.25 * take.rate)); if (fallback) assert.equal(take.rawError, 0, 'Fallback dry recording is sample-exact against the actual untouched input callbacks');
    await page.evaluate(() => preampQA.set('track-1', { bypass: true })); await audioTime(page, .3); assert(Math.abs((await page.evaluate(() => preampQA.signal().rms)) - raw.rms) < raw.rms * .04, 'Preamp bypass restores raw live monitoring');
    const offline = await offlineChecks(page); for (const row of offline.results) { assert.equal(row.bytes, 44 + 31200 * 4); assert.equal(row.rate, 48000); assert(row.peak > 20 && row.error <= 1, 'Track/return/master automated WAV matches independent137-frame Core: ' + JSON.stringify(row)); assert.equal(row.leading, 0); } assert(offline.roundtrip); assert.deepEqual(errors, []);
    passed.push((fallback ? 'Fallback' : 'Serialized Worklet') + ' thirteen audible preamps, bus meters,9inputs/unchanged latency, drymic under extreme processing/master mute, automated WAV+direct/return stems');
  } finally { await page.evaluate(async () => { const q = window.preampQA; q?.sources?.forEach(source => { try { source.stop(); } catch {} }); await q?.engine?.dispose(); await window.LoomApp?.engine?.dispose(); }).catch(() => {}); await page.close(); }
}
async function params(page, id = 'track-3', slot = 0) { return page.evaluate(({ id, slot }) => LoomSchema.automationOwner(LoomApp.getState(), id).effects[slot]?.params, { id, slot }); }
async function typeNumber(page, key, value, commit = true) {
  const input = page.locator('#fx-number-' + key); await input.focus(); await input.press('ControlOrMeta+A'); await input.pressSequentially(String(value)); assert.equal(Number(await input.inputValue()), value, key + ' accepts ordinary numeric typing'); assert(await input.evaluate(element => document.activeElement === element), key + ' keeps numeric focus'); if (commit) await input.press('Tab');
}
async function selectOwner(page, id, slot = 0) { await page.evaluate(({ id, slot }) => LoomApp.selectEffect(slot, id), { id, slot }); assert.equal(await page.evaluate(() => LoomApp.selectedEffectOwner), id); }
async function openDetails(page) { for (const id of ['preampInputDetails', 'preampAdvanced', 'preampToneDetails']) if (!(await page.locator('#' + id).evaluate(element => element.open))) await page.locator('#' + id + ' > summary').press('Enter'); }
async function scopeChecks(page) {
  const ids = [...Array.from({ length: 8 }, (_, i) => 'track-' + (i + 1)), 'master', 'return-1', 'return-2'];
  for (const id of ids) {
    await selectOwner(page, id); const selected = await page.evaluate(() => LoomApp.getState().selectedTrack), baseline = await page.evaluate(() => LoomApp.getState());
    if (id.startsWith('track-')) assert.equal(selected, Number(id.slice(-1)) - 1);
    await typeNumber(page, 'output', -7.7); assert.equal((await params(page, id)).output, -7.7);
    const actual = await page.evaluate(() => LoomApp.getState()); for (const other of ids) if (other !== id) { const prior = other === 'master' ? baseline.master : other.startsWith('return-') ? baseline.returns[Number(other.slice(-1)) - 1] : baseline.tracks[Number(other.slice(-1)) - 1], next = other === 'master' ? actual.master : other.startsWith('return-') ? actual.returns[Number(other.slice(-1)) - 1] : actual.tracks[Number(other.slice(-1)) - 1]; assert.deepEqual(next.effects, prior.effects, id + ' does not change ' + other); }
    if (!id.startsWith('track-')) assert.equal(actual.selectedTrack, selected, 'Bus edit preserves instrument track');
    await page.locator('#undoButton').click();
    await page.locator('#effectBypass').click(); assert.equal((await params(page, id)).bypass, true); await page.locator('#undoButton').click(); assert.equal((await params(page, id)).bypass, false);
    await page.locator('#effectReset').click(); const defaults = await page.evaluate(() => preampQA.definition.defaults); assert.deepEqual(await params(page, id), defaults); await page.locator('#undoButton').click();
  }
  await selectOwner(page, 'master'); await page.locator('#loomAutoTarget').selectOption('fx:0:drive'); await page.locator('[data-auto-action="add"]').click();
  const original = await params(page, 'master'); await page.locator('#effectDown').click(); assert.deepEqual(await params(page, 'master', 1), original); assert.equal(await params(page, 'master', 0), undefined); assert((await page.evaluate(() => LoomApp.getState().master.automation)).some(lane => lane.target === 'fx:1:drive'));
  await page.locator('#undoButton').click(); assert.deepEqual(await params(page, 'master'), original); assert((await page.evaluate(() => LoomApp.getState().master.automation)).some(lane => lane.target === 'fx:0:drive'));
  await selectOwner(page, 'return-1'); await page.locator('#loomAutoTarget').selectOption('fx:0:headroom'); await page.locator('[data-auto-action="add"]').click();
  await selectOwner(page, 'track-3'); await page.locator('#loomAutoTarget').selectOption('fx:0:drive'); await page.locator('[data-auto-action="add"]').click();
  passed.push('All8track/master/2return editors keep changes scoped; bypass/reset/Undo and master FX reorder carry preamp automation');
}
async function uiChecks(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true, reducedMotion: 'reduce', acceptDownloads: true }), page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message)); await context.route('**/*', route => { if (route.request().url() === url + '/loom/index.html') return route.continue(); requests.push(route.request().url()); return route.abort(); });
  try {
    await page.goto(url + '/loom/index.html'); await page.waitForFunction(() => window.LoomApp); await helpers(page);
    await page.evaluate(async () => { const q = preampQA, state = q.blank(); state.selectedTrack = 2; state.tracks.forEach((owner, i) => owner.effects[0] = q.fx({ input: i / 10, drive: 14, output: -(i + 1) / 10, colour: .56, mix: .83 })); state.master.effects[0] = q.fx({ output: -4 }); state.returns[0].effects[0] = q.fx({ output: -5 }); state.returns[1].effects[0] = q.fx({ output: -6 }); await LoomApp.loadState(state); });
    await selectOwner(page, 'track-3'); for (const id of ['preampInputDetails', 'preampAdvanced', 'preampToneDetails']) assert.equal(await page.locator('#' + id).evaluate(element => element.open), false, 'Deep controls start folded');
    await page.locator('#effectReplace').click(); assert.equal(await page.locator('[data-add-effect="saute"]').count(), 1, 'The effect is discoverable in the finishing-tools chooser'); assert.match(await page.locator('[data-add-effect="saute"]').textContent(), /SAUTÉ/); await page.locator('#closeEffect').click();
    for (const model of models) {
      const before = await params(page); await page.locator('#fx-model').selectOption(model); const after = await params(page); for (const [key, value] of Object.entries(before)) if (key !== 'model') assert.equal(after[key], value, model + ' choice preserves ' + key);
      assert((await page.locator('#preampModelInspiration').textContent()).trim().length > 5); assert((await page.locator('#preampModelDescription').textContent()).trim().length > 30);
      if (model === 'super-9k') { assert(await page.locator('#fx-transformer').isDisabled()); assert(await page.locator('#fx-number-transformer').isDisabled(), 'Transformerless Super9K disables both transformer controls'); }
      if (model === 'iron-73') { assert(await page.locator('#fx-transformer').isEnabled()); assert(await page.locator('#fx-number-transformer').isEnabled(), 'Iron73 re-enables the stored transformer controls'); }
    }
    await page.locator('#fx-model').selectOption('super-9k'); const storedTransformer = (await params(page)).transformer; assert(await page.locator('#fx-transformer').isDisabled()); assert(await page.locator('#fx-number-transformer').isDisabled()); await page.locator('#fx-model').selectOption('iron-73'); assert(await page.locator('#fx-transformer').isEnabled()); assert(await page.locator('#fx-number-transformer').isEnabled()); assert.equal((await params(page)).transformer, storedTransformer, 'Transformerless model preserves the circuit value for other families');
    await page.locator('#fx-model').selectOption('clean'); for (const key of ['colour', 'impedance', 'transformer', 'headroom', 'bias', 'feedback', 'slew']) assert(await page.locator('#fx-' + key).isDisabled(), 'Clean disables ' + key); assert(await page.locator('#preampCircuitSettings').isDisabled()); for (const key of ['input', 'drive', 'output', 'pad', 'polarity', 'lowCut', 'lowGain', 'compensate', 'mix']) assert(await page.locator('#fx-' + key).isEnabled(), 'Clean retains ' + key);
    await page.locator('#fx-model').selectOption('tube-610'); await openDetails(page);
    for (const [key, value] of [['input', 3.2], ['drive', 17.4], ['output', -7.1], ['colour', .58], ['mix', .77], ['impedance', 1830], ['transformer', .61], ['headroom', -2.3], ['bias', -.27], ['feedback', .37], ['slew', .63], ['lowCut', 73], ['highCut', 17800], ['lowFreq', 115], ['lowGain', 1.7], ['highFreq', 8300], ['highGain', -2.4]]) { await typeNumber(page, key, value); assert.equal((await params(page))[key], value); }
    await page.locator('#fx-pad').selectOption('10'); await page.locator('#fx-polarity').selectOption('invert'); await page.locator('#fx-compensate').selectOption('off');
    const subset = ['impedance', 'transformer', 'headroom', 'bias', 'feedback', 'slew', 'colour'], before = await params(page), recommended = await page.evaluate(() => preampQA.definition.models.find(model => model.id === 'tube-610').defaults);
    await page.locator('#preampCircuitSettings').click(); const applied = await params(page); for (const [key, value] of Object.entries(before)) assert.equal(applied[key], subset.includes(key) ? recommended[key] : value, 'Circuit action handles ' + key + ' explicitly');
    await page.locator('#undoButton').click(); assert.deepEqual(await params(page), before, 'Circuit starting point is one Undo');
    await typeNumber(page, 'colour', .33, false); await page.locator('#preampCircuitSettings').click(); assert.equal((await params(page)).colour, recommended.colour, 'Immediate circuit action survives numeric blur'); await page.locator('#undoButton').click(); assert.equal((await params(page)).colour, .33, 'Action Undo retains preceding typed commit');
    const prior = (await params(page)).input; await page.locator('#fx-input').focus(); await page.keyboard.press('ArrowLeft'); assert((await params(page)).input < prior); assert.equal(await page.evaluate(() => document.activeElement.id), 'fx-input'); await page.locator('#undoButton').click(); assert.equal((await params(page)).input, prior);
    const controls = await page.locator('#effectEditor [data-effect-param]').evaluateAll(inputs => inputs.map(input => input.dataset.effectParam).sort()), expected = await page.evaluate(() => preampQA.definition.params.map(parameter => parameter.key).sort()); assert.deepEqual(controls, expected, 'Every preamp parameter is accessible once');
    const recipes = await page.evaluate(() => preampQA.definition.presets.map(recipe => ({ id: recipe.id, params: recipe.params }))); assert(recipes.length >= models.length, 'Every family has a complete recipe'); assert.equal(new Set(recipes.map(recipe => recipe.params.model)).size, models.length);
    for (const recipe of recipes) { await page.locator('#preampPreset').focus(); await page.locator('#preampPreset').selectOption(recipe.id); assert.deepEqual(await params(page), recipe.params, recipe.id + ' replaces the complete preamp'); assert.equal(await page.evaluate(() => document.activeElement.id), 'preampPreset'); }
    await scopeChecks(page);
    const saved = await page.evaluate(() => LoomApp.getState()), download = page.waitForEvent('download'); await page.locator('#saveButton').click(); const file = await download, bytes = fs.readFileSync(await file.path()); assert.deepEqual(JSON.parse(bytes).state, saved, 'Actual downloaded project includes every preamp rack and lane');
    await page.locator('#preampPreset').selectOption(recipes[0].id); await page.locator('#projectFile').setInputFiles({ name: 'saute-roundtrip.loom.json', mimeType: 'application/json', buffer: bytes }); await page.waitForFunction(expected => JSON.stringify(LoomApp.getState().master.effects) === JSON.stringify(expected), saved.master.effects);
    for (const id of ['track-3', 'master', 'return-1', 'return-2']) { const current = await page.evaluate(id => LoomSchema.automationOwner(LoomApp.getState(), id), id), expected = id === 'master' ? saved.master : id.startsWith('return-') ? saved.returns[Number(id.slice(-1)) - 1] : saved.tracks[2]; assert.deepEqual(current.effects, expected.effects); assert.deepEqual(current.automation, expected.automation); }
    await page.waitForFunction(expected => { const recovered = JSON.parse(localStorage.getItem('loom-session-v1') || '{}'); return JSON.stringify(recovered.state?.master?.effects) === JSON.stringify(expected); }, saved.master.effects);
    await page.reload(); await page.waitForFunction(() => window.LoomApp); await helpers(page); assert.deepEqual(await page.evaluate(() => LoomApp.getState().master.effects), saved.master.effects, 'Recovery restores master preamp'); assert.deepEqual(await page.evaluate(() => LoomApp.getState().returns), saved.returns, 'Recovery restores return preamps and automation');
    await selectOwner(page, 'track-3'); await page.locator('#fx-model').selectOption('iron-73'); await page.locator('#preampCircuitSettings').click();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); for (const id of ['preampInputDetails', 'preampAdvanced', 'preampToneDetails']) if (await page.locator('#' + id).evaluate(element => element.open)) await page.locator('#' + id + ' > summary').press('Enter');
      await page.locator('#effectEditor').screenshot({ path: path.join(artifacts, 'saute-essentials-' + width + '.png'), style: screenshotStyle }); await openDetails(page);
      const overflow = await page.locator('#effectEditor').evaluate(editor => [...editor.querySelectorAll('input,select,button,fieldset')].filter(element => { const box = element.getBoundingClientRect(); return box.width && (box.left < -1 || box.right > innerWidth + 1); }).map(element => element.id || element.className)); assert.deepEqual(overflow, [], 'Expanded preamp controls fit' + width + 'px'); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No page overflow at' + width);
      await page.locator('#effectEditor').screenshot({ path: path.join(artifacts, 'saute-advanced-' + width + '.png'), style: screenshotStyle });
      for (const [name, selector] of [['face', '.preamp-face'], ['workshop', '#preampAdvanced']]) await page.locator(selector).screenshot({ path: path.join(artifacts, 'saute-' + name + '-' + width + '.png'), style: screenshotStyle });
      await page.locator('.preamp-face').evaluate(element => { const transport = document.querySelector('.transport'), top = element.getBoundingClientRect().top + scrollY; window.scrollTo(0, Math.max(0, top - ((transport?.getBoundingClientRect().height || 0) + 18))); }); await page.screenshot({ path: path.join(artifacts, 'saute-viewport-' + width + '.png') });
    }
    await page.evaluate(async () => { const q = preampQA; q.engine = LoomApp.engine; await q.engine.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'live' }); await q.engine.init(); await q.engine.context.resume(); const source = q.uiSource = q.engine.context.createOscillator(), gain = q.engine.context.createGain(); source.frequency.value = 137; gain.gain.value = .2; source.connect(gain); gain.connect(q.engine.microphoneInput); source.start(); q.engine._send({ type: 'microphoneMonitor', track: 2, enabled: true }); }); assert.equal(await page.evaluate(() => LoomApp.engine.mode), 'worklet');
    for (const id of ['track-3', 'master', 'return-1', 'return-2']) {
      if (id.startsWith('return-')) await page.evaluate(id => { const state = LoomApp.getState(); state.tracks[2].sends[Number(id.slice(-1)) - 1] = .7; LoomApp.engine.setState(state); }, id);
      await selectOwner(page, id); await page.waitForFunction(() => [...document.querySelectorAll('[data-preamp-meter]')].length === 3 && [...document.querySelectorAll('[data-preamp-meter]')].every(output => output.textContent.trim() && !/^[—–]$/.test(output.textContent.trim()) && !/∞/.test(output.textContent)), null, { timeout: 60000 });
      const readings = await page.locator('[data-preamp-meter]').evaluateAll(outputs => outputs.map(output => output.textContent)); assert(readings.every(reading => /dB/.test(reading)), id + ' renders actual live levels');
    }
    await page.evaluate(() => preampQA.uiSource.stop()); assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    passed.push('Thirteen model notes/preserved knobs, truthful Clean disabling,22controls/exact numbers/focus, circuit subset/Undo/blur, complete recipes, Save/Open/recovery, actual scoped meters and320/390/1440layouts without external assets');
  } finally { await page.evaluate(() => window.LoomApp?.engine.dispose()).catch(() => {}); await context.close(); }
}
(async () => {
  fs.mkdirSync(artifacts, { recursive: true }); const server = await serve(), browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try { for (const phase of (process.env.LOOM_PREAMP_QA_PHASES || 'dsp,worklet,fallback,ui').split(',')) { if (phase === 'dsp') await dspChecks(browser, server.url); else if (phase === 'worklet' || phase === 'fallback') await engineChecks(browser, server.url, phase === 'fallback'); else if (phase === 'ui') await uiChecks(browser, server.url); else throw Error('Unknown preamp phase: ' + phase); console.log('PASS SAUTÉ ' + phase); } passed.forEach(label => console.log('PASS ' + label)); }
  finally { await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
