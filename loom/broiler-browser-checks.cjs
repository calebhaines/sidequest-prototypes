'use strict';

// Maintained-source BROILER integration, including the separately serialized
// AudioWorklet. LOOM_BROILER_QA_BUILT=1 selects the generated standalone instead.
// Select phases with LOOM_BROILER_QA_PHASES=dsp,worklet,fallback,ui.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const shared = fs.existsSync(path.join(__dirname, 'shared', 'pattern-schema.js')) ? path.join(__dirname, 'shared') : path.join(root, 'shared');
const artifacts = process.env.LOOM_BROILER_QA_DIR || '/tmp/broiler-browser-qa';
const scripts = ['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'effects.js', 'schema.js', 'audio-engine.js'];
const modernModels = ['tweed-55', 'black-panel-65', 'copper-30', 'royal-68', 'iron-800', 'dual-red-92', 'cali-iv', 'fifty-one', 'citrus-verb', 'jazz-120'];
const pedalModels = ['green-808', 'gold-klone', 'rodent', 'orange-one', 'wool-fuzz', 'muffin', 'treble-boost', 'studio-comp', 'wah', 'chorus', 'phaser', 'echo', 'spring'];
// Captured from the released factory before this upgrade, using all stock
// defaults and the deterministic 9,600-frame signal below. Includes all twelve.
const legacy = {
  'clean-bass': 'bbd83187e90099f739f1d8ab053b0d593bfcdc597be767c696c8d4b552d7a4f2',
  'flip-top': '6567de5eae12d8d549e8b10b5990b6ad3eb0a2a02f9cf3c37322249a65856bf0',
  'valve-stack': '16588ff690720270c7360d894e41c1348c907e9680de4ec4bb251d6a6fb4b84a',
  'modern-grind': 'd512cf529690f93032cd6341a1998db988e8a62b4c6bcfd6aac2f499cf75815b',
  'doom-fuzz': '8f237cd895255c7dc9cafbf8283788ac3250b46a1d853e1b0cfb033e2761642e',
  'american-clean': 'abd36a5357c514e20657347468622b5b2e65caaf61f3dc5c8f6ee1a53ae4e975',
  'british-crunch': 'fe1eb982d8efac29200b0bb559b6029b03a55e0c0b1095bf5e0a3f2facc90daa',
  'high-gain': '2c15c7a79d213c1db9a921e2354cf0351742cd96587603d664331df11a35ef13',
  'portaflex-64': '8744a003cfefdf757fdd7abc3b93086941f76a0feddff27873854d52eba3d8dd',
  'svt-69': 'b93f71fd42302be98e7c6751a816e9def98f5e19736c390fdc62a85c2a31a8a8',
  'v4b-71': 'b893ad2ab16489c997a62456d5b2eb00c6ed68119667aed36784d5bcc6561187',
  'svt-pro': 'b097ea5ee86f0fa685eeef4ed8a1321169856a51fd0ea544fa5d6baf184fc833'
};
const passed = [];

function maintainedHTML() {
  if (process.env.LOOM_BROILER_QA_PREVIEW) return fs.readFileSync(process.env.LOOM_BROILER_QA_PREVIEW);
  if (process.env.LOOM_BROILER_QA_BUILT) return fs.readFileSync(path.join(__dirname, 'index.html'));
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
    window.broilerQA = {
      definition: LoomEffectsCatalog.find(effect => effect.id === 'broiler'),
      factory: createLoomEffectsDSP(createLoomVocalDSP, createLoomUtilityDSP, createLoomFilterDSP, createLoomCreativeDSP, createLoomBroilerPedalsDSP),
      source(frames, rate = 48000) {
        return [Float32Array.from({ length: frames }, (_, i) => .18 * Math.sin(2 * Math.PI * 137 * i / rate) + .07 * Math.sin(2 * Math.PI * 1703 * i / rate)), Float32Array.from({ length: frames }, (_, i) => .14 * Math.sin(2 * Math.PI * 227 * i / rate) + .04 * Math.cos(2 * Math.PI * 3209 * i / rate))];
      },
      difference(a, b) { let energy = 0, max = 0; for (let i = 0; i < a.length; i++) { energy += (a[i] - b[i]) ** 2; max = Math.max(max, Math.abs(a[i] - b[i])); } return { rms: Math.sqrt(energy / a.length), max }; },
      stats(audio) { let energy = 0, peak = 0; for (const value of audio) { if (!Number.isFinite(value)) return { finite: false }; energy += value * value; peak = Math.max(peak, Math.abs(value)); } return { finite: true, rms: Math.sqrt(energy / audio.length), peak }; },
      projection(audio, frequency, rate) { let real = 0, imaginary = 0; for (let i = 0; i < audio.length; i++) { real += audio[i] * Math.cos(2 * Math.PI * frequency * i / rate); imaginary += audio[i] * Math.sin(2 * Math.PI * frequency * i / rate); } return 2 * Math.hypot(real, imaginary) / audio.length; },
      render(patch = {}, source = this.source(28800), size = 128) {
        const effect = this.factory.create('broiler', 48000, { ...this.definition.defaults, ...patch }), left = source[0].slice(), right = source[1].slice();
        for (let at = 0; at < left.length; at += size) effect.process(left.subarray(at, at + size), right.subarray(at, at + size), { tempo: 120, playing: true });
        return { left, right, effect };
      },
      flat: { ampEnable: 'off', input: 0, output: 0, mix: 1, bypass: false, cabinet: 'di', cleanLow: 0 },
      rig: { model: 'iron-800', preampTube: '12ax7', powerTube: 'el34', toneStack: 'british', bias: .17, voltage: .85, feedback: .3, coupling: .7, cathode: .4, transformer: .3, powerScale: .75, micType: 'ribbon121', cabLowCut: 70, cabHighCut: 8500, cabResonance: .7, output: -12, cleanLow: 0, pedal1Type: 'green-808', pedal1Enabled: 'on', pedal1Route: 'pre', pedal1Drive: .65, pedal1Tone: .4, pedal1Level: -2, pedal1Mix: .8, pedal2Type: 'chorus', pedal2Enabled: 'on', pedal2Route: 'post', pedal2Drive: .35, pedal2Tone: .4, pedal2Mix: .4 }
    };
  });
}
async function dspChecks(browser, url) {
  const page = await browser.newPage();
  try {
    await page.goto(url + '/engine.html'); await helpers(page);
    const report = await page.evaluate(async ({ old, models, pedals }) => {
      const q = broilerQA, results = {};
      results.models = q.definition.params.find(parameter => parameter.key === 'model').options.map(option => option.value);
      results.pedals = q.definition.params.find(parameter => parameter.key === 'pedal1Type').options.map(option => option.value);
      results.defaults = { actual: q.factory.normalize('broiler', {}), expected: q.definition.defaults };
      results.legacy = {};
      const original = Float32Array.from({ length: 9600 }, (_, i) => .15 * Math.sin(2 * Math.PI * 55 * i / 48000) + .04 * Math.sin(2 * Math.PI * 1700 * i / 48000));
      for (const model of Object.keys(old)) {
        const bytes = q.render({ model }, [original, original]).left;
        results.legacy[model] = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.buffer)), value => value.toString(16).padStart(2, '0')).join('');
      }
      const source = q.source(28800), raw = q.render(q.flat, source);
      results.raw = q.difference(raw.left, source[0]); results.bypass = q.difference(q.render({ ...q.rig, bypass: true }, source).left, source[0]); results.dry = q.difference(q.render({ ...q.rig, mix: 0 }, source).left, source[0]);
      results.pedalAudio = [];
      for (const type of pedals) {
        const patch = { ...q.flat, pedal1Type: type, pedal1Enabled: 'on', pedal1Drive: type === 'echo' ? .35 : .7, pedal1Tone: type === 'spring' ? .3 : .6, pedal1Mix: ['echo', 'spring'].includes(type) ? .4 : 1 };
        const audio = q.render(patch, source), disabled = q.render({ ...patch, pedal1Enabled: 'off' }, source);
        results.pedalAudio.push({ type, difference: q.difference(audio.left, raw.left).rms, disabled: q.difference(disabled.left, raw.left).max, ...q.stats(audio.left) });
      }
      const order = { ...q.flat, pedal1Type: 'rodent', pedal1Enabled: 'on', pedal1Drive: .7, pedal1Tone: .7, pedal2Type: 'wah', pedal2Enabled: 'on', pedal2Route: 'pre', pedal2Drive: .25, pedal2Tone: .8 };
      const reversed = { ...order, pedal1Type: order.pedal2Type, pedal1Drive: order.pedal2Drive, pedal1Tone: order.pedal2Tone, pedal2Type: order.pedal1Type, pedal2Drive: order.pedal1Drive, pedal2Tone: order.pedal1Tone };
      results.order = q.difference(q.render(order).left, q.render(reversed).left).rms;
      results.route = q.difference(q.render(q.rig).left, q.render({ ...q.rig, pedal1Route: 'post' }).left).rms;
      results.deep = [['preampTube', '12au7', '12ax7'], ['voltage', .6, 1.4], ['feedback', 0, 1], ['toneStack', 'american', 'british'], ['micType', 'ribbon121', 'dynamic57']].map(([key, a, b]) => ({ key, difference: q.difference(q.render({ ...q.rig, [key]: a }).left, q.render({ ...q.rig, [key]: b }).left).rms }));
      results.blocks = q.difference(q.render(q.rig, source, 128).left, q.render(q.rig, source, 2048).left);
      const impulse = new Float32Array(256); impulse[0] = .1;
      results.firstFrame = q.render({ ...q.rig, pedal2Enabled: 'off' }, [impulse, impulse]).left[0];
      results.silence = q.stats(q.render(q.rig, [new Float32Array(4096), new Float32Array(4096)]).left);
      results.normalizedModels = models.map(model => q.factory.normalize('broiler', { model }).model);
      return results;
    }, { old: legacy, models: modernModels, pedals: pedalModels });
    assert.deepEqual(report.defaults.actual, report.defaults.expected, 'Catalog and audio defaults agree'); assert.deepEqual(report.legacy, legacy, 'Every released stock model remains sample-identical in Chromium');
    assert.deepEqual(report.normalizedModels, modernModels); assert.equal(report.models.length, 22); assert(pedalModels.every(type => report.pedals.includes(type)));
    assert.equal(report.raw.max, 0, 'Amp and cabinet off with no pedals is exact dry'); assert.equal(report.bypass.max, 0); assert.equal(report.dry.max, 0);
    for (const pedal of report.pedalAudio) { assert(pedal.finite && pedal.peak <= 8 && pedal.rms > .0001, JSON.stringify(pedal)); assert(pedal.difference > .0001, pedal.type + ' changes genuine audio'); assert.equal(pedal.disabled, 0, pedal.type + ' bypass is exact dry'); }
    assert(report.order > .0001, 'Swapping pedals changes the actual serial processing'); assert(report.route > .0001, 'Pre/post routing changes the actual amp signal'); for (const control of report.deep) assert(control.difference > 1e-6, control.key + ' changes actual amp processing'); assert(report.blocks.max <= 1e-6, 'State does not depend on process block size'); assert(Math.abs(report.firstFrame) > 1e-9, 'Practical amp and drive pedal respond on their first frame'); assert.equal(report.silence.peak, 0);
    passed.push('Twelve released amp fingerprints, ten new heads, thirteen audible pedals, true order/routes/bypass, block invariance and immediate response');
  } finally { await page.close(); }
}

async function installInput(page, fallback) {
  await helpers(page);
  await page.evaluate(async fallback => {
    if (fallback) window.AudioWorkletNode = undefined;
    const q = broilerQA, state = LoomSchema.defaultState(); state.tempo = 120; state.loopEnabled = false; state.master.level = 1; state.recording.micCompensation = 'off'; state.recording.micInputGainDb = 0; state.tracks.forEach(track => { track.level = 1; track.instrumentLive = false; });
    state.tracks[0].effects[0] = LoomSchema.effect({ type: 'broiler', params: { ...q.definition.defaults, ...q.flat } });
    const engine = q.engine = new LoomAudio(state); await engine.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'live' }); await engine.init(); await engine.context.resume();
    q.sources = []; q.streams = []; q.input = engine.context.createGain();
    for (const [frequency, level] of [[137, .16], [1703, .045]]) { const oscillator = engine.context.createOscillator(), gain = engine.context.createGain(); oscillator.frequency.value = frequency; gain.gain.value = level; oscillator.connect(gain); gain.connect(q.input); oscillator.start(); q.sources.push(oscillator); }
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      const destination = engine.context.createMediaStreamDestination(); q.input.connect(destination); const stream = destination.stream, track = stream.getAudioTracks()[0], settings = track.getSettings.bind(track);
      track.getSettings = () => ({ ...settings(), latency: 0, sampleRate: engine.context.sampleRate }); q.streams.push(stream); return stream;
    } });
    await engine.setMicrophoneMonitoring('track-1', { enabled: true });
    const analyser = q.analyser = engine.context.createAnalyser(); analyser.fftSize = 8192; analyser.smoothingTimeConstant = 0; engine.node.connect(analyser);
    q.spectrum = () => { const audio = new Float32Array(analyser.fftSize), bins = new Float32Array(analyser.frequencyBinCount); analyser.getFloatTimeDomainData(audio); analyser.getFloatFrequencyData(bins); const amplitude = frequency => { const bin = Math.round(frequency * analyser.fftSize / engine.context.sampleRate); return 10 ** (Math.max(...bins.slice(Math.max(0, bin - 2), bin + 3)) / 20); }; return { ...q.stats(audio), bands: [137, 274, 411, 685, 1703, 3406, 5109].map(amplitude) }; };
    q.set = patch => { engine.state.tracks[0].effects[0].params = { ...q.definition.defaults, ...patch }; engine.setState(engine.state); };
  }, fallback);
}
async function audioTime(page, seconds) {
  const until = await page.evaluate(seconds => broilerQA.engine.context.currentTime + seconds, seconds);
  await page.waitForFunction(until => broilerQA.engine.context.currentTime >= until, until, { timeout: 60000 });
}
async function engineChecks(browser, url, fallback) {
  const page = await browser.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url + '/engine.html'); await installInput(page, fallback); await audioTime(page, .35);
    const dry = await page.evaluate(() => ({ signal: broilerQA.spectrum(), mode: broilerQA.engine.mode, diagnostics: broilerQA.engine.getAudioDiagnostics() }));
    assert.equal(dry.mode, fallback ? 'fallback' : 'worklet'); assert(dry.signal.finite && dry.signal.rms > .04); assert.equal(dry.diagnostics.processingFrames, fallback ? 256 : 128);
    const snapshots = [];
    for (const patch of [{ model: 'iron-800', output: -12, cleanLow: 0 }, { model: 'jazz-120', output: -12, cleanLow: 0 }, { ampEnable: 'off', input: 0, output: 0, pedal1Type: 'rodent', pedal1Enabled: 'on', pedal1Drive: .8, pedal1Tone: .7 }, { ampEnable: 'off', input: 0, output: 0, pedal1Type: 'chorus', pedal1Enabled: 'on', pedal1Drive: .8, pedal1Tone: .7, pedal1Mix: 1 }]) {
      await page.evaluate(patch => broilerQA.set(patch), patch); await audioTime(page, .45); snapshots.push(await page.evaluate(() => ({ signal: broilerQA.spectrum(), meter: broilerQA.engine.getMeters().effects?.[0]?.[0] })));
    }
    for (const snapshot of snapshots) assert(snapshot.signal.finite && snapshot.signal.rms > .0003 && snapshot.meter?.type === 'broiler', 'Actual audio thread produces finite audible amp/pedal output');
    const spectralDistance = (a, b) => Math.hypot(...a.bands.map((value, i) => value - b.bands[i]));
    assert(spectralDistance(snapshots[0].signal, snapshots[1].signal) > .0005, 'Two new heads differ in the actual audio thread'); assert(spectralDistance(snapshots[2].signal, dry.signal) > .001, 'Actual pedal runs when the amp is off'); assert(spectralDistance(snapshots[3].signal, dry.signal) > .001, 'Actual modulation pedal is serialized into the audio thread');
    await page.evaluate(() => broilerQA.set({ ...broilerQA.rig, drive: 25 })); await audioTime(page, .3);
    await page.evaluate(() => broilerQA.engine.startMicrophoneRecording('track-1', { startTransport: false, maxSeconds: .3 }));
    await page.waitForFunction(() => !broilerQA.engine.isRecording, null, { timeout: 60000 });
    const capture = await page.evaluate(async () => { const q = broilerQA, takes = await q.engine.stopRecording(), take = takes[0]; if (!take) return { missing: true }; const audio = take.left.subarray(Math.floor(take.sampleRate * .04)); q.take = take; return { frames: take.frames, rate: take.sampleRate, ...q.stats(take.left), fundamental: q.projection(audio, 137, take.sampleRate), harmonic: q.projection(audio, 411, take.sampleRate), originalHigh: q.projection(audio, 1703, take.sampleRate), monitor: q.engine.getMicrophoneStatus().enabled }; });
    assert(!capture.missing && capture.finite && capture.fundamental > .1 && capture.originalHigh > .025); assert(capture.harmonic < .005, 'A driven wet rig does not print distortion into its dry microphone take'); assert.equal(capture.frames, Math.floor(.3 * capture.rate)); assert.equal(capture.monitor, true);
    await page.evaluate(() => broilerQA.set({ ...broilerQA.rig, bypass: true })); await audioTime(page, .35);
    const bypass = await page.evaluate(() => broilerQA.spectrum()); assert(Math.abs(bypass.rms - dry.signal.rms) / dry.signal.rms < .04, 'Rack bypass restores live dry output');
    const wav = await page.evaluate(async () => {
      const q = broilerQA, state = LoomSchema.defaultState(), pair = q.source(12000); state.tempo = 120; state.loopEnabled = false; state.lengthBars = 1; state.master.level = 1; state.tracks[0].level = 1;
      state.tracks[0].effects[0] = LoomSchema.effect({ type: 'broiler', params: { ...q.definition.defaults, ...q.rig } });
      state.tracks[0].automation = [{ target: 'fx:0:voltage', effectType: 'broiler', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: .6 }, { beat: 1, value: 1.4 }] }, { target: 'fx:0:pedal1Drive', effectType: 'broiler', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: .1 }, { beat: 1, value: .9 }] }];
      const asset = LoomSchema.encodeAsset({ id: 'broiler-fixture', name: 'Broiler fixture', left: pair[0], right: pair[1], sampleRate: 48000 }); state.assets = [asset];
      state.tracks[0].clips = [{ id: 'fixture', name: 'Fixture', assetId: asset.id, start: .25, length: .5, sourceStart: 0, sourceEnd: .25, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: 1, fadeIn: 0, fadeOut: 0 }];
      const restored = LoomSchema.parseProject(LoomSchema.serializeProject(state)), assets = LoomSchema.decodeAssets(restored.assets), blob = await q.engine.renderWav(restored, assets, { snapshotReady: true, startBeat: 0, endBeat: 1, tailSeconds: .2 }), view = new DataView(await blob.arrayBuffer());
      const core = new (createLoomEngineDSP(createLoomEffectsDSP).Core)(restored, assets, 48000, { linear: true }); core.start(0);
      let maxDifference = 0, peak = 0, lead = 0;
      for (let at = 0; at < 33600;) {
        if (at === 24000) core.stop(); const n = Math.min(128, 33600 - at, at < 24000 ? 24000 - at : 33600 - at), left = new Float32Array(n), right = new Float32Array(n); core.processBlock(left, right);
        for (let i = 0; i < n; i++) for (let channel = 0; channel < 2; channel++) { const value = Math.max(-1, Math.min(1, (channel ? right : left)[i])), expected = Math.round(value * (value < 0 ? 32768 : 32767)), actual = view.getInt16(44 + (at + i) * 4 + channel * 2, true); maxDifference = Math.max(maxDifference, Math.abs(expected - actual)); peak = Math.max(peak, Math.abs(actual)); if (at + i < 6000) lead = Math.max(lead, Math.abs(actual)); }
        at += n;
      }
      return { maxDifference, peak, lead, rate: view.getUint32(24, true), bytes: view.byteLength, automation: restored.tracks[0].automation };
    });
    assert.equal(wav.rate, 48000); assert.equal(wav.bytes, 44 + 33600 * 4); assert(wav.maxDifference <= 1 && wav.peak > 100, JSON.stringify(wav)); assert.equal(wav.lead, 0, 'No amp/pedal output precedes the source clip'); assert.equal(wav.automation.length, 2);
    assert.deepEqual(errors, []); passed.push((fallback ? 'Fallback' : 'Serialized Worklet') + ' real new heads/pedals, low-latency input, dry recording, live bypass and automated Core/WAV parity');
  } finally { await page.evaluate(async () => { const q = window.broilerQA; q?.sources?.forEach(source => { try { source.stop(); } catch {} }); await q?.engine?.dispose(); }).catch(() => {}); await page.close(); }
}

async function currentParams(page) { return page.evaluate(() => LoomApp.getState().tracks[0].effects[0].params); }
async function exactNumber(page, key, value) {
  const input = page.locator('#fx-number-' + key); await input.focus(); await input.press('ControlOrMeta+A'); await input.pressSequentially(String(value));
  assert.equal(Number(await input.inputValue()), value, key + ' accepts ordinary numeric typing'); assert(await input.evaluate(element => element === document.activeElement), key + ' typing preserves focus'); await input.press('Tab');
}
async function rigFiles(page) {
  await page.locator('#broilerWorkshop').evaluate(element => element.open = true);
  const saveEvent = page.waitForEvent('download'); await page.locator('#broilerSaveRig').click(); const file = await saveEvent, bytes = fs.readFileSync(await file.path()), rig = JSON.parse(bytes);
  assert.equal(rig.format, 'broiler-rig'); assert.equal(rig.version, 1); assert.deepEqual(rig.params, await currentParams(page));
  assert.equal(Object.keys(rig.params).length, 1 + await page.evaluate(() => broilerQA.definition.params.length), 'Rig stores every catalog control and bypass');
  await page.locator('#fx-model').selectOption(rig.params.model === 'iron-800' ? 'jazz-120' : 'iron-800');
  const before = await page.evaluate(() => LoomApp.getState());
  await page.locator('#broilerRigFile').setInputFiles({ name: 'saved-broiler.json', mimeType: 'application/json', buffer: bytes });
  await page.waitForFunction(() => /loaded into this insert/.test(document.getElementById('status').textContent));
  const expected = structuredClone(before); expected.tracks[0].effects[0].params = rig.params;
  assert.deepEqual(await page.evaluate(() => LoomApp.getState()), expected, 'Rig load changes only this insert params, preserving automation and the session');
  await page.locator('#undoButton').click(); assert.deepEqual(await page.evaluate(() => LoomApp.getState()), before, 'Rig import is one Undo transaction');
  await page.locator('#redoButton').click(); assert.deepEqual(await page.evaluate(() => LoomApp.getState()), expected);
  const malformed = [
    { ...rig, version: 2 }, { ...rig, params: { ...rig.params, voltage: '1.2' } },
    { ...rig, params: { ...rig.params, voltage: 8 } }, { ...rig, params: { ...rig.params, unsupported: 1 } },
    { ...rig, params: { ...rig.params, model: 'missing-head' } }
  ];
  const oversized = Buffer.from(' '.repeat(128 * 1024 + 1));
  for (const [index, bad] of [...malformed.map(value => Buffer.from(JSON.stringify(value))), oversized].entries()) {
    await page.evaluate(() => document.getElementById('status').textContent = 'Waiting for rig validation');
    await page.locator('#broilerRigFile').setInputFiles({ name: 'invalid-' + index + '.json', mimeType: 'application/json', buffer: bad });
    await page.waitForFunction(() => document.getElementById('status').textContent !== 'Waiting for rig validation' && document.getElementById('broilerRigFile').value === '');
    assert.deepEqual(await page.evaluate(() => LoomApp.getState()), expected, 'Malformed rig ' + index + ' is rejected atomically');
  }
  await page.locator('#undoButton').click(); assert.deepEqual(await page.evaluate(() => LoomApp.getState()), before, 'Rejected rigs do not add history entries'); await page.locator('#redoButton').click();
  passed.push('Reusable rig JSON Save/Load, strict version/type/range/known-key/size errors, untouched session/automation and atomic Undo');
}
async function uiChecks(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true, hasTouch: true, reducedMotion: 'reduce' }), page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  // The source preview, like the downloadable app, must need no network fonts,
  // images, libraries or devices after its HTML has been received.
  await context.route('**/*', route => { if (route.request().url() === url + '/loom/index.html') return route.continue(); requests.push(route.request().url()); return route.abort(); });
  try {
    await page.goto(url + '/loom/index.html'); await page.waitForFunction(() => window.LoomApp); await helpers(page);
    await page.evaluate(async () => { const state = LoomSchema.defaultState(); state.tracks[0].effects[0] = LoomSchema.effect({ type: 'broiler', params: { ...broilerQA.definition.defaults, ...broilerQA.rig, cabinet: 'metalbox' } }); await LoomApp.loadState(state); });
    await page.locator('[data-slot="0"]').click(); await page.locator('#broilerPreset').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-broiler-pedal]').count(), 4); assert.equal(await page.locator('#broilerWorkshop').evaluate(element => element.open), false, 'Workshop starts folded');
    assert.equal(await page.locator('[data-amp-preset]:visible').count(), 0, 'Complete recipes use one compact chooser');
    const beforeModel = await currentParams(page); await page.locator('#fx-model').selectOption('jazz-120'); const selected = await currentParams(page);
    assert.equal(selected.cabinet, 'metalbox', 'Selecting a head preserves a manually chosen cabinet');
    for (const key of Object.keys(beforeModel).filter(key => /^pedal\d/.test(key))) assert.equal(selected[key], beforeModel[key], key + ' survives head selection');
    const beforePower = await currentParams(page); await page.locator('#fx-ampEnable').press('Enter');
    assert.equal((await currentParams(page)).ampEnable, 'off'); assert.equal((await currentParams(page)).cabinet, beforePower.cabinet, 'Head bypass keeps the independently selected cabinet');
    assert(await page.locator('#fx-drive').isDisabled()); assert.equal(await page.locator('#fx-cabinet').isDisabled(), false); await page.locator('#undoButton').click(); assert.deepEqual(await currentParams(page), beforePower);
    await page.locator('#broilerMatchedCab').click(); assert.notEqual((await currentParams(page)).cabinet, 'metalbox'); await page.locator('#undoButton').click(); assert.equal((await currentParams(page)).cabinet, 'metalbox');
    await page.locator('#broilerWorkshop > summary').press('Enter'); assert.equal(await page.locator('#broilerWorkshop').evaluate(element => element.open), true);
    for (const [key, value] of [['bias', -.27], ['voltage', 1.2], ['feedback', .8], ['cabHighCut', 12000]]) { await exactNumber(page, key, value); assert.equal((await currentParams(page))[key], value); }
    await page.locator('#fx-preampTube').selectOption('12au7'); await page.locator('#fx-powerTube').selectOption('6l6'); await page.locator('#fx-toneStack').selectOption('american');
    const beforeArrow = (await currentParams(page)).voltage; await page.locator('#fx-voltage').focus(); await page.keyboard.press('ArrowLeft'); const afterArrow = await currentParams(page); assert(afterArrow.voltage < beforeArrow); assert.equal(await page.evaluate(() => document.activeElement.id), 'fx-voltage', 'Keyboard ranges retain focus'); await page.locator('#undoButton').click(); assert.equal((await currentParams(page)).voltage, beforeArrow);
    await page.locator('#fx-pedal1Route').selectOption('post'); assert.match(await page.locator('#fx-pedal1Route option:checked').textContent(), /after.*cabinet/i);
    const enabled = page.locator('#fx-pedal1Enabled'), beforeToggle = (await currentParams(page)).pedal1Enabled; await enabled.press('Enter'); assert.notEqual((await currentParams(page)).pedal1Enabled, beforeToggle); await page.locator('#undoButton').click(); assert.equal((await currentParams(page)).pedal1Enabled, beforeToggle);
    const snapshot = await currentParams(page); await page.locator('[data-broiler-pedal-action="right"][data-pedal-slot="1"]').click(); let changed = await currentParams(page); assert.equal(changed.pedal2Type, snapshot.pedal1Type); assert.equal(changed.pedal1Type, snapshot.pedal2Type); await page.locator('#undoButton').click(); assert.deepEqual(await currentParams(page), snapshot);
    await page.locator('[data-broiler-pedal-action="clear"][data-pedal-slot="1"]').click(); assert.equal((await currentParams(page)).pedal1Type, 'none'); await page.locator('#undoButton').click(); assert.deepEqual(await currentParams(page), snapshot);
    const represented = await page.locator('#effectEditor [data-effect-param]').evaluateAll(inputs => inputs.map(input => input.dataset.effectParam).sort());
    const expected = await page.evaluate(() => broilerQA.definition.params.map(parameter => parameter.key).sort()); assert.deepEqual(represented, expected, 'Essentials plus folded controls expose each catalog parameter exactly once');
    await page.locator('#loomAutoTarget').selectOption('fx:0:voltage'); await page.locator('[data-auto-action="add"]').click(); await page.locator('#loomAutoTarget').selectOption('fx:0:pedal1Drive'); await page.locator('[data-auto-action="add"]').click();
    let automation = await page.evaluate(() => LoomApp.getState().tracks[0].automation); assert(automation.some(lane => lane.target === 'fx:0:voltage') && automation.some(lane => lane.target === 'fx:0:pedal1Drive'));
    await page.locator('[data-broiler-pedal-action="right"][data-pedal-slot="1"]').click(); automation = await page.evaluate(() => LoomApp.getState().tracks[0].automation); assert(automation.some(lane => lane.target === 'fx:0:pedal2Drive'), 'Reordered pedal carries its automation'); await page.locator('#undoButton').click();
    const beforeType = await page.evaluate(() => LoomApp.getState()); await page.locator('#fx-pedal1Type').selectOption('echo'); const newPedal = await currentParams(page);
    assert.equal(newPedal.pedal1Enabled, 'on'); assert.equal(newPedal.pedal1Route, beforeType.tracks[0].effects[0].params.pedal1Route);
    const pedalDefaults = await page.evaluate(() => broilerQA.definition.pedalModels.find(model => model.id === 'echo').defaults);
    assert(pedalDefaults, 'Each pedal supplies musical initial settings');
    for (const suffix of ['Drive', 'Tone', 'Level', 'Mix']) assert.equal(newPedal['pedal1' + suffix], pedalDefaults[suffix.toLowerCase()], 'New pedal receives its ' + suffix + ' default');
    for (const [key, value] of Object.entries(beforeType.tracks[0].effects[0].params).filter(([key]) => !key.startsWith('pedal1'))) assert.equal(newPedal[key], value);
    automation = await page.evaluate(() => LoomApp.getState().tracks[0].automation); assert(!automation.some(lane => lane.target.startsWith('fx:0:pedal1')) && automation.some(lane => lane.target === 'fx:0:voltage'));
    await page.locator('#undoButton').click(); assert.deepEqual(await page.evaluate(() => LoomApp.getState()), beforeType, 'Undo restores the replaced pedal and its automation');
    await page.locator('[data-broiler-pedal-action="clear"][data-pedal-slot="1"]').click(); automation = await page.evaluate(() => LoomApp.getState().tracks[0].automation); assert(!automation.some(lane => lane.target.startsWith('fx:0:pedal1')) && automation.some(lane => lane.target === 'fx:0:voltage')); await page.locator('#undoButton').click(); assert.deepEqual(await page.evaluate(() => LoomApp.getState()), beforeType);
    await rigFiles(page);
    const savedState = await page.evaluate(() => LoomApp.getState()), downloadEvent = page.waitForEvent('download'); await page.locator('#saveButton').click(); const download = await downloadEvent, bytes = fs.readFileSync(await download.path());
    assert.deepEqual(JSON.parse(bytes).state.tracks[0].effects[0].params, savedState.tracks[0].effects[0].params);
    const portable = await page.evaluate(serialized => LoomSchema.parseProject(serialized), bytes.toString('utf8')); assert.deepEqual(portable.tracks[0].automation, savedState.tracks[0].automation);
    const recipes = await page.evaluate(() => broilerQA.definition.presets.map(recipe => ({ id: recipe.id, params: recipe.params })));
    for (const recipe of recipes) { await page.locator('#broilerPreset').selectOption(recipe.id); assert.deepEqual(await currentParams(page), recipe.params, recipe.id + ' replaces the complete rig'); assert.equal(await page.evaluate(() => document.activeElement.id), 'broilerPreset'); }
    await page.locator('#projectFile').setInputFiles({ name: 'broiler-roundtrip.loom.json', mimeType: 'application/json', buffer: bytes });
    await page.waitForFunction(expected => JSON.stringify(LoomApp.getState().tracks[0].effects[0].params) === JSON.stringify(expected), portable.tracks[0].effects[0].params);
    assert.deepEqual(await page.evaluate(() => LoomApp.getState().tracks[0].automation), savedState.tracks[0].automation, 'Actual Open restores pedal/deep-control automation');
    await page.locator('[data-slot="0"]').click();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator('#broilerWorkshop').evaluate(element => element.open = false);
      await page.locator('[data-broiler-details="pedal1"]').evaluate(element => element.open = false);
      await page.locator('#effectEditor').screenshot({ path: path.join(artifacts, 'broiler-rig-' + width + '.png') });
      await page.locator('#broilerWorkshop > summary').press('Enter');
      const details = page.locator('[data-broiler-details="pedal1"]'); if (!(await details.evaluate(element => element.open))) await details.locator('summary').tap();
      const overflow = await page.locator('#effectEditor').evaluate(editor => [...editor.querySelectorAll('input,select,button,fieldset,article')].filter(element => { const bounds = element.getBoundingClientRect(); return bounds.width > 0 && (bounds.left < -1 || bounds.right > innerWidth + 1); }).map(element => element.id || element.className)); assert.deepEqual(overflow, [], 'All amp and expanded pedal controls fit ' + width + 'px');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'The page has no horizontal overflow at ' + width + 'px');
      await page.locator('#effectEditor').screenshot({ path: path.join(artifacts, 'broiler-workshop-' + width + '.png') });
      for (const [name, selector] of [['amp', '.broiler-head'], ['pedals', '.broiler-board'], ['deep', '#broilerWorkshop']]) {
        await page.locator(selector).evaluate(element => { const transport = document.querySelector('.transport'); const top = element.getBoundingClientRect().top + window.scrollY; window.scrollTo(0, Math.max(0, top - ((transport?.getBoundingClientRect().height || 0) + 18))); });
        await page.screenshot({ path: path.join(artifacts, 'broiler-viewport-' + name + '-' + width + '.png') });
      }
    }
    await page.evaluate(async () => { const q = broilerQA; q.engine = LoomApp.engine; await q.engine.init(); await q.engine.context.resume(); const source = q.uiSource = q.engine.context.createOscillator(), gain = q.engine.context.createGain(); source.frequency.value = 137; gain.gain.value = .1; source.connect(gain); gain.connect(q.engine.microphoneInput); source.start(); q.engine._send({ type: 'microphoneMonitor', track: 0, enabled: true }); });
    assert.equal(await page.evaluate(() => LoomApp.engine.mode), 'worklet', 'Actual maintained/standalone UI serializes the entire pedal factory');
    await page.waitForFunction(() => LoomApp.engine.getMeters().effects?.[0]?.[0]?.inputDb > -60, null, { timeout: 60000 });
    await page.waitForFunction(() => [...document.querySelectorAll('[data-broiler-meter]')].every(output => output.textContent.trim() && !/^[—–]$/.test(output.textContent.trim())));
    await page.evaluate(() => broilerQA.uiSource.stop());
    assert.deepEqual(requests, [], 'Maintained/downloadable page is self-contained'); assert.deepEqual(errors, []);
    passed.push('Compact rig recipes, preserved manual head/cab/pedals, complete deep controls, numeric/keyboard focus, pedal and automation Undo, project save and 320/390/1440px touch layout');
  } finally { await page.evaluate(() => window.LoomApp?.engine.dispose()).catch(() => {}); await context.close(); }
}

(async () => {
  fs.mkdirSync(artifacts, { recursive: true }); const server = await serve(), browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const phases = (process.env.LOOM_BROILER_QA_PHASES || 'dsp,worklet,fallback,ui').split(',');
    for (const phase of phases) { if (phase === 'dsp') await dspChecks(browser, server.url); else if (phase === 'worklet' || phase === 'fallback') await engineChecks(browser, server.url, phase === 'fallback'); else if (phase === 'ui') await uiChecks(browser, server.url); else throw Error('Unknown BROILER QA phase: ' + phase); console.log('PASS BROILER ' + phase); }
    passed.forEach(label => console.log('PASS ' + label));
  } finally { await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
