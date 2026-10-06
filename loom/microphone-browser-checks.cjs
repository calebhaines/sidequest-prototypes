'use strict';

// Real Web Audio regression checks. A MediaStreamDestination supplies a known
// microphone signal, so these checks need neither physical hardware nor a mic.
// PLAYWRIGHT_MODULE / CHROMIUM_PATH can select a local browser installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const sharedRoot = fs.existsSync(path.join(__dirname, 'shared', 'pattern-schema.js')) ? path.join(__dirname, 'shared') : path.join(root, 'shared');
const playwrightPath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = require(playwrightPath);
const results = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function dspChecks() {
  const scope = { Blob, DOMException, TextEncoder, Math, Number, Map, Set, Promise, setTimeout, navigator: {} };
  scope.window = scope;
  vm.createContext(scope);
  for (const file of ['vocal-catalog.js', 'utility-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'effects.js', 'schema.js', 'audio-engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), scope, { filename: file });
  const DSP = scope.createLoomEngineDSP(scope.createLoomEffectsDSP), rate = 8000;
  const legacy = scope.LoomSchema.defaultState();
  delete legacy.recording.micCompensation; delete legacy.recording.micOffsetMs; delete legacy.recording.micInputGainDb;
  const restored = scope.LoomSchema.parseProject(JSON.stringify({ format: 'loom-project', formatVersion: 1, state: legacy }));
  assert.equal(restored.recording.micCompensation, 'auto'); assert.equal(restored.recording.micOffsetMs, 0); assert.equal(restored.recording.micInputGainDb, 0);
  for (const [key, value] of [['micCompensation', 'invalid'], ['micOffsetMs', null], ['micOffsetMs', 501], ['micInputGainDb', '6'], ['micInputGainDb', -25]]) {
    const damaged = JSON.parse(JSON.stringify(legacy)); damaged.recording[key] = value;
    assert.throws(() => scope.LoomSchema.parseProject(JSON.stringify({ format: 'loom-project', formatVersion: 1, state: damaged })), /microphone/i);
  }
  results.push('Legacy recording defaults / invalid microphone timing and trim reject atomically');
  const state = scope.LoomSchema.defaultState();
  state.tempo = 240; state.loopEnabled = false;
  function fixture(compensationFrames, schedule = {}) {
    const chunks = [], limits = [];
    const recorder = new DSP.Recorder(rate, chunk => chunks.push(chunk), info => limits.push(info));
    const core = new DSP.Core(state, {}, rate);
    let clock = 0;
    function feed(frames, useCore = false, signal = i => i / 20000) {
      for (let at = 0; at < frames;) {
        const size = Math.min(128, frames - at), mic = Float32Array.from({ length: size }, (_, i) => signal(clock + i));
        const native = Float32Array.from({ length: size }, () => -.75);
        const inputs = Array.from({ length: 9 }, () => []); inputs[0] = [native, native]; inputs[8] = [mic];
        if (useCore) core.processBlock(new Float32Array(size), new Float32Array(size), inputs);
        recorder.capture(inputs, size, useCore ? core : undefined); clock += size; at += size;
      }
    }
    function start(maxFrames = 800, startBeat = 2) {
      const full = { ...schedule, microphone: { inputIndex: 8, compensationFrames } };
      core.seek(startBeat); core.beginRecording(full); recorder.start(1, [0], startBeat, maxFrames, full);
    }
    function samples() { return Float32Array.from(chunks.flatMap(c => Array.from(c.left))); }
    return { recorder, core, chunks, limits, feed, start, samples, get clock() { return clock; } };
  }
  for (const compensation of [-80, 0, 80]) {
    const f = fixture(compensation); f.feed(1600); f.start(); f.feed(1000); f.recorder.stop();
    const captured = f.samples();
    assert.equal(captured.length, 800, 'Compensation preserves the intended frame budget.');
    for (let i = 0; i < captured.length; i++) assert(Math.abs(captured[i] - (1600 + compensation + i) / 20000) < 1e-7, 'Compensated source frame ' + i + ' is incorrect for ' + compensation + ' frames.');
    assert(f.chunks.every(c => c.trackIndex === 0 && c.startBeat === 2));
    assert(captured[0] > 0, 'The native track input must not enter the mic take.');
    results.push('Exact ' + compensation + '-frame microphone compensation / isolated dry bus');
  }
  for (const compensation of [-80, 80]) {
    const f = fixture(compensation, { countInBeats: 4, punchEnabled: true, punchStart: .5, punchEnd: 1, requireTransport: true });
    f.feed(1600); f.start(4000, 0);
    const first = 1600 + 8000 + 1000 + compensation, last = first + 999;
    f.feed(10300, true, i => i === first || i === last ? .8 : 0);
    const captured = f.samples();
    assert.equal(captured.length, 1000, 'Count-in and punch boundaries retain exactly the intended duration.');
    assert(Math.abs(captured[0] - .8) < 1e-7 && Math.abs(captured.at(-1) - .8) < 1e-7, 'First and final punch attacks survive compensation and post-roll.');
    assert(f.chunks.every(c => Math.abs(c.startBeat - .5) < 1e-8));
    assert(f.limits.some(info => info.reason === 'punch'));
    results.push('Count-in / exact punch / last transient with ' + compensation + '-frame offset');
  }
  {
    const f = fixture(80); f.start(4000, 0); f.feed(400);
    const stopped = f.recorder.stop(37); assert.equal(stopped.pending, true, 'Manual finish retains delayed mic post-roll.');
    f.feed(100); const captured = f.samples(); assert.equal(captured.length, 400);
    for (let i = 0; i < captured.length; i++) assert(Math.abs(captured[i] - (80 + i) / 20000) < 1e-7);
    assert(f.limits.some(info => info.stopId === 37 && info.reason === 'stop'));
    results.push('Manual finish waits for positive compensation post-roll without extending the clip');
  }
  {
    const f = fixture(-80); f.start(160, 0); f.feed(400); const captured = f.samples();
    assert.equal(captured.length, 160); assert(captured.subarray(0, 80).every(v => v === 0), 'Start-of-session negative offset pads unavailable history.');
    assert(Math.abs(captured[100] - 20 / 20000) < 1e-7);
    results.push('Start-of-session negative compensation is bounded and preserves valid audio');
  }
}

async function serve() {
  const instance = http.createServer((request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname;
    if (name === '/engine.html') {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<!doctype html><html><body><script src="/shared/pattern-schema.js"></script>' + ['vocal-catalog.js', 'utility-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'effects.js', 'schema.js', 'audio-engine.js'].map(file => '<script src="/loom/' + file + '"></script>').join('') + '</body></html>');
      return;
    }
    // Both the repository and the extracted source archive expose identical
    // virtual URLs. The archive keeps shared sources next to its native files.
    const base = name.startsWith('/loom/') ? __dirname : name.startsWith('/shared/') ? sharedRoot : root;
    const relative = name.startsWith('/loom/') ? name.slice(5) : name.startsWith('/shared/') ? name.slice(7) : name;
    const file = path.resolve(base, '.' + relative + (name.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(base + path.sep)) { response.writeHead(403); response.end(); return; }
    fs.readFile(file, (error, contents) => {
      if (error) { response.writeHead(404); response.end(); return; }
      response.writeHead(200, { 'Content-Type': path.extname(file) === '.html' ? 'text/html' : path.extname(file) === '.css' ? 'text/css' : 'application/javascript', 'Cache-Control': 'no-store' }); response.end(contents);
    });
  });
  await new Promise((resolve, reject) => { instance.once('error', reject); instance.listen(0, '127.0.0.1', () => { instance.removeListener('error', reject); resolve(); }); });
  return { url: 'http://127.0.0.1:' + instance.address().port, close: () => new Promise(resolve => instance.close(resolve)) };
}

async function installMicrophone(page, ui = false, fallback = false) {
  await page.evaluate(async ({ ui, fallback }) => {
    if (fallback) window.AudioWorkletNode = undefined;
    const state = window.LoomSchema.defaultState(); state.tempo = 240; state.master.level = 1; state.loopEnabled = false;
    state.recording.micCompensation = 'off'; state.tracks.forEach(t => { t.level = 1; t.instrumentLive = false; });
    if (ui) await window.LoomApp.loadState(state);
    const engine = ui ? window.LoomApp.engine : new window.LoomAudio(state);
    if (!ui) window.qaEngine = engine;
    await engine.init(); await engine.context.resume();
    window.qaMic = { requests: 0, streams: [], sources: [], pending: false, resolve: null };
    window.qaMic.makeStream = () => {
      const destination = engine.context.createMediaStreamDestination(), source = engine.context.createOscillator(), gain = engine.context.createGain();
      source.frequency.value = 137; gain.gain.value = .18; source.connect(gain); gain.connect(destination); source.start();
      const stream = destination.stream, track = stream.getAudioTracks()[0];
      const settings = track.getSettings.bind(track); track.getSettings = () => ({ ...settings(), latency: .012 });
      window.qaMic.streams.push(stream); window.qaMic.sources.push(source); return stream;
    };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async constraints => {
      window.qaMic.requests++; window.qaMic.constraints = constraints;
      if (window.qaMic.pending) return new Promise(resolve => { window.qaMic.resolve = () => resolve(window.qaMic.makeStream()); });
      return window.qaMic.makeStream();
    } });
    const analyser = engine.context.createAnalyser(); analyser.fftSize = 8192; analyser.smoothingTimeConstant = 0; engine.node.connect(analyser); window.qaAnalyser = analyser;
    window.qaRms = () => { const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples); return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length); };
    window.qaHarmonics = () => {
      const data = new Float32Array(analyser.frequencyBinCount); analyser.getFloatFrequencyData(data);
      const amplitude = frequency => { const bin = Math.round(frequency * analyser.fftSize / engine.context.sampleRate); return 10 ** (Math.max(...data.slice(Math.max(0, bin - 3), bin + 4)) / 20); };
      return { fundamental: amplitude(137), third: amplitude(411), rms: window.qaRms() };
    };
    window.qaStats = audio => {
      let square = 0, peak = 0, bad = 0; for (const v of audio) { square += v * v; peak = Math.max(peak, Math.abs(v)); if (!Number.isFinite(v)) bad++; }
      return { rms: Math.sqrt(square / Math.max(1, audio.length)), peak, bad, frames: audio.length };
    };
    window.qaMagnitude = (audio, frequency, rate) => {
      let real = 0, imag = 0; for (let i = 0; i < audio.length; i++) { real += audio[i] * Math.cos(2 * Math.PI * frequency * i / rate); imag += audio[i] * Math.sin(2 * Math.PI * frequency * i / rate); }
      return 2 * Math.hypot(real, imag) / audio.length;
    };
  }, { ui, fallback });
}

async function engineChecks(browser, url, fallback) {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(12000);
  await page.goto(url + '/engine.html'); await installMicrophone(page, false, fallback);
  try {
    await page.evaluate(() => window.qaEngine.setMicrophoneMonitoring('track-1', { enabled: true })); await wait(350);
    const dry = await page.evaluate(() => ({ rms: window.qaRms(), status: window.qaEngine.getMicrophoneStatus(), playing: window.qaEngine.getMeters().playing, mode: window.qaEngine.mode }));
    assert(dry.rms > .04, 'Stopped-transport microphone monitor must be audible.'); assert.equal(dry.playing, false);
    assert.equal(dry.status.trackId, 'track-1'); assert.equal(dry.status.enabled, true); assert(dry.status.inputPeak > .05);
    assert.equal(dry.mode, fallback ? 'fallback' : 'worklet');
    await page.evaluate(() => {
      const state = window.qaEngine.state, defaults = window.LoomEffectsCatalog.find(e => e.id === 'prism').defaults;
      state.tracks[0].effects[0] = window.LoomSchema.effect({ type: 'prism', params: { ...defaults, filter: 'highpass', cutoff: 7000 } }); window.qaEngine.setState(state);
    }); await wait(400);
    const wet = await page.evaluate(() => window.qaRms()); assert(wet < dry.rms * .03, 'The live mic uses current track effects even while stopped.');
    await page.evaluate(() => { window.qaEngine.state.tracks[0].effects[0].params.bypass = true; window.qaEngine.setState(window.qaEngine.state); }); await wait(350);
    const bypass = await page.evaluate(() => window.qaRms()); assert(bypass > dry.rms * .8, 'Effect bypass updates the monitored input.');
    results.push((fallback ? 'Fallback' : 'Worklet') + ' real mic monitoring / stopped transport / live FX changes / bypass');

    await page.evaluate(async () => {
      const engine = window.qaEngine; engine.state.tracks[0].effects[0].params.bypass = false; engine.state.recording.micInputGainDb = 6; engine.setState(engine.state);
      const native = engine.context.createOscillator(), gain = engine.context.createGain(); native.frequency.value = 1003; gain.gain.value = .3; native.connect(gain); gain.connect(engine.getTrackInput('track-1')); native.start(); window.qaNative = native;
      await engine.startMicrophoneRecording('track-1', { maxSeconds: .35, startTransport: false });
    });
    await page.waitForFunction(() => !window.qaEngine.isRecording, null, { timeout: 6000 });
    const take = await page.evaluate(async () => {
      const engine = window.qaEngine, takes = await engine.stopRecording(); window.qaNative.stop();
      const audio = takes[0]; if (!audio) return { error: 'No microphone take' }; window.qaTake = audio;
      return { ...window.qaStats(audio.left), sampleRate: audio.sampleRate, mic: window.qaMagnitude(audio.left, 137, audio.sampleRate), native: window.qaMagnitude(audio.left, 1003, audio.sampleRate), stereoError: Math.max(...audio.left.slice(0, 10000).map((v, i) => Math.abs(v - audio.right[i]))), requests: window.qaMic.requests, status: engine.getMicrophoneStatus(), microphone: audio.microphone };
    });
    // ScriptProcessor and MediaStream use independently buffered clocks. Peak
    // and RMS verify the exact trim without assuming a constant phase across
    // capture blocks; coherent projections still detect native contamination.
    assert(!take.error, take.error); assert.equal(take.bad, 0); assert(take.peak > .35 && take.peak < .37 && take.rms > .21 && take.rms < .27, 'Input trim is applied once to the dry take: ' + JSON.stringify(take)); assert(take.native < .005, 'Hosted instruments cannot contaminate the raw mic take.'); assert.equal(take.stereoError, 0);
    assert.equal(take.frames, Math.floor(.35 * take.sampleRate), 'The maximum take duration bounds compensated raw microphone PCM.');
    assert.equal(take.requests, 1, 'Recording reuses the monitored microphone stream.'); assert.equal(take.status.enabled, true, 'Finishing a take retains an opted-in monitor.'); assert.equal(take.microphone, true);
    results.push((fallback ? 'Fallback' : 'Worklet') + ' dry microphone recording / one trim / native input isolation / monitor stream reuse');
    const latency = await page.evaluate(() => { const e = window.qaEngine; e.state.recording.micCompensation = 'manual'; e.state.recording.micOffsetMs = 123.5; e.setState(e.state); return e.getMicrophoneLatency(); });
    assert(Math.abs(latency.compensationMs - 123.5) < .01);
    const automatic = await page.evaluate(() => { const e = window.qaEngine; e.state.recording.micCompensation = 'auto'; e.state.recording.micOffsetMs = 0; e.setState(e.state); return e.getMicrophoneLatency(); });
    assert(Number.isFinite(automatic.compensationMs) && automatic.compensationMs > 0 && automatic.compensationMs <= 1000); assert.equal(automatic.reportedInput, true); assert(Math.abs(automatic.inputMs - 12) < .01);
    assert(Math.abs(automatic.compensationMs - automatic.inputMs - automatic.outputMs) < .01, 'Auto uses the input and one output estimate, without additionally subtracting an engine block.');
    assert(automatic.processingMs > 0); assert(['timestamp', 'reported', 'unreported'].includes(automatic.outputSource));
    assert.equal(automatic.estimateComplete, automatic.reportedInput && automatic.outputComplete);
    const estimates = await page.evaluate(({ fallback }) => {
      // Browser-clock fixture: timestamp, reports and processing block are
      // deliberately different so double-counting is observable.
      const e = new window.LoomAudio(window.LoomSchema.defaultState());
      e.mode = fallback ? 'fallback' : 'worklet'; e._processingFrames = fallback ? 1024 : 128;
      e.state.recording.micOffsetMs = 5;
      e._mic = { stream: { getAudioTracks: () => [{ getSettings: () => ({ latency: .012 }) }] } };
      const c = { state: 'running', currentTime: 10, sampleRate: 48000, baseLatency: .007, outputLatency: .023, getOutputTimestamp: () => ({ contextTime: 9.91, performanceTime: performance.now() - 10 }) };
      e.context = c;
      const timestamp = e.getMicrophoneLatency();
      c.getOutputTimestamp = () => ({ contextTime: 0, performanceTime: 0 });
      const uninitialized = e.getMicrophoneLatency();
      c.getOutputTimestamp = () => ({ contextTime: 9.99, performanceTime: performance.now() - 1000 });
      const stale = e.getMicrophoneLatency();
      c.getOutputTimestamp = () => ({ contextTime: 9.99, performanceTime: performance.now() + 100 });
      const future = e.getMicrophoneLatency();
      c.getOutputTimestamp = () => ({ contextTime: 1, performanceTime: performance.now() });
      const backwards = e.getMicrophoneLatency();
      c.outputLatency = undefined;
      const partial = e.getMicrophoneLatency();
      c.baseLatency = undefined;
      const unreported = e.getMicrophoneLatency();
      c.state = 'suspended'; c.getOutputTimestamp = () => ({ contextTime: 9.91, performanceTime: performance.now() - 10 });
      const suspended = e.getMicrophoneLatency();
      return { timestamp, uninitialized, stale, future, backwards, partial, unreported, suspended };
    }, { fallback });
    assert.equal(estimates.timestamp.outputSource, 'timestamp'); assert.equal(estimates.timestamp.outputComplete, true); assert.equal(estimates.timestamp.estimateComplete, true);
    assert(Math.abs(estimates.timestamp.outputMs - 80) < .5 && Math.abs(estimates.timestamp.compensationMs - 97) < .5, 'A physical-clock output estimate replaces both output reports, and does not add the processing block.');
    for (const key of ['uninitialized', 'stale', 'future', 'backwards']) {
      assert.equal(estimates[key].outputSource, 'reported', key + ' output timestamp must fall back to the device reports.');
      assert(Math.abs(estimates[key].outputMs - 30) < 1e-8 && Math.abs(estimates[key].compensationMs - 47) < 1e-8);
    }
    assert.equal(estimates.partial.outputComplete, false); assert.equal(estimates.partial.estimateComplete, false); assert.equal(estimates.partial.outputSource, 'reported'); assert.equal(estimates.partial.compensationMs, 24);
    for (const key of ['unreported', 'suspended']) {
      assert.equal(estimates[key].outputSource, 'unreported'); assert.equal(estimates[key].outputMs, 0); assert.equal(estimates[key].compensationMs, 17); assert.equal(estimates[key].estimateComplete, false);
    }
    results.push((fallback ? 'Fallback' : 'Worklet') + ' input + one output estimate / no engine-block double count / timestamp freshness / partial-report diagnostics');

    await page.evaluate(async () => { const e = window.qaEngine; e.state.recording.micCompensation = 'manual'; e.state.recording.micOffsetMs = 80; e.setState(e.state); await e.startMicrophoneRecording('track-1', { startTransport: false, maxSeconds: 2 }); });
    const frozen = await page.evaluate(() => { const e = window.qaEngine; const before = e.getMicrophoneStatus().latency; e.state.recording.micOffsetMs = -40; e.setState(e.state); return { before, applied: e.getMicrophoneStatus().latency, next: e.getMicrophoneLatency() }; });
    assert.equal(frozen.before.compensationMs, 80); assert.equal(frozen.applied.compensationMs, 80); assert.equal(frozen.next.compensationMs, -40, 'Changing timing prepares the next take; an active take keeps its start-time correction.');
    assert.equal(frozen.applied.compensationFrames, Math.round(80 * dry.status.interface.sampleRate / 1000));
    await wait(250);
    const finish = await page.evaluate(async () => { const at = performance.now(), e = window.qaEngine, takes = await e.stopRecording(); return { elapsed: performance.now() - at, duration: takes[0]?.frames / takes[0]?.sampleRate, bad: takes[0] ? window.qaStats(takes[0].left).bad : 1, compensationMs: takes[0]?.compensationMs, status: e.getMicrophoneStatus() }; });
    assert(finish.elapsed >= 45 && finish.elapsed < 1500, 'Real manual finish waits for delayed input before releasing its source.');
    assert(finish.duration > .15 && finish.duration < .4, 'Post-roll does not extend the intended take length.'); assert.equal(finish.bad, 0); assert.equal(finish.compensationMs, 80); assert.equal(finish.status.enabled, true);
    results.push((fallback ? 'Fallback' : 'Worklet') + ' real manual finish / retained 80 ms post-roll / unchanged musical duration');
    await page.evaluate(() => window.qaEngine.startMicrophoneRecording('track-1', { startTransport: false, maxSeconds: .12 }));
    await page.waitForFunction(() => !window.qaEngine.isRecording, null, { timeout: 6000 });
    const nextTake = await page.evaluate(async () => { const e = window.qaEngine, takes = await e.stopRecording(); return { compensationMs: takes[0]?.compensationMs, mode: takes[0]?.compensationMode, sampleRate: takes[0]?.sampleRate, ...(takes[0] ? window.qaStats(takes[0].left) : {}) }; });
    assert.equal(nextTake.compensationMs, -40); assert.equal(nextTake.mode, 'manual'); assert.equal(nextTake.frames, Math.floor(.12 * nextTake.sampleRate)); assert.equal(nextTake.bad, 0); assert(nextTake.rms > .15);
    results.push((fallback ? 'Fallback' : 'Worklet') + ' per-take timing frozen at record start / negative correction applies to the next real take');

    await page.evaluate(() => {
      const e = window.qaEngine, definition = window.LoomEffectsCatalog.find(fx => fx.id === 'broiler');
      e.state.tracks[0].effects[0] = window.LoomSchema.effect({ type: 'broiler', params: { ...definition.defaults, model: 'valve-stack', drive: 24, cleanLow: 0, cabinet: 'di', output: -12, master: .65 } }); e.setState(e.state);
    }); await wait(450);
    const liveAmp = await page.evaluate(() => window.qaHarmonics());
    await page.evaluate(() => { const e = window.qaEngine; e.state.tracks[0].effects[0].params.bypass = true; e.setState(e.state); }); await wait(350);
    const directAmp = await page.evaluate(() => window.qaHarmonics());
    assert(liveAmp.rms > .005 && liveAmp.rms < 1 && Number.isFinite(liveAmp.rms));
    assert(liveAmp.third > directAmp.third * 8 && liveAmp.third / Math.max(1e-9, liveAmp.fundamental) > .025, 'The real monitored BROILER generates amp harmonics: ' + JSON.stringify({ liveAmp, directAmp }));
    await page.evaluate(() => { const e = window.qaEngine; e.state.tracks[0].effects[0].params.bypass = false; e.setState(e.state); });
    const rendered = await page.evaluate(async () => {
      const e = window.qaEngine, S = window.LoomSchema, take = window.qaTake, state = S.copy(e.state), asset = S.encodeAsset({ ...take, name: 'Dry mic' });
      state.assets = [asset]; state.tracks.forEach(track => { track.clips = []; });
      const audio = S.decodeAsset(asset), assets = new Map([[asset.id, audio]]), length = take.frames / take.sampleRate * state.tempo / 60;
      state.tracks[0].clips = [{ assetId: asset.id, start: 0, length, sourceStart: 0, sourceEnd: asset.duration, sourceOffset: 0, rate: 1, reverse: false, loop: false, gain: 1, fadeIn: 0, fadeOut: 0 }];
      const blobs = await Promise.all([e.renderWav(state, assets, { endBeat: length, tailSeconds: 0 }), e.renderWav(state, assets, { endBeat: length, tailSeconds: 0, trackId: 'track-1' })]);
      const views = await Promise.all(blobs.map(async blob => new DataView(await blob.arrayBuffer())));
      const DSP = window.createLoomEngineDSP(window.createLoomEffectsDSP), core = new DSP.Core(state, assets, 48000, { linear: true }); core.start(0);
      const frames = Math.round(length * 60 / state.tempo * 48000), left = new Float32Array(frames), right = new Float32Array(frames);
      for (let at = 0; at < frames; at += 128) core.processBlock(left.subarray(at, Math.min(frames, at + 128)), right.subarray(at, Math.min(frames, at + 128)));
      let difference = 0, stereoDifference = 0, bad = 0;
      for (let i = 0; i < frames; i++) for (let c = 0; c < 2; c++) {
        const value = c ? right[i] : left[i], expected = Math.round(Math.max(-1, Math.min(1, value)) * (value < 0 ? 32768 : 32767)), actual = views[0].getInt16(44 + i * 4 + c * 2, true);
        if (!Number.isFinite(value)) bad++; difference = Math.max(difference, Math.abs(expected - actual)); stereoDifference = Math.max(stereoDifference, Math.abs(actual - views[1].getInt16(44 + i * 4 + c * 2, true)));
      }
      return { frames, bytes: views.map(v => v.byteLength), channels: views.map(v => v.getUint16(22, true)), rate: views.map(v => v.getUint32(24, true)), difference, stereoDifference, bad, ...window.qaStats(left) };
    });
    assert.equal(rendered.bad, 0); assert(rendered.rms > .005 && rendered.peak <= .981); assert(rendered.channels.every(c => c === 2) && rendered.rate.every(r => r === 48000)); assert(rendered.bytes.every(n => n === 44 + rendered.frames * 4)); assert(rendered.difference <= 1, 'BROILER WAV matches the real Core at a different block size.'); assert.equal(rendered.stereoDifference, 0, 'A one-track BROILER mix and selected stem have identical PCM.');
    results.push((fallback ? 'Fallback' : 'Worklet') + ' real BROILER mic harmonics / dry-take mix and stem / Core-to-WAV PCM correspondence');

    await page.evaluate(() => window.qaEngine.setMicrophoneMonitoring('track-1', { enabled: false })); await wait(120);
    const off = await page.evaluate(() => ({ status: window.qaEngine.getMicrophoneStatus(), tracks: window.qaMic.streams.flatMap(s => s.getTracks().map(t => t.readyState)) }));
    assert.equal(off.status.active, false); assert(off.tracks.every(s => s === 'ended'), 'Turning monitoring off releases the mic hardware.');
    await page.evaluate(() => { window.qaMic.pending = true; window.qaPending = window.qaEngine.setMicrophoneMonitoring('track-1', { enabled: true }); });
    await page.waitForFunction(() => !!window.qaMic.resolve);
    const unlocked = await page.evaluate(() => { window.qaOldPermission = window.qaMic.resolve; window.qaOldPending = window.qaPending; window.qaEngine.panic(); return { busy: window.qaEngine.recordingBusy, pending: window.qaEngine.getMicrophoneStatus().pending }; });
    assert.equal(unlocked.busy, false, 'Panic unlocks transport before a dismissed permission request resolves.'); assert.equal(unlocked.pending, false);
    await page.evaluate(() => { window.qaMic.resolve = null; window.qaPending = window.qaEngine.setMicrophoneMonitoring('track-1', { enabled: true }); });
    await page.waitForFunction(() => !!window.qaMic.resolve);
    const stale = await page.evaluate(async () => { window.qaOldPermission(); await window.qaOldPending; return window.qaEngine.getMicrophoneStatus(); });
    assert.equal(stale.pending, true, 'An old permission completion cannot clear the newer request.'); assert.equal(stale.active, false);
    await page.evaluate(async () => { window.qaMic.resolve(); await window.qaPending; });
    assert.equal(await page.evaluate(() => window.qaEngine.getMicrophoneStatus().enabled), true, 'A fresh permission request can complete after Panic.');
    await page.evaluate(() => window.qaEngine.setMicrophoneMonitoring('track-1', { enabled: false }));
    const pending = await page.evaluate(async () => { await window.qaPending; return { status: window.qaEngine.getMicrophoneStatus(), tracks: window.qaMic.streams.flatMap(s => s.getTracks().map(t => t.readyState)) }; });
    assert.equal(pending.status.active, false); assert.equal(pending.status.enabled, false); assert(pending.tracks.every(s => s === 'ended'));
    results.push((fallback ? 'Fallback' : 'Worklet') + ' monitor-off hardware release / late permission after Panic cannot reconnect');
    await page.evaluate(() => { window.qaMic.pending = true; window.qaMic.resolve = null; window.qaPending = window.qaEngine.startMicrophoneRecording('track-1', { startTransport: false }); });
    await page.waitForFunction(() => !!window.qaMic.resolve);
    const unlockedRecord = await page.evaluate(() => { window.qaEngine.cancelRecording(); return { busy: window.qaEngine.recordingBusy, pending: window.qaEngine.getMicrophoneStatus().pending }; });
    assert.equal(unlockedRecord.busy, false, 'Cancel unlocks transport while the old microphone prompt is still pending.'); assert.equal(unlockedRecord.pending, false);
    await page.evaluate(() => window.qaMic.resolve());
    const canceled = await page.evaluate(async () => { await window.qaPending; return { status: window.qaEngine.getMicrophoneStatus(), recording: window.qaEngine.isRecording, tracks: window.qaMic.streams.flatMap(s => s.getTracks().map(t => t.readyState)) }; });
    assert.equal(canceled.recording, false); assert.equal(canceled.status.active, false); assert(canceled.tracks.every(s => s === 'ended'));
    results.push((fallback ? 'Fallback' : 'Worklet') + ' cancel during delayed microphone permission cannot begin a take');
    await page.evaluate(async () => { window.qaMic.pending = false; await window.qaEngine.setMicrophoneMonitoring('track-1', { enabled: true }); window.qaMic.streams.at(-1).getAudioTracks()[0].dispatchEvent(new Event('ended')); });
    await page.waitForFunction(() => !window.qaEngine.getMicrophoneStatus().active);
    const disconnected = await page.evaluate(() => window.qaMic.streams.flatMap(s => s.getTracks().map(t => t.readyState))); assert(disconnected.every(s => s === 'ended'));
    results.push((fallback ? 'Fallback' : 'Worklet') + ' hardware disconnect releases the live input');
    assert.deepEqual(errors, [], 'Real mic engine tests have no runtime errors.');
  } finally { await page.evaluate(() => window.qaEngine?.dispose()); await page.close(); }
  console.log((fallback ? 'Fallback' : 'Worklet') + ' microphone browser checks passed.');
}

async function uiChecks(browser, url) {
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } }); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(url + '/loom/index.html'); await page.waitForFunction(() => !!window.LoomApp);
    await installMicrophone(page, true); await page.selectOption('#recordSource', 'microphone');
    assert(await page.locator('#micInputPanel').evaluate(el => el.open), 'Selecting microphone exposes input controls.');
    await page.evaluate(() => {
      const pcm = new Float32Array(1920); pcm[127] = .25; pcm[128] = -.25;
      window.LoomApp.importAudio({ pcm, sampleRate: 48000, name: 'Existing guitar take' });
      const state = window.LoomSchema.parseProject(window.LoomSchema.serializeProject(window.LoomApp.getState())); window.qaExistingTake = JSON.stringify({ clips: state.tracks[0].clips, assets: state.assets });
    });
    await page.locator('#microphoneCompensation').selectOption('manual'); await page.locator('#microphoneOffset').fill('75'); await page.locator('#microphoneOffset').dispatchEvent('change');
    const settings = await page.evaluate(() => window.LoomApp.getState().recording); assert.equal(settings.micCompensation, 'manual'); assert.equal(settings.micOffsetMs, 75);
    await page.locator('#microphoneLaterButton').click();
    assert.equal(await page.evaluate(() => window.LoomApp.getState().recording.micOffsetMs), 70, 'Take too early decreases compensation so new audio is placed later.');
    await page.locator('#undoButton').click(); assert.equal(await page.evaluate(() => window.LoomApp.getState().recording.micOffsetMs), 75);
    await page.locator('#redoButton').click(); assert.equal(await page.evaluate(() => window.LoomApp.getState().recording.micOffsetMs), 70);
    await page.locator('#microphoneEarlierButton').click(); assert.equal(await page.evaluate(() => window.LoomApp.getState().recording.micOffsetMs), 75);
    await page.locator('#microphoneLaterButton').click({ modifiers: ['Shift'] }); assert.equal(await page.evaluate(() => window.LoomApp.getState().recording.micOffsetMs), 74);
    await page.locator('#microphoneEarlierButton').click({ modifiers: ['Shift'] }); assert.equal(await page.evaluate(() => window.LoomApp.getState().recording.micOffsetMs), 75);
    for (const [start, button, end] of [[499, 'microphoneEarlierButton', 500], [-499, 'microphoneLaterButton', -500]]) {
      await page.locator('#microphoneOffset').fill(String(start)); await page.locator('#microphoneOffset').dispatchEvent('change'); await page.locator('#' + button).click();
      assert.equal(await page.evaluate(() => window.LoomApp.getState().recording.micOffsetMs), end); assert(await page.locator('#' + button).isDisabled(), 'Nudges stop at the persisted ±500 ms boundary.');
      await page.locator('#' + button).dispatchEvent('click'); assert.equal(await page.evaluate(() => window.LoomApp.getState().recording.micOffsetMs), end);
    }
    await page.locator('#microphoneOffset').fill('0'); await page.locator('#microphoneOffset').dispatchEvent('change'); await page.locator('#microphoneLaterButton').click();
    const negative = await page.evaluate(() => window.LoomSchema.parseProject(window.LoomSchema.serializeProject(window.LoomApp.getState())).recording);
    assert.equal(negative.micCompensation, 'manual'); assert.equal(negative.micOffsetMs, -5, 'The saved project preserves a negative, later-take correction.');
    await page.locator('#microphoneCompensation').selectOption('off');
    assert(await page.locator('#microphoneLaterButton').isDisabled() && await page.locator('#microphoneEarlierButton').isDisabled());
    await page.locator('#microphoneLaterButton').dispatchEvent('click'); await page.locator('#microphoneEarlierButton').dispatchEvent('click');
    assert.equal(await page.evaluate(() => window.LoomApp.getState().recording.micOffsetMs), -5, 'Off stays off and cannot be nudged by a synthetic button event.');
    await page.locator('#microphoneCompensation').selectOption('auto'); await page.locator('#microphoneLaterButton').click();
    const trimmed = await page.evaluate(() => window.LoomSchema.parseProject(window.LoomSchema.serializeProject(window.LoomApp.getState())).recording);
    assert.equal(trimmed.micCompensation, 'auto'); assert.equal(trimmed.micOffsetMs, -10, 'Auto saves a signed extra trim separately from its current device estimate.');
    assert.equal(await page.evaluate(() => { const state = window.LoomSchema.parseProject(window.LoomSchema.serializeProject(window.LoomApp.getState())); return JSON.stringify({ clips: state.tracks[0].clips, assets: state.assets }) === window.qaExistingTake; }), true, 'Timing changes leave existing clip positions and source PCM intact.');
    await page.locator('#microphoneCompensation').selectOption('manual'); await page.locator('#microphoneOffset').fill('75'); await page.locator('#microphoneOffset').dispatchEvent('change');
    assert.match(await page.locator('#microphoneCorrectionLabel').textContent(), /new takes/i);
    results.push(width + 'px later/earlier signed nudges / Shift fine trim / Undo and Redo / ±500 ms bounds / Off guards / negative project offsets / existing takes preserved');
    await page.locator('#microphoneMonitorButton').click(); await page.waitForFunction(() => window.LoomApp.engine.getMicrophoneStatus().enabled);
    if (width === 390) {
      assert.match(await page.locator('#microphoneLatencyDetails').textContent(), /engine block \(not added\)/);
      await page.evaluate(() => window.LoomApp.engine.startMicrophoneRecording('track-1', { startTransport: false, maxSeconds: 2 }));
      await page.waitForFunction(() => document.getElementById('microphoneLaterButton').disabled && document.getElementById('microphoneEarlierButton').disabled);
      assert.match(await page.locator('#microphoneCorrectionLabel').textContent(), /applied to this take/i);
      await page.locator('#microphoneLaterButton').dispatchEvent('click'); await page.locator('#microphoneEarlierButton').dispatchEvent('click');
      const locked = await page.evaluate(() => ({ offset: window.LoomApp.getState().recording.micOffsetMs, applied: window.LoomApp.engine.getMicrophoneStatus().latency.compensationMs }));
      assert.deepEqual(locked, { offset: 75, applied: 75 }, 'The UI guards timing edits throughout an active take.');
      await page.evaluate(() => window.LoomApp.engine.stopRecording());
      await page.waitForFunction(() => !document.getElementById('microphoneLaterButton').disabled && !document.getElementById('microphoneEarlierButton').disabled);
      assert.match(await page.locator('#microphoneCorrectionLabel').textContent(), /new takes/i);
      results.push('390px real microphone take / disabled alignment edits / applied-take readout / controls restored after finishing');
    }
    await page.evaluate(() => window.LoomApp.selectTrack(1));
    assert.equal(await page.evaluate(() => window.LoomApp.engine.getMicrophoneStatus().trackId), 'track-1', 'Track selection must not silently reroute a live mic.');
    await page.locator('#microphoneRouteButton').click(); await page.waitForFunction(() => window.LoomApp.engine.getMicrophoneStatus().trackId === 'track-2');
    assert(await page.locator('#microphoneRouteLabel').textContent());
    const layout = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth, tracks: window.LoomApp.getState().tracks.length, slots: window.LoomApp.getState().tracks.map(t => t.effects.length), effects: window.LoomEffectsCatalog.length, targets: ['microphoneMonitorButton', 'microphoneLaterButton', 'microphoneEarlierButton'].map(id => document.getElementById(id).getBoundingClientRect().toJSON()) }));
    assert(layout.document <= width + 1 && layout.body <= width + 1, 'Microphone controls do not overflow at ' + width + 'px.'); assert.equal(layout.tracks, 8); assert(layout.slots.every(n => n === 4)); assert.equal(layout.effects, 11); assert(layout.targets.every(box => box.width >= 35 && box.height >= 35), 'Monitoring and timing nudges have usable touch targets.');
    if (process.env.LOOM_MIC_QA_SCREENSHOTS && [390, 1440].includes(width)) {
      fs.mkdirSync(process.env.LOOM_MIC_QA_SCREENSHOTS, { recursive: true });
      await page.locator('#micInputPanel').screenshot({ path: path.join(process.env.LOOM_MIC_QA_SCREENSHOTS, 'microphone-timing-' + width + '.png') });
    }
    await page.locator('[data-slot="0"]').click();
    const chooser = await page.locator('#effectDialog').evaluate(el => ({ open: el.open, client: el.clientWidth, scroll: el.scrollWidth })); assert(chooser.open && chooser.scroll <= chooser.client + 1, 'The effect chooser fits ' + width + 'px.');
    await page.locator('[data-add-effect="broiler"]').click();
    assert.equal(await page.locator('[data-amp-preset]').count(), 13);
    const presetIds = await page.evaluate(() => window.LoomEffectsCatalog.find(e => e.id === 'broiler').presets.map(p => p.id));
    for (const id of presetIds) {
      await page.locator('[data-amp-preset="' + id + '"]').click();
      const recipe = await page.evaluate(id => ({ actual: window.LoomApp.getState().tracks[1].effects[0].params, expected: window.LoomEffectsCatalog.find(e => e.id === 'broiler').presets.find(p => p.id === id).params }), id);
      assert.deepEqual(recipe.actual, recipe.expected, 'The ' + id + ' house recipe updates every amp control.');
      assert.equal(await page.locator('[data-amp-preset="' + id + '"]').getAttribute('aria-pressed'), 'true');
    }
    await page.selectOption('#fx-cabinet', 'di'); assert(await page.locator('#fx-mic').isDisabled() && await page.locator('#fx-speakerDrive').isDisabled());
    assert.match(await page.locator('#ampCabinetHint').textContent(), /direct head output/i);
    const ampLayout = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, body: document.body.scrollWidth, editor: document.getElementById('effectEditor').scrollWidth, client: document.getElementById('effectEditor').clientWidth, saved: window.LoomSchema.serializeProject(window.LoomApp.getState()) }));
    assert(ampLayout.document <= width + 1 && ampLayout.body <= width + 1 && ampLayout.editor <= ampLayout.client + 1, 'The grouped amp editor fits ' + width + 'px.');
    const portable = await page.evaluate(serialized => { const restored = window.LoomSchema.parseProject(serialized); return { cabinet: restored.tracks[1].effects[0].params.cabinet, type: restored.tracks[1].effects[0].type, recording: restored.recording }; }, ampLayout.saved);
    assert.equal(portable.type, 'broiler'); assert.equal(portable.cabinet, 'di'); assert.equal(portable.recording.micOffsetMs, 75);
    results.push(width + 'px BROILER chooser / thirteen complete presets / DI control clarity / amp and microphone project round-trip');
    await page.locator('#panicButton').click(); await page.waitForFunction(() => !window.LoomApp.engine.getMicrophoneStatus().active);
    await page.selectOption('#recordSource', 'microphone');
    await page.locator('#microphoneMonitorButton').click(); await page.waitForFunction(() => window.LoomApp.engine.getMicrophoneStatus().enabled);
    await page.evaluate(() => window.LoomApp.loadState(window.LoomSchema.defaultState()));
    const release = await page.evaluate(() => ({ status: window.LoomApp.engine.getMicrophoneStatus(), tracks: window.qaMic.streams.flatMap(s => s.getTracks().map(t => t.readyState)) }));
    assert.equal(release.status.active, false); assert(release.tracks.every(state => state === 'ended'), 'Opening a new project releases all microphone tracks.'); assert.deepEqual(errors, []);
    results.push(width + 'px GALLEY input controls / persisted timing / explicit routing / Panic / project-load cleanup / 8 × 4 capacity');
    await page.evaluate(() => window.LoomApp.engine.dispose()); await page.close();
  }
}

(async () => {
  dspChecks();
  const server = await serve(); let browser;
  try { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] }); await engineChecks(browser, server.url, false); await engineChecks(browser, server.url, true); if (!process.env.LOOM_MIC_QA_ENGINE_ONLY) await uiChecks(browser, server.url); console.log(JSON.stringify({ passed: results.length, checks: results }, null, 2)); }
  finally { await browser?.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
