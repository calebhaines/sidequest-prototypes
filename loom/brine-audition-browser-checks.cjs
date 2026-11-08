'use strict';

// Real hosted BRINE, shared audio bridge, trusted editor gestures and parent
// Panic. Printing remains healthy when the old audition gate gets latched shut.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html = fs.readFileSync(process.env.BRINE_AUDITION_FILE || path.join(__dirname, 'index.html'));
const directory = process.env.BRINE_AUDITION_REPORT_DIR || '/tmp/galley-brine-audition-browser';
const report = { htmlSHA256: createHash('sha256').update(html).digest('hex'), passed: [], errors: [], external: [] };
fs.mkdirSync(directory, { recursive: true });
const save = () => fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let browser, server, active = 'startup';

async function hostedCheck(mode, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    const input = { id: 'brine-audition-keys', name: 'Audition regression keys', type: 'input', state: 'connected', connection: 'open', onmidimessage: null };
    window.__brineAuditionMidi = input;
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => ({ inputs: new Map([[input.id, input]]), outputs: new Map(), onstatechange: null }) });
  });
  if (mode === 'fallback') await context.addInitScript(() => Object.defineProperty(window, 'AudioWorkletNode', { value: undefined, configurable: true }));
  await context.route('**/*', route => {
    const address = route.request().url();
    if (/^(?:about:|data:|blob:)/.test(address) || address.startsWith(url.origin + '/')) return route.continue();
    report.external.push(address); return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push({ mode, message: error.message }));
  const observations = [];
  try {
    await page.goto(url.href, { waitUntil: 'load' });
    await page.waitForFunction(() => window.LoomApp && window.LoomSchema);
    await page.evaluate(async () => {
      const state = LoomSchema.defaultState();
      state.loopEnabled = false; state.master.level = 1;
      state.returns.forEach(owner => owner.effects.fill(null));
      state.tracks[0].instrument = { id: 'brine', name: 'BRINE' };
      state.tracks[0].level = 1; state.tracks[0].instrumentLive = false;
      await LoomApp.loadState(state);
    });
    async function open() {
      await page.locator('#openInstrumentButton').click();
      await page.waitForFunction(() => LoomApp.host.records.get('track-1')?.loaded);
      await page.evaluate(() => LoomApp.host.records.get('track-1').ready);
      return page.frameLocator('iframe[data-host-track="track-1"]');
    }
    let frame = await open();
    const initial = await page.evaluate(async () => {
      const app = LoomApp, child = app.host.records.get('track-1').iframe.contentWindow;
      await child.BrineApp.engine.init();
      const state = child.BrineApp.getState(); state.name = 'Audition survives the pass';
      Object.assign(state.synth, { ampMode: 'gate', chorus: 'off', envSustain: 1, volume: .5, cutoff: 12000 });
      await child.BrineApp.loadState(state);
      const parent = app.engine.context.createAnalyser(), native = child.BrineApp.engine.context.createAnalyser();
      parent.fftSize = native.fftSize = 2048;
      app.engine.node.connect(parent); child.BrineApp.engine.node.connect(native);
      window.brineAuditionQA = { parent, native, node: child.BrineApp.engine.node, state: child.BrineApp.getState() };
      brineAuditionQA.printNote = async () => {
        const result = await LoomApp.host.exportAudio('track-1', { scope: 'note', pitch: 60, durationSeconds: 1, tailSeconds: 0, includePCM: true });
        let peak = 0; for (const value of result.pcm) peak = Math.max(peak, Math.abs(value));
        const bytes = new Uint8Array(result.pcm.buffer, result.pcm.byteOffset, result.pcm.byteLength);
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
        return { bytes: result.blob.size, peak, pcmSHA256: hash };
      };
      return { parentMode: app.engine.mode, childMode: child.BrineApp.engine.mode, state: child.BrineApp.getState(), printed: await brineAuditionQA.printNote() };
    });
    assert.equal(initial.parentMode, mode); assert.equal(initial.childMode, mode);
    await frame.locator('#midiButton').click();
    await page.waitForFunction(() => typeof LoomApp.host.records.get('track-1').iframe.contentWindow.__brineAuditionMidi.onmidimessage === 'function');
    async function samples(label) {
      await page.waitForTimeout(170);
      const measured = await page.evaluate(() => {
        const peak = analyser => {
          const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
          let maximum = 0; for (const value of samples) maximum = Math.max(maximum, Math.abs(value)); return maximum;
        };
        const child = LoomApp.host.records.get('track-1').iframe.contentWindow;
        return { parent: peak(brineAuditionQA.parent), child: peak(brineAuditionQA.native), bridgeGain: child.BrineApp.engine.context.destination.gain.value,
          parentPlaying: LoomApp.engine.getMeters().playing, nodeRetained: child.BrineApp.engine.node === brineAuditionQA.node, nativeVoices: child.BrineApp.engine.getMeters().voices };
      });
      assert.equal(measured.parentPlaying, false, label + ': audition must not start the arrangement');
      observations.push({ label, ...measured }); return measured;
    }
    async function key(label, { audible = true, keyboard = false } = {}) {
      const target = frame.locator('#keyboard [data-note]').first(); await target.scrollIntoViewIfNeeded();
      if (keyboard) { await target.focus(); await page.keyboard.down('a'); }
      else { const box = await target.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); }
      try {
        const measured = await samples(label);
        assert(measured.child > .003, label + ': BRINE itself still synthesizes audio');
        assert(measured.nodeRetained, label + ': audition recovery preserves its working synth processor');
        if (audible) assert(measured.parent > .003, label + ': trusted editor input must reach GALLEY output');
        else assert(measured.parent < 1e-8, label + ': the existing smooth mixer mute still applies');
        return measured;
      } finally { if (keyboard) await page.keyboard.up('a'); else await page.mouse.up(); await page.waitForTimeout(100); }
    }
    await key('Initial trusted pointer');
    // Ordinary Stop must not invalidate the open editor's audition route.
    for (let cycle = 0; cycle < 3; cycle++) {
      await frame.locator('#playButton').click();
      const playing = await samples('Native phrase ' + cycle); assert(playing.parent > .001);
      await frame.locator('#stopButton').click();
      await key('After native Stop ' + cycle, { keyboard: cycle % 2 === 1 });
    }
    for (let cycle = 0; cycle < 3; cycle++) {
      // Use GALLEY's actual Panic handler while retaining the open editor.
      await page.evaluate(() => document.getElementById('panicButton').click()); await page.waitForTimeout(100);
      if (cycle === 0) {
        await page.evaluate(() => LoomApp.host.command('track-1', 'prepare'));
        // A synthetic note can make the child active but must not release the
        // parent Panic latch. Fresh trusted input is what restores audition.
        await page.evaluate(() => {
          const child = LoomApp.host.records.get('track-1').iframe.contentWindow;
          child.document.body.dispatchEvent(new child.PointerEvent('pointerdown', { bubbles: true }));
          child.BrineApp.engine.noteOn({ id: 'raw-engine-fixture', pitch: 60, velocity: .8, source: 'raw-engine-fixture' });
        });
        const synthetic = await samples('Synthetic input after Panic'); assert.equal(synthetic.parent, 0);
        const printed = await page.evaluate(() => brineAuditionQA.printNote());
        assert(printed.bytes > 44 && printed.peak > .003, 'The native print path remains healthy while monitoring is latched');
        assert.equal(printed.pcmSHA256, initial.printed.pcmSHA256, 'Live audition lifecycle must not alter offline printed PCM');
        observations.push({ label: 'Print while monitoring stopped', ...printed });
        await page.evaluate(() => {
          const child = LoomApp.host.records.get('track-1').iframe.contentWindow;
          child.BrineApp.engine.cancelNotes({ source: 'raw-engine-fixture', immediate: true });
        });
      }
      await key('Trusted input after parent Panic ' + cycle, { keyboard: cycle % 2 === 1 });
    }
    // A hardware MIDI note has no trusted DOM event. Its explicit BRINE note
    // intent must still restore the same parent route after Panic.
    await page.evaluate(() => document.getElementById('panicButton').click()); await page.waitForTimeout(100);
    await page.evaluate(() => {
      const child = LoomApp.host.records.get('track-1').iframe.contentWindow;
      child.__brineAuditionMidi.onmidimessage({ data: new child.Uint8Array([0x90, 60, 100]) });
    });
    const midi = await samples('MIDI note after parent Panic'); assert(midi.parent > .003 && midi.child > .003 && midi.nodeRetained);
    await page.evaluate(() => {
      const child = LoomApp.host.records.get('track-1').iframe.contentWindow;
      child.__brineAuditionMidi.onmidimessage({ data: new child.Uint8Array([0x80, 60, 0]) });
    });
    await page.evaluate(() => document.getElementById('panicButton').click()); await page.waitForTimeout(100);
    await page.evaluate(() => LoomApp.host.records.get('track-1').iframe.contentWindow.BrineApp.play());
    const phrase = await samples('Explicit phrase API after parent Panic'); assert(phrase.parent > .001 && phrase.child > .001);
    await page.evaluate(() => LoomApp.host.records.get('track-1').iframe.contentWindow.BrineApp.stop());
    // Restoring audition must not override the normal track mute/solo mixer.
    await page.evaluate(() => { const state = LoomApp.getState(); state.tracks[0].mute = true; LoomApp.engine.setState(state); });
    await key('Muted track after trusted input', { audible: false });
    await page.evaluate(() => LoomApp.engine.setState(LoomApp.getState()));
    await page.evaluate(() => document.getElementById('panicButton').click()); await page.waitForTimeout(100);
    const hiddenAllowed = await page.evaluate(() => {
      const record = LoomApp.host.records.get('track-1'); record.iframe.hidden = true;
      try { return record.iframe.contentWindow.MusicLabHost.requestAudition(); } finally { record.iframe.hidden = false; }
    });
    assert.equal(hiddenAllowed, false, 'A hidden editor cannot reclaim the audition route');
    await page.locator('#closeInstrument').click();
    const closedAllowed = await page.evaluate(() => LoomApp.host.records.get('track-1').iframe.contentWindow.MusicLabHost.requestAudition());
    assert.equal(closedAllowed, false, 'A closed editor cannot reclaim the audition route');
    await page.waitForTimeout(100);
    frame = await open(); await key('Reopened retained editor');
    const final = await page.evaluate(() => {
      const child = LoomApp.host.records.get('track-1').iframe.contentWindow;
      return { state: child.BrineApp.getState(), sameNode: child.BrineApp.engine.node === brineAuditionQA.node };
    });
    assert.deepEqual(final.state, initial.state); assert(final.sameNode);
    await page.locator('#closeInstrument').click();
    const disabled = await page.evaluate(async () => {
      const request = LoomApp.host.records.get('track-1').iframe.contentWindow.MusicLabHost.requestAudition;
      await LoomApp.setTrackDisabled('track-1', true);
      return { allowed: request(), loaded: LoomApp.host.records.has('track-1'), disabled: LoomApp.getState().tracks[0].disabled };
    });
    assert.equal(disabled.allowed, false); assert.equal(disabled.loaded, false); assert.equal(disabled.disabled, true);
    return { mode, observations, statePreserved: true, processorRetained: true, printedPCMExact: true,
      denied: { hidden: !hiddenAllowed, closed: !closedAllowed, disabledAndUnloaded: !disabled.allowed }, cycles: { phrase: 3, panic: 3, midi: 1, phraseAPI: 1 } };
  } finally { await context.close(); }
}

(async () => {
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    response.setHeader('Content-Type', 'text/html');
    if (pathname === '/loom/index.html') response.end(html);
    else if (pathname === '/index.html') response.end('<!doctype html><title>Kitchen discovery fixture</title>');
    else { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = new URL('http://127.0.0.1:' + server.address().port + '/loom/index.html');
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  for (const mode of (process.env.BRINE_AUDITION_MODES || 'worklet,fallback').split(',')) {
    active = mode; const evidence = await hostedCheck(mode, url); report.passed.push({ name: mode + ': trusted BRINE editor audition recovers after repeated Panic', evidence }); save();
    console.log('PASS', mode, JSON.stringify({ phraseCycles: evidence.cycles.phrase, panicCycles: evidence.cycles.panic, statePreserved: evidence.statePreserved, processorRetained: evidence.processorRetained }));
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []); save();
  console.log('BRINE audition browser:', report.passed.length, 'groups passed.', directory);
})().catch(error => { report.failure = { check: active, message: error.stack || String(error) }; save(); console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close(); await new Promise(resolve => server?.close(resolve));
});
