'use strict';
// Actual Chromium PRESERVE UI, serialized AudioWorklet, fallback and WAV checks.
// LOOM_TAPE_QA_BUILT=1 uses the complete generated GALLEY; the default assembles
// maintained sources without large bundled instruments. Select phases with
// LOOM_TAPE_QA_PHASES=dsp,worklet,fallback,ui; meters reruns only live UI bindings.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const shared = fs.existsSync(path.join(__dirname, 'shared', 'pattern-schema.js')) ? path.join(__dirname, 'shared') : path.join(root, 'shared');
const artifacts = process.env.LOOM_TAPE_QA_DIR || '/tmp/preserve-browser-qa';
const scripts = ['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'preamp-catalog.js', 'tape-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'tape-dsp.js', 'effects.js', 'schema.js', 'audio-engine.js'];
const passed = [], evidence = {};
const copy = value => JSON.parse(JSON.stringify(value));
const screenshotStyle = '.transport{position:static!important}#status{visibility:hidden!important}';

function maintainedHTML() {
  if (process.env.LOOM_TAPE_QA_PREVIEW) return fs.readFileSync(process.env.LOOM_TAPE_QA_PREVIEW);
  if (process.env.LOOM_TAPE_QA_BUILT) return fs.readFileSync(path.join(__dirname, 'index.html'));
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
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://local').pathname;
    if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    if (pathname === '/loom/index.html' || pathname === '/engine.html' && process.env.LOOM_TAPE_QA_BUILT) {
      ui ||= maintainedHTML(); response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(ui); return;
    }
    if (pathname === '/engine.html') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><meta charset="utf-8"><body><script src="/shared/pattern-schema.js"></script>' + scripts.map(name => '<script src="/loom/' + name + '"></script>').join('')); return;
    }
    const base = pathname.startsWith('/loom/') ? __dirname : pathname.startsWith('/shared/') ? shared : root;
    const relative = pathname.startsWith('/loom/') ? pathname.slice(5) : pathname.startsWith('/shared/') ? pathname.slice(7) : pathname;
    const file = path.resolve(base, '.' + relative);
    if (!file.startsWith(base + path.sep)) { response.writeHead(403); response.end(); return; }
    fs.readFile(file, (error, bytes) => { response.writeHead(error ? 404 : 200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); response.end(error ? 'Missing fixture' : bytes); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: 'http://127.0.0.1:' + server.address().port, close: () => new Promise(resolve => server.close(resolve)) };
}
async function helpers(page) {
  await page.evaluate(() => {
    window.tapeQA = {
      definition: LoomEffectsCatalog.find(effect => effect.id === 'preserve'),
      factory: createLoomEffectsDSP(createLoomVocalDSP, createLoomUtilityDSP, createLoomFilterDSP, createLoomCreativeDSP, createLoomBroilerPedalsDSP, createLoomCompressorDSP, createLoomPreampDSP, createLoomTapeDSP),
      owner: (state, id) => LoomSchema.automationOwner(state, id),
      fx(patch = {}) { return LoomSchema.effect({ type: 'preserve', params: { ...this.definition.defaults, ...patch } }); },
      blank() {
        const state = LoomSchema.defaultState(); state.name = 'Preserve browser session'; state.tempo = 120; state.lengthBars = 1; state.loopEnabled = false; state.loopStart = 0; state.loopEnd = 1; state.master.level = 1; state.master.effects.fill(null);
        state.returns.forEach(owner => { owner.effects.fill(null); owner.level = 1; }); state.tracks.forEach(track => { track.instrumentLive = false; track.level = 1; }); state.recording.micCompensation = 'off'; state.recording.micInputGainDb = 0; return state;
      },
      source(frames = 16384, rate = 48000) { return [0, 1].map(channel => Float32Array.from({ length: frames }, (_, i) => { const amplitude = i < 2048 ? .03 : i < 8192 ? .36 : .09; return amplitude * (channel ? .73 * Math.sin(2 * Math.PI * 227 * i / rate) + .13 * Math.cos(2 * Math.PI * 1327 * i / rate) : Math.sin(2 * Math.PI * 137 * i / rate) + .25 * Math.sin(2 * Math.PI * 1703 * i / rate)); })); },
      stats(data, start = 0) { let power = 0, peak = 0, first = -1, last = -1; for (let i = start; i < data.length; i++) { const x = data[i]; if (!Number.isFinite(x)) return { finite: false }; power += x * x; peak = Math.max(peak, Math.abs(x)); if (Math.abs(x) > 1e-7) { if (first < 0) first = i; last = i; } } return { finite: true, rms: Math.sqrt(power / Math.max(1, data.length - start)), peak, first, last }; },
      difference(a, b) { let power = 0, max = 0; for (let i = 0; i < a.length; i++) { const x = a[i] - b[i]; power += x * x; max = Math.max(max, Math.abs(x)); } return { rms: Math.sqrt(power / a.length), max }; },
      projection(audio, frequency, rate = 48000) { let real = 0, imaginary = 0; for (let i = 0; i < audio.length; i++) { real += audio[i] * Math.cos(2 * Math.PI * frequency * i / rate); imaginary += audio[i] * Math.sin(2 * Math.PI * frequency * i / rate); } return 2 * Math.hypot(real, imaginary) / audio.length; },
      render(patch = {}, source = this.source(), block = 128, rate = 48000) { const effect = this.factory.create('preserve', rate, { ...this.definition.defaults, ...patch }), left = source[0].slice(), right = source[1].slice(); for (let at = 0; at < left.length; at += block) effect.process(left.subarray(at, at + block), right.subarray(at, at + block), { tempo: 120, playing: true }); return { left, right, effect }; },
      fixture() {
        const state = this.blank(), source = this.source(12000);
        const asset = LoomSchema.encodeAsset({ id: 'tape-audio', name: 'Tape source', left: source[0], right: source[1], sampleRate: 48000 }); state.assets = [asset];
        state.tracks[0].clips = [{ id: 'tape-clip', name: 'Tape audio', assetId: asset.id, start: .25, length: .5, sourceStart: 0, sourceEnd: .25, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: .2, fadeIn: 0, fadeOut: 0 }];
        state.tracks[0].effects[0] = this.fx({ model: 'valve', drive: 18, output: -3, warmth: .8, wow: .3, flutter: .04 }); state.tracks[0].sends = [.3, .2];
        state.returns[0].effects[0] = this.fx({ model: 'cassette', speed: '1.875', drive: 12, output: -6, wear: .35 }); state.returns[1].effects[0] = this.fx({ model: 'home', drive: 21, output: -9, flutter: .06 });
        state.master.effects[0] = this.fx({ model: 'studio', speed: '30', drive: 8, output: -3, warmth: .4 });
        state.tracks[0].automation = [{ target: 'fx:0:drive', effectType: 'preserve', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: 6 }, { beat: 1, value: 24 }] }];
        state.returns[0].automation = [{ target: 'fx:0:wear', effectType: 'preserve', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: .1 }, { beat: 1, value: .7 }] }];
        state.master.automation = [{ target: 'fx:0:warmth', effectType: 'preserve', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: .2 }, { beat: 1, value: .9 }] }]; return state;
      }
    };
  });
}
async function dspChecks(browser, url) {
  const page = await browser.newPage();
  try {
    await page.goto(url + '/engine.html'); await helpers(page);
    const result = await page.evaluate(() => {
      const q = tapeQA, source = q.source(), models = ['studio', 'valve', 'home', 'cassette'], signals = [], rows = [];
      for (const model of models) {
        const rendered = q.render({ model, drive: 18, warmth: .8 }, source), odd = q.render({ model, drive: 18, warmth: .8 }, source, 137);
        signals.push(rendered.left); rows.push({ model, stats: q.stats(rendered.left), partition: q.difference(rendered.left, odd.left).max, meters: rendered.effect.getMeters() });
      }
      const distances = [];
      for (let a = 0; a < models.length; a++) for (let b = a + 1; b < models.length; b++) { const ar = q.stats(signals[a]).rms, br = q.stats(signals[b]).rms; distances.push({ a: models[a], b: models[b], rms: q.difference(Float32Array.from(signals[a], x => x / ar), Float32Array.from(signals[b], x => x / br)).rms }); }
      const impulse = new Float32Array(256); impulse[139] = .1;
      const defaultImpulse = q.render({}, [impulse, impulse]).left;
      const zero = q.render({}, [new Float32Array(4096), new Float32Array(4096)]).left;
      const dry = q.render({ wow: 1.5, flutter: .5, wear: 1, noise: 1, dropouts: 1, mix: 0 }, source);
      const bypass = q.render({ wow: 1.5, flutter: .5, wear: 1, noise: 1, dropouts: 1, bypass: true }, source);
      const active = q.render({ wow: .6, flutter: .1, mix: .5 }, source);
      return { rows, distances, defaultImpulse: q.stats(defaultImpulse), silence: q.stats(zero), dryL: q.difference(dry.left, source[0]).max, dryR: q.difference(dry.right, source[1]).max, bypassL: q.difference(bypass.left, source[0]).max, bypassR: q.difference(bypass.right, source[1]).max, activeMotion: q.stats(active.left), defaultMeters: q.render().effect.getMeters() };
    });
    for (const row of result.rows) { assert(row.stats.finite && row.stats.rms > .001 && row.stats.peak <= 8, JSON.stringify(row)); assert.equal(row.partition, 0, row.model + ' block-size independent'); for (const key of ['inputDb', 'tapeDb', 'outputDb', 'compressionDb', 'transportMs']) assert(Number.isFinite(row.meters[key]), row.model + ' actual meter ' + key); }
    for (const row of result.distances) assert(row.rms > 1e-5, 'Machine responses differ beyond output gain: ' + JSON.stringify(row));
    assert.equal(result.silence.peak, 0, 'Default tape does not generate noise in idle racks'); assert.equal(result.defaultImpulse.first, 139, 'Zero motion does not delay the source attack'); assert.equal(result.defaultMeters.transportMs, 0);
    for (const key of ['dryL', 'dryR', 'bypassL', 'bypassR']) assert.equal(result[key], 0, key + ' preserves exact undelayed stereo source even with maximum motion/noise');
    assert(result.activeMotion.finite && result.activeMotion.rms > .001); evidence.dsp = result;
  } finally { await page.close(); }
}
async function audioTime(page, seconds) {
  const until = await page.evaluate(seconds => tapeQA.engine.context.currentTime + seconds, seconds);
  await page.waitForFunction(until => tapeQA.engine.context.currentTime >= until, until, { timeout: 60000 });
}
async function installInput(page, fallback) {
  await helpers(page);
  await page.evaluate(async fallback => {
    if (fallback) window.AudioWorkletNode = undefined;
    const q = tapeQA, state = q.blank(); state.tracks[0].effects[0] = q.fx({ bypass: true }); const engine = q.engine = new LoomAudio(state);
    await engine.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'live' }); await engine.init(); await engine.context.resume(); q.sources = []; q.input = engine.context.createGain();
    for (const [frequency, level] of [[137, .24], [1703, .07]]) { const source = engine.context.createOscillator(), gain = engine.context.createGain(); source.frequency.value = frequency; gain.gain.value = level; source.connect(gain); gain.connect(q.input); source.start(); q.sources.push(source); }
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { const destination = engine.context.createMediaStreamDestination(); q.input.connect(destination); const stream = destination.stream, track = stream.getAudioTracks()[0], settings = track.getSettings.bind(track); track.getSettings = () => ({ ...settings(), latency: 0, sampleRate: engine.context.sampleRate }); return stream; } });
    await engine.setMicrophoneMonitoring('track-1', { enabled: true }); q.analyser = engine.context.createAnalyser(); q.analyser.fftSize = 8192; engine.node.connect(q.analyser);
    q.signal = () => { const audio = new Float32Array(q.analyser.fftSize); q.analyser.getFloatTimeDomainData(audio); return q.stats(audio); };
    q.set = (id, patch) => { const state = q.blank(), owner = q.owner(state, id); owner.effects[0] = q.fx(patch); if (id.startsWith('return-')) { state.tracks[0].sends[Number(id.slice(-1)) - 1] = 1; owner.solo = true; } engine.setState(state); };
  }, fallback);
}
async function offlineChecks(page) {
  return page.evaluate(async () => {
    const q = tapeQA, state = LoomSchema.parseProject(LoomSchema.serializeProject(q.fixture())), assets = LoomSchema.decodeAssets(state.assets), results = [], main = 24000, total = 36000;
    for (const options of [{}, { trackId: 'track-1' }, { returnId: 'return-1' }, { returnId: 'return-2' }]) {
      const blob = await q.engine.renderWav(state, assets, { ...options, snapshotReady: true, startBeat: 0, endBeat: 1, tailSeconds: .25 }), view = new DataView(await blob.arrayBuffer());
      const core = new (createLoomEngineDSP(createLoomEffectsDSP).Core)(state, assets, 48000, { linear: true, ...options }); core.start(0); let error = 0, peak = 0, leading = 0, first = -1;
      for (let at = 0; at < total;) { if (at === main) core.stop(); const n = Math.min(137, total - at, at < main ? main - at : total - at), left = new Float32Array(n), right = new Float32Array(n); core.processBlock(left, right); for (let i = 0; i < n; i++) for (let channel = 0; channel < 2; channel++) { const value = Math.max(-1, Math.min(1, (channel ? right : left)[i])), reference = Math.round(value * (value < 0 ? 32768 : 32767)), actual = view.getInt16(44 + (at + i) * 4 + channel * 2, true); error = Math.max(error, Math.abs(actual - reference)); peak = Math.max(peak, Math.abs(actual)); if (at + i < 6000) leading = Math.max(leading, Math.abs(actual)); if (first < 0 && Math.abs(actual) > 1) first = at + i; } at += n; }
      results.push({ options, bytes: view.byteLength, rate: view.getUint32(24, true), error, peak, leading, first });
    }
    return { results, roundtrip: JSON.stringify(state) === JSON.stringify(LoomSchema.parseProject(LoomSchema.serializeProject(state))) };
  });
}
async function transitionChecks(page) {
  // Fallback observation wraps its existing callback. A second ScriptProcessor
  // would add main-thread scheduling pressure and can reorder observed blocks.
  await page.evaluate(() => {
    const q = tapeQA, context = q.engine.context;
    q.captureFallback = q.engine.mode === 'fallback'; q.captureActive = true;
    q.resetCapture = () => { q.captured = []; q.captureClocks = []; q.captureFrameCount = 0; };
    q.resetCapture(); q.captureEvents = [];
    if (q.captureFallback) {
      // Keep the dry-recording test on the real MediaStream bridge, but use a
      // same-context native instrument input for this transition-only fixture.
      // A fake MediaStream bridge can itself jump at ring-buffer boundaries.
      q.engine._send({ type: 'microphoneMonitor', track: 0, enabled: false }); q.input.connect(q.engine.inputs[0]); q.engine.resumeAudition('track-1');
      q.originalCaptureCallback = q.engine.node.onaudioprocess;
      q.engine.node.onaudioprocess = event => {
        // A continuous payload isolates tape switching from headless native
        // ScriptProcessor input underruns. The real MediaStream dry recording
        // and live monitoring paths are tested separately above.
        const frame = q.engine.core.sampleClock, left = event.inputBuffer.getChannelData(0), right = event.inputBuffer.getChannelData(1);
        for (let i = 0; i < left.length; i++) { const time = (frame + i) / context.sampleRate, value = .24 * Math.sin(2 * Math.PI * 137 * time) + .07 * Math.sin(2 * Math.PI * 1703 * time); left[i] = value; right[i] = value; }
        const raw = [left.slice(), right.slice()];
        q.originalCaptureCallback(event);
        if (q.captureActive) { const output = [event.outputBuffer.getChannelData(0).slice(), event.outputBuffer.getChannelData(1).slice()]; q.captured.push([...output, ...raw]); q.captureClocks.push({ frame, time: event.playbackTime, length: output[0].length }); q.captureFrameCount += output[0].length; }
      };
    } else {
      q.capture = context.createScriptProcessor(256, 2, 2); q.captureMute = context.createGain(); q.captureMute.gain.value = 0;
      q.capture.onaudioprocess = event => { if (q.captureActive) { const channels = [event.inputBuffer.getChannelData(0).slice(), event.inputBuffer.getChannelData(1).slice()]; q.captured.push(channels); q.captureClocks.push({ frame: null, time: event.playbackTime, length: channels[0].length }); q.captureFrameCount += channels[0].length; } for (let channel = 0; channel < event.outputBuffer.numberOfChannels; channel++) event.outputBuffer.getChannelData(channel).fill(0); };
      q.engine.node.connect(q.capture); q.capture.connect(q.captureMute); q.captureMute.connect(context.destination);
    }
    q.captureStats = () => {
      const accumulators = [0, 1].map(() => ({ jump: 0, peak: 0, energy: 0, finite: true, previous: [null, null], at: -1 })); let frames = 0;
      for (let block = 0; block < q.captured.length; block++) { const channels = q.captured[block]; for (let pair = 0; pair < channels.length / 2; pair++) { const a = accumulators[pair]; for (let channel = 0; channel < 2; channel++) for (let i = 0; i < channels[channel + pair * 2].length; i++) { const value = channels[channel + pair * 2][i], prior = a.previous[channel]; a.finite &&= Number.isFinite(value); if (prior !== null && Math.abs(value - prior) > a.jump) { a.jump = Math.abs(value - prior); a.at = frames + i; a.block = block; a.blockOffset = i; a.channel = channel; a.from = prior; a.to = value; a.coreFrame = q.captureClocks[block].frame === null ? null : q.captureClocks[block].frame + i; a.time = q.captureClocks[block].time + i / context.sampleRate; } a.previous[channel] = value; a.peak = Math.max(a.peak, Math.abs(value)); a.energy += value * value; } } frames += channels[0].length; }
      const summary = a => ({ jump: a.jump, peak: a.peak, finite: a.finite, rms: Math.sqrt(a.energy / Math.max(1, frames * 2)), at: a.at, block: a.block, blockOffset: a.blockOffset, channel: a.channel, from: a.from, to: a.to, coreFrame: a.coreFrame, time: a.time });
      const clockGaps = []; if (q.captureFallback) for (let i = 1; i < q.captureClocks.length; i++) if (q.captureClocks[i].frame !== q.captureClocks[i - 1].frame + q.captureClocks[i - 1].length) clockGaps.push({ previous: q.captureClocks[i - 1], next: q.captureClocks[i] });
      return { ...summary(accumulators[0]), frames, raw: q.captureFallback ? summary(accumulators[1]) : null, clockGaps };
    };
  });
  try {
    await audioTime(page, .15); await page.evaluate(() => tapeQA.resetCapture()); await audioTime(page, .25); const dry = await page.evaluate(() => tapeQA.captureStats());
    const base = { model: 'studio', drive: 8, warmth: .6, output: -6, wow: .5, flutter: .06 };
    await page.evaluate(base => tapeQA.set('track-1', base), base); await audioTime(page, .35); await page.evaluate(() => tapeQA.resetCapture()); await audioTime(page, .25); const wet = await page.evaluate(() => tapeQA.captureStats());
    await page.evaluate(() => tapeQA.resetCapture()); let current = { ...base, mix: 1, bypass: false };
    for (const patch of [{ mix: 0 }, { mix: 1 }, { mix: .25 }, { bypass: true }, { bypass: false }, { mix: .75 }, { mix: 0 }]) { current = { ...current, ...patch }; await page.evaluate(patch => { const q = tapeQA; q.captureEvents.push({ capturedFrame: q.captureFrameCount, coreFrame: q.engine.core?.sampleClock ?? null, time: q.engine.context.currentTime, patch }); q.set('track-1', patch); }, current); await audioTime(page, .18); }
    const moving = await page.evaluate(() => { tapeQA.captureActive = false; return tapeQA.captureStats(); }), bound = Math.max(dry.jump, wet.jump) * 2.5 + .005;
    const events = await page.evaluate(() => tapeQA.captureEvents), result = { source: moving.raw ? 'continuous sample-clock payload in the actual fallback callback; real I/O and dry recording tested separately' : 'MediaStream monitoring with independent output observation', dry, wet, moving, maximumAllowedJump: bound, events };
    if (moving.jump > bound) {
      const data = await page.evaluate(() => { const q = tapeQA, channels = q.captured[0]?.length || 2, pcm = new Float32Array(q.captureFrameCount * channels); let at = 0; for (const block of q.captured) for (let frame = 0; frame < block[0].length; frame++) for (let channel = 0; channel < channels; channel++) pcm[at++] = block[channel][frame]; const bytes = new Uint8Array(pcm.buffer); let text = ''; for (let at = 0; at < bytes.length; at += 32768) text += String.fromCharCode(...bytes.subarray(at, at + 32768)); return { base64: btoa(text), channels, sampleRate: q.engine.context.sampleRate, clocks: q.captureClocks }; });
      const name = path.join(artifacts, 'tape-transition-' + (moving.raw ? 'fallback' : 'worklet')); fs.writeFileSync(name + '.f32', Buffer.from(data.base64, 'base64')); delete data.base64; fs.writeFileSync(name + '.json', JSON.stringify({ ...result, ...data }, null, 2));
    }
    assert(dry.finite && wet.finite && moving.finite && dry.rms > .05 && wet.rms > .005);
    assert(moving.frames >= 24000, 'Live transition observation includes at least half a second of real PCM');
    assert.deepEqual(moving.clockGaps, [], 'Fallback capture observes contiguous actual engine callbacks');
    assert(moving.jump <= bound, 'Blend/bypass transitions have no isolated hard jump beyond the dry/wet waveform slope: ' + JSON.stringify(result));
    return result;
  } finally {
    await page.evaluate(() => { const q = tapeQA; if (q.captureFallback) { q.engine.node.onaudioprocess = q.originalCaptureCallback; q.input.disconnect(q.engine.inputs[0]); q.engine.clearAudition('track-1'); q.engine._send({ type: 'microphoneMonitor', track: 0, enabled: true }); } else { q.capture.onaudioprocess = null; q.engine.node.disconnect(q.capture); q.capture.disconnect(); q.captureMute.disconnect(); } q.captured = []; });
  }
}
async function engineChecks(browser, url, fallback) {
  const page = await browser.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url + '/engine.html'); await installInput(page, fallback); await audioTime(page, .35);
    const raw = await page.evaluate(() => ({ ...tapeQA.signal(), mode: tapeQA.engine.mode, frames: tapeQA.engine.getAudioDiagnostics().processingFrames, inputs: tapeQA.engine.node.numberOfInputs }));
    assert.equal(raw.mode, fallback ? 'fallback' : 'worklet'); assert.equal(raw.frames, fallback ? 256 : 128); if (!fallback) assert.equal(raw.inputs, 9); assert(raw.finite && raw.rms > .1);
    const readings = [];
    for (const [id, model] of [['track-1', 'studio'], ['track-1', 'valve'], ['track-1', 'home'], ['track-1', 'cassette'], ['master', 'studio'], ['return-1', 'cassette'], ['return-2', 'home']]) {
      await page.evaluate(({ id, model }) => tapeQA.set(id, { model, drive: 12, warmth: .65, output: -18, wow: .2, flutter: .03 }), { id, model }); await audioTime(page, .3);
      const row = await page.evaluate(id => ({ ...tapeQA.signal(), meter: id === 'master' ? tapeQA.engine.getMeters().masterEffects?.[0] : id.startsWith('return-') ? tapeQA.engine.getMeters().returnEffects?.[Number(id.slice(-1)) - 1]?.[0] : tapeQA.engine.getMeters().effects?.[0]?.[0] }), id);
      assert(row.finite && row.rms > 1e-5 && row.rms < raw.rms * .5, id + '/' + model + ' processes actual live monitoring: ' + JSON.stringify(row)); assert.equal(row.meter?.type, 'preserve'); for (const key of ['inputDb', 'tapeDb', 'outputDb', 'compressionDb', 'transportMs']) assert(Number.isFinite(row.meter[key]), id + ' actual ' + key); assert(row.meter.transportMs > 0, 'Motion reports actual causal head delay'); readings.push({ id, model, ...row });
    }
    await page.evaluate(() => { const q = tapeQA, state = q.blank(); state.tracks[0].effects[0] = q.fx({ model: 'cassette', input: 18, drive: 24, warmth: 1, wear: 1, wow: 1.5, flutter: .5, noise: .5, dropouts: 1, output: -20 }); state.master.mute = true; q.engine.setState(state); }); await audioTime(page, .3);
    assert((await page.evaluate(() => tapeQA.signal().rms)) < .0001, 'Master mute still gates tape/noise monitoring');
    if (fallback) await page.evaluate(() => { const q = tapeQA, callback = q.engine.node.onaudioprocess; q.rawReferences = []; q.engine.node.onaudioprocess = event => { if (q.engine.recorder.active && q.engine.recorder.microphone) q.rawReferences.push([event.inputBuffer.getChannelData(16).slice(), event.inputBuffer.getChannelData(17).slice()]); callback(event); }; });
    await page.evaluate(() => tapeQA.engine.startMicrophoneRecording('track-1', { startTransport: false, maxSeconds: .25 })); await page.waitForFunction(() => !tapeQA.engine.isRecording, null, { timeout: 60000 });
    const take = await page.evaluate(async () => { const q = tapeQA, audio = (await q.engine.stopRecording())[0]; if (!audio) return {}; const stable = audio.left.subarray(Math.floor(audio.sampleRate * .04)); let rawError = null; if (q.rawReferences) { rawError = 0; let at = 0; for (const [left, right] of q.rawReferences) for (let i = 0; i < left.length && at < audio.frames; i++, at++) rawError = Math.max(rawError, Math.abs(audio.left[at] - left[i]), Math.abs(audio.right[at] - right[i])); } return { ...q.stats(audio.left), frames: audio.frames, rate: audio.sampleRate, fundamental: q.projection(stable, 137, audio.sampleRate), third: q.projection(stable, 411, audio.sampleRate), rawError }; });
    assert(take.finite && take.rms > raw.rms * .9 && take.rms < raw.rms * 1.1 && take.peak > raw.peak * .9 && take.peak < raw.peak * 1.1, 'Dry recording retains actual bypass-reference level under extreme tape processing: ' + JSON.stringify({ take, raw })); assert.equal(take.frames, Math.floor(.25 * take.rate)); if (fallback) assert.equal(take.rawError, 0);
    await page.evaluate(() => tapeQA.set('track-1', { bypass: true })); await audioTime(page, .3); const bypass = await page.evaluate(() => tapeQA.signal()); assert(Math.abs(bypass.rms - raw.rms) < raw.rms * .04, 'Bypass restores unprocessed live monitoring');
    const transitions = await transitionChecks(page);
    const offline = await offlineChecks(page); for (const row of offline.results) { assert.equal(row.bytes, 44 + 36000 * 4); assert.equal(row.rate, 48000); assert(row.peak > 20 && row.error <= 1, 'Automated track/return/master WAV equals independent odd-block Core: ' + JSON.stringify(row)); assert.equal(row.leading, 0, 'Tape is causal before the authored clip'); } assert(offline.roundtrip);
    await page.evaluate(() => tapeQA.set('track-1', { model: 'home', wow: .5, flutter: .06, noise: .2, wear: .4 })); await audioTime(page, .3); await page.evaluate(() => tapeQA.engine.stop()); await audioTime(page, 2.7); const stopped = await page.evaluate(() => tapeQA.signal()); assert(stopped.finite && stopped.rms < .0001, 'Stop finishes the finite tape/noise release without stale playback'); await page.evaluate(async () => { await tapeQA.engine.setMicrophoneMonitoring('track-1', { enabled: true }); }); await audioTime(page, .25); assert((await page.evaluate(() => tapeQA.signal().rms)) > .001, 'Tape monitoring can resume after Stop'); await page.evaluate(() => tapeQA.engine.panic()); await audioTime(page, .25); const panic = await page.evaluate(() => tapeQA.signal()); assert(panic.rms < .0001, 'Panic clears an active tape/noise path');
    assert.deepEqual(errors, []); evidence[fallback ? 'fallback' : 'worklet'] = { raw, readings, take, transitions, offline, stopped, panic };
  } finally { await page.evaluate(async () => { const q = window.tapeQA; q?.sources?.forEach(source => { try { source.stop(); } catch {} }); await q?.engine?.dispose(); await window.LoomApp?.engine?.dispose(); }).catch(() => {}); await page.close(); }
}
async function params(page, id = 'track-3', slot = 0) { return page.evaluate(({ id, slot }) => LoomSchema.automationOwner(LoomApp.getState(), id).effects[slot]?.params, { id, slot }); }
async function selectOwner(page, id, slot = 0) { await page.evaluate(({ id, slot }) => LoomApp.selectEffect(slot, id), { id, slot }); assert.equal(await page.evaluate(() => LoomApp.selectedEffectOwner), id); }
async function openDetails(page) { for (const detail of await page.locator('[data-tape-details]').all()) if (!(await detail.evaluate(element => element.open))) await detail.locator('summary').press('Enter'); }
async function typeNumber(page, key, value) {
  const input = page.locator('#fx-number-' + key), scale = Number(await input.getAttribute('data-tape-scale') || 1), displayed = Number((value * scale).toFixed(6)); await input.focus(); await input.press('ControlOrMeta+A'); await input.pressSequentially(String(displayed)); assert.equal(Number(await input.inputValue()), displayed); assert(await input.evaluate(element => document.activeElement === element), key + ' numeric entry keeps focus'); await input.press('Tab');
}
async function liveUIMeters(page) {
    const meters = [];
    await page.evaluate(async () => { const q = tapeQA; q.engine = LoomApp.engine; await q.engine.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'live' }); await q.engine.init(); await q.engine.context.resume(); q.uiSource = q.engine.context.createOscillator(); const gain = q.engine.context.createGain(); q.uiSource.frequency.value = 137; gain.gain.value = .2; q.uiSource.connect(gain); gain.connect(q.engine.microphoneInput); q.uiSource.start(); q.engine._send({ type: 'microphoneMonitor', track: 2, enabled: true }); }); assert.equal(await page.evaluate(() => LoomApp.engine.mode), 'worklet');
    for (const id of ['track-3', 'master', 'return-1', 'return-2']) { if (id.startsWith('return-')) await page.evaluate(id => { const state = LoomApp.getState(); state.tracks[2].sends[Number(id.slice(-1)) - 1] = .7; LoomApp.engine.setState(state); }, id); await selectOwner(page, id); await page.waitForFunction(() => ['inputDb', 'tapeDb', 'outputDb'].every(key => { const output = document.querySelector('[data-tape-meter="' + key + '"]'); return output && !/^[—–]$|∞/.test(output.textContent.trim()); }), null, { timeout: 60000 }); meters.push({ id, values: await page.locator('[data-tape-meter]').evaluateAll(outputs => outputs.map(output => ({ key: output.dataset.tapeMeter, text: output.textContent }))) }); }
    await page.evaluate(() => tapeQA.uiSource.stop());
    return meters;
}
async function meterChecks(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message)); await context.route('**/*', route => { if (route.request().url() === url + '/loom/index.html') return route.continue(); requests.push(route.request().url()); return route.abort(); });
  try {
    await page.goto(url + '/loom/index.html'); await page.waitForFunction(() => window.LoomApp); await helpers(page);
    await page.evaluate(async () => { const q = tapeQA, state = q.blank(); state.selectedTrack = 2; for (const owner of [...state.tracks, ...state.returns, state.master]) owner.effects[0] = q.fx({ drive: 6, output: -3 }); await LoomApp.loadState(state); });
    evidence.uiMeters = await liveUIMeters(page); assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  } finally { await page.evaluate(() => window.LoomApp?.engine.dispose()).catch(() => {}); await context.close(); }
}
async function uiChecks(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true, reducedMotion: 'reduce', acceptDownloads: true }), page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message)); await context.route('**/*', route => { if (route.request().url() === url + '/loom/index.html') return route.continue(); requests.push(route.request().url()); return route.abort(); });
  try {
    await page.goto(url + '/loom/index.html'); await page.waitForFunction(() => window.LoomApp); await helpers(page);
    await page.evaluate(async () => { const q = tapeQA, state = q.blank(); state.selectedTrack = 2; state.tracks.forEach((owner, i) => owner.effects[0] = q.fx({ drive: 9, output: -(i + 1) / 10, warmth: .56, mix: .83 })); state.master.effects[0] = q.fx({ output: -4 }); state.returns[0].effects[0] = q.fx({ output: -5 }); state.returns[1].effects[0] = q.fx({ output: -6 }); await LoomApp.loadState(state); });
    await selectOwner(page, 'track-3'); const def = await page.evaluate(() => tapeQA.definition), defaults = def.defaults;
    assert.equal(await page.locator('[data-tape-knob]').count(), 5, 'Five clear primary rotary controls'); assert((await page.locator('[data-tape-details]').count()) >= 2); for (const detail of await page.locator('[data-tape-details]').all()) assert.equal(await detail.evaluate(element => element.open), false, 'Deep controls start folded');
    await page.locator('#effectReplace').click(); assert.equal(await page.locator('[data-add-effect="preserve"]').count(), 1); assert.match(await page.locator('[data-add-effect="preserve"]').textContent(), /PRESERVE/); await page.locator('#closeEffect').click();
    for (const descriptor of def.params.filter(param => param.type === 'select')) {
      for (const option of descriptor.options) { const before = await params(page); await openDetails(page); await page.locator('#fx-' + descriptor.key).selectOption(option.value); const after = await params(page); for (const [key, value] of Object.entries(before)) assert.equal(after[key], key === descriptor.key ? option.value : value, descriptor.key + ' changes preserve other settings'); }
    }
    await openDetails(page);
    for (const param of def.params.filter(param => param.type === 'range')) {
      const value = Number((param.min + Math.round((param.max - param.min) / param.step * .37) * param.step).toFixed(6));
      assert.equal(await page.locator('#fx-' + param.key).count(), 1, param.key + ' has one accessible control'); assert.equal(await page.locator('#fx-number-' + param.key).count(), 1, param.key + ' exact numeric value'); await typeNumber(page, param.key, value); assert(Math.abs((await params(page))[param.key] - value) <= Math.max(1, Math.abs(value)) * 1e-12, param.key + ' commits the typed value');
      for (const detail of await page.locator('[data-tape-details]').all()) assert(await detail.evaluate(element => element.open), 'Editing retains unfolded controls');
    }
    const knob = page.locator('#fx-drive'), beforeKey = await params(page); assert.equal(await knob.getAttribute('role'), 'slider'); await knob.focus(); await knob.press('ArrowRight'); assert((await params(page)).drive > beforeKey.drive); assert.equal(await page.evaluate(() => document.activeElement.id), 'fx-drive'); await page.locator('#undoButton').click(); assert.deepEqual(await params(page), beforeKey, 'A knob key press is one Undo');
    const beforeHomeEnd = await params(page), beforeBeat = await page.evaluate(() => LoomApp.engine.getMeters().beat); await knob.focus(); await knob.press('End'); assert.equal((await params(page)).drive, 24); assert.equal(await page.evaluate(() => LoomApp.engine.getMeters().beat), beforeBeat, 'Knob End does not seek the arrangement'); await knob.press('Home'); assert.equal((await params(page)).drive, 0); assert.equal(await page.evaluate(() => LoomApp.engine.getMeters().beat), beforeBeat, 'Knob Home does not seek the arrangement'); await page.locator('#undoButton').click(); await page.locator('#undoButton').click(); assert.deepEqual(await params(page), beforeHomeEnd); await knob.focus(); await knob.press('Space'); assert.equal((await params(page)).drive, defaults.drive); assert.equal(await page.evaluate(() => LoomApp.engine.getMeters().playing), false, 'Knob Space does not start transport'); if (beforeHomeEnd.drive !== defaults.drive) await page.locator('#undoButton').click();
    await knob.scrollIntoViewIfNeeded(); const bounds = await knob.boundingBox(), beforeDrag = await params(page); await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 - 45, { steps: 6 }); await page.mouse.up(); assert.notEqual((await params(page)).drive, beforeDrag.drive, 'Rotary drag changes the actual setting'); await page.locator('#undoButton').click(); assert.deepEqual(await params(page), beforeDrag, 'A whole rotary drag is one Undo');
    for (const recipe of def.presets) { await page.locator('#tapePreset').focus(); await page.locator('#tapePreset').selectOption(recipe.id); assert.deepEqual(await params(page), recipe.params, recipe.id + ' is a complete snapshot'); assert.equal(await page.evaluate(() => document.activeElement.id), 'tapePreset', 'Recipe choice preserves focus'); }
    const ids = [...Array.from({ length: 8 }, (_, i) => 'track-' + (i + 1)), 'master', 'return-1', 'return-2'];
    for (const id of ids) { await selectOwner(page, id); const baseline = await page.evaluate(() => LoomApp.getState()), selected = baseline.selectedTrack; await typeNumber(page, 'output', -7.7); assert.equal((await params(page, id)).output, -7.7); const actual = await page.evaluate(() => LoomApp.getState()); for (const other of ids) if (other !== id) { const find = state => other === 'master' ? state.master : other.startsWith('return-') ? state.returns[Number(other.slice(-1)) - 1] : state.tracks[Number(other.slice(-1)) - 1]; assert.deepEqual(find(actual).effects, find(baseline).effects, id + ' cannot edit ' + other); } if (!id.startsWith('track-')) assert.equal(actual.selectedTrack, selected); await page.locator('#undoButton').click(); }
    for (const id of ['track-3', 'master', 'return-1', 'return-2']) { await selectOwner(page, id); const original = await params(page, id); await page.locator('#effectBypass').click(); assert.equal((await params(page, id)).bypass, true); await page.locator('#undoButton').click(); assert.deepEqual(await params(page, id), original); await page.locator('#effectReset').click(); assert.deepEqual(await params(page, id), defaults); await page.locator('#undoButton').click(); assert.deepEqual(await params(page, id), original); }
    await selectOwner(page, 'master'); await page.locator('#loomAutoTarget').selectOption('fx:0:drive'); await page.locator('[data-auto-action="add"]').click(); const prior = await params(page, 'master'); await page.locator('#effectDown').click(); assert.deepEqual(await params(page, 'master', 1), prior); assert((await page.evaluate(() => LoomApp.getState().master.automation)).some(lane => lane.target === 'fx:1:drive')); await page.locator('#undoButton').click(); assert.deepEqual(await params(page, 'master'), prior); assert((await page.evaluate(() => LoomApp.getState().master.automation)).some(lane => lane.target === 'fx:0:drive'));
    for (const id of ['track-3', 'return-1', 'return-2']) { await selectOwner(page, id); await page.locator('#loomAutoTarget').selectOption('fx:0:wear'); await page.locator('[data-auto-action="add"]').click(); }
    const saved = await page.evaluate(() => LoomApp.getState()), pending = page.waitForEvent('download'); await page.locator('#saveButton').click(); const file = await pending, bytes = fs.readFileSync(await file.path()); assert.deepEqual(JSON.parse(bytes).state, saved, 'Downloaded project saves all tape racks and automation');
    await page.locator('#tapePreset').selectOption(def.presets[0].id); await page.locator('#projectFile').setInputFiles({ name: 'preserve.loom.json', mimeType: 'application/json', buffer: bytes }); await page.waitForFunction(expected => JSON.stringify(LoomApp.getState().master.effects) === JSON.stringify(expected), saved.master.effects);
    for (const id of ids) assert.deepEqual(await params(page, id), (id === 'master' ? saved.master : id.startsWith('return-') ? saved.returns[Number(id.slice(-1)) - 1] : saved.tracks[Number(id.slice(-1)) - 1]).effects[0].params);
    await page.waitForFunction(expected => { const recovered = JSON.parse(localStorage.getItem('loom-session-v1') || '{}'); return JSON.stringify(recovered.state?.master?.effects) === JSON.stringify(expected); }, saved.master.effects); await page.reload(); await page.waitForFunction(() => window.LoomApp); await helpers(page); assert.deepEqual(await page.evaluate(() => LoomApp.getState().master.effects), saved.master.effects); assert.deepEqual(await page.evaluate(() => LoomApp.getState().returns), saved.returns);
    await selectOwner(page, 'track-3');
    for (const width of [320, 390, 1440]) { await page.setViewportSize({ width, height: 1000 }); for (const detail of await page.locator('[data-tape-details]').all()) if (await detail.evaluate(element => element.open)) await detail.locator('summary').press('Enter'); await page.locator('#effectEditor').screenshot({ path: path.join(artifacts, 'preserve-essentials-' + width + '.png'), style: screenshotStyle }); await openDetails(page); const overflow = await page.locator('#effectEditor').evaluate(editor => [...editor.querySelectorAll('input,select,button,fieldset')].filter(element => { const box = element.getBoundingClientRect(); return box.width && (box.left < -1 || box.right > innerWidth + 1); }).map(element => element.id || element.className)); assert.deepEqual(overflow, [], 'Expanded tape controls fit ' + width + 'px'); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await page.locator('#effectEditor').screenshot({ path: path.join(artifacts, 'preserve-expanded-' + width + '.png'), style: screenshotStyle }); }
    const meters = [];
    if (process.env.LOOM_TAPE_QA_UI_STATIC !== '1') {
    meters.push(...await liveUIMeters(page));
    }
    assert.deepEqual(errors, []); assert.deepEqual(requests, []); evidence.ui = { owners: ids.length, parameters: def.params.length, presets: def.presets.length, meters, liveMetersDeferred: process.env.LOOM_TAPE_QA_UI_STATIC === '1', widths: [320, 390, 1440], built: Boolean(process.env.LOOM_TAPE_QA_BUILT) };
  } finally { await page.evaluate(() => window.LoomApp?.engine.dispose()).catch(() => {}); await context.close(); }
}
(async () => {
  fs.mkdirSync(artifacts, { recursive: true }); const server = await serve(), browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try { for (const phase of (process.env.LOOM_TAPE_QA_PHASES || 'dsp,worklet,fallback,ui').split(',')) { const began = Date.now(); if (phase === 'dsp') await dspChecks(browser, server.url); else if (phase === 'worklet' || phase === 'fallback') await engineChecks(browser, server.url, phase === 'fallback'); else if (phase === 'ui') await uiChecks(browser, server.url); else if (phase === 'meters') await meterChecks(browser, server.url); else throw Error('Unknown tape phase: ' + phase); passed.push({ phase, milliseconds: Date.now() - began }); fs.writeFileSync(path.join(artifacts, 'tape-evidence.json'), JSON.stringify({ passed, evidence }, null, 2)); fs.writeFileSync(path.join(artifacts, 'tape-' + phase + '-evidence.json'), JSON.stringify({ phase, milliseconds: Date.now() - began, evidence: evidence[phase === 'meters' ? 'uiMeters' : phase] }, null, 2)); console.log('PASS PRESERVE ' + phase); } console.log(JSON.stringify({ passed, artifacts })); }
  finally { await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
