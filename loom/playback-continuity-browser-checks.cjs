'use strict';
/* Run only against a freshly built GALLEY, with exclusive Chromium/CPU access.
 * GALLEY_CONTINUITY_BROWSER_DIR selects the evidence directory.
 * GALLEY_CONTINUITY_PHASES=worklet,live,fallback,exports,freeze selects groups.
 * This checks the digital graph, not an operating-system audio sink/loopback. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { createHash } = require('node:crypto');
const { install, run: nativeChecks } = require('./playback-continuity-checks.cjs');
const nativeOnly = process.argv.includes('--native-only');
const { chromium } = nativeOnly ? {} : require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const directory = process.env.GALLEY_CONTINUITY_BROWSER_DIR || '/tmp/galley-playback-continuity-browser';
const report = { passed: [], errors: [], external: [], scope: 'Digital sample continuity and callback clocks; no hardware audio-sink claim.' };
fs.mkdirSync(directory, { recursive: true });
let browser, server, active = 'startup';
function save() { fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
async function check(name, run) {
  active = name; const started = Date.now(), evidence = await run();
  report.passed.push({ name, milliseconds: Date.now() - started, evidence }); save();
  console.log('PASS', name, JSON.stringify(evidence));
}
async function serve() {
  const html = fs.readFileSync(process.env.GALLEY_CONTINUITY_HTML || path.join(__dirname, 'index.html'), 'utf8');
  report.htmlSHA256 = createHash('sha256').update(html).digest('hex');
  const engine = fs.readFileSync(path.join(__dirname, 'audio-engine.js'), 'utf8');
  report.engineSHA256 = createHash('sha256').update(engine).digest('hex');
  const embedded = engine.replace(/<\/script/gi, '<\\/script').split('\n').map(line => line.trimEnd()).join('\n').trim();
  assert(html.includes(embedded), 'Built GALLEY must contain the exact current engine; rebuild before running.');
  server = http.createServer((request, response) => {
    if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + server.address().port + '/loom/';
}
async function pageFor(url, fallback = false) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const origin = new URL(url).origin;
  await context.route('**/*', route => {
    const request = route.request().url();
    if (/^(blob:|data:|about:)/.test(request) || new URL(request).origin === origin) return route.continue();
    report.external.push(request); return route.abort();
  });
  context.on('page', page => page.on('pageerror', error => report.errors.push({ check: active, message: error.message, stack: error.stack })));
  if (fallback) await context.addInitScript(() => Object.defineProperty(window, 'AudioWorkletNode', { value: undefined, configurable: true }));
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.LoomApp && window.createLoomEngineDSP && window.LoomSchema);
  await page.evaluate('(' + install.toString() + ')(window)');
  return { context, page };
}
async function close({ context, page }) {
  await page.evaluate(() => LoomApp.engine.dispose()).catch(() => {}); await context.close();
}
function assertPair(error, tolerance = 0) {
  assert(error.left.maximum <= tolerance && error.right.maximum <= tolerance, JSON.stringify(error));
}
async function workletChecks(page) {
  await check('Built serialized Worklet isolates selected stereo regions and preserves every quantum/sample clock', async () => {
    const rows = await page.evaluate(async () => {
      const q = PlaybackContinuityQA, nativeURL = URL.createObjectURL, NativeNode = AudioWorkletNode;
      let blob, processorOptions;
      URL.createObjectURL = value => { if (value.type?.includes('javascript')) blob = value; return nativeURL.call(URL, value); };
      window.AudioWorkletNode = class extends NativeNode { constructor(...args) { super(...args); processorOptions = args[2].processorOptions; } };
      try {
        await LoomApp.loadState(q.fixture());
        await LoomApp.engine.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'live' });
        await LoomApp.engine.init(); await LoomApp.engine.context.suspend();
      } finally { URL.createObjectURL = nativeURL; window.AudioWorkletNode = NativeNode; }
      if (!blob || LoomApp.engine.mode !== 'worklet') throw Error('Production Worklet did not initialize.');
      const source = await blob.text();
      window.continuityWorkletSource = source; window.continuityProcessorOptions = processorOptions;
      await LoomApp.engine.dispose();
      const extension = `\nregisterProcessor('continuity-offline',class extends LoomProcessor {
        constructor(o) { super(o);this.core=new DSP.Core(o.processorOptions.state,o.processorOptions.qaAssets,sampleRate,{linear:!o.processorOptions.state.loopEnabled,includeMetronome:false});this.core.start(0);this.qaFrames=o.processorOptions.qaFrames;this.qaBefore=-1;this.qaEnd=-1;this.qaBlocks=0;this.qaGaps=0;this.qaClockErrors=0;this.qaDone=false; }
        process(i,o,p) { const n=o[0][0].length,before=this.core.sampleClock;if(this.qaEnd>=0&&currentFrame!==this.qaEnd)this.qaGaps++;if(before!==this.qaBlocks*n)this.qaClockErrors++;const result=super.process(i,o,p);if(this.core.sampleClock-before!==n)this.qaClockErrors++;this.qaEnd=currentFrame+n;this.qaBlocks++;if(!this.qaDone&&this.core.sampleClock>=this.qaFrames){this.qaDone=true;this.port.postMessage({type:'qa-summary',blocks:this.qaBlocks,frames:this.core.sampleClock,gaps:this.qaGaps,clockErrors:this.qaClockErrors,firstFrame:this.qaEnd-this.qaBlocks*n,lastEnd:this.qaEnd});}return result; }
      });`;
      const frames = 24576, rows = [];
      for (const item of q.cases) {
        const pair = [];
        for (const sentinel of [0, 1]) {
          const state = q.fixture(item, sentinel), reference = q.render(state, { frames });
          const offline = new OfflineAudioContext(2, frames, 48000);
          const url = nativeURL.call(URL, new Blob([source, extension], { type: 'text/javascript' }));
          try { await offline.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
          const node = new NativeNode(offline, 'continuity-offline', { numberOfInputs: 11, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', processorOptions: { ...processorOptions, state, qaAssets: LoomSchema.decodeAssets(state.assets), qaFrames: frames } });
          let resolve; const done = new Promise(r => resolve = r);
          node.port.onmessage = event => { if (event.data.type === 'qa-summary') resolve(event.data); };
          node.connect(offline.destination);
          const rendered = await offline.startRendering(), audio = { left: rendered.getChannelData(0).slice(), right: rendered.getChannelData(1).slice() };
          let timer; const clocks = await Promise.race([done, new Promise((_, reject) => timer = setTimeout(() => reject(Error('Worklet final clock report missing.')), 6000))]).finally(() => clearTimeout(timer));
          pair.push({ audio, referenceError: q.pairDifference(audio, reference), clocks });
          node.disconnect(); node.port.close();
        }
        rows.push({ name: item.name, sourceRate: item.sourceRate, rate: item.rate, outsideError: q.pairDifference(pair[0].audio, pair[1].audio), referenceErrors: pair.map(p => p.referenceError), clocks: pair.map(p => p.clocks), plateau: !item.shape && !item.arrangement ? q.plateau(pair[0].audio) : null });
      }
      return rows;
    });
    for (const row of rows) {
      assertPair(row.outsideError); row.referenceErrors.forEach(error => assertPair(error));
      for (const clock of row.clocks) { assert.equal(clock.frames, 24576); assert.equal(clock.blocks, 192); assert.equal(clock.gaps, 0); assert.equal(clock.clockErrors, 0); assert.equal(clock.firstFrame, 0); assert.equal(clock.lastEnd, 24576); }
      for (const channel of row.plateau || []) { assert(channel.range < 2e-6, JSON.stringify(channel)); assert.equal(channel.zeros, 0); }
    }
    return { cases: rows };
  });
}
async function liveCheck(page) {
  await check('Actual live Worklet keeps digital PCM and callback timestamps continuous across a180ms UI stall', async () => {
    const value = await page.evaluate(async () => {
      const q = PlaybackContinuityQA, frames = 32768, state = q.fixture({ sourceRate: 44100, rate: 1.7 });
      const reference = q.render(state, { frames });
      const context = new AudioContext({ sampleRate: 48000, latencyHint: .001 }); await context.suspend();
      const extension = `\nregisterProcessor('continuity-live',class extends LoomProcessor {
        constructor(o){super(o);this.core=new DSP.Core(o.processorOptions.state,o.processorOptions.qaAssets,sampleRate,{linear:true,includeMetronome:false});this.core.start(0);this.qaAt=0;this.qaEnd=-1;this.qaGaps=0;this.qaClockErrors=0;this.qaL=new Float32Array(o.processorOptions.qaFrames);this.qaR=new Float32Array(o.processorOptions.qaFrames);}
        process(i,o,p){const n=o[0][0].length,before=this.core.sampleClock;if(this.qaEnd>=0&&currentFrame!==this.qaEnd)this.qaGaps++;if(before!==this.qaAt)this.qaClockErrors++;super.process(i,o,p);if(this.core.sampleClock-before!==n)this.qaClockErrors++;this.qaEnd=currentFrame+n;const count=Math.min(n,this.qaL.length-this.qaAt);this.qaL.set(o[0][0].subarray(0,count),this.qaAt);this.qaR.set((o[0][1]||o[0][0]).subarray(0,count),this.qaAt);this.qaAt+=count;if(this.qaAt>=this.qaL.length){this.port.postMessage({type:'qa-live',left:this.qaL,right:this.qaR,frames:this.core.sampleClock,gaps:this.qaGaps,clockErrors:this.qaClockErrors},[this.qaL.buffer,this.qaR.buffer]);return false;}return true;}
      });`;
      const url = URL.createObjectURL(new Blob([window.continuityWorkletSource, extension], { type: 'text/javascript' }));
      try { await context.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
      const node = new AudioWorkletNode(context, 'continuity-live', { numberOfInputs: 11, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', processorOptions: { ...window.continuityProcessorOptions, state, qaAssets: LoomSchema.decodeAssets(state.assets), qaFrames: frames } });
      let finish; const done = new Promise(resolve => finish = resolve);
      node.port.onmessage = event => { if (event.data.type === 'qa-live') finish(event.data); };
      node.connect(context.destination); await context.resume();
      await new Promise(resolve => setTimeout(resolve, 60));
      const started = performance.now(); while (performance.now() - started < 180) { /* deliberate UI-thread starvation */ }
      const stallMs = performance.now() - started;
      let timer;
      try {
        const actual = await Promise.race([done, new Promise((_, reject) => timer = setTimeout(() => reject(Error('Live audio callback stopped.')), 8000))]);
        return { frames: actual.frames, gaps: actual.gaps, clockErrors: actual.clockErrors, stallMs, error: q.pairDifference(actual, reference), plateau: q.plateau(actual) };
      } finally { clearTimeout(timer); node.disconnect(); node.port.close(); await context.close(); }
    });
    assert.equal(value.frames, 32768); assert.equal(value.gaps, 0); assert.equal(value.clockErrors, 0); assert(value.stallMs >= 180); assertPair(value.error);
    for (const channel of value.plateau) { assert(channel.range < 2e-6); assert.equal(channel.zeros, 0); }
    return value;
  });
}
async function fallbackChecks(url) {
  const holder = await pageFor(url, true);
  try {
    await check('Actual fallback callback isolates selected regions with unbroken stereo/sample clock', async () => {
      const rows = await holder.page.evaluate(async () => {
        const q = PlaybackContinuityQA, Native = window.AudioContext, rows = [];
        for (const item of q.cases) {
          const pair = [];
          for (const sentinel of [0, 1]) {
            const state = q.fixture(item, sentinel), context = new Native({ sampleRate: 48000 }); await context.suspend();
            const nativeResume = context.resume; context.resume = async () => {}; window.AudioContext = function () { return context; };
            const engine = new LoomAudio(state); engine.setAssets(LoomSchema.decodeAssets(state.assets));
            try {
              await engine.init(); if (engine.mode !== 'fallback') throw Error('Actual fallback was not selected.');
              engine.core.start(0);
              const block = engine.node.bufferSize, frames = block * 64, left = new Float32Array(frames), right = new Float32Array(frames), zero = new Float32Array(block);
              let clockErrors = 0;
              for (let at = 0; at < frames; at += block) {
                if (engine.core.sampleClock !== at) clockErrors++;
                engine.node.onaudioprocess({ playbackTime: at / 48000, inputBuffer: { length: block, getChannelData: () => zero }, outputBuffer: { length: block, getChannelData: channel => (channel ? right : left).subarray(at, at + block) } });
                if (engine.core.sampleClock !== at + block) clockErrors++;
              }
              const audio = { left, right }, reference = q.render(state, { frames, sizes: [block], linear: false });
              pair.push({ audio, block, frames, clockErrors, referenceError: q.pairDifference(audio, reference) });
            } finally { window.AudioContext = Native; context.resume = nativeResume; await engine.dispose(); }
          }
          rows.push({ name: item.name, block: pair[0].block, frames: pair[0].frames, outsideError: q.pairDifference(pair[0].audio, pair[1].audio), referenceErrors: pair.map(p => p.referenceError), clockErrors: pair.map(p => p.clockErrors) });
        }
        return rows;
      });
      for (const row of rows) { assertPair(row.outsideError); row.referenceErrors.forEach(error => assertPair(error)); assert.deepEqual(row.clockErrors, [0, 0]); assert(row.block >= 256); }
      return { cases: rows };
    });
  } finally { await close(holder); }
}
async function exportChecks(page) {
  await check('Real stereo mix and track-stem WAV export ignore outside sentinels and match an independent Core reference', async () => {
    const rows = await page.evaluate(async () => {
      const q = PlaybackContinuityQA, rows = [];
      for (const item of q.cases.filter(item => !item.arrangement)) for (const stem of [false, true]) {
        const pair = [];
        for (const sentinel of [0, 1]) {
          const state = q.fixture(item, sentinel), frames = 24000, assets = LoomSchema.decodeAssets(state.assets);
          const blob = await LoomApp.engine.renderWav(state, assets, { startBeat: 0, endBeat: 2, tailSeconds: 0, ...(stem ? { trackId: 'track-1' } : {}) });
          const buffer = await blob.arrayBuffer(), view = new DataView(buffer), reference = q.render(state, { frames, sizes: [2048], ...(stem ? { trackId: 'track-1' } : {}) });
          let integerError = 0;
          for (let i = 0; i < frames; i++) for (let channel = 0; channel < 2; channel++) {
            const value = Math.max(-1, Math.min(1, (channel ? reference.right : reference.left)[i]));
            integerError = Math.max(integerError, Math.abs(view.getInt16(44 + i * 4 + channel * 2, true) - Math.round(value * (value < 0 ? 32768 : 32767))));
          }
          pair.push({ bytes: new Uint8Array(buffer), frames: (buffer.byteLength - 44) / 4, sampleRate: view.getUint32(24, true), integerError });
        }
        let byteDifferences = 0; for (let i = 0; i < pair[0].bytes.length; i++) if (pair[0].bytes[i] !== pair[1].bytes[i]) byteDifferences++;
        rows.push({ name: item.name, stem, byteDifferences, renders: pair.map(({ frames, sampleRate, integerError }) => ({ frames, sampleRate, integerError })) });
      }
      return rows;
    });
    for (const row of rows) { assert.equal(row.byteDifferences, 0); for (const render of row.renders) { assert.equal(render.frames, 24000); assert.equal(render.sampleRate, 48000); assert(render.integerError <= 1); } }
    return { cases: rows };
  });
}
async function freezeChecks(page) {
  await check('Actual reversible Freeze retains source and arrangement loops without unheard-data leakage', async () => {
    const rows = await page.evaluate(async () => {
      const q = PlaybackContinuityQA, rows = [];
      await LoomApp.engine.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'live' }); await LoomApp.engine.init();
      for (const scenario of [
        { name: '44.1k-fractional-source-loop', sourceRate: 44100, rate: 1.7, sourceOffset: 317.5 / 44100 },
        q.cases.find(item => item.arrangementFuture)
      ]) {
        const pair = [];
        for (const sentinel of [0, 1]) {
          await LoomApp.loadState(q.fixture(scenario, sentinel));
          const original = LoomApp.getState(), reference = q.render(original, { frames: 48000 });
          await LoomApp.freezeTrack('track-1');
          const frozen = LoomApp.getState(), audio = q.render(frozen, { frames: 48000 });
          if (!frozen.tracks[0].freeze) throw Error('Actual app Freeze did not create a cached track.');
          let beforeEdgeCache = null;
          if (scenario.arrangementFuture) {
            const chunk = frozen.tracks[0].freeze.chunks.find(chunk => chunk.startFrame === 0);
            const cache = LoomSchema.decodeAssets(frozen.assets, frozen.freezeAssets)[chunk.main];
            beforeEdgeCache = [cache.left, cache.right].map(channel => new Uint8Array(channel.buffer, channel.byteOffset, 3000 * 4).slice());
          }
          await LoomApp.unfreezeTrack('track-1');
          const restored = LoomApp.getState();
          const firstPassFrames = scenario.arrangementFuture ? 3000 : 48000;
          const firstPassError = q.pairDifference(
            { left: audio.left.subarray(0, firstPassFrames), right: audio.right.subarray(0, firstPassFrames) },
            { left: reference.left.subarray(0, firstPassFrames), right: reference.right.subarray(0, firstPassFrames) });
          const repeatedLoopContinuity = scenario.arrangementFuture ? [audio.left, audio.right].map(channel => {
            let maximumStep = 0, peak = 0, zeros = 0;
            for (let i = 3000; i < channel.length; i++) {
              if (!Number.isFinite(channel[i])) throw Error('Nonfinite frozen loop.');
              maximumStep = Math.max(maximumStep, Math.abs(channel[i] - channel[i - 1]));
              peak = Math.max(peak, Math.abs(channel[i])); if (channel[i] === 0) zeros++;
            }
            return { maximumStep, peak, zeros, frames: channel.length - 3000 };
          }) : null;
          pair.push({ audio, live: reference, beforeEdgeCache, firstPassError, repeatedLoopContinuity, referenceError: q.pairDifference(audio, reference), clipsRestored: JSON.stringify(restored.tracks[0].clips) === JSON.stringify(original.tracks[0].clips), effectsRestored: JSON.stringify(restored.tracks[0].effects) === JSON.stringify(original.tracks[0].effects) });
        }
        let beforeEdgeByteDifferences = null, beforeEdgeOutputError = null;
        if (scenario.arrangementFuture) {
          beforeEdgeByteDifferences = 0;
          for (let channel = 0; channel < 2; channel++) for (let i = 0; i < pair[0].beforeEdgeCache[channel].length; i++) {
            if (pair[0].beforeEdgeCache[channel][i] !== pair[1].beforeEdgeCache[channel][i]) beforeEdgeByteDifferences++;
          }
          beforeEdgeOutputError = q.pairDifference(
            { left: pair[0].audio.left.subarray(0, 3000), right: pair[0].audio.right.subarray(0, 3000) },
            { left: pair[1].audio.left.subarray(0, 3000), right: pair[1].audio.right.subarray(0, 3000) });
        }
        rows.push({ name: scenario.name, arrangement: !!scenario.arrangementFuture,
          comparisonScope: scenario.arrangementFuture ? 'Finite Freeze replays baked startup dynamics. First-pass equality and later seam continuity are asserted; later persistent live-DSP versus cache differences are informational.' : 'Full linear live-versus-Freeze equality.',
          outsideError: q.pairDifference(pair[0].audio, pair[1].audio), liveOutsideError: q.pairDifference(pair[0].live, pair[1].live), beforeEdgeByteDifferences, beforeEdgeOutputError,
          firstPassErrors: pair.map(p => p.firstPassError), repeatedLoopContinuity: pair.map(p => p.repeatedLoopContinuity), referenceErrors: pair.map(p => p.referenceError), clipsRestored: pair.every(p => p.clipsRestored), effectsRestored: pair.every(p => p.effectsRestored) });
      }
      return rows;
    });
    report.freezeEvidence = rows; save();
    for (const row of rows) {
      // A cache stores the slewed gain ramp inFloat32. Its continuous next
      // sample and a linear extrapolation of prior rounded samples can differ
      // by oneULP. Keep this explicit bound at1e-7 (−140dBFS); ordinary source,
      // Worklet/fallback/WAV and pre-edge cache invariance stay bitexact.
      assertPair(row.outsideError, 1e-7); assertPair(row.liveOutsideError);
      if (row.beforeEdgeOutputError) { assertPair(row.beforeEdgeOutputError); assert.equal(row.beforeEdgeByteDifferences, 0); }
      row.firstPassErrors.forEach(error => assertPair(error));
      if (!row.arrangement) row.referenceErrors.forEach(error => assertPair(error, 2e-6));
      // Printed startup gain/FX histories repeat with the finite cache; a live
      // rack retains its state on later passes. Comparing those histories for
      // exact PCM would assert a stronger contract than finite Freeze offers.
      // This constant-input fixture must still have no missing samples, no
      // overshoot beyond its .25 peak, and no abrupt full-scale seam jumps.
      for (const continuity of row.repeatedLoopContinuity) for (const channel of continuity || []) {
        assert(channel.maximumStep < .01, JSON.stringify(channel)); assert(channel.peak < .26); assert.equal(channel.zeros, 0);
      }
      assert(row.clipsRestored && row.effectsRestored);
    }
    return { cases: rows };
  });
}
if (nativeOnly) { try { nativeChecks(); } catch (error) { console.error(error); process.exitCode = 1; } }
else (async () => {
  let holder;
  try {
    const url = await serve();
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    const phases = (process.env.GALLEY_CONTINUITY_PHASES || 'worklet,live,fallback,exports,freeze').split(',');
    holder = await pageFor(url);
    // Live uses the actual serialized source captured by the Worklet phase.
    if (phases.includes('worklet') || phases.includes('live')) await workletChecks(holder.page);
    if (phases.includes('live')) await liveCheck(holder.page);
    if (phases.includes('fallback')) await fallbackChecks(url);
    if (phases.includes('exports')) await exportChecks(holder.page);
    if (phases.includes('freeze')) await freezeChecks(holder.page);
    assert.deepEqual(report.errors, [], 'No hidden page errors'); assert.deepEqual(report.external, [], 'No external requests');
    console.log('Playback continuity browser:', report.passed.length, 'groups passed.', directory);
  } catch (error) { report.failure = error.stack || String(error); console.error(error); process.exitCode = 1; }
  finally {
    if (holder) await close(holder).catch(() => {});
    await browser?.close(); report.chromiumClosed = true;
    if (server) await new Promise(resolve => server.close(resolve)); save();
  }
})();
