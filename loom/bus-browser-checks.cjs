'use strict';

// Maintained-source bus integration, including the separately serialized
// AudioWorklet. LOOM_BUS_QA_BUILT=1 selects the generated standalone instead.
// Select phases with LOOM_BUS_QA_PHASES=legacy,worklet,fallback,ui,exports.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const shared = fs.existsSync(path.join(__dirname, 'shared', 'pattern-schema.js')) ? path.join(__dirname, 'shared') : path.join(root, 'shared');
const artifacts = process.env.LOOM_BUS_QA_DIR || '/tmp/bus-browser-qa';
const scripts = ['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'preamp-catalog.js', 'tape-catalog.js', 'char-catalog.js', 'lofi-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'tape-dsp.js', 'char-dsp.js', 'lofi-dsp.js', 'effects.js', 'schema.js', 'track-eq-dsp.js', 'audio-engine.js'];
const passed = [];

function maintainedHTML() {
  if (process.env.LOOM_BUS_QA_PREVIEW) return fs.readFileSync(process.env.LOOM_BUS_QA_PREVIEW);
  if (process.env.LOOM_BUS_QA_BUILT) return fs.readFileSync(path.join(__dirname, 'index.html'));
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
function zipFiles(bytes) {
  const files = []; let at = 0;
  while (bytes.readUInt32LE(at) === 0x04034b50) {
    assert.equal(bytes.readUInt16LE(at + 8), 0, 'Stem archive uses portable stored entries');
    const length = bytes.readUInt32LE(at + 18), nameLength = bytes.readUInt16LE(at + 26), extra = bytes.readUInt16LE(at + 28), name = bytes.subarray(at + 30, at + 30 + nameLength).toString('utf8'), start = at + 30 + nameLength + extra;
    files.push({ name, bytes: bytes.subarray(start, start + length) }); at = start + length;
  }
  assert.equal(bytes.readUInt32LE(bytes.length - 22), 0x06054b50); assert.equal(bytes.readUInt16LE(bytes.length - 12), files.length); return files;
}
function wavAudio(bytes) {
  assert.equal(bytes.subarray(0, 4).toString(), 'RIFF'); assert.equal(bytes.subarray(8, 12).toString(), 'WAVE'); assert.equal(bytes.readUInt16LE(22), 2); assert.equal(bytes.readUInt32LE(24), 48000);
  const left = new Float32Array((bytes.length - 44) / 4), right = new Float32Array(left.length);
  for (let i = 0; i < left.length; i++) { left[i] = bytes.readInt16LE(44 + i * 4) / 32768; right[i] = bytes.readInt16LE(46 + i * 4) / 32768; } return { left, right };
}
function rms(audio) { let power = 0; for (const value of audio) power += value * value; return Math.sqrt(power / audio.length); }
function projection(audio, frequency) { let real = 0, imaginary = 0; for (let i = 0; i < audio.length; i++) { real += audio[i] * Math.cos(2 * Math.PI * frequency * i / 48000); imaginary += audio[i] * Math.sin(2 * Math.PI * frequency * i / 48000); } return 2 * Math.hypot(real, imaginary) / audio.length; }
async function helpers(page) {
  await page.evaluate(() => {
    window.busQA = {
      owner: (state, id) => LoomSchema.automationOwner(state, id),
      fx(type, patch = {}) { return LoomSchema.effect({ type, params: { ...LoomEffectsCatalog.find(effect => effect.id === type).defaults, ...patch } }); },
      blank() { const state = LoomSchema.defaultState(); state.name = 'Bus browser session'; state.tempo = 120; state.lengthBars = 1; state.loopEnabled = false; state.loopStart = 0; state.loopEnd = 1; state.master.level = 1; state.master.effects.fill(null); state.returns.forEach(owner => { owner.effects.fill(null); owner.level = 1; }); state.tracks.forEach(track => { track.instrumentLive = false; track.level = 1; }); state.recording.micCompensation = 'off'; return state; },
      fixture() {
        const state = this.blank();
        for (const [index, frequency] of [[0, 137], [1, 383]]) { const left = Float32Array.from({ length: 12000 }, (_, i) => .04 * Math.sin(2 * Math.PI * frequency * i / 48000)), asset = LoomSchema.encodeAsset({ id: 'bus-audio-' + index, name: 'Bus source ' + index, left, right: left, sampleRate: 48000 }); state.assets.push(asset); state.tracks[index].clips = [{ id: 'clip-' + index, name: 'Clip ' + index, assetId: asset.id, start: .25, length: .5, sourceStart: 0, sourceEnd: .25, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: 1, fadeIn: 0, fadeOut: 0 }]; state.tracks[index].sends = [.45, .3]; }
        state.returns[0].effects[0] = this.fx('velvet', { threshold: -35, ratio: 6, attack: 1, release: 200, makeup: 0, mix: 1 }); state.returns[1].effects[0] = this.fx('parallax', { clock: 'free', time: 120, feedback: .72, spread: 0, mix: 1 });
        state.master.effects[0] = this.fx('prism', { filter: 'highpass', cutoff: 3000, mix: 1 }); return state;
      },
      stats(audio) { let sum = 0, peak = 0; for (const value of audio) { if (!Number.isFinite(value)) return { finite: false }; sum += value * value; peak = Math.max(peak, Math.abs(value)); } return { finite: true, rms: Math.sqrt(sum / audio.length), peak }; },
      difference(a, b) { let sum = 0, max = 0; for (let i = 0; i < a.length; i++) { sum += (a[i] - b[i]) ** 2; max = Math.max(max, Math.abs(a[i] - b[i])); } return { rms: Math.sqrt(sum / a.length), max }; },
      projection(audio, frequency, rate = 48000) { let real = 0, imaginary = 0; for (let i = 0; i < audio.length; i++) { real += audio[i] * Math.cos(2 * Math.PI * frequency * i / rate); imaginary += audio[i] * Math.sin(2 * Math.PI * frequency * i / rate); } return 2 * Math.hypot(real, imaginary) / audio.length; },
      decode(blob) { return blob.arrayBuffer().then(buffer => { const data = new DataView(buffer), left = new Float32Array((data.byteLength - 44) / 4), right = new Float32Array(left.length); for (let i = 0; i < left.length; i++) { left[i] = data.getInt16(44 + i * 4, true) / 32768; right[i] = data.getInt16(46 + i * 4, true) / 32768; } return { left, right, bytes: data.byteLength, rate: data.getUint32(24, true) }; }); }
    };
  });
}
async function legacyChecks(browser, url) {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'bus-legacy-fixtures.json'), 'utf8')).cases.find(fixture => fixture.id === 'eight-live-lanes-48k'), page = await browser.newPage();
  try {
    await page.goto(url + '/engine.html'); const hashes = await page.evaluate(async fixture => {
      function signal(frame, track, channel, amplitude = .035) { let word = Math.imul(frame + 1, 1103515245) ^ Math.imul((track + 1) * 31 + (channel + 1) * 113, -1640531535); word ^= word >>> 16; word = Math.imul(word, -2048144789); word ^= word >>> 13; return ((word >>> 0) / 4294967296 * 2 - 1) * amplitude + (((frame + track * 7) % 251) / 251 - .5) * amplitude * .3; }
      const result = [];
      for (const state of [fixture.state, LoomSchema.normalize(fixture.state)]) {
        const core = new (createLoomEngineDSP(createLoomEffectsDSP).Core)(state, {}, fixture.sampleRate, fixture.options), left = new Float32Array(fixture.frames), right = new Float32Array(fixture.frames); core.start(0); let block = 0;
        for (let at = 0; at < fixture.frames;) { const n = Math.min(fixture.blocks[block++ % fixture.blocks.length], fixture.frames - at), inputs = Array.from({ length: 9 }, (_, track) => [0, 1].map(channel => Float32Array.from({ length: n }, (_, i) => signal(at + i, track, channel, track === 8 ? .17 : fixture.inputAmplitude || .035)))); core.processBlock(left.subarray(at, at + n), right.subarray(at, at + n), inputs); at += n; }
        const bytes = new Float32Array(fixture.frames * 2); for (let i = 0; i < left.length; i++) { bytes[i * 2] = left[i]; bytes[i * 2 + 1] = right[i]; }
        result.push(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.buffer)), byte => byte.toString(16).padStart(2, '0')).join(''));
      }
      return result;
    }, fixture);
    for (const hash of hashes) assert.equal(hash, fixture.expected.float32StereoSha256, 'Chromium preserves pre-bus eight-lane PCM with missing or default routing'); passed.push('Actual Chromium eight-lane legacy PCM is exact with legacy missing fields and normalized zero sends');
  } finally { await page.close(); }
}
async function audioTime(page, seconds) { const until = await page.evaluate(seconds => busQA.engine.context.currentTime + seconds, seconds); await page.waitForFunction(until => busQA.engine.context.currentTime >= until, until, { timeout: 60000 }); }
async function installInput(page, fallback, ui = false) {
  await helpers(page); await page.evaluate(async ({ fallback, ui }) => {
    const q = busQA; if (fallback) window.AudioWorkletNode = undefined;
    const state = q.blank(); if (ui) await LoomApp.loadState(state); const engine = q.engine = ui ? LoomApp.engine : new LoomAudio(state); await engine.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'live' }); await engine.init(); await engine.context.resume();
    q.input = engine.context.createGain(); q.sources = []; q.input.gain.value = 1;
    for (const [frequency, level] of [[137, .2], [1703, .04]]) { const source = engine.context.createOscillator(), gain = engine.context.createGain(); source.frequency.value = frequency; gain.gain.value = level; source.connect(gain); gain.connect(q.input); source.start(); q.sources.push(source); }
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { const destination = engine.context.createMediaStreamDestination(); q.input.connect(destination); const stream = destination.stream, track = stream.getAudioTracks()[0], settings = track.getSettings.bind(track); track.getSettings = () => ({ ...settings(), latency: 0, sampleRate: engine.context.sampleRate }); return stream; } });
    await engine.setMicrophoneMonitoring('track-1', { enabled: true }); const analyser = q.analyser = engine.context.createAnalyser(); analyser.fftSize = 8192; engine.node.connect(analyser); q.signal = () => { const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples); return q.stats(samples); }; q.set = state => engine.setState(state);
  }, { fallback, ui });
}
async function offlineChecks(page) {
  return page.evaluate(async () => {
    const q = busQA, engine = q.engine, state = q.fixture();
    state.tracks[0].automation = [{ target: 'send:0', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: .1 }, { beat: 1, value: .7 }] }];
    state.returns[0].automation = [{ target: 'fx:0:threshold', effectType: 'velvet', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: -40 }, { beat: 1, value: -20 }] }];
    state.master.automation = [{ target: 'fx:0:cutoff', effectType: 'prism', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: 1200 }, { beat: 1, value: 5000 }] }];
    const restored = LoomSchema.parseProject(LoomSchema.serializeProject(state)), assets = LoomSchema.decodeAssets(restored.assets), results = [];
    for (const options of [{}, { trackId: 'track-1' }, { returnId: 'return-1' }, { returnId: 'return-2' }]) {
      const wav = await q.decode(await engine.renderWav(restored, assets, { ...options, snapshotReady: true, startBeat: 0, endBeat: 1, tailSeconds: .25 }));
      const core = new (createLoomEngineDSP(createLoomEffectsDSP).Core)(restored, assets, 48000, { linear: true, ...options }); core.start(0); let difference = 0, leading = 0;
      for (let at = 0; at < 36000;) { if (at === 24000) core.stop(); const n = Math.min(137, 36000 - at, at < 24000 ? 24000 - at : 36000 - at), left = new Float32Array(n), right = new Float32Array(n); core.processBlock(left, right); for (let i = 0; i < n; i++) for (const [actual, sample] of [[wav.left[at + i], left[i]], [wav.right[at + i], right[i]]]) { const expected = Math.round(Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767)); difference = Math.max(difference, Math.abs(Math.round(actual * 32768) - expected)); if (at + i < 6000) leading = Math.max(leading, Math.abs(actual)); } at += n; }
      results.push({ options, difference, leading, rate: wav.rate, bytes: wav.bytes, ...q.stats(wav.left) });
    }
    const rejected = [];
    for (const options of [{ returnId: 'return-9' }, { trackId: 'master' }, { returnId: 'return-1', trackId: 'track-1' }]) { try { await engine.renderWav(restored, assets, { ...options, snapshotReady: true, startBeat: 0, endBeat: 1, tailSeconds: 0 }); rejected.push(false); } catch { rejected.push(true); } }
    const linear = q.fixture(); linear.master.effects.fill(null); linear.returns.forEach(owner => owner.effects.fill(null)); const linearAssets = LoomSchema.decodeAssets(linear.assets), outputs = [];
    for (const options of [{}, { trackId: 'track-1' }, { trackId: 'track-2' }, { returnId: 'return-1' }, { returnId: 'return-2' }]) outputs.push(await q.decode(await engine.renderWav(linear, linearAssets, { ...options, snapshotReady: true, startBeat: 0, endBeat: 1, tailSeconds: 0 })));
    let sumDifference = 0; for (let i = 0; i < outputs[0].left.length; i++) sumDifference = Math.max(sumDifference, Math.abs(outputs[0].left[i] - outputs.slice(1).reduce((sum, output) => sum + output.left[i], 0)), Math.abs(outputs[0].right[i] - outputs.slice(1).reduce((sum, output) => sum + output.right[i], 0)));
    const nonlinear = q.fixture(); nonlinear.master.effects.fill(null); nonlinear.returns[0].effects[0] = q.fx('cinder', { shape: 'diode', drive: 24, tone: 12000, output: -9, mix: 1 }); const nonlinearAssets = LoomSchema.decodeAssets(nonlinear.assets);
    const shared = await q.decode(await engine.renderWav(nonlinear, nonlinearAssets, { returnId: 'return-1', snapshotReady: true, startBeat: 0, endBeat: 1, tailSeconds: 0 })), separate = [];
    for (let source = 0; source < 2; source++) { const one = structuredClone(nonlinear); one.tracks[1 - source].mute = true; separate.push(await q.decode(await engine.renderWav(one, nonlinearAssets, { returnId: 'return-1', snapshotReady: true, startBeat: 0, endBeat: 1, tailSeconds: 0 }))); }
    const independentSum = Float32Array.from(shared.left, (_, i) => separate[0].left[i] + separate[1].left[i]);
    return { results, rejected, sumDifference, sharedDifference: q.difference(shared.left, independentSum).rms, busStatePreserved: JSON.stringify(restored.returns) === JSON.stringify(LoomSchema.parseProject(LoomSchema.serializeProject(restored)).returns) };
  });
}
async function engineChecks(browser, url, fallback) {
  const page = await browser.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url + '/engine.html'); await installInput(page, fallback); await audioTime(page, .35);
    const raw = await page.evaluate(() => ({ signal: busQA.signal(), mode: busQA.engine.mode, inputs: busQA.engine.inputs.length, workletInputs: busQA.engine.node.numberOfInputs })); assert.equal(raw.mode, fallback ? 'fallback' : 'worklet'); assert.equal(raw.inputs, 8); if (!fallback) assert.equal(raw.workletInputs, 9); assert(raw.signal.rms > .05);
    await page.evaluate(() => { const q = busQA, state = q.blank(); state.tracks[0].level = 0; state.tracks[0].sends = [1, 0]; state.tracks[0].sendPre = [true, false]; state.returns[0].solo = true; q.set(state); }); await audioTime(page, .3);
    const pre = await page.evaluate(() => ({ signal: busQA.signal(), meters: busQA.engine.getMeters() })); assert(pre.signal.rms > raw.signal.rms * .75, 'Pre send remains audible at a zero track fader'); assert.equal(pre.meters.tracks.length, 8); assert.equal(pre.meters.effects.length, 8); assert.equal(pre.meters.returns.length, 2); assert.equal(pre.meters.returnEffects.length, 2); assert.equal(pre.meters.masterEffects.length, 4);
    await page.evaluate(() => { busQA.engine.state.tracks[0].sendPre[0] = false; busQA.set(busQA.engine.state); }); await audioTime(page, .35); assert((await page.evaluate(() => busQA.signal().rms)) < .0002, 'Post sends follow the zero fader');
    await page.evaluate(() => { const state = busQA.engine.state; state.tracks[0].sendPre[0] = true; state.tracks[0].mute = true; busQA.set(state); }); await audioTime(page, .3); assert((await page.evaluate(() => busQA.signal().rms)) < .0002, 'Mute gates pre sends');
    await page.evaluate(() => { const state = busQA.engine.state; state.tracks[0].mute = false; state.master.effects[0] = busQA.fx('prism', { filter: 'highpass', cutoff: 12000 }); busQA.set(state); }); await audioTime(page, .3); assert((await page.evaluate(() => busQA.signal().rms)) < raw.signal.rms * .03, 'Master inserts process the full wet mix');
    await page.evaluate(() => { const state = busQA.engine.state; state.master.effects.fill(null); state.master.mute = true; busQA.set(state); }); await audioTime(page, .3); assert((await page.evaluate(() => busQA.signal().rms)) < .0002, 'Master mute silences monitor output');
    await page.evaluate(() => busQA.engine.startMicrophoneRecording('track-1', { startTransport: false, maxSeconds: .25 })); await page.waitForFunction(() => !busQA.engine.isRecording, null, { timeout: 60000 });
    const take = await page.evaluate(async () => { const q = busQA, take = (await q.engine.stopRecording())[0]; return take ? { ...q.stats(take.left), rate: take.sampleRate, frames: take.frames, fundamental: q.projection(take.left, 137, take.sampleRate) } : {}; }); assert(take.finite && take.fundamental > .15 && take.rms > .1, 'Master/return effects, mute and solo never enter the dry microphone recorder'); assert.equal(take.frames, Math.floor(.25 * take.rate));
    await page.evaluate(() => { const q = busQA, state = q.blank(); state.tracks[0].sends = [0, 1]; state.returns[1].solo = true; state.returns[1].effects[0] = q.fx('parallax', { clock: 'free', time: 120, feedback: .8, damping: 8000, spread: 0, mix: 1 }); q.set(state); }); await audioTime(page, .5); await page.evaluate(() => busQA.input.gain.value = 0); await audioTime(page, 1.1);
    assert((await page.evaluate(() => busQA.signal().rms)) > .0003, 'Silent sources do not truncate the shared return echo tail'); await page.evaluate(() => busQA.engine.seek(0)); await audioTime(page, .3); assert((await page.evaluate(() => busQA.signal().rms)) < .0001, 'Seeking clears bus tails');
    const offline = await offlineChecks(page); for (const row of offline.results) { assert(row.finite && row.peak > 1e-6 && row.bytes === 144044 && row.rate === 48000, JSON.stringify(row)); assert(row.difference <= 1, 'Automated bus WAV agrees with odd-block Core: ' + JSON.stringify(row)); assert.equal(row.leading, 0); } assert(offline.rejected.every(Boolean)); assert(offline.sumDifference <= 5 / 32768, 'Linear mix equals separately exported dry and return stems'); assert(offline.sharedDifference > .0001, 'A shared nonlinear return processes summed tracks once'); assert(offline.busStatePreserved); assert.deepEqual(errors, []);
    passed.push((fallback ? 'Fallback' : 'Serialized Worklet') + ' nine inputs, pre/post/mute/solo/master audio, dry microphone, long return tail/reset and automated WAV/dry/return stem parity');
  } finally { await page.evaluate(async () => { const q = window.busQA; q?.sources?.forEach(source => { try { source.stop(); } catch {} }); await q?.engine?.dispose(); }).catch(() => {}); await page.close(); }
}
async function selectBusSlot(page, owner, slot = 0) { await page.locator('[data-bus-effect-owner="' + owner + '"][data-bus-effect-slot="' + slot + '"]').click(); }
async function rangeKey(page, selector, key) { const input = page.locator(selector).first(); await input.focus(); await input.press(key); await input.press('Tab'); }
async function ownerParams(page, id, slot = 0) { return page.evaluate(({ id, slot }) => LoomSchema.automationOwner(LoomApp.getState(), id).effects[slot]?.params, { id, slot }); }
async function matrixPanels(page) {
  const ids = await page.evaluate(() => LoomEffectsCatalog.map(effect => effect.id)); assert.equal(ids.length, 17);
  for (const type of ids) for (const owner of ['master', 'return-1']) {
    await page.evaluate(async ({ type, owner }) => { const q = busQA, state = q.blank(); state.selectedTrack = 2; state.tracks[2].effects[0] = q.fx(type, { mix: .37 }); state.master.effects[0] = q.fx(type, { mix: owner === 'master' ? .71 : .23 }); state.returns[0].effects[0] = q.fx(type, { mix: owner === 'return-1' ? .71 : .23 }); await LoomApp.loadState(state); }, { type, owner });
    await selectBusSlot(page, owner); assert.equal(await page.evaluate(() => LoomApp.getState().selectedTrack), 2); assert.equal(await page.evaluate(() => LoomApp.selectedEffectOwner), owner); assert.match(await page.locator('#effectEditor .effect-hero .eyebrow').textContent(), owner === 'master' ? /MASTER/ : /RETURN A/);
    await rangeKey(page, '#fx-mix', 'Home'); assert.equal((await ownerParams(page, owner)).mix, 0); assert.equal((await ownerParams(page, 'track-3')).mix, .37); assert.equal((await ownerParams(page, owner === 'master' ? 'return-1' : 'master')).mix, .23);
    await page.locator('#undoButton').click(); assert.equal((await ownerParams(page, owner)).mix, .71); await page.locator('#effectBypass').click(); assert.equal((await ownerParams(page, owner)).bypass, true); assert.equal((await ownerParams(page, 'track-3')).bypass, false); await page.locator('#undoButton').click();
    const recipeSelector = type === 'broiler' ? '#broilerPreset' : type === 'velvet' ? '#compressorPreset' : type === 'glaze' ? '#vocalPreset' : type === 'scales' ? '#utilityPreset' : ['strainer', 'swirl', 'crumble'].includes(type) ? '#creativePreset' : null;
    if (recipeSelector) { const recipe = await page.evaluate(type => LoomEffectsCatalog.find(effect => effect.id === type).presets[0], type); await page.locator(recipeSelector).selectOption(recipe.id); assert.deepEqual(await ownerParams(page, owner), recipe.params); assert.equal((await ownerParams(page, 'track-3')).mix, .37); await page.locator('#undoButton').click(); }
    await page.locator('#effectReset').click(); if (owner === 'return-1') assert.equal((await ownerParams(page, owner)).mix, 1, 'Return reset starts wet'); assert.equal((await ownerParams(page, 'track-3')).mix, .37); await page.locator('#undoButton').click();
  }
  passed.push('All fourteen effect editors, presets, bypass/reset and Undo operate on master/return without changing the selected instrument track');
}
async function automationScopes(page) {
  await page.evaluate(async () => { const state = busQA.blank(); state.loopEnabled = true; state.loopEnd = 4; state.selectedTrack = 2; state.master.effects[0] = busQA.fx('prism'); state.returns[0].effects[0] = busQA.fx('prism'); await LoomApp.loadState(state); });
  await selectBusSlot(page, 'master'); const targets = await page.locator('#loomAutoTarget option').evaluateAll(options => options.map(option => option.value)); assert(!targets.includes('pan') && !targets.includes('send:0')); await page.locator('#loomAutoTarget').selectOption('level'); await page.locator('[data-auto-action="write"]').click(); await page.evaluate(() => LoomApp.engine.play()); await page.waitForFunction(() => LoomApp.engine.getTransport().playing);
  await rangeKey(page, '#level-2', 'ArrowLeft'); await rangeKey(page, '[data-bus-param="level"][data-owner="return-1"]', 'ArrowLeft'); assert.equal((await page.evaluate(() => LoomApp.getState().master.automation)).length, 0, 'Track/return faders cannot write into master level automation');
  await rangeKey(page, '[data-bus-param="level"][data-owner="master"]', 'ArrowLeft'); assert((await page.evaluate(() => LoomApp.getState().master.automation)).some(lane => lane.target === 'level'));
  await selectBusSlot(page, 'return-1'); assert.equal(await page.locator('[data-auto-action="write"]').getAttribute('aria-pressed'), 'false', 'Changing owner disarms writing'); assert.match(await page.locator('.auto-track').textContent(), /RETURN A/i); await page.locator('#loomAutoTarget').selectOption('pan'); await page.locator('[data-auto-action="write"]').click(); await rangeKey(page, '#pan-2', 'ArrowRight'); assert(!(await page.evaluate(() => LoomApp.getState().returns[0].automation)).some(lane => lane.target === 'pan'), 'Track pan cannot write return pan'); await rangeKey(page, '[data-bus-param="pan"][data-owner="return-1"]', 'ArrowRight'); assert((await page.evaluate(() => LoomApp.getState().returns[0].automation)).some(lane => lane.target === 'pan'));
  await page.evaluate(() => LoomApp.selectTrack(2)); assert.equal(await page.locator('[data-auto-action="write"]').getAttribute('aria-pressed'), 'false'); await page.locator('#loomAutoTarget').selectOption('send:0'); await page.locator('[data-auto-action="write"]').click(); await rangeKey(page, '[data-track-send="0"][data-track="2"]', 'ArrowRight'); assert((await page.evaluate(() => LoomApp.getState().tracks[2].automation)).some(lane => lane.target === 'send:0')); await page.evaluate(() => LoomApp.engine.stop());
  await selectBusSlot(page, 'master'); await page.locator('#loomAutoTarget').selectOption('fx:0:low'); await page.locator('[data-auto-action="add"]').click(); const before = await page.evaluate(() => LoomApp.getState()); await page.locator('#effectDown').click(); const moved = await page.evaluate(() => LoomApp.getState()); assert(moved.master.automation.some(lane => lane.target === 'fx:1:low')); assert.deepEqual(moved.returns[0].automation, before.returns[0].automation); assert.deepEqual(moved.tracks[2].automation, before.tracks[2].automation); await page.locator('#undoButton').click();
  await selectBusSlot(page, 'master'); await page.locator('#loomAutoTarget').selectOption('fx:0:low'); await page.locator('[data-auto-point="0"]').click();
  const value = page.locator('[data-auto-field="point-value"]'); await value.focus(); await value.press('ControlOrMeta+A'); await value.pressSequentially('3.2'); await page.locator('[data-auto-action="delete-point"]').click();
  assert.equal((await page.evaluate(() => LoomApp.getState().master.automation.find(lane => lane.target === 'fx:0:low'))).points.length, 0, 'Numeric blur does not swallow the immediate Delete point click'); await page.locator('#undoButton').click(); assert.equal((await page.evaluate(() => LoomApp.getState().master.automation.find(lane => lane.target === 'fx:0:low'))).points[0].value, 3.2);
  passed.push('Master/return/track automation owner labels, write disarm, cross-owner fader/pan protection, own send capture and isolated effect reorder');
}
async function scopedMeters(page) {
  await installInput(page, false, true);
  await page.evaluate(async () => { const q = busQA, state = q.blank(); state.tracks[0].effects[0] = q.fx('scales', { output: 24 }); state.tracks[0].sends[0] = 1; state.returns[0].effects[0] = q.fx('scales', { output: 0 }); state.returns[0].level = .02; state.master.effects[0] = q.fx('scales', { output: 24 }); state.master.level = .05; await LoomApp.loadState(state); await q.engine.setMicrophoneMonitoring('track-1', { enabled: true }); });
  await selectBusSlot(page, 'return-1'); await rangeKey(page, '#fx-output', 'End'); await page.waitForFunction(() => { const m = LoomApp.engine.getMeters(); return m.effects?.[0]?.[0]?.clipLeft && m.returnEffects?.[0]?.[0]?.clipLeft && m.masterEffects?.[0]?.clipLeft; }, null, { timeout: 60000 }); await page.evaluate(() => busQA.input.gain.value = 0); await audioTime(page, .3);
  const state = await page.evaluate(() => LoomApp.getState()); await page.locator('#utilityResetMeters').press('Space'); await page.waitForFunction(() => !LoomApp.engine.getMeters().returnEffects?.[0]?.[0]?.clipLeft);
  const meters = await page.evaluate(() => LoomApp.engine.getMeters()); assert(meters.effects[0][0].clipLeft && meters.masterEffects[0].clipLeft, 'Only the selected return SCALES hold is reset'); assert.deepEqual(await page.evaluate(() => LoomApp.getState()), state, 'Meter reset never mutates project state'); await page.locator('#undoButton').click(); assert.equal((await ownerParams(page, 'return-1')).output, 0, 'Meter reset adds no history ahead of the real gain edit');
  await page.evaluate(() => LoomApp.selectTrack(1)); await selectBusSlot(page, 'master'); assert(await page.locator('#utilityInputShortcut').isHidden()); const buses = await page.evaluate(() => ({ master: LoomApp.getState().master, returns: LoomApp.getState().returns })); await page.locator('#audioSettingsButton').click(); await page.locator('#utilityPracticeButton').click(); await page.waitForFunction(() => LoomApp.engine.getMicrophoneStatus().enabled && LoomApp.engine.getMicrophoneStatus().trackId === 'track-2');
  const selected = await page.evaluate(() => ({ state: LoomApp.getState(), owner: LoomApp.selectedEffectOwner })); assert.equal(selected.owner, 'track-2'); assert.equal(selected.state.selectedTrack, 1); assert(selected.state.tracks[1].effects.some(effect => effect?.type === 'scales')); assert.deepEqual(selected.state.master, buses.master); assert.deepEqual(selected.state.returns, buses.returns); await page.evaluate(() => { document.getElementById('audioSettingsDialog').close(); LoomApp.engine.setMicrophoneMonitoring('track-2', { enabled: false }); });
  passed.push('Actual scoped return SCALES reset crosses Worklet without touching other holds/history, and Input→SCALES still targets an instrument track');
}
async function uiPersistence(page) {
  await page.evaluate(async () => { const q = busQA, state = q.blank(); state.selectedTrack = 2; state.master.effects[0] = q.fx('velvet', { model: 'bus-4k', threshold: -28 }); state.returns[0].effects[0] = q.fx('broiler', { model: 'jazz-120' }); state.returns[1].effects[0] = q.fx('swirl'); await LoomApp.loadState(state); });
  await page.locator('#trackSends > summary').click(); const send = page.locator('[data-send-number="0"][data-track="2"]'); await send.focus(); await send.press('ControlOrMeta+A'); await send.pressSequentially('37'); assert.equal(await send.inputValue(), '37'); await send.press('Tab'); await page.locator('[data-send-pre="0"][data-track="2"]').selectOption('pre'); assert.equal((await page.evaluate(() => LoomApp.getState().tracks[2])).sends[0], .37); assert.equal((await page.evaluate(() => LoomApp.getState().tracks[2])).sendPre[0], true);
  const number = page.locator('[data-bus-number="level"][data-owner="return-1"]'); await number.focus(); await number.press('ControlOrMeta+A'); await number.pressSequentially('0.37'); assert.equal(await number.inputValue(), '0.37'); assert(await number.evaluate(element => document.activeElement === element)); await number.press('Tab'); assert.equal((await page.evaluate(() => LoomApp.getState().returns[0])).level, .37); await page.locator('[data-bus-toggle="solo"][data-owner="return-1"]').click(); assert.equal((await page.evaluate(() => LoomApp.getState().returns[0])).solo, true); await page.locator('#undoButton').click();
  await selectBusSlot(page, 'master'); await page.locator('#compressorClassicSettings').click(); assert.equal((await page.evaluate(() => LoomApp.getState().master.effects[0].params)).model, 'bus-4k'); await page.locator('#undoButton').click(); assert.equal((await page.evaluate(() => LoomApp.getState().master.effects[0].params)).threshold, -28);
  const saved = await page.evaluate(() => LoomApp.getState()), downloadEvent = page.waitForEvent('download'); await page.locator('#saveButton').click(); const download = await downloadEvent, bytes = fs.readFileSync(await download.path()); assert.deepEqual(JSON.parse(bytes).state.master, saved.master); assert.deepEqual(JSON.parse(bytes).state.returns, saved.returns);
  await page.evaluate(() => LoomApp.loadState(busQA.blank())); await page.locator('#projectFile').setInputFiles({ name: 'bus-roundtrip.loom.json', mimeType: 'application/json', buffer: bytes }); await page.waitForFunction(expected => JSON.stringify(LoomApp.getState().returns) === JSON.stringify(expected), saved.returns); assert.deepEqual(await page.evaluate(() => LoomApp.getState().master), saved.master); assert.deepEqual(await page.evaluate(() => LoomApp.getState().tracks[2].sends), [.37, 0]);
  await page.waitForFunction(expected => JSON.stringify(JSON.parse(localStorage.getItem('loom-session-v1') || '{}').state?.master) === JSON.stringify(expected), saved.master); await page.reload(); await page.waitForFunction(() => window.LoomApp); await helpers(page); assert.deepEqual(await page.evaluate(() => LoomApp.getState().master), saved.master); assert.deepEqual(await page.evaluate(() => LoomApp.getState().returns), saved.returns);
  for (const width of [320, 390, 1440]) { await page.setViewportSize({ width, height: 1000 }); await page.locator('#busChannels').screenshot({ path: path.join(artifacts, 'galley-buses-' + width + '.png') }); const overflow = await page.locator('#busChannels').evaluate(panel => [...panel.querySelectorAll('input,select,button')].filter(element => { const b = element.getBoundingClientRect(); return b.width && (b.left < -1 || b.right > innerWidth + 1); }).map(element => element.id || element.className)); assert.deepEqual(overflow, [], 'Bus controls fit' + width + 'px'); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await page.locator('[data-bus-focus="master"]').tap(); assert.equal(await page.evaluate(() => LoomApp.getState().selectedTrack), 2); }
  passed.push('Exact send/pre tap and bus values, mute/solo Undo, master compressor classic scope, Save/Open/recovery, keyboard/touch and320/390/1440px bus layout');
}
async function uiChecks(browser, url, scopeOnly = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true, acceptDownloads: true, reducedMotion: 'reduce' }), page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message)); await context.route('**/*', route => route.request().url() === url + '/loom/index.html' ? route.continue() : (requests.push(route.request().url()), route.abort()));
  try { await page.goto(url + '/loom/index.html'); await page.waitForFunction(() => window.LoomApp); await helpers(page); if (scopeOnly) await automationScopes(page); else { await matrixPanels(page); await automationScopes(page); await scopedMeters(page); await uiPersistence(page); } assert.deepEqual(errors, []); assert.deepEqual(requests, []); }
  finally { await page.evaluate(async () => { busQA.sources?.forEach(source => { try { source.stop(); } catch {} }); await LoomApp.engine.dispose(); }).catch(() => {}); await context.close(); }
}
async function exportChecks(browser, url) {
  const grainCandidates = [path.join(__dirname, 'instruments', 'grain.html'), path.join(root, 'grain', 'index.html')], grain = fs.readFileSync(grainCandidates.find(file => fs.existsSync(file)), 'utf8');
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, reducedMotion: 'reduce' }), page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message)); await context.route('**/*', route => route.request().url() === url + '/loom/index.html' ? route.continue() : (requests.push(route.request().url()), route.abort()));
  try {
    await page.goto(url + '/loom/index.html'); await page.waitForFunction(() => window.LoomApp); await helpers(page);
    await page.evaluate(html => { window.LoomEmbeddedInstruments.grain = html; }, grain);
    const source = await page.evaluate(async () => {
      const q = busQA, context = new AudioContext({ sampleRate: 48000 }); await context.resume(); const input = context.createGain(); input.gain.value = 0; input.connect(context.destination); const frame = document.createElement('iframe'); frame.hidden = true; document.body.append(frame); const host = new LoomInstrumentHost({ context, getTrackInput: () => input, embedded: LoomEmbeddedInstruments });
      let descriptor, packet;
      try {
        await host.load('bus-native-source', { id: 'grain' }, frame); const app = frame.contentWindow.GrainApp, project = app.getProject(); project.state.bpm = 120; project.state.swing = project.state.drive = project.state.space = 0; project.state.master = .4; project.state.stepCount = 16; project.bank = 0; project.selected = 2;
        project.banks = Array.from({ length: 4 }, () => Array.from({ length: 8 }, () => Array(32).fill(0))); project.bankLocks = project.banks.map(bank => bank.map(row => row.map(() => ({})))); project.banks[0][2][0] = 1; project.chain = { enabled: false, loop: true, entries: [] }; project.state.tracks.forEach((track, index) => { track.steps = [...project.banks[0][index]]; track.mute = track.solo = false; }); await app.loadState(project);
        packet = app.getSequencerPattern({ scope: 'voice', voice: 2 }); packet.lengthBeats = 1; packet.notes = [{ ...packet.notes[0], id: 'bus-native-hit', beat: .25, duration: .25, velocity: .5 }]; packet = MusicLabPatternSchema.normalize(packet); descriptor = { id: 'grain', snapshot: await host.snapshot('bus-native-source') };
      } finally { host.dispose(); frame.remove(); await context.close(); }
      const state = q.fixture(); state.selectedTrack = 1; state.tracks[2].instrument = descriptor; state.tracks[2].level = .3; state.tracks[2].sends = [.25, .2]; state.tracks[2].clips = [{ id: 'native-bus-note', name: 'Native bus note', type: 'notes', pattern: packet, voiceMap: Object.fromEntries(packet.voices.map(voice => [voice.id, voice.id])), start: 0, length: 1, sourceOffset: 0, rate: 1, transpose: 0, loop: false, gain: 1, fadeIn: 0, fadeOut: 0 }];
      await LoomApp.loadState(state); await LoomApp.engine.init(); await LoomApp.engine.context.resume(); const before = JSON.stringify(LoomApp.getState()), printed = await LoomApp.noteRenderer.print(LoomApp.getState(), 'track-3', 'native-bus-note', { tailSeconds: .2 });
      q.exportBefore = structuredClone(LoomApp.getState()); return { unchanged: before === JSON.stringify(LoomApp.getState()), nativePrint: q.stats(printed.audio.left), origin: printed.origin.format, sourceNotes: printed.origin.pattern.notes.length, clipType: printed.clip.type };
    });
    assert(source.unchanged && source.nativePrint.finite && source.nativePrint.rms > .0001); assert.equal(source.origin, 'loom-render-source'); assert.equal(source.sourceNotes, 1); assert.equal(source.clipType, 'audio');
    await selectBusSlot(page, 'master'); assert.equal(await page.evaluate(() => LoomApp.getState().selectedTrack), 1);
    async function download(mode) {
      await page.locator('#exportButton').click(); await page.locator('#exportMode').selectOption(mode); await page.locator('#exportRange').selectOption('loop'); await page.locator('#exportTail').selectOption('2'); const event = page.waitForEvent('download', { timeout: 120000 }); await page.locator('#renderButton').click(); const file = await event, bytes = fs.readFileSync(await file.path()); await page.locator('#closeExport').click(); return { name: file.suggestedFilename(), bytes };
    }
    const all = await download('all'), entries = zipFiles(all.bytes); assert.equal(entries.length, 10); assert.match(all.name, /ten-stems\.zip$/);
    for (let index = 0; index < 8; index++) assert(entries.some(file => file.name.includes('-' + String(index + 1).padStart(2, '0') + '-') && file.name.endsWith('-dry.wav')));
    const returnA = entries.find(file => /09-return-a-wet\.wav$/.test(file.name)), returnB = entries.find(file => /10-return-b-wet\.wav$/.test(file.name)); assert(returnA && returnB);
    const track1 = entries.find(file => /-01-.*-dry\.wav$/.test(file.name)), track2 = entries.find(file => /-02-.*-dry\.wav$/.test(file.name)), native = entries.find(file => /-03-.*-dry\.wav$/.test(file.name));
    const dry1 = wavAudio(track1.bytes), dry2 = wavAudio(track2.bytes), wetA = wavAudio(returnA.bytes), wetB = wavAudio(returnB.bytes), nativeAudio = wavAudio(native.bytes); assert(rms(nativeAudio.left) > .0001, 'The native note source reaches its dry stem');
    assert(projection(wetA.left, 137) > .00005 && projection(wetA.left, 383) > .00005, 'Each return stem receives every normally audible source track'); assert(rms(wetB.left.subarray(48000)) > .000001, 'The exported shared delay retains a tail beyond one second');
    const selected = await download('stem'); assert.equal(createHash('sha256').update(selected.bytes).digest('hex'), createHash('sha256').update(track2.bytes).digest('hex'), 'Selected-track stem remains the actual instrument track while master rack is focused');
    const onlyReturn = await download('return-1'); assert.equal(createHash('sha256').update(onlyReturn.bytes).digest('hex'), createHash('sha256').update(returnA.bytes).digest('hex'), 'Explicit return export and the ZIP wet stem agree');
    const mix = wavAudio((await download('mix')).bytes), drySum = rms(Float32Array.from(dry1.left, (_, i) => dry1.left[i] + dry2.left[i] + wetA.left[i] + wetB.left[i] + nativeAudio.left[i])); assert(rms(mix.left) < drySum * .5, 'Master high-pass processes the mix while all ten stems skip its insert chain');
    const remaining = await page.evaluate(() => { const before = busQA.exportBefore, after = LoomApp.getState(); return { notes: after.tracks[2].clips[0].type, clipSame: JSON.stringify(before.tracks[2].clips) === JSON.stringify(after.tracks[2].clips), assetsSame: JSON.stringify(before.assets) === JSON.stringify(after.assets), masterSame: JSON.stringify(before.master) === JSON.stringify(after.master), returnsSame: JSON.stringify(before.returns) === JSON.stringify(after.returns), selectedTrack: after.selectedTrack }; }); assert.equal(remaining.notes, 'notes'); assert(remaining.clipSame && remaining.assetsSame && remaining.masterSame && remaining.returnsSame); assert.equal(remaining.selectedTrack, 1); assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    passed.push('Actual SIZZLE native Print/source preservation, ten-entry dry/wet stem ZIP, all-source return feeds and long tails, correct selected-track scope, explicit return parity and master-only mix processing');
  } finally { await page.evaluate(() => LoomApp.engine.dispose()).catch(() => {}); await context.close(); }
}

(async () => {
  fs.mkdirSync(artifacts, { recursive: true }); const server = await serve(), browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try { for (const phase of (process.env.LOOM_BUS_QA_PHASES || 'legacy,worklet,fallback,ui,exports').split(',')) { if (phase === 'legacy') await legacyChecks(browser, server.url); else if (phase === 'worklet' || phase === 'fallback') await engineChecks(browser, server.url, phase === 'fallback'); else if (phase === 'ui' || phase === 'scope') await uiChecks(browser, server.url, phase === 'scope'); else if (phase === 'exports') await exportChecks(browser, server.url); else throw Error('Unknown bus phase: ' + phase); console.log('PASS buses ' + phase); } passed.forEach(label => console.log('PASS ' + label)); }
  finally { await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
