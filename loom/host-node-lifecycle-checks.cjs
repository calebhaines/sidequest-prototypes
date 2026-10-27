'use strict';

// Exercise native Web Audio nodes through the real hosted-instrument bridge.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const html = '<!doctype html><body><script src="/loom/host-bridge.js"></script><script src="/loom/instrument-host.js"></script>';

(async () => {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
    let file = path.resolve(root, '.' + pathname);
    if (pathname.startsWith('/loom/')) file = path.resolve(__dirname, '.' + pathname.slice(5));
    if (pathname === '/tine/index.html' && !fs.existsSync(file)) file = path.join(__dirname, 'instruments', 'tine.html');
    if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
    fs.readFile(file, (error, bytes) => {
      if (error) { response.writeHead(404); response.end(); return; }
      response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : 'text/html'); response.end(bytes);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/');
    const result = await page.evaluate(async () => {
      const raw = new AudioContext({ sampleRate: 48000 }); await raw.resume();
      const input = raw.createGain(); input.gain.value = 0; input.connect(raw.destination);
      const host = new LoomInstrumentHost({ context: raw, getTrackInput: () => input, baseURL: location.origin + '/' });
      const frame = document.createElement('iframe'); document.body.append(frame);
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      try {
        await host.load('nodes', { id: 'node-fixture', html: '<!doctype html><title>Node lifecycle</title>' }, frame);
        const child = frame.contentWindow, context = new child.AudioContext();
        const gain = context.createGain(), constructorGain = new child.GainNode(context);
        gain.connect(context.destination); constructorGain.connect(context.destination);
        const connected = context._nodes.size;
        gain.disconnect(); constructorGain.disconnect(); const disconnected = context._nodes.size;
        gain.connect(context.destination); constructorGain.connect(context.destination); const reconnected = context._nodes.size;
        const source = context.createConstantSource(); source.connect(gain); source.start(); source.stop(raw.currentTime + .025);
        await wait(120); const afterEnded = context._nodes.size;
        // A disconnected running source still needs to be stopped on disposal.
        const oscillator = new child.OscillatorNode(context); let endedOnClose = false;
        oscillator.addEventListener('ended', () => { endedOnClose = true; }); oscillator.start(); oscillator.disconnect();
        await context.close(); await wait(100);
        const generic = { connected, disconnected, reconnected, afterEnded, endedOnClose, afterClose: context._nodes.size, parentRunning: raw.state === 'running' };
        host.unload('nodes');

        await host.load('clatter', { id: 'tine' }, frame); await host.command('clatter', 'prepare');
        const app = frame.contentWindow.TineApp, engine = app.engine, baseline = engine.context._nodes.size, batches = [];
        const track = app.getState().tracks[0];
        Object.assign(track, { decay: .04, noise: 0, mallet: 1, variation: 0, rebound: 0, strikeTime: .001, level: .3 });
        for (let batch = 0; batch < 3; batch++) {
          const start = raw.currentTime + .02;
          for (let i = 0; i < 12; i++) engine.scheduleNativeNote(track, start + i * .008, { velocity: .5, source: 'lifecycle' });
          const deadline = performance.now() + 3500;
          while (engine.environment.voices.size && performance.now() < deadline) await wait(20);
          batches.push({ voices: engine.environment.voices.size, nodes: engine.context._nodes.size });
        }
        return { generic, baseline, batches };
      } finally { host.dispose(); frame.remove(); input.disconnect(); await raw.close(); }
    });
    assert.deepEqual(errors, [], 'The real hosted nodes should not emit browser errors');
    assert.equal(result.generic.disconnected, result.generic.connected - 2, 'Disconnected factory and constructor nodes should be released');
    assert.equal(result.generic.reconnected, result.generic.connected, 'Reconnected nodes must be tracked again for disposal');
    assert.equal(result.generic.afterEnded, result.generic.connected, 'Ended sources should not remain strongly retained');
    assert(result.generic.endedOnClose && result.generic.parentRunning, 'Closing a facade must stop its own sources while preserving shared audio');
    assert.equal(result.generic.afterClose, 0, 'Closed facades must release their node registry');
    for (const batch of result.batches) {
      assert.equal(batch.voices, 0, 'CLATTER voices should finish their natural cleanup');
      assert.equal(batch.nodes, result.baseline, 'Completed CLATTER strikes must not accumulate retained audio nodes');
    }
    console.log('PASS hosted native node release, reconnect, ended-source and isolated disposal lifecycle');
    console.log('PASS three batches of real CLATTER strikes return to ' + result.baseline + ' persistent graph nodes');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
