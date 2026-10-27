/* Render CLATTER's real native bus around cancellation; no substitute DSP. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('about:blank');
    for (const file of ['synth-schema.js', 'audio-engine.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, file), 'utf8') });
    const result = await page.evaluate(async () => {
      async function render(mode, fallback = false) {
        const context = new OfflineAudioContext(2, 19200, 48000), originalContext = window.AudioContext, resume = context.resume.bind(context);
        // Prepare the maintained engine with a real OfflineAudioContext. During
        // init only, no-op resume avoids resuming an offline render not started yet.
        window.AudioContext = function () { return context; }; context.resume = async () => {};
        const engine = new TineEngine();
        try { await engine.init(); } finally { window.AudioContext = originalContext; context.resume = resume; }
        const short = mode.startsWith('natural');
        const track = TineModel.normalizeTrack(Object.assign(TineModel.defaults('string'), { pitchHz: 110, decay: short ? .04 : 2, damping: 0, variation: 0, noise: 0, mallet: 1, direct: 0, level: .8 }));
        const voice = engine.scheduleNativeNote(track, mode === 'future-silent' ? .125 : .01, { velocity: .8, source: 'cancellation-fixture' });
        // Isolate the actual bus automation from compressor lookahead and master
        // filtering. The modal filters, exciter and public cancel API are unchanged.
        engine.graph.ceiling.disconnect(); voice.bus.disconnect(); voice.bus.connect(context.destination);
        if (fallback) voice.bus.gain.cancelAndHoldAtTime = undefined;
        const cancel = when => engine.cancelNativeNotes({ source: 'cancellation-fixture', when });
        let repeatedAt = null, operation = null;
        if (mode === 'once' || mode === 'twice') cancel(.12);
        if (mode === 'future-silent') cancel(.12);
        if (mode === 'twice') operation = context.suspend(.124).then(() => { repeatedAt = context.currentTime; cancel(context.currentTime); return context.resume(); });
        if (mode === 'future-then-earlier') { cancel(.25); cancel(.15); }
        if (mode === 'earlier-only') cancel(.15);
        if (mode === 'natural-cancel') cancel(voice.stopTime - .005);
        const rendered = await context.startRendering(); if (operation) await operation;
        return { pcm: Array.from(rendered.getChannelData(0)), repeatedAt };
      }
      const difference = (a, b) => { let peak = 0, at = 0; for (let i = 0; i < a.length; i++) { const value = Math.abs(a[i] - b[i]); if (value > peak) { peak = value; at = i; } } return { peak, frame: at }; };
      const reference = await render('reference'), once = await render('once'), twice = await render('twice');
      const natural = await render('natural-reference'), naturalCancel = await render('natural-cancel'), naturalFallback = await render('natural-cancel', true);
      const future = await render('future-then-earlier'), earlier = await render('earlier-only');
      const onceFallback = await render('once', true), twiceFallback = await render('twice', true);
      const futureSilent = await render('future-silent'), futureSilentFallback = await render('future-silent', true);
      let before = 0, after = 0; const repeatedFrame = Math.round(twice.repeatedAt * 48000);
      for (let i = repeatedFrame - 128; i < repeatedFrame + 256; i++) { if (i < 1) continue; before = Math.max(before, Math.abs(once.pcm[i] - once.pcm[i - 1])); after = Math.max(after, Math.abs(twice.pcm[i] - twice.pcm[i - 1])); }
      return {
        repeated: difference(once.pcm, twice.pcm), repeatedFallback: difference(onceFallback.pcm, twiceFallback.pcm),
        natural: difference(natural.pcm, naturalCancel.pcm), naturalFallback: difference(natural.pcm, naturalFallback.pcm),
        earlier: difference(future.pcm, earlier.pcm), repeatedFrame, onceJump: before, repeatedJump: after,
        beforeCancellation: difference(reference.pcm.slice(0, 5760), once.pcm.slice(0, 5760)),
        futurePeak: Math.max(...futureSilent.pcm.map(Math.abs), ...futureSilentFallback.pcm.map(Math.abs)),
        peak: Math.max(...once.pcm.map(Math.abs))
      };
    });
    assert(result.peak > .02, 'The real resonator was sounding during cancellation');
    assert(result.repeated.peak < 1e-7, 'Repeated cancellation must not restore gain: ' + JSON.stringify(result));
    assert(result.repeatedFallback.peak < 1e-7, 'The fallback must not restore gain: ' + JSON.stringify(result));
    assert(result.natural.peak < 1e-7, 'Cancel preserves an already-running natural end fade: ' + JSON.stringify(result));
    assert(result.naturalFallback.peak < 1e-7, 'Fallback preserves the natural envelope: ' + JSON.stringify(result));
    assert(result.earlier.peak < 1e-7, 'A new earlier cancellation can supersede a scheduled future cancellation');
    assert(result.beforeCancellation.peak < 1e-7, 'The first fade starts at its requested time');
    assert.equal(result.futurePeak, 0, 'A canceled future voice must not begin inside the fade window');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: ['Repeated cancellation matches one cancellation within native float precision', 'Natural 20 ms tail fades retain their current level and original endpoint', 'Native cancel-and-hold and analytic fallback agree', 'Earlier cancellation supersedes a scheduled future fade', 'First cancellation starts at its requested time; canceled future notes stay silent'], measurements: result }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
